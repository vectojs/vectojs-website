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
  <iframe src="/sandbox/ui/component.html?name=treeview&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de TreeView" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## Options

| Option                                         | Type             | Défaut | Notes                                                                                                                          |
| ---------------------------------------------- | ---------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `nodes`                                        | `TreeNode[]`     | —      | Nœuds racines. Les `children` dʼun nœud peuvent être un tableau **ou** `() => Promise<TreeNode[]>` pour le chargement différé. |
| `width` / `height`                             | `number`         | —      | Boîte du viewport. Les lignes sont virtualisées dedans.                                                                        |
| `rowHeight`                                    | `number`         | `28`   | Pas de ligne.                                                                                                                  |
| `font`, `color`, `selectedColor`, `hoverColor` | `string`         | thème  | Peinture des lignes.                                                                                                           |
| `onSelect`                                     | `(node) => void` | —      | Se déclenche lors de lʼactivation dʼune feuille.                                                                               |
| `onExpand`                                     | `(node) => void` | —      | Se déclenche lors de lʼexpansion dʼun parent.                                                                                  |

`setNodes(nodes)` remplace lʼarbre ; expansion/sélection sont indexées par le `id` du nœud, donc des ID stables préservent lʼétat lors dʼun remplacement.

## Accessibilité et clavier

`TreeView` projette un `role="treeitem"` par rangée **visible** — un point dʼaccès transparent et focusable groupé sur la rangée, portant `aria-level` (profondeur), le `aria-expanded` de la rangée (parents uniquement), `aria-selected`, et un **tabindex tournant** pour que tout lʼarbre soit un seul arrêt de tabulation.

| Touche          | Action                                                                         |
| --------------- | ------------------------------------------------------------------------------ |
| Bas / Haut      | Aller à la rangée suivante / précédente                                        |
| Droite          | Développer un parent replié ; si déjà développé, entrer dans le premier enfant |
| Gauche          | Réduire un parent développé ; sinon aller à la rangée parent                   |
| Home / End      | Première / dernière rangée                                                     |
| Entrée / Espace | Activer (basculer un parent, sélectionner une feuille)                         |

La rangée active est défilée en vue avant que le focus ne se déplace vers elle. Comme seules les rangées visibles sont groupées, un arbre de 100k nœuds projette encore O(viewport) nœuds.

Les points dʼaccès définissent `pointerEvents: 'none'` pour que lʼarbre conserve sa propre gestion souris (tap pour basculer, glisser pour défiler) — le focus clavier et les `click` synthétisés par AT passent toujours. Voir [Widgets composites](/reference/core-a11y/#widgets-composés-tabindex-flottant).

## Pointeur et toucher

- **Tapez** sur une rangée pour basculer/sélectionner. Le basculement se déclenche sur `pointerup`, et uniquement si le pointeur a bougé de moins de ~6px — ainsi un glissement tactile ne développe pas accidentellement la rangée sur laquelle il a commencé.
- **Glissez** verticalement pour défiler (les rangées suivent le doigt 1:1), comme `ScrollView` / `VirtualList`.
- **Molette** pour défiler.

## Liste de vérification pour les mainteneurs

- Reconstruisez les lignes après expansion, réduction ou remplacement de nœud.
- Gardez les chargeurs paresseux idempotents.
- Utilisez des ID de nœuds stables pour lʼétat de sélection et dʼexpansion.
- Nʼajoutez pas de gestionnaire de pointeur concurrent à une rangée : le composant possède la désambiguïsation tap vs. glisser, et les points dʼaccessibilité délibérément ne capturent pas le pointeur.
