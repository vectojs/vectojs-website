---
title: 'UI: Table'
description: 'Canvas-native grid table for compact data previews and Markdown table output.'
order: 31
---

# `Table`

`Table` exposes `role="grid"`, paints its chrome on canvas, and owns each cell
as a child Entity. String cells are normalized to `Text`; supplied Entity cells
can participate through public `setMaxWidth()` and `setSelectable()` capabilities.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Table</span></div>
  <iframe src="/sandbox/ui/component.html?name=table&v=core-1.15.0-ui-2.0.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Table live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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
The structural `role="grid"` shadow does not capture pointer events from cell
projections. This leaf ownership is what keeps cross-cell drag selection,
Ctrl/Command+C, and find-in-page aligned with the VMT text exactly once.

## Maintainer checklist

- Keep `colWidths` length aligned with headers; valid widths are normalized to the Table width.
- Use a unique Entity instance per logical cell.
- Call `layout()` after cell content or dimensions change.
- Use virtualization for large data sets; `Table` is for compact grids.
- Keep the grid label descriptive.
- Verify drag selection across headers/body cells after changing widths or application zoom.
