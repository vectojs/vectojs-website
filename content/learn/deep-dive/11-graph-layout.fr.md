---
title: '11 — Agencement de graphes — Physique à forces et benchmarking'
description: 'Le moteur 2D sans dépendance de ForceLayout2D, le quadtree Barnes-Hut et la grille de collision étagée, la mutation incrémentale et les contrats de pins, la famille 3D VectoForceLayout/D3ForceLayout, le noyau WASM vectojs-force-rs et la méthodologie de benchmark headed.'
order: 31
---

# 11 — Agencement de graphes — Physique à forces et benchmarking

> **Boss 11** ressemble à « ressorts et répulsion » jusqu'à la mise en production. Le N-body naïf est en O(N²) par tick, un seul hub effondre les grilles de collision naïves, l'expansion incrémentale ne doit pas détruire l'état stabilisé, et deux utilisateurs doivent voir la même disposition à partir de la même graine. VectoJS répond avec un quadtree 2D agnostique au renderer plus une grille étagée dans `@vectojs/graph-layout`, une famille parallèle d'octrees 3D dans `@vectojs/graph3d`, et un noyau Rust bit-identique dans `crates/vectojs-force-rs`.

- **Ce que vous apprendrez** : pourquoi N², stabilité, incrémentalité et déterminisme sont les quatre problèmes difficiles ; comment `ForceLayout2D` stocke l'état SoA et expose les `Float32Array` de positions ; comment répulsion (Barnes-Hut), ressorts de liens, centrage et collision se composent par tick ; pourquoi le quadtree 2D et la grille de collision étagée ont remplacé les grilles naïves ; comment pins, mappings d'ID, reheating et refroidissement alpha interagissent ; en quoi `VectoForceLayout` vs `D3ForceLayout` vs `FixedZLayout` diffèrent et où `KnowledgeGraphModel` les consomme ; ce que le noyau WASM remplace et comment il reste bit-identique ; et ce que `benchmarks/graph-layout` mesure réellement (et ce qu'il ne mesure explicitement pas).
- **Ce que vous n'apprendrez pas** : le dirty/cycle de vie VMT (boss 06), la correction renderer/DPR (boss 07), ou le triple WASM G1/G2/G3 (boss 08) — bien que ce boss réutilise verbatim le contrat de backend invisible du boss 08. Le façonnage de texte (boss 02) et le Markdown en streaming (boss 04) sont des consommateurs de l'agencement de graphes, pas l'inverse.

## 1. Pourquoi l'agencement à forces est trompeusement difficile

Quatre problèmes se cachent derrière « ressorts et répulsion » :

1. **N² vs Barnes-Hut.** La répulsion est chaque nœud contre chaque autre nœud. À 3000 nœuds, cela représente ~9M de forces de paires par tick, par frame, sur le thread principal ou un worker. Un vrai quadtree 2D (`BarnesHutQuadtree.ts:8` en tableau plat, réutilisé entre les ticks) rend cela en O(N log N) en traitant les cellules distantes comme une seule pseudo-particule quand `size/distance < theta` (`BarnesHutQuadtree.ts:121` test d'ouverture `4*half² < theta²*d²`). Le côté 3D fait de même avec un octree (`VectoForceLayout.ts:402` `BarnesHutOctree`). Sans cela, les graphes au-delà de quelques centaines de nœuds saccadent.

2. **Stabilité sous rayons hétérogènes.** Un seul hub de rayon 100 à côté de 3000 feuilles de rayon 4 effondre une grille de collision uniforme : un `cellSize = 2·maxRadius` met chaque feuille dans un voisinage géant 3×3 et les scans de paires dégénèrent en quadratique (le commentaire à `BarnesHutQuadtree.ts:189` mesure `12 ms → 197 ms` par tick en passant de 3k à 12k avec un gros hub). Le fix est une grille étagée par puissances de deux (`BarnesHutQuadtree.ts:190` étage `t = floor(log2(r))`, cellule `Ct = 2^(t+2)`), où chaque étage possède sa table de hachage et les paires inter-étages se résolvent exactement une fois.

3. **Incrémentalité sans téléportation.** Les graphes de connaissances paginent : 50 nœuds maintenant, 50 de plus après scroll. Les appelants attendent que `appendGraph` conserve chaque position, vélocité et pin exactement où ils étaient, n'ajoute que les nouveaux nœuds de façon déterministe, et réchauffe doucement (`ForceLayout2D.ts:162` `appendGraph`, `ForceLayout2D.ts:199` `if (newNodes.length>0||addedLinks>0) this.reheat()`). Une reconstruction `setGraph` (`ForceLayout2D.ts:123`) téléporterait le graphe stabilisé.

4. **Déterminisme cross-plateforme.** `seed` doit reproduire le même placement initial et le même jitter de coïncidence sur JS et Rust, afin que tests, snapshots et futurs oracles différentiels WASM s'accordent bit à bit. Les maths choisies sont `mulberry32` (`ForceLayout2D.ts:868`), `Math.sqrt` (pas `Math.hypot` — approximé par le moteur, note `VectoForceLayout.ts:618`), et le jitter entier `Math.imul` (`BarnesHutQuadtree.ts:618` `collisionPairAngle`, `VectoForceLayout.ts:606` `jitterFor` / `crates/vectojs-force-rs/src/lib.rs:83` `jitter_for`).

Manquer un seul de ces points et le graphe saccade, explose, se téléporte ou diverge entre JS et WASM.

## 2. Carte des paquets

```text
@vectojs/graph-layout          moteur 2D sans dépendance, sans peer renderer
  src/ForceLayout2D.ts         boucle tick, stores SoA, API publique
  src/types.ts                 NodeId/GraphData/ForceLayout2DOptions
  src/internal/BarnesHutQuadtree.ts  quadtree + grille de collision étagée
  src/index.ts                 barrel (types + layout)

@vectojs/graph3d               renderer 3D instancié + backends de layout
  src/layout/GraphLayout.ts    contrat 3D minimal (setGraph/step/positions/pin/reheat/dispose)
  src/layout/VectoForceLayout.ts  3D Barnes-Hut octree in-house (oracle JS + WASM)
  src/layout/D3ForceLayout.ts  adaptateur d3-force-3d (fidélité de migration)
  src/wasm/force-backend.ts    loader streaming/sync pour le noyau Rust
  src/wasm/asset.ts            helper bundler forceWasmUrl
  src/wasm/vectojs_force.wasm  sortie gitignorée de vectojs-force-rs

@vectojs/knowledge-graph       consommateur paginé (KnowledgeGraphModel)
  src/KnowledgeGraphModel.ts   driver unique d'un GraphLayout (setGraph/reheat)
  src/FixedZLayout.ts          VectoForceLayout avec z clampé sur un plan
  src/KnowledgeGraphSession.ts fabrique et câblage (theta 0.9, WASM opt-in)

crates/vectojs-force-rs        noyau WASM octree (backend invisible)
  src/lib.rs                   build + accumulation de forces seulement, accumulateurs f64

benchmarks/graph-layout        matrice headed à 4 bras (d3-force-3d, vecto-force, d3-force-2d, force-layout-2d)
benchmarks/graph3d-frame       harnais de coût de frame pour le renderer 3D (pas la matrice physique)
benchmarks/_shared/*           serveur + bundler + stats + runner unique (run-browsers.sh)
```

`@vectojs/graph-layout` a zéro dépendance `@vectojs/*` (`package.json:1` `name: @vectojs/graph-layout`) ; `@vectojs/graph3d` dépend uniquement de `three` ; `@vectojs/knowledge-graph` dépend du contrat layout de `graph3d`. Ordre de build : `math+text → graph-layout → three/graph3d → knowledge-graph` (vérifié via `package.json` workspaces).

## 3. ForceLayout2D — le moteur 2D

### 3.1 État et contrat des positions

Tableaux typés SoA, alignés sur l'ordre des nœuds d'entrée (`ForceLayout2D.ts:48` `nodes: GraphNode[]`, `ForceLayout2D.ts:49` `nodeIndex: Map<NodeId,number>`, `ForceLayout2D.ts:50` `positionStorage: Float32Array`, `ForceLayout2D.ts:51` `velocityX/Y`, `ForceLayout2D.ts:53` `fixedX/Y` + `pinnedX/Y`, `ForceLayout2D.ts:57` `repulsion`/`collisionRadius`, `ForceLayout2D.ts:60` `linkSource/Target/Distance/Strength/Share`, `ForceLayout2D.ts:76` `quadtree`).

`positions` public est une vue XY entrelacée live sur `positionStorage` dans l'ordre des nœuds d'entrée (`ForceLayout2D.ts:32` `public positions = new Float32Array(0)`, `ForceLayout2D.ts:748` `refreshPositionView` via `subarray`). L'identité est stable entre les appels `step()`, mais des changements de topologie ou de capacité peuvent remplacer le backing store — les hôtes doivent réacquérir `positions` après `setGraph`/`appendGraph`/`removeNodes` (doc de classe `ForceLayout2D.ts:18`).

Toute arithmétique touchant l'état public est arrondie via `Math.fround` (`ForceLayout2D.ts:13` `const f = Math.fround`, `ForceLayout2D.ts:808` `toF32`), assortie à l'exposition `Float32Array`. Le chemin 3D fait de même (`VectoForceLayout.ts:48` `const f = Math.fround`) tandis que les accumulateurs Barnes-Hut restent en `f64` (`BarnesHutQuadtree.ts:9` `cellX/Y/centerX/Y/halfSize/charge: Float64Array`).

### 3.2 Identité nœud/lien et mutation incrémentale

Les nœuds sont adressés partout par `NodeId` (`types.ts:2` `string|number`), pas par index de tableau, afin que les pins survivent à la compaction (`ForceLayout2D.ts:25` doc). Quatre points d'entrée de mutation, chacun avec une validation stricte tout-ou-rien :

| méthode              | doc                    | ownership                                                           | mode d'échec                                                                                                                                      |
| -------------------- | ---------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setGraph(data)`     | `ForceLayout2D.ts:122` | remplace tout, re-seed, `alpha=1`                                   | ID de nœud dupliqué ou lien référençant un manquant/soi-même → lève avant de vider l'ancien état (`ForceLayout2D.ts:132` validate-before-swap)    |
| `appendGraph(data)`  | `ForceLayout2D.ts:151` | conserve l'existant, ajoute nouveaux IDs, déduplique                | lien inconnu/manquant/boucle sur soi → lève avant toute mutation (`ForceLayout2D.ts:186` `resolveEndpoint` + garde `UNKNOWN_ENDPOINT`)            |
| `removeNodes(ids)`   | `ForceLayout2D.ts:202` | compacte les survivants dans l'ordre d'origine, reconstruit l'index | no-op quand rien ne correspond ; réchauffe une fois (`ForceLayout2D.ts:252`)                                                                      |
| `removeLinks(items)` | `ForceLayout2D.ts:265` | conserve l'état des nœuds, compacte les liens                       | apparié par identité dirigée `(source,target,id)` (`ForceLayout2D.ts:826` `linkIdentity`) ; idempotent                                            |
| `updateLinks(links)` | `ForceLayout2D.ts:324` | re-résout distance/force des liens existants                        | endpoints inconnus/identiques → lève ; identité inexistante ignorée ; ne réchauffe que si une valeur a réellement changé (`ForceLayout2D.ts:361`) |

L'identité de lien est le piège subtil. `ForceLayout2D.ts:826` `linkIdentity` sérialise `[idKey(source), idKey(target), idKey(id)]` où `idKey` (`ForceLayout2D.ts:835`) préfixe le type pour éviter les collisions `"1"` vs `1`. Sans `id`, l'identité est la paire dirigée d'endpoints ; les liens parallèles requièrent des `id` distincts (`types.ts:19` `GraphLink.id`). Les backends 3D diffèrent : `VectoForceLayout` et `D3ForceLayout` traitent chaque paire `(source,target)` comme un lien et ignorent même les boucles sur soi (`VectoForceLayout.ts:178` `if (ia===ib) continue`), tandis que la garde anti-duplicata de l'éditeur est plus stricte — souligné dans la note de divergence à `ForceLayout2D.ts:387`.

`appendLinks` (`ForceLayout2D.ts:637`) déduplique au sein du lot via `pendingKeys` et résout `distance`/`strength` via les accesseurs `NodeValue`/`LinkValue` fournis par l'appelant (`ForceLayout2D.ts:777` `resolveNodeValue`, `ForceLayout2D.ts:787` `resolveLinkValue`), avec gardes `finiteOr` (`ForceLayout2D.ts:797`).

La croissance de capacité est géométrique, amortie O(1) (`ForceLayout2D.ts:851` `grownCapacity` doublant depuis 4, `ForceLayout2D.ts:672` `ensureNodeCapacity`, `ForceLayout2D.ts:689` `ensureLinkCapacity`, `ForceLayout2D.ts:857` `resize` préservant le préfixe).

### 3.3 Le tick — six phases

`tick()` (`ForceLayout2D.ts:480`) est synchrone et piloté par l'hôte (`step()` à `ForceLayout2D.ts:368` boucle `tick()` tant que `alpha >= alphaMin`). Aucun timer n'est possédé — l'hôte décide quand appeler `step()` (doc de classe `ForceLayout2D.ts:21`).

```text
sanitizeState → quadtree.build → repulsion (Barnes-Hut par nœud)
              → link springs → collision grid → centering+integrate+pin clamp → alpha decay
```

Chaque phase en détail :

1. **Sanitize** (`ForceLayout2D.ts:752`) — `toF32` sur chaque position/vélocité/pin/répulsion/rayon pour qu'un NaN égaré ne puisse empoisonner l'arbre ; les coords pinnées écrasent les positions stockées.

2. **Tree build** (`ForceLayout2D.ts:483` `quadtree.build(positions, repulsion, nodeCount)`) — voir §5.

3. **Répulsion** (`ForceLayout2D.ts:484` boucle appelant `quadtree.force(qx,qy,theta,nodeIndex,out,maxDistance)`) — inverse-carré `(-charge / d³) * (dx,dy)` avec `distanceSquared` plancher à `1e-6` et `pairAngle` déterministe pour coïncidences exactes (`BarnesHutQuadtree.ts:126` / `BarnesHutQuadtree.ts:610` `pairAngle`). Respecte `repulsionDistanceMax` (`ForceLayout2D.ts:92` non-fini = pas de cutoff ; `BarnesHutQuadtree.ts:85` `maxDistanceSquared` + pré-test plus proche cellule `distanceToCellSquared` à `BarnesHutQuadtree.ts:632`). Le côté 3D utilise le même plancher et `jitterFor` dans l'insertion octree.

4. **Link springs** (`ForceLayout2D.ts:499`) — type Hooke `displacement = ((d - rest)/d) * strength * alpha`, réparti par parts pondérées au degré (`ForceLayout2D.ts:701` `recomputeLinkBias`: `sourceShare = targetDegree/total`, plancher via `springShare` quand un pin fige un endpoint à `ForceLayout2D.ts:846`). Utilise les positions prédites pour les cibles pinnées afin qu'un nœud pinné tire toujours.

5. **Collision** (`ForceLayout2D.ts:580` `applyCollisions` → `BarnesHutQuadtree.ts:172` `applyGridCollisions`) — grille étagée, §5.

6. **Center + integrate** (`ForceLayout2D.ts:554` attraction `center*alpha` vers l'origine, décroissance de vélocité, puis clamp pin par axe : les axes pinnés snappent à `fixedX/Y` et annulent la vélocité). **Cool** (`ForceLayout2D.ts:577` `alpha += (0-alpha)*alphaDecay`) avec la garde `alphaDecay > 0` à `ForceLayout2D.ts:95` car `0` bouclerait à l'infini (`step()` à `ForceLayout2D.ts:372` `while (alpha>=alphaMin)`).

## 4. Les forces comme configuration

`ForceLayout2DOptions` (`types.ts:42`) et `VectoForceLayoutOptions` (`VectoForceLayout.ts:12`) exposent le même modèle avec des défauts différents :

| paramètre                      | défaut 2D (`types.ts:43`) | défaut 3D (`VectoForceLayout.ts:14`)             | rôle                                                            | astuce de réglage                                                                                                                                                         |
| ------------------------------ | ------------------------- | ------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repulsion` / `chargeStrength` | `300` (force positive)    | `300` (VectoForce) / `-30` (D3 `chargeStrength`) | poussée N-body                                                  | augmentez pour séparer les hubs ; la 2D clamp les négatifs à `0` (`ForceLayout2D.ts:629`/`ForceLayout2D.ts:761` et `BarnesHutQuadtree.ts:109` invariant `charge<=0 skip`) |
| `collisionRadius`              | `0` (désactivé)           | n/a (graph3d n'a pas de grille 2D)               | rayon par nœud, `0` désactive (`ForceLayout2D.ts:582` max scan) | défini via accesseur à `radius+14` dans le bench (`entry.ts:631`)                                                                                                         |
| `collisionStrength`            | `1`                       | —                                                | fraction de chevauchement corrigée                              | `0` saute toute la passe                                                                                                                                                  |
| `linkDistance`                 | `30`                      | `30`                                             | longueur au repos du ressort                                    | accesseur par degré de lien dans le bench (`entry.ts:632`)                                                                                                                |
| `linkStrength`                 | `0.3`                     | `0.3`                                            | raideur du ressort `[0,1]`                                      | `0` = les liens n'exercent rien                                                                                                                                           |
| `centerStrength`               | `0.02`                    | `0.02`                                           | attraction vers l'origine                                       | `0` = graphe flottant libre                                                                                                                                               |
| `velocityDecay`                | `0.6`                     | `0.6`                                            | `1-friction`, rétention `[0,1)`                                 | plus bas = plus d'amortissement                                                                                                                                           |
| `theta`                        | `0.9`                     | `0.9`                                            | angle d'ouverture Barnes-Hut                                    | `0` = exact O(N²) ; plus grand = plus rapide/moins précis                                                                                                                 |
| `repulsionDistanceMax`         | `Infinity`                | `Infinity` (non exposé séparément en bench 3D)   | GC de la répulsion distante                                     | `Infinity`/non-fini = pas de cutoff (`ForceLayout2D.ts:91`) ; `0` désactive aussi via `BarnesHutQuadtree.ts:77` early-return — un footgun silencieux                      |
| `alphaDecay` / `alphaMin`      | `0.0228` / `0.001`        | `0.0228` / `0.001`                               | refroidissement (`~1-0.001^(1/300)` ≈300 ticks pour stabiliser) | `0` decay retombe à `0.0228` (`ForceLayout2D.ts:96`)                                                                                                                      |

La forme accesseur `number | ((node, index)=>number)` (`types.ts:38` `NodeValue`, `LinkValue`) permet de mapper la taille d'entité au rayon sans reconstruire. Les parts de liens sont recalculées à chaque changement de topologie (`ForceLayout2D.ts:702`).

## 5. Deux index spatiaux

### 5.1 Quadtree Barnes-Hut 2D

`BarnesHutQuadtree.ts:8` est un quadtree en tableau plat réutilisé par tick. `build()` (`BarnesHutQuadtree.ts:36`) dérive les bornes carrées depuis l'AABB des positions (`+1e-6` slop), assure la capacité (`BarnesHutQuadtree.ts:531` doublant depuis 64, heuristique `count*4+4`), et insère chaque point (`BarnesHutQuadtree.ts:437` `insert` avec `MAX_DEPTH=40` à la ligne 1 — garde de profondeur pour points coïncidents, feuille avec liste chaînée `pointHead→pointNext`). `finalize()` (`BarnesHutQuadtree.ts:485`) parcourt les nœuds en reverse (enfants avant parents, nœuds alloués top-down) en accumulant `charge` et `centerX/Y` comme moyennes pondérées par la masse ; la garde `total>0` à `BarnesHutQuadtree.ts:507` s'apparie à l'invariant `charge<=0 skip` noté ci-dessus — des charges négatives obligeraient à repenser les deux.

`force()` (`BarnesHutQuadtree.ts:69`) est une traversée itérative par pile (`BarnesHutQuadtree.ts:87` `ensureStack`), avec `distanceToCellSquared` (`BarnesHutQuadtree.ts:632`) pour le pré-test de cutoff et le test d'approximation exact à `BarnesHutQuadtree.ts:117`.

### 5.2 Grille de collision étagée

`applyGridCollisions` (`BarnesHutQuadtree.ts:172`) existe parce que la collision est une requête spatiale _différente_ de la répulsion (chevauchement courte portée, pas champ longue portée). Idées clés :

- **Affectation d'étage** (`BarnesHutQuadtree.ts:206` `tier = floor(log2(radius))`, cellule `4*2^tier` à `BarnesHutQuadtree.ts:267`) — les rayons uniformes s'effondrent sur un étage, se comportant comme l'ancienne grille `2·maxRadius` ; la borne `cellSize < r_i+r_j` à `BarnesHutQuadtree.ts:198` garantit qu'une sonde 3×3 trouve chaque chevauchement.
- **Sentinelle rayon zéro** (`BarnesHutQuadtree.ts:5` `ZERO_TIER = -0x40000000`, `BarnesHutQuadtree.ts:222` bucket) — les points de rayon zéro ne possèdent jamais de grille mais collisionnent quand même comme initiateurs contre les étages plus grands.
- **Tri par comptage par étage** (`BarnesHutQuadtree.ts:240` préfixe somme dans `collisionOrderOffsets`, `BarnesHutQuadtree.ts:248` remplissage curseur) — O(N) et sûr sur l'étendue : les tables d'offsets sont dimensionnées par _étendue d'étages_, pas par nombre de points, car les rayons `f32` couvrent ~280 puissances de deux (`BarnesHutQuadtree.ts:237` commentaire, `BarnesHutQuadtree.ts:587` `ensureCollisionOffsets`).
- **Sonde 3×3 dédupliquée** (`BarnesHutQuadtree.ts:349` `probeCollisionCell`) — 9 slots, hachage à sondage linéaire `imul(cellX,73856093)^imul(cellY,19349663)` (`BarnesHutQuadtree.ts:596`), filtre de cellules dupliquées à `BarnesHutQuadtree.ts:372`, règle paire-une-fois (`sameTier && target<=source` skip à `BarnesHutQuadtree.ts:390` ; inter-étages n'a pas besoin de skip — chaque paire plus grand étage est visitée exactement une fois par son initiateur plus petit).
- **Impulsion sensible aux parts** (`BarnesHutQuadtree.ts:406` `pinned?0:otherPinned?1:0.5`) — reflète les parts de ressorts mais clampé à moitié quand les deux sont libres (d3-force utilise des parts pondérées au rayon ; le commentaire à `entry.ts:745` signale la caveat de comparaison).

L'octree 3D (`VectoForceLayout.ts:402`) reflète cette structure en 3D : `BarnesHutOctree.build` cube l'AABB, `insert` avec la même garde `depth < 40` et `jitterFor` déterministe pour points coïncidents (`VectoForceLayout.ts:561`), `finalizeMass` bottom-up, `force` avec `size² < theta²*d²` et skip d'identité `pointIndex` (`VectoForceLayout.ts:726`) plutôt que skip distance-zéro — des points distincts coïncidents sont jitterés et doivent toujours exercer une force.

## 6. Pins, reheating, déterminisme

**Les pins sont par axe, adressés par ID.** `ForceLayout2D` pinne par `NodeId` (`ForceLayout2D.ts:393` `pinNode(id,x,y)`, `ForceLayout2D.ts:413` `setNodePin({x?,y?})`, `ForceLayout2D.ts:436` `clearNodePin`) en stockant `fixedX/Y` + `pinnedX/Y` (`ForceLayout2D.ts:53`) ; le `GraphLayout` de graph3d pinne par _index_ (`GraphLayout.ts:46` `pinNode(nodeIndex,x,y,z)`, `VectoForceLayout.ts:337` sentinelle `fx/fy/fz = NaN` vs `D3ForceLayout.ts:122` `fx/fy/fz = null`). La divergence est documentée à `ForceLayout2D.ts:387` — traduisez en changeant de stack. Les `fx/fy` initiaux sur un `GraphNode` (`types.ts:12`) sont honorés à `ForceLayout2D.ts:619` `addNode` comme pré-pins.

**Le reheating augmente alpha mais ne le baisse jamais** (`ForceLayout2D.ts:450` `alpha = max(alpha, requested)`, `VectoForceLayout.ts:359` idem, `D3ForceLayout.ts:150` `alpha = max(alphaMin, min(1,alpha))`). Chaque mutation de topologie réchauffe une fois (`ForceLayout2D.ts:199`, `ForceLayout2D.ts:252`, `ForceLayout2D.ts:308`, `ForceLayout2D.ts:361` conditionnel) — les appelants n'ont pas besoin de s'en souvenir. Le chemin knowledge-graph réchauffe explicitement à `KnowledgeGraphModel.ts:285` `layout?.reheat?.(0.5)` après `rebuildGraph`, qui lui-même appelle `layout?.setGraph` à `KnowledgeGraphModel.ts:356`.

**Le déterminisme** est triple : placement spiral seedé `mulberry32` (`ForceLayout2D.ts:613` `radius=10*sqrt(i+1), angle=rand()*2π` / `VectoForceLayout.ts:143` `r=10*cbrt(i+1)` sphérique), angle coïncident déterministe via `deterministicAngle` (`ForceLayout2D.ts:878` haché depuis `(source,target,seed)`) et `collisionPairAngle` (`BarnesHutQuadtree.ts:618` seedé), et choix flottants identiques entre JS et Rust (le piège `Math.hypot` ci-dessus).

**Le refroidissement** utilise `alphaDecay = 0.0228` (`≈ 1-0.001^(1/300)`, identique au défaut de d3-force-3d, commentaire `VectoForceLayout.ts:32`) avec `alphaMin = 0.001` ; `step()` retourne `alpha >= alphaMin` comme « encore chaud » (`ForceLayout2D.ts:375`), assorti au contrat `GraphLayout` (`GraphLayout.ts:26` doc). Un `alpha=0` non disposé ne refroidit jamais — gardé à la construction.

## 7. La famille 3D et le consommateur Knowledge Graph

### 7.1 VectoForceLayout vs D3ForceLayout

Les deux implémentent `GraphLayout` (`GraphLayout.ts:12` — `Float32Array` plat de triplets xyz dans l'ordre `GraphData.nodes`, transférable par worker, `step()` piloté par l'hôte). Différences :

- **Modèle :** `VectoForceLayout` (`VectoForceLayout.ts:50`) est un _nouveau_ modèle — répulsion octree Barnes-Hut (`VectoForceLayout.ts:402`), ressorts de liens, centrage, velocity decay, refroidissement alpha — déterministe et sans dépendance. `D3ForceLayout` (`D3ForceLayout.ts:25`) est un _adaptateur d3-force-3d_ (`forceSimulation(…,3).force('link', forceLink).force('charge', forceManyBody).force('center', forceCenter)` à `D3ForceLayout.ts:88`), conservant le feeling de `3d-force-graph` pour la migration.
- **Ownership d'état :** `VectoForceLayout` garde `positions/vx/vy/vz/fx/fy/fz/linkA/B` SoA (`VectoForceLayout.ts:87`) et ne mute jamais les nœuds appelants ; `D3ForceLayout` clone en `simNodes: SimulationNode[]` (`D3ForceLayout.ts:71`) car d3 les mute.
- **Pins :** `fx/fy/fz` par index NaN vs sentinelle `null` ; `VectoForceLayout.tick` clamp avant intégration (`VectoForceLayout.ts:308`), le `fx` de d3 fait de même dans son tick.
- **Alpha :** `VectoForceLayout.reheat` plancher à `alphaMin` et plafond à `1` (`VectoForceLayout.ts:361`) ; `D3ForceLayout.reheat` écrit directement `simulation.alpha()` (`D3ForceLayout.ts:151`).

`FixedZLayout` (`knowledge-graph/src/FixedZLayout.ts:10`) enveloppe `VectoForceLayout` et clamp chaque `z` à une constante après le step interne, permettant à un layout 3D de piloter une vue knowledge-graph 2D sans changer de moteur. `KnowledgeGraphSession` (`knowledge-graph/src/KnowledgeGraphSession.ts:59` doc « la session ne fait que refléter ») construit un `VectoForceLayout({theta:0.9})` à la ligne 117 et délègue `setGraph`/`reheat` à `KnowledgeGraphModel`.

### 7.2 KnowledgeGraphModel — le consommateur incrémental

`KnowledgeGraphModel` (`knowledge-graph/src/KnowledgeGraphModel.ts:62`) possède la coupe matérialisée (`entities`, `facts`, `factKeys`, `expansions`) et est le **driver unique** de son `GraphLayout` emprunté (`KnowledgeGraphModel.ts:43` doc : un `setGraph` par `rebuildGraph`, un `reheat` par `expand`). Sur `expand(id)` (`KnowledgeGraphModel.ts:127`) il pagine via `KgDataSource.getNeighbors` avec annulation `AbortSignal` (`KnowledgeGraphModel.ts:148` déduplication par promesse partagée, `KnowledgeGraphModel.ts:150` `cancelExpand`), ingère entités/faits, avance `loaded` du compte _batch_ de faits (pas net-new, donc les voisinages chevauchants ne bloquent pas la progression — commentaire à `KnowledgeGraphModel.ts:273`), appelle `rebuildGraph()` (`KnowledgeGraphModel.ts:332` capture les positions, fusionne dans `entityOrder` stable, seed les nouveaux nœuds depuis `lastPositions`, écrit `GraphData` et appelle `layout?.setGraph`), réchauffe (`KnowledgeGraphModel.ts:285`), et enregistre `ExpansionState` (`KnowledgeGraphModel.ts:7`). `dispose()` (`KnowledgeGraphModel.ts:225`) ne dispose intentionnellement pas du layout emprunté — la session peut encore le partager.

### 7.3 WASM — le noyau de forces invisible

`crates/vectojs-force-rs` (`crates/vectojs-force-rs/Cargo.toml:6` « backend invisible ; le chemin TypeScript est le fallback permanent ») reflète `BarnesHutOctree` en Rust : `Octree` (`lib.rs:47`), `jitter_for` (`lib.rs:83`), `build`/`insert`/`place_child`/`finalize_mass`/`force` (`lib.rs:194` / `lib.rs:401`), exports `force_init`/`force_pos`/`force_accel`/`force_step` (`lib.rs:457` / `lib.rs:484` / `lib.rs:491` / `lib.rs:503`) avec `STATUS_OK/CAPACITY/UNINITIALIZED/OVERFLOW` (`lib.rs:31`). La portée est _build + accumulation de forces seulement_ (`lib.rs:10` commentaire — cette phase est 78–90% d'un tick 3D, split de phases `VectoForceLayout.ts:240`) — ressorts de liens, centrage, intégration restent dans le tick JS, donc la jointure est un `Float32Array.set` gather et un read-back `Float64Array` par tick.

Le loader (`packages/graph3d/src/wasm/force-backend.ts:42` `ForceBackend`) fait du fetch streaming avec fallback `arrayBuffer` (`force-backend.ts:104` `instantiateStreaming`), `ensure`/`force_init` growth (`force-backend.ts:52`), `step` gather + `force_step` + refresh de vues périmées (`force-backend.ts:65` + `force-backend.ts:37` `viewsStale` — l'octree peut faire croître la mémoire linéaire mid-step, détachant les vues). L'échec à tout point retourne `null` et l'appelant conserve l'octree JS (`VectoForceLayout.ts:106` / `VectoForceLayout.ts:246` fallback vers `this.tree.build` + `this.tree.force` ; l'URL asset est `packages/graph3d/src/wasm/asset.ts:22` `forceWasmUrl` via `new URL('./vectojs_force.wasm', import.meta.url)` — la seule forme sûre pour le bundler). Le `.wasm` est gitignoré et copié via `tsup.config.ts:40` à la publication, exactement comme `vectojs-core-rs`.

La parité bit est non-négociable : l'arbre Rust doit calculer les mêmes centres de masse `f64` et intégrales de répulsion `f64` que l'arbre JS (positions et vélocités restent `f32` des deux côtés). `VectoForceLayout.ts:58` l'énonce : « Un futur noyau Rust/WASM … doit donc reproduire l'accumulation `f64` exactement. » Les tests testent différentiellement les deux chemins bit à bit (voir `packages/graph3d/test/VectoForceLayout.wasm.test.ts:6` activation streaming/sync et les copies espacées à `VectoForceLayout.ts:618`).

Le build est identique au piège du boss 08 : `crates/vectojs-force-rs/build.sh` avec `RUSTFLAGS="-C target-cpu=generic -C target-feature=+simd128 -C linker=rust-lld"` ; un `cargo build --target wasm32-unknown-unknown` nu fuit les flags hôtes de `~/.cargo/config.toml` et casse le link.

## 8. Méthodologie de benchmark — ce qui est quotable

L'en-tête `benchmarks/graph-layout/entry.ts:1` fait autorité. Seul `benchmarks/run-browsers.sh` (un wrapper `bun runner/cli.ts` à `benchmarks/run-browsers.sh:4`) produit des nombres quotables — il pilote un **vrai browser headed sur un workspace Hyprland dédié, fenêtre focus, vrai GPU** (selon le contrat benchmark du workspace `AGENTS.md`). `benchmarks/debug-page.ts` et `scripts/benchmark.ts` sont headless (`--disable-gpu`) — un tripwire de régression et une aide au debug, pas une quote.

### 8.1 Matrice, budget et ce que « stabilisé » signifie

Les **défauts budgétés** (CTX-0517, 2026-08-26 — `entry.ts:4`) sont :

- `COUNTS = 100,1000,3000` (`entry.ts:48` — 500 supprimé comme voisin log de 1000 ; 3000 conservé comme baseline `#559`)
- `TICKS = 30` échantillons réguliers par tick (`entry.ts:49`)
- `TRIALS = 3` (`entry.ts:50` — le protocole baseline `#559` ; répétition au niveau suite via `run-browsers.sh --iterations`)
- `SETTLE_CAP = 120` (`entry.ts:51` — premiers 120 ticks post-append, pas convergence naturelle à ~285–300 ticks ; `settleCappedTrials == TRIALS` par design, selon sweep du 2026-08-25)
- `APPEND_NODES = 50` (`entry.ts:57`), `WARMUP_TICKS = 5` (`entry.ts:58`), `POST_TOPOLOGY_ALPHA = 1` (`entry.ts:59`)

Les **anciens défauts** (`counts 100,500,1000,3000 × 2 workloads × 4 bras × 6 trials × cap 500`) projetaient >1500 s/moteur car chaque tick stabilisé paye un yield `setTimeout(0)` clampé à ~4 ms (`entry.ts:301` `yieldToPaint`) et les stabilisations couraient à ~300 ticks — désormais ~150 s en Chrome headless par enveloppe (`entry.ts:25`).

Les **workloads** sont `star-hub` et `mixed-sparse` (`entry.ts:61`), avec graphes construits à `entry.ts:226` / `entry.ts:252` (positions seedées sur spirale `sqrt` pour éviter l'empilement) et payloads d'append ajoutant 50 nœuds + hub ou liens préférentiels+aléatoires.

Les **bras** sont quatre (`entry.ts:599`) :

| bras              | dims | impl               | `appendMode`       | construction                                                                                                                                                                                                                      |
| ----------------- | ---- | ------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `d3-force-3d`     | 3    | `D3ForceLayout`    | `setGraph-rebuild` | `new D3ForceLayout()`                                                                                                                                                                                                             |
| `vecto-force`     | 3    | `VectoForceLayout` | `setGraph-rebuild` | `new VectoForceLayout()`                                                                                                                                                                                                          |
| `d3-force-2d`     | 2    | d3-force in-page   | `appendGraph`      | `D3Force2DLayout` à `entry.ts:78` (charge `300`, `distanceMax 450`, `theta 0.9`, collide `radius+14`)                                                                                                                             |
| `force-layout-2d` | 2    | `ForceLayout2D`    | `appendGraph`      | `new ForceLayout2D({repulsion: charge, collisionRadius: radius+14, linkDistance accesseur, linkStrength 0.42, center 0.016, velocityDecay 0.64, alphaDecay 0.024, repulsionDistanceMax 450, theta 0.9, seed 7})` à `entry.ts:625` |

L'ordre des bras est **tourné déterministiquement** par `(workloadIndex, countIndex)` (`entry.ts:647` `rotatedArms`) afin que l'ordre moteur/agent ne puisse biaiser un count.

### 8.2 Ce qui est mesuré

Trois observables par bras/workload/count, tous derrière `performance.now()` et frontières de tâche `setTimeout(0)` pour que les long-task entries ne fusionnent pas (`entry.ts:330` `captureLongTasks` via `PerformanceObserver 'longtask'`) :

- **`benchTicks`** (`entry.ts:501`) — `TICKS` appels `step()` réguliers depuis un graphe fraîchement réchauffé : `median/p95/max` (`entry.ts:292` `summarize` via `median`/`percentile` depuis `_shared/stats.ts`).
- **`benchAppend`** (`entry.ts:526`) — mutation de topologie seule (payloads clonés préconstruits à `entry.ts:346` `prepareAppendPayloads` pour que le clonage ne favorise jamais `appendGraph`) ; puis `reheat(POST_TOPOLOGY_ALPHA)` explicite avant chaque premier tick post-append et chaque boucle de stabilisation (`entry.ts:559`). Retourne `append` median/p95, `firstTick` median/p95, `settleTotal` median/p95 sur jusqu'à `SETTLE_CAP` ticks, `settleTicks` median/p95, `settleCappedTrials`, et `maxStepMs` (maximum d'un seul `step()` sur toutes les phases, `entry.ts:679`).
- **`observeLiveAppendMemory`** (`entry.ts:398`) — une seule layout live chaude conservée à travers lectures immédiates avant/après, création du payload et disposal _hors_ du delta (`entry.ts:415` commentaire). Préfère `performance.measureUserAgentSpecificMemory` (`entry.ts:444`, borné par `UA_MEMORY_TIMEOUT_MS = 1250` à `entry.ts:55` via `entry.ts:353` `readUaMemoryWithTimeout`) ; un seul échec timeout désactive les lectures UA suivantes pour le run (`entry.ts:454` `uaMemoryDisabledReason`) ; retente l'observation complète avec layout frais sur fallback heap (`performance.memory.usedJSHeapSize` à `entry.ts:465`). Les deux sont **observations bruitées, pas preuves de mémoire retenue ou de sélection de backend** (`entry.ts:740` caveats). Non supporté est rapporté `status: 'unsupported'` avec raison.

Aussi rapporté : `longTaskMaxDurationMs` par capture long-task (`entry.ts:678`), compté seulement quand l'intervalle `longtask` couvre un `[started,ended]` mesuré (`entry.ts:326` `include`).

### 8.3 Contrat du runner headed

Mesuré le 2026-08-02, le panneau 240 Hz est Hyprland `eDP-1 2560x1600` scale 1.6. Trois pièges de cadence invalident toute mesure silencieusement : Chrome non focus tombe à ~60 Hz, Firefox a besoin de `layout.frame_rate` et est à 60 Hz par défaut même focus (Firefox piloté à la main est faux de 4×), et un `refreshHz` d'exactement 250 est un artefact médian sur panneau 240 Hz. Le harnais (`benchmarks/_shared/server.ts`, `runner.ts`, `loaf.ts`) fait `validateEnvironment`, détection de famine, agrégation cross-run, et porte commit + CPU/GPU/driver hôte (une page ne peut les voir). Chaque benchmark ne possède que `entry.ts` + `build.ts` à trois lignes (`benchmarks/graph-layout/build.ts:11` délégant à `_shared/build.ts`) ; le serveur/bundler vivent dans `_shared/` — ne les dupliquez pas.

**Ne jamais hardcoder un refresh rate** — appelez `calibrateRefreshRate()` et rapportez `refreshHz` à côté de toute mesure par frame. Citez les deux moteurs (V8 et SpiderMonkey divergent).

### 8.4 Snapshots de baseline

La **baseline complète N=7** à 500 nœuds (`benchmarks/graph-layout/README.md:44`, run `20260820T135641Z-1a6d54`, Chrome `240.04 Hz` / Firefox `240.64 Hz`) est la dernière matrice complète entièrement itérée sous budget headed (les matrices complètes 1000 et 3000 nœuds ont timeouté aux défauts `entry.ts` — voir `README.md:11` et `README.md:28`). Les médianes stabilisées représentatives (500 nœuds, `TICKS 30`, `TRIALS 1`, `SETTLE_CAP 500`, deux workloads) sont dans ce README ; les défauts budgétés réduits ci-dessus le supplantent pour coût par moteur (~150 s). Gardez les résultats sous `benchmarks/graph-layout/results/` (gitignoré) et identifiez les runs par l'ID d'historique du runner, pas en copiant des lignes.

## 9. Migration d3-force, interaction et culling

**Migrer depuis d3-force** (`d3-force`/`d3-force-3d`) vers `ForceLayout2D`/`VectoForceLayout` n'est pas un renommage. Le caveat bench à `benchmarks/graph-layout/entry.ts:745` est structurant : « Les lignes 2D … comparent différentes lois de forces : `ForceLayout2D` utilise répulsion inverse-carré et parts de collision égales free/free ; `d3-force` utilise répulsion inverse-distance et parts de collision au carré du rayon. Traitez les ratios comme comparaisons de workload au niveau implémentation, pas mesures de noyau à équation équivalente. »

Deltas concrets à traduire :

- **Loi de répulsion :** `ForceLayout2D` est `−charge / d³ * (dx,dy)` (`BarnesHutQuadtree.ts:134` `factor = -charge*invD/d²`), soit inverse-carré en magnitude de force ; le `forceManyBody` de d3 est inverse-distance (`strength / d`). Les nombres absolus ne sont pas comparables — re-tunez `repulsion`/`chargeStrength` plutôt que les copier.
- **Sémantique de cutoff :** `ForceLayout2D` teste le centre de charge _agrégé_ contre `repulsionDistanceMax` (`BarnesHutQuadtree.ts:98` pré-test `nearestDistanceSquared` + `maxDistanceSquared`), assorti au cutoff many-body de d3 ; avec `theta: 0` le cutoff est exact par point (`types.ts:59` doc). `Infinity`/non-fini le désactive — `0` le désactive _silencieusement_ via early-return, donc `finiteOr` à `ForceLayout2D.ts:91` mappe tout non-positif vers `Infinity`.
- **Identité de lien :** `ForceLayout2D` déduplique sur `(source,target,id)` dirigé via `linkIdentity` (`ForceLayout2D.ts:826`) et lève sur liens pendants/boucle avant mutation ; d3 garde des ids string bruts sur les objets lien et la garde duplicate-link de l'éditeur est encore plus stricte (note de divergence à `ForceLayout2D.ts:387`). Lors de migration d'un graphe persisté, normalisez d'abord les champs `id`.
- **Adressage des pins :** couvert au §6 — `ForceLayout2D` par `NodeId`, `GraphLayout` de graph3d par index. Les handlers drag-to-pin capturant un index doivent re-résoudre après `removeNodes` côté 2D.
- **Theta :** range et effet identiques — `0` = exact `O(N²)`, plus grand = plus rapide/moins précis (`types.ts:57`, `VectoForceLayout.ts:28`). Le défaut `0.9` est tuné pour un feeling similaire entre stacks mais n'est pas bit-identique entre quadtree et octree.

**Interaction et visibilité** sont hors tick physique mais coûteux à l'échelle. `packages/graph3d/src/GraphInteraction.ts:1` (`GraphInteraction`) mappe les hits raycaster Three.js vers `nodeIndex` pour hover/select/drag-to-pin, et fait le debounce hover habituel ; `Graph3D.ts:1` (`Graph3D`) rend le graphe instancié et culle hors-écran. Ni l'un ni l'autre ne remplace le layout — ils consomment `positions` après `step()`. À 3000 nœuds le renderer, pas le layout, est souvent le goulot (`benchmarks/graph3d-frame/entry.ts:1` harnais coût de frame vs `benchmarks/graph-layout/entry.ts:1` matrice physique — gardez les deux harnais distincts). Pour hôtes `Scene` canvas (pas Three.js), le culling `packages/core/src/tree/Scene.ts:1` fait le même travail ; graph-layout lui-même ne culle jamais.

## 10. Réglages et pièges

Les pins diffèrent par stack (`ForceLayout2D` par ID, graph3d par index — `ForceLayout2D.ts:387`) ; traduisez en portant. `repulsionDistanceMax = 0` désactive entièrement la répulsion (`BarnesHutQuadtree.ts:77` early-return) — non-fini est le « pas de cutoff » voulu (`ForceLayout2D.ts:91`). `alphaDecay = 0` retombe à `0.0228` ou la boucle de stabilisation ne termine jamais (`ForceLayout2D.ts:95`). Un `RUSTFLAGS` non-fini ou fuité par l'hôte casse le build WASM ou sa parité bit (`fma` sur CPU tuné, `crates/vectojs-force-rs/build.sh:8`) ; utilisez `just wasm`. Le bug de dimensionnement tier-span (`BarnesHutQuadtree.ts:237`) — dimensionner les tables d'offsets par nombre de points au lieu de l'étendue d'étages — drop silencieusement les incréments counting-sort quand les rayons couvrent ~280 étages de `f32`. Le détachement de vue après croissance `force_init` (`force-backend.ts:37` `viewsStale`) doit re-valider les vues de tableaux typés après chaque `force_step`.

Pièges supplémentaires trouvés durant cette recherche :

- **Répulsion négative en 2D clampée, non supportée.** `ForceLayout2D` clamp `repulsion` à `>=0` à `ForceLayout2D.ts:629`/`ForceLayout2D.ts:761` et `BarnesHutQuadtree.ts:109` saute les sous-arbres `charge<=0` — la garde `finalize` à `BarnesHutQuadtree.ts:507` placerait sinon mal le centre de charge pour nœuds attractifs. La charge négative (attractive) de D3 n'a pas d'équivalent ici ; revisitez les deux gardes avant de l'autoriser.
- **`id` de lien vs adressage endpoint.** `removeLinks` construit paresseusement une map `linksByIdKey` seulement quand un `LinkId` nu apparaît (`ForceLayout2D.ts:270`), remplaçant le précédent scan `O(items×L)` par item. Passer un objet `GraphLink` complet avec un `id` différent de celui stocké ne matchera pas — l'identité est le triple sérialisé, pas l'identité d'objet.
- **Aliasing de vue `positions`.** `refreshPositionView` retourne un `subarray` sur le _même_ `ArrayBuffer` (`ForceLayout2D.ts:749`). Conserver une référence à travers `ensureNodeCapacity` ou `removeNodes` (qui `resize` le buffer à `ForceLayout2D.ts:857`) laisse une vue détachée de longueur 0. Relisez `layout.positions` après chaque mutation.
- **Pas de `forge/baselines/graph-layout*` encore.** `benchmarks/graph-layout/results/` est gitignoré et il n'existe pas de `forge/baselines/graph-layout.json` commité — chaque affirmation au §8 doit être re-mesurée sur l'hôte quotable. Le finding N=7 à 500 nœuds dans `benchmarks/graph-layout/README.md:44` est un snapshot spécifique à l'hôte, pas un fichier baseline portable.
- **`crates/vectojs-force-rs` a exactement un artefact de build.** `build.sh` émet `packages/graph3d/src/wasm/vectojs_force.wasm` et `tsup` le copie vers `dist/wasm/` (`packages/graph3d/tsup.config.ts:40`). Il n'y a jamais un second crate ou un paquet WASM partagé — jusqu'à ce qu'un troisième consommateur apparaisse (`DEC-0081` à `force-backend.ts:12`), gardez-le local.
- **Discipline d'oracle différentiel.** Le chemin 3D `VectoForceLayout` octree JS est l'_oracle permanent_ ; le noyau Rust à `crates/vectojs-force-rs/src/lib.rs:1` doit rester bit-identique sur accumulation `f64` (positions `f32` des deux côtés). Greppez `jitter_for`/`jitterFor`/`mulberry32` à travers `VectoForceLayout.ts:606`, `BarnesHutQuadtree.ts:610`, `lib.rs:83` — tout changement de l'un non porté sur l'autre est un échec de diff. L'opt-in `measurePhases` (`VectoForceLayout.ts:45`) garde l'oracle mesurable sans payer `performance.now()` en prod.

Lors de l'ajout d'une nouvelle force, écrivez d'abord l'oracle JS (`VectoForceLayout.ts:232` structure `tick`), gardez l'ordre des ops et la sémantique NaN `Math.min/Math.max` (voir commentaire total-order `BarnesHutQuadtree.ts:632` `distanceToCellSquared`), et gatez le chemin WASM derrière `measurePhases` (`VectoForceLayout.ts:45` opt-in `tickPhases: [octree, force, link, integrate]` wall-ms) afin que le hot path ne paye rien quand le profiling est off.

## 11. Tests, oracles différentiels et comment les choses ont réellement cassé

Trois suites de tests couvrent le côté 2D (`packages/graph-layout/test/BarnesHutQuadtree.test.ts:1` quadtree approx vs exact, `packages/graph-layout/test/ForceLayout2D.test.ts:1` `setGraph`/`appendGraph`/`removeNodes`/`removeLinks`/`updateLinks`/pins/alpha, `packages/graph-layout/test/ForceLayout2D.linkMutations.test.ts:1` dedup/biais de degré/parts de lien). Le côté 3D ajoute `packages/graph3d/test/VectoForceLayout.wasm.test.ts:1` (parité bit JS vs WASM : streaming, sync, fallback sur mauvaise URL à `VectoForceLayout.wasm.test.ts:123` `file:///nonexistent` → `false`).

Ce qu'ils gardent et ce qui a déjà mordu — lisez ceci comme checklist de review :

- **Sanitize avant build.** Une position `NaN` laissée dans `positionStorage` empoisonne les bornes quadtree (`minX = NaN` → `size = NaN`). `sanitizeState` à `ForceLayout2D.ts:752` `toF32`+écrasement pin existe parce que cela s'est produit une fois avec un `x: NaN` fourni par l'appelant depuis un JSON destructuré. Ne jamais retirer cette boucle.
- **Plancher distance-zéro.** Sans plancher `1e-6` à `BarnesHutQuadtree.ts:132`/`BarnesHutQuadtree.ts:154` et `VectoForceLayout.ts:727`, deux points coïncidents dans la même cellule produisent `factor = -m/0 = ±Infinity` → vélocités `NaN` qui infectent chaque tick suivant. L'angle déterministe à `BarnesHutQuadtree.ts:610`/`ForceLayout2D.ts:878` rend la poussée reproductible.
- **Fuite de part pinnée.** Oublier le fallback `springShare` quand un endpoint est pinné (fixe `0` ou `1` dans `ForceLayout2D.ts:846` / `BarnesHutQuadtree.ts:406`) laisse un nœud pinné être traîné par la vélocité de l'autre endpoint. Historique : les premiers pins 3D jitteraient car les ressorts de liens intégraient encore la coordonnée pinnée.
- **Alpha n'atteint jamais min.** Passer `alphaDecay: 0` gardait `alpha` à `1` pour toujours — la boucle hôte `while(layout.step())` ne terminait jamais. La garde à `ForceLayout2D.ts:95` / `VectoForceLayout.ts:117` mappant `0` → `0.0228` existe depuis un incident live où une option calculée produisait `0`.
- **Observation mémoire mal lue.** Les nombres `liveAppendMemoryObservation` dans `entry.ts:398` sont des observations _whole-agent_ avec bruit GC (`entry.ts:449` caveat) ; les traiter comme heap retenu par backend est la misquote la plus courante des benchs graph. Le run désactive aussi les lectures UA-spécifiques après un timeout (`entry.ts:454`) et retente sur `usedJSHeapSize` — comparer un run ayant switché de source mid-matrice à un n'ayant pas switché n'est pas valide.

Résumé de complexité pour reviewers :

| phase              | 2D                                                                  | 3D                                  | où                                                    |
| ------------------ | ------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------- |
| tree build         | O(N log N) quadtree                                                 | O(N log N) octree                   | `BarnesHutQuadtree.ts:36` / `VectoForceLayout.ts:414` |
| repulsion          | O(N log N) moyen, O(N²) pire avec `theta=0`                         | idem                                | `ForceLayout2D.ts:484` / `VectoForceLayout.ts:259`    |
| links              | O(L)                                                                | O(L)                                | `ForceLayout2D.ts:499` / `VectoForceLayout.ts:274`    |
| collision          | O(N) moyen via grille étagée ; O(N²) sans étages sur rayons biaisés | —                                   | `BarnesHutQuadtree.ts:172`                            |
| mémoire par layout | ~6×N f32 + liens + arbre ~4N nœuds                                  | ~7×N f32 + liens + octree ~8N nœuds | `ForceLayout2D.ts:672` / `VectoForceLayout.ts:445`    |

## 12. Reproductibilité — commandes quotables

```bash
# Build du noyau WASM (requis avant tout chemin WASM) :
just wasm                         # ou crates/vectojs-force-rs/build.sh
# Optionnel : vérifier l'oracle JS seul (pas de Rust nécessaire) :
just test-pkg graph-layout && just test-pkg graph3d

# Matrice physique headed — le chemin quotable (nécessite Hyprland + Chrome/Firefox headed) :
./benchmarks/run-browsers.sh graph-layout 8272 --viewport 1280x720 \
  --param counts=100,1000,3000 --param ticks=30 --param trials=3 \
  --param settleCap=120 chrome firefox
# Variante convergence complète (reproduit l'ancien settle 500 ticks, budgété explicitement) :
./benchmarks/run-browsers.sh graph-layout 8273 --viewport 1280x720 \
  --param counts=100,500,1000,3000 --param ticks=30 --param trials=6 \
  --param settleCap=500 chrome firefox   # attendez >1500 s — budgétez en conséquence

# Coût de frame 3D (renderer, pas physique — ne pas confondre) :
./benchmarks/run-browsers.sh graph3d-frame 8274 --viewport 1280x720 chrome firefox
```

Rapportez `refreshHz` depuis `calibrateRefreshRate()`, les deux moteurs, le SHA de commit, et CPU/GPU/driver hôte (la page ne peut les voir — le harnais à `benchmarks/_shared/server.ts:1` les capture). Gardez le JSON brut sous `benchmarks/graph-layout/results/` (gitignoré) et citez son ID d'historique, pas des médianes collées.

## Annexe — où lire ensuite

| objectif                                    | commencez par                                                                        | ensuite                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| régler un layout 2D pour un nouveau dataset | `packages/graph-layout/src/types.ts:42` + `ForceLayout2D.ts:79` défauts constructeur | `ForceLayout2D.ts:480` phases tick → `BarnesHutQuadtree.ts:8` index                                      |
| ajouter une nouvelle force (ex. radiale)    | `VectoForceLayout.ts:232` structure `tick` comme template                            | `crates/vectojs-force-rs/src/lib.rs:10` note de portée — seules les forces octree appartiennent au noyau |
| paginer un graphe de connaissances          | `knowledge-graph/src/KnowledgeGraphModel.ts:62` lifecycle                            | `FixedZLayout.ts:10` si vous avez besoin d'une projection 2D d'un layout 3D                              |
| quoter un nombre                            | `benchmarks/graph-layout/entry.ts:1` header + `benchmarks/graph-layout/README.md:44` | `benchmarks/_shared/stats.ts:1` pour sémantique `median`/`percentile`                                    |

---

_Suite : **Boss 12 — DevTools** (l'inspecteur runtime qui permet de pointer un pixel et relire quelle entité le possède, et pourquoi). Précédent : **Boss 10 — Export vidéo** (capture déterministe à pas fixe). Série : 00 Overview → 01 Selection → … → 11 Agencement de graphes (ce doc) → 12 DevTools → 99 Synthesis._
