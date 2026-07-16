---
title: 'UI: Dropdown'
description: 'Combobox control with an overlay listbox and keyboard navigation.'
order: 27
---

# `Dropdown`

`Dropdown` wraps a canvas button, projects `role="combobox"`, and opens an overlay listbox.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Dropdown</span></div>
  <iframe src="/sandbox/ui/component.html?name=dropdown&v=core-1.9.2-ui-1.9.5" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Dropdown live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Open it with pointer or keyboard; the menu mounts through the scene overlay path.</figcaption>
</figure>

## Minimal example

```ts
import { Dropdown } from '@vectojs/ui';

const backend = new Dropdown(['Canvas', 'WebGL', 'WebGPU'], {
  width: 220,
  onChange: (value) => setBackend(value),
});
```

## Maintainer checklist

- Keep `expanded`, `controls`, and `activedescendant` metadata in sync.
- Close the overlay on outside click and Escape.
- Test ArrowUp, ArrowDown, Enter, Space, and Escape.
