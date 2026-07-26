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
  <iframe src="/sandbox/ui/component.html?name=dropdown&v=core-1.17.0-ui-2.2.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de Dropdown" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Ouvrez-le avec le pointeur ou le clavier ; le menu se monte via le chemin de superposition de la scène.</figcaption>
</figure>

## Exemple minimal

```ts
import { Dropdown } from '@vectojs/ui';

const backend = new Dropdown(['Canvas', 'WebGL', 'WebGPU'], {
  label: 'Renderer backend',
  width: 220,
  onChange: (value) => setBackend(value),
});
```

> **Définissez `label`.** Un `role=\"combobox\"` sans nom accessible est annoncé comme simple "combobox" (WCAG 4.1.2); la valeur sélectionnée seule ne dit pas à quoi sert le contrôle. Toute étiquette visuelle dessinée sur le canvas n'atteint pas la couche sémantique, alors passez-la ici aussi. Disponible depuis `@vectojs/ui@2.2.0`.

## Liste de vérification pour les mainteneurs

- Maintenez les métadonnées `expanded`, `controls` et `activedescendant` synchronisées.
- Fermez la superposition lors dʼun clic à lʼextérieur et avec la touche Échap.
- Testez les touches Flèche Haut, Flèche Bas, Entrée, Espace et Échap.
