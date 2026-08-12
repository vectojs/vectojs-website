+++
title = "Texto y Bidi"
description = "El paquete independiente @vectojs/text (también la subruta @vectojs/core/text): métricas de tipografía, análisis de fuentes MSDF, conformado árabe y el resolvedor bidi, más los renderizadores de texto en GPU MSDFTextEntity/GridTextEntity residentes en core."
weight = 7
+++

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

## Métricas de texto sin interfaz (Headless text metrics)

```ts
registerFontMetrics(family: string, source: FontMetricsSource): void
registerMSDFFontMetrics(family: string, font: MSDFFont | MSDFFontData | string)
createMSDFMetricsSource(font: MSDFFont): FontMetricsSource
getFontMetrics(family: string): FontMetricsSource | undefined
hasFontMetrics(): boolean
fontMetricsVersion(): number
clearFontMetrics(): void
createMeasuringContext(): CanvasRenderingContext2D | null   // see below
```

La medición de texto normalmente pasa por un contexto Canvas 2D, que mide la
fuente que el renderizador realmente dibujará. Sin uno — Node SSR, un worker sin
`OffscreenCanvas` — no hay con qué medir, y el advance de cada glifo
vuelve a un `0.5em` plano. Medido contra Chrome a 32px
`sans-serif` que es incorrecto por **+125%** en texto estrecho y **−47%** en ancho,
y `iiiiiiiiii` sale exactamente tan ancho como `WWWWWWWWWW`. El ajuste de línea hereda
el error, por lo que los saltos de línea también caen en los lugares equivocados.

`createMeasuringContext()` es la salida de emergencia ligera para ese caso: crea
un `<canvas>` fuera de pantalla de 1×1 (agregado al cuerpo del documento, invisible,
`aria-hidden`) y devuelve su contexto 2D para medir una fuente que no tiene
una source de métricas registrada — o `null` en un entorno sin DOM. Es el
contexto que el propio motor usaría, por lo que mide la fuente que el renderizador
dibujará realmente, lo cual no hacen las rutas basadas en el registro anteriores.
El contexto de medición único compartido (`getSharedMeasuringContext` /
`isSharedMeasuringContextAttached` / `resetSharedMeasuringContext`, también de
`@vectojs/text`) es un contexto memoizado aparte usado en todos los paquetes
`@vectojs/*` — `ctx.font` se asigna antes de cada lectura, así que el uso
compartido nunca filtra una medición obsoleta.

Registre las métricas una vez al inicio para solucionarlo. Cualquier JSON de `msdf-atlas-gen` funciona,
y solo se leen sus `glyphs[].advance`, `kerning`, y `metrics` — la imagen del atlas
es irrelevante, por lo que un archivo solo de métricas es suficiente y no se decodifica nada:

```ts
import { registerMSDFFontMetrics } from '@vectojs/core';

registerMSDFFontMetrics('sans-serif', await readFile('inter.json', 'utf8'));
```

Una familia coincide sin distinguir mayúsculas de minúsculas con las comillas eliminadas, y una
lista separada por comas registra solo su primera familia. Al registrar la misma
familia nuevamente se reemplaza la source anterior, y `clearFontMetrics()` descarta
todo (útil para el aislamiento de pruebas, ya que el registro abarca todo el proceso).

Proporcione una source directamente para una fuente que no sea MSDF:

```ts
interface FontMetricsSource {
  advanceEm(char: string): number | undefined; // required
  measureEm?(text: string): number | undefined; // honors kerning
  ascenderEm?: number; // for cssLineBoxBaseline
  descenderEm?: number;
}
```

Tres rutas consultan el registro: advances por glifo en el motor de diseño,
anchos de cadena completa en `@vectojs/ui` (que dimensionan `Button`, `Input`, `Link`,
`Checkbox`, `ContextMenu`, `ProgressBar`), y la línea base en
`cssLineBoxBaseline`, que necesita `ascenderEm`/`descenderEm`.

> [!IMPORTANT]
> Un contexto Canvas 2D real siempre gana, por lo que el registro de métricas no puede cambiar
> lo que mide o dibuja un navegador. Estos existen para reemplazar una suposición inventada,
> no para anular el motor que renderizará el texto.

Vale la pena proporcionar `measureEm`. El contrato por glifo es
`measure(char, fontSize, family)` y no tiene un carácter vecino, por lo que los advances
sumados no pueden recuperar el kerning — alrededor del ~10% en cadenas con mucho kerning. La medición
de la cadena completa pasa por `measureEm` y es exacta.

Para comprobar si algún texto se midió con advances fabricados,
`unmeasuredGlyphCount()` de [`@vectojs/layout`](/reference/core-layout/)
los cuenta, y una advertencia de consola única nombra la corrección. Es distinto de
`LayoutResult.fallbackToCanvas`, que solo informa de una falta de **atlas** y es
verdadero en esencialmente cada párrafo incluso en un navegador.

## `@vectojs/tex` — Tipografía TeX sin DOM

`@vectojs/tex` es el paquete independiente detrás de los bloques `$…$` / ` ```math ` de [`Markdown`](/reference/ui-markdown/). Integra el núcleo de análisis/maquetación de KaTeX y vuelve a emitir el resultado como una **cadena SVG autocontenida** que lleva sus propios contornos de glifos y no referencia nada externo — la única forma que sobrevive a ser rasterizada a través de `data URI → Image → createImageBitmap`. Se carga de forma diferida (solo una vez que aparece una fórmula) y es un paquete separado, público y versionado; `@vectojs/core` **no** lo reexporta.

```ts
import { layout, emitSVG } from '@vectojs/tex';

const { svg, width, height, depth } = emitSVG(layout('x^2 + y^2 = z^2'));
```

Los dos ayudantes de la capa de emisión que permiten a llamadores personalizados reproducir la selección de fuente derivada de la hoja de estilos de KaTeX sin una hoja de estilos (un canvas no tiene ninguna):

```ts
resolveFont(classes: readonly string[]): ResolvedFont
// ResolvedFont = { font: FontName; substituted: boolean }

sizingRatio(classes: readonly string[]): number
```

`resolveFont` mapea las clases CSS de un span de KaTeX a un archivo de fuente concreto incluido (`FontName`, p. ej. `'Main-BoldItalic'`, `'Size2-Regular'`). La selección de fuente es **heredada, no local** — un `SymbolNode` anidado bajo `Span[delimsizing size1]` lleva una lista de clases vacía, así que pasa la concatenación de las clases de cada ancestro seguidas de las propias del símbolo, la más externa primero (las entradas posteriores ganan). Un peso/estilo solicitado que la familia no incluye degrada a su cara Regular y establece `substituted: true` en lugar de dibujar mal silenciosamente.

`sizingRatio` convierte las clases `katex-sizing reset-size<N> size<M>` en el multiplicador de escala script/scriptscript (`toMultiplier / fromMultiplier`); devuelve `1` cuando las clases no llevan tamaño, así que los llamadores pueden multiplicar incondicionalmente. Estos son el mecanismo detrás de que `@vectojs/tex` reporte tamaños en métricas relativas a `ex`.

`FontName`, `ResolvedFont`, `layout`, `emitSVG` y `LayoutOptions` también se exportan desde `@vectojs/tex` (ver su `src/index.ts`).

## Relacionados

[Motor de disposición](/reference/core-layout/) (el pase frío/caliente que esto renderiza) ·
[Renderizadores](/reference/core-renderer/) (capa de puntos WebGL, proyección de contenido) ·
[Visión general de `@vectojs/core`](/reference/core-api/)
