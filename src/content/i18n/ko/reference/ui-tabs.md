---
title: 'UI: Tabs'
description: '활성 콘텐츠 뷰를 마운트하는 탭 패널 컨테이너'
order: 29
---

# `Tabs`

`Tabs`는 탭 막대를 그리고 활성 탭 콘텐츠 Entity만 마운트합니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Tabs</span></div>
  <iframe src="/sandbox/ui/component.html?name=tabs&v=core-1.9.2-ui-1.9.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Tabs 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>탭 전환은 비활성 콘텐츠를 Entity 트리에서 제거합니다.</figcaption>
</figure>

## 최소 예제

```ts
import { Tabs, Text } from '@vectojs/ui';

const tabs = new Tabs({
  width: 480,
  height: 260,
  tabs: [
    { id: 'usage', label: 'Usage', content: new Text('Usage panel') },
    { id: 'api', label: 'API', content: new Text('API panel') },
  ],
});
```

## 유지보수 체크리스트

- 탭 콘텐츠 크기를 컨테이너 크기와 동기화된 상태로 유지하세요.
- 활성 탭이 실제로 변경될 때만 `change`를 방출하세요.
- 향후 탭 수준 시맨틱에서 키보드/포커스 동작을 유지하세요.
