+++
title = "@vectojs/graph3d"
description = "3D 力導向圖形視覺化：一個可插拔的 GraphLayout 介面，加上一個實例化的 Three.js 渲染器，只需兩次繪圖呼叫即可繪製任何圖形。"
weight = 44
+++

# `@vectojs/graph3d`

文件版本：**0.6.1**

VectoJS 的 3D 力導向圖形視覺化：一個可插拔的 `GraphLayout` 合約（適合在 Worker 中使用，位置表示為一個平面 `Float32Array`）加上 `Graph3D`，一個實例化的 Three.js 渲染器，無論有多少節點，都只需**兩次繪圖呼叫**即可繪製任何圖形。請參閱即時 [Les Misérables 示範](/demos/graph3d/)，查看經典的 77 節點/254 連結資料集動態展示。

## 安裝

```bash
bun add @vectojs/graph3d three
```

`three` 是 peer 依賴 — `@vectojs/graph3d` 繪製到一個您加入自己場景的 `THREE.Group` 中，且不管理 `WebGLRenderer`、攝影機或控制項本身。

## 使用方式

```ts
import { VectoForceLayout, Graph3D } from '@vectojs/graph3d';
import * as THREE from 'three';

const data = {
  nodes: [{ id: 'vectojs', val: 8, color: '#4f9cff' }, { id: 'core' }, { id: 'ui' }],
  links: [
    { source: 'vectojs', target: 'core' },
    { source: 'vectojs', target: 'ui' },
  ],
};

const layout = new VectoForceLayout();
layout.setGraph(data);

const graph = new Graph3D();
graph.setGraphData(data);
scene.add(graph.group);

function animate() {
  const active = layout.step();
  graph.applyPositions(layout.positions);
  renderer.render(scene, camera);
  if (active) requestAnimationFrame(animate);
}
animate();
```

一旦模擬冷卻（alpha 低於臨界值），`layout.step()` 會返回 `false` — 上述範例此時會停止其自己的 rAF 迴圈，但如果呼叫者允許使用者即時調整力（電荷強度、連結距離），則應保持每個影格都進行渲染，並僅根據該旗標決定是否呼叫物理 `step()`/`applyPositions()`，以便 `OrbitControls` 阻尼和攝影機移動在佈局穩定後仍保持流暢。

`VectoForceLayout`（自有 Barnes-Hut 八叉樹佈局，無執行時依賴）是預設選項；[`D3ForceLayout`](/reference/graph3d-layout/#d3forcelayout) 仍然可用，但需要 `d3-force-3d`。兩者可在同一個 `GraphLayout` 合約背後直接替換。

## GraphCamera

自 0.4.0 起，`GraphCamera` 是為不自行提供 Three.js 控制項的主機準備的內建攝影機 + 控制項：在單一 `camera` getter 背後提供 2D 正交平移/縮放檢視和 3D 透視環繞檢視。

```ts
import { GraphCamera } from '@vectojs/graph3d';

const camera = new GraphCamera({ domElement: canvas, mode: '3d' }); // '2d' (ortho) is the default
camera.fitToPositions(layout.positions); // frame the graph; skips non-finite points
camera.setMode('2d'); // switch to orthographic pan/zoom
camera.setSize(width, height); // call on canvas resize
camera.dispose(); // remove pointer/wheel listeners
```

`mode: '2d' | '3d'` 選擇攝影機類型；`fitToPositions(positions)` 框定一個 xyz 三元組緩衝區（與 [`applyPositions`](/reference/graph3d-renderer/#方法) 使用相同形狀）。搭配 `GraphInteraction` 使用時，傳入 `() => camera.camera`（一個 getter，因此 `setMode` 保持即時生效）並接上 `setControlsEnabled`，讓節點拖曳不會同時平移檢視。

## WASM 力核心

`VectoForceLayout` 附帶一個可選的 Rust/WASM 力核心（`crates/vectojs-force-rs`，以同位置發佈的 `vectojs_force.wasm` 形式提供），可加速 Barnes-Hut 八叉樹建構 + 排斥累積 — 經量測佔一個 tick 的 78–90%。在任何載入/實例化失敗時，它會靜默返回 `false` 並保留逐位元完全相同的 JS Barnes-Hut，因此可以放心地以推測方式啟用。

```ts
import { forceWasmUrl } from '@vectojs/graph3d/wasm';

await layout.enableWasmForce(forceWasmUrl); // streaming (browser): URL | Response
layout.enableWasmForceSync(bytes); // raw bytes (Node/tests), never fetches
```

該核心沒有 `@vectojs/core` 依賴 — `three` 仍然是唯一的 peer。請參閱 [`VectoForceLayout`](/reference/graph3d-layout/#vectoforcelayout) 以取得完整的佈局 API，包括 `measurePhases` 剖析選項。

## 參考頁面

| 頁面                                                          | 涵蓋內容                                                                                                                                           |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/) | `GraphData` 資料模型、適合 Worker 的 `GraphLayout` 合約、`VectoForceLayout`（預設）和 `D3ForceLayout` 選項、WASM 核心，以及力重啟模式。            |
| [`Graph3D` & 選取](/reference/graph3d-renderer/)              | 實例化的 Three.js 渲染器（`setGraphData`/`applyPositions`/`pickNode`/`getNodePosition`/`dispose`）加上 `GraphInteraction` — 懸停、選取和拖曳固定。 |

---

## 設計說明

- **天生適合 Worker 使用。** `GraphLayout` 介面的存在就是為了讓物理模擬可以脫離主執行緒執行 — `positions` 是一個 `Float32Array`，可以透過 `postMessage` 邊界零拷貝傳輸，而 `Graph3D.applyPositions()` 無需知道該緩衝區來自同步呼叫還是 Worker 訊息。
- **渲染器/佈局完全分離。** `Graph3D` 從不匯入佈局類別，`GraphLayout` 實作也從不匯入 Three.js — 將 `VectoForceLayout` 換成 `D3ForceLayout`、完全不進行模擬的靜態/預先計算佈局，或未來的 `ngraph` 轉接器，在呼叫端只需一行程式碼的變更。
- **基於 `@vectojs/ui` 和 [`@vectojs/three`](/reference/three/)（場景到紋理的告示板，在 WebXR 中仍能正常運作）的互動式世界內節點卡片和 HUD 元件**是計劃在此套件之上建構的下一層 — 尚未推出。

## 建議的文件站頁面

- **Learn / 3D 圖形視覺化** — 佈局與渲染器分離、調整 `VectoForceLayout` 力、選取，以及在 Worker 中託管佈局。
- **Reference / API** — [`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/)、[`Graph3D` & 選取](/reference/graph3d-renderer/)。
