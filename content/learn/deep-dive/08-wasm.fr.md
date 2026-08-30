---
title: '08 — Accélérateurs WASM — G1/G2/G3 & parité binaire'
description: "Les backends WASM invisibles derrière @vectojs/core : G1 world-matrix, G2 batch d'animation, G3 hit-grid (plus particules G4), le store SoA qui rend SIMD possible et le contrat de parité binaire qui maintient WASM optionnel."
order: 28
---

# 08 — Accélérateurs WASM — G1/G2/G3 & parité binaire

> **Boss 08** est invisible par conception. Les kernels Rust (`crates/vectojs-core-rs`, `crates/vectojs-force-rs`) accélèrent ce que le moteur JS fait déjà correctement — composition world-matrix, ticks d'animation, broad-phase hit, intégration de particules — et ne deviennent jamais obligatoires. Chaque chemin accéléré possède un fallback JS qui produit _les mêmes bits_, et chaque build, gate et test est là pour tenir cette promesse.

- **Ce que vous apprendrez** : pourquoi WASM est un backend invisible ; le store SoA qui rend `f64x2` possible ; ce que chaque G1/G2/G3(+G4) accélère, comment ils sont gatés et ce que les benchmarks headed ont réellement mesuré ; comment la parité binaire est testée ; et comment ajouter un nouveau kernel sans briser le contrat de fallback.
- **Ce que vous n'apprendrez pas** : dirty/cycle de vie du VMT (boss 06), parité renderer/DPR (boss 07), tuning graph-layout (boss 11) ou le mapping deux-mondes Three/XR (boss 09). Ce doc est la couche d'accélération _entre_ VMT et renderer.

## 1. Pourquoi WASM est un backend invisible

VectoJS fonctionne correctement sans Rust. `packages/core/src/wasm/soa.ts:1` (`composeJS`, `computeAabbsJS`) et `packages/math/src/SpringPhysics.ts:1` / `packages/animation/src/easing.ts` sont les oracles et fallbacks _permanents_ ; les manifests de crate le disent explicitement — `crates/vectojs-core-rs/Cargo.toml:6` _"invisible backend; the TypeScript path is the permanent fallback"_ et `crates/vectojs-force-rs/Cargo.toml:6` idem pour le kernel de force. Le `.wasm` compilé lui-même est gitignoré (`packages/core/src/wasm/vectojs_core.wasm`, `packages/graph3d/src/wasm/vectojs_force.wasm`) — construit en CI, publié sur npm, jamais commité (`.carryctx/rules/wasm-crate-build.md:6`).

Trois contraintes découlent de cette seule décision :

1. **L'instanciation peut échouer et doit rester silencieuse.** CSP `wasm-unsafe-eval`, asset manquant, `simd128` non supporté, module en cache périmé — chaque loader retourne `null` et l'appelant garde le chemin JS. `packages/core/src/wasm/backend.ts:467` `instantiateSync`/`instantiateAsync`/`instantiateStreaming`, `packages/core/src/wasm/runtime.ts:48` `loadCoreWasmModule`/`createCoreWasmRuntime`, `packages/graph3d/src/wasm/force-backend.ts:55` l'équivalent force, et `packages/core/src/wasm/asset.ts:22` `coreWasmUrl` / `packages/graph3d/src/wasm/asset.ts:22` `forceWasmUrl` pour la résolution bundler. L'échec est l'état par défaut, pas un chemin d'erreur.

   L'helper d'URL compte : `new URL('@vectojs/core/…', import.meta.url)` ne fonctionne pas — `new URL` ne résout que des refs _relatives_, et un bare specifier n'est pas relatif (`asset.ts:10`). `new URL('./vectojs_core.wasm', import.meta.url)` depuis _l'intérieur_ du package est la seule forme que l'ESM natif et les bundlers résolvent correctement. Les appelants font `await scene.enableWasmTransforms(coreWasmUrl)` (exemple `asset.ts:8`) et la méthode retourne `false` quand le fetch/compile échoue (docs `Scene.ts:1704` `enableWasmTransforms` : _"resolves true if WASM is now active, false if the JS path remains"_ ).

2. **Les kernels doivent être faillibles, pas trapper.** Les exports retournent `STATUS_OK` (0) ou un `STATUS_CAPACITY/UNINITIALIZED/BAD_RUN/OVERFLOW` non nul (`crates/vectojs-core-rs/src/lib.rs:485` constantes, `packages/core/src/wasm/backend.ts:16` `WASM_STATUS`) et n'écrivent _rien_ en cas de rejet. Le côté JS traite tout non-zéro comme « exécuter le chemin de référence cette frame » (`packages/core/src/wasm/backend.ts:212` early-return `compose`, `packages/core/src/wasm/anim-backend.ts:173` booléen `stepSprings`, `packages/core/src/tree/scene/WasmBackendFacade.ts:487` retry d'upload, `packages/core/src/wasm/particle-backend.ts:110` status négatif tri-state).

3. **Mémoire linéaire partagée, module partagé.** Avant `packages/core/src/wasm/runtime.ts:1` (`CoreWasmRuntime`), quatre backends signifiaient quatre compilations et quatre mémoires linéaires pour le même binaire. Désormais un `WebAssembly.Module` est mis en cache globalement par URL (`runtime.ts:38` `moduleCache`, clé uniquement sur string/URL — les bytes ne sont pas cachés, docs `runtime.ts:48` `cacheKey`) et une `Instance` par `Scene` expose les quatre stores via des `static mut` distincts qui ne s'aliasent jamais (`crates/vectojs-core-rs/src/lib.rs:44` `Store`, `src/anim.rs:44` `Anim`, `src/hit.rs:44` `Hit`, `src/particle.rs:44` `Particles`, `crates/vectojs-force-rs/src/lib.rs:44` `Octree`+`POS`/`ACCEL`). `CoreWasmRuntime` construit chaque backend paresseusement et le mémoïse (`runtime.ts:90` `transform()`/`anim()`/`hit()`/`particle()`) pour qu'une Scene qui n'active que les transforms ne paie jamais l'allocation anim/hit.

Le reporting garde « installé » et « actif cette frame » séparés. `Scene.accelerators: AcceleratorReport` (forme `WasmBackendFacade.ts:122`, doc `Scene.ts:1749` _"Definite-assignment because it needs \_wasmBackend"_) retourne `{ available, activeThisFrame, reason, path }` par accélérateur — `available` est « backend installé, gate le permettant », `activeThisFrame` est « a réellement tourné », `reason` est `not-installed | below-gate | rejected | active` (`WasmBackendFacade.ts:75` `AcceleratorReason`). `Scene.animGate` vs `Scene.animBackend` est la confusion classique : un gate sous le nombre de drivers rend `animBackend==='wasm'` alors que `animBatchedLastFrame===false` (voir docs `Scene.ts:1749` et `Scene.ts:1904`).

## 2. Discipline de build — `just wasm`, pas un cargo nu

Le piège est `~/.cargo/config.toml` (`.carryctx/rules/wasm-crate-build.md:1`) : une section `[target.'cfg(all())']` matche aussi `wasm32`, et Cargo _joint_ ses `rustflags` avec ceux spécifiques à la target. Des flags host comme `-C target-cpu=native` ou `-fuse-ld=mold` fuient dans le link `wasm32-unknown-unknown` et le cassent (`rust-lld: error: unknown argument: -fuse-ld=mold`). `RUSTFLAGS` d'env _remplace_ les flags de config ; la config spécifique à la target non.

Le seul build correct :

```bash
just wasm  # runs crates/vectojs-core-rs/build.sh with correct RUSTFLAGS
# or for the force kernel:
# crates/vectojs-force-rs/build.sh  (same RUSTFLAGS)

# what build.sh does (crates/vectojs-core-rs/build.sh:28):
RUSTFLAGS="-C target-cpu=generic -C target-feature=+simd128 -C linker=rust-lld" \
  cargo build --release --target wasm32-unknown-unknown --manifest-path crates/vectojs-core-rs/Cargo.toml
```

Détails des règles (`crates/vectojs-core-rs/build.sh:1`, `crates/vectojs-force-rs/build.sh:1`, `.carryctx/rules/wasm-crate-build.md:1`) :

| règle                                                          | file:line                                                        | pourquoi                                                                                                                                                                                                                                                |
| -------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target-cpu=generic`                                           | `build.sh:28`                                                    | garde `fma` (fused multiply-add) dehors. `generic` n'a pas `fma` ; un CPU tuné host fusionnerait `a*b + c*d` en un seul arrondi, alors que JS en fait deux — cassant la parité binaire. `crates/vectojs-force-rs/build.sh:8` le souligne explicitement. |
| `target-feature=+simd128`                                      | `build.sh:28`                                                    | active `v128`/`f64x2`/`f32x4`. Sans cela les kernels `#[target_feature(enable="simd128")]` (`lib.rs:612`, commentaires `particle`) échouent à compiler ou trappent.                                                                                     |
| `linker=rust-lld`                                              | `build.sh:28`                                                    | surcharge tout linker `~/.cargo/config` comme `mold`.                                                                                                                                                                                                   |
| `panic="abort"` + `strip` + `lto` + `codegen-units=1`          | `Cargo.toml:22`                                                  | binaire minimal, déterministe.                                                                                                                                                                                                                          |
| `edition="2024"` + `rust-toolchain.toml:10` `channel="stable"` | `rust-toolchain.toml:1`, `.carryctx/rules/wasm-crate-build.md:3` | le pin de channel exact est _stable_, pas une version — un pin de version exacte casse les boxes offline/mirror ; CI pine la version exacte à la place.                                                                                                 |
| `just wasm-check`                                              | `.carryctx/rules/wasm-crate-build.md:5`                          | `cargo fmt --check` + `cargo clippy --target wasm32-unknown-unknown -- -D warnings` avec les mêmes `RUSTFLAGS`.                                                                                                                                         |
| `just wasm-test`                                               | `.carryctx/rules/wasm-crate-build.md:5`                          | `just wasm` puis la suite différentielle core (`vitest`).                                                                                                                                                                                               |
| binaire gitignoré                                              | `build.sh:14`, `.carryctx/rules/wasm-crate-build.md:6`           | Les contributeurs TS-only n'ont jamais besoin de Rust. Publié via étape copy `tsup.config.ts:40` (`packages/graph3d/tsup.config.ts:40` `vectojs_force.wasm → dist/wasm/`).                                                                              |
| `Cargo.toml` `publish=false`                                   | `Cargo.toml:5` (les deux crates)                                 | les crates ne sont pas des packages crates.io — seul le `.wasm` via npm compte.                                                                                                                                                                         |

Le kernel d'évaluation `f32x4` (`crates/vectojs-core-rs/src/simd_f32_bench.rs:1`) est derrière `bench-f32` (`Cargo.toml:20` `bench-f32 = []`) et n'est jamais livré — mesuré et rejeté. `build.sh:18` documente la forme opt-in `./build.sh --features bench-f32` et pourquoi le défaut l'exclut : f32 a été mesuré et rejeté.

## 3. Le store SoA — la forme qui rend SIMD atteignable

`packages/core/src/wasm/soa.ts:22` est la moitié du système ; `crates/vectojs-core-rs/src/lib.rs:1` est l'autre. Le commentaire doc à `lib.rs:10` est structurant :

> One flat `f64` array per field. With an interleaved record, consecutive entities' `x` would be `N*8` apart — a `v128` load cannot fetch two of them.

### 3.1 SoA, pas AoS

`Store` (`lib.rs:44`) détient 22 tableaux `*mut f64` input/output/bounds/AABB plus 3 tables de runs `*mut i32`. Côté JS : `TransformStore` (`soa.ts:44`) avec vues `Float64Array`/`Int32Array` correspondantes posées sur `WebAssembly.Memory.buffer` via pointeurs exportés (`lib.rs:564` `ptr_export!`, `backend.ts:178` `p_x()…p_run_len()`).

### 3.2 Runs de siblings, ordonnés par profondeur

WASM SIMD n'a pas de gather. Vectoriser à travers des parents arbitraires nécessiterait des loads de matrice parente par entité. Au lieu de cela `soa.ts:178` `buildStore` garantit que _les enfants d'un même parent sont contigus_ (BFS par parent : défile un parent, émet tous les enfants comme un run, les enfile). La world matrix parente est splattée une fois par run (`lib.rs:640` `f64x2_splat(*S.wa.add(p))`) et les enfants remplissent les deux lanes. `store.runStart/runLen/runParent` est la table d'itération ; `set_run_count` (`lib.rs:600`) en publie la longueur.

Le builder JS valide : exactement un root `parent===-1` (lève sur manquant/dupliqué, `soa.ts:104`), chaque index parent dans les bornes (`soa.ts:112`), root à l'index store 0 seedé à l'identité (`lib.rs:603` `seed_root`, `soa.ts:246` `composeJS` seed `wa[0]=1,wd[0]=1`). Entre rebuilds la sync par frame ne fait que gather les `x/y/scale/rotation/opacity` courants dans la vue input résidente et relance le kernel (`WasmBackendFacade.ts:458` `syncStore`).

### 3.3 Padding, alignement et trig pré-calculée

**Padding, pas boucle de reste.** `init` (`lib.rs:370`) alloue `capacity + 8` (et `simd_f32_bench.rs:128` utilise `+16` pour `f32x4`). Une queue de longueur impaire lit un slot au-delà de la fin logique — la lane de padding est écrite mais jamais relue (`lib.rs:643` commentaire `compose_simd`, commentaire upload `backend.ts:152`). Le store JS reflète le padding (`soa.ts:64` `capacity = count + 8`).

**`cos`/`sin` pré-calculés.** WASM n'a pas de transcendantales ; recomputer par frame était le plus gros coût du round 1 (`lib.rs:66`). JS écrit `cos=Math.cos(rotation)` une fois par build (`soa.ts:218` `writeInput`), et le gather résident par frame lit le cache `_getTrig()` (`WasmBackendFacade.ts:544` + `Entity.ts:1746` cache trig).

**Alignement 16 bytes.** `SIMD_ALIGN=16` (`lib.rs:84`). `leak_f64` utilise `alloc_zeroed` avec align 16 — `Vec<f64>` n'est aligné que sur 8 et rend `v128_load` sur SpiderMonkey ~7× plus lent (mesuré, par commentaire `lib.rs:84`). L'helper retourne null sur OOM plutôt que trapper, pour que `init` puisse rapporter `STATUS_OVERFLOW` et laisser le store précédent intact (`lib.rs:340` chemin `free_store` + overflow).

### 3.4 Dangers des vues en mémoire partagée

Les quatre backends core-rs (et chaque `Scene`) partagent une seule `WebAssembly.Memory`. Tout `*_init` peut faire croître la mémoire et détacher chaque autre vue `TypedArray` du backend (lue comme `byteLength===0`). D'où `backend.ts:373` `revalidateViews` / `viewsStale` (helper `backend.ts:38`) et `anim-backend.ts:121` / `hit-backend.ts:111` / `particle-backend.ts:112` idem, plus `WasmBackendFacade.ts:527` ré-acquisition cross-backend après gather `syncStore`. Le backend transform sonde aussi `typeof ex.compose_simd === "function"` (`backend.ts:201`) pour qu'un `.wasm` en cache périmé antérieur à `compute_aabbs_simd` dégrade vers le scalaire plutôt que throw (`#798`, `aabb-stale-module.test.ts`).

## 4. G1 — composition world-matrix (+ AABB)

**Ce qu'il accélère :** la composition `Canvas T * S * R` (`lib.rs:520` `compose_scalar` / `lib.rs:612` `compose_simd`, `soa.ts:246` `composeJS`) et la passe AABB world-space subséquente (`lib.rs:670` `compute_aabbs` / `lib.rs:790` `compute_aabbs_simd`, `soa.ts:316` `computeAabbsJS`). La world matrix de chaque entité (`a,b,c,d,e,f,opacity`) est `parentMatrix * T(x,y) * S(sx,sy) * R(cos,sin)`, puis ses bounds locales `[bx,by,bw,bh]` sont poussées à travers elle vers la world AABB (`aminx…amaxy`).

**Comment il atteint `Scene` :** `buildTreeStore` (`packages/core/src/wasm/scene-store.ts:30`) parcourt `Entity.children` en `InputNode[]` et `buildStore` ; `WasmBackendFacade` (région transform `packages/core/src/tree/scene/WasmBackendFacade.ts:168`, `WasmBackendFacade.ts:458` `syncStore`) hot-swap via `Scene.enableWasmTransforms` (`Scene.ts:1706`). Deux coûts d'intégration existent (voir `benchmarks/core-wasm/entry.ts:1`) : `copy` (upload+kernel+readback — re-upload chaque `Float64Array` puis relit `wa…wo`) vs `resident` (kernel seul, inputs/outputs déjà dans vues WASM). Resident — les accesseurs écrivent directement dans `inputView()`/`boundsView()` et le renderer lit `worldView()`/`aabbView()` (`backend.ts:320`/`backend.ts:420`, retour world-view `WasmBackendFacade.ts:518`) — est le chemin prévu et celui que les benchmarks rapportent comme `resident`.

**Gains mesurés** (`benchmarks/core-wasm/results/latest/core-wasm-chrome.json:1`, 2026-08-14, i7-14650HX, Chrome 151, `benchmarks/run-browsers.sh` — le seul harness quotable, voir AGENTS.md global) :

| topologie | n    | js ns/elem | copy ns/elem | resident ns/elem | resident speedup | AABB speedup |
| --------- | ---- | ---------- | ------------ | ---------------- | ---------------- | ------------ |
| flat      | 1k   | 4.8        | 4.83         | 2.73             | 1.76×            | ~1.0×        |
| flat      | 10k  | 4.26       | 5.37         | 2.77             | 1.54×            | 1.95×        |
| flat      | 100k | 4.55       | 8.64         | 3.57             | 1.27×            | 2.09×        |
| chain     | 1k   | 14.73      | 10.23        | 8.13             | 1.81×            | 1.14×        |
| chain     | 10k  | 15.25      | 10.1         | 7.15             | 2.13×            | 1.10×        |
| chain     | 100k | 16.25      | 13.63        | 7.35             | 2.21×            | 1.08×        |
| bushy     | 10k  | 10.46      | 8.25         | 4.72             | 2.21×            | 1.99×        |
| bushy     | 100k | 12.24      | 11.41        | 5.69             | 2.15×            | 2.22×        |

Firefox sur le même host est plus proche : ex. flat 1k `resident 1.15×`, chain 1k `2.63×` (`core-wasm-firefox.json:1`). L'écart moteur est réel — le contrat `run-browsers.sh` exige de rapporter les deux.

Le chemin copy peut être _plus lent_ que JS à petit/moyen fan-out (flat 1k `0.995×`, flat 10k `0.79×`, mesure `entry.ts:80` `copy`), car deux `Float64Array.set` plus deux lectures dominent ; la doc à `entry.ts:1` avertit que le nombre resident est la comparaison équitable pour la Phase 1. La passe AABB seule atteint ~2,2× à l'échelle car elle est appairée par lane sans walk de runs et sa réduction min/max est associative sous `js_min/js_max` total-order (`lib.rs:790` preuve sur sémantique NaN/±0 de `f64x2_min/max`).

**Pourquoi `f32x4` a été rejeté :** `Cargo.toml:14` + `lib.rs:20` / `simd_f32_bench.rs:1` — f32 porte ~7 chiffres significatifs (commentaire `lib.rs:6` : _"~93px error on a deep/bushy tree in #143"_) et n'est pas bit-comparable à la référence JS. Le kernel 4-lane (`simd_f32_bench.rs:128` pad `+16`, `f32x4_splat/mul/add` à `simd_f32_bench.rs:300`) est bench-only, gaté derrière `bench-f32` (`Cargo.toml:20`) donc jamais livré, et possède son propre store non fusionné `SF` (`simd_f32_bench.rs:44`).

## 5. G2 — drivers d'animation batchés (spring + tween)

**Ce qu'il accélère :** avancer _toutes_ les instances `SpringDriver`/`TweenDriver` actuellement actives en un seul appel `spring_step`/`tween_step` (`crates/vectojs-core-rs/src/anim.rs:1`) au lieu de la boucle JS par-driver `driver.tick()` (`packages/core/src/tree/scene/DriverTicker.ts:131` `tick`).

**Parité binaire — désormais exacte.** `anim.rs:8` note que c'était un spike de mesure désormais bit-à-bit identique. Les deux côtés écrivent les puissances entières en multiplication explicite (`t*t`, `t*t*t`, `-2*t+2` dans `anim.rs:360` `ease` et `packages/animation/src/easing.ts`), pas `Math.pow`/`powi` — ni l'un ni l'autre n'est correctement arrondi, et l'ancien appariement divergeait à ~1e-12. Les constantes spring (`anim.rs:12` `MAX_FRAME_DT=0.25`, `MAX_STEP_DT=1/120`, `VAL_EPSILON/VEL_EPSILON=0.005`) reflètent `packages/math/src/SpringPhysics.ts:5` (`MAX_FRAME_DT=0.25`, `MAX_STEP_DT=1/120`, epsilons `SpringPhysics.ts:59`). Le snap terminal tween (`anim.rs:410` _"must be exactly `to` once `active>=dur`"_ ) correspond à `TweenDriver.tick` de `packages/animation/src/drivers.ts` pour qu'un easing custom ne satisfaisant pas `f(1)===1` atterrisse quand même.

**Gating — le nombre compte.** Contrairement à G1 (100k nœuds chaque frame), les nombres de drivers actifs sont habituellement petits, donc le batching ne paie qu'au-delà d'un seuil. `Scene.animGate` (`Scene.ts:1904`) :

```ts
public animGate: { spring: number; tween: number; mixed: number } = {
  spring: 128, tween: 256, mixed: 128,
};
```

`DriverTicker.tick` (`DriverTicker.ts:50` `AnimGate`, `DriverTicker.ts:197` compta gate-open, `DriverTicker.ts:64` _"O(tree size) — the exact mistake G3's first benchmark made"_) gather les drivers batchables actifs en packs `Float64Array` denses (`anim-backend.ts:68` `ensure` + `springView`/`tweenView`) et exécute un kernel chacun ; les tweens à `EasingFn` custom ont `wasmEasingId === null` et restent en JS (`DriverTicker.ts:228`). Sous le gate, la boucle JS est conservée — le benchmark intégré `anim-wasm-scene` a trouvé que le churn d'allocation dominait le coût, pas le kernel (commentaire `DriverTicker.ts:68` référençant `benchmarks/anim-wasm`/`anim-wasm-scene`).

`Scene.animBatchedLastFrame` (`Scene.ts:2030` + doc `Scene.ts:1749` _"Definite-assignment because it holds \_wasmBackend"_) rapporte seulement si le gate _s'est ouvert_ ; distinct de `animBackend` (« installé »). `Scene.animThreshold` (`Scene.ts:1856`) est un alias rétro-compat qui lit `animGate.tween` et écrit les trois gates à la fois — préférez `animGate` (un seul seuil ne peut être juste pour les deux sortes).

**SoA + store séparé.** `anim.rs:44` `Anim` est un `static mut` distinct (`s_val/s_target/s_vel/s_stiff/s_damp/s_mass`, `t_from/t_to/t_elapsed/t_dur/t_delay/t_ease/t_val`, `spring_capacity/tween_capacity` à `anim.rs:54`) avec son propre `anim_init` (`anim.rs:158`) et retours `STATUS_*` — aucun contact croisé avec le `Store` transform. La façade JS est dense-pack : chaque frame qualifiante re-gather tous les drivers actifs depuis zéro (`anim-backend.ts:20` _"no cross-frame residency"_), exécute le kernel, scatter les résultats — donc drivers rejoignant/quittant ou gate basculant ne coûte aucune invalidation.

## 6. G3 — broad-phase hit-test (grille dense du viewport)

**Ce qu'il accélère :** `Scene.findEntityAt` (`HitTester.ts:12`) fait un walk depth-first `isPointInside` O(N) par événement pointeur (`HitTester.ts:227` `findHitRecursively`). Le kernel hit (`crates/vectojs-core-rs/src/hit.rs:1`) remplace la broad phase par une grille uniforme : bucket chaque AABB world d'entité interactive dans des cellules couvrant `[0,vw]×[0,vh]` à `cellSize=64`, puis une requête point ne scanne qu'une cellule et retourne le candidat AABB _le plus haut_ (index le plus grand — pré-ordre, invariant `packages/core/src/wasm/hit-store.ts:16` — plus grand index dessine plus tard). L'appelant confirme avec `isPointInside` précis, donc les hits non rectangulaires restent corrects et un hit de grille est conclusif (`HitTester.ts:119` _"The WASM path is conclusive"_ — aucun fallback JS ne suit une grille fiable).

**Portée :** tableaux `i32` denses plats, pas de hashing — un pointeur est toujours dans le viewport (`hit.rs:15`). Trois tableaux : `cell_start/cell_count` par cellule, `items` pour memberships `(entity, cell)`, avec build counting-sort (`hit.rs:280` `hit_build` : compte par cellule → prefix-sum vers `cell_start` → scatter). `hit_overflow()` (`hit.rs:220`) signale l'épuisement capacité items ; le côté JS traite l'overflow comme « grille non fiable, fallback » (`packages/core/src/wasm/hit-backend.ts:122` `runBuild` retourne `false` sur overflow). `hit_query` (`hit.rs:380`) ne scanne que la cellule du pointeur et retourne `-STATUS_UNINITIALIZED` quand `hit_init` n'a jamais tourné — distinguable d'un vrai miss (`-1`).

**Câblage côté JS :** `gatherHitAABBs` (`hit-store.ts:47`) parcourt `Entity.children` en pré-ordre — identique à l'ordre de `findHitRecursively` — collectant les world AABBs et une liste `boundless` pour entités sans `getBounds()` (routée via `boundless` et jamais lue depuis les slots AABB, `hit-store.ts:60`). Le gather fusionné (`hit-store-fused.ts`) réutilise le chemin world-matrix G1 (`WasmBackendFacade.ts:583` `ensureAabbs` + clé cache `hitGridFrame`/`hitGridStructureVersion` à `WasmBackendFacade.ts:394`) au lieu de recomputer quatre coins par entité. `HitTester.ts:60` / `WasmBackendFacade.ts:150` possèdent la grille viewport et le chemin `findEntityAtWasm` (`WasmBackendFacade.ts:334` `setHit` invalide la grille).

**Pas `@vectojs/graph-layout`.** Ce package (`packages/graph-layout/src/ForceLayout2D.ts:1`, `internal/BarnesHutQuadtree.ts:1` — vrai quadtree 2D avec collision first-class, sentinelle `ZERO_TIER` à `BarnesHutQuadtree.ts:5`) est un layout force 2D sans backend WASM. Le kernel force _3D_ est `crates/vectojs-force-rs` pour `@vectojs/graph3d` (voir §7).

## 7. G4 (+ force graph3d) — particules & Barnes-Hut

Deux kernels additionnels partagent la même discipline backend invisible mais ne sont pas étiquetés G1–G3 dans la séquence transform :

**G4 — sim particules CPU** (`crates/vectojs-core-rs/src/particle.rs:1`, `packages/core/src/wasm/particle-backend.ts:1`) : reflète `ComputeParticleEntity.updateCPU` (spring-to-origin, répulsion souris, impulsion explosion, integrate+damp, cap de vélocité, bounce+clamp, decay de vie). SoA `f32` (pas `f64`) car le buffer GPU/WGSL est `Float32Array` ; l'oracle différentiel est `particleStepReferenceF32` (`particle-backend.ts:340`) qui arrondit chaque intermédiaire avec `Math.fround` et utilise `sqrt(dx*dx+dy*dy)` (pas `Math.hypot`, f64 correctement arrondi — doc `particle-backend.ts:350`), donc bit-identique au kernel. Le `updateCPU` JS reste `f64` et diffère de <1 ULP/step — divergence CPU-vs-GPU acceptée. Le kernel fusionne `hasPendingAnimations` (retourne flag pending, `particle.rs:320` `EPS_VELOCITY/DISTANCE`) et utilise des retours négatifs pour rejet afin que `0` (« stabilisé ») soit distinguable de l'échec (`particle-backend.ts:110` `step`, `particle.rs:310` encodage status négatif `particle_step`).

La transposition SoA est `gather`/`scatter` sur stride-8 AoS (`particle-backend.ts:160` `gather` avec `PARTICLE_STRIDE_FLOATS`/`PARTICLE_OFFSET_*` de `ComputeParticleEntity.ts`).

**Octree Barnes-Hut Graph3D** (`crates/vectojs-force-rs/src/lib.rs:1`, `packages/graph3d/src/wasm/force-backend.ts:1`) : construit un octree centre-de-masse `f64` depuis des positions `f32` et accumule des accélérations de répulsion `f64` (`force_init`/`force_step`, pointeurs `force_pos`/`force_accel`). L'oracle JS est `packages/graph3d/src/layout/VectoForceLayout.ts`. Build+accumulate est 78–90% d'un tick (note `graph3d-frame` 2026-08-17 dans `force-rs/lib.rs:18`), donc le kernel remplace exactement cette phase — les ressorts de links, centering et intégration velocity-decay restent en JS. Les flags de build sont identiques à G1 — `crates/vectojs-force-rs/build.sh:20` `target-cpu=generic` pour garder `fma` dehors et préserver la parité d'arrondi `a*b + c*d` (doc `force-rs/build.sh:8`).

**`@vectojs/math` `SpatialHashGrid`** (`packages/math/src/SpatialHashGrid.ts:1`) n'est _pas_ backé WASM. C'est la broad-phase hash JS pure pour AABBs génériques d'entités (`MAX_CELLS_PER_AABB=64`, `query` `O(k)` cellules + résultats, doc `insert`/`cellsForAABB`) utilisée hors chemin hit Scene. La grille WASM de G3 et `SpatialHashGrid` résolvent des problèmes différents — ne les confondez pas en ajoutant une accélération spatiale.

## 8. Tests de parité binaire — le standard de vérification

La parité n'est pas « assez proche » — c'est `Object.is` par lane (`packages/core/test/wasm/differential.test.ts:78` `assertBitIdentical`), qui distingue `+0`/`-0` et traite `NaN===NaN` (via `toBe` avec sémantique `Object.is`). Les suites tournent sur le _même_ input `buildStore` pour JS et WASM :

- `packages/core/test/wasm/differential.test.ts:1` — transform (topologies `flat|chain|bushy|mixed`, counts 1→10k, `rng` seedé à `differential.test.ts:18`, assert `simd` et `scalar` match, cas scalaire `differential.test.ts:110`, réutilisation à travers scènes croissantes/rétrécissantes).
- `anim-kernel.test.ts`, `hit-kernel.test.ts`, `particle-kernel.test.ts` — équivalents G2/G3/G4 avec PRNG seedés.
- Suites dédiées rejet/vue : `abi-bounds.test.ts`, `aabb-stale-module.test.ts`, `compose-stale-module.test.ts`, `scene-wasm-upload-fallback.test.ts`, `scene-wasm-aabb-rejection.test.ts`, `scene-wasm-resident.test.ts`, `scene-store.test.ts`, `view-revalidation.test.ts`, `memory-growth.test.ts`, `shared-runtime.test.ts`, `hit-fused.test.ts`.

Toutes gatent sur `existsSync(wasmPath)` et `skipIf(!haveWasm)` (`differential.test.ts:14`) — un `.wasm` manquant skip, jamais fail, car JS est le fallback. Lancez-les avec `just wasm-test` (`just wasm` puis `vitest`) ; `just wasm-check` est fmt+clippy seulement. Le harness benchmark est séparé : seul `benchmarks/run-browsers.sh` headed sur un workspace Hyprland dédié avec fenêtre focus + vrai GPU produit des nombres quotables (voir AGENTS.md global et skill `hyprland-browser-bench`). `benchmarks/debug-page.ts` est headless et non quotable.

Détails mathématiques qui casseraient silencieusement la parité si changés :

- `js_min`/`js_max` propagent `NaN` et traitent `-0 < +0` (`lib.rs:655`, `hit.rs:220` `js_min_f32`/`js_max_f32`, `particle.rs:120` idem pour `f32`), correspondant à `Math.min`/`Math.max`. `f64::min/max` et `f32::min/max` de Rust ignorent `NaN` — une seule substitution `f64::min` diverge sur transforms overflowés où `Infinity*0 = NaN`.
- La réduction SIMD AABB est associative car `js_min/js_max` implémentent un ordre total — doc `lib.rs:790` prouve que `f64x2_min/max` ont les mêmes sémantiques NaN/zéro, donc un fold appairé par lane matche le left fold scalaire bit-à-bit.
- L'easing utilise des multiplies explicites, pas `powi`/`powf` (`anim.rs:360` `ease`, miroir JS `packages/animation/src/easing.ts`).
- L'oracle particule arrondit chaque intermédiaire avec `Math.fround` (`particle-backend.ts:340`) et utilise `sqrt(dx*dx+dy*dy)` pas `Math.hypot` — `particle.rs:120` `js_min_f32/js_max_f32/js_clamp_f32` matchent les mêmes sémantiques Math.

## 9. Fallback et gating — les coutures de résilience

**Retours status.** Chaque `*_init`/`*_step`/`compose_*`/`hit_build`/`force_step` retourne `STATUS_*` (`lib.rs:485`, `anim.rs:158` `springs_ready`/`tweens_ready`, `hit.rs:110` `hits_ready`, `particle.rs:90` `particles_ready`, `force-rs/lib.rs:18` vocabulaire `STATUS_*` miroir). `CAPACITY` signifie « count trop grand » ; `UNINITIALIZED` signifie « init jamais appelé » ; `BAD_RUN`/`OVERFLOW` couvrent échecs table de runs et allocation. L'appelant vérifie et fallback — le store reste intact et les vues restent valides (`backend.ts:230` early-return `ensure`, référencé à 5 endroits ; `WasmBackendFacade.ts:470` chemin rejet `uploadRuns`).

**Retry d'upload.** `WasmBackendFacade` (`WasmBackendFacade.ts:134` `WASM_UPLOAD_REJECT_LIMIT=3`, compteur `WasmBackendFacade.ts:492`) compte les rejets consécutifs `uploadRuns`. À 3 il désactive le backend transform _pour la vie de cette Scene_ (`WasmBackendFacade.ts:500` bascule `_mode='js'` — pas un second flag — et warn une fois via `hasWarnedUploadFallback` à `WasmBackendFacade.ts:501`). Une table de runs rejetée composerait le mauvais arbre, et une topologie réellement over-cap re-faile chaque frame coûtant `O(n)` `buildTreeStore` à chaque retry — donc consécutifs, pas cumulatifs. `WasmBackendFacade.ts:252` `setTransform` et le chemin succès à `WasmBackendFacade.ts:515` reset la série.

**Invalidation par croissance mémoire.** `viewsStale` (`backend.ts:38`) vérifie `byteLength===0` ou `buffer !== memory.buffer` ; `revalidateViews` par backend (`backend.ts:373`, `anim-backend.ts:121`, `hit-backend.ts:111`, `particle-backend.ts:112`) et la ré-acquisition cross-backend dans `WasmBackendFacade.ts:527` après gather `syncStore` gèrent la croissance mémoire linéaire partagée (`hit_init` alloue ses propres tableaux grille dans la même mémoire).

**Sonde module périmé.** `backend.ts:201` / `runAabbs` / `runKernel` vérifient `typeof ex.compose_simd === "function"` avant d'appeler — un `.wasm` en cache à URL fixe peut précéder `compute_aabbs_simd` et throw `TypeError` mid-render (`#662`/`#798`). Le chemin `rejected` pose `_aabbsFresh=false` dans les deux branches de rejet (`WasmBackendFacade.ts:481` + `:562` + `:607`) pour qu'un gather AABB fusionné ne lise jamais les bounds périmées de la frame précédente.

**Reporting des gates et budgets.** `backend.available` (`WasmTransformBackend.available`, `HitTestBackend`, etc.) est « installé » ; `Scene.animBatchedLastFrame` / `Scene.hitTestBackend` / `Scene.transformBackend` / `Scene.accelerators.*.reason` est « réellement utilisé » — la doc à `Scene.ts:1749` avertit de ne pas les confondre. `animGate` est trois seuils, pas un (`Scene.ts:1856` alias `animThreshold`). La clé cache hit-grid est `hitGridFrame` + `hitGridStructureVersion` (`WasmBackendFacade.ts:394`) — sans la composante structure une mutation même-frame hitterait contre une géométrie pré-mutation.

## 10. Comment ajouter un nouveau kernel WASM en toute sécurité

1. **Commencez dans `crates/vectojs-core-rs/src/` ou une crate sœur.** Donnez-lui son propre store `static mut`, tableaux SoA, `*_init` avec gardes `checked_add` + `checked_mul` et `free_*`/`free_partial_*` (voir `lib.rs:370` `init` + `free_store` + `free_partial_store`, `anim.rs:158` `anim_init` + `free_anim` + `free_partial_anim`, `hit.rs:130` `hit_init` + `free_hit`), prédicat `*_ready()` (`anim.rs:158` `springs_ready`), et accesseurs `ptr_export!` (`lib.rs:564`). Copiez la forme de `anim.rs:44` ou `hit.rs:44` — rien ne partage le `Store` transform. Initialisez la sentinelle no-store comme `Store::empty()`/`Anim::empty()`/`Hit::empty()` et publiez-la sur OOM pour que les appels ultérieurs obtiennent `STATUS_UNINITIALIZED` plutôt que lectures mémoire libérée (doc `lib.rs:120` `empty`).
2. **Utilisez `f64` sauf si le buffer est `f32` par contrat externe.** Le cœur transform est `f64`-only pour la parité ; seuls `particle.rs` et `simd_f32_bench.rs` sont `f32`, chacun avec son oracle et note de divergence explicite (`particle.rs:10` _"a separate differential oracle"_). N'ajoutez pas un second chemin de précision sans raison mesurée et un fichier différentiel séparé.
3. **Retournez des codes status, jamais trap.** `STATUS_OK=0` au succès, `STATUS_CAPACITY/UNINITIALIZED/BAD_RUN/OVERFLOW` au rejet — et n'écrivez rien. Miroité dans `packages/core/src/wasm/backend.ts:16` `WASM_STATUS` (et `force-rs/lib.rs:18` doc vocabulaire miroir _"Keep the two lists in sync"_). Pour retours tri-state (ex. flag pending 0/1), utilisez un status négatif en cas d'échec pour que `0` reste significatif (`particle.rs:310` encodage status négatif `particle_step`, consommateur `particle-backend.ts:110` `flag < 0`).
4. **Buildez via `just wasm` / `build.sh`.** Jamais un `cargo build --target wasm32-unknown-unknown` nu. Si vous ajoutez une seconde crate, ajoutez son propre `rust-toolchain.toml:1` (`targets=["wasm32-unknown-unknown"]`, `components=["clippy","rustfmt"]`, `profile="minimal"`) et `build.sh:20` avec `RUSTFLAGS="-C target-cpu=generic -C target-feature=+simd128 -C linker=rust-lld"` — voir `crates/vectojs-force-rs/build.sh:20` et `rust-toolchain.toml:10` comme templates. Câblez `just wasm-check` et provisioning toolchain CI (`.carryctx/rules/wasm-crate-build.md:9`).
5. **Ajoutez d'abord un oracle JS.** Écrivez la référence JS dans le package consommateur (`soa.ts:246` `composeJS`, `soa.ts:316` `computeAabbsJS`, `SpringPhysics.ts:5` + `packages/animation/src/easing.ts`, `particle-backend.ts:340` `particleStepReferenceF32`) et gardez-la comme fallback livré. Faites correspondre l'ordre des ops et la sémantique NaN de `Math.min`/`Math.max` (`lib.rs:655` `js_min/js_max`) pour que la parité `Object.is` soit atteignable. Les oracles non batchés comme `SpatialHashGrid.query` gardent leur propre contrat fallback coarse-superset ( `_"bounded by the grid's real content"_)
6. **Ajoutez un test différentiel.** Nouveau fichier sous `packages/core/test/wasm/` (ou `packages/graph3d/test/` pour force) suivant la forme `differential.test.ts:1` : même input `buildStore`/SoA, deux chemins, `assertBitIdentical` (`differential.test.ts:78`) via `toBe`/`Object.is`, PRNG seedé (`differential.test.ts:18` `rng`), skippé quand `!haveWasm` (`differential.test.ts:14`), couvrant kernels `simd` et `scalar` (`differential.test.ts:110`). Ajoutez tests rejet bound-overflow (forme `abi-bounds.test.ts`) et revalidation de vues (forme `view-revalidation.test.ts`, `memory-growth.test.ts`).
7. **Ajoutez la façade backend TypeScript.** Nouveau fichier sous `packages/core/src/wasm/` suivant la forme `anim-backend.ts:1`/`hit-backend.ts:1` : `ensure`/`revalidateViews`/`step` ou `run*`, checks `STATUS_OK`, helper `viewsStale`, `instantiateSync/Async/Streaming` qui retournent `null` à tout échec (pattern `backend.ts:467`). Partagez l'instance via `runtime.ts:1` (`CoreWasmRuntime` + `moduleCache`) — n'instanciez pas un second module. Revalidez après chaque `ensure` avant d'écrire dans les vues (pattern `backend.ts:373`, ré-acquisition cross-backend `WasmBackendFacade.ts:527`).
8. **Gatez-le.** Ajoutez un gate par feature dans `Scene`/`WasmBackendFacade` (`Scene.ts:1904` triple `animGate`, `WasmBackendFacade.ts:134` `WASM_UPLOAD_REJECT_LIMIT`, clé cache grille `WasmBackendFacade.ts:394`). Extrayez le reporting dans `WasmBackendFacade.ts:75` `AcceleratorReason`/`AcceleratorStatus`/`AcceleratorReport` pour que devtools puisse le lire sans atteindre quatre domaines. Benchmark dans `benchmarks/<name>-wasm/entry.ts` (`benchmarks/core-wasm/entry.ts:1`, `benchmarks/anim-wasm/entry.ts:1` modèle deux-coûts) avec `run-browsers.sh` sur workspace 240Hz dédié — seul ce harness produit des nombres quotables (AGENTS.md global + skill `hyprland-browser-bench`, `refreshHz` + speedup `js vs resident` séparément). Gardez le défaut de gate conservateur : mesurez le coût intégré (churn alloc, gather, sémantique `Math.min`) pas le temps micro-kernel.
9. **Câblez `Scene` en dernier.** Ajoutez le loader async `enableWasm*` (`Scene.ts:1706` `enableWasmTransforms` / `Scene.ts:1783` `enableWasmHitTest` / `Scene.ts:1809` `setAnimBackend` pattern) qui passe par `runtime.ts:48` `loadCoreWasmModule`/`createCoreWasmRuntime` et la garde de course runtime partagé à `WasmBackendFacade.ts:314` (_"A concurrent enableWasm_ may have won the race while we awaited"_). Le walk `Scene` qui nourrit le kernel doit être séparé de l'appel kernel — testez le walk + fallback JS avant de câbler WASM (`scene-store.ts:30` `buildTreeStore` est la jointure à tester en isolation).

## 11. Checklist avant de livrer un changement WASM

- [ ] `just wasm` (et `crates/vectojs-force-rs/build.sh` si touché) build ; `just wasm-check` (fmt + clippy `-D warnings`) passe.
- [ ] `just wasm-test` (différentiel WASM) passe — ou est `skipIf(!haveWasm)` quand aucun `.wasm` présent. Pas de `cargo build` nu dans scripts/CI.
- [ ] Nouveau kernel a retours `STATUS_*`, n'écrit rien au rejet, et a tests injectés de rejet ; le chemin JS est le fallback permanent.
- [ ] L'oracle JS correspond à l'ordre des ops et sémantique NaN/`-0` de `Math.min`/`Math.max` ; la parité `Object.is` tient pour coins NaN/±0 et lanes de queue `+16`/`+8`.
- [ ] Les nouvelles vues typed-array passent par `viewsStale`/`revalidateViews` (et ré-acquisition cross-backend) et sonde stale-module où applicable.
- [ ] Les défauts de gates sont conservateurs et mesurés intégrés (`benchmarks/run-browsers.sh` sur Chrome+Firefox headed ; rapportez `refreshHz`, speedup `js vs resident` et speedup AABB séparément).
- [ ] Reporting accélérateur mis à jour (`WasmBackendFacade.ts:75` `AcceleratorReason` et getter `Scene.accelerators`) et doc style `Scene.dart`/`_dirty` mise à jour si nouveaux champs dirty/reporting ajoutés.
- [ ] Copy asset `tsup` câblée (`tsup.config.ts:40` pattern) si un nouveau `.wasm` est publié.

## 12. Vocabulaire G1/G2/G3 — ce que signifient les labels

Les labels sont l'ordre chronologique d'invention, pas la priorité :

- **G1** — le cœur world-matrix + AABB (`crates/vectojs-core-rs/src/lib.rs:1`, `soa.ts:22`). Le premier kernel et le seul qui tourne chaque frame pour chaque entité. Tout le reste est gaté par taille de workload ; G1 n'est gaté que par « un `.wasm` est-il installé et `uploadRuns` a-t-il réussi ».
- **G2** — le spike d'animation batchée (`crates/vectojs-core-rs/src/anim.rs:1`). Nommé second car c'était le prochain SoA découpé. Désormais bit-identique mais a démarré comme spike de mesure — l'en-tête `anim.rs:1` dit _"measurement spike, not an integrated backend"_ et les benchmarks `benchmarks/anim-wasm` vs `benchmarks/anim-wasm-scene` décident s'il s'intègre. Ne lisez pas « G2 s'intègre » comme fait.
- **G3** — le spike grille hit-test (`crates/vectojs-core-rs/src/hit.rs:1`). Même statut : module de mesure avec son propre store, gaté par taille de grille viewport et `hit_overflow`. L'en-tête `hit.rs:1` dit _"measurement module, like anim"_.
- **G4** — sim particules (`crates/vectojs-core-rs/src/particle.rs:1`). Souvent appelé G4 mais pas dans le trio G1/G2/G3 ; gardé séparé car il est `f32` et a son propre oracle. `crates/vectojs-force-rs` (octree) n'est _pas_ G4 — c'est une seconde crate pour graph3d (différent `Cargo.toml:1`, différent chemin sortie `build.sh:1`).

Si vous ajoutez de la prose, gardez « G1/G2/G3 » comme shorthand pour « transform / anim-batch / hit-grid » et nommez G4 et force-rs explicitement quand vous les visez.

## 13. Baselines Forge et quand re-mesurer

Aucune table de benchmarks inline n'est une baseline. Les nombres quotables vivent dans `benchmarks/core-wasm/results/latest/` (`core-wasm-chrome.json:1`, `core-wasm-firefox.json:1` — schemaVersion 1, `refreshHz`, `panelHz`, `host.{cpu,gpu,driver}`, `rows[].{identical,jsNsPerEntity,copyNsPerEntity,residentNsPerEntity,copySpeedup,residentSpeedup,jsAabbNsPerEntity,wasmAabbNsPerEntity,aabbSpeedup}`) et leurs snapshots `history/`. Le contrat harness (`benchmarks/_shared/client.ts:1` `awaitStart`/`reportResult`, `benchmarks/core-wasm/entry.ts:1` modèle deux-coûts) exige un vrai navigateur headed foregroundé sur un workspace Hyprland dédié avec fenêtre focus et vrai GPU (`benchmarks/run-browsers.sh:1` — seul chemin quotable).

Re-mesurez quand :

- Changement de `lib.rs:84` `SIMD_ALIGN`, `soa.ts:64` `PAD`, `lib.rs:640` pattern `f64x2_splat` ou `build.sh:28` `RUSTFLAGS` — chacun déplace `residentSpeedup` de >10%.
- Changement des constantes spring `anim.rs:12` ou `anim.rs:360` `ease` — relancez micro `benchmarks/anim-wasm` + intégré `benchmarks/anim-wasm-scene` (Chrome : springs `2.06×` à 100 drivers, `3.7×` à 100k ; tweens `4.14×` à 100, `4.48×` à 1k — `anim-wasm-chrome.json:1` 2026-08-14) et reset `Scene.animGate` seulement si le coût intégré le justifie.
- Touche à `hit.rs:280` `hit_build` ou `hit-store.ts:47` gather — relancez `benchmarks/hit-wasm` / `benchmarks/scene-hit-wasm`.
- Touche à `particle.rs:310` ou `force-rs/lib.rs:1` — relancez `benchmarks/particle-wasm` / `benchmarks/graph3d-frame`.

Rapportez toujours Chrome _et_ Firefox avec `refreshHz` à côté des chiffres par frame ; Firefox nécessite `layout.frame_rate` posé sinon il rapporte ~60 Hz indétectablement bas (règle de mesure AGENTS.md global + skill `hyprland-browser-bench`).

## 14. Pièges qui ont déjà mordu

| piège                                                                             | file:line                                                      | statut                                                       |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| `~/.cargo/config.toml` `cfg(all)` joignant flags host dans link wasm              | `.carryctx/rules/wasm-crate-build.md:1`, `build.sh:8`          | corrigé par override `RUSTFLAGS`                             |
| `Vec<f64>` aligné seulement 8 bytes → `v128_load` SpiderMonkey 7× plus lent       | `lib.rs:84` `SIMD_ALIGN`                                       | corrigé par `alloc_zeroed` avec 16                           |
| Vues `TypedArray` périmées après `WebAssembly.Memory.grow` par un autre backend   | `backend.ts:38` `viewsStale`, `WasmBackendFacade.ts:527`       | corrigé par `revalidateViews` + ré-acquisition cross-backend |
| `.wasm` en cache périmé antérieur à `compute_aabbs_simd` → `TypeError` mid-render | `backend.ts:201` probe                                         | corrigé par fallback scalaire (`#798`)                       |
| `uploadRuns` rejeté composant le mauvais arbre / AABBs périmées                   | `WasmBackendFacade.ts:470` + `:481` `:562` `_aabbsFresh=false` | corrigé par limite retry (`DEC-0014`)                        |
| `Math.pow`/`powi` vs multiplies explicites → écart easing ~1e-12                  | `anim.rs:360` `ease`                                           | corrigé par `t*t` explicite                                  |
| `f64::min` ignorant NaN → AABB divergente sur transforms overflowés               | `lib.rs:655` `js_min`                                          | corrigé par `js_min/js_max` propageant Math                  |
| `f32` erreur ~93px sur arbre deep/bushy — livré comme kernel mort                 | `simd_f32_bench.rs:1`, `Cargo.toml:20` `bench-f32`             | corrigé par feature-gating                                   |
| `target-cpu` activant `fma` → single-rounding vs deux-roundings JS                | `build.sh:28` `generic`                                        | corrigé par `generic`                                        |
| `new URL('@vectojs/core/…', import.meta.url)` ne résolvant pas                    | `asset.ts:10`                                                  | corrigé par relatif `./vectojs_core.wasm`                    |

## Relations

- **Boss 06 (VMT runtime)** possède l'arbre `Entity`, le walk `Scene`, `structureVersion` → `storeStructureVersion` et le câblage `WASM_UPLOAD_REJECT_LIMIT` que ce boss accélère.
- **Boss 07 (renderer)** consomme les world matrices et AABBs que ce boss produit — une vue périmée ici est la version de ce boss d'un cache raster périmé.
- **Boss 11 (graph layout)** réutilise la même discipline de build (`crates/vectojs-force-rs`) pour la force 3D ; le quadtree 2D `@vectojs/graph-layout` (`BarnesHutQuadtree.ts:5`) reste JS-only.
- **Boss 02 (text/layout)** et **boss 03 (projection)** ne sont _pas_ backés WASM — n'allez pas chercher WASM quand le goulot est le shaping ou les carriers DOM.

## Références

- `crates/vectojs-core-rs/Cargo.toml:1` — manifest crate transform (crate-type, bench-f32, profil release)
- `crates/vectojs-core-rs/src/lib.rs:1` — G1 compose scalar/SIMD + AABB SIMD, Store, codes status, `js_min/js_max`
- `crates/vectojs-core-rs/src/anim.rs:1` — G2 batch spring/tween, easing à multiplies explicites, store séparé
- `crates/vectojs-core-rs/src/hit.rs:1` — G3 grille dense viewport, build counting-sort, overflow
- `crates/vectojs-core-rs/src/particle.rs:1` — G4 SoA particules f32, flag pending fusionné, rejet status négatif
- `crates/vectojs-core-rs/src/simd_f32_bench.rs:1` — bench-only f32x4, rejeté comme défaut (erreur ~93px)
- `crates/vectojs-force-rs/src/lib.rs:1` — octree Barnes-Hut graph3d (accumulate f64, positions f32, jitter `imul`)
- `crates/vectojs-core-rs/build.sh:1` / `crates/vectojs-force-rs/build.sh:1` — `RUSTFLAGS` corrects (`generic`, `+simd128`, `rust-lld`)
- `.carryctx/rules/wasm-crate-build.md:1` — règle build (just wasm, override RUSTFLAGS, binaire gitignoré)
- `packages/core/src/wasm/soa.ts:1` — SoA JS, `buildStore`, oracles `composeJS`/`computeAabbsJS`
- `packages/core/src/wasm/backend.ts:1` — backend transform (resident vs copy, `WASM_STATUS`, `viewsStale`, sonde stale-module)
- `packages/core/src/wasm/runtime.ts:1` — `CoreWasmRuntime` partagé + cache module global + backends lazy mémoïsés
- `packages/core/src/wasm/{anim,hit,particle}-backend.ts:1` / `asset.ts:1` — façades G2/G3/G4 + `coreWasmUrl`
- `packages/core/src/wasm/{scene-store,hit-store,hit-store-fused}.ts:1` — arbre → SoA / gather AABB / gather fusionné
- `packages/core/src/tree/scene/WasmBackendFacade.ts:1` — quatre backends, `AcceleratorReason/Report`, `syncStore`/`ensureAabbs`, retry upload, runtime partagé
- `packages/math/src/SpringPhysics.ts:1` / `packages/math/src/SpatialHashGrid.ts:1` — physique/grille JS (JS-only, pas WASM — `MAX_CELLS_PER_AABB=64`)
- `packages/core/test/wasm/differential.test.ts:1` + `anim-kernel.test.ts`/`hit-kernel.test.ts`/`particle-kernel.test.ts` — suites bit-identiques (`Object.is`), `skipIf(!haveWasm)`
- `benchmarks/core-wasm/entry.ts:1` / `benchmarks/anim-wasm/entry.ts:1` / `benchmarks/core-wasm/results/latest/:1` — mesures headed `run-browsers.sh` (Chrome+Firefox, `refreshHz`, `residentSpeedup`)
