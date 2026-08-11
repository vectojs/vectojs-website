+++
title = "コアシーンアーキテクチャ"
description = "仮想数学ツリー、Sceneのライフサイクル、Entityシステム、ヒットテスト、レンダーパイプラインの詳細。"
weight = 8

[extra]
order = 8
+++

# コアシーンアーキテクチャ

VectoJSは従来のブラウザDOMを破棄します。代わりに、`@vectojs/core`内部に**仮想数学ツリー（VMT）**を実装しています。

<figure>
  <img src="/images/vmt-architecture.svg" alt="エンティティツリー、キャンバスレンダリング、A11yシャドウレイヤーを示すVMTアーキテクチャ図" class="diagram" />
  <figcaption>VMTエンティティツリーは、キャンバスレンダリングとキャンバス上の不可視A11yシャドウDOMの両方を駆動します。</figcaption>
</figure>

## Scene

`Scene`クラスはルートオーケストレーターです。3つの重要なパイプラインを管理します：

1. **レンダーループ** — `requestAnimationFrame`ループで物理/アニメーションを順次実行し、`IRenderer`を介してレンダリングします。
2. **ヒットテスト** — `document.elementFromPoint`なしでポインターホバーとクリックを検出する純粋な数学的O(N)レイキャスティング。
3. **アクセシビリティプロキシ** — フォーカス、レイアウト、値の双方向同期をキャンバス上の不可視A11yシャドウDOMに実行します。

### 初期化

```typescript
import { Scene } from '@vectojs/core';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, {
  pointBackend: 'webgl', // 互換性のあるバッチ円/矩形をWebGL2レイヤーに最適化
  maxFPS: 60,
});
scene.start();
```

`Scene`はキャンバスの**親**要素に2つの透明`<div>`を挿入します：A11yシャドウレイヤー（`z-index: 10`）用とDOMポータルレイヤー（`z-index: 9`）用です。親が`static`の場合、毎フレーム`position: relative`に強制されます。

### レンダーモード

| モード                   | 動作                                                                        | 使用時機                              |
| ------------------------ | --------------------------------------------------------------------------- | ------------------------------------- |
| `'always'`（デフォルト） | `maxFPS`で制限された毎フレーム再レンダリング。                              | 連続アニメーション、パーティクルSIM。 |
| `'onDemand'`             | ダーティまたはモーション保留中のみ描画；静的rAFティックはツリーをチェック。 | 静的/イベント駆動UI。                 |

```typescript
scene.renderMode = 'onDemand';
// イベントハンドラーからscene.markDirty()を呼び出して再描画を要求。
```

**アイドル自動スロットルの落とし穴。** `'always'`モードで、保留中のトゥイーンがなくダーティフラグもないシーンは、バッテリー節約のため~2fpsにスロットルされます。カスタム`update()`内で`entity.x`を変更して手動アニメーションする場合は、**フレーム間**（イベントハンドラーまたは別のrAFから）で`scene.markDirty()`を呼び出してください — `update()`内部で呼び出さないでください。レンダリング後のリセットで次のチェック前にフラグが消去されるためです。

## Entityシステム

VectoJSのすべてのオブジェクトは抽象`Entity`クラスを拡張します。

<figure>
  <img src="/images/entity-hierarchy.svg" alt="Entity → UIComponent → 全コンポーネントを示すEntityクラス階層" class="diagram" />
  <figcaption>すべてのUIコンポーネントはUIComponentを拡張し、UIComponent自体はEntityを拡張します。カスタムタイプはEntityを直接サブクラス化できます。</figcaption>
</figure>

`Entity`は以下を所有します：

- **位置**（`x`、`y`）、**スケール**（`scaleX`、`scaleY`）、**回転**（ラジアン）、および**不透明度**。
- **children**配列 — VMTはツリーです。
- UIComponentのAABBヒットテストで使用される**ヒットボックス**（`width`、`height`）。
- オプションフラグ：`interactive`、`clipChildren`、`a11yFullViewport`。

### 完全なプロパティリファレンス

| プロパティ         | 型        | デフォルト | 備考                                                                                                                                                                           |
| ------------------ | --------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `x`, `y`           | `number`  | `0`        | ローカル位置                                                                                                                                                                   |
| `scaleX`, `scaleY` | `number`  | `1`        | ローカルスケール                                                                                                                                                               |
| `rotation`         | `number`  | `0`        | ラジアン                                                                                                                                                                       |
| `opacity`          | `number`  | `1`        | `[0,1]`；通常、バッチ、WebGPU、ポータルパス全体で祖先の不透明度と乗算。                                                                                                        |
| `width`, `height`  | `number`  | `0`        | ヒットボックスサイズ                                                                                                                                                           |
| `interactive`      | `boolean` | `false`    | シャドウDOMノード＋イベントを有効化                                                                                                                                            |
| `clipChildren`     | `boolean` | `false`    | 通常の子描画を`[0,0]–[width,height]`にクリップ；Canvas/SVGは正確、Threeは回転/シアークリップにワールドAABBシザーを使用。GPUポイント/WebGPUオーバーレイパスはクリップされない。 |
| `a11yFullViewport` | `boolean` | `false`    | ビューポート全体を覆うシャドウノードを作成（境界のないサーフェス用）                                                                                                           |
| `a11yOffsetX/Y`    | `number`  | `0`        | シャドウノード配置の微調整                                                                                                                                                     |

### Entityのサブクラス化

```typescript
import { Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

class GlowRect extends Entity {
  color = '#6366f1';

  isPointInside(gx: number, gy: number): boolean {
    const local = this.worldToLocal(gx, gy);
    return (
      !!local && local.x >= 0 && local.x <= this.width && local.y >= 0 && local.y <= this.height
    );
  }

  render(renderer: IRenderer): void {
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 8);
    renderer.fill(this.color);
  }
}

const rect = new GlowRect();
rect.width = 200;
rect.height = 80;
rect.setPosition(100, 100);
scene.add(rect);
```

> **注：** `render()`はレンダラーが既にエンティティのグローバル位置に変換され、スケーリングと回転が適用された状態で呼び出されます。`(0, 0)`から描画してください。

### ヒットテストとイベント

通常のキャンバスシーンで入力可能なアクセシビリティノードを投影するには、`entity.interactive = true`を設定します。ヒットテストが要求されると、`findEntityAt(x, y)`は`isPointInside()`が`true`を返す最初のエンティティ（深さ優先、前面から背面）を返します。トラバーサル中にインタラクティブフィルターはありません：プログラムによるヒットテストとアダプターは、非インタラクティブエンティティを返すことができます。

```typescript
rect.interactive = true;

rect.on('click', (e) => {
  rect.animate({ color: '#38bdf8' }, 300);
});

rect.on('hover', (e) => {
  document.body.style.cursor = 'pointer';
});
rect.on('pointerleave', () => {
  document.body.style.cursor = 'default';
});
```

利用可能なイベント：`click`、`hover`、`pointerdown`、`pointerup`、`pointercancel`、`pointermove`、`pointerleave`、`change`、`focus`、`blur`、`wheel`、`keydown`、`keyup`。

イベントはDOM形式で伝播します：**キャプチャ**（ルート→ターゲット）→**バブル**（ターゲット→ルート）。`{ capture: true }`を渡してキャプチャフェーズでリッスンします。`e.stopPropagation()`でトラバーサルを停止、または`e.stopImmediatePropagation()`で現在のノードの残りのリスナーもスキップします。

### アニメーション

`entity.animate()`は任意の数値プロパティに対してスムーズなイーズアウトトゥイーンをキューイングします：

```typescript
// 2つのトゥイーンを連鎖：右にスライド、その後フェードアウト。
rect.animate({ x: 400 }, 400).animate({ opacity: 0 }, 200);
```

イージング関数はイーズアウト二次関数：`t * (2 - t)`です。実行中のトゥイーンは、`onDemand`モードでもシーンをアクティブに保ちます（`hasPendingAnimations()`経由）。

### カスタムupdate()

`Entity.update(dt, time)`をオーバーライドしてフレーム単位のロジックを実装します。

> [!WARNING] > `dt`は**ミリ秒**であり、秒ではありません。`this.rotation += dt * 3`と書くと3 rad/sを期待するところ、実際は3000 rad/sで回転します。`0.001`を乗算するか（または速度を1000で割って）変換してください。

`time`は`performance.now()`です：

```typescript
class Spinner extends Entity {
  update(dt: number, _time: number): void {
    super.update(dt, _time); // キューイングされたトゥイーンを進行
    this.rotation += dt * 0.003; // dtはmsなので、これは3 rad/s
    this.scene?.markDirty();
  }
}
```

## レンダリングパイプライン

<figure>
  <iframe src="/sandbox/diagram-pipeline.html" class="diagram-frame" loading="lazy" title="VectoJSレンダーパイプライン：1つのダーティフレームの6つのステージをVectoJSでライブレンダリング" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>各ダーティフレームはエンティティツリーを走査 — 更新、カリング、レンダリング — その後A11yシャドウDOMを同期。<em>（VectoJSでライブレンダリング。）</em></figcaption>
</figure>

各フレーム：

1. **クリア** — `renderer.clear()`
2. **更新** — ツリーを走査し`entity.update(dt, time)`を呼び出す（`dt`はms、`time`は`performance.now()`から）。
3. **カリング** — `getBounds()`がビューポート外のエンティティをスキップ。
4. **レンダリング** — 各エンティティのグローバル変換にレンダラーを変換/スケール/回転し、`entity.render(renderer)`を呼び出す。
5. **フラッシュ** — 保留中のバッチ描画（円、WebGLポイント）をコミット。
6. **A11y同期** — シャドウDOMを更新（`a11ySyncInterval`でスロットル）。

すべてがJSメモリ内で行われ、直接Canvasにダンプされるため、ブラウザのレイアウトスラッシングはゼロです。数千のエンティティをアニメーションさせてもDOMノード数は一定に保たれます。

## パフォーマンスヒント

### バッチ描画

`getBatchCircle()`または`getBatchRect()`をオーバーライドして、リーフエンティティをWebGLポイントレイヤーにオプトインします（`pointBackend: 'webgl'`が必要）：

```typescript
getBatchCircle() {
  return { radius: this.radius, color: this.color };
}
```

表現可能なバッチリーフは、フル`save/translate/render/restore`パスをスキップし、WebGLバッファに入ります。Canvasモードまたはサポートされていない累積変換では、エンティティの通常の`render()`フォールバックが使用されます。

### ビューポートカリング

`getBounds()`をオーバーライドしてローカルAABBを返します。ビューポート外のエンティティは`render()`呼び出しをスキップしますが、トラバーサルと`update()`は続行します：

```typescript
getBounds() {
  return { x: 0, y: 0, width: this.width, height: this.height };
}
```

`UIComponent`は既に`getBounds()`を実装しています — 固定サイズのカスタム生Entityサブクラスも実装すべきです。

### オンデマンドレンダリング

ほとんど静的UIには`scene.renderMode = 'onDemand'`に切り替えます。静的ティックは更新/レンダリングとGPU処理をスキップしつつ、ダーティ/アニメーション状態のpollingのためにrAFを継続します。イベントハンドラーから`scene.markDirty()`を呼び出します。
