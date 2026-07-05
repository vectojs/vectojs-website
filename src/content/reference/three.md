---
title: '@vectojs/three'
description: 'Three.js adapters for VectoJS: render 2D UI panels as 3D textures (ThreeAdapter) or use Three.js as the rendering backend (ThreeRenderer).'
order: 4
---

# `@vectojs/three`

Two exports, two distinct use cases:

| Export          | Use case                                                                                                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ThreeAdapter`  | Render a VectoJS `Scene` onto an adapter-owned or caller-provided canvas, expose it as a `THREE.CanvasTexture`, and wire pointer events via UV raycasting. The rest of your Three.js scene is untouched. |
| `ThreeRenderer` | Use Three.js as the 2D rendering backend for a VectoJS `Scene` — fills, strokes, and text become Three.js meshes in an orthographic scene rather than Canvas 2D draw calls.                              |

`ThreeAdapter` is the common path: you have a 3D scene and want a 2D UI panel floating on a surface. `ThreeRenderer` is for projects that already commit to Three.js and want hardware-accelerated 2D primitives with no Canvas 2D fallback.

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

## ThreeAdapter

`ThreeAdapter` uses the supplied `canvas`, or creates one when omitted. It renders a VectoJS `Scene` onto that canvas, wraps the result as a `THREE.CanvasTexture`, and gives you a ready-to-use `THREE.Mesh` (a unit `PlaneGeometry` with a `MeshBasicMaterial`). Pointer and scroll events from your Three.js event listeners are translated back into VectoJS logical coordinates via raycasting.

### Constructor

```ts
new ThreeAdapter(options: ThreeAdapterOptions)
```

```ts
interface ThreeAdapterOptions {
  width: number; // logical width of the 2D UI scene (CSS px)
  height: number; // logical height (CSS px)
  canvas?: HTMLCanvasElement; // optional pre-existing canvas; adapter creates one if omitted
  sceneOptions?: SceneOptions; // forwarded to the VectoScene constructor
}
```

`disableWindowResize` is forced to `true` internally regardless of what you pass in `sceneOptions` — the adapter owns resize via `resize(w, h)`, not the window.

### Public properties

| Property     | Type                  | Description                                                                                                       |
| ------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `texture`    | `THREE.CanvasTexture` | The texture wrapping the VectoJS canvas. Set `needsUpdate = true` automatically after every VectoJS render frame. |
| `vectoScene` | `VectoScene`          | The active VectoJS `Scene` instance. Add entities to this.                                                        |
| `canvas`     | `HTMLCanvasElement`   | The adapter-owned or caller-provided canvas onto which VectoJS draws.                                             |
| `mesh`       | `THREE.Mesh`          | Pre-built `PlaneGeometry(1, 1)` + `MeshBasicMaterial` mesh ready to drop into your Three.js scene.                |

### Methods

#### `updateIntersection(raycaster, type, originalEvent?)`

```ts
updateIntersection(
  raycaster: THREE.Raycaster,
  type: 'pointerdown' | 'pointerup' | 'pointermove' | 'wheel' | 'click',
  originalEvent?: PointerEvent | WheelEvent
): boolean
```

Cast the ray against the adapter mesh, translate the UV hit into VectoJS canvas coordinates, and dispatch the event into the VectoJS scene. Returns `true` when the ray intersected the mesh.

Pointer button state and `shiftKey`/`ctrlKey`/`altKey`/`metaKey` are preserved;
wheel events additionally preserve all deltas and modifier keys.

Call this from within your Three.js render loop or pointer-event listeners. The adapter maintains per-`pointerId` hover state so WebXR controllers and multi-touch inputs each carry independent hover/focus contexts.

**UV remapping**: Three.js UV coordinates have Y=0 at the bottom of a plane; VectoJS has Y=0 at the top. The adapter flips the Y axis automatically — you do not need to adjust coordinates.

#### `resize(width, height)`

```ts
resize(width: number, height: number): void
```

Resize the canvas and the underlying logical `VectoScene`. Call when the panel's render resolution or 2D layout viewport changes; changing only the mesh's world-space scale does not require this.

#### `dispose()`

```ts
dispose(): void
```

Idempotently disposes the `THREE.CanvasTexture`, geometry, and material on the mesh, detaches the mesh, restores the Scene render method, destroys the `VectoScene`, and clears all per-pointer state. An adapter-created canvas is released to `0×0`; a caller-provided canvas keeps its dimensions.

### Complete example

The following example renders a VectoJS settings panel on a rotating plane in a Three.js scene. Pointer events from the `pointermove`, `pointerdown`, and `pointerup` DOM listeners are forwarded into VectoJS via `updateIntersection`.

```ts
import * as THREE from 'three';
import { ThreeAdapter } from '@vectojs/three';
import { Text, Button, Stack } from '@vectojs/ui';

// --- Three.js scene setup ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const threeScene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 3);

// --- VectoJS panel adapter (512×256 logical pixels, displayed on a 2×1 plane) ---
const adapter = new ThreeAdapter({ width: 512, height: 256 });

const heading = new Text('Settings', { font: '600 24px Inter', color: '#f8fafc' });
const applyBtn = new Button('Apply', { width: 120, height: 40 });
applyBtn.on('click', () => console.log('apply clicked'));

const stack = new Stack({ direction: 'vertical', gap: 20 });
stack.add(heading);
stack.add(applyBtn);
stack.setPosition(20, 20);
adapter.vectoScene.add(stack);

adapter.vectoScene.start();

// --- Place mesh in the Three.js scene ---
const panel = adapter.mesh;
panel.scale.set(2, 1, 1); // world-space size matches the 2:1 aspect ratio
threeScene.add(panel);

// --- Raycaster for event translation ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function updatePointer(event: PointerEvent) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

window.addEventListener('pointermove', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'pointermove', e);
});

window.addEventListener('pointerdown', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'pointerdown', e);
});

window.addEventListener('pointerup', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'pointerup', e);
});

window.addEventListener('click', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'click', e);
});

window.addEventListener('wheel', (e) => {
  updatePointer(e as unknown as PointerEvent);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'wheel', e);
});

// --- Render loop ---
function animate() {
  requestAnimationFrame(animate);
  panel.rotation.y += 0.005;
  renderer.render(threeScene, camera);
}

animate();

// --- Cleanup ---
window.addEventListener('unload', () => adapter.dispose());
```

### How the adapter works internally

The constructor monkey-patches `vectoScene.render` to set `texture.needsUpdate = true` after each VectoJS frame. Three.js then uploads the canvas to the GPU on the next `renderer.render()` call. No polling or manual sync is required.

Raycast UV coordinates are mapped into the scene's **logical** coordinate space (`vectoScene.width`/`height` — the dimensions you passed to the constructor), not the adapter canvas's physical backing-store size. The distinction matters on HiDPI displays: `@vectojs/core`'s `CanvasRenderer` scales the backing store by `devicePixelRatio` for crisp rendering (`canvas.width = logicalWidth × dpr`), while entity layout and hit-testing stay logical.

> [!WARNING] > **On `@vectojs/three` ≤ 0.1.1, UV mapping used the physical canvas size** — so on any display or browser-zoom level where `devicePixelRatio ≠ 1`, every pointer event landed below/right of the cursor by exactly the DPR factor. The symptom is distinctive: clicks activate a control _further down the panel_ than the one under the cursor, with the offset growing the deeper into the panel the target sits — while behaving perfectly on DPR-1 displays and in headless test environments. Fixed in **0.1.2**; upgrade rather than working around it.

Hit events dispatched by `updateIntersection` are forwarded to the entity's accessibility DOM element when one exists **and is connected to a live document** (which routes them through the a11y shadow layer and fires `click`/`change` on interactive components), or directly as `VectoJSEvent` objects otherwise.

> [!NOTE]
> With the default adapter-created canvas, panels take the direct `VectoJSEvent` path because the canvas and its a11y root are detached. If you provide a canvas that is connected to `document`, its connected a11y elements can use the DOM-dispatch path. Versions 0.1.1 and newer of `@vectojs/three` check connectivity instead of assuming either case.
>
> **This matters for `Toggle`/`Button` correctness, not just for avoiding a thrown error.** In version 0.1.0 of `@vectojs/three`, a disconnected a11y element could incorrectly take the DOM-dispatch branch and silently miss the component callback. Versions 0.1.1 and newer route disconnected elements directly. Native DOM focus/IME/screen-reader behavior is unavailable for the default detached canvas, but remains possible when a caller-provided canvas and its projection layer are connected.

---

## WebXR and multi-touch

`updateIntersection` tracks hover state per `pointerId` taken from `originalEvent`. In a WebXR session, each controller carries its own `pointerId`, so hovering with one controller does not interfere with the state of the other. Pass the raw `XRInputSourceEvent` wrapped in a synthetic `PointerEvent` with the controller's `inputSource.handedness` encoded as the `pointerId` (0 for left, 1 for right) to maintain independent hit state.

```ts
// WebXR example — minimal controller event forwarding
session.addEventListener('selectstart', (xrEvent) => {
  const synth = new PointerEvent('pointerdown', {
    pointerId: xrEvent.inputSource === leftController ? 0 : 1,
  });
  raycaster.setFromCamera(controllerUV, camera);
  adapter.updateIntersection(raycaster, 'pointerdown', synth);
});
```

---

## ThreeRenderer

`ThreeRenderer` implements the `IRenderer` interface from `@vectojs/core` using Three.js — fills, strokes, and text are rendered as Three.js meshes and lines into an orthographic scene rather than Canvas 2D operations. Use it when Three.js is already in your project and you want the VectoJS scene itself rendered with the WebGL pipeline instead of Canvas 2D.

### When to use

- You want VectoJS's 2D content rendered as Three.js objects through a dedicated `THREE.WebGLRenderer` created for the supplied canvas.
- You need hardware-accelerated gradient fills backed by GLSL shaders.
- You are benchmarking or experimenting with a pure-WebGL 2D pipeline.

For embedding a 2D UI onto a 3D surface, prefer `ThreeAdapter` instead — it does not require you to give up Canvas 2D rendering.

### Constructor

```ts
new ThreeRenderer(canvas: HTMLCanvasElement)
```

Creates:

- `THREE.WebGLRenderer` with `{ canvas, alpha: true, antialias: true }`
- `THREE.OrthographicCamera` with Y pointing down (top = 0, bottom = height) to match VectoJS's coordinate system
- Pixel ratio set to `window.devicePixelRatio` automatically

`ThreeRenderer` creates and owns this WebGLRenderer; it does not accept or reuse an existing renderer/context. `dispose()` removes active objects, releases their geometry/material/texture resources, resets stacks, and disposes the owned WebGLRenderer exactly once.

### Public properties

| Property   | Type                       |
| ---------- | -------------------------- |
| `scene`    | `THREE.Scene`              |
| `camera`   | `THREE.OrthographicCamera` |
| `renderer` | `THREE.WebGLRenderer`      |

### Usage

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

### Implemented IRenderer methods

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

### Linewidth caveat

`THREE.LineBasicMaterial.linewidth` is **silently ignored by WebGL on most platforms** — lines are capped at 1 px regardless of the value passed to `stroke()`. This is a browser/GPU driver limitation, not a VectoJS restriction.

If your design requires thick strokes (> 1 px), consider:

- Using `fill()` with a rectangular path instead of `stroke()` for straight lines.
- Switching to `ThreeAdapter` with the default `CanvasRenderer`, which supports arbitrary line widths via Canvas 2D.
- Integrating `THREE.MeshLine` manually in your application layer — `ThreeRenderer` does not bundle this dependency.

---

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
