---
title: '09 — Three.js / XR 橋接 — 兩個座標世界'
description: 'VectoJS 2D 畫布契約與 Three.js 3D 空間之間的轉接器：CanvasTexture 面板、raycast→UV→場景映射、離屏焦點/鍵盤擁有權，以及 Graph3D 如何呈現純 Three 對應物。'
order: 29
---

# 09 — Three.js / XR 橋接 — 兩個座標世界

> **Boss 09** 位於兩個輸入模型碰撞之處。VectoJS 渲染至具透明 a11y DOM 的 2D 邏輯像素場景，該 DOM 擁有指標與鍵盤分發；Three.js 渲染至 WebGL 場景，其中指標為射線、面板為懸浮於世界空間的紋理四邊形。`ThreeAdapter` 是唯一同時通曉兩者的元件。

- **你將學到**：為何轉接器是座標系橋接而非渲染器；`CanvasTexture` 紋理路徑與其 `needsUpdate` 代理；`Raycaster` 的 UV 如何映射至邏輯像素（與 DPR 陷阱）；指標、滾輪、懸停、焦點與鍵盤擁有權如何經離屏畫布重新路由；以及 `Graph3D`/`GraphCamera`/`GraphInteraction` 如何展示純 Three 替代方案。
- **你不會學到**：`IRenderer` 契約本身（Boss 07）、文字光柵化與 y 向下正交細節（Boss 07 §文字光柵路徑）、WASM 加速（Boss 08）或 2D 力布局調校（Boss 11）。本文件是 VectoJS 2D 契約與 3D 宿主之間的接縫。

## 1. 為何轉接器困難 — 兩個世界，一個畫布

一般的 VectoJS `Scene` 擁有插入頁面的 `<canvas>`。其 a11y 鏡像附加至該畫布的 `a11yRoot`（一個疊於畫布之上的 `<div>`），指標/鍵盤分發經那些鏡像運行（`Scene.ts:3512` 每鏡像監聽器）。在橋接中，畫布為**離屏**——它永不插入文件，而是作為 GPU 紋理被取樣。

此單一事實引發連鎖反應：

| 世界        | 誰擁有輸入                                       | 像素所在                              | 誰擁有焦點                                                              |
| ----------- | ------------------------------------------------ | ------------------------------------- | ----------------------------------------------------------------------- |
| VectoJS 2D  | 投射的 a11y DOM（`Scene` 每鏡像監聽器）          | `canvas.width/height` 後備儲存        | `document.activeElement` + `Scene.focusedA11yElement` (`Scene.ts:1446`) |
| Three.js 3D | `THREE.Raycaster` + `window`/`domElement` 監聽器 | `CanvasTexture` 於 `PlaneGeometry` 上 | Three 無 DOM 焦點；宿主的 `OrbitControls` 或 `GraphCamera` 擁有指標     |

`ThreeAdapter`（`packages/three/src/ThreeAdapter.ts:90`）必須使一個以為自己在螢幕上的 2D 場景表現正確，而其像素位於 3D 命中測試之後，其鏡像永久與 `document` 斷開。

套件中的另一個模組 `ThreeRenderer`（`packages/three/src/ThreeRenderer.ts:216`）是對同一問題的不同答案：它*是*一個 `IRenderer`（`IRenderer.ts:41` 契約），以 Three.js 而非 `CanvasRenderingContext2D` 渲染 VectoJS 實體。轉接器將 Scene 作為紋理包裝；渲染器替換 2D 上下文。它們共用相同的 y 向下正交與 DPR 陷阱（Boss 07），但擁有權相反：轉接器的 `vectoScene` 預設仍以 `CanvasRenderer` 渲染，渲染器的 `scene/camera/renderer`（`ThreeRenderer.ts:219`）直接渲染實體。

## 2. 紋理路徑 — 自 VectoJS 像素至 Three.js 四邊形

```ts
// packages/three/src/ThreeAdapter.ts:125 — construction (abbreviated)
this.canvas = optCanvas ?? (document ? document.createElement('canvas') : offscreenFallback);
this.vectoScene = new VectoScene(this.canvas, { disableWindowResize: true, ...sceneOptions });
this.texture = new THREE.CanvasTexture(this.canvas);
this.texture.minFilter = THREE.LinearFilter; // ThreeAdapter.ts:151
this.texture.magFilter = THREE.LinearFilter; // ThreeAdapter.ts:152
this.vectoScene.render = (renderer, dt, time) => { originalRender.call(...); this.texture.needsUpdate = true; }; // ThreeAdapter.ts:157
this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false })); // ThreeAdapter.ts:163
```

具 `file:line` 的設計說明：

- **離屏畫布擁有權** — `ThreeAdapter.ts:122` `_ownsCanvas` 追蹤轉接器是否建立了畫布。`dispose()`（`ThreeAdapter.ts:750`）僅在擁有畫布時才將 `canvas.width/height` 歸零；呼叫者提供的畫布保持不動。SSR 備援（`ThreeAdapter.ts:78` `OffscreenCanvasFallback`）明確指出當 `document` 為 undefined 時存在哪些成員——先前以 `{width,height} as HTMLCanvasElement` 裸露的物件隱藏了該契約。
- **重設大小為手動** — `sceneOptions.disableWindowResize = true`（`ThreeAdapter.ts:140`），因為全視窗 `Scene` 自動採用 `window.innerWidth/Height`（`Scene.ts:2284`）。以紋理支撐的場景絕不可跟隨視窗；宿主呼叫 `adapter.resize(w,h)`（`ThreeAdapter.ts:713`），其重設後備儲存、Scene 視埠並標記 `texture.needsUpdate`。
- **髒門控上傳** — 渲染代理（`ThreeAdapter.ts:155`）僅在 Scene 實際重繪時才設定 `texture.needsUpdate = true`。連續的 `Scene.renderMode: 'always'` 迴圈仍每影格上傳；`onDemand` Scene 僅在 `markDirty()` 觸發時上傳——而每個輸入路徑皆會觸發（`ThreeAdapter.ts:270`，`ThreeAdapter.ts:612`）。
- **預設網格為便利而非規範** — `mesh` 為單位 `PlaneGeometry(1,1)`（`ThreeAdapter.ts:163`）。需要曲面螢幕、看板或 VR 儀表板的宿主替換幾何/材質並保留 `texture`。該網格預先未加入任何場景；宿主執行 `scene3d.add(adapter.mesh)`。
- **處置衛生** — `dispose()`（`ThreeAdapter.ts:723`）在銷毀 Scene *之前*將 `vectoScene.render` 還原為 `_originalRender`（`ThreeAdapter.ts:730`），否則殘留參考將在已刪除紋理上設定 `needsUpdate`，Three 會記錄 `trying to use deleted texture`。接著處置 `texture`、`geometry`、`material`，自其父節點移除 `mesh`，呼叫 `vectoScene.destroy()`，清除 `activePointers`，在不發射的情況下丟棄 `_focusedEntity`（鏡像已不存在），並僅在擁有時才將畫布歸零。

`ThreeRenderer` 為替代紋理路徑——完全無轉接器畫布。它擁有自身的 `THREE.Scene` + `THREE.OrthographicCamera(0,width,0,height)` + `THREE.WebGLRenderer({canvas, alpha:true, antialias:true})`（`ThreeRenderer.ts:256`）。其 y 向下正交、`effectiveDPR`/`pixelRatio` 箝制、上下文遺失復原與 `present()` 延遲涵蓋於 Boss 07；與橋接相關的事實是它實作 `IRenderer`，因此任何 `Entity.render(r)` 皆不變地執行，且其 `fillText`/`drawImage` 快取以 `dpr` 與捨入的 `x,y` 相位為鍵（`ThreeRenderer.ts:1002`）。

值得命名以免重複發現的橋接相關內部細節：

- **DPR** — `effectiveDPR()`（`ThreeRenderer.ts:309`）為 `min(real DPR, maxDPR)`，`pixelRatio`（`ThreeRenderer.ts:324`）為即時的 `renderer.getPixelRatio()`，而非快照。`Scene` 在每次 `resize` 上將 `maxDPR` 同步至渲染器（`Scene.ts:286`）；`ThreeRenderer.resize`（`ThreeRenderer.ts:355`）在 `setSize`/`updateProjectionMatrix` 前重套用箝制比例。以 `window.devicePixelRatio` 而非 `pixelRatio` 為鍵的紋理在被箝制的顯示器上模糊。
- **上下文遺失** — `webglcontextlost` 被 `preventDefault`（`ThreeRenderer.ts:281`），使 `webglcontextrestored` 可觸發；還原處理器重套用 `effectiveDPR`、重設大小、標記 `frameDirty` 並 `present()` 至已清空的影格緩衝（`ThreeRenderer.ts:285`）。`dispose()` 分離兩個監聽器並呼叫 `renderer.forceContextLoss()`（`ThreeRenderer.ts:1186`），使 SPA 重新掛載不洩漏活躍 GL 上下文。
- **Y 向下後果** — 每個填充圖元皆需 `side: DoubleSide`（`ThreeRenderer.ts:596` fill、`:658` drawImage、`:1049` fillText）與 `texture.flipY = false`（`ThreeRenderer.ts:628` drawImage、`:1035` fillText）；缺少任一，FrontSide 面將被剔除，圖片/文字在 y 向下正交（`ThreeRenderer.ts:250`）下上下顛倒。
- **快取** — `textTextureCache`（`ThreeRenderer.ts:911`）與 `imageTextureCache`（`ThreeRenderer.ts:599`）以識別為鍵、於 `256` 處 LRU 逐出（`ThreeRenderer.ts:635`、`:1040`），標記 `userData.vectoCached` 使每影格的 `disposeActiveObjects`（`ThreeRenderer.ts:380`）跳過它們，`drawImage` 在命中時重插入以維持 LRU 順序（`ThreeRenderer.ts:641`）。可變畫布來源必須呼叫 `invalidateImage`（`ThreeRenderer.ts:602`）。

## 3. 座標映射 — UV → 邏輯像素（與三個陷阱）

### 3.1 Raycast 進入點

```ts
// packages/three/src/ThreeAdapter.ts:181
public updateIntersection(raycaster: THREE.Raycaster, type, originalEvent?): boolean {
  const intersects = raycaster.intersectObject(this.mesh); // ThreeAdapter.ts:186
  if (intersects.length > 0 && hit.uv) {
    state.lastUv.copy(hit.uv);
    this.dispatchAtUv(type, hit.uv, pointerId, originalEvent);
  } else if (state.isHovering) {
    this.dispatchAtUv('pointerleave', state.lastUv, pointerId, originalEvent); // ThreeAdapter.ts:209
  }
}
```

呼叫者擁有 `Raycaster`——通常為 `raycaster.setFromCamera(ndc, camera)`，其中 `ndc` 為 `((clientX/width)*2-1, -((clientY/height)*2-1))`。即為 `GraphInteraction.setPointerFromEvent`（`packages/graph3d/src/GraphInteraction.ts:157`）與 `GraphCamera` 滾輪縮放（`packages/graph3d/src/GraphCamera.ts:363`）的形態。

### 3.2 UV 至場景像素 — 邏輯而非後備儲存，y 翻轉

```ts
// packages/three/src/ThreeAdapter.ts:240
private dispatchAtUv(type: VectoEvent, uv: THREE.Vector2, ...): void {
  const px = uv.x * this.vectoScene.width;        // ThreeAdapter.ts:251 — logical width
  const py = (1.0 - uv.y) * this.vectoScene.height; // ThreeAdapter.ts:253 — flip Three's bottom-origin
  this.dispatchAtPoint(type, px, py, ...);
}
```

三個陷阱，各自由已修正的缺陷支撐：

1. **邏輯 vs 後備儲存（DPR）** — HiDPI 上 `canvas.width = logicalWidth * devicePixelRatio`（`CanvasRenderer` 後備儲存，Boss 07 §DPR）。實體布局與 `findEntityAt` 為邏輯。將 `uv.x * canvas.width` 相乘使每個命中在 `dpr` 倍上偏移。`ThreeAdapter.ts:246` 處註解明確說明此；程式化進入點（`dispatchPointer`，`ThreeAdapter.ts:675`）同理取邏輯 `x,y`。`ThreeRenderer` 在剪刀路徑（`ThreeRenderer.ts:468` `dpr = renderer.getPixelRatio()`）與 fillText 光柵化（`ThreeRenderer.ts:987`）上有對應陷阱。
2. **Y 翻轉** — Three 的 UV 原點為左下，Canvas 為左上。`py = (1 - uv.y) * height`（`ThreeAdapter.ts:253`）。`ThreeRenderer` 同理取消翻轉紋理（`ThreeRenderer.ts:628` `texture.flipY = false`，`ThreeRenderer.ts:1035` fillText）。
3. **面板外點擊** — 當 `state.isHovering` 時的未命中在 `lastUv` 處合成 `pointerleave`（`ThreeAdapter.ts:209`），並在 `pointerdown` 上模糊面板焦點（`ThreeAdapter.ts:214` `if (pointerdown && _focusedEntity) setFocusedEntity(null)`）——鏡像頁面背景上的點擊如何移動 DOM 焦點。

### 3.3 共用分發核心

`updateIntersection`（raycast UV）與 `dispatchPointer`（邏輯像素，`ThreeAdapter.ts:675`）皆匯聚至 `dispatchAtPoint`（`ThreeAdapter.ts:262`）：

```ts
private dispatchAtPoint(type, px, py, pointerId, originalEvent): boolean {
  this.vectoScene.markDirty();                          // ThreeAdapter.ts:270 — onDemand wake
  const hitEntity = this.vectoScene.findEntityAt(px, py); // ThreeAdapter.ts:273 — VMT hit test
  // hover transitions (ThreeAdapter.ts:277), pointerleave dedup (ThreeAdapter.ts:291),
  // then dispatchEventToTarget or canvas fallback (ThreeAdapter.ts:307)
  // then pointerdown focus (ThreeAdapter.ts:320)
}
```

`findEntityAt` 為螢幕上 Scene 使用的同一命中測試器（`HitTester.ts:12`，Boss 06），包含 `clipChildren` 門控與旋轉感知邊界——無 3D 特定命中路徑。

## 4. 輸入路由 — 指標、滾輪、懸停與多點觸控

### 4.1 懸停轉換按指標區分

`activePointers: Map<number, PointerState>`（`ThreeAdapter.ts:101`）按 `pointerId` 追蹤 `{isHovering, lastUv, lastTargetId}`（`ThreeAdapter.ts:64`）。`pointerId` 自原始 `PointerEvent` 讀取（`ThreeAdapter.ts:187`），或對程式化/滑鼠路徑預設為 `1`。在 `pointermove` 上，轉接器比較 `lastTargetId` 與目前 `hitEntity.id`，並在舊實體上發射 `pointerleave`、在新實體上發射 `hover`（`ThreeAdapter.ts:277`）。在合成的 `pointerleave`（網格退出）上，它經 `dispatchEventToTarget` 發射一次並回傳 `false` 以抑制將重複離開的尾隨備援分發（`ThreeAdapter.ts:291` 註解 + 提前回傳）。

此處歷史：修正前的轉接器發射兩次 `pointerleave`（一次經追蹤的 `lastTargetId`，一次經 `lastUv` 處的通用備援），並將離開洩漏至游標離開後恰位於 `lastUv` 下的任何實體（`vectojs-docs/forge/findings/renderer-and-gpu.md:620`）。

### 4.2 多點觸控 / WebXR

觸控接觸接收全新、單調遞增的 `pointerId`。若無修剪，`activePointers` 將在轉接器生命期中每點擊增長一項。`pruneEndedPointer`（`ThreeAdapter.ts:228`）在最終分發讀取後，於 `pointerup`/`pointercancel` 上刪除條目。`ThreeRenderer` 在 `imageTextureCache`/`textTextureCache` 中有同類洩漏（於 `ThreeRenderer.ts:635` 經 LRU 逐出修正）。

`GraphCamera` 在 3D 層有互補守衛：活躍拖曳擁有其 `pointerId` 直至其自身的 `pointerup`/`pointercancel`——第二個接觸絕不可覆寫 `dragging`/`lastX`/`button`（`packages/graph3d/src/GraphCamera.ts:305`）。

### 4.3 滾輪 — 無中性預設值

`createDOMEvent`（`ThreeAdapter.ts:372`）在 `type === 'wheel'` 上分支：當存在原始 `WheelEvent` 時，以 `deltaX/Y/Z/deltaMode` 複製合成 `WheelEvent`，否則為 `0`（`ThreeAdapter.ts:381`）。指標欄位以與未提供原始事件時 raycaster 路徑產生的相同中性預設合成 `button/buttons/modifiers`（`ThreeAdapter.ts:48` `ThreeAdapterPointerInit` 文件）。`dispatchPointer` 明確**不**涵蓋滾輪（`ThreeAdapter.ts:664` 文件——增量無中性預設；經具真實 `WheelEvent` 的 `updateIntersection` 路由滾輪）。

每個分發的事件皆攜帶 `clientX/clientY = px/py`（邏輯場景像素）與非標準的 `vectoSceneX/Y` 屬性（`ThreeAdapter.ts:412` `Object.defineProperties`），使需要場景空間的處理器無需取消翻轉或取消縮放。`originalEvent` 作為 `VectoJSEvent.nativeEvent` 轉發（`ThreeAdapter.ts:364`），使處理器可逐字讀取 `deltaMode`/`button`。

`ThreeAdapterPointerInit`（`ThreeAdapter.ts:54`）記錄程式化路徑的預設值：`button`/`buttons` 為 0，修飾鍵關閉——在未提供原始事件時與 raycaster 路徑無異。`ThreeAdapterPointerType`（`ThreeAdapter.ts:40`）為兩個進入點接受的封閉聯集；`type` 僅在 `dispatchAtPoint`（`ThreeAdapter.ts:263`）內擴展為 `VectoEvent`。

### 4.4 程式化驅動 vs Raycast 驅動

兩個進入點刻意對稱但不相同：

| 進入點                                                               | 呼叫者提供                      | UV 步驟                                                            | 滾輪                              | 用途                             |
| -------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------ | --------------------------------- | -------------------------------- |
| `updateIntersection(raycaster, type, event)` (`ThreeAdapter.ts:181`) | `THREE.Raycaster` + DOM `Event` | `raycaster.intersectObject(this.mesh)` → `hit.uv` → `dispatchAtUv` | 是 — 具增量的 `WheelEvent` 被轉發 | 即時 3D 指標/滾輪、VR 控制器射線 |
| `dispatchPointer(type, x, y, init)` (`ThreeAdapter.ts:675`)          | 邏輯 `x,y` + 可選 `PointerInit` | 無 — `x,y` 已為場景像素                                            | 否 — 增量無中性預設值             | 測試、自動化、無頭               |

兩者皆匯聚至 `dispatchAtPoint`（`ThreeAdapter.ts:262`），因此懸停轉換、焦點、`markDirty` 與 `isConnected` 分發門控表現相同。`dispatchPointer` 為唯一建立自身 `PointerEvent` 的進入點（`ThreeAdapter.ts:690`）——它必須如此，因為在程式化情況下無後端 DOM 事件。

### 4.5 畫布備援

當 `findEntityAt` 回傳 `null`（空白處）時，事件在 `this.canvas` 本身上分發（`ThreeAdapter.ts:312` `canvas.dispatchEvent(fallbackEvent)`）。對螢幕上 Scene，此將經 a11y 鏡像冒泡；對離屏轉接器，它讓 Scene 層級處理器仍能觀測背景點擊（接著模糊焦點，見 §5）。

## 5. 焦點與鍵盤擁有權 — 離屏故為合成

### 5.1 為何面板焦點非 `document.activeElement`

轉接器的畫布永不附加至 `document`，因此其 `a11yRoot`（Scene 為鏡像建立的容器）亦永不連接。`getA11yElement(entity.id)` 仍回傳真實元素（`Scene.syncA11y` 無論如何皆填充它），但 `el.isConnected === false` 永久成立。需要已連接元素的原生 API（`setPointerCapture`、穩健的 `focus()`）在這類元素上拋出，因此轉接器將斷開的鏡像視為缺席。

因此面板焦點為**轉接器側狀態**：`ThreeAdapter._focusedEntity`（`ThreeAdapter.ts:111`）及其說明落差與合成 `FocusEvent` 橋接的文件註解。經 `focusedEntity` getter（`ThreeAdapter.ts:441`——處置時回傳 `null`）與 `focus(entity|null)` / `blur()`（`ThreeAdapter.ts:458`）存取。

### 5.2 焦點如何移動

- **指標驅動** — 事件分發後，`pointerdown` 聚焦命中實體的最近可聚焦祖先（`ThreeAdapter.ts:321` `focusNearestFocusable(hit)`），或在空白處模糊。`focusNearestFocusable`（`ThreeAdapter.ts:499`）走訪 `hit.parent` 鏈並在每節點測試 `isFocusable`——因此點擊 `<button>` 內的 `<span>` 會聚焦按鈕，匹配 DOM。若鏈中無可聚焦者則模糊（`ThreeAdapter.ts:506`）。焦點轉換在事件*之後*執行，使處理器觀測點擊前的焦點世界，匹配原生 `pointerdown` 接著聚焦的順序（`ThreeAdapter.ts:319` 註解）。
- **程式化** — `focus(entity)`（`ThreeAdapter.ts:458`）接受任何實體（即使不可聚焦），使測試/自動化可強制聚焦；指標路徑更嚴格，僅聚焦投射宣告可達者。
- **`isFocusable` 契約**（`ThreeAdapter.ts:478`）— 當鏡像攜帶 `tabindex`（明確的 `tabIndex` 或核心為可互動 ARIA 角色新增的隱含 `0`）或渲染為原生可聚焦標籤（`button`/`input`/`textarea`/`select`/`a[href]`）時為真。在首次投射同步前退回原始 `getA11yAttributes()` 值。

### 5.3 合成的 FocusEvent 橋接

`setFocusedEntity`（`ThreeAdapter.ts:516`）在鏡像存在時於先前鏡像上分發合成的 `FocusEvent('blur')`、於下一個鏡像上分發 `FocusEvent('focus')`；否則直接在實體上 `emit`。此使核心自身的監聽器不變地執行：實體 `focus`/`blur` 發射、`Scene.focusedA11yElement` 追蹤與 `Input` 游標閃爍喚醒/清理。每次轉換亦 `markDirty()`，使焦點視覺（游標、高亮）在 `onDemand` 模式下重繪（`ThreeAdapter.ts:529`）。

### 5.4 鍵盤路由 — `dispatchKey` 與擁有權

```ts
// packages/three/src/ThreeAdapter.ts:573
public dispatchKey(key: string, mods: ThreeAdapterKeyModifiers = {}, phase: 'press'|'keydown'|'keyup' = 'press'): void {
  const init = { key, code: mods.code ?? ThreeAdapter.codeFor(key), ...mods, bubbles:true, cancelable:true };
  if (phase !== 'keyup') this.routeKeyEvent(new KeyboardEvent('keydown', init));
  if (phase !== 'keydown') this.routeKeyEvent(new KeyboardEvent('keyup', init));
}
```

`codeFor`（`ThreeAdapter.ts:597`）自 `key` 推斷 `KeyboardEvent.code`：字母至 `Key<X>`、數字至 `Digit<N>`、空白至 `Space`，其餘直通——盡力而為，因為 `code` 與布局相關。

`routeKeyEvent`（`ThreeAdapter.ts:610`）實作四條規則（文件於 `ThreeAdapter.ts:536`）：

1. **無面板焦點** — 事件直送 `window`；核心的場景層級通道（`Scene.ts:3351` `dispatchKeyboard`）套用其原生門控（`defaultPrevented`、自動重複、`ownsKeyboard(document.activeElement)`）。Orbit 相機消費者與宿主輸入永不被餓死。
2. **有面板焦點，位於鏡像** — 在聚焦鏡像上分發，使核心的通用按鍵轉發與 `#694` Enter/Space 啟動執行。若無鏡像則在實體上為 `VectoJSEvent`。
3. **擁有權 — 停止** — 若 `entityOwnsKeyboard(focused)`（`ThreeAdapter.ts:643`）回傳 true（標籤 `input`/`textarea`/`select`，或 `Scene.ts:115` 中 `KEYBOARD_OWNING_ROLES` 的 `role`——`textbox`、`searchbox`、`spinbutton`、`option`、`listbox`、`button`、`link`、`tab`、`menuitem`、`slider`、`combobox`），事件被消費；無物洩漏至 `window`。標籤+角色集合鏡像 `Scene.ownsKeyboard`（`Scene.ts:143`）並記錄為經匯出集合刻意統一。
4. **否則，冒泡至 window** — 除非實體處理器設定 `nativeEvent.defaultPrevented` 或 `cancelBubble`，匹配已連接畫布的冒泡。該門控正是面板處理器可對 Enter `preventDefault()` 以抑制宿主捷徑的原因。

此為 `vectojs-three` skill 食譜（`.agents/skills/vectojs-three/references/three-recipes.md:60`）中 `adapter.focus(panel); adapter.dispatchKey('Enter')` 與 `isFocusable` 守衛背後的機制。

## 6. 3D 內的語意投射 — AT 所見

在已連接畫布上，`Scene.syncA11y` 將每個可互動實體的 `getA11yAttributes()` 投射至透明、絕對定位的 DOM 鏡像（role、label、tabindex、邊界）。螢幕閱讀器與 Playwright 的 `getByRole` 驅動那些鏡像。命中測試與分發事件為可分離關切：Scene 的 `HitTester`（`HitTester.ts:12`）為命中權威，而鏡像為分發傳輸（`Scene.ts:3512` 每鏡像監聽器）——離屏橋接所依賴的區別。

在 `ThreeAdapter` 內，鏡像相同地建立——`Scene` 不知畫布離屏——但它們永不連接至 `document`。後果：

- **預設對 AT 不可見** — `CanvasTexture` 面板不在頁面的 a11y 樹中。若 3D 場景需要 AT 可達性，宿主必須渲染同一 Scene 的 2D 覆蓋，或經獨立、已連接的 Scene 暴露面板。轉接器不發明此；它保留 2D 投射契約，將 3D 宿主的頁面結構留給宿主。此為正確預設：紋理無 DOM 語意。
- **分發備援 — `isConnected` 具承載力** — `dispatchEventToTarget`（`ThreeAdapter.ts:330`）檢查 `a11yEl && a11yEl.isConnected`（`ThreeAdapter.ts:349`）。已連接鏡像獲得真實 `PointerEvent`/`WheelEvent` 在其上分發，使原生綁定小工具（例如呼叫 `setPointerCapture` 的投射 `<input>`，或在 `ThreeAdapter.ts:360` 處呼叫 `a11yEl.focus()` 的每實體 `focus()` 路徑）以瀏覽器原生分發工作。斷開的鏡像走備援：`new VectoJSEvent(type, entity, originalEvent, …, {x,y})` 經虛擬樹冒泡（`ThreeAdapter.ts:363`）。`ThreeAdapter.ts:341` 處註解說明失敗模式——斷開元素在 `setPointerCapture` 上拋出，`focus()` 為無操作——因此經備援路由並非風格選擇，而是正確性門控。
- **指標事件不受後代 `pointerEvents: 'none'` 門控** — 轉接器的命中測試為 Scene 上的 `findEntityAt`，而非 CSS 命中測試。在 2D 頁面上重要的 `pointerEvents: 'none'` 語意（Boss 03，`ScrollView` `pointerEvents: 'none'` 互動）不影響 3D 路徑；僅 2D 鏡像路徑尊重它。在轉接器路徑中，命中在嘗試任何 DOM 分發前已解析。
- **焦點鏡像相同分離** — `setFocusedEntity` 在 `isConnected` 時於鏡像上分發，否則在實體上 `emit`（`ThreeAdapter.ts:516`）；兩條路徑驅動相同核心監聽器（實體 `focus`/`blur`、`Scene.focusedA11yElement`、游標閃爍），因此 `onFocus` 處理器無需分支。

`ThreeRenderer` 無投射關切——它是渲染器而非 Scene——因此完全無 a11y 路徑。由 `ThreeRenderer` 支撐的 Scene 仍經正常的 2D `Scene` a11y 層投射，因為渲染器永不觸碰 `a11yRoot`。

在轉接器分發分支的兩側發現差異（`ThreeAdapter.ts:341` vs `ThreeAdapter.ts:363`）：

```ts
// 已連接鏡像 — 真實 DOM 分發，原生捕獲/焦點有效
a11yEl.dispatchEvent(domEvent); // ThreeAdapter.ts:351
if (type === 'pointerdown' && (a11yEl instanceof HTMLInputElement || …)) a11yEl.focus();

// 斷開鏡像 — 虛擬樹冒泡，無 DOM
entity.dispatchEvent(new VectoJSEvent(type, entity, originalEvent, …, { x, y })); // ThreeAdapter.ts:363
```

## 7. 純 Three 對應物 — `Graph3D` 家族

`@vectojs/graph3d` 展示非轉接器的 3D 消費者樣貌——無 `ThreeAdapter`、無 Scene、無 a11y 投射。它是轉接器何時需要、何時不需要的參考。

| 元件                                 | 角色                                                                                                    | 關鍵 file:line                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `Graph3D`                            | 實例化呈現：一個節點用 `InstancedMesh` + 一個連結用 `LineSegments`，同屬單一 `group`（`Graph3D.ts:30`） | `Graph3D.ts:28` group、`Graph3D.ts:115` InstancedMesh、`Graph3D.ts:136` LineSegments                                         |
| `GraphCamera`                        | 2D 正交 vs 3D 透視平移/縮放/環繞控制                                                                    | `GraphCamera.ts:73` GraphCamera、`GraphCamera.ts:200` setSize 縮放修正、`GraphCamera.ts:354` 游標處滾輪縮放                  |
| `GraphInteraction`                   | `Raycaster` + NDC → `pickNode` → 懸停/選取/拖曳固定                                                     | `GraphInteraction.ts:83` GraphInteraction、`GraphInteraction.ts:157` setPointerFromEvent、`GraphInteraction.ts:246` pickNode |
| `VectoForceLayout` / `D3ForceLayout` | 供給 `Float32Array` 位置至 `applyPositions` 的布局契約                                                  | `packages/graph3d/src/layout/`                                                                                               |

鏡像轉接器陷阱的顯著不變量：

- **`setGraphData` 在變更前拋出** — 連結端點經 `indexById`（`Graph3D.ts:80`）解析並驗證（`Graph3D.ts:90` 拋出），然後才 `clearMeshes()`（`Graph3D.ts:99`）或附加任何網格，因此被拒的圖保持場景完整（`Graph3D.ts:73` 文件，`forge 2026-08-13` 條目）。
- **`applyPositions` 防衛 NaN** — `positions.length < nodeCount*3` 在寫入前中止，每 `setGraphData` 警告一次（`Graph3D.ts:162` `hasWarnedShortPositions`，於 `Graph3D.ts:100` 重置），並跳過更新以避免 NaN 實例矩陣與將使整個網格被視錐剔除的 NaN 邊界球（`Graph3D.ts:148` 文件）。無需逐連結邊界檢查，因為 `setGraphData` 已驗證每個端點。
- **`pickNode` 具實例感知** — `raycaster.intersectObject(nodeMesh)` 過濾至 `h.instanceId != null`（`Graph3D.ts:248`），回傳與布局對齊的 `GraphData.nodes` 索引。
- **`GraphCamera.setSize` 縮放雙重套用修正** — 視錐保持於未縮放的半範圍；僅 `camera.zoom` 攜帶縮放（`GraphCamera.ts:200` 註解：將縮放烘焙至視錐*並*設定 `camera.zoom` 使可見範圍為 `1/zoom²` 並使圖形跳出視圖）。
- **`GraphInteraction` 指標捕獲** — `domElement` 上 `pointerdown` 時的 `setPointerCapture`（`GraphInteraction.ts:284`）與經 `window` 的 `pointerup`/`pointercancel`（`GraphInteraction.ts:135`），使畫布外的釋放仍結束拖曳並重啟用宿主控制；`dispose()` 於拖曳中執行完成路徑（`GraphInteraction.ts:314`）。

## 8. 陷阱與陷阱（附 file:line）

| 陷阱                                               | 位置                                                             | 症狀                                                                                       | 已修正 / 狀態                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| UV × 後備儲存而非邏輯大小                          | `ThreeAdapter.ts:246` 註解                                       | HiDPI 上每個命中在 `dpr` 倍上向下/向右偏移                                                 | 已修正 — 使用 `vectoScene.width/height`                            |
| Y 未翻轉                                           | `ThreeAdapter.ts:253`                                            | 命中垂直鏡像                                                                               | 已修正 — `(1-uv.y)*height`                                         |
| 斷開時仍分發 a11y 鏡像                             | `ThreeAdapter.ts:349` `isConnected`                              | `setPointerCapture` 拋出，`focus()` 無操作                                                 | 已修正 — 回退至 `VectoJSEvent`                                     |
| 網格退出時重複 `pointerleave`                      | `ThreeAdapter.ts:291` 提前回傳                                   | 實體被命中兩次，鄰居洩漏離開                                                               | 已修正 `ThreeAdapter.ts:291` 跳過尾隨分發（`forge 2026-08-13`）    |
| `activePointers` 每點擊增長                        | `ThreeAdapter.ts:228` `pruneEndedPointer`                        | 無界 Map，WebXR/多點觸控                                                                   | 已修正 — 於 `pointerup`/`pointercancel` 上刪除                     |
| 滾輪無中性預設值                                   | `ThreeAdapter.ts:664` 文件                                       | `dispatchPointer('wheel',…)` 將合成錯誤增量                                                | 依設計 — 以真實 `WheelEvent` 使用 `updateIntersection`             |
| 面板外 `pointerdown` 未模糊                        | `ThreeAdapter.ts:214`                                            | 點擊空白 3D 空間後面板保持焦點                                                             | 已修正 — 在外部 `pointerdown` 上模糊                               |
| `render` 代理在處置時未還原                        | `ThreeAdapter.ts:113` `_originalRender`                          | 已刪除 `CanvasTexture` 上的 `needsUpdate` → `THREE.Texture: trying to use deleted texture` | 已修正 `ThreeAdapter.ts:730`                                       |
| 雖為呼叫者提供仍將畫布歸零                         | `ThreeAdapter.ts:122` `_ownsCanvas`                              | 處置後呼叫者的畫布被清空                                                                   | 已修正 — 僅在擁有時歸零                                            |
| `ThreeRenderer` 在 y 向下正交下 `FrontSide` 被剔除 | `ThreeRenderer.ts:250` 相機，`ThreeRenderer.ts:596` `DoubleSide` | `fillCircle`/填充/漸層/drawImage 不可見                                                    | 已修正（`forge 2026-08-13`，`ThreeRenderer.ts:596`）               |
| `drawImage` 垂直翻轉                               | `ThreeRenderer.ts:628` `flipY = false`                           | 每個 blit 的圖片上下顛倒                                                                   | 已修正（`forge 2026-08-23`，`ThreeRenderer.ts:478`）               |
| `LineBasicMaterial.linewidth` 被忽略               | `ThreeRenderer.ts:110` `buildStrokeRibbon`                       | 每個描邊皆為髮絲                                                                           | 已修正 — 帶狀幾何                                                  |
| `fillText` 將字重解析為尺寸                        | `ThreeRenderer.ts:274` `parseFontSize`                           | 粗體文字高 700px，基線低 `fontSize/2`                                                      | 已修正（`forge 2026-08-13 #486`，`ThreeRenderer.ts:274` + `:831`） |
| `Graph3D` 在錯誤連結 id 上半建                     | `Graph3D.ts:73`                                                  | 節點已附加，連結缺失，縮放陳舊                                                             | 已修正 `Graph3D.ts:80` 先解析                                      |
| `applyPositions` 尺寸不足陣列 → NaN                | `Graph3D.ts:148`                                                 | 節點消失，視錐空白                                                                         | 已修正 `Graph3D.ts:162` 守衛 + 閂鎖警告                            |
| `GraphInteraction` 於拖曳中處置                    | `GraphInteraction.ts:314`                                        | 宿主控制卡在停用                                                                           | 已修正 — `dispose` 中 `finishDrag`                                 |
| `GraphCamera` 在重設大小時雙重縮放                 | `GraphCamera.ts:200`                                             | 縮放為 `1/zoom²`，圖形跳出                                                                 | 已修正 — 視錐保持未縮放                                            |

## 9. 食譜 — 何時使用哪條路徑

**3D 場景中的面板（HUD、儀表板、VR 螢幕）：**

```ts
// .agents/skills/vectojs-three/references/three-recipes.md:10 + :24
import { ThreeAdapter } from '@vectojs/three';
import { Button, Stack, Text } from '@vectojs/ui';
const adapter = new ThreeAdapter({ width: 800, height: 500 });
const panel = new Stack({ direction: 'vertical', gap: 16 });
panel.add(new Text('VectoJS in 3D', { font: '700 28px Inter' }));
adapter.vectoScene.add(panel);
adapter.vectoScene.start();
scene3d.add(adapter.mesh);
// 指標路由 — raycaster 擁有 3D 命中，轉接器擁有 2D 分發
const handled = adapter.updateIntersection(raycaster, type, event);
if (handled) event.preventDefault();
```

- 自 `window`/`document` 監聽器呼叫 `adapter.updateIntersection(raycaster, type, event)`，傳遞真實 `PointerEvent`/`WheelEvent` 使按鈕/修飾鍵狀態與滾輪增量轉發。當 `handled` 為 true 時 3D 命中被消費——對宿主事件 `preventDefault()`，使頁面不捲動/選取。
- 對測試/自動化使用 `adapter.dispatchPointer(type, x, y)`（`ThreeAdapter.ts:675`）——邏輯像素，與 raycaster 相同的下游路徑，但滾輪保留在 raycaster 路徑（無中性增量可合成，`ThreeAdapter.ts:664`）。
- 焦點：`adapter.focus(entity)` / `adapter.blur()`（`ThreeAdapter.ts:458`），以 `adapter.isFocusable(entity)`（`ThreeAdapter.ts:478`）查詢。鍵盤：`adapter.dispatchKey('Enter')`（`ThreeAdapter.ts:573`）——預設完整按下，或對按住的按鍵使用 `dispatchKey('a', {shiftKey:true}, 'keydown')`。焦點驅動 `ownsKeyboard` 門控，其決定按鍵是否洩漏至 `window`。
- 重設大小：當宿主畫布或面板大小變更時 `adapter.resize(w, h)`（`ThreeAdapter.ts:713`）；Scene 不跟隨 `window`（`ThreeAdapter.ts:140` `disableWindowResize`）。
- 拆解：`scene3d.remove(adapter.mesh); adapter.dispose()`（`ThreeAdapter.ts:723`）——還原渲染代理（`ThreeAdapter.ts:730`）、處置紋理/幾何/材質、移除網格、銷毀 Scene、清除指標/焦點。

**無 2D 面板的 3D 圖：**

直接使用 `Graph3D` + `GraphCamera` + `GraphInteraction`——無轉接器。`Graph3D.group` 加入宿主場景，`GraphCamera` 擁有相機與其自身的 `pointerdown/move/up/wheel` 監聽器（`GraphCamera.ts:150`），`GraphInteraction` 在 `domElement` 上擁有 `pointermove/down` 加上 `window` `pointerup/cancel` 供拖曳至外部。 以 `() => graphCamera.camera` getter 連接，使 `setMode('2d'|'3d')` 保持即時（`GraphInteraction.ts:5` `GraphInteractionCamera`）。

**宿主擁有相機（例如 `OrbitControls` + 圖）：**

傳遞 `setControlsEnabled`（`GraphInteraction.ts:53`），使節點拖曳在拖曳期間停用相機控制。同一模式適用於與 3D 場景共用畫布的轉接器面板：當相機拖曳時門控面板的 `updateIntersection`，反之亦然。

## 10. 開放問題與 XR 前景

- **XR 會話傳遞** — WebXR 控制器產生 `select`/`squeeze` + `XRInputSource` 射線而非 `PointerEvent`。轉接器的 `pointerId` 映射（`ThreeAdapter.ts:101`）已泛化至多指標，但宿主必須自 XR 視圖 + 輸入姿態合成 `Raycaster`，並按輸入源呼叫 `updateIntersection`。尚無 `XRRaycaster` 輔助。
- **兩個面板，一個畫布** — `updateIntersection` 對單一 `mesh` 做命中測試（`ThreeAdapter.ts:186` `intersectObject(this.mesh)`）。一個 Three.js 場景中的兩個轉接器需要每轉接器 raycast 或以 `hit.object` 分發的共用 `intersectObjects([a.mesh, b.mesh])`。每 `pointerId` 懸停狀態按轉接器區分，因此跨面板 `pointerleave` 已隔離。
- **3D 面板的 AT** — 如 §6 所述，離屏鏡像對 AT 不可見。需要 AT 的 XR 或僅 WebGL 部署必須保持已連接的 2D Scene（或 DOM 覆蓋）同步——轉接器不解決此，因為頁面的 a11y 樹超出紋理範圍。
- **SSR / OffscreenCanvas** — `ThreeAdapter.ts:130` 在 `document` 為 undefined 時退回至 `{width,height}` 物件。`THREE.CanvasTexture` 仍預期紋理影像來源； 在伺服器上預渲染的宿主需要真實的 `OffscreenCanvas` 或延遲的轉接器建構。

## 11. 發布此領域變更前的檢查清單

- [ ] **無 `uv.x * canvas.width`。** 每個 UV→像素路徑皆使用 `vectoScene.width/height`（邏輯），而非 `canvas.width/height`（後備儲存）。在 `packages/three/src/ThreeAdapter.ts` 中搜尋 `canvas\.width`。
- [ ] **Y 已翻轉。** `py = (1 - uv.y) * height`（`ThreeAdapter.ts:253`）；blit 至場景的紋理為 `flipY = false`（`ThreeRenderer.ts:628`、`:1035`）。
- [ ] **`updateIntersection` 與 `dispatchPointer` 匯聚。** 新輸入語意進入 `dispatchAtPoint`（`ThreeAdapter.ts:262`），使 raycast 與程式化路徑不分歧。
- [ ] **`isConnected` 門控保留。** `dispatchEventToTarget`（`ThreeAdapter.ts:349`）在分發至鏡像前檢查 `a11yEl.isConnected`；離屏情況的 `VectoJSEvent` 備援必須保留。
- [ ] **面板焦點已橋接。** 每個 `setFocusedEntity` 轉換在鏡像上分發合成的 `FocusEvent` 並 `markDirty()`（`ThreeAdapter.ts:516`）；`pointerdown` 焦點走訪 `isFocusable` 祖先（`ThreeAdapter.ts:499`）。
- [ ] **鍵盤擁有權統一。** `entityOwnsKeyboard`（`ThreeAdapter.ts:643`）使用與 `Scene.ownsKeyboard`（`Scene.ts:115`、`Scene.ts:143`）相同的 `KEYBOARD_OWNING_ROLES` 集合；在一處新增角色必須更新另一處。
- [ ] **`hover` vs `pointermove` 保留。** `dispatchAtPoint` 將 `pointermove` 懸停轉換映射至新實體上的 `hover` 與舊實體上的 `pointerleave`（`ThreeAdapter.ts:277`）；變更事件名稱會破壞 `Entity.on('hover',…)` 處理器。
- [ ] **`pointerleave` 去重完整。** 合成的網格退出 `pointerleave`（`ThreeAdapter.ts:291`）絕不可落入通用分發——`return false` 具承載力。
- [ ] **`activePointers` 已修剪。** `pruneEndedPointer`（`ThreeAdapter.ts:228`）在 `updateIntersection` 與 `dispatchPointer` 兩者的 `pointerup`/`pointercancel` 上（加上 `ThreeRenderer` LRU 上限）。
- [ ] **`needsUpdate` 受門控。** 渲染代理（`ThreeAdapter.ts:157`）僅在 Scene 重繪時才設定 `needsUpdate`；`resize`/`dispose` 語意（`_ownsCanvas`、`_originalRender`）未觸動。
- [ ] **`Graph3D` 守衛成立。** `setGraphData` 在變更前解析連結（`Graph3D.ts:80`），`applyPositions` 在短陣列上中止（`Graph3D.ts:162`），`GraphInteraction` 在拖曳中清理（`GraphInteraction.ts:314`）。

## 關聯

- **Boss 06（VMT 執行期）**擁有 `Scene`、`Entity`、`findEntityAt`、`focusedA11yElement` 與轉接器重用的 `WASM_UPLOAD_REJECT_LIMIT` / 結構版本連接。
- **Boss 07（渲染器）**擁有 `IRenderer`、`CanvasRenderer` 的 DPR/後備儲存上限、y 向下正交、剪刀與 `present()` vs `flush()` 批次，兩者 `ThreeAdapter`（經 `CanvasRenderer`）與 `ThreeRenderer`（作為 `IRenderer`）皆繼承。
- **Boss 11（圖布局）**擁有供給 `Graph3D.applyPositions` 的力核心；`@vectojs/graph-layout` 2D 四元樹（`BarnesHutQuadtree.ts`）保持純 JS，而 `crates/vectojs-force-rs` 加速 3D 八元樹。
- **Boss 08（WASM）**共用 `Scene` 視埠與 `appliedDPR` 值；跨記憶體增長的陳舊型別化陣列視圖為此 Boss 紋理快取的類比。

## 參考

- `packages/three/src/ThreeAdapter.ts:1` — 轉接器：離屏畫布、`CanvasTexture`、渲染代理、raycast + 程式化輸入、面板焦點/鍵盤
- `packages/three/src/ThreeRenderer.ts:1` — 經 Three.js 的 `IRenderer`：y 向下正交、帶狀描邊、漸層著色器、DPR、快取、`present()`/`dispose()`
- `packages/three/src/index.ts:1` — 公開 barrel（`ThreeAdapter`、`ThreeRenderer`）
- `packages/graph3d/src/Graph3D.ts:1` — 實例化節點 + 線段連結、`setGraphData` 先解析、`applyPositions` 守衛、`pickNode`
- `packages/graph3d/src/GraphCamera.ts:1` — 正交/透視相機 + 平移/縮放/環繞、`setSize` 縮放修正、游標處滾輪縮放
- `packages/graph3d/src/GraphInteraction.ts:1` — `Raycaster` + NDC、`pointerId` 懸停/拖曳固定、`window` up/cancel、`setControlsEnabled`
- `packages/core/src/tree/Scene.ts:115` `KEYBOARD_OWNING_ROLES` / `Scene.ts:143` `ownsKeyboard` / `Scene.ts:1446` `focusedA11yElement` / `Scene.ts:3512` 每鏡像分發 — 轉接器鏡像的 2D 擁有權
- `.agents/skills/vectojs-three/references/three-recipes.md:1` — 面板、指標、滾輪、程式化與處置食譜
- `vectojs-docs/forge/findings/renderer-and-gpu.md:1` — 渲染器/gpu 發現（DPR、`FrontSide` 剔除、`flipY`、髮絲、快取洩漏、投射陷阱）
