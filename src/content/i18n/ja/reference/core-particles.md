---
title: 'ComputeParticleEntity'
description: '高スループットパーティクルレイヤー：パーティクルごとのFloat32Arrayメモリレイアウト、スプリング/ダンピング/爆発CPUシミュレーション、および自動CPUフォールバック付きWebGPUコンピュートパス。'
order: 6
---

# `ComputeParticleEntity` — 高スループットパーティクルレイヤー

[`@vectojs/core`](/reference/core-api/) の一部です。

```ts
new ComputeParticleEntity(options?: ComputeParticleOptions)
```

| オプション      | デフォルト  | 意味                                                                                     |
| --------------- | ----------- | ---------------------------------------------------------------------------------------- |
| `maxParticles`  | `10000`     | パーティクル数。                                                                         |
| `springK`       | `0.05`      | 原点へのスプリング引き戻し（0–10にクランプ）。                                           |
| `damping`       | `0.95`      | 速度ダンピング（0–1）。                                                                  |
| `bounceDamping` | `0.5`       | 境界バウンドで保持されるエネルギー（0–1）。                                              |
| `maxVelocity`   | `500`       | 速度クランプ。                                                                           |
| `size`          | `4`         | 基本パーティクルサイズ（px）。                                                           |
| `color`         | `'#00f0ff'` | CSS色（`baseColor`）。                                                                   |
| `pointerEvents` | `false`     | レイヤーがヒットイベントをキャプチャするかどうか（`isPointInside` はこの値を返します）。 |

## パーティクルごとのメモリレイアウト

`particleData: Float32Array`、長さは `maxParticles × PARTICLE_STRIDE_FLOATS`（`PARTICLE_STRIDE_FLOATS = 8`）。パーティクルごとに8つの浮動小数点数：

| オフセット定数               | インデックス | フィールド                                                         |
| ---------------------------- | ------------ | ------------------------------------------------------------------ |
| `PARTICLE_OFFSET_POSITION_X` | 0            | position.x                                                         |
| `PARTICLE_OFFSET_POSITION_Y` | 1            | position.y                                                         |
| `PARTICLE_OFFSET_VELOCITY_X` | 2            | velocity.x                                                         |
| `PARTICLE_OFFSET_VELOCITY_Y` | 3            | velocity.y                                                         |
| `PARTICLE_OFFSET_ORIGIN_X`   | 4            | origin.x（スプリングアンカー）                                     |
| `PARTICLE_OFFSET_ORIGIN_Y`   | 5            | origin.y                                                           |
| `PARTICLE_OFFSET_SIZE`       | 6            | size                                                               |
| `PARTICLE_OFFSET_LIFE`       | 7            | life：`-1` = 永続、`>=0` は `0.5/s` で減衰、`0` = 死亡（スキップ） |

## メソッド

```ts
initRandomParticles(width, height): void      // ボックス全体に散布。life = -1（永続）。ダーティをマーク
setOrigins(points: Float32Array | number[], requestPositionReset = true): void
setPositions(positions: Float32Array | number[]): void
setVelocities(velocities: Float32Array | number[]): void
triggerExplosion(x, y, force): void           // 次のステップのためのインパルスをキュー（半径150px）
updateCPU(dt, mouseX, mouseY, width, height): void   // CPUシミュレーションステップ。dtは秒単位、[0,0.1]にクランプ
destroyGPUResources(): void
```

CPUシミュレーションの各ステップ：スプリング-to-原点 + マウス反発（ライブカーソルから120px以内；カーソル「オフ」は `< -9000`）+ 保留中の爆発（150px以内）→ 積分 → 速度クランプ → 境界バウンド + クランプ → ライフ減衰。NaNガード付き。

## WebGPU vs CPU

`particleBackend` が許可し（[`SceneOptions`](/reference/core-scene/#sceneoptions) を参照）、WebGPUデバイスが初期化された場合、Sceneはコンピュート + レンダーパスを専用のWebGPUキャンバスで実行します；それ以外の場合は `updateCPU` を呼び出し、`fillCircle` / オプションの [WebGL ポイントレイヤー](/reference/core-renderer/#webgl-ポイントレイヤー) を通じて描画します。`gpuStorageBuffer` が非 null であることでリソースが割り当てられたことが確認できますが、これは非同期のデバイス喪失後も永続的な「現在アクティブ」ステータスではありません。GPUリソース（`gpuStorageBuffer`、`gpuUniformBuffer`、`computeBindGroup`、`renderBindGroup`）および `needsInit` はバックエンド作者向けに公開されています。

> WebGPUの初期化は遅延（`ComputeParticleEntity` が現れる最初のフレーム）かつ非同期で、デバイス喪失の自動復旧機能があります。シミュレーションに依存する前に `scene.resize(w, h)` でビューポートを設定してください — `0×0` ボックスではモーションは生成されません。

パーティクル位置はシーン空間です。Canvas CPUパスはエンティティトランスフォームスタックに参加します；別個のWebGL/WebGPUオーバーレイパスはエンティティの移動/スケール/回転や親クリッピングを適用しません。不透明度はすべてのパスで継承されます。

使用法については [パーティクルシステム](/learn/particles/) を参照してください。

## 関連情報

[`Scene`](/reference/core-scene/)（`particleBackend` オプション） ·
[レンダラー](/reference/core-renderer/)（WebGL ポイントレイヤーフォールバック） ·
[`@vectojs/core` 概要](/reference/core-api/)
