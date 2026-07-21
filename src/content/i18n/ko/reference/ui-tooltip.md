---
title: 'UI: Tooltip'
description: '대상 Entity에 고정된 호버 트리거 오버레이 텍스트'
order: 37
---

# `Tooltip`

`Tooltip`은 지연 후 대상 근처에 작은 텍스트 패널을 표시합니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Tooltip</span></div>
  <iframe src="/sandbox/ui/component.html?name=tooltip&v=core-1.15.0-ui-2.0.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Tooltip 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>대상을 호버하여 배치 및 해제를 확인하세요.</figcaption>
</figure>

## 최소 예제

```ts
import { Button, Tooltip } from '@vectojs/ui';

const target = new Button('Hover me');
const tooltip = new Tooltip({
  target,
  content: 'Save file',
  placement: 'right',
});
```

## 유지보수 체크리스트

- 포인터 떠남 시 보류 중인 타이머를 지우세요.
- Tooltip 콘텐츠를 짧게 유지하세요.
- 한 번 마운트하고 Tooltip이 자체 show/hide 생명주기를 관리하도록 하세요.
