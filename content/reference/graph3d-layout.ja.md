+++
title = "GraphLayout & D3ForceLayout"
description = "グラフデータモデルとワーカーフレンドリーなGraphLayout契約、およびd3-force-3d上でのD3ForceLayout実装。"
weight = 45
+++

# `GraphLayout` & `D3ForceLayout`

[`@vectojs/graph3d`](/reference/graph3d/) の一部です。

文書化バージョン: **0.6.0**

## データモデル — `GraphData`

```ts
type NodeId = string | number;

interface GraphNode {
  id: NodeId;
  val?: number; // 相対的重要度；レンダラーは半径を ∛val に比例。デフォルト1。
  color?: string; // CSS色；レンダラーのnodeColorにフォールバック。
  fx?: number; // ノードを固定x位置にピン留め — レイアウトはこれを移動しません
  fy?: number;
  fz?: number;
  [key: string]: unknown; // ドメインプロパティはそのまま保持
}

interface GraphLink {
  source: NodeId;
  target: NodeId;
  [key: string]: unknown;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}
```

ノードオブジェクトはレイアウトまたはレンダラーのいずれによっても決して変更されません — 任意の追加プロパティ（ラベル、カテゴリ、自分のコードのみが使用する重み）は変更されずに通過するため、`GraphData` は変換のために出入りする形式ではなく、アプリケーション独自のグラフモデルとしても機能します。

## `GraphLayout` — レイアウト契約

```ts
interface GraphLayout {
  setGraph(data: GraphData): void;
  step(iterations?: number): boolean; // シミュレーションを進め、`positions`を更新；冷却後はfalse
  readonly positions: Float32Array; // xyzトリプレット、GraphData.nodesにインデックス一致
  // オプションの実行時ピンコントロール（0.2.0以降）— インタラクティブなドラッグ＆ピン用。
  // GraphInteractionはドラッグを有効にする前にpinNodeを機能検出します。
  pinNode?(nodeIndex: number, x: number, y: number, z: number): void;
  unpinNode?(nodeIndex: number): void; // ピン留めされたノードを解放して自由シミュレーションに戻す
  reheat?(alpha?: number): void; // 冷却されたシミュレーションがピン/解除に応答できるようalphaを上げる
  dispose(): void; // シミュレーションリソースを解放；インスタンスはその後使用不可
}
```

契約は意図的に最小限でワーカーフレンドリーです：位置は`GraphData.nodes`の順序でxyzトリプレットを持つ1つのフラットな`Float32Array`であるため、実装は完全にWeb Worker内で動作し、そのバッファを転送可能オブジェクトとしてスレッド境界を越えてストリーミングできます（ノードごとのオブジェクトトラフィックなし）。[`Graph3D.applyPositions()`](/reference/graph3d-renderer/#メソッド) はまったく同じバッファ形状を直接消費します。`positions` はステップ間で再利用される**同じ配列インスタンス**です — ライブビューではなく安定したスナップショットが必要な場合はコピー（`layout.positions.slice()`）してください。

`@vectojs/graph3d` は現在、この契約の背後で2つの実装を同梱しています：自社製の [`VectoForceLayout`](#vectoforcelayout)（Barnes–Hutオクトツリー、ランタイム依存なし。デフォルト）と [`D3ForceLayout`](#d3forcelayout)（既存のd3チューニングとの同等性を保つための `d3-force-3d` アダプター）— さらにDAGレイアウトモードがパッケージロードマップにあり、すべてこの同じインターフェースの背後にあるため、レンダラーやワーカーホストはどれが実行されているかを知る必要がありません。

## `D3ForceLayout`

デフォルトの [`VectoForceLayout`](#vectoforcelayout) に対する、d3-force-3dベースの代替実装です。`d3-force-3d` が必要です。調整済みのd3フォースを持つグラフを移行し、その感覚を保ちたい場合を除き、`VectoForceLayout` を優先してください。

```ts
new D3ForceLayout(options?: D3ForceLayoutOptions)

interface D3ForceLayoutOptions {
  linkDistance?: number;   // リンクの目標静止長。デフォルト30。
  chargeStrength?: number; // 多体（電荷）強度；負の値は反発。デフォルト-30。
  alphaMin?: number;       // step()が冷却を報告するalphaしきい値。デフォルト0.001。
}
```

[d3-force-3d](https://github.com/vasturiano/d3-force-3d)を適応 — `3d-force-graph`の背後にある同じエンジン — そのため、グラフの調整された力はそのまま移行できます。3次元で`forceLink` + `forceManyBody` + `forceCenter`を実行します。

d3シミュレーションは自身のノードレコード（`x`/`y`/`z`/`vx`/…）を変更するため、`setGraph` は各ノードを`GraphData.nodes`オブジェクトを直接渡すのではなく、内部のシミュレーションレコードにクローンします — 宣言された`fx`/`fy`/`fz`ピンのみが引き継がれます。シミュレーション独自のタイマーは決して開始されません；`step(iterations = 1)` は同期的にそれを刻みます。これにより、`D3ForceLayout` は `requestAnimationFrame` を偽装することなくWeb Worker内部で使用可能です。

## `VectoForceLayout`

```ts
new VectoForceLayout(options?: VectoForceLayoutOptions)

interface VectoForceLayoutOptions {
  linkDistance?: number;   // target resting length of links. Default 30.
  linkStrength?: number;   // spring stiffness of links. Default 0.3.
  repulsion?: number;      // many-body repulsion strength. Default 300.
  centerStrength?: number; // pull toward the centroid. Default 0.02.
  velocityDecay?: number;  // per-step velocity damping. Default 0.6.
  theta?: number;          // Barnes–Hut opening angle. Default 0.9.
  alphaDecay?: number;     // cooling rate. Default 0.0228; 0 disables cooling.
  alphaMin?: number;       // alpha below which step() reports cooled. Default 0.001.
  seed?: number;           // RNG seed for deterministic placement. Default 1.
  measurePhases?: boolean; // opt-in per-tick phase profiling. Default false.
}
```

自社製レイアウト（0.3.0で追加、かつデフォルト）：多体項にBarnes–Hutオクトツリーを使用した力指向シミュレーション — ランタイム依存なし、`seed`の下で決定的、Web Worker内で安全（`D3ForceLayout`と同じ`step(iterations)`契約）。位置と速度は**f32**で保持され（公開される`Float32Array`に一致）、オクトツリーは質量中心と反発積分を**f64**で累積します。実行間で同一の結果が欲しい場合にこれを選択します；`repulsion`/`linkStrength`で調整し、`alphaDecay`をゼロより上げる際は慎重に — すでに冷却の端に近いため、より高い値はグラフを後ではなく前に凍結させます。

```ts
layout.step(); // 1ティック
layout.step(5); // 1回の呼び出しで5ティック — フレームあたりの償却コスト削減
// ビジュアルの収束時間がティックあたりの滑らかさよりも重要なグラフ向け
```

**フェーズプロファイリング（0.5.0以降）。** `measurePhases: true` を設定すると、各ティックが壁時計時間を `[octree build, force accumulate, link springs, integrate]` に分割して `layout.tickPhases`（ミリ秒単位の `readonly` 4タプル；プロファイリングオフのときは `null`）に記録します。それ以外の場合、タイミング呼び出しは省略されるため、ホットパスにはコストがかかりません。

**WASMフォースカーネル（0.5.0以降）。** オプトインのRust/WASMカーネル（`crates/vectojs-force-rs`）が、ティックの支配的なフェーズであるオクトツリー構築＋反発累積を加速します。一方、リンクスプリング、センタリング、積分、ピンはJSに残ります：

```ts
import { forceWasmUrl } from '@vectojs/graph3d/wasm';

await layout.enableWasmForce(forceWasmUrl); // async; string | URL | Response
layout.enableWasmForceSync(bytes); // sync; BufferSource, never fetches
```

両方とも、いかなる失敗（CSP、404、破損モジュール）でも `false` を返し、ビット単位で同一のJS Barnes-Hutを黙って維持します。これは恒久的なフォールバックであり差分オラクルです。カーネルには `@vectojs/core` 依存がありません。

**ピン留め（0.2.0以降）。** `D3ForceLayout` と `VectoForceLayout` の両方がオプションのピンコントロールを実装しています（d3は`fx`/`fy`/`fz`、VectoForceLayoutは独自のピン配列を介して）。これが [`GraphInteraction`](/reference/graph3d-renderer/#graphinteraction--ホバー--選択--ドラッグピン) のドラッグ＆ピンを支えています：

```ts
layout.pinNode(i, x, y, z); // ノードiを(x,y,z)に毎ティック固定；positions[i]も即時更新
layout.reheat(0.3); // 冷却されたシミュレーションを起動し、残りをピンの周りに落ち着かせる
layout.unpinNode(i); // fx/fy/fzをクリア — ノードiは再び自由に
```

範囲外のインデックスは無視され（古いポインター操作がレイアウトをクラッシュさせることはありません）、`reheat` のalphaは `[alphaMin, 1]` にクランプされます。

**ライブでの力の変更。** `D3ForceLayoutOptions` はコンストラクタのみです；ライブセッターはありません。新しい`chargeStrength`/`linkDistance`を適用するには（例えばスライダーから）、古いインスタンスを`dispose()`し、新しいもので`setGraph()`します — トポロジー自体が変わらないグラフでは安価です。シミュレーションのみが再構築され、`Graph3D`のGPUバッファはそのままです：

```ts
function restartLayout() {
  layout.dispose();
  layout = new D3ForceLayout({ chargeStrength, linkDistance });
  layout.setGraph(data);
}
```

`VectoForceLayoutOptions` も同様にコンストラクタのみであるため、そのフォースを変更する場合も同じ再起動パターンが適用されます。

## 関連

レンダラー非依存の**2D**フォースレイアウト、インクリメンタルなトポロジ更新、インターリーブされたXY位置には、[`@vectojs/graph-layout`](/reference/graph-layout/) を使用してください。これは別パッケージであり、その `ForceLayout2D` とXYバッファは、このページの3D `GraphLayout` 契約やそのXYZ位置形状を実装していません。両方のAPIはホスト駆動の `step()` からアクティブ/冷却済みのブール値を返しますが、レイアウトタイプと位置バッファは交換可能ではありません。

[`Graph3D` & ピッキング](/reference/graph3d-renderer/)（`positions`を直接消費） ·
[`@vectojs/graph3d` 概要](/reference/graph3d/)
