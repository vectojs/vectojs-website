---
title: '05 — TeX sin DOM — Composición y emisión SVG'
description: 'Por qué el kernel KaTeX → emisor VectoJS → SVG autocontenido, las invariantes de espacio de coordenadas, trampas de geometría elástica y la vía segura hacia un nuevo constructo TeX.'
order: 25
---

# 05 — TeX sin DOM — Composición y emisión SVG

> **Boss 05** posee el contrato que convierte una cadena TeX en un SVG autónomo sin ningún navegador (sin DOM, sin motor CSS, sin fuentes web) y que mantiene cada cuadro, clip y glifo elástico geométricamente fiel a lo que KaTeX habría representado en un navegador.
>
> - **Lo que aprenderá**: por qué KaTeX se vende como kernel de diseño y dónde termina el trabajo del navegador; el span-tree → SVG tubería de emisiones; los cinco espacios de coordenadas/transformación donde un solo cuadro incorrecto rompe cada tramo; el grupo de errores históricos que se asigna directamente a esos espacios; y la forma segura de agregar una nueva construcción TeX.
> - **Lo que no**: Unicode/BiDi, configuración árabe o`LayoutEngine`salto de línea; el jefe 02 es el propietario de esos; Markdown conciliación de transporte y streaming de trabajadores — jefe 04; `GlyphRasterAtlas`/`SVGRasterCache`Rutas DPR - jefe 07; el contrato`IRenderer`en sí.

## Por qué existe TeX sin DOM

El propio`buildHTML`(`packages/tex/src/kernel/VENDORED.md`) de KaTeX emite un árbol de extensión cuya geometría depende de dos motores externos: **CSS diseño** (`position: relative`+`top`,`display: table-cell`+`vertical-align`) para ubicación vertical, **diseño de texto en línea** para x y **resolución de fuente web** (CSS clase → archivo de fuente → glifo) para tinta. `@vectojs/markdown`no puede pagar ninguno de esos: un`SVGEntity`rasteriza a través de`data URI → Image → createImageBitmap → drawImage`(`packages/tex/src/index.ts:8`). Un`Image`cargado desde un URI de datos no resuelve ninguna URL externa y no hereda ninguna página CSS, por lo que ni la salida HTML/CSS de KaTeX ni ningún enfoque basado en fuentes web sobrevive al viaje. El SVG debe llevar **sus propios contornos**.

El resultado es una restricción estricta: el SVG emitido no lleva referencias externas: no `<text>`, no `font-family`, no `url()`, no`xlink:href`(encabezado `packages/tex/src/emit/svg.ts:1`). Esa restricción es lo que justifica un nuevo paquete en lugar de una configuración KaTeX.

El tamaño es el presupuesto del programa que eligió esta forma sobre las alternativas (`vectojs-docs/forge/decisions/math-engine-2026-08.md:30`): una descomposición`bun build --splitting`de`mathjax-full@3.2.2`midió **84% de gzip en la salida SVG + fuentes incrustadas**, solo ~16% en la capa de entrada TeX, por lo que la palanca es una **lista blanca de glifos**, no un recorte de paquete. Se midió que KaTeX no tenía **ninguna salida SVG** ( la enumeración`src/kernel/Settings.ts:206`es exactamente`["htmlAndMathml","html","mathml"]`), y una compilación mínima de RaTeX`wasm32`medida **1 010 901 gzip / 768 278 brotli - 1,47 veces el fragmento MathJax que reemplazaría** (`math-engine-2026-08.md:103`), por lo que WASM no gana el eje para el que existe este trabajo.

## Qué está vendorizado y qué es nuestro

`packages/tex/package.json:14` la orden de construcción documenta la división. `packages/tex/src/index.ts:25`es el mapa, con las líneas de contrato para leer en lugar de redescribir:

-`src/kernel/`— KaTeX (MIT), copiado por`scripts/vendor-katex.ts`de una **compromiso fijada** (`references/markdown/KaTeX@5a5bf206`,`forge/decisions/math-engine-2026-08.md:191`) y despojado mecánicamente de MathML y emisión DOM. **No se ha reformateado ni se ha reparado la pelusa**, por lo que los archivos se mantienen diferenciables con respecto a los anteriores. `VENDORED.md`nombra los conjuntos conservados y eliminados; `.oxlintrc.json`y`tsconfig.build.json`excluyen el kernel exactamente por este motivo (nota al pie de página `math-engine-2026-08.md:312`).

- `src/registry/`: dos archivos escritos a mano (`defineFunction`,`defineEnvironment`) que ninguna transformación a nivel de token puede producir, porque`mathmlBuilder`aparece en la posición de expresión allí (`src/index.ts:30`). Su trampa`sideEffects:false`es lo que hizo que el paquete de la Fase 1 no fuera funcional (`math-engine-2026-08.md:294`Corrección 5), por lo que`package.json`**no debe** ser `sideEffects:false`: los efectos secundarios de importación pueblan`functions`/`environments`y la agitación de árboles eliminaría todas las funciones integradas.
  \-`src/emit/`+`src/layout.ts`— el nuestro, los únicos archivos que toca la discusión emitida.
  \-`src/glyphs/glyphs.subset.json`— Esquemas TTF → SVG rutas a través de `scripts/generate-glyphs.ts`, reducidas por `scripts/subset-glyphs.ts`, recodificadas por`scripts/encode-glyphs.ts`+`src/emit/glyphCodec.ts`(formato binario de Fase 2, `math-engine-2026-08.md:282`). La tabla de tiempo de ejecución enviada se decodifica en cadenas de ruta **idénticas en bytes** al extractor de la Fase 1 (`glyphCodec.test.ts`aserción de identidad) y está **12,0% por debajo de un subconjunto TTF de los mismos glifos** (`math-engine-2026-08.md:328`).

## El pipeline — mapa de ficheros

```text
TeX string  ──►  layout(tex, opts)                         layout.ts:62
                 Settings(displayMode,maxSize,strict)  ·─► kernel/Settings.ts
                 parseTree → AST                       ·─► kernel/parseTree.ts + Parser.ts
                 buildHTML(tree, Options) → DomSpan    ·─► kernel/buildHTML.ts + buildCommon.ts:552 makeVList
                      │ height/depth/style.top already resolved
                      ▼
                 DomSpan tree                          layout.ts:84-89  (wrapped in vecto-tex root)
                      │
                      ▼
                 emitSVG(tree, {emPx,color,padEm})     emit/svg.ts:1567  EmitResult{svg,width,height,depth,missing,placements}
                   walk → EmitState{glyphs,rects,paths,lines}
                   viewBox = layout box ∪ ink union + pad
                   defs deduplication + grouped fills + clipPaths
                      │
                      ▼
                 MathRender{uri,widthEx,heightEx,depthEx}  markdown/src/markdown-math.ts:544 convertMathToSVGDataURI
                   bounded mathCache (256) + inlineMathRasters (LRU, 256)
                   lazy import via preloadMathJax()
                      │
                      ▼
                 InlineObject{width,height,depth,alt,paint}  markdown/src/markdown-inline.ts:287 inlineMath arm
                   InlineObjectBox in LayoutEngine lines, paint draws the raster
```

`layout` (`layout.ts:62`) es`buildTree`de KaTeX sin los contenedores`.katex`/`.katex-display`que llevan la semántica CSS solo del navegador (`layout.ts:5`). Su única opción interesante es`throwOnError:true`+`strict:false`(`layout.ts:68`): se produce un error de análisis completo para que la persona que llama pueda degradar y mostrar la fuente TeX palabra por palabra (lo que`@vectojs/markdown`ya hace para comandos desconocidos); una violación del rigor no.

`emit/svg.ts:1` hace las tres cosas que el navegador habría hecho de otro modo, nombradas en su propio encabezado porque cada una ha costado errores reales:

1. **Resolver glifo → contorno.**`SymbolNode`lleva texto más métricas pero **no la fuente** (`fonts.ts:57``CLASS_TO_FACE` ). `\left(`produce un`SymbolNode`con una lista de clases vacía bajo un ancestro `delimsizing size1`; al resolver localmente se elegiría`Main-Regular`y se dibujaría un par corto donde pertenece uno alto (`math-engine-2026-08.md:444`medido: 105/105 correcto a través de la cadena de ancestros, 97/105 sin;`svg.ts:427``walk``classChain`parámetro).
2. **Acumular x.** El árbol de extensión no contiene x en absoluto; solo`functions/rule.ts:44`escribe `Span.width`, y ahí significa un rectángulo. Cada dos x es un diseño de texto en línea, por lo que el emisor suma los avances por glifo de la tabla TTF`hmtx`(`svg.ts:492``getGlyph` +`advance`;`math-engine-2026-08.md:432`señala por qué`hmtx`no `fontMetricsData.width`: la combinación de acentos es 0 avance, por lo que una marca se superpone a su base, mientras que las métricas afirman 1,0–2,33 cm).
3. **Convertir CSS ubicación vertical → y explícita.**`makeVList`codifica cada fila como`style.top = -pstrutSize - currPos - elem.depth`contra un hermano`pstrut`de altura `pstrutSize`; la conversión lee`pstrutSize`nuevamente fuera del árbol (`svg.ts:1029`) y usa `rowY = y - (-(top + pstrutSize)) * UPEM * scale`; nunca vuelve a derivar el diseño KaTeX (`svg.ts:32`,`math-engine-2026-08.md:417`#1).

La unidad del emisor es **1/1000 em** (`svg.ts:52``UPEM` ), lo que coincide con el`UNITS_PER_EM`(`glyphTable.ts:49`) de la tabla de glifos y con el viewBox 1000:1 documentado de `svgGeometry.ts`. `y`es **positivo hacia abajo desde la línea base**. El glifo describe el envío y-up, por lo que cada uno se coloca dentro de`scale(1,-1)`en lugar de reescribir su ruta (cadena`svg.ts:1552``transform`; reescribir costaría precisión y anularía la deduplicación).

El contenedor de Markdown (`markdown-math.ts`) luego escribe a través de esta tubería **perezosamente**:`preloadMathJax`(`markdown-math.ts:85`, solo escribe`import type {emitSVG,layout}`en la línea 6 para que una importación de valor no atraiga el motor a cada consumidor) dinámico-`import('@vectojs/tex')`, almacena en caché`MathRender`en 256 entradas más un mapa ráster LRU en el mismo límite (`markdown-math.ts:218``mathCache` ,`markdown-math.ts:238``inlineMathRasters` ;`inlineMathRasters`ilimitado fue un hallazgo P3 -`forge/findings/text-richtext-and-markdown.md:1924`) y emite matemáticas en línea como`InlineObject`con`width/height/depth`en px a través de`exToPx`(`markdown-math.ts:143`,`markdown-inline.ts:305`) y`paintInlineMath`(`markdown-math.ts:331`). Las matemáticas de visualización son`MathBlock extends MarkdownContainer`(`markdown-math.ts:598`). Ninguno de los archivos tiene una ventaja de valor estático para `@vectojs/tex`: un segundo (`KATEX_FONT_SCALE` se volvió a declarar como no importado en`markdown-math.ts:484`por este motivo; la igualdad se afirma en `test/mathBoxGeometry.test.ts`).

### Resolución de fuentes — la cadena completa

`fonts.ts:194``resolveFont(classes)`escanea el`classChain`acumulado a través de tres mapas en prioridad:

-`DELIM_SIZE_FONTS`(`fonts.ts:98`por ejemplo,`delimsizing size1 → Size1-Regular`): más alto, porque los delimitadores elásticos llevan esto a un antepasado, no al `SymbolNode`.
\-`DIRECT_FONT_CLASSES`(`fonts.ts:120`por ejemplo`mathbb → AMS-Regular`,`mathcal → Caligraphic-Regular`).
\-`CLASS_TO_FACE`(`fonts.ts:57`por ejemplo`mord textit → Main-Italic`,`mathbf → Main-Bold`) compuesto a través del respaldo`AVAILABLE`(`fonts.ts:135`- si`Math-BoldItalic`está ausente, cae a`Math-Regular`).

El tamaño es multiplicativo a través de`SIZE_MULTIPLIERS`(`fonts.ts:263`, verificado con`katex.scss $sizes`y`kernel/Options.ts sizeMultipliers`por la protección contra deriva del proveedor; consulte § Protección invariante del proveedor) a través de`sizingRatio`(`fonts.ts:265`). Tanto la fuente como la escala se resuelven a partir de la cadena **completa** en cada nodo, no solo en la hoja.

### Tabla de glifos y conexión — una imagen

Un`SymbolNode`→ un esquema:`walk`pasa su`classChain`a`emitSymbol`(`svg.ts:427`), que resuelve la fuente a través de`resolveFont`, busca el esquema a través de`getGlyph(font, code)`(`glyphTable.ts:73`, respaldando`GlyphTable`en`glyphCodec.ts:277`) y presiona un`PlacedGlyph{x,y,scale,font,code}`(`svg.ts:132`) avanza`glyph.advance/UNITS_PER_EM * UPEM * scale`(`svg.ts:499`), o, en caso de error, registra`font/U+XXXX`en`state.missing`(`svg.ts:500`) y avanza según el ancho`getCharacterMetrics`suministrado (`kernel/fontMetrics.ts`; superconjunto de los esquemas enviados, `svg.ts:505`). Los caracteres`SymbolNode.text`repetidos **no** se fusionan a través de`node.width`(`buildCommon.ts:296``tryCombineChars` concatena el texto y deja`width`como el primer carácter): cada punto de código se mide individualmente, con un retroceso de avance cero que se advierte una vez cuando fallan tanto la tabla como las métricas (`svg.ts:514``warnedMetricsMisses` , limitado`MAX_CACHED_MISSES = 1024`en`glyphCodec.ts:83`) por lo que un glifo incorrecto no envenena a`penX`/`viewBox`.

## Invariante de espacio de coordenadas

Cada ubicación recorre **cinco espacios** en un viaje desde una lista de clases DOM hasta un píxel final en el`viewBox`de SVG. Un error en cualquiera de ellos rompe todas las construcciones elásticas a la vez, y los dos grupos reales que se rompieron hicieron exactamente eso.

| #   | Espacio                              | Definición                                                                                               | dirección Y                                                      | Escala                                                                                                            | Significado del clip                                               | Dónde                                                                        |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 1   | **Raíz local (em)**                  | `state.x` pen, `y` baseline, all `parseEm` lengths × `UPEM × scale`                                      | +down, baseline origin (`svg.ts:427` `walk` `y`)                 | `sizingRatio(classChain)` accumulated (`fonts.ts:265`)                                                            | —                                                                  | `emitContainer` + `emitSymbol` entry                                         |
| 2   | **Fila local (repetición)**          | `vlist-t > vlist > vlist-r > row` with `rowY = y - above` (`svg.ts:1080`)                                | +abajo, línea base vlist                                         | mismo                                                                                                             | Row indent `dx = startX + indent + marginLeft`                     | `emitVList` probe + replay (`svg.ts:1031-1180`)                              |
| 3   | **Post-transformación (ruta local)** | `<path transform="translate(x,y) scale(sx,sy)">` maps local → root user space                            | svg user space, y-down outside `scale(1,-1)` per glyph           | glyph: `scale / -scale`; stretchy: `sx = scaleWidth/vbW, sy=heightEm/vbH` (`svg.ts:612`)                          | `viewBox` of width `400em` at `sx` → `scaleWidth`                  | `emitSvgNode` + final `body` transform strings (`svg.ts:584`, `svg.ts:1569`) |
| 4   | **ClipPath local**                   | `<clipPath><rect>` resolved **after** the referencing element's transform (SVG `userSpaceOnUse` default) | **Post**-transformar espacio de usuario                          | inverse: `invSx=1/sx,invSy=1/sy` (`svg.ts:1555`)                                                                  | **Debe emitirse en el propio marco del camino**                    | `svg.ts:1550-1562` `clipPath` rect                                           |
| 5   | **Markdown caja (ex/px)**            | `MathRender{widthEx,heightEx,depthEx}` then `exToPx(…,runSize)` → `InlineObjectBox`                      | LayoutEngine line box, baseline + depth (`markdown-math.ts:566`) | `EX_PER_KATEX_EM = KATEX_FONT_SCALE/EX_PER_EM` (`markdown-math.ts:514`, 0.02% verified vs real KaTeX in Chromium) | padded by `MATH_PAD_EM=0.05` (`markdown-math.ts:481`) on all sides | `markdown-math.ts:544` + `markdown-inline.ts:305`                            |

**El invariante** (lo que debe contener en cada ruta que emite una rama recortada o superpuesta): la ventana`PlacedPath.clip`se registra en el **espacio raíz** (`svg.ts:146-170`,`emitSvgNode`la semilla de`min-width`), traducida por cualquier`aligned-vlist`reproducción`dx`(`svg.ts:1196``clip.x += dx` ), luego emitida después invirtiendo por`sx/sy`(`svg.ts:1555`). Un espacio de uno en uno entre 3 y 4 extravía cada radical y refuerzo excesivo por`p.x + sx·clip.x`en lugar de`clip.x`(`CHANGELOG:31`#787).

## Geometría elástica — las tres familias

La geometría de un elemento elástico **no está en`Span.width`**. Sólo`functions/rule.ts:44`escribe eso. Tres familias, tres hechos coordinados diferentes; mezclarlos es cómo ocurrieron los errores.

### Glifos ordinarios y reglas

-`PlacedGlyph.x`es una raíz absoluta x; `width`es`advance/UPEM * scale`. Sin viewBox, sin corte, sin `clip`.
\-`PlacedRect`tiene una de tres formas: una regla en`Span.width`(`svg.ts:903`), una regla/borde de ancho completo (`borderBottomWidth`/`.angl`/`\boxed`bordes en`svg.ts:800``fullWidth:true` , resuelto por`placeRect`en`svg.ts:1256`), o un separador vertical (`vertical-separator`en`svg.ts:718`→ trazo`PlacedLine`). Las formas de ancho completo contribuyen **sin avance**: la ausencia de`span.width`es significativa.

### Elásticos de un solo camino hide-tail

`\sqrt` y`\phase`emiten cada uno un`SvgNode`de 400em de ancho bajo una envoltura cuyo CSS es`overflow:hidden`(`hide-tail`en`katex.scss:513`).

- `\sqrt`: el contenedor escribe **en línea**`style.minWidth = 0.853em`(`kernel/delimiter.ts:533`), que`emitContainer`lee en`svg.ts:969``clipEm = parseEm(style.minWidth) || parseEm(style.width)` . Entonces`emitSvgNode`genera`state.x + clipEm*scale`como`widthEm`y`clip.w`(`svg.ts:590`). El`sx`de la ruta de 400 em usa`rawWidthEm`(no `widthEm`), por lo que un`slice`se representa en su escala declarada y se recorta, no se aplasta.
- `\phase`: el contenedor escribe **solo`style.height`** (`kernel/functions/enclose.ts:60`). No hay`minWidth/width`en línea, por lo que`clipEm`permanece`undefined`y`hideTail`es`unclippedHideTail === true`(`svg.ts:971`). El niño no avanza como 400em (`svg.ts:966``emitOverlayPiece` con`FULL_WINDOW: 0..1 xMinYMin`). En cambio, toda la extensión del contenedor es el clip (el análogo`markdown`en`markdown-math.ts:92`no está relacionado; la lógica es `svg.ts:966`).

La sutileza: donde`minWidth`**existe** el clip se siembra en línea y`emitSvgNode`es correcto; donde **no**, el clip está pendiente y debe diferir hasta la extensión de la vlist adjunta (consulte el n.º 667 a continuación). Dos rutas de código para la misma clase contenedora.

### Overlays de múltiples piezas

`\overbrace` /`\underbrace`/`\xleftrightarrow`/`\xrightarrow`divide una ruta de 400 em en **2–3 tramos** que son`position:absolute`ventanas de porcentaje (`stretchy.ts:238``widthClasses = brace-* / halfarrow-*` ; CSS en`katex.scss:519`).

- El`SvgNode`de cada pieza nuevamente declara `width:"400em"`, tomándolo literalmente medido`\overbrace{x+y}`en **1200em** (3×400) (`CHANGELOG:31`).
- Las piezas se registran como **avance cero**`PlacedPath.overlay:{start,end,align,vw,vh}`(`svg.ts:195`,`emitOverlayPiece`en`svg.ts:629`) y se resuelven solo una vez que se conoce la fila vlist adjunta `width`: escala de cobertura uniforme`s = max(boxW/vw, boxH/vh)`, alineación por pieza`preserveAspectRatio`(`xMinYMin / xMidYMin / xMaxYMin`en`svg.ts:1286``placeOverlay` ), ventana recortada a`boxX = startX + start*width`.

## Cinco invariantes que el emisor nunca debe romper

Estos cerraron el lote y desde entonces han sido la forma más costosa de retroceder:

1. **`classChain`lleva la fuente.** Un`SymbolNode`frecuentemente tiene una lista de clases vacía; la fuente está en un antepasado. La resolución local dibuja silenciosamente un delimitador alto donde pertenece uno corto y un par corto donde pertenece uno alto. Afecta a **todas** las fórmulas delimitadas (medición`fonts.ts`+`svg.ts:427`+ `math-engine-2026-08.md:443`).
2. **`state.x`es avance, no geometría.**`parseEm(margin*)/hmtx advance/sizingRatio`la suma es la única x correcta. Cualquier segunda fuente cuenta dos veces.
3. **`top + pstrutSize`→`rowY`es la única verdad vertical.** Lea`pstrutSize`del árbol; no lo vuelva a calcular (`svg.ts:1029`).
4. **`clip`/`overlay`difieren hasta la extensión de la vlist adjunta; nada más.** Una regla de ancho completo, un radical de cola oculta, una superposición`\cancel`y una pieza de llave se resuelven contra **su propia** fila adjunta`width`(`svg.ts:1172``rectStart/lineStart/pathStart` +`svg.ts:1230`). Resolver contra el`state.x`de la fórmula extravía las diagonales`\cancel`por el avance anterior y entierra el socpe anidado.
5. **Las rectas`clipPath`están en coordenadas locales de ruta.** Emita`(clip.x - p.x)*invSx`(`svg.ts:1558`), nunca`clip.x`sin formato, y reproduzca un clip grabado con el mismo`dx`como ruta (`svg.ts:1196`). Espacio 4 ≠ espacio 3.

## Casos de estudio — bugs como coordenadas

Cada uno es una mezcla de espacios distinta, con números de línea en el estado fijo.

### #787 — espacio de coordenadas `clipPath` (`svg.ts:1550-1562`, `CHANGELOG:31`)

`clipPathUnits` tiene como valor predeterminado `userSpaceOnUse`, lo que significa que`<rect>`dentro de`<clipPath>`se resuelve **después** de la referencia a`<path>``transform`. Entonces el rect debe escribirse en el propio marco local de la ruta. Antes de la solución,`svg.ts:1555`emitía el espacio raíz`clip.{x,w}`palabra por palabra, por lo que SVG aplicó`translate(p.x) ∘ scale(sx)`por segunda vez: la ventana aterrizó en `p.x + sx·clip.x`. Cada elástico recortado (`\sqrt`, cada fase) desapareció del lienzo bajo un`sx`/`sy`que no era 1. La misma confirmación también agregó`svg.ts:1196``clip.x += dx` en la reproducción de vlist alineado, porque un clip es una ventana de espacio raíz absoluta como la ruta que limita, aplazando la ruta pero no su ventana se rompió`\frac{\sqrt{x}}{y}`cuando el radical se sentó en un numerador centrado (`CHANGELOG:57``svgClipWindows.test.ts` ).

### #667 — `\phase` midió 400em (`svg.ts:966`, `CHANGELOG:56`)

`\sqrt` siempre escribe en línea`min-width`en su contenedor para que`emitSvgNode`pueda recortar inmediatamente; `\phase`no lo hace. El emisor confió en el`widthEm: 400`declarado del SvgNode como avance, informando`\phase{-120}`a 400em. Se solucionó detectando`classes.includes('hide-tail') && clipEm===undefined`como`unclippedHideTail`(`svg.ts:971`) y enrutando esa rama a `emitOverlayPiece(FULL_WINDOW)`, una superposición de avance cero cuya ventana visible es la fila circundante.

### #665 — `\overbrace` midió 800–1200em (`svg.ts:859`, `CHANGELOG:58`)

Misma causa raíz, varias piezas:`brace-left/center/right`y`halfarrow-left/right`son`position:absolute`con`width:25/50/50%`de la fila adjunta (`katex.scss:519`). Cada`SvgNode`todavía declara 400em; al agregarlos, se mide`\overbrace{x+y}`a 1200em. Se corrigió reconociendo`OVERLAY_PIECES[class]`(`svg.ts:328`), tratando esos SvgNodes como superposiciones pendientes de avance cero (`emitOverlayPiece`en`svg.ts:867`), con`CONTAINER_BORDER_CLASSES`(`svg.ts:308`) para el caso`.angl`relacionado donde la frontera se encuentra solo en CSS.

### #825 — `\sqrt{b^2-4ac}` renderizado como `b²√4ac` (`svg.ts:1186`, `CHANGELOG:15`)

Dos fallas independientes, ambas centradas en el ancho del radicando:

-`ROW_ALIGN_CLASSES.sqrt`era`center`en lugar de`left`(`svg.ts:266`). KaTeX no tiene regla `.sqrt {text-align}`; la inicial es `left`. Con`center`, el radical estrecho de 400em se encontraba en medio de un radicando ancho, por lo que el vínculo parecía comenzar a la derecha de la apertura`b²`.

- El clip de cola oculta se dimensionó únicamente a `minWidth`, nunca al ancho real del radicando. Una vez que se conoció`width`(la extensión de vlist, es decir, el ancho del radicando cuando es más ancho),`svg.ts:1186`expandió`p.w`/`p.clip.w`a `max(minWidth, radicandWidth)`, y solo para el número entero`vlist`cuerpo `classChain.includes('sqrt')`, no un antepasado (`svg.ts:1203` guardia); de lo contrario, un`mfrac`externo se estiró el radical al ancho de la fracción.

### #788 — ventanas de clip ancladas con escala !=1 y replay alineado (`svg.ts:1196`, `svgClipWindows.test.ts`)

La afirmación de solidez en la optimización de recorrido único de alineación-vlist decía anteriormente "la traducción es sólida porque`walk`es afín en `state.x`" y afirmaba que la traducción del clip era sólida **antes** de los clips traducidos de`svg.ts:1196`(`CHANGELOG:57`). Las pruebas de regresión ahora afirman a partir del SVG** emitido que la ventana renderizada efectiva coincide con el propio cuadro de la ruta colocada tanto bajo`sx=sy=0.7`como dentro de un numerador`\frac`centrado y reproducido.

Además de los seis hallazgos P2/P3 del 2026-08-13, el párrafo se comprime pero el código de emisión se conserva como protecciones que aún soportan carga (`forge/findings/text-richtext-and-markdown.md:1789`):

- **#514 fantasma** —`style.color==="transparent"`(`kernel/Options.ts:306`) marca tinta fantasma (`buildCommon.ts:96`); saltarse tinta pero mantener los avances está en`svg.ts:479`/`svg.ts:744`(`phantom` bandera).
- **#514 color** — TeX`\color`escribe`style.color`en cada nodo (`functions/color.ts`); el emisor hereda el color efectivo a través de`walk`y lo agrupa (`svg.ts:1522``grouped` ), con`escapeAttr`en`svg.ts:1542`endureciendo cualquier cadena derivada del usuario (`&`→`&amp;`,`"`etc.).
- **#514 reglas/fronteras** — cada estilo`borderBottomWidth`/`katex-sout`/`.angl`/`.boxed`se convierte en un`fullWidth`rect (`svg.ts:800`,`svg.ts:834`) en lugar de solo`frac-line`.
- **#514`op-limits`/`x-arrow`/`mover`/`munder`centrado**: agregado a`ROW_ALIGN_CLASSES`(`svg.ts:266`) y verificado con`katex.scss:405`/`563`para que los límites`\sum`y las etiquetas`\xrightarrow`aterricen debajo del operador/centro de flecha.
- **#521 vuelta (`\llap`/`\clap`)** — CSS`right:0`/`margin-left:-50%`(`katex.scss:293`) implementada midiendo`lapWidth`y cambiando`state.x`por`-lapWidth`/`-lapWidth/2`(`svg.ts:982``lapKind` rama) en lugar de tratar las tres vueltas como`rlap`.
- **#521`\smash`/viewBox** —`functions/smash.ts:66`pone a cero el`height/depth`de un nodo mientras los niños mantienen el tamaño; el emisor expande el viewBox a la **unión** de tinta colocada (`svg.ts:1630``minX/minY/maxX/maxY` unión) en lugar del cuadro de diseño, por lo que el contenido destruido no se corta.

### Historial de glifos/tablas que aún constriñe el contrato de emisión

- **Glifos faltantes como tinta en blanco** (`CHANGELOG:62``ff79c58` ): la adición del subconjunto`569→662 (+87)`para`U+2248`/`h*`/ `l*`, etc. — los contornos faltantes avanzaron correctamente a través de métricas para que se representaran como **espacios en blanco del ancho correcto**, invisibles pero con un diseño correcto.
- **Agujeros de espacios en blanco de variantes de visualización** (`CHANGELOG:9`set`U+2216`,`U+22C3`variante de visualización,`U+005F`, bloque de prueba sobrelínea): bloques de visualización **rebajados a fuente TeX sin formato** (azul CodeBlock) en lugar de composición tipográfica, porque`convertMathToSVGDataURI`en`markdown-math.ts:559`devuelve`null`en cualquier`emitted.missing`.
- **`vertical-separator`(`{c|c}`/`{c:c}`)** (`CHANGELOG:29`#697): los separadores de columnas de matriz escriben su regla como`style.borderRightWidth`/`borderRightStyle`, no como`Span.width`. Antes de la solución,`svg.ts:617`lo eliminó por completo; ahora emite una línea trazada en esta posición del lápiz con`verticalAlign`/`height`→`(y1,y2)`(`svg.ts:718`).
- **Relleno de clase** (`CHANGELOG:30`#696):`.x-arrow-pad`/`.cancel-pad`etc. existen solo en`katex.scss`, por lo que las filas medidas cortas por ese relleno antes de`CLASS_H_METRICS`(`svg.ts:366`) se doblaron en el mismo punto que en línea`paddingLeft`. Los márgenes de`.cancel-lap``-0.2em` se emparejaron en la misma tabla, por lo que`\cancel`mantuvo su avance neto.
- **Imagen delimitada y límites de trama** (`CHANGELOG:61`,`markdown-math.ts:1938``destroy` eliminando`workerCallbacks`): no relacionado con las coordenadas pero soporta carga para un documento transmitido: un`inlineMathRasters`ilimitado fijó un`HTMLImageElement`por URI después del desalojo `mathCache`.

## Guardas de invariantes del vendor

La hoja de estilo y el kernel conspiran para ocultar información del árbol. Cada valor a continuación existe en`katex.scss`o un archivo del kernel **pero no en`DomSpan`**, por lo que el emisor lo transcribe como una constante y la transcripción se verifica en cada ejecución del proveedor (`scripts/vendor-katex.ts --check`):

| constante transcrita                                                  | fuente de verdad                                                    | forma vigilada                                                                     |
| --------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `MU = 1/18` (`svg.ts:60`)                                             | `katex.scss:$mu = 1em/18`                                           | drift guard re-derives `MU` from checked-out `katex.scss`                          |
| `NULL_DELIMITER_SPACE = 0.12` (`svg.ts:69`)                           | `$nulldelimiterspace = 1.2em/10`                                    | mismo                                                                              |
| `SIZE_MULTIPLIERS[11]` (`fonts.ts:263`)                               | `katex.scss $sizes` + `kernel/Options.ts sizeMultipliers`           | scss flattener vuelve a derivar ambos                                              |
| `KATEX_FONT_SCALE = 1.21` (`svg.ts:77`)                               | `.katex {font-size:1.21em}` (`katex.scss:24`)                       | same, also asserted `markdown-math.ts:514 ≈ markdown/test/mathBoxGeometry.test.ts` |
| `ROW_ALIGN_CLASSES` (`svg.ts:266`)                                    | `katex.scss` section 405/442/563 + documented `sqrt:left` deviation | mismo aplanador                                                                    |
| `CLASS_TO_FACE`/`DELIM_SIZE_FONTS`/`AVAILABLE` (`fonts.ts:57/98/135`) | `katex.scss` `font-family` rules                                    | mismo                                                                              |
| `CONTAINER_BORDER_CLASSES` (`svg.ts:308`, `.angl 0.049em`)            | `katex.scss:601` `.angl` top/right rules                            | mismo                                                                              |
| `OVERLAY_PIECES` windows (`svg.ts:328`)                               | `katex.scss:519` `.brace-*/halfarrow-*` absolute windows            | mismo                                                                              |
| `CLASS_H_METRICS` paddings (`svg.ts:366`)                             | `katex.scss:555/569/579/583/601` pad/lap/margins                    | mismo                                                                              |

Los accesorios opcionales de`defineEnvironment`(`argTypes`,`allowedInText`,`numOptionalArgs`) se pasan **con valores predeterminados ascendentes** (`registry/defineEnvironment.ts`), no se fijan ni se eliminan, por lo que un futuro KaTeX que comienza a declararlos emerge en lugar de dejarlos caer silenciosamente (`forge/findings/text-richtext-and-markdown.md:2075`).

## Cómo funciona realmente la interacción con el layout

Las matemáticas en línea **no** son `fillText`. `markdown-inline.ts:287``inlineMath` produce un`InlineObject`(carácter de reemplazo de objeto +`InlineObjectBox`) cuyo`width/height/depth`en px es`exToPx(converted.{widthEx,heightEx,depthEx}, runSize)`-`runSize`es la **ejecución adjunta**`fontSize`en ese punto en el árbol de extensión, por lo que un`$x$`dentro de un encabezado escala con el encabezado (`markdown-inline.ts:292`).`LayoutEngine`en`packages/layout/src/LayoutEngine.ts:808`lo trata como un cuadro fijo como una imagen en línea. La`depth`(distancia debajo de la línea de base) de la caja es`emitted.depth + padEm`en la misma escala`KATEX_FONT_SCALE/EX_PER_EM`que comparte el ancho/alto; la profundidad y el ancho del asiento se derivan juntos, por lo que un cambio en`KATEX_FONT_SCALE`dimensiona incorrectamente cada fórmula, mientras que un cambio en el`EX_PER_EM`ahora cancelado no mueve nada (`markdown-math.ts:111`nota cancelada en par).

Las matemáticas de visualización omiten por completo el interruptor de línea:`MathBlock`es un`MarkdownContainer`cuyo hijo es el`SVGEntity`del URI de datos, en el ancho del contenedor menos el relleno `MATH_PAD_EM`; los márgenes y los desbordamientos son preocupaciones de `ScrollView`, no de `LayoutEngine`.

### Cómo `LayoutEngine` trata una fórmula inline

`LayoutEngine` (`packages/layout/src/LayoutEngine.ts:808``LayoutEngine` ,`README.md:24`motor desacoplado) nunca da forma a TeX. Las matemáticas en línea llegan como un`StyledSpan{ text: OBJECT_REPLACEMENT, object: InlineObject }`(`markdown-inline.ts:301`), cuyo`InlineObjectBox{width,height,depth}`se corrigió en el momento de la recopilación de intervalos desde el`fontSize`de la ejecución adjunta a través de `exToPx`, por lo que el diseño ve el cuadro que ya está en px. La ruta activa`LayoutEngine.layout`la envuelve como cualquier otra imagen en línea (`packages/layout/src/LayoutEngine.ts:2321``layoutPreparedIntoBuffer` preserva la nota principal en`forge/findings/text-richtext-and-markdown.md:1762`; la calibración`core/src/text/measureContext.ts:12`y el respaldo`core/src/text/Typography.ts:111``ctx.measureText('Mg')` son la protección métrica de texto del jefe 02 de la que depende el mismo cuadro):`width`participa en el salto de línea,`depth`reduce la línea base de la línea en esa distancia y`height+depth`aumenta el cuadro de la línea de modo que una fórmula con una profundidad grande (fracción, cola radical,`\left(`par alto) expande el espacio libre sin una segunda medición. La selección sobre la fórmula es paridad de mundo dual, no diseño:`ContentGridProjector`/`ContentProjectionManager`(jefe 01/03) copia el`InlineObject.alt = t.text`(`markdown-inline.ts:310`) para que un lector pueda encontrar/seleccionar/copiar la fuente TeX, mientras que el resultado del lienzo sigue siendo el rectángulo `InlineObjectBox`. Cualquier cosa que haya cambiado`InlineObjectBox`después de que`LayoutEngine`se almacene en caché debe ensuciar la ruta del texto: el mismo`measure-once, layout-many`jefe invariante 02 guardias.

### Geometría de caja — por qué `KATEX_FONT_SCALE` sobrevive y `EX_PER_EM` se cancela

`EmitResult` informa em en **KaTeX's** em (1,21 × el tamaño de fuente del consumidor,`svg.ts:77``KATEX_FONT_SCALE`, `katex.scss:24`). `markdown-math.ts:514`compone`EX_PER_KATEX_EM = KATEX_FONT_SCALE / EX_PER_EM (0.4421)`entonces`widthEx = (emitted.width + 2*pad)*EX_PER_KATEX_EM`y`depthEx = (emitted.depth + pad)*EX_PER_KATEX_EM`(`markdown-math.ts:566`). Luego,`markdown-inline.ts:305`resuelve px como `exToPx(ex, runSize) = ex * runSize * EX_PER_EM`;`EX_PER_EM`se cancela, dejando `px = (em+pad)*1.21*runSize`. Verificado mutando`EX_PER_EM`a`0.31`con movimiento de prueba cero y`KATEX_FONT_SCALE`a`1.0`con 3 fallas (nota `markdown-math.ts:111`,`test/mathBoxGeometry.test.ts:39`la tolerancia del 0,5 % absorbe el redondeo de 2 decimales). El`padEm`no es decorativo: los atributos SVG`width/height`lo incluyen en todos los lados mientras que`EmitResult.{width,height,depth}`no, y`drawImage(bitmap, x,y, box.width, box.height)`en`markdown-math.ts:338`extiende todo el SVG hasta la caja; informe la caja de tinta sola y cada fórmula se aplasta con `padEm`, informe la profundidad sin ella y cada fórmula se asienta`padEm`alto.

## Subconjunto de glifos y codec — dónde viven los bytes

El`glyphs.subset.ts`(`src/glyphs/glyphs.subset.ts`) enviado no es el texto de ruta SVG sino el binario decodificado por`src/emit/glyphCodec.ts:277``GlyphTable` . La extracción en`scripts/generate-glyphs.ts`lee TTF`glyf`contornos cuadráticos (bandera en curva + medios implícitos) y`scripts/encode-glyphs.ts`invierte esa expansión: 5 256 de 18 306`Q`puntos finales son exactamente medios implícitos y se descartan, cada coordenada restante es un número entero (0 de 72 616 fuera de la red una vez que los medios desaparecido), y los deltas varint en zigzag empaquetan 60 637 de 72 616 en un byte (`math-engine-2026-08.md:333`). El corpus (`scripts/subset-glyphs.ts`) es lo que las mayúsculas muestran fallas: 666 glifos fijados por el guardia de conteo de `test/glyphCodec.test.ts`. Un glifo que **existe en`fontMetricsData.js`pero no en el subconjunto** se representa como un espacio en blanco del ancho correcto (avanzado desde las métricas, sin contorno; `CHANGELOG:62`); un glifo cuya **cara está completamente ausente** (por ejemplo, una ballena que solo se muestra como`\digamma`) se degrada a través de`markdown-math.ts:559``emitted.missing.length>0 → null → CodeBlock`: los dos modos de falla son distintos y tienen propietarios diferentes.

### `packages/core/src/text/*` — donde TeX se encuentra con el stack de texto

TeX **no** llama a`packages/core/src/text`modelado (características BiDi, árabe, OpenType): los glifos ya están formados por las métricas de KaTeX y el emisor escribe contornos directamente. Lo que TeX **sí** comparte es la mitad inferior de la pila de texto:`core/src/text/measureContext.ts:12`calibración de contexto de medida y`core/src/text/Typography.ts:111``ctx.measureText('Mg')` respaldo son los protectores del jefe 02 para los avances de fuentes web, mientras que los avances derivados de`hmtx`de TeX en`svg.ts:499`son el análogo KaTeX. Ambos deben satisfacer el mismo invariante de métrica de texto (jefe 02 → requisito previo profundo): medir con la fuente real, en el contexto correcto, en el DPR correcto, o el`InlineObjectBox`se desvía del lienzo directamente y de la proyección a11y. `packages/text/src/fontMetrics.ts:82``registerFontMetrics` nunca se llama para caras TeX: el`fontMetricsData.js`suministrado es la fuente de métrica TeX y las dos tablas tienen propietarios diferentes.

### Leer el SVG emitido de una fórmula — placements como verdad base

`EmitResult.placements` (`svg.ts:104``GlyphPlacement[]` en em) es la superficie de depuración (`markdown-math.ts:517`señala que existe para realizar una validación cruzada con un diseño de navegador real del mismo árbol de extensión). Cuando una fórmula parece incorrecta, diferencie las ubicaciones en lugar de leer la sopa de rutas SVG:

```ts
import { layout, emitSVG } from '@vectojs/tex';
const { svg, width, placements, missing } = emitSVG(
  layout('\\sqrt{b^2-4ac}', { displayMode: true }),
);
// width is advance in em; placements[].{x,y,scale,font,code} in em; missing lists absent U+XXXX
```

`width` es el único número que controla el diseño: un informe insuficiente trunca el `InlineObjectBox`, un informe excesivo inserta un espacio visible, mientras que`placements[].y`positivo hacia abajo desde la línea de base es lo que debe coincidir con una sonda KaTeX en cromo DOM a 0,0000 em (`math-engine-2026-08.md:423`). Un clip o una superposición fallidos se muestran como una discrepancia de`PlacedPath.w/clip.w`con las extensiones `placements`, no como una diferencia de cadena de ruta.

## Harness de verificación — qué mantiene cada invariante en verde

-`test/emit.test.ts:37`— contrato SVG autónomo (`<text>`/`font-family`/`url`/`xlink:href`ausente; se resuelve el fragmento de URI de datos); superposición elástica, avance cero y ventanas divididas (`emit.test.ts:380``treats multi-piece stretchy overlays as zero-advance` ).
\-`test/svgClipWindows.test.ts:6`— regresiones de geometría de renderizador para #787/#788: clipPath rect emitido en el marco local de ruta y ventana coincidente de reproducción de vlist alineada bajo`sy`distinto de 1 (`svgClipWindows.test.ts:83` mosaico de refuerzo).

- `test/vendorCheck.test.ts:252`: protector de deriva que vuelve a derivar cada constante`katex.scss`transcrita desde el proceso de pago ascendente (la trampa de comentario-llave es una importación MathJax, no este paquete).
  \-`packages/markdown/test/mathBoxGeometry.test.ts:39`— KaTeX puente de escala de fuente (`KATEX_FONT_SCALE` igualdad entre paquetes) y geometría de caja frente a KaTeX real en Chromium (19,3559 px/em a 16 px, 0,02 % de extensión).

## Cómo añadir un nuevo constructo TeX de forma segura

Una construcción TeX se define mediante un **constructor de kernel** (AST → abarca + estilos/clases) y se consume mediante **una rama de emisión** que traduce esos intervalos/estilos en tinta colocada en la extensión correcta. Una construcción se considera enviada solo cuando **siete** sitios están de acuerdo; faltar alguno fue el modo de falla histórico.

### 1. Añade y verifica el builder del kernel

Extienda`src/kernel/functions/*.ts`o`src/kernel/environments/*.ts`a través de`src/registry/defineFunction.ts`/`defineEnvironment.ts`(no editando el kernel). Verifique el **contrato de salida** del constructor: qué clases establece (por ejemplo, `.mover`, `.angl`, `.cancel-pad`), qué estilos en línea escribe (`borderBottomWidth`,`paddingLeft`+ `padLeftEm`,`minWidth`en envoltorios de cola oculta), si el envoltorio es un`Span`, un`SvgNode`o un`LineNode`con`SvgNode`(`kernel/stretchy.ts:69`,`svgGeometry.ts`para el catálogo de rutas), y si`style.top`/`style.left`/`style.color`/`transparent`está involucrado. Las mediciones`fontMetricsData.js`del kernel ya fluyen hacia el`height/depth`del árbol; no las reintroduzca como una segunda fuente.

### 2. Enseña al emisor exactamente una rama nueva

El envío vive en`svg.ts:427``walk` →`emitSymbol`/`emitSvgNode`/`emitContainer`/`emitVList`. Si los nuevos tramos contienen **nuevas clases CSS que afectan la geometría**, regístrelas en la tabla de la derecha en lugar de codificarlas:

-`CLASS_H_METRICS`para panel/margen en línea (por ejemplo, `.x-arrow-pad`, #696); de lo contrario, las filas son cortas.
\-`CONTAINER_BORDER_CLASSES`para un borde cuyo grosor se encuentra solo en`katex.scss`(por ejemplo, _ICODE004_, _ICODE005_).

- _ICODE006_ si las filas de una lista '_ ICODE007__ importan (`.op-limits`etc.,`svg.ts:266`).
  \-`OVERLAY_PIECES`si los nuevos intervalos son _ICODE011_ ventanas de porcentaje (_ICODE012_).

Si el SVG de la construcción declara un ancho fijo (400em) pero su ancho **visible** es la extensión de la fila circundante, trate su SvgNode como una **superposición pendiente de avance cero** en lugar de un avance literal (el patrón`\phase`/`\overbrace`en`svg.ts:859``#665` /`svg.ts:966``#667` ).

### 3. Colócalo en el espacio de coordenadas correcto

- Una **regla o borde** que abarca su contenedor es`PlacedRect{fullWidth:true, edge?}`en`svg.ts:147`, resuelta por`placeRect(startX,width)`contra **su propia fila `vlist`** adjunta (rango`svg.ts:1230``rectStart`), no la`state.x`de la fórmula.
- Un **trazado único elástico** cuyo ancho visible no es el`width`declarado es`PlacedPath{clip?}`en `svg.ts:193`, con`sliced`manejando en`svg.ts:596`(escala por `rawWidth`, no `widthEm`) y, si`hide-tail`sin `minWidth`, pendiente como`FULL_WINDOW`(`svg.ts:966`).
- Una **superposición de varias piezas** es`PlacedPath{overlay}`en`svg.ts:193`con`placeOverlay`escala de cubierta + alineación`preserveAspectRatio`(`svg.ts:1275`) y recorte a la ventana (para que cada pieza dibuje su fracción del contenedor).
- Un **separador vertical** (`vertical-separator`, #697) es un`PlacedLine`(`svg.ts:173`) cuyo`(x1,y1)→(x2,y2)`recupera`aboveEm = height + verticalAlign`(la misma derivación`svg.ts:718`ya lo hace).

### 4. Preserva color, phantom y escapado

Herede la prueba fantasma efectiva de`style.color`a`walk`(`svg.ts:132``ColoredPlacement` ,`svg.ts:479``color=style.color ?? inheritedColor` ,`svg.ts:744`en ese valor), mantenga los avances mientras se salta tinta cuando`color==="transparent"`(maneja`\phantom`/`\vphantom`/`\hphantom`/`\mathstrut``rlap` -`buildCommon.ts:96`,`svg.ts:479`), el grupo del mismo color se ejecuta en`<g fill=…>`(`svg.ts:1522`) y escapa de cualquier color interpolado a través de`escapeAttr`(`svg.ts:1542`) - las personas que llaman hoy en día se derivan del tema, pero un valor de La entrada TeX como`\color{…}`escribe el argumento palabra por palabra en`style.color`y, de lo contrario, sale del atributo.

### 5. Dimensionado correcto — elige el umbral adecuado

`KATEX_FONT_SCALE` y`sizingRatio`se componen multiplicativamente en dos lugares: el avance del lápiz (`UPEM * scale`en cada`parseEm`×) y el`PlacedGlyph.scale`(`fonts.ts:265`). Una entrada incorrecta en`SIZE_MULTIPLIERS`desplaza los glifos del tamaño de una secuencia de comandos en aproximadamente un 50%, lo que ninguna reparación de viewBox detecta.

### 6. Actualiza el contrato de medida

Si la geometría de la construcción incluye la extensión del contenedor (vlist `width`, ancho del radicando, ventana de llave), se debe **resolver después de conocer el ancho** (`emitVList``maxX-startX` en`svg.ts:1227`; recurrir a la fórmula`state.x`en`svg.ts:1588`en`emitSVG`). El viewBox ilimitado anterior en`svg.ts:1630`(unión de tinta colocada, no solo el cuadro de diseño) soporta carga: expandir ese cuadro fue la solución #521 para`\smash`/`\hphantom`donde`height/depth`son cero pero los niños mantienen el tamaño.

### 7. Mantén los dos guardarraíles en verde

- `scripts/subset-glyphs.ts`: si la construcción ejerció nuevos puntos de código, agréguelos al corpus del subconjunto (`src/glyphs/glyphs.subset.json`) y vuelva a ejecutar la protección del códec (`test/glyphCodec.test.ts`pines`package.json`no`sideEffects:false`y el recuento de 666 glifos) para que el corpus no pueda eliminar silenciosamente el nuevo rango. Los puntos de código faltantes pero con métricas presentes se representan como **espacios en blanco del ancho correcto** (`CHANGELOG:62`#665); Los puntos de código de solo visualización se representan como **fuente LaTeX sin formato** (`CHANGELOG:9`).
- `scripts/vendor-katex.ts --check`: agregue cualquier constante **nueva** transcrita CSS (`ROW_ALIGN_CLASSES`,`CLASS_H_METRICS`,`OVERLAY_PIECES`etc.) al protector de deriva que vuelve a derivar cada valor del checkout ascendente (`test/vendorCheck.test.ts`SCSS flattener), por lo que un cambio de hoja de estilo en el siguiente golpe KaTeX falla ruidosamente en lugar de silenciosamente cambiando cada construcción que dependía de él (`CHANGELOG:62` adición de protección contra deriva).

## Checklist de depuración

<!-- markdownlint-disable MD056 MD060 -->

| síntoma                                                                                                    | comprobar primero                                                                                   | archivo:línea                                                                  |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Todos los estiramientos fuera del lienzo /`p.x+sx·clip.x`duplicados                                        | Ruta de recorte emitida en el espacio raíz en lugar de ruta local                                   | `emit/svg.ts:1555``invSx/invSy`                                                |
| `\overbrace`/`\xleftrightarrow`mide 400×N em; viewBox 400× demasiado ancho                                 | SVG de varias piezas se toma como avance literal en lugar de superposición pendiente de avance cero | `emit/svg.ts:859``OVERLAY_PIECES` +`emitOverlayPiece`                          |
| `\phase`mide 400em mientras que`\sqrt{x}`es correcto                                                       | `hide-tail`sin`minWidth`en línea todavía avanza 400em                                               | `emit/svg.ts:966``unclippedHideTail`                                           |
| `\sqrt{b^2-4ac}`vínculo truncado a `0.853em`, radicando parcialmente fuera del radical                     | Clip con tamaño de`minWidth`no`max(minWidth, radicandWidth)`o`sqrt: center`                         | `emit/svg.ts:1186``clip.w < width` +`svg.ts:266``sqrt:left`                    |
| `\sum_{i}`limita el nivel a la izquierda; `\xrightarrow{label}`etiqueta en el borde izquierdo de la flecha | Falta la clase de alineación de filas                                                               | `emit/svg.ts:266``ROW_ALIGN_CLASSES`                                           |
| `\underline`/`\overline`/`\hline`/`\sout`falta                                                             | Extensión de borde sin ancho: eliminada porque solo se consideró`frac-line`                         | `emit/svg.ts:800``borderBottomWidth/katex-sout`                                |
| `\boxed`/`\angl`borde de caja invisible                                                                    | Grosor del borde solo en`katex.scss`(`.angl`) o`borderStyle`taquigrafía no leída                    | `emit/svg.ts:834``CONTAINER_BORDER_CLASSES` + taquigrafía                      |
| `{c\|c}`reglas invisibles; `:`sólido en lugar de discontinuo                                               | `vertical-separator`intervalo caído; `borderRightStyle===dashed`no aplicado                         | `emit/svg.ts:718``dashed` +`svg.ts:1597``stroke-dasharray`                     |
| `\llap`/`\clap`tinta a la derecha del ancla                                                                | Las tres vueltas usando la semántica`rlap`(`left:0`)                                                | `emit/svg.ts:982``llap/clap` ancho sonda + desplazamiento                      |
| `\smash`/`\hphantom`contenido recortado por viewBox                                                        | ViewBox derivado de`height/depth`puesto a cero, no la unión de tinta colocada                       | `emit/svg.ts:1630``minY/maxY` unión de tinta                                   |
| Los colores cayeron; `\color{red}x`negro o desconocidos parecen válidos                                    | `style.color`no heredado; o glifos faltantes conocidos no controlados a través de`emitted.missing`  | `emit/svg.ts:479`+`markdown-math.ts:559``missing.length>0` ruta de degradación |
| Reducir la brecha/sobremedida en`\xrightarrow{\text{…}}`/`\boxed`/`\cancel`                                | `padLeft/padRight/marginLeft`de clase no plegado por adelantado                                     | `emit/svg.ts:366``CLASS_H_METRICS`                                             |
| Delimitador alto par corto/cursiva incorrecta (`\mathit{123}` normal)                                      | Fuente resuelta sin antecesor`classChain`                                                           | `emit/svg.ts:427`+`fonts.ts:194``resolveFont(chain)`                           |
| `Got group of unknown type`en`layout('x')`después de`bun build`                                            | `packages/tex/package.json`establecido en`sideEffects:false`— registros sacudidos en el árbol       | `packages/tex/package.json`+`test/glyphCodec.test.ts`guardia en ese campo      |

## Streaming y por qué `layout → emit` no es reentrante a mitad de línea

El`InlineObjectBox`de matemáticas en línea se corrige **antes** de que`LayoutEngine`lo vea, por lo que la canalización TeX nunca se llama dentro de la ruta activa del diseño. El`import('@vectojs/tex')`perezoso de`markdown-math.ts:85`significa que la primera fórmula en una página se representa como fuente con estilo (el`else`en`markdown-inline.ts:316``theme.mathFallbackColor` ) hasta que`preloadMathJax()`se resuelva:`ensureMathJax`/`retypesetFromTokens`(`markdown/src/Markdown.ts:3518`) fusionan cargas concurrentes en una promesa y reconstruyen a partir de tokens ya lexed, manteniendo`tokenChildPrefix`trivialmente correcto. El LRU de`inlineMathRasters`en`markdown-math.ts:238`se reinserta en cada pintura para que un mapa de bits aún visible no sea desalojado, y`mathCache`(256) más el límite de ráster en el mismo límite es la protección de transmisión contra un documento de larga duración que decodifica miles de fórmulas distintas (`forge 2026-08-13` hallazgo de ráster limitado). Una segunda persona que llama que`await preloadMathJax()`antes de construir obtiene una composición tipográfica sincrónica de primera fórmula; el mismo`onStable`del jefe de contrato 04 depende de cuándo toma instantáneas de`Array.from(content.children)`después de `waitForAppendSettled`.

Ese contrato`degrade-to-source`es también el contrato de falta de glifo: el`emitted.missing.length>0 → null`(`markdown-math.ts:559`) de`convertMathToSVGDataURI`representa una fórmula parcialmente faltante como **fuente TeX copiada** en lugar de una ecuación con espacios silenciosos, por lo que una adición de corpus que olvidó un glifo es visible como un`CodeBlock`azul en lugar de una ecuación incorrecta. El respaldo de las matemáticas de visualización (`markdown/src/Markdown.ts:3520``retypesetFromTokens` al por mayor) respeta el mismo contrato: un bloque`\digamma`que carece de un esquema nunca produce un bloque de visualización con espacios, permanece como fuente.

### `packages/core/src/text/*` y la invariante de texto más profunda

`core/src/text` (`core/src/text/Typography.ts:111`,`measureContext.ts:12`) da forma a texto **web**: BiDi, uniones árabes, avances de fuente variable, no TeX. Las dos pilas se encuentran solo en `InlineObjectBox`: ambas son cajas`width/height/depth`que`LayoutEngine`(`packages/layout/src/LayoutEngine.ts:808`) envuelven de manera idéntica. Por lo tanto, el invariante`measure-once, layout-many`de Boss 02 gobierna ambos: un`InlineObjectBox`obsoleto después de un cambio de fuente, DPR o ancho es un error de paridad, ya sea que el cuadro contenga TeX o `fillText`. TeX nunca llama a`registerFontMetrics`(`packages/text/src/fontMetrics.ts:82`): sus métricas son las`fontMetricsData.js`suministradas; Las dos tablas tienen propietarios diferentes pero una verdad de diseño.

## Invariantes — checklist copia/pega antes de la PR

1. **Cadena de clases estable en profundidad.**`resolveFont(classChain)`y`sizingRatio(classChain)`se derivan de la acumulación real (`walk``chain=[…classChain,…classes]` ), no de un trozo de hoja.
2. **Cada longitud en línea es`parseEm * UPEM * localScale`.** No hay una segunda escala en la reproducción: la escala está integrada.
3. **Cualquier forma cuya extensión sea la extensión del contenedor está pendiente hasta`place*(startX,width)`.** Un segundo consumidor que lea el mismo rango en una vlist diferente estiraría un radical al ancho de una fracción.
4. **No`parseFloat("100%")`como`100em`.**`parseLength`/`parseEm`divide`pct`vs`em`; El porcentaje x en las superposiciones`\cancel`difiere del ancho de la lista v como una regla de ancho completo.
5. **Glifo ⇔ fuente invariante.** Dos glifos de la misma cara que se repiten comparten una reutilización`<defs><path>`y`href="#gN"`(mapa`svg.ts:1639``defId`); el conjunto de errores se calcula a partir de la misma resolución de fuente que alimentó`getGlyph`, por lo que`convertMathToSVGDataURI`en`markdown-math.ts:559`deja caer exactamente las fórmulas cuya tinta tendría un espacio.
6. **El relleno pertenece al SVG y a la caja juntos.**`EmitResult.{width,height,depth}`son **tinta**; `Emitted.svg``width/height` incluye`+padEm`en todos los lados. La aritmética`+pad2`/`+MATH_PAD_EM`de`convertMathToSVGDataURI`depende de la constante del pad nombrada: desacoplamiento y cada fórmula de reducción se equivoca.
7. **Los puntos suspensivos/guiones en prosa no están dentro de TeX o código.**`decodeProse`/`applyTypography`(`markdown-inline.ts:58`) ruta solo a través de `emitProse`: los intervalos de código y el respaldo de falla matemática (`markdown-inline.ts:321`) los omiten, por lo que`--`dentro de`code`o un degradado`$$`nunca se convierte en un guión final.

---

## Referencias

-`vectojs-docs/content/learn/text-typography.md`— lo que`TextStyle.baselineShift`/`fontSize`compra para sub/sup (la otra ejecución elevada tipo matemática en línea).
\-`vectojs-docs/content/learn/streaming.md`+ boss 04: por qué las extensiones`marked`afectan a`findStableCut`y por qué los intervalos`InlineObjectBox`de matemáticas en línea difieren de los intervalos `RichText`.

- `vectojs-docs/forge/decisions/math-engine-2026-08.md`: la decisión medida, el alcance del proveedor, la elección de codificación de glifos, la corrección 5 (`sideEffects:false`) y la clasificación de dificultad TeX de cuatro partes.
- `vectojs-docs/forge/findings/text-richtext-and-markdown.md:1789-1924`: los nueve hallazgos de tex P2/P3 del 2026-08-13 + el hallazgo de ráster delimitado en un solo lugar.
  \-`vectojs-docs/forge/baselines/*.json`+`run-browsers.sh`— los únicos números que se pueden citar; Los caminos sin cabeza son un cable trampa para la regresión.
  \-`packages/tex/test/emit.test.ts`+`svgClipWindows.test.ts`+ `vendorCheck.test.ts`: los contratos que una nueva construcción debe mantener verdes (coincidencia entre clip y ventana, ventanas de varias piezas, protección contra deriva).

---

_Siguiente: 06 VMT Tiempo de ejecución: el ciclo de vida, la propagación sucia y el envío de eventos en los que se montan todos los`SVGEntity`y`MathBlock`creados por emisores._
