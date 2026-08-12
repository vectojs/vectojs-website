+++
title = "Motor de disposición"
description = "El paquete independiente @vectojs/layout (también la subruta @vectojs/core/layout): la división frío/caliente que separa la costosa segmentación+medición de texto de la aritmética barata de ajuste de línea y posicionamiento, memoización en streaming, texto enriquecido y formas de exclusión."
weight = 4
+++

# Motor de disposición (división frío/caliente) — `@vectojs/layout`

El motor de disposición es el paquete independiente **`@vectojs/layout`** (depende
solo de [`@vectojs/text`](/reference/core-text/) para las primitivas de shaping).
[`@vectojs/core`](/reference/core-api/) depende de y lo reexporta, así que puedes
importarlo desde `@vectojs/layout`, `@vectojs/core` o la subruta `@vectojs/core/layout`
de forma intercambiable.

`LayoutEngine` separa el costoso pase **frío** (segmentar + medir, a través de
`Intl.Segmenter`) del barato pase **caliente** (ajustar + aritmética de posicionamiento), para que
el redimensionamiento/reflujo/animación no tenga que volver a medir.

```ts
new LayoutEngine(maxWidth: number, maxHeight: number, measurer?: GlyphMeasurer | null)

// Frío: segmentar + medir una vez → PreparedText reutilizable
prepare(text, fontAtlas, fontSize = 32): PreparedText
prepareRich(spans: StyledSpan[], fontAtlas, baseFontSize = 32, baseStyle?: TextStyle): PreparedText

// Caliente: colocar un PreparedText en glifos posicionados (lee engine maxWidth/maxHeight)
layoutPrepared(prepared, exclusionMask?, exclusions?: ExclusionRect[]): LayoutResult
layoutPreparedIntoBuffer(prepared, buffer: LayoutResultBuffer, exclusionMask?): void   // reutiliza almacenamiento de coordenadas tipado

// Una sola llamada (frío+caliente juntos)
layoutText(text, fontAtlas, fontSize = 32, exclusionMask?): LayoutResult
layoutTextIntoBuffer(text, fontAtlas, fontSize, buffer, exclusionMask?): void
```

- **Memoización en streaming.** `prepare`/`prepareRich` almacenan en caché los resultados por párrafo,
  por lo que volver a preparar texto en crecimiento (ej. un flujo de tokens LLM) solo mide párrafos
  nuevos.
- **Texto enriquecido.** `StyledSpan = { text, style?: TextStyle }`; `TextStyle =
{ fontSize?, color?, bold?, italic?, href? }`. Un cambio de estilo a media palabra se
  respeta por glifo. `fontSize` afecta el ancho medido + la altura de línea; el resto son
  metadatos de renderizado que se trasladan a los nodos (`PreparedGlyph.style` → `LayoutNode.style`).
- **Exclusiones (formas de exclusión).** `computeLineSegments(top, bottom, maxWidth,
exclusions: ExclusionRect[]): LineSegment[]` es el núcleo puro y testeable: los
  intervalos libres `[x0,x1)` en una banda de línea después de restar rectángulos superpuestos.
  O(n log n). Pasar `[]`/omitir deja la ruta de una sola columna byte-idéntica.

## Tipos clave de disposición

- `GlyphAtlas` — `{ [char]: { width, baseSize, ast } }` métricas pre-medidas.
- `GlyphMeasurer` — `{ measure(char, fontSize): number }`; proporciona el tuyo o usa
  `createCanvasMeasurer(fontFamily?, baseSize?)` (`measureText` fuera de pantalla,
  escalado linealmente + en caché; devuelve `null` en entornos sin DOM → el motor mantiene un
  respaldo de `0.5em`).
- `PreparedText` → `PreparedParagraph[]` → `PreparedWord[]` → `PreparedGlyph[]`.
- `LayoutResult` — `{ nodes: LayoutNode[], totalWidth, totalHeight,
fallbackToCanvas? }`; `LayoutNode` es un glifo posicionado.
- `LayoutResultBuffer` — resultado plano de array tipado (`xs/ys/ws/hs`, `chars`,
  `levels`, `count`, `CAPACITY = 16384`); `reset()` antes de reutilizar, `toLayoutResult()` para
  materializar. `levels` es el nivel de incrustación BiDi resuelto por glifo (par =
  LTR, impar = RTL), por lo que un consumidor puede determinar la dirección de un glifo;
  la ruta del búfer la usa para reordenar cada línea en orden visual. Los glifos salen en
  orden **visual** con una línea base compartida, coincidiendo con la ruta asignadora
  glifo por glifo.
- `LayoutWorkerManager.getInstance()` — singleton para disposición fuera del hilo principal;
  `queueLayout(entityId, text, { fontId, fontSize, maxWidth, maxHeight, callback,
... })` / `cancelLayout(entityId)`. Usado por [`MSDFTextEntity`](/reference/core-text/#msdftextentity).

Exportaciones de utilidad que vale la pena conocer: `createMetricsMeasurer(fontFamily?, baseSize?)` y `resolveGlyphMeasurer(...)` construyen un `GlyphMeasurer`; `EMPTY_GLYPH_ATLAS` es el atlas de respaldo sin métricas; `isComplexScript(text)` informa si el shaping necesita el itemizador de scripts; `computeMSDFLayout(...)` es la función de disposición pura que la ruta del worker ejecuta fuera del hilo; `cacheStats()` / `resetCacheStats()` y `clearCssLineBoxMetrics()` son cachés a nivel de motor para diagnósticos.

- `InlineObject` — un elemento reemplazado en línea (imagen, icono, cuadro matemático) dentro de un párrafo enriquecido: `{ width, height, depth?, alt?, paint? }`. El span debe consistir en el centinela U+FFFC `OBJECT_REPLACEMENT`; el motor reserva las métricas del cuadro y, cuando el consumidor renderiza, llama a `paint(surface: InlineObjectSurface, box: InlineObjectBox)` en el espacio de coordenadas local del texto (sin necesidad de contabilidad de profundidad). `alt` es el equivalente de texto usado para el nombre accesible, la selección y el copiado; sin él, el centinela sin procesar se filtra a la capa a11y. `paint` es parte de la clave de memoización del párrafo (junto con `alt`): dos objetos que se comparan iguales comparten un párrafo en caché, por lo que una imagen elegida fuera de `alt` (p. ej. una URL de imagen de Markdown — el caso de la columna de insignias) debe declararse allí o cada objeto de apariencia igual dibuja la imagen del primero. `depth` refleja el `vertical-align` de CSS con el signo invertido (`vertical-align: -0.486ex` de MathJax → `depth: 0.486 * exToPx`).

Ver [Texto y Tipografía](/learn/text-typography/) para uso, y
[Texto y Bidi](/reference/core-text/) para la capa de renderizado de fuentes/glifos que
consume la salida de este motor.

## Relacionados

[Texto y Bidi](/reference/core-text/) · [`Entity`](/reference/core-entity/) ·
[Visión general de `@vectojs/core`](/reference/core-api/)
