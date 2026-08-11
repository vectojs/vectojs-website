+++
title = "Cas d'usage"
description = "Là où VectoJS s'intègre le mieux : tableaux de bord, UI en streaming, canvas infinis, jeux, éditeurs, WebXR et sites interactifs avancés."
weight = 5

[extra]
order = 5
+++

# Cas d'usage

VectoJS fonctionne au mieux lorsque l'UI se comporte comme une scène vivante : de nombreux objets, une géométrie personnalisée, des mises à jour à haute fréquence, ou des surfaces de rendu non-DOM.

<figure>
  <img src="/images/use-cases-map.svg" alt="Carte des cas d'usage avec VectoJS au centre relié à la visualisation de données, l'UI en streaming, les canvas infinis, les jeux et médias, les éditeurs et outils, et les panneaux WebXR." class="diagram" />
  <figcaption>VectoJS est le plus fort sur les surfaces denses, de type scène, où la géométrie personnalisée et l'automatisation sémantique comptent toutes deux.</figcaption>
</figure>

## Visualisation de données et tableaux de bord

Les graphiques, visualiseurs de topologie, traces et tableaux de bord en temps réel ont souvent besoin de centaines ou de milliers de primitives animées. VectoJS conserve les entités visuelles en JavaScript et évite un nœud DOM stylisé par point, ligne ou arête.

Bonnes adéquations :

- carnets d'ordres financiers ;
- visualiseurs de topologie Kubernetes ;
- graphes de réseau en direct ;
- traces et chronologies de surveillance ;
- surfaces d'analytique à haute fréquence.

## UI en streaming

Les clients LLM, danmaku, flux d'événements et chat en direct bénéficient d'une mise en page incrémentale et d'un rendu canvas. `RichText.appendSpans()` et `Markdown.appendMarkdown()` permettent à l'application d'ajouter du contenu en streaming sans reconstruire chaque objet visible à partir de zéro.

Bonnes adéquations :

- clients de chat IA ;
- superpositions de commentaires vidéo ;
- journaux et flux d'événements en direct ;
- Markdown diffusé avec code, tableaux et diagrammes.

## Canvas infinis et graphes

Les tableaux blancs, éditeurs de nœuds et graphes de connaissances ont besoin de pan/zoom, de hit-testing personnalisé et d'élimination (culling). VectoJS fournit le graphe de scène et le modèle de rendu/événement ; les applications peuvent ajouter leur propre stratégie d'indexation pour de très grands ensembles de données.

Bonnes adéquations :

- tableaux blancs collaboratifs ;
- cartes mentales et graphes de connaissances ;
- éditeurs de nœuds ;
- outils de chronologie et de diagramme.

## Jeux et médias interactifs

`update(dt)`, les drivers d'animation, les systèmes de particules et les entités personnalisées sont utiles pour les jeux browser-native et les simulations éducatives sans adopter un moteur de jeu complet.

Bonnes adéquations :

- interactions de type rythme/jeu ;
- bacs à sable physiques ;
- animations explicatives ;
- supports de cours interactifs.

## Éditeurs et outils de développement

Les éditeurs basés sur canvas ont besoin d'un contrôle explicite sur le texte, les visuels de sélection, les curseurs, les minicartes et les superpositions. VectoJS peut fournir le runtime visuel tandis que les composants natifs `Input`/`TextArea` conservent le comportement d'édition du navigateur là où cela compte.

Bonnes adéquations :

- visualiseurs de diff ;
- surfaces de type terminal ;
- éditeurs canvas riches ;
- outils de trace/journal.

## WebXR et interfaces 3D

`@vectojs/three` rend une scène VectoJS vers une `THREE.CanvasTexture`, puis mappe les UV de raycast vers la scène 2D. Cela permet des panneaux VectoJS en direct à l'intérieur de Three.js et de WebXR.

Bonnes adéquations :

- contrôles dans le monde (in-world) ;
- tableaux de bord VR/AR ;
- panneaux d'instruments ;
- outils de développement spatiaux.

## Sites web interactifs avancés

VectoJS peut alimenter les parties d'un site qui nécessitent physique, champs de particules, typographie magnétique, art génératif ou interaction sur mesure. Conservez la structure documentaire environnante en HTML/CSS et n'intégrez VectoJS que là où le modèle de scène est rentable.

## Liste de contrôle d'adéquation

Utilisez VectoJS si la plupart des réponses sont « oui » :

- L'UI comporte-t-elle de nombreux objets en mouvement ou testés individuellement au survol ?
- A-t-elle besoin d'une mise en page ou de transformations définies par les mathématiques ?
- A-t-elle besoin d'un rendu canvas/WebGL/WebGPU ?
- A-t-elle toujours besoin d'accessibilité et d'automatisation basée sur les rôles ?
- La mise en page DOM/CSS deviendrait-elle le goulot d'étranglement ou la mauvaise abstraction ?

Si la plupart des réponses sont « non », commencez par HTML/CSS et un framework applicatif conventionnel.

## Prochaines étapes

- [Prise en main](/learn/getting-started/) pour une première scène.
- [Performance](/learn/performance/) pour des conseils de mesure et de mise à l'échelle.
- [@vectojs/three](/reference/three/) pour l'intégration 3D.
