+++
title = "Projection policy"
description = "How a node negotiates canvas vs DOM materialization: the Capability Matrix, hysteresis, budget, gesture and focus pins, and the queryable surface."
weight = 57
+++

# Projection policy

Version documented: **core@1.40.0 / markdown@0.25.0**.

Once a scene can materialize a node two ways — canvas pixels or a real
`HTMLElement` via [`@vectojs/dom`](/reference/dom-projection/) — every node
needs an answer to _which way_, and the answer cannot be global: a particle
field must never pay for thousands of DOM elements, while a text input
re-implemented in canvas pays in IME, BiDi, and clipboard handling the browser
gives away for free. The per-node knob is `Entity.domPolicy`; the negotiation
that resolves it is this page.

```ts
type ProjectionPolicy = 'canvas' | 'dom' | 'auto';
node.domPolicy = 'dom';
node.domKind = 'prose';
```

`domPolicy` is the in-tree name of the design's `projection` field. `domKind` is
the backend creation hint (tag/content mapping the DOM backend consumes); `''`
means a plain positioned `div` with no content sync. `a11yProjection` keeps
governing the semantic/AT mirror independently — the two knobs compose, neither
silently overrides the other.

## Negotiation rules

```ts
resolveProjection(
  want: ProjectionPolicy,
  cap: ProjectionCapabilityRow,
  ctx: ProjectionNegotiationContext,
): ProjectionOutcome
```

Pure and per-node-per-sync, so it stays unit-testable without a `Scene`.
Scene-side state (hysteresis, pins, budget) layers on top in
`Scene.resolveProjectionFor`.

1. **Explicit beats automatic; possible beats explicit.** `'canvas'` and a
   satisfiable `'dom'` are never second-guessed. `'auto'` is the only mode the
   engine may flip frame to frame.
2. **Fallbacks are reported, not silent.** Every non-honored request carries its
   reason on the per-scene queryable surface, so apps and devtools can show
   _why_ a node rendered as canvas.
3. **No-DOM environments always resolve `'canvas'`** before touching the matrix
   (SSR/Node short-circuit).
4. **`'auto'` weighs interaction value against cost**: native value `'high'`
   (without prohibitive DOM cost) resolves to DOM; prohibitive canvas cost with
   DOM support resolves to DOM; otherwise the matrix row's `autoDefault`
   decides.

```ts
type ProjectionFallbackReason =
  | 'no-dom-backend'
  | 'unsupported-kind'
  | 'prohibitive-cost'
  | 'bulk-budget'
  | 'active-gesture'
  | 'focus-pinned'
  | 'hysteresis';
```

The only capability cell that overrides an explicit `'dom'` request (besides an
unsupported kind) is `domCost: 'prohibitive'` — and even then it reports rather
than refusing silently. Cost is otherwise the author's choice.

## Capability Matrix

Keyed by `Entity.domKind` — the representation, not the entity class — so the
row travels with what the backend consumes. Values are measured-mirror starting
positions; the prototype must replace opinions with numbers.

| `domKind`   | Native value | DOM cost    | Canvas cost | `auto` rests at |
| ----------- | ------------ | ----------- | ----------- | --------------- |
| `text`      | medium       | low         | low         | canvas          |
| `prose`     | high         | medium      | high        | dom             |
| `code`      | medium       | medium      | high        | canvas          |
| `input`     | high         | low         | prohibitive | dom             |
| `button`    | medium       | low         | low         | dom             |
| `link`      | medium       | low         | low         | dom             |
| `select`    | high         | low         | high        | dom             |
| `container` | none         | n/a         | low         | canvas          |
| `transform` | none         | n/a         | n/a         | canvas          |
| `image`     | low          | medium      | low         | canvas          |
| `particles` | none         | prohibitive | low         | canvas          |
| `graph`     | low          | medium      | medium      | canvas          |
| `shader`    | none         | unsupported | low         | canvas          |

Reading notes: short static text rests on canvas because content projection
already covers findability; long/selectable prose and Markdown blocks resolve to
DOM for selection, Ctrl+F, and translation; inputs resolve to DOM for IME,
caret, clipboard, and BiDi; buttons and links are cheap either way and native
wins on focus plus AT clicks; containers never materialize themselves (children
negotiate individually); transforms own space, not pixels; bulk rows (particles,
danmaku, chart glyphs) stay canvas unconditionally with an aggregate live region
covering semantics.

Unknown kinds (absent from the matrix) resolve to canvas with reason
`'unsupported-kind'`:

```ts
scene.registerProjectionCapability(domKind: string, row: ProjectionCapabilityRow): this
scene.getProjectionCapability(node: Entity): ProjectionCapabilityRow
```

Registering a row is how a custom backend kind opts into `'auto'` resolution.

## Hysteresis (`N = 3`)

```ts
PROJECTION_AUTO_HYSTERESIS_FRAMES = 3;
scene.projectionHysteresisFrames = 3;
```

An `'auto'` node near a cost threshold must not flicker backends every frame —
each flip pays `unmount` + `mount` plus, for text, layout handoff. The sticky
resolution requires 3 consecutive syncs voting for the other backend before the
flip commits:

```ts
hysteresisVote(current, desired, consecutive, hysteresisFrames):
  { resolved; consecutive; flipped }
```

Votes for the current backend reset the counter; votes against accumulate until
the frame budget, then commit. The first vote for a node (no current resolution)
always commits — stickiness pins flips, never first placement. While the vote is
pending the recorded reason is `'hysteresis'`. The count is a documented
per-scene tunable (`SceneOptions` `projectionHysteresisFrames`), not dogma — P1
measurement work owns the number.

Resolution is memoized per main frame, so the render walk and the later a11y
sync agree within a frame: a node cannot lose its mirror the same frame it gains
an element.

## Budget (`500`)

```ts
PROJECTION_AUTO_DOM_BUDGET = 500;
scene.projectionAutoDomBudget = 500;
```

Maximum `'auto'`-resolved DOM residents per scene per frame — the particle-row
backstop so bulk-count nodes stay canvas. Explicit `'dom'` requests are the
author's choice and bypass it; only the engine's own placements count. Overflow
resolves to canvas with reason `'bulk-budget'`. Tunable per scene via
`SceneOptions` `projectionAutoDomBudget`.

## Gesture and focus pins

A node never flips backends mid-gesture (input-dispatch-contract-v2 gesture
stickiness, no mid-gesture handoff):

```ts
scene.pinProjectionForGesture(node: Entity): void
scene.unpinProjectionForGesture(node: Entity): void
scene.isProjectionPinned(node: Entity): boolean  // core-mirror pins, refcounted
projection.hasActiveGesture(node: Entity): boolean  // DOM-side presses per pointerId
```

The a11y-mirror pointerdown/up/cancel listeners maintain the core-side pins;
DOM-side gestures are consulted through the backend. During `'auto'` negotiation
a pinned node keeps its current backend with reason `'active-gesture'`.

Focus is preserved-or-moved, never dropped to `body`: a node whose a11y mirror
currently owns browser focus keeps its backend until blur, with reason
`'focus-pinned'`. The actual move, if any, goes through the existing sentinels
(core's `preserveFocusOnRemoval`, the DOM backend's own fallback), never a bare
removal.

## Queryable surface

Plain-data feature detection apps and devtools query to adapt, never to mutate.
Resolution data never carries an `HTMLElement` — materialization stays in
`@vectojs/dom`.

```ts
scene.projectionCapabilities: SceneProjectionCapabilities
scene.getProjectionResolution(node: Entity | string): ProjectionResolution | undefined
scene.getProjectionResolutions(): readonly ProjectionResolution[]
```

```ts
interface SceneProjectionCapabilities {
  hasDOM: boolean; // false under SSR/Node
  domBackendMounted: boolean; // a 'dom'-kind backend is registered
  backends: readonly string[]; // kinds of all registered backends
  autoHysteresisFrames: number;
  autoDomBudget: number;
}
```

```ts
interface ProjectionResolution {
  nodeId: string;
  want: ProjectionPolicy;
  resolved: 'canvas' | 'dom';
  reason: ProjectionFallbackReason | null; // null when the request is honored
}
```

```ts
scene.addProjectionBackend(backend: ProjectionBackend): this
scene.removeProjectionBackend(backend: ProjectionBackend | ProjectionBackendKind): this
```

Registration is idempotent per backend instance. Removing by instance or kind
does not unmount resident nodes — unmount the backend first if teardown order
matters. With no backends registered and no non-default policy, negotiation
fast-paths to canvas with nothing recorded: today's scenes pay zero.

## Markdown dogfood (`canvas` / `dom` / `hybrid`)

`@vectojs/markdown` assigns the per-block `domPolicy` / `domKind` the
negotiation consumes. The module is DOM-free plain data: kinds are labels, and
the `'prose'` / `'code'` materializers live with the backend.

| Block                                          | `domKind`     | `'auto'` resolves to          |
| ---------------------------------------------- | ------------- | ----------------------------- |
| `Text` / `RichText` (prose)                    | `'prose'`     | dom                           |
| `CodeBlock`                                    | `'code'`      | canvas (until measured)       |
| `Table`                                        | `''`          | canvas (`'unsupported-kind'`) |
| Grouping wrapper (children, no specific class) | `'container'` | canvas (children negotiate)   |
| Anything else (rules, chrome)                  | `''`          | canvas                        |

```ts
type MarkdownProjectionMode = 'canvas' | 'dom' | 'hybrid';
classifyProjectionBlocks(content: Stack): ClassifiedProjectionBlock[]
applyProjectionMode(root: Entity, mode: MarkdownProjectionMode): void
```

Kinds attach to top-level blocks only (idempotent — re-running keeps prior
kinds); nested content keeps its own `domKind` until a finer pass tags it.
Modes: `'canvas'` forces every node to canvas (byte-identical baseline, the
regression gate); `'dom'` forces `'dom'` where the node has a materializable
kind (`'prose'` / `'code'`) and canvas elsewhere; `'hybrid'` sets every node to
`'auto'` and lets the engine negotiate per block. The switcher surface shows
per-block resolution plus fallback reasons so a reviewer sees _why_ each block
landed where it did.

## Semantic-tier pointer

Visual negotiation (`domPolicy`) is orthogonal to the semantic tier. The
per-node semantic policy chooses per entity whether the framework mirror or
browser recovery owns platform semantics:

```ts
scene.semanticProjectionPolicy: SemanticProjectionPolicy  // default: always 'project'
type SemanticProjectionDecision = 'project' | 'defer-to-browser' | 'never';
```

The framework-known default projects everything the legacy predicate projects,
so omitting the policy changes nothing. `'defer-to-browser'` always falls back
to projection today — no deferral backend exists (`supportsHTMLInCanvas()` is
`false`), so deferring would silently drop semantics. When a backend lands, only
allow-listed plain display text (`isDeferrableSemanticNode`: no native-control
tag, no control role, no tab stop, no selectable content projection — never
controls) may actually defer, always feature-detected with a projection
fallback. A throwing policy likewise falls back to projection: a policy must
never drop semantics by accident.

## Related

[`@vectojs/dom`](/reference/dom-projection/) (backend, event bridge, prototype
nodes) · [a11yRoot & the agent contract](/reference/core-a11y/) (mirror
lifecycle, `A11yAttributes`) · [`Scene`](/reference/core-scene/)
(`SceneOptions`, `addProjectionBackend`) · [`Entity`](/reference/core-entity/)
(`domPolicy`, `domKind`, `a11yProjection`)
