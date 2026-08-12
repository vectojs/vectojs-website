+++
title = "ComputeParticleEntity"
description = "The high-throughput particle layer: per-particle Float32Array memory layout, spring/damping/explosion CPU simulation, and the WebGPU compute path with automatic CPU fallback."
weight = 6
+++

# `ComputeParticleEntity` — high-throughput particle layer

Part of [`@vectojs/core`](/reference/core-api/).

```ts
new ComputeParticleEntity(options?: ComputeParticleOptions)
```

| Option          | Default     | Meaning                                                               |
| --------------- | ----------- | --------------------------------------------------------------------- |
| `maxParticles`  | `10000`     | Particle count.                                                       |
| `springK`       | `0.05`      | Spring pull back to origin (clamped 0–10).                            |
| `damping`       | `0.95`      | Velocity damping (0–1).                                               |
| `bounceDamping` | `0.5`       | Boundary bounce energy retained (0–1).                                |
| `maxVelocity`   | `500`       | Speed clamp.                                                          |
| `size`          | `4`         | Base particle size (px).                                              |
| `color`         | `'#00f0ff'` | CSS color (`baseColor`).                                              |
| `pointerEvents` | `false`     | Whether the layer captures hit events (`isPointInside` returns this). |

## Per-particle memory layout

`particleData: Float32Array` of length `maxParticles × PARTICLE_STRIDE_FLOATS`
(`PARTICLE_STRIDE_FLOATS = 8`). Per particle, 8 floats:

| Offset const                 | Index | Field                                                                 |
| ---------------------------- | ----- | --------------------------------------------------------------------- |
| `PARTICLE_OFFSET_POSITION_X` | 0     | position.x                                                            |
| `PARTICLE_OFFSET_POSITION_Y` | 1     | position.y                                                            |
| `PARTICLE_OFFSET_VELOCITY_X` | 2     | velocity.x                                                            |
| `PARTICLE_OFFSET_VELOCITY_Y` | 3     | velocity.y                                                            |
| `PARTICLE_OFFSET_ORIGIN_X`   | 4     | origin.x (spring anchor)                                              |
| `PARTICLE_OFFSET_ORIGIN_Y`   | 5     | origin.y                                                              |
| `PARTICLE_OFFSET_SIZE`       | 6     | size                                                                  |
| `PARTICLE_OFFSET_LIFE`       | 7     | life: `-1` = perpetual, `>=0` decays at `0.5/s`, `0` = dead (skipped) |

## Methods

```ts
initRandomParticles(width, height): void      // scatter across the box; life = -1 (perpetual); marks dirty
setOrigins(points: Float32Array | number[], requestPositionReset = true): void
setPositions(positions: Float32Array | number[]): void
setVelocities(velocities: Float32Array | number[]): void
triggerExplosion(x, y, force): void           // queues an impulse for the next step (radius 150px)
updateCPU(dt, mouseX, mouseY, width, height): void   // CPU sim step; dt in SECONDS, clamped [0,0.1]
destroyGPUResources(): void
```

CPU sim per step: spring-to-origin + mouse repulsion (within 120px of a live
cursor; cursor "off" is `< -9000`) + pending explosion (within 150px) → integrate
→ velocity clamp → boundary bounce + clamp → life decay. NaN-guarded.

## WebGPU vs CPU

When `particleBackend` allows it (see [`SceneOptions`](/reference/core-scene/#sceneoptions))
and a WebGPU device initializes, the Scene runs compute + render passes into a
dedicated WebGPU canvas; otherwise it calls `updateCPU` and draws through
`fillCircle` / the optional [WebGL point layer](/reference/core-renderer/#webgl-point-layer).
`gpuStorageBuffer` being non-null confirms that resources were allocated, but it
is not a durable "currently active" status after asynchronous device loss.
GPU resources (`gpuStorageBuffer`, `gpuUniformBuffer`,
`computeBindGroup`, `renderBindGroup`) and `needsInit` are public for backend
authors.

> WebGPU init is lazy (first frame a `ComputeParticleEntity` appears) and async,
> with device-loss auto-recovery. Set viewport via `scene.resize(w, h)` before relying
> on the sim — a `0×0` box produces no motion.

Particle positions are scene-space. The Canvas CPU path participates in the
entity transform stack; the separate WebGL/WebGPU overlay paths do not apply
entity translation/scale/rotation or parent clipping. Opacity is inherited on
all paths.

See [Particle Systems](/learn/particles/) for usage.

## Related

[`Scene`](/reference/core-scene/) (`particleBackend` option) ·
[Renderers](/reference/core-renderer/) (WebGL point layer fallback) ·
[`@vectojs/core` overview](/reference/core-api/)
