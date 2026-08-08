---
title: 'Slider'
description: '暴露 WAI-ARIA slider 约定并在按需场景中平滑重绘的 canvas 滑块组件。'
order: 13
---

# `Slider`

`Slider` 是一个指针驱动的范围控件。它在 canvas 上绘制轨道、进度和滑块，同时暴露 `role="slider"` 以及 `valuemin`、`valuemax` 和实时 `value` 元数据。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Slider</span></div>
  <iframe src="/sandbox/ui/slider.html?v=core-1.32.6-ui-2.15.0" class="sandbox-frame component-demo-frame component-demo-frame-tall" loading="eager" title="Slider live demo" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>拖拽滑块，观察标签和进度条从同一个 change 事件更新。</figcaption>
</figure>

## 最小示例

```ts
import { Slider, Text } from '@vectojs/ui';

const label = new Text('Quality: 64%');
const slider = new Slider({
  min: 0,
  max: 100,
  value: 64,
  width: 320,
  onChange(value) {
    label.setText(`Quality: ${value}%`);
    scene.markDirty();
  },
});
```

## 构造函数

```ts
new Slider({
  label?: string;            // accessible name — set this
  min?: number;              // default 0
  max?: number;              // default 100
  value?: number;            // default min
  width?: number;            // default 200
  height?: number;           // default 24
  trackColor?: string;
  progressColor?: string;
  handleColor?: string;
  focusColor?: string;       // 2.7.0+ — focus ring around the handle
  onChange?: (value: number) => void;
})
```

`focused` 跟踪键盘焦点，并在手柄周围绘制一个 2px 的 `focusColor` 圆环（默认 `'#00f0ff'`）。在 `@vectojs/ui@2.7.0` 之前，滑块虽然完全支持键盘操作，却**根本没有焦点指示器**——方向键、`Home` 和 `End` 都能正常工作，但屏幕上没有任何提示焦点在哪（WCAG 2.4.7）。强制颜色模式改用系统的 `Highlight` 颜色。

如果你继承 `Slider` 并重新实现 `render()`，请保留焦点环；并且在 `focus`/`blur` 时将场景标记为脏，否则 `onDemand` 场景永远不会重绘来显示它。

> **设置 `label`。** 没有可访问名称的 `role=\"slider\"` 会被读作单纯的"slider"，让屏幕阅读器用户完全不知道它控制什么（WCAG 4.1.2）。你在 canvas 上绘制的任何可视标签都不会传递到语义层，所以也要在此传入。省略 `label` 会使 `aria-label` 保持未设置，而不是从值推导名称 —— 错误的名称比没有更糟。自 `@vectojs/ui@2.2.0` 起可用。

## 事件

`Slider` 在指针输入改变取整后的值之后发出 `change`，携带 `{ value }`。在同一值处重复的指针事件不会发出重复的变更。

## 维护者检查清单

- 指针更新必须将局部 X 钳制到 `[0,width]`。
- 值变化必须调用 `scene.markDirty()`，以便 `renderMode = 'onDemand'` 保持平滑。
- 保持角色元数据与当前值同步。

相关：[`ProgressBar`](/reference/ui-components/#progressbar)、[`Input`](/reference/ui-components/#input)、[`Button`](/reference/ui-button/)。
