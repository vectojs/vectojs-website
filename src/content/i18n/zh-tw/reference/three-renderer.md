---
title: 'ThreeRenderer'
description: '使用 Three.js 作為 VectoJS Scene 的 IRenderer 後端：已實作的方法、GLSL 漸層著色器佈局，以及線寬限制說明。'
order: 43
---

# `ThreeRenderer`

屬於 [`@vectojs/three`](/reference/three/)。

`ThreeRenderer` 使用 Three.js 實作來自 [`@vectojs/core`](/reference/core-renderer/) 的 `IRenderer` 介面 — 填充、筆畫和文字會被渲染為 Three.js 網格和線條到正交場景中，而非 Canvas 2D 操作。當 Three.js 已在您的專案中，且您希望 VectoJS 場景本身使用 WebGL 管線而非 Canvas 2D 進行渲染時使用。

## 何時使用

- 您希望 VectoJS 的 2D 內容透過為提供的 canvas 建立的專用 `THREE.WebGLRenderer` 渲染為 Three.js 物件。
- 您需要由 GLSL 著色器支援的硬體加速漸層填充。
- 您正在基準測試或試驗純 WebGL 2D 管線。

若要將 2D UI 嵌入到 3D 表面上，建議使用 [`ThreeAdapter`](/reference/three-adapter/) — 它不需要您放棄 Canvas 2D 渲染。

## 建構函式

```ts
new ThreeRenderer(canvas: HTMLCanvasElement)
```

建立：

- 使用 `{ canvas, alpha: true, antialias: true }` 的 `THREE.WebGLRenderer`
- Y 軸朝下的 `THREE.OrthographicCamera`（top = 0, bottom = height）以匹配 VectoJS 的座標系統
- 自動將像素比設為 `window.devicePixelRatio`

`ThreeRenderer` 建立並擁有此 WebGLRenderer；它不接受或重複使用現有的渲染器/上下文。`dispose()` 會移除活躍物件、釋放其幾何/材質/紋理資源、重置堆疊，並恰好一次釋放所擁有的 WebGLRenderer。

## 公開屬性

| 屬性       | 類型                       |
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

| 方法                                                                                      | 說明                                                                                                                      |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `beginPath()` `moveTo()` `lineTo()` `bezierCurveTo()` `closePath()` `arc()` `roundRect()` | 路徑累積；在 `fill()` 或 `stroke()` 時刷新。                                                                              |
| `fill(colorOrGradient)`                                                                   | 透過 `MeshBasicMaterial` 的純色填充；透過 GLSL `ShaderMaterial` 的漸層（見下文）。CSS 顏色 alpha 乘以繼承的渲染器 alpha。 |
| `stroke(colorOrGradient, lineWidth?)`                                                     | `LineBasicMaterial`。請參閱下方的線寬限制說明。                                                                           |
| `fillText(text, x, y, font, color)`                                                       | 將文字渲染到離屏 canvas，上傳為 `THREE.CanvasTexture`。漸層回退到第一個顏色停止點。                                       |
| `fillCircle(cx, cy, radius, color, alpha?)`                                               | 32 分段的 `THREE.CircleGeometry` + `MeshBasicMaterial`。                                                                  |
| `drawImage(source, dx, dy, dw, dh)`                                                       | `THREE.CanvasTexture` + `PlaneGeometry`。                                                                                 |
| `save()` `restore()` `translate()` `scale()` `rotate()` `setGlobalAlpha()` `clip()`       | 變換/alpha 堆疊；巢狀裁剪會交集。剪刀裁剪使用變換後的世界 AABB，因此旋轉/傾斜的裁剪是軸對齊的近似值。                     |
| `createLinearGradient(x0, y0, x1, y1, colorStops)`                                        | 返回一個由 `fill()` 使用的 `WebGLGradient` 描述子。                                                                       |
| `flush()`                                                                                 | 呼叫 `renderer.render(scene, camera)`。                                                                                   |
| `resize(width, height)`                                                                   | 更新 `renderer.setSize()` 並重新計算攝影機邊界。                                                                          |
| `clear()`                                                                                 | 釋放影格幾何/材質並重置路徑、變換、alpha 和剪刀堆疊狀態。                                                                 |

## 線寬限制說明

`THREE.LineBasicMaterial.linewidth` 在大多數平台上會被 WebGL **靜默忽略** — 無論傳遞給 `stroke()` 的值為何，線條都會被限制為 1 px。這是瀏覽器/GPU 驅動程式的限制，而非 VectoJS 的限制。

如果您的設計需要粗筆畫（> 1 px），請考慮：

- 對直線使用帶有矩形路徑的 `fill()` 而非 `stroke()`。
- 切換到使用預設 `CanvasRenderer` 的 [`ThreeAdapter`](/reference/three-adapter/)，它透過 Canvas 2D 支援任意線寬。
- 在應用程式層手動整合 `THREE.MeshLine` — `ThreeRenderer` 未捆綁此依賴。

## 漸層支援

`ThreeRenderer.createLinearGradient()` 返回一個 `WebGLGradient` 描述子。當傳遞給 `fill()` 時，渲染器會編譯一個具有以下 uniform 佈局的 GLSL `ShaderMaterial`：

```glsl
uniform vec4 u_grad_colors[8];  // 每個停止點的 RGBA
uniform float u_grad_stops[8];  // 標準化位置 [0, 1]
uniform vec2 u_grad_start;      // 世界空間起點
uniform vec2 u_grad_end;        // 世界空間終點
```

顏色在世界空間中在兩個最近的停止點之間線性插值。如果提供了超過 8 個停止點，它們會在上傳前重新取樣為 8 個均勻間隔的點 — 超過 8 個停止點的顏色細節會遺失。

**`stroke()` 或 `fillText()` 不支援漸層。** 將 `WebGLGradient` 傳遞給 `stroke()` 會回退到第一個停止點顏色。`fillText()` 也會回退到第一個停止點顏色，因為文字字形在匯出前會透過 Canvas 2D 進行光柵化。

請參閱[主要 `@vectojs/three` 頁面](/reference/three/#疑難排解)了解漸層/DPI/指標問題的疑難排解。

## 相關

[`ThreeAdapter`](/reference/three-adapter/)（替代使用案例 — 3D 表面上的 2D 面板）·
[`IRenderer` / `CanvasRenderer`](/reference/core-renderer/)（此處實作的介面）·
[`@vectojs/three` 概覽](/reference/three/)
