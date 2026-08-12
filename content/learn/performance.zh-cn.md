+++
title = "性能"
description = "渲染模式、空闲自动节流、WebGL批处理渲染、视口剔除、文本性能以及如何测量真实GPU吞吐量。"
weight = 13
+++

# 性能

VectoJS设计为默认快速，但几个可选机制可以解锁显著更高的吞吐量。本页解释了可用的旋钮、大多数开发者遇到的隐藏陷阱，以及如何准确测量性能。

## 渲染模式

`Scene`支持两种渲染模式，通过`scene.renderMode`在构造后设置：

```typescript
scene.renderMode = 'always'; // 默认 —— 每帧重新渲染
scene.renderMode = 'onDemand'; // 仅在脏数据或补间时重新渲染
```

### `'always'`模式

rAF循环每帧触发，由`maxFPS`限制（默认60）。用于：

- 连续动画（粒子模拟、物理）
- 实时数据馈送
- 任何总有东西在移动的场景

### `'onDemand'`模式

rAF循环仅在自上一帧以来调用了`scene.markDirty()`时，或动画/过渡驱动在进行中时渲染。空闲tick跳过实体更新/渲染和GPU提交，但Scene仍然安排rAF并遍历树以检查待处理的动画状态。用于：

- 静态或事件驱动的UI（仪表板、表单、菜单）
- 响应于用户操作而动画但其他时候静止的场景

```typescript
scene.renderMode = 'onDemand';

button.on('click', () => {
  button.animate({ scaleX: 1.1, scaleY: 1.1 }, 100).animate({ scaleX: 1, scaleY: 1 }, 100);
  // animate()在补间运行时自动标记脏
});

input.on('change', () => {
  scene.markDirty(); // 重绘以显示新的光标/选择状态
});
```

## 空闲自动节流（隐藏陷阱）

这是VectoJS中最常见的性能陷阱。

在`'always'`模式下，场景在以下条件下被视为**静态**：

- `dirty`标志为`false`，并且
- 没有实体有待处理的`animate()`补间。

静态场景被节流到**约2 fps**以节省电池和GPU。在稳定运行时中，`dirty`标志在每个渲染帧的_开始_时被消耗，因此从`update()`内部发出的`markDirty()`会存活到下一帧的静态检查。

```typescript
// update()内部的markDirty()重新武装下一帧
class Spinner extends Entity {
  update(dt: number, time: number) {
    super.update(dt, time);
    this.rotation += dt * 0.003;
    this.scene?.markDirty();
  }
}
```

**core ≤ 0.2.5上的陷阱：** 标志在_渲染后_被清除，因此在`update()`期间设置的`markDirty()`在下次静态检查之前被清除 —— 上述模式渲染一帧然后冻结在2 fps。如果你支持较旧的核心，使用下面的修复方法之一（在0.2.6上它们仍然是更高效的选择，因为`hasPendingAnimations()`声明了意图而不需要每帧写入标志）。

**修复 —— 选项A：** 使用`animate()`驱动运动而不是手动变更。运行中的补间会自动保持场景活跃：

```typescript
// 正确：animate()使hasPendingAnimations()保持为true
entity.animate({ rotation: Math.PI * 2 }, 1000);
```

**修复 —— 选项A2（对于`update()`驱动的运动）：** 保留积分器，但通过重写`hasPendingAnimations()`告诉Scene。这是内置滚动容器报告其飞行中运动的方式：

```typescript
class Spinner extends Entity {
  update(dt: number, time: number) {
    super.update(dt, time);
    this.rotation += dt * 0.003;
  }
  hasPendingAnimations() {
    return true; // 或：super.hasPendingAnimations() || stillMoving
  }
}
```

**修复 —— 选项B：** 在**帧之间**调用`markDirty()` —— 从事件处理器、`setInterval`或在场景自身rAF之后触发的独立`requestAnimationFrame`：

```typescript
// 正确：在帧之间调用markDirty（不在update内部）
setInterval(() => scene.markDirty(), 16); // 外部驱动程序
```

**修复 —— 选项C：** 切换到`renderMode: 'always'`并设置`maxFPS`以防止静态节流（空闲节流仅在`maxFPS > 0`时应用；设置`maxFPS = 0`解除限制并始终重新渲染）：

```typescript
scene.maxFPS = 0; // 无上限 —— 永不节流到2 fps
```

## `maxFPS`和减少运动

```typescript
const scene = new Scene(canvas, {
  maxFPS: 60, // 帧率上限；0 = 无上限
  respectReducedMotion: true, // 默认：true
});
```

当`respectReducedMotion: true`（默认）并且用户在其操作系统无障碍设置中启用了"减少运动"时，有效FPS上限为**30**（或`maxFPS`和30中较低的）。你可以使用`respectReducedMotion: false`禁用它，但这会忽略一个明确的用户偏好。

`maxFPS`也可以实时设置：`scene.maxFPS = 30`用于省电模式。

## WebGL批处理渲染

对于大组圆形或矩形，WebGL层用类型化缓冲区上传和少量绘制提交替换每个实体的Canvas路径调用。交叉点和加速取决于工作负载/硬件，应进行基准测试。

### 启用批处理层

```typescript
const scene = new Scene(canvas, {
  pointBackend: 'webgl', // 在Canvas2D上堆叠WebGL2 canvas
});
```

### 选择实体加入

重写`getBatchCircle()`或`getBatchRect()`而不是`render()`：

```typescript
class Dot extends Entity {
  radius = 4;
  color = '#00f0ff';

  // 这些每帧读取 —— 动画值也可以工作。
  getBatchCircle() {
    return { radius: this.radius, color: this.color };
  }

  // Canvas模式或不可表示的世界变换所需的回退。
  isPointInside() {
    return false;
  }
  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.arc(0, 0, this.radius, 0, Math.PI * 2);
    renderer.fill(this.color);
  }
}
```

Scene每帧读取`getBatchCircle()` / `getBatchRect()`，并将可表示的世界空间原语馈送到WebGL层。颜色和alpha是逐实例属性，因此一个缓冲区可以包含混合样式。

**约束：**

- 实体必须是**叶子**（没有子元素）。
- 实体自身的缩放必须是**均匀的**（`scaleX === scaleY`）。
- 需要在Scene上设置`pointBackend: 'webgl'`。
- 累加变换必须可用一个缩放 + 旋转表示。非均匀/剪切祖先回退到`render()`。

WebGL层在Canvas2D内容上方合成（`z-index: 5`），因此批处理原语总是在2D内容之上绘制，无论树顺序如何。

### 矩形的`getBatchRect()`

```typescript
getBatchRect() {
  return { width: this.width, height: this.height, color: this.color };
}
```

批处理矩形支持可表示的逐实体旋转。反射、剪切和非均匀累加缩放使用正常渲染器回退。

## 使用`getBounds()`的视口剔除

默认情况下，每个实体在渲染帧上运行`update()`和`render()`，即使它完全在屏幕外。重写`getBounds()`以返回局部空间边界框，Scene将跳过屏幕外实体的`render()`调用。树遍历和`update()`仍然运行：

```typescript
getBounds() {
  return { x: 0, y: 0, width: this.width, height: this.height };
}
```

`UIComponent`已经实现了这一点 —— 所有`@vectojs/ui`组件自动参与剔除。对于具有固定大小的原始`Entity`子类，添加`getBounds()`可以在大型场景中免费获得性能提升。

例如，如果5,000个有边界叶子实体中的90%在屏幕外，则只剩余大约500个`render()`调用，但Scene仍然访问并更新所有5,000个节点。

### 整个场景在屏幕外时暂停

逐实体剔除仍然有遍历成本。当**canvas本身**完全滚动出视图时——一个仪表板标签页、折叠下方的图表——`IntersectionObserver`会暂停rAF循环，并在重新进入时恢复它，因此一个没有人能看到的场景不消耗任何成本，而不是每帧完整更新/渲染。无需手动选择加入。
（当`IntersectionObserver`不可用时，例如SSR/jsdom，场景被视为始终在屏幕上。）

### `dt`被限制在100ms以内

在后台标签页、调试器暂停或长时间GC之后，实际经过的时间可能为几秒。将该原始值馈送到积分会使物理和补间瞬移，因此帧增量被限制在`MAX_FRAME_DT`（100ms）。如果你在`update(dt)`中自行积分`dt`，它永远不会超过该值。

## A11y同步节流

在每个渲染帧上，`Scene`将所有交互实体的位置和状态同步到其影子DOM节点。当数百个交互实体同时动画时，此DOM写入开销可能主导帧时间。

使用`a11ySyncInterval`节流：

```typescript
const scene = new Scene(canvas, {
  a11ySyncInterval: 100, // 最多每100毫秒同步一次
});
// 或实时设置：
scene.a11ySyncInterval = 100;
```

间隔在动画运行时检查；`a11ySyncInterval: 100`将同步限制为每秒最多约10次，并在运动平息后安排最终的追赶同步。根据无障碍延迟和测量的DOM成本选择间隔，而不是假设一个值适合所有UI。

## 文本性能

### `setMaxWidth()` —— 重排的热路径

`LayoutEngine`将测量（冷）与布局（热）分开。当窗口调整大小且文本需要重排时：

```typescript
// 错误：在每次调整大小事件时重建完整的测量文本
window.addEventListener('resize', () => {
  label.setText(label.text); // 冷传递 —— 重新分割和重新测量
});

// 正确：重用缓存的测量结果，仅重新计算换行
window.addEventListener('resize', () => {
  label.setMaxWidth(newWidth); // 热传递 —— 廉价
});
```

热路径是O(单词数)，而不是O(字形数)，并避免所有`Intl.Segmenter`和canvas `measureText`调用。

### `LayoutResultBuffer` —— 可重用文本坐标存储

对于每帧有数千个字形的高密度UI（数据网格、终端、日志查看器），标准的`layoutPrepared()`路径为每个字形分配一个`LayoutNode`对象。改用`LayoutResultBuffer`：

```typescript
import { LayoutEngine, LayoutResultBuffer, createCanvasMeasurer } from '@vectojs/core/layout';

const engine = new LayoutEngine(400, Infinity, createCanvasMeasurer());
const buffer = new LayoutResultBuffer(); // 跨帧重用（CAPACITY = 16384）

function renderRow(text: string) {
  const prepared = engine.prepare(text, {}, 14);
  buffer.reset();
  engine.layoutPreparedIntoBuffer(prepared, buffer);
  // buffer.xs、buffer.ys、buffer.ws、buffer.hs、buffer.chars —— 扁平的类型化数组
  for (let i = 0; i < buffer.count; i++) {
    renderer.fillText(buffer.chars[i], buffer.xs[i], buffer.ys[i], '14px monospace', '#e2e8f0');
  }
}
```

可重用缓冲区避免了在每个热布局上为每个字形分配一个`LayoutNode`对象。约束：固定容量，仅单列（无BiDi视觉重排，无排除矩形）。当你需要这些功能时使用`layoutPrepared()`；在热路径上避免`toLayoutResult()`，因为它分配节点对象。

### `TextRasterCache` —— 用位块传输重复文本，而非重新塑形

_自 Core 1.12.0 起。_ 当一个视图**每帧绘制相同的短字符串数千次**（弹幕、聊天/日志尾部、粒子标签、重复的单元格值）时，瓶颈不在布局 —— 而在 `fillText` 本身。每次调用都会重新塑形字符串、重新解析 CSS 颜色，并在 CPU 主线程上栅格化字形；在每帧数千次调用时，主线程被钉在原生（`(program)`）代码上，而 GPU 却处于饥饿和降频状态。将 `fillText` 替换为对预栅格化文本段的 `drawImage`，可以把这种每次调用的 CPU 开销转变为廉价的位图位块传输：

```typescript
import { TextRasterCache } from '@vectojs/core';

const cache = new TextRasterCache(); // one per scene/renderer

function drawLabel(text: string, x: number, baselineY: number) {
  const r = cache.get('600 24px system-ui', '#38bdf8', text);
  if (r) renderer.drawImage(r.canvas, x - r.offsetX, baselineY - r.offsetY, r.width, r.height);
  else renderer.fillText(text, x, baselineY, '600 24px system-ui', '#38bdf8'); // headless fallback
}
```

收益来自**重用**：当不同的 `(font, color, text)` 文本段集合是有界的（一个短语库、一个小调色板、几种字号）时，稳态命中率接近 100%。一个按插入顺序的淘汰上限（`maxEntries`，默认 4096）针对无界的用户输入内容限制内存，而 `dpr > 1` 在保持位块传输尺寸以 CSS 像素为单位的同时让文本在 HiDPI 上保持清晰。它对高度多变或只绘制一次的文本**没有**帮助 —— 那纯粹是开销。参见[渲染器参考](/reference/core-renderer/#textrastercache)。

## CPU计算 vs 渲染瓶颈

在传统的浏览器DOM框架中，性能瓶颈几乎总是位于浏览器的**渲染和重排布局管线**（DOM操作、样式重新计算和绘制）中。然而，由于VectoJS完全绕过DOM并在内存中数学地处理布局、剔除和交互，性能瓶颈从GPU/渲染层直接转移到**JavaScript单线程CPU计算**。

在足够高的活动节点数下，CPU端遍历、更新、布局和命中测试可能在栅格化之前就超过$16.67\text{ ms}$的帧预算。交叉点取决于工作负载和设备。

VectoJS从基本原理出发，通过提供专用的**"逃生舱"**来解决这些计算瓶颈，以绕过CPU单线程限制。

---

### 1. 高密度粒子模拟（每粒子，非N体）

**瓶颈**：每粒子JavaScript集成是$O(N)$每帧，最终会消耗主线程帧预算。达到该上限的数量取决于设备和模型。

**逃生舱：WebGPU计算着色器（`ComputeParticleEntity`）**
为了完全绕过CPU执行，VectoJS提供了`ComputeParticleEntity`。在其内部：

- 物理方程（欧拉积分、弹簧张力和场吸引力）被编译为**WGSL（WebGPU着色语言）计算着色器**。
- 在运行时，数据驻留在GPU VRAM中，允许WebGPU计算传递在数千个GPU核心上并行化模拟。
- 当WebGPU不可用或设备丢失时，渲染器自动回退到等效的CPU循环（`updateCPU()`）。

> [!IMPORTANT] > **这不是$N$体模拟。** 每个粒子的力仅相对于三个_固定_点计算 —— 其弹簧原点、鼠标光标和可选的爆炸中心。没有粒子间交互，也没有空间索引，这正是什么使其成为令人尴尬的并行且GPU友好的。如果你的模拟需要真正的邻居交互（粒子间碰撞或排斥、群聚、N体重力），`ComputeParticleEntity`不支持它 —— 你需要编写自己的WGSL计算传递，内建邻居查询，或在CPU上运行基于`SpatialHashGrid`的邻居查询（参见下面的[`SpatialHashGrid`](#3-实体海交互on2复杂度灾难)和[物理引擎指南](/learn/physics-engine/)以获取CPU工作示例）。引擎中目前没有通用的"在GPU上运行任意计算，带CPU回退"的抽象 —— `ComputeParticleEntity`是一个特定的、窄实现，不是可重用的模式。

高端吞吐量严重依赖于GPU、浏览器、DPR、粒子模型和组成。此仓库没有检入的高端WebGPU结果，因此使用**导出报告**按钮（参见下面的[测量真实性能](#测量真实性能)）测量你自己的场景。

---

### 2. 高密度文本测量和排版重排

**瓶颈**：动态文本布局是前端工程中最昂贵的CPU任务之一。它需要基于字典的单词分词（`Intl.Segmenter`）、BiDi排序以及浏览器级的字体宽度测量（调用canvas `measureText` API）。尝试在单帧中计算数万个字形的文本布局（如金融终端、活动日志流或数据网格）将在"冷传递"测量管线上冻结JS主线程。

**逃生舱：线程外布局、拆分布局和重用内存**
VectoJS提供三个级别的文本优化：

- **线程外MSDF布局（`LayoutWorkerManager`）**：`MSDFTextEntity`可以将文本加上预计算的字体/字形指标发送到后台Web Worker，按实体去抖。Worker执行行放置并返回类型化坐标/样式缓冲区；它不调用浏览器字体测量API。
- **冷/热分离**：VectoJS将布局分为"冷"（文本解析和字形宽度测量）和"热"（换行计算）。当文本因调整大小而换行时，冷结果被重用，避免所有浏览器测量API，并将调整大小布局复杂度降至纯$O(\text{单词数})$。
- **可重用TypedArray缓冲区（`LayoutResultBuffer`）**：为了避免分配数千个临时布局节点对象，开发者可以将布局坐标写入预分配的扁平缓冲区。周围的调用者仍然可以分配；保证具体是缓冲区路径重用其坐标存储。

> [!IMPORTANT] > **`LayoutWorkerManager`是单个后台线程，不是池，并且它只为一个组件连接。** 它内部由`MSDFTextEntity`（GPU/MSDF字体文本原语）使用 —— 默认的`@vectojs/ui`文本组件（`Text`、`RichText`）同步地在主线程上布局，包括冷/热分离。如果你正在渲染非常高容量的默认组件文本并遇到瓶颈，冷/热分离和`LayoutResultBuffer`仍然适用，但你不能免费获得线程外布局 —— 你需要构建自己的Worker卸载，或切换到`MSDFTextEntity`。更一般地说：在这一个文本布局路径之外，引擎中今天没有其他东西在主线程外运行。VMT遍历、命中测试和弹簧物理都是同步的。

---

### 3. 实体海交互（$O(N^2)$复杂度灾难）

**瓶颈**：逐对实体间碰撞或邻近检查需要$O(N^2)$候选比较。在达到非常大的场景计数之前，这种增长就变得不实用，具体限制取决于每对的工作量。

**逃生舱：空间哈希网格（`SpatialHashGrid`）**
对于应用管理的碰撞/邻近查询，VectoJS导出了**SpatialHashGrid**。Scene不会自动索引实体：

- 2D坐标空间被离散为你选择固定大小的单元格；单元格坐标通过[康托尔配对函数](https://en.wikipedia.org/wiki/Pairing_function)组合成单个桶键，存储在普通的`Map`中 —— 不是固定容量的哈希表。
- 当实体的世界空间AABB变化时调用`insert(id, x, y, w, h)`，或为动态帧清除/重建网格。
- 调用`query(x, y, w, h)`从本地查询AABB重叠的每个单元格检索ID，然后对这些候选者运行精确碰撞测试。
- 这可以将应用级局部物理从**$O(N^2)$**降低到每个查询访问的单元格/结果数。内置的`findEntityAt()`和视口剔除仍然是O(N)树遍历。

> [!WARNING] > **对于密集桶没有自动缓解措施。** `SpatialHashGrid`（以及知识图谱演示使用的独立空间哈希）将每个单元格存储为扁平集合，没有内部结构 —— 没有自适应单元格大小、没有溢出链、没有分层/多分辨率网格。"$O(1)$平均"数字假设你选择的`cellSize`下实体大致均匀分布。如果你的数据可能高度聚集 —— 许多实体落在同一少数单元格中（一群人聚集在一点，缩放后的视图成千上万个节点重叠几个像素） —— 那些单元格会退化到$O(k)$线性扫描，与没有索引相同。目前没有自动逃生舱：唯一的杠杆是为你的实体大小和预期密度选择合适的`cellSize`，并在你的数据聚类行为变化时重新评估它。如果你正在构建存在极端、不可预测聚集可能性的东西，预算好自己测量最坏情况的桶占用率，而不是假设平均情况成立。

---

## 测量真实性能

> [!WARNING]
> 无头Chrome通常使用软件栅格化和不同的帧调度。将其FPS视为相同环境下的回归信号，而不是下限或生产预测。

### 不要将FPS作为你的指标

FPS受垂直同步限制，因此它会**饱和** —— 饱和的数字既隐藏了回归也隐藏了改进。我们自己的测量中有一个真实例子：一个场景报告59 FPS，但每17ms帧中只做了3.4ms的工作，大约空闲了80%的每帧时间。它只是协商了一个60Hz的垂直同步。这个59对代码没有任何说明。

推论对诊断很重要：**"我改变了X，FPS没有变化"在FPS被限制时什么都证明不了。** 变化前后都可以舒适地处于帧预算之内。

改为测量：

- **帧时间百分位数**（p50/p99），而非平均值。在高刷新率显示器上，帧时间被垂直同步量化为1x/2x/3x间隔的桶，中间没有任何值，因此平均值描述了一个从不出现的值。
- **在预算内的帧比例** —— 决定运动是否感觉稳定的数字。在240Hz下预算为4.17ms；在60Hz下为16.67ms。
- **分别测量各阶段成本**（布局、JS批处理、GPU提交），这样你就知道该攻击哪个。

### 归因GPU时间需要`gl.finish()`

WebGL调用是异步的。将draw或`flush()`包裹在`performance.now()`中测量的是**队列插入**时间，而非GPU工作 —— 在我们的测量中两者相差高达5倍。要诚实地归因提交成本，先完成工作然后强制管道排空：

```typescript
const t0 = performance.now();
drawEverything();
gl.finish(); // 序列化帧；没有这个数字就没有意义
const submitMs = performance.now() - t0;
```

`EXT_disjoint_timer_query_webgl2`看起来是更好的工具，但实际上并不可靠：Firefox通常不暴露它，而在Chrome上它常常存在但返回不了可用的样本（每次试验都报告不可用或分离）。不要在其上构建测量策略。

### 在浏览器中基准测试，而不是在Node或Bun中

服务器运行时对任何面向用户的事情都是错误的工具：没有GPU、没有合成器、没有DPR、不同的JIT预热和计时器分辨率。它们对于**隔离原因**很有用 —— 我们的一项优化是通过Node探针发现的 —— 但不适用于产生引用的数字。一个在**Bun/JSC下测得12.4x的变化在真实浏览器中仅为3.2–4.7x**，大约乐观了3倍。

同时引用两个引擎。V8和SpiderMonkey差异很大，单一引擎的数字一再具有误导性。

### 实用检查清单

1. 在真实浏览器上的真实GPU硬件上运行。
2. 报告N的中位数（7是合理的默认值），精确命名场景。
3. 记录浏览器+版本、CPU/GPU、视口CSS大小**和DPR**、实体和可见计数、后端选择以及显示器的刷新率。
4. 在PR和文档中引用浏览器内测量，绝不引用无头输出。

对于自定义基准测试，在`update()`循环中收集帧时间并报告百分位数：

```typescript
const samples: number[] = [];

class BenchEntity extends Entity {
  update(dt: number, time: number) {
    super.update(dt, time);
    if (samples.length < 300) samples.push(dt);
    if (samples.length === 300) {
      const sorted = [...samples].sort((a, b) => a - b);
      const pct = (q: number) => sorted[Math.floor(sorted.length * q)]!;
      const budget = 1000 / 60; // 在高刷新率面板上使用1000 / 240
      const inBudget = samples.filter((s) => s <= budget).length / samples.length;
      console.log(
        `p50 ${pct(0.5).toFixed(2)}ms  p99 ${pct(0.99).toFixed(2)}ms  ` +
          `inside budget ${(inBudget * 100).toFixed(1)}%`,
      );
    }
  }
}
```

`dt`以毫秒为单位。注意它报告的是帧_间隔_，在垂直同步下是量化的 —— 它告诉你是否满足预算，而不是还剩多少余量。要测量余量，请计时你控制的阶段。

## 快速参考：哪种旋钮用于哪种问题

| 症状                  | 修复                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| 场景空闲时节流到2 fps | 预期行为 —— 在状态变化时调用`markDirty()`，或对大部分静态场景使用`renderMode: 'onDemand'`          |
| 手动动画实体降至2 fps | 重写`hasPendingAnimations()`或通过`animateTo()` / `springTo()`驱动它，以便Scene知道运动正在进行    |
| 静态UI浪费电池        | 切换到`renderMode: 'onDemand'`                                                                     |
| 许多兼容的圆形速度慢  | 在目标设备上对`pointBackend: 'webgl'` + `getBatchCircle()`进行基准测试                             |
| 屏幕外实体浪费CPU     | 在实体上实现`getBounds()`                                                                          |
| 动画期间DOM写入开销   | 设置`a11ySyncInterval: 100`                                                                        |
| 调整大小时文本重排慢  | 使用`setMaxWidth()`而不是`setText()`                                                               |
| 密集文本导致分配压力  | 使用`LayoutResultBuffer` + `layoutPreparedIntoBuffer()`                                            |
| CI中FPS不同           | 比较同类CI运行；在目标硬件上测量面向用户的吞吐量                                                   |
| 动态粒子耗尽CPU预算   | 对`ComputeParticleEntity`进行基准测试，将其固定点力模型卸载到WebGPU                                |
| 多行文本重排冻结线程  | 通过`LayoutWorkerManager`将`MSDFTextEntity`布局委托到线程外（默认`Text`/`RichText`保留在主线程上） |
| 实体海交互是$O(N^2)$  | 实现`SpatialHashGrid` —— 降低到平均$O(k)$，在重聚类下不是自动的；为你的数据选择合适的单元格大小    |
