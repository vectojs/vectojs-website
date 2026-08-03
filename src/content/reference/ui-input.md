---
title: 'UI: Input'
description: 'Single-line text input with native editing behavior mirrored onto canvas.'
order: 23
---

# `Input`

`Input` uses a real transparent `<input>` for editing while painting the visible
field on canvas. IME, clipboard, selection, and automation stay native.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Input</span></div>
  <iframe src="/sandbox/ui/component.html?name=input&v=core-1.28.0-ui-2.10.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Input live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## Validation state (2.3.0+)

`required` and `invalid` reach the accessibility tree, not just the border:

```ts
const email = new Input({ width: 240, placeholder: 'Email', required: true });
email.invalid = !isValidEmail(email.value); // red border + aria-invalid
```

`required` is projected as the **native** `required` attribute on the shadow
`<input>`/`<textarea>`, so it participates in form validation and `:invalid`
styling rather than only describing the constraint. `invalid` becomes
`aria-invalid`.

Clearing `invalid` **removes** the attribute rather than setting `"false"` —
those mean different things, since `aria-invalid="false"` asserts "explicitly
valid".

A red border alone would be invisible to a screen reader and to anyone who
cannot distinguish the colour (WCAG 1.4.1), which is why the state is projected
rather than only drawn. Under forced colors both states defer to system colours.

`TextArea` takes the same two options.

## IME composition

While an IME composition is active the component draws an underline under the
composing range. The **selection highlight is suppressed** for the duration:
composing over selected text logically replaces that range, but the native
element keeps reporting the pre-composition `selectionStart`/`selectionEnd`
until the composition commits — painting it would show a stale highlight behind
(and wider than) the composition underline. A zero-length composition (the
initial `compositionstart`) still shows the selection, since nothing has
replaced it yet.

## Maintainer checklist

- Use `Input` instead of custom text-entry entities.
- Keep the placeholder meaningful; it is also the default accessible label.
- Preserve selection intentionally when implementing controlled updates.
