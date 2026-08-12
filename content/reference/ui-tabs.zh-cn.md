+++
title = "UI：Tabs"
description = "挂载活动内容视图的选项卡面板容器。"
weight = 29
+++

# `Tabs`

`Tabs` 绘制一个选项卡栏，并只挂载活动选项卡的内容实体。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Tabs</span></div>
  <iframe src="/sandbox/ui/component.html?name=tabs&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Tabs live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>切换选项卡会从实体树中移除非活动内容。</figcaption>
</figure>

## 最小示例

```ts
import { Tabs, Text } from '@vectojs/ui';

const tabs = new Tabs({
  width: 480,
  height: 260,
  tabs: [
    { id: 'usage', label: 'Usage', content: new Text('Usage panel') },
    { id: 'api', label: 'API', content: new Text('API panel') },
  ],
});
```

## 隐藏单个标签页的标签栏

编辑器以及终端风格的应用程序通常需要 Vim 的 `showtabline=1` 行为：仅存在一个标签页时不显示标签栏。传入 `autoHideTabBar: true`（需要 `@vectojs/ui` >= 1.9.5）——标签栏（及其指针点击区域）在少于两个标签页时消失，内容占据全部高度，一旦添加第二个标签页，标签栏即刻恢复。在标签栏周围布局兄弟元素的拥有者应读取实时的 `effectiveTabBarHeight` 获取器，而不是假设 `tabHeight`。

```ts
const tabs = new Tabs({
  width: 480,
  height: 260,
  autoHideTabBar: true,
  tabs: [{ id: 'only', label: 'untitled', content: editorView }],
});
tabs.effectiveTabBarHeight; // 0 now, tabHeight once a second tab opens
```

`Tabs` 投影 `{ role: 'tablist', label }`。自 2.8.0 起，标签栏的可访问名称可设置，默认为 `'Tab switching panel'`：

```ts
new Tabs({
  label: 'Inspector sections',
  width: 480,
  height: 240,
  tabs: [
    { id: 'usage', label: 'Usage', content: usagePanel },
    { id: 'api', label: 'API', content: apiPanel },
  ],
});
```

理由与 [`RadioGroup`](/reference/ui-radiogroup/) 相同：每个标签都有自己的名称，但标签栏的名称才能说明标签_在切换什么_。只要屏幕上有不止一个标签栏，或者标识标签组的标题绘制在 canvas 上，就应该设置它（WCAG 4.1.2）。

## 维护者检查清单

- 保持选项卡内容尺寸与容器尺寸同步。
- 仅在活动选项卡实际变化时发出 `change`。
- 在未来的选项卡级语义中保留键盘/焦点行为。
