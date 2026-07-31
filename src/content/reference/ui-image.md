---
title: 'UI: Image'
description: 'Canvas image component with placeholder rendering and semantic img projection.'
order: 19
---

# `Image`

`Image` draws an asynchronously loaded bitmap to canvas and projects a semantic `<img>` node.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Image</span></div>
  <iframe src="/sandbox/ui/component.html?name=image&v=core-1.25.0-ui-2.6.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Image live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>The placeholder paints until the image load callback marks the scene dirty.</figcaption>
</figure>

## Minimal example

```ts
import { Image } from '@vectojs/ui';

const logo = new Image('/logo.svg', {
  width: 160,
  height: 80,
  alt: 'Vecto logo',
  onLoad: () => scene.markDirty(),
});
```

## Maintainer checklist

- Always provide `width` and `height`.
- Provide meaningful `alt` text for non-decorative images.
- In `onDemand` scenes, call `scene.markDirty()` from `onLoad`.
