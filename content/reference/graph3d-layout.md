+++
title = "GraphLayout & D3ForceLayout"
description = "The graph data model and the worker-friendly GraphLayout contract, plus its D3ForceLayout implementation over d3-force-3d."
weight = 45
+++

# `GraphLayout` & `D3ForceLayout`

Part of [`@vectojs/graph3d`](/reference/graph3d/).

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

## `GraphLayout` — the layout contract

```ts
interface GraphLayout {
  setGraph(data: GraphData): void;
  step(iterations?: number): boolean; // advances the sim, refreshes `positions`; false once cooled
  readonly positions: Float32Array; // xyz triplets, index-aligned with GraphData.nodes
  // Optional runtime pin controls (since 0.2.0) — for interactive drag-to-pin.
  // GraphInteraction feature-detects pinNode before enabling drag.
  pinNode?(nodeIndex: number, x: number, y: number, z: number): void;
  unpinNode?(nodeIndex: number): void; // release a pinned node back to free simulation
  reheat?(alpha?: number): void; // raise alpha so a cooled sim responds to a pin/unpin
  dispose(): void; // release simulation resources; instance unusable afterward
}
```

The contract is deliberately minimal and worker-friendly: positions are one
flat `Float32Array` of xyz triplets in `GraphData.nodes` order, so an
implementation can live entirely inside a Web Worker and stream its buffer
across the thread boundary as a transferable, without per-node object traffic.
[`Graph3D.applyPositions()`](/reference/graph3d-renderer/#methods) consumes
that exact same buffer shape directly. `positions` is the **same array
instance** reused across steps — copy it (`layout.positions.slice()`) if you
need a stable snapshot instead of a live view.

`@vectojs/graph3d` ships two implementations behind this contract today —
[`D3ForceLayout`](#d3forcelayout) below and the in-house [`VectoForceLayout`](#vectoforcelayout)
(Barnes–Hut, no d3 dependency) — plus DAG layout modes on the package roadmap,
all behind this same interface so a renderer or worker host never needs to know
which one is running.

## `D3ForceLayout`

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
`fx`/`fy`/`fz` pins and any initial `x`/`y`/`z` position seeds are carried
over. The simulation's own timer is never started; `step(iterations = 1)`
ticks it synchronously, which is what keeps `D3ForceLayout` usable inside a
Web Worker without faking `requestAnimationFrame`.

## `VectoForceLayout`

```ts
new VectoForceLayout(options?: VectoForceLayoutOptions)

interface VectoForceLayoutOptions {
  linkDistance?: number;   // target resting length of links. Default 30.
  linkStrength?: number;   // spring stiffness of links. Default 0.3.
  repulsion?: number;      // many-body repulsion strength. Default 300.
  centerStrength?: number; // pull toward the centroid. Default 0.02.
  velocityDecay?: number;  // per-step velocity damping. Default 0.6.
  theta?: number;          // Barnes–Hut opening angle. Default 0.9.
  alphaDecay?: number;     // cooling rate. Default 0.0228; 0 disables cooling.
  alphaMin?: number;       // alpha below which step() reports cooled. Default 0.001.
  seed?: number;           // RNG seed for deterministic placement. Default 1.
}
```

The in-house layout (added 0.3.0): a force-directed simulation with a
Barnes–Hut octree for the many-body term — no d3 dependency, deterministic
under a `seed`, and safe inside a Web Worker (same `step(iterations)` contract
as `D3ForceLayout`). Choose it when you want identical results across runs;
tune with `repulsion`/`linkStrength`, and raise `alphaDecay` above zero
carefully — it is already near the cooling edge, so a higher value freezes the
graph earlier rather than later.

```ts
layout.step(); // one tick
layout.step(5); // 5 ticks in one call — cheaper per-frame amortization
// for graphs whose visual settle time matters more
// than per-tick smoothness
```

**Pinning (since 0.2.0).** `D3ForceLayout` implements the optional pin controls
over d3-force's `fx`/`fy`/`fz`, which is what powers
[`GraphInteraction`](/reference/graph3d-renderer/#graphinteraction--hover--select--drag-to-pin)'s
drag-to-pin:

```ts
layout.pinNode(i, x, y, z); // clamp node i to (x,y,z) every tick; also updates positions[i] now
layout.reheat(0.3); // wake a cooled sim so the rest settles around the pin
layout.unpinNode(i); // clear fx/fy/fz — node i is free again
```

Out-of-range indices are ignored (a stale pointer interaction can't crash the
layout), and `reheat`'s alpha is clamped to d3's usual `[alphaMin, 1]` range.

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

## Related

For renderer-independent **2D** force layout, incremental topology updates, and
interleaved XY positions, use
[`@vectojs/graph-layout`](/reference/graph-layout/). It is a separate package;
its `ForceLayout2D` and XY buffer do not implement this page's 3D `GraphLayout`
contract or its XYZ position shape. Both APIs return an active/cooled boolean
from host-driven `step()`, but their layout types and position buffers are not
interchangeable.

[`Graph3D` & picking](/reference/graph3d-renderer/) (consumes `positions` directly) ·
[`@vectojs/graph3d` overview](/reference/graph3d/)
