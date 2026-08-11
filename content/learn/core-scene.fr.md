+++
title = "Architecture de la Core Scene"
description = "Plongée en profondeur dans le Virtual Math Tree, le cycle de vie de la Scene, le système d'Entity, le hit-testing et le pipeline de rendu."
weight = 8

[extra]
order = 8
+++

# Architecture de la Core Scene

VectoJS abandonne le DOM traditionnel du navigateur. À la place, il implémente un **Virtual Math Tree (VMT)** à l'intérieur de `@vectojs/core`.

<figure>
  <img src="/images/vmt-architecture.svg" alt="Diagramme de l'architecture VMT montrant l'arbre d'entités, le rendu canvas et la couche fantôme A11y" class="diagram" />
  <figcaption>L'arbre d'entités du VMT pilote à la fois le rendu canvas et un shadow DOM A11y invisible au-dessus du canvas.</figcaption>
</figure>

## La Scene

La classe `Scene` est l'orchestrateur racine. Elle gère trois pipelines critiques :

1. **La boucle de rendu** — Une boucle `requestAnimationFrame` qui exécute séquentiellement la physique/les animations, puis effectue le rendu via un `IRenderer`.
2. **Le hit-testing** — Un raycasting mathématique pur en O(N) pour détecter le survol et les clics du pointeur sans `document.elementFromPoint`.
3. **Le proxy d'accessibilité** — Une synchronisation bidirectionnelle du focus, de la mise en page et des valeurs vers un shadow DOM A11y invisible au-dessus du canvas.

### Initialisation

```typescript
import { Scene } from '@vectojs/core';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, {
  pointBackend: 'webgl', // Opt compatible batch circles/rects into the WebGL2 layer
  maxFPS: 60,
});
scene.start();
```

La `Scene` insère deux `<div>` transparents dans l'élément **parent** du canvas : un pour la couche fantôme A11y (`z-index: 10`) et un pour la couche du portail DOM (`z-index: 9`). Le parent est forcé en `position: relative` à chaque trame s'il était `static`.

### Modes de rendu

| Mode                    | Comportement                                                                                                                  | À utiliser quand                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `'always'` (par défaut) | Re-rendu à chaque trame, plafonné par `maxFPS`.                                                                               | Animation continue, simulations de particules. |
| `'onDemand'`            | Ne dessine que lorsque c'est « sale » ou qu'un mouvement est en attente ; les ticks rAF statiques vérifient toujours l'arbre. | UI statiques/pilotées par les événements.      |

```typescript
scene.renderMode = 'onDemand';
// Then call scene.markDirty() from event handlers to request a repaint.
```

**Le piège de l'auto-étranglement au repos.** En mode `'always'`, une scène sans interpolations en attente ni indicateur « sale » est étranglée à environ 2 fps pour économiser la batterie. Si vous animez à la main en mutant `entity.x` dans un `update()` personnalisé, appelez `scene.markDirty()` **entre les trames** (depuis un gestionnaire d'événement ou un `rAF` distinct) — pas à l'intérieur de `update()` lui-même, car la réinitialisation post-rendu efface l'indicateur avant la vérification suivante.

## Le système d'Entity

Chaque objet dans VectoJS étend la classe abstraite `Entity`.

<figure>
  <img src="/images/entity-hierarchy.svg" alt="Hiérarchie de classes Entity montrant Entity → UIComponent → tous les composants" class="diagram" />
  <figcaption>Tous les composants UI étendent UIComponent, qui lui-même étend Entity. Les types personnalisés peuvent sous-classer Entity directement.</figcaption>
</figure>

Une `Entity` possède :

- Une **position** (`x`, `y`), une **échelle** (`scaleX`, `scaleY`), une **rotation** (radians) et une **opacité**.
- Un tableau **children** — le VMT est un arbre.
- Une **boîte de survol** (`width`, `height`) utilisée par le test de survol AABB de UIComponent.
- Des indicateurs optionnels : `interactive`, `clipChildren`, `a11yFullViewport`.

### Référence complète des propriétés

| Propriété          | Type      | Défaut  | Notes                                                                                                                                                                                                                                        |
| ------------------ | --------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `x`, `y`           | `number`  | `0`     | Position locale                                                                                                                                                                                                                              |
| `scaleX`, `scaleY` | `number`  | `1`     | Échelle locale                                                                                                                                                                                                                               |
| `rotation`         | `number`  | `0`     | Radians                                                                                                                                                                                                                                      |
| `opacity`          | `number`  | `1`     | `[0,1]` ; multipliée par l'opacité des ancêtres à travers les chemins normal, batch, WebGPU et portail.                                                                                                                                      |
| `width`, `height`  | `number`  | `0`     | Taille de la boîte de survol                                                                                                                                                                                                                 |
| `interactive`      | `boolean` | `false` | Active le nœud shadow DOM + les événements                                                                                                                                                                                                   |
| `clipChildren`     | `boolean` | `false` | Rogne les dessins d'enfants normaux à `[0,0]–[width,height]` ; Canvas/SVG sont exacts, tandis que Three utilise un scissor world-AABB pour les rognages tournés/cisaillés. Les chemins de superposition point GPU/WebGPU ne sont pas rognés. |
| `a11yFullViewport` | `boolean` | `false` | Crée un nœud fantôme remplissant le viewport (pour les surfaces sans limites)                                                                                                                                                                |
| `a11yOffsetX/Y`    | `number`  | `0`     | Ajuste finement le placement du nœud fantôme                                                                                                                                                                                                 |

### Sous-classer Entity

```typescript
import { Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

class GlowRect extends Entity {
  color = '#6366f1';

  isPointInside(gx: number, gy: number): boolean {
    const local = this.worldToLocal(gx, gy);
    return (
      !!local && local.x >= 0 && local.x <= this.width && local.y >= 0 && local.y <= this.height
    );
  }

  render(renderer: IRenderer): void {
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 8);
    renderer.fill(this.color);
  }
}

const rect = new GlowRect();
rect.width = 200;
rect.height = 80;
rect.setPosition(100, 100);
scene.add(rect);
```

> **Note :** `render()` est appelée avec le renderer déjà translaté à la position globale de l'entité, mis à l'échelle et tourné. Dessinez depuis `(0, 0)`.

### Hit-testing et événements

Définissez `entity.interactive = true` pour projeter un nœud d'accessibilité capable de saisie dans une scène canvas normale. Lorsqu'un hit-testing est demandé, `findEntityAt(x, y)` renvoie la première entité (en profondeur d'abord, de l'avant vers l'arrière) dont `isPointInside()` renvoie `true`. Il n'y a pas de filtre interactif pendant le parcours : les tests de survol programmatiques et les adaptateurs peuvent toujours renvoyer une entité non interactive.

```typescript
rect.interactive = true;

rect.on('click', (e) => {
  rect.animate({ color: '#38bdf8' }, 300);
});

rect.on('hover', (e) => {
  document.body.style.cursor = 'pointer';
});
rect.on('pointerleave', () => {
  document.body.style.cursor = 'default';
});
```

Événements disponibles : `click`, `hover`, `pointerdown`, `pointerup`, `pointercancel`, `pointermove`, `pointerleave`, `change`, `focus`, `blur`, `wheel`, `keydown`, `keyup`.

Les événements se propagent façon DOM : **capture** (racine → cible) puis **propagation** (cible → racine). Passez `{ capture: true }` pour écouter sur la phase de capture. Utilisez `e.stopPropagation()` pour arrêter le parcours, ou `e.stopImmediatePropagation()` pour aussi ignorer les écouteurs restants sur le nœud actuel.

### Animation

`entity.animate()` met en file d'attente une interpolation douce en ease-out pour n'importe quelle propriété numérique :

```typescript
// Chain two tweens: slide right, then fade out.
rect.animate({ x: 400 }, 400).animate({ opacity: 0 }, 200);
```

La fonction de lissage est ease-out quadratique : `t * (2 - t)`. Une interpolation en cours maintient la scène en vie (via `hasPendingAnimations()`) même en mode `onDemand`.

### update() personnalisé

Surchargez `Entity.update(dt, time)` pour implémenter une logique par trame.

> [!WARNING] > `dt` est en **millisecondes**, pas en secondes. Une erreur courante est d'écrire `this.rotation += dt * 3` en s'attendant à 3 rad/s — cela fait en réalité tourner à 3000 rad/s. Multipliez par `0.001` (ou divisez les vélocités par 1000) pour convertir.

`time` est `performance.now()` :

```typescript
class Spinner extends Entity {
  update(dt: number, _time: number): void {
    super.update(dt, _time); // advances queued tweens
    this.rotation += dt * 0.003; // dt is ms, so this is 3 rad/s
    this.scene?.markDirty();
  }
}
```

## Le pipeline de rendu

<figure>
  <iframe src="/sandbox/diagram-pipeline.html" class="diagram-frame" loading="lazy" title="The VectoJS render pipeline: the six stages of one dirty frame, rendered live by VectoJS" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>Chaque trame « sale » parcourt l'arbre d'entités — mise à jour, élimination (cull), puis rendu — avant de synchroniser le shadow DOM A11y. <em>(Rendu en direct par VectoJS.)</em></figcaption>
</figure>

Chaque trame :

1. **Effacer** — `renderer.clear()`
2. **Mettre à jour** — Parcourir l'arbre en appelant `entity.update(dt, time)` (`dt` en ms, `time` issu de `performance.now()`).
3. **Éliminer (cull)** — Ignorer les entités dont `getBounds()` est en dehors du viewport.
4. **Rendre** — Translater/mettre à l'échelle/tourner le renderer selon la transformation globale de chaque entité, puis appeler `entity.render(renderer)`.
5. **Vider (flush)** — Valider les dessins groupés en attente (cercles, points WebGL).
6. **Synchroniser A11y** — Mettre à jour le shadow DOM (étranglé par `a11ySyncInterval`).

Parce que tout se passe en mémoire JS et se déverse directement sur Canvas, il n'y a aucun thrashing de mise en page du navigateur. Le nombre de nœuds DOM reste stable tout en animant des milliers d'entités.

## Conseils de performance

### Dessin par lots

Surchargez `getBatchCircle()` ou `getBatchRect()` pour faire entrer une entité feuille dans la couche de points WebGL (nécessite `pointBackend: 'webgl'`) :

```typescript
getBatchCircle() {
  return { radius: this.radius, color: this.color };
}
```

Les feuilles groupables représentables sautent le chemin complet `save/translate/render/restore` et entrent dans le tampon WebGL. Le mode Canvas ou les transformations accumulées non prises en charge utilisent le repli `render()` normal de l'entité.

### Élimination du viewport (culling)

Surchargez `getBounds()` pour renvoyer une AABB locale. Les entités en dehors du viewport sautent leur appel `render()`, tandis que le parcours et `update()` continuent :

```typescript
getBounds() {
  return { x: 0, y: 0, width: this.width, height: this.height };
}
```

`UIComponent` implémente déjà `getBounds()` — les sous-classes Entity brutes personnalisées de taille fixe devraient le faire aussi.

### Rendu à la demande

Passez en `scene.renderMode = 'onDemand'` pour les UI majoritairement statiques. Les ticks statiques sautent la mise à jour/le rendu et le travail GPU tout en continuant à interroger rAF pour l'état « sale »/d'animation. Appelez `scene.markDirty()` depuis les gestionnaires d'événements.
