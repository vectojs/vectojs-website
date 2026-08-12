+++
title = "Graph3D 与拾取"
description = "在两次绘制调用中绘制任意图的实例化 Three.js 渲染器，外加用于悬停/点击节点拾取的光线投射模式。"
weight = 46
+++

# `Graph3D` 与拾取

属于 [`@vectojs/graph3d`](/reference/graph3d/)。消费一个 [`GraphLayout`](/reference/graph3d-layout/) 的 `positions` 缓冲区。

## `Graph3D` —— 渲染器

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

### 公共属性

```ts
graph.group: THREE.Group // add this to your scene; owns the node mesh + link lines
```

### 方法

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

每个节点一个 `InstancedMesh`（每实例颜色和 `∛val` 成比例的半径），外加每个链接一个 `LineSegments`，两者都在单个 `THREE.Group` 下 —— 实例化的全部意义在于图规模恰好花费**两次绘制调用**，无论图有 10 个节点还是 10,000 个。`Graph3D` 消费任何 [`GraphLayout`](/reference/graph3d-layout/) 形状的位置缓冲区，并且不知道这些数字是如何计算的，这正是让布局可交换（或 worker 托管）而无需触碰渲染代码的原因。

链接线设置 `frustumCulled = false` —— 端点在每个布局 tick 移动，对于通常是背景元素的东西每帧重新计算边界与总是直接绘制它们相比是浪费的工作。

## 拾取（悬停 / 点击）

自 0.2.0 起，`pickNode()` **仅**命中测试节点云，因此你不再需要针对混合的节点/链接子元素手写 `intersectObjects` + `instanceId` 过滤。从相机和指针 NDC 配置一个 `THREE.Raycaster`，然后读回被击中的节点索引（与 `GraphData.nodes` 对齐）：

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

## `GraphInteraction` —— 悬停 / 选择 / 拖拽固定

自 0.2.0 起，`GraphInteraction` 将上面的指针管道包装成悬停、选择和拖拽固定 —— 每个交互式 3D 图应用本应手工重建的部分。它在 `domElement` 上拥有三个指针监听器，别无其他：没有场景，没有渲染循环，没有控件。宿主继续驱动它自己的动画循环和布局 `step()`。

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

拖拽是**特性检测的**：没有一个具备固定能力的布局（一个 `pinNode` 实现，如 [`D3ForceLayout`](/reference/graph3d-layout/) 所提供），按压会回退到选择。`onDragStart`/`onDrag`/`onDragEnd`、`pinOnDrag`（默认 `true`）、`dragReheat`（默认 `0.3`）和 `dragThreshold`（默认 `4` px）补全了选项。

## 相关

[`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/)（产生此项消费的 `positions` 缓冲区，以及 `pinNode` 拖拽固定所依赖的）·
[`@vectojs/graph3d` 概述](/reference/graph3d/)
