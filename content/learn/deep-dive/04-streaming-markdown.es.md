+++
title = "04 — Markdown en streaming — Reconciliación incremental"
description = "Por qué cualquier prefijo puede ser sintaxis incompleta, el lexer de prefijo comprometido, el protocolo delta del worker, la reconciliación token→entidad con mutadores in-place, las trampas O(C·N²) y wrapper-instanceof, y la forma segura de añadir una nueva extensión."
weight = 24
+++

# 04 — Markdown en streaming — Reconciliación incremental

Las transmisiones de LLM son **solo para agregar** y **según el token** (~4 caracteres por fragmento). VectoJS debe mostrar un documento legible después de cada fragmento; no hay espacios en blanco hasta `close()`. La estrategia obvia (volver a leer toda la fuente acumulada y reconstruir el árbol de entidades cada vez) es`O(document)`por fragmento, por lo tanto,`O(N²)`sobre una secuencia. Este capítulo es el mecanismo que hace que sea`O(unstable tail)`en su lugar, y las trampas que hicieron que cada mitad silenciosamente no funcionara.

## Por qué cualquier prefijo es sintaxis incompleta

`marked` es un lexer **de un solo uso**. Se supone que toda la fuente está presente. Cada construcción Markdown cuyo terminador aún no ha llegado cambia lo que significa el prefijo una vez que lo hace:

| prefijo en pantalla                | cómo se ve ahora                                                    | ¿Qué puede hacer el siguiente trozo?                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `## Heading` without trailing `\n` | `heading(depth:2)`                                                  | `heading(depth:1)` if a leading `#` is still in flight (`#` → `##`) — depth is not stable until the line ends              |
| `**bold`                           | `text("**bold")` + literal `**`                                     | `strong("bold")` once the closing `**` arrives                                                                             |
| `[label](https://ex`               | `text("[label](https://ex")` + autolinked bare URL                  | `link(label → https://example.com)` — the URL is not even a complete href yet                                              |
| ` ```js\nconst a=1 `               | `code(lang:js, text:"const a=1")` with unclosed fence               | still a `code` — but the fence may also become ` ```matemáticas` and then typeset as display math                          |
| `\| un \| b \|\n\| ---\| ---`      | `tabla(encabezado:[a,b], filas:[])` — delimiter row, zero body rows | `tabla(filas:[[…]])` — `marcado` materializes a partial row as a full row of **empty cells** then fills them one at a time |
| `$$\nx`                            | `párrafo("$$\\nx")` (the extension clips marked's paragraph input)  | `blockMath("x")` once `$$` closes — plus marked's `inicio()` clip can **retroactively merge** two prior `tokens de párrafo |

Sin una capa compatible con la transmisión, cada uno de estos cambios sería una destrucción de entidades renderizadas. La capa tiene dos mitades, lex y reconciliar, y los defectos se encuentran en sus costuras.

## Arquitectura — lex · transferencia · reconciliación

```text
chunk ──► consumeFrontMatter ──► dispatchAppend ──► MarkdownWorker (off-thread)
                │                        │                    │
                │ rawMarkdown            │ postMessage         │ incrementalLex
                │ (body only)            │ {append,expectedLen}│ lexAppend / lexFull
                │                        │  or {text,oldRaws}  │ findStableCut + verify
                │                        │                    │
                ◄────── matchLen + tail ─┘                    │
                              │                               │
                     updateTokens(matchLen, tail)  ◄──────────┘
                              │
              ┌───────────────┼───────────────────┐
              │ prefix [0,matchLen) kept          │  entitiesReused++
              │ tail: reuse / rebuild / mutate    │  inPlaceUpdates vs entitiesRebuilt
              └───────────────┼───────────────────┘
                              │
                    content Stack + width/height republish
                              │
                    Scene.markDirty() + notifyLayoutUpdated()
```

Tres módulos poseen las tres fases:

- **Lex** —`packages/markdown/src/incrementalLex.ts:446``lexFull` /`packages/markdown/src/incrementalLex.ts:477``lexAppend` más`MarkdownWorker.ts:230``self.onmessage`. El caché es`IncrementalLexCache`(`incrementalLex.ts:207`):`source`,`tail = source.slice(stableOffset)`,`tokens`,`stableCount`,`stableOffset`,`degraded`.
- **Transferencia** —`Markdown.ts:2244``dispatchAppend` y`MarkdownWorker.ts:345`diferencia. El estado estacionario envía`{append, expectedLength}`(delta); primero/resincronización/recuperación envía`{text, oldRaws}`(completo). La diferencia del trabajador calcula`matchLen`y devuelve `tail = tokens.slice(matchLen)`.
- **Conciliar** —`Markdown.ts:3674``updateTokens(oldTokens → newTokens, knownMatchLen)` . Asigna índices de tokens a ranuras secundarias a través de`tokenChildPrefix`(`Markdown.ts:1030`, mantenido incrementalmente por`setTokens`en`Markdown.ts:1041`), luego tres rutas por token: **reutilizar intacto**, **mutación en el lugar** (`setSpans`/`setCode`/`appendRows`) o **destruir + reconstruir**.

El material frontal se elimina **antes** de lexing (`frontMatter.ts:94``scanFrontMatter` ,`Markdown.ts:1116``initSource` /`Markdown.ts:1157``consumeFrontMatter` ) para que el trabajador no tenga noción de ello:`workerSourceLen`y`expectedLength`permanecen desplazados solo en el cuerpo del texto. Un abridor no resuelto se retiene hasta`MAX_PENDING_CHARS = 4096`(`frontMatter.ts:62`) y se libera mediante`finalizeFrontMatter()`del`onClose`**antes** de`waitForAppendSettled`(`Markdown.ts:1409`) de la transmisión.

### Qué hacía la vía antigua

Antes de `incrementalLex`,`MarkdownWorker`contenía`{source, raws, version}`(`MarkdownWorker.ts:213` forma antigua), agregaba el delta y luego lexaba la fuente acumulada **completa**. La coincidencia de prefijo sin formato`99.5%`se ejecutó _después_ del lex, por lo que salvó las reconstrucciones de entidades pero nunca pudo guardar el lexing: un analizador lineal invocó`N`veces sobre un prefijo creciente. `postMessage`luego volvió a enviar todo el árbol de tokens. Ambas mitades eran`O(document)`por trozo; los puntos de referencia en § Números lo hicieron citable antes que la solución.

## Lex incremental — la idea del prefijo comprometido

`marked` no tiene API incremental. La solución rastrea un **límite de bloque estable** (un desplazamiento de caracteres antes del cual la lista de tokens ya no puede cambiar) y vuelve a leer solo el texto que sigue.

### La regla del corte estable

`findStableCut` (`incrementalLex.ts:331`) escanea hacia atrás en busca de un token`space`que tenga **al menos un token después**, nunca más allá del primero de dos tokens`paragraph`adyacentes, y solo cuando se liquide:

- Un`space`empujado siempre significa una **línea en blanco real**: un`\n`solitario se fusiona con el`raw`(`incrementalLex.ts:36`) del token anterior.
- Para cada regla integrada, solo se puede cambiar el token adyacente al final de la fuente. El formulario`nFollow >= 1`fue barrido por fuerza bruta: seguro para todos los tipos predecesores (`blockquote`,`code`,`heading`,`hr`,`html`,`list`,`paragraph`,`table`), mientras que`nFollow == 0`falla para`code`/`list`/`paragraph`(`incrementalLex.ts:39`).
- **`list`necesita un retraso de dos tokens.**`'- a\n\n- b\n'`es un`list`independientemente del recuento de líneas en blanco; siempre se fusiona el mismo marcador. `cutIsSettled`(`incrementalLex.ts:314`) requiere que el token después del`space`se liquide antes de realizar un corte a través de un`list`anterior.
- **`blockMath`alcance hacia adelante** está delimitado por una línea en blanco en el tokenizador:`(?:(?!\n[ \t]*\n)[\s\S])+?`(`Markdown.ts:294`,`MarkdownWorker.ts:122`). El`(?!\n\n)`anterior dejaba líneas de solo espacios en blanco sin protección:`'$$\nx\n   \n$$\n'`todavía era un`blockMath`(`incrementalLex.ts:67`).
- **`blockMath`alcance hacia atrás** es`paragraphPairCap`(`incrementalLex.ts:289`): el clip`startBlock`marcado solo puede fusionar **dos tokens`paragraph`adyacentes**, y un corte estable siempre termina después de un`space`, por lo que un par nunca puede traspasar un límite. La antigua cura (degradar cualquier inicio de línea `$$`) era suficiente pero nunca necesaria; estrechándose hasta el límite recuperado`139×`(ver § Números).
- **Las referencias de enlaces, los contenedores `:::`, las notas al pie `[^label]:`** se degradan directamente (`DegradeReason`en`incrementalLex.ts:225`): un`def`reescribe retroactivamente tokens en línea anteriores (`incrementalLex.ts:122`), una valla de contenedor y el escáner de continuación de notas al pie (`markdown-footnote.ts``consumeContinuation` ) no tienen límites hacia adelante alcance. Degradar mantiene la corrección; En cambio, rechazar un anticipo que no sea de mosaico (`advanceTiles`en`incrementalLex.ts:360`) cuesta una parte del crecimiento de la ventana.

Cada avance se **verifica** (`advanceTiles`,`incrementalLex.ts:360`):`source.slice`debe ser igual al`raw`concatenado de tokens que lo cubren. Una fuente que termina en un marcador de lista simple`'- a\n- '`se convierte en`'- a\n-\n'`sin formato: la suposición de que la fuente de mosaicos`raw`suele ser cierta, pero no siempre (`incrementalLex.ts:130`), por lo que los avances no verificados se rechazan en lugar de degradarse.

### Modelo de coste

- `tail = prev.tail + append`: el escaneo`tail`por sí solo mantiene el cheque`O(window)`en lugar de`O(document)`(`incrementalLex.ts:490`).
- _ICODE005_ ( _ ICODE006__ ) informa los caracteres realmente entregados a `marked.lexer()`: la medida directa de lo que salvó el límite.`reusedTokens`informa los tokens principales tomados del caché.
- La ingenua suma`sourceCharsLexed`estaba resumiendo`matchLen`raws por respuesta -`O(n²)`a través de una secuencia (#657). Ahora`IncrementalLexCache.stableOffset`se envía desde lex y se agrega`O(1)`(`Markdown.ts:989`,`Markdown.ts:2289`).

### Extensiones en el hot path — por qué PX-0524 importa

Cada extensión`marked`registra un escaneo + tokenizador `start()`. La ruta incremental debe clasificarlo (consulte § Agregar una extensión) o`sourceCharsLexed`regresa a la longitud del documento: la señal en el grupo`Parser cost`de`getDevtoolsDescriptor`(`Markdown.ts:2112`) de que esta instancia se degradó.

## Protocolo del worker — por qué la transferencia también importa

Relexing no fue el único término `O(N²)`. `postMessage`**clones estructurados** su argumento sincrónicamente en el hilo principal. El reenvío del documento completo por fragmento realizó la transferencia`O(document)`incluso después de que se abriera la ventana de lex: midió`4 µs`en 8 KB y aumentó a`220 µs`en 512 KB frente a`~2 µs`plano para una publicación del tamaño de un fragmento (`Markdown.ts:1017`).

La solución almacena en caché tanto los tokens sin formato **como** la fuente en el trabajador (`MarkdownWorker.ts:213``rawCache` ), con la clave`workerInstanceId`+`tokenVersion`(`Markdown.ts:1008`). Sin`tokenVersion`chocar con cada`setTokens`(`Markdown.ts:1043`), un`setContent`seguido de un anexo diferenciaría los archivos sin formato obsoletos.

- **Delta** —`append`+`expectedLength`(`Markdown.ts:2345`). El trabajador extiende`cached.lex.source`con`append`, verifica`cached.lex.source.length + append.length === expectedLength`(`MarkdownWorker.ts:308`) (un número entero, sin cadena) y ejecuta`lexAppend`.
- **Completo**:`text`+`oldRaws`(`Markdown.ts:2355`), para la primera solicitud,`setContent`, respaldo de sincronización o`needResync`. El trabajador solicita una resincronización (`MarkdownWorker.ts:294`,`299`,`334`) en lugar de enviar una fuente divergente; un`matchLen`incorrecto corrompería el`updateTokens`de la persona que llama.

`matchLen` se calcula a partir de la **misma** lista anterior con la que se diferencia la persona que llama. Cuando el trabajador reutilizó`reusedTokens`del lex, el escaneo comienza en`reusedTokens`(`MarkdownWorker.ts:385`) —`O(window)`; volver a escanear desde 0 sería`O(document)`nuevamente. El desalojo está limitado (`RAW_CACHE_MAX = 256`en`MarkdownWorker.ts:228`) por las caídas de entrada más antiguas.

La persona que llama toma instantáneas de`this.tokens`y`this.tokenVersion`en el momento del envío (`Markdown.ts:2252`) y se fusiona mientras`appendInFlight`es verdadero (`Markdown.ts:2220`). `dispatchedAt`las marcas de tiempo alimentan a`streamStats.workerMs / workerMsMax`(`Markdown.ts:2273`), cuyo peor valor es la señal de fotograma descartado.

## Reconciliación — árbol de tokens → árbol de entidades, sin reconstruir lo que no cambió

### La idea del prefijo comprometido — intuición

Piense en el documento como dos regiones divididas en`stableOffset`:

```text
[████████████ stable █████████████████] [ unstable tail ]
 |  already committed — never re-lexed  |  may still change |
 |  raw-equal, entity-reused            |  this chunk's work |
```

Agregar texto agregado a **solo cola** nunca puede afectar un prefijo estable, es decir, el invariante`findStableCut`que se obtiene por fuerza bruta. La cola es `O(window)`, limitada por la distancia entre las líneas en blanco más cualquier contenedor abierto, por lo que el trabajo por fragmento se escala con la región abierta, no con la longitud del documento.

### DevTools — observarlo en vivo

_ICODE000_ ( _ ICODE001__ ) muestra los contadores de transmisión en la narrativa anterior:

-`Streaming`—`appends`/`workerResponses`/`workerMsAvg`/`workerMsMax`(el fotograma eliminado es `max`, no `avg`).

- Relación`Delta shape`—`stablePrefixChars`/`changedTailChars`(cerca de 1 significa alta reutilización) y`entitiesReused`/`entitiesRebuilt`/`inPlaceUpdates`(la ruta rápida).
  \-`Incremental reuse`—`tokensPrefixMatched`/`tokensReturned`/`tokenPrefixReuseRatio`.
  \-`Parser cost`—`lexerMs`/`sourceCharsLexed`. Si`sourceCharsLexed`rastrea la longitud del documento, esta instancia se degrada.

### Mapear tokens a slots de hijos

No todos los tokens de bloque representan una entidad (`space`, no SVG`html`, los tokens tipo comentario representan`null`). `producesEntity`(`Markdown.ts:4044`) es el predicado; `tokenChildPrefix`es la suma de su prefijo, reconstruida solo para el sufijo modificado por`setTokens(validFrom)`(`Markdown.ts:1041`). `updateTokens`entonces:

1. Deriva `matchLen`: la longitud del prefijo igual sin formato. Cuando el trabajador proporcionó `knownMatchLen`, se valida (`0 ≤ knownMatchLen ≤ minLen`) en lugar de confiar ciegamente (`Markdown.ts:3689`).
2. Limita`matchLen`a`0`si`abbreviations`cambió (`Markdown.ts:3711``mapsEqual` sobre`collectAbbreviations`): un`*[TERM]: …`tardío puede afectar los tokens en línea de párrafos anteriores a pesar de que`raw`no haya cambiado (`markdown-abbr.ts`paralelo a`hasLinkDefinitions`).
3. Prueba una ruta rápida **in situ** cuando`matchLen === oldTokens.length - 1`y los tipos coinciden (`Markdown.ts:3760``lastTokenSameType` ). De lo contrario, corresponde destruir + reconstruir para el sufijo.

Nota:`updateTokens`'el bucle de destrucción comienza **en** `matchLen`; solía caminar desde`0`con una protección `i >= matchLen`, lo que lo convierte en`O(total blocks)`por fragmento incluso cuando el prefijo se reutiliza por completo (`Markdown.ts:3956`).

### Mutadores in-place — el caso de la cola creciente

La transmisión de realidad es **solo para agregar con una cola creciente**. Siete mutadores cubren las formas de la cola que realmente produce una corriente:

| ficha de cola               | mutador                                                                           | archivo: línea                                                 |
| --------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `paragraph` (no image)      | `RichText.setSpans(literalSpans)`                                                 | `Markdown.ts:3833`                                             |
| `paragraph` (image-bearing) | `Stack` of `[RichText, Image, …]`: extend trailing `RichText` via `setSpans`      | `Markdown.ts:3846` `updateImageParagraph` (`Markdown.ts:3085`) |
| `code` (unclosed fence)     | `CodeBlock.setCode(text, lang)`                                                   | `Markdown.ts:3796`                                             |
| `heading`                   | `RichText.setSpans(headingSpans)` with depth guard                                | `Markdown.ts:3875`                                             |
| `blockquote`                | descend to `innerStack` tail wrapper, rewrite its single child                    | `Markdown.ts:3900` `updateBlockquoteTail` (`Markdown.ts:3306`) |
| `list`                      | rewrite last retained item's `setSpans`, `append` new items                       | `Markdown.ts:3914` `updateStreamedList` (`Markdown.ts:2987`)   |
| `table`                     | `RichText.setSpans` on last retained row's cells, `Table.appendRows` for new rows | `Markdown.ts:3932` `updateStreamedTable` (`Markdown.ts:3203`)  |

Cada resincronización de cola es`resizeLastChild`(`Stack.ts`ruta rápida) -`O(1)`- no un`Stack.layout()`completo (`Markdown.ts:3843`,`3859`,`3886`,`3904`,`3945`). El atributo arm`reflowToken`(`Markdown.ts:1520`) es la contraparte sin transmisión de `setMaxWidth`; se mantiene en paralelo con `renderToken`, por lo que los cambios de ancho tampoco requieren reconstrucción.

`renderToken` (`Markdown.ts:4150`) es el sitio de construcción; `producesEntity`y`reflowToken`deben permanecer en **tres direcciones** a lo largo de los brazos que agrega: un nuevo brazo sin los otros dos es un error silencioso para uno de los tres sitios de llamada.

### Layout de bloques markdown

La geometría del bloque está controlada por`LayoutEngine`(`packages/layout/src/LayoutEngine.ts:808`). `RichText`se ajusta a`availableWidth`(`Markdown.ts:4158`) a través del espacio vertical`Stack``theme.blockGap` ; blockquotes y los contenedores`:::`sangran su`innerStack`por`quoteIndent`/`containerIndent`y cuelgan`QuoteBorder`/`ContainerBackground`de la altura`Stack`resultante (`Markdown.ts:3403`,`Markdown.ts:4402`). `measureText`para los botones de prestaciones utiliza la fuente del documento (`blockAffordances.ts:379`), por lo que se ajusta el tamaño del control antes de pintar. `LayoutEngine.prepareRich`es el interruptor de línea para `RichText`; su nota se basa en el contenido, no en el ancho, por lo que`setMaxWidth`se vuelve a ajustar mediante la forma, no mediante la nueva medición, la misma razón por la que existe `reflowToken`.

### Hooks de scroll y selección

El`Markdown`no virtualizado es un hijo normal de un`ScrollView`(`packages/ui/src/ScrollView.ts:219`controlador de resorte): el host se desplaza configurando`content.y`y llama a`notifyLayoutUpdated`(`Markdown.ts:2643`) cuando el rediseño mueve bloques debajo de una imagen. Con`virtualize`activado,`Markdown.setVisibleRange`(`Markdown.ts:1265`) es el controlador de desplazamiento; La altura fuera de la pantalla vive en `RowHeights`, no como entidades separadas. La selección vive en intervalos `RichText`; la reutilización del prefijo`updateTokens`mantiene los portadores`InlineObject`de las líneas establecidas (imagen/matemática`OBJECT_REPLACEMENT`) fuera de la ruta del compositor, mientras que el`setSpans`de la cola en crecimiento conserva la selección dentro de ella sin reconstruir la geometría de la línea.

## La trampa O(C·N²) y el bug de wrapper-instanceof

### O(C·N²) — la forma que los tests no generaron

Un token`table`lleva **cada fila**; un token`list`contiene **todos los artículos**; un`blockquote`lleva **cada bloque interno**. La ingenua reconciliación los reconstruyó todos en cada fragmento:

- Lista de`N`elementos, transmitidos elemento por elemento:`1 + 2 + … + N = Θ(N²)``RichText` construcciones: medido`528`contra`32`para una lista de 32 elementos (comentario `Markdown.ts:3908`).
- Table de`N`filas,`C`columnas:`Θ(C·N²)`construcciones de celdas **más**`Table.layout()`reejecución de`fitCell`en cada celda -`2×`en la parte superior.

El banco de transcripciones agregadas reveló que`mixed`todavía reconstruía una lista completa recién llegada en cada fragmento de prosa siguiente, invisible para cualquier forma de construcción única (`benchmarks/markdown-transcript/corpus.ts`).

### El fallo de wrapper-instanceof — por qué el streaming retrocedió bajo un flag opt-in

`blockAffordances: true` envuelve el código y las tablas en`BlockWithAffordances`(`blockAffordances.ts:433`): un`UIComponent`que posee el bloque más su copia/descarga`BlockAffordanceButton`secundarios, se dimensiona a partir del bloque (`blockAffordances.ts:457`) y se proyecta como`role: group`(`blockAffordances.ts:488`). El contenedor corrige DOM orden = orden de tabulación y evita robar el diseño de `Stack`/`Table`.

La ruta rápida de transmisión probó `existingEntity instanceof Table`/`instanceof CodeBlock` directamente. Con el contenedor activado, esas pruebas **siempre devolvían falso**, por lo que cada fragmento pagó la reconstrucción completa.

Sitios afectados antes de la corrección:`updateTokens`(`Markdown.ts:3781`,`Markdown.ts:3209`),`updateBlockquoteTail`extracción de cola (`Markdown.ts:3348`),`reflowToken``code` /`table`brazos (`Markdown.ts:1557`,`Markdown.ts:1651`),`updateStreamedTable`( `Markdown.ts:3212`). El patrón es:

```ts
const target = entity instanceof BlockWithAffordances ? entity.block : entity;
if (!(target instanceof Table)) return false;
// … and after a width/content change:
if (entity instanceof BlockWithAffordances) entity.refreshAffordances();
```

`#789` /`#795`(problema `vectojs`) es este error. `code-review-2026-08.md:167`registra todos los sitios juntos porque están agrupados.

### Por qué los tests de snapshot lo pasaron por alto

El conjunto de rebajas está dominado por instantáneas basadas en `setContent`. `setContent`**siempre reconstruye** (`Markdown.ts:1740`): restablece`tokenVersion`, borra los elementos secundarios y llama a`renderMarkdown`. **Nunca ejercita** la ruta de conciliación de transmisión (`updateTokens`+`inPlaceUpdates`/`entitiesRebuilt`/`tokenChildPrefix`+ desenvolvimiento del contenedor). Por lo tanto, una extensión u opción que solo interrumpe la ruta de reutilización pasó cada instantánea y solo falló bajo`appendMarkdown`en la granularidad del token. El sabotaje`1/11`que impulsó`setContent`y afirmó proteger la reutilización es el ejemplo canónico (`forge/findings/text-richtext-and-markdown.md:552`).

Regla de puerta: cualquier cambio de transmisión debe incluir **sabotaje de equivalencia de transmisión**: transmitir el corpus un carácter a la vez con`toEqual`profundo contra`marked.lexer()`en cada prefijo (patrón `incrementalLex.test.ts`) y con granularidad`appendMarkdown`para conciliación.

### La explosión de extensiones PX-0524 — cuando incremental aún no es gratis

Agregar cobertura de sintaxis (nota al pie, contenedor, emoji, abbr, ins/mark, superíndice:`markdown-footnote.ts``FOOTNOTE_EXTENSIONS`,`markdown-container.ts``CONTAINER_EXTENSIONS`,`markdown-emoji.ts``EMOJI_EXTENSIONS`,`markdown-abbr.ts``ABBR_EXTENSIONS`, `markdown-ins-mark.ts`, `markdown-superscript.ts`) tomó la instancia compartida`marked`de las extensiones`2`en`faeeb0b7`a`12`en `2a4bd52`. Cada uno es un par`start()`/`tokenizer`que`marked`consulta **por bloque y por tramo en línea**, por lo que incluso con`incrementalLex`ventana del lex a`O(tail)`, el costo por fragmento es`O(tail × extensions)`. El aumento del análisis`1.67×`en § Números es el precio de este grupo por fragmento, que nunca se midió cuando se envió. `markdown-math.ts:258``blockMath` /`inlineMath`son los dos que ya fueron pagados; los otros diez son el cambio de paso. Lección: cualquier adición de extensión debe volver a ejecutar las puertas de paridad`markdown-transcript`y `stream-markdown-smd`: una ganancia de factor constante del incremental puede ser devorada por una pérdida de factor constante del conteo de extensiones.

### Destrucción y el ráster que llega tarde

Otros dos ganchos del ciclo de vida compiten con el streaming. `Markdown.destroy()`(`Markdown.ts:1938`) elimina cada entrada`workerCallbacks`que fija`this`a través de su cierre; sin eso, una destrucción a mitad de camino mantendría vivo todo el subárbol hasta que el trabajador respondiera. `isDestroyed`bloquea la continuación`mathLoadPending`(`Markdown.ts:1952`) para que un árbol derribado no se vuelva a representar en un subárbol separado.

Las imágenes en línea y las matemáticas tienen sus propias correcciones posteriores a la transmisión. La imagen de un párrafo`onLoad`en`Markdown.ts:2562`vuelve a medir desde`naturalWidth`/`naturalHeight`y llama a`reflowAfterImageResize`(`Markdown.ts:2604`), que vuelve a derivar las cajas de envoltorio de abajo hacia arriba (`resyncWrapperBox`en`Markdown.ts:2674`); un`content.layout()`simple volvería a leer el caché principal obsoleta (comentario `Markdown.ts:2591`). Una imagen en línea dentro de un encabezado o celda de tabla no se puede cambiar de tamaño de la misma manera: su cuadro está integrado en la línea de `LayoutEngine`; en su lugar,`subscribeInlineImageRemeasure`(`Markdown.ts:1819`) vuelve a escribir cuando`inlineImageBoxesStale`(`Markdown.ts:1855`) informa una decodificación no cuadrada, pero solo una vez por URL (`inlineImagesMeasured`en`Markdown.ts:1894`). Las matemáticas son análogas:`ensureMathJax`(`Markdown.ts:3518`) fusiona cargas concurrentes en una promesa `preloadMathJax`, y`retypesetFromTokens`(`Markdown.ts:3551`) reconstruye al por mayor a partir de los tokens ya asignados, el único camino que mantiene`tokenChildPrefix`trivialmente correcto.

## Tensión a cinco bandas — el diseño debe satisfacer todo a la vez

| fuerza                       | lo que exige                                                                                                                                                        | donde vive                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Exactitud**                | `lexFull(source)` and streaming appends are **deeply identical** to `marked.lexer(source)` at every prefix length; `updateTokens` result equals `setContent` result | `incrementalLex.test.ts` char-at-a-time fuzz, `markdownWorkerProtocol.test.ts` diff gates strengthened to **tree equality**                                          |
| **Incrementalidad**          | Per-chunk work is `O(window)` (unstable tail), not `O(document)` — unbounded tail growth is a regression                                                            | `stableOffset` / `charsLexed` / `changedTailChars` counters; `sourceCharsLexed` must track payload share, not document length                                        |
| **Estabilidad de selección** | Agregar no debe mover ni destruir la selección dentro de un bloque estacionario en pantalla                                                                         | `tokenChildPrefix` + reuse of `matchLen` prefix entities; `updateTokens` never touches prefix children (`Markdown.ts:3956`)                                          |
| **Estabilidad del diseño**   | Ningún bloque fuera de la pantalla debe cambiar el diseño de un bloque en pantalla ya pintado a mitad de camino.                                                    | No `finalizeFrontMatter` shrink of `rawMarkdown` (protocol requirement); `resizeLastChild` tail-only resync; no image-resize reflow that re-reads stale parent boxes |
| **Actuación**                | El trabajo de renderizado/diseño por fragmento se mantiene dentro del presupuesto del marco después de la ganancia incremental                                      | § Numbers — reconcile now `~5%` of total; render `61%` and parse `33%` dominate                                                                                      |

Violar uno para ayudar a otro es un patrón recurrente: la solución inicial "obvia" (lex luego eliminar) reduce`rawMarkdown`y rompe el`expectedLength`del protocolo de trabajo; una corrección de imagen que se vuelve a diseñar desde`content`solo sin resincronizar los envoltorios deja cuadros principales obsoletos (`Markdown.ts:2595``reflowAfterImageResize` ).

## StreamController — pacing, backpressure y quién es dueño de close

`Markdown.appendMarkdown(chunk)` es el anexo sin formato. `Markdown.createStream(opts)`(`Markdown.ts:1384`) lo envuelve en un`StreamController`(`StreamController.ts:129`) que agrega tres cosas que la ruta sin formato no agrega: todas opcionales, todas de solo visualización, ninguna permite soltar caracteres:

- **Fusión de marcos.** Sin ritmo, cada`write()`publicaría para el trabajador y programaría una conciliación. El controlador procesa lotes en`requestAnimationFrame`ticks (`StreamController.ts:351``schedule` /`onFrame`). La persona que llama más simple no utiliza ninguna opción `pacing`, solo procesamiento por lotes RAF, que es el caso común de SSE estilo ChatGPT.
- **Estimulación del grafema.**`pacing: { graphemesPerSecond }`(`StreamController.ts:22`) drena la cola interna`chunks`a través de`commitPaced`(`StreamController.ts:378`) con`Intl.Segmenter`conteo de grafemas para que un efecto de máquina de escribir avance un grupo de grafemas por tick, no una unidad de código UTF-16 (los emoji permanecen intactos).
- **Contrapresión.**`maxBufferedChars`(`StreamController.ts:29`, predeterminado`64 KiB`) limita la cola; `write()`contrapresiones cuando está lleno (`StreamController.ts:183``canAdmit` /`blocked`). Esto es control de flujo, no corrección incremental: el búfer delimitado nunca trunca el documento.

El ciclo de vida es `createStream → write* → close() → onStable`. `createStream`se lanza si`virtualize`está activado (`Markdown.ts:1385`) o ya existe una secuencia (`Markdown.ts:1388`) — como máximo un controlador por instancia; La fusión de ranura única`appendInFlight`+`appendPending`de`updateTokens`lo asume. `close()`confirma cualquier fragmento pendiente de forma sincrónica (`StreamController.ts:244``commitAllSubmitted` ), cambia el estado a`closed`, luego espera el gancho`onClose`del host (`Markdown.ts:1404`) que ejecuta`finalizeFrontMatter`y`waitForAppendSettled`(`Markdown.ts:1413`- la última respuesta del trabajador + cualquier`mathLoadPending``preloadMathJax` +`fencedRebuildPending`). Sólo entonces`onStable`dispara (`Markdown.ts:1419`) con`Array.from(content.children)`- una instantánea, no una referencia en vivo (`incompleteMode.test.ts:313`). `onStable`no debe llamar a`appendMarkdown`/`setContent`/`setMaxWidth`(`Markdown.ts:3669``assertNotInStableCallback` ): se entrega el documento terminado para un trabajo único, como preparar un caché de resaltado.

## Sintaxis incompleta optimista — adivinando en el borde final

Un prefijo transmitido que termina en`**bo`debería mostrar **negrita** inmediatamente, no`**`sin formato. `StreamControllerOptions.incompleteMode`(`StreamController.ts:43`) controla esto; `Markdown.streamIncompleteMode`(`Markdown.ts:853`) mantiene la política mientras que`StreamController`solo posee el almacenamiento en búfer.

-`'literal'`(predeterminado): lo que incluían todas las versiones anteriores a esta opción: la sintaxis abierta se representa como texto sin formato de `marked.lexer`, por lo que`**bo`permanece`**bo`hasta que llega el cerrador.
\-`'optimistic'`—`optimisticParagraphSpans`(`Markdown.ts:3415`) escanea el **último token en línea** del párrafo **final** únicamente (una construcción cerrada ya es su propio token`strong`/`em`/`codespan`/ `link`, por lo que solo la ejecución final en texto sin formato puede contener un abridor). `findUnclosedInline`(`markdown-inline.ts:546`) verifica tres sintaxis con prioridad: comillas invertidas (gana por completo; dentro de un código, nada más es sintaxis), énfasis`*`/`_`(`\*{1,2}(?!\*)`marcador completo más guardia sin espacio;`_`excluye`snake_case`en`markdown-inline.ts:570`), y`[label](url`(`markdown-inline.ts:581`). La conjetura representa esa ejecución con el formato adivinado (`optimisticStyle`en`Markdown.ts:3484`) y lo rastrea en`optimisticTail`(`Markdown.ts:866`). Un anexo combinado puede dejar el párrafo adivinado sin cola:`dropStaleOptimisticTail`(`Markdown.ts:3611`) lo rebobina inmediatamente en lugar de esperar`close()`. En `close()`, cualquier conjetura restante se desenrolla en intervalos literales (`Markdown.ts:3574``unwindOptimisticTail` ), por lo que las transmisiones`literal`y`optimistic`terminan de manera idéntica. Las matemáticas (`$…$`) no se adivinan: sus`InlineObject`(`markdown-inline.ts:301`) reservan`width/height/depth`a través de`exToPx`(`markdown-math.ts`), no un estilo span.

## Virtualización vs streaming — la exclusión mutua no es una elección de política

`virtualize` (`Markdown.ts:760`) bloques de nivel superior de Windows como entidades a través de`virtualTokens`/`virtualHeights`(`RowHeights`) y`reconcileVirtual`(`Markdown.ts:1340`), controlados por el`setVisibleRange`del host (un`ScrollView`hace esto automáticamente). **No se puede** combinar con la transmisión (`Markdown.ts:1385`,`Markdown.ts:2187`ambos lanzan): la entidad para un bloque fuera de la pantalla no existe, por lo que la reutilización del prefijo`updateTokens``tokenChildPrefix` +`matchLen`abordaría una ranura secundaria que no está montada.

`tableViewportHeight` (`Markdown.ts:771`) es la trampilla de escape: virtualiza **filas dentro de cada tabla** mediante`Table.appendRows`+`reconcileVirtualRows`(`Table.ts:334`) y`bodyClip`fijación, y _funciona_ durante la transmisión porque`updateStreamedTable`agrega filas a través del mismo`appendRows`que ya se monta perezosamente. Elija`virtualize`para un documento estático enorme; elija`tableViewportHeight`para obtener un documento transmitido dominado por tablas anchas.

### Trampas de forma de párrafo — por qué `producesEntity` no es solo optimización

`producesEntity` decidir`text → image`a través de`paragraphHasImage`(`Markdown.ts:3807`guardia) es corrección, no velocidad: sin esto, un párrafo que obtiene su primera imagen mantiene su`RichText`y la imagen se elimina silenciosamente (`collectSpans`no emite nada por un token `image`). El análogo del elemento de la lista es`itemIsInlineOnly`(`Markdown.ts:2759`): eliminar`checkbox`de`INLINE_ITEM_TOKENS`(`Markdown.ts:2738`) fuerza cada elemento de la tarea a través de la ruta del bloque e interrumpe la representación de la lista de tareas; la lista de permitidos es lo que evita que un tipo de bloque futuro se aplane en un `RichText`.

## Números medidos — cita con el baseline

Solo se pueden citar los números`benchmarks/run-browsers.sh`(Chrome/Firefox con encabezado real, GPU real, `calibrateRefreshRate()`, espacio de trabajo dedicado de Hyprland por habilidad `hyprland-browser-bench`). Los`script/benchmark.ts`y`benchmarks/debug-page.ts`sin cabeza son trampa/depuración.

### Reconcile win — aggregate transcript (`markdown-transcript-aggregate-2026-07-30`, CTX-0148, PR #296, commit `0e4a4233`)

Carga de trabajo:`6`giros,`176`bloques,`27,882`caracteres,`6,543`fragmentos, **`token`granularidad** - la granularidad domina:`151`vs`14`fragmentos para el mismo documento en`token`vs`48`-char,`7×`diferencia de reutilización (`markdown-transcript-aggregate-2026-07-30.md:111`). Dos carreras por brazo; sólo`lastTokenSameType`volteado.

|                      | sin reutilización | hoy       | delta      |
| -------------------- | ----------------- | --------- | ---------- |
| conciliar, Chrome    | 1635.2 ms         | 319.5 ms  | **−80.5%** |
| reconciliar, Firefox | 992.2 ms          | 245.0 ms  | **−75.3%** |
| renderizar, cromo    | 3626.8 ms         | 3393.7 ms | −6.4%      |
| analizar, Chrome     | 1978.3 ms         | 1826.2 ms | −7.7%      |
| total, cromo         | 7240.4 ms         | 5539.4 ms | **−23.5%** |
| total, Firefox       | 6334.1 ms         | 5404.3 ms | **−14.7%** |

**Fase compartida tal como se envió** (total enviado`5539 ms`Chrome /`5404 ms`Firefox,`0.86 / 0.82 ms`por fragmento): renderizar `61.3 / 61.4%`, analizar `32.9 / 34.1%`, **reconciliar`5.8 / 4.6%`** — la conciliación ahora es la fase **más pequeña**; El margen de reutilización restante por tipo está limitado por ese límite.

### Panel-rate re-run (2026-08-08, `2a4bd52`, Firefox now at panel Hz)

| motor   | Hz              | analizar gramaticalmente | conciliar | prestar     | total       |
| ------- | --------------- | ------------------------ | --------- | ----------- | ----------- |
| Cromo   | 240.09 / 239.95 | 2826 / 2830              | 459 / 456 | 3386 / 3388 | 6670 / 6674 |
| Firefox | 229.01 / 241.26 | 3190 / 3282              | 311 / 315 | 3581 / 3691 | 7082 / 7288 |

Representación por fragmento`0.517 / 0.556 ms`=`12.4 / 13.3%`de un marco `4.16 ms`; total por fragmento`1.02 / 1.10 ms`=`24.5 / 26.4%`. La figura`≈60 Hz`de Firefox en la ejecución original (`58.75 Hz`) **no** era un artefacto de ventana desenfocada: era`layout.frame_rate = -1`(`forge/findings/devtools-and-telemetry.md:2026-08-03`).

**Surgió una regresión real:** el análisis aumentó`1.67×`en ambos motores. Lexing el mismo corpus`6543`-chunk contra`marked`desnudo frente a la instancia compartida de 12 extensiones:`1871 → 3127 ms`(`1.671×`). El costo es por fragmento y por extensión`start()`/`tokenizer`. En`faeeb0b7`la instancia llevaba extensiones `2`; en`2a4bd52`lleva `12`, el **precio no medido del clúster PX-0524**. Análisis compartido movido`33% → 42–45%`. La cifra`incrementalLex`es _después_ de que el lex ya tenía ventana; sin ella sería peor.

### Incremental lex win — prose fixture (`comparisons/stream-markdown-smd`, Chrome 150 / Firefox 153, 784 chunks)

Antes: re-lex completo por fragmento, `419.6 / 440.2 ms`, exponente `1.98`, caracteres entregados a lexer `9,847,040`. Después: `6.02 / 9.06 ms`, **`69.8× / 48.6×`**, exponente `0.94 / 1.21`, caracteres `63,806`, exponente`1.00`( `forge/findings/text-richtext-and-markdown.md:2026-08-03`).

### Math streaming after the cap narrowed (`markdown-stream-math`, vectojs#398)

Manta`blockMath`degradar → solo límite: **`139.3× Chrome / 96.5× Firefox`** en un documento matemático de sección `26,760`, `200`; caracteres a lexer`215.9×`reducción; el límite se establece en`99.84%`del documento; caracteres máximos lex`105`de un solo fragmento en cada tamaño (`forge/baselines/markdown-stream-math-findings.md`).

## Añadir una nueva extensión markdown sin hacer retroceder el streaming

Una extensión son dos registros (`Markdown.ts:240`y`MarkdownWorker.ts:95`- misma llamada `marked.use`, **ambos lados**, mismo tokenizador - la deriva interrumpe la vista del trabajador de`marked`). Cuatro controles, en orden:

### 1. Clasifica el alcance de la extensión

- **No`start()`y delimitado por una línea en blanco** → seguro; sin cambio de límites. Ejemplo: las reglas en línea (`abbr``markdown-abbr.ts` ,`emoji``markdown-emoji.ts` ,`footnote`ref`markdown-footnote.ts`mitad) no necesitan degradarse.
- **Suministros`start()`** → alcance hacia atrás; `paragraphPairCap`ya lo cubre, pero **verifique**: cualquier`start()`nuevo está cubierto porque el clip está marcado como de`blockMath`(`incrementalLex.ts:103`).
- **Abarca una línea en blanco** → alcance ilimitado hacia adelante; Patrón`hasContainerOpener`/`hasFootnoteDefOpener`(`markdown-container.ts: hasContainerOpener`,`markdown-footnote.ts: hasFootnoteDefOpener`). **Degradar** mediante`DegradeReason`(`incrementalLex.ts:225`): un techo cortado no puede limitarlo.
- **Recopila definiciones tardías** (`marked``def`patrón,`abbrDef`es el caso concreto que obligó a`abbreviationsChanged`a poner a cero`matchLen`en `Markdown.ts:3711`) → obliga a reconstruir o degradar; documentar por qué.

Si no está seguro, **degradar**: siempre es correcto y solo cuesta transmitir documentos que realmente contengan el abridor.

### 2. Registra en lockstep y verifica el guard

- Las copias idénticas del tokenizador`blockMath`en`Markdown.ts:294`y`MarkdownWorker.ts:122`ya se derivaron una vez (`[\s\S]+?`vs guardia de línea en blanco), y el trabajador se genera a través de`scripts/build-worker.js`→`MarkdownWorkerSource.ts`. Extraiga un módulo compartido si se desvía por tercera vez (`markdown-stream-math-findings.md: Also fixed`).
- Para un tokenizador con línea en blanco protegida, la protección debe ser`(?!\n[ \t]*\n)`(líneas de solo espacios en blanco incluidas), no`(?!\n\n)`(`incrementalLex.ts:67`, #398).

### 3. Enseña a cada sitio consciente de entidades

Para el tipo de token, su extensión agrega:

-`renderToken`— construcción (`Markdown.ts:4150`).
\-`producesEntity`(`Markdown.ts:4044`) —`true`si representa una entidad; `false`exactamente para tokens que representan`null`(de lo contrario,`tokenChildPrefix`se desvía).
\-`reflowToken`(`Markdown.ts:1520`) — ruta de cambio de ancho; El brazo faltante deja el bloque en su ancho anterior.
\-`updateTokens`rama local (`Markdown.ts:3760`): opte por participar solo si una forma en la que crece la cola tiene un mutador (`setSpans`/`setCode`/`appendRows`); Los tipos de contenedores (`blockquote`,`list`,`table`) pasan por un descenso de cola, no por una mutación directa.

- Si el bloque se puede envolver según las posibilidades, desempaquételo:`instanceof BlockWithAffordances ? .block : entity`y llame a`refreshAffordances()`después de mutar el tamaño interno (`Markdown.ts:3209`,`Markdown.ts:3781`patrón).
- Si pueden aparecer imágenes/matemáticas en línea dentro del nuevo bloque, cubra la suscripción`containsImage`/`containsInlineMath`(`Markdown.ts:4166`) y la resincronización del contenedor `reflowAfterImageResize`.

### 4. Añade el sabotaje, no solo el snapshot

-`incrementalLex.test.ts`char-at-a-time fuzz: transmite el corpus que contiene la nueva construcción un carácter a la vez, en profundidad`toEqual`contra`marked.lexer()`en cada prefijo. Mantenga el barrido de fuerza bruta sobre`14 docs × every prefix × every cut`que justificó `findStableCut`; ejecútelo con y sin la extensión para demostrar que`nFollow >= 1`aún se mantiene.

- **Transmisión de sabotaje de reconciliación**: transmita un documento que contiene la construcción con **granularidad de token** a través de`appendMarkdown`(no `setContent`), afirme que`inPlaceUpdates`/`entitiesRebuilt`/`charsLexed`se mueva en la dirección esperada y afirme un árbol de tokens profundo + igualdad de píxeles contra `setContent`; un sabotaje que impulsa a`setContent`no puede fallar en el camino de reutilización.
- Vuelva a ejecutar las puertas de paridad`comparisons/stream-markdown-smd`en **igualdad de árbol profunda** fuera del bucle cronometrado y las puertas de umbral en ambos motores; según `forge/findings/text-richtext-and-markdown.md:2026-08-03`, solo la igualdad de árbol detecta un número rápido para un análisis roto.

### Cronología — un chunk a través de las dos regiones

```text
chunk " world": "Hello **bo" → "Hello **world**"
  before: stable="Hello "  tail="**bo"        (paragraph, trailing plain run)
   lex:   tail re-lex → [text("Hello "), strong("world")]  charsLexed = tail.length
   diff:  matchLen=0 (paragraph raw changed), tail = [paragraph(strong)]
   reconcile: heading/paragraph didn't match → destroy old RichText, add new one
  after:  stable="Hello **world**\n\n"  tail=""  (blank line committed, entitiesReused++)
```

El compromiso ocurre cuando llega una línea en blanco y`findStableCut`puede avanzar. Hasta entonces, cada fragmento vuelve a visitar la misma cola: delimitada, sin crecer con la longitud del documento.

## Depurar streaming — qué comprobar primero

1. **`sourceCharsLexed`rastrea la longitud del documento** → degradado (`DegradeReason`en`incrementalLex.ts:225`); verifique`:::`/`[^`/`def`/`\r`en el documento o que falte un escaneo solo de cola (`incrementalLex.ts:490`).
2. **`inPlaceUpdates`plano mientras`entitiesRebuilt`sube** → falla en el lugar; grep`instanceof RichText`/`CodeBlock`/`Table`sin`BlockWithAffordances`desenvolver: error de contenedor clásico (`code-review-2026-08.md:167`).
3. **La instantánea pasa, la transmisión falla** →`setContent`ruta (`Markdown.ts:1740`) nunca ejercita`updateTokens`; escribe el sabotaje char-at-a-time.
4. **Falta el último fragmento después de`close()`** →`waitForAppendSettled`no esperado; marque`appendInFlight`/`mathLoadPending`/`fencedRebuildPending`puerta en `Markdown.ts:2429`.
5. **La selección salta al agregar** → el prefijo no se reutiliza; marque`tokenChildPrefix`rango válido (`Markdown.ts:1041``validFrom` ) y validación`matchLen`(`Markdown.ts:3689`).
6. **Reflujo del bloque fuera de la pantalla después de la decodificación de la imagen** →`reflowAfterImageResize`ruta contenedora (`Markdown.ts:2604`) obsoleta; marque`resyncWrapperBox`cubre el tipo de contenedor.

## Invariantes — checklist antes de la PR

1. **Identidad lex profunda.**`incrementalLex(charByChar(S))`es profundamente igual a`marked.lexer(S)`en cada prefijo, incluidas las líneas en blanco que solo contienen espacios en blanco y los marcadores de lista desnudos.
2. **Transferir identidad.**`matchLen`el prefijo raw es igual y`[...oldTokens.slice(0,matchLen), ...tail]`es igual al lex completo, validado en`Markdown.ts:3689`y en el trabajador en `MarkdownWorker.ts:308`.
3. **Entity-acuerdo de índice.**`producesEntity ↔ renderToken null ↔ reflowToken arms ↔ tokenChildPrefix`de cuatro vías; probado con`BlockWithAffordances`**activado**.
4. **Mutación de solo cola.** Ninguna ruta local toca un prefijo secundario; cada devolución anticipada deja la entidad intacta, por lo que una reutilización rechazada no es una actualización a medias.
5. **Cuota lineal en el costo de transmisión.** La cuota por fragmento (si se aplica) es lineal en el costo`append`(ventana `charsLexed`) y solo se limita la entrada fluida: los envíos almacenados en búfer se confirman completos (el ritmo`StreamController.ts`es de solo visualización; la corrección nunca elimina caracteres).
6. **Rumbo estable en profundidad.**`heading`se reutiliza in situ solo cuando`oldDepth === newDepth`(`Markdown.ts:3875`); de lo contrario,`font`estaría obsoleto (solo constructor `RichText`).

## Referencias

- `vectojs-docs/content/learn/streaming.md`: API de transmisión orientada al usuario y ciclo de vida `createStream`.
- `vectojs-docs/content/learn/text-typography.md`: por qué las matemáticas/imágenes en línea y`RichText`/`LayoutEngine`interactúan con la transmisión.
- `vectojs-docs/forge/findings/text-richtext-and-markdown.md`: notas de campo para cada error de transmisión cuya medición obtuvo una línea arriba.
  \-`vectojs-docs/forge/baselines/markdown-transcript-aggregate-2026-07-30.md`y `markdown-stream-math-findings.md`: las dos líneas base citables y sus motores/compromisos.
- `vectojs-docs/forge/code-review-2026-08.md:167,170`: el clúster`BlockWithAffordances``instanceof` +`refreshAffordances`(`#789`/`#795`,`#701`).
  \-`packages/markdown/test/incrementalLex.test.ts`y `markdownWorkerProtocol.test.ts`: los contratos de protocolo y equivalencia de streaming de cualquier nueva extensión deben permanecer en verde.

---

_Siguiente: 05 Zero-DOM TeX: el núcleo de composición tipográfica, emisión`InlineObject`y`SVGEntity`con la que se miden las tablas y las matemáticas en streaming._
