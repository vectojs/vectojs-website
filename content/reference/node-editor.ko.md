+++
title = "@vectojs/node-editor"
description = "캔버스 네이티브 노드 에디터 엔터티: 타입화된 문서 모델, 되돌릴 수 있는 커맨드, 키보드로 도달 가능한 포트와 연결, 엄격한 영속성 검증, 결정적 계층 자동 레이아웃."
weight = 48
+++

# `@vectojs/node-editor`

문서 버전: **0.2.0**

`@vectojs/node-editor`는 VectoJS 프리미티브로 만들어진 노드 그래프 편집기입니다: `Entity` 서브클래스(`NodeEditor`)가 `NodeDocument`의 타입화된 노드와 링크를 캔버스 카드로 렌더링하고, 문서 변경, 선택, 히스토리, 영속화, 계층 자동 레이아웃을 위한 렌더러 중립 헬퍼를 제공합니다. 문서 헬퍼는 평범한 데이터 위의 평범한 함수입니다 — 어떤 엔터티도 인스턴스화하지 않고 테스트에서 헤드리스로 사용할 수 있습니다.

```bash
bun add @vectojs/node-editor
```

```ts
import { NodeEditor } from '@vectojs/node-editor';

const editor = new NodeEditor({ width: 1000, height: 700 });
scene.add(editor);
```

## 문서 모델

```ts
interface NodeDocument {
  nodes: readonly NodeData[];
  links: readonly LinkData[];
}

interface NodeData {
  id: string;
  type: string;
  title: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  ports?: readonly PortDefinition[]; // id, label?, direction 'input'|'output', dataType?, maxConnections?
  data?: Readonly<Record<string, unknown>>;
}

interface LinkData {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
  data?: Readonly<Record<string, unknown>>;
}
```

변경은 새로운 문서를 반환하며 입력을 절대 변경하지 않습니다:

- `createDocument(doc?)` / `cloneDocument(doc)` — 중첩된 `data`를 깊이 복제하므로, 히스토리 스냅샷이 그 자리에서 수정된 레코드의 별칭이 될 수 없습니다.
- `addLink(document, link)` — 먼저 검증하고(아래 참조) 그렇지 않으면 `Invalid link: <error>`를 던집니다.
- `removeLink(document, id)`.
- `removeNode(document, id)` — 노드**와 그것에 닿는 모든 링크**를 함께 제거하여(`0.2.0+`) 남은 문서가 참조적으로 유효하게 유지됩니다. `removeLink`와 같은 복사 시맨틱: 새 배열, 노드/링크 객체는 공유.

### `validateLink` — 링크 규칙 집합

모든 후보 링크는 문서의 나머지 부분과 대조하여 검사됩니다:

| 오류                                              | 조건                                        |
| ------------------------------------------------- | ------------------------------------------- |
| `missing-source-node`                             | 소스 id가 어떤 노드도 가리키지 않음         |
| `missing-target-node`                             | 타깃 id가 어떤 노드도 가리키지 않음         |
| `same-node`                                       | 자기 자신으로의 루프 — 거부됨               |
| `duplicate-link-id`                               | 해당 id를 가진 링크가 이미 존재             |
| `missing-source-port` / `missing-target-port`     | 지명된 포트가 그 엔드포인트에 존재하지 않음 |
| `source-port-direction` / `target-port-direction` | 출력 포트가 타깃으로 사용됨, 또는 그 반대   |
| `incompatible-types`                              | 두 포트가 선언한 `dataType`이 다름          |
| `duplicate-link`                                  | 같은 엔드포인트 사중항이 이미 연결됨        |
| `target-port-occupied`                            | 입력 포트의 `maxConnections`(기본 1)에 도달 |

순환 정책: 자기 루프는 거부됩니다; 여러 노드에 걸친 순환은 허용됩니다 — 그래프는 사용자가 작성한 흐름이며, `layoutDocument`는 강연결 성분을 함께 랭킹하여 순환을 허용합니다.

## 선택

`SelectionState`는 선택된 id를 추적합니다: `select(id, additive?)`, `has(id)`, `clear()`, 그리고 반복 안전 스냅샷을 위한 `list()`(`0.2.0+` — 이전의 `toggle()`은 제거되었습니다; 대신 `has()` + `select()`로 누적 선택을 만드세요). `selectedIds`는 여전히 `list()`의 살아있는 복사 별칭입니다.

## 히스토리

`CommandHistory`는 커맨드별로 전체 문서를 스냅샷합니다: `execute(label, after)`, `undo()`, `redo()`, 그리고 현재 상태를 위한 `currentDocument`(`0.2.0+`; 중복된 `.document` 게터는 제거되었습니다). 편집기가 만드는 모든 변경은 하나의 되돌릴 수 있는 커맨드이므로, 실행 취소/다시 실행이 제스처 한가운데 착지하는 일은 없습니다.

## `NodeEditor` — 엔터티

```ts
new NodeEditor(options?: { document?: NodeDocument; width?: number; height?: number })
```

편집기는 노드당 하나의 카드, 정의된 각 포트에 포트 핫스팟, 링크당 하나의 선을 투영합니다. `document`(방어적 클론), `selection`, `canUndo`/`canRedo`, 그리고 이러한 뮤테이터들을 노출합니다 — 각각 단일한 되돌릴 수 있는 커맨드입니다:

- `createLink(link)` / `deleteLink(id)`.
- `deleteNodes(ids)`(`0.2.0+`) — 주어진 노드와 모든 부수 링크를 하나의 `'Delete nodes'` 커맨드로 제거합니다. 먼저 진행 중인 연결이나 드래그를 종료하고 이후 선택을 지웁니다; 어느 노드에도 일치하지 않는 id는 무시되며, 아무것도 일치하지 않으면 히스토리 항목이 생기지 않습니다.
- `select(id, additive?)`.
- `applyAutoLayout(options?)` — `layoutDocument`를 실행하고 무언가를 바꿀 때 커밋합니다.
- `undo()` / `redo()` — 둘 다 먼저 진행 중인 드래그나 연결을 종료하므로, 드래그 중 Ctrl+Z가 드래그 중인 노드를 순간이동시키거나 가짜 항목을 커밋할 수 없습니다.

### 키보드 상호작용 (WCAG 2.1.1)

| 키                      | 동작                                            |
| ----------------------- | ----------------------------------------------- |
| `Delete` / `Backspace`  | `deleteNodes(selection.list())` (`0.2.0+`)      |
| `Escape`                | 무장된 연결이나 활성 드래그를 취소; 취소를 알림 |
| Ctrl/Cmd+`Z`, Shift+`Z` | 실행 취소 / 다시 실행                           |
| Ctrl/Cmd+`Y`            | 다시 실행                                       |

포트 자체도 키보드로 도달 가능합니다: 각 핫스팟은 포커스 가능한 `role="button"`으로 투영되며, 출력 포트를 활성화하면 대기 연결이 무장되고 입력 포트를 활성화하면 커밋됩니다. 진짜 키보드 합성(포커스된 핫스팟에서 Enter/Space)만이 이 제스처를 구동합니다 — 포트에 대한 단순 포인터 클릭은 유령 대기 연결을 남기지 않습니다.

### 상태 알림

대기 중인 키보드 연결에는 포인터가 없으므로 고무선도 없습니다. 그 전이들은 보이지 않는 집계 live region(`role="status"`, `aria-live="polite"`)을 통해 알려집니다: 무장("Linking from …"), 커밋된 링크("Link created."), Escape 취소. 포인터 제스처는 보이는 피드백을 유지하며 알려지지 않습니다.

### 좌표

드래그 델타, 연결 타기팅, 고무선 모두 편집기 자체의 문서 로컬 공간에서 작동하므로, 크기가 조정되거나 이동된 조상 아래에서도 올바르게 유지됩니다. 연결 드롭은 역 추가 순서로 해석되므로, 겹치는 카드는 아래 숨겨진 카드가 아니라 최상위(마지막으로 렌더링된) 카드의 포트로 배선됩니다.

## 영속화

```ts
import { NodeEditorPersistence, NODE_EDITOR_SCHEMA_VERSION } from '@vectojs/node-editor';

const persistence = new NodeEditorPersistence();
const json = persistence.exportDocument(editor.document); // schemaVersion-stamped
const doc = persistence.importDocument(json);
```

`exportDocument`/`importDocument`는 `NODE_EDITOR_SCHEMA_VERSION`(1)을 운반합니다; `serializeDocument`/`deserializeDocument`는 버전 없는 짝입니다. 임포트 검증은 구조적이**며** 의미적입니다(`0.2.0+`): 배열/문자열/유한 숫자 형태 검사를 넘어, 모든 링크가 문서의 나머지와 대조하여 런타임 `validateLink`를 통과합니다. 자기 루프, 중복 엔드포인트 쌍, 중복 링크 id, 포트 방향/타입/maxConnections 위반은 이제 `links[i]: <verdict.error>`로 거부됩니다 — 영속화된 문서는 편집기에서 재현됨이 보장됩니다. 이전에는 삭제 후 재현 불가능한 링크를 포함하는 문서가 있을 수 있었습니다.

## 자동 레이아웃

`layoutDocument(document, options?)`는 결정적인 소스→타깃 계층을 할당합니다: 노드는 id로 정렬되고, 강연결 성분은 함께 랭킹되며(Tarjan SCC, 그다음 성분 DAG 위의 최장 경로), 위치는 `originX + rank × horizontalGap`, `originY + index × verticalGap`(기본 `260`/`120`)에 놓입니다. 입력을 절대 변경하지 않습니다.

## 관련 항목

읽기 전용 그래프의 포스 기반 배치에는 [`@vectojs/graph-layout`](/reference/graph-layout/) ·
편집기가 기반을 둔 `Entity` 라이프사이클에는 [`@vectojs/core`](/reference/core-api/)。
