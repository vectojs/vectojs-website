+++
title = "UI: Link"
description = "Standalone canvas-rendered link with a semantic anchor projection."
weight = 18
+++

# `Link`

`Link` is for standalone navigation text. For inline links inside prose, use `RichText` or
`Markdown`.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Link</span></div>
  <iframe src="/sandbox/ui/component.html?name=link&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Link live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>The visible text is canvas; automation and assistive tech see a real anchor.</figcaption>
</figure>

## Minimal example

```ts
import { Link } from '@vectojs/ui';

scene.add(
  new Link('Open docs ↗', {
    href: 'https://vectojs.org',
  }).setPosition(24, 24),
);
```

## Maintainer checklist

- Sanitize URLs before opening or projecting `href`.
- Keep the visible label and accessible name aligned.
- Prefer `RichText` for links embedded inside a paragraph.
