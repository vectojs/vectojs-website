---
title: 'UI: Image'
description: 'Componente de imagen en canvas con renderizado de placeholder y proyección semántica de img.'
order: 19
---

# `Image`

`Image` dibuja un mapa de bits cargado asíncronamente en el canvas y proyecta un nodo `<img>` semántico.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Image</span></div>
  <iframe src="/sandbox/ui/component.html?name=image&v=core-1.9.2-ui-1.9.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de Image" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>El placeholder se pinta hasta que la devolución de llamada de carga de la imagen marca la escena como sucia.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { Image } from '@vectojs/ui';

const logo = new Image('/logo.svg', {
  width: 160,
  height: 80,
  alt: 'Logo de Vecto',
  onLoad: () => scene.markDirty(),
});
```

## Lista de verificación para mantenedores

- Proporciona siempre `width` y `height`.
- Proporciona texto `alt` significativo para imágenes no decorativas.
- En escenas `onDemand`, llama a `scene.markDirty()` desde `onLoad`.
