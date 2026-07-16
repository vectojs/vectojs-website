---
title: 'a11yRoot 및 에이전트 계약'
description: '모든 대화형 Entity가 DOM에 투명한 ARIA 섀도우 노드를 투영하는 방법 — A11yAttributes 구조, 캔버스 성능 및 DOM 수준 접근성 계약, 그리고 오래되었거나 누락된 섀도우 노드를 유발하는 동기화 주의사항.'
order: 10
---

# a11yRoot 및 에이전트 계약

[`@vectojs/core`](/reference/core-api/)의 일부입니다.

박스를 가진 모든 대화형 엔터티는 Scene의 `a11yRoot` div 안에 **투명한 ARIA 섀도우
노드**를 투영합니다(캔버스 위에 위치, `pointerEvents:auto`로
자동화/AT가 상호작용 가능; `debugA11y`가 아닌 이상 `opacity:0`). 각 노드는
`id` + `data-vecto-id`와
[`Entity.getA11yAttributes()`](/reference/core-entity/#a11y--batching-hooks-override-to-opt-in)의
role/label/state를 전달합니다.

투영 루트는 캔버스 CSS 박스를 추적합니다: 캔버스 오프셋과 비균일 CSS
스케일링은 섀도우 및 DOM-포털 레이어에 적용되는 반면
엔터티 지오메트리는 논리적 Scene 좌표계에 그대로 유지됩니다. 캔버스의 임의 CSS 회전/기울이기는
이 매핑의 일부가 아닙니다.

`A11yAttributes`:

```ts
{
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea';   // 기본값 'div'
  role?, label?, tabIndex?, href?, src?, alt?, inputType?, placeholder?, value?,
  checked?, disabled?, expanded?, controls?, haspopup?, selected?,
  activedescendant?, valuemin?, valuemax?
}
```

동기화는 이를 실제 엘리먼트(실제 `<button>`, `<a href>`, `<img>`,
`<input>`/`<textarea>` — IME 인식 `change`/`focus`/`blur` 등)에 적용하며,
더티 검사를 통해 DOM 쓰기를 최소화합니다. 기본적으로 포커스가 불가능한 대화형 역할
(`button`, `switch`, `checkbox`, `link`, `slider`, …)은 `tabindex="0"`과
Enter/Space → `click`을 받습니다. 이것이 "**캔버스 성능 및 DOM 수준
접근성**" 스토리입니다: 시각적 요소는 100% GPU/캔버스이면서, Playwright/에이전트
`getByRole('button', { name })`은 섀도우 노드를 찾아 클릭할 수 있습니다.

디자인 캔버스와 같은 비-컨트롤 영역이 순차적 포커스 순서에 진입하고
VMT `keydown` 이벤트를 수신해야 하는 경우 `tabIndex: 0`을 명시적으로 설정하세요. 프로그래매틱 포커스만
필요한 경우 `-1`을 사용하고, `undefined`를 반환하면 명시적 값을 제거합니다.

## 컨트롤 및 주의사항

- 각 섀도우 노드의 `data-vecto-id`는 엔터티 `id`를 반영합니다 — 자동화 셀렉터를 위한
  안정적인 핸들입니다.
- `a11ySyncInterval` ([`SceneOptions`](/reference/core-scene/#sceneoptions) 참조)은
  애니메이션 중 동기화를 스로틀링하고 보류 중인
  모션이 안정된 후 최종 캐치업을 보장합니다; 전체 애니메이션 동안 모든 동기화를 중단하지는 않습니다.
- `debugA11y: true`는 개발용으로 노드(파란색 점선)를 표시합니다.
- `detachA11y(entity)`는 엔터티를 제거하지 않고 하위 트리의 섀도우 노드를 정리합니다;
  `remove()`는 자동으로 정리합니다. 프레임별 동기화는 **생성/업데이트는 하지만
  정리하지 않으므로**, 대화형 자식의 변경을 명시적으로 관리하세요.
- `getA11yTree()`는 중첩된 `A11yTreeNode[]` 스냅샷을 반환하여
  어설션에 사용할 수 있습니다; `getA11yElement(id)`는 특정 섀도우 엘리먼트를 가져옵니다.
- `a11yFullViewport`는 다른 모든 노드 뒤에 경계 없는 상호작용 표면을 마운트합니다.

사용법 및 테스트 패턴은 [Accessibility](/learn/accessibility/)를 참조하세요.

## 관련 항목

[`Scene`](/reference/core-scene/) (`a11ySyncInterval`, `debugA11y`) ·
[`Entity`](/reference/core-entity/) (`getA11yAttributes()`, `interactive`, `width`/`height`) ·
[`@vectojs/core` 개요](/reference/core-api/)
