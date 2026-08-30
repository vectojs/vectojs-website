---
title: '06 — VMT Runtime — Cycle de vie / Dirty / Événements'
description: "Le runtime Virtual Math Tree : cycle de vie des entités, granularité dirty/invalidation, composition de la world-matrix et dispatch capture/bubble — avec les pièges des walks d'ancêtres et des fuites de cycle de vie qui brisent les trois invariants."
order: 26
---

# 06 — VMT Runtime — Cycle de vie / Dirty / Événements

> Le Virtual Math Tree n'est pas un scene graph que l'on rend. C'est un arbre numérique retenu dont chaque frame recompose les transforms, décide ce qui est dirty, élimine ce qui est invisible, hit-teste ce qui est interactif, puis seulement peint. Le DOM est une projection ; le canvas est la vérité. Ce document est la boucle de contrôle qui maintient cette vérité cohérente.

## 1. Le pipeline VMT en une image

```text
                    Entity tree               packages/core/src/tree/Entity.ts:782
                    (Scene.root)              Scene holds root + overlayRoot, never reassigns
                         │
                         │  add/remove/reparent  Entity.ts:1065 add / :1117 remove
                         │  structureVersion++   Scene.ts:3462 structureVersion
                         ▼
               ┌─────────────────────┐
               │  Dirty propagation  │   DirtyTracker  scene/DirtyTracker.ts:70
               │  markDirty / clear  │   dirty:boolean  Scene.ts:534
               └─────────┬───────────┘   consumed BEFORE update  Scene.ts:5646
                         │
                         ▼
               ┌─────────────────────┐
               │ Transform gather    │   getWorldTransform  Entity.ts:1668
               │ T·S·R compose       │   _worldFrame cache  Entity.ts:845 / :1668 fast path
               │ per-frame cache     │   currentFrame++     Scene.ts:5806 (O(1) invalidation)
               │ WASM SoA store (G1) │   _storeSlot         Entity.ts:865 / WasmBackendFacade.ts:30
               └─────────┬───────────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
     ┌────────────────┐   ┌──────────────────┐
     │ Layout         │   │ Hit test         │   HitTester  scene/HitTester.ts:17
     │ LayoutEngine   │   │ findEntityAt     │   :121 JS walk fallback
     │ measurePrepared│   │ isHitEligible    │   :326 clip + opacity + pointerEvents
     │ layoutPrepared │   │ WASM grid        │   :144 ensureHitGrid / :185 fused gather
     └───────┬────────┘   └────────┬─────────┘
             │                     │  pointer capture  Scene.ts:3851 setPointerCapture
             └──────────┬──────────┘   capture/bubble  Entity.ts:1610 dispatchEvent
                        ▼
              ┌───────────────────┐
              │ Render walk       │   Scene.ts:5730 render / :5569 loop
              │ cull → paint      │   renderMode always/onDemand  Scene.ts:401
              │ a11y sync after   │   syncA11y deferred when animating
              └───────────────────┘
                        │
                        ▼
                   Pixels + DOM mirrors
```

L'ordre causal est fixe — `Scene.ts:5745` le documente comme un contrat de correction — même si les walks physiques peuvent fusionner. Le chemin JS entrelace `update → compose → cull → paint` par nœud en pré-ordre ; le chemin WASM met à jour tout l'arbre, puis gather et compose en une seule passe SoA avant le même walk cull/paint. Les deux doivent exposer une mutation `update()` dans la même frame.

## 2. Cycle de vie — create / add / remove / destroy

### 2.1 Forme d'une Entity

`Entity` (`Entity.ts:782`) est `abstract`. Chaque instance porte :

- `id: string` — aléatoire `entity_<7>` si omis (`Entity.ts:1055` constructeur).
- `parent: Entity | null` (`:791`), `children: Entity[]` (`:790`). Le parent est le seul lien d'ownership.
- getter `scene` (`:796`) — remonte `parent` jusqu'au vrai propriétaire ; jamais stocké sur l'entité elle-même sauf via l'échappatoire `_scene` propre à Scene.
- Transform local : `_x/_y/_scaleX/_scaleY/_rotation/_opacity` (`:805`), avec flag fast-path `_hasTransitions` (`:812`) pour qu'un `x = v` sur une entité passive soit un test booléen + écriture de champ.
- `Map`s allouées paresseusement : `_drivers`, `listeners`, `captureListeners` (`:819`) — null jusqu'à première utilisation. Une scène de 20k particules ne les alloue jamais.
- `_mounted: boolean` (`:816`), `_destroyed: boolean` (`:817`), `_driversTickedFrame: number` (`:828`, `-1` initialement).
- Cache world-matrix `_wa.._wf / _worldFrame` (`:845`) et slot WASM `_storeSlot: number` (`:865`, `-1` hors du store).

Les sous-classes surchargent `getBounds()`, `drawSelf()`, `getContentProjection()`, `update()`, `onMounted()`, `destroy()`.

### 2.2 add — attachement avec garde de cycle et invalidation de structure

`Entity.add(...children)` (`:1065`) délègue à `_addOne` (`:1075`) :

1. Garde de cycle — `child === this` lève ; parcours de la chaîne `this.parent` vérifie l'égalité d'ancêtre (`:1080`). O(depth), add est rare vs travail par frame.
2. Détachement de l'ancien parent — `child.parent.remove(child)` quand `child.parent` est défini, donc le re-parenting ne duplique jamais.
3. `child.parent = this; this.children.push(child)` — append O(1) en queue.
4. Si `this.scene` existe (arbre vivant) :
   - `s.a11yNeedsReorder = true`
   - `s.markStructureChanged()` — incrémente `structureVersion`, invalide le layout du store WASM des transforms (`Scene.ts:1625` `_storeStructureVersion`).
   - `s.markDirty({ entity: this.id, reason: 'child-added' })` (`:1086`).
   - `child._notifyMounted()` (`:1087`) — `onMounted()` depth-first gardé par `_mounted` pour qu'un sous-arbre réattaché ne déclenche qu'une fois.
   - `s._registerActiveDriverSubtree(child)` — reprend tout driver batché que le sous-arbre avait en vol à la détache (miroir du unregister de `remove`).

Plusieurs enfants (`add(a,b,c)`) s'attachent dans l'ordre des arguments avec la même sémantique.

### 2.3 remove — détachement avec désenregistrement des drivers

`Entity.remove(child)` (`:1117`) est `indexOf` + `splice` :

1. `child.parent = null`.
2. `s.detachA11y(child)` + `a11yNeedsReorder`.
3. `s.markStructureChanged()` + `markDirty({ reason: 'child-removed' })` (`:1123`).
4. `s._unregisterActiveDriverSubtree(child)` — retire le sous-arbre hors-arbre de `DriverTicker.active` pour que ses drivers cessent de ticker et de retenir des entités. Le miroir `_addOne` les reprend s'ils sont réattachés avant stabilisation.

Retirer un non-enfant est un no-op (retourne `this`). Il n'y a pas de `removeAll()` — itérez ou `destroy()`.

### 2.4 destroy — démontage récursif feuilles d'abord

`Entity.destroy()` (`:1525`) — idempotent via garde `_destroyed` :

```ts
while (this.children.length > 0) this.children.at(-1)!.destroy();
animations = null;
for (const d of this._drivers.values()) this._settleDriver(d); // resolve animateTo promises
this._drivers.clear();
listeners.clear();
captureListeners.clear();
if (this.parent) this.parent.remove(this);
```

- Feuilles d'abord (destroy depuis la queue) pour que chaque `parent.remove(this)` de l'enfant mute la queue en cours d'itération — pas de snapshot, pas de décalage d'index.
- Les sous-classes possédant des ressources GPU/DOM surchargent, libèrent la ressource, puis appellent `super.destroy()` (`ComputeParticleEntity.ts:419`, `DOMPortalEntity.ts:142`).
- Règlement des promesses via `_settleDriver` (`:1329`) résout les appelants `animateTo`/`springTo` au lieu de les laisser en suspens pour toujours.

`Scene.destroy()` (`Scene.ts:2957`) ajoute le jumeau au niveau scène :

- Garde `if (destroyed) return` (`:2958`), pose `destroyed = true`.
- `while (root.children.length) destroyEntitySubtree(root.children.at(-1)!)` et idem pour `overlayRoot` (`:2964`), chacun déléguant à `entity.destroy()` (`:2951`).
- Démontage de `pointRenderer`, `WebGPU device/manager`, `ResizeObserver`, watch DPR, listeners pointeur (détachés de `pointerEventTarget`), `a11yRoot`/`portalRoot`, et clear `keydownHandlers/shortcuts`.
- Idempotent — `start()` retourne tôt quand `destroyed` (`:3143`), et la récupération device WebGPU vérifie `if (destroyed) newDevice.destroy()` (`:5813`).

Une entité `destroy()`-ed ne doit jamais être ré-ajoutée — son flag `_destroyed` rend tout nouveau `destroy()` no-op mais son `parent` est déjà null et ses enfants partis.

## 3. Granularité Dirty / invalidation

### 3.1 Le flag booléen et son attribution

`Scene.dirty: boolean` (`Scene.ts:534`) est le seul signal d'ordonnancement. `onDemand` saute le rendu quand `!dirty && !frameHadAnimation && !contentSemanticDeferred` (`Scene.ts:5594` `isIdle`) ; `always` rend à chaque rAF sauf si `autoThrottle` retombe à `idleFPS`.

L'ownership est réparti selon l'en-tête `DirtyTracker.ts:2` :

- `DirtyTracker` (`scene/DirtyTracker.ts:70`) possède le flag (`isDirty`), la map d'attribution opt-in et sa borne FIFO (`MAX_DIRTY_REASONS = 200` à `:71`).
- `Scene.markDirty(source?)` (`Scene.ts:3443`) garde son nom/signature exacts et délègue à `_dirty.mark(source, currentFrame)` — 129 sites d'appel dans `Entity.ts` dépendent de `scene.markDirty()` (`DirtyTracker.ts:33`).
- `Scene._dirty: DirtyTracker` (`Scene.ts:1220`) avec getter/setter privé (`:1229`) — `set dirty(true)` appelle `mark(undefined, currentFrame)`, `set dirty(false)` appelle `clear()`.

Coût hot-path (`DirtyTracker.ts:47`) : quand `tracking` est désactivé, `mark()` est une écriture de champ (`isDirty = true`) plus une branche déjà-fausse. `record()` est une méthode séparée pour que V8 inline la version à un champ.

### 3.2 Quand le flag est posé et quand il est consommé

**Posé** — des dizaines de sites, chacun avec une chaîne `reason` pour l'attribution :

- `Entity.add` → `child-added` (`:1086`), `remove` → `child-removed` (`:1123`), `animate` → `animation-start`, `_spawnDriver` → `driver-added` (`:1305`), `tickDrivers` → `driver-tick` (`:1389`), `ComputeParticleEntity` → `markDirty()` par mutation de particule (`ComputeParticleEntity.ts:113`).
- `Scene` elle-même : changements de style, resize, chargement de fonte (`:2717`), réordonnancement a11y (`:3674`), scroll (`:3931`).

**Consommé** — `Scene.loop` (`:5569`) fait `this.dirty = false` **avant** la passe `update/render` (`:5650`). Tout `markDirty()` à l'intérieur de `entity.update()` survit à la frame suivante ; clearer après le rendu effacerait les ré-armements auto-animés et figerait l'entité (`DirtyTracker.ts:98`). `Scene.step(dt)` (`:3420`) est l'exception — il rend inconditionnellement (ni `renderMode` ni `dirty` consultés, contrat `DirtyTracker.ts:33`) et clear après (`:3434`), puisque le déterminisme est l'objectif.

### 3.3 Attribution — trouver ce qui maintient une scène onDemand éveillée

Désactivé par défaut. Activez avec `scene.setDirtyTracking(true)` (`Scene.ts:3475`), exécutez, puis lisez `scene.dirtyReasons: DirtyReasonEntry[]` (`:3489`, trié du plus fréquent au moins). Chaque entrée est `{ entity?, reason, property?, count, firstFrame, lastFrame }` (`DirtyTracker.ts:59`). La clé est `entity:reason.property` (`:120`). FIFO bornée — la plus ancienne éjectée à 200 (`:127`). Effacez avec `scene.clearDirtyReasons()` (`:3495`). Le diagnostic `onDemand` qui était « dirty est true, aucune idée pourquoi » est désormais une table triée.

`structureVersion` (`Scene.ts:3462`, adossé à `_structureVersion` à `:1636`) est le signal compagnon : add/remove/reparent l'incrémentent ; les changements de propriétés non. Un cache de forme d'arbre est valide exactement tant que cette valeur est inchangée — O(1) vs re-walk.

## 4. Composition de la world-matrix

### 4.1 L'affine et son cache

`AffineTransform { a,b,c,d,e,f }` (`Entity.ts:33`) correspond à `CanvasRenderingContext2D` — `T * S * R` par nœud, six scalaires.

`getWorldTransform(): AffineTransform` (`Entity.ts:1668`) a deux chemins :

**Fast path** — cache par frame écrit par le walk de rendu de Scene (`_setWorldCache` à `:1784`, tamponnant `_wa.._wf` et `_worldFrame`). Si `_worldFrame === scene.currentFrame` (`:1672`), retourner les six scalaires verbatim — pas de walk, pas d'allocation au-delà de l'objet retourné. Un cache périmé (entité non rendue cette frame, ou interrogée entre frames) échoue le check et retombe ; le cache ne peut qu'éviter du travail, jamais retourner une mauvaise matrice.

**Walk autoritaire** — construire `path: Entity[]` de `this` jusqu'à la vraie racine (`parent === null`, pas `id === 'root'` — modifiable par l'utilisateur, `:1690`), puis composer racine→soi :

```ts
for (let i = path.length - 1; i >= 0; i--) {
  const { cos, sin } = node._getTrig(); // cached, :1746
  const la = scaleX * cos,
    lb = scaleY * sin,
    lc = -scaleX * sin,
    ld = scaleY * cos;
  const le = x,
    lf = y;
  nextA = a * la + c * lb;
  nextB = b * la + d * lb;
  nextC = a * lc + c * ld;
  nextD = b * lc + d * ld;
  nextE = a * le + c * lf + e;
  nextF = b * le + d * lf + f;
}
```

`_getTrig()` (`:1746`) met en cache `{cos, sin}` et ne recompute que quand `rotation` a changé (check `_trigRotation`) — `Math.cos/sin` de V8 est ~2,5× plus lent que les autres moteurs, et ceci est par-entité-par-frame. `_readWorldCache(frame, out)` (`:1647`) est le frère à zéro allocation pour les gathers par entité (ex. `gatherHitAABBs` de G3) — six lectures scalaires dans un `out` appartenant à l'appelant au lieu d'un objet par entité.

L'invalidation est O(1) : `Scene.render` incrémente `currentFrame++` (`:5806`) au début du walk autoritaire, donc le cache de chaque entité est périmé en un incrément sans toucher les entités.

### 4.2 Chemin WASM G1 — le store SoA des transforms

Quand le backend des transforms est actif (`transformBackend: 'wasm'` / `'auto'` avec module chargé), `Scene` maintient un store SoA résident (`WasmBackendFacade.ts:228` `structureVersion`, `scene-store.ts:buildTreeStore`). Sur `markStructureChanged`, le store reconstruit sa topologie (indices parents, assignation de slots) ; chaque `Entity._storeSlot` (`:865`) est alors assigné et validé contre la table des slots avant confiance. Par frame, `ensureAabbs()` compose toutes les world matrices en une seule passe WASM sur les buffers SoA — la même math `T·S·R`, bit-identique au walk JS. Le fused gather de hit-test (`HitTester.ts:144`) préfère `transform.aabbView()` quand disponible, retombant sur le `gatherHitAABBs` JS (`wasm/hit-store.ts:47`) qui appelle `getWorldTransform()` par entité. Un `_storeSlot` périmé ne coûte qu'un fallback JS, jamais une lecture fausse.

### 4.3 Requêtes dérivées

- `localToWorld(x,y)` (`:1784`) / `worldToLocal(x,y)` (`:1796`) — applique/inverse la world matrix ; `worldToLocal` retourne `null` sur déterminant singulier (`|det| < 1e-12`).
- `getWorldBounds()` (`:1819`) — `getBounds() ?? {x:0,y:0,width,height}` transformé par quatre coins, produisant la world AABB utilisée pour le culling et l'entrée de la hit-grid.
- `getWorldScale()` (`:1850`) — multiplie `scaleX/scaleY` en remontant la chaîne des parents (ignore la rotation — pour l'inverse du hit-test uniquement).

## 5. Dispatch des événements — capture / bubble et ownership du pointeur

### 5.1 VectoJSEvent

`VectoJSEvent<N>` (`Entity.ts:607`) reflète la surface DOM : `type: VectoEvent` (`:538`, `click | dblclick | hover | pointerdown/up/move/cancel/leave | wheel | keydown/keyup | scroll | change | ...`), `target: Entity`, `currentTarget: Entity` (posé par nœud pendant le dispatch), `nativeEvent: N | undefined`, `bubbles: boolean` (défaut `true` ; `hover`/`pointerleave` sont `false`), plus `stopPropagation()`, `stopImmediatePropagation()`, `preventDefault()`, et `clientX/Y`, `sceneX/Y`, `localX/Y`, `deltaX/Y`, `key/shiftKey/ctrlKey/altKey/metaKey` relayés.

### 5.2 Enregistrement

`Entity.on(event, cb, { capture })` (`:1470`) et `off(event, cb, { capture })` (`:1485`) :

- Deux maps allouées paresseusement : `listeners` (bubble) et `captureListeners` (`:1030`), chacune `Map<VectoEvent, Array<cb>>`.
- `capture: true` enregistre sur `captureListeners` ; défaut est bubble. `off` doit correspondre à la phase.
- `emit(event, payload)` (`:1540`) est le chemin direct self-only (listeners bubble uniquement, pas de propagation) — pour les événements `change` internes au composant. `dispatchEvent` est le chemin d'arbre.

### 5.3 Dispatch — capture puis bubble

`Entity.dispatchEvent(event)` (`:1610`) :

1. Construit `path: Entity[]` target→root via chaîne `parent`.
2. Capture : root→target (`for i = path.length-1 .. 0`) déclenchant `captureListeners` (`:1618`). Vérifie `propagationStopped` avant chaque nœud.
3. Bubble : target→root (`for i = 0 .. path.length-1`) déclenchant `listeners` (`:1622`). `if (!event.bubbles) return` après la target — les événements non-bubbling exécutent quand même la capture mais seulement le bubble de la target.
4. `fireListeners(node, map, event)` (`:1595`) snapshot `handlers.slice()` pour qu'un handler ajoutant/supprimant des listeners mid-dispatch ne perturbe pas la passe, et honore `immediatePropagationStopped`.

La projection a11y de Scene câble les événements DOM natifs dans cet arbre : listeners par miroir dans `Scene.ts:3802` (`click`, `dblclick`, `pointerdown/up/cancel/move`, `wheel`, `keydown/keyup`) font chacun `node.dispatchEvent(new VectoJSEvent(type, node, nativeEvent))`. `scroll` (`:3912`) est spécial — il ne bubble pas dans le DOM, donc Scene fait `node.emit('scroll', { scrollTop, scrollLeft, ... })` (`:3920`) directement à l'entité propriétaire.

Le clavier au niveau Scene (`Scene.ts:3272` `on('keydown'|'keyup')`) est un canal séparé — pas de target d'entité, `stopPropagation()` forward au native event (`scene/keyboard.ts:79`), et `registerShortcut(chord, handler)` matche seulement sur `keydown`.

### 5.4 Ownership du pointeur

`pointerdown` sur un élément fantôme capture le pointeur (`Scene.ts:3851`) :

```ts
if (e.target === capEl && typeof capEl.setPointerCapture === 'function')
  capEl.setPointerCapture(e.pointerId);
```

La garde `e.target === capEl` est structurante : un `pointerdown` bubblé dont la target est un descendant ne doit pas re-capturer — le descendant le possède déjà, et un ancêtre qui écrase re-cible `pointerup` + `click` vers l'ancêtre commun (mesuré comme des options Dropdown dont les clics atterrissaient sur le conteneur listbox, `Scene.ts:3844`). `pointerup`/`pointercancel` release via `releasePointer` (`:3831`) gardé par `hasPointerCapture(pointerId)` et attrapant `NotFoundError` DOMException. `pointerEvents: 'none'` (`Entity.ts:431` `a11yAttributes.pointerEvents`) retire un nœud du hit-testing sans affecter les enfants — voir §6.3.

## 6. Hit testing — deux chemins qui doivent s'accorder

`Scene.findEntityAt(x, y)` (`Scene.ts:2777`) délègue à `HitTester.findEntityAt(x, y, currentFrame, width, height)` (`HitTester.ts:121`) :

1. Overlay root d'abord — toujours `findHitRecursively` (les overlays sont peu nombreux, jamais indexés WASM).
2. Arbre principal — si `backends.hit` et `ensureHitGrid(frame, width, height)` (`:144`) réussissent, `findEntityAtWasm` (`:185`) ; sinon `findHitRecursively` (`:227`). Le chemin WASM est conclusif — entité correcte ou `null`, jamais « non concluant » — donc aucun fallback JS ne suit une grille fiable.

`findHitRecursively(node, x, y, clip)` (`:227`) :

- Saute les sous-arbres `opacity <= 0` (opacité accumulée).
- `clipChildren` intersecte dans `childClip` via `intersectBounds` (`:32`) — passé vers le bas, le nœud lui-même reste testable contre le clip entrant.
- Enfants en ordre de rendu inverse (le plus haut d'abord).
- Le nœud est hit ssi `isPointInside(x,y) && isInsideAllClippers(node,x,y) && !isPointerTransparent(node)`.

`isInsideAllClippers` (`:284`) est la porte autoritaire sensible à la rotation — chaque ancêtre `clipChildren` doit voir `worldToLocal(x,y)` tomber dans `[0, width]×[0, height]`. La pile de clips AABB du walk n'est qu'un pré-filtre d'élagage de sous-arbre ; les deux chemins hit doivent ré-appliquer le rect exact sinon un clipper pivoté donne des réponses différentes par backend (#680).

`isHitEligible(node,x,y)` (`:326`, chemin WASM) réapplique le même gating à plat : `!isPointerTransparent`, `opacity>0` sur le nœud et chaque ancêtre, et `isInsideAllClippers`. `isPointerTransparent` (`:284`) est `attrs.disabled === true || attrs.pointerEvents === 'none'` (`Entity.ts:431`) — les enfants d'un conteneur transparent sont quand même parcourus.

## 7. Ordonnancement du rendu — où dirty rencontre la boucle

`Scene.loop(time)` (`Scene.ts:5569`) tourne sur `requestAnimationFrame` :

1. Bail si `!_canvasOnScreen` (IntersectionObserver) — `markDirty()` caché est inoffensif, le flag persiste.
2. Calcule `isIdle = !dirty && !frameHadAnimation && !contentSemanticDeferred` (`:5594`) — pilote à la fois le skip `onDemand` et l'auto-throttle `always` vers `idleFPS`.
3. `effectiveMaxFPS()` (`:5556`) — `maxFPS` explicite abaissé à `30` quand `prefersReducedMotion` matche.
4. Cap de frame-rate : `if (cap>0 && time - lastTime < 1000/cap -1) skip` (`:5605`).
5. Snap `dt` au nominal `1000/cap` quand à 30% près pour supprimer le jitter du compositeur ; clamp à `MAX_FRAME_DT` pour éviter l'explosion des springs après un onglet en arrière-plan (`:5630`).
6. `onDemand && isIdle → skip` (`:5640`).
7. `dirty = false` **avant** `render()` (`:5650`) — voir §3.2.
8. `render(renderer, dt, time)` (`:5730`) — incrémente `currentFrame`, tick les drivers batchés (`_tickBatchedDrivers`), avance la simulation de particules, parcourt les entités.
9. Sync de projection a11y/content après le rendu — entièrement sautée tant que `frameHadAnimation` (évite que le reflow DOM ne brasse la boucle canvas).

`Scene.step(dt)` (`Scene.ts:3420`) est le driver déterministe synchrone (export vidéo, tests, benchmarks) — rend inconditionnellement sans consulter `renderMode`/`dirty`/`maxFPS`, et clear `dirty` après. Un benchmark pilotant `step()` ne peut observer le skipping `onDemand` (`Scene.ts:3406` doc).

## 8. Parties difficiles — avec preuves

### 8.1 Les walks d'ancêtres sont en O(depth) et ils sont nombreux

`getWorldTransform`, `getWorldScale`, `isInsideAllClippers`, `isHitEligible`, construction du path `dispatchEvent`, getter `Entity.scene` — chacun remonte `parent` jusqu'à la racine. La profondeur est typiquement faible (Stack → Card → RichText), donc O(depth) est bon marché par appel, mais le hit-testing et le walk de rendu l'appellent par entité par frame. Trois atténuations :

- **Cache par frame** (`_worldFrame` / `currentFrame`, `:845`/`5806`) — invalidation O(1), fast path quand le walk de rendu a déjà tamponné la matrice. `getWorldTransform` ne retombe sur le walk qu'en cas de miss.
- **Lecture à zéro allocation** (`_readWorldCache`, `:1647`) pour les gathers comme `gatherHitAABBs` — six lectures scalaires dans un objet appartenant à l'appelant au lieu d'une allocation par entité. Le benchmark intégré G2 a trouvé que l'allocation de closure par entité était un coût réel (en-tête `DriverTicker.ts:40`).
- **Store WASM SoA** (G1) — une passe linéaire sur typed arrays au lieu de walks par entité ; le fused gather `ensureHitGrid` (`HitTester.ts:144`) réutilise `transform.aabbView()` pour éviter de re-dériver quatre coins par entité (le gather JS faisait 11,2 ms vs 39 µs à 100 k entités, essentiellement tout devant le kernel).

Pourtant, insérer une chaîne de 500 de profondeur et appeler `getWorldTransform` en boucle serrée sera O(n·depth). Gardez les arbres larges, pas profonds.

### 8.2 Coût des transforms — le piège cos/sin

`Math.cos/sin` sur V8 est un appel libm logiciel, ~2,5× plus lent que les autres moteurs (en-tête `Entity.ts:828`). `Entity._getTrig()` (`:1746`) met en cache la paire et ne recompute que sur changement de rotation ; `getWorldTransform` et le walk de rendu le lisent tous deux. Sans cela, une scène avec beaucoup de particules en rotation (Danmaku) paie le coût libm par entité par frame pour un angle inchangé. Le flag `_hasTransitions` (`:812`) est la même classe de micro-optimisation — la plupart des entités n'animent jamais, donc `x = v` ne doit pas toucher les maps de transitions/drivers.

### 8.3 Fuites de cycle de vie — les trois récurrentes

**Fuite driver-subtree.** `DriverTicker.active: Set<Entity>` (`DriverTicker.ts:84`) est l'ensemble candidat au batch. `Entity.add` enregistre le sous-arbre (`:1087` miroir) et `remove` le désenregistre (`:1130`). Si l'un des appels est manqué — ex. un conteneur custom qui mute `children` directement au lieu de via `add`/`remove` — les drivers continuent de ticker hors-arbre chaque frame et retiennent des entités dans le Set. Audit : cherchez `children.push/splice` direct hors `Entity.ts`.

**Garde destroyed.** `Entity.destroy()` (`:1525`) pose `_destroyed` d'abord, puis récursion. Un second `destroy()` est no-op ; un `destroy()` qui ré-entre via `onMounted` d'un enfant ou `onDone` d'un driver voit le flag et s'arrête. `Scene.destroy()` (`:2957`) pose `destroyed` avant de démonter les enfants, et chaque callback async (récupération device WebGPU `:5813`, boucle `requestAnimationFrame` `:5569`) vérifie `if (destroyed) return/newDevice.destroy()`. Manquer la garde ressuscite une scène à moitié démontée ou fuit un device GPU à travers les changements de route SPA.

**Fuite a11y / portal.** `remove` appelle `detachA11y(child)` (`:1117`) et `destroy` appelle `removeA11yRecursively` via `A11yProjectionManager.ts:227`. Le `contentSemanticBudget` et `contentViewportEpoch` de la projection garantissent que les carriers/état de projection d'une entité retirée ne sont pas retenus à travers les walks `syncA11y`. Oublier `detachA11y` laisse un élément fantôme transparent qui capture encore les événements pointeur et apparaît dans `getA11yTree()`.

### 8.4 Le piège de décomposition render-scheduler

`Scene.ts` fait ~6,5 k lignes parce que quatre domaines partagent un état mutable de frame : `DirtyTracker` (`DirtyTracker.ts:70`), `DriverTicker` (`DriverTicker.ts:57`), `HitTester` (`HitTester.ts:17`) et `WasmBackendFacade` (`WasmBackendFacade.ts:1`) ont été extraits selon `forge/decisions/file-decomposition-2026-08.md`, mais `loop`/`render` et la géométrie `a11yRoot`/`canvas` restent sur Scene. `Scene._updateWalkDt` (`:5806`) est publié pour le tick de rattrapage mid-walk de `Entity._spawnDriver` — un driver spawné après que la passe batch a revendiqué l'entité attendrait sinon jusqu'à la frame suivante sur le chemin WASM mais tickerait même frame sur le chemin JS. Séparer `loop` sans porter `dt`/`currentFrame`/`frameHadAnimation` ensemble viole la règle 5 de `DEC-0019`.

## 9. Invariants que les développeurs doivent préserver

1. **Ne jamais muter `children` sauf via `add`/`remove`/`destroy`.** Une mutation directe du tableau saute `markStructureChanged`, `markDirty`, l'enregistrement des drivers et le detach a11y — les quatre invariants cassent silencieusement. Grep `\.children\.push|\.children\.splice` hors `Entity.ts`.
2. **Vérifier `destroyed` avant de planifier du travail.** Tout `requestAnimationFrame`, `setTimeout`, `ResizeObserver` ou promesse WebGPU qui touche `scene` ou `entity.scene` doit garder `if (destroyed) return`. La doc `destroy()` à `Scene.ts:3137` est explicite.
3. **Respecter le contrat dirty.** Les scènes `onDemand` dorment jusqu'à `markDirty()` ou un driver actif. Muter `x/y/scale/rotation/opacity/width/height` hors `Entity.animate`/`setTransition` sans `markDirty({ reason })` laisse le changement invisible. À l'inverse, un `markDirty` par frame (ex. `update()` se ré-armant) maintient `onDemand` éveillé — utilisez `scene.dirtyReasons` (`:3489`) pour trouver le `reason` qui déclenche chaque frame.
4. **Garder les portes de hit-test en lockstep.** Toute nouvelle condition de visibilité/input/clip doit être ajoutée à la fois à `findHitRecursively` (`HitTester.ts:227`) et `isHitEligible` (`:326`). Une condition dans un seul fait diverger les chemins WASM et JS — l'accélérateur devient générateur de bugs.
5. **Pointer capture uniquement sur `e.target === capEl`.** La garde `Scene.ts:3851` n'est pas optionnelle. La retirer casse chaque menu Dropdown/Select dont les options sont enfants de l'élément capturant.
6. **Les consommateurs de world-matrix doivent gérer le cas cache périmé.** `getWorldTransform()` ne peut retourner une matrice en cache que pour `currentFrame` ; entre frames ou pour une entité hors-arbre elle walk. Les appelants `_readWorldCache` doivent retomber sur le walk complet quand il retourne `false` (commentaire fused-gather `HitTester.ts:144`).
7. **Versionner les métriques, ne pas balayer.** Les changements de fonte/DPR/viewport invalident tout `scaleX`/calibration via compteurs de génération (`ContentProjectionManager.ts:524`), pas en touchant chaque carrier. Même pattern pour `structureVersion` sur les caches de forme.

## 10. Checklist de debug — quand la scène s'affiche mal

- **Rien ne rend après une mutation en mode `onDemand`** → `dirty` est-il encore `false` ? Activez `scene.setDirtyTracking(true)`, mutez, lisez `scene.dirtyReasons`. Un `markDirty` manquant est la cause dans ~90% des cas. Vérifiez `scene.frameStats.dirty` (`Scene.ts:3528`) dans les devtools.
- **Cibles hit fantômes après `remove()`** → `children` a-t-il été muté directement ? Vérifiez le bump `structureVersion` et la fraîcheur `HitTester.ensureHitGrid` (`hitGridStructureVersion` vs `structureVersion`). Une grille périmée avec `hitGridOk=true` sert de mauvais candidats.
- **Le driver continue après retrait du sous-arbre** → la taille `DriverTicker.active` devrait baisser. Inspectez la porte `scene._tickBatchedDrivers` — `unregisterSubtree` à `DriverTicker.ts:101` parcourt tout le sous-arbre, donc un sous-arbre détaché très profond paie O(sous-arbre) au retrait, pas par frame.
- **Transform diverge JS vs WASM** → comparez `entity.getWorldTransform()` (walk JS) contre slot `transform.aabbView()`. Un `_storeSlot` périmé (`Entity.ts:865`, `-1` hors store) ne cause qu'un fallback JS lent correct, jamais une mauvaise matrice — si les matrices diffèrent, la reconstruction de topologie a manqué un `markStructureChanged`.
- **L'événement se déclenche deux fois ou pas du tout** → vérifiez le flag `bubbles` (`VectoJSEvent.ts:607`) et si le listener est sur `captureListeners` vs `listeners`. Les non-bubbling `hover`/`pointerleave` ne déclenchent qu'à la target en phase bubble.
- **Le spring explose au refocus d'onglet** → `loop` clamp `dt` à `MAX_FRAME_DT` (`Scene.ts:5630`). Si un `step(dt)` custom nourrit un énorme `dt` directement à `tickDrivers`, le même clamp doit être appliqué par l'appelant.

---

_Série : 00 Overview → 01 Selection → 02 Text+Layout → 03 Projection+Virtualization → 04 Streaming Markdown → 05 TeX → **06 VMT Runtime** → 07 Renderer → 08 WASM G1/G2/G3 → 09 Three/XR → 10 Video Export → 11 Graph Layout → 12 DevTools → 99 Synthèse._
