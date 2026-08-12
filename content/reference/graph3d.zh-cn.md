+++
title = "@vectojs/graph3d"
description = "3D 力导向图可视化：一个可插拔的 GraphLayout 接口，外加一个在两次绘制调用中绘制任意图的实例化 Three.js 渲染器。"
weight = 44
+++

# `@vectojs/graph3d`

记录的版本：**0.3.1**

用于 VectoJS 的 3D 力导向图可视化：一个可插拔的 `GraphLayout` 约定（worker 友好，位置作为一个扁平的 `Float32Array`），外加 `Graph3D`，一个在恰好两次绘制调用中绘制任意图（无论多少节点）的实例化 Three.js 渲染器。参见实时的[《悲惨世界》演示](/demos/graph3d/)了解运动中的规范 77 节点/254 链接数据集。

## 安装

```bash
bun add @vectojs/graph3d three
```

`three` 是一个 peer 依赖 —— `@vectojs/graph3d` 绘制到你添加到自己场景中的一个 `THREE.Group`，并不自行管理 `WebGLRenderer`、相机或控件。

## 用法

```ts
import { D3ForceLayout, Graph3D } from '@vectojs/graph3d';
import * as THREE from 'three';

const data = {
  nodes: [{ id: 'vectojs', val: 8, color: '#4f9cff' }, { id: 'core' }, { id: 'ui' }],
  links: [
    { source: 'vectojs', target: 'core' },
    { source: 'vectojs', target: 'ui' },
  ],
};

const layout = new D3ForceLayout();
layout.setGraph(data);

const graph = new Graph3D();
graph.setGraphData(data);
scene.add(graph.group);

function animate() {
  const active = layout.step();
  graph.applyPositions(layout.positions);
  renderer.render(scene, camera);
  if (active) requestAnimationFrame(animate);
}
animate();
```

一旦模拟冷却（alpha 低于阈值），`layout.step()` 返回 `false` —— 上面的示例此时停止自己的 rAF 循环，但让用户实时调整力（电荷强度、链接距离）的调用者无论如何都应保持每帧渲染，并仅将物理 `step()`/`applyPositions()` 调用门控在该标志上，以便 `OrbitControls` 阻尼和相机移动即使在布局稳定后仍保持平滑。

## 参考页面

| 页面                                                          | 涵盖                                                                                                                                                  |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/) | `GraphData` 数据模型、worker 友好的 `GraphLayout` 约定、`D3ForceLayout` 选项和力重启模式。                                                            |
| [`Graph3D` 与拾取](/reference/graph3d-renderer/)              | 实例化的 Three.js 渲染器（`setGraphData`/`applyPositions`/`pickNode`/`getNodePosition`/`dispose`），外加 `GraphInteraction` —— 悬停、选择和拖拽固定。 |

---

## 设计说明

- **构造上 worker 友好。** `GraphLayout` 接口的存在专门是为了让物理模拟可以在主线程之外运行 —— `positions` 是一个 `Float32Array`，可跨 `postMessage` 边界零拷贝传输，而 `Graph3D.applyPositions()` 从不需要知道该缓冲区是来自同步调用还是 worker 消息。
- **渲染器/布局分离是彻底的。** `Graph3D` 从不导入布局类，而 `GraphLayout` 实现从不导入 Three.js —— 将 `D3ForceLayout` 换成未来的 `ngraph` 适配器，或一个完全没有模拟的静态/预计算布局，是调用点的一行更改。
- **构建于 `@vectojs/ui` 和 [`@vectojs/three`](/reference/three/) 之上的交互式世界内节点卡片和 HUD 组件**（在 WebXR 中持续工作的场景到纹理广告牌）是计划在此包之上的下一层 —— 尚未发布。

## 推荐的文档站页面

- **Learn / 3D 图可视化** —— 布局与渲染器分离、调整 `D3ForceLayout` 力、拾取和 worker 托管的布局。
- **Reference / API** —— [`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/)、[`Graph3D` 与拾取](/reference/graph3d-renderer/)。
