---
title: 'GraphLayout & D3ForceLayout'
description: 'El modelo de datos del grafo y el contrato GraphLayout apto para workers, además de su implementación D3ForceLayout sobre d3-force-3d.'
order: 45
---

# `GraphLayout` & `D3ForceLayout`

Parte de [`@vectojs/graph3d`](/reference/graph3d/).

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
[`Graph3D.applyPositions()`](/reference/graph3d-renderer/#métodos) consume ese mismo formato de búfer directamente. `positions` es la **misma instancia de array** reutilizada entre pasos — cópiala (`layout.positions.slice()`) si necesitas una instantánea estable en lugar de una vista en vivo.

`@vectojs/graph3d` incluye una implementación hoy; más adaptadores (`ngraph`) y modos de layout DAG están en la hoja de ruta del paquete, todos detrás de esta misma interfaz para que un renderizador o un host de worker nunca necesiten saber cuál se está ejecutando.

## `D3ForceLayout`

```ts
new D3ForceLayout(options?: D3ForceLayoutOptions)

interface D3ForceLayoutOptions {
  linkDistance?: number;   // longitud de reposo objetivo de los enlaces. Por defecto 30.
  chargeStrength?: number; // fuerza de muchos cuerpos (carga); negativo repele. Por defecto -30.
  alphaMin?: number;       // umbral de alpha por debajo del cual step() reporta enfriado. Por defecto 0.001.
}
```

Adapta [d3-force-3d](https://github.com/vasturiano/d3-force-3d) — el mismo motor detrás de `3d-force-graph` — por lo que las fuerzas ajustadas de un grafo migran con su sensación intacta. Ejecuta `forceLink` + `forceManyBody` + `forceCenter` en 3 dimensiones.

La simulación d3 muta sus propios registros de nodos (`x`/`y`/`z`/`vx`/…), por lo que `setGraph` clona cada nodo en un registro de simulación interno en lugar de entregarle tus objetos `GraphData.nodes` directamente — solo las fijaciones `fx`/`fy`/`fz` declaradas se transfieren. El temporizador propio de la simulación nunca se inicia; `step(iterations = 1)` lo ejecuta sincrónicamente, que es lo que mantiene a `D3ForceLayout` utilizable dentro de un Web Worker sin necesidad de simular `requestAnimationFrame`.

```ts
layout.step(); // un tick
layout.step(5); // 5 ticks en una llamada — amortización más económica por fotograma
// para grafos donde el tiempo de estabilización visual importa más
// que la suavidad por tick
```

**Fijación (desde 0.2.0).** `D3ForceLayout` implementa los controles de fijación opcionales sobre `fx`/`fy`/`fz` de d3-force, que es lo que impulsa el arrastre para fijar de [`GraphInteraction`](/reference/graph3d-renderer/#graphinteraction--hover--seleccionar--arrastrar-para-fijar):

```ts
layout.pinNode(i, x, y, z); // fija el nodo i en (x,y,z) cada tick; también actualiza positions[i] ahora
layout.reheat(0.3); // reactiva una simulación enfriada para que el resto se estabilice alrededor de la fijación
layout.unpinNode(i); // limpia fx/fy/fz — el nodo i está libre nuevamente
```

Los índices fuera de rango se ignoran (una interacción de puntero obsoleto no puede bloquear el layout), y el alpha de `reheat` se limita al rango habitual `[alphaMin, 1]` de d3.

**Cambiando fuerzas en vivo.** `D3ForceLayoutOptions` son solo del constructor; no hay un setter en vivo. Para aplicar un nuevo `chargeStrength`/`linkDistance` (por ejemplo desde un deslizador), haz `dispose()` de la instancia antigua y `setGraph()` una nueva — económica para grafos donde la topología en sí no cambia, ya que solo la simulación, no los búferes de GPU de `Graph3D`, se reconstruye:

```ts
function restartLayout() {
  layout.dispose();
  layout = new D3ForceLayout({ chargeStrength, linkDistance });
  layout.setGraph(data);
}
```

## Relacionados

[`Graph3D` y selección](/reference/graph3d-renderer/) (consume `positions` directamente) ·
[`@vectojs/graph3d` visión general](/reference/graph3d/)
