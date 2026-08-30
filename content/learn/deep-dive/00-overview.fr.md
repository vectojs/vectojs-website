---
title: "00 — Vue d'ensemble : Les douze boss de VectoJS"
description: "Un guide de navigation pour les douze boss deep-dive de VectoJS — la carte du jeu, les invariants d'architecture, les dépendances entre paquets et les parcours de lecture pour chaque nouvel arrivant."
order: 20
---

# 00 — Vue d'ensemble : Les douze boss de VectoJS

## Le jeu

VectoJS réimplémente les responsabilités du navigateur sur un seul `<canvas>` : mise en page, hit-testing, répartition des événements, façonnage du texte, découpage, défilement, accessibilité et rendu — le tout à partir d'une arithmétique explicite sur un arbre d'entités conservé. Voyez le framework comme un jeu avec **douze boss**, chacun gardant un sous-système que le DOM vous offrait autrefois gratuitement et que VectoJS doit désormais maîtriser parfaitement. Vous ne les affrontez pas dans l'ordre, mais vous devez connaître la carte avant de choisir votre combat.

Ce document est cette carte.

- **Ce que vous apprendrez ici** : l'architecture du runtime en une image, le squelette des dépendances entre paquets, quel invariant chaque boss menace, comment choisir un ordre de lecture et où ces deep-dives se situent par rapport aux docs existantes `content/learn/*`et `content/reference/*`.
- **Ce que vous n'apprendrez pas** : les mécanismes d'un boss en particulier. Chaque deep-dive possède son boss. Cette vue d'ensemble vous y oriente et vous donne juste assez de contexte pour arriver orienté.

## Architecture en bref

```text
            Application state
                   │
                   ▼
         ┌─────────────────────┐
         │  Virtual Math Tree  │   Entity tree: transforms, bounds, events,
         │  (Scene + Entities) │   dirty/invalidation, worldMatrix. packages/core/tree/Scene.ts:1107
         └─────────┬───────────┘
                   │  dirty, transforms, culling
         ┌─────────▼───────────┐
         │  Layout  / HitTest  │   LayoutEngine (@vectojs/layout), HitTester (@vectojs/core),
         │  / Animation        │   Tween/Spring drivers (@vectojs/animation), physics (@vectojs/math)
         └─────────┬───────────┘
                   │  draw calls / glyph quads / animation frames
         ┌─────────▼───────────┐         ┌──────────────────────────┐
         │   Canvas + GPU      │         │   Thin DOM projection    │
         │  Canvas2D (default) │         │  a11y shadow elements:   │
         │  WebGL  / WebGPU    │◄───────►│  getA11yAttributes(),    │
         │  SVG / Three.js     │  sync   │  a11yProjection modes,   │
         └─────────────────────┘         │  syncA11y walk           │
                                         └──────────────────────────┘
                   │                              │
                   ▼                              ▼
              Visible pixels              Screen readers, IME, Playwright,
                                         copy/find, AT automation
```

La source des pixels est toujours le canvas. Le DOM ne porte que **la sémantique et l'entrée native** ; il ne rend pas la scène visible. Les deux mondes restent synchronisés par un parcours en profondeur (`Scene.syncA11y`/`ContentProjectionManager`, voir `packages/core/src/tree/scene/A11yProjectionManager.ts:30`) qui s'exécute après la mise en page et avant la présentation d'une frame.

Des rendus de référence d'images proches existent déjà dans la doc : [Architecture du runtime](/learn/runtime-architecture/) et [Concepts du moteur](/learn/engine-concepts/) (diagramme central du hub VMT). Ce diagramme textuel est volontairement référençable dans le code et imprimable.

## Squelette des dépendances entre paquets

Moteurs feuilles d'abord, composition vers le haut. Le graphe est acyclique ; les flèches signifient « importe depuis au moment du build » :

```text
  @vectojs/text ─┐
                 ├─► @vectojs/layout ─┐
  @vectojs/math ─┤                    │
                 └─► @vectojs/animation├─► @vectojs/core ─┬─► @vectojs/ui ─┬─► @vectojs/markdown
                                                          │                  └─► @vectojs/markdown-app
                                                          ├─► @vectojs/styles
                                                          ├─► @vectojs/table / @vectojs/node-editor
                                                          │
                                   @vectojs/tex ──────────┤  (consumed by markdown; public API)
                                                          │
           @vectojs/graph-layout ─► @vectojs/graph3d ─────┤  (@vectojs/knowledge-graph above graph3d)
           @vectojs/three / @vectojs/devtools /            │
           @vectojs/video-exporter / @vectojs/desktop      ┘  (host apps atop core+ui)

  crates/vectojs-core-rs (Rust → wasm32)  — invisible accelerator behind @vectojs/core
```

Vérifié par rapport aux dépendances `packages/*/package.json`(`text`/`math`/`graph-layout`/`tex`n'ont aucune dépendance `@vectojs/*`;`layout→text`,`animation→math`,`core→{layout,text,math,animation}`,`markdown→{ui,tex,core}`). Le build respecte cet ordre (`package.json:14`). Les tests aliasent les paquets frères vers `src/`via `vitest.config.ts`, donc l'ordre gouverne l'émission des `.d.ts`, pas l'exécution des tests.

Deux pièges de consommation à surveiller lors du traçage des dépendances : des chemins `references/`factices sont codés en dur dans `packages/tex/scripts/vendor-katex.ts`(`--source`) et `scripts/compare-pretext.ts`(`VECTO_PRETEXT_PATH`) — déplacer cette arborescence les casse silencieusement (selon `AGENTS.md`).

## Les douze boss + cette vue d'ensemble

13 documents au total : cette vue d'ensemble (00) plus un par boss. La difficulté mesure l'effort pour se tromper, pas le volume de code. « Première lecture » est le chemin le plus rapide vers un travail VectoJS utile ; « prérequis approfondi » est l'autre boss que vous devriez avoir lu avant de vous attaquer à celui-ci.

| #   | Boss (deep-dive)                                                                | Paquet(s)                                                                 | Difficulté | À qui s'adresse ce document                           | Prérequis approfondi | Première lecture pour…                            |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------- | ----------------------------------------------------- | -------------------- | ------------------------------------------------- |
| 00  | **Vue d'ensemble et navigation** (ce doc)                                       | — (méta)                                                                  | ☆          | Tout le monde, premier arrêt                          | —                    | orientation                                       |
| 01  | **Sélection native canvas** — synchronisation double-monde                      | `core`(`ContentGridProjector`,`ContentProjectionManager`),`text`,`layout` | ★★★★       | Texte/sélection/IME, copier/chercher/traduire         | 02                   | texte sélectionnable, terminaux, éditeurs de code |
| 02  | **Texte + Mise en page** — Unicode/BiDi/façonnage/排版                          | `text`,`layout`,`core/text`                                               | ★★★★       | Moteur de mise en page, i18n, typographie             | —                    | tout texte au-delà de l'ASCII                     |
| 03  | **Projection sémantique + virtualisation** — cycle de vie de la matérialisation | `core/a11y`,`ui`,`markdown`,`table`                                       | ★★★        | a11y, virtualisation, docs denses                     | 06                   | docs volumineux, listes, tableaux de bord         |
| 04  | **Markdown en streaming** — réconciliation incrémentale                         | `markdown`,`ui`,`layout`                                                  | ★★★        | UI de streaming/LLM                                   | 02                   | lecteurs de chat/streaming                        |
| 05  | **TeX zéro-DOM** — mise en page + émission SVG                                  | `tex`                                                                     | ★★★        | Rendu mathématique                                    | 02                   | formules dans Markdown                            |
| 06  | **Runtime VMT** — dirty/invalidation/cycle de vie/événements                    | `core/tree`,`core/layout`,`core`                                          | ★★★★       | Cycle de vie Scene/Entity, répartition des hits, perf | —                    | entités personnalisées, débogage perf             |
| 07  | **Moteur de rendu** — cohérence coordonnées/découpage/DPR                       | `core/renderer`,`core/performance`                                        | ★★★        | Multi-backend, HiDPI, culling                         | 06                   | travail canvas/WebGL/WebGPU                       |
| 08  | **Triple WASM — G1/G2/G3** — accélération à l'identique binaire                 | `crates/vectojs-core-rs`,`math`,`animation`,`graph-layout`,`core/wasm`    | ★★★        | Perf, parité Rust↔JS                                  | 06, 07               | budgets de frame à l'échelle                      |
| 09  | **Pont Three.js / XR** — deux mondes de coordonnées                             | `three`,`graph3d`                                                         | ★★         | Panneaux 3D, XR                                       | 06, 07               | VectoJS dans Three.js                             |
| 10  | **Export vidéo déterministe** — horloge à pas fixe                              | `video-exporter`                                                          | ★★         | Capture hors ligne, rejouabilité                      | 06                   | enregistrement d'écran, export de simulation      |
| 11  | **Mise en page de graphe** — force-directed + WASM                              | `graph-layout`,`graph3d`,`knowledge-graph`                                | ★★         | Viz de graphe, réglage de layout                      | 06, 08               | graphes réseau/connaissances                      |
| 12  | **DevTools** — introspection et audit du runtime                                | `devtools`,`core`(`frameStats`,`syncA11y`)                                | ★          | Débogage, audit CI                                    | 06                   | « pourquoi cette entité est ici »                 |

Notes sur l'ordre :

- 02 et 06 sont les deux meilleures « secondes lectures » après 00 si vous devez n'en choisir que deux — la plupart des autres boss supposent l'un d'eux.
- 03 s'appuie sur la machinerie dirty/cycle de vie de 06 ; 04 s'appuie sur le façonnage/mise en page de 02 ; 07 et 08 s'appuient tous deux sur 06 et se regroupent donc naturellement après lui.
- La difficulté de 08 n'est pas la syntaxe Rust mais le **contrat de repli à l'identique binaire** et son piège de build (`RUSTFLAGS`dans `crates/vectojs-core-rs/build.sh`).
- Le suivi d'équipe séquence déjà `CTX-0566→…→CTX-0578→CTX-0579` ; le tableau ci-dessus est l'ordre de lecture, qui peut différer de l'ordre de build/publication.

## Trois invariants qui gouvernent chaque boss

Chaque boss peut briser l'un d'eux. Si vous ne retenez rien d'autre, retenez les invariants.

### 1. Invariant de cycle de vie du VMT

> Le **drapeau dirty, la worldMatrix et la liste des enfants** d'une entité s'accordent après chaque étape de `Scene`.

Symptôme en cas de rupture : bornes obsolètes après `remove(child)`sans désenregistrement du driver (`Entity:1582`), cibles de hit fantômes après un `markDirty`partiel, transformations qui divergent entre JS et le magasin SoA WASM (`crates/vectojs-core-rs/src/*.rs`, G1). Garde-fou : contrat `Scene.ts:532` `renderMode`/`DirtyTracker.ts:33`, parcours `DriverTicker.ts:40`, contrat de sous-classe `Entity.ts:782`. 90 % des « glitches de rendu mystérieux » remontent ici.

### 2. Invariant de parité double-monde

> Chaque entité **interactive visible** possède un **homologue a11y synchronisé** dont la géométrie, le rôle/nom/état et le routage focus/pointeur correspondent à la vérité du canvas.

Symptôme en cas de rupture : Playwright `getByRole`ne trouve rien, les lecteurs d'écran annoncent un texte obsolète, les clics touchent la mauvaise entité, l'IME atterrit dans la mauvaise boîte. Garde-fou :`Entity.ts:295` `A11yAttributes`,`Entity.ts:968`modes `a11yProjection`(`eager`/`onDemand`/`never`),`Entity.ts:1937`défaut `getA11yAttributes()`, le parcours partagé `syncA11y`(`A11yProjectionManager.ts:30`,`ContentProjectionManager.ts:26`), et l'invalidation de mémo obsolète `A11yProjectionManager.ts:227`. La matérialisation `onDemand` et la virtualisation du viewport sont les parties difficiles (boss 03) — c'est aussi là que vivent la plupart des blocages VectoJS en conditions réelles.

### 3. Invariant de métrique texte

> **Mesurer une fois, mettre en page plusieurs fois** — et mesurer avec la **vraie** police, sur le **bon** contexte, au **bon** DPR.

Symptôme en cas de rupture : le texte dérive de sa hitbox, les bandes de sélection sont décalées d'une ligne, les écarts sous-pixel CJK se peignent en lignes blanches, le repli de police web change silencieusement les avances, le zoom DPR floute un sous-système mais pas l'autre. Garde-fou : `packages/text/src/fontMetrics.ts:82` `registerFontMetrics`,`packages/text/src/Typography.ts:111` `ctx.measureText('Mg')`avec repli DOM-free à 0.5em, calibration du contexte de mesure `packages/text/src/measureContext.ts:12`, séparation cold/hot de `packages/layout/src/LayoutEngine.ts:808` `LayoutEngine` et mémoïsation des paragraphes. Chaque boss qui touche au texte (01, 02, 04, 05) ré-entre dans cet invariant sous un angle différent.

Gardez ces trois invariants comme checklist en revue : avant d'approuver un changement, demandez-vous « quel invariant cela pourrait-il briser, et où cela se manifesterait-il d'abord ? »

## Comment ces deep-dives s'articulent avec la doc existante

| Docs existantes                                                                                                                     | Deep-dives (cette série)   | Relation                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content/learn/*`(introduction, runtime-architecture, engine-concepts, text-typography, core-scene, accessibility, streaming, etc.) | 00–12                      | **Learn enseigne comment _utiliser_ VectoJS** ; les deep-dives enseignent **comment VectoJS _fonctionne_ à l'intérieur** de cet usage. Lire d'abord un chapitre learn rend le boss correspondant moins coûteux. Paires suggérées :`text-typography`→ boss 02 ;`core-scene`+`events`→ boss 06 ;`accessibility`→ boss 03 ;`streaming` → boss 04. |
| `content/reference/*` (core-a11y, core-entities, core-layout, core-text, ui-markdown, three-adapter, graph-layout, etc.)            | 00–12                      | **La référence est la vérité de l'API** (props, types, sous-chemins). Les deep-dives citent les pages de référence mais ne les reformulent pas. En cas de doute, la signature de référence l'emporte.                                                                                                                                          |
| `forge/findings/*`+`forge/baselines/*`                                                                                              | annexe de chaque deep-dive | Les findings sont les **notes de terrain** ; les baselines sont les **preuves mesurées**. Les deep-dives synthétisent les findings en un récit unique par boss et renvoient aux entrées `file:line` qui justifient l'affirmation.                                                                                                              |
| `vectojs/AGENTS.md`+`vectojs/README.md`                                                                                             | 00 (ce doc)                | La carte des paquets, l'ordre de build et le modèle de rendu/interaction sont **copiés depuis AGENTS.md et README.md à l'identique en sens** et vérifiés par rapport à `package.json` — pas inventés.                                                                                                                                          |

Règle : **côté faisant autorité d'abord**. Si un fait apparaît à la fois dans une page learn/référence et dans un deep-dive, la page learn/référence est la cible de correction. Ne jamais faire `cp -r`entre `vectojs-docs/content`et `vectojs-website/src/content`(selon `AGENTS.md` — dérive de formatage + 408 fichiers i18n).

## Parcours de lecture — choisissez le vôtre

**« Je viens d'arriver »** — 00 → 02 (texte/mise en page) → 06 (cycle de vie VMT) → 07 (moteur de rendu) → le boss le plus proche de votre première tâche. Deux après-midis, de quoi livrer une vraie PR.

**« Je possède une fonctionnalité »** — 00 → votre boss → sa ligne de prérequis approfondi → le chapitre `content/learn/*`correspondant →`forge/findings/<area>.md` pour ce boss. Relisez la section des invariants avant la revue.

**« Je possède la perf »** — 00 → 06 → 07 → 08 (WASM G1/G2/G3) → 11 (graphe) — puis `benchmarks/run-browsers.sh`et `forge/baselines/*.json`. Seuls les chiffres de `run-browsers.sh` sont citables.

**« Je possède l'a11y / les docs denses / les tables »** — 00 → 06 → 03 → (01 si la sélection/copie compte pour votre surface).

**« Je possède la 3D / XR / viz de graphe »** — 00 → 06 → 09 → 11 → (08 si le calcul de layout est votre budget).

Chaque frontmatter de deep-dive déclare son `order`, son ensemble `package`et sa liste `prereq` afin que Zola et la barre latérale restent ordonnés même si un lecteur entre en milieu de série.

## Conventions et standard de vérification

- Toutes les références de code sont vérifiées `file:line`via `ctxctl outline`→`grep -rn`→`read` avant rédaction (jamais de mémoire). Les références ambiguës incluent le nom de fonction/classe.
- Le frontmatter Zola est requis sur chaque doc (`title`,`description`,`order`). Les titres utilisent H2/H3 + blocs de code clôturés (selon AGENTS.md global).
- Barrière token/lint : exécutez les équivalents `just fmt`/`just check`sur les changements de docs le cas échéant avant PR ; côté `vectojs-docs`, vérification de dérive `scripts/sync-content.py` avant push.
- Gardez chaque deep-dive sous ~600 lignes ; cette vue d'ensemble sous ~400. Dense plutôt que verbeux ; liez, ne dupliquez pas.

## Prochaine étape

Choisissez votre parcours ci-dessus. Une prochaine lecture conventionnelle est **Boss 01 — Sélection native canvas** si vous touchez au texte, ou **Boss 06 — Runtime VMT** si vous touchez au cycle de vie/événements — les deux sont de courtes rampes d'accès vers la paire plus difficile (02, 08).

---

_Série : 00 Vue d'ensemble → 01 Sélection → 02 Texte+Mise en page → 03 Projection+Virtualisation → 04 Markdown en streaming → 05 TeX → 06 Runtime VMT → 07 Moteur de rendu → 08 WASM G1/G2/G3 → 09 Three/XR → 10 Export vidéo → 11 Mise en page de graphe → 12 DevTools → 99 Synthèse._
