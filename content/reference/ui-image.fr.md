+++
title = "UI: Image"
description = "Composant dʼimage sur canvas avec rendu de placeholder et projection dʼimg sémantique."
weight = 19
+++

# `Image`

`Image` dessine un bitmap chargé de manière asynchrone sur le canvas et projette un nœud `<img>` sémantique.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Image</span></div>
  <iframe src="/sandbox/ui/component.html?name=image&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live dʼImage" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Le placeholder sʼaffiche jusquʼà ce que le callback de chargement de lʼimage marque la scène comme modifiée.</figcaption>
</figure>

## Exemple minimal

```ts
import { Image } from '@vectojs/ui';

const logo = new Image('/logo.svg', {
  width: 160,
  height: 80,
  alt: 'Logo Vecto',
  onLoad: () => scene.markDirty(),
});
```

## Ajustement, recadrage focal et coins arrondis

`fit` contrôle comment le bitmap chargé est mappé dans la boîte `width` × `height`, et `focalPoint` affine le recadrage `'cover'` — tous deux 2.18.0+.

| `fit`       | Comportement                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------- |
| `'fill'`    | Étire vers la boîte (défaut, comportement hérité).                                           |
| `'cover'`   | Préserve le ratio dʼaspect, remplit la boîte, recadre le débordement autour de `focalPoint`. |
| `'contain'` | Préserve le ratio dʼaspect, ajuste tout le bitmap dans la boîte (centré).                    |

`focalPoint` est `{ x, y }` avec chaque axe dans `0..1` — `0` est en haut/à gauche, `1` en bas/à droite, défaut `{ x: 0.5, y: 0.5 }` ; seul `'cover'` le lit, et les valeurs hors de `[0, 1]` sont limitées. `radius` arrondit maintenant les coins du bitmap chargé, pas seulement ceux du placeholder, de sorte quʼun avatar arrondi avec `fit: 'cover'` recadre le débordement coupé selon la même silhouette.

```ts
import { Image, type ImageFit, type ImageFocalPoint } from '@vectojs/ui';

const avatar = new Image('/avatar.jpg', {
  width: 96,
  height: 96,
  fit: 'cover',
  focalPoint: { x: 0.5, y: 0.25 }, // biais vers le haut du cadre
  radius: 48, // recadre le bitmap chargé en cercle
  alt: 'Profile photo',
});
```

## Liste de vérification pour les mainteneurs

- Fournissez toujours `width` et `height`.
- Fournissez un texte `alt` pertinent pour les images non décoratives.
- Dans les scènes `onDemand`, appelez `scene.markDirty()` depuis `onLoad`.
- Lʼobjet dʼoptions est **requis** — `new Image(src)` sans options lève.
- Un `src` cross-origin (par ex. un SVG de CDN sans en-têtes CORS) corrompt le canvas et casse tout appel ultérieur `getImageData`/`toDataURL`. Insérez lʼasset comme une URL `data:image/svg+xml` pour un dessin sûr en même origine.
