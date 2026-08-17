+++
title = "Graph3D y selección"
description = "El renderizador Three.js con instanciado que dibuja cualquier grafo en dos llamadas de dibujo, más el patrón de raycasting para la selección de nodos por hover/click."
weight = 46
+++

# `Graph3D` y selección

Parte de [`@vectojs/graph3d`](/reference/graph3d/). Consume el búfer de `positions` de un
[`GraphLayout`](/reference/graph3d-layout/).

Versión documentada: **0.6.0**

## `Graph3D` — el renderizador

```ts
new Graph3D(options?: Graph3DOptions)

interface Graph3DOptions {
  nodeRadius?: number;   // radio base del nodo antes del escalado por val. Por defecto 4.
  nodeSegments?: number; // teselación de la esfera (segmentos de ancho/alto). Por defecto 12.
  nodeColor?: string;    // color de respaldo para nodos que no declaran ninguno. Por defecto '#4f9cff'.
  linkColor?: string;    // color de la línea de enlace. Por defecto '#9aa4b2'.
  linkOpacity?: number;  // opacidad de la línea de enlace. Por defecto 0.35.
}
```

### Propiedad pública

```ts
graph.group: THREE.Group // agrega esto a tu escena; posee la malla de nodos + las líneas de enlace
```

### Métodos

```ts
setGraphData(data: GraphData): void
// Reconstruye los recursos de GPU para un nuevo grafo: un InstancedMesh (nodeCount
// instancias de una SphereGeometry compartida, color por instancia + escala ∛val) y
// un LineSegments (linkCount segmentos). Los búferes instanciados tienen tamaño fijo, por lo que
// un cambio en el conteo de nodos/enlaces significa mallas nuevas — los cambios solo de estilo en la
// MISMA topología son lo suficientemente económicos como para no necesitar una ruta separada. Un punto
// final de enlace desconocido (un id source/target no presente en `data.nodes`) lanza una excepción
// en lugar de dibujar silenciosamente una línea hacia el origen.

applyPositions(positions: Float32Array): void
// Escribe tripletes xyz (ej. el `.positions` de un GraphLayout) en las matrices de nodos
// instanciados y los puntos finales de enlace. Llama después de cada paso del layout que haya movido
// algo; suficientemente económico para llamar cada fotograma mientras se ejecuta una simulación.
// Si `positions.length < nodeCount * 3`, devuelve sin escribir nada y advierte una vez
// (bloqueado por cada `setGraphData`), de modo que un búfer demasiado corto nunca pueda
// escribir transformaciones NaN y dejar en blanco toda la malla.

pickNode(raycaster: THREE.Raycaster): number | null   // desde 0.2.0
// Prueba de impacto solo en la nube de nodos con un raycaster configurado por el llamante (establecido desde
// la cámara + NDC del puntero) y devuelve el índice del nodo impactado más cercano — alineado
// con el array `GraphData.nodes` — o `null` si no hay impacto. Los enlaces nunca se
// seleccionan, por lo que un rayo que roza una línea de enlace reporta un fallo.

getNodePosition(index: number, target: THREE.Vector3): THREE.Vector3 | null   // desde 0.2.0
// Lee la posición mundial actual de un nodo (tal como fue escrita por última vez por applyPositions)
// directamente desde su matriz de instancia hacia `target`. `null` para un índice
// fuera de rango o cuando la malla del nodo no existe.

dispose(): void
// Libera los recursos de GPU de geometría/material/malla tanto para la malla de nodos como para las
// líneas de enlace, y vacía `group`.
```

Un `InstancedMesh` para cada nodo (color por instancia y radio proporcional a `∛val`) más un `LineSegments` para cada enlace, ambos bajo un único `THREE.Group` — el objetivo del instanciado es que el tamaño del grafo cueste exactamente **dos llamadas de dibujo**, ya sea que el grafo tenga 10 nodos o 10,000. `Graph3D` consume cualquier búfer de posiciones con forma de [`GraphLayout`](/reference/graph3d-layout/) y no tiene idea de cómo se calcularon esos números, lo que mantiene los layouts intercambiables (o alojados en workers) sin tocar el código de renderizado.

Las líneas de enlace establecen `frustumCulled = false` — los puntos finales se mueven en cada tick del layout, y recalcular los límites por fotograma para lo que típicamente es un elemento de fondo es trabajo desperdiciado en comparación con simplemente dibujarlos siempre.

## Selección (hover / click)

Desde 0.2.0, `pickNode()` prueba impacto **solo** en la nube de nodos, por lo que ya no necesitas hacer manualmente `intersectObjects` + filtrado de `instanceId` contra los hijos mixtos de nodos/enlaces. Configura un `THREE.Raycaster` desde la cámara y el NDC del puntero, luego lee el índice del nodo impactado (alineado con `GraphData.nodes`):

```ts
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;

  raycaster.setFromCamera(ndc, camera);
  const index = graph.pickNode(raycaster); // number | null; los enlaces nunca coinciden
  const node = index !== null ? data.nodes[index] : null;
});
```

## `GraphInteraction` — hover / seleccionar / arrastrar para fijar

Desde 0.2.0, `GraphInteraction` envuelve el manejo de puntero anterior en hover, seleccionar y arrastrar para fijar — la pieza que toda aplicación de grafo 3D interactivo reconstruiría manualmente. Posee tres listeners de puntero en `domElement` y nada más: ninguna escena, ningún bucle de renderizado, ningún control. El anfitrión sigue manejando su propio bucle de animación y `step()` del layout.

```ts
const interaction = new GraphInteraction({
  graph, // el Graph3D
  camera, // la cámara desde la que se construyen los rayos de selección
  domElement: canvas, // elemento del que se leen los eventos de puntero
  layout, // GraphLayout; requerido para arrastrar y fijar (necesita pinNode)
  nodeCount: data.nodes.length, // guardia de índice opcional
  onHover: (i) => {
    /* i: number | null */
  },
  onSelect: (i) => {
    /* click que no fue un arrastre; null = deseleccionar espacio vacío */
  },
  setControlsEnabled: (enabled) => (controls.enabled = enabled), // suspende OrbitControls durante el arrastre
});
// …más tarde
interaction.dispose(); // elimina los listeners de puntero
```

El arrastre se **detecta por característica**: sin un layout capaz de fijar (una implementación de `pinNode`, como la que proporcionan [`VectoForceLayout` y `D3ForceLayout`](/reference/graph3d-layout/)) una pulsación recurre a la selección. `onDragStart`/`onDrag`/`onDragEnd`, `pinOnDrag` (por defecto `true`), `dragReheat` (por defecto `0.3`) y `dragThreshold` (por defecto `4` px) completan las opciones.

## Relacionados

[`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/) (produce el búfer de `positions` que esto consume, y el `pinNode` del que depende arrastrar para fijar) ·
[`GraphCamera`](/reference/graph3d/#graphcamera) (controles de cámara 2D/3D todo incluido) ·
[`@vectojs/graph3d` visión general](/reference/graph3d/)
