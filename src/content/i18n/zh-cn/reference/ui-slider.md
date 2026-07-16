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
  <iframe src="/sandbox/ui/slider.html?v=core-1.9.0-ui-1.9.1" class="sandbox-frame component-demo-frame component-demo-frame-tall" loading="eager" title="Slider live demo" sandbox="allow-scripts allow-same-origin"></iframe>
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
  min?: number;              // default 0
  max?: number;              // default 100
  value?: number;            // default min
  width?: number;            // default 200
  height?: number;           // default 24
  trackColor?: string;
  progressColor?: string;
  handleColor?: string;
  onChange?: (value: number) => void;
})
```

## 事件

`Slider` 在指针输入改变取整后的值之后发出 `change`，携带 `{ value }`。在同一值处重复的指针事件不会发出重复的变更。

## 维护者检查清单

- 指针更新必须将局部 X 钳制到 `[0,width]`。
- 值变化必须调用 `scene.markDirty()`，以便 `renderMode = 'onDemand'` 保持平滑。
- 保持角色元数据与当前值同步。

相关：[`ProgressBar`](/reference/ui-components/#progressbar)、[`Input`](/reference/ui-components/#input)、[`Button`](/reference/ui-button/)。
