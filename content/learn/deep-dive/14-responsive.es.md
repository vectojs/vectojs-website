---
title: '14 — Layout Responsivo e Interacción — Adaptación a Viewport e Input'
description: 'El viewport como restricción: reflow en resize/zoom, pases de layout Stack/Flow, dashboards de paneles, windowing con VirtualList, física de ScrollView, handles de ResizablePanel, colocación de overlays y estados hover/focus — todo en el mundo nativo de canvas de VectoJS.'
order: 34
---

# 14 — Layout Responsivo e Interacción — Adaptación a Viewport e Input

> En un navegador DOM, el layout responsivo es CSS: media queries, flexbox, grid y contenedores de scroll que el motor te da gratis. En VectoJS no hay motor CSS — cada píxel es aritmética sobre un árbol de entidades retenido en un único `<canvas>`. El viewport es solo otro número que invalida cachés, un offset de scroll es un `y` impulsado por spring, y un overlay es una entidad re-parentada a `overlayRoot` con un cómputo de colocación explícito. Este documento explica cómo esos números se mantienen consistentes cuando la ventana cambia de tamaño, el usuario hace zoom o un dedo arrastra el divisor de un panel.

- **Qué aprenderás**: cómo `Scene.resize()` propaga un cambio de viewport a través de backing stores del renderer, niveles de proyección y pases de layout; cómo `Stack`/`Flow`/`Card`/`PanelGroup` componen dashboards responsivos sin motor CSS; cómo `VirtualList` convierte 10k filas en ~15 entidades montadas; cómo la física de springs de `ScrollView`, los handles de arrastre de `ResizablePanel`, el flipping de colocación de `Overlay` y los anillos hover/focus de `Button` cierran el bucle de interacción — todo con recibos file:line.
- **Qué no aprenderás**: ciclo de vida VMT/dirty/despacho de eventos (boss 06), shaping de texto y partición de líneas (boss 02), proyección semántica (boss 03) ni diffing de Markdown en streaming (boss 04).

## 1. El viewport es una restricción, no un contenedor

### 1.1 Scene.resize() — la única fuente de verdad

`Scene.resize(width, height)` en `packages/core/src/tree/Scene.ts:6381` es el límite del viewport:

```ts
public resize(width: number, height: number): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0) {
    if (!this.hasWarnedInvalidResize) console.warn(`...`); return;
  }
  this.width = width; this.height = height;
  this.contentFontEpoch++; this.contentViewportEpoch++;
  (this.renderer as any).resize(width, height);
  if (this.pointRenderer) { this.pointRenderer.resize(width, height); }
  if (this.gpuCanvas) this.sizeGpuCanvas(this.gpuCanvas, width, height);
  this.markDirty();
}
```

Cinco cosas ocurren atómicamente: actualización de `width`/`height` lógicos, incremento de dos contadores de generación, redimensionado de cada backing store y ensuciado del frame. Los contadores de generación son la clave — `contentFontEpoch` fuerza la recalibración de texto (el zoom del navegador cambia la geometría de Range incluso con la misma fuente CSS) y `contentViewportEpoch` re-nivela cada bloque de contenido sin mover ninguno (`Scene.ts:6415`, `Scene.ts:6420`). Un resize que solo cambiara `width`/`height` dejaría cada bloque con DOM construido para el viewport anterior.

Las dimensiones inválidas se rechazan, no se limitan (`Scene.ts:6382`): almacenar `-10` mientras el elemento canvas limita a `0` haría que el culling y la geometría a11y discrepen. La advertencia está latchada (`hasWarnedInvalidResize` en `Scene.ts:2113`) porque los llamantes impulsados por `ResizeObserver` harían spam en cada frame de arrastre.

### 1.2 Quién llama a resize()

Dos rutas, divididas por `disableWindowResize` (`Scene.ts:268`, `Scene.ts:2051`):

| Modo                                                         | Observer                                                                                       | Handler                                                     |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Ocupando ventana (`disableWindowResize: false`, por defecto) | listener `resize` de `window` (`Scene.ts:2968`) + media-query/watcher de DPR (`Scene.ts:3052`) | `resize(window.innerWidth, window.innerHeight)`             |
| Embebido (`disableWindowResize: true`)                       | `ResizeObserver` en `canvas` (`Scene.ts:3082`)                                                 | `resize(entry.contentRect.width, entry.contentRect.height)` |

Más la llamada explícita `scene.resize(w, h)` del llamante para contenedores personalizados — la única ruta cuando `ResizeObserver` no está disponible (guarda en `Scene.ts:2740`). El escalado DPR es ortogonal: `maxDPR` (`Scene.ts:287`) limita el multiplicador del backing store, así una pantalla DPR-3 renderiza a 2x en lugar de 3x (coste `tamaño lógico × dpr²`, `Scene.ts:276`).

### 1.3 El zoom es un resize

El zoom del navegador dispara `window.resize` y cambia `devicePixelRatio`. El watcher DPR de Scene (`Scene.ts:1435` `dprMediaQuery`, `Scene.ts:1441` `dprPollInterval`) re-invoca `resize(this.width, this.height)` — mismo tamaño lógico, nueva escala de backing store — y el `contentFontEpoch++` en esa ruta maneja la deriva de geometría de Range en escalas fraccionales de Firefox (comentario en `Scene.ts:6410`).

## 2. Contenedores de layout — de stack a dashboard

### 2.1 Stack — la primitiva

`Stack` en `packages/ui/src/Stack.ts:59` es el flexbox de VectoJS: secuencial en un eje, `align: 'start'|'center'|'end'` en el eje cruzado (`Stack.ts:17`), `gap` (`Stack.ts:14`), `wrap` opcional con `maxWidth`/`maxHeight` (`Stack.ts:19`) y `fillTarget` para layouts que rellenan el espacio restante (`Stack.ts:42`).

`layout()` en `Stack.ts:303` es un algoritmo de dos pases:

- **Pase 1 — agrupación** (`Stack.ts:325`): cuando `wrap` es true, recorre los hijos a lo largo del eje principal, cortando una nueva línea siempre que `currentMain + gap + childMain > limit`. En caso contrario una sola línea contiene todos los hijos.
- **Pase 1.5 — fill** (`Stack.ts:349`): cuando `fillTarget` está establecido y wrap está desactivado, estira el último hijo para que `hijos + gaps == fillTarget` — con suelo en el tamaño del contenido, nunca encogiendo.
- **Pase 2 — colocación** (`Stack.ts:371`): por cada línea computa `lineCross`/`lineMain`, luego asigna `x`/`y` con offsets de alineación en el eje cruzado (`Stack.ts:388`).

`Stack` es un contenedor puramente estructural — `render()` no dibuja nada (`Stack.ts:443`), solo sus hijos pintan. Su propio `width`/`height` se dimensiona al contenido dispuesto, permitiendo el culling. `getLayoutControlledProperties()` en `Stack.ts:163` retorna `['x','y']` — las escrituras en hijos revierten en el próximo layout.

Dos fast paths O(1) evitan el layout completo O(n) en append en streaming (`Stack.ts:167` `add()`, `Stack.ts:257` `appendFastWrap()`):

- `appendFast()` (`Stack.ts:231`) — sin wrap, `align: 'start'`: coloca el único hijo nuevo en `height + gap` (vertical) o `width + gap` (horizontal) y hace crecer el tamaño cruzado del contenedor. Los hijos anteriores no se ven afectados bajo alineación start.
- `appendFastWrap()` (`Stack.ts:257`) — wrap + `align: 'start'`: coloca en la línea actual o inicia una nueva, usando solo cuatro escalares de estado de última línea (`Stack.ts:95` `wrapLineMain/Cross/PriorCross/MaxMain`), sin volver a recorrer.

Ambos caen a `layout()` cuando `align !== 'start'`, `fillTarget` está establecido o `fastAppendDirty` (establecido por `remove()` en `Stack.ts:184`).

Para texto en streaming que crece sin `add()`/`remove()`, `resizeLastChild(child)` en `Stack.ts:210` maneja el crecimiento in-place del último hijo como `height = child.y + child.height` / `width = max(width, child.width)` — solo válido cuando el tamaño cruzado del hijo crece, no cuando encoge.

### 2.2 Flow — filas de chips gratis

`Flow` en `packages/ui/src/Flow.ts:19` es una línea:

```ts
export class Flow extends Stack {
  constructor(opts: FlowOptions = {}) {
    super({ ...opts, direction: opts.direction ?? 'horizontal', wrap: true });
  }
}
```

### 2.3 Card — el panel redondeado

`Card` en `packages/ui/src/Card.ts:49` es una caja redondeada de tamaño fijo (`Card.ts:123` `roundRect` + `fill`/`stroke`). Con `label` proyecta `role="group"` (`Card.ts:81`); con `onClick` se vuelve clicable — requiriendo `label` para que la proyección a11y siempre obtenga un nombre accesible (`Card.ts:71` lanza en caso contrario, origen en `vectojs-docs/forge/findings/ui-components.md:43`). `setContent(entity, fit?)` en `Card.ts:92` refleja `Panel.setContent` — por defecto el contenido sigue el `width`/`height` de la card vía `update()` (`Card.ts:118`).

### 2.4 PanelGroup — el lattice del dashboard

`PanelGroup` en `packages/ui/src/ResizablePanel.ts:213` divide el espacio disponible entre hijos `Panel` con divisores arrastrables `PanelResizeHandle`:

```text
PanelGroup { direction, width, height }
  ├── Panel { minSize, defaultSize, clipChildren: true }  — setContent(entity, fit?)
  ├── PanelResizeHandle { width: handleSize, interactive: true }  — delta de arrastre → _onResize
  ├── Panel
  └── ...
```

`addPanel()` en `ResizablePanel.ts:237` auto-inserta un handle antes de cada panel después del primero (`ResizablePanel.ts:239` `new PanelResizeHandle`). `resize(w, h)` en `ResizablePanel.ts:258` redistribuye tamaños proporcionalmente (`ResizablePanel.ts:267` `(size / basis) * avail`) luego normaliza (`ResizablePanel.ts:309` clamp a `minSize`/`avail`). `_layout()` en `ResizablePanel.ts:343` asigna `x/y/width/height` a paneles y handles alternadamente — los paneles de un grupo horizontal son `width = sizes[i], height = cross`; los handles son `width = handleSize, height = cross`.

`Panel.setContent()` en `ResizablePanel.ts:164` mantiene el contenido dimensionado a la caja del panel por defecto (`fit: true`, `ResizablePanel.ts:7` `FitContentOptions`), re-aplicado cada frame desde `Panel.update()` (`ResizablePanel.ts:190`) — necesario porque `Entity.width/height` son campos planos sin setter hook (nota de contrato en `ResizablePanel.ts:158`, origen en `vectojs-docs/forge/findings/ui-components.md:15` corregido en `@vectojs/ui@1.11.0`).

El anidamiento de `PanelGroup` compone: un `PanelGroup` como contenido de un `Panel` (`Panel.setContent(innerGroup)`) produce splits anidados — el `update()` del grupo interno lo mantiene dimensionado al panel externo, sin cableado extra.

## 3. VirtualList — windowing de 10k filas en ~15 entidades

### 3.1 La columna Fenwick

`RowHeights` en `packages/ui/src/VirtualList.ts:14` es un árbol Fenwick (binary-indexed) sobre alturas por fila (`VirtualList.ts:17` `Float64Array` de tamaño `n+1`):

- `total()` (`VirtualList.ts:46`) — O(1) suma de todas las alturas de fila.
- `prefix(i)` (`VirtualList.ts:60`) — O(log n) y del top de la fila `i`.
- `indexAt(y)` (`VirtualList.ts:71`) — O(log n) primera fila cuyo bottom excede `y`, vía binary lifting.
- `set(i, h)` (`VirtualList.ts:51`) — O(log n) actualización puntual con propagación de delta.

Cada fila comienza en `estimatedRowHeight` (`VirtualList.ts:28`); `set()` reemplaza la estimación cuando la fila se monta y se mide.

### 3.2 Reconciliación — solo la ventana visible

`VirtualList` en `VirtualList.ts:179` mantiene `this._pool: Map<number, Entity>` (`VirtualList.ts:203`) — una entidad por índice de fila montado, no por item de datos.

`_visibleRange()` en `VirtualList.ts:468` deriva `[start, end]` (inclusivo) desde `_scrollY` y `height` vía dos llamadas `indexAt`, expandido por `overscan` (por defecto 3, `VirtualList.ts:103`) en ambos extremos. `_reconcile()` en `VirtualList.ts:488`:

1. Recicla entidades fuera de rango (`VirtualList.ts:494` `super.remove` + `delete`).
2. Monta filas recién visibles (`VirtualList.ts:506` `renderItem(item, i)`, `super.add`).
3. Mide tras montar (`VirtualList.ts:515` `_measureMountedRows` antes de posicionar — leer `heightOf(i)` antes de colocar evita el stale-offset de un frame que precedió al PR #509).
4. Posiciona `y = rowTop(s) + ... - _scrollY` (`VirtualList.ts:518`).

`VirtualList.scrollToIndex(i)` / `scrollToTop/Bottom` / `jumpToBottom` en `VirtualList.ts:342` re-apuntan `_targetY`/`_scrollY`; `jumpToBottom` hace snap instantáneo (velocidad cero) para transcripciones en streaming donde re-apuntar un integrador en cada chunk nunca lo deja asentarse.

### 3.3 Crecimiento, identidad y anclaje

Sin `keyForItem`, `setItems()` en `VirtualList.ts:248` limpia la caché de alturas y salta al top — correcto para una lista reemplazada, incorrecto para una transcripción que crece. Con `keyForItem` (`VirtualList.ts:117`):

- `_heightByKey: Map<string, number>` (`VirtualList.ts:199`) sobrevive a `setItems` — las alturas medidas son propiedad de la fila, no de su índice (`VirtualList.ts:272` re-siembra desde caché tras reconstruir el árbol).
- `_rekeyPool()` en `VirtualList.ts:317` mueve entidades pooleadas a sus nuevos índices antes de cualquier lectura de altura — sin ello un prepend sobrescribe cada entrada con la altura incorrecta.
- Anclaje de scroll (`VirtualList.ts:397` `_captureAnchor` / `VirtualList.ts:431` `_restoreAnchor`): dos variantes — `bottom` (distancia al fondo, gap preservado) cuando `nearBottom` (`VirtualList.ts:219` latchado por scroll), `item` (clave de fila anclada + offset interno) en caso contrario. Un resize que cambia la altura de cada fila deja la fila anclada visualmente quieta.

`_measureMountedRows()` en `VirtualList.ts:540` sondea la `height` de cada fila montada cada frame, aplica el delta vía `Fenwick.set` y ancla — manejando filas que cambian de tamaño tras montarse (reflow de Markdown en streaming, asignación directa de `height`) sin ningún setter hook.

## 4. ScrollView — un viewport, un spring

`ScrollView` en `packages/ui/src/ScrollView.ts:58` es la contraparte no virtualizada: un viewport recortado (`ScrollView.ts:71` `clipChildren = true`) cuya entidad interna `content` se desliza en `y` vía el sistema compartido de springs (`ScrollView.ts:90` `content.setTransition({ y: scrollPhysics ?? 'spring' })`).

- **Rueda** (`ScrollView.ts:92`): conversión `deltaMode` (`ScrollView.ts:105` píxeles/líneas×16/páginas×viewport), `targetY -= delta`, clamp, `content.y = targetY` re-apunta el spring preservando velocidad. Ctrl+rueda abandona para dejar hacer zoom al navegador; contenido que cabe (`maxScroll <= 0`) abandona para evitar una franja muerta (`ScrollView.ts:95`, corrige #525).
- **Arrastre de puntero** (`ScrollView.ts:113`): tracking 1:1 del dedo vía deltas `localY`.
- **Clamping** (`ScrollView.ts:136`) vía `clampTarget()` mantiene `targetY ∈ [-maxScroll, 0]`. `update()` en `ScrollView.ts:219` re-clampe defensivamente y solo re-asigna `content.y` cuando el clamp realmente se movió — una re-asignación incondicional generaría un done-driver espurio para siempre, derrotando el throttle inactivo (`ScrollView.ts:217` comentario).
- **`scrollToBottom()`** (`ScrollView.ts:163`) hace snap vía `jumpTo()` (`ScrollView.ts:79` `setImmediate('y', y)`) en lugar de re-apuntar el spring — los llamantes que hacen streaming de chat lo llaman muchas veces por segundo, y un spring re-apuntado tan rápido nunca se asienta y hace jitter.
- **`DOCUMENT_SCROLL_PHYSICS`** en `ScrollView.ts:36` (`{ stiffness: 180, damping: 27 }`, ζ ≈ 1.006, origen en `vectojs-docs/forge/findings/ui-components.md:241`) es el preset críticamente amortiguado para scroll de documento; los defaults (`stiffness: 180, damping: 12`, ζ ≈ 0.447) hacen overshoot ~20% y rebotan — vivo en una lista, incorrecto en un documento.
- **Crecimiento de contenido** (`ScrollView.ts:233` `driveVirtualizableContent`): sondea las extensiones de hijos cada frame y re-sincroniza vía `updateContentSize()` cuando difieren — manejando crecimiento de `setSpans` en streaming sin `add()`/`remove()`. `ScrollVirtualizable.setVisibleRange` (`ScrollView.ts:50` duck-typed) se acciona el mismo frame para contenido windowed.

## 5. Primitivas de interacción

### 5.1 Handles de ResizablePanel — deltas en espacio de escena

`PanelResizeHandle` en `packages/ui/src/ResizablePanel.ts:42` mide deltas de arrastre en **espacio de escena** (`ResizablePanel.ts:86` `posOf` prefiere `sceneX`/`sceneY` sobre `localX`/`localY`). El handle se mueve con el panel que redimensiona, así las coords locales apenas cambian mientras el panel crece y el handle se desliza bajo el cursor — las coords de escena son estables, así 1px de recorrido = 1px de resize (comentario en `ResizablePanel.ts:78`, origen en `vectojs-docs/forge/findings/ui-components.md:64` corregido en `@vectojs/ui@1.1.3`). `hover` intercambia `color` → `hoverColor`; el handle es `interactive: true` con cableado `pointerdown`/`pointermove`/`pointerup`/`pointerleave` (`ResizablePanel.ts:92`).

### 5.2 Overlay — contenido flotante por encima del árbol

`Overlay` en `packages/ui/src/Overlay.ts:37` es la base para `Tooltip`, `Popover`, `ContextMenu`:

- Se monta en `scene.overlayRoot` (`Overlay.ts:168` `scene.overlayRoot.add(this)`) — por encima de `clipChildren`, siempre arriba.
- Colocación (`Overlay.ts:14` `OverlayPlacement`: `top|bottom|left|right|auto` más variantes `-start/-end`) computada en `_position()` en `Overlay.ts:171` desde `target.getWorldBounds()` + `placement` + `offset` (por defecto 6, `Overlay.ts:23`), luego clamp vía `_placeAt()` en `Overlay.ts:227` a margen de viewport de `4px`. `auto` hace flip según espacio disponible abajo vs arriba (`Overlay.ts:180`).
- `showAtPoint(x, y, source?)` en `Overlay.ts:98` acepta un `source` opcional (Scene o Entity montada) para resolver `scene` cuando el overlay en sí nunca ha sido montado — de lo contrario hace no-op silencioso en la primera llamada (origen en `vectojs-docs/forge/findings/ui-components.md:114` corregido en `@vectojs/ui@1.10.0`).
- Entrada vía `setTransition` en `opacity/scaleX/scaleY` (`Overlay.ts:59` `easeOutQuad` + spring) y toggling `a11yHidden`/`interactive` que oculta el subárbol tanto del hit-testing de puntero como de la proyección a11y (`Overlay.ts:149` `hide()` también llama a `detachA11y`).
- `Modal` en `packages/ui/src/Modal.ts:25` construye sobre esto: un backdrop de viewport completo (`Modal.ts:40` `width = window.innerWidth`, `Modal.ts:39` `a11yFullViewport = true`) con una `Card` centrada que entra con spring vía `card.scaleX/scaleY` (`Modal.ts:84` semilla 0, `Modal.ts:266` `springTo({scaleX:1,scaleY:1})`), focus-trap y manejo de Escape (`Modal.ts:188` `installFocusTrap`), y `close()` en `Modal.ts:282` que anima la salida antes de `scene.hideOverlay(this)` y restauración de foco.

### 5.3 Hover / focus — el bucle de feedback del canvas

Un canvas no tiene `:hover` ni `:focus-visible`. VectoJS los acciona desde eventos de proyección a11y que Scene re-despacha al VMT:

- **Hover** — `Button` en `packages/ui/src/Button.ts:97` `on('hover')` / `on('pointerleave')` alterna `hovered` → repinta con `hoverBg` (`Button.ts:11` opción), controlado por `disabled` para que un affordance deshabilitado nunca parezca activo. `PanelResizeHandle` hace lo mismo en `ResizablePanel.ts:111` para `hoverColor`.
- **Anillo de foco** — `Button.focused` en `packages/ui/src/Button.ts:61` traza un anillo `focusColor` de 2px (`Button.ts:30` por defecto `#00f0ff`). El flag se acciona desde `focus`/`blur` reales del DOM en el `<button>` shadow que Scene emite cuando el elemento a11y recibe foco — sin esto el anillo del canvas nunca aparece para usuarios de teclado.
- **Parpadeo del caret** — `UIComponent.startCaretBlinkWake()` en `packages/ui/src/UIComponent.ts:84` programa un wake-up de 500 ms (`markDirty` en el próximo límite de fase) para que una escena `onDemand` inactiva aún parpadee el caret en `Input`/`TextArea` — un timeout por fase cuesta ~2 renders/s mientras está enfocado (comentario en `UIComponent.ts:76`), vs anclar la escena a tasa completa.
- **Focus trap** — `Modal` (`Modal.ts:188`) y `Overlay` hide/show mantienen `a11yHidden` e `interactive` al unísono para que el botón de un popover oculto no permanezca alcanzable con Tab (origen en `vectojs-docs/forge/findings/ui-components.md:391` corregido en batch P2 2026-08-13).

La regla general: cada estado visual que un navegador derivaría de pseudo-clases CSS debe accionarse explícitamente desde los eventos DOM vivos de la proyección a11y, y cada hide debe eliminar tanto lo visual como la proyección.

## 6. Patrones responsivos sin motor CSS

### 6.1 La cascada de resize para un app shell

```ts
// Un único handler posee toda la cascada responsiva:
window.addEventListener('resize', () => {
  const w = window.innerWidth,
    h = window.innerHeight;
  scene.resize(w, h);
  header.width = w;
  header.layout();
  sidebar.height = h - header.height;
  sidebar.layout();
  contentGroup.resize(w - sidebar.width, h - header.height);
});
```

Cada `resize()` incrementa los dos contadores de generación, cada backing store reescala, `Stack`/`Flow` re-agrupan en el próximo `layout()`, `PanelGroup.resize()` redistribuye y `VirtualList` limita `_targetY` (`VirtualList.ts:566` `_clamp`). Sin motor de media queries — la app decide el breakpoint y llama a la API.

### 6.2 Dashboards de paneles — splits anidados

El anidamiento de `PanelGroup` (doc en `ResizablePanel.ts:206`) es el shell idiomático de IDE/editor:

```ts
const outer = new PanelGroup({ direction: 'horizontal', width: W, height: H });
const sidebar = new Panel({ minSize: 160, defaultSize: 0.2 });
const editorGroup = new Panel({ minSize: 300 }); // aloja split vertical interno

const inner = new PanelGroup({ direction: 'vertical', width: 0, height: 0 });
inner.addPanel(new Panel({ defaultSize: 0.6 })); // editor
inner.addPanel(new Panel({ minSize: 120 })); // terminal
editorGroup.setContent(inner); // ← Panel.setContent mantiene inner dimensionado

outer.addPanel(sidebar).addPanel(editorGroup);
scene.add(outer);
// En resize de ventana: outer.resize(newW, newH) — inner sigue vía Panel.update().
```

El escalado proporcional de `PanelGroup.resize()` (`ResizablePanel.ts:265`) maneja el grupo externo; el grupo interno se re-dispone vía el fit sync de `Panel.update()`, sin necesidad de llamada explícita a `resize()` interno.

### 6.3 ScrollView vs VirtualList — cuándo hacer windowing

| Necesidad                                           | Usa                                                              | Por qué                                                                                                        |
| --------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Documento / transcripción de chat, altura ilimitada | `ScrollView` + `Stack`                                           | Simple, animado con spring, el sondeo de crecimiento de contenido maneja streaming                             |
| Lista larga con 100+ filas uniformes                | `VirtualList`                                                    | Solo ~15 entidades montadas, matemática de scroll Fenwick O(log n), alturas sobreviven a `setItems` con claves |
| Lista larga con alturas de fila variables           | `VirtualList` + `estimatedRowHeight`                             | Estimaciones en primer montaje, alturas medidas las reemplazan y anclan el viewport                            |
| Chat con crecimiento anclado abajo en streaming     | `VirtualList` + `jumpToBottom()` o `ScrollView.scrollToBottom()` | Snapping, no re-apuntado de spring, mantiene quieto el viewport                                                |

### 6.4 Visibilidad de scrollbar — `clip-overflow` vs scrollbar real

VectoJS no tiene widget nativo de scrollbar — `ScrollView` y `VirtualList` recortan y manejan wheel/drag por sí mismos, y la sombra a11y preserva el orden de lectura. Una scrollbar visual (auditoría DevTools `clip-overflow` en `packages/devtools/src/audit.ts:51`, exenta para `ScrollView`/`VirtualList`/`Tree`/`Table`) es un `Rect` decorativo cuyo thumb `y` sigue `scrollY / maxScroll` — no un target interactivo separado.

## 7. Partes difíciles — con recibos

| Trampa                                                                           | Dónde                                                       | Estado                                                                                |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| El contenedor nunca dimensiona su contenido (cadena `Tabs`/`Panel`/`PanelGroup`) | `ResizablePanel.ts:164`, `Card.ts:92`, forge 2026-07-10     | Corregido `@vectojs/ui@1.11.0` — `setContent(entity, fit?)` con sync de fit por frame |
| Clic en card completa necesitaba Button overlay invisible                        | `Card.ts:35`, forge 2026-07-10                              | Corregido `@vectojs/ui@1.11.0` — `Card({ onClick, label })`                           |
| Arrastre de panel usaba deltas en espacio local (cursor rezagado)                | `ResizablePanel.ts:78`, forge 2026-07-10                    | Corregido `@vectojs/ui@1.1.3` — `sceneX`/`sceneY` en espacio de escena                |
| Tabs colapsaban a láminas pasado ~10 tabs                                        | forge 2026-07-10                                            | Corregido `@vectojs/ui@1.1.3` — `tabWidth` fijo + scroll con overflow                 |
| Tabs stretch × visualmente junto a la etiqueta del tab SIGUIENTE                 | `Tabs._tabW()`, forge 2026-07-16                            | Corregido `@vectojs/ui@1.9.4` — `tabWidth` es máximo, excedente vacío                 |
| Overlay.showAtPoint hace no-op silencioso antes del primer montaje               | `Overlay.ts:98`, forge 2026-07-17                           | Corregido `@vectojs/ui@1.10.0` — arg `source` para resolución de escena               |
| Stack.add() es O(n²) en streaming                                                | `Stack.ts:167`, `Flow.ts:19`, forge 2026-07-19              | Corregido `@vectojs/ui@1.11.4` — `appendFast`/`appendFastWrap`                        |
| Spring por defecto de ScrollView es subamortiguado (5 reversiones, 801 ms)       | `ScrollView.ts:14`, forge 2026-08-02                        | Corregido `@vectojs/ui` #322 — `scrollPhysics` + `DOCUMENT_SCROLL_PHYSICS`            |
| VirtualList setItems sin claves dejaba filas obsoletas en pantalla               | `VirtualList.ts:248`, forge 2026-08-02/08                   | Corregido `@vectojs/ui@2.15.1`                                                        |
| Widgets de scroll ignoran deltaMode (ruedas de línea/página scrollean 1-3 px)    | `ScrollView.ts:105`, `VirtualList.ts:583`, forge 2026-08-08 | Corregido `@vectojs/ui@2.15.2`                                                        |
| Corrección de deltaMode eliminó markDirty de VirtualList (congeló onDemand)      | `VirtualList.ts:596`, forge 2026-08-08                      | Corregido `@vectojs/ui@2.15.3`                                                        |
| Popover + Overlay con fuga a11y/puntero mientras está oculto                     | `Overlay.ts:48`, forge 2026-08-13                           | Corregido vectojs#474, mergeado vectojs#509                                           |
| Table virtualizada no re-sincroniza celdas string en layout()                    | `Table.ts:354`, forge 2026-08-13                            | Corregido vectojs#494, mergeado vectojs#520                                           |
| Hotspots de Tabs/RadioGroup desincronizados al reasignar array                   | `Tabs.ts:229`, forge 2026-08-13                             | Corregido vectojs#494, mergeado vectojs#520                                           |
| VirtualList sin claves setItems deja _velY obsoleto (overshoot transitorio)      | `VirtualList.ts:290`, forge 2026-08-13                      | Corregido vectojs#494, mergeado vectojs#520                                           |

## 8. Checklist — antes de aterrizar un cambio de layout responsivo

1. **Llama a scene.resize() cuando cambia el viewport lógico.** `width`/`height` lógicos son campos planos (`Scene.ts:2049`) — nada los observa hasta que `resize()` incrementa los dos contadores de generación y reescala backing stores. Comprueba tanto `disableWindowResize: false` (ruta de ventana) como `true` (ruta ResizeObserver). Protege con la comprobación `Number.isFinite && >= 0` (`Scene.ts:6395`).
2. **Mantén simétrico el dimensionado de contenedores.** Cada contenedor que posee `width`/`height` de hijos debe re-aplicar vía `update()` (el patrón `Panel`/`Card` en `ResizablePanel.ts:190` / `Card.ts:118`) porque `Entity.width/height` son campos planos sin setter hook. Busca `children.push` directos fuera de `Entity.ts:1065 add()` — omite `markStructureChanged` y `markDirty` por completo.
3. **Los fast paths de Stack deben permanecer bajo el invariante.** `appendFast` sin wrap asume `align: 'start'` y sin `fillTarget`; `appendFastWrap` con wrap restaura cuatro escalares de estado de última línea (`Stack.ts:95`) y recomputa desde líneas tras un `layout()` completo (`Stack.ts:422`). Un nuevo flag que permita que un hijo posterior afecte posiciones anteriores debe invalidar `fastAppendDirty`.
4. **La propiedad de Overlay es overlayRoot, no parent.** `Overlay.showAt` (`Overlay.ts:70`) re-parenta a `scene.overlayRoot` — siempre pasa `source` desde el llamante de `showAtPoint` (`Overlay.ts:98` tercer arg) para que un overlay nunca montado resuelva `scene` en la primera muestra.
5. **Los integradores de scroll no deben re-armar el throttle inactivo.** `ScrollView.update()` (`ScrollView.ts:219`) solo re-asigna `content.y` cuando el clamping movió `targetY`; `VirtualList` hace `markDirty()` solo cuando el estado de scroll cambia (`VirtualList.ts:596`). Ensuciar incondicionalmente por frame mantiene una escena `onDemand` a tasa completa para siempre.
6. **deltaMode — escala antes de clampear.** Línea→×16, página→×viewport antes de `clampTarget()`/`_clamp()` (`ScrollView.ts:105`, `VirtualList.ts:583`). Chrome/jsdom siempre entregan `deltaMode: 0`, así el bug es invisible allí.
7. **VirtualList: reconstruye alturas desde claves, no índices.** Tras `setItems` con `keyForItem`, el árbol Fenwick re-siembra desde `_heightByKey` (`VirtualList.ts:272`) y `_rekeyPool()` (`VirtualList.ts:317`) mueve entidades pooleadas antes de cualquier lectura de altura — reutilización direccionada por índice sin rekey escribe cada altura en el slot de caché incorrecto.
8. **El arrastre de Panel debe permanecer en espacio de escena y no terminar en pointerleave.** `PanelResizeHandle` (`ResizablePanel.ts:86`) lee `sceneX`/`sceneY` cuando está disponible, y ya no termina el arrastre en `pointerleave` — el nodo shadow mantiene captura.

---

_Serie: 00 Overview → 01 Selection → 02 Text+Layout → 03 Proyección Semántica → 04 Markdown en Streaming → 05 TeX → 06 Runtime VMT → 07 Renderer → 08 WASM → 09 Three/XR → 10 Exportación de Vídeo → 11 Layout de Grafos → 12 DevTools → **14 Layout Responsivo** → 99 Synthesis._
