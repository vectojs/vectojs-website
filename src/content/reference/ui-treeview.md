---
title: 'UI: TreeView'
description: 'Hierarchical tree component with eager or lazy child loading.'
order: 34
---

# `TreeView`

`TreeView` renders hierarchical rows with expansion state and optional lazy child loading.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · TreeView</span></div>
  <iframe src="/sandbox/ui/component.html?name=treeview&v=core-1.9.2-ui-1.10.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="TreeView live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Click parent rows to expand or collapse them.</figcaption>
</figure>

## Minimal example

```ts
import { TreeView } from '@vectojs/ui';

const tree = new TreeView({
  width: 280,
  height: 360,
  nodes: [{ id: 'packages', label: 'packages', children: [{ id: 'ui', label: 'ui' }] }],
});
```

## Maintainer checklist

- Rebuild rows after expansion, collapse, or node replacement.
- Keep lazy loaders idempotent.
- Use stable node IDs for selection and expansion state.
