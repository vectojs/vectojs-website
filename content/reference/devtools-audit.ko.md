+++
title = "Devtools: 감사"
description = "VectoJS 씬이 올바른지 검증하세요 — 구조화된 결과를 반환하는 레이아웃, 접근성, 텍스트 셰이핑, 선택 감사와 회귀 테스트용 스냅샷 및 디프."
weight = 50
+++

# Devtools: 감사

감사는 씬을 순회하며 구조화되고 JSON-safe한 결과를 반환합니다. 각 결과는 단언할 수 있는 CI 게이트입니다:

```typescript
import { auditScene } from '@vectojs/devtools/headless';

expect(auditScene(scene)).toEqual([]);
```

이 패키지의 이 절반이 존재하는 이유가 바로 이것입니다. 스크린샷 테스트는 페이지가 변경되었음을 알려주지만, 감사는 어떤 엔티티가 자신의 컨테이너를 넘치게 하는지, 그리고 어느 가장자리에서 몇 픽셀이 넘치는지 알려줍니다.

| 감사                     | 잡아내는 것                                                                      | 브라우저 필요 |
| ------------------------ | -------------------------------------------------------------------------------- | ------------- |
| `auditScene`             | 넘침, 잘림, 형제 겹침, 뷰포트 이탈                                               | 아니오        |
| `auditA11y`              | 이름 누락, 역할 충돌, 도달할 수 없는 포커스 대상                                 | 아니오        |
| `auditTextShaping`       | 아틀라스에서 누락된 글리프                                                       | 아니오        |
| `auditSceneSelection`    | 캔버스에서 어긋난 텍스트 선택 지오메트리                                         | **예**        |
| `auditGpu`               | 배칭, 오버드로우, 불균형한 save/restore — [성능 참조](/reference/devtools-perf/) | 아니오        |
| `auditAccelerators`      | 인수를 거부하는 WASM 커널 — [성능 참조](/reference/devtools-perf/)               | 아니오        |
| `auditMarkdownStreaming` | 저하되는 스트리밍 재사용 — [성능 참조](/reference/devtools-perf/)                | 아니오        |

---

## 레이아웃 감사

```typescript
function auditScene(scene: Scene, opts?: AuditOptions): AuditFinding[];
function auditTree(root: Entity, sceneBounds: Bounds | null, opts?: AuditOptions): AuditFinding[];

type AuditKind = 'text-overflow' | 'clip-overflow' | 'overlap' | 'viewport-overflow';

interface AuditOptions {
  tolerance?: number; // px slack before an escape/overlap counts. Default 0.5
  includeOverlay?: boolean; // modals/highlights excluded by default
  scrollableTypes?: string[]; // default ['ScrollView','VirtualList','TreeView','Table']
  ignore?: (entity: Entity) => boolean; // prune subtrees
  ignoreOverlap?: (a: Entity, b: Entity) => boolean; // allow intentional stacking
}

interface AuditFinding {
  kind: AuditKind;
  entityId: string;
  entityPath: string;
  worldBounds: Bounds;
  message: string;
  containerId?: string;
  containerPath?: string;
  containerBounds?: Bounds;
  overflow?: { left: number; right: number; top: number; bottom: number };
  otherId?: string;
  otherPath?: string;
  otherBounds?: Bounds;
  intersection?: Bounds;
}
```

```typescript
const findings = auditScene(scene, {
  tolerance: 0.5,
  includeOverlay: false,
  ignore: (e) => e.id.startsWith('debug-'),
  ignoreOverlap: (a, b) => a.id === 'badge',
});
```

네 가지 종류가 감지됩니다:

- `text-overflow` — 텍스트를 담은 엔티티의 측정된 박스가 가장 가까운 크기 지정 조상 밖으로 이탈합니다.
- `clip-overflow` — 콘텐츠가 `clipChildren` 조상 밖으로 이탈하여 픽셀이 잘립니다.
- `overlap` — **형제만 해당**; 부모-자식 포함은 정상입니다.
- `viewport-overflow` — 크기 지정 조상이 없는 엔티티가 캔버스 밖에 그려집니다.

`auditScene`이 진입점이고, `auditTree`는 그것이 호출하는 단일 트리 프리미티브로, `sceneBounds`를 명시적으로 받습니다. 해당 경계에 `null`을 전달하면 이탈할 뷰포트가 없으므로 `viewport-overflow`를 감지할 수 없게 됩니다.

결과는 `kind`, 그다음 `entityPath`, 그다음 `otherPath` 순으로 정렬됩니다 — 실행 간 결정적이므로 스냅샷에 안전합니다.

> [!IMPORTANT]
> `includeOverlay: true`를 사용하면 결과는 **전역 정렬 리스트 하나가 아니라 두 개의 이어 붙은 정렬 실행**입니다: 메인 트리의 결과, 그다음 오버레이의 결과. 단일 패스에서 `kind`별로 그룹화하면 종류가 반복되는 것을 보게 됩니다. 하나의 순서가 필요하면 다시 정렬하세요.

알려진 맹점 — 모두 의도적입니다:

- **스크롤 가능한 컨테이너는 세로 축을 면제합니다.** `ScrollView`보다 긴 콘텐츠는 `ScrollView`의 존재 이유입니다. 가로 이탈은 여전히 보고됩니다. `scrollableTypes`로 유형 목록을 재정의하세요 — 생성자 이름으로 일치하며, 엔티티가 실제로 잘라내기도 해야 합니다.
- **`opacity: 0`은 하위 트리 전체를 가지치기합니다.** 의도적으로 숨긴 콘텐츠는 레이아웃 결함이 아닙니다.
- **`viewport-overflow`는 크기 지정 조상이 전혀 필요 없습니다.** 크기 지정되고 잘라내지 않는 조상 하나가 있으면, 그 조상이 의미 있는 컨테이너라는 이유로 억제됩니다.
- **겹침은 직접 형제끼리만 비교합니다.** 가지를 넘어서는 절대 비교하지 않으며, 교차 영역이 _두_ 축 모두에서 `tolerance`를 초과해야 합니다.
- `Input`은 텍스트와 같은 것으로 간주됩니다. 텍스트 유사성은 읽을 수 있는 텍스트의 존재 여부로 덕 타이핑되기 때문입니다.

> [!NOTE]
> `worldBounds`는 `kind`에 따라 두 가지 다른 의미를 갖습니다. 넘침 종류는 렌더 범위(`getWorldBounds()`)를 보고하고, `overlap`은 선언된 레이아웃 사각형을 보고합니다. 따라서 박스 밖에 칠하는 엔티티는 두 종류에서 서로 다른 숫자로 나타납니다 — 의도적입니다. 겹침은 레이아웃 질문이고 넘침은 페인팅 질문이기 때문입니다.

---

## 접근성 감사

```typescript
function auditA11y(scene: Scene, opts?: A11yAuditOptions): A11yFinding[];

type A11yAuditKind =
  | 'no-accessible-name'
  | 'role-tag-conflict'
  | 'disabled-divergence'
  | 'focusable-but-clipped'
  | 'duplicate-label';

interface A11yAuditOptions {
  includeOverlay?: boolean; // default: included
  tolerance?: number; // px slack for the clipping check. Default 0.5
  skip?: ReadonlyArray<A11yAuditKind>;
}

interface A11yFinding {
  kind: A11yAuditKind;
  entityId: string;
  entityPath: string;
  message: string;
  otherId?: string;
  otherPath?: string;
  containerId?: string;
  containerPath?: string;
}
```

- `no-accessible-name` — 역할이 이름을 요구하거나 엔티티가 `interactive`인데 이름이 없는 포커스 가능 엔티티. 가장 흔한 실제 결함: "button"이라고만 발표되고 그 외에는 아무것도 없는 아이콘 버튼.
- `role-tag-conflict` — 태그의 암시적 역할과 모순되는 명시적 `role`. 예: `tag: 'button'`인데 `role: 'link'`.
- `disabled-divergence` — 엔티티가 _비활성처럼 보이는데_ 그렇게 _말하지_ 않거나, 그 반대. 흐리게 보이지만 포커스 가능한 것이 함정입니다: 마우스 사용자가 사용 불가능함을 볼 수 있는 것에 키보드 사용자가 탭으로 들어갑니다.
- `focusable-but-clipped` — `clipChildren` 조상의 완전히 바깥에 있는 포커스 가능 엔티티. 탭이 보이지 않는 것에 포커스를 이동시킵니다.
- `duplicate-label` — 접근성 이름을 공유하는 두 엔티티. 두 번째부터 보고되며 `otherId`가 첫 번째를 가리킵니다.

레이아웃 감사와 달리 이 감사는 **기본적으로 오버레이 트리를 포함합니다** — 포커스 트랩이 있는 곳이 바로 모달이기 때문입니다. `a11yHidden`은 하위 트리 전체를 가지치기합니다.

> [!NOTE]
> 결과는 정렬되지 않은 순회 순서이며, 모든 `duplicate-label` 결과는 마지막에 덧붙여집니다. `disabled-divergence`에는 의도적인 불감대도 있습니다: 0.6에서 0.9 사이의 불투명도는 어느 쪽으로도 보고되지 않습니다. 그 범위는 틀렸다기보다 모호하기 때문입니다.

---

## 텍스트 셰이핑 감사

```typescript
function auditTextShaping(scene: Scene): Array<{
  kind: string;
  entityId: string;
  message: string;
  severity: 'info' | 'warn';
}>;
```

`atlas-miss`라는 한 가지 종류를 방출합니다: 글리프가 글꼴 아틀라스에 없는 엔티티 — 그래서 빈 박스로 렌더링되는 것입니다. 메시지는 최대 다섯 개의 서로 다른 누락 글리프를 샘플링합니다.

> [!IMPORTANT]
> 이 감사는 텍스트가 **준비된 텍스트(prepared-text)** 경로를 거친 엔티티만 봅니다. 준비된 콘텐츠 그리드로 검사된 엔티티는 실제로 글리프가 얼마나 많이 누락되었든 절대 `atlas-miss` 결과를 만들 수 없습니다. 그리드 경로가 해당 플래그를 운반하지 않기 때문입니다. 특정 엔티티를 확인하려면 `inspectText(entity).glyphs`를 직접 사용하세요.

`scene.rootEntity`만 순회합니다 — 오버레이 트리는 감사되지 않습니다.

---

## 선택 감사

```typescript
function auditSceneSelection(scene: Scene, opts?: SelectionAuditOptions): SelectionAuditFinding[];
function auditEntitySelection(
  scene: Scene,
  entity: Entity,
  opts?: SelectionAuditOptions,
): SelectionAuditFinding[];

interface SelectionAuditOptions {
  tolerance?: number; // px of left-edge drift allowed. Default 2
  rightTolerance?: number; // defaults to `tolerance`
  entityIds?: string[]; // audit only these entities
}

interface SelectionAuditFinding {
  kind: 'selection-drift';
  entityId: string;
  entityPath: string;
  line: number;
  expectedLeft: number;
  expectedRight: number;
  actualLeft: number;
  actualRight: number;
  leftDrift: number;
  rightDrift: number;
  message: string;
}
```

여기서 "선택"은 **네이티브 브라우저 텍스트 선택**을 의미합니다 — 투명 DOM 콘텐츠 프로젝션 위에서 텍스트를 선택하려고 드래그하는 것. 이 감사는 캔버스가 그리는 기준인 엔티티 자체의 줄 지오메트리를, 브라우저가 강조 표시할 라이브 DOM `Range` 사각형과 비교합니다. 어긋남은 선택 파란색 밴드가 글리프가 아닌 다른 곳에 놓인다는 뜻입니다.

둘 다 엔티티의 로컬 논리 픽셀로 정규화되므로, 검사는 기기 픽셀 비율과 브라우저 줌과 무관합니다. 양끝 정렬 텍스트, RTL/bidi, 분수 DPR 어긋남을 잡아냅니다.

`auditSceneSelection`은 트리를 순회하며 `entityPath` 그다음 `line` 순으로 정렬합니다. `auditEntitySelection`은 엔티티 하나를 검사합니다.

> [!IMPORTANT]
> 이 감사는 실행하면서 **사용자의 현재 텍스트 선택을 지웁니다**, 그리고 실제 브라우저가 필요합니다 — 가드 없이 `document`를 참조하므로 Node나 순수 테스트 러너에서는 `[]`를 반환하는 대신 throw합니다. 단위 테스트가 아닌 브라우저 e2e에 두세요. 또한 오버레이 옵션 없이 `scene.rootEntity`만 순회합니다.

`entityIds`는 _감사될_ 엔티티는 필터링하지만 순회 대상은 필터링하지 않으므로, 필터링된 부모의 자식도 여전히 검사됩니다.

---

## 스냅샷과 디프

```typescript
function captureSnapshot(scene: Scene): SceneSnapshot;
function diffSnapshots(a: SceneSnapshot, b: SceneSnapshot): SnapshotDiff[];

interface SceneSnapshot {
  width: number;
  height: number;
  root: SnapshotNode[];
  overlay: SnapshotNode[];
}

interface SnapshotDiff {
  path: string;
  kind: 'added' | 'removed' | 'changed';
  changes?: Record<string, { from: unknown; to: unknown }>;
}
```

```typescript
const before = captureSnapshot(scene); // deterministic JSON tree
// … perform an interaction …
const diffs = diffSnapshots(before, captureSnapshot(scene));
// -> [{ path: 'root > GridEntity[0]', kind: 'changed', changes: { x: {from,to} } }]
```

스크린샷 대신, 상호작용이 **정확히** 바뀌어야 할 엔티티들만 바꿨는지 단언하세요. 그러면 "페이지가 다르게 보인다"가 "이 엔티티 하나가 움직이면 안 되는데 4px 움직였다"로 바뀝니다.

디프는 **구조적 경로**(`type[index]` 체인)를 키로 삼고 엔티티 id는 절대 사용하지 않습니다. id는 실행마다 무작위이기 때문입니다. `devtoolsKey`를 게시하는 엔티티 — 또는 그것이 없으면 접근성 레이블 — 는 해당 키로 대신 일치하므로, 키가 있는 목록의 순서 변경은 모든 행이 바뀌는 것이 아니라 이동으로 보고됩니다. 키 일치는 레벨 양쪽에서 키가 유일할 때만 적용되며, 충돌 시 레벨은 인덱스 정렬로 폴백합니다.

기본값인 속성은 스냅샷에서 생략되므로 디프는 조용히 유지됩니다.

> [!NOTE]
> 고정된 속성 집합만 비교됩니다: `type`, `x`, `y`, `width`, `height`, `worldBounds`, `opacity`, `interactive`, `animating`, `clipChildren`, `text`. 특히 **`scene.width`/`scene.height` 변경은 디프를 전혀 만들지 않으며**, `id`나 `key` 변경도 보고되지 않습니다. `added`와 `removed`는 재귀하지 않으므로, 삭제된 하위 트리는 자손마다 하나가 아니라 결과 하나입니다.

---

## CI에서 감사 결합하기

모든 감사는 일반 데이터를 반환하는 일반 함수이므로, 게이트 하나로 전체 표면을 단언할 수 있습니다:

```typescript
import { auditA11y, auditScene, auditTextShaping } from '@vectojs/devtools/headless';

test('the scene is structurally sound', () => {
  buildDashboard(scene);
  scene.step(16.67); // let layout settle before asserting

  expect(auditScene(scene, { includeOverlay: true })).toEqual([]);
  expect(auditA11y(scene)).toEqual([]);
  expect(auditTextShaping(scene)).toEqual([]);
});
```

> [!IMPORTANT]
> 씬이 레이아웃되기 전에 감사하면 모든 것이 공허하게 통과합니다. 먼저 `scene.step()`을 최소 한 번 구동하세요 — 빈 씬의 빈 결과 배열은 아무것도 증명하지 못합니다.

---

[Devtools 개요](/reference/devtools/) · [검사](/reference/devtools-inspect/) · [성능](/reference/devtools-perf/) · [브리지와 플러그인](/reference/devtools-extend/)
