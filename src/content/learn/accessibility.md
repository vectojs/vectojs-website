---
title: 'Accessibility & Automation'
description: 'How VectoJS projects semantic DOM controls over canvas content for screen readers, keyboard users, and Playwright automation.'
order: 8
---

# Accessibility & Automation

Canvas and WebGL pixels carry no semantic information by themselves. For eligible interactive entities, VectoJS maintains a real, invisible DOM element in its `a11yRoot` overlay. Screen readers, keyboard navigation, and automation tools can interact with those elements while canvas-backed layers provide the visuals. This is a projection layer, not the browser's Shadow DOM API, and applications still own correct semantics and testing.

## How shadow DOM projection works

When an entity has `interactive = true` (and a non-zero box), the `Scene` creates a real HTML element — `<button>`, `<input>`, `<a>`, etc. — and positions it above the canvas using absolute CSS. The element has `opacity: 0` and `pointer-events: auto`, so it is invisible to the eye but fully functional for accessibility tools.

<figure>
  <img src="/images/shadow-dom-layers.svg" alt="Diagram showing three stacked layers: canvas at z-index 0 with GPU-rendered components, DOM portal layer at z-index 9, and the A11y shadow layer at z-index 10 containing transparent real DOM elements like button and input. A pointer cursor arrow hits the top layer first." class="diagram" />
  <figcaption>Three layers in the canvas parent. Only the a11y layer has <code>pointer-events: auto</code>, so clicks reach the real shadow elements before the canvas.</figcaption>
</figure>

The a11y layer sits in the canvas's parent `<div>`, which `Scene` forces to `position: relative` automatically.

On every rendered frame (throttled by `a11ySyncInterval`), the Scene:

1. Reads each interactive entity's `getA11yAttributes()`.
2. Creates or updates the corresponding shadow node (dirty-checked to minimize DOM writes).
3. Applies the entity's complete world affine matrix and local `width × height`; the projection root maps logical Scene coordinates onto the canvas CSS box.

Canvas offset and non-uniform CSS scaling are supported. Do not assume alignment
under arbitrary CSS rotation/skew of the canvas; verify with `debugA11y` on the
actual page.

> [!NOTE]
> The sync **never prunes** during a frame. If your code adds and removes interactive child entities frequently, call `scene.detachA11y(entity)` before discarding them, or their shadow nodes will leak. `scene.remove(entity)` prunes recursively and safely.

## Opting in: `entity.interactive`

```typescript
entity.interactive = true; // enable shadow node + pointer/keyboard events
entity.width = 120;
entity.height = 40; // shadow node is only created when width > 0
```

Setting `interactive = true` has a side-effect: it flags `a11yNeedsReorder` and calls `scene.markDirty()`.

## Controlling the shadow node: `getA11yAttributes()`

Override `getA11yAttributes()` to specify the element type, ARIA role, and semantic state:

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

Full interface:

```typescript
interface A11yAttributes {
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea'; // default: 'div'
  role?: string; // ARIA role (e.g. 'switch', 'slider', 'combobox')
  label?: string; // aria-label / accessible name
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
}
```

### What built-in components project

| Component           | Shadow element            | Key ARIA attributes                                             |
| ------------------- | ------------------------- | --------------------------------------------------------------- |
| `Button`            | `<button>`                | `role="button"`, `aria-label`                                   |
| `Link`              | `<a href>`                | native link, `aria-label`                                       |
| `Image`             | `<img>`                   | `src`, `alt`                                                    |
| `Input`             | `<input type="text">`     | `placeholder`, `value` (live)                                   |
| `TextArea`          | `<textarea>`              | `placeholder`, `value` (live)                                   |
| `Checkbox`          | `<input type="checkbox">` | `checked` (live), `aria-label`                                  |
| `Toggle`            | `<div role="switch">`     | `aria-checked` (live), `aria-label`                             |
| `Slider`            | `<div role="slider">`     | `aria-valuenow/min/max` (live)                                  |
| `Dropdown`          | `<div role="combobox">`   | `aria-expanded`, `aria-controls`, menu items as `role="option"` |
| `Card` (with label) | `<div role="group">`      | `aria-label`                                                    |
| `Table`             | `<div role="grid">`       | `aria-label` with row/col count                                 |
| `Text`              | `<div>`                   | `aria-label` = text content                                     |

## IME-aware input fields

`Input` and `TextArea` use **real, transparent shadow `<input>`/`<textarea>` elements** for text entry. This means:

- IME composition (Chinese, Japanese, Korean, Arabic) works natively — the browser handles the candidate window.
- Text selection, clipboard (cut/copy/paste), undo/redo are all native.
- The canvas is a **pure visual mirror**: it reads `value`, `selectionStart`, `selectionEnd`, and `composition` from the `change` event and draws the caret, selection highlight, and IME underline.

While an input is focused, the sync avoids writing back the same user-synchronized value. If application state supplies a genuinely different value, it is applied; controlled components should therefore preserve selection intentionally when replacing text.

## Static content projection

Interactive controls project a11y nodes. Static content projection covers the non-interactive side: entities that render static text expose it via `getContentProjection()`, and the Scene mirrors it as a **transparent, position-synced DOM node** over the drawn glyphs. Screen readers, Ctrl+F, crawlers, and translation extensions can then see text that is visually rendered on canvas.

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

What this unlocks, with zero extra work:

- **Find-in-page** — Ctrl+F matches; the browser's highlight boxes render behind the transparent glyphs.
- **Screen readers & crawlers** read real text in source order.
- **Translation extensions and reader mode** operate on the projected layer.
- **`#:~:text=`** fragment links resolve.
- **Native mouse selection** — opt in per custom entity with `selectable: true` (the `::selection` highlight paints behind the transparent glyphs). Core projection is off by default so arbitrary text never intercepts canvas input. UI Text/RichText/Markdown/Table content defaults to selectable and exposes `setSelectable(boolean)`.

For pixel-accurate selection, treat the Canvas baseline as the source of truth:
use `baseline` (and `contentX`/`contentY`) for a single run, or explicit visual
`lines` for wrapped, inset, or mixed-size text. The next Core release after
1.5.0 maps these local coordinates through transforms and gives every projected
run the same CSS line box. Do not compensate with page-level CSS offsets.

For native `Input`/`TextArea` implementations, expose
`textInputStyle: { font, lineHeight, padding }` through `getA11yAttributes()`.
Scene applies it to the transparent editor with `box-sizing: border-box`, while
the canvas should draw from the same padding and line-box baseline.

Notes:

- Projections are **viewport- and clip-lazy**: text fully outside the Scene or a `clipChildren` ancestor is `display: none` and cannot intercept input.
- Dynamic projections are reordered to match VMT source order; removing a subtree removes every descendant projection.
- When the entity is also `interactive`, its text copy is `aria-hidden` so screen readers don't announce it twice.
- Disable the whole layer with `new Scene(canvas, { contentProjection: false })` for purely decorative scenes.
- Browser find covers materialized content. It cannot search a virtualized entity that the application has not mounted.
- Global shortcut routers must yield native copy when `window.getSelection()?.isCollapsed === false` and must not suppress Ctrl/Command+F unless the application intentionally replaces browser find.

## The `debugA11y` option

Enable `debugA11y: true` in `SceneOptions` to make the shadow nodes visible during development — they appear with a blue dashed outline:

```typescript
const scene = new Scene(canvas, { debugA11y: true });
```

Open browser DevTools → Elements and you will see the actual `<button>`, `<input>`, and `<a>` elements positioned over your canvas. This is the fastest way to verify that roles, labels, and positions are correct.

## `a11yFullViewport` — boundless surfaces

Some entities cover the entire Scene viewport (an infinite canvas, a gesture recognizer, a background click trap). These have no meaningful bounding box. Set `a11yFullViewport = true` to project a Scene-sized shadow node that follows the canvas CSS box:

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

The full-viewport node is mounted **behind** all other shadow nodes, so any on-top components (buttons, inputs) remain clickable.

## `a11ySyncInterval` — throttling during animation

By default, the shadow DOM syncs on every rendered frame. For UIs with heavy animation and many interactive entities, sync can dominate frame time. Throttle it:

```typescript
const scene = new Scene(canvas, { a11ySyncInterval: 100 });
// Shadow DOM is updated at most once per 100ms during animation
```

The interval remains active while animation runs, and the Scene schedules a final catch-up after pending motion settles. It does not freeze the semantic layer for the entire animation.

## Inspecting the shadow tree programmatically

```typescript
// Get a nested snapshot of all projected shadow nodes
const tree = scene.getA11yTree();
// Returns: A11yTreeNode[] — { id, tag, role, label, value, children, ... }

// Get the actual HTMLElement for a specific entity
const el = scene.getA11yElement(entity.id);
el?.focus(); // programmatically focus a shadow node
```

## Playwright integration

Because every interactive entity projects a real DOM element, standard Playwright selectors work without any special adapters:

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

### Selecting by `data-vecto-id`

Each shadow node carries a `data-vecto-id` attribute equal to `entity.id`. For stable selectors that survive label text changes:

```typescript
const entity = new Button('Submit');
entity.id = 'submit-btn'; // or set in constructor via super with id

// In Playwright:
await page.locator('[data-vecto-id="submit-btn"]').click();
```

## Screen reader testing checklist

- [ ] Every interactive entity has `interactive = true` and a non-zero box.
- [ ] `getA11yAttributes()` returns a meaningful `tag` and `label`.
- [ ] `Input`/`TextArea` have a `placeholder` (used as `aria-label`).
- [ ] `Checkbox`/`Toggle` `checked` state is reflected live in `getA11yAttributes()`.
- [ ] `Slider` has `valuemin`, `valuemax`, and `value` set on every render.
- [ ] `Card` groups have a `label` when they represent a logical region.
- [ ] Tab order is reasonable (shadow nodes are positioned in DOM order, which matches add order).
- [ ] Run `scene.getA11yTree()` and inspect the output to catch missing labels.
- [ ] Enable `debugA11y: true` and visually verify node positions match the canvas components.

## Troubleshooting

### Shadow node position is offset from the canvas component

Two common causes:

1. **Canvas parent is not `position: relative`** — `Scene` sets this automatically on every frame, but a CSS rule with higher specificity forcing `position: static` will override it. Check the computed style on the canvas's parent element.
2. **CSS `transform` on the canvas parent** — absolute positioning of the shadow nodes is relative to the nearest positioned ancestor, but `transform` creates a new stacking context which can cause offsets. Move the `transform` to the canvas element itself, not the parent.

If you previously used `a11yOffsetX` / `a11yOffsetY` as a workaround, remove them and fix the underlying positioning issue instead.

### Playwright `getByRole()` finds nothing

Check the following:

1. `entity.interactive` must be `true` and `entity.width > 0`.
2. `getA11yAttributes()` must return the correct `tag` and `role`. For `page.getByRole('button')` to work, the tag must be `'button'` or the role must be `'button'`.
3. The label must match: `page.getByRole('button', { name: 'Submit' })` requires `label: 'Submit'` in the attributes.
4. The scene must have called `start()` — the a11y sync happens during the render loop.

Use `scene.getA11yTree()` to print a snapshot of what is currently projected:

```typescript
console.log(JSON.stringify(scene.getA11yTree(), null, 2));
```

### `scene.getA11yTree()` returns an empty array

The a11y tree is only populated after `scene.start()` has run at least one frame. If you call `getA11yTree()` synchronously after construction, it will be empty. Wrap it in a `setTimeout` or check after a user interaction.

Also verify `entity.interactive = true` is set — entities without `interactive` are never projected.

> **Next:** [UI Components](/learn/ui-components/) — the full suite of ready-made interactive components.
