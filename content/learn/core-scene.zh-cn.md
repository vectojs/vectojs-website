+++
title = "核心场景架构"
description = "深入探讨虚拟数学树、Scene生命周期、Entity系统、命中测试和渲染管线。"
weight = 8
+++

# 核心场景架构

VectoJS摒弃了传统的浏览器DOM。相反，它在`@vectojs/core`内部实现了一个**虚拟数学树（VMT）**。

<figure>
  <img src="/images/vmt-architecture.svg" alt="VMT架构图，展示实体树、canvas渲染和无障碍影子层" class="diagram" />
  <figcaption>VMT实体树驱动canvas渲染和canvas上方不可见的无障碍影子DOM。</figcaption>
</figure>

## Scene

`Scene`类是根协调器。它管理三个关键管线：

1. **渲染循环** —— 一个`requestAnimationFrame`循环，依次运行物理/动画，然后通过`IRenderer`渲染。
2. **命中测试** —— 纯数学O(N)射线投射，检测指针悬停和点击，无需`document.elementFromPoint`。
3. **无障碍代理** —— 焦点、布局和值与canvas上方不可见的无障碍影子DOM的双向同步。

### 初始化

```typescript
import { Scene } from '@vectojs/core';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, {
  pointBackend: 'webgl', // 可选：将兼容的批量圆形/矩形合并到WebGL2层
  maxFPS: 60,
});
scene.start();
```

`Scene`将两个透明的`<div>`插入canvas的**父**元素：一个用于无障碍影子层（`z-index: 10`），一个用于DOM门户层（`z-index: 9`）。如果父元素是`static`，则在每帧强制为`position: relative`。

### 渲染模式

| 模式               | 行为                                             | 使用场景             |
| ------------------ | ------------------------------------------------ | -------------------- |
| `'always'`（默认） | 每帧重新渲染，由`maxFPS`限制。                   | 连续动画、粒子模拟。 |
| `'onDemand'`       | 仅在脏数据或运动待处理时绘制；静态tick仍检查树。 | 静态/事件驱动的UI。  |

```typescript
scene.renderMode = 'onDemand';
// 然后从事件处理器调用 scene.markDirty() 请求重绘。
```

**空闲自动节流的陷阱。** 在`'always'`模式下，没有待处理补间且没有脏标记的场景被节流到约2 fps以节省电池。如果你通过在自定义`update()`中改变`entity.x`来手动动画，请在**帧之间**（从事件处理器或单独的`rAF`）调用`scene.markDirty()` —— 而不是在`update()`内部，因为渲染后的重置会在下一次检查前清除标记。

## Entity系统

VectoJS中的每个对象都扩展自抽象类`Entity`。

<figure>
  <img src="/images/entity-hierarchy.svg" alt="Entity类层次结构图，展示Entity → UIComponent → 所有组件" class="diagram" />
  <figcaption>所有UI组件扩展UIComponent，UIComponent本身扩展Entity。自定义类型可以直接继承Entity。</figcaption>
</figure>

一个`Entity`拥有：

- **位置**（`x`、`y`）、**缩放**（`scaleX`、`scaleY`）、**旋转**（弧度）和**不透明度**。
- 一个**子元素数组** —— VMT是一棵树。
- 一个**命中盒**（`width`、`height`），由UIComponent的AABB命中测试使用。
- 可选标记：`interactive`、`clipChildren`、`a11yFullViewport`。

### 完整属性参考

| 属性               | 类型      | 默认值  | 说明                                                                                                                             |
| ------------------ | --------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `x`、`y`           | `number`  | `0`     | 局部位置                                                                                                                         |
| `scaleX`、`scaleY` | `number`  | `1`     | 局部缩放                                                                                                                         |
| `rotation`         | `number`  | `0`     | 弧度                                                                                                                             |
| `opacity`          | `number`  | `1`     | `[0,1]`；在普通、批处理、WebGPU和门户路径上与祖先透明度相乘。                                                                    |
| `width`、`height`  | `number`  | `0`     | 命中盒大小                                                                                                                       |
| `interactive`      | `boolean` | `false` | 启用影子DOM节点 + 事件                                                                                                           |
| `clipChildren`     | `boolean` | `false` | 将子元素绘制限制在`[0,0]–[width,height]`内；Canvas/SVG精确，Three对旋转/倾斜裁剪使用世界AABB剪刀。GPU点/WebGPU覆盖路径不受裁剪。 |
| `a11yFullViewport` | `boolean` | `false` | 创建填充视口的影子节点（用于无边界表面）                                                                                         |
| `a11yOffsetX/Y`    | `number`  | `0`     | 微调影子节点位置                                                                                                                 |

### 继承Entity

```typescript
import { Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

class GlowRect extends Entity {
  color = '#6366f1';

  isPointInside(gx: number, gy: number): boolean {
    const local = this.worldToLocal(gx, gy);
    return (
      !!local && local.x >= 0 && local.x <= this.width && local.y >= 0 && local.y <= this.height
    );
  }

  render(renderer: IRenderer): void {
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 8);
    renderer.fill(this.color);
  }
}

const rect = new GlowRect();
rect.width = 200;
rect.height = 80;
rect.setPosition(100, 100);
scene.add(rect);
```

> **注意：** `render()`被调用时，渲染器已经转换到实体的全局位置、缩放和旋转。从`(0, 0)`开始绘制。

### 命中测试和事件

设置`entity.interactive = true`以在普通canvas场景中投影一个可输入的无障碍节点。当请求命中测试时，`findEntityAt(x, y)`返回第一个其`isPointInside()`返回`true`的实体（深度优先，从前到后）。遍历期间没有交互过滤器：程序化命中测试和适配器仍然可以返回非交互实体。

```typescript
rect.interactive = true;

rect.on('click', (e) => {
  rect.animate({ color: '#38bdf8' }, 300);
});

rect.on('hover', (e) => {
  document.body.style.cursor = 'pointer';
});
rect.on('pointerleave', () => {
  document.body.style.cursor = 'default';
});
```

可用事件：`click`、`hover`、`pointerdown`、`pointerup`、`pointercancel`、`pointermove`、`pointerleave`、`change`、`focus`、`blur`、`wheel`、`keydown`、`keyup`。

事件以DOM风格传播：**捕获**（根 → 目标），然后**冒泡**（目标 → 根）。传递`{ capture: true }`在捕获阶段监听。使用`e.stopPropagation()`停止遍历，或使用`e.stopImmediatePropagation()`同时跳过当前节点上的剩余监听器。

### 动画

`entity.animate()`为任何数值属性排队一个平滑的ease-out补间：

```typescript
// 链式两个补间：向右滑动，然后淡出。
rect.animate({ x: 400 }, 400).animate({ opacity: 0 }, 200);
```

缓动函数是ease-out二次方：`t * (2 - t)`。运行中的补间使场景保持活跃（通过`hasPendingAnimations()`），即使在`onDemand`模式下也是如此。

### 自定义update()

重写`Entity.update(dt, time)`以实现逐帧逻辑。

> [!WARNING] > `dt`以**毫秒**为单位，而非秒。一个常见的错误是写`this.rotation += dt * 3`期望3 rad/s —— 这实际上以3000 rad/s旋转。乘以`0.001`（或将速度除以1000）以进行转换。

`time`是`performance.now()`：

```typescript
class Spinner extends Entity {
  update(dt: number, _time: number): void {
    super.update(dt, _time); // 推进排队的补间
    this.rotation += dt * 0.003; // dt是毫秒，所以这是3 rad/s
    this.scene?.markDirty();
  }
}
```

## 渲染管线

<figure>
  <iframe src="/sandbox/diagram-pipeline.html" class="diagram-frame" loading="lazy" title="VectoJS渲染管线：一个脏帧的六个阶段，由VectoJS实时渲染" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>每个脏帧遍历实体树 —— 更新、剔除、然后渲染 —— 之后同步无障碍影子DOM。<em>（由VectoJS实时渲染。）</em></figcaption>
</figure>

每帧：

1. **清除** —— `renderer.clear()`
2. **更新** —— 遍历树，调用`entity.update(dt, time)`（`dt`以毫秒为单位，`time`来自`performance.now()`）。
3. **剔除** —— 跳过`getBounds()`在视口之外的实体。
4. **渲染** —— 将渲染器平移/缩放/旋转到每个实体的全局变换，然后调用`entity.render(renderer)`。
5. **刷新** —— 提交任何待处理的批处理绘制（圆形、WebGL点）。
6. **同步无障碍** —— 更新影子DOM（由`a11ySyncInterval`节流）。

因为一切都发生在JS内存中并直接转储到Canvas，所以没有浏览器布局抖动。DOM节点数在动画数千个实体时保持不变。

## 性能提示

### 批处理绘制

重写`getBatchCircle()`或`getBatchRect()`以将叶子实体加入WebGL点层（需要`pointBackend: 'webgl'`）：

```typescript
getBatchCircle() {
  return { radius: this.radius, color: this.color };
}
```

可表示的批处理叶子跳过完整的`save/translate/render/restore`路径并进入WebGL缓冲区。Canvas模式或不支持的累加变换使用实体的正常`render()`回退。

### 视口剔除

重写`getBounds()`以返回局部AABB。视口外的实体跳过其`render()`调用，而遍历和`update()`继续：

```typescript
getBounds() {
  return { x: 0, y: 0, width: this.width, height: this.height };
}
```

`UIComponent`已经实现了`getBounds()` —— 具有固定大小的自定义原始Entity子类也应如此。

### 按需渲染

对大部分静态的UI切换到`scene.renderMode = 'onDemand'`。静态tick跳过更新/渲染和GPU工作，同时继续轮询rAF以检查脏/动画状态。从事件处理器调用`scene.markDirty()`。
