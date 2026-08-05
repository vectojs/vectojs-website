---
title: 'UI: Toggle'
description: 'Switch control with role=switch semantics and spring knob motion.'
order: 26
---

# `Toggle`

`Toggle` is a switch-style boolean control. It projects `role="switch"` and animates the knob with
the shared animation system.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Toggle</span></div>
  <iframe src="/sandbox/ui/component.html?name=toggle&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Toggle live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>The knob retargets smoothly while semantic `checked` state stays current.</figcaption>
</figure>

## Minimal example

```ts
import { Toggle } from '@vectojs/ui';

const darkMode = new Toggle({
  checked: true,
  label: 'Dark mode',
  onChange: (checked) => setDarkMode(checked),
});
```

## Maintainer checklist

- Keep the knob animation and semantic state aligned.
- Respect reduced motion through the shared animation system.
- Prefer `Checkbox` for non-switch boolean choices.
