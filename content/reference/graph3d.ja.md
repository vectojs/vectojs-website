+++
title = "@vectojs/graph3d"
description = "3Dフォース指向グラフ可視化：プラガブルなGraphLayoutインターフェースと、あらゆるグラフを2回の描画呼び出しで描画するインスタンシングThree.jsレンダラー。"
weight = 44
+++

# `@vectojs/graph3d`

文書化バージョン: **0.6.1**

VectoJS向け3Dフォース指向グラフ可視化：プラガブルな`GraphLayout`契約（ワーカーフレンドリー、位置を1つのフラットな`Float32Array`として保持）と`Graph3D`（インスタンシングされたThree.jsレンダラーで、ノード数にかかわらず任意のグラフを正確に2回の描画呼び出しで描画）。動く77ノード/254リンクの標準データセットについては、ライブの[Les Misérablesデモ](/demos/graph3d/)を参照してください。

## インストール

```bash
bun add @vectojs/graph3d three
```

`three` はピア依存関係です — `@vectojs/graph3d` は自分でシーンに追加する`THREE.Group`に描画し、`WebGLRenderer`、カメラ、コントロールは管理しません。

## 使用法

```ts
import { VectoForceLayout, Graph3D } from '@vectojs/graph3d';
import * as THREE from 'three';

const data = {
  nodes: [{ id: 'vectojs', val: 8, color: '#4f9cff' }, { id: 'core' }, { id: 'ui' }],
  links: [
    { source: 'vectojs', target: 'core' },
    { source: 'vectojs', target: 'ui' },
  ],
};

const layout = new VectoForceLayout();
layout.setGraph(data);

const graph = new Graph3D();
graph.setGraphData(data);
scene.add(graph.group);

function animate() {
  const active = layout.step();
  graph.applyPositions(layout.positions);
  renderer.render(scene, camera);
  if (active) requestAnimationFrame(animate);
}
animate();
```

`layout.step()` はシミュレーションが冷えた（alphaがしきい値を下回った）ら `false` を返します — 上の例ではその時点で自身のrAFループを停止しますが、ユーザーがライブで力を調整できるようにする呼び出し元（電荷強度、リンク距離）は、`OrbitControls`の減衰とカメラ移動がレイアウトの収束後も滑らかであるよう、物理の`step()`/`applyPositions()`呼び出しのみをそのフラグでゲートし、レンダリングは毎フレーム続けるべきです。

`VectoForceLayout`（自社製のBarnes-Hutオクトツリーレイアウト、ランタイム依存なし）がデフォルトです。[`D3ForceLayout`](/reference/graph3d-layout/#d3forcelayout) は引き続き利用可能ですが、`d3-force-3d` が必要です。両者は同じ `GraphLayout` 契約の背後でドロップイン交換可能です。

## GraphCamera

0.4.0以降、`GraphCamera` は独自のThree.jsコントロールを持ち込まないホスト向けの、バッテリー同梱カメラ＋コントロールです。1つの `camera` ゲッターの背後に、2D正投影パン/ズームビューと3D透視投影オービットビューを備えています。

```ts
import { GraphCamera } from '@vectojs/graph3d';

const camera = new GraphCamera({ domElement: canvas, mode: '3d' }); // '2d' (ortho) is the default
camera.fitToPositions(layout.positions); // frame the graph; skips non-finite points
camera.setMode('2d'); // switch to orthographic pan/zoom
camera.setSize(width, height); // call on canvas resize
camera.dispose(); // remove pointer/wheel listeners
```

`mode: '2d' | '3d'` はカメラタイプを選択します。`fitToPositions(positions)` はxyzトリプレットバッファ（[`applyPositions`](/reference/graph3d-renderer/#メソッド) が消費するのと同じ形状）をフレームに収めます。`() => camera.camera`（ゲッターなので `setMode` はライブのまま）を渡して `GraphInteraction` と組み合わせ、ノードのドラッグがビューまでパンしないように `setControlsEnabled` を配線します。

## WASMフォースカーネル

`VectoForceLayout` は、オプションのRust/WASMフォースカーネル（`crates/vectojs-force-rs`。同じ場所に配置された `vectojs_force.wasm` として公開）を同梱しており、Barnes-Hutオクトツリー構築＋反発累積 — ティックの実測78–90% — を加速します。読み込み/インスタンス化のいかなる失敗でも黙って `false` を返し、ビット単位で同一のJS Barnes-Hutを維持するため、投機的に有効にしても安全です。

```ts
import { forceWasmUrl } from '@vectojs/graph3d/wasm';

await layout.enableWasmForce(forceWasmUrl); // streaming (browser): URL | Response
layout.enableWasmForceSync(bytes); // raw bytes (Node/tests), never fetches
```

カーネルには `@vectojs/core` 依存がなく、`three` が唯一のピアのままです。`measurePhases` プロファイリングオプションを含む完全なレイアウトAPIについては [`VectoForceLayout`](/reference/graph3d-layout/#vectoforcelayout) を参照してください。

## リファレンスページ

| ページ                                                        | 内容                                                                                                                                                                    |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/) | `GraphData`データモデル、ワーカーフレンドリーな`GraphLayout`契約、`VectoForceLayout`（デフォルト）と`D3ForceLayout`のオプション、WASMカーネル、フォース再起動パターン。 |
| [`Graph3D` & ピッキング](/reference/graph3d-renderer/)        | インスタンシングThree.jsレンダラー（`setGraphData`/`applyPositions`/`pickNode`/`getNodePosition`/`dispose`）と`GraphInteraction` — ホバー、選択、ドラッグ＆ピン留め。   |

---

## 設計ノート

- **設計上ワーカーフレンドリー。** `GraphLayout`インターフェースは、物理シミュレーションをメインスレッド外で実行できるようにするために特別に存在します — `positions` は `Float32Array` で、ゼロコピーで`postMessage`境界を越えて転送可能であり、`Graph3D.applyPositions()` はそのバッファが同期的な呼び出しからのものかワーカーメッセージからのものかを知る必要がありません。
- **レンダラー/レイアウトの分離は完全です。** `Graph3D` がレイアウトクラスをインポートすることはなく、`GraphLayout`の実装がThree.jsをインポートすることもありません — `VectoForceLayout`を`D3ForceLayout`、シミュレーションのない静的/事前計算済みレイアウト、または将来の`ngraph`アダプターに交換するのは、呼び出し側での1行の変更で済みます。
- **インタラクティブなワールド内ノードカードとHUDコンポーネント**は、`@vectojs/ui` と [`@vectojs/three`](/reference/three/)（WebXRでも動作するシーン・トゥ・テクスチャビルボード）をベースに構築され、このパッケージの上に計画されている次のレイヤーです — まだ出荷されていません。

## 推奨ドキュメントサイトページ

- **Learn / 3Dグラフ可視化** — レイアウトとレンダラーの分離、`VectoForceLayout`の力の調整、ピッキング、ワーカーホスト型レイアウト。
- **Reference / API** — [`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/)、[`Graph3D` & ピッキング](/reference/graph3d-renderer/)。
