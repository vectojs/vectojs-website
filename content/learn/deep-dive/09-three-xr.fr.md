+++
title = "09 — Pont Three.js / XR — Deux mondes de coordonnées"
description = "L'adapter entre le contrat canvas 2D de VectoJS et l'espace 3D de Three.js : panneaux CanvasTexture, mapping raycast→UV→scène, ownership focus/clavier offscreen, et comment Graph3D montre le pendant pure-Three."
weight = 29
+++

# 09 — Pont Three.js / XR — Deux mondes de coordonnées

> **Boss 09** vit là où deux modèles d'entrée entrent en collision. VectoJS rend une scène 2D en pixels logiques avec un DOM a11y transparent qui possède le dispatch pointeur et clavier ; Three.js rend une scène WebGL où un pointeur est un rayon et un panneau est un quad texturé flottant dans l'espace monde. `ThreeAdapter` est la seule pièce qui parle les deux.

- **Ce que vous apprendrez** : pourquoi l'adapter est un pont de systèmes de coordonnées, pas un renderer ; le chemin texture `CanvasTexture` et son proxy `needsUpdate` ; comment les UV du `Raycaster` mappent vers les pixels logiques (et le piège DPR) ; comment les entrées pointer, wheel, hover, focus et l'ownership clavier sont re-routés à travers un canvas offscreen ; et comment `Graph3D`/`GraphCamera`/`GraphInteraction` démontrent l'alternative pure-Three.
- **Ce que vous n'apprendrez pas** : le contrat `IRenderer` lui-même (boss 07), la rastérisation texte et les détails ortho y-down (boss 07 §Text raster paths), l'accélération WASM (boss 08) ou le tuning force-layout 2D (boss 11). Ce doc est la couture _entre_ le contrat 2D de VectoJS et un hôte 3D.

## 1. Pourquoi l'adapter est difficile — deux mondes, un seul canvas

Une `Scene` VectoJS normale possède un `<canvas>` inséré dans la page. Ses miroirs a11y sont appendus à l'`a11yRoot` de ce canvas (un `<div>` empilé au-dessus du canvas), et le dispatch pointeur/clavier passe par ces miroirs (`Scene.ts:3512` listeners par miroir). Dans le pont le canvas est **offscreen** — il n'est jamais inséré dans le document, il est échantillonné comme texture GPU.

Ce seul fait cascade :

| monde       | qui possède l'entrée                                | où vivent les pixels                    | qui possède le focus                                                                     |
| ----------- | --------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| VectoJS 2D  | DOM a11y projeté (listeners par miroir de `Scene`)  | backing store `canvas.width/height`     | `document.activeElement` + `Scene.focusedA11yElement` (`Scene.ts:1446`)                  |
| Three.js 3D | `THREE.Raycaster` + listeners `window`/`domElement` | `CanvasTexture` sur une `PlaneGeometry` | Three n'a pas de focus DOM ; l'hôte `OrbitControls` ou `GraphCamera` possède le pointeur |

`ThreeAdapter` (`packages/three/src/ThreeAdapter.ts:90`) doit faire qu'une scène 2D qui se croit à l'écran se comporte correctement alors que ses pixels sont derrière un hit-test 3D et que ses miroirs sont durablement déconnectés de `document`.

L'autre module du package, `ThreeRenderer` (`packages/three/src/ThreeRenderer.ts:216`), est une autre réponse au même prompt : il _est_ un `IRenderer` (contrat `IRenderer.ts:41`) qui rend les entités VectoJS avec Three.js au lieu de `CanvasRenderingContext2D`. L'adapter enveloppe une Scene-as-texture ; le renderer remplace le contexte 2D. Ils partagent la même ortho y-down et les pièges DPR (boss 07) mais ont un ownership opposé : le `vectoScene` de l'adapter rend toujours avec `CanvasRenderer` par défaut, le `scene/camera/renderer` du renderer (`ThreeRenderer.ts:219`) rend les entités directement.

## 2. Le chemin texture — des pixels VectoJS vers un quad Three.js

```ts
// packages/three/src/ThreeAdapter.ts:125 — construction (abbreviated)
this.canvas = optCanvas ?? (document ? document.createElement('canvas') : offscreenFallback);
this.vectoScene = new VectoScene(this.canvas, { disableWindowResize: true, ...sceneOptions });
this.texture = new THREE.CanvasTexture(this.canvas);
this.texture.minFilter = THREE.LinearFilter; // ThreeAdapter.ts:151
this.texture.magFilter = THREE.LinearFilter; // ThreeAdapter.ts:152
this.vectoScene.render = (renderer, dt, time) => { originalRender.call(...); this.texture.needsUpdate = true; }; // ThreeAdapter.ts:157
this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false })); // ThreeAdapter.ts:163
```

Notes de conception avec `file:line` :

- **Ownership du canvas offscreen** — `ThreeAdapter.ts:122` `_ownsCanvas` trace si l'adapter a créé le canvas. `dispose()` (`ThreeAdapter.ts:750`) ne met `canvas.width/height` à zéro que quand il possède le canvas ; un canvas fourni par l'appelant est laissé tel quel. Le fallback SSR (`ThreeAdapter.ts:78` `OffscreenCanvasFallback`) explicite exactement quels membres existent quand `document` est undefined — un simple `{width,height} as HTMLCanvasElement` masquait auparavant ce contrat.
- **Le resize est manuel** — `sceneOptions.disableWindowResize = true` (`ThreeAdapter.ts:140`) car une `Scene` plein-fenêtre adopte automatiquement `window.innerWidth/Height` (`Scene.ts:2284`). Une scène adossée à une texture ne doit pas suivre la fenêtre ; l'hôte appelle `adapter.resize(w,h)` (`ThreeAdapter.ts:713`) qui redimensionne le backing store, le viewport Scene et marque `texture.needsUpdate`.
- **Upload gaté par dirty** — le proxy render (`ThreeAdapter.ts:155`) pose `texture.needsUpdate = true` uniquement quand la Scene a réellement redessiné. Une boucle `Scene.renderMode: 'always'` continue uploade chaque frame ; une Scene `onDemand` n'uploade que quand `markDirty()` a déclenché — ce que chaque chemin d'entrée fait (`ThreeAdapter.ts:270`, `ThreeAdapter.ts:612`).
- **Le mesh par défaut est une commodité, pas une prescription** — `mesh` est une `PlaneGeometry(1,1)` unitaire (`ThreeAdapter.ts:163`). Les hôtes qui ont besoin d'écrans courbes, billboards ou dashboards VR remplacent la géométrie/matériau et gardent la `texture`. Le mesh n'est pré-ajouté à aucune scène ; l'hôte fait `scene3d.add(adapter.mesh)`.
- **Hygiène de disposal** — `dispose()` (`ThreeAdapter.ts:723`) restaure `vectoScene.render` vers `_originalRender` (`ThreeAdapter.ts:730`) _avant_ de détruire la Scene, sinon une référence survivante poserait `needsUpdate` sur une texture supprimée et Three logguerait `trying to use deleted texture`. Il dispose ensuite `texture`, `geometry`, `material`(s), retire `mesh` de son parent, appelle `vectoScene.destroy()`, clear `activePointers`, drop `_focusedEntity` sans émettre (les miroirs n'existent plus) et met le canvas à zéro seulement si owned.

`ThreeRenderer` est le chemin texture alternatif — pas de canvas adapter du tout. Il possède sa propre `THREE.Scene` + `THREE.OrthographicCamera(0,width,0,height)` + `THREE.WebGLRenderer({canvas, alpha:true, antialias:true})` (`ThreeRenderer.ts:256`). Son ortho y-down, le clamping `effectiveDPR`/`pixelRatio`, la récupération de perte de contexte et le report `present()` sont couverts au boss 07 ; les faits spécifiques au pont sont qu'il implémente `IRenderer` donc tout `Entity.render(r)` tourne inchangé, et ses caches `fillText`/`drawImage` cléfient sur `dpr` et la phase `x,y` arrondie (`ThreeRenderer.ts:1002`).

Internes pertinents pour le pont à nommer pour ne pas les redécouvrir :

- **DPR** — `effectiveDPR()` (`ThreeRenderer.ts:309`) est `min(real DPR, maxDPR)` et `pixelRatio` (`ThreeRenderer.ts:324`) est le `renderer.getPixelRatio()` live, pas un snapshot. `Scene` synchronise `maxDPR` sur le renderer à chaque `resize` (`Scene.ts:286`) ; `ThreeRenderer.resize` (`ThreeRenderer.ts:355`) ré-applique le ratio clampé avant `setSize`/`updateProjectionMatrix`. Une texture cléée sur `window.devicePixelRatio` au lieu de `pixelRatio` floute sur un display clampé.
- **Perte de contexte** — `webglcontextlost` est `preventDefault` (`ThreeRenderer.ts:281`) pour que `webglcontextrestored` puisse tirer ; le handler de restauration ré-applique `effectiveDPR`, re-dimensionne, marque `frameDirty` et `present()` dans le framebuffer clearé (`ThreeRenderer.ts:285`). `dispose()` détache les deux listeners et appelle `renderer.forceContextLoss()` (`ThreeRenderer.ts:1186`) pour que les remontages SPA ne fuient pas de contextes GL vivants.
- **Conséquences y-down** — chaque primitive remplie a besoin de `side: DoubleSide` (`ThreeRenderer.ts:596` fill, `:658` drawImage, `:1049` fillText) et `texture.flipY = false` (`ThreeRenderer.ts:628` drawImage, `:1035` fillText) ; sans les deux, les faces FrontSide sont cullées et images/texte sont à l'envers sous l'ortho y-down (`ThreeRenderer.ts:250`).
- **Caches** — `textTextureCache` (`ThreeRenderer.ts:911`) et `imageTextureCache` (`ThreeRenderer.ts:599`) sont cléés par identité, évincés LRU à `256` (`ThreeRenderer.ts:635`, `:1040`), flaggés `userData.vectoCached` pour que le `disposeActiveObjects` par frame (`ThreeRenderer.ts:380`) les saute, et `drawImage` ré-insère au hit pour l'ordre LRU (`ThreeRenderer.ts:641`). Les sources canvas mutables doivent appeler `invalidateImage` (`ThreeRenderer.ts:602`).

## 3. Mapping des coordonnées — UV → pixels logiques (et les trois pièges)

### 3.1 L'entrée raycast

```ts
// packages/three/src/ThreeAdapter.ts:181
public updateIntersection(raycaster: THREE.Raycaster, type, originalEvent?): boolean {
  const intersects = raycaster.intersectObject(this.mesh); // ThreeAdapter.ts:186
  if (intersects.length > 0 && hit.uv) {
    state.lastUv.copy(hit.uv);
    this.dispatchAtUv(type, hit.uv, pointerId, originalEvent);
  } else if (state.isHovering) {
    this.dispatchAtUv('pointerleave', state.lastUv, pointerId, originalEvent); // ThreeAdapter.ts:209
  }
}
```

L'appelant possède le `Raycaster` — typiquement `raycaster.setFromCamera(ndc, camera)` où `ndc` est `((clientX/width)*2-1, -((clientY/height)*2-1))`. C'est la forme `GraphInteraction.setPointerFromEvent` (`packages/graph3d/src/GraphInteraction.ts:157`) et `GraphCamera` wheel zoom (`packages/graph3d/src/GraphCamera.ts:363`).

### 3.2 UV vers pixels de scène — logique, pas backing store, y inversé

```ts
// packages/three/src/ThreeAdapter.ts:240
private dispatchAtUv(type: VectoEvent, uv: THREE.Vector2, ...): void {
  const px = uv.x * this.vectoScene.width;        // ThreeAdapter.ts:251 — logical width
  const py = (1.0 - uv.y) * this.vectoScene.height; // ThreeAdapter.ts:253 — flip Three's bottom-origin
  this.dispatchAtPoint(type, px, py, ...);
}
```

Trois pièges, chacun derrière un bug corrigé :

1. **Logique vs backing store (DPR)** — `canvas.width = logicalWidth * devicePixelRatio` en HiDPI (backing store `CanvasRenderer`, boss 07 §DPR). Le layout des entités et `findEntityAt` sont logiques. Multiplier `uv.x * canvas.width` décale chaque hit de `dpr`×. Le commentaire à `ThreeAdapter.ts:246` le dit explicitement ; l'entrée programmatique (`dispatchPointer`, `ThreeAdapter.ts:675`) prend des `x,y` logiques pour la même raison. `ThreeRenderer` a le piège correspondant sur le chemin scissor (`ThreeRenderer.ts:468` `dpr = renderer.getPixelRatio()`) et sur la rastérisation fillText (`ThreeRenderer.ts:987`).
2. **Flip Y** — l'origine UV de Three est bottom-left, Canvas est top-left. `py = (1 - uv.y) * height` (`ThreeAdapter.ts:253`). `ThreeRenderer` unflip les textures pour la même raison (`ThreeRenderer.ts:628` `texture.flipY = false`, `ThreeRenderer.ts:1035` fillText).
3. **Clics hors panneau** — un miss quand `state.isHovering` synthétise `pointerleave` à `lastUv` (`ThreeAdapter.ts:209`) et, sur `pointerdown`, blur le focus panneau (`ThreeAdapter.ts:214` `if (pointerdown && _focusedEntity) setFocusedEntity(null)`) — reflétant comment un clic sur l'arrière-plan de page déplace le focus DOM.

### 3.3 Le cœur de dispatch partagé

`updateIntersection` (UV raycast) et `dispatchPointer` (pixels logiques, `ThreeAdapter.ts:675`) convergent tous deux vers `dispatchAtPoint` (`ThreeAdapter.ts:262`) :

```ts
private dispatchAtPoint(type, px, py, pointerId, originalEvent): boolean {
  this.vectoScene.markDirty();                          // ThreeAdapter.ts:270 — onDemand wake
  const hitEntity = this.vectoScene.findEntityAt(px, py); // ThreeAdapter.ts:273 — VMT hit test
  // hover transitions (ThreeAdapter.ts:277), pointerleave dedup (ThreeAdapter.ts:291),
  // then dispatchEventToTarget or canvas fallback (ThreeAdapter.ts:307)
  // then pointerdown focus (ThreeAdapter.ts:320)
}
```

`findEntityAt` est le même hit tester que la Scene à l'écran utilise (`HitTester.ts:12`, boss 06), incluant le gating `clipChildren` et les bounds sensibles à la rotation — pas de chemin hit spécifique 3D.

## 4. Routage d'entrées — pointer, wheel, hover et multi-touch

### 4.1 Les transitions hover sont par pointeur

`activePointers: Map<number, PointerState>` (`ThreeAdapter.ts:101`) trace `{isHovering, lastUv, lastTargetId}` par `pointerId` (`ThreeAdapter.ts:64`). Le `pointerId` est lu depuis le `PointerEvent` original (`ThreeAdapter.ts:187`) ou défaut à `1` pour les chemins programmatiques/souris. Sur `pointermove` l'adapter diffe `lastTargetId` contre le `hitEntity.id` courant et émet `pointerleave` sur l'ancienne entité et `hover` sur la nouvelle (`ThreeAdapter.ts:277`). Sur un `pointerleave` synthétique (sortie de mesh) il émet une fois via `dispatchEventToTarget` et retourne `false` pour supprimer le dispatch fallback traînant qui dupliquerait le leave (`ThreeAdapter.ts:291` commentaire + early return).

L'historique ici : l'adapter pré-fix émettait `pointerleave` deux fois (une fois via le `lastTargetId` tracké, une fois via le fallback générique à `lastUv`) et fuitait un leave vers l'entité qui se trouvait sous `lastUv` après sortie du curseur (`vectojs-docs/forge/findings/renderer-and-gpu.md:620`).

### 4.2 Multi-touch / WebXR

Les contacts tactiles reçoivent des `pointerId`s frais, monotoniquement croissants. Sans pruning, `activePointers` grandissait d'une entrée par tap pour la vie de l'adapter. `pruneEndedPointer` (`ThreeAdapter.ts:228`) supprime l'entrée sur `pointerup`/`pointercancel` après que le dispatch final l'a lue. `ThreeRenderer` avait la même classe de fuite dans `imageTextureCache`/`textTextureCache` (corrigé éviction LRU `ThreeRenderer.ts:635`).

`GraphCamera` a la garde complémentaire à la couche 3D : un drag actif possède son `pointerId` jusqu'à son propre `pointerup`/`pointercancel` — un second contact ne doit pas écraser `dragging`/`lastX`/`button` (`packages/graph3d/src/GraphCamera.ts:305`).

### 4.3 Wheel — pas de défauts neutres

`createDOMEvent` (`ThreeAdapter.ts:372`) branche sur `type === 'wheel'` : un `WheelEvent` est synthétisé avec `deltaX/Y/Z/deltaMode` copiés depuis le `WheelEvent` original quand présent, sinon `0` (`ThreeAdapter.ts:381`). Les champs pointeur synthétisent `button/buttons/modifiers` avec les mêmes défauts neutres que le chemin raycaster produit quand aucun événement original n'a été fourni (`ThreeAdapter.ts:48` doc `ThreeAdapterPointerInit`). `dispatchPointer` ne couvre explicitement **pas** wheel (`ThreeAdapter.ts:664` doc — les deltas n'ont pas de défauts neutres ; routez wheel via `updateIntersection` avec le vrai `WheelEvent`).

Chaque événement dispatché porte `clientX/clientY = px/py` (pixels logiques de scène) et des propriétés non standard `vectoSceneX/Y` (`ThreeAdapter.ts:412` `Object.defineProperties`) pour que les handlers ayant besoin de l'espace scène n'aient pas à un-flip ou un-scale. `originalEvent` est forwardé comme `VectoJSEvent.nativeEvent` (`ThreeAdapter.ts:364`) pour que les handlers puissent lire `deltaMode`/`button` verbatim.

`ThreeAdapterPointerInit` (`ThreeAdapter.ts:54`) documente les défauts pour le chemin programmatique : `button`/`buttons` 0, modifiers off — indistinguable du chemin raycaster quand aucun événement original n'est fourni. `ThreeAdapterPointerType` (`ThreeAdapter.ts:40`) est l'union fermée que les deux points d'entrée acceptent ; `type` n'est élargi à `VectoEvent` qu'à l'intérieur de `dispatchAtPoint` (`ThreeAdapter.ts:263`).

### 4.4 Pilotage programmatique vs pilotage raycast

Les deux points d'entrée sont intentionnellement symétriques mais pas identiques :

| entrée                                                               | l'appelant fournit                       | étape UV                                                           | wheel                                         | utiliser pour                               |
| -------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------- |
| `updateIntersection(raycaster, type, event)` (`ThreeAdapter.ts:181`) | `THREE.Raycaster` + DOM `Event`          | `raycaster.intersectObject(this.mesh)` → `hit.uv` → `dispatchAtUv` | oui — `WheelEvent` forwardé avec deltas       | pointeur/wheel 3D live, rayon contrôleur VR |
| `dispatchPointer(type, x, y, init)` (`ThreeAdapter.ts:675`)          | `x,y` logiques + optionnel `PointerInit` | aucun — `x,y` sont déjà pixels de scène                            | non — les deltas n'ont pas de défauts neutres | tests, automation, headless                 |

Les deux convergent vers `dispatchAtPoint` (`ThreeAdapter.ts:262`) pour que transitions hover, focus, `markDirty` et la porte dispatch `isConnected` se comportent identiquement. `dispatchPointer` est la seule entrée qui crée son propre `PointerEvent` (`ThreeAdapter.ts:690`) — elle le doit, car il n'y a pas d'événement DOM backing dans le cas programmatique.

### 4.5 Fallback canvas

Quand `findEntityAt` retourne `null` (espace mort), l'événement est dispatché sur `this.canvas` lui-même (`ThreeAdapter.ts:312` `canvas.dispatchEvent(fallbackEvent)`). Pour des Scenes à l'écran cela bubblerait à travers les miroirs a11y ; pour l'adapter offscreen cela laisse les handlers au niveau Scene observer quand même les clics d'arrière-plan (qui alors blur le focus, voir §5).

## 5. Focus et ownership clavier — offscreen, donc synthétique

### 5.1 Pourquoi le focus panneau n'est pas `document.activeElement`

Le canvas de l'adapter n'est jamais appendé à `document`, donc son `a11yRoot` (le conteneur que `Scene` crée pour les miroirs) n'est jamais non plus connecté. `getA11yElement(entity.id)` retourne toujours un vrai élément (`Scene.syncA11y` le peuple quoiqu'il arrive), mais `el.isConnected === false` en permanence. Les APIs natives qui exigent un élément connecté (`setPointerCapture`, `focus()` robuste) throw sur de tels éléments, donc l'adapter traite les miroirs déconnectés comme absents.

Le focus panneau est donc **un état côté adapter** : `ThreeAdapter._focusedEntity` (`ThreeAdapter.ts:111`) avec le commentaire doc expliquant l'écart et le pont `FocusEvent` synthétique. Accès via getter `focusedEntity` (`ThreeAdapter.ts:441` — retourne `null` quand disposed) et `focus(entity|null)` / `blur()` (`ThreeAdapter.ts:458`).

### 5.2 Comment le focus se déplace

- **Piloté par pointeur** — après dispatch de l'événement, `pointerdown` focus le plus proche ancêtre focusable de l'entité hit (`ThreeAdapter.ts:321` `focusNearestFocusable(hit)`), ou blur sur espace mort. `focusNearestFocusable` (`ThreeAdapter.ts:499`) remonte la chaîne `hit.parent` et teste `isFocusable` à chaque nœud — donc cliquer un `<span>` dans un `<button>` focus le bouton, matchant le DOM. Si rien dans la chaîne n'est focusable, il blur (`ThreeAdapter.ts:506`). La transition focus s'exécute _après_ l'événement pour que les handlers observent le monde focus pré-clic, matchant l'ordre natif `pointerdown`-puis-focus (`ThreeAdapter.ts:319` commentaire).
- **Programmatique** — `focus(entity)` (`ThreeAdapter.ts:458`) accepte toute entité (même non focusable) pour que tests/automation puissent forcer le focus ; le chemin pointeur est plus strict et ne focus que ce que la projection déclare atteignable.
- **Contrat `isFocusable`** (`ThreeAdapter.ts:478`) — vrai quand le miroir porte `tabindex` (`tabIndex` explicite ou le `0` implicite que core ajoute pour les rôles ARIA interactifs) ou rend comme tag nativement focusable (`button`/`input`/`textarea`/`select`/`a[href]`). Retombe sur valeurs brutes `getA11yAttributes()` avant la première sync de projection.

### 5.3 Le pont FocusEvent synthétique

`setFocusedEntity` (`ThreeAdapter.ts:516`) dispatche un `FocusEvent('blur')` synthétique sur le miroir précédent et `FocusEvent('focus')` sur le suivant quand ils existent ; sinon il `emit` directement sur l'entité. Cela laisse les listeners propres à core tourner inchangés : emits `focus`/`blur` d'entité, tracking `Scene.focusedA11yElement` et wake/cleanup du clignotement caret `Input`. Chaque transition `markDirty()` aussi pour que les visuels de focus (caret, highlight) repeignent en mode `onDemand` (`ThreeAdapter.ts:529`).

### 5.4 Routage clavier — `dispatchKey` et ownership

```ts
// packages/three/src/ThreeAdapter.ts:573
public dispatchKey(key: string, mods: ThreeAdapterKeyModifiers = {}, phase: 'press'|'keydown'|'keyup' = 'press'): void {
  const init = { key, code: mods.code ?? ThreeAdapter.codeFor(key), ...mods, bubbles:true, cancelable:true };
  if (phase !== 'keyup') this.routeKeyEvent(new KeyboardEvent('keydown', init));
  if (phase !== 'keydown') this.routeKeyEvent(new KeyboardEvent('keyup', init));
}
```

`codeFor` (`ThreeAdapter.ts:597`) infère `KeyboardEvent.code` depuis `key` : lettres vers `Key<X>`, chiffres vers `Digit<N>`, espace vers `Space`, autres pass-through — best-effort car `code` est layout-dépendant.

`routeKeyEvent` (`ThreeAdapter.ts:610`) implémente quatre règles (doc à `ThreeAdapter.ts:536`) :

1. **Pas de focus panneau** — l'événement va direct à `window` ; le canal scène-level de core (`Scene.ts:3351` `dispatchKeyboard`) applique ses gates natives (`defaultPrevented`, auto-repeat, `ownsKeyboard(document.activeElement)`). Les consumers Orbit-camera et inputs hôtes ne sont jamais affamés.
2. **Focus panneau, au miroir** — dispatch sur le miroir focusé pour que le forwarding générique de touches de core et l'activation Enter/Space `#694` tournent. Si aucun miroir n'existe, `VectoJSEvent` sur l'entité.
3. **Ownership — stop** — si `entityOwnsKeyboard(focused)` (`ThreeAdapter.ts:643`) retourne vrai (tag `input`/`textarea`/`select`, ou `role` dans `KEYBOARD_OWNING_ROLES` de `Scene.ts:115` — `textbox`, `searchbox`, `spinbutton`, `option`, `listbox`, `button`, `link`, `tab`, `menuitem`, `slider`, `combobox`), l'événement est consommé ; rien ne fuit vers `window`. L'ensemble tag+role reflète `Scene.ownsKeyboard` (`Scene.ts:143`) et est documenté comme intentionnellement unifié via le set exporté.
4. **Sinon, bubble vers window** — sauf si `nativeEvent.defaultPrevented` ou `cancelBubble` a été posé par un handler d'entité, matchant le bubbling canvas connecté. C'est cette porte qui fait qu'un handler panneau peut `preventDefault()` sur Enter pour supprimer un shortcut hôte.

C'est le mécanisme derrière la recette skill `vectojs-three` (`.agents/skills/vectojs-three/references/three-recipes.md:60`) `adapter.focus(panel); adapter.dispatchKey('Enter')` et la garde `isFocusable`.

## 6. Projection sémantique en 3D — ce que voit l'AT

Sur un canvas connecté, `Scene.syncA11y` projette chaque `getA11yAttributes()` d'entité interactive dans un miroir DOM transparent, absolument positionné (role, label, tabindex, bounds). Les lecteurs d'écran et `getByRole` de Playwright pilotent ces miroirs. Hit-testing et événements dispatchés sont des préoccupations séparables : le `HitTester` de Scene (`HitTester.ts:12`) est l'autorité hit, tandis que les miroirs sont le transport de dispatch (`Scene.ts:3512` listeners par miroir) — une distinction sur laquelle le pont offscreen s'appuie.

À l'intérieur de `ThreeAdapter` les miroirs sont créés identiquement — `Scene` ne sait pas que le canvas est offscreen — mais ils ne sont jamais connectés à `document`. Conséquences :

- **AT invisible par défaut** — un panneau `CanvasTexture` n'est pas dans l'arbre a11y de la page. Si la scène 3D a besoin d'atteignabilité AT, l'hôte doit soit rendre un overlay 2D de la même Scene soit exposer le panneau via une Scene séparée, connectée. L'adapter n'invente pas cela ; il préserve le contrat de projection 2D et laisse la structure de page de l'hôte 3D à l'hôte. C'est le défaut correct : une texture n'a pas de sémantique DOM.
- **Fallback dispatch — `isConnected` est structurant** — `dispatchEventToTarget` (`ThreeAdapter.ts:330`) vérifie `a11yEl && a11yEl.isConnected` (`ThreeAdapter.ts:349`). Les miroirs connectés reçoivent un vrai `PointerEvent`/`WheelEvent` dispatché dessus pour que les widgets nativement bindés (ex. un `<input>` projeté qui appelle `setPointerCapture`, ou le chemin `focus()` par entité qui appelle `a11yEl.focus()` à `ThreeAdapter.ts:360`) fonctionnent avec le dispatch natif du navigateur. Les miroirs déconnectés prennent le fallback : `new VectoJSEvent(type, entity, originalEvent, …, {x,y})` bubblé à travers l'arbre virtuel (`ThreeAdapter.ts:363`). Le commentaire à `ThreeAdapter.ts:341` explique le mode d'échec — un élément déconnecté throw sur `setPointerCapture` et `focus()` est no-op — donc router via le fallback n'est pas un choix de style, c'est une porte de correction.
- **Les événements pointeur ne sont pas gatés par `pointerEvents: 'none'` sur les descendants** — le hit test de l'adapter est `findEntityAt` sur la Scene, pas le hit-testing CSS. La sémantique `pointerEvents: 'none'` qui compte sur la page 2D (boss 03, interaction `ScrollView` `pointerEvents: 'none'`) n'affecte pas le chemin 3D ; seul le chemin miroir 2D la respecte. Dans le chemin adapter le hit est déjà résolu avant toute tentative de dispatch DOM.
- **Le focus reflète la même scission** — `setFocusedEntity` dispatche sur le miroir quand `isConnected` et `emit` sur l'entité sinon (`ThreeAdapter.ts:516`) ; les deux chemins pilotent les mêmes listeners core (entité `focus`/`blur`, `Scene.focusedA11yElement`, clignotement caret) pour que les handlers `onFocus` n'aient pas à brancher.

`ThreeRenderer` n'a aucune préoccupation de projection — c'est un renderer, pas une Scene — donc il n'a aucun chemin a11y. Une Scene adossée à `ThreeRenderer` projette toujours via la couche a11y 2D normale de `Scene` car le renderer ne touche jamais `a11yRoot`.

Repérez la différence des deux côtés de la branche dispatch de l'adapter (`ThreeAdapter.ts:341` vs `ThreeAdapter.ts:363`) :

```ts
// Connected mirror — real DOM dispatch, native capture/focus work
a11yEl.dispatchEvent(domEvent); // ThreeAdapter.ts:351
if (type === 'pointerdown' && (a11yEl instanceof HTMLInputElement || …)) a11yEl.focus();

// Disconnected mirror — virtual-tree bubble, no DOM
entity.dispatchEvent(new VectoJSEvent(type, entity, originalEvent, …, { x, y })); // ThreeAdapter.ts:363
```

## 7. Le pendant pure-Three — la famille `Graph3D`

`@vectojs/graph3d` montre à quoi ressemble un consumer 3D non-adapter — pas de `ThreeAdapter`, pas de Scene, pas de projection a11y. C'est la référence pour où l'adapter est et n'est pas nécessaire.

| pièce                                | rôle                                                                                                                                  | fichier:line clé                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `Graph3D`                            | présentation instanciée : un `InstancedMesh` pour les nœuds + un `LineSegments` pour les liens sous un seul `group` (`Graph3D.ts:30`) | `Graph3D.ts:28` group, `Graph3D.ts:115` InstancedMesh, `Graph3D.ts:136` LineSegments                                         |
| `GraphCamera`                        | contrôles 2D ortho vs 3D perspective pan/zoom/orbit                                                                                   | `GraphCamera.ts:73` GraphCamera, `GraphCamera.ts:200` fix zoom setSize, `GraphCamera.ts:354` wheel zoom-about-cursor         |
| `GraphInteraction`                   | `Raycaster` + NDC → `pickNode` → hover/select/drag-to-pin                                                                             | `GraphInteraction.ts:83` GraphInteraction, `GraphInteraction.ts:157` setPointerFromEvent, `GraphInteraction.ts:246` pickNode |
| `VectoForceLayout` / `D3ForceLayout` | contrat layout nourrissant `Float32Array` positions vers `applyPositions`                                                             | `packages/graph3d/src/layout/`                                                                                               |

Invariants notables qui reflètent les gotchas de l'adapter :

- **`setGraphData` throw avant de muter** — les endpoints de links sont résolus via `indexById` (`Graph3D.ts:80`) et validés (`Graph3D.ts:90` throw) avant `clearMeshes()` (`Graph3D.ts:99`) ou attachement de mesh, donc un graphe rejeté laisse la scène intacte (doc `Graph3D.ts:73`, `forge 2026-08-13`).
- **`applyPositions` garde NaN** — `positions.length < nodeCount*3` bail avant écriture, warn une fois par `setGraphData` (`Graph3D.ts:162` `hasWarnedShortPositions`, reset à `Graph3D.ts:100`), et saute l'update pour éviter matrices d'instances NaN et une bounding sphere NaN qui frustum-cullerait tout le mesh (doc `Graph3D.ts:148`). Aucun bound check par link n'est nécessaire car `setGraphData` a validé chaque endpoint.
- **`pickNode` est instance-aware** — `raycaster.intersectObject(nodeMesh)` filtré à `h.instanceId != null` (`Graph3D.ts:248`), retournant l'index `GraphData.nodes` aligné avec le layout.
- **`GraphCamera.setSize` fix double-zoom** — le frustum reste à demi-extents non zoomés ; `camera.zoom` seul porte le zoom (commentaire `GraphCamera.ts:200` : baker le zoom dans le frustum _et_ poser `camera.zoom` rendait l'extent visible `1/zoom²` et faisait snapper le graphe hors vue).
- **`GraphInteraction` capture pointeur** — `setPointerCapture` sur `domElement` à `pointerdown` (`GraphInteraction.ts:284`) et via `window` `pointerup`/`pointercancel` (`GraphInteraction.ts:135`) pour qu'un release hors canvas termine quand même le drag et ré-active les contrôles hôtes ; `dispose()` mid-drag exécute le chemin finish (`GraphInteraction.ts:314`).

## 8. Pièges et trappes (avec file:line)

| piège                                               | où                                                                 | symptôme                                                                                     | corrigé / statut                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| UV × backing store au lieu de taille logique        | commentaire `ThreeAdapter.ts:246`                                  | chaque hit décalé de `dpr`× bas/droite en HiDPI                                              | corrigé — utiliser `vectoScene.width/height`                              |
| Y non inversé                                       | `ThreeAdapter.ts:253`                                              | hits miroités verticalement                                                                  | corrigé — `(1-uv.y)*height`                                               |
| Miroir a11y dispatché alors que déconnecté          | `ThreeAdapter.ts:349` `isConnected`                                | `setPointerCapture` throw, `focus()` no-ops                                                  | corrigé — fallback vers `VectoJSEvent`                                    |
| `pointerleave` dupliqué à la sortie du mesh         | early return `ThreeAdapter.ts:291`                                 | entité hit deux fois, voisin fuitait un leave                                                | corrigé `ThreeAdapter.ts:291` skip trailing dispatch (`forge 2026-08-13`) |
| `activePointers` grandissait par tap                | `ThreeAdapter.ts:228` `pruneEndedPointer`                          | Map non bornée, WebXR/multi-touch                                                            | corrigé — delete sur `pointerup`/`pointercancel`                          |
| Wheel n'a pas de défauts neutres                    | doc `ThreeAdapter.ts:664`                                          | `dispatchPointer('wheel',…)` synthétiserait de mauvais deltas                                | par conception — utiliser `updateIntersection` avec vrai `WheelEvent`     |
| `pointerdown` hors panneau ne blurr pas             | `ThreeAdapter.ts:214`                                              | le panneau gardait le focus après clic dans l'espace 3D vide                                 | corrigé — blur sur `pointerdown` extérieur                                |
| Proxy `render` non restauré au dispose              | `ThreeAdapter.ts:113` `_originalRender`                            | `needsUpdate` sur `CanvasTexture` supprimée → `THREE.Texture: trying to use deleted texture` | corrigé `ThreeAdapter.ts:730`                                             |
| Canvas mis à zéro alors que fourni par l'appelant   | `ThreeAdapter.ts:122` `_ownsCanvas`                                | le canvas de l'appelant blanké après dispose                                                 | corrigé — zéro seulement quand owned                                      |
| `ThreeRenderer` `FrontSide` cullé sous ortho y-down | caméra `ThreeRenderer.ts:250`, `ThreeRenderer.ts:596` `DoubleSide` | `fillCircle`/fills/gradients/drawImage invisibles                                            | corrigé (`forge 2026-08-13`, `ThreeRenderer.ts:596`)                      |
| `drawImage` verticalement flippé                    | `ThreeRenderer.ts:628` `flipY = false`                             | chaque image blitée à l'envers                                                               | corrigé (`forge 2026-08-23`, `ThreeRenderer.ts:478`)                      |
| `LineBasicMaterial.linewidth` ignoré                | `ThreeRenderer.ts:110` `buildStrokeRibbon`                         | chaque stroke hairline                                                                       | corrigé — géométrie ruban                                                 |
| `fillText` parsait weight comme taille              | `ThreeRenderer.ts:274` `parseFontSize`                             | texte gras 700px haut, baseline `fontSize/2` basse                                           | corrigé (`forge 2026-08-13 #486`, `ThreeRenderer.ts:274` + `:831`)        |
| `Graph3D` à moitié construit sur mauvais link id    | `Graph3D.ts:73`                                                    | nœuds attachés, links manquants, échelles périmées                                           | corrigé `Graph3D.ts:80` resolve-first                                     |
| Tableau `applyPositions` sous-dimensionné → NaN     | `Graph3D.ts:148`                                                   | nœuds s'évanouissent, frustum vide                                                           | corrigé `Graph3D.ts:162` guard + warn latché                              |
| `GraphInteraction` dispose mid-drag                 | `GraphInteraction.ts:314`                                          | contrôles hôtes restés désactivés                                                            | corrigé — `finishDrag` dans `dispose`                                     |
| `GraphCamera` double-zoom au resize                 | `GraphCamera.ts:200`                                               | zoom `1/zoom²`, graphe snap out                                                              | corrigé — frustum reste non zoomé                                         |

## 9. Recettes — quand utiliser quel chemin

**Panneau dans une scène 3D (HUD, dashboard, écran VR) :**

```ts
// .agents/skills/vectojs-three/references/three-recipes.md:10 + :24
import { ThreeAdapter } from '@vectojs/three';
import { Button, Stack, Text } from '@vectojs/ui';
const adapter = new ThreeAdapter({ width: 800, height: 500 });
const panel = new Stack({ direction: 'vertical', gap: 16 });
panel.add(new Text('VectoJS in 3D', { font: '700 28px Inter' }));
adapter.vectoScene.add(panel);
adapter.vectoScene.start();
scene3d.add(adapter.mesh);
// pointer routing — raycaster owns the 3D hit, adapter owns the 2D dispatch
const handled = adapter.updateIntersection(raycaster, type, event);
if (handled) event.preventDefault();
```

- Appelez `adapter.updateIntersection(raycaster, type, event)` depuis les listeners `window`/`document`, en passant le vrai `PointerEvent`/`WheelEvent` pour que l'état button/modifier et les deltas wheel forwardent. Quand `handled` est vrai le hit 3D a été consommé — `preventDefault()` l'événement hôte pour que la page ne scrolle/sélectionne pas dessous.
- Utilisez `adapter.dispatchPointer(type, x, y)` (`ThreeAdapter.ts:675`) pour tests/automation — pixels logiques, même chemin downstream que le raycaster, mais wheel reste sur le chemin raycaster (pas de delta neutre à synthétiser, `ThreeAdapter.ts:664`).
- Focus : `adapter.focus(entity)` / `adapter.blur()` (`ThreeAdapter.ts:458`), query avec `adapter.isFocusable(entity)` (`ThreeAdapter.ts:478`). Clavier : `adapter.dispatchKey('Enter')` (`ThreeAdapter.ts:573`) — press complet par défaut, ou `dispatchKey('a', {shiftKey:true}, 'keydown')` pour touches maintenues. Le focus pilote la gate `ownsKeyboard` qui décide si les touches fuient vers `window`.
- Resize : `adapter.resize(w, h)` (`ThreeAdapter.ts:713`) quand le canvas hôte ou la taille panneau change ; la Scene ne suit pas `window` (`ThreeAdapter.ts:140` `disableWindowResize`).
- Teardown : `scene3d.remove(adapter.mesh); adapter.dispose()` (`ThreeAdapter.ts:723`) — restaure le proxy render (`ThreeAdapter.ts:730`), dispose texture/géométrie/matériau, retire le mesh, détruit Scene, clear pointeurs/focus.

**Graphe 3D sans panneau 2D :**

Utilisez directement `Graph3D` + `GraphCamera` + `GraphInteraction` — pas d'adapter. `Graph3D.group` est ajouté à la scène hôte, `GraphCamera` possède la caméra et ses propres listeners `pointerdown/move/up/wheel` (`GraphCamera.ts:150`), et `GraphInteraction` possède `pointermove/down` sur `domElement` plus `window` `pointerup/cancel` pour drag-outside. Câblez-les avec `() => graphCamera.camera` getter pour que `setMode('2d'|'3d')` reste live (`GraphInteraction.ts:5` `GraphInteractionCamera`).

**L'hôte possède la caméra (ex. `OrbitControls` + graphe) :**

Passez `setControlsEnabled` (`GraphInteraction.ts:53`) pour qu'un drag de nœud désactive les contrôles caméra pour la durée du drag. Le même pattern s'applique à un panneau adapter qui partage le canvas avec une scène 3D : gatez `updateIntersection` du panneau quand la caméra drag et vice versa.

## 10. Questions ouvertes et horizon XR

- **Délivrance session XR** — les contrôleurs WebXR produisent `select`/`squeeze` + rayon `XRInputSource`, pas `PointerEvent`. La map `pointerId` de l'adapter (`ThreeAdapter.ts:101`) généralise déjà au multi-pointer, mais l'hôte doit synthétiser `Raycaster` depuis la vue XR + pose d'entrée et appeler `updateIntersection` par source d'entrée. Aucun helper `XRRaycaster` n'existe encore.
- **Deux panneaux, un canvas** — `updateIntersection` hit-test un seul `mesh` (`ThreeAdapter.ts:186` `intersectObject(this.mesh)`). Deux adapters dans une même scène Three.js nécessitent un raycast par adapter ou un `intersectObjects([a.mesh, b.mesh])` partagé avec dispatch par `hit.object`. L'état hover par `pointerId` est par adapter, donc le `pointerleave` cross-panel est déjà isolé.
- **AT pour panneaux 3D** — comme §6 le note, les miroirs offscreen sont AT-invisibles. Un déploiement XR ou WebGL-only qui a besoin d'AT doit garder une Scene 2D connectée (ou un overlay DOM) synchronisée — l'adapter ne résout pas cela car l'arbre a11y de la page est hors scope pour une texture.
- **SSR / OffscreenCanvas** — `ThreeAdapter.ts:130` retombe sur un objet `{width,height}` quand `document` est undefined. `THREE.CanvasTexture` attend toujours une source tex-image ; les hôtes qui pré-rendent côté serveur ont besoin d'un vrai `OffscreenCanvas` ou d'une construction d'adapter différée.

## 11. Checklist avant de livrer un changement dans cette zone

- [ ] **Pas de `uv.x * canvas.width`.** Chaque chemin UV→pixel utilise `vectoScene.width/height` (logique), pas `canvas.width/height` (backing store). Grep `canvas\.width` dans `packages/three/src/ThreeAdapter.ts`.
- [ ] **Y est inversé.** `py = (1 - uv.y) * height` (`ThreeAdapter.ts:253`) ; les textures qui blit dans la scène sont `flipY = false` (`ThreeRenderer.ts:628`, `:1035`).
- [ ] **`updateIntersection` et `dispatchPointer` convergent.** Les nouvelles sémantiques d'entrée vont dans `dispatchAtPoint` (`ThreeAdapter.ts:262`) pour que les chemins raycast et programmatique ne divergent pas.
- [ ] **Porte `isConnected` préservée.** `dispatchEventToTarget` (`ThreeAdapter.ts:349`) vérifie `a11yEl.isConnected` avant de dispatcher vers un miroir ; le fallback `VectoJSEvent` doit rester pour le cas offscreen.
- [ ] **Focus panneau ponté.** Chaque transition `setFocusedEntity` dispatche des `FocusEvent`s synthétiques sur les miroirs et `markDirty()` (`ThreeAdapter.ts:516`) ; `pointerdown` focus remonte les ancêtres `isFocusable` (`ThreeAdapter.ts:499`).
- [ ] **Ownership clavier unifié.** `entityOwnsKeyboard` (`ThreeAdapter.ts:643`) utilise le même set `KEYBOARD_OWNING_ROLES` que `Scene.ownsKeyboard` (`Scene.ts:115`, `Scene.ts:143`) ; ajouter un rôle à l'un doit mettre à jour l'autre.
- [ ] **`hover` vs `pointermove` préservé.** `dispatchAtPoint` mappe les transitions hover `pointermove` vers `hover` sur la nouvelle entité et `pointerleave` sur l'ancienne (`ThreeAdapter.ts:277`) ; changer le nom d'événement casse les handlers `Entity.on('hover',…)`.
- [ ] **Dedup `pointerleave` intact.** Le `pointerleave` synthétique de sortie de mesh (`ThreeAdapter.ts:291`) ne doit pas tomber vers le dispatch générique — le `return false` est structurant.
- [ ] **`activePointers` pruné.** `pruneEndedPointer` (`ThreeAdapter.ts:228`) sur `pointerup`/`pointercancel` à la fois dans `updateIntersection` et `dispatchPointer` (plus caps LRU `ThreeRenderer`).
- [ ] **`needsUpdate` gaté.** Le proxy render (`ThreeAdapter.ts:157`) ne pose `needsUpdate` que quand la Scene a redessiné ; sémantique `resize`/`dispose` (`_ownsCanvas`, `_originalRender`) intacte.
- [ ] **Gardes `Graph3D` tiennent.** `setGraphData` résout les links avant de muter (`Graph3D.ts:80`), `applyPositions` bail sur tableaux courts (`Graph3D.ts:162`), `GraphInteraction` nettoie mid-drag (`GraphInteraction.ts:314`).

## Relations

- **Boss 06 (VMT runtime)** possède `Scene`, `Entity`, `findEntityAt`, `focusedA11yElement` et le câblage `WASM_UPLOAD_REJECT_LIMIT` / structure-version que l'adapter réutilise.
- **Boss 07 (renderer)** possède `IRenderer`, les caps DPR/backing-store de `CanvasRenderer`, l'ortho y-down, scissor et le batching `present()` vs `flush()` que `ThreeAdapter` (via `CanvasRenderer`) et `ThreeRenderer` (comme `IRenderer`) héritent tous deux.
- **Boss 11 (graph layout)** possède les kernels de force qui nourrissent `Graph3D.applyPositions` ; le quadtree 2D `@vectojs/graph-layout` (`BarnesHutQuadtree.ts`) reste JS-only tandis que `crates/vectojs-force-rs` accélère l'octree 3D.
- **Boss 08 (WASM)** partage les valeurs viewport et `appliedDPR` de `Scene` ; une vue typed-array périmée à travers une croissance mémoire est l'analogue texture-cache de ce boss.

## Références

- `packages/three/src/ThreeAdapter.ts:1` — adapter : canvas offscreen, `CanvasTexture`, proxy render, entrée raycast + programmatique, focus/clavier panneau
- `packages/three/src/ThreeRenderer.ts:1` — `IRenderer` via Three.js : ortho y-down, strokes ruban, shader gradient, DPR, caches, `present()`/`dispose()`
- `packages/three/src/index.ts:1` — barrel public (`ThreeAdapter`, `ThreeRenderer`)
- `packages/graph3d/src/Graph3D.ts:1` — nœuds instanciés + liens line, `setGraphData` resolve-first, garde `applyPositions`, `pickNode`
- `packages/graph3d/src/GraphCamera.ts:1` — caméra ortho/perspective + pan/zoom/orbit, fix zoom `setSize`, wheel-zoom-about-cursor
- `packages/graph3d/src/GraphInteraction.ts:1` — `Raycaster` + NDC, `pointerId` hover/drag-to-pin, `window` up/cancel, `setControlsEnabled`
- `packages/core/src/tree/Scene.ts:115` `KEYBOARD_OWNING_ROLES` / `Scene.ts:143` `ownsKeyboard` / `Scene.ts:1446` `focusedA11yElement` / `Scene.ts:3512` per-mirror dispatch — l'ownership 2D que l'adapter reflète
- `.agents/skills/vectojs-three/references/three-recipes.md:1` — recettes panel, pointer, wheel, programmatique et dispose
- `vectojs-docs/forge/findings/renderer-and-gpu.md:1` — findings renderer/gpu (DPR, cull `FrontSide`, `flipY`, hairline, fuites cache, pièges de projection)
