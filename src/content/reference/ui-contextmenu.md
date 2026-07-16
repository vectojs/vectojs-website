---
title: 'UI: ContextMenu'
description: 'Overlay command menu with separators, disabled rows, shortcuts, and nested submenus.'
order: 39
---

# `ContextMenu`

`ContextMenu` is an overlay menu for command surfaces.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ContextMenu</span></div>
  <iframe src="/sandbox/ui/component.html?name=contextmenu&v=core-1.9.0-ui-1.9.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="ContextMenu live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Click the launcher to open the menu inside a constrained viewport.</figcaption>
</figure>

## Minimal example

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

## Maintainer checklist

- Do not let menu text overflow the panel.
- Keep disabled rows non-interactive.
- Reposition nested submenus through the overlay root.
