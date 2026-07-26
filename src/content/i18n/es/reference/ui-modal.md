---
title: 'UI: Modal'
description: 'Componente de superposición bloqueante con una card, fondo y animación de entrada/salida con muelle.'
order: 36
---

# `Modal`

`Modal` se monta en la capa de superposición, bloquea los eventos del puntero subyacentes y anima su card de entrada y
salida.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Modal</span></div>
  <iframe src="/sandbox/ui/component.html?name=modal&v=core-1.16.0-ui-2.1.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de Modal" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Abre el modal, luego ciérralo con el botón de cierre renderizado en canvas.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { Button, Modal } from '@vectojs/ui';

const open = new Button('Abrir modal', {
  onClick: () => {
    scene.showOverlay(
      new Modal('Exportación completa', { width: scene.width, height: scene.height }),
    );
  },
});
```

## Lista de verificación para mantenedores

- Ajusta el tamaño del fondo del modal a las dimensiones de la escena.
- Mantén el comportamiento de cierre explícito.
- Verifica el comportamiento de movimiento reducido y el manejo del foco antes del uso generalizado.
