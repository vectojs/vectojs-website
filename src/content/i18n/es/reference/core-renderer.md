---
title: 'Renderizadores'
description: 'La subruta @vectojs/core/renderer: el contrato IRenderer agnóstico al backend, CanvasRenderer, SVGRenderer, la capa WebGL de puntos/rects/sprites/MSDF, la proyección de contenido de Entity y parseColorToRGBA.'
order: 5
---

# Renderizadores — `@vectojs/core/renderer`

Parte de [`@vectojs/core`](/reference/core-api/).

## IRenderer

Superficie de dibujo agnóstica al backend que recibe cada `Entity.render`.

```ts
interface IRenderer {
  clear(): void;
  save(): void;
  restore(): void;
  translate(x, y): void;
  scale(x, y): void;
  rotate(angle): void; // radianes, sentido horario
  setGlobalAlpha(alpha): void; // [0,1]
  clip(x, y, width, height): void; // interseca rect de recorte (envuelve en save/restore)

  beginPath(): void;
  moveTo(x, y): void;
  lineTo(x, y): void;
  bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y): void;
  closePath(): void;
  arc(x, y, radius, startAngle, endAngle, counterclockwise?): void;
  roundRect(x, y, width, height, radii: number | number[]): void;

  drawImage(source: CanvasImageSource, dx, dy, dw, dh): void;
  fill(colorOrGradient: string | any): void;
  stroke(colorOrGradient: string | any, lineWidth = 1): void;
  fillText(text, x, y, font, color): void; // font = abreviatura CSS, ej. '16px monospace'

  fillCircle(cx, cy, radius, color, alpha = 1): void; // lote mismo-estilo que preserva orden
  flush(): void; // confirma lote pendiente (no-op cuando está inactivo)
  present?(): void; // confirmación opcional de fin de fotograma
  createLinearGradient(x0, y0, x1, y1, colorStops: { stop; color }[]): any;
  dispose?(): void; // limpieza idempotente de backend; Scene.destroy() lo llama
}
```

### Sobrevivir a la pérdida del contexto GPU

Un reinicio de la GPU o un desalojo por presión de memoria retira el contexto de
dibujo; si no se gestiona, la superficie se queda permanentemente en blanco. Un
renderer que posee un contexto GPU debería:

1. escuchar su evento de pérdida y llamar a `preventDefault()` sobre él — de lo
   contrario el navegador nunca dispara el evento de restauración correspondiente;
2. informar `isContextLost() === true` para que `Scene.render` se salte la pasada en
   lugar de emitir llamadas de dibujo contra un contexto muerto;
3. al restaurarse, volver a adquirir el contexto, reaplicar la transformación/tamaño
   de DPR y disparar el callback `onContextRestored` para que el Scene repinte la
   superficie recién limpiada.

`CanvasRenderer` hace esto para Canvas2D, y `ThreeRenderer` para WebGL — consulta
[`@vectojs/three`](/reference/three-renderer/#pérdida-de-contexto-gpu-y-dpr-en-tiempo-de-ejecución).

`fillCircle` fusiona llamadas consecutivas del mismo `color`/`alpha` en una sola ruta,
confirmada en `flush()` (o cuando el estilo cambia). La Scene descarga al final de
cada grupo hermano y cada fotograma, preservando el orden del pintor.

## `Entity.getContentProjection()`

```ts
getContentProjection(): ContentProjection | null // default null
// ContentProjection: {
//   text: string; font?: string; lineHeight?: number; selectable?: boolean;
//   contentX?: number; contentY?: number; baseline?: number;
//   lines?: Array<{ text; x; y; baseline; font?; lineHeight?; runs? }>;
//   grid?: PreparedContentGrid;
// }
```

Hook optativo para entidades que renderizan texto estático: la Scene refleja la
cadena devuelta como un nodo DOM transparente sincronizado en posición (perezoso al viewport,
con verificación de cambios, `aria-hidden` cuando la entidad es interactiva), haciendo que el texto
del canvas sea localizable, visible para lectores de pantalla/rastreadores, traducible y — con
`selectable: true` — seleccionable de forma nativa. `TextEntity`/`MSDFTextEntity`
(ver [Texto y Bidi](/reference/core-text/)) lo implementan. Interruptor general de la Scene:
`new Scene(canvas, { contentProjection: false })`.

La Scene preserva el orden VMT cuando los nodos de proyección aparecen o desaparecen,
elimina las proyecciones descendientes con su subárbol de entidad y oculta una
proyección cuando está completamente fuera del viewport o de un ancestro `clipChildren`.
Las herramientas pueden inspeccionar un espejo actualmente materializado sin consultar el DOM:

```ts
scene.getContentElement(entityId): HTMLElement | undefined;
```

El texto virtualizado o no materializado fuera del viewport no es buscable hasta que la
aplicación lo traiga a la escena activa.

> Requiere Core 1.6.0 o posterior: Canvas acepta posiciones de texto como
> líneas de base mientras CSS acepta cajas de línea. Para geometría de selección exacta, proporciona
> `contentX`/`contentY` y `baseline` para una ejecución de texto simple, o una entrada `lines`
> explícita por fila visual cuando el componente ya gestiona el ajuste,
> las inserciones o la tipografía mixta. La Scene mapea esas coordenadas locales a través de la
> transformación de entidad y sincroniza las cajas de línea CSS con las métricas de fuente Canvas.

```ts
getContentProjection() {
  return {
    text: 'small large',
    selectable: true,
    lines: [{
      text: 'small large', x: 18, y: 12, baseline: 25,
      font: '28px sans-serif', lineHeight: 42,
      runs: [
        { text: 'small ', font: '16px sans-serif' },
        { text: 'large', font: 'bold 28px sans-serif' },
      ],
    }],
  };
}
```

Usa `cssLineBoxBaseline(font, lineHeight)` en editores Canvas-native personalizados
cuando el mismo texto debe alinearse con un control nativo o proyección de contenido.

> Core 1.8 añade `prepareContentGrid(source, metrics)` para renderizadores tipo código.
> Devuelve su resultado inmutable como `ContentProjection.grid` y usa las mismas
> celdas para pintura Canvas. La cuadrícula retiene rangos fuente UTF-16, cursores
> de grafemas legales, separadores CR/LF/CRLF, tabuladores, avances CJK anchos y emoji,
> conformado árabe y posiciones bidi Unicode mientras el DOM proyectado mantiene la fuente
> lógica exacta para copiar y buscar.

```ts
const grid = prepareContentGrid(source, {
  font: codeFont,
  cellWidth,
  lineHeight: 24,
  baseline: 18,
});

getContentProjection() {
  return { text: source, selectable: true, grid };
}
```

Core calibra los portadores retenidos después de que las fuentes cargan y enruta la selección
de puntero en espacio de cuadrícula local. La sustitución de fuentes de Firefox, DPR, zoom del navegador,
rotación, transformaciones de espejo y escalado no uniforme utilizan por lo tanto un único plan
de geometría. Las sondas de calibración heredan el contexto de zoom de la proyección y tienen en cuenta
las métricas de respaldo de glifos faltantes de Firefox; los propietarios de zoom/redimensionamiento personalizados deben llamar
a `scene.resize()` para invalidar la calibración retenida. Las proyecciones `lines`
ordinarias y las proyecciones personalizadas sin líneas también utilizan
geometría de cursor de grafema bidimensional transformada.

`present()` es llamado por la Scene exactamente **una vez** al
final de cada pase de renderizado. Los backends retenidos que envían un fotograma completo a la
vez (ej. `ThreeRenderer` de [`@vectojs/three`](/reference/three-renderer/))
deben hacer su única confirmación costosa aquí y mantener `flush()` barato — la
Scene llama `flush()` alrededor de cada nodo no agrupado, por lo que un `flush()` costoso
hace que el costo del fotograma sea cuadrático en el número de entidades.

## CanvasRenderer

```ts
new CanvasRenderer(canvas: HTMLCanvasElement)
```

`IRenderer` por defecto. Aplica el escalado `devicePixelRatio` en la construcción. Limita
cada `fill()` agrupado a `MAX_BATCH = 64` sub-rutas (un solo `fill()` de Canvas2D es
superlineal en el número de sub-rutas). Obtén un manejador mediante `scene.getRenderer()`.

## TextRasterCache

_Desde Core 1.12.0._

```ts
new TextRasterCache(options?: { maxEntries?: number; dpr?: number })
cache.get(font: string, color: string, text: string): TextRaster | null
cache.clear(): void
cache.stats: { hits: number; misses: number; size: number }
```

Una caché de runs de texto prerrasterizados, para vistas que dibujan las **mismas
cadenas cortas miles de veces por frame** (danmaku/barrage, colas de chat/logs,
celdas de cuadrículas de datos, etiquetas de partículas). `ctx.fillText()` es
engañosamente costoso a escala: cada llamada vuelve a conformar la cadena, vuelve a
analizar el color CSS y rasteriza los glifos en el hilo principal de la CPU — un perfil
muestra el hilo principal saturado en código nativo (`(program)`) mientras la GPU está
ociosa, sin trabajo.

`get()` rasteriza cada run `(font, color, text)` distinto a un pequeño canvas fuera de
pantalla una vez; en cada frame posterior lo bliteas con `drawImage` en lugar de volver
a conformarlo. Blitea en la línea base de `fillText` restando los offsets devueltos:

```ts
const r = cache.get('600 24px system-ui', '#38bdf8', label);
if (r) renderer.drawImage(r.canvas, x - r.offsetX, baselineY - r.offsetY, r.width, r.height);
else renderer.fillText(label, x, baselineY, '600 24px system-ui', '#38bdf8'); // headless fallback
```

`TextRaster` es `{ canvas, width, height, offsetX, offsetY }` (dimensiones en píxeles
CSS). Las instancias están aisladas (sin estado global compartido); `dpr > 1` mantiene
el texto nítido en HiDPI mientras el tamaño del blit se mantiene en píxeles CSS; un tope
de expulsión por orden de inserción (`maxEntries`, por defecto 4096) acota la memoria
frente a contenido sin límite (tecleado por el usuario); `get()` devuelve `null` en un
contexto headless/sin DOM para que mantengas un fallback a `fillText`. La ganancia viene
de la **reutilización** — un run dibujado solo una vez es puro sobrecoste.

## SVGRenderer

```ts
new SVGRenderer(width: number, height: number)
toXMLString(): string
```

`IRenderer` por software que registra dibujos en una cadena SVG plana (pilas de matriz/alfa/recorte,
deduplicación de degradados). El texto y los valores de atributos tienen escape XML, y las
URLs de imágenes externas rechazan esquemas ejecutables/data/archivo/personalizados (las URLs de datos
rasterizados generados por Canvas siguen siendo compatibles). Respaldan `scene.toSVG()`. `SVGLinearGradient` es el
tipo descriptor de degradado.

## Capa de puntos WebGL

```ts
createWebGLPointRenderer(canvas: HTMLCanvasElement): PointRenderer | null   // null si WebGL2 / shader no disponible

interface PointRenderer {
  resize(width, height): void;                 // tamaño lógico; aplica DPR
  begin(): void;                               // reinicia búferes por fotograma
  addCircle(x, y, radius, color, alpha?): void;        // coordenadas mundiales
  addRect(x, y, width, height, color, alpha?, rotation?): void;
  setTexture(source: TexImageSource): void;
  addSprite(x, y, width, height, u0, v0, u1, v1, color?, alpha?, rotation?): void;
  setMSDFTexture(source: TexImageSource, distanceRange: number): void;
  addGlyph(x, y, width, height, u0, v0, u1, v1, color?, alpha?, rotation?): void;
  flush(): void;                               // limpia + dibuja todas las primitivas acumuladas
  destroy(): void;
}
```

Un canvas WebGL2, cuatro programas agrupados: puntos (redondos, con AA vía `gl_PointSize`),
rects (triángulos expandidos), sprites texturizados y glifos MSDF (reconstrucción de distancia
mediana-de-3, nítida a cualquier zoom). `color` tiñe; los texels blancos pasan
sin cambios. Las adiciones de sprite/glifo son no-op hasta que su textura se establece. La
Scene enruta `getBatchCircle`/`getBatchRect` (y partículas CPU, texto MSDF) aquí
cuando `pointBackend: 'webgl'`. Las hojas bajo transformaciones que la primitiva GPU no puede
representar exactamente (por ejemplo escala no uniforme o cizallamiento) recurren al
renderizador normal.

> Los hooks de Entity `getBatchCircle()` → `{ radius, color }` y `getBatchRect()` →
> `{ width, height, color }` (ver [`Entity`](/reference/core-entity/#hooks-de-a11y--agrupación-sobrescribir-para-optar))
> son las opciones por entidad que alimentan esta capa.

`flush()` emite **como máximo una llamada de dibujo por tipo de primitiva**, por lo que el recuento de llamadas de dibujo no es el límite de escalado — los bytes subidos lo son. Desde core 1.16.2, cada lote de cuadriláteros (rect, sprite, glifo, círculo tallado) sube **4 vértices** y dibuja con `drawElements` contra un búfer de índices estático compartido de 32 bits, en lugar de expandirse a 6 vértices para `drawArrays`. Esto elimina las dos esquinas duplicadas por cuadrilátero, reduciendo el volumen de subida en un tercio; el búfer de índices se construye una vez y se recrece geométricamente, nunca se reenvía por fotograma. Los índices son de 32 bits porque un `Uint16Array` limitaría un lote a 16,383 cuadriláteros, que las escenas reales superan.

Medido en hardware real (RTX 4060 Laptop, trabajo más `gl.finish()`, mediana de 12) contra la ruta anterior de 6 vértices:

| quads/frame | Chrome         | Firefox         |
| ----------- | -------------- | --------------- |
| 12,000      | 0.61 → 0.09ms  | 2.66 → 1.47ms   |
| 50,000      | 2.22 → 0.87ms  | 9.02 → 6.24ms   |
| 100,000     | 12.62 → 3.12ms | 16.81 → 10.88ms |

Por debajo de aproximadamente **35,000–50,000 quads/frame** el JS que llena el búfer de vértices cuesta más que el envío de la GPU; por encima el envío domina y las palancas útiles se convierten en dibujar menos (culling, virtualización) en lugar de ajustar el llenado. Firefox mantiene cerca de ~1 GB/s de ancho de banda de subida efectivo independientemente de la disposición de vértices, por lo que en ese motor reducir bytes es la única palanca fiable.

## parseColorToRGBA

```ts
parseColorToRGBA(css: string): RGBA           // RGBA = [number, number, number, number] en [0,1]
```

Rutas rápidas para `#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa` y `rgb()`/`rgba()`; otras
formas (nombradas, `hsl()`, …) se resuelven a través de un canvas 1×1 en caché cuando existe un DOM.
Los resultados están **almacenados en caché y compartidos por identidad — trata el array devuelto como
de solo lectura.** Entrada no analizable sin DOM → negro opaco `[0,0,0,1]`.

La caché contiene 1.000 entradas y las expulsa en **orden de inserción (FIFO)**. Un acierto de caché deliberadamente **no** promociona su entrada: esta función se llama una vez por cuadrilátero, y a ~25.000 quads/frame el par `Map.delete` + re-`set` que necesita un LRU verdadero cuesta más que todo lo demás en la función combinado. La consecuencia práctica es que si el conjunto de trabajo de colores distintos de una escena supera 1.000, un color popular insertado tempranamente puede ser expulsado y re-analizado; para escenas típicas el conjunto de trabajo es pequeño y estable, por lo que FIFO y LRU expulsan las mismas entradas.

## Relacionados

[`Entity`](/reference/core-entity/) (hooks de agrupación, proyección de contenido) ·
[`ComputeParticleEntity`](/reference/core-particles/) (consumidor WebGL/WebGPU) ·
[Texto y Bidi](/reference/core-text/) (consumidor de glifos MSDF) ·
[`ThreeRenderer` de `@vectojs/three`](/reference/three-renderer/) (un `IRenderer` alternativo) ·
[Visión general de `@vectojs/core`](/reference/core-api/)
