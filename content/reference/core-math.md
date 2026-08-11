+++
title = "Math utilities"
description = "SpatialHashGrid for O(1)-average broad-phase spatial queries and SpringPhysics for a single-value critically-tunable spring — the standalone @vectojs/math package, re-exported by @vectojs/core."
weight = 9

[extra]
order = 9
+++

# Math utilities — `@vectojs/math`

`SpatialHashGrid` and `SpringPhysics` are the standalone **`@vectojs/math`**
package (a leaf package with no dependencies). [`@vectojs/core`](/reference/core-api/)
depends on and re-exports it, so it resolves from either `@vectojs/math` or
`@vectojs/core`. The spring integrator here also backs `SpringDriver` in
[`@vectojs/animation`](/reference/core-api/#entry-points--module-map).

```ts
new SpatialHashGrid(cellSize = ...)
grid.insert(id, x, y, w, h): void   // safe to call every frame (re-keys old cells)
grid.remove(id): void
grid.query(x, y, w, h): Set<string> // O(k) cells + results; O(1) avg for small uniform entities
grid.clear(): void                  // call once per frame before re-inserting dynamics
```

A broad-phase spatial index for hit-testing or collision candidate queries over
many moving entities — bucket entities by cell on insert, then `query()` a
region to get only the ids that could possibly overlap it, instead of scanning
every entity. `insert()` is idempotent-safe to call every frame even for an
entity that already exists (it re-keys out of stale cells), which is the usual
pattern: `clear()` once per frame, `insert()` every dynamic entity, then
`query()` as needed for that frame's hit-tests or collision checks.

```ts
new SpringPhysics(initial: number)
spring.value / spring.target / spring.velocity
spring.stiffness / spring.damping / spring.mass
spring.update(dt): void
spring.isAtRest(): boolean
```

A single-value critically-damped-tunable spring integrator — set `spring.target`,
call `update(dt)` every frame, read `spring.value`. This is the primitive
`Entity`'s built-in [`springTo()`](/reference/core-entity/#animation) is built
on; use it directly for a value that isn't one of the six animatable `Entity`
props (a custom shader uniform, a camera field, an application-level scalar).
`isAtRest()` reports when both velocity and the distance to target have decayed
below the engine's rest thresholds, so a caller can stop calling `update()`.

## Related

[`Entity`](/reference/core-entity/#animation) (`springTo`, built on `SpringPhysics`) ·
[`@vectojs/core` overview](/reference/core-api/)
