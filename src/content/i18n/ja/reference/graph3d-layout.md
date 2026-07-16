---
title: 'GraphLayout & D3ForceLayout'
description: 'グラフデータモデルとワーカーフレンドリーなGraphLayout契約、およびd3-force-3d上でのD3ForceLayout実装。'
order: 45
---

# `GraphLayout` & `D3ForceLayout`

[`@vectojs/graph3d`](/reference/graph3d/) の一部です。

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

`@vectojs/graph3d` は現在1つの実装を同梱しています。さらなるアダプター（`ngraph`）とDAGレイアウトモードがパッケージロードマップにあり、すべてこの同じインターフェースの背後にあるため、レンダラーやワーカーホストはどれが実行されているかを知る必要がありません。

## `D3ForceLayout`

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

```ts
layout.step(); // 1ティック
layout.step(5); // 1回の呼び出しで5ティック — フレームあたりの償却コスト削減
// ビジュアルの収束時間がティックあたりの滑らかさよりも重要なグラフ向け
```

**ピン留め（0.2.0以降）。** `D3ForceLayout` はd3-forceの`fx`/`fy`/`fz`を介してオプションのピンコントロールを実装しており、これが [`GraphInteraction`](/reference/graph3d-renderer/#graphinteraction-hover-select-drag-to-pin) のドラッグ＆ピンを支えています：

```ts
layout.pinNode(i, x, y, z); // ノードiを(x,y,z)に毎ティック固定；positions[i]も即時更新
layout.reheat(0.3); // 冷却されたシミュレーションを起動し、残りをピンの周りに落ち着かせる
layout.unpinNode(i); // fx/fy/fzをクリア — ノードiは再び自由に
```

範囲外のインデックスは無視され（古いポインター操作がレイアウトをクラッシュさせることはありません）、`reheat` のalphaはd3の通常の`[alphaMin, 1]`範囲にクランプされます。

**ライブでの力の変更。** `D3ForceLayoutOptions` はコンストラクタのみです；ライブセッターはありません。新しい`chargeStrength`/`linkDistance`を適用するには（例えばスライダーから）、古いインスタンスを`dispose()`し、新しいもので`setGraph()`します — トポロジー自体が変わらないグラフでは安価です。シミュレーションのみが再構築され、`Graph3D`のGPUバッファはそのままです：

```ts
function restartLayout() {
  layout.dispose();
  layout = new D3ForceLayout({ chargeStrength, linkDistance });
  layout.setGraph(data);
}
```

## 関連

[`Graph3D` & ピッキング](/reference/graph3d-renderer/)（`positions`を直接消費） ·
[`@vectojs/graph3d` 概要](/reference/graph3d/)
