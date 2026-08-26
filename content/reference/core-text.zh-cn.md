+++
title = "Text & Bidi"
description = "独立的 @vectojs/text 包（也是 @vectojs/core/text 子路径）：排版度量、MSDF 字体解析、阿拉伯文塑形和 bidi 解析器，外加驻留于 core 的 MSDFTextEntity/GridTextEntity GPU 文本渲染器。"
weight = 7
+++

# Text & Bidi —— `@vectojs/text`

文本塑形基元 —— `BidiResolver`、`ArabicShaper`、`Typography`、`MSDFFont`、`prepareContentGrid`/`PreparedContentGrid` —— 是独立的 **`@vectojs/text`** 包（一个仅依赖 `bidi-js` 的叶子包）。基于 `Entity` 的 GPU 文本渲染器（`MSDFTextEntity`、`SVGEntity`、`TextEntity`/`GridTextEntity`）保留在 [`@vectojs/core`](/reference/core-api/) 中，因为它们扩展了 `Entity`。Core 重新导出 `@vectojs/text` 基元，因此它们可以从 `@vectojs/text`、`@vectojs/core` 或 `@vectojs/core/text` 子路径解析。构建于[布局引擎](/reference/core-layout/)的冷/热分离之上。

## MSDFFont

```ts
new MSDFFont(data: MSDFFontData)
MSDFFont.parse(json: string | MSDFFontData): MSDFFont   // reads msdf-atlas-gen JSON
font.getGlyph(unicode: number): MSDFGlyphDef | undefined
font.layout(text, fontSizePx, opts?: MSDFLayoutOptions): MSDFLayoutResult   // honors \n, kerning, letterSpacing
font.distanceRange / font.atlasWidth / font.atlasHeight
```

解析事实标准的 `msdf-atlas-gen` JSON，并将文本排布成带图集 UV 的 CSS 像素四边形（y 向下的局部空间；v=0 在图集顶部）。将 `layout()` 与 WebGL 后端的 `setMSDFTexture` + `addGlyph`（参见 [WebGL point 层](/reference/core-renderer/#webgl-point-ceng)）配对以获得分辨率无关的 GPU 文本。类型：`MSDFFontData`、`MSDFAtlasInfo`、`MSDFMetrics`、`MSDFGlyphDef`、`MSDFBounds`、`MSDFKerning`、`PositionedGlyph`、`MSDFLayoutResult`、`MSDFLayoutOptions`。

## MSDFTextEntity

```ts
new MSDFTextEntity(text: string, options: MSDFTextEntityOptions)
// options: { font: MSDFFont, texture: TexImageSource, fallbackFont?, fontSize?, color?, lineHeight?, letterSpacing? }
setText(text: string): void
```

当场景运行 `pointBackend: 'webgl'` 时，通过 WebGL point 层渲染清晰的 MSDF 字形；否则回退到带 `fallbackFont` 的 Canvas2D `fillText`。布局通过 `LayoutWorkerManager` **在线程外**计算，并在回调时应用，调用 `markDirty()` —— 因此文本在构造/`setText` 后一个异步 tick 出现。

## TextEntity & GridTextEntity（来自 `.`）

```ts
new TextEntity(text: string, atlas: GlyphAtlas, maxWidth: number, fontSize = 32)
text.setText(text): this        // cold pass (re-segment + re-measure), then reflow
text.setMaxWidth(maxWidth): this // hot pass only — reuses cached PreparedText (cheap responsive resize)
text.setTextAlign(align: 'left' | 'justify'): this
text.setHyphenator(fn: ((word: string) => string[]) | null): this

new GridTextEntity(_atlas: any, fontSize = 10)
grid.updateGrid(ascii: string[])   // monospace cell grid; interactive=false (a11y off for perf)
```

`setTextAlign('justify')` 将换行的行拉伸至齐平 `maxWidth`（词间空格，或在无空格的 CJK 行上的字符间隙）；每个段落的最后一行保持参差不齐。`setHyphenator()` 插入一个 词 → 部分 函数（例如 `hyphen` npm 包的 Knuth–Liang 模式），使长词可以在词中以可见的 `-` 断开；源文本中已有的软连字符（U+00AD）无需连字器即可工作。两者都生效，因为 `TextEntity` 在每个节点计算出的 `x` 处**按字形**渲染 —— 对齐/断字数学在视觉上得到尊重。

`MSDFTextEntity` 和 `@vectojs/ui` 的 `Text`/`RichText` 组件共享相同的底层 `LayoutEngine`，但尚未暴露这两个方法 —— 为了性能，`Text`/`RichText` 将每个换行的行渲染为一次原生 `fillText()` 调用，即使暴露该选项也会静默丢弃按字形的对齐偏移。当你今天需要对齐或断字的文本时，直接使用 `TextEntity`（或驱动一个设置了 `textAlign`/`hyphenate` 的原始 `LayoutEngine`）。

## Bidi / 成形

```ts
ArabicShaper.shapeArabic(text: string): ShapedResult   // { shapedText, indexMap: Int32Array } — presentation-form joining
BidiResolver.getBaseLevel(text: string): number
BidiResolver.resolveLevels(text: string): Uint8Array
BidiResolver.reorderVisual(nodes: any[], baseLevel: number): void
BidiResolver.reorderSegments(str: string, levels: Uint8Array, baseLevel: number):
  Array<[number, number]>
```

轻量的内置 bidi：基于范围的方向类（希伯来文/阿拉伯文 R/AL、EN/AN 数字）和阿拉伯文上下文表现形式选择。`indexMap` 将成形索引映射回源字符串，用于命中测试/光标映射。

`reorderVisual` 就地重排节点对象数组。`reorderSegments` 暴露相同的 UAX #9 **L2** 反转范围（运行自身位置上的包含性 `[start, end]` 索引对），而不需要节点对象，因此持有**并行类型化数组**的调用者可以就地应用相同的置换 —— 这就是零 GC 缓冲路径所使用的。`reorderVisual` 现在委托给它，因此两者不会产生偏差。

参见[文本与排版](/learn/text-typography/)了解用法。

## 无头环境下的文本度量

```ts
registerFontMetrics(family: string, source: FontMetricsSource): void
registerMSDFFontMetrics(family: string, font: MSDFFont | MSDFFontData | string)
createMSDFMetricsSource(font: MSDFFont): FontMetricsSource
getFontMetrics(family: string): FontMetricsSource | undefined
hasFontMetrics(): boolean
fontMetricsVersion(): number
clearFontMetrics(): void
createMeasuringContext(): CanvasRenderingContext2D | null   // see below
```

文本度量通常通过 Canvas 2D 上下文进行，它会测量渲染器实际要绘制的字体。如果没有上下文——如 Node SSR、没有 `OffscreenCanvas` 的 Web Worker——就没有东西可以用来测量，每个字形的 advance 都会退化为一个固定的 `0.5em`。与 Chrome 下 32px 的 `sans-serif` 相比，这在窄文本上误差达到了 **+125%**，在宽文本上误差为 **−47%**，并且 `iiiiiiiiii` 会和 `WWWWWWWWWW` 完全一样宽。自动换行也会继承这个误差，导致断行位置同样出错。

`createMeasuringContext()` 是这种情况的轻量级逃生舱：它创建一个 1×1 的离屏 `<canvas>`（追加到文档 body，不可见，`aria-hidden`）并返回它的 2D 上下文，用于测量没有已注册度量 source 的字体——在无 DOM 环境中则返回 `null`。它就是引擎本身会使用的上下文，因此它测量的是渲染器实际绘制的字体，这是上面基于注册表的路径所不能做到的。共享的单一度量上下文（`getSharedMeasuringContext` / `isSharedMeasuringContextAttached` / `resetSharedMeasuringContext`，同样来自 `@vectojs/text`）是一个单独的记忆化上下文，用于每个 `@vectojs/*` 包——`ctx.font` 在每次读取前都会被赋值，因此共享不会泄露过期的测量值。

在启动时注册一次度量数据即可修复此问题。任何 `msdf-atlas-gen` 生成的 JSON 都可以，并且只读取其中的 `glyphs[].advance`、`kerning` 和 `metrics`——图集图片是无关紧要的，因此一个纯度量文件就足够了，不会进行任何解码：

```ts
import { registerMSDFFontMetrics } from '@vectojs/core';

registerMSDFFontMetrics('sans-serif', await readFile('inter.json', 'utf8'));
```

字体 family 会不区分大小写地匹配并去除引号，逗号分隔的列表只注册它的第一个 family。再次注册相同的 family 会替换先前的 source，而 `clearFontMetrics()` 会丢弃所有内容（这对测试隔离很有用，因为注册表是进程全局的）。

对于非 MSDF 字体，可以直接提供一个 source：

```ts
interface FontMetricsSource {
  advanceEm(char: string): number | undefined; // required
  measureEm?(text: string): number | undefined; // honors kerning
  ascenderEm?: number; // for cssLineBoxBaseline
  descenderEm?: number;
}
```

有三条路径会查阅该注册表：布局引擎中的逐字形 advance、`@vectojs/ui` 中的全字符串宽度（用于确定 `Button`、`Input`、`Link`、`Checkbox`、`ContextMenu`、`ProgressBar` 的尺寸），以及 `cssLineBoxBaseline` 中的基线（这需要 `ascenderEm`/`descenderEm`）。

> [!IMPORTANT]
> 真实的 Canvas 2D 上下文永远优先，因此注册度量数据不能改变浏览器测量或绘制的结果。它们的存在是为了取代编造的猜测，而不是为了覆盖将要渲染文本的引擎。

`measureEm` 是值得提供的。逐字形的契约是 `measure(char, fontSize, family)` 且没有相邻字符，因此累加的 advance 无法恢复 kerning（在包含大量字距调整的字符串上误差约为 ~10%）。全字符串度量会通过 `measureEm` 并且是精确的。

要检查是否有任何文本是使用编造的 advance 进行测量的，来自 [`@vectojs/layout`](/reference/core-layout/) 的 `unmeasuredGlyphCount()` 会对它们进行计数，并且一次性的控制台警告会指出修复方法。它不同于 `LayoutResult.fallbackToCanvas`，后者仅报告 **atlas** 未命中，并且即使在浏览器中几乎每个段落都会返回 true。

## `@vectojs/tex` —— 零 DOM 的 TeX 排版

`@vectojs/tex` 是 [`Markdown`](/reference/ui-markdown/) 的 `$…$` / ` ```math ` 块背后的独立包。它内置了 KaTeX 的解析/排版内核，并将结果重新输出为一个**自包含的 SVG 字符串**，携带自己的字形轮廓且不引用任何外部内容——这是唯一一种能经受通过 `data URI → Image → createImageBitmap` 栅格化的形式。它是延迟加载的（只有在公式实际出现时才加载），并且是一个独立的、公开的、带版本号的包；`@vectojs/core` **不**重新导出它。

```ts
import { layout, emitSVG } from '@vectojs/tex';

const { svg, width, height, depth } = emitSVG(layout('x^2 + y^2 = z^2'));
```

两个 emit 层辅助函数让自定义调用者无需样式表（canvas 没有样式表）即可重现 KaTeX 的样式表派生字体选择：

```ts
resolveFont(classes: readonly string[]): ResolvedFont
// ResolvedFont = { font: FontName; substituted: boolean }

sizingRatio(classes: readonly string[]): number
```

`resolveFont` 将 KaTeX span 的 CSS 类映射到一个具体内置的字体文件（`FontName`，例如 `'Main-BoldItalic'`、`'Size2-Regular'`）。字体选择是**继承的，而非局部的**——嵌套在 `Span[delimsizing size1]` 下的 `SymbolNode` 带有空的类列表，因此请传入每个祖先类的连接后跟符号自身的类，最外层在前（后出现的条目胜出）。请求的字重/样式如果该字族未提供，则会降级到其 Regular 字面，并设置 `substituted: true`，而不是静默地绘制错误。

`sizingRatio` 将 `katex-sizing reset-size<N> size<M>` 类转换为 script/scriptscript 缩放倍率（`toMultiplier / fromMultiplier`）；当这些类不带缩放时返回 `1`，因此调用者可以无条件地进行乘法。这些是 `@vectojs/tex` 以 `ex` 相对度量报告尺寸的底层机制。

`FontName`、`ResolvedFont`、`layout`、`emitSVG` 和 `LayoutOptions` 也从 `@vectojs/tex` 导出（参见其 `src/index.ts`）。

## 相关

[布局引擎](/reference/core-layout/)（它渲染的冷/热过程）·
[渲染器](/reference/core-renderer/)（WebGL point 层、内容投影）·
[`@vectojs/core` 概述](/reference/core-api/)
