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
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea';   // default 'div'
  role?, label?, tabIndex?, href?, src?, alt?, inputType?, placeholder?, value?,
  checked?, disabled?, expanded?, controls?, haspopup?, selected?,
  activedescendant?, valuemin?, valuemax?
}
```

同步會將這些套用到真實元素（真正的 `<button>`、`<a href>`、`<img>`、具有 IME 感知 `change`/`focus`/`blur` 的 `<input>`/`<textarea>` 等），並透過 dirty 檢查來最小化 DOM 寫入。非原生可聚焦的可互動角色（`button`、`switch`、`checkbox`、`link`、`slider` 等）會取得 `tabindex="0"` 以及 Enter/Space → `click`。這就是「**canvas 效能與 DOM 等級無障礙**」的故事：視覺 100% 為 GPU/canvas，然而 Playwright/agent 的 `getByRole('button', { name })` 會解析陰影節點並點擊它。

當像設計畫布這類非控制項區域必須進入循序焦點順序並接收 VMT `keydown` 事件時，明確設定 `tabIndex: 0`。使用 `-1` 僅用於程式化焦點；回傳 `undefined` 會移除明確的值。

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
