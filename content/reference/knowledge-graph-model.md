+++
title = "@vectojs/knowledge-graph/model"
description = "Renderer-neutral, paginated knowledge-graph materialization with cancellation, deduplication, snapshots, and optional layout warm starts."
weight = 46
+++

# `@vectojs/knowledge-graph/model`

Version documented: **0.3.2**

`KnowledgeGraphModel` owns a bounded, materialized cut of a larger knowledge
graph. It loads seed entities and neighbor pages from a `KgDataSource`,
deduplicates entities and facts, tracks expansion progress per node, and exposes
stable `GraphData` for a renderer. It creates no DOM, canvas, Three.js scene, or
animation timer.

Import the renderer-neutral entry point when the host needs only data and model
state:

```ts
import {
  KnowledgeGraphModel,
  MemoryDataSource,
  type KgDataSource,
} from '@vectojs/knowledge-graph/model';
```

The package root also exports the model, but it includes the package's session
and rendering-facing surface. The `/model` subpath is the explicit headless
boundary.

## Data-source contract

```ts
type NodeId = string | number;

interface KgNeighborOptions {
  limit?: number;
  cursor?: string;
  direction?: 'out' | 'in' | 'both';
  signal?: AbortSignal;
}

interface KgNeighborhood {
  entity: KgEntity;
  facts: readonly KgFact[];
  neighbors: readonly KgEntity[];
  total?: number;
  nextCursor?: string;
  hasMore?: boolean;
}

interface KgDataSource {
  getNodes(ids?: readonly NodeId[]): readonly KgEntity[] | Promise<readonly KgEntity[]>;
  getNeighbors(id: NodeId, options?: KgNeighborOptions): KgNeighborhood | Promise<KgNeighborhood>;
  getLabels?(
    ids: readonly NodeId[],
    lang?: string,
  ): ReadonlyMap<NodeId, string> | Promise<ReadonlyMap<NodeId, string>>;
}
```

Treat `cursor` as opaque. A source should apply `limit`, honor `direction`, pass
the supplied abort signal to downstream work, and return `nextCursor` plus
`hasMore` when another page exists. `total` is optional and describes the total
facts available for that node expansion, not merely the current page.

`MemoryDataSource` implements this contract for tests and small in-memory
graphs. Its cursors are decimal offsets, neighbor lookup is `O(degree)`, and an
invalid cursor throws.

## Creating and expanding a model

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

`bootstrap(focusIds, expandSeeds = true)` first resolves the focus entities.
With the default second argument, it then expands each seed serially by one
page. Pass `false` when the host wants explicit control over paging.

Each `expand(id)` loads exactly the next page. Concurrent calls for the same ID
share one promise, while different IDs can load independently. A completed
expansion resolves immediately without another source call. Entities are
deduplicated by ID and merged, including their label maps. Facts are
deduplicated by the ordered `(source, predicate, target)` triple.

## Expansion state

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

Read a defensive copy with `getExpansionState(id)`. `loaded` is the number of
accepted page facts reported across that expansion. `partial` means another
page is available; calling `expand(id)` resumes from its stored cursor.

`cancelExpand(id)` aborts the active request and marks it `cancelled`. The data
source must honor `options.signal` for cancellation to stop its underlying I/O.
A later `expand(id)` resumes from the last completed cursor. A source failure
marks the state `failed`, preserves prior progress, and rejects the promise; a
later call retries from that same cursor.

## Reading and persisting state

```ts
model.entityCount;
model.factCount;
model.listEntities();
model.listFacts();
model.getGraphData();

const snapshot = model.exportSnapshot();
model.importSnapshot(snapshot);
```

`listEntities()` and `listFacts()` return copies suitable for application
inspection. `getGraphData()` returns the model's current renderer input in
stable entity order. Treat that graph as read-only; it is replaced when the
materialized cut changes.

Snapshots are versioned. Version 1 stores entities, facts, and resumable
expansion metadata, but not an in-flight request or an error object. Importing a
snapshot aborts current requests and ignores their eventual completions. An
unsupported snapshot version throws before replacement.

## Optional layout integration

`KnowledgeGraphModelOptions.layout` accepts the XYZ `GraphLayout` contract from
`@vectojs/graph3d`. When supplied, each materialization rebuild calls
`layout.setGraph()`, preserves finite XYZ positions by node ID as warm starts,
and reheats after a loaded page when the layout exposes `reheat()`.

Call `captureLayoutPositions()` before an external operation that needs the
latest layout coordinates retained. This optional contract is three-dimensional:
do not pass the XY `ForceLayout2D` from `@vectojs/graph-layout` directly. A 2D
renderer can omit `layout` and run its own renderer-neutral layout over
`getGraphData()`.

## Disposal

`dispose()` aborts active requests, disposes the optional layout, and releases
materialized state. It is idempotent. Methods that require a live model throw
`KnowledgeGraphModel is disposed` afterward; late async completions cannot
repopulate disposed or snapshot-replaced state.

## Complexity

For a materialized cut with `N` entities and `E` unique facts, model storage is
`O(N + E)`. Ingesting a page is expected `O(P)` for `P` returned records, then
rebuilding renderer data is `O(N + E)` plus the supplied layout's `setGraph()`
cost. Snapshot export and import are `O(N + E)`. The model intentionally
materializes only loaded pages; total source-graph size does not determine its
resident memory.

## Related

[`@vectojs/graph-layout`](/reference/graph-layout/) for renderer-independent 2D
physics · [`GraphLayout` and 3D layout implementations](/reference/graph3d-layout/)
for the optional XYZ layout contract · [`@vectojs/graph3d`](/reference/graph3d/)
for 3D rendering
