+++
title = "04 — Streaming Markdown — Réconciliation incrémentielle"
description = "Pourquoi n'importe quel préfixe peut être une syntaxe incomplète, le lexer de préfixe validé, le protocole delta de travail, le jeton → l'entité se réconcilient avec les mutateurs sur place, les pièges O (C · N²) et l'instance de wrapper, et le moyen sûr d'ajouter une nouvelle extension."
weight = 24
+++

# 04 — Streaming Markdown — Réconciliation incrémentielle

Les flux LLM sont **en ajout uniquement** et **à grain de jeton** (~ 4 caractères par morceau). VectoJS doit afficher un document lisible après chaque morceau - pas de blanc avant `close()`. La stratégie évidente - relexer toute la source accumulée et reconstruire l'arborescence des entités à chaque fois - est `O(document)` par morceau, donc `O(N²)` sur un flux. Ce chapitre présente le mécanisme qui fait qu'il est `O(unstable tail)` à la place, ainsi que les pièges qui empêchent chaque moitié de fonctionner silencieusement.

## Pourquoi un préfixe est une syntaxe incomplète

`marked` est un lexer **one-shot**. Cela suppose que toute la source est présente. Chaque construction Markdown dont le terminateur n'est pas encore arrivé change la signification du préfixe une fois qu'il le fait :

| préfixe à l'écran               | à quoi ça ressemble maintenant                                               | ce que le prochain morceau peut faire                                                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `## Heading` sans terminer `\n` | `heading(depth:2)`                                                           | `heading(depth:1)` si un `#` de tête est toujours en vol (`#` → `##`) — la profondeur n'est pas stable jusqu'à la fin de la ligne                      |
| `**bold`                        | `text("**bold")` + littéral `**`                                             | `strong("bold")` une fois le `**` de clôture arrivé                                                                                                    |
| `[label](https://ex`            | `text("[label](https://ex")` + URL nue liée automatiquement                  | `link(label → https://example.com)` — l'URL n'est même pas encore un href complet                                                                      |
| ` ```js\nconst a=1 `            | `code(lang:js, text:"const a=1")` with unclosed fence                        | still a `code` — but the fence may also become ` ```math ` puis être composée comme affichage mathématique                                             |
| `\| a \| b \|\n\| --- \| ---`   | `table(header:[a,b], rows:[])` — ligne de délimiteur, zéro ligne de corps    | `table(rows:[[…]])` — `marked` matérialise une ligne partielle sous la forme d'une ligne complète de **cellules vides** puis les remplit une à la fois |
| `$$\nx`                         | `paragraph("$$\\nx")` (l'entrée de paragraphe des clips d'extension marqués) | `blockMath("x")` une fois `$$` fermé — et le clip `start()` marqué peut **fusionner rétroactivement** deux jetons `paragraph` précédents               |

Sans une couche prenant en charge le streaming, chacun de ces retournements serait un démontage des entités rendues. La couche comporte deux moitiés – lex et réconcilier – et les défauts vivent à leur jointure.

## Architecture — lex · transfert · réconcilier

```text
chunk ──► consumeFrontMatter ──► dispatchAppend ──► MarkdownWorker (off-thread)
                │                        │                    │
                │ rawMarkdown            │ postMessage         │ incrementalLex
                │ (body only)            │ {append,expectedLen}│ lexAppend / lexFull
                │                        │  or {text,oldRaws}  │ findStableCut + verify
                │                        │                    │
                ◄────── matchLen + tail ─┘                    │
                              │                               │
                     updateTokens(matchLen, tail)  ◄──────────┘
                              │
              ┌───────────────┼───────────────────┐
              │ prefix [0,matchLen) kept          │  entitiesReused++
              │ tail: reuse / rebuild / mutate    │  inPlaceUpdates vs entitiesRebuilt
              └───────────────┼───────────────────┘
                              │
                    content Stack + width/height republish
                              │
                    Scene.markDirty() + notifyLayoutUpdated()
```

Trois modules possèdent les trois phases :

- **Lex** — `packages/markdown/src/incrementalLex.ts:446` `lexFull` / `packages/markdown/src/incrementalLex.ts:477` `lexAppend` plus `MarkdownWorker.ts:230` `self.onmessage`. Le cache est `IncrementalLexCache` (`incrementalLex.ts:207`) : `source`, `tail = source.slice(stableOffset)`, `tokens`, `stableCount`, `stableOffset`, `degraded`.
- **Transfert** — `Markdown.ts:2244` `dispatchAppend` et `MarkdownWorker.ts:345` diff. L'état stable envoie `{append, expectedLength}` (delta) ; first/resync/recovery envoie `{text, oldRaws}` (complet). Le diff du travailleur calcule `matchLen` et renvoie `tail = tokens.slice(matchLen)`.
- **Réconcilier** — `Markdown.ts:3674` `updateTokens(oldTokens → newTokens, knownMatchLen)`. Mappe les index de jetons aux emplacements enfants via `tokenChildPrefix` (`Markdown.ts:1030`, maintenu de manière incrémentielle par `setTokens` à `Markdown.ts:1041`), puis trois chemins par jeton : **réutilisation intacte**, **mutation sur place** (`setSpans`/`setCode`/`appendRows`) ou **détruire + reconstruire**.

Le sujet initial est supprimé **avant** le lexing (`frontMatter.ts:94` `scanFrontMatter`, `Markdown.ts:1116` `initSource` / `Markdown.ts:1157` `consumeFrontMatter`) afin que le travailleur n'en garde aucune notion - `workerSourceLen` et `expectedLength` restent décalés dans le corps du texte uniquement. Une ouverture non résolue est retenue jusqu'à `MAX_PENDING_CHARS = 4096` (`frontMatter.ts:62`) et libérée par `finalizeFrontMatter()` du `onClose` **avant** `waitForAppendSettled` (`Markdown.ts:1409`) du flux.

### Ce que faisait l'ancien chemin

Avant `incrementalLex`, `MarkdownWorker` détenait `{source, raws, version}` (ancienne forme `MarkdownWorker.ts:213`), ajoutait le delta, puis lexait la source accumulée **toute**. La correspondance du préfixe brut `99.5%` s'est exécutée _après_ le lex, elle a donc sauvegardé les reconstructions d'entité mais n'a jamais pu sauvegarder le lexing - un analyseur linéaire a invoqué `N` fois sur un préfixe croissant. `postMessage` a ensuite renvoyé l'intégralité de l'arborescence des jetons. Les deux moitiés étaient `O(document)` par morceau ; les références dans § Numbers l'ont rendu citable avant le correctif.

## Lex incrémental - l'idée du préfixe engagé

`marked` n'a pas d'API incrémentielle. Le correctif suit une **limite de bloc stable** — un décalage de caractères avant lequel la liste de jetons ne peut plus changer — et redéfinit uniquement le texte qui suit.

### La règle de la coupe stable

`findStableCut` (`incrementalLex.ts:331`) recherche en arrière un jeton `space` qui est suivi d'au moins un jeton, sans jamais dépasser le premier des deux jetons `paragraph` adjacents, et seulement une fois réglé :

- Un `space` poussé signifie toujours une **vraie ligne vierge** — un seul `\n` est fusionné dans le `raw` du jeton précédent (`incrementalLex.ts:36`).
- Pour chaque règle intégrée, seul le jeton adjacent à la fin de la source peut encore changer. Le formulaire `nFollow >= 1` a été balayé par force brute : sans danger pour tous les types prédécesseurs (`blockquote`, `code`, `heading`, `hr`, `html`, `list`, `paragraph`, `table`), tandis que `nFollow == 0` échoue pour `code`/`list`/`paragraph` (`incrementalLex.ts:39`).
- **`list` a besoin d'un décalage de deux jetons.** `'- a\n\n- b\n'` est un `list` quel que soit le nombre de lignes vides ; le même marqueur fusionne toujours. `cutIsSettled` (`incrementalLex.ts:314`) nécessite que le jeton après le `space` lui-même soit réglé avant qu'une coupure à travers un `list` précédent soit effectuée.
- **`blockMath` forward reach** est délimité par une ligne vierge dans le tokenizer : `(?:(?!\n[ \t]*\n)[\s\S])+?` (`Markdown.ts:294`, `MarkdownWorker.ts:122`). Le précédent `(?!\n\n)` laissait les lignes d'espaces uniquement sans surveillance - `'$$\nx\n   \n$$\n'` était toujours un `blockMath` (`incrementalLex.ts:67`).
- **La portée arrière `blockMath`** est `paragraphPairCap` (`incrementalLex.ts:289`) : le clip `startBlock` marqué ne peut fusionner que **deux** adjacents** `paragraph` jetons, et une coupe stable se termine toujours après un `space`, donc une paire ne peut jamais chevaucher une limite. L'ancien remède – se dégrader à tout début de ligne `$$` – était suffisant mais jamais nécessaire ; rétrécissement jusqu'au cap récupéré `139×` (voir § Chiffres).
- **Les références de lien, les conteneurs `:::`, les notes de bas de page `[^label]:`** se dégradent complètement (`DegradeReason` à `incrementalLex.ts:225`) : un `def` réécrit rétroactivement les jetons en ligne précédents (`incrementalLex.ts:122`), une clôture de conteneur et le scanner de continuation de note de bas de page (`markdown-footnote.ts` `consumeContinuation`) ont une portée avant illimitée. Dégrader conserve l'exactitude ; refuser une avance sans carrelage (`advanceTiles` à `incrementalLex.ts:360`) coûte à la place une partie de la croissance de la fenêtre.

Chaque avance est **vérifiée** (`advanceTiles`, `incrementalLex.ts:360`) : `source.slice` doit être égal au `raw` concaténé de jetons le couvrant. Une source se terminant par un marqueur de liste nu `'- a\n- '` renvoie à `'- a\n-\n'` brut - l'hypothèse selon laquelle la source de tuiles `raw` est généralement vraie mais pas toujours (`incrementalLex.ts:130`), de sorte que les avancées non vérifiées sont refusées plutôt que dégradées.

### Modèle de coût

- `tail = prev.tail + append` — l'analyse de `tail` seule conserve le chèque `O(window)` plutôt que `O(document)` (`incrementalLex.ts:490`).
- `charsLexed` (`incrementalLex.ts:248`) rapporte les caractères réellement transmis à `marked.lexer()` — la mesure directe de ce que la limite a enregistré. `reusedTokens` signale les principaux jetons extraits du cache.
- La somme naïve `sourceCharsLexed` résumait elle-même les bruts `matchLen` par réponse - `O(n²)` sur un flux (#657). Désormais, `IncrementalLexCache.stableOffset` est expédié depuis le lex et est ajouté `O(1)` (`Markdown.ts:989`, `Markdown.ts:2289`).

### Extensions dans le hot path : pourquoi le PX-0524 est important

Chaque extension `marked` enregistre un scan + tokenizer `start()`. Le chemin incrémentiel doit le classer (voir § Ajout d'une extension) sinon `sourceCharsLexed` régresse à la longueur du document — le signal dans le groupe `Parser cost` de `getDevtoolsDescriptor` (`Markdown.ts:2112`) que cette instance a dégradé.

## Protocole des travailleurs : pourquoi le transfert est également important

Re-lexing n'était pas le seul terme `O(N²)`. `postMessage` **structured-clones** son argument de manière synchrone sur le thread principal. Le renvoi de l'intégralité du document par morceau a effectué le transfert `O(document)` même après le fenêtrage de Lex - mesuré `4 µs` à 8 Ko passant à `220 µs` à 512 Ko contre `~2 µs` plat pour une publication de la taille d'un morceau (`Markdown.ts:1017`).

Le correctif met en cache à la fois les valeurs brutes du jeton **et** la source dans le travailleur (`MarkdownWorker.ts:213` `rawCache`), saisie par `workerInstanceId` + `tokenVersion` (`Markdown.ts:1008`). Sans `tokenVersion` heurtant chaque `setTokens` (`Markdown.ts:1043`), un `setContent` suivi d'un ajout différait des raws obsolètes.

- **Delta** — `append` + `expectedLength` (`Markdown.ts:2345`). Le travailleur étend `cached.lex.source` avec `append`, vérifie `cached.lex.source.length + append.length === expectedLength` (`MarkdownWorker.ts:308`) — un entier, aucun travail de chaîne — et exécute `lexAppend`.
- **Complet** — `text` + `oldRaws` (`Markdown.ts:2355`), pour la première demande, `setContent`, synchronisation de repli ou `needResync`. Le travailleur demande une resynchronisation (`MarkdownWorker.ts:294`, `299`, `334`) plutôt que de rechercher une source divergente : un mauvais `matchLen` corromptrait le `updateTokens` de l'appelant.

`matchLen` est calculé à partir de la **même** liste précédente par rapport à laquelle l'appelant diffère. Lorsque le travailleur a réutilisé `reusedTokens` de la lex, l'analyse commence à `reusedTokens` (`MarkdownWorker.ts:385`) — `O(window)` ; revenir à l'analyse à partir de 0 serait à nouveau `O(document)`. L'expulsion est limitée (`RAW_CACHE_MAX = 256` à `MarkdownWorker.ts:228`) par les entrées les plus anciennes.

L'appelant prend un instantané de `this.tokens` et `this.tokenVersion` lors de l'envoi (`Markdown.ts:2252`) et fusionne tandis que `appendInFlight` est vrai (`Markdown.ts:2220`). Les horodatages `dispatchedAt` alimentent `streamStats.workerMs / workerMsMax` (`Markdown.ts:2273`), dont la pire valeur est le signal de perte de trame.

## Réconcilier — arbre de jetons → arbre d'entités, sans reconstruire ce qui n'a pas changé

### L'idée du préfixe engagé - l'intuition

Considérez le document comme deux régions divisées en `stableOffset` :

```text
[████████████ stable █████████████████] [ unstable tail ]
 |  already committed — never re-lexed  |  may still change |
 |  raw-equal, entity-reused            |  this chunk's work |
```

L'ajout de texte ajouté à la **queue uniquement** ne peut jamais affecter un préfixe stable — c'est-à-dire l'invariant `findStableCut` gagné par force brute. La queue est `O(window)` — délimitée par la distance entre les lignes vides et tout conteneur ouvert — donc le travail par morceau s'adapte à la région ouverte, et non à la longueur du document.

### DevTools - l'observer en direct

`getDevtoolsDescriptor` (`Markdown.ts:1989`) fait surface, le streaming contredit le récit ci-dessus et cite :

- `Streaming` — `appends` / `workerResponses` / `workerMsAvg` / `workerMsMax` (la trame supprimée est `max`, pas `avg`).
- `Delta shape` — ratio `stablePrefixChars` / `changedTailChars` (proche de 1 signifie une réutilisation élevée) et `entitiesReused` / `entitiesRebuilt` / `inPlaceUpdates` (le chemin rapide).
- `Incremental reuse` — `tokensPrefixMatched` / `tokensReturned` / `tokenPrefixReuseRatio`.
- `Parser cost` — `lexerMs` / `sourceCharsLexed`. Si `sourceCharsLexed` suit la longueur du document, cette instance est dégradée.

### Mappage de jetons sur des emplacements enfants

Tous les jetons de bloc ne restituent pas une entité (`space`, non-SVG `html`, les jetons de type commentaire restituent `null`). `producesEntity` (`Markdown.ts:4044`) est le prédicat ; `tokenChildPrefix` est sa somme de préfixe, reconstruite uniquement pour le suffixe modifié par `setTokens(validFrom)` (`Markdown.ts:1041`). `updateTokens` puis :

1. Dérive `matchLen` — la longueur du préfixe brut et égal. Lorsque le travailleur a fourni `knownMatchLen`, il est validé (`0 ≤ knownMatchLen ≤ minLen`) plutôt qu'aveuglément fiable (`Markdown.ts:3689`).
2. Met `matchLen` en majuscules à `0` si `abbreviations` a été modifié (`Markdown.ts:3711` `mapsEqual` sur `collectAbbreviations`) — un `*[TERM]: …` tardif peut affecter les jetons en ligne des paragraphes précédents malgré `raw` inchangé (`markdown-abbr.ts` parallèle à `hasLinkDefinitions`).
3. Essaie un chemin rapide **sur place** lorsque `matchLen === oldTokens.length - 1` et les types correspondent (`Markdown.ts:3760` `lastTokenSameType`). Sinon, il faut détruire + reconstruire pour le suffixe.

Remarque : la boucle de destruction `updateTokens` commence **à** `matchLen` — elle partait de `0` avec une garde `i >= matchLen`, ce qui en faisait `O(total blocks)` par morceau même lorsque le préfixe était entièrement réutilisé (`Markdown.ts:3956`).

### Mutateurs sur place : le cas de la queue en croissance

La réalité du streaming est **en ajout uniquement avec une queue croissante**. Sept mutateurs couvrent les formes de queue qu'un flux produit réellement :

| jeton de queue                  | mutateur                                                                                                          | fichier:ligne                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `paragraph` (pas d'image)       | `RichText.setSpans(literalSpans)`                                                                                 | `Markdown.ts:3833`                                             |
| `paragraph` (portant une image) | `Stack` de `[RichText, Image, …]` : étendre `RichText` de fin via `setSpans`                                      | `Markdown.ts:3846` `updateImageParagraph` (`Markdown.ts:3085`) |
| `code` (clôture non fermée)     | `CodeBlock.setCode(text, lang)`                                                                                   | `Markdown.ts:3796`                                             |
| `heading`                       | `RichText.setSpans(headingSpans)` avec protection de profondeur                                                   | `Markdown.ts:3875`                                             |
| `blockquote`                    | descendre jusqu'au wrapper de queue `innerStack`, réécrire son unique enfant                                      | `Markdown.ts:3900` `updateBlockquoteTail` (`Markdown.ts:3306`) |
| `list`                          | réécrire les nouveaux éléments `setSpans`, `append` du dernier élément conservé                                   | `Markdown.ts:3914` `updateStreamedList` (`Markdown.ts:2987`)   |
| `table`                         | `RichText.setSpans` sur les cellules de la dernière ligne conservée, `Table.appendRows` pour les nouvelles lignes | `Markdown.ts:3932` `updateStreamedTable` (`Markdown.ts:3203`)  |

Chaque resynchronisation de queue est `resizeLastChild` (chemin rapide `Stack.ts`) — `O(1)` — et non un `Stack.layout()` complet (`Markdown.ts:3843`, `3859`, `3886`, `3904`, `3945`). L'attribut arm `reflowToken` (`Markdown.ts:1520`) est l'homologue sans streaming de `setMaxWidth` — conservé bras pour bras avec `renderToken` afin que les changements de largeur ne nécessitent pas non plus de reconstruction.

`renderToken` (`Markdown.ts:4150`) est le chantier de construction ; `producesEntity` et `reflowToken` doivent rester en **verrouillage à trois voies** sur les bras qu'il ajoute — un nouveau bras sans les deux autres est un bug silencieux pour l'un des trois sites d'appel.

### Disposition des blocs de démarque

La géométrie du bloc est pilotée par `LayoutEngine` (`packages/layout/src/LayoutEngine.ts:808`). `RichText` s'enroule à `availableWidth` (`Markdown.ts:4158`) via l'espace vertical `Stack` `theme.blockGap` ; les blockquotes et les conteneurs `:::` indentent leur `innerStack` de `quoteIndent`/`containerIndent` et accrochent `QuoteBorder`/`ContainerBackground` à la hauteur `Stack` résultante (`Markdown.ts:3403`, `Markdown.ts:4402`). `measureText` pour les boutons d'accessibilité utilise la police du document (`blockAffordances.ts:379`) afin que le contrôle soit dimensionné avant d'être peint. `LayoutEngine.prepareRich` est le disjoncteur de ligne pour `RichText` ; son mémo est saisi sur le contenu et non sur la largeur, donc `setMaxWidth` se réenroule via la forme et non la remesure - la même raison pour laquelle `reflowToken` existe.

### Crochets de défilement et de sélection

Le `Markdown` non virtualisé est un enfant normal d'un `ScrollView` (pilote à ressort `packages/ui/src/ScrollView.ts:219`) : l'hôte défile en définissant `content.y` et appelle `notifyLayoutUpdated` (`Markdown.ts:2643`) lorsque la re-mise en page déplace des blocs sous une image. Avec `virtualize` activé, `Markdown.setVisibleRange` (`Markdown.ts:1265`) est le pilote de défilement ; la hauteur hors écran vit dans `RowHeights`, et non en tant qu'entités détachées. La sélection vit dans des étendues `RichText` ; la réutilisation du préfixe `updateTokens` maintient les porteurs `InlineObject` des lignes établies (image/math `OBJECT_REPLACEMENT`) en dehors du chemin du compositeur, tandis que le `setSpans` de la queue en croissance préserve la sélection à l'intérieur sans reconstruire la géométrie de la ligne.

## Le piège O(C·N²) et le bug wrapper-instanceof

### O(C·N²) — la forme que les tests n'ont pas générée

Un jeton `table` porte **chaque ligne** ; un jeton `list` contient **chaque élément** ; un `blockquote` transporte **chaque bloc interne**. Le naïf réconcilier les a tous reconstruits sur chaque morceau :

- Liste des éléments `N`, diffusés élément par élément : constructions `1 + 2 + … + N = Θ(N²)` `RichText` — mesurées `528` par rapport à `32` pour une liste de 32 éléments (commentaire `Markdown.ts:3908`).
- Table de `N` lignes, `C` colonnes : `Θ(C·N²)` constructions de cellules **plus** `Table.layout()` réexécutant `fitCell` sur chaque cellule — `2×` en haut.

Le banc de transcription global a révélé que `mixed` reconstruisait toujours une liste complète qui venait d'arriver sur chaque morceau de prose suivant - invisible pour toute forme à construction unique (`benchmarks/markdown-transcript/corpus.ts`).

### L'instance wrapper de miss - pourquoi le streaming a régressé sous un indicateur d'adhésion

`blockAffordances: true` encapsule le code et les tables dans `BlockWithAffordances` (`blockAffordances.ts:433`) — un `UIComponent` qui possède le bloc ainsi que ses enfants de copie/téléchargement `BlockAffordanceButton`, se dimensionne à partir du bloc (`blockAffordances.ts:457`) et se projette en tant que `role: group` (`blockAffordances.ts:488`). Le wrapper corrige l'ordre DOM = l'ordre de tabulation et évite de voler la mise en page de `Stack`/`Table`.

Le chemin rapide de streaming a testé directement `existingEntity instanceof Table` / `instanceof CodeBlock`. Avec le wrapper activé, ces tests **renvoyaient toujours false**, donc chaque morceau payait la reconstruction complète.

Sites concernés avant le correctif : `updateTokens` (`Markdown.ts:3781`, `Markdown.ts:3209`), `updateBlockquoteTail` extraction de queue (`Markdown.ts:3348`), `reflowToken` `code`/`table` bras (`Markdown.ts:1557`, `Markdown.ts:1651`), `updateStreamedTable` (`Markdown.ts:3212`). Le modèle est :

```ts
const target = entity instanceof BlockWithAffordances ? entity.block : entity;
if (!(target instanceof Table)) return false;
// … and after a width/content change:
if (entity instanceof BlockWithAffordances) entity.refreshAffordances();
```

`#789` / `#795` (problème `vectojs`) est ce bug. `code-review-2026-08.md:167` enregistre tous les sites ensemble car ils se regroupent.

### Pourquoi les tests d'instantanés l'ont manqué

La suite de démarques est dominée par des instantanés basés sur `setContent`. `setContent` **reconstruit toujours** (`Markdown.ts:1740`) : il réinitialise `tokenVersion`, efface les enfants et appelle `renderMarkdown`. Il **n'exerce jamais** le chemin de réconciliation du streaming (`updateTokens` + `inPlaceUpdates`/`entitiesRebuilt`/`tokenChildPrefix` + wrapper déballage). Une extension ou une option qui rompt uniquement le chemin de réutilisation a donc réussi chaque instantané et n'a échoué que sous `appendMarkdown` au niveau de la granularité du jeton. Le sabotage `1/11` qui a conduit `setContent` et prétendait protéger la réutilisation est l'exemple canonique (`forge/findings/text-richtext-and-markdown.md:552`).

Règle de porte : tout changement de streaming doit inclure des **sabotages d'équivalence de streaming** — diffuser le corpus un caractère à la fois avec un `toEqual` profond contre `marked.lexer()` à chaque préfixe (modèle `incrementalLex.test.ts`) et avec une granularité `appendMarkdown` pour la réconciliation.

### L'explosion de l'extension PX-0524 - lorsque l'incrémentation n'est toujours pas gratuite

L'ajout d'une couverture syntaxique (note de bas de page, conteneur, emoji, abbr, ins/mark, exposant — `markdown-footnote.ts` `FOOTNOTE_EXTENSIONS`, `markdown-container.ts` `CONTAINER_EXTENSIONS`, `markdown-emoji.ts` `EMOJI_EXTENSIONS`, `markdown-abbr.ts` `ABBR_EXTENSIONS`, `markdown-ins-mark.ts`, `markdown-superscript.ts`) a pris l'instance `marked` partagée des extensions `2` à `faeeb0b7` à `12` à `2a4bd52`. Chacun est une paire `start()`/`tokenizer` que `marked` consulte **par bloc et par travée en ligne** — donc même avec `incrementalLex` fenêtrant le lex sur `O(tail)`, le coût par morceau est de `O(tail × extensions)`. L'augmentation de l'analyse `1.67×` en § Nombres correspond au prix de ce cluster par morceau, jamais mesuré lors de son expédition. `markdown-math.ts:258` `blockMath`/`inlineMath` sont les deux qui ont déjà été payés ; les dix autres sont le changement progressif. Leçon : tout ajout d'extension doit réexécuter les portes de parité `markdown-transcript` et `stream-markdown-smd` – un gain à facteur constant provenant de l'incrémentation peut être mangé par une perte à facteur constant du nombre d'extensions.

### Destruction et raster arrivé tardivement

Deux autres hooks de cycle de vie rivalisent avec le streaming. `Markdown.destroy()` (`Markdown.ts:1938`) supprime chaque entrée `workerCallbacks` qui épingle `this` via sa fermeture - sans qu'une destruction en cours de route maintienne l'ensemble du sous-arbre en vie jusqu'à ce que le travailleur réponde. `isDestroyed` ouvre la suite `mathLoadPending` (`Markdown.ts:1952`) afin qu'un arbre démoli ne soit pas restitué en un sous-arbre détaché.

Les images en ligne et les mathématiques ont leurs propres corrections post-streaming. Le `onLoad` d'une image de paragraphe à `Markdown.ts:2562` re-mesure à partir de `naturalWidth`/`naturalHeight` et appelle `reflowAfterImageResize` (`Markdown.ts:2604`), qui redérive les boîtes d'emballage de bas en haut (`resyncWrapperBox` à `Markdown.ts:2674`) - un simple `content.layout()` relirait le cache parent obsolète (commentaire `Markdown.ts:2591`). Une image en ligne à l'intérieur d'un en-tête ou d'une cellule de tableau ne peut pas être redimensionnée de la même manière : sa zone est intégrée à la ligne de `LayoutEngine` ; à la place, `subscribeInlineImageRemeasure` (`Markdown.ts:1819`) est recomposé lorsque `inlineImageBoxesStale` (`Markdown.ts:1855`) signale un décodage non carré, mais une seule fois par URL (`inlineImagesMeasured` à `Markdown.ts:1894`). Les mathématiques sont analogues : `ensureMathJax` (`Markdown.ts:3518`) fusionne les charges simultanées sur une seule promesse `preloadMathJax`, et `retypesetFromTokens` (`Markdown.ts:3551`) reconstruit en gros à partir des jetons déjà lexés - le seul chemin qui maintient `tokenChildPrefix` trivialement correct.

## Tension à cinq voies : le design doit satisfaire tout à la fois

| forcer                           | ce qu'il exige                                                                                                                                                                                     | où il vit                                                                                                                                                                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Exactement**                   | `lexFull(source)` et les ajouts de streaming sont **profondément identiques** à `marked.lexer(source)` à chaque longueur de préfixe ; Le résultat `updateTokens` est égal au résultat `setContent` | `incrementalLex.test.ts` char-at-a-time fuzz, `markdownWorkerProtocol.test.ts` portes de diff renforcées pour **l'égalité des arbres**                                                                                                        |
| **Incrémentalité**               | Le travail par morceau est `O(window)` (queue instable), et non `O(document)` — la croissance illimitée de la queue est une régression                                                             | Compteurs `stableOffset` / `charsLexed` / `changedTailChars` ; `sourceCharsLexed` doit suivre le partage de charge utile, pas la longueur du document                                                                                         |
| **Stabilité de la sélection**    | L'ajout ne doit pas déplacer ou détruire la sélection à l'intérieur d'un bloc à l'écran installé et stationnaire.                                                                                  | `tokenChildPrefix` + réutilisation des entités de préfixe `matchLen` ; `updateTokens` ne touche jamais les enfants du préfixe (`Markdown.ts:3956`)                                                                                            |
| **Stabilité de la mise en page** | Aucun bloc hors écran ne doit modifier la disposition d'un bloc à l'écran déjà peint en cours de route.                                                                                            | Pas de rétrécissement `finalizeFrontMatter` de `rawMarkdown` (exigence du protocole) ; Resynchronisation de la queue uniquement `resizeLastChild` ; pas de redistribution de redimensionnement d'image qui relit les boîtes parents obsolètes |
| **Performance**                  | Le travail de rendu/mise en page par morceau reste dans le budget du cadre après la victoire incrémentielle                                                                                        | § Nombres – rapprochez maintenant `~5%` du total ; rendre `61%` et analyser `33%` dominer                                                                                                                                                     |

Violer l'un pour aider l'autre est un modèle récurrent : le correctif initial "évident" (lex puis supprimé) réduit `rawMarkdown` et rompt le `expectedLength` du protocole de travail ; un correctif d'image qui est réorganisé à partir de `content` seul sans resynchroniser les wrappers laisse les boîtes parent obsolètes (`Markdown.ts:2595` `reflowAfterImageResize`).

## StreamController – stimulation, contre-pression et à qui appartient la proximité

`Markdown.appendMarkdown(chunk)` est l'ajout brut. `Markdown.createStream(opts)` (`Markdown.ts:1384`) l'enveloppe dans un `StreamController` (`StreamController.ts:129`) qui ajoute trois éléments que le chemin brut n'ajoute pas - tous facultatifs, tous en affichage uniquement, aucun n'est autorisé à supprimer des caractères :

- **Coalescence de cadres.** Sans rythme, chaque `write()` publierait sur le travailleur et planifierait une réconciliation. Le contrôleur regroupe les ticks en `requestAnimationFrame` (`StreamController.ts:351` `schedule` / `onFrame`). L'appelant le plus simple n'utilise aucune option `pacing` - juste le traitement par lots RAF - ce qui est le cas SSE courant de style ChatGPT.
- **Stimulation des graphèmes.** `pacing: { graphemesPerSecond }` (`StreamController.ts:22`) draine la file d'attente interne `chunks` via `commitPaced` (`StreamController.ts:378`) avec le comptage des graphèmes `Intl.Segmenter` afin qu'un effet de machine à écrire fasse avancer un cluster de graphèmes par tick, et non une unité de code UTF-16 (les emoji restent intacts).
- **Contre-pression.** `maxBufferedChars` (`StreamController.ts:29`, par défaut `64 KiB`) délimite la file d'attente ; `write()` contre-pressions une fois plein (`StreamController.ts:183` `canAdmit` / `blocked`). Il s'agit d'un contrôle de flux et non d'une correction incrémentielle : le tampon limité ne tronque jamais le document.

Le cycle de vie est `createStream → write* → close() → onStable`. `createStream` est lancé si `virtualize` est activé (`Markdown.ts:1385`) ou si un flux existe déjà (`Markdown.ts:1388`) — au plus un contrôleur par instance ; La fusion `appendInFlight` + `appendPending` à emplacement unique de `updateTokens` le suppose. `close()` valide tous les morceaux en attente de manière synchrone (`StreamController.ts:244` `commitAllSubmitted`), bascule l'état vers `closed`, puis attend le hook `onClose` de l'hôte (`Markdown.ts:1404`) qui exécute `finalizeFrontMatter` et `waitForAppendSettled` (`Markdown.ts:1413` — la dernière réponse du travailleur + tout `mathLoadPending` `preloadMathJax` + `fencedRebuildPending`). Ce n'est qu'alors que `onStable` se déclenche (`Markdown.ts:1419`) avec `Array.from(content.children)` — un instantané, pas une référence en direct (`incompleteMode.test.ts:313`). `onStable` ne doit pas appeler `appendMarkdown`/`setContent`/`setMaxWidth` (`Markdown.ts:3669` `assertNotInStableCallback`) — le document terminé lui est remis pour un travail ponctuel comme la création d'un cache de surbrillance.

## Syntaxe optimiste incomplète - deviner le bord arrière

Un préfixe diffusé se terminant par `**bo` doit immédiatement afficher **gras**, et non `**` brut. `StreamControllerOptions.incompleteMode` (`StreamController.ts:43`) contrôle cela ; `Markdown.streamIncompleteMode` (`Markdown.ts:853`) détient la stratégie tandis que `StreamController` ne possède que la mise en mémoire tampon.

- `'literal'` (par défaut) — ce que chaque version précédant cette option a livrée : la syntaxe non fermée s'affiche sous forme de texte brut de `marked.lexer`, donc `**bo` reste `**bo` jusqu'à ce que le plus proche arrive.
- `'optimistic'` — `optimisticParagraphSpans` (`Markdown.ts:3415`) analyse uniquement le **dernier jeton en ligne** du paragraphe **de fin** (une construction fermée est déjà son propre jeton `strong`/`em`/`codespan`/`link`, donc seule l'exécution finale en texte brut peut contenir un ouvreur). `findUnclosedInline` (`markdown-inline.ts:546`) vérifie trois syntaxes en priorité : backtick (gagne carrément - à l'intérieur d'un intervalle de code, rien d'autre n'est de la syntaxe), accentuation `*`/`_` (`\*{1,2}(?!\*)` marqueur entier plus garde non-espace ; `_` exclut `snake_case` à `markdown-inline.ts:570`) et `[label](url` (`markdown-inline.ts:581`). La supposition restitue l'exécution avec le formatage deviné (`optimisticStyle` à `Markdown.ts:3484`) et la suit dans `optimisticTail` (`Markdown.ts:866`). Un ajout fusionné peut laisser le paragraphe deviné sans fin - `dropStaleOptimisticTail` (`Markdown.ts:3611`) le rembobine immédiatement plutôt que d'attendre `close()`. Sur `close()`, toute supposition restante se déroule en étendues littérales (`Markdown.ts:3574` `unwindOptimisticTail`), de sorte que les flux `literal` et `optimistic` se terminent de la même manière. Math (`$…$`) n'est pas deviné - son `InlineObject` (`markdown-inline.ts:301`) réserve `width/height/depth` via `exToPx` (`markdown-math.ts`), pas un style span.

## Virtualisation ou streaming : l'exclusion mutuelle n'est pas un choix politique

Les fenêtres `virtualize` (`Markdown.ts:760`) bloquent le niveau supérieur en tant qu'entités via `virtualTokens`/`virtualHeights` (`RowHeights`) et `reconcileVirtual` (`Markdown.ts:1340`), pilotées par le `setVisibleRange` de l'hôte (un `ScrollView` le fait automatiquement). Il **ne peut pas** être combiné avec le streaming (`Markdown.ts:1385`, `Markdown.ts:2187` les deux lancent) : l'entité pour un bloc hors écran n'existe pas, donc la réutilisation du préfixe `tokenChildPrefix` + `matchLen` de `updateTokens` adresserait un emplacement enfant qui n'est pas monté.

`tableViewportHeight` (`Markdown.ts:771`) est la trappe de secours - il virtualise les **lignes à l'intérieur de chaque table** via l'épinglage `Table.appendRows` + `reconcileVirtualRows` (`Table.ts:334`) et `bodyClip`, et il _fonctionne_ pendant la diffusion car `updateStreamedTable` ajoute des lignes via le même `appendRows` qui se monte déjà paresseusement. Choisissez `virtualize` pour un énorme document statique ; choisissez `tableViewportHeight` pour un document diffusé en streaming dominé par de larges tableaux.

### Pièges de forme de paragraphe - pourquoi `producesEntity` n'est pas seulement une optimisation

`producesEntity` décider de `text → image` via `paragraphHasImage` (`Markdown.ts:3807` guard) est une question d'exactitude, pas de vitesse : sans cela, un paragraphe qui gagne sa première image conserve son `RichText` et l'image est supprimée silencieusement (`collectSpans` n'émet rien pour un jeton `image`). L'analogue de l'élément de liste est `itemIsInlineOnly` (`Markdown.ts:2759`) — lancer `checkbox` hors de `INLINE_ITEM_TOKENS` (`Markdown.ts:2738`) force chaque élément de tâche à parcourir le chemin du bloc et interrompt le rendu de la liste de tâches ; la liste autorisée est ce qui empêche un futur type de bloc d'être aplati en un `RichText`.

## Nombres mesurés – citation avec la ligne de base

Seuls les numéros `benchmarks/run-browsers.sh` (véritable Chrome/Firefox, vrai GPU, `calibrateRefreshRate()`, espace de travail Hyprland dédié par compétence `hyprland-browser-bench`) peuvent être cités. Les `script/benchmark.ts` et `benchmarks/debug-page.ts` sans tête sont des fils de déclenchement/débogage.

### Réconcilier la victoire - transcription globale (`markdown-transcript-aggregate-2026-07-30`, CTX-0148, PR #296, commit `0e4a4233`)

Charge de travail : `6` tours, `176` blocs, `27,882` caractères, `6,543` morceaux, **`token` granularité** — la granularité domine : `151` vs `14` morceaux pour le même document à `token` vs `48`-char, `7×` différence de réutilisation (`markdown-transcript-aggregate-2026-07-30.md:111`). Deux courses par bras ; seul `lastTokenSameType` a été inversé.

|                      | pas de réutilisation | aujourd'hui | delta      |
| -------------------- | -------------------- | ----------- | ---------- |
| réconcilier, Chrome  | 1635,2 ms            | 319,5 ms    | **−80.5%** |
| réconcilier, Firefox | 992,2 ms             | 245,0 ms    | **−75.3%** |
| rendu, Chrome        | 3626,8 ms            | 3393,7 ms   | −6.4%      |
| analyser, Chrome     | 1978,3 ms            | 1826,2 ms   | −7.7%      |
| total, Chrome        | 7240,4 ms            | 5539,4 ms   | **−23.5%** |
| total, Firefox       | 6334,1 ms            | 5404,3 ms   | **−14.7%** |

**Partages de phases tels qu'expédiés** (total expédié `5539 ms` Chrome / `5404 ms` Firefox, `0.86 / 0.82 ms` par morceau) : rendre `61.3 / 61.4%`, analyser `32.9 / 34.1%`, **réconcilier `5.8 / 4.6%`** — la réconciliation est désormais la **plus petite** phase ; La marge de réutilisation restante par type est limitée par ce plafond.

### Réexécution du taux de panel (2026-08-08, `2a4bd52`, Firefox maintenant au panel Hz)

| moteur  | Hz              | analyser    | réconcilier | rendre      | total       |
| ------- | --------------- | ----------- | ----------- | ----------- | ----------- |
| Chrome  | 240.09 / 239.95 | 2826 / 2830 | 459 / 456   | 3386 / 3388 | 6670 / 6674 |
| Firefox | 229.01 / 241.26 | 3190 / 3282 | 311 / 315   | 3581 / 3691 | 7082 / 7288 |

Rendu par morceau `0.517 / 0.556 ms` = `12.4 / 13.3%` d'une image `4.16 ms` ; total par morceau `1.02 / 1.10 ms` = `24.5 / 26.4%`. La figure `≈60 Hz` de Firefox dans l'exécution originale (`58.75 Hz`) n'était **pas** un artefact de fenêtre non focalisé - c'était `layout.frame_rate = -1` (`forge/findings/devtools-and-telemetry.md:2026-08-03`).

**Une véritable régression est apparue :** l'analyse a augmenté `1.67×` sur les deux moteurs. Lexing du même corpus de fragments `6543` par rapport à `marked` nu par rapport à l'instance partagée à 12 extensions : `1871 → 3127 ms` (`1.671×`). Le coût est par morceau et par extension `start()`/`tokenizer`. À `faeeb0b7`, l'instance portait les extensions `2` ; sur `2a4bd52`, il porte `12` — le **prix non mesuré du cluster PX-0524**. Le partage d'analyse a été déplacé `33% → 42–45%`. Le chiffre `incrementalLex` est _après_ que le lex était déjà fenêtré - sans ce serait pire.

### Gain lex incrémental — appareil de prose (`comparisons/stream-markdown-smd`, Chrome 150 / Firefox 153, 784 morceaux)

Avant : relex complet par morceau, `419.6 / 440.2 ms`, exposant `1.98`, caractères remis au lexer `9,847,040`. Après : `6.02 / 9.06 ms`, **`69.8× / 48.6×`**, exposant `0.94 / 1.21`, caractères `63,806`, exposant `1.00` (`forge/findings/text-richtext-and-markdown.md:2026-08-03`).

### Streaming mathématique après le rétrécissement du plafond (`markdown-stream-math`, vectojs#398)

Couverture `blockMath` dégrader → majuscule uniquement : **`139.3× Chrome / 96.5× Firefox`** sur un document mathématique `26,760`-char, `200`-section ; caractères à lexer réduction `215.9×` ; la limite s'installe à `99.84%` du document ; maximum de caractères lex `105` en un seul morceau à chaque taille (`forge/baselines/markdown-stream-math-findings.md`).

## Ajouter une nouvelle extension de démarque sans régresser le streaming

Une extension est composée de deux enregistrements (`Markdown.ts:240` et `MarkdownWorker.ts:95` — même appel `marked.use`, **des deux côtés**, même tokenizer — la dérive brise la vue du travailleur sur `marked`). Quatre contrôles, dans l'ordre :

### 1. Classer la portée de l'extension

- **Pas de `start()` et délimité par une ligne vide** → sûr ; pas de changement de limite. Exemple : les règles en ligne (`abbr` `markdown-abbr.ts`, `emoji` `markdown-emoji.ts`, `footnote` réf `markdown-footnote.ts` moitié) n'ont pas besoin d'être dégradées.
- **Fournit `start()`** → portée vers l'arrière ; `paragraphPairCap` le couvre déjà, mais **vérifiez** — tout nouveau `start()` est couvert car le clip est marqué, pas celui de `blockMath` (`incrementalLex.ts:103`).
- **S'étend sur une ligne vierge** → portée illimitée vers l'avant ; Modèle `hasContainerOpener` / `hasFootnoteDefOpener` (`markdown-container.ts: hasContainerOpener`, `markdown-footnote.ts: hasFootnoteDefOpener`). **Dégrader** via `DegradeReason` (`incrementalLex.ts:225`) — un plafond coupé ne peut pas le délimiter.
- **Collecte les définitions tardives** (modèle `marked` `def`, `abbrDef` est le cas restreint qui a forcé `abbreviationsChanged` à mettre à zéro `matchLen` à `Markdown.ts:3711`) → force la reconstruction ou la dégradation ; documenter pourquoi.

En cas de doute, **dégrader** — c'est toujours correct et ne coûte que les documents en streaming qui contiennent réellement l'ouvreur.

### 2. Inscrivez-vous en même temps et vérifiez le gardien

- Des copies identiques du tokenizer `blockMath` dans `Markdown.ts:294` et `MarkdownWorker.ts:122` ont déjà dérivé une fois (`[\s\S]+?` vs garde de ligne vierge), et le travailleur est généré via `scripts/build-worker.js` → `MarkdownWorkerSource.ts`. Extrayez un module partagé s'il dérive une troisième fois (`markdown-stream-math-findings.md: Also fixed`).
- Pour un tokenizer à ligne vierge, la garde doit être `(?!\n[ \t]*\n)` (lignes d'espaces uniquement incluses), et non `(?!\n\n)` (`incrementalLex.ts:67`, #398).

### 3. Enseigner à chaque site conscient des entités

Pour le type de jeton, votre extension ajoute :

- `renderToken` — construction (`Markdown.ts:4150`).
- `producesEntity` (`Markdown.ts:4044`) — `true` s'il restitue une entité ; `false` exactement pour les jetons qui restituent `null` (sinon `tokenChildPrefix` dérive).
- `reflowToken` (`Markdown.ts:1520`) — chemin de changement de largeur ; le bras manquant laisse le bloc à son ancienne largeur.
- Branche sur place `updateTokens` (`Markdown.ts:3760`) — activez-la uniquement si une forme en queue de croissance a un mutateur (`setSpans`/`setCode`/`appendRows`) ; les types de conteneurs (`blockquote`, `list`, `table`) subissent une descente par queue et non une mutation directe.
- Si le bloc peut être enveloppé de manière abordable, déballez : `instanceof BlockWithAffordances ? .block : entity` - et appelez `refreshAffordances()` après avoir muté la taille interne (modèle `Markdown.ts:3209`, `Markdown.ts:3781`).
- Si des images/mathématiques en ligne peuvent apparaître à l'intérieur du nouveau bloc, couvrez l'abonnement `containsImage`/`containsInlineMath` (`Markdown.ts:4166`) et la resynchronisation du wrapper `reflowAfterImageResize`.

### 4. Ajoutez le sabotage, pas seulement l'instantané

- `incrementalLex.test.ts` char-at-a-time fuzz : diffusez le corpus contenant la nouvelle construction un caractère à la fois, en profondeur `toEqual` contre `marked.lexer()` à chaque préfixe. Gardez le balayage par force brute sur `14 docs × every prefix × every cut` qui justifiait `findStableCut` ; exécutez-le avec et sans l'extension pour prouver que `nFollow >= 1` est toujours valable.
- **Sabotage de réconciliation en streaming** : diffusez un document contenant la construction à **granularité de jeton** via `appendMarkdown` (et non `setContent`), affirmez que `inPlaceUpdates`/`entitiesRebuilt`/`charsLexed` se déplace dans la direction attendue et affirmez une égalité profonde entre l'arbre de jetons et les pixels par rapport à `setContent` — un sabotage qui conduit `setContent` ne peut pas échouer dans le chemin de réutilisation.
- Réexécutez les portes de parité `comparisons/stream-markdown-smd` à **l'égalité profonde des arbres** en dehors de la boucle chronométrée et des portes de seuil sur les deux moteurs - selon `forge/findings/text-richtext-and-markdown.md:2026-08-03`, seule l'égalité des arbres détecte un nombre rapide pour une analyse interrompue.

### Chronologie – un morceau à travers les deux régions

```text
chunk " world": "Hello **bo" → "Hello **world**"
  before: stable="Hello "  tail="**bo"        (paragraph, trailing plain run)
   lex:   tail re-lex → [text("Hello "), strong("world")]  charsLexed = tail.length
   diff:  matchLen=0 (paragraph raw changed), tail = [paragraph(strong)]
   reconcile: heading/paragraph didn't match → destroy old RichText, add new one
  after:  stable="Hello **world**\n\n"  tail=""  (blank line committed, entitiesReused++)
```

La validation se produit lorsqu'une ligne vide arrive et que `findStableCut` peut avancer. Jusque-là, chaque morceau revisite la même queue – délimitée et n'augmentant pas avec la longueur du document.

## Débogage du streaming : que vérifier en premier

1. **`sourceCharsLexed` suit la longueur du document** → dégradé (`DegradeReason` à `incrementalLex.ts:225`) ; recherchez `:::`/`[^`/`def`/`\r` dans le document ou une analyse de queue uniquement manquante (`incrementalLex.ts:490`).
2. **`inPlaceUpdates` à plat tandis que `entitiesRebuilt` grimpe** → échec sur place ; grep `instanceof RichText`/`CodeBlock`/`Table` sans déballer `BlockWithAffordances` - bug de wrapper classique (`code-review-2026-08.md:167`).
3. **L'instantané réussit, le streaming échoue** → Le chemin `setContent` (`Markdown.ts:1740`) n'exerce jamais `updateTokens` ; écrivez le sabotage char à la fois.
4. **Dernier morceau manquant après `close()`** → `waitForAppendSettled` non attendu ; vérifiez le déclenchement `appendInFlight`/`mathLoadPending`/`fencedRebuildPending` à `Markdown.ts:2429`.
5. **La sélection saute lors de l'ajout** → préfixe non réutilisé ; vérifiez la plage valide `tokenChildPrefix` (`Markdown.ts:1041` `validFrom`) et la validation `matchLen` (`Markdown.ts:3689`).
6. **Redistribution des blocs hors écran après le décodage de l'image** → Chemin du wrapper `reflowAfterImageResize` (`Markdown.ts:2604`) obsolète ; vérifiez `resyncWrapperBox` couvre le type de wrapper.

## Invariants - la liste de contrôle avant PR

1. **Identité lex profonde.** `incrementalLex(charByChar(S))` est profondément égal à `marked.lexer(S)` à chaque préfixe, y compris les lignes vides contenant uniquement des espaces et les marqueurs de liste nus.
2. **Transférer l'identité.** Les bruts du préfixe `matchLen` sont égaux et `[...oldTokens.slice(0,matchLen), ...tail]` est égal au lex complet — validé à `Markdown.ts:3689` et dans le travailleur à `MarkdownWorker.ts:308`.
3. **Accord d'indice Entity.** `producesEntity ↔ renderToken null ↔ reflowToken arms ↔ tokenChildPrefix` à quatre voies ; testé avec `BlockWithAffordances` **on**.
4. **Mutation de queue uniquement.** Aucun chemin sur place ne touche un enfant de préfixe ; chaque retour anticipé laisse l'entité intacte, donc une réutilisation refusée n'est pas une demi-mise à jour.
5. **Quota linéaire dans le coût de streaming.** Le quota par fragment (s'il est appliqué) est linéaire dans le coût `append` (fenêtre `charsLexed`), et seule l'entrée fluide est limitée - les envois mis en mémoire tampon valident l'intégralité (la stimulation `StreamController.ts` est en affichage uniquement ; l'exactitude ne supprime jamais les caractères).
6. **Titre stable en profondeur.** `heading` réutilise sur place uniquement lorsque `oldDepth === newDepth` (`Markdown.ts:3875`) ; sinon, `font` serait obsolète (`RichText` constructeur uniquement).

## Références

- `vectojs-docs/content/learn/streaming.md` — API de streaming orientée utilisateur et cycle de vie `createStream`.
- `vectojs-docs/content/learn/text-typography.md` — pourquoi les mathématiques/images en ligne et `RichText`/`LayoutEngine` interagissent avec le streaming.
- `vectojs-docs/forge/findings/text-richtext-and-markdown.md` — notes de terrain pour chaque bug de streaming dont la mesure a gagné une ligne ci-dessus.
- `vectojs-docs/forge/baselines/markdown-transcript-aggregate-2026-07-30.md` et `markdown-stream-math-findings.md` — les deux lignes de base citables et leurs moteurs/engagements.
- `vectojs-docs/forge/code-review-2026-08.md:167,170` — le cluster `BlockWithAffordances` `instanceof` + `refreshAffordances` (`#789`/`#795`, `#701`).
- `packages/markdown/test/incrementalLex.test.ts` et `markdownWorkerProtocol.test.ts` — les contrats d'équivalence de streaming et de protocole que toute nouvelle extension doit garder verts.

---

_Suivant : 05 Zero-DOM TeX — le noyau de composition, les émissions `InlineObject` et `SVGEntity` par rapport auxquelles les mathématiques et les tableaux en streaming se mesurent._
