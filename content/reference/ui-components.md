+++
title = "@vectojs/ui Component Reference"
description = "Complete reference for all @vectojs/ui components: layout containers, form controls, overlays, and rich content."
weight = 11
+++

# `@vectojs/ui` — Component Reference

> Reusable high-level components for the VectoJS zero-DOM Canvas engine.
> Version documented: **2.20.1**. Source of truth: `dist/index.d.ts` (public surface) and `packages/ui/src/*` (behavior).

Every component is a leaf or container in the Virtual Math Tree (VMT). Nothing here is real DOM — components draw themselves to a Canvas via an `IRenderer`. Accessibility, agent automation, and crawlability come from a parallel **A11y Shadow DOM**: when a component is `interactive`, the `Scene` projects a single hidden, transparent real DOM node positioned over the component's box, built from `getA11yAttributes()`. That is why `page.getByRole('button', { name })` / `fill()` / screen readers work against a pure-Canvas UI.

Text-only application surfaces can import `Text` from `@vectojs/ui/text`. This
lightweight entry excludes Markdown and `@vectojs/tex` from the startup graph; use the
root `@vectojs/ui` entry when composing several component families.

## Live component gallery

The gallery below is now a package-level smoke test. For day-to-day debugging, use the focused
component pages so one behavior can be inspected without scrolling through every component:

| Area                    | Component pages                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Text & media            | [`Text`](/reference/ui-text/), [`RichText`](/reference/ui-richtext/), [`Link`](/reference/ui-link/), [`Image`](/reference/ui-image/)                                                                                                                                                                                                                                                 |
| Layout containers       | [`Card`](/reference/ui-card/), [`Stack`](/reference/ui-stack/), [`Flow`](/reference/ui-flow/), [`ScrollView`](/reference/ui-scrollview/), [`VirtualList`](/reference/ui-virtuallist/), [`TreeView`](/reference/ui-treeview/), [`Resizable panels`](/reference/ui-resizable-panel/)                                                                                                   |
| Controls & forms        | [`Button`](/reference/ui-button/), [`Input`](/reference/ui-input/), [`TextArea`](/reference/ui-textarea/), [`Checkbox`](/reference/ui-checkbox/), [`Toggle`](/reference/ui-toggle/), [`Slider`](/reference/ui-slider/), [`Dropdown`](/reference/ui-dropdown/), [`RadioGroup`](/reference/ui-radiogroup/), [`Tabs`](/reference/ui-tabs/), [`ProgressBar`](/reference/ui-progressbar/) |
| Rich content            | [`Markdown`](/reference/ui-markdown/), [`CodeBlock`](/reference/ui-codeblock/), [`Table`](/reference/ui-table/)                                                                                                                                                                                                                                                                      |
| Overlays & transient UI | [`Overlay`](/reference/ui-overlay/), [`Tooltip`](/reference/ui-tooltip/), [`Popover`](/reference/ui-popover/), [`ContextMenu`](/reference/ui-contextmenu/), [`Modal`](/reference/ui-modal/)                                                                                                                                                                                          |

<figure class="sandbox component-gallery">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · @vectojs/ui 2.0.0 · scroll inside</span></div>
  <iframe src="/sandbox/ui-components.html" class="sandbox-frame component-gallery-frame" loading="eager" title="Interactive gallery of every VectoJS UI component" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Package-level smoke gallery: broad coverage first, focused component pages when debugging a specific behavior.</figcaption>
</figure>

## Conventions shared by all components

All components extend `UIComponent`, which extends the core `Entity`. The following inherited members are used constantly and are **not** repeated per-component below.

| Member              | Signature                                          | Notes                                                                                                                                                                                          |
| ------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setPosition`       | `setPosition(x, y): this`                          | Local-space placement; chainable.                                                                                                                                                              |
| `add` / `remove`    | `add(child: Entity): this` / `remove(child): this` | Child management (containers override `add` to re-layout).                                                                                                                                     |
| `on` / `off`        | `on(event, cb, { capture? }): this`                | DOM-like capture+bubble. Events: `click hover pointerdown pointerup pointercancel pointermove pointerleave change focus blur wheel keydown keyup`.                                             |
| `emit`              | `emit(event, payload): void`                       | Direct self-only dispatch (no tree propagation).                                                                                                                                               |
| `getGlobalPosition` | `getGlobalPosition(): Point`                       | World-space position accumulating ancestor transforms.                                                                                                                                         |
| `scene`             | `get scene`                                        | Nearest attached `Scene`; use `this.scene?.markDirty()` to request a repaint in `onDemand` scenes.                                                                                             |
| `interactive`       | `interactive: boolean`                             | When true, the component projects an A11y shadow node and receives pointer/keyboard events.                                                                                                    |
| `clipChildren`      | `clipChildren: boolean`                            | Clip normal child draws to the local box. Canvas/SVG are exact; Three uses an AABB scissor for rotated/sheared clips. GPU point/WebGPU overlay paths do not participate. Used by `ScrollView`. |
| `width` / `height`  | `number`                                           | The component's box; drives hit-testing and viewport culling.                                                                                                                                  |
| `padding`           | `number`                                           | Inner padding (default `0`); box-style components default it higher.                                                                                                                           |
| transforms          | `x y scaleX scaleY rotation opacity`               | Affine transforms and multiplicative opacity are inherited by children.                                                                                                                        |
| `animate`           | `animate(targetProps, durationMs): this`           | Queues numeric tweens.                                                                                                                                                                         |

---

## `UIComponent` (abstract base)

```ts
abstract class UIComponent extends Entity {
  padding: number; // default 0
  isPointInside(globalX: number, globalY: number): boolean;
  getBounds(): Bounds; // { x:0, y:0, width, height }

  // Enter/exit presence helper
  protected enterMotion?: MotionSpec; // played on mount
  protected exitMotion?: MotionSpec; // played by dismiss()
  dismiss(): Promise<void>; // play exitMotion, then remove from the tree
}
```

Centralizes the box model + axis-aligned (AABB) hit-test shared by every component. `isPointInside` returns whether the point lies in `[0,width] × [0,height]` in local space. `getBounds()` returns the local box so the `Scene` can viewport-cull. Subclasses set `width`/`height` from measured content, implement `render(r)`, and (when interactive) override `getA11yAttributes()`.

**Presence:** declare `enterMotion` / `exitMotion` as a `MotionSpec` (`{ props: { opacity: [0, 1], … }, config? }`) and the component animates in when it mounts to a live scene and out on `dismiss()` — which defers its own removal until the exit animation resolves. One shared implementation over the [core animation system](/reference/core-entity/#animation), replacing per-component hand-rolled springs. Motion is suppressed under `prefers-reduced-motion` (opacity fades kept).

### `getA11yAttributes(): A11yAttributes`

The hook every interactive component overrides. The returned shape (from `@vectojs/core`) drives the projected shadow node:

```ts
interface A11yAttributes {
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea'; // default 'div'
  role?: string; // ARIA role
  label?: string; // aria-label / accessible name
  href?: string; // tag 'a'
  src?: string;
  alt?: string; // tag 'img'
  inputType?: string;
  placeholder?: string;
  value?: string; // tag 'input'
  checked?: boolean; // input.checked or aria-checked, refreshed each frame
  disabled?: boolean;
  expanded?: boolean;
  controls?: string;
  haspopup?: string;
  selected?: boolean;
  activedescendant?: string;
  valuemin?: string;
  valuemax?: string;
  tabIndex?: number; // roving tabindex for composite-widget children
  pointerEvents?: 'auto' | 'none'; // 'none' when something underneath owns the mouse
  labelledby?: string;
  describedby?: string; // aria-describedby — hint / error text
  required?: boolean;
  invalid?: boolean; // validation state
  level?: number; // aria-level (tree items, headings)
  ariaModal?: 'true' | 'false';
  live?: 'off' | 'polite' | 'assertive';
  atomic?: boolean;
  relevant?: string; // live-region controls
  // (plus `target`, `textInputStyle` — see the full reference)
}
```

Every field is projected to a real attribute each frame with dirty checking;
returning `undefined` **removes** it. The complete list and the composite-widget
keyboard patterns live in
[a11yRoot & the agent contract](/reference/core-a11y/).

---

## Text & typography

### `Text`

```ts
new Text(text: string, opts?: TextOptions)

interface TextOptions {
  font?: string;                  // default '16px sans-serif'
  color?: string;                 // default '#e2e8f0'
  maxWidth?: number;              // wrap width; omit → only explicit '\n' breaks lines
  lineHeight?: number;            // line advance in px, default 20
  preserveLeadingSpaces?: boolean;// default false
  selectable?: boolean;           // browser-native drag selection, default true
  textAlign?: 'left' | 'justify'; // default 'left'
  hyphenate?: (word: string) => string[]; // word → parts, for mid-word breaks with a visible '-'
}
```

Multi-line text drawn with native `fillText`. Wrapping/measurement go through the core `LayoutEngine` (same `Intl.Segmenter` path as `TextEntity`) with a **cold/hot split**:

- `setText(text): this` — cold pass (re-segment + re-measure), then re-layout.
- `append(text): this` — streaming/typewriter path; equals `setText(this.text + text)` but the engine's paragraph memo reuses untouched leading paragraphs, so only the changed last paragraph is re-measured.
- `setMaxWidth(maxWidth): this` — **hot** path; re-wraps the cached measured text only (no re-segmentation). Prefer this for responsive reflow.
- `setSelectable(selectable): this` — enable or disable the projected native selection surface.
- `setTextAlign(align: 'left' | 'justify'): this` — re-justify in place.

`textAlign: 'justify'` (with optional `hyphenate`) is honored by the coalesced
`fillText()` runs; soft hyphens (U+00AD) in the source break without a
hyphenator. Content projection mirrors the visual line breaks and line height
for browser find, selection, and copy. Static Text is not an interactive hit
target; Canvas/VMT still owns its pixels and layout.

### `RichText`

```ts
new RichText(spans: StyledSpan[], opts?: RichTextOptions)

interface RichTextOptions {
  font?: string;                          // base shorthand, default '16px sans-serif'
  color?: string;                         // default fill, default '#e2e8f0'
  maxWidth?: number;                      // wrap width
  baseStyle?: TextStyle;                  // inherited by every run (run style still wins)
  linkColor?: string;                     // default '#38bdf8' for link runs w/o own color
  onLinkClick?: (href: string) => void;   // fired when a link run is activated
  exclusions?: ExclusionRect[];           // rects the text flows around (exclusion shapes / floats)
  selectable?: boolean;                   // browser-native drag selection, default true
  textAlign?: 'left' | 'justify';         // default 'left'
  hyphenate?: (word: string) => string[]; // word → parts, for mid-word breaks
}
```

Multi-style inline text: bold / italic / colored / differently-sized /
baseline-shifted (superscript, subscript) runs flow and wrap on shared
baselines. Layout uses the core `LayoutEngine.prepareRich`; each glyph draws
with its run's color/weight/slant and on its own baseline when
`TextStyle.baselineShift` is set (0.8.0+).

- `setSpans(spans): this` — replace runs and re-layout.
- `appendSpans(spans): this` — **streaming** path; the rich paragraph memo reuses untouched leading paragraphs, so a token stream re-prepares in O(changed paragraph), not O(document).
- `setMaxWidth(maxWidth): this` — reflow.
- `setExclusions(exclusions): this` — set float regions and reflow.
- `setTextAlign(align: 'left' | 'justify'): this` — re-justify in place.
- `setSelectable(selectable): this` — toggle native selection without rebuilding spans.

**Inline objects (2.6.0+).** A span can reserve horizontal space for something `RichText` does not shape — a formula, an icon, an embedded box — so it sits mid-sentence instead of block-breaking the line:

```ts
import { OBJECT_REPLACEMENT, type StyledSpan } from '@vectojs/layout';

const spans: StyledSpan[] = [
  { text: 'the identity ' },
  {
    text: OBJECT_REPLACEMENT, // U+FFFC; required, or `object` is ignored
    object: {
      width: 42, // advance to reserve, px at final size
      height: 20, // ascent + descent; feeds line height
      depth: 4, // how far it hangs below the baseline
      alt: 'x+1', // accessible name, selection, and copy text
      paint: (surface, box) => surface.drawImage(bitmap, box.x, box.y, box.width, box.height),
    },
  },
  { text: ' holds.' },
];
```

Metrics are px at final size — a fixed box, not scaled by the run's `fontSize`. `box.y` is already resolved against the baseline and `depth`, so a painter does not repeat that arithmetic. `paint` is called during a paint, so it must be synchronous; an object still loading its content should draw nothing and request a repaint when ready. **Omitting `paint` reserves the space and draws nothing** — a blank gap. Set `alt`, or the raw sentinel reaches the accessibility layer and copies as an invisible character.

A11y: each contiguous **link run** gets a transparent `<a>` hotspot child (reconciled across re-wrap — one hotspot per run; position updates in place, only a change in link _count_ rebuilds the shadow nodes). The component's own accessible name is the full concatenated text.

### `measureText` (free function)

```ts
measureText(text: string, font: string): number
```

Rendered pixel width in a CSS `font`, memoized via a bounded LRU (cap 1000). Arabic is shaped before measuring. Falls back to a `0.5em`-per-char estimate with no DOM.

This is the package's only exported text-measurement helper. The greedy `wrapLines` export was removed in 2.20.0 — its wrapping diverged from the LayoutEngine every component actually uses, so lines it predicted never matched what rendered — and `wrapText` remains an internal `TextArea` utility rather than public API. For layout-critical wrapping use the LayoutEngine itself; for previews and measurement, `measureText` plus your own line-breaking is the supported path.

---

## Layout containers

### `Stack`

```ts
new Stack(opts?: StackOptions)

interface StackOptions {
  direction?: 'vertical' | 'horizontal';  // default 'vertical'
  gap?: number;                            // default 0
  align?: 'start' | 'center' | 'end';      // cross-axis, default 'start'
  wrap?: boolean;                          // default false
  maxWidth?: number;                       // main-axis wrap threshold (horizontal); default Infinity
  maxHeight?: number;                      // main-axis wrap threshold (vertical); default Infinity
}
```

Positions children sequentially along the main axis with `gap`, aligning on the cross axis. Children keep their own sizes — only `x`/`y` are set. Draws nothing itself.

- `add(child): this` — appends and **re-runs `layout()`** immediately.
- `layout(): void` — positions all children and sizes the container to fit (so it can be culled). Call manually after mutating children outside `add` (e.g. resizing a child).

When `wrap` is true, children that would exceed `maxWidth`/`maxHeight` along the main axis start a new line; the container grows on the cross axis.

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

A `Stack` pre-configured as `{ direction: 'horizontal', wrap: true }` — horizontal items that wrap to the next line past `maxWidth`. Use for tag clouds, chip rows. Inherits `add()`/`layout()`.

### `Card`

```ts
new Card(opts: CardOptions)

interface CardOptions {
  width: number;          // required
  height: number;         // required
  bg?: string;            // default '#0f172a'
  border?: string;        // omit → no border
  borderWidth?: number;   // default 1
  radius?: number;        // default 12
  padding?: number;       // default 0 (consumers position children manually)
  label?: string;         // when set → interactive + role="group" landmark
  onClick?: (event: unknown) => void; // requires label; makes the whole card clickable
}
```

A rounded background panel with optional border. Add children via `add()`; they render on top in the card's local space. **Decorative by default** (no shadow node, not interactive). Passing `label` makes it interactive and projects `{ role: 'group', label }` so assistive tech/agents can find the region. `padding` is informational only — it does not auto-inset children.

`setContent(content, fit = true)` hosts one content entity and keeps its size
matched to the card on both axes by default. Pass `false` or
`{ width?, height? }` to opt out per axis. `onClick` requires `label`, preventing
an unnamed interactive region in the a11y tree.

---

## Controls & forms

All form controls below are `interactive` and project a real shadow node; the canvas is a visual mirror driven by the shadow node's native events.

### `Button`

```ts
new Button(label: string, opts?: ButtonOptions)

interface ButtonOptions {
  onClick?: (e: unknown) => void;  // fires for BOTH canvas hit-test and shadow <button> click
  bg?: string;                     // default '#2563eb'
  hoverBg?: string;                // default '#3b82f6'
  color?: string;                  // label color, default '#ffffff'
  font?: string;                   // default '600 16px sans-serif'
  padding?: number;                // default 12
  radius?: number;                 // default 8
  focusColor?: string;             // focus-ring color (2.7.0+), default '#00f0ff'
  disabled?: boolean;              // start disabled: drawn muted, projects `disabled`, no onClick
}
```

Rounded rectangle with a centered label. `width` auto-sizes to `measureText(label, font) + 2·padding`; `height` to `fontSizePx(font) + 2·padding` (the px size parsed from `font`, not the measured label width). Projects `{ tag: 'button', role: 'button', label }` → driven by `getByRole('button', { name })`. Public state: `focused` (draws a 2px focus ring in `focusColor`), internal `hovered` (swaps to `hoverBg`). **Set `focusColor` on a light or warm theme** (2.7.0+) — the default cyan is tuned for the dark default palette and reads as off-brand elsewhere, and a focus ring is the one affordance a keyboard user cannot do without. Under forced-colors mode the ring always uses the system `Highlight` color instead.

### `Link`

```ts
new Link(label: string, opts: LinkOptions)   // opts required (href)

interface LinkOptions {
  href: string;          // required; navigation target + shadow <a href>
  color?: string;        // default '#38bdf8'
  font?: string;         // default '16px sans-serif'
  underline?: boolean;   // default true
}
```

Colored (optionally underlined) text. Auto-sizes to the label. Projects a real `{ tag: 'a', href, label }` shadow node (natively clickable/crawlable). The canvas hit-test path opens via `window.open(href, '_blank', 'noopener')`.

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

Draws via `drawImage`; projects `{ tag: 'img', src, alt, label: alt }`. Loading is async — a placeholder box is drawn until ready. In `onDemand` scenes pass `onLoad: () => scene.markDirty()` to repaint on load. (Shadows `globalThis.Image`; reference the class as `import { Image } from '@vectojs/ui'`.)

`fit` (2.18.0+) maps the loaded bitmap into the box: `'fill'` (default) stretches to the box, `'cover'` preserves aspect ratio and fills the box while cropping the overflow around `focalPoint`, and `'contain'` fits the whole bitmap inside the box with the aspect ratio preserved. `focalPoint` is a normalized `{ x, y }` point (`0` = top/left, `1` = bottom/right, clamped to `[0, 1]`), read only by `'cover'`. `radius` now clips the rounded corners on the loaded bitmap, not just the placeholder.

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
  width: number;             // required
  height?: number;           // default 40
  placeholder?: string;
  value?: string;            // default ''
  font?: string;             // default '16px sans-serif'
  color?: string;            // default '#e2e8f0'
  placeholderColor?: string; // default '#64748b'
  bg?: string;               // default '#0f172a'
  border?: string;           // default '#334155'
  selectionColor?: string;   // default 'rgba(56, 189, 248, 0.35)'
  radius?: number;           // default 6
  padding?: number;          // default 10
  onChange?: (value: string) => void;
}
```

Single-line field backed by a **real, transparent `<input>` shadow node**. The browser handles all input — clicks, keyboard, **IME composition**, selection, clipboard, undo — natively on that element; the canvas only draws. The `Scene` mirrors state back via a `change` event whose payload carries `value`, `selectionStart`, `selectionEnd`, and `composition`. The component re-exposes these as public fields:

- `value: string`, `focused: boolean` (drives 500ms caret blink).
- `selectionStart` / `selectionEnd: number` — caret/selection offsets mirrored from the real input.
- `composition: { start; length } | null` — active IME pre-edit range (drawn as an underline).

A11y: `{ tag: 'input', inputType: 'text', placeholder, value, label: placeholder }`. Agents `fill()` it by role; humans type CJK; the canvas renders caret, selection highlight, IME underline, and scroll-to-caret (`scrollLeft`). Handles RTL (Hebrew/Arabic) ranges via the layout engine.

### `TextArea`

```ts
new TextArea(opts: TextAreaOptions)

interface TextAreaOptions {
  width: number;             // required
  height?: number;           // default 120
  placeholder?: string;
  value?: string;            // default ''
  font?: string;             // default '16px sans-serif'
  lineHeight?: number;       // multiple of font size, default 1.4
  color?: string;            // default '#e2e8f0'
  placeholderColor?: string; // default '#64748b'
  bg?: string;               // default '#0f172a'
  border?: string;           // default '#334155'
  selectionColor?: string;   // default 'rgba(56, 189, 248, 0.35)'
  radius?: number;           // default 6
  padding?: number;          // default 10
  onChange?: (value: string) => void;
}
```

Multi-line field backed by a **real, transparent `<textarea>` shadow node** — same mirror model as `Input` plus multi-line navigation. The canvas re-wraps the value (via `wrapText`) and draws text, selection, and caret. Public fields mirror `Input`: `value`, `focused`, `selectionStart`, `selectionEnd`, `composition`. `lineHeightFactor` holds the `lineHeight` option.

- `lineOfOffset(offset: number): number` — visual (wrapped) line index containing a linear char offset; boundary offsets resolve to the earliest containing line, out-of-range clamps to the last. Useful for mapping caret position to a line.

A11y: projects a `textarea` shadow node; agents `fill()` it, humans type CJK, rendering stays Zero-DOM. Vertical scroll-to-caret keeps the active line in view (`scrollTop`).

### `Checkbox`

```ts
new Checkbox(opts: CheckboxOptions)

interface CheckboxOptions {
  checked?: boolean;   // default false
  label?: string;      // drawn to the right; used as accessible name
  size?: number;       // box size px, default 20
  font?: string;       // default '16px sans-serif'
  color?: string;      // label color, default '#e2e8f0'
  accent?: string;     // checked fill, default '#2563eb'
  border?: string;     // unchecked border, default '#475569'
  onChange?: (checked: boolean) => void;
}
```

Backed by a real `<input type="checkbox">` shadow node — natively toggleable by agents/assistive tech. Both a canvas `click` and the shadow node's native `change` route through one guarded setter (no duplicate `onChange` for an unchanged value). Public: `checked`. A11y: `{ tag: 'input', inputType: 'checkbox', checked, label }`.

### `Toggle`

```ts
new Toggle(opts: ToggleOptions)

interface ToggleOptions {
  checked?: boolean;   // default false
  label?: string;      // drawn to the right; used as accessible name
  width?: number;      // track width px, default 44  (exposed as trackW)
  height?: number;     // track height px, default 24 (exposed as trackH)
  font?: string;       // default '16px sans-serif'
  color?: string;      // label color, default '#e2e8f0'
  accent?: string;     // on-state track fill, default '#2563eb'
  track?: string;      // off-state track fill, default '#475569'
  onChange?: (checked: boolean) => void;
}
```

iOS-style switch projecting `{ role: 'switch', checked, label }` with `aria-checked`. Because `role="switch"` is a `div` (no native change forwarded by the `Scene`), `click` re-emits a self `change` event; the single `change` handler is the source of truth so both external `on('change', …)` listeners and the `onChange` callback fire. Public: `checked`, `trackW`, `trackH`.

### `Slider`

```ts
new Slider(props?: SliderProps)   // props is loosely typed (any) in the .d.ts

// Recognized props (read in the constructor):
{
  label?: string;          // accessible name (2.2.0+) — set this
  min?: number;            // default 0
  max?: number;            // default 100
  value?: number;          // default = min
  width?: number;          // default 200
  height?: number;         // default 24
  step?: number;           // default 1 — value granularity for pointer and keyboard
  trackColor?: string;     // default 'rgba(255, 255, 255, 0.15)'
  progressColor?: string;  // default '#00f0ff'
  handleColor?: string;    // default '#fff'
  focusColor?: string;     // focus-ring color (2.7.0+), default '#00f0ff'
}
```

Horizontal slider with a circular thumb. Public: `min`, `max`, `value`, `step`. Dragging (`pointerdown` → `pointermove` → `pointerup`) maps pointer `localX` to a value, **snapped to the `step` grid anchored at `min`** (integer steps by default, matching `input[type=range]` semantics), and emits a `change` event with `{ value }` (subscribe via `on('change', e => e.value)`). Keyboard: `ArrowRight`/`ArrowUp` step up, `ArrowLeft`/`ArrowDown` step down, `Home`/`End` jump to `min`/`max`. Public `focused` tracks keyboard focus and draws a 2px ring in `focusColor` around the handle (2.7.0+; before that release the slider drew **no focus indicator at all** despite being keyboard-operable — WCAG 2.4.7). A11y: `{ role: 'slider', label, value, valuemin, valuemax }`. **Pass `label`** (2.2.0+) — before it existed the projected node had no accessible name and was announced as bare "slider" (WCAG 4.1.2). Older pre-1.0 UI builds had integer-only values and no keyboard handling.

### `Dropdown`

```ts
new Dropdown(options: string[], props?: DropdownProps)  // props loosely typed (any)

// Recognized props:
{
  label?: string;   // accessible name (2.2.0+) — set this
  value?: string;   // initial selection; default = options[0]
  width?: number;   // default 120
  height?: number;  // default 36
  bg?: string;      // closed trigger bg, default 'rgba(30, 41, 59, 0.85)'
  color?: string;   // default '#fff'
  radius?: number;  // default 8
  font?: string;    // default '14px sans-serif'

  // Open-menu theming (2.7.0+) — see the note below
  menuBg?: string;           // option row bg, default 'rgba(15, 23, 42, 0.95)'
  menuColor?: string;        // option row text, default '#fff'
  menuSelectedBg?: string;   // selected row, default 'rgba(0, 240, 255, 0.25)'
  menuHighlightBg?: string;  // keyboard-highlighted row, default 'rgba(0, 240, 255, 0.4)'
  focusColor?: string;       // focus ring, trigger + rows, default '#00f0ff'
}
```

A combobox: a `Button` shows the current value; clicking (or `ArrowDown`/`ArrowUp`/`Enter`/`Space`) opens a `Stack` menu of option `Button`s plus a full-screen transparent backdrop, both mounted via `scene.showOverlay(...)`. `Escape` or a backdrop click closes via `scene.hideOverlay(...)`. Selecting emits a `change` event with `{ value }`. Keyboard navigation tracks a highlighted index; `activedescendant` and option ids (`${id}-opt-${i}`) are wired for ARIA. Read the current selection with `getValue(): string`.

A11y on the root: `{ role: 'combobox', expanded, controls, haspopup: 'listbox', value, activedescendant }`. The menu projects `role="listbox"`, each option `role="option"` with `selected`.

**Theme the open menu, not just the trigger** (2.7.0+). Before these props the trigger's `bg`/`color` were overridable while the menu's colors were hardcoded, so a dropdown themed for a light or warm palette opened a dark slate panel with cyan selection — which reads as a rendering bug rather than a style. Note that `menuHighlightBg` and `menuSelectedBg` can apply at once, and opening the menu highlights the selected row, so make the highlight read as the stronger of the two. Option rows are themselves focusable (`role="option"`), so the `focusColor` ring is drawn _on_ a highlighted row: keep enough contrast between the ring and `menuHighlightBg` to clear the 3:1 non-text floor (WCAG SC 1.4.11).

---

## Overlays

### `Modal`

```ts
new Modal(title: string, props?: ModalProps)  // props loosely typed (any)

// Recognized props:
{
  width?: number;       // backdrop, default window.innerWidth (fallback 800)
  height?: number;      // backdrop, default window.innerHeight (fallback 600)
  backdropColor?: string; // default 'rgba(0, 0, 0, 0.5)'
  modalWidth?: number;  // central card, default 400
  modalHeight?: number; // default 250
  cardBg?: string;      // default 'rgba(15, 23, 42, 0.95)'
  cardBorder?: string;  // default 'rgba(255, 255, 255, 0.15)'
}
```

A full-screen dimming backdrop with a centered `Card` containing the `title` text and a built-in "Close" button. The card scales in on mount (spring) through the shared [animation system](/reference/core-entity/#animation); blocks underlying `click`/`pointerdown`. Show it with `scene.showOverlay(modal)`.

- `close(): Promise<void>` — springs the card scale back to 0, then unmounts via `scene.hideOverlay(this)` once the exit animation resolves (safe deferred teardown). Awaitable.

### `ScrollView`

```ts
new ScrollView(opts: ScrollViewOptions)

interface ScrollViewOptions {
  width: number;
  height: number;
  scrollPhysics?: MotionConfig; // default 'spring' (stiffness 180, damping 12)
}
```

A clipping viewport (`clipChildren = true`) with wheel + pointer-drag scrolling and spring physics configured by `scrollPhysics` — the default spring is deliberately underdamped (ζ ≈ 0.45, ~20% overshoot); document-like content usually wants the exported `DOCUMENT_SCROLL_PHYSICS` preset (`{ stiffness: 180, damping: 27 }`, ζ ≈ 1.0, no overshoot). Children live inside a non-interactive `content` Entity that is translated; the viewport box stays fixed.

- `content: Entity` — the scrolled container (public).
- `add(child): this` / `remove(child): this` — mutate `content` and call `updateContentSize()`.
- `updateContentSize(): void` — recompute `content.width/height` from children extents (call after mutating children directly) to set the max scroll range.
- `scrollTo(y: number): void` — scroll to a Y offset where **0 is the top** (internally clamps; public scroll API added in 0.1.1).
- `scrollToBottom(): void` — jump to the content end (added in 0.1.1).
- `update(dt, time)` — integrates the spring toward the target offset (called by the render loop).

Wheel scrolling calls `preventDefault()` except with `Ctrl` held (lets the browser zoom). Pointer drag moves content 1:1 with the cursor/finger. Scroll target is clamped to `[-maxScroll, 0]`.

```ts
const sv = new ScrollView({ width: 360, height: 480 });
sv.add(longContent);
scene.add(sv.setPosition(20, 20));
sv.scrollToBottom(); // e.g. a chat log after appending
```

---

## Content / rich documents

### `Markdown`

```ts
new Markdown(markdownText: string, opts?: MarkdownOptions)

interface MarkdownOptions {
  maxWidth?: number;     // default 800
  theme?: MarkdownTheme;
  onLinkClick?: (href: string) => void;
  selectable?: boolean;  // default true; propagates to rendered text/code/table cells
}

interface MarkdownTheme {        // all optional; defaults shown
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
  codeFont?: string;             // '"JetBrains Mono", "Fira Code", monospace'
  fontSize?: number;             // 16
}
```

Parses Markdown with **`marked` (v18, GFM)** into a VMT subtree under a vertical `Stack` (`content`, gap 16). Supported tokens: headings (h1–h6, scaled sizes), paragraphs (word-wrapped `RichText`), fenced code blocks (`CodeBlock` with keyword highlighting), blockquotes (left accent bar), ordered/unordered lists, horizontal rules, inline code, links — and **GFM tables** (rendered via the `Table` component; GFM table support added in 0.1.1). `content.width`/`height` size the component.

Two content-update paths — **choosing the right one matters for streaming:**

- `setContent(markdown): this` — **full rebuild**: tears down every child and re-renders from scratch. Use for one-shot/replacement.
- `appendMarkdown(chunk): this` — **the correct streaming/token path**. Appends to the raw buffer, re-lexes the complete Markdown source, diffs tokens by raw source, reuses unchanged prefix entities, and updates the last (growing) paragraph in-place via `RichText.setSpans`. It avoids a full entity-tree rebuild, but lexing still scales with document length.
- `setSelectable(selectable): this` — updates existing text/code/table descendants and becomes the default for future streaming nodes.

> Gotcha: do **not** stream by calling `setContent(fullSoFar)` on every token. That rebuilds the entire tree each token (O(document) per token) and makes layout cost grow with the document. Feed only the new delta to `appendMarkdown(chunk)`.

```ts
const md = new Markdown('', { maxWidth: 600 });
scene.add(md.setPosition(40, 40));
for await (const token of llmStream) md.appendMarkdown(token); // reuses unchanged rendered prefix
```

### `CodeBlock`

```ts
new CodeBlock(code: string, lang: string, maxWidth: number, theme: Required<MarkdownTheme>, selectable = true)
```

A single self-rendering leaf for fenced code: rounded background + per-line, per-segment colored text (keyword/string/comment/number highlighting for `js`/`ts`/`py`/`rust` and aliases). Replaces the old per-line/per-segment child-entity explosion with one flat leaf. **Decorative** — `isPointInside()` always returns `false`.

- `setCode(code, lang?): this` — re-parse content (e.g. live editing).
- `setSelectable(selectable): this` — toggle the exact-source content projection.

UI 1.9 shares Core 1.8's `PreparedContentGrid` between per-grapheme Canvas
paint and semantic projection. Tabs, wide CJK/emoji, Arabic shaping, bidi,
Firefox font substitution, DPR/zoom, and affine transforms therefore keep one
source-aware geometry plan.

Note: `theme` must be a fully-resolved `Required<MarkdownTheme>`. In practice `CodeBlock` is produced internally by `Markdown`; construct it directly only if you supply a complete theme.

### `Table`

```ts
new Table(opts: TableOptions)

interface TableOptions {
  headers: (string | Entity)[];     // required; Entity instances must be unique
  rows: (string | Entity)[][];      // required (2D row × col)
  colWidths?: number[];       // per-column px; must match headers.length, else evenly distributed
  align?: ColumnAlign[];      // per-column 'left' | 'center' | 'right' | null (null = left)
  width?: number;             // total width, default 600
  rowHeight?: number;         // default 36
  viewportHeight?: number;    // virtualize: fix height, pin header, scroll body
  bg?: string;                // default 'rgba(15, 15, 25, 0.4)'
  headerBg?: string;          // default 'rgba(255, 255, 255, 0.08)'
  borderColor?: string;       // default 'rgba(255, 255, 255, 0.15)'
  headerTextColor?: string;   // default '#ffffff'
  textColor?: string;         // default '#e2e8f0'
  font?: string;              // default '14px sans-serif'
  selectable?: boolean;       // native cell-text selection, default true
}
```

Column alignment is applied by **positioning the cell entity**, not by a text-alignment property — `setTextAlign` accepts only `'left' | 'justify'`. For a wrapped multi-line cell that aligns the block rather than each line within it.

Canvas-native data grid: string cells become Text child entities, Entity cells are constrained through public `setMaxWidth()`, and `layout()` resolves wrapping, row heights, and positions before the draw-only `render()` pass. Call `layout()` after changing external cell content. Append rows live with `appendRows(rows: (string | Entity)[][])` (re-lays out automatically). Each cell owns one content projection. A11y: projects `{ role: 'grid', label: 'Data table with N columns and M rows.' }` for assistive tech. Also the renderer for GFM tables inside `Markdown`.

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

A mutually exclusive group of radio choices projected with `{ role: 'radiogroup', label }`. Standardized `'change'` event payload carries `{ value }`.

**Pass `label` when a screen has more than one group** (2.8.0+). Each option carries its own name, but the group's name is what says _which choice is being made_. Without it every group announces as the generic default `'Radio group'`, so a user hears "Radio group" repeatedly with no way to tell them apart — set it whenever the visual heading identifying the group is drawn on the canvas rather than being part of the group (WCAG 4.1.2).

---

### `Tabs`

```ts
new Tabs(opts: TabsOptions)

interface TabsOptions {
  tabs: TabItem[];
  value?: string;
  width: number;
  height: number;
  tabHeight?: number;
  font?: string;
  color?: string;
  selectedColor?: string;
  borderColor?: string;
  closable?: boolean; // show a close affordance; clicks route to onClose
  tabWidth?: number; // preferred px width; bar scrolls on overflow (default 160)
  minTabWidth?: number; // lower bound before scrolling kicks in (default 96)
  autoHideTabBar?: boolean; // hide the bar while < 2 tabs (default false; 1.9.5)
  label?: string; // accessible name for the TAB BAR (2.8.0+), default 'Tab switching panel'
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

A tab selection container. Auto-mounts the active tab's content view and translates it inside the remaining space. Projects `{ role: 'tablist', label }` for accessibility. Standardized `'change'` event payload carries `{ value }`.

**Pass `label` when a screen has more than one tablist** (2.8.0+), for the same reason as `RadioGroup.label`: each tab is named, but the tablist's name is what says what the tabs switch _between_. The default is `'Tab switching panel'`.

Tabs keep a fixed preferred `tabWidth` and the bar scrolls horizontally once they overflow (wheel, or auto-scroll to keep the active tab visible) rather than shrinking to slivers — as of 1.9.4, `tabWidth` is a target the bar scrolls past, not a stretch-to-fill width (which previously mis-targeted close hits on wide strips). With `autoHideTabBar` (1.9.5), the bar and its hit region disappear while fewer than two tabs exist and the content takes the full height (Vim `showtabline=1` semantics); the `effectiveTabBarHeight` getter reports the bar's current height (`0` when hidden), and content geometry re-syncs every frame so reassigning `tabs` can't leave stale or offset content.

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

Progress bar displaying progress tracks. Centered text options available. Projects `{ role: 'progressbar', value }` for accessibility.

- `setValue(value: number): void` — Update the value with safety bounds checks.

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

Floating positioning layer engine with edge-collision detection and placement flip. Position it relative to a target with `showAt(target, placement?, offset?)` or at an absolute point with `showAtPoint(x, y)`; hide with `hide()`. Projects no accessibility node natively.

---

### `Tooltip`

```ts
new Tooltip(opts: TooltipOptions)

interface TooltipOptions {
  target: Entity;
  content: string;
  placement?: Placement;
  delay?: number; // ms before showing, default 320
  font?: string;
  color?: string;
  bg?: string;
}
```

Floating hover tooltip helper. Projects tooltip container on hover relative to target.

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

Floating click popover panel. Clicking target shows the popover, clicking outside automatically hides it.

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

Right-click triggered menu component. Supports icons, shortcuts, dividers, and recursive submenus.

- `showAtPoint(x: number, y: number, source?: Scene | Entity): void` — displays
  the menu at a scene point. Pass a mounted source when the menu has not been
  mounted yet.
- Nested menus share one root-owned backdrop. Command activation, outside
  pointerdown, `hide()`, or `destroy()` closes the complete chain without
  leaving hidden semantic or pointer surfaces behind.

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

Scrolling list container optimized for high-performance rendering. Only instantiates/renders items currently within the viewport bounds. `keyForItem` makes measured heights survive `setItems()`, keeps a scroll anchor attached while rows above resize, and allows append/prepend without discarding the cache — without it `setItems()` clears every measurement and jumps to the top. `stickToBottomThreshold` (only with `keyForItem`) re-pins a following viewport to the bottom after rows resize — ideal for chat transcripts. Methods: `scrollToIndex(index)`, `scrollToTop()`, `scrollToBottom()`, `jumpToBottom()` (instant). The exported `RowHeights` class backs the measurement cache.

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

A nested tree navigator. Supports synchronous children array or asynchronous lazy-loading function resolvers.

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
  defaultSize?: number; // fraction
}
```

A resizable split pane system. `Panel.setContent(content, fit = true)` hosts one
entity and tracks the panel's width and height after divider drags or direct
resizes. Pass `false` or `{ width?, height? }` when content intentionally owns
one or both dimensions.

---

## Quick index

| Component     | Constructor                     | Shadow node / role               |
| ------------- | ------------------------------- | -------------------------------- |
| `Text`        | `(text, opts?)`                 | none (content projection only)   |
| `RichText`    | `(spans, opts?)`                | `div` + per-link `<a>` hotspots  |
| `Button`      | `(label, opts?)`                | `button` role=button             |
| `Link`        | `(label, opts)`                 | `a[href]`                        |
| `Image`       | `(src, opts)`                   | `img[src,alt]`                   |
| `Card`        | `(opts)`                        | none, or role=group with `label` |
| `Stack`       | `(opts?)`                       | none (structural)                |
| `Flow`        | `(opts?)`                       | none (structural)                |
| `Input`       | `(opts)`                        | transparent `input`              |
| `TextArea`    | `(opts)`                        | transparent `textarea`           |
| `Checkbox`    | `(opts)`                        | `input[type=checkbox]`           |
| `Toggle`      | `(opts)`                        | role=switch                      |
| `Slider`      | `(props?)`                      | role=slider                      |
| `Dropdown`    | `(options, props?)`             | role=combobox + listbox/option   |
| `RadioGroup`  | `(opts)`                        | role=radiogroup                  |
| `Tabs`        | `(opts)`                        | role=tablist                     |
| `ProgressBar` | `(opts?)`                       | role=progressbar                 |
| `Overlay`     | `(opts)`                        | none (structural)                |
| `Tooltip`     | `(opts)`                        | tooltip                          |
| `Popover`     | `(opts)`                        | popover panel                    |
| `ContextMenu` | `(opts)`                        | context menu list                |
| `VirtualList` | `(opts)`                        | viewport scroll                  |
| `TreeView`    | `(opts)`                        | tree node view                   |
| `PanelGroup`  | `(opts)`                        | resizable group                  |
| `ScrollView`  | `(opts)`                        | content viewport                 |
| `Modal`       | `(title, props?)`               | overlay (backdrop + card)        |
| `Markdown`    | `(text, opts?)`                 | subtree of the above             |
| `CodeBlock`   | `(code, lang, maxWidth, theme)` | none (decorative)                |
| `Table`       | `(opts)`                        | role=grid                        |

> `Slider`, `Dropdown`, and `Modal` accept loosely-typed (`any`) props in the published `.d.ts`; the option tables above are derived from their source constructors and are the accurate contract.
