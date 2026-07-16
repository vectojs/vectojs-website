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
  <iframe src="/sandbox/ui/component.html?name=contextmenu&v=core-1.9.2-ui-1.9.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de ContextMenu" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

target.on('contextmenu', (event) => menu.showAtPoint(event.globalX, event.globalY));
```

## Lista de verificación para mantenedores

- No dejes que el texto del menú desborde el panel.
- Mantén las filas deshabilitadas no interactivas.
- Reposiciona los submenús anidados a través de la raíz de superposición.
