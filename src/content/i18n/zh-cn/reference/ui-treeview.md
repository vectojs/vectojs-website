---
title: 'UI：TreeView'
description: '支持预加载或懒加载子节点的层级树组件。'
order: 34
---

# `TreeView`

`TreeView` 渲染带展开状态的层级行，并可选支持懒加载子节点。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · TreeView</span></div>
  <iframe src="/sandbox/ui/component.html?name=treeview&v=core-1.11.1-ui-1.11.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="TreeView live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>点击父行以展开或折叠它们。</figcaption>
</figure>

## 最小示例

```ts
import { TreeView } from '@vectojs/ui';

const tree = new TreeView({
  width: 280,
  height: 360,
  nodes: [{ id: 'packages', label: 'packages', children: [{ id: 'ui', label: 'ui' }] }],
});
```

## 维护者检查清单

- 在展开、折叠或节点替换后重建行。
- 保持懒加载器幂等。
- 使用稳定的节点 ID 来维护选择和展开状态。
