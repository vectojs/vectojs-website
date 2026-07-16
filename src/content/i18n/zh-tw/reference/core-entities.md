---
title: '其他實體'
description: 'Rect/Circle/Group 形狀原始物件，以及 @vectojs/core 主要進入點提供的 SplineEntity（vectomancy 曲線渲染）、DOMPortalEntity（將真實 DOM 元素投射到場景中）和 SVGEntity（光柵化 SVG 貼圖）。'
order: 8
---

# 其他實體（來自 `.`）

屬於 [`@vectojs/core`](/reference/core-api/)。

## Rect, Circle, Group（原始物件）

_於 `@vectojs/core` 1.9.0 加入。_ 三個立即可實例化的實體，讓純
矩形、圓點或變換容器不再需要自行撰寫
[`Entity`](/reference/core-entity/) 子類別。

```ts
import { Rect, Circle, Group } from '@vectojs/core';

const box = new Rect({ width: 120, height: 64, fill: '#38bdf8', radius: 8 });
const dot = new Circle({ radius: 24, fill: '#f97316' });
const toolbar = new Group(saveBtn, undoBtn, redoBtn); // transform-only container
toolbar.set({ x: 20, y: 20 });
scene.add(box, dot, toolbar); // variadic add()
```

**`Rect`** — 從本地 `(0,0)` 到 `(width, height)` 的軸對齊矩形。

| `RectOptions` | 預設值      | 效果                                                 |
| ------------- | ----------- | ---------------------------------------------------- |
| `width`       | `0`         | 本地寬度；與實體的點擊/a11y 方塊一致。               |
| `height`      | `0`         | 本地高度。                                           |
| `fill`        | `'#38bdf8'` | CSS 填色，或 `null` 表示無（明確 `null` 會被保留）。 |
| `stroke`      | `null`      | CSS 描邊，或 `null` 表示無。                         |
| `strokeWidth` | `1`         | 描邊寬度（本地單位）。                               |
| `radius`      | `0`         | 統一圓角半徑；`0` = 直角。                           |

純填色、直角、無描邊的 `Rect` 會採用 WebGL
實例化矩形快速路徑（`getBatchRect`，僅限 `pointBackend: 'webgl'`）；任何
描邊或圓角都會透過精確 Canvas 路徑渲染。

**`Circle`** — 以本地原點 `(0,0)` 為中心的圓盤。其 a11y 陰影方塊
是偏移 `-radius` 的包圍正方形，使其涵蓋繪製的圓盤。

| `CircleOptions` | 預設值      | 效果                                     |
| --------------- | ----------- | ---------------------------------------- |
| `radius`        | `0`         | 半徑（本地單位）。設定器會重新同步方塊。 |
| `fill`          | `'#38bdf8'` | CSS 填色，或 `null` 表示無。             |
| `stroke`        | `null`      | CSS 描邊，或 `null` 表示無。             |
| `strokeWidth`   | `1`         | 描邊寬度（本地單位）。                   |

純填色、無描邊的 `Circle` 會採用圓形點批次快速路徑
（`getBatchCircle`）；有描邊的圓形則透過精確 Canvas 路徑渲染。

**`Group`** — 純變換容器：不繪製任何內容且對點擊測試
不可見（`isPointInside` 回傳 `false`），僅用於將一個
變換（`x`/`y`/`scale`/`rotation`/`opacity`）套用到其子實體上。場景的
點擊測試會先遞迴進入子實體，因此它們仍可獨立互動。
直接傳入子實體：`new Group(a, b, c)`。

另請參閱 [`Entity.set()`](/reference/core-entity/) 和可變參數
[`add()`](/reference/core-entity/) — 這些原始物件設計用來搭配使用的
人體工學輔助工具。

## SplineEntity + loadSpline

```ts
loadSpline(url: string): Promise<SplineDocument>     // fetch + parse a vectomancy Spline JSON (browser)
new SplineEntity(doc: SplineDocument, opts?: SplineOptions)
polySegmentToBezier(seg: SplineSegment): BezierControlPoints
```

渲染原生 vectomancy 分段三次 `Spline`/`Polyline` 文件。邊界
來自 `bounding_box`（或從線段端點計算），因此可參與
視口裁剪。

| `SplineOptions` | 預設值      | 效果                                                                                  |
| --------------- | ----------- | ------------------------------------------------------------------------------------- |
| `lineWidth`     | `2`         | 線條寬度（本地單位）。                                                                |
| `cache`         | `true`      | 一次烘焙到 `OffscreenCanvas` 然後每幀貼圖（不啟用則每幀進行貝塞爾描邊）。             |
| `defaultColor`  | `'#e2e8f0'` | 當方程式的 `color_rgb` 為 `null` 時使用。                                             |
| `hitTest`       | `'curve'`   | `'curve'` = 精確（距離曲線 `lineWidth/2 + hitTolerance` 範圍內）；`'aabb'` = 包圍盒。 |
| `hitTolerance`  | `0`         | `'curve'` 模式下的額外選取邊距。                                                      |

公開屬性：`doc`、`lineWidth`、`defaultColor`、`hitTolerance`、`showBounds`
（預設 `false`，繪製除錯輪廓）。`SplineColor` 為 `[r,g,b]`（0–1）、
線性漸變描述器或 `null`。

## DOMPortalEntity

```ts
new DOMPortalEntity(domElement: HTMLElement, width?, height?, id?)
```

將**真實** DOM 元素投射到場景中，其位置/變換會追蹤實體
（`matrix(...)` + 繼承的不透明度 + 來自繪製順序的 z-index）位於 portal 圖層。葉節點 —
`add()` 會發出警告，且不支援子實體。將原生的指標/滾輪/
焦點事件轉發為 `VectoJSEvent`。使用 `ResizeObserver` 在 `width`/`height` 為 0 時
快取內建尺寸（`cachedWidth`/`cachedHeight`）。`destroy()` 會分離
監聽器、observer 並移除元素。

## SVGEntity（來自 `@vectojs/core/text`）

```ts
new SVGEntity(svgSource: string, id?)
setSVGSource(svgSource: string): void
```

將 SVG 字串光柵化為 `ImageBitmap`/image 並貼圖，以目標
解析度（LOD）重新光柵化，使其在縮放時保持清晰。`scene.toSVG()` 將
百分比編碼的來源嵌入為獨立的巢狀 SVG 圖片，而非無效的 URL
佔位符。本地空間中的 AABB 點擊測試。

## 相關

[`Entity`](/reference/core-entity/)（這些實體所繼承的基礎類別）·
[`@vectojs/core` 概覽](/reference/core-api/)
