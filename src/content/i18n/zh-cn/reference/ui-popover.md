---
title: 'UI：Popover'
description: '由点击触发的覆盖面板，可包含任意 VectoJS 子元素。'
order: 38
---

# `Popover`

`Popover` 在目标点击时切换显示，并可包含任何 VectoJS 子实体。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Popover</span></div>
  <iframe src="/sandbox/ui/component.html?name=popover&v=core-1.31.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Popover live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>点击目标两次以打开和关闭 popover。</figcaption>
</figure>

## 最小示例

```ts
import { Button, Popover, Text } from '@vectojs/ui';

const target = new Button('Open');
const popover = new Popover({ target, width: 220, height: 92, placement: 'right' });
popover.add(new Text('Popover content').setPosition(14, 20));
```

## 维护者检查清单

- 保持面板在底层控件之上清晰可读。
- 通过 `Overlay` 边界约束放置位置。
- 当目标离开树时隐藏或销毁 popover。
