+++
title = "@vectojs/graph3d"
description = "Visualización de grafos 3D con fuerza dirigida: una interfaz GraphLayout conectable más un renderizador Three.js con instanciado que dibuja cualquier grafo en dos llamadas de dibujo."
weight = 44
+++

# `@vectojs/graph3d`

Versión documentada: **0.6.1**

Visualización de grafos 3D con fuerza dirigida para VectoJS: un contrato `GraphLayout` conectable (apto para workers, posiciones como un único `Float32Array` plano) más `Graph3D`, un renderizador Three.js con instanciado que dibuja cualquier grafo — sin importar cuántos nodos — en exactamente dos llamadas de dibujo. Consulta la demo en vivo de [Les Misérables](/demos/graph3d/) para ver el conjunto de datos canónico de 77 nodos y 254 enlaces en movimiento.

## Instalación

```bash
bun add @vectojs/graph3d three
```

`three` es una dependencia par — `@vectojs/graph3d` dibuja dentro de un `THREE.Group` que agregas a tu propia escena, y no gestiona el `WebGLRenderer`, la cámara ni los controles por sí mismo.

## Uso

```ts
import { VectoForceLayout, Graph3D } from '@vectojs/graph3d';
import * as THREE from 'three';

const data = {
  nodes: [{ id: 'vectojs', val: 8, color: '#4f9cff' }, { id: 'core' }, { id: 'ui' }],
  links: [
    { source: 'vectojs', target: 'core' },
    { source: 'vectojs', target: 'ui' },
  ],
};

const layout = new VectoForceLayout();
layout.setGraph(data);

const graph = new Graph3D();
graph.setGraphData(data);
scene.add(graph.group);

function animate() {
  const active = layout.step();
  graph.applyPositions(layout.positions);
  renderer.render(scene, camera);
  if (active) requestAnimationFrame(animate);
}
animate();
```

`layout.step()` devuelve `false` una vez que la simulación se ha enfriado (alpha por debajo del umbral) — el ejemplo anterior detiene su propio bucle rAF en ese momento, pero un llamante que permita al usuario ajustar las fuerzas en vivo (intensidad de carga, distancia de enlace) debería seguir renderizando cada fotograma independientemente y solo controlar la llamada `step()`/`applyPositions()` de la física con esa bandera, para que la amortiguación de `OrbitControls` y el movimiento de la cámara se mantengan suaves incluso después de que la disposición se estabilice.

`VectoForceLayout` (el layout propio con octree Barnes-Hut, sin dependencia en tiempo de ejecución) es el predeterminado; [`D3ForceLayout`](/reference/graph3d-layout/#d3forcelayout) sigue estando disponible pero requiere `d3-force-3d`. Ambos son intercambiables de forma directa detrás del mismo contrato `GraphLayout`.

## GraphCamera

Desde 0.4.0, `GraphCamera` es una cámara + controles todo incluido para anfitriones que no traen sus propios controles de Three.js: una vista ortográfica 2D de paneo/zoom y una vista de órbita en perspectiva 3D detrás de un único getter `camera`.

```ts
import { GraphCamera } from '@vectojs/graph3d';

const camera = new GraphCamera({ domElement: canvas, mode: '3d' }); // '2d' (ortho) is the default
camera.fitToPositions(layout.positions); // frame the graph; skips non-finite points
camera.setMode('2d'); // switch to orthographic pan/zoom
camera.setSize(width, height); // call on canvas resize
camera.dispose(); // remove pointer/wheel listeners
```

`mode: '2d' | '3d'` selecciona el tipo de cámara; `fitToPositions(positions)` encuadra un búfer de tripletes xyz (la misma forma que consume [`applyPositions`](/reference/graph3d-renderer/#métodos)). Combínalo con `GraphInteraction` pasando `() => camera.camera` (un getter, para que `setMode` siga en vivo) y conectando `setControlsEnabled` para que un arrastre de nodo no también desplace la vista.

## Kernel de fuerza WASM

`VectoForceLayout` incluye un kernel de fuerza Rust/WASM opcional (`crates/vectojs-force-rs`, publicado como un `vectojs_force.wasm` co-ubicado) que acelera la construcción del octree Barnes-Hut + la acumulación de repulsión — el 78–90% medido de un tick. Ante cualquier fallo de carga/instanciación devuelve silenciosamente `false` y conserva el Barnes-Hut en JS idéntico bit a bit, por lo que es seguro habilitarlo de forma especulativa.

```ts
import { forceWasmUrl } from '@vectojs/graph3d/wasm';

await layout.enableWasmForce(forceWasmUrl); // streaming (browser): URL | Response
layout.enableWasmForceSync(bytes); // raw bytes (Node/tests), never fetches
```

El kernel no tiene dependencia de `@vectojs/core` — `three` sigue siendo la única dependencia par. Consulta [`VectoForceLayout`](/reference/graph3d-layout/#vectoforcelayout) para la API completa de layout, incluyendo la opción de perfilado `measurePhases`.

## Páginas de referencia

| Página                                                        | Cubre                                                                                                                                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/) | El modelo de datos `GraphData`, el contrato `GraphLayout` apto para workers, las opciones de `VectoForceLayout` (predeterminado) y `D3ForceLayout`, el kernel WASM y el patrón de reinicio de fuerzas. |
| [`Graph3D` y selección](/reference/graph3d-renderer/)         | El renderizador Three.js con instanciado (`setGraphData`/`applyPositions`/`pickNode`/`getNodePosition`/`dispose`) más `GraphInteraction` — hover, seleccionar y arrastrar para fijar.                  |

---

## Notas de diseño

- **Apto para workers por construcción.** La interfaz `GraphLayout` existe específicamente para que una simulación física pueda ejecutarse fuera del hilo principal — `positions` es un `Float32Array`, transferible a través de un límite `postMessage` con cero copias, y `Graph3D.applyPositions()` nunca necesita saber si ese búfer provino de una llamada síncrona o de un mensaje de un worker.
- **La separación renderizador/disposición es total.** `Graph3D` nunca importa una clase de layout y una implementación de `GraphLayout` nunca importa Three.js — cambiar `VectoForceLayout` por `D3ForceLayout`, una disposición estática/precalculada sin simulación alguna, o un futuro adaptador `ngraph` es un cambio de una línea en el sitio de llamada.
- **Tarjetas de nodo interactivas en el mundo y componentes HUD** construidos sobre `@vectojs/ui` y [`@vectojs/three`](/reference/three/) (carteles de escena a textura que siguen funcionando en WebXR) son la siguiente capa planificada sobre este paquete — aún no publicada.

## Páginas recomendadas del sitio de documentación

- **Aprender / Visualización de grafos 3D** — separación entre layout y renderizador, ajuste de fuerzas de `VectoForceLayout`, selección y layouts alojados en workers.
- **Referencia / API** — [`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/), [`Graph3D` y selección](/reference/graph3d-renderer/).
