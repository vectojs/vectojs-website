---
title: 'Accessibilité et automatisation'
description: "Comment VectoJS projette des contrôles DOM sémantiques par-dessus le contenu canvas pour les lecteurs d'écran, les utilisateurs au clavier et l'automatisation Playwright."
order: 15
---

# Accessibilité et automatisation

Les pixels de canvas et de WebGL ne portent en eux-mêmes aucune information sémantique. Pour les entités interactives éligibles, VectoJS maintient un véritable élément DOM invisible dans sa couche superposée `a11yRoot`. Les lecteurs d'écran, la navigation au clavier et les outils d'automatisation peuvent interagir avec ces éléments pendant que les couches rendues sur canvas fournissent le visuel. Il s'agit d'une couche de projection, et non de l'API Shadow DOM du navigateur ; les applications restent propriétaires de la sémantique correcte et des tests.

## Comment fonctionne la projection shadow DOM

Lorsqu'une entité a `interactive = true` (et une boîte non nulle), la `Scene` crée un véritable élément HTML — `<button>`, `<input>`, `<a>`, etc. — et le positionne au-dessus du canvas à l'aide d'un CSS absolu. L'élément a `opacity: 0` et `pointer-events: auto`, il est donc invisible à l'œil mais pleinement fonctionnel pour les outils d'accessibilité.

<figure>
  <img src="/images/shadow-dom-layers.svg" alt="Diagramme montrant trois couches empilées : le canvas au z-index 0 avec des composants rendus par le GPU, la couche portail DOM au z-index 9, et la couche fantôme A11y au z-index 10 contenant de vrais éléments DOM transparents comme button et input. Une flèche de curseur pointeur atteint d'abord la couche supérieure." class="diagram" />
  <figcaption>Trois couches dans le parent du canvas. Seule la couche a11y a <code>pointer-events: auto</code>, de sorte que les clics atteignent les vrais éléments fantômes avant le canvas.</figcaption>
</figure>

La couche a11y se trouve dans le `<div>` parent du canvas, que la `Scene` force automatiquement en `position: relative`.

À chaque image rendue (limitée par `a11ySyncInterval`), la Scene :

1. Lit le `getA11yAttributes()` de chaque entité interactive.
2. Crée ou met à jour le nœud fantôme correspondant (avec vérification de l'état « sale » pour minimiser les écritures DOM).
3. Applique la matrice affine mondiale complète de l'entité et sa `width × height` locale ; la racine de projection mappe les coordonnées logiques de la Scene sur la boîte CSS du canvas.

Le décalage du canvas et la mise à l'échelle CSS non uniforme sont pris en charge. Ne présumez pas l'alignement sous une rotation/inclinaison CSS arbitraire du canvas ; vérifiez avec `debugA11y` sur la page réelle.

> [!NOTE]
> La synchronisation **n'élague jamais** pendant une image. Si votre code ajoute et supprime fréquemment des entités enfants interactives, appelez `scene.detachA11y(entity)` avant de les jeter, sinon leurs nœuds fantômes fuiront. `scene.remove(entity)` élague de manière récursive et sûre.

## Activer l'option : `entity.interactive`

```typescript
entity.interactive = true; // enable shadow node + pointer/keyboard events
entity.width = 120;
entity.height = 40; // shadow node is only created when width > 0
```

Définir `interactive = true` a un effet de bord : cela marque `a11yNeedsReorder` et appelle `scene.markDirty()`.

## Contrôler le nœud fantôme : `getA11yAttributes()`

Surchargez `getA11yAttributes()` pour spécifier le type d'élément, le rôle ARIA et l'état sémantique :

```typescript
import type { A11yAttributes } from '@vectojs/core';

class AccessibleBtn extends Entity {
  label = 'Submit';

  getA11yAttributes(): A11yAttributes {
    return {
      tag: 'button',
      role: 'button',
      label: this.label,
    };
  }
}
```

Interface complète :

```typescript
interface A11yAttributes {
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea'; // default: 'div'
  role?: string; // ARIA role (e.g. 'switch', 'slider', 'combobox')
  label?: string; // aria-label / accessible name
  tabIndex?: number; // explicit focus order for non-control keyboard regions
  href?: string; // for tag='a' — makes it a real link
  src?: string; // for tag='img'
  alt?: string; // for tag='img'
  inputType?: string; // for tag='input' — 'text', 'checkbox', etc.
  placeholder?: string; // input/textarea placeholder
  value?: string; // input/textarea current value
  checked?: boolean; // input[type=checkbox] or aria-checked (for role=switch)
  disabled?: boolean;
  expanded?: boolean; // aria-expanded (for comboboxes, disclosures)
  controls?: string; // aria-controls (points to another element's id)
  haspopup?: string; // aria-haspopup
  selected?: boolean; // aria-selected (for listbox options)
  activedescendant?: string; // aria-activedescendant (for composite widgets)
  valuemin?: string; // aria-valuemin (for sliders, meters)
  valuemax?: string; // aria-valuemax

  // Relations et dénomination depuis d'autres nœuds
  labelledby?: string; // aria-labelledby
  describedby?: string; // aria-describedby — texte d'indication / erreur

  // État de validation (le seul moyen qu'un formulaire canvas soit annonçable)
  required?: boolean; // aria-required
  invalid?: boolean; // aria-invalid — note false signifie « explicitement valide »

  // Structure et dialogues
  level?: number; // aria-level (titres, éléments d'arborescence)
  ariaModal?: 'true' | 'false'; // aria-modal sur un role="dialog"

  // Régions actives — annoncer les mises à jour en continu sans déplacer le focus
  live?: 'off' | 'polite' | 'assertive';
  atomic?: boolean; // aria-atomic — lire la région entière, pas la diff
  relevant?: string; // aria-relevant — ex. 'additions text'

  // Surface du pointeur
  pointerEvents?: 'auto' | 'none'; // 'none' pour les nœuds structurels/overlay uniquement

  target?: string; // pour tag='a'
  textInputStyle?: TextInputStyle; // typographie de l'éditeur natif
}
```

Retourner `undefined` pour un champ **supprime** l'attribut — l'état qui ne s'applique plus disparaît au lieu de devenir obsolète.

Utilisez un `tabIndex: 0` explicite pour un espace de travail canvas qui n'est pas un bouton ni un contrôle de formulaire, mais qui doit détenir des raccourcis clavier :

```typescript
getA11yAttributes(): A11yAttributes {
  return { role: 'region', label: 'Design canvas', tabIndex: 0 };
}
```

Laissez les entrées natives, les zones de texte et le contenu éditable gérer leurs propres raccourcis d'édition. La Scene rafraîchit un index de tabulation explicite lorsque les attributs changent.

### Ce que projettent les composants intégrés

| Composant             | Élément fantôme                            | Attributs ARIA clés                                                   |
| --------------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| `Button`              | `<button>`                                 | `role="button"`, `aria-label`                                         |
| `Link`                | `<a href>`                                 | lien natif, `aria-label`                                              |
| `Image`               | `<img>`                                    | `src`, `alt`                                                          |
| `Input`               | `<input type="text">`                      | `placeholder`, `value` (en direct)                                    |
| `TextArea`            | `<textarea>`                               | `placeholder`, `value` (en direct)                                    |
| `Checkbox`            | `<input type="checkbox">`                  | `checked` (en direct), `aria-label`                                   |
| `Toggle`              | `<div role="switch">`                      | `aria-checked` (en direct), `aria-label`                              |
| `Slider`              | `<div role="slider">`                      | `aria-valuenow/min/max` (en direct)                                   |
| `Dropdown`            | `<div role="combobox">`                    | `aria-expanded`, `aria-controls`, éléments de menu en `role="option"` |
| `Card` (avec libellé) | `<div role="group">`                       | `aria-label`                                                          |
| `Table`               | `grid` › `row` › `gridcell`/`columnheader` | tabindex baladeur, touches fléchées 2D, Ctrl+Home/End                 |
| `TreeView`            | `treeitem` par ligne visible               | `aria-level`/`expanded`/`selected`, flèches développer/réduire        |
| `ContextMenu`         | `menuitem` par élément                     | `aria-haspopup`/`expanded`, flèches bouclent, Escape ferme            |
| `RadioGroup`          | `radio` par option                         | `aria-checked`, flèches déplacent+sélectionnent                       |
| `Tabs`                | `tab` par onglet                           | `aria-selected`, flèches déplacent, Home/End                          |
| `Text`                | `<div>`                                    | `aria-label` = contenu textuel                                        |

## Widgets composites : un seul arrêt tabulation, touches fléchées à l'intérieur

Un arbre, grille, menu, groupe radio ou liste d'onglets ne doit pas mettre chaque enfant dans l'ordre de tabulation. VectoJS pool un hotspot transparent et focalisable sur chaque enfant **visible** portant le rôle et l'état de cet enfant, et donne exactement à l'un d'eux `tabIndex: 0` — un **tabindex baladeur**. Le parent gère le gestionnaire de touches fléchées et déplace l'arrêt. Voir le tableau ci-dessus pour les touches de chaque composant, et [Widgets composites](/reference/core-a11y/#composite-widgets-roving-tabindex) pour le motif si vous construisez le vôtre.

Réutilisez ce motif plutôt que d'en inventer un : le point important est que le hotspot doit définir `pointerEvents: 'none'` whenever quelque chose en dessous possède la souris (texte de cellule sélectionnable, glisser pour défiler, gestion des impacts canvas). Le focus clavier et le `click` synthétisé par AT passent toujours à travers.

L'ordre de tabulation suit l'ordre de lecture **visuel**, pas l'ordre dans lequel vous avez ajouté les entités. Pour une interface RTL, réglez `readingDirection: 'rtl'` sur la Scene afin que l'ordre en ligne dans chaque ligne soit également inversé.

## Couleurs forcées (Contraste élevé Windows)

Un `<canvas>` est des pixels opaques, donc le remappage `forced-colors` du navigateur n'atteint jamais ce que vous dessinez — un contrôle thématisé reste à faible contraste et illisible à moins qu'il ne se redessine lui-même. Lisez `scene.forcedColors` et dessinez avec les couleurs système CSS ; la scène se redessine automatiquement lorsque le paramètre système bascule :

```typescript
render(r: IRenderer) {
  const forced = this.scene?.forcedColors ?? false;
  r.beginPath();
  r.roundRect(0, 0, this.width, this.height, 8);
  r.fill(forced ? 'ButtonFace' : this.bg);
  if (forced) r.stroke('ButtonText', 1);       // give the shape an edge
  r.fillText(this.label, x, y, this.font, forced ? 'ButtonText' : this.color);
}
```

`Button` le fait déjà. Utilisez `Highlight` pour la sélection/le focus, `Canvas`/`CanvasText` pour les surfaces et le texte du corps.

## Champs de saisie compatibles IME

`Input` et `TextArea` utilisent de **vrais éléments fantômes transparents `<input>`/`<textarea>`** pour la saisie de texte. Cela signifie :

- La composition IME (chinois, japonais, coréen, arabe) fonctionne nativement — le navigateur gère la fenêtre de candidats.
- La sélection de texte, le presse-papiers (couper/copier/coller), l'annulation/rétablissement sont tous natifs.
- Le canvas est un **pur miroir visuel** : il lit `value`, `selectionStart`, `selectionEnd` et `composition` depuis l'événement `change` et dessine le curseur, la surbrillance de sélection et le soulignement IME.

Tant qu'une entrée a le focus, la synchronisation évite de réécrire la même valeur synchronisée par l'utilisateur. Si l'état de l'application fournit une valeur réellement différente, celle-ci est appliquée ; les composants contrôlés doivent donc préserver intentionnellement la sélection lors du remplacement du texte.

## Projection de contenu statique

Les contrôles interactifs projettent des nœuds a11y. La projection de contenu statique couvre le versant non interactif : les entités qui rendent du texte statique l'exposent via `getContentProjection()`, et la Scene le reflète comme un **nœud DOM transparent, synchronisé en position** par-dessus les glyphes dessinés. Les lecteurs d'écran, Ctrl+F, les robots d'indexation et les extensions de traduction peuvent alors voir le texte rendu visuellement sur canvas.

```typescript
// Built-in: TextEntity and MSDFTextEntity expose content. Text, RichText,
// Markdown, fenced CodeBlock, and Table cell text are selectable by default.

// Custom entities opt in the same way:
class Caption extends Entity {
  label = 'Rendered on canvas, found by Ctrl+F';
  getContentProjection() {
    return { text: this.label, font: '16px sans-serif' };
  }
  // …render() draws the same string…
}
```

Ce que cela débloque, sans aucun travail supplémentaire :

- **Recherche dans la page** — Ctrl+F trouve les correspondances ; les cadres de surbrillance du navigateur se rendent derrière les glyphes transparents.
- **Les lecteurs d'écran et les robots d'indexation** lisent le vrai texte dans l'ordre source.
- **Les extensions de traduction et le mode lecture** opèrent sur la couche projetée.
- **Les liens de fragment `#:~:text=`** se résolvent.
- **La sélection native à la souris** — activez-la par entité personnalisée avec `selectable: true` (la surbrillance `::selection` peint derrière les glyphes transparents). La projection de base est désactivée par défaut afin qu'un texte arbitraire n'intercepte jamais la saisie canvas. Le contenu UI Text/RichText/Markdown/Table est sélectionnable par défaut et expose `setSelectable(boolean)`.

Pour une sélection au pixel près, traitez la ligne de base du Canvas comme la source de vérité : utilisez `baseline` (et `contentX`/`contentY`) pour une seule séquence, ou des `lines` visuelles explicites pour un texte à retour à la ligne, en retrait, ou de tailles mixtes. Core 1.8 mappe ces coordonnées locales à travers les transformations et donne à chaque séquence projetée la même boîte de ligne CSS. Définissez `separatorAfter` sur une ligne visuelle lorsque sa source logique se termine par un saut de ligne ou un séparateur de retour à la ligne souple préservé. La Scene fusionne ce séparateur dans le nœud de texte final de la ligne, de sorte que Firefox ne puisse pas placer une partie d'une sélection multiligne à la racine de projection. `text` reste la source Unicode logique faisant autorité ; ne substituez jamais l'ordre des glyphes visuels mis en forme. Ne compensez pas avec des décalages CSS au niveau de la page.

Le texte ordinaire sélectionnable, les lignes visuelles explicites et les projections personnalisées sans lignes résolvent des curseurs de graphèmes légaux dans une géométrie bidimensionnelle transformée. La rotation, les transformations miroir, la mise à l'échelle non uniforme, le DPR fractionnaire et le zoom du navigateur ne réduisent pas le routage du pointeur à la coordonnée X de la fenêtre. Les entités de type code devraient en outre partager un résultat `prepareContentGrid()` entre la peinture Canvas et `ContentProjection.grid` ; cela maintient les tabulations, les emoji/ZWJ, la largeur CJK, l'arabe, le bidi, la source du presse-papiers et la géométrie de sélection sur le même plan retenu.

Pour les implémentations natives `Input`/`TextArea`, exposez `textInputStyle: { font, lineHeight, padding }` via `getA11yAttributes()`. La Scene l'applique à l'éditeur transparent avec `box-sizing: border-box`, tandis que le canvas devrait dessiner à partir du même padding et de la même ligne de base de boîte de ligne.

Remarques :

- Les projections sont **paresseuses vis-à-vis de la fenêtre et du clip** : le texte entièrement hors de la Scene ou d'un ancêtre `clipChildren` est en `display: none` et ne peut pas intercepter la saisie.
- Les projections dynamiques sont réordonnées pour correspondre à l'ordre source du VMT ; supprimer un sous-arbre supprime toutes les projections descendantes.
- Lorsque l'entité est également `interactive`, sa copie de texte est `aria-hidden` afin que les lecteurs d'écran ne l'annoncent pas deux fois.
- Désactivez toute la couche avec `new Scene(canvas, { contentProjection: false })` pour les scènes purement décoratives.
- La recherche du navigateur couvre le contenu matérialisé. Elle ne peut pas rechercher dans une entité virtualisée que l'application n'a pas montée.
- Les routeurs de raccourcis globaux doivent céder la place à la copie native lorsque `window.getSelection()?.isCollapsed === false` et ne doivent pas supprimer Ctrl/Command+F, sauf si l'application remplace intentionnellement la recherche du navigateur.

## L'option `debugA11y`

Activez `debugA11y: true` dans `SceneOptions` pour rendre les nœuds fantômes visibles pendant le développement — ils apparaissent avec un contour bleu en pointillés :

```typescript
const scene = new Scene(canvas, { debugA11y: true });
```

Ouvrez les DevTools du navigateur → Éléments et vous verrez les véritables éléments `<button>`, `<input>` et `<a>` positionnés au-dessus de votre canvas. C'est le moyen le plus rapide de vérifier que les rôles, les libellés et les positions sont corrects.

## `a11yFullViewport` — surfaces sans limites

Certaines entités couvrent toute la fenêtre de la Scene (un canvas infini, un détecteur de gestes, un piège à clics d'arrière-plan). Celles-ci n'ont pas de boîte englobante significative. Définissez `a11yFullViewport = true` pour projeter un nœud fantôme de la taille de la Scene qui suit la boîte CSS du canvas :

```typescript
class PanGesture extends Entity {
  constructor() {
    super();
    this.interactive = true;
    this.a11yFullViewport = true; // no width/height needed
  }

  getA11yAttributes() {
    return { role: 'application', label: 'Pan and zoom canvas' };
  }
}
```

Le nœud plein écran est monté **derrière** tous les autres nœuds fantômes, de sorte que tout composant au-dessus (boutons, entrées) reste cliquable.

## `a11ySyncInterval` — limitation pendant l'animation

Par défaut, le shadow DOM se synchronise à chaque image rendue. Pour les UI comportant beaucoup d'animation et de nombreuses entités interactives, la synchronisation peut dominer le temps d'image. Limitez-la :

```typescript
const scene = new Scene(canvas, { a11ySyncInterval: 100 });
// Shadow DOM is updated at most once per 100ms during animation
```

L'intervalle reste actif tant que l'animation s'exécute, et la Scene planifie une dernière mise à jour de rattrapage une fois le mouvement en attente stabilisé. Cela ne fige pas la couche sémantique pendant toute la durée de l'animation.

La limitation échange l'obsolescence contre le coût, et elle ne réduit pas le travail par synchronisation. Si votre problème est le _nombre_ d'entités plutôt que la fréquence de synchronisation, reportez-vous à la section suivante.

## Le coût augmente de manière superlinéaire avec le nombre d'entités interactives

La projection est bon marché pour une UI et coûteuse pour une foule. Mesuré sur du matériel réel (ordinateur portable RTX 4060, entités se déplaçant à chaque image, un élément projeté chacune) :

| entités interactives | Chrome par image | Firefox par image |
| -------------------- | ---------------- | ----------------- |
| 1 000                | 6,4 ms           | 7,4 ms            |
| 5 000                | 59,5 ms          | 114 ms            |
| 20 000               | 715 ms           | 2 737 ms          |

Par entité, cela passe de 6,4 à 35,7 µs sur Chrome et de 7,4 à 136,9 µs sur Firefox en allant de 1 000 à 20 000 — le coût par entité **s'aggrave** à mesure que le nombre augmente, car la dépense provient des écritures DOM par élément plus du tri par ordre de lecture plus de la reconstruction par le navigateur de son propre arbre d'accessibilité, qui se dégradent tous avec le nombre d'éléments. Le parcours de l'arbre lui-même est négligeable (~0,005 µs/entité).

La règle pratique : `interactive = true` est pour les choses sur lesquelles un utilisateur agit. Ce n'est pas un moyen de rendre des milliers d'objets décoratifs ou éphémères testables au pointage.

Pour un champ de particules, une couche danmaku ou un essaim de sprites, préférez l'une des solutions suivantes :

- **Projetez le conteneur, pas les membres.** Une seule entité interactive pour toute la couche, avec un `aria-label` la décrivant collectivement (« 5 000 particules »), et gérez vous-même l'entrée du pointeur via `scene.findEntityAt(x, y)` — qui résout les entités indépendamment du fait qu'elles soient `interactive`, donc le test de hit ne nécessite pas de projection.
- **Projetez seulement ce qui est accessible.** Le modèle de pooling utilisé par `TreeView`/`Table` virtualisés dimensionne un pool de zones réactives aux lignes visibles plutôt qu'à l'ensemble des données, donc la projection reste en O(viewport). Voir [widgets composites](#Widgets composites : un arrêt de tabulation, touches fléchées à l'intérieur).
- **Appelez `scene.detachA11y(entity)`** lorsqu'une entité cesse d'être actionnable. Documenté ailleurs comme une prévention de fuite, c'est également un levier de coût : la synchronisation par image crée et met à jour mais ne taille jamais.

> Un mode `a11yProjection` par entité (`'eager' | 'onDemand' | 'never'`) qui matérialise un nœud uniquement au survol/au focus est conçu mais **pas encore implémenté**. Notez qu'il ne peut pas se baser sur « un lecteur d'écran est-il présent » — c'est délibérément indétectable par conception (principe de conception 2.7 du W3C TAG), et les nœuds d'accessibilité virtuels AOM sont bloqués dans tous les moteurs pour des raisons de confidentialité.

## Inspecter l'arbre fantôme par programmation

```typescript
// Get a nested snapshot of all projected shadow nodes
const tree = scene.getA11yTree();
// Returns: A11yTreeNode[] — { id, tag, role, label, value, children, ... }

// Get the actual HTMLElement for a specific entity
const el = scene.getA11yElement(entity.id);
el?.focus(); // programmatically focus a shadow node
```

## Intégration Playwright

Comme chaque entité interactive projette un véritable élément DOM, les sélecteurs Playwright standard fonctionnent sans aucun adaptateur spécial :

```typescript
import { test, expect } from '@playwright/test';

test('toggle switches physics engine', async ({ page }) => {
  await page.goto('/demos/nexus');

  // Works because Toggle projects a <div role="switch" aria-label="Physics">
  const toggle = page.getByRole('switch', { name: 'Physics' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
});

test('search input filters results', async ({ page }) => {
  await page.goto('/');

  // Input projects a real <input type="text" placeholder="Search…">
  await page.getByPlaceholder('Search…').fill('spring');
  await expect(page.getByRole('option')).toHaveCount(3);
});

test('button is keyboard accessible', async ({ page }) => {
  await page.goto('/demos/chat');

  // Tab to the button, press Enter
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
});
```

### Sélectionner par `data-vecto-id`

Chaque nœud fantôme porte un attribut `data-vecto-id` égal à `entity.id`. Pour des sélecteurs stables qui survivent aux changements de texte de libellé :

```typescript
const entity = new Button('Submit');
entity.id = 'submit-btn'; // or set in constructor via super with id

// In Playwright:
await page.locator('[data-vecto-id="submit-btn"]').click();
```

## Liste de vérification pour les tests avec lecteur d'écran

- [ ] Chaque entité interactive a `interactive = true` et une boîte non nulle.
- [ ] `getA11yAttributes()` renvoie un `tag` et un `label` significatifs.
- [ ] `Input`/`TextArea` ont un `placeholder` (utilisé comme `aria-label`).
- [ ] L'état `checked` de `Checkbox`/`Toggle` est reflété en direct dans `getA11yAttributes()`.
- [ ] `Slider` a `valuemin`, `valuemax` et `value` définis à chaque rendu.
- [ ] Les groupes `Card` ont un `label` lorsqu'ils représentent une région logique.
- [ ] L'ordre de tabulation est raisonnable (les nœuds fantômes sont positionnés dans l'ordre du DOM, qui correspond à l'ordre d'ajout).
- [ ] Exécutez `scene.getA11yTree()` et inspectez la sortie pour détecter les libellés manquants.
- [ ] Activez `debugA11y: true` et vérifiez visuellement que les positions des nœuds correspondent aux composants du canvas.

## Dépannage

### La position du nœud fantôme est décalée par rapport au composant canvas

Deux causes fréquentes :

1. **Le parent du canvas n'est pas en `position: relative`** — la `Scene` le définit automatiquement à chaque image, mais une règle CSS de spécificité supérieure forçant `position: static` l'écrasera. Vérifiez le style calculé sur l'élément parent du canvas.
2. **Un `transform` CSS sur le parent du canvas** — le positionnement absolu des nœuds fantômes est relatif à l'ancêtre positionné le plus proche, mais `transform` crée un nouveau contexte d'empilement qui peut provoquer des décalages. Déplacez le `transform` sur l'élément canvas lui-même, et non sur le parent.

Si vous utilisiez auparavant `a11yOffsetX` / `a11yOffsetY` comme contournement, supprimez-les et corrigez plutôt le problème de positionnement sous-jacent.

### `getByRole()` de Playwright ne trouve rien

Vérifiez les points suivants :

1. `entity.interactive` doit être `true` et `entity.width > 0`.
2. `getA11yAttributes()` doit renvoyer le bon `tag` et le bon `role`. Pour que `page.getByRole('button')` fonctionne, le tag doit être `'button'` ou le rôle doit être `'button'`.
3. Le libellé doit correspondre : `page.getByRole('button', { name: 'Submit' })` requiert `label: 'Submit'` dans les attributs.
4. La scène doit avoir appelé `start()` — la synchronisation a11y se produit pendant la boucle de rendu.

Utilisez `scene.getA11yTree()` pour imprimer un instantané de ce qui est actuellement projeté :

```typescript
console.log(JSON.stringify(scene.getA11yTree(), null, 2));
```

### `scene.getA11yTree()` renvoie un tableau vide

L'arbre a11y n'est peuplé qu'après que `scene.start()` a exécuté au moins une image. Si vous appelez `getA11yTree()` de manière synchrone après la construction, il sera vide. Enveloppez-le dans un `setTimeout` ou vérifiez après une interaction utilisateur.

Vérifiez également que `entity.interactive = true` est défini — les entités sans `interactive` ne sont jamais projetées.

> **Suivant :** [Composants UI](/learn/ui-components/) — la suite complète de composants interactifs prêts à l'emploi.
