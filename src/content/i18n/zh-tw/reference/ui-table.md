---
title: 'UI: Table'
description: '用於精簡資料預覽和 Markdown 表格輸出的 canvas-native 網格表格。'
order: 31
---

# `Table`

`Table` 公開 `role="grid"`，在 canvas 上繪製其外框，並將每個儲存格作為子 Entity 擁有。字串儲存格會正規化為 `Text`；提供的 Entity 儲存格可透過公開的 `setMaxWidth()` 和 `setSelectable()` 能力參與。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Table</span></div>
  <iframe src="/sandbox/ui/component.html?name=table&v=core-1.11.1-ui-1.11.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Table live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>使用聚焦的示範來處理欄寬，而非在巨大的展示廊中除錯表格輸出。</figcaption>
</figure>

## 最小範例

```ts
import { Table } from '@vectojs/ui';

const table = new Table({
  width: 520,
  headers: ['Component', 'Role'],
  rows: [
    ['Button', 'button'],
    ['Input', 'textbox'],
  ],
  selectable: true,
});
```

`layout()` 約束每個儲存格、計算列/表格高度，並在渲染前定位子項目。`render()` 僅負責繪製。在變更外部提供的 Entity 儲存格後或變更公開字串資料後呼叫 `table.layout()`。每個邏輯儲存格擁有一個內容投射，因此瀏覽器選取和頁面內尋找不會重複表格文字。

選取是儲存格擁有而非表格擁有：字串儲存格正規化為可選取的 `Text`，提供的 entity 在支援時接收 `setSelectable()`，而 Markdown 表格繼承相同的約定。因此跨儲存格拖曳只會複製邏輯儲存格文字一次，而 Canvas 仍是唯一的視覺渲染器。結構性的 `role="grid"` 陰影不會捕獲來自儲存格投射的指標事件。這種葉層擁有正是讓跨儲存格拖曳選取、Ctrl/Command+C 和頁面內尋找與 VMT 文字恰好對齊一次的原因。

## 維護者檢查清單

- 讓 `colWidths` 長度與 headers 對齊；有效寬度會正規化為 Table 寬度。
- 每個邏輯儲存格使用唯一的 Entity 實例。
- 在儲存格內容或尺寸變更後呼叫 `layout()`。
- 對大型資料集使用虛擬化；`Table` 用於精簡網格。
- 讓網格標籤保持具描述性。
- 在變更寬度或應用程式縮放後，驗證跨 header/主體儲存格的拖曳選取。
