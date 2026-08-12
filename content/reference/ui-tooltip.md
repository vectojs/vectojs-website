+++
title = "UI: Tooltip"
description = "Hover-triggered overlay text anchored to a target entity."
weight = 37
+++

# `Tooltip`

`Tooltip` displays a small text panel near a target after a delay.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Tooltip</span></div>
  <iframe src="/sandbox/ui/component.html?name=tooltip&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Tooltip live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Hover the target to verify placement and dismissal.</figcaption>
</figure>

## Minimal example

```ts
import { Button, Tooltip } from '@vectojs/ui';

const target = new Button('Hover me');
const tooltip = new Tooltip({
  target,
  content: 'Save file',
  placement: 'right',
});
```

## Maintainer checklist

- Clear pending timers on pointer leave.
- Keep tooltip content short.
- Mount once; let the tooltip manage its own show/hide lifecycle.
