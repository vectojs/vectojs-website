---
title: '07 — 渲染器 — 座標 / 裁剪 / DPR 一致性'
description: '跨 Canvas2D、WebGL、WebGPU、SVG 與 Three 的多後端一致性：IRenderer 契約、座標空間、裁剪語意、DPR/後備儲存上限、視埠剔除與繪製呼叫批次 — 以及使同一場景在不同後端看似不同的每個陷阱。'
order: 27
---

# 07 — 渲染器 — 座標 / 裁剪 / DPR 一致性

> **Boss 07** 守護最後一哩：將 Virtual Math Tree 的幾何轉為像素，無論後端為 `CanvasRenderingContext2D`、WebGL 點圖層、WebGPU 計算通道、SVG 匯出或 Three.js 實例化網格——在任何 DPR、任何縮放與任何視埠下皆呈現一致。

- **你將學到**：`IRenderer` 契約及其為何——而非 `CanvasRenderingContext2D`——為權威；一個繪製呼叫穿越的五個座標空間；裁剪、DPR、剔除與批次如何各自破壞一致性；以及已立案、已修正與仍開放的陷阱，附 `file:line` 可驗證。
- **你不會學到**：文字塑形與布局（Boss 02）、VMT dirty 與生命週期（Boss 06）、WASM 加速（Boss 08）或 Three/XR 橋接的雙世界映射（Boss 09）。本文件為各者的渲染半部。

## 為何多後端一致性困難

VectoJS 承諾跨五個後端「同一場景、同一畫面」：

| 後端               | 模組                                                          | 是否保留     | 像素去向                               |
| ------------------ | ------------------------------------------------------------- | ------------ | -------------------------------------- |
| Canvas2D           | `packages/core/src/renderer/CanvasRenderer.ts:1`              | 立即         | 單一 `<canvas>` 2D 上下文，經 DPR 縮放 |
| WebGL 點/精靈/字形 | `packages/core/src/renderer/WebGLPointRenderer.ts:1`          | 已批次       | 堆疊的全視窗畫布，NDC 四邊形           |
| WebGPU 粒子        | `packages/core/src/renderer/WebGPUParticleSystemManager.ts:1` | 計算         | 同一堆疊畫布，計算→渲染                |
| SVG 匯出           | `packages/core/src/renderer/SVGRenderer.ts:1`                 | 已保留字串   | `toXMLString()` 無 DOM 序列化          |
| Three.js           | `packages/three/src/ThreeRenderer.ts:216`                     | 已保留場景圖 | `THREE.WebGLRenderer` 正交相機         |

每個後端皆在相同 `save`/`restore`/`translate` 堆疊下，以相同順序接收**相同的 `Entity.render(r: IRenderer)` 呼叫**。一致性並非在遍歷錯誤處失效，而在後端對同一呼叫的*詮釋*不同——在一個為路徑操作的裁剪在另一個為剪刀矩形、在一個以後備儲存按 `window.devicePixelRatio` 定尺而在另一個為 `maxDPR` 箝制、在一個為 `lineWidth` 屬性而在另一個為帶狀幾何的描邊。每個分歧直至 HiDPI 顯示器、縮放、裁剪邊緣或 40k 單元網格命中前皆不可見。

吸收這些分歧的契約為 `IRenderer`（`packages/core/src/renderer/IRenderer.ts:1`）。Entity 絕不可匯入具體渲染器。介面依設計為方法導向：樣式隨繪製一起行進（`stroke(color, lineWidth)`、`fillText(text, x, y, font, color)`），使批次後端可合併執行、GPU 後端具明確邊界。可變樣式屬性（`ctx.fillStyle = …`）刻意缺席——開發陷阱對其發出警告（`IRenderer.ts:159`、`IRenderer.ts:301`），因為在未轉譯的 JS 中它們作為擴充屬性附加並以上下文預設值靜默繪製。

## IRenderer 契約（先讀此）

```text
IRenderer.ts:41  — kind, pixelRatio, setDrawCounters / getDrawCounters
IRenderer.ts:134 — clip(x,y,w,h, radii?)
IRenderer.ts:149 — path: beginPath / moveTo / lineTo / bezierCurveTo / closePath / arc / roundRect
IRenderer.ts:193 — drawImage / drawImageRect? (optional)
IRenderer.ts:287 — fill / stroke / fillText / fillCircle / flush
IRenderer.ts:350 — createLinearGradient
IRenderer.ts:404 — present? / dispose? / isContextLost? / onContextRestored?
```

關鍵設計選擇：

- **`kind`**（`IRenderer.ts:76`）為穩定的字串判別器（`'canvas2d' | 'svg' | 'three'`）— `constructor.name` 會被壓縮。
- **`pixelRatio`**（`IRenderer.ts:88`）為可選且為*即時已套用*值，而非 `window.devicePixelRatio` 的快照。光柵化 blit 來源的呼叫者必須讀此而非視窗。
- **`drawImageRect?`**（`IRenderer.ts:232`）為可選。`SVGRenderer` 刻意省略：SVG blit 將其來源嵌入為 data URL，因此逐單元子矩形會將整個圖集內聯數千次。呼叫者必須做特性偵測並保留 `fillText` 備援。
- **`fillCircle` + `flush`**（`IRenderer.ts:328`、`:364`）為保序批次。連續同色、同透明度的圓合併為一條路徑與一次 `fill()` 於 `flush()` 上。`Scene` 在每個兄弟邊界與影格結尾刷新。
- **`present?`**（`IRenderer.ts:404`）僅供保留後端。`CanvasRenderer` 立即繪製；`ThreeRenderer` 將其唯一真實 GL 渲染延遲至 `present()`（`ThreeRenderer.ts:957`），使一影格成本為 `O(N)` 新增 + `1` 次繪製，而非 `O(N²)` 重渲染。

## 座標空間（五個，而非一個）

以 `fillCircle(cx, cy, …)` 寫入的點穿越：

1. **局部** — 實體自身的 `(x, y)` 盒。`Entity.getBounds()` 與 `worldToLocal` 位於此。
2. **世界** — 局部經每個祖先的 `translate` / `scale` / `rotate` 與場景的 DPR 縮放變換。`HitTester` 與剔除在此測試。
3. **視埠 / CSS px** — 世界被裁剪至場景視埠與任何 `clipChildren` 祖先。`Scene.ts:4335` `projectionBoxVisible`。
4. **後備儲存 / 裝置 px** — 視埠 × `appliedDPR`（`CanvasRenderer.ts:244` `pixelRatio`）。GPU 實際取樣處。
5. **裁剪 / NDC** — 僅 WebGL/WebGPU：`(pos / resolution)*2-1`，y 翻轉（`WebGLPointRenderer.ts:320`），Three 的 y 向下正交（`ThreeRenderer.ts:250`）。

陷阱在於將一個空間誤認為另一個。`ComputeParticleEntity` 的 GPU 路徑在**視窗**空間消費 `scene.mouseX/Y`，並在忽略實體變換的堆疊全視窗畫布上繪製；其 CPU 備援在**局部**空間消費 `entity.worldToLocal(mouse)`，並在 `renderer.translate(node.x, node.y)` 內繪製——一個緩衝，兩份契約（`vectojs-docs/forge/findings/renderer-and-gpu.md:299`）。`WebGPUParticleSystemManager` 的記錄以 `width / height` 傳遞 `screen_size`（`WebGPUParticleSystemManager.ts:310`），而 CPU 路徑在已套用實體變換的情況下繪製。

`ThreeRenderer` 在 NDC 邊界處於同一陷阱：其正交相機為 y 向下（`ThreeRenderer.ts:250`），因此每個 `FrontSide` 網格皆為背面並被剔除——修正為對每個填充圖元使用 `side: DoubleSide`，而非僅文字（`ThreeRenderer.ts:596`，forge 2026-08-13）。

## 裁剪

`IRenderer.clip(x, y, w, h, radii?)`（`IRenderer.ts:134`）與目前裁剪相交。`radii` 為*漸進增強*：基於剪刀測試的 GPU 路徑可能忽略它。

- **Canvas2D** — `ctx.roundRect` + `ctx.clip()` 於 `save`/`restore` 內（`CanvasRenderer.ts:373`）。具作用域、正確。
- **SVG** — 合成：全新 `<clipPath id="clip-N"><rect|path …/>` 加上 `<g clip-path="url(#clip-N)">`，透過在 `restore()` 上彈出 `clipDepth` 並在 `toXMLString()` 中關閉標籤來封閉（`SVGRenderer.ts:510`、`:543`）。成本為 DOM 大小而非填充率。
- **Three** — 以後備儲存像素為單位的剪刀矩形，經目前矩陣變換並翻轉至左下原點，與任何外層剪刀相交（`ThreeRenderer.ts:449`）。剪刀僅為矩形；圓角裁剪退化為其 AABB。
- **`clipChildren`** — `Scene`/實體層級旗標，*非*渲染器的 `clip()` 呼叫，其虛擬化命中、a11y 與內容投射。`Scene.ts:254`（命中）與 `Scene.ts:4305`（剔除）皆與每個 `clipChildren` 祖先的世界盒相交；`isHitEligible` 以精確的旋轉感知局部矩形重檢查。

已知裁剪缺口：`IRenderer.fill` 無法表達 `fillRule: 'evenodd'`（`forge/findings/renderer-and-gpu.md:38`）。`Canvas2D` 與 `SVG` 可做 even-odd（`ctx.fill('evenodd')`、`<path fill-rule="evenodd">`），但介面僅暴露 `fill(colorOrGradient)`。具多於一個封閉組件的複合路徑因此在每個後端皆以 `nonzero` 填充。建議形態為在 `fill` 上提供向後相容的可選 `fillRule` 參數，在消費者移除其診斷守衛前一致實作。

## DPR 縮放與後備儲存上限

```text
CanvasRenderer.ts:219  effectiveDPR()  = min(real DPR, maxDPR)
CanvasRenderer.ts:244  pixelRatio      = appliedDPR (recorded, not live)
CanvasRenderer.ts:119  constructor / resize apply scale(dpr, dpr)
WebGLPointRenderer.ts:972  same clamp for the point layer
ThreeRenderer.ts:307   effectiveDPR() / pixelRatio via getPixelRatio()
Scene.ts:286           SceneOptions.maxDPR — syncs to every renderer on resize
```

三個不變量：

1. **箝制，勿信任。** `maxDPR`（`SceneOptions.maxDPR`，`CanvasRenderer.ts:66`）限制後備儲存增長。`maxDPR: 2` 為合理的預設，*非*保證——對數千個細線段的逐影格描邊通道在相同內容上測得 DPR1 時 `16.7 ms` vs DPR2 時 `140 ms`（`forge 2026-07-18` 後備儲存上限）。昂貴通道即使在引擎預設為 2 時仍可能需要 `maxDPR: 1`。

2. **已套用，而非即時。** `pixelRatio` 回報上下文*目前縮放所用*的比例（`appliedDPR`），而非每次存取時重讀的 `effectiveDPR()`（`CanvasRenderer.ts:234`）。即時 getter 會在縮放/DPR 變更與下次 `resize` 間的視窗期間回報*未來* DPR，而自其光柵化的呼叫者會產生仍為舊上下文重取樣的紋理。以 `pixelRatio` 為鍵的快取（例如 `GlyphRasterAtlas`、`Markdown` 程式碼圖集池）因此僅在實際重新配置的 `resize` 後重設鍵。

3. **重設大小使樣式快取失效。** 設定 `canvas.width/height` 依規格將整個 2D 上下文重置為 `10px sans-serif / #000`。`CanvasRenderer.resize` 丟棄 `_cachedFont/_cachedFill/_cachedStroke` 與批次狀態（`CanvasRenderer.ts:258`）並記錄新的 `appliedDPR`。`contextrestored` 同樣處理（`CanvasRenderer.ts:164`）；遺漏丟棄為在預設字型下的陳舊快取重繪。對應的 `WatchDevicePixelRatio` 媒體查詢迴圈在每次變更時重武裝（`ThreeRenderer.ts:338`，`Scene` 等同物），使顯示器間拖曳或縮放觸發真實 `resize`。

預光柵化點陣圖必須立於此之上：

- `GlyphRasterAtlas` 與 `TextRasterCache` 在建構時 `dpr` 下光柵化（`GlyphRasterAtlas.ts:174`，`TextRasterCache.ts:88`），但其查找鍵歷史上省略它（`forge 2026-08-25`）：跨 DPR 變更重用同一圖集在相同鍵下提供陳舊密度點陣圖並以重取樣方式 blit（模糊）。文件契約稱「圖集以 DPR 為鍵並在變更時替換」——除非鍵折入 DPR，否則安全性依賴呼叫者紀律。
- `SplineEntity.bake` 曾讀取原始 `window.devicePixelRatio`（`SplineEntity.ts:433` 修正前），而其 blit 進入 `maxDPR` 箝制的上下文——每影格下取樣的過解析度點陣圖。修正為在渲染時讀取 `renderer.pixelRatio` 並在變更時重烘焙（`SplineEntity.ts:504`）。

## 視埠剔除

`Scene` 嚴格對視埠剔除：其*填充盒*完全位於視埠外的實體被跳過（`Scene.ts:7254` 剔除追蹤）。兩個細化：

- **描邊膨脹。** `Circle.getBounds()` / `Rect.getBounds()` 現當被描邊時按 `strokeWidth/2` 膨脹（`Circle.ts:67`，`Rect.ts:54`，於 `@vectojs/core@2.18.3` CTX-0261 修正）。先前，位於視埠邊緣的粗描邊會失去多達一半寬度。`-0` 後續（`-inflation` 對 `0` 取負）需要僅正數的取負（`forge 2026-08-08` `-0` 條目）。
- **裁剪感知剔除**（`Scene.ts:4335`）。`projectionBoxVisible` 將視埠與每個 `clipChildren` 祖先的 AABB 相交；視埠外但被裁剪納入的內容被虛擬化（Boss 03）。無界的全視埠覆蓋刻意永不被裁剪（`Scene.ts:4238`）。

## 批次與繪製呼叫經濟學

| 路徑                          | 機制                                                         | 上限 / 成本                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `fillCircle` (Canvas2D)       | 同色、同透明度執行 → 一條路徑、一次 `fill()` 於 `flush()` 上 | `MAX_BATCH = 64`（`CanvasRenderer.ts:88`）— 超出則超線性                                                                                |
| `fillCircle` (SVG)            | 每次刷新一個 `<path d="… A … A …">`                          | 無 GPU 成本，DOM 大小                                                                                                                   |
| `fillCircle` (WebGL/Three)    | 實例化四邊形 / `CircleGeometry`                              | 近乎常數；僅刷新重要                                                                                                                    |
| `drawImage` / `drawImageRect` | 無 — 立即 `drawImage` / `<image>`                            | 圖集（`GlyphRasterAtlas`）保持單一來源紋理；`TextRasterCache` 每畫布來源在 40k 單元時測得 **0.87×**（`fillText` 基準）vs 圖集的 **~2×** |

`CanvasRenderer.flush`（`CanvasRenderer.ts:414`）自其批次前值（而非 `1`）還原 `globalAlpha`，並將 `_cachedFill` 更新為批次色彩——否則下一個具陳舊快取的 `fill('red')` 跳過賦值並以批次色彩繪製。待處理批次在 `drawImage`、`beginPath`、`save`/`restore`、`clip`、`fill`、`stroke` 與 `fillText` 前提交。

`ThreeRenderer.flush`（`ThreeRenderer.ts:957`）*僅*標記 `frameDirty`。真實 GL 渲染為 `present()`（`ThreeRenderer.ts:968`），由 `Scene` 在影格結尾呼叫一次；無此，`O(N)` 次刷新將付出 `O(N²)` 渲染成本。永不呼叫 `present()` 的舊版 `Scene` 建構由微任務備援涵蓋。

WebGL 特定：`setTexture` 現當來源變更時在 `texImage2D` 前提交精靈批次（`WebGLPointRenderer.ts:974`，於 `@vectojs/core@2.18.3` 修正），鏡像 `setMSDFTexture`。`ctx.filter = 'blur()'` 成本延遲至*下一次*像素讀取（`forge 2026-07-18` `ctx.filter` 條目）——可能時在半解析度下模糊。

## 文字光柵路徑

`fillText` 為 CPU 塑形 + 色彩解析 + 在高達 5 000 次呼叫/影格下的光柵化；GPU 閒置（`(program)` 主導）。兩個可選快取將塑形轉為 blit：

- `GlyphRasterAtlas`（`GlyphRasterAtlas.ts:1`）— 單一畫布、架式打包槽位、`drawImageRect` 子矩形。適用於有界等寬集合（程式碼網格、終端機）。需要 `drawImageRect`；`SVGRenderer` 非目標。
- `TextRasterCache`（`TextRasterCache.ts:1`）— 每 `(font, color, text)` 執行一個小畫布，`drawImage` blit。適用於有界短語集合（彈幕 395 個碼點 → 一個 `≤1024²` MSDF 圖集）。兩者皆限制記憶體（圖集架式 + 重置計數器，快取 `maxEntries` 具 10% 插入順序逐出）並在無頭時退回 `fillText`。5 000 彈幕牆並非塑形而是繪製次數 + 過度繪製：將 `fillText→drawImage` 交換毫無改變；經 `MSDFTextEntity` / `pointRenderer.addGlyph` 將字形批次至約 1 次 WebGL 繪製，自 `~28 fps` → `~130 fps`（`forge 2026-07-20` 修正，`bakudan` v0.5）。

Three 的文字路徑在 `dpr` 下光柵化（`ThreeRenderer.ts:747`）並以 `dpr|font|color|text|gradient-definition` 加上對漸層的捨入 `x,y` 相位（`ThreeRenderer.ts:806`）為紋理快取值。字型大小由 `parseFontSize`（`ThreeRenderer.ts:274`）解析，*非* `parseInt`——樣式簡寫將字重置於前（`'700 16px Inter'`），因此天真的 `parseInt` 讀為 `700`。基線：字母基線落在 `y`；Three 的 `PlaneGeometry` 中心按 `-fontSize + h/2` 偏移（`ThreeRenderer.ts:831`）。

## Scene 連接（渲染器旋鈕設定處）

```text
Scene.ts:226  SceneOptions.pointBackend: 'canvas' | 'webgl'   (glyphs/sprites)
Scene.ts:233  SceneOptions.particleBackend: 'auto'|'webgpu'|'cpu' (compute particles)
Scene.ts:286  SceneOptions.maxDPR               → syncs to pr.maxDPR on every resize
Scene.ts:398  SceneOptions.renderMode: 'always' | 'onDemand'
Scene.ts:1142 Scene.renderMode + DirtyTracker + RenderScheduler (maxFPS / autoThrottle)
Scene.ts:2284 full-window viewport adoption (once) + disableWindowResize
Scene.ts:2781 clientToScene viewport mapping
```

- **`pointBackend` vs `particleBackend` 為不同功能**（`forge 2026-08-26`）。`pointBackend: 'webgl'` 批次處理字形/精靈四邊形；`particleBackend: 'webgpu'` 驅動 `WebGPUParticleSystemManager` 供 `ComputeParticleEntity`。無 WebGPU 字形/MSDF 路徑；翻轉 `particleBackend` 對彈幕無作用。
- **`WebGPUParticleSystemManager` 經靜態選擇加入**（`forge 2026-08-02`）：`Scene.registerWebGPUParticleSystemManager(...)`。在未註冊的預設 `'auto'` 下無拋出亦無 `console.warn`——CPU 備援執行而 `initWebGPUContext` 仍配置未使用的堆疊畫布。
- **`renderMode: 'always'`**（預設）驅動連續 rAF 迴圈；`autoThrottle` 在靜態時降至 `idleFPS`。**`'onDemand'`** 僅在 `markDirty()` 或活躍動畫/物理 tick 後繪製。`render()` 本身無條件渲染——`renderMode` 僅影響迴圈排程器（`Scene.ts:3405`）。

## 已知陷阱（附 file:line）

| 陷阱                                                                                          | 位置                                                                                        | 狀態                            |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------- |
| Even-odd 填充不可表達（`IRenderer.fill` 無 `fillRule`）                                       | `IRenderer.ts:287`，forge 2026-07-18                                                        | 開放                            |
| 無陰影/光暈原語（`shadowBlur` 缺席；`ctx.filter` 模糊成本延遲）                               | `IRenderer.ts:159` 提示，forge 2026-07-18 / 2026-08-25                                      | 開放                            |
| 無供桌布取樣的背景模糊/材質                                                                   | forge 2026-08-25                                                                            | 開放（延伸）                    |
| 字形/文字光柵鍵省略 DPR — DPR 變更後陳舊密度點陣圖                                            | `GlyphRasterAtlas.ts:174`，`TextRasterCache.ts:88`，forge 2026-08-25                        | 開放（契約=呼叫者必須替換圖集） |
| `WebGPUParticleSystemManager` 需 `Scene.register…` 靜態；`'auto'` 上靜默 CPU 備援             | `Scene.ts:256` 註冊門控，forge 2026-08-02                                                   | 開放                            |
| CPU vs GPU 粒子座標空間不一致（視窗 vs 局部）                                                 | `WebGPUParticleSystemManager.ts:310`，`ComputeParticleEntity.ts`，forge 2026-08-02 相關     | 應用側已補償                    |
| 後備儲存按視窗 DPR 而非箝制的 `appliedDPR` 定尺                                               | `CanvasRenderer.ts:244`，`ThreeRenderer.ts:318`，`SplineEntity.ts:504`                      | 已修正                          |
| `resize` 跨上下文重置使字型/填充快取陳舊                                                      | `CanvasRenderer.ts:258`，forge 2026-08-13 `CanvasRenderer.resize`                           | 已修正 #463                     |
| `flush` 在未更新快取的情況下變更 `fillStyle`/`globalAlpha`                                    | `CanvasRenderer.ts:414`，forge 2026-08-13                                                   | 已修正 #469                     |
| `parseColorToRGBA` 在無效輸入上回傳先前解析                                                   | `renderer/colorParse.ts:60`，forge 2026-08-13                                               | 已修正 #492                     |
| `SplineEntity.bake` 使用原始 `window.devicePixelRatio`                                        | `SplineEntity.ts:433` 修正前，forge 2026-08-13                                              | 已修正 #492                     |
| `WebGLPointRenderer.setTexture` 遺漏批次刷新                                                  | `WebGLPointRenderer.ts:974`，forge 2026-08-13                                               | 已修正 #520                     |
| `ThreeRenderer.fillText` 將字重解析為尺寸；基線偏差 `fontSize/2`                              | `ThreeRenderer.ts:274`，`:831`，forge 2026-08-13 / #486                                     | 已修正 #511                     |
| 鏡像正交剔除 `FrontSide` 填充/圓/漸層/圖片                                                    | `ThreeRenderer.ts:250`，forge 2026-08-13                                                    | 已修正 #519                     |
| `drawImage` 垂直翻轉（`flipY = true`）於 y 向下相機                                           | `ThreeRenderer.ts:478`，forge 2026-08-23 #603                                               | 已修正 #613                     |
| 細線描邊（`LineBasicMaterial.linewidth` 被忽略）；DPR 被忽略；GL 上下文洩漏；漸層 >8 段重取樣 | `ThreeRenderer.ts:110` 帶狀，`:307`，`ThreeRenderer.ts:1044` dispose，forge 2026-08-23 #604 | 已修正 #623                     |
| `getBounds()` 排除描邊 → 剔除裁掉 `strokeWidth/2`                                             | `Circle.ts:67`，`Rect.ts:54`，forge 2026-08-08                                              | 已修正 2.18.3                   |
| `getBounds()` `-0` 假象被測試奉為圭臬                                                         | forge 2026-08-08 `-0` 條目                                                                  | 已修正 2.18.3                   |

## 發布渲染器變更前的檢查清單

1. **讀 `pixelRatio`，而非 `window.devicePixelRatio`。** 若你光柵化將被 blit 的紋理，以 `renderer.pixelRatio` 為快取鍵並在 `resize` 後重光柵化。
2. **DoubleSide 並取消翻轉。** 在 y 向下正交下，每個 `Mesh`/`PlaneGeometry` 皆需 `side: DoubleSide` 與 `texture.flipY = false`（`ThreeRenderer.ts:596`、`:478`）。
3. **具刷新感知的快取。** 任何變更 `fillStyle` 或 `globalAlpha` 的路徑必須更新對應快取；任何重置上下文者必須丟棄它（`CanvasRenderer.ts:258`）。
4. **尊重批次。** 若想讓同樣式 `fillCircle` 合併，勿在它們間交錯非批次繪製；於剪刀/紋理/透明度變更前 `flush()`。
5. **裁剪有三處。** 繪製的渲染器 `clip()`、命中/A11y/內容的 `clipChildren`（`Scene.ts:254`、`:4335`）與虛擬化的視埠帶。未稽核其餘兩者而變更其一即為缺陷。
6. **在真實 DPR 下分析。** `maxDPR: 2` 並非對描邊密集通道的效能保證——在真實硬體上以原生 DPR 度量，使用 `benchmarks/run-browsers.sh`（兩引擎、有頭）。

## 關聯

- **Boss 03（投射與虛擬化）**擁有 `clipChildren` 與此 Boss 剔除所鏡像的 `projectionBoxVisible` / 內容層級策略。
- **Boss 06（VMT 執行期）**擁有 `Scene.render`、`RenderScheduler` / `DirtyTracker` 策略與每個渲染器消費的 `worldMatrix`。
- **Boss 02（文字/布局）**擁有此 Boss 所光柵化的度量。**Boss 09（Three/XR）**重用本文件中每個陷阱——帶狀描邊、剪刀裁剪、DPR 與 DoubleSide 為其起始套件。**Boss 08（WASM）**重用相同的 `Scene` 視埠與 DPR 值；跨記憶體增長的陳舊型別化陣列視圖為下個 Boss 的陳舊光柵快取版本。

---

Series: 00 Overview → 01 Selection → 02 Text+Layout → 03 Projection+Virtualization → 04 Streaming Markdown → 05 TeX → 06 VMT Runtime → **07 Renderer** → 08 WASM G1/G2/G3 → 09 Three/XR → 10 Video Export → 11 Graph Layout → 12 DevTools → 99 Synthesis.
