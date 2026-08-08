---
title: 'UI: Checkbox'
description: '네이티브 입력 시맨틱과 캔버스 시각적 상태를 갖춘 체크박스 컨트롤'
order: 25
---

# `Checkbox`

`Checkbox`는 실제 체크박스 입력을 프로젝션하고 시각적 상태를 캔버스에 그립니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Checkbox</span></div>
  <iframe src="/sandbox/ui/component.html?name=checkbox&v=core-1.32.6-ui-2.15.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Checkbox 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>캔버스 클릭과 네이티브 입력 변경은 동일한 `change` 경로를 공유합니다.</figcaption>
</figure>

## 최소 예제

```ts
import { Checkbox } from '@vectojs/ui';

const enabled = new Checkbox({
  checked: true,
  label: 'Enable semantic projection',
  onChange: (checked) => setEnabled(checked),
});
```

## 유지보수 체크리스트

- `checked`와 프로젝션된 입력 상태를 동기화된 상태로 유지하세요.
- 시각적 상태가 변경될 때 `scene.markDirty()`를 호출하세요.
- 주변 컨텍스트가 이미 컨트롤을 명명하지 않은 경우 레이블을 사용하세요.
