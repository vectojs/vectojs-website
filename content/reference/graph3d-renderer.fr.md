+++
title = "Graph3D & picking"
description = "Le renderer Three.js instancié qui dessine n'importe quel graphe en deux appels de dessin, plus le modèle de raycasting pour le picking de nœuds au survol/au clic."
weight = 46
+++

# `Graph3D` & picking

Partie de [`@vectojs/graph3d`](/reference/graph3d/). Consomme le tampon `positions` d'un [`GraphLayout`](/reference/graph3d-layout/).

## `Graph3D` — le renderer

```ts
new Graph3D(options?: Graph3DOptions)

interface Graph3DOptions {
  nodeRadius?: number;   // rayon de base du nœud avant mise à l'échelle par val. Par défaut 4.
  nodeSegments?: number; // tessellation de la sphère (segments largeur/hauteur). Par défaut 12.
  nodeColor?: string;    // couleur de repli pour les nœuds qui n'en déclarent pas. Par défaut '#4f9cff'.
  linkColor?: string;    // couleur des lignes de lien. Par défaut '#9aa4b2'.
  linkOpacity?: number;  // opacité des lignes de lien. Par défaut 0.35.
}
```

### Propriété publique

```ts
graph.group: THREE.Group // ajoutez ceci à votre scène ; possède le maillage des nœuds + les lignes de liens
```

### Méthodes

```ts
setGraphData(data: GraphData): void
// Reconstruit les ressources GPU pour un nouveau graphe : un InstancedMesh (nodeCount
// instances d'une SphereGeometry partagée, couleur par instance + échelle ∛val) et
// un LineSegments (linkCount segments). Les tampons instanciés sont de taille fixe, donc
// un changement du nombre de nœuds/liens nécessite de nouveaux maillages — les changements
// de style uniquement sur la MÊME topologie sont assez peu coûteux pour ne pas nécessiter
// un chemin séparé. Une extrémité de lien inconnue (un id source/cible absent de
// `data.nodes`) déclenche une erreur plutôt que de dessiner silencieusement une ligne vers l'origine.

applyPositions(positions: Float32Array): void
// Écrit les triplets xyz (par ex. le `.positions` d'un GraphLayout) dans les matrices
// de nœuds instanciés et les extrémités de liens. À appeler après chaque étape de layout
// qui a déplacé quelque chose ; assez peu coûteux pour être appelé à chaque trame
// pendant qu'une simulation tourne.

pickNode(raycaster: THREE.Raycaster): number | null   // depuis 0.2.0
// Teste d'intersection uniquement le nuage de nœuds avec un raycaster configuré par l'appelant
// (configuré à partir de la caméra + des coordonnées NDC du pointeur) et renvoie l'index
// du nœud le plus proche touché — aligné avec le tableau `GraphData.nodes`
// — ou `null` en cas d'échec. Les liens ne sont jamais sélectionnés,
// donc un rayon effleurant une ligne de lien signale un échec.

getNodePosition(index: number, target: THREE.Vector3): THREE.Vector3 | null   // depuis 0.2.0
// Lit la position mondiale actuelle d'un nœud (telle qu'écrite par applyPositions)
// directement depuis sa matrice d'instance dans `target`. `null` pour un index
// hors limites ou lorsque le maillage du nœud n'existe pas.

dispose(): void
// Libère les ressources GPU de géométrie/matériau/maillage pour le maillage des nœuds et
// les lignes de liens, et vide `group`.
```

Un `InstancedMesh` pour chaque nœud (couleur par instance et rayon proportionnel à `∛val`) plus un `LineSegments` pour chaque lien, tous deux sous un seul `THREE.Group` — tout l'intérêt de l'instanciation est que la taille du graphe coûte exactement **deux appels de dessin**, que le graphe ait 10 nœuds ou 10 000. `Graph3D` consomme n'importe quel tampon de positions au format [`GraphLayout`](/reference/graph3d-layout/) et n'a aucune idée de comment ces nombres ont été calculés, ce qui permet d'échanger les layouts (ou de les héberger dans un worker) sans toucher au code de rendu.

Les lignes de liens ont `frustumCulled = false` — les extrémités bougent à chaque tic de layout, et recalculer les limites par trame pour ce qui est typiquement un élément d'arrière-plan est un travail gaspillé comparé à simplement toujours les dessiner.

## Picking (survol / clic)

Depuis 0.2.0, `pickNode()` teste d'intersection **uniquement** le nuage de nœuds, vous n'avez donc plus à faire manuellement `intersectObjects` + filtrage par `instanceId` sur les enfants mixtes nœuds/liens. Configurez un `THREE.Raycaster` depuis la caméra et les coordonnées NDC du pointeur, puis lisez l'index du nœud touché (aligné avec `GraphData.nodes`) :

```ts
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;

  raycaster.setFromCamera(ndc, camera);
  const index = graph.pickNode(raycaster); // number | null ; les liens ne correspondent jamais
  const node = index !== null ? data.nodes[index] : null;
});
```

## `GraphInteraction` — survol / sélection / glisser-épingler

Depuis 0.2.0, `GraphInteraction` encapsule la gestion des pointeurs ci-dessus en survol, sélection et glisser-épingler — l'élément que toute application interactive de graphes 3D reconstruirait autrement à la main. Il possède trois écouteurs de pointeur sur `domElement` et rien d'autre : pas de scène, pas de boucle de rendu, pas de contrôles. L'hôte continue de piloter sa propre boucle d'animation et son `step()` de layout.

```ts
const interaction = new GraphInteraction({
  graph, // le Graph3D
  camera, // la caméra à partir de laquelle les rayons de picking sont construits
  domElement: canvas, // élément dont les événements de pointeur sont lus
  layout, // GraphLayout ; requis pour le glisser-épingler (nécessite pinNode)
  nodeCount: data.nodes.length, // garde d'index optionnelle
  onHover: (i) => {
    /* i: number | null */
  },
  onSelect: (i) => {
    /* clic qui n'était pas un glissement ; null = désélection par espace vide */
  },
  setControlsEnabled: (enabled) => (controls.enabled = enabled), // suspend OrbitControls pendant le glissement
});
// …plus tard
interaction.dispose(); // supprime les écouteurs de pointeur
```

Le glissement est **détecté par fonctionnalité** : sans un layout capable d'épinglage (une implémentation de `pinNode`, comme la fournit [`D3ForceLayout`](/reference/graph3d-layout/)), une pression revient à une sélection. `onDragStart`/`onDrag`/`onDragEnd`, `pinOnDrag` (par défaut `true`), `dragReheat` (par défaut `0.3`), et `dragThreshold` (par défaut `4` px) complètent les options.

## Voir aussi

[`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/) (produit le tampon `positions` que ce renderer consomme, et le `pinNode` sur lequel repose le glisser-épingler) ·
[`@vectojs/graph3d` aperçu](/reference/graph3d/)
