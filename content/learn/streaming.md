+++
title = "Streaming & Real-Time Text"
description = "Building chat UIs, log viewers, and live dashboards: per-frame chunk coalescing, the append APIs, idle-throttle interplay, and long-transcript strategy."
weight = 18
+++

# Streaming & Real-Time Text

Token streams (LLM chat), log tails, and live data feeds are where naive VectoJS
code most often falls off a cliff. The engine gives you fast primitives —
`Text.append()`, `Markdown.appendMarkdown()`, paragraph-level layout memoization,
off-thread Markdown parsing — but wiring them up per token instead of per frame
throws most of that away. This page is the end-to-end recipe.

## The one rule: commit per frame, not per token

A stream delivers tokens far faster than the display refreshes. Every direct
`appendMarkdown()` call can pay a parse/layout pass, and every pass between two
rendered frames except the last is **invisible work**. Use the built-in
`StreamController` rather than wiring a second scheduler:

```typescript
const stream = markdown.createStream();

try {
  for await (const token of llmStream) {
    await stream.write(token);
  }
  await stream.close(); // force the final commit; do not wait for another frame
} catch (error) {
  stream.abort(error); // discard accepted but uncommitted text
  throw error;
}
```

Default mode keeps accepted chunks as separate strings, then joins and commits
them at most once in the next animation frame. `write()` resolves when a chunk
enters the bounded buffer, not when it becomes visible, so one async producer
can still contribute several tokens to the same frame. Await it: once the
64 KiB high-water buffer fills, one write waits for capacity and any additional
write rejects rather than creating an unbounded queue.

With a 200-token/s stream at 60 fps this turns up to ~200 layout passes per
second into at most ~60. Under load it degrades gracefully: the busier the main
thread, the larger (and _rarer_) the committed chunks become. A fixed
`setInterval` debounce does the opposite.

`appendMarkdown()` remains the synchronous escape hatch. A direct call first
flushes all previously submitted controller text (including one backpressured
write), then appends its own chunk, so call order stays exact.

> [!NOTE]
> `scene.markDirty()` already coalesces naturally — three appends in one frame
> set one flag and cost one repaint. The expensive part is parse/layout, which
> is why batching must wrap `appendMarkdown()` itself. `createStream()` does
> that; it does not create another parser or reconciliation path.

## Choosing the append API

| Content            | API                                                | Cost per commit                                                                   |
| ------------------ | -------------------------------------------------- | --------------------------------------------------------------------------------- |
| Plain text         | `text.append(chunk)`                               | Cold pass, but the paragraph memo reuses every finished `\n`-terminated paragraph |
| Styled spans       | `richText.appendSpans(spans)`                      | Appends spans; prior spans' measurements are reused                               |
| Markdown, direct   | `markdown.appendMarkdown(chunk)`                   | Synchronous API; one append commit per call                                       |
| Markdown, streamed | `await stream.write(chunk)` after `createStream()` | At most one append commit per animation frame; bounded producer backpressure      |
| Anything, replaced | `setText` / `setContent` (streaming anti-pattern)  | Full rebuild — never call with a growing document per token                       |

Two costs hide inside `appendMarkdown` that you should know about:

1. **Lexing is incremental, keyed to the unstable tail.** Since 0.8.1 the worker
   path re-lexes from the last stable block boundary (`lexAppend`) instead of
   re-tokenizing the whole accumulated source, so per-chunk cost tracks the
   changed tail, not the document size. Only documents that use link-definition
   blocks or line-start `$$` math fall back to a whole-document lex (`lexFull`).
   The parse runs in a background Worker when available (falling back to
   synchronous lexing in environments without `Worker`), and entity updates
   reuse every finished block.

2. **Paragraph memoization keys on `\n`.** Both `Text.append` and the Markdown
   paragraph updater only re-measure the paragraph that changed. One endless
   run-on line defeats the memo and degrades to O(document) measurement per
   flush. LLM output has natural paragraph breaks; log lines end in `\n` —
   you usually get this for free, but don't strip the newlines.

## Typewriter pacing and lifecycle

Performance batching is the default. Add fixed wall-clock pacing only when the
product needs a typewriter reveal:

```typescript
const stream = markdown.createStream({
  pacing: { graphemesPerSecond: 48 },
  maxBufferedChars: 64 * 1024,
  signal: requestAbort.signal,
});
```

Pacing never switches to “one token per frame.” It accumulates
`graphemesPerSecond` credit from rAF timestamps, may reveal several graphemes in
one frame, and still performs at most one append commit. A 100ms timestamp cap
prevents a background tab from dumping a large catch-up burst.

Slicing uses `Intl.Segmenter`, including across chunk/frame boundaries, so
combining marks, emoji ZWJ sequences, flags, and surrogate pairs stay together.
Unicode permits a single grapheme to grow without limit; if adversarial input
fills the complete bounded accepted-plus-blocked window without reaching a
boundary, the controller commits one Unicode code point (never half a surrogate
pair) rather than deadlocking or growing memory without bound.

- `flush()` synchronously commits submitted text and keeps the stream open.
- `close()` admits the blocked write, releases the held grapheme tail, performs
  one ordered final commit, and closes.
- `abort(reason)` discards uncommitted text. Pending and future operations reject
  with the retained reason.
- `Markdown.setContent()` aborts the active controller before replacement.
- `Markdown.destroy()` aborts it and removes rAF/`AbortSignal` listeners.
- One `Markdown` owns at most one open controller; terminal controllers
  unregister so a later stream can start.

## Render mode and the idle throttle

Streaming UIs should run `renderMode: 'onDemand'`:

```typescript
const scene = new Scene(canvas, { renderMode: 'onDemand' });
```

Every append marks the scene dirty, so frames render exactly while content
flows and stop the moment the stream idles — no idle-floor auto-throttle
surprises and no idle battery burn between responses. The append APIs and the built-in
scroll containers all report their in-flight motion (`hasPendingAnimations()`),
so smooth-scrolling to the bottom keeps animating after the last token lands.

If you drive any _custom_ per-frame motion during the stream (a typing
indicator, a pulsing cursor) from `update()`, remember the
[idle-throttle contract](/learn/performance/#the-idle-auto-throttle-the-hidden-pitfall):
override `hasPendingAnimations()` or drive it with `animate()`/`springTo()`.

## Following the bottom

`ScrollView.scrollToBottom()` **snaps** to the content end — deliberately
bypassing the scroll spring, because retargeting a spring many times a second
never lets it settle and the viewport jitters instead of tracking the newest
content. `Markdown.onLayoutUpdated` runs after each stream commit, when the new
height is available:

```typescript
let stickToBottom = true;

function nearBottom(sv: ScrollView, slack = 24): boolean {
  const maxScroll = Math.max(0, sv.content.height - sv.height);
  return -sv.content.y >= maxScroll - slack;
}

markdown.onLayoutUpdated = () => {
  if (stickToBottom) transcript.scrollToBottom();
};

for await (const token of llmStream) {
  // Read intent before the commit changes content height.
  stickToBottom = nearBottom(transcript);
  await stream.write(token);
}
await stream.close();
```

Also set `stickToBottom = false` from the app's user-scroll handling; otherwise
a user who scrolls during the final pending frame can be snapped back by stale
intent. The ordering is the invariant: read “was at bottom” before content
grows, snap only after `onLayoutUpdated`.

> [!NOTE]
> `scrollTo(y)` retargets the scroll **spring**, while `scrollToBottom()` snaps.
> Position-derived state read immediately after `scrollTo` still sees the old
> position — read it on a later commit/frame.

## Long transcripts: segment, then virtualize

Append cost and lex cost both grow with document size, so cap the document.
Two-tier strategy for chat/log UIs:

1. **Segment per message.** One `Markdown` entity per assistant message, not
   one for the whole conversation. The streaming entity is always small (only
   the in-flight message), so per-flush lexing stays cheap regardless of
   conversation length. Finished messages never re-lex at all.
2. **Virtualize the history.** Once messages are separate entities, a
   [`VirtualList`](/reference/ui-virtuallist/) renders only the visible ones.
   A thousand-message transcript costs what the viewport shows, not what the
   session accumulated.

```typescript
function startAssistantMessage(): Markdown {
  const md = new Markdown('', { maxWidth: 640 });
  messages.push(md); // your VirtualList data source
  return md; // stream into THIS entity only
}
```

This also bounds memory: a finished message's layout is static and cullable,
and scrolling far back never triggers re-layout of the live tail.

## Measuring a streaming UI

Symptoms and their signals, in the order to check them:

| Symptom                            | Probe                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Jank while streaming               | DevTools `Streaming/appends` exceeds rendered frames — use one `createStream()` per live message              |
| `write()` rejects under load       | A second write arrived while one was backpressured — await every write                                        |
| Jank grows with transcript length  | You're streaming into one ever-growing entity — segment per message                                           |
| Whole UI stalls on long paragraphs | No `\n` in the stream — the paragraph memo can't split; check the source formatting                           |
| Scroll fights the user             | `scrollToBottom()` unconditionally — gate on “was at bottom” stickiness                                       |
| CPU busy while stream is idle      | Scene left in `'always'` mode, or a custom animation without `hasPendingAnimations()`; controller rAF is idle |

For real numbers, use the in-page measurement pattern from
[Measuring real performance](/learn/performance/#measuring-real-performance) —
headless FPS is not representative.

> **Next:** [Performance](/learn/performance/) for the full optimization
> toolbox, and [`Markdown`](/reference/ui-markdown/) for the streaming API
> reference.
