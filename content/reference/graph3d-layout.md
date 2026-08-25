+++
title = "GraphLayout & D3ForceLayout"
description = "The graph data model and the worker-friendly GraphLayout contract, plus its D3ForceLayout implementation over d3-force-3d."
weight = 45
+++

# `GraphLayout` & `D3ForceLayout`

Part of [`@vectojs/graph3d`](/reference/graph3d/).

Version documented: **0.6.1**

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

**Link endpoint validation is uniform across the stack (0.6.1).**
`Graph3D.setGraphData`, `VectoForceLayout.setGraph`, and `D3ForceLayout.setGraph`
all throw the same `references an unknown node id` error for a link whose
endpoint names no node in the graph — validation runs before any state mutates,
so a rejected graph leaves the previous one intact (`D3ForceLayout` used to let
the raw id reach d3-force-3d, whose tick silently collapsed every position to
NaN; `VectoForceLayout` used to skip the link silently). Self-loops remain
legal input that carries no spring: `VectoForceLayout` skips them.

Note also that this contract's optional pin controls are addressed by node
**index**, while 2D [`ForceLayout2D`](/reference/graph-layout/) pins by node
**ID** (so its pins survive `removeNodes` compaction), and parallel-edge
identity differs too — this package's stacks treat parallel links as distinct
edges, while consumers such as the node-editor reject duplicate endpoint
quadruples. Translate pins and link identity when porting code between stacks.

`@vectojs/graph3d` ships two implementations behind this contract today — the
in-house [`VectoForceLayout`](#vectoforcelayout) (Barnes–Hut octree, no runtime
dependency; the default) and [`D3ForceLayout`](#d3forcelayout) (a
`d3-force-3d` adapter, kept for parity with an existing d3 tuning) — plus DAG
layout modes on the package roadmap, all behind this same interface so a
renderer or worker host never needs to know which one is running.

## `D3ForceLayout`

The d3-force-3d-backed alternative to the default
[`VectoForceLayout`](#vectoforcelayout). It requires `d3-force-3d`; prefer
`VectoForceLayout` unless you are migrating a graph with tuned d3 forces and
want the feel intact.

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
  alphaDecay?: number;     // cooling rate. Default 0.0228; non-positive falls back to the default.
  alphaMin?: number;       // alpha below which step() reports cooled. Default 0.001.
  seed?: number;           // RNG seed for deterministic placement. Default 1.
  measurePhases?: boolean; // opt-in per-tick phase profiling. Default false.
}
```

The in-house layout (added 0.3.0, and the default): a force-directed simulation
with a Barnes–Hut octree for the many-body term — no runtime dependency,
deterministic under a `seed`, and safe inside a Web Worker (same
`step(iterations)` contract as `D3ForceLayout`). Positions and velocities are
kept in **f32** (matching the exposed `Float32Array`), while the octree
accumulates centers of mass and the repulsion integral in **f64**. Choose it
when you want identical results across runs; tune with
`repulsion`/`linkStrength`, and raise `alphaDecay` above zero carefully — it is
already near the cooling edge, so a higher value freezes the graph earlier
rather than later. A non-positive `alphaDecay` is rejected at construction and
falls back to the default (a literal `0` used to make the simulation run
forever without ever settling).

```ts
layout.step(); // one tick
layout.step(5); // 5 ticks in one call — cheaper per-frame amortization
// for graphs whose visual settle time matters more
// than per-tick smoothness
```

**Phase profiling (since 0.5.0).** Set `measurePhases: true` to make each tick
record its wall-clock time split across `[octree build, force accumulate, link
springs, integrate]` in `layout.tickPhases` (a `readonly` 4-tuple of
milliseconds; `null` when profiling is off). The timing calls are elided
otherwise, so the hot path pays nothing.

**WASM force kernel (since 0.5.0).** An opt-in Rust/WASM kernel
(`crates/vectojs-force-rs`) accelerates the octree build + repulsion
accumulation — the dominant phase of a tick — while link springs, centering,
integration, and pins stay in JS:

```ts
import { forceWasmUrl } from '@vectojs/graph3d/wasm';

await layout.enableWasmForce(forceWasmUrl); // async; string | URL | Response
layout.enableWasmForceSync(bytes); // sync; BufferSource, never fetches
```

Both return `false` on any failure (CSP, 404, corrupt module) and silently keep
the bit-for-bit identical JS Barnes-Hut, which is the permanent fallback and the
differential oracle. The kernel has no `@vectojs/core` dependency.

**Pinning (since 0.2.0).** Both `D3ForceLayout` and `VectoForceLayout` implement
the optional pin controls (d3 over `fx`/`fy`/`fz`, VectoForceLayout over its own
pin arrays), which is what powers
[`GraphInteraction`](/reference/graph3d-renderer/#graphinteraction--hover--select--drag-to-pin)'s
drag-to-pin:

```ts
layout.pinNode(i, x, y, z); // clamp node i to (x,y,z) every tick; also updates positions[i] now
layout.reheat(0.3); // wake a cooled sim so the rest settles around the pin
layout.unpinNode(i); // clear fx/fy/fz — node i is free again
```

Out-of-range indices are ignored (a stale pointer interaction can't crash the
layout), and `reheat`'s alpha is clamped to `[alphaMin, 1]`.

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

`VectoForceLayoutOptions` are likewise constructor-only, so the same restart
pattern applies when you change its forces.

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
