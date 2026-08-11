+++
title = "커스텀 Entity 구축"
description = "Entity를 서브클래싱하여 나만의 캔버스 컴포넌트를 만드는 방법: 변환, 렌더링, 히트 테스팅, 애니메이션, 배치, 접근성"
weight = 9

[extra]
order = 9
+++

# 커스텀 Entity 구축

VectoJS의 모든 객체는 `Entity` — Virtual Math Tree의 노드입니다. `Button`이나 `Toggle` 같은 내장 컴포넌트도 그대로 사용할 수 있는 Entity 서브클래스입니다. 이 가이드는 나만의 Entity를 만드는 방법을 설명합니다.

## 라이브로 체험하기

<figure class="sandbox">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · @vectojs/core</span></div>
  <iframe src="/sandbox/custom-entity.html" class="sandbox-frame" loading="lazy" title="커스텀 Entity 인터랙티브 예제" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>애니메이션 아크 필이 적용된 세 개의 <code>GaugeWidget</code> 커스텀 Entity. Randomize를 클릭하면 <code>animate()</code> 트윈 시스템이 작동하는 모습을 볼 수 있습니다.</figcaption>
</figure>

## 로컬 좌표계

첫 번째 `render()` 메서드를 작성하기 전에 반드시 이해해야 할 가장 중요한 개념입니다:

> **Entity는 `(0, 0)`에 그려집니다. `render()`가 호출되기 전에 캔버스는 이미 Entity의 위치, 스케일, 회전으로 변환되어 있습니다.**

`Scene`은 트리를 내려가며 **T · S · R** 순서(Translate → Scale → Rotate)로 변환을 적용합니다. `render(renderer)`가 호출될 시점에는 원점이 Entity의 왼쪽 상단 모서리이며, 스케일이 적용되고 회전도 반영되어 있습니다. `render()` 내에서 `this.x`나 `this.y`를 읽을 필요가 전혀 없습니다.

<figure>
  <img src="/images/local-coordinate-system.svg" alt="왼쪽의 월드 공간에서 Entity가 (80, 90)에 위치한 모습과 오른쪽의 로컬 공간에서 원점이 (0,0)이고 render()가 그리는 모습을 Scene이 T·S·R 변환을 적용한다는 화살표로 연결한 다이어그램" class="diagram" />
  <figcaption>Scene은 <code>render()</code>를 호출하기 전에 캔버스를 Entity의 월드 위치로 변환합니다. 항상 <code>(0, 0)</code>에서 그리면 됩니다.</figcaption>
</figure>

```typescript
import { Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

class Banner extends Entity {
  color = '#6366f1';

  isPointInside(_gx: number, _gy: number) {
    return false;
  }

  render(renderer: IRenderer) {
    // (this.x, this.y)가 아닌 (0, 0) 기준으로 그리기
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 12);
    renderer.fill(this.color);
  }
}

const banner = new Banner();
banner.width = 300;
banner.height = 60;
banner.setPosition(80, 120); // 화면에 표시될 위치 제어
scene.add(banner);
```

## 최소 구현 계약

두 개의 메서드가 필요합니다:

```typescript
abstract class Entity {
  // 글로벌 포인터 좌표(gx, gy)가 이 Entity에 닿았으면 true를 반환합니다.
  abstract isPointInside(gx: number, gy: number): boolean;

  // Entity를 그립니다. 렌더러는 이미 로컬 공간에 있으며 원점은 (0,0)입니다.
  abstract render(renderer: IRenderer): void;
}
```

Entity에 인터랙티브 영역이 없으면 `isPointInside`에서 `false`를 반환하세요. 사각형 히트 영역의 경우 `worldToLocal()`로 월드 포인트를 변환하여 중첩된 회전과 비균일 스케일도 정확히 처리합니다:

```typescript
isPointInside(gx: number, gy: number): boolean {
  const local = this.worldToLocal(gx, gy);
  return !!local && local.x >= 0 && local.x <= this.width
      && local.y >= 0 && local.y <= this.height;
}
```

> [!NOTE]
> `UIComponent`는 이미 이 AABB 테스트를 구현하고 있습니다. 사각형 히트박스를 가진 컴포넌트라면 `Entity` 대신 `@vectojs/ui`의 `UIComponent`를 확장하세요 — `isPointInside`, `getBounds`, `padding`을 무료로 얻을 수 있습니다.

## IRenderer API

`render()`에 전달되는 렌더러 객체는 Canvas2D와 유사한 그리기 표면을 제공합니다(하지만 백엔드에 무관합니다 — Canvas2D, WebGL, SVG일 수 있습니다).

```typescript
// Paths
renderer.beginPath()
renderer.moveTo(x, y)
renderer.lineTo(x, y)
renderer.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y)
renderer.arc(cx, cy, radius, startAngle, endAngle, counterclockwise?)
renderer.roundRect(x, y, w, h, radii)
renderer.closePath()

// Fills and strokes
renderer.fill(colorOrGradient)       // e.g. '#ff0' or a gradient descriptor
renderer.stroke(colorOrGradient, lineWidth?)

// Text (native browser canvas text — no LayoutEngine)
renderer.fillText(text, x, y, font, color)  // font = CSS shorthand

// Images
renderer.drawImage(source, dx, dy, dw, dh)

// Fast circle batch (coalesces same-color runs)
renderer.fillCircle(cx, cy, radius, color, alpha?)

// State
renderer.save()
renderer.restore()
renderer.translate(x, y)
renderer.scale(x, y)
renderer.rotate(angle)        // radians
renderer.setGlobalAlpha(a)
renderer.clip(x, y, w, h)    // inside save/restore

// Gradients
renderer.createLinearGradient(x0, y0, x1, y1, colorStops)
```

**예제 — 그라데이션 카드:**

```typescript
render(renderer: IRenderer) {
  const gradient = renderer.createLinearGradient(0, 0, this.width, 0, [
    { stop: 0, color: '#6366f1' },
    { stop: 1, color: '#38bdf8' },
  ]);
  renderer.beginPath();
  renderer.roundRect(0, 0, this.width, this.height, 16);
  renderer.fill(gradient);

  renderer.fillText('Hello canvas', 20, this.height / 2 - 8, '600 18px Inter', '#fff');
}
```

## `getBounds()`로 뷰포트 컬링

기본적으로 Entity는 컬링되지 않습니다. `getBounds()`를 오버라이드하여 로컬 공간의 바운딩 박스를 반환하면, 변환된 박스가 뷰포트 밖에 있을 때 `Scene`이 `render()`를 생략합니다. `update()`는 계속 실행되므로 Entity가 화면으로 돌아올 때 상태와 애니메이션이 최신 상태를 유지합니다:

```typescript
getBounds() {
  return { x: 0, y: 0, width: this.width, height: this.height };
}
```

`UIComponent`는 이미 이 작업을 수행합니다. 대규모 씬에서는 원시 `Entity` 서브클래스도 구현해야 합니다.

## `update(dt, time)`으로 프레임별 로직

`update()`를 오버라이드하여 매 프레임 실행할 코드를 작성합니다. `super.update(dt, time)`을 먼저 호출하여 큐에 추가된 `animate()` 트윈을 진행시킵니다.

> [!CAUTION]
> `dt`는 **밀리초** 단위이며 초가 아닙니다. 60fps에서 `dt ≈ 16.7`입니다. 1000으로 나누어 초 단위로 변환하세요.

```typescript
class Spinner extends Entity {
  speed = 1.5; // rad/s

  update(dt: number, time: number) {
    super.update(dt, time);
    this.rotation += this.speed * (dt / 1000); // dt/1000 → seconds
  }

  // update()에서 구동되는 모션은 Scene의 유휴 검사에 보이지 않습니다.
  // 이를 보고하면 유휴 스로틀이 스피너를 2fps로 떨어뜨리는 것을 방지하고
  // 프레임별 더티 플래그보다 애니메이션 의도를 더 명확하게 전달합니다.
  hasPendingAnimations() {
    return true; // 스피너는 항상 애니메이션 중
  }

  isPointInside() {
    return false;
  }

  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.arc(this.width / 2, this.height / 2, 30, 0, Math.PI * 2);
    renderer.stroke('#00f0ff', 3);
  }
}
```

`time`은 `performance.now()`이며, 드리프트가 없어야 하는 진동에 유용합니다:

```typescript
this.y = Math.sin(time * 0.002) * 20; // 누적 오차 없는 안정적인 부동 소수점
```

## `animate()`로 부드러운 애니메이션

원샷 전환의 경우 `animate()`가 커스텀 `update()`보다 더 나은 선택인 경우가 많습니다:

```typescript
entity
  .animate({ x: 300, opacity: 0 }, 400) // ease-out, 400ms
  .animate({ opacity: 1 }, 200); // 체이닝: 첫 번째가 끝나면 시작
```

**숫자 프로퍼티**만 보간됩니다. 이징은 ease-out 2차 함수입니다(`t * (2 - t)`). 실행 중인 트윈은 씬을 비정적으로 유지하고 `markDirty()`를 자동으로 호출합니다.

## Entity를 인터랙티브하게 만들기

`interactive = true`로 설정하고 `isPointInside`를 구현한 후 `on()`으로 리스너를 연결하세요:

```typescript
class Chip extends Entity {
  selected = false;
  label: string;

  constructor(label: string) {
    super();
    this.label = label;
    this.interactive = true;
    this.width = 80;
    this.height = 32;

    this.on('click', () => {
      this.selected = !this.selected;
      this.animate({ scaleX: 0.92, scaleY: 0.92 }, 80).animate({ scaleX: 1, scaleY: 1 }, 80);
      this.scene?.markDirty();
    });
  }

  isPointInside(gx: number, gy: number): boolean {
    const p = this.worldToLocal(gx, gy);
    return !!p && p.x >= 0 && p.x <= this.width && p.y >= 0 && p.y <= this.height;
  }

  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 16);
    renderer.fill(this.selected ? '#6366f1' : 'rgba(99,102,241,0.2)');
    renderer.fillText(this.label, 12, 9, '500 14px Inter', '#fff');
  }
}
```

## `getA11yAttributes()`로 A11y 투영

Entity가 `interactive` 상태이면 VectoJS는 그 위에 투명한 실제 DOM 노드를 투영합니다. 기본값은 일반 `<div>`이므로 보조 기술에 그다지 유용하지 않습니다. `getA11yAttributes()`를 오버라이드하여 어떤 노드를 투영할지 프레임워크에 알려주세요:

```typescript
import type { A11yAttributes } from '@vectojs/core';

class Chip extends Entity {
  getA11yAttributes(): A11yAttributes {
    return {
      tag: 'button',
      role: 'button',
      label: this.label,
    };
  }
}
```

이제 Playwright의 `page.getByRole('button', { name: 'OK' })`가 칩을 찾고, 스크린 리더가 이를 알려주며, 키보드 사용자는 Tab으로 이동하고 Enter로 활성화할 수 있습니다. 전체 필드 집합:

```typescript
interface A11yAttributes {
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea'; // 기본값 'div'
  role?: string;
  label?: string; // aria-label
  href?: string; // tag='a'인 경우
  src?: string;
  alt?: string; // tag='img'인 경우
  inputType?: string; // 'text', 'checkbox', 등
  placeholder?: string;
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  controls?: string;
  haspopup?: string;
  selected?: boolean;
  activedescendant?: string;
  valuemin?: string;
  valuemax?: string;
}
```

## `getBatchCircle()`과 `getBatchRect()`로 WebGL 배치 처리

수천 개가 실행되는 파티클형 Entity(점, 도트)의 경우 Entity별 `save/translate/render/restore` 경로는 너무 느립니다. 대신 배치 고속 경로를 사용하세요:

```typescript
class Particle extends Entity {
  radius = 4;
  color = '#00f0ff';

  // 누적 변환이 표현 가능할 때 WebGL 배치에 공급합니다.
  getBatchCircle() {
    return { radius: this.radius, color: this.color };
  }

  isPointInside() {
    return false;
  }
  // Canvas 모드 또는 비균일/전단된 상위 요소를 위한 필수 폴백.
  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.arc(0, 0, this.radius, 0, Math.PI * 2);
    renderer.fill(this.color);
  }
}
```

제약 조건:

- Entity는 **리프**(자식 없음)여야 합니다.
- Entity 자체의 스케일은 고속 경로를 위해 **균일**(`scaleX === scaleY`)해야 합니다.
- `Scene`에 `pointBackend: 'webgl'`이 필요합니다.
- 누적된 상위 변환이 비균일, 전단되거나 하나의 반지름/회전으로 표현할 수 없으면 `Scene`이 일반 `render()` 폴백을 호출합니다.

`Scene`은 매 프레임 `getBatchCircle()`을 읽으므로 애니메이션된 `radius`/`color`도 적용됩니다. 포인트 레이어는 많은 원을 하나의 버퍼/드로우 시퀀스로 업로드합니다. 사각형의 경우 대신 `getBatchRect()`를 사용하세요:

```typescript
getBatchRect() {
  return { width: this.width, height: this.height, color: this.color };
}
```

## 전체 예제: 애니메이션 게이지 위젯

```typescript
import { Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';
import type { A11yAttributes } from '@vectojs/core';

class GaugeWidget extends Entity {
  private _value = 0;
  private _displayValue = 0; // interpolated

  label: string;
  min: number;
  max: number;
  accentColor: string;

  constructor(label: string, opts: { min?: number; max?: number; accent?: string } = {}) {
    super();
    this.label = label;
    this.min = opts.min ?? 0;
    this.max = opts.max ?? 100;
    this.accentColor = opts.accent ?? '#00f0ff';
    this.width = 180;
    this.height = 180;
    this.interactive = true;
  }

  get value() {
    return this._value;
  }

  setValue(v: number) {
    this._value = Math.max(this.min, Math.min(this.max, v));
    // 부드러운 시각적 전환
    this.animate({ _displayValue: this._value } as any, 600);
  }

  update(dt: number, time: number) {
    super.update(dt, time);
  }

  getBounds() {
    return { x: 0, y: 0, width: this.width, height: this.height };
  }

  isPointInside(gx: number, gy: number): boolean {
    const p = this.worldToLocal(gx, gy);
    return !!p && p.x >= 0 && p.x <= this.width && p.y >= 0 && p.y <= this.height;
  }

  getA11yAttributes(): A11yAttributes {
    return {
      role: 'meter',
      label: this.label,
      value: String(this._value),
      valuemin: String(this.min),
      valuemax: String(this.max),
    };
  }

  render(renderer: IRenderer) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const r = 70;
    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;
    const progress = (this._displayValue - this.min) / (this.max - this.min);
    const sweepAngle = startAngle + (endAngle - startAngle) * progress;

    // Track
    renderer.beginPath();
    renderer.arc(cx, cy, r, startAngle, endAngle);
    renderer.stroke('rgba(255,255,255,0.12)', 10);

    // Progress arc
    if (progress > 0) {
      renderer.beginPath();
      renderer.arc(cx, cy, r, startAngle, sweepAngle);
      renderer.stroke(this.accentColor, 10);
    }

    // Value label
    renderer.fillText(
      `${Math.round(this._displayValue)}`,
      cx - 20,
      cy - 14,
      'bold 36px Inter',
      '#f8fafc',
    );
    renderer.fillText(this.label, cx - 30, cy + 20, '14px Inter', '#94a3b8');
  }
}

// Usage:
const gauge = new GaugeWidget('CPU', { accent: '#6366f1' });
gauge.setPosition(60, 60);
scene.add(gauge);
gauge.setValue(72);
```

## 요약

| 메서드                              | 오버라이드 시기                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| `render(renderer)`                  | 항상 — Entity를 로컬 공간 (0,0)에 그림                                                              |
| `isPointInside(gx, gy)`             | 항상 — 장식용 Entity는 false 반환                                                                   |
| `update(dt, time)`                  | 프레임별 로직; `super.update`를 먼저 호출; `dt`는 ms                                                |
| `hasPendingAnimations()`            | `update()`가 자체 모션을 구동할 때 — "계속 움직이고 있음"을 보고하여 유휴 스로틀/onDemand 스킵 방지 |
| `getBounds()`                       | 뷰포트 컬링용 (강력 권장)                                                                           |
| `getA11yAttributes()`               | 인터랙티브일 때 — 섀도우 DOM 노드 제어                                                              |
| `getBatchCircle() / getBatchRect()` | 수천 개의 파티클형 리프 Entity                                                                      |

## 문제 해결

### Entity를 추가했지만 화면에 아무것도 나타나지 않음

순서대로 확인하세요:

1. **`scene.start()`가 호출되지 않음** — 이 함수 없이는 렌더 루프가 실행되지 않습니다.
2. **`render()`에 그리기 메서드가 없음** — 빈 `render()`는 아무것도 출력하지 않습니다. `renderer.fill()` 또는 `renderer.stroke()`가 실행되는지 확인하세요.
3. **`width` 또는 `height`가 `0`** — Entity가 화면 밖에 있거나 컬링될 수 있습니다. `entity.width = 200; entity.height = 80`을 설정하고 나타나는지 확인하세요.
4. **`opacity`가 `0`** — `entity.opacity`를 확인하세요.
5. **Entity가 Scene에 추가되지 않음** — `new MyEntity()`는 생성만 할 뿐 추가하지 않습니다. `scene.add(entity)`를 호출하세요.

### `isPointInside`가 `true`를 반환하지 않음 / 클릭 이벤트가 실행되지 않음

`isPointInside`는 **글로벌(월드 공간)** 좌표를 받습니다. `this.x` / `this.y`로 테스트하면 중첩된 변환에서 실패하고, `getGlobalPosition()`을 빼도 회전 및 비균일 스케일에서는 실패합니다. `worldToLocal()`로 전체 변환을 역변환하세요:

```typescript
// 잘못된 방법 — Entity가 씬 루트에 있고 상위 변환이 없을 때만 작동
isPointInside(gx, gy) {
  return gx >= this.x && gx <= this.x + this.width; // ← 중첩 트리에서 작동 안 함
}

// 올바른 방법 — 중첩된 이동, 회전, 비균일 스케일 처리
isPointInside(gx, gy) {
  const p = this.worldToLocal(gx, gy);
  return !!p && p.x >= 0 && p.x <= this.width
      && p.y >= 0 && p.y <= this.height;
}
```

또한 `entity.interactive = true`가 설정되어 있는지 확인하세요 — 설정되지 않으면 Entity에 포인터 이벤트가 전달되지 않습니다.

### `getBatchCircle()` / `getBatchRect()`가 사용되지 않음

놓치기 쉬운 두 가지 요구 사항:

- `Scene`의 생성자 옵션에 `pointBackend: 'webgl'`이 설정되어 있어야 합니다.
- Entity는 **리프**(자식 없음)여야 합니다. 배치 Entity에 `add()`로 자식을 추가하면 자동으로 일반 `render()` 경로로 폴백됩니다.

`console.log(scene.getRenderer())`로 확인하세요 — 렌더러가 `CanvasRenderer`이고 WebGL 레이어가 없으면 `pointBackend: 'webgl'`이 설정되지 않았거나 WebGL2를 사용할 수 없는 것입니다.

### DevTools에서 섀도우 DOM 노드가 보이지 않음

a11y 섀도우 노드는 **두 조건이 모두** 참일 때만 생성됩니다:

1. `entity.interactive === true`
2. `entity.width > 0` (또는 `entity.a11yFullViewport === true`)

`interactive = true`이지만 `width = 0`인 Entity는 섀도우 노드를 얻지 못합니다. 시각적 크기와 일치하도록 `entity.width`와 `entity.height`를 설정하세요.

## 도전 과제

### 진행 바 Entity

애니메이션 채움 막대를 표시하고 스크린 리더에 진행 표시기로 올바르게 알려주는 `ProgressBar` Entity를 구축하세요.

- 프로퍼티: `min: number`, `max: number`, `value: number`, `barColor: string`, `trackColor: string`, `width`/`height`.
- `n`을 `[min, max]`로 클램프하고 `this.animate({ displayValue: n }, 400)`을 호출하는 `setValue(n: number)`를 구현하세요. 여기서 `displayValue`는 렌더링된 채움 너비를 결정합니다.
- `getA11yAttributes()`를 오버라이드하여 `{ role: 'progressbar', valuemin, valuemax, value }`를 문자열로 반환하여 보조 기술이 현재 백분율을 알릴 수 있도록 하세요.

### 도넛 차트

`GaugeWidget`(이 페이지 하단의 전체 예제)을 확장하여 트랙 아크와 진행 아크 사이에 보이는 간격이 있는 도넛 모양을 렌더링하고, 값 아래에 카테고리 범례 레이블을 추가하세요.

- 트랙 아크 반지름을 6px 줄이고 진행 아크 반지름을 6px 늘리거나(또는 그 반대로) 두 동심원 링 사이에 보이는 간격을 만드세요.
- `legendLabel: string` 프로퍼티를 추가하고 `renderer.fillText`를 사용하여 숫자 값 아래에 더 작고 흐린 색상으로 렌더링하세요.
- `getA11yAttributes()`를 업데이트하여 반환된 `label` 필드에 `legendLabel`을 추가하여 스크린 리더가 전체 설명을 알릴 수 있도록 하세요.

### 클릭 카운터 칩

이 페이지의 인터랙티브 섹션에 있는 `Chip` Entity를 확장하여 각 클릭이 카운터를 증가시키고 오른쪽 상단 모서리에 카운트를 표시하는 작은 원형 배지를 보여주도록 하세요.

- `clickCount = 0` 프로퍼티를 추가하고 기존 토글 및 스케일 애니메이션과 함께 `'click'` 핸들러 내에서 증가시키세요.
- `render()`에서 `clickCount > 0`일 때만 배지(카운트가 텍스트로 표시된 작은 채워진 원)를 그리고, 칩의 로컬 좌표 공간에서 `(this.width - 10, -6)` 위치에 배치하세요.
- `getA11yAttributes()`를 오버라이드하여 현재 카운트를 `label` 필드에 포함시키세요(예: `'OK — 3 clicks'`). 이렇게 하면 카운트가 변경될 때 접근 가능한 이름이 최신 상태로 유지됩니다.

> **다음:** [이벤트 및 히트 테스팅](/learn/events/) — 포인터 이벤트가 캡처와 버블로 Entity 트리를 통해 전파되는 방식
