---
title: 'Slider'
description: 'Canvas slider component that exposes the WAI-ARIA slider contract and repaints smoothly in on-demand scenes.'
order: 13
---

# `Slider`

`Slider` is a pointer-driven range control. It paints the track, progress and thumb on canvas, while
exposing `role="slider"` with `valuemin`, `valuemax`, and live `value` metadata.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Slider</span></div>
  <iframe src="/sandbox/ui/slider.html?v=core-1.9.2-ui-1.9.3" class="sandbox-frame component-demo-frame component-demo-frame-tall" loading="eager" title="Slider live demo" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>Drag the thumb and watch the label and progress bar update from the same change event.</figcaption>
</figure>

## Minimal example

```ts
import { Slider, Text } from '@vectojs/ui';

const label = new Text('Quality: 64%');
const slider = new Slider({
  min: 0,
  max: 100,
  value: 64,
  width: 320,
  onChange(value) {
    label.setText(`Quality: ${value}%`);
    scene.markDirty();
  },
});
```

## Constructor

```ts
new Slider({
  min?: number;              // default 0
  max?: number;              // default 100
  value?: number;            // default min
  width?: number;            // default 200
  height?: number;           // default 24
  trackColor?: string;
  progressColor?: string;
  handleColor?: string;
  onChange?: (value: number) => void;
})
```

## Events

`Slider` emits `change` with `{ value }` after pointer input changes the rounded value. Repeated
pointer events at the same value do not emit duplicate changes.

## Maintainer checklist

- Pointer updates must clamp local X into `[0,width]`.
- Value changes must call `scene.markDirty()` so `renderMode = 'onDemand'` remains smooth.
- Keep the role metadata in sync with the current value.

Related: [`ProgressBar`](/reference/ui-components/#progressbar), [`Input`](/reference/ui-components/#input), [`Button`](/reference/ui-button/).
