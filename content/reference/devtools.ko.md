+++
title = "@vectojs/devtools"
description = "인-페이지 Virtual Math Tree 인스펙터와 그 헤드리스 모델 레이어 — 엔티티 피킹, 트리 뷰, 감사, 스냅샷, GPU 및 가속기 읽기, JSON-RPC 브리지."
weight = 48
+++

# `@vectojs/devtools`

문서화된 버전: **0.11.2**

`@vectojs/devtools`는 "Elements 패널은 어디 있지?"라는 질문에 대한 답입니다 — Virtual Math Tree용 인-페이지 인스펙터로, VectoJS Scene을 픽셀 공간 대신 상태 공간에서 디버깅할 수 있게 합니다. 두 부분으로 나뉩니다:

| 부분                                           | 용도                                                                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **패널** (`@vectojs/devtools`)                 | 페이지 내 도크. 그 자체로 VectoJS `Scene`이며, 트리, 엔티티 상태, 감사, a11y, 이벤트 로그, 설정 탭을 갖추고 있습니다. 이 페이지에서 문서화됩니다. |
| **모델 레이어** (`@vectojs/devtools/headless`) | 레이아웃, a11y, 히트 테스트, 텍스트, 성능 질문에 데이터로 답하는 약 60개의 순수 함수. DOM 패널 없음, 테스트, CI, Node, 에이전트에서 사용 가능.    |

모델 레이어가 더 크고 더 유용한 부분입니다. 스크린샷을 찍기 전에 이것을 활용하세요 — 이미지는 무언가 잘못되었다는 것만 알려주지만, 숫자는 _어떤_ 엔티티가 잘못되었는지를 알려줍니다.

| 페이지                                           | 내용                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| [검사](/reference/devtools-inspect/)             | 트리 모델, 피킹, 엔티티/a11y/텍스트 상태, 하이라이트 지오메트리, 히트 테스트 설명, 이벤트 라우팅 트레이스.   |
| [감사](/reference/devtools-audit/)               | 모든 `audit*` 함수 — 레이아웃, a11y, 텍스트 쉐이핑, 선택 드리프트 — 그리고 회귀 어서션용 스냅샷과 차이.      |
| [성능](/reference/devtools-perf/)                | GPU 및 그리기 카운터, WASM 가속기 상태, 더티 리페인트 귀속, Markdown 스트리밍 메트릭.                        |
| [브리지와 플러그인](/reference/devtools-extend/) | 다른 문서에서 씬을 구동하기 위한 JSON-RPC 프로토콜, 그리고 자체 탭과 감사를 추가하기 위한 플러그인 프로토콜. |

---

## 설치

```bash
bun add -D @vectojs/devtools
```

패널은 VectoJS Scene을 마운트하고 `document`를 리스닝하므로, 프로덕션 번들에 포함하지 마세요. `headless` 서브경로에서 모델 레이어를 가져오세요 — 여기에는 패널 코드가 없고 `@vectojs/ui` 의존성이 없습니다:

```ts
import { auditScene, captureSnapshot, inspectEntity } from '@vectojs/devtools/headless';
```

```typescript
import { attachDevtools } from '@vectojs/devtools';

const scene = new Scene(canvas);
// ...씬 구축...

if (import.meta.env.DEV) {
  const devtools = attachDevtools(scene);
  // devtools.detach()로 나중에 제거
}
```

> [!IMPORTANT]
> `@vectojs/devtools/headless` 아래의 모든 것은 패키지 루트에서도 다시 내보내어지므로, 단일 `attachDevtools` 가져오기가 `auditScene` 호출을 막지 않습니다. 서브경로는 프로덕션 테스트 번들이 패널 없이 모델 레이어를 가져올 수 있도록 존재합니다.

---

## 패널이 표시하는 것

헤더에는 3개의 고스트 아이콘 버튼 — **⌖** (선택), **⟳** (새로고침), **⚠** (감사) — 과 3개의 카운트 배지: 총 엔티티 수, 대화형(**⚡**), 그리고 감사 결과(**⚠**)가 있습니다. `Tabs` 막대는 도구를 **Tree · Info · Audit · A11y · Log · ⚙**로 나누며, 등록된 [플러그인 인스펙터](/reference/devtools-extend/#플러그인-프로토콜) 당 하나의 탭을 추가합니다. 하단에는 성능 스트립이 고정되어 있습니다.

- **라이브 트리 뷰** (`Tree`) — `scene.rootEntity`와 `scene.overlayRootEntity`의 트리 뷰, 간격(기본값 500ms)으로 새로고침. 각 행은 엔티티의 생성자 이름, 위치, 크기 및 두 개의 배지를 표시: **⚡** (`interactive`) 및 **▶** (`hasPendingAnimations()`). **filter** 필드는 유형/id 부분 문자열로 행을 좁힙니다; 보기 전용이므로 id→엔티티 인덱스는 여전히 모든 것을 해결합니다. 프로그래매틱: `panel.setFilter(text)`.
- **선택 모드**: **⌖**를 클릭한 다음 페이지의 아무 곳이나 클릭. 인스펙터는 Scene이 포인터 입력에 사용하는 것과 동일한 탐색 순서(그리고 동일한 수용 규칙)를 사용하여 해당 지점 아래의 가장 깊은 엔티티로 클릭을 해결합니다 — 엔진과 정확히 같게, 자신의 형태가 그 점을 수용하는 곳에서만 엔티티를 선택할 수 있으므로, 파티클과 다른 비-대화형 엔티티가 잘못된 소유자가 되는 일은 없습니다.
- **선택 강조**: 선택된 엔티티의 지오메트리가 _호스트_ Scene의 오버레이 레이어에 외곽선으로 그려져, 라이브 렌더링을 기준으로 정확히 무엇이 선택되었는지 볼 수 있습니다. 기본적으로 레이아웃 박스를 그립니다; `panel.setHighlightLayers()`는 이것을 7개의 [지오메트리 레이어](/reference/devtools-inspect/#하이라이트-지오메트리) 중 하나로 전환합니다 — 박스 대신 엔티티의 실제 히트 영역을 샘플링하는 `'hit'`을 포함합니다.
- **상태 판독값 + 인라인 편집** (`Info`): 지오메트리, 스케일/회전/불투명도, 전체 세계 변환 행렬, 애니메이션 상태 및 엔티티가 게시하는 `getDevtoolsDescriptor()` 출력을 일반 텍스트로 표시 — 스크린샷이 직접 제공할 수 없는 숫자들. 인라인 `x`/`y`/`opacity` 편집기와 **Copy path** / **Copy JSON** 버튼을 추가합니다.
- **A11y 탭**: 선택된 엔티티의 프로젝션된 역할, 접근 가능한 이름 및 소스, 탭 인덱스, 읽기 순서 위치, 캔버스 대 DOM 박스 — 더불어 씬 전체 [a11y 감사](/reference/devtools-audit/#접근성-감사) 결과.
- **키보드 미세 이동 편집**: 엔티티가 선택된 상태에서 화살표 키가 1px씩 이동(Shift: 10px); `+`/`-`가 불투명도를 0.1씩 조정. 코드를 건드리기 전에 레이아웃 버그가 _어느_ 엔티티에 속하는지 확인하는 데 유용합니다.
- **성능 HUD**: 하단 스트립은 [`Scene.frameStats`](/reference/core-scene)를 읽습니다 — fps, ms/프레임, 엔티티 수, 렌더링 모드 및 렌더링/건너뛴 프레임 수. fps는 실제 _렌더링된 프레임_ 케이던스이므로, 유휴 `onDemand` 또는 자동 스로틀 씬(scene)은 가짜 60이 아닌 정직하게 ~2fps로 읽힙니다. `showPerf: false`로 비활성화합니다.
- **설정** (`⚙`): 선택 강조를 전환하고, 새로 고침 간격 및 도킹 측면(왼쪽/오른쪽)을 실시간으로 전환합니다.

패널은 창 크기 조정 시 리플로우되므로, 하단 성능 스트립은 뷰포트 높이나 줌 수준에 관계없이 화면에 유지됩니다. 도크와 캔버스는 `pointer-events: none`을 사용합니다; 프로젝션된 대화형 컨트롤만 포인터 이벤트를 다시 활성화합니다 — 따라서 인스펙터는 빈 도크 픽셀 아래의 호스트 컨트롤에서 입력을 가로채지 않으며, 자체 행, 탭, 입력 및 버튼은 계속 클릭할 수 있습니다.

---

## API

```typescript
function attachDevtools(
  scene: Scene,
  options?: DevtoolsOptions,
): DevtoolsPanel & { detach(): void };

interface DevtoolsOptions {
  width?: number; // 패널 너비 (px), 기본값 360
  refreshInterval?: number; // ms; 0은 자동 새로고침 비활성화. 기본값 500
  traceEvents?: boolean; // 제한된 포인터/휠/키보드 라우팅 레코드 표시
  traceCapacity?: number; // 유지되는 트레이스 레코드, 기본값 50
  dockSide?: 'right' | 'left'; // 기본값 'right'
  showPerf?: boolean; // 실시간 성능 HUD 스트립, 기본값 true
  defaultTab?: string; // 'tree' | 'inspect' | 'audit' | 'a11y' | 'events' | 'settings'
}

class DevtoolsPanel {
  refresh(force?: boolean): void; // 호스트 Scene에서 트리 모델 재구축
  armPick(): void; // 일회성: 다음 페이지 클릭이 아래 엔티티 선택
  select(entity: Entity): void; // 프로그래매틱 선택
  get selection(): Entity | null;
  get trace(): EventTrace | null; // traceEvents가 활성화되지 않은 경우 null
  setFilter(text: string): void; // 유형/id 부분 문자열로 트리 필터링
  setHighlightEnabled(on: boolean): void;
  setHighlightLayers(kinds: ReadonlyArray<HighlightLayerKind>, hitSampleStep?: number): void;
  getHighlightLayers(): ReadonlyArray<HighlightLayer>; // 마지막 그리기의 레이어
  setRefreshInterval(ms: number): void;
  setDockSide(side: 'right' | 'left'): void;
  audit(): AuditFinding[]; // 레이아웃 감사를 실행; Audit 탭도 채움
  selectFinding(i: number): void; // finding i 뒤의 엔티티를 선택 + 강조 표시
  getPluginFindings(): ReadonlyArray<PluginFinding>; // 플러그인 감사에서의 finding
  getPluginRows(inspectorId: string): PluginRow[]; // 플러그인 탭의 현재 행
  runCommand(qualifiedId: string): unknown; // `<pluginId>/<commandId>` 실행
  destroy(): void; // 리스너, 타이머, 호스트 강조, 패널 Scene 정리
}
```

`detach()`(`attachDevtools`가 반환)는 `destroy()`의 별칭입니다.

`refresh(force)`는 `scene.structureVersion`이 변경되지 않았을 때 재구축을 건너뛰므로 짧은 간격으로 호출하는 비용이 저렴합니다; 무조건 재구축하려면 `true`를 전달하세요. 이 확인과 독립적으로, 패널은 3초마다 재조정하여 누락된 구조 변경이 트리를 무기한 낡은 상태로 두지 않도록 합니다.

`getPluginRows`는 알 수 없는 인스펙터 ID, 선택된 항목이 없거나 인스펙터의 `appliesTo`가 선택을 거부할 때 `[]`를 반환합니다 — 세 가지 경우는 구분되지 않습니다. `runCommand`는 no-op 대신 알 수 없는 명령 ID에서 **예외를 던집니다(throws)**.

---

## 디자인 노트

- 패널 Scene은 `contentProjection: false` 및 `renderMode: 'onDemand'`로 구성됩니다 — 자체 DOM 콘텐츠를 투영하거나 유휴 상태에서 매 프레임 다시 칠하지 않아야 합니다.
- 선택 상태는 패널에 있으며 호스트가 아닙니다: `select()`/`armPick()`은 강조 오버레이 엔티티를 제외하고 검사된 Scene을 절대 변경하지 않으며, 이는 `showOverlay()`를 통해 추가되고 `destroy()`에서 제거됩니다.
- 자동 새로고침은 일반 간격이지 Scene 애니메이션이 아닙니다 — 호스트 Scene이 완전히 유휴(`onDemand`, 더티 없음)인 경우에도 작동합니다.
- 도크(기본값: `position: fixed`, 뷰포트 전체 높이)와 그 캔버스는 `pointer-events: none`이며, 이는 메인 `Scene`의 `a11yRoot`가 옵트아웃하고 개별 대화형 그림자 요소가 `auto`로 옵트인하는 방식을 미러링합니다. 도크의 빈 배경 위 클릭은 아래에 있는 호스트 콘텐츠로 통과됩니다 — 도크 대역에 가려질 호스트 앱의 자체 오른쪽 가장자리 컨트롤 포함. 패널 자체의 a11y-프로젝션된 컨트롤만 자체 `auto` 옵트인을 통해 독립적으로 클릭 가능합니다.

---

[검사](/reference/devtools-inspect/) · [감사](/reference/devtools-audit/) · [성능](/reference/devtools-perf/) · [브리지와 플러그인](/reference/devtools-extend/)
