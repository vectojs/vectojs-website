---
title: 'UI: Panneaux redimensionnables'
description: 'PanelGroup, Panel et PanelResizeHandle pour des dispositions à panneaux séparables par glissement.'
order: 35
---

# Panneaux redimensionnables

Les exports de panneaux redimensionnables fonctionnent ensemble : `PanelGroup` divise lʼespace, `Panel` possède une région de contenu
clipsée, et `PanelResizeHandle` est inséré automatiquement entre les panneaux.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · PanelGroup</span></div>
  <iframe src="/sandbox/ui/component.html?name=resizablepanel&v=core-1.9.2-ui-1.9.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de panneau redimensionnable" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Faites glisser le séparateur entre les panneaux pour inspecter le survol de la poignée et le comportement de redimensionnement.</figcaption>
</figure>

## Exemple minimal

```ts
import { Panel, PanelGroup, Text } from '@vectojs/ui';

const group = new PanelGroup({ direction: 'horizontal', width: 640, height: 360 });
group
  .addPanel(new Panel({ minSize: 160 }).setContent(new Text('Barre latérale')))
  .addPanel(new Panel({ minSize: 260 }).setContent(new Text('Canvas')));
```

## Liste de vérification pour les mainteneurs

- Préservez le `minSize` de chaque panneau lors du glissement.
- Appelez `resize(width, height)` lorsque le conteneur hôte change de taille.
- Gardez les instances `PanelGroup` imbriquées à lʼintérieur dʼune limite de contenu `Panel`.
