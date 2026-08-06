---
title: 'UI：Toggle'
description: '带 role=switch 语义和弹簧旋钮运动的开关控件。'
order: 26
---

# `Toggle`

`Toggle` 是一个开关式的布尔控件。它投影 `role="switch"`，并使用共享动画系统为旋钮添加动画。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Toggle</span></div>
  <iframe src="/sandbox/ui/component.html?name=toggle&v=core-1.32.2-ui-2.13.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Toggle live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>旋钮平滑地重新定位，同时语义 `checked` 状态保持最新。</figcaption>
</figure>

## 最小示例

```ts
import { Toggle } from '@vectojs/ui';

const darkMode = new Toggle({
  checked: true,
  label: 'Dark mode',
  onChange: (checked) => setDarkMode(checked),
});
```

## 维护者检查清单

- 保持旋钮动画和语义状态一致。
- 通过共享动画系统尊重减弱动效设置。
- 对于非开关式的布尔选择，优先使用 `Checkbox`。
