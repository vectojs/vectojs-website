+++
title = "기타 엔터티"
description = "Rect/Circle/Group 셰이프 기본 요소와 SplineEntity(vectomancy 커브 렌더링), DOMPortalEntity(실제 DOM 엘리먼트를 Scene에 투영), SVGEntity(래스터화된 SVG 블리팅) — 모두 @vectojs/core 메인 진입점에서 제공됩니다."
weight = 8
+++

# 기타 엔터티 (`.`에서)

[`@vectojs/core`](/reference/core-api/)의 일부입니다.

## Rect, Circle, Group (기본 요소)

_`@vectojs/core` 1.9.0에 추가됨._ 간단한 박스, 점 또는 변환 컨테이너를 위해 더 이상 별도의
[`Entity`](/reference/core-entity/) 서브클래스가 필요하지 않도록 하는 즉시 인스턴스화 가능한 세 가지 엔터티입니다.

```ts
import { Rect, Circle, Group } from '@vectojs/core';

const box = new Rect({ width: 120, height: 64, fill: '#38bdf8', radius: 8 });
const dot = new Circle({ radius: 24, fill: '#f97316' });
const toolbar = new Group(saveBtn, undoBtn, redoBtn); // 변환 전용 컨테이너
toolbar.set({ x: 20, y: 20 });
scene.add(box, dot, toolbar); // 가변 인자 add()
```

**`Rect`** — 로컬 `(0,0)`에서 `(width, height)`까지의 축-정렬 직사각형.

| `RectOptions` | 기본값      | 효과                                             |
| ------------- | ----------- | ------------------------------------------------ |
| `width`       | `0`         | 로컬 너비; 엔터티 히트/a11y 박스와 일치합니다.   |
| `height`      | `0`         | 로컬 높이.                                       |
| `fill`        | `'#38bdf8'` | CSS 채우기, 또는 `null`(명시적 `null`은 유지됨). |
| `stroke`      | `null`      | CSS 선, 또는 `null`.                             |
| `strokeWidth` | `1`         | 선 두께(로컬 단위).                              |
| `radius`      | `0`         | 균일 모서리 반경; `0` = 날카로운 모서리.         |

단색 채우기, 직각 모서리, 선이 없는 `Rect`는 WebGL
인스턴스드-렉트 고속 경로(`getBatchRect`, `pointBackend: 'webgl'` 전용)를 선택합니다.
선이나 모서리 반경이 있으면 정확한 Canvas 경로를 통해 렌더링됩니다.

**`Circle`** — 로컬 원점 `(0,0)`을 중심으로 한 원반. a11y 섀도우 박스는
그려진 원반을 덮도록 `-radius`만큼 오프셋된 경계 정사각형입니다.

| `CircleOptions` | 기본값      | 효과                                            |
| --------------- | ----------- | ----------------------------------------------- |
| `radius`        | `0`         | 반경(로컬 단위). 설정 시 박스가 재동기화됩니다. |
| `fill`          | `'#38bdf8'` | CSS 채우기, 또는 `null`.                        |
| `stroke`        | `null`      | CSS 선, 또는 `null`.                            |
| `strokeWidth`   | `1`         | 선 두께(로컬 단위).                             |

단색 채우기, 선이 없는 `Circle`은 원 포인트-배치 고속 경로
(`getBatchCircle`)를 선택합니다. 선이 있는 원은 정확한 Canvas 경로를 통해 렌더링됩니다.

**`Group`** — 변환 전용 컨테이너: 아무것도 그리지 않으며 히트 테스팅에
보이지 않습니다(`isPointInside`가 `false` 반환). 하나의 변환
(`x`/`y`/`scale`/`rotation`/`opacity`)을 자식에 적용하기 위해서만 존재합니다. Scene의
히트 테스트는 자식부터 먼저 재귀하므로 자식은 독립적으로 상호작용 가능합니다.
자식을 인라인으로 전달: `new Group(a, b, c)`.

[`Entity.set()`](/reference/core-entity/) 및 가변 인자
[`add()`](/reference/core-entity/)도 참조하세요 — 이 기본 요소들과 함께 사용하도록 설계된 인체공학적 헬퍼입니다.

## SplineEntity + loadSpline

```ts
loadSpline(url: string): Promise<SplineDocument>     // vectomancy Spline JSON 가져오기 + 파싱 (브라우저)
new SplineEntity(doc: SplineDocument, opts?: SplineOptions)
polySegmentToBezier(seg: SplineSegment): BezierControlPoints
```

네이티브 vectomancy 조각별-3차 `Spline`/`Polyline` 문서를 렌더링합니다. 범위는
`bounding_box`에서 가져오거나(세그먼트 끝점에서 계산) 뷰포트 컬링에 참여합니다.

| `SplineOptions` | 기본값      | 효과                                                                                    |
| --------------- | ----------- | --------------------------------------------------------------------------------------- |
| `lineWidth`     | `2`         | 선 두께(로컬 단위).                                                                     |
| `cache`         | `true`      | 한 번 `OffscreenCanvas`로 굽고 매 프레임 블리트(캐싱 없으면 프레임별 Bézier 선 그리기). |
| `defaultColor`  | `'#e2e8f0'` | 방정식의 `color_rgb`가 `null`일 때 사용됩니다.                                          |
| `hitTest`       | `'curve'`   | `'curve'` = 정밀(커브로부터 `lineWidth/2 + hitTolerance` 이내); `'aabb'` = 경계 상자.   |
| `hitTolerance`  | `0`         | `'curve'` 모드에서 추가 선택 여백.                                                      |

공개: `doc`, `lineWidth`, `defaultColor`, `hitTolerance`, `showBounds`
(기본값 `false`, 디버그 외곽선 그리기). `SplineColor`는 `[r,g,b]` (0–1),
선형-그라데이션 디스크립터 또는 `null`입니다.

**`SplineEquation`** — `SplineDocument`의 한 곡선(한 획 색상)으로, 연속된 3차 다항식 세그먼트로 구성됩니다:

```ts
interface SplineEquation {
  color_rgb: SplineColor; // stroke color: [r,g,b] (0-1) | gradient | null
  data: SplineSegment[]; // one segment per piecewise-cubic run
}

interface SplineSegment {
  start_t: number; // t at segment start, [0,1]
  end_t: number; // t at segment end, [0,1]
  x_poly: number[]; // x(t) = [a,b,c,d] coefficients
  y_poly: number[]; // y(t) = [a,b,c,d] coefficients
}
```

세그먼트의 `x_poly`/`y_poly`는 `t ∈ [start_t, end_t]`에서 `f(t) = a + b·t + c·t² + d·t³`의 다항식 계수를 보관합니다. 세그먼트를 Bézier로 검사하거나 히트 테스트하려면 `polySegmentToBezier(seg)`가 이를 `BezierControlPoints`(`x0,y0,cp1x,cp1y,cp2x,cp2y,x3,y3`)로 변환합니다 — 이것은 `SplineEntity` 자체가 렌더링을 위해 평탄화하는 형태입니다.

## DOMPortalEntity

```ts
new DOMPortalEntity(domElement: HTMLElement, width?, height?, id?)
```

엔터티를 따라 위치/변환되는(`matrix(...)` + 상속된 불투명도 + 페인트 순서의 z-index)
**실제** DOM 엘리먼트를 포털 레이어에 투영합니다. 리프 노드 —
`add()`는 경고를 출력하고 자식 엔터티는 지원되지 않습니다. 네이티브 포인터/휠/
포커스 이벤트를 `VectoJSEvent`로 전달합니다. `width`/`height`가 0일 때
`ResizeObserver`를 사용하여 고유 크기(`cachedWidth`/`cachedHeight`)를 캐싱합니다. `destroy()`는
리스너, 옵저버 및 엘리먼트를 분리합니다.

## SVGEntity (`@vectojs/core/text`에서)

```ts
new SVGEntity(svgSource: string, id?)
setSVGSource(svgSource: string): void
```

SVG 문자열을 `ImageBitmap`/이미지로 래스터화하여 블리트하며, 대상
스케일(LOD)로 재래스터화하여 확대해도 선명하게 유지됩니다. `scene.toSVG()`는
퍼센트 인코딩된 소스를 불활성 URL 플레이스홀더 대신
격리된 중첩 SVG 이미지로 임베드합니다. 로컬 공간에서 AABB 히트 테스트.

## 관련 항목

[`Entity`](/reference/core-entity/) (이 각각이 확장하는 기본 클래스) ·
[`@vectojs/core` 개요](/reference/core-api/)
