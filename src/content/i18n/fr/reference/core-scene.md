---
title: 'Scene'
description: "L'orchestrateur de plus haut niveau de VectoJS : options du constructeur, la boucle de rendu, renderMode/maxFPS et la régulation automatique d'inactivité, les méthodes de cycle de vie, et le registre de backends enfichables WebGL/WebGPU."
order: 2
---

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

| Option                 | Type                          | Défaut           | Effet                                                                                                                                                                                                                                                                                                                                |
| ---------------------- | ----------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pointBackend`         | `'canvas' \| 'webgl'`         | `'canvas'`       | Backend pour les feuilles `getBatchCircle()`/`getBatchRect()` représentables. `'webgl'` empile un canvas WebGL2 (`z-index:5`) et met ces primitives en lot ; si WebGL2 est indisponible, repli sur Canvas. La couche GL se compose au-dessus du contenu 2D, donc l'ordre de peinture inter-couche ne s'entrelace pas.                |
| `particleBackend`      | `'auto' \| 'webgpu' \| 'cpu'` | `'auto'`         | Backend de [`ComputeParticleEntity`](/reference/core-particles/). `'auto'` essaie WebGPU et avertit avant de tomber en repli sur CPU. `'webgpu'` demande explicitement WebGPU mais actuellement enregistre une erreur et tombe en repli si l'initialisation échoue. `'cpu'` force la simulation CPU (définit `webgpuDisabled`).      |
| `maxFPS`               | `number`                      | `60`             | Limitation du taux d'images. `0` = sans limite (rafraîchissement natif). Les animations continues tournent toujours, juste moins souvent. (En interne `0` sous `NODE_ENV=test`/`VITEST`.) Réglable aussi en direct via `scene.maxFPS`.                                                                                               |
| `respectReducedMotion` | `boolean`                     | `true`           | Quand l'OS demande `prefers-reduced-motion`, limiter à `REDUCED_MOTION_FPS` (30) — ou la plus basse valeur entre celle-ci et `maxFPS`. `false` ignore le réglage OS.                                                                                                                                                                 |
| `a11ySyncInterval`     | `number`                      | `0`              | Limite la synchronisation de l'ombre DOM a11y à au plus une fois toutes les N ms. `0` = synchronisation à chaque image rendue. Une petite valeur (p. ex. `100`) maintient la couche a11y cohérente à terme pendant une animation intense tout en épargnant les écritures DOM par image. Réglable aussi via `scene.a11ySyncInterval`. |
| `debugA11y`            | `boolean`                     | `false`          | Rendre les nœuds d'ombre avec un contour bleu en tireté (aide au développement) au lieu de `opacity:0`. Ils restent cliquables par l'automatisation dans les deux cas.                                                                                                                                                               |
| `renderer`             | `IRenderer`                   | `CanvasRenderer` | Renderer personnalisé (p. ex. `ThreeRenderer` de [`@vectojs/three`](/reference/three-renderer/)).                                                                                                                                                                                                                                    |
| `disableWindowResize`  | `boolean`                     | `false`          | Ignorer l'écouteur de redimensionnement automatique de `window`. À utiliser dans un conteneur de mise en page personnalisé / canvas hors écran, puis piloter la taille avec `resize(w, h)`.                                                                                                                                          |

Remarque : `renderMode` est un **champ public** (défaut `'always'`), pas une option
du constructeur — définissez `scene.renderMode = 'onDemand'` après la construction.

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

`effectiveMaxFPS` = `maxFPS`, encore abaissé à 30 (`REDUCED_MOTION_FPS`) quand
l'OS demande un mouvement réduit et que `respectReducedMotion` est activé. `0` signifie
sans limite.

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

## Associé

[`Entity`](/reference/core-entity/) (l'arbre que Scène possède) ·
[`IRenderer` / `CanvasRenderer`](/reference/core-renderer/) ·
[`ComputeParticleEntity`](/reference/core-particles/) ·
[a11yRoot et le contrat agent](/reference/core-a11y/) ·
[`@vectojs/core` overview](/reference/core-api/)
