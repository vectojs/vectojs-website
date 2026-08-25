+++
title = "@vectojs/knowledge-graph/model"
description = "與渲染器無關、分頁的知識圖形具體化，具備取消、去重、快照和選用的佈局暖啟動。"
weight = 46
+++

# `@vectojs/knowledge-graph/model`

文件版本：**0.4.0**

`KnowledgeGraphModel` 擁有一個較大知識圖形的有界、已具體化切片。它從 `KgDataSource` 載入種子實體和鄰居分頁，去重實體和事實，追蹤每個節點的擴充進度，並為渲染器公開穩定的 `GraphData`。它不會建立任何 DOM、canvas、Three.js 場景或動畫計時器。

當主機只需要資料和模型狀態時，請匯入與渲染器無關的入口點：

```ts
import {
  KnowledgeGraphModel,
  MemoryDataSource,
  type KgDataSource,
} from '@vectojs/knowledge-graph/model';
```

套件根目錄也匯出該模型，但它包含套件面向工作階段和渲染的表面。`/model` 子路徑是明確的無頭邊界。

## 資料來源合約

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

請將 `cursor` 視為不透明。來源應套用 `limit`、遵守 `direction`、將提供的放棄訊號傳遞給下游工作，並在存在另一個分頁時返回 `nextCursor` 加上 `hasMore`。`total` 是可選的，描述該節點擴充可用的總事實數，而不只是目前的分頁。當 `direction: "both"` 時，來源與目標為同一節點的事實在每個分頁中只列出一次，不會重複。

`entity` 是可選的：不知道所請求 id 的來源可以返回不含它的鄰域，模型會讓該次擴充以一個明確的錯誤失敗，而不是永久攝入偽造的佔位節點。

`MemoryDataSource` 為測試和小型記憶體圖形實作此合約。其游標是帶版本戳的偏移量（`<version>:<offset>`），因此在分頁中途呼叫 `load()` 會讓未完成的游標明確失效——它們會拋出錯誤，而不是默默切片出另一份事實清單。鄰居查詢是 `O(degree)`，無效的游標會拋出錯誤。

## 建立與擴充模型

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

`bootstrap(focusIds, expandSeeds = true)` 首先解析焦點實體。使用預設的第二個引數時，它接著以每次一個分頁的方式序列地擴充每個種子。當主機想要明確控制分頁時，傳入 `false`。

每個 `expand(id)` 恰好載入下一個分頁。對相同 ID 的並行呼叫會共享一個 promise，而不同的 ID 可以獨立載入。已完成的擴充會立即解析，不再進行另一次來源呼叫。實體按 ID 去重並合併，包括其標籤映射。事實按有序的 `(source, predicate, target)` 三元組去重。

## 擴充狀態

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

使用 `getExpansionState(id)` 讀取防禦性副本。`loaded` 會按批次統計送達的每一條事實，因此當鄰域在各分頁之間重疊時，分頁進度不會停滯。`partial` 表示有另一個分頁可用；呼叫 `expand(id)` 會從其儲存的游標繼續。

`cancelExpand(id)` 中止活躍的請求並將其標記為 `cancelled`。資料來源必須遵守 `options.signal`，取消才會停止其底層 I/O。稍後的 `expand(id)` 會從最後完成的游標繼續。來源失敗會將狀態標記為 `failed`、保留先前的進度，並拒絕該 promise；稍後的呼叫會從同一個游標重試。

## 讀取與保存狀態

```ts
model.entityCount;
model.factCount;
model.listEntities();
model.listFacts();
model.getGraphData();

const snapshot = model.exportSnapshot();
model.importSnapshot(snapshot);
```

`listEntities()` 和 `listFacts()` 返回適合應用程式檢查的副本。`getGraphData()` 以穩定的實體順序返回模型目前的渲染器輸入。請將該圖形視為唯讀；它會在具體化的切片變更時被取代。

快照具有版本控制。版本 1 儲存實體、事實和可繼續的擴充中繼資料，但不儲存進行中的請求或錯誤物件。匯入快照會中止目前的請求並忽略它們最終的完成。不支援的快照版本會在取代之前拋出錯誤。

## 選用的佈局整合

`KnowledgeGraphModelOptions.layout` 接受來自 `@vectojs/graph3d` 的 XYZ `GraphLayout` 合約。模型是唯一的佈局驅動者：每次具體化重建都會呼叫一次 `layout.setGraph()`，按節點 ID 保留有限的 XYZ 位置作為暖啟動，並在載入分頁後、當佈局公開 `reheat()` 時重新加熱。暖啟動位置在佈局穩定時（以及重建時）擷取，而不是每個熱帧都擷取。

在需要保留最新佈局座標的外部操作之前呼叫 `captureLayoutPositions()`。這個選用合約是三維的：請勿直接傳入來自 `@vectojs/graph-layout` 的 XY `ForceLayout2D`。2D 渲染器可以省略 `layout`，並在 `getGraphData()` 上執行自己的、與渲染器無關的佈局。請注意此合約按節點**索引**固定，而 2D `ForceLayout2D` 按節點 ID 固定——跨堆疊移植時請轉換固定方式。

## 處置

`dispose()` 中止活躍的請求並釋放已具體化的狀態。它是冪等的。之後需要活躍模型的方法會拋出 `KnowledgeGraphModel is disposed`；延遲的非同步完成無法重新填入已處置或已被快照取代的狀態。所有權歸建立者：模型只是借用其選用的佈局，因此處置模型不會殺掉仍與活躍工作階段共享的佈局——誰建構了佈局，誰就負責處置它。

## 工作階段層保證

套件根目錄還匯出 `KnowledgeGraphSession`，它由模型驅動一個渲染器。其行為合約與模型的保持一致：

- **每個進行中的 id 只有一次擴充。** 對擴充請求仍在途中的節點重複選取，會被進行中的閘門吞掉，而不是為一次網路請求對每次點擊都觸發 `onExpand`/`onError`。
- **錯誤可被觀察。** 由選取觸發的擴充失敗會路由到 `onError(error, entity)` 選項（後備為 `console.error`），絕不會以未處理的 rejection 形式逃逸；工作階段被處置後，非同步延續即停止。
- **未知的 id 會明確失敗。** 擴充任何來源都不知道的 id 會以明確的錯誤失敗，而不是具體化出幽靈實體。

## 複雜度

對具有 `N` 個實體和 `E` 個唯一事實的已具體化切片而言，模型儲存是 `O(N + E)`。攝入一個分頁對 `P` 個返回的記錄是預期的 `O(P)`，然後重建渲染器資料是 `O(N + E)` 加上所提供佈局的 `setGraph()` 成本。快照匯出和匯入是 `O(N + E)`。模型刻意只具體化已載入的分頁；來源圖形的總大小並不會決定其常駐記憶體。

## 相關

[`@vectojs/graph-layout`](/reference/graph-layout/) 用於與渲染器無關的 2D 物理 ·
[`GraphLayout` 與 3D 佈局實作](/reference/graph3d-layout/) 用於選用的 XYZ 佈局合約 ·
[`@vectojs/graph3d`](/reference/graph3d/) 用於 3D 渲染
