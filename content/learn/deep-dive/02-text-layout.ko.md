+++
title = "02 — 텍스트와 레이아웃: Unicode부터 픽셀까지"
description = "전체 텍스트 파이프라인 — 분절, BiDi, 아랍어 셰이핑, 폰트 폴백, 타이포그래피, 줄 바꿈, LayoutEngine의 cold/hot 분리, 워커 스레딩, 그리고 페인트와 측정을 일치시키는 불변식."
weight = 22
+++

# 02 — 텍스트와 레이아웃: Unicode부터 픽셀까지

> VectoJS는 브라우저의 텍스트 스택이 무료로 제공하는 bidi, 모양, 분할, 글꼴 대체, 줄 바꿈 및 기준선 배치를 다시 구현합니다. 이 서류는 유니코드 `string`부터 위치 지정 문자까지 모든 단계를 추적하고 `measure` 및 `paint`이 구성에 따라 동의하도록 유지하는 계약을 설명합니다.

## 1. 파이프라인 한눈에 보기

```text
Unicode string
  │  Intl.Segmenter (word + grapheme)          packages/layout/src/LayoutEngine.ts:916
  ▼
 Grapheme segmentation ─┬─ ArabicShaper.shapeArabic  packages/text/src/ArabicShaper.ts:89
                        │  indexMap: shaped → source       :91
                        ▼
 BiDi resolution (bidi-js, UAX #9)            packages/text/src/BidiResolver.ts:27
  getBaseLevel / resolveLevels / reorderSegments
                        │
                        ▼
 Font fallback (atlas → measurer → 0.5em)     packages/layout/src/measure.ts:39
  createCanvasMeasurer / createMetricsMeasurer / resolveGlyphMeasurer
                        │
                        ▼
 Typography (baseline in line box)            packages/text/src/Typography.ts:93
  cssLineBoxBaseline / registeredBaseline / splitFontShorthand
                        │
                        ▼
 Line breaking + exclusion flow + justify     packages/layout/src/LayoutEngine.ts:1848
  computeLineSegments / suppressLineBreaks / LayoutEngine.layoutPrepared
                        │
                        ▼
 Paint / measure parity ─┬─ @vectojs/layout  (canvas Text/RichText)
                         └─ @vectojs/text    (MSDF: MSDFFont.layout)  packages/text/src/MSDFFont.ts:201
                         └─ @vectojs/core    (MSDFTextEntity → worker) packages/core/src/text/MSDFTextEntity.ts:25
```

두 병렬 소비자는 **캔버스 경로**(`@vectojs/layout` + `measureContext`) 및 **GPU/MSDF 경로**(`MSDFFont.layout` + `LayoutWorker`)라는 동일한 측정 계약을 공유합니다. 결과는 쿼드가 픽셀이 되는 방식에서만 갈라지며, 계열별로 줄 바꿈이 발생하는 위치에서는 분기되지 않습니다.

그리드 소비자(터미널, 편집기, `CodeBlock`)의 경우 파이프라인은 유지된 그리드 경로 `prepareContentGrid`(`packages/text/src/PreparedContentGrid.ts:243`)(컴파일 1개, 소비자 2개(페인트 + 프로젝션))로 먼저 분기됩니다. 콘텐츠 그리드 측면은 `tmp/boss-research/01-selection.md` §3.3을 참조하세요.

### Cold / hot 분리 (리사이즈를 저렴하게 만드는 2.68배)

```text
prepare(text) / prepareRich(spans)          ← cold:  Intl.Segmenter + Arabic shape + BiDi + glyphWidth
  └─→ PreparedText { paragraphs, fontSize }      memo'd by text+fontSize+styleSig (LayoutEngine.ts:829/833)
       │  independent of maxWidth / maxHeight / exclusions
       ▼
layoutPrepared(prepared, mask, exclusions)  ← hot:   computeLineSegments + suppressLineBreaks + shiftedExtent
measurePrepared(prepared)                   ← hot (no alloc): lineCount+height only
layoutPreparedIntoBuffer(prepared, buffer)  ← hot, zero-GC: typed arrays + reorderSegments
```

`benchmarks/text-layout-pretext` / `comparisons/text-layout-pretext` / `scripts/compare-pretext.ts:1`는 사과 대 사과 분할(`measurePrepared` 대 `pretext.layout`)을 설정했습니다. 분할 전에 `layoutText`(콜드+핫)은 프리텍스트의 핫 전용 `layout`에 대해 시간이 측정되었습니다. 그 차이는 실제로 분할 비용이었는데 엔진 비용으로 보고되었습니다.

### 분절기와 그 캐시

`LayoutEngine`(`:916`)은 `wordSegmenter` + `charSegmenter`(`Intl.Segmenter`, 로케일 `navigator.language ?? 'en-US'`) — CJK 대 서양 단어 경계 자동 감지 — 플러스 `wordCache: Map<string, …>`(`:821`, cap 500) 및 `graphemeCache: Map<string,string[]>`(`:822`, cap 2000)을 보유합니다. 둘 다 캡(`:921`/`950`)에서 도매 플러시되고 `cacheStats()`(`:1004`)을 통해 관찰됩니다. `PreparedContentGrid`는 그라핌(`:76`)에 대해 동일한 `Intl.Segmenter`를 선호하지만 이것이 없는 환경에 대해 `fallbackGraphemes`(`:107`)을 전달합니다. 결합 표시, VS16/VS15, 스킨 톤 수정자 `U+1F3FB–1F3FF`, 지역 표시기, ZWJ — 탭 정지와 넓은 열을 올바르게 유지하기에 충분합니다. `LayoutEngine.getGraphemes`(`:943`) 및 `getWordSegments`(`:881`)은 유일한 통화 사이트입니다. `shapeSimpleRun`(`:1644`)는 `isComplexScript`(`:584`)이 안전하다고 입증한 후에만 `ArabicShaper`을 우회합니다.

## 2. 모듈별 심층 분석

### 2.1 `packages/text/src/BidiResolver.ts:27` — UAX #9 via `bidi-js`

정적 전용 클래스(의도적으로 — `BidiResolver.getBaseLevel(...)`은 공개 API임) `bidi-js`의 `getEmbeddingLevels` / `getReorderedIndices` / `getReorderSegments` 위의 얇은 래퍼; 이전의 수동 롤링 L2 반전은 L1 재설정이 단일 후행 공백 실행만 처리했기 때문에 대체되었습니다.

| Method                                    | Line   | What it does                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getBaseLevel(text)`                      | `:29`  | Paragraph embedding level P2/P3 (0 LTR, 1 RTL).                                                                                                                                                                                                                                                                                           |
| `resolveLevels(text)`                     | `:34`  | Per-character resolved levels X1–I2 (`Uint8Array`).                                                                                                                                                                                                                                                                                       |
| `reorderIndices(text)`                    | `:50`  | Visual→logical permutation L1+L2 (`indices[v] = logical index at visual column v`). Authoritative — selection maps logical ranges to visual runs through this.                                                                                                                                                                            |
| `logicalToVisualRuns(text, start, end)`   | `:62`  | One logical `[start,end)` → N visual `[visualStart,visualEnd)` runs, sorted left-to-right. A single selection rect becomes several when it straddles a direction boundary.                                                                                                                                                                |
| `reorderVisual<T>(nodes, baseLevel)`      | `:89`  | In-place L1+L2 reversal of one line's nodes. Reconstructs `str` + `levels` and iterates `reorderSegments`. Hot in every wrapped line.                                                                                                                                                                                                     |
| `reorderSegments(str, levels, baseLevel)` | `:121` | Same permutation as typed-array `[start,end]` pairs (`packages/layout/src/LayoutEngine.ts:2466` comment) — lets the zero-GC buffer path (`layoutPreparedIntoBuffer`) apply it without allocating `BidiNode` objects per glyph. Synthesizes `embed = { levels, paragraphs:[{level: baseLevel}] }` so L1 resets to the paragraph direction. |

비용: 단락당 하나의 `bidi-js` 패스. __SEU1__에 내장된 배열을 넘어서는 글리프별 작업은 없습니다.

### 2.2 `packages/text/src/ArabicShaper.ts:18` — contextual shaping

아랍어 블록과 페르시아어/우르두어 확장에 대한 프리젠테이션 형식 대체입니다. `MAPPINGS: { [code]: GlyphForms }`(`:18`)은 `isolated/initial/medial/final` 코드 포인트와 코드 포인트당 `joining: 'D'|'R'|'U'`을 기록합니다. Tatweel `U+0640`은 `'D'`이지만 모든 형식(`:052`)에서 동일한 코드 포인트를 방출하므로 결합이 통과됩니다.

- `isHarakat(code)` (`:70`) — `U+064B–065F`, `U+0670`, `U+0610–061A`(경어), `U+06D6–06ED`(쿠란 주석)과 세 개의 harakat 인접 표시 범위. 모두 TRANSPARENT 결합 유형을 가집니다. 형성은 이를 건너뛰어야 하며, 그렇지 않으면 명예로운 텍스트 연결이 끊어집니다. 거울 `MSDFFont.ts:isNonspacingMark` (`:132`).
- `getJoiningType(code)` (`:84`) — 테이블 조회, 부재 시 `'U'`.
- `shapeArabic(text)` (`:89`) — 단일 왼쪽에서 오른쪽 걷기: 합자 미리보기(`lam+alef` `U+0644` + `U+0627/0622/0623/0625` → 프레젠테이션 합자, `k` 포인터 `:105`), `connectPrev`/`connectNext`(`:182`/`:187`)는 투명 표시, `glyph = forms.isolated/initial/medial/final`를 앞뒤로 스캔하여 계산됩니다. `{ shapedText, indexMap: Int32Array }` (`:1`) — `indexMap[visualIndex] = sourceOffset`을 반환하므로 `LayoutEngine`은 형성 후 `sourceIndex/sourceLength`을(를) 복구할 수 있습니다.

선택 계약: 시각적 위치가 재정렬되지만 `sourceIndex`은 항상 원래 논리 문자열을 인덱싱합니다.

### 2.3 `packages/text/src/measureContext.ts:41` — measure where you paint

하나의 불변성을 적용하기 위해 존재하는 모듈입니다. 분리된 `HTMLCanvasElement`은 일반 패밀리(`monospace`, `serif`)를 Gecko의 문서에 첨부된 캔버스와 **다른 글꼴**로 해결합니다. 일반→실제 매핑은 라이브 스타일 컨텍스트에서만 도달할 수 있는 언어별 글꼴 기본 설정에 있기 때문입니다.

헤더 테이블(`:1`): Firefox 153, `<html lang="zh">`, DPR 1.5789, `measureText('MMMMMMMMMM')` — 분리 `22px monospace` 109.7, 첨부 131.6, 레이아웃 132.0; 분리된 `serif` 109.7/205.5 — 둘 다 하나의 하드코딩된 폴백으로 축소되었으며 오류는 20-47%입니다. 크롬은 영향을 받지 않습니다. `OffscreenCanvas`는 132.0(레이아웃과 일치)을 측정하지만 사용되지 않습니다. **채색된** 캔버스에 동의하는 것이 더 중요합니다.

- `createMeasuringContext()` (`:62`) — 1×1 캔버스, `position:absolute;opacity:0;left:-9999px;top:0`, `aria-hidden`, `document.body`에 추가됨. `display:none`는 레이아웃에서 이를 제거하고 스타일 컨텍스트를 잃습니다. 분리는 실패 모드입니다.
- `getSharedMeasuringContext()` (`:87`) — 단일 공유 컨텍스트(`:41` `sharedCanvas`/`sharedContext`). `null`(`undefined` 대 `null` 구별, `:98`)을 기억하므로 SSR(`typeof document === 'undefined'`)은 글리프당 생성을 다시 시도하지 않습니다. `ctx.font`은 모든 읽기 전에 설정됩니다. 너비로 캐시된 어떤 것도 컨텍스트와 함께 이동하지 않습니다.
- `isSharedMeasuringContextAttached()` (`:118`) / `resetSharedMeasuringContext()` (`:130`) — `document.body`이 존재하기 전에 생성된 컨텍스트에 대한 진단 + 복구입니다. 현재는 저장소 내 호출자가 자동으로 다시 생성되지 않습니다. `:111`에 문서화된 호출 사이트 패턴.

모든 측정자는 이를 호출해야 합니다. `packages/layout/src/measure.ts:42`은 그렇습니다. `packages/`에서 분리된 `document.createElement('canvas')`을(를) Grepping하는 것이 감사입니다.

### 2.4 `packages/text/src/fontMetrics.ts:14` — DOM-free metrics registry

캔버스가 전혀 없는 환경(SSR, `OffscreenCanvas`이 없는 작업자, 테스트)의 경우. **em 단위** 단위의 값이므로 한 번의 등록으로 모든 크기를 처리할 수 있습니다.

- `FontMetricsSource` (`:14`) — `advanceEm(char)`, 선택 사항 `measureEm(text)`(커닝 인식), `ascenderEm`/`descenderEm`. `measureEm`에 대한 대체는 `advanceEm`을 합산하는 것입니다. 정확하지만 커닝이 삭제됩니다.
- `normalizeFamily` (`:45`) — 첫 번째 계열만, 따옴표가 제거되고 소문자입니다. 폴백 체인은 레지스트리 문제가 아니라 렌더러 문제입니다.
- `registerFontMetrics(family, source)` (`:82`), `registerMSDFFontMetrics(family, font)` (`:97`), `createMSDFMetricsSource(font)` (`:114`) — `font.getGlyph(code)?.advance`의 `advanceEm`, `font.layout(text, 1).width`의 `measureEm` (커닝할 수 있는 유일한 경로 — 글리프당 `GlyphMeasurer`에는 이웃이 없습니다). `font.data.metrics`에서 `ascenderEm`/`descenderEm`. `hasFontMetrics`(`:154`)는 아무것도 등록되지 않았을 때 단락시킬 수 있는 저렴한 프로브입니다.
- `fontMetricsVersion()`(`:64`), `getFontMetrics`(`:141`), `clearFontMetrics`(`:163`). 버전 카운터를 사용하면 호출자가 해결된 소스를 캐시하고 충돌할 때만 다시 해결합니다. 즉, 당시 등록된 핀을 확인하지 않고 소스를 캡처합니다(`measure.ts`의 `:107`). 따라서 `createMetricsMeasurer`(`measure.ts:96`)는 `baseVersion/runVersion`을 느리게 보유하고 글리프당 `normalizeFamily`을 호출하는 대신 글리프당 한 번 비교합니다(측정기 핫 경로에서 `+13%` 오버헤드가 방지됨).

### 2.4b `packages/text/src/index.ts:1` — the barrel

`ArabicShaper`, `BidiResolver`, `measureContext`, `PreparedContentGrid`, `MSDFFont`, `fontMetrics`, `Typography`(`:1`)을 다시 내보냅니다. `@vectojs/layout`은 `@vectojs/text`(상대적이지 않음)에서 가져옵니다. — `LayoutEngine.ts:1` `import { ArabicShaper } from '@vectojs/text'` — 패키지 경계를 관찰할 수 있습니다. `LayoutWorkerManager` 싱글톤은 바로 이러한 이유로 작업자 종료 시 `MSDFFontData`(`LayoutWorkerManager.ts:043`)을 캐시합니다. 즉, 메트릭 데이터가 스레드 경계를 한 번 교차하고 대체 경로에 사용할 수 있는 상태로 유지되어야 합니다.

### 2.5 `packages/text/src/Typography.ts:4` — baseline in the CSS line box

CSS은 라인 상자에서 글꼴 상승+하강을 중앙에 둡니다. 캔버스는 명시적인 y에서 그립니다. 동의하지 않으면 `fillText`과 기본 미러가 서로 다른 기준선에 위치해야 합니다.

- `BASELINE_CACHE_MAX = 512` (`:12`), `baselineCache: Map<string,number>` (`:4`), `rememberBaseline` (`:14`) — 삽입 순서 LRU(적중 시 삭제+재설정, `:98`). 512는 실제 문서의 모든 글꼴을 다룹니다. 실수는 하나의 `'Mg'`을 다시 측정합니다.
- `splitFontShorthand(font)` (`:33`) — `indexOf('px')`에 고정되어 있으며 `/(\d+)px/`이 아닌 숫자 위로 뒤로 걸어갑니다(다항식 ReDoS, `js/polynomial-redos`, 높음). 의도적으로 다른 실패 값을 사용하여 `@vectojs/ui`/`@vectojs/markdown`의 파서를 미러링합니다.
- `registeredBaseline(font, lineHeight)` (`:67`) — `getFontMetrics`의 DOM 없는 경로입니다. `(lineHeight - ascent - descent)/2 + ascent`와 `descent = -descenderEm * size`; 대체 `lineHeight * 0.8`.
- `cssLineBoxBaseline(font, lineHeight)` (`:93`) — 주문 선택: SSR→`registeredBaseline`; 캐시 적중 → 반환; `getSharedMeasuringContext` (첨부, `:107`) → `ctx.measureText('Mg')` → `fontBoundingBoxAscent/Descent || actualBoundingBoxAscent/Descent` (`:112`) → 동일한 센터링 공식; 측정항목 퇴화→`0.8` 대체. 동일한 `0.8` 상수 앵커 `LayoutEngine.ts:shiftedExtent` (`:668`) 및 라인 박스 `1.5 * pMax`/`0.8 * pMax` 기하학.
- `clearCssLineBoxMetrics()` (`:122`) — 웹폰트 로딩이 완료된 후 호출됩니다.

### 2.6 `packages/text/src/MSDFFont.ts:151` — GPU text

`msdf-atlas-gen` JSON(유형 `msdf`/`mtsdf`/`sdf`)을 구문 분석하고 아틀라스 UV를 사용하여 CSS 픽셀로 쿼드를 레이아웃합니다. 렌더러 규칙: 로컬 공간 y-아래, 왼쪽 위 원점; 아틀라스 상단의 UV `v=0`(업로드 시 Y플립 없음).

- 인터페이스: `MSDFAtlasInfo`(`:16`, `distanceRange/size/width/height/yOrigin`), `MSDFMetrics`(`:32`, `lineHeight/ascender/descender`), `MSDFBounds`(`:45`), `MSDFGlyphDef`(`:53`, `unicode/advance/planeBounds/atlasBounds`), `MSDFKerning`(`:64`), `MSDFFontData`(`:71`), `PositionedGlyph`(`:79`, `x/y/w/h + u0/v0/u1/v1`), `MSDFLayoutResult`(`:96`, `glyphs/width/height`), `MSDFLayoutOptions`(`:105`).
- `kernKey(a,b)` (`:115`) — `a * 0x110000 + b`; `isNonspacingMark(code)` (`:132`) — 명시적 범위 목록(문자 모양별 루프에서 저렴하고 `\p{Mn}` 정규식 없음), `LayoutEngine.ts:isComplexScript`(`:584`)을 미러링합니다.
- `MSDFFont` (`:151`) — `id` (`font-${idCounter++}` `:164`), `byCode: Map<number,MSDFGlyphDef>`, `kern: Map<number,number>`, `missingAdvance` (`:158`, 공백→`.notdef`→`0.5`). `parse`(`:173`), `getGlyph`(`:178`), `distanceRange`/`atlasWidth`/`atlasHeight`(`:183`).
- `layout(text, fontSizePx, opts)` (`:201`) — 코드 포인트 인식(`Array.from(text)` `:212`), `\r\n`/`\r`을 하나의 중단으로 인식(`:214`), 글리프 누락 → `missingAdvance * size`(0 이상 글리프는 왼쪽으로 이동하지 않음) 0(`:233`)으로 진행하고 `prevCode`을 대체하지 않는 `isNonspacingMark` 제외 커닝(`:252`). 커닝 `k * fontSize`(`:242`), `baseline = y + (ascender + line*lineHeight)*size`(`:246`), `planeBounds`→쿼드(`:246`ff), `yOrigin`는 `v0/v1`(`:250`)을 뒤집습니다. `{ glyphs, width: maxAdvance, height: (line+1)*lineHeight*size }`을 반환합니다.

### 2.7 `packages/text/src/PreparedContentGrid.ts:38` — the retained grid plan

그리드 텍스트에 대한 불변의 소스 인식 형상입니다. 한 번 컴파일하면 캔버스 페인트와 DOM 프로젝션 간에 공유됩니다. 다시 분할하면 bidi, 탭 및 넓은 글리프가 다르게 배치됩니다.

- `PreparedContentGrid` (`:38`) — `{ kind:'content-grid', revision, source, font, cellWidth, lineHeight, baseline, tabSize, lines }`; `PrepareContentGridOptions` (`:50`); `MutableCell` (`:63`).
- `graphemeSegmenter`(`grapheme` 세분성을 갖춘 `:76`, `Intl.Segmenter`) 및 `fallbackGraphemes`(`:107`)은 결합 표시, 변형 선택기, 이모티콘 수정자, 키캡, 지역 표시기, ZWJ를 포함합니다. `graphemes()`(`:151`)은 `Intl.Segmenter`을(를) 선호합니다.
- `isWideCluster` (`:170`) — `EAST_ASIAN_WIDE` (`:91`, CJK 블록) + `EXTENDED_PICTOGRAPHIC`(`VS16`/`VS15` 감도 + `EMOJI_PRESENTATION` + `REGIONAL_INDICATOR`/`0x20E3`). 넓음 → 2열.
- `sourceLines` (`:197`) — `\r\n`/`\r`/`\n`을 소유합니다. `sourceStart/sourceEnd/nextSourceStart`이므로 이후의 모든 오프셋이 정확합니다.
- `prepareContentGrid(source, opts)` (`:243`) — 줄당: `graphemes(rawLine)`, `ArabicShaper.shapeArabic(rawLine)` (`:270`), `graphemes(shaped)`, `BidiResolver.resolveLevels` (`:273`)에서 `rawCaretBoundaries`, `indexMap` (`:278`)을 통해 `sourceStart/sourceEnd`, `lowerBound` (`:159`)을 통해 `sourceCaretOffsets`를 사용하는 모양 문자당 셀, `columns = 0/ tabStop / wide?2:1`(`:298`), `BidiResolver.reorderVisual(visualCells, getBaseLevel(shaped))`(`:315`), `x` 패스(`:317`). 반품 전 냉동.

### 2.8 `packages/layout/src/LayoutEngine.ts` — the prose layout engine

~3.4k 라인, 텍스트 스택에서 가장 무거운 단일 파일입니다. 아키텍처는 형식화된 계약에 대한 **콜드/핫 분할**입니다.

**콜드 하프**(비싸고 제약 없음):

- `prepare(text, atlas, size)` (`:1080`) / `prepareRich(spans, atlas, size, baseStyle)` (`:1266`) — `Intl.Segmenter`(단어 `:916` + 그라핌 `:917`) 실행, `glyphWidth`(`:929`, 아틀라스→`GlyphMeasurer`→`0.5em`), 모양(`ArabicShaper` `:1117`), bidi(`BidiResolver`)를 통해 글리프 진행 해결 `:1123`/`:1524`), `PreparedText`(`:462`)을 빌드합니다. 결과는 `maxWidth`/`maxHeight`/제외와 무관합니다. 단락 메모: `${fontSize} ${paragraph}`로 키가 지정된 `paragraphCache: Map<string,PreparedParagraph>`(`:829`); `${fontSize} ${text} ${styleSig}`로 키가 지정된 다양한 변형 `richParagraphCache`(`:833`) 여기서 `styleSig`은 `TextStyle` 필드 + `InlineObject` ID(bold/italic/color/href/fontFamily/baselineShift/highlightColor/abbrTitle plus object `width/height/depth/alt/key`)에 대한 RLE 값 서명입니다. Atlas ID 변경으로 인해 두 가지(`:1095`/`:1275`)가 모두 지워집니다.

`prepareRich` 내부의 **스트리밍 빠른 경로**: `streamShapeCache`(`:839`, 단일 슬롯 증분 캐시). `:1358`의 조건: 단일 단락, `\n`/`\r` 없음, `!isComplexScript(fullText)`(`:584` — 아랍어/히브리어/인도어/결합/bidi 표시/이모지 수정자는 전체 셰이퍼에 해당합니다). `fullText`이 `cache.text`을 엄격하게 확장하는 경우 접두사(`styleRangeEquals` `:682`, `objectRangeEquals` `:628`)와 동일한 스타일, 접두사 단어를 그대로 재사용하고 접미사에서만 `shapeSimpleRun(fullText, reshapeFrom, ...)`(`:1644`)를 호출합니다. `reshapeFrom`은 `cache.end`이 아니지만 후행 동일한 범주(공백 대 비공백)의 시작이 실행되므로 다음 청크가 도착할 때 해체되는 `Intl.Segmenter` 경계(예: `"3"+"."+"1"` → `"3.1"`)가 올바르게 다시 빌드됩니다. 상태: 배송됨, 정확하게 측정됨, 극단적인 경우 승리, 현실적인 문서에서는 무시할 수 있음(메모는 이미 단락당 비용을 상한으로 설정함) — `forge/findings/text-richtext-and-markdown.md:356`당 독립 실행형 `@vectojs/core` 릴리스에서 보관됨.

**핫 하프**(저렴하고 제약이 있음):

- `layoutPrepared(prepared, exclusionMask?, exclusions?)` (`:1848`) / `measurePrepared` (`:1772`) / `layoutPreparedIntoBuffer(prepared, buffer, mask?)` (`:2241`) — `PreparedText` 단어 걷기, `currentX/currentY`에 문자 배치, `maxWidth`/`maxHeight`, `exclusions: ExclusionRect[]`, `computeLineSegments(top,bottom,maxWidth,exclusions)` (`:504`, `O(n log n)` x 간격 병합, `[0,maxWidth]` 내 보완), 고아 구두점 억제(`suppressLineBreaks` `:721`, `'@'` 조인 + 닫는 점 병합), 하이픈 넣기(`U+00AD` 또는 `this._hyphenate` 후크의 `breakPoints`, `hyphenWidth` `:490`), 양쪽 맞춤(다중 실행 라인에서만 `textAlign:'justify'`), `shiftedExtent(gfs, shift, pMax)`(`:668`) 공유 `0.8/0.2` 라인 상자 분할을 적용하여 위 첨자는 상자를 떠날 때만 줄을 늘립니다. `layoutPrepared`은 `LayoutNode[]` + `LayoutResult`을 할당합니다. `layoutPreparedIntoBuffer`은 할당 없이 평면형 배열을 작성하고 동일한 BiDi `reorderSegments` 패스를 적용합니다.

기타 로드 베어링 부분: `EMPTY_GLYPH_ATLAS` (`:83`, 고정 상수 — `Text`/`RichText` 전달하여 단락 메모가 새로운 `{}` 리터럴에 의해 호출당 무효화되지 않도록 합니다. 200×12 단락 재레이아웃에서 2.68× 측정 `:64`); `unmeasuredGlyphCount()`/`resetUnmeasuredGlyphCount()`/`setUnmeasuredGlyphWarning()` (`:8` — `0.5em` 제작은 묵음이 아닌 계산됩니다. `fallbackToCanvas` (`:380`, 3상태 `undefined` 대 `true`)는 누락된 아틀라스만 보고하고 누락된 측정기는 보고하지 않습니다. `GlyphMeasurer` (`:92`, `measure(char,size,family,bold,italic)` — 실행별 패밀리/스타일이 재정의되므로 `code`은 자체 측정항목으로 인라인 측정, `unmeasuredGlyphCount`에 의해 제어되는 `warnUnmeasured`(`:9`) 일회성 경고); `TextStyle` (`:113`, ~9 필드: `fontSize/color/bold/italic/fontFamily/lineThrough/baselineShift/underline/highlightColor/abbrTitle/href` — 사전에 영향을 미치는 모든 항목은 `styleSig`에 있어야 합니다. `fontFamily`은 2026-07-30까지 누락되었으며 `monospace` 단락이 무한 캐시 적중률로 `serif` 메트릭으로 제공되었습니다. 접두사 빈 아틀라스 변동이 `paragraphCache`을 0 적중으로 유지했기 때문에 잠복되었습니다. `InlineObject`(`:216`, `OBJECT_REPLACEMENT U+FFFC :198`, 수정됨 `width/height/depth/alt/key/paint` `:216`, `width/height/depth`은 이미 px로 확인되었으며, `paint`(`:301` `InlineObjectSurface { drawImage, drawImageRect } :315`)은 엔진에서 호출되지 않았으며, `InlineObjectBox { x,y,width,height } :299`에는 이미 `depth`이 포함되어 있습니다. `cacheStats()` (`:1004`)는 `resetCacheStats()` (`:1030`) 항목을 유지하여 `word(500)/grapheme(2000)/paragraph(1000)/richParagraph(1000)` (`:831` 대문자) 당 `hits/misses/evictions/hitRate/size/capacity`을 노출합니다. `LayoutResult` (`:378` `nodes/totalWidth/totalHeight/fallbackToCanvas`)은 모든 핫 경로의 유일한 출력입니다. `GridTextEntity`(`components/GridTextEntity.ts:4`, 레거시 `n`) 대 `PreparedContentGrid.ts:243` 분할은 어떤 그리드가 유지되고 어떤 그리드가 멍청한 `fillText` 루프인지를 명시적으로 보여줍니다.

코드 용어로 핫 패스 배치: `layoutPrepared`(`LayoutEngine.ts:2050`ff) 내에서 단락별 `pMax`가 먼저 개체(`objDescent`/`ascent > pMax*0.8` → `pMax = ascent/0.8`)에 대해 성장한 다음 `lineHeight = max(pMax*1.5, pMax*0.8+objDescent)`이 `computeLineSegments`/`startLine`(`:2004`)을 구동하고 하이픈 접두사 분할(`:2123`)을 사용하여 wordQueue 워크(`:2109`)가 이어집니다. `chosen`/`prefixWidth`/`hyphenWidth`) 및 `y` 배치(`:2183`)가 세 개의 팔인 글리프 루프(`:2159`): 개체(`currentY + pMax*0.8 - (height-depth)`), 기준선 이동(`currentY + (pMax-gfs)*0.8 - baselineShift`), 일반(`currentY + (pMax-gfs)*0.8`). `exclusionMask` (`:2155`) 및 선행 공백 억제(`preserveLeadingSpaces` `:796`, `:2180`)는 글리프 단위입니다. `msdfLayout.ts:154`은 제외를 제외하고 동일한 세 가지 부문을 반영합니다.

`file:line`이(가) 알 만한 가치가 있는 계약 지원:

- `GlyphAtlas`(`LayoutEngine.ts:58`, `width/baseSize/ast`) 및 `EMPTY_GLYPH_ATLAS` 대 단락 메모 ID(`:83`)에 대한 새로운 `{}` 리터럴.
- `PreparedGlyph` (`:402`, `char/width/style/object/level/sourceIndex/sourceLength/atlasMiss`) — `char.trim().length>0 && !hasGlyph`인 경우에만 `atlasMiss:true`이므로 공백은 대체를 표시하지 않습니다(`prepare`의 `:1134`).
- `PreparedWord` (`:433`, `glyphs/width/isWordLike/isWhitespace/breakPoints`) — `width`은 캐시된 합계, 소프트 하이픈의 `breakPoints` 또는 `hyphenate`입니다.
- `ExclusionRect` (`:482`) + `computeLineSegments` (`:504`) — 라인당 포함된 x 간격의 `O(n log n)` 보수.
- `LayoutEngine.isComplexScript`(`:584`, 보수적 - 과도하게 보고하므로 문맥이 없는 텍스트만 접미사만 변형 가능) 및 `splitParagraphs`(`:566`, `\r\n|\r|\n`, `consumed`는 소스 오프셋을 정확하게 유지하므로 CRLF `\r`은 두부 글리프가 되지 않습니다).
- `shiftedExtent` (`:668`)은 3개의 `pMax` 걷기 모두에서 공유됩니다. 라인 성장 논리는 절대로 분기되어서는 안 됩니다.
- `suppressLineBreaks` (`:721`, GH-457 `'@'` 조인 + 닫는 점 `.:,;)]}!?`을 `breakPoints` 리베이스와 병합).
- `LayoutBuffer`(`layoutPreparedIntoBuffer` `:2241`의 경우 `:2449`, `{ glyphs: PositionedGlyph[], widths: Float32Array, levels: Uint8Array }`, 호출 사이트에서 측정/페인트 계약을 시행하는 `V8_SMI_MAX` 경계 유형 배열 경로).

### 2.8b 줄 바꿈, exclusion 흐름, 저스티피케이션 — hot-pass 배치 규칙

핫 패스는 `PreparedText`이 `x/y`이 되는 곳입니다. 엔진 외부의 세 가지 순수 기능과 내부의 한 가지 방법이 모든 랩 결정을 관리합니다. `LayoutEngine`(`packages/layout/src/LayoutEngine.ts`)와 `msdfLayout`(`packages/layout/src/msdfLayout.ts`) 사이에 동의해야 합니다. 그렇지 않으면 GPU와 캔버스 중단이 갈라집니다.

- **`computeLineSegments(top, bottom, maxWidth, exclusions)` (`LayoutEngine.ts:504`)** — 테스트 가능한 제외 흐름의 핵심입니다. `ExclusionRect { x,y,width,height }`(`:482`) 및 `LineSegment { x0,x1 }`(`:490`)가 유일한 유형입니다. 순수 `O(n log n)`(블록 정렬) / `O(n)` 공간: `[0,maxWidth]`에 고정된 `exclusions` 겹치는 `[top,bottom)`의 x 간격을 수집하고, 접촉/겹치는 간격을 병합하고, `[0,maxWidth]` 내에서 보완합니다. 겹치는 부분이 없으면 `[{0,maxWidth}]`를 반환하고, 직사각형(또는 합집합)이 너비에 걸쳐 있으면 `[]`을 반환합니다. 글리프당이 아닌 줄당 시간 - `layoutPrepared` (`:2004` `segs = computeLineSegments(currentY, currentY+lineHeight, maxWidth, exclusions)`) 내부에서 `currentY` 진행당 한 번 호출됩니다. `hasEx` 가드(`LayoutEngine.ts:1860`)는 비배제 경로(단일 전폭 세그먼트)를 전환하므로 일반적인 경우에는 할당 비용을 지불하지 않습니다.

- **`suppressLineBreaks(words)` (`LayoutEngine.ts:721`)** — GH-457은 배치 전 사전 병합됩니다. 규칙 1: `'@'`(`glyphs.length===1 && char==='@'`)는 공백이 아닌 모든 단어와 병합됩니다(`"@vectojs/core"`는 원자성을 유지합니다). 규칙 2: 닫는 점 `.:,; ) ] } ! ?`은 줄을 시작하지 않습니다. 공백이 아닌 이전 단어로 뒤로 병합됩니다(공백 단어를 건너뛰므로 `"word !"`은 `" !"` 의사 단어를 만들지 않습니다). 병합 시 `breakPoints: number[]`을 리베이스해야 합니다(`:732` `+ offset`, `:791` `+ prev.glyphs.length`). 그렇지 않으면 소프트 하이픈 기회가 잘못된 문자 모양 인덱스 다운스트림에 도달합니다. `msdfLayout.ts:195` `isOrphanPunct` / `breakableAnywhere` (CJK `code >= 0x2e80`) 로직으로 미러링됩니다.

- **하이픈 연결** — 동일한 `PreparedWord.breakPoints: number[]`(`LayoutEngine.ts:441`)을 채우는 두 소스: 소스의 소프트 하이픈 `U+00AD`은 보이지 않는 중단 기회이며(진행 없이 자소 루프 `:1134` `(breakPoints ??= []).push(glyphs.length)`에서 사용됨) 플러그 가능한 `LayoutEngine.hyphenate: (word)=>string[]`(`:880`)는 `isWordLike && glyphs.length>3` 단어(`:1144`)별로 참조됩니다. 해당 부분은 `getGraphemes`을 통해 다시 분할되어 계산됩니다. 코드 단위가 아닌 그라핌. `hyphenWidth`(`:490`, `glyphWidth`을 통한 `'-'`의 진행)은 일부 단어가 `breakPoints`을 전달하는 경우에만 `PreparedText`당 한 번 측정됩니다(누락 비용은 측정할 수 없으며 메트릭이 없는 노드에서는 `unmeasuredGlyphs`을 증가시키지 않습니다). 랩 타임에 엔진은 소프트 브레이크(`msdfLayout.ts:131`의 `softBreaks: {at,x}[]`)를 선호한 다음 `'-'` 쿼드(`msdfLayout.ts:167` `emitHyphen`)를 방출하는 하이픈으로 연결된 분할로 대체됩니다. `MSDFTextEntity`는 주석이 달린 `layoutText`을 통해 메인 스레드에서 하이픈을 구동합니다. 작업자는 콜백을 호출하지 않습니다.

- **`shiftedExtent(gfs, shift, pMax)` (`LayoutEngine.ts:668`)** — 세 개의 `pMax` 걷기(`measurePrepared`, `layoutPrepared`, `layoutPreparedIntoBuffer`) 모두에서 공유되므로 줄 높이가 절대 갈라질 수 없습니다. 라인 상자의 높이는 `1.5 * pMax`이고 기준선은 `0.8 * pMax`입니다(`Typography.ts:93`과 동일한 분할). 돌출된 런(`shift>0`, CSS `vertical-align` 양수 위 첨자): `need = shift + 0.8*gfs`은 `0.8*pMax`에 맞아야 합니다. 낮음(`shift<0`, 아래 첨자, `InlineObject.depth` 반대 기호): `need = -shift + 0.2*gfs`은 `0.7*pMax`에 맞아야 합니다. 예: `0.75em` supershift `~0.3em`은 `0.8*(pMax-gfs)` 여유 공간에 맞고 아무것도 자라지 않습니다. 먼 변화는 `pMax`에서 `need/0.8` 또는 `need/0.7`로 증가합니다. 모든 정당화 통과 및 제외 사전은 최종 `pMax`에 대해 다시 계산됩니다.

- **`justifyLines(wrapClosedLines, lineOf, xCoords, codePoints, advances, maxWidth, maxLineWidth)` (`msdfLayout.ts:11` + `LayoutEngine.ts:1937`)** — 부드럽게 포장된 모든 선을 `maxWidth`까지 늘립니다. 전략: `lineOf`별로 `indices`을 그룹화하고 `wrapClosedLines` 누락(각 단락의 마지막 줄, 명시적 개행 및 `hitMaxHeight` 잘림)을 건너뛴 다음 `slack = maxWidth - (xCoords[lastIdx]+advances[lastIdx])`을 줄 범위의 절반으로 제한합니다(매우 짧은 줄에서 기괴한 확장을 방지). 공백이 있는 줄은 단어 간 `0x20` 간격을 동일하게 넓힙니다(`extra = slack / spaceIdx.length`, `shift` 누산기 `:58`). 공백이 없는 CJK 줄은 모든 문자 모양(`:70`) 사이에 `slack / lastContent`을 배포합니다. 다중 실행 제외 선이 정당화되지 않습니다(`LayoutEngine.ts:1937` 단일 실행 가드). `LayoutEngine`과 `msdfLayout` 사이를 미러링해야 합니다. 정렬된 너비는 `positionedRuns`과 `logicalRuns`에 대해 재사용되는 계약 콘텐츠 프로젝션입니다.

### 2.9 `packages/layout/src/measure.ts:39` — measurer selection

- `createCanvasMeasurer(family, baseSize=100)` (`:39`) — `getSharedMeasuringContext()` (`:44`), `baseSize`의 그라핌당 `Map<string,number>` 캐시, 선형 스케일링 `base * (size/baseSize)` (`:68`). 실행당 `family/bold/italic` 키는 중독을 방지합니다.
- `createMetricsMeasurer(family)` (`:96`) — 등록된 `FontMetricsSource` (버전이 지정된 `fontMetricsVersion` 비교를 사용한 `:106` 지연 해결, `normalizeFamily` 내부 할당에 비해 모든 호출에서 문자 모양별 조회에 대한 `+13%` 오버헤드가 방지됨). 실행별 `family` 재정의는 해당 실행에 대해 등록이 취소되면 `0.5em`이 아닌 기본 소스로 대체됩니다. 굵게/기울임꼴은 의도적으로 무시되었습니다(가족당 단일 고급 테이블).
- `resolveGlyphMeasurer` (`:161`) — 캔버스는 설계상 `null` 이상의 메트릭을 압도합니다. 합성된 가중치를 포함하여 렌더러가 그리는 것을 측정합니다. 오래된 등록이 Ground Truth를 재정의해서는 안 됩니다.

### 2.10 `packages/layout/src/msdfLayout.ts:93` — MSDF word-wrap for the worker

작업자 및 기본 스레드 폴백이 공유하는 순수 함수 `computeMSDFLayout(request, font)`(`:93`)(런타임 시 가져오기 없음 - esbuild는 이를 `LayoutWorkerSource.ts`을 통해 `LayoutWorker.ts`에 인라인하므로 기본 스레드 폴백이 작업자에서 분기될 수 없음) 제외 없는 `LayoutEngine.layoutPrepared`의 평면 배열 대응/글리프당 충돌 콜백/풍부한 스타일: UV 형상에 대해 `font.glyphs[].advance/kerning`(`byCode/kern`), `metrics{ascender,descender,lineHeight}`(부재 시 `0.8/-0.2` 대체 `:118`), `atlas` `aw/ah/yOrigin`(`:103`)을 사용하지만 `planeBounds/atlasBounds`은 읽지 않습니다. 이는 다시 코어 측의 `MSDFFont.layout`에 속합니다. `Array.from(text)`(`:176`, 코드 포인트 안전) 이동, `kernKey(prevCode,code)`(`:192` `+ k*fontSize`) + `letterSpacing`(`:121`)을 사용하여 글리프당 `curX` 전진, 공백 표시 제로 진행 미러링 `MSDFFont.ts:132`, 하이픈/고아 구두점 `isOrphanPunct`(`:201`, 다음과 동일 설정) `suppressLineBreaks`) 및 `breakableAnywhere` (`:195`, CJK `>=0x2e80`), `wrapClosedLines: Set<number>`, `softBreaks: {at,x}[]` (`:131`), `lineOf: number[]` (`:107`), `xCoords/yCoords: number[]`, `packedStyles: number[]` (`:104`, 팩형 `TextStyle` 비트), `advances: number[]` (`:110`), `codePoints: number[]` (`:101`), `maxLineWidth` (`:114`). 랩(`breakLine` `:140`, `dropFrom` `:155`, `emitHyphen` `:167`), `justifyLines(wrapClosedLines, lineOf, xCoords, codePoints, advances, maxWidth, maxLineWidth)`(`:11`)은 단어 간 `SPACE(32)` 간격(`:44`)을 늘리거나 공백이 없는 CJK에서 모든 글리프(`:70`) 사이에 `slack/lastContent`를 배포합니다. 둘 다 기괴함을 피하기 위해 줄 범위의 절반으로 제한됩니다. 매우 짧은 랩으로 늘립니다.

### 2.11 Worker off-thread model

**경계**: `LayoutWorker.ts:4`(`LayoutWorkerRequest`: `id/seqId/text/fontId/fontData/maxWidth/maxHeight/fontSize/lineHeight/letterSpacing/textAlign`) 및 `LayoutWorkerResponse`(`:24`: `id/seqId/width/height + Uint32Array codePoints / Float32Array xCoords/yCoords / Uint32Array packedStyles + error?:string`) `postMessage`(`LayoutWorker.ts:111`)의 전송 가능한 버퍼.

**작업자**: `packages/layout/src/LayoutWorker.ts:1` — ~115줄, `fontCache: Map<string,MSDFFontData>`(`:42`), `isLayoutWorkerRequest` 유효성 검사(`:53`), `isExpectedOrigin`(`:48`), `self.onmessage`(`:76`) → `fontCache.set` → `computeMSDFLayout(request, font)` → `postMessage(response, [codePoints.buffer, xCoords.buffer, yCoords.buffer, packedStyles.buffer])`. 알 수 없는 글꼴 → 자동 삭제 대신 오류 모양의 길이가 0인 응답(`LayoutWorker.ts:92`).

**관리자**: `packages/layout/src/LayoutWorkerManager.ts:28` — 싱글톤(`getInstance` `:206`), `new Blob([WORKER_SOURCE_STRING])` + `URL.createObjectURL`을 통한 `createWorker`(`:67`)(`LayoutWorkerSource.ts`; 미러 `MarkdownWorker` CSP 가드: `typeof Worker/Blob/URL` 없음 → `null` → 메인 스레드 폴백, 던지지 않음). `onmessage`은 `${id}-${seqId}`(`:99`)을 `pendingCallbacks: Map<string,PendingLayout>`(`:34`)과 일치시키고 `consecutiveWorkerFailures`(`:109`)을 재설정합니다. `onerror/onmessageerror` → `handleWorkerFailure` (`:120`), `MAX_CONSECUTIVE_WORKER_FAILURES=2` (`:19`), `workerUnavailable=true` → 메인 스레드에 유지됩니다(2026-07-31에 측정된 CSP `worker-src 'none'`: 6개의 `queueLayout` 호출이 6개의 작업자를 생성했으며 레이아웃은 없습니다). `fontDataById`(`:043`, 평생 유지됨, 작업자 사망 시 지워지는 `registeredFonts`과 다름)을 사용하면 호출자가 `fontData`을 한 번만 전달할 때 대체 레이아웃이 작동할 수 있습니다. `warnedUnknownFonts` (`:049`)은 반복되는 콘솔 경고를 무음으로 설정합니다. `queueLayout(entityId, opts, callback)` (`:224`)는 50ms(`:314` `setTimeout(runLayout,50)`)를 디바운싱하고 `seqIdCounter`을 비교하여 늦은 응답이 무시되도록 합니다. `cancelLayout/cancelLayoutForEntity` (`:220`/`:319`)은 타이머와 `prefix === ${entityId}-` 보류 중인 지도 항목을 배출합니다. `resolvePendingOnMainThread`(`:144`)은 작업자가 사망할 때 보류 중인 모든 `computeMSDFLayout`을 직접 재생합니다. `errorResponse` (`:176`)는 알 수 없는 글꼴 응답 모양을 합성합니다.

**소비자**: `packages/core/src/text/MSDFTextEntity.ts:25` — `queueLayout()`(`:204`)이 `LayoutWorkerManager.getInstance().queueLayout(this.id, { id, seqId: ++seqId, text: layoutText, fontId: font.id, fontData: font.data, maxWidth/maxHeight/fontSize/lineHeight/letterSpacing/textAlign }, cb)`에 전화합니다. `seqId`는 엔터티당 단조롭고, `lastRenderedSeqId`(`:048`)는 오래된 응답을 삭제하고, `contentEpoch`(`:051`)은 변경되지 않은 동기화를 건너뛰고, `rebuildProjectionLines()`(`:273`)는 `getContentProjection()`(`:248`)에 대해 `projectionLines: ContentProjectionLine[]`을 다시 빌드합니다. 하이픈 연결기는 `layoutText`에 `U+00AD`를 추가하여 메인 스레드에서 실행됩니다(작업자에 복제할 수 없음). `watchAtlasDecode` (`:106`)은 아틀라스 이미지 디코딩을 기다립니다. `SVGEntity.ts`은 텍스트가 아닌 형제 엔터티입니다.

### 2.12 Benchmarks, comparisons, and how the numbers are produced

텍스트 레이아웃에는 **콜드**(세그먼트+측정) 및 **핫**(위치)라는 두 가지 정직 비용이 있습니다. 콜드+핫 호출을 핫 호출과 비교하면 차이가 발생합니다. 리포지토리는 세 곳에서 사과 대 사과 분할을 시행합니다.

- **`benchmarks/text-layout-pretext`** 및 **`comparisons/text-layout-pretext/*`** (`entry.ts:1`, `page/*`, `serve.ts`, `build.ts`) — `@vectojs/layout` 대 `@chenglou/pretext`. 둘 다 실제 브라우저에서 `canvas measureText`을 통해 측정합니다(`comparisons/text-layout-pretext/entry.ts:1` 헤더 참조: V8과 Gecko는 다르며 헤드가 있는 GPU 지원 창만 할당 가능합니다. `hyprland-browser-bench`이 해당 하네스를 소유합니다). `prepare` 대 `prepareWithSegments`(콜드) 및 `measurePrepared` 대 `layout`(핫)은 유일하게 비교할 수 있는 절반입니다. `layoutPrepared` / `layoutText`(모든 글리프 위치)에는 대응되는 구실이 없으며 별도로 보고됩니다.
- **`scripts/compare-pretext.ts:1`** — `benchmarks/bench.ts`에 의해 실행되는 헤드리스 대응. `Bun.build`을 통해 `vectojs core` + `pretext`을 IIFE에 묶고, Playwright가 제어하는 Chrome에 삽입하고, 말뭉치/글꼴당 `Range.getClientRects().length`를 통해 DOM 진실을 설정한 다음 줄 수 오류와 진실 및 콜드/핫 처리량을 보고합니다. 자체 기록을 문서화합니다. 2026년 8월 4일까지 우리의 결합된 `layoutText()`을 구실의 뜨거운 `layout()`에 대해 시간을 측정하고 `vectojs-docs/testing-catalog.md:A6`에 "아직 사과 대 사과"로 표시되었습니다.
- **`vectojs-docs/forge/baselines/*`** — 하네스가 생성하는 준공식 베이스라인(`glyph-batch-*.json`, `content-projection-frontload-*.json` 등). 모두가 텍스트 레이아웃인 것은 아닙니다. `glyph-batch`는 `LayoutBuffer` 너비 경로를 공유하는 WebGL 글리프 업로드 비용이고 스트리밍 중 `markdown-stream-*` 캡처 lex+레이아웃 상호 작용입니다. 각각은 `benchmarks/run-browsers.sh`를 통해 `commit`, CPU/GPU/드라이버 환경 및 `refreshHz`을 전달하므로 이후 비교가 정규화될 수 있습니다.

**로컬에서 다시 실행하는 방법**(헤드리스, 할당할 수 없지만 회귀에 유용함): `bun run scripts/compare-pretext.ts`(Playwright + `google-chrome-stable`)는 마크다운 테이블을 인쇄하고 `scripts/.compare-results.json`를 씁니다. 할당 가능한 숫자의 경우: 작업 공간 루트의 `benchmarks/run-browsers.sh`(전용 Hyprland 작업 공간에서 실제 Chrome/Firefox 구동, COOP/COEP 검증, 기아 감지).

## 3. `packages/core`에서 합성되는 방식

`MSDFTextEntity.text` → `rebuildLayoutText()`(`:187`, 소프트 하이픈에 주석 달기) → `queueLayout()`(50ms 디바운스) → `LayoutWorkerManager`(작업자 또는 기본 스레드) → `computeMSDFLayout` → 형식화된 배열 → `MSDFTextEntity.layoutResult` + `projectionLines` → WebGL `setMSDFTexture`/`addGlyph` per `PositionedGlyph`, `getContentProjection().lines` for a11y, `CanvasGeometry` DPR 보상.

`Text`/`RichText` (`@vectojs/ui`)은 `LayoutEngine` + `measureContext`를 직접 통과합니다(캔버스 경로). 동일한 불변량, 다른 측정자.

### 2.13 `GridTextEntity` 각주 — retained 그리드 vs retained prose

`packages/core/src/components/GridTextEntity.ts:4`(`class n extends Entity`, `GridTextEntity`)은 레거시 고정 폭 그리드 엔터티(고정 `charWidth/charHeight`, `updateGrid(ascii[])` `:23`, `render` `:36`)입니다. `prepareContentGrid` 이전 버전이며 bidi 흐름, 아랍어 형태 또는 `PreparedContentGrid`를 따르지 **않습니다**. `ascii: string[]`에 대한 직접 `IRenderer.fillText` 루프(`:44`)입니다. bidi/CJK/grid a11y가 필요한 모든 것에 대한 최신 대체품은 콘텐츠 그리드 투영(`01-selection.md` §3.3)을 갖춘 `prepareContentGrid`(`packages/text/src/PreparedContentGrid.ts:243`)입니다. `GridTextEntity`은 `packages/core/test/GridTextEntity.test.ts` 및 `packages/core/src/index.ts:n`에서 "고정 공간을 그리는 가장 멍청한 것"으로 남아 있습니다.

## 4. 어려운 케이스 — 측정된 실패

### 4.1 분리된 캔버스 폰트 해석 (Firefox 전용)

`Intl.Segmenter`(`LayoutEngine.ts`의 단어 `:916` / 자소 `:917`, `PreparedContentGrid.ts`의 `:76`), `BidiResolver` / `BiDi`(`BidiResolver.ts:3` `bidi-js`), `registerFontMetrics`(`fontMetrics.ts:82`, `getFontMetrics`을 통해 `Typography.ts:67`에서 직접 호출되고 `measure.ts:75`에서 간접적으로 호출됨), `cold/hot split`로 Greppable (`LayoutEngine.ts:459`–`1848`, ** 및 `measurePrepared` / `layoutPrepared` / `layoutPreparedIntoBuffer` 삼부작으로 주석 처리됨) 및 `zero-GC` (`LayoutEngine.ts:2241` `layoutPreparedIntoBuffer` + `msdfLayout.ts:1` 플랫 어레이 + `BidiResolver.reorderSegments` `:121`). 감사 제외 흐름은 `computeLineSegments` `:504` 및 `ExclusionRect` `:482`입니다. DPR 양자화는 `PAGE_SCALE_BASIS_PX = 256`(`ContentProjectionManager.ts:71`)입니다.

§2.3 테이블(`packages/text/src/measureContext.ts:18`) 참조: 모놀리식 발전이 20~47% 부족합니다. 수정은 첨부 파일입니다. 잔여 0.3%(`131.579` 대 `132.000`)는 정수 장치 px에 대한 Gecko 그리드 맞춤이며 탈출할 수 없습니다(`text-rendering: geometricPrecision` 측정 동일, `:34`). 분리된 캔버스 생성(`grep -rn 'createElement.*canvas'` `packages/`)을 검색하여 감사합니다. `OffscreenCanvas`은 수정 사항이 아닙니다. 페인팅된 캔버스(`131.579`)가 아닌 DOM 레이아웃(`132.000`)에 동의합니다.

### 4.2 CJK vs Latin 메트릭

`0.5em` 대체는 32픽셀(`packages/layout/src/LayoutEngine.ts:973` 주석)의 Chrome에 대해 좁은 글리프에서 `+125%` 오류를 측정하고 넓은 `-47%`를 측정했습니다. 실제 `resolveGlyphMeasurer`을 사용하는 `EMPTY_GLYPH_ATLAS`(`:83`)는 줄바꿈 오류를 해결합니다. `MSDFFont`이 등록된 `createMetricsMeasurer`은 SSR/헤드리스를 치료합니다. 한 단락에 혼합된 `CJK | Latin`이 동일한 `layoutPrepared` 실행에 속합니다. `GlyphMeasurer` 키는 실행당 `fontFamily/bold/italic`이므로 비례 내부의 `monospace`은 자체 발전을 사용하고 `styleSig`에는 발전에 영향을 미치는 모든 `TextStyle` 필드가 포함됩니다.

### 4.3 BiDi 재정렬 vs 선택 순서

`reorderIndices`은 브리지입니다. 하이라이트 사각형의 경우 논리→시각적(`logicalToVisualRuns` `:62`), 적중 테스트의 경우 시각적 열→논리, 페인트 순서의 경우 `reorderVisual`(`:89`)입니다. `PreparedContentGrid`는 시각적 `x`(`packages/text/src/PreparedContentGrid.ts:315`)을 사용하여 `cells`을 논리적 순서로 유지합니다. 선택 오프셋은 시각적 인덱스가 아닌 소스(논리적) 오프셋입니다. 자소당 캐리어에 대한 `tmp/boss-research/01-selection.md` §3.2/§4.1 + 이 계약의 `shapedPaint` 절반 및 `buildVisualLineGroups`이 `node.y + height*0.8`으로 그룹화되고 칩을 자체 라인으로 분할하는 경우 `forge/findings/text-richtext-and-markdown.md:356`(InlineObject)을 참조하세요.

### 4.4 한 단락 내 혼합 폰트 폴백

`family:'monospace'` 코드 범위를 갖는 `family: 'Noto Sans'` 스타일의 단락입니다. `GlyphMeasurer.measure(char,size,'monospace')` (`packages/layout/src/measure.ts:60`) 해당 가족의 조치; 알 수 없는 실행 제품군은 `0.5em`(`:138`)가 아닌 기본 소스로 대체됩니다. 단락 메모 `styleSig`에는 `fontFamily`이 포함되어 있습니다(2026-07-30까지 누락되었으며 빈 아틀라스 변동으로 인해 캐시가 0 히트로 유지되었기 때문에 잠복됨). 테스트: `benchmarks/text-layout-pretext` / `comparisons/text-layout-pretext` 및 `scripts/compare-pretext.ts:1`(`Range.getClientRects` 줄 수 진실을 사용한 차가운/뜨거운 사과 대 사과).

### 4.5 DPR에 민감한 advance

Canvas은 그리드 맞춤을 장치 px로 발전시킵니다. `LayoutEngine` `shiftedExtent` / `cssLineBoxBaseline`는 DPR과 별개로 `0.8` 상승 비율을 사용합니다. CodeBlock 아틀라스는 첫 번째 구성 시 `devicePixelRatio`(`packages/markdown/src/Markdown.ts:1358`, `GlyphRasterAtlas.ts:139` `readonly dpr`)를 캡처하고 확대/축소 후 흐리게 처리했습니다(`forge/findings/text-richtext-and-markdown.md:724`, `sceneDpr 4.286 / atlasDpr 1.579 → blitScale 2.71`). 수정: `Scene.watchDevicePixelRatio()`(`Scene.ts:2805`)을 아틀라스 DPR에 공급합니다. 평균 휘도가 아닌 `maxGradient`(피크 에지)를 통해 다시 확인합니다(얇은 모노 글리프로 혼동되고 2.71× 불일치에서 잘못된 방식으로 측정된 `0.216→0.251`). `Atlas.ts:139`의 DPR 클램핑 `min(dpr,3)`은 별도의 천장입니다. 올바른 재구성이라도 `4.286` 패널에서 3을 초과할 수 없습니다.

### 4.6 줄바꿈 소유권과 CRLF 유령 글리프

`splitParagraphs` (`LayoutEngine.ts:566`) 정규식 `/\r\n|[\r\n]/g` 및 `MSDFFont.layout` (`MSDFFont.ts:213`)는 모두 `ArabicShaper`/`BidiResolver`/`glyphWidth` 단계 **전에** 구분 기호를 사용하고 `sourceIndex` 연속성을 위해 `consumed` (`:569` `m[0].length`)을 기록합니다. 순진한 `text.split('\n')`는 `\r`을 단락의 마지막 문자로 남깁니다. 너비가 `missingAdvance*size`인 눈에 보이는 두부로 모양이 지정되고 측정되고 배치되며 이후의 모든 `sourceIndex`은 CRLF당 하나씩 벗어납니다. `PreparedContentGrid.sourceLines`(`:197`)은 동일한 계약을 전달하며(`sourceEnd`은 구분을 제외하고 `nextSourceStart`은 이를 소유함) `source`이 구분으로 끝날 때 명시적인 후행 빈 줄을 추가로 삽입합니다(`:217` `if (start===source.length)`). 테스트: `benchmarks/text-layout-pretext`은 DOM 진실에 대해 소스를 `\n`로 정규화하지만 원시 소스를 별도로 측정합니다. 패리티는 원시 `"\r\n"` 소스가 `"\n"` 소스와 동일한 `totalHeight` 및 `sourceIndex` 적용 범위를 생성한다는 것을 의미하며 `sourceLength` 간격은 줄당 1입니다.

### 4.7 하이픈 + 고아 구두점 + 저스티피케이션이 순서대로 합성되어야 함

콜드: 소프트 하이픈 `U+00AD`(`LayoutEngine.ts:1134`) 및 `hyphenate` 콜백(`:1144`)은 모두 `PreparedWord.breakPoints`(`:441`)에 기여합니다. `hyphenWidth`(`:490`)은 any가 있는 단어에 대해서만 한 번 측정됩니다. 인기: `suppressLineBreaks`(`:721`)은 병합 시 `breakPoints`을 리베이스하므로 `"@vectojs/core"` 내부에서 분할된 하이픈이 현재 원자 토큰의 중간에 위치하지 않습니다. 단어 대기열 탐색(`:2109`ff)은 전체 단어 줄 바꿈으로 돌아가기 전에 접두사 하이픈(`chosen` 스캔 `:2133`)을 선호합니다. 결과: `wrapClosedLines`(`msdfLayout.ts:125`) 및 `justifyLines`(`:11`)은 모두 최종 중단 결정을 읽으므로 하나를 다른 것 없이 고정하면 측정된 너비(투영용)가 배치된 `x`(잉크용)와 일치하지 않는 정렬된 선이 생성됩니다. `LayoutEngine` 및 `msdfLayout`은 모두 하이픈 `+ letterSpacing` + 고아 논리를 복제합니다. 다른 하나 없이 하나를 변경하는 것이 일반적인 회귀입니다.

## 5. 개발자가 지켜야 할 불변식

1. **칠하는 위치를 측정하세요.** `getSharedMeasuringContext()`(`packages/text/src/measureContext.ts:87`)을 사용하세요. `appendChild` 없이 길 잃은 `document.createElement('canvas')`에 대한 Grep.
2. **뜨거운 전에 차가운, DOM에 대해 절대 다시 분할하지 마십시오.** `prepare`/`prepareRich` 한 번, `layoutPrepared` 여러 번(`packages/layout/src/LayoutEngine.ts:1080` `/` `:1266` `/` `:1848`). 교대근무 시간과 bidi 순서를 다시 분할합니다.
3. **`styleSig`의 모든 사전 영향 필드.** `glyphWidth`에 도달하면 `styleSig`/`fingerprint`(`:1266:styleSig`)에 도달합니다. 하나를 생략하면 단락 캐시가 적중률을 복원할 때까지 잠복됩니다.
4. **`InlineObject` ID에는 `key`이 포함됩니다.** `alt/width/height`은 동일하지만 `paint`이 다른 두 `U+FFFC`는 `key`에서 달라야 합니다. 그렇지 않으면 두 번째 이미지가 첫 번째 이미지(`packages/layout/src/LayoutEngine.ts:268`)를 그립니다.
5. **워커는 최적화이지 결코 요구 사항이 아닙니다.** `LayoutWorkerManager`는 두 번 연속 실패하거나 `Worker`이 없으면 호출 스레드(`:144`)에서 `computeMSDFLayout`로 성능이 저하됩니다. 알 수 없는 글꼴 → 입력된 오류입니다. 콜백이 중단되지 않습니다(`:176`).
6. **`indexMap` 및 `sourceIndex`은 바이트 충실도를 유지합니다.** 아랍어 형성 인덱스 맵(`packages/text/src/ArabicShaper.ts:91`)은 정보의 소스입니다. `LayoutNode.sourceIndex/sourceLength`는 모양이 지정된 텍스트가 아닌 원래 문자열의 색인을 생성하므로 접근성은 이후 오프셋(`forge/findings/text-richtext-and-markdown.md:372`)을 이동하지 않고 `InlineObject.alt`을 대체할 수 있습니다.
7. **메트릭 레지스트리 버전을 지정합니다.** `FontMetricsSource`을 캐싱하기 전에 `fontMetricsVersion()`(`packages/text/src/fontMetrics.ts:64`)를 읽어야 합니다. 프로세스 중간에 제품군의 메트릭을 바꾸는 것은 실제 코드 경로(웹 글꼴 교체, 수정된 데이터)입니다.
8. **`0.5em`은 측정되지 않음을 의미합니다. 계산해 보세요.** 테스트/SSR에서 `unmeasuredGlyphCount()`(`packages/layout/src/LayoutEngine.ts:31`)를 확인하세요. 0이 아닌 것은 아틀라스 글리프가 누락된 것이 아니라 조작된 중단을 의미합니다(`fallbackToCanvas`은 기본적으로 모든 `Text`/`RichText` 단락에서 true이며 품질에 대해서는 아무 것도 말하지 않습니다).

## 6. 메트릭 패리티를 깨지 않고 새 스크립트나 스타일을 추가하는 방법

**새 스크립트(예: 태국어, 데바나가리 문자):**

1. 말뭉치에 대해 `isComplexScript`(`packages/layout/src/LayoutEngine.ts:584`)을 실행합니다. 조건자는 스트리밍 `shapeSimpleRun` 바로 가기(`:1358`)를 제어합니다. 모든 상황에 맞는 스크립트는 `true`를 반환해야 단락이 전체 `shapeArabic`+`BidiResolver` 경로를 사용하도록 합니다. 그렇지 않으면 접미사 전용 리셰이퍼가 그라핌를 독립적으로 형성하고 자동으로 결합 텍스트 연결을 끊습니다.
2. 마크가 쉐이핑을 위해 투명하다면 이를 `ArabicShaper.isHarakat`(`:70`) 및 `MSDFFont.isNonspacingMark`(`:132`)에 함께 추가하십시오. 이는 반드시 일치해야 하는 리프 패키지입니다.
3. 사전 적용 범위를 추가하십시오: 스크립트에 대한 MSDF 아틀라스 글리프 또는 등록된 지표(`registerMSDFFontMetrics`, `packages/text/src/fontMetrics.ts:97`). 둘 중 하나가 없으면 `unmeasuredGlyphs`은 모든 문자를 계산하고 구분 기호는 `0.5em` 추측입니다.
4. 새 스크립트를 CJK+라틴어와 혼합하는 줄에서 `auditSceneSelection`(`packages/devtools/src/selectionAudit.ts`)로 확인합니다. 간격 예산은 `PAGE_SCALE_BASIS_PX = 256` 양자화(`ContentProjectionManager.ts:71`)이므로 이웃별로 진행을 변경하는 스크립트가 보이지 않습니다.

**새 `TextStyle` 필드:**

1. 질문하세요: "`glyphWidth`이 바뀌나요?" 렌더러가 예약된 사전(`underline`, `lineThrough`, `highlightColor`)을 변경하지 않고 오프셋/장식으로 그리는 경우 패리티가 작동하지 않습니다. 측정된 전진(`fontSize`, `fontFamily`, `bold`, `italic`, 다른 `measure` 경로를 선택하는 모든 것)을 변경하는 경우 `styleSig`/`fingerprint`(`packages/layout/src/LayoutEngine.ts:1266`) 및 `styleRangeEquals`(`:682`)에 포함되어야 합니다.
2. 스타일 동일성과 서명에 필드를 함께 추가합니다. 하나만 테스트하면 다른 쪽은 메모 독으로 남습니다(다른 단락이 충돌하고 동일한 단락이 적중하지 않음).
3. 필드가 `0.8 * pMax`(상승) / `0.7 * pMax`(하강) 외부에서 수직으로 글리프를 이동하는 경우 `shiftedExtent`(`:668`)를 통해 `baselineShift` 스타일 수직 성장을 추가합니다. 세 번의 `pMax` 걷기 모두 그것을 호출해야 합니다.

**새로운 줄 바꿈 규칙:**

- `suppressLineBreaks`(`:721`) 또는 `justifyLines`(`packages/layout/src/msdfLayout.ts:11`)에 거주합니다. 병합 시 하이픈 `breakPoints`을 이동한 상태로 유지합니다(`:732` `+ offset`, `:791` `+ glyphs.length`). 랩 상태(`wrapClosedLines`, `lineOf`, `softBreaks`)는 `LayoutEngine`과 `msdfLayout` 사이에 중복됩니다. 둘 다 변경합니다.

### 4.8 수직 혼합 — `baselineShift`와 인라인 객체

**`TextStyle.baselineShift` (`LayoutEngine.ts:146`, px, `positive = UP`, CSS `vertical-align` 규칙)** — 수평으로만 렌더링되지만(변경되지 않고 진행) 측정값은 수직으로 변경됩니다. `0.8/0.7 * pMax` 여유분에 맞을 만큼 적당한 값은 줄 높이를 그대로 둡니다(`0.75em` 위 첨자 `+0.22em`이 일반적인 경우입니다). 라인 상자 외부에 문자 모양을 배치하는 시프트는 `shiftedExtent`(`:668`)을 구동하여 `pMax`을 늘리고 증가된 값은 모든 `currentY` 진행 및 `computeLineSegments` 호출에 전파됩니다. 따라서 _이_ 라인과 다음_ 라인 사이의 공간은 키가 큰 인라인 개체가 강제로 적용하는 것처럼 넓어집니다. 발신자는 수직 공간을 스스로 확보해서는 안 됩니다. 엔진이 한 곳에서 한 번 수행하거나 세 번의 `pMax` 보행이 일치하지 않고 `measurePrepared`이 `layoutPrepared` 페인트와 다른 높이를 보고합니다.

**`InlineObject` (`LayoutEngine.ts:216`, `StyledSpan.object` `:343`에는 `text===OBJECT_REPLACEMENT` 필요)** — 세 개의 숫자, 모두 **최종 크기의 픽셀**(글리프 진행과 달리 `fontSize` 실행으로 크기 조정되지 않음): `width`(수평 진행), `height`(전체 상자), `depth`(기준선 아래, 양수 아래 - `baselineShift`의 반대 기호). 엔진은 `width`을 예약하고 `shiftedExtent` 성장에 `height/depth`을 기록하며 배치된 `LayoutNode.object` 상자를 보고합니다(`x/y`에는 이미 `depth`이 포함되어 있음). `object.paint(surface, box)`(`:301`)을 호출하지 않습니다. 텍스트 렌더러는 `LayoutNode.object`당 한 번씩 호출합니다. 함정: `alt`은 `RichText.accessibleText`을 통해 접근성에 도달하지만(`collectSpans`은 `U+FFFC`을 `alt`로 대체) `copy/selection`는 여전히 `sourceText` 공간에서 1문자 센티널로 색인을 생성하므로 `alt` 길이는 나중에 `sourceIndex` 산술로 이동하지 않습니다. 동일한 증상이 있는 두 번째 함정: `paint`은 단락 메모 키의 일부가 **아닙니다**(호출당 클로저로 인해 영원히 0 히트로 유지됨) — 대리 `InlineObject.key`(`:259`)는 `paint`이 다를 때 달라야 합니다. 또는 동일한 `alt`을 가진 두 개의 배지가 캐시된 단락을 공유하고 두 번째 배지가 첫 번째 이미지를 그립니다(다시 관찰된 `forge/findings/text-richtext-and-markdown.md` a11y/InlineObject). 항목).

### 4.9 스트리밍 비용과 suffix-only 셰이핑이 시간이 걸리는 곳이 아닌 이유

`LayoutEngine.streamShapeCache`(`:839`, `isComplexScript` `:584` 게이트, `shapeSimpleRun` `:1644`)은 성장하는 Markdown 블록(`Markdown.ts:899` 스트리밍 `appendMarkdown`)에서 청크당 비용을 `O(length)`에서 `O(appended)`로 줄이기 위해 단락 메모(`:829`/`833`)와 함께 도입되었습니다. 346KB 합성 문서(`forge/findings/text-richtext-and-markdown.md:356`)에서 측정: **동일한 비용은 2630ms 대 2639ms**입니다. 실제 Markdown에는 단락이 제한되어 있습니다. 기존 메모는 이미 단락당 모양 변경을 제한하므로 접미사만 모양 지정은 병리학적으로 큰 단일 단락에만 도움이 됩니다. 결과는 정확성 승리(`isComplexScript` 조건자 및 `styleRangeEquals`/`objectRangeEquals` 검사로 자동 결합 텍스트 연결 끊김 방지)로 제공되었지만 독립 실행형 `@vectojs/core` 릴리스에서 성능 수정으로 게시되지 **않았습니다**. 스트리밍 시간을 진단할 때 `prepareRich` + `measureText` + 콘텐츠 프로젝션 동기화(`forge/findings` 2026-07-20 항목: `perf.ts` `requestAnimationFrame` 델타)가 중요합니다. MSDF는 글리프 _드로잉_을 변경하고 `64fps→120Hz`는 별도의 경로입니다.

## 5b. 확장 불변식 (§5에서 확장)

1. **칠하는 위치를 측정하세요.** `getSharedMeasuringContext()`(`packages/text/src/measureContext.ts:87`)을 사용하세요. `appendChild` 없이 길 잃은 `document.createElement('canvas')`에 대한 Grep.
2. **핫 전에 콜드, DOM에 대해 절대로 다시 세그먼트화하지 마십시오.** `prepare`/`prepareRich` 한 번, `layoutPrepared` 여러 번(`packages/layout/src/LayoutEngine.ts:1080` `/` `:1266` `/` `:1848`). 교대근무 시간과 bidi 순서를 다시 분할합니다.
3. **`styleSig`의 모든 사전 영향 필드.** `glyphWidth`에 도달하면 `styleSig`/`fingerprint`(`:1266:styleSig`)에 도달합니다. 하나를 생략하면 단락 캐시가 적중률을 복원할 때까지 잠복됩니다.
4. **`InlineObject` ID에는 `key`이 포함됩니다.** `alt/width/height`은 동일하지만 `paint`이 다른 두 `U+FFFC`는 `key`에서 달라야 합니다. 그렇지 않으면 두 번째 이미지가 첫 번째 이미지(`packages/layout/src/LayoutEngine.ts:268`)를 그립니다.
5. **워커는 최적화이지 결코 요구 사항이 아닙니다.** `LayoutWorkerManager`는 두 번 연속 실패하거나 `Worker`이 없으면 호출 스레드(`:144`)에서 `computeMSDFLayout`로 성능이 저하됩니다. 알 수 없는 글꼴 → 입력된 오류입니다. 콜백이 중단되지 않습니다(`:176`).
6. **`indexMap` 및 `sourceIndex`은 바이트 충실도를 유지합니다.** 아랍어 형성 인덱스 맵(`packages/text/src/ArabicShaper.ts:91`)은 정보의 소스입니다. `LayoutNode.sourceIndex/sourceLength`는 모양이 지정된 텍스트가 아닌 원래 문자열의 색인을 생성하므로 접근성은 이후 오프셋(`forge/findings/text-richtext-and-markdown.md:372`)을 이동하지 않고 `InlineObject.alt`을 대체할 수 있습니다.
7. **메트릭 레지스트리 버전을 지정합니다.** `FontMetricsSource`을 캐싱하기 전에 `fontMetricsVersion()`(`packages/text/src/fontMetrics.ts:64`)를 읽어야 합니다. 프로세스 중간에 제품군의 메트릭을 바꾸는 것은 실제 코드 경로(웹 글꼴 교체, 수정된 데이터)입니다.
8. **`0.5em`은 측정되지 않음을 의미합니다. 계산해 보세요.** 테스트/SSR에서 `unmeasuredGlyphCount()`(`packages/layout/src/LayoutEngine.ts:31`)를 확인하세요. 0이 아닌 것은 아틀라스 글리프가 누락된 것이 아니라 조작된 중단을 의미합니다(`fallbackToCanvas`은 기본적으로 모든 `Text`/`RichText` 단락에서 true이며 품질에 대해서는 아무 것도 말하지 않습니다).
9. **`\r` 및 CRLF는 모양이 지정되지 않습니다.** `splitParagraphs` (`LayoutEngine.ts:566`, `PreparedContentGrid.ts:197`) 및 `MSDFFont.layout` (`MSDFFont.ts:213`)는 모두 모양/측정 단계 전에 줄 끝을 표시합니다. 빠져나가는 길 잃은 `\r`은 팬텀 너비가 있고 잘못된 `sourceIndex`이 있는 위치 문자 모양이 됩니다.
10. **제로 GC 미러 할당 - BiDi 패스를 동기화 상태로 유지합니다.** `layoutPreparedIntoBuffer`(`:2241`)는 `layoutPrepared`의 `reorderVisual`(`:89`)과 동일한 `BidiResolver.reorderSegments`(`BidiResolver.ts:121` 유형 배열) 순열을 적용해야 하며 `shiftedExtent`/`computeLineSegments`/`justifyLines`을 미러링해야 합니다. 여기서 드리프트는 bidi 단락이 스크롤될 때까지 조용합니다.

## 6b. 확장 가이드 (§6에서 확장)

**새 스크립트(예: 태국어, 데바나가리 문자):**

1. 말뭉치에 대해 `isComplexScript`(`packages/layout/src/LayoutEngine.ts:584`)을 실행합니다. 조건자는 스트리밍 `shapeSimpleRun` 바로 가기(`:1358`)를 제어합니다. 모든 상황에 맞는 스크립트는 `true`를 반환해야 단락이 전체 `shapeArabic`+`BidiResolver` 경로를 사용하도록 합니다. 그렇지 않으면 접미사 전용 리셰이퍼가 그라핌를 독립적으로 형성하고 자동으로 결합 텍스트 연결을 끊습니다.
2. 마크가 쉐이핑을 위해 투명하다면 이를 `ArabicShaper.isHarakat`(`:70`) 및 `MSDFFont.isNonspacingMark`(`:132`)에 함께 추가하십시오. 이는 반드시 일치해야 하는 리프 패키지입니다.
3. 사전 적용 범위를 추가하십시오: 스크립트에 대한 MSDF 아틀라스 글리프 또는 등록된 지표(`registerMSDFFontMetrics`, `packages/text/src/fontMetrics.ts:97`). 둘 중 하나가 없으면 `unmeasuredGlyphs`은 모든 문자를 계산하고 구분 기호는 `0.5em` 추측입니다.
4. 새 스크립트를 CJK+라틴어와 혼합하는 줄에서 `auditSceneSelection`(`packages/devtools/src/selectionAudit.ts`)로 확인합니다. 간격 예산은 `PAGE_SCALE_BASIS_PX = 256` 양자화(`ContentProjectionManager.ts:71`)이므로 이웃별로 진행을 변경하는 스크립트가 보이지 않습니다.

**새 `TextStyle` 필드:**

1. 질문하세요: "`glyphWidth`이 바뀌나요?" 렌더러가 예약된 사전(`underline`, `lineThrough`, `highlightColor`)을 변경하지 않고 오프셋/장식으로 그리는 경우 패리티가 작동하지 않습니다. 측정된 전진(`fontSize`, `fontFamily`, `bold`, `italic`, 다른 `measure` 경로를 선택하는 모든 것)을 변경하는 경우 `styleSig`/`fingerprint`(`packages/layout/src/LayoutEngine.ts:1266`) 및 `styleRangeEquals`(`:682`)에 포함되어야 합니다.
2. 스타일 동일성과 서명에 필드를 함께 추가합니다. 하나만 테스트하면 다른 쪽은 메모 독으로 남습니다(다른 단락이 충돌하고 동일한 단락이 적중하지 않음).
3. 필드가 `0.8 * pMax`(상승) / `0.7 * pMax`(하강) 외부에서 수직으로 글리프를 이동하는 경우 `shiftedExtent`(`:668`)를 통해 `baselineShift` 스타일 수직 성장을 추가합니다. 세 번의 `pMax` 걷기 모두 그것을 호출해야 합니다.

**새로운 줄 바꿈 규칙:**

- `suppressLineBreaks`(`:721`) 또는 `justifyLines`(`packages/layout/src/msdfLayout.ts:11`)에 거주합니다. 병합 시 하이픈 `breakPoints`을 이동한 상태로 유지합니다(`:732` `+ offset`, `:791` `+ glyphs.length`). 랩 상태(`wrapClosedLines`, `lineOf`, `softBreaks`)는 `LayoutEngine`과 `msdfLayout` 사이에 중복됩니다. 둘 다 변경합니다.

## 7. 읽기 및 검증 체크리스트

**이 보스의 신입생을 위한 독서 순서:**
`measureContext.ts:1`(다른 어떤 것도 정직하지 않은 불변) → `fontMetrics.ts:14` → `Typography.ts:93` → `BidiResolver.ts:27` + `ArabicShaper.ts:18` → `PreparedContentGrid.ts:38`(유지 그리드 대응) 대 `components/GridTextEntity.ts:4`(레거시 `n`) → `LayoutEngine.ts:916`(`Intl.Segmenter`) → `:929`(`glyphWidth`) → `:1080`/`1266` 콜드 → `:1848` 인기 → `:504`/`:721`/`:668` 배치 규칙 → `measure.ts:39` → `MSDFFont.ts:151`/`msdfLayout.ts:93` → `LayoutWorker.ts:1`/`LayoutWorkerManager.ts:28` → `MSDFTextEntity.ts:25`. 산문 핫 경로로 돌아가기 전에 `PreparedContentGrid` 이후에 `01-selection.md` §§3–4로 교차 확인하세요.

**글리프를 이동할 수 있는 변경 후 빠른 감사:**

- [ ] `unmeasuredGlyphs`(`LayoutEngine.ts:31`)은 작업 부하에서 여전히 0입니다(또는 새 표시가 원인이며 이제 `registerMSDFFontMetrics`에 포함됩니다).
- [ ] `cacheStats()` (`LayoutEngine.ts:1004`) `hitRate`는 0으로 떨어지지 않았습니다. 모든 사전 영향 스타일은 여전히 `styleSig`/`fingerprint` 및 `styleRangeEquals`/`objectRangeEquals`에 있습니다.
- [ ] 커닝이 심한 선 + CJK/이모지 혼합 선 + bidi 선의 `auditEntitySelection` / `auditSceneSelection` (`packages/devtools/src/selectionAudit.ts`) — 델타는 `<0.5px`을 유지합니다.
- [ ] 작업자 대체 적용: `scripts/compare-pretext.ts:1` DOM 진실(`Range.getClientRects` 줄 수)은 여전히 콜드(`prepare` / `prepareWithSegments`) 및 핫(`measurePrepared` / `layout`) 경로와 모두 일치합니다.
- [ ] `\r\n` / 단독 `\r` 문서는 `\n` 정규화된 쌍과 동일한 줄 수를 렌더링합니다. 팬텀 `\r` 글리프와 `sourceIndex`가 CRLF 전체에 연속되어 있지 않습니다.

## 8. 포인터

- 벤치마크: `benchmarks/text-layout-pretext`(`bench.ts`), `comparisons/text-layout-pretext/entry.ts:1`(`corpus()`, `buildAtlas()`, `preparePhase()`/`layoutPhase()`), `comparisons/text-layout-pretext/page/*`, `scripts/compare-pretext.ts:1`(콜드/핫 분할, `Range.getClientRects` DOM 진실, 사과 대 사과 `measurePrepared` 대 `pretext.layout`; 또한 단일 `CanvasRenderer` 계산된 조명 픽셀 하나의 `Scene`에 두 번째 `CanvasRenderer`을 중복 계산하지 말라고 경고하는 온전한 점검, `forge/findings:text-richtext-and-markdown.md:564`).
- 기준선: `vectojs-docs/forge/baselines/*`(`glyph-batch-chrome-*.json`, `content-projection-frontload-*.json` 등) 및 `vectojs/benchmarks/bench.ts`. 각각은 `benchmarks/run-browsers.sh`를 통해 `commit`, CPU/GPU/드라이버 및 `refreshHz`을 전달합니다.
- 발견 사항(추가 전용, 다시 작성하지 않음): `vectojs-docs/forge/findings/text-richtext-and-markdown.md`(23개 항목 — 분리된 캔버스 Firefox 2026-08-02 `:461`, `InlineObject.alt` AT `:364`에 도달하지 않음, 3개의 GFM 구성이 자동으로 삭제됨 `:508`, 코드 블록 DPR 흐림 `:724`, 스트리밍 re-lex 2차 `:624`, 접미사만 형성 부정적인 결과 `:356` — 현실적인 문서, 제한된 단락에서 동일한 비용 `2630ms vs 2639ms`).
- 그리드 경로: 터미널/편집기 절반 및 DPR 양자화/오버레이/그라핌 캐리어별 세부 사항에 대한 `tmp/boss-research/01-selection.md`는 여기서 반복되지 않습니다.
- Entity 레이어: `packages/core/src/text/MSDFTextEntity.ts:25` + `SVGEntity.ts`, `packages/core/src/components/GridTextEntity.ts:4`(레거시 `n`) 대 `packages/text/src/PreparedContentGrid.ts:243`(보존 그리드), `references/text/pretext` 읽기 전용 클론, `packages/layout/src/LayoutWorkerSource.ts`(생성, 편집 없음) 및 `PositionedGlyph` 쿼드의 캔버스→GPU 계약에 대한 `SPEC.md`. 직접 벤치마크는 규범적이지 않고 비교적입니다. 구실은 텍스트 전용이고 VectoJS는 글리프 + 선택 + a11y를 제공하므로 "줄바꿈에서 어느 것이 더 빠른지"는 공정하고 "어느 것을 사용해야 하는지"는 공정하지 않습니다.
