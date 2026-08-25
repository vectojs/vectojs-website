+++
title = "@vectojs/knowledge-graph/model"
description = "렌더러 중립적이고 페이지네이션된 지식 그래프 구체화 — 취소, 중복 제거, 스냅샷, 선택적 레이아웃 웜 스타트 포함."
weight = 46
+++

# `@vectojs/knowledge-graph/model`

문서 버전: **0.4.0**

`KnowledgeGraphModel`은 더 큰 지식 그래프의 유계 있고 구체화된 컷을 소유합니다. `KgDataSource`에서 시드 엔티티와 이웃 페이지를 로드하고, 엔티티와 팩트를 중복 제거하고, 노드별 확장 진행을 추적하며, 렌더러에 안정적인 `GraphData`를 노출합니다. DOM, 캔버스, Three.js 씬 또는 애니메이션 타이머를 만들지 않습니다.

호스트가 데이터와 모델 상태만 필요할 때는 렌더러 중립 엔트리 포인트를 임포트하세요:

```ts
import {
  KnowledgeGraphModel,
  MemoryDataSource,
  type KgDataSource,
} from '@vectojs/knowledge-graph/model';
```

패키지 루트도 모델을 내보내지만, 패키지의 세션 및 렌더링 관련 표면을 포함합니다. `/model` 서브경로는 명시적인 헤드리스 경계입니다.

## 데이터 소스 계약

```ts
type NodeId = string | number;

interface KgNeighborOptions {
  limit?: number;
  cursor?: string;
  direction?: 'out' | 'in' | 'both';
  signal?: AbortSignal;
}

interface KgNeighborhood {
  entity?: KgEntity;
  facts: readonly KgFact[];
  neighbors: readonly KgEntity[];
  total?: number;
  nextCursor?: string;
  hasMore?: boolean;
}

interface KgDataSource {
  getNodes(ids?: readonly NodeId[]): readonly KgEntity[] | Promise<readonly KgEntity[]>;
  getNeighbors(id: NodeId, options?: KgNeighborOptions): KgNeighborhood | Promise<KgNeighborhood>;
}
```

`cursor`는 불투명하게 취급하세요. 소스는 `limit`를 적용하고, `direction`을 준수하고, 제공된 중단 신호를 다운스트림 작업에 전달하고, 다른 페이지가 존재할 때 `nextCursor`와 `hasMore`를 반환해야 합니다. `total`은 선택적이며, 현재 페이지만이 아니라 해당 노드 확장에 사용 가능한 총 팩트 수를 설명합니다. `direction: "both"`인 경우, 소스와 대상이 같은 노드인 팩트는 페이지당 한 번만 나열되고 두 번 나열되지 않습니다.

`entity`는 선택적입니다: 요청된 id를 모르는 소스는 이를 포함하지 않는 이웃을 반환하며, 모델은 위조된 플레이스홀더 노드를 영구히 섭취하는 대신 해당 확장을 목표 지정된 오류로 실패시킵니다.

`MemoryDataSource`는 테스트와 소규모 인메모리 그래프를 위해 이 계약을 구현합니다. 커서는 버전 스탬프가 찍힌 오프셋(`<version>:<offset>`)이므로, 페이지네이션 도중에 `load()`를 호출하면 미처리 커서가 명확하게 무효화됩니다 — 다른 팩트 목록을 조용히 잘라내는 것이 아니라 오류를 발생시킵니다. 이웃 조회는 `O(degree)`이며, 유효하지 않은 커서는 오류를 발생시킵니다.

## 모델 생성과 확장

```ts
const source = new MemoryDataSource({ entities, facts });
const model = new KnowledgeGraphModel({
  source,
  pageSize: 100,
  direction: 'both',
  lang: 'en',
});

await model.bootstrap(['vectojs'], false);

let result = await model.expand('vectojs');
while (result.state.status === 'partial') {
  result = await model.expand('vectojs');
}

draw(model.getGraphData());
```

`bootstrap(focusIds, expandSeeds = true)`는 먼저 포커스 엔티티를 해석합니다. 기본 두 번째 인수를 사용하면 각 시드를 한 페이지씩 직렬로 확장합니다. 호스트가 페이징을 명시적으로 제어하려면 `false`를 전달하세요.

각 `expand(id)`는 정확히 다음 페이지만 로드합니다. 동일한 ID에 대한 동시 호출은 하나의 promise를 공유하는 반면, 다른 ID는 독립적으로 로드할 수 있습니다. 완료된 확장은 추가 소스 호출 없이 즉시 해석됩니다. 엔티티는 ID로 중복 제거되고 라벨 맵을 포함하여 병합됩니다. 팩트는 정렬된 `(source, predicate, target)` 삼중항으로 중복 제거됩니다.

## 확장 상태

```ts
type ExpansionStatus = 'idle' | 'loading' | 'partial' | 'complete' | 'failed' | 'cancelled';

interface ExpansionState {
  status: ExpansionStatus;
  loaded: number;
  total?: number;
  cursor?: string;
  hasMore?: boolean;
  error?: unknown;
}
```

`getExpansionState(id)`로 방어적 복사본을 읽으세요. `loaded`는 배치별로 전달된 모든 팩트를 계산하므로, 이웃이 페이지 간에 겹쳐도 페이지네이션 진행이 멈추지 않습니다. `partial`은 다른 페이지가 사용 가능함을 의미합니다; `expand(id)`를 호출하면 저장된 커서에서 재개합니다.

`cancelExpand(id)`는 활성 요청을 중단하고 `cancelled`로 표시합니다. 데이터 소스는 취소가 기반 I/O를 중지하도록 `options.signal`을 준수해야 합니다. 이후의 `expand(id)`는 마지막으로 완료된 커서에서 재개합니다. 소스 실패는 상태를 `failed`로 표시하고, 이전 진행을 보존하며, promise를 거부합니다; 이후 호출은 동일한 커서에서 재시도합니다.

## 상태 읽기와 저장

```ts
model.entityCount;
model.factCount;
model.listEntities();
model.listFacts();
model.getGraphData();

const snapshot = model.exportSnapshot();
model.importSnapshot(snapshot);
```

`listEntities()`와 `listFacts()`는 애플리케이션 검사에 적합한 복사본을 반환합니다. `getGraphData()`는 모델의 현재 렌더러 입력을 안정적인 엔티티 순서로 반환합니다. 해당 그래프를 읽기 전용으로 취급하세요; 구체화된 컷이 변경되면 교체됩니다.

스냅샷은 버전이 지정됩니다. 버전 1은 엔티티, 팩트, 재개 가능한 확장 메타데이터를 저장하지만, 진행 중인 요청이나 오류 객체는 저장하지 않습니다. 스냅샷을 임포트하면 현재 요청을 중단하고 그 최종 완료를 무시합니다. 지원되지 않는 스냅샷 버전은 교체 전에 오류를 발생시킵니다.

## 선택적 레이아웃 통합

`KnowledgeGraphModelOptions.layout`는 `@vectojs/graph3d`의 XYZ `GraphLayout` 계약을 받습니다. 모델이 유일한 레이아웃 구동자입니다: 각 구체화 재구축은 `layout.setGraph()`를 한 번 호출하고, 노드 ID별 유한 XYZ 위치를 웜 스타트로 보존하며, 레이아웃이 `reheat()`를 노출할 때 로드된 페이지 후에 재가열합니다. 웜 스타트 위치는 레이아웃이 안정될 때(그리고 재구축 시점에) 캡처되며, 매 활성 프레임마다가 아닙니다.

최신 레이아웃 좌표 유지가 필요한 외부 작업 전에 `captureLayoutPositions()`를 호출하세요. 이 선택적 계약은 3차원입니다: `@vectojs/graph-layout`의 XY `ForceLayout2D`를 직접 전달하지 마세요. 2D 렌더러는 `layout`을 생략하고 `getGraphData()`에 대해 자체 렌더러 중립 레이아웃을 실행할 수 있습니다. 이 계약은 노드 **인덱스**로 고정하는 반면 2D `ForceLayout2D`는 노드 ID로 고정합니다 — 스택을 넘어갈 때는 고정 방식을 변환하세요.

## 폐기

`dispose()`는 활성 요청을 중단하고 구체화된 상태를 해제합니다. 멱등적입니다. 라이브 모델이 필요한 메서드는 이후 `KnowledgeGraphModel is disposed`를 던집니다; 늦은 비동기 완료는 폐기되거나 스냅샷으로 교체된 상태를 다시 채울 수 없습니다. 소유권은 생성자에게 있습니다: 모델은 선택적 레이아웃을 빌려만 쓰므로, 모델을 폐기해도 라이브 세션과 여전히 공유되는 레이아웃은 죽지 않습니다 — 레이아웃을 만든 자가 그것을 폐기합니다.

## 세션 계층 보증

패키지 루트는 모델에서 렌더러를 구동하는 `KnowledgeGraphSession`도 내보냅니다. 그 동작 계약은 모델의 것과 맞춰 유지됩니다:

- **진행 중인 id당 하나의 확장.** 확장 페치가 아직 진행 중인 노드에 대한 반복 선택은 in-flight 게이트에 흡수되어, 하나의 네트워크 페치에 대해 클릭마다 `onExpand`/`onError`를 발생시키지 않습니다.
- **오류는 관찰 가능합니다.** 선택으로 촉발된 확장 실패는 `onError(error, entity)` 옵션(`console.error` 폴백 포함)으로 라우팅되며 처리되지 않은 거부로 탈출하지 않습니다; 세션이 폐기되면 비동기 연속은 중단됩니다.
- **알 수 없는 id는 명확하게 실패합니다.** 어떤 소스도 모르는 id를 확장하면 유령 엔티티를 구체화하는 대신 목표 지정된 오류로 실패합니다.

## 복잡도

`N`개의 엔티티와 `E`개의 고유 팩트가 있는 구체화된 컷의 경우, 모델 스토리지는 `O(N + E)`입니다. 페이지 수집은 반환된 `P`개 레코드에 대해 기대 `O(P)`이고, 그런 다음 렌더러 데이터 재구축은 `O(N + E)`에 제공된 레이아웃의 `setGraph()` 비용을 더한 것입니다. 스냅샷 내보내기와 임포트는 `O(N + E)`입니다. 모델은 의도적으로 로드된 페이지만 구체화합니다; 총 소스 그래프 크기가 상주 메모리를 결정하지 않습니다.

## 관련 항목

[`@vectojs/graph-layout`](/reference/graph-layout/) — 렌더러 독립 2D 물리용 · [`GraphLayout`과 3D 레이아웃 구현체](/reference/graph3d-layout/) — 선택적 XYZ 레이아웃 계약용 · [`@vectojs/graph3d`](/reference/graph3d/) — 3D 렌더링용
