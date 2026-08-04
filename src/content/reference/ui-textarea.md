---
title: 'UI: TextArea'
description: 'Multi-line native text editing with canvas rendering.'
order: 24
---

# `TextArea`

`TextArea` mirrors a native `<textarea>` into canvas, preserving browser editing behavior.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · TextArea</span></div>
  <iframe src="/sandbox/ui/component.html?name=textarea&v=core-1.31.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="TextArea live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## IME composition

While an IME composition is active the component draws an underline under the
composing range. The **selection highlight is suppressed** for the duration:
composing over selected text logically replaces that range, but the native
element keeps reporting the pre-composition `selectionStart`/`selectionEnd` until
the composition commits — painting it would show a stale highlight behind (and
wider than) the composition underline. A zero-length composition (the initial
`compositionstart`) still shows the selection, since nothing has replaced it yet.

## Maintainer checklist

- Use this for real multi-line text entry.
- Keep one text-editing owner; do not fake IME or clipboard in canvas.
- Test with keyboard selection and paste, not only pointer clicks.
- The transparent native textarea inherits the canvas font, line height,
  padding, and `border-box` contract, so click-to-caret and selection rows use
  the same geometry as the visible canvas mirror.

## Scrolling

The canvas follows the **native element's** `scrollTop` (2.10.0+). The mirror is
the scroll authority and the browser has already scrolled it, so there is no
wheel handler — adding one would apply the gesture twice.

Before 2.10.0 the canvas scroll position was caret-driven only, updated when
`selectionStart` moved and never by the view. Two defects followed. A wheel
gesture moved the real element while the canvas stayed put, so the text did not
scroll at all. And because `selectionStart` is seeded to `value.length`, a
freshly-mounted TextArea painted the _bottom_ of its content while the native
element sat at the top — measured 32.6 rows of disagreement on a 60-line
document, which put every click's caret on the wrong line.

Caret-follow is retained as a fallback for when no mirror exists. The mirror also
sets `scrollbar-width: none`: a native scrollbar gutter narrows `clientWidth`
below the canvas width, so the two wrap at different points. Measured in Firefox
at 2.9.0, a 516px-wide TextArea had a 12px gutter, so the native element wrapped
at 480px while the canvas wrapped at 492px.
