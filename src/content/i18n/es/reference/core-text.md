---
title: 'Texto y Bidi'
description: 'El paquete independiente @vectojs/text (también la subruta @vectojs/core/text): métricas de tipografía, análisis de fuentes MSDF, conformado árabe y el resolvedor bidi, más los renderizadores de texto en GPU MSDFTextEntity/GridTextEntity residentes en core.'
order: 7
---

# Texto y Bidi — `@vectojs/text`

Las primitivas de shaping de texto — `BidiResolver`, `ArabicShaper`, `Typography`,
`MSDFFont`, `prepareContentGrid`/`PreparedContentGrid` — son el paquete independiente
**`@vectojs/text`** (un paquete hoja que depende solo de `bidi-js`). Los
renderizadores de texto en GPU basados en `Entity` (`MSDFTextEntity`, `SVGEntity`,
`TextEntity`/`GridTextEntity`) permanecen en [`@vectojs/core`](/reference/core-api/)
porque extienden `Entity`. Core reexporta las primitivas de `@vectojs/text`, así que
se resuelven desde `@vectojs/text`, `@vectojs/core` o la subruta `@vectojs/core/text`.
Construido sobre la división frío/caliente del [Motor de disposición](/reference/core-layout/).

## MSDFFont

```ts
new MSDFFont(data: MSDFFontData)
MSDFFont.parse(json: string | MSDFFontData): MSDFFont   // lee JSON de msdf-atlas-gen
font.getGlyph(unicode: number): MSDFGlyphDef | undefined
font.layout(text, fontSizePx, opts?: MSDFLayoutOptions): MSDFLayoutResult   // respeta \\n, kerning, letterSpacing
font.distanceRange / font.atlasWidth / font.atlasHeight
```

Analiza el JSON de facto `msdf-atlas-gen` y coloca texto en cuadriláteros de píxeles CSS con
UVs de atlas (espacio local y hacia abajo; v=0 en la parte superior del atlas). Combina `layout()` con el
backend WebGL `setMSDFTexture` + `addGlyph` (ver [Capa de puntos WebGL](/reference/core-renderer/#capa-de-puntos-webgl))
para texto GPU independiente de resolución. Tipos:
`MSDFFontData`, `MSDFAtlasInfo`, `MSDFMetrics`, `MSDFGlyphDef`, `MSDFBounds`,
`MSDFKerning`, `PositionedGlyph`, `MSDFLayoutResult`, `MSDFLayoutOptions`.

## MSDFTextEntity

```ts
new MSDFTextEntity(text: string, options: MSDFTextEntityOptions)
// options: { font: MSDFFont, texture: TexImageSource, fallbackFont?, fontSize?, color?, lineHeight?, letterSpacing? }
setText(text: string): void
```

Renderiza glifos MSDF nítidos a través de la capa de puntos WebGL cuando la escena ejecuta
`pointBackend: 'webgl'`; de lo contrario recurre a Canvas2D `fillText` con
`fallbackFont`. La disposición se calcula **fuera del hilo principal** a través de `LayoutWorkerManager` y se
aplica en la devolución de llamada, llamando a `markDirty()` — por lo que el texto aparece un tick asíncrono después de
la construcción/`setText`.

## TextEntity y GridTextEntity (desde `.`)

```ts
new TextEntity(text: string, atlas: GlyphAtlas, maxWidth: number, fontSize = 32)
text.setText(text): this        // pase frío (re-segmentar + re-medir), luego reflujo
text.setMaxWidth(maxWidth): this // solo pase caliente — reutiliza PreparedText en caché (redimensionamiento responsivo barato)
text.setTextAlign(align: 'left' | 'justify'): this
text.setHyphenator(fn: ((word: string) => string[]) | null): this

new GridTextEntity(_atlas: any, fontSize = 10)
grid.updateGrid(ascii: string[])   // cuadrícula de celdas monoespaciadas; interactive=false (a11y desactivado por rendimiento)
```

`setTextAlign('justify')` estira las líneas ajustadas hasta `maxWidth` (espacios entre palabras,
o espacios entre caracteres en líneas CJK sin espacios); la última línea de cada
párrafo permanece suelta. `setHyphenator()` conecta una función palabra → partes (ej. los
patrones Knuth–Liang del paquete npm `hyphen`) para que las palabras largas puedan dividirse a media palabra
con un `-` visible; los guiones blandos (U+00AD) ya presentes en el texto fuente funcionan sin
un separador silábico. Ambos se aplican porque `TextEntity` renderiza **por glifo** en el
`x` calculado de cada nodo — la matemática de justificación/separación silábica se respeta visualmente.

`MSDFTextEntity` y los componentes `Text`/`RichText` de `@vectojs/ui` comparten el mismo
`LayoutEngine` subyacente, pero aún no exponen estos dos métodos — `Text`/`RichText`
renderizan cada línea ajustada como una sola llamada `fillText()` nativa por rendimiento, lo que
descartaría silenciosamente los desplazamientos de justificación por glifo incluso si la opción estuviera
expuesta. Usa `TextEntity` directamente (o impulsa un `LayoutEngine` crudo con `textAlign`/
`hyphenate` configurado) cuando necesites texto justificado o separado silábicamente hoy.

## Bidi / conformado

```ts
ArabicShaper.shapeArabic(text: string): ShapedResult   // { shapedText, indexMap: Int32Array } — unión de formas de presentación
BidiResolver.getBaseLevel(text: string): number
BidiResolver.resolveLevels(text: string): Uint8Array
BidiResolver.reorderVisual(nodes: any[], baseLevel: number): void
BidiResolver.reorderSegments(str: string, levels: Uint8Array, baseLevel: number):
  Array<[number, number]>
```

Bidi integrado ligero: clases de dirección basadas en rangos (R/AL hebreo/árabe,
dígitos EN/AN) y selección de formas de presentación contextual árabe. `indexMap` mapea
índices conformados de vuelta a la cadena fuente para hit-testing / mapeo de cursor.

`reorderVisual` reordena un arreglo de objetos de nodo en su lugar. `reorderSegments` expone los mismos rangos de inversión UAX #9 **L2** (pares de índices inclusivos `[start, end]` sobre las propias posiciones de la carrera) sin requerir objetos de nodo, de modo que un llamador que mantenga **arreglos tipados paralelos** puede aplicar la misma permutación en su lugar — eso es lo que usa la ruta de diseño de búfer de GC cero. `reorderVisual` ahora delega en él, por lo que los dos no pueden divergir.

Ver [Texto y Tipografía](/learn/text-typography/) para uso.

## Relacionados

[Motor de disposición](/reference/core-layout/) (el pase frío/caliente que esto renderiza) ·
[Renderizadores](/reference/core-renderer/) (capa de puntos WebGL, proyección de contenido) ·
[Visión general de `@vectojs/core`](/reference/core-api/)
