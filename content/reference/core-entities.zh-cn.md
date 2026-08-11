+++
title = "其他实体"
description = "Rect/Circle/Group 形状图元，外加 SplineEntity（vectomancy 曲线渲染）、DOMPortalEntity（将真实 DOM 元素投影到场景中）和 SVGEntity（栅格化 SVG 位块传输），均来自 @vectojs/core 主入口。"
weight = 8

[extra]
order = 8
+++

# 其他实体（来自 `.`）

属于 [`@vectojs/core`](/reference/core-api/)。

## Rect、Circle、Group（图元）

_在 `@vectojs/core` 1.9.0 中添加。_ 三个可直接实例化的实体，使得一个普通的盒子、点或变换容器不再需要一个定制的 [`Entity`](/reference/core-entity/) 子类。

```ts
import { Rect, Circle, Group } from '@vectojs/core';

const box = new Rect({ width: 120, height: 64, fill: '#38bdf8', radius: 8 });
const dot = new Circle({ radius: 24, fill: '#f97316' });
const toolbar = new Group(saveBtn, undoBtn, redoBtn); // transform-only container
toolbar.set({ x: 20, y: 20 });
scene.add(box, dot, toolbar); // variadic add()
```

**`Rect`** —— 从局部 `(0,0)` 到 `(width, height)` 的轴对齐矩形。

| `RectOptions` | 默认        | 效果                                                 |
| ------------- | ----------- | ---------------------------------------------------- |
| `width`       | `0`         | 局部宽度；与实体命中/a11y 盒匹配。                   |
| `height`      | `0`         | 局部高度。                                           |
| `fill`        | `'#38bdf8'` | CSS 填充，或 `null` 表示无（显式 `null` 会被保留）。 |
| `stroke`      | `null`      | CSS 描边，或 `null` 表示无。                         |
| `strokeWidth` | `1`         | 描边宽度（局部单位）。                               |
| `radius`      | `0`         | 统一的圆角半径；`0` = 尖角。                         |

一个纯填充、直角、无描边的 `Rect` 会选入 WebGL 实例化矩形快速路径（`getBatchRect`，仅 `pointBackend: 'webgl'`）；任何描边或圆角都通过精确的 Canvas 路径渲染。

**`Circle`** —— 以其局部原点 `(0,0)` 为中心的圆盘。它的 a11y 影子盒是偏移 `-radius` 的外接正方形，以便覆盖绘制的圆盘。

| `CircleOptions` | 默认        | 效果                                  |
| --------------- | ----------- | ------------------------------------- |
| `radius`        | `0`         | 半径（局部单位）。setter 重新同步盒。 |
| `fill`          | `'#38bdf8'` | CSS 填充，或 `null` 表示无。          |
| `stroke`        | `null`      | CSS 描边，或 `null` 表示无。          |
| `strokeWidth`   | `1`         | 描边宽度（局部单位）。                |

一个纯填充、无描边的 `Circle` 会选入圆点批处理快速路径（`getBatchCircle`）；描边的圆通过精确的 Canvas 路径渲染。

**`Group`** —— 一个仅变换的容器：不绘制任何内容且对命中测试不可见（`isPointInside` 返回 `false`），仅为将一个变换（`x`/`y`/`scale`/`rotation`/`opacity`）组合到其子元素上而存在。场景的命中测试首先递归进入子元素，因此它们保持独立可交互。内联传递子元素：`new Group(a, b, c)`。

另见 [`Entity.set()`](/reference/core-entity/) 和可变参数的 [`add()`](/reference/core-entity/) —— 这些图元被设计为与之配合使用的符合人体工程学的助手。

## SplineEntity + loadSpline

```ts
loadSpline(url: string): Promise<SplineDocument>     // fetch + parse a vectomancy Spline JSON (browser)
new SplineEntity(doc: SplineDocument, opts?: SplineOptions)
polySegmentToBezier(seg: SplineSegment): BezierControlPoints
```

渲染原生 vectomancy 分段三次 `Spline`/`Polyline` 文档。边界来自 `bounding_box`（或从段端点计算），因此它参与视口剔除。

| `SplineOptions` | 默认        | 效果                                                                                  |
| --------------- | ----------- | ------------------------------------------------------------------------------------- |
| `lineWidth`     | `2`         | 描边宽度（局部单位）。                                                                |
| `cache`         | `true`      | 烘焙到 `OffscreenCanvas` 一次并每帧位块传输（没有它则每帧进行贝塞尔描边）。           |
| `defaultColor`  | `'#e2e8f0'` | 当方程的 `color_rgb` 为 `null` 时使用。                                               |
| `hitTest`       | `'curve'`   | `'curve'` = 精确（在曲线的 `lineWidth/2 + hitTolerance` 范围内）；`'aabb'` = 外接盒。 |
| `hitTolerance`  | `0`         | `'curve'` 模式下额外的拾取填充。                                                      |

公开：`doc`、`lineWidth`、`defaultColor`、`hitTolerance`、`showBounds`（默认 `false`，绘制调试轮廓）。`SplineColor` 是 `[r,g,b]`（0–1）、一个线性渐变描述符，或 `null`。

## DOMPortalEntity

```ts
new DOMPortalEntity(domElement: HTMLElement, width?, height?, id?)
```

在门户层中投影一个**真实的** DOM 元素，其定位/变换跟踪实体（`matrix(...)` + 继承的不透明度 + 来自绘制顺序的 z-index）。它是一个叶子节点 —— `add()` 会警告，不支持子实体。将原生指针/滚轮/焦点事件转发为 `VectoJSEvent`。当 `width`/`height` 为 0 时使用 `ResizeObserver` 缓存固有尺寸（`cachedWidth`/`cachedHeight`）。`destroy()` 分离监听器、观察者，并移除元素。

## SVGEntity（来自 `@vectojs/core/text`）

```ts
new SVGEntity(svgSource: string, id?)
setSVGSource(svgSource: string): void
```

将一个 SVG 字符串栅格化为 `ImageBitmap`/图像并位块传输，在目标缩放（LOD）下重新栅格化，以便在缩放时保持清晰。`scene.toSVG()` 将百分号编码的源嵌入为一个隔离的嵌套 SVG 图像，而不是一个惰性的 URL 占位符。在局部空间进行 AABB 命中测试。

## 相关

[`Entity`](/reference/core-entity/)（这些各自扩展的基类）·
[`@vectojs/core` 概述](/reference/core-api/)
