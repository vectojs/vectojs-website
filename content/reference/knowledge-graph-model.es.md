+++
title = "@vectojs/knowledge-graph/model"
description = "Materialización de grafo de conocimiento paginada y neutral al renderizador, con cancelación, deduplicación, instantáneas y arranques en caliente de layout opcionales."
weight = 46
+++

# `@vectojs/knowledge-graph/model`

Versión documentada: **0.3.2**

`KnowledgeGraphModel` posee un corte materializado y acotado de un grafo de conocimiento mayor. Carga entidades semilla y páginas de vecinos desde un `KgDataSource`, deduplica entidades y hechos, rastrea el progreso de expansión por nodo y expone un `GraphData` estable para un renderizador. No crea DOM, canvas, escena de Three.js ni temporizador de animación.

Importa el punto de entrada neutral al renderizador cuando el anfitrión solo necesita datos y estado del modelo:

```ts
import {
  KnowledgeGraphModel,
  MemoryDataSource,
  type KgDataSource,
} from '@vectojs/knowledge-graph/model';
```

La raíz del paquete también exporta el modelo, pero incluye la superficie de sesión y orientada al renderizado del paquete. La subruta `/model` es el límite headless explícito.

## Contrato de fuente de datos

```ts
type NodeId = string | number;

interface KgNeighborOptions {
  limit?: number;
  cursor?: string;
  direction?: 'out' | 'in' | 'both';
  signal?: AbortSignal;
}

interface KgNeighborhood {
  entity: KgEntity;
  facts: readonly KgFact[];
  neighbors: readonly KgEntity[];
  total?: number;
  nextCursor?: string;
  hasMore?: boolean;
}

interface KgDataSource {
  getNodes(ids?: readonly NodeId[]): readonly KgEntity[] | Promise<readonly KgEntity[]>;
  getNeighbors(id: NodeId, options?: KgNeighborOptions): KgNeighborhood | Promise<KgNeighborhood>;
  getLabels?(
    ids: readonly NodeId[],
    lang?: string,
  ): ReadonlyMap<NodeId, string> | Promise<ReadonlyMap<NodeId, string>>;
}
```

Trata `cursor` como opaco. Una fuente debe aplicar `limit`, respetar `direction`, pasar la señal de aborto proporcionada al trabajo posterior y devolver `nextCursor` más `hasMore` cuando exista otra página. `total` es opcional y describe el total de hechos disponibles para esa expansión de nodo, no meramente la página actual.

`MemoryDataSource` implementa este contrato para pruebas y grafos pequeños en memoria. Sus cursores son desplazamientos decimales, la búsqueda de vecinos es `O(degree)` y un cursor inválido lanza.

## Crear y expandir un modelo

```ts
const source = new MemoryDataSource({ entities, facts });
const model = new KnowledgeGraphModel({
  source,
  pageSize: 100,
  direction: 'both',
  lang: 'en',
});

await model.bootstrap(['vectojs'], false);

let result = await model.expand('vectojs');
while (result.state.status === 'partial') {
  result = await model.expand('vectojs');
}

draw(model.getGraphData());
```

`bootstrap(focusIds, expandSeeds = true)` primero resuelve las entidades de enfoque. Con el segundo argumento por defecto, luego expande cada semilla serialmente por una página. Pasa `false` cuando el anfitrión quiera control explícito sobre el paginado.

Cada `expand(id)` carga exactamente la siguiente página. Las llamadas concurrentes para el mismo ID comparten una única promesa, mientras que IDs diferentes pueden cargar de forma independiente. Una expansión completada se resuelve inmediatamente sin otra llamada a la fuente. Las entidades se deduplican por ID y se fusionan, incluyendo sus mapas de etiquetas. Los hechos se deduplican por la tripleta ordenada `(source, predicate, target)`.

## Estado de expansión

```ts
type ExpansionStatus = 'idle' | 'loading' | 'partial' | 'complete' | 'failed' | 'cancelled';

interface ExpansionState {
  status: ExpansionStatus;
  loaded: number;
  total?: number;
  cursor?: string;
  hasMore?: boolean;
  error?: unknown;
}
```

Lee una copia defensiva con `getExpansionState(id)`. `loaded` es el número de hechos de página aceptados reportados a lo largo de esa expansión. `partial` significa que hay otra página disponible; llamar a `expand(id)` reanuda desde su cursor almacenado.

`cancelExpand(id)` aborta la solicitud activa y la marca como `cancelled`. La fuente de datos debe respetar `options.signal` para que la cancelación detenga su I/O subyacente. Un `expand(id)` posterior reanuda desde el último cursor completado. Un fallo de la fuente marca el estado `failed`, conserva el progreso previo y rechaza la promesa; una llamada posterior reintenta desde ese mismo cursor.

## Leer y persistir el estado

```ts
model.entityCount;
model.factCount;
model.listEntities();
model.listFacts();
model.getGraphData();

const snapshot = model.exportSnapshot();
model.importSnapshot(snapshot);
```

`listEntities()` y `listFacts()` devuelven copias adecuadas para la inspección de la aplicación. `getGraphData()` devuelve la entrada de renderizador actual del modelo en orden de entidad estable. Trata ese grafo como de solo lectura; se reemplaza cuando cambia el corte materializado.

Las instantáneas están versionadas. La versión 1 almacena entidades, hechos y metadatos de expansión reanudables, pero no una solicitud en vuelo ni un objeto de error. Importar una instantánea aborta las solicitudes actuales e ignora sus completaciones eventuales. Una versión de instantánea no soportada lanza antes del reemplazo.

## Integración de layout opcional

`KnowledgeGraphModelOptions.layout` acepta el contrato XYZ `GraphLayout` de `@vectojs/graph3d`. Cuando se proporciona, cada reconstrucción de materialización llama a `layout.setGraph()`, conserva las posiciones XYZ finitas por ID de nodo como arranques en caliente y recalienta después de una página cargada cuando el layout expone `reheat()`.

Llama a `captureLayoutPositions()` antes de una operación externa que necesite que se conserven las coordenadas de layout más recientes. Este contrato opcional es tridimensional: no pases el `ForceLayout2D` XY de `@vectojs/graph-layout` directamente. Un renderizador 2D puede omitir `layout` y ejecutar su propio layout neutral al renderizador sobre `getGraphData()`.

## Liberación de recursos

`dispose()` aborta las solicitudes activas, libera el layout opcional y libera el estado materializado. Es idempotente. Los métodos que requieren un modelo vivo lanzan `KnowledgeGraphModel is disposed` después; las completaciones async tardías no pueden repoblar el estado liberado o reemplazado por instantánea.

## Complejidad

Para un corte materializado con `N` entidades y `E` hechos únicos, el almacenamiento del modelo es `O(N + E)`. Ingerir una página es `O(P)` esperado para `P` registros devueltos, luego reconstruir los datos del renderizador es `O(N + E)` más el coste de `setGraph()` del layout proporcionado. La exportación e importación de instantáneas son `O(N + E)`. El modelo materializa intencionalmente solo las páginas cargadas; el tamaño total del grafo fuente no determina su memoria residente.

## Relacionados

[`@vectojs/graph-layout`](/reference/graph-layout/) para física 2D independiente del renderizador · [`GraphLayout` e implementaciones de layout 3D](/reference/graph3d-layout/) para el contrato de layout XYZ opcional · [`@vectojs/graph3d`](/reference/graph3d/) para renderizado 3D
