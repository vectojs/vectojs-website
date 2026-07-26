---
title: 'Entity'
description: '모든 Virtual Math Tree 노드의 추상 기본 클래스: 변환, 애니메이션 시스템, 캡처/버블 이벤트, 그리고 커스텀 Entity가 오버라이드할 수 있는 a11y/배치 훅.'
order: 3
---

# `Entity` (추상)

[`@vectojs/core`](/reference/core-api/)의 일부입니다.

Virtual Math Tree의 모든 노드에 대한 기본 클래스입니다. 서브클래싱하여
`isPointInside`와 `render`를 구현하세요.

```ts
abstract class Entity {
  abstract isPointInside(globalX: number, globalY: number): boolean; // MUST 구현
  abstract render(renderer: IRenderer): void; // MUST 구현
}
```

## 공개 속성

| 속성                         | 타입             | 기본값          | 참고                                                                                                                                                                              |
| ---------------------------- | ---------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                         | `string`         | `entity_<rand>` | 섀도우 노드 id / `data-vecto-id`로 사용됩니다.                                                                                                                                    |
| `children`                   | `Entity[]`       | `[]`            |                                                                                                                                                                                   |
| `parent`                     | `Entity \| null` | `null`          |                                                                                                                                                                                   |
| `scene`                      | getter           | —               | 부모 체인을 따라 소유 `Scene`(또는 `null`)을 찾습니다.                                                                                                                            |
| `x`, `y`                     | `number`         | `0`             | 로컬 위치.                                                                                                                                                                        |
| `scaleX`, `scaleY`           | `number`         | `1`             | 로컬 스케일.                                                                                                                                                                      |
| `rotation`                   | `number`         | `0`             | 로컬 회전, 라디안.                                                                                                                                                                |
| `opacity`                    | `number`         | `1`             | 모든 조상의 불투명도와 곱해진 후 일반, 배치, WebGPU 및 DOM-포털 출력에 적용됩니다.                                                                                                |
| `interactive`                | `boolean`        | `false`         | 설정자 부수 효과: `a11yNeedsReorder` + `markDirty()` 플래그 설정. `width`와 함께 a11y 투영을 게이팅합니다.                                                                        |
| `width`, `height`            | `number`         | `0`             | 히트 박스 / a11y 섀도우 박스 크기(× 스케일).                                                                                                                                      |
| `clipChildren`               | `boolean`        | `false`         | 일반 자식 그리기를 `[0,0]–[width,height]`로 클리핑; Canvas/SVG는 정확함. Three는 회전/기울어진 클립에 세계-AABB 가위를 사용. WebGL 포인트/WebGPU 오버레이 경로는 클리핑되지 않음. |
| `a11yOffsetX`, `a11yOffsetY` | `number`         | `0`             | 섀도우 노드를 엔터티의 전역 위치에 상대적으로 이동시킵니다.                                                                                                                       |
| `a11yFullViewport`           | `boolean`        | `false`         | `width === 0`인 경우에도 뷰포트를 채우는 섀도우 노드 투영; 다른 모든 노드 **뒤에** 마운트되어 상단 컴포넌트가 클릭 가능하게 유지됩니다.                                           |
| `isDOMPortal`                | `boolean`        | `false`         | `DOMPortalEntity`를 표시; 포털은 a11y 동기화에서 건너뜁니다.                                                                                                                      |

> **A11y 투영에는 박스가 필요합니다.** 섀도우 노드는
> `interactive && (width > 0 || a11yFullViewport)`일 때만 생성됩니다.
> `width: 0`이고 `a11yFullViewport`가 없는 대화형 엔터티는 섀도우 노드가 **없습니다** — `width`/`height`를 설정하세요.

## 트리 및 변환 메서드

```ts
add(...children: Entity[]): this             // 하나 이상의 자식을 순서대로 첨부; a11yNeedsReorder + markDirty도 플래그 지정
remove(child: Entity): this
set(props: Partial<this>): this              // 여러 자체 속성을 일반 설정자를 통해 할당; this 반환
setPosition(x: number, y: number): this
getGlobalPosition(): Point                   // 세계 위치; 루트까지(루트 제외) translate→scale→rotate 누적
getWorldTransform(): AffineTransform         // 정확히 누적된 Canvas T·S·R 행렬 { a,b,c,d,e,f }
localToWorld(localX: number, localY: number): Point
worldToLocal(worldX: number, worldY: number): Point | null // 특이 변환의 경우 null
getWorldBounds(): Bounds                    // 로컬 getBounds()(또는 width/height)를 세계 AABB로 변환
getWorldScale(): { x: number; y: number }    // 자체 + 조상 스케일의 곱 (루트 제외)
getWorldRotation(): number                   // 자체 + 조상 회전의 합 (루트 제외), 라디안
getBounds(): Bounds | null                   // 컬링용 로컬 AABB; null (기본값) = 절대 컬링되지 않음
destroy(): void                              // 애니메이션 + 리스너 정리, 부모에서 분리
```

`getWorldScale()`와 `getWorldRotation()`은 편의 누적 메서드입니다. 중첩된 회전과
비균일 스케일 아래에서는 구성된 행렬에 전단이 포함될 수 있습니다;
정확한 지오메트리가 중요한 경우 `getWorldTransform()`, `localToWorld()`, `worldToLocal()`, 또는
`getWorldBounds()`를 사용하세요.

1.9.0부터 `add()`는 **가변 인자**입니다 — `parent.add(a, b, c)`는 각 자식을
인자 순서대로 첨부합니다(단일-자식 경로는 O(1) 유지). `set(props)`는
생성 시 여러 속성을 한 번에 할당하는 인체공학적 도구로,
각 속성은 일반 설정자를 통해 할당되므로(`setTransition`이 설정된 속성은
여전히 애니메이션되고 `interactive`는 여전히 a11y 재정렬을 플래그 지정):
`rect.set({ x: 40, y: 40, width: 120, fill: '#38bdf8' })`. 주어진 객체에 대한
단순 `for…in`이며 프레임별 경로에 영향을 주지 않습니다. 둘 다
[`Rect`/`Circle`/`Group`](/reference/core-entities/)
기본 요소와 자연스럽게 짝을 이룹니다.

## 애니메이션

```ts
// 레거시 트윈 (유지됨)
animate(targetProps: Partial<this>, durationMs: number): this
hasPendingAnimations(): boolean

// 애니메이션 시스템 (0.2.0)
setTransition(config: Partial<Record<AnimatableProp, MotionConfig>>): this
animateTo(props: Partial<Record<AnimatableProp, number>>, cfg: TweenConfig): Promise<void>
springTo(props: Partial<Record<AnimatableProp, number>>, cfg?: SpringConfig): Promise<void>
```

`animate()`는 트윈을 큐에 추가합니다; 여러 호출은 **순차적으로 연결**됩니다. 숫자
속성만 보간되며; 이징은 고정된 ease-out(`p * (2 - p)`)입니다. 실행 중인
`animate()`는 Scene을 비-정적으로 유지하고(유휴 스로틀 탈출, [`Scene`](/reference/core-scene/#rendermode-maxfps-및-유휴-자동-스로틀) 참조)
애니메이션이 안정될 때까지 a11y 동기화를 중단합니다.

`hasPendingAnimations()`는 **오버라이드 가능**하며 Scene이 커스텀 모션을 확인하는 유일한 창입니다:
서브클래스가 `update()` 내부에서 자체 모션(수동 스프링 또는 속도)을 통합하는 경우
해당 모션이 진행 중인 동안 `true`를 반환하도록 오버라이드하세요 — `update()` 내부의 `markDirty()`는
같은 틱의 끝에서 다시 지워지므로, 오버라이드 없이 유휴 스로틀은
애니메이션을 2fps로 낮추고 `onDemand` 모드에서는 중단시킵니다.

**0.2.0 애니메이션 시스템** — 스프링 우선, 트윈과 스프링 통합:

- `setTransition`은 여섯 가지 애니메이션 가능 속성(`x`, `y`, `scaleX`,
  `scaleY`, `rotation`, `opacity`)이 어떻게 애니메이션될지 선언합니다; 이후 일반 할당
  (`entity.x = 400`)이 애니메이션을 실행하며, 진행 중인 모션을 재타겟팅하여 연속적인 움직임을 만듭니다.
  이 속성들은 설정된 트랜지션이 없을 때 제로-오버헤드 고속 경로를 가진 접근자입니다 —
  일반 할당은 일반 필드 쓰기로 유지됩니다.
- `animateTo` / `springTo`는 명령형으로 속성을 구동하고 모션이
  안정될 때 resolve됩니다; `animate()`와 달리 동시에 실행되며 `await`와 구성됩니다.
- `MotionConfig = 'spring' | SpringConfig | TweenConfig` (`duration`의 존재 여부가
  트윈을 선택). `TweenConfig.easing`은 `Easing` 내보내기의 `EasingName` 또는
  커스텀 `(t) => number`를 받습니다.
- `prefers-reduced-motion`을 존중합니다(움직임은 스냅, 불투명도는 페이드). 관련:
  `onMounted()`는 엔터티가 라이브 Scene에 연결될 때 실행 — UI 프레즌스
  헬퍼가 이를 사용하여 등장 애니메이션을 재생합니다.

사용법은 [Physics & Animation](/learn/physics-engine/)을 참조하세요.

## 이벤트 (`VectoEvent` / 캡처 + 버블)

```ts
type VectoEvent =
  | 'click' | 'hover' | 'pointerdown' | 'pointerup' | 'pointercancel' | 'pointermove' | 'pointerleave'
  | 'change' | 'focus' | 'blur' | 'wheel' | 'keydown' | 'keyup';

on(event: VectoEvent, cb: (e: any) => void, options?: { capture?: boolean }): this
off(event: VectoEvent, cb: (e: any) => void, options?: { capture?: boolean }): this
emit(event: VectoEvent, payload: any): void          // 자체 전용, 버블-페이즈 리스너 (레거시/컴포넌트-내부)
dispatchEvent(event: VectoJSEvent): void             // DOM-스타일 캡처 (루트→타겟) 후 버블 (타겟→루트)
```

- `on`/`off`는 기본적으로 **버블** 페이즈; 캡처 페이즈는 `{ capture: true }`를 전달하세요.
  버블 리스너는 레거시 `emit()` 경로에서도 실행됩니다.
- `VectoJSEvent<N>`은 `nativeEvent`를 래핑하고 `target`, `currentTarget`,
  `bubbles`, `stopPropagation()`, `stopImmediatePropagation()`,
  `preventDefault()`, 뷰포트 `clientX/Y`, 논리적 `sceneX/Y`, 현재-타겟
  `localX/Y`, 수정자 키 및 패스스루(`deltaX/Y`, `key`,
  `defaultPrevented`)를 추가합니다. 로컬 좌표는 완전한 중첩 아핀 변환을 역변환합니다.
  버블링되지 않는 이벤트도 캡처 페이즈를 실행하지만
  버블 페이즈에서는 타겟만 실행합니다.
- 폼-컨트롤 섀도우 `<input>`의 `'change'`는
  `{ value, checked, selectionStart, selectionEnd, composition }`을 전달하며,
  `composition`은 활성 IME 사전 편집에 대해 `{ start, length } | null`입니다.
  `'wheel'`은 네이티브 `WheelEvent`를 전달합니다(페이지 스크롤을 막으려면 `preventDefault()` 호출).

사용법은 [Events & Hit-Testing](/learn/events/)을 참조하세요.

## A11y / 배치 훅 (오버라이드하여 옵트인)

```ts
getA11yAttributes(): A11yAttributes          // 기본값 {} → 일반 투명 <div>
getBatchCircle(): BatchCircle | null         // { radius, color } → 렌더러 fillCircle 고속 경로 (균일-스케일 잎)
getBatchRect(): BatchRect | null             // { width, height, color } → GPU indexed-quad batch (WebGL pointBackend 전용)
update(dt: number, time: number): void       // 선택적 오버라이드; dt는 밀리초, time은 performance.now(); 기본값은 큐에 추가된 트윈 진행
```

`getBatchCircle`/`getBatchRect`는 **매 프레임** 읽힙니다(애니메이션된 color/radius
반영). 표현 가능한 배치 리프는 자체
`save/translate/scale/rotate/render/restore`를 건너뜁니다; Canvas 모드 또는 지원되지 않는
누적 아핀 변환은 엔터티의 일반 `render()` 폴백을 사용합니다.

전체 `A11yAttributes` 구조와 섀도우-DOM 동기화 작동 방식은
[a11yRoot & the agent contract](/reference/core-a11y/)를 참조하세요.

## 관련 항목

[`Scene`](/reference/core-scene/) (트리 소유) ·
[Renderers](/reference/core-renderer/) (`Entity.getContentProjection()`) ·
[a11yRoot & the agent contract](/reference/core-a11y/) ·
[`@vectojs/core` 개요](/reference/core-api/)
