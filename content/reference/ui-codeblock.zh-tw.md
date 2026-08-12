+++
title = "UI: CodeBlock"
description = "Markdown 用於圍欄程式碼的單葉 canvas 程式碼區塊。"
weight = 40
+++

# `CodeBlock`

`CodeBlock` 是 `Markdown` 使用的低階圍欄程式碼渲染器。兩者都位於獨立的 **`@vectojs/markdown`** 套件中（於 `@vectojs/ui@2.2.0` 從 `@vectojs/ui` 移出）。它自行繪製背景和語法著色文字，避免每個 token 都產生一個子 entity。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · CodeBlock</span></div>
  <iframe src="/sandbox/ui/component.html?name=codeblock&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="CodeBlock live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>僅在自訂渲染器時直接使用它；一般文件應透過 `Markdown`。</figcaption>
</figure>

## 最小範例

````ts
import { CodeBlock, Markdown } from '@vectojs/markdown';

// Most callers should let Markdown create CodeBlock instances:
const md = new Markdown('```ts\nscene.markDirty();\n```', { maxWidth: 520 });

// Custom Markdown subclasses can return CodeBlock for app-specific fenced blocks.
````

圍欄區塊將其精確來源投射為個別定位的視覺列，使用與 Canvas 相同的內縮和基線。因此長來源行不會靜默地被瀏覽器換行，並偏離複製、頁面內尋找或原生選取。每個硬換行屬於前一個已定位的列，防止 Firefox 在投射根產生選取片段。預設堆疊以 `ui-monospace` 起始，避免桌面 Firefox 將程式碼的使用者字型替換為比例襯線字體，同時仍尊重明確的自訂字型。Markdown 傳播其 `selectable` 設定；直接使用 CodeBlock 者可呼叫 `setSelectable(boolean)`。

UI 1.9 對語法著色的 Canvas 繪製和語意載體皆使用 Core 1.8 的保留式預備內容網格。因此 tab、emoji/ZWJ、寬 CJK、阿拉伯文塑形、混合方向執行段和精確的 CR/LF/CRLF 來源邊界共用一個計畫。校準是一次冷路徑的字型載入傳遞；穩定的投射同步不會讀取 Range 幾何或替換儲存格載體。

## 寬度：`setWidth()`

```ts
codeBlock.setWidth(width: number): this
```

變更盒子寬度（`0.9.0+`）。它刻意**不**重建網格或重新執行語法高亮，因為程式碼不會重排：行位於固定的等寬網格上、位置為 `col × cellWidth`，過長的行會溢出而不是換行，因此 `height` 僅是行**數**的函式，寬度只決定圓角背景的尺寸。

任何會改變字形幾何的變更——原始碼、語言、字型——都要經過 `setCode()`，它會在那裡使網格失效。寬度未變時它是空操作，並回傳 `this`。

`Markdown.setMaxWidth()` 會為它擁有的每個圍欄程式碼區塊呼叫本方法，因此只有當你自行建構 `CodeBlock` 時才需要直接呼叫。

## 選項與水平捲動

```ts
new CodeBlock(source, language, width, options?: CodeBlockOptions)
// options: { showLanguage?: boolean }  // header band with the language name, default false
codeBlock.showLanguage: boolean
codeBlock.scrollX: number       // current horizontal scroll (clamped to maxScrollX)
codeBlock.maxScrollX: number    // widest line's overflow past the padded box; 0 = everything fits
codeBlock.setScrollX(x: number): this // scroll horizontally, clamped to [0, maxScrollX]
```

長行會溢出而不是換行，因此較寬的程式碼區塊可以水平捲動。`maxScrollX` 會針對產生它的網格進行記憶化——`scrollX` 在每個同步影格中都會被讀取，因此正是這個快取讓長程式碼區塊無需每影格承擔 O(lines) 的掃描開銷。

## 維護者檢查清單

- 讓圍欄程式碼保持為一個葉 entity。
- 使用 `setCode()` 進行即時更新。
- 僅變更寬度時使用 `setWidth()`；它會跳過 `setCode()` 執行的網格重建。
- 讓內容投射與精確的來源、字型和行高保持同步。
- 為 Canvas 繪製、指標游標、複製和尋找重複使用一個預備網格。
- 在分數 DPR/縮放下驗證 Chromium 和 Firefox，包括替換字型和變換過的區塊。
- 除非你正在撰寫渲染器擴充，否則優先使用較高階的 `Markdown` 元件。
