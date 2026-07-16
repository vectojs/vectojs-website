---
title: '@vectojs/devtools'
description: '인-페이지 Virtual Math Tree 인스펙터 — 엔터티 선택, 라이브 트리 뷰, 변환 판독값, 키보드 미세 이동 편집 — 자체가 VectoJS로 렌더링됩니다.'
order: 48
---

# `@vectojs/devtools`

문서화된 버전: **0.4.2**

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

- **라이브 트리 뷰** — `scene.rootEntity`와 `scene.overlayRootEntity`의 트리 뷰, 간격(기본값 500ms)으로 새로고침. 각 행은 엔터티의 생성자 이름, 위치, 크기 및 두 개의 배지를 표시: **⚡**(`interactive`) 및 **▶**(`hasPendingAnimations()`).
- **선택 모드**: **Pick**을 클릭한 다음 페이지의 아무 곳이나 클릭. 인스펙터는 Scene이 포인터 입력에 사용하는 것과 동일한 탐색 순서(장식용, 비-대화형 엔터티의 경우 AABB 폴백과 함께)를 사용하여 해당 지점 아래의 가장 깊은 엔터티로 클릭을 해결합니다.
- **선택 강조**: 선택된 엔터티의 세계-공간 경계 상자가 _호스트_ Scene의 오버레이 레이어에 외곽선으로 그려져, 라이브 렌더링을 기준으로 정확히 무엇이 선택되었는지 볼 수 있습니다.
- **상태 판독값**: 지오메트리, 스케일/회전/불투명도, 전체 세계 변환 행렬 및 애니메이션 상태를 일반 텍스트로 — 스크린샷이 직접 제공할 수 없는 숫자들.
- **키보드 미세 이동 편집**: 엔터티가 선택된 상태에서 화살표 키가 1px씩 이동(Shift: 10px); `+`/`-`가 불투명도를 0.1씩 조정. 코드를 건드리기 전에 레이아웃 버그가 _어느_ 엔터티에 속하는지 확인하는 데 유용합니다.

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

## 저수준 모델 유틸리티

트리 구축 및 선택 로직은 내장 패널 대신 커스텀 인스펙터 UI를 구축하려는 경우 별도로 내보내집니다:

```typescript
import { buildTreeModel, findEntityAt, describeEntity, pickInScene } from '@vectojs/devtools';

buildTreeModel(root: Entity): { nodes: TreeNode[]; index: Map<string, Entity> };
findEntityAt(root: Entity, x: number, y: number): Entity | null; // scene-공간 포인트 → 엔터티
describeEntity(entity: Entity): string[]; // 사람이 읽을 수 있는 상태 라인
pickInScene(scene: Scene, sceneX: number, sceneY: number): Entity | null; // 오버레이-우선 선택
```

## 디자인 노트

- 패널 Scene은 `contentProjection: false` 및 `renderMode: 'onDemand'`로 구성됩니다 — 자체 DOM 콘텐츠를 투영하거나 유휴 상태에서 매 프레임 다시 칠하지 않아야 합니다.
- 선택 상태는 패널에 있으며 호스트가 아닙니다: `select()`/`armPick()`은 강조 오버레이 엔터티를 제외하고 검사된 Scene을 절대 변경하지 않으며, 이는 `showOverlay()`를 통해 추가되고 `destroy()`에서 제거됩니다.
- 자동 새로고침은 일반 간격이지 Scene 애니메이션이 아닙니다 — 호스트 Scene이 완전히 유휴(`onDemand`, 더티 없음)인 경우에도 작동합니다.
