---
title: '08 — WASM アクセラレータ — G1/G2/G3 とビットパリティ'
description: '@vectojs/core 背後の不可視な WASM バックエンド：G1 ワールド行列、G2 アニメーションバッチ、G3 ヒットグリッド（さらに G4 パーティクル）、SIMD を可能にする SoA ストア、そして WASM を任意に保つビットパリティ契約。'
order: 28
---

# 08 — WASM アクセラレータ — G1/G2/G3 とビットパリティ

> **ボス 08** は設計上不可視である。Rust カーネル（`crates/vectojs-core-rs`、`crates/vectojs-force-rs`）は、JS エンジンがすでに正しく行っていることを高速化する — ワールド行列合成、アニメーション tick、ヒット broad-phase、パーティクル積分 — そして決して必須にはならない。高速化されたすべてのパスには同じビットを生成する JS フォールバックがあり、すべてのビルド、ゲート、テストはその promise を保つために存在する。

- **学べること**: なぜ WASM が不可視なバックエンドなのか、`f64x2` を可能にする SoA ストア、G1／G2／G3（+G4）がそれぞれ何を高速化し、どのようにゲートされ、headed ベンチマークが実際に何を計測したか、ビットパリティがどのようにテストされるか、そしてフォールバック契約を壊さずに新しいカーネルを追加する方法。
- **学べないこと**: VMT の dirty／ライフサイクル（ボス 06）、レンダラー／DPR 一貫性（ボス 07）、graph-layout チューニング（ボス 11）、Three／XR の二世界マッピング（ボス 09）。本ドキュメントは VMT とレンダラーの間の高速化レイヤーである。

## 1. なぜ WASM は不可視なバックエンドなのか

VectoJS は Rust ゼロで正しく動作する。`packages/core/src/wasm/soa.ts:1`（`composeJS`、`computeAabbsJS`）と `packages/math/src/SpringPhysics.ts:1`／`packages/animation/src/easing.ts` は**永続的な** oracle かつフォールバックである。crate マニフェストが明示している — `crates/vectojs-core-rs/Cargo.toml:6`「不可視なバックエンド、TypeScript パスが永続的なフォールバックである」および `crates/vectojs-force-rs/Cargo.toml:6` の force カーネルでも同様である。コンパイル済み `.wasm` 自体は gitignore されている（`packages/core/src/wasm/vectojs_core.wasm`、`packages/graph3d/src/wasm/vectojs_force.wasm`）— CI でビルドされ npm に公開され、決してコミットされない（`.carryctx/rules/wasm-crate-build.md:6`）。

この単一の決定から 3 つの制約が従う：

1. **インスタンス化は失敗しうるし、黙って失敗しなければならない。** CSP `wasm-unsafe-eval`、アセット欠落、未対応の `simd128`、古いキャッシュモジュール — すべてのローダーは `null` を返し、呼び出し元は JS パスを維持する。`packages/core/src/wasm/backend.ts:467` `instantiateSync`／`instantiateAsync`／`instantiateStreaming`、`packages/core/src/wasm/runtime.ts:48` `loadCoreWasmModule`／`createCoreWasmRuntime`、`packages/graph3d/src/wasm/force-backend.ts:55` の force 同等物、そしてバンドラ解決用の `packages/core/src/wasm/asset.ts:22` `coreWasmUrl`／`packages/graph3d/src/wasm/asset.ts:22` `forceWasmUrl`。失敗はエラー path ではなくデフォルト状態である。

   URL ヘルパーは重要である：`new URL('@vectojs/core/…', import.meta.url)` は動かない — `new URL` は**相対**参照のみを解決し、bare specifier は相対ではない（`asset.ts:10`）。パッケージ内部からの `new URL('./vectojs_core.wasm', import.meta.url)` だけが、ネイティブ ESM とバンドラの両方で正しく解決される唯一の形式である。呼び出し元は `await scene.enableWasmTransforms(coreWasmUrl)`（`asset.ts:8` の例）を行い、fetch／compile が失敗するとメソッドは `false` を返す（`Scene.ts:1704` `enableWasmTransforms` ドキュメント：「WASM が有効になれば true、JS パスのままなら false を解決する」）。

2. **カーネルは fallible でなければならず、trap してはならない。** エクスポートは `STATUS_OK`（0）または非ゼロの `STATUS_CAPACITY/UNINITIALIZED/BAD_RUN/OVERFLOW`（`crates/vectojs-core-rs/src/lib.rs:485` 定数、`packages/core/src/wasm/backend.ts:16` `WASM_STATUS`）を返し、拒否時は何も書き込まない。JS 側は非ゼロを「このフレームは参照 path を実行する」として扱う（`packages/core/src/wasm/backend.ts:212` `compose` early-return、`packages/core/src/wasm/anim-backend.ts:173` `stepSprings` boolean、`packages/core/src/tree/scene/WasmBackendFacade.ts:487` upload-retry、`packages/core/src/wasm/particle-backend.ts:110` 三値の負ステータス）。

3. **共有リニアメモリ、共有モジュール。** `packages/core/src/wasm/runtime.ts:1`（`CoreWasmRuntime`）以前は、4 つのバックエンドが同じバイナリに対して 4 回のコンパイルと 4 つのリニアメモリを意味していた。現在は 1 つの `WebAssembly.Module` が URL ごとにグローバルにキャッシュされ（`runtime.ts:38` `moduleCache`、文字列／URL のみでキー付け — バイトはキャッシュされない、`runtime.ts:48` `cacheKey` ドキュメント）、Scene ごとに 1 つの `Instance` が決してエイリアスしない異なる `static mut` static を介して 4 つのストアすべてを公開する（`crates/vectojs-core-rs/src/lib.rs:44` `Store`、`src/anim.rs:44` `Anim`、`src/hit.rs:44` `Hit`、`src/particle.rs:44` `Particles`、`crates/vectojs-force-rs/src/lib.rs:44` `Octree`+`POS`／`ACCEL`）。`CoreWasmRuntime` は各バックエンドを遅延的に構築しメモ化する（`runtime.ts:90` `transform()`／`anim()`／`hit()`／`particle()`）ため、transform のみを有効化する Scene が anim／hit の確保コストを支払うことはない。

レポートでは「インストール済み」と「このフレームでアクティブ」を分離して保持する。`Scene.accelerators: AcceleratorReport`（`WasmBackendFacade.ts:122` レポート形状、`Scene.ts:1749` ドキュメント「`_wasmBackend` を必要とするため definite-assignment」）はアクセラレータごとに `{ available, activeThisFrame, reason, path }` を返す — `available` は「バックエンドがインストールされゲートが許可している」、 `activeThisFrame` は「実際に実行された」、 `reason` は `not-installed | below-gate | rejected | active`（`WasmBackendFacade.ts:75` `AcceleratorReason`）。`Scene.animGate` と `Scene.animBackend` は古典的な混同である：ドライバ数がゲートを下回ると `animBackend==='wasm'` でも `animBatchedLastFrame===false` になる（`Scene.ts:1749` および `Scene.ts:1904` ゲートドキュメントを参照）。

## 2. ビルド規律 — `just wasm` であり素の cargo ではない

罠は `~/.cargo/config.toml`（`.carryctx/rules/wasm-crate-build.md:1`）にある：`[target.'cfg(all())']` セクションは `wasm32` にもマッチし、Cargo はその `rustflags` をターゲット固有のものと**結合**する。`-C target-cpu=native` や `-fuse-ld=mold` のようなホストフラグが `wasm32-unknown-unknown` リンクに漏れ出し、壊す（`rust-lld: error: unknown argument: -fuse-ld=mold`）。環境変数 `RUSTFLAGS` は config フラグを**置換**するが、ターゲット固有の config はそうならない。

唯一正しいビルド：

```bash
just wasm  # runs crates/vectojs-core-rs/build.sh with correct RUSTFLAGS
# or for the force kernel:
# crates/vectojs-force-rs/build.sh  (same RUSTFLAGS)

# what build.sh does (crates/vectojs-core-rs/build.sh:28):
RUSTFLAGS="-C target-cpu=generic -C target-feature=+simd128 -C linker=rust-lld" \
  cargo build --release --target wasm32-unknown-unknown --manifest-path crates/vectojs-core-rs/Cargo.toml
```

ルールの詳細（`crates/vectojs-core-rs/build.sh:1`、`crates/vectojs-force-rs/build.sh:1`、`.carryctx/rules/wasm-crate-build.md:1`）：

| rule                                                           | file:line                                                        | why                                                                                                                                                                                                                                               |
| -------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target-cpu=generic`                                           | `build.sh:28`                                                    | `fma`（fused multiply-add）を除外する。`generic` は `fma` を持たない。ホストチューニングされた CPU は `a*b + c*d` を 1 回の丸めに融合するが、JS は 2 回行う — ビットパリティが壊れる。`crates/vectojs-force-rs/build.sh:8` がこれを明示している。 |
| `target-feature=+simd128`                                      | `build.sh:28`                                                    | `v128`／`f64x2`／`f32x4` を有効化する。これがないと `#[target_feature(enable="simd128")]` カーネル（`lib.rs:612`、particle コメント）がコンパイル失敗または trap する。                                                                           |
| `linker=rust-lld`                                              | `build.sh:28`                                                    | `mold` のような `~/.cargo/config` のリンカを上書きする。                                                                                                                                                                                          |
| `panic="abort"` + `strip` + `lto` + `codegen-units=1`          | `Cargo.toml:22`                                                  | 最小で決定論的なバイナリ。                                                                                                                                                                                                                        |
| `edition="2024"` + `rust-toolchain.toml:10` `channel="stable"` | `rust-toolchain.toml:1`、`.carryctx/rules/wasm-crate-build.md:3` | 正確なチャネルピンは _stable_ でありバージョンではない — 正確なバージョンピンはオフライン／ミラーボックスを壊す。CI は代わりに正確なバージョンをピンする。                                                                                        |
| `just wasm-check`                                              | `.carryctx/rules/wasm-crate-build.md:5`                          | 同じ `RUSTFLAGS` での `cargo fmt --check` + `cargo clippy --target wasm32-unknown-unknown -- -D warnings`。                                                                                                                                       |
| `just wasm-test`                                               | `.carryctx/rules/wasm-crate-build.md:5`                          | `just wasm` の後にコア差分スイート（`vitest`）。                                                                                                                                                                                                  |
| binary gitignored                                              | `build.sh:14`、`.carryctx/rules/wasm-crate-build.md:6`           | TS のみのコントリビュータは Rust を必要としない。`tsup.config.ts:40` copy ステップ経由で公開（`packages/graph3d/tsup.config.ts:40` `vectojs_force.wasm → dist/wasm/`）。                                                                          |
| `Cargo.toml` `publish=false`                                   | `Cargo.toml:5`（both crates）                                    | crate は crates.io パッケージではない — npm 経由の `.wasm` のみが重要。                                                                                                                                                                           |

`f32x4` 評価カーネル（`crates/vectojs-core-rs/src/simd_f32_bench.rs:1`）は `bench-f32`（`Cargo.toml:20` `bench-f32 = []`）の背後にあり決して出荷されない — 計測して却下されたものである。`build.sh:18` はオプトイン形式 `./build.sh --features bench-f32` と、デフォルトがそれを除外する理由を文書化している：f32 は計測して却下された。

## 3. SoA ストア — SIMD 到達を可能にする形状

`packages/core/src/wasm/soa.ts:22` がシステムの半分であり、`crates/vectojs-core-rs/src/lib.rs:1` がもう半分である。`lib.rs:10` のドキュメントコメントは不可欠である：

> 1 フィールドあたり 1 つのフラットな `f64` 配列。インターリーブされたレコードでは、連続する Entity の `x` は `N*8` 離れる — `v128` ロードでは 2 つを同時に取得できない。

### 3.1 SoA、AoS ではない

`Store`（`lib.rs:44`）は 22 個の `*mut f64` 入力／出力／bounds／AABB 配列と 3 個の `*mut i32` ランテーブルを保持する。JS 側：エクスポートされたポインタ（`lib.rs:564` `ptr_export!`、`backend.ts:178` `p_x()…p_run_len()`）を介して `WebAssembly.Memory.buffer` 上に張られた一致する `Float64Array`／`Int32Array` ビューを持つ `TransformStore`（`soa.ts:44`）。

### 3.2 兄弟ラン、深さ順

WASM SIMD には gather がない。任意の親を跨いでベクトル化すると、Entity ごとの親行列ロードが必要になる。代わりに `soa.ts:178` `buildStore` は**1 つの親の子は連続する**ことを保証する（親ごとの BFS：親を dequeue し、すべての子を 1 つのランとして emit し、それらを enqueue する）。親ワールド行列はランごとに一度だけ splat され（`lib.rs:640` `f64x2_splat(*S.wa.add(p))`）、子が両レーンを埋める。`store.runStart/runLen/runParent` が反復テーブルであり、`set_run_count`（`lib.rs:600`）がその長さを公開する。

JS ビルダーは検証する：`parent===-1` の root がちょうど 1 つ（欠落／重複で throw、`soa.ts:104`）、すべての親インデックスが範囲内（`soa.ts:112`）、root はストアインデックス 0 で単位行列に seed される（`lib.rs:603` `seed_root`、`soa.ts:246` `composeJS` は `wa[0]=1,wd[0]=1` に seed）。再構築の間、フレームごとの同期は現在の `x/y/scale/rotation/opacity` を常駐入力ビューに gather し直し、カーネルを再実行するだけである（`WasmBackendFacade.ts:458` `syncStore`）。

### 3.3 パディング、アライメント、事前計算された三角関数

**余りループではなくパディング。** `init`（`lib.rs:370`）は `capacity + 8` を確保する（`simd_f32_bench.rs:128` では `f32x4` 用に `+16`）。奇数長の末尾は論理末端の 1 スロット先を読む — パディングレーンは書き込まれるが決して読み返されない（`lib.rs:643` `compose_simd` コメント、`backend.ts:152` upload コメント）。JS ストアもパディングを反映する（`soa.ts:64` `capacity = count + 8`）。

**事前計算された `cos`／`sin`。** WASM には超越関数がない。フレームごとの再計算はラウンド 1 で最大のコストだった（`lib.rs:66`）。JS はビルドごとに一度 `cos=Math.cos(rotation)` を書き込み（`soa.ts:218` `writeInput`）、フレームごとの常駐 gather はキャッシュされた `_getTrig()` を読む（`WasmBackendFacade.ts:544` + `Entity.ts:1746` trig キャッシュ）。

**16 バイトアライメント。** `SIMD_ALIGN=16`（`lib.rs:84`）。`leak_f64` は 16 バイトアラインで `alloc_zeroed` を使用する — `Vec<f64>` は 8 バイトアラインでしかなく、SpiderMonkey で `v128_load` が約 7 倍遅くなる（計測済み、`lib.rs:84` コメントあたり）。ヘルパーは OOM 時に trap するのではなく null を返すため、`init` は `STATUS_OVERFLOW` を報告し以前のストアをそのまま残せる（`lib.rs:340` `free_store` + オーバーフローパス）。

### 3.4 共有メモリビューのハザード

4 つの core-rs バックエンドすべて（そしてすべての `Scene`）が 1 つの `WebAssembly.Memory` を共有する。任意の `*_init` がメモリを拡張すると、他のすべてのバックエンドの `TypedArray` ビューがデタッチされる（`byteLength===0` として読まれる）。したがって `backend.ts:373` `revalidateViews`／`viewsStale`（`backend.ts:38` ヘルパー）および `anim-backend.ts:121`／`hit-backend.ts:111`／`particle-backend.ts:112` の同様のもの、さらに `WasmBackendFacade.ts:527` の `syncStore` gather 後のクロスバックエンド再取得がある。transform バックエンドは `typeof ex.compose_simd === "function"`（`backend.ts:201`）も probe するため、`compute_aabbs_simd` より前の古いキャッシュ `.wasm` は throw する代わりにスカラーに劣化する（`#798`、`aabb-stale-module.test.ts`）。

## 4. G1 — ワールド行列合成（+ AABB）

**高速化するもの：** `Canvas T * S * R` 合成（`lib.rs:520` `compose_scalar`／`lib.rs:612` `compose_simd`、`soa.ts:246` `composeJS`）とそれに続くワールド空間 AABB パス（`lib.rs:670` `compute_aabbs`／`lib.rs:790` `compute_aabbs_simd`、`soa.ts:316` `computeAabbsJS`）。すべての Entity のワールド行列（`a,b,c,d,e,f,opacity`）は `parentMatrix * T(x,y) * S(sx,sy) * R(cos,sin)` であり、その後ローカル bounds `[bx,by,bw,bh]` がそれを通してワールド AABB（`aminx…amaxy`）へ押し出される。

**Scene への到達方法：** `buildTreeStore`（`packages/core/src/wasm/scene-store.ts:30`）は `Entity.children` を `InputNode[]` と `buildStore` に walk する。`WasmBackendFacade`（`packages/core/src/tree/scene/WasmBackendFacade.ts:168` transform 領域、`WasmBackendFacade.ts:458` `syncStore`）は `Scene.enableWasmTransforms`（`Scene.ts:1706`）経由でホットスワップする。2 つの統合コストが存在する（`benchmarks/core-wasm/entry.ts:1` を参照）：`copy`（upload+カーネル+readback — すべての `Float64Array` を再 upload し `wa…wo` を読み返す）vs `resident`（カーネルのみ、入力／出力はすでに WASM ビュー内）。Resident — アクセサが直接 `inputView()`／`boundsView()` に書き込み、レンダラが `worldView()`／`aabbView()` を読む（`backend.ts:320`／`backend.ts:420`、`WasmBackendFacade.ts:518` world-view return）— が設計上のパスであり、ベンチマークが `resident` として報告するものである。

**計測された勝利**（`benchmarks/core-wasm/results/latest/core-wasm-chrome.json:1`、2026-08-14、i7-14650HX、Chrome 151、`benchmarks/run-browsers.sh` — 唯一引用可能なハーネス、グローバル AGENTS.md を参照）：

| topology | n    | js ns/elem | copy ns/elem | resident ns/elem | resident speedup | AABB speedup |
| -------- | ---- | ---------- | ------------ | ---------------- | ---------------- | ------------ |
| flat     | 1k   | 4.8        | 4.83         | 2.73             | 1.76×            | ~1.0×        |
| flat     | 10k  | 4.26       | 5.37         | 2.77             | 1.54×            | 1.95×        |
| flat     | 100k | 4.55       | 8.64         | 3.57             | 1.27×            | 2.09×        |
| chain    | 1k   | 14.73      | 10.23        | 8.13             | 1.81×            | 1.14×        |
| chain    | 10k  | 15.25      | 10.1         | 7.15             | 2.13×            | 1.10×        |
| chain    | 100k | 16.25      | 13.63        | 7.35             | 2.21×            | 1.08×        |
| bushy    | 10k  | 10.46      | 8.25         | 4.72             | 2.21×            | 1.99×        |
| bushy    | 100k | 12.24      | 11.41        | 5.69             | 2.15×            | 2.22×        |

同じホストでの Firefox はより接近している：たとえば flat 1k `resident 1.15×`、chain 1k `2.63×`（`core-wasm-firefox.json:1`）。エンジン間のギャップは実在する — `run-browsers.sh` 契約は両方の報告を要求する。

copy パスは小さな／中程度の fan-out では JS より**遅く**なりうる（flat 1k `0.995×`、flat 10k `0.79×`、`entry.ts:80` `copy` 計測）。2 回の `Float64Array.set` と 2 回の読み取りが支配するためである。`entry.ts:1` のドキュメントは、Phase 1 では resident の数値が公平な比較であると警告している。AABB パス単体ではスケール時に約 2.2× に達する。レーンがペア化されラン walk なしであり、その min／max リダクションは total-order の `js_min/js_max`（`lib.rs:790` の `f64x2_min/max` の NaN／±0 セマンティクスに関する証明）の下で結合的であるためだ。

**なぜ `f32x4` が却下されたか：** `Cargo.toml:14` + `lib.rs:20`／`simd_f32_bench.rs:1` — f32 は約 7 桁の有効数字しか持たず（`lib.rs:6` コメント：「深い／bushy なツリーで #143 では ~93px の誤差」）、JS リファレンスとビット比較可能ではない。4 レーンカーネル（`simd_f32_bench.rs:128` `+16` pad、`f32x4_splat/mul/add` at `simd_f32_bench.rs:300`）は bench 専用で、`bench-f32`（`Cargo.toml:20`）の背後でゲートされ決して出荷されず、独自の非融合ストア `SF`（`simd_f32_bench.rs:44`）を持つ。

## 5. G2 — バッチ化されたアニメーションドライバ（spring + tween）

**高速化するもの：** 現在アクティブなすべての `SpringDriver`／`TweenDriver` インスタンスを、JS のドライバごとの `driver.tick()` ループ（`packages/core/src/tree/scene/DriverTicker.ts:131` `tick`）の代わりに、1 回の `spring_step`／`tween_step` 呼び出し（`crates/vectojs-core-rs/src/anim.rs:1`）で進めること。

**ビットパリティ — 現在は完全一致。** `anim.rs:8` は、これが今やビット単位で一致する計測スパイクだったことに触れている。両側とも整数の累乗を明示的な乗算（`t*t`、`t*t*t`、`anim.rs:360` `ease` と `packages/animation/src/easing.ts` での `-2*t+2`）として書き、 `Math.pow`／`powi` ではない — どちらも正しく丸められず、古いペアリングは約 1e-12 で乖離した。spring 定数（`anim.rs:12` `MAX_FRAME_DT=0.25`、`MAX_STEP_DT=1/120`、`VAL_EPSILON/VEL_EPSILON=0.005`）は `packages/math/src/SpringPhysics.ts:5`（`MAX_FRAME_DT=0.25`、`MAX_STEP_DT=1/120`、`SpringPhysics.ts:59` epsilons）を映す。tween の終端スナップ（`anim.rs:410`「`active>=dur` になれば正確に `to` でなければならない」）は `packages/animation/src/drivers.ts` `TweenDriver.tick` と一致するため、`f(1)===1` を満たさないカスタムイージングでも着地する。

**ゲーティング — 数が重要。** G1（毎フレーム 100k ノード）とは異なり、アクティブなドライバ数は通常小さいため、バッチ処理は閾値を超えて初めてペイする。`Scene.animGate`（`Scene.ts:1904`）：

```ts
public animGate: { spring: number; tween: number; mixed: number } = {
  spring: 128, tween: 256, mixed: 128,
};
```

`DriverTicker.tick`（`DriverTicker.ts:50` `AnimGate`、`DriverTicker.ts:197` ゲートオープン会計、`DriverTicker.ts:64`「O(tree size) — G3 の最初のベンチマークが犯した正確な間違い」）は、アクティブなバッチ可能ドライバを密な `Float64Array` パック（`anim-backend.ts:68` `ensure` + `springView`／`tweenView`）に gather し、カーネルをそれぞれ 1 回ずつ実行する。カスタム `EasingFn` tween は `wasmEasingId === null` で JS に残る（`DriverTicker.ts:228`）。ゲートを下回ると JS ループが維持される — `anim-wasm-scene` 統合ベンチマークでは、確保の churn がカーネルではなくコストを支配していた（`DriverTicker.ts:68` の `benchmarks/anim-wasm`／`anim-wasm-scene` を参照するコメント）。

`Scene.animBatchedLastFrame`（`Scene.ts:2030` + `Scene.ts:1749` ドキュメント「`_wasmBackend` を保持するため definite-assignment」）はゲートが**開いたかどうか**だけを報告する。`animBackend`（「インストール済み」）とは異なる。`Scene.animThreshold`（`Scene.ts:1856`）は `animGate.tween` を読み、3 つのゲートすべてを一度に書き込む後方互換エイリアスである — `animGate` を優先すること（単一の閾値は両方の種別で正しくなりえない）。

**SoA + 別ストア。** `anim.rs:44` `Anim` は異なる `static mut`（`s_val/s_target/s_vel/s_stiff/s_damp/s_mass`、`t_from/t_to/t_elapsed/t_dur/t_delay/t_ease/t_val`、`anim.rs:54` の `spring_capacity/tween_capacity`）と独自の `anim_init`（`anim.rs:158`）および `STATUS_*` 返却を持つ独立したストアである — transform の `Store` との cross-touch はない。JS ファサードは密パックである：すべての適格フレームでアクティブなドライバをすべてゼロから再 gather し（`anim-backend.ts:20`「フレームを跨いだ常駐なし」）、カーネルを実行し、結果を scatter する — そのためドライバの参加／離脱やゲートの反転に追加の無効化コストはかからない。

## 6. G3 — ヒットテスト broad-phase（密なビューポートグリッド）

**高速化するもの：** `Scene.findEntityAt`（`HitTester.ts:12`）はポインタイベントごとに `O(N)` の深さ優先 `isPointInside` walk を行う（`HitTester.ts:227` `findHitRecursively`）。ヒットカーネル（`crates/vectojs-core-rs/src/hit.rs:1`）は broad phase を均一グリッドに置き換える：各インタラクティブな Entity のワールド AABB を `cellSize=64` で `[0,vw]×[0,vh]` を覆うセルにバケットし、点クエリは 1 つのセルのみを走査して**最前面**の AABB 候補（最大インデックス — 前順、`packages/core/src/wasm/hit-store.ts:16` 不変条件 — 大きいインデックスが後に描画される）を返す。呼び出し元は正確な `isPointInside` で確認するため、非矩形ヒットは正しいまま、グリッドヒットは確定的である（`HitTester.ts:119`「WASM パスは確定的」— 信頼できるグリッドの後に JS フォールバックは続かない）。

**スコープ：** ハッシュではなく密なフラット `i32` 配列 — ポインタは常にビューポート内にある（`hit.rs:15`）。3 つの配列：セルごとの `cell_start/cell_count`、`(entity, cell)` メンバーシップ用の `items`。counting-sort ビルド（`hit.rs:280` `hit_build`：セルごとにカウント → `cell_start` への prefix-sum → scatter）。`hit_overflow()`（`hit.rs:220`）は item-cap 枯渇を通知する。JS 側はオーバーフローを「グリッドは信頼できない、フォールバックする」として扱う（`packages/core/src/wasm/hit-backend.ts:122` `runBuild` はオーバーフローで `false` を返す）。`hit_query`（`hit.rs:380`）はポインタのセルのみを走査し、`hit_init` が一度も実行されていないとき `-STATUS_UNINITIALIZED` を返す — 真のミス（`-1`）と区別可能である。

**JS 側の配線：** `gatherHitAABBs`（`hit-store.ts:47`）は `Entity.children` を前順で walk する — `findHitRecursively` の順序と同一 — ワールド AABB と、`getBounds()` を持たない Entity 用の `boundless` リスト（`boundless` を経由し AABB スロットからは決して読まれない、`hit-store.ts:60`）を収集する。fused gather（`hit-store-fused.ts`）は、Entity ごとに四隅を再計算する代わりに G1 ワールド行列パス（`WasmBackendFacade.ts:583` `ensureAabbs` + `hitGridFrame`／`hitGridStructureVersion` キャッシュキー at `WasmBackendFacade.ts:394`）を再利用する。`HitTester.ts:60`／`WasmBackendFacade.ts:150` がビューポートグリッドと `findEntityAtWasm` パス（`WasmBackendFacade.ts:334` `setHit` がグリッドを無効化）を所有する。

**`@vectojs/graph-layout` ではない。** そのパッケージ（`packages/graph-layout/src/ForceLayout2D.ts:1`、`internal/BarnesHutQuadtree.ts:1` — 衝突を一級で扱う真の 2D quadtree、`BarnesHutQuadtree.ts:5` の `ZERO_TIER` sentinel）は WASM バックエンドなしの **2D** force レイアウトである。**3D** force カーネルは `@vectojs/graph3d` 用の `crates/vectojs-force-rs` である（§7 を参照）。

## 7. G4（+ graph3d force）— パーティクルと Barnes-Hut

2 つの追加カーネルが同じ不可視バックエンド規律を共有するが、transform シーケンスでは G1–G3 とラベル付けされていない：

**G4 — パーティクル CPU sim**（`crates/vectojs-core-rs/src/particle.rs:1`、`packages/core/src/wasm/particle-backend.ts:1`）：`ComputeParticleEntity.updateCPU`（原点への spring、マウス反発、爆発インパルス、積分+damp、速度上限、バウンス+クランプ、寿命減衰）を映す。SoA `f32`（`f64` ではない）。GPU／WGSL バッファが `Float32Array` であるためである。差分 oracle は `particleStepReferenceF32`（`particle-backend.ts:340`）であり、すべての中間結果を `Math.fround` で丸め、`sqrt(dx*dx+dy*dy)`（正しく丸められた f64 である `Math.hypot` ではない、`particle-backend.ts:350` ドキュメント）を使用するため、カーネルとビット同一である。JS の `updateCPU` は `f64` のままであり、ステップあたり <1 ULP 差 — 許容された CPU vs GPU の乖離である。カーネルは `hasPendingAnimations` を融合し（保留フラグを返す、`particle.rs:320` `EPS_VELOCITY/DISTANCE`）、負の返却で拒否を扱うため `0`（「収束」）を失敗と区別できる（`particle-backend.ts:110` `step`、`particle.rs:310` `particle_step` 負ステータスエンコーディング）。

SoA 転置は AoS stride-8 上の `gather`／`scatter` である（`particle-backend.ts:160` `gather` と `ComputeParticleEntity.ts` からの `PARTICLE_STRIDE_FLOATS`／`PARTICLE_OFFSET_*`）。

**Graph3D Barnes-Hut octree**（`crates/vectojs-force-rs/src/lib.rs:1`、`packages/graph3d/src/wasm/force-backend.ts:1`）：`f32` 位置から `f64` 質量中心 octree を構築し、`f64` 反発加速度を蓄積する（`force_init`／`force_step`、`force_pos`／`force_accel` ポインタ）。JS oracle は `packages/graph3d/src/layout/VectoForceLayout.ts` である。Build+accumulate は tick の 78–90% を占める（`graph3d-frame` 2026-08-17 note in `force-rs/lib.rs:18`）ため、カーネルは正確にそのフェーズを置換する — link spring、centering、velocity-decay 積分は JS に残る。ビルドフラグは G1 と同一 — `crates/vectojs-force-rs/build.sh:20` `target-cpu=generic` で `fma` を除外し `a*b + c*d` の丸めパリティを保持する（`force-rs/build.sh:8` ドキュメント）。

**`@vectojs/math` `SpatialHashGrid`**（`packages/math/src/SpatialHashGrid.ts:1`）は WASM バックされていない。汎用 Entity AABB 用の純粋 JS broad-phase ハッシュ（`MAX_CELLS_PER_AABB=64`、`query` は `O(k)` セル + results、`insert`／`cellsForAABB` ドキュメント）であり、Scene ヒットパス外で使われる。G3 の WASM グリッドと `SpatialHashGrid` は異なる問題を解く — 空間高速化を追加するときに混同しないこと。

## 8. ビットパリティテスト — 検証基準

パリティは「十分近い」ではない — レーンごとに `Object.is` である（`packages/core/test/wasm/differential.test.ts:78` `assertBitIdentical`）。これは `+0`／`-0` を区別し `NaN===NaN` を扱う（`Object.is` セマンティクスを持つ `toBe` 経由）。スイートは JS と WASM の両方で**同じ** `buildStore` 入力で実行される：

- `packages/core/test/wasm/differential.test.ts:1` — transform（トポロジ `flat|chain|bushy|mixed`、数 1→10k、seed 付き `rng` at `differential.test.ts:18`、 `simd` と `scalar` の両方が一致することをアサート、`differential.test.ts:110` スカラーケース、拡大／縮小するシーンを跨いだ再利用）。
- `anim-kernel.test.ts`、`hit-kernel.test.ts`、`particle-kernel.test.ts` — seed 付き PRNG を持つ G2／G3／G4 同等物。
- 専用の拒否／ビュースイート：`abi-bounds.test.ts`、`aabb-stale-module.test.ts`、`compose-stale-module.test.ts`、`scene-wasm-upload-fallback.test.ts`、`scene-wasm-aabb-rejection.test.ts`、`scene-wasm-resident.test.ts`、`scene-store.test.ts`、`view-revalidation.test.ts`、`memory-growth.test.ts`、`shared-runtime.test.ts`、`hit-fused.test.ts`。

すべて `existsSync(wasmPath)` と `skipIf(!haveWasm)`（`differential.test.ts:14`）でゲートする — `.wasm` がなければスキップし、決して失敗しない。JS がフォールバックであるためだ。`just wasm-test`（`just wasm` の後に `vitest`）で実行する。`just wasm-check` は fmt+clippy のみである。ベンチマークハーネスは別である：専用 Hyprland ワークスペースで headed かつフォアグラウンドのウィンドウと実際の GPU を持つ `benchmarks/run-browsers.sh` のみが引用可能な数値を生成する（グローバル AGENTS.md と `hyprland-browser-bench` スキルを参照）。`benchmarks/debug-page.ts` はヘッドレスであり引用可能ではない。

静かにパリティを壊す数学的詳細：

- `js_min`／`js_max` は `NaN` を伝播し `-0 < +0` を扱う（`lib.rs:655`、`hit.rs:220` `js_min_f32`／`js_max_f32`、`particle.rs:120` 同様に `f32`）。Rust の `f64::min/max` と `f32::min/max` は `NaN` を無視する — 1 つの `f64::min` 置換が、オーバーフローした transform（`Infinity*0 = NaN`）で乖離する。
- AABB SIMD リダクションは `js_min/js_max` が全順序を実装するため結合的である — `lib.rs:790` ドキュメントは `f64x2_min/max` が同じ NaN／ゼロセマンティクスを持つことを証明しており、レーンをペア化した fold はスカラーの left fold とビット単位で一致する。
- イージングは `powi`／`powf` ではなく明示的な乗算を使う（`anim.rs:360` `ease`、`packages/animation/src/easing.ts` の JS 側ミラー）。
- パーティクル oracle はすべての中間結果を `Math.fround` で丸める（`particle-backend.ts:340`）そして `sqrt(dx*dx+dy*dy)` を使い `Math.hypot` ではない — `particle.rs:120` `js_min_f32/js_max_f32/js_clamp_f32` は同じ Math セマンティクスに一致する。

## 9. フォールバックとゲーティング — レジリエンスの継ぎ目

**ステータス返却。** すべての `*_init`／`*_step`／`compose_*`／`hit_build`／`force_step` は `STATUS_*` を返す（`lib.rs:485`、`anim.rs:158` `springs_ready`／`tweens_ready`、`hit.rs:110` `hits_ready`、`particle.rs:90` `particles_ready`、`force-rs/lib.rs:18` のミラー `STATUS_*`）。`CAPACITY` は「数が大きすぎる」、 `UNINITIALIZED` は「init が呼ばれていない」、 `BAD_RUN`／`OVERFLOW` はランテーブルと確保失敗をカバーする。呼び出し元はチェックしてフォールバックする — ストアは手つかずのまま、ビューは有効なままである（`backend.ts:230` `ensure` early-return、5 箇所で参照、`WasmBackendFacade.ts:470` `uploadRuns` 拒否パス）。

**Upload リトライ。** `WasmBackendFacade`（`WasmBackendFacade.ts:134` `WASM_UPLOAD_REJECT_LIMIT=3`、`WasmBackendFacade.ts:492` カウンタ）は連続する `uploadRuns` 拒否をカウントする。3 回でこの Scene の生存期間中 transform バックエンドを無効化する（`WasmBackendFacade.ts:500` が `_mode='js'` に切り替える — 2 つ目のフラグではない — そして `hasWarnedUploadFallback` at `WasmBackendFacade.ts:501` で一度だけ警告する）。拒否されたランテーブルは誤ったツリーを合成し、真に cap を超えたトポロジは毎フレーム再失敗して各リトライで `O(n)` の `buildTreeStore` コストがかかる — そのため累積ではなく連続でカウントする。`WasmBackendFacade.ts:252` `setTransform` と `WasmBackendFacade.ts:515` の成功パスで streak はリセットされる。

**メモリ拡張の無効化。** `viewsStale`（`backend.ts:38`）は `byteLength===0` または `buffer !== memory.buffer` をチェックする。バックエンドごとの `revalidateViews`（`backend.ts:373`、`anim-backend.ts:121`、`hit-backend.ts:111`、`particle-backend.ts:112`）と `WasmBackendFacade.ts:527` の `syncStore` gather 後のクロスバックエンド再取得が、共有リニアメモリ拡張（`hit_init` が同じメモリ内に独自のグリッド配列を確保する）を処理する。

**古いモジュール probe。** `backend.ts:201`／`runAabbs`／`runKernel` は呼び出し前に `typeof ex.compose_simd === "function"` をチェックする — 固定 URL でキャッシュされた `.wasm` が `compute_aabbs_simd` より前の可能性があり、レンダリング途中で `TypeError` を throw してしまう（`#662`／`#798`）。`rejected` パスは両方の拒否分岐で `_aabbsFresh=false` を設定する（`WasmBackendFacade.ts:481` + `:562` + `:607`）ため、fused AABB gather が前フレームの古い bounds を読むことはない。

**ゲートレポートと予算。** `backend.available`（`WasmTransformBackend.available`、`HitTestBackend` など）は「インストール済み」、`Scene.animBatchedLastFrame`／`Scene.hitTestBackend`／`Scene.transformBackend`／`Scene.accelerators.*.reason` は「実際に使用された」— `Scene.ts:1749` のドキュメントは混同しないよう警告している。`animGate` は 1 つではなく 3 つの閾値である（`Scene.ts:1856` `animThreshold` エイリアス）。ヒットグリッドのキャッシュキーは `hitGridFrame` + `hitGridStructureVersion`（`WasmBackendFacade.ts:394`）— 構造コンポーネントがなければ同フレーム内の変更が変更前ジオメトリに対してヒットしてしまう。

## 10. 新しい WASM カーネルを安全に追加する方法

1. **`crates/vectojs-core-rs/src/` または兄弟 crate から始める。** 独自の `static mut` ストア、SoA 配列、`checked_add` + `checked_mul` ガードと `free_*`／`free_partial_*` を持つ `*_init`（`lib.rs:370` `init` + `free_store` + `free_partial_store`、`anim.rs:158` `anim_init` + `free_anim` + `free_partial_anim`、`hit.rs:130` `hit_init` + `free_hit` を参照）、`*_ready()` 述語（`anim.rs:158` `springs_ready`）、`ptr_export!` アクセサ（`lib.rs:564`）を与える。`anim.rs:44` や `hit.rs:44` から形状をコピーすること — transform の `Store` とは何も共有しない。no-store sentinel を `Store::empty()`／`Anim::empty()`／`Hit::empty()` として初期化し、OOM 時にそれを公開して以降の呼び出しが解放済みメモリ読み取りではなく `STATUS_UNINITIALIZED` を得るようにする（`lib.rs:120` `empty` ドキュメント）。

2. **バッファが外部契約で `f32` でない限り `f64` を使うこと。** transform コアはパリティのため `f64` のみである。`particle.rs` と `simd_f32_bench.rs` だけが `f32` であり、それぞれ独自の oracle と明示的な乖離メモを持つ（`particle.rs:10`「別の差分 oracle」）。計測された理由と別の差分ファイルなしに 2 つ目の精度パスを追加しないこと。

3. **ステータスコードを返し、決して trap しないこと。** 成功時は `STATUS_OK=0`、拒否時は `STATUS_CAPACITY/UNINITIALIZED/BAD_RUN/OVERFLOW` — そして何も書き込まない。`packages/core/src/wasm/backend.ts:16` `WASM_STATUS`（および `force-rs/lib.rs:18` のミラー語彙ドキュメント「2 つのリストを同期させておくこと」）でミラーされる。三値返却（例：保留フラグ 0／1）では、失敗時に負のステータスを使って `0` が意味を持ち続けるようにする（`particle.rs:310` `particle_step` 負ステータスエンコーディング、`particle-backend.ts:110` `flag < 0` コンシューマ）。

4. **`just wasm`／`build.sh` 経由でビルドすること。** 決して素の `cargo build --target wasm32-unknown-unknown` ではない。2 つ目の crate を追加する場合は、独自の `rust-toolchain.toml:1`（`targets=["wasm32-unknown-unknown"]`、`components=["clippy","rustfmt"]`、`profile="minimal"`）と `build.sh:20`（`RUSTFLAGS="-C target-cpu=generic -C target-feature=+simd128 -C linker=rust-lld"`）を追加する — テンプレートとして `crates/vectojs-force-rs/build.sh:20` と `rust-toolchain.toml:10` を参照すること。`just wasm-check` と CI ツールチェーンプロビジョニングを配線する（`.carryctx/rules/wasm-crate-build.md:9`）。

5. **まず JS oracle を追加すること。** 消費側パッケージに JS リファレンスを書く（`soa.ts:246` `composeJS`、`soa.ts:316` `computeAabbsJS`、`SpringPhysics.ts:5` + `packages/animation/src/easing.ts`、`particle-backend.ts:340` `particleStepReferenceF32`）そしてそれを出荷されるフォールバックとして保持する。演算順序と `Math.min`／`Math.max` の NaN セマンティクス（`lib.rs:655` `js_min/js_max`）を一致させ、`Object.is` パリティが達成可能にする。`SpatialHashGrid.query` のような非バッチ oracle は独自の coarse-superset フォールバック契約を維持する（`SpatialHashGrid.ts:120`「グリッドの実際の内容に bounded される」）

6. **差分テストを追加すること。** `packages/core/test/wasm/`（force 用は `packages/graph3d/test/`）配下に `differential.test.ts:1` 形状に従った新規ファイル：同じ `buildStore`／SoA 入力、両方のパス、`toBe`／`Object.is` 経由の `assertBitIdentical`（`differential.test.ts:78`）、seed 付き PRNG（`differential.test.ts:18` `rng`）、`!haveWasm` のときスキップ（`differential.test.ts:14`）、`simd` と `scalar` の両カーネルをカバー（`differential.test.ts:110`）。bound-overflow／拒否テスト（`abi-bounds.test.ts` 形状）と view-revalidation テスト（`view-revalidation.test.ts` 形状、`memory-growth.test.ts` 形状）を追加する。

7. **TypeScript バックエンドファサードを追加すること。** `packages/core/src/wasm/` 配下に `anim-backend.ts:1`／`hit-backend.ts:1` 形状に従った新規ファイル：`ensure`／`revalidateViews`／`step` または `run*`、`STATUS_OK` チェック、`viewsStale` ヘルパー、失敗時に `null` を返す `instantiateSync/Async/Streaming`（`backend.ts:467` パターン）。インスタンスは `runtime.ts:1`（`CoreWasmRuntime` + `moduleCache`）経由で共有する — 2 つ目のモジュールをインスタンス化しないこと。ビューに書き込む前にすべての `ensure` の後で再検証すること（`backend.ts:373` パターン、`WasmBackendFacade.ts:527` クロスバックエンド再取得）。

8. **ゲートすること。** `Scene`／`WasmBackendFacade` に機能ごとのゲートを追加する（`Scene.ts:1904` `animGate` triple、`WasmBackendFacade.ts:134` `WASM_UPLOAD_REJECT_LIMIT`、`WasmBackendFacade.ts:394` グリッドキャッシュキー）。レポートを `WasmBackendFacade.ts:75` `AcceleratorReason`／`AcceleratorStatus`／`AcceleratorReport` に抽出して、devtools が 4 つのドメインに手を伸ばさずに読めるようにする。`benchmarks/<name>-wasm/entry.ts`（`benchmarks/core-wasm/entry.ts:1`、`benchmarks/anim-wasm/entry.ts:1` 2-costs モデル）で `run-browsers.sh` を使い専用 240Hz ワークスペースでベンチマークする — そのハーネスのみが引用可能な数値を生成する（グローバル AGENTS.md + `hyprland-browser-bench` スキル、`refreshHz` + `js vs resident` speedup を別々に報告）。ゲートのデフォルトは保守的に保つ：マイクロカーネル時間ではなく統合コスト（確保 churn、gather、`Math.min` セマンティクス）を計測すること。

9. **最後に `Scene` を配線すること。** `runtime.ts:48` `loadCoreWasmModule`／`createCoreWasmRuntime` と `WasmBackendFacade.ts:314` の共有ランタイム競合ガード（「await 中に並行する enableWasm_ が競合に勝った可能性がある」）を経由する async ローダ `enableWasm*`（`Scene.ts:1706` `enableWasmTransforms`／`Scene.ts:1783` `enableWasmHitTest`／`Scene.ts:1809` `setAnimBackend` パターン）を追加する。カーネルに供給する `Scene` walk はカーネル呼び出しから分離しなければならない — WASM を配線する前に walk + JS フォールバックをテストすること（`scene-store.ts:30` `buildTreeStore` が単独でテスト可能な継ぎ目である）。

## 11. WASM 変更を出荷する前のチェックリスト

- [ ] `just wasm`（触った場合は `crates/vectojs-force-rs/build.sh` も）でビルドできる、`just wasm-check`（fmt + clippy `-D warnings`）が通る。
- [ ] `just wasm-test`（WASM 差分）が通る — または `.wasm` が存在しないときは `skipIf(!haveWasm)` である。スクリプト／CI に素の `cargo build` はない。
- [ ] 新しいカーネルは `STATUS_*` 返却を持ち、拒否時に何も書き込まず、拒否注入テストを持つ。JS パスは永続的なフォールバックである。
- [ ] JS oracle は演算順序と `Math.min`／`Math.max` の NaN／`-0` セマンティクスに一致し、NaN／±0 コーナーと `+16`／`+8` 末尾レーンで `Object.is` パリティが保たれる。
- [ ] 新しい型付き配列ビューは `viewsStale`／`revalidateViews`（およびクロスバックエンド再取得）と、該当する場合は古いモジュール probe を経由する。
- [ ] ゲートのデフォルトは保守的で統合的に計測されている（headed Chrome+Firefox で `benchmarks/run-browsers.sh`、 `refreshHz`、`js vs resident` speedup、AABB speedup を別々に報告）。
- [ ] アクセラレータレポートが更新されている（`WasmBackendFacade.ts:75` `AcceleratorReason` と `Scene.accelerators` getter）。新しい dirty／レポートフィールドを追加した場合は `Scene.dart`／`_dirty` スタイルのドキュメントも更新する。
- [ ] 新しい `.wasm` を公開する場合は `tsup` アセットコピーを配線する（`tsup.config.ts:40` パターン）。

## 12. G1/G2/G3 語彙 — ラベルが意味するもの

ラベルは優先度ではなく発明された時系列順である：

- **G1** — ワールド行列 + AABB コア（`crates/vectojs-core-rs/src/lib.rs:1`、`soa.ts:22`）。最初のカーネルであり、すべての Entity に対して毎フレーム実行される唯一のもの。他はすべてワークロードサイズでゲートされるが、G1 は「`.wasm` がインストールされ `uploadRuns` が成功したか」だけでゲートされる。
- **G2** — バッチ化されたアニメーションスパイク（`crates/vectojs-core-rs/src/anim.rs:1`）。次に切り出された SoA だったため 2 番目に名付けられた。今はビット同一だが、当初は計測スパイクとして始まった — `anim.rs:1` ヘッダーは「計測スパイクであり統合されたバックエンドではない」と述べ、ベンチマーク `benchmarks/anim-wasm` vs `benchmarks/anim-wasm-scene` が統合するかどうかを決める。「G2 が統合された」と読まないこと。
- **G3** — ヒットテストグリッドスパイク（`crates/vectojs-core-rs/src/hit.rs:1`）。同じステータス：独自ストアを持つ計測モジュールであり、ビューポートグリッドサイズと `hit_overflow` でゲートされる。`hit.rs:1` ヘッダーは「anim と同様の計測モジュール」と述べる。
- **G4** — パーティクル sim（`crates/vectojs-core-rs/src/particle.rs:1`）。しばしば G4 と呼ばれるが G1／G2／G3 トリオには含まれない。`f32` で独自の oracle を持つため別に保たれている。`crates/vectojs-force-rs`（octree）は G4 ではない — graph3d 用の別 crate である（異なる `Cargo.toml:1`、異なる `build.sh:1` 出力パス）。

文章を追加する場合は、「transform／anim-batch／hit-grid」の shorthand として「G1／G2／G3」を保ち、G4 と force-rs は指すときに明示的に名前を挙げること。

## 13. Forge ベースラインと再計測のタイミング

インラインのベンチマーク表はどれもベースラインではない。引用可能な数値は `benchmarks/core-wasm/results/latest/`（`core-wasm-chrome.json:1`、`core-wasm-firefox.json:1` — schemaVersion 1、`refreshHz`、`panelHz`、`host.{cpu,gpu,driver}`、`rows[].{identical,jsNsPerEntity,copyNsPerEntity,residentNsPerEntity,copySpeedup,residentSpeedup,jsAabbNsPerEntity,wasmAabbNsPerEntity,aabbSpeedup}`）とその `history/` スナップショットに存在する。ハーネス契約（`benchmarks/_shared/client.ts:1` `awaitStart`／`reportResult`、`benchmarks/core-wasm/entry.ts:1` 2-costs モデル）は、フォーカスされたウィンドウと実際の GPU を持つ専用 Hyprland ワークスペース上の実際の headed ブラウザを要求する（`benchmarks/run-browsers.sh:1` — 唯一引用可能なパス）。

再計測すべきタイミング：

- `lib.rs:84` `SIMD_ALIGN`、`soa.ts:64` `PAD`、`lib.rs:640` `f64x2_splat` パターン、または `build.sh:28` `RUSTFLAGS` を変更したとき — いずれも `residentSpeedup` を >10% 動かす。
- `anim.rs:12` spring 定数または `anim.rs:360` `ease` に触れたとき — `benchmarks/anim-wasm` マイクロ + `benchmarks/anim-wasm-scene` 統合（Chrome：springs は 100 drivers で `2.06×`、100k で `3.7×`、tweens は 100 で `4.14×`、1k で `4.48×` — `anim-wasm-chrome.json:1` 2026-08-14）を再実行し、統合コストが正当化する場合のみ `Scene.animGate` をリセットする。
- `hit.rs:280` `hit_build` または `hit-store.ts:47` gather に触れたとき — `benchmarks/hit-wasm`／`benchmarks/scene-hit-wasm` を再実行する。
- `particle.rs:310` または `force-rs/lib.rs:1` に触れたとき — `benchmarks/particle-wasm`／`benchmarks/graph3d-frame` を再実行する。

常に `refreshHz` を添えて Chrome **と** Firefox の両方を報告すること。Firefox は `layout.frame_rate` を設定しないと undetectably low な約 60 Hz を報告する（グローバル AGENTS.md 計測ルール + `hyprland-browser-bench` スキル）。

## 14. この領域で痛い目を見た落とし穴

| pitfall                                                                              | file:line                                                      | status                                             |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------- |
| `~/.cargo/config.toml` `cfg(all)` がホストフラグを wasm リンクに結合                 | `.carryctx/rules/wasm-crate-build.md:1`、`build.sh:8`          | `RUSTFLAGS` 上書きで修正                           |
| `Vec<f64>` が 8 バイトアラインのみ → SpiderMonkey の `v128_load` が 7 倍遅い         | `lib.rs:84` `SIMD_ALIGN`                                       | 16 で `alloc_zeroed` して修正                      |
| 別バックエンドの `WebAssembly.Memory.grow` 後の古い `TypedArray` ビュー              | `backend.ts:38` `viewsStale`、`WasmBackendFacade.ts:527`       | `revalidateViews` + クロスバックエンド再取得で修正 |
| `compute_aabbs_simd` より前の古いキャッシュ `.wasm` → レンダリング途中で `TypeError` | `backend.ts:201` probe                                         | スカラーフォールバックで修正（`#798`）             |
| 拒否された `uploadRuns` が誤ったツリー／古い AABB を合成                             | `WasmBackendFacade.ts:470` + `:481` `:562` `_aabbsFresh=false` | リトライ上限で修正（`DEC-0014`）                   |
| `Math.pow`／`powi` と明示的な乗算の差 → 約 1e-12 のイージングギャップ                | `anim.rs:360` `ease`                                           | 明示的な `t*t` で修正                              |
| `f64::min` が NaN を無視 → オーバーフローした transform で AABB が乖離               | `lib.rs:655` `js_min`                                          | Math 伝播する `js_min/js_max` で修正               |
| 深い／bushy なツリーで `f32` 約 93px 誤差 — dead カーネルとして出荷                  | `simd_f32_bench.rs:1`、`Cargo.toml:20` `bench-f32`             | feature ゲートで修正                               |
| `target-cpu` が `fma` を有効化 → 単一丸め vs JS 二重丸め                             | `build.sh:28` `generic`                                        | `generic` で修正                                   |
| `new URL('@vectojs/core/…', import.meta.url)` が解決しない                           | `asset.ts:10`                                                  | 相対 `./vectojs_core.wasm` で修正                  |

## 関連

- **ボス 06（VMT ランタイム）**は、このボスが高速化する `Entity` ツリー、`Scene` walk、`structureVersion` → `storeStructureVersion`、および `WASM_UPLOAD_REJECT_LIMIT` 配線を所有する。
- **ボス 07（レンダラー）**は、このボスが生成するワールド行列と AABB を消費する — ここでの古いビューは、次のボスの古いラスタキャッシュの別形態である。
- **ボス 11（graph layout）**は 3D force 用に同じビルド規律（`crates/vectojs-force-rs`）を再利用する。`@vectojs/graph-layout` 2D quadtree（`BarnesHutQuadtree.ts:5`）は JS のままである。
- **ボス 02（text／layout）**と**ボス 03（投影）**は WASM バックされていない — ボトルネックが整形や DOM キャリアのときに WASM に手を伸ばさないこと。

## 参考文献

- `crates/vectojs-core-rs/Cargo.toml:1` — transform crate マニフェスト（crate-type、bench-f32、release プロファイル）
- `crates/vectojs-core-rs/src/lib.rs:1` — G1 スカラー／SIMD compose + SIMD AABB、Store、ステータスコード、`js_min/js_max`
- `crates/vectojs-core-rs/src/anim.rs:1` — G2 spring／tween バッチ、明示的乗算イージング、別ストア
- `crates/vectojs-core-rs/src/hit.rs:1` — G3 密なビューポートグリッド、counting-sort ビルド、オーバーフロー
- `crates/vectojs-core-rs/src/particle.rs:1` — G4 f32 パーティクル SoA、融合された pending フラグ、負ステータス拒否
- `crates/vectojs-core-rs/src/simd_f32_bench.rs:1` — bench 専用 f32x4、デフォルトとして却下（約 93px 誤差）
- `crates/vectojs-force-rs/src/lib.rs:1` — graph3d Barnes-Hut octree（f64 蓄積、f32 位置、ジッター `imul`）
- `crates/vectojs-core-rs/build.sh:1` ／ `crates/vectojs-force-rs/build.sh:1` — 正しい `RUSTFLAGS`（`generic`、`+simd128`、`rust-lld`）
- `.carryctx/rules/wasm-crate-build.md:1` — ビルドルール（just wasm、RUSTFLAGS 上書き、gitignore されたバイナリ）
- `packages/core/src/wasm/soa.ts:1` — JS SoA、`buildStore`、`composeJS`／`computeAabbsJS` oracle
- `packages/core/src/wasm/backend.ts:1` — transform バックエンド（resident vs copy、`WASM_STATUS`、`viewsStale`、古いモジュール probe）
- `packages/core/src/wasm/runtime.ts:1` — 共有 `CoreWasmRuntime` + グローバルモジュールキャッシュ + 遅延メモ化バックエンド
- `packages/core/src/wasm/{anim,hit,particle}-backend.ts:1` ／ `asset.ts:1` — G2／G3／G4 ファサード + `coreWasmUrl`
- `packages/core/src/wasm/{scene-store,hit-store,hit-store-fused}.ts:1` — ツリー → SoA ／ AABB gather ／ fused gather
- `packages/core/src/tree/scene/WasmBackendFacade.ts:1` — 4 つのバックエンド、`AcceleratorReason/Report`、`syncStore`／`ensureAabbs`、upload リトライ、共有ランタイム
- `packages/math/src/SpringPhysics.ts:1` ／ `packages/math/src/SpatialHashGrid.ts:1` — JS 物理／グリッド（JS のみ、WASM ではない — `MAX_CELLS_PER_AABB=64`）
- `packages/core/test/wasm/differential.test.ts:1` + `anim-kernel.test.ts`／`hit-kernel.test.ts`／`particle-kernel.test.ts` — ビット同一（`Object.is`）スイート、`skipIf(!haveWasm)`
- `benchmarks/core-wasm/entry.ts:1` ／ `benchmarks/anim-wasm/entry.ts:1` ／ `benchmarks/core-wasm/results/latest/:1` — headed `run-browsers.sh` 計測（Chrome+Firefox、`refreshHz`、`residentSpeedup`）
