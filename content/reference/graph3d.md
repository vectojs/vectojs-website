+++
title = "@vectojs/graph3d"
description = "3D force-directed graph visualization: a pluggable GraphLayout interface plus an instanced Three.js renderer that draws any graph in two draw calls."
weight = 44
+++

# `@vectojs/graph3d`

Version documented: **0.6.1**

3D force-directed graph visualization for VectoJS: a pluggable `GraphLayout` contract (worker-friendly, positions as one flat `Float32Array`) plus `Graph3D`, an instanced Three.js renderer that draws any graph — however many nodes — in exactly two draw calls. See the live [Les Misérables demo](/demos/graph3d/) for the canonical 77-node/254-link dataset in motion.

## Installation

```bash
bun add @vectojs/graph3d three
```

`three` is a peer dependency — `@vectojs/graph3d` draws into a `THREE.Group` you add to your own scene, and does not manage the `WebGLRenderer`, camera, or controls itself.

## Usage

```ts
import { VectoForceLayout, Graph3D } from '@vectojs/graph3d';
import * as THREE from 'three';

const data = {
  nodes: [{ id: 'vectojs', val: 8, color: '#4f9cff' }, { id: 'core' }, { id: 'ui' }],
  links: [
    { source: 'vectojs', target: 'core' },
    { source: 'vectojs', target: 'ui' },
  ],
};

const layout = new VectoForceLayout();
layout.setGraph(data);

const graph = new Graph3D();
graph.setGraphData(data);
scene.add(graph.group);

function animate() {
  const active = layout.step();
  graph.applyPositions(layout.positions);
  renderer.render(scene, camera);
  if (active) requestAnimationFrame(animate);
}
animate();
```

`layout.step()` returns `false` once the simulation has cooled (alpha below
threshold) — the example above stops its own rAF loop then, but a caller that
lets the user tune forces live (charge strength, link distance) should keep
rendering every frame regardless and only gate the physics `step()`/
`applyPositions()` call on that flag, so `OrbitControls` damping and camera
movement stay smooth even after the layout settles.

`VectoForceLayout` (the in-house Barnes-Hut octree layout, no runtime dependency)
is the default; [`D3ForceLayout`](/reference/graph3d-layout/#d3forcelayout)
remains available but requires `d3-force-3d`. The two are drop-in swappable
behind the same `GraphLayout` contract.

## GraphCamera

Since 0.4.0, `GraphCamera` is a battery-included camera + controls for hosts
that don't bring their own Three.js controls: a 2D orthographic pan/zoom view
and a 3D perspective orbit view behind one `camera` getter.

```ts
import { GraphCamera } from '@vectojs/graph3d';

const camera = new GraphCamera({ domElement: canvas, mode: '3d' }); // '2d' (ortho) is the default
camera.fitToPositions(layout.positions); // frame the graph; skips non-finite points
camera.setMode('2d'); // switch to orthographic pan/zoom
camera.setSize(width, height); // call on canvas resize
camera.dispose(); // remove pointer/wheel listeners
```

`mode: '2d' | '3d'` selects the camera type; `fitToPositions(positions)` frames
an xyz-triplet buffer (the same shape
[`applyPositions`](/reference/graph3d-renderer/#methods) consumes). Pair it with
`GraphInteraction` by passing `() => camera.camera` (a getter, so `setMode`
stays live) and wiring `setControlsEnabled` so a node drag doesn't also pan the
view.

## WASM force kernel

`VectoForceLayout` ships an optional Rust/WASM force kernel
(`crates/vectojs-force-rs`, published as a co-located `vectojs_force.wasm`) that
accelerates the Barnes-Hut octree build + repulsion accumulation — the measured
78–90% of a tick. On any load/instantiate failure it silently returns `false`
and keeps the bit-for-bit identical JS Barnes-Hut, so it is safe to enable
speculatively.

```ts
import { forceWasmUrl } from '@vectojs/graph3d/wasm';

await layout.enableWasmForce(forceWasmUrl); // streaming (browser): URL | Response
layout.enableWasmForceSync(bytes); // raw bytes (Node/tests), never fetches
```

The kernel has no `@vectojs/core` dependency — `three` stays the only peer. See
[`VectoForceLayout`](/reference/graph3d-layout/#vectoforcelayout) for the full
layout API, including the `measurePhases` profiling option.

## Reference pages

| Page                                                          | Covers                                                                                                                                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/) | `GraphData` data model, the worker-friendly `GraphLayout` contract, `VectoForceLayout` (default) and `D3ForceLayout` options, the WASM kernel, and the force-restart pattern. |
| [`Graph3D` & picking](/reference/graph3d-renderer/)           | The instanced Three.js renderer (`setGraphData`/`applyPositions`/`pickNode`/`getNodePosition`/`dispose`) plus `GraphInteraction` — hover, select, and drag-to-pin.            |

---

## Design notes

- **Worker-friendly by construction.** The `GraphLayout` interface exists
  specifically so a physics simulation can run off the main thread — `positions`
  is a `Float32Array`, transferable across a `postMessage` boundary with zero
  copy, and `Graph3D.applyPositions()` never needs to know whether that buffer
  came from a synchronous call or a worker message.
- **Renderer/layout separation is total.** `Graph3D` never imports a layout
  class and a `GraphLayout` implementation never imports Three.js — swapping
  `VectoForceLayout` for `D3ForceLayout`, a static/precomputed layout with no
  simulation at all, or a future `ngraph` adapter is a one-line change at the
  call site.
- **Interactive in-world node cards and HUD components** built on `@vectojs/ui`
  and [`@vectojs/three`](/reference/three/) (scene-to-texture billboards that
  keep working in WebXR) are the next layer planned on top of this package —
  not yet shipped.

## Recommended docs-site pages

- **Learn / 3D graph visualization** — layout vs renderer separation, tuning
  `VectoForceLayout` forces, picking, and worker-hosted layouts.
- **Reference / API** — [`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/),
  [`Graph3D` & picking](/reference/graph3d-renderer/).
