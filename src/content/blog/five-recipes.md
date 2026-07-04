---
title: 'Five Things People Ask About Building UI in VectoJS'
description: 'A liquid-glass panel, text that survives browser zoom, animation that does not fight the idle throttle, debugging a canvas UI without an element inspector, and refactoring a real page into VectoJS — five concrete recipes.'
date: 2026-07-04
author: Xuepoo
tags: [ui, animation, performance, dx]
---

Once someone gets past "wait, the whole page is one `<canvas>`?", the questions turn practical: how do I build _this specific thing_ I already know how to build in CSS? This post walks through five of the most common ones, with real code against the actual `@vectojs/core` / `@vectojs/ui` APIs — not hypotheticals.

## 1. A liquid-glass panel

Apple's "liquid glass" look is three ingredients: a translucent tint, a soft highlight along one edge, and a blur of whatever sits behind the panel. VectoJS's `IRenderer` gives you the first two directly — fills, gradients, alpha — but it doesn't expose a blur/filter primitive, so the honest answer for the third ingredient is: **borrow the DOM for the one thing it still does better**, and let VectoJS own everything else.

```typescript
import { Entity, IRenderer } from '@vectojs/core';

class GlassPanel extends Entity {
  constructor(
    private w: number,
    private h: number,
  ) {
    super();
    this.width = w;
    this.height = h;
  }

  isPointInside(x: number, y: number): boolean {
    return x >= 0 && x <= this.w && y >= 0 && y <= this.h;
  }

  render(r: IRenderer): void {
    r.save();
    // Tint: a low-alpha fill lets whatever's behind the canvas show through
    // the backdrop-filter blur (below) while still reading as "glass".
    r.roundRect(0, 0, this.w, this.h, 20);
    r.fill('rgba(255, 255, 255, 0.08)');

    // Specular highlight: a gradient along the top edge, not a flat stroke —
    // this is the part that reads as "glass" rather than "translucent box".
    const highlight = r.createLinearGradient(0, 0, 0, this.h * 0.4, [
      { stop: 0, color: 'rgba(255, 255, 255, 0.35)' },
      { stop: 1, color: 'rgba(255, 255, 255, 0)' },
    ]);
    r.roundRect(0, 0, this.w, this.h, 20);
    r.fill(highlight);

    // Edge: a hairline border catches the light at the panel's silhouette.
    r.roundRect(0.5, 0.5, this.w - 1, this.h - 1, 20);
    r.stroke('rgba(255, 255, 255, 0.25)', 1);
    r.restore();
  }
}
```

That's the panel. For the actual blur — of page content, a video, or another layer sitting behind the canvas — apply CSS `backdrop-filter` to the `<canvas>` element (or a wrapper `div`) itself:

```css
#glass-scene {
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
}
```

`backdrop-filter` blurs whatever the compositor sees **behind** the element it's applied to — that's true whether the element is a `<div>` or a `<canvas>`, so this composes cleanly with VectoJS's single-canvas model instead of fighting it. The one thing this trick can't do is blur _other VectoJS content_ sitting behind the panel on the **same** canvas — for that you'd need a real post-process pass through a custom `IRenderer` (the same seam `@vectojs/three`'s `ThreeRenderer` uses), which is a fair amount more machinery than most glass panels need.

## 2. Text that survives zoom and different devices

Two separate problems hide inside "responsive text": **crispness** (does it look right at 1x vs. 3x device pixel ratio?) and **reflow** (does it re-wrap correctly when the viewport changes?). VectoJS's answer to both comes from the same design decision described in [Layout and Typography on Canvas](/blog/layout-and-typography/): measuring is separated from wrapping.

**Crispness** is handled below your code: `CanvasRenderer` applies `devicePixelRatio` scaling on construction, and `scene.resize(width, height)` re-applies it — you always think in logical (CSS) pixels, never in device pixels:

```typescript
window.addEventListener('resize', () => {
  scene.resize(stage.clientWidth, stage.clientHeight); // logical px; DPR handled internally
});
```

Browser zoom changes `devicePixelRatio` and fires a `resize` on most engines, so the same listener that handles a window resize also re-renders crisply at 125%, 150%, or whatever zoom level the visitor picked — you don't special-case zoom at all.

**Reflow** is where the cold/hot split pays off. A naive approach re-measures the whole paragraph on every resize tick, which is exactly the kind of per-frame cost that makes drag-to-resize choppy. `setMaxWidth()` skips re-measurement entirely:

```typescript
const body = new Text(article, { font: '16px Inter', maxWidth: 640, lineHeight: 24 });

function fit(): void {
  body.setMaxWidth(stage.clientWidth - 80); // HOT: re-wrap cached glyphs, no re-measure
}
window.addEventListener('resize', fit);
```

For content whose actual _characters_ change with viewport (a headline that truncates on mobile, say), that's a `setText()` — the cold path — but it only needs to run when the string itself changes, not on every pixel of a resize.

If you need text that stays vector-crisp at extreme zoom (a kiosk display, a diagram someone might zoom to 400%), `MSDFTextEntity` renders glyphs as multi-channel signed-distance fields instead of rasterized bitmaps — see [Text & Typography](/learn/text-typography/) for when that trade-off is worth it over the simpler `Text`/`RichText` path.

## 3. Animation that's actually time-based (and doesn't fight the scene)

VectoJS's 0.2.0 animation system makes the common case a one-liner: declare which properties animate, then assign to them like normal fields.

```typescript
import { Entity } from '@vectojs/core';

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

`setTransition` takes `'spring'` or an explicit `SpringConfig`/`TweenConfig` per property; `animateTo`/`springTo` are the imperative, `await`-able equivalents for one-off sequences. Both honor `prefers-reduced-motion` automatically (movement snaps instead of playing, opacity still fades) — you don't write a media-query branch yourself.

**The gotcha that actually matters in production:** VectoJS throttles a static scene to ~2 fps to save battery (see [Performance → the idle auto-throttle](/learn/performance/)). `setTransition`/`animateTo`/`springTo` are visible to that throttle-escape check automatically. But if you hand-roll continuous motion — mutating a property directly inside your own `update()` override instead of going through the transition system — the scene has no way to know you're still animating:

```typescript
// Looks fine. Throttles to ~2 fps the moment the scene goes idle for any
// other reason, because Scene only stays awake for what hasPendingAnimations()
// reports, and the base Entity implementation only checks the transition
// system + the legacy animate() queue — it has no idea this update() is doing
// anything at all.
class Ticker extends Entity {
  update(dt: number, time: number): void {
    super.update(dt, time);
    this.x = (this.x + dt * 0.1) % 400;
  }
}
```

The fix is a one-line override, and it's worth knowing by name because it comes up any time a component drives its own motion instead of using `setTransition`:

```typescript
class Ticker extends Entity {
  update(dt: number, time: number): void {
    super.update(dt, time);
    this.x = (this.x + dt * 0.1) % 400;
  }

  // Tell the scene "I always have work while I'm running" — restores the
  // throttle-escape the transition system gets for free.
  hasPendingAnimations(): boolean {
    return true; // or a real condition, e.g. `this.items.length > 0`
  }
}
```

This exact bug shipped twice on this site during development — once in a `ScrollView`'s hand-rolled momentum scroll, once in the `/compare` danmaku demo's field entity — both invisible to unit tests (which tick `update()` directly, never through the real Scene loop) and only caught by watching the actual frame rate in a live browser. If a custom entity feels "sticky" or drops frames only sometimes, this is the first thing to check.

## 4. Debugging and fine-tuning styles without an element inspector

There's no "inspect element" for pixels inside a canvas, so the workflow is different, not worse:

- **`debugA11y: true`** — every interactive component projects a real, normally-invisible shadow DOM node for accessibility. Turning on `debugA11y` in `SceneOptions` draws them with a blue dashed outline, which doubles as a free hitbox visualizer during layout work:

  ```typescript
  const scene = new Scene(canvas, { debugA11y: true });
  ```

  If a button's dashed outline doesn't line up with what's painted, you've found a layout bug, not an accessibility bug — the shadow node's box **is** the hit-test box.

- **`scene.toSVG()`** — renders the current frame through the SVG backend instead of canvas, returning flat XML you can save, diff between commits, or open in any vector editor to inspect exact coordinates:

  ```typescript
  const svg = scene.toSVG();
  await navigator.clipboard.writeText(svg); // or download, or diff against last commit
  ```

- **Expose live state on `window` behind a query flag** — the pattern this site's own demos use for their own debugging:

  ```typescript
  if (location.search.includes('debug')) {
    Object.assign(window as any, { __scene: scene, __scroll: scroll });
  }
  ```

  Loading the page as `?debug` then lets you poll real entity state from devtools console or a browser-automation script (`window.__scroll.content.y`) — which is how the animation gotcha in the previous section actually got diagnosed: by sampling a live property over time and watching for jitter, not by eyeballing it.

- **The edit loop itself stays simple.** Components are plain TypeScript classes, not a template DSL, so there's no compiler step between your edit and the page besides Vite/Astro's own reload — you don't fight component-state-preserving HMR the way JSX frameworks sometimes require. Save, reload, look.

## 5. Refactoring a traditional webpage into VectoJS

A big-bang rewrite is rarely the right call — mount a VectoJS `Scene` into one region of an existing page and convert incrementally. Here's a pricing card, before and after:

```html
<!-- Before: HTML/CSS -->
<div class="card">
  <h3>Pro plan</h3>
  <p>$29/month, billed annually</p>
  <button onclick="subscribe()">Subscribe</button>
</div>
```

```css
.card {
  width: 280px;
  padding: 24px;
  border-radius: 16px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
```

```typescript
// After: VectoJS
import { Scene } from '@vectojs/core';
import { Card, Text, Button } from '@vectojs/ui';

const scene = new Scene(document.querySelector('canvas')!);

const card = new Card({ width: 280, height: 160, radius: 16, border: 'rgba(255,255,255,0.08)' });
// Card's `padding` option is informational only — position children yourself.
card.add(new Text('Pro plan', { font: '600 18px Inter' }).setPosition(24, 24));
card.add(new Text('$29/month, billed annually', { font: '14px Inter' }).setPosition(24, 56));
card.add(new Button('Subscribe', { onClick: subscribe }).setPosition(24, 96));

scene.add(card.setPosition(40, 40));
scene.start();
```

The line-by-line translation is mechanical — `div` → `Entity`/`UIComponent` subclass or a stock component, CSS properties → constructor options, `onclick` → `onClick` — but three things change in kind, not just in syntax:

1. **Positioning is explicit, not cascaded.** `Card`'s `padding` doesn't auto-inset children (see the reference above) — you set `x`/`y` yourself, or use a `Stack` inside the card if you want automatic vertical flow instead of manual coordinates.
2. **Accessibility isn't automatic HTML semantics anymore — it's a deliberate opt-in.** `Button` projects a real `role="button"` shadow node for free, but a custom `Entity` subclass needs its own `getA11yAttributes()` override (see [Custom Entities](/learn/custom-entity/)) the way a hand-rolled `<div onclick>` would need an ARIA role in plain HTML too.
3. **The mental model shifts from "styles that get resolved" to "state that gets painted."** There's no cascade to fight and no specificity to reason about — but that also means there's no free inheritance; a font or color set on a parent doesn't propagate to children unless you pass it down yourself.

For the migration itself: keep the VectoJS canvas and the existing DOM page coexisting (a `position: absolute` canvas over one section is enough to start), convert one component at a time, and use `debugA11y` plus a real screen reader pass before removing the DOM version it replaces. [Getting Started](/learn/getting-started/) walks through wiring the canvas into a real app shell (including React/Vue integration) if the rest of the page stays in a component framework.

## Related reading

- [Layout and Typography on Canvas](/blog/layout-and-typography/) — the cold/hot split behind recipe 2.
- [Performance](/learn/performance/) — the full idle-throttle mechanism behind recipe 3.
- [Accessibility](/learn/accessibility/) — `debugA11y`, the shadow-DOM contract, and Playwright integration behind recipe 4.
- [Custom Entities](/learn/custom-entity/) — writing your own `Entity` subclass from scratch, for recipe 5.
- [Getting Started](/learn/getting-started/) — mounting a `Scene` inside an existing app.
