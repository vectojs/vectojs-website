---
title: 'UI：Tabs'
description: '挂载活动内容视图的选项卡面板容器。'
order: 29
---

# `Tabs`

`Tabs` 绘制一个选项卡栏，并只挂载活动选项卡的内容实体。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Tabs</span></div>
  <iframe src="/sandbox/ui/component.html?name=tabs&v=core-1.9.0-ui-1.9.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Tabs live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>切换选项卡会从实体树中移除非活动内容。</figcaption>
</figure>

## 最小示例

```ts
import { Tabs, Text } from '@vectojs/ui';

const tabs = new Tabs({
  width: 480,
  height: 260,
  tabs: [
    { id: 'usage', label: 'Usage', content: new Text('Usage panel') },
    { id: 'api', label: 'API', content: new Text('API panel') },
  ],
});
```

## 维护者检查清单

- 保持选项卡内容尺寸与容器尺寸同步。
- 仅在活动选项卡实际变化时发出 `change`。
- 在未来的选项卡级语义中保留键盘/焦点行为。
