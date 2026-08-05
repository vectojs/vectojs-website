---
title: 'UI：ContextMenu'
description: '带分隔符、禁用行、快捷键和嵌套子菜单的覆盖层命令菜单。'
order: 39
---

# `ContextMenu`

`ContextMenu` 是用于命令表面的覆盖层菜单。

UI 1.11.1–1.11.3 让嵌套菜单链具备安全的生命周期：由根菜单拥有的单一 backdrop 会关闭或销毁整条菜单链，隐藏的菜单不会留下语义或指针命中表面，每个根菜单也拥有稳定的 backdrop 标识。外部 `pointerdown` 会立即关闭菜单，同时仍保留面向键盘和辅助技术的语义 `click` 激活。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ContextMenu</span></div>
  <iframe src="/sandbox/ui/component.html?name=contextmenu&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="ContextMenu live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>点击启动器以在受约束的视口内打开菜单。</figcaption>
</figure>

## 最小示例

```ts
import { ContextMenu } from '@vectojs/ui';

const menu = new ContextMenu({
  items: [
    { label: 'Copy', shortcut: 'Ctrl+C' },
    { separator: true },
    { label: 'Delete', disabled: true },
  ],
});

// `'contextmenu'` is not a VectoEvent — only pointerdown/up are dispatched
// into the tree. Filter `pointerdown` on the native right button (2), and
// pass the owning entity as the third arg so `showAtPoint` can find the
// scene even on the very first call (before any manual `scene.add(menu)`).
target.on('pointerdown', (event) => {
  const pointer = event.nativeEvent as PointerEvent | undefined;
  if (pointer?.button !== 2 || event.sceneX === undefined || event.sceneY === undefined) return;
  menu.showAtPoint(event.sceneX, event.sceneY, target);
});
```

## 无障碍与键盘

每个非分隔符项目都会投影一个 `role="menuitem"` 热点，带有**循环 tabindex**（菜单为一个制表位）、适用时的 `disabled`，以及子菜单父项上的 `aria-haspopup="menu"` + `aria-expanded`。

| 按键          | 操作                                                        |
| ------------- | ----------------------------------------------------------- |
| 下/上         | 下一个/上一个**已启用**的项目，循环；分隔符和禁用项目被跳过 |
| Home / End    | 第一个/最后一个已启用的项目                                 |
| 右            | 打开子菜单父项并聚焦其第一个项目                            |
| 左            | 关闭此子菜单并将焦点返回其父菜单                            |
| Enter / Space | 激活（打开子菜单，或触发 `onClick` 并关闭整个菜单树）       |
| Escape        | 关闭整个菜单树                                              |

热点设置 `pointerEvents: 'none'`，因此菜单保持其自身的按位置 `pointerdown` 命中处理。参见[复合组件](/reference/core-a11y/#复合组件漫游-tabindex)。

> **显示菜单会安装全场景 backdrop。** 根菜单添加一个不可见的、场景大小的交互实体来捕获关闭它的外部点击。该 backdrop 在菜单打开时拦截整个场景的指针事件——因此不要在需要拖拽/选择的夹具或测试中让菜单保持打开状态。

## 维护者检查清单

- 不要让菜单文本溢出面板。
- 保持禁用行不可交互。
- 通过覆盖层根重新定位嵌套的子菜单。
- 将根菜单作为共享 backdrop 的唯一所有者，并在命令、外部 pointerdown 或销毁时关闭完整的子菜单链。
