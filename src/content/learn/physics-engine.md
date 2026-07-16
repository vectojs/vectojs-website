---
title: 'Physics & Animation'
description: 'Apply spring physics, velocity, and force-directed simulation to any entity in the VMT.'
order: 11
---

# Physics & Animation

VectoJS goes beyond static layout. Because the UI lives in a Virtual Math Tree, you can apply **continuous force-directed physics** to any component — including standard `Button`s and `Input`s.

## Built-in Tweening: `entity.animate()`

The simplest motion tool. `animate()` queues smooth ease-out tweens on any numeric property:

```typescript
button.animate({ x: 200, opacity: 0.5 }, 500);

// Chains are sequential, not concurrent:
button.animate({ x: 400 }, 300).animate({ y: 200 }, 300).animate({ opacity: 0 }, 200);
```

While a tween is running, the scene is kept non-static — no need to call `markDirty()`. When the tween settles, `hasPendingAnimations()` returns `false`.

> [!TIP]
> Chains are sequential (`animate` returns `this`), not concurrent. For concurrent motion, richer easing, springs, and enter/exit on components, use the animation system below.

## Declarative & imperative animation

Added in **0.2.0**, the animation system is spring-first and unifies tweens and springs behind one API — the recommended way to animate any entity's transform or opacity. It's the same engine the built-in components (Modal, Tooltip, …) use to animate themselves.

### Declarative transitions

Declare which properties animate and how; then plain assignment animates them:

```typescript
entity.setTransition({
  opacity: 'spring', // default spring
  x: { duration: 300, easing: 'easeOutCubic' }, // tween
  scaleX: { stiffness: 200, damping: 18 }, // spring with overrides
});

entity.opacity = 1; // springs to 1
entity.x = 400; // tweens over 300ms
```

Assigning a new target mid-flight **retargets** the running animation — a spring keeps its velocity — so rapidly toggled or gesture-driven UI flows continuously instead of snapping. Properties with no configured transition are written immediately through the normal setter, without creating a driver. The animatable properties are `x`, `y`, `scaleX`, `scaleY`, `rotation`, and `opacity`.

### Imperative one-shots

For choreography, `animateTo` (tween) and `springTo` (spring) drive properties directly and return a Promise that resolves when the motion settles:

```typescript
await entity.animateTo({ x: 400, opacity: 0 }, { duration: 500, easing: 'easeOutCubic' });
await entity.springTo({ scaleX: 1, scaleY: 1 }, { stiffness: 200, damping: 18 });
```

Unlike `animate()` (which chains sequentially), these run concurrently and compose with `async`/`await`.

### Easing

The `Easing` export provides a curated set of curves — `linear`, `easeInOut{Quad,Cubic}`, `easeOut{Quad,Cubic}`, `easeOutBack` (overshoot), and more. Pass a curve name, or your own `(t: number) => number` function, to any tween's `easing` option.

### Reduced motion

The system honors the OS **prefers-reduced-motion** setting automatically: movement (transforms, springs) snaps to its target while opacity fades are preserved — components still appear and disappear, just without motion. No per-component code required.

> [!TIP]
> Components animate their own enter/exit through this system. Any `UIComponent` subclass can declare `enterMotion`/`exitMotion` and call `dismiss()` to animate out and then unmount — see the [UI Components reference](/reference/ui-components/).

## SpringPhysics

`SpringPhysics` is a damped spring for smooth, physical-feeling numeric transitions:

```typescript
import { SpringPhysics } from '@vectojs/core';

const spring = new SpringPhysics(0);   // initial value = 0
spring.stiffness = 180;
spring.damping = 18;

// Set target at any time (e.g. on hover)
spring.target = 1.0;

// In your entity's update():
update(dt: number) {
  spring.update(dt);
  this.opacity = spring.value;
  if (!spring.isAtRest()) this.scene?.markDirty();
}
```

Use `SpringPhysics` instead of `animate()` when the target changes continuously (cursor tracking, scroll momentum, interactive drag).

## Manual Physics on Entities

Every `Entity` has `x`/`y` and `update(dt, time)`. You can implement any physics model by overriding `update`:

```typescript
import { Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

class BallEntity extends Entity {
  vx = (Math.random() - 0.5) * 200;
  vy = (Math.random() - 0.5) * 200;
  friction = 0.97;

  constructor(public radius: number) {
    super();
    this.width = this.height = radius * 2;
  }

  applyForce(fx: number, fy: number) {
    this.vx += fx;
    this.vy += fy;
  }

  override update(dt: number) {
    super.update(dt); // advance queued animate() tweens
    const seconds = dt / 1000;
    this.x += this.vx * seconds;
    this.y += this.vy * seconds;
    this.vx *= this.friction;
    this.vy *= this.friction;
  }

  isPointInside(gx: number, gy: number) {
    const local = this.worldToLocal(gx, gy);
    if (!local) return false;
    return (local.x - this.radius) ** 2 + (local.y - this.radius) ** 2 <= this.radius ** 2;
  }

  render(r: IRenderer) {
    r.beginPath();
    r.arc(this.radius, this.radius, this.radius, 0, Math.PI * 2);
    r.fill('#6366f1');
  }
}
```

## Elastic Boundaries

Bounce entities off the viewport edges with a simple dampening factor:

```typescript
const BOUNCE = 0.75;

override update(dt: number) {
  super.update(dt);
  const seconds = dt / 1000;
  this.x += this.vx * seconds;
  this.y += this.vy * seconds;

  const { width, height } = this.scene!;

  if (this.x < 0) { this.x = 0; this.vx = Math.abs(this.vx) * BOUNCE; }
  if (this.x + this.width > width) {
    this.x = width - this.width;
    this.vx = -Math.abs(this.vx) * BOUNCE;
  }
  if (this.y < 0) { this.y = 0; this.vy = Math.abs(this.vy) * BOUNCE; }
  if (this.y + this.height > height) {
    this.y = height - this.height;
    this.vy = -Math.abs(this.vy) * BOUNCE;
  }
}
```

This pattern is appropriate for small application-managed collections. The Nexus demo instead uses `ComputeParticleEntity`'s fixed spring/mouse/explosion model; it does not simulate entity-to-entity interaction.

## SpatialHashGrid: Application-Managed Neighbor Candidates

For N-body interactions (repulsion, collision), a naive pairwise loop is O(N²). Use `SpatialHashGrid` to retrieve candidates from the cells overlapped by a query, then run exact tests on that smaller set:

```typescript
import { SpatialHashGrid } from '@vectojs/core';

const grid = new SpatialHashGrid(64); // cell size in world units

// Every frame: rebuild grid, then query
for (const ball of balls) {
  grid.insert(ball.id, ball.x, ball.y, ball.width, ball.height);
}

for (const ball of balls) {
  const nearby = grid.query(ball.x - 50, ball.y - 50, 100, 100);
  for (const otherId of nearby) {
    if (otherId === ball.id) continue;
    // apply repulsion between ball and balls[otherId]
  }
}

grid.clear(); // call once per frame before re-inserting
```

Use this pattern yourself when you need real neighbor interaction (ball-vs-ball collision, flocking, repulsion between entities). Note that `ComputeParticleEntity` does **not** use `SpatialHashGrid` internally — its simulation (GPU or CPU) only computes forces relative to fixed points (spring origin, mouse, explosion center), not entity-vs-entity. If you need both high particle counts _and_ real neighbor interaction, you're combining two things the engine doesn't do for you together: you'd run your own `SpatialHashGrid`-based neighbor query on the CPU (as above), or write a custom WGSL compute pass with a neighbor query baked in for the GPU path.

> [!WARNING]
> Rebuild the hash grid every frame. Stale grid data from a previous frame will produce incorrect neighbor queries and phantom collisions.

## High-Throughput Particles: `ComputeParticleEntity`

For tens of thousands of particles with spring-to-origin + mouse repulsion, use `ComputeParticleEntity`. It automatically uses WebGPU compute shaders when available, falling back to CPU:

```typescript
import { ComputeParticleEntity } from '@vectojs/core';

const particles = new ComputeParticleEntity({
  maxParticles: 15000,
  springK: 0.05,
  damping: 0.95,
  size: 3,
  color: '#6366f1',
});

// Scatter particles across the viewport
particles.initRandomParticles(scene.width, scene.height);
scene.add(particles);
scene.start();

// Animate particles toward new origin positions (e.g. spell out text)
particles.setOrigins(newPositions);
```

> [!CAUTION]
> Always call `scene.resize(width, height)` or let the Scene auto-resize before `initRandomParticles`. A `0×0` viewport produces no initial positions and particles will never move.

See the [Core API Reference](/reference/core-api/) for the full `ComputeParticleEntity` memory layout and WebGPU internals.
