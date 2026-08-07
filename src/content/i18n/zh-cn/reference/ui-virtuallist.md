---
title: 'UI：VirtualList'
description: '只挂载可见行加上过扫描区域的虚拟化滚动列表。'
order: 33
---

# `VirtualList`

`VirtualList` 只渲染长条目数组的可见窗口。当常规子元素挂载会浪费工作时，对大型列表使用它。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · VirtualList</span></div>
  <iframe src="/sandbox/ui/component.html?name=virtuallist&v=core-1.32.3-ui-2.13.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="VirtualList live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>该演示有 120 个条目，但只挂载可见行加上过扫描区域。</figcaption>
</figure>

## 最小示例

```ts
import { Text, VirtualList } from '@vectojs/ui';

const list = new VirtualList({
  items,
  width: 360,
  height: 400,
  estimatedRowHeight: 32,
  renderItem: (item) => new Text(item.label),
});
```

## 维护者检查清单

- 提供一个真实的 `estimatedRowHeight`。
- 保持行实体轻量且自包含。
- 在替换整个数据集时使用 `setItems()`。
