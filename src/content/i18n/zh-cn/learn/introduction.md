---
title: 'VectoJS简介'
description: '简要概述VectoJS是什么、它的用途以及下一步去哪里。'
order: 1
---

# VectoJS简介

**VectoJS**是一个canvas原生UI运行时，适用于视觉或交互复杂度不适合"每个东西一个DOM元素"模式的界面。它将可见树保持在JavaScript实体图 —— **虚拟数学树** —— 中，并将结果绘制到canvas支持的图层上。

交互组件仍然可以在canvas上方投影真实的语义DOM节点（`<button>`、`<input>`、`<a>`等）。这个投影正是让VectoJS控件可访问、支持原生输入并通过基于角色的自动化进行测试的原因。

<figure>
  <img src="/images/intro-runtime-map.svg" alt="VectoJS运行时图，展示应用状态流入虚拟数学树，然后进入布局、命中测试、canvas或GPU渲染以及语义DOM投影。" class="diagram" />
  <figcaption>应用状态更新一个保留的场景图；该图随后驱动像素、布局、事件和语义。</figcaption>
</figure>

## 接下来应该读什么

旧的单页简介已拆分为聚焦的章节：

| 如果你想要了解…                            | 阅读                                       |
| ------------------------------------------ | ------------------------------------------ |
| VectoJS为何存在，以及DOM何时成为错误的工具 | [为什么选择VectoJS](/learn/why-vectojs/)   |
| 运行时、渲染循环和语义投影如何配合工作     | [运行时架构](/learn/runtime-architecture/) |
| 实现背后的八个核心数学/引擎思想            | [引擎概念](/learn/engine-concepts/)        |
| 哪些产品类别适合，哪些不适合               | [使用场景](/learn/use-cases/)              |
| 如何构建第一个运行的场景                   | [快速开始](/learn/getting-started/)        |

## 简而言之

当你需要以下场景时使用VectoJS：

- 数千个视觉实体而不需要数千个样式化的DOM节点；
- 精确的变换、曲线、命中测试和数学布局；
- canvas级别的视觉效果，兼具基于角色的无障碍和自动化；
- 高数据量、流式UI、游戏、图表或WebXR面板；
- 用于测试、模拟和视频导出的确定性步进。

当你构建文档优先的网站、重SEO的散文、普通表单或不需要自定义布局数学的UI时，优先使用常规HTML/CSS。

## 包映射

| 包                        | 用途                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `@vectojs/core`           | `Scene`、`Entity`、渲染器、事件、命中测试、a11y投影。依赖并重新导出下面的各个引擎，因此你可以从 `@vectojs/core` 导入所有内容。 |
| `@vectojs/text`           | 独立的文本塑形基元：BiDi 解析、阿拉伯语塑形、与 CSS 对等的排版、MSDF 字体、预备内容网格                                        |
| `@vectojs/layout`         | 独立的布局引擎：断行、支持 BiDi 的内联布局、排除流、脱离主线程的布局 worker                                                    |
| `@vectojs/math`           | 独立的空间/物理数学：`SpatialHashGrid` 粗筛（broad-phase）与 `SpringPhysics`                                                   |
| `@vectojs/animation`      | 独立的缓动库，外加 `TweenDriver` 和 `SpringDriver` 值驱动器                                                                    |
| `@vectojs/ui`             | 高级组件：`Button`、`Input`、`Toggle`、`ScrollView`、`Dropdown`、`Table` 等等。零运行时依赖。                                  |
| `@vectojs/markdown`       | `Markdown` + `CodeBlock` 实体（用 `marked` 解析，用 `@vectojs/tex` 渲染 TeX 数学公式），构建于 `@vectojs/ui` 之上              |
| `@vectojs/three`          | 将VectoJS场景投影到Three.js纹理上，并将光线投射输入路由回2D                                                                    |
| `@vectojs/devtools`       | 页面内虚拟数学树检查器：实体树、点击拾取、实时几何读数                                                                         |
| `@vectojs/graph3d`        | 3D 力导向图可视化（实例化的 Three.js 渲染器）                                                                                  |
| `@vectojs/video-exporter` | 固定步进Chromium + FFmpeg H.264导出VectoJS场景                                                                                 |

布局、文本、数学和动画引擎作为各自独立的包发布，因此可以在不引入场景图运行时的情况下使用它们。`@vectojs/core` 依赖并重新导出它们全部，所以现有的 `import { … } from '@vectojs/core'` 代码无需改动即可继续工作 —— 只有当你想要更小的依赖面时才去使用这些独立的包。

## 心智模型

VectoJS不是React的替代品，不是ECS，也不是零分配的声明。它是一个保留模式的canvas UI运行时：

1. 应用状态更新实体；
2. 实体计算布局、变换、命中测试和语义；
3. 脏场景通过所选后端渲染；
4. 投影的DOM节点向辅助技术和智能体暴露交互表面。

本指南的其余部分将详细探讨这些权衡。

## 下一步

- [为什么选择VectoJS](/learn/why-vectojs/) —— 问题空间和权衡。
- [快速开始](/learn/getting-started/) —— 安装并创建你的第一个场景。
- [核心场景](/learn/core-scene/) —— 深入了解渲染循环、实体和变换。
