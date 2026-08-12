+++
title = "@vectojs/core API Reference"
description = "Vecto 背後 zero-DOM 渲染引擎的概覽與進入點地圖 — core 中的 Scene、Entity、renderer、粒子和 a11y，加上 core 重新匯出的獨立 @vectojs/text、@vectojs/layout、@vectojs/math 和 @vectojs/animation 引擎。"
weight = 1
+++

# `@vectojs/core` API Reference

Vecto 背後的 zero-DOM 渲染引擎。`Scene` 擁有一個 `Entity` 節點的樹（**Virtual Math Tree**），驅動一個 `requestAnimationFrame` 迴圈，透過後端無關的 `IRenderer`（預設為 Canvas 2D）繪製，並投射一個透明的 ARIA/自動化陰影層，讓 canvas 保持無障礙且可被 agent 驅動。

> 此頁面及其子頁面是從已發布的 `.d.ts`（公開介面）和 `packages/core/src`
> 來源（行為）產生的。此處的簽章會覆寫敘述性 `docs/usage/*` 指南中的任何內容 —
> 特別是真正的建構函式是 `new Scene(canvasElement, options)`，**而非**
> 某些較舊文章顯示的 `{ canvasId }` 形式。

## 參考頁面

下方每個關注點都有其自己的聚焦頁面 — 簽章、注意事項，以及一個橫向連結到其他頁面的「相關」頁尾：

| 領域                                                  | 涵蓋內容                                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [`Scene`](/reference/core-scene/)                     | 建構函式、`SceneOptions`、公開欄位、`renderMode`/`maxFPS`/閒置節流、生命週期方法、後端登錄。                  |
| [`Entity`](/reference/core-entity/)                   | 抽象 VMT 節點：變換、動畫系統、捕獲/冒泡事件、a11y/批次處理掛鉤。                                             |
| [Layout engine](/reference/core-layout/)              | `LayoutEngine` 的冷/熱分割、串流記憶化、豐富文字、排除形狀。                                                  |
| [Renderers](/reference/core-renderer/)                | `IRenderer`、`CanvasRenderer`、`SVGRenderer`、WebGL point/rect/sprite/MSDF 層、內容投射、`parseColorToRGBA`。 |
| [`ComputeParticleEntity`](/reference/core-particles/) | 高吞吐量粒子層：記憶體布局、CPU 模擬、WebGPU vs CPU。                                                         |
| [Text & Bidi](/reference/core-text/)                  | `MSDFFont`、`MSDFTextEntity`、`TextEntity`/`GridTextEntity`、阿拉伯文塑形 + bidi 解析器。                     |
| [Other entities](/reference/core-entities/)           | `SplineEntity`、`DOMPortalEntity`、`SVGEntity`。                                                              |
| [Math utilities](/reference/core-math/)               | `SpatialHashGrid`、`SpringPhysics`。                                                                          |
| [Animation](/reference/animation/)                    | 獨立的 `@vectojs/animation` 引擎：`TweenDriver`/`SpringDriver`、`MotionConfig`、緩動曲線。                    |
| [Styles](/reference/styles/)                          | 獨立的 `@vectojs/styles` 層：CSS 命名樣式物件、`var()` token 主題、`setTheme` 切換、`css()` 合併。            |
| [a11yRoot 與 agent 契約](/reference/core-a11y/)       | 陰影 DOM 投射、`A11yAttributes`、同步注意事項。                                                               |

## 進入點與模組地圖

布局、文字塑形、數學和動畫引擎都以各自的獨立套件發佈。`@vectojs/core` **依賴並重新匯出**所有這些引擎，因此下方每個匯入仍能從 `@vectojs/core`（以及可搖樹的子路徑）解析。當你想要更小的依賴表面而不引入場景圖執行環境時，請直接從獨立套件匯入。

`@vectojs/core` 提供一個具副作用的主進入點，加上三個可搖樹的子路徑，以及那四個獨立套件：

| 匯入                     | 內容                                                                                                                                                                                       | 副作用                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `@vectojs/core` (`.`)    | 全部：`Scene`、`Entity`、所有 entity、renderer，加上重新匯出的 layout、text、math 和 animation 引擎。                                                                                      | 匯入時，自動註冊**兩個**可插拔後端（WebGL point renderer + WebGPU particle manager）。 |
| `@vectojs/core/layout`   | 重新匯出 `@vectojs/layout`：`LayoutEngine`、`PreparedText`、`createCanvasMeasurer`、`LayoutResultBuffer`、`LayoutWorkerManager`、`computeLineSegments`、layout 類型。                      | 無。                                                                                   |
| `@vectojs/core/renderer` | `IRenderer`、`CanvasRenderer`、`SVGRenderer`、`PointRenderer`、`createWebGLPointRenderer`、`WebGPUParticleSystemManager`、`parseColorToRGBA`、`RGBA`。                                     | 無。                                                                                   |
| `@vectojs/core/text`     | 重新匯出 `@vectojs/text` 加上 core 內建的 `MSDFTextEntity`/`SVGEntity`：`MSDFFont`、`ArabicShaper`、`BidiResolver`、`Typography`、`prepareContentGrid`、`PreparedContentGrid`、MSDF 類型。 | 無。                                                                                   |
| `@vectojs/text`          | 獨立的文字塑形基礎元件：`BidiResolver`、`ArabicShaper`、`Typography`、`MSDFFont`、`prepareContentGrid`、`PreparedContentGrid`。葉套件（僅 `bidi-js`）。                                    | 無。                                                                                   |
| `@vectojs/layout`        | 獨立的布局引擎：`LayoutEngine`、`LayoutWorkerManager`、`createCanvasMeasurer`、測量輔助函式。依賴 `@vectojs/text`。                                                                        | 無。                                                                                   |
| `@vectojs/math`          | 獨立的空間/物理數學：`SpatialHashGrid`、`SpringPhysics`。葉套件。                                                                                                                          | 無。                                                                                   |
| `@vectojs/animation`     | 獨立的緩動 + 驅動器：`Easing`、`TweenDriver`、`SpringDriver`。依賴 `@vectojs/math`。                                                                                                       | 無。                                                                                   |

**注意事項：** 後端自動註冊只存在於 `.` 進入點中
（`Scene.registerWebGLPointRendererCreator(createWebGLPointRenderer)` 和
`Scene.registerWebGPUParticleSystemManager(WebGPUParticleSystemManager)` 於
匯入時執行）。如果你在只匯入子路徑後建構 `Scene`，請自行註冊
後端，否則 `pointBackend: 'webgl'` / WebGPU 粒子會靜默地回退。
請參閱 [`Scene`](/reference/core-scene/) 了解登錄 API。

## 建議的文件站頁面（core）

- **Learn / Core concepts** — Scene、Virtual Math Tree、渲染迴圈、
  `IRenderer`、zero-DOM 模型。
- **Learn / Render modes & performance** — `always` vs `onDemand`、`maxFPS`、
  閒置 2-fps 節流和幀間 `markDirty()` 規則、減少動態效果。
- **Learn / Building a custom Entity** — `isPointInside`/`render`、變換、
  `getBounds` 裁剪、`getBatchCircle`/`getBatchRect` 快速路徑。
- **Learn / Events & hit-testing** — 捕獲/冒泡、`VectoJSEvent`、
  `findEntityAt`、表單控制項 `change`/IME。
- **Learn / Accessibility & automation** — 陰影 DOM 契約、
  `getByRole` 驅動的 agent、`debugA11y`、節流。
- **Learn / Text & typography** — 冷/熱 `LayoutEngine` 分割、串流
  記憶化、MSDF 文字、排除/換行、bidi。
- **Learn / Particles** — `ComputeParticleEntity`、WebGPU vs CPU、8-float
  布局、`resize()` 優先。
- **Reference / API** — 上方的子頁面（Scene、Entity、layout engine、
  renderer、粒子、文字、數學工具、a11y 契約）。
- **Reference / Backend registry** — 可插拔的 WebGL/WebGPU 後端，涵蓋於
  [`Scene`](/reference/core-scene/#可插拔後端登錄靜態) 之下。
