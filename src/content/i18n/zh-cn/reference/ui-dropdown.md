---
title: 'UI：Dropdown'
description: '带覆盖层列表框和键盘导航的组合框控件。'
order: 27
---

# `Dropdown`

`Dropdown` 包装一个 canvas 按钮，投影 `role="combobox"`，并打开一个覆盖层列表框。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Dropdown</span></div>
  <iframe src="/sandbox/ui/component.html?name=dropdown&v=core-1.34.0-ui-2.15.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Dropdown live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>用指针或键盘打开它；菜单通过场景覆盖层路径挂载。</figcaption>
</figure>

## 最小示例

```ts
import { Dropdown } from '@vectojs/ui';

const backend = new Dropdown(['Canvas', 'WebGL', 'WebGPU'], {
  label: 'Renderer backend',
  width: 220,
  onChange: (value) => setBackend(value),
});
```

> **设置 `label`。** 没有可访问名称的 `role=\"combobox\"` 会被读作单纯的"组合框"（WCAG 4.1.2）；仅凭选中的值并不能说明控件的用途。任何绘制在 canvas 上的可视标签都不会传递到语义层，所以也要在此传入。自 `@vectojs/ui@2.2.0` 起可用。

关闭的触发器使用 `bg`/`color`；打开菜单中的选项行使用它们自己的五个属性，全部在 2.7.0 中添加：

| 属性              | 默认值                      | 适用范围       |
| ----------------- | --------------------------- | -------------- |
| `menuBg`          | `'rgba(15, 23, 42, 0.95)'`  | 每个选项行     |
| `menuColor`       | `'#fff'`                    | 选项行文本     |
| `menuSelectedBg`  | `'rgba(0, 240, 255, 0.25)'` | 选中的行       |
| `menuHighlightBg` | `'rgba(0, 240, 255, 0.4)'`  | 键盘高亮的行   |
| `focusColor`      | `'#00f0ff'`                 | 触发器与选项行 |

```ts
new Dropdown(['1x', '1.5x', '2x'], {
  label: 'Playback rate',
  bg: 'rgba(18, 23, 34, 0.98)',
  menuBg: 'rgba(18, 23, 34, 0.98)',
  menuColor: '#e2e8f0',
  menuSelectedBg: 'rgba(244, 63, 94, 0.30)',
  menuHighlightBg: 'rgba(244, 63, 94, 0.55)',
  focusColor: '#60a5fa',
});
```

在这些属性出现之前，触发器可以设置主题，而菜单不能，因此为浅色或暖色调调色板设计的下拉框会打开一个带有青色选中项的深色面板——这看起来像渲染错误，而不是样式选择。

选择值时值得注意的两点：

- **两种行状态可以同时生效**，并且打开菜单会高亮选中的行，因此 `menuHighlightBg` 应读作两者中更强的那个。
- **选项行本身可获得焦点**（`role="option"`），因此 `focusColor` 焦点环会绘制在_高亮的_行之上。让焦点环与 `menuHighlightBg` 至少保持 3:1 的对比（WCAG SC 1.4.11）——将高亮的不透明度提高到足以与 `menuSelectedBg` 区分开，可能会悄悄地把焦点环压到该下限之下。

接近不透明的菜单背景通常是正确的选择：半透明菜单覆盖在动态 canvas 内容上，虽靠对比度仍可读，但看起来会显得杂乱。

## 维护者检查清单

- 保持 `expanded`、`controls` 和 `activedescendant` 元数据同步。
- 在外部点击和按 Escape 时关闭覆盖层。
- 测试 ArrowUp、ArrowDown、Enter、Space 和 Escape。
