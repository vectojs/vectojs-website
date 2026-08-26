+++
title = "@vectojs/node-editor"
description = "Entidad de editor de nodos nativa de canvas: modelo de documento tipado, comandos deshacibles, puertos y conexiones accesibles por teclado, validación de persistencia estricta y auto-layout en capas determinista."
weight = 48
+++

# `@vectojs/node-editor`

Versión documentada: **0.2.0**

`@vectojs/node-editor` es un editor de grafos de nodos construido con primitivas de VectoJS: una subclase de `Entity` (`NodeEditor`) que renderiza un `NodeDocument` de nodos y enlaces tipados como tarjetas de canvas, más helpers neutrales al renderizador para mutación del documento, selección, historial, persistencia y auto-layout en capas. Los helpers del documento son funciones simples sobre datos simples — utilizables headless en pruebas sin instanciar ninguna entidad.

```bash
bun add @vectojs/node-editor
```

```ts
import { NodeEditor } from '@vectojs/node-editor';

const editor = new NodeEditor({ width: 1000, height: 700 });
scene.add(editor);
```

## Modelo de documento

```ts
interface NodeDocument {
  nodes: readonly NodeData[];
  links: readonly LinkData[];
}

interface NodeData {
  id: string;
  type: string;
  title: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  ports?: readonly PortDefinition[]; // id, label?, direction 'input'|'output', dataType?, maxConnections?
  data?: Readonly<Record<string, unknown>>;
}

interface LinkData {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
  data?: Readonly<Record<string, unknown>>;
}
```

Las mutaciones devuelven documentos frescos y nunca mutan su entrada:

- `createDocument(doc?)` / `cloneDocument(doc)` — clona en profundidad los `data` anidados, de modo que las instantáneas del historial nunca pueden aliasar registros modificados in situ.
- `addLink(document, link)` — valida primero (ver abajo) y lanza `Invalid link: <error>` en caso contrario.
- `removeLink(document, id)`.
- `removeNode(document, id)` — elimina el nodo **y cada enlace que lo toca** (`0.2.0+`), de modo que el documento restante permanezca referencialmente válido. La misma semántica de copia que `removeLink`: arrays frescos, objetos de nodo/enlace compartidos.

### `validateLink` — el conjunto de reglas de enlaces

Cada enlace candidato se comprueba contra el resto del documento:

| Error                                             | Condición                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| `missing-source-node`                             | El id de origen no nombra ningún nodo                                |
| `missing-target-node`                             | El id de destino no nombra ningún nodo                               |
| `same-node`                                       | Bucle sobre sí mismo — rechazado                                     |
| `duplicate-link-id`                               | Ya existe un enlace con ese id                                       |
| `missing-source-port` / `missing-target-port`     | El puerto nombrado no existe en su extremo                           |
| `source-port-direction` / `target-port-direction` | Puerto de salida usado como destino, o al revés                      |
| `incompatible-types`                              | Ambos puertos declaran `dataType` distintos                          |
| `duplicate-link`                                  | El mismo cuádruple de extremos ya está conectado                     |
| `target-port-occupied`                            | Se alcanzó el `maxConnections` del puerto de entrada (1 por defecto) |

Política de ciclos: los bucles sobre sí mismos se rechazan; los ciclos que abarcan varios nodos están permitidos — el grafo es un flujo escrito por la persona usuaria, y `layoutDocument` tolera los ciclos clasificando juntas las componentes fuertemente conexas.

## Selección

`SelectionState` rastrea los ids seleccionados: `select(id, additive?)`, `has(id)`, `clear()` y `list()` para una instantánea segura de iterar (`0.2.0+` — el anterior `toggle()` fue eliminado; construye la selección aditiva a partir de `has()` + `select()`). `selectedIds` sigue siendo un alias de copia viva de `list()`.

## Historial

`CommandHistory` toma instantáneas de documentos completos por comando: `execute(label, after)`, `undo()`, `redo()` y `currentDocument` para el estado presente (`0.2.0+`; se eliminó el getter duplicado `.document`). Cada mutación que hace el editor es un único comando deshacible, así que undo/redo nunca aterriza a mitad de un gesto.

## `NodeEditor` — la entidad

```ts
new NodeEditor(options?: { document?: NodeDocument; width?: number; height?: number })
```

El editor proyecta una tarjeta por nodo, puntos calientes de puerto en cada puerto definido y una línea por enlace. Expone `document` (un clon defensivo), `selection`, `canUndo`/`canRedo`, y estos mutadores — cada uno un único comando deshacible:

- `createLink(link)` / `deleteLink(id)`.
- `deleteNodes(ids)` (`0.2.0+`) — elimina los nodos dados y cada enlace incidente en un solo comando `'Delete nodes'`. Primero termina cualquier conexión o arrastre activo y limpia la selección después; los ids que no coinciden con ningún nodo se ignoran, y nada coincidente significa ninguna entrada de historial.
- `select(id, additive?)`.
- `applyAutoLayout(options?)` — ejecuta `layoutDocument` y lo commite cuando cambia algo.
- `undo()` / `redo()` — ambos terminan primero cualquier arrastre o conexión en vuelo, de modo que un Ctrl+Z a mitad de arrastre no puede teletransportar el nodo arrastrado ni commitear una entrada falsa.

### Interacción con teclado (WCAG 2.1.1)

| Teclas                  | Acción                                                                   |
| ----------------------- | ------------------------------------------------------------------------ |
| `Delete` / `Backspace`  | `deleteNodes(selection.list())` (`0.2.0+`)                               |
| `Escape`                | Cancela una conexión armada o un arrastre activo; anuncia la cancelación |
| Ctrl/Cmd+`Z`, Shift+`Z` | Deshacer / rehacer                                                       |
| Ctrl/Cmd+`Y`            | Rehacer                                                                  |

Los puertos son en sí mismos alcanzables por teclado: cada punto caliente se proyecta como un `role="button"` enfocable, y activar un puerto de salida arma una conexión pendiente mientras que activar un puerto de entrada la commitea. Solo la síntesis genuina de teclado (Enter/Space sobre el punto caliente enfocado) dirige este gesto — un simple clic de puntero sobre un puerto nunca deja una conexión pendiente fantasma.

### Anuncios de estado

Una conexión de teclado pendiente no tiene puntero y por tanto tampoco línea de goma, así que sus transiciones se anuncian a través de una región live agregada invisible (`role="status"`, `aria-live="polite"`): armado ("Linking from …"), un enlace commitado ("Link created.") y cancelación con Escape. Los gestos de puntero conservan su retroalimentación visible y no se anuncian.

### Coordenadas

Los deltas de arrastre, el direccionamiento de conexiones y la línea de goma funcionan todos en el espacio local al documento del propio editor, de modo que siguen siendo correctos bajo ancestros escalados o trasladados. Los descartes de conexión se resuelven en orden inverso de adición, de modo que las tarjetas superpuestas se cablean al puerto de la tarjeta superior (la última renderizada) en lugar de a una oculta debajo.

## Persistencia

```ts
import {
  nodeEditorPersistence,
  exportDocument,
  importDocument,
  NODE_EDITOR_SCHEMA_VERSION,
} from '@vectojs/node-editor';

// The persistence API is a ready-made object plus equivalent free functions —
// there is no exported class to construct.
const json = nodeEditorPersistence.exportDocument(editor.document); // schemaVersion-stamped
const doc = nodeEditorPersistence.importDocument(json);
// Same operations, stateless form:
const json2 = exportDocument(editor.document);
const doc2 = importDocument(json2);
```

`exportDocument`/`importDocument` llevan `NODE_EDITOR_SCHEMA_VERSION` (1); `serializeDocument`/`deserializeDocument` son la pareja sin versión. La validación de importación es estructural **y** semántica (`0.2.0+`): más allá de las comprobaciones de forma de array/cadena/número finito, cada enlace pasa por el `validateLink` en tiempo de ejecución contra el resto del documento. Los bucles sobre sí mismo, los pares de extremos duplicados, los ids de enlace duplicados y las violaciones de dirección/tipo/maxConnections de puerto ahora rechazan con `links[i]: <verdict.error>` — los documentos persistidos tienen garantizada su recreación en el editor, donde antes un documento podía contener enlaces imposibles de recrear tras una eliminación.

## Auto-layout

`layoutDocument(document, options?)` asigna capas deterministas de origen a destino: los nodos se ordenan por id, las componentes fuertemente conexas se clasifican juntas (Tarjan SCC, luego camino más largo sobre el DAG de componentes), y las posiciones caen en `originX + rank × horizontalGap`, `originY + index × verticalGap` (predeterminados `260`/`120`). Nunca muta su entrada.

## Relacionados

[`@vectojs/graph-layout`](/reference/graph-layout/) para disposición dirigida por fuerzas de grafos de solo lectura ·
[`@vectojs/core`](/reference/core-api/) para el ciclo de vida de `Entity` sobre el que se construye el editor.
