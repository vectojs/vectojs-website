+++
title = "Graph3D & 選取"
description = "實例化的 Three.js 渲染器，只需兩次繪圖呼叫即可繪製任何圖形，以及用於懸停/點擊節點選取的光線投射模式。"
weight = 46
+++

# `Graph3D` & 選取

屬於 [`@vectojs/graph3d`](/reference/graph3d/)。使用 [`GraphLayout`](/reference/graph3d-layout/) 的 `positions` 緩衝區。

文件版本：**0.6.0**

## `Graph3D` — 渲染器

```ts
new Graph3D(options?: Graph3DOptions)

interface Graph3DOptions {
  nodeRadius?: number;   // 基本節點半徑（在 val 縮放之前）。預設 4。
  nodeSegments?: number; // 球體鑲嵌（寬度/高度分段）。預設 12。
  nodeColor?: string;    // 未宣告顏色的節點的回退顏色。預設 '#4f9cff'。
  linkColor?: string;    // 連結線條顏色。預設 '#9aa4b2'。
  linkOpacity?: number;  // 連結線條不透明度。預設 0.35。
}
```

### 公開屬性

```ts
graph.group: THREE.Group // 加入您的場景；擁有節點網格 + 連結線條
```

### 方法

```ts
setGraphData(data: GraphData): void
// 為新圖形重建 GPU 資源：一個 InstancedMesh（nodeCount 個共享
// SphereGeometry 的實例，每個實例有顏色 + ∛val 縮放）和
// 一個 LineSegments（linkCount 個線段）。實例緩衝區是固定大小的，因此
// 節點/連結數量的變更意味著全新的網格 — 對相同拓撲的
// 僅樣式變更成本很低，無需單獨路徑。未知的連結
// 端點（source/target id 不存在於 `data.nodes` 中）會拋出錯誤，而非
// 默默地繪製一條線到原點。

applyPositions(positions: Float32Array): void
// 將 xyz 三元組（例如 GraphLayout 的 `.positions`）寫入實例化的
// 節點矩陣和連結端點。在每個移動了內容的佈局步驟後呼叫；
// 成本足夠低，可在模擬執行時每影格呼叫。
// 如果 `positions.length < nodeCount * 3`，它會直接返回而不寫入任何內容，
// 並警告一次（每個 `setGraphData` 鎖存一次），因此過短的緩衝區永遠不會
// 寫入 NaN 變換並讓整個網格變空白。

pickNode(raycaster: THREE.Raycaster): number | null   // 自 0.2.0
// 僅針對節點雲進行點擊測試，使用呼叫者設定的 raycaster（從
// 攝影機 + 指標 NDC 設定），並返回最近擊中節點的索引 — 與
// `GraphData.nodes` 陣列對齊 — 若未擊中則返回 `null`。連結永遠不會
// 被選取，因此觸及連結線條的光線會報告未擊中。

getNodePosition(index: number, target: THREE.Vector3): THREE.Vector3 | null   // 自 0.2.0
// 從實例矩陣中直接讀取節點的當前世界位置（如同上次由 applyPositions 所寫）
// 到 `target` 中。索引超出範圍或節點網格不存在時返回 `null`。

dispose(): void
// 釋放節點網格和連結線條的幾何/材質/網格 GPU 資源，並清空 `group`。
```

一個 `InstancedMesh` 用於每個節點（每個實例的顏色和 `∛val` 比例半徑）加上一個 `LineSegments` 用於每個連結，兩者都在一個 `THREE.Group` 之下 — 實例化的重點在於，無論圖形有 10 個節點還是 10,000 個節點，成本都恰好是**兩次繪圖呼叫**。`Graph3D` 接受任何 [`GraphLayout`](/reference/graph3d-layout/) 形狀的 positions 緩衝區，且完全不知道這些數字是如何計算的，這使得佈局可以互換（或在 Worker 中託管），而無需觸及渲染程式碼。

連結線條設定 `frustumCulled = false` — 端點在每次佈局 tick 時移動，每影格為通常屬於背景元素的內容重新計算邊界是浪費的工作，不如始終繪製它們。

## 選取（懸停 / 點擊）

自 0.2.0 起，`pickNode()` 僅針對**節點雲**進行點擊測試，因此您不再需要手寫 `intersectObjects` + `instanceId` 過濾來處理混合的節點/連結子元素。從攝影機和指標 NDC 設定一個 `THREE.Raycaster`，然後讀回被擊中節點的索引（與 `GraphData.nodes` 對齊）：

```ts
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;

  raycaster.setFromCamera(ndc, camera);
  const index = graph.pickNode(raycaster); // number | null；連結絕不匹配
  const node = index !== null ? data.nodes[index] : null;
});
```

## `GraphInteraction` — 懸停 / 選取 / 拖曳固定

自 0.2.0 起，`GraphInteraction` 將上述的指標管線封裝為懸停、選取和拖曳固定 — 這是每個互動式 3D 圖形應用程式否則會手動重建的部分。它在 `domElement` 上擁有三個指標監聽器，沒有其他東西：沒有場景、沒有渲染迴圈、沒有控制項。主機繼續驅動自己的動畫迴圈和佈局 `step()`。

```ts
const interaction = new GraphInteraction({
  graph, // Graph3D
  camera, // 用於建構選取光線的攝影機
  domElement: canvas, // 從中讀取指標事件的元素
  layout, // GraphLayout；拖曳固定需要（需要 pinNode）
  nodeCount: data.nodes.length, // 可選的索引保護
  onHover: (i) => {
    /* i: number | null */
  },
  onSelect: (i) => {
    /* 非拖曳的點擊；null = 空白處取消選取 */
  },
  setControlsEnabled: (enabled) => (controls.enabled = enabled), // 拖曳中暫停 OrbitControls
});
// …之後
interaction.dispose(); // 移除指標監聽器
```

拖曳是**功能檢測**的：沒有支援固定功能的佈局（實作 `pinNode`，如 [`VectoForceLayout` 和 `D3ForceLayout`](/reference/graph3d-layout/) 所提供的），按下就會回退為選取。`onDragStart`/`onDrag`/`onDragEnd`、`pinOnDrag`（預設 `true`）、`dragReheat`（預設 `0.3`）和 `dragThreshold`（預設 4 px）完善了選項。

## 相關

[`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/)（產生此處使用的 `positions` 緩衝區，以及 `pinNode` 拖曳固定所依賴的）·
[`GraphCamera`](/reference/graph3d/#graphcamera)（內建的 2D/3D 攝影機控制項）·
[`@vectojs/graph3d` 概覽](/reference/graph3d/)
