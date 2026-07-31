---
title: '@vectojs/devtools'
description: '인-페이지 Virtual Math Tree 인스펙터 — 엔터티 선택, 라이브 트리 뷰, 변환 판독값, 키보드 미세 이동 편집 — 자체가 VectoJS로 렌더링됩니다.'
order: 48
---

# `@vectojs/devtools`

문서화된 버전: **0.4.3**

`@vectojs/devtools`는 "Elements 패널은 어디 있지?"라는 질문에 대한 답입니다 — Virtual Math Tree용 인-페이지 인스펙터로, VectoJS Scene을 픽셀 공간 대신 상태 공간에서 디버깅할 수 있게 합니다. 패널 자체는 VectoJS `Scene`(검사하는 프레임워크를 도그푸딩)이며, 페이지의 오른쪽 가장자리에 도킹됩니다.

## 설치

```bash
bun add -D @vectojs/devtools
```

개발 환경에서만 조건부로 비주얼 패널을 추가하세요 — VectoJS 패널을 마운트하고
`document`를 리스닝하므로 프로덕션 번들에서 제외하세요. 패널 없이도
헤드리스 감사, 스냅샷, 선택, 이벤트 트레이싱을 사용할 수 있습니다:

```ts
import { auditScene, captureSnapshot, createEventTrace } from '@vectojs/devtools/headless';
```

```typescript
import { attachDevtools } from '@vectojs/devtools';

const scene = new Scene(canvas);
// ...Scene 구축...

if (import.meta.env.DEV) {
  const devtools = attachDevtools(scene);
  // devtools.detach()로 나중에 제거
}
```

## 제공 기능

- **라이브 트리 뷰 (`Tree` 탭)** — `scene.rootEntity`와 `scene.overlayRootEntity`의 트리 뷰, 간격(기본값 500ms)으로 새로고침. 각 행은 엔터티의 생성자 이름, 위치, 크기 및 두 개의 배지를 표시: **⚡**(`interactive`) 및 **▶**(`hasPendingAnimations()`).
- **선택 모드**: **Pick**을 클릭한 다음 페이지의 아무 곳이나 클릭. 인스펙터는 Scene이 포인터 입력에 사용하는 것과 동일한 탐색 순서(장식용, 비-대화형 엔터티의 경우 AABB 폴백과 함께)를 사용하여 해당 지점 아래의 가장 깊은 엔터티로 클릭을 해결합니다.
- **선택 강조**: 선택된 엔터티의 세계-공간 경계 상자가 _호스트_ Scene의 오버레이 레이어에 외곽선으로 그려져, 라이브 렌더링을 기준으로 정확히 무엇이 선택되었는지 볼 수 있습니다.
- **상태 판독값 + 인라인 편집 (`Info` 탭)**: 지오메트리, 스케일/회전/불투명도, 전체 세계 변환 행렬 및 애니메이션 상태를 일반 텍스트로 — 스크린샷이 직접 제공할 수 없는 숫자들.
- **키보드 미세 이동 편집**: 엔터티가 선택된 상태에서 화살표 키가 1px씩 이동(Shift: 10px); `+`/`-`가 불투명도를 0.1씩 조정. 코드를 건드리기 전에 레이아웃 버그가 _어느_ 엔터티에 속하는지 확인하는 데 유용합니다.

- **성능 HUD** (0.5.0): 하단 스트립은 [`Scene.frameStats`](/reference/core-scene)를 읽습니다 — fps, ms/프레임, 엔터티 수, 렌더링 모드 및 렌더링/건너뛴 프레임 수. fps는 실제 _렌더링된 프레임_ 케이던스이므로, 유휴 `onDemand` 또는 자동 스로틀 씬(scene)은 가짜 60이 아닌 정직하게 ~2fps로 읽힙니다. `showPerf: false`로 비활성화합니다.
- **설정** (`⚙` 탭, 0.5.0): 선택 하이라이트를 전환하고, 새로 고침 간격 및 도킹 측면(왼쪽/오른쪽)을 실시간으로 전환합니다.
  0.4.3부터 오른쪽에 고정된 dock과 해당 Canvas는 `pointer-events: none`을 사용하며, 투영된 대화형 컨트롤만 포인터 이벤트를 다시 활성화합니다. 따라서 인스펙터는 빈 dock 픽셀 아래의 호스트 컨트롤 입력을 가로채지 않고, VMT 행과 버튼은 계속 클릭할 수 있습니다.

## API

```typescript
function attachDevtools(
  scene: Scene,
  options?: DevtoolsOptions,
): DevtoolsPanel & { detach(): void };

interface DevtoolsOptions {
  width?: number; // 패널 너비 (px), 기본값 320
  refreshInterval?: number; // ms; 0은 자동 새로고침 비활성화
  traceEvents?: boolean; // 제한된 포인터/휠/키보드 라우팅 레코드 표시
  traceCapacity?: number;
}

class DevtoolsPanel {
  refresh(): void; // 호스트 Scene에서 트리 모델 재구축
  armPick(): void; // 일회성: 다음 페이지 클릭이 아래 엔터티 선택
  select(entity: Entity): void; // 프로그래매틱 선택
  get selection(): Entity | null;
  destroy(): void; // 리스너, 타이머, 호스트 강조, 패널 Scene 정리
}
```

`detach()`(`attachDevtools`가 반환)는 `destroy()`의 별칭입니다.

## 이벤트 라우팅 트레이스

```ts
const trace = createEventTrace(scene, { capacity: 100 });
trace.subscribe((entry) => {
  console.log(entry.source, entry.targetPath, entry.defaultPrevented);
});
```

`source`는 `"canvas"`, `"a11y"`, `"content"` 또는 `"document"`입니다.
`content` 소스는 브라우저 이벤트가 선택 가능한 `[data-vecto-content]` 미러에서 시작되었음을 의미합니다.
트레이스는 소유 Entity를 확인하고, scene/로컬 좌표를 기록하며,
마이크로태스크에서 마무리되어 `defaultPrevented`가 애플리케이션의 최종 바로가기 또는 선택 결정을 반영하도록 합니다.
진단 표면이 마운트 해제되면 `trace.destroy()`를 호출하세요. 포인터 트레이스에는
`pointercancel`이 포함되어, 중단된 드래그 및 선택 트랜잭션이 `pointerdown` 후
진단 공백을 남기는 대신 표시됩니다.

## 씬 감사(Audit)

`auditScene`은 트리를 탐색하고 레이아웃 결함을 구조화된 JSON-안전한 결과로 보고합니다 — "무언가가 오버플로우, 오버랩 또는 이스케이프하고 있는가?"에 대한 숫자 답변입니다:

```typescript
import { auditScene } from '@vectojs/devtools/headless';

const findings = auditScene(scene, {
  tolerance: 0.5, // 이스케이프/오버랩으로 간주되기 전 px 여유
  includeOverlay: false, // 모달/강조 표시는 기본적으로 제외
  ignore: (e) => e.id.startsWith('debug-'), // 서브트리 제외
  ignoreOverlap: (a, b) => a.id === 'badge', // 의도적 스태킹 허용
});
// -> AuditFinding[]: { kind, entityId, entityPath, worldBounds, message,
//    containerBounds?, overflow?{left,right,top,bottom}, otherId?, intersection? }
```

4가지 `kind`가 감지되며, 결정론적으로 정렬됩니다:

- `text-overflow` — 텍스트를 포함하는 엔터티의 측정된 박스가 가장 가까운 크기 지정된 조상을 초과합니다.
- `clip-overflow` — 콘텐츠가 `clipChildren` 조상을 초과합니다(픽셀이 잘림).
- `overlap` — **형제만 해당**; 부모-자식 포함 관계는 정상입니다.
- `viewport-overflow` — 크기 지정된 조상이 없는 엔터티가 캔버스 밖에 그려집니다.

알려진 사각지대: 스크롤 가능한 컨테이너는 수직 축을 면제하며(`scrollableTypes`로 목록 재정의 가능, `constructor.name`으로 일치), `opacity: 0` 엔터티는 건너뜁니다.

패널의 **Audit** 버튼은 트리 뷰 대신 동일한 검사를 실행합니다; `panel.audit()`은 결과를 반환하고 `panel.selectFinding(i)`은 하나를 강조 표시합니다.

CI 게이트로 사용: `expect(auditScene(scene)).toEqual([])`.

## 스냅샷 및 차이점(diff)

```typescript
import { captureSnapshot, diffSnapshots } from '@vectojs/devtools/headless';

const before = captureSnapshot(scene); // 결정론적 JSON 트리
// … 상호작용 수행 …
const diffs = diffSnapshots(before, captureSnapshot(scene));
// -> [{ path: "root > GridEntity[0]", kind: "changed", changes: { x: {from,to} } }]
```

차이점은 **구조적 경로**(`type[index]` 체인)를 키로 사용하며, 절대 엔터티 ID를 사용하지 않습니다 — ID는 실행마다 무작위입니다. 기본값 속성은 스냅샷에서 생략되므로 diff가 깔끔하게 유지됩니다. 스냅샷 쌍은 스모크 테스트에서 정확한 golden state 어설션을 가능하게 합니다: 스크린샷 대신, 상호작용이 정확히 의도한 엔터티만 변경했음을 어설션합니다.

## 저수준 모델 유틸리티

트리 구축 및 선택 로직은 내장 패널 대신 커스텀 인스펙터 UI를 구축하려는 경우 별도로 내보내집니다:

```typescript
import {
  buildTreeModel,
  findEntityAt,
  describeEntity,
  inspectEntity,
  entityPath,
  pickInScene,
} from '@vectojs/devtools';

buildTreeModel(root: Entity): { nodes: TreeNode[]; index: Map<string, Entity> };
findEntityAt(root: Entity, x: number, y: number): Entity | null; // scene-공간 포인트 → 엔터티
describeEntity(entity: Entity): string[]; // 사람이 읽을 수 있는 상태 라인
inspectEntity(entity: Entity): EntityInfo; // 구조화된 JSON-안전 상태
entityPath(entity: Entity): string; // 조상 체인 ("Scene > Card#<id> > Text#<id>", ID는 8자로 잘림)
pickInScene(scene: Scene, sceneX: number, sceneY: number): Entity | null; // 오버레이-우선 선택
```

`inspectEntity`는 `describeEntity`의 구조화된 형제입니다: 월드 경계 및 변환, 상호작용 플래그, `clipChildren`, 자식 수, 덕 타이핑된 텍스트 미리보기(`.text`/`.value`), 그리고 존재할 때 a11y 프로젝션 속성. `entityPath`는 엔터티의 조상 체인을 생성합니다(예: `"Scene > Card#<id> > Text#<id>"`, ID는 8자로 잘림).

## 디버깅 워크플로우

devtools 모델 레이어는 레이아웃 질문에 숫자로 답합니다 — 스크린샷을 찍기 전에 사용하세요. 증상 → 도구:

| 증상                                                 | 워크플로우                                                                                                                                                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "어느 엔터티가 이 픽셀을 소유하고 있나요?"           | `pickInScene(scene, x, y)` → `inspectEntity(hit)`; 페이지 내에서는 패널의 **Pick** 버튼                                                                                                                   |
| "이 엔터티의 위치/크기가 왜 잘못되었나요?"           | `inspectEntity`로 월드 경계 + 변환 확인, `entityPath`를 위로 올라가며 — 경계가 잘못된 첫 번째 조상이 버그를 소유                                                                                          |
| "무언가 오버플로우/오버랩되지만 어딘지 모르겠어요"   | `auditScene(scene)` — 각 결과는 `entityPath`, 월드 경계, 가장자리별 오버플로우 양을 포함                                                                                                                  |
| "이 상호작용이 움직이면 안 되는 것을 움직였어요"     | `captureSnapshot` 전, 상호작용 후 `diffSnapshots` — diff는 정확히 무엇이 변경되었는지 나열                                                                                                                |
| "클릭/휠/키프레스가 잘못된 곳으로 전달됩니다"        | `createEventTrace(scene)` — 각 항목은 source(`canvas`/`a11y`/`content`/`document`), 대상 경로, 좌표 및 최종 `defaultPrevented`를 표시                                                                     |
| "텍스트 드래그 선택 또는 복사가 가로채지고 있습니다" | `entry.source === 'content'`인 이벤트 트레이스 — 브라우저 이벤트가 선택 가능한 프로젝션에서 시작되었음을 의미; `defaultPrevented`와 대상 경로 확인                                                        |
| "드래그가 멈추거나 커밋되지 않습니다"                | 포인터 트레이스는 트랜잭션 방식: `pointerdown` → 이동 → 정확히 하나의 `pointerup`(커밋) **또는** `pointercancel`(롤백)을 예상; 종료 항목이 없으면 엔터티가 프로젝션되지 않았거나 캡처가 우회되었음을 의미 |
| "이게 회귀(Regression)인가요?"                       | 정상 Scene의 커밋된 스냅샷(`captureSnapshot`)을 유지하고 CI에서 `diffSnapshots` 실행                                                                                                                      |

## 디자인 노트

- 패널 Scene은 `contentProjection: false` 및 `renderMode: 'onDemand'`로 구성됩니다 — 자체 DOM 콘텐츠를 투영하거나 유휴 상태에서 매 프레임 다시 칠하지 않아야 합니다.
- 선택 상태는 패널에 있으며 호스트가 아닙니다: `select()`/`armPick()`은 강조 오버레이 엔터티를 제외하고 검사된 Scene을 절대 변경하지 않으며, 이는 `showOverlay()`를 통해 추가되고 `destroy()`에서 제거됩니다.
- 자동 새로고침은 일반 간격이지 Scene 애니메이션이 아닙니다 — 호스트 Scene이 완전히 유휴(`onDemand`, 더티 없음)인 경우에도 작동합니다.
- 도크(기본값: `position: fixed; right: 0; width: 320px`, 뷰포트 전체 높이)와 그 캔버스는 `pointer-events: none`이며, 이는 메인 `Scene`의 `a11yRoot`가 옵트아웃하고 개별 대화형 그림자 요소가 `auto`(`@vectojs/devtools@0.6.0+`)로 옵트인하는 방식을 미러링합니다. 이는 도크의 빈 배경/크롬 위의 클릭이 아래에 있는 호스트 콘텐츠로 통과됨을 의미합니다 — 호스트 앱의 오른쪽 가장자리 컨트롤(탭 닫기 버튼, 툴바 버튼)을 포함하며, 그렇지 않으면 도크의 320px 대역 아래에 가려집니다. 패널 자체의 a11y-프로젝션된 컨트롤(버튼, VMT 트리 행)만 자체 `auto` 옵트인을 통해 독립적으로 클릭 가능합니다.
