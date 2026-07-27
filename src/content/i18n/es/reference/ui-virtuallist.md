---
title: 'UI: VirtualList'
description: 'Lista de desplazamiento virtualizada que solo monta las filas visibles más un sobremuestreo.'
order: 33
---

# `VirtualList`

`VirtualList` renderiza solo la ventana visible de un array largo de elementos. Úsalo para listas grandes donde
el montaje regular de hijos desperdiciaría trabajo.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · VirtualList</span></div>
  <iframe src="/sandbox/ui/component.html?name=virtuallist&v=core-1.18.0-ui-2.3.2" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de VirtualList" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>La demostración tiene 120 elementos, pero solo las filas visibles más el sobremuestreo están montadas.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { Text, VirtualList } from '@vectojs/ui';

const list = new VirtualList({
  items,
  width: 360,
  height: 400,
  estimatedRowHeight: 32,
  renderItem: (item) => new Text(item.label),
});
```

## Lista de verificación para mantenedores

- Proporciona un `estimatedRowHeight` realista.
- Mantén las entidades de fila económicas y autocontenidas.
- Usa `setItems()` al reemplazar el conjunto de datos completo.
