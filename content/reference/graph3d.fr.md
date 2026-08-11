+++
title = "@vectojs/graph3d"
description = "Visualisation de graphes 3D à ressort : une interface GraphLayout enfichable associée à un renderer Three.js instancié qui dessine n'importe quel graphe en deux appels de dessin."
weight = 44

[extra]
order = 44
+++

# `@vectojs/graph3d`

Version documentée : **0.2.1**

Visualisation de graphes 3D à ressort pour VectoJS : un contrat `GraphLayout` enfichable (compatible avec les workers, positions sous forme d'un seul `Float32Array`) associé à `Graph3D`, un renderer Three.js instancié qui dessine n'importe quel graphe — peu importe le nombre de nœuds — en exactement deux appels de dessin. Voir la démo live [Les Misérables](/demos/graph3d/) pour le jeu de données canonique de 77 nœuds et 254 liens en mouvement.

## Installation

```bash
bun add @vectojs/graph3d three
```

`three` est une dépendance directe — `@vectojs/graph3d` dessine dans un `THREE.Group` que vous ajoutez à votre propre scène, et ne gère pas lui-même le `WebGLRenderer`, la caméra ou les contrôles.

## Usage

```ts
import { D3ForceLayout, Graph3D } from '@vectojs/graph3d';
import * as THREE from 'three';

const data = {
  nodes: [{ id: 'vectojs', val: 8, color: '#4f9cff' }, { id: 'core' }, { id: 'ui' }],
  links: [
    { source: 'vectojs', target: 'core' },
    { source: 'vectojs', target: 'ui' },
  ],
};

const layout = new D3ForceLayout();
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

## Pages de référence

| Page                                                          | Couvre                                                                                                                                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/) | Le modèle de données `GraphData`, le contrat `GraphLayout` compatible worker, les options de `D3ForceLayout` et le motif de redémarrage des forces.                           |
| [`Graph3D` & picking](/reference/graph3d-renderer/)           | Le renderer Three.js instancié (`setGraphData`/`applyPositions`/`pickNode`/`getNodePosition`/`dispose`) ainsi que `GraphInteraction` — survol, sélection et glisser-épingler. |

---

## Notes de conception

- **Conçu pour les workers.** L'interface `GraphLayout` existe spécifiquement pour qu'une simulation physique puisse s'exécuter hors du thread principal — `positions` est un `Float32Array`, transférable par `postMessage` sans copie, et `Graph3D.applyPositions()` n'a jamais besoin de savoir si ce tampon provient d'un appel synchrone ou d'un message de worker.
- **Séparation totale renderer/disposition.** `Graph3D` n'importe jamais de classe de layout et une implémentation de `GraphLayout` n'importe jamais Three.js — remplacer `D3ForceLayout` par un futur adaptateur `ngraph`, ou une disposition statique/précalculée sans simulation, est un changement d'une seule ligne au site d'appel.
- **Fiches de nœuds interactives et composants HUD** construits sur `@vectojs/ui` et [`@vectojs/three`](/reference/three/) (billboards scène-vers-texte qui fonctionnent aussi dans WebXR) sont la prochaine couche prévue au-dessus de ce paquet — pas encore livrée.

## Pages recommandées de la doc

- **Apprendre / Visualisation de graphes 3D** — séparation layout vs renderer, réglage des forces de `D3ForceLayout`, picking et layouts hébergés dans un worker.
- **Référence / API** — [`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/), [`Graph3D` & picking](/reference/graph3d-renderer/).
