---
title: 'UI: ProgressBar'
description: 'Indicateur de progression sur canvas avec étiquette de pourcentage optionnelle et sémantique progressbar.'
order: 30
---

# `ProgressBar`

`ProgressBar` peint une piste, un accent rempli et un texte de pourcentage optionnel.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ProgressBar</span></div>
  <iframe src="/sandbox/ui/component.html?name=progressbar&v=core-1.9.2-ui-1.10.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de ProgressBar" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Utilisez `setValue()` pour limiter et repeindre les changements de progression.</figcaption>
</figure>

## Exemple minimal

```ts
import { ProgressBar } from '@vectojs/ui';

const progress = new ProgressBar({
  value: 0.72,
  width: 320,
  height: 22,
  showText: true,
});

progress.setValue(0.9);
```

## Liste de vérification pour les mainteneurs

- Limitez les valeurs dans `[0, 1]`.
- Associez la couleur de progression à du texte ou une valeur sémantique.
- Appelez `scene.markDirty()` lorsque la valeur change.
