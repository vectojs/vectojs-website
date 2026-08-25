+++
title = "ThreeAdapter"
description = "Renderiza una escena de VectoJS en un canvas, la expone como un THREE.CanvasTexture y conecta eventos de puntero (incluyendo controladores WebXR y multi-touch) además del foco del panel y el enrutamiento de teclado mediante raycasting UV."
weight = 42
+++

# `ThreeAdapter`

Parte de [`@vectojs/three`](/reference/three/).

`ThreeAdapter` usa el `canvas` proporcionado, o crea uno cuando se omite. Renderiza una `Scene` de VectoJS en ese canvas, envuelve el resultado como un `THREE.CanvasTexture`, y te entrega un `THREE.Mesh` listo para usar (un `PlaneGeometry` unitario con un `MeshBasicMaterial`). Los eventos de puntero y scroll desde tus listeners de eventos de Three.js se traducen de vuelta a coordenadas lógicas de VectoJS mediante raycasting.

Úsalo cuando tengas una escena 3D y quieras un panel de UI 2D flotando sobre una superficie — el resto de tu escena Three.js no se toca, y mantienes el renderizado Canvas 2D. Para usar Three.js como backend de renderizado de la propia `Scene`, consulta [`ThreeRenderer`](/reference/three-renderer/).

## Constructor

```ts
new ThreeAdapter(options: ThreeAdapterOptions)
```

```ts
interface ThreeAdapterOptions {
  width: number; // ancho lógico de la escena UI 2D (px CSS)
  height: number; // alto lógico (px CSS)
  canvas?: HTMLCanvasElement; // canvas preexistente opcional; el adaptador crea uno si se omite
  sceneOptions?: SceneOptions; // reenviado al constructor de VectoScene
}
```

`disableWindowResize` se fuerza a `true` internamente independientemente de lo que pases en `sceneOptions` — el adaptador controla el redimensionamiento a través de `resize(w, h)`, no la ventana.

## Propiedades públicas

| Propiedad    | Tipo                  | Descripción                                                                                                                                       |
| ------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `texture`    | `THREE.CanvasTexture` | La textura que envuelve el canvas de VectoJS. Establece `needsUpdate = true` automáticamente después de cada fotograma de renderizado de VectoJS. |
| `vectoScene` | `VectoScene`          | La instancia activa de `Scene` de VectoJS. Agrega entidades a esta.                                                                               |
| `canvas`     | `HTMLCanvasElement`   | El canvas propiedad del adaptador o proporcionado por el llamante sobre el que VectoJS dibuja.                                                    |
| `mesh`       | `THREE.Mesh`          | Malla preconstruida `PlaneGeometry(1, 1)` + `MeshBasicMaterial` lista para colocar en tu escena Three.js.                                         |

## Métodos

### `updateIntersection(raycaster, type, originalEvent?)`

```ts
updateIntersection(
  raycaster: THREE.Raycaster,
  type: 'pointerdown' | 'pointerup' | 'pointermove' | 'pointercancel' | 'wheel' | 'click',
  originalEvent?: PointerEvent | WheelEvent
): boolean
```

Lanza el rayo contra la malla del adaptador, traduce el impacto UV a coordenadas del canvas de VectoJS y despacha el evento en la escena de VectoJS. Devuelve `true` cuando el rayo intersectó la malla.

El estado de los botones del puntero y `shiftKey`/`ctrlKey`/`altKey`/`metaKey` se preservan; los eventos de rueda además preservan todos los deltas y teclas modificadoras.

Llama a esto desde tu bucle de renderizado de Three.js o desde los listeners de eventos de puntero. El adaptador mantiene el estado de hover por `pointerId` para que los controladores WebXR y las entradas multi-touch tengan contextos de hover/foco independientes.

**Reasignación UV**: las coordenadas UV de Three.js tienen Y=0 en la parte inferior de un plano; VectoJS tiene Y=0 en la parte superior. El adaptador invierte el eje Y automáticamente — no necesitas ajustar las coordenadas.

### `resize(width, height)`

```ts
resize(width: number, height: number): void
```

Redimensiona el canvas y el `VectoScene` lógico subyacente. Llámalo cuando cambie la resolución de renderizado del panel o el viewport de layout 2D; cambiar solo la escala en espacio mundial de la malla no requiere esto.

## Foco del panel y entrada de teclado (0.1.10+)

El canvas del adaptador es externo a la pantalla, así que sus espejos de accesibilidad proyectados nunca pueden convertirse en `document.activeElement` y el modelo de foco del navegador no los alcanza. El adaptador llena ese hueco con el **foco del panel**: estado del lado Three, impulsado por la interacción del puntero y `focus()`, consumido por el enrutamiento de teclas, y cada transición se puentea mediante `FocusEvent` sintéticos para que el estado del lado core (emisión de `focus`/`blur` de entidad, despertar del parpadeo del caret) coincida con un canvas conectado.

```ts
adapter.focusedEntity: Entity | null // read-only — the entity holding panel focus
adapter.focus(entity: Entity | null): void // move focus, or blur with null
adapter.blur(): void // release panel focus
adapter.isFocusable(entity: Entity): boolean // projects as keyboard-reachable?
```

`isFocusable` es el análogo del lado del panel de la tababilidad del DOM: verdadero cuando el espejo proyectado lleva un atributo `tabindex` o se representa como una etiqueta nativamente enfocable (`button`/`input`/`textarea`/`select`/`a[href]`). Un pointerdown enfoca el ancestro enfocable más cercano del hit — hacer clic en un `<span>` dentro de un botón enfoca el botón, y una cadena de hits que no proyecte nada alcanzable provoca blur.

### `dispatchKey(key, mods?, phase?)`

```ts
dispatchKey(
  key: string,
  mods?: { ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; metaKey?: boolean; code?: string },
  phase?: 'press' | 'keydown' | 'keyup', // default 'press' — synthesizes keydown+keyup
): void
```

El equivalente de teclado de `updateIntersection`: sintetiza un evento de tecla y lo enruta por la misma ruta de despacho que usaría un canvas conectado. Reglas de enrutamiento, en orden:

1. **Foco del panel** — cuando una entidad mantiene el foco del panel, el evento se despacha en su espejo proyectado, de modo que los propios listeners del core se ejecutan sin cambios: los manejadores `keydown`/`keyup` de la entidad lo reciben, y los controles proyectados mantienen su contrato de activación (`Enter` al pulsar, `Space` al soltar).
2. **Propiedad** — mientras la entidad enfocada sea un _propietario de teclado_, el panel posee las teclas exclusivamente y nada se filtra a la página. Los propietarios son entidades que proyectan una etiqueta `input`/`textarea`/`select` o un rol del `KEYBOARD_OWNING_ROLES` del core: los roles interactivos (`button`, `switch`, `checkbox`, `radio`, `link`, `tab`, `menuitem`, `slider`, `combobox`) más los roles de teclado primero `textbox`, `searchbox`, `spinbutton`, `option` y `listbox`. Las flechas mueven un slider en lugar de orbitar tu cámara; teclear llega a un cuadro de texto en lugar de disparar atajos de página.
3. **Reenvío de canal** — de lo contrario el evento continúa hacia `window`, donde el canal de teclas a nivel de escena aplica sus compuertas nativas (`defaultPrevented`, auto-repetición de teclas, `ownsKeyboard(document.activeElement)`), de modo que los atajos de la escena y los consumidores a nivel de página lo ven salvo que un propietario de teclado a nivel de página tenga el foco. Un manejador de entidad que llame a `preventDefault()` sobre el evento sintético suprime el reenvío, igual que el burbujeo de un canvas conectado.
4. **Sin foco del panel** — el evento va directo a `window` y las mismas compuertas deciden.

`code` usa por defecto una inferencia de mejor esfuerzo (`'a'` → `'KeyA'`, `' '` → `'Space'`, dígitos → `'DigitN'`). Pasa `mods.code` para cubrir los diseños que la inferencia no puede nombrar.

### `dispatchPointer(type, x, y, init?)`

```ts
dispatchPointer(
  type: 'pointerdown' | 'pointerup' | 'pointercancel' | 'pointermove' | 'click',
  x: number, // logical scene-space X (origin top-left)
  y: number, // logical scene-space Y
  init?: { pointerId?: number; button?: number; buttons?: number;
           ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; metaKey?: boolean },
): boolean // whether the point hit an entity
```

Sintetiza entrada de puntero en **coordenadas lógicas de escena** — el espacio del que hablan el layout de entidades y `findEntityAt`. El evento fluye por la ruta descendente idéntica a la de un `updateIntersection` dirigido por raycasting: las transiciones de hover, el despacho de entidades, el foco impulsado por pointerdown y la programación de suciedad de textura se comportan igual, lo que lo convierte en el punto de entrada para pruebas y automatizaciones que no tienen raycaster. La entrada de rueda deliberadamente no está cubierta — los deltas de la rueda no tienen valores neutros predeterminados, así que enruta esos a través de `updateIntersection` con el `WheelEvent` real.

### `dispose()`

```ts
dispose(): void
```

Desecha idempotentemente el `THREE.CanvasTexture`, la geometría y el material de la malla, desengancha la malla, restaura el método de renderizado de la Scene, destruye el `VectoScene` y limpia todo el estado por puntero (el foco del panel muere con la escena). Un canvas creado por el adaptador se libera a `0×0`; un canvas proporcionado por el llamante conserva sus dimensiones.

## Ejemplo completo

El siguiente ejemplo renderiza un panel de configuración de VectoJS sobre un plano giratorio en una escena Three.js. Los eventos de puntero de los listeners DOM `pointermove`, `pointerdown` y `pointerup` se reenvían a VectoJS mediante `updateIntersection`.

```ts
import * as THREE from 'three';
import { ThreeAdapter } from '@vectojs/three';
import { Text, Button, Stack } from '@vectojs/ui';

// --- Configuración de la escena Three.js ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const threeScene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 3);

// --- Adaptador de panel VectoJS (512×256 píxeles lógicos, mostrado en un plano 2×1) ---
const adapter = new ThreeAdapter({ width: 512, height: 256 });

const heading = new Text('Settings', {
  font: '600 24px Inter',
  color: '#f8fafc',
});
const applyBtn = new Button('Apply', { width: 120, height: 40 });
applyBtn.on('click', () => console.log('apply clicked'));

const stack = new Stack({ direction: 'vertical', gap: 20 });
stack.add(heading);
stack.add(applyBtn);
stack.setPosition(20, 20);
adapter.vectoScene.add(stack);

adapter.vectoScene.start();

// --- Colocar la malla en la escena Three.js ---
const panel = adapter.mesh;
panel.scale.set(2, 1, 1); // tamaño en espacio mundial coincide con la relación de aspecto 2:1
threeScene.add(panel);

// --- Raycaster para la traducción de eventos ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function updatePointer(event: PointerEvent) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

window.addEventListener('pointermove', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'pointermove', e);
});

window.addEventListener('pointerdown', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'pointerdown', e);
});

window.addEventListener('pointerup', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'pointerup', e);
});

window.addEventListener('click', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'click', e);
});

window.addEventListener('wheel', (e) => {
  updatePointer(e as unknown as PointerEvent);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'wheel', e);
});

// --- Bucle de renderizado ---
function animate() {
  requestAnimationFrame(animate);
  panel.rotation.y += 0.005;
  renderer.render(threeScene, camera);
}

animate();

// --- Limpieza ---
window.addEventListener('unload', () => adapter.dispose());
```

## Cómo funciona el adaptador internamente

El constructor modifica `vectoScene.render` para establecer `texture.needsUpdate = true` después de cada fotograma de VectoJS. Three.js luego sube el canvas a la GPU en la siguiente llamada a `renderer.render()`. No se requiere sondeo ni sincronización manual.

Las coordenadas UV del raycast se mapean al espacio de coordenadas **lógico** de la escena (`vectoScene.width`/`height` — las dimensiones que pasaste al constructor), no al tamaño físico del backing store del canvas del adaptador. La distinción importa en pantallas HiDPI: el `CanvasRenderer` de `@vectojs/core` escala el backing store por `devicePixelRatio` para un renderizado nítido (`canvas.width = logicalWidth × dpr`), mientras que el layout de entidades y las pruebas de impacto se mantienen lógicos.

> [!WARNING] > **En `@vectojs/three` ≤ 0.1.1, el mapeo UV usaba el tamaño físico del canvas** — por lo que en cualquier pantalla o nivel de zoom del navegador donde `devicePixelRatio ≠ 1`, cada evento de puntero aterrizaba debajo/a la derecha del cursor exactamente por el factor DPR. El síntoma es distintivo: los clics activan un control _más abajo en el panel_ que el que está bajo el cursor, con el desplazamiento creciendo cuanto más profundo en el panel está el objetivo — mientras se comporta perfectamente en pantallas con DPR-1 y en entornos de prueba headless. Corregido en **0.1.2**; actualiza en lugar de buscar soluciones alternativas.

Los eventos de impacto despachados por `updateIntersection` se reenvían al elemento DOM de accesibilidad de la entidad cuando existe **y está conectado a un documento vivo** (lo que los enruta a través de la capa de sombra de accesibilidad y dispara `click`/`change` en componentes interactivos), o directamente como objetos `VectoJSEvent` en caso contrario.

> [!NOTE]
> Con el canvas creado por el adaptador por defecto, los paneles toman la ruta directa de `VectoJSEvent` porque el canvas y su raíz de accesibilidad están desconectados. Si proporcionas un canvas que está conectado a `document`, sus elementos de accesibilidad conectados pueden usar la ruta de despacho DOM. Las versiones 0.1.1 y posteriores de `@vectojs/three` verifican la conectividad en lugar de asumir cualquiera de los casos.
>
> **Esto importa para la corrección de `Toggle`/`Button`, no solo para evitar un error.** En la versión 0.1.0 de `@vectojs/three`, un elemento de accesibilidad desconectado podía tomar incorrectamente la rama de despacho DOM y perder silenciosamente el callback del componente. Las versiones 0.1.1 y posteriores enrutan los elementos desconectados directamente. El comportamiento nativo de foco DOM/IME/lector de pantalla no está disponible para el canvas desconectado por defecto, pero sigue siendo posible cuando un canvas proporcionado por el llamante y su capa de proyección están conectados.

## WebXR y multi-touch

`updateIntersection` rastrea el estado de hover por `pointerId` tomado de `originalEvent`. En una sesión WebXR, cada controlador tiene su propio `pointerId`, por lo que hacer hover con un controlador no interfiere con el estado del otro. Pasa el `XRInputSourceEvent` sin procesar envuelto en un `PointerEvent` sintético con la `handedness` del `inputSource` del controlador codificada como `pointerId` (0 para izquierdo, 1 para derecho) para mantener un estado de impacto independiente.

```ts
// Ejemplo WebXR — reenvío mínimo de eventos de controlador
session.addEventListener('selectstart', (xrEvent) => {
  const synth = new PointerEvent('pointerdown', {
    pointerId: xrEvent.inputSource === leftController ? 0 : 1,
  });
  raycaster.setFromCamera(controllerUV, camera);
  adapter.updateIntersection(raycaster, 'pointerdown', synth);
});
```

## Relacionados

[`ThreeRenderer`](/reference/three-renderer/) (el caso de uso alternativo — Three.js como backend de renderizado de la `Scene`) ·
[`Scene`](/reference/core-scene/) (`vectoScene`) ·
[`@vectojs/three` visión general](/reference/three/)
