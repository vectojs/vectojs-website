+++
title = "00 — 개요: VectoJS의 16가지 난제"
description = "VectoJS의 16가지 딥다이브 난제를 위한 내비게이션 가이드 — 난제 지도, 아키텍처 불변식, 패키지 의존성, 그리고 모든 신입을 위한 읽기 경로."
weight = 20
+++

# 00 — 개요: VectoJS의 16가지 난제

## 난제 지도

VectoJS는 브라우저 책임을 단일 `<canvas>` 위에 재구현합니다: layout, hit-testing, event dispatch, text shaping, clipping, scrolling, 접근성, 그리고 렌더링 — 모두 retained entity 트리 위의 명시적 연산으로 수행됩니다. 이 16편의 시리즈는 프레임워크에서 가장 어려운 난제를 지도처럼 정리합니다. 각 난제는 DOM이 공짜로 제공하던 서브시스템 하나를 다루며, VectoJS는 이제 그것을 정확히 구현해야 합니다. 순서대로 해결할 필요는 없지만, 어디서 시작할지 고르기 전에 지도를 알아야 합니다.

이 문서가 그 맵입니다.

- **여기서 배우는 것**: 한 장의 그림으로 보는 런타임 아키텍처, 패키지 의존성 골격, 각 난제가 어떤 불변식을 시험하는지, 읽기 순서를 고르는 방법, 그리고 기존 `content/learn/*` 및 `content/reference/*` 문서 대비 이 딥다이브 시리즈의 위치.
- **여기서 배우지 않는 것**: 개별 난제의 메커니즘. 각 전문 딥다이브가 하나의 난제를 맡습니다. 이 개요는 그곳으로 연결하고, 방향을 잡을 만큼의 최소한만 제공합니다.

## 아키텍처 한눈에 보기

```text
            Application state
                   │
                   ▼
         ┌─────────────────────┐
         │  Virtual Math Tree  │   Entity tree: transforms, bounds, events,
         │  (Scene + Entities) │   dirty/invalidation, worldMatrix. packages/core/tree/Scene.ts:1107
         └─────────┬───────────┘
                   │  dirty, transforms, culling
         ┌─────────▼───────────┐
         │  Layout  / HitTest  │   LayoutEngine (@vectojs/layout), HitTester (@vectojs/core),
         │  / Animation        │   Tween/Spring drivers (@vectojs/animation), physics (@vectojs/math)
         └─────────┬───────────┘
                   │  draw calls / glyph quads / animation frames
         ┌─────────▼───────────┐         ┌──────────────────────────┐
         │   Canvas + GPU      │         │   Thin DOM projection    │
         │  Canvas2D (default) │         │  a11y shadow elements:   │
         │  WebGL  / WebGPU    │◄───────►│  getA11yAttributes(),    │
         │  SVG / Three.js     │  sync   │  a11yProjection modes,   │
         └─────────────────────┘         │  syncA11y walk           │
                                         └──────────────────────────┘
                   │                              │
                   ▼                              ▼
              Visible pixels              Screen readers, IME, Playwright,
                                         copy/find, AT automation
```

픽셀의 원천은 항상 canvas입니다. DOM은 **의미(semantics)와 네이티브 입력**만 담당하며, 보이는 장면을 렌더링하지 않습니다. 두 세계는 layout 이후 프레임을 제시하기 전에 실행되는 깊이 우선 walk(`Scene.syncA11y` / `ContentProjectionManager`, `packages/core/src/tree/scene/A11yProjectionManager.ts:30` 참고)로 동기화됩니다.

인접한 그림의 레퍼런스 렌더링은 이미 문서에 존재합니다: [Runtime Architecture](/learn/runtime-architecture/)와 [Engine Concepts](/learn/engine-concepts/) (중앙 VMT 허브 다이어그램). 이 텍스트 다이어그램은 의도적으로 코드 참조 가능하고 인쇄 가능하게 작성되었습니다.

## 패키지 의존성 골격

리프 엔진부터 위로 합성됩니다. 그래프는 비순환이며, 화살표는 "빌드 시점에 ~로부터 import함"을 의미합니다:

```text
  @vectojs/text ─┐
                 ├─► @vectojs/layout ─┐
  @vectojs/math ─┤                    │
                 └─► @vectojs/animation├─► @vectojs/core ─┬─► @vectojs/ui ─┬─► @vectojs/markdown
                                                          │                  └─► @vectojs/markdown-app
                                                          ├─► @vectojs/styles
                                                          ├─► @vectojs/table / @vectojs/node-editor
                                                          │
                                   @vectojs/tex ──────────┤  (consumed by markdown; public API)
                                                          │
           @vectojs/graph-layout ─► @vectojs/graph3d ─────┤  (@vectojs/knowledge-graph above graph3d)
           @vectojs/three / @vectojs/devtools /            │
           @vectojs/video-exporter / @vectojs/desktop      ┘  (host apps atop core+ui)

  crates/vectojs-core-rs (Rust → wasm32)  — invisible accelerator behind @vectojs/core
```

`packages/*/package.json` 의존성으로 검증되었습니다 (`text`/`math`/`graph-layout`/`tex`는 `@vectojs/*` 의존성이 없음; `layout→text`, `animation→math`, `core→{layout,text,math,animation}`, `markdown→{ui,tex,core}`). 빌드는 이 순서를 따릅니다 (`package.json:14`). 테스트는 형제 패키지를 `vitest.config.ts`를 통해 `src/`로 alias하므로, 순서는 `.d.ts` 출력에 영향을 줄 뿐 테스트 실행에는 영향을 주지 않습니다.

의존성을 추적할 때 주의할 두 소비자 함정: 가짜 `references/` 경로는 `packages/tex/scripts/vendor-katex.ts` (`--source`)와 `scripts/compare-pretext.ts` (`VECTO_PRETEXT_PATH`)에 하드코딩되어 있습니다 — 해당 트리를 이동하면 조용히 깨집니다 (`AGENTS.md` 참고).

## 16가지 난제 한눈에 보기

총 16개 문서: 이 개요(00)와 15개의 전문 난제(01–15)입니다. 난이도는 코드 양이 아니라 틀리기 쉬운 정도를 의미합니다. "첫 읽기"는 _유용한_ VectoJS 작업에 도달하는 가장 빠른 경로이며, "심화 선행"은 이 난제를 다루기 전에 읽어야 할 다른 난제를 의미합니다.

| #   | 난제 (딥다이브)                                     | 패키지                                                                        | 난이도 | 읽어야 할 대상                            | 심화 선행 | 첫 읽기 대상                            |
| --- | --------------------------------------------------- | ----------------------------------------------------------------------------- | ------ | ----------------------------------------- | --------- | --------------------------------------- |
| 00  | **개요 및 내비게이션** (이 문서)                    | — (메타)                                                                      | ☆      | 모두, 첫 번째 관문                        | —         | 오리엔테이션                            |
| 01  | **캔버스 네이티브 선택** — dual-world 동기화        | `core` (`ContentGridProjector`, `ContentProjectionManager`), `text`, `layout` | ★★★★   | 텍스트/선택/IME, 복사/찾기/번역           | 02        | 선택 가능한 텍스트, 터미널, 코드 에디터 |
| 02  | **텍스트 + Layout** — Unicode/BiDi/shaping/排版     | `text`, `layout`, `core/text`                                                 | ★★★★   | Layout 엔진, i18n, 타이포그래피           | —         | ASCII를 넘는 모든 텍스트                |
| 03  | **의미 투영 + 가상화** — 구체화 생명주기            | `core/a11y`, `ui`, `markdown`, `table`                                        | ★★★    | a11y, 가상화, 고밀도 문서                 | 06        | 대형 문서, 리스트, 대시보드             |
| 04  | **스트리밍 Markdown** — 점진적 reconcile            | `markdown`, `ui`, `layout`                                                    | ★★★    | 스트리밍/LLM UI                           | 02        | 채팅/스트리밍 리더                      |
| 05  | **Zero-DOM TeX** — layout + SVG 방출                | `tex`                                                                         | ★★★    | 수식 렌더링                               | 02        | Markdown 내 수식                        |
| 06  | **VMT 런타임** — dirty/invalidation/생명주기/이벤트 | `core/tree`, `core/layout`, `core`                                            | ★★★★   | Scene/Entity 생명주기, hit dispatch, 성능 | —         | 커스텀 entity, 성능 디버깅              |
| 07  | **렌더러** — 좌표/클립/DPR 일관성                   | `core/renderer`, `core/performance`                                           | ★★★    | 다중 백엔드, HiDPI, 컬링                  | 06        | canvas/WebGL/WebGPU 작업                |
| 08  | **WASM 삼총사 — G1/G2/G3** — 비트 동일 가속         | `crates/vectojs-core-rs`, `math`, `animation`, `graph-layout`, `core/wasm`    | ★★★    | 성능, Rust↔JS 패리티                      | 06, 07    | 대규모 프레임 예산                      |
| 09  | **Three.js / XR 브리지** — 두 좌표 세계             | `three`, `graph3d`                                                            | ★★     | 3D 패널, XR                               | 06, 07    | Three.js 안의 VectoJS                   |
| 10  | **결정적 비디오 내보내기** — 고정 스텝 클록         | `video-exporter`                                                              | ★★     | 오프라인 캡처, 리플레이                   | 06        | 화면 녹화, 시뮬레이션 내보내기          |
| 11  | **그래프 레이아웃** — force-directed + WASM         | `graph-layout`, `graph3d`, `knowledge-graph`                                  | ★★     | 그래프 시각화, 레이아웃 튜닝              | 06, 08    | 네트워크/지식 그래프                    |
| 12  | **DevTools** — 런타임 인트로스펙션 및 감사          | `devtools`, `core` (`frameStats`, `syncA11y`)                                 | ★      | 디버깅, CI 감사                           | 06        | "이 entity가 왜 여기에 있지"            |
| 13  | **스타일과 테마** — 수치형 VMT의 CSS 패리티         | `styles`, `core`                                                              | ★★     | 스타일, 테마, CSS 마이그레이션            | 06        | 토큰과 테마 전환                        |
| 14  | **반응형 레이아웃과 상호작용** — 뷰포트와 입력 대응 | `core`, `ui`, `layout`                                                        | ★★★    | 반응형 앱과 레이아웃 작성자               | 03, 06    | 적응형 Canvas UI                        |
| 15  | **버티컬 앱** — 그래프, 편집기, 데스크톱, 표 구성   | `knowledge-graph`, `node-editor`, `desktop`, `table`                          | ★★★    | 제품 및 통합 작성자                       | 06        | 엔진 프리미티브 구성                    |

순서 관련 참고:

- 02와 06은 00 다음에 꼭 두 개를 골라야 한다면 가장 좋은 "두 번째 읽기"입니다 — 다른 대부분의 난제가 둘 중 하나를 가정합니다.
- 03은 06의 dirty/생명주기 메커니즘에 기대고, 04는 02의 shaping/layout에 기대며, 07과 08 모두 06에 기대므로 자연스럽게 그 뒤에 모입니다.
- 08의 난이도는 Rust 문법이 아니라 **비트 동일 fallback 계약**과 그 빌드 함정(`crates/vectojs-core-rs/build.sh`의 `RUSTFLAGS`)에 있습니다.
- 팀 트래커는 이미 `CTX-0566→…→CTX-0578→CTX-0579`로 순서를 정했습니다; 위 표는 읽기 순서이며, 빌드/릴리즈 순서와 달라도 괜찮습니다.

## 모든 난제를 지배하는 세 가지 불변식

각 난제는 이 중 하나를 깰 수 있습니다. 다른 것은 잊어도 이 불변식만은 기억하세요.

### 1. VMT 생명주기 불변식

> entity의 **dirty 플래그, worldMatrix, 그리고 자식 리스트**는 모든 `Scene` 스텝 이후에 일치합니다.

깨졌을 때 증상: driver 등록 해제 없이 `remove(child)` 후 stale bounds(`Entity:1582`), 부분 `markDirty` 후 유령 hit 타깃, JS와 WASM SoA 저장소(`crates/vectojs-core-rs/src/*.rs`, G1) 사이에서 발산하는 transform. 가드: `Scene.ts:532` `renderMode` / `DirtyTracker.ts:33` 계약, `DriverTicker.ts:40` walk, `Entity.ts:782` 서브클래스 계약. "미스터리 렌더 글리치"의 90%는 여기에서 비롯됩니다.

### 2. Dual-world parity 불변식

> 모든 **보이는 인터랙티브** entity는 기하, role/name/state, 그리고 포커스/포인터 라우팅이 canvas 진실과 일치하는 **동기화된 a11y 대응 요소**를 가집니다.

깨졌을 때 증상: Playwright `getByRole`이 아무것도 찾지 못함, 스크린 리더가 오래된 텍스트를 읽음, 클릭이 잘못된 entity에 맞음, IME가 잘못된 박스에 나타남. 가드: `Entity.ts:295` `A11yAttributes`, `Entity.ts:968` `a11yProjection` 모드(`eager`/`onDemand`/`never`), `Entity.ts:1937` `getA11yAttributes()` 기본값, 공유 `syncA11y` walk(`A11yProjectionManager.ts:30`, `ContentProjectionManager.ts:26`), 그리고 `A11yProjectionManager.ts:227` stale-memo 무효화. `onDemand` 구체화와 뷰포트 가상화가 어려운 부분(난제 03) — 그리고 실제 VectoJS가 멈추는 지점도 대부분 여기입니다.

### 3. 텍스트 메트릭 불변식

> **한 번 측정하고, 여러 번 레이아웃하라** — 그리고 **실제** 폰트로, **올바른** 컨텍스트에서, **올바른** DPR로 측정하라.

깨졌을 때 증상: 텍스트가 hit 박스에서 어긋남, 선택 영역이 한 줄씩 어긋남, CJK 서브픽셀 간격이 흰 선으로 보임, 웹폰트 fallback이 advance를 조용히 바꿈, DPR 줌이 한 서브시스템만 흐리게 함. 가드: `packages/text/src/fontMetrics.ts:82` `registerFontMetrics`, `packages/text/src/Typography.ts:111` `ctx.measureText('Mg')` 및 DOM 없는 경우 `0.5em`으로의 fallback, `packages/text/src/measureContext.ts:12` 측정 컨텍스트 보정, `packages/layout/src/LayoutEngine.ts:808` `LayoutEngine` cold/hot 분리 및 단락 메모이제이션. 텍스트를 다루는 모든 난제(01, 02, 04, 05)는 서로 다른 각도에서 이 불변식에 재진입합니다.

리뷰 시 이 세 가지를 체크리스트로 유지하세요: 변경을 승인하기 전에 "이 변경이 어떤 불변식을 깰 수 있고, 어디서 가장 먼저 드러날까?"를 물어보세요.

## 기존 문서와 이 딥다이브의 관계

| 기존 문서                                                                                                                         | 딥다이브 (이 시리즈) | 관계                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `content/learn/*` (introduction, runtime-architecture, engine-concepts, text-typography, core-scene, accessibility, streaming 등) | 00–15                | **Learn은 VectoJS를 _사용하는_ 법을 가르칩니다**; 딥다이브는 그 사용법 **안에서 VectoJS가 _어떻게 동작하는지_**를 가르칩니다. learn 챕터를 먼저 읽으면 해당 난제가 더 쉬워집니다. 권장 짝: `text-typography` → 난제 02; `core-scene` + `events` → 난제 06; `accessibility` → 난제 03; `streaming` → 난제 04. |
| `content/reference/*` (core-a11y, core-entities, core-layout, core-text, ui-markdown, three-adapter, graph-layout 등)             | 00–15                | **Reference는 API 진실**입니다 (props, 타입, 서브패스). 딥다이브는 레퍼런스 페이지를 인용하지만 재진술하지 않습니다. 의심스러울 때는 레퍼런스 시그니처가 우선합니다.                                                                                                                                         |
| `forge/findings/*` + `forge/baselines/*`                                                                                          | 각 딥다이브의 부록   | Findings는 **현장 노트**이며, baselines는 **측정된 증거**입니다. 딥다이브는 난제별로 findings를 하나의 서사로 합성하고, 주장을 뒷받침한 `file:line` 항목으로 다시 연결합니다.                                                                                                                                |
| `vectojs/AGENTS.md` + `vectojs/README.md`                                                                                         | 00 (이 문서)         | 패키지 맵, 빌드 순서, 렌더/인터랙션 모델은 **AGENTS.md와 README.md에서 의미 그대로 복사**되었으며 `package.json`에 대해 검증되었습니다 — 지어낸 것이 아닙니다.                                                                                                                                               |

규칙: **권위 있는 쪽을 먼저 작성하세요**. 어떤 사실이 learn/reference 페이지와 딥다이브 양쪽에 등장한다면, learn/reference 페이지가 수정 대상입니다. `vectojs-docs/content`와 `vectojs-website/src/content` 사이에 `cp -r`를 절대 하지 마세요 (`AGENTS.md` 참고 — 포맷 드리프트 + 408개 i18n 파일).

## 읽기 경로 — 당신에게 맞는 경로를 고르세요

**"이제 막 합류했어요"** — 00 → 02 (text/layout) → 06 (VMT 생명주기) → 07 (렌더러) → 첫 과제와 가장 가까운 난제. 이틀 오후면 실제 PR을 만들 수 있습니다.

**"기능을 소유하고 있어요"** — 00 → 당신의 난제 → 심화 선행 행 → 해당 `content/learn/*` 챕터 → 그 난제의 `forge/findings/<area>.md`. 리뷰 전에 불변식 섹션을 다시 훑으세요.

**"성능을 소유하고 있어요"** — 00 → 06 → 07 → 08 (WASM G1/G2/G3) → 11 (graph) — 그 다음 `benchmarks/run-browsers.sh`와 `forge/baselines/*.json`. `run-browsers.sh` 숫자만 인용 가능합니다.

**"a11y / 고밀도 문서 / 테이블을 소유하고 있어요"** — 00 → 06 → 03 → (선택/복사가 표면에 중요하다면 01).

**"3D / XR / 그래프 시각화를 소유하고 있어요"** — 00 → 06 → 09 → 11 → (레이아웃 연산이 예산이라면 08).

각 딥다이브 frontmatter는 `order`, `package` 집합, `prereq` 목록을 선언하므로, 독자가 시리즈 중간에 뛰어들어도 Zola와 사이드바는 정렬을 유지합니다.

## 관례 및 검증 기준

- 모든 코드 참조는 `file:line`이며 `ctxctl outline` → `grep -rn` → `read`로 검증되었습니다 (기억에 의존하지 않음). 모호한 참조는 함수/클래스 이름을 포함합니다.
- Zola frontmatter는 모든 문서에 필수입니다 (`title`, `description`, `order`). 제목은 H2/H3 + fenced 코드 블록을 사용합니다 (전역 AGENTS.md 기준).
- 토큰/lint 게이트: 해당되는 경우 PR 전에 문서 변경에 대해 `just fmt` / `just check` 동등 명령을 실행하세요; `vectojs-docs` 쪽에서는 push 전에 `scripts/sync-content.py` 드리프트 검사를 실행하세요.
- 각 딥다이브는 ~600줄 이하, 이 개요는 ~400줄 이하로 유지하세요. 장황함보다 밀도를 우선하고, 중복 대신 링크하세요.

## 다음 단계

위에서 경로를 고르세요. 관례적인 다음 읽기는 텍스트를 다룬다면 **난제 01 — 캔버스 네이티브 선택**, 생명주기/이벤트를 다룬다면 **난제 06 — VMT 런타임**입니다 — 둘 다 더 어려운 쌍(02, 08)으로 가는 짧은 진입로입니다.

---

_시리즈: 00 개요 → 01 선택 → 02 텍스트+레이아웃 → 03 프로젝션+가상화 → 04 스트리밍 Markdown → 05 TeX → 06 VMT 런타임 → 07 렌더러 → 08 WASM G1/G2/G3 → 09 Three/XR → 10 비디오 내보내기 → 11 그래프 레이아웃 → 12 DevTools → 13 스타일 → 14 반응형 → 15 버티컬 앱 → 99 종합._
