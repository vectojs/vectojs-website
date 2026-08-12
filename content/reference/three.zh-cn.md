+++
title = "@vectojs/three"
description = "用于 VectoJS 的 Three.js 适配器：将 2D UI 面板渲染为 3D 纹理（ThreeAdapter），或使用 Three.js 作为渲染后端（ThreeRenderer）。"
weight = 41
+++

# `@vectojs/three`

两个导出，两个不同的使用场景：

| 导出                                          | 使用场景                                                                                                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`ThreeAdapter`](/reference/three-adapter/)   | 将 VectoJS `Scene` 渲染到适配器拥有或调用者提供的 canvas 上，将其暴露为 `THREE.CanvasTexture`，并通过 UV 光线投射连接指针事件。你的 Three.js 场景的其余部分保持不变。 |
| [`ThreeRenderer`](/reference/three-renderer/) | 使用 Three.js 作为 VectoJS `Scene` 的 2D 渲染后端 —— 填充、描边和文本成为正交场景中的 Three.js 网格，而不是 Canvas 2D 绘制调用。                                      |

`ThreeAdapter` 是常见路径：你有一个 3D 场景，想要一个 2D UI 面板漂浮在表面上 —— 参见其页面了解构造函数、WebXR/多点触控事件处理，以及一个完整的实例。`ThreeRenderer` 适用于已经承诺使用 Three.js 并希望硬件加速的 2D 图元而无 Canvas 2D 回退的项目 —— 参见其页面了解已实现的 `IRenderer` 方法和渐变 shader 布局。

---

## 安装

```sh
bun add @vectojs/three three
```

对于 TypeScript 项目，添加 Three.js 类型：

```sh
bun add -d @types/three
```

---

## 故障排除

### 渐变渲染为纯色而非混合

`stroke()` 不支持渐变 —— 它始终使用第一个颜色停止点作为纯色。如果你需要渐变绘制的形状轮廓效果，请对闭合路径使用 `fill()`。

还要验证你是从 `ThreeRenderer` 调用 `createLinearGradient()`（返回一个 `WebGLGradient`），而不是从 `CanvasRenderingContext2D` —— 跨实现混用渲染器渐变对象会产生未定义行为。

### 文本在高 DPI 显示器上显得模糊

**不要**将构造函数尺寸预乘以 `window.devicePixelRatio` —— `@vectojs/core` 的 `CanvasRenderer` 已经在内部按 DPR 缩放适配器 canvas 的后备存储（预乘会将缓冲区双重缩放，同时扭曲你的逻辑布局空间）。浏览器级别的 DPR 已为你处理。

如果面板文本仍然看起来柔和，原因是 3D 投影，而非 DPR：平面的屏幕面积超过了纹理的分辨率（相机太近，或网格相对纹理尺寸缩放得太大）。增加请求的 `width`/`height` —— 这会提高纹理分辨率_并_按比例给场景更多逻辑布局空间：

```ts
// Sharper texture: more logical + physical pixels for the same world-space mesh size
const adapter = new ThreeAdapter({ width: 1024, height: 640 });
adapter.mesh.scale.set(3.2, 3.2 * (640 / 1024), 1); // world size unchanged; density doubled
```

请注意，实体位置和字体大小以逻辑像素表示，因此在不调整布局的情况下将构造函数尺寸翻倍会使你的 UI 只占据面板的四分之一 —— 请同时缩放位置和尺寸。

### 指针事件对 VectoJS 组件无效

`updateIntersection()` 必须在每个应处理输入的帧上调用 —— 仅在 DOM 事件监听器中调用它是不够的，因为光线投射器需要事件发生时的当前相机和网格状态。请确认：

1. `updateIntersection()` 在你的渲染循环内部调用（或在指针事件处理器中直接调用，并使用新设置的光线投射器）。
2. 光线投射器的相机与用于渲染场景的相机匹配。
3. 投射光线时 `adapter.mesh` 是 Three.js 场景图的一部分 —— 孤立网格（未添加到场景）不会被相交。

## 相关

[`ThreeAdapter`](/reference/three-adapter/) · [`ThreeRenderer`](/reference/three-renderer/) ·
[`IRenderer` / `CanvasRenderer`](/reference/core-renderer/)
