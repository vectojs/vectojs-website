---
title: 'Renderers'
description: '@vectojs/core/renderer 子路徑：與後端無關的 IRenderer 合約、CanvasRenderer、SVGRenderer、WebGL 點/矩形/sprite/MSDF 圖層、Entity 內容投射以及 parseColorToRGBA。'
order: 5
---

# Renderers — `@vectojs/core/renderer`

屬於 [`@vectojs/core`](/reference/core-api/)。

## IRenderer

與後端無關的繪圖表面，每個 `Entity.render` 都會收到。

```ts
interface IRenderer {
  clear(): void;
  save(): void;
  restore(): void;
  translate(x, y): void;
  scale(x, y): void;
  rotate(angle): void; // 弧度，順時針
  setGlobalAlpha(alpha): void; // [0,1]
  clip(x, y, width, height): void; // 相交裁剪矩形（包在 save/restore 中）

  beginPath(): void;
  moveTo(x, y): void;
  lineTo(x, y): void;
  bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y): void;
  closePath(): void;
  arc(x, y, radius, startAngle, endAngle, counterclockwise?): void;
  roundRect(x, y, width, height, radii: number | number[]): void;

  drawImage(source: CanvasImageSource, dx, dy, dw, dh): void;
  fill(colorOrGradient: string | any): void;
  stroke(colorOrGradient: string | any, lineWidth = 1): void;
  fillText(text, x, y, font, color): void; // font = CSS 簡寫，例如 '16px monospace'

  fillCircle(cx, cy, radius, color, alpha = 1): void; // 保持順序的同風格批次
  flush(): void; // 提交待處理批次（閒置時無操作）
  present?(): void; // 可選的幀結束提交
  createLinearGradient(x0, y0, x1, y1, colorStops: { stop; color }[]): any;
  dispose?(): void; // 冪等的後端清理；Scene.destroy() 會呼叫它
}
```

`fillCircle` 將連續相同 `color`/`alpha` 的呼叫合併為一個路徑，
在 `flush()` 時提交（或當樣式改變時）。Scene 在每個
兄弟群組結束時和每幀結束時刷新，以保持繪畫者順序。

## `Entity.getContentProjection()`

```ts
getContentProjection(): ContentProjection | null // 預設 null
// ContentProjection: {
//   text: string; font?: string; lineHeight?: number; selectable?: boolean;
//   contentX?: number; contentY?: number; baseline?: number;
//   lines?: Array<{ text; x; y; baseline; font?; lineHeight?; runs? }>;
//   grid?: PreparedContentGrid;
// }
```

為渲染靜態文字的實體提供的選擇性掛鉤：Scene 將
回傳的字串鏡像為透明、位置同步的 DOM 節點（視口惰性、
髒檢查，當實體為互動時設為 `aria-hidden`），使 canvas
文字可被找到、螢幕閱讀器/爬蟲可見、可翻譯，並且 — 搭配
`selectable: true` — 可原生選取。`TextEntity`/`MSDFTextEntity`
（請參閱 [Text & Bidi](/reference/core-text/)）實作了此功能。場景級關閉開關：
`new Scene(canvas, { contentProjection: false })`。

Scene 在投射節點出現或消失時保持 VMT 順序，
在其實體子樹被移除時移除子代投射，並在投射
完全位於視口外或 `clipChildren` 祖先內時隱藏投射。
工具無需查詢 DOM 即可檢查當前具體化的鏡像：

```ts
scene.getContentElement(entityId): HTMLElement | undefined;
```

虛擬化或未具體化的視口外文字在應用程式將其帶入
活動場景之前無法搜尋。

> 需要 Core 1.6.0 或更新版本：Canvas 接受文字位置作為
> 基線，而 CSS 接受行盒。如需精確選取幾何，請為簡單的文字行提供
> `contentX`/`contentY` 和 `baseline`，或當元件已擁有
> 換行、內縮或混合排版時，為每個可視行提供一個明確的
> `lines` 條目。Scene 會透過實體
> 變換映射這些本地座標，並將 CSS 行盒與 Canvas 字型度量同步。

```ts
getContentProjection() {
  return {
    text: 'small large',
    selectable: true,
    lines: [{
      text: 'small large', x: 18, y: 12, baseline: 25,
      font: '28px sans-serif', lineHeight: 42,
      runs: [
        { text: 'small ', font: '16px sans-serif' },
        { text: 'large', font: 'bold 28px sans-serif' },
      ],
    }],
  };
}
```

在自訂 Canvas 原生編輯器中使用 `cssLineBoxBaseline(font, lineHeight)`，
當相同文字必須與原生控制項或內容投射對齊時。

> Core 1.8 為類程式碼渲染器新增了 `prepareContentGrid(source, metrics)`。
> 將其一成不變的結果作為 `ContentProjection.grid` 回傳，並使用相同的
> 單元格進行 Canvas 繪製。網格保留 UTF-16 來源範圍、合法字素
> 游標、CR/LF/CRLF 分隔符、製表符、寬 CJK 和表情符號前進寬度、阿拉伯文
> 塑形以及 Unicode bidi 位置，同時投射的 DOM 保持精確的
> 邏輯來源以利複製和搜尋。

```ts
const grid = prepareContentGrid(source, {
  font: codeFont,
  cellWidth,
  lineHeight: 24,
  baseline: 18,
});

getContentProjection() {
  return { text: source, selectable: true, grid };
}
```

Core 會在字型載入後校準保留的載體，並在本地網格空間中路由指標
選取。Firefox 字型替代、DPR、瀏覽器縮放、
旋轉、鏡像變換和非均勻縮放因此使用同一個幾何
方案。校準探針會繼承投射的縮放上下文並考慮
Firefox 缺失字型回退度量；自訂 resize/zoom 擁有者必須呼叫
`scene.resize()` 以使保留的校準失效。一般的 `lines`
投射和無行自訂投射也使用
轉換後的二維字素游標幾何。

`present()` 由 Scene 在每個渲染傳遞結束時精確呼叫**一次**。
一次性提交整個幀的保留後端（例如來自 [`@vectojs/three`](/reference/three-renderer/) 的 `ThreeRenderer`）
應在此處進行其單次昂貴提交，並保持 `flush()` 輕量 —
Scene 會在每個非批次節點周圍呼叫 `flush()`，因此昂貴的 `flush()`
會使幀成本與實體數量成二次方關係。

## CanvasRenderer

```ts
new CanvasRenderer(canvas: HTMLCanvasElement)
```

預設的 `IRenderer`。建構時套用 `devicePixelRatio` 縮放。將每個批次
`fill()` 限制在 `MAX_BATCH = 64` 個子路徑（單一 Canvas2D `fill()` 在
子路徑數量上為超線性）。透過 `scene.getRenderer()` 取得控制代碼。

## TextRasterCache

_自 Core 1.12.0 起。_

```ts
new TextRasterCache(options?: { maxEntries?: number; dpr?: number })
cache.get(font: string, color: string, text: string): TextRaster | null
cache.clear(): void
cache.stats: { hits: number; misses: number; size: number }
```

一個預先柵格化文段的快取，適用於**每幀繪製相同的短字串數千次**的視圖（彈幕、聊天/日誌尾部、資料網格儲存格、粒子標籤）。`ctx.fillText()` 在規模化時出乎意料地昂貴：每次呼叫都會重新塑形字串、重新解析 CSS 顏色，並在 CPU 主執行緒上柵格化字形——效能剖析顯示主執行緒卡在原生（`(program)`）程式碼中，而 GPU 則飢餓閒置。

`get()` 將每個不同的 `(font, color, text)` 文段柵格化到一個小型的離屏 canvas 一次；之後每一幀你都用 `drawImage` 複製它，而非重新塑形。透過減去返回的偏移量在 `fillText` 基線處複製：

```ts
const r = cache.get('600 24px system-ui', '#38bdf8', label);
if (r) renderer.drawImage(r.canvas, x - r.offsetX, baselineY - r.offsetY, r.width, r.height);
else renderer.fillText(label, x, baselineY, '600 24px system-ui', '#38bdf8'); // headless fallback
```

`TextRaster` 是 `{ canvas, width, height, offsetX, offsetY }`（尺寸以 CSS px 為單位）。實例是隔離的（無共享的全域狀態）；`dpr > 1` 在 HiDPI 上保持文字清晰，同時複製尺寸維持在 CSS px；一個插入順序的逐出上限（`maxEntries`，預設 4096）針對無界（使用者輸入）內容限制記憶體；`get()` 在無頭/非 DOM 環境中返回 `null`，因此你保留一個 `fillText` 回退。收益來自**重複使用**——僅繪製一次的文段純粹是額外開銷。

## SVGRenderer

```ts
new SVGRenderer(width: number, height: number)
toXMLString(): string
```

軟體 `IRenderer`，將繪製操作記錄到平面 SVG 字串中（矩陣/透明度/裁剪
堆疊、漸層去重）。文字和屬性值經過 XML 跳脫，外部
圖片 URL 拒絕 executable/data/file/custom 方案（Canvas 生成的光柵
資料 URL 仍受支援）。支援 `scene.toSVG()`。`SVGLinearGradient` 為
漸層描述器類型。

## WebGL point layer

```ts
createWebGLPointRenderer(canvas: HTMLCanvasElement): PointRenderer | null   // 若 WebGL2 / shader 不可用則為 null

interface PointRenderer {
  resize(width, height): void;                 // 邏輯尺寸；套用 DPR
  begin(): void;                               // 重置每幀緩衝區
  addCircle(x, y, radius, color, alpha?): void;        // 世界座標
  addRect(x, y, width, height, color, alpha?, rotation?): void;
  setTexture(source: TexImageSource): void;
  addSprite(x, y, width, height, u0, v0, u1, v1, color?, alpha?, rotation?): void;
  setMSDFTexture(source: TexImageSource, distanceRange: number): void;
  addGlyph(x, y, width, height, u0, v0, u1, v1, color?, alpha?, rotation?): void;
  flush(): void;                               // 清除 + 繪製所有累積的原始圖形
  destroy(): void;
}
```

一個 WebGL2 canvas，四個批次程式：點（圓形，透過 `gl_PointSize` AA）、
矩形（擴展三角形）、紋理 sprite 和 MSDF 字形（三中取二
距離重建，任何縮放下都清晰）。`color` 色調；白色紋理像素
保持不變。Sprite/字形新增在紋理設定前為無操作。Scene 在
`pointBackend: 'webgl'` 時將 `getBatchCircle`/`getBatchRect`（以及 CPU 粒子、MSDF 文字）路由至此。
在變換下，GPU 原始圖形無法精確表示的葉節點
（例如非均勻縮放或剪切）會回退到
一般 renderer。

> Entity 掛鉤 `getBatchCircle()` → `{ radius, color }` 和 `getBatchRect()` →
> `{ width, height, color }`（請參閱 [`Entity`](/reference/core-entity/#a11y--批次處理掛鉤覆寫以啟用)）
> 是提供此圖層的每個實體選擇性啟用機制。

## parseColorToRGBA

```ts
parseColorToRGBA(css: string): RGBA           // RGBA = [number, number, number, number] 在 [0,1]
```

`#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa` 和 `rgb()`/`rgba()` 的快速路徑；其他
形式（命名、`hsl()`、…）在 DOM 存在時透過快取的 1×1 canvas 解析。
結果**被快取並按身份共享 — 將回傳的陣列視為唯讀。**
無 DOM 且無法解析的輸入 → 不透明黑色 `[0,0,0,1]`。

## 相關

[`Entity`](/reference/core-entity/)（批次處理掛鉤、內容投射）·
[`ComputeParticleEntity`](/reference/core-particles/)（WebGL/WebGPU 消費者）·
[Text & Bidi](/reference/core-text/)（MSDF 字形消費者）·
[`@vectojs/three` 的 `ThreeRenderer`](/reference/three-renderer/)（替代的 `IRenderer`）·
[`@vectojs/core` 概覽](/reference/core-api/)
