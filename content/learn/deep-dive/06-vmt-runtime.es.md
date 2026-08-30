---
title: '06 — Runtime del VMT — Ciclo de vida / Dirty / Eventos'
description: 'El runtime del Virtual Math Tree: ciclo de vida de entidades, granularidad de dirty/invalidación, composición de world-matrix y despacho de eventos capture/bubble — con las trampas de recorrido de ancestros y fugas de ciclo de vida que rompen las tres invariantes.'
order: 26
---

# 06 — Runtime del VMT — Ciclo de vida / Dirty / Eventos

> El Virtual Math Tree no es un scene graph que renderizas. Es un árbol numérico retenido cuyo cada frame recompone transformaciones, decide qué está dirty, descarta lo invisible, hace hit-testing de lo interactivo y solo entonces pinta. El DOM es una proyección; el canvas es la verdad. Este documento es el bucle de control que mantiene esa verdad consistente.

## 1. El pipeline del VMT en una imagen

```text
                    Entity tree               packages/core/src/tree/Entity.ts:782
                    (Scene.root)              Scene holds root + overlayRoot, never reassigns
                         │
                         │  add/remove/reparent  Entity.ts:1065 add / :1117 remove
                         │  structureVersion++   Scene.ts:3462 structureVersion
                         ▼
               ┌─────────────────────┐
               │  Dirty propagation  │   DirtyTracker  scene/DirtyTracker.ts:70
               │  markDirty / clear  │   dirty:boolean  Scene.ts:534
               └─────────┬───────────┘   consumed BEFORE update  Scene.ts:5646
                         │
                         ▼
               ┌─────────────────────┐
               │ Transform gather    │   getWorldTransform  Entity.ts:1668
               │ T·S·R compose       │   _worldFrame cache  Entity.ts:845 / :1668 fast path
               │ per-frame cache     │   currentFrame++     Scene.ts:5806 (O(1) invalidation)
               │ WASM SoA store (G1) │   _storeSlot         Entity.ts:865 / WasmBackendFacade.ts:30
               └─────────┬───────────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
     ┌────────────────┐   ┌──────────────────┐
     │ Layout         │   │ Hit test         │   HitTester  scene/HitTester.ts:17
     │ LayoutEngine   │   │ findEntityAt     │   :121 JS walk fallback
     │ measurePrepared│   │ isHitEligible    │   :326 clip + opacity + pointerEvents
     │ layoutPrepared │   │ WASM grid        │   :144 ensureHitGrid / :185 fused gather
     └───────┬────────┘   └────────┬─────────┘
             │                     │  pointer capture  Scene.ts:3851 setPointerCapture
             └──────────┬──────────┘   capture/bubble  Entity.ts:1610 dispatchEvent
                        ▼
              ┌───────────────────┐
              │ Render walk       │   Scene.ts:5730 render / :5569 loop
              │ cull → paint      │   renderMode always/onDemand  Scene.ts:401
              │ a11y sync after   │   syncA11y deferred when animating
              └───────────────────┘
                        │
                        ▼
                   Pixels + DOM mirrors
```

El orden causal es fijo — `Scene.ts:5745` lo documenta como un contrato de correctitud — aunque los recorridos físicos puedan fusionarse. La ruta JS intercala `update → compose → cull → paint` por nodo en preorden; la ruta WASM actualiza todo el árbol, luego reúne y compone en un único pase SoA antes del mismo recorrido de cull/paint. Ambas deben exponer una mutación `update()` en ese mismo frame.

## 2. Ciclo de vida — create / add / remove / destroy

### 2.1 Forma de Entity

`Entity` (`Entity.ts:782`) es `abstract`. Cada instancia lleva:

- `id: string` — aleatorio `entity_<7>` cuando se omite (`Entity.ts:1055` constructor).
- `parent: Entity | null` (`:791`), `children: Entity[]` (`:790`). Parent es el único enlace de propiedad.
- getter `scene` (`:796`) — recorre `parent` hasta el propietario real; nunca se almacena en la entidad misma excepto como vía de escape `_scene` del propio Scene.
- Transformación local: `_x/_y/_scaleX/_scaleY/_rotation/_opacity` (`:805`), con flag de vía rápida `_hasTransitions` (`:812`) para que `x = v` en una entidad pasiva sea una comprobación booleana + escritura de campo.
- `Map`s asignados perezosamente: `_drivers`, `listeners`, `captureListeners` (`:819`) — null hasta el primer uso. Una escena de 20k partículas nunca los asigna.
- `_mounted: boolean` (`:816`), `_destroyed: boolean` (`:817`), `_driversTickedFrame: number` (`:828`, `-1` inicialmente).
- Caché de world-matrix `_wa.._wf / _worldFrame` (`:845`) y slot WASM `_storeSlot: number` (`:865`, `-1` cuando no está en el store).

Las subclases sobrescriben `getBounds()`, `drawSelf()`, `getContentProjection()`, `update()`, `onMounted()`, `destroy()`.

### 2.2 add — adjuntar con guarda de ciclo e invalidación de estructura

`Entity.add(...children)` (`:1065`) delega a `_addOne` (`:1075`):

1. Guarda de ciclo — `child === this` lanza; recorrer la cadena `this.parent` comprueba igualdad de ancestro (`:1080`). O(depth), add es raro frente al trabajo por frame.
2. Desvincular del padre anterior — `child.parent.remove(child)` cuando `child.parent` está establecido, así re-parentar nunca duplica.
3. `child.parent = this; this.children.push(child)` — append O(1) al final.
4. Si `this.scene` existe (árbol vivo):
   - `s.a11yNeedsReorder = true`
   - `s.markStructureChanged()` — incrementa `structureVersion`, invalida el layout del store de transformaciones WASM (`Scene.ts:1625` `_storeStructureVersion`).
   - `s.markDirty({ entity: this.id, reason: 'child-added' })` (`:1086`).
   - `child._notifyMounted()` (`:1087`) — `onMounted()` en profundidad custodiado por `_mounted` para que un subárbol re-adjuntado dispare una sola vez.
   - `s._registerActiveDriverSubtree(child)` — reanuda cualquier driver en lote que el subárbol tuviera en vuelo al desvincularse (espejo del unregister de `remove`).

Múltiples hijos (`add(a,b,c)`) se adjuntan en orden de argumentos con la misma semántica.

### 2.3 remove — desvincular con desregistro de drivers

`Entity.remove(child)` (`:1117`) es `indexOf` + `splice`:

1. `child.parent = null`.
2. `s.detachA11y(child)` + `a11yNeedsReorder`.
3. `s.markStructureChanged()` + `markDirty({ reason: 'child-removed' })` (`:1123`).
4. `s._unregisterActiveDriverSubtree(child)` — retira el subárbol fuera del árbol de `DriverTicker.active` para que sus drivers dejen de hacer tick y de retener entidades. El espejo `_addOne` los reanuda si se re-adjuntan antes de asentarse.

Eliminar un no-hijo es no-op (retorna `this`). No existe `removeAll()` — itera o usa `destroy()`.

### 2.4 destroy — desmontaje recursivo leaf-first

`Entity.destroy()` (`:1525`) — idempotente vía guarda `_destroyed`:

```ts
while (this.children.length > 0) this.children.at(-1)!.destroy();
animations = null;
for (const d of this._drivers.values()) this._settleDriver(d); // resolve animateTo promises
this._drivers.clear();
listeners.clear();
captureListeners.clear();
if (this.parent) this.parent.remove(this);
```

- Leaf-first (destruye desde la cola) para que cada `parent.remove(this)` del hijo mute la cola que se está iterando — sin snapshot, sin desalineación de índices.
- Las subclases que poseen recursos GPU/DOM sobrescriben, liberan el recurso y luego llaman a `super.destroy()` (`ComputeParticleEntity.ts:419`, `DOMPortalEntity.ts:142`).
- Asentamiento de promesas vía `_settleDriver` (`:1329`) resuelve a los llamantes de `animateTo`/`springTo` en lugar de colgarlos para siempre.

`Scene.destroy()` (`Scene.ts:2957`) añade el gemelo a nivel de Scene:

- Guarda `if (destroyed) return` (`:2958`), establece `destroyed = true`.
- `while (root.children.length) destroyEntitySubtree(root.children.at(-1)!)` y lo mismo para `overlayRoot` (`:2964`), cada uno delegando a `entity.destroy()` (`:2951`).
- Desmonta `pointRenderer`, `WebGPU device/manager`, `ResizeObserver`, watcher de DPR, listeners de puntero (desvinculando de `pointerEventTarget`), `a11yRoot`/`portalRoot`, y limpia `keydownHandlers/shortcuts`.
- Idempotente — `start()` retorna temprano cuando `destroyed` (`:3143`), y la recuperación de dispositivo WebGPU comprueba `if (destroyed) newDevice.destroy()` (`:5813`).

Una entidad con `destroy()` nunca debe re-añadirse — su flag `_destroyed` hace que cualquier `destroy()` posterior sea no-op pero su `parent` ya es null y sus hijos han desaparecido.

## 3. Granularidad de Dirty / invalidación

### 3.1 El flag booleano y su atribución

`Scene.dirty: boolean` (`Scene.ts:534`) es la única señal de planificación. `onDemand` omite el renderizado cuando `!dirty && !frameHadAnimation && !contentSemanticDeferred` (`Scene.ts:5594` `isIdle`); `always` renderiza cada rAF a menos que `autoThrottle` baje a `idleFPS`.

La propiedad está dividida según el encabezado `DirtyTracker.ts:2`:

- `DirtyTracker` (`scene/DirtyTracker.ts:70`) posee el flag (`isDirty`), el mapa de atribución opt-in y su límite FIFO (`MAX_DIRTY_REASONS = 200` en `:71`).
- `Scene.markDirty(source?)` (`Scene.ts:3443`) mantiene su nombre/firma exactos y delega a `_dirty.mark(source, currentFrame)` — 129 sitios de llamada en `Entity.ts` dependen de `scene.markDirty()` (`DirtyTracker.ts:33`).
- `Scene._dirty: DirtyTracker` (`Scene.ts:1220`) con getter/setter privado (`:1229`) — `set dirty(true)` llama a `mark(undefined, currentFrame)`, `set dirty(false)` llama a `clear()`.

Coste de vía rápida (`DirtyTracker.ts:47`): cuando `tracking` está desactivado, `mark()` es una escritura de campo (`isDirty = true`) más una rama ya falsa. `record()` es un método separado para que V8 pueda inlinear la versión de un solo campo.

### 3.2 Cuándo se activa el flag y cuándo se consume

**Se activa** — docenas de sitios, cada uno con un string `reason` para atribución:

- `Entity.add` → `child-added` (`:1086`), `remove` → `child-removed` (`:1123`), `animate` → `animation-start`, `_spawnDriver` → `driver-added` (`:1305`), `tickDrivers` → `driver-tick` (`:1389`), `ComputeParticleEntity` → `markDirty()` por mutación de partícula (`ComputeParticleEntity.ts:113`).
- El propio `Scene`: cambios de estilo, resize, carga de fuente (`:2717`), reorden a11y (`:3674`), scroll (`:3931`).

**Se consume** — `Scene.loop` (`:5569`) hace `this.dirty = false` **antes** del pase `update/render` (`:5650`). Cualquier `markDirty()` dentro de `entity.update()` sobrevive al siguiente frame; limpiar después del render borraría los re-armes auto-animados y congelaría la entidad (`DirtyTracker.ts:98`). `Scene.step(dt)` (`:3420`) es la excepción — renderiza incondicionalmente (no consulta `renderMode` ni `dirty`, contrato `DirtyTracker.ts:33`) y limpia después (`:3434`), ya que el determinismo es el objetivo.

### 3.3 Atribución — encontrar qué mantiene despierta una escena onDemand

Desactivado por defecto. Actívalo con `scene.setDirtyTracking(true)` (`Scene.ts:3475`), ejecuta y luego lee `scene.dirtyReasons: DirtyReasonEntry[]` (`:3489`, ordenado por más frecuente primero). Cada entrada es `{ entity?, reason, property?, count, firstFrame, lastFrame }` (`DirtyTracker.ts:59`). La clave es `entity:reason.property` (`:120`). FIFO acotado — el más antiguo se descarta a los 200 (`:127`). Limpia con `scene.clearDirtyReasons()` (`:3495`). El diagnóstico `onDemand` que antes era "dirty es true, sin idea de por qué" ahora es una tabla ordenada.

`structureVersion` (`Scene.ts:3462`, respaldado por `_structureVersion` en `:1636`) es la señal compañera: add/remove/reparent lo incrementan; los cambios de propiedades no. Una caché de la forma del árbol es válida exactamente mientras este valor no cambie — O(1) frente a recorrer de nuevo.

## 4. Composición de world-matrix

### 4.1 El afín y su caché

`AffineTransform { a,b,c,d,e,f }` (`Entity.ts:33`) coincide con `CanvasRenderingContext2D` — `T * S * R` por nodo, seis escalares.

`getWorldTransform(): AffineTransform` (`Entity.ts:1668`) tiene dos rutas:

**Vía rápida** — caché por frame escrita por el recorrido de render de Scene (`_setWorldCache` en `:1784`, sellando `_wa.._wf` y `_worldFrame`). Si `_worldFrame === scene.currentFrame` (`:1672`), retorna los seis escalares tal cual — sin recorrido, sin asignación más allá del objeto retornado. Una caché obsoleta (entidad no renderizada en este frame, o consultada entre frames) falla la comprobación y cae al recorrido; la caché solo puede ahorrar trabajo, nunca devolver una matriz incorrecta.

**Recorrido autoritativo** — construye `path: Entity[]` desde `this` hasta la raíz real (`parent === null`, no `id === 'root'` — configurable por el usuario, `:1690`), luego compone raíz→self:

```ts
for (let i = path.length - 1; i >= 0; i--) {
  const { cos, sin } = node._getTrig(); // cached, :1746
  const la = scaleX * cos,
    lb = scaleY * sin,
    lc = -scaleX * sin,
    ld = scaleY * cos;
  const le = x,
    lf = y;
  nextA = a * la + c * lb;
  nextB = b * la + d * lb;
  nextC = a * lc + c * ld;
  nextD = b * lc + d * ld;
  nextE = a * le + c * lf + e;
  nextF = b * le + d * lf + f;
}
```

`_getTrig()` (`:1746`) cachea `{cos, sin}` y recalcula solo cuando `rotation` cambió (comprobación `_trigRotation`) — `Math.cos/sin` de V8 es ~2,5× más lento que otros motores, y esto es por entidad y por frame. `_readWorldCache(frame, out)` (`:1647`) es el hermano de cero asignaciones para recolecciones por entidad (p. ej. `gatherHitAABBs` de G3) — seis lecturas escalares en un `out` propiedad del llamante en lugar de un objeto por entidad.

La invalidación es O(1): `Scene.render` incrementa `currentFrame++` (`:5806`) al inicio del recorrido autoritativo, por lo que la caché de cada entidad queda obsoleta en un solo incremento sin tocar entidades.

### 4.2 Ruta WASM G1 — el store SoA de transformaciones

Cuando el backend de transformaciones está activo (`transformBackend: 'wasm'` / `'auto'` con módulo cargado), `Scene` mantiene un store SoA residente (`WasmBackendFacade.ts:228` `structureVersion`, `scene-store.ts:buildTreeStore`). En `markStructureChanged`, el store reconstruye su topología (índices de padre, asignación de slots); cada `Entity._storeSlot` (`:865`) se asigna entonces y se valida contra la tabla de slots antes de confiar. Por frame, `ensureAabbs()` compone todas las world matrices en un solo pase WASM sobre los buffers SoA — la misma matemática `T·S·R`, bit-idéntica al recorrido JS. La recolección fusionada de hit-test (`HitTester.ts:144`) prefiere `transform.aabbView()` cuando está disponible, retrocediendo al JS `gatherHitAABBs` (`wasm/hit-store.ts:47`) que llama a `getWorldTransform()` por entidad. Un `_storeSlot` obsoleto solo cuesta un fallback JS, nunca una lectura errónea.

### 4.3 Consultas derivadas

- `localToWorld(x,y)` (`:1784`) / `worldToLocal(x,y)` (`:1796`) — aplica/invierte la world matrix; `worldToLocal` retorna `null` con determinante singular (`|det| < 1e-12`).
- `getWorldBounds()` (`:1819`) — `getBounds() ?? {x:0,y:0,width,height}` transformado por cuatro esquinas, produciendo el AABB mundial usado para culling y entrada del hit-grid.
- `getWorldScale()` (`:1850`) — multiplica `scaleX/scaleY` hacia arriba en la cadena de padres (ignora rotación — solo para inversa de hit-test).

## 5. Despacho de eventos — capture / bubble y propiedad del puntero

### 5.1 VectoJSEvent

`VectoJSEvent<N>` (`Entity.ts:607`) refleja la superficie DOM: `type: VectoEvent` (`:538`, `click | dblclick | hover | pointerdown/up/move/cancel/leave | wheel | keydown/keyup | scroll | change | ...`), `target: Entity`, `currentTarget: Entity` (establecido por nodo durante el despacho), `nativeEvent: N | undefined`, `bubbles: boolean` (por defecto `true`; `hover`/`pointerleave` son `false`), más `stopPropagation()`, `stopImmediatePropagation()`, `preventDefault()`, y `clientX/Y`, `sceneX/Y`, `localX/Y`, `deltaX/Y`, `key/shiftKey/ctrlKey/altKey/metaKey` reenviados.

### 5.2 Registro

`Entity.on(event, cb, { capture })` (`:1470`) y `off(event, cb, { capture })` (`:1485`):

- Dos mapas asignados perezosamente: `listeners` (bubble) y `captureListeners` (`:1030`), cada uno `Map<VectoEvent, Array<cb>>`.
- `capture: true` registra en `captureListeners`; el defecto es bubble. `off` debe coincidir con la fase.
- `emit(event, payload)` (`:1540`) es la ruta directa solo-self (solo listeners bubble, sin propagación) — para eventos `change` internos del componente. `dispatchEvent` es la ruta del árbol.

### 5.3 Despacho — capture luego bubble

`Entity.dispatchEvent(event)` (`:1610`):

1. Construye `path: Entity[]` target→root vía cadena `parent`.
2. Capture: raíz→target (`for i = path.length-1 .. 0`) disparando `captureListeners` (`:1618`). Comprueba `propagationStopped` antes de cada nodo.
3. Bubble: target→root (`for i = 0 .. path.length-1`) disparando `listeners` (`:1622`). `if (!event.bubbles) return` tras el target — los eventos no burbujeantes aún ejecutan capture pero solo el bubble del target.
4. `fireListeners(node, map, event)` (`:1595`) hace snapshot `handlers.slice()` para que un handler que añade/elimina listeners a mitad del despacho no perturbe el pase, y respeta `immediatePropagationStopped`.

La proyección a11y de Scene cablea eventos DOM nativos en este árbol: listeners por espejo en `Scene.ts:3802` (`click`, `dblclick`, `pointerdown/up/cancel/move`, `wheel`, `keydown/keyup`) cada uno hace `node.dispatchEvent(new VectoJSEvent(type, node, nativeEvent))`. `scroll` (`:3912`) es especial — no burbujea en el DOM, así que Scene hace `node.emit('scroll', { scrollTop, scrollLeft, ... })` (`:3920`) directamente a la entidad propietaria.

El teclado a nivel de Scene (`Scene.ts:3272` `on('keydown'|'keyup')`) es un canal separado — sin target de entidad, `stopPropagation()` reenvía al evento nativo (`scene/keyboard.ts:79`), y `registerShortcut(chord, handler)` coincide solo en `keydown`.

### 5.4 Propiedad del puntero

`pointerdown` en un elemento shadow captura el puntero (`Scene.ts:3851`):

```ts
if (e.target === capEl && typeof capEl.setPointerCapture === 'function')
  capEl.setPointerCapture(e.pointerId);
```

La guarda `e.target === capEl` es crítica: un `pointerdown` burbujeado cuyo target es un descendiente no debe re-capturar — el descendiente ya lo posee, y un ancestro que lo sobrescriba redirige `pointerup` + `click` al ancestro común (medido como opciones de Dropdown cuyos clics aterrizaron en el contenedor listbox, `Scene.ts:3844`). `pointerup`/`pointercancel` liberan vía `releasePointer` (`:3831`) custodiado por `hasPointerCapture(pointerId)` y capturando la DOMException `NotFoundError`. `pointerEvents: 'none'` (`Entity.ts:431` `a11yAttributes.pointerEvents`) excluye un nodo del hit-testing sin afectar a los hijos — ver §6.3.

## 6. Hit testing — dos rutas que deben coincidir

`Scene.findEntityAt(x, y)` (`Scene.ts:2777`) delega a `HitTester.findEntityAt(x, y, currentFrame, width, height)` (`HitTester.ts:121`):

1. Raíz overlay primero — siempre `findHitRecursively` (los overlays son pocos, nunca indexados por WASM).
2. Árbol principal — si `backends.hit` y `ensureHitGrid(frame, width, height)` (`:144`) tienen éxito, `findEntityAtWasm` (`:185`); de lo contrario `findHitRecursively` (`:227`). La ruta WASM es concluyente — entidad correcta o `null`, nunca "no concluyente" — por lo que ningún fallback JS sigue a un grid confiable.

`findHitRecursively(node, x, y, clip)` (`:227`):

- Omite subárboles `opacity <= 0` (opacidad acumulada).
- `clipChildren` intersecta en `childClip` vía `intersectBounds` (`:32`) — pasado hacia abajo, el propio nodo sigue siendo testeable contra el clip entrante.
- Hijos en orden inverso de dibujo (el superior primero).
- Un nodo es hit si y solo si `isPointInside(x,y) && isInsideAllClippers(node,x,y) && !isPointerTransparent(node)`.

`isInsideAllClippers` (`:284`) es la compuerta autoritativa consciente de rotación — cada ancestro `clipChildren` debe tener su `worldToLocal(x,y)` dentro de `[0, width]×[0, height]`. La pila de clip AABB en el recorrido es solo un pre-filtro de poda de subárboles; ambas rutas de hit deben reaplicar el rect exacto o un clipper rotado produce respuestas distintas por backend (#680).

`isHitEligible(node,x,y)` (`:326`, ruta WASM) reaplica la misma compuerta en plano: `!isPointerTransparent`, `opacity>0` en el nodo y cada ancestro, y `isInsideAllClippers`. `isPointerTransparent` (`:284`) es `attrs.disabled === true || attrs.pointerEvents === 'none'` (`Entity.ts:431`) — los hijos de un contenedor transparente aún se recorren.

## 7. Planificación de render — donde dirty se encuentra con el bucle

`Scene.loop(time)` (`Scene.ts:5569`) corre en `requestAnimationFrame`:

1. Sale si `!_canvasOnScreen` (IntersectionObserver) — `markDirty()` mientras está oculto es inofensivo, el flag persiste.
2. Calcula `isIdle = !dirty && !frameHadAnimation && !contentSemanticDeferred` (`:5594`) — gobierna tanto el skip `onDemand` como el auto-throttle `always` a `idleFPS`.
3. `effectiveMaxFPS()` (`:5556`) — `maxFPS` explícito reducido a `30` cuando `prefersReducedMotion` coincide.
4. Tope de framerate: `if (cap>0 && time - lastTime < 1000/cap -1) skip` (`:5605`).
5. Ajusta `dt` al nominal `1000/cap` cuando está dentro del 30% para eliminar jitter del compositor; limita a `MAX_FRAME_DT` para evitar explosión de springs tras una pestaña en segundo plano (`:5630`).
6. `onDemand && isIdle → skip` (`:5640`).
7. `dirty = false` **antes** de `render()` (`:5650`) — ver §3.2.
8. `render(renderer, dt, time)` (`:5730`) — incrementa `currentFrame`, hace tick de drivers en lote (`_tickBatchedDrivers`), avanza simulación de partículas, recorre entidades.
9. Sincronización de proyección a11y/contenido tras el render — omitida por completo mientras `frameHadAnimation` (evita que el reflow del DOM sature el bucle de canvas).

`Scene.step(dt)` (`Scene.ts:3420`) es el driver determinista síncrono (exportación de vídeo, tests, benchmarks) — renderiza incondicionalmente sin consultar `renderMode`/`dirty`/`maxFPS`, y limpia `dirty` después. Un benchmark que conduce `step()` no puede observar el skipping `onDemand` (`Scene.ts:3406` doc).

## 8. Partes difíciles — con recibos

### 8.1 Los recorridos de ancestros son O(depth) y hay muchos

`getWorldTransform`, `getWorldScale`, `isInsideAllClippers`, `isHitEligible`, construcción de ruta `dispatchEvent`, getter `Entity.scene` — cada uno recorre `parent` hasta la raíz. La profundidad suele ser pequeña (Stack → Card → RichText), así que O(depth) es barato por llamada, pero el hit-testing y el recorrido de render lo llaman por entidad y por frame. Tres mitigaciones:

- **Caché por frame** (`_worldFrame` / `currentFrame`, `:845`/`5806`) — invalidación O(1), vía rápida cuando el recorrido de render ya selló la matriz. `getWorldTransform` solo retrocede al recorrido en miss.
- **Lectura de cero asignaciones** (`_readWorldCache`, `:1647`) para recolecciones como `gatherHitAABBs` — seis lecturas escalares en un objeto propiedad del llamante en lugar de una asignación por entidad. El benchmark integrado de G2 encontró que la asignación de closures por entidad era un coste real (encabezado `DriverTicker.ts:40`).
- **Store SoA WASM** (G1) — un único pase lineal sobre typed arrays en lugar de recorridos por entidad; la recolección fusionada `ensureHitGrid` (`HitTester.ts:144`) reutiliza `transform.aabbView()` para evitar re-derivar cuatro esquinas por entidad (la recolección JS era 11,2 ms vs 39 µs a 100k entidades, esencialmente todo delante del kernel).

Aun así, insertar una cadena de 500 de profundidad y llamar a `getWorldTransform` en un bucle ajustado será O(n·depth). Mantén los árboles anchos, no profundos.

### 8.2 Coste de transformación — la trampa cos/sin

`Math.cos/sin` en V8 es una llamada libm por software, ~2,5× más lenta que otros motores (encabezado `Entity.ts:828`). `Entity._getTrig()` (`:1746`) cachea el par y recalcula solo en cambio de rotación; tanto `getWorldTransform` como el recorrido de render lo leen. Sin esto, una escena con muchas partículas rotando (Danmaku) paga el coste libm por entidad y por frame para un ángulo sin cambios. El flag `_hasTransitions` (`:812`) es la misma clase de micro-optimización — la mayoría de entidades nunca animan, así que `x = v` no debe tocar mapas de transiciones/drivers.

### 8.3 Fugas de ciclo de vida — las tres que se repiten

**Fuga de subárbol de drivers.** `DriverTicker.active: Set<Entity>` (`DriverTicker.ts:84`) es el conjunto candidato de lotes. `Entity.add` registra el subárbol (espejo `:1087`) y `remove` lo desregistra (`:1130`). Si alguna llamada se omite — p. ej. un contenedor personalizado que muta `children` directamente en lugar de vía `add`/`remove` — los drivers siguen haciendo tick fuera del árbol cada frame y retienen entidades en el Set. Auditoría: busca `children.push/splice` directos fuera de `Entity.ts`.

**Guarda de destroyed.** `Entity.destroy()` (`:1525`) establece `_destroyed` primero, luego recurre. Un segundo `destroy()` es no-op; un `destroy()` que re-entra vía `onMounted` de un hijo o `onDone` de un driver ve el flag y se detiene. `Scene.destroy()` (`:2957`) establece `destroyed` antes de desmontar hijos, y cada callback asíncrono (recuperación de dispositivo WebGPU `:5813`, bucle `requestAnimationFrame` `:5569`) comprueba `if (destroyed) return/newDevice.destroy()`. Omitir la guarda resucita una escena medio desmontada o fuga un dispositivo GPU entre cambios de ruta SPA.

**Fuga de a11y / portal.** `remove` llama a `detachA11y(child)` (`:1117`) y `destroy` llama a `removeA11yRecursively` vía `A11yProjectionManager.ts:227`. El `contentSemanticBudget` y `contentViewportEpoch` de la proyección aseguran que los carriers/estado de proyección de una entidad eliminada no se retengan entre recorridos `syncA11y`. Olvidar `detachA11y` deja un elemento shadow transparente que aún captura eventos de puntero y aparece en `getA11yTree()`.

### 8.4 La trampa de descomposición del planificador de render

`Scene.ts` tiene ~6,5k líneas porque cuatro dominios comparten estado mutable de frame: `DirtyTracker` (`DirtyTracker.ts:70`), `DriverTicker` (`DriverTicker.ts:57`), `HitTester` (`HitTester.ts:17`) y `WasmBackendFacade` (`WasmBackendFacade.ts:1`) se han extraído según `forge/decisions/file-decomposition-2026-08.md`, pero `loop`/`render` y la geometría `a11yRoot`/`canvas` permanecen en Scene. `Scene._updateWalkDt` (`:5806`) se publica para el tick de recuperación a mitad de recorrido de `Entity._spawnDriver` — un driver generado después de que el pase en lote reclamó la entidad de otro modo esperaría hasta el próximo frame en la ruta WASM pero haría tick en el mismo frame en la ruta JS. Dividir `loop` sin arrastrar `dt`/`currentFrame`/`frameHadAnimation` juntos viola la regla 5 de `DEC-0019`.

## 9. Invariantes que los desarrolladores deben mantener

1. **Nunca mutes `children` excepto vía `add`/`remove`/`destroy`.** La mutación directa del array omite `markStructureChanged`, `markDirty`, registro de drivers y detach a11y — las cuatro invariantes se rompen silenciosamente. Busca `\.children\.push|\.children\.splice` fuera de `Entity.ts`.
2. **Comprueba `destroyed` antes de planificar trabajo.** Cualquier `requestAnimationFrame`, `setTimeout`, `ResizeObserver` o promesa WebGPU que toque `scene` o `entity.scene` debe custodiar `if (destroyed) return`. El doc de `destroy()` en `Scene.ts:3137` es explícito.
3. **Respeta el contrato dirty.** Las escenas `onDemand` duermen hasta `markDirty()` o un driver activo. Mutar `x/y/scale/rotation/opacity/width/height` fuera de `Entity.animate`/`setTransition` sin `markDirty({ reason })` deja el cambio invisible. A la inversa, un `markDirty` por frame (p. ej. `update()` re-armándose) mantiene `onDemand` despierto — usa `scene.dirtyReasons` (`:3489`) para encontrar el `reason` que dispara cada frame.
4. **Mantén las compuertas de hit-test sincronizadas.** Cualquier nueva condición de visibilidad/input/clip debe añadirse tanto a `findHitRecursively` (`HitTester.ts:227`) como a `isHitEligible` (`:326`). Una condición solo en uno hace que las rutas WASM y JS discrepen — el acelerador se convierte en un generador de bugs.
5. **Captura de puntero solo en `e.target === capEl`.** La guarda `Scene.ts:3851` no es opcional. Eliminarla rompe cada menú Dropdown/Select cuyas opciones son hijas del elemento capturador.
6. **Los consumidores de world-matrix deben manejar el caso de caché obsoleto.** `getWorldTransform()` solo puede retornar una matriz cacheada para `currentFrame`; entre frames o para una entidad fuera del árbol recorre. Los llamantes de `_readWorldCache` deben retroceder al recorrido completo cuando retorna `false` (comentario de recolección fusionada `HitTester.ts:144`).
7. **Versiona métricas, no barras.** Cambios de fuente/DPR/viewport invalidan todo `scaleX`/calibración vía contadores de generación (`ContentProjectionManager.ts:524`), no tocando cada carrier. El mismo patrón aplica a `structureVersion` para cachés de forma.

## 10. Checklist de depuración — cuando la escena se ve mal

- **Nada se renderiza tras una mutación en modo `onDemand`** → ¿sigue `dirty` en `false`? Activa `scene.setDirtyTracking(true)`, muta, lee `scene.dirtyReasons`. Omitir `markDirty` es la causa en ~90% de casos. Revisa `scene.frameStats.dirty` (`Scene.ts:3528`) en devtools.
- **Hit targets fantasma tras `remove()`** → ¿se mutó `children` directamente? Revisa el incremento de `structureVersion` y la obsolescencia de `HitTester.ensureHitGrid` (`hitGridStructureVersion` vs `structureVersion`). Un grid obsoleto con `hitGridOk=true` sirve candidatos erróneos.
- **El driver sigue corriendo tras quitar el subárbol** → el tamaño de `DriverTicker.active` debería bajar. Inspecciona la compuerta `scene._tickBatchedDrivers` — `unregisterSubtree` en `DriverTicker.ts:101` recorre todo el subárbol, así que un subárbol separado muy profundo paga O(subárbol) al eliminarlo, no por frame.
- **La transformación diverge JS vs WASM** → compara `entity.getWorldTransform()` (recorrido JS) contra el slot `transform.aabbView()`. Un `_storeSlot` obsoleto (`Entity.ts:865`, `-1` cuando no está en el store) solo causa un fallback JS lento y correcto, nunca una matriz errónea — si las matrices difieren, la reconstrucción de topología omitió un `markStructureChanged`.
- **El evento se dispara dos veces o nunca** → comprueba el flag `bubbles` (`VectoJSEvent.ts:607`) y si el listener está en `captureListeners` vs `listeners`. Los eventos no burbujeantes `hover`/`pointerleave` solo se disparan en el target en la fase bubble.
- **El spring explota al reenfocar la pestaña** → `loop` limita `dt` a `MAX_FRAME_DT` (`Scene.ts:5630`). Si un `step(dt)` personalizado alimenta un `dt` enorme directamente a `tickDrivers`, el mismo límite debe aplicarlo el llamante.

---

_Serie: 00 Overview → 01 Selection → 02 Text+Layout → 03 Projection+Virtualization → 04 Streaming Markdown → 05 TeX → **06 Runtime del VMT** → 07 Renderer → 08 WASM G1/G2/G3 → 09 Three/XR → 10 Video Export → 11 Graph Layout → 12 DevTools → 99 Synthesis._
