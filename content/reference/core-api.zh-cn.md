+++
title = "@vectojs/core API 参考"
description = "Vecto 背后的 zero-DOM 渲染引擎的概述和入口点地图 —— core 中的 Scene、Entity、渲染器、粒子和 a11y，外加 core 重新导出的独立 @vectojs/text、@vectojs/layout、@vectojs/math 和 @vectojs/animation 引擎。"
weight = 1
+++

# `@vectojs/core` API 参考

Vecto 背后的 zero-DOM 渲染引擎。一个 `Scene` 拥有一棵 `Entity` 节点树（**Virtual Math Tree**），驱动一个 `requestAnimationFrame` 循环，通过后端无关的 `IRenderer`（默认 Canvas 2D）进行绘制，并投影一个透明的 ARIA/自动化影子层，使 canvas 保持可访问且可被智能体驱动。

> 本页及其子页面由已发布的 `.d.ts`（公共表面）和 `packages/core/src` 源代码（行为）生成。这里的签名会覆盖叙述性 `docs/usage/*` 指南中的任何内容 —— 特别是真正的构造函数是 `new Scene(canvasElement, options)`，**而不是**某些较旧散文所展示的 `{ canvasId }` 形式。

## 参考页面

下面的每个关注点都有其独立的聚焦页面 —— 签名、陷阱，以及一个横向链接到其他页面的"相关"页脚：

| 领域                                                  | 涵盖                                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [`Scene`](/reference/core-scene/)                     | 构造函数、`SceneOptions`、公共字段、`renderMode`/`maxFPS`/空闲节流、生命周期方法、后端注册表。                |
| [`Entity`](/reference/core-entity/)                   | 抽象 VMT 节点：变换、动画系统、捕获/冒泡事件、a11y/批处理钩子。                                               |
| [布局引擎](/reference/core-layout/)                   | `LayoutEngine` 的冷/热分离、流式记忆化、富文本、排除形状。                                                    |
| [渲染器](/reference/core-renderer/)                   | `IRenderer`、`CanvasRenderer`、`SVGRenderer`、WebGL point/rect/sprite/MSDF 层、内容投影、`parseColorToRGBA`。 |
| [`ComputeParticleEntity`](/reference/core-particles/) | 高吞吐量粒子层：内存布局、CPU 模拟、WebGPU 对比 CPU。                                                         |
| [Text & Bidi](/reference/core-text/)                  | `MSDFFont`、`MSDFTextEntity`、`TextEntity`/`GridTextEntity`、阿拉伯文成形 + bidi 解析器。                     |
| [其他实体](/reference/core-entities/)                 | `SplineEntity`、`DOMPortalEntity`、`SVGEntity`。                                                              |
| [数学工具](/reference/core-math/)                     | `SpatialHashGrid`、`SpringPhysics`。                                                                          |
| [动画](/reference/animation/)                         | 独立的 `@vectojs/animation` 引擎：`TweenDriver`/`SpringDriver`、`MotionConfig`、缓动曲线。                    |
| [样式](/reference/styles/)                            | 独立的 `@vectojs/styles` 层：CSS 命名的样式对象、`var()` token 主题、`setTheme` 切换、`css()` 合并。          |
| [a11yRoot 与智能体约定](/reference/core-a11y/)        | 影子 DOM 投影、`A11yAttributes`、同步陷阱。                                                                   |

## 入口点与模块地图

布局、文本塑形、数学和动画引擎作为各自独立的包发布。`@vectojs/core` **依赖并重新导出**它们全部，因此下面的每个导入仍然可以从 `@vectojs/core`（以及从可 tree-shake 的子路径）解析。当你想要一个不含场景图运行时的更小依赖面时，直接从这些独立的包导入。

`@vectojs/core` 提供一个有副作用的主入口，外加三个可 tree-shake 的子路径，以及四个独立的包：

| 导入                     | 内容                                                                                                                                                                                         | 副作用                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `@vectojs/core` (`.`)    | 一切：`Scene`、`Entity`、所有实体、渲染器，外加重新导出的布局、文本、数学和动画引擎。                                                                                                        | 导入时自动注册**两个**可插拔后端（WebGL point 渲染器 + WebGPU 粒子管理器）。 |
| `@vectojs/core/layout`   | 重新导出 `@vectojs/layout`：`LayoutEngine`、`PreparedText`、`createCanvasMeasurer`、`LayoutResultBuffer`、`LayoutWorkerManager`、`computeLineSegments`、布局类型。                           | 无。                                                                         |
| `@vectojs/core/renderer` | `IRenderer`、`CanvasRenderer`、`SVGRenderer`、`PointRenderer`、`createWebGLPointRenderer`、`WebGPUParticleSystemManager`、`parseColorToRGBA`、`RGBA`。                                       | 无。                                                                         |
| `@vectojs/core/text`     | 重新导出 `@vectojs/text` 外加驻留于 core 的 `MSDFTextEntity`/`SVGEntity`：`MSDFFont`、`ArabicShaper`、`BidiResolver`、`Typography`、`prepareContentGrid`、`PreparedContentGrid`、MSDF 类型。 | 无。                                                                         |
| `@vectojs/text`          | 独立的文本塑形基元：`BidiResolver`、`ArabicShaper`、`Typography`、`MSDFFont`、`prepareContentGrid`、`PreparedContentGrid`。叶子包（仅 `bidi-js`）。                                          | 无。                                                                         |
| `@vectojs/layout`        | 独立的布局引擎：`LayoutEngine`、`LayoutWorkerManager`、`createCanvasMeasurer`、测量辅助函数。依赖 `@vectojs/text`。                                                                          | 无。                                                                         |
| `@vectojs/math`          | 独立的空间/物理数学：`SpatialHashGrid`、`SpringPhysics`。叶子包。                                                                                                                            | 无。                                                                         |
| `@vectojs/animation`     | 独立的缓动 + 驱动器：`Easing`、`TweenDriver`、`SpringDriver`。依赖 `@vectojs/math`。                                                                                                         | 无。                                                                         |

**陷阱：** 后端自动注册仅存在于 `.` 入口中（`Scene.registerWebGLPointRendererCreator(createWebGLPointRenderer)` 和 `Scene.registerWebGPUParticleSystemManager(WebGPUParticleSystemManager)` 在导入时运行）。如果你在只导入子路径之后构造 `Scene`，请自行注册后端，否则 `pointBackend: 'webgl'` / WebGPU 粒子会静默回退。参见 [`Scene`](/reference/core-scene/) 了解注册表 API。

## 推荐的文档站页面（core）

- **Learn / 核心概念** —— Scene、Virtual Math Tree、渲染循环、`IRenderer`、zero-DOM 模型。
- **Learn / 渲染模式与性能** —— `always` 对比 `onDemand`、`maxFPS`、空闲 2-fps 节流以及帧间 `markDirty()` 规则、减弱动效。
- **Learn / 构建自定义 Entity** —— `isPointInside`/`render`、变换、`getBounds` 剔除、`getBatchCircle`/`getBatchRect` 快速路径。
- **Learn / 事件与命中测试** —— 捕获/冒泡、`VectoJSEvent`、`findEntityAt`、表单控件 `change`/IME。
- **Learn / 无障碍与自动化** —— 影子 DOM 约定、`getByRole` 驱动的智能体、`debugA11y`、节流。
- **Learn / 文本与排版** —— 冷/热 `LayoutEngine` 分离、流式记忆化、MSDF 文本、排除/换行、bidi。
- **Learn / 粒子** —— `ComputeParticleEntity`、WebGPU 对比 CPU、8-float 布局、`resize()` 优先。
- **Reference / API** —— 上面的子页面（Scene、Entity、布局引擎、渲染器、粒子、文本、数学工具、a11y 约定）。
- **Reference / 后端注册表** —— 可插拔的 WebGL/WebGPU 后端，在 [`Scene`](/reference/core-scene/#ke-cha-ba-hou-duan-zhu-ce-biao-jing-tai) 下涵盖。
