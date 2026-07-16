---
title: 'UI Components'
description: 'Overview of the @vectojs/ui component library: forms, layout containers, overlays, and rich content.'
order: 16
---

# UI Components

The `@vectojs/ui` package provides a set of ready-to-use, production-quality components built on top of `@vectojs/core`. Every component renders entirely on canvas; accessibility comes from the automatic A11y shadow DOM layer.

## All Components Extend `UIComponent`

<figure>
  <img src="/images/entity-hierarchy.svg" alt="Entity class hierarchy showing all built-in UI components" class="diagram" />
  <figcaption>Every component inherits position, scale, rotation, animate(), and the full event system from Entity.</figcaption>
</figure>

`UIComponent` extends `Entity` and adds a shared box model with AABB hit-testing. All inherited props (`x`, `y`, `width`, `height`, `opacity`, `interactive`, `animate`, `on`/`off`) work on every component.

> **Note on `interactive`:** Most form components (`Button`, `Input`, `Text`, etc.) set `this.interactive = true` in their constructors. `Card` is decorative by default — it becomes interactive only when you pass a `label` option.

## Layout Containers

### `Stack`

A flexbox-like container — positions children sequentially along a main axis:

```typescript
import { Stack } from '@vectojs/ui';
import { Button, Text } from '@vectojs/ui';

const col = new Stack({ direction: 'vertical', gap: 12 });
col.add(new Text('Hello'));
col.add(new Button('Click me'));
scene.add(col.setPosition(40, 40));
```

Supports `direction`, `gap`, `align` (cross-axis), and optional `wrap` with `maxWidth`/`maxHeight`.

### `Flow`

A `Stack` pre-wired as `{ direction: 'horizontal', wrap: true }` — for chip rows and tag clouds:

```typescript
import { Flow } from '@vectojs/ui';

const tags = new Flow({ gap: 8, maxWidth: 400 });
for (const label of ['TypeScript', 'WebGPU', 'Canvas']) {
  tags.add(new Button(label, { bg: '#1e293b', padding: 6 }));
}
scene.add(tags.setPosition(20, 20));
```

### `Card`

A rounded background panel — add children on top:

```typescript
import { Card } from '@vectojs/ui';

const card = new Card({
  width: 300,
  height: 200,
  bg: 'rgba(15, 23, 42, 0.8)',
  border: 'rgba(255, 255, 255, 0.1)',
  radius: 16,
  label: 'Settings panel', // makes it interactive + role="group"
});
card.add(toggle.setPosition(24, 24));
scene.add(card.setPosition(100, 100));
```

### `ResizablePanel`

A split-panel layout system allowing nested resizing splits (both horizontal and vertical):

```typescript
import { PanelGroup, Panel, PanelResizeHandle } from '@vectojs/ui';

const group = new PanelGroup({ direction: 'horizontal', width: 600, height: 400 });
const leftPanel = new Panel({ minSize: 100, defaultSize: 0.3 });
const rightPanel = new Panel({ minSize: 150 });

group.addPanel(leftPanel);
group.addPanel(rightPanel);
scene.add(group);
```

## Form Controls

All form controls project a real, transparent shadow DOM node. Agents and screen readers interact through those native elements; the canvas renders the visuals. All form controls have standardized `change` event binding and `onChange` callback execution.

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

Auto-sizes to label. Projects `<button>` → `getByRole('button', { name: 'Save' })`.

### `Input` (single-line)

```typescript
import { Input } from '@vectojs/ui';

const input = new Input({
  width: 300,
  placeholder: 'Search…',
  onChange: (value) => console.log(value),
});
scene.add(input.setPosition(20, 80));
```

Backed by a **real transparent `<input>`** — the browser handles all typing, IME, clipboard, and undo natively. The canvas only draws the visual. IME composition underlines, caret blink, and RTL selection are all rendered.

### `TextArea` (multi-line)

Same model as `Input`, backed by a `<textarea>`. Supports `lineHeight`, vertical scroll-to-caret, and `lineOfOffset(offset)` for caret-to-line mapping.

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

Projects `role="switch"` with `aria-checked`. Both canvas clicks and keyboard activation route through the `onChange` callback.

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

Backed by `<input type="checkbox">` — natively toggleable by keyboard and assistive tech.

### `RadioGroup`

Mutually exclusive option selections rendered as labeled circles. Supports keyboard navigation (arrow keys cycle options) and fires an `onChange` callback on selection.

```typescript
import { RadioGroup } from '@vectojs/ui';

const radio = new RadioGroup({
  options: [
    { value: 'light', label: 'Light Mode' },
    { value: 'dark', label: 'Dark Mode', disabled: false },
    { value: 'system', label: 'System Default' },
  ],
  value: 'dark', // initially selected value
  gap: 28, // vertical spacing between options, default 28
  color: '#e2e8f0', // label text color
  accent: '#00f0ff', // fill color for the selected circle
  onChange: (val) => setTheme(val),
});
scene.add(radio.setPosition(40, 40));
```

Key options:

| Option     | Type                  | Default     | Description                            |
| ---------- | --------------------- | ----------- | -------------------------------------- |
| `options`  | `RadioOption[]`       | —           | Array of `{ value, label, disabled? }` |
| `value`    | `string`              | `''`        | Initially selected value               |
| `gap`      | `number`              | `28`        | Vertical gap between rows              |
| `accent`   | `string`              | `'#00f0ff'` | Selected circle fill                   |
| `onChange` | `(v: string) => void` | —           | Callback on selection change           |

Call `radio.setValue(val)` at any time to programmatically change the selection. Projects `role="radiogroup"` with individual `role="radio"` + `aria-checked` on each option.

### `Tabs`

A tabbed panel container — renders a horizontal tab bar and mounts only the active pane's `Entity` into the scene. Switching tabs unmounts the previous pane and mounts the next, keeping the VMT minimal.

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
  activeTabId: 'settings', // default: first tab
  tabHeight: 36, // height of the tab bar, default 36
  selectedColor: '#00f0ff', // active tab underline / text color
  onChange: (tabId) => console.log('Active tab:', tabId),
});
scene.add(tabs.setPosition(20, 20));

// Switch tab programmatically:
tabs.setActiveTab('preview');
```

Key options:

| Option          | Type                   | Default     | Description                      |
| --------------- | ---------------------- | ----------- | -------------------------------- |
| `tabs`          | `TabItem[]`            | —           | `{ id, label, content: Entity }` |
| `activeTabId`   | `string`               | first tab   | Initially visible tab            |
| `tabHeight`     | `number`               | `36`        | Pixel height of the bar row      |
| `selectedColor` | `string`               | `'#00f0ff'` | Active tab accent color          |
| `onChange`      | `(id: string) => void` | —           | Fires on tab switch              |

Projects `role="tablist"` on the bar and `role="tab"` + `aria-selected` on each button. The content area gets `role="tabpanel"`.

### `Slider`

```typescript
import { Slider } from '@vectojs/ui';

const slider = new Slider({ min: 0, max: 100, value: 50, width: 200 });
slider.on('change', (e) => console.log(e.value));
```

Draggable thumb; value rounded to nearest integer. Projects `role="slider"`.

### `Dropdown`

```typescript
import { Dropdown } from '@vectojs/ui';

const dd = new Dropdown(['Small', 'Medium', 'Large'], { value: 'Medium' });
dd.on('change', (e) => setSize(e.value));
scene.add(dd.setPosition(20, 160));
```

Opens a floating overlay menu via `scene.showOverlay()`; closes on selection or Escape. Full ARIA combobox/listbox wiring.

## Text & Typography

### `Text`

Wrapping multi-line text with a cold/hot layout split:

```typescript
import { Text } from '@vectojs/ui';

const label = new Text('Hello, VectoJS!', {
  font: '600 18px "Outfit", sans-serif',
  color: '#e2e8f0',
  maxWidth: 400,
  lineHeight: 28,
});
```

- `setText(text)` — re-measures (cold pass).
- `append(text)` — streaming path; only re-measures the changed last paragraph.
- `setMaxWidth(w)` — reflow only, no re-measure (hot pass).

### `RichText`

Multi-style inline text with bold/italic/color/size runs, link hotspots, and exclusion shapes:

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

For streaming: use `appendSpans(newSpans)` — O(changed paragraph).

## Overlays & Viewports

### `Overlay`

Base class for absolute positioning overlays. Anchors floating content relative to target entities with automatic viewport collision detection and directional flipping:

```typescript
import { Overlay } from '@vectojs/ui';

const overlay = new Overlay({
  target: button,
  content: popoverCard,
  placement: 'bottom-start',
});
```

### `Tooltip`

Hover-triggered labels anchored relative to target entities:

```typescript
import { Tooltip } from '@vectojs/ui';

const tooltip = new Tooltip({
  target: helpIcon,
  content: 'More information',
  delay: 200,
});
```

### `Popover`

Click-triggered overlays containing arbitrary child layout content:

```typescript
import { Popover } from '@vectojs/ui';

const popover = new Popover({
  target: settingsButton,
  width: 200,
  height: 150,
});
```

### `ContextMenu`

Right-click triggered menus supporting keyboard shortcuts, icons, separators, and nested submenus:

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

A high-performance list container that only renders elements in the viewport, supporting fixed and variable row heights:

```typescript
import { VirtualList } from '@vectojs/ui';

const list = new VirtualList({
  width: 300,
  height: 500,
  itemHeight: (idx) => measuredHeights[idx], // or number for fixed heights
  itemRenderer: (idx) => createListItemEntity(idx),
});
```

### `TreeView`

A directory-style tree node navigator. Supports lazy-loading child items asynchronously on node expansion:

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

// From within: modal.close() animates and self-removes.
```

Spring-animated scale-in. Includes a built-in Close button.

### `ScrollView`

A clipped viewport with spring-physics scroll:

```typescript
import { ScrollView } from '@vectojs/ui';

const feed = new ScrollView({ width: 360, height: 600 });
for (const item of items) feed.add(new Card({ ... }));
scene.add(feed.setPosition(20, 20));
feed.scrollToBottom();  // e.g. for a chat log
```

Wheel, touch-drag, and programmatic `scrollTo(y)` all supported.

## Rich Content

### `Markdown`

Renders a Markdown string into a VMT subtree — headings, paragraphs, code blocks with syntax highlighting, tables, blockquotes, links, and inline formatting:

```typescript
import { Markdown } from '@vectojs/ui';

const doc = new Markdown('## Hello\n\nThis is **bold** and `code`.', {
  maxWidth: 700,
});
scene.add(doc.setPosition(40, 40));
```

For LLM streaming, use `appendMarkdown(chunk)` — it re-lexes the full source, then diffs tokens and reuses the unchanged rendered prefix instead of rebuilding every entity.

```typescript
const md = new Markdown('', { maxWidth: 600 });
scene.add(md);
for await (const token of llmStream) {
  md.appendMarkdown(token);
}
```

### `ProgressBar`

A read-only progress indicator — renders a rounded track background and a filled accent bar proportional to `value`. Optionally displays a centered percentage label.

```typescript
import { ProgressBar } from '@vectojs/ui';

const progress = new ProgressBar({
  value: 0.45, // 0–1 fraction
  width: 300,
  height: 16,
  showText: true, // render '45%' centered
  accent: '#00f0ff', // fill color
});
scene.add(progress.setPosition(40, 40));

// Update during an async operation:
for await (const chunk of stream) {
  progress.setValue(bytesReceived / totalBytes);
}
```

Key options:

| Option     | Type      | Default                   | Description               |
| ---------- | --------- | ------------------------- | ------------------------- |
| `value`    | `number`  | —                         | Progress fraction `0`–`1` |
| `width`    | `number`  | `200`                     | Total track width         |
| `height`   | `number`  | `16`                      | Track height              |
| `radius`   | `number`  | `8`                       | Corner radius             |
| `bg`       | `string`  | `'rgba(255,255,255,0.1)'` | Track background          |
| `accent`   | `string`  | `'#00f0ff'`               | Filled bar color          |
| `showText` | `boolean` | `false`                   | Show `"45%"` label        |

Call `progress.setValue(fraction)` to update — the value is clamped to `[0, 1]` and only triggers a redraw when the value actually changes. Projects `role="progressbar"` with `aria-valuenow` set to the rounded percentage.

<figure>
  <img src="/images/component-gallery.svg" alt="VectoJS component gallery showing Button, Text, Input, Card, ScrollView, Slider, Toggle, Checkbox, and Dropdown" class="diagram" />
  <figcaption>All components render entirely on canvas. Shadow DOM nodes (invisible) provide native accessibility and automation support.</figcaption>
</figure>

See the [UI Components Reference](/reference/ui-components/) for complete option signatures.
