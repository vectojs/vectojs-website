---
title: 'Markdown'
description: 'Canvas-native Markdown renderer with rich text, code blocks, tables, streaming append, and link callbacks.'
order: 23
---

# `Markdown`

`Markdown` parses Markdown with `marked` and renders the result into a VectoJS entity subtree.
Paragraphs and headings become `RichText`, fenced code becomes `CodeBlock`, and GFM tables become
`Table`.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Markdown</span></div>
  <iframe src="/sandbox/ui/markdown.html?v=ui-bundle-2" class="sandbox-frame component-demo-frame component-demo-frame-xl" loading="eager" title="Markdown live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>The sample keeps prose, links, inline code and a fenced block in one focused viewport so layout defects are visible.</figcaption>
</figure>

## Minimal example

```ts
import { Markdown } from '@vectojs/ui';

const md = new Markdown(source, {
  maxWidth: 640,
  selectable: true,
  onLinkClick(href) {
    router.open(href);
  },
});

scene.add(md.setPosition(24, 24));
```

## Constructor

```ts
new Markdown(markdownText: string, opts?: MarkdownOptions)

interface MarkdownOptions {
  maxWidth?: number;
  theme?: MarkdownTheme;
  onLinkClick?: (href: string) => void;
  selectable?: boolean; // default true
}
```

`selectable` propagates to current and future headings, prose, lists, fenced
code, and table cells. Change it at runtime with `markdown.setSelectable(false)`.
The browser owns drag selection, Ctrl/Command+C, and find-in-page; VMT entities
still own layout and pixels.

## Streaming

For token streams, append only the new delta:

```ts
for await (const token of llmStream) {
  markdown.appendMarkdown(token);
  scrollView.scrollToBottom();
}
```

Avoid calling `setContent(fullDocumentSoFar)` for every token; that rebuilds the whole subtree.

## Extension point

`renderToken(token)` is protected, so custom renderers can subclass `Markdown` for app-specific
blocks while still delegating normal tokens to the built-in renderer.

## Maintainer checklist

- Link callbacks must be forwarded to paragraph, heading and list `RichText` nodes.
- Code blocks should stay a single leaf entity, not one entity per token or line segment.
- Fenced code must project its exact source text and line breaks.
- Table headers use heading color/bold style, while each logical cell owns exactly one content projection.
- Streaming append should reuse unchanged prefix entities.

Related: [`RichText`](/reference/ui-components/#richtext), [`CodeBlock`](/reference/ui-components/#codeblock), [`Table`](/reference/ui-components/#table).
