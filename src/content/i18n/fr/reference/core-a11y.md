---
title: 'a11yRoot et le contrat agent'
description: "Comment chaque entité interactive projette un nœud d'ombre ARIA transparent dans le DOM — la structure A11yAttributes, le contrat performance-canvas-et-accessibilité-DOM, et les pièges de synchronisation qui causent des nœuds d'ombre obsolètes ou manquants."
order: 10
---

# a11yRoot et le contrat agent

Partie de [`@vectojs/core`](/reference/core-api/).

Toute entité interactive possédant une boîte projette un **nœud d'ombre ARIA
transparent** dans le `div` `a11yRoot` de la Scène (au-dessus du canvas,
`pointerEvents:auto` pour que l'automatisation/AT puisse interagir ;
`opacity:0` sauf si `debugA11y`). Chaque nœud porte
`id` + `data-vecto-id`, ainsi que le rôle/label/état fournis par
[`Entity.getA11yAttributes()`](/reference/core-entity/#hooks-a11y--lot-redéfinir-pour-adhérer).

La racine de projection suit la boîte CSS du canvas : le décalage du canvas et le
dimensionnement CSS non uniforme sont appliqués à l'ombre et aux couches du portail
DOM tandis que la géométrie des entités reste dans les coordonnées logiques de la
Scène. Les rotations/skews CSS arbitraires du canvas ne font pas partie de ce
mappage.

`A11yAttributes` :

```ts
{
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea';   // défaut 'div'
  role?, label?, tabIndex?, href?, src?, alt?, inputType?, placeholder?, value?,
  checked?, disabled?, expanded?, controls?, haspopup?, selected?,
  activedescendant?, valuemin?, valuemax?
}
```

La synchronisation applique ces attributs à un élément réel (un vrai `<button>`,
`<a href>`, `<img>`, `<input>`/`<textarea>` avec `change`/`focus`/`blur` compatible IME,
etc.), avec une vérification de saleté pour minimiser les écritures DOM. Les rôles
interactifs non nativement focusables (`button`, `switch`, `checkbox`, `link`, `slider`, …)
reçoivent `tabindex="0"` et Entrée/Espace → `click`. C'est l'histoire de la
« **performance canvas ET l'accessibilité DOM** » : les visuels sont 100 % GPU/canvas,
pourtant un `getByRole('button', { name })` de Playwright/agent résout le nœud d'ombre
et clique dessus.

Définissez explicitement `tabIndex: 0` lorsqu'une région non-contrôle telle qu'un
canvas de conception doit entrer dans l'ordre de focus séquentiel et recevoir des
événements VMT `keydown`. Utilisez `-1` pour le focus programmatique uniquement ;
retourner `undefined` supprime la valeur explicite.

## Contrôles et pièges

- `data-vecto-id` sur chaque nœud d'ombre reflète l'`id` de l'entité — l'identifiant
  stable pour les sélecteurs d'automatisation.
- `a11ySyncInterval` (voir [`SceneOptions`](/reference/core-scene/#sceneoptions))
  limite la synchronisation pendant l'animation et assure un rattrapage final après
  que le mouvement en attente s'est stabilisé ; il ne suspend pas toute synchronisation
  pendant toute l'animation.
- `debugA11y: true` affiche les nœuds (tireté bleu) pour le développement.
- `detachA11y(entity)` élague les nœuds d'ombre d'une sous-arborescence sans retirer
  l'entité ; `remove()` élague automatiquement. La synchronisation par image
  **crée/met à jour mais n'élague jamais**, donc gérez explicitement le renouvellement
  des enfants interactifs.
- `getA11yTree()` retourne un instantané `A11yTreeNode[]` imbriqué pour les assertions ;
  `getA11yElement(id)` récupère un élément d'ombre spécifique.
- `a11yFullViewport` monte une surface d'interaction sans limites derrière toutes les
  autres.

Voir [Accessibilité](/learn/accessibility/) pour les modèles d'utilisation et de test.

## Associé

[`Scene`](/reference/core-scene/) (`a11ySyncInterval`, `debugA11y`) ·
[`Entity`](/reference/core-entity/) (`getA11yAttributes()`, `interactive`, `width`/`height`) ·
[`@vectojs/core` overview](/reference/core-api/)
