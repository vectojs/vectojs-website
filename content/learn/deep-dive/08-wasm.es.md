+++
title = "08 — Aceleradores WASM — G1/G2/G3 y paridad de bits"
description = "Los backends WASM invisibles detrás de @vectojs/core: G1 world-matrix, G2 lote de animación, G3 grilla de hit (más G4 partículas), el store SoA que hace posible SIMD y el contrato de paridad de bits que mantiene WASM opcional."
weight = 28
+++

# 08 — Aceleradores WASM — G1/G2/G3 y paridad de bits

> **Boss 08** es invisible por diseño. Los kernels Rust (`crates/vectojs-core-rs`, `crates/vectojs-force-rs`) aceleran lo que el motor JS ya hace correctamente — composición de world-matrix, ticks de animación, broad-phase de hit, integración de partículas — y nunca se vuelven obligatorios. Cada ruta acelerada tiene un fallback JS que produce los _mismos bits_, y cada compilación, compuerta y test existe para mantener esa promesa.

- **Qué aprenderás**: por qué WASM es un backend invisible; el store SoA que hace posible `f64x2`; qué acelera cada uno de G1/G2/G3(+G4), cómo se controla por compuertas y qué midieron realmente los benchmarks con cabeza; cómo se testea la paridad de bits; y cómo añadir un nuevo kernel sin romper el contrato de fallback.
- **Qué no aprenderás**: dirty/ciclo de vida del VMT (boss 06), paridad de renderer/DPR (boss 07), ajuste de graph-layout (boss 11) o el mapeo de dos mundos de Three/XR (boss 09). Este documento es la capa de aceleración _entre_ el VMT y el renderer.

## 1. Por qué WASM es un backend invisible

VectoJS funciona correctamente con cero Rust. `packages/core/src/wasm/soa.ts:1` (`composeJS`, `computeAabbsJS`) y `packages/math/src/SpringPhysics.ts:1` / `packages/animation/src/easing.ts` son los oráculos y fallbacks _permanentes_; los manifiestos de los crates lo dicen explícitamente — `crates/vectojs-core-rs/Cargo.toml:6` _"invisible backend; the TypeScript path is the permanent fallback"_ y `crates/vectojs-force-rs/Cargo.toml:6` lo mismo para el kernel de fuerzas. El `.wasm` compilado en sí está en gitignore (`packages/core/src/wasm/vectojs_core.wasm`, `packages/graph3d/src/wasm/vectojs_force.wasm`) — se compila en CI, se publica en npm, nunca se commitea (`.carryctx/rules/wasm-crate-build.md:6`).

Tres restricciones se derivan de esa única decisión:

1. **La instanciación puede fallar y debe ser silenciosa.** CSP `wasm-unsafe-eval`, asset faltante, `simd128` no soportado, módulo cacheado obsoleto — cada loader retorna `null` y el llamante mantiene la ruta JS. `packages/core/src/wasm/backend.ts:467` `instantiateSync`/`instantiateAsync`/`instantiateStreaming`, `packages/core/src/wasm/runtime.ts:48` `loadCoreWasmModule`/`createCoreWasmRuntime`, `packages/graph3d/src/wasm/force-backend.ts:55` el equivalente para fuerzas, y `packages/core/src/wasm/asset.ts:22` `coreWasmUrl` / `packages/graph3d/src/wasm/asset.ts:22` `forceWasmUrl` para resolución de bundler. El fallo es el estado por defecto, no una ruta de error.

   El helper de URL importa: `new URL('@vectojs/core/…', import.meta.url)` no funciona — `new URL` solo resuelve refs _relativas_, y un especificador desnudo no es relativo (`asset.ts:10`). `new URL('./vectojs_core.wasm', import.meta.url)` desde _dentro_ del paquete es la única forma que tanto ESM nativo como los bundlers resuelven correctamente. Los llamantes hacen `await scene.enableWasmTransforms(coreWasmUrl)` (`asset.ts:8` ejemplo) y el método retorna `false` cuando el fetch/compilación falla (`Scene.ts:1704` docs de `enableWasmTransforms`: _"resolves true if WASM is now active, false if the JS path remains"_ ).

2. **Los kernels deben ser falibles, no atrapar.** Los exports retornan `STATUS_OK` (0) o un `STATUS_CAPACITY/UNINITIALIZED/BAD_RUN/OVERFLOW` no cero (`crates/vectojs-core-rs/src/lib.rs:485` constantes, `packages/core/src/wasm/backend.ts:16` `WASM_STATUS`) y no escriben _nada_ al rechazar. El lado JS trata cualquier valor no cero como "ejecuta la ruta de referencia en este frame" (`packages/core/src/wasm/backend.ts:212` retorno temprano de `compose`, `packages/core/src/wasm/anim-backend.ts:173` booleano de `stepSprings`, `packages/core/src/tree/scene/WasmBackendFacade.ts:487` reintento de subida, `packages/core/src/wasm/particle-backend.ts:110` estado negativo tri-estado).

3. **Memoria lineal compartida, módulo compartido.** Antes de `packages/core/src/wasm/runtime.ts:1` (`CoreWasmRuntime`), cuatro backends significaban cuatro compilaciones y cuatro memorias lineales para el mismo binario. Ahora un único `WebAssembly.Module` se cachea globalmente por URL (`runtime.ts:38` `moduleCache`, claveado solo en cadena/URL — los bytes no se cachean, docs de `runtime.ts:48` `cacheKey`) y una única `Instance` por `Scene` expone los cuatro stores vía distintos estáticos `static mut` que nunca se aliasan (`crates/vectojs-core-rs/src/lib.rs:44` `Store`, `src/anim.rs:44` `Anim`, `src/hit.rs:44` `Hit`, `src/particle.rs:44` `Particles`, `crates/vectojs-force-rs/src/lib.rs:44` `Octree`+`POS`/`ACCEL`). `CoreWasmRuntime` construye cada backend de forma perezosa y lo memoiza (`runtime.ts:90` `transform()`/`anim()`/`hit()`/`particle()`) para que una Scene que solo habilita transformaciones nunca pague asignación de anim/hit.

Los reportes mantienen "instalado" y "activo en este frame" separados. `Scene.accelerators: AcceleratorReport` (`WasmBackendFacade.ts:122` forma del reporte, `Scene.ts:1749` doc _"Definite-assignment because it needs \_wasmBackend"_) retorna `{ available, activeThisFrame, reason, path }` por acelerador — `available` es "backend instalado, compuerta permitiendo", `activeThisFrame` es "realmente ejecutado", `reason` es `not-installed | below-gate | rejected | active` (`WasmBackendFacade.ts:75` `AcceleratorReason`). `Scene.animGate` vs `Scene.animBackend` es la confusión clásica: una compuerta por debajo del conteo de drivers hace `animBackend==='wasm'` mientras `animBatchedLastFrame===false` (ver `Scene.ts:1749` y `Scene.ts:1904` docs de compuerta).

## 2. Disciplina de compilación — `just wasm`, no cargo a pelo

La trampa es `~/.cargo/config.toml` (`.carryctx/rules/wasm-crate-build.md:1`): una sección `[target.'cfg(all())']` también coincide con `wasm32`, y Cargo _une_ sus `rustflags` con los específicos de target. Flags de host como `-C target-cpu=native` o `-fuse-ld=mold` se filtran al enlace `wasm32-unknown-unknown` y lo rompen (`rust-lld: error: unknown argument: -fuse-ld=mold`). Env `RUSTFLAGS` _reemplaza_ los flags de config; la config específica de target no lo hace.

La única compilación correcta:

```bash
just wasm  # runs crates/vectojs-core-rs/build.sh with correct RUSTFLAGS
# or for the force kernel:
# crates/vectojs-force-rs/build.sh  (same RUSTFLAGS)

# what build.sh does (crates/vectojs-core-rs/build.sh:28):
RUSTFLAGS="-C target-cpu=generic -C target-feature=+simd128 -C linker=rust-lld" \
  cargo build --release --target wasm32-unknown-unknown --manifest-path crates/vectojs-core-rs/Cargo.toml
```

Detalles de reglas (`crates/vectojs-core-rs/build.sh:1`, `crates/vectojs-force-rs/build.sh:1`, `.carryctx/rules/wasm-crate-build.md:1`):

| regla                                                          | file:line                                                        | por qué                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target-cpu=generic`                                           | `build.sh:28`                                                    | mantiene `fma` (fused multiply-add) fuera. `generic` no tiene `fma`; una CPU afinada para host fusionaría `a*b + c*d` en un único redondeo, mientras JS hace dos — rompiendo la paridad de bits. `crates/vectojs-force-rs/build.sh:8` lo señala explícitamente. |
| `target-feature=+simd128`                                      | `build.sh:28`                                                    | habilita `v128`/`f64x2`/`f32x4`. Sin ello los kernels `#[target_feature(enable="simd128")]` (`lib.rs:612`, comentarios de `particle`) fallan al compilar o atrapan.                                                                                             |
| `linker=rust-lld`                                              | `build.sh:28`                                                    | sobrescribe cualquier linker `~/.cargo/config` como `mold`.                                                                                                                                                                                                     |
| `panic="abort"` + `strip` + `lto` + `codegen-units=1`          | `Cargo.toml:22`                                                  | binario mínimo y determinista.                                                                                                                                                                                                                                  |
| `edition="2024"` + `rust-toolchain.toml:10` `channel="stable"` | `rust-toolchain.toml:1`, `.carryctx/rules/wasm-crate-build.md:3` | el pin exacto del canal es _stable_, no una versión — un pin de versión exacta rompe cajas offline/espejo; CI pinea la versión exacta en su lugar.                                                                                                              |
| `just wasm-check`                                              | `.carryctx/rules/wasm-crate-build.md:5`                          | `cargo fmt --check` + `cargo clippy --target wasm32-unknown-unknown -- -D warnings` con los mismos `RUSTFLAGS`.                                                                                                                                                 |
| `just wasm-test`                                               | `.carryctx/rules/wasm-crate-build.md:5`                          | `just wasm` y luego la suite diferencial del core (`vitest`).                                                                                                                                                                                                   |
| binario en gitignore                                           | `build.sh:14`, `.carryctx/rules/wasm-crate-build.md:6`           | contribuidores solo-TS nunca necesitan Rust. Publicado vía paso de copia `tsup.config.ts:40` (`packages/graph3d/tsup.config.ts:40` `vectojs_force.wasm → dist/wasm/`).                                                                                          |
| `Cargo.toml` `publish=false`                                   | `Cargo.toml:5` (ambos crates)                                    | los crates no son paquetes de crates.io — solo el `.wasm` vía npm importa.                                                                                                                                                                                      |

El kernel de evaluación `f32x4` (`crates/vectojs-core-rs/src/simd_f32_bench.rs:1`) está detrás de `bench-f32` (`Cargo.toml:20` `bench-f32 = []`) y nunca se envía — medido y rechazado. `build.sh:18` documenta la forma opt-in `./build.sh --features bench-f32` y por qué el valor por defecto lo excluye: f32 fue medido y rechazado.

## 3. El store SoA — la forma que hace alcanzable SIMD

`packages/core/src/wasm/soa.ts:22` es la mitad del sistema; `crates/vectojs-core-rs/src/lib.rs:1` es la otra. El comentario en `lib.rs:10` es crítico:

> One flat `f64` array per field. With an interleaved record, consecutive entities' `x` would be `N*8` apart — a `v128` load cannot fetch two of them.

### 3.1 SoA, no AoS

`Store` (`lib.rs:44`) contiene 22 arrays `*mut f64` de entrada/salida/bounds/AABB más 3 tablas de ejecución `*mut i32`. Lado JS: `TransformStore` (`soa.ts:44`) con vistas `Float64Array`/`Int32Array` coincidentes sobre `WebAssembly.Memory.buffer` vía punteros exportados (`lib.rs:564` `ptr_export!`, `backend.ts:178` `p_x()…p_run_len()`).

### 3.2 Carreras de hermanos, ordenadas por profundidad

WASM SIMD no tiene gather. Vectorizar sobre padres arbitrarios requeriría cargas de matriz padre por entidad. En su lugar `soa.ts:178` `buildStore` garantiza que _los hijos de un mismo padre son contiguos_ (BFS por padre: desencola un padre, emite todos los hijos como una ejecución, los encola). La world matrix del padre se splattea una vez por ejecución (`lib.rs:640` `f64x2_splat(*S.wa.add(p))`) y los hijos llenan ambos carriles. `store.runStart/runLen/runParent` es la tabla de iteración; `set_run_count` (`lib.rs:600`) publica su longitud.

El builder JS valida: exactamente un root `parent===-1` (lanza si falta/duplica, `soa.ts:104`), cada índice padre en rango (`soa.ts:112`), root en índice 0 del store sembrado a identidad (`lib.rs:603` `seed_root`, `soa.ts:246` `composeJS` siembra `wa[0]=1,wd[0]=1`). Entre reconstrucciones la sincronización por frame solo reúne `x/y/scale/rotation/opacity` actuales en la vista de entrada residente y re-ejecuta el kernel (`WasmBackendFacade.ts:458` `syncStore`).

### 3.3 Padding, alineación y trigonometría precomputada

**Padding, no bucle de resto.** `init` (`lib.rs:370`) asigna `capacity + 8` (y `simd_f32_bench.rs:128` usa `+16` para `f32x4`). Una cola de longitud impar lee un slot más allá del final lógico — el carril de padding se escribe pero nunca se lee de vuelta (`lib.rs:643` comentario de `compose_simd`, `backend.ts:152` comentario de subida). El store JS refleja el padding (`soa.ts:64` `capacity = count + 8`).

**`cos`/`sin` precomputados.** WASM no tiene trascendentales; recomputar por frame fue el mayor coste en la ronda 1 (`lib.rs:66`). JS escribe `cos=Math.cos(rotation)` una vez por construcción (`soa.ts:218` `writeInput`), y la recolección residente por frame lee el `_getTrig()` cacheado (`WasmBackendFacade.ts:544` + `Entity.ts:1746` caché de trig).

**Alineación de 16 bytes.** `SIMD_ALIGN=16` (`lib.rs:84`). `leak_f64` usa `alloc_zeroed` con alineación de 16 bytes — `Vec<f64>` solo tiene alineación de 8 bytes y hace `v128_load` en SpiderMonkey ~7× más lento (medido, según comentario de `lib.rs:84`). El helper retorna null en OOM en lugar de atrapar, así `init` puede reportar `STATUS_OVERFLOW` y dejar el store previo intacto (`lib.rs:340` `free_store` + ruta de overflow).

### 3.4 Riesgos de vistas en memoria compartida

Los cuatro backends de core-rs (y cada `Scene`) comparten una única `WebAssembly.Memory`. Cualquier `*_init` puede hacer crecer la memoria y desconectar las vistas `TypedArray` de cada otro backend (leídas como `byteLength===0`). De ahí `backend.ts:373` `revalidateViews` / `viewsStale` (helper en `backend.ts:38`) y `anim-backend.ts:121` / `hit-backend.ts:111` / `particle-backend.ts:112` lo mismo, más `WasmBackendFacade.ts:527` re-adquisición cruzada tras la recolección de `syncStore`. El backend de transformación también sondea `typeof ex.compose_simd === "function"` (`backend.ts:201`) para que un `.wasm` cacheado obsoleto anterior a `compute_aabbs_simd` degrade a escalar en lugar de lanzar (`#798`, `aabb-stale-module.test.ts`).

## 4. G1 — composición de world-matrix (+ AABB)

**Qué acelera:** la composición `Canvas T * S * R` (`lib.rs:520` `compose_scalar` / `lib.rs:612` `compose_simd`, `soa.ts:246` `composeJS`) y el pase posterior de AABB en espacio mundial (`lib.rs:670` `compute_aabbs` / `lib.rs:790` `compute_aabbs_simd`, `soa.ts:316` `computeAabbsJS`). Cada world matrix de entidad (`a,b,c,d,e,f,opacity`) es `parentMatrix * T(x,y) * S(sx,sy) * R(cos,sin)`, luego sus bounds locales `[bx,by,bw,bh]` se empujan a través de ella al AABB mundial (`aminx…amaxy`).

**Cómo llega a `Scene`:** `buildTreeStore` (`packages/core/src/wasm/scene-store.ts:30`) recorre `Entity.children` hacia `InputNode[]` y `buildStore`; `WasmBackendFacade` (`packages/core/src/tree/scene/WasmBackendFacade.ts:168` región de transformación, `WasmBackendFacade.ts:458` `syncStore`) hace hot-swap vía `Scene.enableWasmTransforms` (`Scene.ts:1706`). Existen dos costes de integración (ver `benchmarks/core-wasm/entry.ts:1`): `copy` (subida+kernel+lectura — re-sube cada `Float64Array` y luego lee `wa…wo`) vs `resident` (solo kernel, entradas/salidas ya en vistas WASM). Resident — los accesores escriben directamente en `inputView()`/`boundsView()` y el renderer lee `worldView()`/`aabbView()` (`backend.ts:320`/`backend.ts:420`, `WasmBackendFacade.ts:518` retorno de world-view) — es la ruta diseñada y es lo que los benchmarks reportan como `resident`.

**Ganancias medidas** (`benchmarks/core-wasm/results/latest/core-wasm-chrome.json:1`, 2026-08-14, i7-14650HX, Chrome 151, `benchmarks/run-browsers.sh` — el único harness citable, ver AGENTS.md global):

| topología | n    | js ns/elem | copy ns/elem | resident ns/elem | speedup resident | speedup AABB |
| --------- | ---- | ---------- | ------------ | ---------------- | ---------------- | ------------ |
| flat      | 1k   | 4.8        | 4.83         | 2.73             | 1.76×            | ~1.0×        |
| flat      | 10k  | 4.26       | 5.37         | 2.77             | 1.54×            | 1.95×        |
| flat      | 100k | 4.55       | 8.64         | 3.57             | 1.27×            | 2.09×        |
| chain     | 1k   | 14.73      | 10.23        | 8.13             | 1.81×            | 1.14×        |
| chain     | 10k  | 15.25      | 10.1         | 7.15             | 2.13×            | 1.10×        |
| chain     | 100k | 16.25      | 13.63        | 7.35             | 2.21×            | 1.08×        |
| bushy     | 10k  | 10.46      | 8.25         | 4.72             | 2.21×            | 1.99×        |
| bushy     | 100k | 12.24      | 11.41        | 5.69             | 2.15×            | 2.22×        |

Firefox en el mismo host está más cerca: p. ej. flat 1k `resident 1.15×`, chain 1k `2.63×` (`core-wasm-firefox.json:1`). La brecha entre motores es real — el contrato de `run-browsers.sh` requiere reportar ambos.

La ruta copy puede ser _más lenta_ que JS en fan-out pequeño/mediano (flat 1k `0.995×`, flat 10k `0.79×`, medición `entry.ts:80` `copy`), porque dos `Float64Array.set` más dos lecturas dominan; la doc en `entry.ts:1` advierte que el número resident es la comparación justa para la Fase 1. El pase AABB solo alcanza ~2,2× a escala porque está emparejado por carriles sin recorrido de ejecuciones y su reducción min/max es asociativa bajo el orden total `js_min/js_max` (`lib.rs:790` prueba sobre semántica NaN/±0 de `f64x2_min/max`).

**Por qué se rechazó `f32x4`:** `Cargo.toml:14` + `lib.rs:20` / `simd_f32_bench.rs:1` — f32 lleva ~7 dígitos significativos (comentario en `lib.rs:6`: _"~93px error on a deep/bushy tree in #143"_) y no es bit-comparable con la referencia JS. El kernel de 4 carriles (`simd_f32_bench.rs:128` pad `+16`, `f32x4_splat/mul/add` en `simd_f32_bench.rs:300`) es solo para bench, controlado por `bench-f32` (`Cargo.toml:20`) así nunca se envía, y tiene su propio store no fusionado `SF` (`simd_f32_bench.rs:44`).

## 5. G2 — drivers de animación en lote (spring + tween)

**Qué acelera:** avanzar _todas_ las instancias `SpringDriver`/`TweenDriver` actualmente activas en una sola llamada `spring_step`/`tween_step` (`crates/vectojs-core-rs/src/anim.rs:1`) en lugar del bucle JS por driver `driver.tick()` (`packages/core/src/tree/scene/DriverTicker.ts:131` `tick`).

**Paridad de bits — ahora exacta.** `anim.rs:8` señala que esto fue un spike de medición que ahora coincide bit a bit. Ambos lados escriben potencias enteras como multiplicación explícita (`t*t`, `t*t*t`, `-2*t+2` en `anim.rs:360` `ease` y `packages/animation/src/easing.ts`), no `Math.pow`/`powi` — ninguno está correctamente redondeado, y el emparejamiento antiguo divergía en ~1e-12. Las constantes de spring (`anim.rs:12` `MAX_FRAME_DT=0.25`, `MAX_STEP_DT=1/120`, `VAL_EPSILON/VEL_EPSILON=0.005`) reflejan `packages/math/src/SpringPhysics.ts:5` (`MAX_FRAME_DT=0.25`, `MAX_STEP_DT=1/120`, `SpringPhysics.ts:59` epsilons). El snap terminal del tween (`anim.rs:410` _"must be exactly `to` once `active>=dur`"_) coincide con `packages/animation/src/drivers.ts` `TweenDriver.tick` para que un easing personalizado que no satisface `f(1)===1` aún aterrice.

**Gating — el conteo importa.** A diferencia de G1 (100k nodos cada frame), los conteos de drivers activos suelen ser pequeños, así que el lote solo compensa por encima de un umbral. `Scene.animGate` (`Scene.ts:1904`):

```ts
public animGate: { spring: number; tween: number; mixed: number } = {
  spring: 128, tween: 256, mixed: 128,
};
```

`DriverTicker.tick` (`DriverTicker.ts:50` `AnimGate`, `DriverTicker.ts:197` contabilidad de apertura de compuerta, `DriverTicker.ts:64` _"O(tree size) — the exact mistake G3's first benchmark made"_) reúne drivers en lote activos en packs densos `Float64Array` (`anim-backend.ts:68` `ensure` + `springView`/`tweenView`) y ejecuta un kernel por cada uno; los tweens con `EasingFn` personalizada tienen `wasmEasingId === null` y permanecen en JS (`DriverTicker.ts:228`). Por debajo de la compuerta se mantiene el bucle JS — el benchmark integrado `anim-wasm-scene` encontró que el churn de asignación dominaba el coste, no el kernel (comentario en `DriverTicker.ts:68` referenciando `benchmarks/anim-wasm`/`anim-wasm-scene`).

`Scene.animBatchedLastFrame` (`Scene.ts:2030` + `Scene.ts:1749` doc _"Definite-assignment because it holds \_wasmBackend"_) reporta solo si la compuerta _se abrió_; distinto de `animBackend` ("instalado"). `Scene.animThreshold` (`Scene.ts:1856`) es un alias de retrocompatibilidad que lee `animGate.tween` y escribe las tres compuertas a la vez — prefiere `animGate` (un único umbral no puede ser correcto para ambos tipos).

**SoA + store separado.** `anim.rs:44` `Anim` es un `static mut` distinto (`s_val/s_target/s_vel/s_stiff/s_damp/s_mass`, `t_from/t_to/t_elapsed/t_dur/t_delay/t_ease/t_val`, `spring_capacity/tween_capacity` en `anim.rs:54`) con su propio `anim_init` (`anim.rs:158`) y retornos `STATUS_*` — sin contacto cruzado con el `Store` de transformación. La fachada JS es de empaquetado denso: cada frame calificado reúne todos los drivers activos desde cero (`anim-backend.ts:20` _"no cross-frame residency"_), ejecuta el kernel, dispersa resultados — así los drivers que entran/salen o el cambio de compuerta no cuesta invalidación.

## 6. G3 — broad-phase de hit-test (grilla densa de viewport)

**Qué acelera:** `Scene.findEntityAt` (`HitTester.ts:12`) hace un recorrido `isPointInside` en profundidad `O(N)` por evento de puntero (`HitTester.ts:227` `findHitRecursively`). El kernel de hit (`crates/vectojs-core-rs/src/hit.rs:1`) reemplaza el broad-phase con una grilla uniforme: agrupa el AABB mundial de cada entidad interactiva en celdas que cubren `[0,vw]×[0,vh]` a `cellSize=64`, luego una consulta puntual escanea solo una celda y retorna el candidato AABB _superior_ (índice más alto — preorden, invariante en `packages/core/src/wasm/hit-store.ts:16` — índice mayor dibuja después). El llamante confirma con `isPointInside` preciso, así los hits no rectangulares permanecen correctos y un hit de grilla es concluyente (`HitTester.ts:119` _"The WASM path is conclusive"_ — ningún fallback JS sigue a una grilla confiable).

**Alcance:** arrays planos densos `i32`, no hashing — un puntero siempre está dentro del viewport (`hit.rs:15`). Tres arrays: `cell_start/cell_count` por celda, `items` para membresías `(entity, cell)`, con construcción counting-sort (`hit.rs:280` `hit_build`: conteo por celda → prefix-sum a `cell_start` → dispersión). `hit_overflow()` (`hit.rs:220`) señala agotamiento de capacidad de items; el lado JS trata el overflow como "grilla no confiable, retrocede" (`packages/core/src/wasm/hit-backend.ts:122` `runBuild` retorna `false` en overflow). `hit_query` (`hit.rs:380`) escanea solo la celda del puntero y retorna `-STATUS_UNINITIALIZED` cuando `hit_init` nunca se ejecutó — distinguible de un miss genuino (`-1`).

**Cableado del lado JS:** `gatherHitAABBs` (`hit-store.ts:47`) recorre `Entity.children` en preorden — idéntico al orden de `findHitRecursively` — recolectando AABBs mundiales y una lista `boundless` para entidades sin `getBounds()` (enrutadas vía `boundless` y nunca leídas desde los slots AABB, `hit-store.ts:60`). La recolección fusionada (`hit-store-fused.ts`) reutiliza la ruta de world-matrix G1 (`WasmBackendFacade.ts:583` `ensureAabbs` + clave de caché `hitGridFrame`/`hitGridStructureVersion` en `WasmBackendFacade.ts:394`) en lugar de recomputar cuatro esquinas por entidad. `HitTester.ts:60` / `WasmBackendFacade.ts:150` poseen la grilla de viewport y la ruta `findEntityAtWasm` (`WasmBackendFacade.ts:334` `setHit` invalida la grilla).

**No es `@vectojs/graph-layout`.** Ese paquete (`packages/graph-layout/src/ForceLayout2D.ts:1`, `internal/BarnesHutQuadtree.ts:1` — quadtree 2D verdadero con colisión de primera clase, centinela `ZERO_TIER` en `BarnesHutQuadtree.ts:5`) es un layout de fuerzas _2D_ sin backend WASM. El kernel de fuerzas _3D_ es `crates/vectojs-force-rs` para `@vectojs/graph3d` (ver §7).

## 7. G4 (+ fuerza de graph3d) — partículas y Barnes-Hut

Dos kernels adicionales comparten la misma disciplina de backend invisible pero no están etiquetados G1–G3 en la secuencia de transformación:

**G4 — sim de partículas CPU** (`crates/vectojs-core-rs/src/particle.rs:1`, `packages/core/src/wasm/particle-backend.ts:1`): refleja `ComputeParticleEntity.updateCPU` (spring al origen, repulsión de ratón, impulso de explosión, integración+amortiguación, tope de velocidad, rebote+clamp, decaimiento de vida). SoA `f32` (no `f64`) porque el buffer GPU/WGSL es `Float32Array`; el oráculo diferencial es `particleStepReferenceF32` (`particle-backend.ts:340`) que redondea cada intermedio con `Math.fround` y usa `sqrt(dx*dx+dy*dy)` (no `Math.hypot`, f64 correctamente redondeado — doc en `particle-backend.ts:350`), así es bit-idéntico al kernel. El `updateCPU` JS permanece en `f64` y difiere en <1 ULP/paso — divergencia CPU-vs-GPU aceptada. El kernel fusiona `hasPendingAnimations` (retorna flag pendiente, `particle.rs:320` `EPS_VELOCITY/DISTANCE`) y usa retornos negativos para rechazo para que `0` ("asentado") sea distinguible de fallo (`particle-backend.ts:110` `step`, `particle.rs:310` codificación de estado negativo de `particle_step`).

La transposición SoA es `gather`/`scatter` sobre AoS stride-8 (`particle-backend.ts:160` `gather` con `PARTICLE_STRIDE_FLOATS`/`PARTICLE_OFFSET_*` de `ComputeParticleEntity.ts`).

**Octree Barnes-Hut de Graph3D** (`crates/vectojs-force-rs/src/lib.rs:1`, `packages/graph3d/src/wasm/force-backend.ts:1`): construye un octree de centro de masas `f64` desde posiciones `f32` y acumula aceleraciones de repulsión `f64` (`force_init`/`force_step`, punteros `force_pos`/`force_accel`). El oráculo JS es `packages/graph3d/src/layout/VectoForceLayout.ts`. Construir+acumular es 78–90% de un tick (nota `graph3d-frame` 2026-08-17 en `force-rs/lib.rs:18`), así que el kernel reemplaza exactamente esa fase — los resortes de enlaces, centrado e integración de decaimiento de velocidad permanecen en JS. Los flags de compilación son idénticos a G1 — `crates/vectojs-force-rs/build.sh:20` `target-cpu=generic` para mantener `fma` fuera y preservar paridad de redondeo `a*b + c*d` (doc en `force-rs/build.sh:8`).

**`@vectojs/math` `SpatialHashGrid`** (`packages/math/src/SpatialHashGrid.ts:1`) _no_ tiene respaldo WASM. Es el hash broad-phase JS puro para AABBs genéricos de entidades (`MAX_CELLS_PER_AABB=64`, `query` `O(k)` celdas + resultados, doc de `insert`/`cellsForAABB`) usado fuera de la ruta de hit de Scene. La grilla WASM de G3 y `SpatialHashGrid` resuelven problemas distintos — no los confundas al añadir aceleración espacial.

## 8. Tests de paridad de bits — el estándar de verificación

La paridad no es "suficientemente cerca" — es `Object.is` por carril (`packages/core/test/wasm/differential.test.ts:78` `assertBitIdentical`), que distingue `+0`/`-0` y trata `NaN===NaN` (vía `toBe` con semántica `Object.is`). Las suites corren sobre la _misma_ entrada `buildStore` para JS y WASM:

- `packages/core/test/wasm/differential.test.ts:1` — transformación (topologías `flat|chain|bushy|mixed`, conteos 1→10k, `rng` sembrado en `differential.test.ts:18`, afirma que tanto `simd` como `scalar` coinciden, caso escalar en `differential.test.ts:110`, reutilización entre escenas crecientes/decrecientes).
- `anim-kernel.test.ts`, `hit-kernel.test.ts`, `particle-kernel.test.ts` — equivalentes G2/G3/G4 con PRNGs sembrados.
- Suites dedicadas de rechazo/vista: `abi-bounds.test.ts`, `aabb-stale-module.test.ts`, `compose-stale-module.test.ts`, `scene-wasm-upload-fallback.test.ts`, `scene-wasm-aabb-rejection.test.ts`, `scene-wasm-resident.test.ts`, `scene-store.test.ts`, `view-revalidation.test.ts`, `memory-growth.test.ts`, `shared-runtime.test.ts`, `hit-fused.test.ts`.

Todas controladas por `existsSync(wasmPath)` y `skipIf(!haveWasm)` (`differential.test.ts:14`) — `.wasm` faltante omite, nunca falla, porque JS es el fallback. Ejecútalas con `just wasm-test` (`just wasm` luego `vitest`); `just wasm-check` es solo fmt+clippy. El harness de benchmarks es separado: solo `benchmarks/run-browsers.sh` con cabeza en un workspace Hyprland dedicado con ventana enfocada + GPU real produce números citables (ver AGENTS.md global y skill `hyprland-browser-bench`). `benchmarks/debug-page.ts` es headless y no citable.

Detalles matemáticos que romperían silenciosamente la paridad si se cambian:

- `js_min`/`js_max` propagan `NaN` y tratan `-0 < +0` (`lib.rs:655`, `hit.rs:220` `js_min_f32`/`js_max_f32`, `particle.rs:120` igual para `f32`), coincidiendo con `Math.min`/`Math.max`. Los `f64::min/max` y `f32::min/max` de Rust ignoran `NaN` — una sola sustitución `f64::min` diverge en transformaciones desbordadas donde `Infinity*0 = NaN`.
- La reducción SIMD de AABB es asociativa porque `js_min/js_max` implementan un orden total — doc en `lib.rs:790` prueba que `f64x2_min/max` tienen la misma semántica NaN/cero, así un fold emparejado por carriles iguala el fold escalar izquierdo bit a bit.
- Easing usa multiplicaciones explícitas, no `powi`/`powf` (`anim.rs:360` `ease`, espejo JS en `packages/animation/src/easing.ts`).
- El oráculo de partículas redondea cada intermedio con `Math.fround` (`particle-backend.ts:340`) y usa `sqrt(dx*dx+dy*dy)` no `Math.hypot` — `particle.rs:120` `js_min_f32/js_max_f32/js_clamp_f32` iguala la misma semántica Math.

## 9. Fallback y gating — las costuras de resiliencia

**Retornos de estado.** Cada `*_init`/`*_step`/`compose_*`/`hit_build`/`force_step` retorna `STATUS_*` (`lib.rs:485`, `anim.rs:158` `springs_ready`/`tweens_ready`, `hit.rs:110` `hits_ready`, `particle.rs:90` `particles_ready`, `force-rs/lib.rs:18` `STATUS_*` reflejado). `CAPACITY` significa "conteo demasiado grande"; `UNINITIALIZED` significa "init nunca llamado"; `BAD_RUN`/`OVERFLOW` cubren fallos de tabla de ejecuciones y asignación. El llamante comprueba y retrocede — el store queda intacto y las vistas siguen válidas (`backend.ts:230` retorno temprano de `ensure`, referenciado en 5 lugares; `WasmBackendFacade.ts:470` ruta rechazada de `uploadRuns`).

**Reintento de subida.** `WasmBackendFacade` (`WasmBackendFacade.ts:134` `WASM_UPLOAD_REJECT_LIMIT=3`, contador en `WasmBackendFacade.ts:492`) cuenta rechazos consecutivos de `uploadRuns`. A los 3 deshabilita el backend de transformación _por la vida de esta Scene_ (`WasmBackendFacade.ts:500` cambia `_mode='js'` — no un segundo flag — y advierte una vez vía `hasWarnedUploadFallback` en `WasmBackendFacade.ts:501`). Una tabla de ejecuciones rechazada compondría el árbol equivocado, y una topología genuinamente sobre-capacidad re-falla cada frame costando `O(n)` `buildTreeStore` cada reintento — así son consecutivos, no acumulativos. `WasmBackendFacade.ts:252` `setTransform` y la ruta de éxito en `WasmBackendFacade.ts:515` reinician la racha.

**Invalidación por crecimiento de memoria.** `viewsStale` (`backend.ts:38`) comprueba `byteLength===0` o `buffer !== memory.buffer`; `revalidateViews` por backend (`backend.ts:373`, `anim-backend.ts:121`, `hit-backend.ts:111`, `particle-backend.ts:112`) y la re-adquisición cruzada en `WasmBackendFacade.ts:527` tras la recolección de `syncStore` manejan el crecimiento de memoria lineal compartida (`hit_init` asigna sus propios arrays de grilla en la misma memoria).

**Sonda de módulo obsoleto.** `backend.ts:201` / `runAabbs` / `runKernel` comprueban `typeof ex.compose_simd === "function"` antes de llamar — un `.wasm` cacheado en URL fija puede ser anterior a `compute_aabbs_simd` y lanzaría `TypeError` a mitad de render (`#662`/`#798`). La ruta `rejected` establece `_aabbsFresh=false` en ambas ramas de rechazo (`WasmBackendFacade.ts:481` + `:562` + `:607`) para que una recolección AABB fusionada nunca lea bounds obsoletos del frame previo.

**Reporte de compuertas y presupuestos.** `backend.available` (`WasmTransformBackend.available`, `HitTestBackend`, etc.) es "instalado"; `Scene.animBatchedLastFrame` / `Scene.hitTestBackend` / `Scene.transformBackend` / `Scene.accelerators.*.reason` es "realmente usado" — la doc en `Scene.ts:1749` advierte no confundirlos. `animGate` son tres umbrales, no uno (`Scene.ts:1856` alias `animThreshold`). La clave de caché de grilla de hit es `hitGridFrame` + `hitGridStructureVersion` (`WasmBackendFacade.ts:394`) — sin el componente de estructura una mutación en el mismo frame haría hit contra geometría pre-mutación.

## 10. Cómo añadir un nuevo kernel WASM de forma segura

1. **Empieza en `crates/vectojs-core-rs/src/` o un crate hermano.** Dale su propio store `static mut`, arrays SoA, `*_init` con guardas `checked_add` + `checked_mul` y `free_*`/`free_partial_*` (ver `lib.rs:370` `init` + `free_store` + `free_partial_store`, `anim.rs:158` `anim_init` + `free_anim` + `free_partial_anim`, `hit.rs:130` `hit_init` + `free_hit`), predicado `*_ready()` (`anim.rs:158` `springs_ready`), y accesores `ptr_export!` (`lib.rs:564`). Copia la forma de `anim.rs:44` o `hit.rs:44` — nada comparte el `Store` de transformación. Inicializa el centinela sin store como `Store::empty()`/`Anim::empty()`/`Hit::empty()` y publícalo en OOM para que llamadas posteriores obtengan `STATUS_UNINITIALIZED` en lugar de lecturas de memoria liberada (doc `empty` en `lib.rs:120`).

2. **Usa `f64` a menos que el buffer sea `f32` por contrato externo.** El core de transformación es solo `f64` por paridad; solo `particle.rs` y `simd_f32_bench.rs` son `f32`, cada uno con su propio oráculo y nota explícita de divergencia (`particle.rs:10` _"a separate differential oracle"_). No añadas una segunda ruta de precisión sin razón medida y archivo diferencial separado.

3. **Retorna códigos de estado, nunca atrapes.** `STATUS_OK=0` en éxito, `STATUS_CAPACITY/UNINITIALIZED/BAD_RUN/OVERFLOW` al rechazar — y no escribas nada. Reflejado en `packages/core/src/wasm/backend.ts:16` `WASM_STATUS` (y doc de vocabulario reflejado en `force-rs/lib.rs:18` _"Keep the two lists in sync"_). Para retornos tri-estado (p. ej. flag pendiente 0/1), usa estado negativo en fallo para que `0` siga siendo significativo (codificación de estado negativo de `particle.rs:310` `particle_step`, consumidor `flag < 0` en `particle-backend.ts:110`).

4. **Compila vía `just wasm` / `build.sh`.** Nunca un `cargo build --target wasm32-unknown-unknown` pelado. Si añades un segundo crate, añade su propio `rust-toolchain.toml:1` (`targets=["wasm32-unknown-unknown"]`, `components=["clippy","rustfmt"]`, `profile="minimal"`) y `build.sh:20` con `RUSTFLAGS="-C target-cpu=generic -C target-feature=+simd128 -C linker=rust-lld"` — ver `crates/vectojs-force-rs/build.sh:20` y `rust-toolchain.toml:10` como plantillas. Cablea `just wasm-check` y provisión de toolchain en CI (`.carryctx/rules/wasm-crate-build.md:9`).

5. **Añade primero un oráculo JS.** Escribe la referencia JS en el paquete consumidor (`soa.ts:246` `composeJS`, `soa.ts:316` `computeAabbsJS`, `SpringPhysics.ts:5` + `packages/animation/src/easing.ts`, `particle-backend.ts:340` `particleStepReferenceF32`) y mantenlo como fallback enviado. Haz coincidir orden de operaciones y semántica NaN de `Math.min`/`Math.max` (`lib.rs:655` `js_min/js_max`) para que la paridad `Object.is` sea alcanzable. Los oráculos no agrupados como `SpatialHashGrid.query` mantienen su propio contrato de fallback de superconjunto grueso (`SpatialHashGrid.ts:120` _"bounded by the grid's real content"_)

6. **Añade un test diferencial.** Nuevo archivo bajo `packages/core/test/wasm/` (o `packages/graph3d/test/` para fuerzas) siguiendo la forma `differential.test.ts:1`: misma entrada `buildStore`/SoA, ambas rutas, `assertBitIdentical` (`differential.test.ts:78`) vía `toBe`/`Object.is`, PRNG sembrado (`differential.test.ts:18` `rng`), omitido cuando `!haveWasm` (`differential.test.ts:14`), cubriendo tanto kernels `simd` como `scalar` (`differential.test.ts:110`). Añade tests de desbordamiento de límites/rechazo (forma `abi-bounds.test.ts`) y tests de revalidación de vistas (forma `view-revalidation.test.ts`, forma `memory-growth.test.ts`).

7. **Añade la fachada de backend TypeScript.** Nuevo archivo bajo `packages/core/src/wasm/` siguiendo la forma `anim-backend.ts:1`/`hit-backend.ts:1`: `ensure`/`revalidateViews`/`step` o `run*`, comprobaciones `STATUS_OK`, helper `viewsStale`, `instantiateSync/Async/Streaming` que retornan `null` en cualquier fallo (patrón en `backend.ts:467`). Comparte la instancia vía `runtime.ts:1` (`CoreWasmRuntime` + `moduleCache`) — no instancies un segundo módulo. Revalida tras cada `ensure` antes de escribir en vistas (patrón en `backend.ts:373`, re-adquisición cruzada en `WasmBackendFacade.ts:527`).

8. **Ponle compuerta.** Añade una compuerta por funcionalidad en `Scene`/`WasmBackendFacade` (`Scene.ts:1904` triple `animGate`, `WasmBackendFacade.ts:134` `WASM_UPLOAD_REJECT_LIMIT`, clave de caché de grilla en `WasmBackendFacade.ts:394`). Extrae reportes en `WasmBackendFacade.ts:75` `AcceleratorReason`/`AcceleratorStatus`/`AcceleratorReport` para que devtools pueda leerlo sin entrar en cuatro dominios. Haz benchmark en `benchmarks/<name>-wasm/entry.ts` (`benchmarks/core-wasm/entry.ts:1`, `benchmarks/anim-wasm/entry.ts:1` modelo de dos costes) con `run-browsers.sh` en el workspace dedicado de 240Hz — solo ese harness produce números citables (AGENTS.md global + skill `hyprland-browser-bench`, `refreshHz` + speedup `js vs resident` por separado). Mantén el valor por defecto de la compuerta conservador: mide coste integrado (churn de asignación, recolección, semántica `Math.min`) no tiempo de micro-kernel.

9. **Cablea `Scene` al final.** Añade el loader asíncrono `enableWasm*` (patrón `Scene.ts:1706` `enableWasmTransforms` / `Scene.ts:1783` `enableWasmHitTest` / `Scene.ts:1809` `setAnimBackend`) que pasa por `runtime.ts:48` `loadCoreWasmModule`/`createCoreWasmRuntime` y la guarda de carrera de runtime compartido en `WasmBackendFacade.ts:314` (_"A concurrent enableWasm_ may have won the race while we awaited"*). El recorrido de `Scene` que alimenta el kernel debe separarse de la llamada al kernel — testea el recorrido + fallback JS antes de cablear WASM (`scene-store.ts:30` `buildTreeStore` es la costura para testear aislado).

## 11. Checklist antes de enviar un cambio WASM

- [ ] `just wasm` (y `crates/vectojs-force-rs/build.sh` si se tocó) compila; `just wasm-check` (fmt + clippy `-D warnings`) pasa.
- [ ] `just wasm-test` (diferencial WASM) pasa — o es `skipIf(!haveWasm)` cuando no hay `.wasm` presente. Ningún `cargo build` pelado en scripts/CI.
- [ ] El nuevo kernel tiene retornos `STATUS_*`, no escribe nada al rechazar y tiene tests de rechazo inyectado; la ruta JS es el fallback permanente.
- [ ] El oráculo JS coincide con orden de operaciones y semántica NaN/`-0` de `Math.min`/`Math.max`; la paridad `Object.is` se mantiene para esquinas NaN/±0 y carriles de cola `+16`/`+8`.
- [ ] Las nuevas vistas de typed-array pasan por `viewsStale`/`revalidateViews` (y re-adquisición cruzada) y sonda de módulo obsoleto donde aplique.
- [ ] Los valores por defecto de compuerta son conservadores y medidos integrados (`benchmarks/run-browsers.sh` con cabeza en Chrome+Firefox; reporta `refreshHz`, speedup `js vs resident` y speedup AABB por separado).
- [ ] Reporte de aceleradores actualizado (`WasmBackendFacade.ts:75` `AcceleratorReason` y getter `Scene.accelerators`) y doc estilo `Scene.dart`/`_dirty` actualizada si se añadieron nuevos campos de dirty/reporte.
- [ ] Copia de asset `tsup` cableada (patrón `tsup.config.ts:40`) si se publica un nuevo `.wasm`.

## 12. Vocabulario G1/G2/G3 — qué significan las etiquetas

Las etiquetas son orden cronológico de invención, no prioridad:

- **G1** — el core de world-matrix + AABB (`crates/vectojs-core-rs/src/lib.rs:1`, `soa.ts:22`). El primer kernel y el único que corre cada frame para cada entidad. Todo lo demás está controlado por tamaño de carga; G1 solo está controlado por "¿hay un `.wasm` instalado y tuvo éxito `uploadRuns`?"
- **G2** — el spike de animación en lote (`crates/vectojs-core-rs/src/anim.rs:1`). Nombrado segundo porque fue el siguiente SoA tallado. Ahora bit-idéntico pero empezó como spike de medición — el encabezado de `anim.rs:1` dice _"measurement spike, not an integrated backend"_ y los benchmarks `benchmarks/anim-wasm` vs `benchmarks/anim-wasm-scene` deciden si se integra. No leas "G2 se integra" como hecho.
- **G3** — el spike de grilla de hit-test (`crates/vectojs-core-rs/src/hit.rs:1`). Mismo estado: módulo de medición con su propio store, controlado por tamaño de grilla de viewport y `hit_overflow`. El encabezado de `hit.rs:1` dice _"measurement module, like anim"_.
- **G4** — sim de partículas (`crates/vectojs-core-rs/src/particle.rs:1`). A menudo llamado G4 pero no en el trío G1/G2/G3; se mantiene separado porque es `f32` y tiene su propio oráculo. `crates/vectojs-force-rs` (octree) _no_ es G4 — es un segundo crate para graph3d (distinto `Cargo.toml:1`, distinto `build.sh:1` ruta de salida).

Si añades prosa, mantén "G1/G2/G3" como taquigrafía para "transform / anim-batch / hit-grid" y nombra G4 y force-rs explícitamente cuando te refieras a ellos.

## 13. Baselines de forge y cuándo re-medir

Ninguna tabla de benchmarks inline es un baseline. Los números citables viven en `benchmarks/core-wasm/results/latest/` (`core-wasm-chrome.json:1`, `core-wasm-firefox.json:1` — schemaVersion 1, `refreshHz`, `panelHz`, `host.{cpu,gpu,driver}`, `rows[].{identical,jsNsPerEntity,copyNsPerEntity,residentNsPerEntity,copySpeedup,residentSpeedup,jsAabbNsPerEntity,wasmAabbNsPerEntity,aabbSpeedup}`) y sus snapshots `history/`. El contrato del harness (`benchmarks/_shared/client.ts:1` `awaitStart`/`reportResult`, `benchmarks/core-wasm/entry.ts:1` modelo de dos costes) requiere un navegador real con cabeza en primer plano en un workspace Hyprland dedicado con ventana enfocada y GPU real (`benchmarks/run-browsers.sh:1` — única ruta citable).

Re-mide cuando:

- Cambias `lib.rs:84` `SIMD_ALIGN`, `soa.ts:64` `PAD`, `lib.rs:640` patrón `f64x2_splat`, o `build.sh:28` `RUSTFLAGS` — cualquiera de ellos mueve el `residentSpeedup` en >10%.
- Cambias constantes de spring en `anim.rs:12` o `anim.rs:360` `ease` — re-ejecuta micro `benchmarks/anim-wasm` + integrado `benchmarks/anim-wasm-scene` (Chrome: springs `2.06×` a 100 drivers, `3.7×` a 100k; tweens `4.14×` a 100, `4.48×` a 1k — `anim-wasm-chrome.json:1` 2026-08-14) y resetea `Scene.animGate` solo si el coste integrado lo justifica.
- Tocas `hit.rs:280` `hit_build` o `hit-store.ts:47` gather — re-ejecuta `benchmarks/hit-wasm` / `benchmarks/scene-hit-wasm`.
- Tocas `particle.rs:310` o `force-rs/lib.rs:1` — re-ejecuta `benchmarks/particle-wasm` / `benchmarks/graph3d-frame`.

Reporta siempre Chrome _y_ Firefox con `refreshHz` junto a cifras por frame; Firefox necesita `layout.frame_rate` configurado o reporta ~60 Hz indetectablemente bajo (regla de medición de AGENTS.md global + skill `hyprland-browser-bench`).

## 14. Trampas que han golpeado esta área

| trampa                                                                                    | file:line                                                      | estado                                                   |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------- |
| `~/.cargo/config.toml` `cfg(all)` uniendo flags de host al enlace wasm                    | `.carryctx/rules/wasm-crate-build.md:1`, `build.sh:8`          | corregido vía override `RUSTFLAGS`                       |
| `Vec<f64>` solo alineado a 8 bytes → SpiderMonkey `v128_load` 7× más lento                | `lib.rs:84` `SIMD_ALIGN`                                       | corregido vía `alloc_zeroed` con 16                      |
| Vistas `TypedArray` obsoletas tras `WebAssembly.Memory.grow` por otro backend             | `backend.ts:38` `viewsStale`, `WasmBackendFacade.ts:527`       | corregido vía `revalidateViews` + re-adquisición cruzada |
| `.wasm` cacheado obsoleto anterior a `compute_aabbs_simd` → `TypeError` a mitad de render | `backend.ts:201` sonda                                         | corregido vía fallback escalar (`#798`)                  |
| `uploadRuns` rechazado componiendo árbol equivocado / AABBs obsoletos                     | `WasmBackendFacade.ts:470` + `:481` `:562` `_aabbsFresh=false` | corregido vía límite de reintentos (`DEC-0014`)          |
| `Math.pow`/`powi` vs multiplicaciones explícitas → brecha de easing ~1e-12                | `anim.rs:360` `ease`                                           | corregido vía `t*t` explícito                            |
| `f64::min` ignorando NaN → AABB divergente en transformaciones desbordadas                | `lib.rs:655` `js_min`                                          | corregido vía `js_min/js_max` que propagan Math          |
| `f32` error ~93px en árbol profundo/frondoso — enviado como kernel muerto                 | `simd_f32_bench.rs:1`, `Cargo.toml:20` `bench-f32`             | corregido vía feature-gating                             |
| `target-cpu` habilitando `fma` → redondeo único vs doble de JS                            | `build.sh:28` `generic`                                        | corregido vía `generic`                                  |
| `new URL('@vectojs/core/…', import.meta.url)` sin resolver                                | `asset.ts:10`                                                  | corregido vía `./vectojs_core.wasm` relativo             |

## Relaciones

- **Boss 06 (runtime del VMT)** posee el árbol `Entity`, el recorrido de `Scene`, `structureVersion` → `storeStructureVersion` y el cableado `WASM_UPLOAD_REJECT_LIMIT` que este boss acelera.
- **Boss 07 (renderer)** consume las world matrices y AABBs que este boss produce — una vista obsoleta aquí es la versión de este boss de una caché de raster obsoleta.
- **Boss 11 (graph layout)** reutiliza la misma disciplina de compilación (`crates/vectojs-force-rs`) para fuerzas 3D; el quadtree 2D de `@vectojs/graph-layout` (`BarnesHutQuadtree.ts:5`) permanece solo JS.
- **Boss 02 (texto/layout)** y **boss 03 (proyección)** _no_ tienen respaldo WASM — no busques WASM cuando el cuello de botella es conformado o carriers del DOM.

## Referencias

- `crates/vectojs-core-rs/Cargo.toml:1` — manifiesto del crate de transformación (crate-type, bench-f32, perfil release)
- `crates/vectojs-core-rs/src/lib.rs:1` — composición escalar/SIMD G1 + AABB SIMD, Store, códigos de estado, `js_min/js_max`
- `crates/vectojs-core-rs/src/anim.rs:1` — lote spring/tween G2, easing de multiplicación explícita, store separado
- `crates/vectojs-core-rs/src/hit.rs:1` — grilla densa de viewport G3, construcción counting-sort, overflow
- `crates/vectojs-core-rs/src/particle.rs:1` — SoA de partículas f32 G4, flag pendiente fusionado, rechazo de estado negativo
- `crates/vectojs-core-rs/src/simd_f32_bench.rs:1` — f32x4 solo para bench, rechazado como valor por defecto (error ~93px)
- `crates/vectojs-force-rs/src/lib.rs:1` — octree Barnes-Hut de graph3d (acumulación f64, posiciones f32, jitter `imul`)
- `crates/vectojs-core-rs/build.sh:1` / `crates/vectojs-force-rs/build.sh:1` — `RUSTFLAGS` correctos (`generic`, `+simd128`, `rust-lld`)
- `.carryctx/rules/wasm-crate-build.md:1` — regla de compilación (just wasm, override RUSTFLAGS, binario en gitignore)
- `packages/core/src/wasm/soa.ts:1` — SoA JS, `buildStore`, oráculos `composeJS`/`computeAabbsJS`
- `packages/core/src/wasm/backend.ts:1` — backend de transformación (resident vs copy, `WASM_STATUS`, `viewsStale`, sonda de módulo obsoleto)
- `packages/core/src/wasm/runtime.ts:1` — `CoreWasmRuntime` compartido + caché global de módulo + backends memoizados perezosos
- `packages/core/src/wasm/{anim,hit,particle}-backend.ts:1` / `asset.ts:1` — fachadas G2/G3/G4 + `coreWasmUrl`
- `packages/core/src/wasm/{scene-store,hit-store,hit-store-fused}.ts:1` — árbol → SoA / recolección AABB / recolección fusionada
- `packages/core/src/tree/scene/WasmBackendFacade.ts:1` — cuatro backends, `AcceleratorReason/Report`, `syncStore`/`ensureAabbs`, reintento de subida, runtime compartido
- `packages/math/src/SpringPhysics.ts:1` / `packages/math/src/SpatialHashGrid.ts:1` — física/grilla JS (solo JS, no WASM — `MAX_CELLS_PER_AABB=64`)
- `packages/core/test/wasm/differential.test.ts:1` + `anim-kernel.test.ts`/`hit-kernel.test.ts`/`particle-kernel.test.ts` — suites bit-idénticas (`Object.is`), `skipIf(!haveWasm)`
- `benchmarks/core-wasm/entry.ts:1` / `benchmarks/anim-wasm/entry.ts:1` / `benchmarks/core-wasm/results/latest/:1` — mediciones con cabeza `run-browsers.sh` (Chrome+Firefox, `refreshHz`, `residentSpeedup`)

---

_Serie: 00 Overview → 01 Selection → 02 Text+Layout → 03 Projection+Virtualization → 04 Streaming Markdown → 05 TeX → 06 Runtime del VMT → 07 Renderer → **08 WASM G1/G2/G3** → 09 Three/XR → 10 Video Export → 11 Graph Layout → 12 DevTools → 99 Synthesis._
