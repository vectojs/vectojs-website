---
title: 'UI: Popover'
description: 'Panneau superposé déclenché par clic pouvant contenir des enfants VectoJS arbitraires.'
order: 38
---

# `Popover`

`Popover` sʼactive/désactive au clic sur la cible et peut contenir nʼimporte quelles entités enfants VectoJS.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Popover</span></div>
  <iframe src="/sandbox/ui/component.html?name=popover&v=core-1.25.0-ui-2.6.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de Popover" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Cliquez deux fois sur la cible pour ouvrir et fermer le popover.</figcaption>
</figure>

## Exemple minimal

```ts
import { Button, Popover, Text } from '@vectojs/ui';

const target = new Button('Ouvrir');
const popover = new Popover({ target, width: 220, height: 92, placement: 'right' });
popover.add(new Text('Contenu du Popover').setPosition(14, 20));
```

## Liste de vérification pour les mainteneurs

- Gardez le panneau lisible sur les contrôles sous-jacents.
- Limitez le placement via les limites de `Overlay`.
- Cachez ou supprimez les popovers lorsque leur cible quitte lʼarbre.
