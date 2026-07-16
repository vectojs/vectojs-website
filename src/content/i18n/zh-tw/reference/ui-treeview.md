---
title: 'UI: TreeView'
description: '具有立即或延遲子項目載入的階層式樹狀元件。'
order: 34
---

# `TreeView`

`TreeView` 以展開狀態和選用的延遲子項目載入來渲染階層式列。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · TreeView</span></div>
  <iframe src="/sandbox/ui/component.html?name=treeview&v=core-1.9.0-ui-1.9.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="TreeView live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>點擊父列以展開或收合它們。</figcaption>
</figure>

## 最小範例

```ts
import { TreeView } from '@vectojs/ui';

const tree = new TreeView({
  width: 280,
  height: 360,
  nodes: [{ id: 'packages', label: 'packages', children: [{ id: 'ui', label: 'ui' }] }],
});
```

## 維護者檢查清單

- 在展開、收合或節點替換後重建列。
- 讓延遲載入器保持幂等。
- 使用穩定的節點 ID 來維護選取和展開狀態。
