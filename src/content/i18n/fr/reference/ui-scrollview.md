---
title: 'UI: ScrollView'
description: 'Conteneur de défilement clippé avec défilement par molette et par glissement du pointeur.'
order: 32
---

# `ScrollView`

`ScrollView` possède une région clippée défilable. Utilisez-le lorsque le contenu limité peut dépasser la zone
visible.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ScrollView</span></div>
  <iframe src="/sandbox/ui/component.html?name=scrollview&v=core-1.18.0-ui-2.3.2" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de ScrollView" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Molette ou glissement à lʼintérieur de la zone dʼaffichage ; évitez les propriétaires de défilement concurrents imbriqués.</figcaption>
</figure>

## Exemple minimal

```ts
import { ScrollView, Text } from '@vectojs/ui';

const view = new ScrollView({ width: 360, height: 220 });
view.add(new Text('Contenu long').setPosition(16, 16));
scene.add(view);
```

## Liste de vérification pour les mainteneurs

- Gardez un seul propriétaire de molette par région visible.
- Appelez `updateContentSize()` après les changements de placement direct des enfants.
- Utilisez `scrollToBottom()` pour le contenu en flux épinglé à la fin.
