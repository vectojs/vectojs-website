---
title: 'FAQ'
description: 'Frequently asked questions about VectoJS — architecture decisions, performance, accessibility, and troubleshooting.'
order: 3
---

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
