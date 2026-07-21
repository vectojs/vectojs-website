---
title: 'UI: Stack'
description: '세로 또는 가로 자식 배치를 위한 구조적 레이아웃 컨테이너'
order: 21
---

# `Stack`

`Stack`은 자식을 한 축을 따라 순차적으로 배치하고 배치된 콘텐츠에 맞게 크기를 조정합니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Stack</span></div>
  <iframe src="/sandbox/ui/component.html?name=stack&v=core-1.15.0-ui-2.0.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Stack 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>자식은 자신의 크기를 유지합니다. `Stack`은 로컬 `x`와 `y`만 설정합니다.</figcaption>
</figure>

## 최소 예제

```ts
import { Button, Stack, Text } from '@vectojs/ui';

const column = new Stack({ direction: 'vertical', gap: 12 });
column.add(new Text('Export settings'));
column.add(new Button('Save'));
scene.add(column.setPosition(24, 24));
```

## 유지보수 체크리스트

- 자식 크기를 직접 변경한 후 `layout()`을 호출하세요.
- 교차 축 배치에는 `align`을 사용하세요.
- 주요 요구사항이 가로 줄바꿈인 경우 `Flow`를 사용하세요.
