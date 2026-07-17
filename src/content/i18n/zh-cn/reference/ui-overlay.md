---
title: 'Overlay'
description: '用于 Tooltip、Popover 和 ContextMenu 的浮动 UI 图元，通过 Scene 覆盖层根挂载。'
order: 15
---

# Overlay

overlay 家族在正常实体树之上渲染临时 UI。覆盖层通过 `scene.overlayRoot` 挂载，因此它们可以逃离裁剪容器，同时仍然使用场景坐标和相同的动画系统。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Overlay</span></div>
  <iframe src="/sandbox/ui/overlay.html?v=core-1.9.2-ui-1.10.0" class="sandbox-frame component-demo-frame component-demo-frame-tall" loading="eager" title="Overlay live demo" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>悬停或点击启动器。Popover 和 ContextMenu 经过定位以避免在大型画廊中难以捕捉的溢出缺陷。</figcaption>
</figure>

## 最小示例

```ts
import { Button, Popover, Text } from '@vectojs/ui';

const target = new Button('Click · Popover').setPosition(40, 40);
const popover = new Popover({
  target,
  width: 220,
  height: 92,
  placement: 'right',
});

popover.add(new Text('Popover content').setPosition(14, 18));
scene.add(target);
scene.add(popover);
```

## 组件

| 组件          | 触发                            | 使用场景               |
| ------------- | ------------------------------- | ---------------------- |
| `Tooltip`     | 悬停目标，带可选延迟            | 轻量的解释性文本       |
| `Popover`     | 点击目标                        | 带子节点的小型临时面板 |
| `ContextMenu` | 通常是右键点击或点击            | 带分隔符/项的命令菜单  |
| `Overlay`     | 手动 `showAt()`/`showAtPoint()` | 自定义浮动组件         |

## 维护者检查清单

- 对于变换后的目标使用 `target.getWorldBounds()`。
- 将示例约束在视口或所演示的 card 边界内。
- 当临时 UI 的目标离开树时隐藏或销毁它。
- 保持覆盖层内容在底层控件之上清晰可读；使用足够不透明的背景。

相关：[`Button`](/reference/ui-button/)、[`ScrollView`](/reference/ui-components/#scrollview)、[`Modal`](/reference/ui-components/#modal)。
