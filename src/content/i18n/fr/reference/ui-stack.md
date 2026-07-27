---
title: 'UI: Stack'
description: 'Conteneur de disposition structurelle pour le placement vertical ou horizontal des enfants.'
order: 21
---

# `Stack`

`Stack` positionne les enfants séquentiellement le long dʼun axe et se dimensionne en fonction du contenu disposé.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Stack</span></div>
  <iframe src="/sandbox/ui/component.html?name=stack&v=core-1.18.0-ui-2.3.2" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de Stack" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Les enfants conservent leurs propres tailles ; `Stack` écrit seulement leurs `x` et `y` locaux.</figcaption>
</figure>

## Exemple minimal

```ts
import { Button, Stack, Text } from '@vectojs/ui';

const column = new Stack({ direction: 'vertical', gap: 12 });
column.add(new Text('Paramètres dʼexport'));
column.add(new Button('Enregistrer'));
scene.add(column.setPosition(24, 24));
```

## Liste de vérification pour les mainteneurs

- Appelez `layout()` après avoir muté directement les tailles des enfants.
- Utilisez `align` pour le placement sur lʼaxe transversal.
- Utilisez `Flow` lorsque le besoin principal est lʼenroulement horizontal.
