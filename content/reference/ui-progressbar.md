+++
title = "UI: ProgressBar"
description = "Canvas progress indicator with optional percentage label and progressbar semantics."
weight = 30
+++

# `ProgressBar`

`ProgressBar` paints a track, filled accent, and optional percentage text.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ProgressBar</span></div>
  <iframe src="/sandbox/ui/component.html?name=progressbar&v=core-1.39.0-ui-2.20.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="ProgressBar live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Use `setValue()` to clamp and repaint progress changes.</figcaption>
</figure>

## Minimal example

```ts
import { ProgressBar } from '@vectojs/ui';

const progress = new ProgressBar({
  value: 0.72,
  width: 320,
  height: 22,
  showText: true,
});

progress.setValue(0.9);
```

## Maintainer checklist

- Clamp values into `[0, 1]`.
- Pair progress color with text or semantic value.
- Call `scene.markDirty()` when value changes.
