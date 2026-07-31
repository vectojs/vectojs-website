---
title: 'GraphLayout & D3ForceLayout'
description: 'Le modèle de données du graphe et le contrat GraphLayout compatible worker, ainsi que son implémentation D3ForceLayout basée sur d3-force-3d.'
order: 45
---

# `GraphLayout` & `D3ForceLayout`

Partie de [`@vectojs/graph3d`](/reference/graph3d/).

## Modèle de données — `GraphData`

```ts
type NodeId = string | number;

interface GraphNode {
  id: NodeId;
  val?: number; // importance relative ; le renderer met le rayon à l'échelle ∝ ∛val. Par défaut 1.
  color?: string; // couleur CSS ; utilise la nodeColor du renderer par défaut.
  fx?: number; // épingler le nœud à une position x fixe — le layout ne le déplacera pas
  fy?: number;
  fz?: number;
  [key: string]: unknown; // les propriétés du domaine passent sans modification
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

Les objets nœuds ne sont jamais mutés ni par le layout ni par le renderer — les propriétés supplémentaires arbitraires (un libellé, une catégorie, un poids utilisé uniquement par votre propre code) transitent sans modification, faisant ainsi de `GraphData` votre propre modèle d'application plutôt qu'un format dans lequel vous devez convertir puis revenir.

## `GraphLayout` — le contrat de layout

```ts
interface GraphLayout {
  setGraph(data: GraphData): void;
  step(iterations?: number): boolean; // avance la sim, rafraîchit `positions` ; false une fois refroidi
  readonly positions: Float32Array; // triplets xyz, alignés par index avec GraphData.nodes
  // Contrôles d'épinglage optionnels (depuis 0.2.0) — pour le glisser-épingler interactif.
  // GraphInteraction détecte pinNode avant d'activer le glissement.
  pinNode?(nodeIndex: number, x: number, y: number, z: number): void;
  unpinNode?(nodeIndex: number): void; // libère un nœud épinglé pour le rendre à la simulation libre
  reheat?(alpha?: number): void; // augmente alpha pour qu'une simulation refroidie réponde à un épinglage/désépinglage
  dispose(): void; // libère les ressources de la simulation ; l'instance devient inutilisable
}
```

Le contrat est délibérément minimal et compatible worker : les positions sont un seul `Float32Array` plat de triplets xyz dans l'ordre de `GraphData.nodes`, de sorte qu'une implémentation peut vivre entièrement dans un Web Worker et diffuser son tampon par-delà la frontière des threads comme un transferable, sans trafic d'objets par nœud. [`Graph3D.applyPositions()`](/reference/graph3d-renderer/#méthodes) consomme exactement ce même format de tampon directement. `positions` est la **même instance de tableau** réutilisée entre les étapes — copiez-la (`layout.positions.slice()`) si vous avez besoin d'un instantané stable plutôt que d'une vue en direct.

`@vectojs/graph3d` livre une implémentation aujourd'hui ; d'autres adaptateurs (`ngraph`) et modes de layout DAG sont sur la feuille de route du paquet, tous derrière cette même interface, de sorte qu'un renderer ou un hôte worker n'ait jamais besoin de savoir lequel tourne.

## `D3ForceLayout`

```ts
new D3ForceLayout(options?: D3ForceLayoutOptions)

interface D3ForceLayoutOptions {
  linkDistance?: number;   // distance de repos cible des liens. Par défaut 30.
  chargeStrength?: number; // force multi-corps (charge) ; négatif repousse. Par défaut -30.
  alphaMin?: number;       // seuil d'alpha en dessous duquel step() signale le refroidissement. Par défaut 0.001.
}
```

Adapte [d3-force-3d](https://github.com/vasturiano/d3-force-3d) — le même moteur derrière `3d-force-graph` — de sorte que les forces réglées d'un graphe migrent avec leurs sensations intactes. Exécute `forceLink` + `forceManyBody` + `forceCenter` en 3 dimensions.

La simulation d3 mute ses propres enregistrements de nœuds (`x`/`y`/`z`/`vx`/…), donc `setGraph` clone chaque nœud dans un enregistrement de simulation interne plutôt que de lui passer directement vos objets `GraphData.nodes` — seules les broches `fx`/`fy`/`fz` déclarées sont transférées. Le minuteur propre de la simulation n'est jamais démarré ; `step(iterations = 1)` le fait tic synchrone, ce qui permet d'utiliser `D3ForceLayout` dans un Web Worker sans simuler `requestAnimationFrame`.

```ts
layout.step(); // un tic
layout.step(5); // 5 tics en un appel — amortissement moins coûteux par trame
// pour les graphes dont le temps de stabilisation visuelle importe plus
// que la fluidité par tic
```

**Épinglage (depuis 0.2.0).** `D3ForceLayout` implémente les contrôles d'épinglage optionnels via `fx`/`fy`/`fz` de d3-force, ce qui alimente le glisser-épingler de [`GraphInteraction`](/reference/graph3d-renderer/#graphinteraction--survol--sélection--glisser-épingler) :

```ts
layout.pinNode(i, x, y, z); // fixe le nœud i à (x,y,z) à chaque tic ; met aussi à jour positions[i] immédiatement
layout.reheat(0.3); // réveille une simulation refroidie pour que le reste se stabilise autour de la broche
layout.unpinNode(i); // efface fx/fy/fz — le nœud i est à nouveau libre
```

Les index hors limites sont ignorés (une interaction de pointeur obsolète ne peut pas planter le layout), et l'alpha de `reheat` est limité à la plage habituelle `[alphaMin, 1]` de d3.

**Modification des forces en direct.** `D3ForceLayoutOptions` sont uniquement pour le constructeur ; il n'y a pas de setter en direct. Pour appliquer un nouveau `chargeStrength`/`linkDistance` (par exemple depuis un curseur), `dispose()` l'ancienne instance et `setGraph()` une nouvelle — peu coûteux pour les graphes dont la topologie elle-même ne change pas, puisque seule la simulation, pas les tampons GPU de `Graph3D`, est reconstruite :

```ts
function restartLayout() {
  layout.dispose();
  layout = new D3ForceLayout({ chargeStrength, linkDistance });
  layout.setGraph(data);
}
```

## Voir aussi

[`Graph3D` & picking](/reference/graph3d-renderer/) (consomme `positions` directement) ·
[`@vectojs/graph3d` aperçu](/reference/graph3d/)
