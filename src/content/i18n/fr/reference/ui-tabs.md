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
  <iframe src="/sandbox/ui/component.html?name=tabs&v=core-1.11.1-ui-1.11.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de Tabs" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Changer dʼonglet retire le contenu inactif de lʼarbre dʼentités.</figcaption>
</figure>

## Exemple minimal

````ts
import { Tabs, Text } from '@vectojs/ui';

const tabs = new Tabs({
  width: 480,
  height: 260,
  tabs: [
    { id: 'usage', label: 'Utilisation', content: new Text('Panneau Utilisation') },
    { id: 'api', label: 'API', content: new Text('Panneau API') },
  ],
});

## Masquer la barre pour un seul onglet

Les éditeurs et les applications de type terminal souhaitent souvent le comportement `showtabline=1` de Vim : pas
de barre d'onglets tant qu'un seul onglet existe. Passez `autoHideTabBar: true`
(`@vectojs/ui` >= 1.10.0) — la barre (et sa zone d'impact du pointeur) disparaît
en dessous de deux onglets, le contenu occupe toute la hauteur, et la barre revient dès
qu'un second onglet est ajouté. Les propriétaires qui disposent des frères autour de la barre
devraient lire l'accesseur live `effectiveTabBarHeight` plutôt que de supposer
`tabHeight`.

```ts
const tabs = new Tabs({
  width: 480,
  height: 260,
  autoHideTabBar: true,
  tabs: [{ id: 'only', label: 'untitled', content: editorView }],
});
tabs.effectiveTabBarHeight; // 0 maintenant, tabHeight dès qu'un second onglet s'ouvre
````

## Liste de vérification pour les mainteneurs

- Maintenez le dimensionnement du contenu des onglets synchronisé avec la taille du conteneur.
- Émettez `change` uniquement lorsque lʼonglet actif change réellement.
- Préservez le comportement clavier/focus dans les futures sémantiques de niveau onglet.
