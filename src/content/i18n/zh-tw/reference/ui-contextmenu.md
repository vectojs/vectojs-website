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
  <iframe src="/sandbox/ui/component.html?name=contextmenu&v=core-1.15.0-ui-2.0.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="ContextMenu live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## 維護者檢查清單

- 不要讓選單文字溢出面板。
- 讓停用的列保持不可互動。
- 透過覆蓋層根重新定位巢狀子選單。
