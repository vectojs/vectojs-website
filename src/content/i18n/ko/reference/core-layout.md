---
title: '레이아웃 엔진'
description: '@vectojs/core/layout 하위 경로: 값비싼 텍스트 분할+측정을 저렴한 줄바꿈+위치 산술과 분리하는 콜드/핫 분할, 스트리밍 메모이제이션, 리치 텍스트 및 배제(Exclusion) 셰이프.'
order: 4
---

# 레이아웃 엔진 (콜드/핫 분할) — `@vectojs/core/layout`

[`@vectojs/core`](/reference/core-api/)의 일부입니다.

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
- `LayoutResultBuffer` — 평면 타입화-배열 결과(`xs/ys/ws/hs`, `chars`,
  `count`, `CAPACITY = 16384`); 재사용 전 `reset()`, 구체화하려면 `toLayoutResult()`.
- `LayoutWorkerManager.getInstance()` — 스레드 외부 레이아웃용 싱글턴;
  `queueLayout(entityId, text, { fontId, fontSize, maxWidth, maxHeight, callback,
... })` / `cancelLayout(entityId)`. [`MSDFTextEntity`](/reference/core-text/#msdftextentity)에서 사용됩니다.

사용법은 [Text & Typography](/learn/text-typography/)를,
이 엔진의 출력을 소비하는 폰트/글리프 렌더링 레이어는
[Text & Bidi](/reference/core-text/)를 참조하세요.

## 관련 항목

[Text & Bidi](/reference/core-text/) · [`Entity`](/reference/core-entity/) ·
[`@vectojs/core` 개요](/reference/core-api/)
