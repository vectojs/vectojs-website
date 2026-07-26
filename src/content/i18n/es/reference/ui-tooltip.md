---
title: 'UI: Tooltip'
description: 'Texto superpuesto activado por hover anclado a una entidad objetivo.'
order: 37
---

# `Tooltip`

`Tooltip` muestra un pequeño panel de texto cerca de un objetivo después de un retardo.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Tooltip</span></div>
  <iframe src="/sandbox/ui/component.html?name=tooltip&v=core-1.16.0-ui-2.1.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de Tooltip" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Pasa el ratón sobre el objetivo para verificar la colocación y el cierre.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { Button, Tooltip } from '@vectojs/ui';

const target = new Button('Pasa el ratón');
const tooltip = new Tooltip({
  target,
  content: 'Guardar archivo',
  placement: 'right',
});
```

## Lista de verificación para mantenedores

- Limpia los temporizadores pendientes al salir del puntero.
- Mantén el contenido del tooltip corto.
- Monta una vez; deja que el tooltip gestione su propio ciclo de vida de mostrar/ocultar.
