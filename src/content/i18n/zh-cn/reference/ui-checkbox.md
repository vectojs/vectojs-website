---
title: 'UI：Checkbox'
description: '带原生 input 语义和 canvas 视觉状态的复选框控件。'
order: 25
---

# `Checkbox`

`Checkbox` 投影一个真实的复选框 input，并在 canvas 上绘制视觉状态。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Checkbox</span></div>
  <iframe src="/sandbox/ui/component.html?name=checkbox&v=core-1.9.2-ui-1.9.5" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Checkbox live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Canvas 点击和原生 input 变更共享同一个 `change` 路径。</figcaption>
</figure>

## 最小示例

```ts
import { Checkbox } from '@vectojs/ui';

const enabled = new Checkbox({
  checked: true,
  label: 'Enable semantic projection',
  onChange: (checked) => setEnabled(checked),
});
```

## 维护者检查清单

- 保持 `checked` 与投影的 input 状态同步。
- 视觉状态变更时调用 `scene.markDirty()`。
- 除非周围上下文已经为控件命名，否则使用 label。
