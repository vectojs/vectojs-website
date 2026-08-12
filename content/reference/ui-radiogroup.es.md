+++
title = "UI: RadioGroup"
description = "Opciones de radio mutuamente excluyentes renderizadas como un componente de canvas."
weight = 28
+++

# `RadioGroup`

`RadioGroup` renderiza un conjunto de opciones mutuamente excluyentes y expone un rol semántico a nivel de grupo.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · RadioGroup</span></div>
  <iframe src="/sandbox/ui/component.html?name=radiogroup&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de RadioGroup" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

`RadioGroup` proyecta `{ role: 'radiogroup', label }`. Desde 2.8.0, el nombre accesible del grupo es configurable, con el genérico `'Radio group'` como predeterminado:

```ts
new RadioGroup({
  label: 'Render backend',
  options: [
    { value: 'canvas', label: 'Canvas' },
    { value: 'webgl', label: 'WebGL' },
  ],
});
```

Cada opción lleva su propio nombre, pero es el nombre del grupo el que dice _qué elección se está haciendo_. En una pantalla con más de un grupo, el valor predeterminado deja al usuario de lector de pantalla escuchando "Radio group" repetidamente sin forma de distinguirlos — establécelo siempre que el encabezado visual que identifica al grupo se dibuje en el canvas en lugar de ser parte del grupo (WCAG 4.1.2). También se puede establecer después de la construcción como campo público.

## Lista de verificación para mantenedores

- Mantén el estado visual seleccionado y el valor emitido alineados.
- Usa el estilo y comportamiento deshabilitado juntos.
- Recalcula el diseño cuando cambien las etiquetas, la fuente o la dirección.
