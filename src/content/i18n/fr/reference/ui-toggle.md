---
title: 'UI: Toggle'
description: 'Contrôle à bascule avec sémantique role=switch et mouvement à ressort du bouton.'
order: 26
---

# `Toggle`

`Toggle` est un contrôle booléen de type interrupteur. Il projette `role="switch"` et anime le bouton avec
le système dʼanimation partagé.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Toggle</span></div>
  <iframe src="/sandbox/ui/component.html?name=toggle&v=core-1.11.1-ui-1.11.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de Toggle" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Le bouton se repositionne en douceur tandis que lʼétat sémantique `checked` reste à jour.</figcaption>
</figure>

## Exemple minimal

```ts
import { Toggle } from '@vectojs/ui';

const darkMode = new Toggle({
  checked: true,
  label: 'Mode sombre',
  onChange: (checked) => setDarkMode(checked),
});
```

## Liste de vérification pour les mainteneurs

- Maintenez lʼanimation du bouton et lʼétat sémantique alignés.
- Respectez le mouvement réduit via le système dʼanimation partagé.
- Préférez `Checkbox` pour les choix booléens non interrupteurs.
