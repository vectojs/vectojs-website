---
title: 'a11yRoot & the agent contract'
description: 'How every interactive Entity projects a transparent ARIA shadow node into the DOM — the A11yAttributes shape, the canvas-performance-and-DOM-grade-accessibility contract, and the sync gotchas that cause stale or missing shadow nodes.'
order: 10
---

# a11yRoot & the agent contract

Part of [`@vectojs/core`](/reference/core-api/).

Every interactive entity that has a box projects a **transparent ARIA shadow
node** into the Scene's `a11yRoot` div (above the canvas, `pointerEvents:auto` so
automation/AT can interact; `opacity:0` unless `debugA11y`). Each node carries
`id` + `data-vecto-id`, plus the role/label/state from
[`Entity.getA11yAttributes()`](/reference/core-entity/#a11y--batching-hooks-override-to-opt-in).

The projection root tracks the canvas CSS box: canvas offset and non-uniform CSS
scaling are applied to the shadow and DOM-portal layers while entity geometry
remains in logical Scene coordinates. Arbitrary CSS rotation/skew of the canvas
is not part of this mapping.

`A11yAttributes`:

```ts
{
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea';   // default 'div'
  role?, label?, tabIndex?, href?, src?, alt?, inputType?, placeholder?, value?,
  checked?, disabled?, expanded?, controls?, haspopup?, selected?,
  activedescendant?, valuemin?, valuemax?
}
```

The sync applies these to a real element (a true `<button>`, `<a href>`, `<img>`,
`<input>`/`<textarea>` with IME-aware `change`/`focus`/`blur`, etc.), with dirty
checking to minimize DOM writes. Non-natively-focusable interactive roles
(`button`, `switch`, `checkbox`, `link`, `slider`, …) get `tabindex="0"` and
Enter/Space → `click`. This is the "**canvas performance AND DOM-grade
accessibility**" story: visuals are 100% GPU/canvas, yet a Playwright/agent
`getByRole('button', { name })` resolves the shadow node and clicks it.

Set `tabIndex: 0` explicitly when a non-control region such as a design canvas
must enter sequential focus order and receive VMT `keydown` events. Use `-1`
for programmatic focus only; returning `undefined` removes the explicit value.

## Controls & gotchas

- `data-vecto-id` on each shadow node mirrors the entity `id` — the stable handle
  for automation selectors.
- `a11ySyncInterval` (see [`SceneOptions`](/reference/core-scene/#sceneoptions))
  throttles sync during animation and ensures a final catch-up after pending
  motion settles; it does not suspend all sync for the full animation.
- `debugA11y: true` shows the nodes (blue dashed) for development.
- `detachA11y(entity)` prunes a subtree's shadow nodes without removing the
  entity; `remove()` prunes automatically. Per-frame sync **creates/updates but
  never prunes**, so manage churn of interactive children explicitly.
- `getA11yTree()` returns a nested `A11yTreeNode[]` snapshot for assertions;
  `getA11yElement(id)` fetches a specific shadow element.
- `a11yFullViewport` mounts a boundless interaction surface behind all others.
- Since Core 1.11.1, newly projected interactive entities receive their
  canvas paint-order `z-index` during the same frame that creates the shadow
  node. A fresh overlay backdrop therefore sits above older design controls on
  its first pointer interaction instead of waiting for another render pass.

See [Accessibility](/learn/accessibility/) for usage and testing patterns.

## Related

[`Scene`](/reference/core-scene/) (`a11ySyncInterval`, `debugA11y`) ·
[`Entity`](/reference/core-entity/) (`getA11yAttributes()`, `interactive`, `width`/`height`) ·
[`@vectojs/core` overview](/reference/core-api/)
