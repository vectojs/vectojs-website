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
  <iframe src="/sandbox/ui/component.html?name=card&v=core-1.9.2-ui-1.9.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Card live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## Maintainer checklist

- Use `label` only when the region should be discoverable.
- Do not assume `padding` auto-layouts children.
- Prefer `Stack` or `Flow` inside a card for maintainable layout.
