---
title: 'UI: Resizable panels'
description: 'PanelGroup, Panel, and PanelResizeHandle for draggable split-pane layouts.'
order: 44
---

# Resizable panels

The resizable panel exports work together: `PanelGroup` splits space, `Panel` owns a clipped content
region, and `PanelResizeHandle` is inserted automatically between panels.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · PanelGroup</span></div>
  <iframe src="/sandbox/ui/component.html?name=resizablepanel&v=ui-bundle-2" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Resizable panel live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Drag the divider between panels to inspect handle hover and resize behavior.</figcaption>
</figure>

## Minimal example

```ts
import { Panel, PanelGroup, Text } from '@vectojs/ui';

const group = new PanelGroup({ direction: 'horizontal', width: 640, height: 360 });
group
  .addPanel(new Panel({ minSize: 160 }).setContent(new Text('Sidebar')))
  .addPanel(new Panel({ minSize: 260 }).setContent(new Text('Canvas')));
```

## Maintainer checklist

- Preserve each panel's `minSize` when dragging.
- Call `resize(width, height)` when the host container changes size.
- Keep nested `PanelGroup` instances inside a `Panel` content boundary.
