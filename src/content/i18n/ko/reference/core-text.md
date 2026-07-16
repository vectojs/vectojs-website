---
title: '텍스트 및 Bidi'
description: '@vectojs/core/text 하위 경로: MSDF 폰트 파싱 및 GPU 텍스트 렌더링, TextEntity/GridTextEntity, 내장 아랍어 쉐이핑 및 bidi 리졸버.'
order: 7
---

# 텍스트 및 Bidi — `@vectojs/core/text`

[`@vectojs/core`](/reference/core-api/)의 일부입니다. [레이아웃 엔진](/reference/core-layout/)의
콜드/핫 분할을 기반으로 구축되었습니다.

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
백엔드의 `setMSDFTexture` + `addGlyph`([WebGL 포인트 레이어](/reference/core-renderer/#webgl-point-layer) 참조)와
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
```

가벼운 내장 bidi: 범위 기반 방향 클래스(히브리어/아랍어 R/AL,
EN/AN 숫자) 및 아랍어 문맥별 프레젠테이션-폼 선택. `indexMap`은
쉐이핑된 인덱스를 히트-테스팅 / 캐럿 매핑을 위해 소스 문자열로 매핑합니다.

사용법은 [Text & Typography](/learn/text-typography/)를 참조하세요.

## 관련 항목

[Layout engine](/reference/core-layout/) (이것이 렌더링하는 콜드/핫 패스) ·
[Renderers](/reference/core-renderer/) (WebGL 포인트 레이어, 콘텐츠 투영) ·
[`@vectojs/core` 개요](/reference/core-api/)
