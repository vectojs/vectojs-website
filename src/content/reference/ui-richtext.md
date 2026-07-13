---
title: 'UI: RichText'
description: 'Multi-style inline text component with link hotspots and streaming append support.'
order: 26
---

# `RichText`

`RichText` flows mixed spans on shared baselines: bold, italic, color, size, and inline links.
The projection reconstructs logical source runs rather than shaped visual glyphs, preserving exact
clipboard text through mixed font sizes, ligatures, Arabic/Hebrew text, soft wrapping, and hard breaks.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · RichText</span></div>
  <iframe src="/sandbox/ui/component.html?name=richtext&v=ui-bundle-3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="RichText live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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
  Use `setSelectable(false)` when native drag selection is not desired.
- Use `setExclusions()` when text must flow around local rectangles.
