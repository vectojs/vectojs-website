---
title: 'UI: TextArea'
description: '캔버스 렌더링이 있는 여러 줄 네이티브 텍스트 편집'
order: 24
---

# `TextArea`

`TextArea`는 네이티브 `<textarea>`를 캔버스에 미러링하여 브라우저 편집 동작을 유지합니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · TextArea</span></div>
  <iframe src="/sandbox/ui/component.html?name=textarea&v=core-1.32.2-ui-2.13.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="TextArea 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>여러 줄 편집은 네이티브이며, 캔버스는 시각적 미러를 그립니다.</figcaption>
</figure>

## 최소 예제

```ts
import { TextArea } from '@vectojs/ui';

const notes = new TextArea({
  width: 420,
  height: 140,
  placeholder: 'Write a note…',
  onChange: (value) => saveDraft(value),
});
```

## IME 합성

IME 합성이 활성 상태인 동안 컴포넌트는 합성 범위 아래에 밑줄을 그립니다. 이 기간 동안 **선택 하이라이트가 억제됩니다**: 선택된 텍스트 위에서 합성하면 논리적으로 해당 범위를 대체하지만, 네이티브 요소는 합성이 커밋될 때까지 합성 전 `selectionStart`/`selectionEnd`를 계속 보고합니다—이를 그리면 합성 밑줄 뒤에 (그리고 더 넓은) 오래된 하이라이트가 표시됩니다. 길이가 0인 합성(처음 `compositionstart`)은 아직 아무것도 대체하지 않았으므로 선택을 계속 표시합니다.

## 유지보수 체크리스트

- 실제 여러 줄 텍스트 입력에는 이것을 사용하세요.
- 하나의 텍스트 편집 소유자를 유지하세요. 캔버스에서 IME나 클립보드를 가장(fake)하지 마세요.
- 포인터 클릭뿐만 아니라 키보드 선택 및 붙여넣기로도 테스트하세요.
- 투명한 네이티브 textarea는 캔버스 폰트, 줄 높이, 패딩 및 `border-box` 계약을 상속하므로, 클릭-투-캐럿 및 선택 행이 보이는 캔버스 미러와 동일한 지오메트리를 사용합니다.

## 스크롤

캔버스는 **네이티브 요소의** `scrollTop`을 따릅니다(2.10.0+). 미러가 스크롤의 권한을 가지며 브라우저가 이미 그것을 스크롤했으므로 휠 핸들러가 없습니다—추가하면 제스처가 두 번 적용됩니다.

2.10.0 이전에는 캔버스의 스크롤 위치가 캐럿에 의해서만 구동되어 `selectionStart`가 이동할 때만 갱신되었고 뷰에 의해서는 결코 갱신되지 않았습니다. 여기서 두 가지 결함이 발생했습니다. 휠 제스처는 실제 요소를 움직였지만 캔버스는 제자리에 머물러 텍스트가 전혀 스크롤되지 않았습니다. 그리고 `selectionStart`가 `value.length`로 초기화되므로, 갓 마운트된 TextArea는 콘텐츠의 **아래쪽**을 그리는 반면 네이티브 요소는 맨 위에 있었고—60줄 문서에서 32.6행의 불일치가 측정되었습니다—모든 클릭의 캐럿이 잘못된 줄에 놓였습니다.

캐럿 추적은 미러가 없는 경우의 폴백으로 유지됩니다. 미러는 또한 `scrollbar-width: none`을 설정합니다: 네이티브 스크롤바 거터가 `clientWidth`를 캔버스 너비보다 좁게 만들어 둘이 서로 다른 지점에서 줄바꿈되기 때문입니다. 2.9.0에서 Firefox로 측정한 결과, 너비 516px인 TextArea에는 12px 거터가 있어 네이티브 요소는 480px에서, 캔버스는 492px에서 줄바꿈되었습니다.
