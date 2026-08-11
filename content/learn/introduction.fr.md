+++
title = "Introduction à VectoJS"
description = "Un aperçu concis de ce qu'est VectoJS, à quoi il sert et où aller ensuite."
weight = 1

[extra]
order = 1
+++

# Introduction à VectoJS

**VectoJS** est un runtime UI canvas-native pour les interfaces dont la complexité visuelle ou interactive ne cadre pas avec le modèle « un élément DOM par chose ». Il conserve l'arbre visible dans un graphe d'entités JavaScript — le **Virtual Math Tree** — et peint le résultat sur des couches adossées au canvas.

Les composants interactifs peuvent toujours projeter de vrais nœuds DOM sémantiques (`<button>`, `<input>`, `<a>`, etc.) au-dessus du canvas. C'est cette projection qui maintient les contrôles VectoJS accessibles, capables de saisie native et testables via une automatisation basée sur les rôles.

<figure>
  <img src="/images/intro-runtime-map.svg" alt="Carte du runtime VectoJS montrant l'état de l'application s'écoulant dans le Virtual Math Tree, puis dans la mise en page, le hit-testing, le rendu canvas ou GPU, et la projection DOM sémantique." class="diagram" />
  <figcaption>L'état de l'application met à jour un unique graphe de scène retenu ; le graphe pilote ensuite les pixels, la mise en page, les événements et la sémantique.</figcaption>
</figure>

## Ce que vous devriez lire ensuite

L'ancienne introduction en une seule page a été divisée en chapitres ciblés :

| Si vous voulez comprendre…                                                      | Lisez                                                    |
| ------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Pourquoi VectoJS existe et quand le DOM devient le mauvais outil                | [Pourquoi VectoJS](/learn/why-vectojs/)                  |
| Comment le runtime, la boucle de rendu et la projection sémantique s'assemblent | [Architecture d'exécution](/learn/runtime-architecture/) |
| Les huit idées mathématiques/moteur fondamentales derrière l'implémentation     | [Concepts du moteur](/learn/engine-concepts/)            |
| Quelles catégories de produits conviennent bien, et lesquelles non              | [Cas d'usage](/learn/use-cases/)                         |
| Comment construire la première scène fonctionnelle                              | [Prise en main](/learn/getting-started/)                 |

## La version courte

Utilisez VectoJS lorsque vous avez besoin de :

- des milliers d'entités visuelles sans des milliers de nœuds DOM stylisés ;
- des transformations, courbes, hit-testing et une mise en page mathématique précis ;
- des visuels à l'échelle du canvas avec une accessibilité et une automatisation basées sur les rôles ;
- un volume de données élevé, une UI en streaming, des jeux, des diagrammes ou des panneaux WebXR ;
- un pas déterministe pour les tests, la simulation et l'export vidéo.

Préférez le HTML/CSS classique lorsque vous construisez un site orienté document, de la prose lourde en SEO, des formulaires ordinaires ou une UI qui n'a pas besoin de mathématiques de mise en page personnalisées.

## Carte des paquets

| Paquet                    | Objectif                                                                                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@vectojs/core`           | `Scene`, `Entity`, renderers, événements, hit-testing, projection a11y. Dépend des moteurs ci-dessous et les re-exporte, de sorte que vous pouvez tout importer depuis `@vectojs/core`. |
| `@vectojs/text`           | Primitives autonomes de mise en forme du texte : résolution BiDi, mise en forme arabe, typographie à parité CSS, polices MSDF, grilles de contenu préparées                             |
| `@vectojs/layout`         | Moteur de mise en page autonome : césure des lignes, mise en page inline sensible au BiDi, flux d'exclusion, worker de mise en page hors thread                                         |
| `@vectojs/math`           | Mathématiques spatiales/physiques autonomes : broad-phase `SpatialHashGrid` et `SpringPhysics`                                                                                          |
| `@vectojs/animation`      | Bibliothèque d'easing autonome plus les value drivers `TweenDriver` et `SpringDriver`                                                                                                   |
| `@vectojs/ui`             | Composants de haut niveau : `Button`, `Input`, `Toggle`, `ScrollView`, `Dropdown`, `Table`, et plus. Zéro dépendance à l'exécution.                                                     |
| `@vectojs/markdown`       | Entités `Markdown` + `CodeBlock` (analyse avec `marked`, rendu des maths TeX avec `@vectojs/tex`), construites sur `@vectojs/ui`                                                        |
| `@vectojs/three`          | Projeter une scène VectoJS sur une texture Three.js et router la saisie par raycast vers le 2D                                                                                          |
| `@vectojs/devtools`       | Inspecteur du Virtual Math Tree intégré à la page : arbre d'entités, clic pour sélectionner, lecture de géométrie en direct                                                             |
| `@vectojs/graph3d`        | Visualisation de graphe 3D à forces dirigées (renderer Three.js instancié)                                                                                                              |
| `@vectojs/video-exporter` | Export H.264 à pas fixe via Chromium + FFmpeg pour les scènes VectoJS                                                                                                                   |

Les moteurs de mise en page, de texte, de mathématiques et d'animation sont publiés comme leurs propres paquets afin de pouvoir être consommés sans le runtime du graphe de scène. `@vectojs/core` dépend de tous et les re-exporte, de sorte que le code `import { … } from '@vectojs/core'` existant continue de fonctionner sans changement — n'utilisez les paquets autonomes que lorsque vous voulez une surface de dépendances plus réduite.

## Modèle mental

VectoJS n'est pas un remplacement de React, ni un ECS, ni une promesse d'allocation nulle. C'est un runtime UI canvas en mode retenu :

1. l'état de l'application met à jour les entités ;
2. les entités calculent la mise en page, les transformations, les tests de survol et la sémantique ;
3. les scènes « sales » sont rendues via le backend sélectionné ;
4. les nœuds DOM projetés exposent la surface interactive aux technologies d'assistance et aux agents.

Le reste de ce guide parcourt ces compromis en détail.

## Prochaines étapes

- [Pourquoi VectoJS](/learn/why-vectojs/) — l'espace du problème et les compromis.
- [Prise en main](/learn/getting-started/) — installez et créez votre première scène.
- [Core Scene](/learn/core-scene/) — la boucle de rendu, les entités et les transformations en profondeur.
