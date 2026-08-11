+++
title = "UI：TreeView"
description = "支持预加载或懒加载子节点的层级树组件。"
weight = 34

[extra]
order = 34
+++

# `TreeView`

`TreeView` 渲染带展开状态的层级行，并可选支持懒加载子节点。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · TreeView</span></div>
  <iframe src="/sandbox/ui/component.html?name=treeview&v=core-1.34.0-ui-2.15.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="TreeView live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>点击父行以展开或折叠它们。</figcaption>
</figure>

## 最小示例

```ts
import { TreeView } from '@vectojs/ui';

const tree = new TreeView({
  width: 280,
  height: 360,
  nodes: [{ id: 'packages', label: 'packages', children: [{ id: 'ui', label: 'ui' }] }],
});
```

## 选项

| 选项                                           | 类型             | 默认值 | 说明                                                                                |
| ---------------------------------------------- | ---------------- | ------ | ----------------------------------------------------------------------------------- |
| `nodes`                                        | `TreeNode[]`     | —      | 根节点。节点的 `children` 可以是数组**或** `() => Promise<TreeNode[]>` 用于懒加载。 |
| `width` / `height`                             | `number`         | —      | 视口框。行被虚拟化到该框中。                                                        |
| `rowHeight`                                    | `number`         | `28`   | 行间距。                                                                            |
| `font`、`color`、`selectedColor`、`hoverColor` | `string`         | 主题   | 行绘制。                                                                            |
| `onSelect`                                     | `(node) => void` | —      | 叶节点被激活时触发。                                                                |
| `onExpand`                                     | `(node) => void` | —      | 父节点展开时触发。                                                                  |

`setNodes(nodes)` 替换树；展开/选择以节点 `id` 为键，因此稳定的 ID 可在替换时保留状态。

## 无障碍与键盘

`TreeView` 为每个**可见**行投影一个 `role="treeitem"`——一个透明的、可聚焦的热点池化在行上，携带 `aria-level`（深度）、行的 `aria-expanded`（仅父节点）、`aria-selected`，以及**循环 tabindex**，因此整个树是一个制表位。

| 按键          | 动作                                           |
| ------------- | ---------------------------------------------- |
| 下/上         | 移动到下一行/上一行                            |
| 右            | 展开折叠的父节点；如果已展开，进入第一个子节点 |
| 左            | 折叠展开的父节点；否则移动到父行               |
| Home / End    | 第一行/最后一行                                |
| Enter / Space | 激活（切换父节点，选择叶节点）                 |

活动行在焦点移动到它之前会滚动到视图中。由于只有可见行被池化，100k 节点的树仍然只投影 O(视口) 个节点。

热点设置 `pointerEvents: 'none'`，因此树保持其自身的鼠标处理（点击切换和拖拽滚动）——键盘焦点和 AT 合成的 `click` 仍然通过。参见[复合组件](/reference/core-a11y/#复合组件漫游-tabindex)。

## 指针与触摸

- **点击**行以切换/选择。切换在 `pointerup` 时触发，仅当指针移动少于约 6px 时——因此触摸拖拽不会意外展开它开始的行。
- **垂直拖拽**以滚动（行以 1:1 跟随手指），与 `ScrollView` / `VirtualList` 相同。
- **滚轮**滚动。

## 维护者检查清单

- 在展开、折叠或节点替换后重建行。
- 保持懒加载器幂等。
- 使用稳定的节点 ID 来维护选择和展开状态。
- 不要向行添加竞争的指针处理器：组件拥有点击与拖拽的歧义消除，且无障碍热点故意不捕获指针。
