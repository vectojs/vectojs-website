---
title: 'UI: Stack'
description: 'Contenedor de diseño estructural para colocación vertical u horizontal de hijos.'
order: 21
---

# `Stack`

`Stack` posiciona los hijos secuencialmente a lo largo de un eje y se dimensiona a sí mismo según el contenido dispuesto.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Stack</span></div>
  <iframe src="/sandbox/ui/component.html?name=stack&v=core-1.17.1-ui-2.3.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de Stack" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Los hijos mantienen sus propios tamaños; `Stack` solo escribe sus `x` e `y` locales.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { Button, Stack, Text } from '@vectojs/ui';

const column = new Stack({ direction: 'vertical', gap: 12 });
column.add(new Text('Configuración de exportación'));
column.add(new Button('Guardar'));
scene.add(column.setPosition(24, 24));
```

## Lista de verificación para mantenedores

- Llama a `layout()` después de mutar directamente los tamaños de los hijos.
- Usa `align` para la colocación en el eje transversal.
- Usa `Flow` cuando el requisito principal sea el ajuste horizontal.
