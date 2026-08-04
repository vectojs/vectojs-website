---
title: 'a11yRoot & the agent contract'
description: 'How every interactive Entity projects a transparent ARIA shadow node into the DOM — the A11yAttributes shape, the canvas-performance-and-DOM-grade-accessibility contract, and the sync gotchas that cause stale or missing shadow nodes.'
order: 10
---

# a11yRoot & the agent contract

Part of [`@vectojs/core`](/reference/core-api/).

Every interactive entity that has a box projects a **transparent ARIA shadow
node** into the Scene's `a11yRoot` div (above the canvas, `pointerEvents:auto` so
automation/AT can interact; `opacity:0` unless `debugA11y`). Each node carries
`id` + `data-vecto-id`, plus the role/label/state from
[`Entity.getA11yAttributes()`](/reference/core-entity/#a11y--batching-hooks-override-to-opt-in).

The projection root tracks the canvas CSS box: canvas offset and non-uniform CSS
scaling are applied to the shadow and DOM-portal layers while entity geometry
remains in logical Scene coordinates. Arbitrary CSS rotation/skew of the canvas
is not part of this mapping.

`A11yAttributes`:

```ts
{
  // Element + identity
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea';   // default 'div'
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

Every field above is projected to a real attribute each frame with dirty
checking. Returning `undefined` for a field **removes** the attribute, so state
that stops applying disappears rather than going stale — note that `false` is
distinct from `undefined` here (`aria-invalid="false"` means "explicitly valid"
and is preserved).

The sync applies these to a real element (a true `<button>`, `<a href>`, `<img>`,
`<input>`/`<textarea>` with IME-aware `change`/`focus`/`blur`, etc.). This is the
"**canvas performance AND DOM-grade accessibility**" story: visuals are 100%
GPU/canvas, yet a Playwright/agent `getByRole('button', { name })` resolves the
shadow node and clicks it.

## Focus order

Non-natively-focusable interactive roles (`button`, `switch`, `checkbox`, `link`,
`slider`, …) get `tabindex="0"` and Enter/Space → `click`.

**Composite widgets are different.** A `tree`, `grid`, `menu`, `radiogroup`, or
`tablist` is one tab stop, not one per child — so their children use a **roving
tabindex**: exactly one child carries `tabIndex: 0` and the rest `-1`, and arrow
keys move that stop. See [Composite widgets](#composite-widgets-roving-tabindex)
below.

Tab order follows the **visual** reading order, not scene-graph insertion order —
see [`Scene.readingDirection`](/reference/core-scene/#accessibility--appearance)
for RTL.

Set `tabIndex: 0` explicitly when a non-control region such as a design canvas
must enter sequential focus order and receive VMT `keydown` events. Use `-1`
for programmatic focus only; returning `undefined` removes the explicit value.

## Composite widgets (roving tabindex)

A tree, grid, menu, radio group, or tab list must expose **one role per child**,
not just a container role — otherwise AT sees a single opaque box. VectoJS does
this by pooling a transparent, focusable child entity ("hotspot") over each
visible child: it carries the child's `role` + state + roving `tabIndex`, renders
nothing, and the parent owns the keyboard handler.

Crucially these hotspots set `pointerEvents: 'none'`. The component underneath
already owns the mouse (tap-to-toggle, drag-to-scroll, selectable cell text), so
the hotspot must not intercept it — keyboard focus and AT-synthesized `click`
still work through a `pointer-events:none` element.

| Component     | Child role                                                    | Keyboard                                                                                                                                          |
| ------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TreeView`    | `treeitem` (+ `aria-level`, `aria-expanded`, `aria-selected`) | Up/Down move · Right expands then enters · Left collapses then goes to parent · Home/End · Enter/Space activate                                   |
| `Table`       | `row` › `gridcell` / `columnheader`                           | Arrows move in 2D (header is row −1) · Home/End row extremes · Ctrl+Home/Ctrl+End grid corners                                                    |
| `ContextMenu` | `menuitem` (+ `aria-haspopup`, `aria-expanded`)               | Up/Down wrap and skip separators + disabled · Home/End · Right opens submenu · Left returns to parent menu · Enter/Space activate · Escape closes |
| `RadioGroup`  | `radio` (+ `aria-checked`)                                    | Arrows move and select · Home/End · Space selects                                                                                                 |
| `Tabs`        | `tab` (+ `aria-selected`)                                     | Arrows move · Home/End · Space/Enter activate                                                                                                     |

Only the visible children are pooled, so a virtualized `TreeView` or `Table`
projects O(viewport) hotspots rather than one per row in the dataset. The focused
row/cell is scrolled into view before focus moves to it.

## Forced colors (High Contrast)

A canvas is opaque pixels, so the browser's `forced-colors` remapping never
touches what VectoJS draws — under Windows High Contrast a themed control stays
unreadable unless the component repaints itself. Read
[`Scene.forcedColors`](/reference/core-scene/#accessibility--appearance) and draw
with CSS system colors (`ButtonFace`, `ButtonText`, `Highlight`, `Canvas`,
`CanvasText`); the scene repaints automatically when the setting toggles.
`Button` already does this.

## Projection cost at high entity counts (`1.30.0+`)

Every interactive entity with a box gets a shadow node for as long as it stays
interactive. That is right for a button and wrong for thousands of ephemeral,
individually-meaningless entities — particles, danmaku comments, graph nodes —
where it produces one DOM node per entity, every frame.

Measured on 5,000 moving interactive entities:

|                              | Chrome        | Firefox        |
| ---------------------------- | ------------- | -------------- |
| every entity interactive     | 66.4 ms/frame | 114.7 ms/frame |
| `a11yProjection: 'onDemand'` | 2.23 ms       | 1.69 ms        |
| no shadow nodes at all       | 1.35 ms       | 1.75 ms        |

Both eager rows miss even a 60 Hz budget. `'onDemand'` lands at the floor of
projecting nothing, while every entity stays individually reachable.

`Entity.a11yProjection` selects when the node is materialized:

```ts
particle.a11yProjection = 'onDemand';
```

- **`'eager'`** (default) — a node exists while the entity is interactive with a
  box. Unchanged behavior; leave it alone for ordinary controls.
- **`'onDemand'`** — a node exists only while the entity is _engaged_. Use for
  high-cardinality interactive entities.
- **`'never'`** — no node at all. Prefer `interactive = false` unless the entity
  genuinely needs pointer events without semantic presence.

### What counts as engaged

Three signals, any of which is enough. Deliberately **not** hover alone: a
keyboard or screen-reader user generates no pointer events, so a hover-gated node
would be withheld from exactly the users it exists for.

- **Focus.** A focused node is never pruned, so focus cannot be yanked out from
  under someone mid-interaction.
- **The pointer being inside the entity.**
- **An explicit request** — see below.

The entity stays hit-testable on canvas throughout, so a click always reaches it
and promotes it.

```ts
// Keep the selected item projected for as long as it is selected.
scene.requestA11yProjection(selected);
scene.releaseA11yProjection(previous);
```

Both accept an `Entity` or an id string and are idempotent. Releasing does not
remove the node immediately — it survives while focused or under the pointer, and
is pruned on the next sync that finds it unengaged. Both are no-ops for an
`'eager'` entity, which is always projected.

Use an explicit request for anything only the application knows is significant: a
selection, a search hit, an element just announced in a live region.

> [!IMPORTANT]
> An entity that projects **selectable text** of its own is never promoted by the
> pointer. Its shadow node carries `pointer-events: auto` and stacks above the
> transparent text mirror, so materializing one under the pointer swallows the
> `mousedown` and native drag-selection never starts. Focus and explicit requests
> still reach it. This is the same conflict that makes
> [`Text`](/reference/ui-text/) and `RichText` non-interactive by default.

Cardinality is not on its own the criterion for reaching for `'onDemand'`, and
this is the case most likely to be got wrong:

> [!WARNING]
> **Do not apply `'onDemand'` to body text by analogy with particles.** For a
> button or a graph node, the canvas entity is the subject and the shadow node is a
> temporary semantic proxy, so withholding it until engaged loses nothing. For
> prose, Markdown, or a chat transcript the canvas bitmap is not readable by a
> screen reader at all, and _reading is the primary interaction_ for a non-visual
> user rather than an occasional one. Text entities are non-interactive by default
> and their [content projection](/reference/core-renderer/#entitygetcontentprojection)
> — not a shadow node — is what carries their semantics; that projection is
> virtualized per line and stays resident.

Individual reachability is also not the same thing as comprehension:

> [!NOTE]
> `'onDemand'` is not a complete accessibility story on its own. A thousand
> individually reachable danmaku still say nothing collectively. Pair it with one
> aggregate live region (`role: 'status'`, `a11yFullViewport`) plus a small pool of
> persistent hotspots for the current selection, so the DOM node count stays
> constant instead of scaling with entity count.

## Controls & gotchas

- `data-vecto-id` on each shadow node mirrors the entity `id` — the stable handle
  for automation selectors.
- `a11ySyncInterval` (see [`SceneOptions`](/reference/core-scene/#sceneoptions))
  throttles sync during animation and ensures a final catch-up after pending
  motion settles; it does not suspend all sync for the full animation.
- `debugA11y: true` shows the nodes (blue dashed) for development.
- `detachA11y(entity)` prunes a subtree's shadow nodes without removing the
  entity; `remove()` prunes automatically. Per-frame sync **creates/updates but
  never prunes**, so manage churn of interactive children explicitly.
- `getA11yTree()` returns a nested `A11yTreeNode[]` snapshot for assertions;
  `getA11yElement(id)` fetches a specific shadow element.
- `a11yFullViewport` mounts a boundless interaction surface behind all others.
- Since Core 1.11.1, newly projected interactive entities receive their
  canvas paint-order `z-index` during the same frame that creates the shadow
  node. A fresh overlay backdrop therefore sits above older design controls on
  its first pointer interaction instead of waiting for another render pass.

See [Accessibility](/learn/accessibility/) for usage and testing patterns.

## Related

[`Scene`](/reference/core-scene/) (`a11ySyncInterval`, `debugA11y`) ·
[`Entity`](/reference/core-entity/) (`getA11yAttributes()`, `interactive`, `width`/`height`) ·
[`@vectojs/core` overview](/reference/core-api/)
