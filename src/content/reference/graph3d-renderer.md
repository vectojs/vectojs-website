---
title: 'Graph3D & picking'
description: 'The instanced Three.js renderer that draws any graph in two draw calls, plus the raycasting pattern for hover/click node picking.'
order: 46
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

pickNode(raycaster: THREE.Raycaster): number | null   // since 0.2.0
// Hit-test only the node cloud with a caller-configured raycaster (set from
// camera + pointer NDC) and return the nearest struck node's index — aligned
// with the `GraphData.nodes` array — or `null` on a miss. Links are never
// picked, so a ray grazing a link line reports a miss.

getNodePosition(index: number, target: THREE.Vector3): THREE.Vector3 | null   // since 0.2.0
// Read a node's current world position (as last written by applyPositions)
// straight from its instance matrix into `target`. `null` for an out-of-range
// index or when the node mesh does not exist.

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

Since 0.2.0, `pickNode()` hit-tests **only** the node cloud, so you no longer
hand-roll `intersectObjects` + `instanceId` filtering against the mixed
node/link children. Configure a `THREE.Raycaster` from the camera and pointer
NDC, then read back the struck node index (aligned with `GraphData.nodes`):

```ts
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;

  raycaster.setFromCamera(ndc, camera);
  const index = graph.pickNode(raycaster); // number | null; links never match
  const node = index !== null ? data.nodes[index] : null;
});
```

## `GraphInteraction` — hover / select / drag-to-pin

Since 0.2.0, `GraphInteraction` wraps the pointer plumbing above into hover,
select, and drag-to-pin — the piece every interactive 3D-graph app would
otherwise rebuild by hand. It owns three pointer listeners on `domElement` and
nothing else: no scene, no render loop, no controls. The host keeps driving its
own animation loop and layout `step()`.

```ts
const interaction = new GraphInteraction({
  graph, // the Graph3D
  camera, // the camera picking rays are built from
  domElement: canvas, // element pointer events are read from
  layout, // GraphLayout; required for drag-to-pin (needs pinNode)
  nodeCount: data.nodes.length, // optional index guard
  onHover: (i) => {
    /* i: number | null */
  },
  onSelect: (i) => {
    /* click that wasn't a drag; null = empty-space deselect */
  },
  setControlsEnabled: (enabled) => (controls.enabled = enabled), // suspend OrbitControls mid-drag
});
// …later
interaction.dispose(); // removes the pointer listeners
```

Drag is **feature-detected**: without a pin-capable layout (a `pinNode`
implementation, as [`D3ForceLayout`](/reference/graph3d-layout/) provides) a
press falls back to select. `onDragStart`/`onDrag`/`onDragEnd`, `pinOnDrag`
(default `true`), `dragReheat` (default `0.3`), and `dragThreshold` (default `4`
px) round out the options.

## Related

[`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/) (produces the `positions` buffer this consumes, and the `pinNode` drag-to-pin relies on) ·
[`@vectojs/graph3d` overview](/reference/graph3d/)
