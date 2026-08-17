+++
title = "UI: Image"
description = "Canvas image component with placeholder rendering and semantic img projection."
weight = 19
+++

# `Image`

`Image` draws an asynchronously loaded bitmap to canvas and projects a semantic `<img>` node.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Image</span></div>
  <iframe src="/sandbox/ui/component.html?name=image&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Image live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## Fitting, focal cropping, and rounded corners

`fit` controls how the loaded bitmap maps into the `width` × `height` box, and
`focalPoint` refines `'cover'` cropping — both 2.18.0+.

| `fit`       | Behavior                                                                    |
| ----------- | --------------------------------------------------------------------------- |
| `'fill'`    | Stretch to the box (default, legacy behavior).                              |
| `'cover'`   | Preserve aspect ratio, fill the box, crop the overflow around `focalPoint`. |
| `'contain'` | Preserve aspect ratio, fit the whole bitmap inside the box (centered).      |

`focalPoint` is `{ x, y }` with each axis in `0..1` — `0` is top/left, `1` is
bottom/right, default `{ x: 0.5, y: 0.5 }`; only `'cover'` reads it, and values
outside `[0, 1]` are clamped. `radius` now rounds the loaded bitmap's corners,
not just the placeholder, so a rounded avatar with `fit: 'cover'` clips the
cropped overflow to the same silhouette.

```ts
import { Image, type ImageFit, type ImageFocalPoint } from '@vectojs/ui';

const avatar = new Image('/avatar.jpg', {
  width: 96,
  height: 96,
  fit: 'cover',
  focalPoint: { x: 0.5, y: 0.25 }, // bias toward the top of the frame
  radius: 48, // circle-crop the loaded bitmap
  alt: 'Profile photo',
});
```

## Maintainer checklist

- Always provide `width` and `height`.
- Provide meaningful `alt` text for non-decorative images.
- In `onDemand` scenes, call `scene.markDirty()` from `onLoad`.
- The options object is **required** — `new Image(src)` without options throws.
- A cross-origin `src` (e.g. a CDN SVG without CORS headers) taints the
  canvas and breaks every later `getImageData`/`toDataURL`. Inline the asset
  as a `data:image/svg+xml` URL for same-origin-safe drawing.
