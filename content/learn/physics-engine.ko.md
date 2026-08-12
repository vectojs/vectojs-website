+++
title = "물리 및 애니메이션"
description = "스프링 물리학, 속도 및 힘 기반 시뮬레이션을 VMT의 모든 엔티티에 적용하기"
weight = 11
+++

# 물리 및 애니메이션

VectoJS는 정적 레이아웃을 넘어섭니다. UI가 Virtual Math Tree에 존재하기 때문에, 표준 `Button`과 `Input`을 포함한 모든 컴포넌트에 **연속적인 힘 기반 물리학**을 적용할 수 있습니다.

## 내장 트위닝: `entity.animate()`

가장 간단한 모션 도구입니다. `animate()`는 모든 숫자 속성에 부드러운 이즈아웃(ease-out) 트윈을 대기열에 추가합니다:

```typescript
button.animate({ x: 200, opacity: 0.5 }, 500);

// 체인은 동시(concurrent)가 아닌 순차(sequential)입니다:
button.animate({ x: 400 }, 300).animate({ y: 200 }, 300).animate({ opacity: 0 }, 200);
```

트윈이 실행되는 동안 Scene은 비정적(non-static) 상태로 유지됩니다 — `markDirty()`를 호출할 필요가 없습니다. 트윈이 완료되면 `hasPendingAnimations()`가 `false`를 반환합니다.

> [!TIP]
> 체인은 순차적입니다(`animate`는 `this`를 반환), 동시적이 아닙니다. 동시 모션, 더 풍부한 이징, 스프링, 컴포넌트의 enter/exit에 대해서는 아래의 애니메이션 시스템을 사용하세요.

## 선언형 및 명령형 애니메이션

**0.2.0**에서 추가된 애니메이션 시스템은 스프링 우선이며, 트윈과 스프링을 하나의 API로 통합합니다 — 모든 엔티티의 트랜스폼이나 투명도를 애니메이션할 때 권장되는 방법입니다. 내장 컴포넌트(Modal, Tooltip 등)가 스스로를 애니메이션할 때 사용하는 것과 동일한 엔진입니다.

### 선언형 전환(Transitions)

애니메이션할 속성과 방법을 선언하면, 일반 할당만으로 애니메이션이 실행됩니다:

```typescript
entity.setTransition({
  opacity: 'spring', // 기본 스프링
  x: { duration: 300, easing: 'easeOutCubic' }, // 트윈
  scaleX: { stiffness: 200, damping: 18 }, // 재정의가 있는 스프링
});

entity.opacity = 1; // 1로 스프링
entity.x = 400; // 300ms 동안 트윈
```

진행 중인 애니메이션에 새 목표를 할당하면 **재타겟팅(retarget)** 됩니다 — 스프링은 속도를 유지하므로, 빠르게 토글되거나 제스처 기반 UI가 끊김 없이 연속적으로 흐릅니다. 전환이 설정되지 않은 속성은 드라이버를 생성하지 않고 일반 세터를 통해 즉시 기록됩니다. 애니메이션 가능한 속성은 `x`, `y`, `scaleX`, `scaleY`, `rotation`, `opacity`입니다.

### 명령형 원샷(One-shots)

안무(choreography)를 위해 `animateTo`(트윈)와 `springTo`(스프링)는 속성을 직접 구동하고 모션이 완료되면 resolve되는 Promise를 반환합니다:

```typescript
await entity.animateTo({ x: 400, opacity: 0 }, { duration: 500, easing: 'easeOutCubic' });
await entity.springTo({ scaleX: 1, scaleY: 1 }, { stiffness: 200, damping: 18 });
```

`animate()`(순차적으로 체인)와 달리, 이것들은 동시에 실행되며 `async`/`await`로 구성됩니다.

### 이징(Easing)

`Easing` 내보내기는 엄선된 곡선 세트를 제공합니다 — `linear`, `easeInOut{Quad,Cubic}`, `easeOut{Quad,Cubic}`, `easeOutBack`(오버슈트) 등. 트윈의 `easing` 옵션에 곡선 이름이나 자체 `(t: number) => number` 함수를 전달하세요.

### 축소된 움직임(Reduced Motion)

시스템은 OS의 **prefers-reduced-motion** 설정을 자동으로 존중합니다: 움직임(트랜스폼, 스프링)은 목표로 즉시 이동하고, 투명도 페이드는 유지됩니다 — 컴포넌트는 여전히 나타나고 사라지지만 움직임 없이 이루어집니다. 컴포넌트별 코드가 필요하지 않습니다.

> [!TIP]
> 컴포넌트는 이 시스템을 통해 자체 enter/exit을 애니메이션합니다. 모든 `UIComponent` 서브클래스는 `enterMotion`/`exitMotion`을 선언하고 `dismiss()`를 호출하여 애니메이션 아웃 후 언마운트할 수 있습니다 — [UI Components 참조](/reference/ui-components/)를 확인하세요.

## SpringPhysics

`SpringPhysics`는 부드럽고 물리적인 느낌의 숫자 전환을 위한 감쇠 스프링입니다:

```typescript
import { SpringPhysics } from '@vectojs/core';

const spring = new SpringPhysics(0);   // 초기값 = 0
spring.stiffness = 180;
spring.damping = 18;

// 언제든지 목표 설정 (예: 호버 시)
spring.target = 1.0;

// 엔티티의 update()에서:
update(dt: number) {
  spring.update(dt);
  this.opacity = spring.value;
  if (!spring.isAtRest()) this.scene?.markDirty();
}
```

목표가 계속 변경될 때(커서 추적, 스크롤 모멘텀, 인터랙티브 드래그)는 `animate()` 대신 `SpringPhysics`를 사용하세요.

## 엔티티의 수동 물리학

모든 `Entity`에는 `x`/`y`와 `update(dt, time)`가 있습니다. `update`를 재정의하여 모든 물리 모델을 구현할 수 있습니다:

```typescript
import { Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

class BallEntity extends Entity {
  vx = (Math.random() - 0.5) * 200;
  vy = (Math.random() - 0.5) * 200;
  friction = 0.97;

  constructor(public radius: number) {
    super();
    this.width = this.height = radius * 2;
  }

  applyForce(fx: number, fy: number) {
    this.vx += fx;
    this.vy += fy;
  }

  override update(dt: number) {
    super.update(dt); // 대기 중인 animate() 트윈 진행
    const seconds = dt / 1000;
    this.x += this.vx * seconds;
    this.y += this.vy * seconds;
    this.vx *= this.friction;
    this.vy *= this.friction;
  }

  isPointInside(gx: number, gy: number) {
    const local = this.worldToLocal(gx, gy);
    if (!local) return false;
    return (local.x - this.radius) ** 2 + (local.y - this.radius) ** 2 <= this.radius ** 2;
  }

  render(r: IRenderer) {
    r.beginPath();
    r.arc(this.radius, this.radius, this.radius, 0, Math.PI * 2);
    r.fill('#6366f1');
  }
}
```

## 탄성 경계(Elastic Boundaries)

간단한 감쇠 계수로 엔티티를 뷰포트 가장자리에서 튕기게 합니다:

```typescript
const BOUNCE = 0.75;

override update(dt: number) {
  super.update(dt);
  const seconds = dt / 1000;
  this.x += this.vx * seconds;
  this.y += this.vy * seconds;

  const { width, height } = this.scene!;

  if (this.x < 0) { this.x = 0; this.vx = Math.abs(this.vx) * BOUNCE; }
  if (this.x + this.width > width) {
    this.x = width - this.width;
    this.vx = -Math.abs(this.vx) * BOUNCE;
  }
  if (this.y < 0) { this.y = 0; this.vy = Math.abs(this.vy) * BOUNCE; }
  if (this.y + this.height > height) {
    this.y = height - this.height;
    this.vy = -Math.abs(this.vy) * BOUNCE;
  }
}
```

이 패턴은 애플리케이션에서 관리하는 소규모 컬렉션에 적합합니다. Nexus 데모는 대신 `ComputeParticleEntity`의 고정 스프링/마우스/폭발 모델을 사용하며, 엔티티 간 상호작용을 시뮬레이션하지 않습니다.

## SpatialHashGrid: 애플리케이션 관리 이웃 후보

N-body 상호작용(반발, 충돌)의 경우, 단순한 쌍별 루프는 O(N²)입니다. `SpatialHashGrid`를 사용하여 쿼리와 겹치는 셀에서 후보를 검색한 후, 더 작은 집합에 대해 정확한 테스트를 실행하세요:

```typescript
import { SpatialHashGrid } from '@vectojs/core';

const grid = new SpatialHashGrid(64); // 월드 단위의 셀 크기

// 매 프레임: 그리드를 재구축한 후 쿼리
for (const ball of balls) {
  grid.insert(ball.id, ball.x, ball.y, ball.width, ball.height);
}

for (const ball of balls) {
  const nearby = grid.query(ball.x - 50, ball.y - 50, 100, 100);
  for (const otherId of nearby) {
    if (otherId === ball.id) continue;
    // ball과 balls[otherId] 사이에 반발 적용
  }
}

grid.clear(); // 다시 삽입하기 전에 프레임당 한 번 호출
```

실제 이웃 상호작용(공-공 충돌, 플로킹, 엔티티 간 반발)이 필요할 때 이 패턴을 직접 사용하세요. `ComputeParticleEntity`는 내부적으로 `SpatialHashGrid`를 사용하지 **않습니다** — 그 시뮬레이션(GPU 또는 CPU)은 엔티티 간이 아닌 고정된 점(스프링 원점, 마우스, 폭발 중심)에 대해서만 힘을 계산합니다. 높은 파티클 수와 실제 이웃 상호작용이 모두 필요하다면, 엔진이 함께 제공하지 않는 두 가지를 결합하는 것입니다 — CPU에서 자체 `SpatialHashGrid` 기반 이웃 쿼리를 실행하거나(위와 같이), GPU 경로를 위해 이웃 쿼리가 내장된 사용자 정의 WGSL 컴퓨트 패스를 작성해야 합니다.

> [!WARNING]
> 매 프레임마다 해시 그리드를 재구축하세요. 이전 프레임의 오래된 그리드 데이터는 잘못된 이웃 쿼리와 유령 충돌을 생성합니다.

## 고처리량 파티클: `ComputeParticleEntity`

수만 개의 파티클에 대해 스프링-원점 + 마우스 반발을 사용하려면 `ComputeParticleEntity`를 사용하세요. WebGPU 컴퓨트 셰이더를 사용 가능할 때 자동으로 사용하고, 그렇지 않으면 CPU로 폴백됩니다:

```typescript
import { ComputeParticleEntity } from '@vectojs/core';

const particles = new ComputeParticleEntity({
  maxParticles: 15000,
  springK: 0.05,
  damping: 0.95,
  size: 3,
  color: '#6366f1',
});

// 뷰포트 전체에 파티클 분산
particles.initRandomParticles(scene.width, scene.height);
scene.add(particles);
scene.start();

// 새 원점 위치(예: 텍스트 모양)로 파티클 애니메이션
particles.setOrigins(newPositions);
```

> [!CAUTION]
> `initRandomParticles` 전에 항상 `scene.resize(width, height)`를 호출하거나 Scene이 자동 리사이즈하도록 두세요. `0×0` 뷰포트는 초기 위치를 생성하지 않으며 파티클은 절대 움직이지 않습니다.

전체 `ComputeParticleEntity` 메모리 레이아웃 및 WebGPU 내부 구조는 [Core API 참조](/reference/core-api/)를 참조하세요.
