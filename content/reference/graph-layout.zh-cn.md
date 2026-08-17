+++
title = "@vectojs/graph-layout"
description = "渲染器无关、零依赖的 2D 力布局，具备 Barnes-Hut 斥力、增量拓扑更新、碰撞处理和运行时固定。"
weight = 47
+++

# `@vectojs/graph-layout`

记录的版本：**0.2.1**

`@vectojs/graph-layout` 是一个零依赖的 2D 力模拟。它不拥有渲染器，也没有动画计时器：宿主提供图数据、调用 `step()`，并从 `Float32Array` 读取交错的 XY 坐标。同一个布局可以驱动 Canvas 2D、SVG、WebGL、WebGPU、VectoJS 场景，或主线程之外的渲染器。

0.2.1 版本只有一个实现，即 TypeScript 的 `ForceLayout2D`。0.2.1 中没有 WASM 构建、替代后端或 `backend` 选项。WASM 仍然是一个受测量门控的未来选项；当前的跨维度浏览器对比并不是 WASM 后端会有帮助的直接证据。

## 安装

```bash
bun add @vectojs/graph-layout
```

该包没有运行时或渲染器 peer 依赖。

## Canvas 2D 示例

此示例使用任意的字符串 ID，并通过布局解析它们当前的位置索引。数值 ID 也是标识符；不要假设数值 ID 等于其当前的节点索引。

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

`step()` 是同步的。它在模拟仍然活跃时返回 `true`，在冷却到 `alphaMin` 以下（或图为空）后返回 `false`。返回值说明物理是否需要另一次 tick；它并不说明你的应用是否应继续为相机移动、输入或其他动画渲染。`alphaDecay: 0` 会禁用冷却，因此非空模拟不会自行稳定下来。

## 公共类型

该包从其根导出以下类型和 `ForceLayout2D`：

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

额外的节点和链接字段仍归应用所有。布局不会修改输入记录。

## 选项

| 选项                   |       默认 | 含义                                                               |
| ---------------------- | ---------: | ------------------------------------------------------------------ |
| `repulsion`            |      `300` | 每节点非负的多体斥力大小。                                         |
| `collisionRadius`      |        `0` | 每节点非负半径。两个零半径节点不会分离。                           |
| `collisionStrength`    |        `1` | 非负的碰撞修正乘数。零会禁用碰撞修正。                             |
| `linkDistance`         |       `30` | 每链接非负的静止长度。                                             |
| `linkStrength`         |      `0.3` | 每链接非负的弹簧刚度。                                             |
| `centerStrength`       |     `0.02` | 朝原点的非负拉力。                                                 |
| `velocityDecay`        |      `0.6` | 每 tick 的速度保留率，钳制在 `1` 以下。                            |
| `theta`                |      `0.9` | 非负的 Barnes-Hut 开角。较低的值以速度换取精度；`0` 执行精确遍历。 |
| `repulsionDistanceMax` | `Infinity` | 节点相互排斥的最大距离。`0` 禁用斥力；非有限值禁用截止。           |
| `alphaDecay`           |   `0.0228` | 每 tick 的温度衰减，钳制到 `[0, 1]`。                              |
| `alphaMin`             |    `0.001` | 非负温度，低于此温度模拟稳定。                                     |
| `seed`                 |        `1` | 对没有有限初始坐标的节点的确定性种子。                             |

非有限的选项值会回退到其默认值。文档标注为非负的值会在零处钳制。节点和链接的访问器在每个记录被接受进布局时求值一次，而不是每个 tick。节点访问器索引是插入索引。链接访问器索引是跨仅追加分页的稳定、连续索引。移除节点会压缩链接，因此之后的追加可以复用之前分配给已移除链接的索引。移除节点不会为幸存者重新求值访问器；如果值必须重新推导，请使用全新的 `setGraph()`。所有选项都仅限构造函数；0.2.1 中没有实时力 setter。

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

### 位置与步进

`positions` 以当前节点顺序包含 `[x0, y0, x1, y1, ...]`。它是一个实时视图：布局在 `step()` 调用之间就地更新其值。当你需要不可变快照时，调用 `layout.positions.slice()`。

该视图对象在拓扑边界之间并不稳定。在 `setGraph()`、`appendGraph()` 或 `removeNodes()` 之后始终重新获取 `layout.positions`；追加超过内部容量也会重新分配底层存储。移除后节点索引可能改变，因为幸存者被压缩且保持相对顺序。

使用 `getNodeIndex(id)` 将 ID 解析为其当前索引，使用 `getNodeId(index)` 进行反向查找。当没有当前节点匹配时，两者都返回 `undefined`。`getNodeIds()` 返回按当前位置顺序的快照；修改该数组不会影响布局。现有索引在仅追加更新之间保持稳定，而移除会压缩幸存者。

`step(iterations = 1)` 最多执行那么多次同步 tick，并在 alpha 之后仍至少为 `alphaMin` 时返回 `true`。它在冷却时提前停止。非正或非有限的迭代次数不执行任何 tick，并报告当前的活跃状态；次数会向下取整并在每次调用时上限为 10,000。

### 替换、追加与移除节点

`setGraph(data)` 替换所有状态，确定性地为新图播种，并将 alpha 设为 `1`。每个节点 ID 必须是字符串或有限数字且必须唯一；无效或重复的 ID 会在现有图被清除之前抛出异常。

`appendGraph(data)` 保留现有的位置、速度和固定。ID 无效、已存在或在该追加中重复的节点会被忽略，这使得重放的页是幂等的。被接受的节点按输入顺序追加。被接受的链接可以指向现有节点或同一次调用中被接受的节点。拓扑更改会单调地重新加热：它可以提升 alpha，但绝不会降低已经热起来的模拟。

链接通过有向端点对加可选 `id` 实现重放安全：

- 没有 `id` 时，重复的 `source` 到 `target` 链接是同一个链接。
- 方向很重要：`a` 到 `b` 与 `b` 到 `a` 具有不同的身份。
- 平行链接需要不同的字符串或有限数字 ID。
- 重放一个已识别的链接会被忽略。
- 端点未知或源与目标相同的链接会被忽略。
- 格式错误的可选链接 ID 在身份判定中被视为不存在。

当端点有效时，可选 ID 格式错误的链接仍会作为未识别链接进入；未知端点和自环链接不会进入力数组。格式错误的链接数据不会使位置变为非有限。
`removeNodes(ids)` 移除匹配的节点和每条关联链接，压缩幸存者状态，重新计算度数偏置，并在移除掉某些东西时重新加热。未知 ID 和空的可迭代对象是无操作。

### 移除与更新链接

`removeLinks(items)` 移除链接而不改变任何节点索引、位置、速度或固定。传入完整链接以匹配其有向端点加可选 ID，或传入裸的 `LinkId` 以移除携带该 ID 的每条已识别链接。幸存的链接保留其顺序和缓存的访问器值。未知和已移除的身份是无操作。成功的批处理会重新计算链接度数偏置并重新加热一次。

`updateLinks(links)` 为匹配的现有身份重新求值 `linkDistance` 和 `linkStrength` 访问器。在更改由这些访问器消费的应用自有链接字段后使用它。完整的批次会先被验证：未知或相同端点会抛出异常而不应用任何更新。尚不存在的身份会被忽略。因为端点参与链接身份，改道需要先 `removeLinks()` 再 `appendGraph()`。未更改的值不会重新加热模拟。

### 固定与重新加热

有限的初始 `fx` 和 `fy` 值会独立地固定轴。因此，一个节点可以 X 固定而 Y 自由、Y 固定而 X 自由，或两个轴都固定。初始 `x` 和 `y` 只为它们对应的未固定轴播种。

在运行时，`setNodePin(index, { x?, y? })` 仅固定提供的轴，立即更新那些实时坐标，并清除它们的速度。`clearNodePin(index, { x?, y? })` 释放选定的轴同时保留另一个轴；省略 axes 对象会释放两者。`pinNode(index, x, y)` 和 `unpinNode(index)` 仍是双轴的便捷方法。无效索引会被忽略。这些调用不会自动重新加热，因此请在交互式固定或解除固定操作后调用 `reheat()`。

`reheat(alpha = 0.3)` 将请求钳制到 `[alphaMin, 1]` 并应用 `max(currentAlpha, requestedAlpha)`。它绝不会冷却更热的模拟。

### 拖拽节点：只重新加热一次，而不是每次移动

与拖拽相关的最常见缺陷是：在拖拽一个固定节点时，**每次指针移动**都调用 `reheat()`。这会让 alpha 一直钉在接近其最大值处，因此被拖拽节点的邻居 —— 被它们的链接弹簧猛拉 —— 会几乎无阻尼地持续过冲。指针释放后，模拟需要几秒钟才能冷却（alpha 以约 `alphaDecay` 每 tick 衰减，在 60 fps 下约 300 tick ≈ 5 秒），在此期间整个邻域会明显地振动。当每个节点渲染文本标签时，这种快速振荡会表现为抖动和残影/拖影。

正确的模式是仅在拖拽_开始_时重新加热，然后在每次移动时更新固定位置而不重新加热：

```ts
function onDragStart(node, x, y) {
  const index = layout.getNodeIndex(node.id);
  layout.setNodePin(index, { x, y }); // pin at the pointer
  layout.reheat(0.3); // wake the simulation ONCE
}

function onDragMove(node, x, y) {
  const index = layout.getNodeIndex(node.id);
  layout.setNodePin(index, { x, y }); // move the pin — no reheat here
}

function onDragEnd(node) {
  const index = layout.getNodeIndex(node.id);
  layout.clearNodePin(index); // or keep it pinned for a permanent pin
}
```

如果在拖拽_期间_希望有缓慢漂移的跟随效果，请提高 `velocityDecay`（更多阻尼），而不是每次移动都重新加热；将 `reheat()` 保留给拓扑更改、显式唤醒和拖拽开始。

### 销毁

`dispose()` 释放图和四叉树存储，将 `positions` 重置为空数组，并且是幂等的。销毁后，每个其他方法都会抛出 `ForceLayout2D was disposed`；请创建新实例，而不是尝试复用旧实例。

## 复杂度与容量

对于 `N` 个节点和 `E` 条被接受的链接，一次正常 tick 会构建 Barnes-Hut 四叉树并以期望的 `O(N log N)` 求值斥力，以 `O(E)` 应用弹簧，并以 `O(N)` 进行清理、向心和积分。因此无碰撞时的通常 tick 成本是 `O(N log N + E)`。这不是最坏情况的承诺：病态的空间分布或 `theta: 0` 可能接近全对工作量。

当启用碰撞时，布局会在预测位置上第二次构建四叉树并执行半径邻域查询。稀疏、局部有界的邻域通常接近 `O(N log N + K)`，其中 `K` 是候选/重叠工作量，但密集簇或非常大的半径可能使 `K` 变为二次方。碰撞并不从 Barnes-Hut 斥力继承无条件的 `O(N log N)` 界。

`setGraph()` 为 `O(N + E)`，此外还有几何容量分配和初始化。`appendGraph()` 与被追加的输入成比例，并在接受链接时加上 `O(N + E)` 的度数偏置重算。`removeLinks()` 仅压缩链接存储，当请求为完整链接时为 `O(E + R)`，在最坏情况下当 `R` 个裸 ID 各自扫描所有链接时为 `O(E + RE)`。`updateLinks()` 对 `U` 次更新为 `O(E + U)`。存储呈几何增长，因此大多数小追加会复用容量；增长边界会在 `O(N + E)` 时间内复制现有的类型数组。`removeNodes()` 压缩节点和链接，并以 `O(N + E)` 重算偏置。移除不会缩减容量。

## 实测的浏览器证据

一次在度数偏置之后的带界面的浏览器诊断运行，对每行十个 tick 样本测量了以下 p95 主线程 tick 时间：

| 3,000 节点工作负载 | Chrome 151 | Firefox 153 |
| ------------------ | ---------: | ----------: |
| 星形/枢纽          |   10.60 ms |     7.84 ms |
| 混合稀疏           |    8.09 ms |     7.28 ms |

在四个浏览器/工作负载行中，追加一个 50 节点的页测得 **0.145-0.355 ms**。每个追加行都有一个拓扑变更样本，因此这个范围是诊断性证据，而不是尾部延迟估计。这些测量来自任务运行器硬件和软件环境中的一次带界面运行，不是可移植的保证。浏览器调度、硬件、电源状态、后台负载、图几何、选项、预热和样本构造都会影响结果。它们是每操作的延迟证据，而非 FPS 测量；不能从中推导出任何 FPS 声明。

## 从 `d3-force` 迁移

概念上的映射是直接的，但 API 有意地更小：

| `d3-force`                                      | `@vectojs/graph-layout`                                |
| ----------------------------------------------- | ------------------------------------------------------ |
| `simulation.nodes(nodes)` 和 `forceLink(links)` | `layout.setGraph({ nodes, links })`                    |
| `simulation.tick(k)`                            | `layout.step(k)`                                       |
| 修改后的节点 `x`/`y` 字段                       | 交错的 `layout.positions` XY 视图                      |
| `simulation.alpha(value).restart()`             | `layout.reheat(value)` 外加宿主调度的帧                |
| `node.fx` / `node.fy` 修改                      | 初始 `fx`/`fy`，然后 `setNodePin()` / `clearNodePin()` |
| d3 的内部计时器                                 | 无计时器；宿主拥有调度                                 |

链接使用端点 ID 而非 d3 修改过的端点对象。选项访问器接收原始的 `GraphNode` 或 `GraphLink` 和一个插入索引，然后被缓存。0.2.1 中没有自定义力注册表；如果你的 d3 布局依赖自定义力或实时力 setter，请保留 d3-force 或用新选项重建布局。

## 2D 与 `@vectojs/graph3d` 的对比

对于渲染器无关的 **2D** 物理和交错的 XY 对，请使用此包。[`@vectojs/graph3d`](/reference/graph3d/) 提供独立的 3D 布局实现（`D3ForceLayout` 和 `VectoForceLayout`）和一个 Three.js 渲染器；它的位置是 XYZ 三元组，且它的图/布局类型不可与 `ForceLayout2D` 互换。尽管两个 API 都使用宿主调用的 `step()` 来报告模拟工作是否仍存在，但不要把此包的 XY 缓冲区传给需要 XYZ 数据的 `Graph3D.applyPositions()`。

## 相关

用于 3D 布局和渲染的 [`@vectojs/graph3d`](/reference/graph3d/) ·
[`GraphLayout` 与 3D 布局实现](/reference/graph3d-layout/)
