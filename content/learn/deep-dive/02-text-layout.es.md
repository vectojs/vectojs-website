---
title: '02 — Texto y Layout: de Unicode a píxeles'
description: 'El pipeline completo de texto — segmentación, BiDi, conformado árabe, fallback de fuente, Typography, salto de línea, la división frío/caliente de LayoutEngine, hilos worker y las invariantes que mantienen medida y pintado en paridad.'
order: 22
---

# 02 — Texto y Layout: de Unicode a píxeles

> VectoJS vuelve a implementar lo que la pila de texto del navegador le ofrece de forma gratuita: bidi, modelado, segmentación, reserva de fuentes, salto de línea y ubicación de línea de base. Este dossier rastrea cada etapa desde un Unicode`string`hasta glifos posicionados y explica los contratos que mantienen a`measure`y`paint`de acuerdo por construcción.

## 1. Pipeline de un vistazo

```text
Unicode string
  │  Intl.Segmenter (word + grapheme)          packages/layout/src/LayoutEngine.ts:916
  ▼
 Grapheme segmentation ─┬─ ArabicShaper.shapeArabic  packages/text/src/ArabicShaper.ts:89
                        │  indexMap: shaped → source       :91
                        ▼
 BiDi resolution (bidi-js, UAX #9)            packages/text/src/BidiResolver.ts:27
  getBaseLevel / resolveLevels / reorderSegments
                        │
                        ▼
 Font fallback (atlas → measurer → 0.5em)     packages/layout/src/measure.ts:39
  createCanvasMeasurer / createMetricsMeasurer / resolveGlyphMeasurer
                        │
                        ▼
 Typography (baseline in line box)            packages/text/src/Typography.ts:93
  cssLineBoxBaseline / registeredBaseline / splitFontShorthand
                        │
                        ▼
 Line breaking + exclusion flow + justify     packages/layout/src/LayoutEngine.ts:1848
  computeLineSegments / suppressLineBreaks / LayoutEngine.layoutPrepared
                        │
                        ▼
 Paint / measure parity ─┬─ @vectojs/layout  (canvas Text/RichText)
                         └─ @vectojs/text    (MSDF: MSDFFont.layout)  packages/text/src/MSDFFont.ts:201
                         └─ @vectojs/core    (MSDFTextEntity → worker) packages/core/src/text/MSDFTextEntity.ts:25
```

Dos consumidores paralelos comparten el mismo contrato de medición: la **ruta del lienzo** (`@vectojs/layout`+`measureContext`) y la **ruta GPU/MSDF** (`MSDFFont.layout`+`LayoutWorker`). Los resultados divergen sólo en cómo los quads se convierten en píxeles, nunca en dónde caen los saltos de línea por familia.

Para los consumidores de la red (terminales, editores, `CodeBlock`), la canalización se bifurca anteriormente en la ruta de la red retenida`prepareContentGrid`(`packages/text/src/PreparedContentGrid.ts:243`): una compilación, dos consumidores (pintura + proyección). Consulte`tmp/boss-research/01-selection.md`§3.3 para conocer el lado de la cuadrícula de contenido.

### Separación frío / caliente (el 2,68× que abarata el resize)

```text
prepare(text) / prepareRich(spans)          ← cold:  Intl.Segmenter + Arabic shape + BiDi + glyphWidth
  └─→ PreparedText { paragraphs, fontSize }      memo'd by text+fontSize+styleSig (LayoutEngine.ts:829/833)
       │  independent of maxWidth / maxHeight / exclusions
       ▼
layoutPrepared(prepared, mask, exclusions)  ← hot:   computeLineSegments + suppressLineBreaks + shiftedExtent
measurePrepared(prepared)                   ← hot (no alloc): lineCount+height only
layoutPreparedIntoBuffer(prepared, buffer)  ← hot, zero-GC: typed arrays + reorderSegments
```

`benchmarks/text-layout-pretext` /`comparisons/text-layout-pretext`/`scripts/compare-pretext.ts:1`estableció la división de manzanas con manzanas (`measurePrepared`vs`pretext.layout`). Antes de la división,`layoutText`(frío+caliente) se comparó con el`layout`solo activo de pretexto: la brecha se informó como costo del motor cuando en realidad era costo de segmentación.

### Segmentadores y sus cachés

`LayoutEngine` (`:916`) contiene`wordSegmenter`+`charSegmenter`(`Intl.Segmenter`, locale`navigator.language ?? 'en-US'`) - detección automática de CJK frente a límites de palabras occidentales - además de`wordCache: Map<string, …>`(`:821`, cap 500) y`graphemeCache: Map<string,string[]>`( `:822`, tapa 2000). Ambos se descargan al por mayor en el límite (`:921`/`950`) y se observan hasta`cacheStats()`(`:1004`). `PreparedContentGrid`prefiere el mismo`Intl.Segmenter`para grafemas (`:76`) pero lleva`fallbackGraphemes`(`:107`) para entornos sin él: combinación de marcas, VS16/VS15, modificadores de tono de piel`U+1F3FB–1F3FF`, indicadores regionales, ZWJ, suficiente para mantener las tabulaciones y las columnas anchas correctas. `LayoutEngine.getGraphemes`(`:943`) y`getWordSegments`(`:881`) son los únicos sitios de llamadas; `shapeSimpleRun`(`:1644`) omite`ArabicShaper`solo después de que`isComplexScript`(`:584`) demuestre que es seguro.

## 2. Inmersión por módulo

### 2.1 `packages/text/src/BidiResolver.ts:27` — UAX #9 via `bidi-js`

Clase solo estática (intencionalmente:`BidiResolver.getBaseLevel(...)`es una API pública). Envoltura delgada sobre`bidi-js``getEmbeddingLevels` /`getReorderedIndices`/`getReorderSegments`; la inversión L2 anterior realizada a mano fue reemplazada porque su reinicio L1 manejó solo una ejecución de espacio en blanco final.

| Método                                    | Línea  | que hace                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getBaseLevel(text)`                      | `:29`  | Nivel de incrustación de párrafos P2/P3 (0 LTR, 1 RTL).                                                                                                                                                                                                                                                                                   |
| `resolveLevels(text)`                     | `:34`  | Per-character resolved levels X1–I2 (`Uint8Array`).                                                                                                                                                                                                                                                                                       |
| `reorderIndices(text)`                    | `:50`  | Visual→logical permutation L1+L2 (`indices[v] = logical index at visual column v`). Authoritative — selection maps logical ranges to visual runs through this.                                                                                                                                                                            |
| `logicalToVisualRuns(text, start, end)`   | `:62`  | One logical `[start,end)` → N visual `[visualStart,visualEnd)` runs, sorted left-to-right. A single selection rect becomes several when it straddles a direction boundary.                                                                                                                                                                |
| `reorderVisual<T>(nodes, baseLevel)`      | `:89`  | In-place L1+L2 reversal of one line's nodes. Reconstructs `str` + `levels` and iterates `reorderSegments`. Hot in every wrapped line.                                                                                                                                                                                                     |
| `reorderSegments(str, levels, baseLevel)` | `:121` | Same permutation as typed-array `[start,end]` pairs (`packages/layout/src/LayoutEngine.ts:2466` comment) — lets the zero-GC buffer path (`layoutPreparedIntoBuffer`) apply it without allocating `BidiNode` objects per glyph. Synthesizes `embed = { levels, paragraphs:[{level: baseLevel}] }` so L1 resets to the paragraph direction. |

Costo: una pasada`bidi-js`por párrafo. No hay trabajo por glifo más allá de la compilación de la matriz en `reorderVisual`.

### 2.2 `packages/text/src/ArabicShaper.ts:18` — contextual shaping

Sustitución del formulario de presentación para el bloque árabe más extensiones persa/urdu. `MAPPINGS: { [code]: GlyphForms }`(`:18`) registra`isolated/initial/medial/final`puntos de código y`joining: 'D'|'R'|'U'`por punto de código. Tatweel`U+0640`es`'D'`pero emite el mismo punto de código en todos los formularios (`:052`), por lo que la unión pasa.

-`isHarakat(code)`(`:70`) —`U+064B–065F`,`U+0670`,`U+0610–061A`(signos honoríficos),`U+06D6–06ED`(anotaciones coránicas) más los tres rangos de marcas adyacentes al harakat. Todos tienen un tipo de unión TRANSPARENTE: la configuración debe omitirlos o el texto honorífico se desconecta. Espejos`MSDFFont.ts:isNonspacingMark`(`:132`).
\-`getJoiningType(code)`(`:84`) — búsqueda de tabla,`'U'`cuando está ausente.
\-`shapeArabic(text)`(`:89`) — caminata única de izquierda a derecha: anticipación de ligadura (`lam+alef``U+0644` +`U+0627/0622/0623/0625`→ ligadura de presentación,`k`puntero`:105`),`connectPrev`/`connectNext`(`:182`/`:187`) calculado escaneando hacia atrás/adelante sobre marcas transparentes,`glyph = forms.isolated/initial/medial/final`. Devuelve`{ shapedText, indexMap: Int32Array }`(`:1`) -`indexMap[visualIndex] = sourceOffset`para que`LayoutEngine`pueda recuperar`sourceIndex/sourceLength`después de darle forma.

Contrato de selección: las posiciones visuales se reordenan, pero`sourceIndex`siempre indexa la cadena lógica original.

### 2.3 `packages/text/src/measureContext.ts:41` — measure where you paint

El módulo que existe para aplicar una invariante. Un`HTMLCanvasElement`separado resuelve familias genéricas (`monospace`,`serif`) en una **fuente diferente** que el lienzo adjunto del documento en Gecko, porque el mapeo genérico→real vive en una preferencia de fuente por idioma accesible solo desde un contexto de estilo en vivo.

Tabla de encabezado (`:1`): Firefox 153,`<html lang="zh">`, DPR 1.5789,`measureText('MMMMMMMMMM')`- separado`22px monospace`109.7, adjunto 131.6, diseño 132.0; separado`serif`109.7/205.5: ambos colapsaron en un respaldo codificado, error del 20 al 47 %. Cromo no afectado. `OffscreenCanvas`mide 132,0 (coincide con el diseño) pero no se utiliza; estar de acuerdo con el lienzo **pintado** es más importante.

-`createMeasuringContext()`(`:62`) — Lienzo 1×1,`position:absolute;opacity:0;left:-9999px;top:0`,`aria-hidden`, adjunto a`document.body`. `display:none`lo eliminaría del diseño y perdería el contexto de estilo; desconectado es el modo de falla.
\-`getSharedMeasuringContext()`(`:87`): el contexto único compartido (`:41``sharedCanvas` /`sharedContext`). Memoiza`null`(`undefined`vs`null`distinción,`:98`) para que SSR (`typeof document === 'undefined'`) no reintente la creación por glifo. `ctx.font`se establece antes de cada lectura; nada almacenado en caché de ancho viaja con el contexto.
\-`isSharedMeasuringContextAttached()`(`:118`) /`resetSharedMeasuringContext()`(`:130`) — diagnóstico + recuperación para contextos creados antes de que existiera `document.body`. Hoy en día, ninguna persona que llama en el repositorio se recrea automáticamente; patrón de sitio de llamada documentado en `:111`.

Todo medidor debe llamar a esto. `packages/layout/src/measure.ts:42`lo hace. Grepping separado`document.createElement('canvas')`en`packages/`es la auditoría.

### 2.4 `packages/text/src/fontMetrics.ts:14` — DOM-free metrics registry

Para entornos sin ningún lienzo (SSR, trabajador sin `OffscreenCanvas`, pruebas). Valores en **unidades em**, por lo que un registro sirve para todos los tamaños.

-`FontMetricsSource`(`:14`) —`advanceEm(char)`, opcional`measureEm(text)`(con reconocimiento de interletraje),`ascenderEm`/`descenderEm`. La alternativa para`measureEm`es sumar `advanceEm`, es correcta pero elimina el interletraje.
\-`normalizeFamily`(`:45`): solo la primera familia, sin comillas, en minúsculas. Una cadena de respaldo es una preocupación del renderizador, no de un registro.
\-`registerFontMetrics(family, source)`(`:82`),`registerMSDFFontMetrics(family, font)`(`:97`),`createMSDFMetricsSource(font)`(`:114`) —`advanceEm`de`font.getGlyph(code)?.advance`,`measureEm`de`font.layout(text, 1).width`(la única ruta que puede kern - por glifo`GlyphMeasurer`tiene ningún vecino). `ascenderEm`/`descenderEm`de`font.data.metrics`. `hasFontMetrics`(`:154`) es la sonda barata para cortocircuitar cuando no hay nada registrado.
\-`fontMetricsVersion()`(`:64`),`getFontMetrics`(`:141`),`clearFontMetrics`(`:163`). El contador de versiones permite a las personas que llaman almacenar en caché una fuente resuelta y volver a resolverla solo cuando se produce un error, capturando una fuente sin verificar los pines que estaban registrados en ese momento (`:107`en`measure.ts`). `createMetricsMeasurer`(`measure.ts:96`) por lo tanto mantiene`baseVersion/runVersion`de forma perezosa y compara una vez por glifo en lugar de llamar a`normalizeFamily`por glifo (`+13%`se evita la sobrecarga en la ruta activa del medidor).

### 2.4b `packages/text/src/index.ts:1` — the barrel

Reexportaciones`ArabicShaper`,`BidiResolver`,`measureContext`,`PreparedContentGrid`,`MSDFFont`,`fontMetrics`,`Typography`(`:1`). `@vectojs/layout`importa desde`@vectojs/text`(no relativamente) -`LayoutEngine.ts:1``import { ArabicShaper } from '@vectojs/text'` - por lo que el límite del paquete es observable. El singleton`LayoutWorkerManager`también almacena en caché`MSDFFontData`(`LayoutWorkerManager.ts:043`) durante la muerte del trabajador exactamente por esta razón: los datos métricos cruzan el límite del subproceso una vez y deben permanecer disponibles para la ruta alternativa.

### 2.5 `packages/text/src/Typography.ts:4` — baseline in the CSS line box

CSS centra el ascenso y descenso de la fuente en el cuadro de línea; El lienzo se dibuja en una y explícita. Deben estar de acuerdo o un`fillText`y su espejo nativo se ubicarán en líneas base diferentes.

-`BASELINE_CACHE_MAX = 512`(`:12`),`baselineCache: Map<string,number>`(`:4`),`rememberBaseline`(`:14`) — LRU de orden de inserción (eliminar+restablecer al acceder,`:98`). 512 cubre todas las fuentes de un documento realista; una falla vuelve a medir un`'Mg'`.
\-`splitFontShorthand(font)`(`:33`) — anclado en`indexOf('px')`y retrocediendo sobre dígitos, no`/(\d+)px/`(polinomio ReDoS, `js/polynomial-redos`, alto). Refleja analizadores en`@vectojs/ui`/`@vectojs/markdown`con valores de error intencionalmente diferentes.
\-`registeredBaseline(font, lineHeight)`(`:67`) — DOM: ruta libre desde`getFontMetrics`. `(lineHeight - ascent - descent)/2 + ascent`con`descent = -descenderEm * size`; reserva`lineHeight * 0.8`.
\-`cssLineBoxBaseline(font, lineHeight)`(`:93`) - elección ordenada: SSR→`registeredBaseline`; visita de caché → retorno; `getSharedMeasuringContext`(adjunto,`:107`) →`ctx.measureText('Mg')`→`fontBoundingBoxAscent/Descent || actualBoundingBoxAscent/Descent`(`:112`) → misma fórmula de centrado; métricas degeneradas →`0.8`respaldo. Los mismos`0.8`anclajes constantes`LayoutEngine.ts:shiftedExtent`(`:668`) y la geometría del cuadro de líneas`1.5 * pMax`/ `0.8 * pMax`.
\-`clearCssLineBoxMetrics()`(`:122`): llamada después de que una fuente web termina de cargarse.

### 2.6 `packages/text/src/MSDFFont.ts:151` — GPU text

Analiza`msdf-atlas-gen`JSON (tipo`msdf`/`mtsdf`/`sdf`), presenta quads en CSS píxeles con atlas UV. Convenciones del renderizador: espacio local y hacia abajo, origen superior izquierdo; UV`v=0`en la parte superior del atlas (sin giro Y al cargar).

- Interfaces:`MSDFAtlasInfo`(`:16`,`distanceRange/size/width/height/yOrigin`),`MSDFMetrics`(`:32`,`lineHeight/ascender/descender`),`MSDFBounds`(`:45`),`MSDFGlyphDef`(`:53`,`unicode/advance/planeBounds/atlasBounds`),`MSDFKerning`(`:64`),`MSDFFontData`(`:71`),`PositionedGlyph`(`:79`,`x/y/w/h + u0/v0/u1/v1`),`MSDFLayoutResult`(`:96`,`glyphs/width/height`),`MSDFLayoutOptions`(`:105`).
  \-`kernKey(a,b)`(`:115`) —`a * 0x110000 + b`; `isNonspacingMark(code)`(`:132`): lista de rango explícita (barata en bucle por glifo, sin expresión regular `\p{Mn}`), refleja`LayoutEngine.ts:isComplexScript`(`:584`).
  \-`MSDFFont`(`:151`) —`id`(`font-${idCounter++}``:164` ),`byCode: Map<number,MSDFGlyphDef>`,`kern: Map<number,number>`,`missingAdvance`(`:158`, espacio →`.notdef`→`0.5`). `parse`(`:173`),`getGlyph`(`:178`),`distanceRange`/`atlasWidth`/`atlasHeight`(`:183`).
  \-`layout(text, fontSizePx, opts)`(`:201`) — reconoce puntos de código (`Array.from(text)``:212` ), respeta`\r\n`/`\r`como una interrupción (`:214`), falta glifo →`missingAdvance * size`(nunca 0, o los glifos posteriores se desplazan hacia la izquierda) excepto`isNonspacingMark`que avanza 0 (`:233`) y no reemplaza`prevCode`para el interletraje (`:252`). Kerning`k * fontSize`(`:242`),`baseline = y + (ascender + line*lineHeight)*size`(`:246`),`planeBounds`→quad (`:246`ff),`yOrigin`voltea`v0/v1`(`:250`). Devuelve`{ glyphs, width: maxAdvance, height: (line+1)*lineHeight*size }`.

### 2.7 `packages/text/src/PreparedContentGrid.ts:38` — the retained grid plan

Geometría inmutable y con reconocimiento de fuente para texto de cuadrícula. Compile una vez, comparta entre la pintura del lienzo y la proyección DOM; la resegmentación colocaría bidi, pestañas y glifos anchos de manera diferente.

-`PreparedContentGrid`(`:38`) —`{ kind:'content-grid', revision, source, font, cellWidth, lineHeight, baseline, tabSize, lines }`; `PrepareContentGridOptions`(`:50`); `MutableCell`(`:63`).
\-`graphemeSegmenter`(`:76`,`Intl.Segmenter`con`grapheme`granularidad) con`fallbackGraphemes`(`:107`) que cubren marcas de combinación, selectores de variación, modificadores de emoji, teclas, indicadores regionales, ZWJ. `graphemes()`(`:151`) prefiere`Intl.Segmenter`.
\-`isWideCluster`(`:170`) —`EAST_ASIAN_WIDE`(`:91`, bloques CJK) +`EXTENDED_PICTOGRAPHIC`con sensibilidad`VS16`/`VS15`+`EMOJI_PRESENTATION`+`REGIONAL_INDICATOR`/`0x20E3`. Ancho → 2 columnas.
\-`sourceLines`(`:197`) — posee`\r\n`/`\r`/`\n`; `sourceStart/sourceEnd/nextSourceStart`para que cada compensación posterior sea correcta.
\-`prepareContentGrid(source, opts)`(`:243`) — por línea:`rawCaretBoundaries`de`graphemes(rawLine)`,`ArabicShaper.shapeArabic(rawLine)`(`:270`),`graphemes(shaped)`,`BidiResolver.resolveLevels`(`:273`), celda por grafema formado con`sourceStart/sourceEnd`vía`indexMap`(`:278`),`sourceCaretOffsets`vía`lowerBound`(`:159`),`columns = 0/ tabStop / wide?2:1`(`:298`),`BidiResolver.reorderVisual(visualCells, getBaseLevel(shaped))`(`:315`),`x`pase (`:317`). Congelado antes del regreso.

### 2.8 `packages/layout/src/LayoutEngine.ts` — the prose layout engine

~3,4k líneas, el archivo individual más pesado en la pila de texto. La arquitectura es una **división fría/caliente** entre contratos escritos.

**Mitad fría** (caro, sin restricciones):

-`prepare(text, atlas, size)`(`:1080`) /`prepareRich(spans, atlas, size, baseStyle)`(`:1266`) — ejecuta`Intl.Segmenter`(palabra`:916`+ grafema`:917`), resuelve avances de glifos mediante`glyphWidth`(`:929`, atlas→`GlyphMeasurer`→`0.5em`), forma (`ArabicShaper``:1117` ), resolver bidi (`BidiResolver``:1123` /`:1524`), compilar`PreparedText`(`:462`). El resultado es independiente de`maxWidth`/`maxHeight`/exclusiones. Memorización de párrafos:`paragraphCache: Map<string,PreparedParagraph>`(`:829`) codificado por`${fontSize} ${paragraph}`; variante enriquecida`richParagraphCache`(`:833`) codificada por`${fontSize} ${text} ${styleSig}`donde`styleSig`es una firma de valor RLE sobre campos`TextStyle`+ identidad`InlineObject`(negrita/cursiva/color/href/fontFamily/baselineShift/highlightColor/abbrTitle más objeto `width/height/depth/alt/key`). El cambio de identidad de Atlas borra ambos (`:1095`/`:1275`).

**Ruta rápida de transmisión** dentro de `prepareRich`:`streamShapeCache`( `:839`, caché incremental de una sola ranura). Condiciones en `:1358`: párrafo único, sin`\n`/ `\r`,`!isComplexScript(fullText)`(`:584`- árabe/hebreo/índico/combinación/marcas bidi/modificadores de emoji caen hasta el modelador completo). Cuando`fullText`extiende estrictamente`cache.text`, los estilos son iguales sobre el prefijo (`styleRangeEquals``:682` ,`objectRangeEquals``:628` ), reutiliza palabras de prefijo palabra por palabra y llama a`shapeSimpleRun(fullText, reshapeFrom, ...)`(`:1644`) solo sobre el sufijo. `reshapeFrom`no es`cache.end`pero es el inicio de la ejecución de la misma categoría final (espacios en blanco versus no espacios en blanco), por lo que los límites`Intl.Segmenter`que se disuelven cuando llega el siguiente fragmento (por ejemplo,`"3"+"."+"1"`→`"3.1"`) se reconstruyen correctamente. Estado: enviado, ganancia medida correctamente en el caso extremo, insignificante en documentos realistas (la nota ya limita el costo por párrafo): retenido desde la versión independiente`@vectojs/core`según `forge/findings/text-richtext-and-markdown.md:356`.

**Mitad caliente** (barato, con restricciones):

-`layoutPrepared(prepared, exclusionMask?, exclusions?)`(`:1848`) /`measurePrepared`(`:1772`) /`layoutPreparedIntoBuffer(prepared, buffer, mask?)`(`:2241`) — caminar`PreparedText`palabras, colocar glifos en`currentX/currentY`, honrar`maxWidth`/`maxHeight`,`exclusions: ExclusionRect[]`,`computeLineSegments(top,bottom,maxWidth,exclusions)`(`:504`,`O(n log n)`combinación de intervalos x, complemento dentro de`[0,maxWidth]`), supresión de puntuación huérfana (`suppressLineBreaks``:721` ,`'@'`combinación + combinación de punto de cierre), separación de palabras (`breakPoints`de`U+00AD`o`this._hyphenate`gancho,`hyphenWidth``:490` ), justificar (`textAlign:'justify'`solo en líneas de ejecución múltiple),`shiftedExtent(gfs, shift, pMax)`(`:668`) aplicando la división de cuadro de línea compartida`0.8/0.2`para que un superíndice elevado haga crecer la línea solo cuando saldría del cuadro. `layoutPrepared`asigna`LayoutNode[]`+`LayoutResult`; `layoutPreparedIntoBuffer`escribe matrices de tipo plano sin asignación y aplica el mismo pase BiDi `reorderSegments`.

Otras piezas de soporte de carga:`EMPTY_GLYPH_ATLAS`(`:83`, constante congelada -`Text`/`RichText`páselo para que la nota de párrafo no quede invalidada por llamada mediante un literal`{}`nuevo; medido 2,68 × en diseños de párrafo de 200 × 12`:64`); `unmeasuredGlyphCount()`/`resetUnmeasuredGlyphCount()`/`setUnmeasuredGlyphWarning()`(`:8`-`0.5em`las fabricaciones se cuentan, no son silenciosas;`fallbackToCanvas`(`:380`, triestatal`undefined`vs`true`) solo informa el atlas faltante, no el medidor faltante); `GlyphMeasurer`(`:92`,`measure(char,size,family,bold,italic)`- anulaciones de estilo/familia por ejecución, por lo que`code`en línea mide sus propias métricas,`warnUnmeasured`(`:9`) advertencia de un solo disparo controlada por`unmeasuredGlyphCount`); `TextStyle`(`:113`, ~9 campos:`fontSize/color/bold/italic/fontFamily/lineThrough/baselineShift/underline/highlightColor/abbrTitle/href`— todos los que afectan el avance deben estar en`styleSig`;`fontFamily`estuvo ausente hasta el 30 de julio de 2026 y provocó que se sirvieran`monospace`párrafos`serif`métricas con una tasa de aciertos de caché infinita, latente solo porque el prefijo la rotación de atlas vacío mantuvo`paragraphCache`en 0 visitas); `InlineObject`(`:216`,`OBJECT_REPLACEMENT U+FFFC :198`, fijo`width/height/depth/alt/key/paint``:216` ,`width/height/depth`ya resuelto en px,`paint`(`:301``InlineObjectSurface { drawImage, drawImageRect } :315` ) nunca llamado por el motor,`InlineObjectBox { x,y,width,height } :299`ya incluye`depth`); `cacheStats()`(`:1004`) exponiendo`hits/misses/evictions/hitRate/size/capacity`por`word(500)/grapheme(2000)/paragraph(1000)/richParagraph(1000)`(`:831`mayúsculas) con`resetCacheStats()`(`:1030`) preservando las entradas; `LayoutResult`(`:378``nodes/totalWidth/totalHeight/fallbackToCanvas` ) es la única salida de cada ruta activa; `GridTextEntity`(`components/GridTextEntity.ts:4`, heredado`n`) vs`PreparedContentGrid.ts:243`split deja explícito qué grilla se retiene y cuál es un bucle tonto `fillText`.

Colocación de hot-pass en términos de código: dentro de`layoutPrepared`(`LayoutEngine.ts:2050`ff) el`pMax`por párrafo primero se cultiva para los objetos (`objDescent`/`ascent > pMax*0.8`→`pMax = ascent/0.8`) luego`lineHeight = max(pMax*1.5, pMax*0.8+objDescent)`unidades`computeLineSegments`/`startLine`(`:2004`), seguido de un recorrido de wordQueue (`:2109`) con división de prefijo de guión (`:2123``chosen` /`prefixWidth`/`hyphenWidth`) y un bucle de glifo (`:2159`) cuya ubicación`y`(`:2183`) es de tres brazos: objeto (`currentY + pMax*0.8 - (height-depth)`), línea de base desplazada (`currentY + (pMax-gfs)*0.8 - baselineShift`), simple (`currentY + (pMax-gfs)*0.8`). `exclusionMask`(`:2155`) y la supresión del espacio inicial (`preserveLeadingSpaces``:796` ,`:2180`) son por glifo; `msdfLayout.ts:154`refleja los mismos tres brazos menos las exclusiones.

Contratos de respaldo que vale la pena conocer por `file:line`:

-`GlyphAtlas`( _ICODE001__,_ ICODE002 _) y_ ICODE003__ frente a un literal`{}`nuevo para la identidad de la nota de párrafo (`:83`).
\-`PreparedGlyph`(`:402`,`char/width/style/object/level/sourceIndex/sourceLength/atlasMiss`) —`atlasMiss:true`solo cuando`char.trim().length>0 && !hasGlyph`, por lo que los espacios en blanco nunca marcan el respaldo (`:1134`en`prepare`).
\-`PreparedWord`(`:433`,`glyphs/width/isWordLike/isWhitespace/breakPoints`) —`width`es una suma almacenada en caché,`breakPoints`de guiones suaves o`hyphenate`.
\-`ExclusionRect`(`:482`) +`computeLineSegments`(`:504`) —`O(n log n)`complemento de intervalos x cubiertos, por línea.
\-`LayoutEngine.isComplexScript`(`:584`, conservador: sobreinforma, por lo que solo el texto claramente libre de contexto califica para la configuración de solo sufijo) y`splitParagraphs`(`:566`,`\r\n|\r|\n`,`consumed`mantiene las compensaciones de origen exactas para que CRLF`\r`nunca se convierta en un glifo de tofu).
\-`shiftedExtent`(`:668`) compartido por los tres recorridos `pMax`: la lógica de crecimiento de línea nunca debe divergir.
\-`suppressLineBreaks`(`:721`, GH-457`'@'`unirse + punto de cierre`.:,;)]}!?`fusionarse con`breakPoints`rebase).
\-`LayoutBuffer`(`:2449`,`{ glyphs: PositionedGlyph[], widths: Float32Array, levels: Uint8Array }`para`layoutPreparedIntoBuffer``:2241` , la ruta de matriz escrita delimitada por`V8_SMI_MAX`que aplica el acuerdo de medida/pintura en el sitio de llamada).

### 2.8b Line breaking, exclusion flow, and justification — the hot-pass placement rules

El pase activo es donde`PreparedText`se convierte en `x/y`. Tres funciones puras fuera del motor y un método interno gobiernan cada decisión de envoltura; deben coincidir entre`LayoutEngine`(`packages/layout/src/LayoutEngine.ts`) y`msdfLayout`(`packages/layout/src/msdfLayout.ts`) o GPU y las roturas del lienzo divergen.

- **`computeLineSegments(top, bottom, maxWidth, exclusions)`(`LayoutEngine.ts:504`)**: el núcleo comprobable del flujo de exclusión. `ExclusionRect { x,y,width,height }`(`:482`) y`LineSegment { x0,x1 }`(`:490`) son los únicos tipos. Espacio puro`O(n log n)`(ordenar bloques) / `O(n)`: recopile intervalos x de`exclusions`superpuestos`[top,bottom)`sujetos a `[0,maxWidth]`, combine intervalos tocados/superpuestos, complemente dentro de `[0,maxWidth]`. Devuelve`[{0,maxWidth}]`cuando nada se superpone,`[]`cuando un rect (o unión) abarca el ancho. Tiempo por línea, no por glifo: llamado una vez por`currentY`avance dentro de`layoutPrepared`(`:2004``segs = computeLineSegments(currentY, currentY+lineHeight, maxWidth, exclusions)` ). `hasEx`guard (`LayoutEngine.ts:1860`) desvía la ruta de no exclusión (segmento único de ancho completo) por lo que el caso común no paga ninguna asignación.

- **`suppressLineBreaks(words)`(`LayoutEngine.ts:721`)** — GH-457 pre-fusión antes de la colocación. Regla 1:`'@'`(`glyphs.length===1 && char==='@'`) se fusiona con cada palabra siguiente que no sea un espacio en blanco (`"@vectojs/core"`permanece atómica). Regla 2: el punto de cierre`.:,; ) ] } ! ?`nunca comienza una línea; se fusiona hacia atrás con la palabra anterior sin espacios en blanco (omitiendo palabras con espacios en blanco, por lo que`"word !"`no forma una pseudopalabra `" !"`). Se debe cambiar la base de`breakPoints: number[]`al fusionar (`:732``+ offset` ,`:791``+ prev.glyphs.length` ) o las oportunidades de guión suave aterrizan en índices de glifos incorrectos en sentido descendente. Reflejado en la lógica`msdfLayout.ts:195``isOrphanPunct` /`breakableAnywhere`(CJK `code >= 0x2e80`).

- **Separación de sílabas**: dos fuentes que llenan el mismo`PreparedWord.breakPoints: number[]`(`LayoutEngine.ts:441`): los guiones suaves`U+00AD`en la fuente son oportunidades de interrupción invisibles (consumidas en el bucle del grafema`:1134``(breakPoints ??= []).push(glyphs.length)` sin avance), y el`LayoutEngine.hyphenate: (word)=>string[]`conectable (`:880`) se consulta por palabra`isWordLike && glyphs.length>3`(`:1144`): sus partes se vuelven a segmentar a través de`getGraphemes`para contar grafemas, no unidades de código. `hyphenWidth`(`:490`, avance de`'-'`vía`glyphWidth`) se mide una vez por`PreparedText`solo cuando alguna palabra lleva`breakPoints`(la omisión no cuesta ninguna medida, y en un nodo sin métricas no incrementa`unmeasuredGlyphs`). En el momento de finalizar, el motor prefiere pausas suaves (`softBreaks: {at,x}[]`en`msdfLayout.ts:131`) y luego vuelve a dividirse con guiones emitiendo un`'-'`quad (`msdfLayout.ts:167``emitHyphen` ). `MSDFTextEntity`impulsa la separación de palabras en el hilo principal mediante`layoutText`anotado; el trabajador nunca llama a la devolución de llamada.

- **`shiftedExtent(gfs, shift, pMax)`(`LayoutEngine.ts:668`)** — compartido por los tres recorridos`pMax`(`measurePrepared`,`layoutPrepared`,`layoutPreparedIntoBuffer`) para que la altura de la línea nunca pueda divergir. El cuadro de línea tiene`1.5 * pMax`de alto con una línea de base`0.8 * pMax`(la misma división que `Typography.ts:93`). Ejecución elevada (`shift>0`, CSS`vertical-align`positivo hacia arriba, superíndice):`need = shift + 0.8*gfs`debe ajustarse a`0.8*pMax`; bajado (`shift<0`, subíndice, signo opuesto a`InlineObject.depth`):`need = -shift + 0.2*gfs`debe caber en`0.7*pMax`. Ejemplo:`0.75em`supershift`~0.3em`cabe dentro de la`0.8*(pMax-gfs)`holgura y no crece nada; un cambio lejano crece`pMax`a`need/0.8`o`need/0.7`. Cada pase de justificación y avance de exclusión se vuelve a calcular contra el`pMax`final.

- **`justifyLines(wrapClosedLines, lineOf, xCoords, codePoints, advances, maxWidth, maxLineWidth)`(`msdfLayout.ts:11`+`LayoutEngine.ts:1937`)** — extiende cada línea envuelta suavemente hasta`maxWidth`. Estrategia: agrupar`indices`por `lineOf`, omitir`wrapClosedLines`falta (última línea de cada párrafo, nueva línea explícita y`hitMaxHeight`truncamiento), luego`slack = maxWidth - (xCoords[lastIdx]+advances[lastIdx])`limitado a la mitad del intervalo de línea (protege contra estiramientos grotescos en líneas muy cortas). Las líneas llenas de espacios amplían los espacios entre palabras`0x20`por igual (`extra = slack / spaceIdx.length`,`shift`acumulador`:58`); Las líneas CJK sin espacios distribuyen`slack / lastContent`entre cada glifo (`:70`). Las líneas de exclusión de varias corridas no están justificadas (`LayoutEngine.ts:1937`guardia de una sola corrida). Debe reflejarse entre`LayoutEngine`y `msdfLayout`; el ancho justificado es la proyección del contenido del contrato reutilizado para`positionedRuns`vs `logicalRuns`.

### 2.9 `packages/layout/src/measure.ts:39` — measurer selection

-`createCanvasMeasurer(family, baseSize=100)`(`:39`) —`getSharedMeasuringContext()`(`:44`),`Map<string,number>`caché por grafema en`baseSize`, escalado lineal`base * (size/baseSize)`(`:68`). Las claves`family/bold/italic`por ejecución previenen el envenenamiento.
\-`createMetricsMeasurer(family)`(`:96`):`FontMetricsSource`registrado (`:106`resolución diferida con comparación`fontMetricsVersion`versionada,`+13%`sobrecarga para la búsqueda por glifo evitada en cada llamada frente a la asignación dentro de`normalizeFamily`). La anulación por ejecución de`family`vuelve a la fuente base cuando se cancela el registro para esa ejecución, no a `0.5em`. Negrita/cursiva ignorada intencionalmente (tabla de avance única por familia).
\-`resolveGlyphMeasurer`(`:161`) — el lienzo supera las métricas de`null`por diseño: mide lo que dibuja el renderizador, incluido el peso sintetizado; un registro obsoleto no debe anular la verdad básica.

### 2.10 `packages/layout/src/msdfLayout.ts:93` — MSDF word-wrap for the worker

Función pura`computeMSDFLayout(request, font)`(`:93`) compartida por el trabajador y el respaldo del subproceso principal (sin importación en tiempo de ejecución; esbuild lo alinea en`LayoutWorker.ts`a través de `LayoutWorkerSource.ts`, por lo que el respaldo del subproceso principal no puede divergir del trabajador). Contraparte de matriz plana de`LayoutEngine.layoutPrepared`sin exclusiones/devolución de llamada de colisión por glifo/estilos enriquecidos: consume`font.glyphs[].advance/kerning`(`byCode/kern`),`metrics{ascender,descender,lineHeight}`(respaldo`0.8/-0.2`cuando está ausente`:118`),`atlas``aw/ah/yOrigin` (`:103`) para geometría UV, pero nunca lee `planeBounds/atlasBounds`: pertenecen a`MSDFFont.layout`en el lado central. Camina`Array.from(text)`(`:176`, codepoint-safe), avanza`curX`por glifo con`kernKey(prevCode,code)`(`:192``+ k*fontSize` ) +`letterSpacing`(`:121`), duplicación de avance cero con marca sin espacio`MSDFFont.ts:132`, guión/punto huérfano`isOrphanPunct`(`:201`, mismo conjunto que`suppressLineBreaks`) y`breakableAnywhere`(`:195`, CJK`>=0x2e80`),`wrapClosedLines: Set<number>`,`softBreaks: {at,x}[]`(`:131`),`lineOf: number[]`(`:107`),`xCoords/yCoords: number[]`,`packedStyles: number[]`(`:104`,`TextStyle`bits empaquetados),`advances: number[]`(`:110`),`codePoints: number[]`(`:101`),`maxLineWidth`(`:114`). En envoltura (`breakLine``:140` ,`dropFrom``:155` ,`emitHyphen``:167` ),`justifyLines(wrapClosedLines, lineOf, xCoords, codePoints, advances, maxWidth, maxLineWidth)`(`:11`) extiende los espacios entre palabras`SPACE(32)`(`:44`) o en distribuciones CJK sin espacio`slack/lastContent`entre cada glifo (`:70`), ambos limitados a la mitad del intervalo de línea para evitar estiramientos grotescos en envolturas muy cortas.

### 2.11 Worker off-thread model

**Límite**:`LayoutWorker.ts:4`(`LayoutWorkerRequest`:`id/seqId/text/fontId/fontData/maxWidth/maxHeight/fontSize/lineHeight/letterSpacing/textAlign`) y`LayoutWorkerResponse`(`:24`:`id/seqId/width/height + Uint32Array codePoints / Float32Array xCoords/yCoords / Uint32Array packedStyles + error?:string`); buffers transferibles en`postMessage`(`LayoutWorker.ts:111`).

**Trabajador**:`packages/layout/src/LayoutWorker.ts:1`— ~115 líneas,`fontCache: Map<string,MSDFFontData>`(`:42`),`isLayoutWorkerRequest`validación (`:53`),`isExpectedOrigin`(`:48`),`self.onmessage`(`:76`) →`fontCache.set`→`computeMSDFLayout(request, font)`→`postMessage(response, [codePoints.buffer, xCoords.buffer, yCoords.buffer, packedStyles.buffer])`. Fuente desconocida → respuesta de longitud cero con forma de error (`LayoutWorker.ts:92`) en lugar de caída silenciosa.

**Administrador**:`packages/layout/src/LayoutWorkerManager.ts:28`— singleton (`getInstance``:206` ),`createWorker`(`:67`) vía`new Blob([WORKER_SOURCE_STRING])`+`URL.createObjectURL`(`LayoutWorkerSource.ts`; espejos`MarkdownWorker`Protector CSP:`typeof Worker/Blob/URL`ausente →`null`→ respaldo del hilo principal, no un lanzamiento). `onmessage`coincide con`${id}-${seqId}`(`:99`) contra`pendingCallbacks: Map<string,PendingLayout>`(`:34`), restablece`consecutiveWorkerFailures`(`:109`). `onerror/onmessageerror`→`handleWorkerFailure`(`:120`),`MAX_CONSECUTIVE_WORKER_FAILURES=2`(`:19`) luego`workerUnavailable=true`→ permanecer en el hilo principal (CSP`worker-src 'none'`medido el 2026-07-31: seis llamadas`queueLayout`generaron seis trabajadores, cero diseños). `fontDataById`(`:043`, retenido de por vida, distinto de`registeredFonts`borrado tras la muerte del trabajador) permite que el diseño alternativo funcione cuando las personas que llaman pasan por`fontData`solo una vez. `warnedUnknownFonts`(`:049`) silencia las advertencias repetidas de la consola. `queueLayout(entityId, opts, callback)`(`:224`) rebota 50 ms (`:314``setTimeout(runLayout,50)` ) y compara`seqIdCounter`para que se ignoren las respuestas tardías; `cancelLayout/cancelLayoutForEntity`(`:220`/`:319`) drena los temporizadores y`prefix === ${entityId}-`entradas de mapas pendientes. `resolvePendingOnMainThread`(`:144`) reproduce todos los`computeMSDFLayout`pendientes directamente cuando el trabajador muere. `errorResponse`(`:176`) sintetiza la forma de respuesta de fuente desconocida.

**Consumidor**:`packages/core/src/text/MSDFTextEntity.ts:25`—`queueLayout()`(`:204`) llama a`LayoutWorkerManager.getInstance().queueLayout(this.id, { id, seqId: ++seqId, text: layoutText, fontId: font.id, fontData: font.data, maxWidth/maxHeight/fontSize/lineHeight/letterSpacing/textAlign }, cb)`; `seqId`monótono por entidad,`lastRenderedSeqId`(`:048`) elimina respuestas obsoletas,`contentEpoch`(`:051`) omite sincronizaciones sin cambios,`rebuildProjectionLines()`(`:273`) reconstruye`projectionLines: ContentProjectionLine[]`para`getContentProjection()`(`:248`). Hyphenator se ejecuta en el hilo principal (no se puede clonar en el trabajador) anotando`layoutText`con `U+00AD`. `watchAtlasDecode`(`:106`) espera la decodificación de la imagen del atlas; `SVGEntity.ts`es la entidad hermana que no es de texto.

### 2.12 Benchmarks, comparisons, and how the numbers are produced

El diseño del texto tiene dos costos honestos: **frío** (segmento+medida) y **caliente** (lugar). Comparar una llamada combinada fría+caliente con una caliente inventa una brecha. El repositorio impone la división de manzanas con manzanas en tres lugares:

- **`benchmarks/text-layout-pretext`** y **`comparisons/text-layout-pretext/*`** (`entry.ts:1`,`page/*`,`serve.ts`,`build.ts`) —`@vectojs/layout`frente a`@chenglou/pretext`. Ambos se miden a través de`canvas measureText`en un navegador real (consulte el encabezado `comparisons/text-layout-pretext/entry.ts:1`: V8 vs Gecko difieren y solo se puede citar una ventana con encabezado respaldado por GPU;`hyprland-browser-bench`posee ese arnés). `prepare`vs`prepareWithSegments`(frío) y`measurePrepared`vs`layout`(caliente) son las únicas mitades comparables; `layoutPrepared`/`layoutText`(que posiciona cada glifo) no tienen contraparte de pretexto y se informan por separado.
- **`scripts/compare-pretext.ts:1`** — la contraparte sin cabeza ejecutada por `benchmarks/bench.ts`. Agrupa`vectojs core`+`pretext`a IIFE a través de `Bun.build`, se inyecta en Chrome controlado por Playwright, establece la verdad DOM a través de`Range.getClientRects().length`por corpus/fuente, luego informa el error de recuento de líneas frente a la verdad más el rendimiento en frío/caliente. Documenta su propia historia: hasta el 4 de agosto de 2026, comparó nuestro`layoutText()`combinado con el`layout()`de pretexto y se marcó en`vectojs-docs/testing-catalog.md:A6`como "aún no son manzanas con manzanas".
- **`vectojs-docs/forge/baselines/*`**: las líneas de base semioficiales que produce el arnés (`glyph-batch-*.json`,`content-projection-frontload-*.json`, etc.). No todos tienen diseño de texto:`glyph-batch`es el costo de carga de glifos WebGL que comparte la ruta de ancho`LayoutBuffer`y`markdown-stream-*`captura la interacción lex+diseño durante la transmisión. Cada uno lleva `commit`, CPU/GPU/entorno de controlador y`refreshHz`a través de`benchmarks/run-browsers.sh`para que una comparación posterior pueda normalizarse.

**Cómo volver a ejecutar localmente** (sin cabeza, sin comillas pero útil para la regresión):`bun run scripts/compare-pretext.ts`(Playwright +`google-chrome-stable`) imprime una tabla de rebajas y escribe`scripts/.compare-results.json`. Para números entrecomillables:`benchmarks/run-browsers.sh`desde la raíz del espacio de trabajo (controla Chrome/Firefox real en el espacio de trabajo dedicado de Hyprland, valida COOP/COEP, detección de inanición).

## 3. Cómo se compone bajo `packages/core`

`MSDFTextEntity.text` →`rebuildLayoutText()`(`:187`, anota guiones suaves) →`queueLayout()`(rebote de 50 ms) →`LayoutWorkerManager`(proceso de trabajo o principal) →`computeMSDFLayout`→ matrices escritas →`MSDFTextEntity.layoutResult`+`projectionLines`→ WebGL`setMSDFTexture`/`addGlyph`por`PositionedGlyph`,`getContentProjection().lines`para a11y,`CanvasGeometry`compensación DPR.

`Text` /`RichText`(`@vectojs/ui`) pasa por`LayoutEngine`+`measureContext`directamente (ruta del lienzo). Mismas invariantes, diferente medidor.

### 2.13 The `GridTextEntity` footnote — retained grid vs retained prose

`packages/core/src/components/GridTextEntity.ts:4` (`class n extends Entity`,`GridTextEntity`) es la entidad de cuadrícula monoespacial heredada (fija`charWidth/charHeight`,`updateGrid(ascii[])``:23` ,`render``:36` ). Es anterior a`prepareContentGrid`y **no** fluye bidi, no da forma al árabe ni respeta `PreparedContentGrid`; es un bucle`IRenderer.fillText`directo (`:44`) sobre un`ascii: string[]`. El reemplazo moderno para cualquier cosa que requiera bidi/CJK/grid a11y es`prepareContentGrid`(`packages/text/src/PreparedContentGrid.ts:243`) con su proyección de cuadrícula de contenido (`01-selection.md`§3.3). `GridTextEntity`queda como "la cosa más tonta que pinta monoespacio" y emerge en`packages/core/test/GridTextEntity.test.ts`y `packages/core/src/index.ts:n`.

## 4. Casos difíciles — fallos medidos

### 4.1 Detached canvas font resolution (Firefox-only)

Greppable como`Intl.Segmenter`(palabra`:916`/ grafema`:917`en`LayoutEngine.ts`,`:76`en`PreparedContentGrid.ts`),`BidiResolver`/`BiDi`(`BidiResolver.ts:3``bidi-js` ),`registerFontMetrics`(`fontMetrics.ts:82`, llamado directamente en`Typography.ts:67`vía`getFontMetrics`e indirectamente desde`measure.ts:75`),`cold/hot split`(`LayoutEngine.ts:459`–`1848`, comentado con ** y`measurePrepared`/`layoutPrepared`/`layoutPreparedIntoBuffer`tríptico), y`zero-GC`(`LayoutEngine.ts:2241``layoutPreparedIntoBuffer` +`msdfLayout.ts:1`matrices planas +`BidiResolver.reorderSegments``:121`). El flujo de exclusión de auditoría es`computeLineSegments``:504` y`ExclusionRect``:482`; La cuantificación de DPR es`PAGE_SCALE_BASIS_PX = 256`(`ContentProjectionManager.ts:71`).

Consulte la tabla §2.3 (`packages/text/src/measureContext.ts:18`): avances monolíticos entre un 20% y un 47% cortos. La solución es el apego; El 0,3% residual (`131.579`vs`132.000`) es Gecko grid-fit a px de dispositivo entero, no evitable (`text-rendering: geometricPrecision`medido idéntico,`:34`). Audite buscando la creación de lienzos separados (`grep -rn 'createElement.*canvas'``packages/` ). `OffscreenCanvas`no es la solución: concuerda con el diseño DOM (`132.000`) en lugar del lienzo pintado (`131.579`).

### 4.2 CJK vs Latin metrics

`0.5em` error medido de reserva`+125%`en glifos estrechos y`-47%`en ancho contra Chrome a 32 px (comentario `packages/layout/src/LayoutEngine.ts:973`). `EMPTY_GLYPH_ATLAS`(`:83`) con un`resolveGlyphMeasurer`real soluciona el error de salto de línea; `createMetricsMeasurer`con`MSDFFont`registrado cura SSR/sin cabeza. Mezclado`CJK | Latin`en un párrafo aterriza en la misma ejecución `layoutPrepared`; `GlyphMeasurer`claves por ejecución`fontFamily/bold/italic`por lo que`monospace`dentro proporcional usa sus propios avances, y`styleSig`incluye todos los campos`TextStyle`que afectan el avance.

### 4.3 BiDi reordering vs selection order

`reorderIndices` es el puente: lógico→visual (`logicalToVisualRuns``:62` ) para rectificaciones resaltadas, columna visual→lógico para pruebas de acierto,`reorderVisual`(`:89`) para orden de pintura. `PreparedContentGrid`mantiene`cells`en orden lógico con el objeto visual`x`(`packages/text/src/PreparedContentGrid.ts:315`); Las compensaciones de selección son compensaciones de origen (lógicas), no índices visuales. Consulte`tmp/boss-research/01-selection.md`§3.2/§4.1 para conocer el operador por grafema +`shapedPaint`la mitad de este contrato y`forge/findings/text-richtext-and-markdown.md:356`(InlineObject) para saber dónde`buildVisualLineGroups`agrupa por`node.y + height*0.8`y divide un chip en su propia línea.

### 4.4 Mixed font fallback in one paragraph

Un párrafo con el estilo`family: 'Noto Sans'`con un intervalo de código `family:'monospace'`. `GlyphMeasurer.measure(char,size,'monospace')`(`packages/layout/src/measure.ts:60`) medidas en esa familia; La familia de gestión desconocida recurre a la fuente base, no a`0.5em`(`:138`). La nota de párrafo`styleSig`incluye`fontFamily`(estuvo ausente hasta el 30 de julio de 2026, latente solo porque la rotación del atlas vacío mantuvo el caché en 0 visitas). Prueba:`benchmarks/text-layout-pretext`/`comparisons/text-layout-pretext`y`scripts/compare-pretext.ts:1`(manzanas con manzanas frías/calientes con`Range.getClientRects`verdad de recuento de líneas).

### 4.5 DPR-sensitive advances

Canvas avanza el ajuste de cuadrícula al dispositivo px; `LayoutEngine``shiftedExtent` /`cssLineBoxBaseline`utilizan la relación de ascenso`0.8`independiente del DPR. El atlas CodeBlock capturó una vez`devicePixelRatio`en la primera construcción (`packages/markdown/src/Markdown.ts:1358`,`GlyphRasterAtlas.ts:139``readonly dpr` ) y se difuminó después del zoom (`forge/findings/text-richtext-and-markdown.md:724`,`sceneDpr 4.286 / atlasDpr 1.579 → blitScale 2.71`). Solución: introduzca`Scene.watchDevicePixelRatio()`(`Scene.ts:2805`) en el atlas DPR. Vuelva a verificar a través de`maxGradient`(borde del pico), no significa luminancia (confundido por monoglifos delgados, medido`0.216→0.251`de manera incorrecta con una discrepancia de 2,71×). La sujeción DPR`min(dpr,3)`en`Atlas.ts:139`es un techo separado; incluso una reconstrucción correcta no puede exceder 3 en un panel `4.286`.

### 4.6 Line ending ownership and CRLF phantom glyphs

`splitParagraphs` (`LayoutEngine.ts:566`) expresiones regulares`/\r\n|[\r\n]/g`y`MSDFFont.layout`(`MSDFFont.ts:213`) consumen el separador **antes** de cualquier paso`ArabicShaper`/`BidiResolver`/`glyphWidth`y registran`consumed`(`:569``m[0].length` ) para`sourceIndex`continuidad. Un`text.split('\n')`ingenuo deja`\r`como último carácter del párrafo: se le da forma, se mide y se coloca como un tofu visible con un ancho `missingAdvance*size`, y cada`sourceIndex`posterior tiene un error de uno por CRLF. `PreparedContentGrid.sourceLines`(`:197`) lleva el mismo contrato (`sourceEnd`excluye la interrupción,`nextSourceStart`es propietario) y además inserta una línea vacía final explícita cuando`source`termina con una interrupción (`:217``if (start===source.length)` ). Prueba:`benchmarks/text-layout-pretext`normaliza la fuente a`\n`para DOM verdad pero mide la fuente sin procesar por separado; la paridad significa que la fuente`"\r\n"`sin procesar produce una cobertura`totalHeight`y`sourceIndex`idéntica a la fuente `"\n"`, solo con una brecha`sourceLength`de 1 por línea.

### 4.7 Hyphenation + orphan-punct + justification must compose in order

Frío: guión suave`U+00AD`(`LayoutEngine.ts:1134`) y devolución de llamada`hyphenate`(`:1144`) ambos contribuyen a`PreparedWord.breakPoints`(`:441`); `hyphenWidth`(`:490`) se mide una vez solo para las palabras que tienen alguno. Caliente:`suppressLineBreaks`(`:721`) rebase`breakPoints`al fusionar para que un guión dividido dentro de`"@vectojs/core"`no aterrice en el medio del token ahora atómico; el recorrido de la cola de palabras (`:2109`ff) prefiere un guión de prefijo (`chosen`escaneo`:2133`) antes de recurrir al ajuste de palabras completas. Consecuencia:`wrapClosedLines`(`msdfLayout.ts:125`) y`justifyLines`(`:11`) ambos leen la decisión de corte final, por lo que arreglar uno sin el otro produce una línea justificada cuyo ancho medido (para proyección) no coincide con su`x`colocado (para tinta). Tanto`LayoutEngine`como`msdfLayout`duplican el guión`+ letterSpacing`+ lógica huérfana; cambiar uno sin el otro es la regresión común.

## 5. Invariantes que los desarrolladores deben mantener

1. **Mida dónde pinta.** Utilice`getSharedMeasuringContext()`(`packages/text/src/measureContext.ts:87`). Grep para`document.createElement('canvas')`callejero sin `appendChild`.
2. **Frío antes que caliente, nunca vuelva a segmentar para DOM.**`prepare`/`prepareRich`una vez,`layoutPrepared`muchas veces (`packages/layout/src/LayoutEngine.ts:1080``/``:1266``/``:1848`). Re-segmentación de turnos descansos y orden bidi.
3. **Cada campo que afecta el avance en`styleSig`.** Si llega a`glyphWidth`llega a`styleSig`/`fingerprint`(`:1266:styleSig`). Omitir uno está latente hasta que los cachés de párrafos restablecen la tasa de aciertos.
4. **La identidad`InlineObject`incluye`key`.** Dos`U+FFFC`con el mismo`alt/width/height`pero diferente`paint`deben diferir en`key`o el segundo pinta la primera imagen (`packages/layout/src/LayoutEngine.ts:268`).
5. **El trabajador es una optimización, nunca un requisito.**`LayoutWorkerManager`se degrada a`computeMSDFLayout`en el hilo de llamada (`:144`) después de dos fallas consecutivas o`Worker`ausente. Fuente desconocida → error escrito, nunca una devolución de llamada colgada (`:176`).
6. **`indexMap`y`sourceIndex`se mantienen fieles a los bytes.** El mapa de índice de configuración árabe (`packages/text/src/ArabicShaper.ts:91`) es la fuente de la verdad; `LayoutNode.sourceIndex/sourceLength`indexa la cadena original, no el texto con forma, por lo que la accesibilidad puede sustituir`InlineObject.alt`sin cambiar las compensaciones posteriores (`forge/findings/text-richtext-and-markdown.md:372`).
7. **Versione el registro de métricas.**`fontMetricsVersion()`(`packages/text/src/fontMetrics.ts:64`) debe leerse antes de almacenar en caché un`FontMetricsSource`; reemplazar las métricas de una familia a mitad del proceso es una ruta de código real (intercambio de fuentes web, datos corregidos).
8. **`0.5em`significa no medido; cuéntelo.** Mire`unmeasuredGlyphCount()`(`packages/layout/src/LayoutEngine.ts:31`) en pruebas/SSR; distinto de cero significa rupturas inventadas, no solo glifos de atlas faltantes (`fallbackToCanvas`es cierto esencialmente en todos los párrafos`Text`/`RichText`y no dice nada sobre la calidad).

## 6. Cómo añadir un nuevo script o estilo sin romper la paridad de métricas

**Nueva escritura (por ejemplo, tailandés, devanagari):**

1. Ejecute`isComplexScript`(`packages/layout/src/LayoutEngine.ts:584`) contra un corpus: el predicado controla el acceso directo de transmisión`shapeSimpleRun`(`:1358`). Cualquier script sensible al contexto debe devolver`true`para que el párrafo tome la ruta completa`shapeArabic`+ `BidiResolver`; de lo contrario, el remodelador de solo sufijo da forma a los grafemas de forma independiente y desconecta silenciosamente el texto que se une.
2. Si las marcas son TRANSPARENTES para dar forma, agréguelas a`ArabicShaper.isHarakat`(`:70`) y`MSDFFont.isNonspacingMark`(`:132`) juntos; son paquetes de hojas que deben coincidir.
3. Agregue cobertura avanzada: MSDF glifos de atlas para el script o métricas registradas (`registerMSDFFontMetrics`,`packages/text/src/fontMetrics.ts:97`). Sin ninguno de los dos,`unmeasuredGlyphs`cuenta cada carácter y los descansos son`0.5em`conjeturas.
4. Verifique con`auditSceneSelection`(`packages/devtools/src/selectionAudit.ts`) en una línea que mezcla el nuevo script con CJK+Latin: el presupuesto de brecha es`PAGE_SCALE_BASIS_PX = 256`cuantización (`ContentProjectionManager.ts:71`), por lo que un script que cambia el avance por vecino es invisible allí.

**Nuevo campo `TextStyle`:**

1. Pregunte: "¿cambia `glyphWidth`?" Si el renderizador lo pinta como un offset/decoración sin cambiar el avance reservado (`underline`,`lineThrough`,`highlightColor`), no hay trabajo de paridad. Si cambia el avance medido (`fontSize`,`fontFamily`,`bold`,`italic`, cualquier cosa que seleccione una ruta`measure`diferente), debe incluirse en`styleSig`/`fingerprint`(`packages/layout/src/LayoutEngine.ts:1266`) y en`styleRangeEquals`(`:682`).
2. Agregue el campo a la igualdad de estilo y la firma juntos: probar solo uno deja al otro como un memorándum venenoso (diferentes párrafos chocan, el mismo párrafo nunca aparece).
3. Agregue crecimiento vertical de estilo`baselineShift`a través de`shiftedExtent`(`:668`) si el campo mueve los glifos verticalmente fuera de`0.8 * pMax`(ascenso) /`0.7 * pMax`(descenso); los tres paseos`pMax`deben llamarlo.

**Nueva regla de salto de línea:**

- Vive en`suppressLineBreaks`(`:721`) o`justifyLines`(`packages/layout/src/msdfLayout.ts:11`). Mantenga la separación de palabras`breakPoints`desplazada al fusionar (`:732``+ offset` ,`:791``+ glyphs.length` ). El estado de ajuste (`wrapClosedLines`,`lineOf`,`softBreaks`) está duplicado entre`LayoutEngine`y `msdfLayout`; cambie ambos.

### 4.8 Vertical mixed — `baselineShift` and inline objects

**`TextStyle.baselineShift`(`LayoutEngine.ts:146`, px,`positive = UP`, CSS`vertical-align`convención)** — renderizado solo horizontal (avanzar sin cambios) pero una medida cambia verticalmente. Los valores lo suficientemente modestos como para ajustarse a la holgura`0.8/0.7 * pMax`dejan la altura de la línea intacta (un superíndice`0.75em``+0.22em` es el caso común); un cambio que colocaría un glifo fuera del cuadro de línea hace que`shiftedExtent`(`:668`) crezca`pMax`, y el valor crecido se propaga en cada avance de`currentY`y llamada de `computeLineSegments`, por lo que el espacio entre _esta_ línea y la siguiente se ensancha, exactamente como lo forzaría un objeto alto en línea. Las personas que llaman no deben reservar espacio vertical; el motor lo hace una vez, en un solo lugar, o los tres`pMax`paseos no están de acuerdo y`measurePrepared`reporta una altura diferente a la que pinta `layoutPrepared`.

**`InlineObject`(`LayoutEngine.ts:216`,`StyledSpan.object``:343` requiere`text===OBJECT_REPLACEMENT`)** — tres números, todos **px en tamaño final** (no escalados por ejecución`fontSize`, a diferencia de los avances de glifo):`width`(avance horizontal),`height`(cuadro total),`depth`(por debajo del valor inicial, positivo hacia abajo, signo opuesto a `baselineShift`). El motor reserva`width`, contabiliza`height/depth`en el crecimiento`shiftedExtent`y reporta el cuadro`LayoutNode.object`posicionado (`x/y`ya incluye`depth`); nunca llama a`object.paint(surface, box)`(`:301`); el procesador de texto lo hace una vez por`LayoutNode.object`. Error:`alt`alcanza la accesibilidad a través de`RichText.accessibleText`(`collectSpans`sustituye`alt`por`U+FFFC`) pero`copy/selection`todavía indexa según el centinela de un carácter en el espacio `sourceText`, por lo que la longitud de`alt`no cambia posteriormente en la aritmética `sourceIndex`. Un segundo error con el mismo síntoma:`paint`**no** es parte de la clave de nota de párrafo (un cierre por llamada la mantendría en 0 visitas para siempre): el sustituto`InlineObject.key`(`:259`) debe diferir cuando`paint`difiere, o dos insignias con el mismo`alt`comparten un párrafo almacenado en caché y el segundo dibuja la primera imagen (reobservada).`forge/findings/text-richtext-and-markdown.md`a11y/InlineObject entradas).

### 4.9 Streaming cost and why suffix-only shaping is not where the time goes

`LayoutEngine.streamShapeCache` (`:839`,`isComplexScript``:584` puerta,`shapeSimpleRun``:1644` ) se introdujo junto con la nota de párrafo (`:829`/`833`) para reducir el costo por fragmento de`O(length)`a`O(appended)`en un Markdown en crecimiento. bloquear (`Markdown.ts:899`transmisión`appendMarkdown`). Medido en el documento sintético de 346 KB (`forge/findings/text-richtext-and-markdown.md:356`): **costo idéntico 2630 ms frente a 2639 ms**. Real Markdown tiene párrafos delimitados (el memorándum existente ya limita la remodelación por párrafo), por lo que la configuración de solo sufijo solo ayuda a párrafos grandes y patológicos. El hallazgo permaneció enviado como una ganancia de corrección (su predicado`isComplexScript`y las comprobaciones`styleRangeEquals`/`objectRangeEquals`evitan la desconexión silenciosa del texto de unión), pero **no** se publicó como una solución de rendimiento en una versión independiente `@vectojs/core`. Al diagnosticar el tiempo de transmisión,`prepareRich`+`measureText`+ sincronización de proyección de contenido (entrada`forge/findings`2026-07-20:`perf.ts``requestAnimationFrame` delta); MSDF cambia el glifo _dibujo_ y`64fps→120Hz`es una ruta separada.

## 5b. Invariantes extendidas (ampliación de §5)

1. **Mida dónde pinta.** Utilice`getSharedMeasuringContext()`(`packages/text/src/measureContext.ts:87`). Grep para`document.createElement('canvas')`callejero sin `appendChild`.
2. **Frío antes que caliente, nunca vuelva a segmentar para DOM.**`prepare`/`prepareRich`una vez,`layoutPrepared`muchas veces (`packages/layout/src/LayoutEngine.ts:1080``/``:1266``/``:1848`). Re-segmentación de turnos descansos y orden bidi.
3. **Cada campo que afecta el avance en`styleSig`.** Si llega a`glyphWidth`llega a`styleSig`/`fingerprint`(`:1266:styleSig`). Omitir uno está latente hasta que los cachés de párrafos restablecen la tasa de aciertos.
4. **La identidad`InlineObject`incluye`key`.** Dos`U+FFFC`con el mismo`alt/width/height`pero diferente`paint`deben diferir en`key`o el segundo pinta la primera imagen (`packages/layout/src/LayoutEngine.ts:268`).
5. **El trabajador es una optimización, nunca un requisito.**`LayoutWorkerManager`se degrada a`computeMSDFLayout`en el hilo de llamada (`:144`) después de dos fallas consecutivas o`Worker`ausente. Fuente desconocida → error escrito, nunca una devolución de llamada colgada (`:176`).
6. **`indexMap`y`sourceIndex`se mantienen fieles a los bytes.** El mapa de índice de configuración árabe (`packages/text/src/ArabicShaper.ts:91`) es la fuente de la verdad; `LayoutNode.sourceIndex/sourceLength`indexa la cadena original, no el texto con forma, por lo que la accesibilidad puede sustituir`InlineObject.alt`sin cambiar las compensaciones posteriores (`forge/findings/text-richtext-and-markdown.md:372`).
7. **Versione el registro de métricas.**`fontMetricsVersion()`(`packages/text/src/fontMetrics.ts:64`) debe leerse antes de almacenar en caché un`FontMetricsSource`; reemplazar las métricas de una familia a mitad del proceso es una ruta de código real (intercambio de fuentes web, datos corregidos).
8. **`0.5em`significa no medido; cuéntelo.** Mire`unmeasuredGlyphCount()`(`packages/layout/src/LayoutEngine.ts:31`) en pruebas/SSR; distinto de cero significa rupturas inventadas, no solo glifos de atlas faltantes (`fallbackToCanvas`es cierto esencialmente en todos los párrafos`Text`/`RichText`y no dice nada sobre la calidad).
9. **`\r`y CRLF nunca tienen forma.**`splitParagraphs`(`LayoutEngine.ts:566`,`PreparedContentGrid.ts:197`) y`MSDFFont.layout`(`MSDFFont.ts:213`) ambos terminan sus propias líneas antes de cualquier paso de forma/medida; un`\r`perdido que se escapa se convierte en un glifo posicionado con un ancho fantasma y un`sourceIndex`incorrecto.
10. **Asignación de espejos Zero-GC: mantenga el pase BiDi sincronizado.**`layoutPreparedIntoBuffer`(`:2241`) debe aplicar la misma permutación`BidiResolver.reorderSegments`(`BidiResolver.ts:121`typed-array) que`layoutPrepared``reorderVisual` (`:89`), y debe reflejar`shiftedExtent`/`computeLineSegments`/`justifyLines`. La deriva aquí es silenciosa hasta que se desplaza un párrafo bidi.

## 6b. Guía extendida (ampliación de §6)

**Nueva escritura (por ejemplo, tailandés, devanagari):**

1. Ejecute`isComplexScript`(`packages/layout/src/LayoutEngine.ts:584`) contra un corpus: el predicado controla el acceso directo de transmisión`shapeSimpleRun`(`:1358`). Cualquier script sensible al contexto debe devolver`true`para que el párrafo tome la ruta completa`shapeArabic`+ `BidiResolver`; de lo contrario, el remodelador de solo sufijo da forma a los grafemas de forma independiente y desconecta silenciosamente el texto que se une.
2. Si las marcas son TRANSPARENTES para dar forma, agréguelas a`ArabicShaper.isHarakat`(`:70`) y`MSDFFont.isNonspacingMark`(`:132`) juntos; son paquetes de hojas que deben coincidir.
3. Agregue cobertura avanzada: MSDF glifos de atlas para el script o métricas registradas (`registerMSDFFontMetrics`,`packages/text/src/fontMetrics.ts:97`). Sin ninguno de los dos,`unmeasuredGlyphs`cuenta cada carácter y los descansos son`0.5em`conjeturas.
4. Verifique con`auditSceneSelection`(`packages/devtools/src/selectionAudit.ts`) en una línea que mezcla el nuevo script con CJK+Latin: el presupuesto de brecha es`PAGE_SCALE_BASIS_PX = 256`cuantización (`ContentProjectionManager.ts:71`), por lo que un script que cambia el avance por vecino es invisible allí.

**Nuevo campo `TextStyle`:**

1. Pregunte: "¿cambia `glyphWidth`?" Si el renderizador lo pinta como un offset/decoración sin cambiar el avance reservado (`underline`,`lineThrough`,`highlightColor`), no hay trabajo de paridad. Si cambia el avance medido (`fontSize`,`fontFamily`,`bold`,`italic`, cualquier cosa que seleccione una ruta`measure`diferente), debe incluirse en`styleSig`/`fingerprint`(`packages/layout/src/LayoutEngine.ts:1266`) y en`styleRangeEquals`(`:682`).
2. Agregue el campo a la igualdad de estilo y la firma juntos: probar solo uno deja al otro como un memorándum venenoso (diferentes párrafos chocan, el mismo párrafo nunca aparece).
3. Agregue crecimiento vertical de estilo`baselineShift`a través de`shiftedExtent`(`:668`) si el campo mueve los glifos verticalmente fuera de`0.8 * pMax`(ascenso) /`0.7 * pMax`(descenso); los tres paseos`pMax`deben llamarlo.

**Nueva regla de salto de línea:**

- Vive en`suppressLineBreaks`(`:721`) o`justifyLines`(`packages/layout/src/msdfLayout.ts:11`). Mantenga la separación de palabras`breakPoints`desplazada al fusionar (`:732``+ offset` ,`:791``+ glyphs.length` ). El estado de ajuste (`wrapClosedLines`,`lineOf`,`softBreaks`) está duplicado entre`LayoutEngine`y `msdfLayout`; cambie ambos.

## 7. Checklist de lectura y verificación

**Orden de lectura para un recién llegado a este jefe:**
`measureContext.ts:1` (invariante sin el cual nada más es honesto) →`fontMetrics.ts:14`→`Typography.ts:93`→`BidiResolver.ts:27`+`ArabicShaper.ts:18`→`PreparedContentGrid.ts:38`(contraparte retenida de la red) vs`components/GridTextEntity.ts:4`(heredado`n`) →`LayoutEngine.ts:916`(`Intl.Segmenter`) →`:929`(`glyphWidth`) →`:1080`/`1266`frío →`:1848`caliente →`:504`/`:721`/`:668`reglas de colocación →`measure.ts:39`→`MSDFFont.ts:151`/`msdfLayout.ts:93`→`LayoutWorker.ts:1`/`LayoutWorkerManager.ts:28`→`MSDFTextEntity.ts:25`. Verifique con`01-selection.md`§§3–4 después de`PreparedContentGrid`antes de regresar al camino candente de la prosa.

**Auditoría rápida después de cualquier cambio que pueda mover glifos:**

- [ ]`unmeasuredGlyphs`(`LayoutEngine.ts:31`) sigue siendo 0 en la carga de trabajo tocada (o las nuevas marcas son la causa y ahora están cubiertas por `registerMSDFFontMetrics`).
- [ ]`cacheStats()`(`LayoutEngine.ts:1004`)`hitRate`no bajó a 0: todos los estilos que afectan el avance todavía están en`styleSig`/`fingerprint`y`styleRangeEquals`/`objectRangeEquals`.
- [ ]`auditEntitySelection`/`auditSceneSelection`(`packages/devtools/src/selectionAudit.ts`) en una línea con mucho interletraje + una línea mixta CJK/emoji + una línea bidi: delta permanece`<0.5px`.
- [] Respaldo del trabajador cubierto:`scripts/compare-pretext.ts:1`DOM verdad (`Range.getClientRects`número de líneas) todavía coincide con las rutas frías (`prepare`/`prepareWithSegments`) y activas (`measurePrepared`/`layout`).
- [] El documento`\r\n`/ solitario`\r`muestra el mismo recuento de líneas que su gemelo _ICODE022_ -normalizado, sin fantasma _ ICODE023__ glifo y`sourceIndex`contiguos en CRLF.

## 8. Punteros

- Puntos de referencia:`benchmarks/text-layout-pretext`(`bench.ts`),`comparisons/text-layout-pretext/entry.ts:1`(`corpus()`,`buildAtlas()`,`preparePhase()`/`layoutPhase()`),`comparisons/text-layout-pretext/page/*`,`scripts/compare-pretext.ts:1`(división en frío/caliente,`Range.getClientRects`DOM verdad, manzanas con manzanas`measurePrepared`vs`pretext.layout`; también la verificación de cordura de un solo píxel iluminado contado `CanvasRenderer`,`forge/findings:text-richtext-and-markdown.md:564`, que advierte no contar dos veces un segundo`CanvasRenderer`en un`Scene`).
- Líneas base:`vectojs-docs/forge/baselines/*`(`glyph-batch-chrome-*.json`,`content-projection-frontload-*.json`, etc.) y`vectojs/benchmarks/bench.ts`. Cada uno lleva`commit`, CPU/GPU/controlador y`refreshHz`a través de`benchmarks/run-browsers.sh`.
- Hallazgos (solo agregar, nunca reescribir):`vectojs-docs/forge/findings/text-richtext-and-markdown.md`(23 entradas: lienzo separado Firefox 2026-08-02 `:461`,`InlineObject.alt`nunca llega a AT `:364`, tres construcciones GFM descartadas silenciosamente `:508`, desenfoque de bloque de código DPR `:724`, transmisión re-lex cuadrática `:624`, resultado negativo que forma solo sufijo`:356`- costo idéntico`2630ms vs 2639ms`en documentos realistas, párrafos acotados).
- Ruta de cuadrícula:`tmp/boss-research/01-selection.md`para la mitad del terminal/editor y los detalles de cuantificación/superposición/portador por grafema de DPR no se repiten aquí.
- Capa Entity:`packages/core/src/text/MSDFTextEntity.ts:25`+ `SVGEntity.ts`,`packages/core/src/components/GridTextEntity.ts:4`(heredado `n`) vs`packages/text/src/PreparedContentGrid.ts:243`(cuadrícula retenida),`references/text/pretext`clon de solo lectura,`packages/layout/src/LayoutWorkerSource.ts`(generado, sin edición) y`SPEC.md`para el contrato lienzo→GPU en`PositionedGlyph`cuatriciclos. Los puntos de referencia directos son comparativos, no prescriptivos: el pretexto es solo texto, VectoJS alimenta glifo + selección + a11y, por lo que "cuál es más rápido en el salto de línea" es justo y "cuál debería usar" no lo es.
