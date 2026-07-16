---
title: 'Other entities'
description: 'Rect/Circle/Group shape primitives, plus SplineEntity (vectomancy curve rendering), DOMPortalEntity (projecting a real DOM element into the scene), and SVGEntity (rasterized SVG blitting) from the @vectojs/core main entry.'
order: 8
---

# Other entities (from `.`)

Part of [`@vectojs/core`](/reference/core-api/).

## Rect, Circle, Group (primitives)

_Added in `@vectojs/core` 1.9.0._ Three ready-to-instantiate entities so a
plain box, dot, or transform container no longer needs a bespoke
[`Entity`](/reference/core-entity/) subclass.

```ts
import { Rect, Circle, Group } from '@vectojs/core';

const box = new Rect({ width: 120, height: 64, fill: '#38bdf8', radius: 8 });
const dot = new Circle({ radius: 24, fill: '#f97316' });
const toolbar = new Group(saveBtn, undoBtn, redoBtn); // transform-only container
toolbar.set({ x: 20, y: 20 });
scene.add(box, dot, toolbar); // variadic add()
```

**`Rect`** — axis-aligned rectangle from local `(0,0)` to `(width, height)`.

| `RectOptions` | Default     | Effect                                                       |
| ------------- | ----------- | ------------------------------------------------------------ |
| `width`       | `0`         | Local width; matches the entity hit/a11y box.                |
| `height`      | `0`         | Local height.                                                |
| `fill`        | `'#38bdf8'` | CSS fill, or `null` for none (explicit `null` is preserved). |
| `stroke`      | `null`      | CSS stroke, or `null` for none.                              |
| `strokeWidth` | `1`         | Stroke width (local units).                                  |
| `radius`      | `0`         | Uniform corner radius; `0` = sharp corners.                  |

A solid-fill, square-cornered, unstroked `Rect` opts into the WebGL
instanced-rect fast path (`getBatchRect`, `pointBackend: 'webgl'` only); any
stroke or corner radius renders through the exact Canvas path.

**`Circle`** — disc centered on its local origin `(0,0)`. Its a11y shadow box
is the bounding square offset by `-radius` so it covers the drawn disc.

| `CircleOptions` | Default     | Effect                                         |
| --------------- | ----------- | ---------------------------------------------- |
| `radius`        | `0`         | Radius (local units). Setter re-syncs the box. |
| `fill`          | `'#38bdf8'` | CSS fill, or `null` for none.                  |
| `stroke`        | `null`      | CSS stroke, or `null` for none.                |
| `strokeWidth`   | `1`         | Stroke width (local units).                    |

A solid-fill, unstroked `Circle` opts into the circle point-batch fast path
(`getBatchCircle`); a stroked circle renders through the exact Canvas path.

**`Group`** — a transform-only container: draws nothing and is invisible to
hit-testing (`isPointInside` returns `false`), existing only to compose one
transform (`x`/`y`/`scale`/`rotation`/`opacity`) onto its children. The scene's
hit-test recurses into children first, so they stay independently interactive.
Pass children inline: `new Group(a, b, c)`.

See also [`Entity.set()`](/reference/core-entity/) and variadic
[`add()`](/reference/core-entity/) — the ergonomic helpers these primitives are
built to be used with.

## SplineEntity + loadSpline

```ts
loadSpline(url: string): Promise<SplineDocument>     // fetch + parse a vectomancy Spline JSON (browser)
new SplineEntity(doc: SplineDocument, opts?: SplineOptions)
polySegmentToBezier(seg: SplineSegment): BezierControlPoints
```

Renders native vectomancy piecewise-cubic `Spline`/`Polyline` documents. Bounds
come from `bounding_box` (or computed from segment endpoints) so it participates
in viewport culling.

| `SplineOptions` | Default     | Effect                                                                                         |
| --------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| `lineWidth`     | `2`         | Stroke width (local units).                                                                    |
| `cache`         | `true`      | Bake to an `OffscreenCanvas` once and blit each frame (per-frame Bézier stroking without it).  |
| `defaultColor`  | `'#e2e8f0'` | Used when an equation's `color_rgb` is `null`.                                                 |
| `hitTest`       | `'curve'`   | `'curve'` = precise (within `lineWidth/2 + hitTolerance` of a curve); `'aabb'` = bounding box. |
| `hitTolerance`  | `0`         | Extra pick padding in `'curve'` mode.                                                          |

Public: `doc`, `lineWidth`, `defaultColor`, `hitTolerance`, `showBounds`
(default `false`, draws a debug outline). `SplineColor` is `[r,g,b]` (0–1), a
linear-gradient descriptor, or `null`.

## DOMPortalEntity

```ts
new DOMPortalEntity(domElement: HTMLElement, width?, height?, id?)
```

Projects a **real** DOM element positioned/transformed to track the entity
(`matrix(...)` + inherited opacity + z-index from paint order) in the portal layer. A leaf node —
`add()` warns and child entities are unsupported. Forwards native pointer/wheel/
focus events as `VectoJSEvent`s. Uses a `ResizeObserver` to cache intrinsic size
(`cachedWidth`/`cachedHeight`) when `width`/`height` are 0. `destroy()` detaches
listeners, the observer, and removes the element.

## SVGEntity (from `@vectojs/core/text`)

```ts
new SVGEntity(svgSource: string, id?)
setSVGSource(svgSource: string): void
```

Rasterizes an SVG string to an `ImageBitmap`/image and blits it, re-rasterizing at
a target scale (LOD) so it stays sharp when zoomed. `scene.toSVG()` embeds the
percent-encoded source as an isolated nested SVG image rather than an inert URL
placeholder. AABB hit-test in local space.

## Related

[`Entity`](/reference/core-entity/) (the base class each of these extends) ·
[`@vectojs/core` overview](/reference/core-api/)
