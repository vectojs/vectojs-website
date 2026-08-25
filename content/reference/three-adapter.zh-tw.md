+++
title = "ThreeAdapter"
description = "將 VectoJS Scene 渲染到 canvas 上，公開為 THREE.CanvasTexture，並透過 UV 光線投射連接指標事件（包括 WebXR 控制器和多點觸控）以及面板焦點與鍵盤路由。"
weight = 42
+++

# `ThreeAdapter`

屬於 [`@vectojs/three`](/reference/three/)。

`ThreeAdapter` 使用提供的 `canvas`，或者在省略時建立一個。它將 VectoJS `Scene` 渲染到該 canvas 上，將結果包裝為 `THREE.CanvasTexture`，並提供一個立即可用的 `THREE.Mesh`（一個單位 `PlaneGeometry` 搭配 `MeshBasicMaterial`）。來自 Three.js 事件監聽器的指標和捲動事件會透過光線投射翻譯回 VectoJS 邏輯座標。

當您有一個 3D 場景並希望在表面上浮動一個 2D UI 面板時使用此功能 — Three.js 場景的其餘部分不受影響，且您保留 Canvas 2D 渲染。如需將 Three.js 用作 `Scene` 本身的渲染後端，請參閱 [`ThreeRenderer`](/reference/three-renderer/)。

## 建構函式

```ts
new ThreeAdapter(options: ThreeAdapterOptions)
```

```ts
interface ThreeAdapterOptions {
  width: number; // 2D UI 場景的邏輯寬度（CSS px）
  height: number; // 邏輯高度（CSS px）
  canvas?: HTMLCanvasElement; // 可選的預先存在的 canvas；省略時轉接器會建立一個
  sceneOptions?: SceneOptions; // 轉發給 VectoScene 建構函式
}
```

無論您在 `sceneOptions` 中傳入什麼，`disableWindowResize` 都會被內部強制設為 `true` — 轉接器透過 `resize(w, h)` 而非視窗來控制大小調整。

## 公開屬性

| 屬性         | 類型                  | 描述                                                                                    |
| ------------ | --------------------- | --------------------------------------------------------------------------------------- |
| `texture`    | `THREE.CanvasTexture` | 包裝 VectoJS canvas 的紋理。在每次 VectoJS 渲染影格後自動設定 `needsUpdate = true`。    |
| `vectoScene` | `VectoScene`          | 活躍的 VectoJS `Scene` 實例。在此加入 Entity。                                          |
| `canvas`     | `HTMLCanvasElement`   | 轉接器擁有或呼叫者提供的 canvas，VectoJS 在其上繪製。                                   |
| `mesh`       | `THREE.Mesh`          | 預先建立的 `PlaneGeometry(1, 1)` + `MeshBasicMaterial` 網格，可直接放入 Three.js 場景。 |

## 方法

### `updateIntersection(raycaster, type, originalEvent?)`

```ts
updateIntersection(
  raycaster: THREE.Raycaster,
  type: 'pointerdown' | 'pointerup' | 'pointermove' | 'pointercancel' | 'wheel' | 'click',
  originalEvent?: PointerEvent | WheelEvent
): boolean
```

將光線投射到轉接器網格上，將 UV 命中點轉換為 VectoJS canvas 座標，並將事件分派到 VectoJS 場景中。當光線與網格交集時返回 `true`。

指標按鈕狀態和 `shiftKey`/`ctrlKey`/`altKey`/`metaKey` 會被保留；滾輪事件還會保留所有 delta 和修飾鍵。

在您的 Three.js 渲染迴圈或指標事件監聽器中呼叫此方法。轉接器會維護每個 `pointerId` 的懸停狀態，因此 WebXR 控制器和多點觸控輸入各自擁有獨立的懸停/焦點上下文。

**UV 重新對應**：Three.js 的 UV 座標中 Y=0 在平面的底部；VectoJS 中 Y=0 在頂部。轉接器會自動翻轉 Y 軸 — 您無需調整座標。

### `resize(width, height)`

```ts
resize(width: number, height: number): void
```

調整 canvas 和底層邏輯 `VectoScene` 的大小。當面板的渲染解析度或 2D 佈局視口變更時呼叫；僅變更網格的世界空間縮放不需要此操作。

## 面板焦點與鍵盤輸入（0.1.10+）

適配器 canvas 是離屏的，其投影的無障礙鏡像永遠不會成為 `document.activeElement`，瀏覽器的焦點模型也無法觸及它們。適配器以**面板焦點**填補這一空缺——這是 Three 側的狀態，由指標互動和 `focus()` 驅動、由按鍵路由消費，並且每次轉換都透過合成 `FocusEvent` 橋接，使 core 側的狀態（實體 `focus`/`blur` 事件、游標閃爍喚醒）與已連接的 canvas 保持一致。

```ts
adapter.focusedEntity: Entity | null // read-only — the entity holding panel focus
adapter.focus(entity: Entity | null): void // move focus, or blur with null
adapter.blur(): void // release panel focus
adapter.isFocusable(entity: Entity): boolean // projects as keyboard-reachable?
```

`isFocusable` 是 DOM 可定位焦點性（tabbability）的面板側類比：當投影鏡像帶有 `tabindex` 屬性或呈現為原生可聚焦標籤（`button`/`input`/`textarea`/`select`/`a[href]`）時為真。pointerdown 會聚焦命中目標中最近的可達祖先——點擊按鈕內的 `<span>` 會聚焦該按鈕，而投影中沒有任何可達元素的命中鏈會導致失焦。

### `dispatchKey(key, mods?, phase?)`

```ts
dispatchKey(
  key: string,
  mods?: { ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; metaKey?: boolean; code?: string },
  phase?: 'press' | 'keydown' | 'keyup', // default 'press' — synthesizes keydown+keyup
): void
```

`updateIntersection` 的鍵盤對應物：合成一個按鍵事件，並將其透過與已連接 canvas 相同的分發路徑進行路由。路由規則依序為：

1. **面板焦點** —— 當某個實體持有面板焦點時，事件被分發到其投影鏡像，因此 core 自己的監聽器原樣執行：實體的 `keydown`/`keyup` 處理器收到事件，投影控件保持其啟動契約（press 觸發 `Enter`、release 觸發 `Space`）。
2. **所有權** —— 當被聚焦實體是_鍵盤所有者_時，面板獨佔這些按鍵，任何內容都不會洩漏到頁面。所有者是投影 `input`/`textarea`/`select` 標籤或 core 的 `KEYBOARD_OWNING_ROLES` 中角色的實體：互動角色（`button`、`switch`、`checkbox`、`radio`、`link`、`tab`、`menuitem`、`slider`、`combobox`）加上鍵盤優先角色 `textbox`、`searchbox`、`spinbutton`、`option` 和 `listbox`。方向鍵移動滑桿而不是旋轉你的相機；鍵入到達文字框而不是觸發頁面快捷鍵。
3. **通道轉發** —— 否則事件繼續前往 `window`，由場景級按鍵通道套用其原生閘控（`defaultPrevented`、按鍵自動重複、`ownsKeyboard(document.activeElement)`），因此除非頁面級鍵盤所有者持有焦點，場景快捷鍵和頁面級消費者都能看到事件。實體處理器在合成事件上呼叫 `preventDefault()` 會抑制轉發，與已連接 canvas 的氣泡一致。
4. **無面板焦點** —— 事件直接前往 `window`，由相同的閘控決定。

`code` 預設採用盡力推斷（`'a'` → `'KeyA'`，`' '` → `'Space'`，數字 → `'DigitN'`）。對於推斷無法命名的布局，傳入 `mods.code` 覆寫。

### `dispatchPointer(type, x, y, init?)`

```ts
dispatchPointer(
  type: 'pointerdown' | 'pointerup' | 'pointercancel' | 'pointermove' | 'click',
  x: number, // logical scene-space X (origin top-left)
  y: number, // logical scene-space Y
  init?: { pointerId?: number; button?: number; buttons?: number;
           ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; metaKey?: boolean },
): boolean // whether the point hit an entity
```

以**邏輯場景座標**合成指標輸入——這正是實體佈局和 `findEntityAt` 所使用的空間。事件流經與光線投射驅動的 `updateIntersection` 完全相同的下游路徑：懸停轉換、實體分發、由 pointerdown 驅動的聚焦和紋理髒標記排程行為完全一致，這使其成為沒有 raycaster 的測試和自動化的入口點。滾輪輸入被刻意排除在外——滾輪增量沒有中立預設值，因此請透過 `updateIntersection` 並攜帶真實 `WheelEvent` 來路由它們。

### `dispose()`

```ts
dispose(): void
```

冪等地釋放網格上的 `THREE.CanvasTexture`、幾何圖形和材質，分離網格，恢復 Scene 渲染方法，銷毀 `VectoScene`，並清除所有每個指標的狀態（面板焦點隨場景一起消亡）。轉接器建立的 canvas 會被釋放為 `0×0`；呼叫者提供的 canvas 保留其尺寸。

## 完整範例

以下範例在 Three.js 場景中的旋轉平面上渲染一個 VectoJS 設定面板。來自 `pointermove`、`pointerdown` 和 `pointerup` DOM 監聽器的指標事件透過 `updateIntersection` 轉發到 VectoJS。

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

// --- VectoJS 面板轉接器（512×256 邏輯像素，顯示在 2×1 平面上）---
const adapter = new ThreeAdapter({ width: 512, height: 256 });

const heading = new Text('Settings', {
  font: '600 24px Inter',
  color: '#f8fafc',
});
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
panel.scale.set(2, 1, 1); // 世界空間大小匹配 2:1 長寬比
threeScene.add(panel);

// --- 用於事件翻譯的光線投射器 ---
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

## 轉接器內部運作方式

建構函式會猴子補丁 `vectoScene.render`，在每個 VectoJS 影格後設定 `texture.needsUpdate = true`。然後 Three.js 會在下一次 `renderer.render()` 呼叫時將 canvas 上傳到 GPU。無需輪詢或手動同步。

光線投射 UV 座標會對應到場景的**邏輯**座標空間（`vectoScene.width`/`height` — 您傳遞給建構函式的尺寸），而非轉接器 canvas 的物理備用儲存區大小。這個區別在 HiDPI 顯示器上很重要：`@vectojs/core` 的 `CanvasRenderer` 會按 `devicePixelRatio` 縮放備用儲存區以獲得清晰渲染（`canvas.width = logicalWidth × dpr`），而 Entity 佈局和點擊測試仍保持邏輯座標。

> [!WARNING] > **在 `@vectojs/three` ≤ 0.1.1 中，UV 對應使用的是物理 canvas 大小** — 因此在任何 `devicePixelRatio ≠ 1` 的顯示器或瀏覽器縮放層級下，每個指標事件都會恰好偏移 DPR 因子，落在游標的右下方。其症狀很容易辨識：點擊會觸發面板上比游標所在位置**更下方**的控制項，且偏移量隨著目標在面板中越深而增大 — 而在 DPR-1 顯示器和無頭測試環境中則完全正常。在 **0.1.2** 中已修復；請升級而非繞過此問題。

由 `updateIntersection` 分派的命中事件在存在無障礙 DOM 元素**且該元素已連接到實時文件**時（這會路由事件通過 a11y 陰影層，並在互動式元件上觸發 `click`/`change`），會轉發到該元素，否則直接作為 `VectoJSEvent` 物件發送。

> [!NOTE]
> 使用預設的轉接器建立 canvas 時，面板會走直接的 `VectoJSEvent` 路徑，因為 canvas 及其 a11y 根是分離的。如果您提供一個已連接到 `document` 的 canvas，其已連接的 a11y 元素可以使用 DOM 分派路徑。`@vectojs/three` 的 0.1.1 及更新版本會檢查連線狀態，而非假設任一情況。
>
> **這對 `Toggle`/`Button` 的正確性很重要，而不僅僅是為了避免拋出錯誤。** 在 `@vectojs/three` 的 0.1.0 版本中，已斷開連接的 a11y 元素可能會錯誤地走 DOM 分派分支，並靜默地錯過元件回呼。0.1.1 及更新版本會將已斷開連接的元素直接路由。原生 DOM 焦點/IME/螢幕閱讀器行為不適用於預設的獨立 canvas，但在呼叫者提供的 canvas 及其投射層已連接時仍然可能。

## WebXR 與多點觸控

`updateIntersection` 會追蹤從 `originalEvent` 取得的每個 `pointerId` 的懸停狀態。在 WebXR 工作階段中，每個控制器都有自己的 `pointerId`，因此用一個控制器懸停不會干擾另一個控制器的狀態。將原始的 `XRInputSourceEvent` 包裝在合成的 `PointerEvent` 中，並將控制器的 `inputSource.handedness` 編碼為 `pointerId`（0 表示左手，1 表示右手），以維護獨立的命中狀態。

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
