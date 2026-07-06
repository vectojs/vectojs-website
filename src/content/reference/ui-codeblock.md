---
title: 'UI: CodeBlock'
description: 'Single-leaf canvas code block used by Markdown for fenced code.'
order: 49
---

# `CodeBlock`

`CodeBlock` is the low-level fenced-code renderer used by `Markdown`. It draws the background and
syntax-colored text itself, avoiding one child entity per token.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · CodeBlock</span></div>
  <iframe src="/sandbox/ui/component.html?name=codeblock" class="sandbox-frame component-demo-frame-tall" loading="eager" title="CodeBlock live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Use this directly only for custom renderers; normal docs should go through `Markdown`.</figcaption>
</figure>

## Minimal example

````ts
import { CodeBlock, Markdown } from '@vectojs/ui';

// Most callers should let Markdown create CodeBlock instances:
const md = new Markdown('```ts\nscene.markDirty();\n```', { maxWidth: 520 });

// Custom Markdown subclasses can return CodeBlock for app-specific fenced blocks.
````

## Maintainer checklist

- Keep fenced code as one leaf entity.
- Use `setCode()` for live updates.
- Prefer the higher-level `Markdown` component unless you are writing a renderer extension.
