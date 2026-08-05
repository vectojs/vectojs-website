---
title: 'UI：Stack'
description: '用于垂直或水平子元素放置的结构性布局容器。'
order: 21
---

# `Stack`

`Stack` 沿一条轴顺序排列子元素，并将自身尺寸调整为布局后的内容。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Stack</span></div>
  <iframe src="/sandbox/ui/component.html?name=stack&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Stack live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>子元素保持自己的尺寸；`Stack` 只写入它们的局部 `x` 和 `y`。</figcaption>
</figure>

## 最小示例

```ts
import { Button, Stack, Text } from '@vectojs/ui';

const column = new Stack({ direction: 'vertical', gap: 12 });
column.add(new Text('Export settings'));
column.add(new Button('Save'));
scene.add(column.setPosition(24, 24));
```

## 维护者检查清单

- 在直接修改子元素尺寸后调用 `layout()`。
- 使用 `align` 进行交叉轴放置。
- 当主要需求是水平换行时使用 `Flow`。
