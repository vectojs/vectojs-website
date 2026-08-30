---
title: '01 — 캔버스 네이티브 선택 — Dual-World Parity'
description: '캔버스에 선택이 없는 이유, VectoJS가 페인트된 세계와 DOM 선택 세계를 패리티로 유지하는 방법, 그리고 이를 지키는 모든 불변식.'
order: 21
date: 2026-08-29
---

# 01 — 캔버스 네이티브 선택 — Dual-World Parity

> 캔버스는 비트맵 위의 잉크입니다. 브라우저의 선택 메커니즘 — `Range`, `Selection`, `getBoundingClientRect`, `copy`, `find-in-page`, IME — 은 DOM에 존재합니다. VectoJS는 매 프레임 두 세계를 정렬합니다: **시각 세계**(GPU가 그리는 것)와 **DOM 선택 세계**(브라우저가 선택할 수 있는 것). 이 문서는 둘 사이의 계약입니다.

## 1. 캔버스에는 왜 선택이 없는가

DOM은 텍스트에 세 가지를 무료로 제공합니다.

1. **히트 지오메트리** — `Range.getClientRects()`은 모든 하위 문자열에 대해 브라우저 자체 레이아웃 상자를 반환합니다.
2. **클립보드 소스** — `textContent` + `Selection.toString()` + `copy` 이벤트는 브라우저에 직렬화할 선형 문자열을 제공합니다.
3. **편집 서피스** — `<input>` / `<textarea>`은 IME 후보 창, `compositionstart/update/end` 및 `selectionStart/End`을 소유합니다.

`CanvasRenderingContext2D.fillText`은 픽셀을 씁니다. 브라우저는 이름을 지정하거나 찾거나 복사할 수 없습니다. `find-in-page`(Ctrl+F), `#:~:text=` 조각 링크, 번역 확장 프로그램, 리더 모드, 스크린 리더 및 크롤러는 모두 DOM-walking입니다. 캔버스는 그들 모두에게 보이지 않습니다. 기본 선택을 원하는 모든 캔버스 UI는 의미론적 DOM 레이어를 **투영**하고 잉크와 기하학적으로 구별할 수 없도록 유지해야 합니다. 0.5 px의 드리프트는 글리프에서 눈에 띄게 밀리는 하이라이트를 그립니다. 한 문자의 드리프트로 인해 잘못된 텍스트가 복사됩니다. 하나의 그라핌 클러스터 드리프트로 인해 CJK 및 이모티콘의 캐럿 배치가 중단됩니다.

실패는 항상 기하학적이며 보정과 결합됩니다. `getBoundingClientRect`이 양자화(DPR)되거나, `style.font`이 게터(Chrome 480×)이거나, 오버레이의 포함 블록이 합성기와 경쟁하는 경우(`fixed` 대 `absolute`) 올바른 그라핌별 레이아웃도 드리프트합니다. 지오메트리, 측정 및 합성기 정렬은 3개가 아닌 하나의 시스템입니다. 동일한 논리 문자열에서 파생되지만 다르게 측정하는 두 개의 레이아웃(다른 `measureText` 경로, 다른 줄 바꿈, 다른 bidi 순서, 다른 탭 정지)은 분기됩니다. 모든 VectoJS 텍스트에 대한 규칙: **한 번 컴파일하고 두 번 사용** — 하나의 retained 지오메트리 계획은 페인트와 투영을 모두 제공하며 절대 두 개의 독립적인 레이아웃을 만들지 않습니다.

## 2. 두 세계

```text
┌──────────────────────────────────────────────────────────────────┐
│  Visual world — canvas                                           │
│  source: string ──► LayoutEngine / prepareContentGrid            │
│       │                    │                                     │
│       │  PreparedText / PreparedContentGrid (immutable, retained)│
│       ▼                    ▼                                     │
│  flushRun / per-glyph fillText / MSDF atlas ──► pixels           │
│  at world transform (a,b,c,d,e,f) × DPR × page zoom              │
└──────────────────────────────┬───────────────────────────────────┘
                               │  same source, same plan, same epoch
                               │  same font, same advances, same x/y
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  DOM selection world — a11y / content layer                      │
│  getContentProjection() ──► ContentProjection                     │
│       │  { text, font, lineHeight, baseline, lines[], grid }     │
│       ▼                                                          │
│  Scene.syncA11y ──► per-line carriers (<span>)                   │
│       │  data-vecto-grid-cell / per-grapheme spans               │
│       ▼                                                          │
│  live DOM Range ──► Selection / copy / find / IME anchor         │
└──────────────────────────────┬───────────────────────────────────┘
                               ↕
              calibrated each frame by CanvasGeometry
              + ContentProjectionManager grid calibration
              + DPR / page zoom compensation (256 px basis)
              + font-epoch / viewport-epoch generation stamping
```

두 세계 모두 **하나의 논리적 원천**(`source: string`)와 하나의 유지된 형상 계획에서 파생됩니다. DOM에 대한 소스를 재분절하면 필연적으로 불일치하는 두 번째 레이아웃이 생성됩니다. 즉, CJK에서 다른 단어 분리, 다른 bidi 시각 순서, 다른 탭 열 정지, 다른 줄 높이 분포 등이 있습니다. 투영은 재레이아웃하지 않습니다. 엔진 자체 좌표를 재사용합니다.

`packages/text/src/PreparedContentGrid.ts`의 prepared 그리드와 `packages/layout/src/LayoutEngine.ts`의 prose는 단위(그리드 셀 대 CSS px)만 다릅니다. 둘 다 셀/글리프당 `x/advance/level`를 방출하므로 동일한 Bidi 인식 배치가 둘 다 제공합니다.

캐리어를 호스팅하는 오버레이는 그 자체로 기하학적 산물입니다. `CanvasGeometry.syncOverlay`(`packages/core/src/tree/scene/CanvasGeometry.ts:1`)은 스크롤에 JS 보상이 필요한지 여부를 결정하는 `position: fixed` 대 `absolute` 포함 블록 구별을 포함하여 `getBoundingClientRect`를 통해 캔버스 CSS 상자와 정렬된 `a11yRoot`/`portalRoot` 레이어를 유지합니다(§4.3). 오버레이의 CSS `transform: scale(cssWidth/width, cssHeight/height)`은 논리적 Scene 좌표를 CSS 상자에 매핑합니다. 그런 다음 콘텐츠 프로젝션 관리자는 논리적 선 좌표를 여기에 매핑합니다.

## 3. VectoJS가 이를 연결하는 방법

### 3.1 하나의 retained 플랜, 두 소비자

**Prose 문서** — `Markdown` (`packages/markdown/src/Markdown.ts`), `RichText` / `Text` (`packages/ui/src/RichText.ts`, `packages/ui/src/Text.ts`)는 `LayoutEngine` (`packages/layout/src/LayoutEngine.ts:1`)을 통해 레이아웃됩니다. 엔진은 `nodes: PreparedGlyph[]`과 함께 `LayoutResult`을 방출하며, 각각은 `x / y / width / height / sourceIndex / sourceLength / isRTL / style / object`을 운반합니다. `RichText.buildVisualLineGroups()` (`packages/ui/src/RichText.ts:668`)은 기준선(`node.y + 0.8*height`)을 기준으로 글리프를 그룹화하고 `sourceText`을 `projectedSlice()`(`packages/ui/src/RichText.ts:506`)로 분할하여 인라인 객체 `alt`이 DOM 텍스트의 `U+FFFC`을 대체하고 `sourceIndex` 산술은 그대로 유지되고 `runs`로 `ContentProjection.lines[]`을 내보냅니다. `perGraphemeCarriers`, `shapedPaint`, `lineHeight`, `baseline`, `font`. 거친 계층(`hint.textOnly`)은 건물 선 없이 `{ text, font, lineHeight }`을 반환합니다. 뷰포트를 벗어난 블록의 경우 O(1)입니다. Canvas `render()` 및 `getContentProjection()`은 동일한 `result` 개체를 공유합니다. ID(`===`)는 무효화 신호(`packages/ui/src/RichText.ts:259`, `_lineGroupsCache`)입니다. `Markdown`는 문서 규모에서 동일한 작업을 수행하여 `contentSemanticBudgetLeft` 게이트 구체화(`packages/core/src/tree/Scene.ts:600`, `DEFAULT_CONTENT_SEMANTIC_BUDGET = 256`)를 사용하여 `RichText` 블록의 `Stack`을 구성합니다.

**코드형 그리드** — 터미널, 편집기, `CodeBlock`(`packages/markdown/src/markdown-code.ts`)은 `prepareContentGrid()`(`packages/text/src/PreparedContentGrid.ts:prepareContentGrid`)을 통해 컴파일됩니다. Input은 `font`(CSS 약칭), `cellWidth`, `lineHeight`, `baseline`, `tabSize`입니다. 출력은 변경할 수 없는 `PreparedContentGrid`(`kind: 'content-grid'`, `revision`, `lines: PreparedContentGridLine[]`)입니다. 여기서 각 `PreparedContentGridCell`은 `sourceStart/End`, `sourceCaretOffsets`(법적 그라핌 경계), `glyph`(모양), `x`, `advance`, `level`(bidi)을 전달합니다. 아랍어 형성(`ArabicShaper.ts`) 및 bidi 재정렬(`BidiResolver.ts:reorderVisual`)은 한 번 실행됩니다. 셀은 `x` 인코딩 시각적 순서를 사용하여 논리적 소스 순서로 유지됩니다. `Typography.cssLineBoxBaseline()`(`packages/text/src/Typography.ts:cssLineBoxBaseline`)은 공유 연결된 컨텍스트를 통해 `fontBoundingBoxAscent/Descent`에서 캔버스 호환 기준선을 파생합니다. 두 세계에서 사용하는 것과 동일한 값입니다. 그리드는 `ContentProjection.grid`으로 반환되며 페인트와 투영 모두에 재사용됩니다. 탭, 넓은 CJK/이모지(`isWideCluster`), `VS15/VS16` 변형, ZWJ 클러스터, bidi 수준, `CR/LF/CRLF` 소스 소유권(`nextSourceStart`)이 하나의 계획을 공유합니다.

**왜 retained가 중요한가.** DOM의 소스를 다시 분할하면 두 번째 레이아웃이 생성됩니다. `compare-pretext.ts`에서 측정됨: 순진한 `0.5em` 폴백은 최대 50%(일본어)까지 꺼진 반면 VectoJS는 실제 측정 항목이 주어졌을 때 0% 줄 수 오류로 DOM 지상 실제와 일치했습니다. 두 가지 레이아웃은 항상 일치하지 않습니다. 하나의 계획으로 문제가 해결됩니다.

### 3.2 그라핌별 캐리어 — 유일하게 정확한 세분성

`Scene.syncA11y`은 선택 가능한 산문(`packages/core/src/tree/Scene.ts:760`ff, `perGraphemeCarriers` 경로)에 대해 **자소**당 하나의 보이지 않는 캐리어 `<span>`을 구체화합니다. 각 캐리어의 너비는 라인의 실제 글꼴에서 **격리된** 그라핌 진행입니다. `left`는 해당 인덱스에서 누적된 논리적 오프셋을 뺀 모양의 접두사 너비입니다. 자소별 이유:

- 하나의 자소보다 거친 캐리어는 캐리어 내 오류가 그리드 피팅이 아닌 **커닝**이기 때문에 이미 실패합니다. 반송파당 **2개** 자소의 혼합 CJK+라틴 문자는 −0.582 px(`vectojs-docs/KNOWN_ISSUES.md:137`)입니다. 비선형, 클러스터별, 균일한 수정이 이를 흡수할 수 없습니다.
- Gecko 그리드 핏 DOM 레이아웃은 정수 장치 픽셀로 발전하는 반면 캔버스 `measureText`은 분수 픽셀을 유지합니다: 문자당 ~0.36%, 선형으로 누적됩니다. `text-rendering: geometricPrecision` 및 커닝/합자를 비활성화하면 `auto`과 **동일**하게 측정됩니다. CSS 탈출구(`packages/text/src/measureContext.ts:34`, `KNOWN_ISSUES.md:131`)는 없습니다. 자소당 하나의 캐리어가 배송되는 수정 사항입니다. `Monospace`(균일 전진)은 완전히 차단됩니다(드리프트 0, 캐리어 없음).
- 캐리어는 논리적 DOM 순서로 `position: relative` + `display: inline-block`이고 `left = run.x − runningLogicalX`입니다(자소 경로당 `packages/ui/src/RichText.ts:584`, `Scene.ts`). 절대 `absolute` — 인라인 상자를 차단하고(`computed display: block`) 레이아웃 인식 일반 텍스트 직렬화는 모든 블록 상자에서 중단됩니다. `innerText`는 양쪽 맞춤 텍스트(`KNOWN_ISSUES.md:190`)에 대해 줄 바꿈 16개 대 올바른 2개, 공백 0개 대 올바른 14개를 생성했습니다. Flow-relative는 복사, 페이지에서 찾기 및 화면 판독기에서 한 줄을 한 줄로 읽습니다. RTL/bidi는 이 경로를 공유합니다. 시각적 `x`은 `BidiResolver` 수준에서 나오고 DOM 순서는 논리적으로 유지됩니다.

`ui/Text`의 빠른 경로는 예외입니다. 한 줄에 하나의 모양으로 된 `fillText`(잉크에 커닝/합자 포함)은 `ContentProjectionLine.shapedPaint = true`(`packages/ui/src/RichText.ts:shapedPaint`)를 선언합니다. 해당 항공사는 의도적으로 **모양** 접두사 차이를 사용합니다. 즉 일치하는 페인트(§4.1)입니다. 정렬된 라인은 자소당 캐리어를 사용하지 않습니다. 레이아웃 자체의 `positionedRuns` 기하학(`packages/ui/src/RichText.ts:626`)을 재사용합니다.

분할 자체는 `granularity: 'grapheme'`(`packages/text/src/PreparedContentGrid.ts:graphemes`, `packages/core/src/tree/Scene.ts:graphemeBoundaries`)을 사용하여 `Intl.Segmenter`을 통해 이루어집니다. Fallback은 결합 표시, 변형 선택기(`VS15/VS16`), 이모티콘 수정자, 키캡, 지역 표시기 및 ZWJ를 포괄하는 결정적 코드포인트 수준 분할기(`fallbackGraphemes`)입니다. 고정 폭은 분할이 전혀 필요하지 않습니다(셀 = 문자, `PreparedContentGrid`은 여전히 셀 그리드의 이모티콘에 대해 ZWJ를 인식함).

### 3.3 콘텐츠 그리드 투영 — retained 경로

그리드 캐리어는 `data-vecto-grid-sourceStart/SourceLength/advance/x/level/caretOffsets/font/lineHeight`(`packages/core/src/tree/scene/ContentGridProjector.ts:291`)을 운반하는 `data-vecto-grid-cell` 스팬입니다. 그들은:

- **창 표시** — 뷰포트 마운트 근처의 선만(`contentProjectionMargin`, `packages/core/src/tree/Scene.ts:projectedLines`의 힌트 `minY/maxY`). 오프스크린 캐리어는 `display: none`이며 입력을 가로챌 수 없습니다.
- **재사용**(`carrier reuse`, `#244`) — 스트리밍된 추가는 손대지 않은 라인의 보정된 `scaleX` 변환을 제자리(`packages/core/src/tree/scene/ContentProjectionManager.ts:536`)에서 재사용합니다. 재건된 꼬리의 셀만 교정 대기 중입니다.
- **글꼴 미러링** — `ContentGridProjector`은 글꼴을 `data-vecto-grid-font`에 미러링하므로 교정 시 `target.style.font`을 건드리지 않고 일반 문자열로 다시 읽습니다. Chrome에서는 읽을 때마다 다시 직렬화합니다(`ContentProjectionManager.ts:292`, §4.4).

그리드에서의 선택은 선형 DOM 오프셋이 아닌 **소스 오프셋**(`ContentProjectionManager.ts:snapshotGridSelection`, `gridSelectionEndpointOffset`)으로서의 스냅샷입니다. `gridSelectionEndpointOffset`는 라이브 `Selection.anchorNode/focusNode`에서 캐리어 셀의 `sourceStart`까지 이동하고 `sourceLength`로 고정된 셀-로컬 오프셋을 추가합니다(후행 하드 브레이크는 동일한 텍스트 노드에 있지만 셀에는 속하지 않음). 소스 오프셋은 줄 바꿈, 윈도우잉 및 셀별 `scaleX` 보정에 대해 안정적입니다. 선형 오프셋 0은 "현재 구체화된 첫 번째 줄"을 의미하며 창이 실행될 때 이동합니다. `gridCaretAtSourceOffset`은 논리적 순서로 `data-vecto-grid-cell`을 스캔하여 저장된 오프셋을 다시 `TextCaretPosition`로 확인합니다. 먼저 포함하는 셀이 승리하고 경계는 이전 셀의 끝(동일한 캐럿)으로 확인됩니다.

### 3.4 투영 매니저 — 누가 무엇을 소유하는가

`Scene`은 6.5k 라인입니다. 투영은 `forge/decisions/file-decomposition-2026-08.md`에 따라 분해되었습니다.

| 소유자                                     | 파일                                                       | 소유한 것                                                                                                                                                                                                                             |
| ------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Scene.syncA11y` + `syncContentProjection` | `packages/core/src/tree/Scene.ts`                          | 걷기, 더티 검사 `ContentSyncState`, 4개의 동기화별 필드(`_syncSerial`, `contentSemanticBudgetLeft`, `contentSemanticDeferred`, `contentSelectionPresentThisSync`), `enforceA11yDomOrder`                                              |
| `ContentProjectionManager`                 | `packages/core/src/tree/scene/ContentProjectionManager.ts` | 선택 보존(`preserveSelectionAcrossRebuild`, `snapshotGridSelection`/`restoreGridSelection`), 그리드 교정(`scheduleGridCalibration`), 공백 영역 드래그 앵커(`beginBlankRegionDrag`/`gridSelectionLine`), 생성 스탬핑, 프로브 수명 주기 |
| `CanvasGeometry`                           | `packages/core/src/tree/scene/CanvasGeometry.ts`           | `clientToScene`, `syncOverlay`, `effectiveDPR`, `sizeGpuCanvas`, `OverlayGeometry` 메모                                                                                                                                               |
| `ContentGridProjector`                     | `packages/core/src/tree/scene/ContentGridProjector.ts`     | 캐리어 구체화, `prepareContentGrid` 소비, 데이터 속성 미러링                                                                                                                                                                          |
| `A11yProjectionManager`                    | `packages/core/src/tree/scene/A11yProjectionManager.ts`    | 주문(`enforceA11yDomOrder` 위임), `pruneA11ySubtree`, `removeA11yRecursively`, `getA11yTree`                                                                                                                                          |
| `Entity` a11y 후크                         | `packages/core/src/tree/Entity.ts:ContentProjection*`      | `ContentProjection` / `ContentProjectionLine` / `ContentProjectionHint` 유형, `getContentProjection(hint?)` 계약, `contentEpoch`                                                                                                      |

4개의 동기화별 필드는 함께 이동합니다(`DEC-0020`/`DEC-0022` 분할 금지). `syncContentProjection`(624줄)은 `syncA11y`이 자체 재귀 지점에서 호출하기 때문에 `Scene`에 유지됩니다. 둘 중 하나만 추출하려면 백 에지가 필요합니다(`DEC-0019` 규칙 1). 프로젝션 관리자는 추출 3으로 범위가 `DEC-0022`만큼 축소되었습니다. 걷기 자체는 `syncA11y`과 한 쌍으로만 움직입니다.

### 3.5 동기화 타이밍 — 사용자에게 반쯤 만들어진 DOM을 절대 보여주지 않기

**프레임당: 구체화 후 보정.** 보정은 콜드 2프레임 배치(`ContentProjectionManager.ts:700`ff)입니다. 프레임 N은 화면에서 멀리 떨어진 프로브(`left: -100000px`, `width: 100000px`, `contain: layout style paint`)를 구축하고, 프레임 N+1은 `Range.getBoundingClientRect().width`을 읽고 셀당 `scaleX`을 씁니다(`element.style.transform = scaleX(...)`). 겹쳐서 안정적인 상태 스트리밍(레이아웃 변경 없이 추가)에는 `querySelectorAll` 선택기 일치 비용이 1회 발생합니다. 두 가지 초기 종료는 프로브를 완전히 방지합니다. `pendingCells.length === 0`(이미 보정됨, `vectoGridReady`는 프레임 콜백에서 게시됨, 동기식으로 게시되지 않음 - 그렇지 않으면 동일한 작업에서 이전에 배치된 캐리어가 너비가 0인 직사각형을 전달함) 및 `measurements.length === 0`(보류 중인 모든 셀이 0으로 진행되거나 비어 있고 즉시 스탬프 처리됨).

**읽기 비용: 요소당이 아닌 워크당 하나의 레이아웃.** `selectionPresent()`(`ContentProjectionManager.ts:selectionPresent`)은 하나의 `Selection.anchorNode` 읽기를 `presentThisSync`(싱크 워크당 하나의 강제 레이아웃)에 메모합니다. `releaseSelectionForRebuild` 추적된 앵커나 라이브 선택이 모두 존재하지 않는 경우 저렴한 거부 — 대량 구체화 경로(수백 개의 블록)는 레이아웃을 지불하지 않습니다. `presentThisSync`은 각 걷기의 상단에서 무효화되고 릴리스 또는 `setBaseAndExtent` 후에는 지워집니다.

**생성 스탬핑.** 글꼴 시대(웹 글꼴 로드 시 충돌, `createMeasuringContext` 재현)와 `pageScaleX`(브라우저 확대/축소, 기준 256px)이 교정 생성(`ContentProjectionManager.ts:524`, `stamp = fontEpoch:pageScaleX.toFixed(4)`)을 형성합니다. 범프는 `calibrationGeneration` 증가합니다. 모든 셀별 `scaleX`은 캐리어를 건드리지 않으면 암시적으로 유효하지 않습니다. 셀은 `data-vecto-grid-calib = generation`을 운반하므로 재사용하면 손대지 않은 라인만 남습니다.

**재구축 위험.** 사용자가 변경되지 않은 접두사에서 선택 항목을 갖고 있는 동안 프로젝션 하위 항목을 교체하면 해당 항목이 지워집니다. 스트리밍 메시지는 추가된 모든 청크에서 해당 프로젝션 하위 항목을 대체합니다. `preserveSelectionAcrossRebuild`(`ContentProjectionManager.ts:preserveSelectionAcrossRebuild`)은 산문의 경우 선형 문자 오프셋(`projectionAbsoluteOffset`) 또는 그리드의 소스 오프셋으로 끝점의 스냅샷을 찍고, 빈 영역 드래그가 활성화된 경우(브라우저가 중간 드래그 권한을 가짐) 또는 소유 요소에 선택 항목이 포함되지 않은 경우 건너뛴 다음 `rebuild()` 이후 새 DOM에 대해 다시 확인하고 `Selection.setBaseAndExtent`를 통해 복원합니다. `A11yProjectionManager.ts:211`의 인접한 `refocus` 스냅샷은 `document.activeElement`에 대해 동일한 작업을 수행합니다. `KNOWN_ISSUES.md:232`의 스트리밍 축소 수정 이전에는 선택 항목에 상응하는 항목이 없었습니다.

**가상화 경계.** `contentProjectionMargin`(유한) 전체 오프스크린 블록을 해제합니다. `Infinity`은 상주 상태를 유지합니다(10,000블록에서 `syncA11y`당 ~137ms). 브라우저 찾기는 구체화된 콘텐츠를 다룹니다. 마운트되지 않은 가상화된 엔터티는 검색할 수 없습니다. 앱은 찾기 대상을 상주해야 합니다.

**예산이 256인 이유.** 두 가지 측정된 비용에 대해 크기를 조정했습니다. 즉, 블록당 하나의 `Span` 생성(~0.4ms)과 걷기 완료입니다. 64에서 총 벽 시간은 프레임 제한 이득(`Scene.ts:595`) 없이 ~6×(`ContentGridPageScaleBasis.test.ts` 시대)였습니다. 256은 두 골의 거래가 중단되는 지점입니다.

**지연된 예산.** `contentSemanticBudgetLeft`(`Scene.ts:600`, 기본 256개 블록)은 동기화 워크 1개를 제한하므로 10,000블록 문서는 버벅거리는 프레임 하나가 아닌 최대 285개 패스로 완료됩니다. `contentSemanticDeferred`는 오버플로를 보유합니다. `contentViewportEpoch`은 블록을 이동하지 않고도 계층 크기 조정을 보장합니다. 지연된 꼬리의 캐리어는 통과할 때까지 대략적(`textOnly`)입니다. 선택 형상도 함께 지연됩니다. 이는 오프스크린 블록이 드래그를 소유할 수 없기 때문에 올바른 것입니다.

### 3.6 포인터 → 캐럿: 클릭이 올바른 Text 노드를 찾는 방법

클릭은 뷰포트(`clientX/Y`)에서 시작하고 논리적 Scene 좌표의 `TextCaretPosition { node: Text, offset: number }`에 도달해야 합니다(`Scene.ts:clientToScene`은 적중 테스트에만 사용되며 투영에는 자체 역이 있습니다).

- **Prose 문서 라인**(`Scene.ts:nearestOffsetForPoint`): 라인에 대한 `Text` 노드가 주어지면 `graphemeBoundaries()`(§3.2과 동일한 `Intl.Segmenter`)을 열거하고, 각 경계에 접힌 `Range`을 배치하고, `range.getBoundingClientRect()`를 호출하여 브라우저의 자체 문자 상자를 얻고, `distanceToRectSquared`로 가장 가까운 것을 선택합니다. 캐럿은 클러스터 내부가 아닌 합법적인 그라핌 가장자리에 위치합니다. `distanceToRectSquared`은 뷰포트 가장자리에 대해 테스트되므로 라인 외부의 누락이 여전히 가장 가까운 끝점으로 해결됩니다.
- **그리드 셀** (`Scene.ts:gridCellCaret`, `nearestGridPositionInLine`): 셀 데이터 `level/advance/x/caretOffsets`은 시각적 대 소스 비율을 제공합니다. `visuallyRtl = (level & 1) !== 0`은 `visualFraction → sourceFraction`을 뒤집은 다음 `caretIndex = round(sourceFraction × (caretOffsets.length−1))`을 뒤집습니다. 매핑은 Bidi를 인식합니다. RTL 셀의 가장 오른쪽 시각적 지점은 논리적 시작입니다. `nearestGridPositionInLine`는 정확한 적중을 위해 `localX ∈ [x, x+advance]`로 셀을 사전 필터링한 다음 수평 거리로 가장 가까운 값을 필터링합니다.
- **아핀 변환 아래의 그리드 선**(`Scene.ts:clientToGridLocal`): 빠른 경로는 라인 0(`ContentGridProjector.ts:basis markers`)에 배치된 3개의 `data-vecto-grid-basis="origin/x/y"` 마커를 읽고 2×2 기준(`determinant = xx*yy − xy*yx`)을 반전하여 아핀을 복구합니다. 대체는 콘텐츠 루트의 CSS `transform`(`parseCssMatrix`)을 반전시키고 DPR/페이지 확대/축소에 대한 `canvasRect → logical` 배율을 보상합니다. 동일한 결정자 임계값(`1e-9`)이 두 가지 모두를 게이트합니다. 선이 회전되지 않거나 크기 조정되지 않은 경우(`a>0, d>0, |b|,|c| ≤1e-9`), `Scene.ts:nearestGridPosition`는 전체 역행렬을 건너뛰고 `localX = (clientX − rect.left)/scaleX`을 하나의 추가 저렴한 경로에 매핑합니다.

세 가지 모두 하나의 어휘를 공유합니다: `collectTextNodes` / `projectionAbsoluteOffset` / `projectionCaretAt` (`packages/core/src/tree/scene/content-caret.ts:1`). 후자의 `affinity: 'forward' | 'backward'`는 경계 오프셋을 선행 또는 후행 텍스트 노드에 고정합니다. 이는 선택 항목을 셀 N의 끝으로 복원하는 것과 동일한 캐럿인 셀 N+1의 시작으로 복원하는 것의 차이입니다.

### 3.7 베이스라인 계약: 하나의 숫자, 두 렌더러

Canvas 텍스트 및 콘텐츠 투영은 CSS 라인 상자 내에서 동일한 기준선 오프셋을 사용해야 합니다. 또는 첫 번째 라인 이후의 모든 라인은 수직 드리프트를 누적해야 합니다(라인당 ~0.35em으로 측정되고 24px에서 라인 0에서 ~6px, CTX-0333/0334에서 수정됨).

`Typography.cssLineBoxBaseline()`(`packages/text/src/Typography.ts:cssLineBoxBaseline`)은 단일 소스: `baseline = (lineHeight − ascent − descent)/2 + ascent`입니다. 3개 계층:

1. **부착된 캔버스**(`getSharedMeasuringContext().measureText('Mg').fontBoundingBoxAscent/Descent`) — 칠해진 캔버스와 동일한 글꼴(§4.2 분리 주의, `Typography.ts:32`). `font\0lineHeight`(`BASELINE_CACHE_MAX = 512`) 키가 포함된 LRU 512 항목, 적중 시 LRU 새로 고침.
2. **등록된 측정항목** (`getFontMetrics(family).ascenderEm/descenderEm × size`, `Typography.ts:registeredBaseline`) — 아직 캔버스가 없거나 SSR에 있는 경우 동일한 센터링 공식이므로 등록된 글꼴과 실제 브라우저가 일치합니다. 네거티브 `descenderEm`은 캔버스 극성과 일치하도록 포지티브로 반전되었습니다.
3. **폴백** — 가족에 오름차순/내림차순이 없는 경우 `lineHeight × 0.8`. 결정론적인 DOM-자유 계약을 유지합니다. SSR과 브라우저는 누락된 레이아웃이 아니라 폴백(fallback)에 의해서만 동의하지 않습니다.

라인 상자의 글꼴 메트릭을 중앙에 두는 모든 작업 스트림은 이를 `RichText.buildVisualLineGroups`, `TextEntity`, `MSDFTextEntity`(글리프가 소스에 1:1로 매핑되는 경우), `ContentGridProjector`이라고 호출해야 합니다. 이 계약 이전에 `TextEntity`/`MSDFTextEntity`는 임시 `0.8em` 및 `(ascender−descender)em` 피치를 사용했으며 Firefox에서 ~6px + 0.35 em/line만큼 투영을 놓쳤습니다(CTX-0333/0334 수정).

### 3.8 메트릭 체인: advance가 해석되는 순서

모든 환경에 캔버스가 있는 것은 아닙니다. `resolveGlyphMeasurer()`(`packages/layout/src/measure.ts:resolveGlyphMeasurer`)이 선호하는 순서대로 참조한 세 개의 레이어:

| 우선순위 | 소스                                          | 파일                                                                                         | 측정 대상                                                                                                                                 | 승리할 때                                                                                                |
| -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1        | Canvas (`createCanvasMeasurer`)               | `packages/layout/src/measure.ts:18`                                                          | `baseSize=100`의 그라핌당 `ctx.measureText(char).width`, 선형적으로 파생됨(`base × fontSize/100`), 캐시 키 `size+family+char+bold/italic` | 캔버스가 있는 브라우저 — 합성된 가중치를 포함하여 렌더러가 실제로 그릴 글꼴을 측정합니다.                |
| 2        | 등록된 MSDF/DOM 무료(`createMetricsMeasurer`) | `packages/layout/src/measure.ts:108`, `packages/text/src/fontMetrics.ts:registerFontMetrics` | 전체 문자열의 경우 `advanceEm(char) × fontSize` 또는 `measureEm(text)`(글리프별로 커닝을 처리할 수 없는 경우)                             | 노드 SSR, `OffscreenCanvas`이 없는 작업자, 테스트 — 시작 시 하나의 `registerFontMetrics(family, source)` |
| 3        | 대체                                          | `packages/layout/src/LayoutEngine.ts:unmeasuredGlyphs`                                       | 글리프당 `0.5em`                                                                                                                          | 최후의 수단 — `unmeasuredGlyphCount()`은                                                                 |

체인 규칙: 캔버스가 의도적으로 승리합니다(`measure.ts:resolveGlyphMeasurer` 주석). 등록된 메트릭을 선호하면 오래된 등록이 Ground Truth가 있는 환경에서 Ground Truth를 재정의할 수 있습니다. 등록된 볼드체/이탤릭체는 무시됩니다(패밀리당 단일 고급 테이블). `createCanvasMeasurer`은 실제 렌더링에서 가중치별 문제를 해결하며 가중치가 중요한 경우에 사용해야 합니다. `LayoutEngine`(`packages/layout/src/LayoutEngine.ts:92`)는 `fontFamily/bold/italic`를 사용하여 `StyledSpan` 실행당 측정기를 호출하므로 인라인 `monospace` 또는 굵은 글씨 실행은 자체 측정항목에서 중단됩니다. `fontMetricsVersion()` + 측정자당 `baseVersion` 캐시는 글리프당 `normalizeFamily` 할당을 방지합니다(글리프당 수행되었을 때 측정된 +13%).

`EMPTY_GLYPH_ATLAS`(`packages/layout/src/LayoutEngine.ts:EMPTY_GLYPH_ATLAS`, `packages/ui/src/RichText.ts:371`)은 새로운 `{}`이 아닌 고정된 ID이므로 엔진의 단락 메모(`prepareRich` + `prepare`)는 모든 레이아웃에서 무효화되지 않습니다(측정된 2.68×: 12개 단락의 200개 재레이아웃에서 88 ms → 32.8 ms, 0 → 2388 히트).

### 3.9 스트리밍과 윈도잉: 선택이 문서 규모와 만나는 지점

`Markdown`(`packages/markdown/src/Markdown.ts:681`)은 `RichText` 블록의 `Stack`을 구성합니다. 두 가지 직교 창 메커니즘이 선택과 상호 작용합니다.

- **`virtualizeBlocks`** (`MarkdownOptions.virtualize`, `Markdown.ts:614`, `virtualOverscan` 기본값 800) — 뷰포트 마운트 근처의 최상위 블록입니다. 오프스크린 높이는 `RowHeights`(`height+blockGap` 이상의 펜윅 트리)입니다. 스트리밍과 호환되지 않음(`createStream`/`appendMarkdown`): 가상화하는 문서는 전체를 렌더링해야 합니다. 호출자는 각 스크롤 프레임마다 `setVisibleRange`을 구동합니다(`ScrollView`는 자동으로 수행함).
- **`tableViewportHeight`** (`MarkdownOptions.tableViewportHeight`, `Markdown.ts:652`) — 테이블별 행 가상화(`Table`은 자체 행을 고정된 `viewportHeight`로 가상화합니다). 블록 윈도잉과 무관합니다. `Table.appendRows`이 느리게 마운트되기 때문에 미드스트림에서 작동합니다. 짧은 테이블을 포함한 모든 테이블에 적용됩니다. 2행 테이블도 구성에 따라 이 높이로 고정됩니다(Table은 `viewportHeight`을 `readonly`로 사용함).

`Markdown.streamStats` (`Markdown.ts:951`) — 저렴한 상시 작동 카운터 — **전송**(`tokensPrefixMatched`/`tokensReturned`)을 **파서 비용**(`lexerMs`/`sourceCharsLexed`)과 구별합니다. 이전 이름 지정은 이미 해결된 델타 경로를 최적화하기 위해 독자를 보내는 방식으로 이들을 하나로 묶었습니다. 작업자의 `incrementalLex`은 안정적인 접두사 렉싱을 건너뜁니다. 품질이 저하된 모양(`DegradeReason` 케이스 2개)은 여전히 추가당 O(문서)를 지불합니다. `sourceCharsLexed` 추적 문서 길이가 신호입니다. `stablePrefixChars`은 작업자 자신의 `IncrementalLexCache.stableOffset`에 의해 제공되며 응답당 다시 합산되지 않습니다(n 청크 스트림에 대해 O(n²), #657).

`CodeBlock`(`packages/markdown/src/markdown-code.ts`) 및 디스플레이 수학(`MathBlock`, `packages/markdown/src/markdown-math.ts`)은 레지스트리 펜스 블록 렌더러(`Markdown.ts:138`)가 **아닙니다**. 레지스트리는 `(source, lang, options)`을 수신하지만 두 경로 모두 인스턴스 상태(`onDemand` 장면의 경우 `subscribeInlineMathRepaint` 및 `subscribeInlineMathRaster` / `subscribeInlineImageRaster`와 수식이 선택/찾기/복사에 도달할 수 있도록 하는 단일 객체 `RichText`)가 필요합니다. 레지스트리 복사본이 자동으로 분기되어(서명이 `(formula, svgUri)`인 경우 `MathBlock`이 `(mathRender, source, ...)`로 구성됨) 7개의 테스트가 중단되었습니다(`Markdown.ts:154`). 레지스트리는 패키지가 구현하지 않는 언어에 대한 확장 지점입니다.

복사 관련성: `Table` 셀이 셀당 투영됩니다. `CodeBlock` 그리드는 `PreparedContentGrid`을 사용합니다. `MathBlock` 수식은 투영된 텍스트에 접근 가능한 이름을 더한 것입니다. 각각은 구체화된 경우에만 찾기/선택에 참여합니다. 여러 블록에 걸쳐 있는 선택 항목에 대한 클립보드 복사본은 블록당 `projectedSlice`을 연결한 것입니다. §3.1당 인라인 SVG/Math 대체 대체는 오프셋을 그대로 유지합니다.

### 3.10 베이스라인과 그 존재 이유

`forge/baselines/*` 및 `vectojs-docs/forge/baselines/*`은 이 문서에 인용된 숫자를 고정하여 소문을 통해 다시 측정하는 대신 향후 변경 사항을 양분할 수 있습니다. 구체적으로: 256px 기본 테이블(1/2/4/10/100/1000px → 0.9921875…1.0), Firefox의 `monospace/serif/sans-serif`에 대한 분리형 대 부착형 `measureText('MMMMMMMMMM')` 트리플(`measureContext.ts:1`), 64.8px 스크롤 대 렌더링 불일치(661프레임 / 630px 부드러운 스크롤), 288/290 ms `style.font` getter 비용(Chrome 대 0.6 ms Firefox) 및 `Stack` + `RichText` 차단 메모 적중률(`EMPTY_GLYPH_ATLAS` 이후 0 → 2388). `KNOWN_ISSUES.md`는 그라핌당 거부(두 개의 그라핌 → 혼합 CJK+라틴어에서 −0.582 px) 및 `absolute`-캐리어 일반 텍스트 오류(16개 줄바꿈 대 2, 0개 공백 대 14)를 기록합니다. 새 엔진이나 호스트가 다른 간격을 보고하면 고정된 `DPR/ZOOM`에서 하네스를 다시 실행하고 기준 커밋과 비교합니다. 차이점은 수정 사항이 뷰어 버그인지 VectoJS 회귀인지 여부입니다. `packages/core/test/ContentGridPageScaleBasis.test.ts`은 양자화를 위한 유일한 단위 수준 오라클입니다. 그 밖의 모든 것에는 헤드 브라우저가 필요합니다(`performance.now` 충실도를 위한 COOP/COEP, 합성기 콜백을 위한 집중 창 — `vectojs-performance` 기술 참조).

## 4. 어려운 부분 — 증거와 함께

### 4.1 커닝 드리프트: 전체 문자열 vs 분리된 advance

그라핌별로 **격리된** `measureText(char).width`(산술적으로 배율이 조정된 `packages/layout/src/measure.ts:createCanvasMeasurer` → `getSharedMeasuringContext()`, `baseSize 100`)을 합산하여 레이아웃 위치 글리프를 지정합니다. 페인트는 0.5 픽셀의 레이아웃(`packages/ui/src/RichText.ts:COALESCE_TOLERANCE_PX`) 내에서 유지됩니다. — `flushRun`는 `abs(measureText(runText) − sum(isolated)) ≤ 0.5`(`RichText.ts:1001`)인 경우에만 실행을 하나의 `fillText`로 통합하고, 그렇지 않으면 `node.x`에서 문자별 그리기로 돌아갑니다. 전체 문자열 `measureText(text).width`에는 캔버스가 절대 칠하지 않는 커닝이 포함됩니다. 따라서 전체 문자열 너비를 사용하는 캐리어는 Gecko와 Blink(`KNOWN_ISSUES.md:168`) 모두 ~~300px 커닝이 많은 16px 라틴 라인에서 **누적된 커닝 델타만큼 잉크보다 앞서**, 최대 5~~8px였습니다.

수정: 캐리어 너비는 `ContentProjectionLine.shapedPaint`을 통해 라인의 페인트 모델을 따릅니다. 글리프별 페인터(`RichText`, 핵심 `TextEntity`)는 고립된 그라핌 발전을 얻습니다. `ui/Text`의 빠른 경로(한 줄에 하나의 `fillText` 모양)는 `shapedPaint`를 선언하고 모양의 접두사 차이 캐리어를 유지합니다. 정렬된 선은 레이아웃 자체의 `positionedRuns` 형상을 재사용하며 이러한 드리프트가 발생하지 않았습니다. `logicalRuns`은 `mctx.measureText(segment)`(`RichText.ts:598`)을 통해 격리된 발전을 합산합니다. `positionedRuns`은 `node.x/width`을 직접 재사용합니다. `Scene.ts`의 그라핌별 경로는 이 분기를 반영합니다.

형제 수정 사항: `RichText.logicalRuns`은 이전에 실행당 전체 문자열 측정을 사용했습니다. `Scene`의 그라핌별 경로는 모양 접두사 차이를 측정했습니다. — 동일한 클래스, 동일한 수정(PR #460, `@vectojs/core@1.35.1` + `@vectojs/ui@2.16.3`).

### 4.2 DPR 양자화와 256 px 페이지 스케일 기준

브라우저는 `getBoundingClientRect().left`을 **1/64 장치 px**(`ContentProjectionManager.ts:62`, `CanvasGeometry.ts:PAGE_SCALE_BASIS_PX`)로 반올림합니다. 1px 프로브는 1/64의 배수로 양자화됩니다. DPR 1.1에서 복구된 페이지 규모는 **0.9921875**(=63.5/64)이었습니다. 여기서 true는 1.0, 즉 0.78% 오류(`ContentProjectionManager.ts:68`)였습니다. 모든 셀당 `scaleX = advance * scale / natural`(`ContentProjectionManager.ts:717`)는 해당 요소에 의해 축소되었습니다. 17.8624 px로 선택된 18.0001 px 피치는 모든 CJK 솔기에서 **0.133 px** 간격을 남기고 모든 라틴 솔기에서 0.061 px 간격을 남깁니다. DPR 1.1에서는 장치 픽셀 경계에 도달하고 수직 흰색 선 `使|用|sudo`(`ContentProjectionManager.ts:71`)으로 칠해집니다. 같은 페이지에서 1/2/4/10/100/1000px 기준으로 측정: `0.9921875, 1.0, 0.998046875, 1.0, 1.0, 1.0` — 모든 기준 ≥10px가 정확히 일치했습니다. 1px 읽은 것이 이상치였습니다.

수정: **256px**(`PAGE_SCALE_BASIS_PX = 256`, `ContentProjectionManager.ts:85`) 이상으로 측정하세요. 최악의 경우는 프로브의 100000픽셀 너비 안쪽에 머무르면서 스크롤 막대나 자체 레이아웃(`ContentProjectionManager.ts:80`)을 도입할 수 없는 동안 `1/64 / 256 = 6.1e-5`(18픽셀의 0.0011 픽셀 잔여, 브라우저 표시 가능 픽셀 아래 ~100×)이 됩니다. Oracle 테스트: `packages/core/test/ContentGridPageScaleBasis.test.ts`는 양자화를 직접 모델링합니다.

형제: 분리된 측정 캔버스는 Firefox(`packages/text/src/measureContext.ts:1`)에서 잘못된 일반 계열을 해결합니다. `22px monospace` 분리됨 109.737 대 첨부된 131.579 대 레이아웃 132.000; `serif` 분리는 `monospace`의 폴백으로 축소되었습니다(`serif`에서 −47%, `monospace`에서 −20%). `sans-serif`만이 동의했기 때문에 Chromium 전용 테스트에서 이를 숨겼습니다. 모든 측정자는 `getSharedMeasuringContext()`(첨부됨, `document.body` 상위, `display: none` 없음)을 사용해야 합니다. `OffscreenCanvas`은 올바르게 측정하지만(132.000) 계약은 "페인트하는 위치를 측정"합니다. 페인팅된 캔버스가 부착되어 있으므로 측정하는 캔버스도 부착되어야 합니다. 잔여 ~0.3% 부착 대 레이아웃 간격은 이것이 아닌 §4.4의 Gecko 그리드 핏입니다.

### 4.3 컴포지터 vs 메인 스레드 vs fixed/absolute 드리프트

`position: fixed` 전체 뷰포트 캔버스는 **메인 스레드 외부** 뷰포트에 대해 합성됩니다. `absolute` 오버레이는 스크롤되는 문서에 대해 배치됩니다. **렌더링된** 프레임당 `parent.getBoundingClientRect()`에서 `top`를 다시 파생하여 함께 유지하면 렌더링 없이 스크롤할 때마다 오버레이가 오래되었습니다. 라이브 전체 뷰포트 장면에서 측정된 630px 이상의 실제 키 기반 부드러운 스크롤: 661개의 샘플링 프레임, **1프레임이 64.8px**(`CanvasGeometry.ts:191`)만큼 잘못 정렬되었습니다.

수정: 오버레이는 캔버스 자체의 `position`(`CanvasGeometry.ts:206`, `getComputedStyle(canvas).position`)을 상속합니다. `fixed`은 뷰포트에 대해 `left/top`을 확인합니다. 정확히 `canvasRect.left/top`(`CanvasGeometry.ts:222`)입니다. `absolute`은 `clientLeft/scrollLeft`(`CanvasGeometry.ts:226`)을 사용하여 상위 상대 연산을 유지합니다. 스크롤하면 JS 보상이 필요하지 않습니다. 수정 사항은 더 자주 동기화하는 대신 프레임별 종속성을 **제거**합니다. 스크롤 리스너는 여전히 메인 스레드 작업으로 컴포지터를 경쟁합니다. 남은 쓰기는 메모(`OverlayGeometry: left/top/cssWidth/cssHeight/width/height/position`, `CanvasGeometry.ts:235`)되므로 변경되지 않은 프레임은 아무것도 쓰지 않습니다. 동일한 할당은 여전히 CSSOM에 닿고 오버레이 레이어 수(`CanvasGeometry.ts:250`)에 따라 증가합니다.

### 4.4 CJK 서브픽셀 간격과 폰트 조회 비용

스케일 수정 후 잔류 드리프트는 ~0.36% Gecko 그리드 핏입니다(레이아웃은 정수 장치 px에 맞춰지고 캔버스는 분수로 유지됨). — `text-rendering: geometricPrecision`은 수정이 **아닙니다**, `auto`(`packages/text/src/measureContext.ts:34`, `KNOWN_ISSUES.md:131`)과 동일하게 측정됩니다. 동일한 수준의 놀라움으로 인해 두 번째 독립적인 성능 함정이 발생했습니다. `style.font`는 읽을 때마다 모든 글꼴을 직접 다시 직렬화하는 라이브 속기 게터입니다. 셀당 한 번씩 `target.style.font`를 읽는 보정 스캔은 Chrome에서 **290ms 중 288ms(99.3%)**를 지불한 반면 Firefox는 동일한 루프에서 0.6ms를 소비했습니다. 즉, 작업(`ContentProjectionManager.ts:292`)이 아닌 유일한 신호가 엔진이었던 480× 교차 엔진 간격입니다. 수정: 이동통신사는 일반 `data-vecto-grid-font` 문자열(`ContentGridProjector.ts:291`)을 저장하고 `ContentProjectionManager`는 이를 읽습니다. 프로브의 `contain: layout style paint`이 이를 분리합니다.

### 4.5 IME, 클립보드, 그리고 편집 가능한 미러

`Input` / `TextArea`은 콘텐츠 프로젝션이 **아닙니다**. 그들은 실제 투명한 `<input>` / `<textarea>` (`Site:Accessibility & Automation` §IME 인식 입력 필드, `packages/core/src/tree/Scene.ts:a11y input mirror`, `packages/ui/src/Input.ts` / `TextArea.ts`)을 투사합니다. 브라우저는 IME 후보 창을 소유합니다. 캔버스는 섀도우 노드의 `input`/`change`/`compositionstart/compositionupdate/compositionend` 이벤트에서 `value/selectionStart/selectionEnd/composition`을 미러링하고 프레임당 캐럿, 선택 강조 표시 및 IME 밑줄을 그립니다. 섀도우 노드는 `Entity.getA11yAttributes()` → `Scene`에서 `textInputStyle: { font, lineHeight, padding }`를 통해 크기가 지정되고 캔버스는 동일한 패딩과 `Typography.cssLineBoxBaseline`에서 그리는 동안 `box-sizing: border-box`로 적용됩니다. 즉, 하나의 기준선, 두 명의 소비자, 보이지 않는 편집기와 잉크 미러 사이의 수직 드리프트가 없습니다.

포커스가 있는 동안 `Scene`은 동일한 사용자 동기화 `value`(에코 억제)을 다시 작성하는 것을 방지합니다. 앱 상태가 완전히 다른 값을 제공하는 경우 해당 값이 적용되지만 텍스트를 대체하는 제어 구성 요소는 의도적으로 `selectionStart/End`을 유지해야 합니다. 그렇지 않으면 캐럿이 점프합니다. `Input`은 한 줄짜리 `a11yFullViewport` 인식 엔터티입니다. `TextArea`는 `scrollLeft`/`scrollTop`이 캔버스에 미러링된 여러 줄의 `clipChildren` 인식 스크롤러입니다. 이는 다른 엔터티와 동일한 세계 변환 → 오버레이 경로이므로 DPR/확대/축소/회전이 동일하게 적용됩니다.

클립보드 경로: `cut/copy/paste` 및 `undo/redo`은 해당 섀도우 노드를 통해 편집 가능한 필드에 대한 기본 경로입니다. 정적 선택 가능 텍스트의 경우 `copy`는 투영된 레이어의 브라우저 자체 직렬화입니다. `projectedSlice()`(`packages/ui/src/RichText.ts:506`)는 각 인라인 개체의 `alt`를 **소스** 공간의 `U+FFFC` 센티널로 대체하므로 `LayoutNode.sourceIndex` 산술은 그대로 유지됩니다. 그렇지 않으면 길이가 1이 아닌 `alt`이 이후 오프셋마다 이동하고 선택 상자의 동기화가 해제됩니다. 형제 `accessibleText()`(`RichText.ts:478`)은 `aria-label` 경로에 존재하며 의도적으로 슬라이싱에 사용되지 않습니다. `SeparatorAfter`(논리 개행/보존된 소프트 랩 구분 기호, `ContentProjectionLine.separatorAfter`)는 줄의 최종 텍스트 노드에 병합되므로 Firefox는 투영 루트에 여러 줄 선택 항목의 일부를 배치할 수 없습니다. `Table` 셀 복사, `CodeBlock` 그리드 복사 및 `MathBlock` 수식 복사는 모두 동일한 블록당 `projectedSlice` 연결을 통한 흐름 — §3.1당 인라인 SVG/Math `alt` 대체는 블록 경계 전체에서 오프셋을 그대로 유지합니다.

주의 사항: `packages/devtools/src/selectionAudit.ts:119`은(는) 이전에 `getSelection()`을 캡처한 다음 `removeAllRanges`(`:157`)를 호출했습니다. 이는 사용자 상태를 파괴한 감사입니다. 현재 감사(`selectionAudit.ts:102`)는 `DocumentSelection`을 건드리지 않는 분리된 `Range`(`document.createRange()` + `selectNodeContents` + `getClientRects`)를 사용합니다. 정리할 프로그래밍 방식 선택이 없습니다. 사용자가 선택한 항목을 찾은 그대로 그대로 둡니다.

### 4.6 그라핌, 커닝, 그리고 CJK 흰 간격 — 렌더링 아티팩트처럼 보이는 버그

`使|用|sudo` 아티팩트는 GPU 버그처럼 읽혀집니다. 인접한 Han 문자 사이에 흰색 수직선이 나타납니다. 래스터를 통해 본 선택 투영 버그입니다. 체인은 다음과 같습니다.

1. `getBoundingClientRect().left`은 1픽셀 기준으로 1/64 장치 픽셀로 양자화됨 → DPR 1.1(`ContentProjectionManager.ts:68`)에서 `basisScale` 0.78% 낮음;
2. `scaleX = advance × basisScale / natural` 0.78% 낮음(`:717`);
3. 각 `data-vecto-grid-cell`는 `advance` 너비로 칠해졌지만 선택 상자 크기는 `advance × scaleX` → 모든 CJK 솔기 0.133 px 짧음(`:71`);
4. DPR 1.1에서 부족분은 정확히 장치-픽셀 경계에 도달합니다 → 컴포지터는 하나의 열을 덮지 않은 채로 둡니다 → 흰색.

라틴 솔기는 동일한 형상(0.061 px)이지만 더 좁은 `advance`은 이를 숨깁니다. 래스터라이저 변경, `geometricPrecision`로 전환 또는 커닝 비활성화는 아무 작업도 수행하지 않습니다. 간격은 잉크에 있는 것이 아니라 잉크가 그려지는 `scaleX`에 있습니다. 이를 보호하는 테스트는 페이지 규모 기반 오라클(`ContentGridPageScaleBasis.test.ts`)과 `DPR=1.1`의 헤드 하네스입니다. 머리 없는 DPR 1은 아무것도 재생하지 않습니다.

### 4.7 보정은 일회성 수정이 아니다 — 폰트, DPR, 뷰포트 각각이 재스탬프를 강제한다

셀당 `scaleX`은 측정된 순간에만 `advance × (pageScale × deviceScale) / natural`입니다. 엔터티 이동 없이 웹 글꼴 완료(`contentFontEpoch` 범프, `watchFontMetrics` → 에포크, `Typography.clearCssLineBoxMetrics`), 사용자 확대/축소(`getBoundingClientRect` 256픽셀 기반 페이지 배율, `ContentProjectionManager.ts:524`) 또는 `devicePixelRatio`/캔버스 크기 변경(`Scene.resize` → `CanvasGeometry.effectiveDPR` → `contentViewportEpoch`) 등 세 가지 입력 중 하나가 변경될 수 있습니다. `calibrationGeneration`(`ContentProjectionManager.ts:calibrationGeneration`)은 이를 하나의 카운터로 통합하므로 단일 비교로 모든 셀이 무효화됩니다. 이를 놓쳤을 때의 실패는 조용합니다. 이전 `scaleX`은 그대로 있고 캐리어의 너비가 잘못되었으며 `selectionAudit`는 줄 길이에 따라 증가하지만 새로 고침 시 사라지는 드리프트를 보고합니다. `data-vecto-grid-calib`은 관찰할 필드입니다. 확대/축소 후에도 `generation` 스탬프가 찍힌 셀은 오래된 읽기입니다.

### 4.8 정확성을 실제로 측정하는 방법: 선택 하네스

헤드리스(`jsdom`, `--disable-gpu`)에는 GPU, 컴포지터, 분수 DPR의 `Range` 형상이 없으며 COOP/COEP 없이 100μs로 거칠어진 `performance.now()`은 선택 패리티를 인용할 수 없습니다. `scripts/selection-harness/harness.ts` + `drive.sh`만 가능합니다. `harness.ts`은 알려진 소스, 글꼴, `maxWidth`을 사용하여 실제 `Scene` + `Markdown` + `CodeBlock` 문서를 빌드한 다음 `drive.sh`은 `DPR` × `ZOOM`(`--force-device-scale-factor`, `layout.css.devPixelsPerPx`, `scripts/selection-harness/drive.sh:6`)의 전용 Hyprland 작업 공간에서 **진짜** Chrome 및 Firefox를 실행하고 동일한 `clientToGridLocal` /를 통해 기본 드래그를 구동합니다. `nearestOffsetForPoint` 사용자가 방문하는 경로입니다. `selectionAudit.ts:1`는 오라클입니다. `ContentProjectionLine` 기하학의 `expectedLeft/Right`과 **로컬 논리 px**(DPR/확대/축소)의 라이브 DOM `Range`의 `actualLeft/Right`입니다. 빈 배열 = 모든 선택 상자가 해당 문자 모양을 추적합니다. 모든 결과에는 이분법에 대해 `entityId`, `entityPath`, `line`, `leftDrift/rightDrift`이 포함됩니다.

하네스가 포착하기 위해 절단되는 세 가지 실패 모드: 단어 간 간격 정당화, RTL/bidi 시각적 재정렬 + `dir="ltr"` 고정 및 부분 DPR/확대/축소 반올림(`scripts/selection-harness/README.md:8`). 헤드리스 DPR 1은 DPR 1.1/1.6에서 제공되는 256px 양자화 버그와 ~0.36% Gecko 그리드 핏을 숨깁니다. 패리티를 주장하기 전에 하네스를 `DPR=1.5 ZOOM=0.9`와 1×에서 실행합니다.

## 5. 개발자가 지켜야 할 불변식

> 각 불변성은 두 개의 코드 경로가 하나의 숫자와 하나의 방향에서 일치해야 하는 곳입니다. 동의하지 않을 경우 사용자는 공백, 이동된 강조 표시 또는 손실된 선택 항목을 보게 되며 헤드리스 패스에서는 이를 숨깁니다. `file:line`은 제안 사항이 아니라 확인해야 할 곳입니다.

1. **페인팅하는 위치를 측정하세요.** `getSharedMeasuringContext()`(`packages/text/src/measureContext.ts`)을 사용하세요 — 첨부됨, `document.body`-부모, `opacity: 0` at `left: -9999px`, 절대 `display: none` 사용하지 마세요. 일반 가족을 위한 분리된 캔버스가 아닙니다. 문서의 스타일 컨텍스트 없이 `serif`/`monospace`을 다시 측정하지 마십시오. `fontMetrics.ts`(`packages/text/src/fontMetrics.ts:registerFontMetrics`, `registerMSDFFontMetrics`)은 DOM이 없는 대체(MSDFAtlas `advance`/`kerning`/`ascender/descender`)이며 브라우저에서 선호하는 경로가 아닙니다. 웹폰트가 로드된 후 `clearCssLineBoxMetrics()`을 호출하고 `watchFontMetrics`이 에포크를 범하도록 합니다. 오래된 캐시된 진행은 투영이 포함되기 전의 선 너비 오류입니다.
2. **하나의 계획, 두 명의 소비자.** 코드와 유사한 엔터티: `prepareContentGrid()` 한 번 → 페인트 및 `getContentProjection().grid`(`packages/text/src/PreparedContentGrid.ts`)에 대한 동일한 불변 객체. 산문: `LayoutEngine` 한 번 → `render()` 및 `getContentProjection()`(`packages/layout/src/LayoutEngine.ts`, `packages/ui/src/RichText.ts:284` 캐시)에 대해 동일한 `LayoutResult`. DOM에 대해 절대로 다시 분할하거나, 다시 포장하거나, 다시 토큰화하지 마세요. `EMPTY_GLYPH_ATLAS`은 아틀라스 아이덴티티(`LayoutEngine.ts:EMPTY_GLYPH_ATLAS`)로 단락 메모를 뜨겁게 유지합니다.
3. **Flow 관련 캐리어(논리적 DOM 순서).** `position: relative` + `display: inline-block`(`left = run.x − runningLogicalX`(`packages/ui/src/RichText.ts:584`)). 절대 `absolute` — `innerText`/`textContent` 일반 텍스트, `find-in-page` 줄 연속성 및 화면 판독기 줄 반복을 차단하고 중단합니다. RTL/bidi는 이 경로를 공유합니다. 시각적 `x`은 레벨에서 나오고, DOM 순서는 논리적으로 유지되므로 `innerText`은 소스 순서로 복사됩니다. `contain: layout style paint`은 캐리어가 아닌 프로브에 있습니다.
4. **11y-트리 크기에 대해 캐리어를 종료하지 마십시오.** 문자별 `StaticText` 노드는 문자별로 읽습니다(`xuepoo-blog/src/text-utils.ts` 참조). 이동통신사를 비활성화하면 Firefox에서 ~2px 드리프트가 복원됩니다. 트리 비용은 실제입니다(`Site:Accessibility & Automation` §비용은 초선형적으로 확장됩니다: 20k에서 6.4 µs → 136.9 µs/엔티티 참조). 그러나 캐리어는 레버가 아닙니다. 윈도잉(`contentProjectionMargin`) 및 `a11yProjection: 'onDemand'`은 레버입니다.
5. **소스 오프셋은 유일하게 안정적인 선택 좌표입니다.** 선형 DOM 오프셋은 그리드 창 또는 줄 바꿈이 변경될 때(`ContentProjectionManager.ts:gridSelectionEndpointOffset`) 드리프트됩니다. 스냅샷 그리드는 `sourceStart + withinCell`, `projectionAbsoluteOffset`/`projectionCaretAt`(`packages/core/src/tree/scene/content-caret.ts`)을 통한 산문입니다. 선호도 `forward` 대 `backward`은 캐럿이 고정되는 셀 경계의 측면을 결정합니다.
6. **페인트 모델을 존중합니다.** `ContentProjectionLine.shapedPaint`은 `Scene`에게 어떤 고급 버전을 사용할지 알려줍니다. 정렬된 선은 레이아웃 자체의 문자 모양 기하학(`positionedRuns`, `packages/ui/src/RichText.ts:626`)을 재사용합니다. 자연스러운 흐름 실행에서 `x`을 설정하면 `hasPositionedRuns`가 뒤집히고 `dir="ltr"`이 강제됩니다. 맞춤/RTL의 경우 정확하고 비정형 LTR(`RichText.ts:533`)의 경우 잘못되었습니다. 거친 줄은 `dir="auto"`을 유지해야 브라우저가 텍스트 자체를 입찰하고 캐럿 히트 매핑이 올바르게 유지됩니다.
7. **오버레이 위치 상속.** `CanvasGeometry.syncOverlay`(`packages/core/src/tree/scene/CanvasGeometry.ts:206`)은 `fixed`/`absolute`을 미러링해야 합니다. 프레임마다 상위에서 `top`을 다시 파생시키지 마십시오. 메모 `OverlayGeometry` 및 `invalidateOverlay()`은 새 레이어(`glCanvas`/`gpuCanvas`/`portalRoot`)가 나타날 때만 가능합니다.
8. **세대 스탬프, 비우지 마세요.** 글꼴 및 확대/축소 변경은 생성 카운터(`ContentProjectionManager.ts:calibrationGeneration`, `calibrationStamp = fontEpoch:pageScaleX`)를 통해 모든 `scaleX`을 무효화합니다. 획기적인 범프에서 모든 캐리어를 건드리지 마십시오. 셀은 `data-vecto-grid-calib`을 운반하므로 재사용하면 손대지 않은 라인만 남습니다.
9. **재구축 시 선택 항목을 유지하지만 중간 드래그는 유지하지 않습니다.** `preserveSelectionAcrossRebuild` / `snapshotGridSelection` + `restoreGridSelection`는 스트리밍 재구축 위험을 커버합니다. 빈 영역 드래그는 브라우저에서 신뢰할 수 있으므로 중단되어서는 안 됩니다. `releaseSelectionForRebuild`은 선택한 텍스트가 더 이상 투영되지 않을 때 더 저렴한 형제입니다(창이 이를 지나 스크롤되었습니다. 분리된 캐리어를 가리키는 대신 `Range`를 분리된 상태로 둡니다).
10. **하나의 기준선, 두 세계.** 모든 라인 상자(캔버스 및 DOM)는 `Typography.cssLineBoxBaseline()`(`packages/text/src/Typography.ts:cssLineBoxBaseline`)을 호출합니다. 대체 계층 외부에 `0.8 * lineHeight`을 하드 코딩하지 마십시오. 그 상수는 계약이 아니라 대체입니다.
11. **측정기를 측정하지 마세요.** `style.font`은 라이브 게터(`ContentProjectionManager.ts:292`)입니다. `data-vecto-grid-font`을 읽어보세요. 마찬가지로 `getBoundingClientRect`은 레이아웃을 강제합니다. 일괄 처리(프로브 경로)하고 메모(`selectionPresent` / `OverlayGeometry`)합니다. 프레임당 요소별로 읽지 않습니다.
12. **가상화는 선택적이고 배타적입니다.** `Markdown.virtualize` 및 스트리밍 `createStream`은 구성하지 않습니다(`Markdown.ts:614`). `tableViewportHeight`은 (`:652`)합니다. 마운트된 창 안에 찾기에 중요한 블록을 넣습니다. 그렇지 않으면 찾을 수 없습니다. DOM 트리 깊이가 아니라 구체화에 따라 Ctrl+F가 무엇을 볼 수 있는지 결정됩니다.

## 6. 디버그 체크리스트 — 선택이나 복사가 어긋날 때

### 6.1 먼저 정량적으로

| Symptom                                                       | First probe                                                                                                                                                                                                                                                                                                                                                                   | What it tells you                                                                                                                                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Highlight offset grows with line length                       | `auditEntitySelection` / `auditSceneSelection` (`packages/devtools/src/selectionAudit.ts:56`) — compares `expectedLeft/Right` (projection geometry) vs `actualLeft/Right` (`Range.getClientRects`) in **local logical px** (DPR/zoom removed via `rootRect.width / entity.width`). Default tolerance 2 px; right edge may need looser `rightTolerance` (kerning accumulates). | Whole-string vs isolated drift, or a `shapedPaint` mismatch.                                                                                                                     |
| Visible gap at every CJK seam                                 | Check `PAGE_SCALE_BASIS_PX` (=256, `ContentProjectionManager.ts:85`) and `data-vecto-grid-calib` generation; re-measure `probeOrigin/XRect → basisScale` (`ContentProjectionManager.ts:707`).                                                                                                                                                                                 | Page-scale quantization or stale calibration after zoom/DPR change.                                                                                                              |
| Selection collapses on reflow or streamed append              | `snapshotGridSelection` → `gridSelectionLine` (`ContentProjectionManager.ts:gridSelectionLine`) while extending a drag; verify `preserveSelectionAcrossRebuild` covers the owning element.                                                                                                                                                                                    | Linear vs source offset bug, or a rebuild that touches the anchored line. Check `blankRegionDrag` (`:blankRegionDragActive`).                                                    |
| Overlay highlight detaches on scroll                          | `CanvasGeometry.overlay` (`CanvasGeometry.ts:OverlayGeometry`) — `position` and `left/top` vs `canvas.getBoundingClientRect()` under a 630 px scroll.                                                                                                                                                                                                                         | `fixed` canvas with `absolute` overlay, or a missed `invalidateOverlay` after adding `glCanvas`/`gpuCanvas`.                                                                     |
| Grid ready-but-zero-width rect                                | `scene.getContentElement(id).dataset.vectoGridReady` timing — must publish from a frame callback (`ContentProjectionManager.ts:566`), never synchronously.                                                                                                                                                                                                                    | Carriers not yet laid out when a drag/measure ran.                                                                                                                               |
| Font swap leaves carriers stale                               | `contentFontEpoch` / `contentViewportEpoch` vs `calibrationStamp` (`ContentProjectionManager.ts:calibrationStamp`).                                                                                                                                                                                                                                                           | Missing epoch bump on font load or resize — check `watchFontMetrics` (`RichText.ts:290`) and `Scene.resize`.                                                                     |
| `Selection.toString()` looks correct but `innerText` is wrong | Compare `innerText` vs `textContent` vs `Selection.toString()` on the content root.                                                                                                                                                                                                                                                                                           | `Selection.toString()` walks text nodes and ignores layout — it cannot see `absolute`-blockified copy failure. Use `innerText` or a real clipboard read (`KNOWN_ISSUES.md:204`). |
| Selection survives at rest, breaks under scroll               | `CanvasGeometry.overlay.position` vs `getComputedStyle(canvas).position` (`CanvasGeometry.ts:206`), then `OverlayGeometry.left/top` under a live smooth scroll.                                                                                                                                                                                                               | `fixed` canvas whose overlay stayed `absolute` — CSS containing block, not math, is the fix.                                                                                     |
| Drift only on Firefox, or only on generic families            | `isSharedMeasuringContextAttached()` (`packages/text/src/measureContext.ts:isSharedMeasuringContextAttached`) and `familyOf` (`packages/ui/src/measure.ts:familyOf`).                                                                                                                                                                                                         | Detached measurer on a generic family (`monospace`/`serif`) — Chromium hides it.                                                                                                 |
| `unmeasuredGlyphCount() > 0` and wrap is wrong                | `LayoutEngine.unmeasuredGlyphCount()` (`packages/layout/src/LayoutEngine.ts:31`) — non-zero means some glyphs sized by `0.5em`; check `registerFontMetrics` / `hasFontMetrics()` (`packages/text/src/fontMetrics.ts:registerFontMetrics`).                                                                                                                                    | DOM-free environment with no font metrics registered — line widths and breaks are fabricated.                                                                                    |
| Monospace still drifts                                        | `familyOf(this.font)` vs line's `font` (`packages/ui/src/RichText.ts:nodeFont`), and whether `perGraphemeCarriers` was gated off for the family.                                                                                                                                                                                                                              | Mixed-family line where the `line.font` fallback (`monospace`) does not match the cell font — the grid path already carries per-cell font, the prose path must match it.         |

### 6.2 인터랙티브 프로브

```ts
// Semantic snapshot — what the DOM actually projects (needs one frame after start())
console.log(JSON.stringify(scene.getA11yTree(), null, 2));

// Live node for one entity — dataset, rect, and whether it owns the selection
const el = scene.getContentElement(entity.id);
console.log(el?.dataset, el?.getBoundingClientRect());
console.log(scene.getA11yElement(entity.id));

// Quantitative drift, local logical px, needs a real browser (layout + Range)
import { auditSceneSelection } from '@vectojs/devtools';
console.table(auditSceneSelection(scene, { tolerance: 0.5, rightTolerance: 1 }));
// Single entity, or restrict to ids:
// auditEntitySelection(scene, entity, { tolerance: 0.5 })
// auditSceneSelection(scene, { entityIds: ["my-markdown"] })

// Calibration state on the live node
console.log({
  ready: el?.dataset.vectoGridReady,
  calibration: el?.dataset.vectoGridCalibration,
  pending: el?.dataset.vectoGridCalibrationPending,
  samples: el?.dataset.vectoGridCalibrationSamples,
  calibMs: el?.dataset.vectoGridCalibrationMs,
  fontEpoch: (scene as any).contentFontEpoch,
});

// Geometry readout — local logical x/y vs world transform
import { getContentGeometry } from '@vectojs/devtools';
console.log(getContentGeometry(entity));
```

개발 중에 파란색 점선 테두리가 있는 섀도우 노드의 윤곽을 지정하려면 `SceneOptions`(`packages/core/src/tree/Scene.ts:SceneOptions`)에 `debugA11y: true`을 전달합니다. `scripts/selection-harness/drive.sh`(`DPR=1.5 ZOOM=0.9`, `scripts/selection-harness/README.md`)을 사용하여 엔진 간, 다중 DPR 검증을 진행합니다. 헤드리스 DPR 1은 DPR 1.1/1.6에서 제공되는 양자화 버그와 그리드 맞춤 드리프트를 모두 숨깁니다. 해당 하네스는 양쪽 맞춤 선, RTL/bidi 및 부분 DPR/확대/축소를 실행하며 세 가지 실패 모드 `selectionAudit.ts`은 모두 (`selectionAudit.ts:1`)를 잡기 위해 작성되었습니다.

### 6.3 프로브의 비용 — 검사를 리그레션으로 만들지 않기

- `auditSceneSelection` 자체는 줄당 `getBoundingClientRect`을 호출하며(레이아웃 강제) 핫 루프가 아닌 실제 브라우저에서 실행되어야 합니다. 프레임 경로로 배송하지 마십시오. QA 토글 또는 극작가 하네스에 게이트를 설치하십시오.
- `scene.getA11yTree()`는 a11y 하위 트리를 탐색합니다. `A11yProjectionManager.enforceA11yDomOrder`에 의해 정렬되고 어설션에 대해서는 안정적이지만 수천 개의 대화형 엔터티에 대해 무료는 아닙니다(§5.4 비용 표: Chrome에서 715ms @ 20k 참조). 프레임당이 아닌 확인당 한 번씩 스냅샷을 찍습니다.
- `selectionPresent()`(`ContentProjectionManager.ts:selectionPresent`)는 동일한 읽기를 일괄 처리하는 생산 예입니다. 즉, 요소당이 아닌 동기화 워크당 하나의 강제 레이아웃입니다. 새로운 프로젝션 상태 확인을 위해 해당 패턴을 복사하세요.

> **제목에 대한 참고 사항.** 이 문서는 boss-01 삼부작의 세 가지 중 하나입니다. `vectojs-docs/content/learn/` 인덱스와 `reference/core-a11y.md` 앵커가 드리프트하지 않도록 H2 수와 `order`을 안정적으로 유지하세요. 이름을 바꾼 후에는 `scripts/sync-content.py`을 확인하세요.

## 7. 전체 프레임 — 순서대로 여섯 단계

사용자가 DPR 1.6에서 변경되지 않은 접두사를 선택하는 동안 스트리밍 코드 블록을 한 줄 확장하는 프레임의 경우:

1. **레이아웃** — `prepareContentGrid` 또는 `LayoutEngine.layoutPrepared`은 새 계획을 내보냅니다. `Stack`는 더티 블록(`updateTokens` / `virtualHeights` Fenwick)만 다시 측정합니다.
2. **Canvas 무승부** — `Scene.render`는 VMT을 걷고, `worldTransform × DPR`을 적용하고, `fillText`/`drawImage` 배치를 발행합니다. `flushRun` 결정(`COALESCE_TOLERANCE_PX`)이 이미 구워졌습니다.
3. **오버레이 동기화** — `CanvasGeometry.syncOverlay`은 메모된 `fixed`/`absolute`(`CanvasGeometry.ts:206`), 메모(`OverlayGeometry`)를 상속하여 `a11yRoot`을 `canvasRect`에 정렬합니다.
4. **구체화** — `syncA11y` / `syncContentProjection` 더티 체크 `ContentSyncState`(월드 매트릭스, `hasBand`/`visible`, `fontEpoch`/`viewportEpoch`, `tier`), 윈도우 캐리어를 `hint.minY/maxY`로, 손길이 닿지 않은 그리드 선을 재사용' `scaleX`, 그라핌별 스팬 또는 `data-vecto-grid-cell` 스팬 생성 `sourceStart/Length/x/advance/level/caretOffsets`.
5. **선택 보존** — 소스 오프셋으로 `ContentProjectionManager.snapshotGridSelection`, `rebuild()` 뒤의 `preserveSelectionAcrossRebuild` / `restoreGridSelection` 또는 선택한 텍스트가 스크롤된 경우 `releaseSelectionForRebuild`. 빈 영역 드래그는 브라우저 기반으로 유지됩니다.
6. **보정(콜드)** — 프레임 N은 화면 밖에서 100000px 프로브를 구축합니다. 프레임 N+1은 `Range` 자연 너비를 읽고, 256px 페이지 규모 기준(`ContentProjectionManager.ts:707`)에서 `basisScale`을 사용하여 `scaleX = advance × basisScale / natural`을 계산하고, `transform`를 쓰고, `data-vecto-grid-calib`을 스탬프합니다. 정상 상태는 하나의 선택기 일치입니다. `vectoGridReady`은 프레임 콜백에서 게시되었습니다.

1단계를 거치지 않고 재측정하는 모든 단계는 두 번째 레이아웃과 향후 드리프트를 생성합니다. 메모/속성 경로를 거치지 않고 `style.font` 또는 `getBoundingClientRect`을 읽는 모든 단계는 §4의 480×/요소당 레이아웃 비용을 지불합니다.

---

**추가 자료.** `vectojs-docs/content/learn/accessibility.md`(프로젝션 모델, IME, 페이지에서 찾기, 비용 테이블) 및 `reference/core-a11y.md`(복합 위젯, 로빙 탭 인덱스, `pointerEvents: 'none'` 핫스팟 패턴)은 이 문서가 따르는 분위기를 설정합니다. 엔진별로 거부된 대안의 이름, 번호 및 도착 위치를 측정하여 측정합니다. `forge/decisions/file-decomposition-2026-08.md` §2에서는 4개의 동기화 필드와 2개의 걷기가 쌍으로만 이동하는 이유를 설명합니다. `KNOWN_ISSUES.md` §선택 하이라이트/위치 실행 캐리어/코어 TextEntity 투영은 고정 드리프트와 해당 트랩을 기록합니다. 절대로 "일반적으로" 하지 마십시오. 운송업체가 `node.x`에 있거나 그렇지 않습니다.

## 추가 — 한 끌어 끌어가기 모든 파일

사용자가 `Markdown` 코드 블록의 빈 패딩을 누르고 세 줄에 걸쳐 드래그한 다음 놓습니다. DPR 1.6, `position: fixed` 전체 뷰포트 장면, Firefox 153:

| 순간                       | 무슨 일이 일어나는가                                                                                                                            | 파일                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `mousedown` 공백           | `ContentProjectionManager.beginBlankRegionDrag`은 `TextCaretPosition`을 추적합니다. 브라우저가 접힙니다. `Selection`                            | `ContentProjectionManager.ts:beginBlankRegionDrag`                                  |
| `mousemove`                | `Scene.ts:nearestGridPosition` → `gridCellCaret`(Bidi 인식 분수) + `blankRegionDragActive`은 `setBaseAndExtent`을 통해 `Selection`을 확장합니다 | `Scene.ts:nearestGridPosition`, `ContentProjectionManager.ts:blankRegionDragActive` |
| 다음 프레임: 블록 리플로우 | `syncContentProjection` 운송업체를 다시 창구로 설정합니다. `snapshotGridSelection`은 소스 오프셋을 저장합니다                                   | `ContentProjectionManager.ts:snapshotGridSelection`                                 |
| 재구축                     | `preserveSelectionAcrossRebuild` 건너뛰었습니다(라이브 드래그 → 신뢰할 수 있는 브라우저). `clearGridState`은 소유하지 않은 블록만 해제합니다    | `ContentProjectionManager.ts:clearGridState`                                        |
| `mouseup`                  | `ContentProjectionManager.endDrag`은 `blankRegionDrag` + 앵커를 삭제합니다. `getContentElement` 직사각형이 활성화되었습니다                     | `ContentProjectionManager.ts:endDrag`                                               |
| 두 프레임 나중에           | 프로브는 `Range.getBoundingClientRect().width`을 읽고, 드래그된 셀에 대해 `scaleX`을 씁니다. `vectoGridReady`이 프레임 콜백에서 게시됨          | `ContentProjectionManager.ts:scheduleGridCalibration`                               |
| 복사(Ctrl+C)               | 브라우저는 현재 보정된 캐리어에서 `projectedSlice` 텍스트(대체 대체, 구분 기호 병합)를 직렬화합니다.                                            | `RichText.ts:projectedSlice`                                                        |

행을 건너뛰거나 재정렬하면 행 번호가 동일한 §5의 불변 항목이 다시 읽혀집니다.
