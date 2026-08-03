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
  <iframe src="/sandbox/ui/markdown.html?v=core-1.29.0-ui-2.11.0" class="sandbox-frame component-demo-frame component-demo-frame-xl" loading="eager" title="Markdown live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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
  userTiming?: boolean; // emit a `vecto:markdown:parse` measure, default false
}
```

## GFM coverage

Beyond paragraphs, headings, lists, fenced code and tables:

| Construct           | Renders as                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `~~strikethrough~~` | A struck run — one stroke per coalesced run, weight scaled to size (`0.8.0+`)                  |
| `- [ ]` / `- [x]`   | A ☐ or ☑ glyph plus a space, replacing the bullet; `1.` then the glyph when ordered (`0.8.0+`) |
| `\|:--\|--:\|:-:\|` | Column alignment, forwarded to `Table.align` (`0.8.0+`)                                        |
| `$…$` / ` ```math ` | MathJax-typeset formula (inline / block), converted only once the delimiter closes             |

## Front matter

A leading `---`-delimited YAML block is metadata, not content (`0.8.0+`):

```ts
const md = new Markdown('---\ntitle: Release notes\ndate: 2026-08-03\n---\n# Body');

md.frontMatter; // 'title: Release notes\ndate: 2026-08-03\n'
md.frontMatterFields; // { title: 'Release notes', date: '2026-08-03' }
```

Before `0.8.0` the block rendered as content: `marked` has no notion of front
matter, so the opening `---` hit the thematic-break rule and the closing one
**underlined the keys as a setext heading**. A document with metadata therefore
painted a horizontal rule plus a 28px bold heading made of its own keys.

`frontMatterFields` is a narrow convenience, not YAML — indented lines are
skipped, so nested mappings and sequences never leak out as top-level keys (the
parent key is present with an empty value). For anything richer, hand
`md.frontMatter` to a real parser. Both `scanFrontMatter(text, complete)` and
`parseFrontMatterFields(raw)` are exported for use on raw text.

Recognition is deliberately conservative, because a false positive silently
deletes the top of a document. A leading `---` is front matter only when the next
line is a YAML mapping entry — `key: value`, with whitespace after the colon as
YAML requires — **and** a closing `---` or `...` follows. So `---\n\n# Title`,
`---\n# Title\n---`, `----\nkey: v\n----` and `---\n- a\n---` all keep rendering a
thematic break.

While streaming, a chunk landing inside an unclosed block is held rather than
lexed, so the document does not paint a rule that the closing delimiter then has
to tear down. A block still open when the stream closes is released as content,
and the hold is bounded, so a thematic break at the top of a long document cannot
stall it.

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
  incompleteMode?: IncompleteMarkdownMode; // default 'literal'
  onStable?: (blocks: readonly Entity[]) => void;
}

type IncompleteMarkdownMode = 'literal' | 'optimistic';

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

### Trailing unclosed syntax: `incompleteMode`

A stream is cut mid-token constantly, so the last few characters of a chunk are
routinely half a construct. `incompleteMode` picks how that tail renders while
the controller is open:

| Mode                    | While streaming `a **bo`                        |
| ----------------------- | ----------------------------------------------- |
| `'literal'` _(default)_ | text `a **bo` — the asterisks are ordinary text |
| `'optimistic'`          | text `a bo`, with `bo` bold — syntax hidden     |

`'optimistic'` guesses that the trailing paragraph's last unclosed
strong/emphasis/inline-code/link construct will close. The guess is
**display-only** — token state is never mutated — and it is unwound on
`close()`, so a `'literal'` and an `'optimistic'` stream of the same source end
at a byte-identical document. `'literal'` is what every release before this
option shipped.

The mode is interpreted by `Markdown`, not by the controller: the controller
owns buffering and pacing, while the guess is a render-time transform over the
trailing paragraph.

### One-shot completion: `onStable`

```ts
const stream = markdown.createStream({
  onStable: (blocks) => {
    // Runs once, with the finished document. Safe place for work that would be
    // wasted mid-stream.
    console.log(`settled with ${blocks.length} top-level blocks`);
  },
});
```

Fires **exactly once**, after `close()` has committed the final text _and_ any
in-flight worker parse has been applied, with a snapshot of the document's
top-level block entities at that instant. Independent of `incompleteMode`, so it
works with the `'literal'` default.

It is deliberately not a general "stream progressed" hook:

- **Never fired by `flush()`, `abort()`, or `destroy()`.** None of those
  mean the content finished changing.
- Calling `appendMarkdown()` or `setContent()` from inside the callback **throws
  synchronously** — reentrant mutation would invalidate the snapshot it was just
  handed.
- A throw from the callback rejects the `close()` promise. The controller is
  released either way.

Intended for one-time post-stream work — baking a highlight cache, starting an
entrance animation — that should not run mid-stream against content still likely
to change.

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
- **Lexing is incremental as of `0.8.1`.** `appendMarkdown` re-tokenizes only
  from the last settled block boundary — a blank line outside any open
  construct — and splices the result onto the already-stable token prefix, so
  cost tracks the unstable tail rather than the document. Measured on a
  200-section document (25 070 chars, 784 chunks): 5.81 ms Chrome 150 /
  9.20 ms Firefox 153, against 428.07 / 451.76 ms for the previous
  whole-document strategy, with the scaling exponent 0.99 / 1.23 instead of
  1.94 / 2.01. Two constructs fall back to whole-document lexing because they
  can rewrite already-emitted tokens: a link definition (`[x]: url`, whose
  label map is consulted after all block tokens exist) and a line-start `$$`
  math opener. A document built mostly of those streams at roughly the old
  cost. `createStream()` is still worth using to batch per frame, and
  segmenting a long transcript into one `Markdown` entity per message still
  helps render and layout, but it is no longer needed to keep lexing cheap.
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
