+++
title = "ThreeRenderer"
description = "VectoJS Scene の IRenderer バックエンドとして Three.js を使用する：実装済みメソッド、GLSL グラデーションシェーダーレイアウト、および線幅に関する注意点。"
weight = 43

[extra]
order = 43
+++

# `ThreeRenderer`

[`@vectojs/three`](/reference/three/) の一部。

`ThreeRenderer` は Three.js を使用して [`@vectojs/core`](/reference/core-renderer/) の `IRenderer` インターフェースを実装します — 塗りつぶし、ストローク、およびテキストは Canvas 2D 操作ではなく、正投影シーン内の Three.js メッシュおよびラインとしてレンダリングされます。プロジェクトにすでに Three.js が含まれており、VectoJS シーン自体を Canvas 2D ではなく WebGL パイプラインでレンダリングしたい場合に使用します。

## 使用するタイミング

- VectoJS の 2D コンテンツを、指定されたキャンバス用に作成された専用の `THREE.WebGLRenderer` を通じて Three.js オブジェクトとしてレンダリングしたい場合。
- GLSL シェーダーによるハードウェアアクセラレーションのグラデーション塗りつぶしが必要な場合。
- 純粋な WebGL 2D パイプラインのベンチマークや実験を行っている場合。

2D UI を 3D サーフェスに埋め込む場合は、代わりに [`ThreeAdapter`](/reference/three-adapter/) を使用することをお勧めします — Canvas 2D レンダリングを放棄する必要はありません。

## コンストラクタ

```ts
new ThreeRenderer(canvas: HTMLCanvasElement)
```

作成するもの：

- `{ canvas, alpha: true, antialias: true }` オプションの `THREE.WebGLRenderer`
- Y 軸が下向き（top = 0、bottom = height）で VectoJS の座標系に一致する `THREE.OrthographicCamera`
- ピクセル比は `window.devicePixelRatio` に自動設定され、ランタイムで変化する際に**同期されたまま**になります（下記参照）

`ThreeRenderer` はこの WebGLRenderer を作成して所有します。既存のレンダラー/コンテキストを受け入れたり再利用したりしません。`dispose()` はアクティブなオブジェクトを削除し、そのジオメトリ/マテリアル/テクスチャリソースを解放し、スタックをリセットし、所有する WebGLRenderer を正確に 1 回破棄します。また、以下で説明するコンテキスト損失とDPRリスナーをデタッチするため、破棄されたレンダラーは遅いイベントによって復活させられません。

## GPUコンテキストの損失とランタイムDPR

GPUリセットまたはメモリ圧迫による除去がなければ、Threeでバックされたシーンは永久に空白のままになり、モニターの移動やブラウザのズームは古いピクセル比でレンダリングしたままになります（ぼやけたりエイリアシングが発生）。`ThreeRenderer` は両方を処理します：

- **`webglcontextlost`** は `preventDefault()` されます — 必須です。そうでなければブラウザは復元イベントを永遠に発火しません — そして `isContextLost()` を反転します。損失中は `present()` がno-opになります。死んだコンテキストに対して描画することは無意味だからです。
- **`webglcontextrestored`** はピクセル比とサイズを再適用し（復元が異なるディスプレイに来ることもあります）、フラグをクリアし、新しくクリアされたフレームバッファの再描画を強制します。Threeの `WebGLRenderer` は次のレンダリング時にGL状態を遅延的に再構築します。
- **DPRの変更**は `(resolution: Ndppx)` メディアクエリで追跡され、`setPixelRatio` + `setSize` を再適用し、自身を再アームします（クエリはワンショットです）。

これらすべてはSSR / `OffscreenCanvas`向けにガードされています（`addEventListener` や `matchMedia` なし）。`isContextLost()` はオプションの [`IRenderer`](/reference/core-renderer/#gpuコンテキスト消失への対応) フックも満たすため、`Scene.render` はコンテキストが消失している間そのパスをスキップします。

## パブリックプロパティ

| プロパティ        | 型                         |
| ----------------- | -------------------------- |
| `scene`           | `THREE.Scene`              |
| `camera`          | `THREE.OrthographicCamera` |
| `renderer`        | `THREE.WebGLRenderer`      |
| `isContextLost()` | `() => boolean`            |

## 使用方法

レンダラーを VectoJS `Scene` コンストラクタの `renderer` オプションとして渡します：

```ts
import { Scene } from '@vectojs/core';
import { ThreeRenderer } from '@vectojs/three';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const threeRenderer = new ThreeRenderer(canvas);

const scene = new Scene(canvas, { renderer: threeRenderer });
scene.add(/* entities */);
scene.start();
```

## 実装済み IRenderer メソッド

| メソッド                                                                                  | 備考                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beginPath()` `moveTo()` `lineTo()` `bezierCurveTo()` `closePath()` `arc()` `roundRect()` | パス累積；`fill()` または `stroke()` でフラッシュされます。                                                                                                            |
| `fill(colorOrGradient)`                                                                   | 単色塗りつぶしは `MeshBasicMaterial`、グラデーションは GLSL `ShaderMaterial`（下記参照）。CSS 色のアルファ値は継承されたレンダラーアルファに乗算されます。             |
| `stroke(colorOrGradient, lineWidth?)`                                                     | `LineBasicMaterial`。以下の線幅に関する注意点を参照してください。                                                                                                      |
| `fillText(text, x, y, font, color)`                                                       | オフスクリーンキャンバスにテキストをレンダリングし、`THREE.CanvasTexture` としてアップロードします。グラデーションは最初のカラーストップにフォールバックします。       |
| `fillCircle(cx, cy, radius, color, alpha?)`                                               | 32 セグメントの `THREE.CircleGeometry` + `MeshBasicMaterial`。                                                                                                         |
| `drawImage(source, dx, dy, dw, dh)`                                                       | `THREE.CanvasTexture` + `PlaneGeometry`。                                                                                                                              |
| `save()` `restore()` `translate()` `scale()` `rotate()` `setGlobalAlpha()` `clip()`       | 変換/アルファスタック。ネストされたクリップは交差します。シザークリッピングは変換されたワールド AABB を使用するため、回転/シアーされたクリップは軸平行近似になります。 |
| `createLinearGradient(x0, y0, x1, y1, colorStops)`                                        | `fill()` で消費される `WebGLGradient` 記述子を返します。                                                                                                               |
| `flush()`                                                                                 | `renderer.render(scene, camera)` を呼び出します。                                                                                                                      |
| `resize(width, height)`                                                                   | `renderer.setSize()` を更新し、カメラ境界を再計算します。                                                                                                              |
| `clear()`                                                                                 | フレームのジオメトリ/マテリアルを破棄し、パス、変換、アルファ、シザースタックの状態をリセットします。                                                                  |

## 線幅に関する注意点

`THREE.LineBasicMaterial.linewidth` は、**ほとんどのプラットフォームで WebGL によって静かに無視されます** — `stroke()` に渡された値にかかわらず、線は 1 px に制限されます。これはブラウザ/GPU ドライバの制限であり、VectoJS の制限ではありません。

デザインに太いストローク（> 1 px）が必要な場合は、以下を検討してください：

- 直線の場合、`stroke()` の代わりに矩形パスを使用した `fill()` を使用する。
- Canvas 2D を介して任意の線幅をサポートするデフォルトの `CanvasRenderer` を備えた [`ThreeAdapter`](/reference/three-adapter/) に切り替える。
- アプリケーション層で `THREE.MeshLine` を手動で統合する — `ThreeRenderer` はこの依存関係をバンドルしていません。

## グラデーションサポート

`ThreeRenderer.createLinearGradient()` は `WebGLGradient` 記述子を返します。`fill()` に渡されると、レンダラーは以下のユニフォームレイアウトで GLSL `ShaderMaterial` をコンパイルします：

```glsl
uniform vec4 u_grad_colors[8];  // ストップごとの RGBA
uniform float u_grad_stops[8];  // 正規化された位置 [0, 1]
uniform vec2 u_grad_start;      // ワールド空間の開始点
uniform vec2 u_grad_end;        // ワールド空間の終了点
```

色はワールド空間内の最も近い 2 つのストップ間で線形補間されます。8 ストップを超えるストップが提供された場合、アップロード前に 8 個の等間隔ポイントにリサンプリングされるため、8 ストップを超える色の詳細は失われます。

**`stroke()` または `fillText()` ではグラデーションはサポートされていません。** `WebGLGradient` を `stroke()` に渡すと、最初のストップ色にフォールバックします。`fillText()` も最初のストップ色にフォールバックします。これは、テキストグリフがアップロード前に Canvas 2D を介してラスタライズされるためです。

グラデーション/DPI/ポインターの問題のトラブルシューティングについては、[メインの `@vectojs/three` ページ](/reference/three/#トラブルシューティング) を参照してください。

## 関連情報

[`ThreeAdapter`](/reference/three-adapter/)（代替ユースケース — 3D サーフェス上の 2D パネル） ·
[`IRenderer` / `CanvasRenderer`](/reference/core-renderer/)（これが実装するインターフェース） ·
[`@vectojs/three` 概要](/reference/three/)
