+++
title = "Cross-Environment Consistency"
description = "Keeping a canvas UI identical across operating systems, browsers, zoom levels, and pixel densities — and keeping text selection aligned with the rendered output."
weight = 19

[extra]
order = 19
+++

# Cross-Environment Consistency

A DOM app inherits consistency (and inconsistency) from the browser's layout
engine. A canvas-native app inherits it from **you**: the engine computes every
position from numbers it measured itself, so the failure modes move — away from
CSS quirks, toward pixel density, zoom, and font metrics. This page maps each
environmental variable to what actually varies, what the engine already
handles, and what your application must do.

## Device pixel ratio (HiDPI)

**What the engine handles.** All VectoJS coordinates are logical CSS pixels.
The renderer sizes the canvas backing store to `logical × devicePixelRatio`
and scales the context, and every `scene.resize()` re-reads the current DPR —
rendering, hit-testing, and layout all share one logical coordinate space, at
any density, including fractional DPRs (Windows 125 % / 150 % scaling).

**What you must do.** Nothing at runtime — but everything in testing:

> [!WARNING]
> Headless browsers default to `deviceScaleFactor: 1`. Most real machines are
> DPR 2 (or fractional). A hit-testing or text-projection offset that scales
> with DPR is **invisible** in a default headless run and obvious on the first
> real laptop. If a reported offset is proportional to the distance from the
> origin, suspect DPR first.

Run pointer and selection tests at `deviceScaleFactor: 2` as well as 1
(Puppeteer/Playwright both expose it per context). One matrix cell catches the
whole bug class.

## Browser zoom and container sizing

Zoom changes the effective DPR and the CSS viewport together. What happens
next depends on who owns the canvas size:

- **Fullscreen scenes** (the default): the Scene listens for window `resize` —
  which zoom fires — and recalibrates size, backing store, and DPR
  automatically.
- **Embedded scenes** (`disableWindowResize: true`, custom containers, CSS
  zoom on an ancestor): the engine deliberately does not guess. Wire the
  container to the scene yourself:

```typescript
const scene = new Scene(canvas, { disableWindowResize: true });

const ro = new ResizeObserver(([entry]) => {
  scene.resize(entry.contentRect.width, entry.contentRect.height);
});
ro.observe(container);
// Disconnect in your teardown path alongside scene.destroy().
```

`scene.resize(width, height)` is idempotent and cheap enough to call from a
ResizeObserver without debouncing for typical UIs. It is also the
**recalibration hook**: Firefox computes native `Range` selection metrics from
layout state that zoom and container changes invalidate — a scene that is
never told about the change renders correctly but _selects_ at stale
coordinates. If selection highlights drift after zooming in Firefox and the
canvas looks fine, a missing `resize()` call is the first suspect.

## Fonts: the real cross-OS variable

`'16px sans-serif'` is a different typeface on every OS (Segoe UI, Roboto,
San Francisco, DejaVu…). VectoJS measures text itself with canvas
`measureText`, and the renderer draws with the same font string — so layout
and pixels always agree _with each other_ on any machine. What varies across
machines is the **absolute geometry**: line widths, wrap points, entity sizes.

Practical consequences, in decreasing order of pain:

1. **Web-font race.** If you construct `Text`/`RichText`/`Markdown` before a
   web font loads, measurement uses the fallback font while a later repaint
   draws the loaded one — layout and pixels now disagree (the one way to break
   the internal consistency). Gate construction:

   ```typescript
   await document.fonts.ready;
   const label = new Text('Hello', { font: '16px Inter' });
   ```

   If content can outlive font loading (lazy-loaded fonts), re-run `setText`
   or `setMaxWidth` from a `document.fonts.onloadingdone` handler to re-measure.

2. **Pixel-exact test expectations.** Never assert absolute text-derived
   geometry against hard-coded numbers unless CI installs the exact font
   (the VectoJS repo installs Noto in CI for this reason). Prefer relational
   assertions ("fits inside", "below the previous row") — which is exactly
   what `auditScene` automates.

3. **Generic families in design.** Sizing a card to fit `'14px sans-serif'`
   on macOS leaves it wrong on Windows. Either ship the font, or let
   measurement drive the size (self-sizing `Text` + container layout) instead
   of hard-coding boxes around assumed text widths.

## Browser differences that matter

The engine's cross-browser test matrix (Chrome + Firefox, DPR 1 and 2, font
substitution) pins these down; the ones an application can still trip over:

| Area                    | Difference                                                                | What to do                                                                         |
| ----------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Native selection ranges | Firefox recomputes `Range` metrics from stale layout after zoom/resize    | Call `scene.resize()` whenever you own sizing (see above)                          |
| `Worker` availability   | Absent in some embedders/test runners → Markdown parses synchronously     | Functionally identical; budget main-thread time in those environments              |
| WebGPU                  | Availability varies; `ComputeParticleEntity` falls back to CPU            | Treat GPU compute as progressive enhancement; test the CPU path too                |
| Reduced motion          | OS-level setting caps effective FPS when `respectReducedMotion` (default) | Don't fight it; test animations with the setting on                                |
| rAF in background tabs  | Suspends everywhere, but resume timing differs                            | Engine clamps animation dt on resume; custom integrators should clamp their own dt |

## Keeping selection aligned with pixels

Selectable text works by projecting the **logical source string** into
transparent DOM mirrors whose geometry comes from the same layout data the
canvas painter uses. Alignment is by construction — when it breaks, one of a
short list of contracts was violated:

1. **The scene wasn't told about a size/zoom change** — stale projection
   geometry (Firefox especially; see the recalibration hook above).
2. **Fonts loaded after measurement** — canvas and projection both follow the
   measured layout, but the drawn glyphs moved (web-font race above).
3. **A custom component draws text without projecting it** — pixels with no
   selectable mirror, or a mirror positioned by different math than the paint
   path. Custom text entities should reuse the engine's prepared layout
   (`prepareContentGrid` / `LayoutEngine.prepare`) for both painting and
   projection, never two independent measurements.

**Verifying alignment** (numbers, not screenshots):

```typescript
// 1. Does a programmatic selection copy the logical source?
//    (Selection APIs mirror what a user drag would produce.)
const text = window.getSelection()?.toString();
expect(text).toBe(expectedSourceSlice);

// 2. Which entity actually received the browser's selection events?
import { createEventTrace } from '@vectojs/devtools/headless';
const trace = createEventTrace(scene, { capacity: 50 });
// … drag-select …
// entries with source === 'content' began on a selectable projection;
// their targetPath tells you WHICH one, defaultPrevented whether the
// application intercepted the browser's default selection behavior.
```

Run the drag-selection tests in the same environment matrix as hit-testing:
both browsers, both DPRs, and at least one non-default zoom level.

## The portability checklist

For a UI that must look and behave identically everywhere:

- [ ] Ship the fonts you measure with; construct text after `document.fonts.ready`.
- [ ] Fullscreen scene **or** a `ResizeObserver` → `scene.resize()` bridge — never neither.
- [ ] Pointer + selection tests at DPR 1 **and** 2, Chrome **and** Firefox.
- [ ] `auditScene(scene)` clean in CI (relational layout correctness, font-independent).
- [ ] Snapshot-diff key interactions (`captureSnapshot`/`diffSnapshots`) instead of pixel-comparing screenshots.
- [ ] Animations verified with OS reduced-motion enabled.
- [ ] If WebGL/WebGPU backends are enabled, the Canvas2D fallback path is also tested.

> **Next:** [Debugging workflows](/reference/devtools-inspect/#debugging-workflows)
> for the numeric tools this checklist leans on, and
> [Streaming & Real-Time Text](/learn/streaming/) for real-time UIs.
