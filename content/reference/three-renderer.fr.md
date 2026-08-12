+++
title = "ThreeRenderer"
description = "Utiliser Three.js comme moteur IRenderer pour une Scene VectoJS : méthodes implémentées, disposition du shader de dégradé GLSL et la limitation de l'épaisseur de trait."
weight = 43
+++

# `ThreeRenderer`

Partie de [`@vectojs/three`](/reference/three/).

`ThreeRenderer` implémente l'interface `IRenderer` de [`@vectojs/core`](/reference/core-renderer/) en utilisant Three.js — les remplissages, contours et textes sont rendus comme des maillages et lignes Three.js dans une scène orthographique plutôt que comme des opérations Canvas 2D. Utilisez-le lorsque Three.js est déjà dans votre projet et que vous souhaitez que la scène VectoJS elle-même soit rendue avec le pipeline WebGL au lieu de Canvas 2D.

## Quand l'utiliser

- Vous voulez que le contenu 2D de VectoJS soit rendu comme des objets Three.js via un `THREE.WebGLRenderer` dédié créé pour le canvas fourni.
- Vous avez besoin de remplissages dégradés accélérés matériellement alimentés par des shaders GLSL.
- Vous faites des benchmarks ou expérimentez avec un pipeline 2D purement WebGL.

Pour intégrer une UI 2D sur une surface 3D, préférez [`ThreeAdapter`](/reference/three-adapter/) — il ne vous oblige pas à abandonner le rendu Canvas 2D.

## Constructeur

```ts
new ThreeRenderer(canvas: HTMLCanvasElement)
```

Crée :

- `THREE.WebGLRenderer` avec `{ canvas, alpha: true, antialias: true }`
- `THREE.OrthographicCamera` avec Y pointant vers le bas (top = 0, bottom = height) pour correspondre au système de coordonnées de VectoJS
- Le ratio de pixels défini automatiquement à `window.devicePixelRatio` et **maintenu synchronisé** lorsqu'il change à l'exécution (voir ci-dessous)

`ThreeRenderer` crée et possède ce WebGLRenderer ; il n'accepte ni ne réutilise un renderer/context existant. `dispose()` supprime les objets actifs, libère leurs ressources de géométrie/matériau/texture, réinitialise les piles et dispose le WebGLRenderer possédé exactement une fois. Il détache également les écouteurs de perte de contexte et DPR décrits ci-dessous, donc un renderer disposé ne peut pas être ressuscité par un événement tardif.

## Perte de contexte GPU et DPR à l'exécution

Un réinitialisation GPU ou une éjection par pression mémoire laisserait une scène Three permanentement vide, et un déplacement de moniteur ou un zoom navigateur la laisserait avec un ratio de pixels périmé (flou ou avec aliasing). `ThreeRenderer` gère les deux :

- **`webglcontextlost`** est `preventDefault()` — obligatoire, sinon le navigateur ne
  déclenche jamais l'événement de restauration — et bascule `isContextLost()`. `present()` devient un
  no-op tant que perdu, dessiner sur un contexte mort étant inutile.
- **`webglcontextrestored`** réapplique le ratio de pixels et la taille (une restauration peut atterrir
  sur un moniteur différent), efface le drapeau, et force un redessin du framebuffer
  fraîchement vidé. Le `WebGLRenderer` de Three reconstruit son état GL paresseusement lors du
  prochain rendu.
- **Les changements de DPR** sont suivis par une requête média `(resolution: Ndppx)` qui
  réapplique `setPixelRatio` + `setSize` et se réarme (la requête est
  à un seul tir).

Tout est protégé pour SSR / `OffscreenCanvas` (pas de `addEventListener` ni
`matchMedia`). `isContextLost()` satisfait aussi le hook optionnel
[`IRenderer`](/reference/core-renderer/#survivre-à-la-perte-du-contexte-gpu), donc
`Scene.render` saute le passage tant que le contexte est absent.

## Propriétés publiques

| Propriété         | Type                       |
| ----------------- | -------------------------- |
| `scene`           | `THREE.Scene`              |
| `camera`          | `THREE.OrthographicCamera` |
| `renderer`        | `THREE.WebGLRenderer`      |
| `isContextLost()` | `() => boolean`            |

## Usage

Passez le renderer comme option `renderer` au constructeur de la `Scene` VectoJS :

```ts
import { Scene } from '@vectojs/core';
import { ThreeRenderer } from '@vectojs/three';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const threeRenderer = new ThreeRenderer(canvas);

const scene = new Scene(canvas, { renderer: threeRenderer });
scene.add(/* entités */);
scene.start();
```

## Méthodes IRenderer implémentées

| Méthode                                                                                   | Notes                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beginPath()` `moveTo()` `lineTo()` `bezierCurveTo()` `closePath()` `arc()` `roundRect()` | Accumulation de chemin ; vidé sur `fill()` ou `stroke()`.                                                                                                                                       |
| `fill(colorOrGradient)`                                                                   | Remplissages unis via `MeshBasicMaterial` ; dégradés via `ShaderMaterial` GLSL (voir ci-dessous). L'alpha de la couleur CSS multiplie l'alpha hérité du renderer.                               |
| `stroke(colorOrGradient, lineWidth?)`                                                     | `LineBasicMaterial`. Voir la limitation d'épaisseur de trait ci-dessous.                                                                                                                        |
| `fillText(text, x, y, font, color)`                                                       | Rend le texte sur un canvas hors écran, le télécharge comme `THREE.CanvasTexture`. Les dégradés reviennent au premier arrêt de couleur.                                                         |
| `fillCircle(cx, cy, radius, color, alpha?)`                                               | `THREE.CircleGeometry` avec 32 segments + `MeshBasicMaterial`.                                                                                                                                  |
| `drawImage(source, dx, dy, dw, dh)`                                                       | `THREE.CanvasTexture` + `PlaneGeometry`.                                                                                                                                                        |
| `save()` `restore()` `translate()` `scale()` `rotate()` `setGlobalAlpha()` `clip()`       | Pile de transformations/alpha ; les clips imbriqués s'intersectent. Le clipping par scissor utilise l'AABB transformé, donc un clip pivoté/cisaillé est une approximation alignée sur les axes. |
| `createLinearGradient(x0, y0, x1, y1, colorStops)`                                        | Renvoie un descripteur `WebGLGradient` consommé par `fill()`.                                                                                                                                   |
| `flush()`                                                                                 | Appelle `renderer.render(scene, camera)`.                                                                                                                                                       |
| `resize(width, height)`                                                                   | Met à jour `renderer.setSize()` et recalcule les limites de la caméra.                                                                                                                          |
| `clear()`                                                                                 | Supprime la géométrie/les matériaux de trame et réinitialise l'état du chemin, de la transformation, de l'alpha et de la pile de scissor.                                                       |

## Limitation de l'épaisseur de trait

`THREE.LineBasicMaterial.linewidth` est **ignoré silencieusement par WebGL sur la plupart des plateformes** — les lignes sont limitées à 1 px, quelle que soit la valeur passée à `stroke()`. Il s'agit d'une limitation du navigateur/pilote GPU, pas d'une restriction de VectoJS.

Si votre conception nécessite des traits épais (> 1 px), envisagez :

- Utiliser `fill()` avec un chemin rectangulaire au lieu de `stroke()` pour les lignes droites.
- Passer à [`ThreeAdapter`](/reference/three-adapter/) avec le `CanvasRenderer` par défaut, qui prend en charge des largeurs de ligne arbitraires via Canvas 2D.
- Intégrer `THREE.MeshLine` manuellement dans votre couche applicative — `ThreeRenderer` n'inclut pas cette dépendance.

## Support des dégradés

`ThreeRenderer.createLinearGradient()` renvoie un descripteur `WebGLGradient`. Lorsqu'il est passé à `fill()`, le renderer compile un `ShaderMaterial` GLSL avec la disposition uniforme suivante :

```glsl
uniform vec4 u_grad_colors[8];  // RGBA par arrêt
uniform float u_grad_stops[8];  // position normalisée [0, 1]
uniform vec2 u_grad_start;      // point de départ dans l'espace monde
uniform vec2 u_grad_end;        // point d'arrivée dans l'espace monde
```

La couleur est interpolée linéairement entre les deux arrêts les plus proches dans l'espace monde. Si plus de 8 arrêts sont fournis, ils sont rééchantillonnés en 8 points uniformément espacés avant le téléchargement — les détails de couleur au-delà de 8 arrêts sont perdus.

**Les dégradés ne sont pas pris en charge pour `stroke()` ou `fillText()`.** Passer un `WebGLGradient` à `stroke()` revient à la couleur du premier arrêt. `fillText()` revient également à la couleur du premier arrêt car les glyphes de texte sont rasterisés via Canvas 2D avant le téléchargement.

Consultez la [page principale de `@vectojs/three`](/reference/three/#dépannage) pour le dépannage des problèmes de dégradé/DPI/pointeur.

## Voir aussi

[`ThreeAdapter`](/reference/three-adapter/) (le cas d'usage alternatif — un panneau 2D sur une surface 3D) ·
[`IRenderer` / `CanvasRenderer`](/reference/core-renderer/) (l'interface que ce renderer implémente) ·
[`@vectojs/three` aperçu](/reference/three/)
