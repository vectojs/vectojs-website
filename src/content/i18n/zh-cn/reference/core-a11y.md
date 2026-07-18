---
title: 'a11yRoot 与智能体约定'
description: '每个可交互 Entity 如何将一个透明的 ARIA 影子节点投影到 DOM 中 —— A11yAttributes 的形状、canvas 性能与 DOM 级无障碍的约定，以及导致陈旧或缺失影子节点的同步陷阱。'
order: 10
---

# a11yRoot 与智能体约定

属于 [`@vectojs/core`](/reference/core-api/)。

每个拥有盒子的可交互实体都会将一个**透明的 ARIA 影子节点**投影到 Scene 的 `a11yRoot` div 中（位于 canvas 之上，`pointerEvents:auto` 以便自动化/AT 可以交互；除非 `debugA11y`，否则 `opacity:0`）。每个节点携带 `id` + `data-vecto-id`，外加来自 [`Entity.getA11yAttributes()`](/reference/core-entity/#a11y--批处理钩子覆盖以选入) 的角色/标签/状态。

投影根跟踪 canvas 的 CSS 盒：canvas 偏移和非均匀 CSS 缩放会应用到影子层和 DOM 门户层，而实体几何仍保持在逻辑 Scene 坐标中。canvas 的任意 CSS 旋转/倾斜不属于此映射。

`A11yAttributes`：

```ts
{
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea';   // default 'div'
  role?, label?, tabIndex?, href?, src?, alt?, inputType?, placeholder?, value?,
  checked?, disabled?, expanded?, controls?, haspopup?, selected?,
  activedescendant?, valuemin?, valuemax?
}
```

同步将这些应用到一个真实元素（一个真正的 `<button>`、`<a href>`、`<img>`、带 IME 感知的 `change`/`focus`/`blur` 的 `<input>`/`<textarea>` 等），并进行脏检查以最小化 DOM 写入。非原生可聚焦的交互角色（`button`、`switch`、`checkbox`、`link`、`slider` 等）会获得 `tabindex="0"` 以及 Enter/Space → `click`。这就是"**canvas 性能与 DOM 级无障碍**"的故事：视觉 100% 由 GPU/canvas 完成，而 Playwright/智能体的 `getByRole('button', { name })` 会解析影子节点并点击它。

当诸如设计 canvas 这样的非控件区域必须进入顺序焦点顺序并接收 VMT `keydown` 事件时，显式设置 `tabIndex: 0`。仅用于程序化聚焦时使用 `-1`；返回 `undefined` 会移除显式值。

## 控件与陷阱

- 每个影子节点上的 `data-vecto-id` 镜像实体 `id` —— 这是自动化选择器的稳定句柄。
- `a11ySyncInterval`（参见 [`SceneOptions`](/reference/core-scene/#sceneoptions)）在动画期间节流同步，并确保在待定运动稳定后进行最终追赶；它不会在整个动画期间挂起所有同步。
- `debugA11y: true` 会显示节点（蓝色虚线）以供开发。
- `detachA11y(entity)` 修剪一个子树的影子节点而不移除实体；`remove()` 会自动修剪。每帧同步**创建/更新但从不修剪**，因此请显式管理交互式子元素的变动。
- `getA11yTree()` 返回一个嵌套的 `A11yTreeNode[]` 快照用于断言；`getA11yElement(id)` 获取特定的影子元素。
- `a11yFullViewport` 在所有其他元素之后挂载一个无边界的交互表面。
- 从 Core 1.11.1 起，新投影的交互实体会在创建影子节点的同一帧获得与画布绘制顺序一致的 `z-index`。因此，新覆盖层的背板会在第一次指针交互时就位于旧的设计控件之上，而不必等待下一次渲染。

参见[无障碍](/learn/accessibility/)了解用法和测试模式。

## 相关

[`Scene`](/reference/core-scene/)（`a11ySyncInterval`、`debugA11y`）·
[`Entity`](/reference/core-entity/)（`getA11yAttributes()`、`interactive`、`width`/`height`）·
[`@vectojs/core` 概述](/reference/core-api/)
