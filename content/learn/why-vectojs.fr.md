+++
title = "Pourquoi VectoJS"
description = "Le problème que VectoJS résout, en quoi il diffère du DOM et des bibliothèques canvas, et quand ne pas l'utiliser."
weight = 2

[extra]
order = 2
+++

# Pourquoi VectoJS

Le DOM du navigateur est un puissant moteur de rendu de documents à usage général. Il excelle pour le texte fluide, le contenu optimisé pour le SEO, les formulaires natifs et les interfaces interactives modérées.

Il devient un goulot d'étranglement lorsque l'interface se comporte davantage comme une scène que comme un document.

## Le problème

VectoJS cible les interfaces où :

- des milliers d'éléments animés individuellement créeraient un travail excessif de DOM/style/mise en page ;
- la mise en page est contrôlée par les mathématiques, et non par le flux CSS ;
- le hit-testing doit correspondre à des transformations, des courbes et des systèmes de coordonnées personnalisés ;
- la même UI doit s'exécuter dans des contextes canvas, WebGL, d'export ou WebXR ;
- l'accessibilité et l'automatisation restent importantes même si l'UI visible est rendue sur canvas.

<figure>
  <img src="/images/fit-decision-tree.svg" alt="Arbre de décision pour choisir entre HTML et CSS, une UI d'application normale, et VectoJS selon le contenu documentaire, le nombre d'entités, les mathématiques personnalisées et les besoins d'accessibilité." class="diagram" />
  <figcaption>Commencez par HTML/CSS. Ne recourez à VectoJS que lorsque l'UI se comporte davantage comme une scène que comme un document.</figcaption>
</figure>

## En quoi il diffère des bibliothèques canvas classiques

La plupart des bibliothèques canvas fournissent des primitives de dessin et laissent la mise en page, les événements, le texte et l'accessibilité à la charge de l'application. VectoJS fournit une pile d'exécution plus complète.

| Couche        | VectoJS                                                              | Bibliothèque canvas classique          |
| ------------- | -------------------------------------------------------------------- | -------------------------------------- |
| Mise en page  | Arbre d'entités et assistants de mise en page                        | Manuelle                               |
| Hit-testing   | Tests de survol par entité et conversion de transformation           | Manuel                                 |
| Événements    | Phases de capture et de propagation façon DOM                        | Manuel/rappels uniquement              |
| Accessibilité | Projection DOM sémantique pour les entités éligibles                 | Généralement absente                   |
| Texte         | Moteur de mise en page, retour à la ligne, BiDi, arabe, chemins MSDF | Souvent `fillText` uniquement          |
| Composants    | Formulaires, superpositions, markdown, défilement, mise en page      | Généralement définis par l'application |
| Export        | Exporteur vidéo à pas fixe                                           | Généralement externe                   |

## Ce que VectoJS sacrifie

VectoJS échange la commodité de CSS contre un contrôle explicite. Vous possédez une plus grande part du modèle de mise en page et d'interaction :

- CSS ne positionne pas les entités canvas individuelles.
- La sélection de texte native pour un texte rendu arbitraire n'est pas automatique.
- Les robots d'indexation SEO ne voient pas le contenu rendu sur canvas comme du texte de page.
- L'accessibilité est activée par projection, mais requiert toujours des libellés, des rôles, un comportement clavier, un contraste corrects et des tests avec les technologies d'assistance.
- Le parcours des entités, la mise à jour, la synchronisation sémantique et le calcul applicatif coûtent toujours du CPU ; le canvas ne rend pas tout le travail gratuit.

## Quand ne pas utiliser VectoJS

Ne recourez pas d'abord à VectoJS lorsque :

- vous construisez un blog, une page marketing, un site de documentation ou une page CMS ;
- l'UI est constituée principalement de formulaires et de tableaux ordinaires ;
- la visibilité SEO du contenu rendu est une exigence incontournable ;
- la sélection de texte native du navigateur est centrale au produit ;
- il n'y a aucune mathématique de mise en page personnalisée, densité d'animation, graphe, jeu, simulation ou scène à forte densité d'entités.

VectoJS brille lorsque vous avez besoin d'un **contrôle visuel au niveau du canvas** avec suffisamment d'infrastructure d'exécution pour éviter de reconstruire vous-même la mise en page, les événements, le texte, l'accessibilité et l'export.

## Prochaines étapes

- [Architecture d'exécution](/learn/runtime-architecture/) explique les pièces mobiles.
- [Cas d'usage](/learn/use-cases/) associe les compromis à des catégories de produits réelles.
