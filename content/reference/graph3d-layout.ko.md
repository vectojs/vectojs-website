+++
title = "GraphLayout & D3ForceLayout"
description = "그래프 데이터 모델과 worker 친화적인 GraphLayout 계약, 그리고 d3-force-3d 기반의 D3ForceLayout 구현체."
weight = 45
+++

# `GraphLayout` & `D3ForceLayout`

[`@vectojs/graph3d`](/reference/graph3d/)의 일부입니다.

문서 버전: **0.6.1**

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

계약은 의도적으로 최소화되고 worker 친화적입니다: positions는 `GraphData.nodes` 순서의 xyz 삼중항으로 된 하나의 평평한 `Float32Array`이므로, 구현체가 Web Worker 내부에 완전히 존재하고 전송 가능한 버퍼를 스레드 경계를 통해 노드별 객체 트래픽 없이 스트리밍할 수 있습니다. [`Graph3D.applyPositions()`](/reference/graph3d-renderer/#meseodeu)는 동일한 버퍼 형태를 직접 사용합니다. `positions`는 단계마다 **재사용되는 동일한 배열 인스턴스**입니다 — 안정적인 스냅샷이 필요하면 복사(`layout.positions.slice()`)하세요.

**링크 엔드포인트 검증은 스택 전반에서 동일합니다 (0.6.1).**
`Graph3D.setGraphData`, `VectoForceLayout.setGraph`, `D3ForceLayout.setGraph`는
엔드포인트가 그래프의 어떤 노드도 가리키지 않는 링크에 대해 모두 같은
`references an unknown node id` 오류를 던집니다 — 검증은 상태가 변경되기 전에
실행되므로 거부된 그래프는 이전 그래프를 그대로 유지합니다(이전의 `D3ForceLayout`은
날 ID가 d3-force-3d에까지 도달하게 두었고, 그 tick은 모든 위치를 조용히 NaN으로
붕괴시켰습니다; 이전의 `VectoForceLayout`은 링크를 조용히 건너뛰었습니다).
셀프 루프는 여전히 스프링을 갖지 않는 합법적 입력입니다: `VectoForceLayout`은 그것들을
건너뜁니다.

또한 이 계약의 선택적 고정(pin) 제어는 노드 **인덱스**로 주소 지정되는 반면,
2D [`ForceLayout2D`](/reference/graph-layout/)는 노드 **ID**로 고정하며(그래서 그
고정은 `removeNodes` 압축 후에도 유지됩니다), 평행 엣지 식별 방식도 다릅니다 —
이 패키지의 스택은 평행 링크를 서로 다른 엣지로 취급하지만, node-editor 같은
소비자는 중복 엔드포인트 4-튜플을 거부합니다. 스택 간에 코드를 포팅할 때는
고정과 링크 식별 방식을 변환하세요.

`@vectojs/graph3d`는 현재 이 계약 뒤에 두 가지 구현체를 제공합니다 — 자체 개발한 [`VectoForceLayout`](#vectoforcelayout)(Barnes–Hut 옥트리, 런타임 의존성 없음; 기본값)과 [`D3ForceLayout`](#d3forcelayout)(`d3-force-3d` 어댑터, 기존 d3 튜닝과의 동등성 유지를 위해 유지됨) — 그리고 DAG 레이아웃 모드가 패키지 로드맵에 있으며, 모두 이 동일한 인터페이스 뒤에 있으므로 렌더러나 worker 호스트는 어떤 것이 실행 중인지 알 필요가 없습니다.

## `D3ForceLayout`

기본 [`VectoForceLayout`](#vectoforcelayout)의 d3-force-3d 기반 대안입니다. `d3-force-3d`가 필요합니다; 튜닝된 d3 힘이 있는 그래프를 마이그레이션하면서 그 느낌을 그대로 유지하려는 경우가 아니라면 `VectoForceLayout`을 선호하세요.

```ts
new D3ForceLayout(options?: D3ForceLayoutOptions)

interface D3ForceLayoutOptions {
  linkDistance?: number;   // 링크의 목표 정지 길이. 기본값 30.
  chargeStrength?: number; // 다체(charge) 강도; 음수는 반발. 기본값 -30.
  alphaMin?: number;       // step()이 식었다고 보고하는 alpha 임계값. 기본값 0.001.
}
```

[d3-force-3d](https://github.com/vasturiano/d3-force-3d)를 어댑트합니다 — `3d-force-graph`의 기반이 되는 동일한 엔진이므로, 그래프의 튜닝된 힘이 그 느낌을 유지한 채 마이그레이션됩니다. 3차원에서 `forceLink` + `forceManyBody` + `forceCenter`를 실행합니다.

d3 시뮬레이션은 자체 노드 레코드(`x`/`y`/`z`/`vx`/…)를 변경하므로, `setGraph`는 각 노드를 `GraphData.nodes` 객체를 직접 전달하는 대신 내부 시뮬레이션 레코드로 복제합니다 — 선언된 `fx`/`fy`/`fz` 핀과 초기 `x`/`y`/`z` 위치 시드만 전달됩니다. 시뮬레이션의 자체 타이머는 절대 시작되지 않습니다; `step(iterations = 1)`은 동기식으로 틱을 진행하므로, `D3ForceLayout`이 `requestAnimationFrame`을 모방하지 않고 Web Worker 내부에서 사용 가능합니다.

## `VectoForceLayout`

```ts
new VectoForceLayout(options?: VectoForceLayoutOptions)

interface VectoForceLayoutOptions {
  linkDistance?: number;   // target resting length of links. Default 30.
  linkStrength?: number;   // spring stiffness of links. Default 0.3.
  repulsion?: number;      // many-body repulsion strength. Default 300.
  centerStrength?: number; // pull toward the centroid. Default 0.02.
  velocityDecay?: number;  // per-step velocity damping. Default 0.6.
  theta?: number;          // Barnes–Hut opening angle. Default 0.9.
  alphaDecay?: number;     // cooling rate. Default 0.0228; non-positive falls back to the default.
  alphaMin?: number;       // alpha below which step() reports cooled. Default 0.001.
  seed?: number;           // RNG seed for deterministic placement. Default 1.
  measurePhases?: boolean; // opt-in per-tick phase profiling. Default false.
}
```

자체 개발 레이아웃(0.3.0에서 추가, 기본값): 다체 항에 Barnes–Hut 옥트리를 사용하는 힘 기반 시뮬레이션 — 런타임 의존성이 없고, `seed` 하에서 결정적이며, Web Worker 내부에서 안전합니다(`D3ForceLayout`과 동일한 `step(iterations)` 계약). 위치와 속도는 **f32**(노출된 `Float32Array`와 일치)로 유지되는 반면, 옥트리는 질량 중심과 반발 적분을 **f64**로 누적합니다. 실행 간에 동일한 결과가 필요할 때 선택하세요; `repulsion`/`linkStrength`로 조정하고 `alphaDecay`를 0보다 높게 올릴 때는 주의하세요 — 이미 냉각 경계에 가깝기 때문에 더 높은 값은 그래프를 나중이 아니라 더 일찍 고정시킵니다. 음수 또는 0인 `alphaDecay`는 생성 시 거부되며 기본값으로 폴백합니다(리터럴 `0`은 과거에 시뮬레이션이 영원히 수렴하지 않고 실행되게 만들었습니다).

```ts
layout.step(); // 한 틱
layout.step(5); // 한 번 호출에 5틱 — 프레임당 분할 상환 비용 절감
// 그래프의 시각적 안정화 시간이
// 틱당 부드러움보다 더 중요할 때 사용
```

**단계 프로파일링 (0.5.0부터).** `measurePhases: true`를 설정하면 각 틱이 `[옥트리 구축, 힘 누적, 링크 스프링, 적분]`으로 나뉜 벽시계 시간을 `layout.tickPhases`(밀리초의 `readonly` 4-튜플; 프로파일링이 꺼져 있으면 `null`)에 기록합니다. 그렇지 않으면 타이밍 호출이 생략되므로, 핫 경로는 아무 비용도 지불하지 않습니다.

**WASM 힘 커널 (0.5.0부터).** 선택적 Rust/WASM 커널(`crates/vectojs-force-rs`)은 틱의 지배적인 단계인 옥트리 구축 + 반발 누적을 가속화하는 반면, 링크 스프링, 중심화, 적분, 핀은 JS에 남습니다:

```ts
import { forceWasmUrl } from '@vectojs/graph3d/wasm';

await layout.enableWasmForce(forceWasmUrl); // async; string | URL | Response
layout.enableWasmForceSync(bytes); // sync; BufferSource, never fetches
```

둘 다 실패(CSP, 404, 손상된 모듈) 시 `false`를 반환하고 비트 단위로 동일한 JS Barnes-Hut을 조용히 유지합니다 — 이것이 영구적인 폴백이자 차등 오라클입니다. 커널은 `@vectojs/core` 의존성이 없습니다.

**핀 (0.2.0부터).** `D3ForceLayout`과 `VectoForceLayout` 모두 선택적 핀 컨트롤을 구현하며(d3는 `fx`/`fy`/`fz`를 통해, VectoForceLayout은 자체 핀 배열을 통해), 이것이 [`GraphInteraction`](/reference/graph3d-renderer/#graphinteraction-hobeo-seontaeg-deuraegeu-tu-pin)의 드래그-투-핀을 구동합니다:

```ts
layout.pinNode(i, x, y, z); // 노드 i를 (x,y,z)에 고정; 매 틱마다 positions[i]도 갱신
layout.reheat(0.3); // 식은 시뮬레이션을 깨워 나머지가 핀 주변에 안정화되도록 함
layout.unpinNode(i); // fx/fy/fz 해제 — 노드 i가 다시 자유로워짐
```

범위를 벗어난 인덱스는 무시됩니다(오래된 포인터 상호작용이 레이아웃을 충돌시키지 않음), `reheat`의 alpha는 `[alphaMin, 1]` 범위로 클램프됩니다.

**실시간 힘 변경.** `D3ForceLayoutOptions`는 생성자 전용입니다; 실시간 설정자가 없습니다. 새 `chargeStrength`/`linkDistance`를 적용하려면(예: 슬라이더에서), 기존 인스턴스를 `dispose()`하고 새 인스턴스로 `setGraph()`를 호출하세요 — 토폴로지 자체가 변경되지 않는 그래프의 경우 `Graph3D`의 GPU 버퍼가 아닌 시뮬레이션만 재구축되므로 저렴합니다:

```ts
function restartLayout() {
  layout.dispose();
  layout = new D3ForceLayout({ chargeStrength, linkDistance });
  layout.setGraph(data);
}
```

`VectoForceLayoutOptions`도 마찬가지로 생성자 전용이므로, 힘을 변경할 때 동일한 재시작 패턴이 적용됩니다.

## 관련 항목

렌더러 독립적인 **2D** 힘 레이아웃, 증분 토폴로지 업데이트, 인터리브된 XY 위치가 필요하면 [`@vectojs/graph-layout`](/reference/graph-layout/)을 사용하세요. 이는 별도의 패키지입니다; `ForceLayout2D`와 XY 버퍼는 이 페이지의 3D `GraphLayout` 계약이나 XYZ 위치 형태를 구현하지 않습니다. 두 API 모두 호스트가 구동하는 `step()`에서 active/cooled 불리언을 반환하지만, 레이아웃 유형과 위치 버퍼는 서로 교환할 수 없습니다.

[`Graph3D` & picking](/reference/graph3d-renderer/) (`positions`를 직접 사용) ·
[`@vectojs/graph3d` 개요](/reference/graph3d/)
