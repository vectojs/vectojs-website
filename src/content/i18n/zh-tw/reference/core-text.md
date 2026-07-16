---
title: 'Text & Bidi'
description: '@vectojs/core/text 子路徑：MSDF 字型解析與 GPU 文字渲染、TextEntity/GridTextEntity，以及內建的阿拉伯文塑形 + bidi 解析器。'
order: 7
---

# Text & Bidi — `@vectojs/core/text`

屬於 [`@vectojs/core`](/reference/core-api/)。建構於
[Layout engine](/reference/core-layout/) 的冷/熱分割之上。

## MSDFFont

```ts
new MSDFFont(data: MSDFFontData)
MSDFFont.parse(json: string | MSDFFontData): MSDFFont   // 讀取 msdf-atlas-gen JSON
font.getGlyph(unicode: number): MSDFGlyphDef | undefined
font.layout(text, fontSizePx, opts?: MSDFLayoutOptions): MSDFLayoutResult   // 支援 \\n、字距、letterSpacing
font.distanceRange / font.atlasWidth / font.atlasHeight
```

解析事實標準的 `msdf-atlas-gen` JSON 並將文字排版為 CSS 像素四邊形，附帶
紋理 UV（y 向下本地空間；v=0 在紋理集頂端）。將 `layout()` 與 WebGL
後端的 `setMSDFTexture` + `addGlyph` 搭配使用（請參閱 [WebGL point layer](/reference/core-renderer/#webgl-point-layer)）
以實現解析度無關的 GPU 文字。類型：
`MSDFFontData`、`MSDFAtlasInfo`、`MSDFMetrics`、`MSDFGlyphDef`、`MSDFBounds`、
`MSDFKerning`、`PositionedGlyph`、`MSDFLayoutResult`、`MSDFLayoutOptions`。

## MSDFTextEntity

```ts
new MSDFTextEntity(text: string, options: MSDFTextEntityOptions)
// options: { font: MSDFFont, texture: TexImageSource, fallbackFont?, fontSize?, color?, lineHeight?, letterSpacing? }
setText(text: string): void
```

在場景執行 `pointBackend: 'webgl'` 時，透過 WebGL point layer 渲染清晰的
MSDF 字形；否則回退到使用 `fallbackFont` 的 Canvas2D `fillText`。
排版透過 `LayoutWorkerManager` **在執行緒外**計算並在
回呼時套用，呼叫 `markDirty()` — 因此文字會在建立/`setText` 後
一個非同步 tick 出現。

## TextEntity & GridTextEntity（來自 `.`）

```ts
new TextEntity(text: string, atlas: GlyphAtlas, maxWidth: number, fontSize = 32)
text.setText(text): this        // 冷傳遞（重新分段 + 重新測量），然後重新排版
text.setMaxWidth(maxWidth): this // 僅熱傳遞 — 重用快取的 PreparedText（廉價的響應式調整大小）
text.setTextAlign(align: 'left' | 'justify'): this
text.setHyphenator(fn: ((word: string) => string[]) | null): this

new GridTextEntity(_atlas: any, fontSize = 10)
grid.updateGrid(ascii: string[])   // 等寬單元格網格；interactive=false（為效能關閉 a11y）
```

`setTextAlign('justify')` 將換行拉伸至 `maxWidth` 對齊（字詞間
空格，或無空格 CJK 行上的字元間距）；每個
段落的最后一行保持不對齊。`setHyphenator()` 插入一個單字 → 片段函式（例如
`hyphen` npm 套件的 Knuth–Liang 模式），使長單字可以在中間斷開
並顯示可見的 `-`；來源文字中已有的軟連字符（U+00AD）無需
連字符工具即可運作。兩者皆適用，因為 `TextEntity` **按字形**在每個
節點的計算 `x` 處渲染 — 對齊/連字符的數學計算在視覺上被完整呈現。

`MSDFTextEntity` 和 `@vectojs/ui` 的 `Text`/`RichText` 元件共享相同的
底層 `LayoutEngine`，但尚未公開這兩種方法 — `Text`/`RichText`
為了效能將每個換行渲染為一個原生 `fillText()` 呼叫，
這即使在選項已公開的情況下也會無聲丟棄每個字形的對齊偏移量。
當您需要對齊或連字符文字時，請直接使用 `TextEntity`
（或使用設定了 `textAlign`/`hyphenate` 的原始 `LayoutEngine`）。

## Bidi / 塑形

```ts
ArabicShaper.shapeArabic(text: string): ShapedResult   // { shapedText, indexMap: Int32Array } — 呈現形式連字
BidiResolver.getBaseLevel(text: string): number
BidiResolver.resolveLevels(text: string): Uint8Array
BidiResolver.reorderVisual(nodes: any[], baseLevel: number): void
```

輕量級內建 bidi：基於範圍的方向類別（希伯來文/阿拉伯文 R/AL、
EN/AN 數字）和阿拉伯文上下文呈現形式選擇。`indexMap` 將
塑形後的索引映射回原始字串，用於點擊測試 / 游標映射。

用法請參閱 [Text & Typography](/learn/text-typography/)。

## 相關

[Layout engine](/reference/core-layout/)（此處渲染的冷/熱傳遞）·
[Renderers](/reference/core-renderer/)（WebGL point layer、內容投射）·
[`@vectojs/core` 概覽](/reference/core-api/)
