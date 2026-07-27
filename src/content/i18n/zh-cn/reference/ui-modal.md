---
title: 'UI：Modal'
description: '带卡片、遮罩层和弹簧进入/退出运动的阻塞覆盖层组件。'
order: 36
---

# `Modal`

`Modal` 挂载到覆盖层，阻塞底层指针事件，并为其卡片添加进入和退出动画。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Modal</span></div>
  <iframe src="/sandbox/ui/component.html?name=modal&v=core-1.18.0-ui-2.3.2" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Modal live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>打开模态框，然后用 canvas 渲染的关闭按钮关闭它。</figcaption>
</figure>

## 最小示例

```ts
import { Button, Modal } from '@vectojs/ui';

const open = new Button('Open modal', {
  onClick: () => {
    scene.showOverlay(new Modal('Export complete', { width: scene.width, height: scene.height }));
  },
});
```

## 维护者检查清单

- 将模态框遮罩层的尺寸设置为场景尺寸。
- 保持关闭行为显式。
- 在广泛使用前验证减弱动效行为和焦点处理。
