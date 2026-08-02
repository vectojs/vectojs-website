---
title: 'UI：RadioGroup'
description: '作为单个 canvas 组件渲染的互斥单选项。'
order: 28
---

# `RadioGroup`

`RadioGroup` 渲染一组互斥的选项，并暴露一个组级别的语义角色。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · RadioGroup</span></div>
  <iframe src="/sandbox/ui/component.html?name=radiogroup&v=core-1.25.0-ui-2.6.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="RadioGroup live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>该演示在窄宽度下在水平和垂直布局之间切换。</figcaption>
</figure>

## 最小示例

```ts
import { RadioGroup } from '@vectojs/ui';

const renderer = new RadioGroup({
  value: 'webgpu',
  direction: 'horizontal',
  options: [
    { value: 'canvas', label: 'Canvas' },
    { value: 'webgl', label: 'WebGL' },
    { value: 'webgpu', label: 'WebGPU' },
  ],
});
```

`RadioGroup` 投影 `{ role: 'radiogroup', label }`。自 2.8.0 起，组的可访问名称可设置，默认为通用的 `'Radio group'`：

```ts
new RadioGroup({
  label: 'Render backend',
  options: [
    { value: 'canvas', label: 'Canvas' },
    { value: 'webgl', label: 'WebGL' },
  ],
});
```

每个选项都有自己的名称，但组的名称才能说明_正在做出哪个选择_。当屏幕上不止一个组时，默认值会让屏幕阅读器用户反复听到 "Radio group"，却无法区分它们——只要标识组的可视标题是绘制在 canvas 上而不是组的一部分，就应该设置它（WCAG 4.1.2）。它还可以在构造后作为公共字段设置。

## 维护者检查清单

- 保持选中的视觉状态和发出的值一致。
- 将禁用样式和行为一起使用。
- 当标签、字体或方向变化时重新计算布局。
