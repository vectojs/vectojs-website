---
title: 'UI: TreeView'
description: 'Hierarchical tree component with eager or lazy child loading.'
order: 34
---

# `TreeView`

`TreeView` renders hierarchical rows with expansion state and optional lazy child loading.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · TreeView</span></div>
  <iframe src="/sandbox/ui/component.html?name=treeview&v=core-1.28.0-ui-2.10.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="TreeView live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Click parent rows to expand or collapse them.</figcaption>
</figure>

## Minimal example

```ts
import { TreeView } from '@vectojs/ui';

const tree = new TreeView({
  width: 280,
  height: 360,
  nodes: [
    {
      id: 'packages',
      label: 'packages',
      children: [{ id: 'ui', label: 'ui' }],
    },
  ],
});
```

## Options

| Option                                         | Type             | Default | Notes                                                                                                |
| ---------------------------------------------- | ---------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| `nodes`                                        | `TreeNode[]`     | —       | Root nodes. A node's `children` may be an array **or** `() => Promise<TreeNode[]>` for lazy loading. |
| `width` / `height`                             | `number`         | —       | Viewport box. Rows are virtualized to it.                                                            |
| `rowHeight`                                    | `number`         | `28`    | Row pitch.                                                                                           |
| `font`, `color`, `selectedColor`, `hoverColor` | `string`         | theme   | Row painting.                                                                                        |
| `onSelect`                                     | `(node) => void` | —       | Fires when a leaf is activated.                                                                      |
| `onExpand`                                     | `(node) => void` | —       | Fires when a parent expands.                                                                         |

`setNodes(nodes)` replaces the tree; expansion/selection are keyed by node `id`,
so stable IDs preserve state across a replacement.

## Accessibility & keyboard

`TreeView` projects one `role="treeitem"` per **visible** row — a transparent,
focusable hotspot pooled over the row, carrying `aria-level` (depth), the row's
`aria-expanded` (parents only), `aria-selected`, and a **roving tabindex** so the
whole tree is a single tab stop.

| Key           | Action                                                                    |
| ------------- | ------------------------------------------------------------------------- |
| Down / Up     | Move to the next / previous row                                           |
| Right         | Expand a collapsed parent; if already expanded, step into the first child |
| Left          | Collapse an expanded parent; otherwise step to the parent row             |
| Home / End    | First / last row                                                          |
| Enter / Space | Activate (toggle a parent, select a leaf)                                 |

The active row is scrolled into view before focus moves to it. Because only
visible rows are pooled, a 100k-node tree still projects O(viewport) nodes.

The hotspots set `pointerEvents: 'none'` so the tree keeps its own mouse handling
(tap-to-toggle and drag-to-scroll) — keyboard focus and AT-synthesized `click`
still pass through. See
[Composite widgets](/reference/core-a11y/#composite-widgets-roving-tabindex).

## Pointer & touch

- **Tap** a row to toggle/select. The toggle fires on `pointerup`, and only if the
  pointer moved less than ~6px — so a touch drag doesn't accidentally expand the
  row it started on.
- **Drag** vertically to scroll (the rows follow the finger 1:1), same as
  `ScrollView` / `VirtualList`.
- **Wheel** scrolls.

## Maintainer checklist

- Rebuild rows after expansion, collapse, or node replacement.
- Keep lazy loaders idempotent.
- Use stable node IDs for selection and expansion state.
- Don't add a competing pointer handler to a row: the component owns
  tap-vs-drag disambiguation, and the a11y hotspots deliberately don't capture
  the pointer.
