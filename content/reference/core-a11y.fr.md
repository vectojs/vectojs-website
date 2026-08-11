+++
title = "a11yRoot et le contrat agent"
description = "Comment chaque entité interactive projette un nœud d'ombre ARIA transparent dans le DOM — la structure A11yAttributes, le contrat performance-canvas-et-accessibilité-DOM, et les pièges de synchronisation qui causent des nœuds d'ombre obsolètes ou manquants."
weight = 10

[extra]
order = 10
+++

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

## Coût de la projection à grand nombre d'entités (`1.30.0+`)

Chaque entité interactive qui a une boîte obtient un nœud d'ombre aussi longtemps qu'elle reste interactive. C'est juste pour un bouton et faux pour des milliers d'entités éphémères et individuellement insignifiantes — particules, commentaires danmaku, nœuds de graphe — où cela produit un nœud DOM par entité, à chaque frame.

Mesuré sur 5 000 entités interactives en mouvement :

|                              | Chrome        | Firefox        |
| ---------------------------- | ------------- | -------------- |
| chaque entité interactive    | 66.4 ms/frame | 114.7 ms/frame |
| `a11yProjection: 'onDemand'` | 2.23 ms       | 1.69 ms        |
| aucun nœud d'ombre du tout   | 1.35 ms       | 1.75 ms        |

Les deux lignes eager n'atteignent même pas un budget de 60 Hz. `'onDemand'` se situe au plancher de « ne rien projeter », tout en gardant chaque entité individuellement atteignable.

`Entity.a11yProjection` choisit le moment où le nœud est matérialisé :

```ts
particle.a11yProjection = 'onDemand';
```

- **`'eager'`** (par défaut) — un nœud existe tant que l'entité est interactive et a une boîte. Comportement inchangé ; laissez-le tel quel pour les contrôles ordinaires.
- **`'onDemand'`** — un nœud n'existe que tant que l'entité est _sollicitée_. À utiliser pour les entités interactives à forte cardinalité.
- **`'never'`** — aucun nœud. Préférez `interactive = false` à moins que l'entité ait réellement besoin d'événements de pointeur sans présence sémantique.

### Ce qui compte comme sollicitation

Trois signaux, dont un seul suffit. Délibérément **pas** le survol seul : un utilisateur au clavier ou de lecteur d'écran ne génère aucun événement de pointeur, donc un nœud conditionné au survol serait refusé précisément aux utilisateurs pour qui il existe.

- **Le focus.** Un nœud qui a le focus n'est jamais élagué, donc le focus ne peut pas être arraché à quelqu'un en pleine interaction.
- **Le pointeur se trouvant à l'intérieur de l'entité.**
- **Une demande explicite** — voir ci-dessous.

L'entité reste testable au clic sur le canvas tout du long, donc un clic l'atteint toujours et la promeut.

```ts
// Keep the selected item projected for as long as it is selected.
scene.requestA11yProjection(selected);
scene.releaseA11yProjection(previous);
```

Les deux acceptent une `Entity` ou une chaîne d'id et sont idempotentes. Relâcher ne supprime pas le nœud immédiatement — il survit tant qu'il a le focus ou se trouve sous le pointeur, et il est élagué à la prochaine synchronisation qui le trouve non sollicité. Les deux sont sans effet pour une entité `'eager'`, qui est toujours projetée.

Utilisez une demande explicite pour tout ce dont seule l'application connaît l'importance : une sélection, un résultat de recherche, un élément qui vient d'être annoncé dans une région live.

> [!IMPORTANT]
> Une entité qui projette son propre **texte sélectionnable** n'est jamais promue par le pointeur. Son nœud d'ombre porte `pointer-events: auto` et s'empile au-dessus du miroir de texte transparent, donc en matérialiser un sous le pointeur avale le `mousedown` et la sélection native par glissement ne démarre jamais. Le focus et les demandes explicites l'atteignent toujours. C'est le même conflit qui rend [`Text`](/reference/ui-text/) et `RichText` non interactifs par défaut.

La cardinalité n'est pas à elle seule le critère pour recourir à `'onDemand'`, et c'est le cas le plus susceptible d'être mal jugé :

> [!WARNING]
> **N'appliquez pas `'onDemand'` au corps de texte par analogie avec les particules.** Pour un bouton ou un nœud de graphe, l'entité canvas est le sujet et le nœud d'ombre est un mandataire sémantique temporaire, donc le retenir jusqu'à sollicitation ne perd rien. Pour de la prose, du Markdown ou une transcription de conversation, le bitmap du canvas n'est pas du tout lisible par un lecteur d'écran, et _lire est l'interaction principale_ pour un utilisateur non voyant plutôt qu'un acte occasionnel. Les entités de texte sont non interactives par défaut et c'est leur [projection de contenu](/reference/core-renderer/#entitygetcontentprojection) — et non un nœud d'ombre — qui porte leur sémantique ; cette projection est virtualisée ligne par ligne et reste résidente.

Être atteignable individuellement n'est pas non plus la même chose qu'être compris :

> [!NOTE]
> `'onDemand'` n'est pas à lui seul une histoire d'accessibilité complète. Mille danmaku individuellement atteignables ne disent toujours rien collectivement. Associez-le à une seule région live agrégée (`role: 'status'`, `a11yFullViewport`) plus un petit pool de points chauds persistants pour la sélection courante, afin que le nombre de nœuds DOM reste constant au lieu de croître avec le nombre d'entités.

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
