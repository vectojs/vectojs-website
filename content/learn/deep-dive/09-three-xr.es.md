+++
title = "09 — Puente Three.js / XR — Dos mundos de coordenadas"
description = "El adaptador entre el contrato de canvas 2D de VectoJS y el espacio 3D de Three.js: paneles CanvasTexture, mapeo raycast→UV→escena, propiedad de foco/teclado offscreen y cómo Graph3D muestra la contraparte puramente Three."
weight = 29
+++

# 09 — Puente Three.js / XR — Dos mundos de coordenadas

> **Boss 09** vive donde colisionan dos modelos de entrada. VectoJS renderiza a una escena 2D de píxeles lógicos con un DOM a11y transparente que posee el despacho de puntero y teclado; Three.js renderiza a una escena WebGL donde un puntero es un rayo y un panel es un quad texturizado flotando en el espacio. `ThreeAdapter` es la única pieza que habla ambos idiomas.

- **Qué aprenderás**: por qué el adaptador es un puente de sistemas de coordenadas, no un renderer; la ruta de textura `CanvasTexture` y su proxy `needsUpdate`; cómo los UV de `Raycaster` se mapean a píxeles lógicos (y la trampa de DPR); cómo la propiedad de puntero, rueda, hover, foco y teclado se re-enruta a través de un canvas offscreen; y cómo `Graph3D`/`GraphCamera`/`GraphInteraction` demuestran la alternativa puramente Three.
- **Qué no aprenderás**: el contrato `IRenderer` en sí (boss 07), la rasterización de texto y los detalles del orto y-down (boss 07 §Text raster paths), la aceleración WASM (boss 08) ni el ajuste de force-layout 2D (boss 11). Este documento es la costura _entre_ el contrato 2D de VectoJS y un host 3D.

## 1. Por qué el adaptador es difícil — dos mundos, un canvas

Una `Scene` normal de VectoJS posee un `<canvas>` insertado en la página. Sus espejos a11y se añaden al `a11yRoot` de ese canvas (un `<div>` apilado sobre el canvas), y el despacho de puntero/teclado pasa por esos espejos (`Scene.ts:3512` listeners por espejo). En el puente el canvas está **offscreen** — nunca se inserta en el documento, se muestrea como textura GPU.

Ese único hecho desencadena:

| mundo       | quién posee la entrada                              | dónde viven los píxeles              | quién posee el foco                                                                  |
| ----------- | --------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| VectoJS 2D  | projected a11y DOM (`Scene` per-mirror listeners)   | `canvas.width/height` backing store  | `document.activeElement` + `Scene.focusedA11yElement` (`Scene.ts:1446`)              |
| Three.js 3D | `THREE.Raycaster` + `window`/`domElement` listeners | `CanvasTexture` on a `PlaneGeometry` | Three has no DOM focus; the host's `OrbitControls` or `GraphCamera` owns the pointer |

`ThreeAdapter` (`packages/three/src/ThreeAdapter.ts:90`) debe hacer que una escena 2D que cree estar en pantalla se comporte correctamente mientras sus píxeles están detrás de un hit-test 3D y sus espejos están permanentemente desconectados de `document`.

El otro módulo del paquete, `ThreeRenderer` (`packages/three/src/ThreeRenderer.ts:216`), es una respuesta distinta al mismo reto: _es_ un `IRenderer` (contrato `IRenderer.ts:41`) que renderiza entidades VectoJS con Three.js en lugar de `CanvasRenderingContext2D`. El adaptador envuelve una Scene como textura; el renderer reemplaza el contexto 2D. Comparten las mismas trampas de orto y-down y DPR (boss 07) pero con propiedad opuesta: el `vectoScene` del adaptador sigue renderizando con `CanvasRenderer` por defecto, el `scene/camera/renderer` del renderer (`ThreeRenderer.ts:219`) renderiza entidades directamente.

## 2. La ruta de textura — de píxeles VectoJS a un quad de Three.js

```ts
// packages/three/src/ThreeAdapter.ts:125 — construction (abbreviated)
this.canvas = optCanvas ?? (document ? document.createElement('canvas') : offscreenFallback);
this.vectoScene = new VectoScene(this.canvas, { disableWindowResize: true, ...sceneOptions });
this.texture = new THREE.CanvasTexture(this.canvas);
this.texture.minFilter = THREE.LinearFilter; // ThreeAdapter.ts:151
this.texture.magFilter = THREE.LinearFilter; // ThreeAdapter.ts:152
this.vectoScene.render = (renderer, dt, time) => { originalRender.call(...); this.texture.needsUpdate = true; }; // ThreeAdapter.ts:157
this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false })); // ThreeAdapter.ts:163
```

Notas de diseño con `file:line`:

- **Propiedad del canvas offscreen** — `ThreeAdapter.ts:122` `_ownsCanvas` rastrea si el adaptador creó el canvas. `dispose()` (`ThreeAdapter.ts:750`) solo pone a cero `canvas.width/height` cuando lo posee; un canvas suministrado por el llamante se deja intacto. El fallback SSR (`ThreeAdapter.ts:78` `OffscreenCanvasFallback`) detalla exactamente qué miembros existen cuando `document` es undefined — un simple `{width,height} as HTMLCanvasElement` ocultaba antes ese contrato.
- **Resize es manual** — `sceneOptions.disableWindowResize = true` (`ThreeAdapter.ts:140`) porque una `Scene` de ventana completa auto-adopta `window.innerWidth/Height` (`Scene.ts:2284`). Una escena respaldada por textura no debe seguir la ventana; el host llama a `adapter.resize(w,h)` (`ThreeAdapter.ts:713`) que redimensiona el backing store, el viewport de Scene y marca `texture.needsUpdate`.
- **Subida controlada por dirty** — el proxy de render (`ThreeAdapter.ts:155`) establece `texture.needsUpdate = true` solo cuando Scene realmente repintó. Un bucle continuo `Scene.renderMode: 'always'` sigue subiendo cada frame; una Scene `onDemand` solo sube cuando se disparó `markDirty()` — lo que toda ruta de entrada hace (`ThreeAdapter.ts:270`, `ThreeAdapter.ts:612`).
- **La malla por defecto es conveniencia, no prescripción** — `mesh` es un `PlaneGeometry(1,1)` unitario (`ThreeAdapter.ts:163`). Los hosts que necesitan pantallas curvas, billboards o dashboards VR reemplazan la geometría/material y conservan `texture`. La malla no se pre-añade a ninguna escena; el host hace `scene3d.add(adapter.mesh)`.
- **Higiene de disposal** — `dispose()` (`ThreeAdapter.ts:723`) restaura `vectoScene.render` a `_originalRender` (`ThreeAdapter.ts:730`) _antes_ de destruir Scene, de lo contrario una referencia superviviente pondría `needsUpdate` en una textura eliminada y Three registra `trying to use deleted texture`. Luego libera `texture`, `geometry`, `material`(s), retira `mesh` de su padre, llama a `vectoScene.destroy()`, limpia `activePointers`, descarta `_focusedEntity` sin emitir (los espejos ya no existen) y pone a cero el canvas solo si es propio.

`ThreeRenderer` es la ruta de textura alternativa — sin canvas adaptador. Posee su propio `THREE.Scene` + `THREE.OrthographicCamera(0,width,0,height)` + `THREE.WebGLRenderer({canvas, alpha:true, antialias:true})` (`ThreeRenderer.ts:256`). Su orto y-down, el clamping `effectiveDPR`/`pixelRatio`, la recuperación de pérdida de contexto y el diferimiento de `present()` se cubren en el boss 07; los hechos específicos del puente son que implementa `IRenderer` para que cualquier `Entity.render(r)` funcione sin cambios, y sus cachés `fillText`/`drawImage` clavean por `dpr` y fase `x,y` redondeada (`ThreeRenderer.ts:1002`).

Internos relevantes para el puente que vale la pena nombrar para no redescubrirlos:

- **DPR** — `effectiveDPR()` (`ThreeRenderer.ts:309`) es `min(real DPR, maxDPR)` y `pixelRatio` (`ThreeRenderer.ts:324`) es el `renderer.getPixelRatio()` vivo, no una instantánea. `Scene` sincroniza `maxDPR` sobre el renderer en cada `resize` (`Scene.ts:286`); `ThreeRenderer.resize` (`ThreeRenderer.ts:355`) re-aplica la razón limitada antes de `setSize`/`updateProjectionMatrix`. Una textura claveada por `window.devicePixelRatio` en lugar de `pixelRatio` se desenfoca en una pantalla limitada.
- **Pérdida de contexto** — `webglcontextlost` hace `preventDefault` (`ThreeRenderer.ts:281`) para que pueda dispararse `webglcontextrestored`; el handler de restauración re-aplica `effectiveDPR`, redimensiona, marca `frameDirty` y hace `present()` en el framebuffer limpiado (`ThreeRenderer.ts:285`). `dispose()` desprende ambos listeners y llama a `renderer.forceContextLoss()` (`ThreeRenderer.ts:1186`) para que los remontajes SPA no fuguen contextos GL vivos.
- **Consecuencias y-down** — cada primitiva rellena necesita `side: DoubleSide` (`ThreeRenderer.ts:596` fill, `:658` drawImage, `:1049` fillText) y `texture.flipY = false` (`ThreeRenderer.ts:628` drawImage, `:1035` fillText); sin ambos, las caras FrontSide se descartan e imágenes/texto quedan invertidas bajo el orto y-down (`ThreeRenderer.ts:250`).
- **Cachés** — `textTextureCache` (`ThreeRenderer.ts:911`) e `imageTextureCache` (`ThreeRenderer.ts:599`) están claveadas por identidad, desalojadas LRU a `256` (`ThreeRenderer.ts:635`, `:1040`), marcadas `userData.vectoCached` para que `disposeActiveObjects` por frame (`ThreeRenderer.ts:380`) las omita, y `drawImage` re-inserta en hit para orden LRU (`ThreeRenderer.ts:641`). Las fuentes de canvas mutables deben llamar a `invalidateImage` (`ThreeRenderer.ts:602`).

## 3. Mapeo de coordenadas — UV → píxeles lógicos (y las tres trampas)

### 3.1 La entrada del raycast

```ts
// packages/three/src/ThreeAdapter.ts:181
public updateIntersection(raycaster: THREE.Raycaster, type, originalEvent?): boolean {
  const intersects = raycaster.intersectObject(this.mesh); // ThreeAdapter.ts:186
  if (intersects.length > 0 && hit.uv) {
    state.lastUv.copy(hit.uv);
    this.dispatchAtUv(type, hit.uv, pointerId, originalEvent);
  } else if (state.isHovering) {
    this.dispatchAtUv('pointerleave', state.lastUv, pointerId, originalEvent); // ThreeAdapter.ts:209
  }
}
```

El llamante posee el `Raycaster` — típicamente `raycaster.setFromCamera(ndc, camera)` donde `ndc` es `((clientX/width)*2-1, -((clientY/height)*2-1))`. Esa es la forma de `GraphInteraction.setPointerFromEvent` (`packages/graph3d/src/GraphInteraction.ts:157`) y del zoom de rueda de `GraphCamera` (`packages/graph3d/src/GraphCamera.ts:363`).

### 3.2 UV a píxeles de escena — lógicos, no backing store, con y invertida

```ts
// packages/three/src/ThreeAdapter.ts:240
private dispatchAtUv(type: VectoEvent, uv: THREE.Vector2, ...): void {
  const px = uv.x * this.vectoScene.width;        // ThreeAdapter.ts:251 — logical width
  const py = (1.0 - uv.y) * this.vectoScene.height; // ThreeAdapter.ts:253 — flip Three's bottom-origin
  this.dispatchAtPoint(type, px, py, ...);
}
```

Tres trampas, cada una detrás de un bug corregido:

1. **Lógico vs backing store (DPR)** — `canvas.width = logicalWidth * devicePixelRatio` en HiDPI (backing store de `CanvasRenderer`, boss 07 §DPR). El layout de entidades y `findEntityAt` son lógicos. Multiplicar `uv.x * canvas.width` desplaza cada hit `dpr`×. El comentario en `ThreeAdapter.ts:246` lo declara explícitamente; la entrada programática (`dispatchPointer`, `ThreeAdapter.ts:675`) toma `x,y` lógicos por la misma razón. `ThreeRenderer` tiene la trampa equivalente en la ruta scissor (`ThreeRenderer.ts:468` `dpr = renderer.getPixelRatio()`) y en la rasterización de fillText (`ThreeRenderer.ts:987`).
2. **Inversión Y** — el origen UV de Three es abajo-izquierda, el de Canvas es arriba-izquierda. `py = (1 - uv.y) * height` (`ThreeAdapter.ts:253`). `ThreeRenderer` des-invierte texturas por la misma razón (`ThreeRenderer.ts:628` `texture.flipY = false`, `ThreeRenderer.ts:1035` fillText).
3. **Clics fuera del panel** — un miss cuando `state.isHovering` sintetiza `pointerleave` en `lastUv` (`ThreeAdapter.ts:209`) y, en `pointerdown`, desenfoca el foco del panel (`ThreeAdapter.ts:214` `if (pointerdown && _focusedEntity) setFocusedEntity(null)`) — replicando cómo un clic en el fondo de la página mueve el foco del DOM.

### 3.3 El núcleo de despacho compartido

Tanto `updateIntersection` (UV de raycast) como `dispatchPointer` (píxeles lógicos, `ThreeAdapter.ts:675`) convergen en `dispatchAtPoint` (`ThreeAdapter.ts:262`):

```ts
private dispatchAtPoint(type, px, py, pointerId, originalEvent): boolean {
  this.vectoScene.markDirty();                          // ThreeAdapter.ts:270 — onDemand wake
  const hitEntity = this.vectoScene.findEntityAt(px, py); // ThreeAdapter.ts:273 — VMT hit test
  // hover transitions (ThreeAdapter.ts:277), pointerleave dedup (ThreeAdapter.ts:291),
  // then dispatchEventToTarget or canvas fallback (ThreeAdapter.ts:307)
  // then pointerdown focus (ThreeAdapter.ts:320)
}
```

`findEntityAt` es el mismo hit tester que usa la Scene en pantalla (`HitTester.ts:12`, boss 06), incluyendo gating `clipChildren` y bounds conscientes de rotación — sin ruta de hit específica 3D.

## 4. Enrutamiento de entrada — puntero, rueda, hover y multi-touch

### 4.1 Las transiciones de hover son por puntero

`activePointers: Map<number, PointerState>` (`ThreeAdapter.ts:101`) rastrea `{isHovering, lastUv, lastTargetId}` por `pointerId` (`ThreeAdapter.ts:64`). El `pointerId` se lee del `PointerEvent` original (`ThreeAdapter.ts:187`) o por defecto `1` para rutas programáticas/ratón. En `pointermove` el adaptador compara `lastTargetId` contra el `hitEntity.id` actual y emite `pointerleave` en la entidad anterior y `hover` en la nueva (`ThreeAdapter.ts:277`). En un `pointerleave` sintético (salida de malla) emite una vez vía `dispatchEventToTarget` y retorna `false` para suprimir el despacho fallback final que duplicaría el leave (`ThreeAdapter.ts:291` comentario + retorno temprano).

La historia aquí: el adaptador pre-corrección emitía `pointerleave` dos veces (una vía el `lastTargetId` rastreado, otra vía el fallback genérico en `lastUv`) y fugaba un leave a cualquier entidad que casualmente estuviera bajo `lastUv` tras salir el cursor (`vectojs-docs/forge/findings/renderer-and-gpu.md:620`).

### 4.2 Multi-touch / WebXR

Los contactos táctiles reciben `pointerId`s frescos y monótonamente crecientes. Sin poda, `activePointers` crecía una entrada por toque durante toda la vida del adaptador. `pruneEndedPointer` (`ThreeAdapter.ts:228`) elimina la entrada en `pointerup`/`pointercancel` después de que el despacho final la haya leído. `ThreeRenderer` tuvo la misma clase de fuga en `imageTextureCache`/`textTextureCache` (corregido con desalojo LRU en `ThreeRenderer.ts:635`).

`GraphCamera` tiene la guarda complementaria en la capa 3D: un arrastre activo posee su `pointerId` hasta su propio `pointerup`/`pointercancel` — un segundo contacto no debe sobrescribir `dragging`/`lastX`/`button` (`packages/graph3d/src/GraphCamera.ts:305`).

### 4.3 Rueda — sin valores neutros por defecto

`createDOMEvent` (`ThreeAdapter.ts:372`) ramifica en `type === 'wheel'`: se sintetiza un `WheelEvent` con `deltaX/Y/Z/deltaMode` copiados del `WheelEvent` original cuando existe, de lo contrario `0` (`ThreeAdapter.ts:381`). Los campos de puntero sintetizan `button/buttons/modifiers` con los mismos valores neutros por defecto que produce la ruta del raycaster cuando no se suministró evento original (doc `ThreeAdapter.ts:48` `ThreeAdapterPointerInit`). `dispatchPointer` explícitamente **no** cubre rueda (doc `ThreeAdapter.ts:664` — los deltas no tienen valores neutros por defecto; enruta la rueda por `updateIntersection` con el `WheelEvent` real).

Cada evento despachado lleva `clientX/clientY = px/py` (píxeles lógicos de escena) y propiedades no estándar `vectoSceneX/Y` (`ThreeAdapter.ts:412` `Object.defineProperties`) para que los handlers que necesiten espacio de escena no tengan que des-invertir ni des-escalar. `originalEvent` se reenvía como `VectoJSEvent.nativeEvent` (`ThreeAdapter.ts:364`) para que los handlers puedan leer `deltaMode`/`button` literalmente.

`ThreeAdapterPointerInit` (`ThreeAdapter.ts:54`) documenta los valores por defecto para la ruta programática: `button`/`buttons` 0, modificadores desactivados — indistinguible de la ruta del raycaster cuando no se suministra evento original. `ThreeAdapterPointerType` (`ThreeAdapter.ts:40`) es la unión cerrada que aceptan ambos puntos de entrada; `type` se ensancha a `VectoEvent` solo dentro de `dispatchAtPoint` (`ThreeAdapter.ts:263`).

### 4.4 Conducción programática vs conducción por raycast

Los dos puntos de entrada son intencionalmente simétricos pero no idénticos:

| entry                                                                | caller supplies                        | UV step                                                            | wheel                                    | use for                                  |
| -------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------- | ---------------------------------------- |
| `updateIntersection(raycaster, type, event)` (`ThreeAdapter.ts:181`) | `THREE.Raycaster` + DOM `Event`        | `raycaster.intersectObject(this.mesh)` → `hit.uv` → `dispatchAtUv` | yes — `WheelEvent` forwarded with deltas | live 3D pointer/wheel, VR controller ray |
| `dispatchPointer(type, x, y, init)` (`ThreeAdapter.ts:675`)          | logical `x,y` + optional `PointerInit` | none — `x,y` are already scene pixels                              | no — deltas have no neutral defaults     | tests, automation, headless              |

Ambos convergen en `dispatchAtPoint` (`ThreeAdapter.ts:262`) para que las transiciones de hover, foco, `markDirty` y la compuerta de despacho `isConnected` se comporten idénticamente. `dispatchPointer` es la única entrada que crea su propio `PointerEvent` (`ThreeAdapter.ts:690`) — debe hacerlo, porque no hay evento DOM de respaldo en el caso programático.

### 4.5 Fallback de canvas

Cuando `findEntityAt` retorna `null` (espacio muerto), el evento se despacha en el propio `this.canvas` (`ThreeAdapter.ts:312` `canvas.dispatchEvent(fallbackEvent)`). Para Scenes en pantalla esto burbujearía por los espejos a11y; para el adaptador offscreen permite que handlers a nivel de Scene aún observen clics de fondo (que luego desenfocan, ver §5).

## 5. Propiedad de foco y teclado — offscreen, por tanto sintético

### 5.1 Por qué el foco del panel no es `document.activeElement`

El canvas del adaptador nunca se añade a `document`, así que su `a11yRoot` (el contenedor que `Scene` crea para espejos) tampoco se conecta nunca. `getA11yElement(entity.id)` aún retorna un elemento real (`Scene.syncA11y` lo puebla de todos modos), pero `el.isConnected === false` permanentemente. Las APIs nativas que requieren un elemento conectado (`setPointerCapture`, `focus()` robusto) lanzan en tales elementos, así que el adaptador trata los espejos desconectados como ausentes.

El foco del panel es por tanto **estado del lado del adaptador**: `ThreeAdapter._focusedEntity` (`ThreeAdapter.ts:111`) con el comentario que explica la brecha y el puente sintético `FocusEvent`. Acceso vía getter `focusedEntity` (`ThreeAdapter.ts:441` — retorna `null` cuando está disposed) y `focus(entity|null)` / `blur()` (`ThreeAdapter.ts:458`).

### 5.2 Cómo se mueve el foco

- **Guiado por puntero** — tras despachar el evento, `pointerdown` enfoca el ancestro enfocable más cercano de la entidad golpeada (`ThreeAdapter.ts:321` `focusNearestFocusable(hit)`), o desenfoca en espacio muerto. `focusNearestFocusable` (`ThreeAdapter.ts:499`) recorre la cadena `hit.parent` y prueba `isFocusable` en cada nodo — así clicar un `<span>` dentro de un `<button>` enfoca el botón, igual que el DOM. Si nada en la cadena es enfocable, desenfoca (`ThreeAdapter.ts:506`). La transición de foco corre _después_ del evento para que los handlers observen el mundo de foco pre-clic, igual que el orden nativo `pointerdown`-luego-foco (comentario `ThreeAdapter.ts:319`).
- **Programático** — `focus(entity)` (`ThreeAdapter.ts:458`) acepta cualquier entidad (incluso no enfocable) para que tests/automatización puedan forzar el foco; la ruta de puntero es más estricta y solo enfoca lo que la proyección declara alcanzable.
- **Contrato `isFocusable`** (`ThreeAdapter.ts:478`) — verdadero cuando el espejo lleva `tabindex` (explícito `tabIndex` o el `0` implícito que core añade para roles ARIA interactivos) o renderiza como etiqueta nativamente enfocable (`button`/`input`/`textarea`/`select`/`a[href]`). Retrocede a valores crudos de `getA11yAttributes()` antes de la primera sincronización de proyección.

### 5.3 El puente sintético de FocusEvent

`setFocusedEntity` (`ThreeAdapter.ts:516`) despacha `FocusEvent('blur')` sintético en el espejo previo y `FocusEvent('focus')` en el siguiente cuando existen; de lo contrario hace `emit` directamente en la entidad. Esto deja que los listeners propios de core corran sin cambios: emits `focus`/`blur` de entidad, seguimiento `Scene.focusedA11yElement` y wake/cleanup del parpadeo del caret de `Input`. Cada transición también hace `markDirty()` para que los visuales de foco (caret, resaltado) repinten en modo `onDemand` (`ThreeAdapter.ts:529`).

### 5.4 Enrutamiento de teclado — `dispatchKey` y propiedad

```ts
// packages/three/src/ThreeAdapter.ts:573
public dispatchKey(key: string, mods: ThreeAdapterKeyModifiers = {}, phase: 'press'|'keydown'|'keyup' = 'press'): void {
  const init = { key, code: mods.code ?? ThreeAdapter.codeFor(key), ...mods, bubbles:true, cancelable:true };
  if (phase !== 'keyup') this.routeKeyEvent(new KeyboardEvent('keydown', init));
  if (phase !== 'keydown') this.routeKeyEvent(new KeyboardEvent('keyup', init));
}
```

`codeFor` (`ThreeAdapter.ts:597`) infiere `KeyboardEvent.code` desde `key`: letras a `Key<X>`, dígitos a `Digit<N>`, espacio a `Space`, otros se pasan tal cual — mejor esfuerzo porque `code` depende del layout.

`routeKeyEvent` (`ThreeAdapter.ts:610`) implementa cuatro reglas (doc en `ThreeAdapter.ts:536`):

1. **Sin foco de panel** — el evento va directo a `window`; el canal a nivel de escena de core (`Scene.ts:3351` `dispatchKeyboard`) aplica sus compuertas nativas (`defaultPrevented`, auto-repeat, `ownsKeyboard(document.activeElement)`). Los consumidores de cámara orbital y las entradas del host nunca se quedan sin eventos.
2. **Foco de panel, en el espejo** — despacho en el espejo enfocado para que el reenvío genérico de teclas de core y la activación Enter/Space `#694` se ejecuten. Si no existe espejo, `VectoJSEvent` en la entidad.
3. **Propiedad — detener** — si `entityOwnsKeyboard(focused)` (`ThreeAdapter.ts:643`) retorna verdadero (etiqueta `input`/`textarea`/`select`, o `role` en `KEYBOARD_OWNING_ROLES` de `Scene.ts:115` — `textbox`, `searchbox`, `spinbutton`, `option`, `listbox`, `button`, `link`, `tab`, `menuitem`, `slider`, `combobox`), el evento se consume; nada se fuga a `window`. El conjunto etiqueta+rol refleja `Scene.ownsKeyboard` (`Scene.ts:143`) y está documentado como intencionalmente unificado vía el set exportado.
4. **De lo contrario, burbujea a window** — a menos que `nativeEvent.defaultPrevented` o `cancelBubble` haya sido establecido por un handler de entidad, igual que el burbujeo de canvas conectado. Esa compuerta es por la que un handler de panel puede hacer `preventDefault()` en Enter para suprimir un atajo del host.

Este es el mecanismo detrás de la receta del skill `vectojs-three` (`.agents/skills/vectojs-three/references/three-recipes.md:60`) `adapter.focus(panel); adapter.dispatchKey('Enter')` y la guarda `isFocusable`.

## 6. Proyección semántica dentro de 3D — qué ve AT

En un canvas conectado, `Scene.syncA11y` proyecta `getA11yAttributes()` de cada entidad interactiva en un espejo DOM transparente y posicionado absolutamente (role, label, tabindex, bounds). Los lectores de pantalla y `getByRole` de Playwright accionan esos espejos. El hit-testing y los eventos despachados son preocupaciones separables: el `HitTester` de Scene (`HitTester.ts:12`) es la autoridad de hit, mientras los espejos son el transporte de despacho (`Scene.ts:3512` listeners por espejo) — una distinción de la que depende el puente offscreen.

Dentro de `ThreeAdapter` los espejos se crean idénticamente — `Scene` no sabe que el canvas es offscreen — pero nunca se conectan a `document`. Consecuencias:

- **AT invisible por defecto** — un panel `CanvasTexture` no está en el árbol a11y de la página. Si la escena 3D necesita alcanzabilidad AT, el host debe renderizar un overlay 2D de la misma Scene o exponer el panel vía una Scene separada y conectada. El adaptador no inventa esto; preserva el contrato de proyección 2D y deja la estructura de página del host 3D al host. Este es el valor por defecto correcto: una textura no tiene semántica DOM.
- **Fallback de despacho — `isConnected` es crítico** — `dispatchEventToTarget` (`ThreeAdapter.ts:330`) comprueba `a11yEl && a11yEl.isConnected` (`ThreeAdapter.ts:349`). Los espejos conectados reciben un `PointerEvent`/`WheelEvent` real despachado sobre ellos para que widgets nativamente vinculados (p. ej. un `<input>` proyectado que llama a `setPointerCapture`, o la ruta `focus()` por entidad que llama a `a11yEl.focus()` en `ThreeAdapter.ts:360`) funcionen con el despacho nativo del navegador. Los espejos desconectados toman el fallback: `new VectoJSEvent(type, entity, originalEvent, …, {x,y})` burbujeado por el árbol virtual (`ThreeAdapter.ts:363`). El comentario en `ThreeAdapter.ts:341` explica el modo de fallo — un elemento desconectado lanza en `setPointerCapture` y `focus()` es no-op — así que enrutar por el fallback no es una elección de estilo, es una compuerta de correctitud.
- **Los eventos de puntero no están controlados por `pointerEvents: 'none'` en descendientes** — el hit test del adaptador es `findEntityAt` sobre Scene, no hit-testing CSS. La semántica `pointerEvents: 'none'` que importa en la página 2D (boss 03, interacción `ScrollView` `pointerEvents: 'none'`) no afecta la ruta 3D; solo la ruta de espejo 2D la respeta. En la ruta del adaptador el hit ya está resuelto antes de intentar cualquier despacho DOM.
- **El foco refleja la misma división** — `setFocusedEntity` despacha en el espejo cuando `isConnected` y hace `emit` en la entidad en caso contrario (`ThreeAdapter.ts:516`); ambas rutas accionan los mismos listeners de core ( `focus`/`blur` de entidad, `Scene.focusedA11yElement`, parpadeo del caret) para que los handlers `onFocus` no necesiten ramificar.

`ThreeRenderer` no tiene preocupación de proyección — es un renderer, no una Scene — así que no tiene ninguna ruta a11y. Una Scene respaldada por `ThreeRenderer` aún proyecta por la capa a11y 2D normal de `Scene` porque el renderer nunca toca el `a11yRoot`.

Observa la diferencia en los dos lados de la rama de despacho del adaptador (`ThreeAdapter.ts:341` vs `ThreeAdapter.ts:363`):

```ts
// Connected mirror — real DOM dispatch, native capture/focus work
a11yEl.dispatchEvent(domEvent); // ThreeAdapter.ts:351
if (type === 'pointerdown' && (a11yEl instanceof HTMLInputElement || …)) a11yEl.focus();

// Disconnected mirror — virtual-tree bubble, no DOM
entity.dispatchEvent(new VectoJSEvent(type, entity, originalEvent, …, { x, y })); // ThreeAdapter.ts:363
```

## 7. La contraparte puramente Three — familia `Graph3D`

`@vectojs/graph3d` muestra cómo se ve un consumidor 3D sin adaptador — sin `ThreeAdapter`, sin Scene, sin proyección a11y. Es la referencia de dónde el adaptador hace y no hace falta.

| pieza                                | rol                                                                                                                           | archivo clave:línea                                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `Graph3D`                            | instanced presentation: one `InstancedMesh` for nodes + one `LineSegments` for links under a single `group` (`Graph3D.ts:30`) | `Graph3D.ts:28` group, `Graph3D.ts:115` InstancedMesh, `Graph3D.ts:136` LineSegments                                         |
| `GraphCamera`                        | 2D ortho vs 3D perspective pan/zoom/orbit controls                                                                            | `GraphCamera.ts:73` GraphCamera, `GraphCamera.ts:200` setSize zoom fix, `GraphCamera.ts:354` wheel zoom-about-cursor         |
| `GraphInteraction`                   | `Raycaster` + NDC → `pickNode` → hover/select/drag-to-pin                                                                     | `GraphInteraction.ts:83` GraphInteraction, `GraphInteraction.ts:157` setPointerFromEvent, `GraphInteraction.ts:246` pickNode |
| `VectoForceLayout` / `D3ForceLayout` | layout contract feeding `Float32Array` positions to `applyPositions`                                                          | `packages/graph3d/src/layout/`                                                                                               |

Invariantes notables que reflejan trampas del adaptador:

- **`setGraphData` lanza antes de mutar** — los extremos de enlaces se resuelven vía `indexById` (`Graph3D.ts:80`) y se validan (throw en `Graph3D.ts:90`) antes de `clearMeshes()` (`Graph3D.ts:99`) o de adjuntar cualquier malla, así un grafo rechazado deja la escena intacta (doc `Graph3D.ts:73`, entrada `forge 2026-08-13`).
- **`applyPositions` custodia NaN** — `positions.length < nodeCount*3` aborta antes de escribir, advierte una vez por `setGraphData` (`Graph3D.ts:162` `hasWarnedShortPositions`, reset en `Graph3D.ts:100`) y omite la actualización para evitar matrices de instancia NaN y una esfera delimitadora NaN que haría frustum-cull de toda la malla (doc `Graph3D.ts:148`). No se necesita comprobación de límites por enlace porque `setGraphData` validó cada extremo.
- **`pickNode` es consciente de instancias** — `raycaster.intersectObject(nodeMesh)` filtrado a `h.instanceId != null` (`Graph3D.ts:248`), retornando el índice `GraphData.nodes` alineado con el layout.
- **Corrección de doble aplicación de zoom en `GraphCamera.setSize`** — el frustum permanece en semiextensiones sin zoom; solo `camera.zoom` porta el zoom (comentario `GraphCamera.ts:200`: hornear el zoom en el frustum _y_ establecer `camera.zoom` hacía la extensión visible `1/zoom²` y sacaba el grafo de vista).
- **Captura de puntero en `GraphInteraction`** — `setPointerCapture` en `domElement` en `pointerdown` (`GraphInteraction.ts:284`) y vía `window` `pointerup`/`pointercancel` (`GraphInteraction.ts:135`) para que un release fuera del canvas aún termine el arrastre y re-habilite los controles del host; `dispose()` a mitad de arrastre ejecuta la ruta de finalización (`GraphInteraction.ts:314`).

## 8. Trampas y escollos (con file:line)

| trampa                                                | dónde                                                              | síntoma                                                                                   | corregido / estado                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| UV × backing store instead of logical size            | `ThreeAdapter.ts:246` comment                                      | every hit off by `dpr`× down/right on HiDPI                                               | fixed — use `vectoScene.width/height`                                   |
| Y not flipped                                         | `ThreeAdapter.ts:253`                                              | hits mirrored vertically                                                                  | fixed — `(1-uv.y)*height`                                               |
| A11y mirror dispatched while disconnected             | `ThreeAdapter.ts:349` `isConnected`                                | `setPointerCapture` throws, `focus()` no-ops                                              | fixed — fallback to `VectoJSEvent`                                      |
| Duplicate `pointerleave` on mesh exit                 | `ThreeAdapter.ts:291` early return                                 | entity hit twice, neighbour leaked a leave                                                | fixed `ThreeAdapter.ts:291` skip trailing dispatch (`forge 2026-08-13`) |
| `activePointers` grew per tap                         | `ThreeAdapter.ts:228` `pruneEndedPointer`                          | unbounded Map, WebXR/multi-touch                                                          | fixed — delete on `pointerup`/`pointercancel`                           |
| Wheel has no neutral defaults                         | `ThreeAdapter.ts:664` doc                                          | `dispatchPointer('wheel',…)` would synthesize wrong deltas                                | by design — use `updateIntersection` with real `WheelEvent`             |
| Off-panel `pointerdown` didn't blur                   | `ThreeAdapter.ts:214`                                              | panel kept focus after clicking empty 3D space                                            | fixed — blur on outside `pointerdown`                                   |
| `render` proxy not restored on dispose                | `ThreeAdapter.ts:113` `_originalRender`                            | `needsUpdate` on deleted `CanvasTexture` → `THREE.Texture: trying to use deleted texture` | fixed `ThreeAdapter.ts:730`                                             |
| Canvas zeroed though caller-supplied                  | `ThreeAdapter.ts:122` `_ownsCanvas`                                | caller’s canvas blanked after dispose                                                     | fixed — only zero when owned                                            |
| `ThreeRenderer` `FrontSide` culled under y-down ortho | `ThreeRenderer.ts:250` camera, `ThreeRenderer.ts:596` `DoubleSide` | `fillCircle`/fills/gradients/drawImage invisible                                          | fixed (`forge 2026-08-13`, `ThreeRenderer.ts:596`)                      |
| `drawImage` vertically flipped                        | `ThreeRenderer.ts:628` `flipY = false`                             | every blitted image upside-down                                                           | fixed (`forge 2026-08-23`, `ThreeRenderer.ts:478`)                      |
| `LineBasicMaterial.linewidth` ignored                 | `ThreeRenderer.ts:110` `buildStrokeRibbon`                         | every stroke hairline                                                                     | fixed — ribbon geometry                                                 |
| `fillText` parsed weight as size                      | `ThreeRenderer.ts:274` `parseFontSize`                             | bold text 700px tall, baseline `fontSize/2` low                                           | fixed (`forge 2026-08-13 #486`, `ThreeRenderer.ts:274` + `:831`)        |
| `Graph3D` half-built on bad link id                   | `Graph3D.ts:73`                                                    | nodes attached, links missing, stale scales                                               | fixed `Graph3D.ts:80` resolve-first                                     |
| `applyPositions` undersized array → NaN               | `Graph3D.ts:148`                                                   | nodes vanish, frustum blank                                                               | fixed `Graph3D.ts:162` guard + latched warn                             |
| `GraphInteraction` dispose mid-drag                   | `GraphInteraction.ts:314`                                          | host controls stuck disabled                                                              | fixed — `finishDrag` in `dispose`                                       |
| `GraphCamera` double-zoom on resize                   | `GraphCamera.ts:200`                                               | zoom `1/zoom²`, graph snaps out                                                           | fixed — frustum stays unzoomed                                          |

## 9. Recetas — cuándo usar cada ruta

**Panel en una escena 3D (HUD, dashboard, pantalla VR):**

```ts
// .agents/skills/vectojs-three/references/three-recipes.md:10 + :24
import { ThreeAdapter } from '@vectojs/three';
import { Button, Stack, Text } from '@vectojs/ui';
const adapter = new ThreeAdapter({ width: 800, height: 500 });
const panel = new Stack({ direction: 'vertical', gap: 16 });
panel.add(new Text('VectoJS in 3D', { font: '700 28px Inter' }));
adapter.vectoScene.add(panel);
adapter.vectoScene.start();
scene3d.add(adapter.mesh);
// pointer routing — raycaster owns the 3D hit, adapter owns the 2D dispatch
const handled = adapter.updateIntersection(raycaster, type, event);
if (handled) event.preventDefault();
```

- Llama a `adapter.updateIntersection(raycaster, type, event)` desde listeners de `window`/`document`, pasando el `PointerEvent`/`WheelEvent` real para que el estado de botón/modificador y los deltas de rueda se reenvíen. Cuando `handled` es verdadero el hit 3D fue consumido — haz `preventDefault()` del evento host para que la página no haga scroll/seleccione debajo.
- Usa `adapter.dispatchPointer(type, x, y)` (`ThreeAdapter.ts:675`) para tests/automatización — píxeles lógicos, misma ruta descendente que el raycaster, pero la rueda permanece en la ruta del raycaster (sin delta neutro que sintetizar, `ThreeAdapter.ts:664`).
- Foco: `adapter.focus(entity)` / `adapter.blur()` (`ThreeAdapter.ts:458`), consulta con `adapter.isFocusable(entity)` (`ThreeAdapter.ts:478`). Teclado: `adapter.dispatchKey('Enter')` (`ThreeAdapter.ts:573`) — pulsación completa por defecto, o `dispatchKey('a', {shiftKey:true}, 'keydown')` para teclas mantenidas. El foco acciona la compuerta `ownsKeyboard` que decide si las teclas se fugan a `window`.
- Resize: `adapter.resize(w, h)` (`ThreeAdapter.ts:713`) cuando el canvas host o el tamaño del panel cambia; Scene no sigue a `window` (`ThreeAdapter.ts:140` `disableWindowResize`).
- Teardown: `scene3d.remove(adapter.mesh); adapter.dispose()` (`ThreeAdapter.ts:723`) — restaura el proxy de render (`ThreeAdapter.ts:730`), libera textura/geometría/material, retira la malla, destruye Scene, limpia punteros/foco.

**Grafo 3D sin panel 2D:**

Usa `Graph3D` + `GraphCamera` + `GraphInteraction` directamente — sin adaptador. `Graph3D.group` se añade a la escena host, `GraphCamera` posee la cámara y sus propios listeners `pointerdown/move/up/wheel` (`GraphCamera.ts:150`), y `GraphInteraction` posee `pointermove/down` en `domElement` más `window` `pointerup/cancel` para arrastre fuera. Conéctalos con el getter `() => graphCamera.camera` para que `setMode('2d'|'3d')` permanezca vivo (`GraphInteraction.ts:5` `GraphInteractionCamera`).

**El host posee la cámara (p. ej. `OrbitControls` + grafo):**

Pasa `setControlsEnabled` (`GraphInteraction.ts:53`) para que un arrastre de nodo deshabilite los controles de cámara durante el arrastre. El mismo patrón aplica a un panel adaptador que comparte canvas con una escena 3D: controla la compuerta de `updateIntersection` del panel cuando la cámara arrastra y viceversa.

## 10. Preguntas abiertas y horizonte XR

- **Entrega de sesión XR** — los controladores WebXR producen rayo `select`/`squeeze` + `XRInputSource`, no `PointerEvent`. El mapa `pointerId` del adaptador (`ThreeAdapter.ts:101`) ya generaliza a multi-puntero, pero el host debe sintetizar `Raycaster` desde la vista XR + pose de entrada y llamar a `updateIntersection` por fuente de entrada. Aún no existe helper `XRRaycaster`.
- **Dos paneles, un canvas** — `updateIntersection` hace hit-test de una única `mesh` (`ThreeAdapter.ts:186` `intersectObject(this.mesh)`). Dos adaptadores en una escena Three.js necesitan raycast por adaptador o un `intersectObjects([a.mesh, b.mesh])` compartido con despacho por `hit.object`. El estado hover por `pointerId` es por adaptador, así que `pointerleave` entre paneles ya está aislado.
- **AT para paneles 3D** — como señala §6, los espejos offscreen son AT-invisibles. Un despliegue solo XR o WebGL que necesite AT debe mantener una Scene 2D conectada (o un overlay DOM) sincronizada — el adaptador no resuelve esto porque el árbol a11y de la página está fuera del alcance de una textura.
- **SSR / OffscreenCanvas** — `ThreeAdapter.ts:130` retrocede a un objeto `{width,height}` cuando `document` es undefined. `THREE.CanvasTexture` aún espera una fuente tex-image; los hosts que pre-renderizan en el servidor necesitan un `OffscreenCanvas` real o una construcción diferida del adaptador.

## 11. Checklist antes de enviar un cambio en esta área

- [ ] **Sin `uv.x * canvas.width`.** Cada ruta UV→píxel usa `vectoScene.width/height` (lógico), no `canvas.width/height` (backing store). Busca `canvas\.width` en `packages/three/src/ThreeAdapter.ts`.
- [ ] **Y está invertida.** `py = (1 - uv.y) * height` (`ThreeAdapter.ts:253`); las texturas que hacen blit en la escena son `flipY = false` (`ThreeRenderer.ts:628`, `:1035`).
- [ ] **`updateIntersection` y `dispatchPointer` convergen.** La nueva semántica de entrada va en `dispatchAtPoint` (`ThreeAdapter.ts:262`) para que las rutas de raycast y programática no diverjan.
- [ ] **Compuerta `isConnected` preservada.** `dispatchEventToTarget` (`ThreeAdapter.ts:349`) comprueba `a11yEl.isConnected` antes de despachar a un espejo; el fallback `VectoJSEvent` debe permanecer para el caso offscreen.
- [ ] **Foco de panel puenteado.** Cada transición `setFocusedEntity` despacha `FocusEvent`s sintéticos en espejos y hace `markDirty()` (`ThreeAdapter.ts:516`); el foco `pointerdown` recorre ancestros `isFocusable` (`ThreeAdapter.ts:499`).
- [ ] **Propiedad de teclado unificada.** `entityOwnsKeyboard` (`ThreeAdapter.ts:643`) usa el mismo conjunto `KEYBOARD_OWNING_ROLES` que `Scene.ownsKeyboard` (`Scene.ts:115`, `Scene.ts:143`); añadir un rol a uno debe actualizar el otro.
- [ ] **`hover` vs `pointermove` preservado.** `dispatchAtPoint` mapea transiciones hover de `pointermove` a `hover` en la nueva entidad y `pointerleave` en la anterior (`ThreeAdapter.ts:277`); cambiar el nombre del evento rompe handlers `Entity.on('hover',…)`.
- [ ] **Dedup de `pointerleave` intacto.** El `pointerleave` sintético de salida de malla (`ThreeAdapter.ts:291`) no debe caer al despacho genérico — el `return false` es crítico.
- [ ] **`activePointers` podado.** `pruneEndedPointer` (`ThreeAdapter.ts:228`) en `pointerup`/`pointercancel` tanto en `updateIntersection` como en `dispatchPointer` (más topes LRU de `ThreeRenderer`).
- [ ] **`needsUpdate` controlado.** El proxy de render (`ThreeAdapter.ts:157`) solo establece `needsUpdate` cuando Scene repintó; semántica `resize`/`dispose` (`_ownsCanvas`, `_originalRender`) intacta.
- [ ] **Guardas `Graph3D` vigentes.** `setGraphData` resuelve enlaces antes de mutar (`Graph3D.ts:80`), `applyPositions` aborta con arrays cortos (`Graph3D.ts:162`), `GraphInteraction` limpia a mitad de arrastre (`GraphInteraction.ts:314`).

## Relaciones

- **Boss 06 (runtime del VMT)** posee `Scene`, `Entity`, `findEntityAt`, `focusedA11yElement` y el cableado `WASM_UPLOAD_REJECT_LIMIT` / versión de estructura que el adaptador reutiliza.
- **Boss 07 (renderer)** posee `IRenderer`, los topes DPR/backing-store de `CanvasRenderer`, el orto y-down, scissor y el batching `present()` vs `flush()` que tanto `ThreeAdapter` (vía `CanvasRenderer`) como `ThreeRenderer` (como `IRenderer`) heredan.
- **Boss 11 (graph layout)** posee los kernels de fuerza que alimentan `Graph3D.applyPositions`; el quadtree 2D de `@vectojs/graph-layout` (`BarnesHutQuadtree.ts`) permanece solo JS mientras `crates/vectojs-force-rs` acelera el octree 3D.
- **Boss 08 (WASM)** comparte los valores de viewport y `appliedDPR` de `Scene`; una vista typed-array obsoleta tras crecimiento de memoria es el análogo de caché de textura de este boss.

## References

- `packages/three/src/ThreeAdapter.ts:1` — adapter: offscreen canvas, `CanvasTexture`, render proxy, raycast + programmatic input, panel focus/keyboard
- `packages/three/src/ThreeRenderer.ts:1` — `IRenderer` via Three.js: y-down ortho, ribbon strokes, gradient shader, DPR, caches, `present()`/`dispose()`
- `packages/three/src/index.ts:1` — public barrel (`ThreeAdapter`, `ThreeRenderer`)
- `packages/graph3d/src/Graph3D.ts:1` — instanced nodes + line links, `setGraphData` resolve-first, `applyPositions` guard, `pickNode`
- `packages/graph3d/src/GraphCamera.ts:1` — ortho/perspective camera + pan/zoom/orbit, `setSize` zoom fix, wheel-zoom-about-cursor
- `packages/graph3d/src/GraphInteraction.ts:1` — `Raycaster` + NDC, `pointerId` hover/drag-to-pin, `window` up/cancel, `setControlsEnabled`
- `packages/core/src/tree/Scene.ts:115` `KEYBOARD_OWNING_ROLES` / `Scene.ts:143` `ownsKeyboard` / `Scene.ts:1446` `focusedA11yElement` / `Scene.ts:3512` per-mirror dispatch — the 2D ownership the adapter mirrors
- `.agents/skills/vectojs-three/references/three-recipes.md:1` — panel, pointer, wheel, programmatic and dispose recipes
- `vectojs-docs/forge/findings/renderer-and-gpu.md:1` — renderer/gpu findings (DPR, `FrontSide` cull, `flipY`, hairline, cache leaks, projection traps)
