---
title: 'UI: Card'
description: '선택적 role=group 시맨틱이 있는 둥근 캔버스 패널 컴포넌트'
order: 20
---

# `Card`

`Card`는 `@vectojs/ui` 예제 전반에서 사용되는 기본 시각적 패널입니다. 기본적으로 장식용이며, `label`을 전달하면 시맨틱 그룹이 됩니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Card</span></div>
  <iframe src="/sandbox/ui/component.html?name=card&v=core-1.9.2-ui-1.10.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Card 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Card는 배경과 테두리를 소유하며, 자식 요소는 Card의 로컬 공간에 배치됩니다.</figcaption>
</figure>

## 최소 예제

```ts
import { Card, Text } from '@vectojs/ui';

const card = new Card({
  width: 320,
  height: 180,
  radius: 18,
  border: 'rgba(148,163,184,0.2)',
  label: 'Settings panel',
});

card.add(new Text('Settings').setPosition(24, 24));
scene.add(card);
```

## 유지보수 체크리스트

- 영역이 검색 가능해야 하는 경우에만 `label`을 사용하세요.
- `padding`이 자식 레이아웃을 자동으로 배치한다고 가정하지 마세요.
- 유지보수 가능한 레이아웃을 위해 Card 내부에서는 `Stack` 또는 `Flow`를 선호하세요.
