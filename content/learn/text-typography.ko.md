+++
title = "텍스트 및 타이포그래피"
description = "VectoJS의 텍스트 시스템: Cold/Hot LayoutEngine 분할, LLM 출력을 위한 스트리밍, 혼합 스타일의 리치 텍스트, MSDF 폰트, 아랍어/BiDi, 제외 형상."
weight = 14

[extra]
order = 14
+++

# 텍스트 및 타이포그래피

VectoJS는 두 가지 핵심 아이디어를 중심으로 구축된 텍스트 엔진을 제공합니다: **측정과 레이아웃 분리**(크기 조정이 재측정을 피함)와 **문단 수준 메모이제이션**(추가 경로가 변경되지 않은 선행 문단을 재사용할 수 있음).

## 라이브 체험

<figure class="sandbox">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">라이브 · @vectojs/core</span></div>
  <iframe src="/sandbox/text-streaming.html" class="sandbox-frame" loading="lazy" title="텍스트 스트리밍 인터랙티브 예제" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>30ms마다 호출되는 <code>label.append(chunk)</code> — O(document)가 아닌 O(changed paragraph). Replay를 클릭하여 스트림을 다시 시작하세요.</figcaption>
</figure>

## 올바른 컴포넌트 선택

| 시나리오                               | 사용             |
| -------------------------------------- | ---------------- |
| 정적 또는 간단한 동적 텍스트           | `Text`           |
| 혼합 스타일 (볼드, 이탤릭, 링크, 색상) | `RichText`       |
| 마크다운 문서                          | `Markdown`       |
| 해상도-독립적 GPU 텍스트 (게임 UI, 3D) | `MSDFTextEntity` |
| 고정폭 그리드 (터미널)                 | `GridTextEntity` |
| 벡터 아틀라스 기반 커스텀 텍스트       | `TextEntity`     |

`Text`, `RichText`, `Markdown`은 `@vectojs/ui`에 있습니다. `Entity` 기반 텍스트 렌더러(`MSDFTextEntity`, `GridTextEntity`, `TextEntity`)는 `@vectojs/core`에 있습니다. 이들이 기반으로 하는 하위 수준 셰이핑 프리미티브 — BiDi, 아랍어 셰이핑, 타이포그래피 메트릭, MSDF 폰트 파싱, 준비된 콘텐츠 그리드 — 는 독립형 `@vectojs/text` 패키지이며, 줄 나눔/인라인 레이아웃 엔진은 `@vectojs/layout`입니다. 둘 다 `@vectojs/core`가 재-내보내기하므로 어느 쪽에서든 임포트할 수 있습니다.

### 선택 가능한 고정-그리드 텍스트

터미널, 코드 편집기 및 기타 셀별 렌더러는 Core 1.8의 `prepareContentGrid()`로 논리적 소스를 컴파일해야 합니다. 반환된 셀을 Canvas에 그리고 `getContentProjection()`에서 동일한 불변 그리드를 반환하세요. 이렇게 하면 복사/찾기 소스, 적법한 그래핌 캐럿, 탭, CJK/이모지 너비, 아랍어 시핑, bidi 배치, 브라우저 선택이 별도의 DOM 레이아웃을 유지하는 대신 하나의 지오메트리 계획에서 유지됩니다.

브라우저-해결된 폰트로 Canvas를 통해 `cellWidth`를 측정하고, 소스나 폰트 메트릭이 변경될 때 그리드를 재구축하며, 커스텀 컨테이너나 애플리케이션 줌 변경 후 `scene.resize()`를 호출하세요. 이 resize는 Firefox 폰트 대체 및 누락-글리프 Range 메트릭에 대한 콜드 캘리브레이션 경계이며, 안정적인 렌더링은 지오메트리 읽기 없이 준비된 캐리어를 재사용합니다.

---

## Text

자동 래핑이 있는 단일 및 여러 줄 텍스트입니다. 내부적으로는 핵심 `LayoutEngine`(다른 모든 텍스트 컴포넌트와 동일한 분할 파이프라인)을 실행합니다.

```typescript
import { Text } from '@vectojs/ui';

const label = new Text('Hello, world', {
  font: '400 16px Inter', // CSS shorthand
  color: '#e2e8f0',
  maxWidth: 300, // wrap at 300px; omit for no wrapping
  lineHeight: 24, // line advance in px
  preserveLeadingSpaces: false,
});

label.setPosition(40, 40);
scene.add(label);
```

### Cold vs Hot 업데이트

`Text`에는 비용이 매우 다른 세 가지 변경 메서드가 있습니다:

```typescript
label.setText('New content'); // EXPENSIVE — cold pass: re-segment + re-measure
label.append(' more tokens'); // EFFICIENT — only the last paragraph is re-measured
label.setMaxWidth(200); // CHEAP — hot pass: re-wrap only, no re-measure
```

텍스트를 토큰별로 스트리밍할 때 이 차이점을 활용하세요:

```typescript
// Wrong — rebuilds the full measured text on every token
for await (const token of stream) {
  label.setText((accumulated += token)); // O(document) per token → slow
}

// Correct — only the changed paragraph is re-measured
for await (const token of stream) {
  label.append(token); // reuses unchanged paragraphs; re-prepares the changed tail
}
```

사용자가 창 크기를 조정할 때 `setMaxWidth(newWidth)`를 호출하세요 — 캐시된 측정 텍스트로 리플로우되므로 모든 리사이즈 이벤트에서 안전하게 호출할 수 있습니다.

---

## RichText

다중 스타일 인라인 텍스트: 볼드, 이탤릭, 색상, 다양한 크기, 링크 실행이 모두 공유 기준선에서 함께 흐릅니다.

```typescript
import { RichText } from '@vectojs/ui';
import type { StyledSpan } from '@vectojs/core';

const spans: StyledSpan[] = [
  { text: 'Build ' },
  { text: 'fast', style: { bold: true, color: '#00f0ff' } },
  { text: ' UIs with ', style: { italic: true } },
  { text: 'VectoJS', style: { bold: true, href: 'https://vectojs.org/' } },
  { text: '.' },
];

const rich = new RichText(spans, {
  font: '16px Inter',
  color: '#e2e8f0',
  maxWidth: 600,
  linkColor: '#38bdf8',
  onLinkClick: (href) => window.open(href, '_blank'),
});

scene.add(rich.setPosition(40, 40));
```

### `TextStyle` 필드

```typescript
interface TextStyle {
  bold?: boolean;
  italic?: boolean;
  color?: string;
  fontSize?: number; // overrides base font size for this run
  href?: string; // makes the run a link
}
```

> [!NOTE] > `bold`와 `italic`은 렌더링에만 영향을 미치고 측정된 너비에는 영향을 주지 않습니다 (볼드 획이 어드밴스 너비를 약간 초과합니다). `fontSize`는 측정된 너비와 줄 높이 **모두**에 영향을 미치므로, 한 줄에 다양한 크기를 혼합해도 올바르게 작동합니다 — 각 줄의 높이는 가장 큰 글리프에 의해 결정됩니다.

### 스트리밍 `appendSpans()`

`Text.append()`와 마찬가지로 `appendSpans()`는 변경되지 않은 선행 문단을 재사용합니다:

```typescript
const rich = new RichText([]);
scene.add(rich);

for await (const token of llmStream) {
  rich.appendSpans([{ text: token, style: { color: '#a5f3fc' } }]);
}
```

### 제외 형상 (장애물 주위 텍스트 흐름)

`exclusions`를 전달하여 텍스트가 직사각형 장애물 주위로 흐르게 하세요 — CSS float와 유사합니다:

```typescript
const rich = new RichText(spans, {
  maxWidth: 500,
  exclusions: [
    { x: 0, y: 60, width: 120, height: 120 }, // avoid a 120×120 image at (0, 60)
  ],
});

// Later, update dynamically:
rich.setExclusions([{ x: 0, y: 60, width: 120, height: 120 }]);
```

엔진은 줄 대역별로 자유 수평 구간(`computeLineSegments`)을 계산하고 각 구간을 독립적으로 채웁니다. BiDi 재정렬은 구간 배치 후 전체 논리적 줄에 적용됩니다.

---

## Markdown

`marked` 라이브러리(GFM 스타일)를 사용하여 Markdown을 VMT 서브트리로 렌더링합니다.

```typescript
import { Markdown } from '@vectojs/markdown';

const md = new Markdown('# Hello\n\nThis is **rich** text.', {
  maxWidth: 700,
  theme: {
    headingColor: '#f8fafc',
    codeColor: '#a5f3fc',
    bodyFont: 'Inter, sans-serif',
  },
});

scene.add(md.setPosition(40, 40));
```

지원되는 토큰: 제목(h1–h6), 문단, 키워드 하이라이팅이 포함된 펜스 코드 블록, 인용문, 순서형/비순서형 목록, 수평선, 인라인 코드/볼드/이탤릭/링크, GFM 테이블(`Table` 컴포넌트를 통해 렌더링).

### 스트리밍 Markdown

LLM 출력의 경우 `appendMarkdown()`을 사용하세요 — 절대 `setContent(fullText)`를 반복하지 마세요:

```typescript
const md = new Markdown('', { maxWidth: 700 });
scene.add(md);

for await (const token of llmStream) {
  md.appendMarkdown(token);
}
```

`appendMarkdown()`은 전체 버퍼를 다시 렉싱하고, 토큰을 마지막 렌더와 비교(diff)하며, 변경되지 않은 엔티티 프리픽스를 재사용하고, 마지막 문단을 제자리에서 업데이트합니다. 이는 시각적 트리 재구성 작업을 절약하지만 Markdown 렉싱은 여전히 전체 문서에 비례합니다. `setContent()`는 완전히 재구축을 수행하므로 일회성 교체에 사용하세요.

---

## LayoutEngine 작동 방식

cold/hot 분할을 이해하면 성능에 맞는 올바른 호출을 할 수 있습니다.

### Cold 패스 — 한 번 측정

`prepare(text)`와 `prepareRich(spans)`는 텍스트를 문단으로 분할하고, 아랍어 시핑과 BiDi를 적용하며, `Intl.Segmenter`로 단어와 그래핌으로 분할하고, 각 글리프의 어드밴스 너비를 측정합니다. `prepareContentGrid(source, metrics)`는 선택 가능한 고정-그리드 표면에 대해 해당하는 일회성 컴파일을 수행합니다. 결과(`PreparedText` 또는 `PreparedContentGrid`)는 내용이나 메트릭 입력이 변경될 때까지 유지됩니다.

**이것이 비용이 많이 드는 단계입니다.** 내용이 변경될 때만 실행하세요.

### Hot 패스 — 항상 위치 지정

`layoutPrepared(prepared)`는 캐시된 `PreparedText`를 가져와 래핑 제약 조건(`maxWidth`, `maxHeight`, 제외 형상)을 적용하여 위치가 지정된 `LayoutNode[]`를 생성합니다. 이는 순수 산술 연산입니다 — 분할이나 측정이 없습니다.

`setMaxWidth()`는 hot 패스만 실행하며 캐시된 `PreparedText`를 재사용합니다. 이것이 반응형 리플로우가 저렴한 이유입니다: 리사이즈 드래그의 모든 픽셀에서 호출해도 끊김 없이 작동합니다.

### 문단-수준 메모이제이션

캐시 키는 `fontSize + paragraphText`(일반 텍스트) 또는 `fontSize + paragraphText + styleSig`(리치 텍스트)입니다. 많은 문단이 있는 문서에 하나의 토큰을 추가할 때:

1. 변경되지 않은 문단은 캐시된 준비 데이터를 재사용할 수 있습니다.
2. 마지막(변경된) 문단만 다시 측정됩니다.

이로 인해 반복되는 측정/레이아웃 준비가 변경된 문단으로 제한됩니다. 긴 문단은 길어질수록 더 비용이 많이 들고, 상위 수준의 Markdown 파싱은 문서-전체 작업을 추가할 수 있습니다.

### 양쪽 정렬 및 하이픈 연결

`LayoutEngine`은 `textAlign = 'justify'`(래핑된 줄을 `maxWidth`에 맞게 늘림, 마지막 줄은 고르지 않음)와 래핑-타임 하이픈 연결(소프트 하이픈 `­`은 기본적으로 작동; 자동 분리를 위해 `hyphenate: (word) => string[]` 함수를 연결 — 예: `hyphen` npm 패키지의 Knuth–Liang 패턴)을 지원합니다.

`TextEntity`는 둘 다 직접 제공합니다: `text.setTextAlign('justify')`, `text.setHyphenator(fn)` — 자세한 내용은 [`TextEntity` & `GridTextEntity`](/reference/core-text/#textentity--gridtextentity-에서)를 확인하세요. `TextEntity`가 각 글리프를 자체 계산된 위치에 그리므로 올바르게 렌더링됩니다. `@vectojs/ui`의 `Text`/`RichText` 컴포넌트는 성능을 위해 각 래핑된 줄을 단일 네이티브 `fillText()` 호출로 축소하므로 아직 글리프별 양쪽 정렬을 지원하지 않습니다 — 양쪽 정렬된 본문 텍스트가 필요하면 `TextEntity`를 사용하세요.

---

## MSDF 폰트

다중-채널 Signed Distance Field 폰트는 래스터화 아티팩트 없이 모든 확대 수준에서 선명한 텍스트를 렌더링합니다. 게임 스타일 UI, 확대된 인터페이스 또는 높은 DPR 디스플레이에 사용하세요.

### 아틀라스 생성

`msdf-atlas-gen`을 설치하고 실행하세요:

```bash
msdf-atlas-gen -font myfont.ttf -type msdf -format png -imageout atlas.png -json atlas.json
```

이것은 `atlas.png`(글리프 텍스처)와 `atlas.json`(글리프 메트릭, 어드밴스 너비, UV 경계)을 생성합니다.

### VectoJS에서 로드

```typescript
import { MSDFFont, MSDFTextEntity } from '@vectojs/core/text';

// Parse the JSON
const fontData = await fetch('/fonts/atlas.json').then((r) => r.json());
const font = MSDFFont.parse(fontData);

// Load the texture image
const img = new window.Image();
img.src = '/fonts/atlas.png';
await new Promise((r) => (img.onload = r));

// Create the text entity
const msdfText = new MSDFTextEntity('Hello GPU text', {
  font,
  texture: img, // TexImageSource
  fontSize: 48,
  color: '#ffffff',
  letterSpacing: 0,
  fallbackFont: 'sans-serif', // used when pointBackend is not 'webgl'
});

scene.add(msdfText.setPosition(40, 40));
```

`MSDFTextEntity`는 레이아웃을 백그라운드 `LayoutWorkerManager` 워커(디바운스, `Float32Array` 전송을 통한 제로-복사)에 오프로드합니다. 텍스트는 생성 또는 `setText()` 후 하나의 비동기 틱 후에 나타납니다. 씬에 `pointBackend: 'webgl'`이 설정되면 글리프는 WebGL MSDF 프로그램을 통해 그려지고, 그렇지 않으면 엔티티는 네이티브 `fillText`로 폴백합니다.

### `MSDFFont.layout()` 직접 사용

커스텀 렌더러를 구축 중이거나 글리프 쿼드가 직접 필요한 경우:

```typescript
const result = font.layout('Hello', 48);
// result.glyphs: PositionedGlyph[]
// Each glyph: { char, x, y, w, h, u0, v0, u1, v1 }

for (const g of result.glyphs) {
  renderer.setMSDFTexture(texture, font.distanceRange);
  renderer.addGlyph(g.x, g.y, g.w, g.h, g.u0, g.v0, g.u1, g.v1, '#fff');
}
```

---

## 아랍어 및 양방향 텍스트

아랍어와 양방향 텍스트는 `prepare()`와 `prepareRich()` 내부에서 **자동으로** 처리됩니다. 직접 시핑 API를 호출할 필요가 없습니다.

### 내부에서 일어나는 작업

1. **아랍어 시핑** (`ArabicShaper.shapeArabic`): 아랍어 문자를 문맥에 따른 표현 형태(초성/중성/종성/단독형)로 대체하고 Lam-Alef 합자를 적용합니다. `indexMap`은 시핑→소스 인덱스를 추적하여 캐럿 히트 테스팅에 사용합니다.

2. **BiDi 레벨 할당** (`BidiResolver.resolveLevels`): UAX#9 규칙을 사용하여 각 문자에 중첩 레벨(0 = LTR, 1 = RTL, 높을수록 더 깊은 임베드)을 할당합니다. 임베드 컨트롤(LRE/RLE/PDF)이 적용됩니다.

3. **시각적 재정렬** (`BidiResolver.reorderVisual`): 각 줄의 끝에서 가장 높은 레벨부터 1까지 실행을 뒤집어 올바른 시각적 단어 순서를 생성합니다.

따라서 아랍어나 히브리어 콘텐츠가 있는 `Text` 또는 `RichText`는 그냥 작동합니다:

```typescript
const arabic = new Text('مرحبا بك في VectoJS', { font: '20px sans-serif', color: '#f8fafc' });
const hebrew = new RichText([{ text: 'שלום ' }, { text: 'VectoJS', style: { bold: true } }]);
```

> [!NOTE]
> 줄바꿈(`\\n`)은 항상 아랍어 시핑 컨텍스트와 BiDi 상태를 초기화합니다. 같은 문단 내에서 소프트-래핑된 줄은 하나의 시핑 패스를 공유하므로 여러 줄의 아랍어 문단이 줄바꿈을 가로질러 올바르게 시핑됩니다.

---

## 헬퍼 함수

`measureText`, `wrapLines`, `fontSizePx`는 커스텀 컴포넌트에서 사용할 수 있도록 `@vectojs/ui`에서 내보내집니다.

```typescript
import { measureText, wrapLines, fontSizePx } from '@vectojs/ui';

// Rendered pixel width, LRU-cached (cap 1000)
const w = measureText('Hello world', '600 16px Inter');

// Greedy word-wrap — returns string[]
const lines = wrapLines('A longer text that wraps', '16px sans-serif', 200);

// Extract the px size from a CSS font shorthand
const size = fontSizePx('600 16px Inter'); // → 16
```

`measureText`는 측정 전에 `ArabicShaper`를 통해 아랍어 텍스트를 시핑하므로 아랍어 실행에 대해 올바른 시각적 너비를 반환합니다.

---

## 성능 가이드

| 시나리오                                 | 최선의 접근 방식                                                  |
| ---------------------------------------- | ----------------------------------------------------------------- |
| 한 번 설정하는 정적 텍스트               | `new Text(content, opts)` — 한 번의 cold pass                     |
| 추가-전용 스트리밍 (LLM)                 | `text.append(token)` 또는 `md.appendMarkdown(token)`              |
| 반응형 리사이즈                          | `text.setMaxWidth(newW)` — hot pass만                             |
| 밀집된 반복 레이아웃 (예: 데이터 그리드) | `LayoutResultBuffer`를 `layoutPreparedIntoBuffer()`와 함께 재사용 |
| 해상도-독립적 텍스트                     | `MSDFTextEntity` + `pointBackend: 'webgl'`                        |
| 아랍어 / 히브리어 / RTL                  | 모든 `Text`/`RichText`/`Markdown` — 자동                          |
| 이미지 주위로 텍스트 흐르게 하기         | `RichText` + `exclusions: ExclusionRect[]`                        |

선택 가능한 텍스트는 항상 원본 논리적 유니코드 소스를 프로젝션합니다. Canvas 시핑 및 BiDi 재정렬은 픽셀에만 영향을 미칩니다; 복사, 페이지 내 찾기, 브라우저 번역, 보조 기술은 호출자의 소스 순서를 유지합니다. 소프트 래핑 구분 기호와 명시적 줄바꿈은 선행하는 시각적 행에 첨부되어 여러 줄 선택 영역이 렌더링된 줄 대역 내에 유지됩니다.

## 문제 해결

### 텍스트가 너무 넓게 표시되거나 잘못된 위치에 표시됩니다

`measureText`와 `LayoutEngine` 모두 정확한 CSS 폰트 문자열로 캔버스 `measureText` 호출을 사용합니다. 폰트 패밀리가 아직 로드되지 않은 경우(예: 웹 폰트), 브라우저는 다른 메트릭의 대체 폰트로 대체하여 레이아웃과 렌더 간에 불일치가 발생합니다.

`Text` 또는 `RichText`를 생성하기 전에 웹 폰트가 로드되었는지 확인하세요:

```typescript
await document.fonts.ready;
const label = new Text('Hello', { font: '16px Inter' });
```

### 긴 문서에서 예상보다 `append()`가 느립니다

`append()`는 **문단 수준**에서 메모이제이션합니다 (`\\n`으로 분할). 전체 문서에 줄바꿈이 없는 하나의 긴 문단인 경우 모든 `append()` 호출이 전체 문단을 다시 측정합니다.

스트리밍 콘텐츠의 경우 각 문단 뒤에 줄바꿈을 삽입하여 캐시가 분할할 수 있게 하세요:

```typescript
md.appendMarkdown(chunk);
// If the LLM output naturally has paragraphs, the memoization works automatically.
// If it is one endless run-on sentence, performance degrades to O(document).
```

### 첫 번째 프레임에서 `MSDFTextEntity` 텍스트가 보이지 않습니다

`MSDFTextEntity`는 `LayoutWorkerManager`를 통해 오프-스레드로 텍스트를 배치합니다. 결과는 생성 또는 `setText()` 후 하나의 비동기 틱 후에 도착합니다. 이는 의도된 설계입니다 — 엔티티는 레이아웃 콜백이 실행될 때 `scene.markDirty()`를 호출하여 다시 그리기를 트리거합니다.

`renderMode: 'onDemand'`를 사용하는 경우 이 다시 그리기가 올바르게 발생합니다. 텍스트가 동기식으로 표시되어야 하는 경우(예: 스크린샷 테스트), `scene.start()` 후 다음 `rAF`를 기다리세요.

### RichText 제외가 적용되지 않습니다

제외 형상은 `layoutPreparedIntoBuffer()`가 아닌 `layoutPrepared()`에서만 작동합니다. 재사용 가능한 버퍼 경로를 사용하는 경우 제외가 무시됩니다. 제외를 지원하려면 `layoutPrepared()`를 사용하세요.

> **다음:** [접근성](/learn/accessibility/) — shadow DOM이 캔버스 UI를 스크린 리더와 에이전트 구동 가능하게 만드는 방법.
