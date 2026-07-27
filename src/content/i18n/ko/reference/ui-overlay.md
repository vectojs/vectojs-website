---
title: 'Overlay'
description: 'Tooltip, Popover 및 ContextMenu를 위한 플로팅 UI 프리미티브, Scene 오버레이 루트를 통해 마운트됨'
order: 15
---

# Overlay

오버레이 계열은 일반 Entity 트리 위에 일시적인 UI를 렌더링합니다. 오버레이는 `scene.overlayRoot`를 통해 마운트되므로, 잘린 컨테이너를 벗어나면서도 씬 좌표와 동일한 애니메이션 시스템을 사용할 수 있습니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Overlay</span></div>
  <iframe src="/sandbox/ui/overlay.html?v=core-1.18.0-ui-2.3.2" class="sandbox-frame component-demo-frame component-demo-frame-tall" loading="eager" title="Overlay 라이브 데모" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>실행기를 호버하거나 클릭해보세요. Popover와 ContextMenu는 거대한 갤러리에서 발견하기 어려운 오버플로 결함을 피하기 위해 배치됩니다.</figcaption>
</figure>

## 최소 예제

```ts
import { Button, Popover, Text } from '@vectojs/ui';

const target = new Button('Click · Popover').setPosition(40, 40);
const popover = new Popover({
  target,
  width: 220,
  height: 92,
  placement: 'right',
});

popover.add(new Text('Popover content').setPosition(14, 18));
scene.add(target);
scene.add(popover);
```

## 컴포넌트

| 컴포넌트      | 트리거                                 | 사용 사례                         |
| ------------- | -------------------------------------- | --------------------------------- |
| `Tooltip`     | 선택적 지연 시간으로 대상 호버         | 간단한 설명 텍스트                |
| `Popover`     | 대상 클릭                              | 자식 노드가 있는 소형 일시적 패널 |
| `ContextMenu` | 일반적으로 우클릭 또는 클릭            | 구분선/항목이 있는 명령 메뉴      |
| `Overlay`     | 수동 `showAt()`/`showAtPoint(source?)` | 커스텀 플로팅 컴포넌트            |

## 유지보수 체크리스트

- 변환된 대상에는 `target.getWorldBounds()`를 사용하세요.
- 예제를 뷰포트 또는 데모 중인 카드 범위로 제한하세요.
- 대상이 트리를 떠나면 일시적 UI를 숨기거나 폐기하세요.
- 기본 컨트롤 위에서 오버레이 콘텐츠를 읽을 수 있도록 충분히 불투명한 배경을 사용하세요.

관련 문서: [`Button`](/reference/ui-button/), [`ScrollView`](/reference/ui-components/#scrollview), [`Modal`](/reference/ui-components/#modal).
