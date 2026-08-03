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
  <iframe src="/sandbox/ui/component.html?name=dropdown&v=core-1.29.0-ui-2.11.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Dropdown live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Open it with pointer or keyboard; the menu mounts through the scene overlay path.</figcaption>
</figure>

## Minimal example

```ts
import { Dropdown } from '@vectojs/ui';

const backend = new Dropdown(['Canvas', 'WebGL', 'WebGPU'], {
  label: 'Renderer backend',
  width: 220,
  onChange: (value) => setBackend(value),
});
```

> **Set `label`.** A `role="combobox"` with no accessible name is announced as
> bare "combobox" (WCAG 4.1.2); the selected value alone does not say what the
> control is for. Any visual label drawn on canvas does not reach the semantic
> layer, so pass it here too. Available since `@vectojs/ui@2.2.0`.

The closed trigger takes `bg`/`color`; the option rows in the open menu take
their own five props, all added in 2.7.0:

| Prop              | Default                     | Applies to                   |
| ----------------- | --------------------------- | ---------------------------- |
| `menuBg`          | `'rgba(15, 23, 42, 0.95)'`  | every option row             |
| `menuColor`       | `'#fff'`                    | option row text              |
| `menuSelectedBg`  | `'rgba(0, 240, 255, 0.25)'` | the selected row             |
| `menuHighlightBg` | `'rgba(0, 240, 255, 0.4)'`  | the keyboard-highlighted row |
| `focusColor`      | `'#00f0ff'`                 | trigger and option rows      |

```ts
new Dropdown(['1x', '1.5x', '2x'], {
  label: 'Playback rate',
  bg: 'rgba(18, 23, 34, 0.98)',
  menuBg: 'rgba(18, 23, 34, 0.98)',
  menuColor: '#e2e8f0',
  menuSelectedBg: 'rgba(244, 63, 94, 0.30)',
  menuHighlightBg: 'rgba(244, 63, 94, 0.55)',
  focusColor: '#60a5fa',
});
```

Before these existed the trigger was themeable while the menu was not, so a
dropdown styled for a light or warm palette opened a dark slate panel with cyan
selection — which reads as a rendering bug rather than a style choice.

Two things worth knowing when picking values:

- **Both row states can apply at once**, and opening the menu highlights the
  selected row, so `menuHighlightBg` should read as the stronger of the two.
- **Option rows are focusable** (`role="option"`), so the `focusColor` ring is
  drawn _on_ a highlighted row. Keep the ring clear of `menuHighlightBg` by at
  least 3:1 (WCAG SC 1.4.11) — pushing the highlight's alpha up far enough to
  separate it from `menuSelectedBg` can quietly take the ring below that floor.

Near-opaque menu backgrounds are usually right: a translucent menu over moving
canvas content stays legible by contrast but still reads as noisy.

## Maintainer checklist

- Keep `expanded`, `controls`, and `activedescendant` metadata in sync.
- Close the overlay on outside click and Escape.
- Test ArrowUp, ArrowDown, Enter, Space, and Escape.
