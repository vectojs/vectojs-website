+++
title = "@vectojs/graph3d"
description = "Visualisation de graphes 3D à ressort : une interface GraphLayout enfichable associée à un renderer Three.js instancié qui dessine n'importe quel graphe en deux appels de dessin."
weight = 44
+++

# `@vectojs/graph3d`

Version documentée : **0.6.1**

Visualisation de graphes 3D à ressort pour VectoJS : un contrat `GraphLayout` enfichable (compatible avec les workers, positions sous forme d'un seul `Float32Array`) associé à `Graph3D`, un renderer Three.js instancié qui dessine n'importe quel graphe — peu importe le nombre de nœuds — en exactement deux appels de dessin. Voir la démo live [Les Misérables](/demos/graph3d/) pour le jeu de données canonique de 77 nœuds et 254 liens en mouvement.

## Installation

```bash
bun add @vectojs/graph3d three
```

`three` est une dépendance directe — `@vectojs/graph3d` dessine dans un `THREE.Group` que vous ajoutez à votre propre scène, et ne gère pas lui-même le `WebGLRenderer`, la caméra ou les contrôles.

## Usage

```ts
import { VectoForceLayout, Graph3D } from '@vectojs/graph3d';
import * as THREE from 'three';

const data = {
  nodes: [{ id: 'vectojs', val: 8, color: '#4f9cff' }, { id: 'core' }, { id: 'ui' }],
  links: [
    { source: 'vectojs', target: 'core' },
    { source: 'vectojs', target: 'ui' },
  ],
};

const layout = new VectoForceLayout();
layout.setGraph(data);

const graph = new Graph3D();
graph.setGraphData(data);
scene.add(graph.group);

function animate() {
  const active = layout.step();
  graph.applyPositions(layout.positions);
  renderer.render(scene, camera);
  if (active) requestAnimationFrame(animate);
}
animate();
```

`layout.step()` renvoie `false` une fois la simulation refroidie (alpha en dessous du seuil) — l'exemple ci-dessus arrête alors sa propre boucle rAF, mais un appelant qui laisse l'utilisateur ajuster les forces en direct (charge des nœuds, distance des liens) devrait continuer le rendu à chaque trame et seulement conditionner l'appel `step()`/`applyPositions()` de la physique sur ce drapeau, afin que l'amortissement des `OrbitControls` et les mouvements de caméra restent fluides même après la stabilisation de la disposition.

`VectoForceLayout` (le layout maison à octree Barnes-Hut, sans dépendance d'exécution) est la valeur par défaut ; [`D3ForceLayout`](/reference/graph3d-layout/#d3forcelayout) reste disponible mais nécessite `d3-force-3d`. Les deux sont interchangeables à chaud derrière le même contrat `GraphLayout`.

## GraphCamera

Depuis 0.4.0, `GraphCamera` est une caméra + contrôles tout-en-un pour les hôtes qui n'apportent pas leurs propres contrôles Three.js : une vue 2D orthographique de panoramique/zoom et une vue 3D perspective orbitale derrière un unique getter `camera`.

```ts
import { GraphCamera } from '@vectojs/graph3d';

const camera = new GraphCamera({ domElement: canvas, mode: '3d' }); // '2d' (ortho) est le défaut
camera.fitToPositions(layout.positions); // cadre le graphe ; ignore les points non finis
camera.setMode('2d'); // passe au panoramique/zoom orthographique
camera.setSize(width, height); // à appeler au redimensionnement du canvas
camera.dispose(); // supprime les écouteurs pointeur/molette
```

`mode: '2d' | '3d'` sélectionne le type de caméra ; `fitToPositions(positions)` cadre un tampon de triplets xyz (la même forme que consomme [`applyPositions`](/reference/graph3d-renderer/#méthodes)). Associez-le à `GraphInteraction` en passant `() => camera.camera` (un getter, de sorte que `setMode` reste actif) et en câblant `setControlsEnabled` pour qu'un glissement de nœud ne panoramique pas aussi la vue.

## Noyau de force WASM

`VectoForceLayout` livre un noyau de force Rust/WASM optionnel (`crates/vectojs-force-rs`, publié sous forme d'un `vectojs_force.wasm` co-localisé) qui accélère la construction de l'octree Barnes-Hut + l'accumulation de répulsion — soit 78–90 % mesurés d'un tic. En cas d'échec de chargement/d'instanciation, il renvoie silencieusement `false` et conserve le Barnes-Hut JS identique bit à bit, de sorte qu'il est sûr de l'activer de manière spéculative.

```ts
import { forceWasmUrl } from '@vectojs/graph3d/wasm';

await layout.enableWasmForce(forceWasmUrl); // streaming (navigateur) : URL | Response
layout.enableWasmForceSync(bytes); // octets bruts (Node/tests), ne récupère jamais
```

Le noyau n'a aucune dépendance `@vectojs/core` — `three` reste le seul pair. Voir [`VectoForceLayout`](/reference/graph3d-layout/#vectoforcelayout) pour l'API complète du layout, y compris l'option de profilage `measurePhases`.

## Pages de référence

| Page                                                          | Couvre                                                                                                                                                                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/) | Le modèle de données `GraphData`, le contrat `GraphLayout` compatible worker, les options de `VectoForceLayout` (défaut) et de `D3ForceLayout`, le noyau WASM, et le motif de redémarrage des forces. |
| [`Graph3D` & picking](/reference/graph3d-renderer/)           | Le renderer Three.js instancié (`setGraphData`/`applyPositions`/`pickNode`/`getNodePosition`/`dispose`) ainsi que `GraphInteraction` — survol, sélection et glisser-épingler.                         |

---

## Notes de conception

- **Conçu pour les workers.** L'interface `GraphLayout` existe spécifiquement pour qu'une simulation physique puisse s'exécuter hors du thread principal — `positions` est un `Float32Array`, transférable par `postMessage` sans copie, et `Graph3D.applyPositions()` n'a jamais besoin de savoir si ce tampon provient d'un appel synchrone ou d'un message de worker.
- **Séparation totale renderer/disposition.** `Graph3D` n'importe jamais de classe de layout et une implémentation de `GraphLayout` n'importe jamais Three.js — remplacer `VectoForceLayout` par `D3ForceLayout`, une disposition statique/précalculée sans simulation du tout, ou un futur adaptateur `ngraph` est un changement d'une seule ligne au site d'appel.
- **Fiches de nœuds interactives et composants HUD** construits sur `@vectojs/ui` et [`@vectojs/three`](/reference/three/) (billboards scène-vers-texte qui fonctionnent aussi dans WebXR) sont la prochaine couche prévue au-dessus de ce paquet — pas encore livrée.

## Pages recommandées de la doc

- **Apprendre / Visualisation de graphes 3D** — séparation layout vs renderer, réglage des forces de `VectoForceLayout`, picking et layouts hébergés dans un worker.
- **Référence / API** — [`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/), [`Graph3D` & picking](/reference/graph3d-renderer/).
