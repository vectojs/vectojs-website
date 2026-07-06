---
title: 'Introduction to VectoJS'
description: 'A concise overview of what VectoJS is, what it is for, and where to go next.'
order: 1
---

# Introduction to VectoJS

**VectoJS** is a canvas-native UI runtime for interfaces whose visual or interactive complexity does not fit the “one DOM element per thing” model. It keeps the visible tree in a JavaScript entity graph — the **Virtual Math Tree** — and paints the result to canvas-backed layers.

Interactive components can still project real semantic DOM nodes (`<button>`, `<input>`, `<a>`, etc.) over the canvas. That projection is what keeps VectoJS controls accessible, native-input capable, and testable through role-based automation.

<figure>
  <img src="/images/intro-runtime-map.svg" alt="VectoJS runtime map showing application state flowing into the Virtual Math Tree, then into layout, hit testing, canvas or GPU rendering, and semantic DOM projection." class="diagram" />
  <figcaption>Application state updates one retained scene graph; the graph then drives pixels, layout, events, and semantics.</figcaption>
</figure>

## What you should read next

The old single-page introduction has been split into focused chapters:

| If you want to understand…                                         | Read                                                 |
| ------------------------------------------------------------------ | ---------------------------------------------------- |
| Why VectoJS exists and when the DOM becomes the wrong tool         | [Why VectoJS](/learn/why-vectojs/)                   |
| How the runtime, render loop, and semantic projection fit together | [Runtime Architecture](/learn/runtime-architecture/) |
| The eight core math/engine ideas behind the implementation         | [Engine Concepts](/learn/engine-concepts/)           |
| Which product categories are a good fit, and which are not         | [Use Cases](/learn/use-cases/)                       |
| How to build the first running scene                               | [Getting Started](/learn/getting-started/)           |

## The short version

Use VectoJS when you need:

- thousands of visual entities without thousands of styled DOM nodes;
- precise transforms, curves, hit-testing, and mathematical layout;
- canvas-scale visuals with role-based accessibility and automation;
- high-volume data, streaming UI, games, diagrams, or WebXR panels;
- deterministic stepping for tests, simulation, and video export.

Prefer regular HTML/CSS when you are building a document-first site, SEO-heavy prose, ordinary forms, or UI that does not need custom layout math.

## Package map

| Package                   | Purpose                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `@vectojs/core`           | `Scene`, `Entity`, layout, text, renderers, events, a11y projection, and math utilities                     |
| `@vectojs/ui`             | High-level components: `Button`, `Input`, `Toggle`, `Markdown`, `ScrollView`, `Dropdown`, `Table`, and more |
| `@vectojs/three`          | Project a VectoJS scene onto a Three.js texture and route raycast input back to 2D                          |
| `@vectojs/video-exporter` | Fixed-step Chromium + FFmpeg H.264 export for VectoJS scenes                                                |

## Mental model

VectoJS is not a React replacement, not an ECS, and not a claim of zero allocation. It is a retained-mode canvas UI runtime:

1. application state updates entities;
2. entities compute layout, transforms, hit tests, and semantics;
3. dirty scenes render through the selected backend;
4. projected DOM nodes expose the interactive surface to assistive tech and agents.

The rest of this guide walks through those tradeoffs in detail.

## Next steps

- [Why VectoJS](/learn/why-vectojs/) — the problem space and tradeoffs.
- [Getting Started](/learn/getting-started/) — install and create your first scene.
- [Core Scene](/learn/core-scene/) — the render loop, entities, and transforms in depth.
