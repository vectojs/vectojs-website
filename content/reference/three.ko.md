+++
title = "@vectojs/three"
description = "VectoJS용 Three.js 어댑터: 2D UI 패널을 3D 텍스처로 렌더링(ThreeAdapter)하거나 Three.js를 렌더링 백엔드로 사용(ThreeRenderer)."
weight = 41
+++

# `@vectojs/three`

두 개의 익스포트, 두 가지 용도:

| Export                                        | 용도                                                                                                                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`ThreeAdapter`](/reference/three-adapter/)   | VectoJS `Scene`을 어댑터 소유 또는 호출자 제공 캔버스에 렌더링하고, `THREE.CanvasTexture`로 노출하며, UV 레이캐스팅을 통해 포인터 이벤트를 연결합니다. 나머지 Three.js 씬은 그대로 유지됩니다. |
| [`ThreeRenderer`](/reference/three-renderer/) | Three.js를 VectoJS `Scene`의 2D 렌더링 백엔드로 사용 — 채우기, 선, 텍스트가 Canvas 2D 드로 콜 대신 정사영 씬의 Three.js 메시가 됩니다.                                                         |

`ThreeAdapter`가 일반적인 경로입니다: 3D 씬이 있고 표면에 떠 있는 2D UI 패널이 필요한 경우 — 생성자, WebXR/멀티터치 이벤트 처리 및 완전한 작업 예제는 해당 페이지를 참조하세요. `ThreeRenderer`는 이미 Three.js를 사용 중이고 Canvas 2D 폴백 없이 하드웨어 가속 2D 프리미티브를 원하는 프로젝트용입니다 — 구현된 `IRenderer` 메서드와 그래디언트 셰이더 레이아웃은 해당 페이지를 참조하세요.

---

## 설치

```sh
bun add @vectojs/three three
```

TypeScript 프로젝트의 경우 Three.js 타입을 추가하세요:

```sh
bun add -d @types/three
```

---

## 문제 해결

### 그래디언트가 혼합되지 않고 단색으로 렌더링됨

`stroke()`는 그래디언트를 지원하지 않습니다 — 항상 첫 번째 색상 중단점을 단색으로 사용합니다. 그래디언트가 적용된 윤곽선 효과가 필요하면 닫힌 경로와 함께 `fill()`을 사용하세요.

또한 `ThreeRenderer`에서 `createLinearGradient()`를 호출하고 있는지 확인하세요(`WebGLGradient` 반환), `CanvasRenderingContext2D`에서 호출하는 것이 아닌지 확인하세요 — 렌더러 그래디언트 객체를 구현체 간에 혼합하면 정의되지 않은 동작이 발생합니다.

### 고해상도 디스플레이에서 텍스트가 흐릿하게 나타남

생성자 차원에 `window.devicePixelRatio`를 **곱하지 마세요** — `@vectojs/core`의 `CanvasRenderer`가 이미 어댑터 캔버스의 백킹 스토어를 DPR로 내부적으로 스케일링합니다(미리 곱하면 논리 레이아웃 공간이 왜곡되면서 버퍼가 이중 스케일링됩니다). 브라우저 수준의 DPR은 자동으로 처리됩니다.

패널 텍스트가 여전히 부드러워 보이면 원인은 DPR이 아니라 3D 프로젝션입니다: 평면의 화면 내 면적이 텍스처 해상도를 초과합니다(카메라가 너무 가깝거나, 메시가 텍스처 크기에 비해 너무 크게 스케일링됨). 요청된 `width`/`height`를 늘리세요 — 그러면 텍스처 해상도가 높아지고 씬에 비례적으로 더 많은 논리 레이아웃 공간이 제공됩니다:

```ts
// 더 선명한 텍스처: 동일한 월드 공간 메시 크기에 더 많은 논리적 + 물리적 픽셀
const adapter = new ThreeAdapter({ width: 1024, height: 640 });
adapter.mesh.scale.set(3.2, 3.2 * (640 / 1024), 1); // 월드 크기 변경 없음; 밀도 2배
```

엔티티 위치와 폰트 크기는 논리 픽셀로 표현되므로, 생성자 차원을 두 배로 늘리면 레이아웃을 조정하지 않을 경우 UI가 패널의 1/4만 차지하게 됩니다 — 위치와 크기도 함께 조정하세요.

### VectoJS 컴포넌트에서 포인터 이벤트가 작동하지 않음

`updateIntersection()`은 입력이 처리되어야 하는 모든 프레임에서 호출되어야 합니다 — DOM 이벤트 리스너에서만 호출하는 것으로는 충분하지 않습니다. 레이캐스터가 이벤트 시점의 현재 카메라와 메시 상태를 필요로 하기 때문입니다. 확인 사항:

1. `updateIntersection()`이 렌더 루프 내부(또는 새로 설정된 레이캐스터로 포인터 이벤트 핸들러에서 직접)에서 호출되는지 확인하세요.
2. 레이캐스터의 카메라가 씬을 렌더링하는 데 사용된 카메라와 일치하는지 확인하세요.
3. 레이가 캐스팅될 때 `adapter.mesh`가 Three.js 씬 그래프의 일부인지 확인하세요 — 고아 메시(씬에 추가되지 않음)는 교차(intersect)되지 않습니다.

## 관련 항목

[`ThreeAdapter`](/reference/three-adapter/) · [`ThreeRenderer`](/reference/three-renderer/) ·
[`IRenderer` / `CanvasRenderer`](/reference/core-renderer/)
