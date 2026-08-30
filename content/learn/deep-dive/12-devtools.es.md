---
title: '12 — DevTools — Inspección en Runtime y Auditoría'
description: 'Por qué un canvas no tiene panel Elements, cómo el inspector del VMT lo reemplaza en el espacio de estado, y la capa de modelo headless — picking, lecturas de geometría, auditorías, snapshots, explicación de hit, atribución de frames dirty y el protocolo de puente/plugins.'
order: 32
---

# 12 — DevTools — Inspección en Runtime y Auditoría

> Un `<canvas>` no tiene panel Elements. El navegador puede mostrarte píxeles y espejos DOM, pero no el Virtual Math Tree que decidió qué píxeles pintar y qué espejos conservar. DevTools es ese panel — un inspector en espacio de estado para que depurar una escena VectoJS siga siendo números, no capturas.

- **Qué aprenderás**: por qué VectoJS necesita su propio inspector, cómo el panel se mantiene fuera del camino de la escena inspeccionada, y cada función pura en la capa de modelo headless — modelo de árbol, picking, lecturas de entidad/a11y/texto, siete capas de geometría, auditorías de layout/a11y/texto/selección/GPU/acelerador, snapshots/diffs, explicación de hit, traza de eventos, diagnóstico de frames dirty y el puente JSON-RPC con su protocolo de plugins.
- **Qué no aprenderás**: cómo `Scene` planifica frames (boss 06), cómo un renderer los pinta (boss 07) ni cómo WASM los acelera (boss 08). Este documento es la herramienta que _lee_ esos subsistemas sin mutarlos.

## 1. Por qué números antes que capturas

Una captura responde "algo está mal". Un número responde _qué entidad_ está mal, _por cuántos píxeles_ y _por qué el motor creyó que estaba bien_. Todo el paquete DevTools (`packages/devtools/src/`) se organiza alrededor de esa escalera:

1. **Localizar** — qué entidad posee un píxel (`pickInScene`) y dónde se sienta en el árbol (`buildTreeModel`, `entityPath`).
2. **Medir** — su geometría, transformación y límites mundiales en unidades de mundo (`inspectEntity`) y cada caja que porta que puede divergir (`highlightGeometry`).
3. **Explicar** — por qué el motor eligió esa entidad y no la que esperabas (`explainHitTest`), y dónde llegó realmente el evento del navegador (`createEventTrace`).
4. **Auditar** — si alguna entidad viola un invariante estructural aunque a simple vista parezca correcta (`auditScene`, `auditA11y`, `auditTextShaping`).
5. **Diferenciar** — qué cambió entre dos estados, direccionado por rutas estables en lugar de ids aleatorios (`captureSnapshot` / `diffSnapshots`).
6. **Atribuir** — por qué una escena `onDemand` nunca queda inactiva y qué cuesta realmente el bucle de render (`diagnoseDirty`, `Scene.frameStats` en `packages/core/src/tree/Scene.ts:3515`).

Cada peldaño retorna datos planos, no píxeles. Eso hace que cada comprobación sea un gate de CI: `expect(auditScene(scene)).toEqual([])` (`vectojs-docs/content/reference/devtools-audit.md:12`).

## 2. Dos superficies, una capa de modelo

| Superficie                                  | Entrada                                                                           | Renderiza                                                                                                               | Necesita `destroy()`                                                                                                | Se envía a producción                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Panel** (`@vectojs/devtools`)             | `attachDevtools(scene)` → `DevtoolsPanel` en `packages/devtools/src/panel.ts:140` | Su propia `Scene` acoplada al borde del viewport, `contentProjection: false`, `renderMode: 'onDemand'` (`panel.ts:299`) | Sí — `destroy()` desmonta timers, listeners, resaltado, escena del panel y contenedor (`panel.ts:1272`)             | Nunca — guarda `if (import.meta.env.DEV)` (`vectojs-docs/content/reference/devtools.md:51`) |
| **Headless** (`@vectojs/devtools/headless`) | Funciones puras re-exportadas desde `packages/devtools/src/headless.ts:1`         | Nada                                                                                                                    | Solo `EventTrace` adjunta listeners de document (`packages/devtools/src/eventTrace.ts:85`) y debe hacer `destroy()` | Sí — sin panel, sin dep `@vectojs/ui`, usable en Vitest/Node/agentes                        |

El panel _llama_ a la capa headless; no la duplica. La capa headless porta ~60 funciones puras exportadas — la mitad más grande y útil (`vectojs-docs/content/reference/devtools.md:18`).

```ts
import { attachDevtools } from '@vectojs/devtools';
import { auditScene, captureSnapshot, explainHitTest } from '@vectojs/devtools/headless';

if (import.meta.env.DEV) {
  const devtools = attachDevtools(scene, { traceEvents: true });
  // devtools.detach() === devtools.destroy()
}
```

`DevtoolsOptions` en `packages/devtools/src/panel.ts:42` — `width` por defecto 360, `refreshInterval` por defecto 500, `dockSide` `right|left`, `showPerf` por defecto true, `traceEvents`/`traceCapacity`, `defaultTab`. El subpath headless existe para que un bundle de tests en producción pueda importar la capa de modelo sin el panel ni `@vectojs/ui` (`vectojs-docs/content/reference/devtools.md:58`).

## 2a. Qué muestra el panel — y qué deliberadamente no muestra

El encabezado del dock en `packages/devtools/src/panel.ts:306` porta tres botones fantasma — **⌖** pick (`panel.ts:340`), **⟳** refresh (`panel.ts:341`), **⚠** audit (`panel.ts:342`) — y tres `Pill`s de conteo (`panel.ts:104`): total de entidades, interactivas **⚡** y hallazgos de auditoría **⚠** (`panel.ts:345`). Una barra `Tabs` en `panel.ts:537` divide las herramientas en **Tree · Info · Audit · A11y · Log · ⚙**, más una pestaña por cada `PluginInspector` registrado (`panel.ts:530`, `panel.ts:1027`).

- **Tree** — `TreeView` en `panel.ts:383` con un `Input` de filtro en `panel.ts:371`. `setFilter(text)` en `panel.ts:761` poda vía `applyFilterToTree` (`panel.ts:767`) que hace shallow-copy `{...node}` para que los originales conserven listas completas de hijos; las etiquetas filtradas aún se reescriben en el fast path estable por versión. Las filas muestran `type (x,y) W×H ⚡ ▶`.
- **Info** — `INSPECT_ROWS = 20` líneas `Text` (`panel.ts:71`) mostrando seis líneas genéricas desde `describeEntity` más salida del descriptor, editores inline `x/y/opacity` (`panel.ts:418`) y botones **Copy path / Copy JSON** (`panel.ts:442`) respaldados por `entityPath` (`inspect.ts:82`) y JSON de `inspectEntity`. Las flechas mueven 1 px (Shift: 10 px) y `+/-` ajustan opacity en 0.1 (`panel.ts:228`) — confirmando qué entidad posee un bug de layout antes de tocar código.
- **Audit** — `TreeView` en `panel.ts:469` listando una fila por hallazgo (`panel.ts:844`), `selectFinding(i)` en `panel.ts:860` resolviendo vía `auditRows` fusionado (scene + plugin en `panel.ts:840`) no solo `findings[i]`.
- **A11y** — `A11Y_ROWS = 22` líneas (`panel.ts:73`) desde `writeA11y` en `panel.ts:1173`: lectura `inspectA11y` (`a11yInspect.ts:227`) más hallazgos `auditA11y` cacheados con `▸` en la entidad seleccionada.
- **Log** — entradas `EventTrace` acotadas (`panel.ts:511`) cuando `traceEvents: true` (`panel.ts:47`), `traceCapacity` por defecto 50 (`panel.ts:49`). Actualizado vía `eventTrace.subscribe` → `writeTrace` (`panel.ts:521`) → `panelScene.markDirty()`.
- **Settings (⚙)** — `buildSettings` en `panel.ts:654`: `Toggle` para resaltado, `Dropdown`s para `refreshInterval` y `dockSide`. `setRefreshInterval` en `panel.ts:1070` controla ambos timers; `setDockSide` en `panel.ts:1088` intercambia estilos vía `applyDockSideStyle` (`panel.ts:635`).
- **Perf strip** — `Card` inferior anclado (`panel.ts:557`) reflotado por `layout()` (`panel.ts:608`), leyendo `Scene.frameStats` cada 250 ms (`panel.ts:571`).
- **Resaltado de selección** — `HighlightEntity` en el overlay del host (`panel.ts:874`), por defecto `['aabb']` (`panel.ts:172`), conmutable vía `setHighlightLayers` (`panel.ts:926`).

El contenedor del dock y el canvas son `pointer-events: none` (`panel.ts:288`), igual que `Scene.a11yRoot` — así los píxeles vacíos del dock nunca roban input del host.

## 3. Modelo de árbol y picking — el mismo recorrido que usa el motor

### 3.1 El modelo de árbol

`buildTreeModel(root)` en `packages/devtools/src/model.ts:31` retorna `{ nodes, index }`:

- `nodes` — una entrada por cada hijo directo de `root`, cada una con su propio subárbol. Una hoja tiene `children: undefined`, no `[]` (`model.ts:40`).
- `index: Map<string, Entity>` — cada descendiente a toda profundidad, indexado por `entity.id`, para que un id seleccionado vuelva a la entidad viva.
- `label` — `` `${type} (${x},${y}) ${W}×${H} ⚡ ▶` `` generado por `geometryLabel` (`model.ts:16`), con badges solo cuando `interactive` / `hasPendingAnimations()`.

`refreshTreeLabels(nodes, index)` en `model.ts:56` reescribe esos badges de geometría in place — sin churn de nodos ni índices — retornando `true` cuando al menos una etiqueta cambió para que el panel pueda omitir trabajo de redibujado. El reconcile forzado cada `RECONCILE_INTERVAL_MS = 3000` (`panel.ts:80`) acota la obsolescencia cuando algo mutó `children` sin incrementar `structureVersion` (`panel.ts:581`, `vectojs-docs/forge/findings/devtools-and-telemetry.md:356`).

### 3.2 Picking

`findEntityAt(root, x, y)` en `model.ts:82` y `pickInScene(scene, x, y)` en `model.ts:214` son deliberadamente **el mismo recorrido y el mismo predicado de aceptación** que `HitTester.findHitRecursively` (`packages/core/src/tree/scene/HitTester.ts:227`), verificado tras `vectojs#483`:

- `opacity <= 0` con early-return poda el subárbol (`model.ts:86`).
- `insideClipAncestors` (`model.ts:115`) comprueba cada ancestro `clipChildren` vía `worldToLocal` en su caja mundial — así el contenido scrolleado fuera no es pickeable.
- `isPointerTransparent` (`model.ts:105`) refleja `HitTester.isPointerTransparent` — `disabled === true` o `pointerEvents: 'none'` excluye del hit pero los hijos aún se recorren.
- Solo `isPointInside(x,y)` decide (`model.ts:95`) — sin fallback a world-AABB, así partículas y formas decorativas nunca son falsos propietarios (`model.ts:77`, corregido `vectojs#483`, `forge 2026-08-13`).

`pickInScene` comprueba primero el árbol del overlay, luego el árbol principal (`model.ts:215`), así un modal abierto gana sobre el contenido detrás — la sorpresa más común de "mi clic no llegó a ningún lado". `findEntityAt` también testea la raíz que le pasas, así pasarle `scene.rootEntity` puede retornar esa raíz; `pickInScene` es el default más seguro (`vectojs-docs/content/reference/devtools-inspect.md:46`).

## 4. Lectura de selección — geometría, descriptores y propiedades poseídas

### 4.1 Dos lecturas para una entidad

- `describeEntity(entity)` en `model.ts:153` — `string[]` para el panel: seis líneas fijas (type/id, `x/y/w/h` con `*` en props poseídas por layout, scale/rotation/opacity, `world [a b c d e f]`, interactive/animating, conteo de hijos), más una línea `* prop establecida por Parent — las ediciones revierten` cuando `layoutControlledProperties` no está vacío (`model.ts:172`), luego el `getDevtoolsDescriptor()` propio de la entidad limitado a `DESCRIPTOR_LINE_BUDGET = 12` líneas (`model.ts:151`). Los valores de campo truncan a 32 caracteres, las notas a 60 (`model.ts:143`). Un descriptor que lanza contribuye `— descriptor threw —` en lugar de abortar el panel (`model.ts:184`).

- `inspectEntity(entity)` en `packages/devtools/src/inspect.ts:99` — `EntityInfo` (`inspect.ts:4`) para máquinas: cada número redondeado a 2 decimales (`inspect.ts:48`), `worldTransform`, `worldBounds`, `interactive/animating/clipChildren/childCount`, `text` opcional (vía `textPreviewOf` en `inspect.ts:70`, `TEXT_PREVIEW_MAX = 80`), `a11y { tag, role, label }` opcional, `descriptor` opcional, `layoutControlled` opcional (`inspect.ts:42`). Ambos manejan un `getDevtoolsDescriptor()` que lanza sin crashear la herramienta — una herramienta de depuración que se rompe en la entidad que estás depurando es peor que una que omite un campo (`inspect.ts:136`).

`entityPath(entity)` en `inspect.ts:82` renderiza `Scene > Card#a1b2 > Text#c3d4` con ids truncados a 8 caracteres; la cima del árbol (sin padre) se muestra como `Scene` — así una entidad desprendida es indistinguible de la raíz real, lo que vale la pena comprobar cuando una ruta parece sospechosamente corta.

### 4.2 Propiedades poseídas por el layout

`layoutControlledProperties(entity)` en `inspect.ts:157` pregunta al **padre** `getLayoutControlledProperties(child)` — solo un contenedor sabe qué props sobrescribe (`ScrollView` distingue su wrapper interno de hijos añadidos por el llamante). El panel marca esas props con `*` inline (`model.ts:161`) y, cuando el usuario edita una, explica inmediatamente que el valor revierte en el próximo layout (`panel.ts:1108`, `panel.ts:1153`) en lugar de rechazar silenciosamente la edición. Editar un hijo de Stack para ver qué se mueve es legítimo; ocultar por qué volvió a su sitio no lo es.

## 5. Geometría de resaltado — siete cajas, una clase de bug

`highlightGeometry(scene, entity, opts?)` en `packages/devtools/src/highlightGeometry.ts:1` retorna hasta siete valores `HighlightLayer`, siempre en orden fijo sin importar el orden solicitado:

| Tipo      | Significado                                            | Fuente                                                     |
| --------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| `aabb`    | Caja axis-aligned del quad de layout transformado      | `getWorldBounds()`                                         |
| `layout`  | Quad real con rotación/skew                            | world transform × `[0,0,w,h]`                              |
| `render`  | `getBounds()` — dónde pinta realmente la entidad       | `entity.getBounds()`                                       |
| `clip`    | Caja del ancestro `clipChildren` más cercano           | recorrido de ancestros                                     |
| `content` | Caja del espejo de contenido DOM seleccionable         | `rectToSceneBox` vía `getContentElement`                   |
| `a11y`    | Caja del elemento de proyección a11y                   | `getA11yElement` en `packages/core/src/tree/Scene.ts:6446` |
| `hit`     | Región real de hit muestreada probando `isPointInside` | `sampleHitRegion`                                          |

`divergesFromLayout` en cualquier capa significa que esa caja discrepa del quad de layout por más de 1 px — la condición que hace que un clic caiga donde el usuario no apuntó (`vectojs-docs/content/reference/devtools-inspect.md:222`). `highlightGeometry` nunca lanza; una capa no disponible retorna `{ kind, polygons: [], unavailable: reason }`.

`hit` no está en el set por defecto — muestrea `isPointInside` en una rejilla (`hitSampleStep` por defecto 8, `hitSampleBudget` por defecto 4096, `packages/devtools/src/highlightGeometry.ts:1`) y cuesta `O((w/step)·(h/step))` pruebas, así que reducir `step` a la mitad cuadruplica el coste. La divergencia para `hit` es por **cobertura de área**, no por extensión, así un círculo dentro de un cuadrado se registra (`vectojs-docs/content/reference/devtools-inspect.md:225`). El `HighlightEntity` del panel en `panel.ts:1337` dibuja estas capas en el overlay de la escena _host_ vía `showOverlay()` (`panel.ts:876`), coloreadas por `LAYER_COLORS` (`panel.ts:1325`), con `aabb` manteniendo el `ACCENT` original para que las capturas existentes sigan legibles.

## 6. Auditorías — hallazgos estructurados, ordenados, deterministas

Cada auditoría retorna `Finding[]` ordenados determinísticamente para que los snapshots sean estables.

### 6.1 Auditoría de layout

`auditScene(scene, opts?)` en `packages/devtools/src/audit.ts:321` delega a `auditTree(root, sceneBounds, opts)` en `audit.ts:130`. Cuatro valores `AuditKind` (`audit.ts:7`):

- `text-overflow` — la caja de texto medida escapa de su ancestro dimensionado más cercano que no es texto.
- `clip-overflow` — el contenido escapa de un ancestro `clipChildren` (vertical exento en `ScrollView`/`VirtualList`/`TreeView`/`Table` vía `DEFAULT_SCROLLABLE` en `audit.ts:51`).
- `overlap` — **solo hermanos**, vía recorrido con `SpatialHashGrid` como broad-phase (`audit.ts:190`) en lugar del antiguo doble bucle O(k²) — cada caja computada una vez, solo se comparan vecinos de celda de la rejilla. Requiere intersección que exceda `tolerance` en ambos ejes (`audit.ts:231`).
- `viewport-overflow` — sin ancestro dimensionado en absoluto, y la entidad escapa de `sceneBounds`.

Opciones: `tolerance` (por defecto 0.5), `includeOverlay` (por defecto false — modales/resaltados están intencionalmente fuera de flujo), `scrollableTypes` (coincidencia por `constructor.name`), `ignore` (poda subárboles), `ignoreOverlap` (permite apilamiento intencional). `opacity: 0` poda subárboles enteros; hallazgos ordenados por `kind → entityPath → otherPath` (`audit.ts:305`). Con `includeOverlay: true` el resultado son dos corridas ordenadas concatenadas — reordena si necesitas un orden global único (`vectojs-docs/content/reference/devtools-audit.md:85`).

`worldBox` en `audit.ts:70` usa la caja declarada `[0,0,w,h]` vía `getWorldTransform()`, no `getWorldBounds()` — para contención la caja declarada es el contrato; las extensiones de render pertenecen a `clip-overflow`.

### 6.2 Auditoría de a11y

`auditA11y(scene, opts?)` en `packages/devtools/src/a11yInspect.ts:299` emite cinco valores `A11yAuditKind` (`a11yInspect.ts:23`):

`no-accessible-name`, `role-tag-conflict`, `disabled-divergence` (con banda muerta en opacidad 0.6–0.9), `focusable-but-clipped`, `duplicate-label` (reportado contra el segundo en adelante, `otherId` apunta al primero). A diferencia de la auditoría de layout **incluye el overlay por defecto** — un modal es donde viven los focus traps — y `a11yHidden` poda todo el subárbol. Los resultados van en orden de recorrido, con `duplicate-label` añadido al final (`vectojs-docs/content/reference/devtools-audit.md:137`).

### 6.3 Auditoría de shaping de texto

`auditTextShaping(scene)` en `packages/devtools/src/textInspect.ts:447` recorre solo `scene.rootEntity` y emite un único tipo, `atlas-miss` — glifos no presentes en el atlas de fuente, muestreados a cinco faltantes distintos por hallazgo. Solo la ruta de texto **preparado** puede emitirlo; una entidad de rejilla de contenido nunca lo hará (`vectojs-docs/content/reference/devtools-audit.md:157`).

### 6.4 Auditoría de selección

`auditSceneSelection` / `auditEntitySelection` en `packages/devtools/src/selectionAudit.ts:1` comparan la geometría local de línea propia de la entidad contra rects vivos de `Range` del DOM, normalizados a píxeles lógicos locales para que DPR/zoom se factorice. Encuentra `selection-drift` por línea infractora con `expectedLeft/Right`, `actualLeft/Right`, `leftDrift/rightDrift`. Requiere un navegador real — referencia `document` sin guarda (`vectojs-docs/content/reference/devtools-audit.md:202`) — y limpia la selección actual del usuario mientras se ejecuta.

## 7. Snapshots y diffs — regresión sin capturas

`captureSnapshot(scene)` en `packages/devtools/src/snapshot.ts:133` captura un árbol determinista y JSON-safe: el orden de hijos es orden de render, números redondeados a 2 decimales (`snapshot.ts:52`), props con valor por defecto omitidas. `diffSnapshots(a, b)` en `snapshot.ts:302` retorna `SnapshotDiff[]` con `path / kind('added'|'removed'|'changed') / changes`.

Keying — por qué una fila renombrada no es 200 filas reescritas: `nodeKey(entity)` en `snapshot.ts:79` prefiere `devtoolsKey` (`k:`) luego label a11y (`l:`, limitado a `KEY_LABEL_MAX = 64` en `snapshot.ts:55`), nunca texto de dibujo (contenido, no identidad) y nunca id de entidad (aleatorio por ejecución). `keyedPairs` en `snapshot.ts:196` usa claves solo cuando son únicas en **ambos** lados de un nivel; en colisión cae a alineación por índice. Las rutas usan `Row{k:row-42}` cuando hay clave, `Row[7]` cuando no (`snapshot.ts:163`), así la propia ruta sobrevive a reordenamientos (`vectojs-docs/forge/findings/devtools-and-telemetry.md:317`, corregido `vectojs#481/#510`).

Solo `COMPARED_KEYS` en `snapshot.ts:142` se comparan (`type/x/y/width/height/worldBounds/opacity/interactive/animating/clipChildren/text`); `scene.width/height`, `id` y `key` no producen diffs, y `added`/`removed` no recursan.

## 8. Explicación de hit y traza de eventos

### 8.1 Explicar un hit test

`explainHitTest(scene, x, y)` en `packages/devtools/src/hitExplain.ts:139` recorre el mismo orden y aplica las mismas compuertas que `HitTester`, pero registra un `HitCandidate` por nodo en lugar de retornar en el primer hit — cada perdedor con su `HitVerdict` (`hitExplain.ts:20`): `accepted / invisible / clipped / pointer-transparent / outside-shape / occluded`. `invisible` (`opacity <= 0`) poda el subárbol y nombra cuántos descendientes se omitieron (`hitExplain.ts:154`). Overlay primero, luego principal (`hitExplain.ts:267`) — la sorpresa más común. `occluded` se asigna en un post-pase: una entidad por lo demás aceptada debajo del ganador se reescribe (`hitExplain.ts:278`), así "cuántas cosas hay bajo este píxel" es contable. `formatHitExplanation` en `hitExplain.ts:299` renderiza líneas indentadas con glifos `✓ / · / ✗` en `hitExplain.ts:306`.

Esto es un diagnóstico, no una llamada por frame — recorre todo el árbol. En una escena con hit-grid WASM un ancestro `clipChildren` de tamaño cero puede explicarse como `clipped` mientras la ruta WASM aún registra el hit: la única divergencia documentada (`vectojs-docs/content/reference/devtools-inspect.md:293`).

### 8.2 Traza de enrutamiento de eventos

`createEventTrace(scene, opts?)` en `packages/devtools/src/eventTrace.ts:275` observa inputs del navegador sin añadir listeners VMT ni cambiar el despacho. Siete valores `EventTraceType` (`eventTrace.ts:6`), cuatro valores `EventTraceSource` (`eventTrace.ts:16`: `a11y / content / canvas / document`), `EventTraceOptions.capacity` por defecto 50 (`eventTrace.ts:44`). Cada `EventTraceEntry` (`eventTrace.ts:26`) registra target id/path, coordenadas de escena+locales, modificadores, `deltaX/Y` para wheel y `defaultPrevented` final.

`defaultPrevented` finaliza en un **microtask** tras el enrutamiento VMT proyectado, así refleja la decisión final de atajo/selección de la app (`eventTrace.ts:95` `onEventBubbled`). Un test debe esperar un macrotask antes de hacer assert. `pointermove` se coalesce a uno por ~60 Hz frame (`POINTERMOVE_COALESCE_MS = 16` en `eventTrace.ts:77`) para evitar que picks O(n) sesguen el HUD de perf (`eventTrace.ts:69`, `vectojs#707`). Adjunta 14 listeners de document y es el único objeto headless que **debe** hacer `destroy()` (`eventTrace.ts:171`); `entries` retorna el array interno vivo, no una copia.

## 9. Lecturas de texto, GPU, acelerador y markdown

`inspectText(entity)` en `packages/devtools/src/textInspect.ts:179` retorna `TextInspection` (`textInspect.ts:15`) o `null` cuando no hay ni `.text` ni `.value`. En caso contrario porta niveles bidi resueltos, `levelRuns` y segmentos de reversión, `visualOrder`, `clusters` de grafemas re-segmentados vía `Intl.Segmenter` (`textInspect.ts:148`) y detalle por glifo en uno de tres niveles (`textInspect.ts:157`):

| Nivel                          | `glyphs[].x` | `metrics/lines` | `atlasMiss` |
| ------------------------------ | ------------ | --------------- | ----------- |
| Rejilla de contenido preparado | sí           | sí              | nunca       |
| Texto preparado                | no           | no              | sí          |
| Ninguno                        | sin glifos   | no              | no          |

`unavailable: string[]` (`textInspect.ts:74`) nombra cada capacidad que no pudo reportarse y por qué — un campo faltante siempre se explica, no se omite silenciosamente. `shapeProbe(text, opts?)` en `textInspect.ts:295` ejecuta una cadena arbitraria por el mismo pipeline sin entidad ni escena, así el shaping puede comprobarse en un unit test. `formatTextInspection` en `textInspect.ts:348` renderiza `PluginRow[]` para pestañas de panel/plugin.

`gpuInspector` / `inspectGpu(scene)` en `packages/devtools/src/gpuInspect.ts:1` y `acceleratorInspector` / `inspectAccelerators(scene)` en `packages/devtools/src/acceleratorInspect.ts:1` exponen la postura de backend GPU y WASM. `inspectGpu` reporta contadores de draw (`enableDrawCountersCommand` / `resetDrawCountersCommand` en `gpuInspect.ts:1`), overdraw y balance `save/restore`; `inspectAccelerators` reporta por backend `AcceleratorReport { status, reason }` en `packages/core/src/tree/scene/WasmBackendFacade.ts:66` — si el kernel WASM de hit/grid/anim aceptó sus argumentos o cayó a JS y por qué. Ambos son lecturas puras, así un gate de CI puede hacer assert `auditGpu(scene).length === 0` igual que el gate de layout.

`inspectMarkdownStream(entity)` en `packages/devtools/src/markdownInspect.ts:1` reporta reutilización en streaming (`auditMarkdownStreaming` / `markdownStreamAudit`) — cuántos tokens sobrevivieron a un reconcile por delta versus cuántas entidades se reconstruyeron — y `selectionAudit` / `highlightGeometry` ya se cubrieron arriba. Cada lectura sigue el mismo contrato: nunca lanza, retorna `{ unavailable: reason }` cuando la entidad carece de la capacidad y redondea números a 2 decimales.

## 10. Atribución de frames dirty y telemetría de frames en vivo

### 10.1 `diagnoseDirty` — por qué `onDemand` nunca duerme

`diagnoseDirty(scene, opts?)` en `packages/devtools/src/dirtyDiagnosis.ts:70` convierte `Scene.dirtyReasons` en un veredicto. `scene.setDirtyTracking(true)` (`packages/core/src/tree/Scene.ts:3474`) activa el opt-in; `scene.dirtyReasons: DirtyReasonEntry[]` (`Scene.ts:3489`, más frecuente primero, FIFO limitado a `MAX_DIRTY_REASONS = 200` en `packages/core/src/tree/scene/DirtyTracker.ts:71`) contiene `{ entity?, reason, property?, count, firstFrame, lastFrame }`. `diagnoseDirty` computa `perFrame = count / frames` (`dirtyDiagnosis.ts:97`) y separa `everyFrame: perFrame >= 0.9` (`dirtyDiagnosis.ts:105`) — estos son los que una escena `onDemand` debe dejar de hacer para realmente quedar inactiva. `summary` nombra la peor causa cuando `everyFrame` no está vacío, señala el caso irrelevante cuando `renderMode === 'always'` (`dirtyDiagnosis.ts:112`) y advierte cuando el tracking nunca se habilitó (`dirtyDiagnosis.ts:82`). Headless a propósito — usable desde Vitest/Playwright/CI sin panel y sin dep `@vectojs/ui`.

### 10.2 `Scene.frameStats` — frames renderizados, no vsync

`Scene.frameStats: FrameStats` en `packages/core/src/tree/Scene.ts:3515` (`FrameStats` en `Scene.ts:518`) lee la telemetría real del bucle:

`fps` (cadencia de frames renderizados suavizada con EMA, limitada a `maxFPS`, `0` antes del primer par), `frameTimeMs` (wall-clock del último `render()` solo), `frameIntervalMs`, `dt`, contadores `renderedFrames/skippedFrames`, `renderMode`, `dirty`. El perf strip del panel en `panel.ts:800` muestra `fps · ms/frame / entities · mode · rendered/skipped`, actualizado cada 250 ms (`panel.ts:571`). Una escena `onDemand` inactiva lee honestamente `0 fps`; una escena `'always'` auto-throttled lee su suelo `idleFPS` (60 por defecto) (`vectojs-docs/content/reference/devtools.md:72`). El renderer siempre repinta todo el canvas, así que no hay dirty-rect — `dirty` es el flag booleano de repintado pendiente (`vectojs-docs/forge/findings/devtools-and-telemetry.md:73`). La lección de `forge 2026-07-18`: nunca muestrees rAF independientemente — solo el `update()` de una entidad o `frameStats` mide frames que Scene realmente renderizó.

Otras superficies de Scene que lee la capa headless: `structureVersion` (`Scene.ts:3462`, `Scene.ts:1636`) para obsolescencia de forma de árbol, `getA11yTree()` (`Scene.ts:5412`) para el snapshot a11y público, `getA11yElement(id)` (`Scene.ts:6446`) y `getContentElement(id)` para comparación de cajas DOM-vs-canvas (`packages/devtools/src/a11yInspect.ts:143`), `getContentProjection()` por entidad y las lecturas de plugin de abajo.

## 10a. Puntos de integración con Scene — dónde DevTools lee el motor

La capa headless nunca accede a privados de Scene; lee la superficie pública que `packages/core/src/tree/Scene.ts` publica para cualquier consumidor, y que `packages/core/src/index.ts` re-exporta como API pública:

- `Scene.structureVersion: number` en `Scene.ts:3462` (respaldado por `WasmBackendFacade.structureVersion` en `Scene.ts:1636`) — incrementado por `Entity.add/remove` (`packages/core/src/tree/Entity.ts:1086` / `:1123`). Cada caché de forma de árbol es válida mientras este no cambie; los cambios de propiedades deliberadamente no lo incrementan, por eso existe `refreshTreeLabels`.
- `Scene.frameStats: FrameStats` en `Scene.ts:3515` / `FrameStats` en `Scene.ts:518` — la única fuente honesta de FPS, más `frameTimeMs`, `frameIntervalMs`, `dt`, `renderedFrames/skippedFrames`, `renderMode`, `dirty`. Actualizado en `Scene.loop` en `Scene.ts:5569` alrededor de la llamada `render()`; `step(dt)` en `Scene.ts:3420` los deja a cero.
- `Scene.dirtyReasons: DirtyReasonEntry[]` en `Scene.ts:3489` y `setDirtyTracking` en `Scene.ts:3474` / `DirtyTracker` en `packages/core/src/tree/scene/DirtyTracker.ts:70` — FIFO acotado (`MAX_DIRTY_REASONS = 200` en `DirtyTracker.ts:71`) indexado por `entity:reason.property` (`DirtyTracker.ts:120`).
- `Scene.getA11yTree(): A11yTreeNode[]` en `Scene.ts:5412` (`A11yTreeNode` en `Scene.ts:538`) y por entidad `getA11yElement(id)` en `Scene.ts:6446` / `getContentElement(id)` — los espejos DOM vivos cuyo `getBoundingClientRect()` se compara con `getWorldBounds()` en `highlightGeometry` e `inspectA11y`.
- `Scene.renderMode: 'always' | 'onDemand'` en `Scene.ts:1147`, `SceneOptions.renderMode` en `Scene.ts:408` y la delegación `DirtyTracker` en `Scene.ts:3443` — la política que `diagnoseDirty` atribuye.
- `Entity.getDevtoolsDescriptor(): DevtoolsDescriptor | null` en `packages/core/src/tree/Entity.ts:1937` y `getLayoutControlledProperties(entity)` en `packages/core/src/tree/Entity.ts:968` — los dos hooks suministrados por la app que evitan que DevTools necesite una tabla de tipos de componentes.

Las subclases que poseen recursos GPU/DOM sobrescriben `destroy()` antes de llamar a `super.destroy()` (`packages/core/src/tree/ComputeParticleEntity.ts:419`, `DOMPortalEntity.ts:142`), así un panel que mantiene un `Map<string, Entity>` indexado (`panel.ts:157`) nunca retiene una entidad ya destruida.

## 11. Protocolo de puente y plugins

### 11.1 El puente JSON-RPC

`createDevtoolsBackend(scene, transport, opts?)` en `packages/devtools/src/bridge.ts:131` y `createDevtoolsClient(transport, opts?)` en `bridge.ts:328` hablan un protocolo versionado (`DEVTOOLS_PROTOCOL_VERSION = 1` en `bridge.ts:33`, `DEVTOOLS_CHANNEL = 'vectojs-devtools'` en `bridge.ts:36`) sobre un `DevtoolsTransport` (`bridge.ts:97`) — una abstracción dúplex `send / subscribe`. `DevtoolsMethod` en `bridge.ts:39` enumera 20 métodos (`protocol.version`, `tree.get`, `entity.inspect/pick/highlightGeometry`, `scene.audit/a11yAudit/a11yOrder/snapshot/diff/frameStats`, `hit.explain`, `text.inspect`, `markdown.stream`, `gpu.inspect`, `plugin.list/rows/audit`, `command.list/run`). Cada handler está envuelto para que una escena malformada responda con `ok: false` en lugar de matar el backend (`bridge.ts:290`).

`tree.get` serializa hasta `maxTreeNodes = 5000` por defecto (`bridge.ts:118`) y reporta `truncated: true` en lugar de cortar silenciosamente (`bridge.ts:178`). Las respuestas se hacen round-trip vía `JSON.parse(JSON.stringify(result))` para que un handler que retorna una entidad viva falle en los propios tests del backend en lugar de como error `structuredClone` en una extensión (`bridge.ts:300`). `allowedOrigins` es **requerido** para cualquier transporte entre documentos — un backend que responde a cualquiera divulga contenido de la escena a cualquier frame que pueda hacerle `postMessage` (`bridge.ts:104`). Se proveen dos transportes: `createDirectTransportPair()` para tests/agentes (`bridge.ts:404`) y `createWindowTransport(target, targetOrigin)` para extensiones/frames padre que reenvía `event.origin` para la comprobación de allowlist (`bridge.ts:439`). `publishSelection` / `publishStructure` en `bridge.ts:459` / `bridge.ts:469` emiten notificaciones `DevtoolsEvent` iniciadas por el backend (`bridge.ts:81`).

Un backend sirve a cada frontend — el panel in-page, una extensión de navegador, Playwright y agentes — para que cuatro implementaciones de las mismas consultas no diverjan (`bridge.ts:21`).

### 11.2 Plugins

`registerDevtoolsPlugin(plugin)` en `packages/devtools/src/plugin.ts:1` añade una pestaña de inspector, auditorías y comandos que sobreviven a una sola selección. `PluginInspector` en `plugin.ts:1` es `{ id, label, appliesTo?, inspect(ctx): PluginRow[] }` — la misma forma `PluginRow { label, value, note? }` que usa el campo `getDevtoolsDescriptor()` propio de un componente, así reenviar un descriptor no necesita traducción. `PluginAudit` retorna `PluginFinding[]` que el panel añade como hallazgos ordinarios para que `selectFinding(i)` no necesite saber de dónde vino un hallazgo (`panel.ts:830`). El panel pre-asigna `PLUGIN_ROWS = 18` filas `Text` por pestaña de plugin (`panel.ts:94`) y reconstruye pestañas de plugin cuando un paquete se registra tarde vía `syncPluginTabs()` en `panel.ts:1027` — antes de la comprobación de versión, para que un plugin recién importado no espere al próximo cambio estructural.

## 12. Internos del panel que importan

- **Reflow posee su propio resize.** La escena del panel es `disableWindowResize: true` y debe llamar a `panelScene.resize(width, innerHeight)` en cada `window.resize` (`panel.ts:608` `layout()`), reposicionando la altura de pestañas, alturas de árbol/auditoría y la card de perf. Sin esto la strip inferior de perf cae por debajo del pliegue en cualquier viewport más corto — el bug que se envió al 100% de zoom (`vectojs-docs/forge/findings/devtools-and-telemetry.md:100`, corregido en `vectojs#132`).

- **Refresh con compuerta por versión y reconcile periódico.** `refresh()` en `panel.ts:709` omite el recorrido cuando `host.structureVersion === treeVersion` y `allNodes` no está vacío — así un intervalo de 60 Hz es barato — pero aún reescribe etiquetas (`refreshTreeLabels` tanto en `allNodes` como en `filteredNodes` en `panel.ts:733`) y reescribe lecturas de selección/plugin. Un reconcile forzado cada `RECONCILE_INTERVAL_MS` (`panel.ts:591`) acota cuánto puede permanecer obsoleta una mutación directa de `children` sin bump de versión.

- **Contrato `pointer-events: none` del dock.** El contenedor del dock y su canvas son `pointer-events: none`; solo los controles proyectados a a11y vuelven a `auto` (`panel.ts:288`), reflejando `Scene.a11yRoot` (`vectojs-docs/forge/findings/devtools-and-telemetry.md:29`, corregido `@vectojs/devtools@0.4.3`). El handler de pick comprueba `container.contains(ev.target)` antes de consumir un clic (`panel.ts:219`), así armar el modo pick no se traga los propios botones del panel (`vectojs#482`, `forge 2026-08-13`).

- **Auditoría a11y cacheada, no re-recorrida por tick.** `writeA11y` corre cada tick (es la lectura de la selección), pero el recorrido completo `auditA11y` se cachea en `structureVersion` con TTL de obsolescencia `A11Y_AUDIT_TTL_MS = 3000` (`panel.ts:85`, `panel.ts:1246`) — los inputs de auditoría incluyen labels/disabled/opacity/tabIndex/bounds sin contador de versión, así una clave solo por versión quedaba obsoleta indefinidamente (`vectojs#496`, `forge 2026-08-13`).

- **Etiquetas seguras con filtro y seguridad de plugins.** Con un filtro activo el `Tree` renderiza copias podadas; las etiquetas filtradas también deben reescribirse o las filas se congelan en la geometría del último rebuild (`panel.ts:736`, `#786`). Un `appliesTo` o `getA11yAttributes()` que lanza degrada a "no aplica" / un veredicto por entidad en lugar de vaciar el panel (`panel.ts:1298`, `a11yInspect.ts:179`, `vectojs#496`).

## 13. Partes difíciles — con recibos

| Trampa                                                                                       | Dónde                                                   | Estado                                   |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------- |
| El overlay del dock se traga el input de puntero del host                                    | `panel.ts:288`, forge 2026-07-16                        | Corregido `@vectojs/devtools@0.4.3`      |
| FPS medido con rAF independiente mide vsync de pantalla, no cadencia de Scene                | `Scene.ts:518` `FrameStats`, forge 2026-07-18           | Corregido `core@1.13.0` vía `frameStats` |
| El panel desborda el viewport en cualquier altura menor                                      | `panel.ts:608` `layout()`, forge 2026-07-21             | Corregido `devtools@0.5.0`               |
| Foco/workspace decide cadencia de Chrome; Firefox necesita `layout.frame_rate`               | `benchmarks/run-browsers.sh`, forge 2026-08-02/03       | Corregido `vectojs#326/#327/#333`        |
| Snapshot mezcló nivel con clave/sin clave emparejando un nodo dos veces y perdiendo removals | `snapshot.ts:196`, forge 2026-08-13                     | Corregido `vectojs#481/#510`             |
| El modo pick se tragaba los clics de los propios controles del panel                         | `panel.ts:219`, forge 2026-08-13                        | Corregido `vectojs#482/#510`             |
| `findEntityAt` afirmaba paridad con el motor pero omitía compuertas de opacity/clip/pointer  | `model.ts:82`, `HitTester.ts:227` vs `forge 2026-08-13` | Corregido `vectojs#483/#510`             |
| Drift canvas-vs-DOM comparaba px lógicos contra px de cliente                                | `a11yInspect.ts:143`, `panel.ts:1099`                   | Corregido `vectojs#484/#510`             |
| `selectFinding` ignoraba hallazgos de plugins                                                | `panel.ts:860`, forge 2026-08-13                        | Corregido `vectojs#496/#518`             |
| `accessibleName` era el preview truncado de 80 caracteres                                    | `a11yInspect.ts:160`, `inspect.ts:70`                   | Corregido `vectojs#496/#518`             |
| Advertencia del inspector descartada en el presupuesto de filas                              | `model.ts:153` + `panel.ts:1143`, forge 2026-08-13      | Corregido `vectojs#496/#518`             |
| Auditoría a11y de escena completa re-recorrida cada tick de 500 ms                           | `panel.ts:1246`, forge 2026-08-13                       | Corregido `vectojs#496/#518`             |
| `getA11yAttributes()` que lanza mataba toda la auditoría a11y                                | `a11yInspect.ts:179`, forge 2026-08-13                  | Corregido `vectojs#496/#518`             |

## 14. Checklist — antes de aterrizar un cambio en DevTools

1. **Headless primero.** Añade la función pura, testéala vía `createDirectTransportPair()` sin navegador, luego cablea el panel. Un protocolo validado por un consumidor real vale más que una UI reconstruida alrededor de uno no validado (`bridge.ts:21`).
2. **A prueba de throws.** Protege cada llamada `getA11yAttributes()` / `getDevtoolsDescriptor()` / `appliesTo` — un componente roto debe degradarse, no vaciar la herramienta (`model.ts:184`, `inspect.ts:136`, `panel.ts:1298`).
3. **Paridad de hit.** Cualquier nueva compuerta de visibilidad/input/clip debe aterrizar tanto en `HitTester.findHitRecursively` como en `isHitEligible` _y_ en el recorrido headless de pick/explain (`HitTester.ts:227` vs `model.ts:82` vs `hitExplain.ts:139`, `vectojs#483`).
4. **Orígenes permitidos o solo par directo.** Un backend entre documentos sin `allowedOrigins` es un vector de divulgación de información (`bridge.ts:104`).
5. **Las cachés indexadas por versión necesitan TTL.** Una clave solo por `structureVersion` para algo que también depende de labels/opacity/bounds queda obsoleta para siempre (`panel.ts:1246`).
6. **Mantén el dock no interactivo.** El contenedor/canvas permanecen `pointer-events: none` (`panel.ts:288`); los controles vuelven a activarse. Una regresión aquí deja sin vida silenciosamente los controles del borde derecho del host.

## 15. Flujos de depuración — qué herramienta para cada síntoma

| Síntoma                                                    | Flujo                                                                                                                                          |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| "¿Qué entidad posee este píxel?"                           | `pickInScene(scene, x, y)` → `inspectEntity(hit)` (`packages/devtools/src/model.ts:214`, `packages/devtools/src/inspect.ts:99`)                |
| "La entidad incorrecta posee este píxel"                   | `explainHitTest(scene, x, y)` — cada perdedor con la razón por la que perdió (`packages/devtools/src/hitExplain.ts:139`)                       |
| "¿Por qué esta entidad está posicionada/mal dimensionada?" | `inspectEntity` bounds + `getWorldTransform()`, recorre `entityPath` hacia arriba — el primer bounds erróneo posee el bug                      |
| "Escrituras en `x` revierten"                              | `inspectEntity(e).layoutControlled` — el padre posee esa prop (`packages/devtools/src/inspect.ts:42`)                                          |
| "Target de clic desplazado respecto a visuales"            | `highlightGeometry(scene, e)` — busca `divergesFromLayout` en `a11y`/`content` (`packages/devtools/src/highlightGeometry.ts:1`)                |
| "El área de hit es incorrecta"                             | `sampleHitRegion(e)` — la región real de hit, no la caja                                                                                       |
| "El lector de pantalla no dice nada"                       | `inspectA11y(scene, e)` para `accessibleName`/`nameSource`; `a11yReadingOrder(scene)` para orden de anuncio                                    |
| "Texto en orden incorrecto / cajas en blanco"              | `inspectText(e)` niveles bidi / `glyphs[].atlasMiss` (`packages/devtools/src/textInspect.ts:179`)                                              |
| "Una escena `onDemand` nunca queda inactiva"               | `scene.setDirtyTracking(true)` → `diagnoseDirty(scene)` (`packages/devtools/src/dirtyDiagnosis.ts:70`, `packages/core/src/tree/Scene.ts:3474`) |
| "¿Qué cambió tras esta interacción?"                       | `captureSnapshot` antes/después → `diffSnapshots`                                                                                              |

---

_Serie: 00 Overview → 01 Selection → 02 Text+Layout → 03 Projection+Virtualization → 04 Streaming Markdown → 05 TeX → 06 Runtime VMT → 07 Renderer → 08 WASM G1/G2/G3 → 09 Three/XR → 10 Video Export → 11 Layout de Grafos → **12 DevTools** → 99 Synthesis._
