+++
title = "GraphLayout & D3ForceLayout"
description = "Le modèle de données du graphe et le contrat GraphLayout compatible worker, ainsi que son implémentation D3ForceLayout basée sur d3-force-3d."
weight = 45
+++

# `GraphLayout` & `D3ForceLayout`

Partie de [`@vectojs/graph3d`](/reference/graph3d/).

Version documentée : **0.6.0**

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

`@vectojs/graph3d` livre deux implémentations derrière ce contrat aujourd'hui — la propre [`VectoForceLayout`](#vectoforcelayout) (octree Barnes–Hut, sans dépendance d'exécution ; la valeur par défaut) et [`D3ForceLayout`](#d3forcelayout) (un adaptateur `d3-force-3d`, conservé pour la parité avec un réglage d3 existant) — plus des modes de layout DAG sur la feuille de route du paquet, tous derrière cette même interface, de sorte qu'un renderer ou un hôte worker n'ait jamais besoin de savoir lequel tourne.

## `D3ForceLayout`

L'alternative adossée à d3-force-3d à la [`VectoForceLayout`](#vectoforcelayout) par défaut. Elle nécessite `d3-force-3d` ; préférez `VectoForceLayout` sauf si vous migrez un graphe avec des forces d3 réglées et voulez conserver la sensation intacte.

```ts
new D3ForceLayout(options?: D3ForceLayoutOptions)

interface D3ForceLayoutOptions {
  linkDistance?: number;   // distance de repos cible des liens. Par défaut 30.
  chargeStrength?: number; // force multi-corps (charge) ; négatif repousse. Par défaut -30.
  alphaMin?: number;       // seuil d'alpha en dessous duquel step() signale le refroidissement. Par défaut 0.001.
}
```

Adapte [d3-force-3d](https://github.com/vasturiano/d3-force-3d) — le même moteur derrière `3d-force-graph` — de sorte que les forces réglées d'un graphe migrent avec leurs sensations intactes. Exécute `forceLink` + `forceManyBody` + `forceCenter` en 3 dimensions.

La simulation d3 mute ses propres enregistrements de nœuds (`x`/`y`/`z`/`vx`/…), donc `setGraph` clone chaque nœud dans un enregistrement de simulation interne plutôt que de lui passer directement vos objets `GraphData.nodes` — seules les broches `fx`/`fy`/`fz` déclarées et les éventuelles positions initiales `x`/`y`/`z` sont transférées. Le minuteur propre de la simulation n'est jamais démarré ; `step(iterations = 1)` le fait tic synchrone, ce qui permet d'utiliser `D3ForceLayout` dans un Web Worker sans simuler `requestAnimationFrame`.

## `VectoForceLayout`

```ts
new VectoForceLayout(options?: VectoForceLayoutOptions)

interface VectoForceLayoutOptions {
  linkDistance?: number;   // distance de repos cible des liens. Par défaut 30.
  linkStrength?: number;   // raideur du ressort des liens. Par défaut 0.3.
  repulsion?: number;      // force de répulsion multi-corps. Par défaut 300.
  centerStrength?: number; // attraction vers le centroïde. Par défaut 0.02.
  velocityDecay?: number;  // amortissement de la vélocité par étape. Par défaut 0.6.
  theta?: number;          // angle d'ouverture de Barnes–Hut. Par défaut 0.9.
  alphaDecay?: number;     // taux de refroidissement. Par défaut 0.0228 ; 0 désactive le refroidissement.
  alphaMin?: number;       // alpha en dessous duquel step() signale le refroidissement. Par défaut 0.001.
  seed?: number;           // graine RNG pour un placement déterministe. Par défaut 1.
  measurePhases?: boolean; // profilage par tic opt-in. Par défaut false.
}
```

Le layout maison (ajouté en 0.3.0, et la valeur par défaut) : une simulation dirigée par forces avec un octree Barnes–Hut pour le terme multi-corps — sans dépendance d'exécution, déterministe sous un `seed`, et sûr dans un Web Worker (le même contrat `step(iterations)` que `D3ForceLayout`). Les positions et les vélocités sont conservées en **f32** (correspondant au `Float32Array` exposé), tandis que l'octree accumule les centres de masse et l'intégrale de répulsion en **f64**. Choisissez-le lorsque vous voulez des résultats identiques entre les exécutions ; réglez avec `repulsion`/`linkStrength`, et augmentez `alphaDecay` au-dessus de zéro avec précaution — il est déjà près du bord de refroidissement, donc une valeur plus élevée fige le graphe plus tôt plutôt que plus tard.

```ts
layout.step(); // un tic
layout.step(5); // 5 tics en un appel — amortissement moins coûteux par trame
// pour les graphes dont le temps de stabilisation visuelle importe plus
// que la fluidité par tic
```

**Profilage par phase (depuis 0.5.0).** Réglez `measurePhases: true` pour que chaque tic enregistre son temps horloge réparti entre `[construction de l'octree, accumulation des forces, ressorts des liens, intégration]` dans `layout.tickPhases` (un 4-uplet `readonly` de millisecondes ; `null` quand le profilage est désactivé). Les appels de mesure sont autrement éliminés, donc le chemin chaud ne paie rien.

**Noyau de force WASM (depuis 0.5.0).** Un noyau Rust/WASM opt-in (`crates/vectojs-force-rs`) accélère la construction de l'octree + l'accumulation de répulsion — la phase dominante d'un tic — tandis que les ressorts des liens, le centrage, l'intégration et les broches restent en JS :

```ts
import { forceWasmUrl } from '@vectojs/graph3d/wasm';

await layout.enableWasmForce(forceWasmUrl); // async ; string | URL | Response
layout.enableWasmForceSync(bytes); // sync ; BufferSource, ne récupère jamais
```

Les deux renvoient `false` en cas d'échec (CSP, 404, module corrompu) et conservent silencieusement le Barnes-Hut JS identique bit à bit, qui est le repli permanent et l'oracle différentiel. Le noyau n'a aucune dépendance `@vectojs/core`.

**Épinglage (depuis 0.2.0).** `D3ForceLayout` et `VectoForceLayout` implémentent tous deux les contrôles d'épinglage optionnels (d3 via `fx`/`fy`/`fz`, `VectoForceLayout` via ses propres tableaux de broches), ce qui alimente le glisser-épingler de [`GraphInteraction`](/reference/graph3d-renderer/#graphinteraction--survol--sélection--glisser-épingler) :

```ts
layout.pinNode(i, x, y, z); // fixe le nœud i à (x,y,z) à chaque tic ; met aussi à jour positions[i] immédiatement
layout.reheat(0.3); // réveille une simulation refroidie pour que le reste se stabilise autour de la broche
layout.unpinNode(i); // efface fx/fy/fz — le nœud i est à nouveau libre
```

Les index hors limites sont ignorés (une interaction de pointeur obsolète ne peut pas planter le layout), et l'alpha de `reheat` est limité à `[alphaMin, 1]`.

**Modification des forces en direct.** `D3ForceLayoutOptions` sont uniquement pour le constructeur ; il n'y a pas de setter en direct. Pour appliquer un nouveau `chargeStrength`/`linkDistance` (par exemple depuis un curseur), `dispose()` l'ancienne instance et `setGraph()` une nouvelle — peu coûteux pour les graphes dont la topologie elle-même ne change pas, puisque seule la simulation, pas les tampons GPU de `Graph3D`, est reconstruite :

```ts
function restartLayout() {
  layout.dispose();
  layout = new D3ForceLayout({ chargeStrength, linkDistance });
  layout.setGraph(data);
}
```

`VectoForceLayoutOptions` sont de même uniquement pour le constructeur, donc le même motif de redémarrage s'applique lorsque vous changez ses forces.

## Voir aussi

Pour un layout de force **2D** indépendant du renderer, des mises à jour incrémentales de la topologie et des positions XY entrelacées, utilisez [`@vectojs/graph-layout`](/reference/graph-layout/). C'est un paquet séparé ; son `ForceLayout2D` et son tampon XY n'implémentent pas le contrat `GraphLayout` 3D de cette page ni sa forme de position XYZ. Les deux API renvoient un booléen actif/refroidi depuis un `step()` piloté par l'hôte, mais leurs types de layout et leurs tampons de position ne sont pas interchangeables.

[`Graph3D` & picking](/reference/graph3d-renderer/) (consomme `positions` directement) ·
[`@vectojs/graph3d` aperçu](/reference/graph3d/)
