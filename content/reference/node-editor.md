+++
title = "@vectojs/node-editor"
description = "Canvas-native node editor entity: typed document model, undoable commands, keyboard-reachable ports and connections, strict persistence validation, and deterministic layered auto-layout."
weight = 48
+++

# `@vectojs/node-editor`

Version documented: **0.2.0**

`@vectojs/node-editor` is a node-graph editor built from VectoJS primitives:
an `Entity` subclass (`NodeEditor`) that renders a `NodeDocument` of typed
nodes and links as canvas cards, plus renderer-neutral helpers for document
mutation, selection, history, persistence, and layered auto-layout. The
document helpers are plain functions over plain data — usable headless in
tests without instantiating any entity.

```bash
bun add @vectojs/node-editor
```

```ts
import { NodeEditor } from '@vectojs/node-editor';

const editor = new NodeEditor({ width: 1000, height: 700 });
scene.add(editor);
```

## Document model

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

Mutations return fresh documents and never mutate their input:

- `createDocument(doc?)` / `cloneDocument(doc)` — deep-clones nested `data`, so
  history snapshots can never alias records mutated in place.
- `addLink(document, link)` — validates first (see below) and throws
  `Invalid link: <error>` otherwise.
- `removeLink(document, id)`.
- `removeNode(document, id)` — drops the node **and every link touching it**
  (`0.2.0+`), so the remaining document stays referentially valid. Same copy
  semantics as `removeLink`: fresh arrays, node/link objects shared.

### `validateLink` — the link rule set

Every prospective link is checked against the rest of the document:

| Error                                             | Condition                                         |
| ------------------------------------------------- | ------------------------------------------------- |
| `missing-source-node`                             | Source id names no node                           |
| `missing-target-node`                             | Target id names no node                           |
| `same-node`                                       | Self-loop — rejected                              |
| `duplicate-link-id`                               | A link carrying that id already exists            |
| `missing-source-port` / `missing-target-port`     | Named port does not exist on its endpoint         |
| `source-port-direction` / `target-port-direction` | Output port used as target or vice versa          |
| `incompatible-types`                              | Both ports declare `dataType`s that differ        |
| `duplicate-link`                                  | Same endpoint quadruple already linked            |
| `target-port-occupied`                            | Input port's `maxConnections` (default 1) reached |

Cycle policy: self-loops are rejected; cycles spanning multiple nodes are
allowed — the graph is a user-authored flow, and `layoutDocument` tolerates
cycles by ranking strongly connected components together.

## Selection

`SelectionState` tracks selected ids: `select(id, additive?)`,
`has(id)`, `clear()`, and `list()` for an iteration-safe snapshot (`0.2.0+` —
the previous `toggle()` was removed; build additive selection from `has()` +
`select()` instead). `selectedIds` remains a live-copy alias of `list()`.

## History

`CommandHistory` snapshots whole documents per command: `execute(label, after)`,
`undo()`, `redo()`, and `currentDocument` for the present state (`0.2.0+`;
the duplicate `.document` getter was removed). Every mutation the editor makes
is one undoable command, so undo/redo never lands mid-gesture.

## `NodeEditor` — the entity

```ts
new NodeEditor(options?: { document?: NodeDocument; width?: number; height?: number })
```

The editor projects one card per node, port hotspots at each defined port, and
one line per link. It exposes `document` (a defensive clone),
`selection`, `canUndo`/`canRedo`, and these mutators — each a single
undoable command:

- `createLink(link)` / `deleteLink(id)`.
- `deleteNodes(ids)` (`0.2.0+`) — removes the given nodes and every incident
  link in one `'Delete nodes'` command. It first ends any active connection or
  drag and clears the selection afterwards; ids matching no node are ignored,
  and nothing matched means no history entry.
- `select(id, additive?)`.
- `applyAutoLayout(options?)` — runs `layoutDocument` and commits it when it
  changes anything.
- `undo()` / `redo()` — both end any in-flight drag or connection first, so a
  mid-drag Ctrl+Z cannot teleport the dragged node or commit a bogus entry.

### Keyboard interaction (WCAG 2.1.1)

| Keys                    | Action                                                                 |
| ----------------------- | ---------------------------------------------------------------------- |
| `Delete` / `Backspace`  | `deleteNodes(selection.list())` (`0.2.0+`)                             |
| `Escape`                | Cancels an armed connection or active drag; announces the cancellation |
| Ctrl/Cmd+`Z`, Shift+`Z` | Undo / redo                                                            |
| Ctrl/Cmd+`Y`            | Redo                                                                   |

Ports are themselves keyboard-reachable: each hotspot projects as a focusable
`role="button"`, and activating an output port arms a pending connection while
activating an input port commits it. Only genuine keyboard synthesis (Enter/
Space on the focused hotspot) drives this gesture — a bare pointer click on a
port never leaves a phantom pending connection.

### Status announcements

A pending keyboard connection has no pointer and therefore no rubber line, so
its transitions are announced through an invisible aggregate live region
(`role="status"`, `aria-live="polite"`): arming ("Linking from …"), a committed
link ("Link created."), and Escape cancellation. Pointer gestures keep their
visible feedback and are not announced.

### Coordinates

Drag deltas, connection targeting, and the rubber line all work in the
editor's own document-local space, so they stay correct under scaled or
translated ancestors. Connection drops resolve in reverse add-order, so
overlapping cards wire to the topmost (last-rendered) card's port rather than
a hidden one beneath.

## Persistence

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

`exportDocument`/`importDocument` carry `NODE_EDITOR_SCHEMA_VERSION` (1);
`serializeDocument`/`deserializeDocument` are the unversioned pair. Import
validation is structural **and** semantic (`0.2.0+`): beyond array/string/
finite-number shape checks, every link is run through the runtime `validateLink`
against the rest of the document. Self-loops, duplicate endpoint pairs,
duplicate link ids, and port direction/type/maxConnections violations now
reject with `links[i]: <verdict.error>` — persisted documents are guaranteed to
re-create in the editor, where previously a document could contain links
impossible to re-create after deletion.

## Auto-layout

`layoutDocument(document, options?)` assigns deterministic source-to-target
layers: nodes sort by id, strongly connected components rank together
(Tarjan SCC, then longest-path over the component DAG), and positions land at
`originX + rank × horizontalGap`, `originY + index × verticalGap`
(defaults `260`/`120`). It never mutates its input.

## Related

[`@vectojs/graph-layout`](/reference/graph-layout/) for force-directed
arrangement of read-only graphs · [`@vectojs/core`](/reference/core-api/) for
the `Entity` lifecycle the editor builds on.
