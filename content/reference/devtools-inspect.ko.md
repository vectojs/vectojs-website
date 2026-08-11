+++
title = "Devtools: 검사"
description = "VectoJS 씬을 데이터로 읽기 — 트리 모델, 엔티티 피킹, 엔티티/a11y/텍스트 상태, 하이라이트 지오메트리, 히트 테스트 설명, 이벤트 라우팅 트레이스."
weight = 49

[extra]
order = 49
+++

# Devtools: 검사

여기에 있는 모든 것은 `@vectojs/devtools/headless`에서의 순수한 읽기입니다. 패널을 마운트하는 것은 없으며, document 리스너를 붙이는 `EventTrace` 한 가지 예외를 제외하고는, 해체할 필요가 있는 것도 없습니다.

```ts
import { inspectEntity, pickInScene } from '@vectojs/devtools/headless';
```

---

## 트리 모델과 피킹

```typescript
function buildTreeModel(root: Entity): {
  nodes: DevtoolsTreeNode[];
  index: Map<string, Entity>;
};
function findEntityAt(root: Entity, x: number, y: number): Entity | null;
function pickInScene(scene: Scene, sceneX: number, sceneY: number): Entity | null;
function describeEntity(entity: Entity): string[];

interface DevtoolsTreeNode {
  id: string;
  label: string;
  children?: DevtoolsTreeNode[];
}
```

`buildTreeModel`은 루트 자체가 아니라 루트의 **자식들**을 반환합니다 — `nodes`는 각 직계 자식마다 하나의 항목이며, 각자는 자신의 하위 트리를 가집니다. 반대로 `index` 맵은 엔티티 id를 키로 하여 모든 깊이의 모든 하위 항목을 담고 있는데, 이것이 id를 다시 라이브 엔티티로 왕복시킬 수 있게 해주는 이유입니다. 리프에서 `children`은 `[]`이 아니라 `undefined`입니다.

`label`은 `` `${type} (${x},${y}) ${W}×${H} ⚡ ▶` `` 입니다 — 두 차원 모두 0이면 크기는 생략되며, 두 배지는 각각 `interactive` 및 `hasPendingAnimations()`일 때만 나타납니다.

`pickInScene`은 "이 픽셀을 소유한 엔티티가 어떤 것이지?"라는 질문에 원하는 함수입니다. **오버레이 트리를 먼저** 확인한 다음 메인 트리를 확인하므로, 열린 모달이 그 뒤의 콘텐츠보다 올바르게 우선합니다. `findEntityAt`은 그 밑에 있는 단일 트리 프리미티브입니다: 자식을 역순으로, 가장 깊은 것부터 탐색하므로 가장 위에 칠해진 히트를 반환하고, `isPointInside`가 아니라고 말할 때 AABB 검사로 폴백합니다 — 이는 장식용·비대화형 엔티티도 여전히 피킹 가능함을 의미합니다.

> [!IMPORTANT]
> `findEntityAt`은 전달한 엔티티와 그 하위 항목을 모두 검사하므로, 씬 루트를 넘기면 그 루트가 반환될 수 있습니다. `pickInScene`이 더 안전한 기본값입니다.

`describeEntity`은 사람이 읽을 수 있는 줄을 반환합니다: 일반 엔티티 상태의 고정된 여섯 줄, 그 다음에 엔티티가 게시하는 모든 `getDevtoolsDescriptor()` 출력이며, 최대 12줄의 디스크립터 줄로 제한됩니다. 필드 값은 32자, 메모는 60자에서 잘립니다. 던지는(throw) 디스크립터는 판독을 중단하는 대신 `— descriptor threw —` 줄을 기여합니다.

> [!NOTE]
> devtools 모델 레이어 전체에서 `type`은 `entity.constructor.name`이며, 미니파이어가 이를 이름을 바꿀 수 있습니다. 디버깅 레이블로 취급하고, 안정적인 키로 절대 취급하지 마세요 — 그리고 프로덕션 분기 조건으로도 절대 사용하지 마세요.

---

## 엔티티 상태

```typescript
function inspectEntity(entity: Entity): EntityInfo;
function entityPath(entity: Entity): string;
function textPreviewOf(entity: Entity): string | undefined;

interface EntityInfo {
  id: string;
  type: string;
  path: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  worldTransform: {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
  };
  worldBounds: Bounds;
  interactive: boolean;
  animating: boolean;
  clipChildren: boolean;
  childCount: number;
  text?: string;
  a11y?: { tag?: string; role?: string; label?: string };
  descriptor?: DevtoolsDescriptor;
  layoutControlled?: ReadonlyArray<LayoutControlledProperty>;
}
```

`inspectEntity`은 `describeEntity`의 구조화되고 JSON-안전한 형제입니다. 모든 숫자는 소수점 2자리로 반올림됩니다. 네 개의 선택 필드는 **`undefined`로 설정되는 것이 아니라 생략**되므로, `'text' in info`가 "텍스트 없음"과 "빈 텍스트"를 구분합니다 — 텍스트가 실제로 `''`인 엔티티는 `text: ''`로 보고합니다.

`layoutControlled`은 부모 레이아웃 컨테이너가 소유한 속성을 명명합니다. 애플리케이션 코드에서 그 중 하나에 쓰는 것은 버그입니다: 다음 레이아웃 패스가 그것을 덮어씁니다. `x`에 대한 미세 이동이나 애니메이션이 계속 되돌아간다면, 그 이유가 바로 이 필드입니다.

`entityPath`은 조상 체인을 `Scene > Card#a1b2c3d4 > Text#e5f6a7b8`로 렌더링하며, id는 8자로 잘립니다. 버그 리포트에서 인용할 식별자로, `id`가 그러하지 못하는 동안에도 실행 간에 살아남기 때문입니다.

> [!IMPORTANT]
> `entityPath`은 부모가 없는 엔티티를 `Scene`으로 표시하므로, **분리된(detached)** 엔티티는 실제 루트와 구분할 수 없습니다. 경로가 의심스럽게 짧아 보이면 엔티티가 여전히 트리에 있는지 확인하세요.

`textPreviewOf`은 `.text`를 duck-타이핑한 다음 `.value`를 확인하고, 80자에 줄임표가 더해져 잘립니다. `EntityInfo.text`와 a11y 이름 폴백을 공급하는 것이므로, 긴 문자열은 전체가 아닌 미리보기로 그곳에 도달합니다.

---

## 접근성 상태

```typescript
function inspectA11y(scene: Scene, entity: Entity): A11yInfo;
function a11yReadingOrder(scene: Scene): A11yInfo[];

interface A11yInfo {
  entityId: string;
  entityPath: string;
  projected: boolean;
  tag?: string;
  role?: string;
  accessibleName?: string;
  nameSource?: 'label' | 'text' | 'none';
  tabIndex?: number;
  disabled?: boolean;
  focused?: boolean;
  readingOrder?: number;
  canvasBounds: Bounds;
  domBounds?: Bounds;
}
```

`inspectA11y`은 항상 레코드를 반환하며, 절대 `null`이 아닙니다 — 투영되지 않은 엔티티는 `projected: false`와 약간의 정보만 보고합니다. "스크린 리더가 이걸 왜 알려주지 않지?"라는 질문에 답하는 함수이며, 대개 그 답을 주는 두 필드는 `accessibleName`과 `nameSource`입니다.

`nameSource`은 `'none'`을 포함해 항상 존재합니다. 해석 순서는 `label`, 그 다음 텍스트 미리보기, 그 다음 아무것도 없음입니다. 텍스트 경로가 `textPreviewOf`을 거치므로, 긴 텍스트에서 파생된 이름은 **80자에서 잘려** 도착합니다 — 알려지는 문자열은 전체 텍스트이므로, 긴 콘텐츠에 대해 `accessibleName`을 정확한 기준으로 읽지 마세요.

`readingOrder`은 형제 인덱스가 아니라 DOM 순서의 전체 투영 레이어에 걸친 1-기반 인덱스입니다. `a11yReadingOrder`은 이를 기준으로 정렬된 모든 투영 엔티티를 반환하며, 이것이 스크린 리더가 탐색할 순서입니다. 투영되지만 DOM 쿼리에는 없는 엔티티는 끝으로 정렬됩니다.

`canvasBounds`은 캔버스가 엔티티를 그리는 위치이고, `domBounds`은 그 투영된 미러가 실제로 놓인 위치입니다. **그 사이의 간격이 결함입니다** — 스크린 리더의 포커스 링이나 클릭 대상이 픽셀과 다른 곳에 있다는 뜻입니다. 요소가 없거나 사각형이 모두 0이면 `domBounds`은 생략됩니다.

---

## 텍스트와 셰이핑

```typescript
function inspectText(entity: Entity): TextInspection | null;
function shapeProbe(
  text: string,
  options?: {
    font?: string;
    cellWidth?: number;
    lineHeight?: number;
    baseline?: number;
  },
): TextInspection;
function formatTextInspection(inspection: TextInspection): PluginRow[];
function isTextEntity(entity: Entity): boolean;
```

`inspectText`은 엔티티가 `.text`도 `.value`도 지니지 않을 때만 `null`을 반환합니다. 그 외에는 해석된 bidi 레벨, 레벨 실행, 반전 세그먼트, 시각적 순서, 자소 클러스터, 그리고 글리프별 세부 정보를 얻습니다 — "이 아랍어 문자열이 왜 잘못된 순서로 있지" 또는 "이 글리프가 왜 빈 상자이지" 뒤에 있는 데이터입니다.

글리프별 세부 정보는 세 등급 중 하나로 도착하며, 등급이 어떤 필드가 존재하는지를 결정합니다:

| 등급                 | `glyphs[].x` | `metrics` / `lines` | `atlasMiss`   |
| -------------------- | ------------ | ------------------- | ------------- |
| 준비된 콘텐츠 그리드 | 예           | 예                  | 설정되지 않음 |
| 준비된 텍스트        | 아니요       | 아니요              | 예            |
| 둘 다 아님           | 글리프 없음  | 아니요              | 아니요        |

`unavailable` 배열은 보고할 수 없었던 모든 기능과 그 이유를 명명하므로, 누락된 필드는 조용히 부재하기보다 항상 설명됩니다. 항상 최소 세 개의 항목을 담습니다 — 글리프 id, 스크립트 실행, 글꼴 폴백 스팬은 엔진에 의해 전혀 노출되지 않습니다.

`shapeProbe`은 엔티티도 씬도 없이 동일한 파이프라인으로 임의의 문자열을 실행하므로, 단위 테스트에서 셰이핑 질문을 확인하는 가장 빠른 방법입니다. 항상 위치가 포함된 완전한 검사를 반환합니다.

> [!NOTE]
> 클러스터 경계는 엔진이 아니라 devtools가 `Intl.Segmenter`를 사용해 재세그먼트하므로, `Intl.Segmenter`가 없는 런타임에서는 코드-포인트 반복으로 폴백되어 결합 문자와 깃발 이모지에서 잘못됩니다. 클러스터 수를 신뢰하기 전에 엔진 출력과 비교하세요.

---

## 하이라이트 지오메트리

```typescript
function highlightGeometry(
  scene: Scene,
  entity: Entity,
  options?: HighlightGeometryOptions,
): HighlightLayer[];
function sampleHitRegion(
  entity: Entity,
  options?: { step?: number; budget?: number },
): HighlightLayer;
function formatHighlightGeometry(layers: ReadonlyArray<HighlightLayer>): string[];

type HighlightLayerKind = 'aabb' | 'layout' | 'render' | 'clip' | 'content' | 'a11y' | 'hit';

interface HighlightLayer {
  kind: HighlightLayerKind;
  polygons: ReadonlyArray<HighlightPolygon>;
  divergesFromLayout?: boolean;
  unavailable?: string;
}

interface HighlightGeometryOptions {
  layers?: ReadonlyArray<HighlightLayerKind>;
  hitSampleStep?: number;
  hitSampleBudget?: number;
}
```

하나의 엔티티는 최대 일곱 개의 서로 다른 박스를 가지며, 레이아웃 버그는 그 사이의 간격에 살고 있습니다:

| 종류      | 의미                                                |
| --------- | --------------------------------------------------- |
| `aabb`    | 변환된 레이아웃 쿼드의 축-정렬 경계 박스.           |
| `layout`  | 회전과 스큐를 포함한 실제 쿼드. 기준점.             |
| `render`  | `getBounds()` — 엔티티가 실제로 칠하는 위치.        |
| `clip`    | 가장 가까운 `clipChildren` 조상의 박스.             |
| `content` | 선택 가능한 DOM 콘텐츠 미러의 박스.                 |
| `a11y`    | a11y 투영 요소의 박스.                              |
| `hit`     | `isPointInside`를 프로빙해 샘플링한 실제 히트 영역. |

어느 레이어의 `divergesFromLayout`이 바로 그 신호입니다 — 그 박스가 레이아웃 쿼드와 1픽셀 이상 다르다는 뜻이며, 이는 정확히 클릭이 사용자가 겨냥하지 않은 곳에 떨어지게 만드는 조건입니다. 발산하는 `render` 레이어는 박스 밖에 칠하는 콘텐츠이고, `content` 또는 `a11y` 발산은 잘못 배치된 선택 또는 포커스 대상입니다.

`highlightGeometry`은 절대 던지지 않습니다. 계산할 수 없는 레이어는 이유가 설정된 `unavailable`과 폴리곤 없이 돌아오므로, 일반적인 엔티티의 `render`는 `getBounds() returned null, so the layout box is the render box`로 읽힙니다. 출력은 요청한 순서와 무관하게 항상 위의 고정 순서입니다.

`'hit'`은 유일하게 비용이 많이 드는 것이므로 기본 레이어 집합에 **있지 않습니다**. 그리드에서 `isPointInside`를 샘플링합니다 — 기본 스텝 8 씬 단위, 기본 예산 4096 프로브 — 그리고 각 연속 가로 실행마다 하나의 사각형을 반환합니다. 예산을 초과하면 매달리기보다는 샘플링을 거부하고 그렇게 알립니다:

```ts
// An inscribed circle: same extent as its box, ~79% of its area.
const hit = sampleHitRegion(circle, { step: 4 });
hit.divergesFromLayout; // true — coverage is below 90% of the box
```

`'hit'`의 발산은 **범위가 아니라 면적 커버리지**로 결정되며, 이는 정확히 사각형 안의 원이 등록되도록 하기 위함입니다. 고정 스텝에 대한 비용은 엔티티 크기에 2차적입니다: `step`을 절반으로 나누면 프로브 수가 4배가 되므로, 200×100 엔티티에 2px 스텝은 ~5100 프로브가 필요하며 실행되기 전에 높인 `hitSampleBudget`을 부여해야 합니다.

---

## 히트 테스트 설명

```typescript
function explainHitTest(scene: Scene, x: number, y: number): HitExplanation;
function formatHitExplanation(explanation: HitExplanation): string[];

type HitVerdict =
  'accepted' | 'invisible' | 'clipped' | 'pointer-transparent' | 'outside-shape' | 'occluded';

interface HitCandidate {
  entityId: string;
  entityPath: string;
  type: string;
  verdict: HitVerdict;
  reason: string;
  depth: number;
  worldBounds: Bounds;
  clipperId?: string;
  clipperPath?: string;
}

interface HitExplanation {
  x: number;
  y: number;
  hitId: string | null;
  hitPath?: string;
  candidates: HitCandidate[];
  root: 'overlay' | 'main' | 'none';
}
```

`pickInScene`은 어떤 엔티티가 이겼는지 알려줍니다. `explainHitTest`은 **다른 모든 엔티티가 왜 졌는지**를 알려주며, 답이 잘못되었을 때 필요한 것이 바로 그것입니다. 각 후보는 평결(verdict)과 한 문장 분량의 이유를 담습니다:

```ts
const why = explainHitTest(scene, 50, 50);
console.log(formatHitExplanation(why).join('\n'));
// hit test (50, 50) → Scene > Box#entity_d > Box#entity_k [main]
// ✗ OverlayRoot — point (50, 50) is outside its shape
//   ✗ Box — point (50, 50) is outside its shape
//     ✓ Box — inside its shape, unclipped, and accepts pointer input
//     · Box — would have been hit, but Box is drawn on top
```

글리프는 `✓` 수락됨, `·` 폐색됨, `✗` 그 외의 모든 것, 들여쓰기는 후보의 깊이입니다 — 6레벨로 제한되므로 더 깊은 트리는 시각적으로 평평해집니다. 줄은 경로가 아니라 `type`(생성자 이름)을 담으며, 형제 엔티티는 보통 같은 타입을 공유합니다: 하나를 정확히 식별해야 한다면 `explanation.candidates[i].entityPath`을 읽으세요.

후보는 엔진이 고려하는 것과 같은 순서인 최상위-우선으로 정렬됩니다. `occluded`는 후-패스에서 할당된다는 점에 유의하세요: 지점을 수락했을 것이지만 승자 아래에 있는 엔티티는 `accepted`에서 `occluded`로 다시 쓰입니다. 따라서 "이 픽셀 아래에 몇 개가 있지"는 그것들을 세어 답할 수 있습니다.

`invisible` 평결(`opacity <= 0`)은 **하위 트리를 가지치기(prune)합니다** — 이유가 얼마나 많은 하위 항목이 건너뛰어졌는지 명명하므로, 보이지 않는 전체 가지가 수십 개가 아니라 하나의 후보로 보고됩니다.

> [!IMPORTANT]
> 이것은 프레임별 호출이 아니라 진단입니다. 엔진이 첫 히트에서 반환하는 반면, `explainHitTest`은 패자를 열거하기 위해 전체 트리를 탐색합니다. 또한 항상 JS 탐색을 미러링하므로, WASM 히트 그리드를 사용하는 씬에서는 두 가지가 한 엣지 케이스에서 다를 수 있습니다: 크기가 0인 `clipChildren` 조상은 `clipped`로 설명되는 반면 WASM 경로는 히트를 등록합니다.

---

## 이벤트 라우팅 트레이스

```typescript
function createEventTrace(scene: Scene, options?: EventTraceOptions): EventTrace;

class EventTrace {
  get entries(): readonly EventTraceEntry[];
  subscribe(listener: (entry: EventTraceEntry) => void): () => void;
  clear(): void;
  destroy(): void;
}

interface EventTraceOptions {
  capacity?: number; // retained records, default 50
  includeGlobalKeyboard?: boolean; // default true
}

type EventTraceType =
  'pointerdown' | 'pointerup' | 'pointercancel' | 'pointermove' | 'wheel' | 'keydown' | 'keyup';

type EventTraceSource = 'a11y' | 'content' | 'canvas' | 'document';
```

```ts
const trace = createEventTrace(scene, { capacity: 100 });
trace.subscribe((entry) => {
  console.log(entry.source, entry.targetPath, entry.defaultPrevented);
});
```

각 항목은 해석된 대상 엔티티, 씬 및 로컬 좌표, 수정자 키, 그리고 최종 `defaultPrevented`를 기록합니다. `source`는 브라우저 이벤트가 도착한 표면을 말합니다: `canvas`, `a11y` 투영, 선택 가능한 `content` 미러, 또는 전역 키보드용 `document`입니다.

레코드는 **마이크로태스크에서 확정**되므로, `defaultPrevented`는 디스패치 중간 값이 아니라 애플리케이션의 최종 단축키 또는 선택 결정을 반영합니다. 실무적 결과는 이벤트를 디스패치한 직후 `entries`가 비어 있다는 것입니다 — 테스트는 어서션 전에 매크로태스크를 대기해야 합니다.

포인터 트레이스는 `pointercancel`을 포함하므로, 중단된 드래그 및 선택 트랜잭션이 `pointerdown` 뒤에 진단 공백을 남기는 대신 보이게 만듭니다. `pointerdown` → 이동 → 정확히 하나의 `pointerup`(커밋) **또는** `pointercancel`(롤백)을 기대하세요; 종결 항목이 없으면 엔티티가 전혀 투영되지 않았거나 캡처가 우회되었음을 의미합니다.

> [!IMPORTANT]
> `EventTrace`는 14개의 document 리스너를 붙이며, 모델 레이어에서 **반드시** 해체해야 하는 유일한 객체입니다. 진단 표면이 마운트 해제될 때 `trace.destroy()`를 호출하세요. 또한 `entries`는 복사본이 아니라 라이브 내부 배열을 반환한다는 점에 유의하세요 — 레코드가 도착하고 용량에서 축출됨에 따라 당신 아래에서 변이되므로, 안정적인 뷰가 필요하면 복사하세요.

브라우저 밖에서는 생성자가 아무것도 붙이지 않고 인스턴스는 비활성(inert)이므로, 공유 테스트 헬퍼가 조건 없이 하나를 구성할 수 있습니다.

---

## 디버깅-워크플로우

| 증상                                          | 워크플로우                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| "어떤 엔티티가 이 픽셀을 소유하지?"           | `pickInScene(scene, x, y)` → `inspectEntity(hit)`                                                                            |
| "잘못된 엔티티가 이 픽셀을 소유한다"          | `explainHitTest(scene, x, y)` — 진 이유와 함께 모든 패자                                                                     |
| "왜 이 엔티티의 위치/크기가 잘못되었지?"      | 세계 경계와 변환을 위한 `inspectEntity`, 그런 다음 `entityPath`를 위로 탐색 — 경계가 잘못된 첫 조상이 버그를 소유함          |
| "`x`에 대한 내 쓰기가 계속 되돌려진다"        | `inspectEntity(e).layoutControlled` — 부모 컨테이너가 그 속성을 소유함                                                       |
| "클릭 대상이 시각적 요소와 어긋나 있다"       | `highlightGeometry(scene, e)` 그리고 `a11y` 또는 `content`의 `divergesFromLayout` 찾기                                       |
| "이 도형의 클릭 가능 영역이 잘못되었다"       | `sampleHitRegion(e)` — 박스가 아닌 실제 히트 영역                                                                            |
| "스크린 리더가 아무것도/잘못된 것을 알려준다" | `accessibleName` + `nameSource`를 위한 `inspectA11y(scene, e)`; 알림 순서용 `a11yReadingOrder(scene)`                        |
| "이 텍스트가 잘못된 순서로 렌더링된다"        | `inspectText(e)` — bidi 레벨, 레벨 실행, 시각적 순서                                                                         |
| "글리프가 빈 상자로 렌더링된다"               | `inspectText(e).glyphs` — `atlasMiss`로 표시된 항목                                                                          |
| "클릭/휠/키프레스가 잘못된 곳으로 간다"       | `createEventTrace(scene)` — 소스, 대상 경로, 좌표, 최종 `defaultPrevented`                                                   |
| "텍스트 드래그-선택 또는 복사가 가로채진다"   | `entry.source === 'content'`인 이벤트 트레이스 — 이벤트가 선택 가능한 투영에서 시작됨                                        |
| "드래그가 멈춘다/절대 커밋되지 않는다"        | 포인터 트레이스는 트랜잭션적입니다: `pointerup`/`pointercancel`이 없으면 엔티티가 투영되지 않았거나 캡처가 우회되었음을 의미 |

---

[Devtools 개요](/reference/devtools/) · [감사](/reference/devtools-audit/) · [성능](/reference/devtools-perf/) · [브리지와 플러그인](/reference/devtools-extend/)
