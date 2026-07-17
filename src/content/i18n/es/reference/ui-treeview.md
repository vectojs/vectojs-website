---
title: 'UI: TreeView'
description: 'Componente de árbol jerárquico con carga perezosa o inmediata de hijos.'
order: 34
---

# `TreeView`

`TreeView` renderiza filas jerárquicas con estado de expansión y carga perezosa opcional de hijos.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · TreeView</span></div>
  <iframe src="/sandbox/ui/component.html?name=treeview&v=core-1.9.2-ui-1.10.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de TreeView" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Haz clic en las filas padre para expandirlas o contraerlas.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { TreeView } from '@vectojs/ui';

const tree = new TreeView({
  width: 280,
  height: 360,
  nodes: [{ id: 'packages', label: 'paquetes', children: [{ id: 'ui', label: 'ui' }] }],
});
```

## Lista de verificación para mantenedores

- Reconstruye las filas después de expansión, contracción o reemplazo de nodos.
- Mantén los cargadores perezosos idempotentes.
- Usa IDs de nodo estables para el estado de selección y expansión.
