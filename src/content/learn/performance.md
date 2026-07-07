---
title: 'Performance'
description: 'Render modes, the idle auto-throttle, WebGL batch rendering, viewport culling, text performance, and how to measure real GPU throughput.'
order: 7
---

# Performance

VectoJS is designed to be fast by default, but several opt-in mechanisms unlock significantly higher throughput. This page explains the knobs available, the hidden pitfall that catches most developers, and how to measure performance accurately.

## Render modes

The `Scene` supports two render modes, set via `scene.renderMode` after construction:

```typescript
scene.renderMode = 'always'; // default — rerender every frame
scene.renderMode = 'onDemand'; // rerender only when dirty or tweening
```

### `'always'` mode

The rAF loop fires every frame, capped by `maxFPS` (default 60). Use this for:

- Continuous animation (particle sims, physics)
- Real-time data feeds
- Any scene where something is always moving

### `'onDemand'` mode

The rAF loop only renders when `scene.markDirty()` has been called since the last frame, or when an animation/transition driver is in progress. Idle ticks skip entity update/render and GPU submission, but the Scene still schedules rAF and walks the tree to check pending animation state. Use this for:

- Static or event-driven UIs (dashboards, forms, menus)
- Scenes that animate in response to user actions but are otherwise still

```typescript
scene.renderMode = 'onDemand';

button.on('click', () => {
  button.animate({ scaleX: 1.1, scaleY: 1.1 }, 100).animate({ scaleX: 1, scaleY: 1 }, 100);
  // animate() marks dirty automatically while the tween runs
});

input.on('change', () => {
  scene.markDirty(); // repaint to show new caret/selection state
});
```

## The idle auto-throttle (the hidden pitfall)

This is the most common performance trap in VectoJS.

In `'always'` mode, a scene is considered **static** when:

- The `dirty` flag is `false`, AND
- No entity has a pending `animate()` tween.

A static scene is throttled to **~2 fps** to save battery and GPU. Since core **0.2.6** the `dirty` flag is consumed at the _start_ of each rendered frame, so a `markDirty()` issued from inside `update()` survives into the next frame's static check.

```typescript
// Works on core 0.2.6+: markDirty() inside update() re-arms the next frame
class Spinner extends Entity {
  update(dt: number, time: number) {
    super.update(dt, time);
    this.rotation += dt * 0.003;
    this.scene?.markDirty();
  }
}
```

**The trap on core ≤ 0.2.5:** the flag was cleared _post-render_, so a `markDirty()` set during `update()` was wiped before the next static check — the pattern above rendered one frame and froze at 2 fps. If you support older cores, use one of the fixes below (they remain the more efficient choices on 0.2.6 too, since `hasPendingAnimations()` states intent without a per-frame flag write).

**Fix — option A:** Use `animate()` for the motion instead of manual mutations. A running tween keeps the scene alive automatically:

```typescript
// Correct: animate() keeps hasPendingAnimations() true
entity.animate({ rotation: Math.PI * 2 }, 1000);
```

**Fix — option A2 (for `update()`-driven motion):** keep the integrator, but tell the Scene about it by overriding `hasPendingAnimations()`. This is how the built-in scroll containers report their in-flight motion:

```typescript
class Spinner extends Entity {
  update(dt: number, time: number) {
    super.update(dt, time);
    this.rotation += dt * 0.003;
  }
  hasPendingAnimations() {
    return true; // or: super.hasPendingAnimations() || stillMoving
  }
}
```

**Fix — option B:** Call `markDirty()` **between frames** — from an event handler, a `setInterval`, or a separate `requestAnimationFrame` that fires after the scene's own rAF:

```typescript
// Correct: call markDirty between frames (not inside update)
setInterval(() => scene.markDirty(), 16); // external driver
```

**Fix — option C:** Switch to `renderMode: 'always'` and set `maxFPS` to prevent the static throttle (the idle throttle only applies when `maxFPS > 0`; setting `maxFPS = 0` uncaps and always rerenders):

```typescript
scene.maxFPS = 0; // uncapped — never throttles to 2 fps
```

## `maxFPS` and reduced motion

```typescript
const scene = new Scene(canvas, {
  maxFPS: 60, // frame rate cap; 0 = uncapped
  respectReducedMotion: true, // default: true
});
```

When `respectReducedMotion: true` (default) and the user has enabled "reduce motion" in their OS accessibility settings, the effective FPS is capped at **30** (or the lower of `maxFPS` and 30). You can disable this with `respectReducedMotion: false`, but doing so ignores an explicit user preference.

`maxFPS` is also settable live: `scene.maxFPS = 30` for battery-saving mode.

## WebGL batch rendering

For large sets of circles or rectangles, the WebGL layer replaces many per-entity Canvas path calls with typed-buffer uploads and a small number of draw submissions. The crossover and speedup are workload/hardware dependent and should be benchmarked.

### Enabling the batch layer

```typescript
const scene = new Scene(canvas, {
  pointBackend: 'webgl', // stacks a WebGL2 canvas over Canvas2D
});
```

### Opting an entity in

Override `getBatchCircle()` or `getBatchRect()` instead of `render()`:

```typescript
class Dot extends Entity {
  radius = 4;
  color = '#00f0ff';

  // These are read every frame — animated values work.
  getBatchCircle() {
    return { radius: this.radius, color: this.color };
  }

  // Required fallback for Canvas mode or an unrepresentable world transform.
  isPointInside() {
    return false;
  }
  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.arc(0, 0, this.radius, 0, Math.PI * 2);
    renderer.fill(this.color);
  }
}
```

The Scene reads `getBatchCircle()` / `getBatchRect()` every frame and feeds representable world-space primitives to the WebGL layer. Colors and alpha are per-instance attributes, so a buffer can contain mixed styles.

**Constraints:**

- The entity must be a **leaf** (no children).
- The entity's own scale must be **uniform** (`scaleX === scaleY`).
- Requires `pointBackend: 'webgl'` on the Scene.
- The accumulated transform must be representable by one scale + rotation. Non-uniform/sheared ancestors fall back to `render()`.

The WebGL layer composites **above** the Canvas2D content (`z-index: 5`), so batch primitives always draw on top of 2D content, regardless of tree order.

### `getBatchRect()` for rectangles

```typescript
getBatchRect() {
  return { width: this.width, height: this.height, color: this.color };
}
```

Batch rects support representable per-entity rotation. Reflections, shear, and non-uniform accumulated scale use the normal renderer fallback.

## Viewport culling with `getBounds()`

By default, every entity runs `update()` and `render()` on a rendered frame, even if it is completely off-screen. Override `getBounds()` to return a local-space bounding box and the Scene will skip the offscreen entity's `render()` call. Tree traversal and `update()` still run:

```typescript
getBounds() {
  return { x: 0, y: 0, width: this.width, height: this.height };
}
```

`UIComponent` already implements this — all `@vectojs/ui` components participate in culling automatically. For raw `Entity` subclasses with a fixed size, add `getBounds()` for free performance on large scenes.

For example, if 90% of 5,000 bounded leaf entities are offscreen, only about 500 `render()` calls remain, but the Scene still visits and updates all 5,000 nodes.

## A11y sync throttling

On every rendered frame, the `Scene` syncs all interactive entities' positions and states to their shadow DOM nodes. With hundreds of interactive entities animating simultaneously, this DOM write overhead can dominate frame time.

Throttle with `a11ySyncInterval`:

```typescript
const scene = new Scene(canvas, {
  a11ySyncInterval: 100, // sync at most once per 100 ms
});
// Or set live:
scene.a11ySyncInterval = 100;
```

The interval is checked while animations run; `a11ySyncInterval: 100` limits synchronization to at most about 10 times per second and schedules a final catch-up after motion settles. Choose the interval from accessibility latency and measured DOM cost rather than assuming one value fits every UI.

## Text performance

### `setMaxWidth()` — the hot path for reflow

The `LayoutEngine` separates measurement (cold) from layout (hot). When the window resizes and text needs to reflow:

```typescript
// Wrong: rebuilds the full measured text on every resize event
window.addEventListener('resize', () => {
  label.setText(label.text); // cold pass — re-segments and re-measures
});

// Correct: reuses cached measurements, only recalculates line breaks
window.addEventListener('resize', () => {
  label.setMaxWidth(newWidth); // hot pass — cheap
});
```

The hot path is O(word count), not O(glyph count), and avoids all `Intl.Segmenter` and canvas `measureText` calls.

### `LayoutResultBuffer` — reusable text coordinate storage

For data-dense UIs (data grids, terminals, log viewers) with thousands of glyphs per frame, the standard `layoutPrepared()` path allocates a `LayoutNode` object per glyph. Use `LayoutResultBuffer` instead:

```typescript
import { LayoutEngine, LayoutResultBuffer, createCanvasMeasurer } from '@vectojs/core/layout';

const engine = new LayoutEngine(400, Infinity, createCanvasMeasurer());
const buffer = new LayoutResultBuffer(); // reuse across frames (CAPACITY = 16384)

function renderRow(text: string) {
  const prepared = engine.prepare(text, {}, 14);
  buffer.reset();
  engine.layoutPreparedIntoBuffer(prepared, buffer);
  // buffer.xs, buffer.ys, buffer.ws, buffer.hs, buffer.chars — flat typed arrays
  for (let i = 0; i < buffer.count; i++) {
    renderer.fillText(buffer.chars[i], buffer.xs[i], buffer.ys[i], '14px monospace', '#e2e8f0');
  }
}
```

The reusable buffer avoids allocating one `LayoutNode` object per glyph on each hot layout. Constraints: fixed capacity, single-column only (no BiDi visual reordering, no exclusion rects). Use `layoutPrepared()` when you need those features; avoid `toLayoutResult()` on the hot path because it allocates node objects.

## CPU Calculation vs. Rendering Bottlenecks

In a traditional browser DOM framework, performance bottlenecks almost always lie in the browser’s **rendering and reflow layout pipeline** (DOM manipulations, style recalculation, and painting). However, because VectoJS bypasses the DOM entirely and processes layout, culling, and interactions mathematically in memory, the performance bottleneck shifts from the GPU/rendering layer directly to **JavaScript single-threaded CPU computation**.

At sufficiently high active-node counts, CPU-side traversal, updates, layout, and hit testing can exceed the $16.67\text{ ms}$ frame budget before rasterization does. The crossover depends on the workload and device.

VectoJS addresses these computation bottlenecks from first principles by providing dedicated **"Escape Hatches"** to bypass CPU single-thread limitations.

---

### 1. High-Density Particle Simulations (Per-Particle, Not N-Body)

**The Bottleneck**: Per-particle JavaScript integration is $O(N)$ each frame and eventually consumes the main-thread frame budget. The count where that happens is device- and model-dependent.

**The Escape Hatch: WebGPU Compute Shaders (`ComputeParticleEntity`)**
To bypass CPU execution entirely, VectoJS provides `ComputeParticleEntity`. Under the hood:

- The physics equations (Euler integration, spring tension, and field attraction forces) are compiled into **WGSL (WebGPU Shading Language) Compute Shaders**.
- At runtime, the data remains resident on GPU VRAM, allowing the WebGPU compute pass to parallelize the simulation across thousands of GPU cores.
- The renderer falls back to an equivalent CPU loop (`updateCPU()`) automatically when WebGPU is unavailable or the device is lost.

> [!IMPORTANT] > **This is not $N$-body simulation.** Each particle's force is computed relative to three _fixed_ points only — its spring origin, the mouse cursor, and an optional explosion center. There is no particle-vs-particle interaction and no spatial index involved, which is exactly what makes it embarrassingly parallel and GPU-friendly. If your simulation needs real neighbor interaction (particle-vs-particle collision or repulsion, flocking, N-body gravity), `ComputeParticleEntity` doesn't cover it — you'll need to write your own WGSL compute pass with a neighbor query baked in, or run `SpatialHashGrid`-based neighbor queries on the CPU (see [`SpatialHashGrid`](#3-sea-of-entities-interaction-on2-complexity-catastrophe) below, and the [Physics Engine guide](/learn/physics-engine/) for a worked CPU example). There is currently no generic "run arbitrary computation on GPU with CPU fallback" abstraction in the engine — `ComputeParticleEntity` is a specific, narrow implementation, not a reusable pattern.

High-end throughput depends heavily on GPU, browser, DPR, particle model, and composition. This repository has no checked-in high-end WebGPU result, so measure your own scene with the **Export report** button (see [Measuring real performance](#measuring-real-performance) below).

---

### 2. High-Density Text Measuring and Typographical Reflow

**The Bottleneck**: Dynamic text layout is one of the most expensive CPU tasks in frontend engineering. It requires dictionary-based word tokenization (`Intl.Segmenter`), BiDi sorting, and browser-level font width measurements (calling the canvas `measureText` API). Attempting to calculate text layouts for tens of thousands of glyphs in a single frame (such as in financial terminals, active log streams, or data grids) will freeze the JS main thread on the "Cold Pass" measurement pipeline.

**The Escape Hatch: Off-Thread Layout, Split Layouts & Reused Memory**
VectoJS provides three levels of text optimization:

- **Off-Thread MSDF Layout (`LayoutWorkerManager`)**: `MSDFTextEntity` can send text plus precomputed font/glyph metrics to a background Web Worker, debounced per entity. The worker performs line placement and returns typed coordinate/style buffers; it does not call browser font measurement APIs.
- **Cold/Hot Separation**: VectoJS separates layouts into "Cold" (text parsing & glyph width measurement) and "Hot" (wrapping computations). When text wraps due to resize, the cold results are reused, avoiding all browser measurement APIs and bringing resize layout complexity to pure $O(\text{word count})$.
- **Reusable TypedArray Buffers (`LayoutResultBuffer`)**: To avoid allocating thousands of temporary layout node objects, developers can write layout coordinates into pre-allocated flat buffers. The surrounding caller can still allocate; the guarantee is specifically that the buffer path reuses its coordinate storage.

> [!IMPORTANT] > **`LayoutWorkerManager` is a single background thread, not a pool, and it's wired up for one component only.** It's used internally by `MSDFTextEntity` (the GPU/MSDF-font text primitive) — the default `@vectojs/ui` text components (`Text`, `RichText`) lay out synchronously on the main thread, Cold/Hot split and all. If you're rendering very high volumes of default-component text and hitting a wall, the Cold/Hot split and `LayoutResultBuffer` still apply, but you won't get off-thread layout for free — you'd need to build your own Worker offload, or switch to `MSDFTextEntity`. More generally: outside this one text-layout path, nothing else in the engine runs off the main thread today. VMT traversal, hit-testing, and spring physics are all synchronous.

---

### 3. Sea of Entities Interaction ($O(N^2)$ Complexity Catastrophe)

**The Bottleneck**: Pairwise entity-to-entity collision or proximity checks require $O(N^2)$ candidate comparisons. That growth becomes impractical well before very large scene counts, with the exact limit depending on the work per pair.

**The Escape Hatch: Spatial Hashing Grid (`SpatialHashGrid`)**
For application-managed collision/proximity queries, VectoJS exports **SpatialHashGrid**. The Scene does not index entities automatically:

- The 2D coordinate space is discretized into cells of a fixed size you choose; cell coordinates are combined into a single bucket key via a [Cantor pairing function](https://en.wikipedia.org/wiki/Pairing_function), stored in a plain `Map` — not a fixed-capacity hash table.
- Call `insert(id, x, y, w, h)` when an entity's world-space AABB changes, or clear/rebuild the grid for a dynamic frame.
- Call `query(x, y, w, h)` to retrieve IDs from every cell overlapped by a local query AABB, then run exact collision tests on those candidates.
- This can reduce application-level local physics from **$O(N^2)$** to the cells/results visited by each query. Built-in `findEntityAt()` and viewport culling remain O(N) tree walks.

> [!WARNING] > **There is no automatic mitigation for dense buckets.** `SpatialHashGrid` (and the independent spatial hash used by the Knowledge Graph demo) store each cell as a flat set with no internal structure — no adaptive cell sizing, no overflow chaining, no hierarchical/multi-resolution grid. The "$O(1)$ average" figure assumes a roughly uniform distribution of entities across cells for your chosen `cellSize`. If your data can cluster heavily — many entities landing in the same handful of cells (a crowd forming at one point, a zoomed-out view where thousands of nodes overlap a few pixels) — those cells degrade toward $O(k)$ linear scans, same as no index at all. There's no automatic escape hatch for that today: the only lever is picking a `cellSize` appropriate to your entities' size and expected density, and re-evaluating it if your data's clustering behavior changes. If you're building something where extreme, unpredictable clustering is a real possibility, budget for measuring worst-case bucket occupancy yourself rather than assuming the average case holds.

---

## Measuring real performance

> [!WARNING]
> Headless Chrome often uses software rasterization and different frame scheduling. Treat its FPS as a same-environment regression signal, not as a lower bound or production prediction.

For accurate throughput numbers:

1. Run the demo in a real browser on real GPU hardware.
2. Use the **Export report** button in the Nexus demo to emit a machine-readable FPS record with your current GPU/browser combination.
3. When citing performance numbers in PRs or documentation, use in-browser measurements — not headless output.

For custom benchmarks, collect frame times in the `update()` loop:

```typescript
const samples: number[] = [];

class BenchEntity extends Entity {
  update(dt: number, time: number) {
    super.update(dt, time);
    if (samples.length < 300) samples.push(dt);
    if (samples.length === 300) {
      const avg = samples.reduce((a, b) => a + b) / samples.length;
      console.log(`avg frame: ${avg.toFixed(2)} ms  (${(1000 / avg).toFixed(1)} fps)`);
    }
  }
}
```

`dt` is in milliseconds; `1000 / dt` gives instantaneous FPS.

## Quick reference: which knob for which problem

| Symptom                                  | Fix                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Scene throttles to 2 fps when idle       | Expected — call `markDirty()` on state changes (inside `update()` works on core 0.2.6+)                                   |
| Manually animated entity drops to 2 fps  | Upgrade to core 0.2.6+ or override `hasPendingAnimations()`; on ≤ 0.2.5 `markDirty()` in `update()` is wiped              |
| Static UI wastes battery                 | Switch to `renderMode: 'onDemand'`                                                                                        |
| Many compatible circles are slow         | Benchmark `pointBackend: 'webgl'` + `getBatchCircle()` on the target device                                               |
| Offscreen entities waste CPU             | Implement `getBounds()` on the entity                                                                                     |
| DOM write overhead during animation      | Set `a11ySyncInterval: 100`                                                                                               |
| Text reflow on resize is slow            | Use `setMaxWidth()` instead of `setText()`                                                                                |
| Dense text causes allocation pressure    | Use `LayoutResultBuffer` + `layoutPreparedIntoBuffer()`                                                                   |
| FPS differs in CI                        | Compare like-for-like CI runs; measure user-facing throughput on target hardware                                          |
| Dynamic particles exhaust the CPU budget | Benchmark `ComputeParticleEntity` to offload its fixed-point force model to WebGPU                                        |
| Multi-line text reflow freezes thread    | Delegate `MSDFTextEntity` layout off-thread via `LayoutWorkerManager` (default `Text`/`RichText` stay on the main thread) |
| Sea of entities interaction is $O(N^2)$  | Implement a `SpatialHashGrid` — reduces to average $O(k)$, not automatic under heavy clustering; size cells for your data |
