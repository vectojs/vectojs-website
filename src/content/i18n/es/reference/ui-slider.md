---
title: 'Slider'
description: 'Componente de deslizador en canvas que expone el contrato WAI-ARIA de slider y se repinta suavemente en escenas on-demand.'
order: 13
---

# `Slider`

`Slider` es un control de rango impulsado por puntero. Pinta la pista, el progreso y el pulgar en el canvas, mientras
expone `role="slider"` con metadatos `valuemin`, `valuemax` y `value` en vivo.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Slider</span></div>
  <iframe src="/sandbox/ui/slider.html?v=core-1.18.0-ui-2.3.2" class="sandbox-frame component-demo-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de Slider" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>Arrastra el pulgar y observa cómo la etiqueta y la barra de progreso se actualizan desde el mismo evento de cambio.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { Slider, Text } from '@vectojs/ui';

const label = new Text('Calidad: 64%');
const slider = new Slider({
  min: 0,
  max: 100,
  value: 64,
  width: 320,
  onChange(value) {
    label.setText(`Calidad: ${value}%`);
    scene.markDirty();
  },
});
```

## Constructor

```ts
new Slider({
  label?: string;            // accessible name — set this
  min?: number;              // default 0
  max?: number;              // default 100
  value?: number;            // default min
  width?: number;            // default 200
  height?: number;           // default 24
  trackColor?: string;
  progressColor?: string;
  handleColor?: string;
  onChange?: (value: number) => void;
})
```

> **Establece `label`.** Un `role=\"slider\"` sin nombre accesible se anuncia como simple "slider", sin decirle al usuario del lector de pantalla nada sobre lo que controla (WCAG 4.1.2). Cualquier etiqueta visual que dibujes en el canvas no llega a la capa semántica, así que pásala aquí también. Omitir `label` deja `aria-label` sin establecer en lugar de derivar un nombre del valor — un nombre incorrecto es peor que uno ausente. Disponible desde `@vectojs/ui@2.2.0`.

## Eventos

`Slider` emite `change` con `{ value }` después de que la entrada del puntero cambie el valor redondeado. Eventos
de puntero repetidos en el mismo valor no emiten cambios duplicados.

## Lista de verificación para mantenedores

- Las actualizaciones de puntero deben limitar la X local a `[0,width]`.
- Los cambios de valor deben llamar a `scene.markDirty()` para que `renderMode = 'onDemand'` se mantenga fluido.
- Mantén los metadatos del rol sincronizados con el valor actual.

Relacionado: [`ProgressBar`](/reference/ui-components/#progressbar), [`Input`](/reference/ui-components/#input), [`Button`](/reference/ui-button/).
