+++
title = "Zero DOM Elements, Full Accessibility: Launching the VectoJS Gallery"
description = "VectoJS renders an entire UI to one <canvas> with no DOM tree underneath it — and screen readers, Ctrl+F, and Playwright still work. Here is how, honestly, and an invitation to build on it."
date = 2026-07-08

[extra]
author = "Xuepoo"
tags = ["announcement", "architecture", "accessibility"]
+++

VectoJS renders its entire UI — buttons, text, forms, scrollable lists, thousands of live data points — onto a single `<canvas>` element. No DOM tree underneath it. And a screen reader can still use it, `Ctrl+F` still finds the text, and `page.getByRole('button', { name: 'Submit' })` still works in Playwright.

That combination is the part people don't believe until they've clicked through a demo themselves, so today we're launching **[gallery.vectojs.org](https://gallery.vectojs.org)** — a community showcase of things people have built with it, itself rendered natively with VectoJS — and using the occasion to actually explain how the accessibility part works, rather than just assert it.

## The architecture in one sentence

VectoJS keeps a retained scene graph — we call it the Virtual Math Tree — of `Entity` objects with position, scale, rotation, and a `render()` method that draws through a renderer-agnostic `IRenderer` interface (Canvas2D, WebGL, WebGPU, or SVG-for-export, your choice per entity). Nothing about this is novel on its own; it's the same idea every canvas engine and every game UI has used for years. The part that's less common is what happens next.

## The accessibility trick, honestly

Here's the mechanism, not just the claim: every entity that's `interactive = true` projects a single, transparent, position-synced real DOM node — a `<button>`, an `<input>`, an `<a>`, whatever `getA11yAttributes()` says it should be — into a shadow layer sitting over the canvas. That node tracks the entity's world transform every frame: if the entity moves, scales, or rotates, its shadow node moves, scales, and rotates with it. Native browser focus, keyboard events, and pointer capture all land on that real element, exactly like they would on a normal DOM button — because it _is_ a normal DOM button, just invisible and precisely overlaid.

This is not a novel accessibility API and it's not free. It's a real `<div>`/`<button>`/`<input>` per interactive element, synced every frame, and your application still owns getting the roles, labels, and focus order right — VectoJS gives you the mechanism, not a guarantee. Set `interactive` on ten thousand tiny entities and you've built ten thousand real DOM nodes, which is exactly the cost you were trying to avoid; a grid-of-glyphs demo in the repo explicitly disables it for that reason. The win is narrower and more honest than "canvas is accessible now": your interactive surface (buttons, forms, links, the things a user actually needs to reach) gets first-class native semantics, while your non-interactive surface (data points, particles, decorative text, glyphs by the thousand) costs nothing beyond a draw call.

## What that buys you in practice

Because the non-interactive path has no DOM cost, workloads that make a DOM-based UI fall over are the ones VectoJS is actually built for: a chat demo streaming Markdown token-by-token with tables, code, and inline math; a WebGPU compute pass moving tens of thousands of particles at once, with a CPU fallback when WebGPU isn't available; a knowledge-graph demo panning and zooming over a real backbone of nodes surrounded by thousands of synthetic satellites, at a density that would mean one DOM or SVG element per point in the traditional approach.

We're not going to give you a single "N× faster" number, because it isn't a fixed number — path complexity, text, device pixel ratio, how many entities are actually interactive, and the GPU you're running on all move the answer, sometimes by a lot. What we do ship is a **Export report** button on the live demos that measures your actual browser and hardware and gives you real numbers instead of ours.

## An invitation, not just a gallery

The demos above are all we built ourselves — six of them, which is not very many for what the engine can actually do. Node-graph editors in the ComfyUI/Figma style, physics playgrounds, procedural art, anything where "thousands of interactive things, smooth at 60fps" is the actual constraint — that's a much bigger surface than we've had time to fill.

So: **[gallery.vectojs.org](https://gallery.vectojs.org)** is open for submissions. Write one `Entity` subclass, open a PR, get credited with a link to your own profile — [the contributing guide](https://github.com/vectojs/vectojs-gallery/blob/main/CONTRIBUTING.md) has the specifics. Everything here is MIT-licensed: the [core engine](https://github.com/vectojs/vectojs), the [docs site](https://github.com/vectojs/vectojs-website) you're reading this on, and the gallery itself.

## Related reading

- [Rethinking Frontend: The VectoJS Philosophy](/blog/rethinking-frontend/) — the case for abandoning the DOM in the first place.
- [Accessibility](/learn/accessibility/) — the full a11y projection API: roles, labels, focus order, and what you still have to get right yourself.
- [FAQ](/reference/faq/) — including the honest answer to "how many entities can this actually handle."
