+++
title = "FAQ"
description = "Frequently asked questions about VectoJS — architecture decisions, performance, accessibility, and troubleshooting."
weight = 53
+++

# Frequently Asked Questions

## Architecture

### Why canvas instead of the DOM?

The DOM provides semantic document structure, CSS layout, and a mature accessibility model. For workloads dominated by custom geometry or large, frequently changing visual sets, canvas can avoid one styled DOM node per drawable and gives the application direct layout/render control. It also moves responsibility for layout, hit testing, semantics, and performance measurement into the framework/application.

### How does accessibility work if everything is drawn on canvas?

`Scene` maintains an accessibility projection overlay (`a11yRoot`) of real `<button>`, `<input>`, `<a>`, and `<div>` elements for eligible interactive entities. It is not the browser's Shadow DOM API. The overlay follows canvas offset/CSS scaling and each entity's affine transform, receives native pointer/keyboard/focus events, and is visible to DevTools and role-based automation. Applications still need correct roles, labels, focus order, keyboard behavior, and screen-reader testing.

Set `entity.interactive = true` to project a shadow node. Override `getA11yAttributes()` to control the tag and ARIA attributes:

```typescript
getA11yAttributes() {
  return { tag: 'button', role: 'button', label: 'Submit form' };
}
```

### Is there a React / Vue / Svelte integration?

Not yet as first-party packages. Because VectoJS owns a `<canvas>` element, it integrates with any framework exactly like a WebGL library would — mount the canvas, initialize a `Scene` in a lifecycle hook (`useEffect`, `onMounted`, etc.), and tear it down on unmount.

```typescript
// React example
import { useEffect, useRef } from 'react';
import { Scene } from '@vectojs/core';

export function VectoCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const scene = new Scene(canvasRef.current!, { maxFPS: 60 });
    scene.start();
    return () => scene.destroy();
  }, []);
  return <canvas ref={canvasRef} />;
}
```

### Can two Scenes be stitched together seamlessly, like tiles?

Not as one logical surface. A `Scene` owns exactly one `<canvas>` and one root `Entity` tree — there is no API for two `Scene`s to share a coordinate space, pass entities between each other, or hit-test across the boundary. Running two `Scene` instances side by side (two canvases positioned with ordinary CSS) works and can look seamless, but they stay functionally independent: separate render loops, separate `renderMode`/dirty tracking, separate accessibility projections. If you need entities to interact, transform, or hit-test relative to one another, put them in one `Scene`'s tree rather than trying to bridge two.

---

## Performance

### How many entities can VectoJS handle at 60 fps?

There is no backend-independent count: path complexity, text, device pixel ratio, accessibility projection, update work, GPU/driver, and visible percentage all change the result. The checked-in headless benchmark currently covers simple Canvas entities at 1,000 and 5,000 nodes; it is not evidence for six-figure WebGL/WebGPU claims. Run the demo report on target hardware and record frame-time percentiles for your workload.

### What is the `pointBackend: 'webgl'` option?

When set, the `Scene` stacks a transparent WebGL2 canvas over the main Canvas2D canvas. Representable leaf entities that implement `getBatchCircle()` / `getBatchRect()` are collected into typed buffers and submitted in batched WebGL draws, while text, images, complex shapes, and unsupported affine transforms remain on Canvas2D. Measure the crossover for your hardware; the repository does not currently contain a verified universal speedup factor.

### What is `renderMode: 'onDemand'`?

In `'onDemand'` mode the Scene only draws when `scene.markDirty()` is called or an animation driver is in progress. Static ticks still schedule rAF and inspect the tree for pending motion, but they skip entity update/render work and GPU submission. Use this for mostly-static UIs — dashboards, forms, menus.

```typescript
scene.renderMode = 'onDemand';
entity.on('click', () => {
  entity.animate({ x: entity.x + 50 }, 300); // triggers dirty automatically
});
```

### Why is my FPS low when testing in Node.js / headless?

Headless Chrome often uses a software rasterizer and has different scheduling/vsync behavior. Its FPS is useful for regression comparison in the same environment, not as a lower bound or a prediction for users' GPUs. Measure on the target browser and hardware.

> [!TIP]
> Use the **Export report** button in the Nexus demo to get a real GPU measurement with your current hardware and browser. Copy-paste those numbers into your PRs instead of headless FPS.

---

## The Entity API

### What is `clipChildren`?

Setting `clipChildren = true` clips normal child draws to the entity's `[0,0]–[width,height]` box. This is how `ScrollView` implements overflow. CanvasRenderer and SVGRenderer preserve the transformed clip. ThreeRenderer intersects scissor rectangles using the clip's transformed world AABB, so rotated/sheared clips are axis-aligned approximations. Primitives promoted to the separate WebGL point layer and WebGPU particle overlay are not clipped by the parent renderer's clip stack.

### What is `a11yFullViewport`?

Normally a shadow DOM node is only projected when `entity.interactive && entity.width > 0`. For entities that cover the entire Scene viewport (an infinite-canvas graph, a full-screen gesture recognizer) there is no meaningful bounding box. Setting `a11yFullViewport = true` creates a Scene-sized shadow node behind all other shadow nodes; the projection root then maps that logical box onto the canvas CSS box.

### My `Entity.update()` animation is twice as fast as expected — why?

> [!CAUTION] > `Entity.update(dt, time)` receives **dt in milliseconds**, not seconds. This is the single most common VectoJS gotcha. `dt` at 60 fps ≈ 16.7, not 0.017.

A common mistake when porting from physics libraries that use seconds:

```typescript
// Wrong: treats ms as seconds → 1000× too fast
this.x += velocity * dt;

// Correct: convert to seconds, or use ms units
this.x += velocity * (dt / 1000);
```

Spring physics (`SpringPhysics`, `ScrollView`) internally use `dt / 1000` to convert before running their simulations.

### What is the difference between `emit()` and `dispatchEvent()`?

- `entity.emit(event, payload)` — fires the entity's own **bubble-phase** listeners only. No tree traversal. This is a component-internal path (e.g., a form control emitting its own `change`).
- `entity.dispatchEvent(event)` — runs the full DOM-like **capture + bubble** traversal: capture goes root → target, bubble goes target → root. This is how `Scene` dispatches pointer events.

---

## Customization & Animation

### How far does VectoJS's customization go — can it do splash-screen or transition-style effects?

Yes. Every animatable property (`x`, `y`, `scaleX`, `scaleY`, `rotation`, `opacity`) can be driven by a `TweenDriver` (curve-based, from the built-in `Easing` set or a custom function) or a `SpringDriver` (physical, with configurable `stiffness`/`damping`/`mass`). For particle-heavy effects specifically, `ComputeParticleEntity` with `particleBackend: 'webgpu'` runs a compute shader with a spring-to-origin force, mouse repulsion, velocity clamping, edge bounce, and a dedicated **explosion force** parameter (`triggerExplosion(x, y, force)`) — a burst/splash effect is a first-class primitive, not something you'd have to fake with tweens. The CPU fallback (`updateCPU`) mirrors the same force model when WebGPU isn't available.

### How is an `Entity`'s shape defined — can it be a pentagon, an ellipse, an irregular polygon?

Yes, and shape is really two independent, overridable concerns:

- **Visual shape**: `render(renderer)` draws through `IRenderer`'s vector path primitives (`moveTo`, `lineTo`, `bezierCurveTo`, `arc`, `closePath`) — the same primitives a hand-written Canvas2D/SVG path would use, so any polygon, ellipse, or curved outline is drawable. `SplineEntity` is the built-in example: it renders arbitrary cubic-polynomial curves by converting them to Bézier segments.
- **Hit-test shape**: `isPointInside(globalX, globalY): boolean` is `abstract` on the base `Entity` class — every concrete entity supplies its own logic. Nothing requires (or defaults to) an axis-aligned bounding box; a pentagon's `isPointInside` can do real point-in-polygon math, an ellipse can do the quadratic-form check, etc.

Because the two are separate methods, a shape's clickable region doesn't have to match its drawn silhouette exactly (useful for generous touch targets on small shapes).

### Do text and components adapt to different devices and browser zoom levels? Is text resizing fully adaptive?

The mechanism is there, but it's explicit rather than automatic-by-default:

- **HiDPI**: `CanvasRenderer` reads `window.devicePixelRatio` at construction and on `resize()`, scaling the canvas backing store accordingly — a Retina/HiDPI display renders crisp without extra app code.
- **Browser zoom**: most browsers change the effective `devicePixelRatio` on zoom and fire a `window` `resize` event, which `Scene` already listens for and responds to by calling the renderer's `resize()`.
- **Text reflow**: `LayoutEngine.setMaxWidth()` is specifically designed as a cheap "hot path" for this — it reuses the cached, already-measured `PreparedText` from the last cold `prepare()` pass and only redoes line-breaking, not re-segmentation or re-measurement. Call it from your own resize handler to reflow text cheaply at any new width.

So: the primitives for adaptive, resize-cheap layout exist and are used internally by the UI components, but a raw custom `Entity` doesn't reflow "for free" — you wire your resize handler to the relevant `setMaxWidth`/layout call yourself, the same way you'd wire a canvas resize in any immediate-mode renderer.

### How does VectoJS's animation model differ from CSS animations? Is everything pre-calculated before rendering?

No — nothing is baked into keyframes ahead of time. `TweenDriver.tick(dtMs)` and `SpringDriver.tick(dtMs)` are real-time integrators: each frame, they advance from the _actual_ elapsed time since the last frame, not from a precomputed timeline. `SpringPhysics` (the engine behind `SpringDriver`) does live Euler integration in fixed substeps, with a stability clamp for the large `dt` a backgrounded tab can deliver on return.

The practical difference shows up when you change the target mid-animation: `driver.retarget(to)` on a spring keeps the current value and velocity and continues integrating smoothly toward the new target — no snap, no restart. A CSS transition/animation whose target changes mid-flight typically restarts or jumps, because it's interpolating along a predetermined curve rather than simulating physics frame-by-frame.

### How can I disable the default spring/inertia animations on components, or change them to standard transitions?

By default, VectoJS scrollable components (like `ScrollView` and `VirtualList`) and properties use spring-based physics (`'spring'`) for smooth transitions. If you want to disable these animations for a snappier, instant behavior, or switch them to standard cubic-bezier transitions (like `easeOutCubic`), you have three main approaches:

#### 1. Change the Transition Configuration on the Target Entity

Every `Entity` exposes a `setTransition` method. You can override the default spring transition by calling `setTransition` on the target element with a custom `duration` (in milliseconds) and `easing` function, or disable it entirely:

```typescript
// To change to a fast, non-bouncing transition (like easeOutCubic)
entity.setTransition({
  y: { duration: 120, easing: 'easeOutCubic' },
});

// To disable animations entirely (instant snaps)
entity.setTransition({
  y: null, // clears the transition driver
});
```

#### 2. Instantly Snap Position Without Engaging the Spring

If you want to move an entity immediately without triggering any configured transition (bypassing the spring entirely), use the `setImmediate` method:

```typescript
// Snaps the position to target immediately
entity.setImmediate('y', targetY);
```

#### 3. Bypassing Canvas Physics for Mobile Scrolling

For full-screen pages where mobile users expect native momentum scrolling rather than Canvas-simulated springs, forward the touch gestures to the browser viewport:

1. Bind touch listeners to the Canvas to convert touch drag deltas to native window scrolls:

   ```typescript
   let touchStartY = 0;
   canvas.addEventListener(
     'touchstart',
     (e) => {
       if (e.touches && e.touches[0]) touchStartY = e.touches[0].clientY;
     },
     { passive: true },
   );

   canvas.addEventListener(
     'touchmove',
     (e) => {
       if (e.touches && e.touches[0]) {
         const touchY = e.touches[0].clientY;
         window.scrollBy(0, touchStartY - touchY);
         touchStartY = touchY;
       }
     },
     { passive: true },
   );
   ```

2. Listen to the `window` `"scroll"` event and sync the scroll position to the rendering container using `setImmediate` or a fast easing transition:

   ```typescript
   window.addEventListener('scroll', () => {
     mainScroll.y = -window.scrollY; // Or mainScroll.setImmediate('y', -window.scrollY);
   });
   ```

---

## UI Components & Devtools

### What do the devtools provide, and how do they help with debugging?

`@vectojs/devtools` is an in-page inspector — a panel (itself rendered with VectoJS) that gives you:

- A live tree view of the Virtual Math Tree, with badges for entity type, geometry, and active animations
- One-shot entity picking (click an entity on the canvas to select it in the tree)
- A world-transform readout (position, scale, rotation as actually computed after the full ancestor chain)
- Keyboard nudge editing of the selected entity
- A host-page overlay highlight showing the selected entity's world bounds

`Scene` exposes read-only `rootEntity`/`overlayRootEntity` accessors specifically so tooling like this can walk the tree without needing privileged internal access.

### What should I watch out for when using VectoJS's native UI components?

A few patterns worth knowing, drawn directly from auditing the component set:

- **`entity.id` uniqueness is your responsibility.** The engine doesn't enforce it. It matters most for the accessibility projection (`Scene` keys shadow DOM nodes by entity id) and for any of your own code that indexes entities by id (e.g. `SpatialHashGrid`) — pick ids the same way you'd pick keys in a `Map`.
- **Components that attach a listener to another entity must be `destroy()`ed.** `Tooltip`, `Popover`, and similar "attaches to a target" components store their handler and remove it in `destroy()` — always call it when you're done with the component, the same way you'd remove a manually-added listener.
- **`interactive = true` isn't free.** Setting it projects a real shadow DOM node for that entity. Fine for buttons, links, and form controls; avoid it on very large collections of leaf entities. `GridTextEntity`, for example, explicitly disables `interactive` for its whole grid specifically to avoid projecting a shadow node per character at scale.
- **Custom drag-based components should follow the built-in pointer-capture pattern.** `Slider` and friends call `setPointerCapture()` on `pointerdown` (via their a11y-projected element), which is what lets a fast drag that overshoots the component's visual bounds keep tracking correctly. If you build your own draggable component, follow the same pattern rather than relying on `pointermove`/`pointerleave` alone. Handle `pointercancel` as a rollback path so browser interruption cannot leave a drag or selection transaction active.

---

## Accessibility & Automation

### How do I make a component work with Playwright's `page.getByRole()`?

Return the correct tag and role from `getA11yAttributes()`:

```typescript
// Accessible button
getA11yAttributes() { return { tag: 'button', role: 'button', label: 'Send' }; }

// Accessible link
getA11yAttributes() { return { tag: 'a', role: 'link', label: 'Home', href: '/' }; }

// Accessible text field
getA11yAttributes() { return { tag: 'input', inputType: 'text', placeholder: 'Search…' }; }
```

Built-in components (`Button`, `Input`, `Link`, etc.) do this automatically.

### The shadow node position looks wrong — entities are offset

Two common causes:

1. **The canvas parent is not `position: relative`** — `Scene` enforces this automatically on every frame, but if another CSS rule forces `position: static` after the scene starts, the absolutely-positioned shadow nodes will be offset relative to the wrong containing block.
2. **`a11yOffsetX` / `a11yOffsetY`** — if you previously set these as a workaround, try removing them first to see if the underlying positioning is actually correct.

Enable `debugA11y: true` in the `SceneOptions` to see translucent highlight boxes over each shadow node:

```typescript
const scene = new Scene(canvas, { debugA11y: true });
```

---

## WebGPU Particles

### `ComputeParticleEntity` shows nothing — what's wrong?

The most common causes:

1. **`initRandomParticles()` was not called** — without initializing particle data, all positions are `(0,0)` and sizes are `0`.
2. **WebGPU is not available** — the scene logs the failed WebGPU request and falls back to the CPU/Canvas2D path; make sure `particleBackend: 'webgpu'` is set and your browser supports WebGPU.
3. **The canvas size is `0×0`** — call `scene.resize(w, h)` (or ensure the canvas has dimensions) before the first frame.

### How does the CPU fallback work?

When WebGPU is unavailable (or fails), `Scene` calls `entity.updateCPU(dt, mouseX, mouseY, width, height)` each rendered frame and draws particles through `fillCircle`. The fallback mirrors the spring/repulsion/explosion/velocity/bounce model, but CPU/GPU numeric paths and throughput are not guaranteed identical. Choose particle counts from measurements on target devices.

### Can I read back particle positions from the GPU?

Not directly — the particle state lives in a WebGPU storage buffer. To read it back you would need to issue a `copyBufferToBuffer` + `mapAsync` round-trip, which stalls the GPU pipeline. Instead, keep a CPU-side `particleData` Float32Array in sync if you need positions on the CPU. `setOrigins()`, `setPositions()`, and `setVelocities()` write to `particleData` and set `needsInit = true`, which uploads to the GPU storage buffer on the next frame.

> [!NOTE] > `mapAsync` + `copyBufferToBuffer` readback intentionally blocks the pipeline. For collision detection or spatial queries at scale, run those on the CPU path using `SpatialHashGrid`, or express them as additional WebGPU compute passes.

---

## Troubleshooting

### `Scene` is running but nothing appears on screen

Check in order:

1. Is `scene.start()` called?
2. Does the canvas have non-zero `width` and `height` CSS and HTML attributes?
3. Is the entity added to the scene via `scene.add(entity)` (not just constructed)?
4. Does the entity's `render()` method actually call `renderer.fill()` or `renderer.stroke()`? An empty `render()` draws nothing.
5. Is `entity.opacity` > 0?

### My scroll wheel event doesn't reach the `ScrollView`

The `ScrollView` calls `e.preventDefault()` on `wheel` events to prevent page scroll. If the shadow node's wheel listener fires but the scroll view doesn't react, verify that `ScrollView.add(child)` was used (not `entity.add(child)` directly bypassing the content wrapper), and that the canvas parent doesn't have `overflow: hidden` blocking pointer events.

### TypeScript reports `Cannot find name 'GPUDevice'`

Add `@webgpu/types` to your project:

```bash
bun add -d @webgpu/types
```

Then add to `tsconfig.json`:

```json
{ "compilerOptions": { "types": ["@webgpu/types"] } }
```

### Text or images look blurry (DPR)

Canvas text is rendered at the device pixel ratio by default — if it looks
blurry, the canvas backing store was sized at a lower DPR than the display
(usually because the page scaled or a custom layout container resized it
without a `scene.resize()`). Two handles:

- `maxDPR` caps the render DPR (option or live). A static page sized with
  `maxDPR: 2` on a 3x phone keeps the cost bounded — but capping below the
  panel's real DPR is exactly what produces blur, so cap deliberately.
- After any manual resize/zoom, call `scene.resize(w, h)` again — the DPR is
  re-read and the backing store re-created on every `resize()`. A scene whose
  canvas CSS box changes without `resize()` renders at the stale DPR and looks
  soft; the Firefox selection-calibration symptoms (drag highlight drifting
  from glyphs) are the same cause.

### MSDF text never appears (or appears late)

`MSDFTextEntity` lays out off-thread via a `blob:` Worker. Under a strict CSP
(`default-src 'self'`, `worker-src 'none'`, or `script-src` without `blob:`)
`new Worker(blob:…)` does **not** throw — it constructs and fires `onerror`, so
a CSP looks exactly like a crash. After two consecutive failures the manager
gives up and serves layout from the main thread, so text will still appear —
just not via the worker, and the first requests may seem to "hang" while the
fallback engages. Debug order: check the browser console for `worker-src` /
`blob:` violations (the fallback is invisible there), then confirm the scene
actually runs `pointBackend: 'webgl'` — the Canvas2D fallback path needs
`fallbackFont` set or there is nothing to draw.

### The scene is stuck at ~2 fps

That is the idle auto-throttle working as designed: a static scene (not dirty,
no pending transitions) renders at ~2 fps to save power. If your content
should be animating, either drive it through `entity.animate()` /
`setTransition` (which keep the scene non-static), or call `scene.markDirty()`
**between** frames — from an event handler, a separate `rAF`, or a timer —
never from inside `update()`, where the post-render dirty reset wipes it. The
nuclear option is `scene.autoThrottle = false` (or the `autoThrottle: false`
option), which renders every frame regardless.

### An `onDemand` scene never repaints

`renderMode: 'onDemand'` only draws when the scene is dirty or a transition is
pending. The classic miss: mutating entity state from your own `update()` or an
`Image` `onLoad` without calling `scene.markDirty()`. Value/hover/focus
changes in ui components (`Slider.setValue`, `ProgressBar.setValue`, `Button`
hover) all gate their repaint on it. If a frame should change but does not,
call `scene.markDirty()` once (e.g. from the `onLoad`/event handler) and the
next rAF draws it.

### My entity's `click`/`hover` events never fire

Events only dispatch on **interactive** entities (`interactive = true`, or a
component that sets it itself, or `Card` with a `label`). `Text`/`RichText`
are deliberately non-interactive — their semantic presence is the content
projection, and an interactive shadow node above selectable text would
intercept the pointer. Also check the entity actually has a box (`width`/
`height` > 0 or `getBatchCircle`/`getBatchRect`): hit-testing requires
geometry.

### `ScrollView` won't scroll

Two checks: the content must actually **exceed** the viewport —
`updateContentSize()` computes the max scroll range from children extents, so
content smaller than the viewport has nothing to scroll — and the default
spring is underdamped (ζ ≈ 0.45), which overshoots ~20% on release. For
document-like content, pass `scrollPhysics: DOCUMENT_SCROLL_PHYSICS` (the
exported `{ stiffness: 180, damping: 27 }` preset, ζ ≈ 1.0, no overshoot).

### A `Modal` / `Tooltip` / `Popover` never opens

These are floating layers, not scene children — they must be mounted
themselves: `scene.showOverlay(modal)` for `Modal`, and `showAtPoint(x, y,
source)` for `ContextMenu`/`Popover` where `source` is required before the menu
is mounted (a `Scene` or mounted `Entity`). `Tooltip`/`Popover` also attach a
listener to their `target` entity — always `destroy()` them when done or the
handler leaks.

### A `Table` / `VirtualList` ignores size or content changes

`Table` resolves its `width` once in the constructor — only `setWidth()` (and
`appendRows()` for rows) re-lays out; changing `table.width` directly does
nothing. `VirtualList` without `keyForItem` clears every row measurement and
jumps to the top on `setItems()` — correct for a replaced list, wrong for a
growing transcript; pass `keyForItem` (e.g. message id) and optionally
`stickToBottomThreshold` to keep a following viewport pinned to the bottom.

### The Three.js texture is stale / frozen

`ThreeAdapter` sets `texture.needsUpdate` only when the VectoJS scene actually
**renders** (it proxies `Scene.render`). With `renderMode: 'onDemand'`, an idle
scene never renders, so the texture keeps its last frame. Drive `markDirty()` /
`step()` (e.g. from the Three rAF) for paused panels, or run the scene in
`'always'` mode.

### A graph3d layout explodes or components drift apart

Both layouts are force models: an **exploding** graph is usually a link
mismatch after `setGraph` (links reference node ids that no longer exist —
positions for missing nodes are uninitialized). Components drifting apart
under `forceCenter` is the force model's normal behaviour for disconnected
subgraphs — add a `centerStrength` (VectoForceLayout) or accept the drift.
When run-to-run stability matters, use `VectoForceLayout` with its `seed` — it
is deterministic; `D3ForceLayout` starts from d3's own randomized placement
and is not. Pinned nodes keep `fx/fy/fz` (and initial `x/y/z` seeds are
carried over as starting positions, not pins).

### `@vectojs/styles` — my `var(--token)` does not resolve / the theme never changes

`var(--key)` resolves against the **active** theme at `applyStyle` time, and
styles containing tokens are re-applied when `setTheme(next)` runs. If a color
never changes, the style probably holds a literal value (no `var()`), which is
deliberately untracked. If `applyStyle` itself throws `unknown token`, the key
is missing from the active theme — remember keys are written without the `--`
prefix (`tokens({ accent: … })` ↔ `var(--accent)`), and `setTheme` throws the
same error when a switched-to theme drops a referenced token. A token whose
value fails the property's validation (e.g. `--radius-md: "50%"`) also throws
on switch. See [`styles`](/reference/styles/).
