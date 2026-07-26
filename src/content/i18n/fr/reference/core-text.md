---
title: 'Texte et Bidi'
description: 'Le paquet autonome @vectojs/text (aussi le sous-chemin @vectojs/core/text) : métriques typographiques, analyse des polices MSDF, mise en forme arabe et le résolveur bidi, plus les renderers de texte GPU MSDFTextEntity/GridTextEntity résidant dans core.'
order: 7
---

# Texte et Bidi — `@vectojs/text`

Les primitives de mise en forme du texte — `BidiResolver`, `ArabicShaper`,
`Typography`, `MSDFFont`, `prepareContentGrid`/`PreparedContentGrid` — constituent
le paquet autonome **`@vectojs/text`** (un paquet feuille dépendant uniquement de
`bidi-js`). Les renderers de texte GPU basés sur `Entity` (`MSDFTextEntity`,
`SVGEntity`, `TextEntity`/`GridTextEntity`) restent dans
[`@vectojs/core`](/reference/core-api/) car ils étendent `Entity`. Core re-exporte
les primitives de `@vectojs/text`, elles se résolvent donc depuis `@vectojs/text`,
`@vectojs/core` ou le sous-chemin `@vectojs/core/text`. Construit sur la division
froid/chaud du [Moteur de mise en page](/reference/core-layout/).

## MSDFFont

```ts
new MSDFFont(data: MSDFFontData)
MSDFFont.parse(json: string | MSDFFontData): MSDFFont   // lit le JSON msdf-atlas-gen
font.getGlyph(unicode: number): MSDFGlyphDef | undefined
font.layout(text, fontSizePx, opts?: MSDFLayoutOptions): MSDFLayoutResult   // honore \\n, crénage, letterSpacing
font.distanceRange / font.atlasWidth / font.atlasHeight
```

Analyse le JSON `msdf-atlas-gen` de facto et dispose le texte en quads de pixels CSS
avec des UV d'atlas (espace local y-vers-le-bas ; v=0 en haut de l'atlas). Associez
`layout()` avec `setMSDFTexture` + `addGlyph` du backend WebGL
(voir [Couche WebGL points](/reference/core-renderer/#couche-webgl-points))
pour du texte GPU indépendant de la résolution. Types :
`MSDFFontData`, `MSDFAtlasInfo`, `MSDFMetrics`, `MSDFGlyphDef`, `MSDFBounds`,
`MSDFKerning`, `PositionedGlyph`, `MSDFLayoutResult`, `MSDFLayoutOptions`.

## MSDFTextEntity

```ts
new MSDFTextEntity(text: string, options: MSDFTextEntityOptions)
// options: { font: MSDFFont, texture: TexImageSource, fallbackFont?, fontSize?, color?, lineHeight?, letterSpacing? }
setText(text: string): void
```

Rend les glyphes MSDF nets via la couche WebGL points quand la scène tourne avec
`pointBackend: 'webgl'` ; sinon tombe en repli sur Canvas2D `fillText` avec
`fallbackFont`. La mise en page est calculée **hors-thread** via `LayoutWorkerManager` et
appliquée sur rappel, appelant `markDirty()` — donc le texte apparaît un tick asynchrone
après la construction/`setText`.

## TextEntity et GridTextEntity (depuis `.`)

```ts
new TextEntity(text: string, atlas: GlyphAtlas, maxWidth: number, fontSize = 32)
text.setText(text): this        // passage froid (re-segmentation + re-mesure), puis reflux
text.setMaxWidth(maxWidth): this // passage chaud uniquement — réutilise le PreparedText mis en cache (redimensionnement réactif bon marché)
text.setTextAlign(align: 'left' | 'justify'): this
text.setHyphenator(fn: ((word: string) => string[]) | null): this

new GridTextEntity(_atlas: any, fontSize = 10)
grid.updateGrid(ascii: string[])   // grille de cellules monospace ; interactive=false (a11y désactivé pour les performances)
```

`setTextAlign('justify')` étire les lignes enroulées à fleur de `maxWidth` (espaces
entre mots, ou inter-caractères sur les lignes CJK sans espace) ; la dernière ligne de
chaque paragraphe reste en drapeau. `setHyphenator()` branche une fonction mot → parties
(par exemple les motifs Knuth–Liang du paquet npm `hyphen`) pour que les mots longs
puissent se couper en milieu de mot avec un `-` visible ; les traits d'union conditionnels
(U+00AD) déjà dans le texte source fonctionnent sans césureur. Les deux s'appliquent
parce que `TextEntity` rend **par glyphe** à la position `x` calculée de chaque nœud —
le calcul de justification/césure est visuellement honoré.

`MSDFTextEntity` et les composants `Text`/`RichText` de `@vectojs/ui` partagent le même
`LayoutEngine` sous-jacent, mais n'exposent pas encore ces deux méthodes — `Text`/`RichText`
rend chaque ligne enroulée comme un seul appel `fillText()` natif pour les performances,
ce qui ignorerait silencieusement les décalages de justification par glyphe même si
l'option était exposée. Utilisez `TextEntity` directement (ou pilotez un `LayoutEngine`
brut avec `textAlign`/`hyphenate` défini) quand vous avez besoin de texte justifié ou
césuré aujourd'hui.

## Bidi / shape

```ts
ArabicShaper.shapeArabic(text: string): ShapedResult   // { shapedText, indexMap: Int32Array } — jointure en forme de présentation
BidiResolver.getBaseLevel(text: string): number
BidiResolver.resolveLevels(text: string): Uint8Array
BidiResolver.reorderVisual(nodes: any[], baseLevel: number): void
BidiResolver.reorderSegments(str: string, levels: Uint8Array, baseLevel: number):
  Array<[number, number]>
```

Bidi intégré léger : classes de direction basées sur des plages (R/AL hébreu/arabe,
chiffres EN/AN) et sélection de forme de présentation contextuelle arabe. `indexMap` mappe
les indices façonnés vers la chaîne source pour le hit-testing / le mappage de caret.

`reorderVisual` réordonne un tableau d'objets nœud en place. `reorderSegments` expose les mêmes plages d'inversion UAX #9 **L2** (paires d'indices inclusives `[start, end]` sur les propres positions de la séquence) sans nécessiter d'objets nœud, de sorte qu'un appelant détenant des **tableaux typés parallèles** peut appliquer la permutation identique en place — c'est ce qu'utilise le chemin de mise en page tampon zéro-GC. `reorderVisual` délègue maintenant à celui-ci, donc les deux ne peuvent pas dériver.

Voir [Texte et typographie](/learn/text-typography/) pour l'utilisation.

## Associé

[Moteur de mise en page](/reference/core-layout/) (le passage froid/chaud qu'il rend) ·
[Renderers](/reference/core-renderer/) (couche WebGL points, projection de contenu) ·
[`@vectojs/core` overview](/reference/core-api/)
