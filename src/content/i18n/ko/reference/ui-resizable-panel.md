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
  <iframe src="/sandbox/ui/component.html?name=resizablepanel&v=core-1.11.1-ui-1.11.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="크기 조절 가능한 패널 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>패널 사이의 구분선을 드래그하여 핸들 호버 및 크기 조절 동작을 확인하세요.</figcaption>
</figure>

## 최소 예제

```ts
import { Panel, PanelGroup, Text } from '@vectojs/ui';

const group = new PanelGroup({ direction: 'horizontal', width: 640, height: 360 });
group
  .addPanel(new Panel({ minSize: 160 }).setContent(new Text('Sidebar')))
  .addPanel(new Panel({ minSize: 260 }).setContent(new Text('Canvas')));
```

## 유지보수 체크리스트

- 드래그 시 각 패널의 `minSize`를 유지하세요.
- 호스트 컨테이너 크기가 변경될 때 `resize(width, height)`를 호출하세요.
- 중첩된 `PanelGroup` 인스턴스를 `Panel` 콘텐츠 경계 내에 유지하세요.
