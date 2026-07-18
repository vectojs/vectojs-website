---
title: 'UI: ContextMenu'
description: 'Overlay command menu with separators, disabled rows, shortcuts, and nested submenus.'
order: 39
---

# `ContextMenu`

`ContextMenu` is an overlay menu for command surfaces.

UI 1.11.1–1.11.3 made nested chains lifecycle-safe: one root-owned backdrop
closes or destroys the complete chain, hidden menus leave neither a semantic
nor pointer hit surface behind, and each root menu owns a stable backdrop
identity. Outside `pointerdown` dismisses immediately, while semantic `click`
activation remains available to keyboards and assistive technology.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ContextMenu</span></div>
  <iframe src="/sandbox/ui/component.html?name=contextmenu&v=core-1.11.1-ui-1.11.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="ContextMenu live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## Maintainer checklist

- Do not let menu text overflow the panel.
- Keep disabled rows non-interactive.
- Reposition nested submenus through the overlay root.
- Keep the root menu as the sole owner of the shared backdrop and close the
  complete submenu chain on command, outside pointerdown, or destruction.
