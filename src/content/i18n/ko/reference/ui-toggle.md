---
title: 'UI: Toggle'
description: 'role=switch 시맨틱과 스프링 노브 모션이 있는 스위치 컨트롤'
order: 26
---

# `Toggle`

`Toggle`은 스위치 스타일의 불리언 컨트롤입니다. `role="switch"`를 프로젝션하고 공유 애니메이션 시스템으로 노브를 애니메이션합니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Toggle</span></div>
  <iframe src="/sandbox/ui/component.html?name=toggle&v=core-1.18.0-ui-2.3.2" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Toggle 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>노브가 부드럽게 재조정되며 시맨틱 `checked` 상태는 현재를 유지합니다.</figcaption>
</figure>

## 최소 예제

```ts
import { Toggle } from '@vectojs/ui';

const darkMode = new Toggle({
  checked: true,
  label: 'Dark mode',
  onChange: (checked) => setDarkMode(checked),
});
```

## 유지보수 체크리스트

- 노브 애니메이션과 시맨틱 상태를 일치시키세요.
- 공유 애니메이션 시스템을 통해 reduced motion을 존중하세요.
- 비-스위치 불리언 선택에는 `Checkbox`를 선호하세요.
