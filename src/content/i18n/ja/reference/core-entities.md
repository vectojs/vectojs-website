---
title: 'その他のエンティティ'
description: 'Rect/Circle/Group形状プリミティブ、および@vectojs/coreメインエントリからのSplineEntity（ヴェクトマンシー曲線レンダリング）、DOMPortalEntity（実際のDOM要素をシーンに投影）、SVGEntity（ラスタライズSVGブリット）。'
order: 8
---

# その他のエンティティ（`.` から）

[`@vectojs/core`](/reference/core-api/) の一部です。

## Rect、Circle、Group（プリミティブ）

_`@vectojs/core` 1.9.0 で追加。_ 単純なボックス、ドット、またはトランスフォームコンテナに専用の [`Entity`](/reference/core-entity/) サブクラスが不要になった、すぐにインスタンス化可能な3つのエンティティです。

```ts
import { Rect, Circle, Group } from '@vectojs/core';

const box = new Rect({ width: 120, height: 64, fill: '#38bdf8', radius: 8 });
const dot = new Circle({ radius: 24, fill: '#f97316' });
const toolbar = new Group(saveBtn, undoBtn, redoBtn); // トランスフォーム専用コンテナ
toolbar.set({ x: 20, y: 20 });
scene.add(box, dot, toolbar); // 可変長引数 add()
```

**`Rect`** — ローカル `(0,0)` から `(width, height)` までの軸平行矩形です。

| `RectOptions` | デフォルト  | 効果                                                             |
| ------------- | ----------- | ---------------------------------------------------------------- |
| `width`       | `0`         | ローカル幅；エンティティのヒット/a11yボックスに一致します。      |
| `height`      | `0`         | ローカル高さ。                                                   |
| `fill`        | `'#38bdf8'` | CSS塗りつぶし、または `null`（明示的な `null` は保持されます）。 |
| `stroke`      | `null`      | CSSストローク、または `null`。                                   |
| `strokeWidth` | `1`         | ストローク幅（ローカル単位）。                                   |
| `radius`      | `0`         | 均一な角丸半径；`0` = 角が直角。                                 |

塗りつぶしのみで角が直角、ストロークなしの `Rect` はWebGLインスタンス矩形高速パス（`getBatchRect`、`pointBackend: 'webgl'` のみ）を使用します；ストロークや角丸がある場合は正確なCanvasパスでレンダリングされます。

**`Circle`** — ローカル原点 `(0,0)` を中心とする円盤です。a11yシャドウボックスは `-radius` だけオフセットされた bounding square で、描画された円盤をカバーします。

| `CircleOptions` | デフォルト  | 効果                                                     |
| --------------- | ----------- | -------------------------------------------------------- |
| `radius`        | `0`         | 半径（ローカル単位）。セッターがボックスを再同期します。 |
| `fill`          | `'#38bdf8'` | CSS塗りつぶし、または `null`。                           |
| `stroke`        | `null`      | CSSストローク、または `null`。                           |
| `strokeWidth`   | `1`         | ストローク幅（ローカル単位）。                           |

塗りつぶしのみでストロークなしの `Circle` は円 point-batch 高速パス（`getBatchCircle`）を使用します；ストローク付きの円は正確なCanvasパスでレンダリングされます。

**`Group`** — トランスフォーム専用コンテナ：何も描画せず、ヒットテストでも見えません（`isPointInside` は `false` を返します）。1つのトランスフォーム（`x`/`y`/`scale`/`rotation`/`opacity`）を子に適用するためだけに存在します。シーンのヒットテストは最初に子を再帰的にチェックするため、子は独立してインタラクティブのままです。子はインラインで渡します：`new Group(a, b, c)`。

これらのプリミティブが使用するために設計されたエルゴノミックヘルパーについては、[`Entity.set()`](/reference/core-entity/) と可変長引数 [`add()`](/reference/core-entity/) も参照してください。

## SplineEntity + loadSpline

```ts
loadSpline(url: string): Promise<SplineDocument>     // ヴェクトマンシー Spline JSON を fetch してパース（ブラウザ）
new SplineEntity(doc: SplineDocument, opts?: SplineOptions)
polySegmentToBezier(seg: SplineSegment): BezierControlPoints
```

ネイティブのヴェクトマンシー区分的3次 `Spline`/`Polyline` ドキュメントをレンダリングします。バウンディングボックスは `bounding_box` から（またはセグメント端点から計算）取得されるため、ビューポートカリングに参加します。

| `SplineOptions` | デフォルト  | 効果                                                                                                |
| --------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| `lineWidth`     | `2`         | ストローク幅（ローカル単位）。                                                                      |
| `cache`         | `true`      | `OffscreenCanvas` に一度ベイクして毎フレームblitします（無効の場合は毎フレームBézierストローク）。  |
| `defaultColor`  | `'#e2e8f0'` | 方程式の `color_rgb` が `null` の場合に使用されます。                                               |
| `hitTest`       | `'curve'`   | `'curve'` = 精密（曲線から `lineWidth/2 + hitTolerance` 以内）；`'aabb'` = バウンディングボックス。 |
| `hitTolerance`  | `0`         | `'curve'` モードでの追加のピック余白。                                                              |

公開プロパティ：`doc`、`lineWidth`、`defaultColor`、`hitTolerance`、`showBounds`（デフォルト `false`、デバッグアウトラインを描画）。`SplineColor` は `[r,g,b]`（0–1）、線形グラデーション記述子、または `null` です。

## DOMPortalEntity

```ts
new DOMPortalEntity(domElement: HTMLElement, width?, height?, id?)
```

エンティティを追跡するために配置/変換された**実際の**DOM要素（`matrix(...)` + 継承された不透明度 + ペイント順序からの z-index）をポータルレイヤーに投影します。リーフノードです — `add()` は警告を出し、子エンティティはサポートされていません。ネイティブのポインター/ホイール/フォーカスイベントを `VectoJSEvent` として転送します。`width`/`height` が0の場合、`ResizeObserver` を使用して内在サイズ（`cachedWidth`/`cachedHeight`）をキャッシュします。`destroy()` はリスナー、オブザーバー、および要素をデタッチします。

## SVGEntity（`@vectojs/core/text` から）

```ts
new SVGEntity(svgSource: string, id?)
setSVGSource(svgSource: string): void
```

SVG文字列を `ImageBitmap`/画像にラスタライズしてblitし、ターゲットスケール（LOD）で再ラスタライズするため、ズーム時も鮮明さを保ちます。`scene.toSVG()` はパーセントエンコードされたソースを、不活性なURLプレースホルダーではなく、分離されたネストSVG画像として埋め込みます。AABBヒットテストはローカル空間で行われます。

## 関連情報

[`Entity`](/reference/core-entity/)（これらの各エンティティが拡張する基底クラス） ·
[`@vectojs/core` 概要](/reference/core-api/)
