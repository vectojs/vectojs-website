+++
title = "@vectojs/graph-layout"
description = "Renderer-independent, dependency-free 2D force layout with Barnes-Hut repulsion, incremental topology updates, collision handling, and runtime pinning."
weight = 47
+++

# `@vectojs/graph-layout`

Version documented: **0.2.0**

`@vectojs/graph-layout` is a dependency-free 2D force simulation. It owns no
renderer and no animation timer: the host supplies graph data, calls `step()`,
and reads interleaved XY coordinates from a `Float32Array`. The same layout can
drive Canvas 2D, SVG, WebGL, WebGPU, a VectoJS scene, or an off-main-thread
renderer.

Version 0.2.0 has one implementation, the TypeScript `ForceLayout2D`. There is
no WASM build, alternate backend, or `backend` option in 0.2.0. WASM remains a
measurement-gated future option; the current cross-dimensional browser
comparisons are not direct evidence that a WASM backend would help.

## Installation

```bash
bun add @vectojs/graph-layout
```

The package has no runtime or renderer peer dependency.

## Canvas 2D example

This example uses arbitrary string IDs and resolves their current position
indices through the layout. Numeric IDs are identifiers too; do not assume a
numeric ID equals its current node index.

```ts
import { ForceLayout2D, type GraphData } from '@vectojs/graph-layout';

const canvas = document.querySelector('canvas');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Canvas not found');

const context = canvas.getContext('2d');
if (!context) throw new Error('Canvas 2D is unavailable');

const graph: GraphData = {
  nodes: [{ id: 'center', fx: 0, fy: 0 }, { id: 'left' }, { id: 'right' }],
  links: [
    { source: 'center', target: 'left' },
    { source: 'center', target: 'right' },
  ],
};

const layout = new ForceLayout2D({
  collisionRadius: 8,
  linkDistance: 48,
});
layout.setGraph(graph);

function draw(): void {
  const active = layout.step();
  const positions = layout.positions;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);

  context.beginPath();
  for (const link of graph.links) {
    const sourceIndex = layout.getNodeIndex(link.source);
    const targetIndex = layout.getNodeIndex(link.target);
    if (sourceIndex === undefined || targetIndex === undefined) continue;
    const source = sourceIndex * 2;
    const target = targetIndex * 2;
    context.moveTo(positions[source], positions[source + 1]);
    context.lineTo(positions[target], positions[target + 1]);
  }
  context.stroke();

  for (let index = 0; index < layout.nodeCount; index++) {
    context.beginPath();
    context.arc(positions[index * 2], positions[index * 2 + 1], 5, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();

  if (active) requestAnimationFrame(draw);
}

draw();
```

`step()` is synchronous. It returns `true` while the simulation remains active
and `false` after it has cooled below `alphaMin` (or when the graph is empty).
The return value says whether physics needs another tick; it says nothing about
whether your application should continue rendering for camera movement, input,
or other animation. `alphaDecay: 0` disables cooling, so a non-empty simulation
does not settle on its own.

## Public types

The package exports the following types and `ForceLayout2D` from its root:

```ts
type NodeId = string | number;
type LinkId = NodeId;

interface GraphNode {
  id: NodeId;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
  [key: string]: unknown;
}

interface GraphLink {
  source: NodeId;
  target: NodeId;
  id?: NodeId;
  [key: string]: unknown;
}

interface GraphData {
  nodes: readonly GraphNode[];
  links: readonly GraphLink[];
}

type NodeValue = number | ((node: GraphNode, index: number) => number);
type LinkValue = number | ((link: GraphLink, index: number) => number);

interface ForceLayout2DOptions {
  repulsion?: NodeValue;
  collisionRadius?: NodeValue;
  collisionStrength?: number;
  linkDistance?: LinkValue;
  linkStrength?: LinkValue;
  centerStrength?: number;
  velocityDecay?: number;
  theta?: number;
  repulsionDistanceMax?: number;
  alphaDecay?: number;
  alphaMin?: number;
  seed?: number;
}
```

Extra node and link fields remain application-owned. The layout does not mutate
the input records.

## Options

| Option                 |    Default | Meaning                                                                                                     |
| ---------------------- | ---------: | ----------------------------------------------------------------------------------------------------------- |
| `repulsion`            |      `300` | Non-negative many-body repulsion magnitude per node.                                                        |
| `collisionRadius`      |        `0` | Non-negative radius per node. Two zero-radius nodes do not separate.                                        |
| `collisionStrength`    |        `1` | Non-negative collision correction multiplier. Zero disables collision correction.                           |
| `linkDistance`         |       `30` | Non-negative resting length per link.                                                                       |
| `linkStrength`         |      `0.3` | Non-negative spring stiffness per link.                                                                     |
| `centerStrength`       |     `0.02` | Non-negative pull toward the origin.                                                                        |
| `velocityDecay`        |      `0.6` | Per-tick velocity retention, clamped below `1`.                                                             |
| `theta`                |      `0.9` | Non-negative Barnes-Hut opening angle. Lower values trade speed for accuracy; `0` performs exact traversal. |
| `repulsionDistanceMax` | `Infinity` | Maximum distance at which nodes repel. `0` disables repulsion; non-finite values disable the cutoff.        |
| `alphaDecay`           |   `0.0228` | Temperature decay per tick, clamped to `[0, 1]`.                                                            |
| `alphaMin`             |    `0.001` | Non-negative temperature below which the simulation is settled.                                             |
| `seed`                 |        `1` | Deterministic seed for nodes without finite initial coordinates.                                            |

Non-finite option values fall back to their defaults. Values documented as
non-negative are clamped at zero. Node and link accessors are evaluated once
when each record is accepted into the layout, not on every tick. Node accessor
indices are insertion indices. Link accessor indices are stable, contiguous
indices across append-only paging. Removing nodes compacts links, so a later
append can reuse an index previously assigned to a removed link. Removing nodes
does not reevaluate accessors for survivors; use a fresh `setGraph()` if values
must be derived again. All options are constructor-only; there are no live force
setters in 0.2.0.

## API

```ts
class ForceLayout2D {
  constructor(options?: ForceLayout2DOptions);

  positions: Float32Array;
  nodeCount: number;

  getNodeIndex(id: NodeId): number | undefined;
  getNodeId(index: number): NodeId | undefined;
  getNodeIds(): readonly NodeId[];
  setGraph(data: GraphData): void;
  appendGraph(data: GraphData): void;
  removeNodes(ids: Iterable<NodeId>): void;
  removeLinks(items: Iterable<GraphLink | LinkId>): void;
  updateLinks(links: readonly GraphLink[]): void;
  step(iterations?: number): boolean;
  setNodePin(nodeIndex: number, pin: { x?: number; y?: number }): void;
  clearNodePin(nodeIndex: number, axes?: { x?: boolean; y?: boolean }): void;
  pinNode(nodeIndex: number, x: number, y: number): void;
  unpinNode(nodeIndex: number): void;
  reheat(alpha?: number): void;
  dispose(): void;
}
```

### Positions and stepping

`positions` contains `[x0, y0, x1, y1, ...]` in current node order. It is a live
view: the layout updates its values in place across `step()` calls. Call
`layout.positions.slice()` when you need an immutable snapshot.

The view object is not stable across topology boundaries. Always reacquire
`layout.positions` after `setGraph()`, `appendGraph()`, or `removeNodes()`;
appending past internal capacity also reallocates the backing storage. Node
indices can change after removal because survivors are compacted while retaining
their relative order.

Use `getNodeIndex(id)` to resolve an ID to its current index and `getNodeId(index)`
for the reverse lookup. Both return `undefined` when no current node matches.
`getNodeIds()` returns a snapshot in current position order; mutating that array
does not affect the layout. Existing indices remain stable across append-only
updates, while removal compacts survivors.

`step(iterations = 1)` performs up to that many synchronous ticks and returns
`true` if alpha is still at least `alphaMin` afterward. It stops early on
cooling. Non-positive or non-finite iteration counts perform no ticks and report
the current active state; counts are floored and capped at 10,000 per call.

### Replacing, appending, and removing nodes

`setGraph(data)` replaces all state, deterministically seeds the new graph, and
sets alpha to `1`. Every node ID must be a string or finite number and must be
unique; invalid or duplicate IDs throw before the existing graph is cleared.

`appendGraph(data)` preserves existing positions, velocities, and pins. Nodes
whose IDs are invalid, already present, or repeated in that append are ignored,
which makes replayed pages idempotent. Accepted nodes are appended in input
order. Accepted links may target existing nodes or nodes accepted in the same
call. A topology change reheats monotonically: it can raise alpha but never
lowers an already-hot simulation.

Links are replay-safe by directed endpoint pair plus optional `id`:

- Without an `id`, repeated `source` to `target` links are one link.
- Direction matters: `a` to `b` and `b` to `a` have different identities.
- Parallel links need distinct string or finite-number IDs.
- Replaying an identified link is ignored.
- Links with an unknown endpoint or the same source and target are ignored.
- A malformed optional link ID is treated as absent for identity purposes.

Links with malformed optional IDs still enter as unidentified links when their
endpoints are valid; unknown endpoints and self-links do not enter the force
arrays. Malformed link data does not make positions non-finite.
`removeNodes(ids)` removes matching nodes and every incident link, compacts
survivor state, recomputes degree bias, and reheats when something was removed.
Unknown IDs and an empty iterable are no-ops.

### Removing and updating links

`removeLinks(items)` removes links without changing any node index, position,
velocity, or pin. Pass a full link to match its directed endpoints plus optional
ID, or pass a bare `LinkId` to remove every identified link carrying that ID.
Surviving links retain their order and cached accessor values. Unknown and
already-removed identities are no-ops. A successful batch recomputes link-degree
bias and reheats once.

`updateLinks(links)` re-evaluates `linkDistance` and `linkStrength` accessors for
matching existing identities. Use it after changing application-owned link
fields consumed by those accessors. The complete batch is validated first:
unknown or identical endpoints throw without applying any update. An identity
that is not already present is ignored. Because endpoints participate in link
identity, rerouting requires `removeLinks()` followed by `appendGraph()`.
Unchanged values do not reheat the simulation.

### Pinning and reheating

Finite initial `fx` and `fy` values pin axes independently. A node can therefore
have fixed X with free Y, fixed Y with free X, or both axes fixed. Initial `x`
and `y` seed only their corresponding unpinned axes.

At runtime, `setNodePin(index, { x?, y? })` pins only the supplied axes,
immediately updates those live coordinates, and clears their velocity.
`clearNodePin(index, { x?, y? })` releases selected axes while preserving the
other axis; omitting the axes object releases both. `pinNode(index, x, y)` and
`unpinNode(index)` remain both-axis convenience methods. Invalid indices are
ignored. These calls do not reheat automatically, so call `reheat()` after
interactive pin or unpin operations.

`reheat(alpha = 0.3)` clamps the request to `[alphaMin, 1]` and applies
`max(currentAlpha, requestedAlpha)`. It never cools a hotter simulation.

### Disposal

`dispose()` releases graph and quadtree storage, resets `positions` to an empty
array, and is idempotent. After disposal, every other method throws
`ForceLayout2D was disposed`; create a new instance rather than trying to reuse
the old one.

## Complexity and capacity

For `N` nodes and `E` accepted links, a normal tick builds a Barnes-Hut quadtree
and evaluates repulsion in expected `O(N log N)`, applies springs in `O(E)`, and
sanitizes, centers, and integrates in `O(N)`. Thus the usual tick cost without
collisions is `O(N log N + E)`. This is not a worst-case promise: pathological
spatial distributions or `theta: 0` can approach all-pairs work.

When collision is enabled, the layout builds the quadtree a second time over
predicted positions and performs radius-neighborhood queries. Sparse, locally
bounded neighborhoods are commonly near `O(N log N + K)`, where `K` is the
candidate/overlap work, but dense clusters or very large radii can make `K`
quadratic. Collision does not inherit an unconditional `O(N log N)` bound from
Barnes-Hut repulsion.

`setGraph()` is `O(N + E)` apart from geometric capacity allocation and
initialization. `appendGraph()` is proportional to the appended input plus an
`O(N + E)` degree-bias recomputation when links are accepted. `removeLinks()`
compacts only link storage and is `O(E + R)` when requests are full links, or
`O(E + RE)` in the worst case when `R` bare IDs each scan all links.
`updateLinks()` is `O(E + U)` for `U` updates. Storage grows
geometrically, so most small appends reuse capacity; a growth boundary copies
existing typed arrays in `O(N + E)` time. `removeNodes()` compacts nodes and
links and recomputes bias in `O(N + E)`. Removal does not shrink capacity.

## Measured browser evidence

One headed-browser diagnostic run after degree bias measured the following p95
main-thread tick times over ten tick samples per row:

| 3,000-node workload | Chrome 151 | Firefox 153 |
| ------------------- | ---------: | ----------: |
| Star/hub            |   10.60 ms |     7.84 ms |
| Mixed sparse        |    8.09 ms |     7.28 ms |

Appending a 50-node page measured **0.145-0.355 ms** across the four
browser/workload rows. Each append row had one topology-mutation sample, so this
range is diagnostic evidence, not a tail-latency estimate. These measurements
came from one headed run on the task runner's hardware and software environment,
not portable guarantees. Browser scheduling, hardware, power state, background
load, graph geometry, options, warm-up, and sample construction affect results.
They are per-operation latency evidence, not FPS measurements; no FPS claim can
be derived from them.

## Migrating from `d3-force`

The conceptual mapping is direct but the API is intentionally smaller:

| `d3-force`                                       | `@vectojs/graph-layout`                                   |
| ------------------------------------------------ | --------------------------------------------------------- |
| `simulation.nodes(nodes)` and `forceLink(links)` | `layout.setGraph({ nodes, links })`                       |
| `simulation.tick(k)`                             | `layout.step(k)`                                          |
| Mutated node `x`/`y` fields                      | Interleaved `layout.positions` XY view                    |
| `simulation.alpha(value).restart()`              | `layout.reheat(value)` plus a host-scheduled frame        |
| `node.fx` / `node.fy` mutation                   | Initial `fx`/`fy`, then `setNodePin()` / `clearNodePin()` |
| d3's internal timer                              | No timer; the host owns scheduling                        |

Links use endpoint IDs rather than d3-mutated endpoint objects. Option accessors
receive the original `GraphNode` or `GraphLink` and an insertion index, then are
cached. There is no custom-force registry in 0.2.0; if your d3 layout depends on
custom forces or live force setters, keep d3-force or recreate the layout with
new options.

## 2D versus `@vectojs/graph3d`

Use this package for renderer-independent **2D** physics and interleaved XY
pairs. [`@vectojs/graph3d`](/reference/graph3d/) provides separate 3D layout
implementations (`D3ForceLayout` and `VectoForceLayout`) and a Three.js
renderer; its positions are XYZ triplets and its graph/layout types are not
interchangeable with `ForceLayout2D`. Although both APIs use a host-called
`step()` that reports whether simulation work remains, do not pass this
package's XY buffer to `Graph3D.applyPositions()`, which requires XYZ data.

## Related

[`@vectojs/graph3d`](/reference/graph3d/) for 3D layouts and rendering ·
[`GraphLayout` and 3D layout implementations](/reference/graph3d-layout/)
