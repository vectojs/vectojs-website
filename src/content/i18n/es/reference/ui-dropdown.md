---
title: 'UI: Dropdown'
description: 'Control de cuadro combinado con una lista superpuesta y navegación por teclado.'
order: 27
---

# `Dropdown`

`Dropdown` envuelve un botón de canvas, proyecta `role="combobox"` y abre una lista superpuesta.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Dropdown</span></div>
  <iframe src="/sandbox/ui/component.html?name=dropdown&v=core-1.9.2-ui-1.9.5" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de Dropdown" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Ábrelo con el puntero o el teclado; el menú se monta a través de la ruta de superposición de la escena.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { Dropdown } from '@vectojs/ui';

const backend = new Dropdown(['Canvas', 'WebGL', 'WebGPU'], {
  width: 220,
  onChange: (value) => setBackend(value),
});
```

## Lista de verificación para mantenedores

- Mantén los metadatos `expanded`, `controls` y `activedescendant` sincronizados.
- Cierra la superposición al hacer clic fuera y con Escape.
- Prueba ArrowUp, ArrowDown, Enter, Space y Escape.
