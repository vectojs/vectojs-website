+++
title = "엔진 개념"
description = "VectoJS의 기반이 되는 여덟 가지 수학적, 아키텍처적 아이디어."
weight = 4
+++

# 엔진 개념

VectoJS는 적은 수의 수학 및 런타임 아이디어 위에 구축되었습니다. 이 페이지는 전체 지도 역할을 하며, 더 깊이 있는 유도 과정은 [수학적 기초](/learn/math-foundations/)에서 확인할 수 있습니다.

<figure>
  <img src="/images/engine-concepts-map.svg" alt="개념 지도: Virtual Math Tree를 중심으로 아핀 변환, 히트 테스트, 콜드/핫 레이아웃, 집합-차분 텍스트 흐름, 시맨틱 투영, 스프링 모션, SpatialHashGrid가 연결된 구조." class="diagram" />
  <figcaption>Virtual Math Tree는 허브이며, 변환, 레이아웃, 히트 테스트, 모션, 시맨틱 투영이 런타임의 스포크(spoke) 역할을 합니다.</figcaption>
</figure>

## 1. Virtual Math Tree

VMT는 시각적 DOM 서브트리를 지역 좌표계의 JavaScript 씬 그래프로 대체합니다. 탐색, 히트 테스트, 접근성 동기화는 여전히 실제 작업이지만, 시각적 레이아웃이 엔티티별 브라우저 스타일 및 리플로우를 피할 수 있습니다.

- 이론: [수학적 기초: VMT](/learn/math-foundations/#1-virtual-math-tree-vmt)
- 실습: [코어 씬](/learn/core-scene/)

## 2. 시맨틱 투영 오버레이

적격한 상호작용 엔티티는 실제 투명 DOM 노드를 canvas 경계 위에 투영합니다. canvas는 픽셀을 소유하고, DOM 투영은 역할/이름/상태 및 네이티브 입력 동작을 소유합니다.

- 이론: [수학적 기초: a11yRoot](/learn/math-foundations/#2-simaentig-shadow-dom-a11yroot)
- 실습: [접근성](/learn/accessibility/)

## 3. 아핀 변환

엔티티의 이동, 크기 조절, 회전은 트리 아래로 합성됩니다. `worldToLocal()`은 변환을 해석적으로(invert) 변환하여 포인터 이벤트를 대상 엔티티의 로컬 좌표계에 매핑할 수 있게 합니다.

- 이론: [수학적 기초: 아핀 변환](/learn/math-foundations/#3-apin-byeonhwan)

## 4. 콜드/핫 레이아웃

텍스트 레이아웃은 비용이 큰 콘텐츠 준비와 반응형 줄바꿈을 분리합니다. 콘텐츠 변경은 콜드 경로를, 너비 변경은 준비된 측정값을 재사용할 수 있습니다.

- 이론: [수학적 기초: 콜드/핫 분할](/learn/math-foundations/#4-cold-hot-bunhal-reiaus-enjin)
- 실습: [텍스트 및 타이포그래피](/learn/text-typography/)

## 5. 집합-차분 텍스트 흐름

장애물 주변의 텍스트 흐름은 구간 차분(interval subtraction)으로 모델링할 수 있습니다:

$$I_{\\text{allowed}} = I_0 \\setminus \\bigcup E_k$$

- 이론: [수학적 기초: 집합-차분 대수](/learn/math-foundations/#5-tegseuteu-heureumeul-wihan-jibhab-cabun-daesu)

## 6. 샘플링된 스플라인 히트 테스트

`SplineEntity`는 곡선을 캐시된 선분으로 샘플링하고, 포인터 거리의 제곱을 해당 선분과 비교합니다. 이 방식은 픽셀 읽기를 피하면서 AABB만 사용하는 히트 테스트보다 더 정밀합니다.

- 이론: [수학적 기초: 샘플링된 스플라인 히트 테스트](/learn/math-foundations/#6-saempeulringdoen-seupeulrain-hiteu-teseuting)

## 7. 반-암시적 오일러 동역학

중단된 UI 전환은 일회성 CSS 타이머 대신 스프링 계 시스템으로 모델링됩니다. 목표값이 전환 중간에 변경되어도 모션이 연속성을 유지합니다.

- 이론: [수학적 기초: ODE 동역학](/learn/math-foundations/#7-mibun-bangjeongsig-mic-semi-implicit-euler-solbeo)
- 실습: [물리 및 애니메이션](/learn/physics-engine/)

## 8. SpatialHashGrid 유틸리티

VectoJS는 애플리케이션 소유의 근접 질의(proximity query)를 위해 고정-셀 `SpatialHashGrid`를 내보냅니다. Scene이 모든 엔티티에 대해 자동으로 이 그리드를 채우지는 않습니다.

- 이론: [수학적 기초: SpatialHashGrid 유틸리티](/learn/math-foundations/#8-spatialhashgrid-yutilriti)
- 실습: [성능](/learn/performance/)

## 다음 단계

- [런타임 아키텍처](/learn/runtime-architecture/) — 이 개념들을 프레임 파이프라인과 연결합니다.
- [수학적 기초](/learn/math-foundations/) — 공식에 대한 더 깊은 설명을 제공합니다.
