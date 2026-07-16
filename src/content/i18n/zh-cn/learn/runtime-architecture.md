---
title: '运行时架构'
description: 'Scene、Entity、渲染循环、无障碍投影和后端如何协同工作。'
order: 3
---

# 运行时架构

VectoJS围绕每个canvas一个`Scene`和一个保留的`Entity`实例树组织。该树存储视觉状态、布局状态、事件行为和语义元数据。

<figure>
  <img src="/images/vmt-architecture.svg" alt="VMT架构图，展示实体树、canvas渲染和无障碍影子层" class="diagram" />
  <figcaption>Scene遍历虚拟数学树，将像素渲染到canvas，并将语义投影到DOM。</figcaption>
</figure>

## 虚拟数学树

每个实体拥有：

- `x`、`y`、`scaleX`、`scaleY`、`rotation`和`opacity`；
- 用于边界的`width`和`height`；
- 一个`children`数组；
- 用于状态变化的`update(dt, time)`；
- 用于在局部坐标中绘制的`render(renderer)`；
- 用于命中测试的`isPointInside(globalX, globalY)`；
- 可选的`getA11yAttributes()`用于投影语义。

变换在树中向下组合。在命中测试嵌套或变换的实体时使用`worldToLocal()`。

## 帧管线

<figure>
  <iframe src="/sandbox/diagram-pipeline.html" class="diagram-frame" loading="lazy" title="VectoJS渲染循环：一个脏帧的六个阶段，由VectoJS实时渲染" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>一个脏帧：更新、剔除、渲染、刷新后端批处理，然后同步投影的DOM。</figcaption>
</figure>

## 无障碍投影

一个透明的DOM层位于canvas上方。交互实体可以投影真实元素，如`<button>`、`<input>`、`<a>`和带有角色的`<div>`节点。

该层使canvas UI：

- 可以被屏幕阅读器发现；
- 可以通过键盘和原生表单控件操作；
- 可以使用Playwright角色选择器测试；
- 可以由依赖DOM语义的AI智能体驱动。

投影不能替代设计审查。应用程序仍然拥有标签、焦点顺序、键盘行为、对比度和减少运动行为。

## 渲染后端

| 后端             | 何时使用                    | 能力                         |
| ---------------- | --------------------------- | ---------------------------- |
| `CanvasRenderer` | 默认                        | Canvas 2D，带设备像素比缩放  |
| WebGL点层        | `pointBackend: 'webgl'`     | 批处理圆形/矩形和GPU字形路径 |
| WebGPU计算       | `particleBackend: 'webgpu'` | 计算驱动的粒子，带回退       |
| `SVGRenderer`    | `scene.toSVG()`             | 无头SVG导出                  |

后端选择只有在后端匹配瓶颈时才有帮助。如果文本布局或应用计算占主导，将Canvas改为WebGL不会修复慢路径。

## 生命周期

```ts
const scene = new Scene(canvas, { maxFPS: 60 });
scene.renderMode = 'onDemand';
scene.resize(width, height);
scene.start();

// 稍后
scene.destroy();
```

当宿主组件卸载时，始终销毁场景。场景拥有渲染器资源、观察者、工作线程、投影DOM和事件状态。

## 下一步

- [引擎概念](/learn/engine-concepts/) 解释数学支柱。
- [核心场景](/learn/core-scene/) 展示实践中的API。
