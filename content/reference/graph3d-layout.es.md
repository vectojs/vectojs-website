+++
title = "GraphLayout & D3ForceLayout"
description = "El modelo de datos del grafo y el contrato GraphLayout apto para workers, además de su implementación D3ForceLayout sobre d3-force-3d."
weight = 45
+++

# `GraphLayout` & `D3ForceLayout`

Parte de [`@vectojs/graph3d`](/reference/graph3d/).

Versión documentada: **0.6.1**

## Modelo de datos — `GraphData`

```ts
type NodeId = string | number;

interface GraphNode {
  id: NodeId;
  val?: number; // importancia relativa; el renderizador escala el radio ∝ ∛val. Por defecto 1.
  color?: string; // color CSS; recurre al nodeColor del renderizador.
  fx?: number; // fija el nodo en una x fija — el layout no lo moverá
  fy?: number;
  fz?: number;
  [key: string]: unknown; // las propiedades de dominio viajan sin modificaciones
}

interface GraphLink {
  source: NodeId;
  target: NodeId;
  [key: string]: unknown;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}
```

Los objetos Node nunca son mutados ni por el layout ni por el renderizador — las propiedades extra arbitrarias (una etiqueta, una categoría, un peso usado solo por tu propio código) pasan sin modificaciones, por lo que `GraphData` funciona como el modelo de grafo de tu propia aplicación en lugar de un formato al que conviertes y del que conviertes de vuelta.

## `GraphLayout` — el contrato de layout

```ts
interface GraphLayout {
  setGraph(data: GraphData): void;
  step(iterations?: number): boolean; // avanza la simulación, actualiza `positions`; false una vez enfriada
  readonly positions: Float32Array; // tripletes xyz, alineados por índice con GraphData.nodes
  // Controles de fijación opcionales en tiempo de ejecución (desde 0.2.0) — para arrastrar y fijar interactivo.
  // GraphInteraction detecta la característica pinNode antes de habilitar el arrastre.
  pinNode?(nodeIndex: number, x: number, y: number, z: number): void;
  unpinNode?(nodeIndex: number): void; // libera un nodo fijado de vuelta a la simulación libre
  reheat?(alpha?: number): void; // eleva alpha para que una simulación enfriada responda a fijar/liberar
  dispose(): void; // libera recursos de la simulación; la instancia queda inutilizable
}
```

El contrato es deliberadamente mínimo y apto para workers: las posiciones son un único `Float32Array` plano de tripletes xyz en el orden de `GraphData.nodes`, por lo que una implementación puede vivir completamente dentro de un Web Worker y transmitir su búfer a través del límite del hilo como transferible, sin tráfico de objetos por nodo.
[`Graph3D.applyPositions()`](/reference/graph3d-renderer/#metodos) consume ese mismo formato de búfer directamente. `positions` es la **misma instancia de array** reutilizada entre pasos — cópiala (`layout.positions.slice()`) si necesitas una instantánea estable en lugar de una vista en vivo.

**La validación de extremos de enlaces es uniforme en toda la pila (0.6.1).**
`Graph3D.setGraphData`, `VectoForceLayout.setGraph` y `D3ForceLayout.setGraph`
lanzan todos el mismo error `references an unknown node id` para un enlace cuyo
extremo no nombra ningún nodo del grafo — la validación se ejecuta antes de
mutar cualquier estado, por lo que un grafo rechazado deja el anterior intacto
(`D3ForceLayout` dejaba antes que el id crudo llegara a d3-force-3d, cuyo tick
colapsaba silenciosamente todas las posiciones a NaN; `VectoForceLayout`
omitía el enlace en silencio). Los bucles sobre un mismo nodo siguen siendo
entrada legal sin muelle: `VectoForceLayout` los omite.

Ten en cuenta también que los controles opcionales de fijación de este contrato
se direccionan por **índice** de nodo, mientras que [`ForceLayout2D`](/reference/graph-layout/)
2D fija por **ID** de nodo (sus fijaciones sobreviven a la compactación de
`removeNodes`), y la identidad de aristas paralelas también difiere — las pilas
de este paquete tratan los enlaces paralelos como aristas distintas, mientras
que consumidores como el node-editor rechazan cuádruples de extremos duplicados.
Traduce fijaciones e identidad de enlaces al portar código entre pilas.

`@vectojs/graph3d` incluye dos implementaciones detrás de este contrato hoy — la propia [`VectoForceLayout`](#vectoforcelayout) (octree Barnes–Hut, sin dependencia en tiempo de ejecución; la predeterminada) y [`D3ForceLayout`](#d3forcelayout) (un adaptador de `d3-force-3d`, conservado para mantener la paridad con un ajuste d3 existente) — además de modos de layout DAG en la hoja de ruta del paquete, todos detrás de esta misma interfaz para que un renderizador o un host de worker nunca necesiten saber cuál se está ejecutando.

## `D3ForceLayout`

La alternativa respaldada por d3-force-3d al [`VectoForceLayout`](#vectoforcelayout) predeterminado. Requiere `d3-force-3d`; prefiere `VectoForceLayout` a menos que estés migrando un grafo con fuerzas d3 ajustadas y quieras conservar la sensación intacta.

```ts
new D3ForceLayout(options?: D3ForceLayoutOptions)

interface D3ForceLayoutOptions {
  linkDistance?: number;   // longitud de reposo objetivo de los enlaces. Por defecto 30.
  chargeStrength?: number; // fuerza de muchos cuerpos (carga); negativo repele. Por defecto -30.
  alphaMin?: number;       // umbral de alpha por debajo del cual step() reporta enfriado. Por defecto 0.001.
}
```

Adapta [d3-force-3d](https://github.com/vasturiano/d3-force-3d) — el mismo motor detrás de `3d-force-graph` — por lo que las fuerzas ajustadas de un grafo migran con su sensación intacta. Ejecuta `forceLink` + `forceManyBody` + `forceCenter` en 3 dimensiones.

La simulación d3 muta sus propios registros de nodos (`x`/`y`/`z`/`vx`/…), por lo que `setGraph` clona cada nodo en un registro de simulación interno en lugar de entregarle tus objetos `GraphData.nodes` directamente — solo las fijaciones `fx`/`fy`/`fz` declaradas y cualquier semilla de posición inicial `x`/`y`/`z` se transfieren. El temporizador propio de la simulación nunca se inicia; `step(iterations = 1)` lo ejecuta sincrónicamente, que es lo que mantiene a `D3ForceLayout` utilizable dentro de un Web Worker sin necesidad de simular `requestAnimationFrame`.

## `VectoForceLayout`

```ts
new VectoForceLayout(options?: VectoForceLayoutOptions)

interface VectoForceLayoutOptions {
  linkDistance?: number;   // target resting length of links. Default 30.
  linkStrength?: number;   // spring stiffness of links. Default 0.3.
  repulsion?: number;      // many-body repulsion strength. Default 300.
  centerStrength?: number; // pull toward the centroid. Default 0.02.
  velocityDecay?: number;  // per-step velocity damping. Default 0.6.
  theta?: number;          // Barnes–Hut opening angle. Default 0.9.
  alphaDecay?: number;     // cooling rate. Default 0.0228; non-positive falls back to the default.
  alphaMin?: number;       // alpha below which step() reports cooled. Default 0.001.
  seed?: number;           // RNG seed for deterministic placement. Default 1.
  measurePhases?: boolean; // opt-in per-tick phase profiling. Default false.
}
```

El layout propio (añadido en 0.3.0, y el predeterminado): una simulación dirigida por fuerzas con un octree Barnes–Hut para el término de muchos cuerpos — sin dependencia en tiempo de ejecución, determinista bajo un `seed`, y seguro dentro de un Web Worker (el mismo contrato `step(iterations)` que `D3ForceLayout`). Las posiciones y velocidades se mantienen en **f32** (coincidiendo con el `Float32Array` expuesto), mientras que el octree acumula los centros de masa y la integral de repulsión en **f64**. Elígelo cuando quieras resultados idénticos entre ejecuciones; ajústalo con `repulsion`/`linkStrength`, y eleva `alphaDecay` por encima de cero con cuidado — ya está cerca del borde de enfriamiento, por lo que un valor más alto congela el grafo antes en lugar de después. Un `alphaDecay` no positivo se rechaza en la construcción y recurre al valor predeterminado (un `0` literal hacía antes que la simulación corriera para siempre sin asentarse jamás).

```ts
layout.step(); // un tick
layout.step(5); // 5 ticks en una llamada — amortización más económica por fotograma
// para grafos donde el tiempo de estabilización visual importa más
// que la suavidad por tick
```

**Perfilado de fases (desde 0.5.0).** Establece `measurePhases: true` para que cada tick registre su tiempo de reloj dividido entre `[octree build, force accumulate, link springs, integrate]` en `layout.tickPhases` (una 4-tupla `readonly` de milisegundos; `null` cuando el perfilado está desactivado). Las llamadas de temporización se eliminan en caso contrario, por lo que la ruta caliente no paga nada.

**Kernel de fuerza WASM (desde 0.5.0).** Un kernel Rust/WASM opcional (`crates/vectojs-force-rs`) acelera la construcción del octree + la acumulación de repulsión — la fase dominante de un tick — mientras que los muelles de enlace, el centrado, la integración y las fijaciones permanecen en JS:

```ts
import { forceWasmUrl } from '@vectojs/graph3d/wasm';

await layout.enableWasmForce(forceWasmUrl); // async; string | URL | Response
layout.enableWasmForceSync(bytes); // sync; BufferSource, never fetches
```

Ambos devuelven `false` ante cualquier fallo (CSP, 404, módulo corrupto) y conservan silenciosamente el Barnes-Hut en JS idéntico bit a bit, que es el fallback permanente y el oráculo diferencial. El kernel no tiene dependencia de `@vectojs/core`.

**Fijación (desde 0.2.0).** Tanto `D3ForceLayout` como `VectoForceLayout` implementan los controles de fijación opcionales (d3 sobre `fx`/`fy`/`fz`, VectoForceLayout sobre sus propios arrays de fijación), que es lo que impulsa el arrastre para fijar de [`GraphInteraction`](/reference/graph3d-renderer/#graphinteraction-hover-seleccionar-arrastrar-para-fijar):

```ts
layout.pinNode(i, x, y, z); // fija el nodo i en (x,y,z) cada tick; también actualiza positions[i] ahora
layout.reheat(0.3); // reactiva una simulación enfriada para que el resto se estabilice alrededor de la fijación
layout.unpinNode(i); // limpia fx/fy/fz — el nodo i está libre nuevamente
```

Los índices fuera de rango se ignoran (una interacción de puntero obsoleto no puede bloquear el layout), y el alpha de `reheat` se limita a `[alphaMin, 1]`.

**Cambiando fuerzas en vivo.** `D3ForceLayoutOptions` son solo del constructor; no hay un setter en vivo. Para aplicar un nuevo `chargeStrength`/`linkDistance` (por ejemplo desde un deslizador), haz `dispose()` de la instancia antigua y `setGraph()` una nueva — económica para grafos donde la topología en sí no cambia, ya que solo la simulación, no los búferes de GPU de `Graph3D`, se reconstruye:

```ts
function restartLayout() {
  layout.dispose();
  layout = new D3ForceLayout({ chargeStrength, linkDistance });
  layout.setGraph(data);
}
```

`VectoForceLayoutOptions` son también solo del constructor, por lo que el mismo patrón de reinicio se aplica cuando cambias sus fuerzas.

## Relacionados

Para el layout de fuerzas **2D** independiente del renderizador, actualizaciones incrementales de topología y posiciones XY intercaladas, usa [`@vectojs/graph-layout`](/reference/graph-layout/). Es un paquete separado; su `ForceLayout2D` y su búfer XY no implementan el contrato `GraphLayout` 3D de esta página ni su forma de posición XYZ. Ambas APIs devuelven un booleano activo/enfriado desde un `step()` impulsado por el anfitrión, pero sus tipos de layout y búferes de posición no son intercambiables.

[`Graph3D` y selección](/reference/graph3d-renderer/) (consume `positions` directamente) ·
[`@vectojs/graph3d` visión general](/reference/graph3d/)
