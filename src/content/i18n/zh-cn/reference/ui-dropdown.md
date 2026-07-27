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
  <iframe src="/sandbox/ui/component.html?name=dropdown&v=core-1.17.1-ui-2.3.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Dropdown live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## 维护者检查清单

- 保持 `expanded`、`controls` 和 `activedescendant` 元数据同步。
- 在外部点击和按 Escape 时关闭覆盖层。
- 测试 ArrowUp、ArrowDown、Enter、Space 和 Escape。
