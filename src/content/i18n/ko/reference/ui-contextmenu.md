---
title: 'UI: ContextMenu'
description: '구분선, 비활성화된 행, 단축키, 중첩 하위 메뉴가 있는 오버레이 명령 메뉴'
order: 39
---

# `ContextMenu`

`ContextMenu`는 명령 표면을 위한 오버레이 메뉴입니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ContextMenu</span></div>
  <iframe src="/sandbox/ui/component.html?name=contextmenu&v=core-1.9.2-ui-1.9.5" class="sandbox-frame component-demo-frame-tall" loading="eager" title="ContextMenu 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>실행기를 클릭하여 제한된 뷰포트 내에서 메뉴를 열어보세요.</figcaption>
</figure>

## 최소 예제

```ts
import { ContextMenu } from '@vectojs/ui';

const menu = new ContextMenu({
  items: [
    { label: 'Copy', shortcut: 'Ctrl+C' },
    { separator: true },
    { label: 'Delete', disabled: true },
  ],
});

// `'contextmenu'` is not a VectoEvent — only pointerdown/up are dispatched
// into the tree. Filter `pointerdown` on the native right button (2), and
// pass the owning entity as the third arg so `showAtPoint` can find the
// scene even on the very first call (before any manual `scene.add(menu)`).
target.on('pointerdown', (event) => {
  const pointer = event.nativeEvent as PointerEvent | undefined;
  if (pointer?.button !== 2 || event.sceneX === undefined || event.sceneY === undefined) return;
  menu.showAtPoint(event.sceneX, event.sceneY, target);
});
```

## 유지보수 체크리스트

- 메뉴 텍스트가 패널을 넘치지 않도록 하세요.
- 비활성화된 행은 상호작용이 불가능하게 유지하세요.
- 중첩된 하위 메뉴를 오버레이 루트를 통해 다시 배치(reposition)하세요.
