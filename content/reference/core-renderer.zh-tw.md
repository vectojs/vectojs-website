+++
title = "Renderers"
description = "@vectojs/core/renderer 子路徑：與後端無關的 IRenderer 合約、CanvasRenderer、SVGRenderer、WebGL 點/矩形/sprite/MSDF 圖層、Entity 內容投射以及 parseColorToRGBA。"
weight = 5
+++

# Renderers — `@vectojs/core/renderer`

屬於 [`@vectojs/core`](/reference/core-api/)。

## IRenderer

與後端無關的繪圖表面，每個 `Entity.render` 都會收到。

```ts
interface IRenderer {
  readonly pixelRatio?: number; // device px per CSS px of the backing store (1.29.0+)

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

  // GPU context loss (optional; implement for a GPU-backed renderer)
  isContextLost?(): boolean; // Scene skips the render pass while true
  onContextRestored?(cb: () => void): void; // Scene repaints the cleared surface
}
```

### `pixelRatio`——為將被 blit 的像素做點陣化

已經**套用到**繪圖上下文的比例，即每個 CSS 像素對應的裝置像素數（`1.29.0+`）。當你點陣化一張隨後會被 blit 進渲染器的紋理時，請讀取它而非 `window.devicePixelRatio`，並用它作為這類紋理快取的鍵。

這兩個值會有差異，而且兩種差異都會破壞 blit：

- 後端會**箝制**（`CanvasRenderer.maxDPR`、`SceneOptions.maxDPR`），因此按視窗的比例點陣化會產出一張被縮放後的上下文再次重新取樣的紋理；
- `window.devicePixelRatio` 在縮放生效的瞬間就改變，而後備儲存只有在某處呼叫 `resize()` 時才重新配置。在這段視窗期內的即時讀取回報的是**未來**的比例，因此以它為鍵的快取會為上下文尚未採用的縮放做點陣化——同一個缺陷的反面。

在模組作用域裡擷取一次的值比上述兩者都更糟：它根本無法跟隨縮放或顯示器切換。這正是本屬性存在的意義所在——讓那個缺陷可被修復；而 `Markdown` 的程式碼字形圖集池就是儲存庫內的消費方：它以此值為鍵維護一個有界 LRU 的 `GlyphRasterAtlas` 實例，這就是瀏覽器縮放後程式碼不再模糊的原因。

它是選用的，且是**即時**讀取而非快照：自身沒有後備儲存的後端會省略它，呼叫方將其缺失視為 `1`。`CanvasRenderer` 會在所有三個縮放上下文的位置記錄它實際套用的比例——建構、`resize()` 以及 `contextrestored` 復原——因此即使發生跨越一次縮放的 GPU 重設，該值依然真實。

### 因應 GPU 上下文遺失

GPU 重設或記憶體壓力驅逐會奪走繪圖上下文；如果不處理，表面將永久空白。擁有 GPU 上下文的渲染器應該：

1. 監聽其遺失事件並 `preventDefault()` 它 — 否則瀏覽器永遠不會觸發對應的恢復事件；
2. 回報 `isContextLost() === true`，讓 `Scene.render` 跳過渲染傳遞，而非對著失效的上下文發出繪圖呼叫；
3. 在恢復時重新取得上下文、重新套用 DPR 變換/尺寸，並觸發 `onContextRestored` 回呼，讓 Scene 重新繪製新清空的影格緩衝區。

`CanvasRenderer` 為 Canvas2D 執行此操作，`ThreeRenderer` 為 WebGL 執行此操作 — 請參閱 [`@vectojs/three`](/reference/three-renderer/#gpu-shang-xia-wen-yi-shi-yu-yun-xing-shi-dpr)。

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

### 使用 `ContentProjectionHint` 的行視窗化（`1.30.0+`）

視口外的 entity 會被整體略過，但**比視口更高**的 entity 總是能通過那道閘門——而且過去會接著鏡像它的每一行。一份長文件會為整份文件的每個視覺行產生一個 DOM 節點（實測：一份 346 KB 的 Markdown 文件產生 14.8k 個元素）。

Scene 現在會傳入一個提示，描述值得投影的 entity 局部垂直帶，並只鏡像其中的行：

```ts
interface ContentProjectionHint {
  minY?: number; // entity-local top of the band worth projecting
  maxY?: number; // entity-local bottom
}
```

遵循它是選擇性的——忽略該參數一切仍然照常運作，只是沒有這份節省。在一份 4,000 行的文件上測得：

|            | 之前          | 之後            |
| ---------- | ------------- | --------------- |
| Chrome     | 4.21 ms/frame | 0.20 ms (21.1x) |
| Firefox    | 4.83 ms/frame | 0.14 ms (34.5x) |
| DOM 子節點 | 36,000        | 1,026 (35x)     |

此後投影開銷在 20 倍的文件尺寸範圍內維持**平坦**，因為它跟隨視口而不是文件。

請使用 `contentLineInHint(hint, y, height)`，使每個實作對邊界的取整方式完全一致：

```ts
getContentProjection(hint?: ContentProjectionHint) {
  const lines = this.allLines.filter((l) => contentLineInHint(hint, l.y, l.lineHeight));
  return { text: this.text, selectable: true, lines };
}
```

> [!IMPORTANT]
> 請發出**連續**的一段行，並且在 `text` 非空時永不發出空的一段。DOM 順序正是瀏覽器在擴展選取或序列化複製時所走的順序，因此一個空隙會讓跨越它的拖曳悄悄漏掉中間那些行。`lines` 為空而 `text` 非空會使 Scene 回退為對整份文件投影一個文字節點。

網格投影不同：請讓 `lines` 維持**稀疏且與文件索引對齊**，因為 Scene 是按絕對列號索引它的。把它壓緊會把第 20 列的幾何交給第 0 列，並錯置每一個載體——不會報錯，只是選取幾何是錯的。

被具體化的視窗會作為 `data-vecto-projection-window` 發布在鏡像上，因此工具可以區分「這一行不在這裡」和「這一行不存在」。

在視口之外還要保留多少行與 entity，由 `contentProjectionMargin` 決定（參見 [`SceneOptions`](/reference/core-scene/#sceneoptions)），預設為一個視口高度。`Infinity` 會停用視窗化並具體化全部內容，這對於希望整份文件都在 DOM 中的測試偶爾有用。

Core 會在字型載入後校準保留的載體，並在本地網格空間中路由指標
選取。Firefox 字型替代、DPR、瀏覽器縮放、
旋轉、鏡像變換和非均勻縮放因此使用同一個幾何
方案。校準探針會繼承投射的縮放上下文並考慮
Firefox 缺失字型回退度量；自訂 resize/zoom 擁有者必須呼叫
`scene.resize()` 以使保留的校準失效。一般的 `lines`
投射和無行自訂投射也使用
轉換後的二維字素游標幾何。

`present()` 由 Scene 在每個渲染傳遞結束時精確呼叫**一次**。
一次性提交整個幀的保留後端（例如來自 [`@vectojs/three`](/reference/three-renderer/#gpu-shang-xia-wen-yi-shi-yu-yun-xing-shi-dpr) 的 `ThreeRenderer`）
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
> `{ width, height, color }`（請參閱 [`Entity`](/reference/core-entity/#a11y-pi-ci-chu-li-gua-gou-fu-xie-yi-qi-yong)）
> 是提供此圖層的每個實體選擇性啟用機制。

`flush()` **每種圖元類型最多一次繪製呼叫**，因此繪製呼叫次數不是擴充限制 —— 上傳的位元組數才是。自 core 1.16.2 起，每個四邊形批次（矩形、sprite、字形、圓形）上傳 **4 個頂點**，並使用 `drawElements` 針對一個共享的靜態 32 位元索引緩衝區進行繪製，而不是擴充為 6 個頂點交給 `drawArrays`。這移除了每個四邊形重複的兩個角點，將上傳量減少了三分之一；索引緩衝區構建一次並按幾何級數增長，每幀從不重新傳送。索引是 32 位元的，因為 `Uint16Array` 會將批次限制在 16,383 個四邊形，而實際場景會超過這個數值。

在實際硬體（RTX 4060 筆記型電腦，測量包含 `gl.finish()`，12 次取中位數）上與之前的 6 頂點路徑對比：

| quads/frame | Chrome         | Firefox         |
| ----------- | -------------- | --------------- |
| 12,000      | 0.61 → 0.09ms  | 2.66 → 1.47ms   |
| 50,000      | 2.22 → 0.87ms  | 9.02 → 6.24ms   |
| 100,000     | 12.62 → 3.12ms | 16.81 → 10.88ms |

大約低於 **35,000–50,000 quads/frame** 時，填充頂點緩衝區的 JS 開銷超過了 GPU 提交；高於這個數值時 GPU 提交佔主導，有效的杠杆變為減少繪製（淘汰、虛擬化）而不是調整填充。Firefox 保持近 ~1 GB/s 的有效上傳頻寬，與頂點佈局無關，因此在該引擎上減少位元組是唯一可靠的杠杆。

## parseColorToRGBA

```ts
parseColorToRGBA(css: string): RGBA           // RGBA = [number, number, number, number] 在 [0,1]
```

`#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa` 和 `rgb()`/`rgba()` 的快速路徑；其他
形式（命名、`hsl()`、…）在 DOM 存在時透過快取的 1×1 canvas 解析。
結果**被快取並按身份共享 — 將回傳的陣列視為唯讀。**
無 DOM 且無法解析的輸入 → 不透明黑色 `[0,0,0,1]`。

該快取保存 1,000 個條目並按**插入順序（FIFO）**淘汰。快取命中故意**不**提升其條目：此函數每個四邊形呼叫一次，在 ~25,000 quads/frame 時，真正的 LRU 所需的 `Map.delete` + re-`set` 組合的開銷超過了函數中其他所有部分的總和。實際結果是，如果場景的不同顏色工作集超過 1,000，一個早期插入的熱門顏色可能會被淘汰並重新解析；對於典型場景，工作集小而穩定，因此 FIFO 和 LRU 淘汰相同的條目。

## 相關

[`Entity`](/reference/core-entity/)（批次處理掛鉤、內容投射）·
[`ComputeParticleEntity`](/reference/core-particles/)（WebGL/WebGPU 消費者）·
[Text & Bidi](/reference/core-text/)（MSDF 字形消費者）·
[`@vectojs/three` 的 `ThreeRenderer`](/reference/three-renderer/)（替代的 `IRenderer`）·
[`@vectojs/core` 概覽](/reference/core-api/)
