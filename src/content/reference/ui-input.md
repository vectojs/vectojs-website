---
title: 'UI: Input'
description: 'Single-line text input with native editing behavior mirrored onto canvas.'
order: 23
---

# `Input`

`Input` uses a real transparent `<input>` for editing while painting the visible field on canvas.
IME, clipboard, selection, and automation stay native.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Input</span></div>
  <iframe src="/sandbox/ui/component.html?name=input&v=core-1.9.0-ui-1.9.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Input live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Fill the textbox through keyboard input or role-based automation.</figcaption>
</figure>

## Minimal example

```ts
import { Input } from '@vectojs/ui';

const name = new Input({
  width: 320,
  placeholder: 'Project name',
  onChange: (value) => updateProjectName(value),
});
```

## Maintainer checklist

- Use `Input` instead of custom text-entry entities.
- Keep the placeholder meaningful; it is also the default accessible label.
- Preserve selection intentionally when implementing controlled updates.
