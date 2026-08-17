+++
title = "@vectojs/graph-layout"
description = "렌더러 독립적이고 의존성 없는 2D 힘 레이아웃 — Barnes-Hut 반발, 증분 토폴로지 업데이트, 충돌 처리, 런타임 고정 포함."
weight = 47
+++

# `@vectojs/graph-layout`

문서 버전: **0.2.1**

`@vectojs/graph-layout`는 의존성 없는 2D 힘 시뮬레이션입니다. 렌더러나 애니메이션 타이머를 소유하지 않습니다: 호스트가 그래프 데이터를 제공하고, `step()`을 호출하고, `Float32Array`에서 인터리브된 XY 좌표를 읽습니다. 동일한 레이아웃이 Canvas 2D, SVG, WebGL, WebGPU, VectoJS 씬 또는 메인 스레드 밖 렌더러를 구동할 수 있습니다.

버전 0.2.1에는 하나의 구현체, TypeScript `ForceLayout2D`가 있습니다. 0.2.1에는 WASM 빌드, 대체 백엔드, 또는 `backend` 옵션이 없습니다. WASM은 측정으로 검증된 미래 옵션으로 남아 있습니다; 현재의 교차 차원 브라우저 비교는 WASM 백엔드가 도움이 될 것이라는 직접적인 증거가 아닙니다.

## 설치

```bash
bun add @vectojs/graph-layout
```

패키지는 런타임 또는 렌더러 피어 의존성이 없습니다.

## Canvas 2D 예제

이 예제는 임의의 문자열 ID를 사용하고 레이아웃을 통해 현재 위치 인덱스를 해석합니다. 숫자 ID도 식별자입니다; 숫자 ID가 현재 노드 인덱스와 같다고 가정하지 마세요.

```ts
import { ForceLayout2D, type GraphData } from '@vectojs/graph-layout';

const canvas = document.querySelector('canvas');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Canvas not found');

const context = canvas.getContext('2d');
if (!context) throw new Error('Canvas 2D is unavailable');

const graph: GraphData = {
  nodes: [{ id: 'center', fx: 0, fy: 0 }, { id: 'left' }, { id: 'right' }],
  links: [
    { source: 'center', target: 'left' },
    { source: 'center', target: 'right' },
  ],
};

const layout = new ForceLayout2D({
  collisionRadius: 8,
  linkDistance: 48,
});
layout.setGraph(graph);

function draw(): void {
  const active = layout.step();
  const positions = layout.positions;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);

  context.beginPath();
  for (const link of graph.links) {
    const sourceIndex = layout.getNodeIndex(link.source);
    const targetIndex = layout.getNodeIndex(link.target);
    if (sourceIndex === undefined || targetIndex === undefined) continue;
    const source = sourceIndex * 2;
    const target = targetIndex * 2;
    context.moveTo(positions[source], positions[source + 1]);
    context.lineTo(positions[target], positions[target + 1]);
  }
  context.stroke();

  for (let index = 0; index < layout.nodeCount; index++) {
    context.beginPath();
    context.arc(positions[index * 2], positions[index * 2 + 1], 5, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();

  if (active) requestAnimationFrame(draw);
}

draw();
```

`step()`은 동기식입니다. 시뮬레이션이 활성 상태를 유지하는 동안 `true`를 반환하고, `alphaMin` 아래로 식은 후(또는 그래프가 비어 있을 때) `false`를 반환합니다. 반환 값은 물리가 다른 틱이 필요한지 여부를 나타냅니다; 카메라 이동, 입력 또는 기타 애니메이션을 위해 애플리케이션이 렌더링을 계속해야 하는지에 대해서는 아무것도 말하지 않습니다. `alphaDecay: 0`은 냉각을 비활성화하므로, 비어 있지 않은 시뮬레이션은 스스로 안정화되지 않습니다.

## 공개 유형

패키지는 루트에서 다음 유형과 `ForceLayout2D`를 내보냅니다:

```ts
type NodeId = string | number;
type LinkId = NodeId;

interface GraphNode {
  id: NodeId;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
  [key: string]: unknown;
}

interface GraphLink {
  source: NodeId;
  target: NodeId;
  id?: NodeId;
  [key: string]: unknown;
}

interface GraphData {
  nodes: readonly GraphNode[];
  links: readonly GraphLink[];
}

type NodeValue = number | ((node: GraphNode, index: number) => number);
type LinkValue = number | ((link: GraphLink, index: number) => number);

interface ForceLayout2DOptions {
  repulsion?: NodeValue;
  collisionRadius?: NodeValue;
  collisionStrength?: number;
  linkDistance?: LinkValue;
  linkStrength?: LinkValue;
  centerStrength?: number;
  velocityDecay?: number;
  theta?: number;
  repulsionDistanceMax?: number;
  alphaDecay?: number;
  alphaMin?: number;
  seed?: number;
}
```

추가 노드 및 링크 필드는 애플리케이션 소유로 유지됩니다. 레이아웃은 입력 레코드를 변경하지 않습니다.

## 옵션

| 옵션                   |     기본값 | 의미                                                                                                       |
| ---------------------- | ---------: | ---------------------------------------------------------------------------------------------------------- |
| `repulsion`            |      `300` | 노드당 음이 아닌 다체 반발 크기.                                                                           |
| `collisionRadius`      |        `0` | 노드당 음이 아닌 반경. 반경이 0인 두 노드는 분리되지 않습니다.                                             |
| `collisionStrength`    |        `1` | 음이 아닌 충돌 보정 배율. 0은 충돌 보정을 비활성화합니다.                                                  |
| `linkDistance`         |       `30` | 링크당 음이 아닌 정지 길이.                                                                                |
| `linkStrength`         |      `0.3` | 링크당 음이 아닌 스프링 강성.                                                                              |
| `centerStrength`       |     `0.02` | 원점을 향한 음이 아닌 당김.                                                                                |
| `velocityDecay`        |      `0.6` | 틱당 속도 유지율, `1` 미만으로 클램프됨.                                                                   |
| `theta`                |      `0.9` | 음이 아닌 Barnes-Hut 열림 각도. 낮은 값은 정확도를 위해 속도를 희생합니다; `0`은 정확한 순회를 수행합니다. |
| `repulsionDistanceMax` | `Infinity` | 노드가 반발하는 최대 거리. `0`은 반발을 비활성화합니다; 비유한 값은 컷오프를 비활성화합니다.               |
| `alphaDecay`           |   `0.0228` | 틱당 온도 감쇠, `[0, 1]`로 클램프됨.                                                                       |
| `alphaMin`             |    `0.001` | 시뮬레이션이 안정화된 것으로 간주되는 음이 아닌 온도.                                                      |
| `seed`                 |        `1` | 유한한 초기 좌표가 없는 노드를 위한 결정적 시드.                                                           |

비유한 옵션 값은 기본값으로 대체됩니다. 음이 아닌 것으로 문서화된 값은 0에서 클램프됩니다. 노드와 링크 접근자는 각 레코드가 레이아웃에 수용될 때 한 번 평가되며, 매 틱마다 평가되지 않습니다. 노드 접근자 인덱스는 삽입 인덱스입니다. 링크 접근자 인덱스는 추가 전용 페이징에 걸쳐 안정적이고 연속적인 인덱스입니다. 노드를 제거하면 링크가 압축되므로, 이후의 추가가 이전에 제거된 링크에 할당된 인덱스를 재사용할 수 있습니다. 노드 제거는 생존자에 대한 접근자를 재평가하지 않습니다; 값을 다시 파생해야 한다면 새 `setGraph()`를 사용하세요. 모든 옵션은 생성자 전용입니다; 0.2.1에는 실시간 힘 설정자가 없습니다.

## API

```ts
class ForceLayout2D {
  constructor(options?: ForceLayout2DOptions);

  positions: Float32Array;
  nodeCount: number;

  getNodeIndex(id: NodeId): number | undefined;
  getNodeId(index: number): NodeId | undefined;
  getNodeIds(): readonly NodeId[];
  setGraph(data: GraphData): void;
  appendGraph(data: GraphData): void;
  removeNodes(ids: Iterable<NodeId>): void;
  removeLinks(items: Iterable<GraphLink | LinkId>): void;
  updateLinks(links: readonly GraphLink[]): void;
  step(iterations?: number): boolean;
  setNodePin(nodeIndex: number, pin: { x?: number; y?: number }): void;
  clearNodePin(nodeIndex: number, axes?: { x?: boolean; y?: boolean }): void;
  pinNode(nodeIndex: number, x: number, y: number): void;
  unpinNode(nodeIndex: number): void;
  reheat(alpha?: number): void;
  dispose(): void;
}
```

### 위치와 스테핑

`positions`는 현재 노드 순서로 `[x0, y0, x1, y1, ...]`을 포함합니다. 이것은 라이브 뷰입니다: 레이아웃이 `step()` 호출에 걸쳐 값을 제자리에서 업데이트합니다. 불변 스냅샷이 필요하면 `layout.positions.slice()`를 호출하세요.

뷰 객체는 토폴로지 경계에서 안정적이지 않습니다. `setGraph()`, `appendGraph()`, 또는 `removeNodes()` 후에는 항상 `layout.positions`를 다시 획득하세요; 내부 용량을 초과하여 추가하면 백업 스토리지도 재할당됩니다. 제거 후 노드 인덱스가 변경될 수 있습니다 — 생존자는 상대 순서를 유지하면서 압축되기 때문입니다.

`getNodeIndex(id)`로 ID를 현재 인덱스로 해석하고, 역방향 조회는 `getNodeId(index)`를 사용하세요. 현재 노드가 일치하지 않으면 둘 다 `undefined`를 반환합니다. `getNodeIds()`는 현재 위치 순서의 스냅샷을 반환합니다; 해당 배열을 변경해도 레이아웃에는 영향을 주지 않습니다. 기존 인덱스는 추가 전용 업데이트에 걸쳐 안정적으로 유지되는 반면, 제거는 생존자를 압축합니다.

`step(iterations = 1)`은 최대 그만큼의 동기식 틱을 수행하고, 이후에도 alpha가 적어도 `alphaMin`이면 `true`를 반환합니다. 냉각 시 일찍 중지합니다. 양수가 아니거나 비유한 반복 횟수는 틱을 수행하지 않고 현재 활성 상태를 보고합니다; 횟수는 내림되고 호출당 10,000으로 제한됩니다.

### 노드 교체, 추가 및 제거

`setGraph(data)`는 모든 상태를 교체하고, 새 그래프를 결정적으로 시드하며, alpha를 `1`로 설정합니다. 모든 노드 ID는 문자열 또는 유한 숫자여야 하며 고유해야 합니다; 유효하지 않거나 중복된 ID는 기존 그래프가 지워지기 전에 오류를 발생시킵니다.

`appendGraph(data)`는 기존 위치, 속도, 핀을 보존합니다. ID가 유효하지 않거나, 이미 존재하거나, 해당 추가에서 반복되는 노드는 무시되므로, 재생된 페이지가 멱등적입니다. 수용된 노드는 입력 순서로 추가됩니다. 수용된 링크는 기존 노드나 동일한 호출에서 수용된 노드를 대상으로 할 수 있습니다. 토폴로지 변경은 단조롭게 재가열합니다: alpha를 올릴 수 있지만 이미 뜨거운 시뮬레이션을 낮추지는 않습니다.

링크는 방향성 있는 엔드포인트 쌍과 선택적 `id`로 재생 안전합니다:

- `id`가 없으면, 반복되는 `source`→`target` 링크는 하나의 링크입니다.
- 방향이 중요합니다: `a`→`b`와 `b`→`a`는 서로 다른 정체성을 가집니다.
- 병렬 링크는 서로 다른 문자열 또는 유한 숫자 ID가 필요합니다.
- 식별된 링크를 재생하는 것은 무시됩니다.
- 알 수 없는 엔드포인트나 동일한 source와 target을 가진 링크는 무시됩니다.
- 잘못된 형식의 선택적 링크 ID는 정체성 목적상 없는 것으로 취급됩니다.

잘못된 형식의 선택적 ID를 가진 링크도 엔드포인트가 유효하면 미식별 링크로 진입합니다; 알 수 없는 엔드포인트와 자기 링크는 힘 배열에 진입하지 않습니다. 잘못된 형식의 링크 데이터가 positions를 비유한 값으로 만들지는 않습니다.

`removeNodes(ids)`는 일치하는 노드와 모든 부수 링크를 제거하고, 생존자 상태를 압축하고, 차수 편향을 재계산하며, 무언가 제거되었을 때 재가열합니다. 알 수 없는 ID와 빈 iterable은 no-op입니다.

### 링크 제거 및 업데이트

`removeLinks(items)`는 노드 인덱스, 위치, 속도 또는 핀을 변경하지 않고 링크를 제거합니다. 방향성 엔드포인트와 선택적 ID를 일치시키려면 전체 링크를 전달하고, 해당 ID를 가진 모든 식별된 링크를 제거하려면 베어 `LinkId`를 전달하세요. 생존 링크는 순서와 캐시된 접근자 값을 유지합니다. 알 수 없거나 이미 제거된 정체성은 no-op입니다. 성공적인 배치는 링크 차수 편향을 재계산하고 한 번 재가열합니다.

`updateLinks(links)`는 일치하는 기존 정체성에 대해 `linkDistance`와 `linkStrength` 접근자를 재평가합니다. 해당 접근자가 소비하는 애플리케이션 소유 링크 필드를 변경한 후 사용하세요. 전체 배치가 먼저 검증됩니다: 알 수 없거나 동일한 엔드포인트는 업데이트를 적용하지 않고 오류를 발생시킵니다. 아직 존재하지 않는 정체성은 무시됩니다. 엔드포인트가 링크 정체성에 참여하므로, 경로 재지정은 `removeLinks()` 후 `appendGraph()`가 필요합니다. 변경되지 않은 값은 시뮬레이션을 재가열하지 않습니다.

### 고정과 재가열

유한한 초기 `fx`와 `fy` 값은 축을 독립적으로 고정합니다. 따라서 노드는 고정된 X와 자유로운 Y, 고정된 Y와 자유로운 X, 또는 두 축 모두 고정될 수 있습니다. 초기 `x`와 `y`는 해당하는 비고정 축만 시드합니다.

런타임에 `setNodePin(index, { x?, y? })`은 제공된 축만 고정하고, 해당 라이브 좌표를 즉시 업데이트하며, 속도를 지웁니다. `clearNodePin(index, { x?, y? })`은 다른 축을 보존하면서 선택된 축을 해제합니다; axes 객체를 생략하면 둘 다 해제합니다. `pinNode(index, x, y)`와 `unpinNode(index)`는 두 축 모두를 다루는 편의 메서드로 남습니다. 유효하지 않은 인덱스는 무시됩니다. 이 호출들은 자동으로 재가열하지 않으므로, 대화형 핀 또는 언핀 작업 후 `reheat()`를 호출하세요.

`reheat(alpha = 0.3)`은 요청을 `[alphaMin, 1]`로 클램프하고 `max(currentAlpha, requestedAlpha)`를 적용합니다. 더 뜨거운 시뮬레이션을 식히지 않습니다.

### 노드 드래그: 이동마다가 아니라 한 번만 재가열

가장 흔한 드래그 관련 결함은 고정된 노드를 드래그하는 동안 **모든 포인터 이동**에서 `reheat()`를 호출하는 것입니다. 이렇게 하면 alpha가 최대 근처에 고정되어, 링크 스프링에 끌려오는 드래그된 노드의 이웃들이 감쇠가 거의 없는 상태로 계속 오버슈팅합니다. 그런 다음 시뮬레이션은 포인터가 해제된 후 식는 데 몇 초가 필요하며(alpha는 틱당 ~`alphaDecay`로 감쇠, 60fps에서 대략 300틱 ≈ 5초), 그 동안 전체 이웃이 눈에 띄게 진동합니다. 각 노드에 텍스트 레이블이 렌더링되어 있으면, 그 빠른 진동은 지터와 잔상/고스팅으로 읽힙니다.

올바른 패턴은 드래그가 _시작될 때_만 재가열하고, 이후 각 이동에서 재가열 없이 핀 위치를 업데이트하는 것입니다:

```ts
function onDragStart(node, x, y) {
  const index = layout.getNodeIndex(node.id);
  layout.setNodePin(index, { x, y }); // pin at the pointer
  layout.reheat(0.3); // wake the simulation ONCE
}

function onDragMove(node, x, y) {
  const index = layout.getNodeIndex(node.id);
  layout.setNodePin(index, { x, y }); // move the pin — no reheat here
}

function onDragEnd(node) {
  const index = layout.getNodeIndex(node.id);
  layout.clearNodePin(index); // or keep it pinned for a permanent pin
}
```

드래그 _중에_ 천천히 표류하는 추종이 바람직하게 느껴지면, 이동마다 재가열하는 대신 `velocityDecay`(더 많은 감쇠)를 높이세요; `reheat()`는 토폴로지 변경, 명시적 깨움, 드래그 시작을 위해 남겨두세요.

### 폐기

`dispose()`는 그래프와 쿼드트리 스토리지를 해제하고, `positions`를 빈 배열로 재설정하며, 멱등적입니다. 폐기 후에는 다른 모든 메서드가 `ForceLayout2D was disposed`를 던집니다; 기존 인스턴스를 재사용하려고 하기보다 새 인스턴스를 만드세요.

## 복잡도와 용량

`N`개의 노드와 `E`개의 수용된 링크에 대해, 일반적인 틱은 Barnes-Hut 쿼드트리를 구축하고 기대 `O(N log N)`으로 반발을 평가하며, 스프링을 `O(E)`로 적용하고, `O(N)`으로 정리·중심화·적분합니다. 따라서 충돌이 없을 때의 일반적인 틱 비용은 `O(N log N + E)`입니다. 이것은 최악의 경우를 보장하지 않습니다: 병리적인 공간 분포나 `theta: 0`은 전체 쌍 작업에 근접할 수 있습니다.

충돌이 활성화되면, 레이아웃은 예측된 위치에 대해 쿼드트리를 두 번째로 구축하고 반경 이웃 쿼리를 수행합니다. 희소하고 국소적으로 유계인 이웃은 일반적으로 `O(N log N + K)`에 가깝습니다 — 여기서 `K`는 후보/겹침 작업입니다 — 하지만 밀집 클러스터나 매우 큰 반경은 `K`를 2차로 만들 수 있습니다. 충돌은 Barnes-Hut 반발로부터 무조건적인 `O(N log N)` 한계를 상속받지 않습니다.

`setGraph()`는 기하학적 용량 할당과 초기화를 제외하면 `O(N + E)`입니다. `appendGraph()`는 추가된 입력에 비례하며, 링크가 수용될 때 `O(N + E)` 차수 편향 재계산이 더해집니다. `removeLinks()`는 링크 스토리지만 압축하며, 요청이 전체 링크이면 `O(E + R)`, `R`개의 베어 ID가 각각 모든 링크를 스캔하는 최악의 경우 `O(E + RE)`입니다. `updateLinks()`는 `U`개의 업데이트에 대해 `O(E + U)`입니다. 스토리지는 기하급수적으로 증가하므로, 대부분의 작은 추가는 용량을 재사용합니다; 성장 경계에서는 기존 typed array를 `O(N + E)` 시간에 복사합니다. `removeNodes()`는 노드와 링크를 압축하고 `O(N + E)`로 편향을 재계산합니다. 제거는 용량을 축소하지 않습니다.

## 측정된 브라우저 증거

차수 편향 이후의 한 번의 헤디드 브라우저 진단 실행은 행당 10개의 틱 샘플에 걸쳐 다음과 같은 p95 메인 스레드 틱 시간을 측정했습니다:

| 3,000-노드 워크로드 | Chrome 151 | Firefox 153 |
| ------------------- | ---------: | ----------: |
| 스타/허브           |   10.60 ms |     7.84 ms |
| 혼합 희소           |    8.09 ms |     7.28 ms |

50-노드 페이지 추가는 네 개의 브라우저/워크로드 행에 걸쳐 **0.145-0.355 ms**로 측정되었습니다. 각 추가 행은 하나의 토폴로지 변경 샘플을 가졌으므로, 이 범위는 꼬리 지연 추정치가 아니라 진단 증거입니다. 이 측정은 작업 실행기의 하드웨어 및 소프트웨어 환경에서의 한 번의 헤디드 실행에서 나온 것으로, 이식 가능한 보장이 아닙니다. 브라우저 스케줄링, 하드웨어, 전원 상태, 백그라운드 부하, 그래프 지오메트리, 옵션, 워밍업, 샘플 구성이 결과에 영향을 줍니다. 이것은 연산별 지연 증거이지 FPS 측정이 아닙니다; 여기서 FPS 주장을 도출할 수 없습니다.

## `d3-force`에서 마이그레이션

개념적 매핑은 직접적이지만 API는 의도적으로 더 작습니다:

| `d3-force`                                       | `@vectojs/graph-layout`                                  |
| ------------------------------------------------ | -------------------------------------------------------- |
| `simulation.nodes(nodes)` and `forceLink(links)` | `layout.setGraph({ nodes, links })`                      |
| `simulation.tick(k)`                             | `layout.step(k)`                                         |
| 변경된 노드 `x`/`y` 필드                         | 인터리브된 `layout.positions` XY 뷰                      |
| `simulation.alpha(value).restart()`              | `layout.reheat(value)` 및 호스트가 스케줄링한 프레임     |
| `node.fx` / `node.fy` 변경                       | 초기 `fx`/`fy`, 그다음 `setNodePin()` / `clearNodePin()` |
| d3의 내부 타이머                                 | 타이머 없음; 호스트가 스케줄링을 소유                    |

링크는 d3가 변경한 엔드포인트 객체가 아니라 엔드포인트 ID를 사용합니다. 옵션 접근자는 원래 `GraphNode` 또는 `GraphLink`와 삽입 인덱스를 받은 후 캐시됩니다. 0.2.1에는 커스텀 힘 레지스트리가 없습니다; d3 레이아웃이 커스텀 힘이나 실시간 힘 설정자에 의존한다면, d3-force를 유지하거나 새 옵션으로 레이아웃을 다시 만드세요.

## 2D vs `@vectojs/graph3d`

렌더러 독립적인 **2D** 물리와 인터리브된 XY 쌍에는 이 패키지를 사용하세요. [`@vectojs/graph3d`](/reference/graph3d/)는 별도의 3D 레이아웃 구현체(`D3ForceLayout`과 `VectoForceLayout`)와 Three.js 렌더러를 제공합니다; 그 positions는 XYZ 삼중항이고, 그래프/레이아웃 유형은 `ForceLayout2D`와 교환할 수 없습니다. 두 API 모두 시뮬레이션 작업이 남아 있는지 보고하는 호스트 호출 `step()`을 사용하지만, XYZ 데이터가 필요한 `Graph3D.applyPositions()`에 이 패키지의 XY 버퍼를 전달하지 마세요.

## 관련 항목

[`@vectojs/graph3d`](/reference/graph3d/) — 3D 레이아웃 및 렌더링용 · [`GraphLayout`과 3D 레이아웃 구현체](/reference/graph3d-layout/)
