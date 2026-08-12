+++
title = "动画 (@vectojs/animation)"
description = "属性驱动、补间、弹簧与缓动曲线——Entity.animate()、setTransition()、animateTo() 和 springTo() 背后的引擎。"
weight = 54
+++

# `@vectojs/animation`

独立的动画引擎：为平滑的数值运动提供属性驱动，内置精选的缓动集合，以及每个 VectoJS 运动表面共享的 `MotionConfig` 结构。`@vectojs/core` 依赖并**重新导出**它，因此大多数应用不会直接导入这个包——`entity.setTransition({ x: 'spring' })`、`entity.animateTo(...)`、`entity.springTo(...)` 和 `entity.animate({...}, ms)` 是入口点（参见 [`core-entity` # 动画](/reference/core-entity/#animation)）。直接导入它以构建自定义驱动，或独立使用这些缓动：

```ts
import { TweenDriver, SpringDriver, Easing, EASING_IDS } from '@vectojs/animation';
```

## MotionConfig —— 共享的配置结构

```ts
type MotionConfig = 'spring' | SpringConfig | TweenConfig;

interface TweenConfig {
  duration: number; // ms (required — its presence selects a tween)
  easing?: EasingName | EasingFn; // named curve or custom fn, default 'linear'
  delay?: number; // ms before the tween starts, default 0
}

interface SpringConfig {
  stiffness?: number; // default 170
  damping?: number; // default 26
  mass?: number; // default 1
}
```

判别规则：带有 `duration` 的配置是补间，其他一切都是弹簧（`isTweenConfig(c)` 精确地实现了这一点）。一个裸的 `'spring'` 字符串表示“默认弹簧”。

## 驱动（`PropertyDriver`）

```ts
interface PropertyDriver {
  value: number; // current value
  readonly target: number; // destination — applied exactly on completion
  retarget(to: number): void; // change destination; spring keeps velocity, tween restarts
  tick(dtMs: number): void; // advance by dt in milliseconds
  isDone(): boolean;
  syncExternal(value: number, extra: number): void; // adopt externally-advanced state
}
```

- **`TweenDriver(from, to, config: TweenConfig)`** —— 在 `duration` 毫秒内从 `from` 到 `to` 进行缓动插值，可带可选的 `delay`。`retarget()` 从当前值重新启动补间。
- **`SpringDriver(from, to, config?: SpringConfig)`** —— 质量-弹簧-阻尼器积分（由 `@vectojs/math` 的 `SpringPhysics` 支持）。`retarget()` 保留速度，因此中途重定目标是无缝连续的。`target` 在完成时被**精确**应用，而不是在静止容差范围内。
- `syncExternal(value, extra)` 采纳在其他地方推进的状态（例如 WASM 批处理 tick）：对于弹簧 `extra` 是速度，对于补间是已流逝的毫秒数——调用之后，`value`/`tick()`/`isDone()`/`retarget()` 都保持正确。

## Easing

```ts
type EasingFn = (t: number) => number; // normalized [0,1] → eased progress
type EasingName = keyof typeof Easing; // built-in curve names

Easing.linear | Easing.easeInQuad | Easing.easeOutQuad | Easing.easeInOutQuad;
Easing.easeInCubic | Easing.easeOutCubic | Easing.easeInOutCubic;
Easing.easeOutBack | Easing.easeInOutBack;
```

每个内置曲线都满足 f(0)=0、f(1)=1，并以显式乘法编写，因此它**逐位**匹配 WASM 的 `ease()` 内核——批处理补间不仅仅是接近其 JS 对应版本，而是完全相等。`EASING_IDS` 将每个名称映射到其数值 id（用于区分命名缓动补间——可批处理——与自定义的 `EasingFn` 闭包，后者无法跨越进入 WASM）。自定义函数在允许命名曲线的任何地方都可使用：`easing: (t) => t * t * (3 - 2 * t)`。

## 与 `Entity` 运动的关系

| 表面                                         | 用途                        |
| -------------------------------------------- | --------------------------- |
| `setTransition({ prop: 'spring' })` 然后赋值 | 每个属性一个 `SpringDriver` |
| `animateTo({...}, duration, easing)`         | 多个 `TweenDriver`          |
| `springTo({...}, config?)`                   | 多个 `SpringDriver`         |
| `animate({...}, ms)`                         | 对六个内置数值属性的补间    |

`animate()` 只插值 `x | y | scaleX | scaleY | rotation | opacity`——自定义字段不会被驱动（参见 [`core-entity`](/reference/core-entity/#animation)）。
