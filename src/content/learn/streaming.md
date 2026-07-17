---
title: 'Streaming & Real-Time Text'
description: 'Building chat UIs, log viewers, and live dashboards: per-frame chunk coalescing, the append APIs, idle-throttle interplay, and long-transcript strategy.'
order: 18
---

# Streaming & Real-Time Text

Token streams (LLM chat), log tails, and live data feeds are where naive VectoJS
code most often falls off a cliff. The engine gives you fast primitives —
`Text.append()`, `Markdown.appendMarkdown()`, paragraph-level layout memoization,
off-thread Markdown parsing — but wiring them up per token instead of per frame
throws most of that away. This page is the end-to-end recipe.

## The one rule: batch per frame, not per token

A stream delivers tokens far faster than the display refreshes. Every
`append()`/`appendMarkdown()` call pays a layout pass, and every layout between
two rendered frames except the last is **invisible work**. The fix is four
lines: buffer tokens as they arrive, flush once per animation frame.

```typescript
let pending = '';
let scheduled = false;

function pushToken(token: string) {
  pending += token;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const chunk = pending;
    pending = '';
    markdown.appendMarkdown(chunk); // ONE layout for the whole frame's tokens
    transcript.scrollToBottom();
  });
}

for await (const token of llmStream) pushToken(token);
```

With a 200-token/s stream at 60 fps this turns ~200 layout passes per second
into ~60 — and under load it degrades gracefully: the busier the main thread,
the larger (and _rarer_) the flushed chunks become. The pattern is
self-regulating; a fixed `setInterval` debounce is not.

> [!NOTE]
> `scene.markDirty()` already coalesces naturally — three appends in one frame
> set one flag and cost one repaint. The expensive part of an append is the
> **layout**, not the dirty flag, which is why the batching must wrap the
> append itself.

## Choosing the append API

| Content            | API                                     | Cost per call                                                                                                                |
| ------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Plain text         | `text.append(chunk)`                    | Cold pass, but the paragraph memo reuses every finished `\n`-terminated paragraph                                            |
| Styled spans       | `richText.appendSpans(spans)`           | Appends spans; prior spans' measurements are reused                                                                          |
| Markdown           | `markdown.appendMarkdown(chunk)`        | Re-lexes the raw source (off-thread when `Worker` exists), reuses finished block entities, grows the last paragraph in place |
| Anything, replaced | `setText` / `setContent` (anti-pattern) | Full rebuild — never call with a growing document per token                                                                  |

Two costs hide inside `appendMarkdown` that you should know about:

1. **Lexing is O(document), not O(chunk).** Each call re-tokenizes the whole
   accumulated source. The parse runs in a background Worker when available
   (falling back to synchronous lexing in environments without `Worker`), and
   entity updates reuse every finished block — but a 100k-character transcript
   still pays a 100k-character lex per flush. Per-frame batching divides that
   by the tokens-per-frame factor; transcript segmentation (below) caps it.

2. **Paragraph memoization keys on `\n`.** Both `Text.append` and the Markdown
   paragraph updater only re-measure the paragraph that changed. One endless
   run-on line defeats the memo and degrades to O(document) measurement per
   flush. LLM output has natural paragraph breaks; log lines end in `\n` —
   you usually get this for free, but don't strip the newlines.

## Render mode and the idle throttle

Streaming UIs should run `renderMode: 'onDemand'`:

```typescript
const scene = new Scene(canvas, { renderMode: 'onDemand' });
```

Every append marks the scene dirty, so frames render exactly while content
flows and stop the moment the stream idles — no 2 fps auto-throttle surprises
and no idle battery burn between responses. The append APIs and the built-in
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
content. Call it inside the same rAF flush as the append (as in the recipe
above) so the target is computed _after_ the new layout.

For a chat UI, follow the user's intent: stick to the bottom only while they
were already at the bottom. `content` is public and its `y` holds the negative
scroll translation, so "at bottom" is:

```typescript
function nearBottom(sv: ScrollView, slack = 24): boolean {
  const maxScroll = Math.max(0, sv.content.height - sv.height);
  return -sv.content.y >= maxScroll - slack;
}

// In the flush: read stickiness BEFORE appending, apply AFTER.
const stick = nearBottom(transcript);
markdown.appendMarkdown(chunk);
if (stick) transcript.scrollToBottom();
```

The read-append-scroll ordering inside one flush is the point: measuring
"was at bottom" after the append always answers "no" once content grew.

> [!NOTE]
> The two scroll APIs are deliberately asymmetric: `scrollTo(y)` retargets the
> scroll **spring** (so `content.y` animates there over the next frames), while
> `scrollToBottom()` **snaps**. Position-derived state read immediately after a
> `scrollTo` sees the old position — read it on the next flush, as the
> stickiness pattern above naturally does.

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

| Symptom                            | Probe                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| Jank while streaming               | Count appends per second vs. frames per second — if appends ≫ frames, you're missing the rAF batch |
| Jank grows with transcript length  | You're streaming into one ever-growing entity — segment per message                                |
| Whole UI stalls on long paragraphs | No `\n` in the stream — the paragraph memo can't split; check the source formatting                |
| Scroll fights the user             | `scrollToBottom()` unconditionally — gate on "was at bottom" stickiness                            |
| CPU busy while stream is idle      | Scene left in `'always'` mode, or a custom animation without `hasPendingAnimations()`              |

For real numbers, use the in-page measurement pattern from
[Measuring real performance](/learn/performance/#measuring-real-performance) —
headless FPS is not representative.

> **Next:** [Performance](/learn/performance/) for the full optimization
> toolbox, and [`Markdown`](/reference/ui-markdown/) for the streaming API
> reference.
