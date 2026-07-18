---
title: 'UI: CodeBlock'
description: 'Markdown 用於圍欄程式碼的單葉 canvas 程式碼區塊。'
order: 40
---

# `CodeBlock`

`CodeBlock` 是 `Markdown` 使用的低階圍欄程式碼渲染器。它自行繪製背景和語法著色文字，避免每個 token 都產生一個子 entity。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · CodeBlock</span></div>
  <iframe src="/sandbox/ui/component.html?name=codeblock&v=core-1.11.1-ui-1.11.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="CodeBlock live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>僅在自訂渲染器時直接使用它；一般文件應透過 `Markdown`。</figcaption>
</figure>

## 最小範例

````ts
import { CodeBlock, Markdown } from '@vectojs/ui';

// Most callers should let Markdown create CodeBlock instances:
const md = new Markdown('```ts\nscene.markDirty();\n```', { maxWidth: 520 });

// Custom Markdown subclasses can return CodeBlock for app-specific fenced blocks.
````

圍欄區塊將其精確來源投射為個別定位的視覺列，使用與 Canvas 相同的內縮和基線。因此長來源行不會靜默地被瀏覽器換行，並偏離複製、頁面內尋找或原生選取。每個硬換行屬於前一個已定位的列，防止 Firefox 在投射根產生選取片段。預設堆疊以 `ui-monospace` 起始，避免桌面 Firefox 將程式碼的使用者字型替換為比例襯線字體，同時仍尊重明確的自訂字型。Markdown 傳播其 `selectable` 設定；直接使用 CodeBlock 者可呼叫 `setSelectable(boolean)`。

UI 1.9 對語法著色的 Canvas 繪製和語意載體皆使用 Core 1.8 的保留式預備內容網格。因此 tab、emoji/ZWJ、寬 CJK、阿拉伯文塑形、混合方向執行段和精確的 CR/LF/CRLF 來源邊界共用一個計畫。校準是一次冷路徑的字型載入傳遞；穩定的投射同步不會讀取 Range 幾何或替換儲存格載體。

## 維護者檢查清單

- 讓圍欄程式碼保持為一個葉 entity。
- 使用 `setCode()` 進行即時更新。
- 讓內容投射與精確的來源、字型和行高保持同步。
- 為 Canvas 繪製、指標游標、複製和尋找重複使用一個預備網格。
- 在分數 DPR/縮放下驗證 Chromium 和 Firefox，包括替換字型和變換過的區塊。
- 除非你正在撰寫渲染器擴充，否則優先使用較高階的 `Markdown` 元件。
