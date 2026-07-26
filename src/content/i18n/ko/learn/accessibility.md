---
title: '접근성 및 자동화'
description: 'VectoJS가 스크린 리더, 키보드 사용자, Playwright 자동화를 위해 캔버스 콘텐츠 위에 시맨틱 DOM 컨트롤을 프로젝션하는 방법.'
order: 15
---

# 접근성 및 자동화

Canvas와 WebGL 픽셀은 그 자체로 시맨틱 정보를 전달하지 않습니다. 적격한 인터랙티브 엔티티에 대해 VectoJS는 `a11yRoot` 오버레이에 실제 보이지 않는 DOM 요소를 유지합니다. 스크린 리더, 키보드 탐색, 자동화 도구는 해당 요소와 상호작용할 수 있으며, 캔버스-지원 레이어가 시각적 요소를 제공합니다. 이는 브라우저의 Shadow DOM API가 아닌 프로젝션 레이어이며, 애플리케이션이 올바른 시맨틱과 테스팅을 책임집니다.

## Shadow DOM 프로젝션 작동 방식

엔티티가 `interactive = true`(그리고 0이 아닌 박스)를 가질 때, `Scene`은 실제 HTML 요소 — `<button>`, `<input>`, `<a>` 등 — 를 생성하고 절대 CSS를 사용하여 캔버스 위에 배치합니다. 요소는 `opacity: 0`이고 `pointer-events: auto`이므로 눈에는 보이지 않지만 접근성 도구에는 완전히 기능합니다.

<figure>
  <img src="/images/shadow-dom-layers.svg" alt="세 개의 중첩 레이어를 보여주는 다이어그램: z-index 0의 GPU-렌더링 컴포넌트가 있는 캔버스, z-index 9의 DOM 포털 레이어, 그리고 버튼과 입력 같은 투명한 실제 DOM 요소를 포함하는 z-index 10의 A11y 섀도 레이어. 포인터 커서 화살표가 최상위 레이어를 먼저 적중합니다." class="diagram" />
  <figcaption>Canvas 부모의 세 레이어. a11y 레이어만 <code>pointer-events: auto</code>를 가지므로 클릭이 Canvas에 도달하기 전에 실제 섀도 요소에 먼저 도달합니다.</figcaption>
</figure>

a11y 레이어는 Canvas의 부모 `<div>`에 위치하며, `Scene`이 자동으로 `position: relative`로 강제 설정합니다.

렌더링된 모든 프레임에서(`a11ySyncInterval`에 의해 조절됨), Scene이 다음을 수행합니다:

1. 각 인터랙티브 엔티티의 `getA11yAttributes()`를 읽습니다.
2. 해당 섀도 노드를 생성하거나 업데이트합니다 (더티-체크되어 DOM 쓰기 최소화).
3. 엔티티의 완전한 월드 아핀 행렬과 로컬 `width × height`를 적용합니다; 프로젝션 루트는 논리적 Scene 좌표를 Canvas CSS 박스에 매핑합니다.

Canvas 오프셋과 비균일 CSS 스케일링이 지원됩니다. 임의의 CSS 회전/왜곡 하에서 정렬을 가정하지 말고 실제 페이지에서 `debugA11y`로 확인하세요.

> [!NOTE]
> 동기화는 프레임 중에 **절대 정리하지 않습니다**. 인터랙티브 자식 엔티티를 자주 추가/제거하는 경우, 폐기하기 전에 `scene.detachA11y(entity)`를 호출하지 않으면 섀도 노드가 누수됩니다. `scene.remove(entity)`는 재귀적으로 안전하게 정리합니다.

## 옵트인: `entity.interactive`

```typescript
entity.interactive = true; // enable shadow node + pointer/keyboard events
entity.width = 120;
entity.height = 40; // shadow node is only created when width > 0
```

`interactive = true`를 설정하면 부작용이 있습니다: `a11yNeedsReorder` 플래그를 설정하고 `scene.markDirty()`를 호출합니다.

## 섀도 노드 제어: `getA11yAttributes()`

`getA11yAttributes()`를 재정의하여 요소 유형, ARIA 역할, 시맨틱 상태를 지정하세요:

```typescript
import type { A11yAttributes } from '@vectojs/core';

class AccessibleBtn extends Entity {
  label = 'Submit';

  getA11yAttributes(): A11yAttributes {
    return {
      tag: 'button',
      role: 'button',
      label: this.label,
    };
  }
}
```

전체 인터페이스:

```typescript
interface A11yAttributes {
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea'; // default: 'div'
  role?: string; // ARIA role (e.g. 'switch', 'slider', 'combobox')
  label?: string; // aria-label / accessible name
  tabIndex?: number; // explicit focus order for non-control keyboard regions
  href?: string; // for tag='a' — makes it a real link
  src?: string; // for tag='img'
  alt?: string; // for tag='img'
  inputType?: string; // for tag='input' — 'text', 'checkbox', etc.
  placeholder?: string; // input/textarea placeholder
  value?: string; // input/textarea current value
  checked?: boolean; // input[type=checkbox] or aria-checked (for role=switch)
  disabled?: boolean;
  expanded?: boolean; // aria-expanded (for comboboxes, disclosures)
  controls?: string; // aria-controls (points to another element's id)
  haspopup?: string; // aria-haspopup
  selected?: boolean; // aria-selected (for listbox options)
  activedescendant?: string; // aria-activedescendant (for composite widgets)
  valuemin?: string; // aria-valuemin (for sliders, meters)
  valuemax?: string; // aria-valuemax

  // 다른 노드의 관계 및 명명
  labelledby?: string; // aria-labelledby
  describedby?: string; // aria-describedby — 힌트/오류 텍스트

  // 유효성 검사 상태 (캔버스 폼이 공지 가능하게 하는 유일한 방법)
  required?: boolean; // aria-required
  invalid?: boolean; // aria-invalid — false는 "명시적으로 유효"을 의미

  // 구조 및 대화 상자
  level?: number; // aria-level (제목, 트리 항목)
  ariaModal?: 'true' | 'false'; // role="dialog"의 aria-modal

  // 라이브 영역 — 포커스 이동 없이 스트리밍 업데이트 공지
  live?: 'off' | 'polite' | 'assertive';
  atomic?: boolean; // aria-atomic — 차이가 아닌 전체 영역을 읽음
  relevant?: string; // aria-relevant — 예: 'additions text'

  // 포인터 표면
  pointerEvents?: 'auto' | 'none'; // 구조/오버레이 전용 노드의 'none'

  target?: string; // tag='a'용
  textInputStyle?: TextInputStyle; // 네이티브 에디터 타이포그래피
}
```

필드에 `undefined`를 반환하면 속성이 **제거**되어 적용되지 않는 상태가 사라집니다.

버튼이나 폼 컨트롤이 아니지만 키보드 단축키를 소유해야 하는 캔버스 작업 공간에는 명시적 `tabIndex: 0`을 사용하세요:

```typescript
getA11yAttributes(): A11yAttributes {
  return { role: 'region', label: 'Design canvas', tabIndex: 0 };
}
```

네이티브 입력, 텍스트 영역, 편집 가능한 콘텐츠가 해당 편집 단축키를 담당하도록 유지하세요. Scene은 속성이 변경될 때 명시적 탭 인덱스를 새로고침합니다.

### 내장 컴포넌트가 프로젝션하는 것

| 컴포넌트             | 섀도 요소                                  | 주요 ARIA 속성                                                |
| -------------------- | ------------------------------------------ | ------------------------------------------------------------- |
| `Button`             | `<button>`                                 | `role="button"`, `aria-label`                                 |
| `Link`               | `<a href>`                                 | 네이티브 링크, `aria-label`                                   |
| `Image`              | `<img>`                                    | `src`, `alt`                                                  |
| `Input`              | `<input type="text">`                      | `placeholder`, `value` (실시간)                               |
| `TextArea`           | `<textarea>`                               | `placeholder`, `value` (실시간)                               |
| `Checkbox`           | `<input type="checkbox">`                  | `checked` (실시간), `aria-label`                              |
| `Toggle`             | `<div role="switch">`                      | `aria-checked` (실시간), `aria-label`                         |
| `Slider`             | `<div role="slider">`                      | `aria-valuenow/min/max` (실시간)                              |
| `Dropdown`           | `<div role="combobox">`                    | `aria-expanded`, `aria-controls`, 메뉴 항목은 `role="option"` |
| `Card` (레이블 있음) | `<div role="group">`                       | `aria-label`                                                  |
| `Table`              | `grid` › `row` › `gridcell`/`columnheader` | 루빙 tabindex, 2D 화살표 키, Ctrl+Home/End                    |
| `TreeView`           | `treeitem` (보이는 행별)                   | `aria-level`/`expanded`/`selected`, 화살표로 확장/축소        |
| `ContextMenu`        | `menuitem` (항목별)                        | `aria-haspopup`/`expanded`, 화살표 래핑, Escape로 닫기        |
| `RadioGroup`         | `radio` (옵션별)                           | `aria-checked`, 화살표로 이동+선택                            |
| `Tabs`               | `tab` (탭별)                               | `aria-selected`, 화살표로 이동, Home/End                      |
| `Text`               | `<div>`                                    | `aria-label` = 텍스트 콘텐츠                                  |

## 복합 위젯: 하나의 탭 정지, 내부 화살표 키

트리, 그리드, 메뉴, 라디오 그룹 또는 탭 목록은 모든 자식을 탭 순서에 넣어서는 안 됩니다. VectoJS는 각 **보이는** 자식 위에 투명한 포커스 가능 핫스팟을 풀링하여 해당 자식의 역할과 상태를 유지하고, 정확히 하나에 `tabIndex: 0` —— **루빙 tabindex** —— 를 부여합니다. 상위가 화살표 키 핸들러를 소유하고 정지를 이동합니다. 위의 표에서 각 구성 요소의 키를 확인하고, 직접 구축하는 경우 [복합 위젯](/reference/core-a11y/#composite-widgets-roving-tabindex)을 참조하세요.

그 패턴을 재사용하고 독자적으로 발명하지 마세요: 중요한 미묘한 점은 핫스팟이 아래쪽이 마우스를 소유하는 경우 (선택 가능한 셀 텍스트, 드래그로 스크롤, 캔버스 히트 처리) `pointerEvents: 'none'`을 설정해야 한다는 것입니다. 키보드 포커스와 AT 합성 `click`은 여전히 통과합니다.

탭 순서는 엔티티를 추가한 순서가 아니라 **시각적** 읽기 순서를 따릅니다. RTL UI의 경우 Scene에 `readingDirection: 'rtl'`을 설정하면 각 행의 인라인 순서도 반전됩니다.

## 강제 색상 (고대비 모드)

`<canvas>`는 불투명한 픽셀이므로 브라우저의 `forced-colors` 리매핑이 그린 것에 도달하지 못합니다 — 테마가 적용된 컨트롤은 저대비로 읽을 수 없게 됩니다. `scene.forcedColors`를 읽고 CSS 시스템 색상으로 그립니다. 씬은 OS 설정이 토글될 때 자동으로 다시 그립니다:

```typescript
render(r: IRenderer) {
  const forced = this.scene?.forcedColors ?? false;
  r.beginPath();
  r.roundRect(0, 0, this.width, this.height, 8);
  r.fill(forced ? 'ButtonFace' : this.bg);
  if (forced) r.stroke('ButtonText', 1);       // give the shape an edge
  r.fillText(this.label, x, y, this.font, forced ? 'ButtonText' : this.color);
}
```

`Button`은 이미 이것을 수행합니다. 선택/포커스에는 `Highlight`를, 서페이스와 본문 텍스트에는 `Canvas`/`CanvasText`를 사용하세요.

## IME-인식 입력 필드

`Input`과 `TextArea`는 텍스트 입력을 위해 **실제 투명 섀도 `<input>`/`<textarea>` 요소**를 사용합니다. 이는 다음을 의미합니다:

- IME 구성(중국어, 일본어, 한국어, 아랍어)이 기본적으로 작동합니다 — 브라우저가 후보 창을 처리합니다.
- 텍스트 선택, 클립보드(잘라내기/복사/붙여넣기), 실행취소/재실행이 모두 기본적으로 작동합니다.
- 캔버스는 **순수 시각적 미러**입니다: `change` 이벤트에서 `value`, `selectionStart`, `selectionEnd`, `composition`을 읽고 캐럿, 선택 강조, IME 밑줄을 그립니다.

입력이 포커스된 동안 동기화는 동일한 사용자-동기화 값을 다시 쓰지 않습니다. 애플리케이션 상태가 실질적으로 다른 값을 제공하면 적용됩니다; 따라서 제어되는 컴포넌트는 텍스트를 교체할 때 선택을 의도적으로 보존해야 합니다.

## 정적 콘텐츠 프로젝션

인터랙티브 컨트롤은 a11y 노드를 프로젝션합니다. 정적 콘텐츠 프로젝션은 비-인터랙티브 측면을 다룹니다: 정적 텍스트를 렌더링하는 엔티티는 `getContentProjection()`을 통해 이를 노출하고, Scene은 그려진 글리프 위에 **투명하고 위치-동기화된 DOM 노드**로 미러링합니다. 스크린 리더, Ctrl+F, 크롤러, 번역 확장 프로그램이 캔버스에 시각적으로 렌더링된 텍스트를 볼 수 있습니다.

```typescript
// Built-in: TextEntity and MSDFTextEntity expose content. Text, RichText,
// Markdown, fenced CodeBlock, and Table cell text are selectable by default.

// Custom entities opt in the same way:
class Caption extends Entity {
  label = 'Rendered on canvas, found by Ctrl+F';
  getContentProjection() {
    return { text: this.label, font: '16px sans-serif' };
  }
  // …render() draws the same string…
}
```

추가 노력 없이 가능해지는 것:

- **페이지 내 찾기** — Ctrl+F가 매칭; 브라우저의 강조 상자가 투명 글리프 뒤에 렌더링됩니다.
- **스크린 리더 및 크롤러**가 소스 순서로 실제 텍스트를 읽습니다.
- **번역 확장 프로그램 및 리더 모드**가 프로젝션된 레이어에서 작동합니다.
- **`#:~:text=`** 프래그먼트 링크가 해결됩니다.
- **네이티브 마우스 선택** — `selectable: true`로 커스텀 엔티티 옵트인 (`::selection` 강조가 투명 글리프 뒤에 그려짐). 핵심 프로젝션은 기본적으로 꺼져 있어 임의의 텍스트가 캔버스 입력을 가로채지 않습니다. UI Text/RichText/Markdown/Table 콘텐츠는 기본적으로 선택 가능하며 `setSelectable(boolean)`을 노출합니다.

픽셀 정확한 선택을 위해 Canvas 기준선을 진실의 소스로 취급하세요: 단일 실행에는 `baseline`(및 `contentX`/`contentY`)을, 래핑, 삽입 또는 혼합 크기 텍스트에는 명시적 시각적 `lines`를 사용하세요. Core 1.8은 이러한 로컬 좌표를 변환을 통해 매핑하고 모든 프로젝션된 실행에 동일한 CSS 라인 박스를 제공합니다. 논리적 소스가 줄바꿈이나 보존된 소프트 래핑 구분 기호로 끝나는 경우 시각적 행 뒤에 `separatorAfter`를 설정하세요. Scene은 해당 구분 기호를 행의 최종 텍스트 노드에 병합하여 Firefox가 여러 줄 선택의 일부를 프로젝션 루트에 배치하지 못하게 합니다. `text`는 권위 있는 논리적 유니코드 소스로 유지됩니다; 시핑된 시각적 글리프 순서로 대체하지 마세요. 페이지-레벨 CSS 오프셋으로 보정하지 마세요.

선택 가능한 일반 텍스트, 명시적 시각적 행, 줄-없는 커스텀 프로젝션은 변환된 2차원 지오메트리에서 적법한 그래핌 캐럿을 해결합니다. 회전, 미러 변환, 비균일 스케일, 분수 DPR, 브라우저 줌이 포인터 라우팅을 뷰포트 X로 축소하지 않습니다. 코드-유사 엔티티는 또한 Canvas 페인트와 `ContentProjection.grid` 간에 `prepareContentGrid()` 결과를 공유해야 합니다; 이렇게 하면 탭, 이모지/ZWJ, CJK 너비, 아랍어, bidi, 클립보드 소스, 선택 지오메트리가 동일한 유지된 계획에서 유지됩니다.

네이티브 `Input`/`TextArea` 구현의 경우 `getA11yAttributes()`를 통해 `textInputStyle: { font, lineHeight, padding }`을 노출하세요. Scene은 이를 `box-sizing: border-box`로 투명 편집기에 적용하며, 캔버스는 동일한 패딩과 라인-박스 기준선에서 그려야 합니다.

참고:

- 프로젝션은 **뷰포트- 및 클립-지연**입니다: Scene 또는 `clipChildren` 상위 요소를 완전히 벗어난 텍스트는 `display: none`이며 입력을 가로챌 수 없습니다.
- 동적 프로젝션은 VMT 소스 순서와 일치하도록 재정렬됩니다; 서브트리를 제거하면 모든 하위 프로젝션이 제거됩니다.
- 엔티티가 또한 `interactive`인 경우, 해당 텍스트 복사본은 `aria-hidden`이므로 스크린 리더가 두 번 읽지 않습니다.
- 순수 장식용 씬의 경우 `new Scene(canvas, { contentProjection: false })`로 전체 레이어를 비활성화하세요.
- 브라우저 찾기는 구체화된 콘텐츠만 다룹니다. 애플리케이션이 마운트하지 않은 가상화된 엔티티는 검색할 수 없습니다.
- 전역 단축키 라우터는 `window.getSelection()?.isCollapsed === false`일 때 네이티브 복사를 양보해야 하며, 애플리케이션이 의도적으로 브라우저 찾기를 대체하지 않는 한 Ctrl/Command+F를 억제해서는 안 됩니다.

## `debugA11y` 옵션

`SceneOptions`에서 `debugA11y: true`를 활성화하면 개발 중에 섀도 노드가 표시됩니다 — 파란색 점선 윤곽선으로 나타납니다:

```typescript
const scene = new Scene(canvas, { debugA11y: true });
```

브라우저 DevTools → Elements를 열면 캔버스 위에 위치한 실제 `<button>`, `<input>`, `<a>` 요소가 표시됩니다. 역할, 레이블, 위치가 올바른지 확인하는 가장 빠른 방법입니다.

## `a11yFullViewport` — 경계 없는 표면

일부 엔티티는 전체 Scene 뷰포트를 덮습니다(무한 캔버스, 제스처 인식기, 배경 클릭 트랩). 이들은 의미 있는 경계 상자가 없습니다. `a11yFullViewport = true`를 설정하여 Canvas CSS 박스를 따르는 Scene-크기 섀도 노드를 프로젝션하세요:

```typescript
class PanGesture extends Entity {
  constructor() {
    super();
    this.interactive = true;
    this.a11yFullViewport = true; // no width/height needed
  }

  getA11yAttributes() {
    return { role: 'application', label: 'Pan and zoom canvas' };
  }
}
```

전체-뷰포트 노드는 다른 모든 섀도 노드 **뒤에** 마운트되므로 위에 있는 컴포넌트(버튼, 입력)는 계속 클릭 가능합니다.

## `a11ySyncInterval` — 애니메이션 중 조절

기본적으로 섀도 DOM은 렌더링된 모든 프레임에서 동기화됩니다. 많은 인터랙티브 엔티티가 있는 무거운 애니메이션 UI의 경우 동기화가 프레임 시간을 지배할 수 있습니다. 조절하세요:

```typescript
const scene = new Scene(canvas, { a11ySyncInterval: 100 });
// Shadow DOM is updated at most once per 100ms during animation
```

애니메이션이 실행되는 동안 간격이 활성 상태로 유지되며, Scene은 보류 중인 모션이 안정된 후 최종 캐치업을 예약합니다. 애니메이션 전체 동안 시맨틱 레이어를 정지시키지 않습니다.

조절은 오래된 데이터와 비용을 교환하는 것이며, 동기화당 작업량을 줄이지 않습니다. 문제가 동기화 빈도가 아닌 엔티티 **수**라면 다음 섹션을 참조하세요.

## 인터랙티브 엔티티 수에 따라 비용이 초선형적으로 증가함

프로젝션은 UI에는 저렴하지만 대량에는 비용이 많이 듭니다. 실제 하드웨어에서 측정(RTX 4060 노트북, 엔티티는 매 프레임 이동, 각 엔티티에 하나의 투영 요소):

| 인터랙티브 엔티티 수 | Chrome 프레임당 | Firefox 프레임당 |
| -------------------- | --------------- | ---------------- |
| 1,000                | 6.4ms           | 7.4ms            |
| 5,000                | 59.5ms          | 114ms            |
| 20,000               | 715ms           | 2737ms           |

1,000에서 20,000으로 증가하면서 Chrome에서는 6.4→35.7µs, Firefox에서는 7.4→136.9µs로, 엔티티당 비용이 수가 증가함에 따라 **악화**됩니다. 그 이유는 비용이 요소별 DOM 쓰기와 읽기 순서 정렬, 그리고 브라우저 자체의 접근성 트리 재구축이며, 이 모두가 요소 수와 함께 저하되기 때문입니다. 트리 탐색 자체는 무시할 수 있습니다(~0.005µs/엔티티).

실용적인 규칙: `interactive = true`는 사용자가 상호작용하는 것에 사용합니다. 수천 개의 장식적이거나 일시적인 객체를 히트 테스트 가능하게 만드는 방법이 아닙니다.

파티클 필드, 단마쿠 레이어 또는 스프라이트 무리의 경우 다음 중 하나를 선호하세요:

- **컨테이너를 투영하고 멤버는 투영하지 마세요.** 전체 레이어에 하나의 인터랙티브 엔티티를 사용하고, `aria-label`로 집합적으로 설명하며(예: "5,000 파티클"), `scene.findEntityAt(x, y)`를 통해 직접 포인터 입력을 처리하세요 — 이는 엔티티가 `interactive`인지 여부와 관계없이 해결되므로 히트 테스트에 투영이 필요하지 않습니다.
- **도달 가능한 것만 투영하세요.** 가상화된 `TreeView`/`Table`이 사용하는 풀링 패턴은 데이터셋 전체가 아닌 보이는 행에 핫스팟 풀 크기를 맞추므로 투영이 O(뷰포트)로 유지됩니다. [복합 위젯](#복합 위젯——하나의 탭 정지점, 화살표 키 조작)을 참조하세요.
- **엔티티가 더 이상 작동 가능하지 않으면 `scene.detachA11y(entity)`를 호출하세요.** 다른 곳에서 누수 방지로 문서화되어 있지만, 이는 동일하게 비용 레버입니다: 프레임별 동기화는 생성 및 업데이트를 하지만 정리는 절대 하지 않습니다.

> 엔티티별 `a11yProjection` 모드(`'eager' | 'onDemand' | 'never'`)로, 호버/포커스 시에만 노드를 구체화하는 것이 설계되었지만 **아직 구현되지 않았습니다**. 이는 "스크린 리더가 있는지"를 키로 사용할 수 없음에 유의하세요 — 이는 설계상(W3C TAG 설계 원칙 2.7) 의도적으로 감지 불가능하며, AOM 가상 접근성 노드는 모든 엔진에서 개인정보 보호 이유로 차단되어 있습니다.

## 프로그래밍 방식으로 섀도 트리 검사

```typescript
// Get a nested snapshot of all projected shadow nodes
const tree = scene.getA11yTree();
// Returns: A11yTreeNode[] — { id, tag, role, label, value, children, ... }

// Get the actual HTMLElement for a specific entity
const el = scene.getA11yElement(entity.id);
el?.focus(); // programmatically focus a shadow node
```

## Playwright 통합

모든 인터랙티브 엔티티가 실제 DOM 요소를 프로젝션하므로 특별한 어댑터 없이 표준 Playwright 선택자가 작동합니다:

```typescript
import { test, expect } from '@playwright/test';

test('toggle switches physics engine', async ({ page }) => {
  await page.goto('/demos/nexus');

  // Works because Toggle projects a <div role="switch" aria-label="Physics">
  const toggle = page.getByRole('switch', { name: 'Physics' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
});

test('search input filters results', async ({ page }) => {
  await page.goto('/');

  // Input projects a real <input type="text" placeholder="Search…">
  await page.getByPlaceholder('Search…').fill('spring');
  await expect(page.getByRole('option')).toHaveCount(3);
});

test('button is keyboard accessible', async ({ page }) => {
  await page.goto('/demos/chat');

  // Tab to the button, press Enter
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
});
```

### `data-vecto-id`로 선택하기

각 섀도 노드는 `entity.id`와 동일한 `data-vecto-id` 속성을 가집니다. 레이블 텍스트 변경에도 안정적인 선택자의 경우:

```typescript
const entity = new Button('Submit');
entity.id = 'submit-btn'; // or set in constructor via super with id

// In Playwright:
await page.locator('[data-vecto-id="submit-btn"]').click();
```

## 스크린 리더 테스팅 체크리스트

- [ ] 모든 인터랙티브 엔티티에 `interactive = true`와 0이 아닌 박스가 있습니다.
- [ ] `getA11yAttributes()`가 의미 있는 `tag`와 `label`을 반환합니다.
- [ ] `Input`/`TextArea`에 `placeholder`가 있습니다 (`aria-label`으로 사용됨).
- [ ] `Checkbox`/`Toggle`의 `checked` 상태가 `getA11yAttributes()`에서 실시간으로 반영됩니다.
- [ ] `Slider`가 모든 렌더링에서 `valuemin`, `valuemax`, `value`를 설정합니다.
- [ ] `Card` 그룹은 논리적 영역을 나타낼 때 `label`을 가집니다.
- [ ] 탭 순서가 합리적입니다 (섀도 노드는 DOM 순서로 배치되며, 이는 추가 순서와 일치함).
- [ ] `scene.getA11yTree()`를 실행하고 출력을 검사하여 누락된 레이블을 찾습니다.
- [ ] `debugA11y: true`를 활성화하고 노드 위치가 캔버스 컴포넌트와 일치하는지 시각적으로 확인합니다.

## 문제 해결

### 섀도 노드 위치가 캔버스 컴포넌트와 오프셋이 있습니다

두 가지 일반적인 원인:

1. **Canvas 부모가 `position: relative`가 아님** — `Scene`이 매 프레임마다 자동으로 설정하지만, 더 높은 특이성으로 `position: static`을 강제하는 CSS 규칙이 이를 덮어씁니다. Canvas 부모 요소의 계산된 스타일을 확인하세요.
2. **Canvas 부모에 CSS `transform`이 있음** — 섀도 노드의 절대 위치는 가장 가까운 위치가 지정된 상위 요소를 기준으로 하지만, `transform`은 새로운 쌓임 맥락을 생성하여 오프셋을 유발할 수 있습니다. `transform`을 부모가 아닌 Canvas 요소 자체로 이동하세요.

이전에 `a11yOffsetX` / `a11yOffsetY`를 해결 방법으로 사용했다면 제거하고 대신 근본적인 위치 문제를 수정하세요.

### Playwright `getByRole()`이 아무것도 찾지 못합니다

다음을 확인하세요:

1. `entity.interactive`가 `true`이고 `entity.width > 0`이어야 합니다.
2. `getA11yAttributes()`가 올바른 `tag`와 `role`을 반환해야 합니다. `page.getByRole('button')`이 작동하려면 태그가 `'button'`이거나 역할이 `'button'`이어야 합니다.
3. 레이블이 일치해야 합니다: `page.getByRole('button', { name: 'Submit' })`는 속성에 `label: 'Submit'`이 필요합니다.
4. Scene이 `start()`를 호출했어야 합니다 — a11y 동기화는 렌더 루프 중에 발생합니다.

`scene.getA11yTree()`를 사용하여 현재 프로젝션된 내용의 스냅샷을 출력하세요:

```typescript
console.log(JSON.stringify(scene.getA11yTree(), null, 2));
```

### `scene.getA11yTree()`가 빈 배열을 반환합니다

a11y 트리는 `scene.start()`가 최소 한 프레임을 실행한 후에만 채워집니다. 생성 후 동기식으로 `getA11yTree()`를 호출하면 비어 있습니다. `setTimeout`으로 감싸거나 사용자 상호작용 후 확인하세요.

또한 `entity.interactive = true`가 설정되어 있는지 확인하세요 — `interactive`가 없는 엔티티는 절대 프로젝션되지 않습니다.

> **다음:** [UI 컴포넌트](/learn/ui-components/) — 즉시 사용 가능한 완전한 인터랙티브 컴포넌트 모음.
