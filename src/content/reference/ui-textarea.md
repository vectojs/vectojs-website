---
title: 'UI: TextArea'
description: 'Multi-line native text editing with canvas rendering.'
order: 33
---

# `TextArea`

`TextArea` mirrors a native `<textarea>` into canvas, preserving browser editing behavior.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · TextArea</span></div>
  <iframe src="/sandbox/ui/component.html?name=textarea&v=ui-bundle-2" class="sandbox-frame component-demo-frame-tall" loading="eager" title="TextArea live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Multi-line editing is native; canvas paints the visual mirror.</figcaption>
</figure>

## Minimal example

```ts
import { TextArea } from '@vectojs/ui';

const notes = new TextArea({
  width: 420,
  height: 140,
  placeholder: 'Write a note…',
  onChange: (value) => saveDraft(value),
});
```

## Maintainer checklist

- Use this for real multi-line text entry.
- Keep one text-editing owner; do not fake IME or clipboard in canvas.
- Test with keyboard selection and paste, not only pointer clicks.
- The transparent native textarea inherits the canvas font, line height,
  padding, and `border-box` contract, so click-to-caret and selection rows use
  the same geometry as the visible canvas mirror.
