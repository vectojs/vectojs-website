---
title: 'Other entities'
description: 'SplineEntity (vectomancy curve rendering), DOMPortalEntity (projecting a real DOM element into the scene), and SVGEntity (rasterized SVG blitting) from the @vectojs/core main entry.'
order: 16
---

# Other entities (from `.`)

Part of [`@vectojs/core`](/reference/core-api/).

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
