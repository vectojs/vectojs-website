+++
title = "FAQ"
description = "关于 VectoJS 的常见问题 —— 架构决策、性能、无障碍和故障排除。"
weight = 49

[extra]
order = 49
+++

# 常见问题

## 架构

### 为什么用 canvas 而不是 DOM？

DOM 提供语义文档结构、CSS 布局和成熟的无障碍模型。对于由自定义几何或大型、频繁变化的视觉集主导的工作负载，canvas 可以避免每个可绘制对象一个样式化的 DOM 节点，并给应用直接的布局/渲染控制。它也将布局、命中测试、语义和性能测量的责任移入框架/应用。

### 如果一切都绘制在 canvas 上，无障碍如何工作？

`Scene` 为符合条件的交互实体维护一个由真实 `<button>`、`<input>`、`<a>` 和 `<div>` 元素组成的无障碍投影覆盖层（`a11yRoot`）。它不是浏览器的 Shadow DOM API。该覆盖层跟随 canvas 偏移/CSS 缩放和每个实体的仿射变换，接收原生指针/键盘/焦点事件，并对 DevTools 和基于角色的自动化可见。应用仍然需要正确的角色、标签、焦点顺序、键盘行为和屏幕阅读器测试。

设置 `entity.interactive = true` 以投影一个影子节点。覆盖 `getA11yAttributes()` 以控制标签和 ARIA 属性：

```typescript
getA11yAttributes() {
  return { tag: 'button', role: 'button', label: 'Submit form' };
}
```

### 有 React / Vue / Svelte 集成吗？

尚无第一方包。因为 VectoJS 拥有一个 `<canvas>` 元素，它与任何框架的集成方式与 WebGL 库完全一样 —— 挂载 canvas，在生命周期钩子（`useEffect`、`onMounted` 等）中初始化一个 `Scene`，并在卸载时拆除它。

```typescript
// React example
import { useEffect, useRef } from 'react';
import { Scene } from '@vectojs/core';

export function VectoCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const scene = new Scene(canvasRef.current!, { maxFPS: 60 });
    scene.start();
    return () => scene.destroy();
  }, []);
  return <canvas ref={canvasRef} />;
}
```

### 能否像瓷砖一样将两个 Scene 无缝拼接？

不能作为一个逻辑表面。一个 `Scene` 恰好拥有一个 `<canvas>` 和一棵根 `Entity` 树 —— 没有 API 让两个 `Scene` 共享坐标空间、彼此传递实体或跨边界命中测试。并排运行两个 `Scene` 实例（用普通 CSS 定位的两个 canvas）是可行的，看起来也可以无缝，但它们在功能上保持独立：独立的渲染循环、独立的 `renderMode`/脏跟踪、独立的无障碍投影。如果你需要实体相互交互、变换或命中测试，请将它们放入一个 `Scene` 的树中，而不是尝试桥接两个。

---

## 性能

### VectoJS 在 60 fps 下能处理多少个实体？

没有后端无关的数量：路径复杂度、文本、设备像素比、无障碍投影、更新工作、GPU/驱动和可见百分比都会改变结果。签入的无头基准目前覆盖 1,000 和 5,000 个节点的简单 Canvas 实体；它不是六位数 WebGL/WebGPU 声明的证据。在目标硬件上运行演示报告，并记录你工作负载的帧时间百分位数。

### `pointBackend: 'webgl'` 选项是什么？

设置时，`Scene` 在主 Canvas2D canvas 之上堆叠一个透明的 WebGL2 canvas。实现 `getBatchCircle()` / `getBatchRect()` 的可表示叶子实体被收集到类型化缓冲区中，并在批处理的 WebGL 绘制中提交，而文本、图像、复杂形状和不受支持的仿射变换保留在 Canvas2D 上。测量你硬件的交叉点；仓库目前不包含经过验证的通用加速因子。

### `renderMode: 'onDemand'` 是什么？

在 `'onDemand'` 模式下，Scene 只在调用 `scene.markDirty()` 或动画驱动器进行中时才绘制。静态 tick 仍然调度 rAF 并检查树中的待定运动，但它们跳过实体更新/渲染工作和 GPU 提交。对于大部分静态的 UI —— 仪表盘、表单、菜单 —— 使用它。

```typescript
scene.renderMode = 'onDemand';
entity.on('click', () => {
  entity.animate({ x: entity.x + 50 }, 300); // triggers dirty automatically
});
```

### 为什么在 Node.js / 无头环境中测试时我的 FPS 很低？

无头 Chrome 通常使用软件光栅化器，并具有不同的调度/vsync 行为。它的 FPS 对同一环境中的回归比较有用，而不是作为用户 GPU 的下限或预测。请在目标浏览器和硬件上测量。

> [!TIP]
> 使用 Nexus 演示中的 **Export report** 按钮，用你当前的硬件和浏览器获得真实的 GPU 测量值。将这些数字复制粘贴到你的 PR 中，而不是无头 FPS。

---

## Entity API

### `clipChildren` 是什么？

设置 `clipChildren = true` 将普通子元素绘制裁剪到实体的 `[0,0]–[width,height]` 盒。这是 `ScrollView` 实现溢出的方式。CanvasRenderer 和 SVGRenderer 保留变换后的裁剪。ThreeRenderer 使用裁剪的变换后世界 AABB 相交 scissor 矩形，因此旋转/倾斜的裁剪是轴对齐的近似。提升到独立 WebGL point 层和 WebGPU 粒子覆盖层的图元不被父渲染器的裁剪栈裁剪。

### `a11yFullViewport` 是什么？

通常仅当 `entity.interactive && entity.width > 0` 时才投影一个影子 DOM 节点。对于覆盖整个 Scene 视口的实体（无限画布图、全屏手势识别器），没有有意义的外接盒。设置 `a11yFullViewport = true` 会在所有其他影子节点之后创建一个 Scene 大小的影子节点；投影根随后将该逻辑盒映射到 canvas CSS 盒上。

### 我的 `Entity.update()` 动画比预期快一倍 —— 为什么？

> [!CAUTION] > `Entity.update(dt, time)` 接收的 **dt 以毫秒为单位**，而非秒。这是最常见的 VectoJS 陷阱。60 fps 下 `dt` ≈ 16.7，而非 0.017。

从使用秒的物理库移植时的一个常见错误：

```typescript
// Wrong: treats ms as seconds → 1000× too fast
this.x += velocity * dt;

// Correct: convert to seconds, or use ms units
this.x += velocity * (dt / 1000);
```

弹簧物理（`SpringPhysics`、`ScrollView`）在运行模拟前内部使用 `dt / 1000` 进行转换。

### `emit()` 和 `dispatchEvent()` 有什么区别？

- `entity.emit(event, payload)` —— 仅触发实体自己的**冒泡阶段**监听器。无树遍历。这是一个组件内部路径（例如，一个表单控件发出它自己的 `change`）。
- `entity.dispatchEvent(event)` —— 运行完整的类 DOM 的**捕获 + 冒泡**遍历：捕获从根 → 目标，冒泡从目标 → 根。这是 `Scene` 派发指针事件的方式。

---

## 定制与动画

### VectoJS 的定制能走多远 —— 它能做启动画面或过渡风格的效果吗？

可以。每个可动画属性（`x`、`y`、`scaleX`、`scaleY`、`rotation`、`opacity`）都可以由 `TweenDriver`（基于曲线，来自内置的 `Easing` 集或自定义函数）或 `SpringDriver`（物理的，带可配置的 `stiffness`/`damping`/`mass`）驱动。特别是对于重粒子效果，带 `particleBackend: 'webgpu'` 的 `ComputeParticleEntity` 运行一个 compute shader，带弹簧到原点的力、鼠标排斥、速度钳制、边缘反弹和一个专用的**爆炸力**参数（`triggerExplosion(x, y, force)`）—— 迸发/飞溅效果是一个一等图元，而不是你必须用补间伪造的东西。CPU 回退（`updateCPU`）在 WebGPU 不可用时镜像相同的力模型。

### 如何定义一个 `Entity` 的形状 —— 它能是五边形、椭圆、不规则多边形吗？

可以，而且形状实际上是两个独立的、可覆盖的关注点：

- **视觉形状**：`render(renderer)` 通过 `IRenderer` 的矢量路径图元（`moveTo`、`lineTo`、`bezierCurveTo`、`arc`、`closePath`）绘制 —— 与手写 Canvas2D/SVG 路径会使用的相同图元，因此任何多边形、椭圆或曲线轮廓都可绘制。`SplineEntity` 是内置示例：它通过将任意三次多项式曲线转换为贝塞尔段来渲染它们。
- **命中测试形状**：`isPointInside(globalX, globalY): boolean` 在基类 `Entity` 上是 `abstract` 的 —— 每个具体实体提供自己的逻辑。没有任何东西要求（或默认为）轴对齐外接盒；五边形的 `isPointInside` 可以做真实的点在多边形内的数学，椭圆可以做二次型检查等。

因为两者是独立的方法，一个形状的可点击区域不必与其绘制的轮廓精确匹配（对小形状的宽松触摸目标很有用）。

### 文本和组件会适应不同的设备和浏览器缩放级别吗？文本调整大小是完全自适应的吗？

机制在那里，但它是显式的，而非默认自动的：

- **HiDPI**：`CanvasRenderer` 在构造时和 `resize()` 时读取 `window.devicePixelRatio`，相应地缩放 canvas 后备存储 —— Retina/HiDPI 显示器无需额外的应用代码即可清晰渲染。
- **浏览器缩放**：大多数浏览器在缩放时改变有效的 `devicePixelRatio` 并触发 `window` `resize` 事件，`Scene` 已经监听并通过调用渲染器的 `resize()` 响应。
- **文本重排**：`LayoutEngine.setMaxWidth()` 专门设计为一个廉价的"热路径" —— 它重用来自上次冷 `prepare()` 过程的已缓存、已测量的 `PreparedText`，只重做换行，而不是重新分段或重新测量。从你自己的调整大小处理器调用它，以在任何新宽度下廉价地重排文本。

因此：自适应、调整大小廉价的布局的图元存在，并被 UI 组件内部使用，但原始自定义 `Entity` 不会"免费"重排 —— 你自己将调整大小处理器连接到相关的 `setMaxWidth`/布局调用，就像你在任何即时模式渲染器中连接 canvas 调整大小一样。

### VectoJS 的动画模型与 CSS 动画有何不同？一切都在渲染前预先计算了吗？

不 —— 没有任何东西提前烘焙成关键帧。`TweenDriver.tick(dtMs)` 和 `SpringDriver.tick(dtMs)` 是实时积分器：每帧，它们从自上一帧以来的_实际_经过时间推进，而非从预计算的时间线。`SpringPhysics`（`SpringDriver` 背后的引擎）以固定子步进行实时欧拉积分，并带一个稳定钳制，用于后台标签页返回时可能传递的大 `dt`。

实际区别在你中途改变目标时显现：弹簧上的 `driver.retarget(to)` 保持当前值和速度，并继续平滑地朝新目标积分 —— 无跳变，无重启。目标中途变化的 CSS 过渡/动画通常会重启或跳变，因为它是沿预定曲线插值，而非逐帧模拟物理。

### 如何禁用组件上默认的弹簧/惯性动画，或将它们改为标准过渡？

默认情况下，VectoJS 可滚动组件（如 `ScrollView` 和 `VirtualList`）和属性使用基于弹簧的物理（`'spring'`）实现平滑过渡。如果你想为更利落、即时的行为禁用这些动画，或将它们切换为标准的 cubic-bezier 过渡（如 `easeOutCubic`），你有三种主要方法：

#### 1. 更改目标实体上的过渡配置

每个 `Entity` 暴露一个 `setTransition` 方法。你可以通过在目标元素上用自定义的 `duration`（毫秒）和 `easing` 函数调用 `setTransition` 来覆盖默认的弹簧过渡，或完全禁用它：

```typescript
// To change to a fast, non-bouncing transition (like easeOutCubic)
entity.setTransition({
  y: { duration: 120, easing: 'easeOutCubic' },
});

// To disable animations entirely (instant snaps)
entity.setTransition({
  y: null, // clears the transition driver
});
```

#### 2. 在不启用弹簧的情况下即时定位

如果你想立即移动一个实体而不触发任何配置的过渡（完全绕过弹簧），使用 `setImmediate` 方法：

```typescript
// Snaps the position to target immediately
entity.setImmediate('y', targetY);
```

#### 3. 为移动端滚动绕过 Canvas 物理

对于移动端用户期望原生动量滚动而非 Canvas 模拟弹簧的全屏页面，将触摸手势转发到浏览器视口：

1. 将触摸监听器绑定到 Canvas，以将触摸拖拽增量转换为原生窗口滚动：

   ```typescript
   let touchStartY = 0;
   canvas.addEventListener(
     'touchstart',
     (e) => {
       if (e.touches && e.touches[0]) touchStartY = e.touches[0].clientY;
     },
     { passive: true },
   );

   canvas.addEventListener(
     'touchmove',
     (e) => {
       if (e.touches && e.touches[0]) {
         const touchY = e.touches[0].clientY;
         window.scrollBy(0, touchStartY - touchY);
         touchStartY = touchY;
       }
     },
     { passive: true },
   );
   ```

2. 监听 `window` 的 `"scroll"` 事件，并使用 `setImmediate` 或快速缓动过渡将滚动位置同步到渲染容器：

   ```typescript
   window.addEventListener('scroll', () => {
     mainScroll.y = -window.scrollY; // Or mainScroll.setImmediate('y', -window.scrollY);
   });
   ```

---

## UI 组件与 Devtools

### devtools 提供什么，它们如何帮助调试？

`@vectojs/devtools` 是一个页面内检查器 —— 一个面板（其本身用 VectoJS 渲染），给你：

- Virtual Math Tree 的实时树视图，带实体类型、几何和活动动画的徽章
- 一次性实体拾取（点击 canvas 上的一个实体以在树中选中它）
- 世界变换读数（在完整祖先链之后实际计算出的位置、缩放、旋转）
- 所选实体的键盘微调编辑
- 显示所选实体世界边界的宿主页面覆盖高亮

`Scene` 专门暴露只读的 `rootEntity`/`overlayRootEntity` 访问器，以便像这样的工具可以遍历树而无需特权内部访问。

### 使用 VectoJS 的原生 UI 组件时应注意什么？

一些值得知道的模式，直接来自对组件集的审计：

- **`entity.id` 的唯一性是你的责任。** 引擎不强制它。它对无障碍投影最重要（`Scene` 按实体 id 为影子 DOM 节点设键），以及对你自己按 id 索引实体的任何代码（例如 `SpatialHashGrid`）—— 用你在 `Map` 中挑选键的相同方式挑选 id。
- **将监听器附加到另一个实体的组件必须被 `destroy()`。** `Tooltip`、`Popover` 和类似的"附加到目标"的组件存储它们的处理器并在 `destroy()` 中移除它 —— 当你用完组件时始终调用它，就像你会移除手动添加的监听器一样。
- **`interactive = true` 不是免费的。** 设置它会为该实体投影一个真实的影子 DOM 节点。对按钮、链接和表单控件没问题；在非常大的叶子实体集合上避免它。例如，`GridTextEntity` 明确为其整个网格禁用 `interactive`，专门是为了避免大规模地每个字符投影一个影子节点。
- **自定义的基于拖拽的组件应遵循内置的指针捕获模式。** `Slider` 和同类在 `pointerdown` 时（通过其 a11y 投影的元素）调用 `setPointerCapture()`，这正是让一个超出组件视觉边界的快速拖拽保持正确跟踪的原因。如果你构建自己的可拖拽组件，请遵循相同的模式，而不是仅依赖 `pointermove`/`pointerleave`。将 `pointercancel` 作为回滚路径处理，以便浏览器中断不会留下一个活动的拖拽或选择事务。

---

## 无障碍与自动化

### 如何让一个组件与 Playwright 的 `page.getByRole()` 配合工作？

从 `getA11yAttributes()` 返回正确的标签和角色：

```typescript
// Accessible button
getA11yAttributes() { return { tag: 'button', role: 'button', label: 'Send' }; }

// Accessible link
getA11yAttributes() { return { tag: 'a', role: 'link', label: 'Home', href: '/' }; }

// Accessible text field
getA11yAttributes() { return { tag: 'input', inputType: 'text', placeholder: 'Search…' }; }
```

内置组件（`Button`、`Input`、`Link` 等）自动做这个。

### 影子节点位置看起来不对 —— 实体有偏移

两个常见原因：

1. **canvas 父元素不是 `position: relative`** —— `Scene` 每帧自动强制这个，但如果另一个 CSS 规则在场景启动后强制 `position: static`，绝对定位的影子节点将相对于错误的包含块偏移。
2. **`a11yOffsetX` / `a11yOffsetY`** —— 如果你之前将这些设置为一种变通方法，先尝试移除它们，看看底层定位是否实际上正确。

在 `SceneOptions` 中启用 `debugA11y: true`，以在每个影子节点上看到半透明的高亮盒：

```typescript
const scene = new Scene(canvas, { debugA11y: true });
```

---

## WebGPU 粒子

### `ComputeParticleEntity` 什么都不显示 —— 出什么问题了？

最常见的原因：

1. **没有调用 `initRandomParticles()`** —— 没有初始化粒子数据，所有位置都是 `(0,0)`，尺寸都是 `0`。
2. **WebGPU 不可用** —— 场景记录失败的 WebGPU 请求并回退到 CPU/Canvas2D 路径；确保设置了 `particleBackend: 'webgpu'` 且你的浏览器支持 WebGPU。
3. **canvas 尺寸是 `0×0`** —— 在第一帧之前调用 `scene.resize(w, h)`（或确保 canvas 有尺寸）。

### CPU 回退如何工作？

当 WebGPU 不可用（或失败）时，`Scene` 每个渲染帧调用 `entity.updateCPU(dt, mouseX, mouseY, width, height)` 并通过 `fillCircle` 绘制粒子。该回退镜像弹簧/排斥/爆炸/速度/反弹模型，但 CPU/GPU 数值路径和吞吐量不保证相同。从目标设备的测量中选择粒子数量。

### 我能从 GPU 读回粒子位置吗？

不能直接读 —— 粒子状态存在于一个 WebGPU 存储缓冲区中。要读回它，你需要发起一个 `copyBufferToBuffer` + `mapAsync` 往返，这会阻塞 GPU 管线。相反，如果你需要 CPU 上的位置，保持一个 CPU 端的 `particleData` Float32Array 同步。`setOrigins()`、`setPositions()` 和 `setVelocities()` 写入 `particleData` 并设置 `needsInit = true`，这会在下一帧上传到 GPU 存储缓冲区。

> [!NOTE] > `mapAsync` + `copyBufferToBuffer` 读回有意阻塞管线。对于大规模的碰撞检测或空间查询，请在 CPU 路径上使用 `SpatialHashGrid` 运行它们，或将它们表达为额外的 WebGPU compute 过程。

---

## 故障排除

### `Scene` 在运行但屏幕上什么都不出现

按顺序检查：

1. 调用了 `scene.start()` 吗？
2. canvas 有非零的 `width` 和 `height` CSS 和 HTML 属性吗？
3. 实体是通过 `scene.add(entity)` 添加到场景的（而不仅仅是构造）吗？
4. 实体的 `render()` 方法实际调用了 `renderer.fill()` 或 `renderer.stroke()` 吗？空的 `render()` 什么都不绘制。
5. `entity.opacity` > 0 吗？

### 我的滚轮事件没有到达 `ScrollView`

`ScrollView` 对 `wheel` 事件调用 `e.preventDefault()` 以防止页面滚动。如果影子节点的滚轮监听器触发了但滚动视图没有反应，验证使用了 `ScrollView.add(child)`（而不是 `entity.add(child)` 直接绕过内容包装器），且 canvas 父元素没有 `overflow: hidden` 阻塞指针事件。

### TypeScript 报告 `Cannot find name 'GPUDevice'`

将 `@webgpu/types` 添加到你的项目：

```bash
bun add -d @webgpu/types
```

然后添加到 `tsconfig.json`：

```json
{ "compilerOptions": { "types": ["@webgpu/types"] } }
```
