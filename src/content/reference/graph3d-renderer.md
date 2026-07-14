---
title: 'Graph3D & picking'
description: 'The instanced Three.js renderer that draws any graph in two draw calls, plus the raycasting pattern for hover/click node picking.'
order: 23
---

# `Graph3D` & picking

Part of [`@vectojs/graph3d`](/reference/graph3d/). Consumes a
[`GraphLayout`](/reference/graph3d-layout/)'s `positions` buffer.

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
consumes any [`GraphLayout`](/reference/graph3d-layout/)-shaped positions
buffer and has no idea how those numbers were computed, which is what keeps
layouts swappable (or worker-hosted) without touching rendering code.

Link lines set `frustumCulled = false` — endpoints move every layout tick, and
recomputing bounds per frame for what's typically a background element is
wasted work compared to just always drawing them.

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

## Related

[`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/) (produces the `positions` buffer this consumes) ·
[`@vectojs/graph3d` overview](/reference/graph3d/)
