---
title: 'Scene'
description: 'トップレベルのVectoJSオーケストレーター：コンストラクタオプション、レンダーループ、renderMode/maxFPSとアイドル自動スロットル、ライフサイクルメソッド、およびプラガブルなWebGL/WebGPUバックエンドレジストリ。'
order: 2
---

# `Scene`

[`@vectojs/core`](/reference/core-api/) の一部です。

```ts
new Scene(canvas: HTMLCanvasElement, options?: SceneOptions)
```

トップレベルのオーケストレーターです。1つの `<canvas>` につき1つの `Scene` です。`add()` で `Entity` オブジェクトを追加し、`start()` でループを開始します。

```ts
const scene = new Scene(document.querySelector('canvas')!);
scene.add(new Circle({ radius: 24, fill: '#38bdf8' }).setPosition(100, 100));
scene.start();
```

Sceneは2つの透過的な兄弟 `<div>` をキャンバスの**親**要素に追加します（a11yシャドウレイヤー用に `z-index:10`、DOMポータルレイヤー用に `z-index:9`）。親が `static` の場合は `position:relative` を強制します。SSR/Node（`document` なし）では、a11y/ポータル投影はno-opに低下するため、ヘッドレスレイアウト / `toSVG()` は引き続き動作します。

## SceneOptions

| オプション             | 型                            | デフォルト       | 効果                                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ----------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pointBackend`         | `'canvas' \| 'webgl'`         | `'canvas'`       | 表現可能な `getBatchCircle()`/`getBatchRect()` リーフのバックエンド。`'webgl'` はWebGL2キャンバス（`z-index:5`）をスタックし、それらのプリミティブをバッチします；WebGL2が利用不可の場合はCanvasにフォールバックします。GLレイヤーは2Dコンテンツの上に合成されるため、レイヤー間のペインターズオーダーはインターリーブされません。      |
| `particleBackend`      | `'auto' \| 'webgpu' \| 'cpu'` | `'auto'`         | [`ComputeParticleEntity`](/reference/core-particles/) のバックエンド。`'auto'` はWebGPUを試行し、CPUにフォールバックする前に警告を出力します。`'webgpu'` は明示的にWebGPUを要求しますが、現在はエラーをログに出力し、初期化に失敗した場合もフォールバックします。`'cpu'` はCPUシミュレーションを強制します（`webgpuDisabled` を設定）。 |
| `maxFPS`               | `number`                      | `60`             | フレームレート上限。`0` = 上限なし（ネイティブリフレッシュレート）。連続アニメーションは引き続き実行されますが、頻度が低くなります。（内部的に `NODE_ENV=test`/`VITEST` では `0`。）`scene.maxFPS` でライブ設定も可能。                                                                                                                 |
| `respectReducedMotion` | `boolean`                     | `true`           | OSが `prefers-reduced-motion` を要求する場合、`REDUCED_MOTION_FPS`（30）に制限 — またはそれと `maxFPS` の低い方。`false` はOS設定を無視します。                                                                                                                                                                                         |
| `a11ySyncInterval`     | `number`                      | `0`              | a11yシャドウDOM同期をNミリ秒あたり最大1回にスロットル。`0` = レンダリングされたフレームごとに同期。小さい値（例：`100`）は、激しいアニメーション中もa11yレイヤーを結果的に一貫性を保ちつつ、フレームごとのDOM書き込みを節約します。`scene.a11ySyncInterval` でライブ設定も可能。                                                        |
| `debugA11y`            | `boolean`                     | `false`          | シャドウノードを `opacity:0` の代わりに青い破線のアウトラインでレンダリングします（開発支援）。どちらにせよ自動化からはクリック可能です。                                                                                                                                                                                               |
| `renderer`             | `IRenderer`                   | `CanvasRenderer` | カスタムレンダラー（例：[`@vectojs/three`](/reference/three-renderer/) の `ThreeRenderer`）。                                                                                                                                                                                                                                           |
| `disableWindowResize`  | `boolean`                     | `false`          | 自動 `window` リサイズリスナーをスキップします。カスタムレイアウトコンテナ/オフスクリーンキャンバス内で使用し、`resize(w, h)` でサイズを駆動します。                                                                                                                                                                                    |

注意：`renderMode` は**パブリックフィールド**（デフォルト `'always'`）であり、コンストラクタオプションではありません — 構築後に `scene.renderMode = 'onDemand'` を設定してください。

## パブリックフィールド

```ts
scene.canvas: HTMLCanvasElement
scene.width: number
scene.height: number
scene.overlayRoot: Entity          // メインツリーの上に描画される子、クリップ範囲をバイパス
scene.renderMode: 'always' | 'onDemand'   // デフォルト 'always'
scene.maxFPS: number               // デフォルト 60
scene.respectReducedMotion: boolean
scene.a11ySyncInterval: number
scene.particleBackend: 'auto' | 'webgpu' | 'cpu'
scene.webgpuDisabled: boolean      // _disabled または particleBackend === 'cpu' の場合に true を返すゲッター
scene.a11yNeedsReorder: boolean
```

## renderMode、maxFPS、およびアイドル自動スロットル

- **`renderMode: 'always'`（デフォルト）** — 毎フレーム再レンダリング、実効FPSで制限。
- **`renderMode: 'onDemand'`** — シーンが_ダーティ_（`markDirty()` を参照）であるか、アニメーション/トランジションドライバーが保留中のときにのみ描画します。静的なrAFティックは依然としてツリー内の保留中のモーションを検査しますが、エンティティの更新/レンダリングとGPUサブミッションをスキップします。静的なUI/イベント駆動型UIに最適です。

**アイドル自動スロットル（重要な注意点）。** シーンは、ダーティではなく、メインツリー/オーバーレイツリー内のノードに保留中の `animate()` トゥイーンがない場合に**静的**と見なされます。`'always'` モードで `maxFPS > 0` の場合、静的なシーンはバッテリー/GPU節約のため**約2fps**にスロットルされます。`dirty` フラグはレンダリングされた各フレームの終わり（ポストレンダリング）に `false` にリセットされるため：

> カスタム `update()` 内で `entity.x` などを変更して手動アニメーションを行う場合、`update()` **内**で `markDirty()` を呼び出しても効果はありません — ポストレンダリングのリセットがそれを消去し、次のフレームの静的チェックは `dirty === false` を認識して2fpsにスロットルします。モーションを [`entity.animate()`](/reference/core-entity/#アニメーション) で駆動するか（トゥイーン実行中はシーンを非静的状態に保つ）、またはフレーム**間**（イベントハンドラー、別個の `rAF`、またはタイマーから）`scene.markDirty()` を呼び出して、フラグが次のループ反復まで生存するようにしてください。

`effectiveMaxFPS` = `maxFPS`。OSが動きの低減を要求し、`respectReducedMotion` がオンの場合、さらに30（`REDUCED_MOTION_FPS`）に引き下げられます。`0` は上限なしを意味します。

## ライフサイクルメソッド

```ts
scene.add(entity: Entity): this              // シーンルートにアタッチ
scene.remove(entity: Entity): this           // デタッチ + a11yシャドウノードを再帰的に破棄
scene.start(): void                          // rAFループを開始。冪等。width/heightが0の場合は1回警告
scene.stop(): void                           // 現在のフレーム後に停止。start() で再開
scene.destroy(): void                        // 所有するエンティティサブツリー/リソース、ループ、リスナー、DOMレイヤー、GPUマネージャー、レンダラーを冪等に破棄
scene.markDirty(): void                      // 次のフレームで再描画を要求（onDemand で意味を持つ + アイドルスロットルを回避）
scene.resize(width: number, height: number): void   // ビューポートを設定。レンダラー + GLレイヤーをリサイズ。ダーティをマーク
scene.showOverlay(overlay: Entity): void     // overlayRoot に追加（上に描画、クリップなし）
scene.hideOverlay(overlay: Entity): void
scene.detachA11y(entity: Entity): void       // サブツリーのシャドウノードをツリーから削除せずに除去
```

> **パーティクルシミュレーションの前に `resize(w, h)` を実行する必要があります。** 幅/高さは `window.innerWidth/innerHeight` から取得されます（`disableWindowResize` が設定されている場合は `canvas.width || canvas.clientWidth || 0` にフォールバック）。`0×0` のビューポートではパーティクルはゼロボックス内でシミュレートされ、レンダリングされない可能性があります。`start()` は幅または高さが0のときに1回限りの警告をログに出力します。
>
> `resize()` はテキスト投影のメトリクス境界でもあります。論理的な幅と高さが変更されていない場合でも、カスタムコンテナやアプリケーションCSSのズーム変更後に呼び出してください。Core 1.8はその後コールドキャリブレーションキーを再構築し、準備されたグリッドが準備完了とマークされる前に新しいFirefox/Chromium Rangeジオメトリを待機します。
>
> **`syncA11y` は作成/更新のみを行い、フレーム内では削除しません。** コンポーネントがインタラクティブな_子_エンティティを毎フレーム入れ替える場合は、それらを破棄する前に `detachA11y(child)` を呼び出すか、`<a>`/コントロールのシャドウノードがリークします。（`remove()` は既に再帰的に削除します。）

## その他のSceneメソッド

```ts
scene.getRenderer(): IRenderer
scene.getRoot(): Entity
scene.clientToScene(clientX: number, clientY: number): Point // ビューポート → 論理Scene座標
scene.render(renderer: IRenderer, dt = 0, time = 0): void   // メインレンダラーは状態を進行。セカンダリレンダラーは読み取り専用スナップショットを描画
scene.toSVG(): string                        // 読み取り専用の現在状態スナップショットをSVGRenderer経由で → フラットSVG XML
scene.findEntityAt(x, y): Entity | null      // isPointInside() が true を返す最前面のエンティティ（深さ優先、前面から背面、インタラクティブフィルターなし）
scene.getA11yElement(entityId: string): HTMLElement | undefined
scene.getA11yTree(): A11yTreeNode[]          // 投影されたシャドウノードのネストされたスナップショット（id/tag/role/label/value/...）
```

## プラガブルバックエンドレジストリ（静的）

```ts
Scene.registerWebGLPointRendererCreator(creator: WebGLPointRendererCreator): void
Scene.registerWebGPUParticleSystemManager(managerClass: any): void
```

`.` エントリによって自動的に呼び出されます。関連インターフェース（`IWebGLPointRenderer`、`IWebGPUParticleSystemManager`、`WebGLPointRendererCreator`）はカスタムバックエンド用にエクスポートされています。WebGPUデバイス喪失は、WebGPUを永久的に無効にする前に指数バックオフ（3回再試行）で自動復旧されます。

## 関連情報

[`Entity`](/reference/core-entity/)（Sceneが所有するツリー） ·
[`IRenderer` / `CanvasRenderer`](/reference/core-renderer/) ·
[`ComputeParticleEntity`](/reference/core-particles/) ·
[a11yRoot & エージェント契約](/reference/core-a11y/) ·
[`@vectojs/core` 概要](/reference/core-api/)
