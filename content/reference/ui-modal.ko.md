+++
title = "UI: Modal"
description = "카드, 배경(backdrop) 및 스프링 진입/퇴장 모션이 있는 차단 오버레이 컴포넌트"
weight = 36
+++

# `Modal`

`Modal`은 오버레이 레이어에 마운트되어, 기본 포인터 이벤트를 차단하고 카드를 애니메이션으로 진입 및 퇴장시킵니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Modal</span></div>
  <iframe src="/sandbox/ui/component.html?name=modal&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Modal 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Modal을 열고 캔버스 렌더링 닫기 버튼으로 닫아보세요.</figcaption>
</figure>

## 최소 예제

```ts
import { Button, Modal } from '@vectojs/ui';

const open = new Button('Open modal', {
  onClick: () => {
    scene.showOverlay(new Modal('Export complete', { width: scene.width, height: scene.height }));
  },
});
```

## 유지보수 체크리스트

- Modal 배경(backdrop)을 씬 크기에 맞게 조정하세요.
- 닫기 동작을 명시적으로 유지하세요.
- 광범위한 사용 전에 reduced-motion 동작과 포커스 처리를 확인하세요.
