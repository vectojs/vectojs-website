---
title: 'UI: Flow'
description: 'Horizontal wrapping layout container for chips, tags, and responsive toolbars.'
order: 22
---

# `Flow`

`Flow` is a `Stack` preconfigured for horizontal wrapping.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Flow</span></div>
  <iframe src="/sandbox/ui/component.html?name=flow&v=core-1.32.2-ui-2.13.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Flow live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Use `maxWidth` to define where children wrap to the next line.</figcaption>
</figure>

## Minimal example

```ts
import { Button, Flow } from '@vectojs/ui';

const chips = new Flow({ gap: 8, maxWidth: 360 });
for (const label of ['Canvas', 'WebGL', 'WebGPU']) {
  chips.add(new Button(label, { padding: 8 }));
}
```

## Maintainer checklist

- Re-run `layout()` after child size changes.
- Keep chip touch targets large enough for mobile.
- Prefer `Flow` over manual x/y placement for tag rows.
