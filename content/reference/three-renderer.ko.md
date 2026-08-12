+++
title = "ThreeRenderer"
description = "VectoJS Scene의 IRenderer 백엔드로 Three.js 사용: 구현된 메서드, GLSL 그래디언트 셰이더 레이아웃, 라인폭 주의사항."
weight = 43
+++

# `ThreeRenderer`

[`@vectojs/three`](/reference/three/)의 일부입니다.

`ThreeRenderer`는 Three.js를 사용하여 [`@vectojs/core`](/reference/core-renderer/)의 `IRenderer` 인터페이스를 구현합니다 — 채우기, 선, 텍스트가 Canvas 2D 연산 대신 정사영 씬의 Three.js 메시와 라인으로 렌더링됩니다. Three.js가 이미 프로젝트에 있고 VectoJS 씬 자체를 Canvas 2D 대신 WebGL 파이프라인으로 렌더링하려는 경우 사용하세요.

## 사용 시기

- VectoJS의 2D 콘텐츠가 제공된 캔버스용 전용 `THREE.WebGLRenderer`를 통해 Three.js 객체로 렌더링되길 원할 때.
- GLSL 셰이더로 구동되는 하드웨어 가속 그래디언트 채우기가 필요할 때.
- 순수 WebGL 2D 파이프라인을 벤치마킹하거나 실험할 때.

2D UI를 3D 표면에 임베딩하려면 [`ThreeAdapter`](/reference/three-adapter/)를 대신 사용하는 것이 좋습니다 — Canvas 2D 렌더링을 포기할 필요가 없습니다.

## 생성자

```ts
new ThreeRenderer(canvas: HTMLCanvasElement)
```

생성:

- `{ canvas, alpha: true, antialias: true }` 옵션의 `THREE.WebGLRenderer`
- Y축이 아래를 가리키는(상단 = 0, 하단 = height) `THREE.OrthographicCamera`로 VectoJS 좌표계와 일치
- 픽셀 비율이 `window.devicePixelRatio`로 자동 설정되며, 런타임에서 변경될 때 **동기화된 상태로 유지됩니다** (아래 참조)

`ThreeRenderer`는 이 WebGLRenderer를 생성하고 소유합니다; 기존 렌더러/컨텍스트를 받거나 재사용하지 않습니다. `dispose()`는 활성 객체를 제거하고, geometry/material/texture 리소스를 해제하며, 스택을 초기화하고, 소유한 WebGLRenderer를 정확히 한 번 폐기합니다. 또한 아래에 설명된 컨텍스트 손실 및 DPR 리스너를 분리하므로, 폐기된 렌더러는 늦은 이벤트에 의해 부활할 수 없습니다.

## GPU 컨텍스트 손실 및 런타임 DPR

GPU 리셋이나 메모리 압력 제거가 없으면 Three로 구동되는 씬이 영구적으로 빈 상태로 남고, 모니터 이동이나 브라우저 확대/축소가 오래된 픽셀 비율로 렌더링되게 됩니다(흐릿하거나 계단 현상). `ThreeRenderer`는 둘 다 처리합니다:

- **`webglcontextlost`**는 `preventDefault()`됩니다 — 필수이며, 그렇지 않으면 브라우저가 복원 이벤트를 결코 발생시키지 않습니다 — 그리고 `isContextLost()`를 토글합니다. 손실 중에는 `present()`가 no-op이 됩니다. 죽은 컨텍스트에 대해 그리는 것이 무의미하기 때문입니다.
- **`webglcontextrestored`**는 픽셀 비율과 크기를 재적용합니다(복원이 다른 디스플레이에 올 수 있음), 플래그를 지우고 새로 지워진 프레임버퍼의 다시 그리기를 강제합니다. Three의 `WebGLRenderer`는 다음 렌더링 시 GL 상태를 지연적으로 재구축합니다.
- **DPR 변경**은 `(resolution: Ndppx)` 미디어 쿼리로 추적되며, `setPixelRatio` + `setSize`를 재적용하고 자체를 재무장합니다(쿼리는 일회성).

모두 SSR / `OffscreenCanvas`를 위해 보호됩니다(`addEventListener` 또는 `matchMedia` 없음). `isContextLost()`는 선택적 [`IRenderer`](/reference/core-renderer/#gpu-컨텍스트-손실에서-살아남기) 훅도 충족하므로, `Scene.render`는 컨텍스트가 없는 동안 해당 패스를 건너뜁니다.

## Public 속성

| 속성              | 유형                       |
| ----------------- | -------------------------- |
| `scene`           | `THREE.Scene`              |
| `camera`          | `THREE.OrthographicCamera` |
| `renderer`        | `THREE.WebGLRenderer`      |
| `isContextLost()` | `() => boolean`            |

## 사용법

렌더러를 VectoJS `Scene` 생성자의 `renderer` 옵션으로 전달하세요:

```ts
import { Scene } from '@vectojs/core';
import { ThreeRenderer } from '@vectojs/three';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const threeRenderer = new ThreeRenderer(canvas);

const scene = new Scene(canvas, { renderer: threeRenderer });
scene.add(/* entities */);
scene.start();
```

## 구현된 IRenderer 메서드

| 메서드                                                                                    | 설명                                                                                                                                       |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `beginPath()` `moveTo()` `lineTo()` `bezierCurveTo()` `closePath()` `arc()` `roundRect()` | 경로 누적; `fill()` 또는 `stroke()`에서 플러시됨.                                                                                          |
| `fill(colorOrGradient)`                                                                   | `MeshBasicMaterial`을 통한 단색 채우기; GLSL `ShaderMaterial`을 통한 그래디언트(아래 참조). CSS 색상 알파가 상속된 렌더러 알파에 곱해짐.   |
| `stroke(colorOrGradient, lineWidth?)`                                                     | `LineBasicMaterial`. 아래 라인폭 주의사항 참조.                                                                                            |
| `fillText(text, x, y, font, color)`                                                       | 텍스트를 오프스크린 캔버스에 렌더링하고 `THREE.CanvasTexture`로 업로드. 그래디언트는 첫 번째 색상 중단점으로 대체됨.                       |
| `fillCircle(cx, cy, radius, color, alpha?)`                                               | 32개 세그먼트의 `THREE.CircleGeometry` + `MeshBasicMaterial`.                                                                              |
| `drawImage(source, dx, dy, dw, dh)`                                                       | `THREE.CanvasTexture` + `PlaneGeometry`.                                                                                                   |
| `save()` `restore()` `translate()` `scale()` `rotate()` `setGlobalAlpha()` `clip()`       | 변환/알파 스택; 중첩된 클립은 교차(intersect)됩니다. 가위 클립은 변환된 월드 AABB를 사용하므로, 회전/기울어진 클립은 축-정렬 근사치입니다. |
| `createLinearGradient(x0, y0, x1, y1, colorStops)`                                        | `fill()`에서 사용하는 `WebGLGradient` 기술자를 반환합니다.                                                                                 |
| `flush()`                                                                                 | `renderer.render(scene, camera)`를 호출합니다.                                                                                             |
| `resize(width, height)`                                                                   | `renderer.setSize()`를 업데이트하고 카메라 경계를 재계산합니다.                                                                            |
| `clear()`                                                                                 | 프레임 geometry/materials를 폐기하고 경로, 변환, 알파 및 가위-스택 상태를 초기화합니다.                                                    |

## 라인폭 주의사항

`THREE.LineBasicMaterial.linewidth`는 **대부분의 플랫폼에서 WebGL에 의해 조용히 무시됩니다** — `stroke()`에 전달된 값과 관계없이 선은 1px로 제한됩니다. 이는 브라우저/GPU 드라이버 제한이며 VectoJS의 제한이 아닙니다.

디자인에 두꺼운 선(> 1px)이 필요한 경우 다음을 고려하세요:

- 직선의 경우 `stroke()` 대신 직사각형 경로로 `fill()` 사용.
- 임의의 선 폭을 지원하는 기본 `CanvasRenderer`와 함께 [`ThreeAdapter`](/reference/three-adapter/)로 전환.
- 애플리케이션 레이어에서 `THREE.MeshLine`을 수동으로 통합 — `ThreeRenderer`는 이 의존성을 번들로 제공하지 않습니다.

## 그래디언트 지원

`ThreeRenderer.createLinearGradient()`는 `WebGLGradient` 기술자를 반환합니다. `fill()`에 전달되면 렌더러가 다음 유니폼 레이아웃으로 GLSL `ShaderMaterial`을 컴파일합니다:

```glsl
uniform vec4 u_grad_colors[8];  // 중단점당 RGBA
uniform float u_grad_stops[8];  // 정규화된 위치 [0, 1]
uniform vec2 u_grad_start;      // 월드 공간 시작점
uniform vec2 u_grad_end;        // 월드 공간 끝점
```

색상은 월드 공간에서 가장 가까운 두 중단점 사이에서 선형으로 보간됩니다. 8개 이상의 중단점이 제공되면 업로드 전에 8개의 균등 간격 점으로 리샘플링됩니다 — 8개 중단점 이상의 색상 디테일은 손실됩니다.

**그래디언트는 `stroke()` 또는 `fillText()`에서 지원되지 않습니다.** `stroke()`에 `WebGLGradient`를 전달하면 첫 번째 중단점 색상으로 대체됩니다. `fillText()`도 텍스트 글리프가 업로드 전에 Canvas 2D를 통해 래스터화되므로 첫 번째 중단점 색상으로 대체됩니다.

그래디언트/DPI/포인터 문제 해결은 [메인 `@vectojs/three` 페이지](/reference/three/#문제-해결)를 참조하세요.

## 관련 항목

[`ThreeAdapter`](/reference/three-adapter/) (대체 용도 — 3D 표면 위의 2D 패널) ·
[`IRenderer` / `CanvasRenderer`](/reference/core-renderer/) (이것이 구현하는 인터페이스) ·
[`@vectojs/three` 개요](/reference/three/)
