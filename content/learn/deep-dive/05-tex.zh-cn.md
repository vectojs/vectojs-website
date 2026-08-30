---
title: '05 — 零 DOM TeX — 排版与 SVG 发射'
description: '为何 KaTeX 内核 → VectoJS 发射器 → 自包含 SVG，坐标空间不变量、伸缩几何陷阱，以及安全添加新 TeX 构造的路径。'
order: 25
---

# 05 — 零 DOM TeX — 排版与 SVG 发射

> **Boss 05** 拥有将 TeX 字符串变为自包含 SVG 的契约——无任何浏览器——无 DOM、无 CSS 引擎、无 Web 字体——并保持每个盒、裁剪与伸缩字形在几何上忠于 KaTeX 在浏览器中会渲染的结果。
>
> - **你将学到**：为何 KaTeX 作为布局内核被 vendored 且浏览器职责止于何处；span 树 → SVG 发射管线；五个坐标/变换空间——单一错误帧会破坏每个伸缩；直接映射到这些空间的历史缺陷集群；以及安全添加新 TeX 构造的方式。
> - **你不会学到**：Unicode/BiDi、阿拉伯塑形或 `LayoutEngine` 断行——Boss 02 拥有；Markdown worker 传输与流式调和——Boss 04；`GlyphRasterAtlas`/`SVGRasterCache` DPR 路径——Boss 07；`IRenderer` 契约本身。

## 为何存在零 DOM TeX

KaTeX 自身的 `buildHTML`（`packages/tex/src/kernel/VENDORED.md`）发射 span 树，其几何依赖两个外部引擎：**CSS 布局**（`position: relative` + `top`、`display: table-cell` + `vertical-align`）负责垂直放置，**行内文本布局**负责 x，以及 **Web 字体解析**（CSS 类 → 字体文件 → 字形）负责墨迹。`@vectojs/markdown` 无法承担其中任何一项：`SVGEntity` 经 `data URI → Image → createImageBitmap → drawImage` 光栅化（`packages/tex/src/index.ts:8`）。从 data URI 加载的 `Image` 不解析外部 URL 也不继承页面 CSS，因此 KaTeX 的 HTML/CSS 输出与任何基于 Web 字体的方案都无法走通。SVG 必须携带**自有轮廓**。

结果是硬约束：发射的 SVG 零外部引用——无 `<text>`、无 `font-family`、无 `url()`、无 `xlink:href`（`packages/tex/src/emit/svg.ts:1` 头部）。正是该约束证明新包而非 KaTeX 配置的合理性。

大小是选择此形状而非替代的程序预算（`vectojs-docs/forge/decisions/math-engine-2026-08.md:30`）：对 `mathjax-full@3.2.2` 的 `bun build --splitting` 分解实测 **gzip 中 84% 在 SVG 输出 + 嵌入字体**，仅约 16% 在 TeX 输入层，因此杠杆是**字形白名单**而非包裁剪。KaTeX 被测得**完全无 SVG 输出**（`src/kernel/Settings.ts:206` 枚举恰为 `["htmlAndMathml","html","mathml"]`），而最小 RaTeX `wasm32` 构建实测 **1 010 901 gzip / 768 278 brotli——为其将替换的 MathJax 块的 1.47×**（`math-engine-2026-08.md:103`），因此 WASM 在此工作所属轴上不胜。

## 何为 vendored、何为自有

`packages/tex/package.json:14` 构建顺序记录拆分。`packages/tex/src/index.ts:25` 是地图，契约行应阅读而非复述：

- `src/kernel/`——KaTeX（MIT），由 `scripts/vendor-katex.ts` 从**固定提交**（`references/markdown/KaTeX@5a5bf206`，`forge/decisions/math-engine-2026-08.md:191`）复制并机械剥离 MathML 与 DOM 发射。**未重排或 lint 修复**，因此文件保持可与上游 diff。`VENDORED.md` 命名保留与丢弃集合；`.oxlintrc.json` 与 `tsconfig.build.json` 皆为此排除内核（`math-engine-2026-08.md:312` 脚注）。
- `src/registry/`——两个手写文件（`defineFunction`、`defineEnvironment`），无 token 级变换可产生，因为 `mathmlBuilder` 在其中以表达式位置出现（`src/index.ts:30`）。其 `sideEffects:false` 陷阱使阶段 1 打包非功能（`math-engine-2026-08.md:294` 修正 5），因此 `package.json` **不得**为 `sideEffects:false`——导入副作用填充 `functions`/`environments`，tree-shaking 会删除每个内置。
- `src/emit/` + `src/layout.ts`——自有，发射讨论触及的唯一文件。
- `src/glyphs/glyphs.subset.json`——TTF 轮廓 → SVG 路径经 `scripts/generate-glyphs.ts`，由 `scripts/subset-glyphs.ts` 收窄，由 `scripts/encode-glyphs.ts` + `src/emit/glyphCodec.ts` 重编码（阶段 2 二进制格式，`math-engine-2026-08.md:282`）。已发布运行时表解码为与阶段 1 提取器**字节一致**的路径字符串（`glyphCodec.test.ts` 同一性断言）且**比相同字形的子集 TTF 低 12.0%**（`math-engine-2026-08.md:328`）。

## 管线 — 文件映射

```text
TeX string  ──►  layout(tex, opts)                         layout.ts:62
                 Settings(displayMode,maxSize,strict)  ·─► kernel/Settings.ts
                 parseTree → AST                       ·─► kernel/parseTree.ts + Parser.ts
                 buildHTML(tree, Options) → DomSpan    ·─► kernel/buildHTML.ts + buildCommon.ts:552 makeVList
                      │ height/depth/style.top already resolved
                      ▼
                 DomSpan tree                          layout.ts:84-89  (wrapped in vecto-tex root)
                      │
                      ▼
                 emitSVG(tree, {emPx,color,padEm})     emit/svg.ts:1567  EmitResult{svg,width,height,depth,missing,placements}
                   walk → EmitState{glyphs,rects,paths,lines}
                   viewBox = layout box ∪ ink union + pad
                   defs deduplication + grouped fills + clipPaths
                      │
                      ▼
                 MathRender{uri,widthEx,heightEx,depthEx}  markdown/src/markdown-math.ts:544 convertMathToSVGDataURI
                   bounded mathCache (256) + inlineMathRasters (LRU, 256)
                   lazy import via preloadMathJax()
                      │
                      ▼
                 InlineObject{width,height,depth,alt,paint}  markdown/src/markdown-inline.ts:287 inlineMath arm
                   InlineObjectBox in LayoutEngine lines, paint draws the raster
```

`layout`（`layout.ts:62`）是无 `.katex`/`.katex-display` 包装器的 KaTeX `buildTree`，后者携带仅浏览器 CSS 语义（`layout.ts:5`）。其唯一有趣选择是 `throwOnError:true` + `strict:false`（`layout.ts:68`）：硬解析错误抛出使调用方可退化为逐字展示 TeX 源码（`@vectojs/markdown` 对未知命令已如此）；严格性违规不抛。

`emit/svg.ts:1` 做浏览器否则会做的三件事，在其头部命名因每件都付出真实缺陷：

1. **解析字形 → 轮廓。**`SymbolNode` 携带文本加度量但**无字体**（`fonts.ts:57` `CLASS_TO_FACE`）。`\left(` 产生带空类列表的 `SymbolNode`，其位于 `delimsizing size1` 祖先下——局部解析会选中 `Main-Regular` 并在应为高括号处绘制矮括号（`math-engine-2026-08.md:444` 实测：经祖先链 105/105 正确，无之 97/105；`svg.ts:427` `walk` `classChain` 参数）。
2. **累积 x。**span 树完全无 x——仅 `functions/rule.ts:44` 曾写入 `Span.width`，且那里表示矩形。其余每个 x 皆为行内文本布局，因此发射器从 TTF `hmtx` 表累加按字形 advance（`svg.ts:492` `getGlyph` + `advance`；`math-engine-2026-08.md:432` 注为何 `hmtx` 而非 `fontMetricsData.width`——组合重音为 0 advance 使标记覆盖基字，而度量声称 1.0–2.33 em）。
3. **转换 CSS 垂直放置 → 显式 y。**`makeVList` 将每行编码为 `style.top = -pstrutSize - currPos - elem.depth` 相对于兄弟 `pstrut` 高度 `pstrutSize`；转换从树中读回 `pstrutSize`（`svg.ts:1029`）并使用 `rowY = y - (-(top + pstrutSize)) * UPEM * scale`——它永不重推导 KaTeX 布局（`svg.ts:32`，`math-engine-2026-08.md:417` #1）。

发射器单位为 **1/1000 em**（`svg.ts:52` `UPEM`），匹配字形表的 `UNITS_PER_EM`（`glyphTable.ts:49`）与 `svgGeometry.ts` 文档化的 1000:1 viewBox。`y` 为**基线向下为正**。字形轮廓以 y 向上发货，因此每个置于 `scale(1,-1)` 内而非重写其路径（`svg.ts:1552` `transform` 字符串；重写会损失精度并破坏去重）。

Markdown 包装器（`markdown-math.ts`）然后经此管线**懒**排版：`preloadMathJax`（`markdown-math.ts:85`，第 6 行类型-only `import type {emitSVG,layout}` 使值导入不将引擎拉入每个消费者）动态 `import('@vectojs/tex')`，缓存 `MathRender` 于 256 条目加同界 LRU 光栅映射（`markdown-math.ts:218` `mathCache`，`markdown-math.ts:238` `inlineMathRasters`；`inlineMathRasters` 无界曾为 P3 发现——`forge/findings/text-richtext-and-markdown.md:1924`），并作为 `InlineObject` 发射行内数学，其 `width/height/depth` 经 `exToPx`（`markdown-math.ts:143`，`markdown-inline.ts:305`）以 px 计，`paintInlineMath`（`markdown-math.ts:331`）。展示数学为 `MathBlock extends MarkdownContainer`（`markdown-math.ts:598`）。两文件皆无到 `@vectojs/tex` 的静态值边——第二条（`markdown-math.ts:484` 中 `KATEX_FONT_SCALE` 被重声明而非导入正因如此；相等性在 `test/mathBoxGeometry.test.ts` 断言）。

### 字体解析 — 完整链

`fonts.ts:194` `resolveFont(classes)` 经三映射按优先级扫描累积 `classChain`：

- `DELIM_SIZE_FONTS`（`fonts.ts:98` 如 `delimsizing size1 → Size1-Regular`）——最高，因伸缩分隔符在祖先而非 `SymbolNode` 上携带此。
- `DIRECT_FONT_CLASSES`（`fonts.ts:120` 如 `mathbb → AMS-Regular`、`mathcal → Caligraphic-Regular`）。
- `CLASS_TO_FACE`（`fonts.ts:57` 如 `mord textit → Main-Italic`、`mathbf → Main-Bold`）经 `AVAILABLE` 回退组合（`fonts.ts:135`——若 `Math-BoldItalic` 缺席则回退到 `Math-Regular`）。

尺寸经 `SIZE_MULTIPLIERS`（`fonts.ts:263`，由 vendor 漂移守卫对照 `katex.scss $sizes` 与 `kernel/Options.ts sizeMultipliers` 验证——见 § Vendor 不变量守卫）通过 `sizingRatio`（`fonts.ts:265`）乘法。字体与缩放皆从**完整**链在每个节点解析，而非仅叶子。

### 字形表与挂接 — 一图

一个 `SymbolNode` → 一个轮廓：`walk` 将其 `classChain` 传给 `emitSymbol`（`svg.ts:427`），后者经 `resolveFont` 解析字体，经 `getGlyph(font, code)`（`glyphTable.ts:73`，`glyphCodec.ts:277` 中后备 `GlyphTable`）查找轮廓，并或推送 `PlacedGlyph{x,y,scale,font,code}`（`svg.ts:132`）以 `glyph.advance/UNITS_PER_EM * UPEM * scale`（`svg.ts:499`）前进，或——未命中时——在 `state.missing`（`svg.ts:500`）记录 `font/U+XXXX` 并以 vendored `getCharacterMetrics` 宽度（`kernel/fontMetrics.ts`；已发布轮廓的超集，`svg.ts:505`）前进。重复 `SymbolNode.text` 字符**不**经 `node.width` 融合（`buildCommon.ts:296` `tryCombineChars` 拼接文本而 `width` 保持首字符）——每个码点单独度量，零 advance 回退在两者皆未命中时单次警告（`svg.ts:514` `warnedMetricsMisses`，有界 `MAX_CACHED_MISSES = 1024` 于 `glyphCodec.ts:83`）使坏字形不污染 `penX`/`viewBox`。

## 坐标空间不变量

每个放置都经**五空间**完成从 DOM 类列表到 SVG `viewBox` 中最终像素的一程。任一空间的缺陷一次性破坏所有伸缩构造，而两簇真实一起破坏的正是如此。

| #   | 空间                     | 定义                                                                                | Y 方向                                                    | 缩放                                                                                                           | 裁剪含义                                                  | 所在                                                              |
| --- | ------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | **根局部（em）**         | `state.x` 笔、`y` 基线，所有 `parseEm` 长度 × `UPEM × scale`                        | +向下，基线原点（`svg.ts:427` `walk` `y`）                | `sizingRatio(classChain)` 累积（`fonts.ts:265`）                                                               | —                                                         | `emitContainer` + `emitSymbol` 入口                               |
| 2   | **行局部（重放）**       | `vlist-t > vlist > vlist-r > row` 带 `rowY = y - above`（`svg.ts:1080`）            | +向下，vlist 基线                                         | 相同                                                                                                           | 行缩进 `dx = startX + indent + marginLeft`                | `emitVList` 探针 + 重放（`svg.ts:1031-1180`）                     |
| 3   | **变换后（路径局部）**   | `<path transform="translate(x,y) scale(sx,sy)">` 将局部 → 根用户空间                | svg 用户空间，y 向下于每字形 `scale(1,-1)` 外             | 字形：`scale / -scale`；伸缩：`sx = scaleWidth/vbW, sy=heightEm/vbH`（`svg.ts:612`）                           | `viewBox` 宽 `400em` 于 `sx` → `scaleWidth`               | `emitSvgNode` + 最终 `body` 变换串（`svg.ts:584`、`svg.ts:1569`） |
| 4   | **ClipPath 局部**        | `<clipPath><rect>` 在引用元素变换**之后**解析（SVG `userSpaceOnUse` 默认）          | **变换后**用户空间                                        | 逆：`invSx=1/sx,invSy=1/sy`（`svg.ts:1555`）                                                                   | **必须在路径自有帧中发射**                                | `svg.ts:1550-1562` `clipPath` 矩形                                |
| 5   | **Markdown 盒（ex/px）** | `MathRender{widthEx,heightEx,depthEx}` 然后 `exToPx(…,runSize)` → `InlineObjectBox` | LayoutEngine 行盒，基线 + depth（`markdown-math.ts:566`） | `EX_PER_KATEX_EM = KATEX_FONT_SCALE/EX_PER_EM`（`markdown-math.ts:514`，Chromium 中 0.02% 验证 vs 真实 KaTeX） | 以 `MATH_PAD_EM=0.05`（`markdown-math.ts:481`）在各边填充 | `markdown-math.ts:544` + `markdown-inline.ts:305`                 |

**不变量**（在每条发射裁剪或覆盖分支的路径上必须成立）：`PlacedPath.clip` 窗口以**根空间**记录（`svg.ts:146-170`，`emitSvgNode` 从 `min-width` 播种），由任何 `aligned-vlist` 重放 `dx` 平移（`svg.ts:1196` `clip.x += dx`），然后以 `sx/sy` 求逆后发射（`svg.ts:1555`）。在 3 与 4 间的错一空间使每个根号与上 brace 按 `p.x + sx·clip.x` 而非 `clip.x` 错位（`CHANGELOG:31` #787）。

## 伸缩几何 — 三族

伸缩元素的几何**不在 `Span.width`**。仅 `functions/rule.ts:44` 曾写入它。三族，三种不同坐标事实——混淆它们即缺陷发生方式。

### 普通字形与规则

- `PlacedGlyph.x` 为绝对根 x；`width` 为 `advance/UPEM * scale`。无 viewBox、无切片、无 `clip`。
- `PlacedRect` 为三种形状之一：`Span.width` 处规则（`svg.ts:903`）、全宽规则/边框（`svg.ts:800` 处 `borderBottomWidth` / `.angl` / `\boxed` 边框，`fullWidth:true`，由 `svg.ts:1256` 处 `placeRect` 解析）或垂直分隔符（`svg.ts:718` 处 `vertical-separator` → 描边 `PlacedLine`）。全宽形状**无 advance**——`span.width` 缺席有意义。

### 单路径 hide-tail 伸缩

`\sqrt` 与 `\phase` 各发射一个 400em 宽 `SvgNode` 于包装器之下，其 CSS 为 `overflow:hidden`（`katex.scss:513` 处 `hide-tail`）。

- `\sqrt`：包装器写入**行内** `style.minWidth = 0.853em`（`kernel/delimiter.ts:533`），`emitContainer` 在 `svg.ts:969` `clipEm = parseEm(style.minWidth) || parseEm(style.width)` 读取。因此 `emitSvgNode` 将 `state.x + clipEm*scale` 作为 `widthEm` 与 `clip.w` 播种（`svg.ts:590`）。400em 路径的 `sx` 使用 `rawWidthEm`（非 `widthEm`）使 `slice` 以其声明缩放渲染并被裁剪而非压扁。
- `\phase`：包装器**仅写入 `style.height`**（`kernel/functions/enclose.ts:60`）。无行内 `minWidth/width`，因此 `clipEm` 保持 `undefined` 且 `hideTail` 为 `unclippedHideTail === true`（`svg.ts:971`）。子级不作为 400em 前进（`svg.ts:966` 带 `FULL_WINDOW: 0..1 xMinYMin` 的 `emitOverlayPiece`）。改为整个容器范围即裁剪（`markdown` 在 `markdown-math.ts:92` 类比无关；逻辑为 `svg.ts:966`）。

微妙处：`minWidth` **存在**处裁剪行内播种且 `emitSvgNode` 正确；**不存在**处裁剪待定且必须推迟到外围 vlist 范围（见下 #667）。同一包装器类的两条代码路径。

### 多段覆盖

`\overbrace`/`\underbrace`/`\xleftrightarrow`/`\xrightarrow` 将一个 400em 路径拆在 **2–3 段**上，它们为 `position:absolute` 百分比窗口（`stretchy.ts:238` `widthClasses = brace-* / halfarrow-*`；`katex.scss:519` 处 CSS）。

- 每段 `SvgNode` 仍声明 `width:"400em"`——按字面取值使 `\overbrace{x+y}` 度量为 **1200em**（3×400）（`CHANGELOG:31`）。
- 这些段记录为**零 advance** `PlacedPath.overlay:{start,end,align,vw,vh}`（`svg.ts:195`，`svg.ts:629` 处 `emitOverlayPiece`）且仅在外围 vlist 行 `width` 已知时解析：均匀覆盖缩放 `s = max(boxW/vw, boxH/vh)`，按段 `preserveAspectRatio` 对齐（`svg.ts:1286` 处 `placeOverlay` 的 `xMinYMin / xMidYMin / xMaxYMin`），窗口裁剪到 `boxX = startX + start*width`。

## 发射器绝不能破坏的五条不变量

这些结束了该批次并自此成为最昂贵的回归方式：

1. **`classChain` 携带字体。**`SymbolNode` 常具空类列表；字体在祖先上。局部解析静默地在应为短括号处绘制高分隔符、在应为高处绘制短括号。影响**所有**带分隔符公式（`fonts.ts` + `svg.ts:427` + `math-engine-2026-08.md:443` 度量）。
2. **`state.x` 为 advance 而非几何。**`parseEm(margin*)/hmtx advance/sizingRatio` 和是唯一正确 x。任何第二来源双计。
3. **`top + pstrutSize` → `rowY` 是唯一垂直真值。**从树中读出 `pstrutSize`；不要重推导它（`svg.ts:1029`）。
4. **`clip`/`overlay` 推迟到外围 vlist 范围；别无其他。**全宽规则、hide-tail 根号、`\cancel` 覆盖与 brace 段皆对**自有**外围行 `width` 解析（`svg.ts:1172` `rectStart/lineStart/pathStart` + `svg.ts:1230`）。对公式 `state.x` 解析使 `\cancel` 对角线错位前导 advance 并埋没嵌套 socpe。
5. **`clipPath` 矩形在路径局部坐标。**发射 `(clip.x - p.x)*invSx`（`svg.ts:1558`），永不 raw `clip.x`，并以与其路径相同 `dx` 重放已记录裁剪（`svg.ts:1196`）。空间 4 ≠ 空间 3。

## 案例研究 — 缺陷即坐标

每个是不同空间混淆，行号为修复后状态。

### #787 — `clipPath` 坐标空间（`svg.ts:1550-1562`，`CHANGELOG:31`）

`clipPathUnits` 默认为 `userSpaceOnUse`，意味着 `<clipPath>` 内 `<rect>` 在引用 `<path>` 的 `transform` **之后**解析。因此矩形必须写在路径自有局部帧。修复前，`svg.ts:1555` 逐字发射根空间 `clip.{x,w}`，因此 SVG 二次应用 `translate(p.x) ∘ scale(sx)`：窗口落在 `p.x + sx·clip.x`。每个裁剪伸缩——`\sqrt`、每个 phase——在非 1 `sx`/`sy` 下消失到画布外。同次提交还添加 `svg.ts:1196` `clip.x += dx` 于对齐 vlist 重放，因为裁剪是如其所界路径的绝对根空间窗口——推迟路径而不推迟其窗口破坏居中分子中根号的 `\frac{\sqrt{x}}{y}`（`CHANGELOG:57` `svgClipWindows.test.ts`）。

### #667 — `\phase` 度量为 400em（`svg.ts:966`，`CHANGELOG:56`）

`\sqrt` 总在包装器上写入行内 `min-width` 使 `emitSvgNode` 可立即裁剪；`\phase` 不会。发射器信任 SvgNode 声明的 `widthEm: 400` 作为 advance，报告 `\phase{-120}` 为 400em。修复为检测 `classes.includes('hide-tail') && clipEm===undefined` 为 `unclippedHideTail`（`svg.ts:971`）并将该分支路由到 `emitOverlayPiece(FULL_WINDOW)`——零 advance 覆盖，其可见窗口为外围行。

### #665 — `\overbrace` 度量为 800–1200em（`svg.ts:859`，`CHANGELOG:58`）

同根因，多段：`brace-left/center/right` 与 `halfarrow-left/right` 为 `position:absolute` 带 `width:25/50/50%` 于外围行（`katex.scss:519`）。每个 `SvgNode` 仍声明 400em——相加使 `\overbrace{x+y}` 度量为 1200em。修复为识别 `OVERLAY_PIECES[class]`（`svg.ts:328`），将那些 SvgNode 视为零 advance 待定覆盖（`svg.ts:867` 处 `emitOverlayPiece`），`CONTAINER_BORDER_CLASSES`（`svg.ts:308`）针对相关 `.angl` 情形——边框仅在 CSS 中。

### #825 — `\sqrt{b^2-4ac}` 渲染为 `b²√4ac`（`svg.ts:1186`，`CHANGELOG:15`）

两个独立故障，皆以被开方宽度为中心：

- `ROW_ALIGN_CLASSES.sqrt` 为 `center` 而非 `left`（`svg.ts:266`）。KaTeX 无 `.sqrt {text-align}` 规则；初始为 `left`。以 `center`，窄 400em 根号位于宽被开方中部，因此 vinculum 似乎从开头 `b²` 右侧开始。
- hide-tail 裁剪仅按 `minWidth` 定尺寸，永不按实际被开方宽度。一旦 `width`（vlist 范围，即更宽时被开方宽度）已知，`svg.ts:1186` 将 `p.w`/`p.clip.w` 扩展到 `max(minWidth, radicandWidth)`——且仅对整数 `vlist` 主体 `classChain.includes('sqrt')`，而非祖先（`svg.ts:1203` 守卫），否则外层 `mfrac` 将根号拉伸到分数宽度。

### #788 — 带非 1 缩放与对齐重放的钉住裁剪窗口（`svg.ts:1196`，`svgClipWindows.test.ts`）

对齐 vlist 单遍历优化先前声称“平移可靠因 `walk` 在 `state.x` 上仿射”并声称裁剪平移在 `svg.ts:1196` 平移裁剪**之前**可靠（`CHANGELOG:57`）。回归测试现从**发射 SVG** 断言有效渲染窗口与放置路径自有盒在 `sx=sy=0.7` 下及重放居中 `\frac` 分子内重合。

外加 2026-08-13 压缩但发射代码仍作为仍具承载守卫保留的六项 P2/P3 发现（`forge/findings/text-richtext-and-markdown.md:1789`）：

- **#514 phantom**——`style.color==="transparent"`（`kernel/Options.ts:306`）标记 phantom 墨迹（`buildCommon.ts:96`）；在 `svg.ts:479`/`svg.ts:744`（`phantom` 标志）跳过墨迹但保持 advance。
- **#514 color**——TeX `\color` 在每个节点写入 `style.color`（`functions/color.ts`）；发射器经 `walk` 继承有效颜色并按其分组（`svg.ts:1522` `grouped`），`svg.ts:1542` 处 `escapeAttr` 加固任何用户衍生字符串（`&`→`&amp;`、`"` 等）。
- **#514 rules/borders**——每个 `borderBottomWidth`/`katex-sout`/`.angl`/`.boxed` 样式变为 `fullWidth` 矩形（`svg.ts:800`、`svg.ts:834`）而非仅 `frac-line`。
- **#514 `op-limits`/`x-arrow`/`mover`/`munder` 居中**——加入 `ROW_ALIGN_CLASSES`（`svg.ts:266`）并对照 `katex.scss:405`/`563` 验证，使 `\sum` 限与 `\xrightarrow` 标签落在算子/箭头中心。
- **#521 lap（`\llap`/`\clap`）**——CSS `right:0`/`margin-left:-50%`（`katex.scss:293`）通过度量 `lapWidth` 并以 `-lapWidth`/`-lapWidth/2` 位移 `state.x` 实现（`svg.ts:982` `lapKind` 分支）而非将三 lap 皆作 `rlap`。
- **#521 `\smash`/viewBox**——`functions/smash.ts:66` 将节点 `height/depth` 置零而子级保持尺寸；发射器将 viewBox 扩展到已放置墨迹的**并集**（`svg.ts:1630` `minX/minY/maxX/maxY` 并集）而非布局盒，使 smashed 内容不被切掉。

### 仍约束发射契约的字形/表历史

- **缺失字形作空白墨迹**（`CHANGELOG:62` `ff79c58`）：为 `U+2248`/`h*`/`l*` 等的 `569→662 (+87)` 子集增补——缺失轮廓经度量正确前进因此渲染为**正确宽度空白间隙**，不可见但布局正确。
- **展示变体空白洞**（`CHANGELOG:9` 集 `U+2216`、`U+22C3` 展示变体、`U+005F`、上划线测试块）：展示块**降级为原始 TeX 源码**（蓝色 CodeBlock）而非排版，因为 `markdown-math.ts:559` 处 `convertMathToSVGDataURI` 在任何 `emitted.missing` 上返回 `null`。
- **`vertical-separator`（`{c|c}` / `{c:c}`）**（`CHANGELOG:29` #697）：数组列分隔符将其规则写作 `style.borderRightWidth`/`borderRightStyle`，而非 `Span.width`。修复前 `svg.ts:617` 完全丢弃它；现于此笔位置以 `verticalAlign`/`height` → `(y1,y2)` 发射描边线（`svg.ts:718`）。
- **类携带内边距**（`CHANGELOG:30` #696）：`.x-arrow-pad`/`.cancel-pad` 等仅存在于 `katex.scss`，因此行在 `CLASS_H_METRICS`（`svg.ts:366`）于同点随行内 `paddingLeft` 折入前度量短。`.cancel-lap` 的 `-0.2em` 边距在同表配对使 `\cancel` 保持净 advance。
- **有界图像与光栅上限**（`CHANGELOG:61`，`markdown-math.ts:1938` `destroy` 丢弃 `workerCallbacks`）：与坐标无关但对流式文档具承载——无界 `inlineMathRasters` 在 `mathCache` 驱逐后仍钉住每 URI 的 `HTMLImageElement`。

## Vendor 不变量守卫

样式表与内核合谋对树隐藏信息。下面每个值存在于 `katex.scss` 或内核文件**但不在 `DomSpan`**，因此发射器将其转录为常量——且转录在每次 vendor 运行（`scripts/vendor-katex.ts --check`）验证：

| 转录常量                                                               | 真值来源                                                  | 被守卫形状                                                                  |
| ---------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| `MU = 1/18`（`svg.ts:60`）                                             | `katex.scss:$mu = 1em/18`                                 | 漂移守卫从检出 `katex.scss` 重推导 `MU`                                     |
| `NULL_DELIMITER_SPACE = 0.12`（`svg.ts:69`）                           | `$nulldelimiterspace = 1.2em/10`                          | 同上                                                                        |
| `SIZE_MULTIPLIERS[11]`（`fonts.ts:263`）                               | `katex.scss $sizes` + `kernel/Options.ts sizeMultipliers` | scss 扁平器重推导两者                                                       |
| `KATEX_FONT_SCALE = 1.21`（`svg.ts:77`）                               | `.katex {font-size:1.21em}`（`katex.scss:24`）            | 同上，亦断言 `markdown-math.ts:514 ≈ markdown/test/mathBoxGeometry.test.ts` |
| `ROW_ALIGN_CLASSES`（`svg.ts:266`）                                    | `katex.scss` 第 405/442/563 节 + 文档化 `sqrt:left` 偏差  | 同扁平器                                                                    |
| `CLASS_TO_FACE`/`DELIM_SIZE_FONTS`/`AVAILABLE`（`fonts.ts:57/98/135`） | `katex.scss` `font-family` 规则                           | 同上                                                                        |
| `CONTAINER_BORDER_CLASSES`（`svg.ts:308`，`.angl 0.049em`）            | `katex.scss:601` `.angl` 顶部/右侧规则                    | 同上                                                                        |
| `OVERLAY_PIECES` 窗口（`svg.ts:328`）                                  | `katex.scss:519` `.brace-*/halfarrow-*` 绝对窗口          | 同上                                                                        |
| `CLASS_H_METRICS` 内边距（`svg.ts:366`）                               | `katex.scss:555/569/579/583/601` pad/lap/margins          | 同上                                                                        |

`defineEnvironment` 的可选属性（`argTypes`、`allowedInText`、`numOptionalArgs`）以**上游默认值透传**（`registry/defineEnvironment.ts`）而非钉住或丢弃，因此未来 KaTeX 提升开始声明它们时会显现而非静默丢弃（`forge/findings/text-richtext-and-markdown.md:2075`）。

## 布局交互实际如何工作

行内数学**非** `fillText`。`markdown-inline.ts:287` `inlineMath` 产生 `InlineObject`（对象替换字符 + `InlineObjectBox`），其 `width/height/depth` 以 px 计为 `exToPx(converted.{widthEx,heightEx,depthEx}, runSize)`——`runSize` 为 span 树中该点处**外围段**的 `fontSize`，因此标题内 `$x$` 随标题缩放（`markdown-inline.ts:292`）。`packages/layout/src/LayoutEngine.ts:808` 处 `LayoutEngine` 将其视为固定盒如行内图像。盒的 `depth`（基线以下距离）为 `emitted.depth + padEm` 于同一 `KATEX_FONT_SCALE/EX_PER_EM` 尺度——就位 depth 与宽度一起推导，因此对 `KATEX_FONT_SCALE` 的改动错定每个公式而对现已抵消的 `EX_PER_EM` 改动不移动任何（`markdown-math.ts:111` 成对抵消注）。

展示数学完全绕过断行器：`MathBlock` 为 `MarkdownContainer`，其子级为 data URI 的 `SVGEntity`，宽度为容器宽减 `MATH_PAD_EM` 内边距——边距与溢出是 `ScrollView` 关切而非 `LayoutEngine`。

### `LayoutEngine` 如何对待行内公式

`LayoutEngine`（`packages/layout/src/LayoutEngine.ts:808` `LayoutEngine`，`README.md:24` 解耦引擎）永不塑形 TeX。行内数学到达为一个 `StyledSpan{ text: OBJECT_REPLACEMENT, object: InlineObject }`（`markdown-inline.ts:301`），其 `InlineObjectBox{width,height,depth}` 在 span 收集时已从外围段 `fontSize` 经 `exToPx` 固定——因此布局已以 px 见到盒。热 `LayoutEngine.layout` 路径如任何其他行内图像般包裹它（`packages/layout/src/LayoutEngine.ts:2321` `layoutPreparedIntoBuffer` 保留前导注于 `forge/findings/text-richtext-and-markdown.md:1762`；`core/src/text/measureContext.ts:12` 校准与 `core/src/text/Typography.ts:111` `ctx.measureText('Mg')` 回退是同一盒依赖的 Boss 02 文本度量守卫）：`width` 参与断行，`depth` 使行基线下沉该距离，`height+depth` 增长行盒使带大 depth 的公式（分数、根号尾、`\left(` 高括号）扩展间隙而无需二次度量。公式上选区是双世界对等而非布局——`ContentGridProjector`/`ContentProjectionManager`（Boss 01/03）复制 `InlineObject.alt = t.text`（`markdown-inline.ts:310`）使读者可查找/选择/复制 TeX 源码，而 canvas 命中保持 `InlineObjectBox` 矩形。任何在 `LayoutEngine` 缓存后改变 `InlineObjectBox` 的都必须弄脏文本路径——Boss 02 守卫的同一 `measure-once, layout-many` 不变量。

### 盒几何 — 为何 `KATEX_FONT_SCALE` 保留而 `EX_PER_EM` 抵消

`EmitResult` 以 **KaTeX** em 报告 em（为消费者字号的 1.21×，`svg.ts:77` `KATEX_FONT_SCALE`，`katex.scss:24`）。`markdown-math.ts:514` 组合 `EX_PER_KATEX_EM = KATEX_FONT_SCALE / EX_PER_EM (0.4421)` 使 `widthEx = (emitted.width + 2*pad)*EX_PER_KATEX_EM` 与 `depthEx = (emitted.depth + pad)*EX_PER_KATEX_EM`（`markdown-math.ts:566`）。然后 `markdown-inline.ts:305` 以 `exToPx(ex, runSize) = ex * runSize * EX_PER_EM` 解析 px——`EX_PER_EM` 抵消，剩下 `px = (em+pad)*1.21*runSize`。通过将 `EX_PER_EM` 变为 `0.31` 零测试移动、将 `KATEX_FONT_SCALE` 变为 `1.0` 3 失败验证（`markdown-math.ts:111` 注，`test/mathBoxGeometry.test.ts:39` 0.5% 容差吸收 2 位小数舍入）。`padEm` 非装饰：SVG `width/height` 属性在各边包含它而 `EmitResult.{width,height,depth}` 不含，`markdown-math.ts:338` 处 `drawImage(bitmap, x,y, box.width, box.height)` 将整 SVG 拉伸到盒——仅报告墨迹盒则每个公式按 `padEm` 压扁，报告 depth 不带它则每个公式高 `padEm`。

## 字形子集与编解码 — 字节所在

已发布 `glyphs.subset.ts`（`src/glyphs/glyphs.subset.ts`）非 SVG 路径文本而是由 `src/emit/glyphCodec.ts:277` `GlyphTable` 解码的二进制。`scripts/generate-glyphs.ts` 处提取读取 TTF `glyf` 二次轮廓（on-curve 标志 + 隐含中点），`scripts/encode-glyphs.ts` 逆转该展开：18 306 `Q` 端点中 5 256 恰为隐含中点并被丢弃，每个剩余坐标为整数（去中点后 72 616 中 0 离格），zigzag varint 增量将 72 616 中 60 637 打包进一字节（`math-engine-2026-08.md:333`）。语料（`scripts/subset-glyphs.ts`）是封顶展示失败者——666 字形由 `test/glyphCodec.test.ts` 计数守卫钉住。**存在于 `fontMetricsData.js` 但不在子集**的字形渲染为正确宽度空白间隙（来自度量的 advance，无轮廓；`CHANGELOG:62`）；**所属面完全缺席**的字形（如仅展示的 `\digamma` 鲸鱼）经 `markdown-math.ts:559` `emitted.missing.length>0 → null → CodeBlock` 退化——两失败模式不同且拥有者不同。

### `packages/core/src/text/*` — TeX 与文本栈的交汇

TeX **不**调用 `packages/core/src/text` 塑形（BiDi、阿拉伯、OpenType 特性）——字形已由 KaTeX 度量塑形，发射器直接写入轮廓。TeX **所**共享的是文本栈下半：`core/src/text/measureContext.ts:12` 度量上下文校准与 `core/src/text/Typography.ts:111` `ctx.measureText('Mg')` 回退是 Boss 02 对 Web 字体 advance 的守卫，而 TeX 在 `svg.ts:499` 处 `hmtx` 派生 advance 是 KaTeX 类比。两者必须满足同一文本度量不变量（Boss 02 → 深度前置）：以真实字体、在正确上下文、以正确 DPR 度量，否则 `InlineObjectBox` 从 canvas 命中矩形与无障碍投影漂移。`packages/text/src/fontMetrics.ts:82` `registerFontMetrics` 永不对 TeX 面调用——vendored `fontMetricsData.js` 是 TeX 度量源，两表拥有者不同。

### 读取公式的已发射 SVG — 放置即真值

`EmitResult.placements`（`svg.ts:104` `GlyphPlacement[]` 以 em 计）是调试面（`markdown-math.ts:517` 注其存在以对照同一 span 树的真实浏览器布局交叉验证）。当公式看起来错误时，对比 placements 而非阅读 SVG 路径汤：

```ts
import { layout, emitSVG } from '@vectojs/tex';
const { svg, width, placements, missing } = emitSVG(
  layout('\\sqrt{b^2-4ac}', { displayMode: true }),
);
// width 为 em 的 advance；placements[].{x,y,scale,font,code} 以 em 计；missing 列出缺席 U+XXXX
```

`width` 是唯一门控布局的数字——低报截断 `InlineObjectBox`，高报插入可见间隙——而 `placements[].y` 自基线向下为正，是必须与 Chromium 中 KaTeX DOM 探针匹配到 0.0000 em 的（`math-engine-2026-08.md:423`）。失败裁剪或覆盖表现为 `PlacedPath.w/clip.w` 与 `placements` 范围不匹配，而非路径字符串差异。

## 验证 harness — 使每条不变量保持绿色的

- `test/emit.test.ts:37`——自包含 SVG 契约（`<text>`/`font-family`/`url`/`xlink:href` 缺席；data-URI 片段可解析）；伸缩覆盖零 advance 与切片窗口（`emit.test.ts:380` `treats multi-piece stretchy overlays as zero-advance`）。
- `test/svgClipWindows.test.ts:6`——#787/#788 的渲染器几何回归：clipPath 矩形在路径局部帧发射，以及非 1 `sy` 下对齐 vlist 重放重合窗口（`svgClipWindows.test.ts:83` 上 brace 平铺）。
- `test/vendorCheck.test.ts:252`——漂移守卫从上游检出重推导每个 `katex.scss` 转录常量（注释 brace 陷阱是 MathJax 导入，非此包）。
- `packages/markdown/test/mathBoxGeometry.test.ts:39`——KaTeX 字体缩放桥（跨包 `KATEX_FONT_SCALE` 相等）与对 Chromium 中真实 KaTeX 的盒几何（16px 时 19.3559 px/em，0.02% 离散）。

## 如何安全添加新 TeX 构造

TeX 构造由**内核构建器**（AST → span + 样式/类）定义并由**单一发射分支**消费，后者将那些 span/样式译为对正确范围的已放置墨迹。构造仅当**七**处一致才视为已发布——缺任一即历史失败模式。

### 1. 添加并验证内核构建器

经 `src/registry/defineFunction.ts` / `defineEnvironment.ts` 扩展 `src/kernel/functions/*.ts` 或 `src/kernel/environments/*.ts`（而非编辑内核）。验证构建器的**输出契约**：它设置何类（如 `.mover`、`.angl`、`.cancel-pad`）、写入何行内样式（`borderBottomWidth`、`paddingLeft`+`padLeftEm`、hide-tail 包装器上 `minWidth`）、包装器是 `Span`、`SvgNode` 还是带 `LineNode` 的 `SvgNode`（`kernel/stretchy.ts:69`，`svgGeometry.ts` 针对路径目录）、是否涉及 `style.top`/`style.left`/`style.color`/`transparent`。内核 `fontMetricsData.js` 度量已流入树的 `height/depth`——不要将其作为第二来源重引入。

### 2. 仅教会发射器一个新分支

分发位于 `svg.ts:427` `walk` → `emitSymbol`/`emitSvgNode`/`emitContainer`/`emitVList`。若新 span 携带**影响几何的新 CSS 类**，则将其注册到正确表而非硬编码：

- `CLASS_H_METRICS` 针对行内 pad/margin（如 `.x-arrow-pad`，#696）——否则行度量短。
- `CONTAINER_BORDER_CLASSES` 针对厚度仅在 `katex.scss` 中的边框边（`.angl`，`svg.ts:308`）。
- `ROW_ALIGN_CLASSES` 若 vlist 行 `text-align` 重要（`.op-limits` 等，`svg.ts:266`）。
- `OVERLAY_PIECES` 若新 span 为 `position:absolute` 百分比窗口（`svg.ts:328`）。

若构造的 SVG 声明固定宽度（400em）但其**可见**宽度为外围行范围，则将其 SvgNode 视为**零 advance 待定覆盖**而非字面 advance（`svg.ts:859` #665 / `svg.ts:966` #667 的 `\phase`/`\overbrace` 模式）。

### 3. 将其置于正确坐标空间

- **跨容器的规则或边框**为 `PlacedRect{fullWidth:true, edge?}` 位于 `svg.ts:147`，由 `placeRect(startX,width)` 对**自有外围 `vlist` 行**解析（`svg.ts:1230` `rectStart` 范围），而非公式 `state.x`。
- **可见宽度非声明 `width` 的伸缩单路径**为 `PlacedPath{clip?}` 位于 `svg.ts:193`，在 `svg.ts:596` 处 `sliced` 处理（按 `rawWidth` 而非 `widthEm` 缩放）且——若 `hide-tail` 无 `minWidth`——作为 `FULL_WINDOW` 待定（`svg.ts:966`）。
- **多段覆盖**为 `PlacedPath{overlay}` 位于 `svg.ts:193`，带 `placeOverlay` 覆盖缩放 + `preserveAspectRatio` 对齐（`svg.ts:1275`）并裁剪到窗口（因此每段绘制容器的分数）。
- **垂直分隔符**（`vertical-separator`，#697）为描边 `PlacedLine`（`svg.ts:173`），其 `(x1,y1)→(x2,y2)` 恢复 `aboveEm = height + verticalAlign`——`svg.ts:718` 已做的相同推导。

### 4. 保留颜色、phantom 与转义

经 `walk` 继承有效 `style.color`（`svg.ts:132` `ColoredPlacement`，`svg.ts:479` `color=style.color ?? inheritedColor`，`svg.ts:744` 该值上 phantom 测试），在 `color==="transparent"` 时保持 advance 而跳过墨迹（处理 `\phantom`/`\vphantom`/`\hphantom`/`\mathstrut` 的 `rlap`——`buildCommon.ts:96`，`svg.ts:479`），将同色段分组到 `<g fill=…>`（`svg.ts:1522`），并经 `escapeAttr` 转义任何插值颜色（`svg.ts:1542`）——今日调用方为主题派生，但来自 TeX 输入如 `\color{…}` 的值逐字写入 `style.color` 否则跳出属性。

### 5. 正确尺寸 — 选对阈值

`KATEX_FONT_SCALE` 与 `sizingRatio` 在两处乘法组合：笔 advance（每个 `parseEm` × 处 `UPEM * scale`）与 `PlacedGlyph.scale`（`fonts.ts:265`）。`SIZE_MULTIPLIERS` 中错误条目使脚本尺寸字形错位约 50%，任何 viewBox 修复都无法捕获。

### 6. 更新度量契约

若构造几何包含容器范围（vlist `width`、被开方宽度、brace 窗口），它必须在宽度已知**之后**解析（`svg.ts:1227` 处 `emitVList` `maxX-startX`；`svg.ts:1588` 处 `emitSVG` 中回退到公式 `state.x`）。`svg.ts:1630` 处先前无界 viewBox（已放置墨迹并集而非仅布局盒）具承载——扩展该盒是 #521 对 `\smash`/`\hphantom` 的修复，其中 `height/depth` 为零但子级保持尺寸。

### 7. 保持两道护栏为绿

- `scripts/subset-glyphs.ts`——若构造演练新码点，则将其加入子集语料（`src/glyphs/glyphs.subset.json`）并重跑编解码守卫（`test/glyphCodec.test.ts` 钉住 `package.json` 非 `sideEffects:false` 与 666 字形计数）使语料无法静默丢弃新区。缺失但度量存在码点渲染为**空白正确宽度间隙**（`CHANGELOG:62` #665）；仅展示码点渲染为**原始 LaTeX 源码**（`CHANGELOG:9`）。
- `scripts/vendor-katex.ts --check`——将任何**新** CSS 转录常量（`ROW_ALIGN_CLASSES`、`CLASS_H_METRICS`、`OVERLAY_PIECES` 等）加入从上游检出重推导每值的漂移守卫（`test/vendorCheck.test.ts` SCSS 扁平器），使下次 KaTeX 提升时样式表变化大声失败而非静默偏移依赖它的每个构造（`CHANGELOG:62` 漂移守卫添加）。

## 调试清单

<!-- markdownlint-disable MD056 MD060 -->

| 症状                                                            | 优先检查                                                                        | file:line                                                              |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 所有伸缩离画 / `p.x+sx·clip.x` 翻倍                             | Clip 路径在根空间而非路径局部发射                                               | `emit/svg.ts:1555` `invSx/invSy`                                       |
| `\overbrace`/`\xleftrightarrow` 度量 400×N em；viewBox 宽 400×  | 多段 SVG 作字面 advance 而非零 advance 待定覆盖                                 | `emit/svg.ts:859` `OVERLAY_PIECES` + `emitOverlayPiece`                |
| `\phase` 度量 400em 而 `\sqrt{x}` 正确                          | `hide-tail` 无行内 `minWidth` 仍前进 400em                                      | `emit/svg.ts:966` `unclippedHideTail`                                  |
| `\sqrt{b^2-4ac}` vinculum 截断到 `0.853em`，被开方部分在根号外  | 裁剪按 `minWidth` 而非 `max(minWidth, radicandWidth)` 定尺寸，或 `sqrt: center` | `emit/svg.ts:1186` `clip.w < width` + `svg.ts:266` `sqrt:left`         |
| `\sum_{i}` 限左齐；`\xrightarrow{label}` 标签在箭头左边缘       | 行对齐类缺失                                                                    | `emit/svg.ts:266` `ROW_ALIGN_CLASSES`                                  |
| `\underline`/`\overline`/`\hline`/`\sout` 缺失                  | 无宽度边框 span——因仅考虑 `frac-line` 被丢弃                                    | `emit/svg.ts:800` `borderBottomWidth/katex-sout`                       |
| `\boxed`/`\angl` 盒边不可见                                     | 边框厚度仅在 `katex.scss`（`.angl`）或 `borderStyle` 简写未读                   | `emit/svg.ts:834` `CONTAINER_BORDER_CLASSES` + 简写                    |
| `{c\|c}` 规则不可见；`:` 实线而非虚线                           | `vertical-separator` span 被丢弃；`borderRightStyle===dashed` 未应用            | `emit/svg.ts:718` `dashed` + `svg.ts:1597` `stroke-dasharray`          |
| `\llap`/`\clap` 墨迹在锚点右侧                                  | 三 lap 皆使用 `rlap`（`left:0`）语义                                            | `emit/svg.ts:982` `llap/clap` 宽度探针 + 位移                          |
| `\smash`/`\hphantom` 内容被 viewBox 裁剪                        | ViewBox 从置零 `height/depth` 而非已放置墨迹并集推导                            | `emit/svg.ts:1630` `minY/maxY` 墨迹并集                                |
| 颜色丢失；`\color{red}x` 黑色或未知看起来有效                   | `style.color` 未继承；或已知缺失字形未对 `emitted.missing` 门控                 | `emit/svg.ts:479` + `markdown-math.ts:559` `missing.length>0` 退化路径 |
| `\xrightarrow{\text{…}}` / `\boxed` / `\cancel` 上窄间隙/过度量 | 类携带 `padLeft/padRight/marginLeft` 未折入 advance                             | `emit/svg.ts:366` `CLASS_H_METRICS`                                    |
| 高分隔符为矮括号 / 错误斜体（`\mathit{123}` 正常）              | 字体解析无祖先 `classChain`                                                     | `emit/svg.ts:427` + `fonts.ts:194` `resolveFont(chain)`                |
| `bun build` 后 `Got group of unknown type` 于 `layout('x')`     | `packages/tex/package.json` 设为 `sideEffects:false`——注册表被 tree-shaken      | `packages/tex/package.json` + `test/glyphCodec.test.ts` 对该字段守卫   |

## 流式与为何 `layout → emit` 非行中可重入

行内数学的 `InlineObjectBox` 在 `LayoutEngine` 见到它**之前**固定，因此 TeX 管线永不在布局热路径内调用。`markdown-math.ts:85` 的懒 `import('@vectojs/tex')` 意味着页面上首个公式渲染为样式化源码（`markdown-inline.ts:316` 处 `else` 的 `theme.mathFallbackColor`）直到 `preloadMathJax()` 解析——`ensureMathJax`/`retypesetFromTokens`（`markdown/src/Markdown.ts:3518`）将并发加载合并到一个 promise 并从已词法 token 重建，保持 `tokenChildPrefix` 平凡正确。`inlineMathRasters` 在 `markdown-math.ts:238` 的 LRU 在每次绘制时重插入使仍可见位图不被驱逐，`mathCache`（256）加同界光栅上限是针对解码数千不同公式的长寿文档的流式守卫（`forge 2026-08-13` 有界光栅发现）。第二个在构造前 `await preloadMathJax()` 的调用方获得同步首公式排版——Boss 04 的 `onStable` 在 `waitForAppendSettled` 后快照 `Array.from(content.children)` 时依赖的同一契约。

该 `degrade-to-source` 契约亦是字形缺失契约：`convertMathToSVGDataURI` 的 `emitted.missing.length>0 → null`（`markdown-math.ts:559`）将部分缺失公式渲染为**复制 TeX 源码**而非静默缺口等式，因此忘记字形的语料添加显现为蓝色 `CodeBlock` 而非错误等式。展示数学的回退（`markdown/src/Markdown.ts:3520` `retypesetFromTokens` 整体）尊重同一契约——缺轮廓的块 `\digamma` 永不产生缺口展示块，它保持源码。

### `packages/core/src/text/*` 与更深文本不变量

`core/src/text`（`core/src/text/Typography.ts:111`，`measureContext.ts:12`）塑形 **Web** 文本——BiDi、阿拉伯连接、可变字体 advance——而非 TeX。两栈仅在 `InlineObjectBox` 交汇：两者皆为 `LayoutEngine`（`packages/layout/src/LayoutEngine.ts:808`）同样包裹的 `width/height/depth` 盒。Boss 02 的 `measure-once, layout-many` 不变量因此支配两者：字体、DPR 或宽度变化后的陈旧 `InlineObjectBox` 无论盒内为 TeX 还是 `fillText` 皆为对等缺陷。TeX 永不调用 `registerFontMetrics`（`packages/text/src/fontMetrics.ts:82`）——其度量为 vendored `fontMetricsData.js`；两表拥有者不同但布局真值唯一。

## 不变量 — PR 前复制粘贴清单

1. **深度稳定类链。**`resolveFont(classChain)` 与 `sizingRatio(classChain)` 从真实累积（`walk` `chain=[…classChain,…classes]`）线程化，而非叶子切片。
2. **每个行内长度为 `parseEm * UPEM * localScale`。**重放时无二次缩放——缩放已烘入。
3. **任何范围为容器范围的形状推迟到 `place*(startX,width)`。**在不同 vlist 中读取同范围的第二消费者否则将根号拉伸到分数宽度。
4. **无 `parseFloat("100%")` 作 `100em`。**`parseLength`/`parseEm` 拆分 `pct` vs `em`；`\cancel` 覆盖中百分 x 如全宽规则推迟到 vlist 宽度。

## 参考

- `vectojs-docs/content/learn/text-typography.md`——文本排版面向用户视图与 `InlineObject`/`InlineObjectBox` 概念。
- `vectojs-docs/forge/decisions/math-engine-2026-08.md`——预算与引擎选择。
- `vectojs-docs/forge/findings/text-richtext-and-markdown.md`——与 TeX/布局/流式交叉的发现。
- `packages/tex/README.md`、`packages/tex/src/kernel/VENDORED.md`、`packages/tex/src/emit/glyphCodec.ts:277`。

---

_系列：00 总览 → 01 选区 → 02 文本+布局 → 03 投影+虚拟化 → 04 流式 Markdown → 05 TeX → 06 VMT 运行时 → 07 渲染器 → 08 WASM G1/G2/G3 → 09 Three/XR → 10 视频导出 → 11 图布局 → 12 DevTools。_
