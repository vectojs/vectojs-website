+++
title = "12 — DevTools — Introspection runtime et audits"
description = "Pourquoi un canvas n'a pas de panneau Éléments, comment l'inspecteur VMT le remplace dans l'espace d'état, et la couche modèle headless — picking, lectures géométriques, audits, snapshots, explication de hit, attribution dirty-frame et protocole bridge/plugin."
weight = 32
+++

# 12 — DevTools — Introspection runtime et audits

> Un `<canvas>` n'a pas de panneau Éléments. Le navigateur peut vous montrer des pixels et des miroirs DOM, mais pas le Virtual Math Tree qui a décidé quels pixels peindre et quels miroirs conserver. DevTools est ce panneau — un inspecteur d'espace d'état pour que débugger une scène VectoJS reste dans les nombres, pas dans les captures d'écran.

- **Ce que vous apprendrez** : pourquoi VectoJS a besoin de son propre inspecteur, comment le panneau reste à l'écart de la scène inspectée, et chaque fonction pure de la couche modèle headless — modèle d'arbre, picking, lectures d'entité/a11y/texte, sept couches géométriques, audits layout/a11y/texte/sélection/GPU/accélérateur, snapshots/diffs, explication de hit, trace d'événements, diagnostic dirty-frame et le bridge JSON-RPC avec son protocole plugin.
- **Ce que vous n'apprendrez pas** : comment `Scene` planifie les frames (boss 06), comment un renderer les peint (boss 07), ou comment WASM les accélère (boss 08). Ce doc est l'outillage qui _lit_ ces sous-systèmes sans les muter.

## 1. Pourquoi les nombres avant les captures d'écran

Une capture d'écran répond « quelque chose est cassé ». Un nombre répond _quelle entité_ est cassée, _de combien de pixels_, et _pourquoi le moteur pensait qu'il avait raison_. Tout le paquet DevTools (`packages/devtools/src/`) est organisé autour de cette échelle :

1. **Localiser** — quelle entité possède un pixel (`pickInScene`) et où elle se situe dans l'arbre (`buildTreeModel`, `entityPath`).
2. **Mesurer** — sa géométrie, sa transform et ses bornes monde en unités monde (`inspectEntity`) et chaque boîte qu'elle porte qui peut diverger (`highlightGeometry`).
3. **Expliquer** — pourquoi le moteur a choisi cette entité et pas celle attendue (`explainHitTest`), et où l'événement navigateur est réellement arrivé (`createEventTrace`).
4. **Auditer** — si une entité viole un invariant structurel tout en paraissant correcte à l'œil (`auditScene`, `auditA11y`, `auditTextShaping`).
5. **Différencier** — ce qui a changé entre deux états, adressé par chemins stables plutôt que par ids aléatoires (`captureSnapshot` / `diffSnapshots`).
6. **Attribuer** — pourquoi une scène `onDemand` ne s'endort jamais et ce que la boucle de rendu coûte réellement (`diagnoseDirty`, `Scene.frameStats` à `packages/core/src/tree/Scene.ts:3515`).

Chaque échelon retourne des données pures, pas des pixels. Cela fait de chaque vérification une gate CI : `expect(auditScene(scene)).toEqual([])` (`vectojs-docs/content/reference/devtools-audit.md:12`).

## 2. Deux surfaces, une couche modèle

| Surface                                     | Entrée                                                                           | Rend                                                                                                                | Besoin de `destroy()`                                                                                                  | Livré en production                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Panneau** (`@vectojs/devtools`)           | `attachDevtools(scene)` → `DevtoolsPanel` à `packages/devtools/src/panel.ts:140` | Sa propre `Scene` ancrée au bord du viewport, `contentProjection: false`, `renderMode: 'onDemand'` (`panel.ts:299`) | Oui — `destroy()` démonte timers, listeners, highlight, scène du panneau et container (`panel.ts:1272`)                | Jamais — garde `if (import.meta.env.DEV)` (`vectojs-docs/content/reference/devtools.md:51`) |
| **Headless** (`@vectojs/devtools/headless`) | Fonctions pures réexportées depuis `packages/devtools/src/headless.ts:1`         | Rien                                                                                                                | Seul `EventTrace` attache des listeners document (`packages/devtools/src/eventTrace.ts:85`) et doit être `destroy()`'d | Oui — pas de panneau, pas de dépendance `@vectojs/ui`, utilisable en Vitest/Node/agents     |

Le panneau _appelle_ la couche headless ; il ne la duplique pas. La couche headless porte ~60 fonctions pures exportées — la moitié la plus grande et la plus utile (`vectojs-docs/content/reference/devtools.md:18`).

```ts
import { attachDevtools } from '@vectojs/devtools';
import { auditScene, captureSnapshot, explainHitTest } from '@vectojs/devtools/headless';

if (import.meta.env.DEV) {
  const devtools = attachDevtools(scene, { traceEvents: true });
  // devtools.detach() === devtools.destroy()
}
```

`DevtoolsOptions` à `packages/devtools/src/panel.ts:42` — `width` défaut 360, `refreshInterval` défaut 500, `dockSide` `right|left`, `showPerf` défaut true, `traceEvents`/`traceCapacity`, `defaultTab`. Le sous-chemin headless existe pour qu'un bundle de test en production puisse tirer la couche modèle sans le panneau ni `@vectojs/ui` (`vectojs-docs/content/reference/devtools.md:58`).

## 2a. Ce que le panneau montre — et ce qu'il ne montre délibérément pas

L'en-tête du dock à `packages/devtools/src/panel.ts:306` porte trois boutons fantômes — **⌖** pick (`panel.ts:340`), **⟳** refresh (`panel.ts:341`), **⚠** audit (`panel.ts:342`) — et trois `Pill` de compteurs (`panel.ts:104`) : total d'entités, interactives **⚡** et findings d'audit **⚠** (`panel.ts:345`). Une barre `Tabs` à `panel.ts:537` sépare les outils en **Tree · Info · Audit · A11y · Log · ⚙**, plus un onglet par `PluginInspector` enregistré (`panel.ts:530`, `panel.ts:1027`).

- **Tree** — `TreeView` à `panel.ts:383` avec un `Input` de filtre à `panel.ts:371`. `setFilter(text)` à `panel.ts:761` élague via `applyFilterToTree` (`panel.ts:767`) qui shallow-copie `{...node}` pour que les originaux gardent leurs listes complètes d'enfants ; les labels filtrés sont toujours réécrits sur le fast path stable en version. Les lignes affichent `type (x,y) W×H ⚡ ▶`.
- **Info** — `INSPECT_ROWS = 20` lignes `Text` (`panel.ts:71`) montrant six lignes génériques issues de `describeEntity` plus la sortie descripteur, éditeurs inline `x/y/opacity` (`panel.ts:418`), et boutons **Copy path / Copy JSON** (`panel.ts:442`) adossés à `entityPath` (`inspect.ts:82`) et au JSON `inspectEntity`. Les flèches nudgent de 1 px (Shift : 10 px) et `+/-` incrémente l'opacité de 0.1 (`panel.ts:228`) — confirmation de quelle entité possède un bug de layout avant de toucher au code.
- **Audit** — `TreeView` à `panel.ts:469` listant une ligne par finding (`panel.ts:844`), `selectFinding(i)` à `panel.ts:860` résolvant via `auditRows` fusionnés (scene + plugin à `panel.ts:840`) pas seulement `findings[i]`.
- **A11y** — `A11Y_ROWS = 22` lignes (`panel.ts:73`) issues de `writeA11y` à `panel.ts:1173` : lecture `inspectA11y` (`a11yInspect.ts:227`) plus findings `auditA11y` en cache avec `▸` sur l'entité sélectionnée.
- **Log** — entrées `EventTrace` bornées (`panel.ts:511`) quand `traceEvents: true` (`panel.ts:47`), `traceCapacity` défaut 50 (`panel.ts:49`). Mis à jour via `eventTrace.subscribe` → `writeTrace` (`panel.ts:521`) → `panelScene.markDirty()`.
- **Settings (⚙)** — `buildSettings` à `panel.ts:654` : `Toggle` pour highlight, `Dropdown`s pour `refreshInterval` et `dockSide`. `setRefreshInterval` à `panel.ts:1070` gate les deux timers ; `setDockSide` à `panel.ts:1088` swap les styles via `applyDockSideStyle` (`panel.ts:635`).
- **Bandeau Perf** — `Card` épinglée en bas (`panel.ts:557`) reflowée par `layout()` (`panel.ts:608`), lisant `Scene.frameStats` toutes les 250 ms (`panel.ts:571`).
- **Highlight de sélection** — `HighlightEntity` sur l'overlay hôte (`panel.ts:874`), défaut `['aabb']` (`panel.ts:172`), commutable via `setHighlightLayers` (`panel.ts:926`).

Le container du dock et le canvas sont en `pointer-events: none` (`panel.ts:288`), comme `Scene.a11yRoot` — ainsi les pixels vides du dock ne volent jamais l'input hôte.

## 3. Modèle d'arbre et picking — le même parcours que le moteur utilise

### 3.1 Le modèle d'arbre

`buildTreeModel(root)` à `packages/devtools/src/model.ts:31` retourne `{ nodes, index }` :

- `nodes` — une entrée par enfant direct de `root`, chacune avec son propre sous-arbre. Une feuille a `children: undefined`, pas `[]` (`model.ts:40`).
- `index: Map<string, Entity>` — chaque descendant à toute profondeur, clé par `entity.id`, afin qu'un id sélectionné puisse revenir à l'entité live.
- `label` — `` `${type} (${x},${y}) ${W}×${H} ⚡ ▶` `` fabriqué par `geometryLabel` (`model.ts:16`), avec badges seulement quand `interactive` / `hasPendingAnimations()`.

`refreshTreeLabels(nodes, index)` à `model.ts:56` réécrit ces badges géométriques in place — pas de churn de nœuds ni d'index — retournant `true` quand au moins un label a changé pour que le panneau puisse éviter du travail de redraw. Le reconcile forcé toutes les `RECONCILE_INTERVAL_MS = 3000` (`panel.ts:80`) borne la staleness quand quelque chose a muté `children` sans bump `structureVersion` (`panel.ts:581`, `vectojs-docs/forge/findings/devtools-and-telemetry.md:356`).

### 3.2 Picking

`findEntityAt(root, x, y)` à `model.ts:82` et `pickInScene(scene, x, y)` à `model.ts:214` sont délibérément **le même parcours et le même prédicat d'acceptation** que `HitTester.findHitRecursively` (`packages/core/src/tree/scene/HitTester.ts:227`), vérifié après `vectojs#483` :

- `opacity <= 0` early-return élague le sous-arbre (`model.ts:86`).
- `insideClipAncestors` (`model.ts:115`) vérifie la boîte monde de chaque ancêtre `clipChildren` via `worldToLocal` — ainsi le contenu scrollé hors vue n'est pas pickable.
- `isPointerTransparent` (`model.ts:105`) reflète `HitTester.isPointerTransparent` — `disabled === true` ou `pointerEvents: 'none'` exclut du hit mais les enfants sont toujours parcourus.
- Seul `isPointInside(x,y)` décide (`model.ts:95`) — pas de fallback AABB monde, donc particules et formes décoratives ne sont jamais fausses propriétaires (`model.ts:77`, corrigé `vectojs#483`, `forge 2026-08-13`).

`pickInScene` vérifie d'abord l'arbre overlay, puis l'arbre principal (`model.ts:215`), afin qu'une modale ouverte l'emporte sur le contenu derrière — la surprise la plus courante « mon clic n'est allé nulle part ». `findEntityAt` teste aussi la racine passée, donc lui donner `scene.rootEntity` peut retourner cette racine ; `pickInScene` est le défaut plus sûr (`vectojs-docs/content/reference/devtools-inspect.md:46`).

## 4. Lecture de sélection — géométrie, descripteurs et propriétés possédées

### 4.1 Deux lectures pour une entité

- `describeEntity(entity)` à `model.ts:153` — `string[]` pour le panneau : six lignes fixes (type/id, `x/y/w/h` avec `*` sur props possédées par le layout, scale/rotation/opacity, `world [a b c d e f]`, interactive/animating, nombre d'enfants), plus une ligne `* prop set by Parent — edits revert` quand `layoutControlledProperties` est non vide (`model.ts:172`), puis le propre `getDevtoolsDescriptor()` de l'entité plafonné à `DESCRIPTOR_LINE_BUDGET = 12` lignes (`model.ts:151`). Valeurs de champs tronquées à 32 chars, notes à 60 (`model.ts:143`). Un descripteur qui lève contribue `— descriptor threw —` plutôt que d'aborter le panneau (`model.ts:184`).

- `inspectEntity(entity)` à `packages/devtools/src/inspect.ts:99` — `EntityInfo` (`inspect.ts:4`) pour les machines : chaque nombre arrondi à 2 décimales (`inspect.ts:48`), `worldTransform`, `worldBounds`, `interactive/animating/clipChildren/childCount`, optionnel `text` (via `textPreviewOf` à `inspect.ts:70`, `TEXT_PREVIEW_MAX = 80`), optionnel `a11y { tag, role, label }`, optionnel `descriptor`, optionnel `layoutControlled` (`inspect.ts:42`). Tous deux gèrent un `getDevtoolsDescriptor()` qui lève sans crasher l'outil — un outil de debug qui casse sur l'entité que vous débuggez est pire qu'un champ manquant (`inspect.ts:136`).

`entityPath(entity)` à `inspect.ts:82` rend `Scene > Card#a1b2 > Text#c3d4` avec ids tronqués à 8 chars ; le sommet de l'arbre (sans parent) est affiché `Scene` — ainsi une entité détachée est indistinguable de la vraie racine, ce qu'il vaut de vérifier quand un chemin paraît suspectement court.

### 4.2 Propriétés possédées par le layout

`layoutControlledProperties(entity)` à `inspect.ts:157` interroge le **parent** `getLayoutControlledProperties(child)` — seul un container sait quelles props il écrase (`ScrollView` distingue son wrapper interne des enfants ajoutés par l'appelant). Le panneau marque ces props avec `*` inline (`model.ts:161`) et, quand l'utilisateur en édite une, explique immédiatement que la valeur revient au prochain layout (`panel.ts:1108`, `panel.ts:1153`) au lieu de refuser silencieusement l'édition. Éditer un enfant de Stack pour voir ce qui bouge est légitime ; cacher pourquoi il a sauté ne l'est pas.

## 5. Géométrie de highlight — sept boîtes, une classe de bug

`highlightGeometry(scene, entity, opts?)` à `packages/devtools/src/highlightGeometry.ts:1` retourne jusqu'à sept valeurs `HighlightLayer`, toujours dans un ordre fixe quel que soit l'ordre de requête :

| Kind      | Signification                                           | Source                                                    |
| --------- | ------------------------------------------------------- | --------------------------------------------------------- |
| `aabb`    | Boîte axis-aligned du quad layout transformé            | `getWorldBounds()`                                        |
| `layout`  | Vrai quad avec rotation/skew                            | world transform × `[0,0,w,h]`                             |
| `render`  | `getBounds()` — où l'entité peint réellement            | `entity.getBounds()`                                      |
| `clip`    | Boîte du plus proche ancêtre `clipChildren`             | parcours d'ancêtres                                       |
| `content` | Boîte du miroir DOM de contenu sélectionnable           | `rectToSceneBox` via `getContentElement`                  |
| `a11y`    | Boîte de l'élément de projection a11y                   | `getA11yElement` à `packages/core/src/tree/Scene.ts:6446` |
| `hit`     | Région de hit réelle échantillonnée par `isPointInside` | `sampleHitRegion`                                         |

`divergesFromLayout` sur toute couche signifie que cette boîte diverge du quad layout de plus de 1 px — la condition qui fait qu'un clic atterrit là où l'utilisateur ne visait pas (`vectojs-docs/content/reference/devtools-inspect.md:222`). `highlightGeometry` ne lève jamais ; une couche indisponible retourne `{ kind, polygons: [], unavailable: reason }`.

`hit` n'est pas dans le set par défaut — il échantillonne `isPointInside` sur une grille (`hitSampleStep` défaut 8, `hitSampleBudget` défaut 4096, `packages/devtools/src/highlightGeometry.ts:1`) et coûte `O((w/step)·(h/step))` sondes, donc diviser `step` par deux quadruple le coût. La divergence pour `hit` est par **couverture de surface**, pas par étendue, donc un cercle dans un carré est détecté (`vectojs-docs/content/reference/devtools-inspect.md:225`). Le `HighlightEntity` du panneau à `panel.ts:1337` dessine ces couches sur l'overlay de la scène hôte via `showOverlay()` (`panel.ts:876`), colorées par `LAYER_COLORS` (`panel.ts:1325`), avec `aabb` gardant `ACCENT` d'origine pour que les captures existantes restent lisibles.

## 6. Audits — findings structurés, triés, déterministes

Chaque audit retourne `Finding[]` triés déterministiquement pour que les snapshots soient stables.

### 6.1 Audit de layout

`auditScene(scene, opts?)` à `packages/devtools/src/audit.ts:321` délègue à `auditTree(root, sceneBounds, opts)` à `audit.ts:130`. Quatre valeurs `AuditKind` (`audit.ts:7`) :

- `text-overflow` — la boîte de texte mesurée s'échappe de son plus proche ancêtre dimensionné non-texte.
- `clip-overflow` — le contenu s'échappe d'un ancêtre `clipChildren` (exempt vertical dans `ScrollView`/`VirtualList`/`TreeView`/`Table` via `DEFAULT_SCROLLABLE` à `audit.ts:51`).
- `overlap` — **siblings seulement**, via parcours broad-phase `SpatialHashGrid` (`audit.ts:190`) au lieu de l'ancienne double boucle O(k²) — chaque boîte calculée une fois, seuls les voisins de cellule comparés. Requiert une intersection dépassant `tolerance` sur les deux axes (`audit.ts:231`).
- `viewport-overflow` — aucun ancêtre dimensionné du tout, et l'entité s'échappe de `sceneBounds`.

Options : `tolerance` (défaut 0.5), `includeOverlay` (défaut false — modales/highlights sont intentionnellement hors flux), `scrollableTypes` (match par `constructor.name`), `ignore` (élague des sous-arbres), `ignoreOverlap` (autorise l'empilement intentionnel). `opacity: 0` élague des sous-arbres entiers ; findings triés par `kind → entityPath → otherPath` (`audit.ts:305`). Avec `includeOverlay: true` le résultat est deux runs triés concaténés — retriez si un ordre global unique est nécessaire (`vectojs-docs/content/reference/devtools-audit.md:85`).

`worldBox` à `audit.ts:70` utilise la boîte déclarée `[0,0,w,h]` via `getWorldTransform()`, pas `getWorldBounds()` — pour la contenance la boîte déclarée est le contrat ; les étendues de rendu appartiennent à `clip-overflow`.

### 6.2 Audit a11y

`auditA11y(scene, opts?)` à `packages/devtools/src/a11yInspect.ts:299` émet cinq valeurs `A11yAuditKind` (`a11yInspect.ts:23`) :

`no-accessible-name`, `role-tag-conflict`, `disabled-divergence` (avec bande morte à opacité 0.6–0.9), `focusable-but-clipped`, `duplicate-label` (rapporté sur le second et suivants, `otherId` pointe vers le premier). Contrairement à l'audit layout il **inclut l'overlay par défaut** — une modale est là où vivent les pièges de focus — et `a11yHidden` élague tout le sous-arbre. Résultats en ordre de parcours, avec `duplicate-label` ajouté en dernier (`vectojs-docs/content/reference/devtools-audit.md:137`).

### 6.3 Audit de façonnage texte

`auditTextShaping(scene)` à `packages/devtools/src/textInspect.ts:447` parcourt uniquement `scene.rootEntity` et émet un seul kind, `atlas-miss` — glyphes absents de l'atlas de fontes, échantillonnés à cinq manques distincts par finding. Seul le chemin **prepared-text** peut l'émettre ; une entité content-grid ne le pourra jamais (`vectojs-docs/content/reference/devtools-audit.md:157`).

### 6.4 Audit de sélection

`auditSceneSelection` / `auditEntitySelection` à `packages/devtools/src/selectionAudit.ts:1` comparent la géométrie locale de ligne de l'entité à des `Range` DOM live, normalisés en pixels logiques locaux pour que DPR/zoom soient neutralisés. Trouve `selection-drift` par ligne fautive avec `expectedLeft/Right`, `actualLeft/Right`, `leftDrift/rightDrift`. Requiert un vrai navigateur — référence `document` non gardée (`vectojs-docs/content/reference/devtools-audit.md:202`) — et efface la sélection courante de l'utilisateur pendant l'exécution.

## 7. Snapshots et diffs — régression sans captures d'écran

`captureSnapshot(scene)` à `packages/devtools/src/snapshot.ts:133` capture un arbre déterministe JSON-safe : l'ordre des enfants est l'ordre de rendu, nombres arrondis à 2 décimales (`snapshot.ts:52`), props à valeur par défaut omises. `diffSnapshots(a, b)` à `snapshot.ts:302` retourne `SnapshotDiff[]` avec `path / kind('added'|'removed'|'changed') / changes`.

Cléage — pourquoi une ligne renommée n'est pas 200 lignes réécrites : `nodeKey(entity)` à `snapshot.ts:79` préfère `devtoolsKey` (`k:`) puis `label` a11y (`l:`, plafonné à `KEY_LABEL_MAX = 64` à `snapshot.ts:55`), jamais le texte dessiné (contenu, pas identité) et jamais l'id d'entité (aléatoire par run). `keyedPairs` à `snapshot.ts:196` utilise les clés seulement quand uniques des **deux** côtés d'un niveau ; en collision il retombe sur alignement par index. Les chemins utilisent `Row{k:row-42}` quand cléé, `Row[7]` sinon (`snapshot.ts:163`), donc le chemin lui-même survit à la réordonnance (`vectojs-docs/forge/findings/devtools-and-telemetry.md:317`, corrigé `vectojs#481/#510`).

Seules `COMPARED_KEYS` à `snapshot.ts:142` sont comparées (`type/x/y/width/height/worldBounds/opacity/interactive/animating/clipChildren/text`) ; `scene.width/height`, `id` et `key` ne produisent pas de diffs, et `added`/`removed` ne récurse pas.

## 8. Explication de hit et trace d'événements

### 8.1 Expliquer un hit test

`explainHitTest(scene, x, y)` à `packages/devtools/src/hitExplain.ts:139` parcourt le même ordre et applique les mêmes gates que `HitTester`, mais enregistre un `HitCandidate` par nœud au lieu de retourner au premier hit — chaque perdant avec son `HitVerdict` (`hitExplain.ts:20`) : `accepted / invisible / clipped / pointer-transparent / outside-shape / occluded`. `invisible` (`opacity <= 0`) élague le sous-arbre et nomme combien de descendants ont été sautés (`hitExplain.ts:154`). Overlay d'abord, puis main (`hitExplain.ts:267`) — la surprise la plus courante. `occluded` est assigné en post-passe : une entité autrement acceptée sous le gagnant est réécrite (`hitExplain.ts:278`), donc « combien de choses sous ce pixel » est comptable. `formatHitExplanation` à `hitExplain.ts:299` rend des lignes indentées avec glyphes `✓ / · / ✗` à `hitExplain.ts:306`.

Ceci est un diagnostic, pas un appel par frame — il parcourt l'arbre entier. Sur une scène à hit-grid WASM un ancêtre `clipChildren` de taille zéro peut s'expliquer comme `clipped` alors que le chemin WASM enregistre encore le hit : la seule divergence documentée (`vectojs-docs/content/reference/devtools-inspect.md:293`).

### 8.2 Trace de routage d'événements

`createEventTrace(scene, opts?)` à `packages/devtools/src/eventTrace.ts:275` observe les inputs navigateur sans ajouter de listeners VMT ni changer le dispatch. Sept valeurs `EventTraceType` (`eventTrace.ts:6`), quatre valeurs `EventTraceSource` (`eventTrace.ts:16` : `a11y / content / canvas / document`), `EventTraceOptions.capacity` défaut 50 (`eventTrace.ts:44`). Chaque `EventTraceEntry` (`eventTrace.ts:26`) enregistre target id/path, coordonnées scène+locales, modificateurs, `deltaX/Y` pour wheel, et `defaultPrevented` final.

`defaultPrevented` se finalise en **microtask** après le routage VMT projeté, donc il reflète la décision finale de shortcut/sélection de l'app (`eventTrace.ts:95` `onEventBubbled`). Un test doit attendre une macrotask avant d'asserter. `pointermove` est coalescé à un par ~60 Hz frame (`POINTERMOVE_COALESCE_MS = 16` à `eventTrace.ts:77`) pour éviter que O(n) picks ne fausse le HUD perf (`eventTrace.ts:69`, `vectojs#707`). Il attache 14 listeners document et est le seul objet headless qui **doit** être `destroy()`'d (`eventTrace.ts:171`) ; `entries` retourne le tableau interne live, pas une copie.

## 9. Lectures texte, GPU, accélérateur et markdown

`inspectText(entity)` à `packages/devtools/src/textInspect.ts:179` retourne `TextInspection` (`textInspect.ts:15`) ou `null` quand ni `.text` ni `.value` n'est présent. Sinon il porte les niveaux bidi résolus, `levelRuns` et segments de réversion, `visualOrder`, `clusters` de graphèmes re-segmentés via `Intl.Segmenter` (`textInspect.ts:148`), et détail par glyphe sur l'un de trois tiers (`textInspect.ts:157`) :

| Tier                       | `glyphs[].x`   | `metrics/lines` | `atlasMiss` |
| -------------------------- | -------------- | --------------- | ----------- |
| Grille de contenu préparée | oui            | oui             | jamais      |
| Texte préparé              | non            | non             | oui         |
| Ni l'un ni l'autre         | pas de glyphes | non             | non         |

`unavailable: string[]` (`textInspect.ts:74`) nomme chaque capacité qui n'a pu être rapportée et pourquoi — un champ manquant est toujours expliqué, pas silencieusement absent. `shapeProbe(text, opts?)` à `textInspect.ts:295` fait passer une chaîne arbitraire par le même pipeline sans entité ni scène, donc le façonnage peut être vérifié en test unitaire. `formatTextInspection` à `textInspect.ts:348` rend `PluginRow[]` pour onglets panneau/plugin.

`gpuInspector` / `inspectGpu(scene)` à `packages/devtools/src/gpuInspect.ts:1` et `acceleratorInspector` / `inspectAccelerators(scene)` à `packages/devtools/src/acceleratorInspect.ts:1` exposent la posture GPU et backend WASM. `inspectGpu` rapporte les compteurs draw (`enableDrawCountersCommand` / `resetDrawCountersCommand` à `gpuInspect.ts:1`), overdraw et équilibre `save/restore` ; `inspectAccelerators` rapporte par backend `AcceleratorReport { status, reason }` à `packages/core/src/tree/scene/WasmBackendFacade.ts:66` — si le noyau WASM hit/grid/anim a accepté ses arguments ou est retombé en JS et pourquoi. Les deux sont des lectures pures, donc une gate CI peut asserter `auditGpu(scene).length === 0` comme la gate layout.

`inspectMarkdownStream(entity)` à `packages/devtools/src/markdownInspect.ts:1` rapporte la réutilisation en streaming (`auditMarkdownStreaming` / `markdownStreamAudit`) — combien de tokens ont survécu à une réconciliation delta vs combien d'entités ont été reconstruites — et `selectionAudit` / `highlightGeometry` déjà couverts ci-dessus. Chaque lecture suit le même contrat : ne jamais lever, retourner `{ unavailable: reason }` quand l'entité manque de capacité, et arrondir les nombres à 2 décimales.

## 10. Attribution dirty-frame et télémétrie live des frames

### 10.1 `diagnoseDirty` — pourquoi `onDemand` ne s'endort jamais

`diagnoseDirty(scene, opts?)` à `packages/devtools/src/dirtyDiagnosis.ts:70` transforme `Scene.dirtyReasons` en verdict. `scene.setDirtyTracking(true)` (`packages/core/src/tree/Scene.ts:3474`) opt-in ; `scene.dirtyReasons: DirtyReasonEntry[]` (`Scene.ts:3489`, plus fréquent d'abord, FIFO plafonné à `MAX_DIRTY_REASONS = 200` dans `packages/core/src/tree/scene/DirtyTracker.ts:71`) contient `{ entity?, reason, property?, count, firstFrame, lastFrame }`. `diagnoseDirty` calcule `perFrame = count / frames` (`dirtyDiagnosis.ts:97`) et sépare `everyFrame: perFrame >= 0.9` (`dirtyDiagnosis.ts:105`) — ce sont ce qu'une scène `onDemand` doit cesser de faire pour réellement idler. `summary` nomme la pire cause quand `everyFrame` est non vide, note le cas moot quand `renderMode === 'always'` (`dirtyDiagnosis.ts:112`), et avertit quand le tracking n'a jamais été activé (`dirtyDiagnosis.ts:82`). Headless à dessein — utilisable depuis Vitest/Playwright/CI sans panneau ni dépendance `@vectojs/ui`.

### 10.2 `Scene.frameStats` — frames rendues, pas vsync

`Scene.frameStats: FrameStats` à `packages/core/src/tree/Scene.ts:3515` (`FrameStats` à `Scene.ts:518`) lit la télémétrie réelle de la boucle :

`fps` (cadence rendue lissée EMA, clampée à `maxFPS`, `0` avant la première paire), `frameTimeMs` (wall-clock du dernier `render()` seulement), `frameIntervalMs`, `dt`, `renderedFrames/skippedFrames` compteurs, `renderMode`, `dirty`. Le bandeau perf du panneau à `panel.ts:800` affiche `fps · ms/frame / entities · mode · rendered/skipped`, mis à jour toutes les 250 ms (`panel.ts:571`). Une scène `onDemand` idle lit honnêtement `0 fps` ; une scène `'always'` auto-throttlée lit son plancher `idleFPS` (60 par défaut) (`vectojs-docs/content/reference/devtools.md:72`). Le renderer repeint toujours le canvas entier, donc pas de dirty-rect — `dirty` est le flag booléen pending redraw (`vectojs-docs/forge/findings/devtools-and-telemetry.md:73`). La leçon de `forge 2026-07-18` : ne jamais échantillonner rAF indépendamment — seule `update()` d'une entité ou `frameStats` mesure les frames que Scene a réellement rendues.

Autres surfaces Scene que la couche headless lit : `structureVersion` (`Scene.ts:3462`, `Scene.ts:1636`) pour staleness de forme d'arbre, `getA11yTree()` (`Scene.ts:5412`) pour le snapshot a11y public, `getA11yElement(id)` (`Scene.ts:6446`) et `getContentElement(id)` pour comparaison boîte DOM-vs-canvas (`packages/devtools/src/a11yInspect.ts:143`), `getContentProjection()` par entité, et les lectures plugin ci-dessous.

## 10a. Points d'intégration Scene — où DevTools lit le moteur

La couche headless n'atteint jamais les privés de Scene ; elle lit la surface publique que `packages/core/src/tree/Scene.ts` publie pour tout consommateur, et que `packages/core/src/index.ts` réexporte comme API publique :

- `Scene.structureVersion: number` à `Scene.ts:3462` (adossé à `WasmBackendFacade.structureVersion` à `Scene.ts:1636`) — bumpé par `Entity.add/remove` (`packages/core/src/tree/Entity.ts:1086` / `:1123`). Chaque cache de forme d'arbre est valide tant que ceci est inchangé ; les changements de propriétés ne le bumpent délibérément pas, d'où l'existence de `refreshTreeLabels`.
- `Scene.frameStats: FrameStats` à `Scene.ts:3515` / `FrameStats` à `Scene.ts:518` — la seule source FPS honnête, plus `frameTimeMs`, `frameIntervalMs`, `dt`, `renderedFrames/skippedFrames`, `renderMode`, `dirty`. Mis à jour dans `Scene.loop` à `Scene.ts:5569` autour de l'appel `render()` ; `step(dt)` à `Scene.ts:3420` les laisse à zéro.
- `Scene.dirtyReasons: DirtyReasonEntry[]` à `Scene.ts:3489` et `setDirtyTracking` à `Scene.ts:3474` / `DirtyTracker` à `packages/core/src/tree/scene/DirtyTracker.ts:70` — FIFO bornée (`MAX_DIRTY_REASONS = 200` à `DirtyTracker.ts:71`) cléée par `entity:reason.property` (`DirtyTracker.ts:120`).
- `Scene.getA11yTree(): A11yTreeNode[]` à `Scene.ts:5412` (`A11yTreeNode` à `Scene.ts:538`) et par-entité `getA11yElement(id)` à `Scene.ts:6446` / `getContentElement(id)` — les miroirs DOM live dont `getBoundingClientRect()` est comparé à `getWorldBounds()` dans `highlightGeometry` et `inspectA11y`.
- `Scene.renderMode: 'always' | 'onDemand'` à `Scene.ts:1147`, `SceneOptions.renderMode` à `Scene.ts:408`, et la délégation `DirtyTracker` à `Scene.ts:3443` — la politique que `diagnoseDirty` attribue.
- `Entity.getDevtoolsDescriptor(): DevtoolsDescriptor | null` à `packages/core/src/tree/Entity.ts:1937` et `getLayoutControlledProperties(entity)` à `packages/core/src/tree/Entity.ts:968` — les deux hooks fournis par l'app qui évitent à DevTools d'avoir besoin d'une table de types de composants.

Les sous-classes possédant des ressources GPU/DOM surchargent `destroy()` avant d'appeler `super.destroy()` (`packages/core/src/tree/ComputeParticleEntity.ts:419`, `DOMPortalEntity.ts:142`), donc un panneau qui tient un index `Map<string, Entity>` (`panel.ts:157`) ne retient jamais une entité disposée.

## 11. Bridge et protocole plugin

### 11.1 Le bridge JSON-RPC

`createDevtoolsBackend(scene, transport, opts?)` à `packages/devtools/src/bridge.ts:131` et `createDevtoolsClient(transport, opts?)` à `bridge.ts:328` parlent un protocole versionné (`DEVTOOLS_PROTOCOL_VERSION = 1` à `bridge.ts:33`, `DEVTOOLS_CHANNEL = 'vectojs-devtools'` à `bridge.ts:36`) sur un `DevtoolsTransport` (`bridge.ts:97`) — une abstraction duplex `send / subscribe`. `DevtoolsMethod` à `bridge.ts:39` énumère 20 méthodes (`protocol.version`, `tree.get`, `entity.inspect/pick/highlightGeometry`, `scene.audit/a11yAudit/a11yOrder/snapshot/diff/frameStats`, `hit.explain`, `text.inspect`, `markdown.stream`, `gpu.inspect`, `plugin.list/rows/audit`, `command.list/run`). Chaque handler est wrappé pour qu'une scène malformée réponde `ok: false` plutôt que tuer le backend (`bridge.ts:290`).

`tree.get` sérialise jusqu'à `maxTreeNodes = 5000` par défaut (`bridge.ts:118`) et rapporte `truncated: true` au lieu de couper silencieusement (`bridge.ts:178`). Les réponses sont round-trippées via `JSON.parse(JSON.stringify(result))` pour qu'un handler retournant une entité live échoue dans les propres tests du backend plutôt qu'en erreur `structuredClone` dans une extension (`bridge.ts:300`). `allowedOrigins` est **requis** pour tout transport cross-document — un backend qui répond à tout le monde divulgue le contenu de la scène à toute frame pouvant `postMessage` (`bridge.ts:104`). Deux transports sont livrés : `createDirectTransportPair()` pour tests/agents (`bridge.ts:404`) et `createWindowTransport(target, targetOrigin)` pour extensions/frames parentes qui forward `event.origin` pour le check allowlist (`bridge.ts:439`). `publishSelection` / `publishStructure` à `bridge.ts:459` / `bridge.ts:469` émettent des notifications `DevtoolsEvent` initiées par le backend (`bridge.ts:81`).

Un backend sert chaque frontend — le panneau in-page, une extension navigateur, Playwright et les agents — pour que quatre implémentations des mêmes requêtes ne divergent pas (`bridge.ts:21`).

### 11.2 Plugins

`registerDevtoolsPlugin(plugin)` à `packages/devtools/src/plugin.ts:1` ajoute un onglet inspecteur, des audits et des commandes qui survivent à une seule sélection. `PluginInspector` à `plugin.ts:1` est `{ id, label, appliesTo?, inspect(ctx): PluginRow[] }` — la même forme `PluginRow { label, value, note? }` qu'un champ `getDevtoolsDescriptor()` propre à un composant utilise, donc forwarder un descripteur ne nécessite pas de traduction. `PluginAudit` retourne `PluginFinding[]` que le panneau ajoute comme findings ordinaires afin que `selectFinding(i)` n'ait pas besoin de savoir d'où vient un finding (`panel.ts:830`). Le panneau préalloue `PLUGIN_ROWS = 18` lignes `Text` par onglet plugin (`panel.ts:94`) et reconstruit les onglets plugin quand un paquet s'enregistre tard via `syncPluginTabs()` à `panel.ts:1027` — avant le check de version, pour qu'un plugin nouvellement importé n'attende pas le prochain changement structurel.

## 12. Internals du panneau qui comptent

- **Reflow possède son propre resize.** La scène du panneau est `disableWindowResize: true` et doit appeler `panelScene.resize(width, innerHeight)` à chaque `window.resize` (`panel.ts:608` `layout()`), repositionnant la hauteur des onglets, les hauteurs tree/audit et la carte perf. Sans cela la bande perf ancrée en bas tombe sous le pli à tout viewport plus court — le bug livré à 100% de zoom (`vectojs-docs/forge/findings/devtools-and-telemetry.md:100`, corrigé dans `vectojs#132`).

- **Refresh gated par version avec reconcile périodique.** `refresh()` à `panel.ts:709` saute le parcours quand `host.structureVersion === treeVersion` et `allNodes` est non vide — donc un intervalle 60 Hz est bon marché — mais réécrit toujours les labels (`refreshTreeLabels` sur `allNodes` et `filteredNodes` à `panel.ts:733`) et réécrit les lectures sélection/plugin. Un reconcile forcé toutes les `RECONCILE_INTERVAL_MS` (`panel.ts:591`) borne combien de temps une mutation directe de `children` sans bump de version peut rester stale.

- **Contrat `pointer-events: none` du dock.** Le container du dock et son canvas sont en `pointer-events: none` ; seuls les contrôles projetés a11y repassent en `auto` (`panel.ts:288`), reflétant `Scene.a11yRoot` (`vectojs-docs/forge/findings/devtools-and-telemetry.md:29`, corrigé `@vectojs/devtools@0.4.3`). Le handler pick vérifie `container.contains(ev.target)` avant de consommer un clic (`panel.ts:219`), donc armer le mode pick n'avale pas les propres boutons du panneau (`vectojs#482`, `forge 2026-08-13`).

- **Audit a11y mis en cache, pas re-parcouru par tick.** `writeA11y` tourne à chaque tick (c'est la lecture de la sélection), mais le parcours complet `auditA11y` est mis en cache sur `structureVersion` avec un TTL `A11Y_AUDIT_TTL_MS = 3000` (`panel.ts:85`, `panel.ts:1246`) — les inputs d'audit incluent labels/disabled/opacity/tabIndex/bounds sans compteur de version, donc une clé pure version devenait stale indéfiniment (`vectojs#496`, `forge 2026-08-13`).

- **Labels safe avec filtre et sûreté plugin.** Avec un filtre actif le `Tree` rend des copies élaguées ; les labels filtrés doivent aussi être réécrits sinon les lignes gèlent à la géométrie du dernier rebuild (`panel.ts:736`, `#786`). Un `appliesTo` ou `getA11yAttributes()` qui lève dégrade en « ne s'applique pas » / verdict par entité plutôt que de blanchir le panneau (`panel.ts:1298`, `a11yInspect.ts:179`, `vectojs#496`).

## 13. Parties difficiles — avec reçus

| Piège                                                                                     | Où                                                      | Statut                                 |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------- |
| L'overlay du dock avale l'input pointeur hôte                                             | `panel.ts:288`, forge 2026-07-16                        | Corrigé `@vectojs/devtools@0.4.3`      |
| FPS rAF indépendant mesure le vsync d'affichage, pas la cadence Scene                     | `Scene.ts:518` `FrameStats`, forge 2026-07-18           | Corrigé `core@1.13.0` via `frameStats` |
| Le panneau déborde le viewport à toute hauteur plus courte                                | `panel.ts:608` `layout()`, forge 2026-07-21             | Corrigé `devtools@0.5.0`               |
| Focus/workspace décide la cadence Chrome ; Firefox requiert `layout.frame_rate`           | `benchmarks/run-browsers.sh`, forge 2026-08-02/03       | Corrigé `vectojs#326/#327/#333`        |
| Snapshot mixte niveau clé/non-clé appaire un nœud deux fois et drop des removals          | `snapshot.ts:196`, forge 2026-08-13                     | Corrigé `vectojs#481/#510`             |
| Le mode pick avale les clics des propres contrôles du panneau                             | `panel.ts:219`, forge 2026-08-13                        | Corrigé `vectojs#482/#510`             |
| `findEntityAt` revendiquait la parité moteur mais omettait les gates opacity/clip/pointer | `model.ts:82`, `HitTester.ts:227` vs `forge 2026-08-13` | Corrigé `vectojs#483/#510`             |
| Dérive canvas-vs-DOM comparait px logiques vs px client                                   | `a11yInspect.ts:143`, `panel.ts:1099`                   | Corrigé `vectojs#484/#510`             |
| `selectFinding` ignorait les findings plugin                                              | `panel.ts:860`, forge 2026-08-13                        | Corrigé `vectojs#496/#518`             |
| `accessibleName` était la preview tronquée à 80 chars                                     | `a11yInspect.ts:160`, `inspect.ts:70`                   | Corrigé `vectojs#496/#518`             |
| Warning inspecteur droppé au budget de lignes                                             | `model.ts:153` + `panel.ts:1143`, forge 2026-08-13      | Corrigé `vectojs#496/#518`             |
| Audit a11y complet re-parcouru à chaque tick 500 ms                                       | `panel.ts:1246`, forge 2026-08-13                       | Corrigé `vectojs#496/#518`             |
| `getA11yAttributes()` qui lève tuait tout l'audit a11y                                    | `a11yInspect.ts:179`, forge 2026-08-13                  | Corrigé `vectojs#496/#518`             |

## 14. Checklist — avant de lander un changement DevTools

1. **Headless d'abord.** Ajoutez la fonction pure, testez-la via `createDirectTransportPair()` sans navigateur, puis câblez le panneau. Un protocole validé par un vrai consommateur vaut mieux qu'une UI reconstruite autour d'un protocole non validé (`bridge.ts:21`).
2. **Tolérant aux throws.** Gardez chaque appel `getA11yAttributes()` / `getDevtoolsDescriptor()` / `appliesTo` — un composant cassé doit dégrader, pas blanchir l'outil (`model.ts:184`, `inspect.ts:136`, `panel.ts:1298`).
3. **Parité de hit.** Toute nouvelle gate visibilité/input/clip doit atterrir à la fois dans `HitTester.findHitRecursively` et `isHitEligible` _et_ le parcours pick/explain headless (`HitTester.ts:227` vs `model.ts:82` vs `hitExplain.ts:139`, `vectojs#483`).
4. **Allowed origins ou paire directe seulement.** Un backend cross-document sans `allowedOrigins` est un vecteur de divulgation d'information (`bridge.ts:104`).
5. **Les caches cléés par version ont besoin d'un TTL.** Une clé `structureVersion`-only pour quelque chose dépendant aussi de labels/opacity/bounds devient stale pour toujours (`panel.ts:1246`).
6. **Gardez le dock non interactif.** Le container/canvas reste en `pointer-events: none` (`panel.ts:288`) ; les contrôles repassent en opt-in. Une régression ici assourdit silencieusement les contrôles du bord droit de l'hôte.

## 15. Workflows de débogage — quel outil pour quel symptôme

| Symptôme                                                 | Workflow                                                                                                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| « Quelle entité possède ce pixel ? »                     | `pickInScene(scene, x, y)` → `inspectEntity(hit)` (`packages/devtools/src/model.ts:214`, `packages/devtools/src/inspect.ts:99`)                |
| « La mauvaise entité possède ce pixel »                  | `explainHitTest(scene, x, y)` — chaque perdant avec la raison (`packages/devtools/src/hitExplain.ts:139`)                                      |
| « Pourquoi cette entité est positionnée/taillée faux ? » | `inspectEntity` bounds + `getWorldTransform()`, remontez `entityPath` — la première bounds fausse possède le bug                               |
| « Écritures sur `x` reviennent »                         | `inspectEntity(e).layoutControlled` — le parent possède cette prop (`packages/devtools/src/inspect.ts:42`)                                     |
| « Cible de clic décalée du visuel »                      | `highlightGeometry(scene, e)` — cherchez `divergesFromLayout` sur `a11y`/`content` (`packages/devtools/src/highlightGeometry.ts:1`)            |
| « Zone de hit fausse »                                   | `sampleHitRegion(e)` — la vraie région de hit, pas la boîte                                                                                    |
| « Le lecteur d'écran ne dit rien »                       | `inspectA11y(scene, e)` pour `accessibleName`/`nameSource` ; `a11yReadingOrder(scene)` pour l'ordre d'annonce                                  |
| « Texte dans le mauvais ordre / boîtes vides »           | `inspectText(e)` niveaux bidi / `glyphs[].atlasMiss` (`packages/devtools/src/textInspect.ts:179`)                                              |
| « Une scène `onDemand` ne s'endort jamais »              | `scene.setDirtyTracking(true)` → `diagnoseDirty(scene)` (`packages/devtools/src/dirtyDiagnosis.ts:70`, `packages/core/src/tree/Scene.ts:3474`) |
| « Qu'est-ce qui a changé après cette interaction ? »     | `captureSnapshot` avant/après → `diffSnapshots`                                                                                                |

---

_Série : 00 Overview → 01 Selection → 02 Text+Layout → 03 Projection+Virtualization → 04 Streaming Markdown → 05 TeX → 06 VMT Runtime → 07 Renderer → 08 WASM G1/G2/G3 → 09 Three/XR → 10 Export vidéo → 11 Agencement de graphes → **12 DevTools** → 99 Synthesis._
