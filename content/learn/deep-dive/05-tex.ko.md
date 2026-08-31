+++
title = "05 — Zero-DOM TeX — 조판 및 SVG 방출"
description = "KaTeX 커널 → VectoJS 이미터 → 독립형 SVG가 왜 필요한지, 좌표 공간 불변식, 늘어나는 지오메트리의 함정, 그리고 새 TeX 구문을 안전하게 추가하는 경로."
weight = 25
+++

# 05 — Zero-DOM TeX — 조판 및 SVG 방출

> **Boss 05**는 브라우저 없이(DOM, CSS 엔진, 웹 글꼴 없음) TeX 문자열을 독립형 SVG로 변환하고 모든 상자, 클립 및 신축성 있는 문자 모양을 KaTeX가 브라우저에서 렌더링한 내용에 기하학적으로 충실하게 유지하는 계약을 소유하고 있습니다.
>
> - **배우게 될 내용**: KaTeX가 레이아웃 커널로 판매되는 이유와 브라우저 작업이 끝나는 곳; 스팬 트리 → SVG 방출 파이프라인; 하나의 잘못된 프레임이 모든 신축성을 깨뜨리는 5개의 좌표/변환 공간; 해당 공간에 직접 매핑되는 역사적 버그 클러스터 새로운 TeX 구성을 추가하는 안전한 방법입니다.
> - **하지 말아야 할 것**: 유니코드/BiDi, 아랍어 모양 또는 `LayoutEngine` 줄 바꿈 — boss 02가 이를 소유합니다. Markdown 작업자 전송 및 스트리밍 조정 — 보스 04; `GlyphRasterAtlas`/`SVGRasterCache` DPR 경로 — 보스 07; `IRenderer` 계약 자체.

## 왜 Zero-DOM TeX가 존재하는가

KaTeX의 자체 `buildHTML`(`packages/tex/src/kernel/VENDORED.md`)은 수직 배치를 위한 **CSS 레이아웃**(`position: relative` + `top`, `display: table-cell` + `vertical-align`), x를 위한 **인라인 텍스트 레이아웃**, 잉크를 위한 **웹폰트 해상도**(CSS 클래스 → 글꼴 파일 → 문자 모양)의 두 가지 외부 엔진에 따라 기하학이 달라지는 스팬 트리를 내보냅니다. `@vectojs/markdown`은 다음 중 어떤 것도 지불할 수 없습니다: `SVGEntity`은 `data URI → Image → createImageBitmap → drawImage`(`packages/tex/src/index.ts:8`)을 통해 래스터화됩니다. 데이터 URI에서 로드된 `Image`은 외부 URL을 확인하지 않으며 CSS 페이지를 상속하지 않으므로 KaTeX의 HTML/CSS 출력이나 웹 글꼴 기반 접근 방식 모두 여행에서 살아남습니다. SVG은 **자체 윤곽선**을 가지고 있어야 합니다.

결과는 엄격한 제약입니다. 방출된 SVG는 외부 참조가 전혀 없습니다(`<text>` 없음, `font-family` 없음, `url()` 없음, `xlink:href` 없음(`packages/tex/src/emit/svg.ts:1` 헤더)). 이러한 제약은 KaTeX 구성이 아닌 새로운 패키지를 정당화하는 것입니다.

크기는 대안(`vectojs-docs/forge/decisions/math-engine-2026-08.md:30`) 대신 이 모양을 선택한 프로그램 예산입니다. `mathjax-full@3.2.2`의 `bun build --splitting` 분해는 SVG 출력 + 내장 글꼴**에서 gzip의**84%를 측정했으며 TeX 입력 레이어에서는 ~16%에 불과하므로 레버는 패키지 트리밍이 아닌 **글리프 화이트리스트**입니다. KaTeX는 **SVG 출력이 전혀 없는 것으로 측정되었습니다**(`src/kernel/Settings.ts:206` 열거형은 정확히 `["htmlAndMathml","html","mathml"]`입니다). 그리고 최소 RaTeX `wasm32` 빌드는 **1 010 901 gzip / 768 278 brotli — 1.47× 대체할 MathJax 청크**(`math-engine-2026-08.md:103`)를 측정했습니다. 따라서 WASM은 이 작업이 존재하는 축을 획득하지 못합니다.

## 무엇이 vendored이고 무엇이 우리의 것인가

`packages/tex/package.json:14` 빌드 순서는 분할을 문서화합니다. `packages/tex/src/index.ts:25`은 다시 설명하는 대신 읽어야 할 계약 내용이 포함된 지도입니다.

- `src/kernel/` — KaTeX(MIT), **고정 커밋**(`references/markdown/KaTeX@5a5bf206`, `forge/decisions/math-engine-2026-08.md:191`)에서 `scripts/vendor-katex.ts`에 의해 복사되고 MathML 및 DOM 방출이 기계적으로 제거됩니다. **재형식 지정 또는 린트 수정되지 않음**, 따라서 파일은 업스트림과 비교 가능한 상태로 유지됩니다. `VENDORED.md`는 보관된 세트와 삭제된 세트의 이름을 지정합니다. `.oxlintrc.json` 및 `tsconfig.build.json`은 모두 바로 이러한 이유로 커널을 제외합니다(`math-engine-2026-08.md:312` 각주).
- `src/registry/` — 두 개의 손으로 작성한 파일(`defineFunction`, `defineEnvironment`) 토큰 수준 변환은 생성할 수 없습니다. `mathmlBuilder`이 해당 위치(`src/index.ts:30`)의 표현식 위치에 나타나기 때문입니다. `sideEffects:false` 트랩은 1단계 번들을 작동하지 않게 만든 원인입니다(`math-engine-2026-08.md:294` 수정 5). 따라서 `package.json`는 `sideEffects:false`이 **되어서는 안 됩니다**. 가져오기 부작용으로 `functions`/`environments`이 채워지고 트리 쉐이킹을 수행하면 모든 내장 기능이 삭제됩니다.
- `src/emit/` + `src/layout.ts` — 방출 토론이 다루는 유일한 파일입니다.
- `src/glyphs/glyphs.subset.json` — TTF 개요 → `scripts/generate-glyphs.ts`를 통한 SVG 경로, `scripts/subset-glyphs.ts`로 좁혀지고 `scripts/encode-glyphs.ts` + `src/emit/glyphCodec.ts`로 다시 인코딩됨(2단계 바이너리 형식, `math-engine-2026-08.md:282`). 제공된 런타임 테이블은 1단계 추출기(`glyphCodec.test.ts` ID 어설션)에 대한 **바이트 동일** 경로 문자열로 디코딩되며 동일한 문자 모양의 하위 집합 TTF**(`math-engine-2026-08.md:328`)보다**12.0% 낮습니다.

## 파이프라인 — 파일 맵

```text
TeX string  ──►  layout(tex, opts)                         layout.ts:62
                 Settings(displayMode,maxSize,strict)  ·─► kernel/Settings.ts
                 parseTree → AST                       ·─► kernel/parseTree.ts + Parser.ts
                 buildHTML(tree, Options) → DomSpan    ·─► kernel/buildHTML.ts + buildCommon.ts:552 makeVList
                      │ height/depth/style.top already resolved
                      ▼
                 DomSpan tree                          layout.ts:84-89  (wrapped in vecto-tex root)
                      │
                      ▼
                 emitSVG(tree, {emPx,color,padEm})     emit/svg.ts:1567  EmitResult{svg,width,height,depth,missing,placements}
                   walk → EmitState{glyphs,rects,paths,lines}
                   viewBox = layout box ∪ ink union + pad
                   defs deduplication + grouped fills + clipPaths
                      │
                      ▼
                 MathRender{uri,widthEx,heightEx,depthEx}  markdown/src/markdown-math.ts:544 convertMathToSVGDataURI
                   bounded mathCache (256) + inlineMathRasters (LRU, 256)
                   lazy import via preloadMathJax()
                      │
                      ▼
                 InlineObject{width,height,depth,alt,paint}  markdown/src/markdown-inline.ts:287 inlineMath arm
                   InlineObjectBox in LayoutEngine lines, paint draws the raster
```

`layout`(`layout.ts:62`)은 브라우저 전용 CSS 의미(`layout.ts:5`)를 전달하는 `.katex`/`.katex-display` 래퍼가 없는 KaTeX의 `buildTree`입니다. 유일하게 흥미로운 선택은 `throwOnError:true` + `strict:false` (`layout.ts:68`)입니다. 호출자가 TeX 소스를 그대로 표시하도록 성능을 저하시킬 수 있도록 하드 구문 분석 오류가 발생합니다(`@vectojs/markdown`가 알 수 없는 명령에 대해 이미 수행하는 작업). 엄격성 위반은 그렇지 않습니다.

`emit/svg.ts:1`은 브라우저가 수행했을 세 가지 작업을 수행합니다. 각 작업에는 실제 버그가 발생하기 때문에 자체 헤더에 이름이 지정됩니다.

1. **글리프 → 윤곽선을 해결합니다.** `SymbolNode`은 텍스트와 측정항목을 전달하지만 **글꼴은 전달하지 않습니다**(`fonts.ts:57` `CLASS_TO_FACE`). `\left(`은 `delimsizing size1` 조상 아래에 빈 클래스 목록이 있는 `SymbolNode`를 생성합니다. 로컬로 해결하면 `Main-Regular`을 선택하고 키가 큰 괄호가 속한 짧은 괄호를 그립니다(`math-engine-2026-08.md:444` 측정: 조상 체인을 통해 105/105 정확, `svg.ts:427` `walk` `classChain` 매개변수 없음).
2. **x를 누적합니다.** 스팬 트리에는 x가 전혀 없습니다. `functions/rule.ts:44`만 `Span.width`을 쓰고 여기서는 직사각형을 의미합니다. 다른 모든 x는 인라인 텍스트 레이아웃이므로 이미터는 TTF `hmtx` 테이블에서 글리프별 진행을 합산합니다.
3. **CSS 세로 배치 → 명시적 y로 변환합니다.** `makeVList`은 높이 `pstrutSize`의 형제 `pstrut`에 대해 각 행을 `style.top = -pstrutSize - currPos - elem.depth`로 인코딩합니다. 변환은 트리(`svg.ts:1029`)에서 `pstrutSize`를 다시 읽고 `rowY = y - (-(top + pstrutSize)) * UPEM * scale`을 사용합니다. 이는 KaTeX 레이아웃(`svg.ts:32`, `math-engine-2026-08.md:417` #1)을 다시 파생하지 않습니다.

이미터의 단위는 **1/1000 em** (`svg.ts:52` `UPEM`)이며, 글리프 테이블의 `UNITS_PER_EM` (`glyphTable.ts:49`) 및 `svgGeometry.ts`의 문서화된 1000:1 viewBox와 모두 일치합니다. `y`은 **기준선에서 아래쪽으로 양수**입니다. Glyph의 윤곽선은 y-up이므로 경로를 다시 작성하는 대신(`svg.ts:1552` `transform` 문자열, 다시 작성하면 정밀도가 떨어지고 중복 제거가 발생하지 않음) `scale(1,-1)` 내부에 배치됩니다.

그런 다음 Markdown의 래퍼(`markdown-math.ts`)는 이 파이프라인을 통해 **느리게** 조판합니다. `preloadMathJax`(`markdown-math.ts:85`, 6행의 유형 전용 `import type {emitSVG,layout}`이므로 값 가져오기가 엔진을 모든 소비자에게 가져오지 않습니다.) Dynamic-`import('@vectojs/tex')`, 256개 항목의 `MathRender`와 동일한 경계의 LRU 래스터 맵을 캐시합니다(`markdown-math.ts:218` `mathCache`, `markdown-math.ts:238` `inlineMathRasters`; `inlineMathRasters` unbounded는 P3 결과 — `forge/findings/text-richtext-and-markdown.md:1924`)였으며 `exToPx`(`markdown-math.ts:143`, `markdown-inline.ts:305`) 및 `paintInlineMath`(`markdown-math.ts:331`)을 통해 px 단위의 `width/height/depth`이 포함된 `InlineObject`로 인라인 수학을 내보냅니다. 디스플레이 수학은 `MathBlock extends MarkdownContainer`(`markdown-math.ts:598`)입니다. 두 파일 모두 `@vectojs/tex`에 대한 정적 값 가장자리를 보유하지 않습니다. 두 번째 파일입니다(이러한 이유로 `KATEX_FONT_SCALE`은(는) `markdown-math.ts:484`에서 가져오지 않고 다시 선언되었으며 `test/mathBoxGeometry.test.ts`에서는 동일성이 주장되었습니다.)

### 폰트 해석 — 전체 체인

`fonts.ts:194` `resolveFont(classes)`은 세 개의 지도를 통해 축적된 `classChain`을 우선적으로 스캔합니다.

- `DELIM_SIZE_FONTS` (`fonts.ts:98` 예: `delimsizing size1 → Size1-Regular`) — 가장 높은 이유는 신축성 있는 구분 기호가 `SymbolNode`이 아닌 조상에 이를 전달하기 때문입니다.
- `DIRECT_FONT_CLASSES`(`fonts.ts:120` 예: `mathbb → AMS-Regular`, `mathcal → Caligraphic-Regular`).
- `AVAILABLE` 대체를 통해 구성된 `CLASS_TO_FACE`(`fonts.ts:57` 예: `mord textit → Main-Italic`, `mathbf → Main-Bold`)(`fonts.ts:135` — `Math-BoldItalic`이 없으면 `Math-Regular`로 떨어짐).

크기 조정은 `sizingRatio`(`fonts.ts:265`)를 통해 `SIZE_MULTIPLIERS`(`fonts.ts:263`, 공급업체 드리프트 가드에 의해 `katex.scss $sizes` 및 `kernel/Options.ts sizeMultipliers`에 대해 확인됨 - § 공급업체 불변 가드 참조)을 통해 곱해집니다. 글꼴과 배율은 모두 리프뿐만 아니라 모든 노드의 **전체** 체인에서 확인됩니다.

### 글리프 테이블과 연결 — 하나의 이미지

하나의 `SymbolNode` → 하나의 윤곽선: `walk`은 `classChain`를 `emitSymbol`(`svg.ts:427`)에 전달합니다. 그러면 `resolveFont`을 통해 글꼴이 확인되고 `getGlyph(font, code)`(`glyphTable.ts:73`, `glyphCodec.ts:277`에서 `GlyphTable` 지원)을 통해 윤곽선이 조회되며 `glyph.advance/UNITS_PER_EM * UPEM * scale`(`svg.ts:499`)만큼 전진하는 `PlacedGlyph{x,y,scale,font,code}`(`svg.ts:132`)을 푸시하거나 — 켜집니다. 누락 — `state.missing`(`svg.ts:500`)에 `font/U+XXXX`을 기록하고 판매된 `getCharacterMetrics` 너비(`kernel/fontMetrics.ts`; 배송된 아웃라인의 상위 집합, `svg.ts:505`)만큼 진행됩니다. 반복되는 `SymbolNode.text` 문자는 `node.width`을 통해 융합되지 **않습니다**(`buildCommon.ts:296` `tryCombineChars`는 `width`을 첫 번째 문자로 남겨두고 텍스트를 연결합니다) — 각 코드 포인트는 개별적으로 측정되며 테이블과 메트릭이 모두 누락될 때 한 번 경고된 제로 진행 폴백(`svg.ts:514` `warnedMetricsMisses`, `glyphCodec.ts:83`에서 제한된 `MAX_CACHED_MISSES = 1024`)이므로 잘못된 문자 모양입니다. `penX`/`viewBox`을 중독시키지 않습니다.

## 좌표 공간 불변식

모든 배치는 DOM 수업 목록에서 SVG의 `viewBox`에 있는 마지막 픽셀까지 한 번의 이동으로 **5개의 공간**을 통과합니다. 어느 하나의 버그는 모든 신축성 있는 구조를 한 번에 깨뜨리고, 함께 부서진 두 개의 실제 클러스터가 정확히 그렇게 했습니다.

| #   | Space                           | Definition                                                                                               | Y direction                                                      | Scale                                                                                                             | Clip meaning                                                       | Where                                                                        |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 1   | **Root-local (em)**             | `state.x` pen, `y` baseline, all `parseEm` lengths × `UPEM × scale`                                      | +down, baseline origin (`svg.ts:427` `walk` `y`)                 | `sizingRatio(classChain)` accumulated (`fonts.ts:265`)                                                            | —                                                                  | `emitContainer` + `emitSymbol` entry                                         |
| 2   | **Row-local (replay)**          | `vlist-t > vlist > vlist-r > row` with `rowY = y - above` (`svg.ts:1080`)                                | +down, vlist baseline                                            | same                                                                                                              | Row indent `dx = startX + indent + marginLeft`                     | `emitVList` probe + replay (`svg.ts:1031-1180`)                              |
| 3   | **Post-transform (path-local)** | `<path transform="translate(x,y) scale(sx,sy)">` maps local → root user space                            | svg user space, y-down outside `scale(1,-1)` per glyph           | glyph: `scale / -scale`; stretchy: `sx = scaleWidth/vbW, sy=heightEm/vbH` (`svg.ts:612`)                          | `viewBox` of width `400em` at `sx` → `scaleWidth`                  | `emitSvgNode` + final `body` transform strings (`svg.ts:584`, `svg.ts:1569`) |
| 4   | **ClipPath local**              | `<clipPath><rect>` resolved **after** the referencing element's transform (SVG `userSpaceOnUse` default) | **Post**-transform user space                                    | inverse: `invSx=1/sx,invSy=1/sy` (`svg.ts:1555`)                                                                  | **Must be emitted in the path's own frame**                        | `svg.ts:1550-1562` `clipPath` rect                                           |
| 5   | **Markdown box (ex/px)**        | `MathRender{widthEx,heightEx,depthEx}` then `exToPx(…,runSize)` → `InlineObjectBox`                      | LayoutEngine line box, baseline + depth (`markdown-math.ts:566`) | `EX_PER_KATEX_EM = KATEX_FONT_SCALE/EX_PER_EM` (`markdown-math.ts:514`, 0.02% verified vs real KaTeX in Chromium) | padded by `MATH_PAD_EM=0.05` (`markdown-math.ts:481`) on all sides | `markdown-math.ts:544` + `markdown-inline.ts:305`                            |

**불변**(클리핑 또는 오버레이 분기를 내보내는 모든 경로에 유지되어야 하는 것): `PlacedPath.clip` 창은 **루트 공간**(`svg.ts:146-170`, `emitSvgNode`이 `min-width`에서 시드됨)에 기록되고, `aligned-vlist` 재생 `dx`(`svg.ts:1196` `clip.x += dx`)에 의해 변환된 다음 `sx/sy`(`svg.ts:1555`)에 의해 반전된 후에 방출됩니다. 3과 4 사이의 엇갈린 공백은 `clip.x`(`CHANGELOG:31` #787)이 아닌 `p.x + sx·clip.x`만큼 모든 급진 및 오버브레이스를 잘못 배치합니다.

## 늘어나는 지오메트리 — 세 가지 패밀리

신축성 있는 요소의 기하학적 구조는 **`Span.width`**에 없습니다. `functions/rule.ts:44`만이 그런 말을 씁니다. 세 가족, 세 가지 서로 다른 조정 사실 — 이들을 뒤섞는 것이 버그가 발생한 방식입니다.

### 일반 글리프와 규칙

- `PlacedGlyph.x`은 절대 루트 x입니다. `width`은(는) `advance/UPEM * scale`입니다. viewBox도 없고, 슬라이스도 없고, `clip`도 없습니다.
- `PlacedRect`는 `Span.width`(`svg.ts:903`)의 규칙, 전각 규칙/테두리(`svg.ts:800` `fullWidth:true`의 `borderBottomWidth` / `.angl` / `\boxed` 테두리, `svg.ts:1256`의 `placeRect`에 의해 해결됨) 또는 세로 구분 기호(`svg.ts:718`의 `vertical-separator` → 스트로크된 `PlacedLine`)의 세 가지 도형 중 하나입니다. 전체 너비 모양은 **진행 없음**에 기여합니다. — `span.width`이 없으면 의미가 있습니다.

### 단일 경로 hide-tail stretchy

`\sqrt` 및 `\phase`은 각각 CSS이 `overflow:hidden`(`katex.scss:513`에서 `hide-tail`)인 래퍼 아래에서 너비가 400em인 `SvgNode` 하나를 방출합니다.

- `\sqrt`: 래퍼는 **인라인** `style.minWidth = 0.853em`(`kernel/delimiter.ts:533`)을 쓰고 `emitContainer`은 `svg.ts:969` `clipEm = parseEm(style.minWidth) || parseEm(style.width)`에서 읽습니다. 따라서 `emitSvgNode`은 `state.x + clipEm*scale`을 `widthEm` 및 `clip.w`(`svg.ts:590`)로 시드합니다. 400em 경로의 `sx`은 `rawWidthEm`(`widthEm` 아님)을 사용하므로 `slice`는 선언된 규모로 렌더링되고 찌그러지지 않고 잘립니다.
- `\phase`: 래퍼는 **`style.height`**(`kernel/functions/enclose.ts:60`)만 씁니다. 인라인 `minWidth/width`이 없으므로 `clipEm`은 `undefined`로 유지되고 `hideTail`은 `unclippedHideTail === true`(`svg.ts:971`)입니다. 자녀는 400em(`svg.ts:966` `emitOverlayPiece` 및 `FULL_WINDOW: 0..1 xMinYMin`)으로 발전하지 않았습니다. 대신 전체 컨테이너 범위는 클립입니다(`markdown-math.ts:92`의 `markdown` 아날로그는 관련이 없으며 논리는 `svg.ts:966`입니다).

미묘함: `minWidth` **존재**하는 경우 클립이 인라인으로 시드되고 `emitSvgNode`이 정확합니다. **그렇지 않은** 경우 클립은 보류 중이며 포함하는 vlist 범위를 따라야 합니다(아래 #667 참조). 동일한 래퍼 클래스에 대한 두 개의 코드 경로입니다.

### 다중 조각 오버레이

`\overbrace`/`\underbrace`/`\xleftrightarrow`/`\xrightarrow`은 `position:absolute` 비율 창(`katex.scss:519`의 `stretchy.ts:238` `widthClasses = brace-* / halfarrow-*`; CSS)인 **2~3 범위**에 걸쳐 하나의 400em 경로를 분할합니다.

- 각 조각의 `SvgNode`은 다시 `width:"400em"`을 선언합니다. 문자 그대로 **1200em**(3×400)(`CHANGELOG:31`)에서 `\overbrace{x+y}`로 측정되었습니다.
- 조각은 **제로 진행** `PlacedPath.overlay:{start,end,align,vw,vh}`(`svg.ts:629`의 `svg.ts:195`, `emitOverlayPiece`)으로 기록되고 포함하는 vlist 행의 `width`이 알려진 경우에만 해결됩니다. 균일한 커버 스케일 `s = max(boxW/vw, boxH/vh)`, 조각당 `preserveAspectRatio` 정렬(`svg.ts:1286` `placeOverlay`의 `xMinYMin / xMidYMin / xMaxYMin`), `boxX = startX + start*width`에 창 잘림.

## 이미터가 절대 깨뜨려서는 안 되는 다섯 가지 불변식

이는 배치를 종료했으며 이후 회귀에 가장 비용이 많이 드는 방법이었습니다.

1. **`classChain`은 글꼴을 전달합니다.** `SymbolNode`에는 빈 클래스 목록이 있는 경우가 많습니다. 글꼴이 조상에 있습니다. 로컬 해상도는 짧은 것이 속한 곳에 큰 구분 기호를 그리고 큰 것이 속한 곳에 짧은 괄호를 자동으로 그립니다. **모든** 구분 수식(`fonts.ts` + `svg.ts:427` + `math-engine-2026-08.md:443` 측정)에 영향을 미칩니다.
2. **`state.x`는 기하학이 아니라 사전입니다.** `parseEm(margin*)/hmtx advance/sizingRatio` 합계가 유일한 올바른 x입니다. 두 번째 소스는 이중으로 계산됩니다.
3. **`top + pstrutSize` → `rowY`은 유일한 수직 진실입니다.** 트리에서 `pstrutSize`을 읽습니다. 다시 계산하지 마십시오(`svg.ts:1029`).
4. **`clip`/`overlay`은 포함하는 vlist 범위를 따릅니다. 다른 것은 없습니다.** 전체 너비 규칙, 꼬리 숨기기 부수, `\cancel` 오버레이 및 중괄호 부분은 모두 **자체** 포함 행의 `width`(`svg.ts:1172` `rectStart/lineStart/pathStart` + `svg.ts:1230`)에 대해 해결됩니다. 공식의 `state.x`에 대해 해결하면 이전 전진으로 `\cancel` 대각선이 잘못 배치되고 중첩된 영역이 묻어납니다.
5. **`clipPath` 직사각형은 경로-로컬 좌표에 있습니다.** `(clip.x - p.x)*invSx`(`svg.ts:1558`)을 내보내고 절대 `clip.x` 원시를 내보내지 않으며 경로(`svg.ts:1196`)와 동일한 `dx`를 사용하여 녹화된 클립을 재생합니다. 스페이스 4 ≠ 스페이스 3.

## 사례 연구 — 좌표로서의 버그

각각은 고정된 상태의 줄 번호를 갖는 별개의 공간 혼합입니다.

### #787 — `clipPath` coordinate space (`svg.ts:1550-1562`, `CHANGELOG:31`)

`clipPathUnits`의 기본값은 `userSpaceOnUse`입니다. 즉, `<clipPath>` 내부의 `<rect>`는 참조하는 `<path>`의 `transform` 이후에 해결됩니다. 따라서 ret는 경로 자체의 로컬 프레임에 작성되어야 합니다. 수정 전에는 `svg.ts:1555`이 루트 공간 `clip.{x,w}`을 그대로 내보냈으므로 SVG이 두 번째로 `translate(p.x) ∘ scale(sx)`을 적용했습니다. 창이 `p.x + sx·clip.x`에 도착했습니다. 잘린 모든 신축성(`\sqrt`, 모든 단계)은 1이 아닌 `sx`/`sy` 아래 캔버스 밖에서 사라졌습니다. 동일한 커밋은 정렬된 vlist 재생에 `svg.ts:1196` `clip.x += dx`도 추가했습니다. 클립은 바인딩된 경로와 같은 절대 루트 공간 창이기 때문입니다. 경로를 연기하지만 해당 창은 근호가 중앙 분자(`CHANGELOG:57` `svgClipWindows.test.ts`)에 있을 때 `\frac{\sqrt{x}}{y}`을 깨뜨립니다.

### #667 — `\phase` measured 400em (`svg.ts:966`, `CHANGELOG:56`)

`\sqrt`은 항상 래퍼에 인라인 `min-width`을 작성하므로 `emitSvgNode`이 즉시 클립될 수 있습니다. `\phase`은 그렇지 않습니다. 이미터는 SvgNode가 선언한 `widthEm: 400`을 진보로 신뢰하고 400em에 `\phase{-120}`을 보고했습니다. `classes.includes('hide-tail') && clipEm===undefined`을 `unclippedHideTail`(`svg.ts:971`)으로 감지하고 해당 분기를 `emitOverlayPiece(FULL_WINDOW)`(표시되는 창이 둘러싸는 행인 제로 진행 오버레이)로 라우팅하여 수정되었습니다.

### #665 — `\overbrace` measured 800–1200em (`svg.ts:859`, `CHANGELOG:58`)

동일한 근본 원인, 여러 부분: `brace-left/center/right` 및 `halfarrow-left/right`은 둘러싸는 행(`katex.scss:519`)의 `width:25/50/50%`과 함께 `position:absolute`입니다. 각 `SvgNode`은 여전히 400em을 선언합니다. 1200em에 측정된 `\overbrace{x+y}`을 추가합니다. `OVERLAY_PIECES[class]`(`svg.ts:328`)을 인식하여 해당 SvgNodes를 제로 진행 보류 오버레이(`svg.ts:867`의 `emitOverlayPiece`)로 처리하고, 국경이 CSS에만 있는 관련 `.angl` 사례에 대해 `CONTAINER_BORDER_CLASSES`(`svg.ts:308`)을 사용하여 문제를 해결했습니다.

### #825 — `\sqrt{b^2-4ac}` rendered as `b²√4ac` (`svg.ts:1186`, `CHANGELOG:15`)

두 개의 독립적인 단층은 모두 방사형 폭을 중심으로 합니다.

- `ROW_ALIGN_CLASSES.sqrt`은(는) `left`(`svg.ts:266`)가 아닌 `center`이었습니다. KaTeX에는 `.sqrt {text-align}` 규칙이 없습니다. 이니셜은 `left`입니다. `center`의 경우 좁은 400em 근호가 넓은 근원의 중앙에 위치하므로 빈쿨룸은 개구부 `b²`의 오른쪽에서 시작하는 것처럼 보입니다.
- 숨은 꼬리 클립의 크기는 `minWidth`로만 조정되었으며 실제 반경 너비에는 맞지 않았습니다. `width`(vlist 범위, 즉 더 넓은 경우의 근수 너비)가 알려지면 `svg.ts:1186`은 `p.w`/`p.clip.w`을 `max(minWidth, radicandWidth)`으로 확장했습니다. 그리고 조상(`svg.ts:1203` 가드)이 아닌 정수 `vlist` 본문 `classChain.includes('sqrt')`에 대해서만 확장되었으며, 그렇지 않으면 외부 `mfrac`이 근호를 분수 너비로 늘렸습니다.

### #788 — pinned clip windows with non-1 scale and aligned replay (`svg.ts:1196`, `svgClipWindows.test.ts`)

이전에 정렬된 vlist 싱글 워크 최적화에 대한 건전성 주장에서는 "`walk`이 `state.x`에서 유사하기 때문에 번역은 건전합니다"라고 말했으며 클립 번역은 `svg.ts:1196` 번역된 클립(`CHANGELOG:57`) **이전** 건전했습니다. 이제 회귀 테스트는 **방출된 SVG**에서 효과적인 렌더링 창이 `sx=sy=0.7` 아래 및 재생된 중앙 `\frac` 분자 내부 모두에 배치된 경로의 자체 상자와 일치하는지 확인합니다.

또한 6개의 2026-08-13 P2/P3 결과는 단락이 압축되지만 방출 코드는 여전히 부하를 견디는 가드(`forge/findings/text-richtext-and-markdown.md:1789`)로 유지됩니다.

- **#514 팬텀** — `style.color==="transparent"`(`kernel/Options.ts:306`)은 팬텀 잉크(`buildCommon.ts:96`)를 표시합니다. 잉크를 건너뛰지만 진행을 유지하는 것은 `svg.ts:479`/`svg.ts:744`(`phantom` 플래그)에 있습니다.
- **#514 색상** — TeX `\color`은 모든 노드(`functions/color.ts`)에 `style.color`을 씁니다. 이미터는 `walk`을 통해 유효한 색상을 상속하고 이를 기준으로 그룹화합니다(`svg.ts:1522` `grouped`). `svg.ts:1542`의 `escapeAttr`는 사용자 파생 문자열(`&`→`&amp;`, `"` 등)을 강화합니다.
- **#514 규칙/테두리** — 모든 `borderBottomWidth`/`katex-sout`/`.angl`/`.boxed` 스타일은 `frac-line`이 아닌 `fullWidth` 직사각형(`svg.ts:800`, `svg.ts:834`)이 됩니다.
- **#514 `op-limits`/`x-arrow`/`mover`/`munder` 센터링** — `ROW_ALIGN_CLASSES`(`svg.ts:266`)에 추가되고 `katex.scss:405`/`563`에 대해 확인되었으므로 `\sum` 제한 및 `\xrightarrow` 레이블이 연산자/화살표 중심 아래에 위치합니다.
- **#521 랩(`\llap`/`\clap`)** — CSS `right:0`/`margin-left:-50%`(`katex.scss:293`)은 세 랩을 모두 `rlap`으로 처리하는 대신 `lapWidth`을 측정하고 `state.x`을 `-lapWidth`/`-lapWidth/2`(`svg.ts:982` `lapKind` 분기)로 이동하여 구현되었습니다.
- **#521 `\smash`/viewBox** — `functions/smash.ts:66`은 자식이 크기를 유지하는 동안 노드의 `height/depth`을 0으로 만듭니다. 이미터는 레이아웃 상자가 아닌 배치된 잉크의 **결합**(`svg.ts:1630` `minX/minY/maxX/maxY` 공용체)으로 viewBox를 확장하므로 부서진 콘텐츠가 잘리지 않습니다.

### Glyph/table history that still constrains the emit contract

- **빈 잉크로 글리프 누락**(`CHANGELOG:62` `ff79c58`): `U+2248`/`h*`/`l*` 등에 대한 `569→662 (+87)` 하위 집합 추가 — 측정항목을 통해 올바르게 진행된 윤곽선이 누락되어 **정확한 너비의 빈 간격**으로 렌더링되고 보이지 않지만 레이아웃은 정확합니다.
- **디스플레이 변형 공백 구멍**(`CHANGELOG:9` set `U+2216`,`U+22C3` 디스플레이 변형, `U+005F`, 윗줄 테스트 블록): `markdown-math.ts:559`의 `convertMathToSVGDataURI`이 `emitted.missing`에서 `null`을 반환하기 때문에 조판 대신 **원시 TeX 소스**(파란색 CodeBlock)로 다운그레이드된 블록을 표시합니다.
- **`vertical-separator` (`{c|c}` / `{c:c}`)** (`CHANGELOG:29` #697): 배열 열 구분 기호는 해당 규칙을 `Span.width`이 아닌 `style.borderRightWidth`/`borderRightStyle`로 작성합니다. 수정 전에는 `svg.ts:617`이 완전히 삭제했습니다. 이제 `verticalAlign`/`height` → `(y1,y2)` (`svg.ts:718`)를 사용하여 이 펜 위치에 스트로크 선을 표시합니다.
- **클래스 전달 패딩** (`CHANGELOG:30` #696): `.x-arrow-pad`/`.cancel-pad` 등은 `katex.scss`에만 존재하므로 `CLASS_H_METRICS`(`svg.ts:366`)이 인라인 `paddingLeft`과 동일한 지점에서 접혀지기 전에 해당 패딩으로 짧게 측정된 행입니다. `.cancel-lap`의 `-0.2em` 마진은 동일한 테이블에서 쌍을 이루므로 `\cancel`은 순 상승을 유지했습니다.
- **제한된 이미지 및 래스터 캡**(`CHANGELOG:61`, `markdown-math.ts:1938` `destroy` 삭제 `workerCallbacks`): 좌표와 관련이 없지만 스트리밍된 문서에 대한 로드 베어링 — 제한되지 않은 `inlineMathRasters`은 `mathCache` 제거를 지나 URI당 `HTMLImageElement`을 고정했습니다.

## 벤더 불변식 가드

스타일시트와 커널은 트리에서 정보를 숨기기 위해 공모합니다. 아래의 모든 값은 `katex.scss` 또는 커널 파일에 존재하지만 **`DomSpan`**에는 존재하지 않습니다. 따라서 이미터는 이를 상수로 기록하고 모든 공급업체 실행(`scripts/vendor-katex.ts --check`)에서 기록을 확인합니다.

| 전사된 상수                                                           | 진실의 근원                                               | 보호된 모양                                                                      |
| --------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `MU = 1/18` (`svg.ts:60`)                                             | `katex.scss:$mu = 1em/18`                                 | 드리프트 가드는 체크아웃된 `katex.scss`에서 `MU`을 다시 파생합니다               |
| `NULL_DELIMITER_SPACE = 0.12` (`svg.ts:69`)                           | `$nulldelimiterspace = 1.2em/10`                          | 같은                                                                             |
| `SIZE_MULTIPLIERS[11]` (`fonts.ts:263`)                               | `katex.scss $sizes` + `kernel/Options.ts sizeMultipliers` | scss flattener는 둘 다 다시 파생                                                 |
| `KATEX_FONT_SCALE = 1.21` (`svg.ts:77`)                               | `.katex {font-size:1.21em}` (`katex.scss:24`)             | 동일, 또한 주장됨 `markdown-math.ts:514 ≈ markdown/test/mathBoxGeometry.test.ts` |
| `ROW_ALIGN_CLASSES` (`svg.ts:266`)                                    | `katex.scss` 섹션 405/442/563 + 문서화된 `sqrt:left` 편차 | 같은 플래너                                                                      |
| `CLASS_TO_FACE`/`DELIM_SIZE_FONTS`/`AVAILABLE` (`fonts.ts:57/98/135`) | `katex.scss` `font-family` 규칙                           | 같은                                                                             |
| `CONTAINER_BORDER_CLASSES` (`svg.ts:308`, `.angl 0.049em`)            | `katex.scss:601` `.angl` 위쪽/오른쪽 규칙                 | 같은                                                                             |
| `OVERLAY_PIECES` 창(`svg.ts:328`)                                     | `katex.scss:519` `.brace-*/halfarrow-*` 절대 창           | 같은                                                                             |
| `CLASS_H_METRICS` 패딩(`svg.ts:366`)                                  | `katex.scss:555/569/579/583/601` 패드/랩/여백             | 같은                                                                             |

`defineEnvironment`의 선택적 소품(`argTypes`, `allowedInText`, `numOptionalArgs`)은 고정되거나 삭제되지 않고 **업스트림 기본값**(`registry/defineEnvironment.ts`)을 통해 전달되므로 이를 선언하기 시작하는 향후 KaTeX 범프는 자동으로 삭제하는 대신 표면을 표시합니다(`forge/findings/text-richtext-and-markdown.md:2075`).

## 레이아웃 상호작용이 실제로 동작하는 방식

인라인 수학은 `fillText`이 **아닙니다**. `markdown-inline.ts:287` `inlineMath`는 px의 `width/height/depth`이 `exToPx(converted.{widthEx,heightEx,depthEx}, runSize)`인 `InlineObject`(개체 대체 문자 + `InlineObjectBox`)을 생성합니다. — `runSize`은 범위 트리의 해당 지점에서 **인클로징 실행** `fontSize`이므로 제목 내부의 `$x$`는 제목(`markdown-inline.ts:292`)에 따라 크기가 조정됩니다. `packages/layout/src/LayoutEngine.ts:808`의 `LayoutEngine`은 이를 인라인 이미지와 같은 고정 상자로 처리합니다. 상자의 `depth`(기준선 아래 거리)은 너비/높이 공유(좌석 깊이와 너비가 함께 파생되는)와 동일한 `KATEX_FONT_SCALE/EX_PER_EM` 척도에서 `emitted.depth + padEm`입니다. 따라서 `KATEX_FONT_SCALE`을 변경하면 모든 공식의 크기가 잘못 지정되고 현재 취소된 `EX_PER_EM`을 변경하면 아무 것도 이동하지 않습니다(`markdown-math.ts:111` 취소된 쌍 메모).

표시 수학은 줄 바꿈을 완전히 우회합니다. `MathBlock`은 컨테이너 너비에서 `MATH_PAD_EM` 패딩을 뺀 데이터 URI의 `SVGEntity`인 하위 항목인 `MarkdownContainer`입니다. 여백과 오버플로는 `LayoutEngine` 문제가 아니라 `ScrollView` 문제입니다.

### `LayoutEngine`이 인라인 수식을 다루는 방법

`LayoutEngine` (`packages/layout/src/LayoutEngine.ts:808` `LayoutEngine`, `README.md:24` 분리된 엔진)은 결코 TeX를 형성하지 않습니다. 인라인 수학은 하나의 `StyledSpan{ text: OBJECT_REPLACEMENT, object: InlineObject }`(`markdown-inline.ts:301`)로 도착하며, 그 `InlineObjectBox{width,height,depth}`은 `exToPx`을 통해 바깥쪽 실행의 `fontSize`에서 범위 수집 시간에 수정되었습니다. 따라서 레이아웃에서는 상자가 이미 px로 표시됩니다. 핫 `LayoutEngine.layout` 경로는 다른 인라인 이미지처럼 이를 래핑합니다(`forge/findings/text-richtext-and-markdown.md:1762`의 `packages/layout/src/LayoutEngine.ts:2321` `layoutPreparedIntoBuffer` 보존 선도 메모; `core/src/text/measureContext.ts:12` 보정 및 `core/src/text/Typography.ts:111` `ctx.measureText('Mg')` 대체는 동일한 상자가 의존하는 boss 02의 텍스트 측정 가드입니다): `width`은 줄 바꿈에 참여하고 `depth`은 해당 거리만큼 줄의 기준선을 떨어뜨리고 `height+depth`은 커집니다. 선의 상자이므로 깊이가 큰 공식(분수, 근수 꼬리, `\left(` 키가 큰 파렌)은 두 번째 측정 없이 클리어런스를 확장합니다. 공식에 대한 선택은 레이아웃이 아닌 이중 세계 패리티입니다. `ContentGridProjector`/`ContentProjectionManager` (boss 01/03)은 `InlineObject.alt = t.text` (`markdown-inline.ts:310`)를 복사하여 독자가 TeX 소스를 찾거나 선택/복사할 수 있도록 하고 캔버스 히트는 `InlineObjectBox` 직사각형을 유지합니다. `LayoutEngine`이 캐시된 후 `InlineObjectBox`을 변경한 모든 항목은 텍스트 경로를 더럽혀야 합니다. 동일한 `measure-once, layout-many` 불변 보스 02 가드입니다.

### 박스 지오메트리 — 왜 `KATEX_FONT_SCALE`은 살아남고 `EX_PER_EM`은 상쇄되는가

`EmitResult`은 **KaTeX's** em(1.21× 소비자의 글꼴 크기, `svg.ts:77` `KATEX_FONT_SCALE`, `katex.scss:24`)에서 em을 보고합니다. `markdown-math.ts:514`는 `EX_PER_KATEX_EM = KATEX_FONT_SCALE / EX_PER_EM (0.4421)`를 구성하므로 `widthEx = (emitted.width + 2*pad)*EX_PER_KATEX_EM` 및 `depthEx = (emitted.depth + pad)*EX_PER_KATEX_EM`(`markdown-math.ts:566`)이 됩니다. 그런 다음 `markdown-inline.ts:305`은 px를 `exToPx(ex, runSize) = ex * runSize * EX_PER_EM`으로 확인합니다. `EX_PER_EM`이 취소되고 `px = (em+pad)*1.21*runSize`이 남습니다. 테스트 이동이 0인 `EX_PER_EM`을 `0.31`로 변경하고 3개의 실패가 있는 `KATEX_FONT_SCALE`을 `1.0`로 변경하여 확인했습니다(`markdown-math.ts:111` 참고, `test/mathBoxGeometry.test.ts:39` 0.5% 공차는 소수점 2자리 반올림을 흡수합니다). `padEm`은 장식용이 아닙니다. SVG `width/height` 속성은 모든 면에 포함되지만 `EmitResult.{width,height,depth}`은 그렇지 않습니다. `markdown-math.ts:338`의 `drawImage(bitmap, x,y, box.width, box.height)`은 전체 SVG을 상자에 늘립니다. 잉크 상자만 보고하고 모든 수식은 `padEm`만큼 스쿼시되고, 보고된 깊이는 `padEm` 높이에 있습니다.

## 글리프 서브셋과 코덱 — 바이트가 사는 곳

배송된 `glyphs.subset.ts`(`src/glyphs/glyphs.subset.ts`)은 SVG 경로 텍스트가 아니라 `src/emit/glyphCodec.ts:277` `GlyphTable`에 의해 디코딩된 바이너리입니다. `scripts/generate-glyphs.ts`에서의 추출은 TTF `glyf` 2차 윤곽선(온-커브 플래그 + 묵시적 중간)을 읽고 `scripts/encode-glyphs.ts`은 해당 확장을 역전시킵니다. 18 306 중 5 256 `Q` 끝점은 정확히 묵시된 중간이며 삭제되고 나머지 모든 좌표는 정수(중간이 사라지면 오프 그리드 0 중 0)이며 지그재그 varint 델타 팩입니다. 72 616개 중 60 637개를 1바이트(`math-engine-2026-08.md:333`)로 변환합니다. 말뭉치(`scripts/subset-glyphs.ts`)는 대문자가 오류를 표시하는 것입니다. `test/glyphCodec.test.ts`의 카운트 가드에 의해 고정된 666개의 문자입니다. **`fontMetricsData.js`에는 있지만 하위 집합에는 없는** 글리프는 올바른 너비의 빈 간격(메트릭에서 진행, 윤곽선 없음, `CHANGELOG:62`)으로 렌더링됩니다. **얼굴이 완전히 없는** 글리프(예: `\digamma`과 같은 표시 전용 고래)는 `markdown-math.ts:559` `emitted.missing.length>0 → null → CodeBlock`을 통해 품질이 저하됩니다. 두 가지 실패 모드는 서로 다르며 소유자도 다릅니다.

### `packages/core/src/text/*` — TeX가 텍스트 스택과 만나는 곳

TeX는 `packages/core/src/text` 모양을 호출하지 **않습니다**(BiDi, 아랍어, OpenType 기능) — 문자 모양은 이미 KaTeX의 메트릭에 의해 모양이 지정되었으며 이미터는 윤곽선을 직접 작성합니다. TeX가 공유하는 **기능**은 텍스트 스택의 아래쪽 절반입니다. `core/src/text/measureContext.ts:12` 측정 컨텍스트 교정 및 `core/src/text/Typography.ts:111` `ctx.measureText('Mg')` 대체는 웹 글꼴 개선을 위한 boss 02의 가드이고, `svg.ts:499`에서 TeX의 `hmtx` 파생 개선은 KaTeX 아날로그입니다. 둘 다 동일한 텍스트 메트릭 불변량(boss 02 → deep prereq)을 충족해야 합니다. 올바른 컨텍스트, 올바른 DPR에서 실제 글꼴로 측정하거나 캔버스 적중 사각형 및 a11y 투영에서 `InlineObjectBox` 드리프트를 측정합니다. `packages/text/src/fontMetrics.ts:82` `registerFontMetrics`은 TeX 페이스에 대해 호출되지 않습니다. 공급업체의 `fontMetricsData.js`은 TeX 메트릭 소스이고 두 테이블의 소유자는 다릅니다.

### 수식의 방출된 SVG 읽기 — ground truth로서의 배치

`EmitResult.placements`(em의 `svg.ts:104` `GlyphPlacement[]`)은 디버그 표면입니다(`markdown-math.ts:517`은 동일한 스팬 트리의 실제 브라우저 레이아웃에 대해 교차 검증하기 위해 존재함). 공식이 잘못된 것처럼 보이면 SVG 경로 수프를 읽는 대신 배치를 비교해 보세요.

```ts
import { layout, emitSVG } from '@vectojs/tex';
const { svg, width, placements, missing } = emitSVG(
  layout('\\sqrt{b^2-4ac}', { displayMode: true }),
);
// width is advance in em; placements[].{x,y,scale,font,code} in em; missing lists absent U+XXXX
```

`width`은 레이아웃을 게이트하는 유일한 숫자입니다. 과소 보고하면 `InlineObjectBox`이 잘리고, 과도하게 보고하면 눈에 띄는 간격이 삽입됩니다. 반면 기준선에서 `placements[].y` 포지티브 다운은 KaTeX-in-Chromium DOM 프로브를 0.0000 em(`math-engine-2026-08.md:423`)과 일치시켜야 합니다. 실패한 클립 또는 오버레이는 경로 문자열 차이가 아니라 `placements` 범위에 대한 `PlacedPath.w/clip.w` 불일치로 표시됩니다.

## 검증 하네스 — 각 불변식을 green으로 유지하는 것

- `test/emit.test.ts:37` — 자체 포함된 SVG 계약(`<text>`/`font-family`/`url`/`xlink:href` 없음, 데이터-URI 조각 확인) 신축성 있는 오버레이 제로 진행 및 슬라이스 윈도잉(`emit.test.ts:380` `treats multi-piece stretchy overlays as zero-advance`).
- `test/svgClipWindows.test.ts:6` — #787/#788에 대한 렌더러-지오메트리 회귀: 경로 로컬 프레임에서 방출된 클립 경로 직사각형 및 비-1 `sy`(`svgClipWindows.test.ts:83` 오버브레이스 타일링) 아래에 정렬된 vlist 재생 일치 창.
- `test/vendorCheck.test.ts:252` — 업스트림 체크아웃에서 모든 `katex.scss`으로 표기된 상수를 다시 파생하는 드리프트 가드입니다(주석 중괄호 트랩은 이 패키지가 아닌 MathJax 가져오기입니다).
- `packages/markdown/test/mathBoxGeometry.test.ts:39` — KaTeX 글꼴 크기 브리지(패키지 간 동일성) 및 Chromium의 실제 KaTeX에 대한 상자 형상(16px에서 19.3559 px/em, 0.02% 스프레드).

## 새 TeX 구문을 안전하게 추가하는 방법

TeX 구성은 **커널 빌더**(AST → 범위 + 스타일/클래스)에 의해 정의되고 해당 범위/스타일을 올바른 범위에 대해 배치된 잉크로 변환하는 **하나의 방출 분기**에 의해 사용됩니다. **7개** 사이트가 동의하는 경우에만 구성이 배송된 것으로 간주됩니다. 하나라도 누락된 경우는 역사적 실패 모드였습니다.

### 1. 커널 빌더 추가 및 검증

`src/registry/defineFunction.ts` / `defineEnvironment.ts`을 통해 `src/kernel/functions/*.ts` 또는 `src/kernel/environments/*.ts`을 확장합니다(커널을 편집하지 않음). 빌더의 **출력 계약** 확인: 설정하는 클래스(예: `.mover`, `.angl`, `.cancel-pad`), 작성하는 인라인 스타일(숨기기 꼬리 래퍼의 `borderBottomWidth`, `paddingLeft`+`padLeftEm`, `minWidth`), 래퍼가 `Span`, `SvgNode` 또는 `LineNode` 베어링 `SvgNode`인지 여부 (경로 카탈로그의 경우 `kernel/stretchy.ts:69`, `svgGeometry.ts`) 및 `style.top`/`style.left`/`style.color`/`transparent`이 관련되어 있는지 여부. 커널의 `fontMetricsData.js` 측정값은 이미 트리의 `height/depth`로 유입됩니다. 이를 두 번째 소스로 다시 도입하지 마세요.

### 2. 이미터에 정확히 하나의 새 분기 가르치기

파견은 `svg.ts:427` `walk` → `emitSymbol`/`emitSvgNode`/`emitContainer`/`emitVList`에 있습니다. 새 범위에 **형상에 영향을 미치는 새로운 CSS 클래스**가 있는 경우 하드 코딩하는 대신 올바른 테이블에 등록하세요.

- 인라인 패드/여백의 경우 `CLASS_H_METRICS`(예: `.x-arrow-pad`, #696) - 그렇지 않으면 행이 짧게 측정됩니다.
- 두께가 `katex.scss`에만 존재하는 테두리 가장자리의 경우 `CONTAINER_BORDER_CLASSES`(예: `.angl`, `svg.ts:308`).
- vlist 행의 `text-align`이 중요한 경우 `ROW_ALIGN_CLASSES`(`.op-limits` 등, `svg.ts:266`).
- 새 범위가 `position:absolute` 비율 창(`svg.ts:328`)인 경우 `OVERLAY_PIECES`입니다.

구성의 SVG이 고정 너비(400em)를 선언하지만 **표시되는** 너비가 둘러싸는 행의 범위인 경우 해당 SvgNode를 문자 그대로 진행(`svg.ts:859` `#665` / `svg.ts:966` `#667`의 `\phase`/`\overbrace` 패턴)이 아닌 **0 진행 보류 오버레이**로 처리합니다.

### 3. 올바른 좌표 공간에 배치하기

- 컨테이너에 걸쳐 있는 **규칙 또는 테두리**는 `svg.ts:147`의 `PlacedRect{fullWidth:true, edge?}`이며, 수식의 `state.x`이 아니라 **자신을 둘러싸는 `vlist` 행**(`svg.ts:1230` `rectStart` 범위)에 대해 `placeRect(startX,width)`에 의해 해결됩니다.
- 가시적 너비가 선언된 `width`이 아닌 **신축성 있는 단일 경로**는 `svg.ts:193`에서 `PlacedPath{clip?}`이고, `sliced`은 `svg.ts:596`에서 처리되며(`widthEm`이 아닌 `rawWidth`로 크기 조정) — `minWidth` 없이 `hide-tail`인 경우 — `FULL_WINDOW`(`svg.ts:966`)으로 보류됩니다.
- **다중 조각 오버레이**는 `svg.ts:193`에서 `placeOverlay` 커버 스케일 + `preserveAspectRatio` 정렬(`svg.ts:1275`)을 사용하여 `PlacedPath{overlay}`이며 창에 잘립니다(따라서 각 조각은 컨테이너의 일부를 그립니다).
- **수직 구분 기호**(`vertical-separator`, #697)는 `(x1,y1)→(x2,y2)`이 `aboveEm = height + verticalAlign`을 복구하는 스트로크 처리된 `PlacedLine`(`svg.ts:173`)입니다. 동일한 파생 `svg.ts:718`이 이미 수행하고 있습니다.

### 4. 색상, phantom, 이스케이프 보존하기

`walk`(해당 값에 대한 `svg.ts:132` `ColoredPlacement`, `svg.ts:479` `color=style.color ?? inheritedColor`, `svg.ts:744` 팬텀 테스트)을 통해 효과적인 `style.color`을 상속하고 `color==="transparent"`(`\phantom`/`\vphantom`/`\hphantom`/`\mathstrut`의 `rlap` — `buildCommon.ts:96`, `svg.ts:479` 처리)일 때 잉크를 건너뛰는 동안 진행을 유지합니다. same-color는 `<g fill=…>`(`svg.ts:1522`)으로 실행되고 `escapeAttr`(`svg.ts:1542`)을 통해 보간된 색상을 이스케이프합니다. 오늘날의 호출자는 테마에서 파생되지만 `\color{…}`와 같은 TeX 입력의 값은 인수를 `style.color`에 그대로 쓰고 그렇지 않으면 속성에서 벗어납니다.

### 5. 올바른 사이징 — 올바른 임계값 선택

`KATEX_FONT_SCALE` 및 `sizingRatio`은 펜 진행(`parseEm`마다 `UPEM * scale` ×)과 `PlacedGlyph.scale`(`fonts.ts:265`)의 두 위치에서 곱셈적으로 구성됩니다. `SIZE_MULTIPLIERS`의 잘못된 항목은 스크립트 크기 문자 모양을 ~50%만큼 잘못 배치하며, 이는 viewBox 복구에서 포착되지 않습니다.

### 6. 측정 계약 업데이트

구성의 기하 구조에 컨테이너 범위(vlist `width`, 반경 및 너비, 중괄호 창)가 포함된 경우 **너비가 알려진 후 해결되어야 합니다**(`svg.ts:1227`의 `emitVList` `maxX-startX`, `emitSVG`의 `svg.ts:1588`에서 수식 `state.x`로 대체). `svg.ts:1630`(레이아웃 상자뿐만 아니라 배치된 잉크의 결합)에 있는 이전의 제한되지 않은 viewBox는 로드 베어링입니다. 해당 상자를 확장하는 것은 `height/depth`이 0이지만 하위 크기를 유지하는 `\smash`/`\hphantom`에 대한 #521의 수정 사항이었습니다.

### 7. 두 가드레일을 green으로 유지하기

- `scripts/subset-glyphs.ts` — 구성이 새 코드 포인트를 실행한 경우 이를 하위 집합 코퍼스(`src/glyphs/glyphs.subset.json`)에 추가하고 코덱 가드(`test/glyphCodec.test.ts` 핀 `package.json` 비 `sideEffects:false` 및 666-글리프 수)를 다시 실행하여 코퍼스가 자동으로 새 범위를 삭제할 수 없도록 합니다. 누락되었지만 메트릭이 존재하는 코드 포인트는 **빈 올바른 너비 간격**(`CHANGELOG:62` #665)으로 렌더링됩니다. 표시 전용 코드 포인트는 **원시 LaTeX 소스**(`CHANGELOG:9`)로 렌더링됩니다.
- `scripts/vendor-katex.ts --check` — 업스트림 체크아웃(`test/vendorCheck.test.ts` SCSS 플래트너)에서 각 값을 다시 파생하는 드리프트 가드에 **새** CSS로 표기된 상수(`ROW_ALIGN_CLASSES`, `CLASS_H_METRICS`, `OVERLAY_PIECES` 등)를 추가합니다. 따라서 다음 KaTeX 범프에서의 스타일시트 변경은 이에 의존하는 모든 구성을 자동으로 이동하는 대신 큰 소리로 실패합니다(`CHANGELOG:62`rift-guard 추가).

## 디버깅 체크리스트

<!-- markdownlint-disable MD056 MD060 -->

| symptom                                                                           | check first                                                                          | file:line                                                                   |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| All stretchies off-canvas / `p.x+sx·clip.x` doubled                               | Clip path emitted in root space instead of path-local                                | `emit/svg.ts:1555` `invSx/invSy`                                            |
| `\overbrace`/`\xleftrightarrow` measures 400×N em; viewBox 400× too wide          | Multi-piece SVG taken as literal advance rather than zero-advance pending overlay    | `emit/svg.ts:859` `OVERLAY_PIECES` + `emitOverlayPiece`                     |
| `\phase` measures 400em while `\sqrt{x}` is correct                               | `hide-tail` with no inline `minWidth` still advances 400em                           | `emit/svg.ts:966` `unclippedHideTail`                                       |
| `\sqrt{b^2-4ac}` vinculum truncated to `0.853em`, radicand partly outside radical | Clip sized to `minWidth` not `max(minWidth, radicandWidth)`, or `sqrt: center`       | `emit/svg.ts:1186` `clip.w < width` + `svg.ts:266` `sqrt:left`              |
| `\sum_{i}` limits flush left; `\xrightarrow{label}` label at arrow left edge      | Row alignment class missing                                                          | `emit/svg.ts:266` `ROW_ALIGN_CLASSES`                                       |
| `\underline`/`\overline`/`\hline`/`\sout` missing                                 | Border span without width — dropped because only `frac-line` considered              | `emit/svg.ts:800` `borderBottomWidth/katex-sout`                            |
| `\boxed`/`\angl` box edge invisible                                               | Border thickness only in `katex.scss` (`.angl`) or `borderStyle` shorthand not read  | `emit/svg.ts:834` `CONTAINER_BORDER_CLASSES` + shorthand                    |
| `{c\|c}` rules invisible; `:` solid instead of dashed                             | `vertical-separator` span dropped; `borderRightStyle===dashed` not applied           | `emit/svg.ts:718` `dashed` + `svg.ts:1597` `stroke-dasharray`               |
| `\llap`/`\clap` ink to the right of the anchor                                    | All three laps using `rlap` (`left:0`) semantics                                     | `emit/svg.ts:982` `llap/clap` width probe + shift                           |
| `\smash`/`\hphantom` content clipped by viewBox                                   | ViewBox derived from zeroed `height/depth` not the union of placed ink               | `emit/svg.ts:1630` `minY/maxY` ink union                                    |
| Colours dropped; `\color{red}x` black or unknowns look valid                      | `style.color` not inherited; or known missing glyphs not gated via `emitted.missing` | `emit/svg.ts:479` + `markdown-math.ts:559` `missing.length>0` degrade path  |
| Narrow gap/overmeasure on `\xrightarrow{\text{…}}` / `\boxed` / `\cancel`         | Class-carried `padLeft/padRight/marginLeft` not folded into advance                  | `emit/svg.ts:366` `CLASS_H_METRICS`                                         |
| Tall delimiter a short paren / wrong italic (`\mathit{123}` normal)               | Font resolved without ancestor `classChain`                                          | `emit/svg.ts:427` + `fonts.ts:194` `resolveFont(chain)`                     |
| `Got group of unknown type` at `layout('x')` after `bun build`                    | `packages/tex/package.json` set to `sideEffects:false` — registries tree-shaken      | `packages/tex/package.json` + `test/glyphCodec.test.ts` guard on that field |

## 스트리밍과 왜 `layout → emit`이 줄 중간에 재진입 불가능한가

인라인 수학의 `InlineObjectBox`은 `LayoutEngine`이 보기 전에 **수정되므로 TeX 파이프라인은 레이아웃 핫 경로 내에서 호출되지 않습니다. `markdown-math.ts:85`의 게으른 `import('@vectojs/tex')`은 `preloadMathJax()`이 해결될 때까지 페이지의 첫 번째 공식이 스타일이 지정된 소스(`markdown-inline.ts:316` `theme.mathFallbackColor`의 `else`)로 렌더링됨을 의미합니다. `ensureMathJax`/`retypesetFromTokens`(`markdown/src/Markdown.ts:3518`)은 동시 로드를 하나의 Promise로 통합하고 이미 렉싱된 토큰에서 다시 빌드하여 `tokenChildPrefix`을 사소하게 정확하게 유지합니다. `markdown-math.ts:238`에 있는 `inlineMathRasters`의 LRU는 여전히 표시되는 비트맵이 제거되지 않도록 모든 페인트에 다시 삽입되며, `mathCache` (256)과 동일한 경계의 래스터 캡은 수천 개의 고유 공식을 디코딩하는 장기 문서에 대한 스트리밍 보호 장치입니다(`forge 2026-08-13` 경계 래스터 찾기). 구성하기 전에 `await preloadMathJax()`인 두 번째 호출자는 동기식 첫 번째 공식 조판을 얻습니다. 동일한 계약 상사 04의 `onStable`은 `waitForAppendSettled` 이후에 `Array.from(content.children)`을 스냅샷하는 시점에 따라 달라집니다.

해당 `degrade-to-source` 계약은 글리프 누락 계약이기도 합니다. `convertMathToSVGDataURI`의 `emitted.missing.length>0 → null` (`markdown-math.ts:559`)는 부분적으로 누락된 공식을 조용히 간격이 있는 방정식이 아닌 **복사된 TeX 소스**로 렌더링하므로 글리프를 잊어버린 코퍼스 추가는 잘못된 방정식이 아닌 파란색 `CodeBlock`로 표시됩니다. 디스플레이 수학의 대체(`markdown/src/Markdown.ts:3520` `retypesetFromTokens` 도매)는 동일한 계약을 존중합니다. 개요가 없는 블록 `\digamma`은 간격이 있는 디스플레이 블록을 생성하지 않으며 소스를 유지합니다.

### `packages/core/src/text/*`와 더 깊은 텍스트 불변식

`core/src/text` (`core/src/text/Typography.ts:111`, `measureContext.ts:12`) 모양 **웹** 텍스트 — BiDi, 아랍어 조인, 가변 글꼴 고급 — TeX가 아닙니다. 두 개의 스택은 `InlineObjectBox`에서만 만납니다. 둘 다 `LayoutEngine`(`packages/layout/src/LayoutEngine.ts:808`)가 동일하게 포장하는 `width/height/depth` 상자입니다. 따라서 Boss 02의 `measure-once, layout-many` 불변은 두 가지 모두를 제어합니다. 글꼴, DPR 또는 너비 변경 후 오래된 `InlineObjectBox`은 상자가 TeX 또는 `fillText`을 보유하는지 여부에 관계없이 패리티 버그입니다. TeX는 절대로 `registerFontMetrics`(`packages/text/src/fontMetrics.ts:82`)을 호출하지 않습니다. 해당 측정 항목은 공급업체의 `fontMetricsData.js`입니다. 두 테이블의 소유자는 다르지만 레이아웃 진실은 하나입니다.

## 불변식 — PR 전 복사-붙여넣기 체크리스트

1. **깊이 안정 클래스 체인.** `resolveFont(classChain)` 및 `sizingRatio(classChain)`은 리프 슬라이스가 아닌 실제 축적(`walk` `chain=[…classChain,…classes]`)에서 스레드됩니다.
2. **모든 인라인 길이는 `parseEm * UPEM * localScale`입니다.** 재생 시 두 번째 크기 조정이 없습니다. 크기가 구워집니다.
3. **컨테이너 범위인 모든 모양은 `place*(startX,width)`까지 보류됩니다.** 다른 vlist에서 동일한 범위를 읽는 두 번째 소비자는 그렇지 않으면 근호를 분수의 너비로 늘립니다.
4. **`parseFloat("100%")`은 `100em`로 사용할 수 없습니다.** `parseLength`/`parseEm` 분할 `pct` 대 `em`; `\cancel` 오버레이의 x 퍼센트는 전체 너비 규칙처럼 vlist 너비를 따릅니다.
5. **글리프 ⇔ 글꼴 불변.** 반복되는 동일한 면의 두 글리프는 하나의 `<defs><path>` 및 `href="#gN"` 재사용(`svg.ts:1639` `defId` 맵)을 공유합니다. 미스 세트는 `getGlyph`에 공급된 것과 동일한 글꼴 해상도에서 계산되므로 `markdown-math.ts:559`의 `convertMathToSVGDataURI`은 잉크에 공백이 있는 수식을 정확하게 삭제합니다.
6. **패딩은 SVG과 상자에 함께 속합니다.** `EmitResult.{width,height,depth}`은 **잉크**입니다. `Emitted.svg` `width/height`에는 모든 측면에 `+padEm`이 포함됩니다. `convertMathToSVGDataURI`의 `+pad2`/`+MATH_PAD_EM` 산술은 명명된 패드 상수에 따라 달라집니다. 즉, 분리되고 모든 마크다운 공식이 잘못 배치됩니다.
7. **산문의 줄임표/대시는 TeX 또는 코드 내부에 없습니다.** `decodeProse`/`applyTypography` (`markdown-inline.ts:58`)는 `emitProse`을 통해서만 라우팅됩니다. — 코드 범위 및 수학 오류 폴백(`markdown-inline.ts:321`)은 이를 우회하므로 `code` 내부의 `--` 또는 성능이 저하된 `$$`은 끝 대시가 되지 않습니다.

---

## 참고 문헌

- `vectojs-docs/content/learn/text-typography.md` — `TextStyle.baselineShift`/`fontSize`이 sub/sup을 위해 구매하는 것(다른 인라인 수학 같은 상승 실행).
- `vectojs-docs/content/learn/streaming.md` + boss 04 — `marked` 확장이 `findStableCut`에 영향을 미치는 이유와 인라인 수학의 `InlineObjectBox`이 `RichText` 범위와 다른 이유.
- `vectojs-docs/forge/decisions/math-engine-2026-08.md` — 측정된 결정, 공급업체 범위, 문자 인코딩 선택, 수정 5(`sideEffects:false`) 및 네 부분으로 구성된 TeX 난이도 순위입니다.
- `vectojs-docs/forge/findings/text-richtext-and-markdown.md:1789-1924` — 2026-08-13 P2/P3 tex 결과 9개 + 경계 래스터 결과가 모두 한곳에 있습니다.
- `vectojs-docs/forge/baselines/*.json` + `run-browsers.sh` — 인용 가능한 유일한 숫자입니다. 헤드리스 경로는 회귀 트립와이어입니다.
- `packages/tex/test/emit.test.ts` + `svgClipWindows.test.ts` + `vendorCheck.test.ts` — 새로운 구성이 녹색을 유지해야 하는 계약(클립 창 일치, 다중 조각 창, 드리프트 가드).

---

_다음: 06 VMT 런타임 — 모든 이미터 구축 `SVGEntity` 및 `MathBlock`이 마운트되는 수명 주기, 더티 전파 및 이벤트 발송._
