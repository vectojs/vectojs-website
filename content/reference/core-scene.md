+++
title = "Scene"
description = "The top-level VectoJS orchestrator: constructor options, the render loop, renderMode/maxFPS and the idle auto-throttle, lifecycle methods, and the pluggable WebGL/WebGPU backend registry."
weight = 2
+++

# `Scene`

Part of [`@vectojs/core`](/reference/core-api/).

```ts
new Scene(canvas: HTMLCanvasElement, options?: SceneOptions)
```

Top-level orchestrator. One `Scene` per `<canvas>`. Add `Entity` objects with
`add()`, then `start()` the loop.

```ts
const scene = new Scene(document.querySelector('canvas')!);
scene.add(new Circle({ radius: 24, fill: '#38bdf8' }).setPosition(100, 100));
scene.start();
```

The Scene appends two transparent sibling `<div>`s into the canvas's
**parent** element (for the a11y shadow layer at `z-index:10` and the DOM-portal
layer at `z-index:9`), and forces the parent to `position:relative` if it is
`static`. In SSR/Node (no `document`) the a11y/portal projection degrades to a
no-op so headless layout / `toSVG()` still work — but register font metrics
first, or every glyph advance is a flat `0.5em` guess. See
[Headless text metrics](/reference/core-text/#headless-text-metrics).

## SceneOptions

| Option                    | Type                          | Default                           | Effect                                                                                                                                                                                                                                                                                                    |
| ------------------------- | ----------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pointBackend`            | `'canvas' \| 'webgl'`         | `'canvas'`                        | Backend for representable `getBatchCircle()`/`getBatchRect()` leaves. `'webgl'` stacks a WebGL2 canvas (`z-index:5`) and batches those primitives; unavailable WebGL2 falls back to Canvas. The GL layer composites above 2D content, so cross-layer painter order does not interleave.                   |
| `particleBackend`         | `'auto' \| 'webgpu' \| 'cpu'` | `'auto'`                          | [`ComputeParticleEntity`](/reference/core-particles/) backend. `'auto'` tries WebGPU and warns before falling back to CPU. `'webgpu'` explicitly requests WebGPU but currently logs an error and still falls back if initialization fails. `'cpu'` forces the CPU sim (sets `webgpuDisabled`).            |
| `maxFPS`                  | `number`                      | `60`                              | Frame-rate cap. `0` = uncapped (native refresh). Continuous animations still run, just less often. (Internally `0` under `NODE_ENV=test`/`VITEST`.) Also settable live via `scene.maxFPS`.                                                                                                                |
| `respectReducedMotion`    | `boolean`                     | `true`                            | When the OS requests `prefers-reduced-motion`, cap to `REDUCED_MOTION_FPS` (30) — or the lower of that and `maxFPS`. `false` ignores the OS setting.                                                                                                                                                      |
| `readingDirection`        | `'ltr' \| 'rtl'`              | `'ltr'`                           | Reading direction for the a11y/automation shadow tree, so keyboard **tab order** and screen-reader traversal follow the _visual_ reading order rather than scene-graph insertion order. `'rtl'` reverses the inline order within each row. Live via `scene.readingDirection`.                             |
| `a11ySyncInterval`        | `number`                      | `0`                               | Throttle the a11y shadow-DOM sync to at most once per N ms. `0` = sync every rendered frame. A small value (e.g. `100`) keeps the a11y layer eventually consistent during heavy animation while sparing per-frame DOM writes. Also live via `scene.a11ySyncInterval`.                                     |
| `debugA11y`               | `boolean`                     | `false`                           | Render shadow nodes with a blue dashed outline (dev aid) instead of `opacity:0`. They stay clickable by automation either way.                                                                                                                                                                            |
| `contentProjection`       | `boolean`                     | `true`                            | Project text-bearing entities into the a11y mirror at all, so native find-in-page, selection and copy work. `false` disables the whole content tier (the canvas still paints).                                                                                                                            |
| `contentProjectionMargin` | `number`                      | one viewport height               | How far beyond the viewport an entity's **per-line carriers** are materialized — the _interaction_ tier. `Infinity` is unsupported: it unwindows every carrier, which is O(total document glyphs). See "Two projection margins" below.                                                                    |
| `contentSemanticMargin`   | `number`                      | same as `contentProjectionMargin` | Since `1.31.0`. How far beyond the viewport an entity keeps **any** projected DOM — the _semantic_ tier. `Infinity` keeps the whole document's text findable while carriers stay windowed. See "Two projection margins" below.                                                                            |
| `contentSemanticBudget`   | `number`                      | `undefined`                       | Since `1.31.0`. When the semantic tier (`contentSemanticMargin` wider than `contentProjectionMargin`) is used, spreads the resident materialization across N syncs instead of one burst — pace long documents' first materialization without blocking a frame. No effect without an opt-in resident tier. |
| `autoThrottle`            | `boolean`                     | `true`                            | Automatic throttling to 2 fps when the scene is static (no pending transitions, not dirty). `false` keeps rendering at `maxFPS` — for scenes that mutate state outside the dirty/transition signals. Also settable live via `scene.autoThrottle`. See "Idle auto-throttle" below.                         |
| `userTiming`              | `boolean`                     | `false`                           | Emit User Timing marks/measures (`performance.mark`) around render phases for profiler captures. Leave off normally; also settable live via `scene.setUserTiming()`.                                                                                                                                      |
| `renderer`                | `IRenderer`                   | `CanvasRenderer`                  | Custom renderer (e.g. `ThreeRenderer` from [`@vectojs/three`](/reference/three-renderer/)).                                                                                                                                                                                                               |
| `disableWindowResize`     | `boolean`                     | `false`                           | Skip the auto `window` resize listener. Use inside a custom layout container / offscreen canvas, then drive size with `resize(w, h)`.                                                                                                                                                                     |
| `maxDPR`                  | `number`                      | `undefined`                       | Cap the device pixel ratio used to size the Canvas2D and `pointBackend: 'webgl'` backing stores. `undefined` reads the real, uncapped `devicePixelRatio`. Re-applied on every `resize()` call, not just at construction. See "Capping render DPR" below.                                                  |
| `renderMode`              | `'always' \| 'onDemand'`      | `'always'`                        | Since `1.27.0` (`1.26.0` shipped the option; see below). Also settable live via `scene.renderMode`, which stays writable. Applying it as an option, not a post-construction assignment, means an `onDemand` scene skips the initial always-on frames too.                                                 |

> [!NOTE]
> Before `@vectojs/core@1.26.0`, `renderMode` was a **field only** — passing it
> as a constructor option compiled, read correctly, and was silently ignored,
> leaving the scene on `'always'` and its 2 fps idle throttle. If you still see
> that shape in older code or forked examples, `scene.renderMode = 'onDemand'`
> after construction works on every version; the option form only needs
> `1.26.0+`.
>
> `SceneOptions` is a structural type, so **any** misspelled or unrecognized key
> — not just this one — silently does nothing, and TypeScript only catches it
> when the object literal is written inline at the call site. In dev mode
> (`Scene.devMode = true`, `globalThis.__DEV__`, or `NODE_ENV=development`) the
> constructor now warns per unknown key and suggests the closest real one. The
> recognized set is exported as `SCENE_OPTION_KEYS`. Dev-only; production pays
> nothing.

### Capping render DPR (`maxDPR`)

Backing-store render cost scales with `logical size × dpr²`, not linearly —
a full-screen scene that's smooth at DPR 1 (most dev laptops) can overrun its
16ms frame budget on a DPR-3 display, invisible until someone actually tests
on one. This bites `pointBackend: 'webgl'` hardest, since it renders a
separate stacked canvas whose fragment/overdraw cost is exactly this DPR²
curve — a full-screen 1200-particle field measured **116ms** max-frame at
DPR 3 versus flawless 60fps at DPR 1.

```ts
const scene = new Scene(canvas, { pointBackend: 'webgl', maxDPR: 2 });
```

`maxDPR: 2` keeps the display retina-crisp (2× already exceeds what most
eyes resolve at normal viewing distance) while capping the backing-store
pixel count — roughly halving it at DPR 3, since `2² / 3² ≈ 0.44×` the
pixels. Before this option existed, the only workaround was monkey-patching
`window.devicePixelRatio` before constructing the Scene; prefer `maxDPR`
now — it's re-applied correctly on every resize, which a one-time
`Object.defineProperty` patch is not.

### Two projection margins

Content projection has two independent tiers, and since `1.31.0` each has its own
margin:

- **semantic** (`contentSemanticMargin`) — does this block have _any_ DOM? A block
  with DOM contributes its text to native find-in-page, copy and screen-reader
  read-ahead.
- **interaction** (`contentProjectionMargin`) — are that block's _per-line
  carriers_ built? Carriers are what give the browser per-line geometry for
  selection.

Before the split one scalar armed both, so only two configurations existed: a
finite margin freed off-screen blocks entirely, making off-screen text
unfindable, while `Infinity` also materialized every carrier in the document.

Setting them apart gives the useful middle ground:

```ts
const scene = new Scene(canvas, {
  // Every block keeps its text, so find-in-page sees the whole document.
  contentSemanticMargin: Infinity,
  // Carriers stay bounded by the viewport, so cost scales with what is visible.
  contentProjectionMargin: scene.height,
});
```

> [!IMPORTANT]
> `Infinity` is safe for `contentSemanticMargin` and **not** for
> `contentProjectionMargin`. The cost that makes it unsupported comes from an
> unwindowed carrier band, not from resident text.

A block outside the interaction margin but inside the semantic margin projects
its full text as a single node with **no** carrier children. It is findable and
copyable; only per-line selection geometry is absent, and that is unreachable
without scrolling it into view anyway.

The one-time cost is worth knowing: a resident tier materializes one element per
block on the first sync, measured at roughly 13 µs per node created — about 47 ms
at 1000 blocks. Steady state is cheap, because an entity that stamps its own
content lets Scene skip re-projecting an unchanged block entirely. So this is a
document-open cost, not a per-frame one.

## Public fields

```ts
scene.canvas: HTMLCanvasElement
scene.width: number
scene.height: number
scene.overlayRoot: Entity          // children drawn above the main tree, bypassing clip bounds
scene.renderMode: 'always' | 'onDemand'   // also a ctor option since 1.26.0
scene.maxFPS: number               // default 60
scene.respectReducedMotion: boolean
scene.a11ySyncInterval: number
scene.particleBackend: 'auto' | 'webgpu' | 'cpu'
scene.webgpuDisabled: boolean      // getter true when _disabled OR particleBackend === 'cpu'
scene.a11yNeedsReorder: boolean
scene.readingDirection: 'ltr' | 'rtl'   // tab/traversal order; setting it re-flows
scene.forcedColors: boolean             // getter — OS is in a forced-colors mode
scene.autoThrottle: boolean             // 2fps idle throttle toggle (default true)
scene.userTiming: boolean               // read back the userTiming option
scene.currentFrame: number              // monotonically increasing frame counter
scene.rootEntity: Entity                // getter — the main tree root (children drawn below overlay)
scene.overlayRootEntity: Entity         // getter — the overlay root (modal/highlight tier)
scene.webglDrawStats: WebGLDrawStats | null // getter — WebGL draw counters when pointBackend='webgl' (null otherwise)
scene.webgpuActive: boolean             // getter — the WebGPU particle path is active
```

## renderMode, maxFPS, and the idle auto-throttle

- **`renderMode: 'always'` (default)** — re-render every frame, capped by the
  effective FPS.
- **`renderMode: 'onDemand'`** — only draw when the scene is _dirty_ (see
  `markDirty()`) or an animation/transition driver is pending. Static rAF ticks
  still inspect the tree for pending motion, but skip entity update/render and
  GPU submission. Ideal for static / event-driven UIs.

**Idle auto-throttle (the key gotcha).** A scene is considered **static** when it
is not dirty AND no node in the main/overlay tree has a pending `animate()`
tween. In `'always'` mode with `maxFPS > 0`, a static scene is throttled to
**~2 fps** to save battery/GPU. Set `autoThrottle: false` (option or live
`scene.autoThrottle`) to disable the throttle entirely. The `dirty` flag is
reset to `false` at the end of every rendered frame (post-render), so:

> If you hand-animate by mutating `entity.x` etc. inside a custom `update()`,
> calling `markDirty()` **inside** `update()` does not help — the post-render
> reset wipes it, and the next frame's static check sees `dirty === false` and
> throttles you to 2 fps. Either drive motion through [`entity.animate()`](/reference/core-entity/#animation)
> (which keeps the scene non-static while the tween runs), or call `scene.markDirty()`
> **between** frames (from an event handler, a separate `rAF`, or a timer) so the
> flag survives into the next loop iteration.

`effectiveMaxFPS` = `maxFPS`, further lowered to 30 (`REDUCED_MOTION_FPS`) when
the OS requests reduced motion and `respectReducedMotion` is on. `0` means
uncapped.

### Off-screen pause and the dt clamp

Two loop behaviors that are easy to miss:

- **Off-screen scenes stop rendering.** An `IntersectionObserver` on the canvas
  pauses the rAF loop when the canvas scrolls fully out of view (a dashboard tab,
  a chart below the fold) and resumes on re-entry — instead of running the full
  update/render for a scene nobody can see. Where `IntersectionObserver` is
  unavailable (SSR/jsdom) the scene is treated as always on-screen, so behavior is
  unchanged there.
- **`dt` is clamped to 100ms** (`MAX_FRAME_DT`). After a backgrounded tab, a
  breakpoint, or a long GC pause the real elapsed time can be seconds; feeding
  that raw into physics/tween integration makes everything teleport. If you
  integrate `dt` yourself in `update(dt)`, note it will never exceed 100ms.

## Accessibility & appearance

| Member                 | Type               | Notes                                                                                                                                                                                    |
| ---------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readingDirection`     | `'ltr' \| 'rtl'`   | Orders the a11y shadow tree so **tab order** matches the visual reading order (rows top-to-bottom, then inline). Setting it trips a reorder on the next sync. Also a constructor option. |
| `forcedColors`         | `boolean` (getter) | `true` when the OS is in a forced-colors mode (Windows High Contrast). Backed by `(forced-colors: active)`; the scene **repaints automatically** when it toggles.                        |
| `prefersReducedMotion` | `boolean` (getter) | `true` when the OS asks for reduced motion and `respectReducedMotion` is on. Read by the animation drivers, which snap non-opacity properties instead of tweening them.                  |

A `<canvas>` is opaque pixels, so the browser's forced-colors remapping never
touches what you draw. Components must react themselves:

```ts
render(r: IRenderer) {
  const forced = this.scene?.forcedColors ?? false;
  r.fill(forced ? 'ButtonFace' : this.bg);
  r.fillText(this.label, x, y, this.font, forced ? 'ButtonText' : this.color);
}
```

See [a11yRoot & the agent contract](/reference/core-a11y/#forced-colors-high-contrast).

## Lifecycle methods

```ts
scene.add(entity: Entity): this              // attach to the scene root
scene.remove(entity: Entity): this           // detach + recursively tear down its a11y shadow nodes
scene.start(): void                          // begin the rAF loop; idempotent; warns once if width/height is 0
scene.stop(): void                           // halt after the current frame; start() resumes
scene.destroy(): void                        // idempotently destroy owned entity subtrees/resources, loop, listeners, DOM layers, GPU managers, and renderer
scene.markDirty(): void                      // request a redraw next frame (meaningful in onDemand + escapes idle throttle)
scene.resize(width: number, height: number): void   // set viewport; resizes renderer + GL layer; marks dirty
scene.showOverlay(overlay: Entity): void     // add to overlayRoot (drawn on top, no clip)
scene.hideOverlay(overlay: Entity): void
scene.detachA11y(entity: Entity): void       // remove shadow nodes for a subtree WITHOUT removing it from the tree
```

> **`resize(w, h)` must run before particle sims.** Width/height come from
> `window.innerWidth/innerHeight` unless `disableWindowResize` is set, in which
> case they fall back to `canvas.width || canvas.clientWidth || 0`. A `0×0`
> viewport means particles simulate in a zero box and may not render.
> `start()` logs a one-time warning when width or height is 0.
>
> `resize()` is also the text-projection metric boundary. Call it after a
> custom container or application CSS zoom changes even when the logical width
> and height are unchanged; Core 1.8 then rebuilds the cold calibration key and
> waits for the new Firefox/Chromium Range geometry before marking prepared
> grids ready.
>
> **`syncA11y` only creates/updates, never prunes** within a frame. If a
> component swaps out interactive _child_ entities each frame, call
> `detachA11y(child)` before discarding them or their `<a>`/control shadow nodes
> leak. (`remove()` already prunes recursively.)

## Other Scene methods

```ts
scene.getRenderer(): IRenderer
scene.getRoot(): Entity
scene.clientToScene(clientX: number, clientY: number): Point // viewport → logical Scene coordinates
scene.render(renderer: IRenderer, dt = 0, time = 0): void   // main renderer advances state; secondary renderers draw a read-only snapshot
scene.step(dt: number): void              // advance exactly one frame deterministically (tests, video export, headless drivers)
scene.toSVG(): string                        // read-only current-state snapshot through SVGRenderer → flat SVG XML
scene.findEntityAt(x, y): Entity | null      // topmost entity whose isPointInside() returns true (depth-first, front-to-back; no interactive filter)
scene.getA11yElement(entityId: string): HTMLElement | undefined
scene.getA11yTree(): A11yTreeNode[]          // nested snapshot of the projected shadow nodes (id/tag/role/label/value/...)
scene.markStructureChanged(): void           // notify the a11y/content layers that the scene tree changed shape (reconcile ids)
scene.setUserTiming(enabled: boolean): void  // toggle User Timing marks at runtime
```

`scene.step(dt)` is the deterministic single-frame driver: it advances
animation/physics exactly `dt` ms with no wall clock. Unit tests, the
[`@vectojs/video-exporter`](/reference/video-exporter/) pipeline, and any
headless harness drive scenes with it; `renderMode: 'onDemand'` scenes only
draw when `step` finds pending motion.

## User Timing instrumentation

The Scene can emit [`User Timing`](https://developer.mozilla.org/en-US/docs/Web/API/User_Timing_API)
marks/measures around render phases, so a profiler capture shows exactly where
a frame spends its time. Off by default; enable with the `userTiming` option or
live via `scene.setUserTiming(true)`:

```ts
const scene = new Scene(canvas, { userTiming: true });
// or
scene.setUserTiming(true); // runtime toggle
scene.userTiming; // read the current state
```

The stable measure names are exported as `VECTO_USER_TIMING`:

```ts
VECTO_USER_TIMING.scene; // { transform, drawWalk, entityPaint, flush, a11ySync }
VECTO_USER_TIMING.markdown; // { parse }
// e.g. 'vecto:scene:transform', 'vecto:markdown:parse'
```

`@vectojs/core` also exports the low-level helpers the engine uses internally
(and that a custom renderer or instrumented component can use to add its own
phases):

```ts
beginVectoUserTiming(name: string): VectoUserTimingSpan | null
endVectoUserTiming(span: VectoUserTimingSpan | null): void
measureVectoUserTiming(name: string, durationMs: number): void
```

`beginVectoUserTiming` returns `null` (and `measureVectoUserTiming` no-ops)
when the host does not implement marks/measures, so optional profiling is never
a runtime requirement. Spans use uniquely named start/end marks that are
released on `endVectoUserTiming`. `measureVectoUserTiming` emits one measure
anchored at the current time for a duration accumulated from disjoint calls —
the path that reports per-frame entity-paint totals without instrumenting every
entity.

### WASM accelerator backends

The four compute hot spots can run in WebAssembly. Each has a synchronous
install/clear (`set*Backend`) and an async hot-swap (`enableWasm*`) that
instantiates the module and falls back to JS on failure — **failure is the
default state, never an error path**. The `enable*` forms accept a URL string,
`URL`, a `Response`, or raw bytes.

```ts
await scene.enableWasmTransforms(new URL('./vectojs_core.wasm', import.meta.url)); // transforms (render walk)
await scene.enableWasmHitTest(source);    // hit-testing
await scene.enableWasmAnimBatching(source); // animation driver batching
await scene.enableWasmParticles(source);  // CPU particle simulation fallback
scene.setTransformBackend(backend | null); scene.setHitTestBackend(...);
scene.setAnimBackend(...); scene.setParticleBackend(...);  // synchronous swap/clear
scene.wasmRuntime: CoreWasmRuntime | null  // getter — loaded runtime, or null
scene.particleSimBackend: 'js' | 'wasm'    // getter — which backend runs the CPU particle sim
```

Whether a backend actually **ran** this frame is a separate question from
whether it is installed — `@vectojs/devtools` `inspectAccelerators()` reports
`activeThisFrame` per backend, including the `'below-gate'` verdict when JS is
genuinely faster. The wasm module is built by `just wasm` in the monorepo and
shipped from `crates/vectojs-core-rs/` (`.wasm` never committed; built in CI,
published to npm).

## Frame telemetry (`frameStats`, 1.13.0)

```ts
scene.frameStats: FrameStats; // live render-loop telemetry (read-only)

interface FrameStats {
  fps: number; // rendered-frame cadence, clamped to maxFPS; 0 before the first pair of frames
  frameTimeMs: number; // wall-clock of the last render() pass (excludes a11y/content sync)
  frameIntervalMs: number; // smoothed interval between rendered frames (EMA)
  dt: number; // dt handed to the last rendered frame
  renderedFrames: number; // total frames rendered since start()
  skippedFrames: number; // total rAF ticks skipped (idle/onDemand/capped) since start()
  renderMode: 'always' | 'onDemand';
  dirty: boolean; // whether a redraw is currently pending
}
```

`fps` is derived from the interval between _actually-rendered_ frames, so idle
`onDemand` scenes and frames dropped by the `maxFPS` cap or the static
auto-throttle don't deflate it — it reports the cadence of real redraws, not the
raw rAF rate. Timings are measured on the `requestAnimationFrame` loop; a scene
driven only by `step()` (deterministic export) leaves them zeroed. The renderer
always repaints the full canvas, so there is no partial dirty-rectangle to
expose — `dirty` is the boolean redraw-pending flag. Powers the
[`@vectojs/devtools`](/reference/devtools/) performance HUD.

## Pluggable backend registry (static)

```ts
Scene.registerWebGLPointRendererCreator(creator: WebGLPointRendererCreator): void
Scene.registerWebGPUParticleSystemManager(managerClass: any): void
```

Called automatically by the `.` entry. The relevant interfaces
(`IWebGLPointRenderer`, `IWebGPUParticleSystemManager`,
`WebGLPointRendererCreator`) are exported for custom backends. WebGPU device loss
is auto-recovered with exponential backoff (3 retries) before permanently
disabling WebGPU.

## Related

[`Entity`](/reference/core-entity/) (the tree Scene owns) ·
[`IRenderer` / `CanvasRenderer`](/reference/core-renderer/) ·
[`ComputeParticleEntity`](/reference/core-particles/) ·
[a11yRoot & the agent contract](/reference/core-a11y/) ·
[`@vectojs/core` overview](/reference/core-api/)
