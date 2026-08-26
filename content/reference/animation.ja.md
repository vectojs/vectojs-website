+++
title = "アニメーション (@vectojs/animation)"
description = "プロパティドライバ、トゥイーン、スプリング、イージングカーブ — Entity.animate()、setTransition()、animateTo() と springTo() の背後にあるエンジン。"
weight = 54
+++

# `@vectojs/animation`

スタンドアロンのアニメーションエンジン: 滑らかな数値モーションのためのプロパティドライバ、厳選されたイージングセット、そしてすべての VectoJS モーションサーフェスが共有する `MotionConfig` 形状。`@vectojs/core` はこれを依存し**再エクスポート**するため、ほとんどのアプリはこのパッケージを直接インポートしません — `entity.setTransition({ x: 'spring' })`、`entity.animateTo(...)`、`entity.springTo(...)` と `entity.animate({...}, ms)` がエントリポイントです（[`core-entity` # Animation](/reference/core-entity/#animesiyon) を参照）。カスタムドライバを構築したり、イージングを単体で使うには直接インポートしてください:

```ts
import { TweenDriver, SpringDriver, Easing, EASING_IDS } from '@vectojs/animation';
```

## MotionConfig — 共有の設定形状

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

判別のルール: `duration` を持つ設定はトゥイーン、それ以外はスプリングです（`isTweenConfig(c)` がまさにこれを実装します）。裸の `'spring'` 文字列は「デフォルトのスプリング」を意味します。

## ドライバ（`PropertyDriver`）

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

- **`TweenDriver(from, to, config: TweenConfig)`** — `from` から `to` へのイージング補間を `duration` ミリ秒で行い、オプションで `delay` を指定します。`retarget()` は、消費済みの遅延を再課徴することなく宛先を変更します: セグメントは単調な経過クロックで実行され（初期遅延中の再ターゲットでも残りの部分だけを待機する）、高速な連続再ターゲットがアニメーションを無期限に飢えさせることはありません。
- **`SpringDriver(from, to, config?: SpringConfig)`** — 質量-スプリング-ダンパー積分（`@vectojs/math` の `SpringPhysics` を基盤）。`retarget()` は速度を維持するため、途中での再ターゲットは連続的です。`target` は静止イプシロン内ではなく、完了時に**正確に**適用されます。
- `syncExternal(value, extra)` は他の場所（例: WASM バッチ処理されたティック）で進行した状態を取り込みます: `extra` はスプリングでは速度、トゥイーンでは経過ミリ秒 — 呼び出し後も `value`/`tick()`/`isDone()`/`retarget()` はすべて正しいままです。

**構築時とtick時の防御的チェック。** 静かに誤設定されるドライバーは決して収束せず、その完了を待つすべての `await` をハングさせます：

- `TweenDriver` は未知のイージング名文字列を構築時に拒否し（以前は最初のtickで素の `TypeError` でクラッシュしていました）、`tick(dt)` はNaN・ゼロ・負のdtを無視します — 経過クロックは決して汚染されず、WASMのバッチトゥイーンカーネルも同じステップを同じように拒否するため、両エンジンとも次の有効なフレームで回復します。
- `SpringDriver` は非有限または非正の `stiffness`/`damping`/`mass` を構築時に拒否し、物理デフォルトへ静かにフォールバックすることはありません — そのようなスプリングは発散するか、決して収束しません。
- `isTweenConfig(null)` は `false` を返します；この識別子は信頼できないランタイム設定を扱うために存在します。

## Easing

```ts
type EasingFn = (t: number) => number; // normalized [0,1] → eased progress
type EasingName = keyof typeof Easing; // built-in curve names

Easing.linear | Easing.easeInQuad | Easing.easeOutQuad | Easing.easeInOutQuad;
Easing.easeInCubic | Easing.easeOutCubic | Easing.easeInOutCubic;
Easing.easeOutBack | Easing.easeInOutBack;
```

組み込みの各カーブは f(0)=0、f(1)=1 を満たし、明示的な乗算で記述されるため、WASM の `ease()` カーネルと**ビット単位で一致**します — バッチ処理されたトゥイーンは、JS版と単に近いだけでなく、完全に等しくなります。`EASING_IDS` は各名前を数値IDに対応付けます（名前付きイージングのトゥイーン（バッチ可能）を、WASM に渡せないカスタム `EasingFn` クロージャから区別するために使用）。カスタム関数は名前付きカーブが使える場所ならどこでも許可されます: `easing: (t) => t * t * (3 - 2 * t)`。

## `Entity` のモーションとの関係

| サーフェス                                             | 使用法                                        |
| ------------------------------------------------------ | --------------------------------------------- |
| `setTransition({ prop: 'spring' })` で設定してから代入 | プロパティごとの `SpringDriver`               |
| `animateTo({...}, duration, easing)`                   | `TweenDriver`s                                |
| `springTo({...}, config?)`                             | `SpringDriver`s                               |
| `animate({...}, ms)`                                   | 6つの組み込み数値プロパティに対するトゥイーン |

`animate()` は `x | y | scaleX | scaleY | rotation | opacity` のみを補間します — カスタムフィールドは駆動されません（[`core-entity`](/reference/core-entity/#animesiyon) を参照）。
