---
title: 'UI: Modal'
description: 'Composant de superposition bloquant avec une carte, un arrière-plan et une animation dʼentrée/sortie à ressort.'
order: 36
---

# `Modal`

`Modal` se monte dans la couche de superposition, bloque les événements de pointeur sous-jacents et anime sa carte en
entrée et sortie.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Modal</span></div>
  <iframe src="/sandbox/ui/component.html?name=modal&v=core-1.34.0-ui-2.15.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de Modal" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Ouvrez la modal, puis fermez-la avec le bouton de fermeture rendu sur canvas.</figcaption>
</figure>

## Exemple minimal

```ts
import { Button, Modal } from '@vectojs/ui';

const open = new Button('Ouvrir la modal', {
  onClick: () => {
    scene.showOverlay(new Modal('Export terminé', { width: scene.width, height: scene.height }));
  },
});
```

## Liste de vérification pour les mainteneurs

- Dimensionnez lʼarrière-plan de la modal aux dimensions de la scène.
- Gardez le comportement de fermeture explicite.
- Vérifiez le comportement en mouvement réduit et la gestion du focus avant une utilisation généralisée.
