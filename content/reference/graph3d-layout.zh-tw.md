+++
title = "GraphLayout & D3ForceLayout"
description = "圖形資料模型和適合 Worker 的 GraphLayout 合約，以及基於 d3-force-3d 的 D3ForceLayout 實作。"
weight = 45
+++

# `GraphLayout` & `D3ForceLayout`

屬於 [`@vectojs/graph3d`](/reference/graph3d/)。

文件版本：**0.6.1**

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

**鏈路端點驗證在整個技術堆疊中是一致的（0.6.1）。** `Graph3D.setGraphData`、`VectoForceLayout.setGraph` 與 `D3ForceLayout.setGraph` 對端點指向圖中不存在節點的鏈路都會拋出同樣的 `references an unknown node id` 錯誤 —— 驗證在任何狀態被修改之前執行，因此被拒絕的圖會保持前一個圖完好無損（`D3ForceLayout` 過去會把裸 id 直接送進 d3-force-3d，其 tick 會悄悄把所有位置塌縮為 NaN；`VectoForceLayout` 過去會靜默略過該鏈路）。自環仍是合法輸入，只是不攜帶彈簧：`VectoForceLayout` 會略過它們。

另請注意，本合約的可選釘選控制以節點**索引**定址，而 2D 的 [`ForceLayout2D`](/reference/graph-layout/) 以節點 **ID** 釘選（因此其釘選在 `removeNodes` 壓縮後仍有效），平行邊的身份判定也不同 —— 本套件的堆疊把平行鏈路視為不同的邊，而諸如節點編輯器之類的消費者則拒絕重複的端點四元組。在技術堆疊之間移植程式碼時請轉換釘選與鏈路身份。

`@vectojs/graph3d` 今天在此合約背後提供兩個實作 — 自有的 [`VectoForceLayout`](#vectoforcelayout)（Barnes–Hut 八叉樹，無執行時依賴；預設）和 [`D3ForceLayout`](#d3forcelayout)（`d3-force-3d` 轉接器，保留以與現有的 d3 調校維持一致）—— 另外還有 DAG 佈局模式在套件路線圖上，所有這些都位於同一個介面之後，因此渲染器或 Worker 主機無需知道正在執行哪一個。

## `D3ForceLayout`

由 d3-force-3d 支援的替代方案，可替代預設的 [`VectoForceLayout`](#vectoforcelayout)。它需要 `d3-force-3d`；除非您正在遷移一個已調校 d3 力的圖形且希望保留原有手感，否則請優先使用 `VectoForceLayout`。

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
  alphaDecay?: number;     // cooling rate. Default 0.0228; non-positive falls back to the default.
  alphaMin?: number;       // alpha below which step() reports cooled. Default 0.001.
  seed?: number;           // RNG seed for deterministic placement. Default 1.
  measurePhases?: boolean; // opt-in per-tick phase profiling. Default false.
}
```

自有佈局（0.3.0 新增，且為預設）：一種力導向模擬，多體項使用 Barnes–Hut 八叉樹 — 無執行時依賴，在 `seed` 下具有確定性，且可在 Web Worker 內安全執行（與 `D3ForceLayout` 相同的 `step(iterations)` 合約）。位置和速度以 **f32** 保存（與公開的 `Float32Array` 相符），而八叉樹以 **f64** 累積質心和排斥積分。當您希望多次執行獲得相同結果時選擇它；使用 `repulsion`/`linkStrength` 進行調整，並謹慎地將 `alphaDecay` 提升到零以上 — 它已接近冷卻邊緣，因此較高的值會讓圖更早而非更晚凍結。非正值的 `alphaDecay` 會在建構時被拒絕並回退到預設值（字面量 `0` 過去會讓模擬永遠執行、永不收斂）。

```ts
layout.step(); // 一次 tick
layout.step(5); // 一次呼叫中 5 個 tick — 更便宜的每影格攤銷
// 適用於圖形視覺穩定時間比逐 tick 平滑度更重要的情況
```

**階段剖析（自 0.5.0）。** 設定 `measurePhases: true` 可讓每個 tick 將其牆鐘時間記錄到 `layout.tickPhases`（一個 `readonly` 的毫秒 4 元組；剖析關閉時為 `null`）中，拆分為 `[octree build, force accumulate, link springs, integrate]`。否則計時呼叫會被省略，因此熱路徑無需付出任何成本。

**WASM 力核心（自 0.5.0）。** 一個可選的 Rust/WASM 核心（`crates/vectojs-force-rs`）加速八叉樹建構 + 排斥累積 — 一個 tick 的主要階段 — 而連結彈簧、置中、積分和固定仍留在 JS 中：

```ts
import { forceWasmUrl } from '@vectojs/graph3d/wasm';

await layout.enableWasmForce(forceWasmUrl); // async; string | URL | Response
layout.enableWasmForceSync(bytes); // sync; BufferSource, never fetches
```

兩者在任何失敗（CSP、404、損壞的模組）時都會返回 `false`，並靜默保留逐位元完全相同的 JS Barnes-Hut，它是永久的回退方案和差異化對照。該核心沒有 `@vectojs/core` 依賴。

**固定點（自 0.2.0）。** `D3ForceLayout` 和 `VectoForceLayout` 都實作可選的固定控制（d3 透過 `fx`/`fy`/`fz`，VectoForceLayout 透過自己的固定陣列），這就是支援 [`GraphInteraction`](/reference/graph3d-renderer/#graphinteraction--懸停--選取--拖曳固定) 拖曳固定的方式：

```ts
layout.pinNode(i, x, y, z); // 將節點 i 固定在 (x,y,z) 並每次 tick 更新；同時立即更新 positions[i]
layout.reheat(0.3); // 喚醒已冷卻的模擬，使其餘部分圍繞固定點穩定
layout.unpinNode(i); // 清除 fx/fy/fz — 節點 i 恢復自由
```

超出範圍的索引會被忽略（陳舊的指標互動不會導致佈局崩潰），且 `reheat` 的 alpha 會被限制在 `[alphaMin, 1]` 範圍內。

**即時變更力。** `D3ForceLayoutOptions` 僅在建構時設定；沒有即時的 setter。要應用新的 `chargeStrength`/`linkDistance`（例如從滑桿調整），請 `dispose()` 舊的實例並 `setGraph()` 一個新的 — 對於拓撲本身不變的圖形來說成本很低，因為只有模擬被重建，而非 `Graph3D` 的 GPU 緩衝區：

```ts
function restartLayout() {
  layout.dispose();
  layout = new D3ForceLayout({ chargeStrength, linkDistance });
  layout.setGraph(data);
}
```

`VectoForceLayoutOptions` 同樣僅在建構時設定，因此當您變更其力時，同樣的重啟模式也適用。

## 相關

如需與渲染器無關的 **2D** 力佈局、增量拓撲更新和交錯的 XY 位置，請使用 [`@vectojs/graph-layout`](/reference/graph-layout/)。它是一個獨立的套件；其 `ForceLayout2D` 和 XY 緩衝區並未實作本頁的 3D `GraphLayout` 合約或其 XYZ 位置形狀。兩個 API 都會從主機驅動的 `step()` 返回一個活躍/冷卻布林值，但它們的佈局類型和位置緩衝區不可互換。

[`Graph3D` & 選取](/reference/graph3d-renderer/)（直接使用 `positions`）·
[`@vectojs/graph3d` 概覽](/reference/graph3d/)
