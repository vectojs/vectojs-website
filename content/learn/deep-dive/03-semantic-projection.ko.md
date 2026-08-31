+++
title = "03 — 의미 투영 + 가상화"
description = "3단계 DOM 생명주기 — Visual, Semantic, Interaction — 그리고 VectoJS가 usable한 것만 구체화하고, 선택 가능한 것만 윈도잉하며, roving 포커스를 정직하게 유지하는 방법."
weight = 23
+++

# 03 — 의미 투영 + 가상화

VectoJS는 **0으로 표시되는 DOM**을 렌더링합니다. 당신이 보는 모든 것은 캔버스입니다. 스크린 리더, 키보드 사용자 또는 극작가 에이전트가 터치하는 모든 것은 `Scene.a11yRoot`(캔버스 위의 단일 `position:absolute` div, `packages/core/src/tree/Scene.ts:2390`)에 **얇게 투영된 그림자**입니다. 해당 섀도우는 엔터티당 하나의 노드가 아닙니다. 이는 찾기 및 미리 읽기를 위해 오프스크린 텍스트에 접근할 수 있도록 유지하면서 비용을 뷰포트로 제한하는 3계층 수명 주기입니다.

## 세 단계 — 하나의 다이어그램

```text
                      ┌─────────────────────────────────────┐
                      │        Virtual Math Tree (VMT)      │
                      │  Entity tree · worldMatrix · bounds │
                      │  packages/core/src/tree/Scene.ts    │
                      │  packages/core/src/tree/Entity.ts   │
                      └──────────────┬──────────────────────┘
                                     │  syncA11y + syncContentProjection
                                     │  (shared depth-first walk, every frame
                                     │   or throttled — see §2)
                 ┌───────────────────┼───────────────────┐
                 ▼                   ▼                   ▼
   ┌─────────────────────┐ ┌───────────────────┐ ┌─────────────────────┐
   │  Visual tier        │ │  Semantic tier    │ │  Interaction tier   │
   │  (always rendered)  │ │  (coarse, resident)│ │  (windowed, fine)  │
   │                     │ │                    │ │                     │
   │  Canvas2D / WebGL / │ │  One DOM node per  │ │  Per-line carriers  │
   │  WebGPU / SVG draws │ │  block holding its │ │  (spans per line /  │
   │  every entity that  │ │  full `text` so    │ │  spans per glyph    │
   │  passes culling.    │ │  find-in-page and  │ │  cluster when grid) │
   │  Subject to         │ │  read-ahead see    │ │  plus a11y mirrors  │
   │  `getRenderChild-   │ │  the whole doc.    │ │  (`button`, `grid-  │
   │  Range` /           │ │  Outside the       │ │  cell`, hotspots).   │
   │  viewportCullChild- │ │  interaction margin│ │  Only near-viewport │
   │  ren. No DOM cost.  │ │  carriers are NOT  │ │  materialized.      │
   └─────────────────────┘ │  built.            │ └─────────────────────┘
                           └───────────────────┘
        Pixels ─────────────►  `getContentProjection().text`  ─────────►  `lines` / `grid`
                              `SceneOptions.contentSemanticMargin`
                                                            `SceneOptions.contentProjectionMargin`
                                                            `SceneOptions.contentSemanticBudget`
```

왜 여백이 두 개인가요? 하나의 스칼라는 "모든 블록에 DOM이 있지만 뷰포트에 가까운 블록에만 반송파가 있습니다"를 표현할 수 없습니다. 유한 값은 오프밴드 블록을 완전히 해제하는 반면 `Infinity`은 모든 반송파(`O(total glyphs)`)를 창 해제했습니다. `SceneOptions.contentSemanticMargin` 대 `contentProjectionMargin`(`Scene.ts:328`, `336`, `359`) 및 `vectojs-docs/forge/baselines/content-projection-frontload-findings.md:1`의 거부된 열거형 근거를 참조하세요.

| 계층             | 어디에 사는지                                           |                                                                                        | 에 의해 게이트됨 기본값                                    |
| ---------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 비주얼           | 캔버스 백킹 매장                                        | `viewportCullChildren` + `getRenderChildRange` (`Entity.ts:788`, `1970`)               | 선별 — 컨테이너별 선택                                     |
| 의미(대략)       | 블록당 하나의 `div`, `el.textContent = projection.text` | `contentSemanticMargin` — 블록에 _any_가 있는지 여부 DOM                               | `contentProjectionMargin ?? Scene.height` (`Scene.ts:355`) |
| 상호작용(괜찮음) | 라인당/셀당 캐리어 + a11y 미러                          | `contentProjectionMargin` + `projectionLineWindow` (`scene/content-line-window.ts:25`) | 하나의 뷰포트 높이                                         |

`contentSemanticBudget`(`Scene.ts:600`의 `Scene.ts:359`, `DEFAULT_CONTENT_SEMANTIC_BUDGET = 256`)은 일회성 상주 계층 빌드를 프레임 전체에 분산합니다. 대략적인 블록에만 예산이 할당됩니다. 상호작용 대역 내부의 블록은 예산에 관계없이 즉시 구현됩니다.

## `syncA11y` 워크가 동작하는 방식 — 그리고 언제

`syncA11y`은 "a11y 방법"이 아닙니다. 이는 a11y _and_ 콘텐츠 프로젝션(`A11yProjectionManager.ts:30`, `ContentProjectionManager.ts:26`)을 위한 **공유 깊이 우선 보행 드라이버**입니다. 이를 분할하려면 `DEC-0020`/`DEC-0022`이 필요합니다. 재귀 지점은 `syncContentProjection`를 호출하고 `syncA11y`은 콘텐츠 측에서 읽는 4개의 동기화별 필드(`_syncSerial`, `contentSemanticBudgetLeft`, `contentSemanticDeferred`, `contentSelectionPresentThisSync`)를 초기화합니다. `DirtyTracker` (`scene/DirtyTracker.ts:33`)은 걷기가 전혀 실행되는지 여부를 확인합니다. `a11ySyncInterval`은 예산을 초과하지 않고 이를 더욱 제한합니다.

프레임당(또는 `a11ySyncInterval`, `Scene.ts:263`로 제한됨):

1. **수집 + 더티 확인.** 0이 아닌 상자(또는 `a11yFullViewport`, `Entity.ts:912`)가 있는 각 `interactive` 엔터티는 `getA11yAttributes()`(`Entity.ts:1898`)을 호출합니다. Walk는 `interactive`, `a11yHidden`, `a11yProjection` 및 `a11yFullViewport`을 함께 읽습니다. 숨겨진 조상은 하위 플래그에 관계없이 전체 하위 트리를 숨깁니다(§ Focus 참조). `getContentEpoch()`(`Entity.ts:2048`)이 충돌하지 않은 경우 변경되지 않은 콘텐츠 블록은 재구축을 완전히 건너뜁니다. 에포크는 VMT 더티 플래그(값싼 정수 비교, 문자열 차이 없음)와 동등한 콘텐츠 프로젝션입니다. `getContentProjection()`에서 `null`을 반환하는 엔터티는 콘텐츠 비용을 전혀 지불하지 않습니다.
2. **생성/업데이트/재배치.** 워크는 섀도우 요소(`a`/`button`/`img`/`input`/`textarea` 또는 `Entity.ts:295`의 `div`, `A11yAttributes.tag`)를 생성하고 속성별 더티 검사를 통해 모든 `A11yAttributes` 필드에 적용합니다(`undefined`를 반환하면 속성이 제거됨 — `false` 대 `undefined`이 중요함). `aria-invalid`), `CanvasGeometry`(`scene/CanvasGeometry.ts:93`)을 통해 엔터티의 월드 매트릭스에서 `top`/`left`/`width`/`height`를 씁니다. Canvas 오프셋과 균일하지 않은 CSS 크기 조정이 매핑됩니다. 캔버스 부모의 임의 CSS 회전/기울기는 지원되지 않습니다. `A11yAttributes.level` / `posInSet` / `setSize` / `rowCount` / `rowIndex`은 `aria-level` / `posinset` / `setsize` / `rowcount` / `rowindex`로 예상됩니다. 가상화된 목록/그리드에 필요하므로 AT는 창이 아닌 데이터 세트 크기를 알립니다.
3. **순서 + 정리.** `A11yProjectionManager.collect` (`A11yProjectionManager.ts:157`)는 가장 가까운 `a11yRegion`/`clipChildren` 조상을 요소의 _region_으로 사용합니다. `reorder`(`A11yProjectionManager.ts:178`)은 `normalElements`을 시각적 읽기 순서(`sortNormalElementsVisually`, `A11yProjectionManager.ts:351`)로 정렬하고 DOM 상위별로 커서를 삽입하므로 복합 중첩(`grid > row > gridcell`)이 유지됩니다. 이동된 하위 트리 내의 포커스 및 `Selection` 엔드포인트는 한 번 스냅샷됩니다. 즉, 이동된 요소(`A11yProjectionManager.ts:230`)가 아닌 _reordering_ 패스당 하나의 강제 레이아웃을 지불합니다. 이 패스가 수집되지 않은 항목은 모두 정리됩니다(`A11yProjectionManager.ts:169`에서 `isActive`). `a11yNeedsReorder` (`Scene.ts:1381` / `A11yProjectionManager.ts:88`)은 정렬을 트리거하는 플래그입니다.
4. **컨텐츠 측면.** 재귀 지점에서 Walk는 `getContentProjection()`이 null이 아닌 모든 엔터티에 대해 `syncContentProjection`을 호출합니다. 박스 테스트(`projectionBoxVisible`)는 일반 버전과 출시 버전을 결정합니다. 라인 밴드(`projectionLineWindow` / `projectionGridLineWindow`, `scene/content-line-window.ts:2`)는 살아남은 블록의 어떤 라인이 캐리어를 얻을지 결정합니다. 그리드 블록은 라인당 서명이 있는 `ContentGridProjector.syncGrid`(`scene/ContentGridProjector.ts:69`)을 통과하므로 스트리밍 추가는 변경되지 않은 캐리어를 재사용합니다. 그리드가 아닌 블록은 `el.replaceChildren()`을 사용합니다. `ContentProjectionHint` (`Entity.ts:ContentProjectionHint`)을 사용하면 Scene가 실제로 필요한 밴드를 엔터티에 알려 `getContentProjection`이 폐기된 라인을 만드는 것을 피할 수 있습니다. 즉, 이를 무시하는 것이 항상 정확합니다.

### 생명주기 훅

`Entity.onMounted()`은 엔터티가 라이브 Scene(`Entity.ts:add` / `_notifyMounted`)에 들어갈 때 한 번 실행됩니다. 할당 시기를 알아야 하는 핫스팟 풀은 이를 재정의할 수 있습니다. `remove(child)`은 `scene.detachA11y(child)`(`Entity.ts:remove`)에게 전화를 걸어 `a11yNeedsReorder`을 표시합니다. `Scene.detachA11y`은 멱등성입니다. 두 번째 분리는 작동하지 않습니다. 따라서 행을 제거하기 전에 핫스팟을 분리하는 `Tabs`/`Table` 풀 정리는 엔터티가 이미 사라진 경우에도 안전합니다.

### 예산과 마진 제어

세 개의 손잡이, 하나의 계약:

- `contentProjection: false`은 _전체_ 콘텐츠 레이어(장식 장면)를 비활성화합니다.
- `contentProjectionMargin`(기본 뷰포트 높이 1개, `Scene.ts:328`) — 상호 작용 창. 유한 = 캐리어가 윈도우됨; `Infinity` = 모든 캐리어가 구체화되었습니다(생산 금지 — `O(glyphs)`).
- `contentSemanticMargin` — 거친 게이트. `Infinity` + 유한 상호 작용 마진 = 모든 블록에는 찾기/미리 읽기에 대한 `text`이 있으며 뷰포트에 가까운 블록만 캐리어 비용을 지불합니다. 상주 계층에 대한 안전하고 원하는 구성입니다. 그것이 없으면 동일한 `Infinity`이 통신사 창구를 해제할 것입니다.
- `contentSemanticBudget = 256` — 동기화당 얼마나 많은 거친 블록이 구체화될 수 있는지입니다. 문서 열기 지연(블록당 ~0.03 ms로 측정됨)과 상주 수에 따라 증가하는 패스당 층의 경계를 지정합니다. 보이는 블록은 예산을 무시합니다.

예산은 아래 메모 수정 후 `DEC-01KZ8DZE`의 측정값에 따라 조정되었습니다. `forge/baselines/content-projection-frontload-findings.md:Two approaches rejected`을 참조하세요.

### 왜 Entity당 하나의 DOM이 아닌가

비용은 예상 노드 수에서 초선형입니다. 실제 하드웨어(RTX 4060 노트북, 움직이는 개체, 각각 하나의 요소)에서 측정 — `content/learn/accessibility.md:353`:

| 대화형 엔터티 | 크롬/프레임 | 파이어폭스/프레임 |
| ------------- | ----------- | ----------------- |
| 1,000         | 6.4밀리초   | 7.4밀리초         |
| 5,000         | 59.5밀리초  | 114ms             |
| 20,000        | 715ms       | 2737ms            |

개체당 비용은 개수에 따라 _상승_합니다(정렬 + 브라우저 a11y-트리 재구축 성능 저하). 5,000개의 움직이는 개체에 대한 두 번째 측정(`Entity.ts:933` doc, `benchmarks/lazy-a11y/`): `eager` = **72.2 ms Chrome / 114.3 ms Firefox** 대 `onDemand` = **1.55 / 1.63 ms**, 투영 없는 바닥 **1.26 / 1.65 ms**. 걷기 자체는 ~0.005 µs/entity입니다. DOM이 비용입니다. 따라서 36,000개의 엔터티에서 Entity당 하나의 DOM은 선형 외삽이 아닙니다. 이는 a11y-트리 재구축에 의해 지배됩니다. 이것이 바로 동일한 문서가 36,000→1,026 붕괴를 보행 승리가 아닌 _system_ 승리로 인용하는 이유입니다.

### 참여 — `a11yProjection` 모드 (`Entity.ts:968`)

- `eager`(기본값) — 미러는 `interactive` + 상자만큼 오래 지속됩니다. 버튼, 링크, 입력용.
- `onDemand` — _engaged_ 동안에만 미러링: 초점, 포인터 대상 또는 `Scene.requestA11yProjection(id)`(`Scene.ts:1481`). 호버만으로는 작동하지 **않습니다**(키보드/AT 사용자는 호버를 생성하지 않습니다). 미러가 없는 `onDemand` 엔터티는 **포인터 이벤트를 전혀 수신하지 않습니다** — 캔버스 적중 테스트(`findEntityAt`)는 디스패치 경로(`Entity.ts:953`)가 아닌 쿼리 API입니다.
- `never` — 거울이 없습니다. 적중 테스트를 유지해야 하지 않는 한 `interactive = false`을 선호합니다.

수천 개의 임시 개체(입자, 탄막)의 경우 패턴은 하나의 집계 라이브 영역(`role: 'status'`, `a11yFullViewport`, `Entity.ts:193`)과 현재 선택을 위한 작은 핫스팟 풀입니다. `forge/findings/core-a11y-and-input.md:178`(Bakudan `DanmakuAnnouncer`)을 참조하세요.

## 가상화 — 문서 전체 비용 없이 스크롤하기

### ScrollView / Viewport

기본 스크롤러(`packages/ui/src/ScrollView.ts:58`)는 `content` 하위 항목이 `-scrollTop`로 변환되는 잘린 컨테이너(`clipChildren = true`)입니다. `scrollTo` / `scrollToBottom` / `jumpTo`을 노출하고 `update`(`ScrollView.ts:219`)에서 지수 스프링 적분기를 구동하며 `hasPendingAnimations()`을 통해 유휴 검사에 스크롤 상태를 표시하므로 `onDemand` 장면이 스크롤 중간에 멈추지 않습니다. `driveVirtualizableContent` (`ScrollView.ts:233`)을 사용하면 `VirtualList` 하위 항목이 스크롤 내에서 자체 창을 소유할 수 있습니다.

`ScrollView` 내부의 `Flow` 또는 `Stack`은 일반 레이아웃을 수행합니다. 클립 + 번역만이 _paint_를 가상화합니다. — DOM 비용은 여전히 콘텐츠 프로젝션 윈도잉에 의해 제한됩니다. `Flow`은 `maxWidth`에서 마무리됩니다. `Stack`는 수직/수평 간격 컨테이너(`packages/ui/src/Stack.ts`, `Flow.ts`)입니다. `Card`은(레이블이 지정된 경우 `packages/ui/src/Card.ts:80`, `role: group`) 장식된 그룹으로, 자체적으로 가상화되지는 않았지만 가상화된 뷰포트의 공통 하위 그룹입니다.

`getA11yAttributes()`은 `{ pointerEvents: 'none' }` (`ScrollView.ts:289`)을 반환합니다. 스크롤 표면 자체는 적중 대상이 아닙니다. 자손은 포인터를 소유합니다(아래 핫스팟 § 참조). 축소된 `ScrollView`의 `a11yHidden`은 클립 애니메이션이 실행되는 동안에도 투영에서 하위 트리를 숨깁니다(`Entity.ts:a11yHidden`, `hide()` 이후 `Overlay`에서 확인됨).

### VirtualList — 행 윈도잉 (`packages/ui/src/VirtualList.ts:179`)

`[visibleTop - overscan, visibleBottom + overscan]`의 행만 마운트됩니다(`VirtualList.ts:468`의 `_visibleRange`, 기본적으로 `overscan = 3`, `VirtualListOptions:102`). 나머지는 엔터티로 존재하지 않습니다. 캔버스 그리기, a11y 미러, 콘텐츠 투영이 없습니다. 마운트 수는 데이터 세트 크기에 관계없이 `O(viewport)`로 유지됩니다.

스크롤링 수학은 `total()`, `prefix(i)`(= `i` 행의 y) 및 `indexAt(y)`(= 오프셋 `y`을 포함하는 행)에 응답하는 Fenwick 트리(`RowHeights`, `VirtualList.ts:14`)를 통해 `O(log n)`입니다. 높이는 `estimatedRowHeight`에서 시작하고 각 프레임(`_measureMountedRows`, `VirtualList.ts:540`)마다 마운트된 행별로 다시 측정됩니다. 일반 필드 읽기, 더티 플래그가 필요하지 않으며 변경 없음 경로에 `markDirty`이 없으므로 유휴 스로틀이 해제되지 않습니다. `_reconcile`(`VirtualList.ts:488`)은 새 엔터티를 마운트하기 전에 범위를 벗어난 엔터티를 재활용합니다.

키 목록(`keyForItem`, `VirtualList.ts:117`)은 `setItems`에서 측정된 높이를 유지하고, 항목 ID(색인 아님)별로 스크롤하고, `distanceToBottom ≤ 48 px`(`VirtualList.ts:517`)인 경우 하단을 따릅니다. `keyForItem`이 없으면 `setItems`은 높이 캐시를 지우고 맨 위로 이동합니다. 교체된 목록의 경우 정확하고, 증가하는 기록의 경우 잘못된 것입니다.

A11y: 컨테이너의 개수는 `VirtualList.ts:660`의 `getA11yAttributes` 및 `VirtualList.ts:170`의 클래스 문서에 따라 `aria-setsize`(`role="list"`에서는 허용되지 않음)이 아닌 **이름**에 속합니다. 각 _row_는 `posInSet` / `setSize` (`Entity.ts:A11yAttributes.posInSet`/`setSize`)을 반환해야 합니다. 그렇지 않으면 화면 판독기가 데이터 세트 대신 마운트된 창의 크기를 알려줍니다. `VirtualList`은 `Table`과 동일한 방식으로 행 핫스팟을 풀링합니다. 즉, 표시되는 행당 하나의 풀입니다.

### 콘텐츠 그리드 타일링 — coarse vs fine (§ 위 다이어그램)

두 경로가 하나의 윈도우 계약(`scene/content-line-window.ts`)을 공유합니다.

- **비그리드**(단락, `Text`/`RichText`): `ContentProjection.lines`에 대한 `projectionLineWindow`(`content-line-window.ts:44`). 대략적인 블록은 하나의 텍스트 노드(`el.textContent = projection.text`)를 보유합니다. 미세 블록은 창당 캐리어를 대체합니다. 각 `ContentProjectionLine`은 `text`, `separatorAfter`(소프트 랩 대 하드 브레이크 사용), `x`/`y`/`baseline`, 양쪽 맞춤 텍스트의 경우 `x`/`width`이 포함된 선택적 `runs`, CJK 그리드 맞춤의 경우 `perGraphemeCarriers`/`shapedPaint`을 전달합니다.
- **그리드**(코드 블록, `@vectojs/text`의 `PreparedContentGrid`을 통한 `Markdown` CodeBlock): `PreparedContentGrid`에 대한 `projectionGridLineWindow`(`content-line-window.ts:114`). `ContentGridProjector.syncGrid`은 셀별 `scaleX` 보정(`ContentProjectionManager.scheduleGridCalibration`, 동기화 외부 콜드 읽기/쓰기 배치)을 사용하여 글리프 클러스터당 하나의 범위를 구축하고 서명별로 라인을 재사용하므로(`ContentGridProjector.ts:199`) 스트리밍 추가 시 `O(cells)` 재구축을 방지합니다. 그리드 텍스트의 `ligatures: 'none'`은 Firefox `ffi` 수축이 선택 상자를 드리프트하는 것을 방지합니다.

창은 **확장된 뷰포트 밴드와 겹치는 연속 실행**입니다. 간격으로 인해 텍스트가 DOM 순서에서 분리되고 선택 복사 순서가 중단됩니다. 겹치는 것이 없으면 가장 가까운 줄 하나가 유지되므로 텍스트에 계속 접근할 수 있습니다(`content-line-window.ts:79`). 승격(대략→고밀도)은 거친 텍스트 노드를 명시적으로 제거합니다. 그리드는 `replaceChildren()`을 사용할 수 없거나 스트리밍 재사용이 손실됩니다(`ContentGridProjector.ts:111`). 강등 릴리스 DOM; 의미론적 게이트는 전달자 없이 검색 가능한 텍스트를 유지합니다.

선택 보존은 계층을 인식합니다. `ContentProjectionManager`(`scene/ContentProjectionManager.ts:1`)은 그리드가 아닌 경우 _선형 오프셋_ 및 그리드의 경우 _소스 오프셋_으로 끝점을 스냅샷하고 보행당 `selectionPresent`를 기억합니다(요소당이 아닌 보행당 하나의 강제 레이아웃 — 기억된 수정 사항은 2002 레이아웃에서 19, `forge/baselines/content-projection-frontload-findings.md:153`까지 1000블록 배수를 취함), 영향을 받은 선이 실제로 재구축되었을 때만 복원합니다 — 재사용된 캐리어는 라이브 `Selection` 노드를 유지합니다. 스크롤 코드 블록의 `clipToBounds`는 선택 강조 표시가 엔터티 상자를 지나서 그려지는 것을 방지합니다.

### Markdown + Table 타일링

- **Markdown** (`packages/markdown/src/Markdown.ts:681`) — 두 개의 독립적인 축: `virtualize` (`MarkdownOptions:625`)은 최상위 레벨 _blocks_를 엔터티(선택, 스트리밍과 호환되지 않음, 호스트 `ScrollView`에서 `setVisibleRange`에 의해 구동됨, `Markdown.ts:774`에 `RowHeights` 포함)로 창을 만들고, `tableViewportHeight`(`MarkdownOptions:652`)은 각 `Table`의 본체 뷰포트를 수정하여 해당 행이 다음을 통해 중간 스트림을 가상화하도록 합니다. `Table.appendRows`. `cullOffscreenChildren`이 포함된 `Stack`은 두 경우 모두 콘텐츠 호스트입니다. `Markdown`은 블록당 `getContentProjection`을 소유합니다. 호스트가 스크롤을 소유합니다. 스트리밍 Markdown은 접두사로 변경되지 않은 블록 엔터티를 재사용합니다. 즉, 테일 재구축만 가능합니다(보스 04).
- **Table** (`packages/table/src/Table.ts:144`) — `viewportHeight > 0`은 헤더를 고정하고 잘린 스크롤 `bodyClip`(`Table.ts:183`)을 생성하며 창 항목에 문자열 셀을 느리게 구성하고(`Table.ts:853`의 `ensureBodyCells` / `Table.ts:392`의 `reconcileVirtualRows`) `first..last` 행만 마운트된 상태로 유지합니다(`overscan = 2`). 클래식 모드는 측정된 높이가 가변적인 모든 행에 맞게 확장됩니다. 본문 a11y는 표시되는 행당 풀링된 `RowHotspot`(`role: row`) + `GridCellHotspot`(`role: gridcell`/`columnheader`)입니다 — `O(rows)`(`Table.ts:199`, `622`)이 아니라 `O(viewport)`입니다. `getContentProjection`는 `Table` 자체에서 `null`을 반환합니다. 셀은 해당 텍스트를 소유합니다. `rowTops` 접두사 합계(`Table.ts:751`)는 O(행²) 대신 슬롯당 `_syncGridA11y` O(1)을 만듭니다.

### 뷰포트 안의 Stack / Flow / Card

`Stack`(`packages/ui/src/Stack.ts`) 및 `Flow`(`packages/ui/src/Flow.ts`)은 가상화되지 않은 레이아웃 컨테이너입니다. 하위 항목을 배치하고 `width`/`height`을 보고하지만 클리핑하거나 창을 표시하지는 않습니다. `ScrollView` 또는 가상화 부모 내부에서는 번역되거나 선별되는 _content_입니다.

- `direction: 'vertical'` + `gap`가 있는 `Stack`은(는) Markdown `content` 호스트(`Markdown.ts:1088`)이자 일반적인 ScrollView 하위입니다. `cullOffscreenChildren = true`를 사용하면 화면 밖의 하위 항목에 대해 `getContentProjection`도 건너뜁니다. 이는 Scene 수준 창 작업 이전의 저렴한 두 번째 게이트입니다.
- `Flow`은 `maxWidth`에서 인라인 하위 항목을 래핑하고 텍스트 단락의 핵심입니다. Stack과 마찬가지로 뷰포트 게이팅을 위해 스크롤링 조상을 사용합니다.
- `Card`(`packages/ui/src/Card.ts:80`)은 패딩/테두리/그림자가 있는 장식된 `role: group` 컨테이너입니다. 자체적으로 가상화된 적은 없지만 `VirtualList` 행 또는 `Markdown` 블록의 빈번한 하위 항목입니다. a11y 역할은 레이블이 지정된 경우에만 `group`입니다.

기본적으로 이들 중 어느 것도 `getRenderChildRange`을 소유하지 않습니다. 모든 자식을 칠하고 조상의 클립 + 프로젝션 윈도잉 비용을 제한합니다. `Markdown`/`Table`/`VirtualList`만 행/블록 수준 가상화를 구현합니다.

### 뷰포트 컬링 — 시각 단계 (`Entity.ts:788`)

DOM 투영과 무관:

```ts
entity.viewportCullChildren = true;
entity.getRenderChildRange(localViewport: Bounds): RenderChildRange | null {
  // return { start, end } of children intersecting the viewport, or null for none
}
```

`Stack`/`Flow` 기본적으로 이 기능을 꺼두세요(적은 어린이 수에 비해 저렴함). _캔버스_ 그리기 자체가 중요한 수천 개의 시각적 하위 요소가 있는 컨테이너에 대해 이 기능을 켜십시오. 프로젝션 윈도우잉은 시각적 계층에 도움이 되지 않으며, 컬링 없는 나무 걷기는 동기화된 프레임(`forge/baselines/content-projection-frontload-findings.md:Not addressed`, `vectojs#350`)당 `O(total entities)`입니다.

### 승격 / 강등 생명주기

```text
  off-screen                          near viewport                    on-screen
 ──────────── ──contentSemanticMargin── ──contentProjectionMargin── ────────────
  (released)          (coarse)                     (fine)
  no DOM              el.textContent = text        per-line / per-cell carriers
  not findable        findable, no per-line        findable + selectable +
                      selection geometry            copy + per-line highlight

  demotion ◄──────────────┘                          └──────────────► promotion
  `syncContentProjection` frees carriers;            `syncGrid` strips coarse text node,
  coarse text stays if inside semantic gate;         materializes windowed carriers;
  outside both gates the element is removed.         outside semantic gate but inside
                                                     interaction gate: direct to fine.
```

예산은 오프밴드에서 대략적 → 고급 승격에만 적용됩니다. 이미 상호작용 범위에 있는 블록을 스크롤하면 예산이 무시됩니다.

## 핫스팟 패턴 — 키보드는 여전히 동작하는 zero-DOM 시맨틱

복합 위젯(`role="grid"`, `tree`, `menu`, `radiogroup`, `tablist`)은 컨테이너 역할뿐만 아니라 **하위 항목당 하나의 역할**을 노출해야 하며 **탭 한 개**를 순차적으로 유지해야 합니다. 즉, 천 개의 탭이 있는 트리는 사용할 수 없습니다. VectoJS는 표시되는 각 자식(`vectojs/AGENTS.md:Zero-DOM a11y hotspot pattern`) 위에 투명하고 포커스 가능한 자식 `UIComponent`을 풀링합니다.

```ts
class GridCellHotspot extends UIComponent {
  constructor(private table: Table) {
    super();
    this.interactive = true; // so syncA11y projects it at all
    this.on('keydown', (e) => this.table.handleGridKey(e, this.rowIndex, this.colIndex));
  }
  getA11yAttributes(): A11yAttributes {
    return {
      role: this.rowIndex < 0 ? 'columnheader' : 'gridcell',
      label: this.label, // WCAG 4.1.2 — every control needs a name
      tabIndex: this.table.isGridTabStop(this.rowIndex, this.colIndex) ? 0 : -1,
      pointerEvents: 'none', // lets selectable cell text own the pointer
    };
  }
  render(): void {} // Table paints the cell on canvas
}
```

| 구성요소         | 핫스팟 역할                                       | 로빙 정지 소유자                                  | 열쇠                                                         |
| ---------------- | ------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| `Table`          | `row`의 `gridcell` / `columnheader`               | `isGridTabStop(row, col)` (`Table.ts:473`)        | 화살표 2D, 홈/끝 행, Ctrl+Home/끝 그리드, PageUp/Down 뷰포트 |
| `VirtualList` 행 | 발신자 제공(예: `listitem`)                       | 행 자신의 `isTabStop`                             | 위/아래                                                      |
| `TreeView`       | `treeitem` (`aria-level`, `expanded`, `selected`) | `isTabStop(nodeId)` (`Tree.ts:389`)               | 위/아래, 오른쪽 확장→입력, 왼쪽 축소→상위, 홈/끝             |
| `ContextMenu`    | `menuitem` (`haspopup`, `expanded`)               | `isMenuTabStop(idx)` (`ContextMenu.ts:270`)       | 위/아래 랩, 홈/엔드, 오른쪽 열기, 왼쪽 뒤로, 탈출 닫기       |
| `RadioGroup`     | `radio` (`aria-checked`)                          | `isTabStop(value)` (`RadioGroup.ts`/`Tabs.ts:42`) | 화살표 + 홈/끝                                               |
| `Tabs`           | `tab` (`aria-selected`)                           | 선택한 탭                                         | 화살표 + 홈/끝                                               |

선례: `RadioGroup`/`Tabs` (#160), `Tree`/`Table`/`ContextMenu` (#191); `Table.ts:56`, `82`, `Table.ts:624` (`_syncGridA11y`), `VirtualList.ts:170`, `ScrollView.ts:289`, `ContextMenu.ts:292`, `RadioGroup.ts:32`, `Tree.ts:98`의 라이브 참조. 보이는 하위 항목만 풀링되므로 가상화된 `Table`는 `O(viewport)` 핫스팟을 투사합니다.

### `pointerEvents: 'none'` 근거

Canvas 입력은 **투영된 거울을 통해서만 라우팅됩니다** — `Scene`은 호버 추적을 위해서만 캔버스에서 거울당 `pointerdown`/`pointerup`/`click`/`wheel`(`Scene.ts:3512`) 및 `pointermove`/`pointerleave`을 바인딩합니다. 따라서 핫스팟의 `pointerEvents: 'none'`은 "적중 테스트에서 제거"하는 것이 아니라 마우스 입력 경로를 완전히 제거하는 반면 키보드 포커스와 AT 합성 `click`은 여전히 (`forge/findings/core-a11y-and-input.md:336`)을 라우팅합니다. _underneath_가 포인터를 소유하고 있을 때 사용하세요:

- 선택 가능한 셀 텍스트(`Table.ts:116`),
- 드래그하여 스크롤할 수 있는 표면(`ScrollView.ts:289`),
- 래퍼 내부의 캔버스 히트 처리.

핸들러를 소유한 요소에는 사용하지 **않습니다**. 자체 속성에 `pointerEvents: 'none'`을 설정하는 `ScrollView` 하위 클래스는 오류 없이 `wheel`/`pointerdown` 스크롤을 침묵시킵니다(`forge/findings/core-a11y-and-input.md:336`).

### 포커스, roving tabindex, 그리고 읽기 순서

- **로빙 탭 인덱스**: 합성당 정확히 하나의 핫스팟에 `tabIndex: 0`이 있습니다. 부모는 화살표 키의 정지점을 이동하고 초점을 맞춥니다(`Table.ts:490`의 `Table.handleGridKey`, `Table.ts:560`의 `findHotspot`/`_focusCell`, `VirtualList`/`Tree`/`ContextMenu`에 해당). 가상화가 초점 행을 마운트 해제하면 `Table`는 `tabIndex`(`Table.ts:667`)을 리바인딩하기 _전에_ 보이는 행에 중지를 다시 고정하고 이전 셀이 실제로 그것을 보유하고 있는 경우에만 DOM 초점을 복원하므로(`Table.ts:592`의 `activeCellHoldsFocus`) 다른 곳으로 스크롤해도 초점을 빼앗지 않습니다. 센티넬 `a11yRoot` 포커스 트랩은 장면(`Scene.ts:1482`) 내부에 포커스를 유지합니다.
- **읽기/탭 순서**: 미러는 밴드 정렬 상단→하단, 인라인, 안정, _region_별로 — 가장 가까운 `a11yRegion` 또는 `clipChildren` 조상(`A11yProjectionManager.ts:351`)입니다. 영역이 없으면 대화 내용을 세로로 드래그하면 제목이 동일한 행 밴드를 공유하는 사이드바가 사라집니다(`A11yProjectionManager.ts:339`). 드래그/연속성을 별도로 유지하려면 잘리지 않는 열에 `a11yRegion = true`(`Entity.ts:a11yRegion`)을 설정하세요. RTL은 `Scene.readingDirection`(`Scene.ts:392`)입니다. `a11yRoot` 레이어는 기본적으로 `pointerEvents: none`을 사용하여 캔버스(`Scene.ts:2403`) 위의 `z-index: 10`이며, 드래그하는 동안에만 `auto`로 뒤집어서 빈 영역에서 선택을 시작할 수 있습니다.
- **하위 트리 숨기기**: `a11yHidden = true` (`Entity.ts:a11yHidden`)는 프로젝션에서 전체 하위 트리를 숨깁니다. 컨테이너의 `interactive = false`만으로도 여전히 대화형 하위 트리가 프로젝션됩니다(`Popover.hide`, `forge/findings/core-a11y-and-input.md:622`에서 확인됨). `opacity`에서 추론되지 않음 — 스프링 구동 불투명도는 도달하지 않은 채 거의 0에 가깝습니다.

## 구성 선택

| 문서                   | 의미적 마진                | 상호작용 마진      | 예산    | 참고                                                                  |
| ---------------------- | -------------------------- | ------------------ | ------- | --------------------------------------------------------------------- |
| 장식 캔버스            | `contentProjection: false` | —                  | —       | DOM 비용이 전혀 들지 않습니다                                         |
| 짧은 문서(< 300블록)   | 기본값                     | 기본값             | 256     | 기본값은 이미 최적입니다                                              |
| 긴 스크롤 가능한 문서  | `Infinity`                 | 기본값(뷰포트 1개) | 256     | 권장 상주 계층 - 전체 문서에 대한 찾기 + 미리 읽기, 통신업체는 제한됨 |
| 10,000개 블록의 성적표 | `Infinity`                 | `2 * viewport`     | 256–512 | 더 넓어진 상호작용 마진으로 스크롤 중 프로모션 이탈 감소              |
| 입자 / 탄막 필드       | — (콘텐츠 프로젝션 없음)   | —                  | —       | `a11yProjection: 'onDemand'` 또는 집계 `role: status` 라이브 지역     |

`content-visibility: auto` 및 hover-gated 텍스트는 모두 측정되고 거부되었습니다. `forge/baselines/content-projection-frontload-findings.md:Two approaches rejected`을 참조하세요. 전자는 오프스크린 프로젝션을 위해 `display:none` 이상으로 아무것도 구매하지 않습니다. 후자는 특히 키보드/AT 사용자의 텍스트를 제거합니다.

## Gotchas — 이미 출하된 버그들

1. **대략→미세 중복**(`forge/findings/core-a11y-and-input.md:2026-08-08`) — 거친 왼쪽에서 승격된 그리드 블록은 `textContent` 텍스트 노드 뒤에 있고 캐리어는 `children` 전용 작업을 통해 추가되어 `textContent`을 두 배로 늘립니다(758자 대 379자 측정). 캐리어 루프(`ContentGridProjector.ts:111`) 앞의 텍스트 노드를 제거하여 수정되었습니다.
2. **창 시작 이후 선택**(`forge/findings/core-a11y-and-input.md:2026-08-08`, `ContentGridSelectionWindow.test.ts`) — 창의 _start_를 지나 스크롤하면 `Selection`을 해제하지 않고 캐리어를 다시 빌드하여 분리된 노드에 남겨 둡니다. 구체화 루프 위로 끌어올려진 `selectionLine < start || >= end`이 필요합니다.
3. **`pointerEvents: none`는 마우스를 죽입니다**(`forge/findings/core-a11y-and-input.md:2026-08-02`) — 핫스팟 § 참조; 경고도 없고 오류도 없으며 단지 죽은 스크롤 표면만 있을 뿐입니다.
4. **오버레이 재투영 지연** — `showOverlay`과의 `DirtyTracker` + `a11ySyncInterval` 상호 작용이 한때 의심되었으나 백그라운드 브라우저 아티팩트로 철회되었습니다(`forge/findings/core-a11y-and-input.md:2026-08-16` 철회, `2026-08-15` 원본). 교훈: Scene에 프레임 수 지연을 적용하기 전에 `document.hasFocus()` 및 페이지 내 rAF 카운터를 확인하십시오.
5. **고정 ID 충돌**(`forge/findings/core-a11y-and-input.md:2026-07-16`, `vectojs#117`) — 한때 `super('ClassName')`이라고 불리는 11개의 `ui` 구성 요소는 하나의 `a11yElements` 맵 항목을 공유합니다. 두 개의 `PanelGroup`s 라우팅된 포인터 이벤트가 잘못된 구분자입니다. `super()` → 임의 ID로 수정되었습니다.
6. **`a11yHidden` 대 `interactive`** (`forge/findings/core-a11y-and-input.md:622`) — 컨테이너에 `interactive = false`을 설정해도 여전히 대화형인 하위 항목이 숨겨지지 않습니다. `a11yHidden`은 그렇습니다.

## 자동화 — 투영은 입력 전송 수단이기도 하다

극작가 `getByRole('button', { name })`은 캔버스에 닿지 않습니다. `a11yRoot`의 섀도우 미러에 도달하고 `Scene`의 미러당 수신기(`Scene.ts:3512`)는 `bubbles` 및 `stopPropagation` 의미 체계를 사용하여 `VectoJSEvent`(`Entity.ts:VectoJSEvent`)로 다시 디스패치됩니다. 그렇기 때문에 AT가 발표하는 것과 동일한 `A11yAttributes.label`이 상담원이 사용하는 선택기이기도 합니다. 즉, 어댑터나 `data-testid`이 필요하지 않습니다. `debugA11y`과 `getA11yTree()`은 에이전트의 어설션 표면입니다. `data-vecto-id`은 레이블이 동적일 때 안정적인 위치 지정자입니다.

결과: `onDemand` 유휴 엔터티 또는 `a11yHidden` 하위 트리에는 미러가 없으므로 **포인터 전달 경로가 없습니다** — `scene.findEntityAt(x,y)`는 여전히 엔터티(쿼리 API)를 반환하지만 `entity.on('click')`은 실행되지 않습니다. AT가 보이지 않는 동안 포인터 반응성을 유지해야 하는 전역 제스처 표면은 `a11yFullViewport = true` + `a11yProjection: 'eager'` + `getA11yAttributes() => ({ tabIndex: -1 })`을 사용하고 역할이 없습니다. 미러는 포인터 라우팅에 초점을 맞출 수 있지만 AT 이름은 없습니다.

`a11yFullViewport` 자체(`Entity.ts:912`)는 다른 모든 미러 뒤에 하나의 `100vw × 100vh` 미러를 마운트하므로(`A11yProjectionManager.ts:fullViewportElements`은 삽입 순서로 유지됨) 캔버스를 덮는 상호 작용 표면이 상단 컨트롤을 가리지 않습니다. 이 패턴은 `DanmakuAnnouncer`, webos 데스크탑 클릭 캐처 및 무한 캔버스 팬 핸들러에서 사용됩니다.

## `getA11yAttributes`가 투영할 수 있는 것 — 서피스

`A11yAttributes`(`Entity.ts:295`)은 사용자 지정 엔터티에 필요한 유일한 a11y API입니다. 모든 필드는 프레임당 속성별로 더럽혀집니다. — `undefined`는 제거하고, `false`은 `aria-invalid="false"`(명시적으로 유효)를 작성하므로 구별이 중요합니다.

- **신원**: `tag` (`div`/`a`/`button`/`img`/`input`/`textarea`), `role`, `label` / `labelledby` / `describedby`.
- **포커스/포인터**: `tabIndex`(로빙 § 참조), `pointerEvents`(`auto`/`none`).
- **네이티브 소품**(`tag` 일치에만 해당): `href`/`target`, `src`/`alt`, `inputType`/`placeholder`/`value`/`checked`/`textInputStyle`.
- **주**: `disabled`, `checked`, `selected`, `expanded`, `required`, `invalid`, `level`, `valuemin`/`valuemax`, `ariaModal`, `controls`/`haspopup`/`activedescendant`.
- **가상화된 세트/그리드**: `posInSet`/`setSize`(목록), `rowCount`/`rowIndex`/`valueText`/`orientation`(그리드) — 이것이 없으면 10,000행 가상화 목록은 "항목 3/12"(데이터세트가 아닌 창)를 알립니다.
- **라이브**: `live` (`off`/`polite`/`assertive`) + `atomic`/`relevant` — 스트리밍 아나운서 경로(보스 04).

`getA11yAttributes()` 기본값(`Entity.ts:1937`)은 `{}` → 역할이 없는 일반 `div`을 반환합니다. 이는 여전히 콘텐츠 프로젝션이 필요한 비대화형 텍스트 블록에 적합합니다.

## 인용할 성능 수치 (그리고 어디서 측정했는가)

집중된 GPU 지원 창의 `benchmarks/run-browsers.sh` 숫자만 인용 가능합니다(전역 `AGENTS.md` 벤치마크 규칙 참조). 별도의 언급이 없는 한 아래의 모든 수치는 해당 하네스에서 나온 것입니다. `calibrateRefreshRate()`를 사용하세요. 60/240Hz를 하드코딩하지 마세요(Firefox는 `layout.frame_rate` 없이 기본적으로 60Hz로 설정되어 있습니다). JSON 봉투에서 `validation.ok`, `crossOriginIsolated` 및 `refreshHz`을 교차 확인합니다. 초점이 맞지 않은 창은 0틱/초를 보고하고 모든 ms 클레임은 무효입니다.

**프로젝션 비용과 대화형 개수** — `content/learn/accessibility.md:353`, `Entity.ts:933`:

| 상태                          | 크롬         | 파이어폭스   | 출처                                                                 |
| ----------------------------- | ------------ | ------------ | -------------------------------------------------------------------- |
| 1,000개의 움직이는 인터랙티브 | 6.4ms/프레임 | 7.4ms/프레임 | 학습/접근성 §비용 + `lazy-a11y` 층                                   |
| 5,000명의 열정                | 59.5~72.2ms  | 114ms        | 학습 테이블 + `benchmarks/lazy-a11y/` (`Entity.ts:933` doc)          |
| 5,000 `onDemand` (같은 장면)  | 1.55밀리초   | 1.63밀리초   | `benchmarks/lazy-a11y/` 층 1.26/1.65 ms                              |
| 20,000명의 열정               | 715ms        | 2737ms       | 학습/접근성 테이블(초선형: 6.4→35.7 µs/Chrome, 7.4→136.9 µs/Firefox) |

**가상화의 승리** — `forge/findings/core-a11y-and-input.md:240`(갤러리 346KB Markdown, 172–238Hz, 실제 GPU):

| 미터법             | 이전(뷰포트 게이트 없음) | 이후                 |
| ------------------ | ------------------------ | -------------------- |
| DOM 요소           | 14,843                   | 254                  |
| 투영된 콘텐츠 노드 | ~1,250                   | 29(스크롤 시 재활용) |
| 텍스트 노드        | 9,369                    | 160                  |
| 스크롤 p95         | ~50ms                    | 4.3밀리초            |
| 스크롤 프레임      | 55fps/18ms               | 238fps / 4.2ms       |
| 힙                 | 스크롤 중 125 → 224MB    | ~100MB               |

**대략적인 의미 계층 비용** — `forge/baselines/content-projection-frontload-findings.md: Finding 3`(Chrome 151 @ 240Hz, Firefox 153 @ 240Hz, `runId 20260804T155826Z-5cdf96`):

| 블록   | 라인   | `firstSyncMs`(하이브리드 대 네이티브)                         |
| ------ | ------ | ------------------------------------------------------------- |
| 100    | 300    | 10.3ms(1.6×) / 5.0ms(1.1×)                                    |
| 1,000  | 3,000  | 20.6 ms (4.5×) / 16.0 ms (5.3×) — ~열 때 프레임 하나가 삭제됨 |
| 10,000 | 30,000 | 146.6ms(19.9×) / 144.8ms(21.4×)                               |

편집당 비용은 저렴합니다(10,000에서 `editOffBand` 1.09/3.06 ms, `Finding 4`). `Selection` 메모 수정 후 최종 예산 소모(`20260805T080824Z-e79819`, `forge/baselines/content-projection-frontload-findings.md:Two approaches rejected` 실행): Chrome 21.29 → 10.66 ms(1k 및 139.5 → 12.0 ms), 10k; Firefox 21.86 → 5.88 ms 및 141.6 → 9.2 ms. 블록당 ~0.03 ms — 이전의 ~13 µs/노드 수치는 무효였습니다(레이아웃에 전혀 들어가지 않은 `display:none` 상주 노드로 측정).

## 디버그 체크리스트

1. **`scene.getA11yTree()` 먼저.** 모든 핫스팟과 콘텐츠 노드는 `role`/`label`/`tabIndex`과 함께 있습니다. — `getByRole`이 아무것도 찾지 못하면 `interactive` 또는 `width`/`height`은 선택기(`Scene.ts:2390` 가드, `content/learn/accessibility.md:Troubleshooting`)가 아니라 0입니다. `a11yRoot` 자체는 트리에서 제외됩니다.
2. **`debugA11y: true`** (`SceneOptions:debugA11y`, `Scene.ts:204`) — `a11yRoot` 위에 파란색 점선 윤곽선; 가장 빠른 위치 확인. 그렇지 않으면 거울은 `opacity: 0`입니다(드래그할 때까지 `Scene.ts:2401` 레이어는 `z-index: 10`, `pointerEvents: none`입니다). `scene.debugA11y = true`을 통해 런타임에 전환합니다.
3. **DOM 검사** — 각 거울에는 `data-vecto-id = entity.id`과 `role`/`aria-*`가 포함됩니다. `aria-label` 존재 여부를 확인하세요(이름이 없는 역할은 "버튼"/"슬라이더", `content/learn/accessibility.md:Screen reader testing checklist`로 표시됩니다). 콘텐츠 매체는 `data-vecto-grid-*` 및 `data-vecto-projection-*` 데이터 세트를 운반합니다. 라이브 미러 수와 예상 수를 계산하려면 `document.querySelectorAll('[data-vecto-id]')`을 사용하세요.
4. **`scene.getA11yElement(entity.id)`** — 초점 확인을 위한 라이브 `HTMLElement`; `activeCellHoldsFocus` (`Table.ts:592`) 패턴은 테스트 방법을 보여줍니다. `null`는 이 프레임이 투영되지 않았음을 의미합니다(뷰포트 외부, `a11yHidden` 또는 `onDemand` 유휴). 오버레이 투영 회귀를 파악하려면 `showOverlay` 이전/이후의 `scene.a11yElements.size`을 비교하세요.
5. **`a11yProjection` 게이트 확인** — 결합이 없는 `onDemand`에는 미러가 없으므로 포인터 이벤트가 없습니다. 파견을 비난하기 전에 `Scene.requestA11yProjection` 또는 포커스 상태를 확인하세요. `findEntityAt`은 여전히 작동합니다(게이트되지 않음). 따라서 캔버스 수준의 `pointerdown` 처리기는 실행되지만 엔터티 자체의 `on('click')`는 실행되지 않습니다.
6. **`pointerEvents` 감사** — `grep -rn "pointerEvents.*none" packages --include="*.ts"` 및 핸들러 소유권을 확인합니다. 자동 스크롤/선택 실패는 클립 버그보다 더 자주 발생합니다. `ScrollView.ts:289`의 `ScrollView`은 표준 래퍼-소유-없음, 하위-소유-자동 쌍입니다.
7. **읽기 순서** — `getA11yTree()`을 덤프하고 밴드 순서가 시각적 행과 일치하는지 확인합니다. 잘못 배치된 `a11yRegion`은 밴드 메이저가 예상되는 지역 메이저 순서로 표시됩니다(`A11yProjectionManager.ts:351` 영역 버킷팅).
8. **선택/그리드 보정** — `ContentProjectionManager.scheduleGridCalibration`은 셀당 `scaleX`을 씁니다. `data-vecto-grid-calib` 생성을 확인합니다. 글꼴 로드 후 오래된 생성은 `contentFontEpoch`이 충돌되지 않았음을 의미합니다. `content-visibility: auto`이 측정되고 거부되었습니다(`forge/baselines/content-projection-frontload-findings.md:Two approaches rejected`). `a11yRoot`의 `contain: layout`은 의도적입니다(`Scene.ts:2402`).
9. **성능 분류** — `ScrollView`/`VirtualList`/`Table`의 `PhaseTimer` 단계 `calibScan`/`calibProbeBuild`/`gridMaterialize`(`scene/PhaseTimer.ts`), `ContentGridProjector` `vectoGridMaterializeMs` 데이터 세트, `scene.frameStats`(`Scene.ts:518`) 및 DevTools `getDevtoolsDescriptor()`. 할당 가능한 숫자의 경우 초점이 맞춰진 창의 `benchmarks/run-browsers.sh`만 계산됩니다. 배경의 Hyprland는 `0 ticks/s`을 제공하고 모든 프레임당 클레임은 무효입니다(`forge/findings/core-a11y-and-input.md:2026-08-16` 철회).

## 가상화가 실제로 동작하는지 검증하는 방법

순서대로 세 가지 확인 사항:

1. **DOM.** `document.querySelectorAll('[data-vecto-id]').length` 대 `scene.a11yElements.size` 대 데이터세트 크기를 계산합니다. 10k 행 가상화된 Table은 10k가 아닌 ~`viewport/rowHeight + 2*overscan` 미러를 표시해야 합니다. 숫자가 데이터 세트를 추적하는 경우 가상화가 꺼진 것입니다(`viewportHeight`이 설정되지 않았거나 창 모드 풀 대신 모든 행 엔터티에 `a11yProjection: 'eager'`).
2. **스크롤하고 다시 계산합니다.** 세트는 재활용되어야 합니다. 창 이동에 따라 동일한 개수, 다른 `data-vecto-id`s가 발생합니다. 개수가 증가한다는 것은 미러가 누출되었음을 의미합니다(마운트 해제 시 호출되지 않은 `detachA11y` 또는 축소 없이 커지는 풀 - `Table.ts:701` 축소 루프 및 `VirtualList.ts:_reconcile` 재활용 분기 확인).
3. **성능 한계.** 초점이 맞춰진 창의 `scene.frameStats` (`Scene.ts:518`) + `benchmarks/run-browsers.sh --validation`. 스크롤 p95가 가상화 후 10ms 이상 유지되면 비용은 더 이상 DOM 카운트가 아닙니다. `PhaseTimer` 그리드 보정 또는 `syncA11y` 걷기 자체(`viewportCullChildren` 없는 `O(total entities)`, `vectojs#350`)를 확인하세요.

## 이 보스가 문서 그래프에서 차지하는 위치

- **전제조건**: Boss 06(VMT 런타임 — 더티/라이프사이클/이벤트, `DirtyTracker`, `DriverTicker`, `Scene` 루프). 이 상사는 06의 더티/라이프사이클 기계를 재사용하고 당신이 VMT 단계를 알고 있다고 가정합니다.
- **페어링**: Boss 01(선택 — 콘텐츠 프로젝션의 다른 소비자), `content/learn/accessibility.md`(방법), `content/reference/core-a11y.md`(API 진실), `content/reference/core-entity.md`(`A11yAttributes` 표면, `getA11yAttributes`/`getContentProjection`/`getContentEpoch` 후크).
- **다음으로 이동**: Boss 04(스트리밍 Markdown — `Markdown` 가상화 핸드셰이크 + 이 보스의 창을 재사용하는 증분 조정), Boss 07(렌더러 — 시각적 계층을 위한 클립/DPR 일관성), Boss 12(DevTools — 가상화 상태를 위한 `getDevtoolsDescriptor` 표면).

`vectojs-docs/content`과 `vectojs-website/src/content` 사이에 `cp -r` 없음 — 형식 드리프트 + 408 i18n 파일(`AGENTS.md`). 먼저 권한 있는 쪽(`vectojs-docs/content`)을 편집하고 `scripts/sync-content.py`로 미리 본 다음 두 저장소를 모두 푸시하세요.

## 불변식 (이 보스의 커밋 체크리스트)

1. **더티 + 기하학이 일치합니다.** `getContentProjection()` 출력이 다를 때마다 `getContentEpoch()` 범프가 발생합니다. `Scene`는 두 번째 동기화부터 변경되지 않은 블록을 건너뜁니다. 이를 위반하면 `O(changed)` 대신 프레임당 `O(total blocks)`이(가) 지불됩니다. `content-visibility` 지름길은 없습니다. 측정되고 거부되었습니다. `onDemand` 유휴 엔터티는 정의상 더티가 아닙니다.
2. **표시되는 모든 대화형에 대한 이중 세계 패리티.** 세계 기하학, 역할/이름/상태 및 포커스/포인터 라우팅은 공유된 `syncA11y` 걷기 및 `enforceA11yDomOrder`의 지역별 시각적 정렬에 의해 시행되는 캔버스 진실과 일치합니다. 하나의 `interactive = false` 대 `a11yHidden` 슬립은 숨겨진 컨트롤을 탭 순서로 투영합니다. 액세스 가능한 이름이 `aria-labelledby`/포함된 텍스트에서 나오지 않는 한 모든 대화형은 `aria-label`을 전달합니다. `a11yFullViewport` 거울은 항상 일반 거울 뒤에 있습니다.
3. **연속 창.** 선 그리드 창은 블록당 단일 연속 실행입니다(`scene/content-line-window.ts:Contiguous on purpose`). 간격이 있으면 선택/복사 순서에서 텍스트가 이어집니다. `clipChildren`/`a11yRegion`은 유일한 지역 구분입니다. 의미론적 한계와 상호작용 한계 사이의 분할은 전체 API입니다. 이를 축소하지 마십시오.
4. **포인터 소유자는 명시적입니다.** 모든 핫스팟 쌍은 포인터 소유자를 선언합니다. 엔터티를 직접 구동하는 테스트는 마우스 경로(`forge/findings/core-a11y-and-input.md:336`)를 침묵시키는 `pointerEvents: 'none'`을 포착하지 않습니다. 맞물리지 않은 `onDemand`은 설계상 포인터가 작동하지 않습니다. AT가 보이지 않는 포인터 표면에는 `a11yFullViewport` + `eager` + `tabIndex: -1`를 사용하세요.
5. **읽는 순서는 삽입이 아니라 시각적입니다.** `A11yProjectionManager.sortNormalElementsVisually` + 영역 버킷팅은 탭/AT 순서입니다. 임의의 순서로 자식을 삽입하지만 왼쪽→오른쪽을 그리는 경우 여전히 왼쪽→오른쪽 탭을 사용해야 합니다. `a11yHidden`은 불투명도에서 추론되지 않습니다. `forcedColors`(`Scene.forcedColors`)은 투영 문제가 아닌 다시 그리기 문제입니다. 고대비 그림은 시각적 계층에 유지됩니다.
6. **예산은 표시되는 텍스트를 숨기지 않습니다.** `contentSemanticBudget`은 상호 작용 범위 내에서 블록을 지연시키지 않습니다. 표시되는 텍스트를 연기하면 일시적으로 선택할 수 없게 됩니다(`Scene.ts:376`). 보증은 `ContentProjectionSettledWalk.test.ts`(2 vs 802 박스 테스트)로 테스트되었습니다. `Infinity`은 `contentSemanticMargin`에는 안전하고 `contentProjectionMargin`에는 금지되어 있습니다. 이를 지원하지 않게 만든 비용은 상주 텍스트가 아니라 윈도우가 없는 캐리어 밴드였습니다.
7. **가상화된 세트는 데이터 세트 크기를 나타냅니다.** 10,000개의 항목이 있지만 12개의 마운트된 행이 있는 가상화된 목록/그리드는 `posInSet`/`setSize`(또는 `aria-rowcount`)를 투영해야 AT가 "12개 항목 중 3개 항목"이 아닌 "10000개 항목 400"을 듣게 됩니다. `role="list"`의 컨테이너 수준 `aria-setsize`은 허용되지 않습니다(`VirtualList.ts:660`).

## 더 읽어보기 — 모든 주장의 근거

| 주장                      | `file:line`                                                                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scene 옵션/예산           | `Scene.ts:204`, `263`, `328`, `336`, `359`, `600`, `1398`, `1481`, `2403`, `3512`                                                                                                                   |
| Entity a11y + 콘텐츠 후크 | `Entity.ts:295`, `788`, `912`, `968`, `1898`, `1970`, `2018`, `2048`                                                                                                                                |
| 프로젝션 매니저           | `A11yProjectionManager.ts:30`, `157`, `169`, `178`, `351` · `ContentProjectionManager.ts:26` · `ContentGridProjector.ts:69` · `content-line-window.ts:25`                                           |
| UI 가상화                 | `ScrollView.ts:58`, `233`, `289` · `VirtualList.ts:14`, `117`, `170`, `660` · `Table.ts:144`, `392`, `624`, `751` · `Card.ts:80`                                                                    |
| Markdown 타일링           | `Markdown.ts:625`, `652`, `681`, `774`                                                                                                                                                              |
| 조사 결과/기준            | `forge/findings/core-a11y-and-input.md:178`·`240`·`336` · `forge/baselines/content-projection-frontload-findings.md:1` · `content/learn/accessibility.md:353` · `content/reference/core-a11y.md:10` |
| 핫스팟 선례               | `vectojs/AGENTS.md` (Zero-DOM 핫스팟) · PR #160 · PR #191 · `Table.ts:56`                                                                                                                           |

---

_다음: 04 스트리밍 Markdown — 증분 lex, 작업자 + 조정 및 `Markdown`←`ScrollView` 가상화 핸드셰이크._
