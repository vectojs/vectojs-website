---
title: 'ThreeRenderer'
description: 'Usa Three.js como backend IRenderer para una escena de VectoJS: métodos implementados, la disposición del shader GLSL de gradientes y la advertencia sobre el grosor de línea.'
order: 43
---

# `ThreeRenderer`

Parte de [`@vectojs/three`](/reference/three/).

`ThreeRenderer` implementa la interfaz `IRenderer` de [`@vectojs/core`](/reference/core-renderer/) usando Three.js — los rellenos, trazos y texto se renderizan como mallas y líneas de Three.js en una escena ortográfica en lugar de operaciones de Canvas 2D. Úsalo cuando Three.js ya esté en tu proyecto y quieras que la propia escena de VectoJS se renderice con el pipeline WebGL en lugar de Canvas 2D.

## Cuándo usarlo

- Quieres que el contenido 2D de VectoJS se renderice como objetos de Three.js a través de un `THREE.WebGLRenderer` dedicado creado para el canvas proporcionado.
- Necesitas rellenos de gradiente acelerados por hardware respaldados por shaders GLSL.
- Estás realizando pruebas comparativas o experimentando con un pipeline 2D puro WebGL.

Para incrustar una UI 2D en una superficie 3D, prefiere [`ThreeAdapter`](/reference/three-adapter/) — no requiere que renuncies al renderizado Canvas 2D.

## Constructor

```ts
new ThreeRenderer(canvas: HTMLCanvasElement)
```

Crea:

- `THREE.WebGLRenderer` con `{ canvas, alpha: true, antialias: true }`
- `THREE.OrthographicCamera` con Y apuntando hacia abajo (top = 0, bottom = height) para coincidir con el sistema de coordenadas de VectoJS
- La relación de píxeles se establece automáticamente a `window.devicePixelRatio` y se **mantiene sincronizada** a medida que cambia en tiempo de ejecución (ver más abajo)

`ThreeRenderer` crea y posee este WebGLRenderer; no acepta ni reutiliza un renderizador/contexto existente. `dispose()` elimina los objetos activos, libera sus recursos de geometría/material/textura, reinicia las pilas y desecha el WebGLRenderer propio exactamente una vez. También desvincula los listeners de pérdida de contexto y DPR descritos a continuación, por lo que un renderizador desechado no puede ser resucitado por un evento tardío.

## Pérdida de contexto GPU y DPR en tiempo de ejecución

Un reinicio de GPU o una eliminación por presión de memoria dejaría una escena respaldada por Three permanentemente en blanco, y un cambio de monitor o zoom del navegador la dejaría renderizando con una relación de píxeles obsoleta (borrosa o con aliasing). `ThreeRenderer` maneja ambos:

- **`webglcontextlost`** se `preventDefault()` — obligatorio, o el navegador nunca
  dispara el evento de restauración — y activa `isContextLost()`. `present()` se convierte en
  un no-op mientras está perdido, ya que dibujar contra un contexto muerto es inútil.
- **`webglcontextrestored`** re-aplica la relación de píxeles y el tamaño (una restauración puede caer
  en un monitor diferente), limpia la bandera, y fuerza un redibujado del framebuffer
  recién limpiado. El `WebGLRenderer` de Three reconstruye su estado GL de forma perezosa en el
  siguiente renderizado.
- **Los cambios de DPR** se rastrean con una media query `(resolution: Ndppx)` que
  re-aplica `setPixelRatio` + `setSize` y se re-arma (la consulta es
  de un solo disparo).

Todo está protegido para SSR / `OffscreenCanvas` (sin `addEventListener` ni
`matchMedia`). `isContextLost()` también satisface el hook opcional
[`IRenderer`](/reference/core-renderer/#supervivencia-a-pérdida-de-contexto-gpu), por lo que
`Scene.render` omite el paso mientras el contexto no está disponible.

## Propiedades públicas

| Propiedad         | Tipo                       |
| ----------------- | -------------------------- |
| `scene`           | `THREE.Scene`              |
| `camera`          | `THREE.OrthographicCamera` |
| `renderer`        | `THREE.WebGLRenderer`      |
| `isContextLost()` | `() => boolean`            |

## Uso

Pasa el renderizador como la opción `renderer` al constructor de la `Scene` de VectoJS:

```ts
import { Scene } from '@vectojs/core';
import { ThreeRenderer } from '@vectojs/three';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const threeRenderer = new ThreeRenderer(canvas);

const scene = new Scene(canvas, { renderer: threeRenderer });
scene.add(/* entidades */);
scene.start();
```

## Métodos implementados de IRenderer

| Método                                                                                    | Notas                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beginPath()` `moveTo()` `lineTo()` `bezierCurveTo()` `closePath()` `arc()` `roundRect()` | Acumulación de trazados; se vacía en `fill()` o `stroke()`.                                                                                                                                        |
| `fill(colorOrGradient)`                                                                   | Rellenos sólidos mediante `MeshBasicMaterial`; gradientes mediante `ShaderMaterial` GLSL (ver más abajo). El alpha del color CSS multiplica el alpha heredado del renderer.                        |
| `stroke(colorOrGradient, lineWidth?)`                                                     | `LineBasicMaterial`. Ver la advertencia sobre el grosor de línea más abajo.                                                                                                                        |
| `fillText(text, x, y, font, color)`                                                       | Renderiza texto en un canvas fuera de pantalla, lo sube como `THREE.CanvasTexture`. Los gradientes recurren al primer color stop.                                                                  |
| `fillCircle(cx, cy, radius, color, alpha?)`                                               | `THREE.CircleGeometry` con 32 segmentos + `MeshBasicMaterial`.                                                                                                                                     |
| `drawImage(source, dx, dy, dw, dh)`                                                       | `THREE.CanvasTexture` + `PlaneGeometry`.                                                                                                                                                           |
| `save()` `restore()` `translate()` `scale()` `rotate()` `setGlobalAlpha()` `clip()`       | Pila de transformación/alpha; los clips anidados se intersectan. El recorte con scissor usa el AABB mundial transformado, por lo que un clip rotado/cizallado es una aproximación alineada a ejes. |
| `createLinearGradient(x0, y0, x1, y1, colorStops)`                                        | Devuelve un descriptor `WebGLGradient` consumido por `fill()`.                                                                                                                                     |
| `flush()`                                                                                 | Llama a `renderer.render(scene, camera)`.                                                                                                                                                          |
| `resize(width, height)`                                                                   | Actualiza `renderer.setSize()` y recalcula los límites de la cámara.                                                                                                                               |
| `clear()`                                                                                 | Desecha la geometría/materiales del fotograma y reinicia el estado del trazado, transformación, alpha y pila de scissor.                                                                           |

## Advertencia sobre el grosor de línea

`THREE.LineBasicMaterial.linewidth` es **ignorado silenciosamente por WebGL en la mayoría de las plataformas** — las líneas se limitan a 1 px independientemente del valor pasado a `stroke()`. Esta es una limitación del navegador/controlador de GPU, no una restricción de VectoJS.

Si tu diseño requiere trazos gruesos (> 1 px), considera:

- Usar `fill()` con un trazado rectangular en lugar de `stroke()` para líneas rectas.
- Cambiar a [`ThreeAdapter`](/reference/three-adapter/) con el `CanvasRenderer` predeterminado, que soporta anchos de línea arbitrarios mediante Canvas 2D.
- Integrar `THREE.MeshLine` manualmente en tu capa de aplicación — `ThreeRenderer` no incluye esta dependencia.

## Soporte de gradientes

`ThreeRenderer.createLinearGradient()` devuelve un descriptor `WebGLGradient`. Cuando se pasa a `fill()`, el renderizador compila un `ShaderMaterial` GLSL con la siguiente disposición de uniformes:

```glsl
uniform vec4 u_grad_colors[8];  // RGBA por stop
uniform float u_grad_stops[8];  // posición normalizada [0, 1]
uniform vec2 u_grad_start;      // punto de inicio en espacio mundial
uniform vec2 u_grad_end;        // punto de fin en espacio mundial
```

El color se interpola linealmente entre los dos stops más cercanos en espacio mundial. Si se proporcionan más de 8 stops, se remuestrean a 8 puntos espaciados uniformemente antes de la subida — el detalle de color más allá de 8 stops se pierde.

**Los gradientes no son compatibles con `stroke()` o `fillText()`.** Pasar un `WebGLGradient` a `stroke()` recurre al color del primer stop. `fillText()` también recurre al color del primer stop porque los glifos de texto se rasterizan mediante Canvas 2D antes de la subida.

Consulta la [página principal de `@vectojs/three`](/reference/three/#solución-de-problemas) para solucionar problemas de gradiente/DPR/puntero.

## Relacionados

[`ThreeAdapter`](/reference/three-adapter/) (el caso de uso alternativo — un panel 2D sobre una superficie 3D) ·
[`IRenderer` / `CanvasRenderer`](/reference/core-renderer/) (la interfaz que esto implementa) ·
[`@vectojs/three` visión general](/reference/three/)
