---
title: 'Button'
description: 'Canvas-rendered button component with a semantic button projection for accessibility and automation.'
order: 21
---

# `Button`

`Button` renders a rounded canvas button and projects a real transparent `<button>` over the
same box. Users see canvas pixels; screen readers and automation tools operate the semantic node.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Button</span></div>
  <iframe src="/sandbox/ui/button.html" class="sandbox-frame component-demo-frame" loading="eager" title="Button live demo" sandbox="allow-scripts allow-same-origin"></iframe>
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
  bg?: string;
  hoverBg?: string;
  color?: string;
  font?: string;
  padding?: number;
  radius?: number;
}
```

## Accessibility and automation

`Button` exposes `{ tag: 'button', role: 'button', label }`, so tests should target the semantic
control instead of pixels:

```ts
await page.getByRole('button', { name: 'Save changes' }).click();
```

## Maintainer checklist

- Hover and pointer leave must call `scene.markDirty()` in `onDemand` scenes.
- The visual button label and accessible label must stay identical unless a future option adds an
  explicit accessible name.
- Prefer `Button` over custom clickable rectangles for docs examples.

Related: [`Toggle`](/reference/ui-components/#toggle), [`Checkbox`](/reference/ui-components/#checkbox), [`Overlay`](/reference/ui-overlay/).
