+++
title = "@vectojs/ui 컴포넌트 레퍼런스"
description = "모든 @vectojs/ui 컴포넌트의 전체 레퍼런스: 레이아웃 컨테이너, 폼 컨트롤, 오버레이, 리치 콘텐츠."
weight = 11
+++

# `@vectojs/ui` — 컴포넌트 레퍼런스

> VectoJS zero-DOM Canvas 엔진을 위한 재사용 가능한 고수준 컴포넌트입니다.
> 문서 버전: **2.20.1**. 진실 공급원: `dist/index.d.ts`(공개 표면) 및 `packages/ui/src/*`(동작).

모든 컴포넌트는 Virtual Math Tree(VMT)의 리프 또는 컨테이너입니다. 여기 있는 어떤 것도 실제 DOM이 아닙니다 — 컴포넌트는 `IRenderer`를 통해 Canvas에 자신을 그립니다. 접근성, 에이전트 자동화, 크롤링 가능성은 병렬 **A11y Shadow DOM**에서 제공됩니다: 컴포넌트가 `interactive`하면 `Scene`이 컴포넌트의 박스 위에 위치한 단일 숨겨진 투명한 실제 DOM 노드를 `getA11yAttributes()`에서 빌드하여 프로젝션합니다. 이것이 `page.getByRole('button', { name })` / `fill()` / 스크린 리더가 순수 Canvas UI에서 작동하는 이유입니다.

텍스트 전용 애플리케이션 표면은 `@vectojs/ui/text`에서 `Text`를 임포트할 수 있습니다. 이
경량 진입점은 Markdown과 `@vectojs/tex`를 시작 그래프에서 제외합니다; 여러 컴포넌트
패밀리를 구성할 때는 루트 `@vectojs/ui` 진입점을 사용하세요.

## 라이브 컴포넌트 갤러리

아래 갤러리는 이제 패키지 수준 스모크 테스트입니다. 일상적인 디버깅에는 집중된
컴포넌트 페이지를 사용하여 모든 컴포넌트를 스크롤하지 않고도 하나의 동작을 검사할 수 있습니다:

| 영역                  | 컴포넌트 페이지                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 텍스트 및 미디어      | [`Text`](/reference/ui-text/), [`RichText`](/reference/ui-richtext/), [`Link`](/reference/ui-link/), [`Image`](/reference/ui-image/)                                                                                                                                                                                                                                                 |
| 레이아웃 컨테이너     | [`Card`](/reference/ui-card/), [`Stack`](/reference/ui-stack/), [`Flow`](/reference/ui-flow/), [`ScrollView`](/reference/ui-scrollview/), [`VirtualList`](/reference/ui-virtuallist/), [`TreeView`](/reference/ui-treeview/), [`Resizable panels`](/reference/ui-resizable-panel/)                                                                                                   |
| 컨트롤 및 폼          | [`Button`](/reference/ui-button/), [`Input`](/reference/ui-input/), [`TextArea`](/reference/ui-textarea/), [`Checkbox`](/reference/ui-checkbox/), [`Toggle`](/reference/ui-toggle/), [`Slider`](/reference/ui-slider/), [`Dropdown`](/reference/ui-dropdown/), [`RadioGroup`](/reference/ui-radiogroup/), [`Tabs`](/reference/ui-tabs/), [`ProgressBar`](/reference/ui-progressbar/) |
| 리치 콘텐츠           | [`Markdown`](/reference/ui-markdown/), [`CodeBlock`](/reference/ui-codeblock/), [`Table`](/reference/ui-table/)                                                                                                                                                                                                                                                                      |
| 오버레이 및 일시적 UI | [`Overlay`](/reference/ui-overlay/), [`Tooltip`](/reference/ui-tooltip/), [`Popover`](/reference/ui-popover/), [`ContextMenu`](/reference/ui-contextmenu/), [`Modal`](/reference/ui-modal/)                                                                                                                                                                                          |

<figure class=\"sandbox component-gallery\">
  <div class=\"sandbox-bar\"><span class=\"dot\"></span><span class=\"dot\"></span><span class=\"dot\"></span><span class=\"sandbox-label\">live · @vectojs/ui 2.0.0 · scroll inside</span></div>
  <iframe src=\"/sandbox/ui-components.html\" class=\"sandbox-frame component-gallery-frame\" loading=\"eager\" title=\"모든 VectoJS UI 컴포넌트의 대화형 갤러리\" sandbox=\"allow-scripts allow-same-origin allow-popups\"></iframe>
  <figcaption>패키지 수준 스모크 갤러리: 먼저 광범위한 범위, 특정 동작 디버깅 시 집중된 컴포넌트 페이지.</figcaption>
</figure>

## 모든 컴포넌트의 공통 규칙

모든 컴포넌트는 `UIComponent`를 확장하며, 이는 핵심 `Entity`를 확장합니다. 다음 상속된 멤버는 지속적으로 사용되며 아래 각 컴포넌트에서 **반복되지 않습니다**.

| 멤버                | 시그니처                                           | 설명                                                                                                                                                                                     |
| ------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setPosition`       | `setPosition(x, y): this`                          | 로컬 공간 배치; 체인 가능.                                                                                                                                                               |
| `add` / `remove`    | `add(child: Entity): this` / `remove(child): this` | 자식 관리 (컨테이너는 `add`를 재정의하여 재배치).                                                                                                                                        |
| `on` / `off`        | `on(event, cb, { capture? }): this`                | DOM 스타일 캡처+버블. 이벤트: `click hover pointerdown pointerup pointercancel pointermove pointerleave change focus blur wheel keydown keyup`.                                          |
| `emit`              | `emit(event, payload): void`                       | 직접 자기 전용 디스패치 (트리 전파 없음).                                                                                                                                                |
| `getGlobalPosition` | `getGlobalPosition(): Point`                       | 조상 변환을 누적한 월드 공간 위치.                                                                                                                                                       |
| `scene`             | `get scene`                                        | 가장 가까운 연결된 `Scene`; `onDemand` 씬에서 다시 그리기를 요청하려면 `this.scene?.markDirty()` 사용.                                                                                   |
| `interactive`       | `interactive: boolean`                             | true일 때 컴포넌트가 A11y 그림자 노드를 프로젝션하고 포인터/키보드 이벤트를 수신합니다.                                                                                                  |
| `clipChildren`      | `clipChildren: boolean`                            | 일반 자식 그리기를 로컬 박스로 클리핑합니다. Canvas/SVG는 정확함; Three는 회전/기울어진 클립에 AABB 가위 사용. GPU 포인트/WebGPU 오버레이 경로는 참여하지 않음. `ScrollView`에서 사용됨. |
| `width` / `height`  | `number`                                           | 컴포넌트의 박스; 히트 테스트와 뷰포트 컬링을 결정합니다.                                                                                                                                 |
| `padding`           | `number`                                           | 내부 패딩 (기본값 `0`); 박스 스타일 컴포넌트는 더 높은 기본값을 가짐.                                                                                                                    |
| transforms          | `x y scaleX scaleY rotation opacity`               | 아핀 변환 및 곱셈 불투명도는 자식에게 상속됩니다.                                                                                                                                        |
| `animate`           | `animate(targetProps, durationMs): this`           | 숫자 트윈을 대기열에 추가합니다.                                                                                                                                                         |

---

## `UIComponent` (추상 베이스)

```ts
abstract class UIComponent extends Entity {
  padding: number; // 기본값 0
  isPointInside(globalX: number, globalY: number): boolean;
  getBounds(): Bounds; // { x:0, y:0, width, height }

  // 진입/퇴장 프레즌스 헬퍼
  protected enterMotion?: MotionSpec; // 마운트 시 재생됨
  protected exitMotion?: MotionSpec; // dismiss()에 의해 재생됨
  dismiss(): Promise<void>; // exitMotion 재생 후 트리에서 제거
}
```

모든 컴포넌트가 공유하는 박스 모델 + 축-정렬(AABB) 히트 테스트를 중앙화합니다. `isPointInside`는 포인트가 로컬 공간의 `[0,width] × [0,height]` 내에 있는지 반환합니다. `getBounds()`는 로컬 박스를 반환하여 `Scene`이 뷰포트 컬링할 수 있게 합니다. 서브클래스는 측정된 콘텐츠에서 `width`/`height`를 설정하고, `render(r)`를 구현하며, (interactive할 때) `getA11yAttributes()`를 재정의합니다.

**프레즌스:** `enterMotion` / `exitMotion`을 `MotionSpec`(`{ props: { opacity: [0, 1], … }, config? }`)으로 선언하면 컴포넌트가 라이브 씬에 마운트될 때 애니메이션으로 나타나고 `dismiss()` 시 사라집니다 — 퇴장 애니메이션이 해결될 때까지 자체 제거를 지연합니다. [코어 애니메이션 시스템](/reference/core-entity/#aenimeisyeon) 위의 하나의 공유 구현체로, 컴포넌트별 수동 스프링을 대체합니다. `prefers-reduced-motion`에서는 모션이 억제됩니다(불투명도 페이드는 유지).

### `getA11yAttributes(): A11yAttributes`

모든 대화형 컴포넌트가 재정의하는 훅입니다. 반환된 형태(`@vectojs/core`에서)는 프로젝션된 그림자 노드를 구동합니다:

```ts
interface A11yAttributes {
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea'; // 기본값 'div'
  role?: string; // ARIA 역할
  label?: string; // aria-label / 접근 가능한 이름
  href?: string; // tag 'a'
  src?: string;
  alt?: string; // tag 'img'
  inputType?: string;
  placeholder?: string;
  value?: string; // tag 'input'
  checked?: boolean; // input.checked 또는 aria-checked, 매 프레임 갱신
  disabled?: boolean;
  expanded?: boolean;
  controls?: string;
  haspopup?: string;
  selected?: boolean;
  activedescendant?: string;
  valuemin?: string;
  valuemax?: string;
  tabIndex?: number; // 복합 위젯 자식용 루빙 tabindex
  pointerEvents?: 'auto' | 'none'; // 아래에 마우스를 소유하는 것이 있을 때 'none'
  labelledby?: string;
  describedby?: string; // aria-describedby — 힌트/오류 텍스트
  required?: boolean;
  invalid?: boolean; // 유효성 검사 상태
  level?: number; // aria-level (트리 항목, 제목)
  ariaModal?: 'true' | 'false';
  live?: 'off' | 'polite' | 'assertive';
  atomic?: boolean;
  relevant?: string; // 라이브 영역 제어
  // (`target`, `textInputStyle`도 참조 — 전체 레퍼런스)
}
```

모든 필드는 더티 체크를 통해 매 프레임 실제 속성으로 프로젝션됩니다; `undefined`를 반환하면 **제거**됩니다. 전체 목록과 복합 위젯 키보드 패턴은
[a11yRoot 및 에이전트 계약](/reference/core-a11y/)에 있습니다.

---

## 텍스트 및 타이포그래피

### `Text`

```ts
new Text(text: string, opts?: TextOptions)

interface TextOptions {
  font?: string;                  // 기본값 '16px sans-serif'
  color?: string;                 // 기본값 '#e2e8f0'
  maxWidth?: number;              // 줄바꿈 너비; 생략 시 명시적 '\\n'만 줄바꿈
  lineHeight?: number;            // 줄 간격 px, 기본값 20
  preserveLeadingSpaces?: boolean;// 기본값 false
  selectable?: boolean;           // 브라우저 네이티브 드래그 선택, 기본값 true
  textAlign?: 'left' | 'justify'; // default 'left'
  hyphenate?: (word: string) => string[]; // word → parts, for mid-word breaks with a visible '-'
}
```

네이티브 `fillText`로 그려지는 여러 줄 텍스트. 줄바꿈/측정은 코어 `LayoutEngine`( `TextEntity`와 동일한 `Intl.Segmenter` 경로)을 통해 **콜드/핫 분할**로 이루어집니다:

- `setText(text): this` — 콜드 패스 (재분할 + 재측정), 그 후 재배치.
- `append(text): this` — 스트리밍/타자기 경로; `setText(this.text + text)`와 동일하지만 엔진의 문단 메모가 변경되지 않은 선행 문단을 재사용하므로 변경된 마지막 문단만 재측정됩니다.
- `setMaxWidth(maxWidth): this` — **핫** 경로; 캐시된 측정 텍스트만 다시 줄바꿈(재분할 없음). 반응형 리플로우에 선호됩니다.
- `setSelectable(selectable): this` — 프로젝션된 네이티브 선택 표면을 활성화 또는 비활성화합니다.
- `setTextAlign(align: 'left' | 'justify'): this` — 제자리에서 재정렬합니다.

`textAlign: 'justify'`(선택적 `hyphenate` 포함)는 병합된 `fillText()` 런에서 존중됩니다. 소스의 소프트 하이픈(U+00AD)은 하이퍼네이터 없이 분리됩니다.

콘텐츠 프로젝션은 브라우저 찾기, 선택, 복사를 위해 시각적 줄바꿈과 줄 높이를 미러링합니다. 정적 Text는 대화형 히트 대상이 아닙니다; Canvas/VMT가 여전히 픽셀과 레이아웃을 소유합니다.

### `RichText`

```ts
new RichText(spans: StyledSpan[], opts?: RichTextOptions)

interface RichTextOptions {
  font?: string;                          // 기본 약식, 기본값 '16px sans-serif'
  color?: string;                         // 기본 채우기, 기본값 '#e2e8f0'
  maxWidth?: number;                      // 줄바꿈 너비
  baseStyle?: TextStyle;                  // 모든 런이 상속 (런 스타일이 여전히 우선)
  linkColor?: string;                     // 자체 색상이 없는 링크 런의 기본값 '#38bdf8'
  onLinkClick?: (href: string) => void;   // 링크 런이 활성화될 때 실행
  exclusions?: ExclusionRect[];           // 텍스트가 흘러가는 사각형 (제외 형태/플로트)
  selectable?: boolean;                   // 브라우저 네이티브 드래그 선택, 기본값 true
  textAlign?: 'left' | 'justify';         // default 'left'
  hyphenate?: (word: string) => string[]; // word → parts, for mid-word breaks
}
```

다중 스타일 인라인 텍스트: 굵게/기울임/색상/다른 크기의 런이 공유 기준선에서 흐르고 줄바꿈됩니다. 레이아웃은 코어 `LayoutEngine.prepareRich`를 사용합니다; 각 글리프는 런의 색상/두께/기울기로 그려집니다.

- `setSpans(spans): this` — 런을 교체하고 재배치합니다.
- `appendSpans(spans): this` — **스트리밍** 경로; 리치 문단 메모가 변경되지 않은 선행 문단을 재사용하므로 토큰 스트림이 O(문서)가 아닌 O(변경된 문단)으로 재준비됩니다.
- `setMaxWidth(maxWidth): this` — 리플로우.
- `setExclusions(exclusions): this` — 플로트 영역을 설정하고 리플로우합니다.
- `setTextAlign(align: 'left' | 'justify'): this` — 제자리에서 재정렬합니다.
- `setSelectable(selectable): this` — 스팬을 재구축하지 않고 네이티브 선택을 전환합니다.

**인라인 객체(Inline objects) (2.6.0+).** 스팬(span)은 `RichText`가 형태를 잡지 않는 것 — 수식, 아이콘, 임베디드 박스 — 을 위해 가로 공간을 예약할 수 있으므로, 줄바꿈을 하지 않고 문장 중간에 위치할 수 있습니다:

```ts
import { OBJECT_REPLACEMENT, type StyledSpan } from '@vectojs/layout';

const spans: StyledSpan[] = [
  { text: 'the identity ' },
  {
    text: OBJECT_REPLACEMENT, // U+FFFC; 필수, 생략 시 `object`가 무시됨
    object: {
      width: 42, // 예약할 advance 너비, 최종 크기의 px 단위
      height: 20, // ascent + descent; 줄 높이에 반영됨
      depth: 4, // 기준선 아래로 내려가는 깊이
      alt: 'x+1', // 접근 가능한 이름(accessible name), 선택 및 복사 텍스트
      paint: (surface, box) => surface.drawImage(bitmap, box.x, box.y, box.width, box.height),
    },
  },
  { text: ' holds.' },
];
```

메트릭은 최종 크기의 px 단위입니다 — 고정된 박스이며, 런의 `fontSize`에 의해 스케일링되지 않습니다. `box.y`는 이미 기준선(baseline)과 `depth`에 대해 해석(resolve)되었으므로 렌더러(painter)가 이 계산을 반복하지 않습니다. `paint`는 그리기(paint) 중에 호출되므로 동기적이어야 합니다; 아직 콘텐츠를 로드 중인 객체는 아무것도 그리지 않아야 하며 준비되었을 때 리페인트(repaint)를 요청해야 합니다. **`paint`를 생략하면 공간만 예약하고 아무것도 그리지 않습니다** — 즉, 빈 간격(blank gap)이 됩니다. `alt`를 설정하지 않으면 원본 감시 문자(sentinel)가 접근성 계층(accessibility layer)에 도달하여 보이지 않는 문자로 복사됩니다.

A11y: 각 연속적인 **링크 런**은 투명한 `<a>` 핫스팟 자식을 얻습니다(재줄바꿈 시 조정됨 — 런당 하나의 핫스팟; 위치는 제자리에서 업데이트되며, 링크 _개수_ 변경만 그림자 노드를 재구축함). 컴포넌트 자체의 접근 가능한 이름은 전체 연결된 텍스트입니다.

### `measureText` (자유 함수)

```ts
measureText(text: string, font: string): number
```

CSS `font`에서 렌더링된 픽셀 너비, 제한된 LRU(용량 1000)를 통해 메모이제이션됩니다. 아랍어는 측정 전에 형태 분석됩니다. DOM 없이 문자당 `0.5em` 추정치로 대체됩니다.

이것은 패키지에서 내보내는 유일한 텍스트 측정 헬퍼입니다. 탐욕적인 `wrapLines` 내보내기는 2.20.0에서 제거되었습니다 — 그 줄바꿈은 모든 컴포넌트가 실제로 사용하는 LayoutEngine과 어긋나서 예측한 줄이 실제 렌더링과 일치하지 않았습니다 — 그리고 `wrapText`는 공개 API가 아니라 내부 `TextArea` 유틸리티로 남아 있습니다. 레이아웃에 중요한 줄바꿈에는 LayoutEngine 자체를 사용하세요. 미리보기와 측정에는 `measureText`와 직접 구현한 줄바꿈 로직이 지원되는 경로입니다.

---

## 레이아웃 컨테이너

### `Stack`

```ts
new Stack(opts?: StackOptions)

interface StackOptions {
  direction?: 'vertical' | 'horizontal';  // 기본값 'vertical'
  gap?: number;                            // 기본값 0
  align?: 'start' | 'center' | 'end';      // 교차축, 기본값 'start'
  wrap?: boolean;                          // 기본값 false
  maxWidth?: number;                       // 주축 줄바꿈 임계값(수평); 기본값 Infinity
  maxHeight?: number;                      // 주축 줄바꿈 임계값(수직); 기본값 Infinity
}
```

`gap` 간격으로 주축을 따라 자식을 순차적으로 배치하고, 교차축에서 정렬합니다. 자식은 자체 크기를 유지합니다 — `x`/`y`만 설정됩니다. 자체적으로는 아무것도 그리지 않습니다.

- `add(child): this` — 추가하고 즉시 **`layout()` 재실행**.
- `layout(): void` — 모든 자식을 배치하고 컨테이너 크기를 맞춤(컬링 가능하도록). `add` 외부에서 자식을 변경한 후 수동으로 호출(예: 자식 크기 조정).

`wrap`이 true이면 `maxWidth`/`maxHeight`를 주축에서 초과하는 자식이 새 줄을 시작합니다; 컨테이너는 교차축으로 성장합니다.

```ts
const col = new Stack({ direction: 'vertical', gap: 12 });
col.add(new Text('Title'));
col.add(new Button('Go'));
scene.add(col.setPosition(40, 40));
```

### `Flow`

```ts
new Flow(opts?: FlowOptions)

interface FlowOptions extends Omit<StackOptions, 'direction' | 'wrap'> {
  direction?: 'horizontal';
}
```

`{ direction: 'horizontal', wrap: true }`로 미리 구성된 `Stack` — `maxWidth`를 초과하면 다음 줄로 줄바꿈되는 수평 항목. 태그 클라우드, 칩 행에 사용합니다. `add()`/`layout()`을 상속받습니다.

### `Card`

```ts
new Card(opts: CardOptions)

interface CardOptions {
  width: number;          // 필수
  height: number;         // 필수
  bg?: string;            // 기본값 '#0f172a'
  border?: string;        // 생략 시 테두리 없음
  borderWidth?: number;   // 기본값 1
  radius?: number;        // 기본값 12
  padding?: number;       // 기본값 0 (소비자가 수동으로 자식 배치)
  label?: string;         // 설정 시 → interactive + role="group" 랜드마크
  onClick?: (event: unknown) => void; // label 필수; Card 전체를 클릭 가능하게 함
}
```

선택적 테두리가 있는 둥근 배경 패널. `add()`를 통해 자식을 추가하세요; 카드의 로컬 공간 상단에 렌더링됩니다. **기본적으로 장식용**(그림자 노드 없음, interactive 아님). `label`을 전달하면 interactive하게 되고 `{ role: 'group', label }`을 프로젝션하여 보조 기술/에이전트가 영역을 찾을 수 있습니다. `padding`은 정보 제공용입니다 — 자식을 자동으로 안쪽으로 삽입하지 않습니다.

`setContent(content, fit = true)`는 하나의 콘텐츠 엔터티를 호스팅하고 기본적으로 너비와 높이를 Card에 맞춰 유지합니다. 축별로 맞춤을 해제하려면 `false` 또는 `{ width?, height? }`를 전달하세요. `onClick`에는 `label`이 필요하므로 a11y tree에 이름 없는 대화형 영역이 생기지 않습니다.

---

## 컨트롤 및 폼

아래 모든 폼 컨트롤은 `interactive`하며 실제 그림자 노드를 프로젝션합니다; 캔버스는 그림자 노드의 네이티브 이벤트에 의해 구동되는 시각적 미러입니다.

### `Button`

```ts
new Button(label: string, opts?: ButtonOptions)

interface ButtonOptions {
  onClick?: (e: unknown) => void;  // Canvas 히트 테스트와 그림자 <button> 클릭 모두에서 실행
  bg?: string;                     // 기본값 '#2563eb'
  hoverBg?: string;                // 기본값 '#3b82f6'
  color?: string;                  // 레이블 색상, 기본값 '#ffffff'
  font?: string;                   // 기본값 '600 16px sans-serif'
  padding?: number;                // 기본값 12
  radius?: number;                 // 기본값 8
  focusColor?: string;             // focus-ring color (2.7.0+), default '#00f0ff'
  disabled?: boolean;              // start disabled: drawn muted, projects `disabled`, no onClick
}
```

중앙 레이블이 있는 둥근 사각형. `width`는 `measureText(label, font) + 2·padding`으로 자동 크기 조정; `height`는 `fontSizePx(font) + 2·padding`(font에서 구문 분석된 px 크기, 측정된 레이블 너비 아님). `{ tag: 'button', role: 'button', label }` 프로젝션 → `getByRole('button', { name })`으로 구동됨. 공개 상태: `focused`(`focusColor`로 2px 포커스 링 그리기), 내부 `hovered`(`hoverBg`로 전환). **밝거나 따뜻한 테마에서는 `focusColor`를 설정하세요** (2.7.0+) — 기본 시안색은 어두운 기본 팔레트에 맞춰 조정되어 다른 곳에서는 브랜드에서 벗어난 것으로 보이며, 포커스 링은 키보드 사용자가 없어서는 안 되는 유일한 어포던스입니다. 강제 색상 모드에서는 링이 항상 대신 시스템 `Highlight` 색상을 사용합니다.

### `Link`

```ts
new Link(label: string, opts: LinkOptions)   // opts 필수 (href)

interface LinkOptions {
  href: string;          // 필수; 탐색 대상 + 그림자 <a href>
  color?: string;        // 기본값 '#38bdf8'
  font?: string;         // 기본값 '16px sans-serif'
  underline?: boolean;   // 기본값 true
}
```

색상이 있는 (선택적으로 밑줄이 있는) 텍스트. 레이블에 맞게 자동 크기 조정. 실제 `{ tag: 'a', href, label }` 그림자 노드를 프로젝션합니다(네이티브로 클릭 가능/크롤 가능). Canvas 히트 테스트 경로는 `window.open(href, '_blank', 'noopener')`를 통해 열립니다.

### `Image`

```ts
new Image(src: string, opts: ImageOptions)

interface ImageOptions {
  width: number;                // required (canvas needs a known box for layout/culling)
  height: number;               // required
  fit?: ImageFit;               // 'fill' | 'cover' | 'contain', default 'fill' (2.18.0+)
  focalPoint?: ImageFocalPoint; // { x, y } each 0..1; consulted by 'cover', default { x: 0.5, y: 0.5 } (2.18.0+)
  alt?: string;                 // default ''
  placeholder?: string;         // fill until load, default '#1e293b'
  radius?: number;              // corner radius on the placeholder AND loaded bitmap, default 0
  onLoad?: () => void;          // fired once the bitmap loads
}

type ImageFit = 'fill' | 'cover' | 'contain';
interface ImageFocalPoint { x: number; y: number; }
```

`drawImage`를 통해 그립니다; `{ tag: 'img', src, alt, label: alt }`를 프로젝션합니다. 로딩은 비동기식입니다 — 준비될 때까지 플레이스홀더 박스가 그려집니다. `onDemand` 씬에서는 `onLoad: () => scene.markDirty()`를 전달하여 로드 시 다시 그리세요. (`globalThis.Image`를 그림자 처리함; 클래스를 `import { Image } from '@vectojs/ui'`로 참조하세요.)

`fit`(2.18.0+)은 로드된 비트맵을 박스에 매핑합니다: `'fill'`(기본값)은 박스에 맞게 늘리고, `'cover'`는 종횡비를 유지하며 박스를 채우면서 넘치는 부분을 `focalPoint` 기준으로 크롭하고, `'contain'`은 종횡비를 유지한 채 전체 비트맵을 박스 안에 맞춥니다. `focalPoint`는 정규화된 `{ x, y }` 지점(`0` = 위/왼쪽, `1` = 아래/오른쪽, `[0, 1]`로 클램프됨)이며 `'cover'`만 읽습니다. `radius`는 이제 플레이스홀더뿐 아니라 로드된 비트맵의 둥근 모서리도 잘라냅니다.

```ts
const avatar = new Image('/avatar.jpg', {
  width: 96,
  height: 96,
  fit: 'cover',
  focalPoint: { x: 0.5, y: 0.25 }, // keep the subject's face, near the top
  radius: 48, // circle-crop the loaded bitmap
});
```

### `Input`

```ts
new Input(opts: InputOptions)

interface InputOptions {
  width: number;             // 필수
  height?: number;           // 기본값 40
  placeholder?: string;
  value?: string;            // 기본값 ''
  font?: string;             // 기본값 '16px sans-serif'
  color?: string;            // 기본값 '#e2e8f0'
  placeholderColor?: string; // 기본값 '#64748b'
  bg?: string;               // 기본값 '#0f172a'
  border?: string;           // 기본값 '#334155'
  selectionColor?: string;   // 기본값 'rgba(56, 189, 248, 0.35)'
  radius?: number;           // 기본값 6
  padding?: number;          // 기본값 10
  onChange?: (value: string) => void;
}
```

**실제 투명한 `<input>` 그림자 노드**로 구동되는 한 줄 입력 필드. 브라우저가 모든 입력 — 클릭, 키보드, **IME 구성**, 선택, 클립보드, 실행 취소 — 을 해당 요소에서 네이티브로 처리합니다; 캔버스는 그리기만 합니다. `Scene`은 페이로드에 `value`, `selectionStart`, `selectionEnd`, `composition`이 포함된 `change` 이벤트를 통해 상태를 미러링합니다. 컴포넌트는 이를 공개 필드로 다시 노출합니다:

- `value: string`, `focused: boolean` (500ms 커서 깜빡임 구동).
- `selectionStart` / `selectionEnd: number` — 실제 입력에서 미러링된 커서/선택 오프셋.
- `composition: { start; length } | null` — 활성 IME 사전 편집 범위(밑줄로 그려짐).

A11y: `{ tag: 'input', inputType: 'text', placeholder, value, label: placeholder }`. 에이전트가 역할별로 `fill()`합니다; 사람이 CJK를 입력합니다; 캔버스가 커서, 선택 강조, IME 밑줄, 스크롤-투-커서(`scrollLeft`)를 렌더링합니다. 레이아웃 엔진을 통해 RTL(히브리어/아랍어) 범위를 처리합니다.

### `TextArea`

```ts
new TextArea(opts: TextAreaOptions)

interface TextAreaOptions {
  width: number;             // 필수
  height?: number;           // 기본값 120
  placeholder?: string;
  value?: string;            // 기본값 ''
  font?: string;             // 기본값 '16px sans-serif'
  lineHeight?: number;       // 글꼴 크기의 배수, 기본값 1.4
  color?: string;            // 기본값 '#e2e8f0'
  placeholderColor?: string; // 기본값 '#64748b'
  bg?: string;               // 기본값 '#0f172a'
  border?: string;           // 기본값 '#334155'
  selectionColor?: string;   // 기본값 'rgba(56, 189, 248, 0.35)'
  radius?: number;           // 기본값 6
  padding?: number;          // 기본값 10
  onChange?: (value: string) => void;
}
```

**실제 투명한 `<textarea>` 그림자 노드**로 구동되는 여러 줄 입력 필드 — `Input`과 동일한 미러 모델에 여러 줄 탐색이 추가되었습니다. 캔버스는 값(`wrapText` 통해)을 다시 줄바꿈하고 텍스트, 선택, 커서를 그립니다. 공개 필드는 `Input`을 미러링합니다: `value`, `focused`, `selectionStart`, `selectionEnd`, `composition`. `lineHeightFactor`가 `lineHeight` 옵션을 보유합니다.

- `lineOfOffset(offset: number): number` — 선형 문자 오프셋을 포함하는 시각적(줄바꿈된) 줄 인덱스; 경계 오프셋은 가장 이른 포함 줄로 해석, 범위 초과는 마지막 줄로 고정. 커서 위치를 줄에 매핑하는 데 유용합니다.

A11y: `textarea` 그림자 노드 프로젝션; 에이전트가 `fill()`하고, 사람이 CJK를 입력하며, 렌더링은 Zero-DOM 상태를 유지합니다. 수직 스크롤-투-커서가 활성 줄을 보기에 유지합니다(`scrollTop`).

### `Checkbox`

```ts
new Checkbox(opts: CheckboxOptions)

interface CheckboxOptions {
  checked?: boolean;   // 기본값 false
  label?: string;      // 오른쪽에 그려짐; 접근 가능한 이름으로 사용
  size?: number;       // 박스 크기 px, 기본값 20
  font?: string;       // 기본값 '16px sans-serif'
  color?: string;      // 레이블 색상, 기본값 '#e2e8f0'
  accent?: string;     // 체크됨 채우기, 기본값 '#2563eb'
  border?: string;     // 체크 안 됨 테두리, 기본값 '#475569'
  onChange?: (checked: boolean) => void;
}
```

실제 `<input type=\"checkbox\">` 그림자 노드로 구동됨 — 에이전트/보조 기술로 네이티브 전환 가능. Canvas `click`과 그림자 노드의 네이티브 `change` 모두 하나의 보호된 세터를 통해 라우팅됩니다(변경되지 않은 값에 대한 중복 `onChange` 없음). 공개: `checked`. A11y: `{ tag: 'input', inputType: 'checkbox', checked, label }`.

### `Toggle`

```ts
new Toggle(opts: ToggleOptions)

interface ToggleOptions {
  checked?: boolean;   // 기본값 false
  label?: string;      // 오른쪽에 그려짐; 접근 가능한 이름으로 사용
  width?: number;      // 트랙 너비 px, 기본값 44  (trackW로 노출)
  height?: number;     // 트랙 높이 px, 기본값 24 (trackH로 노출)
  font?: string;       // 기본값 '16px sans-serif'
  color?: string;      // 레이블 색상, 기본값 '#e2e8f0'
  accent?: string;     // 온 상태 트랙 채우기, 기본값 '#2563eb'
  track?: string;      // 오프 상태 트랙 채우기, 기본값 '#475569'
  onChange?: (checked: boolean) => void;
}
```

iOS 스타일 스위치로 `{ role: 'switch', checked, label }`을 `aria-checked`와 함께 프로젝션합니다. `role=\"switch\"`는 `div`이므로(네이티브 변경이 `Scene`에 의해 전달되지 않음), `click`이 자체 `change` 이벤트를 재발행합니다; 단일 `change` 핸들러가 진실 공급원이므로 외부 `on('change', …)` 리스너와 `onChange` 콜백이 모두 실행됩니다. 공개: `checked`, `trackW`, `trackH`.

### `Slider`

```ts
new Slider(props?: SliderProps)   // props는 .d.ts에서 느슨하게 타입됨(any)

// 인식된 props (생성자에서 읽음):
{
  min?: number;            // 기본값 0
  max?: number;            // 기본값 100
  value?: number;          // 기본값 = min
  width?: number;          // 기본값 200
  height?: number;         // 기본값 24
  step?: number;           // 기본값 1 — 포인터 및 키보드 값 세분성
  trackColor?: string;     // 기본값 'rgba(255, 255, 255, 0.15)'
  progressColor?: string;  // 기본값 '#00f0ff'
  handleColor?: string;    // 기본값 '#fff'
  focusColor?: string;     // focus-ring color (2.7.0+), default '#00f0ff'
}
```

원형 thumb이 있는 수평 슬라이더. 공개: `min`, `max`, `value`, `step`. 드래깅(`pointerdown` → `pointermove` → `pointerup`)은 포인터 `localX`를 값에 매핑하고, **`min`에 고정된 `step` 그리드에 스냅**(기본적으로 정수 단계, `input[type=range]` 의미와 일치)되며, `{ value }`와 함께 `change` 이벤트를 발생시킵니다(`on('change', e => e.value)`로 구독). 키보드: `ArrowRight`/`ArrowUp`이 한 단계 위로, `ArrowLeft`/`ArrowDown`이 한 단계 아래로, `Home`/`End`가 `min`/`max`로 이동. 공개 `focused`는 키보드 포커스를 추적하고 핸들 주위에 `focusColor`의 2px 링을 그립니다(2.7.0+; 그 이전 릴리스에서는 슬라이더가 키보드로 조작 가능했음에도 **포커스 표시를 전혀 그리지 않았습니다** — WCAG 2.4.7). A11y: `{ role: 'slider', value, valuemin, valuemax }`. 이전 1.0 이전 UI 빌드는 정수 전용 값과 키보드 처리가 없었습니다.

### `Dropdown`

```ts
new Dropdown(options: string[], props?: DropdownProps)  // props는 느슨하게 타입됨(any)

// 인식된 props:
{
  value?: string;   // 초기 선택; 기본값 = options[0]
  width?: number;   // 기본값 120
  height?: number;  // 기본값 36
  bg?: string;      // 닫힌 트리거 배경, 기본값 'rgba(30, 41, 59, 0.85)'
  color?: string;   // 기본값 '#fff'
  radius?: number;  // 기본값 8
  font?: string;    // 기본값 '14px sans-serif'

  // Open-menu theming (2.7.0+) — see the note below
  menuBg?: string;           // option row bg, default 'rgba(15, 23, 42, 0.95)'
  menuColor?: string;        // option row text, default '#fff'
  menuSelectedBg?: string;   // selected row, default 'rgba(0, 240, 255, 0.25)'
  menuHighlightBg?: string;  // keyboard-highlighted row, default 'rgba(0, 240, 255, 0.4)'
  focusColor?: string;       // focus ring, trigger + rows, default '#00f0ff'
}
```

콤보박스: `Button`이 현재 값을 표시하고; 클릭(또는 `ArrowDown`/`ArrowUp`/`Enter`/`Space`)하면 옵션 `Button`들의 `Stack` 메뉴와 전체 화면 투명 백드롭이 열리며, 둘 다 `scene.showOverlay(...)`를 통해 마운트됩니다. `Escape` 또는 백드롭 클릭이 `scene.hideOverlay(...)`)를 통해 닫습니다. 선택은 `{ value }`와 함께 `change` 이벤트를 발생시킵니다. 키보드 탐색은 강조 표시된 인덱스를 추적합니다; `activedescendant`와 옵션 id(`${id}-opt-${i}`)가 ARIA에 연결됩니다.

루트의 A11y: `{ role: 'combobox', expanded, controls, haspopup: 'listbox', value, activedescendant }`. 메뉴는 `role="listbox"`를, 각 옵션은 `selected`와 함께 `role="option"`을 프로젝션합니다.

**열린 메뉴에도 트리거처럼 테마를 지정하세요** (2.7.0+). 이러한 props가 존재하기 전에는 트리거의 `bg`/`color`만 재정의할 수 있었고 메뉴 색상은 하드코딩되어 있었으므로, 밝거나 따뜻한 팔레트용으로 테마가 지정된 드롭다운은 시안색 선택이 있는 어두운 슬레이트 패널을 열었습니다 — 이는 스타일이 아닌 렌더링 버그처럼 보입니다. `menuHighlightBg`와 `menuSelectedBg`는 동시에 적용될 수 있고 메뉴를 열면 선택된 행이 강조 표시되므로, 강조가 둘 중 더 강한 것으로 읽히게 하세요. 옵션 행 자체가 포커스 가능(`role="option"`)하므로 `focusColor` 링은 강조 표시된 행_위에_ 그려집니다: 링과 `menuHighlightBg` 사이에 충분한 대비를 유지하여 3:1 비텍스트 기준(WCAG SC 1.4.11)을 넘기세요.

---

## 오버레이

### `Modal`

```ts
new Modal(title: string, props?: ModalProps)  // props는 느슨하게 타입됨(any)

// 인식된 props:
{
  width?: number;       // 백드롭, 기본값 window.innerWidth (대체 800)
  height?: number;      // 백드롭, 기본값 window.innerHeight (대체 600)
  backdropColor?: string; // 기본값 'rgba(0, 0, 0, 0.5)'
  modalWidth?: number;  // 중앙 카드, 기본값 400
  modalHeight?: number; // 기본값 250
  cardBg?: string;      // 기본값 'rgba(15, 23, 42, 0.95)'
  cardBorder?: string;  // 기본값 'rgba(255, 255, 255, 0.15)'
}
```

`title` 텍스트와 내장 "Close" 버튼이 있는 중앙 `Card`가 포함된 전체 화면 딤 백드롭. 카드는 공유 [애니메이션 시스템](/reference/core-entity/#aenimeisyeon)을 통해 마운트 시 스프링으로 확장됩니다; 기본 `click`/`pointerdown`을 차단합니다. `scene.showOverlay(modal)`로 표시합니다.

- `close(): Promise<void>` — 카드 스케일을 다시 0으로 스프링한 후, 퇴장 애니메이션이 해결되면 `scene.hideOverlay(this)`를 통해 마운트 해제합니다(안전한 지연 해체). await 가능합니다.
- `update(dt, time)` — 스프링을 틱하고 애니메이션 중 씬을 더티로 표시합니다(렌더 루프에서 호출).

### `ScrollView`

```ts
new ScrollView(opts: ScrollViewOptions)

interface ScrollViewOptions {
  width: number;
  height: number;
  scrollPhysics?: MotionConfig; // default 'spring' (stiffness 180, damping 12)
}
```

`scrollPhysics`에 의해 구성된 스프링 물리와 휠 + 포인터-드래그 스크롤이 있는 클리핑 뷰포트(`clipChildren = true`) — 기본 스프링은 의도적으로 과소 감쇠되어 있습니다(ζ ≈ 0.45, 약 20% 오버슈트); 문서 같은 콘텐츠는 일반적으로 내보낸 `DOCUMENT_SCROLL_PHYSICS` 프리셋(`{ stiffness: 180, damping: 27 }`, ζ ≈ 1.0, 오버슈트 없음)을 원합니다. 자식은 변환되는 비대화형 `content` Entity 내부에 있습니다; 뷰포트 박스는 고정됩니다.

- `content: Entity` — 스크롤되는 컨테이너(public).
- `add(child): this` / `remove(child): this` — `content`를 변경하고 `updateContentSize()`를 호출합니다.
- `updateContentSize(): void` — 자식 범위에서 `content.width/height`를 재계산하여 최대 스크롤 범위를 설정합니다(자식을 직접 변경한 후 호출).
- `scrollTo(y: number): void` — **0이 상단**인 Y 오프셋으로 스크롤(내부적으로 고정됨; 공개 scroll API는 0.1.1에 추가됨).
- `scrollToBottom(): void` — 콘텐츠 끝으로 이동(0.1.1에 추가됨).
- `update(dt, time)` — 목표 오프셋 방향으로 스프링을 통합합니다(렌더 루프에서 호출).

휠 스크롤은 `Ctrl`이 눌려 있지 않으면 `preventDefault()`를 호출합니다(브라우저 확대/축소 허용). 포인터 드래그는 콘텐츠를 커서/손가락과 1:1로 이동합니다. 스크롤 대상은 `[-maxScroll, 0]`으로 고정됩니다.

```ts
const sv = new ScrollView({ width: 360, height: 480 });
sv.add(longContent);
scene.add(sv.setPosition(20, 20));
sv.scrollToBottom(); // 예: 추가 후 채팅 로그
```

---

## 콘텐츠 / 리치 문서

### `Markdown`

```ts
new Markdown(markdownText: string, opts?: MarkdownOptions)

interface MarkdownOptions {
  maxWidth?: number;     // 기본값 800
  theme?: MarkdownTheme;
  onLinkClick?: (href: string) => void;
  selectable?: boolean;  // 기본값 true; 렌더링된 텍스트/코드/테이블 셀로 전파
}

interface MarkdownTheme {        // 모두 선택 사항; 기본값 표시
  textColor?: string;            // '#e2e8f0'
  headingColor?: string;         // '#f8fafc'
  codeColor?: string;            // '#a5f3fc'
  codeBgColor?: string;          // 'rgba(30, 41, 59, 0.85)'
  quoteBorderColor?: string;     // '#6366f1'
  quoteTextColor?: string;       // '#94a3b8'
  hrColor?: string;              // 'rgba(148, 163, 184, 0.3)'
  tableBgColor?: string;         // 'rgba(15, 15, 25, 0.4)'
  tableHeaderBgColor?: string;   // 'rgba(255, 255, 255, 0.08)'
  bodyFont?: string;             // 'Inter, system-ui, sans-serif'
  codeFont?: string;             // '\"JetBrains Mono\", \"Fira Code\", monospace'
  fontSize?: number;             // 16
}
```

**`marked` (v18, GFM)** 로 Markdown을 수직 `Stack`(`content`, 간격 16) 아래의 VMT 서브트리로 파싱합니다. 지원되는 토큰: 제목(h1–h6, 크기 조정), 문단(단어 줄바꿈된 `RichText`), 펜스 코드 블록(키워드 강조 표시가 있는 `CodeBlock`), 인용문(왼쪽 악센트 바), 순서 있는/없는 목록, 수평선, 인라인 코드, 링크 — 그리고 **GFM 테이블**(`Table` 컴포넌트를 통해 렌더링; GFM 테이블 지원은 0.1.1에 추가됨). `content.width`/`height`가 컴포넌트 크기를 결정합니다.

두 가지 콘텐츠 업데이트 경로 — **스트리밍을 위해 올바른 경로 선택이 중요합니다:**

- `setContent(markdown): this` — **전체 재구축**: 모든 자식을 해체하고 처음부터 다시 렌더링합니다. 일회성/교체에 사용합니다.
- `appendMarkdown(chunk): this` — **올바른 스트리밍/토큰 경로**. 원시 버퍼에 추가하고, 전체 Markdown 소스를 다시 렉싱하며, 원시 소스로 토큰을 비교하고, 변경되지 않은 접두사 엔티티를 재사용하며, 마지막(커지는) 문단을 `RichText.setSpans`를 통해 제자리에서 업데이트합니다. 전체 엔티티 트리 재구축을 피하지만, 렉싱은 여전히 문서 길이에 비례합니다.
- `setSelectable(selectable): this` — 기존 텍스트/코드/테이블 하위 항목을 업데이트하고 향후 스트리밍 노드의 기본값이 됩니다.

> 주의: **`setContent(fullSoFar)`를 모든 토큰에 대해 호출하여 스트리밍하지 마세요.** 그러면 토큰마다 전체 트리를 재구축하고(O(토큰)당 O(문서)) 레이아웃 비용이 문서와 함께 증가합니다. 새 델타만 `appendMarkdown(chunk)`에 전달하세요.

```ts
const md = new Markdown('', { maxWidth: 600 });
scene.add(md.setPosition(40, 40));
for await (const token of llmStream) md.appendMarkdown(token); // 변경되지 않은 렌더링된 접두사 재사용
```

### `CodeBlock`

```ts
new CodeBlock(code: string, lang: string, maxWidth: number, theme: Required<MarkdownTheme>, selectable = true)
```

펜스 코드용 단일 자체 렌더링 리프: 둥근 배경 + 줄별, 세그먼트별 색상 텍스트(`js`/`ts`/`py`/`rust` 및 별칭에 대한 키워드/문자열/주석/숫자 강조 표시). 이전의 줄별/세그먼트별 자식 엔티티 폭발을 하나의 평평한 리프로 대체합니다. **장식용** — `isPointInside()`는 항상 `false`를 반환합니다.

- `setCode(code, lang?): this` — 콘텐츠 재파싱(예: 실시간 편집).
- `setSelectable(selectable): this` — 정확한 소스 콘텐츠 프로젝션 전환.

UI 1.9는 Core 1.8의 `PreparedContentGrid`를 그래핌별 Canvas
페인트와 시맨틱 프로젝션 간에 공유합니다. 탭, 넓은 CJK/이모지, 아랍어 형태 분석, bidi,
Firefox 글꼴 대체, DPR/확대/축소, 아핀 변환이 따라서 하나의
소스 인식 형상 계획을 유지합니다.

참고: `theme`는 완전히 해결된 `Required<MarkdownTheme>`이어야 합니다. 실제로 `CodeBlock`은 `Markdown`에 의해 내부적으로 생성됩니다; 완전한 테마를 제공하는 경우에만 직접 구성하세요.

### `Table`

```ts
new Table(opts: TableOptions)

interface TableOptions {
  headers: (string | Entity)[];     // 필수; Entity 인스턴스는 고유해야 함
  rows: (string | Entity)[][];      // 필수 (2D 행 × 열)
  colWidths?: number[];       // 열별 px; headers.length와 일치해야 함, 아니면 균등 분배
  width?: number;             // 전체 너비, 기본값 600
  rowHeight?: number;         // 기본값 36
  bg?: string;                // 기본값 'rgba(15, 15, 25, 0.4)'
  headerBg?: string;          // 기본값 'rgba(255, 255, 255, 0.08)'
  borderColor?: string;       // 기본값 'rgba(255, 255, 255, 0.15)'
  headerTextColor?: string;   // 기본값 '#ffffff'
  textColor?: string;         // 기본값 '#e2e8f0'
  font?: string;              // 기본값 '14px sans-serif'
  selectable?: boolean;       // 네이티브 셀 텍스트 선택, 기본값 true
}
```

열 정렬은 텍스트 정렬 속성이 아니라 **셀 엔티티를 배치**하여 적용됩니다 — `setTextAlign`은 `'left' | 'justify'`만 허용합니다. 줄바꿈된 다중 줄 셀의 경우 각 줄이 아니라 블록 자체가 정렬됩니다.

Canvas 네이티브 데이터 그리드: 문자열 셀은 Text 자식 엔티티가 되고, Entity 셀은 공개 `setMaxWidth()`를 통해 제한되며, `layout()`이 그리기 전용 `render()` 패스 전에 줄바꿈, 행 높이 및 위치를 해결합니다. 외부 셀 콘텐츠를 변경한 후 `layout()`을 호출하세요. 각 셀은 하나의 콘텐츠 프로젝션을 소유합니다. A11y: 보조 기술을 위해 `{ role: 'grid', label: 'N개의 열과 M개의 행이 있는 데이터 테이블.' }`을 프로젝션합니다. 또한 `Markdown` 내부의 GFM 테이블 렌더러입니다.

---

### `RadioGroup`

```ts
new RadioGroup(opts: RadioGroupOptions)

interface RadioGroupOptions {
  options: RadioOption[];
  value?: string;
  label?: string;  // accessible name for the GROUP (2.8.0+), default 'Radio group'
  direction?: 'horizontal' | 'vertical';
  gap?: number;
  size?: number;
  font?: string;
  color?: string;
  accent?: string;
  border?: string;
  onChange?: (value: string) => void;
}

interface RadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}
```

`{ role: 'radiogroup', label }`로 프로젝션된 상호 배타적인 라디오 선택 그룹. 표준화된 `'change'` 이벤트 페이로드에는 `{ value }`가 포함됩니다.

**화면에 그룹이 두 개 이상 있는 경우 `label`을 전달하세요** (2.8.0+). 각 옵션은 고유한 이름을 가지지만, _어떤 선택이 이루어지는지_ 알려주는 것은 그룹의 이름입니다. 없으면 모든 그룹이 일반적인 기본값 `'Radio group'`으로 발표되므로 사용자는 "Radio group"을 반복적으로 듣게 되고 구분할 방법이 없습니다 — 그룹을 식별하는 시각적 제목이 그룹의 일부가 아니라 캔버스에 그려진 경우 반드시 설정하세요(WCAG 4.1.2).

---

### `Tabs`

```ts
new Tabs(opts: TabsOptions)

interface TabsOptions {
  tabs: TabItem[];
  value?: string;
  label?: string; // accessible name for the TAB BAR (2.8.0+), default 'Tab switching panel'
  width: number;
  height: number;
  tabHeight?: number;
  font?: string;
  color?: string;
  selectedColor?: string;
  borderColor?: string;
  closable?: boolean; // 닫기 표시 표시; 클릭은 onClose로 라우팅
  tabWidth?: number; // 기본 설정 너비(px); 오버플로 시 막대 스크롤(기본값 160)
  minTabWidth?: number; // 스크롤이 시작되는 하한(기본값 96)
  autoHideTabBar?: boolean; // 탭이 2개 미만일 때 막대 숨김(기본값 false; 1.9.5)
  onChange?: (value: string) => void;
  onClose?: (value: string) => void;
}

// rename a tab's label at runtime:
tabs.setLabel(tabId: string, label: string): void

interface TabItem {
  id: string;
  label: string;
  content: Entity;
}
```

탭 선택 컨테이너. 활성 탭의 콘텐츠 뷰를 자동으로 마운트하고 나머지 공간 내에서 변환합니다. 접근성을 위해 `{ role: 'tablist', label }`를 프로젝션합니다. 표준화된 `'change'` 이벤트 페이로드에는 `{ value }`가 포함됩니다.

**화면에 탭리스트가 두 개 이상 있는 경우 `label`을 전달하세요** (2.8.0+), `RadioGroup.label`과 같은 이유입니다: 각 탭에는 이름이 있지만, 탭이_무엇 사이를_ 전환하는지 알려주는 것은 탭리스트의 이름입니다. 기본값은 `'Tab switching panel'`입니다.

Tabs는 고정된 기본 설정 `tabWidth`를 유지하며 탭이 오버플로되면 줄어들지 않고 막대가 수평으로 스크롤됩니다(휠 또는 활성 탭을 계속 보기 위한 자동 스크롤) — 1.9.4부터 `tabWidth`는 막대가 지나치는 대상 너비이지 늘여서 채우는 너비가 아닙니다(이전에는 넓은 스트립에서 닫기 히트가 잘못 지정됨). `autoHideTabBar`(1.9.5)를 사용하면 탭이 2개 미만인 동안 막대와 히트 영역이 사라지고 콘텐츠가 전체 높이를 차지합니다(Vim `showtabline=1` 의미). `effectiveTabBarHeight` 게터는 막대의 현재 높이를 보고하며(숨겨졌을 때 `0`), 콘텐츠 지오메트리는 매 프레임 다시 동기화되므로 `tabs`를 재할당해도 오래되었거나 오프셋된 콘텐츠가 남을 수 없습니다.

---

### `ProgressBar`

```ts
new ProgressBar(opts?: ProgressBarOptions)

interface ProgressBarOptions {
  value: number; // 0..1
  width?: number;
  height?: number;
  radius?: number;
  bg?: string;
  accent?: string;
  showText?: boolean;
  font?: string;
  color?: string;
}
```

진행률 트랙을 표시하는 진행 막대. 중앙 텍스트 옵션 사용 가능. 접근성을 위해 `{ role: 'progressbar', value }`를 프로젝션합니다.

- `setValue(value: number): void` — 안전 범위 검사로 값을 업데이트합니다.

---

### `Overlay`

```ts
new Overlay(opts: OverlayOptions)

interface OverlayOptions {
  width: number;
  height: number;
  placement?: Placement; // 'top' | 'bottom' | 'left' | 'right' | 'top-start' | etc., default 'bottom'
  offset?: number;       // distance in px, default 8
}
```

가장자리 충돌 감지와 배치 뒤집기가 있는 플로팅 포지셔닝 레이어 엔진. `showAt(target, placement?, offset?)`로 대상 기준으로 배치하거나 `showAtPoint(x, y)`로 절대 지점에 배치합니다. `hide()`로 숨깁니다. 네이티브로 접근성 노드를 프로젝션하지 않습니다.

---

### `Tooltip`

```ts
new Tooltip(opts: TooltipOptions)

interface TooltipOptions {
  target: Entity;
  content: string;
  placement?: Placement;
  delay?: number; // 표시 전 ms, 기본값 300
  font?: string;
  color?: string;
  bg?: string;
}
```

플로팅 호버 툴팁 헬퍼. 대상 기준으로 호버 시 툴팁 컨테이너를 프로젝션합니다.

---

### `Popover`

```ts
new Popover(opts: PopoverOptions)

interface PopoverOptions {
  target: Entity;
  width: number;
  height: number;
  placement?: Placement;
  bg?: string;
  borderColor?: string;
}
```

플로팅 클릭 팝오버 패널. 대상을 클릭하면 팝오버가 표시되고, 외부를 클릭하면 자동으로 숨겨집니다.

---

### `ContextMenu`

```ts
new ContextMenu(opts: ContextMenuOptions)

interface ContextMenuOptions {
  items: ContextMenuItem[];
  width?: number;
  font?: string;            // default '14px sans-serif'
  color?: string;           // row text, default '#e2e8f0'
  disabledColor?: string;   // disabled rows, default 'rgba(226, 232, 240, 0.4)'
  bg?: string;              // menu background, default 'rgba(15, 23, 42, 0.95)'
  hoverBg?: string;         // hovered row, default 'rgba(0, 240, 255, 0.25)'
  borderColor?: string;     // menu border, default 'rgba(255, 255, 255, 0.15)'
  itemHeight?: number;      // row height, default 32
  separatorHeight?: number; // divider height, default 1
}

type ContextMenuItem =
  | { label: string; icon?: string; shortcut?: string; disabled?: boolean; onClick?: () => void; children?: ContextMenuItem[] }
  | { separator: true };
```

우클릭으로 트리거되는 메뉴 컴포넌트. 아이콘, 단축키, 구분선 및 재귀적 서브메뉴를 지원합니다.

- `showAtPoint(x: number, y: number, source?: Scene | Entity): void` — Scene 좌표에 메뉴를 표시합니다. 메뉴가 아직 마운트되지 않았다면 마운트된 source를 전달하세요.
- 중첩 메뉴는 루트 메뉴가 소유한 하나의 backdrop을 공유합니다. 명령 활성화, 외부 pointerdown, `hide()` 또는 `destroy()`는 숨겨진 시맨틱 또는 포인터 표면을 남기지 않고 전체 체인을 닫습니다.

---

### `VirtualList`

```ts
new VirtualList<T>(opts: VirtualListOptions<T>)

interface VirtualListOptions<T> {
  width: number;
  height: number;
  items: T[];                          // full data array
  renderItem: (item: T, index: number) => Entity;
  estimatedRowHeight: number;          // before a row is measured; exact value for fixed heights
  overscan?: number;                   // extra rows above & below the window, default 3
  keyForItem?: (item: T, index: number) => string; // stable identity (e.g. message id)
  stickToBottomThreshold?: number;     // px from bottom that counts as "following", default 48
}
```

고성능 렌더링에 최적화된 스크롤 목록 컨테이너. 현재 뷰포트 경계 내에 있는 항목만 인스턴스화/렌더링합니다. `keyForItem`는 측정된 높이가 `setItems()` 후에도 유지되게 하고, 위 행들이 크기 조정되는 동안 스크롤 앵커를 유지하며, 캐시를 버리지 않고 추가/앞에 삽입할 수 있게 합니다 — 없으면 `setItems()`가 모든 측정을 지우고 맨 위로 이동합니다. `stickToBottomThreshold`(`keyForItem`이 있을 때만)는 행이 크기 조정된 후 추적하는 뷰포트를 맨 아래에 다시 고정합니다 — 채팅 기록에 이상적입니다. 메서드: `scrollToIndex(index)`, `scrollToTop()`, `scrollToBottom()`, `jumpToBottom()`(즉시). 내보낸 `RowHeights` 클래스가 측정 캐시를 뒷받침합니다.

---

### `TreeView`

```ts
new TreeView(opts: TreeViewOptions)

interface TreeViewOptions {
  nodes: TreeNode[];
}

interface TreeNode {
  id: string;
  label: string;
  icon?: string;                    // optional icon glyph (emoji, nerd-font, …)
  iconColor?: string;               // falls back to the tree's text color (material-style file icons)
  children?: TreeNode[] | (() => Promise<TreeNode[]>);
}
```

중첩 트리 탐색기. 동기식 자식 배열 또는 비동기 지연 로딩 함수 리졸버를 지원합니다.

---

### `ResizablePanel`

```ts
new PanelGroup(opts: PanelGroupOptions)
new Panel(opts: PanelOptions)
new PanelResizeHandle()

interface PanelGroupOptions {
  direction: 'horizontal' | 'vertical';
  width: number;
  height: number;
}

interface PanelOptions {
  minSize?: number;
  defaultSize?: number; // 분수
}
```

크기 조정 가능한 분할 창 시스템입니다. `Panel.setContent(content, fit = true)`는 하나의 엔터티를 호스팅하고 구분선 드래그나 직접 크기 변경 후에도 Panel의 너비와 높이를 추적합니다. 콘텐츠가 한 축 또는 두 축의 크기를 직접 소유해야 할 때는 `false` 또는 `{ width?, height? }`를 전달하세요.

---

## 빠른 색인

| 컴포넌트      | 생성자                          | 그림자 노드 / 역할              |
| ------------- | ------------------------------- | ------------------------------- |
| `Text`        | `(text, opts?)`                 | `div` (name = text)             |
| `RichText`    | `(spans, opts?)`                | `div` + 링크별 `<a>` 핫스팟     |
| `Button`      | `(label, opts?)`                | `button` role=button            |
| `Link`        | `(label, opts)`                 | `a[href]`                       |
| `Image`       | `(src, opts)`                   | `img[src,alt]`                  |
| `Card`        | `(opts)`                        | 없음, 또는 role=group + `label` |
| `Stack`       | `(opts?)`                       | 없음 (구조적)                   |
| `Flow`        | `(opts?)`                       | 없음 (구조적)                   |
| `Input`       | `(opts)`                        | 투명한 `input`                  |
| `TextArea`    | `(opts)`                        | 투명한 `textarea`               |
| `Checkbox`    | `(opts)`                        | `input[type=checkbox]`          |
| `Toggle`      | `(opts)`                        | role=switch                     |
| `Slider`      | `(props?)`                      | role=slider                     |
| `Dropdown`    | `(options, props?)`             | role=combobox + listbox/option  |
| `RadioGroup`  | `(opts)`                        | role=radiogroup                 |
| `Tabs`        | `(opts)`                        | role=tablist                    |
| `ProgressBar` | `(opts?)`                       | role=progressbar                |
| `Overlay`     | `(opts)`                        | 없음 (구조적)                   |
| `Tooltip`     | `(opts)`                        | tooltip                         |
| `Popover`     | `(opts)`                        | popover 패널                    |
| `ContextMenu` | `(opts)`                        | 컨텍스트 메뉴 목록              |
| `VirtualList` | `(opts)`                        | 뷰포트 스크롤                   |
| `TreeView`    | `(opts)`                        | 트리 노드 뷰                    |
| `PanelGroup`  | `(opts)`                        | 크기 조정 가능 그룹             |
| `ScrollView`  | `(opts)`                        | 콘텐츠 뷰포트                   |
| `Modal`       | `(title, props?)`               | 오버레이 (백드롭 + 카드)        |
| `Markdown`    | `(text, opts?)`                 | 위 항목들의 서브트리            |
| `CodeBlock`   | `(code, lang, maxWidth, theme)` | 없음 (장식용)                   |
| `Table`       | `(opts)`                        | role=grid                       |

> `Slider`, `Dropdown`, `Modal`은 게시된 `.d.ts`에서 느슨하게 타입된(`any`) props를 받습니다; 위 옵션 테이블은 소스 생성자에서 파생되었으며 정확한 계약입니다.
