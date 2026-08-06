---
title: 'UI: ContextMenu'
description: 'Menú de comandos superpuesto con separadores, filas deshabilitadas, atajos y submenús anidados.'
order: 39
---

# `ContextMenu`

`ContextMenu` es un menú superpuesto para superficies de comandos.

Las versiones UI 1.11.1–1.11.3 hacen seguro el ciclo de vida de las cadenas anidadas: un único backdrop propiedad del menú raíz cierra o destruye toda la cadena, los menús ocultos no dejan superficies semánticas ni de puntero y cada menú raíz conserva una identidad estable para su backdrop. Un `pointerdown` exterior descarta la cadena de inmediato, mientras que la activación semántica mediante `click` sigue disponible para teclados y tecnologías de asistencia.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ContextMenu</span></div>
  <iframe src="/sandbox/ui/component.html?name=contextmenu&v=core-1.32.2-ui-2.13.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de ContextMenu" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## Accesibilidad y teclado

Cada elemento que no sea separador proyecta un punto de acceso `role="menuitem"` con un **tabindex flotante** (el menú es una parada de tabulación), `disabled` cuando corresponda, y `aria-haspopup="menu"` + `aria-expanded` en un padre de submenú.

| Tecla          | Acción                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| Abajo / Arriba | Siguiente / anterior elemento **habilitado**, con retorno; los separadores y elementos deshabilitados se omiten |
| Home / End     | Primer / último elemento habilitado                                                                             |
| Derecha        | Abrir un padre de submenú y enfocar su primer elemento                                                          |
| Izquierda      | Cerrar este submenú y devolver el foco a su menú padre                                                          |
| Enter / Space  | Activar (abrir un submenú, o disparar `onClick` y cerrar el árbol del menú)                                     |
| Escape         | Cerrar todo el árbol del menú                                                                                   |

Los puntos de acceso establecen `pointerEvents: 'none'` para que el menú mantenga su propio manejo de `pointerdown` por posición. Ver [Widgets compuestos](/reference/core-a11y/#widgets-compuestos-tabindex-flotante).

> **Mostrar un menú instala un backdrop de toda la escena.** Un menú raíz añade una entidad interactiva invisible del tamaño de la escena para capturar el clic externo que lo cierra. Ese backdrop intercepta eventos de puntero en toda la escena mientras el menú está abierto — así que no dejes un menú abierto en un fixture o prueba que también necesite arrastrar/seleccionar en otro lugar.

## Lista de verificación para mantenedores

- No dejes que el texto del menú desborde el panel.
- Mantén las filas deshabilitadas no interactivas.
- Reposiciona los submenús anidados a través de la raíz de superposición.
- Mantén el menú raíz como el único propietario del backdrop compartido y cierra la cadena completa de submenús por comando, pointerdown externo o destrucción.
