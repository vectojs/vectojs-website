---
title: 'Scene'
description: '頂層 VectoJS 協調器：建構函式選項、渲染迴圈、renderMode/maxFPS 和閒置自動節流、生命週期方法，以及可插拔的 WebGL/WebGPU 後端登錄。'
order: 2
---

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
| `a11ySyncInterval`     | `number`                      | `0`              | 將 a11y 陰影 DOM 同步節流到每 N 毫秒最多一次。`0` = 每個渲染的幀都同步。較小的值（例如 `100`）在繁重動畫期間讓 a11y 層最終一致，同時節省每幀 DOM 寫入。也可透過 `scene.a11ySyncInterval` 即時設定。                            |
| `debugA11y`            | `boolean`                     | `false`          | 以藍色虛線外框（開發輔助）渲染陰影節點，而非 `opacity:0`。無論哪種方式，它們對自動化都保持可點擊。                                                                                                                             |
| `renderer`             | `IRenderer`                   | `CanvasRenderer` | 自訂 renderer（例如來自 [`@vectojs/three`](/reference/three-renderer/) 的 `ThreeRenderer`）。                                                                                                                                  |
| `disableWindowResize`  | `boolean`                     | `false`          | 略過自動的 `window` 調整大小監聽器。用於自訂 layout 容器 / 離螢幕 canvas 內，然後使用 `resize(w, h)` 驅動尺寸。                                                                                                                |
| `maxDPR`               | `number`                      | `undefined`      | 用於設定 Canvas2D 和 `pointBackend: 'webgl'` 後備儲存尺寸的裝置像素比上限。`undefined` 讀取真實的、未限制的 `devicePixelRatio`。在每次 `resize()` 呼叫時重新套用，而不僅僅在建構時。請見下方「限制渲染 DPR」。                 |

|注意：`renderMode` 是一個**公開欄位**（預設 `'always'`），而非建構函式選項 — 在建構後設定 `scene.renderMode = 'onDemand'`。

### 限制渲染 DPR（`maxDPR`）

後備儲存的渲染成本與 `邏輯尺寸 × dpr²` 成比例，而非線性——在全螢幕場景中，在 DPR 1（大多數開發筆電）下流暢執行的場景可能在 DPR 3 顯示器上超出其 16ms 幀預算，且直到有人實際在該顯示器上測試才可見。這對 `pointBackend: 'webgl'` 影響最大，因為它渲染一個獨立的疊加畫布，其片段/過度繪製成本恰好是這個 DPR² 曲線——一個全螢幕 1200 粒子場在 DPR 3 下測得 **116ms** 最大幀，而在 DPR 1 下則為完美的 60fps。

```ts
const scene = new Scene(canvas, { pointBackend: 'webgl', maxDPR: 2 });
```

`maxDPR: 2` 保持顯示視網膜清晰（2× 已經超過大多數眼睛在正常觀看距離下的分辨能力），同時限制了後備儲存像素數量——在 DPR 3 下大約減半，因為 `2² / 3² ≈ 0.44×` 像素。在此選項出現之前，唯一的解決方法是在建構 Scene 之前猴子補丁 `window.devicePixelRatio`；現在首選 `maxDPR`——它在每次調整大小時正確重新套用，而一次性 `Object.defineProperty` 補丁則做不到。

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
```

## renderMode、maxFPS 和閒置自動節流

- **`renderMode: 'always'`（預設）** — 每幀重新渲染，受有效 FPS 上限限制。
- **`renderMode: 'onDemand'`** — 只在場景為 _dirty_（見 `markDirty()`）或有動畫/過渡驅動器待處理時才繪製。靜態 rAF 滴答仍會檢查樹以查找待處理的動作，但會略過 entity 更新/渲染和 GPU 提交。適合靜態 / 事件驅動的 UI。

**閒置自動節流（關鍵注意事項）。** 當場景不是 dirty 且主/覆蓋層樹中沒有節點有待處理的 `animate()` 補間時，該場景被視為**靜態**。在 `maxFPS > 0` 的 `'always'` 模式下，靜態場景會被節流到 **~2 fps** 以節省電池/GPU。`dirty` 旗標在每個渲染幀結束時（渲染後）重設為 `false`，因此：

> 如果你透過在自訂 `update()` 中變更 `entity.x` 等進行手動動畫，
> 在 `update()` **內部**呼叫 `markDirty()` 沒有幫助 — 渲染後的重設會清除它，
> 而下一幀的靜態檢查看到 `dirty === false` 並將你節流到 2 fps。
> 請透過 [`entity.animate()`](/reference/core-entity/#動畫)
> 驅動動作（它在補間執行時讓場景保持非靜態），或在幀**之間**呼叫 `scene.markDirty()`
> （從事件處理常式、獨立的 `rAF` 或計時器），讓旗標存活到下一個迴圈迭代。

`effectiveMaxFPS` = `maxFPS`，當 OS 請求減少動態效果且 `respectReducedMotion` 開啟時，進一步降低到 30（`REDUCED_MOTION_FPS`）。`0` 表示無上限。

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

## 可插拔後端登錄（靜態）

```ts
Scene.registerWebGLPointRendererCreator(creator: WebGLPointRendererCreator): void
Scene.registerWebGPUParticleSystemManager(managerClass: any): void
```

由 `.` 進入點自動呼叫。相關介面（`IWebGLPointRenderer`、`IWebGPUParticleSystemManager`、`WebGLPointRendererCreator`）已匯出供自訂後端使用。WebGPU 裝置遺失會以指數退避（3 次重試）自動恢復，之後才永久停用 WebGPU。

## 相關

[`Entity`](/reference/core-entity/)（Scene 擁有的樹）·
[`IRenderer` / `CanvasRenderer`](/reference/core-renderer/) ·
[`ComputeParticleEntity`](/reference/core-particles/) ·
[a11yRoot 與 agent 契約](/reference/core-a11y/) ·
[`@vectojs/core` 概覽](/reference/core-api/)
