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
  <iframe src="/sandbox/ui/component.html?name=contextmenu&v=core-1.32.3-ui-2.13.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="ContextMenu 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## 접근성 및 키보드

각 비구분선 항목은 **루빙 tabindex**(메뉴가 하나의 탭 정지), 해당하는 경우 `disabled`, 하위 메뉴 부모의 `aria-haspopup="menu"` + `aria-expanded`와 함께 `role="menuitem"` 핫스팟을 프로젝션합니다.

| 키            | 동작                                                                 |
| ------------- | -------------------------------------------------------------------- |
| Down / Up     | 다음/이전 **활성화된** 항목, 래핑; 구분선과 비활성화된 항목은 건너뜀 |
| Home / End    | 첫 번째/마지막 활성화된 항목                                         |
| Right         | 하위 메뉴 부모를 열고 첫 번째 항목에 포커스                          |
| Left          | 이 하위 메뉴를 닫고 부모 메뉴에 포커스를 반환                        |
| Enter / Space | 활성화 (하위 메뉴를 열거나 `onClick`을 발생시키고 메뉴 트리를 닫음)  |
| Escape        | 전체 메뉴 트리를 닫음                                                |

핫스팟은 `pointerEvents: 'none'`을 설정하므로 메뉴는 자체적인 위치 기반 `pointerdown` 히트 처리를 유지합니다. [복합 위젯](/reference/core-a11y/#복합-위젯-로빙-tabindex)을 참조하세요.

> **메뉴를 표시하면 전체 씬 백드롭이 설치됩니다.** 루트 메뉴는 닫히는 외부 클릭을 캐치하기 위해 씬 크기의 보이지 않는 대화형 엔티티를 추가합니다. 그 백드롭은 메뉴가 열려 있는 동안 전체 씬의 포인터 이벤트를 가로채므로—드래그/선택이 필요한 픽스처나 테스트에서 메뉴를 열어 두지 마세요.

## 유지보수 체크리스트

- 메뉴 텍스트가 패널을 넘치지 않도록 하세요.
- 비활성화된 행이 상호작용하지 않도록 하세요.
- 오버레이 루트를 통해 중첩 하위 메뉴의 위치를 다시 지정하세요.
- 루트 메뉴를 공유 백드롭의 유일한 소유자로 유지하고, 명령, 외부 포인터다운 또는 파괴 시 전체 하위 메뉴 체인을 닫으세요.
