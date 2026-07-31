---
title: 'Text & Bidi'
description: 'The standalone @vectojs/text package (also the @vectojs/core/text subpath): typography metrics, MSDF font parsing, Arabic shaping and the bidi resolver, plus the core-resident MSDFTextEntity/GridTextEntity GPU text renderers.'
order: 7
---

# Text & Bidi — `@vectojs/text`

The text-shaping primitives — `BidiResolver`, `ArabicShaper`, `Typography`,
`MSDFFont`, `prepareContentGrid`/`PreparedContentGrid` — are the standalone
**`@vectojs/text`** package (a leaf package depending only on `bidi-js`). The
`Entity`-based GPU text renderers (`MSDFTextEntity`, `SVGEntity`,
`TextEntity`/`GridTextEntity`) stay in [`@vectojs/core`](/reference/core-api/)
because they extend `Entity`. Core re-exports the `@vectojs/text` primitives, so
they resolve from `@vectojs/text`, `@vectojs/core`, or the `@vectojs/core/text`
subpath. Built on the [Layout engine](/reference/core-layout/)'s cold/hot split.

## MSDFFont

```ts
new MSDFFont(data: MSDFFontData)
MSDFFont.parse(json: string | MSDFFontData): MSDFFont   // reads msdf-atlas-gen JSON
font.getGlyph(unicode: number): MSDFGlyphDef | undefined
font.layout(text, fontSizePx, opts?: MSDFLayoutOptions): MSDFLayoutResult   // honors \n, kerning, letterSpacing
font.distanceRange / font.atlasWidth / font.atlasHeight
```

Parses the de-facto `msdf-atlas-gen` JSON and lays text into CSS-pixel quads with
atlas UVs (y-down local space; v=0 at atlas top). Pair `layout()` with the WebGL
backend's `setMSDFTexture` + `addGlyph` (see [WebGL point layer](/reference/core-renderer/#webgl-point-layer))
for resolution-independent GPU text. Types:
`MSDFFontData`, `MSDFAtlasInfo`, `MSDFMetrics`, `MSDFGlyphDef`, `MSDFBounds`,
`MSDFKerning`, `PositionedGlyph`, `MSDFLayoutResult`, `MSDFLayoutOptions`.

## MSDFTextEntity

```ts
new MSDFTextEntity(text: string, options: MSDFTextEntityOptions)
// options: { font: MSDFFont, texture: TexImageSource, fallbackFont?, fontSize?, color?, lineHeight?, letterSpacing? }
setText(text: string): void
```

Renders crisp MSDF glyphs through the WebGL point layer when the scene runs
`pointBackend: 'webgl'`; otherwise falls back to Canvas2D `fillText` with
`fallbackFont`. Layout is computed **off-thread** via `LayoutWorkerManager` and
applied on callback, calling `markDirty()` — so text appears one async tick after
construction/`setText`.

## TextEntity & GridTextEntity (from `.`)

```ts
new TextEntity(text: string, atlas: GlyphAtlas, maxWidth: number, fontSize = 32)
text.setText(text): this        // cold pass (re-segment + re-measure), then reflow
text.setMaxWidth(maxWidth): this // hot pass only — reuses cached PreparedText (cheap responsive resize)
text.setTextAlign(align: 'left' | 'justify'): this
text.setHyphenator(fn: ((word: string) => string[]) | null): this

new GridTextEntity(_atlas: any, fontSize = 10)
grid.updateGrid(ascii: string[])   // monospace cell grid; interactive=false (a11y off for perf)
```

`setTextAlign('justify')` stretches wrapped lines flush to `maxWidth` (inter-word
spaces, or inter-character gaps on space-less CJK lines); the last line of each
paragraph stays ragged. `setHyphenator()` plugs a word → parts function (e.g. the
`hyphen` npm package's Knuth–Liang patterns) so long words can break mid-word
with a visible `-`; soft hyphens (U+00AD) already in the source text work without
a hyphenator. Both apply because `TextEntity` renders **per glyph** at each
node's computed `x` — the justification/hyphenation math is visually honored.

`MSDFTextEntity` and the `@vectojs/ui` `Text`/`RichText` components share the same
underlying `LayoutEngine`, but do not yet expose these two methods — `Text`/`RichText`
render each wrapped line as one native `fillText()` call for performance, which
would silently discard per-glyph justification offsets even if the option were
exposed. Use `TextEntity` directly (or drive a raw `LayoutEngine` with `textAlign`/
`hyphenate` set) when you need justified or hyphenated text today.

## Bidi / shaping

```ts
ArabicShaper.shapeArabic(text: string): ShapedResult   // { shapedText, indexMap: Int32Array } — presentation-form joining
BidiResolver.getBaseLevel(text: string): number
BidiResolver.resolveLevels(text: string): Uint8Array
BidiResolver.reorderVisual(nodes: any[], baseLevel: number): void
BidiResolver.reorderSegments(str: string, levels: Uint8Array, baseLevel: number):
  Array<[number, number]>
```

Lightweight built-in bidi: range-based direction classes (Hebrew/Arabic R/AL,
EN/AN digits) and Arabic contextual presentation-form selection. `indexMap` maps
shaped indices back to the source string for hit-testing / caret mapping.

`reorderVisual` reorders an array of node objects in place. `reorderSegments`
exposes the same UAX #9 **L2** reversal ranges (inclusive `[start, end]` index
pairs over the run's own positions) without requiring node objects, so a caller
holding **parallel typed arrays** can apply the identical permutation in place —
that is what the zero-GC buffer layout path uses. `reorderVisual` now delegates to
it, so the two can't drift.

See [Text & Typography](/learn/text-typography/) for usage.

## Headless text metrics

```ts
registerFontMetrics(family: string, source: FontMetricsSource): void
registerMSDFFontMetrics(family: string, font: MSDFFont | MSDFFontData | string)
createMSDFMetricsSource(font: MSDFFont): FontMetricsSource
getFontMetrics(family: string): FontMetricsSource | undefined
hasFontMetrics(): boolean
fontMetricsVersion(): number
clearFontMetrics(): void
```

Text measurement normally goes through a Canvas 2D context, which measures the
font the renderer will actually draw. Without one — Node SSR, a worker with no
`OffscreenCanvas` — there is nothing to measure with, and every glyph
advance falls back to a flat `0.5em`. Measured against Chrome at 32px
`sans-serif` that is wrong by **+125%** on narrow text and **−47%** on wide,
and `iiiiiiiiii` comes out exactly as wide as `WWWWWWWWWW`. Wrapping inherits
the error, so line breaks land in the wrong places too.

Register metrics once at startup to fix it. Any `msdf-atlas-gen` JSON works,
and only its `glyphs[].advance`, `kerning`, and `metrics` are read — the atlas
image is irrelevant, so a metrics-only file is enough and nothing decodes:

```ts
import { registerMSDFFontMetrics } from '@vectojs/core';

registerMSDFFontMetrics('sans-serif', await readFile('inter.json', 'utf8'));
```

A family is matched case-insensitively with quotes stripped, and a
comma-separated list registers only its first family. Registering the same
family again replaces the previous source, and `clearFontMetrics()` drops
everything (useful for test isolation, since the registry is process-wide).

Supply a source directly for a font that is not MSDF:

```ts
interface FontMetricsSource {
  advanceEm(char: string): number | undefined; // required
  measureEm?(text: string): number | undefined; // honors kerning
  ascenderEm?: number; // for cssLineBoxBaseline
  descenderEm?: number;
}
```

Three paths consult the registry: per-glyph advances in the layout engine,
whole-string widths in `@vectojs/ui` (which size `Button`, `Input`, `Link`,
`Checkbox`, `ContextMenu`, `ProgressBar`), and the baseline in
`cssLineBoxBaseline`, which needs `ascenderEm`/`descenderEm`.

> [!IMPORTANT]
> A real Canvas 2D context always wins, so registering metrics cannot change
> what a browser measures or draws. These exist to replace a fabricated guess,
> not to override the engine that will render the text.

`measureEm` is worth supplying. The per-glyph contract is
`measure(char, fontSize, family)` and has no neighbouring character, so summed
advances cannot recover kerning — around 10% on kern-heavy strings. Whole-string
measurement goes through `measureEm` and is exact.

To check whether any text was measured with fabricated advances,
`unmeasuredGlyphCount()` from [`@vectojs/layout`](/reference/core-layout/)
counts them, and a one-time console warning names the fix. It is distinct from
`LayoutResult.fallbackToCanvas`, which only reports an **atlas** miss and is
true on essentially every paragraph even in a browser.

## Related

[Layout engine](/reference/core-layout/) (the cold/hot pass this renders) ·
[Renderers](/reference/core-renderer/) (WebGL point layer, content projection) ·
[`@vectojs/core` overview](/reference/core-api/)
