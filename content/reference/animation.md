+++
title = "Animation (@vectojs/animation)"
description = "Property drivers, tweens, springs, and easing curves — the engine behind Entity.animate(), setTransition(), animateTo() and springTo()."
weight = 54
+++

# `@vectojs/animation`

The standalone animation engine: property drivers for smooth numeric motion, a
curated easing set, and the `MotionConfig` shape that every VectoJS motion
surface shares. `@vectojs/core` depends on and **re-exports** it, so most apps
never import this package directly — `entity.setTransition({ x: 'spring' })`,
`entity.animateTo(...)`, `entity.springTo(...)` and `entity.animate({...}, ms)`
are the entry points (see [`core-entity` # Animation](/reference/core-entity/#animation)).
Import it directly to build custom drivers or use the easings standalone:

```ts
import { TweenDriver, SpringDriver, Easing, EASING_IDS } from '@vectojs/animation';
```

## MotionConfig — the shared config shape

```ts
type MotionConfig = 'spring' | SpringConfig | TweenConfig;

interface TweenConfig {
  duration: number; // ms (required — its presence selects a tween)
  easing?: EasingName | EasingFn; // named curve or custom fn, default 'linear'
  delay?: number; // ms before the tween starts, default 0
}

interface SpringConfig {
  stiffness?: number; // default 180
  damping?: number; // default 12
  mass?: number; // default 1
}
```

The discriminating rule: a config with `duration` is a tween, anything else is a
spring (`isTweenConfig(c)` implements exactly this). A bare `'spring'` string
means "default spring".

## Drivers (`PropertyDriver`)

```ts
interface PropertyDriver {
  value: number; // current value
  readonly target: number; // destination — applied exactly on completion
  retarget(to: number): void; // change destination; spring keeps velocity, tween restarts
  tick(dtMs: number): void; // advance by dt in milliseconds
  isDone(): boolean;
  syncExternal(value: number, extra: number): void; // adopt externally-advanced state
}
```

- **`TweenDriver(from, to, config: TweenConfig)`** — eased interpolation from
  `from` to `to` over `duration` ms, with optional `delay`. `retarget()`
  changes the destination without re-charging a consumed delay: segments run on
  the monotonic elapsed clock (retargeting during the initial delay still waits
  out only the remaining part), so rapid retargets cannot starve an animation
  indefinitely.
- **`SpringDriver(from, to, config?: SpringConfig)`** — mass-spring-damper
  integration (backed by `@vectojs/math` `SpringPhysics`). `retarget()` keeps
  velocity, so retargeting mid-flight is continuous. `target` is applied
  **exactly** on completion rather than within a rest epsilon.
- `syncExternal(value, extra)` adopts state advanced elsewhere (e.g. a WASM
  batched tick): `extra` is velocity for a spring, elapsed-ms for a tween —
  after the call, `value`/`tick()`/`isDone()`/`retarget()` all stay correct.

**Loud construction and tick guards.** A driver that silently mis-configures
never settles and hangs every `await` on its completion:

- `TweenDriver` rejects unknown easing-name strings at construction (they
  previously crashed with a bare `TypeError` on the first tick), and
  `tick(dt)` ignores NaN, zero, and negative dt — the elapsed clock is never
  poisoned, and the WASM batched tween kernel declines the same steps the same
  way, so both engines recover on the next valid frame.
- `SpringDriver` rejects non-finite or non-positive `stiffness`/`damping`/
  `mass` at construction instead of silently falling back to physics defaults
  — such springs diverge or never settle.
- `isTweenConfig(null)` returns `false`; the discriminator exists to handle
  untrusted runtime configs.

## Easing

```ts
type EasingFn = (t: number) => number; // normalized [0,1] → eased progress
type EasingName = keyof typeof Easing; // built-in curve names

Easing.linear | Easing.easeInQuad | Easing.easeOutQuad | Easing.easeInOutQuad;
Easing.easeInCubic | Easing.easeOutCubic | Easing.easeInOutCubic;
Easing.easeOutBack | Easing.easeInOutBack;
```

Every built-in curve maps f(0)=0, f(1)=1 and is written with explicit
multiplication so it matches the WASM `ease()` kernel **bit-for-bit** — a
batched tween is not merely close to its JS twin, it is exactly equal.
`EASING_IDS` maps each name to its numeric id (used to tell a named-easing
tween — batchable — from a custom `EasingFn` closure, which cannot cross into
WASM). Custom functions are allowed anywhere a named curve is: `easing: (t) =>
t * t * (3 - 2 * t)`.

## Relation to `Entity` motion

| Surface                                         | Uses                                       |
| ----------------------------------------------- | ------------------------------------------ |
| `setTransition({ prop: 'spring' })` then assign | a `SpringDriver` per property              |
| `animateTo({...}, duration, easing)`            | `TweenDriver`s                             |
| `springTo({...}, config?)`                      | `SpringDriver`s                            |
| `animate({...}, ms)`                            | tweens over the six built-in numeric props |

`animate()` only interpolates `x | y | scaleX | scaleY | rotation | opacity`
— custom fields are not driven (see [`core-entity`](/reference/core-entity/#animation)).
