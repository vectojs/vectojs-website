---
title: 'UI: TreeView'
description: 'Composant arborescent hiérarchique avec chargement des enfants immédiat ou paresseux.'
order: 34
---

# `TreeView`

`TreeView` affiche des lignes hiérarchiques avec état dʼexpansion et chargement paresseux optionnel des enfants.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · TreeView</span></div>
  <iframe src="/sandbox/ui/component.html?name=treeview&v=core-1.11.1-ui-1.11.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de TreeView" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Cliquez sur les lignes parentes pour les développer ou les réduire.</figcaption>
</figure>

## Exemple minimal

```ts
import { TreeView } from '@vectojs/ui';

const tree = new TreeView({
  width: 280,
  height: 360,
  nodes: [{ id: 'packages', label: 'packages', children: [{ id: 'ui', label: 'ui' }] }],
});
```

## Liste de vérification pour les mainteneurs

- Reconstruisez les lignes après expansion, réduction ou remplacement de nœud.
- Gardez les chargeurs paresseux idempotents.
- Utilisez des ID de nœuds stables pour lʼétat de sélection et dʼexpansion.
