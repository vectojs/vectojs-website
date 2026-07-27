---
title: 'UI: CodeBlock'
description: 'Single-leaf canvas code block used by Markdown for fenced code.'
order: 40
---

# `CodeBlock`

`CodeBlock` is the low-level fenced-code renderer used by `Markdown`. Both live in the standalone
**`@vectojs/markdown`** package (moved out of `@vectojs/ui` in `@vectojs/ui@2.0.0`). It draws the
background and syntax-colored text itself, avoiding one child entity per token.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · CodeBlock</span></div>
  <iframe src="/sandbox/ui/component.html?name=codeblock&v=core-1.18.0-ui-2.3.2" class="sandbox-frame component-demo-frame-tall" loading="eager" title="CodeBlock live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Use this directly only for custom renderers; normal docs should go through `Markdown`.</figcaption>
</figure>

## Minimal example

````ts
import { CodeBlock, Markdown } from '@vectojs/markdown';

// Most callers should let Markdown create CodeBlock instances:
const md = new Markdown('```ts\nscene.markDirty();\n```', { maxWidth: 520 });

// Custom Markdown subclasses can return CodeBlock for app-specific fenced blocks.
````

Fenced blocks project their exact source as individually positioned visual rows
from the same inset and baseline as Canvas. Long source lines therefore do not
silently browser-wrap and drift from copy, find-in-page, or native selection.
Each hard newline belongs to the preceding positioned row, preventing Firefox
from producing a selected fragment at the projection root. The default stack
starts with `ui-monospace`, avoiding desktop Firefox user-font substitution of
code to a proportional serif face while still respecting an explicit custom font.
Markdown propagates its `selectable` setting; direct CodeBlock users can call
`setSelectable(boolean)`.

UI 1.9 uses Core 1.8's retained prepared-content grid for both syntax-colored
Canvas paint and the semantic carrier. Tabs, emoji/ZWJ, wide CJK, Arabic
shaping, mixed-direction runs, and exact CR/LF/CRLF source boundaries therefore
share one plan. Calibration is a cold font-loading pass; steady projection sync
does not read Range geometry or replace cell carriers.

## Maintainer checklist

- Keep fenced code as one leaf entity.
- Use `setCode()` for live updates.
- Keep the content projection synchronized with exact source, font, and line height.
- Reuse one prepared grid for Canvas paint, pointer carets, copy, and find.
- Verify Chromium and Firefox at fractional DPR/zoom, including substituted fonts and transformed blocks.
- Prefer the higher-level `Markdown` component unless you are writing a renderer extension.
