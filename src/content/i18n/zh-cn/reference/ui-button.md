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
  <iframe src="/sandbox/ui/button.html?v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame" loading="eager" title="Button live demo" sandbox="allow-scripts allow-same-origin"></iframe>
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
  focusColor?: string;       // 2.7.0+ — focus-ring color, default '#00f0ff'
}
```

焦点环以 2px 描边绘制，颜色为 `focusColor`。在任何不是青色默认值所针对的深色默认调色板的主题上设置它：

```ts
const save = new Button('Save', { bg: '#f43f5e', focusColor: '#60a5fa' });
```

焦点环是键盘用户不可或缺的唯一提示，因此它应在你的表面上清晰可辨，而不只是存在——目标应超过 3:1 非文本对比度下限（WCAG SC 1.4.11），并选择与强调色不同的色相，使焦点永远不会被误读为普通的强调效果。强制颜色模式会忽略它而使用系统的 `Highlight` 颜色，因此设置它不会破坏高对比度。

## 无障碍与自动化

`Button` 暴露 `{ tag: 'button', role: 'button', label }`，因此测试应针对语义控件而非像素：

```ts
await page.getByRole('button', { name: 'Save changes' }).click();
```

### `disabled` (2.3.0+)

`disabled` 状态会被绘制为暗淡效果，**并**投影到影子 `<button>` 上，因此视力正常的用户看到的和屏幕阅读器报告的内容不会产生分歧。可以在构造后设置：

```ts
const save = new Button('Save', { onClick: submit });
save.disabled = true; // 暗淡的填充，投影 `disabled`，放弃悬停/焦点状态
```

它还会从**两个**输入路径阻止 `onClick`。浏览器会抑制对被禁用的 `<button>` 的 DOM 点击，但 canvas 命中测试是独立分发的——因此仅有原生属性是不够的。

启用的按钮会省略该属性，而不是写入 `disabled="false"`，因为在原生 `<button>` 上这样写仍然会禁用它。

## 强制颜色（高对比度）

`Button` 读取 [`Scene.forcedColors`](/reference/core-scene/#无障碍与外观)，当操作系统处于强制颜色模式时，使用 CSS 系统颜色而非主题调色板重新绘制：`ButtonFace` 填充、`ButtonText` 标签加上 1px `ButtonText` 边框（使形状在系统背景上可见），以及 `Highlight` 焦点环。Canvas 像素不受浏览器强制颜色重映射的影响，因此跳过此步骤的组件在高对比度模式下将不可读。当设置切换时，场景会自动重新绘制。

## 维护者检查清单

- 在 `onDemand` 场景中，悬停和指针离开必须调用 `scene.markDirty()`。
- 视觉按钮标签和无障碍标签必须保持一致，除非未来的选项添加了显式的无障碍名称。
- 在文档示例中优先使用 `Button` 而非自定义的可点击矩形。
- 自定义按钮组件应镜像上述强制颜色分支。

相关：[`Toggle`](/reference/ui-components/#toggle)、[`Checkbox`](/reference/ui-components/#checkbox)、[`Overlay`](/reference/ui-overlay/)。
