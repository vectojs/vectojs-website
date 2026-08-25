+++
title = "UI: Input"
description = "네이티브 편집 동작을 캔버스에 미러링하는 단일 줄 텍스트 입력"
weight = 23
+++

# `Input`

`Input`은 실제 투명 `<input>`을 사용하여 편집을 수행하면서 보이는 필드를 캔버스에 그립니다.
IME, 클립보드, 선택 및 자동화는 네이티브로 유지됩니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Input</span></div>
  <iframe src="/sandbox/ui/component.html?name=input&v=core-1.39.0-ui-2.20.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Input 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>키보드 입력 또는 역할 기반 자동화를 통해 텍스트 상자를 채워보세요.</figcaption>
</figure>

## 최소 예제

```ts
import { Input } from '@vectojs/ui';

const name = new Input({
  width: 320,
  placeholder: 'Project name',
  onChange: (value) => updateProjectName(value),
});
```

## 유효성 검사 상태(Validation state) (2.3.0+)

`required`와 `invalid`는 단순히 테두리에만 적용되는 것이 아니라 접근성 트리에도 전달됩니다:

```ts
const email = new Input({ width: 240, placeholder: 'Email', required: true });
email.invalid = !isValidEmail(email.value); // red border + aria-invalid
```

`required`는 shadow `<input>`/`<textarea>`의 **네이티브** `required` 속성으로 투영(project)되므로, 단순히 제약 조건을 설명하는 데 그치지 않고 폼(form) 유효성 검사 및 `:invalid` 스타일링에 참여합니다. `invalid`는 `aria-invalid`가 됩니다.

`invalid`를 지우면 `"false"`로 설정하는 대신 속성을 **제거**합니다 — `aria-invalid="false"`는 "명시적으로 유효함(explicitly valid)"을 주장하기 때문에 두 가지는 다른 의미를 갖습니다.

빨간색 테두리만으로는 스크린 리더 사용자나 색상을 구별할 수 없는 사용자(WCAG 1.4.1)에게 보이지 않으므로, 상태가 단지 그려지기만 하는 것이 아니라 투영되는 것입니다. 강제 색상(forced colors) 환경에서는 두 상태 모두 시스템 색상을 따릅니다.

`TextArea`도 동일한 두 가지 옵션을 취합니다.

## IME 합성

IME 합성이 활성 상태인 동안 컴포넌트는 합성 범위 아래에 밑줄을 그립니다. 이 기간 동안 **선택 하이라이트가 억제됩니다**: 선택된 텍스트 위에서 합성하면 논리적으로 해당 범위를 대체하지만, 네이티브 요소는 합성이 커밋될 때까지 합성 전 `selectionStart`/`selectionEnd`를 계속 보고합니다—이를 그리면 합성 밑줄 뒤에 (그리고 더 넓은) 오래된 하이라이트가 표시됩니다. 길이가 0인 합성(처음 `compositionstart`)은 아직 아무것도 대체하지 않았으므로 선택을 계속 표시합니다.

## 유지보수 체크리스트

- 사용자 정의 텍스트 입력 엔티티 대신 `Input`을 사용하세요.
- 플레이스홀더를 의미 있게 유지하세요. 이것도 기본 접근 가능한 이름입니다.
- 제어된 업데이트를 구현할 때 선택을 의도적으로 보존하세요.
