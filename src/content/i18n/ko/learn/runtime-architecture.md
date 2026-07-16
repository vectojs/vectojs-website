---
title: '런타임 아키텍처'
description: 'Scene, Entity, 렌더 루프, 접근성 투영, 백엔드가 어떻게 함께 동작하는지 설명합니다.'
order: 3
---

# 런타임 아키텍처

VectoJS는 canvas당 하나의 `Scene`과 유지된(retained) `Entity` 인스턴스 트리를 중심으로 구성됩니다. 이 트리는 시각적 상태, 레이아웃 상태, 이벤트 동작, 시맨틱 메타데이터를 저장합니다.

<figure>
  <img src="/images/vmt-architecture.svg" alt="VMT 아키텍처 다이어그램: 엔티티 트리, canvas 렌더링, A11y 섀도우 레이어" class="diagram" />
  <figcaption>Scene은 Virtual Math Tree를 탐색하고, 픽셀을 canvas에 렌더링하며, 시맨틱을 DOM에 투영합니다.</figcaption>
</figure>

## Virtual Math Tree

각 엔티티는 다음을 가집니다:

- `x`, `y`, `scaleX`, `scaleY`, `rotation`, `opacity`;
- `width`와 `height`로 경계(bounds) 정의;
- `children` 배열;
- `update(dt, time)` — 상태 변경;
- `render(renderer)` — 로컬 좌표계에서 그리기;
- `isPointInside(globalX, globalY)` — 히트 테스트;
- 선택적 `getA11yAttributes()` — 투영된 시맨틱 정보.

변환(transform)은 트리 아래로 합성됩니다. 중첩되거나 변환된 엔티티를 히트 테스트할 때는 `worldToLocal()`을 사용하세요.

## 프레임 파이프라인

<figure>
  <iframe src="/sandbox/diagram-pipeline.html" class="diagram-frame" loading="lazy" title="VectoJS 렌더 루프: 하나의 더티 프레임이 거치는 여섯 단계를 VectoJS로 실시간 렌더링" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>하나의 더티 프레임: 업데이트, 컬링, 렌더링, 백엔드 배치 플러시, 투영된 DOM 동기화.</figcaption>
</figure>

## 접근성 투영

canvas 위에는 투명한 DOM 레이어가 위치합니다. 상호작용 가능한 엔티티는 `<button>`, `<input>`, `<a>`, 역할(role)을 가진 `<div>` 노드 같은 실제 요소를 투영할 수 있습니다.

이 레이어는 canvas UI가 다음과 같은 특성을 갖도록 합니다:

- 스크린 리더가 탐색 가능;
- 키보드 및 네이티브 폼 컨트롤로 조작 가능;
- Playwright 역할 선택자로 테스트 가능;
- DOM 시맨틱에 의존하는 AI 에이전트가 구동 가능.

투영은 디자인 검토를 대체하지 않습니다. 애플리케이션은 여전히 레이블, 포커스 순서, 키보드 동작, 명암비, reduced-motion 동작을 직접 관리해야 합니다.

## 렌더링 백엔드

| 백엔드              | 사용 시점                   | 기능                                       |
| ------------------- | --------------------------- | ------------------------------------------ |
| `CanvasRenderer`    | 기본값                      | 장치 픽셀 비율 스케일링이 적용된 Canvas 2D |
| WebGL 포인트 레이어 | `pointBackend: 'webgl'`     | 배치된 원/사각형 및 GPU 글리프 경로        |
| WebGPU 컴퓨트       | `particleBackend: 'webgpu'` | 폴백이 있는 컴퓨트 기반 파티클             |
| `SVGRenderer`       | `scene.toSVG()`             | 헤드리스 SVG 내보내기                      |

백엔드 선택은 백엔드가 병목 지점과 일치할 때만 효과적입니다. 텍스트 레이아웃이나 앱 연산이 병목이라면 Canvas를 WebGL로 변경해도 느린 경로가 개선되지 않습니다.

## 생명주기

```ts
const scene = new Scene(canvas, { maxFPS: 60 });
scene.renderMode = 'onDemand';
scene.resize(width, height);
scene.start();

// later
scene.destroy();
```

호스트 컴포넌트가 언마운트될 때는 반드시 씬을 destroy하세요. 하나의 씬은 렌더러 리소스, 옵저버, 워커, 투영된 DOM, 이벤트 상태를 소유합니다.

## 다음 단계

- [엔진 개념](/learn/engine-concepts/) — 수학적 기둥들을 설명합니다.
- [코어 씬](/learn/core-scene/) — 실제 API를 보여줍니다.
