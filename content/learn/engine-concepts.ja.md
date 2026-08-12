+++
title = "エンジンコンセプト"
description = "VectoJSの背後にある8つの数学的およびアーキテクチャ的アイデア。"
weight = 4
+++

# エンジンコンセプト

VectoJSは少数の数学とランタイムのアイデアに基づいて構築されています。このページは地図であり、より深い導出は[数学的基礎](/learn/math-foundations/)にあります。

<figure>
  <img src="/images/engine-concepts-map.svg" alt="仮想数学ツリーを中心に、アフィン変換、ヒットテスト、コールド/ホットレイアウト、集合差テキストフロー、セマンティック投影、スプリングモーション、SpatialHashGridに接続されたコンセプトマップ。" class="diagram" />
  <figcaption>仮想数学ツリーがハブであり、変換、レイアウト、ヒットテスト、モーション、セマンティック投影がランタイムのスポークです。</figcaption>
</figure>

## 1. 仮想数学ツリー

VMTは、視覚DOMサブツリーをローカライズされた座標系のJavaScriptシーングラフに置き換えます。トラバーサル、ヒットテスト、アクセシビリティ同期は依然として実際の処理ですが、視覚レイアウトはエンティティごとにブラウザのスタイルとリフローを回避します。

- 理論：[数学的基礎：VMT](/learn/math-foundations/#1-virtual-math-tree-vmt)
- 実践：[コアシーン](/learn/core-scene/)

## 2. セマンティック投影オーバーレイ

対象となるインタラクティブエンティティは、キャンバス境界上に実際の透明DOMノードを投影します。キャンバスがピクセルを所有し、DOM投影がロール/名前/状態およびネイティブ入力動作を所有します。

- 理論：[数学的基礎：a11yRoot](/learn/math-foundations/#2-semantic-shadow-dom-a11yroot)
- 実践：[アクセシビリティ](/learn/accessibility/)

## 3. アフィン変換

エンティティの変換、スケール、回転はツリー下で合成されます。`worldToLocal()`は変換を解析的に反転し、ポインターイベントをターゲットエンティティのローカル座標にマッピングできるようにします。

- 理論：[数学的基礎：アフィン変換](/learn/math-foundations/#3-アフィン変換)

## 4. コールド/ホットレイアウト

テキストレイアウトは、高コストなコンテンツ準備とレスポンシブな折り返しを分離します。コンテンツの変更はコールドパスを実行し、幅の変更は準備済みの測定値を再利用できます。

- 理論：[数学的基礎：コールド/ホット分割](/learn/math-foundations/#4-coldhotスプリットレイアウトエンジン)
- 実践：[テキストとタイポグラフィ](/learn/text-typography/)

## 5. 集合差テキストフロー

障害物の周りの折り返しは、区間の減算としてモデル化できます：

$$I_{\text{allowed}} = I_0 \setminus \bigcup E_k$$

- 理論：[数学的基礎：集合差代数](/learn/math-foundations/#5-テキストフローのための集合差代数)

## 6. サンプリングスプラインヒットテスト

`SplineEntity`は曲線をキャッシュされた線分にサンプリングし、ポインター距離の二乗をそれらの線分と比較します。これによりピクセル読み取りが不要になり、AABBのみのヒットテストより正確です。

- 理論：[数学的基礎：サンプリングスプラインヒットテスト](/learn/math-foundations/#6-サンプリングされたスプラインhit-testing)

## 7. 半陰的オイラー動力学

中断されたUI遷移は、一回限りのCSSタイマーではなくばね様システムとしてモデル化されます。ターゲットは飛行中に変更でき、モーションは連続的に保たれます。

- 理論：[数学的基礎：ODE動力学](/learn/math-foundations/#7-微分方程式と半陰的オイラーソルバー)
- 実践：[物理とアニメーション](/learn/physics-engine/)

## 8. SpatialHashGridユーティリティ

VectoJSはアプリケーション所有の近接クエリ用に固定セルの`SpatialHashGrid`をエクスポートします。Sceneはすべてのエンティティに対して自動的に設定しません。

- 理論：[数学的基礎：SpatialHashGridユーティリティ](/learn/math-foundations/#8-spatialhashgridユーティリティ)
- 実践：[パフォーマンス](/learn/performance/)

## 次のステップ

- [ランタイムアーキテクチャ](/learn/runtime-architecture/)がこれらの概念をフレームパイプラインに接続します。
- [数学的基礎](/learn/math-foundations/)が公式をより深く掘り下げます。
