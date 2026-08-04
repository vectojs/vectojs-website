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
  <iframe src="/sandbox/ui/component.html?name=radiogroup&v=core-1.30.0-ui-2.12.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de RadioGroup" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

`RadioGroup` projette `{ role: 'radiogroup', label }`. Depuis la 2.8.0, le nom accessible du groupe lui-même est définissable, avec `'Radio group'` par défaut :

```ts
new RadioGroup({
  label: 'Render backend',
  options: [
    { value: 'canvas', label: 'Canvas' },
    { value: 'webgl', label: 'WebGL' },
  ],
});
```

Chaque option porte son propre nom, mais c'est le nom du groupe qui dit _quel choix est fait_. Sur un écran avec plus d'un groupe, le défaut laisse l'utilisateur de lecteur d'écran entendre "Radio group" à répétition sans moyen de les distinguer — définissez-le dès que le titre visuel identifiant le groupe est dessiné sur le canvas plutôt que de faire partie du groupe (WCAG 4.1.2). Il est aussi définissable après construction comme champ public.

## Liste de vérification pour les mainteneurs

- Maintenez lʼétat visuel sélectionné et la valeur émise alignés.
- Utilisez le style et le comportement désactivés ensemble.
- Recalculez la disposition lorsque les libellés, la police ou la direction changent.
