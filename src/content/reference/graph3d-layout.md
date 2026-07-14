---
title: 'GraphLayout & D3ForceLayout'
description: 'The graph data model and the worker-friendly GraphLayout contract, plus its D3ForceLayout implementation over d3-force-3d.'
order: 22
---

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

`@vectojs/graph3d` ships one implementation today; more adapters (`ngraph`)
and DAG layout modes are on the package roadmap, all behind this same
interface so a renderer or worker host never needs to know which one is
running.

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

## Related

[`Graph3D` & picking](/reference/graph3d-renderer/) (consumes `positions` directly) ·
[`@vectojs/graph3d` overview](/reference/graph3d/)
