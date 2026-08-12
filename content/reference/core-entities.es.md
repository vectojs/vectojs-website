+++
title = "Otras entidades"
description = "Primitivas de forma Rect/Circle/Group, más SplineEntity (renderizado de curvas de vectomancy), DOMPortalEntity (proyectar un elemento DOM real en la escena) y SVGEntity (blitting SVG rasterizado) desde el punto de entrada principal de @vectojs/core."
weight = 8
+++

# Otras entidades (desde `.`)

Parte de [`@vectojs/core`](/reference/core-api/).

## Rect, Circle, Group (primitivas)

_Añadido en `@vectojs/core` 1.9.0._ Tres entidades listas para instanciar para que una
caja simple, un punto o un contenedor de transformación ya no necesiten una subclase
personalizada de [`Entity`](/reference/core-entity/).

```ts
import { Rect, Circle, Group } from '@vectojs/core';

const box = new Rect({ width: 120, height: 64, fill: '#38bdf8', radius: 8 });
const dot = new Circle({ radius: 24, fill: '#f97316' });
const toolbar = new Group(saveBtn, undoBtn, redoBtn); // contenedor solo de transformación
toolbar.set({ x: 20, y: 20 });
scene.add(box, dot, toolbar); // add() variádico
```

**`Rect`** — rectángulo alineado a los ejes desde `(0,0)` local hasta `(width, height)`.

| `RectOptions` | Por defecto | Efecto                                                                |
| ------------- | ----------- | --------------------------------------------------------------------- |
| `width`       | `0`         | Ancho local; coincide con la caja de entidad/a11y.                    |
| `height`      | `0`         | Alto local.                                                           |
| `fill`        | `'#38bdf8'` | Relleno CSS, o `null` para ninguno (el `null` explícito se preserva). |
| `stroke`      | `null`      | Trazo CSS, o `null` para ninguno.                                     |
| `strokeWidth` | `1`         | Ancho del trazo (unidades locales).                                   |
| `radius`      | `0`         | Radio de esquina uniforme; `0` = esquinas rectas.                     |

Un `Rect` con relleno sólido, esquinas rectas y sin trazo opta por el camino rápido
WebGL de rects instanciados (`getBatchRect`, solo con `pointBackend: 'webgl'`);
cualquier trazo o radio de esquina se renderiza a través del camino Canvas exacto.

**`Circle`** — disco centrado en su origen local `(0,0)`. Su caja sombra a11y
es el cuadrado delimitador desplazado por `-radius` para que cubra el disco dibujado.

| `CircleOptions` | Por defecto | Efecto                                                       |
| --------------- | ----------- | ------------------------------------------------------------ |
| `radius`        | `0`         | Radio (unidades locales). El asignador resincroniza la caja. |
| `fill`          | `'#38bdf8'` | Relleno CSS, o `null` para ninguno.                          |
| `stroke`        | `null`      | Trazo CSS, o `null` para ninguno.                            |
| `strokeWidth`   | `1`         | Ancho del trazo (unidades locales).                          |

Un `Circle` con relleno sólido y sin trazo opta por el camino rápido de lote de puntos
(`getBatchCircle`); un círculo con trazo se renderiza a través del camino Canvas exacto.

**`Group`** — un contenedor solo de transformación: no dibuja nada y es invisible para
el hit-testing (`isPointInside` devuelve `false`), existiendo solo para componer una
transformación (`x`/`y`/`scale`/`rotation`/`opacity`) sobre sus hijos. El hit-test de la
escena recurre primero a los hijos, por lo que ellos siguen siendo independientemente interactivos.
Pasa los hijos en línea: `new Group(a, b, c)`.

Ver también [`Entity.set()`](/reference/core-entity/) y [`add()`](/reference/core-entity/)
variádico — los ayudantes ergonómicos con los que estas primitivas están diseñadas para usarse.

## SplineEntity + loadSpline

```ts
loadSpline(url: string): Promise<SplineDocument>     // obtiene + analiza un Spline JSON de vectomancy (navegador)
new SplineEntity(doc: SplineDocument, opts?: SplineOptions)
polySegmentToBezier(seg: SplineSegment): BezierControlPoints
```

Renderiza documentos nativos `Spline`/`Polyline` cúbicos por tramos de vectomancy. Los límites
provienen de `bounding_box` (o se calculan desde los puntos finales de los segmentos), por lo que participa
en el recorte por viewport.

| `SplineOptions` | Por defecto | Efecto                                                                                                   |
| --------------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| `lineWidth`     | `2`         | Ancho del trazo (unidades locales).                                                                      |
| `cache`         | `true`      | Hornear en un `OffscreenCanvas` una vez y copiar cada fotograma (trazado Bézier por fotograma sin él).   |
| `defaultColor`  | `'#e2e8f0'` | Se usa cuando el `color_rgb` de una ecuación es `null`.                                                  |
| `hitTest`       | `'curve'`   | `'curve'` = preciso (dentro de `lineWidth/2 + hitTolerance` de una curva); `'aabb'` = caja delimitadora. |
| `hitTolerance`  | `0`         | Margen de selección extra en modo `'curve'`.                                                             |

Público: `doc`, `lineWidth`, `defaultColor`, `hitTolerance`, `showBounds`
(default `false`, dibuja un contorno de depuración). `SplineColor` es `[r,g,b]` (0–1), un
descriptor de gradiente lineal, o `null`.

**`SplineEquation`** — una curva (un color de trazo) en un `SplineDocument`, compuesta por segmentos polinómicos cúbicos consecutivos:

```ts
interface SplineEquation {
  color_rgb: SplineColor; // stroke color: [r,g,b] (0-1) | gradient | null
  data: SplineSegment[]; // one segment per piecewise-cubic run
}

interface SplineSegment {
  start_t: number; // t at segment start, [0,1]
  end_t: number; // t at segment end, [0,1]
  x_poly: number[]; // x(t) = [a,b,c,d] coefficients
  y_poly: number[]; // y(t) = [a,b,c,d] coefficients
}
```

Los `x_poly`/`y_poly` de un segmento contienen los coeficientes polinómicos de `f(t) = a + b·t + c·t² + d·t³` en `t ∈ [start_t, end_t]`. Para inspeccionar o hacer hit-test de un segmento como Bézier, `polySegmentToBezier(seg)` lo convierte en `BezierControlPoints` (`x0,y0,cp1x,cp1y,cp2x,cp2y,x3,y3`) — que es la forma que `SplineEntity` mismo aplana para el renderizado.

## DOMPortalEntity

```ts
new DOMPortalEntity(domElement: HTMLElement, width?, height?, id?)
```

Proyecta un elemento **real** del DOM posicionado/transformado para seguir a la entidad
(`matrix(...)` + opacidad heredada + z-index del orden de pintura) en la capa portal. Un nodo hoja —
`add()` advierte y las entidades hijas no son compatibles. Reenvía eventos nativos de puntero/rueda/
enfoque como `VectoJSEvent`s. Usa un `ResizeObserver` para almacenar en caché el tamaño intrínseco
(`cachedWidth`/`cachedHeight`) cuando `width`/`height` son 0. `destroy()` desconecta
los listeners, el observer y elimina el elemento.

## SVGEntity (desde `@vectojs/core/text`)

```ts
new SVGEntity(svgSource: string, id?)
setSVGSource(svgSource: string): void
```

Rasteriza una cadena SVG a un `ImageBitmap`/imagen y la copia, volviendo a rasterizar a
una escala objetivo (LOD) para que se mantenga nítida al hacer zoom. `scene.toSVG()` incrusta la
fuente codificada en porcentaje como una imagen SVG anidada aislada en lugar de un marcador de posición
URL inerte. Hit-test AABB en espacio local.

## Relacionados

[`Entity`](/reference/core-entity/) (la clase base que cada una de estas extiende) ·
[Visión general de `@vectojs/core`](/reference/core-api/)
