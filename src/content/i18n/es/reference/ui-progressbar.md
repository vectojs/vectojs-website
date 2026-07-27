---
title: 'UI: ProgressBar'
description: 'Indicador de progreso en canvas con etiqueta de porcentaje opcional y semántica de progressbar.'
order: 30
---

# `ProgressBar`

`ProgressBar` pinta una pista, un acento relleno y texto de porcentaje opcional.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ProgressBar</span></div>
  <iframe src="/sandbox/ui/component.html?name=progressbar&v=core-1.18.0-ui-2.3.2" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de ProgressBar" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Usa `setValue()` para fijar y repintar los cambios de progreso.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { ProgressBar } from '@vectojs/ui';

const progress = new ProgressBar({
  value: 0.72,
  width: 320,
  height: 22,
  showText: true,
});

progress.setValue(0.9);
```

## Lista de verificación para mantenedores

- Limita los valores a `[0, 1]`.
- Acompaña el color de progreso con texto o valor semántico.
- Llama a `scene.markDirty()` cuando el valor cambie.
