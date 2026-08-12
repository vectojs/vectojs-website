+++
title = "Architecture d'exécution"
description = "Comment Scene, Entity, la boucle de rendu, la projection d'accessibilité et les backends s'assemblent."
weight = 3
+++

# Architecture d'exécution

VectoJS s'organise autour d'une `Scene` par canvas et d'un arbre retenu d'instances `Entity`. L'arbre stocke l'état visuel, l'état de mise en page, le comportement d'événement et les métadonnées sémantiques.

<figure>
  <img src="/images/vmt-architecture.svg" alt="Diagramme de l'architecture VMT montrant l'arbre d'entités, le rendu canvas et la couche fantôme A11y" class="diagram" />
  <figcaption>La Scene parcourt un Virtual Math Tree, rend les pixels vers le canvas et projette la sémantique dans le DOM.</figcaption>
</figure>

## Virtual Math Tree

Chaque entité possède :

- `x`, `y`, `scaleX`, `scaleY`, `rotation` et `opacity` ;
- `width` et `height` pour les limites ;
- un tableau `children` ;
- `update(dt, time)` pour les changements d'état ;
- `render(renderer)` pour le dessin en coordonnées locales ;
- `isPointInside(globalX, globalY)` pour le hit-testing ;
- optionnellement `getA11yAttributes()` pour la sémantique projetée.

Les transformations se composent en descendant dans l'arbre. Utilisez `worldToLocal()` lors du hit-testing d'entités imbriquées ou transformées.

## Pipeline de trame

<figure>
  <iframe src="/sandbox/diagram-pipeline.html" class="diagram-frame" loading="lazy" title="The VectoJS render loop: the six stages of one dirty frame, rendered live by VectoJS" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>Une trame « sale » : mise à jour, élimination (cull), rendu, vidage des lots du backend, puis synchronisation du DOM projeté.</figcaption>
</figure>

## Projection d'accessibilité

Une couche DOM transparente se place au-dessus du canvas. Les entités interactives peuvent projeter des éléments réels tels que `<button>`, `<input>`, `<a>` et des nœuds `<div>` porteurs de rôle.

Cette couche rend l'UI canvas :

- détectable par les lecteurs d'écran ;
- utilisable via le clavier et les contrôles de formulaire natifs ;
- testable avec les sélecteurs de rôle de Playwright ;
- pilotable par des agents IA qui s'appuient sur la sémantique du DOM.

La projection ne remplace pas une revue de conception. Les applications restent propriétaires des libellés, de l'ordre de focus, du comportement clavier, du contraste et du comportement de mouvement réduit.

## Backends de rendu

| Backend                | Quand                       | Capacité                                                    |
| ---------------------- | --------------------------- | ----------------------------------------------------------- |
| `CanvasRenderer`       | Par défaut                  | Canvas 2D avec mise à l'échelle selon le device pixel ratio |
| Couche de points WebGL | `pointBackend: 'webgl'`     | Cercles/rectangles groupés et chemins de glyphes GPU        |
| Calcul WebGPU          | `particleBackend: 'webgpu'` | Particules pilotées par calcul avec repli                   |
| `SVGRenderer`          | `scene.toSVG()`             | Export SVG headless                                         |

Le choix du backend n'aide que lorsque le backend correspond au goulot d'étranglement. Si la mise en page du texte ou le calcul applicatif domine, remplacer Canvas par WebGL ne corrigera pas le chemin lent.

## Cycle de vie

```ts
const scene = new Scene(canvas, { maxFPS: 60 });
scene.renderMode = 'onDemand';
scene.resize(width, height);
scene.start();

// later
scene.destroy();
```

Détruisez toujours une scène lorsque le composant hôte est démonté. Une scène possède des ressources de renderer, des observateurs, des workers, un DOM projeté et un état d'événement.

## Prochaines étapes

- [Concepts du moteur](/learn/engine-concepts/) explique les piliers mathématiques.
- [Core Scene](/learn/core-scene/) montre l'API pratique.
