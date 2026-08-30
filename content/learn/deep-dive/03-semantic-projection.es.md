---
title: '03 — Proyección semántica + Virtualización'
description: 'El ciclo de vida del DOM en tres niveles — Visual, Semántico, Interacción — y cómo VectoJS materializa solo lo utilizable, ventana lo seleccionable y mantiene honesto el foco itinerante.'
order: 23
---

# 03 — Proyección semántica + Virtualización

VectoJS hace que **cero sea visible DOM**. Todo lo que ves es lienzo. Todo lo que toca un lector de pantalla, un usuario de teclado o un agente Playwright es una **fina sombra proyectada** en`Scene.a11yRoot`(un solo`position:absolute`div sobre el lienzo, `packages/core/src/tree/Scene.ts:2390`). Esa sombra no es un nodo por entidad: es un ciclo de vida de tres niveles que limita el costo a la ventana gráfica y al mismo tiempo mantiene el texto fuera de la pantalla accesible para búsqueda y lectura anticipada.

## Los tres niveles — un diagrama

```text
                      ┌─────────────────────────────────────┐
                      │        Virtual Math Tree (VMT)      │
                      │  Entity tree · worldMatrix · bounds │
                      │  packages/core/src/tree/Scene.ts    │
                      │  packages/core/src/tree/Entity.ts   │
                      └──────────────┬──────────────────────┘
                                     │  syncA11y + syncContentProjection
                                     │  (shared depth-first walk, every frame
                                     │   or throttled — see §2)
                 ┌───────────────────┼───────────────────┐
                 ▼                   ▼                   ▼
   ┌─────────────────────┐ ┌───────────────────┐ ┌─────────────────────┐
   │  Visual tier        │ │  Semantic tier    │ │  Interaction tier   │
   │  (always rendered)  │ │  (coarse, resident)│ │  (windowed, fine)  │
   │                     │ │                    │ │                     │
   │  Canvas2D / WebGL / │ │  One DOM node per  │ │  Per-line carriers  │
   │  WebGPU / SVG draws │ │  block holding its │ │  (spans per line /  │
   │  every entity that  │ │  full `text` so    │ │  spans per glyph    │
   │  passes culling.    │ │  find-in-page and  │ │  cluster when grid) │
   │  Subject to         │ │  read-ahead see    │ │  plus a11y mirrors  │
   │  `getRenderChild-   │ │  the whole doc.    │ │  (`button`, `grid-  │
   │  Range` /           │ │  Outside the       │ │  cell`, hotspots).   │
   │  viewportCullChild- │ │  interaction margin│ │  Only near-viewport │
   │  ren. No DOM cost.  │ │  carriers are NOT  │ │  materialized.      │
   └─────────────────────┘ │  built.            │ └─────────────────────┘
                           └───────────────────┘
        Pixels ─────────────►  `getContentProjection().text`  ─────────►  `lines` / `grid`
                              `SceneOptions.contentSemanticMargin`
                                                            `SceneOptions.contentProjectionMargin`
                                                            `SceneOptions.contentSemanticBudget`
```

¿Por qué dos márgenes? Un escalar no puede expresar "cada bloque tiene DOM pero solo los bloques cercanos a la ventana gráfica tienen portadoras": un valor finito liberó por completo los bloques fuera de banda, mientras que`Infinity`también eliminó todas las portadoras (`O(total glyphs)`). Consulte`SceneOptions.contentSemanticMargin`vs`contentProjectionMargin`(`Scene.ts:328`,`336`,`359`) y el fundamento de la enumeración rechazada en`vectojs-docs/forge/baselines/content-projection-frontload-findings.md:1`.

| nivel              | donde vive                                              | cerrado por                                                                            | por defecto                                                |
| ------------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Visual             | tiendas de respaldo de lona                             | `viewportCullChildren` + `getRenderChildRange` (`Entity.ts:788`, `1970`)               | eliminar: optar por contenedor                             |
| Semántico (grueso) | one `div` per block, `el.textContent = projection.text` | `contentSemanticMargin` — whether the block has _any_ DOM                              | `contentProjectionMargin ?? Scene.height` (`Scene.ts:355`) |
| Interacción (bien) | Portadores por línea/por celda + espejos a11y           | `contentProjectionMargin` + `projectionLineWindow` (`scene/content-line-window.ts:25`) | una altura de ventana gráfica                              |

`contentSemanticBudget` (`Scene.ts:359`,`DEFAULT_CONTENT_SEMANTIC_BUDGET = 256`en`Scene.ts:600`) distribuye la construcción única de nivel residente entre marcos: solo se presupuestan bloques gruesos; un bloque dentro de la banda de interacción se materializa inmediatamente independientemente del presupuesto.

## Cómo funciona el recorrido `syncA11y` — y cuándo

`syncA11y` no es "un método completo". Es el **controlador compartido de primer recorrido en profundidad** para toda la proyección de contenido _y_ de 11 años (`A11yProjectionManager.ts:30`,`ContentProjectionManager.ts:26`). Dividirlos requirió`DEC-0020`/`DEC-0022`por una razón: el punto de recursividad llama a`syncContentProjection`y`syncA11y`inicializa los cuatro campos por sincronización que lee el lado del contenido (`_syncSerial`,`contentSemanticBudgetLeft`,`contentSemanticDeferred`,`contentSelectionPresentThisSync`). `DirtyTracker`(`scene/DirtyTracker.ts:33`) determina si la caminata se ejecuta; `a11ySyncInterval`lo acelera aún más sin exceder el presupuesto.

Por fotograma (o limitado a _ICODE000_, _ICODE001_):

1. **Cobrar + cheque sucio.** Cada entidad`interactive`con una casilla distinta de cero (o `a11yFullViewport`, `Entity.ts:912`) llama a`getA11yAttributes()`(`Entity.ts:1898`). El recorrido lee `interactive`, `a11yHidden`,`a11yProjection`y`a11yFullViewport`juntos: un ancestro oculto oculta todo su subárbol independientemente de las banderas secundarias (consulte § Enfoque). Si`getContentEpoch()`(`Entity.ts:2048`) no ha cambiado, los bloques de contenido sin cambios omiten la reconstrucción por completo. La época es el equivalente en proyección de contenido de la bandera sucia VMT: comparación de enteros barata, sin diferencia de cadenas. Las entidades que devuelven`null`de`getContentProjection()`no pagan ningún costo de contenido.
2. **Crear / actualizar / reposicionar.** La caminata crea el elemento de sombra (`a`/`button`/`img`/`input`/`textarea`o`div`,`A11yAttributes.tag`en`Entity.ts:295`), aplica cada campo`A11yAttributes`con verificación sucia por atributo (devolviendo`undefined`elimina el atributo (`false` vs`undefined`importa para `aria-invalid`) y escribe`top`/`left`/`width`/`height`desde la matriz mundial de la entidad a través de`CanvasGeometry`(`scene/CanvasGeometry.ts:93`). Se asignan Canvas compensación y escala no uniforme CSS; La rotación/inclinación arbitraria CSS del lienzo principal no es compatible. `A11yAttributes.level`/`posInSet`/`setSize`/`rowCount`/`rowIndex`se proyectan como`aria-level`/`posinset`/`setsize`/`rowcount`/ `rowindex`: se requieren para listas/cuadrículas virtualizadas para que AT anuncie el tamaño del conjunto de datos, no la ventana.
3. **Ordenar + podar.**`A11yProjectionManager.collect`(`A11yProjectionManager.ts:157`) toma el ancestro`a11yRegion`/`clipChildren`más cercano como la _región_ del elemento; `reorder`(`A11yProjectionManager.ts:178`) ordena en banda`normalElements`en orden de lectura visual (`sortNormalElementsVisually`,`A11yProjectionManager.ts:351`) e inserta cursor por DOM padre para que se conserve el anidamiento compuesto (`grid > row > gridcell`). Los puntos finales Focus y`Selection`dentro de un subárbol movido se capturan una vez, pagando un diseño forzado por paso de _reordenamiento_ en lugar de por elemento movido (`A11yProjectionManager.ts:230`). Todo lo que no se recopile en este pase se elimina (`isActive`en`A11yProjectionManager.ts:169`). `a11yNeedsReorder`(`Scene.ts:1381`/`A11yProjectionManager.ts:88`) es el indicador que activa la clasificación.
4. **Lado del contenido.** En su punto de recursividad, el recorrido llama a`syncContentProjection`para cada entidad cuyo`getContentProjection()`no sea nulo. La prueba de caja (`projectionBoxVisible`) decide lo aproximado o lo liberado; la banda de línea (`projectionLineWindow`/`projectionGridLineWindow`,`scene/content-line-window.ts:2`) decide qué líneas de un bloque superviviente obtienen portadores. Los bloques de cuadrícula pasan por`ContentGridProjector.syncGrid`(`scene/ContentGridProjector.ts:69`) con firmas por línea para que los anexos de transmisión reutilicen los portadores sin cambios; Los bloques que no son de cuadrícula usan `el.replaceChildren()`. `ContentProjectionHint`(`Entity.ts:ContentProjectionHint`) permite que Scene le diga a la entidad qué banda es realmente necesaria para que`getContentProjection`pueda evitar crear líneas descartadas; es una recomendación, por lo que ignorarla siempre es correcto.

### Hooks de ciclo de vida

`Entity.onMounted()` se activa una vez cuando la entidad ingresa a un Scene activo (`Entity.ts:add`/`_notifyMounted`). Un grupo de puntos de acceso que necesita saber cuándo asignarlo puede anularlo; `remove(child)`llama a`scene.detachA11y(child)`(`Entity.ts:remove`) y marca`a11yNeedsReorder`. `Scene.detachA11y`es idempotente (la segunda separación no es operativa), por lo que la limpieza del grupo`Tabs`/`Table`que separa los puntos de acceso antes de eliminar la fila es segura incluso si la entidad ya no está.

### Presupuesto y control de márgenes

Tres mandos, un contrato:

-`contentProjection: false`desactiva toda la capa de contenido (escenas decorativas).
\-`contentProjectionMargin`(una altura de ventana gráfica predeterminada, `Scene.ts:328`): ventana de interacción. Finito = portadores con ventana; `Infinity`= cada transportista materializado (prohibido en producción - `O(glyphs)`).
\-`contentSemanticMargin`— puerta gruesa. `Infinity`+ margen de interacción finito = cada bloque tiene`text`para búsqueda/lectura anticipada, mientras que solo los bloques cercanos a la ventana gráfica pagan por los operadores. La configuración segura y deseada para un nivel residente. Sin él, el mismo`Infinity`también cancelaría los operadores.

- `contentSemanticBudget = 256`: cuántos bloques gruesos pueden materializarse por sincronización. Limita el puesto de apertura de documentos (medido ~0,03 ms por bloque más un piso por pasada que crece con el recuento de residentes). Los bloques visibles ignoran el presupuesto.

El presupuesto se dimensionó por medida en`DEC-01KZ8DZE`después de la corrección de notas a continuación; consulte `forge/baselines/content-projection-frontload-findings.md:Two approaches rejected`.

### Por qué no un DOM por Entity

El costo es superlineal en el recuento de nodos proyectados. Medido en hardware real (portátil RTX 4060, entidades en movimiento, un elemento cada una) —`content/learn/accessibility.md:353`:

| entidades interactivas | Cromo/marco | Firefox/marco |
| ---------------------- | ----------- | ------------- |
| 1,000                  | 6.4 ms      | 7.4 ms        |
| 5,000                  | 59.5 ms     | 114 ms        |
| 20,000                 | 715 ms      | 2737 ms       |

El costo por entidad _aumenta_ con el recuento (la clasificación + reconstrucción del árbol a11y del navegador se degrada). Una segunda medición a 5.000 entidades en movimiento (`Entity.ts:933`doc,`benchmarks/lazy-a11y/`):`eager`= **72,2 ms Chrome / 114,3 ms Firefox** vs`onDemand`= **1,55 / 1,63 ms**, piso sin proyección **1,26 / 1,65 ms**. La caminata en sí es ~0,005 µs/entidad; el DOM es el costo. Por lo tanto, un DOM por Entity en 36 000 entidades no es una extrapolación lineal; está dominada por la reconstrucción del árbol a11y, razón por la cual el mismo documento cita el colapso de 36 000 → 1 026 como la victoria del _sistema_, no la victoria del paseo.

### Engagement — modos `a11yProjection` (`Entity.ts:968`)

-`eager`(predeterminado): el espejo dura tanto como`interactive`+ caja. Para botones, enlaces, entradas.

- `onDemand`: espejo solo mientras está _participado_: enfocado, objetivo del puntero o`Scene.requestA11yProjection(id)`(`Scene.ts:1481`). El desplazamiento por sí solo **no** se activa (los usuarios de teclado/AT no generan desplazamiento). Una entidad`onDemand`sin espejo recibe **ningún evento de puntero**: la prueba de aciertos del lienzo (`findEntityAt`) es una API de consulta, no una ruta de envío (`Entity.ts:953`).
  \-`never`— nunca hay espejo. Prefiera _ICODE009_ a menos que deba permanecer la prueba de impacto.

Para miles de objetos efímeros (partículas, danmaku), el patrón es una región activa agregada (`role: 'status'`,`a11yFullViewport`,`Entity.ts:193`) más un pequeño grupo de puntos de acceso para la selección actual; consulte`forge/findings/core-a11y-and-input.md:178`(Bakudan`DanmakuAnnouncer`).

## Virtualización — hacer scroll sin pagar por el documento

### ScrollView / Viewport

El desplazador primitivo (`packages/ui/src/ScrollView.ts:58`) es un contenedor recortado (`clipChildren = true`) cuyo hijo`content`se traduce por`-scrollTop`. Expone`scrollTo`/`scrollToBottom`/`jumpTo`, impulsa un integrador de resorte exponencial en`update`(`ScrollView.ts:219`) y mantiene el estado de desplazamiento visible para comprobaciones inactivas a través de`hasPendingAnimations()`para que las escenas`onDemand`no se detengan a mitad del desplazamiento. `driveVirtualizableContent`(`ScrollView.ts:233`) permite que un niño`VirtualList`sea dueño de su propia ventana dentro del pergamino.

Un`Flow`o`Stack`dentro de un`ScrollView`tiene un diseño normal; sólo el clip + traducción virtualiza la _pintura_; el costo DOM todavía está limitado por las ventanas de proyección de contenido. `Flow`finaliza en `maxWidth`; `Stack`es el contenedor de espacio vertical/horizontal (`packages/ui/src/Stack.ts`,`Flow.ts`). `Card`es un grupo decorado (`packages/ui/src/Card.ts:80`,`role: group`cuando está etiquetado) - no virtualizado en sí mismo, sino un hijo común de una ventana gráfica virtualizada.

`getA11yAttributes()` devuelve`{ pointerEvents: 'none' }`(`ScrollView.ts:289`): la superficie de desplazamiento en sí no es un objetivo de impacto; los descendientes poseen el puntero (consulte el punto de acceso § a continuación). `a11yHidden`en un`ScrollView`contraído oculta su subárbol de la proyección incluso mientras se ejecuta la animación del clip (`Entity.ts:a11yHidden`, verificado en`Overlay`después de`hide()`).

### VirtualList — ventanas de filas (`packages/ui/src/VirtualList.ts:179`)

Solo se montan las filas en`[visibleTop - overscan, visibleBottom + overscan]`(`_visibleRange`en`VirtualList.ts:468`,`overscan = 3`por defecto,`VirtualListOptions:102`). El resto no existe como entidades: ni dibujo en lienzo, ni espejo, ni proyección de contenido. El recuento de montajes permanece`O(viewport)`independientemente del tamaño del conjunto de datos.

El desplazamiento matemático es`O(log n)`a través de un árbol Fenwick (`RowHeights`,`VirtualList.ts:14`) que responde a`total()`,`prefix(i)`(= y de la fila`i`) y`indexAt(y)`(= fila que contiene el desplazamiento`y`). Las alturas comienzan en`estimatedRowHeight`y se vuelven a medir por fila montada en cada cuadro (`_measureMountedRows`,`VirtualList.ts:540`): una lectura de campo simple, no se necesita bandera sucia y no hay`markDirty`en la ruta sin cambios para que el acelerador inactivo no sea derrotado. `_reconcile`(`VirtualList.ts:488`) recicla entidades fuera de rango antes de montar otras nuevas.

Las listas con clave (`keyForItem`,`VirtualList.ts:117`) conservan las alturas medidas en`setItems`, anclan el desplazamiento por identidad del elemento (no por índice) y siguen la parte inferior cuando`distanceToBottom ≤ 48 px`(`VirtualList.ts:517`). Sin `keyForItem`,`setItems`borra el caché de altura y salta al principio: correcto para una lista reemplazada, incorrecto para una transcripción en crecimiento.

A11y: el recuento del contenedor pertenece a su **nombre**, no a`aria-setsize`(no permitido en `role="list"`), según`getA11yAttributes`en`VirtualList.ts:660`y el documento de clase en `VirtualList.ts:170`. Cada _fila_ debe devolver`posInSet`/`setSize`(`Entity.ts:A11yAttributes.posInSet`/`setSize`) o un lector de pantalla anuncia el tamaño de la ventana montada en lugar del conjunto de datos. `VirtualList`agrupa sus puntos de acceso de fila de la misma manera que lo hace `Table`: un grupo por fila visible.

### Teselado de grilla de contenido — grueso vs fino (§ diagramas arriba)

Dos rutas comparten un contrato de ventana (`scene/content-line-window.ts`):

- **Sin cuadrícula** (párrafos,`Text`/`RichText`):`projectionLineWindow`(`content-line-window.ts:44`) sobre`ContentProjection.lines`. Los bloques gruesos contienen un nodo de texto (`el.textContent = projection.text`); Los bloques finos reemplazan los soportes por ventana. Cada`ContentProjectionLine`lleva`text`,`separatorAfter`(envoltura suave consumida versus rotura dura),`x`/`y`/`baseline`, opcional`runs`con`x`/`width`para texto justificado y`perGraphemeCarriers`/`shapedPaint`para ajuste de red CJK.
- **Cuadrícula** (bloques de código,`Markdown`CodeBlock vía`PreparedContentGrid`en`@vectojs/text`):`projectionGridLineWindow`(`content-line-window.ts:114`) sobre`PreparedContentGrid`. `ContentGridProjector.syncGrid`crea un intervalo por grupo de glifos con calibración`scaleX`por celda (`ContentProjectionManager.scheduleGridCalibration`, lote de lectura/escritura en frío fuera de sincronización) y reutiliza líneas por firma (`ContentGridProjector.ts:199`) para que los anexos de transmisión eviten reconstrucciones de `O(cells)`. `ligatures: 'none'`en el texto de la cuadrícula evita que la contracción`ffi`de Firefox se desvíe de los cuadros de selección.

La ventana es el **eje contiguo que se superpone a la banda de la ventana gráfica expandida**; un espacio separaría el texto fuera del orden DOM y rompería el orden de copia de la selección. Cuando nada se superpone, la línea más cercana se mantiene para que el texto permanezca accesible (`content-line-window.ts:79`). La promoción (grueso → fino) elimina explícitamente el nodo de texto aproximado: la cuadrícula no puede usar`replaceChildren()`o se pierde la reutilización de la transmisión (`ContentGridProjector.ts:111`). La degradación libera DOM; la puerta semántica mantiene el texto localizable sin portadores.

La preservación de la selección tiene en cuenta los niveles:`ContentProjectionManager`(`scene/ContentProjectionManager.ts:1`) toma instantáneas de los puntos finales como _compensaciones lineales_ para no cuadrícula y _compensaciones de origen_ para la cuadrícula, memoriza`selectionPresent`por recorrido (un diseño forzado por recorrido, no por elemento; la solución memorizada tomó un drenaje de 1000 bloques de diseños de 2002 a 19, `forge/baselines/content-projection-frontload-findings.md:153`), y se restaura solo cuando la línea afectada fue realmente reconstruida: los operadores reutilizados mantienen los nodos`Selection`activos. `clipToBounds`en un bloque de código de desplazamiento evita que un resaltado de selección pase más allá del cuadro de entidad.

### Teselado de Markdown + Table

- **Markdown** (`packages/markdown/src/Markdown.ts:681`) — dos ejes independientes:`virtualize`(`MarkdownOptions:625`) _bloques_ de nivel superior de Windows como entidades (opt-in, incompatible con streaming, impulsado por`setVisibleRange`desde un host`ScrollView`con`RowHeights`en `Markdown.ts:774`), mientras que`tableViewportHeight`(`MarkdownOptions:652`) corrige la ventana gráfica del cuerpo de cada`Table`para que sus filas se virtualicen a mitad de camino a través de`Table.appendRows`. Un`Stack`con`cullOffscreenChildren`es el host de contenido en ambos casos. `Markdown`posee`getContentProjection`por bloque; el anfitrión posee el desplazamiento. La transmisión Markdown reutiliza entidades de bloque sin cambios por prefijo; solo se reconstruye la cola (jefe 04).
- **Table** (`packages/table/src/Table.ts:144`) —`viewportHeight > 0`fija el encabezado, crea un desplazamiento recortado`bodyClip`(`Table.ts:183`), construye perezosamente celdas de cadena en la entrada de la ventana (`ensureBodyCells`en`Table.ts:853`/`reconcileVirtualRows`en`Table.ts:392`) y mantiene solo`first..last`filas montadas (`overscan = 2`). El modo clásico crece para adaptarse a todas las filas con alturas medidas variables. El cuerpo a11y es un`RowHotspot`(`role: row`) +`GridCellHotspot`(`role: gridcell`/`columnheader`) agrupado por fila visible: `O(viewport)`, no`O(rows)`( `Table.ts:199`,`622`). `getContentProjection`devuelve`null`en el propio `Table`: las celdas poseen su texto. Las sumas de prefijos`rowTops`(`Table.ts:751`) hacen`_syncGridA11y`O(1) por ranura en lugar de O(filas²).

### Stack / Flow / Card dentro de un viewport

`Stack` (`packages/ui/src/Stack.ts`) y`Flow`(`packages/ui/src/Flow.ts`) son contenedores de diseño no virtualizados: colocan elementos secundarios e informan`width`/`height`, pero no recortan ni ventana. Dentro de un`ScrollView`o padre virtualizador, está el _contenido_ que se traduce o selecciona:

-`Stack`con`direction: 'vertical'`+`gap`es el host Markdown`content`(`Markdown.ts:1088`) y el hijo ScrollView típico. Con`cullOffscreenChildren = true`también omite`getContentProjection`para niños fuera de la pantalla: una segunda puerta económica antes de la ventana de nivel Scene.
\-`Flow`incluye elementos secundarios en línea en`maxWidth`y es el caballo de batalla de párrafos de texto; al igual que Stack, se basa en su antecesor de desplazamiento para la activación de la ventana gráfica.
\-`Card`(`packages/ui/src/Card.ts:80`) es un contenedor`role: group`decorado con relleno/borde/sombra; nunca se virtualizó, pero es un hijo frecuente de`VirtualList`filas o`Markdown`bloques. Su función a11y es`group`solo cuando está etiquetada.

Ninguno de estos posee`getRenderChildRange`de forma predeterminada: pintan a todos los elementos secundarios y permiten que el clip del antepasado + la ventana de proyección tengan un costo limitado. Solo`Markdown`/`Table`/`VirtualList`implementan virtualización a nivel de fila/bloque.

### Culling por viewport — nivel visual (`Entity.ts:788`)

Independiente de la proyección DOM:

```ts
entity.viewportCullChildren = true;
entity.getRenderChildRange(localViewport: Bounds): RenderChildRange | null {
  // return { start, end } of children intersecting the viewport, or null for none
}
```

`Stack` /`Flow`deje esto desactivado de forma predeterminada (barato para un número modesto de niños). Actívelo para un contenedor con miles de elementos visuales secundarios donde la selección del _canvas_ dibujo en sí es importante: las ventanas de proyección no ayudan al nivel visual y el recorrido del árbol sin selección es`O(total entities)`por fotograma sincronizado (`forge/baselines/content-projection-frontload-findings.md:Not addressed`,`vectojs#350`).

### Ciclo de vida de promoción / degradación

```text
  off-screen                          near viewport                    on-screen
 ──────────── ──contentSemanticMargin── ──contentProjectionMargin── ────────────
  (released)          (coarse)                     (fine)
  no DOM              el.textContent = text        per-line / per-cell carriers
  not findable        findable, no per-line        findable + selectable +
                      selection geometry            copy + per-line highlight

  demotion ◄──────────────┘                          └──────────────► promotion
  `syncContentProjection` frees carriers;            `syncGrid` strips coarse text node,
  coarse text stays if inside semantic gate;         materializes windowed carriers;
  outside both gates the element is removed.         outside semantic gate but inside
                                                     interaction gate: direct to fine.
```

El presupuesto se aplica sólo a la promoción gruesa→fina desde fuera de banda; desplazar un bloque que ya es aproximado en la banda de interacción ignora el presupuesto.

## Patrón hotspot — semántica sin DOM que aún responde al teclado

Los widgets compuestos (`role="grid"`,`tree`,`menu`,`radiogroup`,`tablist`) deben exponer **un rol por hijo**, no solo un rol de contenedor, y deben mantener **una tabulación** en orden secuencial; un árbol de mil tabulaciones no se puede utilizar. VectoJS agrupa un elemento secundario transparente y enfocable`UIComponent`sobre cada elemento secundario visible (`vectojs/AGENTS.md:Zero-DOM a11y hotspot pattern`):

```ts
class GridCellHotspot extends UIComponent {
  constructor(private table: Table) {
    super();
    this.interactive = true; // so syncA11y projects it at all
    this.on('keydown', (e) => this.table.handleGridKey(e, this.rowIndex, this.colIndex));
  }
  getA11yAttributes(): A11yAttributes {
    return {
      role: this.rowIndex < 0 ? 'columnheader' : 'gridcell',
      label: this.label, // WCAG 4.1.2 — every control needs a name
      tabIndex: this.table.isGridTabStop(this.rowIndex, this.colIndex) ? 0 : -1,
      pointerEvents: 'none', // lets selectable cell text own the pointer
    };
  }
  render(): void {} // Table paints the cell on canvas
}
```

| Componente        | Hotspot rol                                       | Propietario de parada itinerante                  | Llaves                                                                                    |
| ----------------- | ------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `Table`           | `gridcell` / `columnheader` in `row`              | `isGridTabStop(row, col)` (`Table.ts:473`)        | Flechas 2D, fila Inicio/Fin, Ctrl+Cuadrícula Inicio/Fin, ventana gráfica Re Pág/Abajo     |
| `VirtualList` row | caller-provided (e.g. `listitem`)                 | row's own `isTabStop`                             | Arriba/Abajo                                                                              |
| `TreeView`        | `treeitem` (`aria-level`, `expanded`, `selected`) | `isTabStop(nodeId)` (`Tree.ts:389`)               | Arriba/Abajo, Expandir a la derecha → Entrar, Contraer a la izquierda → Padre, Inicio/Fin |
| `ContextMenu`     | `menuitem` (`haspopup`, `expanded`)               | `isMenuTabStop(idx)` (`ContextMenu.ts:270`)       | Ajuste arriba/abajo, Inicio/Fin, Apertura derecha, Atrás izquierda, Cierre escape         |
| `RadioGroup`      | `radio` (`aria-checked`)                          | `isTabStop(value)` (`RadioGroup.ts`/`Tabs.ts:42`) | Flechas + Inicio/Fin                                                                      |
| `Tabs`            | `tab` (`aria-selected`)                           | pestaña seleccionada                              | Flechas + Inicio/Fin                                                                      |

Precedente:`RadioGroup`/`Tabs`(#160),`Tree`/`Table`/`ContextMenu`(#191); referencias en vivo en `Table.ts:56`, `82`,`Table.ts:624`(`_syncGridA11y`), `VirtualList.ts:170`, `ScrollView.ts:289`, `ContextMenu.ts:292`, `RadioGroup.ts:32`, `Tree.ts:98`. Solo se agrupan los niños visibles, por lo que un`Table`virtualizado proyecta`O(viewport)`puntos de acceso.

### El razonamiento tras `pointerEvents: 'none'`

La entrada Canvas se enruta **solo a través de espejos proyectados**:`Scene`vincula`pointerdown`/`pointerup`/`click`/`wheel`por espejo (`Scene.ts:3512`) y`pointermove`/`pointerleave`en el lienzo solo para seguimiento de desplazamiento. Por lo tanto,`pointerEvents: 'none'`en un punto de acceso no solo lo "elimina de la prueba de acceso", sino que elimina por completo la ruta de entrada del mouse, mientras que el foco del teclado y el`click`sintetizado AT aún enrutan (`forge/findings/core-a11y-and-input.md:336`). Úselo cuando algo _debajo_ posee el puntero:

- texto de celda seleccionable (`Table.ts:116`),
- superficies de arrastrar para desplazar (`ScrollView.ts:289`),
- manejo del golpe de lona dentro de un envoltorio.

**No** lo use en el elemento propietario del controlador: una subclase`ScrollView`que configuró`pointerEvents: 'none'`en sus propios atributos silenció su desplazamiento`wheel`/`pointerdown`sin errores (`forge/findings/core-a11y-and-input.md:336`).

### Foco, tabindex itinerante y orden de lectura

- **Índice de tabulación móvil**: exactamente un punto de acceso por compuesto tiene `tabIndex: 0`; el padre mueve la parada con las teclas de flecha y la enfoca (`Table.handleGridKey` en `Table.ts:490`, `findHotspot`/`_focusCell` en `Table.ts:560`, `VirtualList`/`Tree`/`ContextMenu` equivalentes). Cuando la virtualización desmonta la fila enfocada,`Table`vuelve a anclar la parada en una fila visible _antes_ de volver a vincular`tabIndex`(`Table.ts:667`) y restaura DOM el foco solo si la celda anterior realmente lo mantenía (`activeCellHoldsFocus`en`Table.ts:592`), por lo que desplazarse a otra parte nunca roba el foco. La trampa de enfoque centinela`a11yRoot`mantiene el enfoque dentro de la escena (`Scene.ts:1482`).
- **Orden de lectura/tabulación**: los espejos se ordenan por bandas de arriba a abajo y luego en línea, estables, por _región_ — ancestro`a11yRegion`o`clipChildren`más cercano (`A11yProjectionManager.ts:351`). Sin regiones, un arrastre vertical a través de una transcripción se traga una barra lateral cuyos títulos comparten las mismas bandas de filas (`A11yProjectionManager.ts:339`). Establezca`a11yRegion = true`(`Entity.ts:a11yRegion`) en una columna sin recorte para mantener su arrastre/contigüidad separada. RTL es`Scene.readingDirection`(`Scene.ts:392`). La capa`a11yRoot`está`z-index: 10`encima del lienzo (`Scene.ts:2403`) con`pointerEvents: none`de forma predeterminada, volteada a`auto`solo durante un arrastre para que la selección pueda comenzar en regiones en blanco.
- **Ocultar un subárbol**:`a11yHidden = true`(`Entity.ts:a11yHidden`) oculta todo el subárbol de la proyección;`interactive = false`en un contenedor solo deja niños aún interactivos proyectados (verificado en `Popover.hide`, `forge/findings/core-a11y-and-input.md:622`). No se infiere de `opacity`: la opacidad impulsada por el resorte se mantiene cerca de cero sin siquiera alcanzarla.

## Elegir una configuración

| documento                       | margen semántico                | margen de interacción              | presupuesto | nota                                                                                                                 |
| ------------------------------- | ------------------------------- | ---------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------- |
| lienzo decorativo               | `contentProjection: false`      | —                                  | —           | sin costo DOM en absoluto                                                                                            |
| Documento breve (< 300 bloques) | por defecto                     | por defecto                        | 256         | el valor predeterminado ya es óptimo                                                                                 |
| Documento desplazable largo     | `Infinity`                      | predeterminado (1 ventana gráfica) | 256         | nivel residente recomendado: búsqueda y lectura anticipada de todo el documento, los operadores permanecen limitados |
| Transcripción de 10k bloques    | `Infinity`                      | `2 * viewport`                     | 256–512     | un margen de interacción más amplio reduce la pérdida de promociones mientras se desplaza                            |
| Campo de partículas/danmaku     | — (sin proyección de contenido) | —                                  | —           | `a11yProjection: 'onDemand'` or aggregate `role: status` live region                                                 |

`content-visibility: auto` y el texto activado por desplazamiento se midieron y rechazaron; consulte `forge/baselines/content-projection-frontload-findings.md:Two approaches rejected`. El primero no compra nada más que`display:none`para proyecciones fuera de pantalla; este último elimina texto específicamente para usuarios de teclado/AT.

## Trampas — los bugs que ya se enviaron

1. **Duplicación gruesa→fina** (`forge/findings/core-a11y-and-input.md:2026-08-08`): un bloque de cuadrícula promovido desde gruesa dejó atrás su nodo de texto`textContent`mientras que los portadores se agregaron a través de operaciones exclusivas `children`, duplicando`textContent`(758 frente a 379 caracteres medidos). Se solucionó eliminando los nodos de texto antes del bucle del operador (`ContentGridProjector.ts:111`).
2. **Selección más allá del inicio de la ventana** (`forge/findings/core-a11y-and-input.md:2026-08-08`,`ContentGridSelectionWindow.test.ts`): al desplazarse más allá del _inicio_ de la ventana se reconstruyó el portador sin soltar el `Selection`, dejándolo en un nodo separado. Se necesita`selectionLine < start || >= end`izado por encima del bucle de materialización.
3. **`pointerEvents: none`mata el ratón** (`forge/findings/core-a11y-and-input.md:2026-08-02`) — ver punto de acceso §; sin advertencia, sin error, solo una superficie de desplazamiento muerta.
4. **Retraso en la reproyección de superposición**:`DirtyTracker`+`a11ySyncInterval`la interacción con`showOverlay`alguna vez se sospechó y luego se retractó como un artefacto del navegador en segundo plano (`forge/findings/core-a11y-and-input.md:2026-08-16` retracción,`2026-08-15`original). La lección: verifique`document.hasFocus()`y un contador rAF en la página antes de atribuir un retraso en el recuento de fotogramas al Scene.
5. **Colisión de identificación fija** (`forge/findings/core-a11y-and-input.md:2026-07-16`,`vectojs#117`) — once componentes`ui`alguna vez llamados`super('ClassName')`, que comparten una entrada de mapa `a11yElements`; Dos`PanelGroup`enrutaron eventos de puntero al divisor incorrecto. Corregido por`super()`→ identificación aleatoria.
6. **`a11yHidden`vs`interactive`** (`forge/findings/core-a11y-and-input.md:622`) — configurar`interactive = false`en un contenedor no oculta sus elementos secundarios aún interactivos; `a11yHidden`lo hace.

## Automatización — la proyección también es el transporte de input

Un Playwright`getByRole('button', { name })`no golpea la lona. Llega al espejo de sombra en`a11yRoot`y los oyentes por espejo de`Scene`(`Scene.ts:3512`) se vuelven a enviar como`VectoJSEvent`(`Entity.ts:VectoJSEvent`) con semántica`bubbles`y `stopPropagation`. Es por eso que el mismo`A11yAttributes.label`que anuncia un AT es también el selector que usa un agente: no se necesita ningún adaptador, no se necesita `data-testid`. `debugA11y`más`getA11yTree()`es la superficie de afirmación del agente; `data-vecto-id`es el localizador estable cuando la etiqueta es dinámica.

Consecuencia: una entidad inactiva`onDemand`o un subárbol`a11yHidden`no tiene espejo y, por lo tanto, **no hay ruta de envío del puntero**:`scene.findEntityAt(x,y)`aún devuelve la entidad (API de consulta), pero`entity.on('click')`nunca se activa. Una superficie de gesto global que debe permanecer reactiva al puntero mientras AT-invisible usa`a11yFullViewport = true`+`a11yProjection: 'eager'`+`getA11yAttributes() => ({ tabIndex: -1 })`y no tiene función: el espejo se puede enfocar para el enrutamiento del puntero pero no tiene nombre AT.

El propio`a11yFullViewport`(`Entity.ts:912`) monta un espejo`100vw × 100vh`detrás de todos los demás espejos (`A11yProjectionManager.ts:fullViewportElements`permanece en el orden de inserción) de modo que una superficie de interacción que cubre un lienzo nunca ocluye los controles superiores. El patrón lo utilizan `DanmakuAnnouncer`, el receptor de clics del escritorio de Webos y cualquier controlador de panorámica de lienzo infinito.

## Qué puede proyectar `getA11yAttributes` — la superficie

`A11yAttributes` (`Entity.ts:295`) es la única API que una entidad personalizada necesita. Cada campo se ensucia por atributo por cuadro:`undefined`elimina,`false`escribe`aria-invalid="false"`(explícitamente válido), por lo que la distinción es importante:

- **Identidad**:`tag`(`div`/`a`/`button`/`img`/`input`/`textarea`),`role`,`label`/`labelledby`/`describedby`.
- **Enfoque/puntero**:`tabIndex`(ver § itinerante),`pointerEvents`(`auto`/`none`).
- **Accesorios nativos** (solo para coincidir con `tag`):`href`/ `target`,`src`/ `alt`,`inputType`/`placeholder`/`value`/`checked`/ `textInputStyle`.
- **Estado**:`disabled`,`checked`,`selected`,`expanded`,`required`,`invalid`,`level`,`valuemin`/`valuemax`,`ariaModal`,`controls`/`haspopup`/`activedescendant`.
- **Conjunto/cuadrícula virtualizada**:`posInSet`/`setSize`(lista),`rowCount`/`rowIndex`/`valueText`/`orientation`(cuadrícula): sin estos, una lista virtualizada de 10k filas anuncia el "elemento 3 de 12" (la ventana, no el conjunto de datos).
- **En vivo**:`live`(`off`/`polite`/`assertive`) +`atomic`/`relevant`— la ruta del locutor de transmisión (jefe 04).

`getA11yAttributes()` predeterminado (`Entity.ts:1937`) devuelve`{}`→ un`div`simple sin función, lo cual es correcto para un bloque de texto no interactivo que aún necesita una proyección de contenido.

## Números de rendimiento citables (y dónde se midieron)

Solo se pueden citar los números`benchmarks/run-browsers.sh`en una ventana enfocada respaldada por GPU (consulte la regla de referencia global `AGENTS.md`). Todas las figuras a continuación provienen de ese arnés a menos que se indique lo contrario. Utilice `calibrateRefreshRate()`: nunca codifique 60/240 Hz (Firefox tiene por defecto 60 Hz sin `layout.frame_rate`). Verifique `validation.ok`,`crossOriginIsolated`y`refreshHz`en el sobre JSON: una ventana desenfocada informa 0 ticks/s y cada reclamo de ms es nulo.

**Costo de proyección versus recuento interactivo** — `content/learn/accessibility.md:353`, `Entity.ts:933`:

| condición                        | Cromo         | Firefox       | fuente                                                                                     |
| -------------------------------- | ------------- | ------------- | ------------------------------------------------------------------------------------------ |
| 1.000 interactivos en movimiento | 6,4 ms/cuadro | 7,4 ms/cuadro | learn/accessibility §Cost + `lazy-a11y` floor                                              |
| 5.000 ansiosos                   | 59.5–72.2 ms  | 114 ms        | learn table + `benchmarks/lazy-a11y/` (`Entity.ts:933` doc)                                |
| 5,000 `onDemand` (same scene)    | 1.55 ms       | 1.63 ms       | `benchmarks/lazy-a11y/` floor 1.26/1.65 ms                                                 |
| 20.000 ansiosos                  | 715 ms        | 2737 ms       | tabla de aprendizaje/accesibilidad (superlineal: 6,4→35,7 µs/Chrome, 7,4→136,9 µs/Firefox) |

**La virtualización gana** —`forge/findings/core-a11y-and-input.md:240`(Galería 346 KB Markdown, 172–238 Hz, GPU real):

| métrico                       | antes (sin puerta de ventana gráfica)  | después                        |
| ----------------------------- | -------------------------------------- | ------------------------------ |
| DOM elementos                 | 14,843                                 | 254                            |
| nodos de contenido proyectado | ~1,250                                 | 29 (recicla en desplazamiento) |
| nodos de texto                | 9,369                                  | 160                            |
| desplazarse p95               | ~50 ms                                 | 4.3 ms                         |
| marco de desplazamiento       | 55 fps / 18 ms                         | 238 fps / 4,2 ms               |
| montón                        | 125 → 224 MB durante el desplazamiento | ~100 MB                        |

**Costo de nivel semántico aproximado**:`forge/baselines/content-projection-frontload-findings.md: Finding 3`(Chrome 151 a 240 Hz, Firefox 153 a 240 Hz, `runId 20260804T155826Z-5cdf96`):

| bloques | pauta  | `firstSyncMs` (hybrid vs native)                                 |
| ------- | ------ | ---------------------------------------------------------------- |
| 100     | 300    | 10.3 ms (1.6×) / 5.0 ms (1.1×)                                   |
| 1,000   | 3,000  | 20,6 ms (4,5×) / 16,0 ms (5,3×) — ~un fotograma caído en abierto |
| 10,000  | 30,000 | 146.6 ms (19.9×) / 144.8 ms (21.4×)                              |

El costo por edición sigue siendo bajo (`editOffBand`1.09/3.06 ms a 10k,`Finding 4`). Drenaje final presupuestado después de la corrección de la nota`Selection`(ejecutar `20260805T080824Z-e79819`, `forge/baselines/content-projection-frontload-findings.md:Two approaches rejected`): Chrome 21,29 → 10,66 ms a 1k y 139,5 → 12,0 ms a 10k; Firefox 21,86 → 5,88 ms y 141,6 → 9,2 ms. Por bloque ~0,03 ms: la cifra anterior de ~13 µs/nodo era nula (medida con`display:none`nodos residentes que nunca ingresaron al diseño).

## Checklist de depuración

1. **`scene.getA11yTree()`primero.** Cada punto de acceso y nodo de contenido está ahí con`role`/`label`/`tabIndex`— si`getByRole`no encuentra nada,`interactive`o`width`/`height`es cero, no el selector (`Scene.ts:2390`guard,`content/learn/accessibility.md:Troubleshooting`). El propio`a11yRoot`está excluido del árbol.
2. **`debugA11y: true`** (`SceneOptions:debugA11y`,`Scene.ts:204`) — contornos discontinuos azules sobre`a11yRoot`; control posicional más rápido. Los espejos son`opacity: 0`de lo contrario (la capa`Scene.ts:2401`es `z-index: 10`,`pointerEvents: none`hasta que se arrastra). Alternar en tiempo de ejecución a través de `scene.debugA11y = true`.
3. **DOM inspección**: cada espejo lleva`data-vecto-id = entity.id`más`role`/ `aria-*`; verifique la presencia de`aria-label`(el rol sin nombre se anuncia como un "botón"/"control deslizante" simple, `content/learn/accessibility.md:Screen reader testing checklist`). Los portadores de contenido transportan los conjuntos de datos`data-vecto-grid-*`y `data-vecto-projection-*`. Utilice`document.querySelectorAll('[data-vecto-id]')`para contar los espejos en vivo frente a los esperados.
4. **`scene.getA11yElement(entity.id)`** — el`HTMLElement`en vivo para verificaciones de enfoque; El patrón`activeCellHoldsFocus`(`Table.ts:592`) muestra cómo probarlo. `null`significa que este fotograma no está proyectado (fuera de la ventana gráfica,`a11yHidden`o`onDemand`inactivo). Compare`scene.a11yElements.size`antes/después de`showOverlay`para captar regresiones de proyección superpuesta.
5. **`a11yProjection`verificación de puerta** —`onDemand`sin compromiso no tiene espejo y, por lo tanto, no tiene eventos de puntero. Verifique`Scene.requestA11yProjection`o el estado del foco antes de culpar al despacho. Recuerde que`findEntityAt`todavía funciona (no está cerrado), por lo que un controlador`pointerdown`a nivel de lienzo se activaría mientras que el`on('click')`de la entidad no lo haría.
6. **`pointerEvents`auditoría** —`grep -rn "pointerEvents.*none" packages --include="*.ts"`y confirmar la propiedad del controlador. Un error de selección/desplazamiento silencioso es más frecuente que un error de clip. `ScrollView`en`ScrollView.ts:289`es el par canónico contenedor-no-posee-ninguno, niño-posee-auto.
7. **Orden de lectura**: descargue`getA11yTree()`y verifique que el orden de las bandas coincida con las filas visuales. Un`a11yRegion`mal colocado aparece como un orden de región principal donde se esperaba la banda principal (`A11yProjectionManager.ts:351`agrupación de regiones).
8. **Selección/calibración de cuadrícula** —`ContentProjectionManager.scheduleGridCalibration`escribe por celda `scaleX`; verificar la generación `data-vecto-grid-calib`. Una generación obsoleta después de cargar una fuente significa que`contentFontEpoch`no fue modificado. `content-visibility: auto`fue medido y rechazado (`forge/baselines/content-projection-frontload-findings.md:Two approaches rejected`); `contain: layout`en`a11yRoot`es intencional (`Scene.ts:2402`).
9. **Triaje de rendimiento** —`PhaseTimer`fases`calibScan`/`calibProbeBuild`/`gridMaterialize`(`scene/PhaseTimer.ts`),`ContentGridProjector``vectoGridMaterializeMs` conjunto de datos,`scene.frameStats`(`Scene.ts:518`) y DevTools`getDevtoolsDescriptor()`en`ScrollView`/`VirtualList`/`Table`. Para los números que se pueden citar, solo cuenta`benchmarks/run-browsers.sh`en una ventana enfocada; Hyprland en segundo plano proporciona`0 ticks/s`y cada reclamo por cuadro es nulo (retracción `forge/findings/core-a11y-and-input.md:2026-08-16`).

## Cómo verificar que la virtualización realmente funciona

Tres controles, en orden:

1. **Cuente DOM.**`document.querySelectorAll('[data-vecto-id]').length`vs`scene.a11yElements.size`vs el tamaño del conjunto de datos. Un Table virtualizado de 10k filas debería mostrar ~`viewport/rowHeight + 2*overscan`espejos, no 10k. Si el número rastrea el conjunto de datos, la virtualización está desactivada (`viewportHeight`no configurada o`a11yProjection: 'eager'`en cada entidad de fila en lugar del grupo de ventanas).
2. **Desplácese y vuelva a contar.** El conjunto debe reciclarse: el mismo recuento, diferentes`data-vecto-id`a medida que se mueve la ventana. Un recuento creciente significa espejos filtrados (`detachA11y`no llamado al desmontar, o un grupo que crece sin reducirse; verifique`Table.ts:701`bucle de reducción y`VirtualList.ts:_reconcile`rama de reciclaje).
3. **Sobre perforado.**`scene.frameStats`(`Scene.ts:518`) +`benchmarks/run-browsers.sh --validation`en una ventana enfocada. Si el desplazamiento p95 permanece >10 ms después de la virtualización, el costo ya no es DOM cuenta; verifique la calibración de la cuadrícula`PhaseTimer`o el recorrido`syncA11y`(`O(total entities)`sin`viewportCullChildren`,`vectojs#350`).

## Dónde se sitúa este jefe en el grafo de docs

- **Requisito previo**: Boss 06 (tiempo de ejecución VMT: sucio/ciclo de vida/eventos, bucle `DirtyTracker`, `DriverTicker`, `Scene`). Este jefe reutiliza la maquinaria sucia/de ciclo de vida de 06 y supone que usted conoce el paso VMT.
- **Se empareja con**: Boss 01 (Selección: el otro consumidor de proyección de contenido),`content/learn/accessibility.md`(instrucciones),`content/reference/core-a11y.md`(verdad API),`content/reference/core-entity.md`(`A11yAttributes`superficie,`getA11yAttributes`/`getContentProjection`/`getContentEpoch`ganchos).
- **Conduce a**: Boss 04 (Transmisión Markdown —`Markdown`protocolo de enlace de virtualización + conciliación incremental que reutiliza las ventanas de este jefe), Boss 07 (Renderizador: coherencia de clip/DPR para el nivel visual), Boss 12 (DevTools —`getDevtoolsDescriptor`superficies para el estado de virtualización).

No`cp -r`entre`vectojs-docs/content`y `vectojs-website/src/content`: deriva de formato + 408 archivos i18n (`AGENTS.md`). Primero edite el lado autorizado (`vectojs-docs/content`), obtenga una vista previa con`scripts/sync-content.py`y luego envíe ambos repositorios.

## Invariantes (checklist de commit para este jefe)

1. **Sucio + geometría de acuerdo.**`getContentEpoch()`choca siempre que la salida de`getContentProjection()`sea diferente; `Scene`omite bloques sin cambios desde la segunda sincronización en adelante. Romper esto paga`O(total blocks)`por fotograma en lugar de `O(changed)`. No hay atajo `content-visibility`: se midió y se rechazó. `onDemand`las entidades inactivas no están sucias por definición.
2. **Paridad de mundo dual para cada interactivo visible.** La geometría del mundo, el rol/nombre/estado y el enrutamiento de enfoque/puntero coinciden con la verdad del lienzo, impuesta por el recorrido compartido`syncA11y`y la clasificación visual por región de `enforceA11yDomOrder`. Un deslizamiento`interactive = false`vs`a11yHidden`proyecta un control oculto en el orden de tabulación. Cada interactivo lleva`aria-label`a menos que su nombre accesible provenga de `aria-labelledby`/texto contenido. Los espejos`a11yFullViewport`siempre están detrás de los espejos normales.
3. **Ventanas contiguas.** Las ventanas de cuadrícula de líneas son una única ejecución contigua por bloque (`scene/content-line-window.ts:Contiguous on purpose`): un espacio separaría el texto fuera del orden de selección/copia. `clipChildren`/`a11yRegion`son los únicos saltos de región. La división entre márgenes semánticos y de interacción es toda la API: no los colapses.
4. **El propietario del puntero es explícito.** Cada par de puntos de acceso declara quién es el propietario del puntero; las pruebas que controlan entidades directamente no detectarán un`pointerEvents: 'none'`que silenció una ruta del mouse (`forge/findings/core-a11y-and-input.md:336`). `onDemand`sin compromiso tiene un puntero muerto por diseño: use`a11yFullViewport`+`eager`+`tabIndex: -1`para una superficie de puntero AT-invisible.
5. **El orden de lectura es visual, no de inserción.**`A11yProjectionManager.sortNormalElementsVisually`+ el agrupamiento de regiones es el orden de tabulación/AT; insertar niños en cualquier orden, pero dibujar de izquierda a derecha aún debe tabular izquierda → derecha. `a11yHidden`nunca se infiere de la opacidad. `forcedColors`(`Scene.forcedColors`) es un problema de repintado, no de proyección: el dibujo de alto contraste permanece en el nivel visual.
6. **El presupuesto no oculta el texto visible.**`contentSemanticBudget`nunca retrasa un bloque dentro de la banda de interacción; posponer el texto visible lo haría no seleccionable brevemente (`Scene.ts:376`). La garantía es probada por`ContentProjectionSettledWalk.test.ts`(pruebas de 2 vs 802 cajas). `Infinity`es seguro para`contentSemanticMargin`y está prohibido para `contentProjectionMargin`; el costo que lo hizo no compatible fue una banda portadora sin ventana, no un texto residente.
7. **Los conjuntos virtualizados anuncian el tamaño del conjunto de datos.** Una lista/cuadrícula virtualizada con 10k elementos pero 12 filas montadas debe proyectar`posInSet`/`setSize`(o `aria-rowcount`) para que AT escuche "elemento 400 de 10000", no "elemento 3 de 12". El nivel de contenedor`aria-setsize`en`role="list"`no está permitido (`VirtualList.ts:660`).

## Lecturas adicionales — cada afirmación anclada

| afirmar                                  | `file:line`                                                                                                                                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scene opciones/presupuesto               | `Scene.ts:204`, `263`, `328`, `336`, `359`, `600`, `1398`, `1481`, `2403`, `3512`                                                                                                                   |
| Entity a11y + ganchos de contenido       | `Entity.ts:295`, `788`, `912`, `968`, `1898`, `1970`, `2018`, `2048`                                                                                                                                |
| Responsables de proyección               | `A11yProjectionManager.ts:30`, `157`, `169`, `178`, `351` · `ContentProjectionManager.ts:26` · `ContentGridProjector.ts:69` · `content-line-window.ts:25`                                           |
| Virtualización de la interfaz de usuario | `ScrollView.ts:58`, `233`, `289` · `VirtualList.ts:14`, `117`, `170`, `660` · `Table.ts:144`, `392`, `624`, `751` · `Card.ts:80`                                                                    |
| Markdown mosaico                         | `Markdown.ts:625`, `652`, `681`, `774`                                                                                                                                                              |
| Hallazgos/líneas de base                 | `forge/findings/core-a11y-and-input.md:178`·`240`·`336` · `forge/baselines/content-projection-frontload-findings.md:1` · `content/learn/accessibility.md:353` · `content/reference/core-a11y.md:10` |
| Hotspot precedente                       | `vectojs/AGENTS.md` (Zero-DOM hotspot) · PR #160 · PR #191 · `Table.ts:56`                                                                                                                          |

---

_Siguiente: 04 Transmisión Markdown: lex incremental, trabajador + conciliación y protocolo de enlace de virtualización`Markdown`↔ `ScrollView`._
