---
title: 'Overlay'
description: '用於 Tooltip、Popover 和 ContextMenu 的浮動 UI 基本元件，透過 Scene 覆蓋層根掛載。'
order: 15
---

# Overlay

overlay 系列在正常的 entity 樹之上渲染短暫的 UI。覆蓋層透過 `scene.overlayRoot` 掛載，因此它們可以逃離被裁剪的容器，同時仍使用場景座標和相同的動畫系統。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Overlay</span></div>
  <iframe src="/sandbox/ui/overlay.html?v=core-1.17.0-ui-2.2.0" class="sandbox-frame component-demo-frame component-demo-frame-tall" loading="eager" title="Overlay live demo" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>懸停或點擊啟動器。Popover 和 ContextMenu 的定位避免了在巨大的展示廊中難以察覺的溢出缺陷。</figcaption>
</figure>

## 最小範例

```ts
import { Button, Popover, Text } from '@vectojs/ui';

const target = new Button('Click · Popover').setPosition(40, 40);
const popover = new Popover({
  target,
  width: 220,
  height: 92,
  placement: 'right',
});

popover.add(new Text('Popover content').setPosition(14, 18));
scene.add(target);
scene.add(popover);
```

## 元件

| 元件          | 觸發                                           | 使用情境                |
| ------------- | ---------------------------------------------- | ----------------------- |
| `Tooltip`     | 懸停目標，可選延遲                             | 輕量的解釋性文字        |
| `Popover`     | 點擊目標                                       | 含子節點的小型短暫面板  |
| `ContextMenu` | 通常是右鍵或點擊                               | 含分隔線/項目的指令選單 |
| `Overlay`     | 手動 `showAt()` / `showAtPoint(x, y, source?)` | 自訂浮動元件            |

## 維護者檢查清單

- 對於變換過的目標使用 `target.getWorldBounds()`。
- 將範例約束在視口或正在展示的 card 邊界內。
- 當短暫 UI 的目標離開樹時，隱藏或釋放它。
- 讓覆蓋層內容在底層控制項之上保持可讀；使用足夠不透明的背景。

相關：[`Button`](/reference/ui-button/)、[`ScrollView`](/reference/ui-components/#scrollview)、[`Modal`](/reference/ui-components/#modal)。
