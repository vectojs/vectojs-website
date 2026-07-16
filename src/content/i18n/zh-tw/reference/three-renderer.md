---
title: 'ThreeRenderer'
description: '使用 Three.js 作為 VectoJS Scene 的 IRenderer 後端：已實作的方法、GLSL 漸層著色器佈局以及線寬注意事項。'
order: 43
---

# `ThreeRenderer`

屬於 [`@vectojs/three`](/reference/three/)。

`ThreeRenderer` 使用 Three.js 實作來自 [`@vectojs/core`](/reference/core-renderer/) 的 `IRenderer` 介面 — fills、strokes 和文字被渲染為 Three.js 網格和線條，進入一個正交場景而非 Canvas 2D 操作。當 Three.js 已在您的專案中，且您希望 VectoJS 場景本身透過 WebGL 管線而非 Canvas 2D 渲染時使用它。

## 何時使用

- 您希望 VectoJS 的 2D 內容透過為提供的 canvas 建立的專用 `THREE.WebGLRenderer` 渲染為 Three.js 物件。
- 您需要由 GLSL 著色器支援的硬體加速漸層填色。
- 您正在基準測試或實驗純 WebGL 2D 管線。

若要將 2D UI 嵌入到 3D 表面上，請改用 [`ThreeAdapter`](/reference/three-adapter/) — 它不需要您放棄 Canvas 2D 渲染。

## 建構函式

```ts
new ThreeRenderer(canvas: HTMLCanvasElement)
```

建立：

- 帶有 `{ canvas, alpha: true, antialias: true }` 的 `THREE.WebGLRenderer`
- Y 指向下方的 `THREE.OrthographicCamera`（top = 0, bottom = height）以匹配 VectoJS 的座標系統
- 自動設定 pixel ratio 為 `window.devicePixelRatio`

`ThreeRenderer` 建立並擁有此 WebGLRenderer；它不接受或重用現有的渲染器/上下文。`dispose()` 會移除活躍物件、釋放其幾何/材質/紋理資源、重設堆疊，並恰好一次清理所擁有的 WebGLRenderer。

## 公開屬性

| 屬性       | 型別                       |
| ---------- | -------------------------- |
| `scene`    | `THREE.Scene`              |
| `camera`   | `THREE.OrthographicCamera` |
| `renderer` | `THREE.WebGLRenderer`      |

## 使用方式

將渲染器作為 `renderer` 選項傳遞給 VectoJS `Scene` 建構函式：

```ts
import { Scene } from '@vectojs/core';
import { ThreeRenderer } from '@vectojs/three';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const threeRenderer = new ThreeRenderer(canvas);

const scene = new Scene(canvas, { renderer: threeRenderer });
scene.add(/* entities */);
scene.start();
```

## 已實作的 IRenderer 方法

| 方法                                                                                      | 備註                                                                                                                |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `beginPath()` `moveTo()` `lineTo()` `bezierCurveTo()` `closePath()` `arc()` `roundRect()` | 路徑累積；在 `fill()` 或 `stroke()` 時提交。                                                                        |
| `fill(colorOrGradient)`                                                                   | 純色填色透過 `MeshBasicMaterial`；漸層透過 GLSL `ShaderMaterial`（見下方）。CSS 顏色 alpha 乘以繼承的渲染器 alpha。 |
| `stroke(colorOrGradient, lineWidth?)`                                                     | `LineBasicMaterial`。請參閱下方的線寬注意事項。                                                                     |
| `fillText(text, x, y, font, color)`                                                       | 將文字渲染到離屏 canvas，上傳為 `THREE.CanvasTexture`。漸層回退到第一個顏色停止點。                                 |
| `fillCircle(cx, cy, radius, color, alpha?)`                                               | 32 個區段的 `THREE.CircleGeometry` + `MeshBasicMaterial`。                                                          |
| `drawImage(source, dx, dy, dw, dh)`                                                       | `THREE.CanvasTexture` + `PlaneGeometry`。                                                                           |
| `save()` `restore()` `translate()` `scale()` `rotate()` `setGlobalAlpha()` `clip()`       | 變換/alpha 堆疊；巢狀裁剪做交集。剪刀裁剪使用轉換後的世界 AABB，因此旋轉/傾斜的裁剪是軸對齊的近似。                 |
| `createLinearGradient(x0, y0, x1, y1, colorStops)`                                        | 回傳一個由 `fill()` 消費的 `WebGLGradient` 描述子。                                                                 |
| `flush()`                                                                                 | 呼叫 `renderer.render(scene, camera)`。                                                                             |
| `resize(width, height)`                                                                   | 更新 `renderer.setSize()` 並重新計算 camera 邊界。                                                                  |
| `clear()`                                                                                 | 清理幀幾何/材質並重設路徑、變換、alpha 和剪刀堆疊狀態。                                                             |

## 線寬注意事項

`THREE.LineBasicMaterial.linewidth` 在**大多數平台上會被 WebGL 靜默忽略** — 無論傳入 `stroke()` 的值如何，線條都限制為 1 px。這是瀏覽器/GPU 驅動程式的限制，而非 VectoJS 的限制。

如果您的設計需要粗描邊（> 1 px），請考慮：

- 對直線使用帶有矩形路徑的 `fill()` 而非 `stroke()`。
- 切換到使用預設 `CanvasRenderer` 的 [`ThreeAdapter`](/reference/three-adapter/)，它透過 Canvas 2D 支援任意線寬。
- 在您的應用層手動整合 `THREE.MeshLine` — `ThreeRenderer` 不捆綁此依賴。

## 漸層支援

`ThreeRenderer.createLinearGradient()` 回傳一個 `WebGLGradient` 描述子。當傳入 `fill()` 時，渲染器會編譯一個具有以下 uniform 佈局的 GLSL `ShaderMaterial`：

```glsl
uniform vec4 u_grad_colors[8];  // 每個停止點的 RGBA
uniform float u_grad_stops[8];  // 正規化位置 [0, 1]
uniform vec2 u_grad_start;      // 世界空間起點
uniform vec2 u_grad_end;        // 世界空間終點
```

顏色在世界空間中在最近的兩個停止點之間線性插值。如果提供了超過 8 個停止點，它們會在上傳前重新取樣為 8 個均勻間隔的點 — 超過 8 個停止點的顏色細節會遺失。

**漸層不支援 `stroke()` 或 `fillText()`。** 將 `WebGLGradient` 傳入 `stroke()` 會回退到第一個停止點顏色。`fillText()` 也會回退到第一個停止點顏色，因為文字字形在上傳前經由 Canvas 2D 柵格化。

請參閱 [主 `@vectojs/three` 頁面](/reference/three/#troubleshooting) 了解漸層/DPI/指標問題的疑難排解。

## 相關

[`ThreeAdapter`](/reference/three-adapter/)（替代使用案例 — 3D 表面上的 2D 面板）·
[`IRenderer` / `CanvasRenderer`](/reference/core-renderer/)（此處實作的介面）·
[`@vectojs/three` 概覽](/reference/three/)
