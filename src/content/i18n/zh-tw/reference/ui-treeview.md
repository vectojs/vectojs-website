---
title: 'UI: TreeView'
description: '具有立即或延遲子項目載入的階層式樹狀元件。'
order: 34
---

# `TreeView`

`TreeView` 以展開狀態和選用的延遲子項目載入來渲染階層式列。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · TreeView</span></div>
  <iframe src="/sandbox/ui/component.html?name=treeview&v=core-1.18.0-ui-2.3.2" class="sandbox-frame component-demo-frame-tall" loading="eager" title="TreeView live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>點擊父列以展開或收合它們。</figcaption>
</figure>

## 最小範例

```ts
import { TreeView } from '@vectojs/ui';

const tree = new TreeView({
  width: 280,
  height: 360,
  nodes: [{ id: 'packages', label: 'packages', children: [{ id: 'ui', label: 'ui' }] }],
});
```

## 選項

| 選項                                           | 類型             | 預設值 | 說明                                                                                  |
| ---------------------------------------------- | ---------------- | ------ | ------------------------------------------------------------------------------------- |
| `nodes`                                        | `TreeNode[]`     | —      | 根節點。節點的 `children` 可以是陣列**或** `() => Promise<TreeNode[]>` 用於延遲載入。 |
| `width` / `height`                             | `number`         | —      | 視口框。列被虛擬化到該框中。                                                          |
| `rowHeight`                                    | `number`         | `28`   | 列間距。                                                                              |
| `font`、`color`、`selectedColor`、`hoverColor` | `string`         | 主題   | 列繪製。                                                                              |
| `onSelect`                                     | `(node) => void` | —      | 葉節點被啟動時觸發。                                                                  |
| `onExpand`                                     | `(node) => void` | —      | 父節點展開時觸發。                                                                    |

`setNodes(nodes)` 替換樹；展開/選取以節點 `id` 為鍵，因此穩定的 ID 可在替換時保留狀態。

## 無障礙與鍵盤

`TreeView` 為每個**可見**列投射一個 `role="treeitem"`——一個透明的、可聚焦的熱點池化在列上，攜帶 `aria-level`（深度）、列的 `aria-expanded`（僅父節點）、`aria-selected`，以及**循環 tabindex**，因此整棵樹是一個定位停止。

| 按鍵          | 動作                                           |
| ------------- | ---------------------------------------------- |
| 下/上         | 移動到下一列/上一列                            |
| 右            | 展開折疊的父節點；如果已展開，進入第一個子節點 |
| 左            | 收合展開的父節點；否則移動到父列               |
| Home / End    | 第一列/最後一列                                |
| Enter / Space | 啟動（切換父節點，選取葉節點）                 |

活動列在焦點移動到它之前會滾動到視圖中。由於只有可見列被池化，100k 節點的樹仍然只投影 O(視口) 個節點。

熱點設定 `pointerEvents: 'none'`，因此樹保持其自身的滑鼠處理（點擊切換和拖曳滾動）——鍵盤焦點和 AT 合成的 `click` 仍然通過。參見[複合元件](/reference/core-a11y/#複合元件漫遊-tabindex)。

## 指標與觸控

- **點擊**列以切換/選取。切換在 `pointerup` 時觸發，僅當指標移動少於約 6px 時——因此觸控拖曳不會意外展開它開始的列。
- **垂直拖曳**以滾動（列以 1:1 跟隨手指），與 `ScrollView` / `VirtualList` 相同。
- **滾輪**滾動。

## 維護者檢查清單

- 在展開、收合或節點替換後重建列。
- 讓延遲載入器保持幂等。
- 使用穩定的節點 ID 來維護選取和展開狀態。
- 不要向列新增競爭的指標處理器：元件擁有點擊與拖曳的歧義消除，且無障礙熱點故意不捕獲指標。
