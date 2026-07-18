---
title: 'Button'
description: '带用于无障碍和自动化的语义 button 投影的 canvas 渲染按钮组件。'
order: 12
---

# `Button`

`Button` 渲染一个圆角 canvas 按钮，并在同一个盒子之上投影一个真实的透明 `<button>`。用户看到的是 canvas 像素；屏幕阅读器和自动化工具操作语义节点。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Button</span></div>
  <iframe src="/sandbox/ui/button.html?v=core-1.11.1-ui-1.11.3" class="sandbox-frame component-demo-frame" loading="eager" title="Button live demo" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>悬停会改变绘制的状态。点击通过同一个 Playwright 能找到的 button 角色路由。</figcaption>
</figure>

## 最小示例

```ts
import { Scene } from '@vectojs/core';
import { Button } from '@vectojs/ui';

const scene = new Scene(canvas);
scene.renderMode = 'onDemand';

scene.add(
  new Button('Save changes', {
    onClick: () => save(),
  }).setPosition(40, 40),
);

scene.start();
```

## 构造函数

```ts
new Button(label: string, opts?: ButtonOptions & { width?: number; height?: number })

interface ButtonOptions {
  onClick?: (event: unknown) => void;
  bg?: string;
  hoverBg?: string;
  color?: string;
  font?: string;
  padding?: number;
  radius?: number;
}
```

## 无障碍与自动化

`Button` 暴露 `{ tag: 'button', role: 'button', label }`，因此测试应针对语义控件而非像素：

```ts
await page.getByRole('button', { name: 'Save changes' }).click();
```

## 维护者检查清单

- 在 `onDemand` 场景中，悬停和指针离开必须调用 `scene.markDirty()`。
- 视觉按钮标签和无障碍标签必须保持一致，除非未来的选项添加了显式的无障碍名称。
- 在文档示例中优先使用 `Button` 而非自定义的可点击矩形。

相关：[`Toggle`](/reference/ui-components/#toggle)、[`Checkbox`](/reference/ui-components/#checkbox)、[`Overlay`](/reference/ui-overlay/)。
