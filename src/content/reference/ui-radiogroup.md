---
title: 'UI: RadioGroup'
description: 'Mutually exclusive radio choices rendered as one canvas component.'
order: 28
---

# `RadioGroup`

`RadioGroup` renders a set of mutually exclusive options and exposes a group-level semantic role.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · RadioGroup</span></div>
  <iframe src="/sandbox/ui/component.html?name=radiogroup&v=core-1.25.0-ui-2.6.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="RadioGroup live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>The demo flips between horizontal and vertical layout on narrow widths.</figcaption>
</figure>

## Minimal example

```ts
import { RadioGroup } from '@vectojs/ui';

const renderer = new RadioGroup({
  value: 'webgpu',
  direction: 'horizontal',
  options: [
    { value: 'canvas', label: 'Canvas' },
    { value: 'webgl', label: 'WebGL' },
    { value: 'webgpu', label: 'WebGPU' },
  ],
});
```

`RadioGroup` projects `{ role: 'radiogroup', label }`. Since 2.8.0 the group's
own accessible name is settable, defaulting to the generic `'Radio group'`:

```ts
new RadioGroup({
  label: 'Render backend',
  options: [
    { value: 'canvas', label: 'Canvas' },
    { value: 'webgl', label: 'WebGL' },
  ],
});
```

Each option carries its own name, but the group's name is what says _which
choice is being made_. On a screen with more than one group the default leaves a
screen-reader user hearing "Radio group" repeatedly with no way to tell them
apart — set it whenever the visual heading identifying the group is drawn on the
canvas rather than being part of the group (WCAG 4.1.2). It is also settable
after construction as a public field.

## Maintainer checklist

- Keep selected visual state and emitted value aligned.
- Use disabled styling and behavior together.
- Recompute layout when labels, font, or direction changes.
