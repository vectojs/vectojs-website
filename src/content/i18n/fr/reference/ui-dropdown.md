---
title: 'UI: Dropdown'
description: 'Contrôle de type combobox avec une liste superposée et une navigation au clavier.'
order: 27
---

# `Dropdown`

`Dropdown` enveloppe un bouton canvas, projette `role="combobox"` et ouvre une liste superposée.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Dropdown</span></div>
  <iframe src="/sandbox/ui/component.html?name=dropdown&v=core-1.16.0-ui-2.1.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de Dropdown" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Ouvrez-le avec le pointeur ou le clavier ; le menu se monte via le chemin de superposition de la scène.</figcaption>
</figure>

## Exemple minimal

```ts
import { Dropdown } from '@vectojs/ui';

const backend = new Dropdown(['Canvas', 'WebGL', 'WebGPU'], {
  width: 220,
  onChange: (value) => setBackend(value),
});
```

## Liste de vérification pour les mainteneurs

- Maintenez les métadonnées `expanded`, `controls` et `activedescendant` synchronisées.
- Fermez la superposition lors dʼun clic à lʼextérieur et avec la touche Échap.
- Testez les touches Flèche Haut, Flèche Bas, Entrée, Espace et Échap.
