+++
title = "Scene"
description = "頂層 VectoJS 協調器：建構函式選項、渲染迴圈、renderMode/maxFPS 和閒置自動節流、生命週期方法，以及可插拔的 WebGL/WebGPU 後端登錄。"
weight = 2
+++

# `Scene`

屬於 [`@vectojs/core`](/reference/core-api/) 的一部分。

```ts
new Scene(canvas: HTMLCanvasElement, options?: SceneOptions)
```

頂層協調器。每個 `<canvas>` 一個 `Scene`。使用 `add()` 加入 `Entity` 物件，然後 `start()` 迴圈。

```ts
const scene = new Scene(document.querySelector('canvas')!);
scene.add(new Circle({ radius: 24, fill: '#38bdf8' }).setPosition(100, 100));
scene.start();
```

Scene 會將兩個透明的兄弟 `<div>` 附加到 canvas 的**父**元素中（用於 `z-index:10` 的 a11y 陰影層和 `z-index:9` 的 DOM-portal 層），並在父元素為 `static` 時強制其設為 `position:relative`。在 SSR/Node（無 `document`）中，a11y/portal 投射會降級為 no-op，因此無頭 layout / `toSVG()` 仍可運作。

## SceneOptions

| 選項                   | 類型                          | 預設             | 效果                                                                                                                                                                                                                           |
| ---------------------- | ----------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pointBackend`         | `'canvas' \| 'webgl'`         | `'canvas'`       | 用於可表示的 `getBatchCircle()`/`getBatchRect()` 葉的後端。`'webgl'` 疊加一個 WebGL2 canvas（`z-index:5`）並批次處理那些基本元件；不可用的 WebGL2 會回退到 Canvas。GL 層在 2D 內容之上合成，因此跨層畫家順序不會交錯。         |
| `particleBackend`      | `'auto' \| 'webgpu' \| 'cpu'` | `'auto'`         | [`ComputeParticleEntity`](/reference/core-particles/) 後端。`'auto'` 嘗試 WebGPU 並在回退到 CPU 前警告。`'webgpu'` 明確請求 WebGPU，但目前會記錄錯誤，且若初始化失敗仍會回退。`'cpu'` 強制 CPU 模擬（設定 `webgpuDisabled`）。 |
| `maxFPS`               | `number`                      | `60`             | 幀率上限。`0` = 無上限（原生更新率）。連續動畫仍會執行，只是頻率較低。（在 `NODE_ENV=test`/`VITEST` 下內部為 `0`。）也可透過 `scene.maxFPS` 即時設定。                                                                         |
| `respectReducedMotion` | `boolean`                     | `true`           | 當 OS 請求 `prefers-reduced-motion` 時，上限為 `REDUCED_MOTION_FPS`（30）— 或該值與 `maxFPS` 中較低者。`false` 會忽略 OS 設定。                                                                                                |
| `readingDirection`     | `'ltr' \| 'rtl'`              | `'ltr'`          | 為 a11y/自動化陰影樹設定閱讀方向，使鍵盤**標籤順序**和螢幕閱讀器遍歷遵循_視覺_閱讀順序，而非場景圖插入順序。`'rtl'` 會反轉每行內的行內順序。也可透過 `scene.readingDirection` 即時設定。                                       |
| `a11ySyncInterval`     | `number`                      | `0`              | 將 a11y 陰影 DOM 同步節流到每 N 毫秒最多一次。`0` = 每個渲染的幀都同步。較小的值（例如 `100`）在繁重動畫期間讓 a11y 層最終一致，同時節省每幀 DOM 寫入。也可透過 `scene.a11ySyncInterval` 即時設定。                            |
| `debugA11y`            | `boolean`                     | `false`          | 以藍色虛線外框（開發輔助）渲染陰影節點，而非 `opacity:0`。無論哪種方式，它們對自動化都保持可點擊。                                                                                                                             |
| `renderer`             | `IRenderer`                   | `CanvasRenderer` | 自訂 renderer（例如來自 [`@vectojs/three`](/reference/three-renderer/) 的 `ThreeRenderer`）。                                                                                                                                  |
| `disableWindowResize`  | `boolean`                     | `false`          | 略過自動的 `window` 調整大小監聽器。用於自訂 layout 容器 / 離螢幕 canvas 內，然後使用 `resize(w, h)` 驅動尺寸。                                                                                                                |
| `maxDPR`               | `number`                      | `undefined`      | 用於設定 Canvas2D 和 `pointBackend: 'webgl'` 後備儲存尺寸的裝置像素比上限。`undefined` 讀取真實的、未限制的 `devicePixelRatio`。在每次 `resize()` 呼叫時重新套用，而不僅僅在建構時。請見下方「限制渲染 DPR」。                 |

注意：`renderMode` 是一個**公開欄位**（預設 `'always'`），而非建構函式選項 — 在建構後設定 `scene.renderMode = 'onDemand'`。

### 限制渲染 DPR（`maxDPR`）

後備儲存的渲染成本與 `邏輯尺寸 × dpr²` 成比例，而非線性——在全螢幕場景中，在 DPR 1（大多數開發筆電）下流暢執行的場景可能在 DPR 3 顯示器上超出其 16ms 幀預算，且直到有人實際在該顯示器上測試才可見。這對 `pointBackend: 'webgl'` 影響最大，因為它渲染一個獨立的疊加畫布，其片段/過度繪製成本恰好是這個 DPR² 曲線——一個全螢幕 1200 粒子場在 DPR 3 下測得 **116ms** 最大幀，而在 DPR 1 下則為完美的 60fps。

```ts
const scene = new Scene(canvas, { pointBackend: 'webgl', maxDPR: 2 });
```

`maxDPR: 2` 保持顯示視網膜清晰（2× 已經超過大多數眼睛在正常觀看距離下的分辨能力），同時限制了後備儲存像素數量——在 DPR 3 下大約減半，因為 `2² / 3² ≈ 0.44×` 像素。在此選項出現之前，唯一的解決方法是在建構 Scene 之前猴子補丁 `window.devicePixelRatio`；現在首選 `maxDPR`——它在每次調整大小時正確重新套用，而一次性 `Object.defineProperty` 補丁則做不到。

### 兩個投影邊距

內容投影有兩個獨立的層級，從 `1.31.0` 起每層都有自己的邊距：

- **語意層**（`contentSemanticMargin`）—— 這個區塊是否有_任何_ DOM？擁有 DOM 的區塊會把它的文字提供給瀏覽器原生的頁內尋找、複製以及螢幕閱讀器的預讀。
- **互動層**（`contentProjectionMargin`）—— 是否建構該區塊的_逐行載體_？載體為瀏覽器提供逐行的選取幾何資訊。

在拆分之前，一個純量同時控制兩者，因此只存在兩種配置：有限值會完全釋放螢幕外的區塊，使螢幕外文字無法被尋找；而 `Infinity` 會同時實體化文件中的每一個載體。

將兩者分開後，就得到了真正有用的中間狀態：

```ts
const scene = new Scene(canvas, {
  // Every block keeps its text, so find-in-page sees the whole document.
  contentSemanticMargin: Infinity,
  // Carriers stay bounded by the viewport, so cost scales with what is visible.
  contentProjectionMargin: scene.height,
});
```

> [!IMPORTANT]
> `Infinity` 對 `contentSemanticMargin` 是安全的，對 `contentProjectionMargin` **不是**。使其不受支援的成本來自未加視窗化的載體帶，而不是常駐文字。

位於互動邊距之外但在語意邊距之內的區塊，會把它的完整文字投影為單個節點，且**沒有**載體子節點。它可被尋找和複製；僅缺少逐行的選取幾何資訊，而在把它捲動進視口之前本來也無法觸及那部分。

值得了解一次性成本：常駐層級在首次同步時為每個區塊實體化一個元素，實測約為每個新建節點 13 µs —— 在 1000 個區塊時約 47 ms。穩定狀態很便宜，因為能標記自身內容的實體讓 Scene 可以完全跳過未變更區塊的重新投影。所以這是文件開啟時的成本，而不是每一影格的成本。

## 公開欄位

```ts
scene.canvas: HTMLCanvasElement
scene.width: number
scene.height: number
scene.overlayRoot: Entity          // children drawn above the main tree, bypassing clip bounds
scene.renderMode: 'always' | 'onDemand'   // default 'always'
scene.maxFPS: number               // default 60
scene.respectReducedMotion: boolean
scene.a11ySyncInterval: number
scene.particleBackend: 'auto' | 'webgpu' | 'cpu'
scene.webgpuDisabled: boolean      // getter true when _disabled OR particleBackend === 'cpu'
scene.a11yNeedsReorder: boolean
scene.readingDirection: 'ltr' | 'rtl'   // tab/traversal order; setting it re-flows
scene.forcedColors: boolean             // getter — OS is in a forced-colors mode
```

## renderMode、maxFPS 和閒置自動節流

- **`renderMode: 'always'`（預設）** — 每幀重新渲染，受有效 FPS 上限限制。
- **`renderMode: 'onDemand'`** — 只在場景為 _dirty_（見 `markDirty()`）或有動畫/過渡驅動器待處理時才繪製。靜態 rAF 滴答仍會檢查樹以查找待處理的動作，但會略過 entity 更新/渲染和 GPU 提交。適合靜態 / 事件驅動的 UI。

**閒置自動節流（關鍵注意事項）。** 當場景不是 dirty 且主/覆蓋層樹中沒有節點有待處理的 `animate()` 補間時，該場景被視為**靜態**。在 `maxFPS > 0` 的 `'always'` 模式下，靜態場景會被節流到**閒置下限** —— 自 `1.36.0` 起為 **60 fps**（由 `idleFPS` 設定），在此之前是硬性 2 fps —— 以節省電池/GPU。設定 `autoThrottle: false`（選項或即時 `scene.autoThrottle`）可完全停用節流，或設定 `idleFPS: 2` 恢復舊有的積極休眠。`dirty` 旗標會在每個渲染幀_開始_時被消耗，因此在 `update()` 內部發出的 `markDirty()` 能延續到下一幀的靜態檢查：

> 手動動畫（在自訂 `update()` 中變更 `entity.x` 等）對靜態檢查不可見，除非你主動回報 ——
> 透過 [`entity.animate()`](/reference/core-entity/#dong-hua) 驅動動作（補間執行時讓場景保持非靜態）、
> 覆寫 `hasPendingAnimations()` 在積分器執行期間回傳 `true`，
> 或在 `update()` 中每幀呼叫 `scene.markDirty()`（它會重新觸發下一幀）。
> 否則場景會閒置降至節流下限，你的動畫會變得極為緩慢。

`effectiveMaxFPS` = `maxFPS`，當 OS 請求減少動態效果且 `respectReducedMotion` 開啟時，進一步降低到 30（`REDUCED_MOTION_FPS`）。`0` 表示無上限。

### 離屏暫停與 dt 鉗制

兩個容易忽略的迴圈行為：

- **離屏場景停止渲染。** canvas 上的 `IntersectionObserver` 在 canvas 完全滾動出視野時暫停 rAF 迴圈（儀表板標籤頁、折疊線以下的圖表），並在重新進入時恢復 — 而不是為一個沒人看到的場景執行完整的更新/渲染。在 `IntersectionObserver` 不可用的地方（SSR/jsdom），場景被視為始終在螢幕上，因此那裡的行為不變。
- **`dt` 被鉗制到 100ms**（`MAX_FRAME_DT`）。在標籤頁切換到背景後、中斷點或長時間 GC 暫停後，實際經過的時間可能是秒級的；將該原始值輸入物理/補間積分會使一切瞬移。如果你在 `update(dt)` 中自己積分 `dt`，請注意它永遠不會超過 100ms。

## 無障礙與外觀

| 成員                   | 類型               | 說明                                                                                                                               |
| ---------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `readingDirection`     | `'ltr' \| 'rtl'`   | 對 a11y 陰影樹排序，使**標籤順序**匹配視覺閱讀順序（行從上到下，然後行內）。設定它會在下一次同步時觸發重排。同時也是建構函式選項。 |
| `forcedColors`         | `boolean` (getter) | 當作業系統處於強制色彩模式時為 `true`（Windows 高對比度）。由 `(forced-colors: active)` 支援；當其切換時，場景**自動重繪**。       |
| `prefersReducedMotion` | `boolean` (getter) | 當作業系統要求減少動態效果且 `respectReducedMotion` 開啟時為 `true`。由動畫驅動器讀取，它們會快速定位而非補間非 opacity 屬性。     |

`<canvas>` 是不透明像素，因此瀏覽器的強制色彩重新對應永遠不會觸及你繪製的內容。元件必須自行回應：

```ts
render(r: IRenderer) {
  const forced = this.scene?.forcedColors ?? false;
  r.fill(forced ? 'ButtonFace' : this.bg);
  r.fillText(this.label, x, y, this.font, forced ? 'ButtonText' : this.color);
}
```

請參閱 [a11yRoot 與 agent 契約](/reference/core-a11y/#qiang-zhi-se-cai-gao-dui-bi-du)。

## 生命週期方法

```ts
scene.add(entity: Entity): this              // attach to the scene root
scene.remove(entity: Entity): this           // detach + recursively tear down its a11y shadow nodes
scene.start(): void                          // begin the rAF loop; idempotent; warns once if width/height is 0
scene.stop(): void                           // halt after the current frame; start() resumes
scene.destroy(): void                        // idempotently destroy owned entity subtrees/resources, loop, listeners, DOM layers, GPU managers, and renderer
scene.markDirty(): void                      // request a redraw next frame (meaningful in onDemand + escapes idle throttle)
scene.resize(width: number, height: number): void   // set viewport; resizes renderer + GL layer; marks dirty
scene.showOverlay(overlay: Entity): void     // add to overlayRoot (drawn on top, no clip)
scene.hideOverlay(overlay: Entity): void
scene.detachA11y(entity: Entity): void       // remove shadow nodes for a subtree WITHOUT removing it from the tree
```

> **`resize(w, h)` 必須在粒子模擬之前執行。** 除非設定了 `disableWindowResize`，
> 否則寬度/高度來自 `window.innerWidth/innerHeight`，在該情況下它們回退到
> `canvas.width || canvas.clientWidth || 0`。`0×0` 的視口意味著粒子在零框中
> 模擬且可能不會渲染。當寬度或高度為 0 時，`start()` 會記錄一次性警告。
>
> `resize()` 也是文字投射的度量邊界。即使邏輯寬度和高度未變更，
> 也請在自訂容器或應用程式 CSS 縮放變更後呼叫它；Core 1.8 接著會重建
> 冷校準鍵，並在標記預備網格就緒前等待新的 Firefox/Chromium Range 幾何。
>
> **`syncA11y` 在一幀內只建立/更新，從不修剪。** 如果某個元件每幀換出
> 可互動的_子_ entity，請在丟棄它們之前呼叫 `detachA11y(child)`，否則它們的
> `<a>`/控制項陰影節點會洩漏。（`remove()` 已遞迴修剪。）

## 其他 Scene 方法

```ts
scene.getRenderer(): IRenderer
scene.getRoot(): Entity
scene.clientToScene(clientX: number, clientY: number): Point // viewport → logical Scene coordinates
scene.render(renderer: IRenderer, dt = 0, time = 0): void   // main renderer advances state; secondary renderers draw a read-only snapshot
scene.toSVG(): string                        // read-only current-state snapshot through SVGRenderer → flat SVG XML
scene.findEntityAt(x, y): Entity | null      // topmost entity whose isPointInside() returns true (depth-first, front-to-back; no interactive filter)
scene.getA11yElement(entityId: string): HTMLElement | undefined
scene.getA11yTree(): A11yTreeNode[]          // nested snapshot of the projected shadow nodes (id/tag/role/label/value/...)
```

## User Timing 埋點

Scene 可以在渲染階段周圍發出 [`User Timing`](https://developer.mozilla.org/en-US/docs/Web/API/User_Timing_API) 標記/量測，因此剖析器捕捉能精確顯示一幀的時間花在哪裡。預設關閉；透過 `userTiming` 選項啟用，或透過 `scene.setUserTiming(true)` 即時啟用：

```ts
const scene = new Scene(canvas, { userTiming: true });
// or
scene.setUserTiming(true); // runtime toggle
scene.userTiming; // read the current state
```

穩定的量測名稱以 `VECTO_USER_TIMING` 匯出：

```ts
VECTO_USER_TIMING.scene; // { transform, drawWalk, entityPaint, flush, a11ySync }
VECTO_USER_TIMING.markdown; // { parse }
// e.g. 'vecto:scene:transform', 'vecto:markdown:parse'
```

`@vectojs/core` 還匯出引擎內部使用的底層輔助函式（自訂 renderer 或已埋點的元件也可以使用它們來新增自己的階段）：

```ts
beginVectoUserTiming(name: string): VectoUserTimingSpan | null
endVectoUserTiming(span: VectoUserTimingSpan | null): void
measureVectoUserTiming(name: string, durationMs: number): void
```

當宿主不實作標記/量測時，`beginVectoUserTiming` 回傳 `null`（而 `measureVectoUserTiming` 為 no-op），因此選擇性的效能剖析永遠不會成為執行階段需求。跨度使用唯一命名的開始/結束標記，這些標記在 `endVectoUserTiming` 時釋放。`measureVectoUserTiming` 發出一個錨定在目前時間、時長由不相交呼叫累積而來的量測——這是無需對每個實體埋點即可報告每幀實體繪製總計的路徑。

### WASM 加速器後端

四個計算熱點可以執行在 WebAssembly 中。每個熱點都有一個同步的安裝/清除介面（`set*Backend`）和一個非同步熱替換介面（`enableWasm*`），後者會實例化模組並在失敗時回退到 JS——**失敗是預設狀態，絕不是錯誤路徑**。`enable*` 形式接受 URL 字串、`URL`、`Response` 或原始位元組。

```ts
await scene.enableWasmTransforms(new URL('./vectojs_core.wasm', import.meta.url)); // transforms (render walk)
await scene.enableWasmHitTest(source);    // hit-testing
await scene.enableWasmAnimBatching(source); // animation driver batching
await scene.enableWasmParticles(source);  // CPU particle simulation fallback
scene.setTransformBackend(backend | null); scene.setHitTestBackend(...);
scene.setAnimBackend(...); scene.setParticleBackend(...);  // synchronous swap/clear
scene.wasmRuntime: CoreWasmRuntime | null  // getter — loaded runtime, or null
scene.particleSimBackend: 'js' | 'wasm'    // getter — which backend runs the CPU particle sim
```

某個後端在這一幀是否真正**執行過**，與它是否已安裝是兩個獨立的問題——`@vectojs/devtools` 的 `inspectAccelerators()` 會報告每個後端的 `activeThisFrame`，包括在 JS 確實更快時的 `'below-gate'` 判定。wasm 模組由 monorepo 中的 `just wasm` 建置，並從 `crates/vectojs-core-rs/` 發布（`.wasm` 絕不提交；由 CI 建置並發布到 npm）。

這些核心遵循同一份失敗合約，與 `vectojs-force-rs` 逐條對應：

- **分配失敗回傳狀態碼而不是陷阱。** 每個 `*_init` 都會暫存其分配，當分配器拒絕時，釋放已完成的部分並回報 `STATUS_OVERFLOW`，因此 JS 呼叫方按次呼叫回退到其參考路徑。以前分配失敗會在 `panic = "abort"` 下中止整個實例——從 JS 無法捕獲。
- **垃圾輸入會被拒收而不是造成污染。** 批次 tween 核心像 `TweenDriver.tick` 一樣精確拒絕 NaN、零和負的 `dt`（`STATUS_OK`，不寫入任何內容），因此壞幀不能永遠卡死一個 tween；完成的 tween 會逐位落在 JS 驅動器的終止值上。
- **核心選擇會探測匯出。** SIMD 進入點（`compute_aabbs_simd`、`compose_simd`）在使用前會被探測；早於某個匯出的過期快取模組會降級到逐位相同的純量路徑，而不是在渲染中途拋出例外。

## 可插拔後端登錄（靜態）

```ts
Scene.registerWebGLPointRendererCreator(creator: WebGLPointRendererCreator): void
Scene.registerWebGPUParticleSystemManager(managerClass: any): void
```

由 `.` 進入點自動呼叫。相關介面（`IWebGLPointRenderer`、`IWebGPUParticleSystemManager`、`WebGLPointRendererCreator`）已匯出供自訂後端使用。WebGPU 裝置遺失會以指數退避（3 次重試）自動恢復，之後才永久停用 WebGPU。

## 幀遙測（`frameStats`，1.13.0）

```ts
scene.frameStats: FrameStats; // 即時渲染迴圈遙測（唯讀）

interface FrameStats {
  fps: number; // 實際渲染幀的幀率，受 maxFPS 限制；在首幀渲染之前為 0
  frameTimeMs: number; // 最後一次 render() 呼叫的掛鐘耗時（不含 a11y/內容同步）
  frameIntervalMs: number; // 已渲染幀之間的平滑間隔（EMA）
  dt: number; // 傳遞給最後一幀渲染的 dt
  renderedFrames: number; // 自 start() 以來渲染的總幀數
  skippedFrames: number; // 自 start() 以來跳過的 rAF 切片總數（idle/onDemand/capped）
  renderMode: 'always' | 'onDemand';
  dirty: boolean; // 是否有待處理的重繪
}
```

`fps` 基於_實際渲染幀_之間的間隔計算，因此閒置的 `onDemand` 場景、被 `maxFPS` 上限或靜態自動節流捨棄的幀不會壓低該值——它報告的是真實重繪的節奏，而非原始 rAF 頻率。計時在 `requestAnimationFrame` 迴圈上測量；僅由 `step()` 驅動的場景（確定性匯出）其值為零。繪製器始終重繪完整畫布，不存在局部髒矩形機制——`dirty` 是布林型重繪待處理標誌。為 [`@vectojs/devtools`](/reference/devtools/) 效能 HUD 提供資料支撐。

## 相關

[`Entity`](/reference/core-entity/)（Scene 擁有的樹）·
[`IRenderer` / `CanvasRenderer`](/reference/core-renderer/) ·
[`ComputeParticleEntity`](/reference/core-particles/) ·
[a11yRoot 與 agent 契約](/reference/core-a11y/) ·
[`@vectojs/core` 概覽](/reference/core-api/)
