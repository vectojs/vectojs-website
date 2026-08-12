+++
title = "Core Scene 아키텍처"
description = "Virtual Math Tree, Scene 생명주기, Entity 시스템, 히트 테스팅, 렌더 파이프라인 심층 분석"
weight = 8
+++

# Core Scene 아키텍처

VectoJS는 기존 브라우저 DOM을 사용하지 않습니다. 대신 `@vectojs/core` 내부에 **Virtual Math Tree (VMT)**를 구현합니다.

<figure>
  <img src="/images/vmt-architecture.svg" alt="VMT 아키텍처 다이어그램: Entity 트리, 캔버스 렌더링, A11y 섀도우 레이어" class="diagram" />
  <figcaption>VMT Entity 트리는 캔버스 렌더링과 캔버스 위의 보이지 않는 A11y 섀도우 DOM을 모두 구동합니다.</figcaption>
</figure>

## Scene

`Scene` 클래스는 최상위 오케스트레이터입니다. 세 가지 중요한 파이프라인을 관리합니다:

1. **렌더 루프** — `requestAnimationFrame` 루프로, 물리/애니메이션을 순차적으로 실행한 후 `IRenderer`를 통해 렌더링합니다.
2. **히트 테스팅(Hit-Testing)** — `document.elementFromPoint` 없이 순수 수학적 O(N) 레이캐스팅으로 포인터 호버와 클릭을 감지합니다.
3. **접근성 프록시** — 포커스, 레이아웃, 값을 캔버스 위의 보이지 않는 A11y 섀도우 DOM에 양방향으로 동기화합니다.

### 초기화

```typescript
import { Scene } from '@vectojs/core';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, {
  pointBackend: 'webgl', // 호환되는 원/사각형을 WebGL2 레이어로 일괄 처리
  maxFPS: 60,
});
scene.start();
```

`Scene`은 캔버스의 **부모** 요소에 두 개의 투명 `<div>`를 삽입합니다: 하나는 A11y 섀도우 레이어(`z-index: 10`), 다른 하나는 DOM 포털 레이어(`z-index: 9`)입니다. 부모가 `static`인 경우 매 프레임마다 `position: relative`로 강제 설정됩니다.

### 렌더 모드

| 모드                | 동작                                                                                | 사용 시기                          |
| ------------------- | ----------------------------------------------------------------------------------- | ---------------------------------- |
| `'always'` (기본값) | `maxFPS`로 제한된 상태로 매 프레임 다시 렌더링                                      | 연속 애니메이션, 파티클 시뮬레이션 |
| `'onDemand'`        | 더티(dirty) 상태이거나 모션이 대기 중일 때만 그림; 정적 rAF 틱은 여전히 트리를 확인 | 정적/이벤트 기반 UI                |

```typescript
scene.renderMode = 'onDemand';
// 이벤트 핸들러에서 scene.markDirty()를 호출하여 다시 그리기를 요청합니다.
```

**유휴 자동 스로틀 주의사항.** `'always'` 모드에서 대기 중인 트윈(tween)과 더티 플래그가 없는 씬은 배터리 절약을 위해 약 2fps로 스로틀링됩니다. 커스텀 `update()`에서 `entity.x`를 직접 변경하여 수동 애니메이션을 적용하는 경우, 이벤트 핸들러나 별도의 `rAF`에서 `scene.markDirty()`를 **프레임 사이에** 호출하세요 — `update()` 내부에서 호출하면 안 됩니다. 렌더 후 리셋이 다음 체크 전에 플래그를 지우기 때문입니다.

## Entity 시스템

VectoJS의 모든 객체는 추상 `Entity` 클래스를 확장합니다.

<figure>
  <img src="/images/entity-hierarchy.svg" alt="Entity 클래스 계층 구조: Entity → UIComponent → 모든 컴포넌트" class="diagram" />
  <figcaption>모든 UI 컴포넌트는 UIComponent를 확장하며, UIComponent 자체는 Entity를 확장합니다. 커스텀 타입은 Entity를 직접 서브클래싱할 수 있습니다.</figcaption>
</figure>

`Entity`는 다음을 소유합니다:

- **위치**(`x`, `y`), **크기**(`scaleX`, `scaleY`), **회전**(라디안), **불투명도**(`opacity`).
- **자식 배열** — VMT는 트리 구조입니다.
- **히트 박스**(`width`, `height`) — UIComponent의 AABB 히트 테스트에 사용됩니다.
- 선택적 플래그: `interactive`, `clipChildren`, `a11yFullViewport`.

### 전체 프로퍼티 참조

| 프로퍼티           | 타입      | 기본값  | 설명                                                                                                                                                                                                |
| ------------------ | --------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `x`, `y`           | `number`  | `0`     | 로컬 위치                                                                                                                                                                                           |
| `scaleX`, `scaleY` | `number`  | `1`     | 로컬 스케일                                                                                                                                                                                         |
| `rotation`         | `number`  | `0`     | 라디안                                                                                                                                                                                              |
| `opacity`          | `number`  | `1`     | `[0,1]`; 일반, 배치, WebGPU, 포털 경로에서 상위 불투명도와 곱해집니다.                                                                                                                              |
| `width`, `height`  | `number`  | `0`     | 히트 박스 크기                                                                                                                                                                                      |
| `interactive`      | `boolean` | `false` | 섀도우 DOM 노드 및 이벤트 활성화                                                                                                                                                                    |
| `clipChildren`     | `boolean` | `false` | 일반 자식 그리기를 `[0,0]–[width,height]`로 클리핑; Canvas/SVG는 정확하게 클리핑되며, Three는 회전/전단 클립에 world-AABB 시저를 사용합니다. GPU 포인트/WebGPU 오버레이 경로는 클리핑되지 않습니다. |
| `a11yFullViewport` | `boolean` | `false` | 뷰포트를 채우는 섀도우 노드 생성(무한 표면용)                                                                                                                                                       |
| `a11yOffsetX/Y`    | `number`  | `0`     | 섀도우 노드 위치 미세 조정                                                                                                                                                                          |

### Entity 서브클래싱

```typescript
import { Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

class GlowRect extends Entity {
  color = '#6366f1';

  isPointInside(gx: number, gy: number): boolean {
    const local = this.worldToLocal(gx, gy);
    return (
      !!local && local.x >= 0 && local.x <= this.width && local.y >= 0 && local.y <= this.height
    );
  }

  render(renderer: IRenderer): void {
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 8);
    renderer.fill(this.color);
  }
}

const rect = new GlowRect();
rect.width = 200;
rect.height = 80;
rect.setPosition(100, 100);
scene.add(rect);
```

> **참고:** `render()`는 렌더러가 이미 Entity의 글로벌 위치로 변환(translate), 스케일, 회전된 상태로 호출됩니다. `(0, 0)`부터 그리기 시작하세요.

### 히트 테스팅 및 이벤트

`entity.interactive = true`로 설정하면 일반 캔버스 씬에서 입력 가능한 접근성 노드가 투영됩니다. 히트 테스팅이 요청되면 `findEntityAt(x, y)`는 `isPointInside()`가 `true`를 반환하는 첫 번째 Entity를 반환합니다(깊이 우선, 앞에서 뒤로). 트래버스 중 인터랙티브 필터는 없습니다: 프로그래매틱 히트 테스트와 어댑터는 인터랙티브가 아닌 Entity도 반환할 수 있습니다.

```typescript
rect.interactive = true;

rect.on('click', (e) => {
  rect.animate({ color: '#38bdf8' }, 300);
});

rect.on('hover', (e) => {
  document.body.style.cursor = 'pointer';
});
rect.on('pointerleave', () => {
  document.body.style.cursor = 'default';
});
```

사용 가능한 이벤트: `click`, `hover`, `pointerdown`, `pointerup`, `pointercancel`, `pointermove`, `pointerleave`, `change`, `focus`, `blur`, `wheel`, `keydown`, `keyup`.

이벤트는 DOM 방식으로 전파됩니다: **캡처**(루트 → 대상) 후 **버블**(대상 → 루트). 캡처 단계에서 수신하려면 `{ capture: true }`를 전달하세요. `e.stopPropagation()`으로 트래버스를 중단하거나, `e.stopImmediatePropagation()`으로 현재 노드의 나머지 리스너도 건너뛸 수 있습니다.

### 애니메이션

`entity.animate()`는 모든 숫자 프로퍼티에 대해 부드러운 ease-out 트윈을 큐에 추가합니다:

```typescript
// 두 개의 트윈 체이닝: 오른쪽으로 슬라이드 후 페이드 아웃
rect.animate({ x: 400 }, 400).animate({ opacity: 0 }, 200);
```

이징 함수는 ease-out 2차 함수입니다: `t * (2 - t)`. 실행 중인 트윈은 `onDemand` 모드에서도 씬을 활성 상태로 유지합니다(`hasPendingAnimations()`).

### 커스텀 update()

`Entity.update(dt, time)`을 오버라이드하여 프레임별 로직을 구현하세요.

> [!WARNING]
> `dt`는 **밀리초** 단위이며 초가 아닙니다. `this.rotation += dt * 3`으로 작성하여 3 rad/s를 기대하는 것은 흔한 실수입니다 — 실제로는 3000 rad/s로 회전합니다. 변환하려면 `0.001`을 곱하거나(속도를 1000으로 나누어) 사용하세요.

`time`은 `performance.now()`입니다:

```typescript
class Spinner extends Entity {
  update(dt: number, _time: number): void {
    super.update(dt, _time); // 대기 중인 트윈 진행
    this.rotation += dt * 0.003; // dt는 ms이므로 3 rad/s
    this.scene?.markDirty();
  }
}
```

## 렌더링 파이프라인

<figure>
  <iframe src="/sandbox/diagram-pipeline.html" class="diagram-frame" loading="lazy" title="VectoJS 렌더 파이프라인: 하나의 더티 프레임이 거치는 여섯 단계를 VectoJS로 라이브 렌더링" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>더티 프레임마다 Entity 트리를 탐색하여 — 업데이트, 컬링, 렌더링 — 순차적으로 처리한 후 A11y 섀도우 DOM을 동기화합니다. <em>(VectoJS로 라이브 렌더링.)</em></figcaption>
</figure>

각 프레임:

1. **클리어** — `renderer.clear()`
2. **업데이트** — 트리를 탐색하며 `entity.update(dt, time)` 호출(`dt`는 ms, `time`은 `performance.now()`).
3. **컬링(Culling)** — `getBounds()`가 뷰포트 밖인 Entity를 건너뜁니다.
4. **렌더링** — 각 Entity의 글로벌 변환으로 렌더러를 translate/scale/rotate한 후 `entity.render(renderer)` 호출.
5. **플러시(Flush)** — 대기 중인 배치 드로우(원, WebGL 포인트)를 커밋.
6. **A11y 동기화** — 섀도우 DOM 업데이트(`a11ySyncInterval`로 스로틀링).

모든 작업이 JS 메모리에서 발생하고 캔버스로 직접 덤프되므로 브라우저 레이아웃 스래싱이 전혀 없습니다. 수천 개의 Entity를 애니메이션하는 동안 DOM 노드 수는 일정하게 유지됩니다.

## 성능 힌트

### 배치 드로잉

`getBatchCircle()` 또는 `getBatchRect()`를 오버라이드하여 리프 Entity를 WebGL 포인트 레이어로 옵트인합니다(`pointBackend: 'webgl'` 필요):

```typescript
getBatchCircle() {
  return { radius: this.radius, color: this.color };
}
```

표현 가능한 배치 리프는 전체 `save/translate/render/restore` 경로를 건너뛰고 WebGL 버퍼에 진입합니다. Canvas 모드 또는 지원되지 않는 누적 변환은 Entity의 일반 `render()` 폴백을 사용합니다.

### 뷰포트 컬링

`getBounds()`를 오버라이드하여 로컬 AABB를 반환합니다. 뷰포트 밖의 Entity는 `render()` 호출이 생략되지만, 트래버스와 `update()`는 계속 실행됩니다:

```typescript
getBounds() {
  return { x: 0, y: 0, width: this.width, height: this.height };
}
```

`UIComponent`는 이미 `getBounds()`를 구현하고 있습니다 — 고정 크기를 가진 커스텀 원시 Entity 서브클래스도 구현해야 합니다.

### 온디맨드 렌더링

대부분 정적인 UI의 경우 `scene.renderMode = 'onDemand'`로 전환하세요. 정적 틱은 업데이트/렌더링 및 GPU 작업을 건너뛰면서 rAF를 계속 폴링하여 더티/애니메이션 상태를 확인합니다. 이벤트 핸들러에서 `scene.markDirty()`를 호출하세요.
