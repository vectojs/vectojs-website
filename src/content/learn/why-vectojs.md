---
title: 'Why VectoJS'
description: 'The problem VectoJS solves, how it differs from DOM and canvas libraries, and when not to use it.'
order: 2
---

# Why VectoJS

The browser DOM is a strong general-purpose document renderer. It is excellent for flowing text, SEO content, native forms, and moderate interactive UI.

It becomes a bottleneck when the interface behaves more like a scene than a document.

## The problem

VectoJS targets interfaces where:

- thousands of individually animated items would create excessive DOM/style/layout work;
- layout is controlled by math, not by CSS flow;
- hit-testing must match custom transforms, curves, and coordinate systems;
- the same UI needs to run inside canvas, WebGL, export, or WebXR contexts;
- accessibility and automation still matter even though the visible UI is canvas-rendered.

```mermaid
flowchart TD
  Question{Is the UI mostly document content?}
  Question -- Yes --> DOM[Use HTML and CSS]
  Question -- No --> Count{Many visual entities or custom math?}
  Count -- No --> DOM2[Use normal app UI]
  Count -- Yes --> Semantics{Need real accessibility and automation?}
  Semantics -- No --> Canvas[Canvas library may be enough]
  Semantics -- Yes --> Vecto[VectoJS fits]
```

## How it differs from typical canvas libraries

Most canvas libraries provide drawing primitives and leave layout, events, text, and accessibility to the application. VectoJS provides a fuller runtime stack.

| Layer         | VectoJS                                           | Typical canvas library |
| ------------- | ------------------------------------------------- | ---------------------- |
| Layout        | Entity tree and layout helpers                    | Manual                 |
| Hit-testing   | Per-entity hit tests and transform conversion     | Manual                 |
| Events        | DOM-like capture and bubble phases                | Manual/callback-only   |
| Accessibility | Semantic DOM projection for eligible entities     | Usually absent         |
| Text          | Layout engine, wrapping, BiDi, Arabic, MSDF paths | Often `fillText` only  |
| Components    | Forms, overlays, markdown, scroll, layout         | Usually app-defined    |
| Export        | Fixed-step video exporter                         | Usually external       |

## What VectoJS trades away

VectoJS trades CSS convenience for explicit control. You own more of the layout and interaction model:

- CSS does not position individual canvas entities.
- Native text selection for arbitrary rendered text is not automatic.
- SEO crawlers do not see canvas-rendered content as page text.
- Accessibility is enabled by projection, but still requires correct labels, roles, keyboard behavior, contrast, and assistive-technology testing.
- Entity traversal, update, semantic sync, and app compute still cost CPU; canvas does not make all work free.

## When not to use VectoJS

Do not reach for VectoJS first when:

- you are building a blog, marketing page, docs site, or CMS page;
- the UI is mostly ordinary forms and tables;
- SEO visibility of rendered content is a hard requirement;
- native browser text selection is central to the product;
- there is no custom layout math, animation density, graph, game, simulation, or high-entity scene.

VectoJS shines when you need **canvas-level visual control** with enough runtime infrastructure to avoid rebuilding layout, events, text, accessibility, and export yourself.

## Next steps

- [Runtime Architecture](/learn/runtime-architecture/) explains the moving parts.
- [Use Cases](/learn/use-cases/) maps the tradeoffs to real product categories.
