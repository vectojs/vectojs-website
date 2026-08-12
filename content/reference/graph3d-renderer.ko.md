+++
title = "Graph3D & picking"
description = "인스턴싱된 Three.js 렌더러로 모든 그래프를 두 번의 드로 콜로 그리고, 호버/클릭 노드 피킹을 위한 레이캐스팅 패턴."
weight = 46
+++

# `Graph3D` & picking

[`@vectojs/graph3d`](/reference/graph3d/)의 일부입니다. [`GraphLayout`](/reference/graph3d-layout/)의 `positions` 버퍼를 사용합니다.

## `Graph3D` — 렌더러

```ts
new Graph3D(options?: Graph3DOptions)

interface Graph3DOptions {
  nodeRadius?: number;   // val 스케일링 전 기본 노드 반경. 기본값 4.
  nodeSegments?: number; // 구체 테셀레이션(너비/높이 세그먼트). 기본값 12.
  nodeColor?: string;    // 색상이 없는 노드의 대체 색상. 기본값 '#4f9cff'.
  linkColor?: string;    // 링크 선 색상. 기본값 '#9aa4b2'.
  linkOpacity?: number;  // 링크 선 불투명도. 기본값 0.35.
}
```

### Public 속성

```ts
graph.group: THREE.Group // 씬에 추가하세요; 노드 메시와 링크 선을 소유합니다
```

### 메서드

```ts
setGraphData(data: GraphData): void
// 새 그래프의 GPU 리소스를 재구축합니다: 하나의 InstancedMesh(nodeCount
// 개의 공유 SphereGeometry 인스턴스, 인스턴스당 색상 + ∛val 배율)와
// 하나의 LineSegments(linkCount 세그먼트). 인스턴스 버퍼는 고정 크기이므로,
// 노드/링크 수 변경은 새 메시가 필요합니다 — 동일한 토폴로지에 대한
// 스타일링만 변경하는 경우 별도 경로가 필요 없을 정도로 저렴합니다. 알 수 없는
// 링크 엔드포인트(data.nodes에 없는 source/target id)는 조용히 원점에 선을
// 그리는 대신 오류를 발생시킵니다.

applyPositions(positions: Float32Array): void
// xyz 삼중항(예: GraphLayout의 `.positions`)을 인스턴스
// 노드 행렬과 링크 엔드포인트에 씁니다. 무언가를 이동시킨 레이아웃 단계 후마다
// 호출하세요; 시뮬레이션이 실행 중일 때 매 프레임 호출해도 충분히 저렴합니다.

pickNode(raycaster: THREE.Raycaster): number | null   // 0.2.0부터
// 호출자가 구성한 레이캐스터(카메라 + 포인터 NDC 기준)로 노드 클라우드만
// 히트 테스트하고 가장 가까운 충돌 노드의 인덱스 — `GraphData.nodes` 배열과
// 정렬됨 — 또는 miss 시 `null`을 반환합니다. 링크는 절대
// 피킹되지 않으므로, 레이가 링크 선을 스치면 miss로 보고합니다.

getNodePosition(index: number, target: THREE.Vector3): THREE.Vector3 | null   // 0.2.0부터
// 노드의 현재 월드 위치(applyPositions가 마지막으로 쓴 위치)를
// 인스턴스 행렬에서 직접 `target`으로 읽어옵니다. 범위를 벗어난
// 인덱스 또는 노드 메시가 존재하지 않을 때 `null`을 반환합니다.

dispose(): void
// 노드 메시와 링크 선 모두의 geometry/material/mesh GPU 리소스를
// 해제하고, `group`을 비웁니다.
```

모든 노드에 대해 하나의 `InstancedMesh`(인스턴스당 색상 및 `∛val`-비례 반경)와 모든 링크에 대해 하나의 `LineSegments`, 둘 다 단일 `THREE.Group` 아래 — 인스턴싱의 핵심은 그래프 크기(10개 노드든 10,000개 노드든)와 관계없이 정확히 **두 번의 드로 콜**이 소요된다는 점입니다. `Graph3D`는 모든 [`GraphLayout`](/reference/graph3d-layout/)-형태의 positions 버퍼를 사용하며 해당 숫자가 어떻게 계산되었는지 알지 못하므로, 렌더링 코드를 건드리지 않고 레이아웃을 교체(또는 worker 호스팅)할 수 있습니다.

링크 선은 `frustumCulled = false`로 설정됩니다 — 엔드포인트가 매 레이아웃 틱마다 이동하며, 일반적으로 배경 요소인 것에 대해 프레임마다 경계를 재계산하는 것은 항상 그리는 것보다 낭비입니다.

## Picking (호버 / 클릭)

0.2.0부터 `pickNode()`는 **오직** 노드 클라우드만 히트 테스트하므로, 더 이상 `intersectObjects` + `instanceId` 필터링을 혼합된 노드/링크 자식에 대해 수동으로 처리할 필요가 없습니다. 카메라와 포인터 NDC에서 `THREE.Raycaster`를 구성한 후 충돌한 노드 인덱스(`GraphData.nodes`와 정렬됨)를 읽어오세요:

```ts
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;

  raycaster.setFromCamera(ndc, camera);
  const index = graph.pickNode(raycaster); // number | null; 링크는 일치하지 않음
  const node = index !== null ? data.nodes[index] : null;
});
```

## `GraphInteraction` — 호버 / 선택 / 드래그-투-핀

0.2.0부터 `GraphInteraction`은 위의 포인터 배관을 호버, 선택, 드래그-투-핀으로 감쌉니다 — 모든 대화형 3D-그래프 앱이 그렇지 않으면 수동으로 재구축할 부분입니다. `domElement`에 세 개의 포인터 리스너를 소유하며 그 외에는 아무것도 없습니다: 씬, 렌더 루프, 컨트롤이 없습니다. 호스트는 자체 애니메이션 루프와 레이아웃 `step()`을 계속 구동합니다.

```ts
const interaction = new GraphInteraction({
  graph, // Graph3D
  camera, // 피킹 레이를 만드는 카메라
  domElement: canvas, // 포인터 이벤트를 읽을 요소
  layout, // GraphLayout; 드래그-투-핀에 필요(pinNode 필요)
  nodeCount: data.nodes.length, // 선택적 인덱스 가드
  onHover: (i) => {
    /* i: number | null */
  },
  onSelect: (i) => {
    /* 드래그가 아닌 클릭; null = 빈 공간 선택 해제 */
  },
  setControlsEnabled: (enabled) => (controls.enabled = enabled), // 드래그 중 OrbitControls 일시 중단
});
// …나중에
interaction.dispose(); // 포인터 리스너 제거
```

드래그는 **기능 감지(feature-detected)** 됩니다: 핀 가능한 레이아웃(`pinNode` 구현, [`D3ForceLayout`](/reference/graph3d-layout/)이 제공)이 없으면 누름(press)이 선택으로 대체됩니다. `onDragStart`/`onDrag`/`onDragEnd`, `pinOnDrag`(기본값 `true`), `dragReheat`(기본값 `0.3`), `dragThreshold`(기본값 `4`px)로 옵션을 구성할 수 있습니다.

## 관련 항목

[`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/) (이것이 사용하는 `positions` 버퍼를 생성하며, `pinNode` 드래그-투-핀이 의존함) ·
[`@vectojs/graph3d` 개요](/reference/graph3d/)
