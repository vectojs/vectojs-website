+++
title = "@vectojs/graph-layout"
description = "Layout de force 2D indépendant du renderer et sans dépendance, avec répulsion Barnes-Hut, mises à jour incrémentales de la topologie, gestion des collisions et épinglage à l'exécution."
weight = 47
+++

# `@vectojs/graph-layout`

Version documentée : **0.3.0**

`@vectojs/graph-layout` est une simulation de forces 2D sans dépendance. Il ne possède ni renderer ni minuteur d'animation : l'hôte fournit les données du graphe, appelle `step()`, et lit les coordonnées XY entrelacées depuis un `Float32Array`. Le même layout peut piloter Canvas 2D, SVG, WebGL, WebGPU, une scène VectoJS, ou un renderer hors du thread principal.

La version 0.3.0 possède une seule implémentation, le `ForceLayout2D` en TypeScript. Il n'y a pas de build WASM, de backend alternatif, ni d'option `backend` en 0.3.0. WASM reste une option future conditionnée par des mesures ; les comparaisons inter-dimensionnelles actuelles dans les navigateurs ne constituent pas une preuve directe qu'un backend WASM aiderait.

## Installation

```bash
bun add @vectojs/graph-layout
```

Le paquet n'a aucune dépendance pair d'exécution ou de renderer.

## Exemple Canvas 2D

Cet exemple utilise des IDs de chaînes arbitraires et résout leurs index de position actuels via le layout. Les IDs numériques sont aussi des identifiants ; ne supposez pas qu'un ID numérique égale son index de nœud actuel.

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

`step()` est synchrone. Il renvoie `true` tant que la simulation reste active et `false` après qu'elle a refroidi en dessous de `alphaMin` (ou lorsque le graphe est vide). La valeur de retour indique si la physique a besoin d'un autre tic ; elle ne dit rien sur le fait que votre application doive continuer à rendre pour le mouvement de caméra, la saisie, ou d'autres animations. Un `alphaDecay` non positif est rejeté à la construction et retombe sur la valeur par défaut, donc une simulation non vide se stabilise toujours d'elle-même.

## Types publics

Le paquet exporte les types suivants et `ForceLayout2D` depuis sa racine :

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

Les champs supplémentaires des nœuds et des liens restent possédés par l'application. Le layout ne mute pas les enregistrements d'entrée.

## Options

| Option                 |     Défaut | Signification                                                                                                                                |
| ---------------------- | ---------: | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `repulsion`            |      `300` | Magnitude de répulsion multi-corps non négative par nœud.                                                                                    |
| `collisionRadius`      |        `0` | Rayon non négatif par nœud. Deux nœuds de rayon nul ne se séparent pas.                                                                      |
| `collisionStrength`    |        `1` | Multiplicateur de correction de collision non négatif. Zéro désactive la correction de collision.                                            |
| `linkDistance`         |       `30` | Longueur de repos non négative par lien.                                                                                                     |
| `linkStrength`         |      `0.3` | Raideur de ressort non négative par lien.                                                                                                    |
| `centerStrength`       |     `0.02` | Attraction non négative vers l'origine.                                                                                                      |
| `velocityDecay`        |      `0.6` | Rétention de vélocité par tic, limitée en dessous de `1`.                                                                                    |
| `theta`                |      `0.9` | Angle d'ouverture Barnes-Hut non négatif. Des valeurs plus basses échangent la vitesse contre la précision ; `0` effectue un parcours exact. |
| `repulsionDistanceMax` | `Infinity` | Distance maximale à laquelle les nœuds se repoussent. Une valeur non positive signifie pas de coupure (comme `Infinity`).                    |
| `alphaDecay`           |   `0.0228` | Décroissance de la température par tic, limitée à `[0, 1]` ; une valeur non positive retombe sur la valeur par défaut.                       |
| `alphaMin`             |    `0.001` | Température non négative en dessous de laquelle la simulation est stabilisée.                                                                |
| `seed`                 |        `1` | Graine déterministe pour les nœuds sans coordonnées initiales finies.                                                                        |

Les valeurs d'option non finies retombent sur leurs valeurs par défaut. Les valeurs documentées comme non négatives sont limitées à zéro, avec deux exceptions délibérées qui retombent au lieu de limiter : un `alphaDecay` non positif prend la valeur par défaut `0.0228` (un `0` littéral rendrait la décroissance par tic sans effet et la simulation ne se stabiliserait jamais), et un `repulsionDistanceMax` non positif signifie pas de coupure (il désactivait autrefois entièrement la répulsion). Les accesseurs de nœuds et de liens sont évalués une fois lorsque chaque enregistrement est accepté dans le layout, pas à chaque tic. Les index des accesseurs de nœuds sont des index d'insertion. Les index des accesseurs de liens sont des index stables et contigus à travers une pagination en ajout seul. La suppression de nœuds compacte les liens, de sorte qu'un ajout ultérieur peut réutiliser un index précédemment attribué à un lien supprimé. La suppression de nœuds ne réévalue pas les accesseurs pour les survivants ; utilisez un `setGraph()` frais si les valeurs doivent être dérivées à nouveau. Toutes les options sont uniquement pour le constructeur ; il n'y a pas de setters de forces en direct en 0.3.0.

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

### Positions et avancement

`positions` contient `[x0, y0, x1, y1, ...]` dans l'ordre actuel des nœuds. C'est une vue en direct : le layout met à jour ses valeurs sur place à travers les appels `step()`. Appelez `layout.positions.slice()` lorsque vous avez besoin d'un instantané immuable.

L'objet de vue n'est pas stable à travers les frontières de topologie. Réacquérez toujours `layout.positions` après `setGraph()`, `appendGraph()` ou `removeNodes()` ; un ajout au-delà de la capacité interne réalloue aussi le stockage sous-jacent. Les index des nœuds peuvent changer après une suppression car les survivants sont compactés tout en conservant leur ordre relatif.

Utilisez `getNodeIndex(id)` pour résoudre un ID vers son index actuel et `getNodeId(index)` pour la recherche inverse. Les deux renvoient `undefined` lorsqu'aucun nœud actuel ne correspond. `getNodeIds()` renvoie un instantané dans l'ordre de position actuel ; muter ce tableau n'affecte pas le layout. Les index existants restent stables à travers les mises à jour en ajout seul, tandis que la suppression compacte les survivants.

`step(iterations = 1)` effectue jusqu'à ce nombre de tics synchrones et renvoie `true` si alpha est encore au moins `alphaMin` ensuite. Il s'arrête tôt au refroidissement. Les nombres d'itérations non positifs ou non finis n'effectuent aucun tic et signalent l'état actif actuel ; les nombres sont arrondis à l'inférieur et plafonnés à 10 000 par appel.

### Remplacer, ajouter et supprimer des nœuds

`setGraph(data)` remplace tout l'état, initialise déterministiquement le nouveau graphe et met alpha à `1`. Chaque ID de nœud doit être une chaîne ou un nombre fini et doit être unique ; les IDs invalides ou en double lèvent avant que le graphe existant ne soit effacé.

`appendGraph(data)` préserve les positions, vélocités et broches existantes. Les nœuds dont les IDs sont invalides, déjà présents, ou répétés dans cet ajout sont ignorés, ce qui rend les pages rejouées idempotentes. Les nœuds acceptés sont ajoutés dans l'ordre d'entrée. Les liens acceptés peuvent cibler des nœuds existants ou des nœuds acceptés dans le même appel. Un changement de topologie réchauffe de manière monotone : il peut élever alpha mais ne refroidit jamais une simulation déjà chaude.

Les liens sont sûrs à rejouer par paire d'extrémités orientée plus un `id` optionnel :

- Sans `id`, les liens répétés de `source` vers `target` forment un seul lien.
- La direction compte : `a` vers `b` et `b` vers `a` ont des identités différentes.
- Les liens parallèles nécessitent des IDs distincts de type chaîne ou nombre fini ; les piles de graphe traitent les liens parallèles comme des arêtes distinctes plutôt que de les rejeter.
- Rejouer un lien identifié est ignoré.
- Un ID de lien optionnel malformé est traité comme absent pour l'identité.

La validation des extrémités est stricte et uniforme : un lien dont les extrémités référencent un nœud inconnu ou le même nœud deux fois fait lever `setGraph()` et `appendGraph()`, et `appendGraph()` valide tout le lot avant de muter, si bien qu'un appel rejeté laisse le graphe précédent intact (les références avant vers des nœuds acceptés dans le même lot restent valides). Cela rejoint la politique de `updateLinks()` — les liens pendants étaient autrefois abandonnés silencieusement, ce qui cachait des bugs de données derrière une structure mystérieusement manquante. Les liens avec des IDs optionnels malformés entrent tout de même comme liens non identifiés lorsque leurs extrémités sont valides. Des données de lien malformées ne rendent pas les positions non finies. `removeNodes(ids)` supprime les nœuds correspondants et chaque lien incident, compacte l'état des survivants, recalcule le biais de degré et réchauffe lorsque quelque chose a été supprimé. Les IDs inconnus et un itérable vide sont sans effet.

### Supprimer et mettre à jour des liens

`removeLinks(items)` supprime des liens sans changer aucun index, position, vélocité ou broche de nœud. Passez un lien complet pour faire correspondre ses extrémités orientées plus un ID optionnel, ou passez un `LinkId` nu pour supprimer chaque lien identifié portant cet ID. Les liens survivants conservent leur ordre et leurs valeurs d'accesseur en cache. Les identités inconnues ou déjà supprimées sont sans effet. Un lot réussi recalcule le biais de degré des liens et réchauffe une fois.

`updateLinks(links)` réévalue les accesseurs `linkDistance` et `linkStrength` pour les identités existantes correspondantes. Utilisez-le après avoir changé les champs de lien possédés par l'application consommés par ces accesseurs. Le lot complet est validé d'abord : des extrémités inconnues ou identiques lèvent sans appliquer aucune mise à jour. Une identité qui n'est pas déjà présente est ignorée. Comme les extrémités participent à l'identité du lien, un reroutage nécessite `removeLinks()` suivi de `appendGraph()`. Les valeurs inchangées ne réchauffent pas la simulation.

### Épinglage et réchauffement

Des valeurs initiales finies `fx` et `fy` épinglent les axes indépendamment. Un nœud peut donc avoir un X fixe avec un Y libre, un Y fixe avec un X libre, ou les deux axes fixes. Les `x` et `y` initiaux n'initialisent que leurs axes non épinglés correspondants.

À l'exécution, `setNodePin(id, { x?, y? })` n'épingle que les axes fournis, met immédiatement à jour ces coordonnées en direct, et efface leur vélocité. `clearNodePin(id, { x?, y? })` libère les axes sélectionnés tout en préservant l'autre axe ; omettre l'objet d'axes libère les deux. `pinNode(id, x, y)` et `unpinNode(id)` restent des méthodes de commodité à deux axes. Les IDs inconnus sont ignorés.

**Les épinglages sont adressés par ID** (0.3.0) comme toute autre référence de nœud dans cette classe, donc ils continuent de pointer vers le même nœud après la compaction de `removeNodes()` — un épinglage adressé par index changerait silencieusement de cible vers le nœud arrivé dans cet emplacement. Note de divergence pour le code porté entre piles : le contrat de la famille [`GraphLayout`](/reference/graph3d-layout/) 3D épingle par **index** de nœud à la place, et la gestion des arêtes parallèles diffère aussi — les consommateurs de ce paquet rejettent les quadruplets d'extrémités dupliqués (`duplicate-link` du node-editor) tandis que les piles graph/knowledge traitent les liens parallèles comme des arêtes distinctes. Traduisez les épinglages et l'identité des liens lors du passage d'une pile à l'autre.

Ces appels ne réchauffent pas automatiquement, donc appelez `reheat()` après les opérations interactives d'épinglage ou de désépinglage.

`reheat(alpha = 0.3)` limite la demande à `[alphaMin, 1]` et applique `max(currentAlpha, requestedAlpha)`. Il ne refroidit jamais une simulation plus chaude.

### Glisser un nœud : réchauffer une fois, pas à chaque déplacement

Le défaut lié au glissement le plus courant est d'appeler `reheat()` à **chaque déplacement du pointeur** pendant le glissement d'un nœud épinglé. Cela maintient alpha épinglé près de son maximum, donc les voisins du nœud glissé — tirés par leurs ressorts de lien — continuent de dépasser avec presque aucun amortissement. La simulation a alors besoin de plusieurs secondes pour refroidir après le relâchement du pointeur (alpha décroît d'environ `alphaDecay` par tic, soit environ 300 tics ≈ 5 s à 60 fps), pendant lesquelles tout le voisinage vibre visiblement. Avec un libellé de texte rendu à chaque nœud, cette oscillation rapide se lit comme de la gigue et des images fantômes/rémanentes.

Le bon motif est de ne réchauffer que lorsque le glissement _commence_, puis de mettre à jour la position de la broche à chaque déplacement sans réchauffer :

```ts
function onDragStart(node, x, y) {
  layout.setNodePin(node.id, { x, y }); // épingle au pointeur
  layout.reheat(0.3); // réveille la simulation UNE FOIS
}

function onDragMove(node, x, y) {
  layout.setNodePin(node.id, { x, y }); // déplace la broche — pas de réchauffement ici
}

function onDragEnd(node) {
  layout.clearNodePin(node.id); // ou gardez-le épinglé pour une broche permanente
}
```

Si un suivi à dérive lente semble souhaitable _pendant_ le glissement, augmentez `velocityDecay` (plus d'amortissement) plutôt que de réchauffer à chaque déplacement ; réservez `reheat()` aux changements de topologie, aux réveils explicites et au début du glissement.

### Libération

`dispose()` libère le stockage du graphe et du quadtree, réinitialise `positions` à un tableau vide, et est idempotent. Après la libération, toute autre méthode lève `ForceLayout2D was disposed` ; créez une nouvelle instance plutôt que d'essayer de réutiliser l'ancienne.

## Complexité et capacité

Pour `N` nœuds et `E` liens acceptés, un tic normal construit un quadtree Barnes-Hut et évalue la répulsion en `O(N log N)` attendu, applique les ressorts en `O(E)`, et nettoie, centre et intègre en `O(N)`. Ainsi, le coût de tic habituel sans collisions est `O(N log N + E)`. Ce n'est pas une promesse de pire cas : des distributions spatiales pathologiques ou `theta: 0` peuvent approcher un travail toutes-paires.

Lorsque la collision est activée, le layout construit le quadtree une seconde fois sur les positions prédites et effectue des requêtes de voisinage par rayon via une phase large qui range les points en étages de rayon puissance de deux, chacun avec sa propre grille — le coût de sondage est borné par la densité locale au lieu que chaque nœud atterrisse dans des cellules dimensionnées par le plus grand rayon. Les voisinages épars et localement bornés sont généralement proches de `O(N log N + K)`, où `K` est le travail de candidats/chevauchements, mais des grappes denses ou de très grands rayons peuvent toujours rendre `K` quadratique. La collision n'hérite pas d'une borne inconditionnelle `O(N log N)` de la répulsion Barnes-Hut.

`setGraph()` est `O(N + E)` en dehors de l'allocation géométrique de capacité et de l'initialisation. `appendGraph()` est proportionnel à l'entrée ajoutée plus un recalcul de biais de degré en `O(N + E)` lorsque des liens sont acceptés. `removeLinks()` ne compacte que le stockage des liens et est `O(E + R)` — les IDs nus se résolvent via un index construit paresseusement plutôt que de scanner tous les liens par demande. `updateLinks()` est `O(E + U)` pour `U` mises à jour. Le stockage croît géométriquement, donc la plupart des petits ajouts réutilisent la capacité ; une frontière de croissance copie les tableaux typés existants en `O(N + E)`. `removeNodes()` compacte les nœuds et les liens et recalcule le biais en `O(N + E)`. La suppression ne réduit pas la capacité.

## Preuves mesurées dans le navigateur

Une exécution de diagnostic dans un navigateur avec interface graphique après le biais de degré a mesuré les temps de tic p95 sur le thread principal suivants sur dix échantillons de tics par ligne :

| Charge de 3 000 nœuds | Chrome 151 | Firefox 153 |
| --------------------- | ---------: | ----------: |
| Étoile/hub            |   10.60 ms |     7.84 ms |
| Épars mixte           |    8.09 ms |     7.28 ms |

L'ajout d'une page de 50 nœuds a mesuré **0.145-0.355 ms** sur les quatre lignes navigateur/charge. Chaque ligne d'ajout avait un échantillon de mutation de topologie, donc cette plage est une preuve de diagnostic, pas une estimation de latence de queue. Ces mesures proviennent d'une seule exécution avec interface graphique sur le matériel et l'environnement logiciel de l'exécuteur de tâches, pas de garanties portables. La planification du navigateur, le matériel, l'état d'alimentation, la charge d'arrière-plan, la géométrie du graphe, les options, le préchauffage et la construction des échantillons affectent les résultats. Ce sont des preuves de latence par opération, pas des mesures de FPS ; aucune affirmation de FPS ne peut en être dérivée.

## Migrer depuis `d3-force`

Le mapping conceptuel est direct mais l'API est intentionnellement plus petite :

| `d3-force`                                      | `@vectojs/graph-layout`                                    |
| ----------------------------------------------- | ---------------------------------------------------------- |
| `simulation.nodes(nodes)` et `forceLink(links)` | `layout.setGraph({ nodes, links })`                        |
| `simulation.tick(k)`                            | `layout.step(k)`                                           |
| Champs `x`/`y` de nœuds mutés                   | Vue XY entrelacée `layout.positions`                       |
| `simulation.alpha(value).restart()`             | `layout.reheat(value)` plus une trame planifiée par l'hôte |
| Mutation `node.fx` / `node.fy`                  | `fx`/`fy` initiaux, puis `setNodePin()` / `clearNodePin()` |
| Minuteur interne de d3                          | Pas de minuteur ; l'hôte possède la planification          |

Les liens utilisent des IDs d'extrémités plutôt que des objets d'extrémités mutés par d3. Les accesseurs d'option reçoivent le `GraphNode` ou `GraphLink` d'origine et un index d'insertion, puis sont mis en cache. Il n'y a pas de registre de forces personnalisées en 0.3.0 ; si votre layout d3 dépend de forces personnalisées ou de setters de forces en direct, conservez d3-force ou recréez le layout avec de nouvelles options.

## 2D versus `@vectojs/graph3d`

Utilisez ce paquet pour la physique **2D** indépendante du renderer et les paires XY entrelacées. [`@vectojs/graph3d`](/reference/graph3d/) fournit des implémentations de layout 3D séparées (`D3ForceLayout` et `VectoForceLayout`) et un renderer Three.js ; ses positions sont des triplets XYZ et ses types de graphe/layout ne sont pas interchangeables avec `ForceLayout2D`. Bien que les deux API utilisent un `step()` appelé par l'hôte qui signale s'il reste du travail de simulation, ne passez pas le tampon XY de ce paquet à `Graph3D.applyPositions()`, qui exige des données XYZ.

## Voir aussi

[`@vectojs/graph3d`](/reference/graph3d/) pour les layouts et le rendu 3D ·
[`GraphLayout` et les implémentations de layout 3D](/reference/graph3d-layout/)
