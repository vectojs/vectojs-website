+++
title = "08 — WASM 加速器 — G1/G2/G3 與位元一致性"
description = "@vectojs/core 背後不可見的 WASM 後端：G1 世界矩陣、G2 動畫批次、G3 命中網格（加上 G4 粒子）、使 SIMD 可能的 SoA 儲存，以及使 WASM 保持可選的位元一致性契約。"
weight = 28
+++

# 08 — WASM 加速器 — G1/G2/G3 與位元一致性

> **Boss 08** 依設計不可見。Rust 核心（`crates/vectojs-core-rs`、`crates/vectojs-force-rs`）加速 JS 引擎已正確執行的內容——世界矩陣組合、動畫 tick、命中廣相、粒子積分——且永不成為必要。每條加速路徑皆有產生*相同位元*的 JS 備援，每個建構、門控與測試皆為守護該承諾而存在。

- **你將學到**：為何 WASM 為不可見後端；使 `f64x2` 可能的 SoA 儲存；G1/G2/G3(+G4) 各自加速什麼、如何被門控，以及有頭基準實際度量了什麼；如何測試位元一致性；以及如何新增核心而不破壞備援契約。
- **你不會學到**：VMT dirty/生命週期（Boss 06）、渲染器/DPR 一致性（Boss 07）、圖布局調校（Boss 11）或 Three/XR 雙世界映射（Boss 09）。本文件為 VMT 與渲染器間的加速層。

## 1. 為何 WASM 是不可見後端

VectoJS 在零 Rust 下正確運行。`packages/core/src/wasm/soa.ts:1`（`composeJS`、`computeAabbsJS`）與 `packages/math/src/SpringPhysics.ts:1` / `packages/animation/src/easing.ts` 為*永久*的 oracle 與備援；crate manifest 明確說明——`crates/vectojs-core-rs/Cargo.toml:6` *「不可見後端；TypeScript 路徑為永久備援」* 與 `crates/vectojs-force-rs/Cargo.toml:6` 對力核心亦同。已編譯的 `.wasm` 本身被 git 忽略（`packages/core/src/wasm/vectojs_core.wasm`、`packages/graph3d/src/wasm/vectojs_force.wasm`）——在 CI 中建構、發布至 npm、永不提交（`.carryctx/rules/wasm-crate-build.md:6`）。

此單一決策帶來三個約束：

1. **實例化可能失敗且必須靜默。** CSP `wasm-unsafe-eval`、缺失資源、不支援 `simd128`、陳舊快取模組——每個載入器皆回傳 `null`，呼叫者保持 JS 路徑。`packages/core/src/wasm/backend.ts:467` `instantiateSync`/`instantiateAsync`/`instantiateStreaming`、`packages/core/src/wasm/runtime.ts:48` `loadCoreWasmModule`/`createCoreWasmRuntime`、`packages/graph3d/src/wasm/force-backend.ts:55` 的力等同物，以及 `packages/core/src/wasm/asset.ts:22` `coreWasmUrl` / `packages/graph3d/src/wasm/asset.ts:22` `forceWasmUrl` 供打包器解析。失敗為預設狀態，而非錯誤路徑。

   URL 輔助很重要：`new URL('@vectojs/core/…', import.meta.url)` 不工作——`new URL` 僅解析*相對*參考，而裸說明符非相對（`asset.ts:10`）。自套件*內部*的 `new URL('./vectojs_core.wasm', import.meta.url)` 為原生 ESM 與打包器皆正確解析的唯一形式。呼叫者執行 `await scene.enableWasmTransforms(coreWasmUrl)`（`asset.ts:8` 範例），當提取/編譯失敗時方法回傳 `false`（`Scene.ts:1704` `enableWasmTransforms` 文件：*「若 WASM 現已啟用則解析為 true，若保持 JS 路徑則為 false」*）。

2. **核心必須可失敗而非陷阱。** 匯出回傳 `STATUS_OK`（0）或非零的 `STATUS_CAPACITY/UNINITIALIZED/BAD_RUN/OVERFLOW`（`crates/vectojs-core-rs/src/lib.rs:485` 常數，`packages/core/src/wasm/backend.ts:16` `WASM_STATUS`）並在拒絕時*不寫入任何內容*。JS 側將任何非零視為「本影格執行參考路徑」（`packages/core/src/wasm/backend.ts:212` `compose` 提前回傳，`packages/core/src/wasm/anim-backend.ts:173` `stepSprings` 布林，`packages/core/src/tree/scene/WasmBackendFacade.ts:487` 上傳重試，`packages/core/src/wasm/particle-backend.ts:110` 三態負狀態）。

3. **共用線性記憶體、共用模組。** 在 `packages/core/src/wasm/runtime.ts:1`（`CoreWasmRuntime`）之前，四個後端意味著同一二進位的四次編譯與四個線性記憶體。現在一個 `WebAssembly.Module` 按 URL 全域快取（`runtime.ts:38` `moduleCache`，僅以字串/URL 為鍵——位元組未被快取，`runtime.ts:48` `cacheKey` 文件），而每個 `Scene` 一個 `Instance` 經永不別名的相異 `static mut` 靜態暴露四個儲存（`crates/vectojs-core-rs/src/lib.rs:44` `Store`、`src/anim.rs:44` `Anim`、`src/hit.rs:44` `Hit`、`src/particle.rs:44` `Particles`、`crates/vectojs-force-rs/src/lib.rs:44` `Octree`+`POS`/`ACCEL`）。`CoreWasmRuntime` 惰性建構每個後端並 memo 化（`runtime.ts:90` `transform()`/`anim()`/`hit()`/`particle()`），因此僅啟用變換的 Scene 永不支付 anim/hit 配置。

回報保持「已安裝」與「本影格活躍」分離。`Scene.accelerators: AcceleratorReport`（`WasmBackendFacade.ts:122` 回報形態，`Scene.ts:1749` 文件*「確定賦值因其需要 \_wasmBackend」*）回傳每加速器的 `{ available, activeThisFrame, reason, path }`——`available` 為「已安裝後端、門控允許」，`activeThisFrame` 為「實際執行」，`reason` 為 `not-installed | below-gate | rejected | active`（`WasmBackendFacade.ts:75` `AcceleratorReason`）。`Scene.animGate` vs `Scene.animBackend` 為典型混淆：低於 driver 數量的門控使 `animBackend==='wasm'` 而 `animBatchedLastFrame===false`（見 `Scene.ts:1749` 與 `Scene.ts:1904` 門控文件）。

## 2. 建構紀律 — `just wasm`，而非裸 cargo

陷阱為 `~/.cargo/config.toml`（`.carryctx/rules/wasm-crate-build.md:1`）：`[target.'cfg(all())']` 區段亦匹配 `wasm32`，Cargo *合併*其 `rustflags` 與目標特定者。主機旗標如 `-C target-cpu=native` 或 `-fuse-ld=mold` 洩漏至 `wasm32-unknown-unknown` 連結並破壞它（`rust-lld: error: unknown argument: -fuse-ld=mold`）。環境 `RUSTFLAGS` *取代*設定旗標；目標特定設定則不。

唯一正確的建構：

```bash
just wasm  # 執行具正確 RUSTFLAGS 的 crates/vectojs-core-rs/build.sh
# 或對力核心：
# crates/vectojs-force-rs/build.sh  (相同 RUSTFLAGS)

# build.sh 所做 (crates/vectojs-core-rs/build.sh:28):
RUSTFLAGS="-C target-cpu=generic -C target-feature=+simd128 -C linker=rust-lld" \
  cargo build --release --target wasm32-unknown-unknown --manifest-path crates/vectojs-core-rs/Cargo.toml
```

規則細節（`crates/vectojs-core-rs/build.sh:1`、`crates/vectojs-force-rs/build.sh:1`、`.carryctx/rules/wasm-crate-build.md:1`）：

| 規則                                                           | file:line                                                        | 原因                                                                                                                                                                            |
| -------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target-cpu=generic`                                           | `build.sh:28`                                                    | 使 `fma`（融合乘加）排除。`generic` 無 `fma`；主機調校的 CPU 會將 `a*b + c*d` 融合為一次捨入，而 JS 執行兩次——破壞位元一致性。`crates/vectojs-force-rs/build.sh:8` 明確指出此。 |
| `target-feature=+simd128`                                      | `build.sh:28`                                                    | 啟用 `v128`/`f64x2`/`f32x4`。無它則 `#[target_feature(enable="simd128")]` 核心（`lib.rs:612`、particle 註解）無法編譯或陷阱。                                                   |
| `linker=rust-lld`                                              | `build.sh:28`                                                    | 覆寫 `~/.cargo/config` 中如 `mold` 的連結器。                                                                                                                                   |
| `panic="abort"` + `strip` + `lto` + `codegen-units=1`          | `Cargo.toml:22`                                                  | 最小、確定性二進位。                                                                                                                                                            |
| `edition="2024"` + `rust-toolchain.toml:10` `channel="stable"` | `rust-toolchain.toml:1`、`.carryctx/rules/wasm-crate-build.md:3` | 精確通道固定為 *stable* 而非版本——精確版本固定會破壞離線/鏡像環境；CI 固定精確版本。                                                                                            |
| `just wasm-check`                                              | `.carryctx/rules/wasm-crate-build.md:5`                          | 具相同 `RUSTFLAGS` 的 `cargo fmt --check` + `cargo clippy --target wasm32-unknown-unknown -- -D warnings`。                                                                     |
| `just wasm-test`                                               | `.carryctx/rules/wasm-crate-build.md:5`                          | `just wasm` 然後核心差分套件（`vitest`）。                                                                                                                                      |
| 二進位被 git 忽略                                              | `build.sh:14`、`.carryctx/rules/wasm-crate-build.md:6`           | 僅 TS 的貢獻者永不需 Rust。經 `tsup.config.ts:40` 複製步驟發布（`packages/graph3d/tsup.config.ts:40` `vectojs_force.wasm → dist/wasm/`）。                                      |
| `Cargo.toml` `publish=false`                                   | `Cargo.toml:5`（兩 crate）                                       | crate 非 crates.io 套件——僅經 npm 的 `.wasm` 重要。                                                                                                                             |

`f32x4` 評估核心（`crates/vectojs-core-rs/src/simd_f32_bench.rs:1`）位於 `bench-f32`（`Cargo.toml:20` `bench-f32 = []`）之後且永不發布——已度量並被否決。`build.sh:18` 記錄選擇加入形式 `./build.sh --features bench-f32` 及其預設排除它的原因：f32 已被度量並被否決。

## 3. SoA 儲存 — 使 SIMD 可達的形態

`packages/core/src/wasm/soa.ts:22` 為系統的一半；`crates/vectojs-core-rs/src/lib.rs:1` 為另一半。`lib.rs:10` 處的文件註解具承載力：

> 每欄位一個扁平 `f64` 陣列。具交錯記錄時，連續實體的 `x` 將相距 `N*8`——`v128` 載入無法一次取得兩個。

### 3.1 SoA，而非 AoS

`Store`（`lib.rs:44`）持有 22 個 `*mut f64` 輸入/輸出/邊界/AABB 陣列加上 3 個 `*mut i32` 執行表。JS 側：`TransformStore`（`soa.ts:44`）具匹配的 `Float64Array`/`Int32Array` 視圖，經匯出指標覆蓋於 `WebAssembly.Memory.buffer` 之上（`lib.rs:564` `ptr_export!`，`backend.ts:178` `p_x()…p_run_len()`）。

### 3.2 兄弟執行、深度有序

WASM SIMD 無 gather。跨任意父節點向量化將需要每實體父矩陣載入。改為 `soa.ts:178` `buildStore` 保證*一父節點的子節點連續*（每父節點 BFS：將父節點出佇，將所有子節點作為一次執行發射，將它們入佇）。父世界矩陣每執行濺射一次（`lib.rs:640` `f64x2_splat(*S.wa.add(p))`），子節點填滿兩個通道。`store.runStart/runLen/runParent` 為迭代表；`set_run_count`（`lib.rs:600`）發布其長度。

JS 建構器驗證：恰一個 `parent===-1` 根（在缺失/重複時拋出，`soa.ts:104`），每個父索引在範圍內（`soa.ts:112`），根在儲存索引 0 處播種為單位矩陣（`lib.rs:603` `seed_root`，`soa.ts:246` `composeJS` 播種 `wa[0]=1,wd[0]=1`）。在重建間，每影格同步僅將目前 `x/y/scale/rotation/opacity` 收集至常駐輸入視圖並重跑核心（`WasmBackendFacade.ts:458` `syncStore`）。

### 3.3 填充、對齊與預算三角

**填充而非餘數迴圈。** `init`（`lib.rs:370`）配置 `capacity + 8`（而 `simd_f32_bench.rs:128` 對 `f32x4` 使用 `+16`）。奇長尾部讀取邏輯結尾後一槽——填充通道被寫入但永不讀回（`lib.rs:643` `compose_simd` 註解，`backend.ts:152` 上傳註解）。JS 儲存鏡像填充（`soa.ts:64` `capacity = count + 8`）。

**預算 `cos`/`sin`。** WASM 無超越函數；每影格重算為首輪最大成本（`lib.rs:66`）。JS 在建構時寫入 `cos=Math.cos(rotation)` 一次（`soa.ts:218` `writeInput`），每影格常駐收集讀取快取的 `_getTrig()`（`WasmBackendFacade.ts:544` + `Entity.ts:1746` 三角快取）。

**16 位元組對齊。** `SIMD_ALIGN=16`（`lib.rs:84`）。`leak_f64` 使用 16 位元組對齊的 `alloc_zeroed`——`Vec<f64>` 僅 8 位元組對齊，使 SpiderMonkey 上的 `v128_load` 慢約 7 倍（已度量，依 `lib.rs:84` 註解）。輔助在 OOM 時回傳 null 而非陷阱，因此 `init` 可回報 `STATUS_OVERFLOW` 並保持先前儲存完整（`lib.rs:340` `free_store` + 溢位路徑）。

### 3.4 共用記憶體視圖風險

四個 core-rs 後端（與每個 `Scene`）共用一個 `WebAssembly.Memory`。任何 `*_init` 皆可增長記憶體並分離每個其他後端的 `TypedArray` 視圖（讀為 `byteLength===0`）。因此 `backend.ts:373` `revalidateViews` / `viewsStale`（`backend.ts:38` 輔助）與 `anim-backend.ts:121` / `hit-backend.ts:111` / `particle-backend.ts:112` 相同，加上 `WasmBackendFacade.ts:527` 在 `syncStore` 收集後的跨後端重取得。變換後端亦探測 `typeof ex.compose_simd === "function"`（`backend.ts:201`），使陳舊快取的 `.wasm`（早於 `compute_aabbs_simd`）退化為純量而非拋出（`#798`，`aabb-stale-module.test.ts`）。

## 4. G1 — 世界矩陣組合（+ AABB）

**它加速什麼：** `Canvas T * S * R` 組合（`lib.rs:520` `compose_scalar` / `lib.rs:612` `compose_simd`，`soa.ts:246` `composeJS`）與後續世界空間 AABB 遍歷（`lib.rs:670` `compute_aabbs` / `lib.rs:790` `compute_aabbs_simd`，`soa.ts:316` `computeAabbsJS`）。每個實體的世界矩陣（`a,b,c,d,e,f,opacity`）為 `parentMatrix * T(x,y) * S(sx,sy) * R(cos,sin)`，然後其局部邊界 `[bx,by,bw,bh]` 經其推送至世界 AABB（`aminx…amaxy`）。

**它如何抵達 `Scene`：** `buildTreeStore`（`packages/core/src/wasm/scene-store.ts:30`）將 `Entity.children` 走訪至 `InputNode[]` 與 `buildStore`；`WasmBackendFacade`（`packages/core/src/tree/scene/WasmBackendFacade.ts:168` 變換區域，`WasmBackendFacade.ts:458` `syncStore`）經 `Scene.enableWasmTransforms`（`Scene.ts:1706`）熱交換。存在兩種整合成本（見 `benchmarks/core-wasm/entry.ts:1`）：`copy`（上傳+核心+回讀——重上傳每個 `Float64Array` 然後讀回 `wa…wo`）vs `resident`（僅核心，輸入/輸出已在 WASM 視圖中）。Resident——存取器直接寫入 `inputView()`/`boundsView()`，渲染器讀取 `worldView()`/`aabbView()`（`backend.ts:320`/`backend.ts:420`，`WasmBackendFacade.ts:518` 世界視圖回傳）——為設計路徑，為基準回報為 `resident` 者。

**已度量勝利**（`benchmarks/core-wasm/results/latest/core-wasm-chrome.json:1`，2026-08-14，i7-14650HX，Chrome 151，`benchmarks/run-browsers.sh`——唯一可引用 harness，見全域 AGENTS.md）：

| 拓撲  | n    | js ns/elem | copy ns/elem | resident ns/elem | resident 加速 | AABB 加速 |
| ----- | ---- | ---------- | ------------ | ---------------- | ------------- | --------- |
| flat  | 1k   | 4.8        | 4.83         | 2.73             | 1.76×         | ~1.0×     |
| flat  | 10k  | 4.26       | 5.37         | 2.77             | 1.54×         | 1.95×     |
| flat  | 100k | 4.55       | 8.64         | 3.57             | 1.27×         | 2.09×     |
| chain | 1k   | 14.73      | 10.23        | 8.13             | 1.81×         | 1.14×     |
| chain | 10k  | 15.25      | 10.1         | 7.15             | 2.13×         | 1.10×     |
| chain | 100k | 16.25      | 13.63        | 7.35             | 2.21×         | 1.08×     |
| bushy | 10k  | 10.46      | 8.25         | 4.72             | 2.21×         | 1.99×     |
| bushy | 100k | 12.24      | 11.41        | 5.69             | 2.15×         | 2.22×     |

同一主機上的 Firefox 更接近：例如 flat 1k `resident 1.15×`，chain 1k `2.63×`（`core-wasm-firefox.json:1`）。引擎落差為真——`run-browsers.sh` 契約要求兩者皆回報。

複製路徑在小/中扇出時可*慢於* JS（flat 1k `0.995×`，flat 10k `0.79×`，`entry.ts:80` `copy` 度量），因為兩次 `Float64Array.set` 加上兩次讀取占主導；`entry.ts:1` 處文件警告對 Phase 1 而言 resident 數值為公平比較。AABB 遍歷單獨在規模上達到約 2.2×，因為它無執行走訪而為通道配對，其 min/max 歸約在全序 `js_min/js_max` 下具結合性（`lib.rs:790` 對 `f64x2_min/max` NaN/±0 語意的證明）。

**為何 `f32x4` 被否決：** `Cargo.toml:14` + `lib.rs:20` / `simd_f32_bench.rs:1` — f32 攜帶約 7 位有效數字（`lib.rs:6` 註解：*「深/灌木樹上約 93px 誤差，見 #143」*）且與 JS 參考非位元可比。4 通道核心（`simd_f32_bench.rs:128` `+16` 填充，`simd_f32_bench.rs:300` 處的 `f32x4_splat/mul/add`）僅供基準，以 `bench-f32`（`Cargo.toml:20`）門控因此永不發布，並擁有自身未融合儲存 `SF`（`simd_f32_bench.rs:44`）。

## 5. G2 — 批次動畫驅動器（彈簧 + tween）

**它加速什麼：** 在一次 `spring_step`/`tween_step` 呼叫（`crates/vectojs-core-rs/src/anim.rs:1`）中推進*所有*目前活躍的 `SpringDriver`/`TweenDriver` 實例，而非 JS 的逐 driver `driver.tick()` 迴圈（`packages/core/src/tree/scene/DriverTicker.ts:131` `tick`）。

**位元一致性 — 現已精確。** `anim.rs:8` 註記此曾為現已位元相符的度量尖峰。兩側皆以明確乘法寫入整數次冪（`anim.rs:360` `ease` 與 `packages/animation/src/easing.ts` 中的 `t*t`、`t*t*t`、`-2*t+2`），而非 `Math.pow`/`powi`——兩者皆非正確捨入，舊配對在約 1e-12 處分歧。彈簧常數（`anim.rs:12` `MAX_FRAME_DT=0.25`、`MAX_STEP_DT=1/120`、`VAL_EPSILON/VEL_EPSILON=0.005`）鏡像 `packages/math/src/SpringPhysics.ts:5`（`MAX_FRAME_DT=0.25`、`MAX_STEP_DT=1/120`、`SpringPhysics.ts:59` epsilons）。tween 終端吸附（`anim.rs:410` *「一旦 `active>=dur` 必須恰為 `to`」*）匹配 `packages/animation/src/drivers.ts` `TweenDriver.tick`，使不滿足 `f(1)===1` 的自訂緩動仍能落地。

**門控 — 數量重要。** 不同於 G1（每影格 100k 節點），活躍 driver 數量通常小，因此僅在閾值之上批次才划算。`Scene.animGate`（`Scene.ts:1904`）：

```ts
public animGate: { spring: number; tween: number; mixed: number } = {
  spring: 128, tween: 256, mixed: 128,
};
```

`DriverTicker.tick`（`DriverTicker.ts:50` `AnimGate`，`DriverTicker.ts:197` 門控開啟計量，`DriverTicker.ts:64` *「O(tree size) — G3 首次基準所犯的精確錯誤」*）將活躍可批次 driver 收集至稠密 `Float64Array` 包（`anim-backend.ts:68` `ensure` + `springView`/`tweenView`）並各執行一個核心；具自訂 `EasingFn` 的 tween 具 `wasmEasingId === null` 並留在 JS（`DriverTicker.ts:228`）。低於門控時保留 JS 迴圈——`anim-wasm-scene` 整合基準發現配置擾動主導成本而非核心（`DriverTicker.ts:68` 註解參考 `benchmarks/anim-wasm`/`anim-wasm-scene`）。

`Scene.animBatchedLastFrame`（`Scene.ts:2030` + `Scene.ts:1749` 文件*「確定賦值因其持有 \_wasmBackend」*）僅回報門控是否*開啟*；與 `animBackend`（「已安裝」）區分。`Scene.animThreshold`（`Scene.ts:1856`）為讀取 `animGate.tween` 並一次寫入三個門控的向後相容別名——偏好 `animGate`（單一閾值無法同時對兩種正確）。

**SoA + 獨立儲存。** `anim.rs:44` `Anim` 為相異的 `static mut`（`s_val/s_target/s_vel/s_stiff/s_damp/s_mass`、`t_from/t_to/t_elapsed/t_dur/t_delay/t_ease/t_val`、`spring_capacity/tween_capacity` 於 `anim.rs:54`），具自身 `anim_init`（`anim.rs:158`）與 `STATUS_*` 回傳——與變換 `Store` 無交叉觸碰。JS 外觀為稠密打包：每個合格影格自零重收集所有活躍 driver（`anim-backend.ts:20` *「無跨影格常駐」*），執行核心、分散結果——因此加入/離開的 driver 或翻轉的門控無需失效。

## 6. G3 — 命中測試廣相（稠密視埠網格）

**它加速什麼：** `Scene.findEntityAt`（`HitTester.ts:12`）對每指標事件執行 `O(N)` 深度優先的 `isPointInside` 走訪（`HitTester.ts:227` `findHitRecursively`）。命中核心（`crates/vectojs-core-rs/src/hit.rs:1`）以均勻網格取代廣相：將每個可互動實體的世界 AABB 分桶至覆蓋 `[0,vw]×[0,vh]`、單元大小 `cellSize=64` 的單元，然後點查詢僅掃描一個單元並回傳*最上層* AABB 候選（最高索引——前序，`packages/core/src/wasm/hit-store.ts:16` 不變量——較大索引較晚繪製）。呼叫者以精確 `isPointInside` 確認，因此非矩形命中保持正確，網格命中具決定性（`HitTester.ts:119` *「WASM 路徑具決定性」*——可信網格後無 JS 備援）。

**範圍：** 稠密扁平 `i32` 陣列而非雜湊——指標永遠位於視埠內（`hit.rs:15`）。三個陣列：每單元的 `cell_start/cell_count`、供 `(entity, cell)` 成員的 `items`，具計數排序建構（`hit.rs:280` `hit_build`：每單元計數 → 前綴和至 `cell_start` → 分散）。`hit_overflow()`（`hit.rs:220`）發出項目容量耗盡訊號；JS 側將溢位視為「網格不可信，退回」（`packages/core/src/wasm/hit-backend.ts:122` `runBuild` 在溢位時回傳 `false`）。`hit_query`（`hit.rs:380`）僅掃描指標的單元，並在 `hit_init` 從未執行時回傳 `-STATUS_UNINITIALIZED`——可與真實未命中（`-1`）區分。

**JS 側接線：** `gatherHitAABBs`（`hit-store.ts:47`）以前序走訪 `Entity.children`——與 `findHitRecursively` 順序相同——收集世界 AABB 與無 `getBounds()` 實體的 `boundless` 列表（經 `boundless` 路由且永不自 AABB 槽讀取，`hit-store.ts:60`）。融合收集（`hit-store-fused.ts`）重用 G1 世界矩陣路徑（`WasmBackendFacade.ts:583` `ensureAabbs` + `hitGridFrame`/`hitGridStructureVersion` 快取鍵於 `WasmBackendFacade.ts:394`），而非每實體重算四角。`HitTester.ts:60` / `WasmBackendFacade.ts:150` 擁有視埠網格與 `findEntityAtWasm` 路徑（`WasmBackendFacade.ts:334` `setHit` 使網格失效）。

**非 `@vectojs/graph-layout`。** 該套件（`packages/graph-layout/src/ForceLayout2D.ts:1`，`internal/BarnesHutQuadtree.ts:1`——具一流碰撞的真 2D 四元樹，`BarnesHutQuadtree.ts:5` 處的 `ZERO_TIER` 哨兵）為*2D* 力布局，無 WASM 後端。*3D* 力核心為 `crates/vectojs-force-rs` 供 `@vectojs/graph3d`（見 §7）。

## 7. G4（+ graph3d 力）— 粒子與 Barnes-Hut

兩個額外核心共用相同的不可見後端紀律，但未在變換序列中標為 G1–G3：

**G4 — 粒子 CPU 模擬**（`crates/vectojs-core-rs/src/particle.rs:1`，`packages/core/src/wasm/particle-backend.ts:1`）：鏡像 `ComputeParticleEntity.updateCPU`（至原點彈簧、滑鼠排斥、爆炸衝量、積分+阻尼、速度上限、反彈+箝制、生命衰減）。SoA `f32`（而非 `f64`）因為 GPU/WGSL 緩衝為 `Float32Array`；差分 oracle 為 `particleStepReferenceF32`（`particle-backend.ts:340`），其以 `Math.fround` 捨入每個中間值並使用 `sqrt(dx*dx+dy*dy)`（而非正確捨入的 f64 `Math.hypot`——`particle-backend.ts:350` 文件），因此與核心位元相同。JS `updateCPU` 保持 `f64`，每步差異 <1 ULP——可接受的 CPU vs GPU 分歧。核心融合 `hasPendingAnimations`（回傳待定旗標，`particle.rs:320` `EPS_VELOCITY/DISTANCE`）並對拒絕使用負回傳，使 `0`（「已穩定」）可與失敗區分（`particle-backend.ts:110` `step`，`particle.rs:310` `particle_step` 負狀態編碼）。

SoA 轉置為 AoS stride-8 上的 `gather`/`scatter`（`particle-backend.ts:160` 具 `ComputeParticleEntity.ts` 的 `PARTICLE_STRIDE_FLOATS`/`PARTICLE_OFFSET_*` 的 `gather`）。

**Graph3D Barnes-Hut 八元樹**（`crates/vectojs-force-rs/src/lib.rs:1`，`packages/graph3d/src/wasm/force-backend.ts:1`）：自 `f32` 位置建構 `f64` 質心八元樹並累積 `f64` 排斥加速度（`force_init`/`force_step`、`force_pos`/`force_accel` 指標）。JS oracle 為 `packages/graph3d/src/layout/VectoForceLayout.ts`。建構+累積為 tick 的 78–90%（`force-rs/lib.rs:18` 中 `graph3d-frame` 2026-08-17 註記），因此核心恰替換該階段——連結彈簧、置中與速度衰減積分留在 JS。建構旗標與 G1 相同——`crates/vectojs-force-rs/build.sh:20` `target-cpu=generic` 使 `fma` 排除並保留 `a*b + c*d` 捨入一致性（`force-rs/build.sh:8` 文件）。

**`@vectojs/math` `SpatialHashGrid`**（`packages/math/src/SpatialHashGrid.ts:1`）*非* WASM 支援。它是供通用實體 AABB 的純 JS 廣相雜湊（`MAX_CELLS_PER_AABB=64`，`query` `O(k)` 單元 + 結果，`insert`/`cellsForAABB` 文件），用於 Scene 命中路徑之外。G3 的 WASM 網格與 `SpatialHashGrid` 解決不同問題——新增空間加速時勿混淆。

## 8. 位元一致性測試 — 驗證標準

一致性並非「足夠接近」——它是每通道的 `Object.is`（`packages/core/test/wasm/differential.test.ts:78` `assertBitIdentical`），其區分 `+0`/`-0` 並將 `NaN===NaN` 視為相等（經具 `Object.is` 語意的 `toBe`）。套件在*相同* `buildStore` 輸入上對 JS 與 WASM 執行：

- `packages/core/test/wasm/differential.test.ts:1` — 變換（拓撲 `flat|chain|bushy|mixed`，數量 1→10k，`differential.test.ts:18` 處的種子 `rng`，斷言 `simd` 與 `scalar` 皆匹配，`differential.test.ts:110` 純量情況，跨增長/縮小場景的重用）。
- `anim-kernel.test.ts`、`hit-kernel.test.ts`、`particle-kernel.test.ts` — 具種子 PRNG 的 G2/G3/G4 等同物。
- 專用拒絕/視圖套件：`abi-bounds.test.ts`、`aabb-stale-module.test.ts`、`compose-stale-module.test.ts`、`scene-wasm-upload-fallback.test.ts`、`scene-wasm-aabb-rejection.test.ts`、`scene-wasm-resident.test.ts`、`scene-store.test.ts`、`view-revalidation.test.ts`、`memory-growth.test.ts`、`shared-runtime.test.ts`、`hit-fused.test.ts`。

全部以 `existsSync(wasmPath)` 與 `skipIf(!haveWasm)`（`differential.test.ts:14`）門控——缺失 `.wasm` 時跳過永不失敗，因為 JS 為備援。以 `just wasm-test`（`just wasm` 然後 `vitest`）執行它們；`just wasm-check` 僅為 fmt+clippy。基準 harness 分離：僅 `benchmarks/run-browsers.sh` 在具聚焦視窗 + 真實 GPU 的專用 Hyprland 工作區上有頭的結果可被引用（見全域 AGENTS.md 與 `hyprland-browser-bench` skill）。`benchmarks/debug-page.ts` 為無頭且不可引用。

若變更時會靜默破壞一致性的數學細節：

- `js_min`/`js_max` 傳播 `NaN` 並將 `-0 < +0` 視為不同（`lib.rs:655`，`hit.rs:220` `js_min_f32`/`js_max_f32`，`particle.rs:120` 對 `f32` 亦同），匹配 `Math.min`/`Math.max`。Rust 的 `f64::min/max` 與 `f32::min/max` 忽略 `NaN`——單一 `f64::min` 替換在溢位變換（其中 `Infinity*0 = NaN`）上分歧。
- AABB SIMD 歸約具結合性，因為 `js_min/js_max` 實作全序——`lib.rs:790` 文件證明 `f64x2_min/max` 具相同 NaN/零語意，因此通道配對的摺疊與純量左摺位元相符。
- 緩動使用明確乘法而非 `powi`/`powf`（`anim.rs:360` `ease`，`packages/animation/src/easing.ts` 的 JS 鏡像）。
- 粒子 oracle 以 `Math.fround` 捨入每個中間值（`particle-backend.ts:340`）並使用 `sqrt(dx*dx+dy*dy)` 而非 `Math.hypot`——`particle.rs:120` `js_min_f32/js_max_f32/js_clamp_f32` 匹配相同 Math 語意。

## 9. 備援與門控 — 韌性接縫

**狀態回傳。** 每個 `*_init`/`*_step`/`compose_*`/`hit_build`/`force_step` 回傳 `STATUS_*`（`lib.rs:485`，`anim.rs:158` `springs_ready`/`tweens_ready`，`hit.rs:110` `hits_ready`，`particle.rs:90` `particles_ready`，`force-rs/lib.rs:18` 鏡像的 `STATUS_*`）。`CAPACITY` 表示「數量過大」；`UNINITIALIZED` 表示「從未呼叫 init」；`BAD_RUN`/`OVERFLOW` 涵蓋執行表與配置失敗。呼叫者檢查並退回——儲存保持未觸動且視圖保持有效（`backend.ts:230` `ensure` 提前回傳，在 5 處被參考；`WasmBackendFacade.ts:470` `uploadRuns` 被拒路徑）。

**上傳重試。** `WasmBackendFacade`（`WasmBackendFacade.ts:134` `WASM_UPLOAD_REJECT_LIMIT=3`，`WasmBackendFacade.ts:492` 計數器）計數連續的 `uploadRuns` 拒絕。在 3 次時，它為此 Scene 生命期停用變換後端（`WasmBackendFacade.ts:500` 翻轉 `_mode='js'`——而非第二旗標——並經 `WasmBackendFacade.ts:501` 處的 `hasWarnedUploadFallback` 一次警告）。被拒的執行表將組合錯誤的樹，而真正超容的拓撲每影格重失敗，付出每次重試 `O(n)` 的 `buildTreeStore` 成本——因此為連續而非累積。`WasmBackendFacade.ts:252` `setTransform` 與 `WasmBackendFacade.ts:515` 處的成功路徑重置連續紀錄。

**記憶體增長失效。** `viewsStale`（`backend.ts:38`）檢查 `byteLength===0` 或 `buffer !== memory.buffer`；每後端 `revalidateViews`（`backend.ts:373`，`anim-backend.ts:121`，`hit-backend.ts:111`，`particle-backend.ts:112`）與 `WasmBackendFacade.ts:527` 中 `syncStore` 收集後的跨後端重取得處理共用線性記憶體增長（`hit_init` 在同一記憶體中配置其自身網格陣列）。

**陳舊模組探測。** `backend.ts:201` / `runAabbs` / `runKernel` 在呼叫前檢查 `typeof ex.compose_simd === "function"`——快取的 `.wasm`（位於固定 URL）可能早於 `compute_aabbs_simd` 並在渲染中拋出 `TypeError`（`#662`/`#798`）。`rejected` 路徑在兩個拒絕分支（`WasmBackendFacade.ts:481` + `:562` + `:607`）中皆設 `_aabbsFresh=false`，使融合的 AABB 收集永不讀取前影格的陳舊邊界。

**門控回報與預算。** `backend.available`（`WasmTransformBackend.available`、`HitTestBackend` 等）為「已安裝」；`Scene.animBatchedLastFrame` / `Scene.hitTestBackend` / `Scene.transformBackend` / `Scene.accelerators.*.reason` 為「實際使用」——`Scene.ts:1749` 處文件警告勿混淆。`animGate` 為三個閾值而非一個（`Scene.ts:1856` `animThreshold` 別名）。命中網格快取鍵為 `hitGridFrame` + `hitGridStructureVersion`（`WasmBackendFacade.ts:394`）——無結構組件時同影格變更將對變更前幾何命中。

## 10. 如何安全新增 WASM 核心

1. **在 `crates/vectojs-core-rs/src/` 或兄弟 crate 中開始。** 給予其自身 `static mut` 儲存、SoA 陣列、具 `checked_add` + `checked_mul` 守衛與 `free_*`/`free_partial_*` 的 `*_init`（見 `lib.rs:370` `init` + `free_store` + `free_partial_store`，`anim.rs:158` `anim_init` + `free_anim` + `free_partial_anim`，`hit.rs:130` `hit_init` + `free_hit`），`*_ready()` 謂詞（`anim.rs:158` `springs_ready`）與 `ptr_export!` 存取器（`lib.rs:564`）。自 `anim.rs:44` 或 `hit.rs:44` 複製形態——無物共用變換 `Store`。將無儲存哨兵初始化為 `Store::empty()`/`Anim::empty()`/`Hit::empty()` 並在 OOM 時發布，使後續呼叫取得 `STATUS_UNINITIALIZED` 而非釋放後記憶體讀取（`lib.rs:120` `empty` 文件）。

2. **除非緩衝為外部契約的 `f32`，否則使用 `f64`。** 變換核心僅 `f64` 以求一致性；僅 `particle.rs` 與 `simd_f32_bench.rs` 為 `f32`，各自具自身 oracle 與明確分歧註記（`particle.rs:10` *「獨立的差分 oracle」*）。勿在無度量理由與獨立差分檔案的情況下新增第二精度路徑。

3. **回傳狀態碼，永不陷阱。** 成功時 `STATUS_OK=0`，拒絕時 `STATUS_CAPACITY/UNINITIALIZED/BAD_RUN/OVERFLOW`——且不寫入任何內容。鏡像於 `packages/core/src/wasm/backend.ts:16` `WASM_STATUS`（與 `force-rs/lib.rs:18` 鏡像詞彙文件*「保持兩列表同步」*）。對三態回傳（例如待定旗標 0/1），在失敗時使用負狀態，使 `0` 保持有意義（`particle.rs:310` `particle_step` 負狀態編碼，`particle-backend.ts:110` `flag < 0` 消費者）。

4. **經 `just wasm` / `build.sh` 建構。** 永不裸 `cargo build --target wasm32-unknown-unknown`。若新增第二 crate，新增其自身 `rust-toolchain.toml:1`（`targets=["wasm32-unknown-unknown"]`，`components=["clippy","rustfmt"]`，`profile="minimal"`）與 `build.sh:20` 具 `RUSTFLAGS="-C target-cpu=generic -C target-feature=+simd128 -C linker=rust-lld"`——見 `crates/vectojs-force-rs/build.sh:20` 與 `rust-toolchain.toml:10` 作為範本。連接 `just wasm-check` 與 CI 工具鏈佈建（`.carryctx/rules/wasm-crate-build.md:9`）。

5. **先新增 JS oracle。** 在消費套件中撰寫 JS 參考（`soa.ts:246` `composeJS`，`soa.ts:316` `computeAabbsJS`，`SpringPhysics.ts:5` + `packages/animation/src/easing.ts`，`particle-backend.ts:340` `particleStepReferenceF32`）並保持其為已發布備援。匹配運算順序與 `Math.min`/`Math.max` NaN 語意（`lib.rs:655` `js_min/js_max`），使 `Object.is` 一致性可達成。非批次 oracle 如 `SpatialHashGrid.query` 保持其自身粗超集備援契約（`SpatialHashGrid.ts:120` *「受網格真實內容限制」*）

6. **新增差分測試。** `packages/core/test/wasm/`（或供力的 `packages/graph3d/test/`）下新檔案，遵循 `differential.test.ts:1` 形態：相同的 `buildStore`/SoA 輸入、兩條路徑、`assertBitIdentical`（`differential.test.ts:78`）經 `toBe`/`Object.is`、具種子 PRNG（`differential.test.ts:18` `rng`）、在 `!haveWasm` 時跳過（`differential.test.ts:14`），涵蓋 `simd` 與 `scalar` 核心（`differential.test.ts:110`）。新增界限溢位/拒絕測試（`abi-bounds.test.ts` 形態）與視圖重驗證測試（`view-revalidation.test.ts` 形態，`memory-growth.test.ts` 形態）。

7. **新增 TypeScript 後端外觀。** `packages/core/src/wasm/` 下新檔案，遵循 `anim-backend.ts:1`/`hit-backend.ts:1` 形態：`ensure`/`revalidateViews`/`step` 或 `run*`、`STATUS_OK` 檢查、`viewsStale` 輔助、失敗時回傳 `null` 的 `instantiateSync/Async/Streaming`（`backend.ts:467` 模式）。經 `runtime.ts:1`（`CoreWasmRuntime` + `moduleCache`）共用實例——勿實例化第二模組。在寫入視圖前於每次 `ensure` 後重驗證（`backend.ts:373` 模式，`WasmBackendFacade.ts:527` 跨後端重取得）。

8. **為其設門控。** 在 `Scene`/`WasmBackendFacade` 中新增每功能門控（`Scene.ts:1904` `animGate` 三元組，`WasmBackendFacade.ts:134` `WASM_UPLOAD_REJECT_LIMIT`，`WasmBackendFacade.ts:394` 網格快取鍵）。將回報萃取至 `WasmBackendFacade.ts:75` `AcceleratorReason`/`AcceleratorStatus`/`AcceleratorReport`，使 devtools 無需深入四個領域即可讀取。在 `benchmarks/<name>-wasm/entry.ts`（`benchmarks/core-wasm/entry.ts:1`，`benchmarks/anim-wasm/entry.ts:1` 雙成本模型）中以 `run-browsers.sh` 在專用 240Hz 工作區做基準——唯該 harness 產生可引用數據（全域 AGENTS.md + `hyprland-browser-bench` skill，`refreshHz` + `js vs resident` 加速分別）。保持門控預設保守：度量整合成本（配置擾動、收集、`Math.min` 語意）而非微核心時間。

9. **最後連接 `Scene`。** 新增 `enableWasm*` 非同步載入器（`Scene.ts:1706` `enableWasmTransforms` / `Scene.ts:1783` `enableWasmHitTest` / `Scene.ts:1809` `setAnimBackend` 模式），其經 `runtime.ts:48` `loadCoreWasmModule`/`createCoreWasmRuntime` 與 `WasmBackendFacade.ts:314` 處的共用執行期競爭守衛（*「當我們等待時，並行的 enableWasm\_ 可能已勝出」*）。饋入核心的 `Scene` 走訪必須與核心呼叫分離——在連接 WASM 前測試走訪 + JS 備援（`scene-store.ts:30` `buildTreeStore` 為隔離測試的接縫）。

## 11. 發布 WASM 變更前的檢查清單

- [ ] `just wasm`（若觸及則 `crates/vectojs-force-rs/build.sh`）建構；`just wasm-check`（fmt + clippy `-D warnings`）通過。
- [ ] `just wasm-test`（WASM 差分）通過——或在無 `.wasm` 時為 `skipIf(!haveWasm)`。在腳本/CI 中無裸 `cargo build`。
- [ ] 新核心具 `STATUS_*` 回傳，在拒絕時不寫入，並具拒絕注入測試；JS 路徑為永久備援。
- [ ] JS oracle 匹配運算順序與 `Math.min`/`Math.max` NaN/`-0` 語意；`Object.is` 一致性對 NaN/±0 角落與 `+16`/`+8` 尾通道成立。
- [ ] 新型別化陣列視圖經 `viewsStale`/`revalidateViews`（與跨後端重取得）與適用時的陳舊模組探測。
- [ ] 門控預設保守且經整合度量（`benchmarks/run-browsers.sh` 在有頭 Chrome+Firefox 上；分別回報 `refreshHz`、`js vs resident` 加速與 AABB 加速）。
- [ ] 加速器回報已更新（`WasmBackendFacade.ts:75` `AcceleratorReason` 與 `Scene.accelerators` getter），若新增髒/回報欄位則更新 `Scene.dart`/`_dirty` 風格文件。
- [ ] 若發布新的 `.wasm` 則已連接 `tsup` 資源複製（`tsup.config.ts:40` 模式）。

## 12. G1/G2/G3 詞彙 — 標籤含義

標籤為依發明順序的時序，而非優先級：

- **G1** — 世界矩陣 + AABB 核心（`crates/vectojs-core-rs/src/lib.rs:1`，`soa.ts:22`）。首個核心且為每個實體每影格執行的唯一一個。其餘皆按工作負載大小門控；G1 僅按「是否安裝 `.wasm` 且 `uploadRuns` 是否成功」門控。
- **G2** — 批次動畫尖峰（`crates/vectojs-core-rs/src/anim.rs:1`）。因其為下一個被切出的 SoA 而命名第二。現已位元相同，但最初為度量尖峰——`anim.rs:1` 表頭稱*「度量尖峰，而非整合後端」*，基準 `benchmarks/anim-wasm` vs `benchmarks/anim-wasm-scene` 決定其是否整合。勿將「G2 整合」讀作已完成。
- **G3** — 命中測試網格尖峰（`crates/vectojs-core-rs/src/hit.rs:1`）。相同狀態：具自身儲存的度量模組，按視埠網格大小與 `hit_overflow` 門控。`hit.rs:1` 表頭稱*「度量模組，如同 anim」*。
- **G4** — 粒子模擬（`crates/vectojs-core-rs/src/particle.rs:1`）。常稱 G4 但不在 G1/G2/G3 三元組中；保持分離因為它是 `f32` 且具自身 oracle。`crates/vectojs-force-rs`（八元樹）*非* G4——它是供 graph3d 的第二 crate（不同 `Cargo.toml:1`，不同 `build.sh:1` 輸出路徑）。

若新增散文，保持「G1/G2/G3」作為「變換 / 動畫批次 / 命中網格」的簡稱，並在指涉它們時明確命名 G4 與 force-rs。

## 13. Forge 基線與何時重度量

無行內基準表即為基線。可引用數據位於 `benchmarks/core-wasm/results/latest/`（`core-wasm-chrome.json:1`，`core-wasm-firefox.json:1`——schemaVersion 1，`refreshHz`，`panelHz`，`host.{cpu,gpu,driver}`，`rows[].{identical,jsNsPerEntity,copyNsPerEntity,residentNsPerEntity,copySpeedup,residentSpeedup,jsAabbNsPerEntity,wasmAabbNsPerEntity,aabbSpeedup}`）及其 `history/` 快照。harness 契約（`benchmarks/_shared/client.ts:1` `awaitStart`/`reportResult`，`benchmarks/core-wasm/entry.ts:1` 雙成本模型）要求前景於專用 Hyprland 工作區、具聚焦視窗與真實 GPU 的真實有頭瀏覽器（`benchmarks/run-browsers.sh:1`——唯一可引用路徑）。

在以下情況重度量：

- 變更 `lib.rs:84` `SIMD_ALIGN`、`soa.ts:64` `PAD`、`lib.rs:640` `f64x2_splat` 模式或 `build.sh:28` `RUSTFLAGS`——其中任何一項使 `residentSpeedup` 移動 >10%。
- 變更 `anim.rs:12` 彈簧常數或 `anim.rs:360` `ease`——重跑 `benchmarks/anim-wasm` 微觀 + `benchmarks/anim-wasm-scene` 整合（Chrome：100 個 driver 時彈簧 `2.06×`，100k 時 `3.7×`；100 時 tween `4.14×`，1k 時 `4.48×`——`anim-wasm-chrome.json:1` 2026-08-14），僅在整合成本證明時重置 `Scene.animGate`。
- 觸碰 `hit.rs:280` `hit_build` 或 `hit-store.ts:47` 收集——重跑 `benchmarks/hit-wasm` / `benchmarks/scene-hit-wasm`。
- 觸碰 `particle.rs:310` 或 `force-rs/lib.rs:1`——重跑 `benchmarks/particle-wasm` / `benchmarks/graph3d-frame`。

永遠同時回報 Chrome *與* Firefox 並在逐影格數據旁標註 `refreshHz`；Firefox 需設定 `layout.frame_rate`，否則報告低得無法察覺的約 60 Hz（全域 AGENTS.md 度量規則 + `hyprland-browser-bench` skill）。

## 14. 曾困擾此領域的陷阱

| 陷阱                                                                | file:line                                                      | 狀態                                    |
| ------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------- |
| `~/.cargo/config.toml` `cfg(all)` 將主機旗標合併至 wasm 連結        | `.carryctx/rules/wasm-crate-build.md:1`，`build.sh:8`          | 經 `RUSTFLAGS` 覆寫修正                 |
| `Vec<f64>` 僅 8 位元組對齊 → SpiderMonkey `v128_load` 慢 7 倍       | `lib.rs:84` `SIMD_ALIGN`                                       | 經 16 的 `alloc_zeroed` 修正            |
| 另一後端 `WebAssembly.Memory.grow` 後陳舊的 `TypedArray` 視圖       | `backend.ts:38` `viewsStale`，`WasmBackendFacade.ts:527`       | 經 `revalidateViews` + 跨後端重取得修正 |
| 陳舊快取的 `.wasm`（早於 `compute_aabbs_simd`）→ 渲染中 `TypeError` | `backend.ts:201` 探測                                          | 經純量備援修正（`#798`）                |
| 被拒的 `uploadRuns` 組合錯誤的樹 / 陳舊 AABB                        | `WasmBackendFacade.ts:470` + `:481` `:562` `_aabbsFresh=false` | 經重試上限修正（`DEC-0014`）            |
| `Math.pow`/`powi` vs 明確乘法 → 約 1e-12 緩動落差                   | `anim.rs:360` `ease`                                           | 經明確 `t*t` 修正                       |
| `f64::min` 忽略 NaN → 溢位變換上發散的 AABB                         | `lib.rs:655` `js_min`                                          | 經傳播 Math 的 `js_min/js_max` 修正     |
| `f32` 在深/灌木樹上約 93px 誤差 — 作為死亡核心發布                  | `simd_f32_bench.rs:1`，`Cargo.toml:20` `bench-f32`             | 經特性門控修正                          |
| `target-cpu` 啟用 `fma` → 單次捨入 vs JS 兩次捨入                   | `build.sh:28` `generic`                                        | 經 `generic` 修正                       |
| `new URL('@vectojs/core/…', import.meta.url)` 無法解析              | `asset.ts:10`                                                  | 經相對 `./vectojs_core.wasm` 修正       |

## 關聯

- **Boss 06（VMT 執行期）**擁有 `Entity` 樹、`Scene` 走訪、`structureVersion` → `storeStructureVersion` 與此 Boss 加速的 `WASM_UPLOAD_REJECT_LIMIT` 連接。
- **Boss 07（渲染器）**消費此 Boss 產生的世界矩陣與 AABB——此處的陳舊視圖為下個 Boss 陳舊光柵快取的版本。
- **Boss 11（圖布局）**重用相同的建構紀律（`crates/vectojs-force-rs`）供 3D 力；`@vectojs/graph-layout` 2D 四元樹（`BarnesHutQuadtree.ts:5`）保持純 JS。
- **Boss 02（文字/布局）**與 **Boss 03（投射）***非* WASM 支援——當瓶頸為塑形或 DOM 載體時勿伸手拿 WASM。

## 參考

- `crates/vectojs-core-rs/Cargo.toml:1` — 變換 crate 清單（crate-type、bench-f32、release 設定）
- `crates/vectojs-core-rs/src/lib.rs:1` — G1 純量/SIMD 組合 + SIMD AABB、Store、狀態碼、`js_min/js_max`
- `crates/vectojs-core-rs/src/anim.rs:1` — G2 彈簧/tween 批次、明確乘法緩動、獨立儲存
- `crates/vectojs-core-rs/src/hit.rs:1` — G3 稠密視埠網格、計數排序建構、溢位
- `crates/vectojs-core-rs/src/particle.rs:1` — G4 f32 粒子 SoA、融合待定旗標、負狀態拒絕
- `crates/vectojs-core-rs/src/simd_f32_bench.rs:1` — 僅基準的 f32x4，作為預設被否決（約 93px 誤差）
- `crates/vectojs-force-rs/src/lib.rs:1` — graph3d Barnes-Hut 八元樹（f64 累積、f32 位置、抖動 `imul`）
- `crates/vectojs-core-rs/build.sh:1` / `crates/vectojs-force-rs/build.sh:1` — 正確的 `RUSTFLAGS`（`generic`、`+simd128`、`rust-lld`）
- `.carryctx/rules/wasm-crate-build.md:1` — 建構規則（just wasm、RUSTFLAGS 覆寫、被 git 忽略的二進位）
- `packages/core/src/wasm/soa.ts:1` — JS SoA、`buildStore`、`composeJS`/`computeAabbsJS` oracle
- `packages/core/src/wasm/backend.ts:1` — 變換後端（常駐 vs 複製、`WASM_STATUS`、`viewsStale`、陳舊模組探測）
- `packages/core/src/wasm/runtime.ts:1` — 共用 `CoreWasmRuntime` + 全域模組快取 + 惰性 memo 後端
- `packages/core/src/wasm/{anim,hit,particle}-backend.ts:1` / `asset.ts:1` — G2/G3/G4 外觀 + `coreWasmUrl`
- `packages/core/src/wasm/{scene-store,hit-store,hit-store-fused}.ts:1` — 樹 → SoA / AABB 收集 / 融合收集
- `packages/core/src/tree/scene/WasmBackendFacade.ts:1` — 四個後端、`AcceleratorReason/Report`、`syncStore`/`ensureAabbs`、上傳重試、共用執行期
- `packages/math/src/SpringPhysics.ts:1` / `packages/math/src/SpatialHashGrid.ts:1` — JS 物理/網格（僅 JS、非 WASM — `MAX_CELLS_PER_AABB=64`）
- `packages/core/test/wasm/differential.test.ts:1` + `anim-kernel.test.ts`/`hit-kernel.test.ts`/`particle-kernel.test.ts` — 位元相同（`Object.is`）套件、`skipIf(!haveWasm)`
- `benchmarks/core-wasm/entry.ts:1` / `benchmarks/anim-wasm/entry.ts:1` / `benchmarks/core-wasm/results/latest/:1` — 有頭 `run-browsers.sh` 度量（Chrome+Firefox、`refreshHz`、`residentSpeedup`）
