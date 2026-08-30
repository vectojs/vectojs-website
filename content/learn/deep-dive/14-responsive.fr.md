---
title: '14 — Layout responsive et interaction — Adaptation au viewport et aux entrées'
description: "Le viewport comme contrainte : reflow resize/zoom, passes de layout Stack/Flow, tableaux de bord à panneaux, fenêtrage VirtualList, physique ScrollView, poignées ResizablePanel, placement d'overlay et états hover/focus — le tout dans le monde canvas-native de VectoJS."
order: 34
---

# 14 — Layout responsive et interaction — Adaptation au viewport et aux entrées

> Dans un navigateur DOM, le layout responsive est du CSS : media queries, flexbox, grid et containers de scroll que le moteur vous offre gratuitement. Dans VectoJS, il n'y a pas de moteur CSS — chaque pixel est de l'arithmétique sur un arbre d'entités retenu sur un seul `<canvas>`. Le viewport n'est qu'un nombre de plus qui invalide des caches, un offset de scroll est un `y` piloté par ressort, et un overlay est une entité re-parentée vers `overlayRoot` avec un calcul de placement explicite. Ce document explique comment ces nombres restent cohérents quand la fenêtre se redimensionne, que l'utilisateur zoome ou qu'un doigt tire un diviseur de panneau.

- **Ce que vous apprendrez** : comment `Scene.resize()` propage un changement de viewport à travers les backing stores du renderer, les tiers de projection et les passes de layout ; comment `Stack`/`Flow`/`Card`/`PanelGroup` composent des tableaux de bord responsives sans moteur CSS ; comment `VirtualList` fenêtre 10k lignes en ~15 entités montées ; comment la physique à ressort de `ScrollView`, les poignées de drag `ResizablePanel`, le flipping de placement `Overlay` et les anneaux hover/focus de `Button` bouclent l'interaction — le tout avec reçus file:line.
- **Ce que vous n'apprendrez pas** : le cycle de vie VMT / dirty / dispatch d'événements (boss 06), le façonnage de texte et le saut de ligne (boss 02), la projection sémantique (boss 03) ou le diffing Markdown en streaming (boss 04).

## 1. Le viewport est une contrainte, pas un container

### 1.1 Scene.resize() — la source unique de vérité

`Scene.resize(width, height)` à `packages/core/src/tree/Scene.ts:6381` est la frontière du viewport :

```ts
public resize(width: number, height: number): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0) {
    if (!this.hasWarnedInvalidResize) console.warn(`...`); return;
  }
  this.width = width; this.height = height;
  this.contentFontEpoch++; this.contentViewportEpoch++;
  (this.renderer as any).resize(width, height);
  if (this.pointRenderer) { this.pointRenderer.resize(width, height); }
  if (this.gpuCanvas) this.sizeGpuCanvas(this.gpuCanvas, width, height);
  this.markDirty();
}
```

Cinq choses se produisent atomiquement : mise à jour des `width`/`height` logiques, bump de deux compteurs de génération, resize de chaque backing store et dirty de la frame. Les compteurs de génération sont la clé — `contentFontEpoch` force la recalibration du texte (le zoom navigateur change la géométrie Range même à même fonte CSS), et `contentViewportEpoch` re-tier chaque bloc de contenu sans en déplacer aucun (`Scene.ts:6415`, `Scene.ts:6420`). Un resize qui ne changerait que `width`/`height` laisserait chaque bloc avec du DOM construit pour l'ancien viewport.

Les dimensions invalides sont rejetées, pas clampées (`Scene.ts:6382`) : stocker `-10` alors que l'élément canvas clamp à `0` ferait diverger le culling et la géométrie a11y. Le warning est latché (`hasWarnedInvalidResize` à `Scene.ts:2113`) car les appelants pilotés par `ResizeObserver` spammeraient à chaque frame de drag.

### 1.2 Qui appelle resize()

Deux chemins, séparés par `disableWindowResize` (`Scene.ts:268`, `Scene.ts:2051`) :

| Mode                                                       | Observateur                                                                              | Handler                                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Remplissage fenêtre (`disableWindowResize: false`, défaut) | listener `window` `resize` (`Scene.ts:2968`) + media-query/watcher DPR (`Scene.ts:3052`) | `resize(window.innerWidth, window.innerHeight)`             |
| Embarqué (`disableWindowResize: true`)                     | `ResizeObserver` sur `canvas` (`Scene.ts:3082`)                                          | `resize(entry.contentRect.width, entry.contentRect.height)` |

Plus l'appel explicite piloté par l'appelant `scene.resize(w, h)` pour containers custom — le seul chemin quand `ResizeObserver` est indisponible (garde `Scene.ts:2740`). Le scaling DPR est orthogonal : `maxDPR` (`Scene.ts:287`) plafonne le multiplicateur du backing store, donc un affichage DPR-3 rend à 2x plutôt que 3x (coût `taille logique × dpr²`, `Scene.ts:276`).

### 1.3 Le zoom est un resize

Le zoom navigateur déclenche `window.resize` et change `devicePixelRatio`. Le watcher DPR de Scene (`Scene.ts:1435` `dprMediaQuery`, `Scene.ts:1441` `dprPollInterval`) ré-invoque `resize(this.width, this.height)` — même taille logique, nouvelle échelle de backing store — et le `contentFontEpoch++` dans ce chemin gère la dérive de géométrie Range sur échelles fractionnelles Firefox (commentaire `Scene.ts:6410`).

## 2. Containers de layout — de la pile au tableau de bord

### 2.1 Stack — la primitive

`Stack` à `packages/ui/src/Stack.ts:59` est le flexbox de VectoJS : séquentiel sur un axe, `align: 'start'|'center'|'end'` cross-axis (`Stack.ts:17`), `gap` (`Stack.ts:14`), `wrap` optionnel avec `maxWidth`/`maxHeight` (`Stack.ts:19`), et `fillTarget` pour layouts fill-remaining (`Stack.ts:42`).

`layout()` à `Stack.ts:303` est un algorithme en deux passes :

- **Passe 1 — groupage** (`Stack.ts:325`) : quand `wrap` est vrai, scannez les enfants le long de l'axe principal, coupant une nouvelle ligne dès que `currentMain + gap + childMain > limit`. Sinon une ligne contient tous les enfants.
- **Passe 1.5 — fill** (`Stack.ts:349`) : quand `fillTarget` est défini et wrap désactivé, étirez le dernier enfant pour que `children + gaps == fillTarget` — plancher à la taille de contenu, jamais de shrink.
- **Passe 2 — placement** (`Stack.ts:371`) : pour chaque ligne calculez `lineCross`/`lineMain`, puis assignez `x`/`y` avec offsets d'alignement cross-axis (`Stack.ts:388`).

`Stack` est un container purement structurel — `render()` ne dessine rien (`Stack.ts:443`), seuls ses enfants peignent. Ses propres `width`/`height` s'ajustent au contenu layoté, permettant le culling. `getLayoutControlledProperties()` à `Stack.ts:163` retourne `['x','y']` — les écritures sur les enfants sont revert au prochain layout.

Deux fast paths O(1) évitent le layout complet O(n) sur append en streaming (`Stack.ts:167` `add()`, `Stack.ts:257` `appendFastWrap()`) :

- `appendFast()` (`Stack.ts:231`) — non-wrap, `align: 'start'` : place le seul nouvel enfant à `height + gap` (vertical) ou `width + gap` (horizontal) et agrandit la taille cross du container. Les enfants précédents sont inchangés sous alignement start.
- `appendFastWrap()` (`Stack.ts:257`) — wrap + `align: 'start'` : place sur la ligne courante ou en démarre une nouvelle, en utilisant seulement quatre scalaires d'état de dernière ligne (`Stack.ts:95` `wrapLineMain/Cross/PriorCross/MaxMain`), sans jamais re-parcourir.

Les deux retombent sur `layout()` quand `align !== 'start'`, `fillTarget` est défini ou `fastAppendDirty` (posé par `remove()` à `Stack.ts:184`).

Pour du texte en streaming qui croît sans `add()`/`remove()`, `resizeLastChild(child)` à `Stack.ts:210` gère la croissance in-place du dernier enfant comme `height = child.y + child.height` / `width = max(width, child.width)` — valide seulement quand la taille cross de l'enfant croît, pas quand elle rétrécit.

### 2.2 Flow — des lignes de chips gratuitement

`Flow` à `packages/ui/src/Flow.ts:19` tient en une ligne :

```ts
export class Flow extends Stack {
  constructor(opts: FlowOptions = {}) {
    super({ ...opts, direction: opts.direction ?? 'horizontal', wrap: true });
  }
}
```

### 2.3 Card — le panneau arrondi

`Card` à `packages/ui/src/Card.ts:49` est une boîte arrondie à taille fixe (`Card.ts:123` `roundRect` + `fill`/`stroke`). Avec `label` elle projette `role="group"` (`Card.ts:81`) ; avec `onClick` elle devient cliquable — requérant `label` pour que la projection a11y obtienne toujours un nom accessible (`Card.ts:71` lève sinon, origine `vectojs-docs/forge/findings/ui-components.md:43`). `setContent(entity, fit?)` à `Card.ts:92` reflète `Panel.setContent` — par défaut le contenu suit `width`/`height` de la carte via `update()` (`Card.ts:118`).

### 2.4 PanelGroup — le treillis de tableaux de bord

`PanelGroup` à `packages/ui/src/ResizablePanel.ts:213` répartit l'espace disponible entre enfants `Panel` avec diviseurs `PanelResizeHandle` draggables :

```text
PanelGroup { direction, width, height }
  ├── Panel { minSize, defaultSize, clipChildren: true }  — setContent(entity, fit?)
  ├── PanelResizeHandle { width: handleSize, interactive: true }  — drag delta → _onResize
  ├── Panel
  └── ...
```

`addPanel()` à `ResizablePanel.ts:237` auto-insère une poignée avant chaque panneau après le premier (`ResizablePanel.ts:239` `new PanelResizeHandle`). `resize(w, h)` à `ResizablePanel.ts:258` redistribue les tailles proportionnellement (`ResizablePanel.ts:267` `(size / basis) * avail`) puis normalise (`ResizablePanel.ts:309` clamp à `minSize`/`avail`). `_layout()` à `ResizablePanel.ts:343` assigne `x/y/width/height` aux panneaux et poignées en alternance — les panneaux d'un groupe horizontal sont `width = sizes[i], height = cross` ; les poignées sont `width = handleSize, height = cross`.

`Panel.setContent()` à `ResizablePanel.ts:164` garde le contenu dimensionné à la boîte du panneau par défaut (`fit: true`, `ResizablePanel.ts:7` `FitContentOptions`), réappliqué à chaque frame depuis `Panel.update()` (`ResizablePanel.ts:190`) — nécessaire car `Entity.width/height` sont des champs plains sans hook setter (note de contrat `ResizablePanel.ts:158`, origine `vectojs-docs/forge/findings/ui-components.md:15` corrigée dans `@vectojs/ui@1.11.0`).

L'imbrication `PanelGroup` compose : un `PanelGroup` comme contenu d'un `Panel` (`Panel.setContent(innerGroup)`) donne des splits imbriqués — le `update()` du groupe interne le garde dimensionné au panneau externe, sans câblage supplémentaire.

## 3. VirtualList — fenêtrer 10k lignes en ~15 entités

### 3.1 L'épine Fenwick

`RowHeights` à `packages/ui/src/VirtualList.ts:14` est un arbre Fenwick (binary-indexed) sur les hauteurs par ligne (`VirtualList.ts:17` `Float64Array` de taille `n+1`) :

- `total()` (`VirtualList.ts:46`) — O(1) somme de toutes les hauteurs de lignes.
- `prefix(i)` (`VirtualList.ts:60`) — O(log n) y du top de la ligne `i`.
- `indexAt(y)` (`VirtualList.ts:71`) — O(log n) première ligne dont le bottom dépasse `y`, via binary lifting.
- `set(i, h)` (`VirtualList.ts:51`) — O(log n) mise à jour ponctuelle avec propagation du delta.

Chaque ligne démarre à `estimatedRowHeight` (`VirtualList.ts:28`) ; `set()` remplace l'estimation quand la ligne se monte et est mesurée.

### 3.2 Réconciliation — seule la fenêtre visible

`VirtualList` à `VirtualList.ts:179` garde `this._pool: Map<number, Entity>` (`VirtualList.ts:203`) — une entité par index de ligne monté, pas par item de données.

`_visibleRange()` à `VirtualList.ts:468` dérive `[start, end]` (inclusif) depuis `_scrollY` et `height` via deux appels `indexAt`, élargi par `overscan` (défaut 3, `VirtualList.ts:103`) des deux côtés. `_reconcile()` à `VirtualList.ts:488` :

1. Recycle les entités hors fenêtre (`VirtualList.ts:494` `super.remove` + `delete`).
2. Monte les lignes nouvellement visibles (`VirtualList.ts:506` `renderItem(item, i)`, `super.add`).
3. Mesure après montage (`VirtualList.ts:515` `_measureMountedRows` avant positionnement — lire `heightOf(i)` avant placement évite le stale-offset d'une frame qui précédait PR #509).
4. Positionne `y = rowTop(s) + ... - _scrollY` (`VirtualList.ts:518`).

`VirtualList.scrollToIndex(i)` / `scrollToTop/Bottom` / `jumpToBottom` à `VirtualList.ts:342` reciblent `_targetY`/`_scrollY` ; `jumpToBottom` snap instantanément (vélocité zéro) pour les transcripts en streaming où recibler un intégrateur à chaque chunk ne le laisse jamais se stabiliser.

### 3.3 Croissance, identité et ancrage

Sans `keyForItem`, `setItems()` à `VirtualList.ts:248` vide le cache de hauteurs et saute en haut — correct pour une liste remplacée, faux pour un transcript qui croît. Avec `keyForItem` (`VirtualList.ts:117`) :

- `_heightByKey: Map<string, number>` (`VirtualList.ts:199`) survit à `setItems` — les hauteurs mesurées sont une propriété de la ligne, pas de son index (`VirtualList.ts:272` re-seed depuis le cache après rebuild de l'arbre).
- `_rekeyPool()` à `VirtualList.ts:317` déplace les entités poolées vers leurs nouveaux indices avant toute lecture de hauteur — sans cela un prepend écrase chaque entrée avec la mauvaise hauteur.
- Ancrage du scroll (`VirtualList.ts:397` `_captureAnchor` / `VirtualList.ts:431` `_restoreAnchor`) : deux variantes — `bottom` (distance-au-bas, gap préservé) quand `nearBottom` (`VirtualList.ts:219` latché par scroll), `item` (clé de ligne ancrée + offset dedans) sinon. Un resize qui change la hauteur de chaque ligne laisse la ligne ancrée visuellement immobile.

`_measureMountedRows()` à `VirtualList.ts:540` sonde la `height` de chaque ligne montée à chaque frame, applique le delta via `Fenwick.set`, et ancre — gérant les lignes qui se redimensionnent après montage (reflow Markdown en streaming, assignation directe de `height`) sans aucun hook setter.

## 4. ScrollView — un viewport, un ressort

`ScrollView` à `packages/ui/src/ScrollView.ts:58` est le pendant non virtualisé : un viewport clippé (`ScrollView.ts:71` `clipChildren = true`) dont l'entité interne `content` glisse en `y` via le système de ressort partagé (`ScrollView.ts:90` `content.setTransition({ y: scrollPhysics ?? 'spring' })`).

- **Wheel** (`ScrollView.ts:92`) : conversion `deltaMode` (`ScrollView.ts:105` pixels/lignes×16/pages×viewport), `targetY -= delta`, clamp, `content.y = targetY` recible le ressort en préservant la vélocité. Ctrl+wheel bail pour laisser le navigateur zoomer ; contenu qui tient (`maxScroll <= 0`) bail pour éviter une bande morte (`ScrollView.ts:95`, fix #525).
- **Drag pointeur** (`ScrollView.ts:113`) : tracking doigt 1:1 via deltas `localY`.
- **Clamping** (`ScrollView.ts:136`) via `clampTarget()` garde `targetY ∈ [-maxScroll, 0]`. `update()` à `ScrollView.ts:219` re-clamp défensivement et ne réassigne `content.y` que quand le clamp a réellement bougé — une réassignation inconditionnelle spawnerait un done-driver parasite pour toujours, défaisant le throttle idle (`ScrollView.ts:217` commentaire).
- **`scrollToBottom()`** (`ScrollView.ts:163`) snap via `jumpTo()` (`ScrollView.ts:79` `setImmediate('y', y)`) plutôt que recibler le ressort — les appelants streamant du chat l'appellent plusieurs fois par seconde, et un ressort reciblé aussi vite ne se stabilise jamais et jitter.
- **`DOCUMENT_SCROLL_PHYSICS`** à `ScrollView.ts:36` (`{ stiffness: 180, damping: 27 }`, ζ ≈ 1.006, origine `vectojs-docs/forge/findings/ui-components.md:241`) est le preset critically-damped pour scroll de document ; les défauts (`stiffness: 180, damping: 12`, ζ ≈ 0.447) overshootent de ~20% et rebondissent — vivant sur une liste, faux sur un document.
- **Croissance de contenu** (`ScrollView.ts:233` `driveVirtualizableContent`) : sonde les extents des enfants à chaque frame et resync via `updateContentSize()` quand ils diffèrent — gérant la croissance `setSpans` en streaming sans `add()`/`remove()`. `ScrollVirtualizable.setVisibleRange` (`ScrollView.ts:50` duck-typé) est piloté la même frame pour contenu fenêtré.

## 5. Primitives d'interaction

### 5.1 Poignées ResizablePanel — deltas en espace scène

`PanelResizeHandle` à `packages/ui/src/ResizablePanel.ts:42` mesure les deltas de drag en **espace scène** (`ResizablePanel.ts:86` `posOf` préfère `sceneX`/`sceneY` à `localX`/`localY`). La poignée bouge avec le panneau qu'elle redimensionne, donc les coords locales changent à peine à mesure que le panneau grandit et que la poignée glisse sous le curseur — les coords scène sont stables, donc 1px de déplacement = 1px de resize (commentaire `ResizablePanel.ts:78`, origine `vectojs-docs/forge/findings/ui-components.md:64`, corrigé dans `@vectojs/ui@1.1.3`). `hover` swap `color` → `hoverColor` ; la poignée est `interactive: true` avec câblage `pointerdown`/`pointermove`/`pointerup`/`pointerleave` (`ResizablePanel.ts:92`).

### 5.2 Overlay — contenu flottant au-dessus de l'arbre

`Overlay` à `packages/ui/src/Overlay.ts:37` est la base pour `Tooltip`, `Popover`, `ContextMenu` :

- Se monte sur `scene.overlayRoot` (`Overlay.ts:168` `scene.overlayRoot.add(this)`) — au-dessus de `clipChildren`, toujours au-dessus.
- Placement (`Overlay.ts:14` `OverlayPlacement` : `top|bottom|left|right|auto` plus variantes `-start/-end`) calculé dans `_position()` à `Overlay.ts:171` depuis `target.getWorldBounds()` + `placement` + `offset` (défaut 6, `Overlay.ts:23`), puis clampé via `_placeAt()` à `Overlay.ts:227` à marge viewport `4px`. `auto` flip selon l'espace disponible en dessous vs au-dessus (`Overlay.ts:180`).
- `showAtPoint(x, y, source?)` à `Overlay.ts:98` accepte une `source` optionnelle (Scene ou Entity montée) pour résoudre `scene` quand l'overlay lui-même n'a jamais été monté — sinon il no-op silencieusement au premier appel (origine `vectojs-docs/forge/findings/ui-components.md:114`, corrigé dans `@vectojs/ui@1.10.0`).
- Entrée via `setTransition` sur `opacity/scaleX/scaleY` (`Overlay.ts:59` `easeOutQuad` + spring) et toggling `a11yHidden`/`interactive` qui cache le sous-arbre à la fois du hit-testing pointeur et de la projection a11y (`Overlay.ts:149` `hide()` appelle aussi `detachA11y`).
- `Modal` à `packages/ui/src/Modal.ts:25` s'appuie dessus : un backdrop plein viewport (`Modal.ts:40` `width = window.innerWidth`, `Modal.ts:39` `a11yFullViewport = true`) avec une `Card` centrée qui spring via `card.scaleX/scaleY` (`Modal.ts:84` seed 0, `Modal.ts:266` `springTo({scaleX:1,scaleY:1})`), focus-trap et gestion Escape (`Modal.ts:188` `installFocusTrap`), et `close()` à `Modal.ts:282` qui anime la sortie avant `scene.hideOverlay(this)` et restauration du focus.

### 5.3 Hover / focus — la boucle de feedback canvas

Un canvas n'a pas de `:hover` ni de `:focus-visible`. VectoJS les pilote depuis les événements de projection a11y que Scene re-dispatche dans le VMT :

- **Hover** — `Button` à `packages/ui/src/Button.ts:97` `on('hover')` / `on('pointerleave')` toggle `hovered` → repeint avec `hoverBg` (`Button.ts:11` option), gaté par `disabled` pour qu'une affordance désactivée ne paraisse jamais active. `PanelResizeHandle` fait de même à `ResizablePanel.ts:111` pour `hoverColor`.
- **Anneau de focus** — `Button.focused` à `packages/ui/src/Button.ts:61` trace un anneau `focusColor` 2px (`Button.ts:30` défaut `#00f0ff`). Le flag est piloté depuis les vrais `focus`/`blur` DOM sur le `<button>` shadow que Scene émet quand l'élément a11y prend le focus — sans cela l'anneau canvas n'apparaît jamais pour les utilisateurs clavier.
- **Clignotement caret** — `UIComponent.startCaretBlinkWake()` à `packages/ui/src/UIComponent.ts:84` planifie un wake-up à 500 ms (`markDirty` à la prochaine frontière de phase) pour qu'une scène `onDemand` idle fasse encore clignoter le caret dans `Input`/`TextArea` — un timeout par phase coûte ~2 renders/s quand focus (`UIComponent.ts:76` commentaire), vs pinner la scène à plein régime.
- **Focus trap** — `Modal` (`Modal.ts:188`) et `Overlay` hide/show gardent `a11yHidden` et `interactive` en lockstep pour que le bouton d'un popover caché ne reste pas Tab-atteignable (origine `vectojs-docs/forge/findings/ui-components.md:391`, corrigé dans lot P2 du 2026-08-13).

La règle générale : chaque état visuel qu'un navigateur dériverait de pseudo-classes CSS doit être piloté explicitement depuis les événements DOM live de la projection a11y, et chaque hide doit drop à la fois le visuel et la projection.

## 6. Patterns responsives sans moteur CSS

### 6.1 La cascade de resize pour un app shell

```ts
// Un tel handler possède toute la cascade responsive :
window.addEventListener('resize', () => {
  const w = window.innerWidth,
    h = window.innerHeight;
  scene.resize(w, h);
  header.width = w;
  header.layout();
  sidebar.height = h - header.height;
  sidebar.layout();
  contentGroup.resize(w - sidebar.width, h - header.height);
});
```

Chaque `resize()` bump les deux compteurs de génération, chaque backing store rescale, `Stack`/`Flow` se regroupent au prochain `layout()`, `PanelGroup.resize()` redistribue, et `VirtualList` clamp `_targetY` (`VirtualList.ts:566` `_clamp`). Pas de moteur media-query — l'app décide du breakpoint et appelle l'API.

### 6.2 Tableaux de bord à panneaux — splits imbriqués

L'imbrication `PanelGroup` (doc `ResizablePanel.ts:206`) est le shell IDE/éditeur idiomatique :

```ts
const outer = new PanelGroup({ direction: 'horizontal', width: W, height: H });
const sidebar = new Panel({ minSize: 160, defaultSize: 0.2 });
const editorGroup = new Panel({ minSize: 300 }); // héberge split vertical interne

const inner = new PanelGroup({ direction: 'vertical', width: 0, height: 0 });
inner.addPanel(new Panel({ defaultSize: 0.6 })); // éditeur
inner.addPanel(new Panel({ minSize: 120 })); // terminal
editorGroup.setContent(inner); // ← Panel.setContent garde inner dimensionné

outer.addPanel(sidebar).addPanel(editorGroup);
scene.add(outer);
// Au resize fenêtre : outer.resize(newW, newH) — inner suit via Panel.update().
```

Le scaling proportionnel de `PanelGroup.resize()` (`ResizablePanel.ts:265`) gère le groupe externe ; le groupe interne est re-layoté via le fit sync de `Panel.update()`, pas besoin d'appel `resize()` interne explicite.

### 6.3 ScrollView vs VirtualList — quand fenêtrer

| Besoin                                            | Utilisez                                                          | Pourquoi                                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Document / transcript de chat, hauteur non bornée | `ScrollView` + `Stack`                                            | Simple, animé par ressort, le polling de croissance de contenu gère le streaming                          |
| Longue liste avec 100+ lignes uniformes           | `VirtualList`                                                     | Seulement ~15 entités montées, math de scroll Fenwick O(log n), hauteurs survivent à `setItems` avec clés |
| Longue liste avec hauteurs de lignes variables    | `VirtualList` + `estimatedRowHeight`                              | Estimations au premier montage, hauteurs mesurées les remplacent et ancrent le viewport                   |
| Chat avec croissance bottom-pinned en streaming   | `VirtualList` + `jumpToBottom()` ou `ScrollView.scrollToBottom()` | Snapping, pas reciblage de ressort, garde le viewport immobile                                            |

### 6.4 Visibilité de scrollbar — `clip-overflow` vs vraie scrollbar

VectoJS n'a pas de widget scrollbar natif — `ScrollView` et `VirtualList` clippent et gèrent wheel/drag eux-mêmes, et l'ombre a11y préserve l'ordre de lecture. Une scrollbar visuelle (audit DevTools `clip-overflow` à `packages/devtools/src/audit.ts:51`, exempt pour `ScrollView`/`VirtualList`/`Tree`/`Table`) est un `Rect` décoratif dont le thumb `y` suit `scrollY / maxScroll` — pas une cible interactive séparée.

## 7. Parties difficiles — avec reçus

| Piège                                                                            | Où                                                          | Statut                                                                            |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Container ne dimensionne jamais son contenu (`Tabs`/`Panel`/`PanelGroup` chaîne) | `ResizablePanel.ts:164`, `Card.ts:92`, forge 2026-07-10     | Corrigé `@vectojs/ui@1.11.0` — `setContent(entity, fit?)` avec fit sync par frame |
| Clic sur carte entière nécessitait overlay Button invisible                      | `Card.ts:35`, forge 2026-07-10                              | Corrigé `@vectojs/ui@1.11.0` — `Card({ onClick, label })`                         |
| Drag de panneau utilisait deltas en espace local (curseur en retard)             | `ResizablePanel.ts:78`, forge 2026-07-10                    | Corrigé `@vectojs/ui@1.1.3` — espace scène `sceneX`/`sceneY`                      |
| Tabs collapsés en lamelles au-delà de ~10 tabs                                   | forge 2026-07-10                                            | Corrigé `@vectojs/ui@1.1.3` — `tabWidth` fixe + scroll overflow                   |
| Stretch Tabs × visuellement à côté du label du NEXT tab                          | `Tabs._tabW()`, forge 2026-07-16                            | Corrigé `@vectojs/ui@1.9.4` — `tabWidth` est max, surplus vide                    |
| Overlay.showAtPoint no-op silencieux avant premier montage                       | `Overlay.ts:98`, forge 2026-07-17                           | Corrigé `@vectojs/ui@1.10.0` — arg `source` pour résolution scene                 |
| Stack.add() est O(n²) en streaming                                               | `Stack.ts:167`, `Flow.ts:19`, forge 2026-07-19              | Corrigé `@vectojs/ui@1.11.4` — `appendFast`/`appendFastWrap`                      |
| Ressort par défaut ScrollView sous-amorti (5 reversals, 801 ms)                  | `ScrollView.ts:14`, forge 2026-08-02                        | Corrigé `@vectojs/ui` #322 — `scrollPhysics` + `DOCUMENT_SCROLL_PHYSICS`          |
| VirtualList unkeyed setItems laissait lignes stales à l'écran                    | `VirtualList.ts:248`, forge 2026-08-02/08                   | Corrigé `@vectojs/ui@2.15.1`                                                      |
| Widgets scroll ignorent deltaMode (wheels ligne/page scroll 1-3 px)              | `ScrollView.ts:105`, `VirtualList.ts:583`, forge 2026-08-08 | Corrigé `@vectojs/ui@2.15.2`                                                      |
| Fix deltaMode a droppé VirtualList markDirty (freeze onDemand)                   | `VirtualList.ts:596`, forge 2026-08-08                      | Corrigé `@vectojs/ui@2.15.3`                                                      |
| Fuite a11y/pointer Popover + Overlay cachés                                      | `Overlay.ts:48`, forge 2026-08-13                           | Corrigé vectojs#474, mergé vectojs#509                                            |
| Table virtualisée ne re-sync pas les cellules string sur layout()                | `Table.ts:354`, forge 2026-08-13                            | Corrigé vectojs#494, mergé vectojs#520                                            |
| Hotspots Tabs/RadioGroup désync sur réassignation de tableau                     | `Tabs.ts:229`, forge 2026-08-13                             | Corrigé vectojs#494, mergé vectojs#520                                            |
| VirtualList non-keyed setItems laisse stale _velY (overshoot transitoire)        | `VirtualList.ts:290`, forge 2026-08-13                      | Corrigé vectojs#494, mergé vectojs#520                                            |

## 8. Checklist — avant de lander un changement de layout responsive

1. **Appelez scene.resize() quand le viewport logique change.** Les `width`/`height` logiques sont des champs plains (`Scene.ts:2049`) — rien ne les observe jusqu'à ce que `resize()` bump les deux compteurs de génération et rescale les backing stores. Vérifiez les deux `disableWindowResize: false` (chemin fenêtre) et `true` (chemin ResizeObserver). Gardez avec le check `Number.isFinite && >= 0` (`Scene.ts:6395`).
2. **Gardez le dimensionnement de container symétrique.** Chaque container possédant `width`/`height` d'enfants doit réappliquer via `update()` (le pattern `Panel`/`Card` à `ResizablePanel.ts:190` / `Card.ts:118`) car `Entity.width/height` sont des champs plains sans hook setter. Greppez les `children.push` directs hors `Entity.ts:1065 add()` — ils sautent `markStructureChanged` et `markDirty` entièrement.
3. **Les fast paths Stack doivent rester sous l'invariant.** `appendFast` non-wrap suppose `align: 'start'` et pas de `fillTarget` ; wrap `appendFastWrap` restaure l'état quatre scalaires de dernière ligne (`Stack.ts:95`) et recalcule depuis les lignes après un `layout()` complet (`Stack.ts:422`). Un nouveau flag permettant à un enfant ultérieur d'affecter des positions antérieures doit invalider `fastAppendDirty`.
4. **L'ownership Overlay est overlayRoot, pas parent.** `Overlay.showAt` (`Overlay.ts:70`) re-parente vers `scene.overlayRoot` — passez toujours `source` depuis l'appelant `showAtPoint` (`Overlay.ts:98` troisième arg) pour qu'un overlay jamais monté résolve `scene` au premier show.
5. **Les intégrateurs de scroll ne doivent pas réarmer le throttle idle.** `ScrollView.update()` (`ScrollView.ts:219`) ne réassigne `content.y` que quand le clamping a bougé `targetY` ; `VirtualList` ne fait `markDirty()` que quand l'état de scroll change (`VirtualList.ts:596`). Salir inconditionnellement par frame garde une scène `onDemand` à plein régime pour toujours.
6. **deltaMode — scalez avant de clamper.** Ligne→×16, page→×viewport avant `clampTarget()`/`_clamp()` (`ScrollView.ts:105`, `VirtualList.ts:583`). Chrome/jsdom délivrent toujours `deltaMode: 0`, donc le bug y est invisible.
7. **VirtualList : reconstruisez hauteurs depuis clés, pas indices.** Après `setItems` avec `keyForItem`, l'arbre Fenwick re-seed depuis `_heightByKey` (`VirtualList.ts:272`) et `_rekeyPool()` (`VirtualList.ts:317`) déplace les entités poolées avant toute lecture de hauteur — une réutilisation adressée par index sans rekeying écrit chaque hauteur dans le mauvais slot de cache.
8. **Le drag Panel doit rester en espace scène et ne pas finir sur pointerleave.** `PanelResizeHandle` (`ResizablePanel.ts:86`) lit `sceneX`/`sceneY` quand disponible, et ne finit plus le drag sur `pointerleave` — le nœud shadow garde la capture.

---

_Série : 00 Overview → 01 Selection → 02 Text+Layout → 03 Projection sémantique → 04 Streaming Markdown → 05 TeX → 06 Runtime VMT → 07 Renderer → 08 WASM → 09 Three/XR → 10 Export vidéo → 11 Agencement de graphes → 12 DevTools → **14 Layout responsive** → 99 Synthesis._
