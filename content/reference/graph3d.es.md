+++
title = "@vectojs/graph3d"
description = "Visualización de grafos 3D con fuerza dirigida: una interfaz GraphLayout conectable más un renderizador Three.js con instanciado que dibuja cualquier grafo en dos llamadas de dibujo."
weight = 44

[extra]
order = 44
+++

# `@vectojs/graph3d`

Versión documentada: **0.2.1**

Visualización de grafos 3D con fuerza dirigida para VectoJS: un contrato `GraphLayout` conectable (apto para workers, posiciones como un único `Float32Array` plano) más `Graph3D`, un renderizador Three.js con instanciado que dibuja cualquier grafo — sin importar cuántos nodos — en exactamente dos llamadas de dibujo. Consulta la demo en vivo de [Les Misérables](/demos/graph3d/) para ver el conjunto de datos canónico de 77 nodos y 254 enlaces en movimiento.

## Instalación

```bash
bun add @vectojs/graph3d three
```

`three` es una dependencia par — `@vectojs/graph3d` dibuja dentro de un `THREE.Group` que agregas a tu propia escena, y no gestiona el `WebGLRenderer`, la cámara ni los controles por sí mismo.

## Uso

```ts
import { D3ForceLayout, Graph3D } from '@vectojs/graph3d';
import * as THREE from 'three';

const data = {
  nodes: [{ id: 'vectojs', val: 8, color: '#4f9cff' }, { id: 'core' }, { id: 'ui' }],
  links: [
    { source: 'vectojs', target: 'core' },
    { source: 'vectojs', target: 'ui' },
  ],
};

const layout = new D3ForceLayout();
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

## Páginas de referencia

| Página                                                        | Cubre                                                                                                                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/) | El modelo de datos `GraphData`, el contrato `GraphLayout` apto para workers, las opciones de `D3ForceLayout` y el patrón de reinicio de fuerzas.                                      |
| [`Graph3D` y selección](/reference/graph3d-renderer/)         | El renderizador Three.js con instanciado (`setGraphData`/`applyPositions`/`pickNode`/`getNodePosition`/`dispose`) más `GraphInteraction` — hover, seleccionar y arrastrar para fijar. |

---

## Notas de diseño

- **Apto para workers por construcción.** La interfaz `GraphLayout` existe específicamente para que una simulación física pueda ejecutarse fuera del hilo principal — `positions` es un `Float32Array`, transferible a través de un límite `postMessage` con cero copias, y `Graph3D.applyPositions()` nunca necesita saber si ese búfer provino de una llamada síncrona o de un mensaje de un worker.
- **La separación renderizador/disposición es total.** `Graph3D` nunca importa una clase de layout y una implementación de `GraphLayout` nunca importa Three.js — cambiar `D3ForceLayout` por un futuro adaptador `ngraph`, o por una disposición estática/precalculada sin simulación, es un cambio de una línea en el sitio de llamada.
- **Tarjetas de nodo interactivas en el mundo y componentes HUD** construidos sobre `@vectojs/ui` y [`@vectojs/three`](/reference/three/) (carteles de escena a textura que siguen funcionando en WebXR) son la siguiente capa planificada sobre este paquete — aún no publicada.

## Páginas recomendadas del sitio de documentación

- **Aprender / Visualización de grafos 3D** — separación entre layout y renderizador, ajuste de fuerzas de `D3ForceLayout`, selección y layouts alojados en workers.
- **Referencia / API** — [`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/), [`Graph3D` y selección](/reference/graph3d-renderer/).
