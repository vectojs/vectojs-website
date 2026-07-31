---
title: 'UI：Tooltip'
description: '锚定到目标实体的、由悬停触发的覆盖层文本。'
order: 37
---

# `Tooltip`

`Tooltip` 在延迟后于目标附近显示一个小型文本面板。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Tooltip</span></div>
  <iframe src="/sandbox/ui/component.html?name=tooltip&v=core-1.25.0-ui-2.6.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Tooltip live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>悬停目标以验证放置位置和消失行为。</figcaption>
</figure>

## 最小示例

```ts
import { Button, Tooltip } from '@vectojs/ui';

const target = new Button('Hover me');
const tooltip = new Tooltip({
  target,
  content: 'Save file',
  placement: 'right',
});
```

## 维护者检查清单

- 在指针离开时清除待定的计时器。
- 保持工具提示内容简短。
- 挂载一次即可；让工具提示管理自己的显示/隐藏生命周期。
