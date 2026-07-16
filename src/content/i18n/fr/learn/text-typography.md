---
title: 'Texte & Typographie'
description: "Le système de texte de VectoJS : séparation froide/chaude du LayoutEngine, streaming pour la sortie LLM, texte enrichi à styles mixtes, polices MSDF, arabe/BiDi, et formes d'exclusion."
order: 14
---

# Texte & Typographie

VectoJS embarque un moteur de texte construit autour de deux idées clés : **séparer la mesure de la mise en page** (pour que le redimensionnement évite une re-mesure), et **mémoïser au niveau du paragraphe** (pour que les chemins d'ajout puissent réutiliser les paragraphes de début inchangés).

## Essayez-le en direct

<figure class="sandbox">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · @vectojs/core</span></div>
  <iframe src="/sandbox/text-streaming.html" class="sandbox-frame" loading="lazy" title="Text streaming interactive example" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption><code>label.append(chunk)</code> appelé toutes les 30 ms — O(paragraphe modifié), pas O(document). Cliquez sur Replay pour redémarrer le flux.</figcaption>
</figure>

## Choisir le bon composant

| Scénario                                               | Utilisez         |
| ------------------------------------------------------ | ---------------- |
| Texte statique ou dynamique simple                     | `Text`           |
| Styles mixtes (gras, italique, liens, couleurs)        | `RichText`       |
| Documents Markdown                                     | `Markdown`       |
| Texte GPU indépendant de la résolution (UI de jeu, 3D) | `MSDFTextEntity` |
| Grille à chasse fixe (terminal)                        | `GridTextEntity` |
| Texte personnalisé adossé à un atlas vectoriel         | `TextEntity`     |

`Text`, `RichText` et `Markdown` vivent dans `@vectojs/ui`. Les autres sont dans `@vectojs/core`.

### Texte sélectionnable à grille fixe

Les terminaux, éditeurs de code et autres renderers par cellule devraient compiler leur source logique avec `prepareContentGrid()` de Core 1.8. Peignez les cellules renvoyées sur Canvas et renvoyez la même grille immuable depuis `getContentProjection()`. Cela maintient la source de copie/recherche, les carets de graphèmes légaux, les tabulations, les largeurs CJK/emoji, la mise en forme arabe, le placement bidi et la sélection du navigateur sur un seul plan de géométrie au lieu de maintenir une seconde mise en page DOM.

Mesurez `cellWidth` via Canvas avec la police résolue par le navigateur, reconstruisez la grille chaque fois que la source ou les métriques de police changent, et appelez `scene.resize()` après qu'un conteneur personnalisé ou un zoom applicatif a changé. Le redimensionnement est une limite de calibration à froid pour la substitution de police de Firefox et les métriques de Range de glyphes manquants ; les rendus stables réutilisent les porteurs préparés sans lectures de géométrie.

---

## Text

Texte sur une seule ou plusieurs lignes avec retour à la ligne automatique. Sous le capot, il exécute le `LayoutEngine` de base (même pipeline de segmentation que tous les autres composants de texte).

```typescript
import { Text } from '@vectojs/ui';

const label = new Text('Hello, world', {
  font: '400 16px Inter', // CSS shorthand
  color: '#e2e8f0',
  maxWidth: 300, // wrap at 300px; omit for no wrapping
  lineHeight: 24, // line advance in px
  preserveLeadingSpaces: false,
});

label.setPosition(40, 40);
scene.add(label);
```

### Mises à jour froides vs chaudes

`Text` a trois méthodes de mutation aux coûts très différents :

```typescript
label.setText('New content'); // EXPENSIVE — cold pass: re-segment + re-measure
label.append(' more tokens'); // EFFICIENT — only the last paragraph is re-measured
label.setMaxWidth(200); // CHEAP — hot pass: re-wrap only, no re-measure
```

Utilisez cette distinction lors du streaming de texte token par token :

```typescript
// Wrong — rebuilds the full measured text on every token
for await (const token of stream) {
  label.setText((accumulated += token)); // O(document) per token → slow
}

// Correct — only the changed paragraph is re-measured
for await (const token of stream) {
  label.append(token); // reuses unchanged paragraphs; re-prepares the changed tail
}
```

Lorsque l'utilisateur redimensionne la fenêtre, appelez `setMaxWidth(newWidth)` — cela se réagence avec le texte mesuré mis en cache, il est donc sûr de l'appeler à chaque événement de redimensionnement.

---

## RichText

Texte en ligne multi-styles : gras, italique, coloré, de tailles différentes et lié, tous s'écoulant ensemble sur des lignes de base partagées.

```typescript
import { RichText } from '@vectojs/ui';
import type { StyledSpan } from '@vectojs/core';

const spans: StyledSpan[] = [
  { text: 'Build ' },
  { text: 'fast', style: { bold: true, color: '#00f0ff' } },
  { text: ' UIs with ', style: { italic: true } },
  { text: 'VectoJS', style: { bold: true, href: 'https://vectojs.org/' } },
  { text: '.' },
];

const rich = new RichText(spans, {
  font: '16px Inter',
  color: '#e2e8f0',
  maxWidth: 600,
  linkColor: '#38bdf8',
  onLinkClick: (href) => window.open(href, '_blank'),
});

scene.add(rich.setPosition(40, 40));
```

### Champs de `TextStyle`

```typescript
interface TextStyle {
  bold?: boolean;
  italic?: boolean;
  color?: string;
  fontSize?: number; // overrides base font size for this run
  href?: string; // makes the run a link
}
```

> [!NOTE] > `bold` et `italic` n'affectent que le rendu, pas la largeur mesurée (les traits en gras s'étendent légèrement au-delà de la largeur d'avancée). `fontSize` **affecte** en revanche à la fois la largeur mesurée et la hauteur de ligne, de sorte que mélanger des tailles sur une même ligne fonctionne correctement — la hauteur de chaque ligne est déterminée par son glyphe le plus haut.

### Streaming avec `appendSpans()`

Comme `Text.append()`, `appendSpans()` réutilise les paragraphes de début inchangés :

```typescript
const rich = new RichText([]);
scene.add(rich);

for await (const token of llmStream) {
  rich.appendSpans([{ text: token, style: { color: '#a5f3fc' } }]);
}
```

### Formes d'exclusion (texte s'écoulant autour d'obstacles)

Passez `exclusions` pour faire s'écouler le texte autour d'obstacles rectangulaires — des floats à la CSS :

```typescript
const rich = new RichText(spans, {
  maxWidth: 500,
  exclusions: [
    { x: 0, y: 60, width: 120, height: 120 }, // avoid a 120×120 image at (0, 60)
  ],
});

// Later, update dynamically:
rich.setExclusions([{ x: 0, y: 60, width: 120, height: 120 }]);
```

Le moteur calcule les intervalles horizontaux libres par bande de ligne (`computeLineSegments`) et remplit chaque intervalle indépendamment. La réorganisation BiDi s'applique à toute la ligne logique après le placement des intervalles.

---

## Markdown

Rend du Markdown dans un sous-arbre du VMT à l'aide de la bibliothèque `marked` (saveur GFM).

```typescript
import { Markdown } from '@vectojs/ui';

const md = new Markdown('# Hello\n\nThis is **rich** text.', {
  maxWidth: 700,
  theme: {
    headingColor: '#f8fafc',
    codeColor: '#a5f3fc',
    bodyFont: 'Inter, sans-serif',
  },
});

scene.add(md.setPosition(40, 40));
```

Tokens pris en charge : titres (h1–h6), paragraphes, blocs de code délimités avec surlignage de mots-clés, citations, listes ordonnées/non ordonnées, règles horizontales, code/gras/italique/liens en ligne, et tableaux GFM (rendus via le composant `Table`).

### Streaming du Markdown

Pour la sortie LLM, utilisez `appendMarkdown()` — ne bouclez jamais sur `setContent(fullText)` :

```typescript
const md = new Markdown('', { maxWidth: 700 });
scene.add(md);

for await (const token of llmStream) {
  md.appendMarkdown(token);
}
```

`appendMarkdown()` ré-analyse lexicalement le tampon complet, compare les tokens au dernier rendu, réutilise le préfixe d'entités inchangé et met à jour le dernier paragraphe sur place. Cela économise le travail de reconstruction de l'arbre visuel, mais l'analyse lexicale Markdown évolue tout de même avec le document complet. `setContent()` effectue en plus une reconstruction complète, alors utilisez-le pour un remplacement en une seule fois.

---

## Comment fonctionne le LayoutEngine

Comprendre la séparation froide/chaude vous aide à faire le bon choix pour la performance.

### Passe froide — mesurer une fois

`prepare(text)` et `prepareRich(spans)` segmentent le texte en paragraphes, appliquent la mise en forme arabe et le BiDi, segmentent en mots et graphèmes avec `Intl.Segmenter`, et mesurent la largeur d'avancée de chaque glyphe. `prepareContentGrid(source, metrics)` effectue la compilation unique correspondante pour les surfaces sélectionnables à grille fixe. Le résultat (`PreparedText` ou `PreparedContentGrid`) est conservé jusqu'à ce que son contenu ou ses entrées métriques changent.

**C'est l'étape coûteuse.** Ne l'exécutez que lorsque le contenu change.

### Passe chaude — positionner toujours

`layoutPrepared(prepared)` prend le `PreparedText` mis en cache et applique les contraintes de retour à la ligne (`maxWidth`, `maxHeight`, formes d'exclusion) pour produire des `LayoutNode[]` positionnés. C'est de l'arithmétique pure — pas de segmentation, pas de mesure.

`setMaxWidth()` n'exécute que la passe chaude, réutilisant le `PreparedText` mis en cache. C'est pourquoi le reflow réactif est peu coûteux : vous pouvez l'appeler à chaque pixel d'un glisser de redimensionnement sans à-coups.

### Mémoïsation au niveau du paragraphe

La clé de cache est `fontSize + paragraphText` (pour le texte brut) ou `fontSize + paragraphText + styleSig` (pour le texte enrichi). Lorsque vous ajoutez un token à un document comportant de nombreux paragraphes :

1. Les paragraphes inchangés peuvent réutiliser les données préparées mises en cache.
2. Seul le dernier paragraphe (modifié) est re-mesuré.

Cela borne la préparation répétée de mesure/mise en page au paragraphe modifié. Un long paragraphe devient tout de même plus coûteux à mesure qu'il grandit, et l'analyse Markdown de plus haut niveau peut ajouter du travail à l'échelle du document.

### Justification et césure

`LayoutEngine` prend en charge `textAlign = 'justify'` (étire les lignes renvoyées jusqu'à `maxWidth`, dernière ligne irrégulière) et la césure au moment du retour à la ligne (les traits d'union conditionnels `­` fonctionnent d'emblée ; branchez une fonction `hyphenate: (word) => string[]` pour des coupures automatiques — par exemple les motifs de Knuth–Liang du paquet npm `hyphen`).

`TextEntity` expose les deux directement : `text.setTextAlign('justify')`, `text.setHyphenator(fn)` — voir la [référence de l'API core](/reference/core-api/#textentity--gridtextentity-from-) pour les détails. Ceux-ci se rendent correctement car `TextEntity` dessine chaque glyphe à sa propre position calculée. Les composants `Text`/`RichText` de `@vectojs/ui` réduisent chaque ligne renvoyée en un seul appel `fillText()` natif pour la performance, ils n'honorent donc pas encore la justification par glyphe — recourez à `TextEntity` lorsque vous avez besoin d'un corps de texte justifié.

---

## Polices MSDF

Les polices Multi-channel Signed Distance Field rendent un texte net à tout niveau de zoom sans artéfacts de rastérisation. Utilisez-les pour les UI de style jeu, les interfaces zoomées ou les écrans à DPR élevé.

### Générer un atlas

Installez `msdf-atlas-gen` et exécutez :

```bash
msdf-atlas-gen -font myfont.ttf -type msdf -format png -imageout atlas.png -json atlas.json
```

Cela produit `atlas.png` (la texture de glyphes) et `atlas.json` (métriques de glyphes, largeurs d'avancée, limites UV).

### Charger dans VectoJS

```typescript
import { MSDFFont, MSDFTextEntity } from '@vectojs/core/text';

// Parse the JSON
const fontData = await fetch('/fonts/atlas.json').then((r) => r.json());
const font = MSDFFont.parse(fontData);

// Load the texture image
const img = new window.Image();
img.src = '/fonts/atlas.png';
await new Promise((r) => (img.onload = r));

// Create the text entity
const msdfText = new MSDFTextEntity('Hello GPU text', {
  font,
  texture: img, // TexImageSource
  fontSize: 48,
  color: '#ffffff',
  letterSpacing: 0,
  fallbackFont: 'sans-serif', // used when pointBackend is not 'webgl'
});

scene.add(msdfText.setPosition(40, 40));
```

`MSDFTextEntity` délègue la mise en page à un worker `LayoutWorkerManager` en arrière-plan (avec debounce, zéro-copie via transfert de `Float32Array`). Le texte apparaît un tick asynchrone après la construction ou `setText()`. Lorsque `pointBackend: 'webgl'` est défini sur la scène, les glyphes sont dessinés via le programme MSDF WebGL ; sinon, l'entité se replie sur le `fillText` natif.

### `MSDFFont.layout()` directement

Si vous construisez un renderer personnalisé ou avez besoin des quads de glyphes vous-même :

```typescript
const result = font.layout('Hello', 48);
// result.glyphs: PositionedGlyph[]
// Each glyph: { char, x, y, w, h, u0, v0, u1, v1 }

for (const g of result.glyphs) {
  renderer.setMSDFTexture(texture, font.distanceRange);
  renderer.addGlyph(g.x, g.y, g.w, g.h, g.u0, g.v0, g.u1, g.v1, '#fff');
}
```

---

## Texte arabe et bidirectionnel

Le texte arabe et bidirectionnel est géré **automatiquement** à l'intérieur de `prepare()` et `prepareRich()`. Vous n'avez besoin d'appeler aucune API de mise en forme vous-même.

### Ce qui se passe en interne

1. **Mise en forme arabe** (`ArabicShaper.shapeArabic`) : substitue les caractères arabes par leurs formes de présentation contextuelles (initiale/médiane/finale/isolée) et applique les ligatures Lam-Alef. L'`indexMap` suit l'index mis en forme → source pour le hit-testing du caret.

2. **Assignation des niveaux BiDi** (`BidiResolver.resolveLevels`) : assigne un niveau d'imbrication (0 = LTR, 1 = RTL, plus élevé = imbrication plus profonde) à chaque caractère à l'aide des règles UAX#9. Les contrôles d'imbrication (LRE/RLE/PDF) sont honorés.

3. **Réorganisation visuelle** (`BidiResolver.reorderVisual`) : à la fin de chaque ligne, inverse les runs du niveau le plus élevé jusqu'à 1, produisant un ordre visuel des mots correct.

Cela signifie qu'un `Text` ou `RichText` avec du contenu arabe ou hébreu fonctionne tout simplement :

```typescript
const arabic = new Text('مرحبا بك في VectoJS', { font: '20px sans-serif', color: '#f8fafc' });
const hebrew = new RichText([{ text: 'שלום ' }, { text: 'VectoJS', style: { bold: true } }]);
```

> [!NOTE]
> Les sauts de ligne (`\n`) réinitialisent toujours le contexte de mise en forme arabe et l'état BiDi. Les lignes renvoyées par retour à la ligne conditionnel au sein du même paragraphe partagent une seule passe de mise en forme, de sorte que les paragraphes arabes multi-lignes se mettent en forme correctement à travers les retours à la ligne.

---

## Fonctions d'assistance

`measureText`, `wrapLines` et `fontSizePx` sont exportés depuis `@vectojs/ui` pour être utilisés dans des composants personnalisés.

```typescript
import { measureText, wrapLines, fontSizePx } from '@vectojs/ui';

// Rendered pixel width, LRU-cached (cap 1000)
const w = measureText('Hello world', '600 16px Inter');

// Greedy word-wrap — returns string[]
const lines = wrapLines('A longer text that wraps', '16px sans-serif', 200);

// Extract the px size from a CSS font shorthand
const size = fontSizePx('600 16px Inter'); // → 16
```

`measureText` met en forme le texte arabe via `ArabicShaper` avant de mesurer, il renvoie donc la largeur visuelle correcte pour les runs arabes.

---

## Guide de performance

| Scénario                                           | Meilleure approche                                                |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| Texte statique, défini une fois                    | `new Text(content, opts)` — une passe froide                      |
| Streaming en ajout seul (LLM)                      | `text.append(token)` ou `md.appendMarkdown(token)`                |
| Redimensionnement réactif                          | `text.setMaxWidth(newW)` — passe chaude uniquement                |
| Mise en page répétée dense (ex. grille de données) | Réutilisez `LayoutResultBuffer` avec `layoutPreparedIntoBuffer()` |
| Texte indépendant de la résolution                 | `MSDFTextEntity` + `pointBackend: 'webgl'`                        |
| Arabe / Hébreu / RTL                               | N'importe quel `Text`/`RichText`/`Markdown` — automatique         |
| Texte s'écoulant autour d'images                   | `RichText` + `exclusions: ExclusionRect[]`                        |

Le texte sélectionnable projette toujours la source Unicode logique d'origine. La mise en forme Canvas et la réorganisation BiDi n'affectent que les pixels ; le copier, la recherche dans la page, la traduction du navigateur et les technologies d'assistance conservent l'ordre source de l'appelant. Les séparateurs de retour à la ligne conditionnel et les sauts de ligne explicites sont rattachés à leur rangée visuelle précédente afin que la géométrie de sélection multi-lignes reste à l'intérieur des bandes de ligne rendues.

## Dépannage

### Le texte apparaît trop large ou à la mauvaise position

`measureText` et le `LayoutEngine` utilisent tous deux un appel canvas `measureText` avec la chaîne de police CSS exacte. Si la famille de police n'a pas encore été chargée (par exemple, une police web), le navigateur substitue une police de repli aux métriques différentes, provoquant un décalage entre la mise en page et le rendu.

Assurez-vous que les polices web sont chargées avant de construire `Text` ou `RichText` :

```typescript
await document.fonts.ready;
const label = new Text('Hello', { font: '16px Inter' });
```

### `append()` est plus lent que prévu pour les longs documents

`append()` mémoïse au **niveau du paragraphe** (découpé par `\n`). Si votre document entier est un seul long paragraphe sans saut de ligne, chaque appel `append()` re-mesure tout le paragraphe.

Pour le contenu en streaming, insérez un saut de ligne après chaque paragraphe pour permettre au cache de les séparer :

```typescript
md.appendMarkdown(chunk);
// If the LLM output naturally has paragraphs, the memoization works automatically.
// If it is one endless run-on sentence, performance degrades to O(document).
```

### Le texte de `MSDFTextEntity` est absent pour la première trame

`MSDFTextEntity` met le texte en page hors-thread via `LayoutWorkerManager`. Le résultat arrive un tick asynchrone après la construction ou `setText()`. C'est intentionnel — l'entité appelle `scene.markDirty()` lorsque le callback de mise en page se déclenche, déclenchant un repeint.

Si vous utilisez `renderMode: 'onDemand'`, ce repeint se produira correctement. Si vous avez besoin que le texte apparaisse de manière synchrone (par exemple, dans un test de capture d'écran), attendez le prochain `rAF` après `scene.start()`.

### Les exclusions de RichText ne sont pas appliquées

Les formes d'exclusion ne fonctionnent qu'avec `layoutPrepared()`, pas avec `layoutPreparedIntoBuffer()`. Si vous utilisez le chemin à tampon réutilisable, les exclusions sont ignorées. Utilisez `layoutPrepared()` pour la prise en charge des exclusions.

> **Suivant :** [Accessibilité](/learn/accessibility/) — comment le shadow DOM rend votre UI canvas accessible aux lecteurs d'écran et pilotable par les agents.
