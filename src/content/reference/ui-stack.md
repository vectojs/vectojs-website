---
title: 'UI: Stack'
description: 'Structural layout container for vertical or horizontal child placement.'
order: 21
---

# `Stack`

`Stack` positions children sequentially along one axis and sizes itself to the laid-out content.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Stack</span></div>
  <iframe src="/sandbox/ui/component.html?name=stack&v=core-1.9.2-ui-1.9.5" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Stack live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Children keep their own sizes; `Stack` only writes their local `x` and `y`.</figcaption>
</figure>

## Minimal example

```ts
import { Button, Stack, Text } from '@vectojs/ui';

const column = new Stack({ direction: 'vertical', gap: 12 });
column.add(new Text('Export settings'));
column.add(new Button('Save'));
scene.add(column.setPosition(24, 24));
```

## Maintainer checklist

- Call `layout()` after directly mutating child sizes.
- Use `align` for cross-axis placement.
- Use `Flow` when the main requirement is horizontal wrapping.
