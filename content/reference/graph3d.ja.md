+++
title = "@vectojs/graph3d"
description = "3Dフォース指向グラフ可視化：プラガブルなGraphLayoutインターフェースと、あらゆるグラフを2回の描画呼び出しで描画するインスタンシングThree.jsレンダラー。"
weight = 44
+++

# `@vectojs/graph3d`

文書化バージョン: **0.3.1**

VectoJS向け3Dフォース指向グラフ可視化：プラガブルな`GraphLayout`契約（ワーカーフレンドリー、位置を1つのフラットな`Float32Array`として保持）と`Graph3D`（インスタンシングされたThree.jsレンダラーで、ノード数にかかわらず任意のグラフを正確に2回の描画呼び出しで描画）。動く77ノード/254リンクの標準データセットについては、ライブの[Les Misérablesデモ](/demos/graph3d/)を参照してください。

## インストール

```bash
bun add @vectojs/graph3d three
```

`three` はピア依存関係です — `@vectojs/graph3d` は自分でシーンに追加する`THREE.Group`に描画し、`WebGLRenderer`、カメラ、コントロールは管理しません。

## 使用法

```ts
import { D3ForceLayout, Graph3D } from '@vectojs/graph3d';
import * as THREE from 'three';

const data = {
  nodes: [{ id: 'vectojs', val: 8, color: '#4f9cff' }, { id: 'core' }, { id: 'ui' }],
  links: [
    { source: 'vectojs', target: 'core' },
    { source: 'vectojs', target: 'ui' },
  ],
};

const layout = new D3ForceLayout();
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

## リファレンスページ

| ページ                                                        | 内容                                                                                                                                                                  |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/) | `GraphData`データモデル、ワーカーフレンドリーな`GraphLayout`契約、`D3ForceLayout`オプションとフォース再起動パターン。                                                 |
| [`Graph3D` & ピッキング](/reference/graph3d-renderer/)        | インスタンシングThree.jsレンダラー（`setGraphData`/`applyPositions`/`pickNode`/`getNodePosition`/`dispose`）と`GraphInteraction` — ホバー、選択、ドラッグ＆ピン留め。 |

---

## 設計ノート

- **設計上ワーカーフレンドリー。** `GraphLayout`インターフェースは、物理シミュレーションをメインスレッド外で実行できるようにするために特別に存在します — `positions` は `Float32Array` で、ゼロコピーで`postMessage`境界を越えて転送可能であり、`Graph3D.applyPositions()` はそのバッファが同期的な呼び出しからのものかワーカーメッセージからのものかを知る必要がありません。
- **レンダラー/レイアウトの分離は完全です。** `Graph3D` がレイアウトクラスをインポートすることはなく、`GraphLayout`の実装がThree.jsをインポートすることもありません — `D3ForceLayout`を将来の`ngraph`アダプターや、シミュレーションのない静的/事前計算済みレイアウトに交換するのは、呼び出し側での1行の変更で済みます。
- **インタラクティブなワールド内ノードカードとHUDコンポーネント**は、`@vectojs/ui` と [`@vectojs/three`](/reference/three/)（WebXRでも動作するシーン・トゥ・テクスチャビルボード）をベースに構築され、このパッケージの上に計画されている次のレイヤーです — まだ出荷されていません。

## 推奨ドキュメントサイトページ

- **Learn / 3Dグラフ可視化** — レイアウトとレンダラーの分離、`D3ForceLayout`の力の調整、ピッキング、ワーカーホスト型レイアウト。
- **Reference / API** — [`GraphLayout` & `D3ForceLayout`](/reference/graph3d-layout/)、[`Graph3D` & ピッキング](/reference/graph3d-renderer/)。
