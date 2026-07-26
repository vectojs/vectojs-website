---
title: 'UI: RadioGroup'
description: 'Choix radio mutuellement exclusifs rendus comme un seul composant canvas.'
order: 28
---

# `RadioGroup`

`RadioGroup` affiche un ensemble dʼoptions mutuellement exclusives et expose un rôle sémantique au niveau du groupe.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · RadioGroup</span></div>
  <iframe src="/sandbox/ui/component.html?name=radiogroup&v=core-1.17.0-ui-2.2.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de RadioGroup" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>La démo bascule entre une disposition horizontale et verticale sur les largeurs étroites.</figcaption>
</figure>

## Exemple minimal

```ts
import { RadioGroup } from '@vectojs/ui';

const renderer = new RadioGroup({
  value: 'webgpu',
  direction: 'horizontal',
  options: [
    { value: 'canvas', label: 'Canvas' },
    { value: 'webgl', label: 'WebGL' },
    { value: 'webgpu', label: 'WebGPU' },
  ],
});
```

## Liste de vérification pour les mainteneurs

- Maintenez lʼétat visuel sélectionné et la valeur émise alignés.
- Utilisez le style et le comportement désactivés ensemble.
- Recalculez la disposition lorsque les libellés, la police ou la direction changent.
