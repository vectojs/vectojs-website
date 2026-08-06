---
title: 'UI: Card'
description: 'Composant panneau arrondi rendu sur canvas avec sémantique optionnelle role=group.'
order: 20
---

# `Card`

`Card` est le panneau visuel de base utilisé dans tous les exemples de `@vectojs/ui`. Il est décoratif par défaut ;
passer `label` en fait un groupe sémantique.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Card</span></div>
  <iframe src="/sandbox/ui/component.html?name=card&v=core-1.32.2-ui-2.13.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de Card" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Les cartes possèdent leur propre arrière-plan et bordure ; les enfants sont positionnés dans lʼespace local de la carte.</figcaption>
</figure>

## Exemple minimal

```ts
import { Card, Text } from '@vectojs/ui';

const card = new Card({
  width: 320,
  height: 180,
  radius: 18,
  border: 'rgba(148,163,184,0.2)',
  label: 'Panneau de configuration',
});

card.add(new Text('Configuration').setPosition(24, 24));
scene.add(card);
```

## Cibles de clic sur toute la carte

Passez `onClick` pour rendre toute la carte pressable — fini le temps où il fallait
superposer un `Button` transparent sur une `Card` pour la rendre cliquable, ce qui
polluait la projection a11y avec un bouton sans étiquette et produisait
du bruit `overlap` dans les audits de scène. `onClick` nécessite `label` : une
région interactive sans nom accessible recréerait le même problème
un niveau plus haut, donc `Card` lance une erreur plutôt que de l'accepter silencieusement.

```ts
const card = new Card({
  width: 320,
  height: 96,
  label: 'Ouvrir les paramètres',
  onClick: () => openSettingsPanel(),
});
```

## Dimensionnement du contenu hébergé (`setContent`)

`Card.setContent(content, fit?)` place une seule entité de contenu à l'intérieur de la
carte et, par défaut, maintient son `width`/`height` synchronisés avec la propre boîte de la
carte — le même contrat `fitContent` qu'utilise `Panel.setContent` (voir
[`Panneaux redimensionnables`](/reference/ui-resizable-panel/)). `fit` par défaut est `true`
(les deux axes suivis) ; passez `false`, ou `{ width, height }` par axe, pour revenir
à l'ancien comportement position-only.

```ts
const card = new Card({ width: 320, height: 180 });
card.setContent(new SomeContentEntity()); // dimensionné à 320×180, resynchronisé sur les changements de card.width/height
```

Ceci est distinct du simple `add()` : utilisez `add()` pour les décorations
positionnées manuellement (icônes, étiquettes) qui doivent conserver leur propre taille donnée par l'auteur
indépendamment des redimensionnements de la carte ; utilisez `setContent()` pour l'entité qui
doit toujours remplir la carte.

Passez `fit: false` pour le contenu à dimensionnement automatique — une entité dont le propre
`width`/`height` sont dérivés de son contenu (par ex. un `Text` nu sans
`maxWidth`) plutôt que définis par l'auteur. Le `fit: true` par défaut écraserait
la boîte auto-calculée de cette entité chaque trame ; enveloppez-la d'abord dans un `Stack`/`Flow`
si vous voulez qu'elle soit centrée/remplie dans la carte, ou dimensionnez-la vous-même
avec `fit: false`. Voir [Panneaux redimensionnables](/reference/ui-resizable-panel/)
pour l'explication complète — le même contrat `fitContent`, la même mise en garde.

## Liste de vérification pour les mainteneurs

- Utilisez `label` uniquement lorsque la région doit être détectable.
- Ne supposez pas que `padding` agence automatiquement les enfants.
- Préférez `Stack` ou `Flow` à lʼintérieur dʼune carte pour une disposition maintenable.
- Préférez `onClick` plutôt que de superposer un `Button` pour les cibles
  de clic sur toute la carte.
- Préférez `setContent()` plutôt que `add()` + synchronisation manuelle de la taille pour une entité
  qui doit remplir la carte.
