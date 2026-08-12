+++
title = "UI: Panneaux redimensionnables"
description = "PanelGroup, Panel et PanelResizeHandle pour des dispositions à panneaux séparables par glissement."
weight = 35
+++

# Panneaux redimensionnables

Les exports de panneaux redimensionnables fonctionnent ensemble : `PanelGroup` divise lʼespace, `Panel` possède une région de contenu
clipsée, et `PanelResizeHandle` est inséré automatiquement entre les panneaux.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · PanelGroup</span></div>
  <iframe src="/sandbox/ui/component.html?name=resizablepanel&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de panneau redimensionnable" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Faites glisser le séparateur entre les panneaux pour inspecter le survol de la poignée et le comportement de redimensionnement.</figcaption>
</figure>

## Exemple minimal

```ts
import { Panel, PanelGroup, Stack, Text } from '@vectojs/ui';

const group = new PanelGroup({ direction: 'horizontal', width: 640, height: 360 });
group
  // Le contenu de la barre latérale est un Stack, conçu pour être dimensionné
  // pour remplir son viewport — le `fit: true` par défaut le maintient
  // adapté à la boîte du panneau à chaque redimensionnement/glissement,
  // comblant l'écart qui nécessitait auparavant une synchronisation manuelle
  // `content.width = panel.width` (voir "Dimensionnement du contenu hébergé" ci-dessous).
  .addPanel(
    new Panel({ minSize: 160 }).setContent(
      new Stack({ direction: 'vertical' }).add(new Text('Barre latérale')),
    ),
  )
  .addPanel(
    new Panel({ minSize: 260 }).setContent(
      new Stack({ direction: 'vertical' }).add(new Text('Canvas')),
    ),
  );
```

## Dimensionnement du contenu hébergé (`setContent`)

`Panel.setContent(content, fit?)` maintient le `width`/`height` du contenu hébergé
synchronisé avec la propre boîte du panneau par défaut (`fit: true`, les deux axes) — y compris
à chaque glissement ultérieur du diviseur du `PanelGroup` ou appel à `resize()`, pas seulement au
moment de `setContent()`. Cela comble une lacune réelle : auparavant `setContent` ne faisait que
positionner le contenu (`content.x = 0; content.y = 0`), donc une application devait
synchroniser manuellement `content.width = panel.width` à chaque redimensionnement, et manquer
cette synchronisation à un endroit dans une chaîne de composants profonde produisait un bogue
de débordement de clip en production.

```ts
panel.setContent(maMiseEnPage); // suit à la fois width et height (défaut)
panel.setContent(maMiseEnPage, false); // ancien comportement position-only
panel.setContent(maMiseEnPage, { width: true, height: false }); // width seulement
```

**Passez `fit: false` pour le contenu à dimensionnement automatique** — une entité dont le propre
`width`/`height` sont dérivés de son contenu plutôt que définis par l'auteur (par ex. un
`Text` nu sans `maxWidth`, qui recalcule sa propre boîte à partir de
`result.totalWidth`/nombre de lignes à chaque `setText()`/`setMaxWidth()`).
Laisser le `fit: true` par défaut forcer la boîte d'une telle entité à celle du
panneau chaque trame écrase sa taille auto-calculée — inoffensif pour le propre
`render()` de `Text` (qui dessine depuis ses `lines` en cache, pas directement depuis `width`/`height`),
mais cela corrompt tout ce qui lit le `width`/`height` de cette entité
pour la mise en page : les tests de hit, la taille de son élément d'ombre a11y et les
audits de scène. Enveloppez le contenu à dimensionnement automatique dans un `Stack`/`Flow` (qui
sont eux-mêmes adaptés à `fit`, car positionner les enfants — pas s'auto-dimensionner — est
leur seul travail) si vous voulez qu'il soit centré/rempli dans un panneau, ou passez
`fit: false` et dimensionnez-le vous-même.

## Liste de vérification pour les mainteneurs

- Préservez le `minSize` de chaque panneau lors du glissement.
- Appelez `resize(width, height)` lorsque le conteneur hôte change de taille.
- Gardez les instances `PanelGroup` imbriquées à lʼintérieur dʼune limite de contenu `Panel`.
- Passez `fit: false` à `setContent()` pour le contenu à dimensionnement automatique (`Text` nu
  sans `maxWidth`, ou toute entité dont la propre mise en page calcule sa boîte) —
  le `fit: true` par défaut est correct pour les conteneurs de mise en page (`Stack`, `Flow`,
  un autre `PanelGroup`) mais écraserait la boîte d'une entité à dimensionnement automatique chaque
  trame.
