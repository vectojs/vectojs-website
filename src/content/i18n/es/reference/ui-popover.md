---
title: 'UI: Popover'
description: 'Panel superpuesto activado por clic que puede contener hijos arbitrarios de VectoJS.'
order: 38
---

# `Popover`

`Popover` se alterna al hacer clic en el objetivo y puede contener cualquier entidad hija de VectoJS.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Popover</span></div>
  <iframe src="/sandbox/ui/component.html?name=popover&v=core-1.25.0-ui-2.6.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de Popover" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Haz clic en el objetivo dos veces para abrir y cerrar el popover.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { Button, Popover, Text } from '@vectojs/ui';

const target = new Button('Abrir');
const popover = new Popover({
  target,
  width: 220,
  height: 92,
  placement: 'right',
});
popover.add(new Text('Contenido del popover').setPosition(14, 20));
```

## Lista de verificación para mantenedores

- Mantén el panel legible sobre los controles subyacentes.
- Limita la colocación a través de los límites de `Overlay`.
- Oculta o elimina los popovers cuando su objetivo sale del árbol.
