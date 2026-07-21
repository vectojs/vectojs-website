---
title: 'UI: ContextMenu'
description: '구분선, 비활성화된 행, 단축키, 중첩 하위 메뉴가 있는 오버레이 명령 메뉴'
order: 39
---

# `ContextMenu`

`ContextMenu`는 명령 표면을 위한 오버레이 메뉴입니다.

UI 1.11.1–1.11.3에서는 중첩 메뉴 체인의 수명 주기가 안전해졌습니다. 루트 메뉴가 소유한 하나의 backdrop이 전체 체인을 닫거나 파괴하고, 숨겨진 메뉴는 시맨틱 또는 포인터 히트 표면을 남기지 않으며, 각 루트 메뉴는 안정적인 backdrop ID를 가집니다. 바깥쪽 `pointerdown`은 즉시 메뉴를 닫지만 키보드와 보조 기술을 위한 시맨틱 `click` 활성화는 유지됩니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ContextMenu</span></div>
  <iframe src="/sandbox/ui/component.html?name=contextmenu&v=core-1.15.0-ui-2.0.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="ContextMenu 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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
