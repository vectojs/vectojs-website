+++
title = "ThreeAdapter"
description = "Renderiza una escena de VectoJS en un canvas, la expone como un THREE.CanvasTexture y conecta eventos de puntero (incluyendo controladores WebXR y multi-touch) mediante raycasting UV."
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
  type: 'pointerdown' | 'pointerup' | 'pointermove' | 'wheel' | 'click',
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

### `dispose()`

```ts
dispose(): void
```

Desecha idempotentemente el `THREE.CanvasTexture`, la geometría y el material de la malla, desengancha la malla, restaura el método de renderizado de la Scene, destruye el `VectoScene` y limpia todo el estado por puntero. Un canvas creado por el adaptador se libera a `0×0`; un canvas proporcionado por el llamante conserva sus dimensiones.

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
