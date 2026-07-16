---
title: '@vectojs/graph3d'
description: '3D 力導向圖形視覺化：一個可插拔的 GraphLayout 介面加上一個 instanced Three.js 渲染器，只需兩次繪製呼叫即可繪製任何圖形。'
order: 44
---

# `@vectojs/graph3d`

文件版本：**0.2.0**

VectoJS 的 3D 力導向圖形視覺化：一個可插拔的 `GraphLayout` 契約（對 worker 友好，位置以單一平面 `Float32Array` 表示）加上 `Graph3D`，一個 instanced Three.js 渲染器，無論有多少節點，都能在恰好兩次繪製呼叫中繪製任何圖形。請參閱即時 [Les Misérables 示範](/demos/graph3d/) 了解標準 77 節點/254 連結資料集的運動效果。

## 安裝

```bash
bun add @vectojs/graph3d three
```

`three` 是對等相依性 — `@vectojs/graph3d` 繪製到您新增到自己場景的 `THREE.Group` 中，並且不管理 `WebGLRenderer`、camera 或 controls 本身。

## 使用方式

```ts
import { D3ForceLayout, Graph3D } from '@vectojs/graph3d';
import * as THREE from 'three';

const data = {
  nodes: [{ id: 'vectojs', val: 8, color: '#4f9cff' }, { id: 'core' }, { id: 'ui' }],
  links: [
    { source: 'vectojs', target: 'core' },
    { source: 'vectojs', target: 'ui' },
  ],
};

const layout = new D3ForceLayout();
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

一旦模擬冷卻（alpha 低於
閾值），`layout.step()` 會回傳 `false` — 上述範例隨後停止自己的 rAF 迴圈，但允許用戶即時調整力（電荷強度、連結距離）的呼叫者應
無論該標誌如何都保持每幀渲染，並僅在該標誌上對物理 `step()`/
`applyPositions()` 呼叫進行閘控，以便即使在佈局穩定後，`OrbitControls` 阻尼和 camera
移動也能保持流暢。

## 參考頁面

| 頁面                                                          | 涵蓋內容                                                                                                                                            |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/) | `GraphData` 資料模型、對 worker 友好的 `GraphLayout` 契約、`D3ForceLayout` 選項以及 force-restart 模式。                                            |
| [`Graph3D` & picking](/reference/graph3d-renderer/)           | instanced Three.js 渲染器（`setGraphData`/`applyPositions`/`pickNode`/`getNodePosition`/`dispose`）加上 `GraphInteraction` — 懸停、選取和拖曳固定。 |

---

## 設計說明

- **建構上對 worker 友好。** `GraphLayout` 介面存在的
  目的正是為了讓物理模擬可以在主執行緒之外執行 — `positions`
  是一個 `Float32Array`，可以透過 `postMessage` 邊界零拷貝傳輸，
  而 `Graph3D.applyPositions()` 永遠不需要知道該緩衝區
  來自同步呼叫還是 worker 訊息。
- **渲染器/佈局完全分離。** `Graph3D` 從不匯入佈局
  類別，`GraphLayout` 實作也從不匯入 Three.js — 將
  `D3ForceLayout` 替換為未來的 `ngraph` 轉接器，或完全沒有模擬的靜態/預計算
  佈局，在呼叫點上只是一行變更。
- **基於 `@vectojs/ui` 和 [`@vectojs/three`](/reference/three/)（場景到紋理的廣告牌，
  在 WebXR 中也能運作）的互動式世界空間節點卡片和 HUD 元件**
  是計劃在此套件之上建構的下一層 —
  尚未發布。

## 建議的文件站頁面

- **Learn / 3D 圖形視覺化** — 佈局與渲染器分離、調整
  `D3ForceLayout` 力、選取以及 worker 託管的佈局。
- **Reference / API** — [`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/)、
  [`Graph3D` & picking](/reference/graph3d-renderer/)。
