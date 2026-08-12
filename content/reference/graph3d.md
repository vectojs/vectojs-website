+++
title = "@vectojs/graph3d"
description = "3D force-directed graph visualization: a pluggable GraphLayout interface plus an instanced Three.js renderer that draws any graph in two draw calls."
weight = 44
+++

# `@vectojs/graph3d`

Version documented: **0.3.1**

3D force-directed graph visualization for VectoJS: a pluggable `GraphLayout` contract (worker-friendly, positions as one flat `Float32Array`) plus `Graph3D`, an instanced Three.js renderer that draws any graph — however many nodes — in exactly two draw calls. See the live [Les Misérables demo](/demos/graph3d/) for the canonical 77-node/254-link dataset in motion.

## Installation

```bash
bun add @vectojs/graph3d three
```

`three` is a peer dependency — `@vectojs/graph3d` draws into a `THREE.Group` you add to your own scene, and does not manage the `WebGLRenderer`, camera, or controls itself.

## Usage

```ts
import { D3ForceLayout, Graph3D } from '@vectojs/graph3d';
import * as THREE from 'three';

const data = {
  nodes: [{ id: 'vectojs', val: 8, color: '#4f9cff' }, { id: 'core' }, { id: 'ui' }],
  links: [
    { source: 'vectojs', target: 'core' },
    { source: 'vectojs', target: 'ui' },
  ],
};

const layout = new D3ForceLayout();
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

## Reference pages

| Page                                                          | Covers                                                                                                                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/) | `GraphData` data model, the worker-friendly `GraphLayout` contract, `D3ForceLayout` options and the force-restart pattern.                                         |
| [`Graph3D` & picking](/reference/graph3d-renderer/)           | The instanced Three.js renderer (`setGraphData`/`applyPositions`/`pickNode`/`getNodePosition`/`dispose`) plus `GraphInteraction` — hover, select, and drag-to-pin. |

---

## Design notes

- **Worker-friendly by construction.** The `GraphLayout` interface exists
  specifically so a physics simulation can run off the main thread — `positions`
  is a `Float32Array`, transferable across a `postMessage` boundary with zero
  copy, and `Graph3D.applyPositions()` never needs to know whether that buffer
  came from a synchronous call or a worker message.
- **Renderer/layout separation is total.** `Graph3D` never imports a layout
  class and a `GraphLayout` implementation never imports Three.js — swapping
  `D3ForceLayout` for a future `ngraph` adapter, or a static/precomputed layout
  with no simulation at all, is a one-line change at the call site.
- **Interactive in-world node cards and HUD components** built on `@vectojs/ui`
  and [`@vectojs/three`](/reference/three/) (scene-to-texture billboards that
  keep working in WebXR) are the next layer planned on top of this package —
  not yet shipped.

## Recommended docs-site pages

- **Learn / 3D graph visualization** — layout vs renderer separation, tuning
  `D3ForceLayout` forces, picking, and worker-hosted layouts.
- **Reference / API** — [`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/),
  [`Graph3D` & picking](/reference/graph3d-renderer/).
