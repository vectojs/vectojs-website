---
title: 'ThreeAdapter'
description: '將 VectoJS Scene 渲染到 canvas 上，公開為 THREE.CanvasTexture，並透過 UV 光線投射連接指標事件（包括 WebXR 控制器和多點觸控）。'
order: 42
---

# `ThreeAdapter`

屬於 [`@vectojs/three`](/reference/three/)。

`ThreeAdapter` 使用提供的 `canvas`，或在省略時建立一個。它將 VectoJS `Scene` 渲染到該 canvas 上，將結果包裝為 `THREE.CanvasTexture`，並提供一個立即可用的 `THREE.Mesh`（一個帶有 `MeshBasicMaterial` 的單位 `PlaneGeometry`）。來自 Three.js 事件監聽器的指標和滾動事件透過光線投射轉換回 VectoJS 邏輯座標。

當您有 3D 場景並希望一個 2D UI 面板漂浮在表面上時使用此轉接器 — 其餘 Three.js 場景保持不變，您保留 Canvas 2D 渲染。若要將 Three.js 用作 `Scene` 本身的渲染後端，請參閱 [`ThreeRenderer`](/reference/three-renderer/)。

## 建構函式

```ts
new ThreeAdapter(options: ThreeAdapterOptions)
```

```ts
interface ThreeAdapterOptions {
  width: number; // 2D UI 場景的邏輯寬度（CSS px）
  height: number; // 邏輯高度（CSS px）
  canvas?: HTMLCanvasElement; // 可選的預先存在 canvas；省略時轉接器會建立一個
  sceneOptions?: SceneOptions; // 轉發給 VectoScene 建構函式
}
```

無論您在 `sceneOptions` 中傳入什麼，`disableWindowResize` 都會在內部強制設為 `true` — 轉接器透過 `resize(w, h)` 而非 window 擁有 resize。

## 公開屬性

| 屬性         | 型別                  | 描述                                                                                          |
| ------------ | --------------------- | --------------------------------------------------------------------------------------------- |
| `texture`    | `THREE.CanvasTexture` | 包裝 VectoJS canvas 的紋理。在每次 VectoJS 渲染幀後自動設定 `needsUpdate = true`。            |
| `vectoScene` | `VectoScene`          | 活躍的 VectoJS `Scene` 實例。將 entity 新增到此處。                                           |
| `canvas`     | `HTMLCanvasElement`   | 轉接器擁有或呼叫者提供的 canvas，VectoJS 在其上繪製。                                         |
| `mesh`       | `THREE.Mesh`          | 預先建立的 `PlaneGeometry(1, 1)` + `MeshBasicMaterial` 網格，準備好放入您的 Three.js 場景中。 |

## 方法

### `updateIntersection(raycaster, type, originalEvent?)`

```ts
updateIntersection(
  raycaster: THREE.Raycaster,
  type: 'pointerdown' | 'pointerup' | 'pointermove' | 'wheel' | 'click',
  originalEvent?: PointerEvent | WheelEvent
): boolean
```

將光線投射到轉接器網格上，將 UV 命中點轉換為 VectoJS canvas 座標，並將事件分發到 VectoJS 場景中。當光線與網格相交時回傳 `true`。

指標按鈕狀態和 `shiftKey`/`ctrlKey`/`altKey`/`metaKey` 會被保留；
滾輪事件額外保留所有 delta 和修飾鍵。

從您的 Three.js 渲染迴圈或指標事件監聽器內部呼叫此方法。轉接器維護每個 `pointerId` 的懸停狀態，因此 WebXR 控制器和多點觸控輸入各自攜帶獨立的懸停/焦點上下文。

**UV 重新映射**：Three.js UV 座標在平面底部為 Y=0；VectoJS 在頂部為 Y=0。轉接器自動翻轉 Y 軸 — 您無需調整座標。

### `resize(width, height)`

```ts
resize(width: number, height: number): void
```

調整 canvas 和底層邏輯 `VectoScene` 的大小。當面板的渲染解析度或 2D 佈局視口變更時呼叫；僅變更網格的世界空間縮放不需要此操作。

### `dispose()`

```ts
dispose(): void
```

可重複地清理 `THREE.CanvasTexture`、幾何和材質在網格上，分離網格，還原 Scene 渲染方法，銷毀 `VectoScene`，並清除所有每指標狀態。轉接器建立的 canvas 會釋放為 `0×0`；呼叫者提供的 canvas 保留其維度。

## 完整範例

以下範例在 Three.js 場景中的旋轉平面上渲染 VectoJS 設定面板。來自 `pointermove`、`pointerdown` 和 `pointerup` DOM 監聽器的指標事件透過 `updateIntersection` 轉發到 VectoJS。

```ts
import * as THREE from 'three';
import { ThreeAdapter } from '@vectojs/three';
import { Text, Button, Stack } from '@vectojs/ui';

// --- Three.js 場景設定 ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const threeScene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 3);

// --- VectoJS 面板轉接器（512×256 邏輯畫素，顯示在 2×1 平面上）---
const adapter = new ThreeAdapter({ width: 512, height: 256 });

const heading = new Text('Settings', { font: '600 24px Inter', color: '#f8fafc' });
const applyBtn = new Button('Apply', { width: 120, height: 40 });
applyBtn.on('click', () => console.log('apply clicked'));

const stack = new Stack({ direction: 'vertical', gap: 20 });
stack.add(heading);
stack.add(applyBtn);
stack.setPosition(20, 20);
adapter.vectoScene.add(stack);

adapter.vectoScene.start();

// --- 將網格放入 Three.js 場景 ---
const panel = adapter.mesh;
panel.scale.set(2, 1, 1); // 世界空間大小與 2:1 寬高比匹配
threeScene.add(panel);

// --- 用於事件轉譯的光線投射器 ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function updatePointer(event: PointerEvent) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

window.addEventListener('pointermove', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'pointermove', e);
});

window.addEventListener('pointerdown', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'pointerdown', e);
});

window.addEventListener('pointerup', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'pointerup', e);
});

window.addEventListener('click', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'click', e);
});

window.addEventListener('wheel', (e) => {
  updatePointer(e as unknown as PointerEvent);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'wheel', e);
});

// --- 渲染迴圈 ---
function animate() {
  requestAnimationFrame(animate);
  panel.rotation.y += 0.005;
  renderer.render(threeScene, camera);
}

animate();

// --- 清理 ---
window.addEventListener('unload', () => adapter.dispose());
```

## 轉接器內部運作原理

建構函式會 monkey-patch `vectoScene.render` 以在每次 VectoJS 幀後設定 `texture.needsUpdate = true`。Three.js 隨後在下一次 `renderer.render()` 呼叫時將 canvas 上傳到 GPU。無需輪詢或手動同步。

光線投射 UV 座標會映射到場景的**邏輯**座標空間（`vectoScene.width`/`height` — 您傳入建構函式的維度），而不是轉接器 canvas 的實體備用儲存區大小。這個區別在 HiDPI 顯示器上很重要：`@vectojs/core` 的 `CanvasRenderer` 將備用儲存區按 `devicePixelRatio` 縮放以獲得清晰渲染（`canvas.width = logicalWidth × dpr`），而 entity 佈局和點擊測試保持在邏輯座標。

> [!WARNING] > **在 `@vectojs/three` ≤ 0.1.1 中，UV 映射使用了實體 canvas 大小** — 因此在任何 `devicePixelRatio ≠ 1` 的顯示器或瀏覽器縮放級別上，每個指標事件都恰好落在游標右下方的 DPR 因子位置。症狀很明顯：點擊啟動面板上**比游標所在位置更深處**的控制項，偏移量隨著目標在面板中越深而越大 — 而在 DPR-1 顯示器和無頭測試環境中表現完全正常。已在 **0.1.2** 中修復；請升級而非繞道解決。

由 `updateIntersection` 分發的命中事件會轉發到 entity 的無障礙 DOM 元素（當存在**且連接到活躍文件**時 — 這會透過 a11y 陰影層路由它們，並在互動式元件上觸發 `click`/`change`），否則直接以 `VectoJSEvent` 物件形式轉發。

> [!NOTE]
> 使用預設轉接器建立的 canvas 時，面板採用直接的 `VectoJSEvent` 路徑，因為 canvas 及其 a11y 根是分離的。如果您提供一個連接到 `document` 的 canvas，其已連接的 a11y 元素可以使用 DOM 分發路徑。`@vectojs/three` 0.1.1 及更新版本會檢查連線狀態，而不是假設任一情況。
>
> **這對於 `Toggle`/`Button` 的正確性很重要，而不僅僅是為了避免拋出錯誤。** 在 `@vectojs/three` 0.1.0 中，未連接的 a11y 元素可能錯誤地走 DOM 分發分支並靜默錯過元件回呼。0.1.1 及更新版本會直接路由未連接的元素。預設分離 canvas 無法使用原生 DOM 焦點/IME/螢幕閱讀器行為，但在呼叫者提供的 canvas 及其投射層已連接時仍可能。

## WebXR 和多點觸控

`updateIntersection` 追蹤取自 `originalEvent` 的每個 `pointerId` 的懸停狀態。在 WebXR 會話中，每個控制器攜帶自己的 `pointerId`，因此用一個控制器懸停不會干擾另一個控制器的狀態。將原始 `XRInputSourceEvent` 包裝在合成的 `PointerEvent` 中，並將控制器的 `inputSource.handedness` 編碼為 `pointerId`（0 表示左，1 表示右），以維護獨立的命中狀態。

```ts
// WebXR 範例 — 最小控制器事件轉發
session.addEventListener('selectstart', (xrEvent) => {
  const synth = new PointerEvent('pointerdown', {
    pointerId: xrEvent.inputSource === leftController ? 0 : 1,
  });
  raycaster.setFromCamera(controllerUV, camera);
  adapter.updateIntersection(raycaster, 'pointerdown', synth);
});
```

## 相關

[`ThreeRenderer`](/reference/three-renderer/)（替代使用案例 — Three.js 作為 `Scene` 的渲染後端）·
[`Scene`](/reference/core-scene/)（`vectoScene`）·
[`@vectojs/three` 概覽](/reference/three/)
