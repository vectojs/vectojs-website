+++
title = "Entity"
description = "The abstract base of every Virtual Math Tree node: transforms, the animation system, capture/bubble events, and the a11y/batching hooks a custom Entity can override."
weight = 3
+++

# `Entity` (abstract)

Part of [`@vectojs/core`](/reference/core-api/).

Base class for every node in the Virtual Math Tree. Subclass and implement
`isPointInside` and `render`.

```ts
abstract class Entity {
  abstract isPointInside(globalX: number, globalY: number): boolean; // MUST implement
  abstract render(renderer: IRenderer): void; // MUST implement
}
```

## Public properties

| Property                     | Type             | Default         | Notes                                                                                                                                                                                 |
| ---------------------------- | ---------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                         | `string`         | `entity_<rand>` | Used as the shadow node id / `data-vecto-id`.                                                                                                                                         |
| `children`                   | `Entity[]`       | `[]`            |                                                                                                                                                                                       |
| `parent`                     | `Entity \| null` | `null`          |                                                                                                                                                                                       |
| `scene`                      | getter           | —               | Walks the parent chain to the owning `Scene` (or `null`).                                                                                                                             |
| `x`, `y`                     | `number`         | `0`             | Local position.                                                                                                                                                                       |
| `scaleX`, `scaleY`           | `number`         | `1`             | Local scale.                                                                                                                                                                          |
| `rotation`                   | `number`         | `0`             | Local rotation, radians.                                                                                                                                                              |
| `opacity`                    | `number`         | `1`             | Multiplied by every ancestor opacity, then applied to normal, batched, WebGPU, and DOM-portal output.                                                                                 |
| `interactive`                | `boolean`        | `false`         | Setter side-effect: flags `a11yNeedsReorder` + `markDirty()`. Gates a11y projection (with `width`).                                                                                   |
| `width`, `height`            | `number`         | `0`             | Hit box / a11y shadow box size (× scale).                                                                                                                                             |
| `clipChildren`               | `boolean`        | `false`         | Clip normal child draws to `[0,0]–[width,height]`; Canvas/SVG are exact. Three uses a world-AABB scissor for rotated/sheared clips. WebGL point/WebGPU overlay paths are not clipped. |
| `a11yOffsetX`, `a11yOffsetY` | `number`         | `0`             | Nudge the shadow node relative to the entity's global position.                                                                                                                       |
| `a11yFullViewport`           | `boolean`        | `false`         | Project a viewport-filling shadow node even with `width === 0`; mounted **behind** all others so on-top components stay clickable.                                                    |
| `isDOMPortal`                | `boolean`        | `false`         | Marks `DOMPortalEntity`; portals are skipped by a11y sync.                                                                                                                            |

> **A11y projection requires a box.** A shadow node is only created when
> `interactive && (width > 0 || a11yFullViewport)`. An interactive entity with
> `width: 0` and no `a11yFullViewport` gets **no** shadow node — set `width`/
> `height`.

## Tree & transform methods

```ts
add(...children: Entity[]): this             // attach one or more children in order; also flags a11yNeedsReorder + markDirty
remove(child: Entity): this
set(props: Partial<this>): this              // assign several own props through their normal setters; returns this
setPosition(x: number, y: number): this
getGlobalPosition(): Point                   // world position; accumulates translate→scale→rotate up to (excluding) root
getWorldTransform(): AffineTransform         // exact accumulated Canvas T·S·R matrix { a,b,c,d,e,f }
localToWorld(localX: number, localY: number): Point
worldToLocal(worldX: number, worldY: number): Point | null // null for a singular transform
getWorldBounds(): Bounds                    // local getBounds() (or width/height) transformed to a world AABB
getWorldScale(): { x: number; y: number }    // product of own + ancestor scale (excl. root)
getWorldRotation(): number                   // sum of own + ancestor rotation (excl. root), radians
getBounds(): Bounds | null                   // local AABB for culling; null (default) = never culled
destroy(): void                              // clear animations + listeners, detach from parent
```

`getWorldScale()` and `getWorldRotation()` are convenience accumulations. Under
nested rotation plus non-uniform scale, the composed matrix can contain shear;
use `getWorldTransform()`, `localToWorld()`, `worldToLocal()`, or
`getWorldBounds()` when exact geometry matters.

Since 1.9.0, `add()` is **variadic** — `parent.add(a, b, c)` attaches each child
in argument order (the single-child path stays O(1)). `set(props)` is a
construction-time ergonomic that assigns several own properties in one call,
each through its normal setter (so a property with a configured `setTransition`
still animates, and `interactive` still flags the a11y reorder): `rect.set({ x:
40, y: 40, width: 120, fill: '#38bdf8' })`. It is a plain `for…in` over the
given object and touches no per-frame path. Both pair naturally with the
[`Rect`/`Circle`/`Group`](/reference/core-entities/) primitives.

## Animation

```ts
// Legacy tween (preserved)
animate(targetProps: Partial<this>, durationMs: number): this
hasPendingAnimations(): boolean

// Animation system (0.2.0)
setTransition(config: Partial<Record<AnimatableProp, MotionConfig>>): this
animateTo(props: Partial<Record<AnimatableProp, number>>, cfg: TweenConfig): Promise<void>
springTo(props: Partial<Record<AnimatableProp, number>>, cfg?: SpringConfig): Promise<void>
```

`animate()` queues a tween; multiple calls **chain sequentially**. Only numeric
properties interpolate; easing is a fixed ease-out (`p * (2 - p)`). A running
`animate()` keeps the scene non-static (escapes the idle throttle, see
[`Scene`](/reference/core-scene/#rendermode-maxfps-and-the-idle-auto-throttle))
and freezes a11y sync until it settles.

`hasPendingAnimations()` is **overridable** and is the Scene's only window into
custom motion: if a subclass integrates its own movement inside `update()` (a
hand-rolled spring or velocity), override it to return `true` while that motion
is in flight — `markDirty()` from inside `update()` is cleared again at the end
of the same tick, so without the override the idle throttle drops the animation
to 2 fps and `onDemand` mode freezes it.

**0.2.0 animation system** — spring-first, unifying tweens and springs:

- `setTransition` declares how the six animatable props (`x`, `y`, `scaleX`,
  `scaleY`, `rotation`, `opacity`) animate; afterward plain assignment
  (`entity.x = 400`) animates them, retargeting in-flight for continuous motion.
  These props are accessors with a zero-overhead fast path when no transition is
  configured — a bare assignment stays a plain field write.
- `animateTo` / `springTo` drive props imperatively and resolve when the motion
  settles; unlike `animate()`, they run concurrently and compose with `await`.
- `MotionConfig = 'spring' | SpringConfig | TweenConfig` (presence of `duration`
  selects a tween). `TweenConfig.easing` takes an `EasingName` from the `Easing`
  export or a custom `(t) => number`.
- Honors `prefers-reduced-motion` (movement snaps, opacity fades). Related:
  `onMounted()` fires when an entity attaches to a live scene — the UI presence
  helper uses it to play enter animations.

See [Physics & Animation](/learn/physics-engine/) for usage.

## Events (`VectoEvent` / capture + bubble)

```ts
type VectoEvent =
  | 'click' | 'dblclick' | 'hover' | 'pointerdown' | 'pointerup' | 'pointercancel' | 'pointermove' | 'pointerleave'
  | 'change' | 'focus' | 'blur' | 'wheel' | 'keydown' | 'keyup' | 'scroll';

on(event: VectoEvent, cb: (e: any) => void, options?: { capture?: boolean }): this
off(event: VectoEvent, cb: (e: any) => void, options?: { capture?: boolean }): this
emit(event: VectoEvent, payload: any): void          // self-only, bubble-phase listeners (legacy/component-internal)
dispatchEvent(event: VectoJSEvent): void             // DOM-style capture (root→target) then bubble (target→root)
```

- `on`/`off` default to the **bubble** phase; pass `{ capture: true }` for the
  capture phase. Bubble listeners also fire for the legacy `emit()` path.
- `VectoJSEvent<N>` wraps a `nativeEvent` and adds `target`, `currentTarget`,
  `bubbles`, `stopPropagation()`, `stopImmediatePropagation()`,
  `preventDefault()`, viewport `clientX/Y`, logical `sceneX/Y`, current-target
  `localX/Y`, modifier keys, and pass-throughs (`deltaX/Y`, `key`,
  `defaultPrevented`). Local coordinates invert the complete nested affine
  transform. A non-bubbling event still runs the capture phase but only fires
  its target in the bubble phase.
- `'change'` from a form-control shadow `<input>` carries `{ value, checked,
selectionStart, selectionEnd, composition }` where `composition` is `{ start,
length } | null` for the active IME pre-edit. `'wheel'` carries the native
  `WheelEvent` (call `preventDefault()` to stop page scroll).
- `'dblclick'` fires on a double click (native `detail === 2`).
- `'scroll'` carries a `ScrollEventPayload` — the only way an entity observes
  its shadow mirror's scroll offset: `{ scrollTop, scrollLeft, deltaY,
deltaX, maxScrollTop }`. Fires from scrollable content mirrors (e.g. a
  `ScrollView` shadow node) as the browser scrolls them.

See [Events & Hit-Testing](/learn/events/) for usage.

## A11y / batching hooks (override to opt in)

```ts
getA11yAttributes(): A11yAttributes          // default {} → a plain transparent <div>
getBatchCircle(): BatchCircle | null         // { radius, color } → renderer fillCircle fast-path (uniform-scale leaves)
getBatchRect(): BatchRect | null             // { width, height, color } → GPU indexed-quad batch (WebGL pointBackend only)
update(dt: number, time: number): void       // optional override; dt is MILLISECONDS, time is performance.now(); default advances queued tweens
focus(): void                                // focus the projected a11y shadow element (retries once after the next rAF if not yet projected)
```

`entity.a11yRegion: boolean` (default `false`) marks the entity as an a11y
**grouping region**: descendants project into a shared container instead of
nested independently, so a pure grouping container (e.g. `width: 0`) still
groups — the nearest enclosing region wins and regions nest. Declarative, never
consulted by geometry.

`getBatchCircle`/`getBatchRect` are read **every frame** (animated color/radius
honored). A representable batched leaf skips its own
`save/translate/scale/rotate/render/restore`; Canvas mode or an unsupported
accumulated affine transform uses the entity's normal `render()` fallback.

See [a11yRoot & the agent contract](/reference/core-a11y/) for the full
`A11yAttributes` shape and how the shadow-DOM sync works.

## Related

[`Scene`](/reference/core-scene/) (owns the tree) ·
[Renderers](/reference/core-renderer/) (`Entity.getContentProjection()`) ·
[a11yRoot & the agent contract](/reference/core-a11y/) · [`@vectojs/core`
overview](/reference/core-api/)
