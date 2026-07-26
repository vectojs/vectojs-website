---
title: 'UI: Popover'
description: '임의의 VectoJS 자식을 포함할 수 있는 클릭 트리거 오버레이 패널'
order: 38
---

# `Popover`

`Popover`는 대상 클릭 시 토글되며 모든 VectoJS 자식 Entity를 포함할 수 있습니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Popover</span></div>
  <iframe src="/sandbox/ui/component.html?name=popover&v=core-1.16.0-ui-2.1.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Popover 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>대상을 두 번 클릭하여 Popover를 열고 닫아보세요.</figcaption>
</figure>

## 최소 예제

```ts
import { Button, Popover, Text } from '@vectojs/ui';

const target = new Button('Open');
const popover = new Popover({ target, width: 220, height: 92, placement: 'right' });
popover.add(new Text('Popover content').setPosition(14, 20));
```

## 유지보수 체크리스트

- 기본 컨트롤 위에서 패널을 읽을 수 있게 유지하세요.
- `Overlay` 범위를 통해 배치(placement)를 제한하세요.
- 대상이 트리를 떠나면 Popover를 숨기거나 폐기하세요.
