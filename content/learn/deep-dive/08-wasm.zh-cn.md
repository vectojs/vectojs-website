---
title: '08 — WASM 加速器 — G1/G2/G3 与比特一致性'
description: '@vectojs/core 背后不可见的 WASM 后端：G1 世界矩阵、G2 动画批处理、G3 命中网格（及 G4 粒子）、使 SIMD 成为可能的 SoA 存储，以及让 WASM 保持可选的比特一致性契约。'
order: 28
---

# 08 — WASM 加速器 — G1/G2/G3 与比特一致性

> **Boss 08** 按设计不可见。Rust 内核（`crates/vectojs-core-rs`、`crates/vectojs-force-rs`）加速 JS 引擎已正确完成的工作——世界矩阵合成、动画 tick、命中粗筛、粒子积分——且永不成为必需。每个加速路径都有产生_相同比特_的 JS 回退，所有构建、门控与测试皆为守住该承诺而存在。

- **你将学到**：为何 WASM 是不可见后端；使 `f64x2` 成为可能的 SoA 存储；G1/G2/G3（+G4）各自加速什么、如何被门控、以及 headed 基准实际测得了什么；如何测试比特一致性；以及如何在不破坏回退契约的前提下新增内核。
- **你不会学到**：VMT 脏标记/生命周期（boss 06）、渲染器/DPR 一致性（boss 07）、图布局调优（boss 11），或 Three/XR 双世界映射（boss 09）。本文档是位于 VMT 与渲染器之间的加速层。

## 1. 为何 WASM 是不可见后端

VectoJS 在零 Rust 下亦可正确运行。`packages/core/src/wasm/soa.ts:1`（`composeJS`、`computeAabbsJS`）与 `packages/math/src/SpringPhysics.ts:1` / `packages/animation/src/easing.ts` 是_永久_参照与回退；crate 清单明确写道——`crates/vectojs-core-rs/Cargo.toml:6` _“invisible backend; the TypeScript path is the permanent fallback”_，`crates/vectojs-force-rs/Cargo.toml:6` 对力导向内核亦然。编译后的 `.wasm` 本身被 gitignore（`packages/core/src/wasm/vectojs_core.wasm`、`packages/graph3d/src/wasm/vectojs_force.wasm`）——在 CI 中构建、发布到 npm、永不提交（`.carryctx/rules/wasm-crate-build.md:6`）。

该单一决策导出三条约束：

1. **实例化可能失败且必须静默。** CSP `wasm-unsafe-eval`、缺失资源、不支持 `simd128`、陈旧缓存模块——每个加载器都返回 `null`，调用方保留 JS 路径。`packages/core/src/wasm/backend.ts:467` `instantiateSync`/`instantiateAsync`/`instantiateStreaming`、`packages/core/src/wasm/runtime.ts:48` `loadCoreWasmModule`/`createCoreWasmRuntime`、`packages/graph3d/src/wasm/force-backend.ts:55` 的力导向等价物，以及 `packages/core/src/wasm/asset.ts:22` `coreWasmUrl` / `packages/graph3d/src/wasm/asset.ts:22` `forceWasmUrl` 用于打包器解析。失败是默认状态，而非错误路径。

   URL 辅助函数很关键：`new URL('@vectojs/core/…', import.meta.url)` 不起作用——`new URL` 仅解析_相对_引用，而裸说明符并非相对（`asset.ts:10`）。从包_内部_使用 `new URL('./vectojs_core.wasm', import.meta.url)` 是原生 ESM 与打包器都能正确解析的唯一形式。调用方执行 `await scene.enableWasmTransforms(coreWasmUrl)`（`asset.ts:8` 示例），当获取/编译失败时该方法返回 `false`（`Scene.ts:1704` `enableWasmTransforms` 文档：_“resolves true if WASM is now active, false if the JS path remains”_）。

2. **内核必须可失败，而非 trap。** 导出返回 `STATUS_OK`（0）或非零 `STATUS_CAPACITY/UNINITIALIZED/BAD_RUN/OVERFLOW`（`crates/vectojs-core-rs/src/lib.rs:485` 常量，`packages/core/src/wasm/backend.ts:16` `WASM_STATUS`）且在拒绝时_不写入任何内容_。JS 侧将任何非零视为“本帧走参考路径”（`packages/core/src/wasm/backend.ts:212` `compose` 提前返回、`packages/core/src/wasm/anim-backend.ts:173` `stepSprings` 布尔值、`packages/core/src/tree/scene/WasmBackendFacade.ts:487` 上传重试、`packages/core/src/wasm/particle-backend.ts:110` 三态负状态）。

3. **共享线性内存、共享模块。** 在 `packages/core/src/wasm/runtime.ts:1`（`CoreWasmRuntime`）之前，四个后端意味着同一二进制的四次编译与四块线性内存。现在每个 URL 全局缓存一个 `WebAssembly.Module`（`runtime.ts:38` `moduleCache`，仅以字符串/URL 为键——不缓存字节，`runtime.ts:48` `cacheKey` 文档），每个 `Scene` 一个 `Instance` 通过永不别名的不同 `static mut` 静态量暴露全部四种存储（`crates/vectojs-core-rs/src/lib.rs:44` `Store`、`src/anim.rs:44` `Anim`、`src/hit.rs:44` `Hit`、`src/particle.rs:44` `Particles`、`crates/vectojs-force-rs/src/lib.rs:44` `Octree`+`POS`/`ACCEL`）。`CoreWasmRuntime` 惰性构造每个后端并记忆化（`runtime.ts:90` `transform()`/`anim()`/`hit()`/`particle()`），因此仅启用变换的 Scene 永不为 anim/hit 分配付出代价。

报告将“已安装”与“本帧实际活跃”分开。`Scene.accelerators: AcceleratorReport`（`WasmBackendFacade.ts:122` 报告形态，`Scene.ts:1749` 文档 _“Definite-assignment because it needs _wasmBackend”_）为每个加速器返回 `{ available, activeThisFrame, reason, path }` —— `available` 为“后端已安装且门控允许”，`activeThisFrame` 为“实际运行”，`reason` 为 `not-installed | below-gate | rejected | active`（`WasmBackendFacade.ts:75` `AcceleratorReason`）。`Scene.animGate` 与 `Scene.animBackend` 是经典混淆：门控低于驱动数会使 `animBackend==='wasm'` 而 `animBatchedLastFrame===false`（见 `Scene.ts:1749` 与 `Scene.ts:1904` 门控文档）。

## 2. 构建纪律 — `just wasm`，而非裸 cargo

陷阱是 `~/.cargo/config.toml`（`.carryctx/rules/wasm-crate-build.md:1`）：`[target.'cfg(all())']` 节同样匹配 `wasm32`，且 Cargo 会将其 `rustflags` 与目标特定项_合并_。如 `-C target-cpu=native` 或 `-fuse-ld=mold` 的宿主机标志会泄漏到 `wasm32-unknown-unknown` 链接并破坏它（`rust-lld: error: unknown argument: -fuse-ld=mold`）。环境变量 `RUSTFLAGS` _替换_配置标志；目标特定配置不会。

唯一正确的构建：

```bash
just wasm  # runs crates/vectojs-core-rs/build.sh with correct RUSTFLAGS
# or for the force kernel:
# crates/vectojs-force-rs/build.sh  (same RUSTFLAGS)

# what build.sh does (crates/vectojs-core-rs/build.sh:28):
RUSTFLAGS="-C target-cpu=generic -C target-feature=+simd128 -C linker=rust-lld" \
  cargo build --release --target wasm32-unknown-unknown --manifest-path crates/vectojs-core-rs/Cargo.toml
```

规则细节（`crates/vectojs-core-rs/build.sh:1`、`crates/vectojs-force-rs/build.sh:1`、`.carryctx/rules/wasm-crate-build.md:1`）：

| 规则                                                           | 文件:行                                                          | 原因                                                                                                                                                                                        |
| -------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target-cpu=generic`                                           | `build.sh:28`                                                    | 将 `fma`（融合乘加）排除在外。`generic` 没有 `fma`；经宿主机调优的 CPU 会将 `a*b + c*d` 融合为一次舍入，而 JS 做两次——破坏比特一致性。`crates/vectojs-force-rs/build.sh:8` 明确指出这一点。 |
| `target-feature=+simd128`                                      | `build.sh:28`                                                    | 启用 `v128`/`f64x2`/`f32x4`。缺少它，`#[target_feature(enable="simd128")]` 内核（`lib.rs:612`、particle 注释）将无法编译或 trap。                                                           |
| `linker=rust-lld`                                              | `build.sh:28`                                                    | 覆盖 `~/.cargo/config` 中如 `mold` 的链接器。                                                                                                                                               |
| `panic="abort"` + `strip` + `lto` + `codegen-units=1`          | `Cargo.toml:22`                                                  | 最小、确定性的二进制。                                                                                                                                                                      |
| `edition="2024"` + `rust-toolchain.toml:10` `channel="stable"` | `rust-toolchain.toml:1`、`.carryctx/rules/wasm-crate-build.md:3` | 精确通道钉住为 _stable_，而非版本——精确版本钉住会破坏离线/镜像环境；CI 再钉住精确版本。                                                                                                     |
| `just wasm-check`                                              | `.carryctx/rules/wasm-crate-build.md:5`                          | `cargo fmt --check` + `cargo clippy --target wasm32-unknown-unknown -- -D warnings`，使用相同 `RUSTFLAGS`。                                                                                 |
| `just wasm-test`                                               | `.carryctx/rules/wasm-crate-build.md:5`                          | `just wasm` 然后核心 differential 套件（`vitest`）。                                                                                                                                        |
| 二进制 gitignore                                               | `build.sh:14`、`.carryctx/rules/wasm-crate-build.md:6`           | 仅 TS 的贡献者永不需要 Rust。经 `tsup.config.ts:40` 复制步骤发布（`packages/graph3d/tsup.config.ts:40` `vectojs_force.wasm → dist/wasm/`）。                                                |
| `Cargo.toml` `publish=false`                                   | `Cargo.toml:5`（两个 crate）                                     | crate 并非 crates.io 包——仅 `.wasm` 经 npm 有意义。                                                                                                                                         |

`f32x4` 评估内核（`crates/vectojs-core-rs/src/simd_f32_bench.rs:1`）位于 `bench-f32` 之后（`Cargo.toml:20` `bench-f32 = []`）且永不发布——已度量并拒绝。`build.sh:18` 记录了可选形式 `./build.sh --features bench-f32` 及其默认排除原因：f32 已被度量并拒绝。

## 3. SoA 存储 — 使 SIMD 可达的形态

`packages/core/src/wasm/soa.ts:22` 是系统的一半；`crates/vectojs-core-rs/src/lib.rs:1` 是另一半。`lib.rs:10` 处的文档注释是承载性的：

> One flat `f64` array per field. With an interleaved record, consecutive entities' `x` would be `N*8` apart — a `v128` load cannot fetch two of them.

### 3.1 SoA，而非 AoS

`Store`（`lib.rs:44`）持有 22 个 `*mut f64` 输入/输出/边界/AABB 数组，外加 3 个 `*mut i32` 运行表。JS 侧：`TransformStore`（`soa.ts:44`）带匹配的 `Float64Array`/`Int32Array` 视图，经导出指针覆于 `WebAssembly.Memory.buffer` 之上（`lib.rs:564` `ptr_export!`、`backend.ts:178` `p_x()…p_run_len()`）。

### 3.2 兄弟运行，按深度有序

WASM SIMD 没有 gather。跨任意父节点向量化需要逐实体加载父矩阵。取而代之，`soa.ts:178` `buildStore` 保证_同一父节点的子节点连续_（按父节点的 BFS：出队一个父节点，将其所有子节点作为一次运行发射，再入队它们）。父世界矩阵每运行广播一次（`lib.rs:640` `f64x2_splat(*S.wa.add(p))`），子节点填满两通道。`store.runStart/runLen/runParent` 为迭代表；`set_run_count`（`lib.rs:600`）发布其长度。

JS 构建器校验：恰好一个 `parent===-1` 根（缺失/重复时抛出，`soa.ts:104`），每个父索引在范围内（`soa.ts:112`），根在存储索引 0 以单位矩阵为种子（`lib.rs:603` `seed_root`、`soa.ts:246` `composeJS` 以 `wa[0]=1,wd[0]=1` 为种子）。重建之间，每帧同步仅将当前 `x/y/scale/rotation/opacity` 收集到常驻输入视图并重跑内核（`WasmBackendFacade.ts:458` `syncStore`）。

### 3.3 填充、对齐与预计算三角

**填充，而非余数循环。** `init`（`lib.rs:370`）分配 `capacity + 8`（`simd_f32_bench.rs:128` 对 `f32x4` 使用 `+16`）。奇长尾部会读取逻辑末尾之后一个槽——填充通道会被写入但永不读回（`lib.rs:643` `compose_simd` 注释、`backend.ts:152` 上传注释）。JS 存储镜像该填充（`soa.ts:64` `capacity = count + 8`）。

**预计算 `cos`/`sin`。** WASM 没有超越函数；逐帧重算曾是第 1 轮最大开销（`lib.rs:66`）。JS 在每次构建时写入一次 `cos=Math.cos(rotation)`（`soa.ts:218` `writeInput`），每帧常驻收集读取缓存的 `_getTrig()`（`WasmBackendFacade.ts:544` + `Entity.ts:1746` 三角缓存）。

**16 字节对齐。** `SIMD_ALIGN=16`（`lib.rs:84`）。`leak_f64` 使用 16 字节对齐的 `alloc_zeroed` —— `Vec<f64>` 仅 8 字节对齐，会使 SpiderMonkey 上 `v128_load` 慢约 7 倍（已度量，见 `lib.rs:84` 注释）。该辅助在 OOM 时返回 null 而非 trap，因此 `init` 可报告 `STATUS_OVERFLOW` 并保持先前存储完好（`lib.rs:340` `free_store` + 溢出路径）。

### 3.4 共享内存视图风险

全部四个 core-rs 后端（及每个 `Scene`）共享同一 `WebAssembly.Memory`。任何 `*_init` 都可能增长内存并使其他后端的 `TypedArray` 视图脱离（读为 `byteLength===0`）。因此 `backend.ts:373` `revalidateViews` / `viewsStale`（`backend.ts:38` 辅助）与 `anim-backend.ts:121` / `hit-backend.ts:111` / `particle-backend.ts:112` 同理，外加 `WasmBackendFacade.ts:527` 在 `syncStore` 收集后跨后端重获取。变换后端还会探测 `typeof ex.compose_simd === "function"`（`backend.ts:201`），因此早于 `compute_aabbs_simd` 的陈旧缓存 `.wasm` 会退化为标量而非抛出（`#798`、`aabb-stale-module.test.ts`）。

## 4. G1 — 世界矩阵合成（+ AABB）

**加速什么：** `Canvas T * S * R` 合成（`lib.rs:520` `compose_scalar` / `lib.rs:612` `compose_simd`、`soa.ts:246` `composeJS`）及随后的世界空间 AABB 通道（`lib.rs:670` `compute_aabbs` / `lib.rs:790` `compute_aabbs_simd`、`soa.ts:316` `computeAabbsJS`）。每个实体的世界矩阵（`a,b,c,d,e,f,opacity`）为 `parentMatrix * T(x,y) * S(sx,sy) * R(cos,sin)`，然后其局部边界 `[bx,by,bw,bh]` 经其推送到世界 AABB（`aminx…amaxy`）。

**如何到达 `Scene`：** `buildTreeStore`（`packages/core/src/wasm/scene-store.ts:30`）将 `Entity.children` 走访为 `InputNode[]` 并 `buildStore`；`WasmBackendFacade`（`packages/core/src/tree/scene/WasmBackendFacade.ts:168` 变换区、`WasmBackendFacade.ts:458` `syncStore`）经 `Scene.enableWasmTransforms`（`Scene.ts:1706`）热切换。存在两种集成开销（见 `benchmarks/core-wasm/entry.ts:1`）：`copy`（上传+内核+回读——重上传每个 `Float64Array` 再读回 `wa…wo`）vs `resident`（仅内核，输入/输出已在 WASM 视图中）。Resident——访问器直接写入 `inputView()`/`boundsView()`，渲染器读取 `worldView()`/`aabbView()`（`backend.ts:320`/`backend.ts:420`、`WasmBackendFacade.ts:518` 世界视图返回）——是设计路径，也是基准报告为 `resident` 的值。

**已测得收益**（`benchmarks/core-wasm/results/latest/core-wasm-chrome.json:1`，2026-08-14，i7-14650HX，Chrome 151，`benchmarks/run-browsers.sh` ——唯一可引用的 harness，见全局 AGENTS.md）：

| 拓扑  | n    | js ns/elem | copy ns/elem | resident ns/elem | resident 加速 | AABB 加速 |
| ----- | ---- | ---------- | ------------ | ---------------- | ------------- | --------- |
| flat  | 1k   | 4.8        | 4.83         | 2.73             | 1.76×         | ~1.0×     |
| flat  | 10k  | 4.26       | 5.37         | 2.77             | 1.54×         | 1.95×     |
| flat  | 100k | 4.55       | 8.64         | 3.57             | 1.27×         | 2.09×     |
| chain | 1k   | 14.73      | 10.23        | 8.13             | 1.81×         | 1.14×     |
| chain | 10k  | 15.25      | 10.1         | 7.15             | 2.13×         | 1.10×     |
| chain | 100k | 16.25      | 13.63        | 7.35             | 2.21×         | 1.08×     |
| bushy | 10k  | 10.46      | 8.25         | 4.72             | 2.21×         | 1.99×     |
| bushy | 100k | 12.24      | 11.41        | 5.69             | 2.15×         | 2.22×     |

同一宿主机上 Firefox 更接近：如 flat 1k `resident 1.15×`，chain 1k `2.63×`（`core-wasm-firefox.json:1`）。引擎差距真实存在—— `run-browsers.sh` 契约要求同时报告两者。

copy 路径在中小扇出下可能_慢于_ JS（flat 1k `0.995×`、flat 10k `0.79×`，`entry.ts:80` `copy` 度量），因为两次 `Float64Array.set` 加两次读取占主导；`entry.ts:1` 处文档警告，对 Phase 1 而言 resident 数值才是公平比较。AABB 通道在规模化时单独达到约 2.2×，因为它无需运行遍历即可按通道配对，且其 min/max 归约在全序 `js_min/js_max` 下可结合（`lib.rs:790` 对 `f64x2_min/max` NaN/±0 语义的证明）。

**为何拒绝 `f32x4`：** `Cargo.toml:14` + `lib.rs:20` / `simd_f32_bench.rs:1` —— f32 仅约 7 位有效数字（`lib.rs:6` 注释：_“~93px error on a deep/bushy tree in #143”_）且与 JS 参考不可逐位比较。4 通道内核（`simd_f32_bench.rs:128` `+16` 填充、`simd_f32_bench.rs:300` 处 `f32x4_splat/mul/add`）仅用于基准，受 `bench-f32`（`Cargo.toml:20`）门控因此永不发布，并拥有独立非融合存储 `SF`（`simd_f32_bench.rs:44`）。

## 5. G2 — 批量动画驱动（spring + tween）

**加速什么：**在一次 `spring_step`/`tween_step` 调用（`crates/vectojs-core-rs/src/anim.rs:1`）中推进_所有_当前活跃的 `SpringDriver`/`TweenDriver` 实例，而非 JS 逐驱动 `driver.tick()` 循环（`packages/core/src/tree/scene/DriverTicker.ts:131` `tick`）。

**比特一致性——现已精确。** `anim.rs:8` 指出这曾是度量尖峰，现已逐位匹配。两侧皆将整数幂写作显式乘法（`t*t`、`t*t*t`、`-2*t+2` 见 `anim.rs:360` `ease` 与 `packages/animation/src/easing.ts`），而非 `Math.pow`/`powi` ——两者皆非正确舍入，旧配对在约 1e-12 处发散。弹簧常量（`anim.rs:12` `MAX_FRAME_DT=0.25`、`MAX_STEP_DT=1/120`、`VAL_EPSILON/VEL_EPSILON=0.005`）镜像 `packages/math/src/SpringPhysics.ts:5`（`MAX_FRAME_DT=0.25`、`MAX_STEP_DT=1/120`、`SpringPhysics.ts:59` epsilons）。tween 终点吸附（`anim.rs:410` _“must be exactly `to` once `active>=dur`”_）匹配 `packages/animation/src/drivers.ts` `TweenDriver.tick`，因此不满足 `f(1)===1` 的自定义缓动仍会落地。

**门控——数量重要。** 与每帧对 10 万节点运行的 G1 不同，活跃驱动数通常很小，因此仅在阈值之上批处理才划算。`Scene.animGate`（`Scene.ts:1904`）：

```ts
public animGate: { spring: number; tween: number; mixed: number } = {
  spring: 128, tween: 256, mixed: 128,
};
```

`DriverTicker.tick`（`DriverTicker.ts:50` `AnimGate`、`DriverTicker.ts:197` 门控开启记账、`DriverTicker.ts:64` _“O(tree size) — the exact mistake G3's first benchmark made”_）将活跃可批处理驱动收集到稠密 `Float64Array` 包（`anim-backend.ts:68` `ensure` + `springView`/`tweenView`）并各运行一次内核；带自定义 `EasingFn` 的 tween 其 `wasmEasingId === null` 并留在 JS（`DriverTicker.ts:228`）。低于门控时保留 JS 循环—— `anim-wasm-scene` 集成基准发现分配抖动主导了开销，而非内核（`DriverTicker.ts:68` 注释引用 `benchmarks/anim-wasm`/`anim-wasm-scene`）。

`Scene.animBatchedLastFrame`（`Scene.ts:2030` + `Scene.ts:1749` 文档 _“Definite-assignment because it holds _wasmBackend”_）仅报告门控是否_开启_；与 `animBackend`（“已安装”）不同。`Scene.animThreshold`（`Scene.ts:1856`）是向后兼容别名，读取 `animGate.tween` 并一次性写入三门控——请优先使用 `animGate`（单一阈值不可能对两种类型都正确）。

**SoA + 独立存储。** `anim.rs:44` `Anim` 是独立 `static mut`（`s_val/s_target/s_vel/s_stiff/s_damp/s_mass`、`t_from/t_to/t_elapsed/t_dur/t_delay/t_ease/t_val`、`anim.rs:54` 处 `spring_capacity/tween_capacity`），拥有独立 `anim_init`（`anim.rs:158`）与 `STATUS_*` 返回——与变换 `Store` 无交叉。JS 外观为稠密打包：每合格帧从零开始重收集所有活跃驱动（`anim-backend.ts:20` _“no cross-frame residency”_）、运行内核、散射结果——因此驱动加入/离开或门控翻转无需失效。

## 6. G3 — 命中测试粗筛（稠密视口网格）

**加速什么：** `Scene.findEntityAt`（`HitTester.ts:12`）对每次指针事件做 `O(N)` 深度优先 `isPointInside` 遍历（`HitTester.ts:227` `findHitRecursively`）。命中内核（`crates/vectojs-core-rs/src/hit.rs:1`）以均匀网格替代粗筛：将每个可交互实体的世界 AABB 分桶到以 `cellSize=64` 覆盖 `[0,vw]×[0,vh]` 的单元，然后点查询仅扫描一个单元并返回_最上层_ AABB 候选（最大索引——前序，`packages/core/src/wasm/hit-store.ts:16` 不变量——更大索引后绘制）。调用方以精确 `isPointInside` 确认，因此非矩形命中保持正确，网格命中是结论性的（`HitTester.ts:119` _“The WASM path is conclusive”_ ——可信网格后不再回退 JS）。

**范围：**稠密扁平 `i32` 数组，而非哈希——指针始终在视口内（`hit.rs:15`）。三数组：每单元 `cell_start/cell_count`、`(entity, cell)` 成员的 `items`，以计数排序构建（`hit.rs:280` `hit_build`：每单元计数 → 前缀和到 `cell_start` → 散射）。`hit_overflow()`（`hit.rs:220`）指示条目容量耗尽；JS 侧将溢出视为“网格不可信，回退”（`packages/core/src/wasm/hit-backend.ts:122` `runBuild` 在溢出时返回 `false`）。`hit_query`（`hit.rs:380`）仅扫描指针所在单元，并在 `hit_init` 从未运行时返回 `-STATUS_UNINITIALIZED` ——可与真正未命中（`-1`）区分。

**JS 侧接线：** `gatherHitAABBs`（`hit-store.ts:47`）按前序走访 `Entity.children` ——与 `findHitRecursively` 顺序相同——收集世界 AABB 与无 `getBounds()` 实体的 `boundless` 列表（经 `boundless` 路由且永不从 AABB 槽读取，`hit-store.ts:60`）。融合收集（`hit-store-fused.ts`）复用 G1 世界矩阵路径（`WasmBackendFacade.ts:583` `ensureAabbs` + `hitGridFrame`/`hitGridStructureVersion` 缓存键位于 `WasmBackendFacade.ts:394`）而非每实体重算四角。`HitTester.ts:60` / `WasmBackendFacade.ts:150` 拥有视口网格与 `findEntityAtWasm` 路径（`WasmBackendFacade.ts:334` `setHit` 使网格失效）。

**并非 `@vectojs/graph-layout`。** 该包（`packages/graph-layout/src/ForceLayout2D.ts:1`、`internal/BarnesHutQuadtree.ts:1` ——带一等碰撞的真 2D 四叉树，`BarnesHutQuadtree.ts:5` 处 `ZERO_TIER` 哨兵）是 _2D_ 力导向布局，没有 WASM 后端。_3D_ 力导向内核是 `crates/vectojs-force-rs` 供 `@vectojs/graph3d` 使用（见 §7）。

## 7. G4（+ graph3d 力导向）— 粒子与 Barnes-Hut

另外两个内核共享同样的不可见后端纪律，但未在变换序列中被标为 G1–G3：

**G4 — 粒子 CPU 模拟**（`crates/vectojs-core-rs/src/particle.rs:1`、`packages/core/src/wasm/particle-backend.ts:1`）：镜像 `ComputeParticleEntity.updateCPU`（到原点弹簧、鼠标排斥、爆炸冲量、积分+阻尼、速度上限、反弹+钳制、寿命衰减）。SoA 为 `f32`（而非 `f64`）因为 GPU/WGSL 缓冲是 `Float32Array`；differential 参照是 `particleStepReferenceF32`（`particle-backend.ts:340`），它以 `Math.fround` 舍入每个中间值并使用 `sqrt(dx*dx+dy*dy)`（而非正确舍入 f64 的 `Math.hypot`，`particle-backend.ts:350` 文档），因此与内核逐位一致。JS `updateCPU` 保持 `f64`，每步差异 <1 ULP ——可接受的 CPU vs GPU 发散。内核融合 `hasPendingAnimations`（返回待处理标志，`particle.rs:320` `EPS_VELOCITY/DISTANCE`）并对拒绝使用负返回，使 `0`（“已 settle”）可与失败区分（`particle-backend.ts:110` `step`、`particle.rs:310` `particle_step` 负状态编码）。

SoA 转置为 AoS stride-8 上的 `gather`/`scatter`（`particle-backend.ts:160` `gather`，带来自 `ComputeParticleEntity.ts` 的 `PARTICLE_STRIDE_FLOATS`/`PARTICLE_OFFSET_*`）。

**Graph3D Barnes-Hut 八叉树**（`crates/vectojs-force-rs/src/lib.rs:1`、`packages/graph3d/src/wasm/force-backend.ts:1`）：从 `f32` 位置构建 `f64` 质心八叉树并累积 `f64` 排斥加速度（`force_init`/`force_step`、`force_pos`/`force_accel` 指针）。JS 参照是 `packages/graph3d/src/layout/VectoForceLayout.ts`。构建+累积占一次 tick 的 78–90%（`force-rs/lib.rs:18` 中 `graph3d-frame` 2026-08-17 备注），因此内核恰好替换该阶段——链接弹簧、居中与速度衰减积分留在 JS。构建标志与 G1 相同——`crates/vectojs-force-rs/build.sh:20` `target-cpu=generic` 以将 `fma` 排除并保留 `a*b + c*d` 舍入一致性（`force-rs/build.sh:8` 文档）。

**`@vectojs/math` `SpatialHashGrid`**（`packages/math/src/SpatialHashGrid.ts:1`）_并非_ WASM 支持。它是面向通用实体 AABB 的纯 JS 粗筛哈希（`MAX_CELLS_PER_AABB=64`，`query` 为 `O(k)` 单元 + 结果，`insert`/`cellsForAABB` 文档），在 Scene 命中路径之外使用。G3 的 WASM 网格与 `SpatialHashGrid` 解决不同问题——添加空间加速时不要混淆它们。

## 8. 比特一致性测试 — 验证标准

一致性不是“足够接近”——而是每通道 `Object.is`（`packages/core/test/wasm/differential.test.ts:78` `assertBitIdentical`），它区分 `+0`/`-0` 并将 `NaN===NaN` 视为相等（经 `toBe` 的 `Object.is` 语义）。套件在同一 `buildStore` 输入上对 JS 与 WASM 运行：

- `packages/core/test/wasm/differential.test.ts:1` —— 变换（拓扑 `flat|chain|bushy|mixed`，数量 1→10k，`differential.test.ts:18` 处种子 `rng`，断言 `simd` 与 `scalar` 皆匹配，`differential.test.ts:110` 标量情形，跨增长/收缩场景复用）。
- `anim-kernel.test.ts`、`hit-kernel.test.ts`、`particle-kernel.test.ts` —— G2/G3/G4 等价物，带种子 PRNG。
- 专用拒绝/视图套件：`abi-bounds.test.ts`、`aabb-stale-module.test.ts`、`compose-stale-module.test.ts`、`scene-wasm-upload-fallback.test.ts`、`scene-wasm-aabb-rejection.test.ts`、`scene-wasm-resident.test.ts`、`scene-store.test.ts`、`view-revalidation.test.ts`、`memory-growth.test.ts`、`shared-runtime.test.ts`、`hit-fused.test.ts`。

全部以 `existsSync(wasmPath)` 与 `skipIf(!haveWasm)`（`differential.test.ts:14`）为门控——缺失 `.wasm` 时跳过，永不失败，因为 JS 是回退。以 `just wasm-test`（`just wasm` 然后 `vitest`）运行它们；`just wasm-check` 仅为 fmt+clippy。基准 harness 独立：仅 `benchmarks/run-browsers.sh` 在专用 Hyprland 工作区 headed、聚焦窗口 + 真实 GPU 下产生可引用数字（见全局 AGENTS.md 与 `hyprland-browser-bench` skill）。`benchmarks/debug-page.ts` 为无头且不可引用。

若改变会静默破坏一致性的数学细节：

- `js_min`/`js_max` 传播 `NaN` 并将 `-0 < +0` 视为成立（`lib.rs:655`、`hit.rs:220` `js_min_f32`/`js_max_f32`、`particle.rs:120` 对 `f32` 同理），匹配 `Math.min`/`Math.max`。Rust 的 `f64::min/max` 与 `f32::min/max` 忽略 `NaN` —— 单个 `f64::min` 替换会在溢出变换（`Infinity*0 = NaN`）上发散。
- AABB SIMD 归约可结合，因为 `js_min/js_max` 实现全序——`lib.rs:790` 文档证明 `f64x2_min/max` 具有相同 NaN/零语义，因此按通道配对的折叠与标量左折叠逐位匹配。
- 缓动使用显式乘法，而非 `powi`/`powf`（`anim.rs:360` `ease`，JS 镜像 `packages/animation/src/easing.ts`）。
- 粒子参照以 `Math.fround` 舍入每个中间值（`particle-backend.ts:340`）并使用 `sqrt(dx*dx+dy*dy)` 而非 `Math.hypot` —— `particle.rs:120` `js_min_f32/js_max_f32/js_clamp_f32` 匹配相同 Math 语义。

## 9. 回退与门控 — 韧性接缝

**状态返回。** 每个 `*_init`/`*_step`/`compose_*`/`hit_build`/`force_step` 都返回 `STATUS_*`（`lib.rs:485`、`anim.rs:158` `springs_ready`/`tweens_ready`、`hit.rs:110` `hits_ready`、`particle.rs:90` `particles_ready`、`force-rs/lib.rs:18` 镜像 `STATUS_*`）。`CAPACITY` 意为“数量过大”；`UNINITIALIZED` 意为“从未调用 init”；`BAD_RUN`/`OVERFLOW` 覆盖运行表与分配失败。调用方检查并回退——存储保持不动且视图保持有效（`backend.ts:230` `ensure` 提前返回，在 5 处被引用；`WasmBackendFacade.ts:470` `uploadRuns` 拒绝路径）。

**上传重试。** `WasmBackendFacade`（`WasmBackendFacade.ts:134` `WASM_UPLOAD_REJECT_LIMIT=3`、`WasmBackendFacade.ts:492` 计数器）统计连续 `uploadRuns` 拒绝。达到 3 次时为_此 Scene 生命周期_禁用变换后端（`WasmBackendFacade.ts:500` 翻转 `_mode='js'` ——而非第二标志——并经 `hasWarnedUploadFallback` 于 `WasmBackendFacade.ts:501` 警告一次）。被拒绝的运行表会合成错误树，且真正超容的拓扑每帧重失败、每重试付出 `O(n)` `buildTreeStore` ——因此统计连续而非累计。`WasmBackendFacade.ts:252` `setTransform` 与 `WasmBackendFacade.ts:515` 处成功路径重置该 streak。

**内存增长失效。** `viewsStale`（`backend.ts:38`）检查 `byteLength===0` 或 `buffer !== memory.buffer`；每后端 `revalidateViews`（`backend.ts:373`、`anim-backend.ts:121`、`hit-backend.ts:111`、`particle-backend.ts:112`）与 `WasmBackendFacade.ts:527` 在 `syncStore` 收集后跨后端重获取，处理共享线性内存增长（`hit_init` 在同一内存中分配自有网格数组）。

**陈旧模块探测。** `backend.ts:201` / `runAabbs` / `runKernel` 在调用前检查 `typeof ex.compose_simd === "function"` —— 固定 URL 处缓存的 `.wasm` 可能早于 `compute_aabbs_simd`，会于渲染中途抛出 `TypeError`（`#662`/`#798`）。`rejected` 路径在两条拒绝分支中皆设 `_aabbsFresh=false`（`WasmBackendFacade.ts:481` + `:562` + `:607`），因此融合 AABB 收集永不读取上一帧的陈旧边界。

**门控报告与预算。** `backend.available`（`WasmTransformBackend.available`、`HitTestBackend` 等）为“已安装”；`Scene.animBatchedLastFrame` / `Scene.hitTestBackend` / `Scene.transformBackend` / `Scene.accelerators.*.reason` 为“实际使用”—— `Scene.ts:1749` 处文档警告不要混淆。`animGate` 是三阈值而非一（`Scene.ts:1856` `animThreshold` 别名）。命中网格缓存键为 `hitGridFrame` + `hitGridStructureVersion`（`WasmBackendFacade.ts:394`）——缺少结构分量时，同帧变更会在变更前几何上命中。

## 10. 如何安全地新增 WASM 内核

1. **从 `crates/vectojs-core-rs/src/` 或兄弟 crate 开始。** 为其提供独立 `static mut` 存储、SoA 数组、带 `checked_add` + `checked_mul` 守卫的 `*_init` 与 `free_*`/`free_partial_*`（见 `lib.rs:370` `init` + `free_store` + `free_partial_store`、`anim.rs:158` `anim_init` + `free_anim` + `free_partial_anim`、`hit.rs:130` `hit_init` + `free_hit`）、`*_ready()` 谓词（`anim.rs:158` `springs_ready`）与 `ptr_export!` 访问器（`lib.rs:564`）。从 `anim.rs:44` 或 `hit.rs:44` 复制形态——不要与变换 `Store` 共享。将无存储哨兵初始化为 `Store::empty()`/`Anim::empty()`/`Hit::empty()`，并在 OOM 时发布它，使后续调用得到 `STATUS_UNINITIALIZED` 而非已释放内存读取（`lib.rs:120` `empty` 文档）。

2. **除非缓冲按外部契约为 `f32`，否则使用 `f64`。** 变换核心仅 `f64` 以求一致；仅 `particle.rs` 与 `simd_f32_bench.rs` 为 `f32`，各自拥有独立参照与显式发散说明（`particle.rs:10` _“a separate differential oracle”_）。不要在无度量理由与独立 differential 文件时添加第二精度路径。

3. **返回状态码，永不 trap。** `STATUS_OK=0` 表示成功，`STATUS_CAPACITY/UNINITIALIZED/BAD_RUN/OVERFLOW` 表示拒绝——且不写入。镜像于 `packages/core/src/wasm/backend.ts:16` `WASM_STATUS`（及 `force-rs/lib.rs:18` 镜像词汇文档 _“Keep the two lists in sync”_）。对三态返回（如待处理标志 0/1），在失败时使用负状态，使 `0` 保持有意义（`particle.rs:310` `particle_step` 负状态编码，`particle-backend.ts:110` `flag < 0` 消费者）。

4. **经 `just wasm` / `build.sh` 构建。** 永不裸 `cargo build --target wasm32-unknown-unknown`。若添加第二 crate，为其添加独立 `rust-toolchain.toml:1`（`targets=["wasm32-unknown-unknown"]`、`components=["clippy","rustfmt"]`、`profile="minimal"`）与 `build.sh:20` 及 `RUSTFLAGS="-C target-cpu=generic -C target-feature=+simd128 -C linker=rust-lld"` ——见 `crates/vectojs-force-rs/build.sh:20` 与 `rust-toolchain.toml:10` 模板。接入 `just wasm-check` 与 CI 工具链供应（`.carryctx/rules/wasm-crate-build.md:9`）。

5. **先写 JS 参照。** 在消费包中写 JS 参考（`soa.ts:246` `composeJS`、`soa.ts:316` `computeAabbsJS`、`SpringPhysics.ts:5` + `packages/animation/src/easing.ts`、`particle-backend.ts:340` `particleStepReferenceF32`）并将其作为已发布回退保留。匹配操作顺序与 `Math.min`/`Math.max` NaN 语义（`lib.rs:655` `js_min/js_max`），使 `Object.is` 一致性可达成。非批处理参照如 `SpatialHashGrid.query` 保持其粗超集回退契约（`SpatialHashGrid.ts:120` _“bounded by the grid's real content”_）

6. **添加 differential 测试。** 在 `packages/core/test/wasm/`（或 `packages/graph3d/test/` 针对 force）下按 `differential.test.ts:1` 形态新建文件：相同 `buildStore`/SoA 输入、两条路径、`assertBitIdentical`（`differential.test.ts:78`）经 `toBe`/`Object.is`、种子 PRNG（`differential.test.ts:18` `rng`）、`!haveWasm` 时跳过（`differential.test.ts:14`），覆盖 `simd` 与 `scalar` 内核（`differential.test.ts:110`）。添加边界溢出/拒绝测试（`abi-bounds.test.ts` 形态）与视图重验证测试（`view-revalidation.test.ts` 形态、`memory-growth.test.ts` 形态）。

7. **添加 TypeScript 后端外观。** 在 `packages/core/src/wasm/` 下按 `anim-backend.ts:1`/`hit-backend.ts:1` 形态新建文件：`ensure`/`revalidateViews`/`step` 或 `run*`、`STATUS_OK` 检查、`viewsStale` 辅助、失败时返回 `null` 的 `instantiateSync/Async/Streaming`（`backend.ts:467` 模式）。经 `runtime.ts:1`（`CoreWasmRuntime` + `moduleCache`）共享实例——不要实例化第二模块。在每次 `ensure` 后、写入视图前重验证（`backend.ts:373` 模式、`WasmBackendFacade.ts:527` 跨后端重获取）。

8. **为其加门控。** 在 `Scene`/`WasmBackendFacade` 中添加每特性门控（`Scene.ts:1904` `animGate` 三元组、`WasmBackendFacade.ts:134` `WASM_UPLOAD_REJECT_LIMIT`、`WasmBackendFacade.ts:394` 网格缓存键）。将报告抽取到 `WasmBackendFacade.ts:75` `AcceleratorReason`/`AcceleratorStatus`/`AcceleratorReport`，使 devtools 无需深入四域即可读取。在 `benchmarks/<name>-wasm/entry.ts`（`benchmarks/core-wasm/entry.ts:1`、`benchmarks/anim-wasm/entry.ts:1` 双成本模型）中以 `run-browsers.sh` 于专用 240Hz 工作区做基准——仅该 harness 产生可引用数字（全局 AGENTS.md + `hyprland-browser-bench` skill，分开报告 `refreshHz`、`js vs resident` 加速与 AABB 加速）。保持门控默认保守：度量集成开销（分配抖动、收集、`Math.min` 语义）而非微内核时间。

9. **最后接入 `Scene`。** 添加经 `runtime.ts:48` `loadCoreWasmModule`/`createCoreWasmRuntime` 并带 `WasmBackendFacade.ts:314` 处共享运行时竞态守卫（_“A concurrent enableWasm_ may have won the race while we awaited”_）的 `enableWasm*` 异步加载器（`Scene.ts:1706` `enableWasmTransforms` / `Scene.ts:1783` `enableWasmHitTest` / `Scene.ts:1809` `setAnimBackend` 模式）。向内核 feeding 的 `Scene` 遍历必须与内核调用分离——先测试遍历 + JS 回退，再接入 WASM（`scene-store.ts:30` `buildTreeStore` 是可隔离测试的接缝）。

## 11. 发布 WASM 变更前的检查清单

- [ ] `just wasm`（若触及则含 `crates/vectojs-force-rs/build.sh`）构建通过；`just wasm-check`（fmt + clippy `-D warnings`）通过。
- [ ] `just wasm-test`（WASM differential）通过——或在无 `.wasm` 时 `skipIf(!haveWasm)`。脚本/CI 中无裸 `cargo build`。
- [ ] 新内核有 `STATUS_*` 返回、拒绝时不写入、且有注入拒绝的测试；JS 路径为永久回退。
- [ ] JS 参照匹配操作顺序与 `Math.min`/`Math.max` NaN/`-0` 语义；`Object.is` 一致性在 NaN/±0 边界与 `+16`/`+8` 尾通道上成立。
- [ ] 新类型化数组视图经 `viewsStale`/`revalidateViews`（及跨后端重获取）与适用时的陈旧模块探测。
- [ ] 门控默认保守且已集成度量（`benchmarks/run-browsers.sh` 于 headed Chrome+Firefox；分开报告 `refreshHz`、`js vs resident` 加速与 AABB 加速）。
- [ ] 加速器报告已更新（`WasmBackendFacade.ts:75` `AcceleratorReason` 与 `Scene.accelerators` getter），若新增脏标记/报告字段则更新 `Scene.dart`/`_dirty` 风格文档。
- [ ] 若发布新 `.wasm` 则已接入 `tsup` 资源复制（`tsup.config.ts:40` 模式）。

## 12. G1/G2/G3 词汇 — 标签含义

标签为按发明时序，而非优先级：

- **G1** —— 世界矩阵 + AABB 核心（`crates/vectojs-core-rs/src/lib.rs:1`、`soa.ts:22`）。首个内核，也是唯一每帧对每个实体运行的内核。其他皆按工作负载大小门控；G1 仅按“是否安装 `.wasm` 且 `uploadRuns` 成功”门控。
- **G2** —— 批量动画尖峰（`crates/vectojs-core-rs/src/anim.rs:1`）。命名第二，因为它是下一个被切出的 SoA。现已逐位一致但起初为度量尖峰——`anim.rs:1` 头部称 _“measurement spike, not an integrated backend”_，基准 `benchmarks/anim-wasm` vs `benchmarks/anim-wasm-scene` 决定其是否集成。不要将“G2 已集成”读作已完成。
- **G3** —— 命中测试网格尖峰（`crates/vectojs-core-rs/src/hit.rs:1`）。同等状态：带独立存储的度量模块，按视口网格大小与 `hit_overflow` 门控。`hit.rs:1` 头部称 _“measurement module, like anim”_。
- **G4** —— 粒子模拟（`crates/vectojs-core-rs/src/particle.rs:1`）。常被称为 G4 但不在 G1/G2/G3 三元组中；保持独立因为它是 `f32` 且拥有独立参照。`crates/vectojs-force-rs`（八叉树）_并非_ G4 ——它是面向 graph3d 的第二 crate（不同 `Cargo.toml:1`、不同 `build.sh:1` 输出路径）。

若添加散文，请将“G1/G2/G3”保留为“变换 / 动画批处理 / 命中网格”的简称，提及 G4 与 force-rs 时明确命名。

## 13. Forge 基线与何时重测

行内基准表不是基线。可引用的数字位于 `benchmarks/core-wasm/results/latest/`（`core-wasm-chrome.json:1`、`core-wasm-firefox.json:1` —— schemaVersion 1、`refreshHz`、`panelHz`、`host.{cpu,gpu,driver}`、`rows[].{identical,jsNsPerEntity,copyNsPerEntity,residentNsPerEntity,copySpeedup,residentSpeedup,jsAabbNsPerEntity,wasmAabbNsPerEntity,aabbSpeedup}`）及其 `history/` 快照。harness 契约（`benchmarks/_shared/client.ts:1` `awaitStart`/`reportResult`、`benchmarks/core-wasm/entry.ts:1` 双成本模型）要求真实 headed 浏览器在专用 Hyprland 工作区前台、聚焦窗口与真实 GPU（`benchmarks/run-browsers.sh:1` ——唯一可引用路径）。

在以下情况重测：

- 变更 `lib.rs:84` `SIMD_ALIGN`、`soa.ts:64` `PAD`、`lib.rs:640` `f64x2_splat` 模式或 `build.sh:28` `RUSTFLAGS` ——其中任一都会使 `residentSpeedup` 移动 >10%。
- 变更 `anim.rs:12` 弹簧常量或 `anim.rs:360` `ease` ——重跑 `benchmarks/anim-wasm` 微基准 + `benchmarks/anim-wasm-scene` 集成（Chrome：springs 在 100 驱动时 `2.06×`、10 万时 `3.7×`；tweens 在 100 时 `4.14×`、1k 时 `4.48×` —— `anim-wasm-chrome.json:1` 2026-08-14）并仅在集成开销证明合理时重置 `Scene.animGate`。
- 触及 `hit.rs:280` `hit_build` 或 `hit-store.ts:47` 收集——重跑 `benchmarks/hit-wasm` / `benchmarks/scene-hit-wasm`。
- 触及 `particle.rs:310` 或 `force-rs/lib.rs:1` ——重跑 `benchmarks/particle-wasm` / `benchmarks/graph3d-frame`。

始终同时报告 Chrome _与_ Firefox，并附 `refreshHz` 于每帧数字旁；Firefox 需设置 `layout.frame_rate`，否则会以约 60 Hz 且难以察觉的低值报告（全局 AGENTS.md 度量规则 + `hyprland-browser-bench` skill）。

## 14. 曾困扰该领域的陷阱

| 陷阱                                                                | 文件:行                                                        | 状态                                    |
| ------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------- |
| `~/.cargo/config.toml` `cfg(all)` 将宿主机标志合并进 wasm 链接      | `.carryctx/rules/wasm-crate-build.md:1`、`build.sh:8`          | 由 `RUSTFLAGS` 覆盖修复                 |
| `Vec<f64>` 仅 8 字节对齐 → SpiderMonkey `v128_load` 慢 7 倍         | `lib.rs:84` `SIMD_ALIGN`                                       | 由 16 字节 `alloc_zeroed` 修复          |
| `WebAssembly.Memory.grow` 后其他后端的陈旧 `TypedArray` 视图        | `backend.ts:38` `viewsStale`、`WasmBackendFacade.ts:527`       | 由 `revalidateViews` + 跨后端重获取修复 |
| 早于 `compute_aabbs_simd` 的陈旧缓存 `.wasm` → 渲染中途 `TypeError` | `backend.ts:201` 探测                                          | 由标量回退修复（`#798`）                |
| 被拒绝的 `uploadRuns` 合成错误树 / 陈旧 AABB                        | `WasmBackendFacade.ts:470` + `:481` `:562` `_aabbsFresh=false` | 由重试上限修复（`DEC-0014`）            |
| `Math.pow`/`powi` vs 显式乘法 → 约 1e-12 缓动差距                   | `anim.rs:360` `ease`                                           | 由显式 `t*t` 修复                       |
| `f64::min` 忽略 NaN → 溢出变换上 AABB 发散                          | `lib.rs:655` `js_min`                                          | 由传播 Math 的 `js_min/js_max` 修复     |
| `f32` 在深/蓬松树上约 93px 误差——作为死内核发布                     | `simd_f32_bench.rs:1`、`Cargo.toml:20` `bench-f32`             | 由特性门控修复                          |
| `target-cpu` 启用 `fma` → 单次舍入 vs JS 两次舍入                   | `build.sh:28` `generic`                                        | 由 `generic` 修复                       |
| `new URL('@vectojs/core/…', import.meta.url)` 无法解析              | `asset.ts:10`                                                  | 由相对 `./vectojs_core.wasm` 修复       |

## 关联

- **Boss 06（VMT 运行时）**拥有 `Entity` 树、`Scene` 遍历、`structureVersion` → `storeStructureVersion`，以及本 boss 所加速的 `WASM_UPLOAD_REJECT_LIMIT` 接线。
- **Boss 07（渲染器）**消费本 boss 产生的世界矩阵与 AABB ——此处陈旧视图是下一 boss 的陈旧光栅缓存版本。
- **Boss 11（图布局）**为 3D 力导向复用相同构建纪律（`crates/vectojs-force-rs`）；`@vectojs/graph-layout` 2D 四叉树（`BarnesHutQuadtree.ts:5`）保持仅 JS。
- **Boss 02（文本/布局）**与 **boss 03（投影）** _并非_ WASM 支持——当瓶颈是塑形或 DOM 载体时不要伸手拿 WASM。

## 参考

- `crates/vectojs-core-rs/Cargo.toml:1` —— 变换 crate 清单（crate-type、bench-f32、release profile）
- `crates/vectojs-core-rs/src/lib.rs:1` —— G1 标量/SIMD 合成 + SIMD AABB、Store、状态码、`js_min/js_max`
- `crates/vectojs-core-rs/src/anim.rs:1` —— G2 spring/tween 批处理、显式乘法缓动、独立存储
- `crates/vectojs-core-rs/src/hit.rs:1` —— G3 稠密视口网格、计数排序构建、溢出
- `crates/vectojs-core-rs/src/particle.rs:1` —— G4 f32 粒子 SoA、融合的待处理标志、负状态拒绝
- `crates/vectojs-core-rs/src/simd_f32_bench.rs:1` —— 仅基准的 f32x4、作为默认被拒绝（约 93px 误差）
- `crates/vectojs-force-rs/src/lib.rs:1` —— graph3d Barnes-Hut 八叉树（f64 累积，f32 位置，抖动 `imul`）
- `crates/vectojs-core-rs/build.sh:1` / `crates/vectojs-force-rs/build.sh:1` —— 正确的 `RUSTFLAGS`（`generic`、`+simd128`、`rust-lld`）
- `.carryctx/rules/wasm-crate-build.md:1` —— 构建规则（just wasm、RUSTFLAGS 覆盖、gitignore 二进制）
- `packages/core/src/wasm/soa.ts:1` —— JS SoA、`buildStore`、`composeJS`/`computeAabbsJS` 参照
- `packages/core/src/wasm/backend.ts:1` —— 变换后端（resident vs copy、`WASM_STATUS`、`viewsStale`、陈旧模块探测）
- `packages/core/src/wasm/runtime.ts:1` —— 共享 `CoreWasmRuntime` + 全局模块缓存 + 惰性记忆化后端
- `packages/core/src/wasm/{anim,hit,particle}-backend.ts:1` / `asset.ts:1` —— G2/G3/G4 外观 + `coreWasmUrl`
- `packages/core/src/wasm/{scene-store,hit-store,hit-store-fused}.ts:1` —— 树 → SoA / AABB 收集 / 融合收集
- `packages/core/src/tree/scene/WasmBackendFacade.ts:1` —— 四后端、`AcceleratorReason/Report`、`syncStore`/`ensureAabbs`、上传重试、共享运行时
- `packages/math/src/SpringPhysics.ts:1` / `packages/math/src/SpatialHashGrid.ts:1` —— JS 物理/网格（仅 JS，非 WASM —— `MAX_CELLS_PER_AABB=64`）
- `packages/core/test/wasm/differential.test.ts:1` + `anim-kernel.test.ts`/`hit-kernel.test.ts`/`particle-kernel.test.ts` —— 逐位一致（`Object.is`）套件、`skipIf(!haveWasm)`
- `benchmarks/core-wasm/entry.ts:1` / `benchmarks/anim-wasm/entry.ts:1` / `benchmarks/core-wasm/results/latest/:1` —— headed `run-browsers.sh` 度量（Chrome+Firefox、`refreshHz`、`residentSpeedup`）

---

_系列：00 总览 → 01 选区 → 02 文本+布局 → 03 投影+虚拟化 → 04 流式 Markdown → 05 TeX → 06 VMT 运行时 → 07 渲染器 → **08 WASM G1/G2/G3** → 09 Three/XR → 10 视频导出 → 11 图布局 → 12 DevTools → 99 综合。_
