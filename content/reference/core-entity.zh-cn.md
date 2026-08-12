+++
title = "Entity"
description = "每个 Virtual Math Tree 节点的抽象基类：变换、动画系统、捕获/冒泡事件，以及自定义 Entity 可以覆盖的 a11y/批处理钩子。"
weight = 3
+++

# `Entity`（抽象）

属于 [`@vectojs/core`](/reference/core-api/)。

Virtual Math Tree 中每个节点的基类。子类化并实现 `isPointInside` 和 `render`。

```ts
abstract class Entity {
  abstract isPointInside(globalX: number, globalY: number): boolean; // MUST implement
  abstract render(renderer: IRenderer): void; // MUST implement
}
```

## 公共属性

| 属性                         | 类型             | 默认            | 说明                                                                                                                                                 |
| ---------------------------- | ---------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                         | `string`         | `entity_<rand>` | 用作影子节点 id / `data-vecto-id`。                                                                                                                  |
| `children`                   | `Entity[]`       | `[]`            |                                                                                                                                                      |
| `parent`                     | `Entity \| null` | `null`          |                                                                                                                                                      |
| `scene`                      | getter           | —               | 沿父链向上走到拥有它的 `Scene`（或 `null`）。                                                                                                        |
| `x`, `y`                     | `number`         | `0`             | 局部位置。                                                                                                                                           |
| `scaleX`, `scaleY`           | `number`         | `1`             | 局部缩放。                                                                                                                                           |
| `rotation`                   | `number`         | `0`             | 局部旋转，弧度。                                                                                                                                     |
| `opacity`                    | `number`         | `1`             | 乘以每个祖先的不透明度，然后应用到普通、批处理、WebGPU 和 DOM 门户输出。                                                                             |
| `interactive`                | `boolean`        | `false`         | setter 副作用：标记 `a11yNeedsReorder` + `markDirty()`。门控 a11y 投影（与 `width` 一起）。                                                          |
| `width`, `height`            | `number`         | `0`             | 命中盒 / a11y 影子盒尺寸（× 缩放）。                                                                                                                 |
| `clipChildren`               | `boolean`        | `false`         | 将普通子元素绘制裁剪到 `[0,0]–[width,height]`；Canvas/SVG 是精确的。Three 对旋转/倾斜的裁剪使用世界 AABB 裁剪。WebGL point/WebGPU 覆盖路径不被裁剪。 |
| `a11yOffsetX`, `a11yOffsetY` | `number`         | `0`             | 相对于实体的全局位置微调影子节点。                                                                                                                   |
| `a11yFullViewport`           | `boolean`        | `false`         | 即使 `width === 0` 也投影一个填充视口的影子节点；挂载在所有其他元素**之后**，以便顶层组件保持可点击。                                                |
| `isDOMPortal`                | `boolean`        | `false`         | 标记 `DOMPortalEntity`；门户被 a11y 同步跳过。                                                                                                       |

> **A11y 投影需要一个盒子。** 仅当 `interactive && (width > 0 || a11yFullViewport)` 时才创建影子节点。一个 `width: 0` 且无 `a11yFullViewport` 的交互式实体**不会**获得影子节点 —— 请设置 `width`/`height`。

## 树与变换方法

```ts
add(...children: Entity[]): this             // attach one or more children in order; also flags a11yNeedsReorder + markDirty
remove(child: Entity): this
set(props: Partial<this>): this              // assign several own props through their normal setters; returns this
setPosition(x: number, y: number): this
getGlobalPosition(): Point                   // world position; accumulates translate→scale→rotate up to (excluding) root
getWorldTransform(): AffineTransform         // exact accumulated Canvas T·S·R matrix { a,b,c,d,e,f }
localToWorld(localX: number, localY: number): Point
worldToLocal(worldX: number, worldY: number): Point | null // null for a singular transform
getWorldBounds(): Bounds                    // local getBounds() (or width/height) transformed to a world AABB
getWorldScale(): { x: number; y: number }    // product of own + ancestor scale (excl. root)
getWorldRotation(): number                   // sum of own + ancestor rotation (excl. root), radians
getBounds(): Bounds | null                   // local AABB for culling; null (default) = never culled
destroy(): void                              // clear animations + listeners, detach from parent
```

`getWorldScale()` 和 `getWorldRotation()` 是便捷的累加。在嵌套旋转加非均匀缩放下，组合矩阵可能包含剪切；当精确几何至关重要时，使用 `getWorldTransform()`、`localToWorld()`、`worldToLocal()` 或 `getWorldBounds()`。

自 1.9.0 起，`add()` 是**可变参数的** —— `parent.add(a, b, c)` 按参数顺序附加每个子元素（单子元素路径保持 O(1)）。`set(props)` 是一个构造时符合人体工程学的方法，在一次调用中分配多个自身属性，每个都通过其正常的 setter（因此配置了 `setTransition` 的属性仍然动画，`interactive` 仍然标记 a11y 重排序）：`rect.set({ x: 40, y: 40, width: 120, fill: '#38bdf8' })`。它是对给定对象的一个普通 `for…in`，不触及任何每帧路径。两者都与 [`Rect`/`Circle`/`Group`](/reference/core-entities/) 图元自然配对。

## 动画

```ts
// Legacy tween (preserved)
animate(targetProps: Partial<this>, durationMs: number): this
hasPendingAnimations(): boolean

// Animation system (0.2.0)
setTransition(config: Partial<Record<AnimatableProp, MotionConfig>>): this
animateTo(props: Partial<Record<AnimatableProp, number>>, cfg: TweenConfig): Promise<void>
springTo(props: Partial<Record<AnimatableProp, number>>, cfg?: SpringConfig): Promise<void>
```

`animate()` 排队一个补间；多次调用**顺序链接**。只有数值属性插值；缓动是固定的 ease-out（`p * (2 - p)`）。运行中的 `animate()` 保持场景非静态（逃离空闲节流，参见 [`Scene`](/reference/core-scene/#rendermodemaxfps-与空闲自动节流)），并冻结 a11y 同步直到它稳定。

`hasPendingAnimations()` 是**可覆盖的**，是 Scene 观察自定义运动的唯一窗口：如果子类在 `update()` 内部集成自己的移动（手写的弹簧或速度），当该运动进行中时覆盖它以返回 `true` —— 从 `update()` 内部调用的 `markDirty()` 会在同一 tick 结束时再次被清除，因此没有覆盖时，空闲节流会将动画降到 2 fps，而 `onDemand` 模式会冻结它。

**0.2.0 动画系统** —— 弹簧优先，统一补间和弹簧：

- `setTransition` 声明六个可动画属性（`x`、`y`、`scaleX`、`scaleY`、`rotation`、`opacity`）如何动画；此后普通赋值（`entity.x = 400`）就会为它们动画，为连续运动进行进行中的重定目标。这些属性是访问器，在没有配置过渡时具有零开销的快速路径 —— 裸赋值仍然是一个普通的字段写入。
- `animateTo` / `springTo` 命令式地驱动属性，并在运动稳定时解析；与 `animate()` 不同，它们并发运行并与 `await` 组合。
- `MotionConfig = 'spring' | SpringConfig | TweenConfig`（存在 `duration` 时选择补间）。`TweenConfig.easing` 接受来自 `Easing` 导出的 `EasingName` 或自定义的 `(t) => number`。
- 尊重 `prefers-reduced-motion`（移动瞬移，不透明度淡入淡出）。相关：`onMounted()` 在实体附加到活动场景时触发 —— UI presence 助手用它来播放进入动画。

参见[物理与动画](/learn/physics-engine/)了解用法。

## 事件（`VectoEvent` / 捕获 + 冒泡）

```ts
type VectoEvent =
  | 'click' | 'dblclick' | 'hover' | 'pointerdown' | 'pointerup' | 'pointercancel' | 'pointermove' | 'pointerleave'
  | 'change' | 'focus' | 'blur' | 'wheel' | 'keydown' | 'keyup' | 'scroll';

on(event: VectoEvent, cb: (e: any) => void, options?: { capture?: boolean }): this
off(event: VectoEvent, cb: (e: any) => void, options?: { capture?: boolean }): this
emit(event: VectoEvent, payload: any): void          // self-only, bubble-phase listeners (legacy/component-internal)
dispatchEvent(event: VectoJSEvent): void             // DOM-style capture (root→target) then bubble (target→root)
```

- `on`/`off` 默认为**冒泡**阶段；传递 `{ capture: true }` 以使用捕获阶段。冒泡监听器也会为旧的 `emit()` 路径触发。
- `VectoJSEvent<N>` 包装一个 `nativeEvent`，并添加 `target`、`currentTarget`、`bubbles`、`stopPropagation()`、`stopImmediatePropagation()`、`preventDefault()`、视口 `clientX/Y`、逻辑 `sceneX/Y`、当前目标 `localX/Y`、修饰键，以及透传（`deltaX/Y`、`key`、`defaultPrevented`）。局部坐标反转完整的嵌套仿射变换。非冒泡事件仍然运行捕获阶段，但只在冒泡阶段触发其目标。
- 来自表单控件影子 `<input>` 的 `'change'` 携带 `{ value, checked, selectionStart, selectionEnd, composition }`，其中 `composition` 对活动的 IME 预编辑是 `{ start, length } | null`。`'wheel'` 携带原生 `WheelEvent`（调用 `preventDefault()` 以停止页面滚动）。
- `'dblclick'` 在双击时触发（原生 `detail === 2`）。
- `'scroll'` 携带一个 `ScrollEventPayload` —— 这是实体观察其影子镜像滚动偏移量的唯一方式：`{ scrollTop, scrollLeft, deltaY, deltaX, maxScrollTop }`。当浏览器滚动可滚动的内容镜像（例如 `ScrollView` 影子节点）时触发。

参见[事件与命中测试](/learn/events/)了解用法。

## A11y / 批处理钩子（覆盖以选入）

```ts
getA11yAttributes(): A11yAttributes          // default {} → a plain transparent <div>
getBatchCircle(): BatchCircle | null         // { radius, color } → renderer fillCircle fast-path (uniform-scale leaves)
getBatchRect(): BatchRect | null             // { width, height, color } → GPU indexed-quad batch (WebGL pointBackend only)
update(dt: number, time: number): void       // optional override; dt is MILLISECONDS, time is performance.now(); default advances queued tweens
```

`entity.a11yRegion: boolean`（默认 `false`）将实体标记为 a11y **分组区域**：后代投影到共享容器中，而不是独立嵌套，因此纯分组容器（例如 `width: 0`）仍然会分组 —— 最近的封闭区域获胜，区域可以嵌套。它是声明式的，从不被几何体查询。

`getBatchCircle`/`getBatchRect` **每帧**读取（动画的颜色/半径得到尊重）。一个可表示的批处理叶子跳过其自己的 `save/translate/scale/rotate/render/restore`；Canvas 模式或不受支持的累积仿射变换使用实体的正常 `render()` 回退。

参见 [a11yRoot 与智能体约定](/reference/core-a11y/)了解完整的 `A11yAttributes` 形状以及影子 DOM 同步如何工作。

## 相关

[`Scene`](/reference/core-scene/)（拥有该树）·
[渲染器](/reference/core-renderer/)（`Entity.getContentProjection()`）·
[a11yRoot 与智能体约定](/reference/core-a11y/) ·
[`@vectojs/core` 概述](/reference/core-api/)
