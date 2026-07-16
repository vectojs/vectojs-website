---
title: 'GraphLayout & D3ForceLayout'
description: '그래프 데이터 모델과 worker 친화적인 GraphLayout 계약, 그리고 d3-force-3d 기반의 D3ForceLayout 구현체.'
order: 45
---

# `GraphLayout` & `D3ForceLayout`

[`@vectojs/graph3d`](/reference/graph3d/)의 일부입니다.

## 데이터 모델 — `GraphData`

```ts
type NodeId = string | number;

interface GraphNode {
  id: NodeId;
  val?: number; // 상대적 중요도; 렌더러가 반경을 ∛val에 비례하여 조정합니다. 기본값 1.
  color?: string; // CSS 색상; 렌더러의 nodeColor가 대체로 사용됩니다.
  fx?: number; // 고정된 x 위치에 노드 고정 — 레이아웃이 이동시키지 않음
  fy?: number;
  fz?: number;
  [key: string]: unknown; // 도메인 속성은 그대로 유지됩니다
}

interface GraphLink {
  source: NodeId;
  target: NodeId;
  [key: string]: unknown;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}
```

노드 객체는 레이아웃이나 렌더러에 의해 절대 변경되지 않습니다 — 임의의 추가 속성(레이블, 카테고리, 사용자 코드에서만 사용하는 가중치)은 그대로 전달되므로, `GraphData`는 애플리케이션 자체 그래프 모델로도 사용할 수 있어 변환할 필요가 없습니다.

## `GraphLayout` — 레이아웃 계약

```ts
interface GraphLayout {
  setGraph(data: GraphData): void;
  step(iterations?: number): boolean; // 시뮬레이션 진행, `positions` 갱신; 식으면 false 반환
  readonly positions: Float32Array; // xyz 삼중항, GraphData.nodes와 인덱스 정렬
  // 선택적 런타임 핀 컨트롤 (0.2.0부터) — 대화형 드래그-투-핀용.
  // GraphInteraction이 pinNode를 감지하여 드래그를 활성화합니다.
  pinNode?(nodeIndex: number, x: number, y: number, z: number): void;
  unpinNode?(nodeIndex: number): void; // 고정된 노드를 자유 시뮬레이션으로 해제
  reheat?(alpha?: number): void; // alpha를 높여 식은 시뮬레이션이 핀/언핀에 반응하도록 함
  dispose(): void; // 시뮬레이션 리소스 해제; 인스턴스 사용 불가
}
```

계약은 의도적으로 최소화되고 worker 친화적입니다: positions는 `GraphData.nodes` 순서의 xyz 삼중항으로 된 하나의 평평한 `Float32Array`이므로, 구현체가 Web Worker 내부에 완전히 존재하고 전송 가능한 버퍼를 스레드 경계를 통해 노드별 객체 트래픽 없이 스트리밍할 수 있습니다. [`Graph3D.applyPositions()`](/reference/graph3d-renderer/#methods)는 동일한 버퍼 형태를 직접 사용합니다. `positions`는 단계마다 **재사용되는 동일한 배열 인스턴스**입니다 — 안정적인 스냅샷이 필요하면 복사(`layout.positions.slice()`)하세요.

`@vectojs/graph3d`는 현재 하나의 구현체를 제공합니다; 더 많은 어댑터(`ngraph`)와 DAG 레이아웃 모드가 패키지 로드맵에 있으며, 모두 이 동일한 인터페이스 뒤에 있으므로 렌더러나 worker 호스트는 어떤 것이 실행 중인지 알 필요가 없습니다.

## `D3ForceLayout`

```ts
new D3ForceLayout(options?: D3ForceLayoutOptions)

interface D3ForceLayoutOptions {
  linkDistance?: number;   // 링크의 목표 정지 길이. 기본값 30.
  chargeStrength?: number; // 다체(charge) 강도; 음수는 반발. 기본값 -30.
  alphaMin?: number;       // step()이 식었다고 보고하는 alpha 임계값. 기본값 0.001.
}
```

[d3-force-3d](https://github.com/vasturiano/d3-force-3d)를 어댑트합니다 — `3d-force-graph`의 기반이 되는 동일한 엔진이므로, 그래프의 튜닝된 힘이 그 느낌을 유지한 채 마이그레이션됩니다. 3차원에서 `forceLink` + `forceManyBody` + `forceCenter`를 실행합니다.

d3 시뮬레이션은 자체 노드 레코드(`x`/`y`/`z`/`vx`/…)를 변경하므로, `setGraph`는 각 노드를 `GraphData.nodes` 객체를 직접 전달하는 대신 내부 시뮬레이션 레코드로 복제합니다 — 선언된 `fx`/`fy`/`fz` 핀만 전달됩니다. 시뮬레이션의 자체 타이머는 절대 시작되지 않습니다; `step(iterations = 1)`은 동기식으로 틱을 진행하므로, `D3ForceLayout`이 `requestAnimationFrame`을 모방하지 않고 Web Worker 내부에서 사용 가능합니다.

```ts
layout.step(); // 한 틱
layout.step(5); // 한 번 호출에 5틱 — 프레임당 분할 상환 비용 절감
// 그래프의 시각적 안정화 시간이
// 틱당 부드러움보다 더 중요할 때 사용
```

**핀 (0.2.0부터).** `D3ForceLayout`은 d3-force의 `fx`/`fy`/`fz`를 통해 선택적 핀 컨트롤을 구현하며, 이것이 [`GraphInteraction`](/reference/graph3d-renderer/#graphinteraction-hover-select-drag-to-pin)의 드래그-투-핀을 구동합니다:

```ts
layout.pinNode(i, x, y, z); // 노드 i를 (x,y,z)에 고정; 매 틱마다 positions[i]도 갱신
layout.reheat(0.3); // 식은 시뮬레이션을 깨워 나머지가 핀 주변에 안정화되도록 함
layout.unpinNode(i); // fx/fy/fz 해제 — 노드 i가 다시 자유로워짐
```

범위를 벗어난 인덱스는 무시됩니다(오래된 포인터 상호작용이 레이아웃을 충돌시키지 않음), `reheat`의 alpha는 d3의 일반적인 `[alphaMin, 1]` 범위로 제한됩니다.

**실시간 힘 변경.** `D3ForceLayoutOptions`는 생성자 전용입니다; 실시간 설정자가 없습니다. 새 `chargeStrength`/`linkDistance`를 적용하려면(예: 슬라이더에서), 기존 인스턴스를 `dispose()`하고 새 인스턴스로 `setGraph()`를 호출하세요 — 토폴로지 자체가 변경되지 않는 그래프의 경우 `Graph3D`의 GPU 버퍼가 아닌 시뮬레이션만 재구축되므로 저렴합니다:

```ts
function restartLayout() {
  layout.dispose();
  layout = new D3ForceLayout({ chargeStrength, linkDistance });
  layout.setGraph(data);
}
```

## 관련 항목

[`Graph3D` & picking](/reference/graph3d-renderer/) (`positions`를 직접 사용) ·
[`@vectojs/graph3d` 개요](/reference/graph3d/)
