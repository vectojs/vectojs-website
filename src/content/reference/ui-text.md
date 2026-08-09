---
title: 'UI: Text'
description: 'Canvas text component with wrapping, hot max-width reflow, and a semantic label.'
order: 16
---

# `Text`

`Text` renders single-style multi-line text on canvas. It is the default choice for labels, helper
copy, headings, and short read-only text inside VectoJS UI. Its transparent content projection keeps
the exact logical source text across soft wraps, explicit newlines, CJK text, ligatures, and RTL
paragraphs, so native selection, copy, find-in-page, and translation do not inherit visual glyph order.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Text</span></div>
  <iframe src="/sandbox/ui/component.html?name=text&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Text live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Resize the page to inspect hot `maxWidth` reflow in a focused viewport.</figcaption>
</figure>

## Minimal example

```ts
import { Text } from '@vectojs/ui';

const heading = new Text('Mathematical canvas UI', {
  font: '700 24px Inter, system-ui',
  color: '#f8fafc',
  maxWidth: 360,
  lineHeight: 32,
  selectable: true,
});

scene.add(heading.setPosition(24, 24));
```

## Maintainer checklist

- Use `setMaxWidth()` for responsive width changes.
- Use `setText()` or `append()` for content changes.
- Use `setSelectable(false)` when drag gestures should own the text region instead of browser selection.
- Keep application source in logical Unicode order; VectoJS and the browser resolve Arabic/Hebrew direction automatically.
- Core 1.8 resolves pointer carets in transformed two-dimensional geometry; do not add viewport-X-only selection handlers for rotated, mirrored, or non-uniformly scaled text.
- Prefer `RichText` when inline styles or links are required.
