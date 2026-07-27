---
title: 'Button'
description: 'Canvas-rendered button component with a semantic button projection for accessibility and automation.'
order: 12
---

# `Button`

`Button` renders a rounded canvas button and projects a real transparent
`<button>` over the same box. Users see canvas pixels; screen readers and
automation tools operate the semantic node.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Button</span></div>
  <iframe src="/sandbox/ui/button.html?v=core-1.18.0-ui-2.3.2" class="sandbox-frame component-demo-frame" loading="eager" title="Button live demo" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>Hover changes the painted state. Clicks route through the same button role that Playwright can find.</figcaption>
</figure>

## Minimal example

```ts
import { Scene } from '@vectojs/core';
import { Button } from '@vectojs/ui';

const scene = new Scene(canvas);
scene.renderMode = 'onDemand';

scene.add(
  new Button('Save changes', {
    onClick: () => save(),
  }).setPosition(40, 40),
);

scene.start();
```

## Constructor

```ts
new Button(label: string, opts?: ButtonOptions & { width?: number; height?: number })

interface ButtonOptions {
  onClick?: (event: unknown) => void;
  disabled?: boolean;        // 2.3.0+ — see below
  bg?: string;
  hoverBg?: string;
  color?: string;
  font?: string;
  padding?: number;
  radius?: number;
}
```

## Accessibility and automation

`Button` exposes `{ tag: 'button', role: 'button', label }`, so tests should
target the semantic control instead of pixels:

```ts
await page.getByRole('button', { name: 'Save changes' }).click();
```

### `disabled` (2.3.0+)

`disabled` is drawn muted **and** projected onto the shadow `<button>`, so what
a sighted user sees and what a screen reader reports cannot diverge. Settable
after construction:

```ts
const save = new Button('Save', { onClick: submit });
save.disabled = true; // muted fill, projects `disabled`, drops hover/focus state
```

It also blocks `onClick` from **both** input paths. The browser suppresses a DOM
click on a disabled `<button>`, but the canvas hit-test dispatches independently
— so the native attribute alone would not be enough.

An enabled button omits the attribute rather than writing `disabled="false"`,
which on a native `<button>` would still disable it.

## Forced colors (High Contrast)

`Button` reads
[`Scene.forcedColors`](/reference/core-scene/#accessibility--appearance) and,
when the OS is in a forced-colors mode, repaints with CSS system colors instead
of its themed palette: a `ButtonFace` fill, a `ButtonText` label plus a 1px
`ButtonText` border (so the shape is visible against the system background), and
a `Highlight` focus ring. Canvas pixels are exempt from the browser's
forced-colors remapping, so a component that skips this stays unreadable in High
Contrast. The scene repaints automatically when the setting toggles.

## Maintainer checklist

- Hover and pointer leave must call `scene.markDirty()` in `onDemand` scenes.
- The visual button label and accessible label must stay identical unless a
  future option adds an explicit accessible name.
- Prefer `Button` over custom clickable rectangles for docs examples.
- Custom button-like components should mirror the forced-colors branch above.

Related: [`Toggle`](/reference/ui-components/#toggle),
[`Checkbox`](/reference/ui-components/#checkbox),
[`Overlay`](/reference/ui-overlay/).
