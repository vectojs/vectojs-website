---
title: 'UI: Resizable panels'
description: '드래그 가능한 분할 창 레이아웃을 위한 PanelGroup, Panel 및 PanelResizeHandle'
order: 35
---

# Resizable panels

크기 조절 가능한 패널 내보내기는 함께 작동합니다: `PanelGroup`이 공간을 분할하고, `Panel`이 잘린 콘텐츠 영역을 소유하며, `PanelResizeHandle`이 패널 사이에 자동으로 삽입됩니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · PanelGroup</span></div>
  <iframe src="/sandbox/ui/component.html?name=resizablepanel&v=core-1.9.2-ui-1.10.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="크기 조절 가능한 패널 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>패널 사이의 구분선을 드래그하여 핸들 호버 및 크기 조절 동작을 확인하세요.</figcaption>
</figure>

## 최소 예제

```ts
import { Panel, PanelGroup, Stack, Text } from '@vectojs/ui';

const group = new PanelGroup({ direction: 'horizontal', width: 640, height: 360 });
group
  // 사이드바 콘텐츠는 Stack으로, 뷰포트를 채우도록 크기 조정됩니다
  // — 기본 `fit: true`가 패널 박스와 일치하도록 유지하여
  // 이전에 수동 `content.width = panel.width` 동기화가 필요했던
  // 간격을 해소합니다(아래 "호스팅된 콘텐츠 크기 조정" 참조).
  .addPanel(
    new Panel({ minSize: 160 }).setContent(
      new Stack({ direction: 'vertical' }).add(new Text('Sidebar')),
    ),
  )
  .addPanel(
    new Panel({ minSize: 260 }).setContent(
      new Stack({ direction: 'vertical' }).add(new Text('Canvas')),
    ),
  );
```

## 호스팅된 콘텐츠 크기 조정 (`setContent`)

`Panel.setContent(content, fit?)`는 호스팅된 콘텐츠의 `width`/`height`를 기본적으로 패널 자체 박스에 동기화합니다(`fit: true`, 양축) — `setContent()` 시점뿐만 아니라 이후 모든 `PanelGroup` 디바이더 드래그 또는 `resize()` 호출에서도 동기화됩니다. 이는 실제 간격을 해소합니다: 이전에는 `setContent`가 콘텐츠 위치만 설정했으며(`content.x = 0; content.y = 0`), 앱이 모든 리사이즈에서 수동으로 `content.width = panel.width`를 동기화해야 했고, 깊은 컴포넌트 체인의 한 곳에서 동기화를 놓치면 프로덕션에서 실제 클립-오버플로우 버그가 발생했습니다.

```ts
panel.setContent(myLayout); // width와 height 모두 추적(기본값)
panel.setContent(myLayout, false); // 기존 위치-전용 동작
panel.setContent(myLayout, { width: true, height: false }); // width만
```

**자체 크기 조정 콘텐츠에는 `fit: false`를 전달하세요** — 자체 `width`/`height`가 작성자 설정이 아닌 콘텐츠에서 파생되는 엔터티(예: `maxWidth`가 없는 기본 `Text`로, `setText()`/`setMaxWidth()` 호출 시마다 `result.totalWidth`/줄 수에서 자체 박스를 재계산). 기본 `fit: true`가 이러한 엔터티의 박스를 매 프레임 패널 박스로 강제하면 자체 계산된 크기를 덮어씁니다 — `Text` 자체의 `render()`에는 무해하지만(캐시된 `lines`에서 그리고, `width`/`height`를 직접 사용하지 않음), 해당 엔터티의 `width`/`height`를 레이아웃에 사용하는 다른 모든 것(히트 테스트, a11y 그림자 요소 크기, 씬 감사)에는 문제를 일으킵니다. 자체 크기 조정 콘텐츠는 먼저 `Stack`/`Flow`로 래핑하세요(이들은 자체 크기 조정이 아닌 자식 배치가 역할이므로 `fit`해도 괜찮습니다), 패널 내에서 중앙/채우기를 원하는 경우. 또는 `fit: false`를 전달하고 직접 크기를 조정하세요.

## 유지보수 체크리스트

- 드래그 시 각 패널의 `minSize`를 유지하세요.
- 호스트 컨테이너 크기가 변경될 때 `resize(width, height)`를 호출하세요.
- 중첩된 `PanelGroup` 인스턴스를 `Panel` 콘텐츠 경계 내에 유지하세요.
- 자체 크기 조정 콘텐츠( `maxWidth` 없는 기본 `Text`, 또는 자체 레이아웃이 박스를 계산하는 엔터티)에는 `setContent()`에 `fit: false`를 전달하세요 — 기본 `fit: true`는 레이아웃 컨테이너(`Stack`, `Flow`, 다른 `PanelGroup`)에는 적합하지만 자체 크기 조정 엔터티의 박스를 매 프레임 덮어씁니다.
