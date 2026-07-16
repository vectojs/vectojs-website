---
title: 'VectoJS 소개'
description: 'VectoJS가 무엇인지, 어떤 용도로 사용되는지, 그리고 다음 단계에 대한 간결한 개요입니다.'
order: 1
---

# VectoJS 소개

**VectoJS**는 시각적 또는 상호작용 복잡도가 "요소 하나당 DOM 요소 하나" 모델에 적합하지 않은 인터페이스를 위한 canvas-네이티브 UI 런타임입니다. 가시적 트리를 JavaScript 엔티티 그래프 — **Virtual Math Tree** — 로 유지하고, 그 결과를 canvas-기반 레이어에 렌더링합니다.

상호작용 가능한 컴포넌트는 실제 시맨틱 DOM 노드(`<button>`, `<input>`, `<a>` 등)를 canvas 위에 투영(projection)할 수 있습니다. 이 투영 덕분에 VectoJS 컨트롤은 접근성, 네이티브 입력 지원, 역할 기반 자동화를 통한 테스트 가능성을 확보합니다.

<figure>
  <img src="/images/intro-runtime-map.svg" alt="애플리케이션 상태가 Virtual Math Tree로 흘러들어간 후, 레이아웃, 히트 테스트, canvas 또는 GPU 렌더링, 시맨틱 DOM 투영으로 이어지는 VectoJS 런타임 맵." class="diagram" />
  <figcaption>애플리케이션 상태는 하나의 유지된(retained) 씬 그래프를 업데이트하고, 그래프는 픽셀, 레이아웃, 이벤트, 시맨틱을 구동합니다.</figcaption>
</figure>

## 다음에 읽을 내용

기존의 단일 페이지 소개는 주제별 장으로 분리되었습니다:

| 이해하고 싶은 내용                                  | 읽을 문서                                       |
| --------------------------------------------------- | ----------------------------------------------- |
| VectoJS가 존재하는 이유와 DOM이 적합하지 않은 경우  | [왜 VectoJS인가](/learn/why-vectojs/)           |
| 런타임, 렌더 루프, 시맨틱 투영이 함께 작동하는 방식 | [런타임 아키텍처](/learn/runtime-architecture/) |
| 구현 뒤에 있는 8가지 핵심 수학/엔진 개념            | [엔진 개념](/learn/engine-concepts/)            |
| 적합한 제품군과 그렇지 않은 제품군                  | [사용 사례](/learn/use-cases/)                  |
| 첫 번째 실행 씬을 만드는 방법                       | [시작하기](/learn/getting-started/)             |

## 요약

다음 상황에서 VectoJS를 사용하세요:

- 수천 개의 시각적 엔티티를 수천 개의 스타일 DOM 노드 없이 다뤄야 할 때;
- 정밀한 변환, 곡선, 히트 테스트, 수학적 레이아웃이 필요할 때;
- canvas-규모의 시각 표현에 역할 기반 접근성 및 자동화가 필요할 때;
- 대용량 데이터, 스트리밍 UI, 게임, 다이어그램, WebXR 패널을 다룰 때;
- 테스트, 시뮬레이션, 비디오 내보내기를 위한 결정론적 스테핑이 필요할 때.

문서 중심 사이트, SEO 중심 콘텐츠, 일반적인 폼, 또는 맞춤형 레이아웃 수학이 필요하지 않은 UI를 구축한다면 일반 HTML/CSS를 우선 사용하세요.

## 패키지 맵

| 패키지                    | 용도                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `@vectojs/core`           | `Scene`, `Entity`, 레이아웃, 텍스트, 렌더러, 이벤트, a11y 투영, 수학 유틸리티                  |
| `@vectojs/ui`             | 고수준 컴포넌트: `Button`, `Input`, `Toggle`, `Markdown`, `ScrollView`, `Dropdown`, `Table` 등 |
| `@vectojs/three`          | VectoJS 씬을 Three.js 텍스처에 투영하고 광선캐스트 입력을 다시 2D로 라우팅                     |
| `@vectojs/video-exporter` | VectoJS 씬을 위한 고정-스텝 Chromium + FFmpeg H.264 내보내기                                   |

## 개념 모델

VectoJS는 React 대체제도, ECS도, 제로 할당을 주장하지도 않습니다. 이는 유지-모드(retained-mode) canvas UI 런타임입니다:

1. 애플리케이션 상태가 엔티티를 업데이트하고;
2. 엔티티가 레이아웃, 변환, 히트 테스트, 시맨틱을 계산하며;
3. 더티(dirty) 씬이 선택된 백엔드를 통해 렌더링되고;
4. 투영된 DOM 노드가 보조 기술 및 에이전트에 상호작용 표면을 노출합니다.

이 가이드의 나머지 부분에서는 이러한 트레이드오프를 자세히 살펴봅니다.

## 다음 단계

- [왜 VectoJS인가](/learn/why-vectojs/) — 문제 공간과 트레이드오프.
- [시작하기](/learn/getting-started/) — 설치 및 첫 번째 씬 생성.
- [코어 씬](/learn/core-scene/) — 렌더 루프, 엔티티, 변환 심층 탐구.
