+++
title = "ComputeParticleEntity"
description = "高吞吐量粒子层：每粒子 Float32Array 内存布局、弹簧/阻尼/爆炸 CPU 模拟，以及带自动 CPU 回退的 WebGPU 计算路径。"
weight = 6

[extra]
order = 6
+++

# `ComputeParticleEntity` —— 高吞吐量粒子层

属于 [`@vectojs/core`](/reference/core-api/)。

```ts
new ComputeParticleEntity(options?: ComputeParticleOptions)
```

| 选项            | 默认        | 含义                                               |
| --------------- | ----------- | -------------------------------------------------- |
| `maxParticles`  | `10000`     | 粒子数量。                                         |
| `springK`       | `0.05`      | 拉回原点的弹簧力（钳制 0–10）。                    |
| `damping`       | `0.95`      | 速度阻尼（0–1）。                                  |
| `bounceDamping` | `0.5`       | 保留的边界反弹能量（0–1）。                        |
| `maxVelocity`   | `500`       | 速度钳制。                                         |
| `size`          | `4`         | 基础粒子大小（px）。                               |
| `color`         | `'#00f0ff'` | CSS 颜色（`baseColor`）。                          |
| `pointerEvents` | `false`     | 该层是否捕获命中事件（`isPointInside` 返回此值）。 |

## 每粒子内存布局

`particleData: Float32Array`，长度为 `maxParticles × PARTICLE*STRIDE*FLOATS`（`PARTICLE*STRIDE*FLOATS = 8`）。每个粒子 8 个 float：

| 偏移常量                     | 索引 | 字段                                                         |
| ---------------------------- | ---- | ------------------------------------------------------------ |
| `PARTICLE_OFFSET_POSITION_X` | 0    | position.x                                                   |
| `PARTICLE_OFFSET_POSITION_Y` | 1    | position.y                                                   |
| `PARTICLE_OFFSET_VELOCITY_X` | 2    | velocity.x                                                   |
| `PARTICLE_OFFSET_VELOCITY_Y` | 3    | velocity.y                                                   |
| `PARTICLE_OFFSET_ORIGIN_X`   | 4    | origin.x（弹簧锚点）                                         |
| `PARTICLE_OFFSET_ORIGIN_Y`   | 5    | origin.y                                                     |
| `PARTICLE_OFFSET_SIZE`       | 6    | size                                                         |
| `PARTICLE_OFFSET_LIFE`       | 7    | life：`-1` = 永久，`>=0` 以 `0.5/s` 衰减，`0` = 死亡（跳过） |

## 方法

```ts
initRandomParticles(width, height): void      // scatter across the box; life = -1 (perpetual); marks dirty
setOrigins(points: Float32Array | number[], requestPositionReset = true): void
setPositions(positions: Float32Array | number[]): void
setVelocities(velocities: Float32Array | number[]): void
triggerExplosion(x, y, force): void           // queues an impulse for the next step (radius 150px)
updateCPU(dt, mouseX, mouseY, width, height): void   // CPU sim step; dt in SECONDS, clamped [0,0.1]
destroyGPUResources(): void
```

每步 CPU 模拟：弹簧到原点 + 鼠标排斥（在活动光标 120px 内；光标"关闭"为 `< -9000`）+ 待定爆炸（在 150px 内）→ 积分 → 速度钳制 → 边界反弹 + 钳制 → 生命衰减。有 NaN 保护。

## WebGPU 对比 CPU

当 `particleBackend` 允许（参见 [`SceneOptions`](/reference/core-scene/#sceneoptions)）且 WebGPU 设备初始化成功时，Scene 将计算 + 渲染过程运行到一个专用的 WebGPU canvas 中；否则它调用 `updateCPU` 并通过 `fillCircle` / 可选的 [WebGL point 层](/reference/core-renderer/#webgl-point-层) 绘制。`gpuStorageBuffer` 非 null 确认资源已分配，但在异步设备丢失后它不是一个持久的"当前活动"状态。GPU 资源（`gpuStorageBuffer`、`gpuUniformBuffer`、`computeBindGroup`、`renderBindGroup`）和 `needsInit` 对后端作者公开。

> WebGPU 初始化是惰性的（`ComputeParticleEntity` 出现的第一帧）且异步的，带设备丢失自动恢复。在依赖模拟之前通过 `scene.resize(w, h)` 设置视口 —— `0×0` 的盒子不产生运动。

粒子位置是场景空间的。Canvas CPU 路径参与实体变换栈；独立的 WebGL/WebGPU 覆盖路径不应用实体的平移/缩放/旋转或父级裁剪。所有路径都继承不透明度。

参见[粒子系统](/learn/particles/)了解用法。

## 相关

[`Scene`](/reference/core-scene/)（`particleBackend` 选项）·
[渲染器](/reference/core-renderer/)（WebGL point 层回退）·
[`@vectojs/core` 概述](/reference/core-api/)
