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
getContentProjection(): ContentProjection | null // default null
// ContentProjection: {
//   text: string; font?: string; lineHeight?: number; selectable?: boolean;
//   contentX?: number; contentY?: number; baseline?: number;
//   lines?: Array<{ text; x; y; baseline; font?; lineHeight?; runs? }>;
//   grid?: PreparedContentGrid;
// }
```

Opt-in hook for entities that render static text: the Scene mirrors the
returned string as a transparent, position-synced DOM node (viewport-lazy,
dirty-checked, `aria-hidden` when the entity is interactive), making canvas
text findable, screen-reader/crawler-visible, translatable, and — with
`selectable: true` — natively selectable. `TextEntity`/`MSDFTextEntity`
(see [Text & Bidi](/reference/core-text/)) implement it. Scene-wide off switch:
`new Scene(canvas, { contentProjection: false })`.

The Scene preserves VMT order when projection nodes appear or disappear,
removes descendant projections with their entity subtree, and hides a
projection when it is fully outside the viewport or a `clipChildren` ancestor.
Tooling can inspect a currently materialized mirror without querying the DOM:

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

Use `cssLineBoxBaseline(font, lineHeight)` in custom Canvas-native editors
when the same text must align with a native control or content projection.

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

Core calibrates the retained carriers after fonts load and routes pointer
selection in local grid space. Firefox font substitution, DPR, browser zoom,
rotation, mirror transforms, and non-uniform scaling therefore use one geometry
plan. Calibration probes inherit the projection's zoom context and account for
Firefox missing-glyph fallback metrics; custom resize/zoom owners must call
`scene.resize()` to invalidate the retained calibration. Ordinary `lines`
projections and line-less custom projections use
transformed two-dimensional grapheme caret geometry as well.

`present()` is called by the Scene exactly **once** at
the end of each render pass. Retained backends that submit a whole frame at a
time (e.g. `ThreeRenderer` from [`@vectojs/three`](/reference/three-renderer/))
should do their single expensive commit here and keep `flush()` cheap — the
Scene calls `flush()` around every non-batched node, so an expensive `flush()`
makes frame cost quadratic in entity count.

## CanvasRenderer

```ts
new CanvasRenderer(canvas: HTMLCanvasElement)
```

Default `IRenderer`. Applies `devicePixelRatio` scaling on construction. Caps
each batched `fill()` at `MAX_BATCH = 64` sub-paths (a single Canvas2D `fill()` is
superlinear in sub-path count). Get a handle via `scene.getRenderer()`.

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

Software `IRenderer` that records draws into a flat SVG string (matrix/alpha/clip
stacks, gradient dedup). Text and attribute values are XML-escaped, and external
image URLs reject executable/data/file/custom schemes (Canvas-generated raster
data URLs remain supported). Backs `scene.toSVG()`. `SVGLinearGradient` is the
gradient descriptor type.

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

One WebGL2 canvas, four batched programs: points (round, AA'd via `gl_PointSize`),
rects (expanded triangles), textured sprites, and MSDF glyphs (median-of-3
distance reconstruction, crisp at any zoom). `color` tints; white texels pass
through unchanged. Sprite/glyph adds are no-ops until their texture is set. The
Scene routes `getBatchCircle`/`getBatchRect` (and CPU particles, MSDF text) here
when `pointBackend: 'webgl'`. Leaves under transforms the GPU primitive cannot
represent exactly (for example non-uniform scale or shear) fall back to the
normal renderer.

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

## Related

[`Entity`](/reference/core-entity/) (batching hooks, content projection) ·
[`ComputeParticleEntity`](/reference/core-particles/) (WebGL/WebGPU consumer) ·
[Text & Bidi](/reference/core-text/) (MSDF glyph consumer) ·
[`@vectojs/three`'s `ThreeRenderer`](/reference/three-renderer/) (an alternate `IRenderer`) ·
[`@vectojs/core` overview](/reference/core-api/)
