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
  <iframe src="/sandbox/ui/component.html?name=textarea&v=core-1.17.0-ui-2.2.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="TextArea 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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
