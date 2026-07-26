---
title: 'UI: Toggle'
description: 'Control de interruptor con semántica role=switch y movimiento de muelle del pulsador.'
order: 26
---

# `Toggle`

`Toggle` es un control booleano tipo interruptor. Proyecta `role="switch"` y anima el pulsador con
el sistema de animación compartido.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Toggle</span></div>
  <iframe src="/sandbox/ui/component.html?name=toggle&v=core-1.16.3-ui-2.2.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de Toggle" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>El pulsador se reorienta suavemente mientras el estado semántico `checked` se mantiene actual.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { Toggle } from '@vectojs/ui';

const darkMode = new Toggle({
  checked: true,
  label: 'Modo oscuro',
  onChange: (checked) => setDarkMode(checked),
});
```

## Lista de verificación para mantenedores

- Mantén la animación del pulsador y el estado semántico alineados.
- Respeta el movimiento reducido a través del sistema de animación compartido.
- Prefiere `Checkbox` para opciones booleanas que no sean de interruptor.
