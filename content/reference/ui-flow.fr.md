+++
title = "UI: Flow"
description = "Conteneur de disposition horizontale avec retour à la ligne pour chips, étiquettes et barres dʼoutils responsives."
weight = 22
+++

# `Flow`

`Flow` est un `Stack` préconfiguré pour lʼenroulement horizontal.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Flow</span></div>
  <iframe src="/sandbox/ui/component.html?name=flow&v=core-1.39.0-ui-2.20.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de Flow" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Utilisez `maxWidth` pour définir où les enfants passent à la ligne suivante.</figcaption>
</figure>

## Exemple minimal

```ts
import { Button, Flow } from '@vectojs/ui';

const chips = new Flow({ gap: 8, maxWidth: 360 });
for (const label of ['Canvas', 'WebGL', 'WebGPU']) {
  chips.add(new Button(label, { padding: 8 }));
}
```

## Liste de vérification pour les mainteneurs

- Réexécutez `layout()` après les changements de taille des enfants.
- Gardez les cibles tactiles des chips suffisamment grandes pour le mobile.
- Préférez `Flow` au placement manuel x/y pour les rangées dʼétiquettes.
