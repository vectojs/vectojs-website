+++
title = "ThreeAdapter"
description = "Render a VectoJS Scene onto a canvas, expose it as a THREE.CanvasTexture, and wire pointer events (including WebXR controllers and multi-touch) via UV raycasting."
weight = 42

[extra]
order = 42
+++

# `ThreeAdapter`

Part of [`@vectojs/three`](/reference/three/).

`ThreeAdapter` uses the supplied `canvas`, or creates one when omitted. It renders a VectoJS `Scene` onto that canvas, wraps the result as a `THREE.CanvasTexture`, and gives you a ready-to-use `THREE.Mesh` (a unit `PlaneGeometry` with a `MeshBasicMaterial`). Pointer and scroll events from your Three.js event listeners are translated back into VectoJS logical coordinates via raycasting.

Use this when you have a 3D scene and want a 2D UI panel floating on a surface — the rest of your Three.js scene is untouched, and you keep Canvas 2D rendering. For using Three.js as the rendering backend of the `Scene` itself, see [`ThreeRenderer`](/reference/three-renderer/) instead.

## Constructor

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

## Public properties

| Property     | Type                  | Description                                                                                                       |
| ------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `texture`    | `THREE.CanvasTexture` | The texture wrapping the VectoJS canvas. Set `needsUpdate = true` automatically after every VectoJS render frame. |
| `vectoScene` | `VectoScene`          | The active VectoJS `Scene` instance. Add entities to this.                                                        |
| `canvas`     | `HTMLCanvasElement`   | The adapter-owned or caller-provided canvas onto which VectoJS draws.                                             |
| `mesh`       | `THREE.Mesh`          | Pre-built `PlaneGeometry(1, 1)` + `MeshBasicMaterial` mesh ready to drop into your Three.js scene.                |

## Methods

### `updateIntersection(raycaster, type, originalEvent?)`

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

### `resize(width, height)`

```ts
resize(width: number, height: number): void
```

Resize the canvas and the underlying logical `VectoScene`. Call when the panel's render resolution or 2D layout viewport changes; changing only the mesh's world-space scale does not require this.

### `dispose()`

```ts
dispose(): void
```

Idempotently disposes the `THREE.CanvasTexture`, geometry, and material on the mesh, detaches the mesh, restores the Scene render method, destroys the `VectoScene`, and clears all per-pointer state. An adapter-created canvas is released to `0×0`; a caller-provided canvas keeps its dimensions.

## Complete example

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

## How the adapter works internally

The constructor monkey-patches `vectoScene.render` to set `texture.needsUpdate = true` after each VectoJS frame. Three.js then uploads the canvas to the GPU on the next `renderer.render()` call. No polling or manual sync is required.

Raycast UV coordinates are mapped into the scene's **logical** coordinate space (`vectoScene.width`/`height` — the dimensions you passed to the constructor), not the adapter canvas's physical backing-store size. The distinction matters on HiDPI displays: `@vectojs/core`'s `CanvasRenderer` scales the backing store by `devicePixelRatio` for crisp rendering (`canvas.width = logicalWidth × dpr`), while entity layout and hit-testing stay logical.

> [!WARNING] > **On `@vectojs/three` ≤ 0.1.1, UV mapping used the physical canvas size** — so on any display or browser-zoom level where `devicePixelRatio ≠ 1`, every pointer event landed below/right of the cursor by exactly the DPR factor. The symptom is distinctive: clicks activate a control _further down the panel_ than the one under the cursor, with the offset growing the deeper into the panel the target sits — while behaving perfectly on DPR-1 displays and in headless test environments. Fixed in **0.1.2**; upgrade rather than working around it.

Hit events dispatched by `updateIntersection` are forwarded to the entity's accessibility DOM element when one exists **and is connected to a live document** (which routes them through the a11y shadow layer and fires `click`/`change` on interactive components), or directly as `VectoJSEvent` objects otherwise.

> [!NOTE]
> With the default adapter-created canvas, panels take the direct `VectoJSEvent` path because the canvas and its a11y root are detached. If you provide a canvas that is connected to `document`, its connected a11y elements can use the DOM-dispatch path. Versions 0.1.1 and newer of `@vectojs/three` check connectivity instead of assuming either case.
>
> **This matters for `Toggle`/`Button` correctness, not just for avoiding a thrown error.** In version 0.1.0 of `@vectojs/three`, a disconnected a11y element could incorrectly take the DOM-dispatch branch and silently miss the component callback. Versions 0.1.1 and newer route disconnected elements directly. Native DOM focus/IME/screen-reader behavior is unavailable for the default detached canvas, but remains possible when a caller-provided canvas and its projection layer are connected.

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

## Related

[`ThreeRenderer`](/reference/three-renderer/) (the alternate use case — Three.js as the `Scene`'s rendering backend) ·
[`Scene`](/reference/core-scene/) (`vectoScene`) ·
[`@vectojs/three` overview](/reference/three/)
