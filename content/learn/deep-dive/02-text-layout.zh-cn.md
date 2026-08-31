+++
title = "02 — 文本与布局：从 Unicode 到像素"
description = "完整文本管线——分段、BiDi、阿拉伯塑形、字体回退、Typography、断行、LayoutEngine 冷/热分离、Worker 线程化，以及保持绘制与度量对等的各项不变量。"
weight = 22
+++

# 02 — 文本与布局：从 Unicode 到像素

> VectoJS 重新实现了浏览器文本栈免费提供的能力：双向、塑形、分段、字体回退、断行与基线定位。本篇追踪从 Unicode `string` 到已定位字形的每一阶段，并阐明使 `measure` 与 `paint` 按构造达成一致的契约。

## 1. 管线一览

```text
Unicode string
  │  Intl.Segmenter (word + grapheme)          packages/layout/src/LayoutEngine.ts:916
  ▼
 Grapheme segmentation ─┬─ ArabicShaper.shapeArabic  packages/text/src/ArabicShaper.ts:89
                        │  indexMap: shaped → source       :91
                        ▼
 BiDi resolution (bidi-js, UAX #9)            packages/text/src/BidiResolver.ts:27
  getBaseLevel / resolveLevels / reorderSegments
                        │
                        ▼
 Font fallback (atlas → measurer → 0.5em)     packages/layout/src/measure.ts:39
  createCanvasMeasurer / createMetricsMeasurer / resolveGlyphMeasurer
                        │
                        ▼
 Typography (baseline in line box)            packages/text/src/Typography.ts:93
  cssLineBoxBaseline / registeredBaseline / splitFontShorthand
                        │
                        ▼
 Line breaking + exclusion flow + justify     packages/layout/src/LayoutEngine.ts:1848
  computeLineSegments / suppressLineBreaks / LayoutEngine.layoutPrepared
                        │
                        ▼
 Paint / measure parity ─┬─ @vectojs/layout  (canvas Text/RichText)
                         └─ @vectojs/text    (MSDF: MSDFFont.layout)  packages/text/src/MSDFFont.ts:201
                         └─ @vectojs/core    (MSDFTextEntity → worker) packages/core/src/text/MSDFTextEntity.ts:25
```

两条并行消费者共享同一度量契约：**canvas 路径**（`@vectojs/layout` + `measureContext`）与 **GPU/MSDF 路径**（`MSDFFont.layout` + `LayoutWorker`）。结果仅在四边形如何变为像素上分歧，绝不在每族字体下断行位置上分歧。

对网格消费者（终端、编辑器、`CodeBlock`）管线更早分叉为保留网格路径 `prepareContentGrid`（`packages/text/src/PreparedContentGrid.ts:243`）——一次编译，两处消费（绘制 + 投影）。见 `tmp/boss-research/01-selection.md` §3.3 的内容网格侧。

### 冷 / 热分离（使调整大小廉价的 2.68×）

```text
prepare(text) / prepareRich(spans)          ← cold:  Intl.Segmenter + Arabic shape + BiDi + glyphWidth
  └─→ PreparedText { paragraphs, fontSize }      memo'd by text+fontSize+styleSig (LayoutEngine.ts:829/833)
       │  independent of maxWidth / maxHeight / exclusions
       ▼
layoutPrepared(prepared, mask, exclusions)  ← hot:   computeLineSegments + suppressLineBreaks + shiftedExtent
measurePrepared(prepared)                   ← hot (no alloc): lineCount+height only
layoutPreparedIntoBuffer(prepared, buffer)  ← hot, zero-GC: typed arrays + reorderSegments
```

`benchmarks/text-layout-pretext` / `comparisons/text-layout-pretext` / `scripts/compare-pretext.ts:1` 确立了可公平对比的拆分（`measurePrepared` vs `pretext.layout`）。拆分前，`layoutText`（冷+热）被拿去与 pretext 仅热的 `layout` 计时——差距被报告为引擎代价，实为分段代价。

### 分段器及其缓存

`LayoutEngine`（`:916`）持有 `wordSegmenter` + `charSegmenter`（`Intl.Segmenter`，区域 `navigator.language ?? 'en-US'`）——自动识别 CJK 与西方单词边界——加上 `wordCache: Map<string, …>`（`:821`，上限 500）与 `graphemeCache: Map<string,string[]>`（`:822`，上限 2000）。两者在触顶时整体清空（`:921`/`950`）并通过 `cacheStats()`（`:1004`）观测。`PreparedContentGrid` 对字形同样偏好 `Intl.Segmenter`（`:76`）但携带 `fallbackGraphemes`（`:107`）以应对无此 API 的环境：组合标记、VS16/VS15、肤色修饰符 `U+1F3FB–1F3FF`、区域指示符、ZWJ——足以保持制表位与宽列正确。`LayoutEngine.getGraphemes`（`:943`）与 `getWordSegments`（`:881`）是唯二调用点；`shapeSimpleRun`（`:1644`）仅在 `isComplexScript`（`:584`）证明安全后才绕过 `ArabicShaper`。

## 2. 按模块深潜

### 2.1 `packages/text/src/BidiResolver.ts:27` — 经 `bidi-js` 的 UAX #9

纯静态类（有意为之——`BidiResolver.getBaseLevel(...)` 是公开 API）。对 `bidi-js` 的 `getEmbeddingLevels` / `getReorderedIndices` / `getReorderSegments` 的薄封装；先前手写的 L2 反转被替换，因为其 L1 重置仅处理单个尾随空白段。

| 方法                                      | 行     | 作用                                                                                                                                                                                                                                                                |
| ----------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getBaseLevel(text)`                      | `:29`  | 段落嵌入层级 P2/P3（0 LTR，1 RTL）。                                                                                                                                                                                                                                |
| `resolveLevels(text)`                     | `:34`  | 按字符解析层级 X1–I2（`Uint8Array`）。                                                                                                                                                                                                                              |
| `reorderIndices(text)`                    | `:50`  | 可视→逻辑置换 L1+L2（`indices[v] = 可视列 v 处的逻辑索引`）。权威——选区通过此将逻辑范围映射到可视段。                                                                                                                                                               |
| `logicalToVisualRuns(text, start, end)`   | `:62`  | 一个逻辑 `[start,end)` → N 个可视 `[visualStart,visualEnd)` 段，按从左到右排序。单个选区矩形在跨越方向边界时会变为多个。                                                                                                                                            |
| `reorderVisual<T>(nodes, baseLevel)`      | `:89`  | 对一行节点就地 L1+L2 反转。重建 `str` + `levels` 并迭代 `reorderSegments`。在每个换行中为热点。                                                                                                                                                                     |
| `reorderSegments(str, levels, baseLevel)` | `:121` | 与类型化数组 `[start,end]` 对相同的置换（`packages/layout/src/LayoutEngine.ts:2466` 注释）——让零 GC 缓冲路径（`layoutPreparedIntoBuffer`）无需按字形分配 `BidiNode` 对象即可应用。合成 `embed = { levels, paragraphs:[{level: baseLevel}] }` 使 L1 重置到段落方向。 |

代价：每段落一次 `bidi-js` 遍历。除 `reorderVisual` 中数组构建外无按字形工作。

### 2.2 `packages/text/src/ArabicShaper.ts:18` — 上下文塑形

针对阿拉伯区块及波斯/乌尔都扩展的表现形式替换。`MAPPINGS: { [code]: GlyphForms }`（`:18`）记录每码点的 `isolated/initial/medial/final` 码点与 `joining: 'D'|'R'|'U'`。Tatweel `U+0640` 为 `'D'` 但在每种形式发射相同码点（`:052`）因此连接可穿透。

- `isHarakat(code)`（`:70`）——`U+064B–065F`、`U+0670`、`U+0610–061A`（尊称符号）、`U+06D6–06ED`（古兰经注释）外加三个 harakat 相邻标记范围。全部具有连接类型 TRANSPARENT——塑形必须跨过它们，否则尊称文本会断开。镜像 `MSDFFont.ts:isNonspacingMark`（`:132`）。
- `getJoiningType(code)`（`:84`）——查表，缺省时为 `'U'`。
- `shapeArabic(text)`（`:89`）——单次从左到右遍历：连字前瞻（`lam+alef` `U+0644` + `U+0627/0622/0623/0625` → 表现连字，`k` 指针 `:105`）、`connectPrev`/`connectNext`（`:182`/`:187`）通过在透明标记上前后扫描计算，`glyph = forms.isolated/initial/medial/final`。返回 `{ shapedText, indexMap: Int32Array }`（`:1`）——`indexMap[visualIndex] = sourceOffset` 因此 `LayoutEngine` 可在塑形后恢复 `sourceIndex/sourceLength`。

选区契约：可视位置重排，但 `sourceIndex` 始终索引原始逻辑字符串。

### 2.3 `packages/text/src/measureContext.ts:41` — 在哪绘制就在哪度量

为执行一条不变量而存在的模块。分离的 `HTMLCanvasElement` 在 Gecko 上将通用族（`monospace`、`serif`）解析为与文档已挂载 canvas **不同字体**，因为通用→真实映射存在于仅能从活动样式上下文到达的按语言字体偏好中。

表头（`:1`）：Firefox 153，`<html lang="zh">`，DPR 1.5789，`measureText('MMMMMMMMMM')`——分离 `22px monospace` 109.7，已挂载 131.6，布局 132.0；分离 `serif` 109.7/205.5——两者坍缩到同一硬编码回退，误差 20–47%。Chromium 不受影响。`OffscreenCanvas` 度量 132.0（匹配布局）但未被使用——与**已绘制** canvas 一致比与布局一致更重要。

- `createMeasuringContext()`（`:62`）——1×1 canvas，`position:absolute;opacity:0;left:-9999px;top:0`，`aria-hidden`，追加到 `document.body`。`display:none` 会使其脱离布局并丢失样式上下文；分离即失败模式。
- `getSharedMeasuringContext()`（`:87`）——单一共享上下文（`:41` `sharedCanvas`/`sharedContext`）。记忆 `null`（`undefined` vs `null` 区分，`:98`）因此 SSR（`typeof document === 'undefined'`）不会按字形重试创建。每次读取前设置 `ctx.font`；无宽度缓存随上下文携带。
- `isSharedMeasuringContextAttached()`（`:118`）/ `resetSharedMeasuringContext()`（`:130`）——对在 `document.body` 存在前创建的上下文的诊断 + 恢复。目前仓库内无调用方自动重建；调用点模式见 `:111`。

每个度量器必须调用它。`packages/layout/src/measure.ts:42` 如此。审计 `packages/` 中分离的 `document.createElement('canvas')` 即检查。

### 2.4 `packages/text/src/fontMetrics.ts:14` — 无 DOM 度量注册表

面向完全无 canvas 的环境（SSR、无 `OffscreenCanvas` 的 worker、测试）。值以 **em 单位**，因此一次注册服务所有尺寸。

- `FontMetricsSource`（`:14`）——`advanceEm(char)`，可选 `measureEm(text)`（感知字距）、`ascenderEm`/`descenderEm`。`measureEm` 的回退是累加 `advanceEm`，正确但丢失字距。
- `normalizeFamily`（`:45`）——仅首族、去引号、小写。回退链是渲染器关切，非注册表关切。
- `registerFontMetrics(family, source)`（`:82`）、`registerMSDFFontMetrics(family, font)`（`:97`）、`createMSDFMetricsSource(font)`（`:114`）——`advanceEm` 来自 `font.getGlyph(code)?.advance`，`measureEm` 来自 `font.layout(text, 1).width`（唯一能字距的路径——按字形 `GlyphMeasurer` 无邻居）。`ascenderEm`/`descenderEm` 来自 `font.data.metrics`。`hasFontMetrics`（`:154`）是廉价探针，用于在未注册时短路。
- `fontMetricsVersion()`（`:64`）、`getFontMetrics`（`:141`）、`clearFontMetrics`（`:163`）。版本计数让调用方可缓存已解析来源并仅在递增时重新解析——捕获来源而不检查会在注册时钉住当时内容（`measure.ts` 中 `:107`）。`createMetricsMeasurer`（`measure.ts:96`）因此懒持 `baseVersion/runVersion` 并按字形比较一次，而非在 `normalizeFamily` 内分配（按字形 +13% 开销得以避免）。

### 2.4b `packages/text/src/index.ts:1` — barrel

重导出 `ArabicShaper`、`BidiResolver`、`measureContext`、`PreparedContentGrid`、`MSDFFont`、`fontMetrics`、`Typography`（`:1`）。`@vectojs/layout` 从 `@vectojs/text` 导入（非相对）——`LayoutEngine.ts:1` `import { ArabicShaper } from '@vectojs/text'`——因此包边界可观测。`LayoutWorkerManager` 单例也缓存 `MSDFFontData`（`LayoutWorkerManager.ts:043`）跨越 worker 死亡，正因如此：度量数据跨线程边界一次且必须在回退路径保持可用。

### 2.5 `packages/text/src/Typography.ts:4` — 行盒内的基线

CSS 将字体 ascent+descent 在行盒内居中；canvas 在显式 y 处绘制。两者必须一致，否则 `fillText` 与其原生镜像处于不同基线。

- `BASELINE_CACHE_MAX = 512`（`:12`）、`baselineCache: Map<string,number>`（`:4`）、`rememberBaseline`（`:14`）——插入序 LRU（命中时 delete+re-set，`:98`）。512 覆盖现实文档中每种字体；未命中则重测一次 `'Mg'`。
- `splitFontShorthand(font)`（`:33`）——锚定于 `indexOf('px')` 并回退遍历数字，而非 `/(\d+)px/`（多项式 ReDoS，`js/polynomial-redos`，高危）。镜像 `@vectojs/ui`/`@vectojs/markdown` 中有意不同失败值的解析器。
- `registeredBaseline(font, lineHeight)`（`:67`）——来自 `getFontMetrics` 的无 DOM 路径。`(lineHeight - ascent - descent)/2 + ascent`，其中 `descent = -descenderEm * size`；回退 `lineHeight * 0.8`。
- `cssLineBoxBaseline(font, lineHeight)`（`:93`）——有序选择：SSR→`registeredBaseline`；缓存命中→返回；`getSharedMeasuringContext`（已挂载，`:107`）→ `ctx.measureText('Mg')` → `fontBoundingBoxAscent/Descent || actualBoundingBoxAscent/Descent`（`:112`）→ 同一居中公式；退化度量→`0.8` 回退。同一 `0.8` 常量锚定 `LayoutEngine.ts:shiftedExtent`（`:668`）与行盒 `1.5 * pMax`/`0.8 * pMax` 几何。
- `clearCssLineBoxMetrics()`（`:122`）——Web 字体加载完成后调用。

### 2.6 `packages/text/src/MSDFFont.ts:151` — GPU 文本

解析 `msdf-atlas-gen` JSON（类型 `msdf`/`mtsdf`/`sdf`），以 CSS 像素布局四边形并附带 atlas UV。渲染器约定：本地空间 y 向下，左上原点；UV `v=0` 在 atlas 顶部（上传时无 Y 翻转）。

- 接口：`MSDFAtlasInfo`（`:16`，`distanceRange/size/width/height/yOrigin`）、`MSDFMetrics`（`:32`，`lineHeight/ascender/descender`）、`MSDFBounds`（`:45`）、`MSDFGlyphDef`（`:53`，`unicode/advance/planeBounds/atlasBounds`）、`MSDFKerning`（`:64`）、`MSDFFontData`（`:71`）、`PositionedGlyph`（`:79`，`x/y/w/h + u0/v0/u1/v1`）、`MSDFLayoutResult`（`:96`，`glyphs/width/height`）、`MSDFLayoutOptions`（`:105`）。
- `kernKey(a,b)`（`:115`）——`a * 0x110000 + b`；`isNonspacingMark(code)`（`:132`）——显式范围列表（按字形循环中廉价，无 `\p{Mn}` 正则），镜像 `LayoutEngine.ts:isComplexScript`（`:584`）。
- `MSDFFont`（`:151`）——`id`（`font-${idCounter++}` `:164`）、`byCode: Map<number,MSDFGlyphDef>`、`kern: Map<number,number>`、`missingAdvance`（`:158`，空格→`.notdef`→`0.5`）。`parse`（`:173`）、`getGlyph`（`:178`）、`distanceRange`/`atlasWidth`/`atlasHeight`（`:183`）。
- `layout(text, fontSizePx, opts)`（`:201`）——感知码点（`Array.from(text)` `:212`），尊重 `\r\n`/`\r` 为一次断行（`:214`），缺失字形 → `missingAdvance * size`（永不为 0，否则后继字形左移）唯 `isNonspacingMark` advance 0（`:233`）且不为字距替换 `prevCode`（`:252`）。字距 `k * fontSize`（`:242`），`baseline = y + (ascender + line*lineHeight)*size`（`:246`），`planeBounds`→四边形（`:246` 起），`yOrigin` 翻转 `v0/v1`（`:250`）。返回 `{ glyphs, width: maxAdvance, height: (line+1)*lineHeight*size }`。

### 2.7 `packages/text/src/PreparedContentGrid.ts:38` — 保留网格方案

不可变、源码感知的网格文本几何。一次编译，共享于 canvas 绘制与 DOM 投影——重新分段会使双向、制表与宽字形错位。

- `PreparedContentGrid`（`:38`）——`{ kind:'content-grid', revision, source, font, cellWidth, lineHeight, baseline, tabSize, lines }`；`PrepareContentGridOptions`（`:50`）；`MutableCell`（`:63`）。
- `graphemeSegmenter`（`:76`，`Intl.Segmenter` 字形粒度）带 `fallbackGraphemes`（`:107`）覆盖组合标记、变体选择器、emoji 修饰符、按键帽、区域指示符、ZWJ。`graphemes()`（`:151`）优先 `Intl.Segmenter`。
- `isWideCluster`（`:170`）——`EAST_ASIAN_WIDE`（`:91`，CJK 区块）+ `EXTENDED_PICTOGRAPHIC` 带 `VS16`/`VS15` 敏感 + `EMOJI_PRESENTATION` + `REGIONAL_INDICATOR`/`0x20E3`。宽 → 2 列。
- `sourceLines`（`:197`）——拥有 `\r\n`/`\r`/`\n`；`sourceStart/sourceEnd/nextSourceStart` 使后续每个偏移正确。
- `prepareContentGrid(source, opts)`（`:243`）——按行：`rawCaretBoundaries` 来自 `graphemes(rawLine)`，`ArabicShaper.shapeArabic(rawLine)`（`:270`），`graphemes(shaped)`，`BidiResolver.resolveLevels`（`:273`），按已塑形字形建单元，`sourceStart/sourceEnd` 经 `indexMap`（`:278`），`sourceCaretOffsets` 经 `lowerBound`（`:159`），`columns = 0/ tabStop / wide?2:1`（`:298`），`BidiResolver.reorderVisual(visualCells, getBaseLevel(shaped))`（`:315`），`x` 遍历（`:317`）。返回前冻结。

### 2.8 `packages/layout/src/LayoutEngine.ts` — 散文布局引擎

约 3.4k 行，文本栈中最重的单文件。架构是基于类型化契约的**冷/热分离**。

**冷半**（昂贵，无约束）：

- `prepare(text, atlas, size)`（`:1080`）/ `prepareRich(spans, atlas, size, baseStyle)`（`:1266`）——运行 `Intl.Segmenter`（单词 `:916` + 字形 `:917`）、经 `glyphWidth`（`:929`，atlas→`GlyphMeasurer`→`0.5em`）解析字形 advance、塑形（`ArabicShaper` `:1117`）、解析双向（`BidiResolver` `:1123`/`:1524`）、构建 `PreparedText`（`:462`）。结果独立于 `maxWidth`/`maxHeight`/排除区。段落记忆化：`paragraphCache: Map<string,PreparedParagraph>`（`:829`）键为 `${fontSize} ${paragraph}`；富变体 `richParagraphCache`（`:833`）键为 `${fontSize} ${text} ${styleSig}`，其中 `styleSig` 是对 `TextStyle` 字段 + `InlineObject` 身份的 RLE 值签名（bold/italic/color/href/fontFamily/baselineShift/highlightColor/abbrTitle 加上对象 `width/height/depth/alt/key`）。Atlas 身份变化清空两者（`:1095`/`:1275`）。

**`prepareRich` 内的流式快速路径**：`streamShapeCache`（`:839`，单槽增量缓存）。条件位于 `:1358`：单段落、无 `\n`/`\r`、`!isComplexScript(fullText)`（`:584`——阿拉伯/希伯来/印度语/组合/双向标记/emoji 修饰符走完整塑形）。当 `fullText` 严格扩展 `cache.text`，样式在前缀上相等（`styleRangeEquals` `:682`、`objectRangeEquals` `:628`），则逐字复用前缀单词并仅对后缀调用 `shapeSimpleRun(fullText, reshapeFrom, ...)`（`:1644`）。`reshapeFrom` 非 `cache.end` 而是尾部同类（空白 vs 非空白）段起点，使 `Intl.Segmenter` 边界在下一块到达时溶解（例 `"3"+"."+"1"` → `"3.1"`）时被正确重建。状态：已上线，边缘情况正确实测但在真实文档上可忽略（记忆化已封顶按段落代价）——按 `forge/findings/text-richtext-and-markdown.md:356` 暂缓独立 `@vectojs/core` 发布。

**热半**（廉价，受约束）：

- `layoutPrepared(prepared, exclusionMask?, exclusions?)`（`:1848`）/ `measurePrepared`（`:1772`）/ `layoutPreparedIntoBuffer(prepared, buffer, mask?)`（`:2241`）——遍历 `PreparedText` 单词，在 `currentX/currentY` 放置字形，遵守 `maxWidth`/`maxHeight`、`exclusions: ExclusionRect[]`、`computeLineSegments(top,bottom,maxWidth,exclusions)`（`:504`，`O(n log n)` x 区间合并，于 `[0,maxWidth]` 内取补）、孤字标点抑制（`suppressLineBreaks` `:721`，`'@'` 连接 + 闭合标点合并）、连字符（来自 `U+00AD` 或 `this._hyphenate` 钩子的 `breakPoints`，`hyphenWidth` `:490`）、两端对齐（仅多段行 `textAlign:'justify'`）、`shiftedExtent(gfs, shift, pMax)`（`:668`）应用共享 `0.8/0.2` 行盒切分，使抬升上标仅在将离开盒子时增长该行。`layoutPrepared` 分配 `LayoutNode[]` + `LayoutResult`；`layoutPreparedIntoBuffer` 写入扁平类型化数组且无分配，并应用相同 BiDi `reorderSegments` 遍历。

其他关键构件：`EMPTY_GLYPH_ATLAS`（`:83`，冻结常量——`Text`/`RichText` 传入它使段落记忆不被新鲜 `{}` 字面量逐次失效；200×12 段落重布局上实测 2.68× `:64`）；`unmeasuredGlyphCount()`/`resetUnmeasuredGlyphCount()`/`setUnmeasuredGlyphWarning()`（`:8`——`0.5em` 捏造被计数而非静默；`fallbackToCanvas`（`:380`，三态 `undefined` vs `true`）仅报告缺 atlas，而非缺度量器）；`GlyphMeasurer`（`:92`，`measure(char,size,family,bold,italic)`——按段族/样式覆盖使行内 `code` 以自有度量度量，`warnUnmeasured`（`:9`）单次警告由 `unmeasuredGlyphCount` 门控）；`TextStyle`（`:113`，约 9 字段：`fontSize/color/bold/italic/fontFamily/lineThrough/baselineShift/underline/highlightColor/abbrTitle/href`——每个影响 advance 的都必须在 `styleSig`；`fontFamily` 直到 2026-07-30 缺失，导致 `monospace` 段落以 `serif` 度量被无限缓存命中，仅因空 atlas 抖动使 `paragraphCache` 保持 0 命中而潜伏）；`InlineObject`（`:216`，`OBJECT_REPLACEMENT U+FFFC :198`，固定 `width/height/depth/alt/key/paint` `:216`，`width/height/depth` 已解析为 px，`paint`（`:301` `InlineObjectSurface { drawImage, drawImageRect } :315`）永不由引擎调用，`InlineObjectBox { x,y,width,height } :299` 已含 `depth`）；`cacheStats()`（`:1004`）暴露 `hits/misses/evictions/hitRate/size/capacity` 按 `word(500)/grapheme(2000)/paragraph(1000)/richParagraph(1000)`（`:831` cap）并 `resetCacheStats()`（`:1030`）保留条目；`LayoutResult`（`:378` `nodes/totalWidth/totalHeight/fallbackToCanvas`）是每条热路径的唯一输出；`GridTextEntity`（`components/GridTextEntity.ts:4`，遗留 `n`）vs `PreparedContentGrid.ts:243` 拆分明确哪个网格是保留的、哪个是简单 `fillText` 循环。

热遍历放置代码：`layoutPrepared`（`LayoutEngine.ts:2050` 起）中每段落 `pMax` 先为对象增长（`objDescent`/`ascent > pMax*0.8` → `pMax = ascent/0.8`）然后 `lineHeight = max(pMax*1.5, pMax*0.8+objDescent)` 驱动 `computeLineSegments` / `startLine`（`:2004`），随后单词队列遍历（`:2109`）带连字符前缀切分（`:2123` `chosen`/`prefixWidth`/`hyphenWidth`）与字形循环（`:2159`），其 `y` 放置（`:2183`）分三臂：对象（`currentY + pMax*0.8 - (height-depth)`）、基线偏移（`currentY + (pMax-gfs)*0.8 - baselineShift`）、普通（`currentY + (pMax-gfs)*0.8`）。`exclusionMask`（`:2155`）与前导空格抑制（`preserveLeadingSpaces` `:796`，`:2180`）按字形；`msdfLayout.ts:154` 镜像相同三臂减去排除区。

值得以 `file:line` 知晓的支撑契约：

- `GlyphAtlas`（`LayoutEngine.ts:58`，`width/baseSize/ast`）与 `EMPTY_GLYPH_ATLAS` vs 新鲜 `{}` 字面量的段落记忆身份（`:83`）。
- `PreparedGlyph`（`:402`，`char/width/style/object/level/sourceIndex/sourceLength/atlasMiss`）——`atlasMiss:true` 仅当 `char.trim().length>0 && !hasGlyph`，因此空白永不标记回退（`prepare` 中 `:1134`）。
- `PreparedWord`（`:433`，`glyphs/width/isWordLike/isWhitespace/breakPoints`）——`width` 为缓存和，`breakPoints` 来自软连字符或 `hyphenate`。
- `ExclusionRect`（`:482`）+ `computeLineSegments`（`:504`）——`O(n log n)` 覆盖 x 区间的补集，按行。
- `LayoutEngine.isComplexScript`（`:584`，保守——过度报告因此仅明显上下文无关文本才有后缀塑形资格）与 `splitParagraphs`（`:566`，`\r\n|\r|\n`，`consumed` 保持源码偏移精确使 CRLF `\r` 永不成为 tofu 字形）。
- `shiftedExtent`（`:668`）被所有三条 `pMax` 遍历共享——行增长逻辑绝不能分歧。
- `suppressLineBreaks`（`:721`，GH-457 `'@'` 连接 + 闭合标点 `.:,;)]}!?` 合并并 `breakPoints` 重基）。
- `LayoutBuffer`（`:2449`，`{ glyphs: PositionedGlyph[], widths: Float32Array, levels: Uint8Array }` 供 `layoutPreparedIntoBuffer` `:2241`，`V8_SMI_MAX` 约束的类型化数组路径，在调用点强制度量/绘制一致）。

### 2.8b 断行、排除流与两端对齐——热遍历放置规则

热遍历是 `PreparedText` 变为 `x/y` 的地方。引擎外三个纯函数与引擎内一个方法支配每个换行决策；它们必须在 `LayoutEngine`（`packages/layout/src/LayoutEngine.ts`）与 `msdfLayout`（`packages/layout/src/msdfLayout.ts`）之间一致，否则 GPU 与 canvas 断行分歧。

- **`computeLineSegments(top, bottom, maxWidth, exclusions)`（`LayoutEngine.ts:504`）**——排除流的可测试核心。`ExclusionRect { x,y,width,height }`（`:482`）与 `LineSegment { x0,x1 }`（`:490`）是唯二类型。纯 `O(n log n)`（块排序）/ `O(n)` 空间：收集与 `[top,bottom)` 重叠且钳制到 `[0,maxWidth]` 的 `exclusions` 的 x 区间，合并触碰/重叠区间，于 `[0,maxWidth]` 内取补。无重叠时返回 `[{0,maxWidth}]`，当矩形（或并集）跨越宽度时返回 `[]`。按行而非按字形计时——在 `layoutPrepared` 内每次 `currentY` 前进调用一次（`:2004` `segs = computeLineSegments(currentY, currentY+lineHeight, maxWidth, exclusions)`）。`hasEx` 守卫（`LayoutEngine.ts:1860`）分流非排除路径（单个全宽段）使常见情况无分配。

- **`suppressLineBreaks(words)`（`LayoutEngine.ts:721`）**——GH-457 放置前合并。规则 1：`'@'`（`glyphs.length===1 && char==='@'`）与后随每个非空白单词合并（`"@vectojs/core"` 保持原子）。规则 2：闭合标点 `.:,; ) ] } ! ?` 永不作行首——向后合并到前一非空白单词（跳过空白单词，因此 `"word !"` 不会产生 `" !"` 伪词）。必须在合并时重基 `breakPoints: number[]`（`:732` `+ offset`，`:791` `+ prev.glyphs.length`）否则软连字符机会落在错误字形索引下游。镜像于 `msdfLayout.ts:195` `isOrphanPunct` / `breakableAnywhere`（CJK `code >= 0x2e80`）逻辑。

- **连字符**——两个来源填充同一 `PreparedWord.breakPoints: number[]`（`LayoutEngine.ts:441`）：源码中软连字符 `U+00AD` 是不可见断行机会（在字形循环 `:1134` 消费 `(breakPoints ??= []).push(glyphs.length)` 且无 advance），可插拔 `LayoutEngine.hyphenate: (word)=>string[]`（`:880`）按 `isWordLike && glyphs.length>3` 单词咨询（`:1144`）——其分段经 `getGraphemes` 重分以计数形而非码元。`hyphenWidth`（`:490`，经 `glyphWidth` 的 `'-'` advance）对每个 `PreparedText` 仅当某单词携带 `breakPoints` 时度量一次（未命中无度量，且在无度量节点中不递增 `unmeasuredGlyphs`）。换行时引擎偏好软断行（`msdfLayout.ts:131` 中 `softBreaks: {at,x}[]`）然后回退到发射 `'-'` 四边形的连字符切分（`msdfLayout.ts:167` `emitHyphen`）。`MSDFTextEntity` 在主线程经注释 `layoutText` 驱动连字符；worker 永不调用回调。

- **`shiftedExtent(gfs, shift, pMax)`（`LayoutEngine.ts:668`）**——被所有三条 `pMax` 遍历共享，使行高永不分歧。行盒高 `1.5 * pMax`，基线 `0.8 * pMax`（与 `Typography.ts:93` 相同切分）。抬升段（`shift>0`，CSS `vertical-align` 正向上，上标）：`need = shift + 0.8*gfs` 必须容纳 `0.8*pMax`；下沉（`shift<0`，下标，与 `InlineObject.depth` 符号相反）：`need = -shift + 0.2*gfs` 必须容纳 `0.7*pMax`。例：`0.75em` 上标偏移 `~0.3em` 容纳于 `0.8*(pMax-gfs)` 余量且不增长；远偏移将 `pMax` 增至 `need/0.8` 或 `need/0.7`。每次两端对齐与排除前进都对最终 `pMax` 重算。

- **`justifyLines(wrapClosedLines, lineOf, xCoords, codePoints, advances, maxWidth, maxLineWidth)`（`msdfLayout.ts:11` + `LayoutEngine.ts:1937`）**——将每个软换行拉伸到 `maxWidth` 齐平。策略：按 `lineOf` 分组 `indices`，跳过 `wrapClosedLines` 未命中（每段落末行、显式换行与 `hitMaxHeight` 截断），然后 `slack = maxWidth - (xCoords[lastIdx]+advances[lastIdx])` 封顶为行跨度一半（防止极短行怪异拉伸）。含空格行等分加宽词间 `0x20` 间隙（`extra = slack / spaceIdx.length`，`shift` 累加器 `:58`）；无空格 CJK 行在每字形间分发 `slack / lastContent`（`:70`）。多段排除行不两端对齐（`LayoutEngine.ts:1937` 单段守卫）。必须在 `LayoutEngine` 与 `msdfLayout` 间镜像——两端对齐宽度是内容投影为 `positionedRuns` vs `logicalRuns` 复用的契约。

### 2.9 `packages/layout/src/measure.ts:39` — 度量器选择

- `createCanvasMeasurer(family, baseSize=100)`（`:39`）——`getSharedMeasuringContext()`（`:44`），按字形 `Map<string,number>` 缓存于 `baseSize`，线性缩放 `base * (size/baseSize)`（`:68`）。按段 `family/bold/italic` 键防止污染。
- `createMetricsMeasurer(family)`（`:96`）——已注册 `FontMetricsSource`（`:106` 懒解析带版本化 `fontMetricsVersion` 比较，按字形查找 +13% 开销 vs 在 `normalizeFamily` 内分配）。按段 `family` 覆盖在该段未注册时回退到基础源，而非 `0.5em`。粗体/斜体有意忽略（每族单 advance 表）。
- `resolveGlyphMeasurer`（`:161`）——canvas 胜过 metrics 胜过 `null`（按设计：它度量渲染器绘制内容，包括合成字重；陈旧注册不应覆盖真值）。

### 2.10 `packages/layout/src/msdfLayout.ts:93` — 供 worker 的 MSDF 换行

纯函数 `computeMSDFLayout(request, font)`（`:93`）由 worker 与主线程回退共享（运行时无导入——esbuild 经 `LayoutWorkerSource.ts` 将其内联进 `LayoutWorker.ts`——因此主线程回退不可能与 worker 分歧）。`LayoutEngine.layoutPrepared` 的扁平数组对应物，无排除/按字形碰撞回调/富样式：消费 `font.glyphs[].advance/kerning`（`byCode/kern`）、`metrics{ascender,descender,lineHeight}`（缺省时回退 `0.8/-0.2` `:118`）、atlas `aw/ah/yOrigin`（`:103`）作 UV 几何，但永不读取 `planeBounds/atlasBounds`——那些属于核心侧 `MSDFFont.layout`。遍历 `Array.from(text)`（`:176`，码点安全），按字形以 `kernKey(prevCode,code)`（`:192` `+ k*fontSize`）+ `letterSpacing`（`:121`）前进 `curX`，非空格标记零 advance 镜像 `MSDFFont.ts:132`，连字符/孤字标点 `isOrphanPunct`（`:201`，与 `suppressLineBreaks` 相同集合）与 `breakableAnywhere`（`:195`，CJK `>=0x2e80`），`wrapClosedLines: Set<number>`，`softBreaks: {at,x}[]`（`:131`），`lineOf: number[]`（`:107`），`xCoords/yCoords: number[]`，`packedStyles: number[]`（`:104`，打包 `TextStyle` 位），`advances: number[]`（`:110`），`codePoints: number[]`（`:101`），`maxLineWidth`（`:114`）。换行时（`breakLine` `:140`，`dropFrom` `:155`，`emitHyphen` `:167`），`justifyLines(wrapClosedLines, lineOf, xCoords, codePoints, advances, maxWidth, maxLineWidth)`（`:11`）拉伸词间 `SPACE(32)` 间隙（`:44`）或在无空格 CJK 上于每字形间分发 `slack/lastContent`（`:70`），两者封顶为行跨度一半以避免极短换行怪异拉伸。

### 2.11 Worker 线程外模型

**边界**：`LayoutWorker.ts:4`（`LayoutWorkerRequest`：`id/seqId/text/fontId/fontData/maxWidth/maxHeight/fontSize/lineHeight/letterSpacing/textAlign`）与 `LayoutWorkerResponse`（`:24`：`id/seqId/width/height + Uint32Array codePoints / Float32Array xCoords/yCoords / Uint32Array packedStyles + error?:string`）；`postMessage` 中可转移缓冲（`LayoutWorker.ts:111`）。

**Worker**：`packages/layout/src/LayoutWorker.ts:1`——约 115 行，`fontCache: Map<string,MSDFFontData>`（`:42`），`isLayoutWorkerRequest` 校验（`:53`），`isExpectedOrigin`（`:48`），`self.onmessage`（`:76`）→ `fontCache.set` → `computeMSDFLayout(request, font)` → `postMessage(response, [codePoints.buffer, xCoords.buffer, yCoords.buffer, packedStyles.buffer])`。未知字体 → 错误形状零长响应（`LayoutWorker.ts:92`）而非静默丢弃。

**Manager**：`packages/layout/src/LayoutWorkerManager.ts:28`——单例（`getInstance` `:206`），`createWorker`（`:67`）经 `new Blob([WORKER_SOURCE_STRING])` + `URL.createObjectURL`（`LayoutWorkerSource.ts`；镜像 `MarkdownWorker` CSP 守卫：`typeof Worker/Blob/URL` 缺失 → `null` → 主线程回退而非抛出）。`onmessage` 以 `${id}-${seqId}`（`:99`）匹配 `pendingCallbacks: Map<string,PendingLayout>`（`:34`），重置 `consecutiveWorkerFailures`（`:109`）。`onerror/onmessageerror` → `handleWorkerFailure`（`:120`），`MAX_CONSECUTIVE_WORKER_FAILURES=2`（`:19`）后 `workerUnavailable=true` → 留在主线程（CSP `worker-src 'none'` 实测 2026-07-31：六次 `queueLayout` 调用产生六个 Worker，零布局）。`fontDataById`（`:043`，终身保留，区别于 worker 死亡时清空的 `registeredFonts`）让调用方仅传一次 `fontData` 时回退布局仍可工作。`warnedUnknownFonts`（`:049`）静默重复控制台警告。`queueLayout(entityId, opts, callback)`（`:224`）50 ms 防抖（`:314` `setTimeout(runLayout,50)`）并比较 `seqIdCounter` 使迟到回复被忽略；`cancelLayout/cancelLayoutForEntity`（`:220`/`:319`）排空计时器与 `prefix === ${entityId}-` 待处理映射条目。`resolvePendingOnMainThread`（`:144`）在 worker 死亡时直接重放每个待处理 `computeMSDFLayout`。`errorResponse`（`:176`）合成未知字体回复形状。

**消费者**：`packages/core/src/text/MSDFTextEntity.ts:25`——`queueLayout()`（`:204`）调用 `LayoutWorkerManager.getInstance().queueLayout(this.id, { id, seqId: ++seqId, text: layoutText, fontId: font.id, fontData: font.data, maxWidth/maxHeight/fontSize/lineHeight/letterSpacing/textAlign }, cb)`；`seqId` 按实体单调，`lastRenderedSeqId`（`:048`）丢弃陈旧回复，`contentEpoch`（`:051`）跳过未变同步，`rebuildProjectionLines()`（`:273`）为 `getContentProjection()`（`:248`）重建 `projectionLines: ContentProjectionLine[]`。连字符在主线程经注释 `layoutText` 与 `U+00AD` 运行（无法克隆进 worker）。`watchAtlasDecode`（`:106`）等待 atlas 图像解码；`SVGEntity.ts` 是姊妹非文本实体。

### 2.12 基准、对比与数字如何产生

文本布局有两项诚实代价：**冷**（分段+度量）与**热**（放置）。将合并冷+热调用与仅热对比会凭空捏造差距。仓库在三处强制可公平对比拆分：

- **`benchmarks/text-layout-pretext`** 与 **`comparisons/text-layout-pretext/*`**（`entry.ts:1`，`page/*`，`serve.ts`，`build.ts`）——`@vectojs/layout` vs `@chenglou/pretext`。两者经 `canvas measureText` 在真实浏览器中度量（见 `comparisons/text-layout-pretext/entry.ts:1` 表头：V8 vs Gecko 不同且仅有头 GPU 加速窗口可引用——`hyprland-browser-bench` 拥有该 harness）。`prepare` vs `prepareWithSegments`（冷）与 `measurePrepared` vs `layout`（热）是唯一可比半区；`layoutPrepared` / `layoutText`（定位每字形）无 pretext 对应物，单独报告。
- **`scripts/compare-pretext.ts:1`**——由 `benchmarks/bench.ts` 运行的无头对应物。打包 `vectojs core` + `pretext` 为 IIFE 经 `Bun.build`，注入 Playwright 控制的 Chrome，经 `Range.getClientRects().length` 按语料/字体建立 DOM 真值，然后报告行数错误 vs 真值及冷/热吞吐。记录自身历史：直到 2026-08-04 它将合并的 `layoutText()` 与 pretext 热 `layout()` 计时，并在 `vectojs-docs/testing-catalog.md:A6` 被标记为“尚未可公平对比”。
- **`vectojs-docs/forge/baselines/*`**——harness 产生的半官方基线（`glyph-batch-*.json`、`content-projection-frontload-*.json` 等）。并非全为文本布局：`glyph-batch` 是共享 `LayoutBuffer` 宽度路径的 WebGL 字形上传代价，`markdown-stream-*` 捕获流式期间 lex+布局交互。每个携带 `commit`、CPU/GPU/驱动环境与 `refreshHz` 经 `benchmarks/run-browsers.sh`，以便后续比较可归一。

**本地重跑方式**（无头、不可引用但对回归有用）：`bun run scripts/compare-pretext.ts`（Playwright + `google-chrome-stable`）打印 markdown 表并写 `scripts/.compare-results.json`。可引用数字：工作区根 `benchmarks/run-browsers.sh`（在专用 Hyprland 工作区驱动真实 Chrome/Firefox，校验 COOP/COEP、饥饿检测）。

## 3. 它在 `packages/core` 下如何组合

`MSDFTextEntity.text` → `rebuildLayoutText()`（`:187`，注释软连字符）→ `queueLayout()`（50 ms 防抖）→ `LayoutWorkerManager`（worker 或主线程）→ `computeMSDFLayout` → 类型化数组 → `MSDFTextEntity.layoutResult` + `projectionLines` → WebGL `setMSDFTexture`/`addGlyph` 按 `PositionedGlyph`，`getContentProjection().lines` 供无障碍，`CanvasGeometry` DPR 补偿。

`Text`/`RichText`（`@vectojs/ui`）经 `LayoutEngine` + `measureContext` 直接走（canvas 路径）。相同不变量，不同度量器。

### 2.13 `GridTextEntity` 脚注——保留网格 vs 保留散文

`packages/core/src/components/GridTextEntity.ts:4`（`class n extends Entity`，`GridTextEntity`）是遗留等宽网格实体（固定 `charWidth/charHeight`，`updateGrid(ascii[])` `:23`，`render` `:36`）。它早于 `prepareContentGrid` 且**不**流动双向、塑形阿拉伯语或遵循 `PreparedContentGrid`——它是直接 `IRenderer.fillText` 循环（`:44`）遍历 `ascii: string[]`。对需要双向/CJK/网格无障碍的任何需求，现代替代是 `prepareContentGrid`（`packages/text/src/PreparedContentGrid.ts:243`）及其内容网格投影（`01-selection.md` §3.3）。`GridTextEntity` 保留为“绘制等宽的最简单物”并出现于 `packages/core/test/GridTextEntity.test.ts` 与 `packages/core/src/index.ts:n`。

## 4. 难点——有度量的失败

### 4.1 分离 canvas 字体解析（仅 Firefox）

可通过 `Intl.Segmenter`（`LayoutEngine.ts` 中单词 `:916` / 字形 `:917`，`PreparedContentGrid.ts` 中 `:76`）、`BidiResolver` / `BiDi`（`BidiResolver.ts:3` `bidi-js`）、`registerFontMetrics`（`fontMetrics.ts:82`，在 `Typography.ts:67` 经 `getFontMetrics` 直接调用并从 `measure.ts:75` 间接）、`cold/hot split`（`LayoutEngine.ts:459`–`1848`，以 ** 注释与 `measurePrepared` / `layoutPrepared` / `layoutPreparedIntoBuffer` 三联）、`zero-GC`（`LayoutEngine.ts:2241` `layoutPreparedIntoBuffer` + `msdfLayout.ts:1` 扁平数组 + `BidiResolver.reorderSegments` `:121`）。审计排除流是 `computeLineSegments` `:504` 与 `ExclusionRect` `:482`；DPR 量化是 `PAGE_SCALE_BASIS_PX = 256`（`ContentProjectionManager.ts:71`）。

见 §2.3 表（`packages/text/src/measureContext.ts:18`）：整体 advance 短 20–47%。修复是挂载；残余 0.3%（`131.579` vs `132.000`）是 Gecko 对整数设备 px 的网格对齐，不可逃逸（`text-rendering: geometricPrecision` 实测相同，`:34`）。通过搜索分离 canvas 创建（`grep -rn 'createElement.*canvas'` `packages/`）审计。`OffscreenCanvas` 非修复——它与 DOM 布局（`132.000`）而非已绘制 canvas（`131.579`）一致。

### 4.2 CJK vs 拉丁度量

`0.5em` 回退在 32 px 下对窄字形实测 `+125%` 误差、对宽字形 `-47%`（`packages/layout/src/LayoutEngine.ts:973` 注释）。`EMPTY_GLYPH_ATLAS`（`:83`）配合真实 `resolveGlyphMeasurer` 治愈断行错误；带已注册 `MSDFFont` 的 `createMetricsMeasurer` 治愈 SSR/无头。同一段落中混合 `CJK | Latin` 落入同一 `layoutPrepared` 运行；`GlyphMeasurer` 按段 `fontFamily/bold/italic` 键控，因此等宽嵌入于比例字体中使用自有 advance，`styleSig` 包含每个影响 advance 的 `TextStyle` 字段。

### 4.3 BiDi 重排 vs 选区顺序

`reorderIndices` 是桥梁：逻辑→可视（高亮矩形的 `logicalToVisualRuns` `:62`）、可视列→逻辑用于命中测试、绘制顺序的 `reorderVisual`（`:89`）。`PreparedContentGrid` 以逻辑顺序保持 `cells` 并带可视 `x`（`packages/text/src/PreparedContentGrid.ts:315`）；选区偏移是源码（逻辑）偏移而非可视索引。见 `tmp/boss-research/01-selection.md` §3.2/§4.1 的逐字形载体 + `shapedPaint` 一半契约与 `forge/findings/text-richtext-and-markdown.md:356`（InlineObject）中 `buildVisualLineGroups` 按 `node.y + height*0.8` 分组并将 chip 拆为独立行的位置。

### 4.4 单段落中混合字体回退

一段落样式 `family: 'Noto Sans'` 带 `family:'monospace'` 代码段。`GlyphMeasurer.measure(char,size,'monospace')`（`packages/layout/src/measure.ts:60`）以该族度量；未知段族回退到基础源而非 `0.5em`（`:138`）。段落记忆 `styleSig` 包含 `fontFamily`（直到 2026-07-30 缺失，仅因空 atlas 抖动使缓存保持 0 命中而潜伏）。测试：`benchmarks/text-layout-pretext` / `comparisons/text-layout-pretext` 与 `scripts/compare-pretext.ts:1`（冷/热可公平对比，以 `Range.getClientRects` 行数真值）。

### 4.5 DPR 敏感 advance

Canvas advance 网格对齐到设备 px；`LayoutEngine` `shiftedExtent` / `cssLineBoxBaseline` 使用独立于 DPR 的 `0.8` ascent 比。CodeBlock atlas 曾在首次构造时捕获 `devicePixelRatio`（`packages/markdown/src/Markdown.ts:1358`，`GlyphRasterAtlas.ts:139` `readonly dpr`）并在缩放后模糊（`forge/findings/text-richtext-and-markdown.md:724`，`sceneDpr 4.286 / atlasDpr 1.579 → blitScale 2.71`）。修复：将 `Scene.watchDevicePixelRatio()`（`Scene.ts:2805`）馈入 atlas DPR。经 `maxGradient`（峰值边缘）而非均值亮度（被细单倍字形混淆，2.71× 失配时实测 `0.216→0.251` 反向）重验。DPR 钳制 `min(dpr,3)` 于 `Atlas.ts:139` 是独立上限——即使正确重建在 `4.286` 面板上也无法超过 3。

### 4.6 行尾归属与 CRLF 幽灵字形

`splitParagraphs`（`LayoutEngine.ts:566`）正则 `/\r\n|[\r\n]/g` 与 `MSDFFont.layout`（`MSDFFont.ts:213`）都在任何 `ArabicShaper`/`BidiResolver`/`glyphWidth` 步骤**之前**消费分隔符并记录 `consumed`（`:569` `m[0].length`）以保持 `sourceIndex` 连续。朴素 `text.split('\n')` 将 `\r` 遗留为段落末字符：它被塑形、度量并作为可见 tofu 以 `missingAdvance*size` 放置，且后续每个 `sourceIndex` 因每 CRLF 偏差 1。`PreparedContentGrid.sourceLines`（`:197`）携带相同契约（`sourceEnd` 排除断行，`nextSourceStart` 拥有它）并在 `source` 以断行结束时额外插入显式尾空行（`:217` `if (start===source.length)`）。测试：`benchmarks/text-layout-pretext` 为 DOM 真值将源码归一到 `\n` 但单独度量原始源码；对等意味着原始 `"\r\n"` 源码产生与 `"\n"` 源码相同 `totalHeight` 与 `sourceIndex` 覆盖，仅每行 `sourceLength` 间隙 1。

### 4.7 连字符 + 孤字标点 + 两端对齐必须按序组合

冷：软连字符 `U+00AD`（`LayoutEngine.ts:1134`）与 `hyphenate` 回调（`:1144`）都贡献到 `PreparedWord.breakPoints`（`:441`）；`hyphenWidth`（`:490`）仅对有任一的单词度量一次。热：`suppressLineBreaks`（`:721`）在合并时重基 `breakPoints`，因此 `"@vectojs/core"` 内连字符切分不会落在现已原子 token 的中部；单词队列遍历（`:2109` 起）在回退到整词换行前偏好前缀连字符（`chosen` 扫描 `:2133`）。后果：`wrapClosedLines`（`msdfLayout.ts:125`）与 `justifyLines`（`:11`）都读取最终断行决策，因此只修其一会产生已度量宽度（供投影）与其放置 `x`（供墨迹）不一致的两端对齐行。`LayoutEngine` 与 `msdfLayout` 都复制连字符 `+ letterSpacing` + 孤字逻辑——改一处不改另一处是常见回归。

## 5. 开发者必须保持的不变量

1. **在哪绘制就在哪度量。**使用 `getSharedMeasuringContext()`（`packages/text/src/measureContext.ts:87`）。搜索游离 `document.createElement('canvas')` 而无 `appendChild`。
2. **冷在前，热在后，绝不为 DOM 重新分段。**`prepare`/`prepareRich` 一次，`layoutPrepared` 多次（`packages/layout/src/LayoutEngine.ts:1080` `/` `:1266` `/` `:1848`）。重新分段会使断行与双向顺序偏移。
3. **每个影响 advance 的字段都在 `styleSig`。**若它到达 `glyphWidth` 则到达 `styleSig`/`fingerprint`（`:1266:styleSig`）。遗漏其一潜伏至段落缓存恢复命中率。
4. **`InlineObject` 身份包含 `key`。**两个 `U+FFFC` 即使 `alt/width/height` 相同但 `paint` 不同则必须在 `key` 上不同，否则第二幅绘制第一幅图像（`packages/layout/src/LayoutEngine.ts:268`）。
5. **Worker 是优化，永非必需。**`LayoutWorkerManager` 在两次连续失败或缺 `Worker` 后退化到调用线程的 `computeMSDFLayout`（`:144`）。未知字体 → 类型化错误，永不挂起回调（`:176`）。
6. **`indexMap` 与 `sourceIndex` 保持字节忠实。**阿拉伯塑形索引映射（`packages/text/src/ArabicShaper.ts:91`）是真值；`LayoutNode.sourceIndex/sourceLength` 索引原始字符串而非塑形文本，因此无障碍可用 `InlineObject.alt` 替代而不使后续偏移错位（`forge/findings/text-richtext-and-markdown.md:372`）。
7. **版本化度量注册表。**`fontMetricsVersion()`（`packages/text/src/fontMetrics.ts:64`）必须在缓存 `FontMetricsSource` 前读取；进程中替换某族度量是真实代码路径（Web 字体交换、纠正数据）。
8. **`0.5em` 意味着未度量——计数它。**在测试/SSR 中观察 `unmeasuredGlyphCount()`（`packages/layout/src/LayoutEngine.ts:31`）；非零意味着捏造断行，而非仅缺 atlas 字形（`fallbackToCanvas` 在几乎每个 `Text`/`RichText` 段落为 true，对质量毫无说明）。

## 6. 如何在不破坏度量对等的情况下添加新脚本或样式

**新脚本（如泰语、天城文）：**

1. 对语料运行 `isComplexScript`（`packages/layout/src/LayoutEngine.ts:584`）——该谓词门控流式 `shapeSimpleRun` 快捷（`:1358`）。任何上下文敏感脚本必须返回 `true` 使段落走完整 `shapeArabic`+`BidiResolver` 路径；否则后缀塑形器独立塑形字形并静默断开连接文本。
2. 若标记对塑形为 TRANSPARENT，则一起添加到 `ArabicShaper.isHarakat`（`:70`）与 `MSDFFont.isNonspacingMark`（`:132`）——它们是必须一致的叶子包。
3. 添加 advance 覆盖：MSDF atlas 字形或已注册度量（`registerMSDFFontMetrics`，`packages/text/src/fontMetrics.ts:97`）。无任一则 `unmeasuredGlyphs` 计数每个字符，断行为 `0.5em` 猜测。
4. 以混合新脚本与 CJK+Latin 的行用 `auditSceneSelection`（`packages/devtools/src/selectionAudit.ts`）验证——间隙预算是 `PAGE_SCALE_BASIS_PX = 256` 量化（`ContentProjectionManager.ts:71`），因此按邻居改变 advance 的脚本在那里不可见。

**新 `TextStyle` 字段：**

1. 问：“它是否改变 `glyphWidth`？”若渲染器将其作为偏移/装饰绘制而不改变保留 advance（`underline`、`lineThrough`、`highlightColor`），无需对等工作。若它改变已度量 advance（`fontSize`、`fontFamily`、`bold`、`italic`、任何选择不同 `measure` 路径的），则必须包含于 `styleSig`/`fingerprint`（`packages/layout/src/LayoutEngine.ts:1266`）与 `styleRangeEquals`（`:682`）。
2. 将字段一起添加到样式相等与签名——仅测其一会留下另一作为记忆污染（不同段落碰撞，同段落永不命中）。
3. 若字段使字形垂直移出 `0.8 * pMax`（ascent）/ `0.7 * pMax`（descent），则经 `shiftedExtent`（`:668`）添加类似 `baselineShift` 的垂直增长；所有三条 `pMax` 遍历必须调用它。

**新断行规则：**

- 位于 `suppressLineBreaks`（`:721`）或 `justifyLines`（`packages/layout/src/msdfLayout.ts:11`）。保持连字符 `breakPoints` 在合并时偏移（`:732` `+ offset`，`:791` `+ glyphs.length`）。换行状态（`wrapClosedLines`、`lineOf`、`softBreaks`）在 `LayoutEngine` 与 `msdfLayout` 间复制——两者都改。

### 4.8 垂直混合——`baselineShift` 与内联对象

**`TextStyle.baselineShift`（`LayoutEngine.ts:146`，px，`positive = UP`，CSS `vertical-align` 约定）**——水平仅渲染（advance 不变）但垂直为度量变化。值适度到可容纳 `0.8/0.7 * pMax` 余量则行高不变（`0.75em` 上标 `+0.22em` 为常见情况）；会使字形置于行盒外的偏移驱动 `shiftedExtent`（`:668`）增长 `pMax`，且增长值传播到每个 `currentY` 前进与 `computeLineSegments` 调用——因此_此_行与下一行间距加宽，恰如高内联对象所迫。调用方不得自行预留垂直空间；引擎在一处一次性完成，否则三条 `pMax` 遍历不一致，`measurePrepared` 报告高度与 `layoutPrepared` 绘制不同。

**`InlineObject`（`LayoutEngine.ts:216`，`StyledSpan.object` `:343` 要求 `text===OBJECT_REPLACEMENT`）**——三个数字，全部为**最终尺寸的 px**（不按段 `fontSize` 缩放，不似字形 advance）：`width`（水平 advance）、`height`（总盒）、`depth`（基线以下，正向下——与 `baselineShift` 符号相反）。引擎预留 `width`，在 `shiftedExtent` 增长中计入 `height/depth`，并报告已定位 `LayoutNode.object` 盒（`x/y` 已含 `depth`）；它永不调用 `object.paint(surface, box)`（`:301`）——文本渲染器按每 `LayoutNode.object` 调用一次。陷阱：`alt` 经 `RichText.accessibleText`（`collectSpans` 以 `alt` 替代 `U+FFFC`）到达无障碍，但 `copy/selection` 仍以单字符哨兵在 `sourceText` 空间索引，因此 `alt` 长度不使后续 `sourceIndex` 运算错位。同一症状的第二陷阱：`paint` **非**段落记忆键一部分（每调用闭包会使命中永为 0）——当 `paint` 不同时替代 `InlineObject.key`（`:259`）必须不同，否则两徽章同 `alt` 共享缓存段落，第二幅绘制第一幅图像（再现于 `forge/findings/text-richtext-and-markdown.md` 无障碍/InlineObject 条目）。

### 4.9 流式代价与为何仅后缀塑形并非耗时所在

`LayoutEngine.streamShapeCache`（`:839`，`isComplexScript` `:584` 门控，`shapeSimpleRun` `:1644`）与段落记忆（`:829`/`833`）一起引入，以将增长 Markdown 块（`Markdown.ts:899` 流式 `appendMarkdown`）的按块代价从 `O(length)` 降至 `O(appended)`。在 346 KB 合成文档（`forge/findings/text-richtext-and-markdown.md:356`）上实测：**相同代价 2630 ms vs 2639 ms**。真实 Markdown 段落有界——现有记忆化已封顶按段落重塑——因此仅后缀塑形仅对病态单一巨大段落有帮助。该发现作为正确性胜利保留（其 `isComplexScript` 谓词与 `styleRangeEquals`/`objectRangeEquals` 检查防止静默连接文本断开）但**未**作为独立 `@vectojs/core` 发布的性能修复发布。诊断流式时间时，`prepareRich` + `measureText` + 内容投影同步（`forge/findings` 2026-07-20 条目：`perf.ts` `requestAnimationFrame` 差值）重要；MSDF 改变字形_绘制_，`64fps→120Hz` 是独立路径。

## 5b. 扩展不变量（由 §5 展开）

1. **在哪绘制就在哪度量。**使用 `getSharedMeasuringContext()`（`packages/text/src/measureContext.ts:87`）。搜索游离 `document.createElement('canvas')` 而无 `appendChild`。
2. **冷在前，热在后，绝不为 DOM 重新分段。**`prepare`/`prepareRich` 一次，`layoutPrepared` 多次（`packages/layout/src/LayoutEngine.ts:1080` `/` `:1266` `/` `:1848`）。重新分段会使断行与双向顺序偏移。
3. **每个影响 advance 的字段都在 `styleSig`。**若它到达 `glyphWidth` 则到达 `styleSig`/`fingerprint`（`:1266:styleSig`）。遗漏其一潜伏至段落缓存恢复命中率。
4. **`InlineObject` 身份包含 `key`。**两个 `U+FFFC` 即使 `alt/width/height` 相同但 `paint` 不同则必须在 `key` 上不同，否则第二幅绘制第一幅图像（`packages/layout/src/LayoutEngine.ts:268`）。
5. **Worker 是优化，永非必需。**`LayoutWorkerManager` 在两次连续失败或缺 `Worker` 后退化到调用线程的 `computeMSDFLayout`（`:144`）。未知字体 → 类型化错误，永不挂起回调（`:176`）。
6. **`indexMap` 与 `sourceIndex` 保持字节忠实。**阿拉伯塑形索引映射（`packages/text/src/ArabicShaper.ts:91`）是真值；`LayoutNode.sourceIndex/sourceLength` 索引原始字符串而非塑形文本，因此无障碍可用 `InlineObject.alt` 替代而不使后续偏移错位（`forge/findings/text-richtext-and-markdown.md:372`）。
7. **版本化度量注册表。**`fontMetricsVersion()`（`packages/text/src/fontMetrics.ts:64`）必须在缓存 `FontMetricsSource` 前读取；进程中替换某族度量是真实代码路径（Web 字体交换、纠正数据）。
8. **`0.5em` 意味着未度量——计数它。**观察 `unmeasuredGlyphCount()`（`packages/layout/src/LayoutEngine.ts:31`）；非零意味着捏造断行，而非仅缺 atlas 字形（`fallbackToCanvas` 在几乎每个 `Text`/`RichText` 段落为 true，对质量毫无说明）。
9. **`\r` 与 CRLF 永不塑形。**`splitParagraphs`（`LayoutEngine.ts:566`，`PreparedContentGrid.ts:197`）与 `MSDFFont.layout`（`MSDFFont.ts:213`）都在任何塑形/度量步骤前拥有行尾；溜进的 stray `\r` 会成为带幽灵宽度与错误 `sourceIndex` 的已定位字形。
10. **零 GC 镜像分配——保持 BiDi 遍历同步。**`layoutPreparedIntoBuffer`（`:2241`）必须应用与 `layoutPrepared` 的 `reorderVisual`（`:89`）相同的 `BidiResolver.reorderSegments`（`BidiResolver.ts:121` 类型化数组）置换，并镜像 `shiftedExtent`/`computeLineSegments`/`justifyLines`。此处漂移静默至双向段落被滚动。

## 6b. 扩展指南（由 §6 展开）

**新脚本（如泰语、天城文）：**

1. 对语料运行 `isComplexScript`（`packages/layout/src/LayoutEngine.ts:584`）——该谓词门控流式 `shapeSimpleRun` 快捷（`:1358`）。任何上下文敏感脚本必须返回 `true` 使段落走完整 `shapeArabic`+`BidiResolver` 路径；否则后缀塑形器独立塑形字形并静默断开连接文本。
2. 若标记对塑形为 TRANSPARENT，则一起添加到 `ArabicShaper.isHarakat`（`:70`）与 `MSDFFont.isNonspacingMark`（`:132`）——它们是必须一致的叶子包。
3. 添加 advance 覆盖：MSDF atlas 字形或已注册度量（`registerMSDFFontMetrics`，`packages/text/src/fontMetrics.ts:97`）。无任一则 `unmeasuredGlyphs` 计数每个字符，断行为 `0.5em` 猜测。
4. 以混合新脚本与 CJK+Latin 的行用 `auditSceneSelection`（`packages/devtools/src/selectionAudit.ts`）验证——间隙预算是 `PAGE_SCALE_BASIS_PX = 256` 量化（`ContentProjectionManager.ts:71`），因此按邻居改变 advance 的脚本在那里不可见。

**新 `TextStyle` 字段：**

1. 问：“它是否改变 `glyphWidth`？”若渲染器将其作为偏移/装饰绘制而不改变保留 advance（`underline`、`lineThrough`、`highlightColor`），无需对等工作。若它改变已度量 advance（`fontSize`、`fontFamily`、`bold`、`italic`、任何选择不同 `measure` 路径的），则必须包含于 `styleSig`/`fingerprint`（`packages/layout/src/LayoutEngine.ts:1266`）与 `styleRangeEquals`（`:682`）。
2. 将字段一起添加到样式相等与签名——仅测其一会留下另一作为记忆污染（不同段落碰撞，同段落永不命中）。
3. 若字段使字形垂直移出 `0.8 * pMax`（ascent）/ `0.7 * pMax`（descent），则经 `shiftedExtent`（`:668`）添加类似 `baselineShift` 的垂直增长；所有三条 `pMax` 遍历必须调用它。

**新断行规则：**

- 位于 `suppressLineBreaks`（`:721`）或 `justifyLines`（`packages/layout/src/msdfLayout.ts:11`）。保持连字符 `breakPoints` 在合并时偏移（`:732` `+ offset`，`:791` `+ glyphs.length`）。换行状态（`wrapClosedLines`、`lineOf`、`softBreaks`）在 `LayoutEngine` 与 `msdfLayout` 间复制——两者都改。

## 7. 阅读 + 验证清单

**本 Boss 新人阅读顺序：**
`measureContext.ts:1`（无它则一切不诚实的 invariant）→ `fontMetrics.ts:14` → `Typography.ts:93` → `BidiResolver.ts:27` + `ArabicShaper.ts:18` → `PreparedContentGrid.ts:38`（保留网格对应物）vs `components/GridTextEntity.ts:4`（遗留 `n`）→ `LayoutEngine.ts:916`（`Intl.Segmenter`）→ `:929`（`glyphWidth`）→ `:1080`/`1266` 冷 → `:1848` 热 → `:504`/`:721`/`:668` 放置规则 → `measure.ts:39` → `MSDFFont.ts:151`/`msdfLayout.ts:93` → `LayoutWorker.ts:1`/`LayoutWorkerManager.ts:28` → `MSDFTextEntity.ts:25`。在 `PreparedContentGrid` 后以 `01-selection.md` §§3–4 交叉检查，再回到散文热路径。

**任何可能移动字形的改动后的快速审计：**

- [ ] 触及工作负载上 `unmeasuredGlyphs`（`LayoutEngine.ts:31`）仍为 0（或新标记是原因且现已被 `registerMSDFFontMetrics` 覆盖）。
- [ ] `cacheStats()`（`LayoutEngine.ts:1004`）`hitRate` 未降至 0——每个影响 advance 的样式仍在 `styleSig`/`fingerprint` 与 `styleRangeEquals`/`objectRangeEquals`。
- [ ] 对字距敏感行 + 混合 CJK/emoji 行 + 双向行执行 `auditEntitySelection` / `auditSceneSelection`（`packages/devtools/src/selectionAudit.ts`）——增量保持 `<0.5px`。
- [ ] Worker 回退覆盖：`scripts/compare-pretext.ts:1` DOM 真值（`Range.getClientRects` 行数）仍同时匹配冷（`prepare` / `prepareWithSegments`）与热（`measurePrepared` / `layout`）路径。
- [ ] `\r\n` / 孤立 `\r` 文档渲染行数与其 `\n` 归一孪生相同——无幽灵 `\r` 字形且 `sourceIndex` 跨 CRLF 连续。

## 8. 指引

- 基准：`benchmarks/text-layout-pretext`（`bench.ts`），`comparisons/text-layout-pretext/entry.ts:1`（`corpus()`、`buildAtlas()`、`preparePhase()`/`layoutPhase()`），`comparisons/text-layout-pretext/page/*`，`scripts/compare-pretext.ts:1`（冷/热拆分，`Range.getClientRects` DOM 真值，可公平对比 `measurePrepared` vs `pretext.layout`；另为单 `CanvasRenderer` 计数的亮像素健全检查，`forge/findings:text-richtext-and-markdown.md:564`，警告不要在同一 `Scene` 上双计第二个 `CanvasRenderer`）。
- 基线：`vectojs-docs/forge/baselines/*`（`glyph-batch-chrome-*.json`、`content-projection-frontload-*.json` 等）与 `vectojs/benchmarks/bench.ts`。每个携带 `commit`、CPU/GPU/驱动与 `refreshHz` 经 `benchmarks/run-browsers.sh`。
- 发现（仅追加，永不重写）：`vectojs-docs/forge/findings/text-richtext-and-markdown.md`（23 条——分离 canvas Firefox 2026-08-02 `:461`，`InlineObject.alt` 未达 AT `:364`，三项 GFM 构造静默丢弃 `:508`，代码块 DPR 模糊 `:724`，流式重词法二次方 `:624`，仅后缀塑形否定结果 `:356`——真实文档上相同代价 `2630ms vs 2639ms`，段落有界）。
- 网格路径：`tmp/boss-research/01-selection.md` 终端/编辑器一半与 DPR 量化 / 覆盖层 / 逐字形载体细节不在此重复。
- 实体层：`packages/core/src/text/MSDFTextEntity.ts:25` + `SVGEntity.ts`，`packages/core/src/components/GridTextEntity.ts:4`（遗留 `n`）vs `packages/text/src/PreparedContentGrid.ts:243`（保留网格），`references/text/pretext` 只读克隆，`packages/layout/src/LayoutWorkerSource.ts`（已生成，勿编辑）与 `SPEC.md` 关于 `PositionedGlyph` 四边形的 canvas→GPU 契约。直接基准为对比性而非规范性——pretext 仅文本，VectoJS 馈送字形 + 选区 + 无障碍，因此“谁断行更快”公平而“该用谁”不公平。
