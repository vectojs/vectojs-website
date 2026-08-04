---
title: 'Renderers'
description: 'The @vectojs/core/renderer subpath: the backend-agnostic IRenderer contract, CanvasRenderer, SVGRenderer, the WebGL point/rect/sprite/MSDF layer, Entity content projection, and parseColorToRGBA.'
order: 5
---

# Renderers — `@vectojs/core/renderer`

Part of [`@vectojs/core`](/reference/core-api/).

## IRenderer

Backend-agnostic drawing surface every `Entity.render` receives.

```ts
interface IRenderer {
  readonly pixelRatio?: number; // device px per CSS px of the backing store (1.29.0+)

  clear(): void;
  save(): void;
  restore(): void;
  translate(x, y): void;
  scale(x, y): void;
  rotate(angle): void; // radians, clockwise
  setGlobalAlpha(alpha): void; // [0,1]
  clip(x, y, width, height): void; // intersect clip rect (wrap in save/restore)

  beginPath(): void;
  moveTo(x, y): void;
  lineTo(x, y): void;
  bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y): void;
  closePath(): void;
  arc(x, y, radius, startAngle, endAngle, counterclockwise?): void;
  roundRect(x, y, width, height, radii: number | number[]): void;

  drawImage(source: CanvasImageSource, dx, dy, dw, dh): void;
  fill(colorOrGradient: string | any): void;
  stroke(colorOrGradient: string | any, lineWidth = 1): void;
  fillText(text, x, y, font, color): void; // font = CSS shorthand, e.g. '16px monospace'

  fillCircle(cx, cy, radius, color, alpha = 1): void; // order-preserving same-style batch
  flush(): void; // commit pending batch (no-op when idle)
  present?(): void; // optional end-of-frame commit
  createLinearGradient(x0, y0, x1, y1, colorStops: { stop; color }[]): any;
  dispose?(): void; // idempotent backend cleanup; Scene.destroy() calls it

  // GPU context loss (optional; implement for a GPU-backed renderer)
  isContextLost?(): boolean; // Scene skips the render pass while true
  onContextRestored?(cb: () => void): void; // Scene repaints the cleared surface
}
```

`IRenderer` is **method-based** on purpose: a mutable Canvas2D-style property
like `globalAlpha` or `strokeStyle` has no batch boundary, whereas passing
style with the draw call (`stroke(color, lineWidth)`,
`setGlobalAlpha(alpha)`) lets `CanvasRenderer` coalesce by color+alpha and
lets a GPU backend honour it per-draw instead of as ambient state. There is
deliberately no `globalAlpha`, `strokeStyle`, `lineWidth`, `fillStyle`, or
`font` **property** — use the methods above.

> [!IMPORTANT]
> Writing `r.globalAlpha = 0.5` or `r.strokeStyle = '#fff'` instead of calling
> the method compiles on untranspiled JS (nothing type-checks a plain object
> assignment) and is a **silent no-op**: it attaches an expando to the
> renderer and the underlying context keeps its previous value. Since
> `1.27.0`, dev mode catches this: `CanvasRenderer` and `SVGRenderer` warn
> once per property per instance and name the method to use instead. Enable
> with the same `Scene.devMode` / `globalThis.__DEV__` /
> `NODE_ENV=development` detection used for the `SceneOptions` warning above;
> production pays nothing.

### `pixelRatio` — rasterizing pixels that get blitted

Device pixels per CSS pixel of the ratio **already applied** to the drawing
context (`1.29.0+`). Read it instead of `window.devicePixelRatio` whenever you
rasterize a texture that will be blitted into the renderer, and key any cache of
such textures on it.

The two values differ, in two ways that both corrupt a blit:

- a backend **clamps** (`CanvasRenderer.maxDPR`, `SceneOptions.maxDPR`), so
  rasterizing at the window's ratio produces a texture the scaled context then
  resamples;
- `window.devicePixelRatio` changes the instant a zoom lands, while the backing
  store is only reallocated when something calls `resize()`. A live read during
  that window reports the **future** ratio, so a cache keyed on it rasterizes for
  a scale the context has not adopted yet — the same defect inverted.

A value captured once at module scope is worse than either: it cannot follow a
zoom or a monitor move at all. That is the defect this property exists to make
fixable, and `Markdown`'s code-glyph atlas pool is the in-repo consumer — it keys
a bounded LRU of `GlyphRasterAtlas` instances on this value, which is what stops
code from blurring after a browser zoom.

It is optional and a **live** read rather than a snapshot: a backend with no
backing store of its own omits it, and a caller treats the absence as `1`.
`CanvasRenderer` records the ratio it actually applied at all three points that
scale the context — construction, `resize()`, and `contextrestored` recovery — so
the value stays truthful even after a GPU reset that lands across a zoom.

### Surviving GPU context loss

A GPU reset or memory-pressure eviction takes the drawing context away; without
handling it the surface stays permanently blank. A renderer that owns a GPU
context should:

1. listen for its loss event and `preventDefault()` it — otherwise the browser
   never fires the corresponding restore event;
2. report `isContextLost() === true` so `Scene.render` skips the pass instead of
   issuing draw calls against a dead context;
3. on restore, re-acquire the context, re-apply the DPR transform/size, and fire
   the `onContextRestored` callback so the Scene repaints the freshly cleared
   surface.

`CanvasRenderer` does this for Canvas2D, and `ThreeRenderer` for WebGL — see
[`@vectojs/three`](/reference/three-renderer/#gpu-context-loss--runtime-dpr).

`fillCircle` coalesces consecutive same-`color`/`alpha` calls into one path,
committed on `flush()` (or when style changes). The Scene flushes at the end of
each sibling group and each frame, preserving painter's order.

## `Entity.getContentProjection()`

```ts
getContentProjection(hint?: ContentProjectionHint): ContentProjection | null // default null
// ContentProjection: {
//   text: string; font?: string; lineHeight?: number; selectable?: boolean;
//   contentX?: number; contentY?: number; baseline?: number;
//   lines?: Array<{ text; x; y; baseline; font?; lineHeight?; runs? }>;
//   grid?: PreparedContentGrid;
// }
```

Opt-in hook for entities that render static text: the Scene mirrors the returned
string as a transparent, position-synced DOM node (viewport-lazy, dirty-checked,
`aria-hidden` when the entity is interactive), making canvas text findable,
screen-reader/crawler-visible, translatable, and — with `selectable: true` —
natively selectable. `TextEntity`/`MSDFTextEntity` (see [Text &
Bidi](/reference/core-text/)) implement it. Scene-wide off switch: `new
Scene(canvas, { contentProjection: false })`.

The Scene preserves VMT order when projection nodes appear or disappear, removes
descendant projections with their entity subtree, and hides a projection when it
is fully outside the viewport or a `clipChildren` ancestor. Tooling can inspect
a currently materialized mirror without querying the DOM:

```ts
scene.getContentElement(entityId): HTMLElement | undefined;
```

Virtualized or non-materialized off-viewport text is not searchable until the
application brings it into the active scene.

> Requires Core 1.6.0 or later: Canvas accepts text positions as
> baselines while CSS accepts line boxes. For exact selection geometry, provide
> `contentX`/`contentY` and `baseline` for a simple text run, or one explicit
> `lines` entry per visual row when the component already owns wrapping,
> insets, or mixed typography. Scene maps those local coordinates through the
> entity transform and synchronizes CSS line boxes with Canvas font metrics.

```ts
getContentProjection() {
  return {
    text: 'small large',
    selectable: true,
    lines: [{
      text: 'small large', x: 18, y: 12, baseline: 25,
      font: '28px sans-serif', lineHeight: 42,
      runs: [
        { text: 'small ', font: '16px sans-serif' },
        { text: 'large', font: 'bold 28px sans-serif' },
      ],
    }],
  };
}
```

Use `cssLineBoxBaseline(font, lineHeight)` in custom Canvas-native editors when
the same text must align with a native control or content projection.

> Core 1.8 adds `prepareContentGrid(source, metrics)` for code-like renderers.
> Return its immutable result as `ContentProjection.grid` and use the same
> cells for Canvas paint. The grid retains UTF-16 source ranges, legal grapheme
> carets, CR/LF/CRLF separators, tabs, wide CJK and emoji advances, Arabic
> shaping, and Unicode bidi positions while the projected DOM keeps exact
> logical source for copy and find.

```ts
const grid = prepareContentGrid(source, {
  font: codeFont,
  cellWidth,
  lineHeight: 24,
  baseline: 18,
});

getContentProjection() {
  return { text: source, selectable: true, grid };
}
```

### Line windowing with `ContentProjectionHint` (`1.30.0+`)

Off-viewport entities are skipped entirely, but an entity **taller than the
viewport** always passes that gate — and used to then mirror every one of its
lines. A long document produced a DOM node per visual line for the whole thing
(measured: 14.8k elements for a 346 KB Markdown document).

Scene now passes a hint describing the entity-local vertical band worth
projecting, and mirrors only the lines inside it:

```ts
interface ContentProjectionHint {
  minY?: number; // entity-local top of the band worth projecting
  maxY?: number; // entity-local bottom
}
```

Honoring it is optional — ignore the argument and everything still works, just
without the saving. Measured on a 4,000-line document:

|              | before        | after           |
| ------------ | ------------- | --------------- |
| Chrome       | 4.21 ms/frame | 0.20 ms (21.1x) |
| Firefox      | 4.83 ms/frame | 0.14 ms (34.5x) |
| DOM children | 36,000        | 1,026 (35x)     |

Projected cost is then **flat** across a 20x range of document sizes, because it
tracks the viewport rather than the document.

Use `contentLineInHint(hint, y, height)` so every implementation rounds the
boundary identically:

```ts
getContentProjection(hint?: ContentProjectionHint) {
  const lines = this.allLines.filter((l) => contentLineInHint(hint, l.y, l.lineHeight));
  return { text: this.text, selectable: true, lines };
}
```

> [!IMPORTANT]
> Emit a **contiguous** run of lines, and never an empty one while `text` is
> non-empty. DOM order is what the browser walks when extending a selection or
> serializing a copy, so a gap lets a drag across it silently omit the lines in
> between. An empty `lines` with non-empty `text` makes Scene fall back to
> projecting one text node for the whole document.

A grid projection is different: keep `lines` **sparse and index-aligned** to the
document, because Scene indexes it by absolute row. Compacting it hands row 20's
geometry to row 0 and mispositions every carrier — with no error, just wrong
selection geometry.

The materialized window is published as `data-vecto-projection-window` on the
mirror, so tooling can tell "this line is not here" from "this line does not
exist".

How far beyond the viewport to keep **lines** is `contentProjectionMargin`, and
how far to keep the **entities** themselves is `contentSemanticMargin` (both under
[`SceneOptions`](/reference/core-scene/#sceneoptions)); each defaults to one
viewport height. They are separate tiers since `1.31.0`: `contentSemanticMargin:
Infinity` keeps the whole document's text in the DOM — findable and copyable —
while a finite `contentProjectionMargin` keeps the per-line carriers bounded by
the viewport. See
[Two projection margins](/reference/core-scene/#two-projection-margins).

> [!IMPORTANT]
> `Infinity` is unsupported for `contentProjectionMargin` specifically: it
> unwindows every carrier in the document, which is O(total document glyphs).
> Use `contentSemanticMargin` when the goal is whole-document findability.

Core calibrates the retained carriers after fonts load and routes pointer
selection in local grid space. Firefox font substitution, DPR, browser zoom,
rotation, mirror transforms, and non-uniform scaling therefore use one geometry
plan. Calibration probes inherit the projection's zoom context and account for
Firefox missing-glyph fallback metrics; custom resize/zoom owners must call
`scene.resize()` to invalidate the retained calibration. Ordinary `lines`
projections and line-less custom projections use transformed two-dimensional
grapheme caret geometry as well.

`present()` is called by the Scene exactly **once** at the end of each render
pass. Retained backends that submit a whole frame at a time (e.g.
`ThreeRenderer` from [`@vectojs/three`](/reference/three-renderer/)) should do
their single expensive commit here and keep `flush()` cheap — the Scene calls
`flush()` around every non-batched node, so an expensive `flush()` makes frame
cost quadratic in entity count.

## CanvasRenderer

```ts
new CanvasRenderer(canvas: HTMLCanvasElement)
```

Default `IRenderer`. Applies `devicePixelRatio` scaling on construction. Caps
each batched `fill()` at `MAX_BATCH = 64` sub-paths (a single Canvas2D `fill()`
is superlinear in sub-path count). Get a handle via `scene.getRenderer()`.

## TextRasterCache

_Since Core 1.12.0._

```ts
new TextRasterCache(options?: { maxEntries?: number; dpr?: number })
cache.get(font: string, color: string, text: string): TextRaster | null
cache.clear(): void
cache.stats: { hits: number; misses: number; size: number }
```

A cache of pre-rasterized text runs, for views that draw the **same short
strings thousands of times per frame** (danmaku/barrage, chat/log tails,
data-grid cells, particle labels). `ctx.fillText()` is deceptively expensive at
scale: each call re-shapes the string, re-parses the CSS color, and rasterizes
glyphs on the CPU main thread — a profile shows the main thread pegged in native
(`(program)`) code while the GPU idles, starved.

`get()` rasterizes each distinct `(font, color, text)` run to a small offscreen
canvas once; every subsequent frame you blit it with `drawImage` instead of
re-shaping. Blit at the `fillText` baseline by subtracting the returned offsets:

```ts
const r = cache.get('600 24px system-ui', '#38bdf8', label);
if (r) renderer.drawImage(r.canvas, x - r.offsetX, baselineY - r.offsetY, r.width, r.height);
else renderer.fillText(label, x, baselineY, '600 24px system-ui', '#38bdf8'); // headless fallback
```

`TextRaster` is `{ canvas, width, height, offsetX, offsetY }` (dimensions in CSS
px). Instances are isolated (no shared global state); `dpr > 1` keeps text crisp
on HiDPI while the blit size stays in CSS px; an insertion-order eviction cap
(`maxEntries`, default 4096) bounds memory against unbounded (user-typed)
content; `get()` returns `null` in a headless/non-DOM context so you keep a
`fillText` fallback. The win comes from **reuse** — a run drawn only once is
pure overhead.

## SVGRenderer

```ts
new SVGRenderer(width: number, height: number)
toXMLString(): string
```

Software `IRenderer` that records draws into a flat SVG string
(matrix/alpha/clip stacks, gradient dedup). Text and attribute values are
XML-escaped, and external image URLs reject executable/data/file/custom schemes
(Canvas-generated raster data URLs remain supported). Backs `scene.toSVG()`.
`SVGLinearGradient` is the gradient descriptor type.

## WebGL point layer

```ts
createWebGLPointRenderer(canvas: HTMLCanvasElement): PointRenderer | null   // null if WebGL2 / shader unavailable

interface PointRenderer {
  resize(width, height): void;                 // logical size; applies DPR
  begin(): void;                               // reset per-frame buffers
  addCircle(x, y, radius, color, alpha?): void;        // world coords
  addRect(x, y, width, height, color, alpha?, rotation?): void;
  setTexture(source: TexImageSource): void;
  addSprite(x, y, width, height, u0, v0, u1, v1, color?, alpha?, rotation?): void;
  setMSDFTexture(source: TexImageSource, distanceRange: number): void;
  addGlyph(x, y, width, height, u0, v0, u1, v1, color?, alpha?, rotation?): void;
  flush(): void;                               // clear + draw all accumulated primitives
  destroy(): void;
}
```

One WebGL2 canvas, four batched programs: points (round, AA'd via
`gl_PointSize`), rects, textured sprites, and MSDF glyphs (median-of-3 distance
reconstruction, crisp at any zoom). `color` tints; white texels pass through
unchanged. Sprite/glyph adds are no-ops until their texture is set. The Scene
routes `getBatchCircle`/`getBatchRect` (and CPU particles, MSDF text) here when
`pointBackend: 'webgl'`. Leaves under transforms the GPU primitive cannot
represent exactly (for example non-uniform scale or shear) fall back to the
normal renderer.

`flush()` issues **at most one draw call per primitive type**, so draw-call
count is not the scaling limit — uploaded bytes are. Since core 1.16.2 every
quad batch (rect, sprite, glyph, carved circle) uploads **4 vertices** and draws
with `drawElements` against one shared static 32-bit index buffer, rather than
expanding to 6 vertices for `drawArrays`. That removes the two duplicated
corners per quad, cutting upload volume by a third; the index buffer is built
once and regrown geometrically, never re-sent per frame. Indices are 32-bit
because a `Uint16Array` would cap a batch at 16,383 quads, which real scenes
exceed.

Measured on real hardware (RTX 4060 Laptop, work plus `gl.finish()`, median of 12) against the previous 6-vertex path:

| quads/frame | Chrome         | Firefox         |
| ----------- | -------------- | --------------- |
| 12,000      | 0.61 → 0.09ms  | 2.66 → 1.47ms   |
| 50,000      | 2.22 → 0.87ms  | 9.02 → 6.24ms   |
| 100,000     | 12.62 → 3.12ms | 16.81 → 10.88ms |

Below roughly **35,000–50,000 quads/frame** the JS that fills the vertex buffer
costs more than the GPU submit; above it the submit dominates and the useful
levers become drawing less (culling, virtualization) rather than tuning the
fill. Firefox holds near ~1 GB/s effective upload bandwidth regardless of vertex
layout, so on that engine reducing bytes is the only reliable lever.

> Entity hooks `getBatchCircle()` → `{ radius, color }` and `getBatchRect()` →
> `{ width, height, color }` (see [`Entity`](/reference/core-entity/#a11y--batching-hooks-override-to-opt-in))
> are the per-entity opt-ins that feed this layer.

## parseColorToRGBA

```ts
parseColorToRGBA(css: string): RGBA           // RGBA = [number, number, number, number] in [0,1]
```

Fast paths for `#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa` and `rgb()`/`rgba()`; other
forms (named, `hsl()`, …) resolve via a cached 1×1 canvas when a DOM exists.
Results are **cached and shared by identity — treat the returned array as
read-only.** No-DOM unparseable input → opaque black `[0,0,0,1]`.

The cache holds 1,000 entries and evicts in **insertion order (FIFO)**. A cache
hit deliberately does _not_ promote its entry: this function is called once per
quad, and at ~25,000 quads/frame the `Map.delete` + re-`set` pair that true LRU
needs cost more than everything else in the function combined. The practical
consequence is that if a scene's distinct-color working set exceeds 1,000, an
early-inserted hot color can be evicted and re-parsed; for typical scenes the
working set is small and stable, so FIFO and LRU evict the same entries.

## Related

[`Entity`](/reference/core-entity/) (batching hooks, content projection) ·
[`ComputeParticleEntity`](/reference/core-particles/) (WebGL/WebGPU consumer) ·
[Text & Bidi](/reference/core-text/) (MSDF glyph consumer) · [`@vectojs/three`'s
`ThreeRenderer`](/reference/three-renderer/) (an alternate `IRenderer`) ·
[`@vectojs/core` overview](/reference/core-api/)
