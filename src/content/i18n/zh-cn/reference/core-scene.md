---
title: 'Scene'
description: '顶层 VectoJS 编排器：构造函数选项、渲染循环、renderMode/maxFPS 和空闲自动节流、生命周期方法，以及可插拔的 WebGL/WebGPU 后端注册表。'
order: 2
---

# `Scene`

属于 [`@vectojs/core`](/reference/core-api/)。

```ts
new Scene(canvas: HTMLCanvasElement, options?: SceneOptions)
```

顶层编排器。每个 `<canvas>` 一个 `Scene`。用 `add()` 添加 `Entity` 对象，然后 `start()` 循环。

```ts
const scene = new Scene(document.querySelector('canvas')!);
scene.add(new Circle({ radius: 24, fill: '#38bdf8' }).setPosition(100, 100));
scene.start();
```

Scene 将两个透明的兄弟 `<div>` 附加到 canvas 的**父**元素中（用于 `z-index:10` 的 a11y 影子层和 `z-index:9` 的 DOM 门户层），并在父元素为 `static` 时强制其为 `position:relative`。在 SSR/Node（无 `document`）中，a11y/门户投影降级为空操作，因此无头布局 / `toSVG()` 仍然工作。

## SceneOptions

| 选项                   | 类型                          | 默认             | 效果                                                                                                                                                                                                                                         |
| ---------------------- | ----------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pointBackend`         | `'canvas' \| 'webgl'`         | `'canvas'`       | 可表示的 `getBatchCircle()`/`getBatchRect()` 叶子的后端。`'webgl'` 堆叠一个 WebGL2 canvas（`z-index:5`）并批处理这些图元；不可用的 WebGL2 回退到 Canvas。GL 层在 2D 内容之上合成，因此跨层的画家顺序不会交错。                               |
| `particleBackend`      | `'auto' \| 'webgpu' \| 'cpu'` | `'auto'`         | [`ComputeParticleEntity`](/reference/core-particles/) 后端。`'auto'` 尝试 WebGPU 并在回退到 CPU 之前发出警告。`'webgpu'` 显式请求 WebGPU，但当前会记录一个错误，并且在初始化失败时仍然回退。`'cpu'` 强制 CPU 模拟（设置 `webgpuDisabled`）。 |
| `maxFPS`               | `number`                      | `60`             | 帧率上限。`0` = 不限制（原生刷新）。连续动画仍然运行，只是频率更低。（在 `NODE_ENV=test`/`VITEST` 下内部为 `0`。）也可通过 `scene.maxFPS` 实时设置。                                                                                         |
| `respectReducedMotion` | `boolean`                     | `true`           | 当操作系统请求 `prefers-reduced-motion` 时，上限为 `REDUCED_MOTION_FPS`（30）—— 或该值与 `maxFPS` 中较低者。`false` 忽略操作系统设置。                                                                                                       |
| `a11ySyncInterval`     | `number`                      | `0`              | 将 a11y 影子 DOM 同步节流至最多每 N ms 一次。`0` = 每个渲染帧同步。小值（例如 `100`）在繁重动画期间保持 a11y 层最终一致，同时节省每帧 DOM 写入。也可通过 `scene.a11ySyncInterval` 实时设置。                                                 |
| `debugA11y`            | `boolean`                     | `false`          | 用蓝色虚线轮廓渲染影子节点（开发辅助），而不是 `opacity:0`。无论哪种方式它们都保持可被自动化点击。                                                                                                                                           |
| `renderer`             | `IRenderer`                   | `CanvasRenderer` | 自定义渲染器（例如来自 [`@vectojs/three`](/reference/three-renderer/) 的 `ThreeRenderer`）。                                                                                                                                                 |
| `disableWindowResize`  | `boolean`                     | `false`          | 跳过自动的 `window` 调整大小监听器。在自定义布局容器 / 离屏 canvas 中使用，然后用 `resize(w, h)` 驱动尺寸。                                                                                                                                  |
| `maxDPR`               | `number`                      | `undefined`      | 用于设置 Canvas2D 和 `pointBackend: 'webgl'` 后备存储尺寸的设备像素比上限。`undefined` 读取真实的、未限制的 `devicePixelRatio`。在每次 `resize()` 调用时重新应用，而不仅仅在构造时。见下方\"限制渲染 DPR\"。                                 |

|注意：`renderMode` 是一个**公共字段**（默认 `'always'`），而不是构造函数选项 —— 在构造后设置 `scene.renderMode = 'onDemand'`。

### 限制渲染 DPR（`maxDPR`）

后备存储的渲染成本与 `逻辑尺寸 × dpr²` 成比例，而非线性——在全屏场景中，在 DPR 1（大多数开发笔记本）下流畅运行的场景可能在 DPR 3 显示器上超出其 16ms 帧预算，且直到有人实际在该显示器上测试才可见。这对 `pointBackend: 'webgl'` 影响最大，因为它渲染一个独立的叠加画布，其片段/过度绘制成本恰好是这个 DPR² 曲线——一个全屏 1200 粒子场在 DPR 3 下测得 **116ms** 最大帧，而在 DPR 1 下则为完美的 60fps。

```ts
const scene = new Scene(canvas, { pointBackend: 'webgl', maxDPR: 2 });
```

`maxDPR: 2` 保持显示视网膜清晰（2× 已经超过大多数眼睛在正常观看距离下的分辨能力），同时限制了后备存储像素数量——在 DPR 3 下大约减半，因为 `2² / 3² ≈ 0.44×` 像素。在此选项出现之前，唯一的解决方法是在构造 Scene 之前猴子补丁 `window.devicePixelRatio`；现在首选 `maxDPR`——它在每次调整大小时正确重新应用，而一次性 `Object.defineProperty` 补丁则做不到。

## 公共字段

```ts
scene.canvas: HTMLCanvasElement
scene.width: number
scene.height: number
scene.overlayRoot: Entity          // children drawn above the main tree, bypassing clip bounds
scene.renderMode: 'always' | 'onDemand'   // default 'always'
scene.maxFPS: number               // default 60
scene.respectReducedMotion: boolean
scene.a11ySyncInterval: number
scene.particleBackend: 'auto' | 'webgpu' | 'cpu'
scene.webgpuDisabled: boolean      // getter true when _disabled OR particleBackend === 'cpu'
scene.a11yNeedsReorder: boolean
```

## renderMode、maxFPS 与空闲自动节流

- **`renderMode: 'always'`（默认）** —— 每帧重新渲染，受有效 FPS 限制。
- **`renderMode: 'onDemand'`** —— 仅当场景为_脏_（参见 `markDirty()`）或有待定的动画/过渡驱动器时才绘制。静态 rAF tick 仍检查树中的待定运动，但跳过实体更新/渲染和 GPU 提交。适合静态 / 事件驱动的 UI。

**空闲自动节流（关键陷阱）。** 当场景不为脏且主/覆盖层树中没有节点有待定的 `animate()` 补间时，场景被视为**静态**。在 `maxFPS > 0` 的 `'always'` 模式下，静态场景被节流到 **~2 fps** 以节省电池/GPU。`dirty` 标志在每个渲染帧结束时（渲染后）重置为 `false`，因此：

> 如果你在自定义 `update()` 内部通过修改 `entity.x` 等手动制作动画，在 `update()` **内部**调用 `markDirty()` 无济于事 —— 渲染后重置会清除它，下一帧的静态检查看到 `dirty === false` 并将你节流到 2 fps。要么通过 [`entity.animate()`](/reference/core-entity/#动画)（它在补间运行时保持场景非静态）驱动运动，要么在帧**之间**调用 `scene.markDirty()`（从事件处理器、单独的 `rAF` 或计时器），以便该标志存活到下一次循环迭代。

`effectiveMaxFPS` = `maxFPS`，当操作系统请求减弱动效且 `respectReducedMotion` 开启时，进一步降低到 30（`REDUCED_MOTION_FPS`）。`0` 表示不限制。

## 生命周期方法

```ts
scene.add(entity: Entity): this              // attach to the scene root
scene.remove(entity: Entity): this           // detach + recursively tear down its a11y shadow nodes
scene.start(): void                          // begin the rAF loop; idempotent; warns once if width/height is 0
scene.stop(): void                           // halt after the current frame; start() resumes
scene.destroy(): void                        // idempotently destroy owned entity subtrees/resources, loop, listeners, DOM layers, GPU managers, and renderer
scene.markDirty(): void                      // request a redraw next frame (meaningful in onDemand + escapes idle throttle)
scene.resize(width: number, height: number): void   // set viewport; resizes renderer + GL layer; marks dirty
scene.showOverlay(overlay: Entity): void     // add to overlayRoot (drawn on top, no clip)
scene.hideOverlay(overlay: Entity): void
scene.detachA11y(entity: Entity): void       // remove shadow nodes for a subtree WITHOUT removing it from the tree
```

> **`resize(w, h)` 必须在粒子模拟之前运行。** 宽度/高度来自 `window.innerWidth/innerHeight`，除非设置了 `disableWindowResize`，此时它们回退到 `canvas.width || canvas.clientWidth || 0`。`0×0` 视口意味着粒子在零盒中模拟，可能不渲染。当宽度或高度为 0 时，`start()` 记录一次性警告。
>
> `resize()` 也是文本投影的度量边界。即使逻辑宽度和高度未变，也应在自定义容器或应用 CSS 缩放变化后调用它；Core 1.8 随后重建冷校准键，并在标记预备网格就绪之前等待新的 Firefox/Chromium Range 几何。
>
> **`syncA11y` 在一帧内只创建/更新，从不修剪**。如果组件每帧换出交互式_子_实体，请在丢弃它们之前调用 `detachA11y(child)`，否则它们的 `<a>`/控件影子节点会泄漏。（`remove()` 已经递归修剪。）

## 其他 Scene 方法

```ts
scene.getRenderer(): IRenderer
scene.getRoot(): Entity
scene.clientToScene(clientX: number, clientY: number): Point // viewport → logical Scene coordinates
scene.render(renderer: IRenderer, dt = 0, time = 0): void   // main renderer advances state; secondary renderers draw a read-only snapshot
scene.toSVG(): string                        // read-only current-state snapshot through SVGRenderer → flat SVG XML
scene.findEntityAt(x, y): Entity | null      // topmost entity whose isPointInside() returns true (depth-first, front-to-back; no interactive filter)
scene.getA11yElement(entityId: string): HTMLElement | undefined
scene.getA11yTree(): A11yTreeNode[]          // nested snapshot of the projected shadow nodes (id/tag/role/label/value/...)
```

## 可插拔后端注册表（静态）

```ts
Scene.registerWebGLPointRendererCreator(creator: WebGLPointRendererCreator): void
Scene.registerWebGPUParticleSystemManager(managerClass: any): void
```

由 `.` 入口自动调用。相关接口（`IWebGLPointRenderer`、`IWebGPUParticleSystemManager`、`WebGLPointRendererCreator`）为自定义后端导出。WebGPU 设备丢失会以指数退避自动恢复（3 次重试），然后才永久禁用 WebGPU。

## 相关

[`Entity`](/reference/core-entity/)（Scene 拥有的树）·
[`IRenderer` / `CanvasRenderer`](/reference/core-renderer/) ·
[`ComputeParticleEntity`](/reference/core-particles/) ·
[a11yRoot 与智能体约定](/reference/core-a11y/) ·
[`@vectojs/core` 概述](/reference/core-api/)
