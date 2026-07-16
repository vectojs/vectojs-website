---
title: '@vectojs/three'
description: 'Three.js adapters for VectoJS: render 2D UI panels as 3D textures (ThreeAdapter) or use Three.js as the rendering backend (ThreeRenderer).'
order: 41
---

# `@vectojs/three`

Two exports, two distinct use cases:

| Export                                        | Use case                                                                                                                                                                                                 |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`ThreeAdapter`](/reference/three-adapter/)   | Render a VectoJS `Scene` onto an adapter-owned or caller-provided canvas, expose it as a `THREE.CanvasTexture`, and wire pointer events via UV raycasting. The rest of your Three.js scene is untouched. |
| [`ThreeRenderer`](/reference/three-renderer/) | Use Three.js as the 2D rendering backend for a VectoJS `Scene` — fills, strokes, and text become Three.js meshes in an orthographic scene rather than Canvas 2D draw calls.                              |

`ThreeAdapter` is the common path: you have a 3D scene and want a 2D UI panel floating on a surface — see its page for the constructor, WebXR/multi-touch event handling, and a complete worked example. `ThreeRenderer` is for projects that already commit to Three.js and want hardware-accelerated 2D primitives with no Canvas 2D fallback — see its page for implemented `IRenderer` methods and the gradient shader layout.

---

## Installation

```sh
bun add @vectojs/three three
```

For TypeScript projects, add the Three.js types:

```sh
bun add -d @types/three
```

---

## Troubleshooting

### Gradient renders as a solid color instead of blending

`stroke()` does not support gradients — it always uses the first color stop as a solid color. Use `fill()` with a closed path if you need a gradient-painted shape outline effect.

Also verify that you are calling `createLinearGradient()` from `ThreeRenderer` (returns a `WebGLGradient`) and not from a `CanvasRenderingContext2D` — mixing renderer gradient objects across implementations produces undefined behavior.

### Text appears blurry on high-DPI displays

Do **not** pre-multiply the constructor dimensions by `window.devicePixelRatio` — `@vectojs/core`'s `CanvasRenderer` already scales the adapter canvas's backing store by DPR internally (and pre-multiplying would double-scale the buffer while distorting your logical layout space). Browser-level DPR is handled for you.

If panel text still looks soft, the cause is 3D projection, not DPR: the plane's on-screen area exceeds the texture's resolution (camera too close, or mesh scaled too large for the texture size). Increase the requested `width`/`height` — this raises the texture resolution _and_ gives the scene proportionally more logical layout room:

```ts
// Sharper texture: more logical + physical pixels for the same world-space mesh size
const adapter = new ThreeAdapter({ width: 1024, height: 640 });
adapter.mesh.scale.set(3.2, 3.2 * (640 / 1024), 1); // world size unchanged; density doubled
```

Note that entity positions and font sizes are expressed in logical pixels, so doubling the constructor dimensions without adjusting layout leaves your UI occupying a quarter of the panel — scale positions and sizes along with it.

### Pointer events have no effect on VectoJS components

`updateIntersection()` must be called on every frame where input should be processed — it is not enough to call it only in DOM event listeners, because the raycaster needs the current camera and mesh state at the time of the event. Confirm:

1. `updateIntersection()` is called inside your render loop (or directly in pointer-event handlers with a freshly set raycaster).
2. The raycaster's camera matches the camera used to render the scene.
3. `adapter.mesh` is part of the Three.js scene graph when the ray is cast — orphan meshes (not added to the scene) are not intersected.

## Related

[`ThreeAdapter`](/reference/three-adapter/) · [`ThreeRenderer`](/reference/three-renderer/) ·
[`IRenderer` / `CanvasRenderer`](/reference/core-renderer/)
