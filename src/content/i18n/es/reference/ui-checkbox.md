---
title: 'UI: Checkbox'
description: 'Control de casilla de verificación con semántica de input nativa y estado visual en canvas.'
order: 25
---

# `Checkbox`

`Checkbox` proyecta un input de casilla de verificación real y pinta el estado visual en el canvas.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Checkbox</span></div>
  <iframe src="/sandbox/ui/component.html?name=checkbox&v=core-1.32.3-ui-2.13.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de Checkbox" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Los clics en el canvas y los cambios del input nativo comparten la misma ruta `change`.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { Checkbox } from '@vectojs/ui';

const enabled = new Checkbox({
  checked: true,
  label: 'Habilitar proyección semántica',
  onChange: (checked) => setEnabled(checked),
});
```

## Lista de verificación para mantenedores

- Mantén `checked` y el estado del input proyectado sincronizados.
- Llama a `scene.markDirty()` cuando el estado visual cambie.
- Usa una etiqueta a menos que el contexto circundante ya nombre el control.
