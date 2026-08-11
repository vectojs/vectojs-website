+++
title = "UI: Image"
description = "Composant dʼimage sur canvas avec rendu de placeholder et projection dʼimg sémantique."
weight = 19

[extra]
order = 19
+++

# `Image`

`Image` dessine un bitmap chargé de manière asynchrone sur le canvas et projette un nœud `<img>` sémantique.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Image</span></div>
  <iframe src="/sandbox/ui/component.html?name=image&v=core-1.34.0-ui-2.15.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live dʼImage" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## Liste de vérification pour les mainteneurs

- Fournissez toujours `width` et `height`.
- Fournissez un texte `alt` pertinent pour les images non décoratives.
- Dans les scènes `onDemand`, appelez `scene.markDirty()` depuis `onLoad`.
