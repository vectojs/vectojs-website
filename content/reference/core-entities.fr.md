+++
title = "Autres entités"
description = "Primitives de forme Rect/Circle/Group, plus SplineEntity (rendu de courbes vectomancy), DOMPortalEntity (projection d'un élément DOM réel dans la scène) et SVGEntity (blitting SVG rastérisé) depuis l'entrée principale @vectojs/core."
weight = 8

[extra]
order = 8
+++

# Autres entités (depuis `.`)

Partie de [`@vectojs/core`](/reference/core-api/).

## Rect, Circle, Group (primitives)

_Ajoutées dans `@vectojs/core` 1.9.0._ Trois entités prêtes à instancier pour qu'une
simple boîte, un point ou un conteneur de transformation n'ait plus besoin d'une
sous-classe [`Entity`](/reference/core-entity/) sur mesure.

```ts
import { Rect, Circle, Group } from '@vectojs/core';

const box = new Rect({ width: 120, height: 64, fill: '#38bdf8', radius: 8 });
const dot = new Circle({ radius: 24, fill: '#f97316' });
const toolbar = new Group(saveBtn, undoBtn, redoBtn); // conteneur de transformation uniquement
toolbar.set({ x: 20, y: 20 });
scene.add(box, dot, toolbar); // add() variadique
```

**`Rect`** — rectangle aligné sur les axes de `(0,0)` local à `(width, height)`.

| `RectOptions` | Défaut      | Effet                                                                     |
| ------------- | ----------- | ------------------------------------------------------------------------- |
| `width`       | `0`         | Largeur locale ; correspond à la boîte hit/a11y de l'entité.              |
| `height`      | `0`         | Hauteur locale.                                                           |
| `fill`        | `'#38bdf8'` | Remplissage CSS, ou `null` pour aucun (le `null` explicite est préservé). |
| `stroke`      | `null`      | Contour CSS, ou `null` pour aucun.                                        |
| `strokeWidth` | `1`         | Largeur du contour (unités locales).                                      |
| `radius`      | `0`         | Rayon de coin uniforme ; `0` = coins droits.                              |

Un `Rect` à remplissage plein, coins carrés et sans contour opte pour la voie rapide
instanciée WebGL (`getBatchRect`, `pointBackend: 'webgl'` uniquement) ; tout
contour ou rayon de coin est rendu via le chemin Canvas exact.

**`Circle`** — disque centré sur son origine locale `(0,0)`. Sa boîte d'ombre a11y
est le carré englobant décalé de `-radius` pour couvrir le disque dessiné.

| `CircleOptions` | Défaut      | Effet                                                     |
| --------------- | ----------- | --------------------------------------------------------- |
| `radius`        | `0`         | Rayon (unités locales). Le setter resynchronise la boîte. |
| `fill`          | `'#38bdf8'` | Remplissage CSS, ou `null` pour aucun.                    |
| `stroke`        | `null`      | Contour CSS, ou `null` pour aucun.                        |
| `strokeWidth`   | `1`         | Largeur du contour (unités locales).                      |

Un `Circle` à remplissage plein et sans contour opte pour la voie rapide du lot de
points en cercle (`getBatchCircle`) ; un cercle avec contour est rendu via le chemin
Canvas exact.

**`Group`** — un conteneur de transformation uniquement : il ne dessine rien et est
invisible au hit-testing (`isPointInside` retourne `false`), existant seulement pour
composer une transformation (`x`/`y`/`scale`/`rotation`/`opacity`) sur ses enfants.
Le hit-test de la scène récure d'abord dans les enfants, ils restent donc
indépendamment interactifs. Passez les enfants en ligne : `new Group(a, b, c)`.

Voir aussi [`Entity.set()`](/reference/core-entity/) et
[`add()`](/reference/core-entity/) variadique — les assistants ergonomiques avec
lesquels ces primitives sont conçues pour être utilisées.

## SplineEntity + loadSpline

```ts
loadSpline(url: string): Promise<SplineDocument>     // récupère + parse un JSON Spline vectomancy (navigateur)
new SplineEntity(doc: SplineDocument, opts?: SplineOptions)
polySegmentToBezier(seg: SplineSegment): BezierControlPoints
```

Rend les documents `Spline`/`Polyline` cubiques par morceaux natifs vectomancy. Les
limites proviennent de `bounding_box` (ou sont calculées à partir des extrémités des
segments) afin de participer à l'écrêtage du viewport.

| `SplineOptions` | Défaut      | Effet                                                                                                    |
| --------------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| `lineWidth`     | `2`         | Largeur du trait (unités locales).                                                                       |
| `cache`         | `true`      | Cuit dans un `OffscreenCanvas` une fois et blitté à chaque image (tracé Bézier par image sans cela).     |
| `defaultColor`  | `'#e2e8f0'` | Utilisé quand le `color_rgb` d'une équation est `null`.                                                  |
| `hitTest`       | `'curve'`   | `'curve'` = précis (à moins de `lineWidth/2 + hitTolerance` d'une courbe) ; `'aabb'` = boîte englobante. |
| `hitTolerance`  | `0`         | Marge de capture supplémentaire en mode `'curve'`.                                                       |

Publiques : `doc`, `lineWidth`, `defaultColor`, `hitTolerance`, `showBounds`
(défaut `false`, dessine un contour de débogage). `SplineColor` est `[r,v,b]` (0–1), un
descripteur de dégradé linéaire, ou `null`.

## DOMPortalEntity

```ts
new DOMPortalEntity(domElement: HTMLElement, width?, height?, id?)
```

Projette un élément DOM **réel** positionné/transformé pour suivre l'entité
(`matrix(...)` + opacité héritée + z-index de l'ordre de peinture) dans la couche du
portail. Un nœud feuille — `add()` émet un avertissement et les entités enfants ne sont
pas supportées. Transmet les événements natifs de pointeur/molette/focus en tant
qu'`VectoJSEvent`s. Utilise un `ResizeObserver` pour mettre en cache la taille
intrinsèque (`cachedWidth`/`cachedHeight`) quand `width`/`height` sont à 0. `destroy()`
détache les écouteurs, l'observateur et supprime l'élément.

## SVGEntity (depuis `@vectojs/core/text`)

```ts
new SVGEntity(svgSource: string, id?)
setSVGSource(svgSource: string): void
```

Rastérise une chaîne SVG en `ImageBitmap`/image et la blitte, en re-rastérisant à
une échelle cible (LOD) pour qu'elle reste nette quand on zoome. `scene.toSVG()` intègre
la source encodée en pourcentage comme une image SVG imbriquée isolée plutôt qu'un
espace réservé d'URL inerte. Hit-test AABB dans l'espace local.

## Associé

[`Entity`](/reference/core-entity/) (la classe de base que chacun de ces éléments étend) ·
[`@vectojs/core` overview](/reference/core-api/)
