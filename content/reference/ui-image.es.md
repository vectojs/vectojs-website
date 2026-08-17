+++
title = "UI: Image"
description = "Componente de imagen en canvas con renderizado de placeholder y proyección semántica de img."
weight = 19
+++

# `Image`

`Image` dibuja un mapa de bits cargado asíncronamente en el canvas y proyecta un nodo `<img>` semántico.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Image</span></div>
  <iframe src="/sandbox/ui/component.html?name=image&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de Image" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## Ajuste, recorte focal y esquinas redondeadas

`fit` controla cómo se asigna el bitmap cargado a la caja de `width` × `height`, y `focalPoint` refina el recorte de `'cover'` — ambos desde 2.18.0+.

| `fit`       | Comportamiento                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| `'fill'`    | Estira a la caja (predeterminado, comportamiento heredado).                                           |
| `'cover'`   | Conserva la relación de aspecto, llena la caja y recorta el desbordamiento alrededor de `focalPoint`. |
| `'contain'` | Conserva la relación de aspecto y ajusta todo el bitmap dentro de la caja (centrado).                 |

`focalPoint` es `{ x, y }` con cada eje en `0..1` — `0` es arriba/izquierda, `1` es abajo/derecha, predeterminado `{ x: 0.5, y: 0.5 }`; solo `'cover'` lo lee, y los valores fuera de `[0, 1]` se limitan. `radius` ahora redondea las esquinas del bitmap cargado, no solo del placeholder, por lo que un avatar redondeado con `fit: 'cover'` recorta el desbordamiento recortado a la misma silueta.

```ts
import { Image, type ImageFit, type ImageFocalPoint } from '@vectojs/ui';

const avatar = new Image('/avatar.jpg', {
  width: 96,
  height: 96,
  fit: 'cover',
  focalPoint: { x: 0.5, y: 0.25 }, // bias toward the top of the frame
  radius: 48, // circle-crop the loaded bitmap
  alt: 'Profile photo',
});
```

## Lista de verificación para mantenedores

- Proporciona siempre `width` y `height`.
- Proporciona texto `alt` significativo para imágenes no decorativas.
- En escenas `onDemand`, llama a `scene.markDirty()` desde `onLoad`.
- El objeto de opciones es **obligatorio** — `new Image(src)` sin opciones lanza una excepción.
- Un `src` de origen cruzado (p. ej. un SVG de un CDN sin cabeceras CORS) contamina el canvas y rompe cada `getImageData`/`toDataURL` posterior. Inserta el recurso como una URL `data:image/svg+xml` para un dibujo seguro en el mismo origen.
