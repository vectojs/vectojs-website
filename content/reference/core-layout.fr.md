+++
title = "Moteur de mise en page"
description = "Le paquet autonome @vectojs/layout (aussi le sous-chemin @vectojs/core/layout) : la division froid/chaud qui sépare la segmentation et mesure coûteuses du texte du calcul bon marché d'enroulement et de position, la mémoïsation en continu, le texte enrichi et les formes d'exclusion."
weight = 4
+++

# Moteur de mise en page (division froid/chaud) — `@vectojs/layout`

Le moteur de mise en page est le paquet autonome **`@vectojs/layout`** (il dépend
uniquement de [`@vectojs/text`](/reference/core-text/) pour les primitives de mise
en forme). [`@vectojs/core`](/reference/core-api/) en dépend et le re-exporte, vous
pouvez donc l'importer indifféremment depuis `@vectojs/layout`, `@vectojs/core` ou
le sous-chemin `@vectojs/core/layout`.

`LayoutEngine` sépare le passage **froid** coûteux (segmenter + mesurer, via
`Intl.Segmenter`) du passage **chaud** bon marché (enrouler + calculer la position), de
sorte que le redimensionnement/reflux/animation ne re-mesure pas.

```ts
new LayoutEngine(maxWidth: number, maxHeight: number, measurer?: GlyphMeasurer | null)

// Froid : segmenter + mesurer une fois → PreparedText réutilisable
prepare(text, fontAtlas, fontSize = 32): PreparedText
prepareRich(spans: StyledSpan[], fontAtlas, baseFontSize = 32, baseStyle?: TextStyle): PreparedText

// Chaud : placer un PreparedText en glyphes positionnés (lit maxWidth/maxHeight du moteur)
layoutPrepared(prepared, exclusionMask?, exclusions?: ExclusionRect[]): LayoutResult
layoutPreparedIntoBuffer(prepared, buffer: LayoutResultBuffer, exclusionMask?): void   // réutilise un stockage de coordonnées typé

// Ponctuel (froid+chaud ensemble)
layoutText(text, fontAtlas, fontSize = 32, exclusionMask?): LayoutResult
layoutTextIntoBuffer(text, fontAtlas, fontSize, buffer, exclusionMask?): void
```

- **Mémoïsation en continu.** `prepare`/`prepareRich` mettent en cache les résultats
  par paragraphe, donc la re-préparation d'un texte croissant (par exemple un flux de
  tokens LLM) ne mesure que les nouveaux paragraphes.
- **Texte enrichi.** `StyledSpan = { text, style?: TextStyle }` ; `TextStyle =
{ fontSize?, color?, bold?, italic?, href? }`. Un changement de style en milieu de
  mot est honoré par glyphe. `fontSize` affecte la largeur mesurée + la hauteur de
  ligne ; le reste sont des métadonnées de rendu portées aux nœuds
  (`PreparedGlyph.style` → `LayoutNode.style`).
- **Exclusions (formes d'exclusion).** `computeLineSegments(top, bottom, maxWidth,
exclusions: ExclusionRect[]): LineSegment[]` est le cœur pur et testable : les
  intervalles `[x0,x1)` libres sur une bande de ligne après soustraction des rects
  qui se chevauchent. O(n log n). Passer `[]`/omettre laisse le chemin monocollone
  byte-identique.

## Types clés de mise en page

- `GlyphAtlas` — `{ [char]: { width, baseSize, ast } }` métriques pré-mesurées.
- `GlyphMeasurer` — `{ measure(char, fontSize): number }` ; fournissez le vôtre ou
  utilisez `createCanvasMeasurer(fontFamily?, baseSize?)` (`measureText` hors écran,
  mis à l'échelle linéairement + mis en cache ; retourne `null` dans les
  environnements sans DOM → le moteur garde un repli `0.5em`).
- `PreparedText` → `PreparedParagraph[]` → `PreparedWord[]` → `PreparedGlyph[]`.
- `LayoutResult` — `{ nodes: LayoutNode[], totalWidth, totalHeight,
fallbackToCanvas? }` ; `LayoutNode` est un glyphe positionné.
- `LayoutResultBuffer` — résultat en tableau typé plat (`xs/ys/ws/hs`, `chars`,
  `levels`, `count`, `CAPACITY = 16384`) ; `reset()` avant réutilisation, `toLayoutResult()`
  pour matérialiser. `levels` est le niveau d'imbrication BiDi résolu par glyphe (pair =
  LTR, impair = RTL), donc un consommateur peut déterminer la direction d'un glyphe ;
  le chemin du tampon l'utilise pour réordonner chaque ligne en ordre visuel. Les glyphes
  sortent en ordre **visuel** avec une ligne de base partagée, correspondant au chemin
  d'allocation glyphe par glyphe.
- `LayoutWorkerManager.getInstance()` — singleton pour la mise en page hors-thread ;
  `queueLayout(entityId, text, { fontId, fontSize, maxWidth, maxHeight, callback,
... })` / `cancelLayout(entityId)`. Utilisé par [`MSDFTextEntity`](/reference/core-text/#msdftextentity).

Des exports utilitaires à connaître : `createMetricsMeasurer(fontFamily?, baseSize?)` et `resolveGlyphMeasurer(...)` construisent un `GlyphMeasurer` ; `EMPTY_GLYPH_ATLAS` est l'atlas de repli sans métriques ; `isComplexScript(text)` indique si la mise en forme nécessite l'itemiseur de scripts ; `computeMSDFLayout(...)` est la fonction de mise en page pure que le chemin du worker exécute hors-thread ; `cacheStats()` / `resetCacheStats()` et `clearCssLineBoxMetrics()` sont des caches au niveau du moteur pour les diagnostics.

- `InlineObject` — un élément remplacé en ligne (image, icône, boîte mathématique) dans un paragraphe enrichi : `{ width, height, depth?, alt?, paint? }`. Le span doit être constitué du sentinelle U+FFFC `OBJECT_REPLACEMENT` ; le moteur réserve les métriques de la boîte et, quand le consommateur rend, appelle `paint(surface: InlineObjectSurface, box: InlineObjectBox)` dans l'espace de coordonnées local du texte (pas de comptabilité de profondeur nécessaire). `alt` est l'équivalent textuel utilisé pour le nom accessible, la sélection et la copie — sans lui, le sentinelle brut fuit vers la couche a11y. `paint` fait partie de la clé de mémoïsation du paragraphe (avec `alt`) : deux objets qui se comparent égaux partagent un paragraphe en cache, donc une image choisie en dehors de `alt` (par exemple une URL d'image Markdown — le cas de la colonne de badges) doit y être déclarée, sinon chaque objet d'apparence égale dessine l'image du premier. `depth` reflète le `vertical-align` CSS avec le signe inversé (`vertical-align: -0.486ex` de MathJax → `depth: 0.486 * exToPx`).

Voir [Texte et typographie](/learn/text-typography/) pour l'utilisation, et
[Texte et Bidi](/reference/core-text/) pour la couche de rendu des polices/glyphes qui
consomme la sortie de ce moteur.

## Associé

[Texte et Bidi](/reference/core-text/) · [`Entity`](/reference/core-entity/) ·
[`@vectojs/core` overview](/reference/core-api/)
