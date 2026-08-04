---
title: 'UI: Resizable panels'
description: 'PanelGroup, Panel, and PanelResizeHandle for draggable split-pane layouts.'
order: 35
---

# Resizable panels

The resizable panel exports work together: `PanelGroup` splits space, `Panel` owns a clipped content
region, and `PanelResizeHandle` is inserted automatically between panels.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · PanelGroup</span></div>
  <iframe src="/sandbox/ui/component.html?name=resizablepanel&v=core-1.30.0-ui-2.12.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Resizable panel live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Drag the divider between panels to inspect handle hover and resize behavior.</figcaption>
</figure>

## Minimal example

```ts
import { Panel, PanelGroup, Stack, Text } from '@vectojs/ui';

const group = new PanelGroup({ direction: 'horizontal', width: 640, height: 360 });
group
  // Sidebar content is a Stack, which is meant to be sized to fill its
  // viewport — the default `fit: true` keeps it matching the panel's box
  // on every resize/drag, closing the exact gap that used to require a
  // hand-written `content.width = panel.width` sync (see "Sizing hosted
  // content" below).
  .addPanel(
    new Panel({ minSize: 160 }).setContent(
      new Stack({ direction: 'vertical' }).add(new Text('Sidebar')),
    ),
  )
  .addPanel(
    new Panel({ minSize: 260 }).setContent(
      new Stack({ direction: 'vertical' }).add(new Text('Canvas')),
    ),
  );
```

## Sizing hosted content (`setContent`)

`Panel.setContent(content, fit?)` keeps the hosted content's `width`/`height`
synced to the panel's own box by default (`fit: true`, both axes) — including
on every subsequent `PanelGroup` divider drag or `resize()` call, not just at
`setContent()` time. This closes a real gap: previously `setContent` only
positioned content (`content.x = 0; content.y = 0`), so an app had to
hand-sync `content.width = panel.width` itself on every resize, and missing
that sync in one spot in a deep component chain produced a real clip-overflow
bug in production.

```ts
panel.setContent(myLayout); // tracks both width and height (default)
panel.setContent(myLayout, false); // old position-only behavior
panel.setContent(myLayout, { width: true, height: false }); // width only
```

**Pass `fit: false` for self-sizing content** — an entity whose own
`width`/`height` are derived from its content rather than author-set (e.g. a
bare `Text` with no `maxWidth`, which recomputes its own box from
`result.totalWidth`/line count on every `setText()`/`setMaxWidth()` call).
Letting the default `fit: true` force such an entity's box to the panel's
box every frame overwrites its self-computed size — harmless for `Text`'s own
`render()` (which draws from its cached `lines`, not from `width`/`height`
directly), but it does corrupt anything else that reads that entity's
`width`/`height` for layout: hit-testing, its a11y shadow element's size, and
scene audits. Wrap self-sizing content in a `Stack`/`Flow` (which are
themselves fine to `fit`, since positioning children — not self-sizing — is
their whole job) if you want it centered/filled inside a panel, or pass
`fit: false` and size it yourself.

## Maintainer checklist

- Preserve each panel's `minSize` when dragging.
- Call `resize(width, height)` when the host container changes size.
- Keep nested `PanelGroup` instances inside a `Panel` content boundary.
- Pass `fit: false` to `setContent()` for self-sizing content (bare `Text`
  without `maxWidth`, or any entity whose own layout computes its box) —
  the default `fit: true` is right for layout containers (`Stack`, `Flow`,
  another `PanelGroup`) but would overwrite a self-sizing entity's box every
  frame.
