+++
title = "09 — Three.js / XR 브리지 — 두 좌표 세계"
description = "VectoJS의 2D 캔버스 계약과 Three.js 3D 공간 사이의 어댑터: CanvasTexture 패널, 광선→UV→씬 매핑, 오프스크린 포커스/키보드 소유권, 그리고 Graph3D가 순수 Three 대안을 보여주는 방식."
weight = 29
+++

# 09 — Three.js / XR 브리지 — 두 좌표 세계

> **Boss 09**는 두 입력 모델이 충돌하는 곳에 산다. VectoJS는 포인터와 키보드 디스패치를 소유하는 투명 접근성 DOM이 있는 2D 논리 픽셀 씬으로 렌더링하고, Three.js는 포인터가 광선이고 패널이 세계 공간에 떠 있는 텍스처 쿼드인 WebGL 씬으로 렌더링한다. `ThreeAdapter`는 두 언어를 모두 말하는 유일한 조각이다.

- **배울 내용**: 어댑터가 렌더러가 아닌 좌표 시스템 브리지인 이유; `CanvasTexture` 텍스처 경로와 `needsUpdate` 프록시; `Raycaster` UV가 논리 픽셀로 매핑되는 방식(DPR 함정 포함); 포인터, 휠, 호버, 포커스, 키보드 소유권이 오프스크린 캔버스를 통해 어떻게 재라우팅되는지; `Graph3D`/`GraphCamera`/`GraphInteraction`이 순수 Three 대안을 어떻게 보여주는지.
- **배우지 않을 내용**: `IRenderer` 계약 자체(boss 07), 텍스트 래스터화와 y-하향 직교 세부사항(boss 07 §텍스트 래스터 경로), WASM 가속(boss 08), 2D 힘 기반 레이아웃 튜닝(boss 11). 이 문서는 VectoJS의 2D 계약과 3D 호스트 사이의 이음매다.

## 1. 어댑터가 어려운 이유 — 두 세계, 하나의 캔버스

일반 VectoJS `Scene`은 페이지에 삽입된 `<canvas>`를 소유한다. 접근성 미러는 그 캔버스의 `a11yRoot`(캔버스 위에 쌓인 `<div>`)에 추가되고, 포인터/키보드 디스패치는 그 미러를 통해 실행된다 (`Scene.ts:3512` 미러별 리스너). 브리지에서는 캔버스가 **오프스크린**이다 — 문서에 삽입되지 않고 GPU 텍스처로 샘플링된다.

이 단일 사실이 연쇄된다:

| 세계        | 입력 소유자                                      | 픽셀 위치                         | 포커스 소유자                                                                        |
| ----------- | ------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------ |
| VectoJS 2D  | 투영 접근성 DOM (`Scene` 미러별 리스너)          | `canvas.width/height` 백업 저장소 | `document.activeElement` + `Scene.focusedA11yElement` (`Scene.ts:1446`)              |
| Three.js 3D | `THREE.Raycaster` + `window`/`domElement` 리스너 | `CanvasTexture`의 `PlaneGeometry` | Three에는 DOM 포커스 없음; 호스트의 `OrbitControls` 또는 `GraphCamera`가 포인터 소유 |

`ThreeAdapter` (`packages/three/src/ThreeAdapter.ts:90`)는 화면상으로 생각하는 2D 씬이 픽셀이 3D 히트 테스트 뒤에 있고 미러가 `document`에서 영구적으로 분리된 상태에서 올바르게 작동하도록 만들어야 한다.

## 2. CanvasTexture 경로와 `needsUpdate`

`CanvasTexture`는 오프스크린 캔버스를 매 프레임 GPU 텍스처로 복사한다. `needsUpdate`는 `true`가 `Texture.update()`를 트리거하는 프록시다 — 렌더러가 `flush()`를 호출할 때마다 설정되어야 한다. 설정되지 않으면 텍스처는 이전 프레임을 유지하고 3D 씬이 정지된 것처럼 보인다 (`ThreeRenderer.ts:478`).

`ThreeAdapter.render()`는 `renderer.flush()`를 호출한 후 `texture.needsUpdate = true`를 설정해야 하며, 그렇지 않으면 `THREE.WebGLRenderer.render()`가 오래된 텍스처를 사용한다. `needUpdate`를 설정하지 않고 `flush()`를 건너뛰면 동일한 결과가 나온다.

## 3. 광선 UV → 논리 픽셀 매핑

`THREE.Raycaster`는 3D 세계 좌표를 반환한다. `ThreeAdapter.getEntityAt(x, y)`는 먼저 `Raycaster`를 사용하여 `PlaneGeometry`의 UV를 가져온 후 UV를 논리 픽셀로 변환한다 (`packages/three/src/ThreeAdapter.ts:312`):

```text
logicalX = uv.x * scene.width
logicalY = (1 - uv.y) * scene.height  // y-반전 직교 보정
```

이 변환이 없으면 히트 테스트가 수직 반전되고 DPR이 잘못 적용된다. `scene.width/height`는 논리 픽셀(백업 저장소 아님)이므로, DPR이 적용된 좌표를 사용하면 오프셋이 발생한다.

## 4. 입력 재라우팅

오프스크린 캔버스는 `document`에서 포커스나 포인터 이벤트를 받지 못하므로, `ThreeAdapter`는 `window` 리스너를 등록하고 이를 `Scene` 이벤트로 변환한다 (`ThreeAdapter.ts:198`):

- `pointermove`/`pointerdown`/`pointerup`: `Raycaster`를 사용하여 UV를 논리 좌표로 매핑하고 `Scene.findEntityAt()`를 호출한 후 `entity.dispatchEvent()`를 실행한다.
- `wheel`: `entity.emit('scroll', { deltaX, deltaY })`로 직접 전달.
- `keydown`/`keyup`: `Scene`의 키보드 채널로 전달 (`Scene.ts:3272`), `ThreeAdapter`는 이를 `document` 리스너가 아닌 `Scene.on('keydown')`으로 라우팅한다.

포커스는 `ThreeAdapter.focusEntity(entity)`를 통해 명시적으로 관리되어야 한다 — `document.activeElement`는 오프스크린 캔버스와 무관하므로, `Scene.focusedA11yElement`은 `ThreeAdapter`가 수동으로 업데이트하지 않으면 오래된 상태로 남는다.

## 5. `Graph3D` — 순수 Three 대안

`Graph3D` (`packages/graph3d/src/Graph3D.ts`)는 `ThreeAdapter`를 사용하지 않고 직접 Three 씬을 구성한다. `GraphCamera` (`GraphCamera.ts:45`)는 `OrbitControls`와 직교 투영을 관리하고, `GraphInteraction` (`GraphInteraction.ts:90`)은 `Raycaster`를 직접 사용하여 노드 인덱스를 반환한다. 이는 `ThreeAdapter`가 제공하는 2D→3D 브리지 없이 순수 3D 그래프를 보여주는 대안이다.

`Graph3D`는 `VectoForceLayout` (`packages/graph3d/src/Graph3D.ts:112`)를 소비하고 `GraphLayout` 계약(`GraphLayout.ts:12`)을 구현하므로, `ThreeAdapter`가 필요하지 않다. 이는 브리지 없이 3D 그래프가 작동하는 방식을 보여주는 참고 구현이다.

## 6. 알려진 함정

- `CanvasTexture.needsUpdate`를 `flush()` 후 설정하지 않으면 텍스처가 정지된다.
- UV→논리 픽셀 매핑에서 y-반전(`1 - uv.y`)과 논리 픽셀(`width/height`, DPR 아님)을 사용하지 않으면 히트 테스트가 어긋난다.
- `document` 리스너를 등록하지 않으면 키보드 이벤트가 전달되지 않는다; `Scene.on('keydown')`만으로는 부족하다.
- `focusEntity()`를 수동으로 호출하지 않으면 `Scene.focusedA11yElement`이 오래된다.
- `Graph3D`는 `ThreeAdapter`와 독립적으로 작동하므로, 브리지 코드의 변경이 `Graph3D`에 영향을 주지 않는다 — 두 경로는 별도로 테스트해야 한다.
