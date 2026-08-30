---
title: '07 — Renderer — Coordonnées / Clipping / Parité DPR'
description: 'Parité multi-backend sur Canvas2D, WebGL, WebGPU, SVG et Three : le contrat IRenderer, les espaces de coordonnées, la sémantique du clip, les plafonds DPR/backing-store, le culling du viewport et le batching des draw calls — et chaque piège qui fait que la même scène paraît différente selon le backend.'
order: 27
---

# 07 — Renderer — Coordonnées / Clipping / Parité DPR

> **Boss 07** garde le dernier kilomètre : transformer la
> géométrie du Virtual Math Tree en pixels qui paraissent identiques que le backend soit
> `CanvasRenderingContext2D`, une couche de points WebGL, une passe compute
> WebGPU, un export SVG ou un mesh instancié Three.js — à tout DPR,
> tout zoom et tout viewport.

- **Ce que vous apprendrez** : le contrat `IRenderer` et pourquoi il — et non
  `CanvasRenderingContext2D` — fait autorité ; les cinq espaces de
  coordonnées traversés par un draw call ; comment clipping, DPR, culling et
  batching cassent chacun la parité ; et les pièges déposés, corrigés et encore ouverts
  avec `file:line` vérifiables.
- **Ce que vous n'apprendrez pas** : shaping et layout du texte (boss 02), dirty
  et cycle de vie du VMT (boss 06), accélération WASM (boss 08), ou le
  mapping deux-mondes du pont Three/XR (boss 09). Ce doc est la
  moitié rendu de chacun.

## Pourquoi la parité multi-backend est difficile

VectoJS promet « même scène, même image » sur cinq backends :

| backend                     | module                                                        | retained?            | où vont les pixels                        |
| --------------------------- | ------------------------------------------------------------- | -------------------- | ----------------------------------------- |
| Canvas2D                    | `packages/core/src/renderer/CanvasRenderer.ts:1`              | immediate            | un seul contexte 2D `<canvas>`, scalé DPR |
| WebGL points/sprites/glyphs | `packages/core/src/renderer/WebGLPointRenderer.ts:1`          | batched              | canvas empilé plein-fenêtre, quads NDC    |
| WebGPU particles            | `packages/core/src/renderer/WebGPUParticleSystemManager.ts:1` | compute              | même canvas empilé, compute→render        |
| SVG export                  | `packages/core/src/renderer/SVGRenderer.ts:1`                 | retained strings     | sérialisation DOM-free `toXMLString()`    |
| Three.js                    | `packages/three/src/ThreeRenderer.ts:216`                     | retained scene graph | `THREE.WebGLRenderer` caméra ortho        |

Chaque backend reçoit les **mêmes appels `Entity.render(r: IRenderer)`**
dans le même ordre, sous la même pile `save`/`restore`/`translate`.
La parité échoue non là où le walk est faux mais là où les backends
_interprètent_ le même appel différemment — un clip qui est une op de chemin dans
l'un et un rect scissor dans l'autre, un backing store dimensionné à `window
.devicePixelRatio` dans l'un et clampé `maxDPR` dans l'autre, un stroke
qui est une propriété `lineWidth` dans l'un et une géométrie en ruban dans l'autre.
Chaque divergence est invisible jusqu'à ce qu'un écran HiDPI, un zoom, un bord
de clip ou une grille de 40k cellules ne la révèle.

Le contrat qui absorbe ces divergences est `IRenderer`
(`packages/core/src/renderer/IRenderer.ts:1`). Les entités ne doivent pas
importer un renderer concret. L'interface est volontairement à base de méthodes :
le style voyage _avec_ le draw (`stroke(color, lineWidth)`,
`fillText(text, x, y, font, color)`) pour qu'un backend à batch puisse coalescer
les runs et qu'un backend GPU ait une frontière définie. Les propriétés de style mutables
(`ctx.fillStyle = …`) sont délibérément absentes — des gardes dev alertent dessus
(`IRenderer.ts:159`, `IRenderer.ts:301`) car en JS non transpilé
elles s'attachent comme expandos et dessinent silencieusement avec le défaut du contexte.

## Le contrat IRenderer (lisez ceci d'abord)

```text
IRenderer.ts:41  — kind, pixelRatio, setDrawCounters / getDrawCounters
IRenderer.ts:134 — clip(x,y,w,h, radii?)
IRenderer.ts:149 — path: beginPath / moveTo / lineTo / bezierCurveTo / closePath / arc / roundRect
IRenderer.ts:193 — drawImage / drawImageRect? (optional)
IRenderer.ts:287 — fill / stroke / fillText / fillCircle / flush
IRenderer.ts:350 — createLinearGradient
IRenderer.ts:404 — present? / dispose? / isContextLost? / onContextRestored?
```

Choix de conception clés :

- **`kind`** (`IRenderer.ts:76`) est un discriminateur string stable
  (`'canvas2d' | 'svg' | 'three'`) — `constructor.name` minifie.
- **`pixelRatio`** (`IRenderer.ts:88`) est optionnel et une valeur _live appliquée_,
  pas un snapshot de `window.devicePixelRatio`. Un appelant qui
  rastérise une source de blit doit lire ceci, pas la fenêtre.
- **`drawImageRect?`** (`IRenderer.ts:232`) est optionnel. `SVGRenderer`
  l'omet à dessein : un blit SVG embarque sa source en data URL, donc
  un sous-rect par cellule inlinerait tout l'atlas des milliers de fois.
  Les appelants doivent feature-detect et garder un fallback `fillText`.
- **`fillCircle` + `flush`** (`IRenderer.ts:328`, `:364`) est le
  batch préservant l'ordre. Des cercles consécutifs même couleur, même alpha
  coalescent en un seul chemin et un seul `fill()` au `flush()`. `Scene` flush
  à chaque frontière de sibling et en fin de frame.
- **`present?`** (`IRenderer.ts:404`) est uniquement pour backend retained.
  `CanvasRenderer` peint immédiatement ; `ThreeRenderer` diffère son
  unique vrai rendu GL à `present()` (`ThreeRenderer.ts:957`) pour qu'une
  frame coûte `O(N)` adds + `1` draw, pas `O(N²)` re-renders.

## Espaces de coordonnées (cinq, pas un)

Un point écrit comme `fillCircle(cx, cy, …)` traverse :

1. **Local** — la boîte `(x, y)` propre à l'entité. `Entity.getBounds()`
   et `worldToLocal` vivent ici.
2. **World** — local transformé par chaque `translate` /
   `scale` / `rotate` ancêtre et l'échelle DPR de la scène. `HitTester` et
   le culling testent ici.
3. **Viewport / CSS px** — world clippé au viewport de la scène et
   à tout ancêtre `clipChildren`. `Scene.ts:4335` `projectionBoxVisible`.
4. **Backing store / device px** — viewport × `appliedDPR`
   (`CanvasRenderer.ts:244` `pixelRatio`). Là où le GPU
   échantillonne réellement.
5. **Clip / NDC** — WebGL/WebGPU uniquement : `(pos / resolution)*2-1`,
   y inversé (`WebGLPointRenderer.ts:320`), ortho y-down de Three
   (`ThreeRenderer.ts:250`).

Le piège est de supposer qu'un espace en est un autre. Le chemin GPU de `ComputeParticleEntity`
consomme `scene.mouseX/Y` en espace **fenêtre** et dessine sur un
canvas empilé plein-fenêtre qui ignore les transforms d'entité ; son fallback CPU
consomme `entity.worldToLocal(mouse)` en espace **local** et
dessine dans `renderer.translate(node.x, node.y)` — un buffer, deux
contrats (`vectojs-docs/forge/findings/renderer-and-gpu.md:299`).
La passe record de `WebGPUParticleSystemManager` passe `screen_size` comme `width /
height` (`WebGPUParticleSystemManager.ts:310`) tandis que le chemin CPU
dessine avec le transform d'entité déjà appliqué.

`ThreeRenderer` vit dans le même piège à la frontière NDC : sa caméra ortho
est y-down (`ThreeRenderer.ts:250`), donc chaque mesh `FrontSide`
est backfacing et cullé — le fix est `side: DoubleSide` sur chaque
primitive remplie, pas seulement le texte (`ThreeRenderer.ts:596`, forge
2026-08-13).

## Clipping

`IRenderer.clip(x, y, w, h, radii?)` (`IRenderer.ts:134`) intersecte
le clip courant. `radii` est une _amélioration progressive_ : un
chemin GPU à scissor-test peut l'ignorer.

- **Canvas2D** — `ctx.roundRect` + `ctx.clip()` dans `save`/`restore`
  (`CanvasRenderer.ts:373`). Scopé, correct.
- **SVG** — synthétique : un frais `<clipPath id="clip-N"><rect|path …/>`
  plus `<g clip-path="url(#clip-N)">`, fermé en dépilant `clipDepth`
  sur `restore()` et en fermant les tags dans `toXMLString()`
  (`SVGRenderer.ts:510`, `:543`). Le coût est la taille du DOM, pas le fill rate.
- **Three** — rect scissor en pixels backing-store, transformé par la
  matrice courante et inversé vers origine bottom-left, intersecté avec tout
  scissor englobant (`ThreeRenderer.ts:449`). Le scissor est rectangulaire
  uniquement ; les clips arrondis dégradent vers leur AABB.
- **`clipChildren`** — un flag au niveau `Scene`/entité, _pas_ l'appel renderer
  `clip()`, qui virtualise hit, a11y et projection de contenu.
  `Scene.ts:254` (hit) et `Scene.ts:4305` (culling) intersectent la
  world box de chaque ancêtre `clipChildren` ; `isHitEligible` re-vérifie
  avec le rect local exact sensible à la rotation.

Écart de clip connu : `IRenderer.fill` ne peut exprimer `fillRule: 'evenodd'`
(`forge/findings/renderer-and-gpu.md:38`). `Canvas2D` et `SVG` peuvent faire
even-odd (`ctx.fill('evenodd')`, `<path fill-rule="evenodd">`), mais l'
interface n'expose que `fill(colorOrGradient)`. Un chemin composé avec
plus d'un composant fermé remplit donc `nonzero` sur chaque
backend. La forme prescrite est un `fillRule` optionnel
rétro-compatible sur `fill`, à implémenter de façon cohérente avant
que les consommateurs ne retirent leur garde diagnostic.

## Mise à l'échelle DPR et plafonds du backing store

```text
CanvasRenderer.ts:219  effectiveDPR()  = min(real DPR, maxDPR)
CanvasRenderer.ts:244  pixelRatio      = appliedDPR (recorded, not live)
CanvasRenderer.ts:119  constructor / resize apply scale(dpr, dpr)
WebGLPointRenderer.ts:972  same clamp for the point layer
ThreeRenderer.ts:307   effectiveDPR() / pixelRatio via getPixelRatio()
Scene.ts:286           SceneOptions.maxDPR — syncs to every renderer on resize
```

Trois invariants :

1. **Clampez, ne faites pas confiance.** `maxDPR` (`SceneOptions.maxDPR`,
   `CanvasRenderer.ts:66`) plafonne la croissance du backing-store. `maxDPR: 2` est
   un défaut sain, _pas_ une garantie — une passe de strokes par frame avec
   des milliers de segments fins a mesuré `16.7 ms` à DPR1 vs `140 ms` à
   DPR2 sur le même contenu (`forge 2026-07-18` backing-store cap).
   Les passes coûteuses peuvent nécessiter `maxDPR: 1` même quand le défaut moteur
   est 2.

2. **Appliqué, pas live.** `pixelRatio` rapporte le ratio par lequel le contexte
   est _actuellement scalé_ (`appliedDPR`), pas `effectiveDPR()`
   relu à l'accès (`CanvasRenderer.ts:234`). Un getter live
   rapporterait le _futur_ DPR pendant la fenêtre entre un changement de zoom/DPR
   et le prochain `resize`, et un appelant rastérisant depuis lui produirait
   une texture que le contexte encore ancien ré-échantillonne. Les caches cléés sur
   `pixelRatio` (ex. `GlyphRasterAtlas`, pool d'atlas code `Markdown`)
   re-cléent donc seulement après le resize qui réalloue réellement.

3. **Le resize invalide les caches de style.** Poser `canvas.width/height`
   réinitialise tout le contexte 2D à `10px sans-serif / #000` selon la spec.
   `CanvasRenderer.resize` jette `_cachedFont/_cachedFill/_cachedStroke`
   et l'état de batch (`CanvasRenderer.ts:258`) et enregistre le nouveau
   `appliedDPR`. `contextrestored` fait de même (`CanvasRenderer.ts:164`) ;
   un drop manquant est une repaint à cache périmé avec la fonte par défaut. Le
   `WatchDevicePixelRatio` media-query loop se ré-arme à chaque
   changement (`ThreeRenderer.ts:338`, équivalent `Scene`) pour qu'un drag
   entre écrans ou un zoom déclenche un vrai `resize`.

Les bitmaps pré-rastérisés reposent là-dessus :

- `GlyphRasterAtlas` et `TextRasterCache` rastérisent à un `dpr` au moment de la construction
  (`GlyphRasterAtlas.ts:174`, `TextRasterCache.ts:88`) mais
  leurs clés de lookup omettaient historiquement le DPR (`forge 2026-08-25`) :
  réutiliser un atlas à travers un changement DPR servait des bitmaps à densité périmée
  sous des clés identiques et les blittait ré-échantillonnés (flous). Le contrat doc
  dit « un atlas est cléé par DPR et remplacé au changement »
  — la sûreté dépend de la discipline de l'appelant sauf si la clé replie le DPR.
- `SplineEntity.bake` lisait autrefois `window.devicePixelRatio` brut
  (`SplineEntity.ts:433` pre-fix) alors que son blit allait dans un contexte clampé `maxDPR`
  — un bitmap sur-résolu sous-échantillonné chaque frame.
  Corrigé pour lire `renderer.pixelRatio` au rendu et re-bake au
  changement (`SplineEntity.ts:504`).

## Culling du viewport

`Scene` cull strictement contre le viewport : une entité dont la _fill box_
est entièrement hors viewport est sautée (`Scene.ts:7254` trace de cull).
Deux raffinements :

- **Inflation du stroke.** `Circle.getBounds()` / `Rect.getBounds()` désormais
  gonflent de `strokeWidth/2` quand stroké (`Circle.ts:67`,
  `Rect.ts:54`, corrigé `@vectojs/core@2.18.3` CTX-0261). Avant, un
  stroke épais au bord du viewport perdait jusqu'à la moitié de sa largeur. Le
  suivi `-0` (`-inflation` niant `0`) a nécessité un negate à positifs seuls
  (`forge 2026-08-08` entrée `-0`).
- **Culling sensible au clip** (`Scene.ts:4335`). `projectionBoxVisible`
  intersecte le viewport avec l'AABB de chaque ancêtre `clipChildren` ;
  le contenu hors-viewport-mais-clippé-in est virtualisé (boss 03). Un
  overlay plein-viewport non borné n'est intentionnellement jamais clippé
  (`Scene.ts:4238`).

## Batching et économie des draw calls

| chemin                        | mécanisme                                                          | cap / coût                                                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fillCircle` (Canvas2D)       | run même couleur, même alpha → un chemin, un `fill()` au `flush()` | `MAX_BATCH = 64` (`CanvasRenderer.ts:88`) — superlinéaire au-delà                                                                                                                    |
| `fillCircle` (SVG)            | un `<path d="… A … A …">` par flush                                | pas de coût GPU, taille DOM                                                                                                                                                          |
| `fillCircle` (WebGL/Three)    | quads instanciés / `CircleGeometry`                                | quasi-constant ; seul flush compte                                                                                                                                                   |
| `drawImage` / `drawImageRect` | aucun — `drawImage` immédiat / `<image>`                           | atlas (`GlyphRasterAtlas`) garde une seule texture source ; les sources par-canvas `TextRasterCache` mesurées **0,87×** (baseline `fillText`) à 40k cellules vs **~2×** pour l'atlas |

`CanvasRenderer.flush` (`CanvasRenderer.ts:414`) restaure `globalAlpha`
depuis sa valeur pré-batch (pas `1`) et met à jour `_cachedFill` vers la
couleur du batch — sinon le prochain `fill('red')` avec un cache périmé saute
l'assignation et peint la couleur du batch. Un batch en attente est commité
avant `drawImage`, `beginPath`, `save`/`restore`, `clip`, `fill`,
`stroke` et `fillText`.

`ThreeRenderer.flush` (`ThreeRenderer.ts:957`) ne fait que marquer `frameDirty`.
Le vrai rendu GL est `present()` (`ThreeRenderer.ts:968`), appelé une fois
par `Scene` en fin de frame ; sans cela, `O(N)` flushes coûteraient
`O(N²)` renders. Les anciens builds `Scene` qui n'appellent jamais `present()` sont
couverts par un fallback microtask.

Spécifique WebGL : `setTexture` commit désormais le batch de sprites avant
`texImage2D` quand la source change (`WebGLPointRenderer.ts:974`,
corrigé `@vectojs/core@2.18.3`), reflétant `setMSDFTexture`. Le coût `ctx.filter
= 'blur()'` est différé jusqu'à la _prochaine_ lecture de pixels
(`forge 2026-07-18` entrée `ctx.filter`) — floutez à demi-résolution quand
possible.

## Chemins de rastérisation du texte

`fillText` est shaping CPU + parse couleur + rastérisation à jusqu'à
5 000 appels/frame ; le GPU reste idle (`(program)` domine).
Deux caches opt-in convertissent le shaping en blits :

- `GlyphRasterAtlas` (`GlyphRasterAtlas.ts:1`) — un canvas, slots
  shelf-packés, sous-rects `drawImageRect`. Pour ensembles monospace bornés
  (grille de code, terminal). Nécessite `drawImageRect` ; `SVGRenderer` n'est pas une
  cible.
- `TextRasterCache` (`TextRasterCache.ts:1`) — un petit canvas par
  run `(font, color, text)`, blit `drawImage`. Pour ensembles de phrases bornés
  (danmaku 395 codepoints → un atlas MSDF `≤1024²`). Les deux bornent la mémoire
  (shelf atlas + compteur reset, cache `maxEntries` avec éviction 10% insertion-
  order) et retombent sur `fillText` en headless. Le mur à 5 000
  danmaku n'était _pas_ le shaping mais le draw-count + overdraw : passer
  `fillText→drawImage` n'a rien changé ; batcher les glyphes en ~1 draw WebGL
  via `MSDFTextEntity` / `pointRenderer.addGlyph` l'a fait passer de
  `~28 fps` → `~130 fps` (`forge 2026-07-20` correction, `bakudan` v0.5).

Le chemin texte de Three rastérise à `dpr` (`ThreeRenderer.ts:747`) et clé
le cache de textures sur `dpr|font|color|text|gradient-definition` plus,
pour les gradients, la phase `x,y` arrondie (`ThreeRenderer.ts:806`). La taille de fonte
est parsée par `parseFontSize` (`ThreeRenderer.ts:274`), _pas_
`parseInt` — le shorthand styles met le weight en premier (`'700 16px Inter'`)
donc `parseInt` naïf lisait `700`. Baseline : la baseline alphabétique atterrit
à `y` ; le centre `PlaneGeometry` de Three est décalé de `-fontSize + h/2`
(`ThreeRenderer.ts:831`).

## Câblage de Scene (où sont les boutons du renderer)

```text
Scene.ts:226  SceneOptions.pointBackend: 'canvas' | 'webgl'   (glyphs/sprites)
Scene.ts:233  SceneOptions.particleBackend: 'auto'|'webgpu'|'cpu' (compute particles)
Scene.ts:286  SceneOptions.maxDPR               → syncs to pr.maxDPR on every resize
Scene.ts:398  SceneOptions.renderMode: 'always' | 'onDemand'
Scene.ts:1142 Scene.renderMode + DirtyTracker + RenderScheduler (maxFPS / autoThrottle)
Scene.ts:2284 full-window viewport adoption (once) + disableWindowResize
Scene.ts:2781 clientToScene viewport mapping
```

- **`pointBackend` vs `particleBackend` sont des features différentes**
  (`forge 2026-08-26`). `pointBackend: 'webgl'` batche les quads glyph/sprite
  ; `particleBackend: 'webgpu'` pilote
  `WebGPUParticleSystemManager` pour `ComputeParticleEntity`. Aucun chemin glyph/MSDF WebGPU
  n'existe ; basculer `particleBackend` ne fait rien pour
  danmaku.
- **`WebGPUParticleSystemManager` est opt-in via une static**
  (`forge 2026-08-02`) : `Scene.registerWebGPUParticleSystemManager(...)`.
  Sur `'auto'` par défaut sans enregistrement il n'y a ni throw ni
  `console.warn` — le fallback CPU tourne tandis que `initWebGPUContext`
  alloue encore un canvas empilé inutilisé.
- **`renderMode: 'always'`** (défaut) entraîne une boucle rAF continue ;
  `autoThrottle` la fait retomber à `idleFPS` quand statique. **`'onDemand'`**
  ne peint qu'après `markDirty()` ou un tick animation/physique actif.
  `render()` lui-même rend inconditionnellement — `renderMode` n'affecte que
  l'ordonnanceur de boucle (`Scene.ts:3405`).

## Pièges connus (avec file:line)

| piège                                                                                                                          | où                                                                                            | statut                                             |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Even-odd fill non exprimable (`IRenderer.fill` sans `fillRule`)                                                                | `IRenderer.ts:287`, forge 2026-07-18                                                          | ouvert                                             |
| Pas de primitive shadow/glow (`shadowBlur` absent ; coût `ctx.filter` blur différé)                                            | `IRenderer.ts:159` hints, forge 2026-07-18 / 2026-08-25                                       | ouvert                                             |
| Pas de backdrop blur/material pour wallpaper sampling                                                                          | forge 2026-08-25                                                                              | ouvert (stretch)                                   |
| Clés raster Glyph/Text omettent DPR — bitmaps à densité périmée après changement DPR                                           | `GlyphRasterAtlas.ts:174`, `TextRasterCache.ts:88`, forge 2026-08-25                          | ouvert (contrat=l'appelant doit remplacer l'atlas) |
| `WebGPUParticleSystemManager` requiert static `Scene.register…` ; fallback CPU silencieux sur `'auto'`                         | `Scene.ts:256` registration gate, forge 2026-08-02                                            | ouvert                                             |
| Espaces de coordonnées particules CPU vs GPU divergent (fenêtre vs local)                                                      | `WebGPUParticleSystemManager.ts:310`, `ComputeParticleEntity.ts`, forge 2026-08-02 related    | compensé côté app                                  |
| Backing-store dimensionné au DPR fenêtre au lieu de `appliedDPR` clampé                                                        | `CanvasRenderer.ts:244`, `ThreeRenderer.ts:318`, `SplineEntity.ts:504`                        | corrigé                                            |
| `resize` laissait les caches font/fill périmés à travers reset du contexte                                                     | `CanvasRenderer.ts:258`, forge 2026-08-13 `CanvasRenderer.resize`                             | corrigé #463                                       |
| `flush` mutait `fillStyle`/`globalAlpha` sans mettre à jour les caches                                                         | `CanvasRenderer.ts:414`, forge 2026-08-13                                                     | corrigé #469                                       |
| `parseColorToRGBA` retournait le parse précédent sur entrée invalide                                                           | `renderer/colorParse.ts:60`, forge 2026-08-13                                                 | corrigé #492                                       |
| `SplineEntity.bake` utilisait `window.devicePixelRatio` brut                                                                   | `SplineEntity.ts:433` pre-fix, forge 2026-08-13                                               | corrigé #492                                       |
| `WebGLPointRenderer.setTexture` manquait flush de batch                                                                        | `WebGLPointRenderer.ts:974`, forge 2026-08-13                                                 | corrigé #520                                       |
| `ThreeRenderer.fillText` parsait weight comme taille ; baseline décalée de `fontSize/2`                                        | `ThreeRenderer.ts:274`, `:831`, forge 2026-08-13 / #486                                       | corrigé #511                                       |
| Ortho miroir cullait les remplissages/cercles/gradients `FrontSide`                                                            | `ThreeRenderer.ts:250`, forge 2026-08-13                                                      | corrigé #519                                       |
| `drawImage` flip vertical (`flipY = true`) sur caméra y-down                                                                   | `ThreeRenderer.ts:478`, forge 2026-08-23 #603                                                 | corrigé #613                                       |
| Strokes hairline (`LineBasicMaterial.linewidth` ignoré) ; DPR ignoré ; contexte GL fuité ; gradients >8 stops rééchantillonnés | `ThreeRenderer.ts:110` ribbon, `:307`, `ThreeRenderer.ts:1044` dispose, forge 2026-08-23 #604 | corrigé #623                                       |
| `getBounds()` excluait le stroke → culling clippait `strokeWidth/2`                                                            | `Circle.ts:67`, `Rect.ts:54`, forge 2026-08-08                                                | corrigé 2.18.3                                     |
| Artefact `getBounds()` `-0` enchâssé dans les tests                                                                            | forge 2026-08-08 entrée `-0`                                                                  | corrigé 2.18.3                                     |

## Checklist avant de livrer un changement de renderer

1. **Lisez `pixelRatio`, pas `window.devicePixelRatio`.** Si vous
   rastérisez une texture qui sera blitée, cléz le cache sur
   `renderer.pixelRatio` et re-rastérisez après `resize`.
2. **DoubleSide et unflip.** Sous l'ortho y-down, chaque
   `Mesh`/`PlaneGeometry` a besoin de `side: DoubleSide` et
   `texture.flipY = false` (`ThreeRenderer.ts:596`, `:478`).
3. **Caches sensibles au flush.** Tout chemin qui mute `fillStyle` ou
   `globalAlpha` doit mettre à jour le cache correspondant ; tout ce qui
   reset le contexte doit le jeter (`CanvasRenderer.ts:258`).
4. **Respectez le batch.** N'entrelacez pas un draw non batché entre
   `fillCircle`s de même style si vous voulez qu'ils coalescent ; `flush()`
   avant changements scissor/texture/alpha.
5. **Le clip a trois endroits.** `clip()` du renderer pour les paints, `clipChildren`
   pour hit/A11y/content (`Scene.ts:254`, `:4335`), et bande viewport
   pour virtualisation. Changer l'un sans auditer les deux autres est un
   bug.
6. **Profilez au vrai DPR.** `maxDPR: 2` n'est pas une garantie de performance
   pour passes lourdes en strokes — mesurez au DPR natif sur hardware réel avec
   `benchmarks/run-browsers.sh` (les deux moteurs, headed).

## Relations

- **Boss 03 (projection & virtualization)** possède `clipChildren` et la
  politique `projectionBoxVisible` / content-tier que le culling de ce boss
  reflète.
- **Boss 06 (VMT runtime)** possède `Scene.render`, la politique `RenderScheduler`
  / `DirtyTracker`, et la `worldMatrix` que chaque renderer
  consomme.
- **Boss 02 (text/layout)** possède les métriques que ce boss rastérise.
  **Boss 09 (Three/XR)** réutilise chaque piège de ce doc — strokes en ruban,
  clips scissor, DPR et DoubleSide sont son kit de départ.
  **Boss 08 (WASM)** réutilise les mêmes valeurs `Scene` viewport et DPR ;
  une vue typed-array périmée à travers une croissance mémoire est la version
  de ce boss d'un cache raster périmé.
