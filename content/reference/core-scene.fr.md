+++
title = "Scene"
description = "L'orchestrateur de plus haut niveau de VectoJS : options du constructeur, la boucle de rendu, renderMode/maxFPS et la régulation automatique d'inactivité, les méthodes de cycle de vie, et le registre de backends enfichables WebGL/WebGPU."
weight = 2
+++

# `Scene`

Partie de [`@vectojs/core`](/reference/core-api/).

```ts
new Scene(canvas: HTMLCanvasElement, options?: SceneOptions)
```

Orchestrateur de plus haut niveau. Une `Scene` par `<canvas>`. Ajoutez des objets `Entity`
avec `add()`, puis `start()` la boucle.

```ts
const scene = new Scene(document.querySelector('canvas')!);
scene.add(new Circle({ radius: 24, fill: '#38bdf8' }).setPosition(100, 100));
scene.start();
```

La Scène ajoute deux `<div>` frères transparents dans l'élément **parent** du canvas
(pour la couche d'ombre a11y à `z-index:10` et la couche du portail DOM à
`z-index:9`), et force le parent à `position:relative` s'il est `static`. En SSR/Node
(pas de `document`) la projection a11y/portail se dégrade en une non-opération pour
que la mise en page sans tête / `toSVG()` fonctionne toujours.

## SceneOptions

| Option                 | Type                          | Défaut           | Effet                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ----------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pointBackend`         | `'canvas' \| 'webgl'`         | `'canvas'`       | Backend pour les feuilles `getBatchCircle()`/`getBatchRect()` représentables. `'webgl'` empile un canvas WebGL2 (`z-index:5`) et met ces primitives en lot ; si WebGL2 est indisponible, repli sur Canvas. La couche GL se compose au-dessus du contenu 2D, donc l'ordre de peinture inter-couche ne s'entrelace pas.                                       |
| `particleBackend`      | `'auto' \| 'webgpu' \| 'cpu'` | `'auto'`         | Backend de [`ComputeParticleEntity`](/reference/core-particles/). `'auto'` essaie WebGPU et avertit avant de tomber en repli sur CPU. `'webgpu'` demande explicitement WebGPU mais actuellement enregistre une erreur et tombe en repli si l'initialisation échoue. `'cpu'` force la simulation CPU (définit `webgpuDisabled`).                             |
| `maxFPS`               | `number`                      | `60`             | Limitation du taux d'images. `0` = sans limite (rafraîchissement natif). Les animations continues tournent toujours, juste moins souvent. (En interne `0` sous `NODE_ENV=test`/`VITEST`.) Réglable aussi en direct via `scene.maxFPS`.                                                                                                                      |
| `respectReducedMotion` | `boolean`                     | `true`           | Quand l'OS demande `prefers-reduced-motion`, limiter à `REDUCED_MOTION_FPS` (30) — ou la plus basse valeur entre celle-ci et `maxFPS`. `false` ignore le réglage OS.                                                                                                                                                                                        |
| `readingDirection`     | `'ltr' \| 'rtl'`              | `'ltr'`          | Direction de lecture pour l'arbre d'ombre a11y/automatisation, afin que l'**ordre de tabulation** au clavier et le parcours du lecteur d'écran suivent l'ordre de lecture _visuel_ plutôt que l'ordre d'insertion dans le graphe de scène. `'rtl'` inverse l'ordre en ligne au sein de chaque ligne. Réglable aussi en direct via `scene.readingDirection`. |
| `a11ySyncInterval`     | `number`                      | `0`              | Limite la synchronisation de l'ombre DOM a11y à au plus une fois toutes les N ms. `0` = synchronisation à chaque image rendue. Une petite valeur (p. ex. `100`) maintient la couche a11y cohérente à terme pendant une animation intense tout en épargnant les écritures DOM par image. Réglable aussi via `scene.a11ySyncInterval`.                        |
| `debugA11y`            | `boolean`                     | `false`          | Rendre les nœuds d'ombre avec un contour bleu en tireté (aide au développement) au lieu de `opacity:0`. Ils restent cliquables par l'automatisation dans les deux cas.                                                                                                                                                                                      |
| `renderer`             | `IRenderer`                   | `CanvasRenderer` | Renderer personnalisé (p. ex. `ThreeRenderer` de [`@vectojs/three`](/reference/three-renderer/)).                                                                                                                                                                                                                                                           |
| `disableWindowResize`  | `boolean`                     | `false`          | Ignorer l'écouteur de redimensionnement automatique de `window`. À utiliser dans un conteneur de mise en page personnalisé / canvas hors écran, puis piloter la taille avec `resize(w, h)`.                                                                                                                                                                 |
| `maxDPR`               | `number`                      | `undefined`      | Limite le ratio de pixels de l'appareil utilisé pour dimensionner les stockages de Canvas2D et `pointBackend: 'webgl'`. `undefined` lit le `devicePixelRatio` réel sans limite. Réappliqué à chaque appel `resize()`, pas seulement à la construction. Voir "Limitation du DPR de rendu" ci-dessous.                                                        |

Remarque : `renderMode` est un **champ public** (défaut `'always'`), pas une option
du constructeur — définissez `scene.renderMode = 'onDemand'` après la construction.

### Limitation du DPR de rendu (`maxDPR`)

Le coût de rendu du stockage de sauvegarde évolue avec `taille logique × dpr²`, pas linéairement —
une scène plein écran fluide à DPR 1 (la plupart des laptops de développement) peut dépasser son
budget de trame de 16 ms sur un écran DPR-3, invisible jusqu'à ce que quelqu'un teste
réellement dessus. Cela impacte le plus `pointBackend: 'webgl'`, car il rend un
canvas empilé séparé dont le coût de fragment/sur-dessin est exactement cette courbe DPR² —
un champ de 1200 particules plein écran a mesuré **116 ms** de trame maximale à
DPR 3 contre 60 ips parfaits à DPR 1.

```ts
const scene = new Scene(canvas, { pointBackend: 'webgl', maxDPR: 2 });
```

`maxDPR: 2` maintient l'affichage net (2× dépasse déjà ce que la plupart des
yeux résolvent à distance de visualisation normale) tout en limitant le nombre de pixels
du stockage de sauvegarde — environ la moitié à DPR 3, car `2² / 3² ≈ 0.44×` les
pixels. Avant que cette option n'existe, la seule solution était de monkey-patch
`window.devicePixelRatio` avant de construire la Scene ; préférez `maxDPR`
maintenant — il est réappliqué correctement à chaque redimensionnement, ce qu'un
`Object.defineProperty` ponctuel ne fait pas.

### Deux marges de projection

La projection de contenu comporte deux niveaux indépendants, et depuis `1.31.0`
chacun possède sa propre marge :

- **sémantique** (`contentSemanticMargin`) — ce bloc a-t-il _un quelconque_ DOM ?
  Un bloc doté de DOM fournit son texte à la recherche native dans la page, à la
  copie et à la lecture anticipée des lecteurs d'écran.
- **interaction** (`contentProjectionMargin`) — les _porteurs par ligne_ de ce
  bloc sont-ils construits ? Les porteurs donnent au navigateur la géométrie
  ligne par ligne nécessaire à la sélection.

Avant la séparation, un seul scalaire armait les deux, de sorte qu'il n'existait
que deux configurations : une marge finie libérait entièrement les blocs hors
écran, rendant le texte hors écran introuvable, tandis qu'`Infinity` matérialisait
aussi tous les porteurs du document.

Les séparer offre le juste milieu utile :

```ts
const scene = new Scene(canvas, {
  // Every block keeps its text, so find-in-page sees the whole document.
  contentSemanticMargin: Infinity,
  // Carriers stay bounded by the viewport, so cost scales with what is visible.
  contentProjectionMargin: scene.height,
});
```

> [!IMPORTANT]
> `Infinity` est sûr pour `contentSemanticMargin` et **ne l'est pas** pour
> `contentProjectionMargin`. Le coût qui le rend non pris en charge provient
> d'une bande de porteurs non fenêtrée, non du texte résident.

Un bloc situé hors de la marge d'interaction mais dans la marge sémantique
projette son texte complet sous forme d'un nœud unique, **sans** porteur enfant.
Il reste trouvable et copiable ; seule la géométrie de sélection par ligne est
absente, et celle-ci est de toute façon inaccessible sans le faire défiler dans
la vue.

Le coût unique mérite d'être connu : un niveau résident matérialise un élément par
bloc lors de la première synchronisation, mesuré à environ 13 µs par nœud créé —
soit environ 47 ms pour 1000 blocs. Le régime stable est peu coûteux, car une
entité qui estampille son propre contenu permet à Scene d'ignorer entièrement la
reprojection d'un bloc inchangé. Il s'agit donc d'un coût à l'ouverture du
document, et non d'un coût par image.

## Champs publics

```ts
scene.canvas: HTMLCanvasElement
scene.width: number
scene.height: number
scene.overlayRoot: Entity          // enfants dessinés au-dessus de l'arbre principal, contournant les limites de clip
scene.renderMode: 'always' | 'onDemand'   // défaut 'always'
scene.maxFPS: number               // défaut 60
scene.respectReducedMotion: boolean
scene.a11ySyncInterval: number
scene.particleBackend: 'auto' | 'webgpu' | 'cpu'
scene.webgpuDisabled: boolean      // getter true quand _disabled OU particleBackend === 'cpu'
scene.a11yNeedsReorder: boolean
scene.readingDirection: 'ltr' | 'rtl'   // tab/traversal order; setting it re-flows
scene.forcedColors: boolean             // getter — OS is in a forced-colors mode
```

## renderMode, maxFPS et la régulation automatique d'inactivité

- **`renderMode: 'always'` (défaut)** — re-rendu à chaque image, limité par le FPS
  effectif.
- **`renderMode: 'onDemand'`** — dessine seulement quand la scène est _sale_ (voir
  `markDirty()`) ou qu'un pilote d'animation/transition est en cours. Les ticks rAF
  statiques inspectent toujours l'arbre pour un mouvement en attente, mais sautent la
  mise à jour/rendu d'entité et la soumission GPU. Idéal pour les UI statiques /
  pilotées par événements.

**Régulation automatique d'inactivité (le piège clé).** Une scène est considérée
**statique** quand elle n'est pas sale ET qu'aucun nœud dans l'arbre principal/overlay
n'a de tween `animate()` en attente. En mode `'always'` avec `maxFPS > 0`, une scène
statique est réduite à **~2 ips** pour économiser la batterie/GPU. Le drapeau `dirty`
est remis à `false` à la fin de chaque image rendue (post-rendu), donc :

> Si vous animez à la main en mutant `entity.x` etc. dans un `update()` personnalisé,
> appeler `markDirty()` **dans** `update()` n'aide pas — la réinitialisation post-rendu
> l'efface, et la vérification statique de l'image suivante voit `dirty === false` et
> vous réduit à 2 ips. Soit pilotez le mouvement via [`entity.animate()`](/reference/core-entity/#animation)
> (qui maintient la scène non statique tant que le tween tourne), soit appelez
> `scene.markDirty()` **entre** les images (depuis un gestionnaire d'événement, un
> `rAF` séparé ou une minuterie) pour que le drapeau survive jusqu'à l'itération
> suivante de la boucle.

`effectiveMaxFPS` = `maxFPS`, encore abaissé à 30 (`REDUCED_MOTION_FPS`) quand l'OS demande un mouvement réduit et que `respectReducedMotion` est activé. `0` signifie sans limite.

### Pause hors écran et la limite de dt

Deux comportements de boucle faciles à manquer :

- **Les scènes hors écran cessent de rendre.** Un `IntersectionObserver` sur le canvas
  met en pause la boucle rAF quand le canvas défile complètement hors de vue (un onglet de tableau de bord,
  un graphique sous le pli) et reprend à la réentrée — au lieu d'exécuter la mise à jour/le rendu
  complet pour une scène que personne ne peut voir. Quand `IntersectionObserver` est
  indisponible (SSR/jsdom) la scène est considérée comme toujours à l'écran, donc le comportement est
  inchangé.
- **`dt` est limité à 100 ms** (`MAX_FRAME_DT`). Après un onglet en arrière-plan, un
  point d'arrêt, ou une longue pause GC le temps réel écoulé peut être de plusieurs secondes ; injecter
  cette valeur brute dans l'intégration physique/tween fait tout téléporter. Si vous
  intégrez `dt` vous-même dans `update(dt)`, notez qu'il ne dépassera jamais 100 ms.

## Accessibilité et apparence

| Membre                 | Type               | Notes                                                                                                                                                                                                                                                         |
| ---------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readingDirection`     | `'ltr' \| 'rtl'`   | Ordonne l'arbre d'ombre a11y pour que l'**ordre de tabulation** corresponde à l'ordre de lecture visuel (lignes de haut en bas, puis en ligne). Le définir déclenche un réarrangement lors de la prochaine synchronisation. Aussi une option du constructeur. |
| `forcedColors`         | `boolean` (getter) | `true` quand l'OS est en mode couleurs forcées (Contraste élevé Windows). Détecté par `(forced-colors: active)` ; la scène **se redessine automatiquement** lorsqu'il bascule.                                                                                |
| `prefersReducedMotion` | `boolean` (getter) | `true` quand l'OS demande un mouvement réduit et `respectReducedMotion` est activé. Lu par les pilotes d'animation, qui snapent les propriétés non-opacity au lieu de les interpoler.                                                                         |

Un `<canvas>` est opaque, donc le remappage de couleurs forcées du navigateur ne touche jamais
ce que vous dessinez. Les composants doivent réagir eux-mêmes :

```ts
render(r: IRenderer) {
  const forced = this.scene?.forcedColors ?? false;
  r.fill(forced ? 'ButtonFace' : this.bg);
  r.fillText(this.label, x, y, this.font, forced ? 'ButtonText' : this.color);
}
```

Voir [a11yRoot et le contrat agent](/reference/core-a11y/#couleurs-forcées-contraste-élevé).

## Méthodes de cycle de vie

```ts
scene.add(entity: Entity): this              // attache à la racine de la scène
scene.remove(entity: Entity): this           // détache + démonte récursivement ses nœuds d'ombre a11y
scene.start(): void                          // commence la boucle rAF ; idempotent ; avertit une fois si width/height est 0
scene.stop(): void                           // s'arrête après l'image courante ; start() reprend
scene.destroy(): void                        // détruit idempotemment les sous-arbres/ressources d'entité, boucle, écouteurs, couches DOM, gestionnaires GPU et renderer
scene.markDirty(): void                      // demande un redessin à l'image suivante (important en onDemand + échappe à la régulation d'inactivité)
scene.resize(width: number, height: number): void   // définit le viewport ; redimensionne le renderer + la couche GL ; marque dirty
scene.showOverlay(overlay: Entity): void     // ajoute à overlayRoot (dessiné par-dessus, sans clip)
scene.hideOverlay(overlay: Entity): void
scene.detachA11y(entity: Entity): void       // supprime les nœuds d'ombre pour une sous-arborescence SANS la retirer de l'arbre
```

> **`resize(w, h)` doit être exécuté avant les simulations de particules.** La
> largeur/hauteur provient de `window.innerWidth/innerHeight` sauf si
> `disableWindowResize` est défini, auquel cas elles tombent sur
> `canvas.width || canvas.clientWidth || 0`. Un viewport `0×0` signifie que les
> particules simulent dans une boîte zéro et peuvent ne pas s'afficher.
> `start()` enregistre un avertissement unique quand la largeur ou la hauteur est 0.
>
> `resize()` est aussi la limite métrique de la projection de texte. Appelez-la après
> qu'un conteneur personnalisé ou un zoom CSS d'application change même quand la
> largeur et la hauteur logiques sont inchangées ; Core 1.8 reconstruit alors la clé
> de calibrage froid et attend la nouvelle géométrie Range de Firefox/Chromium avant
> de marquer les grilles préparées comme prêtes.
>
> **`syncA11y` ne fait que créer/mettre à jour, n'élague jamais** dans une image. Si un
> composant échange des entités _enfants_ interactives chaque image, appelez
> `detachA11y(child)` avant de les jeter ou leurs nœuds d'ombre `<a>`/contrôle
> fuient. (`remove()` élague déjà récursivement.)

## Autres méthodes de Scene

```ts
scene.getRenderer(): IRenderer
scene.getRoot(): Entity
scene.clientToScene(clientX: number, clientY: number): Point // viewport → coordonnées logiques de la Scène
scene.render(renderer: IRenderer, dt = 0, time = 0): void   // le renderer principal avance l'état ; les renderers secondaires dessinent un instantané en lecture seule
scene.toSVG(): string                        // instantané en lecture seule de l'état courant via SVGRenderer → XML SVG plat
scene.findEntityAt(x, y): Entity | null      // entité la plus haute dont isPointInside() retourne true (profondeur d'abord, avant-arrière ; pas de filtre interactif)
scene.getA11yElement(entityId: string): HTMLElement | undefined
scene.getA11yTree(): A11yTreeNode[]          // instantané imbriqué des nœuds d'ombre projetés (id/tag/role/label/value/...)
```

## Instrumentation User Timing

La Scène peut émettre des [`User Timing`](https://developer.mozilla.org/en-US/docs/Web/API/User_Timing_API)
marques/mesures autour des phases de rendu, afin qu'une capture de profileur
montre exactement où une image passe son temps. Désactivée par défaut ; activez-la
avec l'option `userTiming` ou en direct via `scene.setUserTiming(true)` :

```ts
const scene = new Scene(canvas, { userTiming: true });
// or
scene.setUserTiming(true); // runtime toggle
scene.userTiming; // read the current state
```

Les noms stables des mesures sont exportés sous le nom `VECTO_USER_TIMING` :

```ts
VECTO_USER_TIMING.scene; // { transform, drawWalk, entityPaint, flush, a11ySync }
VECTO_USER_TIMING.markdown; // { parse }
// e.g. 'vecto:scene:transform', 'vecto:markdown:parse'
```

`@vectojs/core` exporte aussi les helpers de bas niveau que le moteur utilise
en interne (et qu'un renderer personnalisé ou un composant instrumenté peut
utiliser pour ajouter ses propres phases) :

```ts
beginVectoUserTiming(name: string): VectoUserTimingSpan | null
endVectoUserTiming(span: VectoUserTimingSpan | null): void
measureVectoUserTiming(name: string, durationMs: number): void
```

`beginVectoUserTiming` renvoie `null` (et `measureVectoUserTiming` ne fait rien)
quand l'hôte n'implémente pas les marques/mesures, de sorte que le profilage
optionnel n'est jamais une exigence d'exécution. Les intervalles utilisent des
marques de début/fin à noms uniques libérées à `endVectoUserTiming`.
`measureVectoUserTiming` émet une mesure ancrée au temps courant pour une durée
accumulée à partir d'appels disjoints — la voie qui rapporte les totaux de
peinture d'entité par image sans instrumenter chaque entité.

## Registre de backends enfichables (statique)

```ts
Scene.registerWebGLPointRendererCreator(creator: WebGLPointRendererCreator): void
Scene.registerWebGPUParticleSystemManager(managerClass: any): void
```

Appelé automatiquement par l'entrée `.`. Les interfaces concernées
(`IWebGLPointRenderer`, `IWebGPUParticleSystemManager`,
`WebGLPointRendererCreator`) sont exportées pour les backends personnalisés. La perte
de périphérique WebGPU est automatiquement récupérée avec un backoff exponentiel
(3 tentatives) avant de désactiver définitivement WebGPU.

## Télémétrie des images (`frameStats`, 1.13.0)

```ts
scene.frameStats: FrameStats; // télémétrie de boucle de rendu en direct (lecture seule)

interface FrameStats {
  fps: number; // cadence des images rendues, limitée par maxFPS ; 0 avant la première paire d'images
  frameTimeMs: number; // temps réel du dernier passage render() (exclut la synchronisation a11y/contenu)
  frameIntervalMs: number; // intervalle lissé entre les images rendues (EMA)
  dt: number; // dt transmis à la dernière image rendue
  renderedFrames: number; // total des images rendues depuis start()
  skippedFrames: number; // total des ticks rAF ignorés (idle/onDemand/capped) depuis start()
  renderMode: 'always' | 'onDemand';
  dirty: boolean; // si un redessin est en attente
}
```

`fps` est dérivé de l'intervalle entre les images _réellement rendues_, donc les images dans les scènes `onDemand` inactives et les images abandonnées par la limite `maxFPS` ou le ralentissement automatique statique ne le réduisent pas — il rapporte la cadence des vrais redessins, pas le taux rAF brut. Les temps sont mesurés sur la boucle `requestAnimationFrame` ; une scène pilotée uniquement par `step()` (exportation déterministe) les laisse à zéro. Le rendereur repeint toujours le canvas complet, il n'y a donc pas de rectangle partiel sale — `dirty` est le drapeau booléen de redessin en attente. Alimente le HUD de performance [`@vectojs/devtools`](/reference/devtools/).

## Associé

[`Entity`](/reference/core-entity/) (l'arbre que Scène possède) ·
[`IRenderer` / `CanvasRenderer`](/reference/core-renderer/) ·
[`ComputeParticleEntity`](/reference/core-particles/) ·
[a11yRoot et le contrat agent](/reference/core-a11y/) ·
[`@vectojs/core` overview](/reference/core-api/)
