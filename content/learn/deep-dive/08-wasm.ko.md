+++
title = "08 — WASM 가속기 — G1/G2/G3 & 비트 패리티"
description = "@vectojs/core 뒤의 보이지 않는 WASM 백엔드: G1 월드 행렬, G2 애니메이션 배치, G3 히트 그리드(및 G4 입자), SIMD를 가능하게 하는 SoA 저장소, WASM을 선택적으로 유지하는 비트 패리티 계약."
weight = 28
+++

# 08 — WASM 가속기 — G1/G2/G3 & 비트 패리티

> **Boss 08**은 의도적으로 보이지 않는다. Rust 커널(`crates/vectojs-core-rs`, `crates/vectojs-force-rs`)은 JS 엔진이 이미 정확히 수행하는 것 — 월드 행렬 합성, 애니메이션 틱, 히트 브로드 페이즈, 입자 통합 — 을 가속하며 절대 필수가 되지 않는다. 모든 가속 경로는 동일한 비트를 생성하는 JS 대체를 가지며, 모든 빌드, 게이트, 테스트는 그 약속을 유지한다.

- **배울 내용**: WASM이 보이지 않는 백엔드인 이유; `f64x2`를 가능하게 하는 SoA 저장소; G1/G2/G3(+G4)가 각각 무엇을 가속하는지, 게이트 방식, 헤드 벤치마크가 실제로 측정한 것; 비트 패리티 테스트 방식; 대체 계약을 깨지 않고 새 커널을 추가하는 방법.
- **배우지 않을 내용**: VMT 더티/라이프사이클(boss 06), 렌더러/DPR 패리티(boss 07), 그래프 레이아웃 튜닝(boss 11), Three/XR 두 세계 매핑(boss 09). 이 문서는 VMT와 렌더러 사이의 가속 계층이다.

## 1. WASM이 보이지 않는 백엔드인 이유

VectoJS는 Rust 없이도 정확히 작동한다. `packages/core/src/wasm/soa.ts:1`(`composeJS`, `computeAabbsJS`)와 `packages/math/src/SpringPhysics.ts:1` / `packages/animation/src/easing.ts`는 영구적인 오라클과 대체이며; 크레이트 매니페스트는 명시적으로 말한다 — `crates/vectojs-core-rs/Cargo.toml:6` "보이지 않는 백엔드; TypeScript 경로는 영구적 대체"와 `crates/vectojs-force-rs/Cargo.toml:6`의 동일 내용. 컴파일된 `.wasm` 자체는 gitignored(`packages/core/src/wasm/vectojs_core.wasm`, `packages/graph3d/src/wasm/vectojs_force.wasm`) — CI에서 빌드되고 npm에 게시되며 절대 커밋되지 않음(`.carryctx/rules/wasm-crate-build.md:6`).

이 단일 결정에서 세 가지 제약이 나온다:

1. **인스턴스화는 실패할 수 있고 무음이어야 한다.** CSP `wasm-unsafe-eval`, 누락된 자산, 지원되지 않는 `simd128`, 오래된 캐시 모듈 — 모든 로더는 `null`을 반환하고 호출자는 JS 경로를 유지한다. `packages/core/src/wasm/backend.ts:467` `instantiateSync`/`instantiateAsync`/`instantiateStreaming`, `packages/core/src/wasm/runtime.ts:48` `loadCoreWasmModule`/`createCoreWasmRuntime`, `packages/graph3d/src/wasm/force-backend.ts:55`의 힘 동등, `packages/core/src/wasm/asset.ts:22` `coreWasmUrl` / `packages/graph3d/src/wasm/asset.ts:22` `forceWasmUrl`이 번들러 해결용이다. 실패는 기본 상태이지 오류 경로가 아니다.

2. **커널은 함정이 아니라 대체 가능해야 한다.** 내보내기는 `STATUS_OK`(0) 또는 비영 `STATUS_CAPACITY/UNINITIALIZED/BAD_RUN/OVERFLOW`(`crates/vectojs-core-rs/src/lib.rs:485` 상수, `packages/core/src/wasm/backend.ts:16` `WASM_STATUS`)를 반환하고, 거부 시 아무것도 쓰지 않는다. JS 쪽은 비영을 "이 프레임에서 참조 경로 실행"(`packages/core/src/wasm/backend.ts:212` `compose` 조기 반환, `packages/core/src/wasm/anim-backend.ts:173` `stepSprings` 불리언, `packages/core/src/tree/scene/WasmBackendFacade.ts:487` 업로드 재시도, `packages/core/src/wasm/particle-backend.ts:110` 삼상태 음수 상태)으로 처리한다.

3. **공유 선형 메모리, 공유 모듈.** `packages/core/src/wasm/runtime.ts:1`(`CoreWasmRuntime`) 이전에는 네 백엔드가 동일한 바이너리에 대해 네 개의 컴파일과 네 개의 선형 메모리를 의미했다. 이제 하나의 `WebAssembly.Module`이 URL로 키 지정된 전역 캐시(`runtime.ts:38` `moduleCache`, 문자열/URL로만 키 지정 — 바이트는 캐시되지 않음, `runtime.ts:48` `cacheKey` 문서)로 저장되고, 하나의 `Instance`가 네 저장소를 `lib.rs:44` `Store`, `src/anim.rs:44` `Anim`, `src/hit.rs:44` `Hit`, `src/particle.rs:44` `Particles`, `crates/vectojs-force-rs/src/lib.rs:44` `Octree`+`POS`/`ACCEL`의 별도 `static mut` 정적을 통해 노출한다(절대 별칭 없음). `CoreWasmRuntime`은 각 백엔드를 지연 구성하고 메모이제이션(`runtime.ts:90` `transform()`/`anim()`/`hit()`/`particle()`)하여 변환만 활성화한 씬이 애니메이션/히트 할당 비용을 지불하지 않도록 한다.

보고는 "설치됨"과 "이 프레임 활성"을 분리한다. `Scene.accelerators: AcceleratorReport`(`WasmBackendFacade.ts:122` 보고 형태, `Scene.ts:1749` 문서 "정확한 할당이 필요하기 때문에 확정 할당")는 각 가속기에 대해 `{ available, activeThisFrame, reason, path }`를 반환한다 — `available`은 "백엔드 설치, 게이트 허용", `activeThisFrame`은 "실제로 실행", `reason`은 `not-installed | below-gate | rejected | active`(`WasmBackendFacade.ts:75` `AcceleratorReason`)다. `Scene.animGate` 대 `Scene.animBackend`는 고전적인 혼동이다: 게이트가 드라이버 수 아래면 `animBackend==='wasm'`이면서 `animBatchedLastFrame===false`가 된다(`Scene.ts:1749` 및 `Scene.ts:1904` 게이트 문서 참조).

## 2. 빌드 규율 — `just wasm`, 순수 cargo 아님

함정은 `~/.cargo/config.toml`(`.carryctx/rules/wasm-crate-build.md:1`)이다: `[target.'cfg(all())']` 섹션이 `wasm32`도 일치하고, Cargo는 `rustflags`를 대상별 플래그와 _합친다_. `-C target-cpu=native`나 `-fuse-ld=mold` 같은 호스트 플래그가 `wasm32-unknown-unknown` 링크로 누출되어 깨진다(`rust-lld: error: unknown argument: -fuse-ld=mold`). `RUSTFLAGS`는 설정 플래그를 _대체_하지만, 대상별 설정은 그렇지 않다.

유일한 올바른 빌드:

```bash
just wasm  # crates/vectojs-core-rs/build.sh를 올바른 RUSTFLAGS로 실행
# 또는 힘 커널용:
# crates/vectojs-force-rs/build.sh  (동일 RUSTFLAGS)

# build.sh가 수행하는 것(crates/vectojs-core-rs/build.sh:28):
RUSTFLAGS="-C target-cpu=generic -C target-feature=+simd128 -C linker=rust-lld" \
  cargo build --release --target wasm32-unknown-unknown --manifest-path crates/vectojs-core-rs/Cargo.toml
```

규칙 세부사항(`crates/vectojs-core-rs/build.sh:1`, `crates/vectojs-force-rs/build.sh:1`, `.carryctx/rules/wasm-crate-build.md:1`):

| 규칙                                                           | file:line                                                        | 이유                                                                                                                                                                                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target-cpu=generic`                                           | `build.sh:28`                                                    | `fma`(융합 곱셈-덧셈) 제외. `generic`은 `fma`가 없으며; 호스트 튜닝 CPU는 `a*b + c*d`를 한 번의 반올림으로 융합하는 반면 JS는 두 번 수행 — 비트 패리티 깨짐. `crates/vectojs-force-rs/build.sh:8`이 명시적으로 강조함. |
| `target-feature=+simd128`                                      | `build.sh:28`                                                    | `v128`/`f64x2`/`f32x4` 활성화. 없으면 `#[target_feature(enable="simd128")]` 커널(`lib.rs:612`, 입자 주석)이 컴파일 실패나 트랩함.                                                                                      |
| `linker=rust-lld`                                              | `build.sh:28`                                                    | `~/.cargo/config`의 `mold` 같은 링커를 덮어씀.                                                                                                                                                                         |
| `panic="abort"` + `strip` + `lto` + `codegen-units=1`          | `Cargo.toml:22`                                                  | 최소, 결정적 바이너리.                                                                                                                                                                                                 |
| `edition="2024"` + `rust-toolchain.toml:10` `channel="stable"` | `rust-toolchain.toml:1`, `.carryctx/rules/wasm-crate-build.md:3` | 정확한 채널 고정은 _stable_이며 버전이 아님 — 정확 버전 고정은 오프라인/미러 박스를 깨뜨리며; CI는 대신 정확 버전을 고정함.                                                                                            |
| `just wasm-check`                                              | `.carryctx/rules/wasm-crate-build.md:5`                          | 동일 `RUSTFLAGS`로 `cargo fmt --check` + `cargo clippy --target wasm32-unknown-unknown -- -D warnings`.                                                                                                                |
| `just wasm-test`                                               | `.carryctx/rules/wasm-crate-build.md:5`                          | `just wasm` 후 코어 차이 테스트 스위트(`vitest`).                                                                                                                                                                      |
| 바이너리 gitignored                                            | `build.sh:14`, `.carryctx/rules/wasm-crate-build.md:6`           | TS 전용 기여자는 Rust가 필요 없으므로. `packages/graph3d/tsup.config.ts:40`(`vectojs_force.wasm → dist/wasm/`) 복사 단계로 npm을 통해 게시됨.                                                                          |
| `Cargo.toml` `publish=false`                                   | `Cargo.toml:5` (두 크레이트)                                     | 크레이트는 crates.io 패키지가 아님 — npm을 통한 `.wasm`만 중요함.                                                                                                                                                      |

`f32x4` 평가 커널(`crates/vectojs-core-rs/src/simd_f32_bench.rs:1`)은 `bench-f32`(`Cargo.toml:20` `bench-f32 = []`) 뒤에 있으며 절대 출하되지 않음 — 측정되고 거부됨. `build.sh:18`은 `./build.sh --features bench-f32` 선택 형식과 기본이 제외하는 이유를 문서화한다: f32가 측정되고 거부됨.

## 3. SoA 저장소 — SIMD에 도달 가능한 형태

`packages/core/src/wasm/soa.ts:22`는 시스템의 절반; `crates/vectojs-core-rs/src/lib.rs:1`는 나머지 절반이다. `lib.rs:10`의 문서 주석이 부하를 견딘다:

> 각 필드당 하나의 평면 `f64` 배열. 교차 레코드에서는 연속 엔티티의 `x`가 `N*8`만큼 떨어져 — `v128` 로드가 두 개를 가져올 수 없다.

### 3.1 SoA, AoS가 아님

`Store`(`lib.rs:44`)는 22개의 `*mut f64` 입력/출력/경계/AABB 배열과 3개의 `*mut i32` 실행 테이블을 보유한다. JS 쪽: `TransformStore`(`soa.ts:44`)는 `WebAssembly.Memory.buffer` 위에 내보낸 포인터(`lib.rs:564` `ptr_export!`, `backend.ts:178` `p_x()…p_run_len()`)를 통해 배치된 동일한 `Float64Array`/`Int32Array` 뷰를 갖는다.

### 3.2 형제 실행, 깊이 순서

WASM SIMD는 수집이 없다. 임의 부모를 가로지르는 벡터화는 엔티티당 부모 행렬 로드를 필요로 한다. 대신 `soa.ts:178` `buildStore`는 한 부모의 자식이 연속되도록 보장한다(BFS 부모당: 부모를 큐에서 제거하고, 모든 자식을 한 실행으로 방출하고, 큐에 삽입). 부모 월드 행렬은 실행당 한 번(`lib.rs:640` `f64x2_splat(*S.wa.add(p))`) 스플랫되고 자식이 두 레인을 채운다. `store.runStart/runLen/runParent`은 반복 테이블이며; `set_run_count`(`lib.rs:600`)는 길이를 게시한다.

JS 빌더는 정확히 하나의 `parent===-1` 루트(부재/중복 시 예외, `soa.ts:104`)를 검증하고, 모든 부모 인덱스가 범위 내(`soa.ts:112`)인지, 루트가 저장소 인덱스 0에서 항등(`lib.rs:603` `seed_root`, `soa.ts:246` `composeJS`는 `wa[0]=1,wd[0]=1`로 시드)인지 확인한다. 재빌드 사이에 프레임당 동기화는 현재 `x/y/scale/rotation/opacity`를 상주 입력 뷰로 수집하고 커널을 다시 실행(`WasmBackendFacade.ts:458` `syncStore`)한다.

### 3.3 패딩, 정렬, 사전 계산 삼각함수

**패딩, 잔여 루프 아님.** `init`(`lib.rs:370`)은 `capacity + 8`(및 `simd_f32_bench.rs:128`은 `f32x4`용 `+16`)을 할당한다. 홀수 길이 꼬리는 논리 끝을 지나 한 슬롯을 읽는다 — 패딩 레인은 쓰이지만 절대 읽지 않는다(`lib.rs:643` `compose_simd` 주석, `backend.ts:152` 업로드 주석). JS 저장소는 패딩(`soa.ts:64` `capacity = count + 8`)을 반영한다.

### 3.4 공유 메모리 뷰 위험

WASM 모듈이 커지면(`force_init` 후) `Float32Array` 뷰가 분리된다(`force-backend.ts:37` `viewsStale`). 각 `force_step` 후 `viewsStale`이 `true`면 뷰를 다시 검증해야 한다(`backend.ts:152` `updateViews`). 오래된 뷰는 느리지만 정확한 JS 대체만 비용을 치르며 잘못된 읽기는 절대 아니다.

## 4. G1 — 월드 행렬 합성 (+ AABB)

`G1`은 `WasmBackendFacade.ts:228`의 `transformBackend`를 활성화할 때 `TransformStore`(`soa.ts:44`)를 유지한다. `ensureAabbs()`는 `Float64Array` SoA 버퍼를 한 WASM 패스로 합성하며, JS 탐색과 동일한 `T·S·R` 수학, 비트 동일이다. 히트 테스트 융합 수집(`HitTester.ts:144`)은 `transform.aabbView()`를 선호한다(`WasmBackendFacade.ts:228`).

## 5. G2 — 배치 애니메이션 드라이버(스프링 + 트윈)

`G2`는 `packages/core/src/wasm/anim-backend.ts:173`의 `stepSprings()`를 통해 `SpringPhysics`를 가속한다. `animGate`(`Scene.animGate`)는 배치 드라이버 수가 임계값(`Scene.animGate`) 이상일 때만 `animBackend='wasm'`을 활성화한다. 임계값 미만이면 `animBatchedLastFrame===false`이지만 백엔드가 설치되어 있다(`WasmBackendFacade.ts:122`).

## 6. G3 — 히트 테스트 브로드 페이즈(밀집 뷰포트 그리드)

`G3`은 `HitTester.ts:144`의 `ensureHitGrid()`를 WASM으로 가속한다. `ensureHitGrid()`는 `transform.aabbView()`를 사용하여 엔티티당 네 모서리 재도출을 피한다(JS 수집은 100k 엔티티에서 11.2ms 대 39µs). `findEntityAtWasm()`(`HitTester.ts:185`)는 WASM 그리드가 신뢰할 수 있을 때만 사용된다.

## 7. G4(및 graph3d 힘) — 입자 & Barnes-Hut

`G4`는 `WebGPUParticleSystemManager`(`packages/core/src/wasm/particle-backend.ts:110`)를 활성화하며, `particleBackend='auto'`는 `Scene.registerWebGPUParticleSystemManager(...)` 등록이 필요하다(`Scene.ts:256`). `crates/vectojs-force-rs`는 `packages/graph3d/src/wasm/force-backend.ts:55`를 통해 `VectoForceLayout`의 3D 옥트리 백엔드를 제공한다.

## 8. 비트 패리티 테스트 — 검증 표준

`packages/core/src/wasm/soa.ts`와 `crates/vectojs-core-rs/src/lib.rs`의 차이 테스트는 `vitest`(`.carryctx/rules/wasm-crate-build.md:5`)를 통해 수행된다. `VectoForceLayout.wasm.test.ts`(`packages/graph3d/test/`)는 스트리밍/동기 경로와 나쁜 URL 대체(`file:///nonexistent` → `false`)를 포함한다.

## 9. 대체와 게이트 — 복원력 경계

`instantiateSync`(`backend.ts:467`)가 `null`을 반환하면 JS 대체(`composeJS`, `stepSprings`, `findHitRecursively`)가 즉시 사용된다. `WasmBackendFacade.ts:75`의 `AcceleratorReason`은 `not-installed | below-gate | rejected | active`를 구분한다. `Scene.accelerators`는 `available`과 `activeThisFrame`을 분리하여 보고한다.

## 10. 새 WASM 커널을 안전하게 추가하는 방법

1. `crates/vectojs-core-rs/src/lib.rs`에 `Store`(`lib.rs:44`)와 동일한 형태의 `static mut` 저장소를 추가한다.
2. `build.sh:28`의 `RUSTFLAGS`를 변경하지 않고 `just wasm`만 사용한다.
3. JS 대체(`packages/core/src/wasm/soa.ts`)를 영구 오라클로 유지한다.
4. `WasmBackendFacade`(`WasmBackendFacade.ts:122`)에 새 `AcceleratorReport` 항목을 추가한다.
5. 게이트를 `Scene`에 추가하고(`Scene.animGate` 패턴), `available`과 `activeThisFrame`을 분리한다.
6. `packages/core/src/wasm/backend.ts:212`와 동일한 조기 반환 패턴으로 실패 시 `null` 반환을 보장한다.

## 11. WASM 변경 전 체크리스트

1. `pixelRatio`가 아닌 `window.devicePixelRatio`를 읽지 마라 — `renderer.pixelRatio`를 사용하라.
2. `build.sh:28`의 `RUSTFLAGS`를 변경하지 마라 — `just wasm`만 사용하라.
3. `~/.cargo/config.toml`이 존재하면 `build.sh`가 이를 덮어쓴다는 점을 확인하라(`build.sh:1`).
4. 새 저장소는 `Store`(`lib.rs:44`)와 동일한 `static mut` 형태여야 한다 — 별칭이 없어야 한다.
5. JS 대체는 영구 오라클이어야 하며, 비트 패리티 테스트를 통과해야 한다(`vitest`).
6. 게이트는 `Scene`에서 `available`과 `activeThisFrame`을 분리해야 한다(`WasmBackendFacade.ts:75`).

## 12. G1/G2/G3 어휘 — 라벨 의미

`G1` = `TransformStore`(`soa.ts:44`), `G2` = `AnimationBackend`(`anim-backend.ts:173`), `G3` = `HitTester`(`HitTester.ts:144`), `G4` = `WebGPUParticleSystemManager`(`particle-backend.ts:110`). `AcceleratorReport`(`WasmBackendFacade.ts:122`)는 각 가속기에 대해 `{ available, activeThisFrame, reason, path }`를 보고한다.

## 13. Forge 기준 및 재측정 시점

`benchmarks/graph-layout/README.md:44`의 500 노드 기준(`20260820T135641Z-1a6d54`)은 호스트 특정이다. 새로운 WASM 커널은 `benchmarks/run-browsers.sh`(`AGENTS.md`의 벤치마크 계약)로 실제 GPU에서 헤드 상태로 재측정되어야 한다. `f32` 경로는 측정되고 거부되었다(`simd_f32_bench.rs:1`).

## 14. 이 영역에서 실제로 발생한 함정

- `RUSTFLAGS` 없이 `cargo build`를 사용하면 `~/.cargo/config.toml`의 호스트 플래그가 누출되어 WASM 빌드가 깨진다.
- `fma`를 포함한 `target-cpu=native`는 JS와 비트 패리티를 깨뜨린다 — `generic`이 필수(`build.sh:8`).
- `simd128` 없이 빌드하면 SIMD 커널이 컴파일되지 않거나 트랩한다(`build.sh:28`).
- `drawImageRect`는 `SVGRenderer`(`SVGRenderer.ts:510`)에서 지원되지 않으므로 `GlyphRasterAtlas`는 SVG 대상이 아니다.
- `CanvasTexture.needsUpdate`를 `flush()` 후 설정하지 않으면 텍스처가 정지된다(`ThreeRenderer.ts:478`).
- `force_init` 후 `viewsStale`(`force-backend.ts:37`)이 `true`면 각 `force_step` 후 뷰를 다시 검증해야 한다.
- `Graph3D`는 `ThreeAdapter`와 독립적으로 작동하므로, 브리지 변경이 `Graph3D`에 영향을 주지 않는다 — 두 경로를 별도로 테스트하라.
