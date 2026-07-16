---
title: 'Runtime Architecture'
description: 'Scene、Entity、レンダーループ、アクセシビリティ投影、バックエンドがどのように連携するか。'
order: 3
---

# Runtime Architecture

VectoJSは、キャンバスごとに1つの`Scene`と、保持された`Entity`インスタンスのツリーを中心に構成されています。このツリーは視覚的状態、レイアウト状態、イベント動作、セマンティックメタデータを格納します。

<figure>
  <img src="/images/vmt-architecture.svg" alt="エンティティツリー、キャンバスレンダリング、A11yシャドウレイヤーを示すVMTアーキテクチャ図。" class="diagram" />
  <figcaption>SceneはVirtual Math Treeを辿り、ピクセルをキャンバスにレンダリングし、セマンティクスをDOMに投影します。</figcaption>
</figure>

## Virtual Math Tree

各エンティティは次を持ちます：

- `x`、`y`、`scaleX`、`scaleY`、`rotation`、`opacity`；
- 境界のための`width`と`height`；
- `children`配列；
- 状態変更のための`update(dt, time)`；
- ローカル座標で描画するための`render(renderer)`；
- hit-testingのための`isPointInside(globalX, globalY)`；
- 投影されたセマンティクスのための任意の`getA11yAttributes()`。

変換はツリーを下って合成されます。ネストされた、あるいは変換されたエンティティをhit-testingする際は`worldToLocal()`を使ってください。

## フレームパイプライン

<figure>
  <iframe src="/sandbox/diagram-pipeline.html" class="diagram-frame" loading="lazy" title="The VectoJS render loop: the six stages of one dirty frame, rendered live by VectoJS" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>1つのダーティフレーム：更新、カリング、レンダー、バックエンドバッチのフラッシュ、そして投影されたDOMの同期。</figcaption>
</figure>

## アクセシビリティ投影

透明なDOMレイヤーがキャンバスの上に配置されます。インタラクティブなエンティティは、`<button>`、`<input>`、`<a>`、そしてロールを持つ`<div>`ノードなどの実際の要素を投影できます。

そのレイヤーは、キャンバスUIを次のようにします：

- スクリーンリーダーによって発見可能；
- キーボードとネイティブなフォームコントロールを通じて操作可能；
- Playwrightのロールセレクターでテスト可能；
- DOMセマンティクスに依存するAIエージェントによって駆動可能。

この投影はデザインレビューの代わりにはなりません。アプリケーションは依然として、ラベル、フォーカス順序、キーボード動作、コントラスト、モーション低減の動作を所有します。

## レンダリングバックエンド

| バックエンド          | 使うとき                    | 機能                                             |
| --------------------- | --------------------------- | ------------------------------------------------ |
| `CanvasRenderer`      | デフォルト                  | デバイスピクセル比スケーリング付きのCanvas 2D    |
| WebGLポイントレイヤー | `pointBackend: 'webgl'`     | バッチ化された円/矩形とGPUグリフパス             |
| WebGPUコンピュート    | `particleBackend: 'webgpu'` | フォールバック付きのコンピュート駆動パーティクル |
| `SVGRenderer`         | `scene.toSVG()`             | ヘッドレスなSVGエクスポート                      |

バックエンドの選択は、バックエンドがボトルネックに一致するときにのみ役立ちます。テキストレイアウトやアプリの計算が支配的であれば、CanvasをWebGLに変えても遅いパスは修正されません。

## ライフサイクル

```ts
const scene = new Scene(canvas, { maxFPS: 60 });
scene.renderMode = 'onDemand';
scene.resize(width, height);
scene.start();

// later
scene.destroy();
```

ホストコンポーネントがアンマウントされるときは、常にシーンを破棄してください。シーンはレンダラーリソース、オブザーバー、ワーカー、投影されたDOM、イベント状態を所有しています。

## 次のステップ

- [Engine Concepts](/learn/engine-concepts/)が数学的な柱を説明します。
- [Core Scene](/learn/core-scene/)が実践的なAPIを示します。
