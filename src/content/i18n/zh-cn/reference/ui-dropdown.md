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
  <iframe src="/sandbox/ui/component.html?name=dropdown&v=core-1.9.2-ui-1.9.5" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Dropdown live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>用指针或键盘打开它；菜单通过场景覆盖层路径挂载。</figcaption>
</figure>

## 最小示例

```ts
import { Dropdown } from '@vectojs/ui';

const backend = new Dropdown(['Canvas', 'WebGL', 'WebGPU'], {
  width: 220,
  onChange: (value) => setBackend(value),
});
```

## 维护者检查清单

- 保持 `expanded`、`controls` 和 `activedescendant` 元数据同步。
- 在外部点击和按 Escape 时关闭覆盖层。
- 测试 ArrowUp、ArrowDown、Enter、Space 和 Escape。
