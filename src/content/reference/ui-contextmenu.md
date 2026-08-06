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
  <iframe src="/sandbox/ui/component.html?name=contextmenu&v=core-1.32.2-ui-2.13.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="ContextMenu live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## Accessibility & keyboard

Each non-separator item projects a `role="menuitem"` hotspot with a **roving
tabindex** (the menu is one tab stop), `disabled` where applicable, and
`aria-haspopup="menu"` + `aria-expanded` on a submenu parent.

| Key           | Action                                                                                |
| ------------- | ------------------------------------------------------------------------------------- |
| Down / Up     | Next / previous **enabled** item, wrapping; separators and disabled items are skipped |
| Home / End    | First / last enabled item                                                             |
| Right         | Open a submenu parent and focus its first item                                        |
| Left          | Close this submenu and return focus to its parent menu                                |
| Enter / Space | Activate (open a submenu, or fire `onClick` and close the tree)                       |
| Escape        | Close the whole menu tree                                                             |

The hotspots set `pointerEvents: 'none'` so the menu keeps its own
`pointerdown`-by-position hit handling. See
[Composite widgets](/reference/core-a11y/#composite-widgets-roving-tabindex).

> **Showing a menu installs a full-scene backdrop.** A root menu adds an
> invisible, scene-sized interactive entity to catch the outside click that
> dismisses it. That backdrop intercepts pointer events across the whole scene
> while the menu is open — so don't leave a menu open in a fixture or test that
> also needs to drag/select elsewhere.

## Maintainer checklist

- Do not let menu text overflow the panel.
- Keep disabled rows non-interactive.
- Reposition nested submenus through the overlay root.
- Keep the root menu as the sole owner of the shared backdrop and close the
  complete submenu chain on command, outside pointerdown, or destruction.
