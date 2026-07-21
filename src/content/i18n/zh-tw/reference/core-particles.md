---
title: 'ComputeParticleEntity'
description: '高吞吐量粒子層：每個粒子的 Float32Array 記憶體布局、彈簧/阻尼/爆炸 CPU 模擬，以及具有自動 CPU 回退的 WebGPU 計算路徑。'
order: 6
---

# `ComputeParticleEntity` — 高吞吐量粒子層

屬於 [`@vectojs/core`](/reference/core-api/)。

```ts
new ComputeParticleEntity(options?: ComputeParticleOptions)
```

| 選項            | 預設值      | 說明                                                 |
| --------------- | ----------- | ---------------------------------------------------- |
| `maxParticles`  | `10000`     | 粒子數量。                                           |
| `springK`       | `0.05`      | 彈簧拉力回原點（限制在 0–10）。                      |
| `damping`       | `0.95`      | 速度阻尼（0–1）。                                    |
| `bounceDamping` | `0.5`       | 邊界反彈保留的能量（0–1）。                          |
| `maxVelocity`   | `500`       | 速度限制。                                           |
| `size`          | `4`         | 基礎粒子尺寸（px）。                                 |
| `color`         | `'#00f0ff'` | CSS 顏色（`baseColor`）。                            |
| `pointerEvents` | `false`     | 此圖層是否捕獲點擊事件（`isPointInside` 回傳此值）。 |

## 每個粒子的記憶體布局

`particleData: Float32Array`，長度為 `maxParticles × PARTICLE*STRIDE*FLOATS`
（`PARTICLE*STRIDE*FLOATS = 8`）。每個粒子 8 個浮點數：

| 偏移常數                     | 索引 | 欄位                                                         |
| ---------------------------- | ---- | ------------------------------------------------------------ |
| `PARTICLE*OFFSET*POSITION_X` | 0    | position.x                                                   |
| `PARTICLE*OFFSET*POSITION_Y` | 1    | position.y                                                   |
| `PARTICLE*OFFSET*VELOCITY_X` | 2    | velocity.x                                                   |
| `PARTICLE*OFFSET*VELOCITY_Y` | 3    | velocity.y                                                   |
| `PARTICLE*OFFSET*ORIGIN_X`   | 4    | origin.x（彈簧錨點）                                         |
| `PARTICLE*OFFSET*ORIGIN_Y`   | 5    | origin.y                                                     |
| `PARTICLE*OFFSET*SIZE`       | 6    | size                                                         |
| `PARTICLE*OFFSET*LIFE`       | 7    | life：`-1` = 永久，`>=0` 以 `0.5/s` 衰減，`0` = 死亡（略過） |

## 方法

```ts
initRandomParticles(width, height): void      // 散布在方塊內；life = -1（永久）；標記髒
setOrigins(points: Float32Array | number[], requestPositionReset = true): void
setPositions(positions: Float32Array | number[]): void
setVelocities(velocities: Float32Array | number[]): void
triggerExplosion(x, y, force): void           // 為下一步排入衝量（半徑 150px）
updateCPU(dt, mouseX, mouseY, width, height): void   // CPU 模擬步驟；dt 為秒，限制在 [0,0.1]
destroyGPUResources(): void
```

每步 CPU 模擬：彈簧回原點 + 滑鼠斥力（距離活躍游標 120px 內；游標「關閉」為 `< -9000`）+ 待處理爆炸（150px 內）→ 積分
→ 速度限制 → 邊界反彈 + 限制 → 生命值衰減。具 NaN 防護。

## WebGPU 與 CPU 比較

當 `particleBackend` 允許時（請參閱 [`SceneOptions`](/reference/core-scene/#sceneoptions)）
且 WebGPU 裝置初始化成功時，Scene 會將計算 + 渲染傳遞至
專用的 WebGPU canvas；否則它會呼叫 `updateCPU` 並透過
`fillCircle` / 可選的 [WebGL point layer](/reference/core-renderer/#webgl-point-layer) 繪製。
`gpuStorageBuffer` 非 null 確認資源已分配，
但在非同步裝置遺失後，它並非持續的「當前活躍」狀態。
GPU 資源（`gpuStorageBuffer`、`gpuUniformBuffer`、
`computeBindGroup`、`renderBindGroup`）和 `needsInit` 為公開屬性，供後端
開發者使用。

> WebGPU 初始化是惰性的（在 `ComputeParticleEntity` 出現的第一幀）且為非同步，
> 具有裝置遺失自動恢復功能。在依賴模擬前，請先透過 `scene.resize(w, h)` 設定視口
> — 尺寸為 `0×0` 的方塊不會產生任何運動。

粒子位置位於場景空間中。Canvas CPU 路徑參與
實體變換堆疊；獨立的 WebGL/WebGPU overlay 路徑不套用
實體的平移/縮放/旋轉或父裁剪。所有路徑上都繼承不透明度。

用法請參閱 [Particle Systems](/learn/particles/)。

## 相關

[`Scene`](/reference/core-scene/)（`particleBackend` 選項）·
[Renderers](/reference/core-renderer/)（WebGL point layer 回退）·
[`@vectojs/core` 概覽](/reference/core-api/)
