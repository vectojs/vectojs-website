---
title: 'ThreeRenderer'
description: 'Use Three.js as the IRenderer backend for a VectoJS Scene: implemented methods, the GLSL gradient shader layout, and the linewidth caveat.'
order: 43
---

# `ThreeRenderer`

Part of [`@vectojs/three`](/reference/three/).

`ThreeRenderer` implements the `IRenderer` interface from [`@vectojs/core`](/reference/core-renderer/) using Three.js — fills, strokes, and text are rendered as Three.js meshes and lines into an orthographic scene rather than Canvas 2D operations. Use it when Three.js is already in your project and you want the VectoJS scene itself rendered with the WebGL pipeline instead of Canvas 2D.

## When to use

- You want VectoJS's 2D content rendered as Three.js objects through a dedicated `THREE.WebGLRenderer` created for the supplied canvas.
- You need hardware-accelerated gradient fills backed by GLSL shaders.
- You are benchmarking or experimenting with a pure-WebGL 2D pipeline.

For embedding a 2D UI onto a 3D surface, prefer [`ThreeAdapter`](/reference/three-adapter/) instead — it does not require you to give up Canvas 2D rendering.

## Constructor

```ts
new ThreeRenderer(canvas: HTMLCanvasElement)
```

Creates:

- `THREE.WebGLRenderer` with `{ canvas, alpha: true, antialias: true }`
- `THREE.OrthographicCamera` with Y pointing down (top = 0, bottom = height) to match VectoJS's coordinate system
- Pixel ratio set to `window.devicePixelRatio` automatically, and **kept in sync**
  as it changes at runtime (see below)

`ThreeRenderer` creates and owns this WebGLRenderer; it does not accept or reuse an existing renderer/context. `dispose()` removes active objects, releases their geometry/material/texture resources, resets stacks, and disposes the owned WebGLRenderer exactly once. It also detaches the context-loss and DPR listeners described below, so a disposed renderer can't be resurrected by a late event.

## GPU context loss & runtime DPR

A GPU reset or memory-pressure eviction would otherwise leave a Three-backed
scene permanently blank, and a monitor move or browser zoom would leave it
rendering at a stale pixel ratio (blurry or aliased). `ThreeRenderer` handles
both:

- **`webglcontextlost`** is `preventDefault()`-ed — required, or the browser never
  fires the restore event — and flips `isContextLost()`. `present()` becomes a
  no-op while lost, since drawing against a dead context is pointless.
- **`webglcontextrestored`** re-applies pixel ratio and size (a restore can land
  on a different display), clears the flag, and forces a repaint of the freshly
  cleared framebuffer. Three's `WebGLRenderer` rebuilds its GL state lazily on the
  next render.
- **DPR changes** are tracked with a `(resolution: Ndppx)` media query that
  re-applies `setPixelRatio` + `setSize` and re-arms itself (the query is
  one-shot).

All of it is guarded for SSR / `OffscreenCanvas` (no `addEventListener` or
`matchMedia`). `isContextLost()` also satisfies the optional
[`IRenderer`](/reference/core-renderer/#surviving-gpu-context-loss) hook, so
`Scene.render` skips the pass while the context is gone.

## Public properties

| Property          | Type                       |
| ----------------- | -------------------------- |
| `scene`           | `THREE.Scene`              |
| `camera`          | `THREE.OrthographicCamera` |
| `renderer`        | `THREE.WebGLRenderer`      |
| `isContextLost()` | `() => boolean`            |

## Usage

Pass the renderer as the `renderer` option to the VectoJS `Scene` constructor:

```ts
import { Scene } from '@vectojs/core';
import { ThreeRenderer } from '@vectojs/three';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const threeRenderer = new ThreeRenderer(canvas);

const scene = new Scene(canvas, { renderer: threeRenderer });
scene.add(/* entities */);
scene.start();
```

## Implemented IRenderer methods

| Method                                                                                    | Notes                                                                                                                                                        |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `beginPath()` `moveTo()` `lineTo()` `bezierCurveTo()` `closePath()` `arc()` `roundRect()` | Path accumulation; flushed on `fill()` or `stroke()`.                                                                                                        |
| `fill(colorOrGradient)`                                                                   | Solid fills via `MeshBasicMaterial`; gradients via GLSL `ShaderMaterial` (see below). CSS color alpha multiplies inherited renderer alpha.                   |
| `stroke(colorOrGradient, lineWidth?)`                                                     | `LineBasicMaterial`. See linewidth caveat below.                                                                                                             |
| `fillText(text, x, y, font, color)`                                                       | Renders text to an offscreen canvas, uploads as `THREE.CanvasTexture`. Gradients fall back to the first color stop.                                          |
| `fillCircle(cx, cy, radius, color, alpha?)`                                               | `THREE.CircleGeometry` with 32 segments + `MeshBasicMaterial`.                                                                                               |
| `drawImage(source, dx, dy, dw, dh)`                                                       | `THREE.CanvasTexture` + `PlaneGeometry`.                                                                                                                     |
| `save()` `restore()` `translate()` `scale()` `rotate()` `setGlobalAlpha()` `clip()`       | Transform/alpha stack; nested clips intersect. Scissor clipping uses the transformed world AABB, so a rotated/sheared clip is an axis-aligned approximation. |
| `createLinearGradient(x0, y0, x1, y1, colorStops)`                                        | Returns a `WebGLGradient` descriptor consumed by `fill()`.                                                                                                   |
| `flush()`                                                                                 | Calls `renderer.render(scene, camera)`.                                                                                                                      |
| `resize(width, height)`                                                                   | Updates `renderer.setSize()` and recalculates camera bounds.                                                                                                 |
| `clear()`                                                                                 | Disposes frame geometry/materials and resets path, transform, alpha, and scissor-stack state.                                                                |

## Linewidth caveat

`THREE.LineBasicMaterial.linewidth` is **silently ignored by WebGL on most platforms** — lines are capped at 1 px regardless of the value passed to `stroke()`. This is a browser/GPU driver limitation, not a VectoJS restriction.

If your design requires thick strokes (> 1 px), consider:

- Using `fill()` with a rectangular path instead of `stroke()` for straight lines.
- Switching to [`ThreeAdapter`](/reference/three-adapter/) with the default `CanvasRenderer`, which supports arbitrary line widths via Canvas 2D.
- Integrating `THREE.MeshLine` manually in your application layer — `ThreeRenderer` does not bundle this dependency.

## Gradient support

`ThreeRenderer.createLinearGradient()` returns a `WebGLGradient` descriptor. When passed to `fill()`, the renderer compiles a GLSL `ShaderMaterial` with the following uniform layout:

```glsl
uniform vec4 u_grad_colors[8];  // RGBA per stop
uniform float u_grad_stops[8];  // normalized position [0, 1]
uniform vec2 u_grad_start;      // world-space start point
uniform vec2 u_grad_end;        // world-space end point
```

Color is interpolated linearly between the two nearest stops in world space. If more than 8 stops are provided, they are resampled to 8 evenly-spaced points before upload — color detail beyond 8 stops is lost.

**Gradients are not supported for `stroke()` or `fillText()`.** Passing a `WebGLGradient` to `stroke()` falls back to the first stop color. `fillText()` also falls back to the first stop color because text glyphs are rasterized via Canvas 2D before upload.

See the [main `@vectojs/three` page](/reference/three/#troubleshooting) for troubleshooting gradient/DPI/pointer issues.

## Related

[`ThreeAdapter`](/reference/three-adapter/) (the alternate use case — a 2D panel on a 3D surface) ·
[`IRenderer` / `CanvasRenderer`](/reference/core-renderer/) (the interface this implements) ·
[`@vectojs/three` overview](/reference/three/)
