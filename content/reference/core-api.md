+++
title = "@vectojs/core API Reference"
description = "Overview and entry-point map for the zero-DOM rendering engine behind Vecto — Scene, Entity, renderers, particles, and a11y in core, plus the standalone @vectojs/text, @vectojs/layout, @vectojs/math, and @vectojs/animation engines that core re-exports."
weight = 1

[extra]
order = 1
+++

# `@vectojs/core` API Reference

The zero-DOM rendering engine behind Vecto. A `Scene` owns a tree of `Entity`
nodes (the **Virtual Math Tree**), drives a `requestAnimationFrame` loop, paints
through a backend-agnostic `IRenderer` (Canvas 2D by default), and projects a
transparent ARIA/automation shadow layer so the canvas stays accessible and
agent-drivable.

> This page and its sub-pages are generated from the published `.d.ts` (public
> surface) and the `packages/core/src` source (behavior). Signatures here
> override anything in the narrative `docs/usage/*` guides — in particular the
> real constructor is `new Scene(canvasElement, options)`, **not** the
> `{ canvasId }` form some older prose shows.

## Reference pages

Each concern below has its own focused page — signatures, gotchas, and a
"Related" footer linking sideways to the others:

| Area                                                   | Covers                                                                                                                        |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| [`Scene`](/reference/core-scene/)                      | Constructor, `SceneOptions`, public fields, `renderMode`/`maxFPS`/idle throttle, lifecycle methods, backend registry.         |
| [`Entity`](/reference/core-entity/)                    | The abstract VMT node: transforms, the animation system, capture/bubble events, a11y/batching hooks.                          |
| [Layout engine](/reference/core-layout/)               | `LayoutEngine`'s cold/hot split, streaming memoization, rich text, exclusion shapes.                                          |
| [Renderers](/reference/core-renderer/)                 | `IRenderer`, `CanvasRenderer`, `SVGRenderer`, the WebGL point/rect/sprite/MSDF layer, content projection, `parseColorToRGBA`. |
| [`ComputeParticleEntity`](/reference/core-particles/)  | The high-throughput particle layer: memory layout, CPU sim, WebGPU vs CPU.                                                    |
| [Text & Bidi](/reference/core-text/)                   | `MSDFFont`, `MSDFTextEntity`, `TextEntity`/`GridTextEntity`, Arabic shaping + bidi resolver.                                  |
| [Other entities](/reference/core-entities/)            | `SplineEntity`, `DOMPortalEntity`, `SVGEntity`.                                                                               |
| [Math utilities](/reference/core-math/)                | `SpatialHashGrid`, `SpringPhysics`.                                                                                           |
| [Animation](/reference/animation/)                     | The standalone `@vectojs/animation` engine: `TweenDriver`/`SpringDriver`, `MotionConfig`, easing curves.                      |
| [Styles](/reference/styles/)                           | The standalone `@vectojs/styles` layer: CSS-named style objects, `var()` token themes, `setTheme` switching, `css()` merging. |
| [a11yRoot & the agent contract](/reference/core-a11y/) | The shadow-DOM projection, `A11yAttributes`, sync gotchas.                                                                    |

## Entry points & module map

The layout, text-shaping, math, and animation engines are published as their
own standalone packages. `@vectojs/core` **depends on and re-exports** all of
them, so every import below still resolves from `@vectojs/core` (and from the
tree-shakeable subpaths). Import from the standalone packages directly when you
want a smaller dependency surface without the scene-graph runtime.

`@vectojs/core` ships one side-effecting main entry plus three tree-shakeable
subpaths, alongside the four standalone packages:

| Import                   | Contents                                                                                                                                                                                           | Side effect                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `@vectojs/core` (`.`)    | Everything: `Scene`, `Entity`, all entities, renderers, plus the re-exported layout, text, math, and animation engines.                                                                            | On import, auto-registers **both** pluggable backends (WebGL point renderer + WebGPU particle manager). |
| `@vectojs/core/layout`   | Re-exports `@vectojs/layout`: `LayoutEngine`, `PreparedText`, `createCanvasMeasurer`, `LayoutResultBuffer`, `LayoutWorkerManager`, `computeLineSegments`, layout types.                            | None.                                                                                                   |
| `@vectojs/core/renderer` | `IRenderer`, `CanvasRenderer`, `SVGRenderer`, `PointRenderer`, `createWebGLPointRenderer`, `WebGPUParticleSystemManager`, `parseColorToRGBA`, `RGBA`.                                              | None.                                                                                                   |
| `@vectojs/core/text`     | Re-exports `@vectojs/text` plus the core-resident `MSDFTextEntity`/`SVGEntity`: `MSDFFont`, `ArabicShaper`, `BidiResolver`, `Typography`, `prepareContentGrid`, `PreparedContentGrid`, MSDF types. | None.                                                                                                   |
| `@vectojs/text`          | Standalone text-shaping primitives: `BidiResolver`, `ArabicShaper`, `Typography`, `MSDFFont`, `prepareContentGrid`, `PreparedContentGrid`. Leaf package (only `bidi-js`).                          | None.                                                                                                   |
| `@vectojs/layout`        | Standalone layout engine: `LayoutEngine`, `LayoutWorkerManager`, `createCanvasMeasurer`, measurement helpers. Depends on `@vectojs/text`.                                                          | None.                                                                                                   |
| `@vectojs/math`          | Standalone spatial/physics math: `SpatialHashGrid`, `SpringPhysics`. Leaf package.                                                                                                                 | None.                                                                                                   |
| `@vectojs/animation`     | Standalone easing + drivers: `Easing`, `TweenDriver`, `SpringDriver`. Depends on `@vectojs/math`.                                                                                                  | None.                                                                                                   |

**Gotcha:** the backend auto-registration lives only in the `.` entry
(`Scene.registerWebGLPointRendererCreator(createWebGLPointRenderer)` and
`Scene.registerWebGPUParticleSystemManager(WebGPUParticleSystemManager)` run on
import). If you construct a `Scene` after importing only subpaths, register the
backends yourself or `pointBackend: 'webgl'` / WebGPU particles silently fall
back. See [`Scene`](/reference/core-scene/) for the registry API.

## Recommended docs-site pages (core)

- **Learn / Core concepts** — Scene, the Virtual Math Tree, the render loop,
  `IRenderer`, zero-DOM model.
- **Learn / Render modes & performance** — `always` vs `onDemand`, `maxFPS`, the
  idle 2-fps throttle and the `markDirty()`-between-frames rule, reduced motion.
- **Learn / Building a custom Entity** — `isPointInside`/`render`, transforms,
  `getBounds` culling, the `getBatchCircle`/`getBatchRect` fast-paths.
- **Learn / Events & hit-testing** — capture/bubble, `VectoJSEvent`,
  `findEntityAt`, form-control `change`/IME.
- **Learn / Accessibility & automation** — the shadow-DOM contract,
  `getByRole`-driven agents, `debugA11y`, throttling.
- **Learn / Text & typography** — the cold/hot `LayoutEngine` split, streaming
  memoization, MSDF text, exclusions/wrapping, bidi.
- **Learn / Particles** — `ComputeParticleEntity`, WebGPU vs CPU, the 8-float
  layout, `resize()`-first.
- **Reference / API** — the sub-pages above (Scene, Entity, layout engine,
  renderers, particles, text, math utilities, a11y contract).
- **Reference / Backend registry** — pluggable WebGL/WebGPU backends, covered
  under [`Scene`](/reference/core-scene/#pluggable-backend-registry-static).
