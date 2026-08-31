+++
title = "02 — Texte et mise en page : Unicode en pixels"
description = "Le pipeline de texte intégral : segmentation, BiDi, mise en forme arabe, remplacement des polices, typographie, saut de ligne, division froid/chaud LayoutEngine, thread de travail et les invariants qui maintiennent la peinture et la mesure en parité."
weight = 22
+++

# 02 — Texte et mise en page : Unicode en pixels

> VectoJS réimplémente gratuitement ce que la pile de texte du navigateur vous offre : bidi, mise en forme, segmentation, remplacement des polices, sauts de ligne et placement de la ligne de base. Ce dossier retrace chaque étape depuis un Unicode `string` jusqu'aux glyphes positionnés et explique les contrats qui maintiennent `measure` et `paint` d'accord par construction.

## 1. Le pipeline en un coup d'oeil

```text
Unicode string
  │  Intl.Segmenter (word + grapheme)          packages/layout/src/LayoutEngine.ts:916
  ▼
 Grapheme segmentation ─┬─ ArabicShaper.shapeArabic  packages/text/src/ArabicShaper.ts:89
                        │  indexMap: shaped → source       :91
                        ▼
 BiDi resolution (bidi-js, UAX #9)            packages/text/src/BidiResolver.ts:27
  getBaseLevel / resolveLevels / reorderSegments
                        │
                        ▼
 Font fallback (atlas → measurer → 0.5em)     packages/layout/src/measure.ts:39
  createCanvasMeasurer / createMetricsMeasurer / resolveGlyphMeasurer
                        │
                        ▼
 Typography (baseline in line box)            packages/text/src/Typography.ts:93
  cssLineBoxBaseline / registeredBaseline / splitFontShorthand
                        │
                        ▼
 Line breaking + exclusion flow + justify     packages/layout/src/LayoutEngine.ts:1848
  computeLineSegments / suppressLineBreaks / LayoutEngine.layoutPrepared
                        │
                        ▼
 Paint / measure parity ─┬─ @vectojs/layout  (canvas Text/RichText)
                         └─ @vectojs/text    (MSDF: MSDFFont.layout)  packages/text/src/MSDFFont.ts:201
                         └─ @vectojs/core    (MSDFTextEntity → worker) packages/core/src/text/MSDFTextEntity.ts:25
```

Deux consommateurs parallèles partagent le même contrat de mesure : le **chemin de toile** (`@vectojs/layout`+`measureContext`) et le **chemin GPU/MSDF** (`MSDFFont.layout`+`LayoutWorker`). Les résultats ne divergent que dans la manière dont les quads deviennent des pixels, jamais dans l'endroit où les sauts de ligne se situent par famille.

Pour les consommateurs de grille (terminaux, éditeurs, `CodeBlock`), le pipeline bifurque plus tôt dans le chemin de grille retenu `prepareContentGrid`(`packages/text/src/PreparedContentGrid.ts:243`) — une compilation, deux consommateurs (peinture + projection). Voir `tmp/boss-research/01-selection.md` §3.3 pour le côté grille de contenu.

### Séparation froid/chaud (le 2,68× qui rend le redimensionnement pas cher)

```text
prepare(text) / prepareRich(spans)          ← cold:  Intl.Segmenter + Arabic shape + BiDi + glyphWidth
  └─→ PreparedText { paragraphs, fontSize }      memo'd by text+fontSize+styleSig (LayoutEngine.ts:829/833)
       │  independent of maxWidth / maxHeight / exclusions
       ▼
layoutPrepared(prepared, mask, exclusions)  ← hot:   computeLineSegments + suppressLineBreaks + shiftedExtent
measurePrepared(prepared)                   ← hot (no alloc): lineCount+height only
layoutPreparedIntoBuffer(prepared, buffer)  ← hot, zero-GC: typed arrays + reorderSegments
```

`benchmarks/text-layout-pretext`/`comparisons/text-layout-pretext`/`scripts/compare-pretext.ts:1`a établi la répartition pommes-pommes (`measurePrepared`vs `pretext.layout`). Avant la scission,`layoutText`(froid + chaud) était chronométré sous prétexte de `layout` chaud uniquement - l'écart était signalé comme coût du moteur alors qu'il s'agissait en réalité d'un coût de segmentation.

### Segmenteurs et leurs caches

`LayoutEngine`(`:916`) contient `wordSegmenter`+`charSegmenter`(`Intl.Segmenter`, locale `navigator.language ?? 'en-US'`) — détection automatique des limites des mots CJK par rapport aux mots occidentaux — plus `wordCache: Map<string, …>`(`:821`, cap 500) et `graphemeCache: Map<string,string[]>`(`:822`, cap 2000). Les deux sont vidés en gros au niveau du capuchon (`:921`/`950`) et observés jusqu'à `cacheStats()`(`:1004`).`PreparedContentGrid`préfère le même `Intl.Segmenter`pour les graphèmes (`:76`) mais porte `fallbackGraphemes`(`:107`) pour les environnements sans celui-ci : combinaison de marques, VS16/VS15, modificateurs de teint `U+1F3FB–1F3FF`, indicateurs régionaux, ZWJ - suffisamment pour que les taquets de tabulation et les colonnes larges restent corrects.`LayoutEngine.getGraphemes`(`:943`) et `getWordSegments`(`:881`) sont les seuls sites d'appel ;`shapeSimpleRun`(`:1644`) contourne `ArabicShaper`seulement après que `isComplexScript`(`:584`) ait prouvé sa sécurité.

## 2. Analyse approfondie par module

### 2.1 `packages/text/src/BidiResolver.ts:27`— UAX #9 via `bidi-js`

Classe statique uniquement (intentionnellement – `BidiResolver.getBaseLevel(...)`est une API publique). Emballage fin sur `bidi-js`/`getEmbeddingLevels`/`getReorderedIndices`de `getReorderSegments` ; l'inversion L2 précédente lancée à la main a été remplacée car sa réinitialisation L1 ne traitait qu'une seule exécution d'espaces de fin.

| Méthode                                   | Doubler | Ce que ça fait                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getBaseLevel(text)`                      | `:29`   | Niveau d'intégration de paragraphe P2/P3 (0 LTR, 1 RTL).                                                                                                                                                                                                                                                                                                                            |
| `resolveLevels(text)`                     | `:34`   | Niveaux X1 à I2 résolus par caractère (`Uint8Array`).                                                                                                                                                                                                                                                                                                                               |
| `reorderIndices(text)`                    | `:50`   | Permutation visuelle→logique L1+L2 (`indices[v] = logical index at visual column v`). Faisant autorité : la sélection mappe les plages logiques aux parcours visuels à travers cela.                                                                                                                                                                                                |
| `logicalToVisualRuns(text, start, end)`   | `:62`   | Un visuel logique `[start,end)`→ N visuel `[visualStart,visualEnd)` s'exécute, trié de gauche à droite. Un seul rectangle de sélection devient plusieurs lorsqu'il chevauche une limite de direction.                                                                                                                                                                               |
| `reorderVisual<T>(nodes, baseLevel)`      | `:89`   | Inversion L1+L2 sur place des nœuds d'une ligne. Reconstruit `str`+`levels`et itère `reorderSegments`. Chaud dans chaque ligne enroulée.                                                                                                                                                                                                                                            |
| `reorderSegments(str, levels, baseLevel)` | `:121`  | Même permutation que les paires `[start,end]` de tableau typé (commentaire `packages/layout/src/LayoutEngine.ts:2466`) — permet au chemin du tampon zéro-GC (`layoutPreparedIntoBuffer`) de l'appliquer sans allouer d'objets `BidiNode`par glyphe. Synthétise `embed = { levels, paragraphs:[{level: baseLevel}] }` pour que L1 soit réinitialisé dans la direction du paragraphe. |

Coût : un passage `bidi-js`par paragraphe. Aucun travail par glyphe au-delà de la construction du tableau dans `reorderVisual`.

### 2.2 `packages/text/src/ArabicShaper.ts:18` — mise en forme contextuelle

Substitution du formulaire de présentation pour le bloc arabe et les extensions persan/ourdou. `MAPPINGS: { [code]: GlyphForms }`(`:18`) enregistre les points de code `isolated/initial/medial/final`et `joining: 'D'|'R'|'U'`per code point. Tatweel `U+0640`is `'D'` but emits the same code point in every form (`:052`), donc la jonction passe par.

- `isHarakat(code)`(`:70`) —`U+064B–065F`,`U+0670`,`U+0610–061A`(signes honorifiques),`U+06D6–06ED`(annotations coraniques) plus les trois plages de marques adjacentes au harakat. Tous ont un type de jointure TRANSPARENT — la mise en forme doit les ignorer ou le texte honorifique se déconnecte. Miroirs `MSDFFont.ts:isNonspacingMark`(`:132`).
- `getJoiningType(code)`(`:84`) — recherche de table,`'U'` en cas d'absence.
- `shapeArabic(text)`(`:89`) — marche unique de gauche à droite : anticipation de la ligature (`lam+alef` `U+0644`+`U+0627/0622/0623/0625`→ ligature de présentation,`k`pointeur `:105`),`connectPrev`/`connectNext`(`:182`/`:187`) calculée en balayant vers l'arrière/avant sur des marques transparentes,`glyph = forms.isolated/initial/medial/final`. Renvoie `{ shapedText, indexMap: Int32Array }`(`:1`) —`indexMap[visualIndex] = sourceOffset`afin que `LayoutEngine`puisse récupérer `sourceIndex/sourceLength` après la mise en forme.

Contrat de sélection : réorganisation des positions visuelles, mais `sourceIndex` indexe toujours la chaîne logique d'origine.

### 2.3 `packages/text/src/measureContext.ts:41` — mesurez l'endroit où vous peignez

Le module qui existe pour appliquer un invariant. Un `HTMLCanvasElement`détaché résout les familles génériques (`monospace`,`serif`) en une **police différente** de celle du canevas joint au document sur Gecko, car le mappage générique → réel réside dans une préférence de police par langue accessible uniquement à partir d'un contexte de style en direct.

Tableau d'en-tête (`:1`) : Firefox 153,`<html lang="zh">`, DPR 1.5789,`measureText('MMMMMMMMMM')`— détaché `22px monospace`109.7, joint 131.6, mise en page 132.0 ; détaché `serif`109,7/205,5 — les deux se sont effondrés sur une solution de secours codée en dur, erreur de 20 à 47 %. Chrome inchangé.`OffscreenCanvas` mesure 132,0 (correspond à la mise en page) mais n'est pas utilisé - être d'accord avec le canevas **peint** compte plus.

- `createMeasuringContext()`(`:62`) — Toile 1 × 1,`position:absolute;opacity:0;left:-9999px;top:0`,`aria-hidden`, ajoutée à `document.body`.`display:none` le supprimerait de la mise en page et perdrait le contexte de style ; détaché est le mode de défaillance.
- `getSharedMeasuringContext()`(`:87`) — le contexte partagé unique (`:41` `sharedCanvas`/`sharedContext`). Mémorise `null`(distinction `undefined`vs `null`,`:98`) afin que SSR (`typeof document === 'undefined'`) ne réessaye pas la création par glyphe.`ctx.font` est défini avant chaque lecture ; rien en cache de largeur ne voyage avec le contexte.
- `isSharedMeasuringContextAttached()`(`:118`) /`resetSharedMeasuringContext()`(`:130`) — diagnostic + récupération pour les contextes créés avant l'existence de `document.body`. Aujourd’hui, aucun appelant dans le dépôt ne recrée automatiquement ; modèle de site d'appel documenté sur `:111`.

Chaque mesureur doit appeler cela. `packages/layout/src/measure.ts:42`le fait. Grepping détaché `document.createElement('canvas')`dans `packages/` est l'audit.

### 2.4 `packages/text/src/fontMetrics.ts:14` — Registre de métriques sans DOM

Pour les environnements sans canevas du tout (SSR, travailleur sans `OffscreenCanvas`, tests). Valeurs en **unités em** donc un enregistrement convient à toutes les tailles.

- `FontMetricsSource`(`:14`) —`advanceEm(char)`, facultatif `measureEm(text)`(compatible crénage),`ascenderEm`/`descenderEm`. La solution de secours pour `measureEm`somme `advanceEm`, correcte mais supprime le crénage.
- `normalizeFamily`(`:45`) — première famille uniquement, guillemets supprimés, minuscules. Une chaîne de secours est un problème de rendu, pas un problème de registre.
- `registerFontMetrics(family, source)`(`:82`),`registerMSDFFontMetrics(family, font)`(`:97`),`createMSDFMetricsSource(font)`(`:114`) —`advanceEm`de `font.getGlyph(code)?.advance`,`measureEm`de `font.layout(text, 1).width`(le seul chemin qui peut créner — par glyphe `GlyphMeasurer`n'a pas de voisin).`ascenderEm`/`descenderEm`de `font.data.metrics`.`hasFontMetrics`(`:154`) est la sonde bon marché pour court-circuiter lorsque rien n'est enregistré.
- `fontMetricsVersion()`(`:64`),`getFontMetrics`(`:141`),`clearFontMetrics`(`:163`). Le compteur de versions permet aux appelants de mettre en cache une source résolue et de la résoudre à nouveau uniquement lorsqu'elle est détectée, en capturant une source sans vérifier les broches enregistrées à ce moment-là (`:107` dans `measure.ts`).`createMetricsMeasurer`(`measure.ts:96`) contient donc `baseVersion/runVersion`paresseusement et compare une fois par glyphe au lieu d'appeler `normalizeFamily`par glyphe (surcharge `+13%` évitée sur le chemin actif du mesureur).

### 2.4b `packages/text/src/index.ts:1` — le baril

Réexporte `ArabicShaper`,`BidiResolver`,`measureContext`,`PreparedContentGrid`,`MSDFFont`,`fontMetrics`,`Typography`(`:1`).`@vectojs/layout` importe depuis `@vectojs/text`(pas relativement) —`LayoutEngine.ts:1` `import { ArabicShaper } from '@vectojs/text'`— donc la limite du paquet est observable. Le singleton `LayoutWorkerManager`met également en cache `MSDFFontData`(`LayoutWorkerManager.ts:043`) en cas de décès du travailleur exactement pour cette raison : les données métriques traversent la limite du thread une fois et doivent rester disponibles pour le chemin de secours.

### 2.5 `packages/text/src/Typography.ts:4` — ligne de base dans la zone de ligne CSS

CSS centre la police ascendante+descente dans la zone de ligne ; la toile dessine selon un y explicite. Ils doivent être d'accord, sinon un `fillText` et son miroir natif se situent à des lignes de base différentes.

- `BASELINE_CACHE_MAX = 512`(`:12`),`baselineCache: Map<string,number>`(`:4`),`rememberBaseline`(`:14`) — LRU d'ordre d'insertion (suppression + réinitialisation en cas d'accès,`:98`). 512 couvre chaque police dans un document réaliste ; un échec re-mesure un `'Mg'`.
- `splitFontShorthand(font)`(`:33`) — ancré sur `indexOf('px')`et revenant sur les chiffres, pas sur `/(\d+)px/`(polynôme ReDoS,`js/polynomial-redos`, élevé). Met en miroir les analyseurs dans `@vectojs/ui`/`@vectojs/markdown` avec des valeurs d'échec intentionnellement différentes.
- `registeredBaseline(font, lineHeight)`(`:67`) — Chemin sans DOM depuis `getFontMetrics`.`(lineHeight - ascent - descent)/2 + ascent` avec `descent = -descenderEm * size`; solution de secours `lineHeight * 0.8`.
- `cssLineBoxBaseline(font, lineHeight)`(`:93`) — choix ordonné : SSR→`registeredBaseline`; accès au cache → retour ;`getSharedMeasuringContext`(ci-joint,`:107`) →`ctx.measureText('Mg')`→`fontBoundingBoxAscent/Descent || actualBoundingBoxAscent/Descent`(`:112`) → même formule de centrage ; métriques dégénérées → repli `0.8`. La même constante `0.8`ancre `LayoutEngine.ts:shiftedExtent`(`:668`) et la géométrie line-box `1.5 * pMax`/`0.8 * pMax`.
- `clearCssLineBoxMetrics()`(`:122`) — appel une fois le chargement d'une police Web terminé.

### 2.6 `packages/text/src/MSDFFont.ts:151` — Texte GPU

Analyse `msdf-atlas-gen`JSON (tapez `msdf`/`mtsdf`/`sdf`), présente des quads en pixels CSS avec des UV d'atlas. Conventions du moteur de rendu : espace local y-bas, origine en haut à gauche ; UV `v=0` en haut de l'atlas (pas de retournement en Y lors du téléchargement).

- Interfaces : `MSDFAtlasInfo`(`:16`,`distanceRange/size/width/height/yOrigin`),`MSDFMetrics`(`:32`,`lineHeight/ascender/descender`),`MSDFBounds`(`:45`),`MSDFGlyphDef`(`:53`,`unicode/advance/planeBounds/atlasBounds`),`MSDFKerning`(`:64`),`MSDFFontData`(`:71`),`PositionedGlyph`. (`:79`,`x/y/w/h + u0/v0/u1/v1`),`MSDFLayoutResult`(`:96`,`glyphs/width/height`),`MSDFLayoutOptions`(`:105`).
- `kernKey(a,b)`(`:115`) —`a * 0x110000 + b`;`isNonspacingMark(code)`(`:132`) — liste de plages explicite (bon marché en boucle par glyphe, pas d'expression régulière `\p{Mn}`), reflète `LayoutEngine.ts:isComplexScript`(`:584`).
- `MSDFFont`(`:151`) —`id`(`font-${idCounter++}` `:164`),`byCode: Map<number,MSDFGlyphDef>`,`kern: Map<number,number>`,`missingAdvance`(`:158`, espace→`.notdef`→`0.5`).`parse`(`:173`),`getGlyph`(`:178`),`distanceRange`/`atlasWidth`/`atlasHeight`(`:183`).
- `layout(text, fontSizePx, opts)`(`:201`) — compatible avec les points de code (`Array.from(text)` `:212`), honore `\r\n`/`\r` comme une coupure (`:214`), glyphe manquant →`missingAdvance * size`(jamais 0, ou les glyphes ultérieurs ne se décalent vers la gauche) sauf `isNonspacingMark`qui avance de 0 (`:233`) et ne remplace pas `prevCode`pour le crénage (`:252`). Crénage `k * fontSize`(`:242`),`baseline = y + (ascender + line*lineHeight)*size`(`:246`),`planeBounds`→quad (`:246` ff),`yOrigin` retourne `v0/v1`(`:250`). Renvoie `{ glyphs, width: maxAdvance, height: (line+1)*lineHeight*size }`.

### 2.7 `packages/text/src/PreparedContentGrid.ts:38` — le plan de grille retenu

Géométrie immuable et sensible à la source pour le texte de la grille. Compilez une fois, partagez entre la peinture sur toile et la projection DOM – la re-segmentation placerait différemment les bidi, les onglets et les glyphes larges.

- `PreparedContentGrid`(`:38`) —`{ kind:'content-grid', revision, source, font, cellWidth, lineHeight, baseline, tabSize, lines }`;`PrepareContentGridOptions`(`:50`);`MutableCell`(`:63`).
- `graphemeSegmenter`(`:76`,`Intl.Segmenter`avec granularité `grapheme`) avec `fallbackGraphemes`(`:107`) couvrant la combinaison de marques, de sélecteurs de variations, de modificateurs d'emoji, de touches, d'indicateurs régionaux, ZWJ.`graphemes()`(`:151`) préfère `Intl.Segmenter`.
- `isWideCluster`(`:170`) —`EAST_ASIAN_WIDE`(`:91`, blocs CJK) +`EXTENDED_PICTOGRAPHIC`avec sensibilité `VS16`/`VS15`+`EMOJI_PRESENTATION`+`REGIONAL_INDICATOR`/`0x20E3`. Large → 2 colonnes.
- `sourceLines`(`:197`) — possède `\r\n`/`\r`/`\n`;`sourceStart/sourceEnd/nextSourceStart` donc chaque décalage ultérieur est correct.
- `prepareContentGrid(source, opts)`(`:243`) — par ligne :`rawCaretBoundaries`de `graphemes(rawLine)`,`ArabicShaper.shapeArabic(rawLine)`(`:270`),`graphemes(shaped)`,`BidiResolver.resolveLevels`(`:273`), cellule par graphème en forme avec `sourceStart/sourceEnd`via `indexMap`(`:278`),`sourceCaretOffsets`via `lowerBound`(`:159`),`columns = 0/ tabStop / wide?2:1`(`:298`),`BidiResolver.reorderVisual(visualCells, getBaseLevel(shaped))`(`:315`),`x`passe (`:317`). Congelé avant le retour.

### 2.8 `packages/layout/src/LayoutEngine.ts` — le moteur de mise en page de prose

~ 3,4 000 lignes, le fichier unique le plus lourd de la pile de texte. L'architecture est une répartition **froid/chaud** sur les contrats tapés.

**Moitié froide** (coûteuse, sans contrainte) :

- `prepare(text, atlas, size)`(`:1080`) /`prepareRich(spans, atlas, size, baseStyle)`(`:1266`) — exécutez `Intl.Segmenter`(mot `:916`+ graphème `:917`), résolvez les avancées de glyphes via `glyphWidth`(`:929`, atlas→`GlyphMeasurer`→`0.5em`), forme (`ArabicShaper` `:1117`), résolvez le bidi (`BidiResolver` `:1123`/`:1524`), construisez `PreparedText`(`:462`). Le résultat est indépendant de `maxWidth`/`maxHeight`/exclusions. Mémorisation de paragraphe :`paragraphCache: Map<string,PreparedParagraph>`(`:829`) saisi par `${fontSize} ${paragraph}`; variante riche `richParagraphCache`(`:833`) saisie par `${fontSize} ${text} ${styleSig}` où `styleSig` est une signature de valeur RLE sur les champs `TextStyle`+ identité `InlineObject`(gras/italique/color/href/fontFamily/baselineShift/highlightColor/abbrTitle plus objet `width/height/depth/alt/key`). Le changement d'identité de l'Atlas efface les deux (`:1095`/`:1275`).

**Chemin rapide de streaming** dans `prepareRich`:`streamShapeCache`(`:839`, cache incrémentiel à emplacement unique). Conditions à `:1358`: un seul paragraphe, pas de `\n`/`\r`,`!isComplexScript(fullText)`(`:584`— arabe/hébreu/indien/combinaison/marques bidi/modificateurs emoji passent au shaper complet). Lorsque `fullText`étend strictement `cache.text`, styles égaux sur le préfixe (`styleRangeEquals` `:682`,`objectRangeEquals` `:628`), réutilisez les mots de préfixe textuellement et appelez `shapeSimpleRun(fullText, reshapeFrom, ...)`(`:1644`) uniquement sur le suffixe.`reshapeFrom`n'est pas `cache.end`mais le début de la même catégorie finale (espaces ou non-espaces) s'exécute de manière à ce que les limites `Intl.Segmenter`se dissolvent lorsque le morceau suivant arrive (par ex.`"3"+"."+"1"`→`"3.1"`) sont reconstruits correctement. Statut : expédié, mesuré correctement dans les cas extrêmes, négligeable sur des documents réalistes (le mémo plafonne déjà le coût par paragraphe) - conservé à partir de la version autonome `@vectojs/core` par `forge/findings/text-richtext-and-markdown.md:356`.

**Moitié chaude** (pas cher, sous contrainte) :

- `layoutPrepared(prepared, exclusionMask?, exclusions?)`(`:1848`) /`measurePrepared`(`:1772`) /`layoutPreparedIntoBuffer(prepared, buffer, mask?)`(`:2241`) — parcourez `PreparedText`mots, placez des glyphes à `currentX/currentY`, honorez `maxWidth`/`maxHeight`,`exclusions: ExclusionRect[]`,`computeLineSegments(top,bottom,maxWidth,exclusions)`(`:504`,`O(n log n)`fusion d'intervalles x, complément dans `[0,maxWidth]`), suppression de ponctuation orpheline (`suppressLineBreaks` `:721`,`'@'` jointure + fusion de points de fermeture), césure (`breakPoints` à partir de `U+00AD` ou `this._hyphenate` crochet,`hyphenWidth` `:490`), justifier (`textAlign:'justify'`uniquement sur les lignes à plusieurs passages),`shiftedExtent(gfs, shift, pMax)`(`:668`) appliquant la division de boîte de ligne `0.8/0.2`partagée afin qu'un exposant en relief agrandisse la ligne uniquement lorsqu'il quitterait la boîte.`layoutPrepared`alloue `LayoutNode[]`+`LayoutResult`;`layoutPreparedIntoBuffer`écrit des tableaux de type plat sans allocation et applique la même passe BiDi `reorderSegments`.

Autres éléments porteurs : `EMPTY_GLYPH_ATLAS`(`:83`, constante gelée —`Text`/`RichText`transmettez-le afin que le mémo de paragraphe ne soit pas invalidé par appel par un nouveau littéral `{}`; mesuré 2,68 × sur des refontes de paragraphe 200 × 12 `:64`) ;`unmeasuredGlyphCount()`/`resetUnmeasuredGlyphCount()`/`setUnmeasuredGlyphWarning()`(`:8`—`0.5em`les fabrications sont comptées, pas silencieuses ;`fallbackToCanvas`(`:380`, trois états `undefined`vs `true`) ne signale que l'atlas manquant, pas le mesureur manquant) ;`GlyphMeasurer`(`:92`,`measure(char,size,family,bold,italic)`— remplacements de famille/style par exécution afin que `code`en ligne mesure selon ses propres métriques,`warnUnmeasured`(`:9`) avertissement unique déclenché par `unmeasuredGlyphCount`) ;`TextStyle`(`:113`, ~9 champs :`fontSize/color/bold/italic/fontFamily/lineThrough/baselineShift/underline/highlightColor/abbrTitle/href`— chaque champ affectant l'avance doit être dans `styleSig`;`fontFamily`manquait jusqu'au 2026-07-30 et a provoqué la diffusion des métriques `monospace`aux paragraphes `serif`à un taux de réussite du cache infini, latent uniquement parce que le taux de désabonnement de l'atlas vide du pré-fixe a maintenu `paragraphCache`à 0 hit) ;`InlineObject`(`:216`,`OBJECT_REPLACEMENT U+FFFC :198`, corrigé `width/height/depth/alt/key/paint` `:216`,`width/height/depth`déjà résolu en px,`paint`(`:301` `InlineObjectSurface { drawImage, drawImageRect } :315`) jamais appelé par le moteur,`InlineObjectBox { x,y,width,height } :299`inclut déjà `depth`) ;`cacheStats()`(`:1004`) exposant `hits/misses/evictions/hitRate/size/capacity`par `word(500)/grapheme(2000)/paragraph(1000)/richParagraph(1000)`(`:831` majuscules) avec `resetCacheStats()`(`:1030`) préservant les entrées ;`LayoutResult`(`:378` `nodes/totalWidth/totalHeight/fallbackToCanvas`) est la seule sortie de chaque chemin actif ; La répartition `GridTextEntity`(`components/GridTextEntity.ts:4`, héritage `n`) vs `PreparedContentGrid.ts:243`indique explicitement quelle grille est conservée et laquelle est une boucle `fillText` stupide.

Placement hot-pass en termes de code : à l'intérieur de `layoutPrepared`(`LayoutEngine.ts:2050`ff), le `pMax`par paragraphe est d'abord développé pour les objets (`objDescent`/`ascent > pMax*0.8`→`pMax = ascent/0.8`), puis `lineHeight = max(pMax*1.5, pMax*0.8+objDescent)`entraîne `computeLineSegments`/`startLine`(`:2004`), suivi d'un parcours wordQueue (`:2109`) avec séparation trait d'union-préfixe (`:2123` `chosen`/`prefixWidth`/`hyphenWidth`) et une boucle de glyphe (`:2159`) dont le placement `y`(`:2183`) est composé de trois bras : objet (`currentY + pMax*0.8 - (height-depth)`), décalé de la ligne de base (`currentY + (pMax-gfs)*0.8 - baselineShift`), simple (`currentY + (pMax-gfs)*0.8`).`exclusionMask`(`:2155`) et la suppression des espaces de début (`preserveLeadingSpaces` `:796`,`:2180`) sont par glyphe ;`msdfLayout.ts:154` reflète les trois mêmes bras moins les exclusions.

Contrats de support à connaître par `file:line` :

- `GlyphAtlas`(`LayoutEngine.ts:58`,`width/baseSize/ast`) et `EMPTY_GLYPH_ATLAS`par rapport à un nouveau littéral `{}` pour l'identité du mémo de paragraphe (`:83`).
- `PreparedGlyph`(`:402`,`char/width/style/object/level/sourceIndex/sourceLength/atlasMiss`) —`atlasMiss:true`uniquement lorsque `char.trim().length>0 && !hasGlyph`, donc les espaces ne marquent jamais le repli (`:1134` dans `prepare`).
- `PreparedWord`(`:433`,`glyphs/width/isWordLike/isWhitespace/breakPoints`) —`width`est une somme mise en cache,`breakPoints`à partir de tirets souples ou `hyphenate`.
- `ExclusionRect`(`:482`) +`computeLineSegments`(`:504`) —`O(n log n)` complément d'intervalles x couverts, par ligne.
- `LayoutEngine.isComplexScript`(`:584`, conservateur - sur-rapports donc seul le texte clairement sans contexte se qualifie pour la mise en forme avec suffixe uniquement) et `splitParagraphs`(`:566`,`\r\n|\r|\n`,`consumed`conserve les décalages de source exacts afin que CRLF `\r` ne devienne jamais un glyphe de tofu).
- `shiftedExtent`(`:668`) partagé par les trois marches `pMax` — la logique de croissance de ligne ne doit jamais diverger.
- `suppressLineBreaks`(`:721`, GH-457 `'@'` jointure + point de fermeture `.:,;)]}!?` fusionne avec le rebase `breakPoints`).
- `LayoutBuffer`(`:2449`,`{ glyphs: PositionedGlyph[], widths: Float32Array, levels: Uint8Array }` pour `layoutPreparedIntoBuffer` `:2241`, le chemin de tableau typé délimité par `V8_SMI_MAX` qui applique l'accord de mesure/peinture sur le site d'appel).

### 2.8b Saut de ligne, flux d'exclusion et justification — les règles de placement hot-pass

Le passage à chaud est l'endroit où `PreparedText`devient `x/y`. Trois fonctions pures en dehors du moteur et une méthode à l'intérieur régissent chaque décision de bouclage ; ils doivent être d'accord entre `LayoutEngine`(`packages/layout/src/LayoutEngine.ts`) et `msdfLayout`(`packages/layout/src/msdfLayout.ts`) ou les ruptures GPU et canevas divergent.

- **`computeLineSegments(top, bottom, maxWidth, exclusions)`(`LayoutEngine.ts:504`)** — le noyau testable du flux d'exclusion.`ExclusionRect { x,y,width,height }`(`:482`) et `LineSegment { x0,x1 }`(`:490`) sont les seuls types. Espace `O(n log n)`pur (blocs de tri) /`O(n)`: collectez les intervalles x de `exclusions`qui se chevauchent `[top,bottom)` serrés à `[0,maxWidth]`, fusionnez les intervalles touchants/qui se chevauchent, complétez dans `[0,maxWidth]`. Renvoie `[{0,maxWidth}]` lorsque rien ne se chevauche,`[]` lorsqu'un rectangle (ou une union) s'étend sur la largeur. Temps par ligne, pas par glyphe — appelé une fois par avance de `currentY` à l'intérieur de `layoutPrepared`(`:2004` `segs = computeLineSegments(currentY, currentY+lineHeight, maxWidth, exclusions)`). Le garde `hasEx`(`LayoutEngine.ts:1860`) shunte le chemin de non-exclusion (un seul segment pleine largeur) de sorte que le cas courant ne paie aucune allocation.

- **`suppressLineBreaks(words)`(`LayoutEngine.ts:721`)** — Pré-fusion du GH-457 avant le placement. Règle 1 : `'@'`(`glyphs.length===1 && char==='@'`) fusionne avec chaque mot non-espace suivant (`"@vectojs/core"` reste atomique). Règle 2 : le point de fermeture `.:,; ) ] } ! ?` ne commence jamais une ligne - fusionné vers l'arrière avec le mot précédent sans espace (en sautant les mots avec espace, donc `"word !"` ne crée pas de pseudo-mot `" !"`). Doit rebaser `breakPoints: number[]`lors de la fusion (`:732` `+ offset`,`:791` `+ prev.glyphs.length`) ou les opportunités de trait d'union douce atterrissent sur de mauvais indices de glyphe en aval. Miroir dans la logique `msdfLayout.ts:195` `isOrphanPunct`/`breakableAnywhere`(CJK `code >= 0x2e80`).

- **Césure** — deux sources remplissant le même `PreparedWord.breakPoints: number[]`(`LayoutEngine.ts:441`) : les traits d'union souples `U+00AD`dans la source sont des opportunités de coupure invisibles (consommées dans la boucle graphème `:1134` `(breakPoints ??= []).push(glyphs.length)` sans avance), et le `LayoutEngine.hyphenate: (word)=>string[]`(`:880`) enfichable est consulté par `isWordLike && glyphs.length>3`mot (`:1144`) — ses parties sont re-segmentées à travers `getGraphemes`pour compter les graphèmes, pas les unités de code.`hyphenWidth`(`:490`, avance de `'-'` via `glyphWidth`) est mesuré une fois par `PreparedText`uniquement lorsqu'un mot porte `breakPoints`(l'échec ne coûte aucune mesure et dans un nœud sans métrique n'incrémente pas `unmeasuredGlyphs`). Au moment du bouclage, le moteur préfère les pauses douces (`softBreaks: {at,x}[]`dans `msdfLayout.ts:131`) puis revient au split avec trait d'union émettant un quad `'-'`(`msdfLayout.ts:167` `emitHyphen`).`MSDFTextEntity`pilote la césure sur le thread principal via `layoutText` annoté ; le travailleur ne rappelle jamais le rappel.

- **`shiftedExtent(gfs, shift, pMax)`(`LayoutEngine.ts:668`)** — partagé par les trois marches `pMax`(`measurePrepared`,`layoutPrepared`,`layoutPreparedIntoBuffer`) afin que la hauteur de la ligne ne puisse jamais diverger. La zone de ligne mesure `1.5 * pMax`de hauteur avec la ligne de base `0.8 * pMax`(même répartition que `Typography.ts:93`). Exécution surélevée (`shift>0`, CSS `vertical-align`positif, exposant) :`need = shift + 0.8*gfs`doit correspondre à `0.8*pMax` ; abaissé (`shift<0`, indice, signe opposé à `InlineObject.depth`) :`need = -shift + 0.2*gfs`doit correspondre à `0.7*pMax`. Exemple :`0.75em`supershift `~0.3em` s'insère dans le jeu `0.8*(pMax-gfs)` et ne génère rien ; un décalage éloigné fait passer `pMax` à `need/0.8` ou `need/0.7`. Chaque passe de justification et avance d'exclusion est recalculée par rapport au `pMax` final.

- **`justifyLines(wrapClosedLines, lineOf, xCoords, codePoints, advances, maxWidth, maxLineWidth)`(`msdfLayout.ts:11`+`LayoutEngine.ts:1937`)** — étend chaque ligne enveloppée de manière souple jusqu'à `maxWidth`. Stratégie : regroupez `indices`par `lineOf`, sautez `wrapClosedLines`miss (dernière ligne de chaque paragraphe, nouvelle ligne explicite et troncature `hitMaxHeight`), puis `slack = maxWidth - (xCoords[lastIdx]+advances[lastIdx])`plafonné à la moitié de l'étendue de la ligne (protège contre l'étirement grotesque sur des lignes très courtes). Les lignes pleines d'espace élargissent également les espaces `0x20`entre les mots (`extra = slack / spaceIdx.length`,`shift`accumulateur `:58`) ; Les lignes CJK sans espace répartissent `slack / lastContent`entre chaque glyphe (`:70`). Les lignes d'exclusion à passages multiples ne sont pas justifiées (garde à passage unique `LayoutEngine.ts:1937`). Doit refléter entre `LayoutEngine`et `msdfLayout`— la largeur justifiée correspond à la réutilisation de la projection du contenu du contrat pour `positionedRuns`par rapport à `logicalRuns`.

### 2.9 `packages/layout/src/measure.ts:39` — sélection du mesureur

- `createCanvasMeasurer(family, baseSize=100)`(`:39`) —`getSharedMeasuringContext()`(`:44`),`Map<string,number>`cache par graphème à `baseSize`, mise à l'échelle linéaire `base * (size/baseSize)`(`:68`). Les touches `family/bold/italic` par exécution empêchent le poison.
- `createMetricsMeasurer(family)`(`:96`) — enregistré `FontMetricsSource`(`:106` résolution paresseuse avec comparaison versionnée `fontMetricsVersion`, surcharge `+13%` pour la recherche par glyphe évitée à chaque appel par rapport à l'allocation à l'intérieur de `normalizeFamily`). Le remplacement de `family`par exécution revient à la source de base lorsqu'il n'est pas enregistré pour cette exécution, et non à `0.5em`. Gras/italique intentionnellement ignoré (un seul tableau d'avance par famille).
- `resolveGlyphMeasurer`(`:161`) — le canevas l'emporte sur les métriques par rapport à `null` de par sa conception : il mesure ce que le moteur de rendu dessine, y compris le poids synthétisé ; un enregistrement périmé ne doit pas remplacer la vérité terrain.

### 2.10 `packages/layout/src/msdfLayout.ts:93` — Retour à la ligne MSDF pour le travailleur

Fonction pure `computeMSDFLayout(request, font)`(`:93`) partagée par le travailleur et le thread de secours principal (pas d'importation au moment de l'exécution - esbuild l'intègre dans `LayoutWorker.ts`via `LayoutWorkerSource.ts`- afin que le thread de secours principal ne puisse pas s'écarter du travailleur). Homologue à tableau plat de `LayoutEngine.layoutPrepared`sans exclusions / rappel de collision par glyphe / styles riches : consomme `font.glyphs[].advance/kerning`(`byCode/kern`),`metrics{ascender,descender,lineHeight}`(repli `0.8/-0.2`en cas d'absence de `:118`),`atlas` `aw/ah/yOrigin`(`:103`) pour la géométrie UV, mais ne lit jamais `planeBounds/atlasBounds`— ceux-ci appartiennent à `MSDFFont.layout`sur le côté noyau. Parcourt `Array.from(text)`(`:176`, codepoint-safe), avance `curX`par glyphe avec `kernKey(prevCode,code)`(`:192` `+ k*fontSize`) +`letterSpacing`(`:121`), mise en miroir à avance nulle sans espacement `MSDFFont.ts:132`, trait d'union/ponction orphelin `isOrphanPunct`(`:201`, même ensemble que `suppressLineBreaks`) et `breakableAnywhere`(`:195`, CJK `>=0x2e80`),`wrapClosedLines: Set<number>`,`softBreaks: {at,x}[]`(`:131`),`lineOf: number[]`(`:107`),`xCoords/yCoords: number[]`,`packedStyles: number[]`(`:104`, emballé `TextStyle`bits),`advances: number[]`(`:110`),`codePoints: number[]`(`:101`),`maxLineWidth`(`:114`). Sur l'emballage (`breakLine` `:140`,`dropFrom` `:155`,`emitHyphen` `:167`),`justifyLines(wrapClosedLines, lineOf, xCoords, codePoints, advances, maxWidth, maxLineWidth)`(`:11`) étend les espaces `SPACE(32)`entre les mots (`:44`) ou sur CJK sans espace distribue `slack/lastContent`entre chaque glyphe (`:70`), tous deux plafonnés à la moitié de l'envergure de la ligne pour éviter un étirement grotesque sur des tours très courts.

### 2.11 Modèle Worker hors thread

**Limite** : `LayoutWorker.ts:4`(`LayoutWorkerRequest`:`id/seqId/text/fontId/fontData/maxWidth/maxHeight/fontSize/lineHeight/letterSpacing/textAlign`) et `LayoutWorkerResponse`(`:24`:`id/seqId/width/height + Uint32Array codePoints / Float32Array xCoords/yCoords / Uint32Array packedStyles + error?:string`) ; tampons transférables dans `postMessage`(`LayoutWorker.ts:111`).

**Travailleur** : `packages/layout/src/LayoutWorker.ts:1`— ~115 lignes,`fontCache: Map<string,MSDFFontData>`(`:42`),`isLayoutWorkerRequest`validation (`:53`),`isExpectedOrigin`(`:48`),`self.onmessage`(`:76`) →`fontCache.set`→`computeMSDFLayout(request, font)`→`postMessage(response, [codePoints.buffer, xCoords.buffer, yCoords.buffer, packedStyles.buffer])`. Police inconnue → réponse de longueur nulle en forme d'erreur (`LayoutWorker.ts:92`) plutôt que suppression silencieuse.

**Manager** : `packages/layout/src/LayoutWorkerManager.ts:28`— singleton (`getInstance` `:206`),`createWorker`(`:67`) via `new Blob([WORKER_SOURCE_STRING])`+`URL.createObjectURL`(`LayoutWorkerSource.ts`; miroirs `MarkdownWorker`Garde CSP :`typeof Worker/Blob/URL`absent →`null`→ repli du fil principal, pas un lancer).`onmessage`fait correspondre `${id}-${seqId}`(`:99`) avec `pendingCallbacks: Map<string,PendingLayout>`(`:34`), réinitialise `consecutiveWorkerFailures`(`:109`).`onerror/onmessageerror`→`handleWorkerFailure`(`:120`),`MAX_CONSECUTIVE_WORKER_FAILURES=2`(`:19`) puis `workerUnavailable=true`→ rester sur le thread principal (CSP `worker-src 'none'`mesuré le 31/07/2026 : six appels `queueLayout`ont généré six Workers, zéro mise en page).`fontDataById`(`:043`, conservé à vie, distinct de `registeredFonts`effacé en cas de décès du travailleur) permet à la disposition de secours de fonctionner lorsque les appelants ne transmettent `fontData`qu'une seule fois.`warnedUnknownFonts`(`:049`) fait taire les avertissements répétés de la console.`queueLayout(entityId, opts, callback)`(`:224`) rebondit 50 ms (`:314` `setTimeout(runLayout,50)`) et compare `seqIdCounter`afin que les réponses tardives soient ignorées ;`cancelLayout/cancelLayoutForEntity`(`:220`/`:319`) draine les minuteries et `prefix === ${entityId}-`les entrées de carte en attente.`resolvePendingOnMainThread`(`:144`) relit chaque `computeMSDFLayout`en attente directement lorsque le travailleur décède.`errorResponse`(`:176`) synthétise la forme de réponse de police inconnue.

**Consommateur** : `packages/core/src/text/MSDFTextEntity.ts:25`—`queueLayout()`(`:204`) appelle `LayoutWorkerManager.getInstance().queueLayout(this.id, { id, seqId: ++seqId, text: layoutText, fontId: font.id, fontData: font.data, maxWidth/maxHeight/fontSize/lineHeight/letterSpacing/textAlign }, cb)`;`seqId`monotone par entité,`lastRenderedSeqId`(`:048`) supprime les réponses obsolètes,`contentEpoch`(`:051`) ignore les synchronisations inchangées,`rebuildProjectionLines()`(`:273`) reconstruit `projectionLines: ContentProjectionLine[]`pour `getContentProjection()`(`:248`). Hyphenator s'exécute sur le thread principal (ne peut pas être cloné dans le travailleur) en annotant `layoutText`avec `U+00AD`.`watchAtlasDecode`(`:106`) attend le décodage de l'image de l'atlas ;`SVGEntity.ts` est l'entité non textuelle sœur.

### 2.12 Repères, comparaisons et manière dont les chiffres sont produits

La mise en page du texte a deux coûts honnêtes : **froid** (segment+mesure) et **chaud** (lieu). Comparer un appel combiné froid + chaud à un appel chaud invente un écart. Le dépôt applique la répartition pommes-pommes à trois endroits :

- **`benchmarks/text-layout-pretext`** et **`comparisons/text-layout-pretext/*`** (`entry.ts:1`,`page/*`,`serve.ts`,`build.ts`) —`@vectojs/layout` contre `@chenglou/pretext`. Les deux mesurent via `canvas measureText`dans un vrai navigateur (voir l'en-tête `comparisons/text-layout-pretext/entry.ts:1`: V8 et Gecko diffèrent et seule une fenêtre dirigée par GPU est citable -`hyprland-browser-bench`possède ce harnais).`prepare`contre `prepareWithSegments`(froid) et `measurePrepared`contre `layout`(chaud) sont les seules moitiés comparables ;`layoutPrepared`/`layoutText` (qui positionne chaque glyphe) n'ont pas d'équivalent prétexte et sont rapportés séparément.
- **`scripts/compare-pretext.ts:1`** — l'homologue sans tête géré par `benchmarks/bench.ts`. Regroupe `vectojs core`+`pretext`à IIFE via `Bun.build`, injecte dans Chrome contrôlé par Playwright, établit la vérité DOM via `Range.getClientRects().length`par corpus/police, puis rapporte l'erreur de comptage de lignes par rapport à la vérité plus le débit froid/chaud. Documente sa propre histoire : jusqu'au 04/08/2026, il a chronométré notre `layoutText()`combiné sous prétexte du `layout()`chaud et a été signalé dans `vectojs-docs/testing-catalog.md:A6` comme "pas encore des pommes avec des pommes".
- **`vectojs-docs/forge/baselines/*`** — les lignes de base semi-officielles produites par le harnais (`glyph-batch-*.json`,`content-projection-frontload-*.json`, etc.). Tous ne sont pas dotés d'une mise en page de texte :`glyph-batch`est le coût de téléchargement de glyphes WebGL qui partage le chemin de largeur `LayoutBuffer`, et `markdown-stream-*`capture l'interaction lex+layout pendant la diffusion. Chacun transporte `commit`, CPU/GPU/driver env et `refreshHz`via `benchmarks/run-browsers.sh` afin qu'une comparaison ultérieure puisse se normaliser.

**Comment réexécuter localement** (sans tête, non citable mais utile pour la régression) : `bun run scripts/compare-pretext.ts`(Playwright +`google-chrome-stable`) imprime un tableau de démarques et écrit `scripts/.compare-results.json`. Pour les numéros citables :`benchmarks/run-browsers.sh` à partir de la racine de l'espace de travail (pilote le vrai Chrome/Firefox sur l'espace de travail dédié Hyprland, valide COOP/COEP, détection de famine).

## 3. Comment il se compose sous `packages/core`

`MSDFTextEntity.text`→`rebuildLayoutText()`(`:187`, annote les traits d'union souples) →`queueLayout()`(anti-rebond de 50 ms) →`LayoutWorkerManager`(worker ou thread principal) →`computeMSDFLayout`→ tableaux typés →`MSDFTextEntity.layoutResult`+`projectionLines`→ WebGL `setMSDFTexture`/`addGlyph`par `PositionedGlyph`,`getContentProjection().lines`pour a11y,`CanvasGeometry` compensation DPR.

`Text`/`RichText`(`@vectojs/ui`) passe directement par `LayoutEngine`+`measureContext` (chemin du canevas). Mêmes invariants, mesureur différent.

### 2.13 La note de bas de page `GridTextEntity` — grille conservée vs prose conservée

`packages/core/src/components/GridTextEntity.ts:4`(`class n extends Entity`,`GridTextEntity`) est l'entité de grille monospace héritée (`charWidth/charHeight`fixe,`updateGrid(ascii[])` `:23`,`render` `:36`). Il est antérieur à `prepareContentGrid`et ne coule **pas** le bidi, ne façonne pas l'arabe et n'honore pas `PreparedContentGrid`- il s'agit d'une boucle directe `IRenderer.fillText`(`:44`) sur un `ascii: string[]`. Le remplacement moderne de tout ce qui nécessite bidi/CJK/grid a11y est `prepareContentGrid`(`packages/text/src/PreparedContentGrid.ts:243`) avec sa projection de grille de contenu (`01-selection.md`§3.3).`GridTextEntity`reste comme "la chose la plus stupide qui peint le monospace" et les surfaces dans `packages/core/test/GridTextEntity.test.ts`et `packages/core/src/index.ts:n`.

## 4. Cas difficiles – échecs mesurés

### 4.1 Résolution de la police de canevas détachée (Firefox uniquement)

Greppable comme `Intl.Segmenter`(mot `:916`/ graphème `:917` dans `LayoutEngine.ts`,`:76` dans `PreparedContentGrid.ts`),`BidiResolver`/`BiDi`(`BidiResolver.ts:3` `bidi-js`),`registerFontMetrics`(`fontMetrics.ts:82`, appelé directement dans `Typography.ts:67`via `getFontMetrics`et indirectement depuis `measure.ts:75`),`cold/hot split`(`LayoutEngine.ts:459`–`1848`, commenté avec ** et `measurePrepared`/`layoutPrepared`/`layoutPreparedIntoBuffer`triptyque), et `zero-GC`(`LayoutEngine.ts:2241` `layoutPreparedIntoBuffer`+`msdfLayout.ts:1`flat arrays +`BidiResolver.reorderSegments` `:121`). Le flux d’exclusion d’audit est `computeLineSegments` `:504` et `ExclusionRect` `:482`; La quantification DPR est `PAGE_SCALE_BASIS_PX = 256`(`ContentProjectionManager.ts:71`).

Voir tableau §2.3 (`packages/text/src/measureContext.ts:18`) : avancées monolithiques courtes de 20 à 47 %. Le correctif est un attachement ; 0,3 % résiduel (`131.579`vs `132.000`) est ajusté à la grille Gecko sur un périphérique entier px, non évitable (`text-rendering: geometricPrecision`mesuré de manière identique,`:34`). Audit en recherchant la création de canevas détaché (`grep -rn 'createElement.*canvas'` `packages/`).`OffscreenCanvas`n'est pas la solution - il est en accord avec la disposition DOM (`132.000`) plutôt qu'avec la toile peinte (`131.579`).

### 4.2 Métriques CJK vs Latin

Le repli `0.5em`mesurait l'erreur `+125%` sur les glyphes étroits et `-47%` sur les larges par rapport à Chrome à 32 px (commentaire `packages/layout/src/LayoutEngine.ts:973`).`EMPTY_GLYPH_ATLAS`(`:83`) avec un vrai `resolveGlyphMeasurer`corrige l'erreur de saut de ligne ;`createMetricsMeasurer`avec `MSDFFont`enregistré guérit SSR/sans tête. Un `CJK | Latin`mélangé dans un paragraphe atterrit dans la même exécution `layoutPrepared`;`GlyphMeasurer`clés par exécution `fontFamily/bold/italic`donc `monospace`à l'intérieur de la proportionnelle utilise ses propres avancées, et `styleSig`inclut tous les champs `TextStyle` affectant l'avance.

### 4.3 Réorganisation BiDi vs ordre de sélection

`reorderIndices`est le pont : logique → visuel (`logicalToVisualRuns` `:62`) pour les tons clairs, colonne visuelle → logique pour les tests de frappe,`reorderVisual`(`:89`) pour l'ordre des peintures.`PreparedContentGrid`maintient `cells`dans un ordre logique avec le visuel `x`(`packages/text/src/PreparedContentGrid.ts:315`) ; les décalages de sélection sont des décalages source (logiques), pas des indices visuels. Voir `tmp/boss-research/01-selection.md`§3.2/§4.1 pour le support par graphème +`shapedPaint`la moitié de ce contrat et `forge/findings/text-richtext-and-markdown.md:356`(InlineObject) pour où `buildVisualLineGroups`regroupé par `node.y + height*0.8` et diviser une puce en sa propre ligne.

### 4.4 Polices de secours mixtes dans un paragraphe

Un paragraphe intitulé `family: 'Noto Sans'`avec une étendue de code `family:'monospace'`.`GlyphMeasurer.measure(char,size,'monospace')`(`packages/layout/src/measure.ts:60`) mesure cette famille ; la famille d'exécution inconnue revient à la source de base, et non à `0.5em`(`:138`). Le mémo du paragraphe `styleSig`inclut `fontFamily`(manquait jusqu'au 30/07/2026, latent uniquement parce que le taux de désabonnement de l'atlas vide maintenait le cache à 0 accès). Test :`benchmarks/text-layout-pretext`/`comparisons/text-layout-pretext`et `scripts/compare-pretext.ts:1`(pommes froides/chaudes avec pommes `Range.getClientRects` vérité du nombre de lignes).

### 4.5 Avancées sensibles au DPR

Canvas avance l'ajustement de la grille aux px de l'appareil ; `LayoutEngine` `shiftedExtent`/`cssLineBoxBaseline`utilisent le rapport de remontée `0.8`indépendant du DPR. L'atlas CodeBlock a une fois capturé `devicePixelRatio`lors de la première construction (`packages/markdown/src/Markdown.ts:1358`,`GlyphRasterAtlas.ts:139` `readonly dpr`) et flou après le zoom (`forge/findings/text-richtext-and-markdown.md:724`,`sceneDpr 4.286 / atlasDpr 1.579 → blitScale 2.71`). Correctif : introduisez `Scene.watchDevicePixelRatio()`(`Scene.ts:2805`) dans l'atlas DPR. Revérifiez via `maxGradient`(bord de crête), pas de luminance moyenne (confondue par de minces glyphes mono, mesurée `0.216→0.251`dans le mauvais sens avec un décalage de 2,71 ×). Le serrage DPR `min(dpr,3)`à `Atlas.ts:139`est un plafond séparé — même une reconstruction correcte ne peut pas dépasser 3 sur un panneau `4.286`.

### 4.6 Propriété de fin de ligne et glyphes fantômes CRLF

`splitParagraphs`(`LayoutEngine.ts:566`) regex `/\r\n|[\r\n]/g` et `MSDFFont.layout`(`MSDFFont.ts:213`) consomment tous deux le séparateur **avant** toute étape `ArabicShaper`/`BidiResolver`/`glyphWidth`et enregistrent `consumed`(`:569` `m[0].length`) pour la continuité `sourceIndex`. Un `text.split('\n')`naïf laisse `\r` comme dernier caractère du paragraphe : il est façonné, mesuré et placé comme un tofu visible avec une largeur `missingAdvance*size`, et chaque `sourceIndex`ultérieur est décalé d'un par CRLF.`PreparedContentGrid.sourceLines`(`:197`) porte le même contrat (`sourceEnd`exclut la pause,`nextSourceStart`en est propriétaire) et insère en outre une ligne vide de fin explicite lorsque `source`se termine par une pause (`:217` `if (start===source.length)`). Test :`benchmarks/text-layout-pretext`normalise la source en `\n` pour la vérité DOM mais mesure la source brute séparément ; la parité signifie que la source brute `"\r\n"` produit une couverture `totalHeight` et `sourceIndex` identique à celle de la source `"\n"`, juste avec un écart `sourceLength` de 1 par ligne.

### 4.7 Césure + orphelin-ponctuel + justification doivent composer dans l'ordre

Froid : le trait d'union souple `U+00AD`(`LayoutEngine.ts:1134`) et le rappel `hyphenate`(`:1144`) contribuent tous deux à `PreparedWord.breakPoints`(`:441`) ;`hyphenWidth`(`:490`) est mesuré une seule fois pour les mots qui en ont. Chaud :`suppressLineBreaks`(`:721`) rebase `breakPoints`lors de la fusion afin qu'un trait d'union divisé à l'intérieur de `"@vectojs/core"` n'atterrisse pas au milieu du jeton désormais atomique ; le parcours de la file d'attente de mots (`:2109` ff) préfère un trait d'union de préfixe (`chosen` scan `:2133`) avant de revenir au retour à la ligne de mots entiers. Conséquence :`wrapClosedLines`(`msdfLayout.ts:125`) et `justifyLines`(`:11`) lisent tous deux la décision de rupture finale, donc fixer l'un sans l'autre produit une ligne justifiée dont la largeur mesurée (pour la projection) n'est pas d'accord avec son `x`placé (pour l'encre).`LayoutEngine`et `msdfLayout`dupliquent le trait d'union `+ letterSpacing` + la logique orpheline - changer l'un sans l'autre est la régression courante.

## 5. Les invariants que les développeurs doivent conserver

1. **Mesurez où vous peignez.** Utilisez `getSharedMeasuringContext()`(`packages/text/src/measureContext.ts:87`). Recherchez les `document.createElement('canvas')`parasites sans `appendChild`.
2. **Froid avant chaud, ne jamais re-segmenter pour un DOM.** `prepare`/`prepareRich`une fois,`layoutPrepared`plusieurs fois (`packages/layout/src/LayoutEngine.ts:1080` `/` `:1266` `/` `:1848`). Re-segmentation des pauses et de l'ordre des bidi.
3. **Chaque champ affectant l'avance dans `styleSig`.** S'il atteint `glyphWidth`, il atteint `styleSig`/`fingerprint`(`:1266:styleSig`). En omettre un est latent jusqu'à ce que les caches de paragraphe restaurent le taux de réussite.
4. **L'identité `InlineObject`inclut `key`.** Deux `U+FFFC`avec le même `alt/width/height`mais différents `paint`doivent différer sur `key`ou le second peint la première image (`packages/layout/src/LayoutEngine.ts:268`).
5. **Worker est une optimisation, jamais une exigence.** `LayoutWorkerManager`se dégrade en `computeMSDFLayout`sur le thread appelant (`:144`) après deux échecs consécutifs ou en l'absence de `Worker`. Police inconnue → erreur de frappe, jamais de rappel bloqué (`:176`).
6. **`indexMap`et `sourceIndex`restent fidèles aux octets.** La carte d'index de mise en forme arabe (`packages/text/src/ArabicShaper.ts:91`) est la source de vérité ;`LayoutNode.sourceIndex/sourceLength`indexe la chaîne d'origine, pas le texte mis en forme, afin que l'accessibilité puisse remplacer `InlineObject.alt`sans décaler les décalages ultérieurs (`forge/findings/text-richtext-and-markdown.md:372`).
7. **Version du registre de métriques.** `fontMetricsVersion()`(`packages/text/src/fontMetrics.ts:64`) doit être lu avant de mettre en cache un `FontMetricsSource` ; le remplacement des métriques d'une famille à mi-processus est un véritable chemin de code (échange de polices Web, données corrigées).
8. **`0.5em`signifie non mesuré — comptez-le.** Regardez `unmeasuredGlyphCount()`(`packages/layout/src/LayoutEngine.ts:31`) dans les tests/SSR ; non nul signifie des coupures fabriquées, pas seulement des glyphes d'atlas manquants (`fallbackToCanvas`est vrai sur pratiquement tous les paragraphes `Text`/`RichText` et ne dit rien sur la qualité).

## 6. Comment ajouter un nouveau script ou style sans rompre la parité des métriques

**Nouveau script (par exemple, thaï, devanagari) :**

1. Exécutez `isComplexScript`(`packages/layout/src/LayoutEngine.ts:584`) sur un corpus - le prédicat ouvre le raccourci de streaming `shapeSimpleRun`(`:1358`). Tout script contextuel doit renvoyer `true`afin que le paragraphe prenne le chemin complet `shapeArabic`+`BidiResolver` ; sinon, le remodeleur de suffixes uniquement façonne les graphèmes de manière indépendante et déconnecte silencieusement le texte joint.
2. Si les marques sont TRANSPARENTES pour la mise en forme, ajoutez-les ensemble à `ArabicShaper.isHarakat`(`:70`) et `MSDFFont.isNonspacingMark`(`:132`) - ce sont des paquets de feuilles qui doivent être d'accord.
3. Ajoutez une couverture avancée : soit des glyphes d'atlas MSDF pour le script, soit des métriques enregistrées (`registerMSDFFontMetrics`,`packages/text/src/fontMetrics.ts:97`). Sans l'un ou l'autre,`unmeasuredGlyphs`compte chaque caractère et les sauts sont des suppositions `0.5em`.
4. Vérifiez avec `auditSceneSelection`(`packages/devtools/src/selectionAudit.ts`) sur une ligne mélangeant le nouveau script avec CJK+Latin — le budget d'écart est la quantification `PAGE_SCALE_BASIS_PX = 256`(`ContentProjectionManager.ts:71`), donc un script qui change l'avance par voisin y est invisible.

**Nouveau champ `TextStyle` :**

1. Demandez : « est-ce que cela change `glyphWidth` ? » Si le moteur de rendu le peint en offset/décoration sans changer l'avance réservée (`underline`,`lineThrough`,`highlightColor`), pas de travail de parité. S'il modifie l'avance mesurée (`fontSize`,`fontFamily`,`bold`,`italic`, tout ce qui sélectionne un chemin `measure`différent), il doit être inclus dans `styleSig`/`fingerprint`(`packages/layout/src/LayoutEngine.ts:1266`) et dans `styleRangeEquals`(`:682`).
2. Ajoutez le champ à l'égalité de style et à la signature ensemble - tester un seul laisse l'autre comme un poison pour mémo (différents paragraphes entrent en collision, le même paragraphe n'arrive jamais).
3. Ajoutez une croissance verticale de style `baselineShift`via `shiftedExtent`(`:668`) si le champ déplace les glyphes verticalement en dehors de `0.8 * pMax`(montée) /`0.7 * pMax`(descente) ; les trois marches `pMax` doivent l'appeler.

**Nouvelle règle de saut de ligne :**

- Vit à `suppressLineBreaks`(`:721`) ou `justifyLines`(`packages/layout/src/msdfLayout.ts:11`). Gardez la césure `breakPoints`décalée lors de la fusion (`:732` `+ offset`,`:791` `+ glyphs.length`). L'état d'enveloppement (`wrapClosedLines`,`lineOf`,`softBreaks`) est dupliqué entre `LayoutEngine`et `msdfLayout` — changez les deux.

### 4.8 Mixage vertical — `baselineShift` et objets en ligne

**`TextStyle.baselineShift`(`LayoutEngine.ts:146`, px,`positive = UP`, convention CSS `vertical-align`)** — rendu uniquement horizontalement (avance inchangée) mais changement de mesure verticalement. Les valeurs suffisamment modestes pour s'adapter au jeu `0.8/0.7 * pMax`laissent la hauteur de ligne intacte (un exposant `0.75em` `+0.22em` est le cas courant) ; un décalage qui placerait un glyphe à l'extérieur de la zone de ligne entraîne `shiftedExtent`(`:668`) à développer `pMax`, et la valeur croissante se propage à chaque avance `currentY`et à chaque appel `computeLineSegments`- de sorte que l'espace entre _this_ ligne et la suivante s'élargit, exactement comme le forcerait un grand objet en ligne. Les appelants ne doivent pas réserver eux-mêmes un espace vertical ; le moteur le fait une fois, au même endroit, ou les trois marches `pMax`ne sont pas d'accord et `measurePrepared`signale une hauteur différente de celle des peintures `layoutPrepared`.

**`InlineObject`(`LayoutEngine.ts:216`,`StyledSpan.object` `:343` nécessite `text===OBJECT_REPLACEMENT`)** — trois nombres, tous **px à la taille finale** (non mis à l'échelle par l'exécution `fontSize`, contrairement aux avancées de glyphes) :`width`(avance horizontale),`height`(boîte totale),`depth`(en dessous de la ligne de base, positif vers le bas — signe opposé à `baselineShift`). Le moteur réserve `width`, comptabilise `height/depth`dans la croissance de `shiftedExtent`et signale la case `LayoutNode.object`positionnée (`x/y`inclut déjà `depth`) ; il n'appelle jamais `object.paint(surface, box)`(`:301`) — le moteur de rendu de texte le fait une fois par `LayoutNode.object`. Piège :`alt`atteint l'accessibilité via `RichText.accessibleText`(`collectSpans`remplace `alt`pour `U+FFFC`) mais `copy/selection`indexe toujours par la sentinelle à un caractère dans l'espace `sourceText`, donc la longueur de `alt`ne change pas plus tard dans l'arithmétique `sourceIndex`. Un deuxième piège avec le même symptôme :`paint`ne fait **pas** partie de la clé mémo du paragraphe (une fermeture par appel la maintiendrait à 0 hit pour toujours) — le substitut `InlineObject.key`(`:259`) doit différer lorsque `paint`diffère, ou deux badges avec le même `alt`partagent un paragraphe en cache et le second dessine la première image (réobservée `forge/findings/text-richtext-and-markdown.md` a11y/InlineObject entrées).

### 4.9 Coût du streaming et pourquoi la mise en forme des suffixes uniquement n'est pas la bonne solution

`LayoutEngine.streamShapeCache`(`:839`,`isComplexScript` `:584` gate,`shapeSimpleRun` `:1644`) a été introduit à côté du mémo de paragraphe (`:829`/`833`) pour réduire le coût par morceau de `O(length)`à `O(appended)`sur un bloc Markdown croissant (`Markdown.ts:899`streaming `appendMarkdown`). Mesuré sur la doc synthétique de 346 Ko (`forge/findings/text-richtext-and-markdown.md:356`) : **coût identique 2630 ms vs 2639 ms**. Le vrai Markdown a des paragraphes délimités - le mémo existant limite déjà la refonte par paragraphe - donc la mise en forme par suffixe uniquement n'aide que les énormes paragraphes pathologiques. Le résultat est resté livré comme une victoire d'exactitude (son prédicat `isComplexScript`et ses vérifications `styleRangeEquals`/`objectRangeEquals`empêchent la déconnexion silencieuse du texte de jointure) mais n'a **pas** été publié en tant que correctif de performances dans une version autonome `@vectojs/core`. Lors du diagnostic de la durée de diffusion,`prepareRich`+`measureText`+ synchronisation de projection de contenu (`forge/findings`entrée du 20/07/2026 :`perf.ts` `requestAnimationFrame`delta) est important ; MSDF modifie le glyphe _drawing_ et `64fps→120Hz` est un chemin distinct.

## 5b. Invariants étendus (étendus à partir du §5)

1. **Mesurez où vous peignez.** Utilisez `getSharedMeasuringContext()`(`packages/text/src/measureContext.ts:87`). Recherchez les `document.createElement('canvas')`parasites sans `appendChild`.
2. **Froid avant chaud, ne jamais re-segmenter pour un DOM.** `prepare`/`prepareRich`une fois,`layoutPrepared`plusieurs fois (`packages/layout/src/LayoutEngine.ts:1080` `/` `:1266` `/` `:1848`). Re-segmentation des pauses et de l'ordre des bidi.
3. **Chaque champ affectant l'avance dans `styleSig`.** S'il atteint `glyphWidth`, il atteint `styleSig`/`fingerprint`(`:1266:styleSig`). En omettre un est latent jusqu'à ce que les caches de paragraphe restaurent le taux de réussite.
4. **L'identité `InlineObject`inclut `key`.** Deux `U+FFFC`avec le même `alt/width/height`mais différents `paint`doivent différer sur `key`ou le second peint la première image (`packages/layout/src/LayoutEngine.ts:268`).
5. **Worker est une optimisation, jamais une exigence.** `LayoutWorkerManager`se dégrade en `computeMSDFLayout`sur le thread appelant (`:144`) après deux échecs consécutifs ou en l'absence de `Worker`. Police inconnue → erreur de frappe, jamais de rappel bloqué (`:176`).
6. **`indexMap`et `sourceIndex`restent fidèles aux octets.** La carte d'index de mise en forme arabe (`packages/text/src/ArabicShaper.ts:91`) est la source de vérité ;`LayoutNode.sourceIndex/sourceLength`indexe la chaîne d'origine, pas le texte mis en forme, afin que l'accessibilité puisse remplacer `InlineObject.alt`sans décaler les décalages ultérieurs (`forge/findings/text-richtext-and-markdown.md:372`).
7. **Version du registre de métriques.** `fontMetricsVersion()`(`packages/text/src/fontMetrics.ts:64`) doit être lu avant de mettre en cache un `FontMetricsSource` ; le remplacement des métriques d'une famille à mi-processus est un véritable chemin de code (échange de polices Web, données corrigées).
8. **`0.5em`signifie non mesuré — comptez-le.** Regardez `unmeasuredGlyphCount()`(`packages/layout/src/LayoutEngine.ts:31`) dans les tests/SSR ; non nul signifie des coupures fabriquées, pas seulement des glyphes d'atlas manquants (`fallbackToCanvas`est vrai sur pratiquement tous les paragraphes `Text`/`RichText` et ne dit rien sur la qualité).
9. **`\r` et CRLF ne sont jamais façonnés.**`splitParagraphs`(`LayoutEngine.ts:566`,`PreparedContentGrid.ts:197`) et `MSDFFont.layout`(`MSDFFont.ts:213`) possèdent tous deux leurs propres fins de ligne avant toute étape de forme/mesure ; un `\r` parasite qui se glisse devient un glyphe positionné avec une largeur fantôme et un mauvais `sourceIndex`.
10. **Allocation de miroirs Zero-GC — gardez la passe BiDi synchronisée.** `layoutPreparedIntoBuffer`(`:2241`) doit appliquer la même permutation `BidiResolver.reorderSegments`(`BidiResolver.ts:121`typé-array) que `layoutPrepared`'s `reorderVisual`(`:89`), et doit refléter `shiftedExtent`/`computeLineSegments`/`justifyLines`. La dérive ici est silencieuse jusqu'à ce qu'un paragraphe bidi défile.

## 6b. Guide étendu (élargi à partir du §6)

**Nouveau script (par exemple, thaï, devanagari) :**

1. Exécutez `isComplexScript`(`packages/layout/src/LayoutEngine.ts:584`) sur un corpus - le prédicat ouvre le raccourci de streaming `shapeSimpleRun`(`:1358`). Tout script contextuel doit renvoyer `true`afin que le paragraphe prenne le chemin complet `shapeArabic`+`BidiResolver` ; sinon, le remodeleur de suffixes uniquement façonne les graphèmes de manière indépendante et déconnecte silencieusement le texte joint.
2. Si les marques sont TRANSPARENTES pour la mise en forme, ajoutez-les ensemble à `ArabicShaper.isHarakat`(`:70`) et `MSDFFont.isNonspacingMark`(`:132`) - ce sont des paquets de feuilles qui doivent être d'accord.
3. Ajoutez une couverture avancée : soit des glyphes d'atlas MSDF pour le script, soit des métriques enregistrées (`registerMSDFFontMetrics`,`packages/text/src/fontMetrics.ts:97`). Sans l'un ou l'autre,`unmeasuredGlyphs`compte chaque caractère et les sauts sont des suppositions `0.5em`.
4. Vérifiez avec `auditSceneSelection`(`packages/devtools/src/selectionAudit.ts`) sur une ligne mélangeant le nouveau script avec CJK+Latin — le budget d'écart est la quantification `PAGE_SCALE_BASIS_PX = 256`(`ContentProjectionManager.ts:71`), donc un script qui change l'avance par voisin y est invisible.

**Nouveau champ `TextStyle` :**

1. Demandez : « est-ce que cela change `glyphWidth` ? » Si le moteur de rendu le peint en offset/décoration sans changer l'avance réservée (`underline`,`lineThrough`,`highlightColor`), pas de travail de parité. S'il modifie l'avance mesurée (`fontSize`,`fontFamily`,`bold`,`italic`, tout ce qui sélectionne un chemin `measure`différent), il doit être inclus dans `styleSig`/`fingerprint`(`packages/layout/src/LayoutEngine.ts:1266`) et dans `styleRangeEquals`(`:682`).
2. Ajoutez le champ à l'égalité de style et à la signature ensemble - tester un seul laisse l'autre comme un poison pour mémo (différents paragraphes entrent en collision, le même paragraphe n'arrive jamais).
3. Ajoutez une croissance verticale de style `baselineShift`via `shiftedExtent`(`:668`) si le champ déplace les glyphes verticalement en dehors de `0.8 * pMax`(montée) /`0.7 * pMax`(descente) ; les trois marches `pMax` doivent l'appeler.

**Nouvelle règle de saut de ligne :**

- Vit à `suppressLineBreaks`(`:721`) ou `justifyLines`(`packages/layout/src/msdfLayout.ts:11`). Gardez la césure `breakPoints`décalée lors de la fusion (`:732` `+ offset`,`:791` `+ glyphs.length`). L'état d'enveloppement (`wrapClosedLines`,`lineOf`,`softBreaks`) est dupliqué entre `LayoutEngine`et `msdfLayout` — changez les deux.

## 7. Liste de contrôle de lecture + vérification

**Ordre de lecture pour un nouveau venu sur ce patron :**
`measureContext.ts:1`(invariant sans lequel rien d'autre n'est honnête) →`fontMetrics.ts:14`→`Typography.ts:93`→`BidiResolver.ts:27`+`ArabicShaper.ts:18`→`PreparedContentGrid.ts:38`(homologue de la grille conservée) vs `components/GridTextEntity.ts:4`(héritage `n`) →`LayoutEngine.ts:916`(`Intl.Segmenter`) →`:929`(`glyphWidth`) →`:1080`/`1266`froid →`:1848` chaud →`:504`/`:721`/`:668` règles de placement →`measure.ts:39`→`MSDFFont.ts:151`/`msdfLayout.ts:93`→`LayoutWorker.ts:1`/`LayoutWorkerManager.ts:28`→`MSDFTextEntity.ts:25`. Vérifiez avec `01-selection.md`§§3-4 après `PreparedContentGrid` avant de revenir au chemin chaud de la prose.

**Audit rapide après tout changement susceptible de déplacer les glyphes :**

- [ ] `unmeasuredGlyphs`(`LayoutEngine.ts:31`) toujours 0 sur la charge de travail touchée (ou les nouvelles marques en sont la cause et sont désormais couvertes par `registerMSDFFontMetrics`).
- [ ] `cacheStats()`(`LayoutEngine.ts:1004`)`hitRate`n'est pas tombé à 0 - tous les styles affectant l'avance sont toujours dans `styleSig`/`fingerprint`et `styleRangeEquals`/`objectRangeEquals`.
- [ ] `auditEntitySelection`/`auditSceneSelection`(`packages/devtools/src/selectionAudit.ts`) sur une ligne à fort crénage + une ligne mixte CJK/emoji + une ligne bidi — delta reste `<0.5px`.
- [ ] Solution de secours du travailleur couverte : la vérité `scripts/compare-pretext.ts:1`DOM (`Range.getClientRects`nombre de lignes) correspond toujours aux chemins froids (`prepare`/`prepareWithSegments`) et chauds (`measurePrepared`/`layout`).
- [ ] Le document `\r\n`/ seul `\r` affiche le même nombre de lignes que son jumeau normalisé `\n`- pas de glyphe fantôme `\r` et `sourceIndex` contigus à travers CRLF.

## 8. Pointeurs

- Benchmarks : `benchmarks/text-layout-pretext`(`bench.ts`),`comparisons/text-layout-pretext/entry.ts:1`(`corpus()`,`buildAtlas()`,`preparePhase()`/`layoutPhase()`),`comparisons/text-layout-pretext/page/*`,`scripts/compare-pretext.ts:1`(séparation froid/chaud,`Range.getClientRects`DOM vérité, pommes à pommes `measurePrepared`vs `pretext.layout`; également le seul `CanvasRenderer`-compté contrôle de cohérence en pixels lit,`forge/findings:text-richtext-and-markdown.md:564`, qui avertit de ne pas compter deux fois un deuxième `CanvasRenderer`sur un `Scene`).
- Lignes de base : `vectojs-docs/forge/baselines/*`(`glyph-batch-chrome-*.json`,`content-projection-frontload-*.json`, etc.) et `vectojs/benchmarks/bench.ts`. Chacun transporte `commit`, CPU/GPU/pilote et `refreshHz`via `benchmarks/run-browsers.sh`.
- Résultats (ajout uniquement, jamais réécriture) : `vectojs-docs/forge/findings/text-richtext-and-markdown.md`(23 entrées — canevas détaché Firefox 2026-08-02 `:461`,`InlineObject.alt`n'atteignant jamais AT `:364`, trois constructions GFM silencieusement rejetées `:508`, codeblock DPR flou `:724`, streaming re-lex quadratique `:624`, suffixe façonnant uniquement le résultat négatif `:356`— coût identique `2630ms vs 2639ms` sur des documents réalistes, paragraphes délimités).
- Chemin de la grille : `tmp/boss-research/01-selection.md` pour la moitié du terminal/éditeur et les détails de quantification/superposition/par graphème DPR ne sont pas répétés ici.
- Couche Entity : `packages/core/src/text/MSDFTextEntity.ts:25`+`SVGEntity.ts`,`packages/core/src/components/GridTextEntity.ts:4`(hérité `n`) vs `packages/text/src/PreparedContentGrid.ts:243`(grille conservée),`references/text/pretext`clone en lecture seule,`packages/layout/src/LayoutWorkerSource.ts`(généré, pas de modification) et `SPEC.md`pour le contrat canvas→GPU sur les quads `PositionedGlyph`. Les repères directs sont comparatifs et non prescriptifs - le prétexte est uniquement du texte, VectoJS alimente le glyphe + la sélection + a11y, donc "ce qui est le plus rapide au saut de ligne" est juste et "que dois-je utiliser" ne l'est pas.
