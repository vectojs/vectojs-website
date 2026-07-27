---
title: 'UI: TreeView'
description: '즉시 또는 지연 자식 로딩이 있는 계층적 트리 컴포넌트'
order: 34
---

# `TreeView`

`TreeView`는 확장 상태와 선택적 지연 자식 로딩으로 계층적 행을 렌더링합니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · TreeView</span></div>
  <iframe src="/sandbox/ui/component.html?name=treeview&v=core-1.17.1-ui-2.3.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="TreeView 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>부모 행을 클릭하여 확장하거나 축소하세요.</figcaption>
</figure>

## 최소 예제

```ts
import { TreeView } from '@vectojs/ui';

const tree = new TreeView({
  width: 280,
  height: 360,
  nodes: [{ id: 'packages', label: 'packages', children: [{ id: 'ui', label: 'ui' }] }],
});
```

## 옵션

| 옵션                                           | 타입             | 기본값 | 설명                                                                                   |
| ---------------------------------------------- | ---------------- | ------ | -------------------------------------------------------------------------------------- |
| `nodes`                                        | `TreeNode[]`     | —      | 루트 노드. 노드의 `children`은 배열 **또는** `() => Promise<TreeNode[]>` (지연 로딩용) |
| `width` / `height`                             | `number`         | —      | 뷰포트 박스. 행이 이것에 가상화됩니다.                                                 |
| `rowHeight`                                    | `number`         | `28`   | 행 피치.                                                                               |
| `font`, `color`, `selectedColor`, `hoverColor` | `string`         | 테마   | 행 페인팅.                                                                             |
| `onSelect`                                     | `(node) => void` | —      | 리프가 활성화될 때 발생.                                                               |
| `onExpand`                                     | `(node) => void` | —      | 부모가 확장될 때 발생.                                                                 |

`setNodes(nodes)`은 트리를 교체합니다; 확장/선택은 노드 `id`로 키잉되므로 안정적인 ID는 교체 시 상태를 보존합니다.

## 접근성 및 키보드

`TreeView`는 각 **보이는** 행에 `role="treeitem"`을 프로젝션합니다—행에 풀링된 투명하고 포커스 가능한 핫스팟으로, `aria-level` (깊이), 행의 `aria-expanded` (부모만), `aria-selected`, **루빙 tabindex**를 가지므로 트리 전체가 하나의 탭 정지입니다.

| 키            | 동작                                                     |
| ------------- | -------------------------------------------------------- |
| Down / Up     | 다음/이전 행으로 이동                                    |
| Right         | 접힌 부모를 확장; 이미 확장된 경우 첫 번째 자식으로 이동 |
| Left          | 확장된 부모를 접음; 그렇지 않으면 부모 행으로 이동       |
| Home / End    | 첫 번째/마지막 행                                        |
| Enter / Space | 활성화 (부모를 토글, 리프 선택)                          |

활성 행은 포커스가 이동하기 전에 뷰로 스크롤됩니다. 보이는 행만 풀링되므로 100k 노드 트리도 O(viewport) 노드만 프로젝션합니다.

핫스팟은 `pointerEvents: 'none'`을 설정하므로 트리는 자체 마우스 처리(탭으로 토글, 드래그로 스크롤)를 유지합니다—키보드 포커스와 AT 합성 `click`은 여전히 통과합니다. [복합 위젯](/reference/core-a11y/#composite-widgets-roving-tabindex)을 참조하세요.

## 포인터 및 터치

- 행을 **탭**하여 토글/선택합니다. 토글은 `pointerup` 시 발생하며, 포인터가 약 6px 미만 이동한 경우에만—터치 드래그가 시작한 행을 실수로 확장하지 않도록 합니다.
- **수직 드래그**로 스크롤 (행이 손가락을 1:1로 따라), `ScrollView` / `VirtualList`와 동일.
- **휠**로 스크롤.

## 유지보수 체크리스트

- 확장, 축소 또는 노드 교체 후 행을 다시 빌드하세요.
- 지연 로더를 멱등(idempotent)으로 유지하세요.
- 선택 및 확장 상태에 안정적인 노드 ID를 사용하세요.
- 행에 경쟁하는 포인터 핸들러를 추가하지 마세요: 컴포넌트가 탭과 드래그의 모호성을 소유하며, 접근성 핫스팟은 의도적으로 포인터를 캡처하지 않습니다.
