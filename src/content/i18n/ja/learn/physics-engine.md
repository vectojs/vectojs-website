---
title: 'Physics & Animation'
description: 'ばね物理、速度、力学指向シミュレーションをVMT内の任意のエンティティに適用します。'
order: 11
---

# Physics & Animation

VectoJSは静的なレイアウトを超えます。UIはVirtual Math Tree内に存在するため、標準的な`Button`や`Input`を含む任意のコンポーネントに、**連続的な力学指向の物理**を適用できます。

## 組み込みトゥイーン：`entity.animate()`

最もシンプルなモーションツールです。`animate()`は任意の数値プロパティに、なめらかなイーズアウトのトゥイーンをキューに入れます：

```typescript
button.animate({ x: 200, opacity: 0.5 }, 500);

// Chains are sequential, not concurrent:
button.animate({ x: 400 }, 300).animate({ y: 200 }, 300).animate({ opacity: 0 }, 200);
```

トゥイーンの実行中、シーンは非静的に保たれます——`markDirty()`を呼ぶ必要はありません。トゥイーンが落ち着くと、`hasPendingAnimations()`は`false`を返します。

> [!TIP]
> チェーンは並行ではなく逐次的です（`animate`は`this`を返します）。並行なモーション、より豊かなイージング、ばね、コンポーネントの出入りには、下記のアニメーションシステムを使ってください。

## 宣言的 & 命令的アニメーション

**0.2.0**で追加されたアニメーションシステムは、ばねファーストであり、1つのAPIの背後でトゥイーンとばねを統一します——任意のエンティティの変換や不透明度をアニメーションする推奨の方法です。それは、組み込みコンポーネント（Modal、Tooltip、…）が自身をアニメーションするために使うのと同じエンジンです。

### 宣言的トランジション

どのプロパティがどのようにアニメーションするかを宣言します。その後、プレーンな代入がそれらをアニメーションします：

```typescript
entity.setTransition({
  opacity: 'spring', // default spring
  x: { duration: 300, easing: 'easeOutCubic' }, // tween
  scaleX: { stiffness: 200, damping: 18 }, // spring with overrides
});

entity.opacity = 1; // springs to 1
entity.x = 400; // tweens over 300ms
```

飛行中に新しいターゲットを代入すると、実行中のアニメーションが**リターゲット**されます——ばねはその速度を保ちます——ため、素早くトグルされたりジェスチャー駆動されたりするUIは、スナップするのではなく連続的に流れます。トランジションが設定されていないプロパティは、ドライバーを作成せず、通常のセッターを通じて即座に書き込まれます。アニメーション可能なプロパティは`x`、`y`、`scaleX`、`scaleY`、`rotation`、`opacity`です。

### 命令的ワンショット

演出のため、`animateTo`（トゥイーン）と`springTo`（ばね）はプロパティを直接駆動し、モーションが落ち着いたときに解決されるPromiseを返します：

```typescript
await entity.animateTo({ x: 400, opacity: 0 }, { duration: 500, easing: 'easeOutCubic' });
await entity.springTo({ scaleX: 1, scaleY: 1 }, { stiffness: 200, damping: 18 });
```

（逐次的にチェーンする）`animate()`とは異なり、これらは並行に実行され、`async`/`await`と組み合わせられます。

### イージング

`Easing`エクスポートは、厳選された曲線のセットを提供します——`linear`、`easeInOut{Quad,Cubic}`、`easeOut{Quad,Cubic}`、`easeOutBack`（オーバーシュート）、その他。曲線名、またはあなた自身の`(t: number) => number`関数を、任意のトゥイーンの`easing`オプションに渡してください。

### モーション低減

システムはOSの**prefers-reduced-motion**設定を自動的に尊重します：動き（変換、ばね）はターゲットにスナップする一方で、不透明度のフェードは保たれます——コンポーネントは依然として現れたり消えたりしますが、動きがないだけです。コンポーネントごとのコードは不要です。

> [!TIP]
> コンポーネントは、このシステムを通じて自身の出入りをアニメーションします。任意の`UIComponent`サブクラスは`enterMotion`/`exitMotion`を宣言し、`dismiss()`を呼んでアニメーションで退出してからアンマウントできます——[UI Componentsリファレンス](/reference/ui-components/)を参照してください。

## SpringPhysics

`SpringPhysics`は、なめらかで物理的に感じられる数値のトランジションのための減衰ばねです：

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

ターゲットが連続的に変わるとき（カーソル追跡、スクロール慣性、インタラクティブなドラッグ）は、`animate()`の代わりに`SpringPhysics`を使ってください。

## エンティティ上の手動物理

すべての`Entity`は`x`/`y`と`update(dt, time)`を持ちます。`update`をオーバーライドすることで、任意の物理モデルを実装できます：

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

## 弾性境界

シンプルな減衰係数で、エンティティをビューポートの端で跳ね返させます：

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

このパターンは、アプリケーション管理の小さなコレクションに適しています。Nexusデモは代わりに`ComputeParticleEntity`の固定されたばね/マウス/爆発モデルを使い、エンティティ間の相互作用はシミュレートしません。

## SpatialHashGrid：アプリケーション管理の近傍候補

N体相互作用（反発、衝突）では、素朴なペアワイズループはO(N²)です。`SpatialHashGrid`を使って、クエリと重なるセルから候補を取得し、その小さな集合に対して正確なテストを実行してください：

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

実際の近傍相互作用（ボール対ボールの衝突、フロッキング、エンティティ間の反発）が必要なときは、このパターンを自分で使ってください。`ComputeParticleEntity`は内部的に`SpatialHashGrid`を使**わない**ことに注意してください——そのシミュレーション（GPUまたはCPU）は、エンティティ対エンティティではなく、固定点（ばねの原点、マウス、爆発の中心）に対する力のみを計算します。高いパーティクル数_と_実際の近傍相互作用の両方が必要なら、エンジンがあなたのために行わない2つのことを組み合わせていることになります：CPU上で（上記のように）自分の`SpatialHashGrid`ベースの近傍クエリを実行するか、GPUパス用に近傍クエリを組み込んだカスタムWGSLコンピュートパスを書くことになります。

> [!WARNING]
> ハッシュグリッドは毎フレーム再構築してください。前フレームからの古いグリッドデータは、誤った近傍クエリと幻の衝突を生み出します。

## 高スループットなパーティクル：`ComputeParticleEntity`

原点へのばね + マウス反発を伴う数万個のパーティクルには、`ComputeParticleEntity`を使ってください。利用可能なときは自動的にWebGPUコンピュートシェーダーを使い、CPUへフォールバックします：

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
> `initRandomParticles`の前に、必ず`scene.resize(width, height)`を呼ぶか、Sceneに自動リサイズさせてください。`0×0`のビューポートは初期位置を生成せず、パーティクルは決して動きません。

完全な`ComputeParticleEntity`のメモリレイアウトとWebGPUの内部については、[Core API Reference](/reference/core-api/)を参照してください。
