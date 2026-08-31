+++
title = "05 — Zero-DOM TeX — Composition et émission SVG"
description = "Pourquoi le noyau KaTeX → l'émetteur VectoJS → SVG autonome, les invariants de l'espace de coordonnées, les pièges de la géométrie extensible et le chemin sûr vers une nouvelle construction TeX."
weight = 25
+++

# 05 — Zero-DOM TeX — Composition et émission SVG

> **Boss 05** possède le contrat qui transforme une chaîne TeX en un SVG autonome sans aucun navigateur — pas de DOM, pas de moteur CSS, pas de polices Web — et qui garde chaque boîte, clip et glyphe extensible géométriquement fidèle à ce que KaTeX aurait rendu dans un navigateur.
>
> - **Ce que vous apprendrez** : pourquoi KaTeX est vendu comme noyau de mise en page et où se termine le travail du navigateur ; le pipeline d'émission span-tree → SVG ; les cinq espaces de coordonnées/transformation où une seule mauvaise image brise chaque étirement ; le cluster de bogues historiques qui correspond directement à ces espaces ; et le moyen sûr d'ajouter une nouvelle construction TeX.
> - **Ce que vous ne voulez pas** : Unicode/BiDi, mise en forme arabe ou saut de ligne `LayoutEngine`— le patron 02 en est propriétaire ; Markdown transport des travailleurs et streaming se réconcilient — patron 04 ; Chemins `GlyphRasterAtlas`/`SVGRasterCache`DPR — patron 07 ; le contrat `IRenderer` lui-même.

## Pourquoi Zero-DOM TeX existe

Le propre `buildHTML`(`packages/tex/src/kernel/VENDORED.md`) de KaTeX émet un arbre de portée dont la géométrie dépend de deux moteurs externes : **mise en page CSS** (`position: relative`+`top`,`display: table-cell`+`vertical-align`) pour le placement vertical, **mise en page du texte en ligne** pour x et **résolution de police Web** (classe CSS → fichier de police → glyphe) pour l'encre.`@vectojs/markdown` ne peut payer aucun de ces éléments : un `SVGEntity` pixellise via `data URI → Image → createImageBitmap → drawImage`(`packages/tex/src/index.ts:8`). Un `Image` chargé à partir d'un URI de données ne résout aucune URL externe et n'hérite d'aucun CSS de page, donc ni la sortie HTML/CSS de KaTeX ni aucune approche basée sur une police Web ne survit au voyage. Le SVG doit porter **ses propres contours**.

Le résultat est une contrainte stricte : le SVG émis ne contient aucune référence externe — pas de `<text>`, pas de `font-family`, pas de `url()`, pas de `xlink:href`(en-tête `packages/tex/src/emit/svg.ts:1`). C'est cette contrainte qui justifie un nouveau package plutôt qu'une configuration KaTeX.

La taille est le budget du programme qui a choisi cette forme plutôt que les alternatives (`vectojs-docs/forge/decisions/math-engine-2026-08.md:30`) : une décomposition `bun build --splitting`de `mathjax-full@3.2.2`mesurait **84 % de gzip dans la sortie SVG + polices intégrées**, seulement ~16 % dans la couche d'entrée TeX, donc le levier est une **liste blanche de glyphes**, pas un découpage de package. KaTeX a été mesuré pour n'avoir **aucune sortie SVG du tout** (l'énumération `src/kernel/Settings.ts:206`est exactement `["htmlAndMathml","html","mathml"]`), et une version minimale de RaTeX `wasm32`mesurait **1 010 901 gzip / 768 278 brotli — 1,47 × le morceau MathJax qu'il remplacerait** (`math-engine-2026-08.md:103`), donc WASM ne gagne pas l'axe pour lequel ce travail existe.

## Qu'est-ce qui est vendu et qu'est-ce qui est à nous

L'ordre de construction `packages/tex/package.json:14`documente la répartition.`packages/tex/src/index.ts:25` est la carte, avec les lignes du contrat à lire plutôt que de re-décrire :

- `src/kernel/`— KaTeX (MIT), copié par `scripts/vendor-katex.ts`à partir d'un **commit épinglé** (`references/markdown/KaTeX@5a5bf206`,`forge/decisions/math-engine-2026-08.md:191`) et débarrassé mécaniquement des émissions MathML et DOM. **Non reformaté ni corrigé des peluches**, de sorte que les fichiers restent comparables à ceux en amont.`VENDORED.md`nomme les ensembles conservés et supprimés ;`.oxlintrc.json` et `tsconfig.build.json` excluent tous deux le noyau exactement pour cette raison (note de bas de page `math-engine-2026-08.md:312`).
- `src/registry/`— deux fichiers manuscrits (`defineFunction`,`defineEnvironment`) qu'aucune transformation au niveau du jeton ne peut produire, car `mathmlBuilder`y apparaît en position d'expression (`src/index.ts:30`). Leur piège `sideEffects:false`est ce qui a rendu le bundle de la phase 1 non fonctionnel (`math-engine-2026-08.md:294`Correction 5), donc `package.json`**ne doit pas** être `sideEffects:false`— les effets secondaires d'importation remplissent `functions`/`environments` et le tremblement d'arbre supprimerait chaque élément intégré.
- `src/emit/`+`src/layout.ts` — les nôtres, les seuls fichiers touchés par la discussion émise.
- `src/glyphs/glyphs.subset.json`— Contours TTF → Chemins SVG via `scripts/generate-glyphs.ts`, rétrécis par `scripts/subset-glyphs.ts`, réencodés par `scripts/encode-glyphs.ts`+`src/emit/glyphCodec.ts`(format binaire de phase 2,`math-engine-2026-08.md:282`). La table d'exécution fournie décode en chaînes de chemin **identiques à l'octet** vers l'extracteur de la phase 1 (affirmation d'identité `glyphCodec.test.ts`) et est **12,0 % inférieure à un sous-ensemble TTF des mêmes glyphes** (`math-engine-2026-08.md:328`).

## Le pipeline – mappage de fichiers

```text
TeX string  ──►  layout(tex, opts)                         layout.ts:62
                 Settings(displayMode,maxSize,strict)  ·─► kernel/Settings.ts
                 parseTree → AST                       ·─► kernel/parseTree.ts + Parser.ts
                 buildHTML(tree, Options) → DomSpan    ·─► kernel/buildHTML.ts + buildCommon.ts:552 makeVList
                      │ height/depth/style.top already resolved
                      ▼
                 DomSpan tree                          layout.ts:84-89  (wrapped in vecto-tex root)
                      │
                      ▼
                 emitSVG(tree, {emPx,color,padEm})     emit/svg.ts:1567  EmitResult{svg,width,height,depth,missing,placements}
                   walk → EmitState{glyphs,rects,paths,lines}
                   viewBox = layout box ∪ ink union + pad
                   defs deduplication + grouped fills + clipPaths
                      │
                      ▼
                 MathRender{uri,widthEx,heightEx,depthEx}  markdown/src/markdown-math.ts:544 convertMathToSVGDataURI
                   bounded mathCache (256) + inlineMathRasters (LRU, 256)
                   lazy import via preloadMathJax()
                      │
                      ▼
                 InlineObject{width,height,depth,alt,paint}  markdown/src/markdown-inline.ts:287 inlineMath arm
                   InlineObjectBox in LayoutEngine lines, paint draws the raster
```

`layout`(`layout.ts:62`) est le `buildTree`de KaTeX sans les wrappers `.katex`/`.katex-display` qui transportent la sémantique CSS réservée au navigateur (`layout.ts:5`). Son seul choix intéressant est `throwOnError:true`+`strict:false`(`layout.ts:68`) : une erreur d'analyse difficile se produit afin que l'appelant puisse se dégrader et afficher la source TeX textuellement (ce que `@vectojs/markdown` fait déjà pour les commandes inconnues) ; une violation de la rigueur ne le fait pas.

`emit/svg.ts:1` fait les trois choses que le navigateur aurait autrement faites, nommées dans son propre en-tête car chacune a coûté de vrais bugs :

1. **Résoudre le glyphe → contour.** `SymbolNode`contient le texte ainsi que les métriques mais **pas la police** (`fonts.ts:57` `CLASS_TO_FACE`).`\left(` donne un `SymbolNode` avec une liste de classes vide sous un ancêtre `delimsizing size1`- la résolution locale choisirait `Main-Regular`et dessinerait un paren court auquel appartient un grand (`math-engine-2026-08.md:444`mesuré : 105/105 correct via la chaîne d'ancêtres, 97/105 sans ;`svg.ts:427` `walk` `classChain` param).
2. **Accumulez x.** L'arbre span ne contient aucun x - seul `functions/rule.ts:44`écrit toujours `Span.width`, et là, cela signifie un rectangle. Un x sur deux est une disposition de texte en ligne, donc l'émetteur additionne les avances par glyphe à partir de la table TTF `hmtx`(`svg.ts:492` `getGlyph`+`advance`;`math-engine-2026-08.md:432`indique pourquoi `hmtx`pas `fontMetricsData.width` - la combinaison des accents est de 0 avance donc une marque recouvre sa base, tandis que les métriques revendiquent 1,0 à 2,33 em).
3. **Convertir le placement vertical CSS → y explicite.** `makeVList`encode chaque ligne comme `style.top = -pstrutSize - currPos - elem.depth`par rapport à un frère `pstrut`de hauteur `pstrutSize`; la conversion lit `pstrutSize`hors de l'arborescence (`svg.ts:1029`) et utilise `rowY = y - (-(top + pstrutSize)) * UPEM * scale`— elle ne redérive jamais la mise en page KaTeX (`svg.ts:32`,`math-engine-2026-08.md:417` #1).

L'unité de l'émetteur est **1/1000 em** (`svg.ts:52` `UPEM`), correspondant à la fois au `UNITS_PER_EM`(`glyphTable.ts:49`) de la table de glyphes et à la viewBox 1000:1 documentée de `svgGeometry.ts`.`y`est **positif à la baisse par rapport à la ligne de base**. Le glyphe décrit le navire y-up, de sorte que chacun est placé à l'intérieur de `scale(1,-1)`plutôt que de voir son chemin réécrit (chaîne `svg.ts:1552` `transform` ; la réécriture coûterait en précision et annulerait la déduplication).

Le wrapper de Markdown (`markdown-math.ts`) compose ensuite via ce pipeline **paresseusement** :`preloadMathJax`(`markdown-math.ts:85`, tapez uniquement `import type {emitSVG,layout}`à la ligne 6 afin qu'une importation de valeur n'attire pas le moteur dans chaque consommateur) dynamique-`import('@vectojs/tex')`, met en cache `MathRender`à 256 entrées plus une carte raster LRU à la même limite (`markdown-math.ts:218` `mathCache`,`markdown-math.ts:238` `inlineMathRasters`;`inlineMathRasters`illimité était une découverte P3 —`forge/findings/text-richtext-and-markdown.md:1924`), et émet des mathématiques en ligne sous la forme d'un `InlineObject`avec `width/height/depth`en px via `exToPx`(`markdown-math.ts:143`,`markdown-inline.ts:305`) et `paintInlineMath`(`markdown-math.ts:331`). Les mathématiques d'affichage sont un `MathBlock extends MarkdownContainer`(`markdown-math.ts:598`). Aucun des deux fichiers ne contient de valeur statique par rapport à `@vectojs/tex`— une seconde (`KATEX_FONT_SCALE`a été redéclaré non importé dans `markdown-math.ts:484`pour cette raison ; l'égalité est affirmée dans `test/mathBoxGeometry.test.ts`).

### Résolution de police – la chaîne complète

`fonts.ts:194` `resolveFont(classes)`scanne les `classChain` accumulés à travers trois cartes en priorité :

- `DELIM_SIZE_FONTS`(`fonts.ts:98`par exemple `delimsizing size1 → Size1-Regular`) — le plus élevé, car les délimiteurs extensibles portent cela sur un ancêtre, pas sur le `SymbolNode`.
- `DIRECT_FONT_CLASSES`(`fonts.ts:120`e.g.`mathbb → AMS-Regular`,`mathcal → Caligraphic-Regular`).
- `CLASS_TO_FACE`(`fonts.ts:57`par exemple `mord textit → Main-Italic`,`mathbf → Main-Bold`) composé via le repli `AVAILABLE`(`fonts.ts:135`— si `Math-BoldItalic`absent, tombe à `Math-Regular`).

Le dimensionnement est multiplicatif via `SIZE_MULTIPLIERS`(`fonts.ts:263`, vérifié par rapport à `katex.scss $sizes`et `kernel/Options.ts sizeMultipliers`par le garde-dérive du fournisseur — voir § Gardes invariantes du fournisseur) via `sizingRatio`(`fonts.ts:265`). La police et l'échelle sont résolues à partir de la chaîne **complète** sur chaque nœud, pas seulement sur la feuille.

### Table de glyphes et connexion — une image

Un `SymbolNode`→ un contour :`walk`transmet son `classChain`à `emitSymbol`(`svg.ts:427`), qui résout la police via `resolveFont`, recherche le contour via `getGlyph(font, code)`(`glyphTable.ts:73`, soutenant `GlyphTable`dans `glyphCodec.ts:277`), et soit pousse un `PlacedGlyph{x,y,scale,font,code}`(`svg.ts:132`) avançant de `glyph.advance/UNITS_PER_EM * UPEM * scale`(`svg.ts:499`), ou - en cas d'échec - enregistre `font/U+XXXX`dans `state.missing`(`svg.ts:500`) et avance de la largeur `getCharacterMetrics`vendue (`kernel/fontMetrics.ts`; sur-ensemble des contours expédiés,`svg.ts:505`). Les caractères `SymbolNode.text`répétés ne sont **pas** fusionnés via `node.width`(`buildCommon.ts:296` `tryCombineChars`concatène le texte tout en laissant `width`comme premier caractère) — chaque point de code est mesuré individuellement, avec un repli d'avance zéro averti une fois lorsque la table et les métriques manquent (`svg.ts:514` `warnedMetricsMisses`, limité `MAX_CACHED_MISSES = 1024`à `glyphCodec.ts:83`) afin qu'un mauvais glyphe n'empoisonne pas `penX`/`viewBox`.

## Invariant dans l'espace de coordonnées

Chaque placement parcourt **cinq espaces** lors d'un seul voyage, depuis une liste de classes DOM jusqu'à un pixel final dans le `viewBox` du SVG. Un bug sur l'un d'entre eux brise toutes les constructions extensibles à la fois, et c'est exactement ce que les deux véritables clusters qui se sont séparés ont fait.

| #   | Espace                                 | Définition                                                                                                        | Direction Y                                                                     | Échelle                                                                                                                        | Signification du clip                                                      | Où                                                                                  |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | **Racine-local (em)**                  | Stylo `state.x`, ligne de base `y`, toutes les longueurs `parseEm`× `UPEM × scale`                                | +down, origine de base (`svg.ts:427` `walk` `y`)                                | `sizingRatio(classChain)`accumulés (`fonts.ts:265`)                                                                            | —                                                                          | Entrée `emitContainer`+`emitSymbol`                                                 |
| 2   | **Ligne-local (relecture)**            | `vlist-t > vlist > vlist-r > row`avec `rowY = y - above`(`svg.ts:1080`)                                           | +down, ligne de base de la liste de vlist                                       | même                                                                                                                           | Retrait de ligne `dx = startX + indent + marginLeft`                       | Sonde `emitVList`+ relecture (`svg.ts:1031-1180`)                                   |
| 3   | **Post-transformation (chemin-local)** | `<path transform="translate(x,y) scale(sx,sy)">` mappe l'espace utilisateur local → root                          | espace utilisateur svg, y-down à l'extérieur de `scale(1,-1)` par glyphe        | glyphe :`scale / -scale`; extensible :`sx = scaleWidth/vbW, sy=heightEm/vbH`(`svg.ts:612`)                                     | `viewBox`de largeur `400em`à `sx`→`scaleWidth`                             | `emitSvgNode`+ chaînes de transformation `body`finales (`svg.ts:584`,`svg.ts:1569`) |
| 4   | **ClipPath local**                     | `<clipPath><rect>` résolu **après** la transformation de l'élément de référence (SVG `userSpaceOnUse` par défaut) | **Post**-transformation de l'espace utilisateur                                 | inverse :`invSx=1/sx,invSy=1/sy`(`svg.ts:1555`)                                                                                | **Doit être émis dans le cadre propre du chemin**                          | `svg.ts:1550-1562` `clipPath` rectangle                                             |
| 5   | **Markdown case (ex/px)**              | `MathRender{widthEx,heightEx,depthEx}`puis `exToPx(…,runSize)`→`InlineObjectBox`                                  | Zone de ligne LayoutEngine, ligne de base + profondeur (`markdown-math.ts:566`) | `EX_PER_KATEX_EM = KATEX_FONT_SCALE/EX_PER_EM`(`markdown-math.ts:514`, 0,02 % vérifié par rapport au vrai KaTeX dans Chromium) | rembourré par `MATH_PAD_EM=0.05`(`markdown-math.ts:481`) de tous les côtés | `markdown-math.ts:544`+`markdown-inline.ts:305`                                     |

**L'invariant** (ce qui doit tenir sur chaque chemin qui émet une branche coupée ou superposée) : la fenêtre `PlacedPath.clip`est enregistrée dans **l'espace racine** (`svg.ts:146-170`,`emitSvgNode`la germe à partir de `min-width`), traduite par n'importe quelle relecture `aligned-vlist` `dx`(`svg.ts:1196` `clip.x += dx`), puis émise après inversion par `sx/sy`(`svg.ts:1555`). Un espace décalé entre 3 et 4 égare chaque radical et accolade par `p.x + sx·clip.x`plutôt que `clip.x`(`CHANGELOG:31` #787).

## Géométrie extensible — les trois familles

La géométrie d'un élément extensible n'est **pas dans `Span.width`**. Seul `functions/rule.ts:44` écrit cela. Trois familles, trois faits coordonnés différents – c’est en les mélangeant que les bugs se sont produits.

### Glyphes et règles ordinaires

- `PlacedGlyph.x`est une racine absolue x ;`width`est `advance/UPEM * scale`. Pas de viewBox, pas de tranche, pas de `clip`.
- `PlacedRect`est l'une des trois formes suivantes : une règle en `Span.width`(`svg.ts:903`), une règle/bordure pleine largeur (`borderBottomWidth`/`.angl`/`\boxed` bordures en `svg.ts:800` `fullWidth:true`, résolues par `placeRect`en `svg.ts:1256`) ou un séparateur vertical (`vertical-separator`en `svg.ts:718`→ tracé `PlacedLine`). Les formes pleine largeur ne contribuent **aucune avance** —`span.width` étant absent est significatif.

### Étirements de queue cachée à un seul chemin

`\sqrt` et `\phase` émettent chacun un `SvgNode` de 400 em de large sous un wrapper dont le CSS est `overflow:hidden`(`hide-tail`à `katex.scss:513`).

- `\sqrt`: le wrapper écrit **inline**`style.minWidth = 0.853em`(`kernel/delimiter.ts:533`), que `emitContainer`lit à `svg.ts:969` `clipEm = parseEm(style.minWidth) || parseEm(style.width)`. Ainsi,`emitSvgNode`génère `state.x + clipEm*scale`à la fois comme `widthEm`et `clip.w`(`svg.ts:590`). Le `sx`du chemin de 400 em utilise `rawWidthEm`(et non `widthEm`), donc un `slice` s'affiche à son échelle déclarée et est rogné et non écrasé.
- `\phase`: le wrapper écrit **uniquement `style.height`** (`kernel/functions/enclose.ts:60`). Pas de `minWidth/width`en ligne, donc `clipEm`reste `undefined`et `hideTail`est `unclippedHideTail === true`(`svg.ts:971`). L'enfant n'est pas avancé en 400em (`svg.ts:966` `emitOverlayPiece`avec `FULL_WINDOW: 0..1 xMinYMin`). Au lieu de cela, l'étendue entière du conteneur est le clip (l'analogue de `markdown`à `markdown-math.ts:92`n'a aucun rapport ; la logique est `svg.ts:966`).

La subtilité : là où `minWidth`**existe**, le clip est généré en ligne et `emitSvgNode` est correct ; là où ce n'est **pas le cas**, le clip est en attente et doit s'en remettre à l'étendue de la vlist englobante (voir #667 ci-dessous). Deux chemins de code pour la même classe wrapper.

### Superpositions en plusieurs pièces

`\overbrace`/`\underbrace`/`\xleftrightarrow`/`\xrightarrow` divise un chemin de 400 em sur **2 à 3 travées** qui sont des fenêtres de pourcentage `position:absolute`(`stretchy.ts:238` `widthClasses = brace-* / halfarrow-*`; CSS à `katex.scss:519`).

- Le `SvgNode`de chaque pièce déclare à nouveau `width:"400em"`— en le prenant littéralement mesuré `\overbrace{x+y}` à **1200em** (3×400) (`CHANGELOG:31`).
- Les pièces sont enregistrées comme **avance zéro** `PlacedPath.overlay:{start,end,align,vw,vh}`(`svg.ts:195`,`emitOverlayPiece`à `svg.ts:629`) et résolues uniquement une fois que la ligne de vlist englobante `width`est connue : échelle de couverture uniforme `s = max(boxW/vw, boxH/vh)`, alignement par pièce `preserveAspectRatio`(`xMinYMin / xMidYMin / xMaxYMin`à `svg.ts:1286` `placeOverlay`), fenêtre clipsée à `boxX = startX + start*width`.

## Cinq invariants que l'émetteur ne doit jamais briser

Celles-ci ont clôturé le lot et constituent depuis lors le moyen le plus coûteux de régresser :

1. **`classChain`porte la police.** Un `SymbolNode`a souvent une liste de classes vide ; la police est sur un ancêtre. La résolution locale dessine silencieusement un délimiteur haut auquel appartient un délimiteur court et un paren court auquel appartient un délimiteur grand. Affecte **toutes** les formules délimitées (mesure `fonts.ts`+`svg.ts:427`+`math-engine-2026-08.md:443`).
2. **`state.x`est une avance, pas une géométrie.** La somme `parseEm(margin*)/hmtx advance/sizingRatio` est le seul x correct. Toute deuxième source compte double.
3. **`top + pstrutSize`→`rowY`est la seule vérité verticale.** Lisez `pstrutSize`dans l'arborescence ; ne le recalculez pas (`svg.ts:1029`).
4. **`clip`/`overlay`s'en remet à l'étendue de la vlist englobante ; rien d'autre.** Une règle pleine largeur, un radical cache-queue, une superposition `\cancel` et une entretoise se résolvent tous contre **leur propre**`width` de la ligne englobante (`svg.ts:1172` `rectStart/lineStart/pathStart`+`svg.ts:1230`). La résolution contre le `state.x`de la formule égare les diagonales `\cancel` par l'avance précédente et enterre les socpe imbriquées.
5. **Les rects `clipPath`sont en coordonnées locales du chemin.** Émettez `(clip.x - p.x)*invSx`(`svg.ts:1558`), jamais `clip.x`brut et rejouez un clip enregistré avec le même `dx`comme chemin (`svg.ts:1196`). Espace 4 ≠ espace 3.

## Études de cas – bugs comme coordonnées

Chacun est un mélange d'espace distinct, avec des numéros de ligne à l'état fixe.

### #787 — Espace de coordonnées `clipPath`(`svg.ts:1550-1562`,`CHANGELOG:31`)

`clipPathUnits`est par défaut `userSpaceOnUse`, ce qui signifie que le `<rect>` à l'intérieur d'un `<clipPath>` est résolu **après** le référencement du `<path>` de `transform`. Le rect doit donc être écrit dans le cadre local du chemin. Avant le correctif,`svg.ts:1555`émettait l'espace racine `clip.{x,w}`textuellement, donc SVG appliquait `translate(p.x) ∘ scale(sx)`une seconde fois : la fenêtre atterrissait à `p.x + sx·clip.x`. Chaque extensible coupé –`\sqrt`, chaque phase – a disparu hors toile sous un `sx`/`sy`non-1. Le même commit a également ajouté `svg.ts:1196` `clip.x += dx`sur la relecture de la vlist alignée, car un clip est une fenêtre d'espace racine absolue comme le chemin qu'il délimite - le report du chemin mais pas sa fenêtre a cassé `\frac{\sqrt{x}}{y}` lorsque le radical était assis dans un numérateur centré (`CHANGELOG:57` `svgClipWindows.test.ts`).

### #667 — `\phase` mesuré 400em (`svg.ts:966`,`CHANGELOG:56`)

`\sqrt` écrit toujours `min-width` en ligne sur son wrapper afin que `emitSvgNode` puisse être coupé immédiatement ;`\phase` ne le fait pas. L'émetteur a fait confiance au `widthEm: 400` déclaré par le SvgNode comme avance, signalant `\phase{-120}` à 400em. Corrigé en détectant `classes.includes('hide-tail') && clipEm===undefined` comme `unclippedHideTail`(`svg.ts:971`) et en acheminant cette branche vers `emitOverlayPiece(FULL_WINDOW)` - une superposition sans avance dont la fenêtre visible est la ligne englobante.

### #665 — `\overbrace` mesuré 800-1200em (`svg.ts:859`,`CHANGELOG:58`)

Même cause première, en plusieurs parties : `brace-left/center/right`et `halfarrow-left/right`sont `position:absolute`avec `width:25/50/50%`de la ligne englobante (`katex.scss:519`). Chaque `SvgNode`déclare toujours 400em — en les ajoutant mesurés `\overbrace{x+y}` à 1200em. Corrigé en reconnaissant `OVERLAY_PIECES[class]`(`svg.ts:328`), en traitant ces SvgNodes comme des superpositions en attente sans avance (`emitOverlayPiece`à `svg.ts:867`), avec `CONTAINER_BORDER_CLASSES`(`svg.ts:308`) pour le cas `.angl` associé où la frontière ne réside qu'en CSS.

### #825 — `\sqrt{b^2-4ac}` rendu comme `b²√4ac`(`svg.ts:1186`,`CHANGELOG:15`)

Deux failles indépendantes, toutes deux centrées sur la largeur du radicand :

- `ROW_ALIGN_CLASSES.sqrt`était `center`au lieu de `left`(`svg.ts:266`). KaTeX n'a pas de règle `.sqrt {text-align}`; l'initiale est `left`. Avec `center`, le radical étroit de 400em se trouvait au milieu d'un large radicand, donc le vinculum semblait commencer à droite de l'ouverture `b²`.
- Le clip de queue de peau a été dimensionné uniquement à `minWidth`, jamais à la largeur réelle du radicand. Une fois que `width`(l'étendue de la vlist, c'est-à-dire la largeur du radicand lorsqu'il est plus large) était connu,`svg.ts:1186`a étendu `p.w`/`p.clip.w`à `max(minWidth, radicandWidth)`- et uniquement pour le corps entier `vlist` `classChain.includes('sqrt')`, pas un ancêtre (`svg.ts:1203`garde), sinon un `mfrac` externe a étiré le radical jusqu'à la largeur de la fraction.

### #788 — fenêtres de clip épinglées avec une échelle non 1 et une relecture alignée (`svg.ts:1196`,`svgClipWindows.test.ts`)

L'affirmation de solidité sur l'optimisation à passage unique de la liste de vlist alignée disait précédemment "la traduction est sonore parce que `walk`est affine dans `state.x`" et affirmait que la traduction du clip était sonore **avant** les clips traduits par `svg.ts:1196`(`CHANGELOG:57`). Les tests de régression affirment maintenant à partir du **SVG émis** que la fenêtre rendue effective coïncide avec la propre boîte du chemin placé à la fois sous `sx=sy=0.7`et à l'intérieur d'un numérateur `\frac` centré et rejoué.

Plus les six résultats P2/P3 du 13/08/2026 que le paragraphe compresse mais que le code d'émission conserve comme protections toujours porteuses (`forge/findings/text-richtext-and-markdown.md:1789`) :

- **#514 fantôme** — `style.color==="transparent"`(`kernel/Options.ts:306`) marque l'encre fantôme (`buildCommon.ts:96`) ; sauter l'encre mais conserver les avancées se fait à `svg.ts:479`/`svg.ts:744`(drapeau `phantom`).
- **#514 color** — TeX `\color` écrit `style.color` sur chaque nœud (`functions/color.ts`) ; l'émetteur hérite de la couleur effective via `walk`et regroupe par elle (`svg.ts:1522` `grouped`), avec `escapeAttr`à `svg.ts:1542`durcissant toute chaîne dérivée de l'utilisateur (`&`→`&amp;`,`"` etc.).
- **#514 règles/bordures** — chaque style `borderBottomWidth`/`katex-sout`/`.angl`/`.boxed` devient un `fullWidth` rect (`svg.ts:800`,`svg.ts:834`) plutôt que simplement `frac-line`.
- **#514 `op-limits`/`x-arrow`/`mover`/`munder`centrage** — ajouté à `ROW_ALIGN_CLASSES`(`svg.ts:266`) et vérifié par rapport à `katex.scss:405`/`563`afin que les limites `\sum` et les étiquettes `\xrightarrow` atterrissent sous l'opérateur/centre de la flèche.
- **#521 tour (`\llap`/`\clap`)** — CSS `right:0`/`margin-left:-50%`(`katex.scss:293`) implémenté en mesurant `lapWidth`et en décalant `state.x`par `-lapWidth`/`-lapWidth/2`(branche `svg.ts:982` `lapKind`) plutôt que de traiter les trois tours comme `rlap`.
- **#521 `\smash`/viewBox** —`functions/smash.ts:66`remet à zéro le `height/depth`d'un nœud tandis que les enfants conservent leur taille ; l'émetteur étend la viewBox à l'**union** de l'encre placée (union `svg.ts:1630` `minX/minY/maxX/maxY`) plutôt qu'à la zone de mise en page, de sorte que le contenu brisé n'est pas coupé.

### Historique de glyphe/table qui contraint toujours le contrat d'émission

- **Glyphes manquants comme encre vierge** (`CHANGELOG:62` `ff79c58`) : l'ajout du sous-ensemble `569→662 (+87)`pour `U+2248`/`h*`/`l*` etc. — les contours manquants ont avancé correctement via les métriques afin qu'ils soient rendus sous forme d'**espaces vides de largeur correcte**, invisibles mais de mise en page correcte.
- **Trous d'espaces de variante d'affichage** (`CHANGELOG:9`définit `U+2216`,`U+22C3`variante d'affichage,`U+005F`, bloc de test de surlignement) : blocs d'affichage **rétrogradés en source TeX brute** (bleu CodeBlock) au lieu de la composition, car `convertMathToSVGDataURI`à `markdown-math.ts:559`renvoie `null`sur n'importe quel `emitted.missing`.
- **`vertical-separator`(`{c|c}`/`{c:c}`)** (`CHANGELOG:29`#697) : les séparateurs de colonnes de tableau écrivent leur règle sous la forme `style.borderRightWidth`/`borderRightStyle`, et non sous la forme `Span.width`. Avant le correctif,`svg.ts:617`le supprimait entièrement ; il émet maintenant une ligne tracée à cette position du stylo avec `verticalAlign`/`height`→`(y1,y2)`(`svg.ts:718`).
- **Rembourrage porté par classe** (`CHANGELOG:30`#696) :`.x-arrow-pad`/`.cancel-pad` etc. n'existent que dans `katex.scss`, donc les lignes mesurées courtes par ce rembourrage avant que `CLASS_H_METRICS`(`svg.ts:366`) ne soient repliées au même point que l'inline `paddingLeft`. Les marges `.cancel-lap` de `-0.2em` ont été regroupées dans le même tableau afin que `\cancel` ait conservé son avance nette.
- **Majuscules d'image délimitée et raster** (`CHANGELOG:61`,`markdown-math.ts:1938` `destroy`supprimant `workerCallbacks`) : sans rapport avec les coordonnées mais porteur pour un document diffusé en streaming - un `inlineMathRasters`illimité a épinglé un `HTMLImageElement`par URI après l'expulsion de `mathCache`.

## Gardes invariantes du fournisseur

La feuille de style et le noyau conspirent pour masquer les informations de l'arborescence. Chaque valeur ci-dessous existe dans `katex.scss`ou un fichier noyau **mais pas dans `DomSpan`**, donc l'émetteur la transcrit comme une constante - et la transcription est vérifiée à chaque exécution du fournisseur (`scripts/vendor-katex.ts --check`) :

| constante transcrite                                                 | source de vérité                                              | forme gardée                                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `MU = 1/18`(`svg.ts:60`)                                             | `katex.scss:$mu = 1em/18`                                     | Drift Guard redirige `MU`à partir de `katex.scss` extrait                                  |
| `NULL_DELIMITER_SPACE = 0.12`(`svg.ts:69`)                           | `$nulldelimiterspace = 1.2em/10`                              | même                                                                                       |
| `SIZE_MULTIPLIERS[11]`(`fonts.ts:263`)                               | `katex.scss $sizes`+`kernel/Options.ts sizeMultipliers`       | L'aplatisseur SCSS redirige les deux                                                       |
| `KATEX_FONT_SCALE = 1.21`(`svg.ts:77`)                               | `.katex {font-size:1.21em}`(`katex.scss:24`)                  | pareil, a également affirmé `markdown-math.ts:514 ≈ markdown/test/mathBoxGeometry.test.ts` |
| `ROW_ALIGN_CLASSES`(`svg.ts:266`)                                    | Section `katex.scss`405/442/563 + écart `sqrt:left` documenté | même aplatisseur                                                                           |
| `CLASS_TO_FACE`/`DELIM_SIZE_FONTS`/`AVAILABLE`(`fonts.ts:57/98/135`) | Règles `katex.scss` `font-family`                             | même                                                                                       |
| `CONTAINER_BORDER_CLASSES`(`svg.ts:308`,`.angl 0.049em`)             | `katex.scss:601` `.angl` règles en haut/à droite              | même                                                                                       |
| Fenêtres `OVERLAY_PIECES`(`svg.ts:328`)                              | `katex.scss:519` `.brace-*/halfarrow-*` fenêtres absolues     | même                                                                                       |
| Remplissages `CLASS_H_METRICS`(`svg.ts:366`)                         | `katex.scss:555/569/579/583/601` bloc/tour/marges             | même                                                                                       |

Les accessoires facultatifs de `defineEnvironment`(`argTypes`,`allowedInText`,`numOptionalArgs`) sont transmis **avec les valeurs par défaut en amont** (`registry/defineEnvironment.ts`), non épinglés ou supprimés, donc une future bosse KaTeX qui commence à les déclarer les fait surface plutôt que de les supprimer silencieusement (`forge/findings/text-richtext-and-markdown.md:2075`).

## Comment fonctionne réellement l’interaction avec la mise en page

Les mathématiques en ligne ne sont **pas** `fillText`.`markdown-inline.ts:287` `inlineMath`produit un `InlineObject`(caractère de remplacement d'objet +`InlineObjectBox`) dont `width/height/depth`en px est `exToPx(converted.{widthEx,heightEx,depthEx}, runSize)`—`runSize`est le **run englobant**`fontSize`à ce stade de l'arborescence, donc un `$x$` à l'intérieur d'un titre évolue avec le titre (`markdown-inline.ts:292`). Le `LayoutEngine`sur `packages/layout/src/LayoutEngine.ts:808`le traite comme une boîte fixe comme une image en ligne. Le `depth`de la boîte (distance en dessous de la ligne de base) est `emitted.depth + padEm`dans la même échelle `KATEX_FONT_SCALE/EX_PER_EM`que la part largeur/hauteur — la profondeur d'assise et la largeur sont dérivées ensemble, donc une modification de `KATEX_FONT_SCALE`dimensionne mal chaque formule tandis qu'une modification de `EX_PER_EM`, désormais annulée, ne déplace rien (`markdown-math.ts:111` note annulée par paire).

Les mathématiques d'affichage contournent entièrement le disjoncteur de ligne : `MathBlock`est un `MarkdownContainer`dont l'enfant est le `SVGEntity`de l'URI de données, à la largeur du conteneur moins le remplissage `MATH_PAD_EM`- les marges et les débordements sont des problèmes de `ScrollView`, pas ceux de `LayoutEngine`.

### Comment `LayoutEngine` traite une formule en ligne

`LayoutEngine`(`packages/layout/src/LayoutEngine.ts:808` `LayoutEngine`,`README.md:24`moteur découplé) ne façonne jamais TeX. Les mathématiques en ligne arrivent sous la forme d'un `StyledSpan{ text: OBJECT_REPLACEMENT, object: InlineObject }`(`markdown-inline.ts:301`), dont `InlineObjectBox{width,height,depth}`a été corrigé au moment de la collecte de l'intervalle à partir du `fontSize`de l'exécution englobante via `exToPx`- donc la mise en page voit la boîte déjà en px. Le chemin chaud `LayoutEngine.layout`l'enveloppe comme n'importe quelle autre image en ligne (`packages/layout/src/LayoutEngine.ts:2321` `layoutPreparedIntoBuffer`préserve la note de tête dans `forge/findings/text-richtext-and-markdown.md:1762`; l'étalonnage `core/src/text/measureContext.ts:12`et le repli `core/src/text/Typography.ts:111` `ctx.measureText('Mg')`sont la garde text-métrique du patron 02 dont dépend la même boîte) :`width`participe au saut de ligne,`depth`supprime la ligne de base de la ligne de cette distance, et `height+depth`agrandit la boîte de la ligne, de sorte qu'une formule avec une grande profondeur (fraction, queue radicale,`\left(` parenthèse haute) augmente le jeu sans seconde mesure. La sélection sur la formule est la parité Dual-world, pas la mise en page -`ContentGridProjector`/`ContentProjectionManager`(boss 01/03) copiez le `InlineObject.alt = t.text`(`markdown-inline.ts:310`) afin qu'un lecteur puisse trouver/sélectionner/copier la source TeX, tandis que le canevas reste le rectangle `InlineObjectBox`. Tout ce qui a changé `InlineObjectBox`après la mise en cache de `LayoutEngine`doit salir le chemin du texte - les mêmes gardes invariants du boss 02 `measure-once, layout-many`.

### Géométrie de la boîte - pourquoi `KATEX_FONT_SCALE`survit et `EX_PER_EM` s'annule

`EmitResult`les signale dans le format **KaTeX's** (1,21 × la taille de police du consommateur,`svg.ts:77` `KATEX_FONT_SCALE`,`katex.scss:24`).`markdown-math.ts:514`compose `EX_PER_KATEX_EM = KATEX_FONT_SCALE / EX_PER_EM (0.4421)`donc `widthEx = (emitted.width + 2*pad)*EX_PER_KATEX_EM`et `depthEx = (emitted.depth + pad)*EX_PER_KATEX_EM`(`markdown-math.ts:566`). Ensuite,`markdown-inline.ts:305`résout px en `exToPx(ex, runSize) = ex * runSize * EX_PER_EM`— le `EX_PER_EM`s'annule, laissant `px = (em+pad)*1.21*runSize`. Vérifié en mutant `EX_PER_EM`en `0.31`avec un mouvement de test nul et `KATEX_FONT_SCALE`en `1.0`avec 3 échecs (remarque `markdown-math.ts:111`,`test/mathBoxGeometry.test.ts:39`une tolérance de 0,5 % absorbe l'arrondi à 2 décimales). Le `padEm`n'est pas décoratif : les attributs SVG `width/height`l'incluent de tous les côtés alors que `EmitResult.{width,height,depth}`ne le font pas, et `drawImage(bitmap, x,y, box.width, box.height)`à `markdown-math.ts:338`étend tout le SVG jusqu'à la boîte - signalez la boîte d'encre seule et chaque formule s'écrase par `padEm`, signalez la profondeur sans elle et chaque formule se trouve `padEm` haut.

## Sous-ensemble de glyphes et codec – où résident les octets

Le `glyphs.subset.ts`(`src/glyphs/glyphs.subset.ts`) livré n'est pas un texte de chemin SVG mais le binaire décodé par `src/emit/glyphCodec.ts:277` `GlyphTable`. L'extraction à `scripts/generate-glyphs.ts`lit les contours quadratiques TTF `glyf`(drapeau sur la courbe + milieux implicites) et `scripts/encode-glyphs.ts`inverse cette expansion : 5 256 des 18 306 points d'extrémité `Q`sont exactement des milieux implicites et sont supprimés, chaque coordonnée restante est entière (0 sur 72 616 hors grille une fois les milieux disparus) et zigzague les variantes deltas regroupent 60 637 sur 72 616 en un octet (`math-engine-2026-08.md:333`). Le corpus (`scripts/subset-glyphs.ts`) correspond aux majuscules qui affichent les échecs : 666 glyphes épinglés par le compte de garde de `test/glyphCodec.test.ts`. Un glyphe qui **existe dans `fontMetricsData.js`mais pas dans le sous-ensemble** s'affiche sous la forme d'un espace vide de largeur correcte (avancée à partir des métriques, pas de contour ;`CHANGELOG:62`) ; un glyphe dont le **visage est totalement absent** (par ex. une baleine à affichage uniquement comme `\digamma`) se dégrade en `markdown-math.ts:559` `emitted.missing.length>0 → null → CodeBlock` — les deux modes de défaillance sont distincts et ont des propriétaires différents.

### `packages/core/src/text/*` - où TeX rencontre la pile de texte

TeX **n'appelle pas** la mise en forme `packages/core/src/text`(fonctionnalités BiDi, arabe, OpenType) — les glyphes sont déjà façonnés par les métriques de KaTeX et l'émetteur écrit directement les contours. Ce que TeX **part**, c'est la moitié inférieure de la pile de texte : l'étalonnage du contexte de mesure `core/src/text/measureContext.ts:12`et le repli `core/src/text/Typography.ts:111` `ctx.measureText('Mg')`sont les gardes du patron 02 pour les avancées en matière de polices Web, tandis que les avancées dérivées de `hmtx`de TeX à `svg.ts:499`sont l'analogue de KaTeX. Les deux doivent satisfaire le même invariant de métrique de texte (boss 02 → prérequis profond) : mesurer avec la vraie police, sur le bon contexte, au bon DPR, ou les dérives `InlineObjectBox`du canevas frappé rect et de la projection a11y.`packages/text/src/fontMetrics.ts:82` `registerFontMetrics`n'est jamais appelé pour les visages TeX — le `fontMetricsData.js` vendu est la source de métrique TeX, et les deux tables ont des propriétaires différents.

### Lecture du SVG émis par une formule - placements comme vérité terrain

`EmitResult.placements`(`svg.ts:104` `GlyphPlacement[]`en em) est la surface de débogage (`markdown-math.ts:517` note qu'elle existe pour une validation croisée par rapport à une présentation réelle du navigateur du même arbre de travée). Lorsqu'une formule semble erronée, comparez les emplacements plutôt que de lire la soupe de chemin SVG :

```ts
import { layout, emitSVG } from '@vectojs/tex';
const { svg, width, placements, missing } = emitSVG(
  layout('\\sqrt{b^2-4ac}', { displayMode: true }),
);
// width is advance in em; placements[].{x,y,scale,font,code} in em; missing lists absent U+XXXX
```

`width` est le seul nombre qui contrôle la disposition - le sous-déclarer tronque le `InlineObjectBox`, le sur-déclarer insère un espace visible - tandis que `placements[].y`positif par rapport à la ligne de base est ce qui doit correspondre à une sonde KaTeX-in-Chromium DOM à 0,0000 em (`math-engine-2026-08.md:423`). Un clip ou une superposition ayant échoué apparaît comme une incompatibilité `PlacedPath.w/clip.w`avec les extensions `placements`, et non comme une différence de chaîne de chemin.

## Harnais de vérification - qu'est-ce qui maintient chaque vert invariant

- `test/emit.test.ts:37`— contrat SVG autonome (`<text>`/`font-family`/`url`/`xlink:href`absent ; le fragment d'URI de données est résolu) ; superposition extensible à avance nulle et fenêtrage en tranches (`emit.test.ts:380` `treats multi-piece stretchy overlays as zero-advance`).
- `test/svgClipWindows.test.ts:6`— régressions de géométrie de rendu pour #787/#788 : clipPath rect émis dans le cadre local du chemin et fenêtre coïncidente de relecture de liste de v alignées sous non-1 `sy`(pavage d'overbrace `svgClipWindows.test.ts:83`).
- `test/vendorCheck.test.ts:252`— Drift Guard redérivant chaque constante transcrite `katex.scss` à partir de la caisse en amont (le piège d'accolade de commentaire est une importation MathJax, pas ce package).
- `packages/markdown/test/mathBoxGeometry.test.ts:39`— Pont d'échelle de police KaTeX (égalité `KATEX_FONT_SCALE` entre les packages) et géométrie de boîte par rapport au vrai KaTeX dans Chromium (19,3559 px/em à 16 px, propagation de 0,02 %).

## Comment ajouter une nouvelle construction TeX en toute sécurité

Une construction TeX est définie par un **constructeur de noyau** (AST → spans + styles/classes) et consommée par **une branche d'émission** qui traduit ces spans/styles en encre placée dans la bonne étendue. Une construction est considérée comme expédiée uniquement lorsque **sept** sites sont d'accord - l'absence d'un site était le mode d'échec historique.

### 1. Ajoutez et vérifiez le générateur de noyau

Étendez `src/kernel/functions/*.ts`ou `src/kernel/environments/*.ts`via `src/registry/defineFunction.ts`/`defineEnvironment.ts`(pas en éditant le noyau). Vérifiez le **contrat de sortie** du constructeur : quelles classes il définit (par exemple `.mover`,`.angl`,`.cancel-pad`), quels styles en ligne il écrit (`borderBottomWidth`,`paddingLeft`+`padLeftEm`,`minWidth`sur les wrappers hide-tail), si le wrapper est un `Span`, un `SvgNode`ou un `LineNode`portant `SvgNode`(`kernel/stretchy.ts:69`,`svgGeometry.ts`pour le catalogue de chemins), et si `style.top`/`style.left`/`style.color`/`transparent`est impliqué. Les mesures `fontMetricsData.js`du noyau s'écoulent déjà dans le `height/depth` de l'arborescence — ne les réintroduisez pas comme seconde source.

### 2. Apprenez à l'émetteur exactement une nouvelle branche

L'expéditeur vit à `svg.ts:427` `walk`→`emitSymbol`/`emitSvgNode`/`emitContainer`/`emitVList`. Si les nouvelles étendues contiennent de **nouvelles classes CSS qui affectent la géométrie**, enregistrez-les dans le bon tableau plutôt que de les coder en dur :

- `CLASS_H_METRICS`pour le bloc-notes/marge en ligne (par exemple `.x-arrow-pad`, #696) — sinon les lignes sont courtes.
- `CONTAINER_BORDER_CLASSES`pour un bord de bordure dont l'épaisseur ne réside que dans `katex.scss`(par exemple `.angl`,`svg.ts:308`).
- `ROW_ALIGN_CLASSES`si le `text-align`des lignes d'une vlist est important (`.op-limits` etc.,`svg.ts:266`).
- `OVERLAY_PIECES`si les nouvelles étendues sont des fenêtres de pourcentage `position:absolute`(`svg.ts:328`).

Si le SVG de la construction déclare une largeur fixe (400em) mais que sa largeur **visible** correspond à l'étendue de la ligne englobante, traitez son SvgNode comme une **superposition en attente d'avance nulle** plutôt que comme une avance littérale (le modèle `\phase`/`\overbrace` à `svg.ts:859` `#665`/`svg.ts:966` `#667`).

### 3. Placez-le dans le bon espace de coordonnées

- Une **règle ou bordure** qui s'étend sur son conteneur est `PlacedRect{fullWidth:true, edge?}`à `svg.ts:147`, résolue par `placeRect(startX,width)`par rapport à **sa propre ligne `vlist`** (plage `svg.ts:1230` `rectStart`), et non à la formule `state.x`.
- Un **chemin unique extensible** dont la largeur visible n'est pas son `width`déclaré est `PlacedPath{clip?}`à `svg.ts:193`, avec `sliced`géré à `svg.ts:596`(échelle par `rawWidth`, pas `widthEm`) et - si `hide-tail`sans `minWidth`- en attente comme `FULL_WINDOW`(`svg.ts:966`).
- Une **superposition multi-pièces** est `PlacedPath{overlay}`à `svg.ts:193`avec une échelle de couverture `placeOverlay`+ un alignement `preserveAspectRatio`(`svg.ts:1275`) et un découpage sur la fenêtre (de sorte que chaque pièce dessine sa fraction du conteneur).
- Un **séparateur vertical** (`vertical-separator`, #697) est un `PlacedLine`(`svg.ts:173`) caressé dont `(x1,y1)→(x2,y2)` récupère `aboveEm = height + verticalAlign`— la même dérivation `svg.ts:718` le fait déjà.

### 4. Préserver la couleur, le fantôme et la fuite

Héritez du test fantôme `style.color`à `walk`(`svg.ts:132` `ColoredPlacement`,`svg.ts:479` `color=style.color ?? inheritedColor`,`svg.ts:744`sur cette valeur), continuez à avancer tout en sautant l'encre lorsque `color==="transparent"`(gère `\phantom`/`\vphantom`/`\hphantom`/`\mathstrut`'s `rlap`-`buildCommon.ts:96`,`svg.ts:479`), le groupe de même couleur s'exécute dans `<g fill=…>`(`svg.ts:1522`) et échappe à toute couleur interpolée via `escapeAttr`(`svg.ts:1542`) — les appelants d'aujourd'hui sont dérivés du thème, mais une valeur de l'entrée TeX comme `\color{…}` écrit l'argument textuellement dans `style.color` et sort de l'attribut autrement.

### 5. Dimensionnement correct – choisissez le bon seuil

`KATEX_FONT_SCALE`et `sizingRatio`composent de manière multiplicative à deux endroits : l'avance du stylo (`UPEM * scale`à chaque `parseEm`×) et le `PlacedGlyph.scale`(`fonts.ts:265`). Une entrée erronée dans `SIZE_MULTIPLIERS` égare les glyphes de taille script d'environ 50 %, ce qu'aucune réparation viewBox ne détecte.

### 6. Mettre à jour le contrat de mesure

Si la géométrie de la construction inclut l'étendue du conteneur (vlist `width`, largeur de radicande, fenêtre d'accolade), elle doit être **résolue une fois que la largeur est connue** (`emitVList` `maxX-startX`à `svg.ts:1227`; repli à la formule `state.x`à `svg.ts:1588`dans `emitSVG`). La précédente viewBox illimitée à `svg.ts:1630`(union de l'encre placée, pas seulement la zone de mise en page) est porteuse - l'expansion de cette boîte était le correctif du #521 pour `\smash`/`\hphantom` où `height/depth` sont nuls mais les enfants conservent leur taille.

### 7. Gardez les deux garde-corps verts

- `scripts/subset-glyphs.ts`— si la construction a exercé de nouveaux points de code, ajoutez-les au corpus de sous-ensemble (`src/glyphs/glyphs.subset.json`) et réexécutez la garde du codec (`test/glyphCodec.test.ts`broches `package.json`non-`sideEffects:false`et le nombre de 666 glyphes) afin que le corpus ne puisse pas supprimer silencieusement la nouvelle plage. Les points de code manquants mais présents dans les métriques s'affichent sous forme d'**espaces vides de largeur correcte** (`CHANGELOG:62`#665) ; Les points de code en affichage uniquement sont rendus sous forme de **source LaTeX brute** (`CHANGELOG:9`).
- `scripts/vendor-katex.ts --check`— ajoutez toute **nouvelle** constante transcrite CSS (`ROW_ALIGN_CLASSES`,`CLASS_H_METRICS`,`OVERLAY_PIECES`etc.) au garde-dérive qui dérive chaque valeur de la caisse en amont (aplatisseur `test/vendorCheck.test.ts`SCSS), de sorte qu'un changement de feuille de style lors de la prochaine bosse KaTeX échoue bruyamment plutôt que de déplacer silencieusement chaque construction qui en dépendait (ajout du garde-dérive `CHANGELOG:62`).

## Liste de contrôle de débogage

<!-- markdownlint-disable MD056 MD060 -->

| symptôme                                                                                               | vérifie d'abord                                                                                                    | fichier:ligne                                                                     |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Tous les extensibles hors toile / `p.x+sx·clip.x`doublé                                                | Chemin de découpage émis dans l'espace racine au lieu du chemin local                                              | `emit/svg.ts:1555` `invSx/invSy`                                                  |
| `\overbrace`/`\xleftrightarrow` mesure 400×N em ; viewBox 400× trop large                              | SVG multi-pièces considéré comme une avance littérale plutôt que comme une superposition en attente d'avance nulle | `emit/svg.ts:859` `OVERLAY_PIECES`+`emitOverlayPiece`                             |
| `\phase` mesure 400em alors que `\sqrt{x}` est correct                                                 | `hide-tail` sans `minWidth` en ligne avance toujours de 400em                                                      | `emit/svg.ts:966` `unclippedHideTail`                                             |
| `\sqrt{b^2-4ac}` vinculum tronqué en `0.853em`, radicand en partie à l'extérieur du radical            | Clip dimensionné à `minWidth`et non à `max(minWidth, radicandWidth)`ou `sqrt: center`                              | `emit/svg.ts:1186` `clip.w < width`+`svg.ts:266` `sqrt:left`                      |
| `\sum_{i}` limite le chasse à gauche ; Étiquette `\xrightarrow{label}` sur le bord gauche de la flèche | Classe d'alignement de lignes manquante                                                                            | `emit/svg.ts:266` `ROW_ALIGN_CLASSES`                                             |
| `\underline`/`\overline`/`\hline`/`\sout` manquant                                                     | Étendue de bordure sans largeur – supprimée car seul `frac-line` est pris en compte                                | `emit/svg.ts:800` `borderBottomWidth/katex-sout`                                  |
| Bord de la boîte `\boxed`/`\angl` invisible                                                            | Épaisseur de la bordure uniquement dans le raccourci `katex.scss`(`.angl`) ou `borderStyle`non lu                  | `emit/svg.ts:834` `CONTAINER_BORDER_CLASSES` + raccourci                          |
| `{c\|c}` rules invisible;`:` solide au lieu de pointillés                                              | La durée `vertical-separator` a été supprimée ;`borderRightStyle===dashed` non appliqué                            | `emit/svg.ts:718` `dashed`+`svg.ts:1597` `stroke-dasharray`                       |
| Encre `\llap`/`\clap` à droite de l'ancre                                                              | Les trois tours utilisant la sémantique `rlap`(`left:0`)                                                           | `emit/svg.ts:982` `llap/clap` sonde largeur + décalage                            |
| Contenu `\smash`/`\hphantom` découpé par viewBox                                                       | ViewBox dérivé de `height/depth` mis à zéro et non de l'union de l'encre placée                                    | Union d'encre `emit/svg.ts:1630` `minY/maxY`                                      |
| Les couleurs ont chuté ; `\color{red}x` noir ou inconnu semble valide                                  | `style.color` non hérité ; ou glyphes manquants connus non contrôlés via `emitted.missing`                         | `emit/svg.ts:479`+`markdown-math.ts:559` `missing.length>0` chemin de dégradation |
| Écart étroit/surmesure sur `\xrightarrow{\text{…}}`/`\boxed`/`\cancel`                                 | `padLeft/padRight/marginLeft`porté en classe non plié à l'avance                                                   | `emit/svg.ts:366` `CLASS_H_METRICS`                                               |
| Grand délimiteur : parenthèse courte / mauvais italique (`\mathit{123}` normal)                        | Police résolue sans ancêtre `classChain`                                                                           | `emit/svg.ts:427`+`fonts.ts:194` `resolveFont(chain)`                             |
| `Got group of unknown type`à `layout('x')`après `bun build`                                            | `packages/tex/package.json`défini sur `sideEffects:false`— les registres sont secoués                              | `packages/tex/package.json`+`test/glyphCodec.test.ts` garde sur ce terrain        |

## Streaming et pourquoi `layout → emit` n'est pas une ligne médiane réentrante

Le `InlineObjectBox`des mathématiques en ligne est corrigé **avant** que `LayoutEngine`le voie, de sorte que le pipeline TeX n'est jamais appelé à l'intérieur du chemin actif de la mise en page. Le `markdown-math.ts:85`paresseux de `import('@vectojs/tex')`signifie que la première formule d'une page s'affiche sous forme de source stylisée (le `else`à `markdown-inline.ts:316` `theme.mathFallbackColor`) jusqu'à ce que `preloadMathJax()`se résout -`ensureMathJax`/`retypesetFromTokens`(`markdown/src/Markdown.ts:3518`) fusionne les charges simultanées sur une seule promesse et reconstruit à partir de jetons déjà lexés, en gardant `tokenChildPrefix`trivialement correct. Le LRU de `inlineMathRasters`sur `markdown-math.ts:238`se réinsère sur chaque peinture afin qu'un bitmap encore visible ne soit pas expulsé, et `mathCache`(256) plus une casquette raster à la même limite est la protection en continu contre un document de longue durée qui décode des milliers de formules distinctes (résultat raster délimité `forge 2026-08-13`). Un deuxième appelant qui `await preloadMathJax()`avant la construction obtient une composition synchrone de première formule - le `onStable`du même chef de contrat 04 dépend du moment où il prend un instantané de `Array.from(content.children)`après `waitForAppendSettled`.

Ce contrat `degrade-to-source`est également le contrat d'absence de glyphe : le `convertMathToSVGDataURI`de `emitted.missing.length>0 → null`(`markdown-math.ts:559`) restitue une formule partiellement manquante en tant que **source TeX copiée** plutôt qu'une équation silencieuse, de sorte qu'un ajout de corpus qui a oublié un glyphe est visible comme un `CodeBlock`bleu plutôt que comme une mauvaise équation. La solution de secours de Display Math (`markdown/src/Markdown.ts:3520` `retypesetFromTokens`en gros) respecte le même contrat : un bloc `\digamma` dépourvu de contour ne produit jamais de bloc d'affichage espacé, il reste source.

### `packages/core/src/text/*` et l'invariant de texte plus profond

`core/src/text`(`core/src/text/Typography.ts:111`,`measureContext.ts:12`) façonne le texte **web** — BiDi, jointures arabes, avancées de polices variables — pas TeX. Les deux piles se rencontrent uniquement en `InlineObjectBox`: les deux sont des boîtes `width/height/depth`que `LayoutEngine`(`packages/layout/src/LayoutEngine.ts:808`) enveloppe de manière identique. L'invariant `measure-once, layout-many`de Boss 02 régit donc les deux : un `InlineObjectBox`obsolète après un changement de police, de DPR ou de largeur est un bug de parité, que la boîte contienne TeX ou `fillText`. TeX n'appelle jamais `registerFontMetrics`(`packages/text/src/fontMetrics.ts:82`) — ses métriques sont les `fontMetricsData.js` fournies ; les deux tables ont des propriétaires différents mais une seule vérité de mise en page.

## Invariants - liste de contrôle copier-coller avant PR

1. **Chaîne de classes stable en profondeur.** `resolveFont(classChain)`et `sizingRatio(classChain)`sont issus de l'accumulation réelle (`walk` `chain=[…classChain,…classes]`), et non d'une tranche de feuille.
2. **Chaque longueur en ligne est `parseEm * UPEM * localScale`.** Pas de seconde mise à l'échelle lors de la relecture : la balance est intégrée.
3. **Toute forme dont l'étendue correspond à l'étendue du conteneur est en attente jusqu'à `place*(startX,width)`.** Un deuxième consommateur lisant la même plage dans une vlist différente étirerait autrement un radical jusqu'à la largeur d'une fraction.
4. **Pas de `parseFloat("100%")`comme `100em`.**`parseLength`/`parseEm`divise `pct`par rapport à `em`; le pourcentage x dans les superpositions `\cancel` s'en remet à la largeur de la vlist comme une règle pleine largeur.
5. **Glyphe ⇔ police invariante.** Deux glyphes du même visage qui se répètent partagent une réutilisation `<defs><path>` et `href="#gN"`(carte `svg.ts:1639` `defId`) ; le jeu manquant est calculé à partir de la même résolution de police que celle qui a alimenté `getGlyph`, donc `convertMathToSVGDataURI`à `markdown-math.ts:559` supprime exactement les formules dont l'encre aurait un espace.
6. **Le remplissage appartient au SVG et à la boîte ensemble.** `EmitResult.{width,height,depth}`sont des **ink** ;`Emitted.svg` `width/height`inclut `+padEm` de tous les côtés. L'arithmétique `convertMathToSVGDataURI`/`+pad2` de `+MATH_PAD_EM` dépend de la constante de pad nommée - le découplage et chaque formule de démarque sont mal placés.
7. **Les points de suspension/tirets en prose ne sont pas à l'intérieur de TeX ou du code.** L'itinéraire `decodeProse`/`applyTypography`(`markdown-inline.ts:58`) passe uniquement par `emitProse`— les étendues de code et le repli en cas d'échec mathématique (`markdown-inline.ts:321`) les contournent, donc `--` à l'intérieur de `code` ou un `$$` dégradé ne devient jamais un tiret final.

---

## Références

- `vectojs-docs/content/learn/text-typography.md`— ce que `TextStyle.baselineShift`/`fontSize` achète pour sub/sup (l'autre course surélevée de type mathématique en ligne).
- `vectojs-docs/content/learn/streaming.md`+ boss 04 — pourquoi les extensions `marked`affectent `findStableCut`, et pourquoi les mathématiques en ligne `InlineObjectBox`diffèrent des étendues `RichText`.
- `vectojs-docs/forge/decisions/math-engine-2026-08.md`— la décision mesurée, la portée du fournisseur, le choix d'encodage des glyphes, la correction 5 (`sideEffects:false`) et le classement de difficulté TeX en quatre parties.
- `vectojs-docs/forge/findings/text-richtext-and-markdown.md:1789-1924` — les neuf résultats tex P2/P3 du 13/08/2026 + les résultats du raster délimité en un seul endroit.
- `vectojs-docs/forge/baselines/*.json`+`run-browsers.sh` — les seuls nombres pouvant être cités ; les chemins sans tête sont un fil déclencheur de régression.
- `packages/tex/test/emit.test.ts`+`svgClipWindows.test.ts`+`vendorCheck.test.ts` — les contrats qu'une nouvelle construction doit garder verts (coïncidence clip-fenêtre, fenêtrage multi-pièces, garde-dérive).

---

_Suivant : 06 VMT Runtime — le cycle de vie, la propagation sale et l'envoi d'événements sur lesquels chaque `SVGEntity`et `MathBlock` construits par un émetteur sont montés._
