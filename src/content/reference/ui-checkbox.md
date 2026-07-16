---
title: 'UI: Checkbox'
description: 'Checkbox control with native input semantics and canvas visual state.'
order: 25
---

# `Checkbox`

`Checkbox` projects a real checkbox input and paints the visual state on canvas.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Checkbox</span></div>
  <iframe src="/sandbox/ui/component.html?name=checkbox&v=core-1.9.0-ui-1.9.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Checkbox live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Canvas clicks and native input changes share the same `change` path.</figcaption>
</figure>

## Minimal example

```ts
import { Checkbox } from '@vectojs/ui';

const enabled = new Checkbox({
  checked: true,
  label: 'Enable semantic projection',
  onChange: (checked) => setEnabled(checked),
});
```

## Maintainer checklist

- Keep `checked` and the projected input state synchronized.
- Call `scene.markDirty()` when visual state changes.
- Use a label unless surrounding context already names the control.
