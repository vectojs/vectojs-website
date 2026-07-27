---
title: 'UI: RichText'
description: 'Composant de texte en ligne multi-style avec zones de lien et support dʼajout en flux.'
order: 17
---

# `RichText`

`RichText` fait fluer des intervalles mixtes sur des lignes de base partagées : gras, italique, couleur, taille et liens en ligne.
La projection reconstruit les passages logiques source plutôt que les glyphes visuels façonnés, préservant le texte
exact du presse-papier à travers des tailles de police mixtes, des ligatures, du texte arabe/hébreu, lʼenroulement souple et les sauts durs.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · RichText</span></div>
  <iframe src="/sandbox/ui/component.html?name=richtext&v=core-1.17.1-ui-2.3.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de RichText" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Le lien en ligne est une zone dʼancrage transparente au-dessus du texte du canvas.</figcaption>
</figure>

## Exemple minimal

```ts
import { RichText } from '@vectojs/ui';

const copy = new RichText(
  [
    { text: 'Mixte ' },
    { text: 'gras', style: { bold: true, color: '#22d3ee' } },
    { text: ' avec ' },
    { text: 'liens', style: { href: '/learn/accessibility/' } },
  ],
  {
    maxWidth: 420,
    selectable: true,
    onLinkClick: (href) => router.open(href),
  },
);
```

## Liste de vérification pour les mainteneurs

- Maintenez les callbacks de lien câblés à travers les moteurs de rendu de paragraphe, titre et liste.
- Utilisez `appendSpans()` pour le flux de jetons.
- `getContentProjection()` porte une ligne visuelle explicite avec des polices par intervalle,
  une ligne de base Canvas partagée et lʼavancement réel de la ligne. Cela maintient les rectangles
  de sélection de tailles mixtes alignés au lieu de laisser le navigateur réorganiser les intervalles.
  Les séparateurs logiques appartiennent à la ligne positionnée précédente, donc la sélection
  multiligne ne crée jamais de fragment de surbrillance errant à lʼorigine de la racine.
  Core 1.8 résout les carets graphèmes légaux à partir de la géométrie Range bidimensionnelle
  transformée, y compris la rotation, la réflexion et lʼéchelle non uniforme.
  Utilisez `setSelectable(false)` lorsque la sélection native par glissement nʼest pas souhaitée.
- Utilisez `setExclusions()` lorsque le texte doit contourner des rectangles locaux.
