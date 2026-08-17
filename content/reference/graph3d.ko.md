+++
title = "@vectojs/graph3d"
description = "3D 힘-기반 그래프 시각화: 플러그 가능한 GraphLayout 인터페이스와 인스턴싱된 Three.js 렌더러로 모든 그래프를 두 번의 드로 콜로 그립니다."
weight = 44
+++

# `@vectojs/graph3d`

문서 버전: **0.6.0**

VectoJS용 3D 힘-기반 그래프 시각화: 플러그 가능한 `GraphLayout` 계약(worker 친화적, 하나의 평평한 `Float32Array`로 위치 지정)과 `Graph3D`(인스턴싱된 Three.js 렌더러로 노드 수와 관계없이 정확히 두 번의 드로 콜로 그래프를 그립니다). 움직이는 77개 노드/254개 링크 데이터셋의 표준 [Les Misérables 데모](/demos/graph3d/)를 확인하세요.

## 설치

```bash
bun add @vectojs/graph3d three
```

`three`는 피어 의존성입니다 — `@vectojs/graph3d`는 사용자의 씬에 추가하는 `THREE.Group`에 그리며, `WebGLRenderer`, 카메라 또는 컨트롤을 직접 관리하지 않습니다.

## 사용법

```ts
import { VectoForceLayout, Graph3D } from '@vectojs/graph3d';
import * as THREE from 'three';

const data = {
  nodes: [{ id: 'vectojs', val: 8, color: '#4f9cff' }, { id: 'core' }, { id: 'ui' }],
  links: [
    { source: 'vectojs', target: 'core' },
    { source: 'vectojs', target: 'ui' },
  ],
};

const layout = new VectoForceLayout();
layout.setGraph(data);

const graph = new Graph3D();
graph.setGraphData(data);
scene.add(graph.group);

function animate() {
  const active = layout.step();
  graph.applyPositions(layout.positions);
  renderer.render(scene, camera);
  if (active) requestAnimationFrame(animate);
}
animate();
```

`layout.step()`은 시뮬레이션이 식은 후(alpha가 임계값 아래) `false`를 반환합니다 — 위 예제는 그때 자체 rAF 루프를 중단하지만, 사용자가 힘(charge 강도, 링크 거리)을 실시간으로 조정할 수 있게 하는 호출자는 레이아웃이 안정된 후에도 `OrbitControls` 감쇠와 카메라 이동이 부드럽게 유지되도록 매 프레임 계속 렌더링하고 물리 `step()`/`applyPositions()` 호출만 해당 플래그로 제어해야 합니다.

`VectoForceLayout`(자체 개발한 Barnes-Hut 옥트리 레이아웃, 런타임 의존성 없음)이 기본값입니다; [`D3ForceLayout`](/reference/graph3d-layout/#d3forcelayout)은 계속 사용 가능하지만 `d3-force-3d`가 필요합니다. 둘은 동일한 `GraphLayout` 계약 뒤에서 드롭인으로 교체 가능합니다.

## GraphCamera

0.4.0부터 `GraphCamera`는 자체 Three.js 컨트롤을 가져오지 않는 호스트를 위한 배터리 포함 카메라 + 컨트롤입니다: 하나의 `camera` 게터 뒤에 2D 직교 팬/줌 뷰와 3D 원근 궤도 뷰가 있습니다.

```ts
import { GraphCamera } from '@vectojs/graph3d';

const camera = new GraphCamera({ domElement: canvas, mode: '3d' }); // '2d' (ortho) is the default
camera.fitToPositions(layout.positions); // frame the graph; skips non-finite points
camera.setMode('2d'); // switch to orthographic pan/zoom
camera.setSize(width, height); // call on canvas resize
camera.dispose(); // remove pointer/wheel listeners
```

`mode: '2d' | '3d'`가 카메라 유형을 선택합니다; `fitToPositions(positions)`는 xyz 삼중항 버퍼([`applyPositions`](/reference/graph3d-renderer/#메서드)가 소비하는 것과 동일한 형태)를 프레임에 맞춥니다. `() => camera.camera`(게터이므로 `setMode`가 계속 살아 있음)를 전달하고 `setControlsEnabled`를 연결하여 노드 드래그가 뷰도 팬하지 않도록 하여 `GraphInteraction`과 함께 사용하세요.

## WASM 힘 커널

`VectoForceLayout`은 선택적 Rust/WASM 힘 커널(`crates/vectojs-force-rs`, 같은 위치의 `vectojs_force.wasm`으로 게시됨)을 포함하며, 이는 틱의 측정된 78–90%를 차지하는 Barnes-Hut 옥트리 구축 + 반발 누적을 가속화합니다. 로드/인스턴스화 실패 시 조용히 `false`를 반환하고 비트 단위로 동일한 JS Barnes-Hut을 유지하므로, 추측적으로 활성화해도 안전합니다.

```ts
import { forceWasmUrl } from '@vectojs/graph3d/wasm';

await layout.enableWasmForce(forceWasmUrl); // streaming (browser): URL | Response
layout.enableWasmForceSync(bytes); // raw bytes (Node/tests), never fetches
```

커널은 `@vectojs/core` 의존성이 없습니다 — `three`가 유일한 피어로 유지됩니다. `measurePhases` 프로파일링 옵션을 포함한 전체 레이아웃 API는 [`VectoForceLayout`](/reference/graph3d-layout/#vectoforcelayout)을 참조하세요.

## 참고 페이지

| 페이지                                                        | 내용                                                                                                                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/) | `GraphData` 데이터 모델, worker 친화적인 `GraphLayout` 계약, `VectoForceLayout`(기본값) 및 `D3ForceLayout` 옵션, WASM 커널, 그리고 힘-재시작 패턴.   |
| [`Graph3D` & picking](/reference/graph3d-renderer/)           | 인스턴싱된 Three.js 렌더러(`setGraphData`/`applyPositions`/`pickNode`/`getNodePosition`/`dispose`) 및 `GraphInteraction` — 호버, 선택, 드래그-투-핀. |

---

## 디자인 노트

- **Worker 친화적 설계.** `GraphLayout` 인터페이스는 물리 시뮬레이션이 메인 스레드 밖에서 실행될 수 있도록 특별히 설계되었습니다 — `positions`는 `Float32Array`로, `postMessage` 경계를 통해 복사 없이 전송 가능하며, `Graph3D.applyPositions()`는 해당 버퍼가 동기 호출에서 왔는지 worker 메시지에서 왔는지 알 필요가 없습니다.
- **렌더러/레이아웃 분리는 완전합니다.** `Graph3D`는 레이아웃 클래스를 임포트하지 않으며, `GraphLayout` 구현체는 Three.js를 임포트하지 않습니다 — `VectoForceLayout`을 `D3ForceLayout`, 시뮬레이션이 전혀 없는 정적/사전계산된 레이아웃, 또는 미래의 `ngraph` 어댑터로 교체하는 것은 호출 지점에서 한 줄만 변경하면 됩니다.
- **인-월드 노드 카드 및 HUD 컴포넌트**는 `@vectojs/ui`와 [`@vectojs/three`](/reference/three/)(씬-투-텍스처 빌보드로 WebXR에서도 작동) 위에 구축되어 이 패키지의 다음 계층으로 계획 중입니다 — 아직 출시되지 않았습니다.

## 권장 문서 사이트 페이지

- **Learn / 3D 그래프 시각화** — 레이아웃과 렌더러 분리, `VectoForceLayout` 힘 튜닝, picking, worker 호스팅 레이아웃.
- **Reference / API** — [`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/), [`Graph3D` & picking](/reference/graph3d-renderer/).
