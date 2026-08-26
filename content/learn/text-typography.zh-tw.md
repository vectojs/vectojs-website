+++
title = "文字與排版"
description = "VectoJS 的文字系統：冷/熱 LayoutEngine 分離、LLM 輸出串流、混合樣式豐富文字、MSDF 字型、阿拉伯文/BiDi 和排除形狀。"
weight = 14
+++

# 文字與排版

VectoJS 搭載了一個圍繞兩個關鍵理念構建的文字引擎：**將測量與布局分離**（以便調整大小避免重新測量），以及**在段落層級進行記憶化**（以便附加路徑可以重用未變更的開頭段落）。

## 即時試玩

<figure class="sandbox">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · @vectojs/core</span></div>
  <iframe src="/sandbox/text-streaming.html" class="sandbox-frame" loading="lazy" title="文字串流互動範例" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption><code>label.append(chunk)</code> 每 30 毫秒呼叫一次 — O(已變更的段落)，而非 O(文件)。點擊 Replay 重新開始串流。</figcaption>
</figure>

## 選擇正確的元件

| 情境                                 | 使用             |
| ------------------------------------ | ---------------- |
| 靜態或簡單動態文字                   | `Text`           |
| 混合樣式（粗體、斜體、連結、顏色）   | `RichText`       |
| Markdown 文件                        | `Markdown`       |
| 解析度無關的 GPU 文字（遊戲 UI、3D） | `MSDFTextEntity` |
| 等寬網格（終端機）                   | `GridTextEntity` |
| 由向量圖集支援的自訂文字             | `TextEntity`     |

`Text`、`RichText` 和 `Markdown` 位於 `@vectojs/ui` 中。基於 `Entity` 的文字渲染器（`MSDFTextEntity`、`GridTextEntity`、`TextEntity`）位於 `@vectojs/core` 中。它們所建構於其上的較底層塑形基礎元件——BiDi、阿拉伯文塑形、排版度量、MSDF 字型解析、預備內容網格——則是獨立的 `@vectojs/text` 套件，而斷行/行內布局引擎是 `@vectojs/layout`。兩者都由 `@vectojs/core` 重新匯出，因此你可以從任一處匯入它們。

### 可選取的固定網格文字

終端機、程式碼編輯器和其他逐格渲染器應使用 Core 1.8 的 `prepareContentGrid()` 編譯其邏輯來源。在 Canvas 上繪製返回的儲存格，並從 `getContentProjection()` 返回相同的不可變網格。這使得複製/查找來源、合法字素游標、製表符、CJK/表情符號寬度、阿拉伯文字形、雙向放置和瀏覽器選取保持在一個幾何計劃上，而不是維護第二個 DOM 布局。

透過 Canvas 使用瀏覽器解析的字型測量 `cellWidth`，每當來源或字型度量變更時重建網格，並在自訂容器或應用縮放變更後呼叫 `scene.resize()`。調整大小是 Firefox 字型替代和缺少字形範圍度量的冷校準邊界；穩定渲染重用已準備的載體，無需幾何讀取。

---

## Text

單行和多行文字，自動換行。底層運行核心 `LayoutEngine`（與其他文字元件相同的分割管線）。

```typescript
import { Text } from '@vectojs/ui';

const label = new Text('Hello, world', {
  font: '400 16px Inter', // CSS 縮寫
  color: '#e2e8f0',
  maxWidth: 300, // 在 300px 處換行；省略則不換行
  lineHeight: 24, // 行高，單位 px
  preserveLeadingSpaces: false,
});

label.setPosition(40, 40);
scene.add(label);
```

### 冷更新與熱更新

`Text` 有三種變異方法，成本差異很大：

```typescript
label.setText('New content'); // 昂貴 — 冷傳遞：重新分割 + 重新測量
label.append(' more tokens'); // 高效 — 僅最後一個段落被重新測量
label.setMaxWidth(200); // 便宜 — 熱傳遞：僅重新換行，不重新測量
```

在逐個令牌串流文字時使用此區別：

```typescript
// 錯誤 — 在每個令牌上重建完整的已測量文字
for await (const token of stream) {
  label.setText((accumulated += token)); // 每個令牌 O(文件) → 慢
}

// 正確 — 僅重新測量已變更的段落
for await (const token of stream) {
  label.append(token); // 重用未變更的段落；重新準備已變更的尾部
}
```

當使用者調整視窗大小時，呼叫 `setMaxWidth(newWidth)`——它使用快取的已測量文字進行重排，因此在每次調整大小事件時呼叫都是安全的。

---

## RichText

多樣式內聯文字：粗體、斜體、彩色、不同大小和連結的文字，全部在共享基線上一起流動。

```typescript
import { RichText } from '@vectojs/ui';
import type { StyledSpan } from '@vectojs/core';

const spans: StyledSpan[] = [
  { text: 'Build ' },
  { text: 'fast', style: { bold: true, color: '#00f0ff' } },
  { text: ' UIs with ', style: { italic: true } },
  { text: 'VectoJS', style: { bold: true, href: 'https://vectojs.org/' } },
  { text: '.' },
];

const rich = new RichText(spans, {
  font: '16px Inter',
  color: '#e2e8f0',
  maxWidth: 600,
  linkColor: '#38bdf8',
  onLinkClick: (href) => window.open(href, '_blank'),
});

scene.add(rich.setPosition(40, 40));
```

### `TextStyle` 欄位

```typescript
interface TextStyle {
  bold?: boolean;
  italic?: boolean;
  color?: string;
  fontSize?: number; // 覆蓋此段的基本字型大小
  href?: string; // 使此段成為連結
}
```

> [!NOTE] > `bold` 和 `italic` 僅影響渲染，不影響測量寬度（粗體筆劃會稍微超出前進寬度）。`fontSize` **確實**同時影響測量寬度和行高，因此在一行上混合大小可以正確運作——每行的高度由其最高的字形決定。

### 串流 `appendSpans()`

與 `Text.append()` 類似，`appendSpans()` 重用未變更的開頭段落：

```typescript
const rich = new RichText([]);
scene.add(rich);

for await (const token of llmStream) {
  rich.appendSpans([{ text: token, style: { color: '#a5f3fc' } }]);
}
```

### 排除形狀（文字繞過障礙物）

傳遞 `exclusions` 使文字繞過矩形障礙物——類似 CSS 的浮動：

```typescript
const rich = new RichText(spans, {
  maxWidth: 500,
  exclusions: [
    { x: 0, y: 60, width: 120, height: 120 }, // 避開 (0, 60) 處的 120×120 圖片
  ],
});

// 稍後，動態更新：
rich.setExclusions([{ x: 0, y: 60, width: 120, height: 120 }]);
```

引擎為每個行帶計算自由水平區間（`computeLineSegments`），並獨立填充每個區間。BiDi 重排序在區間放置後應用於整個邏輯行。

---

## Markdown

使用 `marked` 函式庫（GFM 風格）將 Markdown 渲染為 VMT 子樹。

```typescript
import { Markdown } from '@vectojs/markdown';

const md = new Markdown('# Hello\n\nThis is **rich** text.', {
  maxWidth: 700,
  theme: {
    headingColor: '#f8fafc',
    codeColor: '#a5f3fc',
    bodyFont: 'Inter, sans-serif',
  },
});

scene.add(md.setPosition(40, 40));
```

支援的令牌：標題 (h1–h6)、段落、圍欄程式碼區塊（含關鍵字高亮）、引用、有序/無序列表、水平線、內聯程式碼/粗體/斜體/連結和 GFM 表格（透過 `Table` 元件渲染）。

### 串流 Markdown

對於 LLM 輸出，使用 `appendMarkdown()` — 切勿迴圈 `setContent(fullText)`：

```typescript
const md = new Markdown('', { maxWidth: 700 });
scene.add(md);

for await (const token of llmStream) {
  md.appendMarkdown(token);
}
```

`appendMarkdown()` 重新對整個緩衝區進行詞法分析，對令牌與上次渲染進行差異比較，重用未變更的實體前綴，並原地更新最後一個段落。它節省了視覺樹重建工作，但 Markdown 詞法分析仍然會隨整個文件縮放。`setContent()` 此外還會執行完全重建，因此請將其用於一次性更換。

---

## LayoutEngine 的運作方式

了解冷/熱分離有助於你為效能做出正確的選擇。

### 冷傳遞 — 測量一次

`prepare(text)` 和 `prepareRich(spans)` 將文字分段為段落，套用阿拉伯文字形和 BiDi，使用 `Intl.Segmenter` 分段為單詞和字素，並測量每個字形的前進寬度。`prepareContentGrid(source, metrics)` 為可選取的固定網格表面執行相應的一次性編譯。結果（`PreparedText` 或 `PreparedContentGrid`）被保留，直到其內容或度量輸入變更。

**這是昂貴的步驟。** 僅在內容變更時執行。

### 熱傳遞 — 始終定位

`layoutPrepared(prepared)` 接受快取的 `PreparedText` 並套用換行約束（`maxWidth`、`maxHeight`、排除形狀）以產生定位的 `LayoutNode[]`。這是純算術——沒有分割，沒有測量。

`setMaxWidth()` 僅運行熱傳遞，重用快取的 `PreparedText`。這就是響應式重排便宜的原因：你可以在調整大小拖曳的每個像素上呼叫它，而不會產生卡頓。

### 段落級記憶化

快取鍵是 `fontSize + paragraphText`（對於純文字）或 `fontSize + paragraphText + styleSig`（對於豐富文字）。當你向具有許多段落的文件附加一個令牌時：

1. 未變更的段落可以重用快取的準備資料。
2. 僅重新測量最後一個（已變更的）段落。

這將重複的測量/布局準備限制在已變更的段落上。一個長段落隨著增長仍然會變得更加昂貴，而更高層級的 Markdown 解析可能會增加文件範圍的工作。

### 對齊與斷字

`LayoutEngine` 支援 `textAlign = 'justify'`（將換行的行撐到 `maxWidth`，最後一行不對齊）和換行時的斷字（軟連字號 `­` 開箱即用；插入一個 `hyphenate: (word) => string[]` 函式以實現自動斷字——例如 `hyphen` npm 套件的 Knuth–Liang 模式）。

對齊的 **RTL** 行在*兩端*都是平齊的：行的邏輯末尾空白被 BiDi 規則 L1 重置為基礎方向並落在視覺左側，因此被摺疊而不是在測量中保持一行空格寬度。段落最後一行仍然不對齊（仍然是右對齊）。

`TextEntity` 直接暴露了這兩者：`text.setTextAlign('justify')`、`text.setHyphenator(fn)`——詳見[`TextEntity` & `GridTextEntity`](/reference/core-text/#textentity-gridtextentity-lai-zi)。這些能正確渲染，因為 `TextEntity` 將每個字形繪製在其自己的計算位置上。`@vectojs/ui` 的 `Text`/`RichText` 元件為效能將每個換行折疊為單一的原生 `fillText()` 呼叫，因此它們目前不支援逐字形對齊——當你需要對齊的正文時，請使用 `TextEntity`。

---

## MSDF 字型

多通道有符號距離場字型在任何縮放級別都能渲染清晰的文字，沒有柵格化偽影。用於遊戲風格 UI、縮放介面或高 DPR 顯示器。

### 產生圖集

安裝 `msdf-atlas-gen` 並執行：

```bash
msdf-atlas-gen -font myfont.ttf -type msdf -format png -imageout atlas.png -json atlas.json
```

這會產生 `atlas.png`（字形紋理）和 `atlas.json`（字形度量、前進寬度、UV 邊界）。

### 在 VectoJS 中載入

```typescript
import { MSDFFont, MSDFTextEntity } from '@vectojs/core/text';

// 解析 JSON
const fontData = await fetch('/fonts/atlas.json').then((r) => r.json());
const font = MSDFFont.parse(fontData);

// 載入紋理圖片
const img = new window.Image();
img.src = '/fonts/atlas.png';
await new Promise((r) => (img.onload = r));

// 建立文字實體
const msdfText = new MSDFTextEntity('Hello GPU text', {
  font,
  texture: img, // TexImageSource
  fontSize: 48,
  color: '#ffffff',
  letterSpacing: 0,
  fallbackFont: 'sans-serif', // 當 pointBackend 不是 'webgl' 時使用
});

scene.add(msdfText.setPosition(40, 40));
```

`MSDFTextEntity` 將布局卸載到背景 `LayoutWorkerManager` worker（去抖動，透過 `Float32Array` 傳輸實現零複製）。文字在建構或 `setText()` 後一個非同步 tick 出現。當場景上設定了 `pointBackend: 'webgl'` 時，字形透過 WebGL MSDF 程式繪製；否則實體回退到原生 `fillText`。

### 直接使用 `MSDFFont.layout()`

如果你正在建立自訂渲染器或需要字形四邊形：

```typescript
const result = font.layout('Hello', 48);
// result.glyphs: PositionedGlyph[]
// 每個字形：{ char, x, y, w, h, u0, v0, u1, v1 }

for (const g of result.glyphs) {
  renderer.setMSDFTexture(texture, font.distanceRange);
  renderer.addGlyph(g.x, g.y, g.w, g.h, g.u0, g.v0, g.u1, g.v1, '#fff');
}
```

---

## 阿拉伯文與雙向文字

阿拉伯文和雙向文字在 `prepare()` 和 `prepareRich()` 內部**自動**處理。你無需自行呼叫任何字形 API。

### 內部發生的情況

1. **阿拉伯文字形**（`ArabicShaper.shapeArabic`）：將阿拉伯字元替換為其上下文呈現形式（首/中/尾/獨立形式）並套用 Lam-Alef 連字。`indexMap` 追蹤字形到來源索引的映射，用於游標命中測試。

2. **BiDi 層級分配**（`BidiResolver.resolveLevels`）：使用 UAX#9 規則為每個字元分配巢狀層級（0 = LTR，1 = RTL，更高 = 更深嵌入）。嵌入控制（LRE/RLE/PDF）被遵守。

3. **視覺重排序**（`BidiResolver.reorderVisual`）：在每行末尾，從最高層級向下反轉到 1，產生正確的視覺單詞順序。

這意味著包含阿拉伯文或希伯來文內容的 `Text` 或 `RichText` 可以直接運作：

```typescript
const arabic = new Text('مرحبا بك في VectoJS', { font: '20px sans-serif', color: '#f8fafc' });
const hebrew = new RichText([{ text: 'שלום ' }, { text: 'VectoJS', style: { bold: true } }]);
```

> [!NOTE]
> 換行（`\n`）總是重置阿拉伯文字形上下文和 BiDi 狀態。同一段落內的軟換行共享一個字形傳遞，因此多行阿拉伯文段落能在換行處正確成形。
>
> **所有行尾形式都被處理。** `\r\n`（CRLF）、`\n` 和單獨的 `\r` 都結束段落，永遠不會被塑形或作為字形佈局——一個多餘的 `\r` 否則會渲染為可見的豆腐塊，增加行寬並偏移選取偏移。來源偏移仍然索引**原始**字串，因此 CRLF 換行在命中測試和游標對應中正確計算為兩個字元。

---

## 輔助函式

`measureText` 從 `@vectojs/ui` 匯出，可用於自訂元件。

```typescript
import { measureText } from '@vectojs/ui';

// Rendered pixel width, LRU-cached (cap 1000) — keyed on the RAW text, so a
// cache hit costs a map lookup and does not re-run Arabic shaping
// (Arabic is still measured in its contextually-shaped form on a miss)
const w = measureText('Hello world', '600 16px Inter');
```

`measureText` 在測量前透過 `ArabicShaper` 處理阿拉伯文字形，因此它返回阿拉伯文的正確視覺寬度。沒有已匯出的換行輔助函式：元件透過 LayoutEngine 進行換行，而舊的貪婪式 `wrapLines` 匯出已在 ui 2.20.0 中移除，因為其斷行點與實際渲染的結果不一致 —— 元件之外的換行需求請基於 `measureText` 自行實作斷行邏輯。

`measureText` 在測量前透過 `ArabicShaper` 處理阿拉伯文字形，因此它返回阿拉伯文的正確視覺寬度。

---

## 效能指南

| 情境                         | 最佳方法                                                    |
| ---------------------------- | ----------------------------------------------------------- |
| 靜態文字，設定一次           | `new Text(content, opts)` — 一次冷傳遞                      |
| 僅附加串流（LLM）            | `text.append(token)` 或 `md.appendMarkdown(token)`          |
| 響應式調整大小               | `text.setMaxWidth(newW)` — 僅熱傳遞                         |
| 密集重複布局（例如資料網格） | 使用 `LayoutResultBuffer` 搭配 `layoutPreparedIntoBuffer()` |
| 解析度無關文字               | `MSDFTextEntity` + `pointBackend: 'webgl'`                  |
| 阿拉伯文 / 希伯來文 / RTL    | 任何 `Text`/`RichText`/`Markdown` — 自動                    |
| 文字繞過圖片                 | `RichText` + `exclusions: ExclusionRect[]`                  |

可選取文字始終投射原始的邏輯 Unicode 來源。Canvas 字形和 BiDi 重排序僅影響像素；複製、頁面內搜尋、瀏覽器翻譯和輔助技術保留呼叫者的來源順序。軟換行分隔符和明確的換行符附加到其前面的視覺行，以便多行選取幾何保持在渲染的行帶內。

## 疑難排解

### 文字看起來太寬或位置錯誤

`measureText` 和 `LayoutEngine` 都使用畫布 `measureText` 呼叫，搭配精確的 CSS 字型字串。如果字型家族尚未載入（例如網路字型），瀏覽器會使用具有不同度量的替代字型，導致布局和渲染之間不匹配。

確保在建立 `Text` 或 `RichText` 之前載入網路字型：

```typescript
await document.fonts.ready;
const label = new Text('Hello', { font: '16px Inter' });
```

### `append()` 對於長文件比預期慢

`append()` 在**段落層級**（按 `\n` 分割）進行記憶化。如果你的整個文件是一個沒有換行符的長段落，每次 `append()` 呼叫都會重新測量整個段落。

對於串流內容，在每個段落後插入一個換行符，以便快取可以分割它們：

```typescript
md.appendMarkdown(chunk);
// 如果 LLM 輸出自然有段落，記憶化會自動運作。
// 如果它是一個無盡的連續句子，效能會退化為 O(document)。
```

### `MSDFTextEntity` 文字在第一幀缺失

`MSDFTextEntity` 透過 `LayoutWorkerManager` 在執行緒外布局文字。結果在建構或 `setText()` 後一個非同步 tick 到達。這是設計使然——實體在布局回呼觸發時呼叫 `scene.markDirty()`，觸發重繪。

如果使用 `renderMode: 'onDemand'`，此重繪將正確發生。如果你需要文字同步出現（例如在截圖測試中），請在 `scene.start()` 後等待下一個 `rAF`。

### RichText 排除未套用

排除形狀僅適用於 `layoutPrepared()`，不適用於 `layoutPreparedIntoBuffer()`。如果你使用可重用緩衝區路徑，排除將被忽略。對於排除支援，請使用 `layoutPrepared()`。

> **下一步：** [無障礙](/learn/accessibility/) — 陰影 DOM 如何讓你的畫布 UI 可被螢幕閱讀器和代理驅動。
