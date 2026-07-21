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
```

Lightweight built-in bidi: range-based direction classes (Hebrew/Arabic R/AL,
EN/AN digits) and Arabic contextual presentation-form selection. `indexMap` maps
shaped indices back to the source string for hit-testing / caret mapping.

See [Text & Typography](/learn/text-typography/) for usage.

## Related

[Layout engine](/reference/core-layout/) (the cold/hot pass this renders) ·
[Renderers](/reference/core-renderer/) (WebGL point layer, content projection) ·
[`@vectojs/core` overview](/reference/core-api/)
