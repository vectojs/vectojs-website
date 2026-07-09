---
title: 'We Threw Out the DOM, Kept Accessibility'
description: 'VectoJS renders every UI to one <canvas> element with no HTML tree underneath — and screen readers, Ctrl+F, and Playwright still work. The architecture, the honest cost, and what it buys you.'
date: 2026-07-09
author: Xuepoo
tags: [architecture, philosophy, accessibility]
---

**VectoJS is an open-source TypeScript UI framework that renders an entire application to a single `<canvas>` element instead of the DOM.** Every UI framework of the last decade has made a different bet: the DOM is the substrate, and the framework's job is to manage it faster, or hide it behind a nicer syntax. React manages it with a virtual diff. Svelte compiles away the runtime cost of managing it. Tailwind makes styling it less painful. All of them still assume that a UI, underneath, is a tree of HTML elements.

VectoJS doesn't make that assumption. It renders everything — text, buttons, scrollable lists, thousands of live data points — to one `<canvas>` element. There is no HTML tree underneath. A `Button` is a plain TypeScript object with a position, a size, and a `render()` method; the whole UI is a retained scene graph of these objects, walked and drawn every frame like a game engine's scene, not laid out like a document.

```typescript
class DangerButton extends Button {
  override render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, 8);
    r.fill('#dc2626');
    super.render(r); // draw the label on top
  }
}
```

No CSS specificity, no cascade, no layout thrashing from reading a style back after writing it — the object's own fields are the only state that exists. Inheritance and composition work exactly like they do in any other TypeScript codebase, because this _is_ just TypeScript, not a templating language pretending to be one.

## The obvious objection

If you've gotten this far, you're probably thinking: fine, but you've just reinvented `<canvas>` games, and canvas is an accessibility black hole. Screen readers see a single opaque bitmap. `Ctrl+F` finds nothing. That's true of every canvas app that came before this one, and it's the actual reason most teams don't consider canvas for real UI.

Here's the mechanism we built to close that gap, concretely: every entity that's `interactive` projects a single, invisible, real DOM node — a `<button>`, an `<input>`, an `<a>` — into a layer positioned exactly over the canvas. That node's transform is re-synced every frame, so if the entity moves, scales, or rotates, the invisible DOM node moves with it. Keyboard focus, native pointer events, and screen readers all land on that real element, because it _is_ one — just transparent, sitting precisely on top of what's drawn.

This is not free, and we're not going to pretend it is: it's a real DOM node per interactive entity, kept in sync every frame. It's the right cost for buttons, links, and form controls — the things a person actually needs to reach — and it's exactly why we don't set it on the other 99% of a typical VectoJS scene: individual particles, glyphs, and data points cost nothing but a draw call, because nothing about them is interactive.

## What that split buys you

Because the non-interactive path is free, the workloads VectoJS is actually built for are the ones that make a DOM-based UI fall over: a full node-graph editor with hundreds of draggable, connected nodes and live bezier curves, redrawn at 60fps with zero DOM elements for the graph itself; a WebGPU compute pass moving tens of thousands of particles, with a CPU fallback when WebGPU isn't there; a text reader that reflows an entire book around your cursor in real time, which is a layout operation no browser engine is built to do smoothly at that scale.

[Try the node editor](https://gallery.vectojs.org/#/creation/node-editor) · [Try the particle field](https://vectojs.org/demos/nexus/) · [Try the reflowing reader](https://gallery.vectojs.org/#/creation/reader)

We're not going to hand you a single "N× faster" number, because there isn't one — it depends on how much of your scene is actually interactive, your GPU, and your browser. What we do ship is a live FPS/entity-count readout on the demos themselves, so you can measure your own hardware instead of trusting ours.

## Try it yourself

Everything here is MIT-licensed and on GitHub: the [engine](https://github.com/vectojs/vectojs), the [docs site](https://github.com/vectojs/vectojs-website) you might be reading this on, and a community [gallery](https://gallery.vectojs.org/) where anyone can submit their own VectoJS creation as a one-file pull request.

## Related reading

- [FAQ](/reference/faq/) — the honest version of every question above, including the ones glossed over here.
- [Accessibility](/learn/accessibility/) — the full projection API.
- [Rethinking Frontend: The VectoJS Philosophy](/blog/rethinking-frontend/) — the broader case against HTML/CSS as an application substrate.
