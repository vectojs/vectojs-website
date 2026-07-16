---
title: '物理与动画'
description: '对VMT中的任何实体应用弹簧物理、速度和力导向模拟。'
order: 11
---

# 物理与动画

VectoJS超越了静态布局。因为UI位于虚拟数学树中，你可以对任何组件（包括标准的`Button`和`Input`）应用**连续的力导向物理**。

## 内置补间：`entity.animate()`

最简单的运动工具。`animate()`在任何数值属性上排队平滑的ease-out补间：

```typescript
button.animate({ x: 200, opacity: 0.5 }, 500);

// 链式是顺序的，不是并发：
button.animate({ x: 400 }, 300).animate({ y: 200 }, 300).animate({ opacity: 0 }, 200);
```

当补间运行时，场景保持非静态 —— 无需调用`markDirty()`。当补间平息时，`hasPendingAnimations()`返回`false`。

> [!TIP]
> 链式是顺序的（`animate`返回`this`），不是并发的。对于并发运动、更丰富的缓动、弹簧以及组件的进入/退出，使用下面的动画系统。

## 声明式和命令式动画

自**0.2.0**起，动画系统以弹簧为优先，统一了补间和弹簧于一个API之后 —— 这是动画面向任何实体的变换或不透明度的推荐方式。内置组件（Modal、Tooltip等）使用相同的引擎来动画自身。

### 声明式过渡

声明哪些属性要动画以及如何动画；然后直接赋值即可动画面：

```typescript
entity.setTransition({
  opacity: 'spring', // 默认弹簧
  x: { duration: 300, easing: 'easeOutCubic' }, // 补间
  scaleX: { stiffness: 200, damping: 18 }, // 带覆盖的弹簧
});

entity.opacity = 1; // 弹簧到1
entity.x = 400; // 在300ms内补间
```

在中途分配新目标会**重新定位**正在运行的动画 —— 弹簧保持其速度 —— 因此快速切换或手势驱动的UI连续流动而不是突变。没有配置过渡的属性通过正常的setter立即写入，不创建驱动程序。可动画的属性是`x`、`y`、`scaleX`、`scaleY`、`rotation`和`opacity`。

### 命令式一次性动画

对于编排，`animateTo`（补间）和`springTo`（弹簧）直接驱动属性并返回一个Promise，在运动平息时解析：

```typescript
await entity.animateTo({ x: 400, opacity: 0 }, { duration: 500, easing: 'easeOutCubic' });
await entity.springTo({ scaleX: 1, scaleY: 1 }, { stiffness: 200, damping: 18 });
```

与`animate()`（顺序链式）不同，这些并发运行并与`async`/`await`组合。

### 缓动

`Easing`导出提供一组精选曲线 —— `linear`、`easeInOut{Quad,Cubic}`、`easeOut{Quad,Cubic}`、`easeOutBack`（过冲）等。将曲线名称或你自己的`(t: number) => number`函数传递给任何补间的`easing`选项。

### 减少运动

系统自动尊重操作系统的**prefers-reduced-motion**设置：移动（变换、弹簧）跳到目标，而透明度淡入淡出被保留 —— 组件仍然出现和消失，只是没有运动。无需逐组件代码。

> [!TIP]
> 组件通过此系统动画自身的进入/退出。任何`UIComponent`子类都可以声明`enterMotion`/`exitMotion`并调用`dismiss()`以动画退出然后卸载 —— 参见[UI组件参考](/reference/ui-components/)。

## SpringPhysics

`SpringPhysics`是一个带阻尼的弹簧，用于平滑、物理感觉的数值过渡：

```typescript
import { SpringPhysics } from '@vectojs/core';

const spring = new SpringPhysics(0);   // 初始值 = 0
spring.stiffness = 180;
spring.damping = 18;

// 随时设置目标（例如在悬停时）
spring.target = 1.0;

// 在你的实体的update()中：
update(dt: number) {
  spring.update(dt);
  this.opacity = spring.value;
  if (!spring.isAtRest()) this.scene?.markDirty();
}
```

当目标连续变化时（光标跟踪、滚动动量、交互式拖拽），使用`SpringPhysics`而不是`animate()`。

## 实体上的手动物理

每个`Entity`都有`x`/`y`和`update(dt, time)`。你可以通过重写`update`来实现任何物理模型：

```typescript
import { Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

class BallEntity extends Entity {
  vx = (Math.random() - 0.5) * 200;
  vy = (Math.random() - 0.5) * 200;
  friction = 0.97;

  constructor(public radius: number) {
    super();
    this.width = this.height = radius * 2;
  }

  applyForce(fx: number, fy: number) {
    this.vx += fx;
    this.vy += fy;
  }

  override update(dt: number) {
    super.update(dt); // 推进排队的animate()补间
    const seconds = dt / 1000;
    this.x += this.vx * seconds;
    this.y += this.vy * seconds;
    this.vx *= this.friction;
    this.vy *= this.friction;
  }

  isPointInside(gx: number, gy: number) {
    const local = this.worldToLocal(gx, gy);
    if (!local) return false;
    return (local.x - this.radius) ** 2 + (local.y - this.radius) ** 2 <= this.radius ** 2;
  }

  render(r: IRenderer) {
    r.beginPath();
    r.arc(this.radius, this.radius, this.radius, 0, Math.PI * 2);
    r.fill('#6366f1');
  }
}
```

## 弹性边界

使用简单的阻尼因子使实体在视口边缘反弹：

```typescript
const BOUNCE = 0.75;

override update(dt: number) {
  super.update(dt);
  const seconds = dt / 1000;
  this.x += this.vx * seconds;
  this.y += this.vy * seconds;

  const { width, height } = this.scene!;

  if (this.x < 0) { this.x = 0; this.vx = Math.abs(this.vx) * BOUNCE; }
  if (this.x + this.width > width) {
    this.x = width - this.width;
    this.vx = -Math.abs(this.vx) * BOUNCE;
  }
  if (this.y < 0) { this.y = 0; this.vy = Math.abs(this.vy) * BOUNCE; }
  if (this.y + this.height > height) {
    this.y = height - this.height;
    this.vy = -Math.abs(this.vy) * BOUNCE;
  }
}
```

这种模式适用于小型应用管理的集合。Nexus演示改用`ComputeParticleEntity`的固定弹簧/鼠标/爆炸模型；它不模拟实体间交互。

## SpatialHashGrid：应用管理的邻居候选

对于N体交互（排斥、碰撞），朴素的逐对循环是O(N²)。使用`SpatialHashGrid`从查询重叠的单元格中检索候选者，然后对该较小集合运行精确测试：

```typescript
import { SpatialHashGrid } from '@vectojs/core';

const grid = new SpatialHashGrid(64); // 单元格大小，以世界单位为单位

// 每帧：重建网格，然后查询
for (const ball of balls) {
  grid.insert(ball.id, ball.x, ball.y, ball.width, ball.height);
}

for (const ball of balls) {
  const nearby = grid.query(ball.x - 50, ball.y - 50, 100, 100);
  for (const otherId of nearby) {
    if (otherId === ball.id) continue;
    // 在ball和balls[otherId]之间施加排斥
  }
}

grid.clear(); // 每帧在重新插入前调用一次
```

当你需要真正的邻居交互时（球间碰撞、群聚、实体间排斥），自行使用此模式。注意`ComputeParticleEntity`内部**不**使用`SpatialHashGrid` —— 其模拟（GPU或CPU）只计算相对于固定点（弹簧原点、鼠标、爆炸中心）的力，而不是实体间交互。如果你既需要高粒子数又需要真正的邻居交互，你需要结合两个引擎不为你做的事情：在CPU上运行你自己的基于`SpatialHashGrid`的邻居查询（如上所述），或为GPU路径编写带有内建邻居查询的自定义WGSL计算传递。

> [!WARNING]
> 每帧重建哈希网格。来自上一帧的陈旧网格数据会产生错误的邻居查询和幻影碰撞。

## 高吞吐量粒子：`ComputeParticleEntity`

对于数万个带有弹簧到原点 + 鼠标排斥的粒子，使用`ComputeParticleEntity`。它在可用时自动使用WebGPU计算着色器，回退到CPU：

```typescript
import { ComputeParticleEntity } from '@vectojs/core';

const particles = new ComputeParticleEntity({
  maxParticles: 15000,
  springK: 0.05,
  damping: 0.95,
  size: 3,
  color: '#6366f1',
});

// 将粒子散布在视口中
particles.initRandomParticles(scene.width, scene.height);
scene.add(particles);
scene.start();

// 将粒子动画到新的原点位置（例如拼出文本）
particles.setOrigins(newPositions);
```

> [!CAUTION]
> 始终在`initRandomParticles`之前调用`scene.resize(width, height)`或让Scene自动调整大小。`0×0`视口不会产生初始位置，粒子将永远不会移动。

参见[核心API参考](/reference/core-api/)以了解完整的`ComputeParticleEntity`内存布局和WebGPU内部机制。
