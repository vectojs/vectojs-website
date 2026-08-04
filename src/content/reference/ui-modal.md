---
title: 'UI: Modal'
description: 'Blocking overlay component with a card, backdrop, and spring enter/exit motion.'
order: 36
---

# `Modal`

`Modal` mounts into the overlay layer, blocks underlying pointer events, and animates its card in and
out.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Modal</span></div>
  <iframe src="/sandbox/ui/component.html?name=modal&v=core-1.30.0-ui-2.12.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Modal live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Open the modal, then close it with the canvas-rendered close button.</figcaption>
</figure>

## Minimal example

```ts
import { Button, Modal } from '@vectojs/ui';

const open = new Button('Open modal', {
  onClick: () => {
    scene.showOverlay(new Modal('Export complete', { width: scene.width, height: scene.height }));
  },
});
```

## Maintainer checklist

- Size the modal backdrop to the scene dimensions.
- Keep close behavior explicit.
- Verify reduced-motion behavior and focus handling before broad use.
