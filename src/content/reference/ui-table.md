---
title: 'UI: Table'
description: 'Canvas-native grid table for compact data previews and Markdown table output.'
order: 40
---

# `Table`

`Table` draws headers, rows, borders, and cell text on canvas while exposing `role="grid"`.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Table</span></div>
  <iframe src="/sandbox/ui/component.html?name=table" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Table live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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
});
```

## Maintainer checklist

- Keep `colWidths` length aligned with headers.
- Use virtualization for large data sets; `Table` is for compact grids.
- Keep the grid label descriptive.
