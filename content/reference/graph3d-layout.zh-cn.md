+++
title = "GraphLayout & D3ForceLayout"
description = "图数据模型和 worker 友好的 GraphLayout 约定，外加其基于 d3-force-3d 的 D3ForceLayout 实现。"
weight = 45
+++

# `GraphLayout` & `D3ForceLayout`

属于 [`@vectojs/graph3d`](/reference/graph3d/)。

## 数据模型 —— `GraphData`

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

节点对象从不被布局或渲染器改变 —— 任意额外属性（标签、类别、仅由你自己的代码使用的权重）原样通过，因此 `GraphData` 兼作你应用自己的图模型，而不是一个你需要转入转出的格式。

## `GraphLayout` —— 布局约定

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

该约定刻意保持最小化且 worker 友好：位置是一个扁平的 `Float32Array`，按 `GraphData.nodes` 顺序排列 xyz 三元组，因此一个实现可以完全存在于 Web Worker 内部，并将其缓冲区作为可传输对象跨线程边界流式传输，无需每节点对象流量。[`Graph3D.applyPositions()`](/reference/graph3d-renderer/#方法) 直接消费那个完全相同的缓冲区形状。`positions` 是跨步进重用的**同一个数组实例** —— 如果你需要稳定的快照而非实时视图，请复制它（`layout.positions.slice()`）。

`@vectojs/graph3d` 今天提供两个实现：下面的 [`D3ForceLayout`](#d3forcelayout) 和自研的 [`VectoForceLayout`](#vectoforcelayout)（Barnes–Hut，无 d3 依赖）—— 另外还有 DAG 布局模式在包的路线图上，全都在这同一个接口之后，因此渲染器或 worker 宿主永远无需知道哪一个在运行。

## `D3ForceLayout`

```ts
new D3ForceLayout(options?: D3ForceLayoutOptions)

interface D3ForceLayoutOptions {
  linkDistance?: number;   // target resting length of links. Default 30.
  chargeStrength?: number; // many-body (charge) strength; negative repels. Default -30.
  alphaMin?: number;       // alpha threshold below which step() reports cooled. Default 0.001.
}
```

适配 [d3-force-3d](https://github.com/vasturiano/d3-force-3d) —— `3d-force-graph` 背后的同一引擎 —— 因此图的调优过的力可以带着完好的手感迁移。在 3 维中运行 `forceLink` + `forceManyBody` + `forceCenter`。

d3 模拟改变它自己的节点记录（`x`/`y`/`z`/`vx`/…），因此 `setGraph` 将每个节点克隆到一个内部模拟记录中，而不是直接把你的 `GraphData.nodes` 对象交给它 —— 只有声明的 `fx`/`fy`/`fz` 固定被携带过来。模拟自己的计时器从不启动；`step(iterations = 1)` 同步地推进它，这正是让 `D3ForceLayout` 在 Web Worker 内部可用而无需伪造 `requestAnimationFrame` 的原因。

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

自研布局（0.3.0 新增）：一种力导向模拟，多体项使用 Barnes–Hut 八叉树 —— 无 d3 依赖，在 `seed` 下可确定，且可在 Web Worker 内安全运行（与 `D3ForceLayout` 相同的 `step(iterations)` 约定）。当你想在多次运行中获得相同结果时选择它；用 `repulsion`/`linkStrength` 调优，并谨慎地将 `alphaDecay` 提升到零以上 —— 它已经接近冷却边缘，因此更高的值会让图更早而不是更晚冻结。

```ts
layout.step(); // one tick
layout.step(5); // 5 ticks in one call — cheaper per-frame amortization
// for graphs whose visual settle time matters more
// than per-tick smoothness
```

**固定（自 0.2.0 起）。** `D3ForceLayout` 在 d3-force 的 `fx`/`fy`/`fz` 之上实现可选的固定控件，这正是驱动 [`GraphInteraction`](/reference/graph3d-renderer/#graphinteraction--悬停--选择--拖拽固定) 的拖拽固定的原因：

```ts
layout.pinNode(i, x, y, z); // clamp node i to (x,y,z) every tick; also updates positions[i] now
layout.reheat(0.3); // wake a cooled sim so the rest settles around the pin
layout.unpinNode(i); // clear fx/fy/fz — node i is free again
```

超出范围的索引被忽略（陈旧的指针交互无法使布局崩溃），并且 `reheat` 的 alpha 被钳制到 d3 通常的 `[alphaMin, 1]` 范围。

**实时更改力。** `D3ForceLayoutOptions` 仅限构造函数；没有实时 setter。要应用新的 `chargeStrength`/`linkDistance`（例如来自滑块），`dispose()` 旧实例并 `setGraph()` 一个新的 —— 对于拓扑本身不变的图来说很廉价，因为只有模拟被重建，而非 `Graph3D` 的 GPU 缓冲区：

```ts
function restartLayout() {
  layout.dispose();
  layout = new D3ForceLayout({ chargeStrength, linkDistance });
  layout.setGraph(data);
}
```

## 相关

[`Graph3D` 与拾取](/reference/graph3d-renderer/)（直接消费 `positions`）·
[`@vectojs/graph3d` 概述](/reference/graph3d/)
