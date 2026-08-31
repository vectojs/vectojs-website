+++
title = "01 — Canvas 原生选区 — 双世界对等"
description = "为何 canvas 没有选区，VectoJS 如何保持绘制世界与 DOM 选区世界的对等，以及守护它的每一项硬核不变量。"
weight = 21
date = 2026-08-29
+++

# 01 — Canvas 原生选区 — 双世界对等

> canvas 是一块位图上的墨迹。浏览器的选区机制——`Range`、`Selection`、`getBoundingClientRect`、`copy`、`find-in-page`、IME——都活在 DOM 中。VectoJS 每一帧都保持两个世界对齐：**视觉世界**（GPU 绘制的内容）与 **DOM 选区世界**（浏览器可选择的内容）。本文档是两者之间的契约。

## 1. 为何 canvas 没有选区

DOM 为文本免费提供了三件事：

1. **命中几何**——`Range.getClientRects()` 返回浏览器对任意子串自行布局后的盒子。
2. **剪贴板来源**——`textContent` + `Selection.toString()` + `copy` 事件为浏览器提供可序列化的线性字符串。
3. **编辑表面**——`<input>` / `<textarea>` 拥有 IME 候选窗口、`compositionstart/update/end` 与 `selectionStart/End`。

`CanvasRenderingContext2D.fillText` 写入的是像素。浏览器无法命名、查找或复制它们。`find-in-page`（Ctrl+F）、`#:~:text=` 片段链接、翻译扩展、阅读模式、屏幕阅读器与爬虫都在遍历 DOM——canvas 对它们全部不可见。任何想要原生选区的 canvas 界面都必须**投影**一层语义 DOM，并使其在几何上与墨迹无法区分。哪怕 0.5 px 的漂移也会让高亮 visibly 滑离字形；一个字符的漂移会复制错误文本；一个字形簇的漂移会破坏 CJK 与 emoji 的光标定位。

失败永远是几何上的——且会与校准叠加。即使逐字形的布局正确，若 `getBoundingClientRect` 被量化（DPR）、`style.font` 是 getter（Chrome 480×），或覆盖层的包含块与合成器竞速（`fixed` vs `absolute`），布局仍会漂移。几何、度量与合成器对齐是一个系统，而非三个。从同一逻辑字符串派生的两个布局若以不同方式度量它（不同的 `measureText` 路径、不同的换行、不同的双向顺序、不同的制表位），就会分歧。VectoJS 文本的规则是：**一次编译，两处消费**——一个保留的几何方案同时供给绘制与投影，绝不做两次独立布局。

## 2. 两个世界

```text
┌──────────────────────────────────────────────────────────────────┐
│  Visual world — canvas                                           │
│  source: string ──► LayoutEngine / prepareContentGrid            │
│       │                    │                                     │
│       │  PreparedText / PreparedContentGrid (immutable, retained)│
│       ▼                    ▼                                     │
│  flushRun / per-glyph fillText / MSDF atlas ──► pixels           │
│  at world transform (a,b,c,d,e,f) × DPR × page zoom              │
└──────────────────────────────┬───────────────────────────────────┘
                                │  same source, same plan, same epoch
                                │  same font, same advances, same x/y
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  DOM selection world — a11y / content layer                      │
│  getContentProjection() ──► ContentProjection                     │
│       │  { text, font, lineHeight, baseline, lines[], grid }     │
│       ▼                                                          │
│  Scene.syncA11y ──► per-line carriers (<span>)                   │
│       │  data-vecto-grid-cell / per-grapheme spans               │
│       ▼                                                          │
│  live DOM Range ──► Selection / copy / find / IME anchor         │
└──────────────────────────────┬───────────────────────────────────┘
                                ↕
               calibrated each frame by CanvasGeometry
               + ContentProjectionManager grid calibration
               + DPR / page zoom compensation (256 px basis)
               + font-epoch / viewport-epoch generation stamping
```

两个世界都源自**同一逻辑来源**（`source: string`）与同一保留几何方案。为 DOM 重新分段会产生第二个布局，其在 CJK 下的断词、双向可视顺序、制表列停靠、行高分布上必然不一致。投影从不重新布局；它复用引擎自有的坐标。

`packages/text/src/PreparedContentGrid.ts` 中的已准备网格与 `packages/layout/src/LayoutEngine.ts` 中的散文在单位上不同（网格单元 vs CSS px）——两者都按单元/字形发射 `x/advance/level`，因此同一套支持 BiDi 的定位可同时服务两者。

承载 carriers 的覆盖层本身就是几何产物。`CanvasGeometry.syncOverlay`（`packages/core/src/tree/scene/CanvasGeometry.ts:1`）通过 `getBoundingClientRect` 保持 `a11yRoot`/`portalRoot` 层与 canvas CSS 盒对齐，包括决定滚动是否需要 JS 补偿的 `position: fixed` vs `absolute` 包含块区别（见 §4.3）。覆盖层的 CSS `transform: scale(cssWidth/width, cssHeight/height)` 将逻辑 Scene 坐标映射到 CSS 盒；内容投影管理器再将逻辑行坐标映射到其上。

## 3. VectoJS 如何桥接

### 3.1 一个保留方案，两类消费者

**散文文档**——`Markdown`（`packages/markdown/src/Markdown.ts`）、`RichText` / `Text`（`packages/ui/src/RichText.ts`、`packages/ui/src/Text.ts`）通过 `LayoutEngine`（`packages/layout/src/LayoutEngine.ts:1`）布局。引擎产出 `LayoutResult`，其中 `nodes: PreparedGlyph[]` 各自携带 `x / y / width / height / sourceIndex / sourceLength / isRTL / style / object`。`RichText.buildVisualLineGroups()`（`packages/ui/src/RichText.ts:668`）按基线（`node.y + 0.8*height`）对字形分组，用 `projectedSlice()`（`packages/ui/src/RichText.ts:506`）切片 `sourceText`，以便内联对象的 `alt` 在 DOM 文本中替代 `U+FFFC` 而 `sourceIndex` 运算保持完整，并发射 `ContentProjection.lines[]`，包含 `runs`、`perGraphemeCarriers`、`shapedPaint`、`lineHeight`、`baseline`、`font`。粗粒度层级（`hint.textOnly`）仅返回 `{ text, font, lineHeight }` 而不构建行——对视口外块为 O(1)。Canvas `render()` 与 `getContentProjection()` 共享同一 `result` 对象；身份（`===`）即失效信号（`packages/ui/src/RichText.ts:259`、`_lineGroupsCache`）。`Markdown` 在文档尺度上做同样的事，将 `Stack` 的 `RichText` 块与受 `contentSemanticBudgetLeft` 门控的物化组合（`packages/core/src/tree/Scene.ts:600`、`DEFAULT_CONTENT_SEMANTIC_BUDGET = 256`）。

**网格类**——终端、编辑器、`CodeBlock`（`packages/markdown/src/markdown-code.ts`）通过 `prepareContentGrid()`（`packages/text/src/PreparedContentGrid.ts:prepareContentGrid`）编译。输入为 `font`（CSS 简写）、`cellWidth`、`lineHeight`、`baseline`、`tabSize`。输出为不可变的 `PreparedContentGrid`（`kind: 'content-grid'`、`revision`、`lines: PreparedContentGridLine[]`），其中每个 `PreparedContentGridCell` 携带 `sourceStart/End`、`sourceCaretOffsets`（合法字形边界）、`glyph`（已塑形）、`x`、`advance`、`level`（双向）。阿拉伯塑形（`ArabicShaper.ts`）与双向重排（`BidiResolver.ts:reorderVisual`）仅运行一次；单元保持逻辑源码顺序，`x` 编码可视顺序。`Typography.cssLineBoxBaseline()`（`packages/text/src/Typography.ts:cssLineBoxBaseline`）通过共享的已挂载上下文从 `fontBoundingBoxAscent/Descent` 推导 canvas 兼容基线——两个世界使用同一值。该网格作为 `ContentProjection.grid` 返回并同时用于绘制与投影；制表、宽 CJK/emoji（`isWideCluster`）、`VS15/VS16` 变体、ZWJ 簇、双向层级、`CR/LF/CRLF` 源码归属（`nextSourceStart`）共享同一方案。

**为何保留很重要。**为 DOM 重新分段会产生第二个布局。在 `compare-pretext.ts` 上实测：朴素的 `0.5em` 回退在日文上偏差高达 50%，而 VectoJS 在给定真实度量时与 DOM 真值达到 0% 行数错误。两个布局永远会不一致；一个方案消除了这个问题。

### 3.2 逐字形载体——唯一正确的粒度

`Scene.syncA11y` 为可选择散文物化每个**字形**一个不可见载体 `<span>`（`packages/core/src/tree/Scene.ts:760` 起，`perGraphemeCarriers` 路径）。每个载体的宽度是该行实际字体下**孤立**字形的 advance；其 `left` 是该索引处已塑形前缀宽度减去累计逻辑偏移。为何逐字形：

- 粗于一个字形的载体已经会失败，因为载体内误差是**字距**，而非网格拟合。混合 CJK+Latin 在**每载体两个**字形时为 −0.582 px（`vectojs-docs/KNOWN_ISSUES.md:137`）。非线性、按簇，无法用统一修正抵消。
- Gecko 将 DOM 布局 advance 网格对齐到整数设备像素，而 canvas `measureText` 保留小数：每字符约 0.36%，线性累积。`text-rendering: geometricPrecision` 与禁用字距/连字实测与 `auto` **完全相同**——没有 CSS 逃生口（`packages/text/src/measureContext.ts:34`、`KNOWN_ISSUES.md:131`）。每字形一个载体是已上线的修复；`Monospace`（均匀 advance）则完全关闭（0 漂移，无需载体）。
- 载体为 `position: relative` + `display: inline-block`，`left = run.x − runningLogicalX` 且按逻辑 DOM 顺序（`packages/ui/src/RichText.ts:584`、`Scene.ts` 逐字形路径）。绝不使用 `absolute`——它会将行内盒块级化（`computed display: block`），而布局感知的纯文本序列化会在每个块盒处断裂：对两端对齐文本，`innerText` 产生 16 个换行而非正确 2 个，0 个空格而非正确 14 个（`KNOWN_ISSUES.md:190`）。流式相对定位保持复制、页内查找与屏幕阅读器将一行读作一行。RTL/双向共享此路径；可视 `x` 来自 `BidiResolver` 层级，DOM 顺序保持逻辑序。

例外是 `ui/Text` 的快速路径：每行一次已塑形的 `fillText`（墨迹包含字距/连字）声明 `ContentProjectionLine.shapedPaint = true`（`packages/ui/src/RichText.ts:shapedPaint`）。其载体刻意使用**已塑形**前缀差——与绘制保持一致（见 §4.1）。两端对齐的行从不使用逐字形载体；它们复用布局自有的 `positionedRuns` 几何（`packages/ui/src/RichText.ts:626`）。

分段本身通过 `Intl.Segmenter` 且 `granularity: 'grapheme'`（`packages/text/src/PreparedContentGrid.ts:graphemes`、`packages/core/src/tree/Scene.ts:graphemeBoundaries`）。回退是确定性的按码点分段器（`fallbackGraphemes`），覆盖组合标记、变体选择器（`VS15/VS16`）、emoji 修饰符、按键帽、区域指示符与 ZWJ。等宽无需分段（单元即字符；`PreparedContentGrid` 对单元网格中的 emoji 仍感知 ZWJ）。

### 3.3 内容网格投影——保留路径

网格载体是携带 `data-vecto-grid-cell` 的 span，附带 `data-vecto-grid-sourceStart/SourceLength/advance/x/level/caretOffsets/font/lineHeight`（`packages/core/src/tree/scene/ContentGridProjector.ts:291`）。它们是：

- **窗口化**——仅视口附近的行挂载（`contentProjectionMargin`，`packages/core/src/tree/Scene.ts:projectedLines` 中 hint `minY/maxY`）。视口外载体为 `display: none` 且无法拦截输入。
- **复用**（`carrier reuse`，`#244`）——流式追加会原地复用未触及行的已校准 `scaleX` 变换（`packages/core/src/tree/scene/ContentProjectionManager.ts:536`）。仅重建尾部的单元处于待校准状态。
- **字体镜像**——`ContentGridProjector` 将字体镜像到 `data-vecto-grid-font`，以便校准将其作为普通字符串读回，而不触碰 `target.style.font`，后者在 Chrome 中每次读取都会重新序列化（`ContentProjectionManager.ts:292`，§4.4）。

网格中的选区作为**源码偏移**快照（`ContentProjectionManager.ts:snapshotGridSelection`、`gridSelectionEndpointOffset`），而非线性 DOM 偏移。`gridSelectionEndpointOffset` 从活的 `Selection.anchorNode/focusNode` 向上遍历到载体单元的 `sourceStart` 并加上单元内偏移，钳制到 `sourceLength`（尾部硬换行与单元同处一个文本节点但不属于任何单元）。源码偏移对换行、窗口化与逐单元 `scaleX` 校准保持稳定；线性偏移 0 表示“当前物化的首行”，会随窗口移动。`gridCaretAtSourceOffset` 通过按逻辑顺序扫描 `data-vecto-grid-cell` 将存储的偏移解析回 `TextCaretPosition`——首个覆盖单元胜出，边界解析为前一单元的末尾（同一光标）。

### 3.4 投影管理器——谁拥有什么

`Scene` 有 6.5k 行；投影按 `forge/decisions/file-decomposition-2026-08.md` 分解：

| 拥有者                                     | 文件                                                       | 职责                                                                                                                                                                                                                    |
| ------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Scene.syncA11y` + `syncContentProjection` | `packages/core/src/tree/Scene.ts`                          | 遍历、脏检查 `ContentSyncState`、每轮同步的四个字段（`_syncSerial`、`contentSemanticBudgetLeft`、`contentSemanticDeferred`、`contentSelectionPresentThisSync`）、`enforceA11yDomOrder`                                  |
| `ContentProjectionManager`                 | `packages/core/src/tree/scene/ContentProjectionManager.ts` | 选区保持（`preserveSelectionAcrossRebuild`、`snapshotGridSelection`/`restoreGridSelection`）、网格校准（`scheduleGridCalibration`）、空白区拖拽锚点（`beginBlankRegionDrag`/`gridSelectionLine`）、世代戳、探针生命周期 |
| `CanvasGeometry`                           | `packages/core/src/tree/scene/CanvasGeometry.ts`           | `clientToScene`、`syncOverlay`、`effectiveDPR`、`sizeGpuCanvas`、`OverlayGeometry` 记忆                                                                                                                                 |
| `ContentGridProjector`                     | `packages/core/src/tree/scene/ContentGridProjector.ts`     | 载体物化、`prepareContentGrid` 消费、data 属性镜像                                                                                                                                                                      |
| `A11yProjectionManager`                    | `packages/core/src/tree/scene/A11yProjectionManager.ts`    | 排序（`enforceA11yDomOrder` 委托）、`pruneA11ySubtree`、`removeA11yRecursively`、`getA11yTree`                                                                                                                          |
| `Entity` 无障碍钩子                        | `packages/core/src/tree/Entity.ts:ContentProjection*`      | `ContentProjection` / `ContentProjectionLine` / `ContentProjectionHint` 类型、`getContentProjection(hint?)` 契约、`contentEpoch`                                                                                        |

四个每轮同步字段一起移动（`DEC-0020`/`DEC-0022` 禁止拆分）。`syncContentProjection`（624 行）留在 `Scene` 上，因为 `syncA11y` 在其递归点调用它——单独抽取任一都需要回边（`DEC-0019` 规则 1）。投影管理器是第 3 次抽取，按 `DEC-0022` 缩小范围；遍历本身仅作为与 `syncA11y` 成对的一次移动。

### 3.5 同步时机——绝不向用户展示半成品 DOM

**每帧：先物化再校准。**校准是两帧的冷批量（`ContentProjectionManager.ts:700` 起）：第 N 帧在远离屏幕处构建探针（`left: -100000px`、`width: 100000px`、`contain: layout style paint`），第 N+1 帧读取 `Range.getBoundingClientRect().width` 并按单元写入 `scaleX`（`element.style.transform = scaleX(...)`）。重叠进行，因此稳态流式（无布局变化的追加）代价仅为一次 `querySelectorAll` 选择器匹配。两次提前退出可完全避免探针：`pendingCells.length === 0`（已校准，`vectoGridReady` 从帧回调发布，绝不同步——在同一任务较早布局的载体否则会给出零宽矩形）与 `measurements.length === 0`（每个待处理单元均为零 advance 或空，立即加戳）。

**读取代价：每轮遍历一次布局，而非每元素一次。** `selectionPresent()`（`ContentProjectionManager.ts:selectionPresent`）将一次 `Selection.anchorNode` 读取记忆为 `presentThisSync`（每轮同步遍历一次强制布局）。`releaseSelectionForRebuild` 在既无被追踪锚点也无活选区时廉价拒绝——批量物化路径（数百块）不付出布局代价。`presentThisSync` 在每轮遍历顶部失效，并在任何释放或 `setBaseAndExtent` 后清除。

**世代戳。**字体世代（Web 字体加载时递增，`createMeasuringContext` 重建）加上 `pageScaleX`（浏览器缩放，基数 256 px）构成校准世代（`ContentProjectionManager.ts:524`，`stamp = fontEpoch:pageScaleX.toFixed(4)`）。一次递增使 `calibrationGeneration` 失效；每个按单元 `scaleX` 隐式失效而无需触碰载体。单元携带 `data-vecto-grid-calib = generation`，因此复用时未触及行保持不动。

**重建风险。**在用户于未改变前缀中拥有选区时替换投影子节点会抹掉它——流式消息在每次追加块时替换其投影子节点。`preserveSelectionAcrossRebuild`（`ContentProjectionManager.ts:preserveSelectionAcrossRebuild`）将端点快照为线性字符偏移（散文为 `projectionAbsoluteOffset`，网格为源码偏移），在空白区拖拽进行时（拖拽中浏览器权威）或拥有元素未包含选区时跳过，然后在 `rebuild()` 后对照新 DOM 重新解析并通过 `Selection.setBaseAndExtent` 恢复。`A11yProjectionManager.ts:211` 中相邻的 `refocus` 快照对 `document.activeElement` 做同样的事；选区直到 `KNOWN_ISSUES.md:232` 的流式折叠修复才有等效处理。

**虚拟化边界。**`contentProjectionMargin`（有限）释放整体视口外的块；`Infinity` 使它们驻留（在 10k 块时约 137 ms 每 `syncA11y`）。浏览器查找覆盖已物化内容；未挂载的虚拟化实体无法被搜索——应用必须让查找目标保持驻留。

**为何预算是 256。**对照两项实测成本确定：每块创建一个 `Span` 约 0.4 ms vs 完成遍历。在 64 时，总耗时约为 6×（`ContentGridPageScaleBasis.test.ts` 时代）而无帧边界收益（`Scene.ts:595`）。256 是两目标不再权衡的点。

**延迟预算。**`contentSemanticBudgetLeft`（`Scene.ts:600`，默认 256 块）限制一次同步遍历，使 10k 块文档在约 285 次而非一次卡顿帧中完成。`contentSemanticDeferred` 持有溢出；`contentViewportEpoch` 确保调整大小时重新分级而不移动块。延迟尾部的载体在轮到之前为粗粒度（`textOnly`）——选区几何随之延迟，这对视口外块是正确的，因为视口外块不可能拥有拖拽。

### 3.6 指针 → 光标：点击如何找到正确的 Text 节点

点击始于视口（`clientX/Y`）且必须落在逻辑 Scene 坐标中的 `TextCaretPosition { node: Text, offset: number }`（`Scene.ts:clientToScene` 仅用于命中测试；投影有自己的逆变换）。

- **散文行**（`Scene.ts:nearestOffsetForPoint`）：给定一行的 `Text` 节点，枚举 `graphemeBoundaries()`（与 §3.2 相同的 `Intl.Segmenter`），在每个边界放置折叠 `Range`，调用 `range.getBoundingClientRect()` 获取浏览器自有的字形盒，并通过 `distanceToRectSquared` 选最近者。光标落在合法字形边缘，而非簇内部。`distanceToRectSquared` 针对视口边缘测试，因此行外的未命中仍解析为最近端点。
- **网格单元**（`Scene.ts:gridCellCaret`、`nearestGridPositionInLine`）：单元数据 `level/advance/x/caretOffsets` 给出可视 vs 源码分数。`visuallyRtl = (level & 1) !== 0` 翻转 `visualFraction → sourceFraction`，然后 `caretIndex = round(sourceFraction × (caretOffsets.length−1))`。映射感知 BiDi：RTL 单元最右侧可视点即其逻辑起点。`nearestGridPositionInLine` 对 `localX ∈ [x, x+advance]` 的精确命中预过滤单元，再按水平距离取最近。
- **仿射变换下的网格行**（`Scene.ts:clientToGridLocal`）：快速路径读取置于第 0 行的三个 `data-vecto-grid-basis="origin/x/y"` 标记（`ContentGridProjector.ts:basis markers`）并通过求逆 2×2 基恢复仿射（`determinant = xx*yy − xy*yx`）。回退路径求逆内容根的 CSS `transform`（`parseCssMatrix`）并为 DPR/页面缩放补偿 `canvasRect → logical` 缩放。同一行列式阈值（`1e-9`）同时守卫两者。当行为未旋转/未缩放（`a>0, d>0, |b|,|c| ≤1e-9`）时，`Scene.ts:nearestGridPosition` 跳过完整求逆并以 `localX = (clientX − rect.left)/scaleX` 映射，多一条廉价路径。

三者共享同一词汇：`collectTextNodes` / `projectionAbsoluteOffset` / `projectionCaretAt`（`packages/core/src/tree/scene/content-caret.ts:1`）。后者的 `affinity: 'forward' | 'backward'` 将边界偏移钉在前导或尾随文本节点——即在单元 N 末尾 vs 单元 N+1 起始处恢复选区的区别，实为同一光标。

### 3.7 基线契约：一个数字，两个渲染器

Canvas 文本与内容投影必须在 CSS 行盒内使用相同的基线偏移，否则首行之后的每一行都会累积垂直漂移（在 24 px 时实测约 0.35 em 每行加上第 0 行约 6 px，修复于 CTX-0333/0334）。

`Typography.cssLineBoxBaseline()`（`packages/text/src/Typography.ts:cssLineBoxBaseline`）是唯一来源：`baseline = (lineHeight − ascent − descent)/2 + ascent`。三档：

1. **已挂载 canvas**（`getSharedMeasuringContext().measureText('Mg').fontBoundingBoxAscent/Descent`）——与绘制 canvas 相同字体（见 §4.2 分离注意事项；`Typography.ts:32`）。LRU 512 条目键为 `font\0lineHeight`（`BASELINE_CACHE_MAX = 512`），命中时刷新 LRU。
2. **已注册度量**（`getFontMetrics(family).ascenderEm/descenderEm × size`，`Typography.ts:registeredBaseline`）——当尚无 canvas 或在 SSR 时，采用相同居中公式，使已注册字体与真实浏览器一致。负的 `descenderEm` 翻转为正以匹配 canvas 极性。
3. **回退**——`lineHeight × 0.8`，当字体族无 ascender/descender 时。保持确定性的无 DOM 契约；SSR 与浏览器仅在回退上不一致，而非布局缺失。

每个在行盒内居中字体度量的工作流都必须调用它——`RichText.buildVisualLineGroups`、`TextEntity`、`MSDFTextEntity`（当字形与源码 1:1 映射时）、`ContentGridProjector`。在此契约之前，`TextEntity`/`MSDFTextEntity` 使用临时的 `0.8em` 与 `(ascender−descender)em` 间距，并在 Firefox 中与投影错位约 6 px + 0.35 em/行（修复于 CTX-0333/0334）。

### 3.8 度量链：advance 的解析顺序

并非每个环境都有 canvas。三层，按 `resolveGlyphMeasurer()`（`packages/layout/src/measure.ts:resolveGlyphMeasurer`）的优先级咨询：

| 优先级 | 来源                                          | 文件                                                                                         | 度量内容                                                                                                                           | 何时胜出                                                                                         |
| ------ | --------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1      | Canvas（`createCanvasMeasurer`）              | `packages/layout/src/measure.ts:18`                                                          | 按字形 `ctx.measureText(char).width` 于 `baseSize=100`，线性派生（`base × fontSize/100`），缓存键为 `size+family+char+bold/italic` | 有 canvas 的浏览器——度量渲染器实际绘制的字体，包括合成字重                                       |
| 2      | 已注册 MSDF/无 DOM（`createMetricsMeasurer`） | `packages/layout/src/measure.ts:108`、`packages/text/src/fontMetrics.ts:registerFontMetrics` | `advanceEm(char) × fontSize` 或整串 `measureEm(text)`（在按字形无法覆盖字距处）                                                    | Node SSR、无 `OffscreenCanvas` 的 worker、测试——启动时一次 `registerFontMetrics(family, source)` |
| 3      | 回退                                          | `packages/layout/src/LayoutEngine.ts:unmeasuredGlyphs`                                       | 每字形 `0.5em`                                                                                                                     | 最后手段——`unmeasuredGlyphCount()` 报告数量                                                      |

链规则：canvas 刻意胜出（`measure.ts:resolveGlyphMeasurer` 注释）。优先已注册度量会让陈旧注册在拥有真值的环境中覆盖真值。已注册的粗体/斜体被忽略（每族单一 advance 表）；`createCanvasMeasurer` 从真实渲染按字重解析，必须在字重重要时使用。`LayoutEngine`（`packages/layout/src/LayoutEngine.ts:92`）对每个 `StyledSpan` 段以 `fontFamily/bold/italic` 调用度量器，因此行内 `monospace` 或粗体段以自有度量断行。`fontMetricsVersion()` + 按度量器的 `baseVersion` 缓存避免每字形 `normalizeFamily` 分配（曾实测每字形 +13%）。

`EMPTY_GLYPH_ATLAS`（`packages/layout/src/LayoutEngine.ts:EMPTY_GLYPH_ATLAS`、`packages/ui/src/RichText.ts:371`）是冻结身份——而非新鲜 `{}`——因此引擎的段落记忆（`prepareRich` + `prepare`）不会在每次布局时失效（实测 2.68×：200 次 12 段落重布局 88 ms → 32.8 ms，0 → 2388 命中）。

### 3.9 流式与窗口化：选区与文档规模的交汇

`Markdown`（`packages/markdown/src/Markdown.ts:681`）将 `Stack` 的 `RichText` 块组合。两种正交窗口机制与选区交互：

- **`virtualizeBlocks`**（`MarkdownOptions.virtualize`、`Markdown.ts:614`、`virtualOverscan` 默认 800）——视口附近的顶层块挂载；视口外高度为 `RowHeights`（Fenwick 树，`height+blockGap`）。与流式（`createStream`/`appendMarkdown`）不兼容：虚拟化的文档必须完整渲染。调用方每滚动帧驱动 `setVisibleRange`（`ScrollView` 自动如此）。
- **`tableViewportHeight`**（`MarkdownOptions.tableViewportHeight`、`Markdown.ts:652`）——按表格行虚拟化（`Table` 将自身行虚拟化进固定 `viewportHeight`）。独立于块窗口化；在流式中途可用，因为 `Table.appendRows` 懒挂载。适用于每个表格，短表亦然——按构造，两行表也被固定到此高度（`Table` 将 `viewportHeight` 视为 `readonly`）。

`Markdown.streamStats`（`Markdown.ts:951`）——始终在线的廉价计数器——区分**传输**（`tokensPrefixMatched`/`tokensReturned`）与**解析器代价**（`lexerMs`/`sourceCharsLexed`）。旧命名混淆两者，使读者去优化已解决的增量路径。worker 的 `incrementalLex` 跳过稳定前缀的词法分析；退化形状（两种 `DegradeReason` 情况）仍按追加支付 O(document)——`sourceCharsLexed` 跟踪文档长度即信号。`stablePrefixChars` 由 worker 自有的 `IncrementalLexCache.stableOffset` 发货，而非按响应重新求和（曾对 n 块流为 O(n²)，#657）。

`CodeBlock`（`packages/markdown/src/markdown-code.ts`）与展示数学（`MathBlock`，`packages/markdown/src/markdown-math.ts`）**并非**注册表围栏块渲染器（`Markdown.ts:138`）。注册表接收 `(source, lang, options)`，但两条路径都需要实例状态——`subscribeInlineMathRepaint` 与 `subscribeInlineMathRaster` / `subscribeInlineImageRaster` 用于 `onDemand` 场景，加上让公式可达选区/查找/复制的单一对象 `RichText`。注册表拷贝曾静默分歧（`MathBlock` 以 `(mathRender, source, ...)` 构造而签名是 `(formula, svgUri)`），破坏 7 项测试（`Markdown.ts:154`）。注册表是针对包未实现语言的扩展点。

复制相关：`Table` 单元按单元投影；`CodeBlock` 网格使用 `PreparedContentGrid`；`MathBlock` 公式投影文本加可访问名称；仅在物化时参与查找/选区。跨多块选区的剪贴板复制是每块 `projectedSlice` 的拼接——按 §3.1 的行内 SVG/Math `alt` 替代保持偏移完整。

### 3.10 基线与它们为何存在

`forge/baselines/*` 与 `vectojs-docs/forge/baselines/*` 钉住本文引用的数字，使未来变更可被二分而非凭传闻重新度量。具体：256 px 基数表（1/2/4/10/100/1000 px → 0.9921875…1.0）、Firefox 上分离 vs 已挂载 `measureText('MMMMMMMMMM')` 对 `monospace/serif/sans-serif` 的三元组（`measureContext.ts:1`）、64.8 px 滚动 vs 渲染错位（661 帧 / 630 px 平滑滚动）、288/290 ms `style.font` getter 代价（Chrome vs Firefox 0.6 ms）以及 `Stack` + `RichText` 块记忆命中率（0 → 2388，在 `EMPTY_GLYPH_ATLAS` 之后）。`KNOWN_ISSUES.md` 记录逐字形否决（两字形 → 混合 CJK+Latin 上 −0.582 px）与 `absolute` 载体纯文本失败（16 换行 vs 2，0 空格 vs 14）。当新引擎或宿主报告不同间隙时，在钉住的 `DPR/ZOOM` 下重跑 harness 并对照基线提交比对——差异在于判断修复是查看器缺陷还是 VectoJS 回归。`packages/core/test/ContentGridPageScaleBasis.test.ts` 是量化的唯一单元级预言；其余皆需有头浏览器（COOP/COEP 以获 `performance.now` 保真度，聚焦窗口以获合成器回调——见 `vectojs-performance` skill）。

## 4. 难点——有凭据

### 4.1 字距漂移：整串 vs 孤立 advance

布局通过累加**孤立**逐字形 `measureText(char).width` 定位字形（`packages/layout/src/measure.ts:createCanvasMeasurer` → `getSharedMeasuringContext()`，`baseSize 100` 算术缩放）。绘制与布局保持在 0.5 px 内（`packages/ui/src/RichText.ts:COALESCE_TOLERANCE_PX`）——仅当 `abs(measureText(runText) − sum(isolated)) ≤ 0.5`（`RichText.ts:1001`）时，`flushRun` 才将一个 run 合并为一次 `fillText`，否则回退为在 `node.x` 处逐字符绘制。整串 `measureText(text).width` 包含 canvas 从未绘制的字距。使用整串宽度的载体因此**按累积字距差领先于墨迹**，在约 300 px 的字距敏感 16px 拉丁行上高达 5–8 px，Gecko 与 Blink 皆然（`KNOWN_ISSUES.md:168`）。

修复：载体宽度遵循该行的绘制模型，通过 `ContentProjectionLine.shapedPaint`。逐字形绘制器（`RichText`、核心 `TextEntity`）获得孤立字形 advance；`ui/Text` 的快速路径（每行一次已塑形 `fillText`）声明 `shapedPaint` 并保持已塑形前缀差载体。两端对齐行复用布局自有的 `positionedRuns` 几何，从未有此漂移。`logicalRuns` 通过 `mctx.measureText(segment)` 累加孤立 advance（`RichText.ts:598`）；`positionedRuns` 直接复用 `node.x/width`。`Scene.ts` 中的逐字形路径镜像此分支。

同类修复：`RichText.logicalRuns` 早前对每 run 使用整串度量；`Scene` 的逐字形路径度量已塑形前缀差——同类，同修复（PR #460，`@vectojs/core@1.35.1` + `@vectojs/ui@2.16.3`）。

### 4.2 DPR 量化与 256 px 页面缩放基数

浏览器将 `getBoundingClientRect().left` 舍入到 **1/64 设备 px**（`ContentProjectionManager.ts:62`、`CanvasGeometry.ts:PAGE_SCALE_BASIS_PX`）。1 px 探针量化为 1/64 的倍数；在 DPR 1.1 时恢复的页面缩放为 **0.9921875**（=63.5/64）而真值为 1.0——0.78% 误差（`ContentProjectionManager.ts:68`）。每个按单元 `scaleX = advance * scale / natural`（`ContentProjectionManager.ts:717`）按该因子缩小：18.0001 px 间距被选为 17.8624 px，在每个 CJK 接缝留下 **0.133 px** 间隙、每个拉丁接缝 0.061 px；在 DPR 1.1 时这些落在设备像素边界并绘制为垂直白线 `使|用|sudo`（`ContentProjectionManager.ts:71`）。在同页对基数 1/2/4/10/100/1000 px 实测：`0.9921875, 1.0, 0.998046875, 1.0, 1.0, 1.0`——每个 ≥10 px 的基数完全一致；1 px 读数为离群值。

修复：在 **256 px** 上度量（`PAGE_SCALE_BASIS_PX = 256`，`ContentProjectionManager.ts:85`）。最坏情况变为 `1/64 / 256 = 6.1e-5`（在 18 px 上残差 0.0011 px，约比浏览器可表示像素低 100×）同时远在探针 100000 px 宽度之内，不会引入滚动条或自身布局（`ContentProjectionManager.ts:80`）。测试预言：`packages/core/test/ContentGridPageScaleBasis.test.ts` 直接建模量化。

同类：分离度量 canvas 在 Firefox 上对通用族解析错误（`packages/text/src/measureContext.ts:1`）。`22px monospace` 分离 109.737 vs 已挂载 131.579 vs 布局 132.000；`serif` 分离坍缩到 `monospace` 的回退（`serif` 上 −47%、`monospace` 上 −20%）。仅 `sans-serif` 恰好一致，这正是仅 Chromium 测试隐藏它的原因。每个度量器必须使用 `getSharedMeasuringContext()`（已挂载、`document.body` 的子节点、永不 `display: none`）。`OffscreenCanvas` 度量正确（132.000）但契约是“在哪绘制就在哪度量”——已绘制 canvas 已挂载，因此度量 canvas 也必须挂载。残余约 0.3% 已挂载 vs 布局间隙是 §4.4 的 Gecko 网格对齐，而非此项。

### 4.3 合成器 vs 主线程 vs fixed/absolute 漂移

`position: fixed` 全视口 canvas 针对视口在**主线程外**合成；`absolute` 覆盖层针对滚动文档布局。按**已渲染**帧从 `parent.getBoundingClientRect()` 重新推导 `top` 来保持两者一致，会在滚动前进而无渲染时使覆盖层陈旧。在真实全视口场景上实测，630 px 上的真实按键驱动平滑滚动：661 个采样帧，**1 帧错位 64.8 px**（`CanvasGeometry.ts:191`）。

修复：覆盖层继承 canvas 自身的 `position`（`CanvasGeometry.ts:206`，`getComputedStyle(canvas).position`）。`fixed` 将 `left/top` 解析为视口——恰为 `canvasRect.left/top`（`CanvasGeometry.ts:222`）；`absolute` 保持带 `clientLeft/scrollLeft` 的父相对运算（`CanvasGeometry.ts:226`）。滚动于是无需 JS 补偿；修复**移除**了按帧依赖而非更频繁同步。滚动监听器仍会在主线程工作时与合成器竞速。剩余写入被记忆（`OverlayGeometry: left/top/cssWidth/cssHeight/width/height/position`，`CanvasGeometry.ts:235`），因此未改变帧不写入——相同赋值仍触碰 CSSOM 并随覆盖层数增长（`CanvasGeometry.ts:250`）。

### 4.4 CJK 亚像素间隙与字体查找代价

修复缩放后，残余漂移是约 0.36% Gecko 网格对齐（布局对齐到整数设备 px，canvas 保留小数）——`text-rendering: geometricPrecision` **并非**修复，实测与 `auto` 相同（`packages/text/src/measureContext.ts:34`、`KNOWN_ISSUES.md:131`）。同类惊讶产生了第二个独立性能陷阱：`style.font` 是每次读取都从每个字体长属性重新序列化的活动简写 getter。按单元读取 `target.style.font` 一次的校准扫描在 Chrome 中 **288 ms 占 290 ms（99.3%）**，而 Firefox 在相同循环仅 0.6 ms——480× 跨引擎差距，唯一信号是引擎而非工作量（`ContentProjectionManager.ts:292`）。修复：载体存储普通 `data-vecto-grid-font` 字符串（`ContentGridProjector.ts:291`），`ContentProjectionManager` 读取它。探针上 `contain: layout style paint` 以隔离它。

### 4.5 IME、剪贴板与可编辑镜像

`Input` / `TextArea` **并非**内容投影。它们投影一个真实透明的 `<input>` / `<textarea>`（Site: Accessibility & Automation §IME 感知输入字段、`packages/core/src/tree/Scene.ts:a11y input mirror`、`packages/ui/src/Input.ts` / `TextArea.ts`）。浏览器拥有 IME 候选窗口；canvas 从影子节点的 `input`/`change`/`compositionstart/compositionupdate/compositionend` 事件镜像 `value/selectionStart/selectionEnd/composition`，并逐帧绘制光标、选区高亮与 IME 下划线。影子节点通过 `textInputStyle: { font, lineHeight, padding }`（来自 `Entity.getA11yAttributes()` → `Scene` 以 `box-sizing: border-box` 应用，而 canvas 从相同内边距与 `Typography.cssLineBoxBaseline` 绘制——一个基线、两处消费，隐形编辑器与其墨迹镜像之间无垂直漂移）确定尺寸。

聚焦期间，`Scene` 避免回写相同的用户同步 `value`（回声抑制）：若应用状态提供真正不同的值则应用，但替换文本的受控组件必须有意保留 `selectionStart/End` 否则光标跳动。`Input` 是单行 `a11yFullViewport` 感知实体；`TextArea` 是带 `scrollLeft`/`scrollTop` 镜像到 canvas 的多行 `clipChildren` 感知滚动器——与任何其他实体相同的世界变换 → 覆盖层路径，因此 DPR/缩放/旋转同样适用。

剪贴板路径：`cut/copy/paste` 与 `undo/redo` 对可编辑字段通过该影子节点原生处理。对静态可选文本，`copy` 是投影层的浏览器自有序列化：`projectedSlice()`（`packages/ui/src/RichText.ts:506`）在**源码**空间为 `U+FFFC` 哨兵替代每个内联对象的 `alt`，因此 `LayoutNode.sourceIndex` 运算保持完整——长度不为一的 `alt` 否则会使后续每个偏移错位并使选区盒失同步。姊妹 `accessibleText()`（`RichText.ts:478`）存在于 `aria-label` 路径，刻意不用于切片。`SeparatorAfter`（逻辑换行 / 保留软换行分隔符，`ContentProjectionLine.separatorAfter`）被合并到行最终文本节点，使 Firefox 无法将多行选区的一部分置于投影根。`Table` 单元复制、`CodeBlock` 网格复制与 `MathBlock` 公式复制都流经同一按块 `projectedSlice` 拼接——按 §3.1 的行内 SVG/Math `alt` 替代在块边界保持偏移完整。

警示故事：`packages/devtools/src/selectionAudit.ts:119` 曾捕获 `getSelection()` 然后调用 `removeAllRanges`（`:157`）——审计破坏了用户状态。当前审计（`selectionAudit.ts:102`）使用分离 `Range`（`document.createRange()` + `selectNodeContents` + `getClientRects`），从不触碰 `DocumentSelection`；没有需清理的编程式选区。保持用户选区原样。

### 4.6 字形、字距与 CJK 白隙——看似渲染伪影的缺陷

`使|用|sudo` 伪影看似 GPU 缺陷：相邻汉字之间的垂直白线。它是通过光栅看到的选区投影缺陷。链路为：

1. `getBoundingClientRect().left` 在 1 px 基数下量化到 1/64 设备 px → 在 DPR 1.1 时 `basisScale` 低 0.78%（`ContentProjectionManager.ts:68`）；
2. `scaleX = advance × basisScale / natural` 低 0.78%（`:717`）；
3. 每个 `data-vecto-grid-cell` 绘制 `advance` 宽但选区盒按 `advance × scaleX` 定尺寸 → 每个 CJK 接缝短 0.133 px（`:71`）；
4. 在 DPR 1.1 时缺口恰落在设备像素边界 → 合成器留下一列未覆盖 → 白色。

拉丁接缝是同几何（0.061 px）但较窄 `advance` 掩盖它。更换光栅器、切换到 `geometricPrecision` 或禁用字距均无用——间隙不在墨迹而在绘制墨迹所用的 `scaleX`。守卫它的测试是页面缩放基数预言（`ContentGridPageScaleBasis.test.ts`）加上 `DPR=1.1` 的有头 harness；无头 DPR 1 复现不出任何东西。

### 4.7 校准并非一次性修复——字体、DPR 与视口各自强制重戳

按单元 `scaleX` 仅在度量瞬间为 `advance × (pageScale × deviceScale) / natural`。三个输入任一可在实体不动时变化：Web 字体完成（`contentFontEpoch` 递增，`watchFontMetrics` → 世代，`Typography.clearCssLineBoxMetrics`）、用户缩放（通过 256 px 基数 `getBoundingClientRect` 的页面缩放，`ContentProjectionManager.ts:524`）或 `devicePixelRatio` / canvas 尺寸变化（`Scene.resize` → `CanvasGeometry.effectiveDPR` → `contentViewportEpoch`）。`calibrationGeneration`（`ContentProjectionManager.ts:calibrationGeneration`）将它们合为一个计数器，一次比较即失效所有单元。错过此失效是静默的：旧 `scaleX` 保留，载体宽度错误，`selectionAudit` 报告随行长增长但刷新后消失的漂移。`data-vecto-grid-calib` 是要观察的字段——任何在缩放后幸存的带世代戳单元都是陈旧读数。

### 4.8 正确性如何被实际度量：选区 harness

无头（`jsdom`、`--disable-gpu`）没有 GPU、没有合成器、在小数 DPR 下没有 `Range` 几何，且无 COOP/COEP 时 `performance.now()` 粗化到 100 µs——无法引用选区对等。只有 `scripts/selection-harness/harness.ts` + `drive.sh` 可以。`harness.ts` 以已知源码、字体、`maxWidth` 构建真实 `Scene` + `Markdown` + `CodeBlock` 文档，然后 `drive.sh` 在专用 Hyprland 工作区以 `DPR` × `ZOOM`（`--force-device-scale-factor`、`layout.css.devPixelsPerPx`、`scripts/selection-harness/drive.sh:6`）启动**真实有头** Chrome 与 Firefox，并通过用户命中的同一 `clientToGridLocal` / `nearestOffsetForPoint` 路径驱动原生拖拽。`selectionAudit.ts:1` 是预言：`ContentProjectionLine` 几何的 `expectedLeft/Right` vs 活 DOM `Range` 的 `actualLeft/Right`，单位为**本地逻辑 px**（已除 DPR/缩放）。空数组即每个选区盒跟踪其字形；任何发现携带 `entityId`、`entityPath`、`line`、`leftDrift/rightDrift` 以供二分。

harness 旨在捕获的三种失败模式：两端对齐词间间隙、RTL/双向可视重排 + `dir="ltr"` 钉住，以及小数 DPR/缩放舍入（`scripts/selection-harness/README.md:8`）。无头 DPR 1 隐藏在 DPR 1.1/1.6 上线的 256 px 量化缺陷与约 0.36% Gecko 网格对齐——在宣称对等前，请同时在 `DPR=1.5 ZOOM=0.9` 与 1× 下运行 harness。

## 5. 开发者必须保持的不变量

> 每条不变量都是两条代码路径必须在一个数字与一个方向上达成一致的地方。若不一致，用户会看到间隙、错位高亮或丢失选区——而无头测试会掩盖它。`file:line` 是检查之处，而非建议。

1. **在哪绘制就在哪度量。**使用 `getSharedMeasuringContext()`（`packages/text/src/measureContext.ts`）——已挂载、`document.body` 的子节点、`opacity: 0` 于 `left: -9999px`，永不 `display: none`。绝不对通用族使用分离 canvas；不脱离文档样式上下文重新度量 `serif`/`monospace`。`fontMetrics.ts`（`packages/text/src/fontMetrics.ts:registerFontMetrics`、`registerMSDFFontMetrics`）是无 DOM 回退（MSDFAtlas `advance`/`kerning`/`ascender/descender`），而非浏览器中的首选路径。Web 字体加载后调用 `clearCssLineBoxMetrics()` 并让 `watchFontMetrics` 递增世代——陈旧缓存 advance 在任何投影之前就是行宽错误。
2. **一个方案，两处消费。**类代码实体：一次 `prepareContentGrid()` → 同一不可变对象供给绘制与 `getContentProjection().grid`（`packages/text/src/PreparedContentGrid.ts`）。散文：一次 `LayoutEngine` → 同一 `LayoutResult` 供给 `render()` 与 `getContentProjection()`（`packages/layout/src/LayoutEngine.ts`、`packages/ui/src/RichText.ts:284` 缓存）。绝不为 DOM 重新分段、重换行或重分词。`EMPTY_GLYPH_ATLAS` 作为 atlas 身份（`LayoutEngine.ts:EMPTY_GLYPH_ATLAS`）保持段落记忆热度。
3. **流式相对载体，按逻辑 DOM 顺序。**`position: relative` + `display: inline-block` 且 `left = run.x − runningLogicalX`（`packages/ui/src/RichText.ts:584`）。绝不 `absolute`——它会块级化并破坏 `innerText`/`textContent` 纯文本、`find-in-page` 行连续性与屏幕阅读器行迭代。RTL/双向共享此路径；可视 `x` 来自层级，DOM 顺序保持逻辑序以便 `innerText` 按源码顺序复制。探针上 `contain: layout style paint`，而非载体上。
4. **绝不为无障碍树大小而扼杀载体。**按字符 `StaticText` 节点逐字母朗读（见 `xuepoo-blog/src/text-utils.ts`）；禁用载体在 Firefox 中恢复约 2 px 漂移。树代价真实（见 Site: Accessibility & Automation §Cost scales super-linearly: 6.4 µs → 136.9 µs/entity 于 20k），但载体不是杠杆——窗口化（`contentProjectionMargin`）与 `a11yProjection: 'onDemand'` 才是。
5. **源码偏移是唯一稳定的选区坐标。**线性 DOM 偏移在网格窗口或换行变化时漂移（`ContentProjectionManager.ts:gridSelectionEndpointOffset`）。网格快照为 `sourceStart + withinCell`，散文通过 `projectionAbsoluteOffset`/`projectionCaretAt`（`packages/core/src/tree/scene/content-caret.ts`）。亲和 `forward` vs `backward` 决定光标钉在单元边界哪一侧。
6. **尊重绘制模型。**`ContentProjectionLine.shapedPaint` 告知 `Scene` 使用哪种 advance；两端对齐行复用布局自有字形几何（`positionedRuns`，`packages/ui/src/RichText.ts:626`）。在自然流 run 上设置 `x` 会翻转 `hasPositionedRuns` 并强制 `dir="ltr"`——对两端对齐/RTL 正确，对参差 LTR 错误（`RichText.ts:533`）。参差行必须保持 `dir="auto"`，使浏览器自行双向文本，光标命中映射才正确。
7. **继承覆盖层定位。**`CanvasGeometry.syncOverlay`（`packages/core/src/tree/scene/CanvasGeometry.ts:206`）必须镜像 `fixed`/`absolute`——不要按帧从父节点重新推导 `top`。记忆 `OverlayGeometry` 并仅在新层（`glCanvas`/`gpuCanvas`/`portalRoot`）出现时 `invalidateOverlay()`。
8. **世代戳，而非横扫。**字体与缩放变化通过世代计数器失效所有 `scaleX`（`ContentProjectionManager.ts:calibrationGeneration`、`calibrationStamp = fontEpoch:pageScaleX`）；不要在世代递增时触碰每个载体。单元携带 `data-vecto-grid-calib`，因此复用时未触及行保持不动。
9. **跨重建保持选区——但不在拖拽中。**`preserveSelectionAcrossRebuild` / `snapshotGridSelection` + `restoreGridSelection` 覆盖流式重建风险；空白区拖拽由浏览器权威，不应中断。`releaseSelectionForRebuild` 是当所选文本不再投影时（窗口滚过——保持 `Range` 分离而非指向分离载体）的更廉价姊妹。
10. **一个基线，两处世界。**每个行盒——canvas 与 DOM——调用 `Typography.cssLineBoxBaseline()`（`packages/text/src/Typography.ts:cssLineBoxBaseline`）。绝不在回退层外硬编码 `0.8 * lineHeight`；该常量是回退，而非契约。
11. **不要度量度量器。**`style.font` 是活动 getter（`ContentProjectionManager.ts:292`）；读取 `data-vecto-grid-font`。同样 `getBoundingClientRect` 强制布局——批量处理（探针路径）并记忆它（`selectionPresent` / `OverlayGeometry`），不要每元素每帧读取。
12. **虚拟化是可选且互斥的。**`Markdown.virtualize` 与流式 `createStream` 不组合（`Markdown.ts:614`）；`tableViewportHeight` 则可（`:652`）。将查找关键块置于已挂载窗口内，否则无法查找——物化而非 DOM 树深度决定 Ctrl+F 能看到什么。

## 6. 调试清单——当选区或复制漂移时

### 6.1 定量优先

| 症状                                               | 首个探针                                                                                                                                                                                                                                                                                                                      | 它说明什么                                                                                                                                      |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 高亮偏移随行长增长                                 | `auditEntitySelection` / `auditSceneSelection`（`packages/devtools/src/selectionAudit.ts:56`）——在**本地逻辑 px**（通过 `rootRect.width / entity.width` 去除 DPR/缩放）比较 `expectedLeft/Right`（投影几何）vs `actualLeft/Right`（`Range.getClientRects`）。默认容差 2 px；右边缘可能需更宽松 `rightTolerance`（字距累积）。 | 整串 vs 孤立漂移，或 `shapedPaint` 不匹配。                                                                                                     |
| 每个 CJK 接缝处可见间隙                            | 检查 `PAGE_SCALE_BASIS_PX`（=256，`ContentProjectionManager.ts:85`）与 `data-vecto-grid-calib` 世代；重测 `probeOrigin/XRect → basisScale`（`ContentProjectionManager.ts:707`）。                                                                                                                                             | 页面缩放量化或缩放/DPR 变化后陈旧校准。                                                                                                         |
| 重排或流式追加时选区折叠                           | `snapshotGridSelection` → `gridSelectionLine`（`ContentProjectionManager.ts:gridSelectionLine`）在扩展拖拽时；验证 `preserveSelectionAcrossRebuild` 覆盖拥有元素。                                                                                                                                                            | 线性 vs 源码偏移缺陷，或触及锚定行的重建。检查 `blankRegionDrag`（`:blankRegionDragActive`）。                                                  |
| 滚动时覆盖层高亮分离                               | `CanvasGeometry.overlay`（`CanvasGeometry.ts:OverlayGeometry`）——`position` 与 `left/top` vs 630 px 滚动下的 `canvas.getBoundingClientRect()`。                                                                                                                                                                               | `fixed` canvas 配 `absolute` 覆盖层，或在添加 `glCanvas`/`gpuCanvas` 后遗漏 `invalidateOverlay`。                                               |
| 网格就绪但零宽矩形                                 | `scene.getContentElement(id).dataset.vectoGridReady` 时机——必须从帧回调发布（`ContentProjectionManager.ts:566`），绝不同步。                                                                                                                                                                                                  | 拖拽/度量运行时载体尚未布局。                                                                                                                   |
| 字体切换后载体陈旧                                 | `contentFontEpoch` / `contentViewportEpoch` vs `calibrationStamp`（`ContentProjectionManager.ts:calibrationStamp`）。                                                                                                                                                                                                         | 字体加载或调整大小时遗漏世代递增——检查 `watchFontMetrics`（`RichText.ts:290`）与 `Scene.resize`。                                               |
| `Selection.toString()` 看似正确但 `innerText` 错误 | 在内容根上比较 `innerText` vs `textContent` vs `Selection.toString()`。                                                                                                                                                                                                                                                       | `Selection.toString()` 遍历文本节点并忽略布局——无法看到 `absolute` 块级化复制失败。使用 `innerText` 或真实剪贴板读取（`KNOWN_ISSUES.md:204`）。 |
| 静止时选区幸存，滚动时破坏                         | `CanvasGeometry.overlay.position` vs `getComputedStyle(canvas).position`（`CanvasGeometry.ts:206`），然后在真实平滑滚动下 `OverlayGeometry.left/top`。                                                                                                                                                                        | `fixed` canvas 而覆盖层保持 `absolute`——CSS 包含块而非数学是修复。                                                                              |
| 仅 Firefox 漂移，或仅通用族                        | `isSharedMeasuringContextAttached()`（`packages/text/src/measureContext.ts:isSharedMeasuringContextAttached`）与 `familyOf`（`packages/ui/src/measure.ts:familyOf`）。                                                                                                                                                        | 通用族（`monospace`/`serif`）上的分离度量器——Chromium 掩盖它。                                                                                  |
| `unmeasuredGlyphCount() > 0` 且换行错误            | `LayoutEngine.unmeasuredGlyphCount()`（`packages/layout/src/LayoutEngine.ts:31`）——非零表示部分字形以 `0.5em` 定尺寸；检查 `registerFontMetrics` / `hasFontMetrics()`（`packages/text/src/fontMetrics.ts:registerFontMetrics`）。                                                                                             | 无 DOM 环境且未注册字体度量——行宽与断行被捏造。                                                                                                 |
| 等宽仍漂移                                         | `familyOf(this.font)` vs 行 `font`（`packages/ui/src/RichText.ts:nodeFont`），以及是否对该族关闭 `perGraphemeCarriers`。                                                                                                                                                                                                      | 行 `line.font` 回退（`monospace`）与单元字体不匹配的混合族行——网格路径已按单元携带字体，散文路径必须匹配。                                      |

### 6.2 交互式探针

```ts
// 语义快照——DOM 实际投影内容（start() 后需一帧）
console.log(JSON.stringify(scene.getA11yTree(), null, 2));

// 单个实体的实时节点——dataset、矩形与是否拥有选区
const el = scene.getContentElement(entity.id);
console.log(el?.dataset, el?.getBoundingClientRect());
console.log(scene.getA11yElement(entity.id));

// 定量漂移，本地逻辑 px，需真实浏览器（布局 + Range）
import { auditSceneSelection } from '@vectojs/devtools';
console.table(auditSceneSelection(scene, { tolerance: 0.5, rightTolerance: 1 }));
// 单个实体，或限制 id：
// auditEntitySelection(scene, entity, { tolerance: 0.5 })
// auditSceneSelection(scene, { entityIds: ["my-markdown"] })

// 实时节点上的校准状态
console.log({
  ready: el?.dataset.vectoGridReady,
  calibration: el?.dataset.vectoGridCalibration,
  pending: el?.dataset.vectoGridCalibrationPending,
  samples: el?.dataset.vectoGridCalibrationSamples,
  calibMs: el?.dataset.vectoGridCalibrationMs,
  fontEpoch: (scene as any).contentFontEpoch,
});

// 几何读数——本地逻辑 x/y vs 世界变换
import { getContentGeometry } from '@vectojs/devtools';
console.log(getContentGeometry(entity));
```

在 `SceneOptions`（`packages/core/src/tree/Scene.ts:SceneOptions`）中传入 `debugA11y: true` 以在开发期间用蓝色虚线勾勒影子节点。通过 `scripts/selection-harness/drive.sh`（`DPR=1.5 ZOOM=0.9`，`scripts/selection-harness/README.md`）驱动跨引擎、多 DPR 验证——无头 DPR 1 同时隐藏量化缺陷与网格对齐漂移，分别在 DPR 1.1/1.6 上线。该 harness 覆盖两端对齐行、RTL/双向与小数 DPR/缩放三种 `selectionAudit.ts` 为之编写的失败模式（`selectionAudit.ts:1`）。

### 6.3 探针代价——不要让检查变为回归

- `auditSceneSelection` 本身按行调用 `getBoundingClientRect`（强制布局）且必须在真实浏览器而非热循环中运行。不要将其置于帧路径——用 QA 开关或 Playwright harness 门控。
- `scene.getA11yTree()` 遍历无障碍子树；它按 `A11yProjectionManager.enforceA11yDomOrder` 排序并对断言稳定，但在数千交互实体上不免费（见 §5.4 代价表：Chrome 上 20k 时 715 ms）。每验证快照一次，而非每帧。
- `selectionPresent()`（`ContentProjectionManager.ts:selectionPresent`）是批量同类读取的生产示例：每轮同步遍历一次强制布局，而非每元素一次。为任何新的投影健康检查复制该模式。

> **关于标题的说明。**本文档是 boss-01 三部曲之一。保持其 H2 数量与 `order` 稳定，使 `vectojs-docs/content/learn/` 索引与 `reference/core-a11y.md` 锚点不漂移——任何重命名后检查 `scripts/sync-content.py`。

## 7. 完整帧——按序六步

对于在 DPR 1.6 下，用户在未改变前缀中拥有选区时，将流式代码块扩展一行的帧：

1. **布局**——`prepareContentGrid` 或 `LayoutEngine.layoutPrepared` 发射新方案；`Stack` 仅重测脏块（`updateTokens` / `virtualHeights` Fenwick）。
2. **Canvas 绘制**——`Scene.render` 遍历 VMT，应用 `worldTransform × DPR`，发出 `fillText`/`drawImage` 批次。`flushRun` 决策（`COALESCE_TOLERANCE_PX`）已固化。
3. **覆盖层同步**——`CanvasGeometry.syncOverlay` 将 `a11yRoot` 对齐到 `canvasRect`，继承 `fixed`/`absolute`（`CanvasGeometry.ts:206`），已记忆（`OverlayGeometry`）。
4. **物化**——`syncA11y` / `syncContentProjection` 脏检查 `ContentSyncState`（世界矩阵、`hasBand`/`visible`、`fontEpoch`/`viewportEpoch`、`tier`），将载体窗口化到 `hint.minY/maxY`，复用未触及网格行的 `scaleX`，创建逐字形 span 或带 `sourceStart/Length/x/advance/level/caretOffsets` 的 `data-vecto-grid-cell` span。
5. **选区保持**——`ContentProjectionManager.snapshotGridSelection` 作为源码偏移，`preserveSelectionAcrossRebuild` / `restoreGridSelection` 在 `rebuild()` 后，或若所选文本滚出则 `releaseSelectionForRebuild`。空白区拖拽保持浏览器驱动。
6. **校准（冷）**——第 N 帧在屏幕外构建 100000 px 探针；第 N+1 帧读取 `Range` 自然宽度，以 256 px 页面缩放基数的 `basisScale` 计算 `scaleX = advance × basisScale / natural`（`ContentProjectionManager.ts:707`），写入 `transform`，加戳 `data-vecto-grid-calib`。稳态为一次选择器匹配；`vectoGridReady` 从帧回调发布。

任何未经第 1 步而重测的步骤都会产生第二个布局与未来漂移。任何未经记忆/属性路径而读取 `style.font` 或 `getBoundingClientRect` 的步骤都会付出 §4 的 480× / 按元素布局代价。

---

**延伸阅读。**`vectojs-docs/content/learn/accessibility.md`（投影模型、IME、页内查找、代价表）与 `reference/core-a11y.md`（复合部件、游走 tabIndex、`pointerEvents: 'none'` 热点模式）奠定本文档遵循的基调：有度量、按引擎、点名被否决的替代方案、数字与落地的 `file:line`。`forge/decisions/file-decomposition-2026-08.md` §2 解释为何四个每轮同步字段与两次遍历仅作为一对移动。`KNOWN_ISSUES.md` §Selection highlights / Positioned-run carriers / Core TextEntity projections 记录已修复漂移及其陷阱。绝不“通常应该”——要么载体在 `node.x`，要么不在。

## 附录——一次拖拽，触及的每个文件

用户在 `Markdown` 代码块的空白内边距按下，拖过三行后释放。DPR 1.6，`position: fixed` 全视口场景，Firefox 153：

| 时刻               | 发生什么                                                                                                                            | 文件                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `mousedown` 于空白 | `ContentProjectionManager.beginBlankRegionDrag` 跟踪 `TextCaretPosition`；浏览器折叠 `Selection`                                    | `ContentProjectionManager.ts:beginBlankRegionDrag`                                  |
| `mousemove`        | `Scene.ts:nearestGridPosition` → `gridCellCaret`（BiDi 感知分数）+ `blankRegionDragActive` 通过 `setBaseAndExtent` 扩展 `Selection` | `Scene.ts:nearestGridPosition`、`ContentProjectionManager.ts:blankRegionDragActive` |
| 下一帧：块重排     | `syncContentProjection` 重新窗口化载体；`snapshotGridSelection` 保存源码偏移                                                        | `ContentProjectionManager.ts:snapshotGridSelection`                                 |
| 重建               | `preserveSelectionAcrossRebuild` 跳过（拖拽进行中 → 浏览器权威）；`clearGridState` 仅释放非拥有块                                   | `ContentProjectionManager.ts:clearGridState`                                        |
| `mouseup`          | `ContentProjectionManager.endDrag` 清除 `blankRegionDrag` + 锚点；`getContentElement` 矩形生效                                      | `ContentProjectionManager.ts:endDrag`                                               |
| 两帧后             | 探针读取 `Range.getBoundingClientRect().width`，为被拖单元写入 `scaleX`；`vectoGridReady` 从帧回调发布                              | `ContentProjectionManager.ts:scheduleGridCalibration`                               |
| 复制（Ctrl+C）     | 浏览器从现已校准载体序列化 `projectedSlice` 文本（已替代 alt、已合并分隔符）                                                        | `RichText.ts:projectedSlice`                                                        |

若跳过或重排任何一行，则 §5 中同行号的不变量即需重读之处。
