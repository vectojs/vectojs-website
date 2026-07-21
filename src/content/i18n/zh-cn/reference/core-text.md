---
title: 'Text & Bidi'
description: '独立的 @vectojs/text 包（也是 @vectojs/core/text 子路径）：排版度量、MSDF 字体解析、阿拉伯文塑形和 bidi 解析器，外加驻留于 core 的 MSDFTextEntity/GridTextEntity GPU 文本渲染器。'
order: 7
---

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

解析事实标准的 `msdf-atlas-gen` JSON，并将文本排布成带图集 UV 的 CSS 像素四边形（y 向下的局部空间；v=0 在图集顶部）。将 `layout()` 与 WebGL 后端的 `setMSDFTexture` + `addGlyph`（参见 [WebGL point 层](/reference/core-renderer/#webgl-point-层)）配对以获得分辨率无关的 GPU 文本。类型：`MSDFFontData`、`MSDFAtlasInfo`、`MSDFMetrics`、`MSDFGlyphDef`、`MSDFBounds`、`MSDFKerning`、`PositionedGlyph`、`MSDFLayoutResult`、`MSDFLayoutOptions`。

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
```

轻量的内置 bidi：基于范围的方向类（希伯来文/阿拉伯文 R/AL、EN/AN 数字）和阿拉伯文上下文表现形式选择。`indexMap` 将成形索引映射回源字符串，用于命中测试/光标映射。

参见[文本与排版](/learn/text-typography/)了解用法。

## 相关

[布局引擎](/reference/core-layout/)（它渲染的冷/热过程）·
[渲染器](/reference/core-renderer/)（WebGL point 层、内容投影）·
[`@vectojs/core` 概述](/reference/core-api/)
