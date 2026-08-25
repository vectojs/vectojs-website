+++
title = "@vectojs/node-editor"
description = "Entité d'éditeur de nœuds native canvas : modèle de document typé, commandes annulables, ports et connexions accessibles au clavier, validation stricte de persistance, et auto-layout en couches déterministe."
weight = 48
+++

# `@vectojs/node-editor`

Version documentée : **0.2.0**

`@vectojs/node-editor` est un éditeur de graphe de nœuds construit à partir des primitives VectoJS : une sous-classe d'`Entity` (`NodeEditor`) qui rend un `NodeDocument` de nœuds et de liens typés sous forme de cartes canvas, plus des helpers neutres vis-à-vis du renderer pour la mutation du document, la sélection, l'historique, la persistance et l'auto-layout en couches. Les helpers de document sont des fonctions simples sur des données simples — utilisables headless dans les tests sans instancier aucune entité.

```bash
bun add @vectojs/node-editor
```

```ts
import { NodeEditor } from '@vectojs/node-editor';

const editor = new NodeEditor({ width: 1000, height: 700 });
scene.add(editor);
```

## Modèle de document

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

Les mutations renvoient des documents frais et ne mutent jamais leur entrée :

- `createDocument(doc?)` / `cloneDocument(doc)` — clone en profondeur les `data` imbriquées, si bien que les instantanés d'historique ne peuvent jamais aliaser des enregistrements modifiés sur place.
- `addLink(document, link)` — valide d'abord (voir ci-dessous) et lève sinon `Invalid link: <error>`.
- `removeLink(document, id)`.
- `removeNode(document, id)` — abandonne le nœud **et chaque lien qui le touche** (`0.2.0+`), de sorte que le document restant reste référentiellement valide. Même sémantique de copie que `removeLink` : tableaux frais, objets nœud/lien partagés.

### `validateLink` — l'ensemble de règles de liens

Chaque lien candidat est vérifié contre le reste du document :

| Erreur                                            | Condition                                                |
| ------------------------------------------------- | -------------------------------------------------------- |
| `missing-source-node`                             | L'id source ne nomme aucun nœud                          |
| `missing-target-node`                             | L'id cible ne nomme aucun nœud                           |
| `same-node`                                       | Boucle sur soi-même — rejeté                             |
| `duplicate-link-id`                               | Un lien portant cet id existe déjà                       |
| `missing-source-port` / `missing-target-port`     | Le port nommé n'existe pas sur son point d'attache       |
| `source-port-direction` / `target-port-direction` | Port de sortie utilisé comme cible, ou inverse           |
| `incompatible-types`                              | Les deux ports déclarent des `dataType` différents       |
| `duplicate-link`                                  | Le même quadruplet d'extrémités est déjà lié             |
| `target-port-occupied`                            | `maxConnections` du port d'entrée (1 par défaut) atteint |

Politique de cycles : les boucles sur soi-même sont rejetées ; les cycles couvrant plusieurs nœuds sont autorisés — le graphe est un flux écrit par l'utilisateur, et `layoutDocument` tolère les cycles en classant ensemble les composantes fortement connexes.

## Sélection

`SelectionState` suit les ids sélectionnés : `select(id, additive?)`, `has(id)`, `clear()` et `list()` pour un instantané sûr à itérer (`0.2.0+` — l'ancien `toggle()` a été retiré ; construisez plutôt la sélection additive depuis `has()` + `select()`). `selectedIds` reste un alias en copie vive de `list()`.

## Historique

`CommandHistory` prend des instantanés du document entier par commande : `execute(label, after)`, `undo()`, `redo()`, et `currentDocument` pour l'état présent (`0.2.0+` ; le getter dupliqué `.document` a été retiré). Chaque mutation faite par l'éditeur est une seule commande annulable, donc undo/redo n'atterrit jamais au milieu d'un geste.

## `NodeEditor` — l'entité

```ts
new NodeEditor(options?: { document?: NodeDocument; width?: number; height?: number })
```

L'éditeur projette une carte par nœud, des points chauds de port à chaque port défini, et une ligne par lien. Il expose `document` (un clone défensif), `selection`, `canUndo`/`canRedo`, et ces mutateurs — chacun une seule commande annulable :

- `createLink(link)` / `deleteLink(id)`.
- `deleteNodes(ids)` (`0.2.0+`) — supprime les nœuds donnés et chaque lien incident dans une seule commande `'Delete nodes'`. Il termine d'abord toute connexion ou drag actif et efface la sélection ensuite ; les ids ne correspondant à aucun nœud sont ignorés, et rien de correspondant signifie aucune entrée d'historique.
- `select(id, additive?)`.
- `applyAutoLayout(options?)` — exécute `layoutDocument` et le commite lorsqu'il change quelque chose.
- `undo()` / `redo()` — les deux terminent d'abord tout drag ou connexion en vol, donc un Ctrl+Z en plein drag ne peut pas téléporter le nœud traîné ni commiter une entrée bidon.

### Interaction clavier (WCAG 2.1.1)

| Touches                 | Action                                                             |
| ----------------------- | ------------------------------------------------------------------ |
| `Delete` / `Backspace`  | `deleteNodes(selection.list())` (`0.2.0+`)                         |
| `Escape`                | Annule une connexion armée ou un drag actif ; annonce l'annulation |
| Ctrl/Cmd+`Z`, Shift+`Z` | Annuler / rétablir                                                 |
| Ctrl/Cmd+`Y`            | Rétablir                                                           |

Les ports sont eux-mêmes accessibles au clavier : chaque point chaud se projette comme un `role="button"` focalisable, et activer un port de sortie arme une connexion en attente tandis qu'activer un port d'entrée la commite. Seule une synthèse clavier authentique (Enter/Space sur le point chaud focalisé) pilote ce geste — un simple clic pointeur sur un port ne laisse jamais une connexion en attente fantôme.

### Annonces d'état

Une connexion clavier en attente n'a pas de pointeur et donc pas de ligne élastique ; ses transitions sont annoncées via une région live agrégée invisible (`role="status"`, `aria-live="polite"`) : l'armement (« Linking from … »), un lien commité (« Link created. »), et l'annulation par Escape. Les gestes pointeur conservent leur retour visible et ne sont pas annoncés.

### Coordonnées

Les deltas de drag, le ciblage des connexions et la ligne élastique travaillent tous dans l'espace local au document de l'éditeur, donc ils restent corrects sous des ancêtres mis à l'échelle ou translatés. Les dépôts de connexion se résolvent en ordre d'ajout inverse, de sorte que les cartes superposées se câblent au port de la carte la plus haute (dernière rendue) plutôt qu'à une cachée dessous.

## Persistance

```ts
import { NodeEditorPersistence, NODE_EDITOR_SCHEMA_VERSION } from '@vectojs/node-editor';

const persistence = new NodeEditorPersistence();
const json = persistence.exportDocument(editor.document); // schemaVersion-stamped
const doc = persistence.importDocument(json);
```

`exportDocument`/`importDocument` portent `NODE_EDITOR_SCHEMA_VERSION` (1) ; `serializeDocument`/`deserializeDocument` sont la paire non versionnée. La validation d'import est structurelle **et** sémantique (`0.2.0+`) : au-delà des vérifications de forme tableau/chaîne/nombre fini, chaque lien passe par le `validateLink` runtime contre le reste du document. Les boucles sur soi-même, les paires d'extrémités dupliquées, les ids de lien dupliqués et les violations de direction/type/maxConnections de port rejettent désormais avec `links[i]: <verdict.error>` — les documents persistés sont garantis de se recréer dans l'éditeur, alors qu'auparavant un document pouvait contenir des liens impossibles à recréer après suppression.

## Auto-layout

`layoutDocument(document, options?)` attribue des couches déterministes de la source vers la cible : les nœuds trient par id, les composantes fortement connexes classent ensemble (Tarjan SCC, puis plus long chemin sur le DAG de composantes), et les positions atterrissent à `originX + rank × horizontalGap`, `originY + index × verticalGap` (défauts `260`/`120`). Elle ne mute jamais son entrée.

## Associé

[`@vectojs/graph-layout`](/reference/graph-layout/) pour l'agencement orienté forces de graphes en lecture seule ·
[`@vectojs/core`](/reference/core-api/) pour le cycle de vie d'`Entity` sur lequel l'éditeur se construit.
