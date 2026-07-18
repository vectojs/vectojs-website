---
title: 'UI: Modal'
description: '具有卡片、背景遮罩和彈簧進入/退出動作的阻擋式覆蓋層元件。'
order: 36
---

# `Modal`

`Modal` 掛載至覆蓋層，阻擋底層的指標事件，並為其卡片製作進出動畫。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Modal</span></div>
  <iframe src="/sandbox/ui/component.html?name=modal&v=core-1.11.1-ui-1.11.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Modal live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>開啟 modal，然後使用 canvas 渲染的關閉按鈕關閉它。</figcaption>
</figure>

## 最小範例

```ts
import { Button, Modal } from '@vectojs/ui';

const open = new Button('Open modal', {
  onClick: () => {
    scene.showOverlay(new Modal('Export complete', { width: scene.width, height: scene.height }));
  },
});
```

## 維護者檢查清單

- 將 modal 背景遮罩的尺寸設為場景尺寸。
- 讓關閉行為保持明確。
- 在廣泛使用前，驗證減少動態效果的行為和焦點處理。
