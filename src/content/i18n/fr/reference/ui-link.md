---
title: 'UI: Link'
description: 'Lien autonome rendu sur canvas avec une projection dʼancre sémantique.'
order: 18
---

# `Link`

`Link` est destiné au texte de navigation autonome. Pour les liens en ligne dans la prose, utilisez `RichText` ou
`Markdown`.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Link</span></div>
  <iframe src="/sandbox/ui/component.html?name=link&v=core-1.32.2-ui-2.13.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de Link" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Le texte visible est sur le canvas ; lʼautomatisation et les technologies dʼassistance voient une vraie ancre.</figcaption>
</figure>

## Exemple minimal

```ts
import { Link } from '@vectojs/ui';

scene.add(
  new Link('Ouvrir la doc ↗', {
    href: 'https://vectojs.org',
  }).setPosition(24, 24),
);
```

## Liste de vérification pour les mainteneurs

- Nettoyez les URL avant dʼouvrir ou de projeter `href`.
- Gardez le libellé visible et le nom accessible alignés.
- Préférez `RichText` pour les liens intégrés dans un paragraphe.
