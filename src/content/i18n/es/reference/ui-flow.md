---
title: 'UI: Flow'
description: 'Contenedor de diseño horizontal con ajuste para chips, etiquetas y barras de herramientas responsivas.'
order: 22
---

# `Flow`

`Flow` es un `Stack` preconfigurado para ajuste horizontal.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Flow</span></div>
  <iframe src="/sandbox/ui/component.html?name=flow&v=core-1.30.0-ui-2.12.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de Flow" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Usa `maxWidth` para definir dónde los hijos se ajustan a la siguiente línea.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { Button, Flow } from '@vectojs/ui';

const chips = new Flow({ gap: 8, maxWidth: 360 });
for (const label of ['Canvas', 'WebGL', 'WebGPU']) {
  chips.add(new Button(label, { padding: 8 }));
}
```

## Lista de verificación para mantenedores

- Vuelve a ejecutar `layout()` después de cambios en el tamaño de los hijos.
- Mantén los objetivos táctiles de los chips lo suficientemente grandes para móviles.
- Prefiere `Flow` sobre la colocación manual x/y para filas de etiquetas.
