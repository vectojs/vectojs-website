---
title: 'UI: Table'
description: 'Canvas-native grid table for compact data previews and Markdown table output.'
order: 31
---

# `Table`

`Table` projects a full `grid` › `row` › `gridcell`/`columnheader` tree, paints
its chrome on canvas, and owns each cell as a child Entity. String cells are normalized to `Text`; supplied Entity cells
can participate through public `setMaxWidth()` and `setSelectable()` capabilities.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Table</span></div>
  <iframe src="/sandbox/ui/component.html?name=table&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Table live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Use focused demos for column sizing instead of debugging table output inside a giant gallery.</figcaption>
</figure>

## Minimal example

```ts
import { Table } from '@vectojs/ui';

const table = new Table({
  width: 520,
  headers: ['Component', 'Role'],
  rows: [
    ['Button', 'button'],
    ['Input', 'textbox'],
  ],
  selectable: true,
});
```

`layout()` constrains every cell, calculates row/table heights, and positions
children before rendering. `render()` is draw-only. Call `table.layout()` after
changing an externally supplied Entity cell or after mutating the public string
data. Each logical cell owns one content projection, so browser selection and
find-in-page do not duplicate table text.

Selection is cell-owned rather than table-owned: string cells normalize to
selectable `Text`, supplied entities receive `setSelectable()` when supported,
and Markdown tables inherit the same contract. A drag across cells therefore
copies logical cell text once while Canvas remains the only visual renderer.
Neither the structural `role="grid"` shadow nor the `row`/`gridcell` a11y
hotspots capture pointer events from cell projections — they all set
`pointerEvents: 'none'` precisely so the cell's selectable text keeps the mouse. This leaf ownership is what keeps cross-cell drag selection,
Ctrl/Command+C, and find-in-page aligned with the VMT text exactly once.

## Responsive width: `setWidth()`

```ts
table.setWidth(width: number): this
```

Changes the total width, rescales columns proportionally, and re-lays out
(`2.11.0+`). Use it instead of assigning `width`, which is not enough on its own:
`colWidths` is resolved **once in the constructor** from the width given there,
and every cell's wrap width, position, and alignment derives from those
per-column figures rather than from `width`. A table whose `width` was reassigned
therefore paints its chrome at the new size while its cells stay laid out for the
old one.

Columns keep their relative proportions, so an explicit `colWidths` ratio
survives a resize rather than being re-split equally on the first call. It
no-ops on an unchanged width, clamps to a minimum of 1, and returns `this`.

## Accessibility & keyboard

The projected tree is a real ARIA grid: a pinned header `row` of `columnheader`s
plus one `row` per **visible** body row (virtualization-aware), each cell a
focusable `gridcell` hotspot. Exactly one cell holds the **roving tabindex**, so
the whole grid is one tab stop.

| Key                  | Action                                                      |
| -------------------- | ----------------------------------------------------------- |
| Arrows               | Move the focused cell one step in 2D (the header is row −1) |
| Home / End           | First / last column of the current row                      |
| Ctrl+Home / Ctrl+End | First header cell / last body cell                          |

The target cell is scrolled into view before focus moves to it. See
[Composite widgets](/reference/core-a11y/#composite-widgets-roving-tabindex).

## Pointer & touch

- **Drag across cells** selects their text natively (the cell projection owns the
  pointer — see above).
- **Drag vertically** on a virtualized body scrolls it 1:1 with the finger, so the
  table is usable on a touchscreen and not only with a wheel.
- **Wheel** scrolls a virtualized body.

## Maintainer checklist

- Keep `colWidths` length aligned with headers; valid widths are normalized to the Table width.
- Use a unique Entity instance per logical cell.
- Call `layout()` after cell content or dimensions change.
- Use virtualization for large data sets; `Table` is for compact grids.
- Keep the grid label descriptive.
- Verify drag selection across headers/body cells after changing widths or application zoom.
- Verify keyboard navigation reaches every cell after changing virtualization or column count.
