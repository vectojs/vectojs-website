+++
title = "Markdown"
description = "Canvas-native Markdown renderer with rich text, code blocks, tables, frame-coalesced StreamController, and link callbacks — the standalone @vectojs/markdown package."
weight = 14
+++

# `Markdown` — `@vectojs/markdown`

`Markdown` and `CodeBlock` live in the standalone **`@vectojs/markdown`** package
(as of `@vectojs/ui@2.0.0` they are no longer part of `@vectojs/ui`, so the
`marked` + `@vectojs/tex` dependencies only load when you render Markdown). It composes
`@vectojs/ui` components, so install it alongside `@vectojs/ui` and `@vectojs/core`:
`bun add @vectojs/markdown @vectojs/ui @vectojs/core`.

`Markdown` parses Markdown with `marked` and renders the result into a VectoJS entity subtree.
Paragraphs and headings become `RichText`, fenced code becomes `CodeBlock`, and GFM tables become
`Table`.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Markdown</span></div>
  <iframe src="/sandbox/ui/markdown.html?v=core-1.39.0-ui-2.20.1" class="sandbox-frame component-demo-frame component-demo-frame-xl" loading="eager" title="Markdown live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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
  theme?: MarkdownThemePresetName | MarkdownTheme; // object, or preset name:
  // 'githubDark' | 'githubLight' | 'dracula' | 'solarizedDark' | 'solarizedLight'
  onLinkClick?: (href: string) => void;
  selectable?: boolean; // default true
  userTiming?: boolean; // emit a `vecto:markdown:parse` measure, default false
  blockAffordances?: boolean; // copy/download controls on code blocks + tables, default false
  affordances?: BlockAffordanceConfig; // which controls + labels, e.g. { download: false }
  showCodeLanguage?: boolean; // fence language in a header band per code block, default false
  writeClipboard?: (text: string) => void; // injectable clipboard write (jsdom/tests)
  saveFile?: (filename: string, content: string, mimeType: string) => void; // injectable download
}
```

### Block affordances (copy / download controls)

`blockAffordances: true` draws copy + download controls in the top-right corner
of code blocks and tables. Opt-in by design: each control is a focusable stop in
the tab order, and a document with many fences would be tedious to keyboard-past
(and a reader without clipboard/filesystem permissions gains nothing). `affordances`
narrows or relabels the set — the labels are user-visible text and are what a
screen reader announces, so use it for non-English documents. Both `writeClipboard`
and `saveFile` are injectable because the platform paths are absent in jsdom.
`showCodeLanguage` reserves a header band that also stops the controls from
overlapping the first line of code — turn it on when combining both.

Per-kind overrides (`0.20.x+`): `affordances.code` / `affordances.table` disable
copy/download for one block kind without touching the other — a table that
already offers copy in its own UI no longer needs two overlapping controls:

```ts
markdown.setOptions({
  blockAffordances: true,
  affordances: {
    table: { copy: false, download: false }, // keep code-block controls only
    code: { download: false }, // per-kind, inherits top-level defaults
  },
});
```

An omitted per-kind key inherits the top-level `copy`/`download`, which inherit
`true`. Code blocks can additionally be outlined with a border by setting
`theme.codeBorderColor` (optional; unset keeps the previous borderless
rendering) — useful on light page backgrounds where the code fill blends in.

## Theming: `setTheme()`

```ts
markdown.setTheme(theme: MarkdownThemePresetName | Partial<MarkdownTheme>): this
```

Swaps the palette and re-renders the document (`0.23.0+`). Accepts a preset
name — `'githubDark' | 'githubLight' | 'dracula' | 'solarizedDark' |
'solarizedLight'` — or a partial theme object with just the keys to change, the
same shapes as the constructor's `theme` option. Entities capture colors, fonts
and sizes at build time, so there is no live repaint of existing blocks: the
re-render goes through `setContent`, which also carries the new `blockGap` onto
the content stack.

Direct assignment to `markdown.theme` is a compile-time error and now also
throws at runtime for JS callers — assigning after construction used to paint
part of the document in each palette. Pass the palette at construction or call
`setTheme()`.

## Responsive width: `setMaxWidth()`

```ts
markdown.setMaxWidth(width: number): this
```

Re-wraps every already-rendered block at a new width (`0.9.0+`). Call this on a
resize instead of assigning `maxWidth`, which sets the field and changes nothing
visible: the width is read when each block is **built**, so an assignment leaves
existing blocks measured at the old width.

```ts
window.addEventListener('resize', () => {
  scene.resize(window.innerWidth, window.innerHeight);
  markdown.setMaxWidth(window.innerWidth - INSET * 2);
});
```

It reflows in place rather than rebuilding, which is what makes it usable
mid-stream:

- the same block entity **instances** survive, so anything holding a reference to
  one (a scroll anchor, a hit target, a devtools selection) keeps working;
- an open [`createStream()`](#streaming) writer is untouched and keeps appending;
- nothing is re-lexed.

Measured on a five-block document in both engines: 520 → 260 px took the
projected line count 2 → 4 and the height 88 → 160 on the same two paragraph
instances, with the writer still `open` and **zero** additional characters handed
to the lexer.

It no-ops on an unchanged width, so a height-only resize costs nothing and a
caller does not need to guard the call. A negative width clamps to 0. With
`blockAffordances: true`, code blocks and tables arrive wrapped in an
affordances shell — the reflow looks through the wrapper, resizes the inner
block, and refreshes its controls, so wrapped blocks track the new width like
everything else (`0.23.0+`; they silently kept the old width before).

> [!NOTE]
> Before `0.9.0` the only correct workaround was a full rebuild — release the
> stream, replay the revealed source through `setContent()`, open a fresh writer,
> and carry the scroll offset across by hand. That reproduces the document
> correctly, which is why it was easy to keep: a rebuild also produces correct
> geometry. What it cost was a whole-document re-lex and every entity instance,
> on every resize.

Display math is deliberately left at its own width: `@vectojs/tex` sizes a typeset box
from `ex`-relative metrics rather than from the available width, so stretching it
would distort the formula. Fenced code is also not re-wrapped — code has a fixed
monospace grid and long lines overflow by design — only its background is
resized.

Calling it from an
[`onStable`](#one-shot-completion-onstable) callback throws, for the same reason
`setContent()` does: that callback runs inside the commit it would invalidate.

## GFM coverage

Beyond paragraphs, headings, lists, fenced code and tables:

| Construct           | Renders as                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `~~strikethrough~~` | A struck run — one stroke per coalesced run, weight scaled to size (`0.8.0+`)                  |
| `- [ ]` / `- [x]`   | A ☐ or ☑ glyph plus a space, replacing the bullet; `1.` then the glyph when ordered (`0.8.0+`) |
| `\|:--\|--:\|:-:\|` | Column alignment, forwarded to `Table.align` (`0.8.0+`)                                        |
| `$…$` / ` ```math ` | `@vectojs/tex`-typeset formula (inline / block), converted only once the delimiter closes      |
| `[^1]` / `[^1]: …`  | A small tinted `[1]` marker, and the definition as its own block (`0.16.0+`)                   |
| `~subscript~`       | Literal source, unstruck — **not** subscript, and no longer struck through (`0.16.1+`)         |

Footnote definitions render **where they stand**, not collected into a document
footer, and a marker prints its label as written rather than renumbering — so a
reference renders before its definition has arrived while streaming. A marker
carries no `href`: it refers to a sibling block, not a URL, so it is not
underlined and never reaches `onLinkClick`. Definitions are single-line; an
indented continuation line becomes an ordinary indented code block, and inline
markup inside a note body renders literally.

Two theme keys control the appearance: `footnoteColor` (defaults to
`linkColor`, so recolouring links recolours markers too) and
`footnoteMarkerScale` (default `0.75`, a multiple of the size of the run the
marker sits in — so a marker in a heading scales with the heading).

A **single**-tilde run is not subscript and is not strikethrough. `marked`'s GFM
tokenizer emits the same `del` token for `~x~` as for `~~x~~`, so before `0.16.1`
`H~2~O` painted the `2` with a strikethrough: a reader saw H2̶O with no way to
tell subscript had been meant. It now renders as its literal source, `H~2~O`,
unstruck — inner markup still renders, so `~*em*~` keeps its emphasis. True
subscript needs a baseline-shift text style, which does not exist yet. `~~x~~` is
unaffected, including a single-tilde run nested inside one: `~~a ~b~ c~~` is
struck throughout.

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

`close()` settlement is observed exactly once: if the host's close hook threw
or rejected, a retried `close()` reports the original failure instead of
resolving through the closed short-circuit (`0.23.0+` — retries after a
successful close still resolve).

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
  200-section document (26 760 chars, math+prose): 3.66 ms Chrome 151 /
  5.98 ms Firefox 153, against 562.19 / 628.44 ms for the previous
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

Two extension surfaces exist:

- **`renderToken(token)`** is protected, so custom renderers can subclass `Markdown` for app-specific blocks while still delegating normal tokens to the built-in renderer.
- **Fenced block registry** — pluggable rendering for code fences keyed by info string (code, math, mermaid, graphviz, …). A renderer lazy-loads on first `render()` and caches; `'error'` falls back to the default code block renderer.

```ts
import { FencedBlockRegistry } from '@vectojs/markdown';

FencedBlockRegistry.register('mermaid', {
  async load() {
    const mermaid = await import('mermaid');
    return (source, lang, options) => {
      /* render → Entity */
    };
  },
});
FencedBlockRegistry.unregister('mermaid');
```

`FencedBlockRenderOptions` carries `{ theme, availableWidth, selectable }`.
Related exports: `isFencedBlockRendererReady`, `renderFencedBlock`, plus
`PRESET_THEMES` / `resolvePresetTheme` / `isPresetName` for theme resolution,
and helpers `tableToCsv` / `tableToMarkdown` / `extensionForLanguage` /
`mimeForLanguage` (the affordance + export internals).

Additional utility surface: `Markdown.setUserTiming(on)` (runtime toggle for
the parse measure), `codeAtlas` / `codeAtlasStats` / `highlightedLanguages`
(atlas diagnostics), and `MathBlock` / `preloadMathJax()` / `isMathJaxReady`
for the optional TeX math renderer (loaded lazily, not pulled in by default).

## Maintainer checklist

- Link callbacks must be forwarded to paragraph, heading and list `RichText` nodes.
- Code blocks should stay a single leaf entity, not one entity per token or line segment.
- Fenced code must project its exact source text and line breaks.
- Table headers use heading color/bold style, while each logical cell owns exactly one content projection.
- Pointer ownership stays with the leaf text/code projection; structural list and table entities must not intercept native selection.
- StreamController commits and direct appends must reuse unchanged prefix entities.

Related: [`RichText`](/reference/ui-components/#richtext), [`CodeBlock`](/reference/ui-components/#codeblock), [`Table`](/reference/ui-components/#table).
