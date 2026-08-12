+++
title = "FAQ"
description = "VectoJS에 대한 자주 묻는 질문 — 아키텍처 결정, 성능, 접근성 및 문제 해결."
weight = 49
+++

# 자주 묻는 질문 (FAQ)

## 아키텍처

### 왜 DOM 대신 캔버스를 사용하나요?

DOM은 의미론적 문서 구조, CSS 레이아웃 및 성숙한 접근성 모델을 제공합니다. 커스텀 지오메트리 또는 크고 자주 변경되는 시각적 집합이 지배적인 워크로드의 경우, 캔버스는 그리기 가능한 요소당 하나의 스타일이 지정된 DOM 노드를 피하고 애플리케이션에 직접적인 레이아웃/렌더 제어권을 제공합니다. 또한 레이아웃, 히트 테스팅, 의미론 및 성능 측정에 대한 책임을 프레임워크/애플리케이션으로 이동시킵니다.

### 모든 것이 캔버스에 그려지면 접근성은 어떻게 작동하나요?

`Scene`은 적격한 대화형 엔터티에 대해 실제 `<button>`, `<input>`, `<a>` 및 `<div>` 엘리먼트로 구성된 접근성 투영 오버레이(`a11yRoot`)를 유지 관리합니다. 이는 브라우저의 Shadow DOM API가 아닙니다. 오버레이는 캔버스 오프셋/CSS 스케일링과 각 엔터티의 아핀 변환을 따르고, 네이티브 포인터/키보드/포커스 이벤트를 수신하며, DevTools 및 역할 기반 자동화에 표시됩니다. 애플리케이션은 여전히 올바른 역할, 레이블, 포커스 순서, 키보드 동작 및 스크린 리더 테스트가 필요합니다.

`entity.interactive = true`를 설정하여 섀도우 노드를 투영하세요. `getA11yAttributes()`를 오버라이드하여 태그와 ARIA 속성을 제어하세요:

```typescript
getA11yAttributes() {
  return { tag: 'button', role: 'button', label: 'Submit form' };
}
```

### React / Vue / Svelte 통합이 있나요?

아직 퍼스트파티 패키지로 제공되지는 않습니다. VectoJS는 `<canvas>` 엘리먼트를 소유하므로, WebGL 라이브러리와 정확히 같은 방식으로 모든 프레임워크와 통합됩니다 — 캔버스를 마운트하고, 생명주기 훅(`useEffect`, `onMounted` 등)에서 `Scene`을 초기화하고, 언마운트 시 정리합니다.

```typescript
// React 예시
import { useEffect, useRef } from 'react';
import { Scene } from '@vectojs/core';

export function VectoCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const scene = new Scene(canvasRef.current!, { maxFPS: 60 });
    scene.start();
    return () => scene.destroy();
  }, []);
  return <canvas ref={canvasRef} />;
}
```

### 두 Scene을 타일처럼 매끄럽게 이어붙일 수 있나요?

하나의 논리적 표면으로는 불가능합니다. `Scene`은 정확히 하나의 `<canvas>`와 하나의 루트 `Entity` 트리를 소유합니다 — 두 `Scene`이 좌표 공간을 공유하거나, 엔터티를 서로 전달하거나, 경계를 넘어 히트-테스트할 수 있는 API는 없습니다. 두 `Scene` 인스턴스를 나란히 실행하는 것(일반 CSS로 위치된 두 캔버스)은 작동하고 매끄럽게 보일 수 있지만, 기능적으로는 독립적으로 유지됩니다: 별도의 렌더 루프, 별도의 `renderMode`/더티 추적, 별도의 접근성 투영. 엔터티가 서로에 대해 상호작용, 변환 또는 히트-테스트해야 하는 경우, 두 Scene을 브리징하려고 시도하지 말고 하나의 Scene 트리에 넣으세요.

---

## 성능

### VectoJS는 60fps에서 몇 개의 엔터티를 처리할 수 있나요?

백엔드에 독립적인 개수는 없습니다: 경로 복잡성, 텍스트, 기기 픽셀 비율, 접근성 투영, 업데이트 작업, GPU/드라이버 및 표시 비율이 모두 결과를 변경합니다. 현재 체크인된 헤드리스 벤치마크는 1,000개 및 5,000개 노드에서 단순 Canvas 엔터티를 다룹니다; 이는 6자리 WebGL/WebGPU 주장에 대한 증거가 아닙니다. 대상 하드웨어에서 데모 리포트를 실행하고 워크로드에 대한 프레임-시간 백분위수를 기록하세요.

### `pointBackend: 'webgl'` 옵션이 무엇인가요?

설정되면, Scene은 메인 Canvas2D 캔버스 위에 투명한 WebGL2 캔버스를 쌓습니다. `getBatchCircle()` / `getBatchRect()`를 구현하는 표현 가능한 리프 엔터티는 타입화된 버퍼로 수집되어 배치된 WebGL 드로우로 제출되는 반면, 텍스트, 이미지, 복잡한 셰이프 및 지원되지 않는 아핀 변환은 Canvas2D에 남습니다. 하드웨어에 대한 크로스오버를 측정하세요; 저장소에는 현재 검증된 범용 속도 향상 계수가 포함되어 있지 않습니다.

### `renderMode: 'onDemand'`란 무엇인가요?

`'onDemand'` 모드에서 Scene은 `scene.markDirty()`가 호출되거나 애니메이션 드라이버가 진행 중일 때만 그립니다. 정적 틱은 여전히 rAF를 예약하고 트리에서 보류 중인 모션을 검사하지만, 엔터티 업데이트/렌더 작업 및 GPU 제출을 건너뜁니다. 주로 정적인 UI(대시보드, 폼, 메뉴)에 사용하세요.

```typescript
scene.renderMode = 'onDemand';
entity.on('click', () => {
  entity.animate({ x: entity.x + 50 }, 300); // 자동으로 더티 트리거
});
```

### Node.js / 헤드리스에서 테스트할 때 FPS가 낮은 이유는 무엇인가요?

헤드리스 Chrome은 종종 소프트웨어 래스터라이저를 사용하고 다른 스케줄링/vsync 동작을 가집니다. 해당 FPS는 동일한 환경에서 회귀 비교에는 유용하지만, 사용자 GPU의 하한 또는 예측으로는 유용하지 않습니다. 대상 브라우저와 하드웨어에서 측정하세요.

> [!TIP]
> Nexus 데모의 **Export report** 버튼을 사용하여 현재 하드웨어와 브라우저로 실제 GPU 측정값을 얻으세요. 헤드리스 FPS 대신 해당 숫자를 PR에 복사-붙여넣기하세요.

---

## Entity API

### `clipChildren`이란 무엇인가요?

`clipChildren = true`를 설정하면 일반 자식 드로잉을 엔터티의 `[0,0]–[width,height]` 박스로 클리핑합니다. 이것이 `ScrollView`가 오버플로를 구현하는 방법입니다. CanvasRenderer와 SVGRenderer는 변환된 클립을 보존합니다. ThreeRenderer는 클립의 변환된 세계 AABB를 사용하여 가위 직사각형을 교차하므로, 회전/기울어진 클립은 축-정렬 근사치입니다. 별도의 WebGL 포인트 레이어 및 WebGPU 파티클 오버레이로 승격된 기본 요소는 부모 렌더러의 클립 스택에 의해 클리핑되지 않습니다.

### `a11yFullViewport`란 무엇인가요?

일반적으로 섀도우 DOM 노드는 `entity.interactive && entity.width > 0`일 때만 투영됩니다. 전체 Scene 뷰포트를 덮는 엔터티(무한 캔버스 그래프, 전체 화면 제스처 인식기)에는 의미 있는 경계 상자가 없습니다. `a11yFullViewport = true`를 설정하면 다른 모든 섀도우 노드 뒤에 Scene 크기의 섀도우 노드가 생성됩니다; 그런 다음 투영 루트는 해당 논리적 박스를 캔버스 CSS 박스에 매핑합니다.

### 내 `Entity.update()` 애니메이션이 예상보다 두 배 빠릅니다 — 이유가 무엇인가요?

> [!CAUTION] > `Entity.update(dt, time)`는 **dt를 밀리초** 단위로 받습니다(초가 아닙니다). 이것이 가장 흔한 VectoJS 주의사항입니다. 60fps에서 `dt` ≈ 16.7이지 0.017이 아닙니다.

초를 사용하는 물리 라이브러리에서 포팅할 때 흔한 실수:

```typescript
// 틀림: ms를 초로 처리 → 1000배 너무 빠름
this.x += velocity * dt;

// 올바름: 초로 변환하거나 ms 단위 사용
this.x += velocity * (dt / 1000);
```

스프링 물리(`SpringPhysics`, `ScrollView`)는 내부적으로 `dt / 1000`을 사용하여 시뮬레이션을 실행하기 전에 변환합니다.

### `emit()`과 `dispatchEvent()`의 차이점은 무엇인가요?

- `entity.emit(event, payload)` — 엔터티 자체의 **버블-페이즈** 리스너만 실행합니다. 트리 탐색 없음. 이는 컴포넌트-내부 경로입니다(예: 폼 컨트롤이 자체 `change`를 발행).
- `entity.dispatchEvent(event)` — 전체 DOM-스타일 **캡처 + 버블** 탐색을 실행합니다: 캡처는 루트 → 타겟, 버블은 타겟 → 루트로 이동. 이것이 Scene이 포인터 이벤트를 디스패치하는 방식입니다.

---

## 커스터마이제이션 및 애니메이션

### VectoJS의 커스터마이제이션 범위는 어디까지인가요 — 스플래시 화면이나 트랜지션 스타일 효과도 가능한가요?

네. 애니메이션 가능한 모든 속성(`x`, `y`, `scaleX`, `scaleY`, `rotation`, `opacity`)은 `TweenDriver`(곡선 기반, 내장 `Easing` 세트 또는 커스텀 함수 사용) 또는 `SpringDriver`(물리 기반, 설정 가능한 `stiffness`/`damping`/`mass` 사용)로 구동될 수 있습니다. 특히 파티클-헤비 효과의 경우, `particleBackend: 'webgpu'`와 함께 `ComputeParticleEntity`는 스프링-투-오리진 힘, 마우스 반발, 속도 클램핑, 가장자리 바운스 및 전용 **폭발 힘** 매개변수(`triggerExplosion(x, y, force)`)가 있는 컴퓨트 셰이더를 실행합니다 — 버스트/스플래시 효과는 트윈으로 가짜로 만들어야 하는 것이 아닌 일급 기본 요소입니다. CPU 폴백(`updateCPU`)은 WebGPU를 사용할 수 없을 때 동일한 힘 모델을 미러링합니다.

### `Entity`의 셰이프는 어떻게 정의되나요 — 오각형, 타원, 불규칙 다각형도 가능한가요?

네, 셰이프는 실제로 두 개의 독립적인 오버라이드 가능한 관심사입니다:

- **시각적 셰이프**: `render(renderer)`는 `IRenderer`의 벡터 경로 기본 요소(`moveTo`, `lineTo`, `bezierCurveTo`, `arc`, `closePath`)를 통해 그립니다 — 수동 작성 Canvas2D/SVG 경로가 사용하는 것과 동일한 기본 요소이므로 모든 다각형, 타원 또는 곡선 외곽선을 그릴 수 있습니다. `SplineEntity`는 내장된 예시입니다: 임의의 3차-다항식 곡선을 Bézier 세그먼트로 변환하여 렌더링합니다.
- **히트-테스트 셰이프**: `isPointInside(globalX, globalY): boolean`은 기본 `Entity` 클래스에서 `abstract`입니다 — 모든 구체적 엔터티는 자체 로직을 제공합니다. 축-정렬 경계 상자를 요구하지 않으며(또는 기본값으로 사용하지 않음); 오각형의 `isPointInside`는 실제 점-다각형 수학을 수행할 수 있고, 타원은 이차-형식 검사를 수행할 수 있습니다.

두 메서드가 분리되어 있으므로, 셰이프의 클릭 가능한 영역이 그려진 실루엣과 정확히 일치할 필요가 없습니다(작은 셰이프의 넉넉한 터치 대상에 유용).

### 텍스트와 컴포넌트가 다른 기기와 브라우저 줌 수준에 적응하나요? 텍스트 리사이징이 완전히 적응적인가요?

메커니즘은 있지만, 기본적으로 자동이라기보다는 명시적입니다:

- **HiDPI**: `CanvasRenderer`는 생성 시와 `resize()` 시 `window.devicePixelRatio`를 읽고, 그에 따라 캔버스 백킹 스토어를 스케일링합니다 — Retina/HiDPI 디스플레이는 추가 앱 코드 없이 선명하게 렌더링됩니다.
- **브라우저 줌**: 대부분의 브라우저는 줌 시 유효 `devicePixelRatio`를 변경하고 `window` `resize` 이벤트를 발생시키며, `Scene`은 이미 이를 리스닝하고 렌더러의 `resize()`를 호출하여 응답합니다.
- **텍스트 리플로우**: `LayoutEngine.setMaxWidth()`는 이를 위해 특별히 설계된 저렴한 "핫 경로"입니다 — 마지막 콜드 `prepare()` 패스의 캐시된 이미 측정된 `PreparedText`를 재사용하고, 재분할이나 재측정 없이 줄바꿈만 다시 수행합니다. 자체 리사이즈 핸들러에서 이를 호출하여 새 너비에서 저렴하게 텍스트를 리플로우하세요.

즉: 적응형이고 리사이즈-저렴한 레이아웃을 위한 기본 요소가 존재하며 UI 컴포넌트에서 내부적으로 사용되지만, 원시 커스텀 `Entity`는 "공짜로" 리플로우되지 않습니다 — 즉시-모드 렌더러에서 캔버스 리사이즈를 연결하는 것과 같은 방식으로 리사이즈 핸들러를 관련 `setMaxWidth`/레이아웃 호출에 직접 연결해야 합니다.

### VectoJS의 애니메이션 모델은 CSS 애니메이션과 어떻게 다른가요? 모든 것이 렌더링 전에 미리 계산되나요?

아니요 — 아무것도 미리 키프레임으로 굽지 않습니다. `TweenDriver.tick(dtMs)`와 `SpringDriver.tick(dtMs)`는 실시간 적분기입니다: 각 프레임은 사전 계산된 타임라인이 아닌, 마지막 프레임 이후의 _실제_ 경과 시간에서 진행됩니다. `SpringPhysics`(`SpringDriver`의 엔진)는 고정된 서브스텝에서 라이브 Euler 적분을 수행하며, 백그라운드 탭이 반환 시 제공할 수 있는 큰 `dt`에 대한 안정성 클램프가 있습니다.

실용적인 차이는 애니메이션 도중 타겟을 변경할 때 나타납니다: 스프링의 `driver.retarget(to)`는 현재 값과 속도를 유지하고 새 타겟을 향해 계속 부드럽게 적분합니다 — 스냅 없음, 재시작 없음. 타겟이 비행 중에 변경되는 CSS 트랜지션/애니메이션은 일반적으로 다시 시작되거나 점프하는데, 이는 물리학을 프레임별로 시뮬레이션하는 대신 미리 결정된 곡선을 따라 보간하기 때문입니다.

### 컴포넌트의 기본 스프링/관성 애니메이션을 비활성화하거나 표준 트랜지션으로 변경하려면 어떻게 해야 하나요?

기본적으로 VectoJS 스크롤 가능 컴포넌트(`ScrollView` 및 `VirtualList` 등)와 속성은 부드러운 트랜지션을 위해 스프링 기반 물리(`'spring'`)를 사용합니다. 더 빠르고 즉각적인 동작을 위해 이러한 애니메이션을 비활성화하거나 표준 cubic-bezier 트랜지션(`easeOutCubic` 등)으로 전환하려면 세 가지 주요 방법이 있습니다:

#### 1. 대상 Entity에서 트랜지션 구성 변경

모든 `Entity`는 `setTransition` 메서드를 노출합니다. 대상 엘리먼트에서 `setTransition`을 호출하여 기본 스프링 트랜지션을 커스텀 `duration`(밀리초) 및 `easing` 함수로 재정의하거나 완전히 비활성화할 수 있습니다:

```typescript
// 바운스 없는 빠른 트랜지션으로 변경 (easeOutCubic 등)
entity.setTransition({
  y: { duration: 120, easing: 'easeOutCubic' },
});

// 애니메이션 완전 비활성화 (즉시 스냅)
entity.setTransition({
  y: null, // 트랜지션 드라이버 제거
});
```

#### 2. 스프링을 작동시키지 않고 즉시 위치 스냅

설정된 트랜지션을 트리거하지 않고(스프링을 완전히 우회하여) 엔터티를 즉시 이동하려면 `setImmediate` 메서드를 사용하세요:

```typescript
// 위치를 즉시 목표로 스냅
entity.setImmediate('y', targetY);
```

#### 3. 모바일 스크롤을 위한 캔버스 물리 우회

모바일 사용자가 Canvas-시뮬레이션된 스프링 대신 네이티브 모멘텀 스크롤을 기대하는 전체 화면 페이지의 경우, 터치 제스처를 브라우저 뷰포트로 전달하세요:

1. 터치 리스너를 Canvas에 바인딩하여 터치 드래그 델타를 네이티브 윈도우 스크롤로 변환:

   ```typescript
   let touchStartY = 0;
   canvas.addEventListener(
     'touchstart',
     (e) => {
       if (e.touches && e.touches[0]) touchStartY = e.touches[0].clientY;
     },
     { passive: true },
   );

   canvas.addEventListener(
     'touchmove',
     (e) => {
       if (e.touches && e.touches[0]) {
         const touchY = e.touches[0].clientY;
         window.scrollBy(0, touchStartY - touchY);
         touchStartY = touchY;
       }
     },
     { passive: true },
   );
   ```

2. `window` `"scroll"` 이벤트를 리스닝하고 `setImmediate` 또는 빠른 이징 트랜지션을 사용하여 스크롤 위치를 렌더링 컨테이너와 동기화:

   ```typescript
   window.addEventListener('scroll', () => {
     mainScroll.y = -window.scrollY; // Or mainScroll.setImmediate('y', -window.scrollY);
   });
   ```

---

## UI 컴포넌트 및 Devtools

### devtools는 무엇을 제공하며, 디버깅에 어떻게 도움이 되나요?

`@vectojs/devtools`는 인-페이지 인스펙터입니다 — VectoJS로 자체 렌더링된 패널로 다음을 제공합니다:

- Virtual Math Tree의 라이브 트리 뷰(엔터티 타입, 지오메트리 및 활성 애니메이션에 대한 배지 포함)
- 일회성 엔터티 선택(캔버스에서 엔터티를 클릭하여 트리에서 선택)
- 세계-변환 판독값(전체 조상 체인 후 실제로 계산된 위치, 스케일, 회전)
- 선택된 엔터티의 키보드 미세 이동 편집
- 선택된 엔터티의 세계 경계를 보여주는 호스트-페이지 오버레이 강조

`Scene`은 도구가 특권 내부 액세스 없이 트리를 탐색할 수 있도록 특별히 읽기 전용 `rootEntity`/`overlayRootEntity` 접근자를 노출합니다.

### VectoJS의 네이티브 UI 컴포넌트를 사용할 때 주의할 점은 무엇인가요?

컴포넌트 세트를 직접 감사하여 얻은 몇 가지 알아두면 좋은 패턴:

- **`entity.id` 고유성은 사용자의 책임입니다.** 엔진이 이를 강제하지 않습니다. 접근성 투영(`Scene`이 섀도우 DOM 노드를 엔터티 id로 키잉)과 엔터티를 id로 인덱싱하는 자체 코드(예: `SpatialHashGrid`)에 가장 중요합니다 — `Map`에서 키를 선택하는 것과 같은 방식으로 id를 선택하세요.
- **다른 엔터티에 리스너를 연결하는 컴포넌트는 `destroy()`되어야 합니다.** `Tooltip`, `Popover` 및 유사한 "대상에 연결" 컴포넌트는 핸들러를 저장하고 `destroy()`에서 제거합니다 — 수동으로 추가된 리스너를 제거하는 것과 같은 방식으로, 컴포넌트 사용이 끝나면 항상 호출하세요.
- **`interactive = true`는 공짜가 아닙니다.** 설정하면 해당 엔터티에 실제 섀도우 DOM 노드가 투영됩니다. 버튼, 링크 및 폼 컨트롤에는 괜찮지만, 매우 큰 리프 엔터티 컬렉션에서는 피하세요. 예를 들어 `GridTextEntity`는 전체 그리드에 대해 명시적으로 `interactive`를 비활성화하여 대규모에서 문자당 섀도우 노드를 투영하는 것을 방지합니다.
- **커스텀 드래그 기반 컴포넌트는 내장 포인터-캡처 패턴을 따라야 합니다.** `Slider` 및 관련 컴포넌트는 `pointerdown` 시 `setPointerCapture()`를 호출합니다(a11y-투영된 엘리먼트를 통해). 이는 컴포넌트의 시각적 범위를 초과하는 빠른 드래그가 계속 추적을 유지할 수 있게 합니다. 자체 드래그 가능 컴포넌트를 구축하는 경우 `pointermove`/`pointerleave`에만 의존하지 말고 동일한 패턴을 따르세요. 브라우저 중단이 드래그 또는 선택 트랜잭션을 활성 상태로 남길 수 없도록 `pointercancel`을 롤백 경로로 처리하세요.

---

## 접근성 및 자동화

### 컴포넌트가 Playwright의 `page.getByRole()`에서 작동하게 하려면 어떻게 해야 하나요?

`getA11yAttributes()`에서 올바른 태그와 역할을 반환하세요:

```typescript
// 접근 가능한 버튼
getA11yAttributes() { return { tag: 'button', role: 'button', label: 'Send' }; }

// 접근 가능한 링크
getA11yAttributes() { return { tag: 'a', role: 'link', label: 'Home', href: '/' }; }

// 접근 가능한 텍스트 필드
getA11yAttributes() { return { tag: 'input', inputType: 'text', placeholder: 'Search…' }; }
```

내장 컴포넌트(`Button`, `Input`, `Link` 등)는 자동으로 이 작업을 수행합니다.

### 섀도우 노드 위치가 잘못 보입니다 — 엔터티가 오프셋됨

두 가지 일반적인 원인:

1. **캔버스 부모가 `position: relative`가 아님** — `Scene`은 매 프레임마다 자동으로 이를 강제 적용하지만, Scene이 시작된 후 다른 CSS 규칙이 `position: static`을 강제하면 절대 위치 지정된 섀도우 노드가 잘못된 컨테이닝 블록을 기준으로 오프셋됩니다.
2. **`a11yOffsetX` / `a11yOffsetY`** — 이전에 이를 해결책으로 설정한 경우, 먼저 제거하여 기본 위치 지정이 실제로 올바른지 확인하세요.

`SceneOptions`에서 `debugA11y: true`를 활성화하여 각 섀도우 노드 위에 반투명 강조 박스를 확인하세요:

```typescript
const scene = new Scene(canvas, { debugA11y: true });
```

---

## WebGPU 파티클

### `ComputeParticleEntity`가 아무것도 표시하지 않습니다 — 무엇이 문제인가요?

가장 일반적인 원인:

1. **`initRandomParticles()`가 호출되지 않음** — 파티클 데이터를 초기화하지 않으면 모든 위치가 `(0,0)`이고 크기가 `0`입니다.
2. **WebGPU를 사용할 수 없음** — Scene이 실패한 WebGPU 요청을 기록하고 CPU/Canvas2D 경로로 폴백합니다; `particleBackend: 'webgpu'`가 설정되어 있고 브라우저가 WebGPU를 지원하는지 확인하세요.
3. **캔버스 크기가 `0×0`** — 첫 번째 프레임 전에 `scene.resize(w, h)`를 호출하거나(또는 캔버스에 치수가 있는지 확인) 하세요.

### CPU 폴백은 어떻게 작동하나요?

WebGPU를 사용할 수 없거나(또는 실패하는 경우), `Scene`은 렌더링된 각 프레임에서 `entity.updateCPU(dt, mouseX, mouseY, width, height)`를 호출하고 `fillCircle`을 통해 파티클을 그립니다. 폴백은 스프링/반발/폭발/속도/바운스 모델을 미러링하지만, CPU/GPU 수치 경로와 처리량은 동일하게 보장되지 않습니다. 대상 기기에서 측정하여 파티클 수를 선택하세요.

### GPU에서 파티클 위치를 다시 읽을 수 있나요?

직접적으로는 불가능합니다 — 파티클 상태는 WebGPU 스토리지 버퍼에 있습니다. 이를 다시 읽으려면 `copyBufferToBuffer` + `mapAsync` 왕복을 발행해야 하며, 이는 GPU 파이프라인을 중단시킵니다. 대신 CPU에서 위치가 필요한 경우 CPU-측 `particleData` Float32Array를 동기화 상태로 유지하세요. `setOrigins()`, `setPositions()` 및 `setVelocities()`는 `particleData`에 쓰고 `needsInit = true`를 설정하여 다음 프레임에서 GPU 스토리지 버퍼로 업로드합니다.

> [!NOTE] > `mapAsync` + `copyBufferToBuffer` 읽기 복사는 의도적으로 파이프라인을 차단합니다. 대규모 충돌 감지 또는 공간 쿼리의 경우 `SpatialHashGrid`를 사용하여 CPU 경로에서 실행하거나 추가 WebGPU 컴퓨트 패스로 표현하세요.

---

## 문제 해결

### `Scene`이 실행 중이지만 화면에 아무것도 나타나지 않습니다

순서대로 확인하세요:

1. `scene.start()`가 호출되었나요?
2. 캔버스에 0이 아닌 `width`와 `height` CSS 및 HTML 속성이 있나요?
3. 엔터티가 `scene.add(entity)`를 통해 Scene에 추가되었나요(단지 생성만 한 것이 아니라)?
4. 엔터티의 `render()` 메서드가 실제로 `renderer.fill()` 또는 `renderer.stroke()`를 호출하나요? 빈 `render()`는 아무것도 그리지 않습니다.
5. `entity.opacity` > 0인가요?

### 내 스크롤 휠 이벤트가 `ScrollView`에 도달하지 않습니다

`ScrollView`는 페이지 스크롤을 방지하기 위해 `wheel` 이벤트에서 `e.preventDefault()`를 호출합니다. 섀도우 노드의 휠 리스너가 실행되지만 스크롤 뷰가 반응하지 않는 경우, `ScrollView.add(child)`가 사용되었는지(콘텐츠 래퍼를 우회하는 `entity.add(child)`가 아닌), 그리고 캔버스 부모에 포인터 이벤트를 차단하는 `overflow: hidden`이 없는지 확인하세요.

### TypeScript가 `Cannot find name 'GPUDevice'`를 보고합니다

프로젝트에 `@webgpu/types`를 추가하세요:

```bash
bun add -d @webgpu/types
```

그런 다음 `tsconfig.json`에 추가:

```json
{ "compilerOptions": { "types": ["@webgpu/types"] } }
```

### 텍스트나 이미지가 흐릿하게 보입니다 (DPR)

Canvas 텍스트는 기본적으로 디바이스 픽셀 비율로 렌더링됩니다 — 흐릿하게 보인다면 캔버스 백킹 스토어가 디스플레이보다 낮은 DPR로 크기 조정된 것입니다(보통 페이지가 확대/축소되었거나 사용자 정의 레이아웃 컨테이너가 `scene.resize()` 없이 크기를 조정했기 때문입니다). 두 가지 처리 방법:

- `maxDPR`은 렌더 DPR을 제한합니다(옵션 또는 실시간). 3x 폰에서 `maxDPR: 2`로 크기 조정된 정적 페이지는 비용을 제한된 범위로 유지합니다 — 그러나 패널의 실제 DPR보다 낮게 제한하는 것이 바로 흐릿함을 만드는 원인이므로 의도적으로 제한하세요.
- 수동으로 크기 조정/확대 후에는 `scene.resize(w, h)`를 다시 호출하세요 — 매번 `resize()`마다 DPR을 다시 읽고 백킹 스토어를 다시 만듭니다. `resize()` 없이 캔버스 CSS 박스가 변경된 씬은 이전 DPR로 렌더링되어 부드러워 보입니다; Firefox 선택 보정 증상(드래그 하이라이트가 글리프에서 벗어남)도 같은 원인입니다.

### MSDF 텍스트가 전혀 나타나지 않습니다 (또는 늦게 나타납니다)

`MSDFTextEntity`는 `blob:` Worker를 통해 오프스레드로 레이아웃합니다. 엄격한 CSP(`default-src 'self'`, `worker-src 'none'`, 또는 `blob:`이 없는 `script-src`)에서는 `new Worker(blob:…)`가 **예외를 던지지 않습니다** — 생성되고 `onerror`를 발생시키므로 CSP는 충돌과 똑같이 보입니다. 연속 두 번 실패하면 관리자는 포기하고 메인 스레드에서 레이아웃을 제공하므로 텍스트는 여전히 나타납니다 — 다만 worker를 통하지 않고, 폴백이 작동하는 동안 처음 몇 번의 요청은 "멈춘" 것처럼 보일 수 있습니다. 디버그 순서: 브라우저 콘솔에서 `worker-src` / `blob:` 위반을 확인하고(폴백은 거기서 보이지 않습니다), 그런 다음 씬이 실제로 `pointBackend: 'webgl'`을 실행하는지 확인하세요 — Canvas2D 폴백 경로는 `fallbackFont`가 설정되어 있어야 하며, 그렇지 않으면 그릴 것이 없습니다.

### 씬이 약 2fps에 멈춰 있습니다

이는 유휴 자동 스로틀이 설계대로 작동하는 것입니다: 정적 씬(더티가 아니고 보류 중인 전환이 없는)은 전력을 절약하기 위해 약 2fps로 렌더링됩니다. 콘텐츠가 애니메이션되어야 한다면 `entity.animate()` / `setTransition`으로 구동하거나(씬을 비정적으로 유지), 프레임 **사이**에서 `scene.markDirty()`를 호출하세요 — 이벤트 핸들러, 별도의 `rAF` 또는 타이머에서 — 절대 `update()` 내부에서 호출하지 마세요. 렌더 후 더티 리셋이 그 값을 지우기 때문입니다. 최후의 수단은 `scene.autoThrottle = false`(또는 `autoThrottle: false` 옵션)로, 조건 없이 매 프레임 렌더링합니다.

### `onDemand` 씬이 다시 그려지지 않습니다

`renderMode: 'onDemand'`는 씬이 더티이거나 전환이 보류 중일 때만 그립니다. 전형적인 실수: `scene.markDirty()`를 호출하지 않고 자신의 `update()` 또는 `Image` `onLoad`에서 엔터티 상태를 변경하는 것. UI 컴포넌트의 값/호버/포커스 변경(`Slider.setValue`, `ProgressBar.setValue`, `Button` 호버)은 모두 그에 재페인트를 게이트합니다. 프레임이 변경되어야 하는데 그렇지 않다면 `scene.markDirty()`를 한 번 호출하고(예: `onLoad`/이벤트 핸들러에서), 다음 rAF가 그것을 그립니다.

### 내 엔터티의 `click`/`hover` 이벤트가 전혀 발생하지 않습니다

이벤트는 **인터랙티브** 엔터티에서만 디스패치됩니다(`interactive = true`, 또는 스스로 이를 설정하는 컴포넌트, 또는 `label`이 있는 `Card`). `Text`/`RichText`는 의도적으로 비인터랙티브입니다 — 그들의 의미적 존재는 콘텐츠 투영이며, 선택 가능한 텍스트 위의 인터랙티브 섀도우 노드는 포인터를 가로챌 것입니다. 또한 엔터티에 실제로 박스가 있는지 확인하세요(`width`/`height` > 0 또는 `getBatchCircle`/`getBatchRect`): 히트 테스트에는 지오메트리가 필요합니다.

### `ScrollView`이 스크롤되지 않습니다

두 가지 확인: 콘텐츠가 실제로 뷰포트를 **초과**해야 합니다 — `updateContentSize()`는 자식 범위에서 최대 스크롤 범위를 계산하므로 뷰포트보다 작은 콘텐츠는 스크롤할 것이 없습니다 — 또한 기본 스프링은 저감쇠(ζ ≈ 0.45)이며 릴리스 시 약 20% 오버슈트합니다. 문서형 콘텐츠의 경우 `scrollPhysics: DOCUMENT_SCROLL_PHYSICS`(내보낸 `{ stiffness: 180, damping: 27 }` 프리셋, ζ ≈ 1.0, 오버슈트 없음)를 전달하세요.

### `Modal` / `Tooltip` / `Popover`이 열리지 않습니다

이들은 플로팅 레이어이며 씬의 자식이 아닙니다 — 스스로 마운트해야 합니다: `Modal`은 `scene.showOverlay(modal)`, `ContextMenu`/`Popover`는 `showAtPoint(x, y, source)`를 사용하며, 여기서 `source`는 메뉴가 마운트되기 전에 필요합니다(`Scene` 또는 마운트된 `Entity`). `Tooltip`/`Popover`은 또한 `target` 엔터티에 리스너를 부착합니다 — 다 쓴 후에는 반드시 `destroy()`하세요. 그렇지 않으면 핸들러가 누출됩니다.

### `Table` / `VirtualList`이 크기나 콘텐츠 변경을 무시합니다

`Table`은 생성자에서 `width`를 한 번만 해석합니다 — `setWidth()`(그리고 행의 경우 `appendRows()`)만 다시 레이아웃합니다; `table.width`를 직접 변경해도 아무 효과가 없습니다. `keyForItem`이 없는 `VirtualList`는 모든 행 측정을 지우고 `setItems()` 시 최상단으로 점프합니다 — 교체된 리스트에는 올바르지만 커지는 기록에는 잘못입니다; `keyForItem`(예: 메시지 id)을 전달하고 선택적으로 `stickToBottomThreshold`를 전달하여 따라가는 뷰포트를 하단에 고정하세요.

### Three.js 텍스처가 오래되었습니다 / 고정되어 있습니다

`ThreeAdapter`는 VectoJS 씬이 실제로 **렌더링**할 때만 `texture.needsUpdate`를 설정합니다(`Scene.render`를 프록시합니다). `renderMode: 'onDemand'`에서는 유휴 씬이 절대 렌더링하지 않으므로 텍스처가 마지막 프레임을 유지합니다. 일시 중지된 패널의 경우 `markDirty()` / `step()`을 구동하거나(예: Three의 rAF에서), 씬을 `'always'` 모드로 실행하세요.

### graph3d 레이아웃이 폭발하거나 컴포넌트가 서로 떨어져 표류합니다

두 레이아웃 모두 포스 모델입니다: **폭발하는** 그래프는 보통 `setGraph` 이후의 링크 불일치입니다(링크가 더 이상 존재하지 않는 노드 id를 참조 — 누락된 노드의 위치는 초기화되지 않음). `forceCenter` 아래에서 컴포넌트가 서로 떨어져 표류하는 것은 끊긴 하위 그래프에 대한 포스 모델의 정상적인 동작입니다 — `centerStrength`(VectoForceLayout)를 추가하거나 표류를 받아들이세요. 실행 간 안정성이 중요할 때는 `seed`가 있는 `VectoForceLayout`을 사용하세요 — 결정적입니다; `D3ForceLayout`은 d3 자체의 무작위 배치에서 시작하며 결정적이지 않습니다. 고정된 노드는 `fx/fy/fz`를 유지합니다(초기 `x/y/z` 시드는 고정이 아닌 시작 위치로 이월됩니다).

### `@vectojs/styles` — 내 `var(--token)`이 해석되지 않습니다 / 테마가 전혀 변경되지 않습니다

`var(--key)`는 `applyStyle` 시점에 **활성** 테마에 대해 해석되며, 토큰을 포함하는 스타일은 `setTheme(next)`가 실행될 때 다시 적용됩니다. 색상이 전혀 변하지 않는다면 스타일에 리터럴 값(`var()` 없이)이 들어 있는 것이며, 이는 의도적으로 추적되지 않습니다. `applyStyle` 자체가 `unknown token`을 던지면 키가 활성 테마에 없는 것입니다 — 키는 `--` 접두사 없이 작성된다는 점을 기억하세요(`tokens({ accent: … })` ↔ `var(--accent)`), 그리고 전환된 테마가 참조된 토큰을 떨어뜨리면 `setTheme`도 동일한 오류를 던집니다. 값이 속성 검증에 실패하는 토큰(예: `--radius-md: "50%"`)도 전환 시 던집니다. [`styles`](/reference/styles/)를 참조하세요.
