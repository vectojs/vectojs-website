+++
title = "@vectojs/graph-layout"
description = "Layout de fuerzas 2D independiente del renderizador y sin dependencias, con repulsión Barnes-Hut, actualizaciones incrementales de topología, manejo de colisiones y fijación en tiempo de ejecución."
weight = 47
+++

# `@vectojs/graph-layout`

Versión documentada: **0.3.0**

`@vectojs/graph-layout` es una simulación de fuerzas 2D sin dependencias. No posee ningún renderizador ni temporizador de animación: el anfitrión proporciona los datos del grafo, llama a `step()` y lee coordenadas XY intercaladas de un `Float32Array`. El mismo layout puede impulsar Canvas 2D, SVG, WebGL, WebGPU, una escena de VectoJS o un renderizador fuera del hilo principal.

La versión 0.3.0 tiene una única implementación, el `ForceLayout2D` en TypeScript. No hay compilación WASM, backend alternativo ni opción `backend` en 0.3.0. WASM sigue siendo una opción futura condicionada a mediciones; las comparaciones entre dimensiones de navegador actuales no son evidencia directa de que un backend WASM ayudaría.

## Instalación

```bash
bun add @vectojs/graph-layout
```

El paquete no tiene dependencia par de runtime ni de renderizador.

## Ejemplo de Canvas 2D

Este ejemplo usa IDs de cadena arbitrarios y resuelve sus índices de posición actuales a través del layout. Los IDs numéricos también son identificadores; no asumas que un ID numérico equivale a su índice de nodo actual.

```ts
import { ForceLayout2D, type GraphData } from '@vectojs/graph-layout';

const canvas = document.querySelector('canvas');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Canvas not found');

const context = canvas.getContext('2d');
if (!context) throw new Error('Canvas 2D is unavailable');

const graph: GraphData = {
  nodes: [{ id: 'center', fx: 0, fy: 0 }, { id: 'left' }, { id: 'right' }],
  links: [
    { source: 'center', target: 'left' },
    { source: 'center', target: 'right' },
  ],
};

const layout = new ForceLayout2D({
  collisionRadius: 8,
  linkDistance: 48,
});
layout.setGraph(graph);

function draw(): void {
  const active = layout.step();
  const positions = layout.positions;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);

  context.beginPath();
  for (const link of graph.links) {
    const sourceIndex = layout.getNodeIndex(link.source);
    const targetIndex = layout.getNodeIndex(link.target);
    if (sourceIndex === undefined || targetIndex === undefined) continue;
    const source = sourceIndex * 2;
    const target = targetIndex * 2;
    context.moveTo(positions[source], positions[source + 1]);
    context.lineTo(positions[target], positions[target + 1]);
  }
  context.stroke();

  for (let index = 0; index < layout.nodeCount; index++) {
    context.beginPath();
    context.arc(positions[index * 2], positions[index * 2 + 1], 5, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();

  if (active) requestAnimationFrame(draw);
}

draw();
```

`step()` es síncrono. Devuelve `true` mientras la simulación permanece activa y `false` después de haberse enfriado por debajo de `alphaMin` (o cuando el grafo está vacío). El valor de retorno indica si la física necesita otro tick; no dice nada sobre si tu aplicación debería seguir renderizando para el movimiento de cámara, la entrada u otra animación. Un `alphaDecay` no positivo se rechaza en la construcción y recurre al valor por defecto, por lo que una simulación no vacía siempre se asienta por sí sola.

## Tipos públicos

El paquete exporta los siguientes tipos y `ForceLayout2D` desde su raíz:

```ts
type NodeId = string | number;
type LinkId = NodeId;

interface GraphNode {
  id: NodeId;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
  [key: string]: unknown;
}

interface GraphLink {
  source: NodeId;
  target: NodeId;
  id?: NodeId;
  [key: string]: unknown;
}

interface GraphData {
  nodes: readonly GraphNode[];
  links: readonly GraphLink[];
}

type NodeValue = number | ((node: GraphNode, index: number) => number);
type LinkValue = number | ((link: GraphLink, index: number) => number);

interface ForceLayout2DOptions {
  repulsion?: NodeValue;
  collisionRadius?: NodeValue;
  collisionStrength?: number;
  linkDistance?: LinkValue;
  linkStrength?: LinkValue;
  centerStrength?: number;
  velocityDecay?: number;
  theta?: number;
  repulsionDistanceMax?: number;
  alphaDecay?: number;
  alphaMin?: number;
  seed?: number;
}
```

Los campos extra de nodos y enlaces permanecen propiedad de la aplicación. El layout no muta los registros de entrada.

## Opciones

| Opción                 | Por defecto | Significado                                                                                                       |
| ---------------------- | ----------: | ----------------------------------------------------------------------------------------------------------------- |
| `repulsion`            |       `300` | Magnitud no negativa de repulsión de muchos cuerpos por nodo.                                                     |
| `collisionRadius`      |         `0` | Radio no negativo por nodo. Dos nodos de radio cero no se separan.                                                |
| `collisionStrength`    |         `1` | Multiplicador no negativo de corrección de colisión. Cero desactiva la corrección de colisión.                    |
| `linkDistance`         |        `30` | Longitud de reposo no negativa por enlace.                                                                        |
| `linkStrength`         |       `0.3` | Rigidez de muelle no negativa por enlace.                                                                         |
| `centerStrength`       |      `0.02` | Atracción no negativa hacia el origen.                                                                            |
| `velocityDecay`        |       `0.6` | Retención de velocidad por tick, limitada por debajo de `1`.                                                      |
| `theta`                |       `0.9` | Ángulo de apertura Barnes-Hut no negativo. Valores más bajos cambian velocidad por precisión; `0` recorre exacto. |
| `repulsionDistanceMax` |  `Infinity` | Distancia máxima a la que los nodos se repelen. Un valor no positivo significa sin corte (igual que `Infinity`).  |
| `alphaDecay`           |    `0.0228` | Decaimiento de temperatura por tick, limitado a `[0, 1]`; un valor no positivo recurre al valor por defecto.      |
| `alphaMin`             |     `0.001` | Temperatura no negativa por debajo de la cual la simulación está asentada.                                        |
| `seed`                 |         `1` | Semilla determinista para nodos sin coordenadas iniciales finitas.                                                |

Los valores de opción no finitos recurren a sus valores por defecto. Los valores documentados como no negativos se limitan a cero, con dos excepciones deliberadas que recurren en lugar de limitar: un `alphaDecay` no positivo toma el valor por defecto `0.0228` (un `0` literal haría del decaimiento por tick una no-op y la simulación nunca se asentaría), y un `repulsionDistanceMax` no positivo significa sin corte (antes apagaba la repulsión por completo). Los accessors de nodos y enlaces se evalúan una vez cuando cada registro se acepta en el layout, no en cada tick. Los índices de los accessors de nodo son índices de inserción. Los índices de los accessors de enlace son índices estables y contiguos a lo largo del paginado de solo adición. Eliminar nodos compacta los enlaces, por lo que una adición posterior puede reutilizar un índice previamente asignado a un enlace eliminado. Eliminar nodos no reevalúa los accessors de los supervivientes; usa un nuevo `setGraph()` si los valores deben derivarse de nuevo. Todas las opciones son solo del constructor; no hay setters de fuerza en vivo en 0.3.0.

## API

```ts
class ForceLayout2D {
  constructor(options?: ForceLayout2DOptions);

  positions: Float32Array;
  nodeCount: number;

  getNodeIndex(id: NodeId): number | undefined;
  getNodeId(index: number): NodeId | undefined;
  getNodeIds(): readonly NodeId[];
  setGraph(data: GraphData): void;
  appendGraph(data: GraphData): void;
  removeNodes(ids: Iterable<NodeId>): void;
  removeLinks(items: Iterable<GraphLink | LinkId>): void;
  updateLinks(links: readonly GraphLink[]): void;
  step(iterations?: number): boolean;
  setNodePin(id: NodeId, pin: { x?: number; y?: number }): void;
  clearNodePin(id: NodeId, axes?: { x?: boolean; y?: boolean }): void;
  pinNode(id: NodeId, x: number, y: number): void;
  unpinNode(id: NodeId): void;
  reheat(alpha?: number): void;
  dispose(): void;
}
```

### Posiciones y avance

`positions` contiene `[x0, y0, x1, y1, ...]` en el orden de nodo actual. Es una vista en vivo: el layout actualiza sus valores in situ a lo largo de las llamadas a `step()`. Llama a `layout.positions.slice()` cuando necesites una instantánea inmutable.

El objeto de vista no es estable a través de límites de topología. Vuelve a adquirir siempre `layout.positions` después de `setGraph()`, `appendGraph()` o `removeNodes()`; añadir más allá de la capacidad interna también reasigna el almacenamiento de respaldo. Los índices de nodo pueden cambiar después de una eliminación porque los supervivientes se compactan conservando su orden relativo.

Usa `getNodeIndex(id)` para resolver un ID a su índice actual y `getNodeId(index)` para la búsqueda inversa. Ambos devuelven `undefined` cuando ningún nodo actual coincide. `getNodeIds()` devuelve una instantánea en el orden de posición actual; mutar ese array no afecta al layout. Los índices existentes permanecen estables a lo largo de las actualizaciones de solo adición, mientras que la eliminación compacta a los supervivientes.

`step(iterations = 1)` realiza hasta esa cantidad de ticks síncronos y devuelve `true` si alpha sigue siendo al menos `alphaMin` después. Se detiene temprano al enfriarse. Los conteos de iteración no positivos o no finitos no realizan ticks y reportan el estado activo actual; los conteos se redondean hacia abajo y se limitan a 10,000 por llamada.

### Reemplazar, añadir y eliminar nodos

`setGraph(data)` reemplaza todo el estado, siembra determinísticamente el nuevo grafo y establece alpha en `1`. Cada ID de nodo debe ser una cadena o un número finito y debe ser único; los IDs inválidos o duplicados lanzan antes de que se borre el grafo existente.

`appendGraph(data)` conserva las posiciones, velocidades y fijaciones existentes. Los nodos cuyos IDs son inválidos, ya presentes o repetidos en esa adición se ignoran, lo que hace que las páginas reproducidas sean idempotentes. Los nodos aceptados se añaden en el orden de entrada. Los enlaces aceptados pueden apuntar a nodos existentes o a nodos aceptados en la misma llamada. Un cambio de topología recalienta monótonamente: puede elevar alpha pero nunca baja una simulación ya caliente.

Los enlaces son seguros frente a reproducción por par de extremos dirigido más `id` opcional:

- Sin `id`, los enlaces `source` a `target` repetidos son un solo enlace.
- La dirección importa: `a` a `b` y `b` a `a` tienen identidades diferentes.
- Los enlaces paralelos necesitan IDs de cadena o número finito distintos; las pilas de grafo tratan los enlaces paralelos como aristas distintas en lugar de rechazarlos.
- Reproducir un enlace identificado se ignora.
- Un ID de enlace opcional malformado se trata como ausente a efectos de identidad.

La validación de extremos es estricta y uniforme: un enlace cuyos extremos referencian un nodo desconocido o el mismo nodo dos veces hace que `setGraph()` y `appendGraph()` lancen, y `appendGraph()` valida todo el lote antes de mutar, así que una llamada rechazada deja el grafo anterior intacto (las referencias hacia adelante a nodos aceptados en el mismo lote siguen siendo válidas). Esto coincide con la política de `updateLinks()` — los enlaces colgantes antes se descartaban silenciosamente, lo que escondía errores de datos como estructura misteriosamente ausente. Los enlaces con IDs opcionales malformados siguen entrando como enlaces no identificados cuando sus extremos son válidos. Los datos de enlace malformados no hacen que las posiciones sean no finitas.
`removeNodes(ids)` elimina los nodos coincidentes y cada enlace incidente, compacta el estado de los supervivientes, recalcula el sesgo de grado y recalienta cuando se eliminó algo. Los IDs desconocidos y un iterable vacío son no-ops.

### Eliminar y actualizar enlaces

`removeLinks(items)` elimina enlaces sin cambiar ningún índice, posición, velocidad o fijación de nodo. Pasa un enlace completo para coincidir con sus extremos dirigidos más el ID opcional, o pasa un `LinkId` simple para eliminar cada enlace identificado que lleve ese ID. Los enlaces supervivientes conservan su orden y sus valores de accessor en caché. Las identidades desconocidas y ya eliminadas son no-ops. Un lote exitoso recalcula el sesgo de grado de enlace y recalienta una vez.

`updateLinks(links)` reevalúa los accessors `linkDistance` y `linkStrength` para las identidades existentes coincidentes. Úsalo después de cambiar campos de enlace propiedad de la aplicación consumidos por esos accessors. El lote completo se valida primero: los extremos desconocidos o idénticos lanzan sin aplicar ninguna actualización. Una identidad que no está ya presente se ignora. Debido a que los extremos participan en la identidad del enlace, reenrutar requiere `removeLinks()` seguido de `appendGraph()`. Los valores sin cambios no recalientan la simulación.

### Fijar y recalentar

Los valores finitos iniciales `fx` y `fy` fijan ejes de forma independiente. Un nodo puede, por tanto, tener X fija con Y libre, Y fija con X libre, o ambos ejes fijos. Los `x` y `y` iniciales solo siembran sus correspondientes ejes no fijados.

En tiempo de ejecución, `setNodePin(id, { x?, y? })` fija solo los ejes proporcionados, actualiza inmediatamente esas coordenadas en vivo y limpia su velocidad. `clearNodePin(id, { x?, y? })` libera los ejes seleccionados conservando el otro eje; omitir el objeto de ejes libera ambos. `pinNode(id, x, y)` y `unpinNode(id)` siguen siendo métodos de conveniencia de ambos ejes. Los IDs desconocidos se ignoran.

**Las fijaciones se direccionan por ID** (0.3.0) como cualquier otra referencia a nodo en esta clase, de modo que siguen apuntando al mismo nodo tras la compactación de `removeNodes()` — una fijación direccionada por índice cambiaría silenciosamente de objetivo al nodo que entrara en ese hueco. Nota de divergencia para código portado entre pilas: el contrato de la familia [`GraphLayout`](/reference/graph3d-layout/) 3D fija por **índice** de nodo en su lugar, y el manejo de aristas paralelas también difiere — los consumidores de este paquete rechazan cuádruples de extremos duplicados (`duplicate-link` del node-editor) mientras que las pilas graph/knowledge tratan los enlaces paralelos como aristas distintas. Traduce fijaciones e identidad de enlaces al cruzar de pila.

Estas llamadas no recalientan automáticamente, así que llama a `reheat()` después de operaciones interactivas de fijar o liberar.

`reheat(alpha = 0.3)` limita la solicitud a `[alphaMin, 1]` y aplica `max(currentAlpha, requestedAlpha)`. Nunca enfría una simulación más caliente.

### Arrastrar un nodo: recalentar una vez, no por movimiento

El defecto más común relacionado con el arrastre es llamar a `reheat()` en **cada movimiento del puntero** mientras se arrastra un nodo fijado. Eso mantiene alpha fijado cerca de su máximo, de modo que los vecinos del nodo arrastrado — tironeados por sus muelles de enlace — siguen sobrepasándose con casi ningún amortiguamiento. La simulación necesita entonces varios segundos para enfriarse después de soltar el puntero (alpha decae a ~`alphaDecay` por tick, aproximadamente 300 ticks ≈ 5 s a 60 fps), durante los cuales todo el vecindario vibra visiblemente. Con una etiqueta de texto renderizada en cada nodo, esa oscilación rápida se lee como temblor e imagen residual/ghosting.

El patrón correcto es recalentar solo cuando el arrastre _comienza_, y luego actualizar la posición de la fijación en cada movimiento sin recalentar:

```ts
function onDragStart(node, x, y) {
  layout.setNodePin(node.id, { x, y }); // pin at the pointer
  layout.reheat(0.3); // wake the simulation ONCE
}

function onDragMove(node, x, y) {
  layout.setNodePin(node.id, { x, y }); // move the pin — no reheat here
}

function onDragEnd(node) {
  layout.clearNodePin(node.id); // or keep it pinned for a permanent pin
}
```

Si un seguimiento que deriva lentamente se siente deseable _durante_ el arrastre, eleva `velocityDecay` (más amortiguamiento) en lugar de recalentar en cada movimiento; reserva `reheat()` para cambios de topología, activaciones explícitas y el inicio del arrastre.

### Liberación de recursos

`dispose()` libera el almacenamiento del grafo y del quadtree, restablece `positions` a un array vacío y es idempotente. Después de la liberación, cualquier otro método lanza `ForceLayout2D was disposed`; crea una nueva instancia en lugar de intentar reutilizar la antigua.

## Complejidad y capacidad

Para `N` nodos y `E` enlaces aceptados, un tick normal construye un quadtree Barnes-Hut y evalúa la repulsión en `O(N log N)` esperado, aplica los muelles en `O(E)`, y sanea, centra e integra en `O(N)`. Así, el coste usual de un tick sin colisiones es `O(N log N + E)`. Esto no es una promesa de peor caso: distribuciones espaciales patológicas o `theta: 0` pueden acercarse al trabajo de todos los pares.

Cuando la colisión está habilitada, el layout construye el quadtree una segunda vez sobre posiciones predichas y realiza consultas de vecindario por radio a través de una fase amplia que ubica los puntos en niveles de radio potencia de dos, cada uno con su propia rejilla — el coste de sondeo queda acotado por la densidad local en lugar de que cada nodo caiga en celdas dimensionadas por el radio más grande. Los vecindarios dispersos y localmente acotados son comúnmente cercanos a `O(N log N + K)`, donde `K` es el trabajo candidato/solapamiento, pero los clústeres densos o radios muy grandes aún pueden hacer `K` cuadrático. La colisión no hereda una cota incondicional `O(N log N)` de la repulsión Barnes-Hut.

`setGraph()` es `O(N + E)` aparte de la asignación de capacidad geométrica y la inicialización. `appendGraph()` es proporcional a la entrada añadida más un recálculo del sesgo de grado `O(N + E)` cuando se aceptan enlaces. `removeLinks()` compacta solo el almacenamiento de enlaces y es `O(E + R)` — los IDs simples se resuelven a través de un índice construido perezosamente en lugar de escanear todos los enlaces por solicitud. `updateLinks()` es `O(E + U)` para `U` actualizaciones. El almacenamiento crece geométricamente, por lo que la mayoría de las adiciones pequeñas reutilizan capacidad; un límite de crecimiento copia los arrays tipados existentes en tiempo `O(N + E)`. `removeNodes()` compacta nodos y enlaces y recalcula el sesgo en `O(N + E)`. La eliminación no reduce la capacidad.

## Evidencia medida en navegadores

Una ejecución de diagnóstico en navegador con cabecera tras el sesgo de grado midió los siguientes tiempos de tick p95 del hilo principal sobre diez muestras de tick por fila:

| Carga de trabajo de 3,000 nodos | Chrome 151 | Firefox 153 |
| ------------------------------- | ---------: | ----------: |
| Estrella/hub                    |   10.60 ms |     7.84 ms |
| Disperso mixto                  |    8.09 ms |     7.28 ms |

Añadir una página de 50 nodos midió **0.145-0.355 ms** en las cuatro filas de navegador/carga de trabajo. Cada fila de adición tenía una muestra de mutación de topología, por lo que este rango es evidencia diagnóstica, no una estimación de latencia de cola. Estas mediciones provinieron de una ejecución con cabecera en el hardware y entorno de software del ejecutor de tareas, no son garantías portables. La programación del navegador, el hardware, el estado de energía, la carga de fondo, la geometría del grafo, las opciones, el calentamiento y la construcción de muestras afectan a los resultados. Son evidencia de latencia por operación, no mediciones de FPS; ninguna afirmación de FPS puede derivarse de ellas.

## Migración desde `d3-force`

El mapeo conceptual es directo pero la API es intencionalmente más pequeña:

| `d3-force`                                     | `@vectojs/graph-layout`                                             |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| `simulation.nodes(nodes)` y `forceLink(links)` | `layout.setGraph({ nodes, links })`                                 |
| `simulation.tick(k)`                           | `layout.step(k)`                                                    |
| Campos mutados de nodo `x`/`y`                 | Vista XY intercalada de `layout.positions`                          |
| `simulation.alpha(value).restart()`            | `layout.reheat(value)` más un fotograma programado por el anfitrión |
| Mutación `node.fx` / `node.fy`                 | `fx`/`fy` iniciales, luego `setNodePin()` / `clearNodePin()`        |
| Temporizador interno de d3                     | Sin temporizador; el anfitrión es dueño de la programación          |

Los enlaces usan IDs de extremo en lugar de objetos de extremo mutados por d3. Los accessors de opción reciben el `GraphNode` o `GraphLink` original y un índice de inserción, y luego se cachean. No hay registro de fuerzas personalizadas en 0.3.0; si tu layout d3 depende de fuerzas personalizadas o setters de fuerza en vivo, conserva d3-force o recrea el layout con nuevas opciones.

## 2D frente a `@vectojs/graph3d`

Usa este paquete para física **2D** independiente del renderizador y pares XY intercalados. [`@vectojs/graph3d`](/reference/graph3d/) proporciona implementaciones de layout 3D separadas (`D3ForceLayout` y `VectoForceLayout`) y un renderizador Three.js; sus posiciones son tripletes XYZ y sus tipos de grafo/layout no son intercambiables con `ForceLayout2D`. Aunque ambas APIs usan un `step()` llamado por el anfitrión que reporta si queda trabajo de simulación, no pases el búfer XY de este paquete a `Graph3D.applyPositions()`, que requiere datos XYZ.

## Relacionados

[`@vectojs/graph3d`](/reference/graph3d/) para layouts y renderizado 3D ·
[`GraphLayout` e implementaciones de layout 3D](/reference/graph3d-layout/)
