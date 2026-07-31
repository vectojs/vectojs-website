---
title: 'UI: ScrollView'
description: '휠 및 포인터 드래그 스크롤이 있는 잘린 스크롤 컨테이너'
order: 32
---

# `ScrollView`

`ScrollView`는 하나의 스크롤 가능한 잘린 영역을 소유합니다. 바운드된 콘텐츠가 가시 영역을 초과할 수 있을 때 사용하세요.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ScrollView</span></div>
  <iframe src="/sandbox/ui/component.html?name=scrollview&v=core-1.25.0-ui-2.6.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="ScrollView 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>뷰포트 내에서 휠 또는 드래그; 중첩된 경쟁 스크롤 소유자를 피하세요.</figcaption>
</figure>

## 최소 예제

```ts
import { ScrollView, Text } from '@vectojs/ui';

const view = new ScrollView({ width: 360, height: 220 });
view.add(new Text('Long content').setPosition(16, 16));
scene.add(view);
```

## 유지보수 체크리스트

- 가시 영역당 하나의 휠 소유자를 유지하세요.
- 직접 자식 배치 변경 후 `updateContentSize()`를 호출하세요.
- 끝에 고정된 스트리밍 콘텐츠에는 `scrollToBottom()`을 사용하세요.
