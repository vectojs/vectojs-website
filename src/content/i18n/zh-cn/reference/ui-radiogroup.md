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
  <iframe src="/sandbox/ui/component.html?name=radiogroup&v=core-1.16.3-ui-2.2.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="RadioGroup live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## 维护者检查清单

- 保持选中的视觉状态和发出的值一致。
- 将禁用样式和行为一起使用。
- 当标签、字体或方向变化时重新计算布局。
