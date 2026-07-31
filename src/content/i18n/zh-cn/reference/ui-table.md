---
title: 'UI：Table'
description: '用于紧凑数据预览和 Markdown 表格输出的 canvas 原生网格表格。'
order: 31
---

# `Table`

`Table` 投影完整的 `grid` › `row` › `gridcell`/`columnheader` 树，在 canvas 上绘制其外观，并将每个单元格作为子 Entity 拥有。字符串单元格被规范化为 `Text`；提供的 Entity 单元格可以通过公共的 `setMaxWidth()` 和 `setSelectable()` 能力参与其中。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Table</span></div>
  <iframe src="/sandbox/ui/component.html?name=table&v=core-1.18.0-ui-2.3.2" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Table live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>对列尺寸调整使用聚焦的演示，而不是在大型画廊中调试表格输出。</figcaption>
</figure>

## 最小示例

```ts
import { Table } from '@vectojs/ui';

const table = new Table({
  width: 520,
  headers: ['Component', 'Role'],
  rows: [
    ['Button', 'button'],
    ['Input', 'textbox'],
  ],
  selectable: true,
});
```

`layout()` 约束每个单元格，计算行/表高度，并在渲染前定位子元素。`render()` 仅用于绘制。在更改外部提供的 Entity 单元格后或在修改公共字符串数据后调用 `table.layout()`。每个逻辑单元格拥有一个内容投影，因此浏览器选择和页面内查找不会重复表格文本。

选择是单元格拥有的而非表格拥有的：字符串单元格规范化为可选择的 `Text`，提供的实体在受支持时接收 `setSelectable()`，Markdown 表格继承相同的约定。因此跨单元格的拖拽只复制一次逻辑单元格文本，而 Canvas 仍然是唯一的视觉渲染器。结构性的 `role="grid"` 影子不会从单元格投影捕获指针事件。这种叶子所有权正是让跨单元格拖拽选择、Ctrl/Command+C 和页面内查找与 VMT 文本恰好对齐一次的原因。

## 无障碍与键盘

投影的树是一个真实的 ARIA 网格：固定的 `columnheader` 行加上每个**可见**行一个 `row`（虚拟化感知），每个单元格是一个可聚焦的 `gridcell` 热点。恰好一个单元格持有**循环 tabindex**，因此整个网格是一个制表位。

| 按键                 | 动作                                          |
| -------------------- | --------------------------------------------- |
| 方向键               | 在 2D 中将聚焦的单元格移动一步（表头为行 -1） |
| Home / End           | 当前行的第一个/最后一个单元格                 |
| Ctrl+Home / Ctrl+End | 第一个表头单元格 / 最后一个主体单元格         |

目标单元格在焦点移动到它之前会滚动到视图中。参见[复合组件](/reference/core-a11y/#复合组件漫游-tabindex)。

## 指针与触摸

- **跨单元格拖拽**会原生选择它们的文本（单元格投影拥有指针——见上文）。
- **垂直拖拽**虚拟化主体时，以 1:1 的比例跟随手指滚动，因此表格可以在触摸屏上使用，而不仅仅通过滚轮。
- **滚轮**滚动虚拟化主体。

## 维护者检查清单

- 保持 `colWidths` 长度与 headers 对齐；有效宽度被规范化为 Table 宽度。
- 每个逻辑单元格使用唯一的 Entity 实例。
- 在单元格内容或尺寸变化后调用 `layout()`。
- 对大型数据集使用虚拟化；`Table` 用于紧凑网格。
- 保持网格标签具有描述性。
- 在更改宽度或应用缩放后，验证跨表头/主体单元格的拖拽选择。
- 更改虚拟化或列数后，验证键盘导航能到达每个单元格。
