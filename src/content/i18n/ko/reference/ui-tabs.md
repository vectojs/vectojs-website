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
  <iframe src="/sandbox/ui/component.html?name=tabs&v=core-1.11.1-ui-1.11.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Tabs 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## 단일 탭의 막대 숨기기

편집기 및 터미널 스타일 앱은 종종 Vim의 `showtabline=1` 동작을 원합니다: 탭이 하나만 있는 동안 탭 막대가 없습니다. `autoHideTabBar: true`를 전달하세요(`@vectojs/ui` >= 1.10.0) — 탭이 2개 미만인 동안 막대(및 포인터 히트 영역)가 사라지고, 콘텐츠가 전체 높이를 차지하며, 두 번째 탭이 추가되면 즉시 막대가 돌아옵니다. 막대 주위에 형제를 배치하는 소유자는 `tabHeight`를 가정하는 대신 라이브 `effectiveTabBarHeight` 게터를 읽어야 합니다.

```ts
const tabs = new Tabs({
  width: 480,
  height: 260,
  autoHideTabBar: true,
  tabs: [{ id: 'only', label: 'untitled', content: editorView }],
});
tabs.effectiveTabBarHeight; // 지금은 0, 두 번째 탭이 열리면 tabHeight
```

## 유지보수 체크리스트

- 탭 콘텐츠 크기를 컨테이너 크기와 동기화된 상태로 유지하세요.
- 활성 탭이 실제로 변경될 때만 `change`를 방출하세요.
- 향후 탭 수준 시맨틱에서 키보드/포커스 동작을 유지하세요.
