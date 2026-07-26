---
title: 'Layout engine'
description: 'The standalone @vectojs/layout package (also the @vectojs/core/layout subpath): the cold/hot split that separates expensive text segmentation+measurement from cheap wrap+position arithmetic, streaming memoization, rich text, and exclusion shapes.'
order: 4
---

# Layout engine (cold/hot split) — `@vectojs/layout`

The layout engine is the standalone **`@vectojs/layout`** package (it depends
only on [`@vectojs/text`](/reference/core-text/) for shaping primitives).
[`@vectojs/core`](/reference/core-api/) depends on and re-exports it, so you can
import it from `@vectojs/layout`, `@vectojs/core`, or the `@vectojs/core/layout`
subpath interchangeably.

`LayoutEngine` separates the expensive **cold** pass (segment + measure, via
`Intl.Segmenter`) from the cheap **hot** pass (wrap + position arithmetic), so
resize/reflow/animation does not re-measure.

```ts
new LayoutEngine(maxWidth: number, maxHeight: number, measurer?: GlyphMeasurer | null)

// Cold: segment + measure once → reusable PreparedText
prepare(text, fontAtlas, fontSize = 32): PreparedText
prepareRich(spans: StyledSpan[], fontAtlas, baseFontSize = 32, baseStyle?: TextStyle): PreparedText

// Hot: place a PreparedText into positioned glyphs (reads engine maxWidth/maxHeight)
layoutPrepared(prepared, exclusionMask?, exclusions?: ExclusionRect[]): LayoutResult
layoutPreparedIntoBuffer(prepared, buffer: LayoutResultBuffer, exclusionMask?): void   // reuses typed coordinate storage

// One-shot (cold+hot together)
layoutText(text, fontAtlas, fontSize = 32, exclusionMask?): LayoutResult
layoutTextIntoBuffer(text, fontAtlas, fontSize, buffer, exclusionMask?): void
```

- **Streaming memoization.** `prepare`/`prepareRich` cache per-paragraph results,
  so re-preparing growing text (e.g. an LLM token stream) only measures new
  paragraphs.
- **Rich text.** `StyledSpan = { text, style?: TextStyle }`; `TextStyle =
{ fontSize?, color?, bold?, italic?, href? }`. A mid-word style change is
  honored per-glyph. `fontSize` affects measured width + line height; the rest is
  render metadata carried to the nodes (`PreparedGlyph.style` → `LayoutNode.style`).
- **Exclusions (exclusion shapes).** `computeLineSegments(top, bottom, maxWidth,
exclusions: ExclusionRect[]): LineSegment[]` is the pure, testable core: the
  free `[x0,x1)` intervals on a line band after subtracting overlapping rects.
  O(n log n). Passing `[]`/omitting leaves the single-column path byte-identical.

## Key layout types

- `GlyphAtlas` — `{ [char]: { width, baseSize, ast } }` pre-measured metrics.
- `GlyphMeasurer` — `{ measure(char, fontSize): number }`; supply your own or use
  `createCanvasMeasurer(fontFamily?, baseSize?)` (offscreen `measureText`,
  linear-scaled + cached; returns `null` in DOM-free envs → engine keeps a
  `0.5em` fallback).
- `PreparedText` → `PreparedParagraph[]` → `PreparedWord[]` → `PreparedGlyph[]`.
- `LayoutResult` — `{ nodes: LayoutNode[], totalWidth, totalHeight,
fallbackToCanvas? }`; `LayoutNode` is one positioned glyph.
- `LayoutResultBuffer` — flat typed-array result (`xs/ys/ws/hs`, `chars`,
  `levels`, `count`, `CAPACITY = 16384`); `reset()` before reuse, `toLayoutResult()` to
  materialize. `levels` is the per-glyph resolved BiDi embedding level (even =
  LTR, odd = RTL), so a consumer can tell a glyph's direction; the buffer path
  uses it to reorder each line to visual order. Glyphs come out in **visual**
  order with a shared baseline, matching the allocating path glyph-for-glyph.
- `LayoutWorkerManager.getInstance()` — singleton for off-thread layout;
  `queueLayout(entityId, text, { fontId, fontSize, maxWidth, maxHeight, callback,
... })` / `cancelLayout(entityId)`. Used by [`MSDFTextEntity`](/reference/core-text/#msdftextentity).

See [Text & Typography](/learn/text-typography/) for usage, and
[Text & Bidi](/reference/core-text/) for the font/glyph rendering layer that
consumes this engine's output.

## Related

[Text & Bidi](/reference/core-text/) · [`Entity`](/reference/core-entity/) ·
[`@vectojs/core` overview](/reference/core-api/)
