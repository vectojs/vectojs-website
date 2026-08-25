+++
title = "@vectojs/knowledge-graph/model"
description = "渲染器中立、分页的知识图谱物化，具备取消、去重、快照和可选布局热启动。"
weight = 46
+++

# `@vectojs/knowledge-graph/model`

记录的版本：**0.4.0**

`KnowledgeGraphModel` 拥有一个更大知识图谱的有界、物化切片。它从一个 `KgDataSource` 加载种子实体和邻居页，对实体和事实去重，跟踪每个节点的展开进度，并为渲染器暴露稳定的 `GraphData`。它不创建 DOM、canvas、Three.js 场景或动画计时器。

当宿主只需要数据和模型状态时，导入渲染器中立的入口点：

```ts
import {
  KnowledgeGraphModel,
  MemoryDataSource,
  type KgDataSource,
} from '@vectojs/knowledge-graph/model';
```

包的根也会导出该模型，但它包含包的会话和面向渲染的表面。`/model` 子路径是明确的无头边界。

## 数据源约定

```ts
type NodeId = string | number;

interface KgNeighborOptions {
  limit?: number;
  cursor?: string;
  direction?: 'out' | 'in' | 'both';
  signal?: AbortSignal;
}

interface KgNeighborhood {
  entity?: KgEntity;
  facts: readonly KgFact[];
  neighbors: readonly KgEntity[];
  total?: number;
  nextCursor?: string;
  hasMore?: boolean;
}

interface KgDataSource {
  getNodes(ids?: readonly NodeId[]): readonly KgEntity[] | Promise<readonly KgEntity[]>;
  getNeighbors(id: NodeId, options?: KgNeighborOptions): KgNeighborhood | Promise<KgNeighborhood>;
}
```

将 `cursor` 视为不透明。数据源应应用 `limit`、遵循 `direction`、将提供的中止信号传递给下游工作，并在存在另一页时返回 `nextCursor` 加 `hasMore`。`total` 是可选的，描述该节点展开可用的总事实数，而不仅仅是当前页。当 `direction: "both"` 时，源与目标为同一节点的事实每页只列出一次，不会重复列出。

`entity` 是可选的：不知道所请求 id 的数据源可以返回不含它的邻域，模型会让该次展开以一个明确的错误失败，而不是永久摄入一个伪造的占位节点。

`MemoryDataSource` 为测试和小型内存图实现此约定。它的游标是带版本戳的偏移量（`<version>:<offset>`），因此在分页中途调用 `load()` 会使未完成的游标显著失效——它们会抛出异常，而不是悄悄切分出另一份事实列表。邻居查找是 `O(degree)`，无效游标会抛出异常。

## 创建与展开模型

```ts
const source = new MemoryDataSource({ entities, facts });
const model = new KnowledgeGraphModel({
  source,
  pageSize: 100,
  direction: 'both',
  lang: 'en',
});

await model.bootstrap(['vectojs'], false);

let result = await model.expand('vectojs');
while (result.state.status === 'partial') {
  result = await model.expand('vectojs');
}

draw(model.getGraphData());
```

`bootstrap(focusIds, expandSeeds = true)` 首先解析焦点实体。使用默认的第二个参数时，它随后按一页顺序展开每个种子。当宿主想要对分页进行显式控制时，传入 `false`。

每次 `expand(id)` 恰好加载下一页。对同一 ID 的并发调用共享一个 promise，而不同的 ID 可以独立加载。已完成的展开会立即解析而不再调用数据源。实体按 ID 去重并合并，包括它们的标签映射。事实按有序的 `(source, predicate, target)` 三元组去重。

## 展开状态

```ts
type ExpansionStatus = 'idle' | 'loading' | 'partial' | 'complete' | 'failed' | 'cancelled';

interface ExpansionState {
  status: ExpansionStatus;
  loaded: number;
  total?: number;
  cursor?: string;
  hasMore?: boolean;
  error?: unknown;
}
```

使用 `getExpansionState(id)` 读取一个防御性副本。`loaded` 按批次统计送达的每一条事实，因此当邻域在各页之间重叠时分页进度不会停滞。`partial` 表示还有另一页可用；调用 `expand(id)` 会从其存储的游标恢复。

`cancelExpand(id)` 中止活动请求并将其标记为 `cancelled`。数据源必须遵循 `options.signal`，取消才能停止其底层 I/O。之后的 `expand(id)` 会从最后完成的游标恢复。数据源失败会将状态标记为 `failed`，保留先前的进度，并拒绝该 promise；之后的调用会从同一游标重试。

## 读取与持久化状态

```ts
model.entityCount;
model.factCount;
model.listEntities();
model.listFacts();
model.getGraphData();

const snapshot = model.exportSnapshot();
model.importSnapshot(snapshot);
```

`listEntities()` 和 `listFacts()` 返回适合应用检查的副本。`getGraphData()` 按稳定的实体顺序返回模型当前的渲染器输入。将该图视为只读；当物化切片改变时它会被替换。

快照是带版本的。版本 1 存储实体、事实和可恢复的展开元数据，但不存储进行中的请求或错误对象。导入快照会中止当前请求并忽略它们的最终完成。不支持的快照版本会在替换之前抛出异常。

## 可选的布局集成

`KnowledgeGraphModelOptions.layout` 接受来自 `@vectojs/graph3d` 的 XYZ `GraphLayout` 约定。模型是唯一的布局驱动者：每次物化重建都会调用一次 `layout.setGraph()`，按节点 ID 保留有限的 XYZ 位置作为热启动，并在布局暴露 `reheat()` 时在加载一页后重新加热。热启动位置在布局稳定时（以及重建时）捕获，而不是每个热帧都捕获。

在需要保留最新布局坐标的外部操作之前调用 `captureLayoutPositions()`。这个可选约定是三维的：不要直接传入来自 `@vectojs/graph-layout` 的 XY `ForceLayout2D`。2D 渲染器可以省略 `layout`，并在 `getGraphData()` 上运行自己的渲染器中立布局。注意该约定按节点**索引**固定，而 2D `ForceLayout2D` 按节点 ID 固定——跨栈迁移时请转换固定方式。

## 销毁

`dispose()` 中止活动请求并释放物化状态。它是幂等的。之后需要活跃模型的方法会抛出 `KnowledgeGraphModel is disposed`；迟到的异步完成无法重新填充已销毁或已快照替换的状态。所有权归创建者：模型只是借用其可选布局，因此销毁模型不会杀掉仍与活跃会话共享的布局——谁构造了布局，谁就负责销毁它。

## 会话层保证

包根目录还导出 `KnowledgeGraphSession`，它由模型驱动一个渲染器。其行为约定与模型的保持一致：

- **每个进行中的 id 只有一次展开。** 对展开请求仍在途的节点重复选择，会被进行中的门闩吞掉，而不是为一次网络请求对每次点击都触发 `onExpand`/`onError`。
- **错误可被观察。** 由选择触发的展开失败会路由到 `onError(error, entity)` 选项（带回退到 `console.error`），绝不会作为未处理的 rejection 逃逸；会话销毁后异步延续即停止。
- **未知 id 显式失败。** 展开任何数据源都不认识的 id 会以明确的错误失败，而不是物化出一个幽灵实体。

## 复杂度

对于具有 `N` 个实体和 `E` 条唯一事实的物化切片，模型存储为 `O(N + E)`。摄入一页对于 `P` 条返回记录为期望 `O(P)`，然后重建渲染器数据为 `O(N + E)` 加上所提供布局的 `setGraph()` 成本。快照导出和导入为 `O(N + E)`。该模型有意只物化已加载的页；源图的总大小并不决定其常驻内存。

## 相关

用于渲染器无关 2D 物理的 [`@vectojs/graph-layout`](/reference/graph-layout/) ·
用于可选 XYZ 布局约定的 [`GraphLayout` 与 3D 布局实现](/reference/graph3d-layout/) ·
用于 3D 渲染的 [`@vectojs/graph3d`](/reference/graph3d/)
