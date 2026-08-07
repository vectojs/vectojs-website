---
title: 'UI: Table'
description: '用於精簡資料預覽和 Markdown 表格輸出的 canvas-native 網格表格。'
order: 31
---

# `Table`

`Table` 投射完整的 `grid` › `row` › `gridcell`/`columnheader` 樹，在 canvas 上繪製其外框，並將每個儲存格作為子 Entity 擁有。字串儲存格會正規化為 `Text`；提供的 Entity 儲存格可透過公開的 `setMaxWidth()` 和 `setSelectable()` 能力參與。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Table</span></div>
  <iframe src="/sandbox/ui/component.html?name=table&v=core-1.32.3-ui-2.13.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Table live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## 響應式寬度：`setWidth()`

```ts
table.setWidth(width: number): this
```

變更總寬度，按比例縮放各欄，並重新佈局（`2.11.0+`）。請使用它而非直接指派 `width`——單獨指派是不夠的：`colWidths` 在**建構函式中解析一次**，使用的是當時給定的寬度，而每個儲存格的換行寬度、位置與對齊方式都衍生自那些**每欄**的數值，而非衍生自 `width`。因此，一個重新指派了 `width` 的表格會以新尺寸繪製其外框，而其儲存格仍按舊尺寸佈局。

各欄保持其相對比例，因此明確的 `colWidths` 比例能在調整尺寸後存活，而不會在第一次呼叫時被等分重設。寬度未變時它是空操作，最小值被限制為 1，並回傳 `this`。

## 無障礙與鍵盤

投射的樹是一個真實的 ARIA 網格：固定的 `columnheader` 列加上每個**可見**行一個 `row`（虛擬化感知），每個儲存格是一個可聚焦的 `gridcell` 熱點。恰好一個儲存格持有**循環 tabindex**，因此整個網格是一個定位停止。

| 按鍵                 | 動作                                          |
| -------------------- | --------------------------------------------- |
| 方向鍵               | 在 2D 中將聚焦的儲存格移動一步（表頭為行 -1） |
| Home / End           | 當前行的第一個/最後一個儲存格                 |
| Ctrl+Home / Ctrl+End | 第一個表頭儲存格 / 最後一個主體儲存格         |

目標儲存格在焦點移動到它之前會滾動到視圖中。參見[複合元件](/reference/core-a11y/#複合元件漫遊-tabindex)。

## 指標與觸控

- **跨儲存格拖曳**會原生選取它們的文字（儲存格投射擁有指標——見上文）。
- **垂直拖曳**虛擬化主體時，以 1:1 的比例跟隨手指滾動，因此表格可以在觸控螢幕上使用，而不僅僅透過滾輪。
- **滾輪**滾動虛擬化主體。

## 維護者檢查清單

- 保持 `colWidths` 長度與 headers 對齊；有效寬度被正規化為 Table 寬度。
- 每個邏輯儲存格使用唯一的 Entity 實例。
- 在儲存格內容或尺寸變更後呼叫 `layout()`。
- 對大型資料集使用虛擬化；`Table` 用於精簡網格。
- 保持網格標籤具有描述性。
- 在變更寬度或應用程式縮放後，驗證跨表頭/主體儲存格的拖曳選取。
- 變更虛擬化或欄位數後，驗證鍵盤導航能到達每個儲存格。
