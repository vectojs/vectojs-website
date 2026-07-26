---
title: 'a11yRoot 與 agent 契約'
description: '每個可互動的 Entity 如何將透明的 ARIA 陰影節點投射到 DOM 中 — A11yAttributes 形狀、canvas 效能與 DOM 等級無障礙的契約，以及導致陰影節點過時或遺失的同步注意事項。'
order: 10
---

# a11yRoot 與 agent 契約

屬於 [`@vectojs/core`](/reference/core-api/) 的一部分。

每個具有框的可互動 entity 都會將一個**透明 ARIA 陰影節點**投射到 Scene 的 `a11yRoot` div 中（位於 canvas 上方，`pointerEvents:auto` 讓自動化/AT 可以互動；除非 `debugA11y` 否則 `opacity:0`）。每個節點攜帶 `id` + `data-vecto-id`，以及來自 [`Entity.getA11yAttributes()`](/reference/core-entity/#a11y--批次處理掛鉤覆寫以啟用) 的角色/標籤/狀態。

投射根追蹤 canvas 的 CSS 框：canvas 偏移和非均勻 CSS 縮放會套用到陰影和 DOM-portal 層，而 entity 幾何則保持在邏輯 Scene 座標中。canvas 的任意 CSS 旋轉/傾斜不屬於此對應。

`A11yAttributes`：

```ts
{
  // Element + identity
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea';   // default 'div'
  role?: string;
  label?: string;                      // aria-label
  labelledby?: string;                 // aria-labelledby
  describedby?: string;                // aria-describedby

  // Focus & pointer
  tabIndex?: number;
  pointerEvents?: 'auto' | 'none';     // default 'auto'

  // Native element attributes (only for the matching `tag`)
  href?: string; target?: string;      // tag: 'a'
  src?: string; alt?: string;          // tag: 'img'
  inputType?: string; placeholder?: string; value?: string;
  textInputStyle?: TextInputStyle;     // native editor typography

  // State
  checked?: boolean; disabled?: boolean; selected?: boolean;
  expanded?: boolean; required?: boolean; invalid?: boolean;
  valuemin?: string; valuemax?: string;
  level?: number;                      // aria-level (headings, tree items)

  // Relationships & popups
  controls?: string; haspopup?: string; activedescendant?: string;
  ariaModal?: 'true' | 'false';        // aria-modal on a role="dialog"

  // Live regions
  live?: 'off' | 'polite' | 'assertive';
  atomic?: boolean;                    // aria-atomic
  relevant?: string;                   // aria-relevant
}
```

每個欄位都會在每一影格透過髒檢查投影到真實屬性上。回傳 `undefined` 會**移除**屬性，因此不再適用的狀態會消失而非變得過時——注意 `false` 與 `undefined` 在此不同（`aria-invalid="false"` 表示「明確有效」且會被保留）。

同步會將這些套用到真實元素（真正的 `<button>`、`<a href>`、`<img>`、具有 IME 感知 `change`/`focus`/`blur` 的 `<input>`/`<textarea>` 等）。這就是「**canvas 效能與 DOM 等級無障礙**」的故事：視覺 100% 為 GPU/canvas，然而 Playwright/agent 的 `getByRole('button', { name })` 會解析陰影節點並點擊它。

## 焦點順序

非原生可聚焦的可互動角色（`button`、`switch`、`checkbox`、`link`、`slider` 等）會取得 `tabindex="0"` 以及 Enter/Space → `click`。

**複合元件有所不同。** `tree`、`grid`、`menu`、`radiogroup` 或 `tablist` 是一個標籤停靠點，而不是每個子元素一個——因此它們的子元素使用**漫遊 tabindex**：恰好一個子元素攜帶 `tabIndex: 0`，其餘為 `-1`，方向鍵移動該停靠點。參見[複合元件](#複合元件漫遊-tabindex)。

標籤順序遵循**視覺**閱讀順序，而非場景圖插入順序——參見 [`Scene.readingDirection`](/reference/core-scene/#accessibility--appearance) 了解 RTL。

當非控制項區域（如設計 canvas）必須進入循序焦點順序並接收 VMT `keydown` 事件時，明確設定 `tabIndex: 0`。使用 `-1` 僅用於程式化焦點；回傳 `undefined` 會移除明確的值。

## 複合元件（漫遊 tabindex）

樹、格線、選單、單選按鈕群組或標籤列表必須為每個子元素暴露**一個角色**，而不僅僅是容器角色——否則 AT 看到的是一個不透明的方框。VectoJS 透過在每個可見子元素上方匯集一個透明的、可聚焦的子實體（「熱點」）來實作：它攜帶子元素的 `role` + 狀態 + 漫遊 `tabIndex`，不渲染任何內容，父元素擁有鍵盤處理程式。

關鍵的是，這些熱點設定 `pointerEvents: 'none'`。底層元件已經擁有滑鼠（點選切換、拖曳滾動、可選取的儲存格文字），因此熱點不能攔截它——鍵盤焦點和 AT 合成的 `click` 仍然可以透過 `pointer-events:none` 元素運作。

| 元件          | 子角色                                                         | 鍵盤操作                                                                                                        |
| ------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `TreeView`    | `treeitem`（+ `aria-level`、`aria-expanded`、`aria-selected`） | 上/下移動 · 右展開然後進入 · 左折疊然後回到父級 · Home/End · Enter/Space 啟動                                   |
| `Table`       | `row` › `gridcell` / `columnheader`                            | 方向鍵二維移動（header 為 row −1）· Home/End 行極值 · Ctrl+Home/Ctrl+End 格線角落                               |
| `ContextMenu` | `menuitem`（+ `aria-haspopup`、`aria-expanded`）               | 上/下循環並跳过分隔符 + 停用項 · Home/End · Right 開啟子選單 · Left 返回父選單 · Enter/Space 啟動 · Escape 關閉 |
| `RadioGroup`  | `radio`（+ `aria-checked`）                                    | 方向鍵移動並選取 · Home/End · Space 選取                                                                        |
| `Tabs`        | `tab`（+ `aria-selected`）                                     | 方向鍵移動 · Home/End · Space/Enter 啟動                                                                        |

只有可見子元素被匯集，因此虛擬化的 `TreeView` 或 `Table` 投影 O(viewport) 個熱點，而非資料集中每一列一個。聚焦的列/儲存格在焦點移動到它之前會滾動到檢視中。

## 強制色彩（高對比度）

canvas 是不透明像素，因此瀏覽器的 `forced-colors` 重新對應永遠不會觸及 VectoJS 繪製的內容——在 Windows 高對比度下，主題控制項會保持不可讀，除非元件重新繪製自身。請參見 [`Scene.forcedColors`](/reference/core-scene/#accessibility--appearance) 並使用 CSS 系統顏色（`ButtonFace`、`ButtonText`、`Highlight`、`Canvas`、`CanvasText`）繪製；當設定切換時場景會自動重繪。`Button` 已經這樣做了。

## 控制項與注意事項

- 每個陰影節點上的 `data-vecto-id` 鏡射 entity `id` — 是自動化選擇器的穩定控制柄。
- `a11ySyncInterval`（見 [`SceneOptions`](/reference/core-scene/#sceneoptions)）
  在動畫期間節流同步，並確保在待處理的動作沉澱後進行最終的追趕；
  它不會在整個動畫期間暫停所有同步。
- `debugA11y: true` 顯示節點（藍色虛線）以供開發。
- `detachA11y(entity)` 修剪子樹的陰影節點而不移除 entity；
  `remove()` 會自動修剪。每幀同步**建立/更新但從不修剪**，
  因此請明確管理可互動子項目的變動。
- `getA11yTree()` 回傳一個巢狀的 `A11yTreeNode[]` 快照以供斷言；
  `getA11yElement(id)` 擷取特定的陰影元素。
- `a11yFullViewport` 在所有其他項目之後掛載一個無界的互動表面。
- 從 Core 1.11.1 起，新投影的互動實體會在建立 shadow node 的同一影格取得與畫布繪製順序一致的 `z-index`。因此，新覆蓋層的 backdrop 在第一次指標互動時就位於既有設計控制項之上，不必等待下一次渲染。

使用模式和測試模式請參閱 [Accessibility](/learn/accessibility/)。

## 相關

[`Scene`](/reference/core-scene/)（`a11ySyncInterval`、`debugA11y`）·
[`Entity`](/reference/core-entity/)（`getA11yAttributes()`、`interactive`、`width`/`height`）·
[`@vectojs/core` 概覽](/reference/core-api/)
