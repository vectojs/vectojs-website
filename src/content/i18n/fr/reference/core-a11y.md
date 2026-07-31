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
  // Element + identity
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea';   // défaut 'div'
  role?: string;
  label?: string;                      // aria-label
  labelledby?: string;                 // aria-labelledby
  describedby?: string;                // aria-describedby

  // Focus & pointer
  tabIndex?: number;
  pointerEvents?: 'auto' | 'none';     // default 'auto'

  // Native element attributes (only for the matching `tag`)
  href?: string; target?: string;      // tag: 'a'
  src?: string; alt?: string;          // tag: 'img'
  inputType?: string; placeholder?: string; value?: string;
  textInputStyle?: TextInputStyle;     // native editor typography

  // State
  checked?: boolean; disabled?: boolean; selected?: boolean;
  expanded?: boolean; required?: boolean; invalid?: boolean;
  valuemin?: string; valuemax?: string;
  level?: number;                      // aria-level (headings, tree items)

  // Relationships & popups
  controls?: string; haspopup?: string; activedescendant?: string;
  ariaModal?: 'true' | 'false';        // aria-modal on a role="dialog"

  // Live regions
  live?: 'off' | 'polite' | 'assertive';
  atomic?: boolean;                    // aria-atomic
  relevant?: string;                   // aria-relevant
}
```

Chaque champ est projeté sur un attribut réel chaque image avec vérification de saleté. Retourner `undefined` pour un champ **supprime** l'attribut, donc l'état qui cesse de s'appliquer disparaît plutôt que de devenir obsolète — notez que `false` est distinct de `undefined` ici (`aria-invalid="false"` signifie « explicitement valide » et est préservé).

La synchronisation applique ces attributs à un élément réel (un vrai `<button>`,
`<a href>`, `<img>`, `<input>`/`<textarea>` avec `change`/`focus`/`blur` compatible IME,
etc.). C'est l'histoire de la « **performance canvas ET l'accessibilité DOM** » : les visuels sont 100 % GPU/canvas,
pourtant un `getByRole('button', { name })` de Playwright/agent résout le nœud d'ombre
et clique dessus.

## Ordre de focus

Les rôles
interactifs non nativement focusables (`button`, `switch`, `checkbox`, `link`, `slider`, …)
reçoivent `tabindex="0"` et Entrée/Espace → `click`.

**Les widgets composés sont différents.** Un `tree`, `grid`, `menu`, `radiogroup` ou
`tablist` est un arrêt de tabulation, pas un par enfant — donc leurs enfants utilisent un **tabindex flottant** : exactement un enfant porte `tabIndex: 0` et le reste `-1`, et les flèches déplacent cet arrêt. Voir [Widgets composés](#widgets-composés-tabindex-flottant).

L'ordre de tabulation suit l'ordre de lecture **visuel**, pas l'ordre d'insertion du graphe de scène — voir [`Scene.readingDirection`](/reference/core-scene/#accessibilité-et-apparence) pour le RTL.

Définissez explicitement `tabIndex: 0` lorsqu'une région non-contrôle telle qu'un
canvas de conception doit entrer dans l'ordre de focus séquentiel et recevoir des
événements VMT `keydown`. Utilisez `-1` pour le focus programmatique uniquement ;
retourner `undefined` supprime la valeur explicite.

## Widgets composés (tabindex flottant)

Un arbre, grille, menu, groupe radio ou liste d'onglets doit exposer **un rôle par enfant**,
pas seulement un rôle de conteneur — sinon AT ne voit qu'une boîte opaque. VectoJS y parvient
en rassemblant une entité enfant transparente et focalisable (« point chaud ») sur chaque
enfant visible : elle porte le `role` de l'enfant + l'état + le `tabindex` flottant, ne
rend rien, et le parent possède le gestionnaire clavier.

Ces points chauds définissent crucialement `pointerEvents: 'none'`. Le composant
en dessous possède déjà la souris (cliquer pour basculer, glisser pour défiler, texte
de cellule sélectionnable), donc le point chaud ne doit pas l'intercepter — le focus clavier
et le `click` synthétisé par AT fonctionnent toujours à travers un élément en `pointer-events:none`.

| Composant     | Rôle enfant                                                   | Clavier                                                                                                                                                           |
| ------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TreeView`    | `treeitem` (+ `aria-level`, `aria-expanded`, `aria-selected`) | Haut/Bas déplacent · Droite développe puis entre · Gauche replie puis retour au parent · Home/End · Entrée/Espace activent                                        |
| `Table`       | `row` › `gridcell` / `columnheader`                           | Flèches déplacent en 2D (en-tête est row −1) · Home/End extrémités de ligne · Ctrl+Home/Ctrl+End coins de grille                                                  |
| `ContextMenu` | `menuitem` (+ `aria-haspopup`, `aria-expanded`)               | Haut/Bas bouclent et sautent séparateurs + désactivés · Home/End · Droite ouvre sous-menu · Gauche retourne au menu parent · Entrée/Espace activent · Échap ferme |
| `RadioGroup`  | `radio` (+ `aria-checked`)                                    | Flèches déplacent et sélectionnent · Home/End · Espace sélectionne                                                                                                |
| `Tabs`        | `tab` (+ `aria-selected`)                                     | Flèches déplacent · Home/End · Espace/Entrée activent                                                                                                             |

Seuls les enfants visibles sont rassemblés, donc un `TreeView` ou `Table` virtualisé
projette O(viewport) points chauds au lieu d'un par ligne dans le jeu de données.
La ligne/ cellule focalisée est défilée en vue avant que le focus ne se déplace.

## Couleurs forcées (Contraste élevé)

Un canvas est des pixels opaques, donc le remappage `forced-colors` du navigateur ne
touche jamais ce que VectoJS dessine — sous Windows Contraste élevé un contrôle thématisé
reste illisible à moins que le composant ne se repeigne. Lire
[`Scene.forcedColors`](/reference/core-scene/#accessibilité-et-apparence) et dessiner
avec les couleurs système CSS (`ButtonFace`, `ButtonText`, `Highlight`, `Canvas`,
`CanvasText`) ; la scène se repeint automatiquement quand le paramètre change.
`Button` le fait déjà.

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
- Depuis Core 1.11.1, toute nouvelle entité interactive projetée reçoit le `z-index`
  correspondant à l'ordre de peinture du canvas dans l'image qui crée son nœud d'ombre.
  Le backdrop d'un nouvel overlay se place donc au-dessus des contrôles existants dès la
  première interaction du pointeur, sans attendre un autre rendu.

Voir [Accessibilité](/learn/accessibility/) pour les modèles d'utilisation et de test.

## Associé

[`Scene`](/reference/core-scene/) (`a11ySyncInterval`, `debugA11y`) ·
[`Entity`](/reference/core-entity/) (`getA11yAttributes()`, `interactive`, `width`/`height`) ·
[`@vectojs/core` overview](/reference/core-api/)
