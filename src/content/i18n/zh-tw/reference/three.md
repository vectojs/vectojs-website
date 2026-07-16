---
title: '@vectojs/three'
description: 'VectoJS 的 Three.js 轉接器：將 2D UI 面板渲染為 3D 紋理（ThreeAdapter），或使用 Three.js 作為渲染後端（ThreeRenderer）。'
order: 41
---

# `@vectojs/three`

兩個匯出，兩個不同的使用案例：

| 匯出                                          | 使用案例                                                                                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`ThreeAdapter`](/reference/three-adapter/)   | 將 VectoJS `Scene` 渲染到轉接器擁有或呼叫者提供的 canvas 上，將其公開為 `THREE.CanvasTexture`，並透過 UV 光線投射連接指標事件。其餘 Three.js 場景保持不變。 |
| [`ThreeRenderer`](/reference/three-renderer/) | 使用 Three.js 作為 VectoJS `Scene` 的 2D 渲染後端 — fills、strokes 和文字成為正交場景中的 Three.js 網格，而非 Canvas 2D 繪製呼叫。                          |

`ThreeAdapter` 是常見路徑：您有一個 3D 場景，並希望一個 2D UI 面板漂浮在表面上 — 請參閱其頁面了解建構函式、WebXR/多點觸控事件處理以及完整的逐步範例。`ThreeRenderer` 適用於已經採用 Three.js 並希望使用硬體加速的 2D 基本體而無需 Canvas 2D 回退的專案 — 請參閱其頁面了解已實作的 `IRenderer` 方法和漸層著色器佈局。

---

## 安裝

```sh
bun add @vectojs/three three
```

對於 TypeScript 專案，請新增 Three.js 型別：

```sh
bun add -d @types/three
```

---

## 疑難排解

### 漸層渲染為純色而非混合色

`stroke()` 不支援漸層 — 它始終使用第一個顏色停止點作為純色。如果您需要漸層繪製的形狀輪廓效果，請使用帶有封閉路徑的 `fill()`。

同時確認您是從 `ThreeRenderer` 呼叫 `createLinearGradient()`（回傳 `WebGLGradient`），而不是從 `CanvasRenderingContext2D` — 跨實作混合渲染器漸層物件會產生未定義行為。

### 文字在高 DPI 顯示器上顯得更模糊

請**不要**將建構函式維度預乘 `window.devicePixelRatio` — `@vectojs/core` 的 `CanvasRenderer` 已經在內部按 DPR 縮放轉接器 canvas 的備用儲存區（預乘會使緩衝區雙倍縮放，同時扭曲您的邏輯佈局空間）。瀏覽器層級的 DPR 已為您處理。

如果面板文字仍然看起來模糊，原因是 3D 投影，而非 DPR：平面的螢幕上區域超過了紋理的解析度（camera 太近，或網格相對於紋理大小縮放得太大）。增加請求的 `width`/`height` — 這會提高紋理解析度，並為場景提供成比例更多的邏輯佈局空間：

```ts
// 更清晰的紋理：相同世界空間網格大小下，更多邏輯 + 實體畫素
const adapter = new ThreeAdapter({ width: 1024, height: 640 });
adapter.mesh.scale.set(3.2, 3.2 * (640 / 1024), 1); // 世界大小不變；密度加倍
```

請注意，entity 位置和字型大小以邏輯畫素表示，因此將建構函式維度加倍而不調整佈局，會使您的 UI 僅佔據面板的四分之一 — 請連同位置和大小一起縮放。

### 指標事件對 VectoJS 元件無效

`updateIntersection()` 必須在每個應處理輸入的幀上呼叫 — 僅在 DOM 事件監聽器中呼叫是不夠的，因為 raycaster 在事件發生時需要當前的 camera 和網格狀態。請確認：

1. `updateIntersection()` 在您的渲染迴圈內部（或直接在指標事件處理常式中使用新設定的 raycaster）呼叫。
2. raycaster 的 camera 與用於渲染場景的 camera 匹配。
3. 光線投射時 `adapter.mesh` 是 Three.js 場景圖的一部分 — 孤立網格（未新增到場景）不會被相交。

## 相關

[`ThreeAdapter`](/reference/three-adapter/) · [`ThreeRenderer`](/reference/three-renderer/) ·
[`IRenderer` / `CanvasRenderer`](/reference/core-renderer/)
