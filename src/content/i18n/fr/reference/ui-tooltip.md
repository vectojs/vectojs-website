---
title: 'UI: Tooltip'
description: 'Texte superposé déclenché par survol, ancré à une entité cible.'
order: 37
---

# `Tooltip`

`Tooltip` affiche un petit panneau de texte près dʼune cible après un délai.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Tooltip</span></div>
  <iframe src="/sandbox/ui/component.html?name=tooltip&v=core-1.11.1-ui-1.11.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de Tooltip" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Survolez la cible pour vérifier le placement et la fermeture.</figcaption>
</figure>

## Exemple minimal

```ts
import { Button, Tooltip } from '@vectojs/ui';

const target = new Button('Survolez-moi');
const tooltip = new Tooltip({
  target,
  content: 'Enregistrer le fichier',
  placement: 'right',
});
```

## Liste de vérification pour les mainteneurs

- Nettoyez les minuteurs en attente lors du départ du pointeur.
- Gardez le contenu de lʼinfobulle court.
- Montez une seule fois ; laissez lʼinfobulle gérer son propre cycle dʼaffichage/masquage.
