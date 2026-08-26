+++
title = "성능"
description = "렌더 모드, 유휴 자동 스로틀, WebGL 배치 렌더링, 뷰포트 컬링, 텍스트 성능, 실제 GPU 처리량 측정 방법"
weight = 13
+++

# 성능

VectoJS는 기본적으로 빠르게 동작하도록 설계되었지만, 몇 가지 옵트인 메커니즘을 통해 더 높은 처리량을 확보할 수 있습니다. 이 페이지에서는 사용 가능한 조절 장치, 대부분의 개발자를 당황시키는 숨은 함정, 그리고 성능을 정확하게 측정하는 방법을 설명합니다.

## 렌더 모드

`Scene`은 두 가지 렌더 모드를 지원하며, 생성 후 `scene.renderMode`로 설정합니다:

```typescript
scene.renderMode = 'always'; // 기본값 — 매 프레임 다시 렌더링
scene.renderMode = 'onDemand'; // 더티(dirty) 상태이거나 트윈(tween) 중일 때만 다시 렌더링
```

### `'always'` 모드

rAF 루프가 매 프레임 실행되며, `maxFPS`(기본값 60)에 의해 제한됩니다. 다음 상황에 사용하세요:

- 연속적인 애니메이션 (파티클 시뮬레이션, 물리)
- 실시간 데이터 피드
- 항상 무언가가 움직이는 모든 장면

### `'onDemand'` 모드

rAF 루프는 마지막 프레임 이후 `scene.markDirty()`가 호출되었거나, 애니메이션/전환 드라이버가 진행 중일 때만 렌더링합니다. 유휴 틱(tick)은 엔티티 업데이트/렌더와 GPU 제출을 건너뛰지만, Scene은 여전히 rAF를 예약하고 트리를 탐색하여 보류 중인 애니메이션 상태를 확인합니다. 다음 상황에 사용하세요:

- 정적이거나 이벤트 기반 UI (대시보드, 폼, 메뉴)
- 사용자 액션에 반응하여 애니메이션을 수행하지만 그 외에는 정적인 장면

```typescript
scene.renderMode = 'onDemand';

button.on('click', () => {
  button.animate({ scaleX: 1.1, scaleY: 1.1 }, 100).animate({ scaleX: 1, scaleY: 1 }, 100);
  // animate()는 트윈이 실행되는 동안 자동으로 더티(dirty)를 표시합니다
});

input.on('change', () => {
  scene.markDirty(); // 새 커서/선택 상태를 표시하기 위해 다시 그리기
});
```

## 유휴 자동 스로틀 (숨은 함정)

이것은 VectoJS에서 가장 흔한 성능 함정입니다.

`'always'` 모드에서, Scene은 다음 조건에서 **정적(static)** 으로 간주됩니다:

- `dirty` 플래그가 `false`이고,
- 어떤 엔티티도 보류 중인 `animate()` 트윈이 없는 경우

정적 Scene은 배터리와 GPU를 절약하기 위해 **약 2fps**로 스로틀링됩니다. 안정적인 런타임에서는 `dirty` 플래그가 렌더링된 각 프레임의 _시작_ 시점에 소비되므로, `update()` 내부에서 발생한 `markDirty()`는 다음 프레임의 정적 검사까지 유지됩니다.

```typescript
// markDirty()를 update() 내부에서 호출하면 다음 프레임이 재설정됩니다
class Spinner extends Entity {
  update(dt: number, time: number) {
    super.update(dt, time);
    this.rotation += dt * 0.003;
    this.scene?.markDirty();
  }
}
```

**core ≤ 0.2.5의 함정:** 플래그가 _렌더 후_ 초기화되었기 때문에, `update()` 중에 설정된 `markDirty()`가 다음 정적 검사 전에 지워졌습니다 — 위 패턴은 한 프레임을 렌더링하고 2fps로 멈췄습니다. 더 오래된 코어를 지원해야 한다면 아래 수정 방법 중 하나를 사용하세요(이 방법들은 0.2.6에서도 더 효율적인 선택입니다, `hasPendingAnimations()`는 프레임당 플래그 쓰기 없이 의도를 명시하기 때문입니다).

**수정 — 옵션 A:** 수동 변경 대신 `animate()`를 사용하여 움직임을 처리하세요. 실행 중인 트윈은 Scene을 자동으로 활성 상태로 유지합니다:

```typescript
// 올바름: animate()는 hasPendingAnimations()를 true로 유지합니다
entity.animate({ rotation: Math.PI * 2 }, 1000);
```

**수정 — 옵션 A2 (`update()` 기반 움직임의 경우):** 통합자를 유지하되, `hasPendingAnimations()`를 재정의하여 Scene에 알립니다. 이것이 내장 스크롤 컨테이너가 진행 중인 움직임을 보고하는 방식입니다:

```typescript
class Spinner extends Entity {
  update(dt: number, time: number) {
    super.update(dt, time);
    this.rotation += dt * 0.003;
  }
  hasPendingAnimations() {
    return true; // 또는: super.hasPendingAnimations() || stillMoving
  }
}
```

**수정 — 옵션 B:** **프레임 사이**에 `markDirty()`를 호출하세요 — 이벤트 핸들러, `setInterval`, 또는 Scene 자체의 rAF 이후에 실행되는 별도의 `requestAnimationFrame`에서 호출:

```typescript
// 올바름: 프레임 사이에 markDirty 호출 (update 내부가 아님)
setInterval(() => scene.markDirty(), 16); // 외부 드라이버
```

**수정 — 옵션 C:** `renderMode: 'always'`로 전환하고 `maxFPS`를 설정하여 정적 스로틀을 방지하세요 (유휴 스로틀은 `maxFPS > 0`일 때만 적용됩니다; `maxFPS = 0`으로 설정하면 제한이 없어지고 항상 다시 렌더링됩니다):

```typescript
scene.maxFPS = 0; // 제한 없음 — 2fps로 스로틀링되지 않습니다
```

## `maxFPS` 및 축소된 움직임(Reduced Motion)

```typescript
const scene = new Scene(canvas, {
  maxFPS: 60, // 프레임 속도 제한; 0 = 제한 없음
  respectReducedMotion: true, // 기본값: true
});
```

`respectReducedMotion: true`(기본값)이고 사용자가 OS 접근성 설정에서 "reduce motion(움직임 줄이기)"을 활성화한 경우, 유효 FPS는 **30**으로 제한됩니다 (또는 `maxFPS`와 30 중 더 낮은 값). `respectReducedMotion: false`로 비활성화할 수 있지만, 이는 명시적인 사용자 설정을 무시하는 것입니다.

`maxFPS`는 실시간으로도 설정 가능합니다: 배터리 절약 모드를 위해 `scene.maxFPS = 30`.

## WebGL 배치 렌더링

많은 수의 원이나 사각형의 경우, WebGL 레이어는 여러 개의 엔티티별 Canvas 패스 호출을 타입 버퍼 업로드와 소수의 드로우 제출로 대체합니다. 성능 향상의 임계점과 속도 향상 폭은 작업 부하와 하드웨어에 따라 다르므로 벤치마킹이 필요합니다.

### 배치 레이어 활성화

```typescript
const scene = new Scene(canvas, {
  pointBackend: 'webgl', // Canvas2D 위에 WebGL2 캔버스를 추가합니다
});
```

### 엔티티 옵트인

`render()` 대신 `getBatchCircle()` 또는 `getBatchRect()`를 재정의하세요:

```typescript
class Dot extends Entity {
  radius = 4;
  color = '#00f0ff';

  // 매 프레임마다 읽힙니다 — 애니메이션 값도 작동합니다.
  getBatchCircle() {
    return { radius: this.radius, color: this.color };
  }

  // Canvas 모드 또는 표현 불가능한 월드 트랜스폼을 위한 필수 폴백입니다.
  isPointInside() {
    return false;
  }
  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.arc(0, 0, this.radius, 0, Math.PI * 2);
    renderer.fill(this.color);
  }
}
```

Scene은 매 프레임 `getBatchCircle()` / `getBatchRect()`를 읽고, 표현 가능한 월드 공간 프리미티브를 WebGL 레이어에 전달합니다. 색상과 알파는 인스턴스별 속성이므로, 하나의 버퍼에 여러 스타일을 혼합할 수 있습니다.

**제약사항:**

- 엔티티는 **리프(leaf)** 여야 합니다 (자식이 없음).
- 엔티티 자체의 스케일은 **균일(uniform)** 해야 합니다 (`scaleX === scaleY`).
- Scene에 `pointBackend: 'webgl'`이 필요합니다.
- 누적된 트랜스폼은 하나의 스케일 + 회전으로 표현 가능해야 합니다. 비균일/전단(shear) 조상이 있으면 `render()`로 폴백됩니다.

WebGL 레이어는 Canvas2D 콘텐츠 **위에** 합성되므로 (`z-index: 5`), 배치 프리미티브는 트리 순서와 관계없이 항상 2D 콘텐츠 위에 그려집니다.

### 사각형용 `getBatchRect()`

```typescript
getBatchRect() {
  return { width: this.width, height: this.height, color: this.color };
}
```

배치 사각형은 표현 가능한 엔티티별 회전을 지원합니다. 반사, 전단, 비균일 누적 스케일은 일반 렌더러로 폴백됩니다.

## `getBounds()`를 이용한 뷰포트 컬링

기본적으로 모든 엔티티는 화면 밖에 완전히 있더라도 렌더링된 프레임에서 `update()`와 `render()`를 실행합니다. `getBounds()`를 재정의하여 로컬 공간의 경계 상자를 반환하면 Scene이 화면 밖 엔티티의 `render()` 호출을 건너뜁니다. 트리 탐색과 `update()`는 여전히 실행됩니다:

```typescript
getBounds() {
  return { x: 0, y: 0, width: this.width, height: this.height };
}
```

`UIComponent`는 이미 이를 구현하고 있습니다 — 모든 `@vectojs/ui` 컴포넌트는 자동으로 컬링에 참여합니다. 고정 크기의 원시 `Entity` 서브클래스의 경우, 큰 장면에서 무료 성능 향상을 위해 `getBounds()`를 추가하세요.

예를 들어, 5,000개의 경계가 있는 리프 엔티티 중 90%가 화면 밖에 있다면, 약 500개의 `render()` 호출만 남지만 Scene은 여전히 5,000개의 노드를 모두 방문하고 업데이트합니다.

### 화면 밖에서는 장면 전체가 일시 정지됩니다

엔티티 단위 컬링에도 트리 순회 비용은 여전히 듭니다. **캔버스 자체**가 뷰 밖으로 완전히 스크롤되면 — 대시보드 탭, 스크롤 아래에 있는 차트 등 — `IntersectionObserver`가 rAF 루프를 완전히 일시 정지하고 다시 들어올 때 재개합니다. 따라서 아무도 볼 수 없는 장면은 프레임마다 전체 업데이트/렌더링을 수행하는 대신 아무 비용도 들지 않습니다. 옵트인할 것은 없습니다. (SSR/jsdom처럼 `IntersectionObserver`를 사용할 수 없는 환경에서는 장면이 항상 화면에 있는 것으로 취급됩니다.)

### `dt`는 100ms로 제한됩니다

백그라운드로 전환된 탭, 디버거 일시 정지 또는 긴 GC 이후에는 실제 경과 시간이 수 초에 이를 수 있습니다. 그 원시 값을 적분에 그대로 넣으면 물리와 트윈이 순간 이동하므로, 프레임 델타는 `MAX_FRAME_DT`(100ms)로 상한이 설정됩니다. `update(dt)`에서 직접 `dt`를 적분하더라도 그 값을 초과하는 일은 없습니다.

## A11y 동기화 스로틀링

렌더링된 모든 프레임에서 `Scene`은 모든 인터랙티브 엔티티의 위치와 상태를 섀도우 DOM 노드와 동기화합니다. 수백 개의 인터랙티브 엔티티가 동시에 애니메이션되는 경우, 이 DOM 쓰기 오버헤드가 프레임 시간을 지배할 수 있습니다.

`a11ySyncInterval`로 스로틀링하세요:

```typescript
const scene = new Scene(canvas, {
  a11ySyncInterval: 100, // 100ms당 최대 한 번 동기화
});
// 또는 실시간 설정:
scene.a11ySyncInterval = 100;
```

이 간격은 애니메이션 실행 중에 확인됩니다. `a11ySyncInterval: 100`은 동기화를 초당 약 10회로 제한하고, 움직임이 멈춘 후 최종 따라잡기 동기화를 예약합니다. 접근성 지연 시간과 측정된 DOM 비용에 따라 간격을 선택하세요.

## 텍스트 성능

### `setMaxWidth()` — 리플로우의 핫 경로

`LayoutEngine`은 측정(콜드 패스)과 레이아웃(핫 패스)을 분리합니다. 창 크기가 조정되어 텍스트 리플로우가 필요할 때:

```typescript
// 틀림: 모든 리사이즈 이벤트에서 전체 측정된 텍스트를 재구축합니다
window.addEventListener('resize', () => {
  label.setText(label.text); // 콜드 패스 — 다시 세그먼트화하고 재측정합니다
});

// 올바름: 캐시된 측정값을 재사용하고 줄 바꿈만 다시 계산합니다
window.addEventListener('resize', () => {
  label.setMaxWidth(newWidth); // 핫 패스 — 저렴합니다
});
```

핫 패스의 복잡도는 O(글리프 수)가 아닌 O(단어 수)이며, 모든 `Intl.Segmenter` 및 canvas `measureText` 호출을 피합니다.

### `LayoutResultBuffer` — 재사용 가능한 텍스트 좌표 저장소

프레임당 수천 개의 글리프가 있는 데이터 밀집형 UI(데이터 그리드, 터미널, 로그 뷰어)의 경우, 표준 `layoutPrepared()` 경로는 글리프당 하나의 `LayoutNode` 객체를 할당합니다. 대신 `LayoutResultBuffer`를 사용하세요:

```typescript
import { LayoutEngine, LayoutResultBuffer, createCanvasMeasurer } from '@vectojs/core/layout';

const engine = new LayoutEngine(400, Infinity, createCanvasMeasurer());
const buffer = new LayoutResultBuffer(); // 프레임 간 재사용 (용량 = 16384)

function renderRow(text: string) {
  const prepared = engine.prepare(text, {}, 14);
  buffer.reset();
  engine.layoutPreparedIntoBuffer(prepared, buffer);
  // buffer.xs, buffer.ys, buffer.ws, buffer.hs, buffer.chars — 평탄화된 타입 배열
  for (let i = 0; i < buffer.count; i++) {
    renderer.fillText(buffer.chars[i], buffer.xs[i], buffer.ys[i], '14px monospace', '#e2e8f0');
  }
}
```

재사용 가능한 버퍼는 핫 레이아웃에서 글리프당 하나의 `LayoutNode` 객체 할당을 피합니다. 제약사항: 고정 용량, 단일 컬럼만 지원 (BiDi 시각적 재정렬, 제외 사각형 없음). 이러한 기능이 필요하면 `layoutPrepared()`를 사용하고, 핫 경로에서는 `toLayoutResult()`를 피하세요 — 노드 객체를 할당하기 때문입니다.

### `TextRasterCache` — 텍스트를 다시 셰이핑하는 대신 반복 텍스트를 블리팅하기

_Core 1.12.0부터._ 뷰가 **동일한 짧은 문자열을 프레임당 수천 번** 그릴 때(단막/탄막, 채팅/로그 꼬리, 파티클 레이블, 반복되는 셀 값), 병목은 레이아웃이 아니라 `fillText` 자체입니다. 각 호출은 문자열을 다시 셰이핑하고, CSS 색상을 다시 파싱하며, CPU 메인 스레드에서 글리프를 래스터화합니다; 프레임당 수천 번의 호출에서 메인 스레드는 네이티브(`(program)`) 코드에 고정되고 GPU는 굶주려 다운클럭됩니다. `fillText`를 미리-래스터화된 실행의 `drawImage`로 교체하면 그 호출별 CPU 비용이 저렴한 비트맵 블리트로 바뀝니다:

```typescript
import { TextRasterCache } from '@vectojs/core';

const cache = new TextRasterCache(); // one per scene/renderer

function drawLabel(text: string, x: number, baselineY: number) {
  const r = cache.get('600 24px system-ui', '#38bdf8', text);
  if (r) renderer.drawImage(r.canvas, x - r.offsetX, baselineY - r.offsetY, r.width, r.height);
  else renderer.fillText(text, x, baselineY, '600 24px system-ui', '#38bdf8'); // headless fallback
}
```

이점은 **재사용**에서 나옵니다: 서로 다른 `(font, color, text)` 실행 집합이 한정되어 있을 때(구문 라이브러리, 작은 팔레트, 몇 개의 폰트 크기) 정상 상태의 적중률은 100%에 근접합니다. 삽입-순서 제거 상한(`maxEntries`, 기본값 4096)은 무제한으로 사용자가 입력한 콘텐츠에 대해 메모리를 제한하며, `dpr > 1`은 블리트 크기가 CSS 픽셀로 유지되는 동안 HiDPI에서 텍스트를 선명하게 유지합니다. 매우 다양하거나 한 번만 그려지는 텍스트에는 도움이 되지 **않습니다** — 그것은 순수한 오버헤드입니다. [렌더러 레퍼런스](/reference/core-renderer/#textrastercache)를 참조하세요.

## CPU 계산 vs 렌더링 병목 현상

전통적인 브라우저 DOM 프레임워크에서 성능 병목은 거의 항상 브라우저의 **렌더링 및 리플로우 레이아웃 파이프라인**(DOM 조작, 스타일 재계산, 페인팅)에 있습니다. 그러나 VectoJS는 DOM을 완전히 우회하고 레이아웃, 컬링, 상호작용을 메모리에서 수학적으로 처리하기 때문에, 성능 병목 현상이 GPU/렌더링 레이어에서 **JavaScript 단일 스레드 CPU 계산**으로 직접 이동합니다.

충분히 높은 활성 노드 수에서 CPU 측의 트리 탐색, 업데이트, 레이아웃, 히트 테스트는 래스터화 이전에 $16.67\\text{ ms}$ 프레임 예산을 초과할 수 있습니다. 임계점은 작업 부하와 장치에 따라 다릅니다.

VectoJS는 이러한 계산 병목 현상을 근본적으로 해결하기 위해 전용 **"탈출구(Escape Hatches)"** 를 제공하여 CPU 단일 스레드 한계를 우회합니다.

---

### 1. 고밀도 파티클 시뮬레이션 (파티클별, N-Body 아님)

**병목 현상:** 파티클별 JavaScript 통합은 매 프레임 $O(N)$이며 결국 메인 스레드의 프레임 예산을 소모합니다. 이 현상이 발생하는 개수는 장치와 모델에 따라 다릅니다.

**탈출구: WebGPU 컴퓨트 셰이더 (`ComputeParticleEntity`)**
CPU 실행을 완전히 우회하기 위해 VectoJS는 `ComputeParticleEntity`를 제공합니다. 내부 동작 방식:

- 물리 방정식(오일러 통합, 스프링 장력, 필드 인력)은 **WGSL(WebGPU Shading Language) 컴퓨트 셰이더**로 컴파일됩니다.
- 런타임에 데이터는 GPU VRAM에 상주하여 WebGPU 컴퓨트 패스가 수천 개의 GPU 코어에서 시뮬레이션을 병렬화할 수 있습니다.
- 렌더러는 WebGPU를 사용할 수 없거나 장치가 손실된 경우 자동으로 동등한 CPU 루프(`updateCPU()`)로 폴백됩니다.

> [!IMPORTANT] > **이것은 $N$-body 시뮬레이션이 아닙니다.** 각 파티클의 힘은 스프링 원점, 마우스 커서, 선택적 폭발 중심의 세 가지 _고정된_ 점에 대해서만 계산됩니다. 파티클 간 상호작용이나 공간 인덱스는 포함되지 않으며, 이것이 바로 이 시뮬레이션이 병렬화에 매우 적합하고 GPU 친화적인 이유입니다. 실제 이웃 상호작용(파티클 간 충돌 또는 반발, 플로킹, N-body 중력)이 필요하다면 `ComputeParticleEntity`는 이를 지원하지 않습니다 — 이웃 쿼리가 내장된 자체 WGSL 컴퓨트 패스를 작성하거나, CPU에서 `SpatialHashGrid` 기반 이웃 쿼리를 실행해야 합니다 (아래 [`SpatialHashGrid`](#3-entiti-sanghojagyongyi-bada-o-n-2-bogjabseong-munje) 및 CPU 예제가 있는 [Physics Engine 가이드](/learn/physics-engine/) 참조). 현재 엔진에는 "CPU 폴백으로 GPU에서 임의 계산 실행"을 위한 일반적인 추상화가 없습니다 — `ComputeParticleEntity`는 구체적이고 좁은 구현체일 뿐, 재사용 가능한 패턴이 아닙니다.

고성능 처리량은 GPU, 브라우저, DPR, 파티클 모델, 구성에 크게 의존합니다. 이 저장소에는 체크인된 고성능 WebGPU 결과가 없으므로, **Export report** 버튼을 사용하여 자신의 장면을 측정하세요 (아래 [실제 성능 측정](#silje-seongneung-ceugjeong) 참조).

---

### 2. 고밀도 텍스트 측정 및 타이포그래피 리플로우

**병목 현상:** 동적 텍스트 레이아웃은 프론트엔드 엔지니어링에서 가장 비용이 많이 드는 CPU 작업 중 하나입니다. 사전 기반 단어 토큰화(`Intl.Segmenter`), BiDi 정렬, 브라우저 수준의 글꼴 너비 측정(canvas `measureText` API 호출)이 필요합니다. 단일 프레임에서 수만 개의 글리프에 대한 텍스트 레이아웃을 계산하려고 하면(예: 금융 터미널, 활성 로그 스트림, 데이터 그리드) "콜드 패스" 측정 파이프라인에서 JS 메인 스레드가 중단됩니다.

**탈출구: 스레드 외 레이아웃, 분할 레이아웃 및 재사용된 메모리**
VectoJS는 세 가지 수준의 텍스트 최적화를 제공합니다:

- **스레드 외 MSDF 레이아웃 (`LayoutWorkerManager`)**: `MSDFTextEntity`는 텍스트와 미리 계산된 글꼴/글리프 메트릭스를 백그라운드 Web Worker로 보낼 수 있으며, 엔티티별로 디바운스됩니다. Worker는 줄 배치를 수행하고 타입화된 좌표/스타일 버퍼를 반환합니다. 브라우저 폰트 측정 API를 호출하지 않습니다.
- **콜드/핫 분리**: VectoJS는 레이아웃을 "콜드"(텍스트 파싱 및 글리프 너비 측정)와 "핫"(줄 바꿈 계산)으로 분리합니다. 리사이즈로 인해 텍스트가 줄바꿈될 때 콜드 결과가 재사용되어 모든 브라우저 측정 API를 피하고 리사이즈 레이아웃 복잡도를 순수 $O(\\text{단어 수})$로 만듭니다.
- **재사용 가능한 TypedArray 버퍼 (`LayoutResultBuffer`)**: 수천 개의 임시 레이아웃 노드 객체 할당을 피하기 위해, 개발자는 미리 할당된 평탄 버퍼에 레이아웃 좌표를 쓸 수 있습니다. 호출하는 쪽에서 여전히 할당이 가능하지만, 버퍼 경로가 좌표 저장소를 재사용한다는 것이 보장됩니다.

> [!IMPORTANT] > **`LayoutWorkerManager`는 단일 백그라운드 스레드이며, 풀이 아닙니다. 그리고 하나의 컴포넌트만을 위해 연결되어 있습니다.** `MSDFTextEntity`(GPU/MSDF-폰트 텍스트 프리미티브) 내부에서 사용됩니다 — 기본 `@vectojs/ui` 텍스트 컴포넌트(`Text`, `RichText`)는 콜드/핫 분할을 포함하여 메인 스레드에서 동기적으로 레이아웃됩니다. 매우 많은 양의 기본 컴포넌트 텍스트를 렌더링하다가 한계에 부딪혔다면, 콜드/핫 분할과 `LayoutResultBuffer`는 여전히 적용되지만, 스레드 외 레이아웃을 무료로 얻을 수는 없습니다 — 자체 Worker 오프로드를 구축하거나 `MSDFTextEntity`로 전환해야 합니다. 더 일반적으로 말하면: 이 텍스트 레이아웃 경로 외에는 엔진에서 오늘날 메인 스레드 외부에서 실행되는 것은 없습니다. VMT 탐색, 히트 테스트, 스프링 물리학은 모두 동기적입니다.

---

### 3. 엔티티 상호작용의 바다 ($O(N^2)$ 복잡성 문제) {#3-entiti-sanghojagyongyi-bada-o-n-2-bogjabseong-munje}

**병목 현상:** 쌍별 엔티티 간 충돌 또는 근접성 검사는 $O(N^2)$ 후보 비교가 필요합니다. 이 증가는 쌍당 작업량에 따라 매우 큰 장면 수에 도달하기 전에 실용적이지 않게 됩니다.

**탈출구: 공간 해싱 그리드 (`SpatialHashGrid`)**
애플리케이션에서 관리하는 충돌/근접성 쿼리를 위해 VectoJS는 `SpatialHashGrid`를 내보냅니다. Scene은 엔티티를 자동으로 인덱싱하지 않습니다:

- 2D 좌표 공간은 선택한 고정 크기의 셀로 이산화되며, 셀 좌표는 [Cantor 페어링 함수](https://en.wikipedia.org/wiki/Pairing_function)를 통해 단일 버킷 키로 결합되어 일반 `Map`에 저장됩니다 — 고정 용량 해시 테이블이 아닙니다.
- 엔티티의 월드 공간 AABB가 변경될 때 `insert(id, x, y, w, h)`를 호출하거나, 동적 프레임의 경우 그리드를 지우고 재구축합니다.
- `query(x, y, w, h)`를 호출하여 로컬 쿼리 AABB와 겹치는 모든 셀의 ID를 검색한 후, 해당 후보에 대해 정확한 충돌 테스트를 실행합니다.
- 이는 애플리케이션 수준의 로컬 물리학을 **$O(N^2)$** 에서 각 쿼리가 방문하는 셀/결과로 줄일 수 있습니다. 내장 `findEntityAt()`와 뷰포트 컬링은 여전히 O(N) 트리 탐색입니다.

> [!WARNING] > **밀집된 버킷에 대한 자동 완화는 없습니다.** `SpatialHashGrid`(그리고 Knowledge Graph 데모에서 사용하는 독립적인 공간 해시)는 각 셀을 내부 구조가 없는 평탄한 집합으로 저장합니다 — 적응형 셀 크기 조정, 오버플로 체이닝, 계층적/다중 해상도 그리드가 없습니다. "$O(1)$ 평균" 수치는 선택한 `cellSize`에 대해 엔티티가 셀 전체에 대략 균일하게 분포되어 있다고 가정합니다. 데이터가 심하게 클러스터링될 수 있는 경우(많은 엔티티가 동일한 소수의 셀에 위치 — 한 지점에 모인 군중, 수천 개의 노드가 몇 픽셀에 겹치는 축소된 뷰) — 해당 셀은 인덱스가 없는 것과 마찬가지로 $O(k)$ 선형 스캔으로 저하됩니다. 현재 이에 대한 자동 탈출구는 없습니다: 유일한 방법은 엔티티의 크기와 예상 밀도에 적합한 `cellSize`를 선택하고, 데이터의 클러스터링 동작이 변경되면 재평가하는 것입니다. 극단적이고 예측할 수 없는 클러스터링이 실제로 가능한 시나리오를 구축하는 경우, 최악의 경우 버킷 점유율을 직접 측정하는 데 예산을 할당하세요.

---

## 실제 성능 측정 {#silje-seongneung-ceugjeong}

> [!WARNING]
> 헤드리스 Chrome은 종종 소프트웨어 래스터화와 다른 프레임 스케줄링을 사용합니다. FPS를 동일 환경 내 회귀 신호로 취급하고, 하한 또는 프로덕션 예측으로 사용하지 마세요.

### FPS를 지표로 사용하지 마세요

FPS는 수직 동기화에 의해 제한되므로 **포화**됩니다 — 포화된 숫자는 회귀와 개선을 모두 숨깁니다. 실제 측정 예시: 한 장면이 59 FPS를 보고했지만 17ms 프레임 중 3.4ms만 작업하고 있었고, 각 프레임의 약 80%를 유휴 상태로 보내고 있었습니다. 단지 60Hz 수직 동기화를 협상한 것뿐입니다. 그 59라는 숫자는 코드에 대해 아무것도 말해주지 않습니다.

진단에 중요한 추론: **FPS가 제한된 경우 "X를 변경했는데 FPS가 움직이지 않았다"는 아무것도 증명하지 않습니다.** 변경 전후 모두 프레임 예산 내에 편안하게 있을 수 있습니다.

대신 다음을 측정하세요:

- **프레임 시간 백분위수**(p50/p99), 평균이 아닙니다. 고주사율 디스플레이에서 프레임 시간은 수직 동기화에 의해 1x/2x/3x 간격의 버킷으로 양자화되며 그 사이에는 아무것도 없으므로 평균은 절대 발생하지 않는 값을 설명합니다.
- **예산 내 프레임 비율** — 모션이 안정적으로 느껴지는지 결정하는 숫자입니다. 240Hz에서 예산은 4.17ms이고 60Hz에서는 16.67ms입니다.
- **각 단계 비용을 개별적으로**(레이아웃, JS 배칭, GPU 제출) 측정하여 어떤 부분을 공략해야 할지 알 수 있습니다.

### GPU 시간 귀속에는 `gl.finish()`가 필요함

WebGL 호출은 비동기적입니다. draw나 `flush()`를 `performance.now()`로 감싸면 **큐 삽입** 시간이 측정되며 GPU 작업 시간이 아닙니다 — 우리 측정에서 둘 사이에는 최대 5배 차이가 있습니다. 제출 비용을 정직하게 귀속하려면 작업을 수행한 후 파이프라인을 강제로 비우세요:

```typescript
const t0 = performance.now();
drawEverything();
gl.finish(); // 프레임을 직렬화합니다; 이 없이는 숫자가 의미가 없습니다
const submitMs = performance.now() - t0;
```

`EXT_disjoint_timer_query_webgl2`는 더 나은 도구처럼 보이지만 실제로는 신뢰할 수 없습니다: Firefox는 일반적으로 이를 노출하지 않으며, Chrome에서는 종종 존재하지만 사용 가능한 샘플을 반환하지 않습니다(매번 시도마다 사용 불가 또는 분리 보고). 이에 기반한 측정 전략을 구축하지 마세요.

### Node나 Bun이 아닌 브라우저에서 벤치마킹하세요

서버 런타임은 사용자 대면 작업에 적합한 도구가 아닙니다: GPU 없음, 컴포지터 없음, DPR 없음, 다른 JIT 워밍업 및 타이머 해상도. 이들은 **원인 격리**에는 유용하지만(Node 프로브로 발견된 최적화 사례가 있습니다), 인용할 수치를 생성하는 데는 적합하지 않습니다. **Bun/JSC에서 12.4배로 측정된 변경이 실제 브라우저에서는 3.2–4.7배**였으며, 약 3배 낙관적이었습니다.

두 엔진 모두에서 인용하세요. V8과 SpiderMonkey는 상당히 다르며, 단일 엔진 수치는 반복적으로 오해를 불러일으켰습니다.

### 실용적인 체크리스트

1. 실제 GPU 하드웨어가 있는 실제 브라우저에서 실행하세요.
2. N의 중앙값을 보고하세요(7이 합리적인 기본값), 시나리오를 정확히 명명하세요.
3. 브라우저 + 버전, CPU/GPU, 뷰포트 CSS 크기 **및 DPR**, 엔티티 및 표시 개수, 백엔드 선택, 디스플레이의 주사율을 기록하세요.
4. PR과 문서에서는 브라우저 내 측정값을 인용하고, 헤드리스 출력은 절대 인용하지 마세요.

사용자 정의 벤치마크의 경우, `update()` 루프에서 프레임 시간을 수집하고 백분위수를 보고하세요:

```typescript
const samples: number[] = [];

class BenchEntity extends Entity {
  update(dt: number, time: number) {
    super.update(dt, time);
    if (samples.length < 300) samples.push(dt);
    if (samples.length === 300) {
      const sorted = [...samples].sort((a, b) => a - b);
      const pct = (q: number) => sorted[Math.floor(sorted.length * q)]!;
      const budget = 1000 / 60; // 고주사율 패널에서는 1000 / 240 사용
      const inBudget = samples.filter((s) => s <= budget).length / samples.length;
      console.log(
        `p50 ${pct(0.5).toFixed(2)}ms  p99 ${pct(0.99).toFixed(2)}ms  ` +
          `inside budget ${(inBudget * 100).toFixed(1)}%`,
      );
    }
  }
}
```

`dt`는 밀리초 단위입니다. 이는 프레임 _간격_을 보고하며, 수직 동기화 하에서는 양자화됩니다 — 예산을 충족했는지는 알려주지만 얼마나 여유가 남았는지는 알려주지 않습니다. 여유를 측정하려면 제어하는 단계의 시간을 측정하세요.

## 빠른 참조: 문제별 해결 방법

| 증상                                        | 해결 방법                                                                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 유휴 상태에서 Scene이 2fps로 스로틀링됨     | 정상입니다 — 상태 변경 시 `markDirty()`를 호출하거나, 대부분 정적인 장면에는 `renderMode: 'onDemand'`를 사용하세요                |
| 수동 애니메이션 엔티티가 2fps로 떨어짐      | `hasPendingAnimations()`를 재정의하거나 `animateTo()` / `springTo()`를 통해 구동하여 Scene이 움직임이 진행 중임을 알게 하세요     |
| 정적 UI가 배터리를 낭비함                   | `renderMode: 'onDemand'`로 전환하세요                                                                                             |
| 많은 호환 가능한 원이 느림                  | 대상 장치에서 `pointBackend: 'webgl'` + `getBatchCircle()`을 벤치마킹하세요                                                       |
| 화면 밖 엔티티가 CPU를 낭비함               | 엔티티에 `getBounds()`를 구현하세요                                                                                               |
| 애니메이션 중 DOM 쓰기 오버헤드             | `a11ySyncInterval: 100`을 설정하세요                                                                                              |
| 리사이즈 시 텍스트 리플로우가 느림          | `setText()` 대신 `setMaxWidth()`를 사용하세요                                                                                     |
| 밀집된 텍스트로 인한 할당 압력              | `LayoutResultBuffer` + `layoutPreparedIntoBuffer()`를 사용하세요                                                                  |
| CI에서 FPS가 다름                           | 동등한 CI 실행 간에 비교하고, 대상 하드웨어에서 사용자 대면 처리량을 측정하세요                                                   |
| 동적 파티클이 CPU 예산을 소진함             | `ComputeParticleEntity`를 벤치마킹하여 고정된 힘 모델을 WebGPU로 오프로드하세요                                                   |
| 여러 줄 텍스트 리플로우가 스레드를 중단시킴 | `LayoutWorkerManager`를 통해 `MSDFTextEntity` 레이아웃을 스레드 외부로 위임하세요 (기본 `Text`/`RichText`는 메인 스레드에 유지됨) |
| 엔티티 상호작용의 바다가 $O(N^2)$임         | `SpatialHashGrid` 구현 — 평균 $O(k)$로 줄지만, 심한 클러스터링 시 자동이 아니므로 데이터에 맞게 셀을 크기 조정하세요              |
