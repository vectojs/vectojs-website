---
title: 'Graph3D 與選取'
description: '在兩次繪製呼叫中繪製任何圖形的 instanced Three.js 渲染器，以及用於懸停/點擊節點選取的光線投射模式。'
order: 46
---

# `Graph3D` 與選取

屬於 [`@vectojs/graph3d`](/reference/graph3d/)。消費
[`GraphLayout`](/reference/graph3d-layout/) 的 `positions` 緩衝區。

## `Graph3D` — 渲染器

```ts
new Graph3D(options?: Graph3DOptions)

interface Graph3DOptions {
  nodeRadius?: number;   // 在 val 縮放之前的基礎節點半徑。預設 4。
  nodeSegments?: number; // 球體鑲嵌（寬度/高度區段）。預設 12。
  nodeColor?: string;    // 未宣告顏色的節點的回退顏色。預設 '#4f9cff'。
  linkColor?: string;    // 連結線顏色。預設 '#9aa4b2'。
  linkOpacity?: number;  // 連結線不透明度。預設 0.35。
}
```

### 公開屬性

```ts
graph.group: THREE.Group // 新增到您的場景中；擁有節點網格 + 連結線
```

### 方法

```ts
setGraphData(data: GraphData): void
// 為新圖形重建 GPU 資源：一個 InstancedMesh（共享 SphereGeometry 的 nodeCount
// 個實例，每個實例的顏色 + ∛val 縮放）和
// 一個 LineSegments（linkCount 個區段）。實例化緩衝區是固定大小的，因此
// 更改的節點/連結數量意味著全新的網格 — 對相同拓撲的僅樣式更改
// 成本低廉，不需要單獨的路徑。未知的連結
// 端點（data.nodes 中不存在的 source/target id）會拋出錯誤，而不是
// 靜默地繪製一條指向原點的線。

applyPositions(positions: Float32Array): void
// 將 xyz 三元組（例如 GraphLayout 的 `.positions`）寫入實例化
// 的節點矩陣和連結端點。在每個移動了某些內容的佈局步驟後呼叫；
// 在模擬執行時每幀呼叫的成本足夠低。

pickNode(raycaster: THREE.Raycaster): number | null   // 自 0.2.0
// 僅對節點雲進行點擊測試，使用由呼叫者配置的 raycaster（從
// camera + 指標 NDC 設定）並回傳最近擊中的節點索引 — 與
// `GraphData.nodes` 陣列對齊 — 如果未擊中則回傳 `null`。連結永遠不會被
// 選取，因此光線擦過連結線時會報告未擊中。

getNodePosition(index: number, target: THREE.Vector3): THREE.Vector3 | null   // 自 0.2.0
// 直接從實例矩陣讀取節點的當前世界位置（上次由 applyPositions 寫入）
// 到 `target` 中。對於超出範圍的索引或節點網格不存在時回傳 `null`。

dispose(): void
// 釋放節點網格和連結線的幾何/材質/網格 GPU 資源，
// 並清空 `group`。
```

一個 `InstancedMesh`（每個節點一個，每個實例的顏色與 `∛val` 成比例的
半徑）加上一個 `LineSegments`（每個連結一個），都在單一
`THREE.Group` 下 — 實例化的重點在於無論圖形有 10 個節點還是 10,000 個，圖形大小恰好花費
**兩次繪製呼叫**。`Graph3D`
消費任何 [`GraphLayout`](/reference/graph3d-layout/) 形狀的 positions
緩衝區，並且不知道這些數字是如何計算的，這正是讓
佈局可互換（或由 worker 託管）而不需要觸碰渲染程式碼的原因。

連結線設定 `frustumCulled = false` — 端點在每個佈局 tick 移動，且
每幀重新計算邊界範圍對於通常是背景元素的東西來說是
浪費的工作，相比於始終繪製它們。

## 選取（懸停 / 點擊）

自 0.2.0 起，`pickNode()` 僅對**節點雲**進行點擊測試，因此您不再需要
手動對混合的節點/連結子元素進行 `intersectObjects` + `instanceId` 過濾。
從 camera 和指標 NDC 配置一個 `THREE.Raycaster`，然後讀取回擊中的節點索引（與 `GraphData.nodes` 對齊）：

```ts
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;

  raycaster.setFromCamera(ndc, camera);
  const index = graph.pickNode(raycaster); // number | null；連結永遠不匹配
  const node = index !== null ? data.nodes[index] : null;
});
```

## `GraphInteraction` — 懸停 / 選取 / 拖曳固定

自 0.2.0 起，`GraphInteraction` 將上述指標管線包裝為懸停、
選取和拖曳固定 — 每個互動式 3D 圖形應用程式否則會手動重建的元件。它在 `domElement` 上擁有三個指標監聽器，
僅此而已：沒有場景、沒有渲染迴圈、沒有控制項。主機繼續驅動自己的動畫迴圈和佈局 `step()`。

```ts
const interaction = new GraphInteraction({
  graph, // 圖形3D
  camera, // 建立選取光線的 camera
  domElement: canvas, // 讀取指標事件的元素
  layout, // GraphLayout；拖曳固定需要（需要 pinNode）
  nodeCount: data.nodes.length, // 可選的索引防護
  onHover: (i) => {
    /* i: number | null */
  },
  onSelect: (i) => {
    /* 非拖曳的點擊；null = 空白區域取消選取 */
  },
  setControlsEnabled: (enabled) => (controls.enabled = enabled), // 拖曳中暫停 OrbitControls
});
// …之後
interaction.dispose(); // 移除指標監聽器
```

拖曳是**特徵檢測的**：沒有支援固定的佈局（實作 `pinNode`
的佈局，如 [`D3ForceLayout`](/reference/graph3d-layout/) 提供的那樣）時，
按壓會回退為選取。`onDragStart`/`onDrag`/`onDragEnd`、`pinOnDrag`
（預設 `true`）、`dragReheat`（預設 `0.3`）和 `dragThreshold`（預設 `4` px）構成其餘選項。

## 相關

[`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/)（產生此處消費的 `positions` 緩衝區，以及 `pinNode` 拖曳固定依賴的）·
[`@vectojs/graph3d` 概覽](/reference/graph3d/)
