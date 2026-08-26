+++
title = "애니메이션 (@vectojs/animation)"
description = "프로퍼티 드라이버, 트윈, 스프링, 그리고 이징 커브 — Entity.animate(), setTransition(), animateTo(), springTo() 뒤의 엔진."
weight = 54
+++

# `@vectojs/animation`

독립형 애니메이션 엔진: 부드러운 숫자 동작을 위한 프로퍼티 드라이버, 큐레이팅된
이징 세트, 그리고 모든 VectoJS 모션 표면이 공유하는 `MotionConfig` 형태.
`@vectojs/core`가 이에 의존하고 **재-내보내기**하므로 대부분의 앱은 이 패키지를
직접 가져오지 않습니다 — `entity.setTransition({ x: 'spring' })`,
`entity.animateTo(...)`, `entity.springTo(...)`, `entity.animate({...}, ms)`가
진입점입니다 ([`core-entity` # 애니메이션](/reference/core-entity/#aenimeisyeon) 참조).
커스텀 드라이버를 빌드하거나 이징을 독립적으로 사용하려면 직접 가져오세요:

```ts
import { TweenDriver, SpringDriver, Easing, EASING_IDS } from '@vectojs/animation';
```

## MotionConfig — 공유 구성 형태

```ts
type MotionConfig = 'spring' | SpringConfig | TweenConfig;

interface TweenConfig {
  duration: number; // ms (required — its presence selects a tween)
  easing?: EasingName | EasingFn; // named curve or custom fn, default 'linear'
  delay?: number; // ms before the tween starts, default 0
}

interface SpringConfig {
  stiffness?: number; // default 180
  damping?: number; // default 12
  mass?: number; // default 1
}
```

판별 규칙: `duration`이 있는 구성은 트윈이고, 그 외의 것은 스프링입니다
(`isTweenConfig(c)`가 정확히 이를 구현합니다). 단순한 `'spring'` 문자열은
"기본 스프링(default spring)"을 뜻합니다.

## 드라이버 (`PropertyDriver`)

```ts
interface PropertyDriver {
  value: number; // current value
  readonly target: number; // destination — applied exactly on completion
  retarget(to: number): void; // change destination; spring keeps velocity, tween restarts
  tick(dtMs: number): void; // advance by dt in milliseconds
  isDone(): boolean;
  syncExternal(value: number, extra: number): void; // adopt externally-advanced state
}
```

- **`TweenDriver(from, to, config: TweenConfig)`** — `duration` ms 동안
  `from`에서 `to`로의 이징 보간으로, 선택적 `delay`를 지원합니다. `retarget()`
  은 소비된 지연을 재청구하지 않고 목적지를 변경합니다: 세그먼트는 단조 경과 클록으로
  실행되며(초기 지연 중 재타겟팅도 남은 부분만 기다림), 빠른 연속 재타겟팅이 애니메이션을
  무기한 굶기지 못합니다.
- **`SpringDriver(from, to, config?: SpringConfig)`** — 질량-스프링-댐퍼
  적분기입니다 (`@vectojs/math`의 `SpringPhysics` 기반). `retarget()`은
  속도를 유지하므로 비행 중 재타겟팅이 연속적입니다. `target`은 정지
  엡실론 안이 아니라 완료 시 **정확히** 적용됩니다.
- `syncExternal(value, extra)`는 다른 곳에서 진행된 상태를 채택합니다 (예: WASM
  배치 틱): `extra`는 스프링의 경우 속도, 트윈의 경우 경과-ms입니다 —
  호출 후에도 `value`/`tick()`/`isDone()`/`retarget()` 모두 정확하게 유지됩니다.

**생성 시 방어와 틱 가드.** 조용히 잘못 설정된 드라이버는 결코 수렴하지 않고, 그
완료를 기다리는 모든 `await`를 hang시킵니다:

- `TweenDriver`는 알 수 없는 이징 이름 문자열을 생성 시 거부하고(과거에는 첫 틱에서
  맨 `TypeError`로 크래시했습니다), `tick(dt)`는 NaN, 0, 음수 dt를 무시합니다 — 경과
  클록은 절대 오염되지 않으며, WASM 배치 트윈 커널도 같은 스텝을 같은 방식으로 거부하므로,
  두 엔진 모두 다음 유효한 프레임에서 회복됩니다.
- `SpringDriver`는 비유한수 또는 비양수인 `stiffness`/`damping`/`mass`를 생성 시 거부하며,
  물리 기본값으로 조용히 폴백하지 않습니다 — 그런 스프링은 발산하거나 결코 수렴하지 않습니다.
- `isTweenConfig(null)`은 `false`를 반환합니다; 이 판별자는 신뢰할 수 없는 런타임 구성을
  처리하기 위해 존재합니다.

## 이징

```ts
type EasingFn = (t: number) => number; // normalized [0,1] → eased progress
type EasingName = keyof typeof Easing; // built-in curve names

Easing.linear | Easing.easeInQuad | Easing.easeOutQuad | Easing.easeInOutQuad;
Easing.easeInCubic | Easing.easeOutCubic | Easing.easeInOutCubic;
Easing.easeOutBack | Easing.easeInOutBack;
```

모든 내장 커브는 f(0)=0, f(1)=1을 만족하며 명시적 곱셈으로 작성되어 WASM `ease()`
커널과 **비트 단위로** 일치합니다 — 배치 트윈은 JS 대응물에 근접할 뿐 아니라 정확히
동일합니다. `EASING_IDS`는 각 이름을 숫자 id에 매핑합니다 (이름이 있는 이징 트윈 —
배치 가능 — 과 WASM으로 넘어갈 수 없는 커스텀 `EasingFn` 클로저를 구분하는 데 사용).
커스텀 함수는 이름이 있는 커브가 허용되는 모든 곳에서 사용할 수 있습니다:
`easing: (t) => t * t * (3 - 2 * t)`.

## `Entity` 모션과의 관계

| 표면                                               | 사용 항목                                |
| -------------------------------------------------- | ---------------------------------------- |
| `setTransition({ prop: 'spring' })` 그런 다음 할당 | 프로퍼티당 `SpringDriver` 하나           |
| `animateTo({...}, duration, easing)`               | `TweenDriver`s                           |
| `springTo({...}, config?)`                         | `SpringDriver`s                          |
| `animate({...}, ms)`                               | 여섯 가지 내장 숫자 프로퍼티에 대한 트윈 |

`animate()`는 `x | y | scaleX | scaleY | rotation | opacity`만 보간합니다
— 커스텀 필드는 구동되지 않습니다 ([`core-entity`](/reference/core-entity/#aenimeisyeon) 참조).
