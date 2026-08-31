+++
title = "04 — 流式 Markdown — 增量调和"
description = "为何任何前缀都可能是不完整语法、已提交前缀词法器、worker 增量协议、token→实体调和与就地修改器、O(C·N²) 与 wrapper-instanceof 陷阱，以及安全添加新扩展的方式。"
weight = 24
+++

# 04 — 流式 Markdown — 增量调和

LLM 流是**仅追加**且**按 token 粒度**（每块约 4 字符）。VectoJS 必须在每个块后展示可读文档——直到 `close()` 前不留空白。显而易见的策略——每次重词法整个累积源码并重建实体树——按块为 `O(document)`，因此整流为 `O(N²)`。本章是使其变为 `O(不稳定尾部)` 的机制，以及使两半悄然失效的陷阱。

## 为何任何前缀都是不完整语法

`marked` 是**一次性**词法器。它假设整份源码已存在。任何终止符尚未到达的 Markdown 构造都会在它到达后改变前缀的含义：

| 屏幕上前缀                    | 现在看起来                                          | 下一块可使它变为                                                                                                     |
| ----------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `## Heading` 无尾随 `\n`      | `heading(depth:2)`                                  | 若前导 `#` 仍在途中则为 `heading(depth:1)`（`#` → `##`）——深度直到行结束才稳定                                       |
| `**bold`                      | `text("**bold")` + 字面 `**`                        | 一旦闭合 `**` 到达则为 `strong("bold")`                                                                              |
| `[label](https://ex`          | `text("[label](https://ex")` + 自动链接裸 URL       | `link(label → https://example.com)`——URL 甚至还不是完整 href                                                         |
| ` ```js\nconst a=1 `          | `code(lang:js, text:"const a=1")` 带未闭合围栏      | 仍为 `code`——但围栏也可能变为 ` ```math ` 然后排版为展示数学                                                         |
| `\| a \| b \|\n\| --- \| ---` | `table(header:[a,b], rows:[])`——分隔行，零主体行    | `table(rows:[[…]])`——`marked` 将部分行物化为**空单元**的完整行然后逐个填充                                           |
| `$$\nx`                       | `paragraph("$$\\nx")`（扩展裁剪 marked 的段落输入） | 一旦 `$$` 闭合则为 `blockMath("x")`——外加 marked 的 `start()` 裁剪可**retroactively 合并**先前两个 `paragraph` token |

若无流式感知层，这些翻转的每一个都将是对已渲染实体的拆解。该层有两半——词法与调和——缺陷活在它们的接缝处。

## 架构 — 词法 · 传输 · 调和

```text
chunk ──► consumeFrontMatter ──► dispatchAppend ──► MarkdownWorker (off-thread)
                │                        │                    │
                │ rawMarkdown            │ postMessage         │ incrementalLex
                │ (body only)            │ {append,expectedLen}│ lexAppend / lexFull
                │                        │  or {text,oldRaws}  │ findStableCut + verify
                │                        │                    │
                ◄────── matchLen + tail ─┘                    │
                              │                               │
                     updateTokens(matchLen, tail)  ◄──────────┘
                              │
              ┌───────────────┼───────────────────┐
              │ prefix [0,matchLen) kept          │  entitiesReused++
              │ tail: reuse / rebuild / mutate    │  inPlaceUpdates vs entitiesRebuilt
              └───────────────┼───────────────────┘
                              │
                    content Stack + width/height republish
                              │
                    Scene.markDirty() + notifyLayoutUpdated()
```

三个模块拥有三阶段：

- **词法**——`packages/markdown/src/incrementalLex.ts:446` `lexFull` / `packages/markdown/src/incrementalLex.ts:477` `lexAppend` 加 `MarkdownWorker.ts:230` `self.onmessage`。缓存为 `IncrementalLexCache`（`incrementalLex.ts:207`）：`source`、`tail = source.slice(stableOffset)`、`tokens`、`stableCount`、`stableOffset`、`degraded`。
- **传输**——`Markdown.ts:2244` `dispatchAppend` 与 `MarkdownWorker.ts:345` diff。稳态发送 `{append, expectedLength}`（增量）；首次/重同步/恢复发送 `{text, oldRaws}`（全量）。worker diff 计算 `matchLen` 并返回 `tail = tokens.slice(matchLen)`。
- **调和**——`Markdown.ts:3674` `updateTokens(oldTokens → newTokens, knownMatchLen)`。经 `tokenChildPrefix`（`Markdown.ts:1030`，由 `Markdown.ts:1041` 处 `setTokens` 增量维护）将 token 索引映射到子槽，然后按 token 三路径：**复用未触及**、**就地修改**（`setSpans`/`setCode`/`appendRows`）或**销毁 + 重建**。

Front matter 在词法**之前**剥离（`frontMatter.ts:94` `scanFrontMatter`，`Markdown.ts:1116` `initSource` / `Markdown.ts:1157` `consumeFrontMatter`）因此 worker 对它无概念——`workerSourceLen` 与 `expectedLength` 保持仅对正文文本的偏移。未闭合开启器最多扣留 `MAX_PENDING_CHARS = 4096`（`frontMatter.ts:62`）并由流 `onClose` 的 `finalizeFrontMatter()` 在 `waitForAppendSettled` 之前释放（`Markdown.ts:1409`）。

### 旧路径做了什么

在 `incrementalLex` 之前，`MarkdownWorker` 持有 `{source, raws, version}`（`MarkdownWorker.ts:213` 旧形状），追加增量，然后对**整个**累积源码做词法。`99.5%` 原始前缀匹配在词法_之后_运行，因此它节省实体重建但永不节省词法——线性解析器在增长前缀上被调用 `N` 次。`postMessage` 然后重发整棵 token 树。两半按块皆为 `O(document)`；§ 数字中的基准在修复前使其可引用。

## 增量词法 — 已提交前缀思想

`marked` 无增量 API。修复追踪**稳定块边界**——其前 token 列表不再变化的字符偏移——并仅对之后文本重词法。

### 稳定截断规则

`findStableCut`（`incrementalLex.ts:331`）向后扫描寻找**其后至少有一个 token**的 `space` token，永不越过两个相邻 `paragraph` token 的首个，且仅在安定时：

- 推送的 `space` 永远意味着**真实空行**——单个 `\n` 被合并进前一 token 的 `raw`（`incrementalLex.ts:36`）。
- 对每个内置规则，仅与源码末端相邻的 token 仍可变化。`nFollow >= 1` 形式被暴力扫描：对每个前驱类型（`blockquote`、`code`、`heading`、`hr`、`html`、`list`、`paragraph`、`table`）安全，而 `nFollow == 0` 对 `code`/`list`/`paragraph` 失败（`incrementalLex.ts:39`）。
- **`list` 需两 token 滞后。**`'- a\n\n- b\n'` 无论空行数均为一个 `list`；相同标记总是合并。`cutIsSettled`（`incrementalLex.ts:314`）要求 `space` 后的 token 本身安定，才通过先前 `list` 取截断。
- **`blockMath` 前向触及**由词法器中空行界定：`(?:(?!\n[ \t]*\n)[\s\S])+?`（`Markdown.ts:294`，`MarkdownWorker.ts:122`）。先前 `(?!\n\n)` 使仅空白行不受守卫——`'$$\nx\n   \n$$\n'` 仍为一个 `blockMath`（`incrementalLex.ts:67`）。
- **`blockMath` 后向触及**为 `paragraphPairCap`（`incrementalLex.ts:289`）：marked 的 `startBlock` 裁剪最多融合**两个相邻** `paragraph` token，而稳定截断总是结束于 `space` 之后，因此一对永不跨越边界。旧治愈——在任何行首 `$$` 时退化——充分但永非必要；收窄到 cap 恢复 `139×`（见 § 数字）。
- **链接引用、`:::` 容器、`[^label]:` 脚注**直接退化（`incrementalLex.ts:225` 处 `DegradeReason`）：`def` retroactively 重写先前行内 token（`incrementalLex.ts:122`），容器围栏与脚注延续扫描器（`markdown-footnote.ts` `consumeContinuation`）具有无界前向触及。退化保持正确性；拒绝非平铺前进（`incrementalLex.ts:360` 处 `advanceTiles`）代价为一窗口增长而非一整块。

每次前进皆被**验证**（`advanceTiles`，`incrementalLex.ts:360`）：`source.slice` 必须等于覆盖它的 token 的拼接 `raw`。以裸列表标记 `'- a\n- '` 结尾的源码词法为 raw `'- a\n-\n'`——`raw` 平铺源码的假设通常为真但非总是（`incrementalLex.ts:130`），因此未验证前进被拒绝而非退化。

### 代价模型

- `tail = prev.tail + append`——仅扫描 `tail` 使检查保持 `O(window)` 而非 `O(document)`（`incrementalLex.ts:490`）。
- `charsLexed`（`incrementalLex.ts:248`）报告实际交给 `marked.lexer()` 的字符——边界节省的直接度量。`reusedTokens` 报告从缓存取得的前导 token。
- 朴素 `sourceCharsLexed` 求和本身按响应重求 `matchLen` raws 和——整流上 `O(n²)`（#657）。现 `IncrementalLexCache.stableOffset` 从词法发货并 `O(1)` 相加（`Markdown.ts:989`、`Markdown.ts:2289`）。

### 热路径中的扩展 — 为何 PX-0524 重要

每个 `marked` 扩展注册 `start()` 扫描 + 词法器。增量路径必须分类它（见 § 添加扩展）否则 `sourceCharsLexed` 退化到文档长度——`getDevtoolsDescriptor` 的 `Parser cost` 组（`Markdown.ts:2112`）中此实例退化的信号。

## Worker 协议 — 为何传输也重要

重词法并非唯一的 `O(N²)` 项。`postMessage` 在主线程同步**结构化克隆**其参数。按块重发整文档使传输 `O(document)` 即使词法已窗口化——实测 `4 µs` 于 8 KB 升至 `220 µs` 于 512 KB，而块大小 post 扁平 `~2 µs`（`Markdown.ts:1017`）。

修复在 worker 中同时缓存 token raws **与**源码（`MarkdownWorker.ts:213` `rawCache`），以 `workerInstanceId` + `tokenVersion` 键控（`Markdown.ts:1008`）。若无每次 `setTokens` 递增 `tokenVersion`（`Markdown.ts:1043`），`setContent` 后追加将对陈旧 raws 做 diff。

- **增量**——`append` + `expectedLength`（`Markdown.ts:2345`）。worker 扩展 `cached.lex.source` 以 `append`，检查 `cached.lex.source.length + append.length === expectedLength`（`MarkdownWorker.ts:308`）——一个整数，无字符串工作——并运行 `lexAppend`。
- **全量**——`text` + `oldRaws`（`Markdown.ts:2355`），用于首次请求、`setContent`、同步回退或 `needResync`。worker 请求一次重同步（`MarkdownWorker.ts:294`、`299`、`334`）而非对分歧源码做词法——错误的 `matchLen` 会污染调用方的 `updateTokens`。

`matchLen` 基于调用方做 diff 的**同一**先前列表计算。当 worker 复用词法的 `reusedTokens` 时，扫描始于 `reusedTokens`（`MarkdownWorker.ts:385`）——`O(window)`；回退到从 0 扫描将再次为 `O(document)`。驱逐有界（`MarkdownWorker.ts:228` 处 `RAW_CACHE_MAX = 256`）按最旧条目丢弃。

调用方在分发时快照 `this.tokens` 与 `this.tokenVersion`（`Markdown.ts:2252`）并在 `appendInFlight` 为真时合并（`Markdown.ts:2220`）。`dispatchedAt` 时间戳馈入 `streamStats.workerMs / workerMsMax`（`Markdown.ts:2273`），其最坏值即丢帧信号。

## 调和 — token 树 → 实体树，且不重建未变部分

### 已提交前缀思想 — 直觉

将文档想作在 `stableOffset` 处分开的两个区域：

```text
[████████████ stable █████████████████] [ unstable tail ]
 |  已提交——永不重词法  |  仍可变化 |
 |  raw 相等、实体复用            |  本块工作 |
```

追加到**仅尾部**的文本永不影响稳定前缀——这是 `findStableCut` 经暴力赢得的不变量。尾部为 `O(window)`——以空行间距加任何开放容器为界——因此按块工作随开放区域而非文档长度缩放。

### DevTools — 实时观察

`getDevtoolsDescriptor`（`Markdown.ts:1989`）呈现上文引用的流式计数器：

- `Streaming`——`appends` / `workerResponses` / `workerMsAvg` / `workerMsMax`（丢帧是 `max` 而非 `avg`）。
- `Delta shape`——`stablePrefixChars` / `changedTailChars` 比（近 1 意味着高复用）与 `entitiesReused` / `entitiesRebuilt` / `inPlaceUpdates`（快速路径）。
- `Incremental reuse`——`tokensPrefixMatched` / `tokensReturned` / `tokenPrefixReuseRatio`。
- `Parser cost`——`lexerMs` / `sourceCharsLexed`。若 `sourceCharsLexed` 跟踪文档长度，此实例退化。

### 将 token 映射到子槽

并非每个块 token 都渲染实体（`space`、非 SVG `html`、类注释 token 渲染 `null`）。`producesEntity`（`Markdown.ts:4044`）是谓词；`tokenChildPrefix` 是其前缀和，仅对 `setTokens(validFrom)`（`Markdown.ts:1041`）改变的后缀重建。`updateTokens` 随后：

1. 推导 `matchLen`——raw 相等前缀长度。当 worker 提供 `knownMatchLen` 时验证之（`0 ≤ knownMatchLen ≤ minLen`）而非盲信（`Markdown.ts:3689`）。
2. 若 `abbreviations` 变化则将 `matchLen` 封顶为 `0`（`Markdown.ts:3711` 对 `collectAbbreviations` 的 `mapsEqual`）——迟到 `*[TERM]: …` 可影响先前段落的行内 token，尽管 `raw` 未变（`markdown-abbr.ts` 平行于 `hasLinkDefinitions`）。
3. 当 `matchLen === oldTokens.length - 1` 且类型匹配时尝试**就地**快速路径（`Markdown.ts:3760` `lastTokenSameType`）。否则对后缀回退到销毁 + 重建。

注意：`updateTokens` 的销毁循环始于 `matchLen`——它曾以 `i >= matchLen` 守卫从 `0` 遍历，使其即使前缀完全复用时也按块为 `O(total blocks)`（`Markdown.ts:3956`）。

### 就地修改器 — 增长尾部情形

流式现实是**仅追加且尾部增长**。七个修改器覆盖流实际产生的尾部形状：

| 尾 token              | 修改器                                                               | file:line                                                       |
| --------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------- |
| `paragraph`（无图片） | `RichText.setSpans(literalSpans)`                                    | `Markdown.ts:3833`                                              |
| `paragraph`（含图）   | `Stack` 之 `[RichText, Image, …]`：经 `setSpans` 扩展尾随 `RichText` | `Markdown.ts:3846` `updateImageParagraph`（`Markdown.ts:3085`） |
| `code`（未闭合围栏）  | `CodeBlock.setCode(text, lang)`                                      | `Markdown.ts:3796`                                              |
| `heading`             | 带深度守卫的 `RichText.setSpans(headingSpans)`                       | `Markdown.ts:3875`                                              |
| `blockquote`          | 下探到 `innerStack` 尾包装器，重写其单子级                           | `Markdown.ts:3900` `updateBlockquoteTail`（`Markdown.ts:3306`） |
| `list`                | 重写最后保留项的 `setSpans`，`append` 新项                           | `Markdown.ts:3914` `updateStreamedList`（`Markdown.ts:2987`）   |
| `table`               | 对最后保留行单元 `RichText.setSpans`，对新行 `Table.appendRows`      | `Markdown.ts:3932` `updateStreamedTable`（`Markdown.ts:3203`）  |

每个尾部重同步为 `resizeLastChild`（`Stack.ts` 快速路径）——`O(1)`——而非完整 `Stack.layout()`（`Markdown.ts:3843`、`3859`、`3886`、`3904`、`3945`）。属性分支 `reflowToken`（`Markdown.ts:1520`）是 `setMaxWidth` 的非流式对应物——与 `renderToken` 保持逐臂一致，使宽度变化也无需重建。

`renderToken`（`Markdown.ts:4150`）是构地点；`producesEntity` 与 `reflowToken` 必须在它添加的分支上保持**三向锁步**——新分支缺其二即对三调用点之一为静默缺陷。

### Markdown 块布局

块几何由 `LayoutEngine`（`packages/layout/src/LayoutEngine.ts:808`）驱动。`RichText` 在 `availableWidth`（`Markdown.ts:4158`）经垂直 `Stack` 间隙 `theme.blockGap` 换行；块引用与 `:::` 容器以 `quoteIndent`/`containerIndent` 缩进其 `innerStack` 并将 `QuoteBorder`/`ContainerBackground` 挂于所得 `Stack` 高度（`Markdown.ts:3403`、`Markdown.ts:4402`）。`measureText` 对装饰按钮使用文档字体（`blockAffordances.ts:379`）使控件在绘制前定尺寸。`LayoutEngine.prepareRich` 是 `RichText` 的断行器；其记忆键为内容而非宽度，因此 `setMaxWidth` 经形状而非重度量重换行——这正是 `reflowToken` 存在的原因。

### 滚动与选区钩子

非虚拟化 `Markdown` 是 `ScrollView`（`packages/ui/src/ScrollView.ts:219` 弹簧驱动）的普通子级：宿主通过设 `content.y` 滚动并在图像下块因重布局移动时调用 `notifyLayoutUpdated`（`Markdown.ts:2643`）。开启 `virtualize` 时 `Markdown.setVisibleRange`（`Markdown.ts:1265`）是滚动驱动；视口外高度位于 `RowHeights` 而非作为分离实体。选区位于 `RichText` span；`updateTokens` 前缀复用保持已安定行 `InlineObject` 载体（图像/数学 `OBJECT_REPLACEMENT`）在合成器路径之外，而增长尾部的 `setSpans` 在不重建行几何的情况下保持其内选区。

## O(C·N²) 陷阱与 wrapper-instanceof 缺陷

### O(C·N²) — 测试未生成的形状

`table` token 携带**每行**；`list` token 携带**每项**；`blockquote` 携带**每内部块**。朴素调和在每个块上重建它们全部：

- `N` 项列表，按项流式：`1 + 2 + … + N = Θ(N²)` 次 `RichText` 构造——对 32 项列表实测 `528` 对 `32`（`Markdown.ts:3908` 注释）。
- `N` 行 `C` 列的表：`Θ(C·N²)` 次单元构造**外加**每单元 `Table.layout()` 重跑 `fitCell`——之上 `2×`。

聚合转录 bench 揭示 `mixed` 在每个后续散文块上仍重建刚到达的完整列表——对任何单一构造形状不可见（`benchmarks/markdown-transcript/corpus.ts`）。

### wrapper-instanceof 缺漏 — 为何流式在可选标志下回归

`blockAffordances: true` 将代码与表格包裹进 `BlockWithAffordances`（`blockAffordances.ts:433`）——拥有块及其复制/下载 `BlockAffordanceButton` 子级的 `UIComponent`，按块定尺寸（`blockAffordances.ts:457`），并投影为 `role: group`（`blockAffordances.ts:488`）。包装器修复 DOM 顺序 = tab 顺序并避免从 `Stack`/`Table` 窃取布局。

流式快速路径直接测试 `existingEntity instanceof Table` / `instanceof CodeBlock`。开启包装器时这些测试**永远返回 false**，因此每个块付出完整重建。

修复前受影响点：`updateTokens`（`Markdown.ts:3781`、`Markdown.ts:3209`）、`updateBlockquoteTail` 尾抽取（`Markdown.ts:3348`）、`reflowToken` `code`/`table` 分支（`Markdown.ts:1557`、`Markdown.ts:1651`）、`updateStreamedTable`（`Markdown.ts:3212`）。模式为：

```ts
const target = entity instanceof BlockWithAffordances ? entity.block : entity;
if (!(target instanceof Table)) return false;
// … 宽度/内容变化后：
if (entity instanceof BlockWithAffordances) entity.refreshAffordances();
```

`#789` / `#795`（`vectojs` issue）即此缺陷。`code-review-2026-08.md:167` 将所有点一并记录因它们成簇。

### 为何快照测试未捕获

markdown 套件以 `setContent` 快照为主。`setContent` **总是重建**（`Markdown.ts:1740`）：重置 `tokenVersion`、清空子级并调用 `renderMarkdown`。它**永不演练**流式调和路径（`updateTokens` + `inPlaceUpdates`/`entitiesRebuilt`/`tokenChildPrefix` + 包装器解包）。仅破坏复用路径的扩展或选项因此通过每个快照，仅在按 token 粒度 `appendMarkdown` 下失败。驱动 `setContent` 并宣称守卫复用的 `1/11` 破坏是典型例子（`forge/findings/text-richtext-and-markdown.md:552`）。

门控规则：任何流式改动必须包含**流式等价破坏**——以深 `toEqual` 对 `marked.lexer()` 在每个前缀上逐字符流式语料（`incrementalLex.test.ts` 模式）并以 `appendMarkdown` 粒度对调和。

### PX-0524 扩展爆炸 — 增量仍非免费时

添加语法覆盖（footnote、container、emoji、abbr、ins/mark、superscript——`markdown-footnote.ts` `FOOTNOTE_EXTENSIONS`、`markdown-container.ts` `CONTAINER_EXTENSIONS`、`markdown-emoji.ts` `EMOJI_EXTENSIONS`、`markdown-abbr.ts` `ABBR_EXTENSIONS`、`markdown-ins-mark.ts`、`markdown-superscript.ts`）使共享 `marked` 实例从 `faeeb0b7` 时 `2` 扩展到 `2a4bd52` 时 `12`。每个都是 `start()`/`tokenizer` 对，`marked` **按块与按行内段**咨询——因此即使以 `incrementalLex` 将词法窗口化到 `O(tail)`，按块代价为 `O(tail × extensions)`。§ 数字中 `1.67×` 解析上升即按块为此集群定价，发布时从未度量。`markdown-math.ts:258` `blockMath`/`inlineMath` 是两个已付出；其余十个是阶跃变化。教训：任何扩展添加必须重跑 `markdown-transcript` 与 `stream-markdown-smd` 对等门——增量的常数因子胜利可被扩展计数的常数因子损失吞没。

### 销毁与迟到光栅

另外两个生命周期钩子与流式竞争。`Markdown.destroy()`（`Markdown.ts:1938`）丢弃每个经闭包钉住 `this` 的 `workerCallbacks` 条目——无此，流式中途销毁会使整棵子树活到 worker 回复。`isDestroyed` 门控 `mathLoadPending` 延续（`Markdown.ts:1952`）使已拆除树不重渲染进分离子树。

行内图像与数学有其流后修复。段落图像的 `onLoad` 位于 `Markdown.ts:2562` 从 `naturalWidth`/`naturalHeight` 重测并调用 `reflowAfterImageResize`（`Markdown.ts:2604`），后者自底向上重推导包装器盒（`Markdown.ts:2674` 处 `resyncWrapperBox`）——裸 `content.layout()` 会重读陈旧父缓存（`Markdown.ts:2591` 注释）。标题或表格单元内的行内图像不能同法调整——其盒烘入 `LayoutEngine` 行；改为 `subscribeInlineImageRemeasure`（`Markdown.ts:1819`）在 `inlineImageBoxesStale`（`Markdown.ts:1855`）报告非正方形解码时重排版，但每 URL 仅一次（`Markdown.ts:1894` 处 `inlineImagesMeasured`）。数学类似：`ensureMathJax`（`Markdown.ts:3518`）将并发加载合并到一个 `preloadMathJax` promise，而 `retypesetFromTokens`（`Markdown.ts:3551`）从已词法 token 整体重建——唯一保持 `tokenChildPrefix` 平凡正确的路径。

## 五向张力 — 设计必须同时满足

| 力             | 它要求                                                                                                                        | 所在位置                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **正确性**     | `lexFull(source)` 与流式追加在每个前缀长度上与 `marked.lexer(source)` **深度相同**；`updateTokens` 结果等于 `setContent` 结果 | `incrementalLex.test.ts` 逐字符模糊、`markdownWorkerProtocol.test.ts` diff 门控强化到**树相等**                               |
| **增量性**     | 按块工作为 `O(window)`（不稳定尾部）而非 `O(document)`——无界尾部增长为回归                                                    | `stableOffset` / `charsLexed` / `changedTailChars` 计数器；`sourceCharsLexed` 必须跟踪载荷份额而非文档长度                    |
| **选区稳定性** | 追加不得移动或销毁已安定、静止屏幕块内的选区                                                                                  | `tokenChildPrefix` + `matchLen` 前缀实体复用；`updateTokens` 永不触碰前缀子级（`Markdown.ts:3956`）                           |
| **布局稳定性** | 任何视口外块不应在流式中途偏移已绘制屏幕块的布局                                                                              | 无 `finalizeFrontMatter` 对 `rawMarkdown` 收缩（协议要求）；仅尾部 `resizeLastChild` 重同步；无重读陈旧父盒的图像大小调整重排 |
| **性能**       | 增量胜利后按块渲染/布局工作保持在帧预算内                                                                                     | § 数字——调和现约 `~5%` 占比；渲染 `61%` 与解析 `33%` 主导                                                                     |

为助其一而违其一是反复出现的模式：显而易见的 front-matter 修复（先词法后移除）收缩 `rawMarkdown` 并破坏 worker 协议的 `expectedLength`；仅从 `content` 而不重同步包装器重布局的图像修复留下陈旧父盒（`Markdown.ts:2595` `reflowAfterImageResize`）。

## StreamController — 节奏、背压与谁拥有 close

`Markdown.appendMarkdown(chunk)` 是原始追加。`Markdown.createStream(opts)`（`Markdown.ts:1384`）以 `StreamController`（`StreamController.ts:129`）包裹它，添加原始路径所无的三件事——皆可选、皆仅显示、皆不允许丢字符：

- **帧合并。**无节奏时每个 `write()` 都将 post 到 worker 并调度调和。控制器批量到 `requestAnimationFrame` 滴答（`StreamController.ts:351` `schedule` / `onFrame`）。最简单调用方不使用 `pacing` 选项——仅 RAF 批量——这是常见 ChatGPT 风格 SSE 情况。
- **字形节奏。**`pacing: { graphemesPerSecond }`（`StreamController.ts:22`）经 `commitPaced`（`StreamController.ts:378`）以 `Intl.Segmenter` 字形计数排空内部 `chunks` 队列，使打字机效果按字形簇而非按 UTF-16 码元前进（emoji 保持完整）。
- **背压。**`maxBufferedChars`（`StreamController.ts:29`，默认 `64 KiB`）约束队列；满时 `write()` 背压（`StreamController.ts:183` `canAdmit` / `blocked`）。这是流控而非增量正确性——有界缓冲永不截断文档。

生命周期为 `createStream → write* → close() → onStable`。`createStream` 在 `virtualize` 开启时抛出（`Markdown.ts:1385`）或已存在流时抛出（`Markdown.ts:1388`）——每实例至多一个控制器；`updateTokens` 的单槽 `appendInFlight` + `appendPending` 合并假设于此。`close()` 同步提交任何待处理块（`StreamController.ts:244` `commitAllSubmitted`），翻转状态为 `closed`，然后等待宿主 `onClose` 钩子（`Markdown.ts:1404`），后者运行 `finalizeFrontMatter` 与 `waitForAppendSettled`（`Markdown.ts:1413`——最后 worker 回复 + 任何 `mathLoadPending` `preloadMathJax` + `fencedRebuildPending`）。仅然后 `onStable` 触发（`Markdown.ts:1419`）并带 `Array.from(content.children)`——快照而非活动引用（`incompleteMode.test.ts:313`）。`onStable` 不得调用 `appendMarkdown`/`setContent`/`setMaxWidth`（`Markdown.ts:3669` `assertNotInStableCallback`）——它被给予已完成文档以做一次性工作如烘焙高亮缓存。

## 乐观不完整语法 — 对尾缘的猜测

以 `**bo` 结尾的流式前缀应立即显示**粗体**而非原始 `**`。`StreamControllerOptions.incompleteMode`（`StreamController.ts:43`）控制此；`Markdown.streamIncompleteMode`（`Markdown.ts:853`）持有策略而 `StreamController` 仅拥有缓冲。

- `'literal'`（默认）——此选项前每个发布所发：未闭合语法渲染为 `marked.lexer` 的普通文本，因此 `**bo` 保持 `**bo` 直到闭合到达。
- `'optimistic'`——`optimisticParagraphSpans`（`Markdown.ts:3415`）仅扫描**尾随**段落的**最后行内 token**（已闭合构造已是其自有 `strong`/`em`/`codespan`/`link` token，因此仅最后纯文本段可持有开启器）。`findUnclosedInline`（`markdown-inline.ts:546`）按优先级检查三种语法：反引号（ outright 胜出——代码段内无其他为语法）、强调 `*`/`_`（`\*{1,2}(?!\*)` 整标记加非空格守卫；`_` 在 `markdown-inline.ts:570` 处排除 `snake_case`）、与 `[label](url`（`markdown-inline.ts:581`）。猜测以猜测格式渲染该段（`Markdown.ts:3484` 处 `optimisticStyle`）并于 `optimisticTail`（`Markdown.ts:866`）跟踪。合并追加可使被猜段落非尾随——`dropStaleOptimisticTail`（`Markdown.ts:3611`）立即回退而非等待 `close()`。`close()` 时任何剩余猜测回退为字面 span（`Markdown.ts:3574` `unwindOptimisticTail`）使 `literal` 与 `optimistic` 流最终相同。数学（`$…$`）不猜测——其 `InlineObject`（`markdown-inline.ts:301`）经 `exToPx`（`markdown-math.ts`）预留 `width/height/depth`，而非 span 样式。

## 虚拟化 vs 流式 — 互斥非策略选择

`virtualize`（`Markdown.ts:760`）经 `virtualTokens`/`virtualHeights`（`RowHeights`）与 `reconcileVirtual`（`Markdown.ts:1340`）将顶层块作为实体窗口化，由宿主 `setVisibleRange` 驱动（`ScrollView` 自动如此）。它**不能**与流式组合（`Markdown.ts:1385`、`Markdown.ts:2187` 皆抛出）：视口外块的实体不存在，因此 `updateTokens` 的 `tokenChildPrefix` + `matchLen` 前缀复用会寻址未挂载子槽。

`tableViewportHeight`（`Markdown.ts:771`）是逃生口——它经 `Table.appendRows` + `reconcileVirtualRows`（`Table.ts:334`）与 `bodyClip` 钉住在**每表内**虚拟化行，且在流式时_可用_，因为 `updateStreamedTable` 经同一已懒挂载的 `appendRows` 追加行。对巨大静态文档选 `virtualize`；对以宽表为主的流式文档选 `tableViewportHeight`。

### 段落形状陷阱 — 为何 `producesEntity` 不仅是优化

`producesEntity` 经 `paragraphHasImage`（`Markdown.ts:3807` 守卫）判定 `text → image` 是正确性而非速度：无它，获得首图的段落保持其 `RichText` 而图片被静默丢弃（`collectSpans` 对 `image` token 不发射）。列表项类似是 `itemIsInlineOnly`（`Markdown.ts:2759`）——将 `checkbox` 踢出 `INLINE_ITEM_TOKENS`（`Markdown.ts:2738`）迫使每个任务项走块路径并破坏任务列表渲染；allowlist 是使未来块类型不被压平为 `RichText` 的保障。

## 已度量的数字 — 带基线引用

仅 `benchmarks/run-browsers.sh` 数字（真实有头 Chrome/Firefox、真实 GPU、`calibrateRefreshRate()`、按 `hyprland-browser-bench` skill 的专用 Hyprland 工作区）可引用。无头 `script/benchmark.ts` 与 `benchmarks/debug-page.ts` 为绊线/调试。

### 调和胜利 — 聚合转录（`markdown-transcript-aggregate-2026-07-30`，CTX-0148，PR #296，提交 `0e4a4233`）

工作负载：`6` 轮、`176` 块、`27,882` 字符、`6,543` 块，**`token` 粒度**——粒度主导：同文档在 `token` vs `48` 字符下 `151` vs `14` 块，`7×` 复用差（`markdown-transcript-aggregate-2026-07-30.md:111`）。每臂两轮；仅 `lastTokenSameType` 翻转。

|               | 无复用    | 如今      | 差值       |
| ------------- | --------- | --------- | ---------- |
| 调和，Chrome  | 1635.2 ms | 319.5 ms  | **−80.5%** |
| 调和，Firefox | 992.2 ms  | 245.0 ms  | **−75.3%** |
| 渲染，Chrome  | 3626.8 ms | 3393.7 ms | −6.4%      |
| 解析，Chrome  | 1978.3 ms | 1826.2 ms | −7.7%      |
| 总计，Chrome  | 7240.4 ms | 5539.4 ms | **−23.5%** |
| 总计，Firefox | 6334.1 ms | 5404.3 ms | **−14.7%** |

**按已上线阶段占比**（已上线总计 `5539 ms` Chrome / `5404 ms` Firefox，`0.86 / 0.82 ms` 每块）：渲染 `61.3 / 61.4%`，解析 `32.9 / 34.1%`，**调和 `5.8 / 4.6%`**——调和现为**最小**阶段；剩余按类型复用 headroom 受该上限约束。

### 面板速率重跑（2026-08-08，`2a4bd52`，Firefox 现为面板 Hz）

| 引擎    | Hz              | 解析        | 调和      | 渲染        | 总计        |
| ------- | --------------- | ----------- | --------- | ----------- | ----------- |
| Chrome  | 240.09 / 239.95 | 2826 / 2830 | 459 / 456 | 3386 / 3388 | 6670 / 6674 |
| Firefox | 229.01 / 241.26 | 3190 / 3282 | 311 / 315 | 3581 / 3691 | 7082 / 7288 |

按块渲染 `0.517 / 0.556 ms` = `4.16 ms` 帧的 `12.4 / 13.3%`；总计按块 `1.02 / 1.10 ms` = `24.5 / 26.4%`。原运行中 `≈60 Hz` Firefox 数据（`58.75 Hz`）**并非**未聚焦窗口伪影——而是 `layout.frame_rate = -1`（`forge/findings/devtools-and-telemetry.md:2026-08-03`）。

**浮现的真实回归：**解析在两引擎上升 `1.67×`。对同一 `6543` 块语料以裸 `marked` vs 共享 12 扩展实例做词法：`1871 → 3127 ms`（`1.671×`）。代价为按块按扩展 `start()`/`tokenizer`。`faeeb0b7` 时实例携带 `2` 扩展；`2a4bd52` 时携带 `12`——**PX-0524 集群未度量的代价**。解析占比 `33% → 42–45%`。`incrementalLex` 数据在词法已窗口化_之后_——无它会更糟。

### 增量词法胜利 — 散文夹具（`comparisons/stream-markdown-smd`，Chrome 150 / Firefox 153，784 块）

之前：按块全重词法，`419.6 / 440.2 ms`，指数 `1.98`，交给词法器的字符 `9,847,040`。之后：`6.02 / 9.06 ms`，**`69.8× / 48.6×`**，指数 `0.94 / 1.21`，字符 `63,806`，指数 `1.00`（`forge/findings/text-richtext-and-markdown.md:2026-08-03`）。

### 数学流式在 cap 收窄后（`markdown-stream-math`，vectojs#398）

blanket `blockMath` 退化 → 仅 cap：**`139.3× Chrome / 96.5× Firefox`** 于 `26,760` 字符、`200` 段数学文档；至词法器的字符 `215.9×` 减少；边界安定于文档 `99.84%`；最大单块词法 `105` 字符于每尺寸（`forge/baselines/markdown-stream-math-findings.md`）。

## 在不回归流式的情况下添加新 Markdown 扩展

扩展是两次注册（`Markdown.ts:240` 与 `MarkdownWorker.ts:95`——相同 `marked.use` 调用，**两侧**，相同词法器——漂移破坏 worker 对 `marked` 的视图）。四项检查，按序：

### 1. 分类扩展触及

- **无 `start()` 且以空行界定** → 安全；无边界变化。例：行内规则（`abbr` `markdown-abbr.ts`、`emoji` `markdown-emoji.ts`、脚注引用 `markdown-footnote.ts` 一半）无需退化。
- **提供 `start()`** → 后向触及；`paragraphPairCap` 已封顶，但**验证**——任何新 `start()` 被覆盖因裁剪是 marked 的而非 `blockMath` 的（`incrementalLex.ts:103`）。
- **跨越空行** → 前向无界触及；`hasContainerOpener` / `hasFootnoteDefOpener` 模式（`markdown-container.ts: hasContainerOpener`，`markdown-footnote.ts: hasFootnoteDefOpener`）。经 `DegradeReason` **退化**（`incrementalLex.ts:225`）——截断上限无法界定它。
- **收集迟定义**（`marked` `def` 模式，`abbrDef` 是迫使 `Markdown.ts:3711` 处 `abbreviationsChanged` 将 `matchLen` 归零的窄例）→ 强制重建或退化；说明原因。

若不确定，**退化**——它永远正确且仅对实际包含开启器的流式文档付出代价。

### 2. 锁步注册并验证守卫

- `Markdown.ts:294` 与 `MarkdownWorker.ts:122` 中相同 `blockMath` 词法器拷贝已漂移一次（`[\s\S]+?` vs 空行守卫），worker 经 `scripts/build-worker.js` → `MarkdownWorkerSource.ts` 生成。若第三次漂移则抽取共享模块（`markdown-stream-math-findings.md: Also fixed`）。
- 对空行守卫的词法器，守卫必须为 `(?!\n[ \t]*\n)`（含仅空白行），而非 `(?!\n\n)`（`incrementalLex.ts:67`，#398）。

### 3. 教会每个实体感知点

对扩展添加的 token 类型：

- `renderToken`——构造（`Markdown.ts:4150`）。
- `producesEntity`（`Markdown.ts:4044`）——当且仅当渲染实体时为 `true`；恰对渲染 `null` 的 token 为 `false`（否则 `tokenChildPrefix` 漂移）。
- `reflowToken`（`Markdown.ts:1520`）——宽度变化路径；缺失分支使块保持旧宽度。
- `updateTokens` 就地分支（`Markdown.ts:3760`）——仅当增长尾部形状具修改器（`setSpans`/`setCode`/`appendRows`）时加入；容器类型（`blockquote`、`list`、`table`）经尾部下探而非直接修改。
- 若块可被装饰包裹，解包：`instanceof BlockWithAffordances ? .block : entity`——并在修改内部尺寸后调用 `refreshAffordances()`（`Markdown.ts:3209`、`Markdown.ts:3781` 模式）。
- 若新块内可出现行内图像/数学，覆盖 `containsImage`/`containsInlineMath` 订阅（`Markdown.ts:4166`）与 `reflowAfterImageResize` 包装器重同步。

### 4. 添加破坏而非仅快照

- `incrementalLex.test.ts` 逐字符模糊：以含新构造的语料逐字符流式，深 `toEqual` 对 `marked.lexer()` 于每个前缀。保持对 `14 docs × 每个前缀 × 每个截断` 的暴力扫描以论证 `findStableCut`；带与不带扩展各跑一次以证明 `nFollow >= 1` 仍成立。
- **流式调和破坏**：以**token 粒度**经 `appendMarkdown`（非 `setContent`）流式含该构造的文档，断言 `inPlaceUpdates`/`entitiesRebuilt`/`charsLexed` 按预期方向移动，并对 `setContent` 断言深 token 树 + 像素相等——驱动 `setContent` 的破坏无法使复用路径失败。
- 在定时循环外以**深树相等**重跑 `comparisons/stream-markdown-smd` 对等门与两引擎阈值门——按 `forge/findings/text-richtext-and-markdown.md:2026-08-03` 仅树相等能捕获对错误解析的快速数字。

### 时间线 — 一块穿越两区域

```text
chunk " world": "Hello **bo" → "Hello **world**"
  before: stable="Hello "  tail="**bo"        (paragraph, trailing plain run)
   lex:   tail re-lex → [text("Hello "), strong("world")]  charsLexed = tail.length
   diff:  matchLen=0 (paragraph raw changed), tail = [paragraph(strong)]
   reconcile: heading/paragraph didn't match → destroy old RichText, add new one
  after:  stable="Hello **world**\n\n"  tail=""  (blank line committed, entitiesReused++)
```

提交发生在空行到达且 `findStableCut` 可前进时。在此之前每块重访同一尾部——有界，而非随文档长度增长。

## 调试流式 — 优先检查什么

1. **`sourceCharsLexed` 跟踪文档长度** → 退化（`incrementalLex.ts:225` 处 `DegradeReason`）；检查文档中 `:::`/`[^`/`def`/`\r` 或缺失仅尾扫描（`incrementalLex.ts:490`）。
2. **`inPlaceUpdates` 平坦而 `entitiesRebuilt` 攀升** → 就地缺漏；搜索无 `BlockWithAffordances` 解包的 `instanceof RichText`/`CodeBlock`/`Table`——经典包装器缺陷（`code-review-2026-08.md:167`）。
3. **快照通过，流式失败** → `setContent` 路径（`Markdown.ts:1740`）永不演练 `updateTokens`；编写逐字符破坏。
4. **`close()` 后末块缺失** → `waitForAppendSettled` 未等待；检查 `Markdown.ts:2429` 处 `appendInFlight`/`mathLoadPending`/`fencedRebuildPending` 门控。
5. **追加时选区跳跃** → 前缀未复用；检查 `tokenChildPrefix` 有效范围（`Markdown.ts:1041` `validFrom`）与 `matchLen` 校验（`Markdown.ts:3689`）。
6. **图像解码后视口外块重排** → `reflowAfterImageResize` 包装器路径（`Markdown.ts:2604`）陈旧；检查 `resyncWrapperBox` 覆盖包装器类型。

## 不变量 — PR 前清单

1. **深度词法同一。**`incrementalLex(charByChar(S))` 在每个前缀上深度等于 `marked.lexer(S)`，包括仅空白空行与裸列表标记。
2. **传输同一。**`matchLen` 前缀 raws 相等，且 `[...oldTokens.slice(0,matchLen), ...tail]` 等于完整词法——于 `Markdown.ts:3689` 与 worker 中 `MarkdownWorker.ts:308` 验证。
3. **实体索引一致。**`producesEntity ↔ renderToken null ↔ reflowToken 分支 ↔ tokenChildPrefix` 四向；以 `BlockWithAffordances` **开启**测试。
4. **仅尾部修改。**无就地路径触碰前缀子级；每个提前返回保持实体未触碰，使被拒绝复用非半更新。
5. **配额随流式代价线性。**按块配额（若强制）随 `append` 代价（`charsLexed` 窗口）线性，且仅平滑输入被节流——缓冲发送整体提交（`StreamController.ts` 节奏仅显示；正确性永不丢字符）。
6. **深度稳定标题。**`heading` 就地复用仅当 `oldDepth === newDepth`（`Markdown.ts:3875`）；否则 `font` 将陈旧（`RichText` 仅构造时）。

## 参考

- `vectojs-docs/content/learn/streaming.md`——面向用户的流式 API 与 `createStream` 生命周期。
- `vectojs-docs/content/learn/text-typography.md`——为何行内数学/图像与 `RichText`/`LayoutEngine` 与流式交互。
- `vectojs-docs/forge/findings/text-richtext-and-markdown.md`——赢得上文每行的每个流式缺陷的实地笔记。
- `vectojs-docs/forge/baselines/markdown-transcript-aggregate-2026-07-30.md` 与 `markdown-stream-math-findings.md`——两份可引用基线及其引擎/提交。
- `vectojs-docs/forge/code-review-2026-08.md:167,170`——`BlockWithAffordances` `instanceof` + `refreshAffordances` 集群（`#789`/`#795`，`#701`）。
- `packages/markdown/test/incrementalLex.test.ts` 与 `markdownWorkerProtocol.test.ts`——任何新扩展必须保持绿色的流式等价与协议契约。

---

_下一篇：05 零 DOM TeX — 排版内核、`InlineObject` 与 `SVGEntity` 发射，流式数学与表格据以度量的对象。_
