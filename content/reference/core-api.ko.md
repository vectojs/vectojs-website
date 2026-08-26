+++
title = "@vectojs/core API 레퍼런스"
description = "Vecto 뒤에 있는 제로-DOM 렌더링 엔진의 개요 및 진입점 맵 — 코어의 Scene, Entity, 렌더러, 파티클, a11y와 함께, 코어가 재-내보내기하는 독립형 @vectojs/text, @vectojs/layout, @vectojs/math, @vectojs/animation 엔진."
weight = 1
+++

# `@vectojs/core` API 레퍼런스

Vecto의 제로-DOM 렌더링 엔진입니다. `Scene`은 `Entity` 노드의 트리(**Virtual Math Tree**)를 소유하고,
`requestAnimationFrame` 루프를 구동하며, 백엔드에 독립적인 `IRenderer`(기본값 Canvas 2D)를 통해
그리고 투명한 ARIA/자동화 섀도우 레이어를 투영하여 캔버스가 접근 가능하고
에이전트가 구동할 수 있도록 유지합니다.

> 이 페이지와 하위 페이지는 게시된 `.d.ts`(공개 표면)와
> `packages/core/src` 소스(동작)에서 생성됩니다. 여기의 시그니처는
> 내러티브 `docs/usage/*` 가이드의 내용보다 우선합니다 — 특히
> 실제 생성자는 `new Scene(canvasElement, options)`이며,
> 일부 오래된 문서에 있는 `{ canvasId }` 형식이 **아닙니다**.

## 참조 페이지

아래 각 영역은 자체 페이지 — 시그니처, 주의사항 및
"관련 항목" 푸터를 통해 서로 연결됩니다:

| 영역                                                  | 다루는 내용                                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [`Scene`](/reference/core-scene/)                     | 생성자, `SceneOptions`, 공개 필드, `renderMode`/`maxFPS`/유휴 스로틀, 생명주기 메서드, 백엔드 레지스트리.                |
| [`Entity`](/reference/core-entity/)                   | 추상 VMT 노드: 변환, 애니메이션 시스템, 캡처/버블 이벤트, a11y/배치 훅.                                                  |
| [레이아웃 엔진](/reference/core-layout/)              | `LayoutEngine`의 콜드/핫 분할, 스트리밍 메모이제이션, 리치 텍스트, 배제(Exclusion) 셰이프.                               |
| [렌더러](/reference/core-renderer/)                   | `IRenderer`, `CanvasRenderer`, `SVGRenderer`, WebGL 포인트/직렬/스프라이트/MSDF 레이어, 콘텐츠 투영, `parseColorToRGBA`. |
| [`ComputeParticleEntity`](/reference/core-particles/) | 고처리량 파티클 레이어: 메모리 레이아웃, CPU 시뮬레이션, WebGPU vs CPU.                                                  |
| [텍스트 및 Bidi](/reference/core-text/)               | `MSDFFont`, `MSDFTextEntity`, `TextEntity`/`GridTextEntity`, 아랍어 쉐이핑 및 bidi 리졸버.                               |
| [기타 엔터티](/reference/core-entities/)              | `SplineEntity`, `DOMPortalEntity`, `SVGEntity`.                                                                          |
| [수학 유틸리티](/reference/core-math/)                | `SpatialHashGrid`, `SpringPhysics`.                                                                                      |
| [애니메이션](/reference/animation/)                   | 독립형 `@vectojs/animation` 엔진: `TweenDriver`/`SpringDriver`, `MotionConfig`, 이징 곡선.                               |
| [스타일](/reference/styles/)                          | 독립형 `@vectojs/styles` 레이어: CSS 명명 스타일 객체, `var()` 토큰 테마, `setTheme` 전환, `css()` 병합.                 |
| [a11yRoot 및 에이전트 계약](/reference/core-a11y/)    | 섀도우-DOM 투영, `A11yAttributes`, 동기화 주의사항.                                                                      |

## 진입점 및 모듈 맵

레이아웃, 텍스트 셰이핑, 수학, 애니메이션 엔진은 각각 자체 독립형
패키지로 게시됩니다. `@vectojs/core`는 이들 모두에 **의존하고 재-내보내기**하므로
아래의 모든 임포트는 여전히 `@vectojs/core`에서(그리고 트리-쉐이커블
하위 경로에서) 해석됩니다. 씬 그래프 런타임 없이 더 작은 의존성 표면을
원할 때는 독립형 패키지에서 직접 임포트하세요.

`@vectojs/core`는 하나의 부수 효과가 있는 메인 진입점과 세 개의 트리-쉐이커블
하위 경로를, 네 개의 독립형 패키지와 함께 제공합니다:

| 임포트                   | 내용                                                                                                                                                                                    | 부수 효과                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `@vectojs/core` (`.`)    | 전체: `Scene`, `Entity`, 모든 엔터티, 렌더러, 그리고 재-내보내기된 레이아웃, 텍스트, 수학, 애니메이션 엔진.                                                                             | 임포트 시 **두** 플러그형 백엔드(WebGL 포인트 렌더러 + WebGPU 파티클 관리자)를 자동 등록합니다. |
| `@vectojs/core/layout`   | `@vectojs/layout` 재-내보내기: `LayoutEngine`, `PreparedText`, `createCanvasMeasurer`, `LayoutResultBuffer`, `LayoutWorkerManager`, `computeLineSegments`, 레이아웃 타입.               | 없음.                                                                                           |
| `@vectojs/core/renderer` | `IRenderer`, `CanvasRenderer`, `SVGRenderer`, `PointRenderer`, `createWebGLPointRenderer`, `WebGPUParticleSystemManager`, `parseColorToRGBA`, `RGBA`.                                   | 없음.                                                                                           |
| `@vectojs/core/text`     | `@vectojs/text`와 코어-상주 `MSDFTextEntity`/`SVGEntity` 재-내보내기: `MSDFFont`, `ArabicShaper`, `BidiResolver`, `Typography`, `prepareContentGrid`, `PreparedContentGrid`, MSDF 타입. | 없음.                                                                                           |
| `@vectojs/text`          | 독립형 텍스트 셰이핑 프리미티브: `BidiResolver`, `ArabicShaper`, `Typography`, `MSDFFont`, `prepareContentGrid`, `PreparedContentGrid`. 리프 패키지(`bidi-js`만 의존).                  | 없음.                                                                                           |
| `@vectojs/layout`        | 독립형 레이아웃 엔진: `LayoutEngine`, `LayoutWorkerManager`, `createCanvasMeasurer`, 측정 헬퍼. `@vectojs/text`에 의존.                                                                 | 없음.                                                                                           |
| `@vectojs/math`          | 독립형 공간/물리 수학: `SpatialHashGrid`, `SpringPhysics`. 리프 패키지.                                                                                                                 | 없음.                                                                                           |
| `@vectojs/animation`     | 독립형 이징 + 드라이버: `Easing`, `TweenDriver`, `SpringDriver`. `@vectojs/math`에 의존.                                                                                                | 없음.                                                                                           |

**주의사항:** 백엔드 자동 등록은 `.` 진입점에만 존재합니다
(`Scene.registerWebGLPointRendererCreator(createWebGLPointRenderer)`와
`Scene.registerWebGPUParticleSystemManager(WebGPUParticleSystemManager)`가
임포트 시 실행됨). 하위 경로만 임포트한 후 `Scene`을 생성하는 경우
백엔드를 직접 등록하거나 `pointBackend: 'webgl'` / WebGPU 파티클이
조용히 폴백됩니다. 레지스트리 API는 [`Scene`](/reference/core-scene/)을 참조하세요.

## 권장 문서 사이트 페이지 (코어)

- **Learn / Core concepts** — Scene, Virtual Math Tree, 렌더 루프,
  `IRenderer`, 제로-DOM 모델.
- **Learn / Render modes & performance** — `always` vs `onDemand`, `maxFPS`,
  유휴 2-fps 스로틀과 `markDirty()`-프레임 간 규칙, reduced motion.
- **Learn / Building a custom Entity** — `isPointInside`/`render`, 변환,
  `getBounds` 컬링, `getBatchCircle`/`getBatchRect` 고속 경로.
- **Learn / Events & hit-testing** — 캡처/버블, `VectoJSEvent`,
  `findEntityAt`, 폼-컨트롤 `change`/IME.
- **Learn / Accessibility & automation** — 섀도우-DOM 계약,
  `getByRole` 기반 에이전트, `debugA11y`, 스로틀링.
- **Learn / Text & typography** — 콜드/핫 `LayoutEngine` 분할, 스트리밍
  메모이제이션, MSDF 텍스트, 배제(Exclusion)/줄바꿈, bidi.
- **Learn / Particles** — `ComputeParticleEntity`, WebGPU vs CPU, 8-float
  레이아웃, `resize()` 우선.
- **Reference / API** — 위 하위 페이지들(Scene, Entity, 레이아웃 엔진,
  렌더러, 파티클, 텍스트, 수학 유틸리티, a11y 계약).
- **Reference / Backend registry** — 플러그형 WebGL/WebGPU 백엔드,
  [`Scene`](/reference/core-scene/#peulreogeuhyeong-baegendeu-rejiseuteuri-jeongjeog)에서 다룹니다.
