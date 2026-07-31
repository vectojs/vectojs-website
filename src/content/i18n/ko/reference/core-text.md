---
title: '텍스트 및 Bidi'
description: '독립형 @vectojs/text 패키지(그리고 @vectojs/core/text 하위 경로): 타이포그래피 메트릭, MSDF 폰트 파싱, 아랍어 셰이핑 및 bidi 리졸버, 그리고 코어-상주 MSDFTextEntity/GridTextEntity GPU 텍스트 렌더러.'
order: 7
---

# 텍스트 및 Bidi — `@vectojs/text`

텍스트 셰이핑 프리미티브 — `BidiResolver`, `ArabicShaper`, `Typography`,
`MSDFFont`, `prepareContentGrid`/`PreparedContentGrid` — 는 독립형
**`@vectojs/text`** 패키지입니다(`bidi-js`에만 의존하는 리프 패키지). `Entity`
기반 GPU 텍스트 렌더러(`MSDFTextEntity`, `SVGEntity`,
`TextEntity`/`GridTextEntity`)는 `Entity`를 확장하므로
[`@vectojs/core`](/reference/core-api/)에 남아 있습니다. 코어가 `@vectojs/text` 프리미티브를
재-내보내기하므로 `@vectojs/text`, `@vectojs/core`, 또는 `@vectojs/core/text`
하위 경로에서 해석됩니다. [레이아웃 엔진](/reference/core-layout/)의 콜드/핫 분할을 기반으로 구축되었습니다.

## MSDFFont

```ts
new MSDFFont(data: MSDFFontData)
MSDFFont.parse(json: string | MSDFFontData): MSDFFont   // msdf-atlas-gen JSON 읽기
font.getGlyph(unicode: number): MSDFGlyphDef | undefined
font.layout(text, fontSizePx, opts?: MSDFLayoutOptions): MSDFLayoutResult   // \\n, 커닝, letterSpacing 적용
font.distanceRange / font.atlasWidth / font.atlasHeight
```

사실상의 표준 `msdf-atlas-gen` JSON을 파싱하고 텍스트를 아틀라스 UV가 있는
CSS-픽셀 쿼드로 배치합니다(y-다운 로컬 공간; v=0은 아틀라스 상단). `layout()`을 WebGL
백엔드의 `setMSDFTexture` + `addGlyph`([WebGL 포인트 레이어](/reference/core-renderer/#webgl-포인트-레이어) 참조)와
쌍으로 사용하여 해상도 독립적인 GPU 텍스트를 렌더링합니다. 타입:
`MSDFFontData`, `MSDFAtlasInfo`, `MSDFMetrics`, `MSDFGlyphDef`, `MSDFBounds`,
`MSDFKerning`, `PositionedGlyph`, `MSDFLayoutResult`, `MSDFLayoutOptions`.

## MSDFTextEntity

```ts
new MSDFTextEntity(text: string, options: MSDFTextEntityOptions)
// options: { font: MSDFFont, texture: TexImageSource, fallbackFont?, fontSize?, color?, lineHeight?, letterSpacing? }
setText(text: string): void
```

Scene이 `pointBackend: 'webgl'`로 실행될 때 WebGL 포인트 레이어를 통해 선명한
MSDF 글리프를 렌더링합니다; 그렇지 않으면 `fallbackFont`로 Canvas2D `fillText`로 폴백합니다.
레이아웃은 `LayoutWorkerManager`를 통해 **스레드 외부**에서 계산되고
콜백 시 적용되어 `markDirty()`를 호출합니다 — 따라서 텍스트는
생성/`setText` 후 하나의 비동기 틱 후에 나타납니다.

## TextEntity & GridTextEntity (`.`에서)

```ts
new TextEntity(text: string, atlas: GlyphAtlas, maxWidth: number, fontSize = 32)
text.setText(text): this        // 콜드 패스 (재분할 + 재측정), 그런 다음 리플로우
text.setMaxWidth(maxWidth): this // 핫 패스 전용 — 캐시된 PreparedText 재사용 (저렴한 반응형 리사이즈)
text.setTextAlign(align: 'left' | 'justify'): this
text.setHyphenator(fn: ((word: string) => string[]) | null): this

new GridTextEntity(_atlas: any, fontSize = 10)
grid.updateGrid(ascii: string[])   // 고정폭 셀 그리드; interactive=false (성능을 위해 a11y 끄기)
```

`setTextAlign('justify')`는 줄바꿈된 줄을 `maxWidth`에 맞게 늘입니다(단어 간 간격,
또는 공백 없는 CJK 줄의 문자 간 간격); 각 문단의 마지막 줄은
고르지 않게 유지됩니다. `setHyphenator()`는 단어 → 부분 함수(예: `hyphen` npm 패키지의
Knuth–Liang 패턴)를 연결하여 긴 단어가 중간에서 가시적 `-`로
끊어질 수 있게 합니다; 소스 텍스트에 이미 있는 소프트 하이픈(U+00AD)은
하이퍼네이터 없이도 작동합니다. 둘 다 `TextEntity`가 각 노드의 계산된 `x`에서
**글리프별로** 렌더링되므로 적용됩니다 — 정렬/하이퍼네이션 수학이 시각적으로 적용됩니다.

`MSDFTextEntity`와 `@vectojs/ui` `Text`/`RichText` 컴포넌트는 동일한
기본 `LayoutEngine`을 공유하지만, 아직 이 두 메서드를 노출하지 않습니다 — `Text`/`RichText`는
각 줄바꿈된 줄을 성능을 위해 하나의 네이티브 `fillText()` 호출로 렌더링하므로,
옵션이 노출되더라도 글리프별 정렬 오프셋을 조용히 무시합니다. 오늘날
정렬 또는 하이퍼네이션된 텍스트가 필요하면 `TextEntity`를 직접 사용하거나(또는 `textAlign`/`hyphenate`가
설정된 원시 `LayoutEngine` 구동) 하세요.

## Bidi / 쉐이핑

```ts
ArabicShaper.shapeArabic(text: string): ShapedResult   // { shapedText, indexMap: Int32Array } — 프레젠테이션-폼 결합
BidiResolver.getBaseLevel(text: string): number
BidiResolver.resolveLevels(text: string): Uint8Array
BidiResolver.reorderVisual(nodes: any[], baseLevel: number): void
BidiResolver.reorderSegments(str: string, levels: Uint8Array, baseLevel: number):
  Array<[number, number]>
```

가벼운 내장 bidi: 범위 기반 방향 클래스(히브리어/아랍어 R/AL,
EN/AN 숫자) 및 아랍어 문맥별 프레젠테이션-폼 선택. `indexMap`은
쉐이핑된 인덱스를 히트-테스팅 / 캐럿 매핑을 위해 소스 문자열로 매핑합니다.

`reorderVisual`은 노드 객체 배열을 제자리에서 재정렬합니다. `reorderSegments`는 노드 객체 없이도 동일한 UAX #9 **L2** 범위(런의 자체 위치에 대한 포함적 `[start, end]` 인덱스 쌍)를 노출하므로, **병렬 타입 배열**을 보유한 호출자는 동일한 순서 변경을 제자리에서 적용할 수 있습니다 — 이것이 제로-GC 버퍼 레이아웃 경로가 사용하는 것입니다. `reorderVisual`은 현재 이것에 위임하므로 둘 사이에 이탈이 발생하지 않습니다.

사용법은 [Text & Typography](/learn/text-typography/)를 참조하세요.

## 헤드리스 환경에서의 텍스트 메트릭

```ts
registerFontMetrics(family: string, source: FontMetricsSource): void
registerMSDFFontMetrics(family: string, font: MSDFFont | MSDFFontData | string)
createMSDFMetricsSource(font: MSDFFont): FontMetricsSource
getFontMetrics(family: string): FontMetricsSource | undefined
hasFontMetrics(): boolean
fontMetricsVersion(): number
clearFontMetrics(): void
```

텍스트 측정은 일반적으로 렌더러가 실제로 그릴 글꼴을 측정하는 Canvas 2D 컨텍스트를 통해 이루어집니다. 컨텍스트가 없으면 (Node SSR, `OffscreenCanvas`가 없는 워커 등) 측정할 대상이 없으며 모든 글리프의 advance는 일률적으로 `0.5em`으로 폴백됩니다. 32px의 `sans-serif`를 사용한 Chrome에서의 측정과 비교했을 때 좁은 텍스트에서는 **+125%**, 넓은 텍스트에서는 **−47%** 잘못되었으며 `iiiiiiiiii`는 `WWWWWWWWWW`와 정확히 동일한 너비로 출력됩니다. 자동 줄바꿈은 이 오류를 상속하므로 줄바꿈도 잘못된 위치에 배치됩니다.

시작 시 메트릭을 한 번 등록하여 이를 수정하세요. 모든 `msdf-atlas-gen` JSON이 작동하며 해당 `glyphs[].advance`, `kerning` 및 `metrics`만 읽힙니다. 아틀라스 이미지는 무관하므로 메트릭 전용 파일만 있으면 충분하고 디코딩되는 것은 없습니다:

```ts
import { registerMSDFFontMetrics } from '@vectojs/core';

registerMSDFFontMetrics('sans-serif', await readFile('inter.json', 'utf8'));
```

패밀리는 따옴표를 제거하고 대소문자를 구분하지 않고 일치하며, 쉼표로 구분된 목록은 첫 번째 패밀리만 등록합니다. 동일한 패밀리를 다시 등록하면 이전 source를 대체하고, `clearFontMetrics()`는 모든 항목을 삭제합니다 (레지스트리는 프로세스 전체에서 유지되므로 테스트 격리에 유용합니다).

MSDF가 아닌 글꼴에 대한 source를 직접 제공합니다:

```ts
interface FontMetricsSource {
  advanceEm(char: string): number | undefined; // required
  measureEm?(text: string): number | undefined; // honors kerning
  ascenderEm?: number; // for cssLineBoxBaseline
  descenderEm?: number;
}
```

세 가지 경로가 레지스트리를 참조합니다: 레이아웃 엔진의 글리프별 advance, `@vectojs/ui`의 전체 문자열 너비 (`Button`, `Input`, `Link`, `Checkbox`, `ContextMenu`, `ProgressBar`의 크기 지정), 그리고 `ascenderEm`/`descenderEm`이 필요한 `cssLineBoxBaseline`의 기준선입니다.

> [!IMPORTANT]
> 실제 Canvas 2D 컨텍스트가 항상 우선하므로 메트릭을 등록한다고 해서 브라우저가 측정하거나 그리는 내용이 변경되지는 않습니다. 렌더링할 엔진을 재정의하기 위한 것이 아니라 조작된 추측을 대체하기 위해 존재합니다.

`measureEm`은 제공할 가치가 있습니다. 글리프별 계약은 `measure(char, fontSize, family)`이며 인접한 문자가 없으므로 합산된 advance로 kerning을 복구할 수 없습니다 (커닝이 많은 문자열의 경우 약 ~10% 오차). 전체 문자열 측정은 `measureEm`을 통해 이루어지며 정확합니다.

조작된 advance로 측정된 텍스트가 있는지 확인하려면 [`@vectojs/layout`](/reference/core-layout/)의 `unmeasuredGlyphCount()`가 이를 계산하고 일회성 콘솔 경고를 통해 해결 방법을 알려줍니다. 이것은 **atlas** 누락만 보고하고 브라우저에서도 거의 모든 단락에서 true가 되는 `LayoutResult.fallbackToCanvas`와는 다릅니다.

## 관련 항목

[Layout engine](/reference/core-layout/) (이것이 렌더링하는 콜드/핫 패스) ·
[Renderers](/reference/core-renderer/) (WebGL 포인트 레이어, 콘텐츠 투영) ·
[`@vectojs/core` 개요](/reference/core-api/)
