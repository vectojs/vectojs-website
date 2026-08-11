+++
title = "Graph3D & ピッキング"
description = "あらゆるグラフを2回の描画呼び出しで描画するインスタンシングThree.jsレンダラーと、ホバー/クリックのノードピッキングのためのレイキャスティングパターン。"
weight = 46

[extra]
order = 46
+++

# `Graph3D` & ピッキング

[`@vectojs/graph3d`](/reference/graph3d/) の一部です。[`GraphLayout`](/reference/graph3d-layout/) の `positions` バッファを消費します。

## `Graph3D` — レンダラー

```ts
new Graph3D(options?: Graph3DOptions)

interface Graph3DOptions {
  nodeRadius?: number;   // valスケーリング前の基本ノード半径。デフォルト4。
  nodeSegments?: number; // 球のテッセレーション（幅/高さセグメント）。デフォルト12。
  nodeColor?: string;    // 色が宣言されていないノードのフォールバック色。デフォルト '#4f9cff'。
  linkColor?: string;    // リンク線の色。デフォルト '#9aa4b2'。
  linkOpacity?: number;  // リンク線の不透明度。デフォルト0.35。
}
```

### パブリックプロパティ

```ts
graph.group: THREE.Group // これをシーンに追加；ノードメッシュ＋リンク線を所有
```

### メソッド

```ts
setGraphData(data: GraphData): void
// 新しいグラフ用にGPUリソースを再構築：1つのInstancedMesh（共有SphereGeometryの
// nodeCountインスタンス、インスタンスごとの色＋∛valスケール）と
// 1つのLineSegments（linkCountセグメント）。インスタンスバッファは固定サイズなので、
// ノード/リンク数の変更は新しいメッシュを意味します — 同じトポロジへの
// スタイリングのみの変更は、別のパスを必要としないほど安価です。未知のリンク
// エンドポイント（`data.nodes`に存在しないsource/target id）は、警告なしに原点に線を
// 描画するのではなく、エラーをスローします。

applyPositions(positions: Float32Array): void
// xyzトリプレット（例：GraphLayoutの`.positions`）をインスタンス化された
// ノード行列とリンクエンドポイントに書き込みます。何かを動かしたレイアウトステップの
// 後に呼び出します。シミュレーション実行中は毎フレーム呼び出しても十分に安価です。

pickNode(raycaster: THREE.Raycaster): number | null   // 0.2.0以降
// 呼び出し側が設定したレイキャスター（カメラ＋ポインターNDCから設定）で
// ノードクラウドのみをヒットテストし、最も近くに当たったノードのインデックスを返します —
// `GraphData.nodes`配列に一致 — ミスの場合は`null`。リンクは決して
// ピックされないため、リンク線をかすめるレイはミスを報告します。

getNodePosition(index: number, target: THREE.Vector3): THREE.Vector3 | null   // 0.2.0以降
// ノードの現在のワールド位置（最後にapplyPositionsで書き込まれたもの）を
// インスタンス行列から直接`target`に読み取ります。範囲外の
// インデックスまたはノードメッシュが存在しない場合は`null`。

dispose(): void
// ノードメッシュとリンク線の両方のジオメトリ/マテリアル/メッシュGPUリソースを解放し、
// `group`を空にします。
```

すべてのノードに1つの`InstancedMesh`（インスタンスごとの色と`∛val`比例半径）と、すべてのリンクに1つの`LineSegments`、両方とも単一の`THREE.Group`の下 — インスタンシングの要点は、グラフのサイズが10ノードでも10,000ノードでも、コストが正確に**2回の描画呼び出し**であることです。`Graph3D` は任意の[`GraphLayout`](/reference/graph3d-layout/)形状の位置バッファを消費し、それらの数値がどのように計算されたかを知らないため、レンダリングコードに触れることなくレイアウトを交換可能（またはワーカーホスト）に保てます。

リンク線は `frustumCulled = false` に設定されています — エンドポイントはレイアウトのティックごとに移動し、通常は背景要素であるもののフレームごとに境界を再計算することは、常に描画するのに比べて無駄な作業だからです。

## ピッキング（ホバー / クリック）

0.2.0以降、`pickNode()` は**ノードクラウドのみ**をヒットテストするため、ノード/リンクの子が混在する中で `intersectObjects` + `instanceId` フィルタリングを手動で行う必要はもうありません。カメラとポインターNDCから `THREE.Raycaster` を設定し、当たったノードインデックス（`GraphData.nodes` に一致）を読み取ります：

```ts
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;

  raycaster.setFromCamera(ndc, camera);
  const index = graph.pickNode(raycaster); // number | null；リンクは決して一致しない
  const node = index !== null ? data.nodes[index] : null;
});
```

## `GraphInteraction` — ホバー / 選択 / ドラッグ＆ピン

0.2.0以降、`GraphInteraction` は上記のポインター配管をホバー、選択、ドラッグ＆ピンにラップします — そうでなければすべてのインタラクティブ3Dグラフアプリが手作業で再構築する部分です。`domElement` に3つのポインターリスナーを所有し、それ以外は何も持ちません：シーン、レンダーループ、コントロールはありません。ホストは自身のアニメーションループとレイアウト `step()` を駆動し続けます。

```ts
const interaction = new GraphInteraction({
  graph, // Graph3D
  camera, // ピッキングレイの構築元となるカメラ
  domElement: canvas, // ポインターイベントを読み取る要素
  layout, // GraphLayout；ドラッグ＆ピンに必要（pinNodeが必要）
  nodeCount: data.nodes.length, // オプションのインデックスガード
  onHover: (i) => {
    /* i: number | null */
  },
  onSelect: (i) => {
    /* ドラッグではなかったクリック；null = 空領域の選択解除 */
  },
  setControlsEnabled: (enabled) => (controls.enabled = enabled), // ドラッグ中にOrbitControlsを一時停止
});
// …後で
interaction.dispose(); // ポインターリスナーを削除
```

ドラッグは**機能検出されます**：ピン対応レイアウト（[`D3ForceLayout`](/reference/graph3d-layout/)が提供するような`pinNode`実装）がない場合、プレスは選択にフォールバックします。`onDragStart`/`onDrag`/`onDragEnd`、`pinOnDrag`（デフォルト`true`）、`dragReheat`（デフォルト`0.3`）、`dragThreshold`（デフォルト`4`px）でオプションを補完します。

## 関連

[`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/)（これが消費する`positions`バッファと、ドラッグ＆ピンが依存する`pinNode`を生成） ·
[`@vectojs/graph3d` 概要](/reference/graph3d/)
