+++
title = "03 — Projection sémantique + Virtualisation"
description = "Le cycle de vie du DOM à trois niveaux – visuel, sémantique, interaction – et comment VectoJS matérialise uniquement ce qui est utilisable, Windows ce qui est sélectionnable et maintient le focus itinérant honnête."
weight = 23
+++

# 03 — Projection sémantique + Virtualisation

VectoJS rend **zéro DOM visible**. Tout ce que vous voyez est une toile. Tout ce qu'un lecteur d'écran, un utilisateur de clavier ou un agent Playwright touche est une **fine ombre projetée** dans `Scene.a11yRoot`(un seul div `position:absolute`au-dessus du canevas,`packages/core/src/tree/Scene.ts:2390`). Cette ombre n'est pas un nœud par entité : il s'agit d'un cycle de vie à trois niveaux qui limite le coût à la fenêtre d'affichage tout en gardant le texte hors écran accessible pour la recherche et la lecture anticipée.

## Les trois niveaux – un diagramme

```text
                      ┌─────────────────────────────────────┐
                      │        Virtual Math Tree (VMT)      │
                      │  Entity tree · worldMatrix · bounds │
                      │  packages/core/src/tree/Scene.ts    │
                      │  packages/core/src/tree/Entity.ts   │
                      └──────────────┬──────────────────────┘
                                     │  syncA11y + syncContentProjection
                                     │  (shared depth-first walk, every frame
                                     │   or throttled — see §2)
                 ┌───────────────────┼───────────────────┐
                 ▼                   ▼                   ▼
   ┌─────────────────────┐ ┌───────────────────┐ ┌─────────────────────┐
   │  Visual tier        │ │  Semantic tier    │ │  Interaction tier   │
   │  (always rendered)  │ │  (coarse, resident)│ │  (windowed, fine)  │
   │                     │ │                    │ │                     │
   │  Canvas2D / WebGL / │ │  One DOM node per  │ │  Per-line carriers  │
   │  WebGPU / SVG draws │ │  block holding its │ │  (spans per line /  │
   │  every entity that  │ │  full `text` so    │ │  spans per glyph    │
   │  passes culling.    │ │  find-in-page and  │ │  cluster when grid) │
   │  Subject to         │ │  read-ahead see    │ │  plus a11y mirrors  │
   │  `getRenderChild-   │ │  the whole doc.    │ │  (`button`, `grid-  │
   │  Range` /           │ │  Outside the       │ │  cell`, hotspots).   │
   │  viewportCullChild- │ │  interaction margin│ │  Only near-viewport │
   │  ren. No DOM cost.  │ │  carriers are NOT  │ │  materialized.      │
   └─────────────────────┘ │  built.            │ └─────────────────────┘
                           └───────────────────┘
        Pixels ─────────────►  `getContentProjection().text`  ─────────►  `lines` / `grid`
                              `SceneOptions.contentSemanticMargin`
                                                            `SceneOptions.contentProjectionMargin`
                                                            `SceneOptions.contentSemanticBudget`
```

Pourquoi deux marges ? Un scalaire ne peut pas exprimer "chaque bloc a un DOM mais seuls les blocs proches de la fenêtre d'affichage ont des porteuses" - une valeur finie libère entièrement les blocs hors bande tandis que `Infinity` déroule également chaque porteuse (`O(total glyphs)`). Voir `SceneOptions.contentSemanticMargin`vs `contentProjectionMargin`(`Scene.ts:328`,`336`,`359`) et la justification de l'énumération rejetée dans `vectojs-docs/forge/baselines/content-projection-frontload-findings.md:1`.

| étage                 | où il vit                                           | fermé par                                                                           | défaut                                                    |
| --------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Visuel                | magasins de support en toile                        | `viewportCullChildren`+`getRenderChildRange`(`Entity.ts:788`,`1970`)                | retrait – adhésion par conteneur                          |
| Sémantique (grossier) | un `div`par bloc,`el.textContent = projection.text` | `contentSemanticMargin`— si le bloc a _any_ DOM                                     | `contentProjectionMargin ?? Scene.height`(`Scene.ts:355`) |
| Interaction (bien)    | supports par ligne / par cellule + miroirs a11y     | `contentProjectionMargin`+`projectionLineWindow`(`scene/content-line-window.ts:25`) | une hauteur de fenêtre                                    |

`contentSemanticBudget`(`Scene.ts:359`,`DEFAULT_CONTENT_SEMANTIC_BUDGET = 256`à `Scene.ts:600`) répartit la construction unique du niveau résident sur les frames — seuls les blocs grossiers sont budgétisés ; un bloc à l'intérieur de la bande d'interaction se matérialise immédiatement quel que soit le budget.

## Comment fonctionne la marche `syncA11y` - et quand

`syncA11y`n'est pas "une méthode a11y". Il s'agit du **pilote de marche partagé en profondeur** pour la projection de contenu a11y _et_ (`A11yProjectionManager.ts:30`,`ContentProjectionManager.ts:26`). Les diviser nécessitait `DEC-0020`/`DEC-0022`pour une raison : le point de récursion appelle `syncContentProjection`et `syncA11y`initialise les quatre champs par synchronisation que le côté contenu lit (`_syncSerial`,`contentSemanticBudgetLeft`,`contentSemanticDeferred`,`contentSelectionPresentThisSync`).`DirtyTracker`(`scene/DirtyTracker.ts:33`) détermine si la marche se déroule ou non ;`a11ySyncInterval` le limite davantage sans casser le budget.

Par image (ou limité à `a11ySyncInterval`,`Scene.ts:263`) :

1. **Collecter + chèque sale.** Chaque entité `interactive`avec une case non nulle (ou `a11yFullViewport`,`Entity.ts:912`) appelle `getA11yAttributes()`(`Entity.ts:1898`). La marche lit ensemble `interactive`,`a11yHidden`,`a11yProjection`et `a11yFullViewport`— un ancêtre caché cache tout son sous-arbre quels que soient les indicateurs enfants (voir § Focus). Si `getContentEpoch()`(`Entity.ts:2048`) n'a pas été modifié, les blocs de contenu inchangés ignorent complètement la reconstruction. L'époque est l'équivalent de projection de contenu du drapeau sale VMT - comparaison d'entiers bon marché, pas de différence de chaîne. Entities qui renvoie `null`de `getContentProjection()` ne paie aucun frais de contenu.
2. **Créer/mettre à jour/repositionner.** La marche crée l'élément fantôme (`a`/`button`/`img`/`input`/`textarea`ou `div`,`A11yAttributes.tag`à `Entity.ts:295`), applique chaque champ `A11yAttributes`avec une vérification sale par attribut (le renvoi de `undefined`supprime l'attribut -`false`vs `undefined`est important pour `aria-invalid`), et écrit `top`/`left`/`width`/`height`à partir de la matrice mondiale de l'entité via `CanvasGeometry`(`scene/CanvasGeometry.ts:93`). Le décalage du canevas et la mise à l'échelle CSS non uniforme sont mappés ; La rotation/inclinaison CSS arbitraire du parent du canevas n'est pas prise en charge.`A11yAttributes.level`/`posInSet`/`setSize`/`rowCount`/`rowIndex`sont projetés comme `aria-level`/`posinset`/`setsize`/`rowcount`/`rowindex` - requis pour les listes/grilles virtualisées afin que AT annonce la taille de l'ensemble de données, pas la fenêtre.
3. **Ordre + prune.** `A11yProjectionManager.collect`(`A11yProjectionManager.ts:157`) prend l'ancêtre `a11yRegion`/`clipChildren`le plus proche comme _region_ de l'élément ;`reorder`(`A11yProjectionManager.ts:178`) trie les bandes `normalElements`dans l'ordre de lecture visuelle (`sortNormalElementsVisually`,`A11yProjectionManager.ts:351`) et insère le curseur par parent DOM afin que l'imbrication composite (`grid > row > gridcell`) soit préservée. Les points de terminaison Focus et `Selection`à l'intérieur d'un sous-arbre déplacé sont instantanés une fois — en payant une mise en page forcée par passe de _réorganisation_ plutôt que par élément déplacé (`A11yProjectionManager.ts:230`). Tout ce qui n'est pas collecté lors de ce pass est élagué (`isActive`à `A11yProjectionManager.ts:169`).`a11yNeedsReorder`(`Scene.ts:1381`/`A11yProjectionManager.ts:88`) est l'indicateur qui déclenche le tri.
4. **Côté contenu.** À son point de récursion, la marche appelle `syncContentProjection`pour chaque entité dont `getContentProjection()`n'est pas nulle. Le test de la boîte (`projectionBoxVisible`) décide du grossier ou du libéré ; la bande de lignes (`projectionLineWindow`/`projectionGridLineWindow`,`scene/content-line-window.ts:2`) décide quelles lignes d'un bloc survivant reçoivent des porteuses. Les blocs de grille passent par `ContentGridProjector.syncGrid`(`scene/ContentGridProjector.ts:69`) avec des signatures par ligne afin que les ajouts de streaming réutilisent les supports inchangés ; les blocs sans grille utilisent `el.replaceChildren()`.`ContentProjectionHint`(`Entity.ts:ContentProjectionHint`) permet au Scene d'indiquer à l'entité quelle bande est réellement nécessaire afin que `getContentProjection` puisse éviter de créer des lignes rejetées - consultatif, donc l'ignorer est toujours correct.

### Crochets de cycle de vie

`Entity.onMounted()`se déclenche une fois lorsque l'entité entre dans un Scene en direct (`Entity.ts:add`/`_notifyMounted`). Un pool de points d'accès qui a besoin de savoir quand allouer peut le remplacer ;`remove(child)`appelle `scene.detachA11y(child)`(`Entity.ts:remove`) et marque `a11yNeedsReorder`.`Scene.detachA11y`est idempotent - le deuxième détachement est une opération sans opération - donc le nettoyage du pool `Tabs`/`Table` qui détache les points chauds avant de supprimer la ligne est sûr même si l'entité a déjà disparu.

### Contrôle du budget et des marges

Trois potards, un contrat :

- `contentProjection: false` désactive la couche de contenu _entière_ (scènes décoratives).
- `contentProjectionMargin`(hauteur de fenêtre par défaut,`Scene.ts:328`) — fenêtre d'interaction. Fini = porteurs fenêtrés ;`Infinity`= tout support matérialisé (interdit en production —`O(glyphs)`).
- `contentSemanticMargin`— porte grossière.`Infinity`+ marge d'interaction finie = chaque bloc a `text`pour la recherche/lecture anticipée tandis que seuls les blocs proches de la fenêtre d'affichage paient pour les porteurs. La configuration sûre et recherchée pour un niveau résident. Sans cela, le même `Infinity` déroulerait également les transporteurs.
- `contentSemanticBudget = 256` — combien de blocs grossiers peuvent se matérialiser par synchronisation. Délimite le décrochage des documents ouverts (mesuré ~ 0,03 ms par bloc plus un étage par passage augmentant avec le nombre de résidents). Les blocs visibles ignorent le budget.

Le budget a été dimensionné par mesure dans `DEC-01KZ8DZE`après le correctif du mémo ci-dessous ; voir `forge/baselines/content-projection-frontload-findings.md:Two approaches rejected`.

### Pourquoi pas un DOM par Entity

Le coût est super-linéaire en termes de nombre de nœuds projetés. Mesuré sur du matériel réel (ordinateur portable RTX 4060, entités mobiles, un élément chacune) — `content/learn/accessibility.md:353` :

| entités interactives | Chrome/cadre | Firefox/cadre |
| -------------------- | ------------ | ------------- |
| 1,000                | 6,4 ms       | 7,4 ms        |
| 5,000                | 59,5 ms      | 114 ms        |
| 20,000               | 715 ms       | 2737 ms       |

Le coût par entité _augmente_ avec le nombre (la reconstruction de l'arbre tri + navigateur se dégrade). Une deuxième mesure à 5 000 entités en mouvement (`Entity.ts:933`doc,`benchmarks/lazy-a11y/`) :`eager`= **72,2 ms Chrome / 114,3 ms Firefox** vs `onDemand` = **1,55 / 1,63 ms**, sol sans projection **1,26 / 1,65 ms**. La marche elle-même est d'environ 0,005 µs/entité — le DOM est le coût. Un DOM par Entity à 36 000 entités n'est donc pas une extrapolation linéaire - il est dominé par la reconstruction de l'arbre a11y, c'est pourquoi le même document cite l'effondrement de 36 000 → 1 026 comme la victoire du _système_, pas la victoire de la marche.

### Engagement — modes `a11yProjection`(`Entity.ts:968`)

- `eager`(par défaut) — le miroir dure aussi longtemps que `interactive` + box. Pour les boutons, les liens, les entrées.
- `onDemand`— miroir uniquement lorsque _engagé_ : focalisé, cible du pointeur ou `Scene.requestA11yProjection(id)`(`Scene.ts:1481`). Le survol seul ne s'engage **pas** (les utilisateurs de clavier/AT ne génèrent aucun survol). Une entité `onDemand`sans miroir ne reçoit **aucun événement de pointeur** — le test d'atteinte du canevas (`findEntityAt`) est une API de requête, pas un chemin de répartition (`Entity.ts:953`).
- `never`— jamais de miroir. Préférez `interactive = false` à moins que les hit-tests ne doivent rester.

Pour des milliers d'objets éphémères (particules, danmaku), le modèle est une région active globale (`role: 'status'`,`a11yFullViewport`,`Entity.ts:193`) plus un petit pool de points chauds pour la sélection actuelle — voir `forge/findings/core-a11y-and-input.md:178`(Bakudan `DanmakuAnnouncer`).

## Virtualisation — faire défiler sans payer le document

### ScrollView / Fenêtre

Le scroller primitif (`packages/ui/src/ScrollView.ts:58`) est un conteneur découpé (`clipChildren = true`) dont l'enfant `content`se traduit par `-scrollTop`. Il expose `scrollTo`/`scrollToBottom`/`jumpTo`, pilote un intégrateur à ressort exponentiel dans `update`(`ScrollView.ts:219`) et maintient l'état de défilement visible pour les contrôles inactifs via `hasPendingAnimations()`afin que les scènes `onDemand`ne calent pas au milieu du défilement.`driveVirtualizableContent`(`ScrollView.ts:233`) permet à un enfant `VirtualList` de posséder son propre fenêtrage à l'intérieur du parchemin.

Un `Flow`ou `Stack`à l'intérieur d'un `ScrollView`fait une mise en page normale ; seul le clip + traduction virtualise le _paint_ — le coût du DOM est toujours limité par le fenêtrage de projection de contenu.`Flow`se termine à `maxWidth`;`Stack`est le conteneur d'espace vertical/horizontal (`packages/ui/src/Stack.ts`,`Flow.ts`).`Card`est un groupe décoré (`packages/ui/src/Card.ts:80`,`role: group` lorsqu'il est étiqueté) — non pas virtualisé lui-même, mais un enfant commun d'une fenêtre d'affichage virtualisée.

`getA11yAttributes()`renvoie `{ pointerEvents: 'none' }`(`ScrollView.ts:289`) — la surface de défilement elle-même n'est pas une cible touchée ; les descendants possèdent le pointeur (voir hotspot § ci-dessous).`a11yHidden`sur un `ScrollView`réduit masque son sous-arbre de la projection même pendant l'exécution de l'animation du clip (`Entity.ts:a11yHidden`, vérifié sur `Overlay`après `hide()`).

### VirtualList — fenêtrage des lignes (`packages/ui/src/VirtualList.ts:179`)

Seules les lignes de `[visibleTop - overscan, visibleBottom + overscan]` sont montées (`_visibleRange` à `VirtualList.ts:468`,`overscan = 3`par défaut,`VirtualListOptions:102`). Le reste n’existe pas en tant qu’entités – pas de dessin sur toile, pas de miroir, pas de projection de contenu. Le nombre de montages reste `O(viewport)` quelle que soit la taille de l'ensemble de données.

Les mathématiques de défilement sont `O(log n)`via un arbre Fenwick (`RowHeights`,`VirtualList.ts:14`) répondant à `total()`,`prefix(i)`(= y de la ligne `i`) et `indexAt(y)`(= ligne contenant le décalage `y`). Les hauteurs commencent à `estimatedRowHeight`et sont re-mesurées par ligne montée et chaque image (`_measureMountedRows`,`VirtualList.ts:540`) - une lecture de champ simple, aucun indicateur sale n'est nécessaire et aucun `markDirty`sur le chemin sans changement afin que l'accélérateur au ralenti ne soit pas vaincu.`_reconcile`(`VirtualList.ts:488`) recycle les entités hors de portée avant d'en monter de nouvelles.

Les listes à clé (`keyForItem`,`VirtualList.ts:117`) conservent les hauteurs mesurées sur `setItems`, ancrent le défilement par identité d'élément (et non par index) et suivent le bas lorsque `distanceToBottom ≤ 48 px`(`VirtualList.ts:517`). Sans `keyForItem`,`setItems` efface le cache de hauteur et passe en haut – correct pour une liste remplacée, faux pour une transcription croissante.

A11y : le nombre du conteneur appartient à son **nom**, et non à `aria-setsize`(interdit sur `role="list"`), par `getA11yAttributes`à `VirtualList.ts:660`et au document de classe à `VirtualList.ts:170`. Chaque _row_ doit renvoyer `posInSet`/`setSize`(`Entity.ts:A11yAttributes.posInSet`/`setSize`) ou un lecteur d'écran annonce la taille de la fenêtre montée au lieu de celle de l'ensemble de données.`VirtualList`regroupe ses points chauds de ligne de la même manière que `Table` : un pool par ligne visible.

### Carrelage de grille de contenu - grossier ou fin (§ diagrammes ci-dessus)

Deux chemins partagent un contrat de fenêtrage (`scene/content-line-window.ts`) :

- **Sans grille** (paragraphes, `Text`/`RichText`) :`projectionLineWindow`(`content-line-window.ts:44`) sur `ContentProjection.lines`. Les blocs grossiers contiennent un nœud de texte (`el.textContent = projection.text`) ; des blocs fins remplacent les supports par fenêtre. Chaque `ContentProjectionLine`contient `text`,`separatorAfter`(consommation soft-wrap vs hard break),`x`/`y`/`baseline`,`runs`en option avec `x`/`width`pour le texte justifié et `perGraphemeCarriers`/`shapedPaint` pour l'ajustement de la grille CJK.
- **Grille** (blocs de code, `Markdown`CodeBlock via `PreparedContentGrid`dans `@vectojs/text`) :`projectionGridLineWindow`(`content-line-window.ts:114`) sur `PreparedContentGrid`.`ContentGridProjector.syncGrid`crée une étendue par cluster de glyphes avec un calibrage `scaleX`par cellule (`ContentProjectionManager.scheduleGridCalibration`, lot de lecture/écriture à froid en dehors de la synchronisation) et réutilise les lignes par signature (`ContentGridProjector.ts:199`) afin que les ajouts en continu évitent les reconstructions `O(cells)`.`ligatures: 'none'`sur le texte de la grille empêche la contraction `ffi` de Firefox de dériver des boîtes de sélection.

La fenêtre est la **partie contiguë chevauchant la bande de la fenêtre étendue** — un espace séparerait le texte de l'ordre DOM et romprait l'ordre de copie de la sélection. Lorsque rien ne se chevauche, la ligne la plus proche est conservée afin que le texte reste accessible (`content-line-window.ts:79`). La promotion (coarse → fine) supprime explicitement le nœud de texte grossier : la grille ne peut pas utiliser `replaceChildren()`ou la réutilisation du streaming est perdue (`ContentGridProjector.ts:111`). La rétrogradation libère le DOM ; la porte sémantique conserve le texte trouvable sans porteurs.

La préservation de la sélection prend en compte les niveaux : `ContentProjectionManager`(`scene/ContentProjectionManager.ts:1`) capture les points de terminaison sous forme de _décalages linéaires_ pour les mises en page hors grille et de _décalages source_ pour la grille, mémorise `selectionPresent`par parcours (une mise en page forcée par parcours, et non par élément - le correctif mémorisé a entraîné une perte de 1 000 blocs des mises en page 2002 à 19,`forge/baselines/content-projection-frontload-findings.md:153`) et n'est restauré que lorsque la ligne affectée a été réellement reconstruite. - les transporteurs réutilisés conservent les nœuds `Selection`actifs.`clipToBounds` sur un bloc de code défilant empêche une sélection de surligner au-delà de la zone d'entité.

### carrelage Markdown + Table

- **Markdown** (`packages/markdown/src/Markdown.ts:681`) — deux axes indépendants :`virtualize`(`MarkdownOptions:625`) les fenêtres _blocks_ de niveau supérieur en tant qu'entités (opt-in, incompatible avec le streaming, pilotées par `setVisibleRange`à partir d'un hôte `ScrollView`avec `RowHeights`à `Markdown.ts:774`), tandis que `tableViewportHeight`(`MarkdownOptions:652`) corrige la fenêtre d'affichage du corps de chaque `Table`afin que ses lignes se virtualisent à mi-parcours via `Table.appendRows`. Un `Stack`avec `cullOffscreenChildren`est l'hébergeur de contenu dans les deux cas.`Markdown`possède `getContentProjection` par bloc ; l'hôte possède le parchemin. Le streaming Markdown réutilise les entités de bloc inchangées par préfixe - seule la queue est reconstruite (boss 04).
- **Table** (`packages/table/src/Table.ts:144`) —`viewportHeight > 0`épingle l'en-tête, crée un défilement tronqué `bodyClip`(`Table.ts:183`), construit paresseusement des cellules de chaîne à l'entrée de la fenêtre (`ensureBodyCells`à `Table.ts:853`/`reconcileVirtualRows`à `Table.ts:392`) et ne conserve que `first..last`lignes montées (`overscan = 2`). Le mode classique s'agrandit pour s'adapter à toutes les rangées avec des hauteurs mesurées variables. Body a11y est un `RowHotspot`(`role: row`) +`GridCellHotspot`(`role: gridcell`/`columnheader`) regroupé par ligne visible -`O(viewport)`, et non `O(rows)`(`Table.ts:199`,`622`).`getContentProjection`renvoie `null`sur `Table`lui-même — les cellules sont propriétaires de leur texte. Les sommes de préfixes `rowTops`(`Table.ts:751`) font `_syncGridA11y` O(1) par emplacement au lieu de O(rows²).

### Stack / Flow / Card dans une fenêtre

`Stack`(`packages/ui/src/Stack.ts`) et `Flow`(`packages/ui/src/Flow.ts`) sont des conteneurs de mise en page non virtualisés : ils positionnent les enfants et signalent `width`/`height`, mais ne coupent ni ne fenêtrent. À l'intérieur d'un `ScrollView` ou d'un parent virtualisant, c'est le _contenu_ qui est traduit ou éliminé :

- `Stack`avec `direction: 'vertical'`+`gap`est l'hôte Markdown `content`(`Markdown.ts:1088`) et l'enfant ScrollView typique. Avec `cullOffscreenChildren = true`, il ignore également `getContentProjection` pour les enfants hors écran - une deuxième porte bon marché avant le fenêtrage de niveau Scene.
- `Flow`encapsule les enfants en ligne à `maxWidth` et est le cheval de bataille des paragraphes de texte ; comme Stack, il s'appuie sur son ancêtre de défilement pour le déclenchement de la fenêtre d'affichage.
- `Card`(`packages/ui/src/Card.ts:80`) est un conteneur `role: group`décoré avec remplissage/bordure/ombre — jamais virtualisé lui-même, mais un enfant fréquent de lignes `VirtualList`ou de blocs `Markdown`. Son rôle principal est `group` uniquement lorsqu'il est étiqueté.

Aucun d'entre eux ne possède `getRenderChildRange`par défaut - ils peignent tous les enfants et laissent le coût lié au clip + fenêtrage de projection de l'ancêtre. Seuls `Markdown`/`Table`/`VirtualList` implémentent la virtualisation au niveau des lignes/blocs.

### Sélection de fenêtres – niveau visuel (`Entity.ts:788`)

Indépendant de la projection DOM :

```ts
entity.viewportCullChildren = true;
entity.getRenderChildRange(localViewport: Bounds): RenderChildRange | null {
  // return { start, end } of children intersecting the viewport, or null for none
}
```

`Stack`/`Flow`laissez cette option désactivée par défaut (bon marché pour un nombre d'enfants modeste). Activez-le pour un conteneur avec des milliers d'enfants visuels où l'élimination du dessin _canvas_ lui-même est importante - le fenêtrage de projection n'aide pas le niveau visuel, et la promenade dans l'arbre sans l'élimination est `O(total entities)`par image synchronisée (`forge/baselines/content-projection-frontload-findings.md:Not addressed`,`vectojs#350`).

### Cycle de vie des promotions/rétrogradations

```text
  off-screen                          near viewport                    on-screen
 ──────────── ──contentSemanticMargin── ──contentProjectionMargin── ────────────
  (released)          (coarse)                     (fine)
  no DOM              el.textContent = text        per-line / per-cell carriers
  not findable        findable, no per-line        findable + selectable +
                      selection geometry            copy + per-line highlight

  demotion ◄──────────────┘                          └──────────────► promotion
  `syncContentProjection` frees carriers;            `syncGrid` strips coarse text node,
  coarse text stays if inside semantic gate;         materializes windowed carriers;
  outside both gates the element is removed.         outside semantic gate but inside
                                                     interaction gate: direct to fine.
```

Le budget s'applique uniquement à la promotion grossière → fine hors bande ; faire défiler un bloc déjà grossier dans la bande d'interaction ignore le budget.

## Modèle de point d'accès – sémantique zéro-DOM qui clavier toujours

Les widgets composites (`role="grid"`,`tree`,`menu`,`radiogroup`,`tablist`) doivent exposer **un rôle par enfant**, pas seulement un rôle de conteneur, et doivent conserver **un taquet de tabulation** dans un ordre séquentiel — une arborescence de mille tabulations est inutilisable. VectoJS regroupe un enfant transparent et focalisable `UIComponent`sur chaque enfant visible (`vectojs/AGENTS.md:Zero-DOM a11y hotspot pattern`) :

```ts
class GridCellHotspot extends UIComponent {
  constructor(private table: Table) {
    super();
    this.interactive = true; // so syncA11y projects it at all
    this.on('keydown', (e) => this.table.handleGridKey(e, this.rowIndex, this.colIndex));
  }
  getA11yAttributes(): A11yAttributes {
    return {
      role: this.rowIndex < 0 ? 'columnheader' : 'gridcell',
      label: this.label, // WCAG 4.1.2 — every control needs a name
      tabIndex: this.table.isGridTabStop(this.rowIndex, this.colIndex) ? 0 : -1,
      pointerEvents: 'none', // lets selectable cell text own the pointer
    };
  }
  render(): void {} // Table paints the cell on canvas
}
```

| Composant           | Rôle de point d'accès                          | Propriétaire de la halte itinérante              | Clés                                                                                         |
| ------------------- | ---------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `Table`             | `gridcell`/`columnheader`dans `row`            | `isGridTabStop(row, col)`(`Table.ts:473`)        | Flèches 2D, ligne Début/Fin, Ctrl+Début/Fin grille, fenêtre Page précédente/Down             |
| Ligne `VirtualList` | fourni par l'appelant (par exemple `listitem`) | propre à la ligne `isTabStop`                    | Haut/Bas                                                                                     |
| `TreeView`          | `treeitem`(`aria-level`,`expanded`,`selected`) | `isTabStop(nodeId)`(`Tree.ts:389`)               | Haut/Bas, Développer à droite → Entrée, Réduire à gauche → parent, Début/Fin                 |
| `ContextMenu`       | `menuitem`(`haspopup`,`expanded`)              | `isMenuTabStop(idx)`(`ContextMenu.ts:270`)       | Enroulement haut/bas, début/fin, ouverture à droite, arrière gauche, fermeture d'échappement |
| `RadioGroup`        | `radio`(`aria-checked`)                        | `isTabStop(value)`(`RadioGroup.ts`/`Tabs.ts:42`) | Flèches + Début/Fin                                                                          |
| `Tabs`              | `tab`(`aria-selected`)                         | onglet sélectionné                               | Flèches + Début/Fin                                                                          |

Précédent : `RadioGroup`/`Tabs`(#160),`Tree`/`Table`/`ContextMenu`(#191) ; références en direct sur `Table.ts:56`,`82`,`Table.ts:624`(`_syncGridA11y`),`VirtualList.ts:170`,`ScrollView.ts:289`,`ContextMenu.ts:292`,`RadioGroup.ts:32`,`Tree.ts:98`. Seuls les enfants visibles sont regroupés, donc un `Table`virtualisé projette des hotspots `O(viewport)`.

### La justification `pointerEvents: 'none'`

L'entrée du canevas est acheminée **uniquement via des miroirs projetés** — `Scene`lie `pointerdown`/`pointerup`/`click`/`wheel`par miroir (`Scene.ts:3512`) et `pointermove`/`pointerleave`sur le canevas uniquement pour le suivi du survol. Ainsi,`pointerEvents: 'none'`sur un point d'accès ne se contente pas de le "supprimer des tests d'impact" : il supprime entièrement le chemin d'entrée de la souris, tandis que le focus clavier et `click`synthétisé par AT acheminent toujours (`forge/findings/core-a11y-and-input.md:336`). Utilisez-le lorsque quelque chose _underneath_ possède le pointeur :

- texte de cellule sélectionnable (`Table.ts:116`),
- glisser pour faire défiler les surfaces (`ScrollView.ts:289`),
- manipulation des coups de toile à l'intérieur d'un emballage.

Ne **pas** l'utiliser sur l'élément qui possède le gestionnaire - une sous-classe `ScrollView`qui définit `pointerEvents: 'none'`sur ses propres attributs a réduit au silence son défilement `wheel`/`pointerdown`sans erreur (`forge/findings/core-a11y-and-input.md:336`).

### Focus, tabindex itinérant et ordre de lecture

- **Roving tabindex** : exactement un point chaud par composite a `tabIndex: 0` ; le parent déplace l'arrêt sur les touches fléchées et le concentre (`Table.handleGridKey`à `Table.ts:490`,`findHotspot`/`_focusCell` à `Table.ts:560`,`VirtualList`/`Tree`/`ContextMenu`équivalents). Lorsque la virtualisation démonte la ligne ciblée,`Table`réancre l'arrêt sur une ligne visible _avant_ de relier `tabIndex`(`Table.ts:667`) et restaure le focus DOM uniquement si l'ancienne cellule la détenait réellement (`activeCellHoldsFocus`à `Table.ts:592`), donc le défilement ailleurs ne vole jamais le focus. Le piège de mise au point sentinelle `a11yRoot`maintient la mise au point à l'intérieur de la scène (`Scene.ts:1482`).
- **Lecture/ordre de tabulation** : les miroirs sont triés par bandes en haut → en bas puis en ligne, stables, par _région_ — l'ancêtre `a11yRegion`ou `clipChildren`le plus proche (`A11yProjectionManager.ts:351`). Sans régions, un glissement vertical dans une transcription avale une barre latérale dont les titres partagent les mêmes bandes de lignes (`A11yProjectionManager.ts:339`). Définissez `a11yRegion = true`(`Entity.ts:a11yRegion`) sur une colonne sans découpage pour garder son glissement/contiguïté séparé. RTL est `Scene.readingDirection`(`Scene.ts:392`). Le calque `a11yRoot`est `z-index: 10`au-dessus du canevas (`Scene.ts:2403`) avec `pointerEvents: none`par défaut, basculé en `auto` uniquement lors d'un glissement afin que la sélection puisse commencer dans des régions vides.
- **Masquer un sous-arbre** : `a11yHidden = true`(`Entity.ts:a11yHidden`) masque tout le sous-arbre de la projection —`interactive = false`sur un conteneur seul laisse les enfants toujours interactifs projetés (vérifié sur `Popover.hide`,`forge/findings/core-a11y-and-input.md:622`). Non déduit de `opacity` — l'opacité entraînée par un ressort oscille près de zéro sans jamais l'atteindre.

## Choisir une configuration

| document                      | marge sémantique                 | marge d'interaction    | budget  | note                                                                                                                        |
| ----------------------------- | -------------------------------- | ---------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| Toile décorative              | `contentProjection: false`       | —                      | —       | aucun coût DOM du tout                                                                                                      |
| Document court (< 300 blocs)  | défaut                           | défaut                 | 256     | la valeur par défaut est déjà optimale                                                                                      |
| Document long à défiler       | `Infinity`                       | par défaut (1 fenêtre) | 256     | niveau de résident recommandé - recherche + lecture anticipée sur l'ensemble du document, les transporteurs restent limités |
| Transcription de 10 000 blocs | `Infinity`                       | `2 * viewport`         | 256–512 | une marge d'interaction plus large réduit le taux de désabonnement des promotions lors du défilement                        |
| Champ de particules/danmaku   | — (pas de projection de contenu) | —                      | —       | `a11yProjection: 'onDemand'`ou région active `role: status` agrégée                                                         |

`content-visibility: auto`et le texte survolé ont tous deux été mesurés et rejetés – voir `forge/baselines/content-projection-frontload-findings.md:Two approaches rejected`. Le premier n'achète rien en plus de `display:none` pour les projections hors écran ; ce dernier supprime spécifiquement le texte destiné aux utilisateurs de clavier/AT.

## Gotchas - les bugs déjà expédiés

1. **Duplication grossière → fine** (`forge/findings/core-a11y-and-input.md:2026-08-08`) — un bloc de grille promu à partir de grossier a laissé son nœud de texte `textContent`derrière lui tandis que les porteurs ont été ajoutés via des opérations `children`uniquement, doublant `textContent`(758 contre 379 caractères mesurés). Corrigé en supprimant les nœuds de texte avant la boucle porteuse (`ContentGridProjector.ts:111`).
2. **Sélection après le début de la fenêtre** (`forge/findings/core-a11y-and-input.md:2026-08-08`,`ContentGridSelectionWindow.test.ts`) — le défilement au-delà du _start_ de la fenêtre a reconstruit le support sans libérer le `Selection`, le laissant sur un nœud détaché. Nécessaire `selectionLine < start || >= end` hissé au-dessus de la boucle de matérialisation.
3. **`pointerEvents: none`tue la souris** (`forge/findings/core-a11y-and-input.md:2026-08-02`) — voir hotspot § ; aucun avertissement, aucune erreur, juste une surface de défilement morte.
4. **Décalage de reprojection de superposition** — L'interaction `DirtyTracker`+`a11ySyncInterval`avec `showOverlay`a été suspectée, puis rétractée en tant qu'artefact du navigateur en arrière-plan (rétraction `forge/findings/core-a11y-and-input.md:2026-08-16`, original `2026-08-15`). La leçon : vérifiez `document.hasFocus()` et un compteur rAF sur la page avant d'attribuer un délai de comptage d'images au Scene.
5. **Collision à identifiant fixe** (`forge/findings/core-a11y-and-input.md:2026-07-16`,`vectojs#117`) — onze composants `ui`autrefois appelés `super('ClassName')`, partageant une entrée de carte `a11yElements`; deux `PanelGroup`s ont acheminé les événements de pointeur vers le mauvais diviseur. Corrigé par `super()` → identifiant aléatoire.
6. **`a11yHidden`vs `interactive`** (`forge/findings/core-a11y-and-input.md:622`) — la définition de `interactive = false`sur un conteneur ne masque pas ses enfants toujours interactifs ;`a11yHidden` le fait.

## Automatisation - la projection est également le transport d'entrée

Un dramaturge `getByRole('button', { name })`ne touche pas la toile. Il atteint le miroir fantôme dans `a11yRoot`et les auditeurs par miroir de `Scene`(`Scene.ts:3512`) sont redéployés en tant que `VectoJSEvent`(`Entity.ts:VectoJSEvent`) avec la sémantique `bubbles`et `stopPropagation`. C'est pourquoi le même `A11yAttributes.label`annoncé par un AT est également le sélecteur qu'un agent utilise - aucun adaptateur, aucun `data-testid`nécessaire.`debugA11y`plus `getA11yTree()`sont la surface d'assertion de l'agent ;`data-vecto-id` est le localisateur stable lorsque l'étiquette est dynamique.

Conséquence : une entité inactive `onDemand`ou un sous-arbre `a11yHidden`n'a pas de miroir et donc **pas de chemin de répartition du pointeur** —`scene.findEntityAt(x,y)`renvoie toujours l'entité (API de requête), mais `entity.on('click')`ne se déclenche jamais. Une surface gestuelle globale qui doit rester réactive au pointeur pendant que AT-invisible utilise `a11yFullViewport = true`+`a11yProjection: 'eager'`+`getA11yAttributes() => ({ tabIndex: -1 })` et aucun rôle - le miroir peut être focalisé pour le routage du pointeur mais n'a pas de nom AT.

`a11yFullViewport`lui-même (`Entity.ts:912`) monte un miroir `100vw × 100vh`derrière tous les autres miroirs (`A11yProjectionManager.ts:fullViewportElements`reste dans l'ordre d'insertion) afin qu'une surface d'interaction recouvrant une toile n'occulte jamais les commandes supérieures. Le modèle est utilisé par `DanmakuAnnouncer`, le capteur de clics de bureau Webos et tout gestionnaire de panoramique de toile infinie.

## Ce que `getA11yAttributes` peut projeter : la surface

`A11yAttributes`(`Entity.ts:295`) est la seule API a11y dont une entité personnalisée a besoin. Chaque champ est modifié par attribut et par image —`undefined`supprime,`false`écrit `aria-invalid="false"` (explicitement valide), donc la distinction est importante :

- **Identité** : `tag`(`div`/`a`/`button`/`img`/`input`/`textarea`),`role`,`label`/`labelledby`/`describedby`.
- **Focus/pointeur** : `tabIndex`(voir itinérant §),`pointerEvents`(`auto`/`none`).
- **Accessoires natifs** (uniquement pour la correspondance `tag`) :`href`/`target`,`src`/`alt`,`inputType`/`placeholder`/`value`/`checked`/`textInputStyle`.
- **État** : `disabled`,`checked`,`selected`,`expanded`,`required`,`invalid`,`level`,`valuemin`/`valuemax`,`ariaModal`,`controls`/`haspopup`/`activedescendant`.
- **Ensemble/grille virtualisé** : `posInSet`/`setSize`(liste),`rowCount`/`rowIndex`/`valueText`/`orientation` (grille) — sans ceux-ci, une liste virtualisée de 10 000 lignes annonce « l'élément 3 sur 12 » (la fenêtre, pas l'ensemble de données).
- **En direct** : `live`(`off`/`polite`/`assertive`) +`atomic`/`relevant` — le chemin de l'annonceur en streaming (boss 04).

`getA11yAttributes()`par défaut (`Entity.ts:1937`) renvoie `{}`→ un simple `div` sans rôle, ce qui est correct pour un bloc de texte non interactif qui nécessite toujours une projection de contenu.

## Chiffres de performance à citer (et où ils ont été mesurés)

Seuls les nombres `benchmarks/run-browsers.sh`sur une fenêtre ciblée et sauvegardée par GPU peuvent être cités (voir la règle de référence globale `AGENTS.md`). Tous les chiffres ci-dessous proviennent de ce harnais, sauf indication contraire. Utilisez `calibrateRefreshRate()`— ne codez jamais en dur 60/240 Hz (Firefox par défaut est 60 Hz sans `layout.frame_rate`). Vérifiez `validation.ok`,`crossOriginIsolated`et `refreshHz` dans l'enveloppe JSON - une fenêtre non ciblée signale 0 ticks/s et chaque réclamation ms est nulle.

**Coût de projection par rapport au nombre interactif** — `content/learn/accessibility.md:353`,`Entity.ts:933` :

| condition                    | Chrome         | Firefox      | source                                                                                          |
| ---------------------------- | -------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| 1 000 mobiles interactifs    | 6,4 ms/image   | 7,4 ms/image | apprentissage/accessibilité §Coût + `lazy-a11y` étage                                           |
| 5 000 impatients             | 59,5 à 72,2 ms | 114 ms       | apprendre la table + `benchmarks/lazy-a11y/`(`Entity.ts:933` doc)                               |
| 5 000 `onDemand`(même scène) | 1,55 ms        | 1,63 ms      | `benchmarks/lazy-a11y/` étage 1,26/1,65 ms                                                      |
| 20 000 impatients            | 715 ms         | 2737 ms      | table d'apprentissage/accessibilité (super-linéaire : 6,4→35,7 µs/Chrome, 7,4→136,9 µs/Firefox) |

**La virtualisation gagne** — `forge/findings/core-a11y-and-input.md:240` (Galerie 346 Ko Markdown, 172-238 Hz, vrai GPU) :

| métrique                  | avant (pas de porte de fenêtre)    | après                      |
| ------------------------- | ---------------------------------- | -------------------------- |
| Éléments DOM              | 14,843                             | 254                        |
| nœuds de contenu projetés | ~1,250                             | 29 (recycle sur parchemin) |
| nœuds de texte            | 9,369                              | 160                        |
| faire défiler p95         | ~50 ms                             | 4,3 ms                     |
| cadre de défilement       | 55 ips / 18 ms                     | 238 ips / 4,2 ms           |
| tas                       | 125 → 224 Mo pendant le défilement | ~100 Mo                    |

**Coût du niveau sémantique grossier** — `forge/baselines/content-projection-frontload-findings.md: Finding 3`(Chrome 151 à 240 Hz, Firefox 153 à 240 Hz,`runId 20260804T155826Z-5cdf96`) :

| blocs  | lignes | `firstSyncMs` (hybride ou natif)                                  |
| ------ | ------ | ----------------------------------------------------------------- |
| 100    | 300    | 10,3 ms (1,6×) / 5,0 ms (1,1×)                                    |
| 1,000  | 3,000  | 20,6 ms (4,5×) / 16,0 ms (5,3×) — ~une image perdue à l'ouverture |
| 10,000 | 30,000 | 146,6 ms (19,9 ×) / 144,8 ms (21,4 ×)                             |

Le coût par modification reste bon marché (`editOffBand`1,09/3,06 ms à 10 k,`Finding 4`). Drain budgétisé final après le correctif du mémo `Selection`(exécutez `20260805T080824Z-e79819`,`forge/baselines/content-projection-frontload-findings.md:Two approaches rejected`) : Chrome 21,29 → 10,66 ms à 1k et 139,5 → 12,0 ms à 10k ; Firefox 21,86 → 5,88 ms et 141,6 → 9,2 ms. Par bloc ~ 0,03 ms — le chiffre précédent de ~ 13 µs/nœud était nul (mesuré avec les nœuds résidents `display:none` qui ne sont jamais entrés dans la mise en page).

## Liste de contrôle de débogage

1. **`scene.getA11yTree()`en premier.** Chaque point d'accès et nœud de contenu est là avec `role`/`label`/`tabIndex`— si `getByRole`ne trouve rien,`interactive`ou `width`/`height`vaut zéro, pas le sélecteur (`Scene.ts:2390`guard,`content/learn/accessibility.md:Troubleshooting`).`a11yRoot` lui-même est exclu de l'arborescence.
2. **`debugA11y: true`** (`SceneOptions:debugA11y`,`Scene.ts:204`) — contours en pointillés bleus sur `a11yRoot`; vérification de position la plus rapide. Sinon, les miroirs sont `opacity: 0`(le calque `Scene.ts:2401`est `z-index: 10`,`pointerEvents: none`jusqu'à ce qu'il soit déplacé). Basculer au moment de l'exécution via `scene.debugA11y = true`.
3. **Inspection DOM** — chaque miroir porte `data-vecto-id = entity.id`plus `role`/`aria-*`; vérifiez la présence de `aria-label`(le rôle sans nom est annoncé comme un simple "bouton"/"curseur",`content/learn/accessibility.md:Screen reader testing checklist`). Les supports de contenu transportent les ensembles de données `data-vecto-grid-*`et `data-vecto-projection-*`. Utilisez `document.querySelectorAll('[data-vecto-id]')` pour compter les miroirs en direct par rapport aux attentes.
4. **`scene.getA11yElement(entity.id)`** — le `HTMLElement`en direct pour les contrôles de mise au point ; Le modèle `activeCellHoldsFocus`(`Table.ts:592`) montre comment le tester.`null`signifie que cette image n'a pas été projetée (hors fenêtre,`a11yHidden`ou `onDemand`inactif). Comparez `scene.a11yElements.size`avant/après `showOverlay` pour détecter les régressions de projection par superposition.
5. **`a11yProjection`contrôle de porte** —`onDemand`sans engagement n'a pas de miroir et donc pas d'événements de pointeur. Vérifiez `Scene.requestA11yProjection`ou l'état du focus avant de blâmer l'envoi. N'oubliez pas que `findEntityAt`fonctionne toujours - il n'est pas bloqué - donc un gestionnaire `pointerdown`au niveau du canevas se déclencherait alors que le propre `on('click')` de l'entité ne le ferait pas.
6. **`pointerEvents`audit** —`grep -rn "pointerEvents.*none" packages --include="*.ts"`et confirmation de la propriété du gestionnaire. Un échec de défilement/sélection silencieux est plus fréquent qu'un bug de clip.`ScrollView`sur `ScrollView.ts:289` est la paire canonique wrapper-ne possède aucun, l'enfant possède-auto.
7. **Ordre de lecture** — videz `getA11yTree()`et vérifiez que l'ordre des bandes correspond aux lignes visuelles. Un `a11yRegion`égaré apparaît comme un ordre de région majeure là où la bande majeure était attendue (regroupement de régions `A11yProjectionManager.ts:351`).
8. **Sélection / calibrage de la grille** — `ContentProjectionManager.scheduleGridCalibration`écrit par cellule `scaleX`; vérifiez la génération `data-vecto-grid-calib`. Une génération obsolète après le chargement d'une police signifie que `contentFontEpoch`n'a pas été modifié.`content-visibility: auto`a été mesuré et rejeté (`forge/baselines/content-projection-frontload-findings.md:Two approaches rejected`) ;`contain: layout`sur `a11yRoot`est intentionnel (`Scene.ts:2402`).
9. **Triage des performances** – phases `PhaseTimer` `calibScan`/`calibProbeBuild`/`gridMaterialize`(`scene/PhaseTimer.ts`), ensemble de données `ContentGridProjector` `vectoGridMaterializeMs`,`scene.frameStats`(`Scene.ts:518`) et DevTools `getDevtoolsDescriptor()`sur `ScrollView`/`VirtualList`/`Table`. Pour les nombres citables, seul `benchmarks/run-browsers.sh`sur une fenêtre ciblée compte - Hyprland en arrière-plan donne `0 ticks/s`et chaque réclamation par image est nulle (rétraction `forge/findings/core-a11y-and-input.md:2026-08-16`).

## Comment vérifier que la virtualisation fonctionne réellement

Trois contrôles, dans l'ordre :

1. **Comptez le DOM.** `document.querySelectorAll('[data-vecto-id]').length`vs `scene.a11yElements.size`par rapport à la taille de l'ensemble de données. Un Table virtualisé de 10 000 lignes devrait afficher ~`viewport/rowHeight + 2*overscan`miroirs, et non 10 000. Si le numéro suit l'ensemble de données, la virtualisation est désactivée (`viewportHeight`non défini, ou `a11yProjection: 'eager'` sur chaque entité de ligne au lieu du pool fenêtré).
2. **Faites défiler et recomptez.** L'ensemble doit recycler — même nombre, différents `data-vecto-id`à mesure que la fenêtre se déplace. Un nombre croissant signifie des fuites de miroirs (`detachA11y`non appelé lors du démontage, ou un pool qui s'agrandit sans rétrécir - vérifiez la boucle de réduction `Table.ts:701`et la branche de recyclage `VirtualList.ts:_reconcile`).
3. **Enveloppe Perf.** `scene.frameStats`(`Scene.ts:518`) +`benchmarks/run-browsers.sh --validation`sur une fenêtre ciblée. Si le défilement p95 reste> 10 ms après la virtualisation, le coût n'est plus le nombre de DOM - vérifiez l'étalonnage de la grille `PhaseTimer`ou le parcours `syncA11y`lui-même (`O(total entities)`sans `viewportCullChildren`,`vectojs#350`).

## Où se situe ce patron dans le doc graph

- **Prérequis** : Boss 06 (runtime VMT — dirty/lifecycle/events, `DirtyTracker`,`DriverTicker`,`Scene` boucle). Ce patron réutilise les machines sales/du cycle de vie de 06 et suppose que vous connaissez l'étape VMT.
- **S'associe avec** : Boss 01 (Sélection — l'autre consommateur de projection de contenu), `content/learn/accessibility.md`(mode d'emploi),`content/reference/core-a11y.md`(vérité de l'API),`content/reference/core-entity.md`(surface `A11yAttributes`, crochets `getA11yAttributes`/`getContentProjection`/`getContentEpoch`).
- **Mène à** : Boss 04 (Streaming Markdown — `Markdown`poignée de main de virtualisation + réconciliation incrémentielle qui réutilise le fenêtrage de ce boss), Boss 07 (Renderer — cohérence clip/DPR pour le niveau visuel), Boss 12 (DevTools — surfaces `getDevtoolsDescriptor` pour l'état de virtualisation).

Pas de `cp -r`entre `vectojs-docs/content`et `vectojs-website/src/content`— dérive de formatage + 408 fichiers i18n (`AGENTS.md`). Modifiez d'abord le côté faisant autorité (`vectojs-docs/content`), prévisualisez avec `scripts/sync-content.py`, puis poussez les deux dépôts.

## Invariants (la liste de contrôle de validation pour ce patron)

1. **Dirty + géométrie d'accord.** `getContentEpoch()`se heurte chaque fois que la sortie `getContentProjection()`serait différente ;`Scene`ignore les blocs inchangés à partir de la deuxième synchronisation. Rompre cela rapporte `O(total blocks)`par image au lieu de `O(changed)`. Pas de raccourci `content-visibility`— il a été mesuré et rejeté. Les entités inactives `onDemand` ne sont pas sales par définition.
2. **Parité double monde pour chaque interaction visible.** La géométrie du monde, le rôle/nom/état et le routage focus/pointeur correspondent à la vérité du canevas – renforcés par la marche partagée `syncA11y`et le tri visuel par région de `enforceA11yDomOrder`. Un feuillet `interactive = false`vs `a11yHidden`projette un contrôle caché dans l'ordre de tabulation. Chaque interactif porte `aria-label`à moins que son nom accessible ne provienne de `aria-labelledby`/ texte contenu. Les miroirs `a11yFullViewport` sont toujours derrière les miroirs normaux.
3. **Fenêtrage contigu.** Les fenêtres de grille de lignes sont une seule exécution contiguë par bloc (`scene/content-line-window.ts:Contiguous on purpose`) — un espace séparerait le texte hors de l'ordre de sélection/copie.`clipChildren`/`a11yRegion` sont les seuls sauts de région. La séparation entre les marges sémantiques et d'interaction concerne l'ensemble de l'API : ne les réduisez pas.
4. **Le propriétaire du pointeur est explicite.** Chaque paire de points d'accès déclare à qui appartient le pointeur ; les tests qui pilotent directement les entités n'attraperont pas un `pointerEvents: 'none'`qui a réduit au silence un chemin de souris (`forge/findings/core-a11y-and-input.md:336`).`onDemand`sans engagement est un pointeur mort de par sa conception - utilisez `a11yFullViewport`+`eager`+`tabIndex: -1` pour une surface de pointeur AT-invisible.
5. **L'ordre de lecture est visuel, pas d'insertion.** `A11yProjectionManager.sortNormalElementsVisually`+ le regroupement de régions est l'ordre tabulation/AT ; insérer des enfants dans n'importe quel ordre mais dessiner gauche → droite doit toujours tabuler gauche → droite.`a11yHidden`n'est jamais déduit de l'opacité.`forcedColors`(`Scene.forcedColors`) est un problème de repeinture, pas de projection : le dessin à contraste élevé reste au niveau visuel.
6. **Budget ne masque pas le texte visible.** `contentSemanticBudget`ne retarde jamais un bloc à l'intérieur de la bande d'interaction — différer le texte visible le rendrait brièvement non sélectionnable (`Scene.ts:376`). La garantie est testée par `ContentProjectionSettledWalk.test.ts`(2 vs 802 tests box).`Infinity`est sûr pour `contentSemanticMargin`et interdit pour `contentProjectionMargin` — le coût qui l'a rendu non pris en charge était une bande porteuse non fenêtrée, et non un texte résident.
7. **Les ensembles virtualisés annoncent la taille de l'ensemble de données.** Une liste/grille virtualisée avec 10 000 éléments mais 12 lignes montées doit projeter `posInSet`/`setSize`(ou `aria-rowcount`) pour que AT entende « élément 400 sur 10 000 », et non « élément 3 sur 12 ».`aria-setsize`au niveau du conteneur sur `role="list"`n'est pas autorisé (`VirtualList.ts:660`).

## Lectures complémentaires - chaque réclamation épinglée

| réclamer                                  | `file:line`                                                                                                                                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scene options/budget                      | `Scene.ts:204`,`263`,`328`,`336`,`359`,`600`,`1398`,`1481`,`2403`,`3512`                                                                                                                      |
| Entity a11y + crochets de contenu         | `Entity.ts:295`,`788`,`912`,`968`,`1898`,`1970`,`2018`,`2048`                                                                                                                                 |
| Responsables de projection                | `A11yProjectionManager.ts:30`,`157`,`169`,`178`,`351`·`ContentProjectionManager.ts:26`·`ContentGridProjector.ts:69`·`content-line-window.ts:25`                                               |
| Virtualisation de l'interface utilisateur | `ScrollView.ts:58`,`233`,`289`·`VirtualList.ts:14`,`117`,`170`,`660`·`Table.ts:144`,`392`,`624`,`751`·`Card.ts:80`                                                                            |
| carrelage Markdown                        | `Markdown.ts:625`,`652`,`681`,`774`                                                                                                                                                           |
| Résultats/bases de référence              | `forge/findings/core-a11y-and-input.md:178`·`240`·`336`·`forge/baselines/content-projection-frontload-findings.md:1`·`content/learn/accessibility.md:353`·`content/reference/core-a11y.md:10` |
| Un précédent de point chaud               | `vectojs/AGENTS.md`(point d'accès zéro-DOM) · PR #160 · PR #191 ·`Table.ts:56`                                                                                                                |

---

_Suivant : 04 Streaming Markdown — lex incrémentiel, travailleur + réconciliation et poignée de main de virtualisation `Markdown`↔`ScrollView`._
