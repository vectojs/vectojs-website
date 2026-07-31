---
title: 'UI: VirtualList'
description: 'Virtualized scroll list that only mounts visible rows plus overscan.'
order: 33
---

# `VirtualList`

`VirtualList` renders only the visible window of a long item array. Use it for large lists where
regular child mounting would waste work.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · VirtualList</span></div>
  <iframe src="/sandbox/ui/component.html?name=virtuallist&v=core-1.25.0-ui-2.6.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="VirtualList live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>The demo has 120 items, but only the visible rows plus overscan are mounted.</figcaption>
</figure>

## Minimal example

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

## Maintainer checklist

- Provide a realistic `estimatedRowHeight`.
- Keep row entities cheap and self-contained.
- Use `setItems()` when replacing the full dataset.
