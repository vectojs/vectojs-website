---
title: 'Introduction to VectoJS'
description: 'What VectoJS is, why it exists, how its architecture differs from DOM-based frameworks, and when to use it.'
order: 1
---

# Introduction to VectoJS

**VectoJS** is a mathematical UI rendering engine for the browser. It uses a JavaScript entity tree (the _Virtual Math Tree_) to compute layout, applies physics and animations in memory, then paints the visual result to canvas-backed layers. Entity drawing avoids DOM layout/style work; the same frame may still update projected accessibility and portal DOM.

For eligible interactive components, VectoJS can project an invisible real DOM node (a `<button>`, `<input>`, `<a>`, etc.) over the canvas. This enables native form editing and role-based automation, but accessibility still depends on application semantics, focus/keyboard behavior, visual alignment, and assistive-technology testing.

## What problem does it solve?

The browser's DOM is a general-purpose document renderer. It is excellent for text, flowing content, and moderate amounts of interactive elements. It becomes a bottleneck when:

- You need **thousands of individually animated items** (charts, particle UIs, node graphs).
- Layout has **tight math constraints** — spring physics, force-directed graphs, precision coordinate systems.
- You target environments where **CSS layout is unavailable** — WebGL scenes, offscreen canvas, server-side SVG export.

VectoJS trades the convenience of declarative CSS for predictable performance and complete layout control.

## How it differs from other canvas frameworks

Most canvas libraries give you a drawing API and leave layout, hit-testing, and accessibility to you. VectoJS provides a full component stack:

| Layer             | VectoJS                                                | Typical Canvas Lib  |
| ----------------- | ------------------------------------------------------ | ------------------- |
| **Layout**        | Pure-math entity tree, no reflow                       | Manual              |
| **Hit-testing**   | Per-entity `isPointInside()`, O(N) depth-first         | Manual              |
| **Events**        | DOM-like capture + bubble                              | Manual or callbacks |
| **Accessibility** | Automatic semantic DOM projection                      | Not provided        |
| **Text**          | Full LayoutEngine: wrapping, BiDi, Arabic, MSDF        | `fillText` only     |
| **Animation**     | Queued tweens, spring physics                          | External library    |
| **Components**    | Button, Input, Toggle, Dropdown, ScrollView, Markdown… | Not provided        |

## Core Engine Concepts

VectoJS is built upon eight fundamental mathematical and architectural pillars. For developers moving from a traditional DOM or standard game loop mindset, these concepts establish the foundational "UI as an algebraic equation" mental model.

Each pillar below links its implementation model to the relevant practical guide:

### 1. The Virtual Math Tree (VMT)

The core tree architecture replacing the traditional browser DOM. It is an in-memory scene graph of localized coordinate systems. The render walk threads scalar transforms without allocating a matrix object per node. Traversal, hit-testing, and accessibility synchronization are still $O(N)$; `renderMode: 'onDemand'` skips drawing unchanged scenes but continues polling `requestAnimationFrame`.

- 📖 **Mathematical Theory**: [Mathematical Foundations: VMT](/learn/math-foundations/#1-the-virtual-math-tree-vmt)
- 🛠️ **Practical Implementation**: [Core Scene Architecture Guide](/learn/core-scene/)

### 2. Semantic projection overlay (a11yRoot)

Our bridge for Canvas accessibility and testing limitations. VectoJS projects a transparent layer of semantic HTML tags (`<button>`, `<input>`, `<a>`, etc.) above the canvas. This enables standard Playwright role selectors and lets input/textarea components delegate editing and IME behavior to native controls. Applications still need keyboard, screen-reader, contrast, and focus testing for their own component composition.

- 📖 **Mathematical Theory**: [Mathematical Foundations: a11yRoot](/learn/math-foundations/#2-semantic-shadow-dom-a11yroot)
- 🛠️ **Practical Implementation**: [Accessibility & Automation Guide](/learn/accessibility/)

### 3. Affine Transformations

VectoJS uses explicit entity positions and layout components instead of CSS positioning. Translation, scaling, and rotation compose as a homogeneous $3 \times 3$ affine transform during DFS traversal. `worldToLocal()` analytically inverts the affine transform in constant arithmetic time, allowing transformed rectangular controls to map scene-space pointers back to local space.

- 📖 **Mathematical Theory**: [Mathematical Foundations: affine transforms](/learn/math-foundations/#3-affine-transformations)

### 4. Cold/Hot Split Layout Engine

A typographic architecture that separates dictionary segmentation and character measurement into a **Cold Pass** (on content change). Responsive wrapping and refitting run in a **Hot Pass** using cached advances. Paragraph memoization lets append operations reuse unchanged leading paragraphs; work still grows with the changed paragraph, and Markdown additionally re-lexes its complete source buffer.

- 📖 **Mathematical Theory**: [Mathematical Foundations: Cold/Hot Split](/learn/math-foundations/#4-coldhot-split-layout-engine)
- 🛠️ **Practical Implementation**: [Text & Typography Guide](/learn/text-typography/)

### 5. Set-Difference Algebra for Text Flows

To wrap text around arbitrary shapes and callouts, VectoJS bypasses empirical trial-and-error wrapping. It models text wrapping as **Interval Subtraction Set Theory**. The line width represents a closed interval $I_0 = [0, \text{maxWidth}]$ and obstacles represent subtraction intervals $E_k$, solving the allowed writing space deterministically:
$$I_{\text{allowed}} = I_0 \setminus \bigcup E_k$$

- 📖 **Mathematical Theory**: [Mathematical Foundations: Set-Difference Algebra](/learn/math-foundations/#5-set-difference-algebra-for-text-flows)

### 6. Sampled Spline Hit-Testing

`SplineEntity` converts cubic-polynomial segments to Bézier control points, samples each curve into a cached polyline, and compares the pointer's squared distance against each line segment. This avoids pixel reads and is more precise than AABB-only mode, with accuracy controlled by the sampling density and hit tolerance.

- 📖 **Mathematical Theory**: [Mathematical Foundations: Sampled Spline Hit-Testing](/learn/math-foundations/#6-sampled-spline-hit-testing)

### 7. Semi-Implicit Euler ODE Dynamics

CSS easing timers break and jump visually when state transitions are interrupted. VectoJS handles transitions as simulated physical mass-spring-damper systems governed by second-order **Ordinary Differential Equations (ODEs)**. Integrated at runtime via a stable **Semi-Implicit Euler solver**, animated components conserve physical momentum and smoothly adapt to dynamic target changes.

- 📖 **Mathematical Theory**: [Mathematical Foundations: ODE Dynamics](/learn/math-foundations/#7-differential-equations--semi-implicit-euler-solvers)
- 🛠️ **Practical Implementation**: [Physics Engine Integration](/learn/physics-engine/)

### 8. SpatialHashGrid Utility

VectoJS exports a fixed-cell `SpatialHashGrid` that applications can populate for local AABB neighbor queries. It uses a Cantor-paired numeric key and returns IDs from every cell overlapped by the query box. The Scene does not populate or query this grid automatically for hit-testing or culling.

- 📖 **Mathematical Theory**: [Mathematical Foundations: SpatialHashGrid Utility](/learn/math-foundations/#8-spatialhashgrid-utility)
- 🛠️ **Practical Implementation**: [Hardware Performance Optimization](/learn/performance/)

## Architecture overview

<img src="/images/vmt-architecture.svg" alt="Architecture overview: Scene drives an Entity tree through the rAF loop, physics, and IRenderer backends (Canvas2D, WebGL, WebGPU), projecting an accessibility DOM overlay and consuming @vectojs/ui components" class="diagram" />

### The Virtual Math Tree (VMT)

The `Scene` contains a tree of `Entity` objects. Each entity has:

- **Position** (`x`, `y`), **scale** (`scaleX`, `scaleY`), **rotation** (radians), **opacity**.
- A **children** array — nesting works the same as the DOM.
- A **hit box** (`width`, `height`) for event routing.
- An `update(dt, time)` hook for per-frame logic.
- A `render(renderer)` hook that draws the entity in its _local coordinate space_.

The Scene walks the tree every frame: translate → scale → rotate for each entity's local transform, call `render()`, then restore. Children inherit their parent's transform automatically.

### The render loop

<figure>
  <iframe src="/sandbox/diagram-pipeline.html" class="diagram-frame" loading="lazy" title="The VectoJS render loop: the six stages of one dirty frame, rendered live by VectoJS" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>One requestAnimationFrame tick: update, cull, render, flush WebGL batches, then sync the accessibility projection overlay. <em>(Rendered live by VectoJS.)</em></figcaption>
</figure>

### The accessibility projection layer

A transparent `<div>` lives above the canvas (`z-index: 10`). When an entity has `interactive = true`, the `Scene` creates a real DOM element inside this div — a `<button>`, `<input>`, `<a>`, `<img>`, or `<div role="...">` — and positions it over the entity's canvas box on every frame.

Screen readers discover these real elements. Playwright's `page.getByRole('button', { name })` finds them. IME input goes directly into the real `<input>`. The canvas draws what the shadow element reports.

### Rendering backends

| Backend           | When                        | Capability                                                     |
| ----------------- | --------------------------- | -------------------------------------------------------------- |
| `CanvasRenderer`  | Default                     | Canvas 2D; `devicePixelRatio` scaling                          |
| WebGL point layer | `pointBackend: 'webgl'`     | Batch circles/rects + MSDF glyphs                              |
| WebGPU compute    | `particleBackend: 'webgpu'` | GPU particle simulation; capacity is device/workload dependent |
| `SVGRenderer`     | `scene.toSVG()`             | Headless SVG export                                            |

## Packages

| Package          | Contents                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------- |
| `@vectojs/core`  | `Scene`, `Entity`, `LayoutEngine`, text/MSDF, particles, renderers, math utilities          |
| `@vectojs/ui`    | High-level components: `Button`, `Input`, `Toggle`, `Markdown`, `ScrollView`, `Dropdown`, … |
| `@vectojs/three` | Three.js / WebGL 3D renderer adapter                                                        |

## Features

### Entity scene graph

Every visual object in VectoJS is an `Entity` in the Virtual Math Tree. You add behavior by subclassing `Entity` and overriding `update(dt)` and `render(renderer)`. This is a scene graph, not an entity-component-system architecture: the tree is a plain JavaScript object graph with deterministic traversal order and full transform inheritance (translate → scale → rotate).

### Canvas-first visual tree

The visual entity tree is painted into canvas rather than represented by styled DOM nodes. Browser CSS layout does not position canvas entities. Interactive/accessibility entities do project semantic shadow elements, so DOM node count grows with the number of projected controls rather than staying strictly flat.

### Hot/cold LayoutEngine with bidirectional text support

Text layout runs in two phases. `prepare()` (cold) segments and measures glyph widths, while `layoutPrepared()` (hot) applies line-break constraints to cached prepared data. Resize avoids repeated browser measurement, though wrapping still costs work proportional to the prepared content. The BiDi resolver handles Arabic, Hebrew, and mixed-direction paragraphs.

### WebGL and WebGPU hardware acceleration

Representable circle/rectangle leaves can be collected into WebGL typed buffers and submitted in batched draws. `ComputeParticleEntity` can run its fixed spring/repulsion model in a WebGPU compute pass with a CPU fallback. Capacity and frame time depend on hardware and workload; the repository does not currently include a checked-in high-end GPU benchmark.

### `a11yRoot` — semantic projection

A transparent overlay `<div>` holds a real `<button>`, `<input>`, `<a>`, or `<img>` for each projected interactive entity. This supports role-based automation and lets form controls use native focus/editing paths. It is not automatic parity with arbitrary HTML: applications must provide correct roles/labels, keyboard behavior, focus order, and test visual/semantic alignment for their transforms.

### Low memory footprint

Visual entities are JavaScript objects rather than one styled DOM subtree per drawable. The page still contains the canvas, projection roots, and one shadow element per eligible interactive entity. `ComputeParticleEntity` stores per-particle numeric state in a contiguous `Float32Array`, avoiding one JavaScript object per particle.

### Highly customizable

`Entity` is an open base class. `render(renderer: IRenderer)` gives access to path drawing, gradients, image compositing, and clipping. Effects that require CSS hacks — irregular shapes, canvas-to-canvas blending, pixel-perfect concave hit testing — are straightforward in VectoJS because the render path is plain JavaScript with no style system in the way.

### Built-in component library

`@vectojs/ui` ships `Button`, `Input`, `Toggle`, `Slider`, `Dropdown`, `ScrollView`, `Table`, `Markdown`, `Modal`, `Stack`, `Flow`, and more. Every component is a plain `Entity` subclass — extend it, override `render()`, change layout behavior, or compose components freely.

### Native Markdown rendering optimized for streaming

The `Markdown` component renders GitHub Flavored Markdown (tables, task lists, fenced code, links, images) via VectoJS's LayoutEngine. `appendMarkdown(delta)` re-lexes the complete source, then diffs tokens and reuses unchanged leading entities instead of rebuilding the whole visual tree. Math (via MathJax), Mermaid diagrams, and ABC musical notation are exported to SVG and rendered as engine `Image` entities.

### High compatibility

VectoJS produces a `<canvas>` element that fits anywhere: React `useEffect`, Vue `onMounted`, Angular `ngAfterViewInit`, or a plain `<script>`. It does not conflict with surrounding CSS layout. `scene.resize()` handles responsive layouts; device pixel ratio scaling is automatic. Libraries like React, Vue, and Angular can import VectoJS directly.

### Configurable maxFPS with idle throttling

`new Scene(canvas, { maxFPS: 60 })` caps the render loop. When the scene has no pending animation and no `markDirty()` call arrives between frames, the engine auto-throttles to ~2 fps — conserving CPU and battery without any application code change. Useful for settings panels, idle states, and background tabs.

### Three.js adapter for 3D effects

`ThreeAdapter` renders a full VectoJS scene onto an offscreen canvas and uploads it as a `THREE.CanvasTexture` on any Three.js mesh. UV coordinates from Three.js raycasts are mapped back through VectoJS's hit-test system, so canvas buttons and inputs work on 3D surfaces and in WebXR sessions.

### Reused typed storage in hot paths

Particle data lives in a `Float32Array` with 8 floats per particle (position, velocity, origin, size, life). The particle and WebGL batch paths reuse typed storage for their core numeric data. This reduces allocation pressure; it is not a whole-frame zero-allocation guarantee for the Scene or application.

### Opt-in spatial indexing and viewport culling

`SpatialHashGrid` is exported for applications that want bucketed proximity queries; the Scene does not automatically index every entity. During its normal tree walk, the Scene transforms each entity's optional `getBounds()` and skips `render()` for boxes outside the viewport. This reduces draw work, but traversal and `update()` remain O(N).

### Multi-threaded computation

`MSDFTextEntity` can offload line placement over precomputed glyph metrics to a Web Worker via `LayoutWorkerManager`; the worker does not perform browser font measurement. WebGPU can run `ComputeParticleEntity` integration and rendering on the GPU, while Scene traversal and submission remain on the JavaScript thread.

### Intelligent graphics batching

Consecutive same-color, same-alpha sibling entities on the WebGL point layer merge into batched `gl.drawArrays()` calls. Opt in with `getBatchCircle()` or `getBatchRect()` on leaf entities. Actual draw count depends on primitive type, ordering, capacity, and style changes.

### Native mathematical curve rendering

The `IRenderer` interface exposes path commands including `moveTo`, `lineTo`, `bezierCurveTo`, and `arc`. `SplineEntity` converts polynomial and Bézier spline documents into renderer paths with configurable hit-test precision.

### Small bundle with modular imports

`@vectojs/core` exposes `@vectojs/core/layout`, `@vectojs/core/renderer`, and `@vectojs/core/text` subpaths for focused imports. The main `@vectojs/core` entry auto-registers the WebGL point creator and WebGPU particle manager; subpath imports have no registration side effect. The renderer subpath includes Canvas, SVG, WebGL point, and WebGPU renderer utilities rather than only Canvas2D.

### Automation and framework friendly

The `a11yRoot` shadow layer means Playwright's `page.getByRole('button', { name })` finds VectoJS buttons by ARIA role — test automation is identical to testing a standard webpage. Selenium, Cypress, and AI agent frameworks work the same way. React, Vue, Angular, and Svelte can all import VectoJS directly.

---

## Use cases

VectoJS solves problems where the DOM breaks down. These are the environments it was designed for.

### Data visualization and real-time dashboards

Charts, topology viewers, and tables that update on every data tick. Adding 800 animated graph nodes does not trigger browser layout recalculation because no DOM nodes are allocated for canvas entities — entity state lives in plain JS objects and memory usage stays bounded as data streams grow.

**Examples:** financial deep order book terminals, K8s pod topology viewers, live network graphs, high-frequency trading dashboards, real-time analytics.

### Streaming rendering — LLM clients, danmaku, live feeds

Paragraph-level memoization lets `Text.append()` remeasure only the changed paragraph. `Markdown.appendMarkdown()` re-lexes the accumulated Markdown, compares token raw source, and reuses the unchanged entity prefix; a growing final paragraph can be updated in place.

The Danmaku demo uses pooled canvas entities and lane allocation to avoid one DOM node per comment. Capacity and frame rate depend on hardware, font rendering, comment density, and the selected backend; measure with the included demo/report tooling instead of relying on a fixed count.

**Examples:** LLM chat clients, real-time video comment overlays (danmaku/Niconico-style), K8s event feeds, live stream chatrooms.

### Infinite canvases and knowledge graphs

Collaborative whiteboards, node-edge knowledge graphs, and design tools can combine the exported `SpatialHashGrid` with entity `getBounds()` culling. Scene culling avoids offscreen draw calls, while applications remain responsible for indexing/querying very large data sets and should benchmark O(N) tree traversal at their target scale. The `a11yRoot` layer can project interactive nodes for keyboard and automation access.

**Examples:** collaborative whiteboards, knowledge graphs, mind maps, Figma/Miro/Excalidraw-style design tools.

### Web games and interactive media

VectoJS's `update(dt)` loop, spring physics, `ComputeParticleEntity`, and `animate()` tweens provide the primitives a browser game needs without a full game engine. Game controls still work via keyboard and can be tested by automation tools because interactive entities project real ARIA shadow nodes.

The same architecture works for educational explainer animations — a web-native alternative to Remotion and Manim that runs directly in the browser without a video pipeline.

**Examples:** OSU!-style rhythm games, physics sandboxes, educational animations, interactive course materials.

### Web-based text editors and developer tools

Canvas-based editors need explicit control over text layout and selection. VectoJS provides layout primitives plus `Input`/`TextArea` components backed by real shadow form controls for browser editing and IME behavior. A production editor still needs application-specific document models, navigation, virtualization, and accessibility testing.

**Examples:** code editors, rich-text editors, terminal emulators, diff viewers.

### WebXR and immersive spatial UIs

`ThreeAdapter` renders a full VectoJS scene as a `THREE.CanvasTexture` on any Three.js mesh. In a WebXR session, a VectoJS panel can float as a 3D plane in the user's field of view, with pointer-event routing via UV raycasting from XR controllers.

**Examples:** VR/AR spatial dashboards, in-world terminal screens, head-up display instrument clusters.

### Everything a Pretext-style renderer handles, and more

VectoJS covers everything Pretext can render — mathematical curves, Bézier-spline paths, parametric shapes, precise coordinate-system layouts — and adds an event system, accessibility layer, component library, and physics engine on top. If you were using Pretext for interactive or web-targeted output, VectoJS is the natural upgrade path.

### Advanced and unconventional interactive websites

Tech-focused product sites and portfolio pages that want to go beyond what CSS alone can produce: physics-driven layouts, cursor-reactive particle fields, magnetic typography, real-time generative art integrated with page content. VectoJS makes these possible while keeping the surrounding HTML/CSS structure intact — the canvas sits inside a normal webpage.

---

## When not to use VectoJS

VectoJS is a **low-level building block**, not a page framework. It is not the right tool when:

- You are building a mostly-text website or blog (use HTML + CSS).
- Your UI is data-driven forms with standard validation (use React/Vue/Svelte).
- You need SEO crawlability of rendered content (use SSR HTML).
- You do not need custom layout math or high entity counts.

VectoJS shines when you need **canvas-level control** with **production-grade infrastructure** (events, accessibility, text, physics) that you would otherwise build yourself.

## Challenges

### Map the architecture

Trace the full path from a user clicking the canvas to a frame being painted and the screen reader being updated. Describing this end-to-end path cements your mental model before writing any code.

- Start at the raw `pointerdown` event on the `<canvas>` element and name every system that handles it before an entity's `on('click')` callback fires.
- Identify where in the loop `markDirty()` matters and what happens if it is never called after the click changes state.
- Locate where `syncA11y()` is called relative to `render()` and explain why order matters for users relying on a screen reader.

### Identify use cases

Given three app descriptions, decide whether VectoJS is the right tool for each and justify your reasoning using the trade-offs described in this page.

- **App A**: A company blog with long-form articles, images, and a comment section. The content is mostly static text, refreshed by a CMS on each page load.
- **App B**: A real-time network topology viewer displaying 800+ animated nodes and edges, with physics-based layout that updates on every data tick.
- **App C**: A multi-step employee onboarding form: 6 pages of dropdowns, text fields, file uploads, and standard form validation with server-side errors.

### Benchmark in mind

Before running any profiler, predict which of the three scenarios below would benefit from `renderMode: 'onDemand'` instead of a continuous 60 fps loop, and explain what `onDemand` saves.

- A data visualization that shows a static snapshot of last month's sales, with one "Refresh" button that fetches new data.
- A particle simulation where 10,000 dots move and collide every frame.
- A settings panel (toggles and sliders) that the user opens occasionally and interacts with for 30 seconds before closing.

## Next steps

- [Mathematical Foundations](/learn/math-foundations/) — the linear algebra, spline geometry, and ODE solvers powering VectoJS.
- [Getting Started](/learn/getting-started/) — install and create your first scene.
- [Core Scene](/learn/core-scene/) — the render loop, entities, and transforms in depth.
