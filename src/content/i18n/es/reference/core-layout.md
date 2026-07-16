---
title: 'Motor de disposición'
description: 'La subruta @vectojs/core/layout: la división frío/caliente que separa la costosa segmentación+medición de texto de la aritmética barata de ajuste de línea y posicionamiento, memoización en streaming, texto enriquecido y formas de exclusión.'
order: 4
---

# Motor de disposición (división frío/caliente) — `@vectojs/core/layout`

Parte de [`@vectojs/core`](/reference/core-api/).

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
  `count`, `CAPACITY = 16384`); `reset()` antes de reutilizar, `toLayoutResult()` para
  materializar.
- `LayoutWorkerManager.getInstance()` — singleton para disposición fuera del hilo principal;
  `queueLayout(entityId, text, { fontId, fontSize, maxWidth, maxHeight, callback,
... })` / `cancelLayout(entityId)`. Usado por [`MSDFTextEntity`](/reference/core-text/#msdftextentity).

Ver [Texto y Tipografía](/learn/text-typography/) para uso, y
[Texto y Bidi](/reference/core-text/) para la capa de renderizado de fuentes/glifos que
consume la salida de este motor.

## Relacionados

[Texto y Bidi](/reference/core-text/) · [`Entity`](/reference/core-entity/) ·
[Visión general de `@vectojs/core`](/reference/core-api/)
