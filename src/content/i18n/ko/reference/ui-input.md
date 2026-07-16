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
  <iframe src="/sandbox/ui/component.html?name=input&v=core-1.9.2-ui-1.9.5" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Input 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## 유지보수 체크리스트

- 커스텀 텍스트 입력 Entity 대신 `Input`을 사용하세요.
- 플레이스홀더를 의미 있게 유지하세요. 이는 기본 접근 가능 레이블이기도 합니다.
- 제어된 업데이트를 구현할 때 선택(selection)을 의도적으로 유지하세요.
