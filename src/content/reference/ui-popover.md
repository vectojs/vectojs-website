---
title: 'UI: Popover'
description: 'Click-triggered overlay panel that can contain arbitrary VectoJS children.'
order: 38
---

# `Popover`

`Popover` toggles on target click and can contain any VectoJS child entities.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Popover</span></div>
  <iframe src="/sandbox/ui/component.html?name=popover&v=core-1.9.2-ui-1.9.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Popover live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Click the target twice to open and close the popover.</figcaption>
</figure>

## Minimal example

```ts
import { Button, Popover, Text } from '@vectojs/ui';

const target = new Button('Open');
const popover = new Popover({ target, width: 220, height: 92, placement: 'right' });
popover.add(new Text('Popover content').setPosition(14, 20));
```

## Maintainer checklist

- Keep the panel readable over underlying controls.
- Constrain placement through `Overlay` bounds.
- Hide or dispose popovers when their target leaves the tree.
