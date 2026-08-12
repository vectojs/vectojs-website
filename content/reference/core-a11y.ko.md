+++
title = "a11yRoot 및 에이전트 계약"
description = "모든 대화형 Entity가 DOM에 투명한 ARIA 섀도우 노드를 투영하는 방법 — A11yAttributes 구조, 캔버스 성능 및 DOM 수준 접근성 계약, 그리고 오래되었거나 누락된 섀도우 노드를 유발하는 동기화 주의사항."
weight = 10
+++

# a11yRoot 및 에이전트 계약

[`@vectojs/core`](/reference/core-api/)의 일부입니다.

박스를 가진 모든 대화형 엔터티는 Scene의 `a11yRoot` div 안에 **투명한 ARIA 섀도우
노드**를 투영합니다(캔버스 위에 위치, `pointerEvents:auto`로
자동화/AT가 상호작용 가능; `debugA11y`가 아닌 이상 `opacity:0`). 각 노드는
`id` + `data-vecto-id`와
[`Entity.getA11yAttributes()`](/reference/core-entity/#a11y--배치-훅-오버라이드하여-옵트인)의
role/label/state를 전달합니다.

투영 루트는 캔버스 CSS 박스를 추적합니다: 캔버스 오프셋과 비균일 CSS
스케일링은 섀도우 및 DOM-포털 레이어에 적용되는 반면
엔터티 지오메트리는 논리적 Scene 좌표계에 그대로 유지됩니다. 캔버스의 임의 CSS 회전/기울이기는
이 매핑의 일부가 아닙니다.

`A11yAttributes`:

```ts
{
  // Element + identity
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea';   // 기본값 'div'
  role?: string;
  label?: string;                      // aria-label
  labelledby?: string;                 // aria-labelledby
  describedby?: string;                // aria-describedby

  // Focus & pointer
  tabIndex?: number;
  pointerEvents?: 'auto' | 'none';     // default 'auto'

  // Native element attributes (only for the matching `tag`)
  href?: string; target?: string;      // tag: 'a'
  src?: string; alt?: string;          // tag: 'img'
  inputType?: string; placeholder?: string; value?: string;
  textInputStyle?: TextInputStyle;     // native editor typography

  // State
  checked?: boolean; disabled?: boolean; selected?: boolean;
  expanded?: boolean; required?: boolean; invalid?: boolean;
  valuemin?: string; valuemax?: string;
  level?: number;                      // aria-level (headings, tree items)

  // Relationships & popups
  controls?: string; haspopup?: string; activedescendant?: string;
  ariaModal?: 'true' | 'false';        // aria-modal on a role="dialog"

  // Live regions
  live?: 'off' | 'polite' | 'assertive';
  atomic?: boolean;                    // aria-atomic
  relevant?: string;                   // aria-relevant
}
```

모든 필드는 매 프레임 더티 검사를 통해 실제 속성으로 투영됩니다. 필드에 `undefined`를 반환하면 속성이 **제거**되므로, 더 이상 적용되지 않는 상태는 오래되지 않고 사라집니다—`false`와 `undefined`는 여기서 구별된다는 점에 유의하세요(`aria-invalid="false"`는 "명시적으로 유효"하며 유지됩니다).

동기화는 이를 실제 엘리먼트(실제 `<button>`, `<a href>`, `<img>`,
`<input>`/`<textarea>` — IME 인식 `change`/`focus`/`blur` 등)에 적용합니다. 이것이 "**캔버스 성능 및 DOM 수준
접근성**" 스토리입니다: 시각적 요소는 100% GPU/캔버스이면서, Playwright/에이전트
`getByRole('button', { name })`은 섀도우 노드를 찾아 클릭할 수 있습니다.

## 포커스 순서

기본적으로 포커스가 불가능한 대화형 역할
(`button`, `switch`, `checkbox`, `link`, `slider`, …)은 `tabindex="0"`과
Enter/Space → `click`을 받습니다.

**복합 위젯은 다릅니다.** `tree`, `grid`, `menu`, `radiogroup` 또는
`tablist`는 자식당 하나의 탭 정지가 아니라 하나뿐입니다—따라서 자식은 **로빙 tabindex**를 사용합니다: 정확히 하나의 자식이 `tabIndex: 0`을 가지고 나머지는 `-1`이며, 화살표 키가 해당 정지를 이동합니다. [복합 위젯](#복합-위젯-로빙-tabindex)을 참조하세요.

탭 순서는 씬 그래프 삽입 순서가 아닌 **시각적** 읽기 순서를 따릅니다—RTL의 경우 [`Scene.readingDirection`](/reference/core-scene/#접근성-및-외관)을 참조하세요.

디자인 캔버스와 같은 비-컨트롤 영역이 순차적 포커스 순서에 진입하고
VMT `keydown` 이벤트를 수신해야 하는 경우 `tabIndex: 0`을 명시적으로 설정하세요. 프로그래매틱 포커스만
필요한 경우 `-1`을 사용하고, `undefined`를 반환하면 명시적 값을 제거합니다.

## 복합 위젯 (로빙 tabindex)

트리, 그리드, 메뉴, 라디오 그룹 또는 탭 목록은 컨테이너 역할뿐만 아니라 각 자식에 **하나의 역할**을 노출해야 합니다—그렇지 않으면 AT는 불투명한 상자만 보게 됩니다. VectoJS는 각 보이는 자식 위에 투명하고 포커스 가능한 자식 엔터티("핫스팟")를 풀링하여 이를 수행합니다: 자식의 `role` + 상태 + 로빙 `tabIndex`를 전달하고 아무것도 렌더링하지 않으며, 부모가 키보드 핸들러를 소유합니다.

중요한 것은 이 핫스팟들이 `pointerEvents: 'none'`을 설정한다는 점입니다. 하위 컴포넌트가 이미 마우스를 소유하고 있으므로(탭으로 전환, 드래그로 스크롤, 선택 가능한 셀 텍스트), 핫스팟이 이를 가로채서는 안 됩니다—키보드 포커스와 AT 합성 `click`은 `pointer-events:none` 요소를 통해 여전히 작동합니다.

| 컴포넌트      | 자식 역할                                                     | 키보드 조작                                                                                                                          |
| ------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `TreeView`    | `treeitem` (+ `aria-level`, `aria-expanded`, `aria-selected`) | Up/Down 이동 · Right 확장 후 진입 · Left 접은 후 부모로 이동 · Home/End · Enter/Space 활성화                                         |
| `Table`       | `row` › `gridcell` / `columnheader`                           | 화살표로 2D 이동 (헤더는 row −1) · Home/End 행 끝 · Ctrl+Home/Ctrl+End 그리드 모서리                                                 |
| `ContextMenu` | `menuitem` (+ `aria-haspopup`, `aria-expanded`)               | Up/Down 랩 및 구분자 + 비활성 건너뜀 · Home/End · Right 서브메뉴 열기 · Left 부모 메뉴로 돌아가기 · Enter/Space 활성화 · Escape 닫기 |
| `RadioGroup`  | `radio` (+ `aria-checked`)                                    | 화살표로 이동 및 선택 · Home/End · Space 선택                                                                                        |
| `Tabs`        | `tab` (+ `aria-selected`)                                     | 화살표로 이동 · Home/End · Space/Enter 활성화                                                                                        |

보이는 자식만 풀링되므로, 가상화된 `TreeView` 또는 `Table`은 데이터 세트의 각 행이 아닌 O(viewport)개의 핫스팟을 투영합니다. 포커스된 행/셀은 포커스가 이동하기 전에 뷰로 스크롤됩니다.

## 강제 색상 (고대비)

캔버스는 불투명한 픽셀이므로 브라우저의 `forced-colors` 리매핑은 VectoJS가 그리는 것에 절대 닿지 않습니다—Windows 고대비에서 컴포넌트가 자체를 다시 그리지 않는 한 테마가 적용된 컨트롤은 읽을 수 없게 됩니다. [`Scene.forcedColors`](/reference/core-scene/#접근성-및-외관)를 참조하고 CSS 시스템 색상(`ButtonFace`, `ButtonText`, `Highlight`, `Canvas`, `CanvasText`)으로 그리세요. 설정이 전환되면 씬이 자동으로 다시 그려집니다. `Button`은 이미 이를 수행하고 있습니다.

## 많은 entity 수에서의 투영 비용 (`1.30.0+`)

박스를 가진 상호작용 entity는 상호작용 상태를 유지하는 동안 섀도우 노드를 얻습니다. 이는 버튼에는 맞지만, 파티클, danmaku 댓글, 그래프 노드처럼 수천 개의 일시적이고 개별적으로는 의미가 없는 entity에는 틀렸습니다. 그런 경우에는 매 프레임마다 entity당 DOM 노드 하나가 생성됩니다.

움직이는 상호작용 entity 5,000개에서 측정:

|                              | Chrome        | Firefox        |
| ---------------------------- | ------------- | -------------- |
| 모든 entity가 상호작용       | 66.4 ms/frame | 114.7 ms/frame |
| `a11yProjection: 'onDemand'` | 2.23 ms       | 1.69 ms        |
| 섀도우 노드가 전혀 없음      | 1.35 ms       | 1.75 ms        |

eager인 두 행은 60 Hz 예산조차 맞추지 못합니다. `'onDemand'`는 아무것도 투영하지 않을 때의 하한에 도달하면서도, 모든 entity가 개별적으로 도달 가능한 상태로 남습니다.

`Entity.a11yProjection`은 노드가 언제 구체화되는지를 선택합니다:

```ts
particle.a11yProjection = 'onDemand';
```

- **`'eager'`** (기본값) — entity가 박스를 가지고 상호작용하는 동안 노드가 존재합니다. 동작은 그대로이며, 일반적인 컨트롤에는 손대지 마세요.
- **`'onDemand'`** — entity가 **사용 중**일 때만 노드가 존재합니다. 카디널리티가 높은 상호작용 entity에 사용하세요.
- **`'never'`** — 노드가 전혀 없습니다. entity가 의미론적 존재 없이 포인터 이벤트만 정말로 필요한 경우가 아니라면 `interactive = false`를 선호하세요.

### 무엇이 사용 중으로 간주되는가

세 가지 신호가 있고, 그중 하나만으로도 충분합니다. 의도적으로 호버 **단독**은 아닙니다: 키보드나 스크린 리더 사용자는 포인터 이벤트를 발생시키지 않으므로, 호버로 제어되는 노드는 정작 그것이 존재하는 이유인 사용자에게서 보류됩니다.

- **포커스.** 포커스된 노드는 절대 정리되지 않으므로, 상호작용 중에 포커스를 빼앗기지 않습니다.
- **포인터가 entity 내부에 있음.**
- **명시적 요청** — 아래를 참조하세요.

entity는 그 동안에도 canvas에서 히트 테스트가 가능한 상태로 남으므로, 클릭은 항상 그것에 도달해 승격시킵니다.

```ts
// Keep the selected item projected for as long as it is selected.
scene.requestA11yProjection(selected);
scene.releaseA11yProjection(previous);
```

둘 다 `Entity` 또는 id 문자열을 받으며 멱등입니다. 해제해도 노드가 즉시 제거되지는 않습니다 — 포커스되어 있거나 포인터 아래에 있는 동안에는 살아남고, 사용 중이 아님을 발견한 다음 동기화에서 정리됩니다. `'eager'` entity는 항상 투영되므로 둘 다 아무 동작도 하지 않습니다.

애플리케이션만이 중요성을 아는 것에는 명시적 요청을 사용하세요: 선택 항목, 검색 결과, 라이브 리전에서 방금 안내된 요소 등.

> [!IMPORTANT]
> 자체적으로 **선택 가능한 텍스트**를 투영하는 entity는 포인터로 승격되지 않습니다. 그 섀도우 노드는 `pointer-events: auto`를 가지고 투명한 텍스트 미러 위에 쌓이므로, 포인터 아래에서 노드를 구체화하면 `mousedown`을 삼켜 네이티브 드래그 선택이 시작되지 않습니다. 포커스와 명시적 요청은 여전히 도달합니다. 이는 [`Text`](/reference/ui-text/)와 `RichText`를 기본적으로 상호작용하지 않게 만드는 것과 같은 충돌입니다.

카디널리티만으로 `'onDemand'`를 택할 근거가 되지는 않으며, 다음 경우가 가장 잘못 판단되기 쉽습니다:

> [!WARNING]
> **파티클과의 유추로 `'onDemand'`를 본문 텍스트에 적용하지 마세요.** 버튼이나 그래프 노드에서는 canvas entity가 주체이고 섀도우 노드는 일시적인 의미론적 프록시이므로, 사용될 때까지 보류해도 잃는 것이 없습니다. 그러나 산문, Markdown, 채팅 기록에서는 canvas 비트맵을 스크린 리더가 전혀 읽을 수 없으며, 비시각 사용자에게 **읽기가 주된 상호작용**이지 이따금 하는 조작이 아닙니다. 텍스트 entity는 기본적으로 상호작용하지 않으며, 그 의미를 담는 것은 섀도우 노드가 아니라 [콘텐츠 투영](/reference/core-renderer/#entitygetcontentprojection)입니다. 그 투영은 행 단위로 가상화되며 상주 상태를 유지합니다.

또한 개별적으로 도달할 수 있다는 것은 이해할 수 있다는 것과 같지 않습니다:

> [!NOTE]
> `'onDemand'`만으로는 완전한 접근성 이야기가 되지 않습니다. 개별적으로 도달 가능한 danmaku 천 개도 모아 놓으면 여전히 아무것도 말해주지 않습니다. 하나의 집계된 라이브 리전(`role: 'status'`, `a11yFullViewport`)과 현재 선택을 위한 작은 상주 핫스팟 풀을 함께 사용해, DOM 노드 수가 entity 수에 따라 늘어나지 않고 일정하게 유지되도록 하세요.

## 컨트롤 및 주의사항

- 각 섀도우 노드의 `data-vecto-id`는 엔터티 `id`를 반영합니다 — 자동화 셀렉터를 위한
  안정적인 핸들입니다.
- `a11ySyncInterval` ([`SceneOptions`](/reference/core-scene/#sceneoptions) 참조)은
  애니메이션 중 동기화를 스로틀링하고 보류 중인
  모션이 안정된 후 최종 캐치업을 보장합니다; 전체 애니메이션 동안 모든 동기화를 중단하지는 않습니다.
- `debugA11y: true`는 개발용으로 노드(파란색 점선)를 표시합니다.
- `detachA11y(entity)`는 엔터티를 제거하지 않고 하위 트리의 섀도우 노드를 정리합니다;
  `remove()`는 자동으로 정리합니다. 프레임별 동기화는 **생성/업데이트는 하지만
  정리하지 않으므로**, 대화형 자식의 변경을 명시적으로 관리하세요.
- `getA11yTree()`는 중첩된 `A11yTreeNode[]` 스냅샷을 반환하여
  어설션에 사용할 수 있습니다; `getA11yElement(id)`는 특정 섀도우 엘리먼트를 가져옵니다.
- `a11yFullViewport`는 다른 모든 노드 뒤에 경계 없는 상호작용 표면을 마운트합니다.
- Core 1.11.1부터 새로 투영된 대화형 엔터티는 shadow node가 생성되는 동일한 프레임에서 Canvas 페인트 순서에 맞는 `z-index`를 받습니다. 따라서 새 오버레이의 backdrop은 다음 렌더 패스를 기다리지 않고 첫 포인터 상호작용부터 기존 디자인 컨트롤 위에 놓입니다.

사용법 및 테스트 패턴은 [Accessibility](/learn/accessibility/)를 참조하세요.

## URL 살균 (`sanitizeUrl` / `isSafeUrl`)

두 헬퍼 모두 `@vectojs/core`(`renderer/url.ts`에 정의)에서 제공되며, VectoJS가 `href`를 섀도우 `<a>` 노드에 투영하거나 이를 `window.open`에 전달할 때(접근성 sink와 Markdown 링크 렌더링에 사용됨) `javascript:` / `data:` / `vbscript:` / `file:` URI 스크립트 주입을 막기 위해 존재합니다.

```ts
sanitizeUrl(href: string | null | undefined): string
isSafeUrl(urlStr: string): boolean
```

`sanitizeUrl`은 투영 경로입니다: `null`/`undefined`에 대해 `''`을 반환하고, 선행 공백을 제거하며, **상대** URL을 그대로 통과시키고(상대 URL은 절대 스크립트로 주입될 수 없음), 스킴이 안전한 집합 — `http`, `https`, `mailto`, `tel`, `ftp` — 에 없는 절대 URL을 무해한 `'#'`로 다시 써서 링크가 비어 있지 않으면서도 비활성 상태를 유지하게 합니다. 절대 예외를 던지지 않습니다.

`isSafeUrl`은 이미 절대 URL을 보유한 코드를 위한 더 좁은 가드입니다: 스킴이 안전한 집합에 있으면(상대 URL도 안전함) `true`를, 그렇지 않으면 `false`를 반환합니다.

안전한 스킴은 고정되어 있습니다: `http:`, `https:`, `mailto:`, `tel:`, `ftp:`. `ui-link`와 Markdown 링크 콜백은 모두 `href`가 DOM에 도달하기 전에 `sanitizeUrl`을 통과시킵니다 — 신뢰할 수 없는 링크를 직접 렌더링한다면, 같은 방식으로 처리하세요.

## 관련 항목

[`Scene`](/reference/core-scene/) (`a11ySyncInterval`, `debugA11y`) ·
[`Entity`](/reference/core-entity/) (`getA11yAttributes()`, `interactive`, `width`/`height`) ·
[`@vectojs/core` 개요](/reference/core-api/)
