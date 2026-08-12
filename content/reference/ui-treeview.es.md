+++
title = "UI: TreeView"
description = "Componente de árbol jerárquico con carga perezosa o inmediata de hijos."
weight = 34
+++

# `TreeView`

`TreeView` renderiza filas jerárquicas con estado de expansión y carga perezosa opcional de hijos.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · TreeView</span></div>
  <iframe src="/sandbox/ui/component.html?name=treeview&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de TreeView" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Haz clic en las filas padre para expandirlas o contraerlas.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { TreeView } from '@vectojs/ui';

const tree = new TreeView({
  width: 280,
  height: 360,
  nodes: [
    {
      id: 'packages',
      label: 'paquetes',
      children: [{ id: 'ui', label: 'ui' }],
    },
  ],
});
```

## Opciones

| Opción                                         | Tipo             | Predeterminado | Notas                                                                                                            |
| ---------------------------------------------- | ---------------- | -------------- | ---------------------------------------------------------------------------------------------------------------- |
| `nodes`                                        | `TreeNode[]`     | —              | Nodos raíz. Los `children` de un nodo pueden ser un array **o** `() => Promise<TreeNode[]>` para carga diferida. |
| `width` / `height`                             | `number`         | —              | Caja del viewport. Las filas se virtualizan a ella.                                                              |
| `rowHeight`                                    | `number`         | `28`           | Paso de fila.                                                                                                    |
| `font`, `color`, `selectedColor`, `hoverColor` | `string`         | tema           | Pintado de filas.                                                                                                |
| `onSelect`                                     | `(node) => void` | —              | Se dispara cuando se activa una hoja.                                                                            |
| `onExpand`                                     | `(node) => void` | —              | Se dispara cuando se expande un padre.                                                                           |

`setNodes(nodes)` reemplaza el árbol; la expansión/selección se indexan por el `id` del nodo, por lo que IDs estables preservan el estado durante un reemplazo.

## Accesibilidad y teclado

`TreeView` proyecta un `role="treeitem"` por cada fila **visible** — un punto de acceso transparente y enfocable agrupado en la fila, con `aria-level` (profundidad), `aria-expanded` de la fila (solo padres), `aria-selected`, y un **tabindex flotante** para que todo el árbol sea una sola parada de tabulación.

| Tecla          | Acción                                                                   |
| -------------- | ------------------------------------------------------------------------ |
| Abajo / Arriba | Mover a la fila siguiente / anterior                                     |
| Derecha        | Expandir un padre colapsado; si ya está expandido, entrar al primer hijo |
| Izquierda      | Contraer un padre expandido; de lo contrario, ir a la fila padre         |
| Home / End     | Primera / última fila                                                    |
| Enter / Space  | Activar (alternar un padre, seleccionar una hoja)                        |

La fila activa se desplaza a la vista antes de que el foco se mueva a ella. Como solo las filas visibles se agrupan, un árbol de 100k nodos aún proyecta O(viewport) nodos.

Los puntos de acceso establecen `pointerEvents: 'none'` para que el árbol mantenga su propio manejo de ratón (toque para alternar y arrastrar para desplazar) — el foco de teclado y los `click` sintetizados por AT aún pasan. Ver [Widgets compuestos](/reference/core-a11y/#widgets-compuestos-tabindex-flotante).

## Puntero y toque

- **Toca** una fila para alternar/seleccionar. La alternancia se activa en `pointerup`, y solo si el puntero se movió menos de ~6px — así que un arrastre táctil no expande accidentalmente la fila donde comenzó.
- **Arrastra** verticalmente para desplazar (las filas siguen al dedo 1:1), igual que `ScrollView` / `VirtualList`.
- **Rueda** para desplazar.

## Lista de verificación para mantenedores

- Reconstruye las filas después de expansión, contracción o reemplazo de nodos.
- Mantén los cargadores perezosos idempotentes.
- Usa IDs de nodo estables para el estado de selección y expansión.
- No añadas un manejador de puntero competitivo a una fila: el componente posee la ambigüedad toque vs. arrastre, y los puntos de acceso de accesibilidad deliberadamente no capturan el puntero.
