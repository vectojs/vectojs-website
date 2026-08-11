+++
title = "UI: VirtualList"
description = "Liste de défilement virtualisée qui ne monte que les lignes visibles plus le surbalayage."
weight = 33

[extra]
order = 33
+++

# `VirtualList`

`VirtualList` nʼaffiche que la fenêtre visible dʼun long tableau dʼéléments. Utilisez-le pour les grandes listes où
le montage régulier dʼenfants gaspillerait du travail.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · VirtualList</span></div>
  <iframe src="/sandbox/ui/component.html?name=virtuallist&v=core-1.34.0-ui-2.15.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de VirtualList" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>La démo a 120 éléments, mais seules les lignes visibles plus le surbalayage sont montées.</figcaption>
</figure>

## Exemple minimal

```ts
import { Text, VirtualList } from '@vectojs/ui';

const list = new VirtualList({
  items,
  width: 360,
  height: 400,
  estimatedRowHeight: 32,
  renderItem: (item) => new Text(item.label),
});
```

## Liste de vérification pour les mainteneurs

- Fournissez un `estimatedRowHeight` réaliste.
- Gardez les entités de ligne légères et autonomes.
- Utilisez `setItems()` lors du remplacement de lʼensemble complet de données.
