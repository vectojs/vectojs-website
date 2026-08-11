+++
title = "ThreeAdapter"
description = "VectoJS Scene을 캔버스에 렌더링하고 THREE.CanvasTexture로 노출하며, UV 레이캐스팅을 통해 포인터 이벤트(WebXR 컨트롤러 및 멀티터치 포함)를 연결합니다."
weight = 42

[extra]
order = 42
+++

# `ThreeAdapter`

[`@vectojs/three`](/reference/three/)의 일부입니다.

`ThreeAdapter`는 제공된 `canvas`를 사용하거나, 생략된 경우 새로 생성합니다. VectoJS `Scene`을 해당 캔버스에 렌더링하고, 결과를 `THREE.CanvasTexture`로 감싸며, 바로 사용 가능한 `THREE.Mesh`(단위 `PlaneGeometry` + `MeshBasicMaterial`)를 제공합니다. Three.js 이벤트 리스너의 포인터 및 스크롤 이벤트는 레이캐스팅을 통해 VectoJS 논리 좌표로 변환됩니다.

3D 씬이 있고 표면에 떠 있는 2D UI 패널이 필요할 때 사용하세요 — 나머지 Three.js 씬은 그대로 유지되며 Canvas 2D 렌더링을 계속 사용합니다. `Scene` 자체의 렌더링 백엔드로 Three.js를 사용하려면 [`ThreeRenderer`](/reference/three-renderer/)를 참조하세요.

## 생성자

```ts
new ThreeAdapter(options: ThreeAdapterOptions)
```

```ts
interface ThreeAdapterOptions {
  width: number; // 2D UI 씬의 논리적 너비(CSS px)
  height: number; // 논리적 높이(CSS px)
  canvas?: HTMLCanvasElement; // 선택적 기존 캔버스; 생략 시 어댑터가 생성
  sceneOptions?: SceneOptions; // VectoScene 생성자로 전달
}
```

`disableWindowResize`는 `sceneOptions`에 무엇을 전달하든 내부적으로 `true`로 강제 설정됩니다 — 어댑터는 리사이즈를 `resize(w, h)`를 통해 제어하며, window가 아닙니다.

## Public 속성

| 속성         | 유형                  | 설명                                                                                          |
| ------------ | --------------------- | --------------------------------------------------------------------------------------------- |
| `texture`    | `THREE.CanvasTexture` | VectoJS 캔버스를 감싸는 텍스처. 매 VectoJS 렌더 프레임 후 자동으로 `needsUpdate = true` 설정. |
| `vectoScene` | `VectoScene`          | 활성 VectoJS `Scene` 인스턴스. 여기에 엔티티를 추가하세요.                                    |
| `canvas`     | `HTMLCanvasElement`   | VectoJS가 그리는 어댑터 소유 또는 호출자 제공 캔버스.                                         |
| `mesh`       | `THREE.Mesh`          | 미리 빌드된 `PlaneGeometry(1, 1)` + `MeshBasicMaterial` 메시, Three.js 씬에 바로 추가 가능.   |

## 메서드

### `updateIntersection(raycaster, type, originalEvent?)`

```ts
updateIntersection(
  raycaster: THREE.Raycaster,
  type: 'pointerdown' | 'pointerup' | 'pointermove' | 'wheel' | 'click',
  originalEvent?: PointerEvent | WheelEvent
): boolean
```

어댑터 메시에 레이를 캐스팅하고, UV 히트를 VectoJS 캔버스 좌표로 변환하며, 이벤트를 VectoJS 씬으로 디스패치합니다. 레이가 메시와 교차하면 `true`를 반환합니다.

포인터 버튼 상태와 `shiftKey`/`ctrlKey`/`altKey`/`metaKey`가 보존됩니다;
휠 이벤트는 모든 델타와 수정자 키를 추가로 보존합니다.

Three.js 렌더 루프 또는 포인터 이벤트 리스너 내에서 호출하세요. 어댑터는 `pointerId`별 호버 상태를 유지하므로 WebXR 컨트롤러와 멀티터치 입력이 각각 독립적인 호버/포커스 컨텍스트를 가집니다.

**UV 리매핑**: Three.js UV 좌표는 Y=0이 평면의 하단입니다; VectoJS는 Y=0이 상단입니다. 어댑터가 Y축을 자동으로 뒤집습니다 — 좌표를 조정할 필요가 없습니다.

### `resize(width, height)`

```ts
resize(width: number, height: number): void
```

캔버스와 기본 논리 `VectoScene`의 크기를 조정합니다. 패널의 렌더 해상도 또는 2D 레이아웃 뷰포트가 변경될 때 호출하세요; 메시의 월드 공간 스케일만 변경하는 경우에는 필요하지 않습니다.

### `dispose()`

```ts
dispose(): void
```

멱등적으로 `THREE.CanvasTexture`, geometry, material을 메시에서 해제하고, 메시를 분리하며, Scene 렌더 메서드를 복원하고, `VectoScene`을 제거하며, 모든 포인터별 상태를 지웁니다. 어댑터가 생성한 캔버스는 `0×0`으로 해제됩니다; 호출자가 제공한 캔버스는 치수를 유지합니다.

## 전체 예제

다음 예제는 Three.js 씬의 회전하는 평면에 VectoJS 설정 패널을 렌더링합니다. `pointermove`, `pointerdown`, `pointerup` DOM 리스너의 포인터 이벤트가 `updateIntersection`을 통해 VectoJS로 전달됩니다.

```ts
import * as THREE from 'three';
import { ThreeAdapter } from '@vectojs/three';
import { Text, Button, Stack } from '@vectojs/ui';

// --- Three.js 씬 설정 ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const threeScene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 3);

// --- VectoJS 패널 어댑터 (512×256 논리 픽셀, 2×1 평면에 표시) ---
const adapter = new ThreeAdapter({ width: 512, height: 256 });

const heading = new Text('Settings', { font: '600 24px Inter', color: '#f8fafc' });
const applyBtn = new Button('Apply', { width: 120, height: 40 });
applyBtn.on('click', () => console.log('apply clicked'));

const stack = new Stack({ direction: 'vertical', gap: 20 });
stack.add(heading);
stack.add(applyBtn);
stack.setPosition(20, 20);
adapter.vectoScene.add(stack);

adapter.vectoScene.start();

// --- Three.js 씬에 메시 배치 ---
const panel = adapter.mesh;
panel.scale.set(2, 1, 1); // 월드 공간 크기가 2:1 종횡비와 일치
threeScene.add(panel);

// --- 이벤트 변환을 위한 레이캐스터 ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function updatePointer(event: PointerEvent) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

window.addEventListener('pointermove', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'pointermove', e);
});

window.addEventListener('pointerdown', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'pointerdown', e);
});

window.addEventListener('pointerup', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'pointerup', e);
});

window.addEventListener('click', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'click', e);
});

window.addEventListener('wheel', (e) => {
  updatePointer(e as unknown as PointerEvent);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'wheel', e);
});

// --- 렌더 루프 ---
function animate() {
  requestAnimationFrame(animate);
  panel.rotation.y += 0.005;
  renderer.render(threeScene, camera);
}

animate();

// --- 정리 ---
window.addEventListener('unload', () => adapter.dispose());
```

## 어댑터 내부 동작 방식

생성자는 `vectoScene.render`를 몽키패치하여 각 VectoJS 프레임 후 `texture.needsUpdate = true`를 설정합니다. 그러면 Three.js가 다음 `renderer.render()` 호출에서 캔버스를 GPU에 업로드합니다. 폴링이나 수동 동기화가 필요하지 않습니다.

레이캐스트 UV 좌표는 씬의 **논리적** 좌표 공간(`vectoScene.width`/`height` — 생성자에 전달한 차원)으로 매핑되며, 어댑터 캔버스의 물리적 백킹 스토어 크기가 아닙니다. HiDPI 디스플레이에서 이 차이가 중요합니다: `@vectojs/core`의 `CanvasRenderer`는 선명한 렌더링을 위해 백킹 스토어를 `devicePixelRatio`로 스케일링하는 반면(`canvas.width = logicalWidth × dpr`), 엔티티 레이아웃과 히트 테스트는 논리 단위로 유지됩니다.

> [!WARNING] > **`@vectojs/three` ≤ 0.1.1에서 UV 매핑이 물리적 캔버스 크기를 사용했습니다** — 따라서 `devicePixelRatio ≠ 1`인 디스플레이나 브라우저 확대/축소 수준에서 모든 포인터 이벤트가 정확히 DPR 계수만큼 커서의 아래/오른쪽에 위치했습니다. 특징적인 증상: 클릭이 커서 아래의 컨트롤이 아니라 패널 _더 아래쪽_ 컨트롤을 활성화하며, 오프셋이 패널 내에서 대상이 깊어질수록 커집니다 — DPR-1 디스플레이와 헤드리스 테스트 환경에서는 완벽하게 동작합니다. **0.1.2**에서 수정됨; 해결 방법 대신 업그레이드하세요.

`updateIntersection`이 디스패치하는 히트 이벤트는 엔터티의 접근성 DOM 요소가 존재하고 **라이브 문서에 연결된 경우**(a11y 그림자 레이어를 통해 라우팅되어 대화형 컴포넌트에서 `click`/`change`를 발생시킴) 해당 요소로 전달되며, 그렇지 않으면 `VectoJSEvent` 객체로 직접 전달됩니다.

> [!NOTE]
> 기본 어댑터 생성 캔버스를 사용하면 패널이 직접 `VectoJSEvent` 경로를 사용합니다(캔버스와 그 a11y 루트가 분리되어 있기 때문). `document`에 연결된 캔버스를 제공하면 연결된 a11y 요소가 DOM 디스패치 경로를 사용할 수 있습니다. `@vectojs/three` 0.1.1 이상은 어느 쪽이든 가정하지 않고 연결 상태를 확인합니다.
>
> **이는 오류 방지뿐만 아니라 `Toggle`/`Button` 정확성을 위해 중요합니다.** `@vectojs/three` 0.1.0에서는 분리된 a11y 요소가 잘못 DOM 디스패치 분기를 사용하여 컴포넌트 콜백을 조용히 놓칠 수 있었습니다. 0.1.1 이상은 분리된 요소를 직접 라우팅합니다. 기본 분리 캔버스의 경우 네이티브 DOM 포커스/IME/스크린 리더 동작을 사용할 수 없지만, 호출자 제공 캔버스와 그 프로젝션 레이어가 연결된 경우에는 가능합니다.

## WebXR 및 멀티터치

`updateIntersection`은 `originalEvent`에서 가져온 `pointerId`별 호버 상태를 추적합니다. WebXR 세션에서 각 컨트롤러는 자체 `pointerId`를 가지므로, 한 컨트롤러로 호버링해도 다른 컨트롤러의 상태에 영향을 주지 않습니다. 합성 `PointerEvent`에 감싼 원시 `XRInputSourceEvent`를 컨트롤러의 `inputSource.handedness`가 `pointerId`로 인코딩된 상태(왼쪽 0, 오른쪽 1)로 전달하여 독립적인 히트 상태를 유지하세요.

```ts
// WebXR 예제 — 최소 컨트롤러 이벤트 전달
session.addEventListener('selectstart', (xrEvent) => {
  const synth = new PointerEvent('pointerdown', {
    pointerId: xrEvent.inputSource === leftController ? 0 : 1,
  });
  raycaster.setFromCamera(controllerUV, camera);
  adapter.updateIntersection(raycaster, 'pointerdown', synth);
});
```

## 관련 항목

[`ThreeRenderer`](/reference/three-renderer/) (대체 용도 — Three.js를 `Scene`의 렌더링 백엔드로 사용) ·
[`Scene`](/reference/core-scene/) (`vectoScene`) ·
[`@vectojs/three` 개요](/reference/three/)
