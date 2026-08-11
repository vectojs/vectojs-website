+++
title = "UI: VirtualList"
description = "보이는 행과 오버스캔만 마운트하는 가상화된 스크롤 목록"
weight = 33

[extra]
order = 33
+++

# `VirtualList`

`VirtualList`는 긴 항목 배열의 보이는 창만 렌더링합니다. 일반 자식 마운팅이 낭비가 될 대규모 목록에 사용하세요.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · VirtualList</span></div>
  <iframe src="/sandbox/ui/component.html?name=virtuallist&v=core-1.34.0-ui-2.15.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="VirtualList 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>데모에는 120개 항목이 있지만, 보이는 행과 오버스캔만 마운트됩니다.</figcaption>
</figure>

## 최소 예제

```ts
import { Text, VirtualList } from '@vectojs/ui';

const list = new VirtualList({
  items,
  width: 360,
  height: 400,
  estimatedRowHeight: 32,
  renderItem: (item) => new Text(item.label),
});
```

## 유지보수 체크리스트

- 현실적인 `estimatedRowHeight`를 제공하세요.
- 행 Entity를 가볍고 자체 포함적으로 유지하세요.
- 전체 데이터셋을 교체할 때는 `setItems()`를 사용하세요.
