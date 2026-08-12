+++
title = "Text & Bidi"
description = "獨立的 @vectojs/text 套件（也是 @vectojs/core/text 子路徑）：排版度量、MSDF 字型解析、阿拉伯文塑形與 bidi 解析器，加上 core 內建的 MSDFTextEntity/GridTextEntity GPU 文字渲染器。"
weight = 7
+++

# Text & Bidi — `@vectojs/text`

文字塑形基礎元件——`BidiResolver`、`ArabicShaper`、`Typography`、`MSDFFont`、`prepareContentGrid`/`PreparedContentGrid`——是獨立的 **`@vectojs/text`** 套件（一個僅依賴 `bidi-js` 的葉套件）。基於 `Entity` 的 GPU 文字渲染器（`MSDFTextEntity`、`SVGEntity`、`TextEntity`/`GridTextEntity`）留在 [`@vectojs/core`](/reference/core-api/) 中，因為它們擴展了 `Entity`。Core 重新匯出 `@vectojs/text` 的基礎元件，因此它們可以從 `@vectojs/text`、`@vectojs/core` 或 `@vectojs/core/text` 子路徑解析。建構於 [Layout engine](/reference/core-layout/) 的冷/熱分割之上。

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
BidiResolver.reorderSegments(str: string, levels: Uint8Array, baseLevel: number):
  Array<[number, number]>
```

輕量級內建 bidi：基於範圍的方向類別（希伯來文/阿拉伯文 R/AL、
EN/AN 數字）和阿拉伯文上下文呈現形式選擇。`indexMap` 將
塑形後的索引映射回原始字串，用於點擊測試 / 游標映射。

`reorderVisual` 就地重排節點物件陣列。`reorderSegments` 暴露相同的 UAX #9 **L2** 反轉範圍（運行自身位置上的包含性 `[start, end]` 索引對），而不需要節點物件，因此持有**並行 typed-array** 的呼叫者可以就地套用相同的置換 — 這就是零 GC 緩衝路徑所使用的。`reorderVisual` 現在委託給它，因此兩者不會產生偏差。

用法請參閱 [Text & Typography](/learn/text-typography/)。

## 無頭環境下的文本度量

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

文字測量通常透過 Canvas 2D 內容進行，它會測量渲染器實際要繪製的字型。如果沒有內容——如 Node SSR、沒有 `OffscreenCanvas` 的 Web Worker——就沒有東西可以用來測量，每個字形的 advance 都會退化為一個固定的 `0.5em`。與 Chrome 下 32px 的 `sans-serif` 相比，這在窄文字上誤差達到了 **+125%**，在寬文字上誤差為 **−47%**，並且 `iiiiiiiiii` 會和 `WWWWWWWWWW` 完全一樣寬。自動換行也會繼承這個誤差，導致斷行位置同樣出錯。

`createMeasuringContext()` 是這種情況的輕量級逃生艙：它建立一個 1×1 的離屏 `<canvas>`（附加到文件 body，不可見，`aria-hidden`）並傳回其 2D 內容，用於測量沒有已註冊度量 source 的字型——在無 DOM 環境中則傳回 `null`。它就是引擎本身會使用的內容，因此它測量的是渲染器實際繪製的字型，這是上面基於註冊表的路徑所做不到的。共享的單一度量內容（`getSharedMeasuringContext` / `isSharedMeasuringContextAttached` / `resetSharedMeasuringContext`，同樣來自 `@vectojs/text`）是一個單獨的記憶化內容，用於每個 `@vectojs/*` 套件——`ctx.font` 在每次讀取前都會被指派，因此共享不會洩露過期的測量值。

在啟動時註冊一次測量資料即可修復此問題。任何 `msdf-atlas-gen` 產生的 JSON 都可以，並且只讀取其中的 `glyphs[].advance`、`kerning` 和 `metrics`——圖集圖片是無關緊要的，因此一個純測量檔案就足夠了，不會進行任何解碼：

```ts
import { registerMSDFFontMetrics } from '@vectojs/core';

registerMSDFFontMetrics('sans-serif', await readFile('inter.json', 'utf8'));
```

字型 family 會不區分大小寫地匹配並去除引號，逗號分隔的清單只註冊它的第一個 family。再次註冊相同的 family 會替換先前的 source，而 `clearFontMetrics()` 會丟棄所有內容（這對測試隔離很有用，因為註冊表是處理程序全域的）。

對於非 MSDF 字型，可以直接提供一個 source：

```ts
interface FontMetricsSource {
  advanceEm(char: string): number | undefined; // required
  measureEm?(text: string): number | undefined; // honors kerning
  ascenderEm?: number; // for cssLineBoxBaseline
  descenderEm?: number;
}
```

有三條路徑會查閱該註冊表：佈局引擎中的逐字形 advance、`@vectojs/ui` 中的全字串寬度（用於確定 `Button`、`Input`、`Link`、`Checkbox`、`ContextMenu`、`ProgressBar` 的尺寸），以及 `cssLineBoxBaseline` 中的基線（這需要 `ascenderEm`/`descenderEm`）。

> [!IMPORTANT]
> 真實的 Canvas 2D 內容永遠優先，因此註冊測量資料不能改變瀏覽器測量或繪製的結果。它們的存在是為了取代編造的猜測，而不是為了覆蓋將要渲染文字的引擎。

`measureEm` 是值得提供的。逐字形的契約是 `measure(char, fontSize, family)` 且沒有相鄰字元，因此累加的 advance 無法恢復 kerning（在包含大量字距調整的字串上誤差約為 ~10%）。全字串測量會透過 `measureEm` 並且是精確的。

要檢查是否有任何文字是使用編造的 advance 進行測量的，來自 [`@vectojs/layout`](/reference/core-layout/) 的 `unmeasuredGlyphCount()` 會對它們進行計數，並且一次性的主控台警告會指出修復方法。它不同於 `LayoutResult.fallbackToCanvas`，後者僅報告 **atlas** 未命中，並且即使在瀏覽器中幾乎每個段落都會返回 true。

## `@vectojs/tex` —— 零 DOM 的 TeX 排版

`@vectojs/tex` 是 [`Markdown`](/reference/ui-markdown/) 的 `$…$` / ` ```math ` 區塊背後的獨立套件。它內建了 KaTeX 的解析/排版核心，並將結果重新輸出為一個**自包含的 SVG 字串**，攜帶自己的字形輪廓且不參照任何外部內容——這是唯一能經受透過 `data URI → Image → createImageBitmap` 柵格化的形式。它是延遲載入的（只有在公式實際出現時才載入），並且是一個獨立的、公開的、帶版本號的套件；`@vectojs/core` **不**重新匯出它。

```ts
import { layout, emitSVG } from '@vectojs/tex';

const { svg, width, height, depth } = emitSVG(layout('x^2 + y^2 = z^2'));
```

兩個 emit 層輔助函式讓自訂呼叫者無需樣式表（canvas 沒有樣式表）即可重現 KaTeX 的樣式表派生字型選擇：

```ts
resolveFont(classes: readonly string[]): ResolvedFont
// ResolvedFont = { font: FontName; substituted: boolean }

sizingRatio(classes: readonly string[]): number
```

`resolveFont` 將 KaTeX span 的 CSS 類別對應到一個具體內建的字型檔案（`FontName`，例如 `'Main-BoldItalic'`、`'Size2-Regular'`）。字型選擇是**繼承的，而非局部的**——巢狀在 `Span[delimsizing size1]` 下的 `SymbolNode` 帶有空的類別清單，因此請傳入每個祖先類別的串接後跟符號自身的類別，最外層在前（後出現的條目勝出）。請求的字重/樣式如果該字族未提供，則會降級到其 Regular 字面，並設定 `substituted: true`，而不是無聲地繪製錯誤。

`sizingRatio` 將 `katex-sizing reset-size<N> size<M>` 類別轉換為 script/scriptscript 縮放倍率（`toMultiplier / fromMultiplier`）；當這些類別不帶縮放時傳回 `1`，因此呼叫者可以無條件地進行乘法。這些是 `@vectojs/tex` 以 `ex` 相對度量報告尺寸的底層機制。

`FontName`、`ResolvedFont`、`layout`、`emitSVG` 和 `LayoutOptions` 也從 `@vectojs/tex` 匯出（參見其 `src/index.ts`）。

## 相關

[Layout engine](/reference/core-layout/)（此處渲染的冷/熱傳遞）·
[Renderers](/reference/core-renderer/)（WebGL point layer、內容投射）·
[`@vectojs/core` 概覽](/reference/core-api/)
