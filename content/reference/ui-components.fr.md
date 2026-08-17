+++
title = "Référence des composants @vectojs/ui"
description = "Référence complète de tous les composants @vectojs/ui : conteneurs de mise en page, contrôles de formulaire, superpositions et contenu enrichi."
weight = 11
+++

# `@vectojs/ui` — Référence des composants

> Composants réutilisables de haut niveau pour le moteur Canvas zero-DOM VectoJS.
> Version documentée : **2.18.0**. Source de vérité : `dist/index.d.ts` (surface publique) et `packages/ui/src/*` (comportement).

Chaque composant est une feuille ou un conteneur dans l'Arbre Mathématique Virtuel (VMT). Rien ici n'est du vrai DOM — les composants se dessinent eux-mêmes sur un Canvas via un `IRenderer`. L'accessibilité, l'automatisation par agent et la crawlabilité proviennent d'un **A11y Shadow DOM** parallèle : lorsqu'un composant est `interactive`, la `Scene` projette un seul nœud DOM réel caché et transparent positionné au-dessus de la boîte du composant, construit à partir de `getA11yAttributes()`. C'est pourquoi `page.getByRole('button', { name })` / `fill()` / les lecteurs d'écran fonctionnent sur une UI pure-Canvas.

Les surfaces d'application ne contenant que du texte peuvent importer `Text` depuis `@vectojs/ui/text`. Cette entrée légère exclut Markdown et `@vectojs/tex` du graphe de démarrage ; utilisez l'entrée racine `@vectojs/ui` lorsque vous composez plusieurs familles de composants.

## Galerie de composants live

La galerie ci-dessous est maintenant un test de smoke au niveau du paquet. Pour le débogage quotidien, utilisez les pages de composants ciblées afin qu'un comportement puisse être inspecté sans faire défiler tous les composants :

| Domaine                         | Pages des composants                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Texte & média                   | [`Text`](/reference/ui-text/), [`RichText`](/reference/ui-richtext/), [`Link`](/reference/ui-link/), [`Image`](/reference/ui-image/)                                                                                                                                                                                                                                                 |
| Conteneurs de mise en page      | [`Card`](/reference/ui-card/), [`Stack`](/reference/ui-stack/), [`Flow`](/reference/ui-flow/), [`ScrollView`](/reference/ui-scrollview/), [`VirtualList`](/reference/ui-virtuallist/), [`TreeView`](/reference/ui-treeview/), [`Panneaux redimensionnables`](/reference/ui-resizable-panel/)                                                                                         |
| Contrôles & formulaires         | [`Button`](/reference/ui-button/), [`Input`](/reference/ui-input/), [`TextArea`](/reference/ui-textarea/), [`Checkbox`](/reference/ui-checkbox/), [`Toggle`](/reference/ui-toggle/), [`Slider`](/reference/ui-slider/), [`Dropdown`](/reference/ui-dropdown/), [`RadioGroup`](/reference/ui-radiogroup/), [`Tabs`](/reference/ui-tabs/), [`ProgressBar`](/reference/ui-progressbar/) |
| Contenu enrichi                 | [`Markdown`](/reference/ui-markdown/), [`CodeBlock`](/reference/ui-codeblock/), [`Table`](/reference/ui-table/)                                                                                                                                                                                                                                                                      |
| Superpositions & UI transitoire | [`Overlay`](/reference/ui-overlay/), [`Tooltip`](/reference/ui-tooltip/), [`Popover`](/reference/ui-popover/), [`ContextMenu`](/reference/ui-contextmenu/), [`Modal`](/reference/ui-modal/)                                                                                                                                                                                          |

<figure class=\"sandbox component-gallery\">
  <div class=\"sandbox-bar\"><span class=\"dot\"></span><span class=\"dot\"></span><span class=\"dot\"></span><span class=\"sandbox-label\">live · @vectojs/ui 2.0.0 · scroll inside</span></div>
  <iframe src=\"/sandbox/ui-components.html\" class=\"sandbox-frame component-gallery-frame\" loading=\"eager\" title=\"Galerie interactive de tous les composants UI VectoJS\" sandbox=\"allow-scripts allow-same-origin allow-popups\"></iframe>
  <figcaption>Galerie de smoke au niveau du paquet : couverture large d'abord, pages de composants ciblées lors du débogage d'un comportement spécifique.</figcaption>
</figure>

## Conventions partagées par tous les composants

Tous les composants étendent `UIComponent`, qui étend l'`Entity` de base. Les membres hérités suivants sont utilisés en permanence et ne sont **pas** répétés par composant ci-dessous.

| Membre              | Signature                                          | Notes                                                                                                                                                                                                                             |
| ------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setPosition`       | `setPosition(x, y): this`                          | Placement dans l'espace local ; chaînable.                                                                                                                                                                                        |
| `add` / `remove`    | `add(child: Entity): this` / `remove(child): this` | Gestion des enfants (les conteneurs surchargent `add` pour refaire la mise en page).                                                                                                                                              |
| `on` / `off`        | `on(event, cb, { capture? }): this`                | Capture+bouillonnement type DOM. Événements : `click hover pointerdown pointerup pointercancel pointermove pointerleave change focus blur wheel keydown keyup`.                                                                   |
| `emit`              | `emit(event, payload): void`                       | Distribution directe auto-seule (pas de propagation dans l'arbre).                                                                                                                                                                |
| `getGlobalPosition` | `getGlobalPosition(): Point`                       | Position dans l'espace monde accumulant les transformations des ancêtres.                                                                                                                                                         |
| `scene`             | `get scene`                                        | `Scene` attachée la plus proche ; utilisez `this.scene?.markDirty()` pour demander un repeint dans les scènes `onDemand`.                                                                                                         |
| `interactive`       | `interactive: boolean`                             | Quand vrai, le composant projette un nœud d'ombre A11y et reçoit les événements de pointeur/clavier.                                                                                                                              |
| `clipChildren`      | `clipChildren: boolean`                            | Limite le dessin normal des enfants à la boîte locale. Canvas/SVG sont exacts ; Three utilise un ciseau AABB pour les clips pivotés/cisaillés. Les couches GPU point/WebGPU overlay ne participent pas. Utilisé par `ScrollView`. |
| `width` / `height`  | `number`                                           | La boîte du composant ; pilote le hit-testing et le culling de la fenêtre.                                                                                                                                                        |
| `padding`           | `number`                                           | Remplissage intérieur (par défaut `0`) ; les composants de type boîte le définissent plus haut par défaut.                                                                                                                        |
| transformations     | `x y scaleX scaleY rotation opacity`               | Les transformations affines et l'opacité multiplicative sont héritées par les enfants.                                                                                                                                            |
| `animate`           | `animate(targetProps, durationMs): this`           | Met en file d'attente des interpolations numériques.                                                                                                                                                                              |

---

## `UIComponent` (base abstraite)

```ts
abstract class UIComponent extends Entity {
  padding: number; // défaut 0
  isPointInside(globalX: number, globalY: number): boolean;
  getBounds(): Bounds; // { x:0, y:0, width, height }

  // Aide d'entrée/sortie de présence
  protected enterMotion?: MotionSpec; // joué au montage
  protected exitMotion?: MotionSpec; // joué par dismiss()
  dismiss(): Promise<void>; // joue exitMotion, puis supprime de l'arbre
}
```

Centralise le modèle de boîte + hit-test aligné sur les axes (AABB) partagé par tous les composants. `isPointInside` renvoie si le point se trouve dans `[0,width] × [0,height]` dans l'espace local. `getBounds()` renvoie la boîte locale pour que la `Scene` puisse faire du viewport-culling. Les sous-classes définissent `width`/`height` à partir du contenu mesuré, implémentent `render(r)`, et (quand interactif) surchargent `getA11yAttributes()`.

**Présence :** déclarez `enterMotion` / `exitMotion` comme `MotionSpec` (`{ props: { opacity: [0, 1], … }, config? }`) et le composant s'anime à l'entrée lorsqu'il est monté sur une scène active et à la sortie sur `dismiss()` — qui retarde sa propre suppression jusqu'à la résolution de l'animation de sortie. Une implémentation partagée sur le [système d'animation de base](/reference/core-entity/#animation), remplaçant les ressorts faits main par composant. Les animations sont supprimées sous `prefers-reduced-motion` (les fondus d'opacité sont conservés).

### `getA11yAttributes(): A11yAttributes`

Le hook que chaque composant interactif surcharge. La forme renvoyée (depuis `@vectojs/core`) pilote le nœud d'ombre projeté :

```ts
interface A11yAttributes {
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea'; // défaut 'div'
  role?: string; // rôle ARIA
  label?: string; // aria-label / nom accessible
  href?: string; // tag 'a'
  src?: string;
  alt?: string; // tag 'img'
  inputType?: string;
  placeholder?: string;
  value?: string; // tag 'input'
  checked?: boolean; // input.checked ou aria-checked, rafraîchi chaque trame
  disabled?: boolean;
  expanded?: boolean;
  controls?: string;
  haspopup?: string;
  selected?: boolean;
  activedescendant?: string;
  valuemin?: string;
  valuemax?: string;
  tabIndex?: number; // tabindex tournant pour les enfants de widget composite
  pointerEvents?: 'auto' | 'none'; // 'none' quand quelque chose en dessous possède la souris
  labelledby?: string;
  describedby?: string; // aria-describedby — texte dʼindice/erreur
  required?: boolean;
  invalid?: boolean; // état de validation
  level?: number; // aria-level (éléments dʼarbre, titres)
  ariaModal?: 'true' | 'false';
  live?: 'off' | 'polite' | 'assertive';
  atomic?: boolean;
  relevant?: string; // contrôles de région en direct
  // (voir aussi `target`, `textInputStyle` — référence complète)
}
```

Chaque champ est projeté vers un vrai attribut chaque trame avec une vérification dirty ;
retourner `undefined` le **supprime**. La liste complète et les patrons de clavier des widgets composites se trouvent dans
[a11yRoot et le contrat agent](/reference/core-a11y/).

---

## Texte & typographie

### `Text`

```ts
new Text(text: string, opts?: TextOptions)

interface TextOptions {
  font?: string;                  // défaut '16px sans-serif'
  color?: string;                 // défaut '#e2e8f0'
  maxWidth?: number;              // largeur de coupure ; omis → seul le '\\n' explicite coupe les lignes
  lineHeight?: number;            // avance de ligne en px, défaut 20
  preserveLeadingSpaces?: boolean;// défaut false
  selectable?: boolean;           // sélection native par glissement du navigateur, défaut true
  textAlign?: 'left' | 'justify'; // default 'left'
  hyphenate?: (word: string) => string[]; // word → parts, for mid-word breaks with a visible '-'
}
```

Texte multi-lignes dessiné avec `fillText` natif. Le retour à la ligne/la mesure passent par le `LayoutEngine` de base (même chemin `Intl.Segmenter` que `TextEntity`) avec une **séparation cold/hot** :

- `setText(text): this` — passe cold (re-segmentation + re-mesure), puis re-mise en page.
- `append(text): this` — chemin streaming/machine à écrire ; équivaut à `setText(this.text + text)` mais le mémo de paragraphe du moteur réutilise les paragraphes de tête non modifiés, donc seul le dernier paragraphe changé est re-mesuré.
- `setMaxWidth(maxWidth): this` — chemin **hot** ; ré-encapsule seulement le texte mesuré en cache (pas de re-segmentation). Préférez ceci pour le réajustement responsive.
- `setSelectable(selectable): this` — active ou désactive la surface de sélection native projetée.
- `setTextAlign(align: 'left' | 'justify'): this` — re-justifie sur place.

`textAlign: 'justify'` (avec `hyphenate` optionnel) est respecté par les passages `fillText()` fusionnés ; les traits d'union souples (U+00AD) de la source se coupent sans césureur.

La projection de contenu reflète les sauts de ligne visuels et la hauteur de ligne pour la recherche, la sélection et la copie du navigateur. Le texte statique n'est pas une cible de hit interactive ; Canvas/VMT possède toujours ses pixels et sa mise en page.

### `RichText`

```ts
new RichText(spans: StyledSpan[], opts?: RichTextOptions)

interface RichTextOptions {
  font?: string;                          // écriture abrégée de base, défaut '16px sans-serif'
  color?: string;                         // remplissage par défaut, défaut '#e2e8f0'
  maxWidth?: number;                      // largeur de coupure
  baseStyle?: TextStyle;                  // hérité par chaque segment (le style du segment l'emporte toujours)
  linkColor?: string;                     // défaut '#38bdf8' pour les segments de lien sans couleur propre
  onLinkClick?: (href: string) => void;   // déclenché quand un segment de lien est activé
  exclusions?: ExclusionRect[];           // rectangles autour desquels le texte s'écoule (formes d'exclusion / flotteurs)
  selectable?: boolean;                   // sélection native par glissement du navigateur, défaut true
  textAlign?: 'left' | 'justify';         // default 'left'
  hyphenate?: (word: string) => string[]; // word → parts, for mid-word breaks
}
```

Texte en ligne multi-style : segments gras / italique / colorés / de tailles différentes qui s'écoulent et se coupent sur des lignes de base communes. La mise en page utilise le `LayoutEngine.prepareRich` de base ; chaque glyphe se dessine avec la couleur/le poids/l'inclinaison de son segment.

- `setSpans(spans): this` — remplace les segments et refait la mise en page.
- `appendSpans(spans): this` — chemin **streaming** ; le mémo de paragraphe riche réutilise les paragraphes de tête non modifiés, donc un flux de tokens se re-prépare en O(paragraphe changé), pas en O(document).
- `setMaxWidth(maxWidth): this` — réorganisation.
- `setExclusions(exclusions): this` — définit les régions flottantes et réorganise.
- `setTextAlign(align: 'left' | 'justify'): this` — re-justifie sur place.
- `setSelectable(selectable): this` — bascule la sélection native sans reconstruire les segments.

**Objets en ligne (2.6.0+).** Un segment peut réserver un espace horizontal pour quelque chose que `RichText` ne met pas en forme — une formule, une icône, une boîte intégrée — de sorte qu'il se trouve au milieu d'une phrase au lieu de créer un saut de ligne :

```ts
import { OBJECT_REPLACEMENT, type StyledSpan } from '@vectojs/layout';

const spans: StyledSpan[] = [
  { text: 'the identity ' },
  {
    text: OBJECT_REPLACEMENT, // U+FFFC; requis, sinon `object` est ignoré
    object: {
      width: 42, // avance à réserver, en px à la taille finale
      height: 20, // montée + descente ; alimente la hauteur de ligne
      depth: 4, // distance à laquelle il pend sous la ligne de base
      alt: 'x+1', // nom accessible, texte de sélection et de copie
      paint: (surface, box) => surface.drawImage(bitmap, box.x, box.y, box.width, box.height),
    },
  },
  { text: ' holds.' },
];
```

Les métriques sont en px à la taille finale — une boîte fixe, non redimensionnée par le `fontSize` du segment. `box.y` est déjà résolu par rapport à la ligne de base et à la `depth`, donc un painter n'a pas à répéter cette arithmétique. `paint` est appelé lors d'un dessin, il doit donc être synchrone ; un objet encore en train de charger son contenu ne doit rien dessiner et demander un nouveau dessin lorsqu'il est prêt. **Omettre `paint` réserve l'espace et ne dessine rien** — un espace vide. Définissez `alt`, sinon la sentinelle brute atteint la couche d'accessibilité et se copie comme un caractère invisible.

A11y : chaque **segment de lien** contigu obtient un enfant `<a>` transparent comme point d'accès (réconcilié après ré-encapsulation — un point d'accès par segment ; la position se met à jour sur place, seul un changement du _nombre_ de liens reconstruit les nœuds d'ombre). Le nom accessible du composant lui-même est le texte complet concaténé.

### `measureText`, `wrapLines`, `wrapText` (fonctions libres)

```ts
measureText(text: string, font: string): number
```

Largeur pixel rendue dans une police CSS, mémoïsée via un LRU borné (capacité 1000). L'arabe est mis en forme avant la mesure. Se replie sur une estimation de `0.5em` par caractère sans DOM.

```ts
wrapLines(text: string, font: string, maxWidth: number): string[]
```

Césure gourmande respectant les `\\n` explicites. Les mots trop longs obtiennent leur propre ligne (non coupée).

```ts
wrapText(value: string, maxWidth: number, measure: (s: string) => number): WrappedLine[]

interface WrappedLine { text: string; start: number; end: number; }  // plage de caractères absolue
```

Comme `wrapLines` mais suit la plage de caractères absolue de chaque ligne (afin qu'un décalage de caret linéaire corresponde à `(ligne, x)`), consomme les `\\n` explicites (un saut de ligne final produit une ligne vide finale sur laquelle le caret peut se positionner), et coupe un mot unique trop long au niveau du caractère. Utilisé en interne par `TextArea`.

---

## Conteneurs de mise en page

### `Stack`

```ts
new Stack(opts?: StackOptions)

interface StackOptions {
  direction?: 'vertical' | 'horizontal';  // défaut 'vertical'
  gap?: number;                            // défaut 0
  align?: 'start' | 'center' | 'end';      // axe transversal, défaut 'start'
  wrap?: boolean;                          // défaut false
  maxWidth?: number;                       // seuil de coupure sur l'axe principal (horizontal) ; défaut Infinity
  maxHeight?: number;                      // seuil de coupure sur l'axe principal (vertical) ; défaut Infinity
}
```

Positionne les enfants séquentiellement le long de l'axe principal avec `gap`, en alignant sur l'axe transversal. Les enfants conservent leurs propres tailles — seuls `x`/`y` sont définis. Ne dessine rien lui-même.

- `add(child): this` — ajoute et **ré-exécute `layout()`** immédiatement.
- `layout(): void` — positionne tous les enfants et dimensionne le conteneur pour qu'il s'ajuste (afin de pouvoir être éliminé par culling). À appeler manuellement après avoir muté les enfants en dehors de `add` (par exemple en redimensionnant un enfant).

Quand `wrap` est vrai, les enfants qui dépasseraient `maxWidth`/`maxHeight` sur l'axe principal commencent une nouvelle ligne ; le conteneur grandit sur l'axe transversal.

```ts
const col = new Stack({ direction: 'vertical', gap: 12 });
col.add(new Text('Title'));
col.add(new Button('Go'));
scene.add(col.setPosition(40, 40));
```

### `Flow`

```ts
new Flow(opts?: FlowOptions)

interface FlowOptions extends Omit<StackOptions, 'direction' | 'wrap'> {
  direction?: 'horizontal';
}
```

Un `Stack` pré-configuré comme `{ direction: 'horizontal', wrap: true }` — éléments horizontaux qui passent à la ligne suivante au-delà de `maxWidth`. Utilisez-le pour les nuages de tags, les rangées de chips. Hérite de `add()`/`layout()`.

### `Card`

```ts
new Card(opts: CardOptions)

interface CardOptions {
  width: number;          // requis
  height: number;         // requis
  bg?: string;            // défaut '#0f172a'
  border?: string;        // omettre → pas de bordure
  borderWidth?: number;   // défaut 1
  radius?: number;        // défaut 12
  padding?: number;       // défaut 0 (les consommateurs positionnent les enfants manuellement)
  label?: string;         // quand défini → interactif + role=\"group\" landmark
  onClick?: (event: unknown) => void; // exige label ; rend toute la Card cliquable
}
```

Un panneau d'arrière-plan arrondi avec bordure optionnelle. Ajoutez des enfants via `add()` ; ils sont rendus par-dessus dans l'espace local de la carte. **Décoratif par défaut** (pas de nœud d'ombre, pas interactif). Passer `label` le rend interactif et projette `{ role: 'group', label }` pour que les technologies d'assistance/agents puissent trouver la région. `padding` est uniquement informatif — il n'insère pas automatiquement les enfants.

`setContent(content, fit = true)` héberge une seule entité de contenu et maintient par défaut sa largeur et sa hauteur alignées sur la Card. Passez `false` ou `{ width?, height? }` pour désactiver le suivi par axe. `onClick` exige `label`, ce qui évite une région interactive sans nom dans l'arbre a11y.

---

## Contrôles & formulaires

Tous les contrôles de formulaire ci-dessous sont `interactive` et projettent un vrai nœud d'ombre ; le canvas est un miroir visuel piloté par les événements natifs du nœud d'ombre.

### `Button`

```ts
new Button(label: string, opts?: ButtonOptions)

interface ButtonOptions {
  onClick?: (e: unknown) => void;  // se déclenche POUR le hit-test canvas ET le clic sur le <button> d'ombre
  bg?: string;                     // défaut '#2563eb'
  hoverBg?: string;                // défaut '#3b82f6'
  color?: string;                  // couleur du libellé, défaut '#ffffff'
  font?: string;                   // défaut '600 16px sans-serif'
  padding?: number;                // défaut 12
  radius?: number;                 // défaut 8
  focusColor?: string;             // focus-ring color (2.7.0+), default '#00f0ff'
  disabled?: boolean;              // start disabled: drawn muted, projects `disabled`, no onClick
}
```

Rectangle arrondi avec un libellé centré. `width` s'auto-dimensionne à `measureText(label, font) + 2·padding` ; `height` à `fontSizePx(font) + 2·padding` (la taille px analysée depuis `font`, pas la largeur mesurée du libellé). Projette `{ tag: 'button', role: 'button', label }` → piloté par `getByRole('button', { name })`. État public : `focused` (dessine un anneau de focus de 2px dans `focusColor`), `hovered` interne (passe à `hoverBg`). **Définissez `focusColor` sur un thème clair ou chaud** (2.7.0+) — le cyan par défaut est réglé pour la palette sombre par défaut et semble hors de la marque ailleurs, et un anneau de focus est la seule affordance dont un utilisateur clavier ne peut pas se passer. En mode couleurs forcées, l'anneau utilise toujours la couleur système `Highlight` à la place.

### `Link`

```ts
new Link(label: string, opts: LinkOptions)   // opts requis (href)

interface LinkOptions {
  href: string;          // requis ; cible de navigation + ombre <a href>
  color?: string;        // défaut '#38bdf8'
  font?: string;         // défaut '16px sans-serif'
  underline?: boolean;   // défaut true
}
```

Texte coloré (optionnellement souligné). S'auto-dimensionne au libellé. Projette un vrai nœud d'ombre `{ tag: 'a', href, label }` (cliquable/crawable nativement). Le chemin de hit-test canvas ouvre via `window.open(href, '_blank', 'noopener')`.

### `Image`

```ts
new Image(src: string, opts: ImageOptions)

interface ImageOptions {
  width: number;                // requis (le canvas a besoin d'une boîte connue pour la mise en page/le culling)
  height: number;               // requis
  fit?: ImageFit;               // 'fill' | 'cover' | 'contain', défaut 'fill' (2.18.0+)
  focalPoint?: ImageFocalPoint; // { x, y } chacun 0..1 ; consulté par 'cover', défaut { x: 0.5, y: 0.5 } (2.18.0+)
  alt?: string;                 // défaut ''
  placeholder?: string;         // remplissage jusqu'au chargement, défaut '#1e293b'
  radius?: number;              // rayon des coins sur le placeholder ET le bitmap chargé, défaut 0
  onLoad?: () => void;          // déclenché une fois le bitmap chargé
}

type ImageFit = 'fill' | 'cover' | 'contain';
interface ImageFocalPoint { x: number; y: number; }
```

Dessine via `drawImage` ; projette `{ tag: 'img', src, alt, label: alt }`. Le chargement est asynchrone — une boîte de remplacement est dessinée jusqu'à ce qu'il soit prêt. Dans les scènes `onDemand`, passez `onLoad: () => scene.markDirty()` pour repeindre au chargement. (Occulte `globalThis.Image` ; référencez la classe comme `import { Image } from '@vectojs/ui'`.)

`fit` (2.18.0+) mappe le bitmap chargé dans la boîte : `'fill'` (défaut) l'étire vers la boîte, `'cover'` préserve le ratio d'aspect et remplit la boîte en recadrant le débordement autour de `focalPoint`, et `'contain'` ajuste tout le bitmap dans la boîte avec le ratio d'aspect préservé. `focalPoint` est un point normalisé `{ x, y }` (`0` = haut/gauche, `1` = bas/droite, limité à `[0, 1]`), lu uniquement par `'cover'`. `radius` découpe maintenant les coins arrondis sur le bitmap chargé, pas seulement sur le placeholder.

```ts
const avatar = new Image('/avatar.jpg', {
  width: 96,
  height: 96,
  fit: 'cover',
  focalPoint: { x: 0.5, y: 0.25 }, // garde le visage du sujet, près du haut
  radius: 48, // recadre le bitmap chargé en cercle
});
```

### `Input`

```ts
new Input(opts: InputOptions)

interface InputOptions {
  width: number;             // requis
  height?: number;           // défaut 40
  placeholder?: string;
  value?: string;            // défaut ''
  font?: string;             // défaut '16px sans-serif'
  color?: string;            // défaut '#e2e8f0'
  placeholderColor?: string; // défaut '#64748b'
  bg?: string;               // défaut '#0f172a'
  border?: string;           // défaut '#334155'
  selectionColor?: string;   // défaut 'rgba(56, 189, 248, 0.35)'
  radius?: number;           // défaut 6
  padding?: number;          // défaut 10
  onChange?: (value: string) => void;
}
```

Champ monoligne adossé à un **vrai `<input>` transparent comme nœud d'ombre**. Le navigateur gère toute la saisie — clics, clavier, **composition IME**, sélection, presse-papiers, annulation — nativement sur cet élément ; le canvas ne fait que dessiner. La `Scene` reflète l'état via un événement `change` dont la charge utile contient `value`, `selectionStart`, `selectionEnd` et `composition`. Le composant ré-expose ceux-ci comme champs publics :

- `value: string`, `focused: boolean` (pilote le clignotement du caret à 500 ms).
- `selectionStart` / `selectionEnd: number` — décalages du caret/sélection reflétés depuis le vrai input.
- `composition: { start; length } | null` — plage de pré-édition IME active (dessinée comme un soulignement).

A11y : `{ tag: 'input', inputType: 'text', placeholder, value, label: placeholder }`. Les agents le `fill()` par rôle ; les humains tapent en CJK ; le canvas rend le caret, le surlignage de sélection, le soulignement IME et le défilement vers le caret (`scrollLeft`). Gère les plages RTL (hébreu/arabe) via le moteur de mise en page.

### `TextArea`

```ts
new TextArea(opts: TextAreaOptions)

interface TextAreaOptions {
  width: number;             // requis
  height?: number;           // défaut 120
  placeholder?: string;
  value?: string;            // défaut ''
  font?: string;             // défaut '16px sans-serif'
  lineHeight?: number;       // multiple de la taille de police, défaut 1.4
  color?: string;            // défaut '#e2e8f0'
  placeholderColor?: string; // défaut '#64748b'
  bg?: string;               // défaut '#0f172a'
  border?: string;           // défaut '#334155'
  selectionColor?: string;   // défaut 'rgba(56, 189, 248, 0.35)'
  radius?: number;           // défaut 6
  padding?: number;          // défaut 10
  onChange?: (value: string) => void;
}
```

Champ multi-lignes adossé à un **vrai `<textarea>` transparent comme nœud d'ombre** — même modèle miroir que `Input` plus la navigation multi-lignes. Le canvas ré-encapsule la valeur (via `wrapText`) et dessine le texte, la sélection et le caret. Les champs publics reflètent `Input` : `value`, `focused`, `selectionStart`, `selectionEnd`, `composition`. `lineHeightFactor` contient l'option `lineHeight`.

- `lineOfOffset(offset: number): number` — index de ligne visuelle (encapsulée) contenant un décalage de caractère linéaire ; les décalages limites se résolvent à la première ligne contenante, les hors-limites à la dernière. Utile pour mapper la position du caret à une ligne.

A11y : projette un nœud d'ombre `textarea` ; les agents le `fill()`, les humains tapent en CJK, le rendu reste zero-DOM. Le défilement vertical vers le caret maintient la ligne active visible (`scrollTop`).

### `Checkbox`

```ts
new Checkbox(opts: CheckboxOptions)

interface CheckboxOptions {
  checked?: boolean;   // défaut false
  label?: string;      // dessiné à droite ; utilisé comme nom accessible
  size?: number;       // taille de la case en px, défaut 20
  font?: string;       // défaut '16px sans-serif'
  color?: string;      // couleur du libellé, défaut '#e2e8f0'
  accent?: string;     // remplissage coché, défaut '#2563eb'
  border?: string;     // bordure non cochée, défaut '#475569'
  onChange?: (checked: boolean) => void;
}
```

Adossé à un vrai `<input type=\"checkbox\">` comme nœud d'ombre — basculable nativement par les agents/technologies d'assistance. Un `click` sur le canvas et le `change` natif du nœud d'ombre passent tous deux par un seul setter avec garde (pas de `onChange` en double pour une valeur inchangée). Public : `checked`. A11y : `{ tag: 'input', inputType: 'checkbox', checked, label }`.

### `Toggle`

```ts
new Toggle(opts: ToggleOptions)

interface ToggleOptions {
  checked?: boolean;   // défaut false
  label?: string;      // dessiné à droite ; utilisé comme nom accessible
  width?: number;      // largeur de la piste en px, défaut 44 (exposé comme trackW)
  height?: number;     // hauteur de la piste en px, défaut 24 (exposé comme trackH)
  font?: string;       // défaut '16px sans-serif'
  color?: string;      // couleur du libellé, défaut '#e2e8f0'
  accent?: string;     // remplissage de la piste à l'état actif, défaut '#2563eb'
  track?: string;      // remplissage de la piste à l'état inactif, défaut '#475569'
  onChange?: (checked: boolean) => void;
}
```

Commutateur style iOS projetant `{ role: 'switch', checked, label }` avec `aria-checked`. Parce que `role=\"switch\"` est une `div` (pas de changement natif transmis par la `Scene`), `click` ré-émet un événement `change` sur lui-même ; le gestionnaire `change` unique est la source de vérité, donc les deux écouteurs externes `on('change', …)` et le callback `onChange` se déclenchent. Public : `checked`, `trackW`, `trackH`.

### `Slider`

```ts
new Slider(props?: SliderProps)   // props est faiblement typé (any) dans le .d.ts

// Props reconnus (lus dans le constructeur) :
{
  min?: number;            // défaut 0
  max?: number;            // défaut 100
  value?: number;          // défaut = min
  width?: number;          // défaut 200
  height?: number;         // défaut 24
  step?: number;           // défaut 1 — granularité de la valeur pour le pointeur et le clavier
  trackColor?: string;     // défaut 'rgba(255, 255, 255, 0.15)'
  progressColor?: string;  // défaut '#00f0ff'
  handleColor?: string;    // défaut '#fff'
  focusColor?: string;     // focus-ring color (2.7.0+), default '#00f0ff'
}
```

Curseur horizontal avec un pouce circulaire. Public : `min`, `max`, `value`, `step`. Le glissement (`pointerdown` → `pointermove` → `pointerup`) mappe `localX` du pointeur à une valeur, **arrêtée sur la grille de `step` ancrée à `min`** (paliers entiers par défaut, correspondant à la sémantique de `input[type=range]`), et émet un événement `change` avec `{ value }` (abonnez-vous via `on('change', e => e.value)`). Clavier : `ArrowRight`/`ArrowUp` augmentent, `ArrowLeft`/`ArrowDown` diminuent, `Home`/`End` sautent à `min`/`max`. Le `focused` public suit le focus clavier et dessine un anneau de 2px dans `focusColor` autour du curseur (2.7.0+ ; avant cette version, le slider ne dessinait **aucun indicateur de focus** malgré son opérabilité clavier — WCAG 2.4.7). A11y : `{ role: 'slider', value, valuemin, valuemax }`. Les anciennes versions pré-1.0 avaient des valeurs entières seulement et pas de gestion clavier.

### `Dropdown`

```ts
new Dropdown(options: string[], props?: DropdownProps)  // props faiblement typé (any)

// Props reconnus :
{
  value?: string;   // sélection initiale ; défaut = options[0]
  width?: number;   // défaut 120
  height?: number;  // défaut 36
  bg?: string;      // fond du déclencheur fermé, défaut 'rgba(30, 41, 59, 0.85)'
  color?: string;   // défaut '#fff'
  radius?: number;  // défaut 8
  font?: string;    // défaut '14px sans-serif'

  // Open-menu theming (2.7.0+) — see the note below
  menuBg?: string;           // option row bg, default 'rgba(15, 23, 42, 0.95)'
  menuColor?: string;        // option row text, default '#fff'
  menuSelectedBg?: string;   // selected row, default 'rgba(0, 240, 255, 0.25)'
  menuHighlightBg?: string;  // keyboard-highlighted row, default 'rgba(0, 240, 255, 0.4)'
  focusColor?: string;       // focus ring, trigger + rows, default '#00f0ff'
}
```

Une boîte combo : un `Button` affiche la valeur courante ; cliquer (ou `ArrowDown`/`ArrowUp`/`Enter`/`Space`) ouvre un menu `Stack` d'options `Button` plus un fond d'écran transparent plein écran, tous deux montés via `scene.showOverlay(...)`. `Escape` ou un clic sur le fond d'écran ferme via `scene.hideOverlay(...)`. La sélection émet un événement `change` avec `{ value }`. La navigation clavier suit un index surligné ; `activedescendant` et les ids d'option (`${id}-opt-${i}`) sont câblés pour ARIA.

A11y sur la racine : `{ role: 'combobox', expanded, controls, haspopup: 'listbox', value, activedescendant }`. Le menu projette `role="listbox"`, chaque option `role="option"` avec `selected`.

**Thématisez le menu ouvert, pas seulement le déclencheur** (2.7.0+). Avant ces props, le `bg`/`color` du déclencheur était surchargeable mais les couleurs du menu étaient codées en dur, donc une liste déroulante thématisée pour une palette claire ou chaude ouvrait un panneau ardoise sombre avec une sélection cyan — ce qui ressemble à un bug de rendu plutôt qu'à un style. Notez que `menuHighlightBg` et `menuSelectedBg` peuvent s'appliquer en même temps, et ouvrir le menu surligne la ligne sélectionnée, donc faites en sorte que le surlignage se lise comme le plus fort des deux. Les lignes d'option sont elles-mêmes focusables (`role="option"`), donc l'anneau `focusColor` est dessiné _sur_ une ligne surlignée : gardez assez de contraste entre l'anneau et `menuHighlightBg` pour dépasser le seuil non textuel de 3:1 (WCAG SC 1.4.11).

---

## Superpositions

### `Modal`

```ts
new Modal(title: string, props?: ModalProps)  // props faiblement typé (any)

// Props reconnus :
{
  width?: number;       // fond d'écran, défaut window.innerWidth (repli 800)
  height?: number;      // fond d'écran, défaut window.innerHeight (repli 600)
  backdropColor?: string; // défaut 'rgba(0, 0, 0, 0.5)'
  modalWidth?: number;  // carte centrale, défaut 400
  modalHeight?: number; // défaut 250
  cardBg?: string;      // défaut 'rgba(15, 23, 42, 0.95)'
  cardBorder?: string;  // défaut 'rgba(255, 255, 255, 0.15)'
}
```

Un fond d'écran assombrissant plein écran avec une `Card` centrée contenant le texte `title` et un bouton \"Fermer\" intégré. La carte s'agrandit au montage (ressort) via le [système d'animation](/reference/core-entity/#animation) partagé ; bloque les `click`/`pointerdown` sous-jacents. Affichez-la avec `scene.showOverlay(modal)`.

- `close(): Promise<void>` — réduit la carte à 0 (ressort), puis la démonte via `scene.hideOverlay(this)` une fois l'animation de sortie résolue (démontage sécurisé différé). Attente possible.
- `update(dt, time)` — fait tic le ressort et marque la scène comme sale pendant l'animation (appelé par la boucle de rendu).

### `ScrollView`

```ts
new ScrollView(opts: ScrollViewOptions)

interface ScrollViewOptions {
  width: number;
  height: number;
  scrollPhysics?: MotionConfig; // default 'spring' (stiffness 180, damping 12)
}
```

Un viewport de clipping (`clipChildren = true`) avec défilement par molette + glissement du pointeur et physique à ressort configurée par `scrollPhysics` — le ressort par défaut est délibérément sous-amorti (ζ ≈ 0,45, ~20 % de dépassement) ; le contenu de type document veut généralement le préréglage exporté `DOCUMENT_SCROLL_PHYSICS` (`{ stiffness: 180, damping: 27 }`, ζ ≈ 1,0, sans dépassement). Les enfants vivent à l'intérieur d'une `content` Entity non interactive qui est translatée ; la boîte du viewport reste fixe.

- `content: Entity` — le conteneur défilant (public).
- `add(child): this` / `remove(child): this` — mute `content` et appelle `updateContentSize()`.
- `updateContentSize(): void` — recalcule `content.width/height` à partir des étendues des enfants (à appeler après avoir muté les enfants directement) pour définir la plage de défilement maximale.
- `scrollTo(y: number): void` — défile à un décalage Y où **0 est le haut** (limité en interne ; API publique de défilement ajoutée en 0.1.1).
- `scrollToBottom(): void` — saute à la fin du contenu (ajouté en 0.1.1).
- `update(dt, time)` — intègre le ressort vers le décalage cible (appelé par la boucle de rendu).

Le défilement par molette appelle `preventDefault()` sauf avec `Ctrl` maintenu (laisse le navigateur zoomer). Le glissement du pointeur déplace le contenu 1:1 avec le curseur/doigt. La cible de défilement est limitée à `[-maxScroll, 0]`.

```ts
const sv = new ScrollView({ width: 360, height: 480 });
sv.add(longContent);
scene.add(sv.setPosition(20, 20));
sv.scrollToBottom(); // par ex. un journal de chat après ajout
```

---

## Contenu / documents enrichis

### `Markdown`

```ts
new Markdown(markdownText: string, opts?: MarkdownOptions)

interface MarkdownOptions {
  maxWidth?: number;     // défaut 800
  theme?: MarkdownTheme;
  onLinkClick?: (href: string) => void;
  selectable?: boolean;  // défaut true ; propagé aux cellules de texte/code/tableau rendues
}

interface MarkdownTheme {        // tous optionnels ; valeurs par défaut indiquées
  textColor?: string;            // '#e2e8f0'
  headingColor?: string;         // '#f8fafc'
  codeColor?: string;            // '#a5f3fc'
  codeBgColor?: string;          // 'rgba(30, 41, 59, 0.85)'
  quoteBorderColor?: string;     // '#6366f1'
  quoteTextColor?: string;       // '#94a3b8'
  hrColor?: string;              // 'rgba(148, 163, 184, 0.3)'
  tableBgColor?: string;         // 'rgba(15, 15, 25, 0.4)'
  tableHeaderBgColor?: string;   // 'rgba(255, 255, 255, 0.08)'
  bodyFont?: string;             // 'Inter, system-ui, sans-serif'
  codeFont?: string;             // '\"JetBrains Mono\", \"Fira Code\", monospace'
  fontSize?: number;             // 16
}
```

Analyse le Markdown avec **`marked` (v18, GFM)** en un sous-arbre VMT sous un `Stack` vertical (`content`, gap 16). Jetons pris en charge : titres (h1–h6, tailles mises à l'échelle), paragraphes (`RichText` avec retour à la ligne), blocs de code fences (`CodeBlock` avec surlignage de mots-clés), citations (barre d'accent à gauche), listes ordonnées/non ordonnées, règles horizontales, code en ligne, liens — et **tableaux GFM** (rendus via le composant `Table` ; support des tableaux GFM ajouté en 0.1.1). `content.width`/`height` dimensionnent le composant.

Deux chemins de mise à jour du contenu — **choisir le bon est important pour le streaming :**

- `setContent(markdown): this` — **reconstruction complète** : détruit tous les enfants et re-rend à partir de zéro. Utilisez-le pour un remplacement unique.
- `appendMarkdown(chunk): this` — **le bon chemin streaming/token**. Ajoute au tampon brut, ré-lexe la source Markdown complète, différencie les tokens par source brute, réutilise les entités de préfixe inchangées, et met à jour le dernier paragraphe (en cours de croissance) sur place via `RichText.setSpans`. Évite une reconstruction complète de l'arbre d'entités, mais le lexing reste proportionnel à la longueur du document.
- `setSelectable(selectable): this` — met à jour les descendants texte/code/tableau existants et devient la valeur par défaut pour les futurs nœuds de streaming.

> Piège : ne **stream** pas en appelant `setContent(toutJusquÀMaintenant)` à chaque token. Cela reconstruit tout l'arbre à chaque token (O(document) par token) et fait croître le coût de mise en page avec le document. Ne donnez que le nouveau delta à `appendMarkdown(chunk)`.

```ts
const md = new Markdown('', { maxWidth: 600 });
scene.add(md.setPosition(40, 40));
for await (const token of llmStream) md.appendMarkdown(token); // réutilise le préfixe rendu inchangé
```

### `CodeBlock`

```ts
new CodeBlock(code: string, lang: string, maxWidth: number, theme: Required<MarkdownTheme>, selectable = true)
```

Une feuille unique s'auto-rendant pour le code fence : fond arrondi + texte coloré par ligne et par segment (surlignage des mots-clés/chaînes/commentaires/nombres pour `js`/`ts`/`py`/`rust` et alias). Remplace l'ancienne explosion d'entités enfant par ligne/segment par une feuille plate unique. **Décoratif** — `isPointInside()` renvoie toujours `false`.

- `setCode(code, lang?): this` — ré-analyse le contenu (par exemple édition en direct).
- `setSelectable(selectable): this` — bascule la projection de contenu source exacte.

UI 1.9 partage le `PreparedContentGrid` de Core 1.8 entre la peinture Canvas par graphème et la projection sémantique. Les tabulations, les CJK/emoji larges, la mise en forme arabe, le bidi, la substitution de police Firefox, le DPR/zoom et les transformations affines conservent donc un plan de géométrie unique conscient de la source.

Note : `theme` doit être un `Required<MarkdownTheme>` entièrement résolu. En pratique, `CodeBlock` est produit en interne par `Markdown` ; ne le construisez directement que si vous fournissez un thème complet.

### `Table`

```ts
new Table(opts: TableOptions)

interface TableOptions {
  headers: (string | Entity)[];     // requis ; les instances Entity doivent être uniques
  rows: (string | Entity)[][];      // requis (2D ligne × col)
  colWidths?: number[];       // px par colonne ; doit correspondre à headers.length, sinon distribué uniformément
  width?: number;             // largeur totale, défaut 600
  rowHeight?: number;         // défaut 36
  bg?: string;                // défaut 'rgba(15, 15, 25, 0.4)'
  headerBg?: string;          // défaut 'rgba(255, 255, 255, 0.08)'
  borderColor?: string;       // défaut 'rgba(255, 255, 255, 0.15)'
  headerTextColor?: string;   // défaut '#ffffff'
  textColor?: string;         // défaut '#e2e8f0'
  font?: string;              // défaut '14px sans-serif'
  selectable?: boolean;       // sélection native du texte des cellules, défaut true
}
```

L'alignement des colonnes est appliqué en **positionnant l'entité de la cellule**, et non par une propriété d'alignement de texte — `setTextAlign` n'accepte que `'left' | 'justify'`. Pour une cellule multi-lignes encapsulée, cela aligne le bloc plutôt que chaque ligne à l'intérieur.

Grille de données native Canvas : les cellules de chaîne deviennent des entités enfant `Text`, les cellules Entity sont contraintes via `setMaxWidth()` publique, et `layout()` résoud le retour à la ligne, les hauteurs de ligne et les positions avant la passe `render()` uniquement dédiée au dessin. Appelez `layout()` après avoir modifié le contenu externe d'une cellule. Chaque cellule possède une projection de contenu. A11y : projette `{ role: 'grid', label: 'Tableau de données avec N colonnes et M lignes.' }` pour les technologies d'assistance. Également le renderer pour les tableaux GFM dans `Markdown`.

---

### `RadioGroup`

```ts
new RadioGroup(opts: RadioGroupOptions)

interface RadioGroupOptions {
  options: RadioOption[];
  value?: string;
  label?: string;  // accessible name for the GROUP (2.8.0+), default 'Radio group'
  direction?: 'horizontal' | 'vertical';
  gap?: number;
  size?: number;
  font?: string;
  color?: string;
  accent?: string;
  border?: string;
  onChange?: (value: string) => void;
}

interface RadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}
```

Un groupe mutuellement exclusif de choix radio projeté avec `{ role: 'radiogroup', label }`. La charge utile standardisée de l'événement `'change'` contient `{ value }`.

**Passez `label` quand un écran a plus d'un groupe** (2.8.0+). Chaque option porte son propre nom, mais c'est le nom du groupe qui dit _quel choix est fait_. Sans lui, chaque groupe s'annonce comme le défaut générique `'Radio group'`, donc un utilisateur entend "Radio group" à répétition sans moyen de les distinguer — définissez-le dès que le titre visuel identifiant le groupe est dessiné sur le canvas plutôt que de faire partie du groupe (WCAG 4.1.2).

---

### `Tabs`

```ts
new Tabs(opts: TabsOptions)

interface TabsOptions {
  tabs: TabItem[];
  value?: string;
  label?: string; // accessible name for the TAB BAR (2.8.0+), default 'Tab switching panel'
  width: number;
  height: number;
  tabHeight?: number;
  font?: string;
  color?: string;
  selectedColor?: string;
  borderColor?: string;
  closable?: boolean; // affiche une option de fermeture ; les clics sont dirigés vers onClose
  tabWidth?: number; // largeur préférée en px ; la barre défile en cas de débordement (défaut 160)
  minTabWidth?: number; // limite inférieure avant que le défilement ne s'active (défaut 96)
  autoHideTabBar?: boolean; // masque la barre quand < 2 onglets (défaut false ; 1.9.5)
  onChange?: (value: string) => void;
  onClose?: (value: string) => void;
}

// rename a tab's label at runtime:
tabs.setLabel(tabId: string, label: string): void

interface TabItem {
  id: string;
  label: string;
  content: Entity;
}
```

Un conteneur de sélection par onglets. Monte automatiquement la vue de contenu de l'onglet actif et la translate dans l'espace restant. Projette `{ role: 'tablist', label }` pour l'accessibilité. La charge utile standardisée de l'événement `'change'` contient `{ value }`.

**Passez `label` quand un écran a plus d'une tablist** (2.8.0+), pour la même raison que `RadioGroup.label` : chaque onglet est nommé, mais c'est le nom de la tablist qui dit entre quoi les onglets basculent. Le défaut est `'Tab switching panel'`.

Les onglets conservent une `tabWidth` préférée fixe et la barre défile horizontalement une fois qu'ils débordent (molette, ou défilement automatique pour garder l'onglet actif visible) plutôt que de rétrécir en lamelles — depuis la 1.9.4, `tabWidth` est une cible au-delà de laquelle la barre défile, pas une largeur à étirer pour remplir (ce qui désorientait auparavant les clics de fermeture sur les larges bandes). Avec `autoHideTabBar` (1.9.5), la barre et sa zone d'impact disparaissent lorsqu'il y a moins de deux onglets et le contenu occupe toute la hauteur (sémantique `showtabline=1` de Vim) ; l'accesseur `effectiveTabBarHeight` indique la hauteur actuelle de la barre (`0` quand elle est masquée), et la géométrie du contenu se re-synchronise à chaque trame pour que la réaffectation de `tabs` ne puisse pas laisser de contenu obsolète ou décalé.

---

### `ProgressBar`

```ts
new ProgressBar(opts?: ProgressBarOptions)

interface ProgressBarOptions {
  value: number; // 0..1
  width?: number;
  height?: number;
  radius?: number;
  bg?: string;
  accent?: string;
  showText?: boolean;
  font?: string;
  color?: string;
}
```

Barre de progression affichant les pistes de progression. Options de texte centré disponibles. Projette `{ role: 'progressbar', value }` pour l'accessibilité.

- `setValue(value: number): void` — Met à jour la valeur avec des vérifications de limites de sécurité.

---

### `Overlay`

```ts
new Overlay(opts: OverlayOptions)

interface OverlayOptions {
  width: number;
  height: number;
  placement?: Placement; // 'top' | 'bottom' | 'left' | 'right' | 'top-start' | etc., default 'bottom'
  offset?: number;       // distance in px, default 8
}
```

Moteur de couche de positionnement flottant avec détection de collision de bords et bascule de placement. Positionnez-le relatif à une cible avec `showAt(target, placement?, offset?)` ou à un point absolu avec `showAtPoint(x, y)` ; masquez-le avec `hide()`. Ne projette pas de nœud d'accessibilité nativement.

---

### `Tooltip`

```ts
new Tooltip(opts: TooltipOptions)

interface TooltipOptions {
  target: Entity;
  content: string;
  placement?: Placement;
  delay?: number; // ms avant l'affichage, défaut 300
  font?: string;
  color?: string;
  bg?: string;
}
```

Aide contextuelle flottante au survol. Projette un conteneur d'infobulle au survol relatif à la cible.

---

### `Popover`

```ts
new Popover(opts: PopoverOptions)

interface PopoverOptions {
  target: Entity;
  width: number;
  height: number;
  placement?: Placement;
  bg?: string;
  borderColor?: string;
}
```

Panneau contextuel flottant au clic. Cliquer sur la cible affiche le popover, cliquer à l'extérieur le masque automatiquement.

---

### `ContextMenu`

```ts
new ContextMenu(opts: ContextMenuOptions)

interface ContextMenuOptions {
  items: ContextMenuItem[];
  width?: number;
  font?: string;            // default '14px sans-serif'
  color?: string;           // row text, default '#e2e8f0'
  disabledColor?: string;   // disabled rows, default 'rgba(226, 232, 240, 0.4)'
  bg?: string;              // menu background, default 'rgba(15, 23, 42, 0.95)'
  hoverBg?: string;         // hovered row, default 'rgba(0, 240, 255, 0.25)'
  borderColor?: string;     // menu border, default 'rgba(255, 255, 255, 0.15)'
  itemHeight?: number;      // row height, default 32
  separatorHeight?: number; // divider height, default 1
}

type ContextMenuItem =
  | { label: string; icon?: string; shortcut?: string; disabled?: boolean; onClick?: () => void; children?: ContextMenuItem[] }
  | { separator: true };
```

Composant de menu déclenché par clic droit. Prend en charge les icônes, raccourcis, séparateurs et sous-menus récursifs.

- `showAtPoint(x: number, y: number, source?: Scene | Entity): void` — affiche le menu à un point de la Scene. Passez une source montée si le menu ne l'est pas encore.
- Les menus imbriqués partagent un seul backdrop possédé par le menu racine. L'activation d'une commande, un pointerdown extérieur, `hide()` ou `destroy()` ferme toute la chaîne sans laisser de surface sémantique ou de pointeur masquée.

---

### `VirtualList`

```ts
new VirtualList<T>(opts: VirtualListOptions<T>)

interface VirtualListOptions<T> {
  width: number;
  height: number;
  items: T[];                          // full data array
  renderItem: (item: T, index: number) => Entity;
  estimatedRowHeight: number;          // before a row is measured; exact value for fixed heights
  overscan?: number;                   // extra rows above & below the window, default 3
  keyForItem?: (item: T, index: number) => string; // stable identity (e.g. message id)
  stickToBottomThreshold?: number;     // px from bottom that counts as "following", default 48
}
```

Conteneur de liste défilante optimisé pour le rendu haute performance. N'instancie/affiche que les éléments actuellement dans les limites du viewport. `keyForItem` fait survivre les hauteurs mesurées à `setItems()`, maintient une ancre de défilement pendant que les lignes au-dessus se redimensionnent, et permet l'ajout/préfixe sans jeter le cache — sans lui, `setItems()` efface chaque mesure et saute en haut. `stickToBottomThreshold` (uniquement avec `keyForItem`) re-épingle un viewport de suivi en bas après le redimensionnement des lignes — idéal pour les transcriptions de chat. Méthodes : `scrollToIndex(index)`, `scrollToTop()`, `scrollToBottom()`, `jumpToBottom()` (instantané). La classe exportée `RowHeights` prend en charge le cache de mesure.

---

### `TreeView`

```ts
new TreeView(opts: TreeViewOptions)

interface TreeViewOptions {
  nodes: TreeNode[];
}

interface TreeNode {
  id: string;
  label: string;
  icon?: string;                    // optional icon glyph (emoji, nerd-font, …)
  iconColor?: string;               // falls back to the tree's text color (material-style file icons)
  children?: TreeNode[] | (() => Promise<TreeNode[]>);
}
```

Un navigateur d'arbre imbriqué. Prend en charge les tableaux d'enfants synchrones ou les fonctions de résolution asynchrones pour le chargement paresseux.

---

### `ResizablePanel`

```ts
new PanelGroup(opts: PanelGroupOptions)
new Panel(opts: PanelOptions)
new PanelResizeHandle()

interface PanelGroupOptions {
  direction: 'horizontal' | 'vertical';
  width: number;
  height: number;
}

interface PanelOptions {
  minSize?: number;
  defaultSize?: number; // fraction
}
```

Un système de panneaux fractionnés redimensionnables. `Panel.setContent(content, fit = true)` héberge une entité et suit la largeur et la hauteur du Panel après le déplacement d'un séparateur ou un redimensionnement direct. Passez `false` ou `{ width?, height? }` lorsque le contenu doit posséder une ou deux dimensions.

---

## Index rapide

| Composant     | Constructeur                    | Nœud d'ombre / rôle                   |
| ------------- | ------------------------------- | ------------------------------------- |
| `Text`        | `(text, opts?)`                 | `div` (name = text)                   |
| `RichText`    | `(spans, opts?)`                | `div` + points d'accès `<a>` par lien |
| `Button`      | `(label, opts?)`                | `button` role=button                  |
| `Link`        | `(label, opts)`                 | `a[href]`                             |
| `Image`       | `(src, opts)`                   | `img[src,alt]`                        |
| `Card`        | `(opts)`                        | aucun, ou role=group avec `label`     |
| `Stack`       | `(opts?)`                       | aucun (structurel)                    |
| `Flow`        | `(opts?)`                       | aucun (structurel)                    |
| `Input`       | `(opts)`                        | `input` transparent                   |
| `TextArea`    | `(opts)`                        | `textarea` transparent                |
| `Checkbox`    | `(opts)`                        | `input[type=checkbox]`                |
| `Toggle`      | `(opts)`                        | role=switch                           |
| `Slider`      | `(props?)`                      | role=slider                           |
| `Dropdown`    | `(options, props?)`             | role=combobox + listbox/option        |
| `RadioGroup`  | `(opts)`                        | role=radiogroup                       |
| `Tabs`        | `(opts)`                        | role=tablist                          |
| `ProgressBar` | `(opts?)`                       | role=progressbar                      |
| `Overlay`     | `(opts)`                        | aucun (structurel)                    |
| `Tooltip`     | `(opts)`                        | infobulle                             |
| `Popover`     | `(opts)`                        | panneau contextuel                    |
| `ContextMenu` | `(opts)`                        | liste de menu contextuel              |
| `VirtualList` | `(opts)`                        | défilement viewport                   |
| `TreeView`    | `(opts)`                        | vue d'arbre                           |
| `PanelGroup`  | `(opts)`                        | groupe redimensionnable               |
| `ScrollView`  | `(opts)`                        | viewport de contenu                   |
| `Modal`       | `(title, props?)`               | superposition (fond + carte)          |
| `Markdown`    | `(text, opts?)`                 | sous-arbre des composants ci-dessus   |
| `CodeBlock`   | `(code, lang, maxWidth, theme)` | aucun (décoratif)                     |
| `Table`       | `(opts)`                        | role=grid                             |

> `Slider`, `Dropdown` et `Modal` acceptent des props faiblement typées (`any`) dans le `.d.ts` publié ; les tableaux d'options ci-dessus sont dérivés de leurs constructeurs source et constituent le contrat précis.
