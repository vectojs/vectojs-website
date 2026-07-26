---
title: 'UI: ContextMenu'
description: '具有分隔線、停用列、快捷鍵和巢狀子選單的覆蓋層指令選單。'
order: 39
---

# `ContextMenu`

`ContextMenu` 是用於指令介面的覆蓋層選單。

UI 1.11.1–1.11.3 讓巢狀選單鏈具備安全的生命週期：由根選單擁有的單一 backdrop 會關閉或銷毀整條選單鏈，隱藏的選單不會留下語意或指標命中介面，每個根選單也擁有穩定的 backdrop 識別。外部 `pointerdown` 會立即關閉選單，同時保留供鍵盤與輔助技術使用的語意 `click` 啟動。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ContextMenu</span></div>
  <iframe src="/sandbox/ui/component.html?name=contextmenu&v=core-1.17.0-ui-2.2.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="ContextMenu live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>點擊啟動器以在受約束的視口內開啟選單。</figcaption>
</figure>

## 最小範例

```ts
import { ContextMenu } from '@vectojs/ui';

const menu = new ContextMenu({
  items: [
    { label: 'Copy', shortcut: 'Ctrl+C' },
    { separator: true },
    { label: 'Delete', disabled: true },
  ],
});

// `'contextmenu'` is not a VectoEvent — only pointerdown/up are dispatched
// into the tree. Filter `pointerdown` on the native right button (2), and
// pass the owning entity as the third arg so `showAtPoint` can find the
// scene even on the very first call (before any manual `scene.add(menu)`).
target.on('pointerdown', (event) => {
  const pointer = event.nativeEvent as PointerEvent | undefined;
  if (pointer?.button !== 2 || event.sceneX === undefined || event.sceneY === undefined) return;
  menu.showAtPoint(event.sceneX, event.sceneY, target);
});
```

## 無障礙與鍵盤

每個非分隔符項目都會投射一個 `role="menuitem"` 熱點，帶有**循環 tabindex**（選單為一個定位停止）、適用時的 `disabled`，以及子選單父項上的 `aria-haspopup="menu"` + `aria-expanded`。

| 按鍵          | 動作                                                        |
| ------------- | ----------------------------------------------------------- |
| 下/上         | 下一個/上一個**已啟用**的項目，循環；分隔線和停用項目被跳過 |
| Home / End    | 第一個/最後一個已啟用的項目                                 |
| 右            | 開啟子選單父項並聚焦其第一個項目                            |
| 左            | 關閉此子選單並將焦點返回其父選單                            |
| Enter / Space | 啟動（開啟子選單，或觸發 `onClick` 並關閉整個選單樹）       |
| Escape        | 關閉整個選單樹                                              |

熱點設定 `pointerEvents: 'none'`，因此選單保持其自身的按位置 `pointerdown` 命中介面。參見[複合元件](/reference/core-a11y/#composite-widgets-roving-tabindex)。

> **顯示選單會安裝全場景 backdrop。** 根選單新增一個不可見的、場景大小的互動實體來捕獲關閉它的外部點擊。該 backdrop 在選單開啟時攔截整個場景的指標事件——因此不要在需要拖曳/選取的夾具或測試中讓選單保持開啟狀態。

## 維護者檢查清單

- 不要讓選單文字溢出面板。
- 讓停用的列保持不可互動。
- 透過覆蓋層根重新定位巢狀子選單。
- 將根選單作為共享 backdrop 的唯一擁有者，並在指令、外部 pointerdown 或銷毀時關閉完整的子選單鏈。
