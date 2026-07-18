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
  <iframe src="/sandbox/ui/component.html?name=card&v=core-1.11.1-ui-1.11.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de Card" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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
  label: 'Settings panel',
});

card.add(new Text('Settings').setPosition(24, 24));
scene.add(card);
```

## Liste de vérification pour les mainteneurs

- Utilisez `label` uniquement lorsque la région doit être détectable.
- Ne supposez pas que `padding` agence automatiquement les enfants.
- Préférez `Stack` ou `Flow` à lʼintérieur dʼune carte pour une disposition maintenable.
