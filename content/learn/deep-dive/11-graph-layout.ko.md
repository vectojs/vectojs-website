---
title: '11 — 그래프 레이아웃 — 힘 기반 물리 & 벤치마크'
description: 'ForceLayout2D의 의존성 없는 2D 엔진, Barnes-Hut 쿼드트리와 계층 충돌 그리드, 증분 변경과 핀 계약, VectoForceLayout/D3ForceLayout 3D 패밀리, vectojs-force-rs WASM 커널, 헤드 벤치마크 방법론.'
order: 31
---

# 11 — 그래프 레이아웃 — 힘 기반 물리 & 벤치마크

> **Boss 11**은 "스프링과 반발"처럼 보이지만 배포하면 달라진다. 순진한 N-바디는 틱당 O(N²)이고, 단일 허브는 순진한 충돌 그리드를 붕괴시키며, 증분 확장은 안정된 상태를 파괴하지 않아야 하고, 두 사용자가 동일한 시드로 같은 레이아웃을 봐야 한다. VectoJS는 `@vectojs/graph-layout`의 렌더러 무관 2D 쿼드트리와 계층 그리드, `@vectojs/graph3d`의 병렬 3D 옥트리 패밀리, `crates/vectojs-force-rs`의 비트 동일 Rust 커널로 답한다.

- **배울 내용**: N², 안정성, 증분성, 결정성이 네 가지 어려운 문제인 이유; `ForceLayout2D`가 SoA 상태를 저장하고 `Float32Array` 위치를 노출하는 방식; 틱당 반발(Barnes-Hut), 링크 스프링, 중심화, 충돌이 어떻게 합성되는지; 2D 쿼드트리와 계층 충돌 그리드가 순진 그리드를 대체한 이유; 핀, ID 매핑, 재가열, 알파 냉각이 상호작용하는 방식; `VectoForceLayout` 대 `D3ForceLayout` 대 `FixedZLayout`의 차이와 `KnowledgeGraphModel`이 소비하는 곳; WASM 힘 커널이 대체하는 것과 비트 동일 유지 방식; `benchmarks/graph-layout`이 실제로 측정하는 것(명시적으로 측정하지 않는 것 포함).
- **배우지 않을 내용**: VMT 더티/라이프사이클(boss 06), 렌더러/DPR 정확성(boss 07), G1/G2/G3 WASM 삼중(boss 08) — 이 보스는 boss 08의 보이지 않는 백엔드 계약을 그대로 재사용한다. 텍스트 형태(boss 02)와 스트리밍 마크다운(boss 04)은 그래프 레이아웃의 소비자이지 역이 아니다.

## 1. 힘 기반 레이아웃이 속이는 이유

"스프링과 반발" 뒤에는 네 가지 문제가 숨는다:

1. **N² 대 Barnes-Hut.** 반발은 모든 노드 대 모든 노드다. 3000 노드에서 틱당 ~900만 쌍 힘이 발생하며, 메인 스레드나 워커에서 프레임당 처리된다. 실제 2D 쿼드트리(`BarnesHutQuadtree.ts:8` 평면 배열, 틱 간 재사용)는 `size/distance < theta` (`BarnesHutQuadtree.ts:121` 개방 테스트 `4*half² < theta²*d²`)일 때 먼 셀을 하나의 의사 입자로 처리하여 O(N log N)로 만든다. 3D 쪽은 옥트리(`VectoForceLayout.ts:402` `BarnesHutOctree`)로 동일하게 처리한다. 없으면 수백 노드 이상의 그래프가 끊긴다.
2. **이종 반경에서의 안정성.** 반경 100의 단일 허브가 반경 4의 3000 잎 옆에 있으면 균일 충돌 그리드가 붕괴한다: `cellSize = 2·maxRadius`이 각 잎을 거대한 3×3 이웃에 넣고 쌍 스캔이 제곱으로 퇴화한다(`BarnesHutQuadtree.ts:189` 주석은 큰 허브 하나로 3k→12k 갈 때 틱당 `12 ms → 197 ms`를 측정한다). 해결은 2의 거듭제곱 반경 계층 그리드(`BarnesHutQuadtree.ts:190` 계층 `t = floor(log2(r))`, 셀 `Ct = 2^(t+2)`)로, 각 계층이 자체 해시 테이블을 가지며 계층 간 쌍이 정확히 한 번 해결된다.
3. **이동 없이 증분성.** 지식 그래프는 페이지된다: 지금 50개 노드, 스크롤 후 50개 더. 호출자는 `appendGraph`이 기존 위치, 속도, 핀을 정확히 유지하고 새 노드만 결정적으로 추가하며 부드럽게 재가열(`ForceLayout2D.ts:162` `appendGraph`, `ForceLayout2D.ts:199` `if (newNodes.length>0||addedLinks>0) this.reheat()`)하기를 기대한다. `setGraph` 재구축(`ForceLayout2D.ts:123`)은 안정된 그래프를 순간이동시킨다.
4. **플랫폼 간 결정성.** `seed`는 JS와 Rust에서 동일한 초기 배치와 동일한 일치점 점 지터를 재현해야 하므로 테스트, 스냅샷, 미래 WASM 차이 오라클이 비트로 일치한다. 선택된 수학은 `mulberry32`(`ForceLayout2D.ts:868`), `Math.sqrt`(`Math.hypot`이 아닌 — 엔진 근사, `VectoForceLayout.ts:618` 주석), 정수 `Math.imul` 지터(`BarnesHutQuadtree.ts:618` `collisionPairAngle`, `VectoForceLayout.ts:606` `jitterFor` / `crates/vectojs-force-rs/src/lib.rs:83` `jitter_for`).

하나라도 빠지면 그래프가 끊기거나, 폭발하거나, 순간이동하거나, JS와 WASM 사이에서 발산한다.

## 2. 패키지 지도

```text
@vectojs/graph-layout          의존성 없는 2D 엔진, 렌더러 동료 없음
  src/ForceLayout2D.ts         틱 루프, SoA 저장소, 공개 API
  src/types.ts                 NodeId/GraphData/ForceLayout2DOptions
  src/internal/BarnesHutQuadtree.ts  쿼드트리 + 계층 충돌 그리드
  src/index.ts                 배럴(유형 + 레이아웃)

@vectojs/graph3d               3D 인스턴스 렌더러 + 레이아웃 백엔드
  src/layout/GraphLayout.ts    최소 3D 계약(setGraph/step/positions/pin/reheat/dispose)
  src/layout/VectoForceLayout.ts  자체 3D Barnes-Hut 옥트리(JS 오라클 + WASM)
  src/layout/D3ForceLayout.ts  d3-force-3d 어댑터(이전 호환)
  src/wasm/force-backend.ts    Rust 커널 스트리밍/동기 로더
  src/wasm/asset.ts            forceWasmUrl 번들러 도우미
  src/wasm/vectojs_force.wasm  vectojs-force-rs의 gitignored 출력

@vectojs/knowledge-graph       페이지된 소비자(KnowledgeGraphModel)
  src/KnowledgeGraphModel.ts   GraphLayout의 단일 드라이버(setGraph/reheat)
  src/FixedZLayout.ts          z를 평면에 고정한 VectoForceLayout
  src/KnowledgeGraphSession.ts 공장 배선(theta 0.9, WASM 선택)

crates/vectojs-force-rs        WASM 옥트리 힘 커널(보이지 않는 백엔드)
  src/lib.rs                   빌드 + 힘 축적만, f64 누적기

benchmarks/graph-layout        헤드 4가지 조합(d3-force-3d, vecto-force, d3-force-2d, force-layout-2d)
benchmarks/graph3d-frame       3D 렌더러 프레임 비용 하네스(물리 행렬 아님)
benchmarks/_shared/*           단일 서버 + 번들러 + 통계 + 러너(run-browsers.sh)
```

`@vectojs/graph-layout`은 `@vectojs/*` 의존성이 0(`package.json:1` `name: @vectojs/graph-layout`); `@vectojs/graph3d`는 `three`만 의존; `@vectojs/knowledge-graph`는 `graph3d`의 레이아웃 계약에 의존. 빌드 순서: `math+text → graph-layout → three/graph3d → knowledge-graph`(`package.json` 워크스페이스로 확인).

## 3. ForceLayout2D — 2D 엔진

### 3.1 상태와 위치 계약

SoA(Structure of Arrays) 타입 배열, 입력 노드 순서와 인덱스 정렬(`ForceLayout2D.ts:48` `nodes: GraphNode[]`, `ForceLayout2D.ts:49` `nodeIndex: Map<NodeId,number>`, `ForceLayout2D.ts:50` `positionStorage: Float32Array`, `ForceLayout2D.ts:51` `velocityX/Y`, `ForceLayout2D.ts:53` `fixedX/Y` + `pinnedX/Y`, `ForceLayout2D.ts:57` `repulsion`/`collisionRadius`, `ForceLayout2D.ts:60` `linkSource/Target/Distance/Strength/Share`, `ForceLayout2D.ts:76` `quadtree`).

공개 `positions`는 입력 노드 순서의 `positionStorage`에 대한 라이브 XY 교차 뷰(`ForceLayout2D.ts:32` `public positions = new Float32Array(0)`, `ForceLayout2D.ts:748` `subarray`를 통한 `refreshPositionView`). `step()` 호출 간 정체성은 안정적이지만 토폴로지나 용량 변경이 백업 저장소를 교체할 수 있으므로 — 호스트는 `setGraph`/`appendGraph`/`removeNodes` 후 `positions`를 다시 획득해야 한다(클래스 문서 `ForceLayout2D.ts:18`).

공개 상태를 건드리는 모든 산술은 `Math.fround`(`ForceLayout2D.ts:13` `const f = Math.fround`, `ForceLayout2D.ts:808` `toF32`)으로 반올림되어 `Float32Array` 노출과 일치한다. 3D 경로도 동일(`VectoForceLayout.ts:48` `const f = Math.fround`)하며 Barnes-Hut 누적기는 `f64`(`BarnesHutQuadtree.ts:9` `cellX/Y/centerX/Y/halfSize/charge: Float64Array`)에 남는다.

### 3.2 노드/링크 정체성과 증분 변경

노드는 어디서나 인덱스가 아닌 `NodeId`(`types.ts:2` `string|number`)로 주소 지정되므로 핀이 압축을 견딘다(`ForceLayout2D.ts:25` 문서). 각 변경 진입점은 엄격한 전체-또는-무효 검증을 갖는다:

| 메서드               | 문서                   | 속성                                   | 실패 모드                                                                                                                    |
| -------------------- | ---------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `setGraph(data)`     | `ForceLayout2D.ts:122` | 전체 교체, 재시드, `alpha=1`           | 중복 노드 ID 또는 없거나 자체 참조하는 링크 → 이전 상태 정리 전에 예외(`ForceLayout2D.ts:132` 검증-전-교환)                  |
| `appendGraph(data)`  | `ForceLayout2D.ts:151` | 기존 보존, 새 ID 추가, 중복 제거       | 알 수 없거나 없거나 자체 참조하는 링크 → 변경 전 예외(`ForceLayout2D.ts:186` `resolveEndpoint` + `UNKNOWN_ENDPOINT` 보호)    |
| `removeNodes(ids)`   | `ForceLayout2D.ts:202` | 원래 순서로 생존자 압축, 인덱스 재구축 | 일치하지 않으면 무효; 한 번 재가열(`ForceLayout2D.ts:252`)                                                                   |
| `removeLinks(items)` | `ForceLayout2D.ts:265` | 노드 상태 보존, 링크 압축              | `(source,target,id)`로 지향된 정체성 매칭(`ForceLayout2D.ts:826` `linkIdentity`); 멱등원                                     |
| `updateLinks(links)` | `ForceLayout2D.ts:324` | 기존 링크의 거리/힘 재해결             | 알 수 없거나 동일한 엔드포인트 → 예외; 존재하지 않는 정체성 무시; 실제로 값이 변경된 경우에만 재가열(`ForceLayout2D.ts:361`) |

링크 정체성은 미묘한 함정이다. `ForceLayout2D.ts:826` `linkIdentity`는 `idKey(source)`, `idKey(target)`, `idKey(id)`의 `[idKey(source), idKey(target), idKey(id)]`를 직렬화하며(`ForceLayout2D.ts:835` `idKey`는 `"1"` 대 `1` 충돌 방지를 위해 유형을 접두사로 붙임). `id` 없으면 정체성이 지향된 엔드포인트 쌍이며, 병렬 링크는 별도의 `id`가 필요(`types.ts:19` `GraphLink.id`). 3D 백엔드는 다르다: `VectoForceLayout`과 `D3ForceLayout`는 각 `(source,target)` 쌍을 링크로 처리하고 자체 루프도 생략(`VectoForceLayout.ts:178` `if (ia===ib) continue`), 편집기의 중복 링크 보호는 더 엄격하다(`ForceLayout2D.ts:387` 발산 주석).

`appendLinks`(`ForceLayout2D.ts:637`)는 `pendingKeys`를 통해 배치 내 중복 제거를 수행하고 호출자가 제공한 `NodeValue`/`LinkValue` 접근기(`ForceLayout2D.ts:777` `resolveNodeValue`, `ForceLayout2D.ts:787` `resolveLinkValue`)를 통해 `distance`/`strength`를 해결하며, `finiteOr`(`ForceLayout2D.ts:797`) 보호를 사용한다.

용량 증가는 기하급수적으로, 상각 O(1)이다(`ForceLayout2D.ts:851` `grownCapacity`은 4에서 두 배, `ForceLayout2D.ts:672` `ensureNodeCapacity`, `ForceLayout2D.ts:689` `ensureLinkCapacity`, `ForceLayout2D.ts:857` `resize`는 접두사 보존).

### 3.3 틱 — 6단계

`tick()`(`ForceLayout2D.ts:480`)는 동기적이며 호스트가 주도(`step()`의 `ForceLayout2D.ts:368`은 `alpha >= alphaMin` 동안 `tick()` 반복). 타이머 없음 — 호스트가 `step()` 호출 시점을 결정(클래스 문서 `ForceLayout2D.ts:21`).

```text
sanitizeState → quadtree.build → repulsion (노드당 Barnes-Hut)
               → link springs → collision grid → center+integrate+pin clamp → alpha decay
```

각 단계 상세:

1. **정리** (`ForceLayout2D.ts:752`) — `toF32`로 각 위치/속도/핀/반발/반경을 정리하여 잃어버린 NaN이 트리를 오염시키지 않도록; 고정된 좌표는 저장된 위치를 덮어쓴다.
2. **트리 구성** (`ForceLayout2D.ts:483` `quadtree.build(positions, repulsion, nodeCount)`) — §5 참조.
3. **반발** (`ForceLayout2D.ts:484` `quadtree.force(qx,qy,theta,nodeIndex,out,maxDistance)` 호출 루프) — 역제곱 `(-charge / d³) * (dx,dy)`, `distanceSquared`는 `1e-6` 바닥, 정확한 일치를 위한 결정적 `pairAngle`(`BarnesHutQuadtree.ts:126` / `BarnesHutQuadtree.ts:610` `pairAngle`). `repulsionDistanceMax`(`ForceLayout2D.ts:92` 비유한 = 무제한; `BarnesHutQuadtree.ts:85` `maxDistanceSquared` + `distanceToCellSquared` 사전 테스트 `BarnesHutQuadtree.ts:632`)를 존중. 3D 쪽은 동일한 바닥과 삽입 시 `jitterFor`를 사용한다.
4. **링크 스프링** (`ForceLayout2D.ts:499`) — 후크 유형 `displacement = ((d - rest)/d) * strength * alpha`, 정도(`ForceLayout2D.ts:701` `recomputeLinkBias`: `sourceShare = targetDegree/total`, 핀이 엔드포인트를 고정할 때 `springShare`를 통한 바닥 `ForceLayout2D.ts:846`)로 가중된 비율로 나눔. 고정된 대상에 대해 예측된 위치를 사용하여 고정된 노드가 여전히 당기도록 함.
5. **충돌** (`ForceLayout2D.ts:580` `applyCollisions` → `BarnesHutQuadtree.ts:172` `applyGridCollisions`) — 계층 그리드, §5.
6. **중심 + 통합** (`ForceLayout2D.ts:554` 원점으로의 `center*alpha` 매력, 속도 감쇠, 이후 핀 클램프: 고정된 축은 `fixedX/Y`로 조정되고 속도는 0). **냉각** (`ForceLayout2D.ts:577` `alpha += (0-alpha)*alphaDecay`), `alphaDecay > 0` 보호(`ForceLayout2D.ts:95`) — `0`이면 무한 루프(`step()`의 `ForceLayout2D.ts:372` `while (alpha>=alphaMin)`).

## 4. 힘을 구성으로

`ForceLayout2DOptions`(`types.ts:42`)와 `VectoForceLayoutOptions`(`VectoForceLayout.ts:12`)는 다른 기본값으로 동일한 모델을 노출한다:

| 매개변수                       | 2D 기본(`types.ts:43`) | 3D 기본(`VectoForceLayout.ts:14`)                | 역할                                                       | 조정 힌트                                                                                                                                                                      |
| ------------------------------ | ---------------------- | ------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `repulsion` / `chargeStrength` | `300` (양의 힘)        | `300` (VectoForce) / `-30` (D3 `chargeStrength`) | N-바디 밀기                                                | 허브 분리 증가; 2D는 음수를 `0`으로 클램프 (`ForceLayout2D.ts:629`/`ForceLayout2D.ts:761` 및 `BarnesHutQuadtree.ts:109` 불변 `charge<=0 skip`)                                 |
| `collisionRadius`              | `0` (꺼짐)             | 해당 없음 (graph3d는 2D 그리드 없음)             | 노드당 반경, `0` 비활성 (`ForceLayout2D.ts:582` 최대 스캔) | 벤치에서 `radius+14` 접근기로 설정 (`entry.ts:631`)                                                                                                                            |
| `collisionStrength`            | `1`                    | —                                                | 수정된 중첩 비율                                           | `0`은 전체 패스를 생략                                                                                                                                                         |
| `linkDistance`                 | `30`                   | `30`                                             | 스프링 휴지 길이                                           | 벤치에서 링크 정도 접근기로 (`entry.ts:632`)                                                                                                                                   |
| `linkStrength`                 | `0.3`                  | `0.3`                                            | 스프링 강성 `[0,1]`                                        | `0` = 링크가 아무 힘도 행사하지 않음                                                                                                                                           |
| `centerStrength`               | `0.02`                 | `0.02`                                           | 원점으로의 매력                                            | `0` = 그래프가 떠 있음                                                                                                                                                         |
| `velocityDecay`                | `0.6`                  | `0.6`                                            | `1-마찰`, `[0,1)` 유지 `[0,1)`                             | 낮음 = 더 많은 감쇠                                                                                                                                                            |
| `theta`                        | `0.9`                  | `0.9`                                            | Barnes-Hut 개방 각도                                       | `0` = 정확한 O(N²); 높음 = 더 빠름/덜 정확                                                                                                                                     |
| `repulsionDistanceMax`         | `Infinity`             | `Infinity` (3D 벤치에서 별도 노출 안 함)         | 원거리 반발 GC                                             | `Infinity`/비유한 = 무제한 (`ForceLayout2D.ts:91`); `0`은 `BarnesHutQuadtree.ts:77` 조기 반환으로 무음 비활성 — `finiteOr`(`ForceLayout2D.ts:91`)이 비양수를 `Infinity`로 매핑 |
| `alphaDecay` / `alphaMin`      | `0.0228` / `0.001`     | `0.0228` / `0.001`                               | 냉각 (`~1-0.001^(1/300)` ≈ 300 틱 안정)                    | `0` 감쇠는 `0.0228`로 대체(`ForceLayout2D.ts:96`)                                                                                                                              |

접근기 형태 `number | ((node, index)=>number)`(`types.ts:38` `NodeValue`, `LinkValue`)는 엔티티 크기를 재구성 없이 반경으로 매핑할 수 있게 한다. 링크 비율은 각 토폴로지 변경 시 재계산(`ForceLayout2D.ts:702`).

## 5. 두 공간 인덱스

### 5.1 Barnes-Hut 쿼드트리 2D

`BarnesHutQuadtree.ts:8`은 틱 간 재사용되는 평면 배열 쿼드트리다. `build()`(`BarnesHutQuadtree.ts:36`)은 위치 AABB(`+1e-6` 여유)에서 정사각형 경계를 파생하고, 용량을 보장(`BarnesHutQuadtree.ts:531` 64에서 두 배, `count*4+4` 휴리스틱)하며 각 점을 삽입(`BarnesHutQuadtree.ts:437` `insert`, 같은 점에 대한 `MAX_DEPTH=40` 라인 1 보호, 잎은 연결 목록 `pointHead→pointNext` 보관). `finalize()`(`BarnesHutQuadtree.ts:485`)는 역순(자식이 부모보다 먼저, 상향 할당)으로 노드를 순회하며 `charge`와 `centerX/Y`를 질량 가중 평균으로 누적한다; `total>0` 보호(`BarnesHutQuadtree.ts:507`)는 `charge<=0 skip` 불변과 쌍을 이룬다 — 음의 전하는 두 가지를 모두 재고해야 함.

`force()`(`BarnesHutQuadtree.ts:69`)는 반복적 스택 탐색(`BarnesHutQuadtree.ts:87` `ensureStack`)이며, 사전 테스트용 `distanceToCellSquared`(`BarnesHutQuadtree.ts:632`)와 정확한 근사 테스트 `BarnesHutQuadtree.ts:117`를 사용한다.

### 5.2 계층 충돌 그리드

`applyGridCollisions`(`BarnesHutQuadtree.ts:172`)는 충돌이 반발과 다른 공간 쿼리이므로 존재한다(단거리 중첩, 장거리 필드 아님). 핵심 아이디어:

- **계층 할당** (`BarnesHutQuadtree.ts:206` `tier = floor(log2(radius))`, `BarnesHutQuadtree.ts:267` 셀 `4*2^tier`) — 균일 반경은 단일 계층으로 붕괴되어 이전 `2·maxRadius` 그리드처럼 작동; `cellSize < r_i+r_j`(`BarnesHutQuadtree.ts:198`) 제한은 3×3 프로브가 각 중첩을 찾도록 보장한다.
- **반경 0 센티넬** (`BarnesHutQuadtree.ts:5` `ZERO_TIER = -0x40000000`, `BarnesHutQuadtree.ts:222` 버킷) — 반경 0 점은 그리드가 없지만 더 높은 계층에 대해 시작자로 충돌한다.
- **계층별 카운팅 정렬** (`BarnesHutQuadtree.ts:240` `collisionOrderOffsets`의 접두사 합, `BarnesHutQuadtree.ts:248` 커서로 채우기) — O(N)이며 범위 안전: 오프셋 테이블은 점 수가 아닌 계층 범위로 크기가 정해진다(`f32` 반경이 약 280개의 2의 거듭제곱 범위(`BarnesHutQuadtree.ts:237` 주석, `BarnesHutQuadtree.ts:587` `ensureCollisionOffsets`)를 갖기 때문).
- **중복 제거 3×3 프로브** (`BarnesHutQuadtree.ts:349` `probeCollisionCell`) — 9개 슬롯, `imul(cellX,73856093)^imul(cellY,19349663)`(`BarnesHutQuadtree.ts:596`) 해시, 선형 프로브, `BarnesHutQuadtree.ts:372`에서 중복 셀 필터, 유일 쌍 규칙(`sameTier && target<=source` `BarnesHutQuadtree.ts:390`에서 건너뜀; 계층 간에는 건너뜀 필요 없음 — 각 더 높은 계층 쌍은 더 낮은 시작자에 의해 정확히 한 번 방문됨).
- **공유 인식 충격** (`BarnesHutQuadtree.ts:406` `pinned?0:otherPinned?1:0.5`) — 스프링 공유를 반영하되 두 자유 상태일 때 절반으로 클램프(d3-force는 반경 제곱 가중 공유 사용; `entry.ts:745` 주석이 비교 주의사항 표시).

3D 옥트리(`VectoForceLayout.ts:402`)는 이 구조를 3D로 반영한다: `BarnesHutOctree.build`는 AABB를 입방화하고, `insert`는 동일한 `depth < 40` 보호와 일치점에 대한 결정적 `jitterFor`(`VectoForceLayout.ts:561`)를 가지며, `finalizeMass`는 상향으로, `force`는 `size² < theta²*d²`와 동일점 건너뜀(`VectoForceLayout.ts:726`) 대신 거리 0 건너뜀 — 다른 일치점이 지터로 분리되고 여전히 힘을 행사해야 함.

## 6. 핀, 재가열, 결정성

**핀은 축별, ID 지향이다.** `ForceLayout2D`는 `NodeId`로 핀(`ForceLayout2D.ts:393` `pinNode(id,x,y)`, `ForceLayout2D.ts:413` `setNodePin({x?,y?})`, `ForceLayout2D.ts:436` `clearNodePin`)하여 `fixedX/Y` + `pinnedX/Y`(`ForceLayout2D.ts:53`)를 저장한다; graph3d의 `GraphLayout`은 인덱스로 핀(`GraphLayout.ts:46` `pinNode(nodeIndex,x,y,z)`, `VectoForceLayout.ts:337` `fx/fy/fz = NaN` 센티넬 대 `D3ForceLayout.ts:122` `fx/fy/fz = null`). 차이는 `ForceLayout2D.ts:387`에 문서화되어 있다 — 스택을 교차할 때 번역하라. `GraphNode`(`types.ts:12`)의 초기 `fx/fy`는 `ForceLayout2D.ts:619` `addNode`에서 사전 핀으로 존중된다.

**재가열은 알파를 올리지만 절대 내리지 않는다**(`ForceLayout2D.ts:450` `alpha = max(alpha, requested)`, `VectoForceLayout.ts:359` 동일, `D3ForceLayout.ts:150` `alpha = max(alphaMin, min(1,alpha))`). 각 토폴로지 변경은 한 번 재가열(`ForceLayout2D.ts:199`, `ForceLayout2D.ts:252`, `ForceLayout2D.ts:308`, `ForceLayout2D.ts:361` 조건부) — 호출자가 기억할 필요가 없다. 지식 그래프 경로는 `KnowledgeGraphSession.ts:117`에서 `VectoForceLayout({theta:0.9})`를 구축하고 `KnowledgeGraphModel.ts:285` `layout?.reheat?.(0.5)`에서 `rebuildGraph` 후 명시적으로 재가열하며, 이는 다시 `KnowledgeGraphModel.ts:356`에서 `layout?.setGraph`을 호출한다.

**결정성**은 삼중이다: `mulberry32`(`ForceLayout2D.ts:613` `radius=10*sqrt(i+1), angle=rand()*2π` / `VectoForceLayout.ts:143` `r=10*cbrt(i+1)` 구형)로 시드된 나선형 배치, `(source,target,seed)`에서 해시된 `deterministicAngle`(`ForceLayout2D.ts:878`)과 `collisionPairAngle`(`BarnesHutQuadtree.ts:618` 시드)을 통한 일치점의 결정적 각도, JS와 Rust 사이 동일한 부동 소수점 선택(위 `Math.hypot` 함정).

**냉각**은 `alphaDecay = 0.0228`(`≈ 1-0.001^(1/300)`, d3-force-3d 기본과 동일, `VectoForceLayout.ts:32` 주석)와 `alphaMin = 0.001`을 사용한다; `step()`은 `alpha >= alphaMin`을 "아직 뜨거움"(`ForceLayout2D.ts:375`)으로 반환하며 `GraphLayout` 계약(`GraphLayout.ts:26` 문서)과 일치한다. 해제되지 않은 `alpha=0`은 절대 냉각되지 않는다 — 구성 시 보호.

## 7. 3D 패밀리와 지식 그래프 소비자

### 7.1 VectoForceLayout 대 D3ForceLayout

둘 다 `GraphLayout`(`GraphLayout.ts:12` — 평면 `Float32Array` XYZ 삼중, `GraphData.nodes` 순서, 워커로 전송 가능, 호스트 주도 `step()`)을 구현한다. 차이점:

- **모델:** `VectoForceLayout`(`VectoForceLayout.ts:50`)는 새로운 모델 — 옥트리 Barnes-Hut(`VectoForceLayout.ts:402`)를 통한 반발, 링크 스프링, 중심화, 속도 감쇠, 알파 냉각 — 결정적이고 의존성 없음. `D3ForceLayout`(`D3ForceLayout.ts:25`)는 `forceSimulation(…,3).force('link', forceLink).force('charge', forceManyBody).force('center', forceCenter)`(`D3ForceLayout.ts:88`)의 d3-force-3d 어댑터로, `3d-force-graph`의 느낌을 유지한다.
- **상태 속성:** `VectoForceLayout`은 SoA `positions/vx/vy/vz/fx/fy/fz/linkA/B`(`VectoForceLayout.ts:87`)를 유지하고 호출자 노드를 절대 변경하지 않는다; `D3ForceLayout`는 d3가 이를 변경하므로 `simNodes: SimulationNode[]`(`D3ForceLayout.ts:71`)로 복제한다.
- **핀:** `fx/fy/fz` 기반 NaN 대 `null` 센티넬; `VectoForceLayout.tick`은 통합 전 클램프(`VectoForceLayout.ts:308`), d3의 `fx`는 틱 내에서 동일하게 처리.
- **알파:** `VectoForceLayout.reheat`는 `alphaMin` 바닥과 `1` 천장(`VectoForceLayout.ts:361`); `D3ForceLayout.reheat`는 `simulation.alpha()` 직접 쓰기(`D3ForceLayout.ts:151`).

`FixedZLayout`(`knowledge-graph/src/FixedZLayout.ts:10`)는 `VectoForceLayout`을 감싸고 내부 단계 후 각 `z`를 상수로 고정하여 3D 레이아웃이 2D 지식 그래프 보기를 엔진 교체 없이 구동하도록 한다. `KnowledgeGraphSession`(`knowledge-graph/src/KnowledgeGraphSession.ts:59` 문서 "세션은 반영만")은 `VectoForceLayout({theta:0.9})`(`:117`)를 구축하고 `setGraph`/`reheat`를 `KnowledgeGraphModel`에 위임한다.

### 7.2 KnowledgeGraphModel — 증분 소비자

`KnowledgeGraphModel`(`knowledge-graph/src/KnowledgeGraphModel.ts:62`)는 물질화된 절단(`entities`, `facts`, `factKeys`, `expansions`)을 소유하며 단일 `GraphLayout`(`KnowledgeGraphModel.ts:43` 문서: `rebuildGraph`당 하나의 `setGraph`, `expand`당 하나의 `reheat`)의 **유일한 드라이버**다. `expand(id)`(`KnowledgeGraphModel.ts:127`)에서 `KgDataSource.getNeighbors`를 `AbortSignal`(`KnowledgeGraphModel.ts:148` 공유 약속 중복 제거, `KnowledgeGraphModel.ts:150` `cancelExpand`)로 취소하며 페이지하고, 엔티티/사실을 수집하고, 사실 _배치_ 수(순 새가 아님, 중첩된 이웃이 진행을 차단하지 않도록 — `KnowledgeGraphModel.ts:273` 주석)로 `loaded`를 진행시키며, `rebuildGraph()`(`KnowledgeGraphModel.ts:332` 위치 캡처, 안정된 `entityOrder`로 병합, 새 노드를 `lastPositions`에서 시드, `GraphData` 작성, `layout?.setGraph` 호출), 재가열(`KnowledgeGraphModel.ts:285`), `ExpansionState`(`KnowledgeGraphModel.ts:7`) 등록을 수행한다. `dispose()`(`KnowledgeGraphModel.ts:225`)는 의도적으로 대여된 레이아웃을 처리하지 않는다 — 세션이 여전히 공유할 수 있다.

### 7.3 WASM — 보이지 않는 힘 커널

`crates/vectojs-force-rs`(`crates/vectojs-force-rs/Cargo.toml:6` "보이지 않는 백엔드; TypeScript 경로는 영구적 대체")는 Rust에서 `BarnesHutOctree`를 반영한다: `Octree`(`lib.rs:47`), `jitter_for`(`lib.rs:83`), `build`/`insert`/`place_child`/`finalize_mass`/`force`(`lib.rs:194` / `lib.rs:401`), `force_init`/`force_pos`/`force_accel`/`force_step`(`lib.rs:457` / `lib.rs:484` / `lib.rs:491` / `lib.rs:503`) 내보내기와 `STATUS_OK/CAPACITY/UNINITIALIZED/OVERFLOW`(`lib.rs:31`). 범위는 오직 빌드 + 힘 축적(`lib.rs:10` 주석 — 3D 틱의 78–90%가 이 단계, `VectoForceLayout.ts:240` 단계 분할) — 링크 스프링, 중심화, 통합은 JS 틱에 남아 비용이 `Float32Array.set` 수집과 `Float64Array` 읽기-복귀로 틱당 한 번만 든다.

로더(`packages/graph3d/src/wasm/force-backend.ts:42` `ForceBackend`)는 `arrayBuffer`(`force-backend.ts:104` `instantiateStreaming`)로 대체하는 스트리밍 가져오기, `ensure`/`force_init`(`force-backend.ts:52`)을 통한 성장, `step`에서 수집 + `force_step` + 오래된 뷰 새로고침(`force-backend.ts:65` + `force-backend.ts:37` `viewsStale` — 옥트리가 단계 중간에 선형 메모리 성장을 할 수 있어 뷰를 분리)을 수행한다. 어떤 지점의 실패는 `null`을 반환하고 호출자는 JS 옥트리(`VectoForceLayout.ts:106` / `VectoForceLayout.ts:246` `this.tree.build` + `this.tree.force`로 대체; 자산 URL은 `packages/graph3d/src/wasm/asset.ts:22` `forceWasmUrl`를 통해 `new URL('./vectojs_force.wasm', import.meta.url)`로 — 번들러에 안전한 유일한 방법)를 유지한다. `.wasm`은 gitignored이며 `tsup.config.ts:40`에서 `vectojs_core-rs`와 정확히 동일하게 `dist/wasm/`으로 복사된다.

비트 동일 파리티는 협상 불가: Rust 트리는 동일한 질량 중심 `f64`와 반발 적분 `f64`를 JS 트리와 정확히 계산해야 한다(위치와 속도는 양쪽에서 `f32`로 유지). `VectoForceLayout.ts:58`는 명시: "미래 Rust/WASM 커널은 `f64` 축적을 정확히 재현해야 한다." 테스트는 차이 테스트로 두 경로를 비트로 비교(`packages/graph3d/test/VectoForceLayout.wasm.test.ts:6` 스트리밍/동기 활성화 및 `VectoForceLayout.ts:618`의 복사 간격).

빌드는 boss 08과 동일한 함정: `crates/vectojs-force-rs/build.sh`는 `RUSTFLAGS="-C target-cpu=generic -C target-feature=+simd128 -C linker=rust-lld"`를 사용; 순수 `cargo build --target wasm32-unknown-unknown`은 호스트의 `~/.cargo/config.toml`에서 플래그를 필터링하고 링크를 깨뜨린다.

## 8. 벤치마크 방법론 — 인용 가능한 것

`benchmarks/graph-layout/entry.ts:1` 헤더가 권위다. 오직 `benchmarks/run-browsers.sh`(`benchmarks/run-browsers.sh:4`에서 `bun runner/cli.ts`를 감싸는 래퍼)가 인용 가능한 숫자를 생성한다 — 전용 Hyprland 워크스페이스, 집중된 창, 실제 GPU를 가진 **실제 브라우저로 보이는 창**을 구동한다(워크스페이스 `AGENTS.md`의 벤치마크 계약). `benchmarks/debug-page.ts`와 `scripts/benchmark.ts`는 헤드리스(`--disable-gpu`) — 회귀 트립와이어와 디버깅 도구, 인용이 아니다.

### 8.1 행렬, 예산, 안정화 의미

**예산 기본값**(CTX-0517, 2026-08-26 — `entry.ts:4`):

- `COUNTS = 100,1000,3000` (`entry.ts:48` — 500이 1000의 로그 인접으로 제거됨; 3000은 기준 `#559`으로 유지)
- `TICKS = 30` 틱당 정기 샘플 30회 (`entry.ts:49`)
- `TRIALS = 3` (`entry.ts:50` — 기준 `#559` 프로토콜; `run-browsers.sh --iterations`를 통한 스위트 수준 반복)
- `SETTLE_CAP = 120` (`entry.ts:51` — 추가 후 첫 120 틱, 자연 안정화 ~285–300 틱이 아님; `settleCappedTrials == TRIALS`는 설계상, 2026-08-25 스윕에 따름)
- `APPEND_NODES = 50` (`entry.ts:57`), `WARMUP_TICKS = 5` (`entry.ts:58`), `POST_TOPOLOGY_ALPHA = 1` (`entry.ts:59`)

**이전 기본값**(`counts 100,500,1000,3000 × 2 워크로드 × 4 조합 × 6 시도 × 500 제한`)은 각 안정 틱이 `setTimeout(0)`과 ~4ms 타이머 클램프(`entry.ts:301` `yieldToPaint`)를 지불하고 안정화가 ~300 틱까지 실행되어 엔진당 >1500초를 예상했으며 — 이제 헤드리스 엔벨롭당 ~150초(`entry.ts:25`).

**워크로드**는 `star-hub`와 `mixed-sparse`(`entry.ts:61`)이며, 그래프는 `entry.ts:226` / `entry.ts:252`(쌓임 방지 `sqrt` 나선 시드 위치)에서 구성되고 추가 페이로드는 `entry.ts:252`(복사된 사전 구성된 `entry.ts:346` `prepareAppendPayloads` — 복사가 `appendGraph`를 선호하지 않도록)로 추가된다.

**조합**은 4가지(`entry.ts:599`):

| 조합              | 차원 | 구현               | `appendMode`       | 구성                                                                                                                                                                                                                           |
| ----------------- | ---- | ------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `d3-force-3d`     | 3    | `D3ForceLayout`    | `setGraph-rebuild` | `new D3ForceLayout()`                                                                                                                                                                                                          |
| `vecto-force`     | 3    | `VectoForceLayout` | `setGraph-rebuild` | `new VectoForceLayout()`                                                                                                                                                                                                       |
| `d3-force-2d`     | 2    | d3-force 페이지 내 | `appendGraph`      | `entry.ts:78`의 `D3Force2DLayout`(charge `300`, `distanceMax 450`, `theta 0.9`, collide `radius+14`)                                                                                                                           |
| `force-layout-2d` | 2    | `ForceLayout2D`    | `appendGraph`      | `new ForceLayout2D({repulsion: charge, collisionRadius: radius+14, linkDistance 접근기, linkStrength 0.42, center 0.016, velocityDecay 0.64, alphaDecay 0.024, repulsionDistanceMax 450, theta 0.9, seed 7})` (`entry.ts:625`) |

조합 순서는 `(workloadIndex, countIndex)`(`entry.ts:647` `rotatedArms`)로 결정적으로 회전하므로 엔진/에이전트 순서가 카운트를 편향시키지 않는다.

### 8.2 측정 내용

각 조합/워크로드/카운트당 세 가지 관찰값, 모두 `performance.now()` 이후 `setTimeout(0)` 제한으로 긴 작업이 병합되지 않도록(`entry.ts:330` `PerformanceObserver 'longtask'`를 통한 `captureLongTasks`):

- **`benchTicks`** (`entry.ts:501`) — 새로 재가열된 그래프에서 `step()`의 `TICKS` 정기 호출: `median/p95/max` (`entry.ts:292` `_shared/stats.ts`의 `median`/`percentile`를 통한 `summarize`).
- **`benchAppend`** (`entry.ts:526`) — 오직 토폴로지 변경(복제된 사전 구성된 `entry.ts:346` `prepareAppendPayloads`로 복사가 `appendGraph`를 선호하지 않도록); 각 첫 틱 후 추가 및 각 안정 루프(`entry.ts:559`) 전에 `reheat(POST_TOPOLOGY_ALPHA)` 명시적. `append` 중앙값/p95, `firstTick` 중앙값/p95, 최대 `SETTLE_CAP` 틱까지의 `settleTotal` 중앙값/p95, `settleTicks` 중앙값/p95, `settleCappedTrials`, 최대 `step()` 개별(`entry.ts:679`)인 `maxStepMs` 반환.
- **`observeLiveAppendMemory`** (`entry.ts:398`) — 즉시 읽기 전/후, 페이로드 생성과 삭제 외부(`entry.ts:415` 주석)로 유지된 라이브 전용 따뜻한 레이아웃. `performance.measureUserAgentSpecificMemory`(`entry.ts:444`, `UA_MEMORY_TIMEOUT_MS = 1250` `entry.ts:55`로 `entry.ts:353` `readUaMemoryWithTimeout`를 통해 제한) 선호; 단일 타임아웃 실패는 이후 실행에서 UA 읽기를 비활성화(`entry.ts:454` `uaMemoryDisabledReason`); 힙 대체(`performance.memory.usedJSHeapSize` `entry.ts:465`)로 전체 관찰 재시도. 두 관찰 모두 **노이즈 있는 관찰**이며 보존된 메모리나 백엔드 선택의 증거가 아니다(`entry.ts:740` 주의사항). 지원되지 않으면 `status: 'unsupported'`와 이유를 보고한다.

또한 보고: `longTaskMaxDurationMs`는 `longtask` 캡처(`entry.ts:678`)로, `longtask` 구간이 `[started,ended]` 측정을 덮을 때만 카운트(`entry.ts:326` `include`).

### 8.3 창 계약

2026-08-02 측정, 패널은 Hyprland `eDP-1 2560x1600` 스케일 1.6에서 240Hz. 세 가지 속도 함정이 어떤 수치도 무음으로 무효화한다: Chrome이 집중되지 않으면 ~60Hz로 떨어짐, Firefox는 `layout.frame_rate`이 필요하고 기본이 60Hz이므로 집중되어도(수동 Firefox는 4배 잘못됨), 정확히 250인 `refreshHz`는 240Hz 패널의 중앙값 아티팩트다. 하네스(`benchmarks/_shared/server.ts`, `runner.ts`, `loaf.ts`)는 `validateEnvironment`, 기아 감지, 실행 간 집계, 호스트 커밋 + CPU/GPU/드라이버(페이지는 볼 수 없음)를 전달한다. 각 벤치마크는 오직 `entry.ts` + 3줄 `build.ts`(`benchmarks/graph-layout/build.ts:11`이 `_shared/build.ts`로 위임)만 가진다; 서버/번들러는 `_shared/`에서 공존 — 복제하지 않는다.

**새로고침 속도를 절대 하드코딩하지 마라** — `calibrateRefreshRate()`을 호출하고 프레임당 수치와 함께 `refreshHz`를 보고하라. 두 엔진을 인용하라(V8와 SpiderMonkey가 상당히 발산).

### 8.4 참조 스냅샷

**기준 전체 N=7** 500 노드(`benchmarks/graph-layout/README.md:44`, 실행 `20260820T135641Z-1a6d54`, Chrome `240.04 Hz` / Firefox `240.64 Hz`)는 예산 창으로 전체 반복된 마지막 전체 행렬이다(1000과 3000 노드 전체 행렬은 `entry.ts` 기본값으로 시간이 소진됨 — `README.md:11` 및 `README.md:28` 참조). 대표 안정 중앙값(500 노드, `TICKS 30`, `TRIALS 1`, `SETTLE_CAP 500`, 두 워크로드)은 그 README에 있다; 위의 축소된 예산 기본값이 비용에 대체(~150초 엔진당)된다. 결과는 `benchmarks/graph-layout/results/`(gitignored) 아래 유지하고 실행을 러너 이력 ID로 식별하라, 줄을 복사하지 말고.

## 9. d3-force에서의 이전, 상호작용과 제거

**d3-force**(`d3-force`/`d3-force-3d`)에서 `ForceLayout2D`/`VectoForceLayout`로의 이전은 이름 변경이 아니다. `benchmarks/graph-layout/entry.ts:745`의 벤치 주의사항이 부하를 견딘다: "2D 행 … 다른 힘 법칙을 비교: `ForceLayout2D`는 역제곱 반발과 자유/자유 같은 충돌 공유를 사용하고; `d3-force`는 역거리 반발과 반경 제곱 가중 충돌 공유를 사용한다. 비율을 구현 수준 작업 부하 비교로 처리하라, 동등한 방정식의 커널 측정이 아니다."

번역할 구체적 차이:

- **반발 법칙:** `ForceLayout2D`는 `-charge / d³ * (dx,dy)`(`BarnesHutQuadtree.ts:134` `factor = -charge*invD/d²`), 즉 힘 크기에서 역제곱; d3의 `forceManyBody`는 역거리(`strength / d`). 절대 수는 비교 불가 — `repulsion`/`chargeStrength`를 복사하지 않고 재조정하라.
- **절단 의미:** `ForceLayout2D`는 집합된 중심의 `_집합_`에 대해 `repulsionDistanceMax`를 테스트(`BarnesHutQuadtree.ts:98` `nearestDistanceSquared` + 사전 테스트 `maxDistanceSquared`)하며 d3의 many-body 절단과 일치한다; `theta: 0`에서는 절단이 점별 정확(`types.ts:59` 문서). `Infinity`/비유한이 이를 비활성화 — `0`이 `BarnesHutQuadtree.ts:77` 조기 반환으로 무음 비활성화하므로 `finiteOr`(`ForceLayout2D.ts:91`)이 비양수를 `Infinity`로 매핑한다.
- **링크 정체성:** `ForceLayout2D`는 `linkIdentity`(`ForceLayout2D.ts:826`)를 통해 `(source,target,id)` 지향으로 중복 제거하고 매달린/자체 링크에서 예외를 던진 후 변경한다; d3는 원시 문자열 ID를 링크 객체에 유지하고 편집기의 `duplicate-link` 보호는 더 엄격하다(`ForceLayout2D.ts:387` 발산 주석). 지속된 그래프를 이전할 때 먼저 `id` 필드를 정규화하라.
- **핀 주소 지정:** §6에서 다룸 — `ForceLayout2D`는 `NodeId`로, graph3d는 인덱스로. 2D에서 `removeNodes` 후 인덱스를 재해결하는 드래그-투-핀 핸들러.
- **Theta:** 범위와 효과는 동일 — `0` = 정확한 O(N²), 높음 = 더 빠름/덜 정확(`types.ts:57`, `VectoForceLayout.ts:28`). 기본 `0.9`는 스택 간 유사하게 느껴지도록 조정되었지만 쿼드트리와 옥트리 사이 비트 동일은 아니다.

**상호작용과 가시성**은 물리 틱 밖이지만 규모에서 비용이 크다. `packages/graph3d/src/GraphInteraction.ts:1`(`GraphInteraction`)은 Three.js 광선기를 `nodeIndex`로 매핑하여 호버/선택/드래그-투-핀을 처리하고 일반적인 호버 디바운스를 수행한다; `Graph3D.ts:1`(`Graph3D`)은 인스턴싱으로 렌더링하고 오프스크린 제거를 수행한다. 어느 것도 레이아웃을 대체하지 않는다 — `step()` 이후 `positions`를 소비한다. 3000 노드에서는 레이아웃이 아닌 렌더러가 프레임당 병목(`benchmarks/graph3d-frame/entry.ts:1` 프레임 비용 대 `benchmarks/graph-layout/entry.ts:1` 물리 행렬 — 두 하네스를 별도로 유지하라)이 되는 경우가 많다. 캔버스(`Three.js` 아님) 호스트 `Scene`의 경우 `packages/core/src/tree/Scene.ts:1`의 제거가 동일한 작업을 수행한다; graph-layout 자체는 절대 제거하지 않는다.

## 10. 조정과 함정

핀은 스택별로 다르다(`ForceLayout2D`는 ID로, graph3d는 인덱스로 — `ForceLayout2D.ts:387`); 이전 시 번역하라. `repulsionDistanceMax = 0`은 반발을 완전히 비활성화(`BarnesHutQuadtree.ts:77` 조기 반환) — 비유한이 의도된 "무제한"(`ForceLayout2D.ts:91`). `alphaDecay = 0`은 `0.0228`로 대체되거나 안정 루프가 절대 끝나지 않는다(`ForceLayout2D.ts:95`). 비유한이거나 호스트에서 필터링된 `RUSTFLAGS`는 WASM 빌드나 비트 동일 파리티를 깨뜨린다(`fma`는 튜닝된 CPU, `crates/vectojs-force-rs/build.sh:8`); `just wasm`을 사용하라. 레벨 범위 크기 버그(`BarnesHutQuadtree.ts:237`) — 점 수가 아닌 레벨 범위로 오프셋 테이블 크기 — `f32` 반경이 ~280개의 2의 거듭제곱 수준을 가질 때 카운팅 정렬 증가를 무음으로 떨어뜨린다. `force_init` 후 뷰 분리(`force-backend.ts:37` `viewsStale`)는 각 `force_step` 후 타입 배열 뷰를 다시 검증해야 한다.

조사 중 발견된 추가 광산:

- **2D에서 음의 반발이 클램프됨, 지원 안 됨.** `ForceLayout2D`는 `repulsion`을 `>=0`(`ForceLayout2D.ts:629`/`ForceLayout2D.ts:761`)으로 클램프하고 `BarnesHutQuadtree.ts:109`는 `charge<=0` 하위 트리를 건너뜀 — `finalize` 보호(`BarnesHutQuadtree.ts:507`)는 음의 전하에 대해 잘못된 질량 중심을 배치한다. d3의 음의 전하(매력)는 여기서 동등하지 않음; 두 보호를 모두 검토한 후 허용하라.
- **링크 `id` 대 엔드포인트 주소 지정.** `removeLinks`는 `LinkId`가 나타날 때만 `linksByIdKey` 맵을 지연 구성(`ForceLayout2D.ts:270`)하며, 이전 `O(items×L)` 항목별 스캔을 대체한다. 저장된 `id`와 다른 `GraphLink` 객체 전체를 전달하면 일치하지 않음 — 정체성은 객체 정체성이 아닌 직렬화된 삼중이다.
- **`positions` 뷰 별칭.** `refreshPositionView`는 동일한 `ArrayBuffer`(`ForceLayout2D.ts:749`)의 `subarray`를 반환한다. `ensureNodeCapacity`나 `removeNodes`(`ForceLayout2D.ts:857`에서 버퍼 `resize`)를 가로지르는 참조를 유지하면 길이 0의 분리된 뷰가 남는다. 각 변경 후 `layout.positions`를 다시 읽으라.
- **`forge/baselines/graph-layout*`이 아직 없음.** `benchmarks/graph-layout/results/`는 gitignored이며 `forge/baselines/graph-layout.json`이 체크인되지 않음 — §8의 모든 주장은 인용 호스트에서 다시 측정되어야 한다. `benchmarks/graph-layout/README.md:44`의 500 노드 N=7 발견은 호스트 특정 스냅샷이지 이동 가능한 기준이 아니다.
- **`crates/vectojs-force-rs`는 정확히 하나의 빌드 아티팩트만.** `build.sh`는 `packages/graph3d/src/wasm/vectojs_force.wasm`을 방출하고 `tsup`이 `dist/wasm/`로 복사(`packages/graph3d/tsup.config.ts:40`). 세 번째 소비자가 나타날 때까지(`force-backend.ts:12` `DEC-0081`) 두 번째 크레이트나 공유 WASM 패키지가 없음 — 로컬로 유지하라.
- **차이 오라클 규율.** 3D `VectoForceLayout` + JS 옥트리는 영구 오라클; `crates/vectojs-force-rs/src/lib.rs:1`의 Rust 커널은 `f64` 축적에서 비트 동일해야 한다(`f32` 위치는 양쪽에서 유지). `VectoForceLayout.ts:606`, `BarnesHutQuadtree.ts:610`, `lib.rs:83`에서 `jitter_for`/`jitterFor`/`mulberry32`를 grep하라 — 한 쪽 변경이 다른 쪽에 착지하지 않으면 차이 실패다. `measurePhases`(`VectoForceLayout.ts:45`)는 프로파일링이 비활성화된 상태에서 핫 경로가 아무것도 지불하지 않도록 오라클을 측정 가능하게 유지한다.

새 힘을 추가할 때 먼저 JS 오라클(`VectoForceLayout.ts:232`의 `tick` 구조)을 작성하고, 연산 순서와 `Math.min/Math.max`의 NaN 의미를 유지(`BarnesHutQuadtree.ts:632` `distanceToCellSquared`의 전체 순서 주석 참조)한 후 WASM 경로를 `measurePhases`(`VectoForceLayout.ts:45` 선택 `tickPhases: [octree, force, link, integrate]` 벽-ms) 뒤에 조건부로 두어 프로파일링이 비활성화된 상태에서 핫 경로가 아무것도 지불하지 않도록 하라.

## 11. 테스트, 차이 오라클과 실제로 깨진 것

세 테스트 스위트가 2D 쪽(`packages/graph-layout/test/BarnesHutQuadtree.test.ts:1` 쿼드트리 근사 대 정확, `packages/graph-layout/test/ForceLayout2D.test.ts:1` `setGraph`/`appendGraph`/`removeNodes`/`removeLinks`/`updateLinks`/핀/알파, `packages/graph-layout/test/ForceLayout2D.linkMutations.test.ts:1` 중복/정도 편향/링크 공유)을 다룬다. 3D 쪽은 `packages/graph3d/test/VectoForceLayout.wasm.test.ts:1`(JS 대 WASM 비트 파리티: 스트리밍, 동기, `VectoForceLayout.wasm.test.ts:123` `file:///nonexistent` → `false`에서 잘못된 URL 대체)을 추가한다.

무엇이 보호되고 전에 실제로 물린 것 — 검토 체크리스트로 읽어라:

- **구성 전 정리.** `positionStorage`에 남겨진 `NaN` 위치는 쿼드트리 경계(`minX = NaN` → `size = NaN`)를 오염시킨다. `ForceLayout2D.ts:752` `toF32`+핀 덮어쓰기의 `sanitizeState`는 이것이 한 번 발생했기 때문에 존재한다 — 호출자가 제공한 파괴된 JSON에서 `x: NaN`이 생겼다. 그 루프를 절대 제거하지 마라.
- **거리 0 바닥.** `BarnesHutQuadtree.ts:132`/`BarnesHutQuadtree.ts:154`와 `VectoForceLayout.ts:727`의 `1e-6` 바닥이 없으면 같은 셀의 두 일치점이 `factor = -m/0 = ±Infinity` → 이후 모든 틱에 감염되는 `NaN` 속도를 만든다. `BarnesHutQuadtree.ts:610`/`ForceLayout2D.ts:878`의 결정적 각도는 밀기를 반복 가능하게 한다.
- **고정 공유 누수.** 핀된 엔드포인트(`ForceLayout2D.ts:846` / `BarnesHutQuadtree.ts:406`의 `springShare` 대체 `0` 또는 `1`)가 고정되면 `springShare` 대체를 잊으면 고정된 노드가 다른 엔드포인트의 속도에 의해 끌려간다. 이력: 초기 3D 핀이 흔들린 것은 링크 스프링이 여전히 고정된 좌표를 통합했기 때문이다.
- **알파가 최소에 도달하지 않음.** `alphaDecay: 0`을 전달하면 `alpha`가 영원히 `1`로 유지되어 호스트의 `while(layout.step())` 루프가 절대 끝나지 않았다. `ForceLayout2D.ts:95` / `VectoForceLayout.ts:117`의 `0` → `0.0228` 매핑 보호는 실제로 계산된 옵션이 `0`을 생성한 사건 이후 존재한다.
- **메모리 관찰 오해.** `entry.ts:398`의 `liveAppendMemoryObservation` 수치는 GC 노이즈가 있는 전체 에이전트 관찰(`entry.ts:449` 주의사항)이다; 백엔드별 보존 힙으로 잘못 인용하는 것이 그래프 벤치마크에서 가장 흔한 잘못된 인용이다. 실행은 타임아웃 후 UA 특정 읽기를 비활성화(`entry.ts:454`)하고 `usedJSHeapSize`로 재시도한다 — 한 소스에서 다른 소스로 중간에 변경된 실행을 변경하지 않은 것과 비교하는 것은 유효하지 않다.

검토자를 위한 복잡성 요약:

| 단계              | 2D                                                    | 3D                                | 위치                                                  |
| ----------------- | ----------------------------------------------------- | --------------------------------- | ----------------------------------------------------- |
| 트리 구성         | O(N log N) 쿼드트리                                   | O(N log N) 옥트리                 | `BarnesHutQuadtree.ts:36` / `VectoForceLayout.ts:414` |
| 반발              | 평균 O(N log N), `theta=0`에서 최악 O(N²)             | 동일                              | `ForceLayout2D.ts:484` / `VectoForceLayout.ts:259`    |
| 링크              | O(L)                                                  | O(L)                              | `ForceLayout2D.ts:499` / `VectoForceLayout.ts:274`    |
| 충돌              | 계층 그리드로 평균 O(N); 계층 없고 반경 편향 시 O(N²) | —                                 | `BarnesHutQuadtree.ts:172`                            |
| 레이아웃당 메모리 | ~6×N f32 + 링크 + 트리 ~4N 노드                       | ~7×N f32 + 링크 + 옥트리 ~8N 노드 | `ForceLayout2D.ts:672` / `VectoForceLayout.ts:445`    |

## 12. 재현성 — 인용 가능한 명령

```bash
# WASM 힘 커널 빌드(WASM 경로 전 필수):
just wasm                         # 또는 crates/vectojs-force-rs/build.sh
# 선택: JS 오라클만 확인(Rust 불필요):
just test-pkg graph-layout && just test-pkg graph3d

# 보이는 창 물리 행렬 — 인용 가능한 경로(Hyprland + Chrome/Firefox 필요):
./benchmarks/run-browsers.sh graph-layout 8272 --viewport 1280x720 \
  --param counts=100,1000,3000 --param ticks=30 --param trials=3 \
  --param settleCap=120 chrome firefox
# 전체 수렴 변형(이전 500 틱 안정 재현, 명시적 예산):
./benchmarks/run-browsers.sh graph-layout 8273 --viewport 1280x720 \
  --param counts=100,500,1000,3000 --param ticks=30 --param trials=6 \
  --param settleCap=500 chrome firefox   # >1500초 예상 — 예산에 맞게

# 3D 프레임 비용(렌더러, 물리 아님 — 혼동하지 말 것):
./benchmarks/run-browsers.sh graph3d-frame 8274 --viewport 1280x720 chrome firefox
```
