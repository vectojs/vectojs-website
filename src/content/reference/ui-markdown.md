---
title: 'Markdown'
description: 'Canvas-native Markdown renderer with rich text, code blocks, tables, frame-coalesced StreamController, and link callbacks — the standalone @vectojs/markdown package.'
order: 14
---

# `Markdown` — `@vectojs/markdown`

`Markdown` and `CodeBlock` live in the standalone **`@vectojs/markdown`** package
(as of `@vectojs/ui@2.0.0` they are no longer part of `@vectojs/ui`, so the
`marked` + MathJax dependencies only load when you render Markdown). It composes
`@vectojs/ui` components, so install it alongside `@vectojs/ui` and `@vectojs/core`:
`bun add @vectojs/markdown @vectojs/ui @vectojs/core`.

`Markdown` parses Markdown with `marked` and renders the result into a VectoJS entity subtree.
Paragraphs and headings become `RichText`, fenced code becomes `CodeBlock`, and GFM tables become
`Table`.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Markdown</span></div>
  <iframe src="/sandbox/ui/markdown.html?v=core-1.18.0-ui-2.3.2" class="sandbox-frame component-demo-frame component-demo-frame-xl" loading="eager" title="Markdown live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>The sample keeps prose, links, inline code and a fenced block in one focused viewport so layout defects are visible.</figcaption>
</figure>

## Minimal example

```ts
import { Markdown } from '@vectojs/markdown';

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
still own layout and pixels. Ordered and unordered list items use selectable
`RichText`; every GFM table cell owns one selectable projection. Logical source
order and hard/soft separators remain intact through nested Markdown output.
Core 1.8 routes transformed prose through two-dimensional caret geometry and
fenced code through the shared prepared grid, so lists, GFM tables, wrapped
Arabic/RTL text, and code retain logical copy order at fractional DPR and zoom.
When an application owns container sizing or CSS zoom, notify the Scene with
`scene.resize(width, height)` so Firefox can recalibrate native Range metrics.

## Streaming

`createStream()` binds one frame-coalesced writer to this `Markdown`. Await
`write()` while consuming the source; `close()` force-commits the tail without
waiting for another animation frame:

```ts
const stream = markdown.createStream();

try {
  for await (const token of llmStream) {
    await stream.write(token);
  }
  await stream.close();
} catch (error) {
  stream.abort(error);
  throw error;
}
```

```ts
interface StreamControllerOptions {
  maxBufferedChars?: number; // default 64 * 1024 UTF-16 code units
  pacing?: {
    graphemesPerSecond: number;
  };
  signal?: AbortSignal;
}

type StreamControllerState = 'open' | 'closed' | 'aborted';

interface StreamController {
  readonly state: StreamControllerState;
  readonly bufferedChars: number; // accepted + one blocked write
  write(chunk: string): Promise<void>;
  flush(): void;
  close(): Promise<void>;
  abort(reason?: unknown): void;
  destroy(): void;
}
```

Default mode batches all chunks accepted before the next rAF into one
parse/layout commit. `write()` resolves on bounded-buffer admission, not
visibility. When capacity is insufficient, one write waits; another write while
that waiter exists rejects, so a producer that ignores backpressure cannot grow
an unbounded queue.

`pacing.graphemesPerSecond` adds fixed wall-clock typewriter pacing while
retaining the one-commit-per-frame ceiling. `Intl.Segmenter` keeps ordinary
combining sequences, emoji ZWJ clusters, flags, and surrogate pairs together
across chunk/frame boundaries. The full lifecycle, bounded pathological-cluster
fallback, bottom-follow pattern, and transcript strategy are in
[Streaming & Real-Time Text](/learn/streaming/).

Only one controller may be open for a `Markdown`. `setContent()` aborts it before
replacement; `destroy()` aborts it and removes rAF/`AbortSignal` listeners.
Terminal controllers unregister. Public `appendMarkdown()` remains synchronous:
it first flushes every previously submitted controller chunk, then applies the
direct chunk in exact call order.

Avoid calling `setContent(fullDocumentSoFar)` for every token; that rebuilds the
whole subtree.

## Performance model

What each call actually costs, so streaming code can be reasoned about:

- **Parsing is off-thread by default.** `appendMarkdown` posts the accumulated
  source to a `Worker` built from an embedded bundle (no network request); the
  token diff and entity updates apply when the parse returns. Environments
  without `Worker` (some test runners, SSR) fall back to synchronous lexing —
  same result, main-thread cost.
- **Lexing is O(document) per append**, not O(chunk): the whole accumulated
  source is re-tokenized each call. Use `createStream()` to batch per frame and
  segment long transcripts into one `Markdown` entity per message so the live
  document stays small.
- **Finished blocks are reused, not rebuilt.** `appendMarkdown` prefix-matches
  the new token list against the old one by raw source; every already-rendered
  block keeps its entity instance. The common streaming case — the last
  paragraph grew — updates that paragraph's spans in place.
- **`setContent()` reuses nothing.** It removes every child and re-renders the
  full token list. It is the correct call for _replacing_ a document, and the
  wrong call for growing one.

## Extension point

`renderToken(token)` is protected, so custom renderers can subclass `Markdown` for app-specific
blocks while still delegating normal tokens to the built-in renderer.

## Maintainer checklist

- Link callbacks must be forwarded to paragraph, heading and list `RichText` nodes.
- Code blocks should stay a single leaf entity, not one entity per token or line segment.
- Fenced code must project its exact source text and line breaks.
- Table headers use heading color/bold style, while each logical cell owns exactly one content projection.
- Pointer ownership stays with the leaf text/code projection; structural list and table entities must not intercept native selection.
- StreamController commits and direct appends must reuse unchanged prefix entities.

Related: [`RichText`](/reference/ui-components/#richtext), [`CodeBlock`](/reference/ui-components/#codeblock), [`Table`](/reference/ui-components/#table).
