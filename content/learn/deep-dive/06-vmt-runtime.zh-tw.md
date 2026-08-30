---
title: '06 — VMT 執行期 — 生命週期 / Dirty / 事件'
description: 'Virtual Math Tree 執行期：實體生命週期、dirty/失效粒度、world-matrix 組合，以及捕獲/冒泡事件分發 — 包含破壞三個不變量的祖先遍歷與生命週期洩漏陷阱。'
order: 26
---

# 06 — VMT 執行期 — 生命週期 / Dirty / 事件

> Virtual Math Tree 並非你所渲染的場景圖。它是一棵保留的數值樹，每一影格重組變換、判定何者為髒、剔除不可見者、對可互動者做命中測試，然後才繪製。DOM 是投射；畫布是真實。本文件是保持該真實一致的控制迴圈。

## 1. 一張圖看 VMT 管線

```text
                    Entity tree               packages/core/src/tree/Entity.ts:782
                    (Scene.root)              Scene holds root + overlayRoot, never reassigns
                         │
                         │  add/remove/reparent  Entity.ts:1065 add / :1117 remove
                         │  structureVersion++   Scene.ts:3462 structureVersion
                         ▼
               ┌─────────────────────┐
               │  Dirty propagation  │   DirtyTracker  scene/DirtyTracker.ts:70
               │  markDirty / clear  │   dirty:boolean  Scene.ts:534
               └─────────┬───────────┘   consumed BEFORE update  Scene.ts:5646
                         │
                         ▼
               ┌─────────────────────┐
               │ Transform gather    │   getWorldTransform  Entity.ts:1668
               │ T·S·R compose       │   _worldFrame cache  Entity.ts:845 / :1668 fast path
               │ per-frame cache     │   currentFrame++     Scene.ts:5806 (O(1) invalidation)
               │ WASM SoA store (G1) │   _storeSlot         Entity.ts:865 / WasmBackendFacade.ts:30
               └─────────┬───────────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
     ┌────────────────┐   ┌──────────────────┐
     │ Layout         │   │ Hit test         │   HitTester  scene/HitTester.ts:17
     │ LayoutEngine   │   │ findEntityAt     │   :121 JS walk fallback
     │ measurePrepared│   │ isHitEligible    │   :326 clip + opacity + pointerEvents
     │ layoutPrepared │   │ WASM grid        │   :144 ensureHitGrid / :185 fused gather
     └───────┬────────┘   └────────┬─────────┘
             │                     │  pointer capture  Scene.ts:3851 setPointerCapture
             └──────────┬──────────┘   capture/bubble  Entity.ts:1610 dispatchEvent
                        ▼
              ┌───────────────────┐
              │ Render walk       │   Scene.ts:5730 render / :5569 loop
              │ cull → paint      │   renderMode always/onDemand  Scene.ts:401
              │ a11y sync after   │   syncA11y deferred when animating
              └───────────────────┘
                        │
                        ▼
                   Pixels + DOM mirrors
```

因果順序固定——`Scene.ts:5745` 將其記錄為正確性契約——即使實體遍歷可能融合。JS 路徑以前序交錯 `update → compose → cull → paint` 每節點；WASM 路徑先更新整棵樹，然後在 SoA 上一次收集並組合，再進行相同的 cull/paint 遍歷。兩者皆必須在同一影格暴露 `update()` 變更。

## 2. 生命週期 — 建立 / 加入 / 移除 / 銷毀

### 2.1 Entity 形態

`Entity`（`Entity.ts:782`）為 `abstract`。每個實例攜帶：

- `id: string`——省略時為隨機 `entity_<7>`（`Entity.ts:1055` 建構子）。
- `parent: Entity | null`（`:791`）、`children: Entity[]`（`:790`）。parent 為唯一擁有權連結。
- `scene` getter（`:796`）——沿 `parent` 走訪至真實擁有者；除 Scene 自身的 `_scene` 逃生艙外，永不直接儲存於實體上。
- 局部變換：`_x/_y/_scaleX/_scaleY/_rotation/_opacity`（`:805`），具 `_hasTransitions` 快速路徑旗標（`:812`），使被動實體的 `x = v` 僅為一次布林檢查 + 欄位寫入。
- 延遲配置的 `Map`：`_drivers`、`listeners`、`captureListeners`（`:819`）——首次使用前為 null。20k 粒子的場景永不配置它們。
- `_mounted: boolean`（`:816`）、`_destroyed: boolean`（`:817`）、`_driversTickedFrame: number`（`:828`，初始為 `-1`）。
- 世界矩陣快取 `_wa.._wf / _worldFrame`（`:845`）與 WASM 槽位 `_storeSlot: number`（`:865`，不在儲存中時為 `-1`）。

子類別覆寫 `getBounds()`、`drawSelf()`、`getContentProjection()`、`update()`、`onMounted()`、`destroy()`。

### 2.2 add — 附帶循環守衛與結構失效的附加

`Entity.add(...children)`（`:1065`）轉發至 `_addOne`（`:1075`）：

1. 循環守衛——`child === this` 拋出；沿 `this.parent` 鏈檢查祖先相等性（`:1080`）。O(depth)，add 相對於每影格工作為稀有。
2. 自舊父節點分離——當 `child.parent` 已設定時 `child.parent.remove(child)`，因此重設父節點永不重複。
3. `child.parent = this; this.children.push(child)`——O(1) 尾部附加。
4. 若 `this.scene` 存在（活躍樹）：
   - `s.a11yNeedsReorder = true`
   - `s.markStructureChanged()`——遞增 `structureVersion`，使 WASM 變換儲存布局失效（`Scene.ts:1625` `_storeStructureVersion`）。
   - `s.markDirty({ entity: this.id, reason: 'child-added' })`（`:1086`）。
   - `child._notifyMounted()`（`:1087`）——深度優先的 `onMounted()`，受 `_mounted` 守衛，使重附加的子樹僅觸發一次。
   - `s._registerActiveDriverSubtree(child)`——恢復分離時仍在途的任何批次 driver（`remove` 之取消註冊的鏡像）。

多個子節點（`add(a,b,c)`）以參數順序附加，語意相同。

### 2.3 remove — 附帶 driver 取消註冊的分離

`Entity.remove(child)`（`:1117`）為 `indexOf` + `splice`：

1. `child.parent = null`。
2. `s.detachA11y(child)` + `a11yNeedsReorder`。
3. `s.markStructureChanged()` + `markDirty({ reason: 'child-removed' })`（`:1123`）。
4. `s._unregisterActiveDriverSubtree(child)`——將離樹子樹自 `DriverTicker.active` 移除，使其 driver 停止計時並固定實體。`_addOne` 的鏡像在重附加前若仍未穩定則恢復它們。

移除非子節點為無操作（回傳 `this`）。無 `removeAll()`——需迭代或 `destroy()`。

### 2.4 destroy — 葉優先的遞迴拆解

`Entity.destroy()`（`:1525`）——經 `_destroyed` 守衛具冪等性：

```ts
while (this.children.length > 0) this.children.at(-1)!.destroy();
animations = null;
for (const d of this._drivers.values()) this._settleDriver(d); // resolve animateTo promises
this._drivers.clear();
listeners.clear();
captureListeners.clear();
if (this.parent) this.parent.remove(this);
```

- 葉優先（自尾部銷毀），使每個子節點的 `parent.remove(this)` 變更正在迭代的尾部——無快照、無索引偏移。
- 擁有 GPU/DOM 資源的子類別先釋放資源，再呼叫 `super.destroy()`（`ComputeParticleEntity.ts:419`，`DOMPortalEntity.ts:142`）。
- 經 `_settleDriver`（`:1329`）的 Promise 結算解析 `animateTo`/`springTo` 呼叫者，而非永遠懸掛。

`Scene.destroy()`（`Scene.ts:2957`）加上場景層級的對應：

- 守衛 `if (destroyed) return`（`:2958`），設 `destroyed = true`。
- `while (root.children.length) destroyEntitySubtree(root.children.at(-1)!)`，對 `overlayRoot` 同理（`:2964`），各自委派至 `entity.destroy()`（`:2951`）。
- 拆解 `pointRenderer`、WebGPU 裝置/管理器、`ResizeObserver`、DPR 監看、指標監聽器（自 `pointerEventTarget` 分離）、`a11yRoot`/`portalRoot`，並清除 `keydownHandlers/shortcuts`。
- 具冪等性——`start()` 在 `destroyed` 時提前回傳（`:3143`），WebGPU 裝置復原檢查 `if (destroyed) newDevice.destroy()`（`:5813`）。

已被 `destroy()` 的實體絕不可重加入——其 `_destroyed` 旗標使任何後續 `destroy()` 為無操作，但其 `parent` 已為 null 且子節點已消失。

## 3. Dirty / 失效粒度

### 3.1 布林旗標與其歸因

`Scene.dirty: boolean`（`Scene.ts:534`）為唯一排程訊號。`onDemand` 在 `!dirty && !frameHadAnimation && !contentSemanticDeferred`（`Scene.ts:5594` `isIdle`）時跳過渲染；`always` 每 rAF 渲染，除非 `autoThrottle` 降至 `idleFPS`。

擁有權依 `DirtyTracker.ts:2` 表頭拆分：

- `DirtyTracker`（`scene/DirtyTracker.ts:70`）擁有旗標（`isDirty`）、選擇加入的歸因映射與其 FIFO 上限（`MAX_DIRTY_REASONS = 200` 於 `:71`）。
- `Scene.markDirty(source?)`（`Scene.ts:3443`）保持其確切名稱/簽名並委派至 `_dirty.mark(source, currentFrame)`——`Entity.ts` 中 129 個呼叫點依賴 `scene.markDirty()`（`DirtyTracker.ts:33`）。
- `Scene._dirty: DirtyTracker`（`Scene.ts:1220`）具私有 getter/setter（`:1229`）——`set dirty(true)` 呼叫 `mark(undefined, currentFrame)`，`set dirty(false)` 呼叫 `clear()`。

熱路徑成本（`DirtyTracker.ts:47`）：當 `tracking` 關閉時，`mark()` 為一次欄位寫入（`isDirty = true`）加上一次已為 false 的分支。`record()` 為獨立方法，使 V8 內聯單欄位版本。

### 3.2 旗標何時設定、何時消費

**設定**——數十個位置，各具 `reason` 字串以供歸因：

- `Entity.add` → `child-added`（`:1086`）、`remove` → `child-removed`（`:1123`）、`animate` → `animation-start`、`_spawnDriver` → `driver-added`（`:1305`）、`tickDrivers` → `driver-tick`（`:1389`）、`ComputeParticleEntity` → 每次粒子變更 `markDirty()`（`ComputeParticleEntity.ts:113`）。
- `Scene` 自身：樣式變更、重設大小、字型載入（`:2717`）、a11y 重排序（`:3674`）、捲動（`:3931`）。

**消費**——`Scene.loop`（`:5569`）在 `update/render` 遍歷**之前**執行 `this.dirty = false`（`:5650`）。`entity.update()` 內的任何 `markDirty()` 存活至下一影格；在渲染後清除將抹除自我重武裝並凍結實體（`DirtyTracker.ts:98`）。`Scene.step(dt)`（`:3420`）為例外——它無條件渲染（不諮詢 `renderMode` 亦不諮詢 `dirty`，`DirtyTracker.ts:33` 契約）並在之後清除（`:3434`），因為確定性為目的。

### 3.3 歸因 — 找出使 onDemand 場景保持清醒者

預設關閉。以 `scene.setDirtyTracking(true)`（`Scene.ts:3475`）啟用，執行後讀取 `scene.dirtyReasons: DirtyReasonEntry[]`（`:3489`，按最頻繁在前排序）。每條為 `{ entity?, reason, property?, count, firstFrame, lastFrame }`（`DirtyTracker.ts:59`）。鍵為 `entity:reason.property`（`:120`）。有界 FIFO——最舊者在 200 時丟棄（`:127`）。以 `scene.clearDirtyReasons()`（`:3495`）清除。`onDemand` 診斷過去為「dirty 為 true，不知為何」現為排序表。

`structureVersion`（`Scene.ts:3462`，由 `:1636` 處的 `_structureVersion` 支援）為伴隨訊號：加入/移除/重設父節點使其遞增；屬性變更則不。樹形狀的快取恰在該值不變時有效——O(1) vs 重走。

## 4. 世界矩陣組合

### 4.1 仿射與其快取

`AffineTransform { a,b,c,d,e,f }`（`Entity.ts:33`）匹配 `CanvasRenderingContext2D`——每節點 `T * S * R`，六個純量。

`getWorldTransform(): AffineTransform`（`Entity.ts:1668`）有兩條路徑：

**快速路徑**——由 Scene 的渲染遍歷寫入的每影格快取（`:1784` 處的 `_setWorldCache`，戳記 `_wa.._wf` 與 `_worldFrame`）。若 `_worldFrame === scene.currentFrame`（`:1672`），逐字回傳六個純量——無走訪、除回傳物件外無配置。陳舊快取（本影格未渲染的實體，或在影格間查詢）未通過檢查並落入後備；快取僅能跳過工作，永不回傳錯誤矩陣。

**權威走訪**——自 `this` 至真實根（`parent === null`，而非 `id === 'root'`——使用者可設定，`:1690`）建立 `path: Entity[]`，然後自根→自身組合：

```ts
for (let i = path.length - 1; i >= 0; i--) {
  const { cos, sin } = node._getTrig(); // cached, :1746
  const la = scaleX * cos,
    lb = scaleY * sin,
    lc = -scaleX * sin,
    ld = scaleY * cos;
  const le = x,
    lf = y;
  nextA = a * la + c * lb;
  nextB = b * la + d * lb;
  nextC = a * lc + c * ld;
  nextD = b * lc + d * ld;
  nextE = a * le + c * lf + e;
  nextF = b * le + d * lf + f;
}
```

`_getTrig()`（`:1746`）快取 `{cos, sin}`，僅在 `rotation` 變更時重算（`_trigRotation` 檢查）——V8 的 `Math.cos/sin` 比其他引擎慢約 2.5 倍，且此為每實體每影格。`_readWorldCache(frame, out)`（`:1647`）為供如 `gatherHitAABBs` 的收集使用的零配置兄弟——六個純量讀入呼叫者擁有的 `out`，而非每實體一個物件。

失效為 O(1)：`Scene.render` 在權威走訪開始時遞增 `currentFrame++`（`:5806`），因此每個實體的快取以一次遞增即陳舊，無需觸碰實體。

### 4.2 WASM G1 路徑 — SoA 變換儲存

當變換後端啟用（`transformBackend: 'wasm'` / 具已載入模組的 `'auto'`），`Scene` 維護常駐 SoA 儲存（`WasmBackendFacade.ts:228` `structureVersion`，`scene-store.ts:buildTreeStore`）。在 `markStructureChanged` 上，儲存重建其拓撲（父索引、槽位指派）；每個 `Entity._storeSlot`（`:865`）屆時被指派，並在信任前對照槽表驗證。每影格，`ensureAabbs()` 在 SoA 緩衝上以一次 WASM 遍歷組合所有世界矩陣——相同的 `T·S·R` 數學，與 JS 走訪位元相等。命中測試融合收集（`HitTester.ts:144`）在可用時偏好 `transform.aabbView()`，退回呼叫每實體 `getWorldTransform()` 的 JS `gatherHitAABBs`（`wasm/hit-store.ts:47`）。陳舊的 `_storeSlot` 僅付出 JS 備援成本，永不錯誤讀取。

### 4.3 衍生查詢

- `localToWorld(x,y)`（`:1784`）/ `worldToLocal(x,y)`（`:1796`）——套用/反轉世界矩陣；`worldToLocal` 在奇異行列式（`|det| < 1e-12`）時回傳 `null`。
- `getWorldBounds()`（`:1819`）—— `getBounds() ?? {x:0,y:0,width,height}` 經四角變換，產生用於剔除與命中網格輸入的世界 AABB。
- `getWorldScale()`（`:1850`）——沿父鏈相乘 `scaleX/scaleY`（忽略旋轉——僅供命中測試反向）。

## 5. 事件分發 — 捕獲 / 冒泡與指標擁有權

### 5.1 VectoJSEvent

`VectoJSEvent<N>`（`Entity.ts:607`）鏡像 DOM 介面：`type: VectoEvent`（`:538`，`click | dblclick | hover | pointerdown/up/move/cancel/leave | wheel | keydown/keyup | scroll | change | ...`）、`target: Entity`、`currentTarget: Entity`（分發期間按節點設定）、`nativeEvent: N | undefined`、`bubbles: boolean`（預設 `true`；`hover`/`pointerleave` 為 `false`），加上 `stopPropagation()`、`stopImmediatePropagation()`、`preventDefault()`，以及轉發的 `clientX/Y`、`sceneX/Y`、`localX/Y`、`deltaX/Y`、`key/shiftKey/ctrlKey/altKey/metaKey`。

### 5.2 註冊

`Entity.on(event, cb, { capture })`（`:1470`）與 `off(event, cb, { capture })`（`:1485`）：

- 兩個延遲配置的映射：`listeners`（冒泡）與 `captureListeners`（`:1030`），各為 `Map<VectoEvent, Array<cb>>`。
- `capture: true` 註冊於 `captureListeners`；預設為冒泡。`off` 必須匹配階段。
- `emit(event, payload)`（`:1540`）為直接僅自身路徑（僅冒泡監聽器，無傳播）——供元件內部 `change` 事件。`dispatchEvent` 為樹路徑。

### 5.3 分發 — 先捕獲再冒泡

`Entity.dispatchEvent(event)`（`:1610`）：

1. 經 `parent` 鏈建立 `path: Entity[]` target→root。
2. 捕獲：root→target（`for i = path.length-1 .. 0`）觸發 `captureListeners`（`:1618`）。每節點前檢查 `propagationStopped`。
3. 冒泡：target→root（`for i = 0 .. path.length-1`）觸發 `listeners`（`:1622`）。`if (!event.bubbles) return` 於目標後——非冒泡事件仍執行捕獲，但僅目標的冒泡。
4. `fireListeners(node, map, event)`（`:1595`）快照 `handlers.slice()`，使分發中新增/移除監聽器的處理器不擾亂遍歷，並尊重 `immediatePropagationStopped`。

Scene 的 a11y 投射將原生 DOM 事件接入此樹：`Scene.ts:3802` 中每鏡像監聽器（`click`、`dblclick`、`pointerdown/up/cancel/move`、`wheel`、`keydown/keyup`）各自執行 `node.dispatchEvent(new VectoJSEvent(type, node, nativeEvent))`。`scroll`（`:3912`）特殊——它在 DOM 中不冒泡，因此 Scene 直接對擁有實體執行 `node.emit('scroll', { scrollTop, scrollLeft, ... })`（`:3920`）。

場景層級鍵盤（`Scene.ts:3272` `on('keydown'|'keyup')`）為獨立通道——無實體目標，`stopPropagation()` 轉發至原生事件（`scene/keyboard.ts:79`），`registerShortcut(chord, handler)` 僅在 `keydown` 上匹配。

### 5.4 指標擁有權

陰影元素上的 `pointerdown` 捕獲指標（`Scene.ts:3851`）：

```ts
if (e.target === capEl && typeof capEl.setPointerCapture === 'function')
  capEl.setPointerCapture(e.pointerId);
```

守衛 `e.target === capEl` 具承載力：其目標為後代的冒泡 `pointerdown` 絕不可重捕獲——後代已擁有它，祖先覆寫會將 `pointerup` + `click` 重定向至共同祖先（度量為其點擊落在 listbox 容器上的 Dropdown 選項，`Scene.ts:3844`）。`pointerup`/`pointercancel` 經 `releasePointer`（`:3831`）釋放，受 `hasPointerCapture(pointerId)` 守衛並捕捉 `NotFoundError` DOMException。`pointerEvents: 'none'`（`Entity.ts:431` `a11yAttributes.pointerEvents`）使節點退出命中測試而不影響子節點——見 §6.3。

## 6. 命中測試 — 必須一致的兩條路徑

`Scene.findEntityAt(x, y)`（`Scene.ts:2777`）委派至 `HitTester.findEntityAt(x, y, currentFrame, width, height)`（`HitTester.ts:121`）：

1. 覆蓋根優先——永遠 `findHitRecursively`（覆蓋少，永不 WASM 索引）。
2. 主樹——若 `backends.hit` 與 `ensureHitGrid(frame, width, height)`（`:144`）成功，則 `findEntityAtWasm`（`:185`）；否則 `findHitRecursively`（`:227`）。WASM 路徑具決定性——正確實體或 `null`，永不「不確定」——因此可信網格後無 JS 備援。

`findHitRecursively(node, x, y, clip)`（`:227`）：

- 跳過 `opacity <= 0` 子樹（累積透明度）。
- `clipChildren` 經 `intersectBounds`（`:32`）交集至 `childClip`——向下傳遞，節點自身仍對傳入裁剪可測試。
- 按反向繪製順序的子節點（最上層優先）。
- 節點命中當且僅當 `isPointInside(x,y) && isInsideAllClippers(node,x,y) && !isPointerTransparent(node)`。

`isInsideAllClippers`（`:284`）為權威的旋轉感知門——每個 `clipChildren` 祖先的 `worldToLocal(x,y)` 必須位於 `[0, width]×[0, height]` 內。遍歷中的 AABB 裁剪堆疊僅為子樹修剪預過濾；兩條命中路徑皆必須重套用精確矩形，否則旋轉的裁剪器使每後端產生不同答案（#680）。

`isHitEligible(node,x,y)`（`:326`，WASM 路徑）扁平重套用相同門控：`!isPointerTransparent`、節點與每個祖先的 `opacity>0`，以及 `isInsideAllClippers`。`isPointerTransparent`（`:284`）為 `attrs.disabled === true || attrs.pointerEvents === 'none'`（`Entity.ts:431`）——透明容器的子節點仍被走訪。

## 7. 渲染排程 — dirty 與迴圈相會處

`Scene.loop(time)`（`Scene.ts:5569`）在 `requestAnimationFrame` 上執行：

1. 若 `!_canvasOnScreen`（IntersectionObserver）則 bail——隱藏時 `markDirty()` 無害，旗標持續。
2. 計算 `isIdle = !dirty && !frameHadAnimation && !contentSemanticDeferred`（`:5594`）——同時驅動 `onDemand` 跳過與 `always` 自動節流至 `idleFPS`。
3. `effectiveMaxFPS()`（`:5556`）——當 `prefersReducedMotion` 匹配時，明確的 `maxFPS` 降至 `30`。
4. 影格率上限：`if (cap>0 && time - lastTime < 1000/cap -1) skip`（`:5605`）。
5. 當接近時將 `dt` 對齊至標稱 `1000/cap` 的 ±30% 以移除合成器抖動；箝制至 `MAX_FRAME_DT` 以避免背景化分頁後的彈簧爆炸（`:5630`）。
6. `onDemand && isIdle → skip`（`:5640`）。
7. `dirty = false` **在** `render()` 之前（`:5650`）——見 §3.2。
8. `render(renderer, dt, time)`（`:5730`）——遞增 `currentFrame`，計時批次 driver（`_tickBatchedDrivers`），推進粒子模擬，走訪實體。
9. 渲染後 a11y/內容投射同步——在 `frameHadAnimation` 期間完全跳過（防止 DOM 回流重創畫布迴圈）。

`Scene.step(dt)`（`Scene.ts:3420`）為同步確定性驅動器（影片匯出、測試、基準）——無條件渲染，不諮詢 `renderMode`/`dirty`/`maxFPS`，並在之後清除 `dirty`。以 `step()` 驅動基準的測試無法觀測 `onDemand` 跳過（`Scene.ts:3406` 文件）。

## 8. 困難之處 — 附憑據

### 8.1 祖先遍歷為 O(depth) 且數量眾多

`getWorldTransform`、`getWorldScale`、`isInsideAllClippers`、`isHitEligible`、`dispatchEvent` 路徑建構、`Entity.scene` getter——各自走訪 `parent` 至根。深度通常淺（Stack → Card → RichText），因此每呼叫 O(depth) 低廉，但命中測試與渲染遍歷每實體每影格呼叫它。三項緩解：

- **每影格快取**（`_worldFrame` / `currentFrame`，`:845`/`5806`）——O(1) 失效，當渲染遍歷已戳記矩陣時的快速路徑。`getWorldTransform` 僅在未命中時退回走訪。
- **零配置讀取**（`_readWorldCache`，`:1647`）供如 `gatherHitAABBs` 的收集——六個純量讀入呼叫者擁有的物件，而非每實體一個配置。G2 整合基準發現逐實體閉包配置為真實成本（`DriverTicker.ts:40` 表頭）。
- **WASM SoA 儲存**（G1）——對型別化陣列的一次線性遍歷而非逐實體走訪；`ensureHitGrid` 融合收集（`HitTester.ts:144`）重用 `transform.aabbView()` 以避免每實體重推導四角（JS 收集在 100k 實體時為 11.2 ms vs 39 µs，幾乎全在核心之前）。

儘管如此，插入 500 深的鏈並在緊湊迴圈中呼叫 `getWorldTransform` 將為 O(n·depth)。保持樹寬而非深。

### 8.2 變換成本 — cos/sin 陷阱

V8 上的 `Math.cos/sin` 為軟體 libm 呼叫，比其他引擎慢約 2.5 倍（`Entity.ts:828` 表頭）。`Entity._getTrig()`（`:1746`）快取該對，僅在旋轉變更時重算；`getWorldTransform` 與渲染遍歷皆讀取它。無此，則具大量旋轉粒子的場景（Danmaku）為未變更角度每實體每影格支付 libm 成本。`_hasTransitions` 旗標（`:812`）為同類微優化——多數實體永不動畫，因此 `x = v` 絕不可觸碰轉場/driver 映射。

### 8.3 生命週期洩漏 — 反覆出現的三種

**Driver 子樹洩漏。** `DriverTicker.active: Set<Entity>`（`DriverTicker.ts:84`）為批次候選集。`Entity.add` 註冊子樹（`:1087` 鏡像），`remove` 取消註冊（`:1130`）。若任一呼叫被遺漏——例如直接變更 `children` 而非經 `add`/`remove` 的自訂容器——driver 每影格在離樹狀態下持續計時並固定實體於 Set。稽核：搜尋 `Entity.ts` 外的直接 `children.push/splice`。

**已銷毀守衛。** `Entity.destroy()`（`:1525`）先設定 `_destroyed`，再遞迴。第二次 `destroy()` 為無操作；經子節點 `onMounted` 或 driver `onDone` 重入的 `destroy()` 看到旗標並停止。`Scene.destroy()`（`:2957`）在拆解子節點前設定 `destroyed`，每個非同步回呼（WebGPU 裝置復原 `:5813`、`requestAnimationFrame` 迴圈 `:5569`）檢查 `if (destroyed) return/newDevice.destroy()`。遺漏守衛會復活半拆解場景或跨 SPA 路由變更洩漏 GPU 裝置。

**A11y / portal 洩漏。** `remove` 呼叫 `detachA11y(child)`（`:1117`），`destroy` 經 `A11yProjectionManager.ts:227` 呼叫 `removeA11yRecursively`。投射的 `contentSemanticBudget` 與 `contentViewportEpoch` 確保被移除實體的載體/投射狀態不跨 `syncA11y` 遍歷保留。忘記 `detachA11y` 會留下仍捕捉指標事件並出現於 `getA11yTree()` 的透明陰影元素。

### 8.4 渲染排程器分解陷阱

`Scene.ts` 約 6.5k 行，因為四個領域共用可變影格狀態：`DirtyTracker`（`DirtyTracker.ts:70`）、`DriverTicker`（`DriverTicker.ts:57`）、`HitTester`（`HitTester.ts:17`）與 `WasmBackendFacade`（`WasmBackendFacade.ts:1`）已依 `forge/decisions/file-decomposition-2026-08.md` 萃取，但 `loop`/`render` 與 `a11yRoot`/`canvas` 幾何仍留在 Scene。`Scene._updateWalkDt`（`:5806`）為 `Entity._spawnDriver` 的中途趕上計時發布——在批次遍歷聲稱實體後產生的 driver，否則在 WASM 路徑上等至下一影格，但在 JS 路徑上同影格計時。未一起攜帶 `dt`/`currentFrame`/`frameHadAnimation` 而拆分 `loop` 違反 `DEC-0019` 規則 5。

## 9. 開發者必須保持的不變量

1. **除經 `add`/`remove`/`destroy` 外永不變更 `children`。** 直接陣列變更跳過 `markStructureChanged`、`markDirty`、driver 註冊與 a11y 分離——四個不變量皆靜默破壞。搜尋 `Entity.ts` 外的 `\.children\.push|\.children\.splice`。
2. **排程工作前檢查 `destroyed`。** 任何觸碰 `scene` 或 `entity.scene` 的 `requestAnimationFrame`、`setTimeout`、`ResizeObserver` 或 WebGPU promise 必須守衛 `if (destroyed) return`。`Scene.ts:3137` 處的 `destroy()` 文件明確。
3. **尊重 dirty 契約。** `onDemand` 場景直至 `markDirty()` 或活躍 driver 前皆休眠。在 `Entity.animate`/`setTransition` 外變更 `x/y/scale/rotation/opacity/width/height` 而無 `markDirty({ reason })` 使變更不可見。相反，每影格 `markDirty`（例如 `update()` 自我重武裝）使 `onDemand` 保持清醒——使用 `scene.dirtyReasons`（`:3489`）找出每影格觸發的 `reason`。
4. **保持命中測試門控同步。** 任何新可見性/輸入/裁剪條件必須同時加入 `findHitRecursively`（`HitTester.ts:227`）與 `isHitEligible`（`:326`）。僅在一處的條件使 WASM 與 JS 路徑不一致——加速器成為錯誤產生器。
5. **僅在 `e.target === capEl` 時指標捕獲。** `Scene.ts:3851` 守衛非可選。移除它會破壞每個其選項為捕獲元素子節點的 Dropdown/Select 選單。
6. **世界矩陣消費者必須處理陳舊快取情況。** `getWorldTransform()` 僅能對 `currentFrame` 回傳快取矩陣；在影格間或對離樹實體它會走訪。`_readWorldCache` 呼叫者在回傳 `false` 時必須退回完整走訪（`HitTester.ts:144` 融合收集註解）。
7. **為度量做版本控管，勿掃描。** 字型/DPR/視埠變更經世代計數器（`ContentProjectionManager.ts:524`）使所有 `scaleX`/校準失效，而非觸碰每個載體。同一模式適用於形狀快取的 `structureVersion`。

## 10. 除錯檢查清單 — 當場景看似錯誤時

- **`onDemand` 模式下變更後無任何渲染** → `dirty` 仍為 `false`？啟用 `scene.setDirtyTracking(true)`，變更後讀取 `scene.dirtyReasons`。約 90% 情況原因為遺漏 `markDirty`。在 devtools 中檢查 `scene.frameStats.dirty`（`Scene.ts:3528`）。
- **`remove()` 後幽靈命中目標** → `children` 是否被直接變更？檢查 `structureVersion` 遞增與 `HitTester.ensureHitGrid` 陳舊性（`hitGridStructureVersion` vs `structureVersion`）。具 `hitGridOk=true` 的陳舊網格提供錯誤候選。
- **子樹移除後 driver 持續執行** → `DriverTicker.active` 大小應下降。檢查 `scene._tickBatchedDrivers` 門——`DriverTicker.ts:101` 處的 `unregisterSubtree` 走訪整個子樹，因此非常深的分離子樹在移除時支付 O(subtree) 而非每影格。
- **變換在 JS vs WASM 間分歧** → 比較 `entity.getWorldTransform()`（JS 走訪）與 `transform.aabbView()` 槽位。陳舊的 `_storeSlot`（`Entity.ts:865`，不在儲存中時為 `-1`）僅導致緩慢正確的 JS 備援，永不錯誤矩陣——若矩陣不同，則拓撲重建遺漏 `markStructureChanged`。
- **事件觸發兩次或完全未觸發** → 檢查 `bubbles` 旗標（`VectoJSEvent.ts:607`）與監聽器位於 `captureListeners` vs `listeners`。非冒泡的 `hover`/`pointerleave` 僅在冒泡階段於目標觸發。
- **分頁重新聚焦時彈簧爆炸** → `loop` 將 `dt` 箝制至 `MAX_FRAME_DT`（`Scene.ts:5630`）。若自訂 `step(dt)` 直接以巨大 `dt` 饋入 `tickDrivers`，呼叫者必須套用相同箝制。

---

_Series: 00 Overview → 01 Selection → 02 Text+Layout → 03 Projection+Virtualization → 04 Streaming Markdown → 05 TeX → **06 VMT Runtime** → 07 Renderer → 08 WASM G1/G2/G3 → 09 Three/XR → 10 Video Export → 11 Graph Layout → 12 DevTools → 99 Synthesis._
