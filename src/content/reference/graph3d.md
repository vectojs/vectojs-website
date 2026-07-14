---
title: '@vectojs/graph3d'
description: '3D force-directed graph visualization: a pluggable GraphLayout interface plus an instanced Three.js renderer that draws any graph in two draw calls.'
order: 7
---

# `@vectojs/graph3d`

Version documented: **0.1.0**

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

---

## Data model — `GraphData`

```ts
type NodeId = string | number;

interface GraphNode {
  id: NodeId;
  val?: number; // relative importance; renderer scales radius ∝ ∛val. Default 1.
  color?: string; // CSS color; falls back to the renderer's nodeColor.
  fx?: number; // pin the node at a fixed x — layout will not move it
  fy?: number;
  fz?: number;
  [key: string]: unknown; // domain properties ride along untouched
}

interface GraphLink {
  source: NodeId;
  target: NodeId;
  [key: string]: unknown;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}
```

Node objects are never mutated by either the layout or the renderer — arbitrary
extra properties (a label, a category, a weight used only by your own code)
pass through untouched, so `GraphData` doubles as your application's own graph
model rather than a format you convert into and back out of.

---

## `GraphLayout` — the layout contract

```ts
interface GraphLayout {
  setGraph(data: GraphData): void;
  step(iterations?: number): boolean; // advances the sim, refreshes `positions`; false once cooled
  readonly positions: Float32Array; // xyz triplets, index-aligned with GraphData.nodes
  dispose(): void; // release simulation resources; instance unusable afterward
}
```

The contract is deliberately minimal and worker-friendly: positions are one
flat `Float32Array` of xyz triplets in `GraphData.nodes` order, so an
implementation can live entirely inside a Web Worker and stream its buffer
across the thread boundary as a transferable, without per-node object traffic.
`Graph3D.applyPositions()` consumes that exact same buffer shape directly.
`positions` is the **same array instance** reused across steps — copy it
(`layout.positions.slice()`) if you need a stable snapshot instead of a live
view.

`@vectojs/graph3d` ships one implementation today; more adapters (`ngraph`)
and DAG layout modes are on the package roadmap, all behind this same
interface so a renderer or worker host never needs to know which one is
running.

### `D3ForceLayout`

```ts
new D3ForceLayout(options?: D3ForceLayoutOptions)

interface D3ForceLayoutOptions {
  linkDistance?: number;   // target resting length of links. Default 30.
  chargeStrength?: number; // many-body (charge) strength; negative repels. Default -30.
  alphaMin?: number;       // alpha threshold below which step() reports cooled. Default 0.001.
}
```

Adapts [d3-force-3d](https://github.com/vasturiano/d3-force-3d) — the same
engine behind `3d-force-graph` — so a graph's tuned forces migrate with their
feel intact. Runs `forceLink` + `forceManyBody` + `forceCenter` in 3
dimensions.

The d3 simulation mutates its own node records (`x`/`y`/`z`/`vx`/…), so
`setGraph` clones each node into an internal simulation record rather than
handing it your `GraphData.nodes` objects directly — only the declared
`fx`/`fy`/`fz` pins are carried over. The simulation's own timer is never
started; `step(iterations = 1)` ticks it synchronously, which is what keeps
`D3ForceLayout` usable inside a Web Worker without faking `requestAnimationFrame`.

```ts
layout.step(); // one tick
layout.step(5); // 5 ticks in one call — cheaper per-frame amortization
// for graphs whose visual settle time matters more
// than per-tick smoothness
```

**Changing forces live.** `D3ForceLayoutOptions` are constructor-only; there is
no live setter. To apply a new `chargeStrength`/`linkDistance` (for example
from a slider), `dispose()` the old instance and `setGraph()` a fresh one —
cheap for graphs where the topology itself doesn't change, since only the
simulation, not `Graph3D`'s GPU buffers, gets rebuilt:

```ts
function restartLayout() {
  layout.dispose();
  layout = new D3ForceLayout({ chargeStrength, linkDistance });
  layout.setGraph(data);
}
```

---

## `Graph3D` — the renderer

```ts
new Graph3D(options?: Graph3DOptions)

interface Graph3DOptions {
  nodeRadius?: number;   // base node radius before val scaling. Default 4.
  nodeSegments?: number; // sphere tessellation (width/height segments). Default 12.
  nodeColor?: string;    // fallback color for nodes that declare none. Default '#4f9cff'.
  linkColor?: string;    // link line color. Default '#9aa4b2'.
  linkOpacity?: number;  // link line opacity. Default 0.35.
}
```

### Public property

```ts
graph.group: THREE.Group // add this to your scene; owns the node mesh + link lines
```

### Methods

```ts
setGraphData(data: GraphData): void
// Rebuilds GPU resources for a new graph: one InstancedMesh (nodeCount
// instances of a shared SphereGeometry, per-instance color + ∛val scale) and
// one LineSegments (linkCount segments). Instanced buffers are fixed-size, so
// a changed node/link count means fresh meshes — styling-only changes to the
// SAME topology are cheap enough not to need a separate path. An unknown link
// endpoint (a source/target id not present in `data.nodes`) throws rather than
// silently drawing a line to the origin.

applyPositions(positions: Float32Array): void
// Writes xyz triplets (e.g. a GraphLayout's `.positions`) into the instanced
// node matrices and link endpoints. Call after every layout step that moved
// something; cheap enough to call every frame while a simulation is running.

dispose(): void
// Releases geometry/material/mesh GPU resources for both the node mesh and
// link lines, and empties `group`.
```

One `InstancedMesh` for every node (per-instance color and `∛val`-proportional
radius) plus one `LineSegments` for every link, both under a single
`THREE.Group` — the whole point of the instancing is that graph size costs
exactly **two draw calls**, whether the graph has 10 nodes or 10,000. `Graph3D`
consumes any `GraphLayout`-shaped positions buffer and has no idea how those
numbers were computed, which is what keeps layouts swappable (or worker-hosted)
without touching rendering code.

Link lines set `frustumCulled = false` — endpoints move every layout tick, and
recomputing bounds per frame for what's typically a background element is
wasted work compared to just always drawing them.

---

## Picking (hover / click)

`Graph3D` doesn't ship its own raycasting helper — `group.children` is a plain
Three.js `InstancedMesh` + `LineSegments`, so standard `THREE.Raycaster`
instance-picking applies directly. `intersectObjects` reports which node
**instance** was hit via `.instanceId`, index-aligned with the `GraphData.nodes`
array passed to `setGraphData`:

```ts
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;

  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(graph.group.children, false);
  const hit = hits.find((h) => h.instanceId !== undefined); // only the node mesh sets this
  const node = hit ? data.nodes[hit.instanceId!] : null;
});
```

Filtering on `instanceId !== undefined` is what discriminates a node hit from a
link-line hit (`LineSegments` intersections never carry an `instanceId`) when
both are passed to the same `intersectObjects` call — see the live demo's
[`src/demos/graph3d.ts`](https://github.com/vectojs/vectojs-website/blob/main/src/demos/graph3d.ts)
for the full hover-label pattern, including pausing the render loop via
`IntersectionObserver`/`visibilitychange` when the canvas is off-screen or the
tab is hidden.

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
  - `@vectojs/three` (scene-to-texture billboards that keep working in WebXR)
    are the next layer planned on top of this package — not yet shipped.

## Recommended docs-site pages

- **Learn / 3D graph visualization** — layout vs renderer separation, tuning
  `D3ForceLayout` forces, picking, and worker-hosted layouts.
- **Reference / API** — this file (`GraphData`, `GraphLayout`, `D3ForceLayout`,
  `Graph3D`).
