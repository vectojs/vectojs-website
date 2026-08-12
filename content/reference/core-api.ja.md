+++
title = "@vectojs/core APIリファレンス"
description = "Vectoの背後にあるゼロDOMレンダリングエンジンの概要とエントリポイントマップ — coreのScene、Entity、レンダラー、パーティクル、a11y、そしてcoreが再エクスポートするスタンドアロンの@vectojs/text、@vectojs/layout、@vectojs/math、@vectojs/animationエンジン。"
weight = 1
+++

# `@vectojs/core` APIリファレンス

Vectoの背後にあるゼロDOMレンダリングエンジン。`Scene` は `Entity` ノード（**Virtual Math Tree**）のツリーを所有し、`requestAnimationFrame` ループを駆動し、バックエンドに依存しない `IRenderer`（デフォルトはCanvas 2D）を介して描画し、透過的なARIA/オートメーションシャドウレイヤーを投影することで、キャンバスのアクセシビリティとエージェント駆動を維持します。

> このページとそのサブページは、公開されている `.d.ts`（パブリックインターフェース）と `packages/core/src` ソース（動作）から生成されています。ここに記載されたシグネチャは、ナラティブな `docs/usage/*` ガイドの内容よりも優先されます。特に、実際のコンストラクタは `new Scene(canvasElement, options)` であり、一部の古いドキュメントが示す `{ canvasId }` 形式ではありません。

## リファレンスページ

以下の各分野には専用のページがあり、シグネチャ、注意点、および他のページへのリンクを含む「関連情報」フッターが付いています：

| 分野                                                  | 内容                                                                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`Scene`](/reference/core-scene/)                     | コンストラクタ、`SceneOptions`、パブリックフィールド、`renderMode`/`maxFPS`/アイドルスロットル、ライフサイクルメソッド、バックエンドレジストリ。 |
| [`Entity`](/reference/core-entity/)                   | 抽象VMTノード：トランスフォーム、アニメーションシステム、キャプチャ/バブルイベント、a11y/バッチフック。                                          |
| [レイアウトエンジン](/reference/core-layout/)         | `LayoutEngine` のコールド/ホット分割、ストリーミングメモ化、リッチテキスト、除外シェイプ。                                                       |
| [レンダラー](/reference/core-renderer/)               | `IRenderer`、`CanvasRenderer`、`SVGRenderer`、WebGL点/矩形/MSDFレイヤー、コンテンツ投影、`parseColorToRGBA`。                                    |
| [`ComputeParticleEntity`](/reference/core-particles/) | 高スループットパーティクルレイヤー：メモリレイアウト、CPUシミュレーション、WebGPU vs CPU。                                                       |
| [テキスト＆Bidi](/reference/core-text/)               | `MSDFFont`、`MSDFTextEntity`、`TextEntity`/`GridTextEntity`、アラビア語整形 + Bidi解決。                                                         |
| [その他のエンティティ](/reference/core-entities/)     | `SplineEntity`、`DOMPortalEntity`、`SVGEntity`。                                                                                                 |
| [数学ユーティリティ](/reference/core-math/)           | `SpatialHashGrid`、`SpringPhysics`。                                                                                                             |
| [アニメーション](/reference/animation/)               | スタンドアロンの `@vectojs/animation` エンジン：`TweenDriver`/`SpringDriver`、`MotionConfig`、イージングカーブ。                                 |
| [スタイル](/reference/styles/)                        | スタンドアロンの `@vectojs/styles` レイヤー：CSS命名のスタイルオブジェクト、`var()`トークンテーマ、`setTheme`切替、`css()`マージ。               |
| [a11yRoot & エージェント契約](/reference/core-a11y/)  | シャドウDOM投影、`A11yAttributes`、同期の注意点。                                                                                                |

## エントリポイントとモジュールマップ

layout、text-shaping、math、animationの各エンジンは、それぞれ独立したスタンドアロンのパッケージとして公開されています。`@vectojs/core` はそれらすべてに**依存し再エクスポートする**ため、以下のインポートはすべて `@vectojs/core`（およびツリーシェイク可能なサブパス）から解決され続けます。シーングラフランタイムなしで依存の範囲を小さく抑えたいときは、スタンドアロンのパッケージから直接インポートしてください。

`@vectojs/core` は1つの副作用を持つメインエントリと、3つのツリーシェイク可能なサブパスを、4つのスタンドアロンパッケージとともに提供します：

| インポート               | 内容                                                                                                                                                                                              | 副作用                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `@vectojs/core` (`.`)    | すべて：`Scene`、`Entity`、全エンティティ、レンダラー、加えて再エクスポートされたlayout、text、math、animationの各エンジン。                                                                      | インポート時に**両方**のプラガブルバックエンド（WebGL点レンダラー + WebGPUパーティクルマネージャー）を自動登録します。 |
| `@vectojs/core/layout`   | `@vectojs/layout` を再エクスポート：`LayoutEngine`、`PreparedText`、`createCanvasMeasurer`、`LayoutResultBuffer`、`LayoutWorkerManager`、`computeLineSegments`、レイアウト型。                    | なし。                                                                                                                 |
| `@vectojs/core/renderer` | `IRenderer`、`CanvasRenderer`、`SVGRenderer`、`PointRenderer`、`createWebGLPointRenderer`、`WebGPUParticleSystemManager`、`parseColorToRGBA`、`RGBA`。                                            | なし。                                                                                                                 |
| `@vectojs/core/text`     | `@vectojs/text` に加えてcore常駐の `MSDFTextEntity`/`SVGEntity` を再エクスポート：`MSDFFont`、`ArabicShaper`、`BidiResolver`、`Typography`、`prepareContentGrid`、`PreparedContentGrid`、MSDF型。 | なし。                                                                                                                 |
| `@vectojs/text`          | スタンドアロンのテキストシェイピングプリミティブ：`BidiResolver`、`ArabicShaper`、`Typography`、`MSDFFont`、`prepareContentGrid`、`PreparedContentGrid`。リーフパッケージ（`bidi-js` のみ）。     | なし。                                                                                                                 |
| `@vectojs/layout`        | スタンドアロンのレイアウトエンジン：`LayoutEngine`、`LayoutWorkerManager`、`createCanvasMeasurer`、測定ヘルパー。`@vectojs/text` に依存。                                                         | なし。                                                                                                                 |
| `@vectojs/math`          | スタンドアロンの空間/物理数学：`SpatialHashGrid`、`SpringPhysics`。リーフパッケージ。                                                                                                             | なし。                                                                                                                 |
| `@vectojs/animation`     | スタンドアロンのイージング + ドライバー：`Easing`、`TweenDriver`、`SpringDriver`。`@vectojs/math` に依存。                                                                                        | なし。                                                                                                                 |

**注意点：** バックエンドの自動登録は `.` エントリにのみ存在します（`Scene.registerWebGLPointRendererCreator(createWebGLPointRenderer)` と `Scene.registerWebGPUParticleSystemManager(WebGPUParticleSystemManager)` がインポート時に実行されます）。サブパスのみをインポートした後に `Scene` を構築する場合は、自分でバックエンドを登録するか、`pointBackend: 'webgl'` / WebGPUパーティクルを静かにフォールバックさせてください。レジストリAPIについては [`Scene`](/reference/core-scene/) を参照してください。

## 推奨ドキュメントサイトページ（コア）

- **Learn / コアコンセプト** — Scene、Virtual Math Tree、レンダーループ、`IRenderer`、ゼロDOMモデル。
- **Learn / レンダーモードとパフォーマンス** — `always` vs `onDemand`、`maxFPS`、アイドル2fpsスロットルとフレーム間の `markDirty()` ルール、モーション軽減。
- **Learn / カスタムエンティティの構築** — `isPointInside`/`render`、トランスフォーム、`getBounds` カリング、`getBatchCircle`/`getBatchRect` 高速パス。
- **Learn / イベントとヒットテスト** — キャプチャ/バブル、`VectoJSEvent`、`findEntityAt`、フォームコントロールの `change`/IME。
- **Learn / アクセシビリティと自動化** — シャドウDOM契約、`getByRole` 駆動エージェント、`debugA11y`、スロットリング。
- **Learn / テキストとタイポグラフィ** — コールド/ホット `LayoutEngine` 分割、ストリーミングメモ化、MSDFテキスト、除外/ラッピング、bidi。
- **Learn / パーティクル** — `ComputeParticleEntity`、WebGPU vs CPU、8-floatレイアウト、`resize()` を先に。
- **Reference / API** — 上記のサブページ（Scene、Entity、レイアウトエンジン、レンダラー、パーティクル、テキスト、数学ユーティリティ、a11y契約）。
- **Reference / バックエンドレジストリ** — プラガブルなWebGL/WebGPUバックエンド。[`Scene`](/reference/core-scene/#プラガブルバックエンドレジストリ静的) でカバーされています。
