+++
title = "15 — 수직 앱 — 지식 그래프, 노드 편집기, 데스크톱 & 테이블"
description = "수직 패키지가 엔진 기본 요소를 어떻게 조합하는지 — graph3d/힘 레이아웃 위의 지식 그래프, 명령 기록/선택 상태/문서 레이아웃 위의 노드 편집기, 씬 오버레이 위의 데스크톱 창 관리, 텍스트 + 그리드 셀 핫스팟 가상화 위의 테이블 — 그리고 앱 함정이 엔진 결함과 어떻게 다른지."
weight = 35
+++

# 15 — 수직 앱 — 지식 그래프, 노드 편집기, 데스크톱 & 테이블

> 엔진 기본 요소는 고립 상태로는 정확하지만, 수직 앱은 페이지, 실행 취소, 윈도우, 10만 행 압력 아래에서 조합을 증명한다. 10행에서만 작동하는 테이블, 확장에서 순간이동하는 그래프, 오버레이 접근성 미러를 누수하는 창은 모두 앱 수준 조합 버그이지 물리나 렌더러 버그가 아니다 — 그리고 forge는 이들을 분리하는 이유를 유지한다.

- **배울 내용**: 네 수직 앱이 안정적인 기본 요소를 어떻게 조합하는지 — `GraphLayout`/`Graph3D` 위의 `KnowledgeGraphModel`, `CommandHistory`/`SelectionState`/`layoutDocument` 위의 `NodeEditor`, `Scene` 오버레이 위의 `DesktopShell`/`WindowManager`/`DesktopWindow`, `Text` + `GridCellHotspot` 가상화 위의 `Table` — 증분 성장을 저렴하게 하고 해체를 깔끔하게 하는 모든 파일 경계와 소유권 규칙 포함.
- **배우지 않을 내용**: `ForceLayout2D`/`VectoForceLayout` 내부 물리(boss 11), VMT 더티 라이프사이클(boss 06), 렌더러/DPR 계약(boss 07). 이 문서는 앱이 엔진을 _소비_하는 방식이지 엔진이 계산하는 방식을 보여주지 않는다.

## 1. 지식 그래프 — 3D 위의 페이지된 절단

### 1.1 데이터 계약

`KgEntity extends GraphNode`(`packages/knowledge-graph/src/types.ts:19`)와 `KgFact extends GraphLink`(`types.ts:31`)는 동일한 객체가 `@vectojs/graph3d` 레이아웃과 렌더러로 흐르며 도메인 필드(`type`, `labels: LabelMap`, `predicate`, `confidence`, `provenance`)는 그대로 유지된다. `KgDataSource`(`types.ts:54`)는 지연 경계다: `getNodes(ids?)`(시드용)와 `getNeighbors(id, { limit, cursor, direction, signal })`(`types.ts:58`) 페이지된 홉용. `KgNeighborhood`(`types.ts:68`)는 `facts`, `neighbors`, `nextCursor`/`hasMore`, 선택적 `entity`를 운반한다 — 부재는 "알 수 없는 id"를 의미하며, 만들어내지 않고 실패해야 한다(§1.3 참조).

`LabelMap`(`types.ts:12`)은 `Record<languageTag, string>`이며 `''`는 대체; `pickLabel`(`types.ts:87`)은 요청된 언어를 선호한 후 `''`, `en/zh/…`, 임의 키 순으로 선택한다. `KgGraphData`(`types.ts:43`)는 어댑터 구체화 후 메모리 내 스냅샷이다.

`MemoryDataSource`(`packages/knowledge-graph/src/MemoryDataSource.ts:15`)은 테스트/소규모 그래프 어댑터다: 양쪽 엔드포인트로 사실을 인덱싱(`out`/`inn` `MemoryDataSource.ts:17`)하여 `getNeighbors`가 `O(degree)`가 되도록 하고, `'both'`에서 자체 루프를 중복 제거(`MemoryDataSource.ts:71`)하며, 커서를 `"<version>:<offset>"`(`MemoryDataSource.ts:108`)로 버전화하여 `load()`(`MemoryDataSource.ts:26`)에서 `version`을 증가시키므로 진행 중인 커서가 변경된 목록을 잘라내는 대신 크게 실패한다(`MemoryDataSource.ts:125`).

`rdf.ts:11`는 `n3` `Parser`를 통한 `parseRdfTurtle(text)`를 제공한다: 주체는 엔티티가 되고, `rdf:type`은 `type`(`rdf.ts:51`에서 마지막이 승리), `rdfs:label`/`skos:prefLabel`/`schema:name`은 `labels`(`rdf.ts:56`), 다른 객체-IRI 삼중은 `KgFact`(`rdf.ts:62`), 모든 엔티티는 `''` 대체(`rdf.ts:74`)를 받는다. 동기 `Parser.parse` — 메인 스레드에서 수백 MB에는 적합하지 않음(`rdf.ts:24` 문서).

### 1.2 `FixedZLayout` — 분기 없는 2D 투영

`FixedZLayout`(`packages/knowledge-graph/src/FixedZLayout.ts:22`)는 `VectoForceLayout`을 감싸고 각 `step()`(`FixedZLayout.ts:49`)과 `setGraph`(`FixedZLayout.ts:37`) 후 모든 `z`를 상수로 고정한다. 내부 시뮬레이션은 여전히 3D Barnes-Hut 옥트리로 실행된다; `pinNode`는 `z ?? this.z`(`FixedZLayout.ts:56`)로 위임하며, `sanitize()`(`FixedZLayout.ts:85`)는 비유한 `x/y`를 `cbrt` 나선으로 재시드한다. 핀 계약은 `ForceLayout2D`(ID 주소 지정)와 발산한다: `FixedZLayout`는 `GraphLayout`(`GraphLayout.ts:46`)처럼 인덱스로 핀하며, `FixedZLayout.ts:18`에 명시되어 있다.

### 1.3 `KnowledgeGraphModel` — 단일 레이아웃 드라이버

`KnowledgeGraphModel`(`packages/knowledge-graph/src/KnowledgeGraphModel.ts:62`)는 렌더러 중립이며 페이지된 절단을 소유한다: `entities`/`facts`/`factKeys`/`expansions`/`requests`/`entityOrder`/`lastPositions`(`KnowledgeGraphModel.ts:69`). 대여된 `GraphLayout`(`KnowledgeGraphModel.ts:43` 문서: `rebuildGraph`당 `setGraph` 하나, `expand`당 `reheat` 하나)의 **단일 드라이버**다. 생성자는 `source`, 선택적 대여 `layout`, `pageSize`, `direction`, `lang`(`KnowledgeGraphModel.ts:39`)을 받는다.

- `bootstrap(focusIds, expandSeeds)`(`KnowledgeGraphModel.ts:114`)는 `getNodes`로 시드를 가져오고, `ingestEntities`, `rebuildGraph()`, 각 시드 `expand`를 수행한다.
- `expand(id)`(`KnowledgeGraphModel.ts:127`)는 ID당 약속 공유(`KnowledgeGraphModel.ts:134`), `complete`에서 단락(`KnowledgeGraphModel.ts:136`), `loading` 표시(`KnowledgeGraphModel.ts:144`), 이후 `loadPage`(`KnowledgeGraphModel.ts:240`).
- `loadPage`는 `source.getNeighbors`를 `AbortSignal`(`KnowledgeGraphModel.ts:246`)로 페이지하고, `page.entity`가 없으면 크게 실패(`KnowledgeGraphModel.ts:259` — 절대 `'Unknown'` 노드 플레이스홀더를 섭취하지 않음), 엔티티/사실을 섭취하고, `loaded`를 순 새가 아닌 **배치** `page.facts.length`로 진행(`KnowledgeGraphModel.ts:273`), `ExpansionState`(`KnowledgeGraphModel.ts:275`) 기록, `rebuildGraph()` + `layout?.reheat(0.5)`(`KnowledgeGraphModel.ts:285`).
- `cancelExpand`(`KnowledgeGraphModel.ts:150`)는 `AbortController`로 중단하고 `cancelled` 표시.
- `rebuildGraph()`(`KnowledgeGraphModel.ts:332`)는 레이아웃 위치를 캡처하고, 안정된 `entityOrder`로 병합하며, `lastPositions`에서 새 노드를 시드하고, `pickLabel`로 `GraphData`를 구축하고, `layout?.setGraph` 호출.
- `dispose()`(`KnowledgeGraphModel.ts:225`)는 의도적으로 대여된 레이아웃을 처리하지 않음 — 세션이 여전히 공유할 수 있음(`KnowledgeGraphModel.ts:230` 주석).

## 2. 노드 편집기 — 명령 및 선택

`NodeEditor`(`packages/node-editor/src/NodeEditor.ts:89`)는 `CommandHistory`(`packages/node-editor/src/command/CommandHistory.ts:34`)와 `SelectionState`(`packages/node-editor/src/state/SelectionState.ts:28`) 위에 구성된다. `layoutDocument()`(`NodeEditor.ts:156`)는 `Scene`의 엔티티 트리를 편집 가능한 노드 그래프(`GraphDocument` `packages/node-editor/src/types.ts:45`)로 변환하고, `applyCommand()`(`NodeEditor.ts:201`)는 명령(`AddNode`, `RemoveNode`, `MoveNode`, `Connect`)을 `CommandHistory`에 푸시한다.

`SelectionState`는 `selectedIds: Set<NodeId>`와 `focusedId: NodeId | null`을 유지하며, `updateSelection()`(`SelectionState.ts:78`)는 `focus`와 `multi-select`(`ctrl`/`shift`)를 처리한다. `NodeEditor`는 `resize()` 후 `layoutDocument()`를 다시 호출하지 않으므로(`NodeEditor.ts:178` 주석 — `resize`는 `Scene.resize()`를 호출하지만 편집기 레이아웃은 수동으로 다시 계산해야 함), 편집기가 잘못된 뷰포트로 작동하지 않도록 `resize()` 후 `layoutDocument()`를 호출해야 한다.

## 3. 데스크톱 — 윈도우 관리와 오버레이

`DesktopShell`(`packages/desktop/src/DesktopShell.ts:56`)는 `WindowManager`(`DesktopWindow.ts:89`)와 `DesktopWindow`(`DesktopWindow.ts:45`)를 관리한다. 각 `DesktopWindow`는 `Scene` 오버레이(`overlayRoot`)에 장착되며(`DesktopWindow.ts:112` `mount()`), `WindowManager`는 `focus()`(`WindowManager.ts:167`)와 `close()`(`WindowManager.ts:203`)를 처리한다.

`DesktopWindow.dispose()`(`DesktopWindow.ts:234`)는 오버레이를 `overlayRoot`에서 제거하고 `Scene.destroy()`를 호출하지 않음 — `DesktopShell`이 `Scene`을 소유하므로, 창만 해체해야 한다. `WindowManager.dispose()`(`WindowManager.ts:245`)는 모든 창을 닫고 `DesktopShell.dispose()`를 호출하며, 이는 `Scene.destroy()`를 호출한다.

`DesktopWindow`는 `resize()` 후 `reposition()`(`DesktopWindow.ts:178`)을 호출하지 않으면 잘못된 위치에 나타난다 — `DesktopShell`이 `resize()`를 처리하지만, 창의 `reposition()`은 수동으로 호출되어야 한다(`DesktopShell.ts:145` 주석).

## 4. 테이블 — 가상화와 핫스팟

`Table`(`packages/ui/src/components/Table.ts:89`)는 `GridCellHotspot`(`Table.ts:112` `gridCell`)와 `VirtualList`(`Table.ts:134` `virtualList`)를 조합한다. `GridCellHotspot`은 `entity.getBounds()`를 기반으로 셀의 히트 영역을 계산하며(`Table.ts:156` `updateHotspots`), `VirtualList`는 `scrollTop`과 `rowHeight`를 기반으로 윈도우를 계산한다.

`Table`은 `resize()` 후 `updateViewport()`(`Table.ts:178`)를 호출하지 않으면 윈도우가 잘못된 뷰포트로 작동한다 — `VirtualList`와 동일한 함정이다. `GridCellHotspot`은 `resize()` 후 `updateHotspots()`를 호출해야 하며(`Table.ts:201` `resize()`에서 호출됨), 그렇지 않으면 히트 테스트가 이전 크기의 셀로 작동한다.
