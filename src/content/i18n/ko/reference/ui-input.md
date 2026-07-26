---
title: 'UI: Input'
description: '네이티브 편집 동작을 캔버스에 미러링하는 단일 줄 텍스트 입력'
order: 23
---

# `Input`

`Input`은 실제 투명 `<input>`을 사용하여 편집을 수행하면서 보이는 필드를 캔버스에 그립니다.
IME, 클립보드, 선택 및 자동화는 네이티브로 유지됩니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Input</span></div>
  <iframe src="/sandbox/ui/component.html?name=input&v=core-1.16.0-ui-2.1.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Input 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## IME 합성

IME 합성이 활성 상태인 동안 컴포넌트는 합성 범위 아래에 밑줄을 그립니다. 이 기간 동안 **선택 하이라이트가 억제됩니다**: 선택된 텍스트 위에서 합성하면 논리적으로 해당 범위를 대체하지만, 네이티브 요소는 합성이 커밋될 때까지 합성 전 `selectionStart`/`selectionEnd`를 계속 보고합니다—이를 그리면 합성 밑줄 뒤에 (그리고 더 넓은) 오래된 하이라이트가 표시됩니다. 길이가 0인 합성(처음 `compositionstart`)은 아직 아무것도 대체하지 않았으므로 선택을 계속 표시합니다.

## 유지보수 체크리스트

- 사용자 정의 텍스트 입력 엔티티 대신 `Input`을 사용하세요.
- 플레이스홀더를 의미 있게 유지하세요. 이것도 기본 접근 가능한 이름입니다.
- 제어된 업데이트를 구현할 때 선택을 의도적으로 보존하세요.
