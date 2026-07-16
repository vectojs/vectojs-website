---
title: 'GraphLayout & D3ForceLayout'
description: '圖形資料模型和對 worker 友好的 GraphLayout 契約，以及其在 d3-force-3d 之上的 D3ForceLayout 實作。'
order: 45
---

# `GraphLayout` & `D3ForceLayout`

屬於 [`@vectojs/graph3d`](/reference/graph3d/)。

## 資料模型 — `GraphData`

```ts
type NodeId = string | number;

interface GraphNode {
  id: NodeId;
  val?: number; // 相對重要性；渲染器按 ∛val 比例縮放半徑。預設 1。
  color?: string; // CSS 顏色；回退到渲染器的 nodeColor。
  fx?: number; // 將節點固定在固定 x 位置 — 佈局不會移動它
  fy?: number;
  fz?: number;
  [key: string]: unknown; // 領域屬性隨行保留不變
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

節點物件永遠不會被佈局或渲染器修改 — 任意
額外屬性（標籤、類別、僅由您自己的程式碼使用的權重）
不變地通過，因此 `GraphData` 同時作為您應用程式的自有圖形
模型，而不是您需要轉換進出的格式。

## `GraphLayout` — 佈局契約

```ts
interface GraphLayout {
  setGraph(data: GraphData): void;
  step(iterations?: number): boolean; // 推進模擬，重新整理 `positions`；冷卻後回傳 false
  readonly positions: Float32Array; // xyz 三元組，與 GraphData.nodes 索引對齊
  // 可選的執行時固定控制項（自 0.2.0）— 用於互動式拖曳固定。
  // GraphInteraction 在啟用拖曳前會進行 pinNode 特徵檢測。
  pinNode?(nodeIndex: number, x: number, y: number, z: number): void;
  unpinNode?(nodeIndex: number): void; // 將固定的節點釋放回自由模擬
  reheat?(alpha?: number): void; // 提高 alpha 使已冷卻的模擬回應 pin/unpin
  dispose(): void; // 釋放模擬資源；實例之後無法使用
}
```

該契約刻意保持最小化且對 worker 友好：positions 是一個單一的
平面 `Float32Array`，按 `GraphData.nodes` 順序包含 xyz 三元組，因此
實作可以完全存在於 Web Worker 內部，並將其緩衝區作為可轉移物件
跨執行緒邊界串流，而無需每節點物件的開銷。
[`Graph3D.applyPositions()`](/reference/graph3d-renderer/#methods) 直接
消費完全相同緩衝區形狀。`positions` 是跨步驟重複使用的**同一個陣列
實例** — 如果您需要穩定的快照而非即時視圖，請複製它（`layout.positions.slice()`）。

`@vectojs/graph3d` 目前提供一個實作；更多轉接器（`ngraph`）
和 DAG 佈局模式在套件路線圖上，全部位於此相同
介面之後，因此渲染器或 worker 主機永遠不需要知道正在執行哪個。

## `D3ForceLayout`

```ts
new D3ForceLayout(options?: D3ForceLayoutOptions)

interface D3ForceLayoutOptions {
  linkDistance?: number;   // 連結的目標靜止長度。預設 30。
  chargeStrength?: number; // 多體（電荷）強度；負值排斥。預設 -30。
  alphaMin?: number;       // alpha 閾值，低於此值 step() 報告冷卻。預設 0.001。
}
```

改編自 [d3-force-3d](https://github.com/vasturiano/d3-force-3d) — 與 `3d-force-graph` 背後
相同的引擎 — 因此圖形的調整後力會保留其感覺。在 3 個維度中執行 `forceLink` + `forceManyBody` + `forceCenter`。

d3 模擬會變異自己的節點記錄（`x`/`y`/`z`/`vx`/…），因此
`setGraph` 將每個節點克隆到內部模擬記錄中，而不是直接交給它您的 `GraphData.nodes` 物件 — 只有宣告的
`fx`/`fy`/`fz` 固定會被帶入。模擬自己的計時器永遠不會
啟動；`step(iterations = 1)` 同步地執行它，這正是讓
`D3ForceLayout` 可在 Web Worker 內部使用而不需要偽造 `requestAnimationFrame` 的原因。

```ts
layout.step(); // 一個 tick
layout.step(5); // 一次呼叫 5 個 tick — 更便宜的每幀攤銷
// 適用於圖形視覺穩定時間比
// 逐 tick 平滑度更重要的情況
```

**固定（自 0.2.0）。** `D3ForceLayout` 透過 d3-force 的 `fx`/`fy`/`fz` 實作了可選的固定控制項，
這正是驅動 [`GraphInteraction`](/reference/graph3d-renderer/#graphinteraction-hover-select-drag-to-pin) 的
拖曳固定功能：

```ts
layout.pinNode(i, x, y, z); // 將節點 i 固定在 (x,y,z) 每個 tick；也會立即更新 positions[i]
layout.reheat(0.3); // 喚醒已冷卻的模擬，使其餘部分圍繞固定點穩定
layout.unpinNode(i); // 清除 fx/fy/fz — 節點 i 再次自由
```

超出範圍的索引會被忽略（陳舊的指標互動不會使佈局崩潰），
且 `reheat` 的 alpha 被限制在 d3 的通常 `[alphaMin, 1]` 範圍內。

**即時更改力。** `D3ForceLayoutOptions` 僅在建構時設定；沒有
即時 setter。要套用新的 `chargeStrength`/`linkDistance`（例如
從滑桿），`dispose()` 舊實例並用 `setGraph()` 建立新的 —
對於拓撲本身不變的圖形來說成本低廉，因為只有
模擬（而非 `Graph3D` 的 GPU 緩衝區）會被重建：

```ts
function restartLayout() {
  layout.dispose();
  layout = new D3ForceLayout({ chargeStrength, linkDistance });
  layout.setGraph(data);
}
```

## 相關

[`Graph3D` & picking](/reference/graph3d-renderer/)（直接消費 `positions`）·
[`@vectojs/graph3d` 概覽](/reference/graph3d/)
