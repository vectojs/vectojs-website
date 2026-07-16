---
title: 'Entity'
description: 'すべてのVirtual Math Treeノードの抽象基底：トランスフォーム、アニメーションシステム、キャプチャ/バブルイベント、およびカスタムEntityがオーバーライドできるa11y/バッチングフック。'
order: 3
---

# `Entity`（抽象）

[`@vectojs/core`](/reference/core-api/) の一部です。

Virtual Math Tree内のすべてのノードの基底クラス。サブクラス化して `isPointInside` と `render` を実装します。

```ts
abstract class Entity {
  abstract isPointInside(globalX: number, globalY: number): boolean; // 必須実装
  abstract render(renderer: IRenderer): void; // 必須実装
}
```

## パブリックプロパティ

| プロパティ                   | 型               | デフォルト      | 備考                                                                                                                                                                                               |
| ---------------------------- | ---------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                         | `string`         | `entity_<rand>` | シャドウノードID / `data-vecto-id` として使用されます。                                                                                                                                            |
| `children`                   | `Entity[]`       | `[]`            |                                                                                                                                                                                                    |
| `parent`                     | `Entity \| null` | `null`          |                                                                                                                                                                                                    |
| `scene`                      | ゲッター         | —               | 親チェーンをたどって所有する `Scene`（または `null`）を返します。                                                                                                                                  |
| `x`, `y`                     | `number`         | `0`             | ローカル位置。                                                                                                                                                                                     |
| `scaleX`, `scaleY`           | `number`         | `1`             | ローカルスケール。                                                                                                                                                                                 |
| `rotation`                   | `number`         | `0`             | ローカル回転（ラジアン）。                                                                                                                                                                         |
| `opacity`                    | `number`         | `1`             | すべての祖先の不透明度と乗算され、通常、バッチ、WebGPU、およびDOMポータル出力に適用されます。                                                                                                      |
| `interactive`                | `boolean`        | `false`         | セッターの副作用：`a11yNeedsReorder` + `markDirty()` をフラグします。`width` とともにa11y投影をゲートします。                                                                                      |
| `width`, `height`            | `number`         | `0`             | ヒットボックス / a11yシャドウボックスサイズ（× スケール）。                                                                                                                                        |
| `clipChildren`               | `boolean`        | `false`         | 通常の子描画を `[0,0]–[width,height]` にクリップします；Canvas/SVGは正確です。3つ目は回転/せん断クリップにワールドAABBシザーを使用します。WebGL point/WebGPUオーバーレイパスはクリップされません。 |
| `a11yOffsetX`, `a11yOffsetY` | `number`         | `0`             | シャドウノードをエンティティのグローバル位置から相対的に移動します。                                                                                                                               |
| `a11yFullViewport`           | `boolean`        | `false`         | `width === 0` でもビューポートを埋めるシャドウノードを投影します；他のすべての**背後**にマウントされるため、上部のコンポーネントはクリック可能なままです。                                         |
| `isDOMPortal`                | `boolean`        | `false`         | `DOMPortalEntity` をマークします；ポータルはa11y同期からスキップされます。                                                                                                                         |

> **A11y投影にはボックスが必要です。** シャドウノードは `interactive && (width > 0 || a11yFullViewport)` の場合にのみ作成されます。`width: 0` で `a11yFullViewport` もないインタラクティブエンティティはシャドウノードを**持ちません** — `width`/`height` を設定してください。

## ツリー & トランスフォームメソッド

```ts
add(...children: Entity[]): this             // 1つ以上の子を順序通りにアタッチ。a11yNeedsReorder + markDirty もフラグします
remove(child: Entity): this
set(props: Partial<this>): this              // 複数の自身のプロパティを通常のセッターを通じて代入。this を返します
setPosition(x: number, y: number): this
getGlobalPosition(): Point                   // ワールド位置；translate→scale→rotate をルート（除外）まで累積
getWorldTransform(): AffineTransform         // 正確な累積Canvas T·S·R 行列 { a,b,c,d,e,f }
localToWorld(localX: number, localY: number): Point
worldToLocal(worldX: number, worldY: number): Point | null // 特異なトランスフォームの場合は null
getWorldBounds(): Bounds                    // ローカル getBounds()（または width/height）をワールドAABBに変換
getWorldScale(): { x: number; y: number }    // 自身 + 祖先のスケールの積（ルートを除く）
getWorldRotation(): number                   // 自身 + 祖先の回転の合計（ルートを除く）、ラジアン
getBounds(): Bounds | null                   // カリング用のローカルAABB。null（デフォルト）= カリングなし
destroy(): void                              // アニメーション + リスナーをクリア、親からデタッチ
```

`getWorldScale()` と `getWorldRotation()` は便利な累積メソッドです。ネストされた回転と不均一スケールの下では、合成行列にせん断が含まれる可能性があります；正確なジオメトリが重要な場合は、`getWorldTransform()`、`localToWorld()`、`worldToLocal()`、または `getWorldBounds()` を使用してください。

1.9.0 以降、`add()` は**可変長引数**です — `parent.add(a, b, c)` は各子を引数順にアタッチします（単一子パスは O(1) のまま）。`set(props)` は構築時のエルゴノミクスとして、複数の自身のプロパティを1回の呼び出しで、各々を通常のセッターを通じて代入します（`setTransition` が設定されたプロパティはアニメーションしますし、`interactive` はa11yの並び替えをフラグします）：`rect.set({ x: 40, y: 40, width: 120, fill: '#38bdf8' })`。これは与えられたオブジェクトに対する単純な `for…in` であり、フレームごとのパスには触れません。どちらも [`Rect`/`Circle`/`Group`](/reference/core-entities/) プリミティブと自然に組み合わせて使用できます。

## アニメーション

```ts
// レガシートゥイーン（保存済み）
animate(targetProps: Partial<this>, durationMs: number): this
hasPendingAnimations(): boolean

// アニメーションシステム（0.2.0）
setTransition(config: Partial<Record<AnimatableProp, MotionConfig>>): this
animateTo(props: Partial<Record<AnimatableProp, number>>, cfg: TweenConfig): Promise<void>
springTo(props: Partial<Record<AnimatableProp, number>>, cfg?: SpringConfig): Promise<void>
```

`animate()` はトゥイーンをキューに入れます；複数回の呼び出しは**逐次連鎖**します。数値プロパティのみが補間されます；イージングは固定の ease-out（`p * (2 - p)`）です。実行中の `animate()` はシーンを非静的状態に保ち（アイドルスロットルを回避、[`Scene`](/reference/core-scene/#rendermodemaxfpsおよびアイドル自動スロットル) を参照）、モーションが落ち着くまでa11y同期をフリーズします。

`hasPendingAnimations()` は**オーバーライド可能**であり、Sceneがカスタムモーションを認識する唯一の窓口です：サブクラスが `update()` 内で独自の動き（手動スプリングや速度）を統合する場合、そのモーションが実行中は `true` を返すようオーバーライドしてください — `update()` 内からの `markDirty()` は同じティックの終わりに再度クリアされるため、オーバーライドがないとアイドルスロットルがアニメーションを2fpsに落とし、`onDemand` モードではフリーズします。

**0.2.0 アニメーションシステム** — スプリングファーストで、トゥイーンとスプリングを統合します：

- `setTransition` は6つのアニメーション可能プロパティ（`x`、`y`、`scaleX`、`scaleY`、`rotation`、`opacity`）のアニメーション方法を宣言します；その後、通常の代入（`entity.x = 400`）でそれらがアニメーションし、進行中のモーションをリターゲットして連続的な動きを実現します。これらのプロパティはアクセサであり、トランジションが設定されていない場合はゼロオーバーヘッドの高速パスを持ちます — 単なる代入はプレーンなフィールド書き込みのままです。
- `animateTo` / `springTo` は命令的にプロパティを駆動し、モーションが落ち着くと解決します；`animate()` とは異なり、これらは同時に実行され、`await` と組み合わせられます。
- `MotionConfig = 'spring' | SpringConfig | TweenConfig`（`duration` の有無でトゥイーンが選択されます）。`TweenConfig.easing` は `Easing` エクスポートからの `EasingName` またはカスタム `(t) => number` を受け付けます。
- `prefers-reduced-motion` を尊重します（移動はスナップ、不透明度はフェード）。関連：`onMounted()` はエンティティがライブシーンにアタッチされたときに発火します — UIプレゼンスヘルパーはこれを使用してエンターアニメーションを再生します。

使用法については [物理 & アニメーション](/learn/physics-engine/) を参照してください。

## イベント（`VectoEvent` / キャプチャ + バブル）

```ts
type VectoEvent =
  | 'click' | 'hover' | 'pointerdown' | 'pointerup' | 'pointercancel' | 'pointermove' | 'pointerleave'
  | 'change' | 'focus' | 'blur' | 'wheel' | 'keydown' | 'keyup';

on(event: VectoEvent, cb: (e: any) => void, options?: { capture?: boolean }): this
off(event: VectoEvent, cb: (e: any) => void, options?: { capture?: boolean }): this
emit(event: VectoEvent, payload: any): void          // 自身のみ、バブルフェーズリスナー（レガシー/コンポーネント内部）
dispatchEvent(event: VectoJSEvent): void             // DOMスタイルのキャプチャ（ルート→ターゲット）→ バブル（ターゲット→ルート）
```

- `on`/`off` はデフォルトで**バブル**フェーズです；キャプチャフェーズには `{ capture: true }` を渡してください。バブルリスナーはレガシー `emit()` パスでも発火します。
- `VectoJSEvent<N>` は `nativeEvent` をラップし、`target`、`currentTarget`、`bubbles`、`stopPropagation()`、`stopImmediatePropagation()`、`preventDefault()`、ビューポート `clientX/Y`、論理 `sceneX/Y`、カレントターゲット `localX/Y`、modifierキー、およびパススルー（`deltaX/Y`、`key`、`defaultPrevented`）を追加します。ローカル座標は完全なネストされたアフィン変換を反転します。バブルしないイベントもキャプチャフェーズは実行しますが、バブルフェーズではターゲットのみが発火します。
- フォームコントロールのシャドウ `<input>` からの `'change'` は `{ value, checked, selectionStart, selectionEnd, composition }` を運びます。`composition` はアクティブなIMEプリエディットの `{ start, length } | null` です。`'wheel'` はネイティブの `WheelEvent` を運びます（`preventDefault()` を呼び出すとページスクロールを停止します）。

使用法については [イベント & ヒットテスト](/learn/events/) を参照してください。

## A11y / バッチングフック（オーバーライドしてオプトイン）

```ts
getA11yAttributes(): A11yAttributes          // デフォルト {} → プレーンな透過 <div>
getBatchCircle(): BatchCircle | null         // { radius, color } → レンダラーの fillCircle 高速パス（均一スケールのリーフ）
getBatchRect(): BatchRect | null             // { width, height, color } → GPUインスタンス矩形（WebGL pointBackend のみ）
update(dt: number, time: number): void       // オプションのオーバーライド；dt はミリ秒、time は performance.now()；デフォルトはキューに入ったトゥイーンを進行
```

`getBatchCircle`/`getBatchRect` は**毎フレーム**読み取られます（アニメーションする色/半径も反映されます）。表現可能なバッチリーフは自身の `save/translate/scale/rotate/render/restore` をスキップします；Canvasモードまたはサポートされていない累積アフィン変換は、エンティティの通常の `render()` フォールバックを使用します。

完全な `A11yAttributes` の形状とシャドウDOM同期の仕組みについては [a11yRoot & エージェント契約](/reference/core-a11y/) を参照してください。

## 関連情報

[`Scene`](/reference/core-scene/)（ツリーを所有） ·
[レンダラー](/reference/core-renderer/)（`Entity.getContentProjection()`） ·
[a11yRoot & エージェント契約](/reference/core-a11y/) ·
[`@vectojs/core` 概要](/reference/core-api/)
