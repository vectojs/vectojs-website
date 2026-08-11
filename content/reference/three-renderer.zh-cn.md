+++
title = "ThreeRenderer"
description = "将 Three.js 用作 VectoJS Scene 的 IRenderer 后端：已实现的方法、GLSL 渐变 shader 布局，以及线宽注意事项。"
weight = 43

[extra]
order = 43
+++

# `ThreeRenderer`

属于 [`@vectojs/three`](/reference/three/)。

`ThreeRenderer` 使用 Three.js 实现来自 [`@vectojs/core`](/reference/core-renderer/) 的 `IRenderer` 接口 —— 填充、描边和文本被渲染为正交场景中的 Three.js 网格和线，而不是 Canvas 2D 操作。当 Three.js 已经在你的项目中，并且你希望 VectoJS 场景本身用 WebGL 管线而非 Canvas 2D 渲染时使用它。

## 何时使用

- 你希望 VectoJS 的 2D 内容通过为所提供 canvas 创建的专用 `THREE.WebGLRenderer` 渲染为 Three.js 对象。
- 你需要由 GLSL shader 支持的硬件加速渐变填充。
- 你正在对纯 WebGL 2D 管线进行基准测试或实验。

对于将 2D UI 嵌入 3D 表面，请改为优先使用 [`ThreeAdapter`](/reference/three-adapter/) —— 它不要求你放弃 Canvas 2D 渲染。

## 构造函数

```ts
new ThreeRenderer(canvas: HTMLCanvasElement)
```

创建：

- 带 `{ canvas, alpha: true, antialias: true }` 的 `THREE.WebGLRenderer`
- Y 向下（top = 0, bottom = height）的 `THREE.OrthographicCamera`，以匹配 VectoJS 的坐标系
- 像素比自动设置为 `window.devicePixelRatio`

`ThreeRenderer` 创建并拥有此 WebGLRenderer；它不接受或重用现有的渲染器/上下文。`dispose()` 移除活动对象，释放它们的几何/材质/纹理资源，重置栈，并恰好一次地销毁所拥有的 WebGLRenderer。它还会分离下面描述的上下文丢失和 DPR 监听器，因此已销毁的渲染器不会被迟到的事件复活。

## GPU 上下文丢失与运行时 DPR

GPU 重置或内存压力驱逐会使基于 Three 的场景永久空白，而显示器移动或浏览器缩放会使它以过时的像素比渲染（模糊或锯齿）。`ThreeRenderer` 处理这两种情况：

- **`webglcontextlost`** 被 `preventDefault()` —— 必须的，否则浏览器永远不会触发恢复事件 —— 并翻转 `isContextLost()`。丢失时 `present()` 变为空操作，因为对着失效的上下文绘图毫无意义。
- **`webglcontextrestored`** 重新应用像素比和尺寸（恢复可能落在不同的显示器上），清除标志，并强制重绘新清空的帧缓冲区。Three 的 `WebGLRenderer` 在下一次渲染时延迟重建其 GL 状态。
- **DPR 变化** 通过 `(resolution: Ndppx)` 媒体查询跟踪，该查询重新应用 `setPixelRatio` + `setSize` 并重新启动自身（该查询是一次性的）。

所有这些都为 SSR / `OffscreenCanvas` 进行了防护（没有 `addEventListener` 或 `matchMedia`）。`isContextLost()` 也满足可选的 [`IRenderer`](/reference/core-renderer/#应对-gpu-上下文丢失) 钩子，因此 `Scene.render` 在上下文丢失时跳过渲染过程。

## 公共属性

| 属性              | 类型                       |
| ----------------- | -------------------------- |
| `scene`           | `THREE.Scene`              |
| `camera`          | `THREE.OrthographicCamera` |
| `renderer`        | `THREE.WebGLRenderer`      |
| `isContextLost()` | `() => boolean`            |

## 用法

将渲染器作为 `renderer` 选项传递给 VectoJS `Scene` 构造函数：

```ts
import { Scene } from '@vectojs/core';
import { ThreeRenderer } from '@vectojs/three';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const threeRenderer = new ThreeRenderer(canvas);

const scene = new Scene(canvas, { renderer: threeRenderer });
scene.add(/* entities */);
scene.start();
```

## 已实现的 IRenderer 方法

| 方法                                                                                      | 说明                                                                                                                        |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `beginPath()` `moveTo()` `lineTo()` `bezierCurveTo()` `closePath()` `arc()` `roundRect()` | 路径累积；在 `fill()` 或 `stroke()` 时刷新。                                                                                |
| `fill(colorOrGradient)`                                                                   | 通过 `MeshBasicMaterial` 进行纯填充；通过 GLSL `ShaderMaterial` 进行渐变（见下文）。CSS 颜色 alpha 乘以继承的渲染器 alpha。 |
| `stroke(colorOrGradient, lineWidth?)`                                                     | `LineBasicMaterial`。见下文的线宽注意事项。                                                                                 |
| `fillText(text, x, y, font, color)`                                                       | 将文本渲染到离屏 canvas，作为 `THREE.CanvasTexture` 上传。渐变回退到第一个颜色停止点。                                      |
| `fillCircle(cx, cy, radius, color, alpha?)`                                               | 带 32 段的 `THREE.CircleGeometry` + `MeshBasicMaterial`。                                                                   |
| `drawImage(source, dx, dy, dw, dh)`                                                       | `THREE.CanvasTexture` + `PlaneGeometry`。                                                                                   |
| `save()` `restore()` `translate()` `scale()` `rotate()` `setGlobalAlpha()` `clip()`       | 变换/alpha 栈；嵌套裁剪相交。裁剪（scissor）使用变换后的世界 AABB，因此旋转/倾斜的裁剪是一个轴对齐的近似。                  |
| `createLinearGradient(x0, y0, x1, y1, colorStops)`                                        | 返回一个由 `fill()` 消费的 `WebGLGradient` 描述符。                                                                         |
| `flush()`                                                                                 | 调用 `renderer.render(scene, camera)`。                                                                                     |
| `resize(width, height)`                                                                   | 更新 `renderer.setSize()` 并重新计算相机边界。                                                                              |
| `clear()`                                                                                 | 销毁帧几何/材质，并重置路径、变换、alpha 和 scissor 栈状态。                                                                |

## 线宽注意事项

`THREE.LineBasicMaterial.linewidth` 在**大多数平台上被 WebGL 静默忽略** —— 无论传给 `stroke()` 的值如何，线都被上限为 1 px。这是浏览器/GPU 驱动限制，而非 VectoJS 限制。

如果你的设计需要粗描边（> 1 px），请考虑：

- 对直线使用带矩形路径的 `fill()` 而非 `stroke()`。
- 切换到带默认 `CanvasRenderer` 的 [`ThreeAdapter`](/reference/three-adapter/)，它通过 Canvas 2D 支持任意线宽。
- 在你的应用层中手动集成 `THREE.MeshLine` —— `ThreeRenderer` 不捆绑此依赖。

## 渐变支持

`ThreeRenderer.createLinearGradient()` 返回一个 `WebGLGradient` 描述符。当传给 `fill()` 时，渲染器编译一个具有以下 uniform 布局的 GLSL `ShaderMaterial`：

```glsl
uniform vec4 u_grad_colors[8];  // RGBA per stop
uniform float u_grad_stops[8];  // normalized position [0, 1]
uniform vec2 u_grad_start;      // world-space start point
uniform vec2 u_grad_end;        // world-space end point
```

颜色在世界空间中两个最近的停止点之间线性插值。如果提供超过 8 个停止点，它们会在上传前被重采样为 8 个等距点 —— 超过 8 个停止点的颜色细节会丢失。

**`stroke()` 或 `fillText()` 不支持渐变。** 将 `WebGLGradient` 传给 `stroke()` 会回退到第一个停止点颜色。`fillText()` 也回退到第一个停止点颜色，因为文本字形在上传前通过 Canvas 2D 栅格化。

参见 [`@vectojs/three` 主页面](/reference/three/#故障排除)了解渐变/DPI/指针问题的故障排除。

## 相关

[`ThreeAdapter`](/reference/three-adapter/)（替代用例 —— 3D 表面上的 2D 面板）·
[`IRenderer` / `CanvasRenderer`](/reference/core-renderer/)（此项实现的接口）·
[`@vectojs/three` 概述](/reference/three/)
