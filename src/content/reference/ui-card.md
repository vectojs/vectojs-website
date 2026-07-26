---
title: 'UI: Card'
description: 'Rounded canvas panel component with optional role=group semantics.'
order: 20
---

# `Card`

`Card` is the base visual panel used throughout `@vectojs/ui` examples. It is decorative by default;
passing `label` makes it a semantic group.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Card</span></div>
  <iframe src="/sandbox/ui/component.html?name=card&v=core-1.16.3-ui-2.2.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Card live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Cards own the background and border; children are positioned in the card's local space.</figcaption>
</figure>

## Minimal example

```ts
import { Card, Text } from '@vectojs/ui';

const card = new Card({
  width: 320,
  height: 180,
  radius: 18,
  border: 'rgba(148,163,184,0.2)',
  label: 'Settings panel',
});

card.add(new Text('Settings').setPosition(24, 24));
scene.add(card);
```

## Whole-card click targets

Pass `onClick` to make the entire card pressable — no more stacking a
transparent `Button` over a `Card` to make it clickable, which used to
pollute the a11y projection with an empty-label button and produce
`overlap` noise in scene audits. `onClick` requires `label`: an
interactive region without an accessible name would recreate the same
problem one level up, so `Card` throws instead of silently accepting it.

```ts
const card = new Card({
  width: 320,
  height: 96,
  label: 'Open settings',
  onClick: () => openSettingsPanel(),
});
```

## Sizing hosted content (`setContent`)

`Card.setContent(content, fit?)` places a single content entity inside the
card and, by default, keeps its `width`/`height` synced to the card's own
box — the same `fitContent` contract `Panel.setContent` uses (see
[`ResizablePanel`](/reference/ui-resizable-panel/)). `fit` defaults to `true`
(both axes tracked); pass `false`, or `{ width, height }` per axis, to fall
back to the old position-only behavior.

```ts
const card = new Card({ width: 320, height: 180 });
card.setContent(new SomeContentEntity()); // sized to 320×180, re-synced on card.width/height changes
```

This is separate from plain `add()`: use `add()` for manually-positioned
decorations (icons, labels) that should keep their own author-given size
regardless of card resizes; use `setContent()` for the one entity that
should always fill the card.

Pass `fit: false` for self-sizing content — an entity whose own
`width`/`height` are derived from its content (e.g. a bare `Text` with no
`maxWidth`) rather than author-set. The default `fit: true` would overwrite
that entity's self-computed box every frame; wrap it in a `Stack`/`Flow`
first if you want it centered/filled inside the card, or size it yourself
with `fit: false`. See [Resizable panels](/reference/ui-resizable-panel/)
for the full explanation — the same `fitContent` contract, same caveat.

## Maintainer checklist

- Use `label` only when the region should be discoverable.
- Do not assume `padding` auto-layouts children.
- Prefer `Stack` or `Flow` inside a card for maintainable layout.
- Prefer `onClick` over stacking an overlay `Button` for whole-card click
  targets.
- Prefer `setContent()` over `add()` + manual size sync for a single entity
  that should fill the card.
