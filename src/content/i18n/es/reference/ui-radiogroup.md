---
title: 'UI: RadioGroup'
description: 'Opciones de radio mutuamente excluyentes renderizadas como un componente de canvas.'
order: 28
---

# `RadioGroup`

`RadioGroup` renderiza un conjunto de opciones mutuamente excluyentes y expone un rol semántico a nivel de grupo.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · RadioGroup</span></div>
  <iframe src="/sandbox/ui/component.html?name=radiogroup&v=core-1.17.0-ui-2.2.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de RadioGroup" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>La demostración cambia entre diseño horizontal y vertical en anchos estrechos.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { RadioGroup } from '@vectojs/ui';

const renderer = new RadioGroup({
  value: 'webgpu',
  direction: 'horizontal',
  options: [
    { value: 'canvas', label: 'Canvas' },
    { value: 'webgl', label: 'WebGL' },
    { value: 'webgpu', label: 'WebGPU' },
  ],
});
```

## Lista de verificación para mantenedores

- Mantén el estado visual seleccionado y el valor emitido alineados.
- Usa el estilo y comportamiento deshabilitado juntos.
- Recalcula el diseño cuando cambien las etiquetas, la fuente o la dirección.
