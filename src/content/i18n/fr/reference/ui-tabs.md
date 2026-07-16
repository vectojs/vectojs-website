---
title: 'UI: Tabs'
description: 'Conteneur à onglets qui monte la vue de contenu active.'
order: 29
---

# `Tabs`

`Tabs` dessine une barre dʼonglets et monte uniquement lʼentité de contenu de lʼonglet actif.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Tabs</span></div>
  <iframe src="/sandbox/ui/component.html?name=tabs&v=core-1.9.2-ui-1.9.5" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de Tabs" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Changer dʼonglet retire le contenu inactif de lʼarbre dʼentités.</figcaption>
</figure>

## Exemple minimal

```ts
import { Tabs, Text } from '@vectojs/ui';

const tabs = new Tabs({
  width: 480,
  height: 260,
  tabs: [
    { id: 'usage', label: 'Utilisation', content: new Text('Panneau Utilisation') },
    { id: 'api', label: 'API', content: new Text('Panneau API') },
  ],
});
```

## Liste de vérification pour les mainteneurs

- Maintenez le dimensionnement du contenu des onglets synchronisé avec la taille du conteneur.
- Émettez `change` uniquement lorsque lʼonglet actif change réellement.
- Préservez le comportement clavier/focus dans les futures sémantiques de niveau onglet.
