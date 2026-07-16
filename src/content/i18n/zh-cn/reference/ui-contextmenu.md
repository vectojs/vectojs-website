---
title: 'UI：ContextMenu'
description: '带分隔符、禁用行、快捷键和嵌套子菜单的覆盖层命令菜单。'
order: 39
---

# `ContextMenu`

`ContextMenu` 是用于命令表面的覆盖层菜单。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ContextMenu</span></div>
  <iframe src="/sandbox/ui/component.html?name=contextmenu&v=core-1.9.0-ui-1.9.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="ContextMenu live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

target.on('contextmenu', (event) => menu.showAtPoint(event.globalX, event.globalY));
```

## 维护者检查清单

- 不要让菜单文本溢出面板。
- 保持禁用行不可交互。
- 通过覆盖层根重新定位嵌套的子菜单。
