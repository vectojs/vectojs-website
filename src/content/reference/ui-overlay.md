---
title: 'Overlay'
description: 'Floating UI primitives for Tooltip, Popover and ContextMenu, mounted through the Scene overlay root.'
order: 15
---

# Overlay

The overlay family renders transient UI above the normal entity tree. Overlays mount through
`scene.overlayRoot`, so they can escape clipped containers while still using scene coordinates and
the same animation system.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Overlay</span></div>
  <iframe src="/sandbox/ui/overlay.html?v=core-1.18.0-ui-2.3.2" class="sandbox-frame component-demo-frame component-demo-frame-tall" loading="eager" title="Overlay live demo" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>Hover or click the launchers. Popover and ContextMenu are positioned to avoid the overflow defect that is hard to catch in a giant gallery.</figcaption>
</figure>

## Minimal example

```ts
import { Button, Popover, Text } from '@vectojs/ui';

const target = new Button('Click · Popover').setPosition(40, 40);
const popover = new Popover({
  target,
  width: 220,
  height: 92,
  placement: 'right',
});

popover.add(new Text('Popover content').setPosition(14, 18));
scene.add(target);
scene.add(popover);
```

## Components

| Component     | Trigger                           | Use case                                |
| ------------- | --------------------------------- | --------------------------------------- |
| `Tooltip`     | Hover target with optional delay  | Lightweight explanatory text            |
| `Popover`     | Click target                      | Small transient panels with child nodes |
| `ContextMenu` | Usually right-click or click      | Command menus with separators/items     |
| `Overlay`     | Manual `showAt()`/`showAtPoint()` | Custom floating components              |

## Maintainer checklist

- Use `target.getWorldBounds()` for transformed targets.
- Constrain examples to either the viewport or the card bounds being demonstrated.
- Hide or dispose transient UI when its target leaves the tree.
- Keep overlay content readable over underlying controls; use sufficiently opaque backgrounds.

Related: [`Button`](/reference/ui-button/), [`ScrollView`](/reference/ui-components/#scrollview), [`Modal`](/reference/ui-components/#modal).
