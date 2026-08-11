+++
title = "이벤트 및 히트 테스팅"
description = "포인터 및 키보드 이벤트가 VectoJS 엔티티 트리를 통해 전달되는 방식: 캡처, 버블, VectoJSEvent, 폼 변경 페이로드, findEntityAt."
weight = 10

[extra]
order = 10
+++

# 이벤트 및 히트 테스팅

VectoJS는 DOM과 유사한 **캡처 + 버블** 이벤트 모델을 사용합니다. 브라우저 `addEventListener`를 사용해본 적이 있다면 동작 방식은 동일하지만, 트리 탐색이 DOM 대신 Virtual Math Tree에서 이루어집니다.

## 라이브 체험

<figure class="sandbox">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">라이브 · @vectojs/core</span></div>
  <iframe src="/sandbox/events.html" class="sandbox-frame" loading="lazy" title="이벤트 및 히트 테스팅 인터랙티브 예제" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>세 가지 커스텀 Entity 서브클래스 — 호버 시 확대, 클릭 시 카운트. 각각 <code>on('hover')</code>, <code>on('pointerleave')</code>, <code>on('click')</code>을 연결합니다.</figcaption>
</figure>

## 이벤트 라이프사이클

사용자가 캔버스를 클릭(또는 탭, 호버)하면 Scene이 다음을 수행합니다:

1. `findEntityAt(x, y)`를 호출하여 **타겟** — `isPointInside()`가 `true`를 반환하는 최상위 엔티티 — 을 찾습니다.
2. **이벤트 경로**를 구성합니다: `[target, parent, grandparent, …, root]`.
3. **캡처 단계**를 실행합니다: root에서 target 방향으로 `{ capture: true }`로 등록된 리스너를 실행합니다.
4. **버블 단계**를 실행합니다: target에서 root 방향으로 (기본 단계) 리스너를 실행합니다.

<figure>
  <iframe src="/sandbox/diagram-events.html" class="diagram-frame" loading="lazy" title="VectoJS로 라이브 렌더링된 이벤트 캡처 및 버블 단계" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>캡처는 root → target 방향으로 실행, 버블은 target → root 방향으로 실행됩니다. target은 두 단계를 모두 수신합니다. <em>(VectoJS로 라이브 렌더링됨.)</em></figcaption>
</figure>

## 이벤트 수신

```typescript
entity.on(event, callback, options?)
entity.off(event, callback, options?)
```

기본 단계는 **버블**입니다. 캡처 단계에서 가로채려면 `{ capture: true }`를 전달하세요:

```typescript
// Bubble phase (default) — fires after children
btn.on('click', (e) => console.log('button clicked'));

// Capture phase — fires before children (interceptor pattern)
card.on(
  'click',
  (e) => {
    console.log('card sees click first');
    e.stopPropagation(); // prevents bubble reaching card again
  },
  { capture: true },
);
```

사용 가능한 이벤트 유형:

| 이벤트            | 트리거                                       |
| ----------------- | -------------------------------------------- |
| `'click'`         | 같은 엔티티에서 포인터 누름 + 놓음           |
| `'hover'`         | 포인터가 엔티티에 진입                       |
| `'pointerdown'`   | 포인터를 눌렀을 때                           |
| `'pointerup'`     | 포인터를 놓았을 때                           |
| `'pointercancel'` | 활성 포인터 스트림이 브라우저에 의해 취소됨  |
| `'pointermove'`   | 포인터가 이동했을 때 (엔티티 위에 있는 동안) |
| `'pointerleave'`  | 포인터가 엔티티를 떠났을 때                  |
| `'wheel'`         | 마우스 휠 / 트랙패드 스크롤                  |
| `'keydown'`       | 키를 눌렀을 때 (엔티티가 포커스를 가진 상태) |
| `'keyup'`         | 키를 놓았을 때                               |
| `'change'`        | 폼 컨트롤 값이 변경됨                        |
| `'focus'`         | Shadow DOM 노드가 포커스를 얻음              |
| `'blur'`          | Shadow DOM 노드가 포커스를 잃음              |

## VectoJSEvent

콜백은 다음 멤버를 가진 `VectoJSEvent`를 수신합니다:

```typescript
interface VectoJSEvent {
  type: string; // event name
  target: Entity; // entity where the event originated
  currentTarget: Entity; // entity whose listener is currently running

  bubbles: boolean;

  // Propagation control
  stopPropagation(): void; // stop after current node
  stopImmediatePropagation(): void; // also skip remaining listeners on this node
  preventDefault(): void;

  defaultPrevented: boolean;

  // Browser viewport coordinates from the native event
  clientX?: number;
  clientY?: number;

  // Scene logical coordinates, then coordinates local to currentTarget
  sceneX?: number;
  sceneY?: number;
  localX?: number;
  localY?: number;

  // Wheel events
  deltaX?: number;
  deltaY?: number;

  // Keyboard events
  key?: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;

  // The original native DOM event
  nativeEvent?: Event;
}
```

`localX`/`localY`는 각 리스너의 `currentTarget`에 대해 다시 계산되며, 중첩된 회전 및 비균일 스케일을 포함합니다. 컨트롤 내부에서 사용하세요. 다른 엔티티와 비교하거나 씬-스페이스 포인터를 저장할 때는 `sceneX`/`sceneY`를 사용하세요. `clientX`/`clientY`는 원시 브라우저 뷰포트 값입니다.

## `emit()` vs `dispatchEvent()`

VectoJS에는 두 가지 디스패치 경로가 있습니다:

| 메서드                               | 기능                                                             |
| ------------------------------------ | ---------------------------------------------------------------- |
| `entity.emit(event, payload)`        | **현재 엔티티의 버블 단계 리스너만** 실행합니다. 트리 탐색 없음. |
| `entity.dispatchEvent(vectoJSEvent)` | 전체 DOM 방식의 **캡처 + 버블** 트리 탐색을 수행합니다.          |

`emit()`은 내장 컴포넌트가 자체 상태 변경을 내부적으로 알리는 데 사용됩니다 (예: `Toggle`이 자체 `'change'`를 방출). `dispatchEvent()`를 직접 호출하는 경우는 거의 없습니다 — `Scene`이 브라우저에서 오는 포인터 및 키보드 이벤트에 대해 이를 호출합니다.

```typescript
// Correct: listen to a button's click in bubble phase
btn.on('click', (e) => {
  /* ... */
});

// Correct: intercept a subtree's clicks before children handle them
container.on(
  'click',
  (e) => {
    if (isLocked) e.stopPropagation();
  },
  { capture: true },
);

// Correct: a component emitting its own state change (internal use)
this.emit('change', { value: this._value });
```

## 폼 변경 이벤트 페이로드

폼 컨트롤(`Input`, `TextArea`, `Checkbox`, `Toggle`, `Slider`, `Dropdown`)은 타입이 지정된 페이로드와 함께 `'change'` 이벤트를 방출합니다:

**`Input` 및 `TextArea`:**

```typescript
{
  value: string;
  selectionStart?: number;   // caret / selection start offset
  selectionEnd?: number;     // caret / selection end offset
  composition?: {
    start: number;
    length: number;
  } | null;                  // active IME pre-edit range, or null
}
```

**`Checkbox` 및 `Toggle`:**

```typescript
{
  checked: boolean;
}
```

**`Slider`:**

```typescript
{
  value: number;
}
```

**`Dropdown`:**

```typescript
{
  value: string;
}
```

예제 — 텍스트 입력 값 읽기:

```typescript
const input = new Input({ width: 300, placeholder: 'Search…' });
input.on('change', (e) => {
  const { value, selectionStart } = e;
  console.log(`"${value}" — caret at ${selectionStart}`);
});
```

## 히트 테스팅: Scene이 타겟을 찾는 방법

`scene.findEntityAt(x, y)`는 트리를 **역방향 자식 순서로 깊이 우선 탐색**합니다 (가장 위에 그려진 자식이 먼저 테스트됨):

1. 오버레이 루트가 메인 루트보다 먼저 확인되므로 오버레이(드롭다운, 모달)가 항상 우선합니다.
2. 자식은 **역순**으로 탐색됩니다 — 마지막에 추가된(위에 렌더링된) 자식이 먼저 히트 테스트됩니다.
3. **인터랙티브 필터는 없습니다**: `isPointInside()`가 `true`를 반환하면 비-인터랙티브 엔티티도 반환될 수 있습니다. 인터랙티브 필터링은 shadow DOM 프로젝션에만 영향을 미치고 히트 테스팅에는 영향을 주지 않습니다.
4. 탐색은 리스너 유무와 관계없이 `isPointInside()`가 `true`를 반환하는 첫 번째 엔티티를 반환합니다.

```typescript
// This works — returns the entity under the cursor
const hit = scene.findEntityAt(pointerX, pointerY);
if (hit) console.log('hit', hit.id);
```

## 전파 중단

```typescript
child.on('click', (e) => {
  e.stopPropagation(); // parent won't see this click in bubble phase
});

// stopImmediatePropagation also stops other listeners on the same node
child.on('click', (e) => {
  e.stopImmediatePropagation();
});
child.on('click', () => {
  // This second listener on 'child' is NOT called if the first stops immediate propagation
});
```

## 휠 이벤트와 `preventDefault()`

`Scene`은 캔버스에서 `wheel` 이벤트를 전달합니다. `e.preventDefault()`를 호출하여 페이지 스크롤을 중지하세요:

```typescript
myScroller.on('wheel', (e) => {
  this.scrollY += e.deltaY;
  e.preventDefault(); // stops the browser scroll
  this.scene?.markDirty();
});
```

> [!NOTE] > `ScrollView`는 `Ctrl` 키가 눌린 경우(브라우저 줌 허용)를 제외하고 휠 이벤트에서 자동으로 `e.preventDefault()`를 호출합니다. 커스텀 스크롤 컨테이너를 구축하는 경우 동일한 패턴을 따르세요.

## 키보드 이벤트

키보드 이벤트는 포커스를 가진 엔티티(해당 shadow DOM 노드를 통해)에 전달됩니다. 일반적인 캡처/버블 방식으로 트리를 따라 전파됩니다:

```typescript
inputEntity.on('keydown', (e) => {
  if (e.key === 'Enter') submitForm();
  if (e.key === 'Escape') cancelForm();
});
```

전역 단축키(포커스된 요소에 연결되지 않은)의 경우 `Scene`의 루트에서 수신하거나 네이티브 `document.addEventListener`를 사용하세요:

```typescript
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});
```

## 캡처 단계 패턴

### 클릭-외부 감지로 닫기

```typescript
scene.add(overlay); // a dropdown, modal backdrop, etc.

// Root capture: fires before any entity handles the click
scene.getRoot().on(
  'click',
  (e) => {
    if (
      e.sceneX !== undefined &&
      e.sceneY !== undefined &&
      !overlay.isPointInside(e.sceneX, e.sceneY)
    ) {
      closeOverlay();
    }
  },
  { capture: true },
);
```

### 서브트리 잠금

```typescript
panel.on(
  'click',
  (e) => {
    if (disabled) e.stopPropagation(); // all children are blocked
  },
  { capture: true },
);
```

## 전체 예제: 호버 카드

```typescript
import { Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

class HoverCard extends Entity {
  private hovered = false;

  constructor(private label: string) {
    super();
    this.width = 200;
    this.height = 80;
    this.interactive = true;

    this.on('hover', () => {
      this.hovered = true;
      this.animate({ scaleX: 1.04, scaleY: 1.04 }, 120);
    });

    this.on('pointerleave', () => {
      this.hovered = false;
      this.animate({ scaleX: 1, scaleY: 1 }, 120);
    });

    this.on('click', () => {
      console.log(`${this.label} clicked`);
    });
  }

  isPointInside(gx: number, gy: number): boolean {
    const p = this.worldToLocal(gx, gy);
    return !!p && p.x >= 0 && p.x <= this.width && p.y >= 0 && p.y <= this.height;
  }

  getA11yAttributes() {
    return { tag: 'button' as const, role: 'button', label: this.label };
  }

  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 12);
    renderer.fill(this.hovered ? '#1e293b' : '#0f172a');
    renderer.stroke('rgba(255,255,255,0.12)', 1);
    renderer.fillText(this.label, 16, 28, '600 18px Inter', '#f8fafc');
  }
}
```

## 문제 해결

### 클릭이 발생했지만 잘못된 엔티티가 타겟입니다

`findEntityAt`은 자식을 **역순**으로 탐색합니다 (마지막에 추가된 것이 먼저 테스트됨). 두 엔티티가 겹치는 경우 나중에 추가된 엔티티가 우선합니다. 엔티티가 항상 우선하게 하려면 다른 엔티티보다 나중에 `add()`하세요. 항상 뒤로 가게 하려면 먼저 `add()`하세요.

**캡처 단계**에서 잘못된 엔티티가 가로채는 경우, 상위 요소의 `stopPropagation()` 호출을 확인하세요 — 전파를 중단하는 캡처 리스너는 이벤트가 의도된 타겟에 도달하는 것을 방지합니다.

### 이벤트 리스너가 한 번 실행된 후 중단됩니다

`on()`으로 추가된 이벤트 리스너는 `off()`가 호출될 때까지 영구적입니다. 리스너가 중단된 것처럼 보이면 다음을 확인하세요:

1. 엔티티가 씬에서 제거되었습니다. `scene.remove(entity)`는 엔티티를 분리하지만 리스너를 지우지 않으므로 나중에 다시 추가할 수 있습니다.
2. 부모 리스너가 이벤트가 엔티티에 도달하기 전에 `e.stopPropagation()`을 호출합니다.
3. 실수로 `off()`를 호출했습니다 — 때로는 예상보다 일찍 실행되는 정리 함수를 통해 발생합니다.

### 휠 이벤트가 발생하지만 페이지가 계속 스크롤됩니다

캔버스의 `wheel` 이벤트는 엔티티에서 수신하더라도 브라우저로 버블링됩니다. 페이지 스크롤을 중지하려면 명시적으로 `e.preventDefault()`를 호출해야 합니다:

```typescript
myEntity.on('wheel', (e) => {
  // ... handle scroll ...
  e.preventDefault(); // ← required to stop the browser scroll
});
```

참고: `ScrollView`는 자체 휠 이벤트에 대해 (`Ctrl`이 눌린 경우 제외) 자동으로 이 작업을 수행합니다.

### `e.clientX` / `e.clientY`가 키보드 이벤트에 대해 누락되었습니다

`clientX`/`clientY`는 포인터 이벤트 필드이며 네이티브 이벤트가 이를 제공하지 않을 때 `undefined`입니다. 키보드 이벤트의 경우 `e.key`, `e.shiftKey`, `e.ctrlKey`, `e.altKey`, `e.metaKey`를 사용하세요.

> **다음:** [물리 및 애니메이션](/learn/physics-engine/) — 스프링, 공간 해싱, `update()` 루프.
