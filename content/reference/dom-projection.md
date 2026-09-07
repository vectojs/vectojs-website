+++
title = "@vectojs/dom"
description = "DOM visual projection for VectoJS: which nodes materialize as live HTMLElements, how the world matrix becomes matrix3d, and how native events bridge back into the scene."
weight = 56
+++

# `@vectojs/dom`

Version documented: **0.2.0** (with `@vectojs/core@1.40.0`).

`@vectojs/dom` is the DOM-visual projection backend: selected subtrees
materialize as live `HTMLElement`s positioned by their world matrix, while the
scene graph keeps owning nodes, layout, visibility, lifecycle, and events.
Depends on `@vectojs/core`, never the reverse — core sees it only behind the
`ProjectionBackend` `mount` / `update` / `unmount` interface.

## Installation

```sh
bun add @vectojs/dom @vectojs/core
```

```ts
import { Scene } from '@vectojs/core';
import { DOMProjection } from '@vectojs/dom';

const scene = new Scene(document.querySelector('canvas')!);
scene.addProjectionBackend(new DOMProjection(scene.canvas));
scene.start();
```

Without a DOM (SSR/Node) or without a canvas parent, the backend constructs but
never goes resident — the walk falls through to canvas paint. `getRoot()`
returns `null` there.

## Lifecycle

```ts
projection.mount(node: Entity): void
projection.update(node: Entity, worldMatrix: AffineTransform): void
projection.unmount(node: Entity): void
projection.dispose(): void
```

Core drives these from the render walk for every node whose negotiation resolves
to `'dom'` (see [projection policy](/reference/projection-policy/)). The walk
passes the node's world matrix; the backend owns everything medium-specific.
`mount` is idempotent, `unmount` is idempotent, and re-adding a removed node
re-mounts on the next frame.

- **Mount** creates (or claims from the pool) one element per resident node,
  sets `position: absolute`, `transform-origin: 0 0`, `pointer-events: auto`,
  stamps `data-vecto-id`, appends under the root, installs the event bridge,
  starts a `ResizeObserver` where available, assigns a stable mount-order
  `z-index`, and sets `node.domResident = true` so the canvas walk skips
  painting it.
- **Update** reconciles transform, world opacity (composed up the ancestor
  chain), explicit `width` / `height`, and kind content — every field
  dirty-checked, so steady-state frames write nothing.
- **Unmount** releases the bridge first, moves focus to the sentinel when the
  removed subtree owns it, disconnects the observer, removes the element (or
  returns it to the pool), clears `domResident`, drops any gesture pin, and
  counts the teardown.
- **Dispose** unmounts every resident node and removes the root (scene
  teardown).

Content sync follows the `A11yAttributes` precedent: the `sync` hook writes
through a `fields` helper, `undefined` removes, values write only on change.

```ts
projection.getElement(nodeId: string): HTMLElement | undefined
projection.getIntrinsicSize(nodeId: string): { width: number; height: number } | undefined
projection.getStats(): DOMProjectionStats
```

`getIntrinsicSize` returns the last `ResizeObserver` measurement, if any.
`getStats` returns cumulative telemetry (`mounts`, `unmounts`,
`transformWrites`, `opacityWrites`, `sizeWrites`, `contentWrites`, `poolHits`,
`poolMisses`) — the same counters the dirty-check tests pin.

## Positioning: world matrix to `matrix3d()`

```ts
affineToMatrix3d(m: AffineTransform): string
```

The 2D world affine `[a c e; b d f; 0 0 1]` embeds as the column-major 4x4
`matrix3d(a, b, 0, 0, c, d, 0, 0, 0, 0, 1, 0, e, f, 0, 1)`, written to
`el.style.transform` only when the string changes. One code path covers 2D and
camera-composed scenes; per-frame string cost at realistic DOM-node counts
(tens, not thousands — bulk stays canvas by policy) stays behind the same
per-field dirty check the portals use.

`transform-origin: 0 0` is mandatory on every projected element. With the
default `50% 50%` origin, nested rotated boxes diverge by tens of pixels — the
same finding the a11y nesting math documents.

The browser renders the element (selection highlight, caret, focus ring,
children) first and transforms the rendered result after, which is why selection
keeps its perspective shape under rotation. Only 100% browser/display zoom is
supported: non-100% zoom misaligns `matrix3d` spacing (upstream
`mrdoob/three.js#3225`). Documented, not fixed.

## Pooling

Elements are pooled per tag, capped at 8 per tag. Claiming re-applies kind setup
the pool does not retain (`user-select: text` for text, cleared `display`) and
always re-syncs content through a fresh cache, so no stale text or value
survives reuse. Steady-state frames allocate nothing.

## Focus sentinel

The root owns a zero-size fallback target (`tabindex="-1"`, `aria-hidden`, no
dimensions, no overflow). When `unmount` removes a subtree that contains
`document.activeElement`, focus moves there with `preventScroll: true` instead
of stranding keyboard users on `body`. It is owned here — not by core's own
focus sentinel — so no new focus surface is needed in core. The bridge is
released before the fallback focus so the move itself does not re-enter the
node's handlers.

## Layer rule

Cross-backend ordering is layer-based, never pixel-depth-based. The root joins
the `portalRoot` family at `z-index: 9`, below `a11yRoot` at 10 — a projected
node at `position.z = -500` still paints over canvas content, by design, with no
per-pixel occlusion. The root is inserted before `a11yRoot` when present so the
below-a11y layer holds even on `z-index` ties; it carries `data-vecto-dom-root`,
fills its parent, takes no pointer events itself (`pointer-events: none`), and
clips (`overflow: hidden`).

Within the layer, document order follows stable mount order: first mount paints
first, and steady-state frames write no `z-index` at all.

## Prototype nodes

Five classes, explicit per-node opt-in only — each sets `domPolicy = 'dom'` in
its constructor. All render as no-ops on canvas: while resident the live element
owns the visuals, and the scene walk skips canvas paint for resident leaves. If
the backend is absent the walk falls through to canvas (where these paint
nothing) and `getA11yAttributes` keeps the transparent-mirror fallback
meaningful if the policy flips back to `'canvas'`.

| Class          | `domKind`     | Element     | Content sync                                                |
| -------------- | ------------- | ----------- | ----------------------------------------------------------- |
| `DOMText`      | `'text'`      | `div`       | `text` → `textContent`, `user-select: text`                 |
| `DOMButton`    | `'button'`    | `button`    | `label` → `textContent`; clicks via the event bridge        |
| `DOMInput`     | `'input'`     | `input`     | `value` (never while focused) + `placeholder` attribute     |
| `DOMContainer` | `'container'` | plain `div` | none — grouping node; children negotiate individually       |
| `DOMTransform` | `'transform'` | plain `div` | none — position / rotation / scale only, never materialized |

```ts
new DOMText(id?: string, text?: string, width?: number, height?: number)
new DOMButton(id?: string, label?: string, width?: number, height?: number)
new DOMInput(id?: string, value?: string, width?: number, height?: number)
new DOMContainer(id?: string, width?: number, height?: number)
new DOMTransform(id?: string)
```

All five default to `interactive = true` with a box (except `DOMTransform`,
which is boundless and never hit-tests). `DOMInput` never clobbers the focused
value: while the element owns focus the browser owns caret and IME pre-edit, and
the bridge's native `input` listener is the source of truth. `DOMContainer`
residents keep the walk recursing so opted-in descendants stay synced while
canvas-policy children paint at the same world coordinates — mixed subtrees
compose.

Each class also returns matching `getA11yAttributes` (text, button, textbox
roles), so a policy flip back to canvas restores the mirror without the node
going silent.

## Custom kinds: `registerKind`

```ts
projection.registerKind(kind: string, spec: DOMKindSpec): void
```

```ts
interface DOMKindSpec {
  tag: string;
  create(node: Entity): HTMLElement;
  sync(node: Entity, el: HTMLElement, fields: DOMSyncFields): void;
}
```

Custom kinds register per projection instance — the factory cannot live on core
`Entity` because that would add new `HTMLElement` surface to core. `tag` is the
pool key and must match what `create` returns; `sync` must touch the DOM only on
change via `fields`, so steady-state frames write nothing. Unknown `domKind`s
materialize as a plain `div` with no content sync (shared fallback, no
per-update allocation).

## Event bridge

```ts
attachDOMBridge(el: HTMLElement, node: Entity, options?: DOMBridgeOptions): DOMBridgeHandle
getGestureOwner(pointerId: number): string | undefined
```

Native events on a projected element translate into `VectoJSEvent` tree
dispatches with `source: 'dom'` — the DOM-visual element counts as a
materialized target at its point, so handlers see one attributed stream
regardless of backend. The listener inventory mirrors
`DOMPortalEntity.attachDOMBindings` by value (unification would cycle the core ↔
dom dependency), with source attribution added.

| Native                                                        | Vecto event(s)           | Notes                                                                    |
| ------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------ |
| `pointerdown` (capture)                                       | `pointerdown`            | forwarded, then stopped in selection mode; elects the gesture owner      |
| `mousedown`, `touchstart`                                     | —                        | pure capture stops in selection mode; the press arrives as `pointerdown` |
| `click`, `pointerup`, `pointercancel`, `pointermove`, `wheel` | same name                | release clears the gesture owner                                         |
| `mouseenter` / `mouseleave`                                   | `hover` / `pointerleave` | non-bubbling, as on portals                                              |
| `focus` / `blur` (capture)                                    | `focus` / `blur`         | capture, as on portals                                                   |
| `input`, `change`, IME composition                            | `change`                 | editable kinds only; mirrors the a11y input-mirror contract              |

Two interaction modes resolve the select-vs-orbit ambiguity explicitly rather
than by renderer guessing:

```ts
type DOMInteractionMode = 'selection' | 'orbit';
bridge.setInteractionMode(mode: DOMInteractionMode): void
bridge.getInteractionMode(): DOMInteractionMode
bridge.release(): void
```

- **`'selection'`** (default): presses mean select text / press button / type,
  and never reach the scene's camera/gesture handlers (capture-phase stop).
- **`'orbit'`**: presses pass through to camera handlers.

Editable bridges forward every native `input` (each keystroke / IME update) and
`change` (commit) as Vecto `'change'` with `{ value }` payloads, and sync the
element value back onto the node before dispatching. IME `compositionstart` /
`update` / `end` ride the same channel with payloads left on the native event.
`release()` removes every listener and is idempotent.

## Gesture pins

```ts
projection.hasActiveGesture(node: Entity): boolean
```

Nodes owning a live press keep `pointerId`s per node id. The scene consults this
during `'auto'` negotiation so a node never flips backends mid-gesture; a node
torn down mid-gesture (explicit flip, removal) drops the pin on `unmount` rather
than reporting a stale gesture forever, since its listeners are gone with the
element. A release arriving without a matching start (press began outside,
released inside) is tolerated.

## Relationship to the a11y mirror

A DOM-resolved node is represented by its live projected element — which carries
role/label via the content sync — not by a transparent mirror.
`Scene.shouldProjectA11y` therefore gates the mirror for `'dom'` (explicit) and
for `'auto'` while negotiated to `'dom'`: the same single-delivery reasoning as
the `DOMPortalEntity` skip. The walk still descends, so canvas-policy
descendants of a DOM container keep their mirrors; only the resident node's own
mirror is gated.

`Entity.domPolicy` (`'canvas'` default), `domKind` (backend creation hint, `''`
means a plain positioned `div`), and `domResident` (backend-owned cache; never
set by hand) are plain data on core — core never materializes an element from
them.

## Limits

- SSR/Node: no root, no residency, canvas fall-through; `getRoot()` is `null`.
- No per-pixel DOM ↔ canvas occlusion (see "Layer rule" above).
- Intrinsic size flows back via `ResizeObserver` with one frame of lag by
  design.
- Opacity composes up the ancestor chain to a bounded depth each update.

## Related

[Projection policy](/reference/projection-policy/) (negotiation, Capability
Matrix, hysteresis, budget) · [a11yRoot & the agent
contract](/reference/core-a11y/) (mirror suppression, `A11yAttributes`) ·
[`Scene`](/reference/core-scene/) (`addProjectionBackend`, `SceneOptions`) ·
[`Entity`](/reference/core-entity/) (`domPolicy`, `domKind`)
