+++
title = "数学ユーティリティ"
description = "平均O(1)のブロードフェーズ空間クエリのためのSpatialHashGridと、単一値の臨界調整可能スプリングのためのSpringPhysics — @vectojs/core が再エクスポートするスタンドアロンの @vectojs/math パッケージ。"
weight = 9
+++

# 数学ユーティリティ — `@vectojs/math`

`SpatialHashGrid` と `SpringPhysics` はスタンドアロンの **`@vectojs/math`** パッケージ（依存のないリーフパッケージ）です。[`@vectojs/core`](/reference/core-api/) はそれに依存し再エクスポートするため、`@vectojs/math` と `@vectojs/core` のどちらからでも解決されます。ここのスプリング積分器は、[`@vectojs/animation`](/reference/core-api/#エントリポイントとモジュールマップ) の `SpringDriver` の土台にもなっています。

```ts
new SpatialHashGrid(cellSize = ...)
grid.insert(id, x, y, w, h): void   // 毎フレーム呼び出しても安全（古いセルから再キー）
grid.remove(id): void
grid.query(x, y, w, h): Set<string> // O(k) セル + 結果；小さな均一エンティティに対して平均 O(1)
grid.clear(): void                  // 動的エンティティを再挿入する前に毎フレーム1回呼び出し
```

多数の移動エンティティに対するヒットテストまたは衝突候補クエリのためのブロードフェーズ空間インデックスです — 挿入時にエンティティをセルごとにバケットし、`query()` で領域を指定すると、すべてのエンティティをスキャンする代わりに、その領域と重なる可能性のあるIDのみを取得します。`insert()` は既存のエンティティに対しても毎フレーム呼び出し可能な冪等性を持ちます（古くなったセルから再キーされます）。これが通常のパターンです：毎フレーム `clear()` し、すべての動的エンティティを `insert()` し、そのフレームのヒットテストや衝突チェックに応じて `query()` します。

```ts
new SpringPhysics(initial: number)
spring.value / spring.target / spring.velocity
spring.stiffness / spring.damping / spring.mass
spring.update(dt): void
spring.isAtRest(): boolean
```

単一値の臨界減衰調整可能スプリング積分器です — `spring.target` を設定し、毎フレーム `update(dt)` を呼び出し、`spring.value` を読み取ります。これは `Entity` の組み込み [`springTo()`](/reference/core-entity/#アニメーション) が基づいているプリミティブです；6つのアニメーション可能な `Entity` プロパティのいずれでもない値（カスタムシェーダーユニフォーム、カメラフィールド、アプリケーションレベルのスカラー）に直接使用してください。`isAtRest()` は速度とターゲットへの距離の両方がエンジンの静止閾値を下回ったときに報告するため、呼び出し元は `update()` の呼び出しを停止できます。

## 関連情報

[`Entity`](/reference/core-entity/#アニメーション)（`springTo`、`SpringPhysics` 上に構築） ·
[`@vectojs/core` 概要](/reference/core-api/)
