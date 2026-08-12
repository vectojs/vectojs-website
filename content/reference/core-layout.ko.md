+++
title = "레이아웃 엔진"
description = "독립형 @vectojs/layout 패키지(그리고 @vectojs/core/layout 하위 경로): 값비싼 텍스트 분할+측정을 저렴한 줄바꿈+위치 산술과 분리하는 콜드/핫 분할, 스트리밍 메모이제이션, 리치 텍스트 및 배제(Exclusion) 셰이프."
weight = 4
+++

# 레이아웃 엔진 (콜드/핫 분할) — `@vectojs/layout`

레이아웃 엔진은 독립형 **`@vectojs/layout`** 패키지입니다(셰이핑 프리미티브를 위해
[`@vectojs/text`](/reference/core-text/)에만 의존합니다).
[`@vectojs/core`](/reference/core-api/)가 이에 의존하고 재-내보내기하므로
`@vectojs/layout`, `@vectojs/core`, 또는 `@vectojs/core/layout` 하위 경로에서
상호 교환적으로 임포트할 수 있습니다.

`LayoutEngine`은 값비싼 **콜드** 패스(분할 + 측정, `Intl.Segmenter` 사용)를
저렴한 **핫** 패스(줄바꿈 + 위치 산술)와 분리하여,
크기 조정/리플로우/애니메이션 시 재측정이 발생하지 않도록 합니다.

```ts
new LayoutEngine(maxWidth: number, maxHeight: number, measurer?: GlyphMeasurer | null)

// Cold: 한 번 분할 + 측정 → 재사용 가능한 PreparedText
prepare(text, fontAtlas, fontSize = 32): PreparedText
prepareRich(spans: StyledSpan[], fontAtlas, baseFontSize = 32, baseStyle?: TextStyle): PreparedText

// Hot: PreparedText를 위치가 지정된 글리프로 배치 (엔진 maxWidth/maxHeight 읽음)
layoutPrepared(prepared, exclusionMask?, exclusions?: ExclusionRect[]): LayoutResult
layoutPreparedIntoBuffer(prepared, buffer: LayoutResultBuffer, exclusionMask?): void   // 타입화된 좌표 저장소 재사용

// One-shot (cold+hot 함께)
layoutText(text, fontAtlas, fontSize = 32, exclusionMask?): LayoutResult
layoutTextIntoBuffer(text, fontAtlas, fontSize, buffer, exclusionMask?): void
```

- **스트리밍 메모이제이션.** `prepare`/`prepareRich`는 문단별 결과를 캐시하므로,
  증가하는 텍스트(예: LLM 토큰 스트림)를 다시 준비할 때 새 문단만 측정합니다.
- **리치 텍스트.** `StyledSpan = { text, style?: TextStyle }`; `TextStyle =
{ fontSize?, color?, bold?, italic?, href? }`. 단어 중간의 스타일 변경도
  글리프별로 적용됩니다. `fontSize`는 측정된 너비 + 줄 높이에 영향을 미치며;
  나머지는 노드로 전달되는 렌더 메타데이터입니다(`PreparedGlyph.style` → `LayoutNode.style`).
- **Exclusions (배제 셰이프).** `computeLineSegments(top, bottom, maxWidth,
exclusions: ExclusionRect[]): LineSegment[]`는 순수하고 테스트 가능한 코어입니다:
  겹치는 직사각형을 뺀 후 라인 밴드의 자유 `[x0,x1)` 구간입니다.
  O(n log n). `[]` 전달/생략은 단일-컬럼 경로와 바이트-동일합니다.

## 주요 레이아웃 타입

- `GlyphAtlas` — `{ [char]: { width, baseSize, ast } }` 사전측정된 메트릭.
- `GlyphMeasurer` — `{ measure(char, fontSize): number }`; 직접 제공하거나
  `createCanvasMeasurer(fontFamily?, baseSize?)` 사용(오프스크린 `measureText`,
  선형-스케일 + 캐시됨; DOM 없는 환경에서는 `null` 반환 → 엔진이
  `0.5em` 폴백 유지).
- `PreparedText` → `PreparedParagraph[]` → `PreparedWord[]` → `PreparedGlyph[]`.
- `LayoutResult` — `{ nodes: LayoutNode[], totalWidth, totalHeight,
fallbackToCanvas? }`; `LayoutNode`는 하나의 위치가 지정된 글리프입니다.
- `LayoutResultBuffer` — 평면 타입화-배열 결과(`xs/ys/ws/hs`, `chars`, `levels`,
  `count`, `CAPACITY = 16384`); 재사용 전 `reset()`, 구체화하려면 `toLayoutResult()`.
  `levels`는 각 글리프의 해결된 BiDi 임베딩 레벨(짝수 = LTR, 홀수 = RTL)이며,
  소비자는 글리프의 방향을 판단할 수 있습니다. 버퍼 경로는 각 줄을 시각 순서로
  재정렬하는 데 이를 사용합니다. 글리프는 공유 기준선과 함께 **시각** 순서로
  출력되며, 할당 경로와 글리프별로 일치합니다.
- `LayoutWorkerManager.getInstance()` — 스레드 외부 레이아웃용 싱글턴;
  `queueLayout(entityId, text, { fontId, fontSize, maxWidth, maxHeight, callback,
... })` / `cancelLayout(entityId)`. [`MSDFTextEntity`](/reference/core-text/#msdftextentity)에서 사용됩니다.

알아두면 좋은 유틸리티 내보내기: `createMetricsMeasurer(fontFamily?, baseSize?)`와 `resolveGlyphMeasurer(...)`는 `GlyphMeasurer`를 구성합니다; `EMPTY_GLYPH_ATLAS`는 메트릭이 없는 폴백 아틀라스입니다; `isComplexScript(text)`는 셰이핑에 스크립트 아이템라이저가 필요한지 보고합니다; `computeMSDFLayout(...)`는 워커 경로가 스레드 외부에서 실행하는 순수 레이아웃 함수입니다; `cacheStats()` / `resetCacheStats()`와 `clearCssLineBoxMetrics()`는 진단용 엔진 레벨 캐시입니다.

- `InlineObject` — 리치 단락 내의 인라인 교체 요소(이미지, 아이콘, 수식 상자): `{ width, height, depth?, alt?, paint? }`. span은 U+FFFC `OBJECT_REPLACEMENT` 센티널로 구성되어야 합니다; 엔진이 상자 메트릭을 예약하고, 소비자가 렌더링할 때 텍스트의 로컬 좌표 공간에서 `paint(surface: InlineObjectSurface, box: InlineObjectBox)`를 호출합니다(깊이 기록 불필요). `alt`는 접근 가능한 이름, 선택, 복사에 사용되는 텍스트 등가물입니다—그것이 없으면 원시 센티널이 a11y 레이어로 누출됩니다. `paint`는 단락 메모 키의 일부입니다(`alt`와 함께): 비교 시 동일한 두 객체는 캐시된 단락을 공유하므로, `alt` 밖에서 선택된 그림(예: Markdown 이미지 URL—배지-컬럼 사례)은 거기에 선언되어야 하며, 그렇지 않으면 동일하게 보이는 모든 객체가 첫 번째 객체의 그림을 그립니다. `depth`는 부호가 뒤집힌 CSS `vertical-align`을 반영합니다(MathJax의 `vertical-align: -0.486ex` → `depth: 0.486 * exToPx`).

사용법은 [Text & Typography](/learn/text-typography/)를,
이 엔진의 출력을 소비하는 폰트/글리프 렌더링 레이어는
[Text & Bidi](/reference/core-text/)를 참조하세요.

## 관련 항목

[Text & Bidi](/reference/core-text/) · [`Entity`](/reference/core-entity/) ·
[`@vectojs/core` 개요](/reference/core-api/)
