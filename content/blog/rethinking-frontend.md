+++
title = "Rethinking Frontend: The VectoJS Philosophy"
description = "Why VectoJS abandons HTML/CSS in favor of pure JS/TS, object-oriented design, and mathematical rendering."
date = 2026-07-01

[extra]
author = "Xuepoo"
tags = ["philosophy", "architecture"]
+++

If you are a backend developer (e.g., coming from Java, Go, or C++) or a newcomer to the web, your first encounter with frontend development was likely a frustrating experience. You are used to strict logic, object-oriented paradigms, and deterministic control flows. Instead, the traditional web greets you with:

- Hundreds of HTML tags with implicit browser behaviors.
- The cascading chaos of CSS (specificity wars, `z-index` battles, and float collapses).
- A disjointed developer experience where logic (JS), structure (HTML), and styling (CSS) are split across different files and paradigms.

**VectoJS was born from a fundamental question:** _What if we threw away the DOM and CSS entirely, and handed the UI back to pure programming?_

## The TailwindCSS Evolution (and its Limits)

Over the years, the frontend community realized that separating HTML and CSS was a mistake. Frameworks like **TailwindCSS** became revolutionary by introducing "Utility-First CSS".

Tailwind solves the CSS global scope nightmare by forcing **Locality of Behavior**. You write `<div class="flex items-center p-4 bg-red-500">`, and you instantly know what the element looks like without checking a separate stylesheet.

However, Tailwind is still bound by the limitations of the DOM:

1. **Visual Noise:** To build a complex component, your HTML class strings become monstrously long and unreadable, essentially creating a new "CSS syntax" you must memorize.
2. **The Animation Dead-End:** Tailwind is excellent for static layouts, but it falls apart when you need complex, interruptible, math-driven animations (like spring physics, gravity, or cursor-following trails). You inevitably have to fall back to custom CSS or messy JS DOM manipulation.
3. **Rigid Systems:** You are locked into the framework's design tokens unless you use awkward arbitrary values like `w-[17px]`.

## The VectoJS Paradigm: True Object-Oriented UI

If TailwindCSS realized that _Structure and Style_ belong together, VectoJS takes the final logical leap: **Structure, Style, and Logic belong together in a single Class.**

By rendering everything directly to a `<canvas>` using the **Virtual Math Tree (VMT)**, VectoJS completely bypasses the browser's layout engine.

### 1. Zero HTML/CSS Memorization

You no longer need to memorize arbitrary CSS properties or HTML quirks. In VectoJS, you only need one `<canvas>` tag. Everything else is written in TypeScript.

Drawing a rounded rectangle isn't about guessing the right CSS class; it is calling a highly intuitive API:

```typescript
r.beginPath();
r.roundRect(x, y, w, h, radius);
r.fill('#dc2626');
```

This is pure, predictable programming.

### 2. The Power of OOP (Object-Oriented Programming)

Because every UI component in VectoJS is a pure TypeScript `Class`, you unlock the full power of software engineering patterns:

- **Inheritance:** Want a DangerButton? `class DangerButton extends Button` and just override the `draw()` method to make it red. No CSS overrides or specificity wars.
- **Polymorphism:** The VectoJS engine simply loops through an array of `Entity` objects and calls `.update()` and `.render()` on them. The engine doesn't care if it's a simple text label or a massive particle system.
- **Encapsulation:** Coordinates, hitboxes, and state are perfectly isolated inside your class instances. No global CSS variables can accidentally break your layout.

### 3. Animations via the Game Loop

Traditional DOM manipulation (even with JS) suffers from "Layout Thrashing"—reading and writing DOM properties forces the browser to recalculate the entire page, killing performance.

In VectoJS, animations follow a Game Engine paradigm. Declare which properties animate, then assign to them like normal fields — no manual per-frame math required for the common case:

```typescript
class Toast extends Entity {
  constructor() {
    super();
    this.opacity = 0;
    this.setTransition({ y: 'spring', opacity: { duration: 200 } });
  }

  show(): void {
    this.y = 24; // retargets the spring — in-flight motion blends, doesn't reset
    this.opacity = 1; // 200ms tween
  }
}
```

For anything that needs true per-frame control, every entity still has an `update(dt, time)` hook, ticked every frame with the elapsed milliseconds and the running clock.

This keeps application motion in the same explicit update loop as rendering. Capacity depends on per-entity update/draw cost, backend, visible percentage, DPR, browser, and hardware; measure the target workload rather than inferring a count from the architecture.

## Conclusion

VectoJS is not just a rendering library; it is a paradigm shift. It empowers developers to stop fighting the DOM and CSS, and start focusing on what truly matters: **TypeScript logic, mathematics, and data structures.**

By treating the UI as a mathematical canvas rather than a document, we bring the joy, performance, and deterministic control of true software engineering to the web.

## Related reading

- [Beyond JSX and Templates](/blog/beyond-jsx/) — the pure-TypeScript developer experience that follows from dropping markup.
- [Layout and Typography on Canvas](/blog/layout-and-typography/) — how the same philosophy fixes reflow, layout shift, and text rendering.
- [Introduction to VectoJS](/learn/introduction/) — the architecture, hands-on.
