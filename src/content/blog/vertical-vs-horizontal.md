---
title: 'Vertical or Horizontal: How VectoJS Breaks Frontend Ceilings'
description: 'The history of frontend evolution has been one long horizontal patch. VectoJS asks a different question: what happens when you go vertical instead?'
date: 2026-07-02
author: Xuepoo
tags: [philosophy, architecture, performance]
---

There is a phrase I keep returning to when people ask me why VectoJS exists:

> **"If you can't break through horizontally, try going vertical."**

It sounds like a go proverb. But it's actually the clearest way I know to describe a decade of frontend engineering — and the dead end it quietly ran into.

## The Horizontal Era (2013–2024)

Let's be honest about what the last decade of frontend progress actually was.

The browser gives us a document renderer. HTML describes structure. CSS describes style. JavaScript orchestrates behavior on top. And for a long time, the frontier of "frontend innovation" consisted almost entirely of **horizontal moves** — improvements made within this fixed system of constraints, not escapes from it.

**Virtual DOM** (React, Vue) is a horizontal move. It reduces the cost of reconciling two trees of HTML nodes — but it never questions why there are HTML nodes at all. You still ship divs. You still wait for the browser's layout engine to arrange them. You still pay the tax of a general-purpose document renderer trying to be an application runtime.

**CSS methodologies** (BEM, CSS Modules, Tailwind) are horizontal moves. Tailwind in particular improves style locality by co-locating tokens with markup. It does not change the browser rendering pipeline or remove the need to profile layout, paint, and compositing at the workload's target scale.

**Server components, partial hydration, islands architecture** — more horizontal moves. All of them brilliant within their domain. All of them ultimately constrained by the same ceiling: **the browser's document model**.

And that ceiling is real. Try building a high-frequency trading terminal in React. Try rendering a Figma-class design canvas with 100,000 interactive objects. Try running a physics simulation at game-engine fidelity inside a CSS grid. At some point, you don't hit a framework limitation — you hit the operating envelope of the renderer underneath every framework. The DOM itself.

## The Vertical Descent

VectoJS was built on a different question.

Not "how do we make DOM manipulation cheaper?" but "**what if we replaced the DOM's job entirely, and went down to pure mathematics and hardware?**"

This is what I mean by vertical. Not building higher abstractions on top of the existing stack — but descending _beneath_ it, to a layer where the physics are simpler, the performance contracts are tighter, and the constraints are set by algebra and GPU architecture rather than a spec written for a document renderer.

Concretely, this means:

**Coordinate transforms become affine matrix operations.** A VectoJS entity's position, rotation, and scale compose as $3 \times 3$ affine matrices without CSS style/layout invalidation. Updating a subtree root is one property write; rendering still traverses descendants and composes each world transform.

**Text flow around objects becomes set-difference algebra.** The `RichText` component's exclusion shapes — the "float" concept from CSS — aren't computed by a constraint solver trying to satisfy the cascade. They are computed as geometric intersections between a line's available rectangle and a set of exclusion regions. Pure geometry, pure computation, O(lines × exclusion count) with no global recalculation.

**Animations become second-order ODEs.** CSS transitions are easing curves — lookup tables dressed up as physics. VectoJS's spring animations are actual damped harmonic oscillators, solved numerically each frame. The physics are real. The overshoot, the settling time, the critical damping threshold — all of it follows from the differential equation, not from a cubic-bezier approximation of what physics "feels like."

**Rendering bulk becomes a GPU batching problem.** At high entity counts, VectoJS can collect representable circle/rectangle leaves into typed WebGL buffers instead of issuing one Canvas path per entity. `ComputeParticleEntity` can move its fixed particle integration model to a WebGPU compute shader. The practical ceiling and timing remain hardware- and workload-dependent; this repository does not currently contain a verified million-particle benchmark.

None of this is clever framework engineering. It's just doing the work that the DOM was abstracted away from — and discovering that, beneath the abstraction, the work is actually very tractable.

## The Architecture That Goes Both Ways

The most elegant expression of this vertical philosophy is how VectoJS handles the one thing that makes Canvas UIs genuinely hard: **accessibility and automation**.

The naive path, if you've thrown away the DOM, is to rebuild DOM-like semantics inside your Canvas. Maintain a shadow tree. Simulate focus rings. Intercept keyboard events and re-route them. Fake IME composition. It's a rabbit hole that ends in either a broken screen reader experience or an enormous accessibility shim that fights the browser at every turn.

VectoJS goes vertical here too — but in both directions simultaneously.

**Downward:** Canvas-backed layers render 2D geometry without one styled HTML node per visual entity. Frame rate remains a workload/device measurement, and eligible controls still project semantic DOM nodes for accessibility and automation.

**Upward:** A transparent shadow DOM layer — `a11yRoot` — floated above the canvas in Z-axis space. For every interactive entity, the `Scene` projects a real, invisible, correctly-positioned HTML element (`<button>`, `<input>`, `<textarea>`, etc.) onto this layer. Screen readers walk this layer. Playwright's `getByRole()` queries this layer. IME composition targets the real `<input>` in this layer, not a canvas simulation of one.

The user sees the canvas. The machine sees real HTML. Neither interferes with the other.

This is what vertical architecture actually looks like in practice: not replacing one horizontal layer with another, but creating a fundamentally different stratification where each concern lives at its natural level.

## Why This Matters Now

I don't think VectoJS is for everyone. If you're building a blog, a dashboard, a marketing site, or even a moderately complex application — React and DOM are excellent tools. The horizontal innovations of the last decade are genuinely good for that workload.

But there is a category of software that the web has always struggled to host: **creative tools, simulations, real-time data visualization, code editors, game interfaces, professional design environments**. Software that needs to render enormous amounts of dynamic visual state, respond to input with sub-frame latency, and maintain coherent complex layout without ever letting the user perceive a stutter.

That software has historically lived outside the browser, or has lived inside it while fighting the DOM for every millisecond.

VectoJS exists because I believe that constraint is not inherent to the web platform itself. WebGL, WebGPU, `OffscreenCanvas`, `requestAnimationFrame` — the browser has real GPU access, real parallelism, real high-performance rendering primitives. The horizontal DOM layer is optional.

You just have to be willing to go vertical.

---

_Xuepoo is the author of VectoJS, a zero-DOM Canvas rendering framework for building professional-grade interactive applications on the web._
