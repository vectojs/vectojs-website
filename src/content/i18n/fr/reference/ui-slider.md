---
title: 'Slider'
description: 'Composant de curseur sur canvas qui expose le contrat WAI-ARIA slider et se repeint en douceur dans les scènes on-demand.'
order: 13
---

# `Slider`

`Slider` est un contrôle de plage piloté par le pointeur. Il peint la piste, la progression et le pouce sur le canvas, tout en
exposant `role="slider"` avec `valuemin`, `valuemax` et les métadonnées `value` en direct.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Slider</span></div>
  <iframe src="/sandbox/ui/slider.html?v=core-1.9.2-ui-1.10.0" class="sandbox-frame component-demo-frame component-demo-frame-tall" loading="eager" title="Démonstration live de Slider" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>Faites glisser le pouce et regardez le libellé et la barre de progression se mettre à jour à partir du même événement de changement.</figcaption>
</figure>

## Exemple minimal

```ts
import { Slider, Text } from '@vectojs/ui';

const label = new Text('Qualité : 64%');
const slider = new Slider({
  min: 0,
  max: 100,
  value: 64,
  width: 320,
  onChange(value) {
    label.setText(`Qualité : ${value}%`);
    scene.markDirty();
  },
});
```

## Constructeur

```ts
new Slider({
  min?: number;              // default 0
  max?: number;              // default 100
  value?: number;            // default min
  width?: number;            // default 200
  height?: number;           // default 24
  trackColor?: string;
  progressColor?: string;
  handleColor?: string;
  onChange?: (value: number) => void;
})
```

## Événements

`Slider` émet `change` avec `{ value }` après que lʼentrée du pointeur modifie la valeur arrondie. Les événements de pointeur
répétés à la même valeur nʼémettent pas de changements en double.

## Liste de vérification pour les mainteneurs

- Les mises à jour du pointeur doivent limiter le X local dans `[0, width]`.
- Les changements de valeur doivent appeler `scene.markDirty()` pour que `renderMode = 'onDemand'` reste fluide.
- Maintenez les métadonnées de rôle synchronisées avec la valeur actuelle.

Voir aussi : [`ProgressBar`](/reference/ui-components/#progressbar), [`Input`](/reference/ui-components/#input), [`Button`](/reference/ui-button/).
