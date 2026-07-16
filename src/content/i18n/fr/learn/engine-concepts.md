---
title: 'Concepts du moteur'
description: 'Les huit idées mathématiques et architecturales derrière VectoJS.'
order: 4
---

# Concepts du moteur

VectoJS repose sur un petit ensemble d'idées mathématiques et d'exécution. Cette page est une carte ; les dérivations plus poussées vivent dans les [Fondations mathématiques](/learn/math-foundations/).

<figure>
  <img src="/images/engine-concepts-map.svg" alt="Carte conceptuelle avec le Virtual Math Tree au centre relié aux transformations affines, au hit-testing, à la mise en page à froid et à chaud, au flux de texte par différence d'ensembles, à la projection sémantique, au mouvement de ressort et à SpatialHashGrid." class="diagram" />
  <figcaption>Le Virtual Math Tree est le moyeu ; les transformations, la mise en page, le hit-testing, le mouvement et la projection sémantique sont les rayons d'exécution.</figcaption>
</figure>

## 1. Virtual Math Tree

Le VMT remplace un sous-arbre DOM visuel par un graphe de scène JavaScript de systèmes de coordonnées localisés. Le parcours, le hit-testing et la synchronisation de l'accessibilité restent un travail réel, mais la mise en page visuelle évite le style et le reflow du navigateur pour chaque entité.

- Théorie : [Fondations mathématiques : VMT](/learn/math-foundations/#1-le-virtual-math-tree-vmt)
- Pratique : [Core Scene](/learn/core-scene/)

## 2. Superposition de projection sémantique

Les entités interactives éligibles projettent de vrais nœuds DOM transparents au-dessus de leurs limites canvas. Le canvas possède les pixels ; la projection DOM possède le rôle/nom/état et le comportement de saisie natif.

- Théorie : [Fondations mathématiques : a11yRoot](/learn/math-foundations/#2-shadow-dom-sémantique-a11yroot)
- Pratique : [Accessibilité](/learn/accessibility/)

## 3. Transformations affines

La translation, l'échelle et la rotation des entités se composent en descendant dans l'arbre. `worldToLocal()` inverse analytiquement la transformation afin que les événements de pointeur puissent être mappés dans les coordonnées locales de l'entité cible.

- Théorie : [Fondations mathématiques : transformations affines](/learn/math-foundations/#3-transformations-affines)

## 4. Mise en page à froid/à chaud

La mise en page du texte sépare la préparation coûteuse du contenu du retour à la ligne réactif. Les changements de contenu exécutent le chemin à froid ; les changements de largeur peuvent réutiliser les mesures préparées.

- Théorie : [Fondations mathématiques : séparation à froid/à chaud](/learn/math-foundations/#4-moteur-de-mise-en-page-à-séparation-froidechaude)
- Pratique : [Texte & Typographie](/learn/text-typography/)

## 5. Flux de texte par différence d'ensembles

Le contournement d'obstacles peut être modélisé comme une soustraction d'intervalles :

$$I_{\text{allowed}} = I_0 \setminus \bigcup E_k$$

- Théorie : [Fondations mathématiques : algèbre de différence d'ensembles](/learn/math-foundations/#5-algèbre-de-différence-densembles-pour-les-flux-de-texte)

## 6. Hit-testing de splines échantillonnées

`SplineEntity` échantillonne les courbes en segments de ligne mis en cache et compare la distance au carré du pointeur à ces segments. Cela évite les lectures de pixels et est plus précis que les tests de survol basés uniquement sur AABB.

- Théorie : [Fondations mathématiques : hit-testing de splines échantillonnées](/learn/math-foundations/#6-hit-testing-de-splines-échantillonnées)

## 7. Dynamique d'Euler semi-implicite

Les transitions UI interrompues sont modélisées comme des systèmes de type ressort plutôt que comme des minuteurs CSS à usage unique. Les cibles peuvent changer en plein vol tandis que le mouvement reste continu.

- Théorie : [Fondations mathématiques : dynamique des EDO](/learn/math-foundations/#7-équations-différentielles--solveurs-deuler-semi-implicites)
- Pratique : [Physique & Animation](/learn/physics-engine/)

## 8. Utilitaire SpatialHashGrid

VectoJS exporte un `SpatialHashGrid` à cellules fixes pour les requêtes de proximité gérées par l'application. La Scene ne le remplit pas automatiquement pour chaque entité.

- Théorie : [Fondations mathématiques : utilitaire SpatialHashGrid](/learn/math-foundations/#8-utilitaire-spatialhashgrid)
- Pratique : [Performance](/learn/performance/)

## Prochaines étapes

- [Architecture d'exécution](/learn/runtime-architecture/) relie ces concepts au pipeline de trame.
- [Fondations mathématiques](/learn/math-foundations/) approfondit les formules.
