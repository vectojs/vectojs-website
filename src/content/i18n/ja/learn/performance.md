---
title: 'Performance'
description: 'レンダーモード、アイドル自動スロットル、WebGLバッチレンダリング、ビューポートカリング、テキストパフォーマンス、そして実際のGPUスループットの測定方法。'
order: 13
---

# Performance

VectoJSはデフォルトで高速になるよう設計されていますが、いくつかのオプトイン機構が大幅に高いスループットを解き放ちます。このページは、利用可能なつまみ、ほとんどの開発者が引っかかる隠れた落とし穴、そしてパフォーマンスを正確に測定する方法を説明します。

## レンダーモード

`Scene`は、構築後に`scene.renderMode`で設定される2つのレンダーモードをサポートします：

```typescript
scene.renderMode = 'always'; // default — rerender every frame
scene.renderMode = 'onDemand'; // rerender only when dirty or tweening
```

### `'always'`モード

rAFループは毎フレーム発火し、`maxFPS`（デフォルト60）で上限が設けられます。次のときに使ってください：

- 連続的なアニメーション（パーティクルシミュレーション、物理）
- リアルタイムのデータフィード
- 常に何かが動いているあらゆるシーン

### `'onDemand'`モード

rAFループは、最後のフレーム以降`scene.markDirty()`が呼ばれたとき、またはアニメーション/トランジションのドライバーが進行中のときにのみレンダリングします。アイドルティックはエンティティの更新/レンダリングとGPU送信をスキップしますが、SceneはやはりrAFをスケジュールし、保留中のアニメーション状態を確認するためツリーを辿ります。次のときに使ってください：

- 静的またはイベント駆動のUI（ダッシュボード、フォーム、メニュー）
- ユーザー操作に応じてアニメーションするが、それ以外は静止しているシーン

```typescript
scene.renderMode = 'onDemand';

button.on('click', () => {
  button.animate({ scaleX: 1.1, scaleY: 1.1 }, 100).animate({ scaleX: 1, scaleY: 1 }, 100);
  // animate() marks dirty automatically while the tween runs
});

input.on('change', () => {
  scene.markDirty(); // repaint to show new caret/selection state
});
```

## アイドル自動スロットル（隠れた落とし穴）

これはVectoJSで最もよくあるパフォーマンスの罠です。

`'always'`モードでは、シーンは次のとき**静的**とみなされます：

- `dirty`フラグが`false`であり、かつ
- 保留中の`animate()`トゥイーンを持つエンティティがない。

静的なシーンは、バッテリーとGPUを節約するため**約2 fps**にスロットルされます。安定したランタイムでは、`dirty`フラグはレンダリングされる各フレームの_開始時_に消費されるため、`update()`の内部から発行された`markDirty()`は、次のフレームの静的チェックまで生き残ります。

```typescript
// markDirty() inside update() re-arms the next frame
class Spinner extends Entity {
  update(dt: number, time: number) {
    super.update(dt, time);
    this.rotation += dt * 0.003;
    this.scene?.markDirty();
  }
}
```

**core ≤ 0.2.5での罠：**フラグは_レンダー後_にクリアされていたため、`update()`中に設定された`markDirty()`は次の静的チェックの前に消されていました——上記のパターンは1フレームをレンダリングして2 fpsで凍結しました。古いコアをサポートする場合は、以下の修正のいずれかを使ってください（`hasPendingAnimations()`はフレームごとのフラグ書き込みなしに意図を示すため、0.2.6でもそれらはより効率的な選択肢のままです）。

**修正——オプションA：**手動の変更ではなく、モーションに`animate()`を使ってください。実行中のトゥイーンは、自動的にシーンを生かし続けます：

```typescript
// Correct: animate() keeps hasPendingAnimations() true
entity.animate({ rotation: Math.PI * 2 }, 1000);
```

**修正——オプションA2（`update()`駆動のモーション向け）：**インテグレーターは残しつつ、`hasPendingAnimations()`をオーバーライドしてSceneにそれを伝えてください。これは、組み込みのスクロールコンテナが飛行中のモーションを報告する方法です：

```typescript
class Spinner extends Entity {
  update(dt: number, time: number) {
    super.update(dt, time);
    this.rotation += dt * 0.003;
  }
  hasPendingAnimations() {
    return true; // or: super.hasPendingAnimations() || stillMoving
  }
}
```

**修正——オプションB：**`markDirty()`を**フレームの合間に**呼んでください——イベントハンドラー、`setInterval`、またはシーン自身のrAFの後に発火する別の`requestAnimationFrame`から：

```typescript
// Correct: call markDirty between frames (not inside update)
setInterval(() => scene.markDirty(), 16); // external driver
```

**修正——オプションC：**`renderMode: 'always'`に切り替え、`maxFPS`を設定して静的スロットルを防いでください（アイドルスロットルは`maxFPS > 0`のときにのみ適用されます。`maxFPS = 0`を設定すると上限なしになり常に再レンダリングします）：

```typescript
scene.maxFPS = 0; // uncapped — never throttles to 2 fps
```

## `maxFPS`とモーション低減

```typescript
const scene = new Scene(canvas, {
  maxFPS: 60, // frame rate cap; 0 = uncapped
  respectReducedMotion: true, // default: true
});
```

`respectReducedMotion: true`（デフォルト）で、ユーザーがOSのアクセシビリティ設定で「モーションを減らす」を有効にしている場合、実効FPSは**30**（または`maxFPS`と30のうち低い方）に上限が設けられます。これを`respectReducedMotion: false`で無効化できますが、そうすると明示的なユーザーの好みを無視することになります。

`maxFPS`はライブでも設定可能です：バッテリー節約モードには`scene.maxFPS = 30`。

## WebGLバッチレンダリング

大量の円や矩形のセットに対して、WebGLレイヤーは多数のエンティティごとのCanvasパス呼び出しを、型付きバッファのアップロードと少数の描画送信に置き換えます。クロスオーバー点と高速化はワークロード/ハードウェア依存であり、ベンチマークすべきです。

### バッチレイヤーを有効化する

```typescript
const scene = new Scene(canvas, {
  pointBackend: 'webgl', // stacks a WebGL2 canvas over Canvas2D
});
```

### エンティティをオプトインさせる

`render()`の代わりに`getBatchCircle()`または`getBatchRect()`をオーバーライドします：

```typescript
class Dot extends Entity {
  radius = 4;
  color = '#00f0ff';

  // These are read every frame — animated values work.
  getBatchCircle() {
    return { radius: this.radius, color: this.color };
  }

  // Required fallback for Canvas mode or an unrepresentable world transform.
  isPointInside() {
    return false;
  }
  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.arc(0, 0, this.radius, 0, Math.PI * 2);
    renderer.fill(this.color);
  }
}
```

Sceneは毎フレーム`getBatchCircle()` / `getBatchRect()`を読み取り、表現可能なワールド空間のプリミティブをWebGLレイヤーに供給します。色とアルファはインスタンスごとの属性であるため、1つのバッファは混在したスタイルを含むことができます。

**制約：**

- エンティティは**リーフ**でなければなりません（子なし）。
- エンティティ自身のスケールは**均一**でなければなりません（`scaleX === scaleY`）。
- Sceneに`pointBackend: 'webgl'`が必要です。
- 累積された変換は、1つのスケール + 回転で表現可能でなければなりません。不均一/せん断された祖先は`render()`にフォールバックします。

WebGLレイヤーはCanvas2Dのコンテンツの**上に**合成される（`z-index: 5`）ため、バッチプリミティブは、ツリー順にかかわらず常に2Dコンテンツの上に描画されます。

### 矩形のための`getBatchRect()`

```typescript
getBatchRect() {
  return { width: this.width, height: this.height, color: this.color };
}
```

バッチ矩形は、表現可能なエンティティごとの回転をサポートします。反射、せん断、不均一な累積スケールは、通常のレンダラーのフォールバックを使います。

## `getBounds()`によるビューポートカリング

デフォルトでは、すべてのエンティティは、完全に画面外にあっても、レンダリングされるフレームで`update()`と`render()`を実行します。`getBounds()`をオーバーライドしてローカル空間の境界ボックスを返すと、Sceneは画面外のエンティティの`render()`呼び出しをスキップします。ツリーのトラバーサルと`update()`は依然として実行されます：

```typescript
getBounds() {
  return { x: 0, y: 0, width: this.width, height: this.height };
}
```

`UIComponent`はすでにこれを実装しています——すべての`@vectojs/ui`コンポーネントは自動的にカリングに参加します。固定サイズの生の`Entity`サブクラスには、大きなシーンで無償のパフォーマンスを得るために`getBounds()`を追加してください。

例えば、5,000個の境界付きリーフエンティティの90%が画面外にある場合、残る`render()`呼び出しは約500だけですが、Sceneはやはり5,000個すべてのノードを訪れて更新します。

## A11y同期のスロットリング

レンダリングされる各フレームで、`Scene`はすべてのインタラクティブなエンティティの位置と状態を、それらのシャドウDOMノードに同期します。数百個のインタラクティブなエンティティが同時にアニメーションすると、このDOM書き込みのオーバーヘッドがフレーム時間を支配する可能性があります。

`a11ySyncInterval`でスロットルします：

```typescript
const scene = new Scene(canvas, {
  a11ySyncInterval: 100, // sync at most once per 100 ms
});
// Or set live:
scene.a11ySyncInterval = 100;
```

インターバルはアニメーションの実行中にチェックされます。`a11ySyncInterval: 100`は同期を最大で約毎秒10回に制限し、モーションが収まった後に最終キャッチアップをスケジュールします。1つの値がすべてのUIに合うと仮定するのではなく、アクセシビリティのレイテンシーと測定されたDOMコストからインターバルを選んでください。

## テキストパフォーマンス

### `setMaxWidth()` — リフローのホットパス

`LayoutEngine`は測定（コールド）をレイアウト（ホット）から分離します。ウィンドウがリサイズされ、テキストがリフローする必要があるとき：

```typescript
// Wrong: rebuilds the full measured text on every resize event
window.addEventListener('resize', () => {
  label.setText(label.text); // cold pass — re-segments and re-measures
});

// Correct: reuses cached measurements, only recalculates line breaks
window.addEventListener('resize', () => {
  label.setMaxWidth(newWidth); // hot pass — cheap
});
```

ホットパスはO(グリフ数)ではなくO(単語数)であり、すべての`Intl.Segmenter`とキャンバスの`measureText`呼び出しを避けます。

### `LayoutResultBuffer` — 再利用可能なテキスト座標ストレージ

フレームごとに数千のグリフを持つデータ密度の高いUI（データグリッド、ターミナル、ログビューア）では、標準の`layoutPrepared()`パスはグリフごとに`LayoutNode`オブジェクトをアロケートします。代わりに`LayoutResultBuffer`を使ってください：

```typescript
import { LayoutEngine, LayoutResultBuffer, createCanvasMeasurer } from '@vectojs/core/layout';

const engine = new LayoutEngine(400, Infinity, createCanvasMeasurer());
const buffer = new LayoutResultBuffer(); // reuse across frames (CAPACITY = 16384)

function renderRow(text: string) {
  const prepared = engine.prepare(text, {}, 14);
  buffer.reset();
  engine.layoutPreparedIntoBuffer(prepared, buffer);
  // buffer.xs, buffer.ys, buffer.ws, buffer.hs, buffer.chars — flat typed arrays
  for (let i = 0; i < buffer.count; i++) {
    renderer.fillText(buffer.chars[i], buffer.xs[i], buffer.ys[i], '14px monospace', '#e2e8f0');
  }
}
```

再利用可能なバッファは、各ホットレイアウトでグリフごとに1つの`LayoutNode`オブジェクトをアロケートすることを避けます。制約：固定容量、単一列のみ（BiDiの視覚的並べ替えなし、除外矩形なし）。これらの機能が必要なときは`layoutPrepared()`を使ってください。ノードオブジェクトをアロケートするため、ホットパスでは`toLayoutResult()`を避けてください。

## CPU計算 と レンダリングのボトルネック

従来のブラウザDOMフレームワークでは、パフォーマンスのボトルネックはほぼ常にブラウザの**レンダリングとリフローのレイアウトパイプライン**（DOM操作、スタイルの再計算、ペインティング）にあります。しかしVectoJSはDOMを完全にバイパスし、レイアウト、カリング、インタラクションを数学的にメモリ内で処理するため、パフォーマンスのボトルネックはGPU/レンダリングレイヤーから直接**JavaScriptのシングルスレッドCPU計算**へと移ります。

十分に高いアクティブノード数では、CPU側のトラバーサル、更新、レイアウト、hit-testingが、ラスタライズよりも先に$16.67\text{ ms}$のフレーム予算を超える可能性があります。クロスオーバー点はワークロードとデバイスに依存します。

VectoJSは、CPUのシングルスレッドの制限をバイパスするための専用の**「脱出ハッチ」**を提供することで、これらの計算ボトルネックに第一原理から取り組みます。

---

### 1. 高密度パーティクルシミュレーション（N体ではなくパーティクルごと）

**ボトルネック**：パーティクルごとのJavaScript積分は毎フレーム$O(N)$であり、最終的にメインスレッドのフレーム予算を消費します。それが起こる個数は、デバイスとモデルに依存します。

**脱出ハッチ：WebGPUコンピュートシェーダー（`ComputeParticleEntity`）**
CPU実行を完全にバイパスするため、VectoJSは`ComputeParticleEntity`を提供します。内部では：

- 物理方程式（オイラー積分、ばね張力、場の引力）が**WGSL（WebGPU Shading Language）コンピュートシェーダー**にコンパイルされます。
- ランタイムでは、データがGPUのVRAM上に常駐し続けるため、WebGPUコンピュートパスはシミュレーションを数千のGPUコアにわたって並列化できます。
- WebGPUが利用不可、またはデバイスがロストしたとき、レンダラーは自動的に同等のCPUループ（`updateCPU()`）にフォールバックします。

> [!IMPORTANT] > **これは$N$体シミュレーションではありません。**各パーティクルの力は、3つの_固定_点——そのばねの原点、マウスカーソル、任意の爆発の中心——に対してのみ計算されます。パーティクル対パーティクルの相互作用も空間インデックスも関与しておらず、まさにそれが、これを恥ずかしいほど並列でGPUフレンドリーにしています。シミュレーションに実際の近傍相互作用（パーティクル対パーティクルの衝突や反発、フロッキング、N体重力）が必要な場合、`ComputeParticleEntity`はそれをカバーしません——近傍クエリを組み込んだ独自のWGSLコンピュートパスを書くか、CPU上で`SpatialHashGrid`ベースの近傍クエリを実行する必要があります（下記の[`SpatialHashGrid`](#3-エンティティの海のインタラクションon2計算量の破局)、およびCPUの実例については[Physics Engineガイド](/learn/physics-engine/)を参照）。エンジンには現在、「CPUフォールバック付きでGPU上に任意の計算を実行する」という汎用的な抽象は存在しません——`ComputeParticleEntity`は特定的で狭い実装であり、再利用可能なパターンではありません。

ハイエンドのスループットは、GPU、ブラウザ、DPR、パーティクルモデル、合成に大きく依存します。このリポジトリにはチェックインされたハイエンドのWebGPU結果がないため、**Export report**ボタンで自分のシーンを測定してください（下記の[実際のパフォーマンスの測定](#実際のパフォーマンスの測定)を参照）。

---

### 2. 高密度テキストの測定と組版リフロー

**ボトルネック**：動的なテキストレイアウトは、フロントエンドエンジニアリングにおいて最もコストの高いCPUタスクの1つです。それは辞書ベースの単語トークン化（`Intl.Segmenter`）、BiDiソート、ブラウザレベルのフォント幅測定（キャンバスの`measureText` APIの呼び出し）を必要とします。単一フレームで数万のグリフのテキストレイアウトを計算しようとすると（金融ターミナル、アクティブなログストリーム、データグリッドなど）、「コールドパス」の測定パイプラインでJSメインスレッドが凍結します。

**脱出ハッチ：スレッド外レイアウト、分割レイアウト、再利用メモリ**
VectoJSは3つのレベルのテキスト最適化を提供します：

- **スレッド外のMSDFレイアウト（`LayoutWorkerManager`）**：`MSDFTextEntity`は、テキストと事前計算されたフォント/グリフメトリクスを、エンティティごとにデバウンスして、バックグラウンドのWeb Workerに送信できます。ワーカーは行の配置を行い、型付きの座標/スタイルバッファを返します。ブラウザのフォント測定APIは呼びません。
- **Cold/Hot分離**：VectoJSはレイアウトを「コールド」（テキスト解析＆グリフ幅測定）と「ホット」（折り返し計算）に分離します。リサイズによってテキストが折り返されるとき、コールドの結果が再利用され、すべてのブラウザ測定APIを避け、リサイズのレイアウトの計算量を純粋な$O(\text{単語数})$へと引き下げます。
- **再利用可能なTypedArrayバッファ（`LayoutResultBuffer`）**：数千の一時的なレイアウトノードオブジェクトのアロケートを避けるため、開発者はレイアウト座標を事前にアロケートされたフラットなバッファに書き込めます。周囲の呼び出し側は依然としてアロケートする可能性があります。保証されるのは、具体的にはバッファパスがその座標ストレージを再利用することです。

> [!IMPORTANT] > **`LayoutWorkerManager`はプールではなく単一のバックグラウンドスレッドであり、1つのコンポーネントのためだけに配線されています。**それは`MSDFTextEntity`（GPU/MSDFフォントのテキストプリミティブ）によって内部的に使われます——デフォルトの`@vectojs/ui`テキストコンポーネント（`Text`、`RichText`）は、Cold/Hot分割も含めて、メインスレッド上で同期的にレイアウトします。デフォルトコンポーネントのテキストを非常に大量にレンダリングして壁にぶつかっている場合、Cold/Hot分割と`LayoutResultBuffer`は依然として適用されますが、スレッド外レイアウトは無償では得られません——独自のWorkerオフロードを構築するか、`MSDFTextEntity`に切り替える必要があります。より一般的に：この1つのテキストレイアウトのパス以外、エンジン内の他のものは今日メインスレッド外で実行されません。VMTのトラバーサル、hit-testing、ばね物理はすべて同期的です。

---

### 3. エンティティの海のインタラクション（$O(N^2)$計算量の破局）

**ボトルネック**：ペアワイズのエンティティ対エンティティの衝突や近接チェックは、$O(N^2)$の候補比較を必要とします。その成長は、非常に大きなシーン数よりずっと前に非現実的になり、正確な限界はペアごとの処理に依存します。

**脱出ハッチ：空間ハッシュグリッド（`SpatialHashGrid`）**
アプリケーション管理の衝突/近接クエリのため、VectoJSは**SpatialHashGrid**をエクスポートします。Sceneはエンティティを自動的にはインデックス化しません：

- 2D座標空間は、あなたが選んだ固定サイズのセルへと離散化されます。セル座標は[カントール対関数](https://en.wikipedia.org/wiki/Pairing_function)を介して単一のバケットキーに結合され、固定容量のハッシュテーブルではなくプレーンな`Map`に格納されます。
- エンティティのワールド空間AABBが変わったとき`insert(id, x, y, w, h)`を呼ぶか、動的なフレームにはグリッドをクリア/再構築します。
- ローカルなクエリAABBと重なるすべてのセルからIDを取得するため`query(x, y, w, h)`を呼び、それらの候補に対して正確な衝突テストを実行します。
- これは、アプリケーションレベルのローカルな物理を**$O(N^2)$**から、各クエリが訪れるセル/結果へと削減できます。組み込みの`findEntityAt()`とビューポートカリングはO(N)のツリーウォークのままです。

> [!WARNING] > **密なバケットに対する自動的な緩和はありません。**`SpatialHashGrid`（およびKnowledge Graphデモが使う独立した空間ハッシュ）は、各セルを内部構造のないフラットな集合として格納します——適応的なセルサイズ調整も、オーバーフローのチェイニングも、階層的/マルチ解像度のグリッドもありません。「$O(1)$平均」という数字は、あなたが選んだ`cellSize`に対して、エンティティがセル全体におおよそ一様に分布していることを仮定しています。データが激しくクラスタリングし得る場合——多数のエンティティが同じ一握りのセルに着地する（1点に群衆が形成される、数千のノードが数ピクセルに重なるズームアウト表示）——それらのセルは、インデックスがまったくない場合と同じく$O(k)$の線形スキャンへと劣化します。今日それに対する自動的な脱出ハッチはありません：唯一のレバーは、エンティティのサイズと期待される密度に適した`cellSize`を選び、データのクラスタリング挙動が変わったら再評価することです。極端で予測不能なクラスタリングが現実的な可能性であるものを構築している場合は、平均ケースが成り立つと仮定するのではなく、最悪ケースのバケット占有を自分で測定する予算を確保してください。

---

## 実際のパフォーマンスの測定

> [!WARNING]
> ヘッドレスChromeは、しばしばソフトウェアラスタライゼーションと異なるフレームスケジューリングを使います。そのFPSは、同一環境での回帰シグナルとして扱い、下限や本番の予測としては扱わないでください。

正確なスループットの数字のため：

1. 実際のGPUハードウェア上の実際のブラウザでデモを実行します。
2. Nexusデモの**Export report**ボタンを使って、現在のGPU/ブラウザの組み合わせで機械可読なFPS記録を出力します。
3. PRやドキュメントでパフォーマンスの数字を引用するときは、ヘッドレスの出力ではなくブラウザ内の測定を使ってください。

カスタムベンチマークには、`update()`ループ内でフレーム時間を収集します：

```typescript
const samples: number[] = [];

class BenchEntity extends Entity {
  update(dt: number, time: number) {
    super.update(dt, time);
    if (samples.length < 300) samples.push(dt);
    if (samples.length === 300) {
      const avg = samples.reduce((a, b) => a + b) / samples.length;
      console.log(`avg frame: ${avg.toFixed(2)} ms  (${(1000 / avg).toFixed(1)} fps)`);
    }
  }
}
```

`dt`はミリ秒単位です。`1000 / dt`が瞬間的なFPSを与えます。

## クイックリファレンス：どの問題にどのつまみか

| 症状                                                | 修正                                                                                                                                     |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| アイドル時にシーンが2 fpsにスロットルする           | 想定どおり——状態変更時に`markDirty()`を呼ぶか、ほぼ静的なシーンには`renderMode: 'onDemand'`を使う                                        |
| 手動でアニメーションするエンティティが2 fpsに落ちる | `hasPendingAnimations()`をオーバーライドするか、`animateTo()` / `springTo()`で駆動して、モーションが飛行中だとシーンに知らせる           |
| 静的UIがバッテリーを浪費する                        | `renderMode: 'onDemand'`に切り替える                                                                                                     |
| 多数の互換な円が遅い                                | ターゲットデバイスで`pointBackend: 'webgl'` + `getBatchCircle()`をベンチマークする                                                       |
| 画面外のエンティティがCPUを浪費する                 | エンティティに`getBounds()`を実装する                                                                                                    |
| アニメーション中のDOM書き込みオーバーヘッド         | `a11ySyncInterval: 100`を設定する                                                                                                        |
| リサイズ時のテキストリフローが遅い                  | `setText()`の代わりに`setMaxWidth()`を使う                                                                                               |
| 密なテキストがアロケーション圧を引き起こす          | `LayoutResultBuffer` + `layoutPreparedIntoBuffer()`を使う                                                                                |
| CIでFPSが異なる                                     | 同条件のCI実行を比較する。ユーザーに面するスループットはターゲットハードウェアで測定する                                                 |
| 動的なパーティクルがCPU予算を使い果たす             | `ComputeParticleEntity`をベンチマークし、その固定点の力モデルをWebGPUにオフロードする                                                    |
| 複数行テキストのリフローがスレッドを凍結する        | `MSDFTextEntity`のレイアウトを`LayoutWorkerManager`を介してスレッド外に委譲する（デフォルトの`Text`/`RichText`はメインスレッドに留まる） |
| エンティティの海のインタラクションが$O(N^2)$        | `SpatialHashGrid`を実装する——平均$O(k)$に削減するが、激しいクラスタリング下では自動ではない。データに合わせてセルをサイズする            |
