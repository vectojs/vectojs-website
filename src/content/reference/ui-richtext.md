---
title: 'UI: RichText'
description: 'Multi-style inline text component with link hotspots and streaming append support.'
order: 17
---

# `RichText`

`RichText` flows mixed spans on shared baselines: bold, italic, color, size, and inline links.
The projection reconstructs logical source runs rather than shaped visual glyphs, preserving exact
clipboard text through mixed font sizes, ligatures, Arabic/Hebrew text, soft wrapping, and hard breaks.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · RichText</span></div>
  <iframe src="/sandbox/ui/component.html?name=richtext&v=core-1.31.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="RichText live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>The inline link is a transparent anchor hotspot over the canvas text.</figcaption>
</figure>

## Minimal example

```ts
import { RichText } from '@vectojs/ui';

const copy = new RichText(
  [
    { text: 'Mixed ' },
    { text: 'weight', style: { bold: true, color: '#22d3ee' } },
    { text: ' with ' },
    { text: 'links', style: { href: '/learn/accessibility/' } },
  ],
  {
    maxWidth: 420,
    selectable: true,
    onLinkClick: (href) => router.open(href),
  },
);
```

## Maintainer checklist

- Keep link callbacks wired through paragraph, heading, and list renderers.
- Use `appendSpans()` for token streaming.
- `getContentProjection()` carries one explicit visual row with per-run fonts,
  a shared Canvas baseline, and the actual line advance. This keeps mixed-size
  selection rectangles aligned instead of letting the browser re-flow spans.
  Logical separators belong to the preceding positioned row, so multiline
  selection never creates a stray root-origin highlight fragment.
  Core 1.8 resolves legal grapheme carets from transformed two-dimensional
  Range geometry, including rotation, reflection, and non-uniform scale.
  Use `setSelectable(false)` when native drag selection is not desired.
- Use `setExclusions()` when text must flow around local rectangles.
