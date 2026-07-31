---
title: 'GraphLayout & D3ForceLayout'
description: '圖形資料模型和適合 Worker 的 GraphLayout 合約，以及基於 d3-force-3d 的 D3ForceLayout 實作。'
order: 45
---

# `GraphLayout` & `D3ForceLayout`

屬於 [`@vectojs/graph3d`](/reference/graph3d/)。

## 資料模型 — `GraphData`

```ts
type NodeId = string | number;

interface GraphNode {
  id: NodeId;
  val?: number; // 相對重要性；渲染器按 ∛val 縮放半徑。預設 1。
  color?: string; // CSS 顏色；回退到渲染器的 nodeColor。
  fx?: number; // 將節點固定在固定 x 位置 — 佈局不會移動它
  fy?: number;
  fz?: number;
  [key: string]: unknown; // 領域屬性原封不動保留
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

節點物件絕不會被佈局或渲染器修改 — 任意額外屬性（標籤、類別、僅由您自己的程式碼使用的權重）會原封不動地通過，因此 `GraphData` 同時可作為應用程式本身的圖形模型，而非您需要轉入再轉出的格式。

## `GraphLayout` — 佈局合約

```ts
interface GraphLayout {
  setGraph(data: GraphData): void;
  step(iterations?: number): boolean; // 推進模擬，更新 `positions`；冷卻後返回 false
  readonly positions: Float32Array; // xyz 三元組，與 GraphData.nodes 索引對齊
  // 可選的執行時固定控制（自 0.2.0）— 用於互動式拖曳固定。
  // GraphInteraction 在啟用拖曳前會先檢查 pinNode 是否存在。
  pinNode?(nodeIndex: number, x: number, y: number, z: number): void;
  unpinNode?(nodeIndex: number): void; // 將已固定的節點釋放回自由模擬
  reheat?(alpha?: number): void; // 提高 alpha，使已冷卻的模擬對固定/解除固定做出反應
  dispose(): void; // 釋放模擬資源；實例之後無法使用
}
```

該合約刻意保持精簡且適合 Worker 使用：位置是一個平面 `Float32Array`，包含按 `GraphData.nodes` 順序排列的 xyz 三元組，因此實作可以完全存在於 Web Worker 內部，並將其緩衝區作為可轉移物件跨越執行緒邊界串流傳輸，無需每個節點的物件流量。[`Graph3D.applyPositions()`](/reference/graph3d-renderer/#方法) 直接使用完全相同的緩衝區形狀。`positions` 是跨步驟重複使用的**同一個陣列實例** — 如果您需要穩定的快照而非即時檢視，請複製它（`layout.positions.slice()`）。

`@vectojs/graph3d` 目前提供一個實作；更多的轉接器（`ngraph`）和 DAG 佈局模式已在套件路線圖上，所有這些都位於同一個介面之後，因此渲染器或 Worker 主機無需知道正在執行哪一個。

## `D3ForceLayout`

```ts
new D3ForceLayout(options?: D3ForceLayoutOptions)

interface D3ForceLayoutOptions {
  linkDistance?: number;   // 連結的目標靜止長度。預設 30。
  chargeStrength?: number; // 多體（電荷）強度；負值排斥。預設 -30。
  alphaMin?: number;       // alpha 臨界值，低於此值 step() 報告冷卻。預設 0.001。
}
```

適配 [d3-force-3d](https://github.com/vasturiano/d3-force-3d) — 與 `3d-force-graph` 背後的相同引擎 — 因此圖形調整過的力會保留其感覺。在 3 維度中執行 `forceLink` + `forceManyBody` + `forceCenter`。

d3 模擬會修改自己的節點記錄（`x`/`y`/`z`/`vx`/...），因此 `setGraph` 會將每個節點複製到內部模擬記錄中，而非直接將您的 `GraphData.nodes` 物件交給它 — 只有宣告的 `fx`/`fy`/`fz` 固定點會被帶入。模擬自己的計時器從不啟動；`step(iterations = 1)` 同步推進它，這正是 `D3ForceLayout` 可以在 Web Worker 內使用而無需偽造 `requestAnimationFrame` 的原因。

```ts
layout.step(); // 一次 tick
layout.step(5); // 一次呼叫中 5 個 tick — 更便宜的每影格攤銷
// 適用於圖形視覺穩定時間比逐 tick 平滑度更重要的情況
```

**固定點（自 0.2.0）。** `D3ForceLayout` 透過 d3-force 的 `fx`/`fy`/`fz` 實作可選的固定控制，這就是支援 [`GraphInteraction`](/reference/graph3d-renderer/#graphinteraction--懸停--選取--拖曳固定) 拖曳固定的方式：

```ts
layout.pinNode(i, x, y, z); // 將節點 i 固定在 (x,y,z) 並每次 tick 更新；同時立即更新 positions[i]
layout.reheat(0.3); // 喚醒已冷卻的模擬，使其餘部分圍繞固定點穩定
layout.unpinNode(i); // 清除 fx/fy/fz — 節點 i 恢復自由
```

超出範圍的索引會被忽略（陳舊的指標互動不會導致佈局崩潰），且 `reheat` 的 alpha 會被限制在 d3 常規的 `[alphaMin, 1]` 範圍內。

**即時變更力。** `D3ForceLayoutOptions` 僅在建構時設定；沒有即時的 setter。要應用新的 `chargeStrength`/`linkDistance`（例如從滑桿調整），請 `dispose()` 舊的實例並 `setGraph()` 一個新的 — 對於拓撲本身不變的圖形來說成本很低，因為只有模擬被重建，而非 `Graph3D` 的 GPU 緩衝區：

```ts
function restartLayout() {
  layout.dispose();
  layout = new D3ForceLayout({ chargeStrength, linkDistance });
  layout.setGraph(data);
}
```

## 相關

[`Graph3D` & 選取](/reference/graph3d-renderer/)（直接使用 `positions`）·
[`@vectojs/graph3d` 概覽](/reference/graph3d/)
