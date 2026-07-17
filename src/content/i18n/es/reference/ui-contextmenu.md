---
title: 'UI: ContextMenu'
description: 'Menú de comandos superpuesto con separadores, filas deshabilitadas, atajos y submenús anidados.'
order: 39
---

# `ContextMenu`

`ContextMenu` es un menú superpuesto para superficies de comandos.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ContextMenu</span></div>
  <iframe src="/sandbox/ui/component.html?name=contextmenu&v=core-1.9.2-ui-1.10.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de ContextMenu" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Haz clic en el lanzador para abrir el menú dentro de un viewport limitado.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { ContextMenu } from '@vectojs/ui';

const menu = new ContextMenu({
  items: [
    { label: 'Copiar', shortcut: 'Ctrl+C' },
    { separator: true },
    { label: 'Eliminar', disabled: true },
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

## Lista de verificación para mantenedores

- No dejes que el texto del menú desborde el panel.
- Mantén las filas deshabilitadas no interactivas.
- Reposiciona los submenús anidados a través de la raíz de superposición.
