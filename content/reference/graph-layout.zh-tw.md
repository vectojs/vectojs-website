+++
title = "@vectojs/graph-layout"
description = "與渲染器無關、零依賴的 2D 力佈局，具備 Barnes-Hut 排斥、增量拓撲更新、碰撞處理和執行時固定功能。"
weight = 47
+++

# `@vectojs/graph-layout`

文件版本：**0.3.0**

`@vectojs/graph-layout` 是一個零依賴的 2D 力模擬。它不擁有任何渲染器或動畫計時器：主機提供圖形資料、呼叫 `step()`，並從 `Float32Array` 讀取交錯的 XY 座標。同一個佈局可以驅動 Canvas 2D、SVG、WebGL、WebGPU、VectoJS 場景，或離主執行緒的渲染器。

版本 0.3.0 有一個實作，即 TypeScript 的 `ForceLayout2D`。0.3.0 中沒有 WASM 建置、替代後端或 `backend` 選項。WASM 仍是一個以量測為門檻的未來選項；目前的跨維度瀏覽器比較並非 WASM 後端會有幫助的直接證據。

## 安裝

```bash
bun add @vectojs/graph-layout
```

該套件沒有執行時或渲染器 peer 依賴。

## Canvas 2D 範例

此範例使用任意的字串 ID，並透過佈局解析其目前的位置索引。數字 ID 也是識別碼；不要假設數字 ID 等於其目前的節點索引。

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

`step()` 是同步的。當模擬仍處於活躍狀態時返回 `true`，在冷卻到低於 `alphaMin`（或圖形為空時）之後返回 `false`。返回值說明物理是否需要另一個 tick；它並不說明您的應用程式是否應該為了攝影機移動、輸入或其他動畫而繼續渲染。非正的 `alphaDecay` 會在建構時被拒絕並回退到預設值，因此非空的模擬總會自行穩定。

## 公開型別

該套件從其根目錄匯出下列型別和 `ForceLayout2D`：

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

額外的節點和連結欄位仍由應用程式擁有。佈局不會修改輸入記錄。

## 選項

| 選項                   |       預設 | 意義                                                               |
| ---------------------- | ---------: | ------------------------------------------------------------------ |
| `repulsion`            |      `300` | 每個節點的非負多體排斥強度。                                       |
| `collisionRadius`      |        `0` | 每個節點的非負半徑。兩個零半徑的節點不會分開。                     |
| `collisionStrength`    |        `1` | 非負碰撞修正乘數。零會停用碰撞修正。                               |
| `linkDistance`         |       `30` | 每個連結的非負靜止長度。                                           |
| `linkStrength`         |      `0.3` | 每個連結的非負彈簧剛度。                                           |
| `centerStrength`       |     `0.02` | 朝原點的非負拉力。                                                 |
| `velocityDecay`        |      `0.6` | 每個 tick 的速度保留，限制在 `1` 以下。                            |
| `theta`                |      `0.9` | 非負 Barnes-Hut 開角。較低的值以速度換取精確度；`0` 執行精確走訪。 |
| `repulsionDistanceMax` | `Infinity` | 節點排斥的最大距離。非正值表示無截止（與 `Infinity` 相同）。       |
| `alphaDecay`           |   `0.0228` | 每個 tick 的溫度衰減，限制在 `[0, 1]`；非正值回退到預設值。        |
| `alphaMin`             |    `0.001` | 模擬穩定所需的非負溫度臨界值。                                     |
| `seed`                 |        `1` | 對沒有有限初始座標的節點使用的確定性種子。                         |

非有限的選項值會回退到其預設值。標示為非負的值會限制在零，但有兩個刻意的例外改為回退：非正的 `alphaDecay` 取預設值 `0.0228`（字面量 `0` 會讓每 tick 衰減變成空操作，模擬將永不穩定），非正的 `repulsionDistanceMax` 表示無截止（它曾會把排斥整個關掉）。節點和連結的存取器會在每個記錄被接受進入佈局時評估一次，而非每個 tick。節點存取器索引是插入索引。連結存取器索引在僅追加的分頁中是穩定且連續的索引。移除節點會壓縮連結，因此後續的追加可以重用先前指派給已移除連結的索引。移除節點不會重新評估倖存者的存取器；如果必須重新推導值，請使用全新的 `setGraph()`。所有選項都僅在建構時設定；0.3.0 中沒有即時的力 setter。

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
  setNodePin(id: NodeId, pin: { x?: number; y?: number }): void;
  clearNodePin(id: NodeId, axes?: { x?: boolean; y?: boolean }): void;
  pinNode(id: NodeId, x: number, y: number): void;
  unpinNode(id: NodeId): void;
  reheat(alpha?: number): void;
  dispose(): void;
}
```

### 位置與步進

`positions` 以目前的節點順序包含 `[x0, y0, x1, y1, ...]`。它是一個即時檢視：佈局會跨 `step()` 呼叫原地更新其值。當您需要不可變的快照時，請呼叫 `layout.positions.slice()`。

檢視物件在拓撲邊界之間並不穩定。請務必在 `setGraph()`、`appendGraph()` 或 `removeNodes()` 之後重新取得 `layout.positions`；追加超過內部容量時也會重新分配底層儲存。節點索引在移除後可能會變更，因為倖存者會在保留其相對順序的情況下被壓縮。

使用 `getNodeIndex(id)` 將 ID 解析為其目前的索引，使用 `getNodeId(index)` 進行反向查詢。當沒有符合的目前節點時，兩者都會返回 `undefined`。`getNodeIds()` 以目前的位置順序返回快照；修改該陣列不會影響佈局。現有索引在僅追加的更新中保持穩定，而移除會壓縮倖存者。

`step(iterations = 1)` 最多執行該數量的同步 tick，並在之後 alpha 仍至少為 `alphaMin` 時返回 `true`。它在冷卻時提前停止。非正數或非有限的迭代次數不執行任何 tick，並報告目前的活躍狀態；次數會被向下取整並在每次呼叫時上限為 10,000。

### 取代、追加與移除節點

`setGraph(data)` 取代所有狀態，確定性地種子化新圖形，並將 alpha 設為 `1`。每個節點 ID 必須是字串或有限數字且必須唯一；無效或重複的 ID 會在清除現有圖形之前拋出錯誤。

`appendGraph(data)` 保留現有的位置、速度和固定。ID 無效、已存在或在該次追加中重複的節點會被忽略，這使得重播的分頁具有冪等性。被接受的節點會以輸入順序追加。被接受的連結可以指向現有節點或在同一次呼叫中被接受的節點。拓撲變更會單調地重新加熱：它可以提高 alpha，但永遠不會降低已經很熱的模擬。

連結透過有向端點對加上選用的 `id` 具有重播安全性：

- 沒有 `id` 時，重複的 `source` 到 `target` 連結是同一個連結。
- 方向很重要：`a` 到 `b` 和 `b` 到 `a` 具有不同的身分。
- 平行連結需要不同的字串或有限數字 ID；圖形堆疊將平行連結視為相異的邊，而不是拒絕它們。
- 重播一個已識別的連結會被忽略。
- 格式錯誤的選用連結 ID 在身分識別上會被視為不存在。

端點驗證嚴格而統一：端點參照未知節點或兩次參照同一節點的連結會讓 `setGraph()` 和 `appendGraph()` 拋出錯誤，且 `appendGraph()` 在變更前驗證整個批次，因此被拒絕的呼叫會讓先前的圖形保持原樣（同批次中接受的向前節點參照仍然有效）。這與 `updateLinks()` 的政策一致——懸空連結過去會被靜默丟棄，把資料缺陷隱藏成神祕缺失的結構。當端點有效時，具有格式錯誤選用 ID 的連結仍會以未識別連結的身分進入。格式錯誤的連結資料不會讓位置變成非有限值。`removeNodes(ids)` 移除符合的節點和每個相連的連結，壓縮倖存者狀態，重新計算度數偏差，並在移除內容時重新加熱。未知 ID 和空的可迭代物件是無操作。

### 移除與更新連結

`removeLinks(items)` 移除連結而不變更任何節點索引、位置、速度或固定。傳入完整連結以符合其有向端點加上選用 ID，或傳入裸的 `LinkId` 以移除每個帶有該 ID 的已識別連結。倖存的連結保留其順序和快取的存取器值。未知和已移除的身分是無操作。成功的批次會重新計算連結度數偏差並重新加熱一次。

`updateLinks(links)` 為符合的現有身分重新評估 `linkDistance` 和 `linkStrength` 存取器。在變更這些存取器所使用、由應用程式擁有的連結欄位之後使用它。完整批次會先驗證：未知或相同的端點會拋出錯誤而不套用任何更新。尚未存在的身分會被忽略。由於端點參與連結身分，變更路由需要先 `removeLinks()` 再 `appendGraph()`。未變更的值不會重新加熱模擬。

### 固定與重新加熱

有限的初始 `fx` 和 `fy` 值會獨立地固定軸。因此節點可以有固定 X 且自由 Y、固定 Y 且自由 X，或兩個軸都固定。初始 `x` 和 `y` 只會種子化其對應的未固定軸。

在執行時，`setNodePin(id, { x?, y? })` 只固定提供的軸，立即更新這些即時座標，並清除其速度。`clearNodePin(id, { x?, y? })` 釋放選定的軸，同時保留另一個軸；省略 axes 物件會釋放兩個軸。`pinNode(id, x, y)` 和 `unpinNode(id)` 仍然是雙軸的便利方法。未知 ID 會被忽略。

**固定按 ID 定址**（0.3.0），與此類別中所有其他節點參照一致，因此在 `removeNodes()` 壓縮後固定仍指向同一節點——按索引定址的固定會悄悄改指到移入該槽位的任何節點。給跨堆疊移植程式碼的分歧提示：3D [`GraphLayout`](/reference/graph3d-layout/) 家族契約改為按節點**索引**固定，且平行邊處理也不同——本套件的消費者拒絕重複的端點四元組（node-editor 的 `duplicate-link`），而 graph/knowledge 堆疊把平行連結視為相異的邊。跨堆疊遷移時請轉換固定方式與連結身分。

這些呼叫不會自動重新加熱，因此在互動式固定或解除固定操作之後請呼叫 `reheat()`。

`reheat(alpha = 0.3)` 將請求限制在 `[alphaMin, 1]` 並套用 `max(currentAlpha, requestedAlpha)`。它永遠不會冷卻較熱的模擬。

### 拖曳節點：重新加熱一次，而非每次移動

最常見的拖曳相關缺陷是在拖曳固定節點時，於**每次指標移動**呼叫 `reheat()`。這會讓 alpha 維持在其最大值附近，因此被拖曳節點的鄰居 — 被其連結彈簧拉扯 — 會持續以幾乎沒有阻尼的方式過衝。模擬隨後需要數秒才能在指標釋放後冷卻（alpha 以約 `alphaDecay` 每個 tick 衰減，在 60 fps 下約 300 個 tick ≈ 5 秒），在此期間整個鄰域會明顯震動。若在每個節點渲染文字標籤，這種快速振盪會讀作抖動和殘影/鬼影。

正確的模式是只在拖曳*開始*時重新加熱，然後在每次移動時更新固定位置而不重新加熱：

```ts
function onDragStart(node, x, y) {
  layout.setNodePin(node.id, { x, y }); // pin at the pointer
  layout.reheat(0.3); // wake the simulation ONCE
}

function onDragMove(node, x, y) {
  layout.setNodePin(node.id, { x, y }); // move the pin — no reheat here
}

function onDragEnd(node) {
  layout.clearNodePin(node.id); // or keep it pinned for a permanent pin
}
```

如果在拖曳*期間*希望有緩慢漂移的跟隨感覺，請提高 `velocityDecay`（更多阻尼），而非每次移動都重新加熱；將 `reheat()` 保留給拓撲變更、明確喚醒和拖曳開始。

### 處置

`dispose()` 釋放圖形和四叉樹儲存，將 `positions` 重置為空陣列，並且是冪等的。處置之後，其他每個方法都會拋出 `ForceLayout2D was disposed`；請建立新實例，而非嘗試重用舊實例。

## 複雜度與容量

對 `N` 個節點和 `E` 個被接受的連結而言，一個正常的 tick 會建構 Barnes-Hut 四叉樹並以預期的 `O(N log N)` 評估排斥，以 `O(E)` 套用彈簧，並以 `O(N)` 進行消毒、置中和積分。因此沒有碰撞時的通常 tick 成本是 `O(N log N + E)`。這不是最壞情況的承諾：病態的空間分佈或 `theta: 0` 可能接近全對工作。

當啟用碰撞時，佈局會在預測位置上第二次建構四叉樹，並透過一個寬相階段執行半徑鄰域查詢——該階段把點分入二的冪半徑層級，每個層級有自己的網格——探測成本由局部密度決定，而不是讓每個節點都落進按最大半徑劃分尺寸的儲存格。稀疏、局部有界的鄰域通常接近 `O(N log N + K)`，其中 `K` 是候選/重疊工作，但密集叢集或非常大的半徑仍可能讓 `K` 變成二次方。碰撞並未從 Barnes-Hut 排斥繼承無條件的 `O(N log N)` 界限。

`setGraph()` 除了幾何容量分配和初始化之外是 `O(N + E)`。`appendGraph()` 與追加的輸入成正比，加上在接受連結時 `O(N + E)` 的度數偏差重新計算。`removeLinks()` 只壓縮連結儲存，為 `O(E + R)` ——裸 ID 透過惰性建構的索引解析，而不是每個請求掃描所有連結。`updateLinks()` 對 `U` 個更新是 `O(E + U)`。儲存以幾何方式增長，因此大多數小型追加會重用容量；增長邊界會以 `O(N + E)` 時間複製現有的型別化陣列。`removeNodes()` 壓縮節點和連結，並以 `O(N + E)` 重新計算偏差。移除不會縮小容量。

## 量測的瀏覽器證據

度數偏差之後的一次有頭瀏覽器診斷執行，對每列十個 tick 樣本量測了下列 p95 主執行緒 tick 時間：

| 3,000 節點工作負載 | Chrome 151 | Firefox 153 |
| ------------------ | ---------: | ----------: |
| 星型/樞紐          |   10.60 ms |     7.84 ms |
| 混合稀疏           |    8.09 ms |     7.28 ms |

在四個瀏覽器/工作負載列中，追加一個 50 節點的分頁量測為 **0.145-0.355 ms**。每個追加列有一個拓撲變更樣本，因此這個範圍是診斷證據，而非尾端延遲估計。這些量測來自任務執行者硬體和軟體環境上的一次有頭執行，並非可攜式保證。瀏覽器排程、硬體、電源狀態、背景負載、圖形幾何、選項、暖機和樣本建構都會影響結果。它們是每操作延遲證據，而非 FPS 量測；無法從中推導出任何 FPS 主張。

## 從 `d3-force` 遷移

概念對應是直接的，但 API 刻意較小：

| `d3-force`                                      | `@vectojs/graph-layout`                                |
| ----------------------------------------------- | ------------------------------------------------------ |
| `simulation.nodes(nodes)` 和 `forceLink(links)` | `layout.setGraph({ nodes, links })`                    |
| `simulation.tick(k)`                            | `layout.step(k)`                                       |
| 被修改的節點 `x`/`y` 欄位                       | 交錯的 `layout.positions` XY 檢視                      |
| `simulation.alpha(value).restart()`             | `layout.reheat(value)` 加上主機排程的影格              |
| `node.fx` / `node.fy` 修改                      | 初始 `fx`/`fy`，然後 `setNodePin()` / `clearNodePin()` |
| d3 的內部計時器                                 | 無計時器；主機擁有排程                                 |

連結使用端點 ID 而非 d3 修改的端點物件。選項存取器接收原始的 `GraphNode` 或 `GraphLink` 和插入索引，然後被快取。0.3.0 中沒有自訂力註冊表；如果您的 d3 佈局依賴自訂力或即時的力 setter，請保留 d3-force 或以新選項重建佈局。

## 2D 與 `@vectojs/graph3d` 的比較

請使用此套件進行與渲染器無關的 **2D** 物理和交錯的 XY 對。[`@vectojs/graph3d`](/reference/graph3d/) 提供獨立的 3D 佈局實作（`D3ForceLayout` 和 `VectoForceLayout`）和 Three.js 渲染器；其位置是 XYZ 三元組，且其圖形/佈局型別不可與 `ForceLayout2D` 互換。雖然兩個 API 都使用由主機呼叫的 `step()`，且該方法會報告模擬工作是否仍存在，但請勿將此套件的 XY 緩衝區傳給 `Graph3D.applyPositions()`，它需要 XYZ 資料。

## 相關

[`@vectojs/graph3d`](/reference/graph3d/) 用於 3D 佈局與渲染 ·
[`GraphLayout` 與 3D 佈局實作](/reference/graph3d-layout/)
