+++
title = "UI 컴포넌트"
description = "@vectojs/ui 컴포넌트 라이브러리 개요: 폼, 레이아웃 컨테이너, 오버레이, 리치 콘텐츠"
weight = 16

[extra]
order = 16
+++

# UI 컴포넌트

`@vectojs/ui` 패키지는 `@vectojs/core` 위에 구축된 즉시 사용 가능한 프로덕션 품질의 컴포넌트 세트를 제공합니다. 모든 컴포넌트는 캔버스에서 완전히 렌더링되며, 접근성은 자동 A11y 섀도우 DOM 레이어를 통해 제공됩니다.

## 모든 컴포넌트는 `UIComponent`를 확장합니다

<figure>
  <img src="/images/entity-hierarchy.svg" alt="모든 내장 UI 컴포넌트를 보여주는 Entity 클래스 계층 구조" class="diagram" />
  <figcaption>모든 컴포넌트는 Entity로부터 위치, 스케일, 회전, animate(), 그리고 전체 이벤트 시스템을 상속받습니다.</figcaption>
</figure>

`UIComponent`는 `Entity`를 확장하고 공유 박스 모델과 AABB 히트 테스트를 추가합니다. 모든 상속된 속성(`x`, `y`, `width`, `height`, `opacity`, `interactive`, `animate`, `on`/`off`)은 모든 컴포넌트에서 작동합니다.

> **`interactive` 관련 참고:** 대부분의 폼 컴포넌트(`Button`, `Input`, `Text` 등)는 생성자에서 `this.interactive = true`를 설정합니다. `Card`는 기본적으로 장식용입니다 — `label` 옵션을 전달할 때만 인터랙티브가 됩니다.

## 레이아웃 컨테이너

### `Stack`

플렉스박스와 유사한 컨테이너 — 자식을 기본 축을 따라 순차적으로 배치합니다:

```typescript
import { Stack } from '@vectojs/ui';
import { Button, Text } from '@vectojs/ui';

const col = new Stack({ direction: 'vertical', gap: 12 });
col.add(new Text('Hello'));
col.add(new Button('Click me'));
scene.add(col.setPosition(40, 40));
```

`direction`, `gap`, `align`(교차축), 선택적 `wrap`과 `maxWidth`/`maxHeight`를 지원합니다.

### `Flow`

`direction: 'horizontal', wrap: true`로 미리 구성된 `Stack`입니다 — 칩 행과 태그 클라우드용:

```typescript
import { Flow } from '@vectojs/ui';

const tags = new Flow({ gap: 8, maxWidth: 400 });
for (const label of ['TypeScript', 'WebGPU', 'Canvas']) {
  tags.add(new Button(label, { bg: '#1e293b', padding: 6 }));
}
scene.add(tags.setPosition(20, 20));
```

### `Card`

둥근 배경 패널입니다 — 그 위에 자식을 추가하세요:

```typescript
import { Card } from '@vectojs/ui';

const card = new Card({
  width: 300,
  height: 200,
  bg: 'rgba(15, 23, 42, 0.8)',
  border: 'rgba(255, 255, 255, 0.1)',
  radius: 16,
  label: 'Settings panel', // 인터랙티브로 만들고 role="group" 설정
});
card.add(toggle.setPosition(24, 24));
scene.add(card.setPosition(100, 100));
```

### `ResizablePanel`

중첩된 리사이즈 분할(가로 및 세로 모두)을 허용하는 분할 패널 레이아웃 시스템:

```typescript
import { PanelGroup, Panel, PanelResizeHandle } from '@vectojs/ui';

const group = new PanelGroup({ direction: 'horizontal', width: 600, height: 400 });
const leftPanel = new Panel({ minSize: 100, defaultSize: 0.3 });
const rightPanel = new Panel({ minSize: 150 });

group.addPanel(leftPanel);
group.addPanel(rightPanel);
scene.add(group);
```

## 폼 컨트롤

모든 폼 컨트롤은 실제 투명한 섀도우 DOM 노드를 프로젝션합니다. 에이전트와 스크린 리더는 이러한 네이티브 요소를 통해 상호작용하고, 캔버스는 시각적 요소를 렌더링합니다. 모든 폼 컨트롤은 표준화된 `change` 이벤트 바인딩과 `onChange` 콜백 실행을 가지고 있습니다.

### `Button`

```typescript
import { Button } from '@vectojs/ui';

const btn = new Button('Save', {
  bg: '#2563eb',
  hoverBg: '#3b82f6',
  onClick: () => save(),
});
scene.add(btn.setPosition(20, 20));
```

라벨에 따라 자동 크기 조정. `<button>` 프로젝션 → `getByRole('button', { name: 'Save' })`.

### `Input` (한 줄)

```typescript
import { Input } from '@vectojs/ui';

const input = new Input({
  width: 300,
  placeholder: 'Search…',
  onChange: (value) => console.log(value),
});
scene.add(input.setPosition(20, 80));
```

**실제 투명 `<input>`** 으로 백업됩니다 — 브라우저가 모든 타이핑, IME, 클립보드, 실행 취소를 네이티브로 처리합니다. 캔버스는 시각적 요소만 그립니다. IME 입력 중 밑줄, 커서 깜빡임, RTL 선택이 모두 렌더링됩니다.

### `TextArea` (여러 줄)

`Input`과 동일한 모델로, `<textarea>`로 백업됩니다. `lineHeight`, 수직 스크롤-투-캐럿, 캐럿-투-라인 매핑을 위한 `lineOfOffset(offset)`을 지원합니다.

### `Toggle`

```typescript
import { Toggle } from '@vectojs/ui';

const toggle = new Toggle({
  label: 'Dark mode',
  checked: false,
  accent: '#6366f1',
  onChange: (checked) => applyTheme(checked),
});
```

`role="switch"`와 `aria-checked`를 프로젝션합니다. 캔버스 클릭과 키보드 활성화 모두 `onChange` 콜백을 통해 라우팅됩니다.

### `Checkbox`

```typescript
import { Checkbox } from '@vectojs/ui';

const cb = new Checkbox({
  label: 'Subscribe to updates',
  checked: true,
  accent: '#2563eb',
  onChange: (checked) => setSubscribed(checked),
});
```

`<input type="checkbox">`로 백업됩니다 — 키보드와 보조 기술로 네이티브하게 토글 가능합니다.

### `RadioGroup`

상호 배타적인 옵션 선택을 레이블이 있는 원으로 렌더링합니다. 키보드 탐색(화살표 키로 옵션 순환)을 지원하고 선택 시 `onChange` 콜백을 실행합니다.

```typescript
import { RadioGroup } from '@vectojs/ui';

const radio = new RadioGroup({
  options: [
    { value: 'light', label: 'Light Mode' },
    { value: 'dark', label: 'Dark Mode', disabled: false },
    { value: 'system', label: 'System Default' },
  ],
  value: 'dark', // 초기 선택 값
  gap: 28, // 옵션 간 세로 간격, 기본값 28
  color: '#e2e8f0', // 라벨 텍스트 색상
  accent: '#00f0ff', // 선택된 원의 채움색
  onChange: (val) => setTheme(val),
});
scene.add(radio.setPosition(40, 40));
```

주요 옵션:

| 옵션       | 타입                  | 기본값      | 설명                               |
| ---------- | --------------------- | ----------- | ---------------------------------- |
| `options`  | `RadioOption[]`       | —           | `{ value, label, disabled? }` 배열 |
| `value`    | `string`              | `''`        | 초기에 선택된 값                   |
| `gap`      | `number`              | `28`        | 행 간 세로 간격                    |
| `accent`   | `string`              | `'#00f0ff'` | 선택된 원의 채움색                 |
| `onChange` | `(v: string) => void` | —           | 선택 변경 시 콜백                  |

`radio.setValue(val)`를 언제든지 호출하여 프로그래밍 방식으로 선택을 변경할 수 있습니다. `role="radiogroup"`과 각 옵션의 `role="radio"` + `aria-checked`를 프로젝션합니다.

### `Tabs`

탭이 있는 패널 컨테이너 — 가로 탭 막대를 렌더링하고 활성 창의 `Entity`만 Scene에 마운트합니다. 탭 전환은 이전 창을 언마운트하고 다음 창을 마운트하여 VMT를 최소로 유지합니다.

```typescript
import { Tabs } from '@vectojs/ui';

const settingsPane = new Stack({ direction: 'vertical', gap: 12 });
const previewPane = new Stack({ direction: 'vertical', gap: 12 });

const tabs = new Tabs({
  width: 500,
  height: 360,
  tabs: [
    { id: 'settings', label: 'Settings', content: settingsPane },
    { id: 'preview', label: 'Preview', content: previewPane },
  ],
  activeTabId: 'settings', // 기본값: 첫 번째 탭
  tabHeight: 36, // 탭 막대 높이, 기본값 36
  selectedColor: '#00f0ff', // 활성 탭 밑줄 / 텍스트 색상
  onChange: (tabId) => console.log('Active tab:', tabId),
});
scene.add(tabs.setPosition(20, 20));

// 프로그래밍 방식으로 탭 전환:
tabs.setActiveTab('preview');
```

주요 옵션:

| 옵션            | 타입                   | 기본값      | 설명                             |
| --------------- | ---------------------- | ----------- | -------------------------------- |
| `tabs`          | `TabItem[]`            | —           | `{ id, label, content: Entity }` |
| `activeTabId`   | `string`               | 첫 번째 탭  | 초기에 보이는 탭                 |
| `tabHeight`     | `number`               | `36`        | 탭 막대 행의 픽셀 높이           |
| `selectedColor` | `string`               | `'#00f0ff'` | 활성 탭 강조 색상                |
| `onChange`      | `(id: string) => void` | —           | 탭 전환 시 실행                  |

막대에는 `role="tablist"`, 각 버튼에는 `role="tab"` + `aria-selected`를 프로젝션합니다. 콘텐츠 영역은 `role="tabpanel"`을 받습니다.

### `Slider`

```typescript
import { Slider } from '@vectojs/ui';

const slider = new Slider({ min: 0, max: 100, value: 50, width: 200 });
slider.on('change', (e) => console.log(e.value));
```

드래그 가능한 썸(thumb); 값은 가장 가까운 정수로 반올림됩니다. `role="slider"`를 프로젝션합니다.

### `Dropdown`

```typescript
import { Dropdown } from '@vectojs/ui';

const dd = new Dropdown(['Small', 'Medium', 'Large'], { value: 'Medium' });
dd.on('change', (e) => setSize(e.value));
scene.add(dd.setPosition(20, 160));
```

`scene.showOverlay()`를 통해 떠다니는 오버레이 메뉴를 엽니다. 선택 또는 Escape 키로 닫힙니다. 완전한 ARIA 콤보박스/리스트박스 와이어링이 적용됩니다.

## 텍스트 및 타이포그래피

### `Text`

콜드/핫 레이아웃 분할이 있는 줄 바꿈 다중 행 텍스트:

```typescript
import { Text } from '@vectojs/ui';

const label = new Text('Hello, VectoJS!', {
  font: '600 18px "Outfit", sans-serif',
  color: '#e2e8f0',
  maxWidth: 400,
  lineHeight: 28,
});
```

- `setText(text)` — 재측정 (콜드 패스).
- `append(text)` — 스트리밍 경로; 변경된 마지막 문단만 재측정.
- `setMaxWidth(w)` — 리플로우만, 재측정 없음 (핫 패스).

### `RichText`

볼드/이탤릭/색상/크기 실행, 링크 핫스팟, 제외 도형이 있는 다중 스타일 인라인 텍스트:

```typescript
import { RichText } from '@vectojs/ui';

const rich = new RichText(
  [
    { text: 'Zero DOM, ' },
    { text: 'accessible', style: { bold: true, color: '#38bdf8' } },
    { text: ' and agent-native.' },
  ],
  { maxWidth: 500 },
);
```

스트리밍용: `appendSpans(newSpans)` 사용 — O(변경된 문단).

## 오버레이 및 뷰포트

### `Overlay`

절대 위치 지정 오버레이를 위한 기본 클래스. 대상 엔티티 기준으로 부동 콘텐츠를 고정하며, 자동 뷰포트 충돌 감지 및 방향 전환 기능을 제공합니다:

```typescript
import { Overlay } from '@vectojs/ui';

const overlay = new Overlay({
  target: button,
  content: popoverCard,
  placement: 'bottom-start',
});
```

### `Tooltip`

대상 엔티티 기준으로 고정된 호버 트리거 레이블:

```typescript
import { Tooltip } from '@vectojs/ui';

const tooltip = new Tooltip({
  target: helpIcon,
  content: 'More information',
  delay: 200,
});
```

### `Popover`

임의의 자식 레이아웃 콘텐츠를 포함하는 클릭 트리거 오버레이:

```typescript
import { Popover } from '@vectojs/ui';

const popover = new Popover({
  target: settingsButton,
  width: 200,
  height: 150,
});
```

### `ContextMenu`

키보드 단축키, 아이콘, 구분선, 중첩 하위 메뉴를 지원하는 우클릭 트리거 메뉴:

```typescript
import { ContextMenu } from '@vectojs/ui';

const menu = new ContextMenu({
  items: [
    { label: 'Undo', shortcut: 'Ctrl+Z', onClick: () => undo() },
    { separator: true },
    { label: 'Settings', children: [{ label: 'Export', onClick: () => export() }] }
  ]
});
scene.add(menu);
```

### `VirtualList`

뷰포트에 있는 요소만 렌더링하는 고성능 목록 컨테이너로, 고정 및 가변 행 높이를 지원합니다:

```typescript
import { VirtualList } from '@vectojs/ui';

const list = new VirtualList({
  width: 300,
  height: 500,
  itemHeight: (idx) => measuredHeights[idx], // 또는 고정 높이의 경우 number
  itemRenderer: (idx) => createListItemEntity(idx),
});
```

### `TreeView`

디렉토리 스타일 트리 노드 탐색기. 노드 확장 시 하위 항목을 비동기적으로 지연 로딩하는 것을 지원합니다:

```typescript
import { TreeView } from '@vectojs/ui';

const tree = new TreeView({
  nodes: [
    {
      id: 'src',
      label: 'src',
      children: async () => [{ id: 'index.ts', label: 'index.ts' }],
    },
  ],
});
```

### `Modal`

```typescript
import { Modal } from '@vectojs/ui';

const modal = new Modal('Confirm Delete', {
  modalWidth: 420,
  modalHeight: 200,
});
scene.showOverlay(modal);

// 내부에서: modal.close()가 애니메이션 후 자체 제거합니다.
```

스프링 애니메이션 스케일-인. 내장 닫기 버튼이 포함되어 있습니다.

### `ScrollView`

스프링 물리 스크롤이 있는 클리핑된 뷰포트:

```typescript
import { ScrollView } from '@vectojs/ui';

const feed = new ScrollView({ width: 360, height: 600 });
for (const item of items) feed.add(new Card({ ... }));
scene.add(feed.setPosition(20, 20));
feed.scrollToBottom();  // 예: 채팅 로그용
```

휠, 터치 드래그, 프로그래밍 방식 `scrollTo(y)`가 모두 지원됩니다.

## 리치 콘텐츠

### `Markdown`

Markdown 문자열을 VMT 서브트리로 렌더링합니다 — 제목, 문단, 구문 강조가 포함된 코드 블록, 표, 인용문, 링크, 인라인 서식:

```typescript
import { Markdown } from '@vectojs/markdown';

const doc = new Markdown('## Hello\n\nThis is **bold** and `code`.', {
  maxWidth: 700,
});
scene.add(doc.setPosition(40, 40));
```

LLM 스트리밍의 경우 `appendMarkdown(chunk)`를 사용하세요 — 전체 소스를 다시 렉싱(re-lex)한 후, 토큰을 비교(diff)하고 변경되지 않은 렌더링된 접두사를 재사용하여 모든 엔티티를 재구축하지 않습니다.

```typescript
const md = new Markdown('', { maxWidth: 600 });
scene.add(md);
for await (const token of llmStream) {
  md.appendMarkdown(token);
}
```

### `ProgressBar`

읽기 전용 진행 표시기 — 둥근 트랙 배경과 `value`에 비례하는 채워진 강조 막대를 렌더링합니다. 선택적으로 중앙에 백분율 레이블을 표시합니다.

```typescript
import { ProgressBar } from '@vectojs/ui';

const progress = new ProgressBar({
  value: 0.45, // 0–1 분수
  width: 300,
  height: 16,
  showText: true, // 중앙에 '45%' 렌더링
  accent: '#00f0ff', // 채움색
});
scene.add(progress.setPosition(40, 40));

// 비동기 작업 중 업데이트:
for await (const chunk of stream) {
  progress.setValue(bytesReceived / totalBytes);
}
```

주요 옵션:

| 옵션       | 타입      | 기본값                    | 설명                |
| ---------- | --------- | ------------------------- | ------------------- |
| `value`    | `number`  | —                         | 진행 분수 `0`–`1`   |
| `width`    | `number`  | `200`                     | 전체 트랙 너비      |
| `height`   | `number`  | `16`                      | 트랙 높이           |
| `radius`   | `number`  | `8`                       | 모서리 반경         |
| `bg`       | `string`  | `'rgba(255,255,255,0.1)'` | 트랙 배경           |
| `accent`   | `string`  | `'#00f0ff'`               | 채워진 막대 색상    |
| `showText` | `boolean` | `false`                   | `"45%"` 레이블 표시 |

`progress.setValue(fraction)`을 호출하여 업데이트 — 값은 `[0, 1]`로 고정되며 실제로 값이 변경될 때만 다시 그리기가 트리거됩니다. `role="progressbar"`와 반올림된 백분율로 설정된 `aria-valuenow`를 프로젝션합니다.

<figure>
  <img src="/images/component-gallery.svg" alt="Button, Text, Input, Card, ScrollView, Slider, Toggle, Checkbox, Dropdown을 보여주는 VectoJS 컴포넌트 갤러리" class="diagram" />
  <figcaption>모든 컴포넌트는 캔버스에서 완전히 렌더링됩니다. 섀도우 DOM 노드(투명)는 네이티브 접근성 및 자동화 지원을 제공합니다.</figcaption>
</figure>

전체 옵션 시그니처는 [UI Components 참조](/reference/ui-components/)를 참조하세요.
