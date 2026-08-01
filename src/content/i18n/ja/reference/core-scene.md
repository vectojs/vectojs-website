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
| `readingDirection`     | `'ltr' \| 'rtl'`              | `'ltr'`          | a11y/オートメーションシャドウツリーの読み取り方向。キーボードの**タブ順序**とスクリーンリーダーの走査が、シーングラフへの挿入順ではなく_視覚的な_読み取り順に従います。`'rtl'` は各行内のインライン順序を反転します。`scene.readingDirection` でライブ設定も可能。                                                                      |
| `a11ySyncInterval`     | `number`                      | `0`              | a11yシャドウDOM同期をNミリ秒あたり最大1回にスロットル。 `0` = レンダリングされたフレームごとに同期します。小さな値（例：`100`）を設定すると、フレームごとのDOM書き込みを節約しながら、激しいアニメーション中でもa11yレイヤーが最終的に一貫性を保ちます。`scene.a11ySyncInterval` 経由でもライブで設定可能です。                         |
| `debugA11y`            | `boolean`                     | `false`          | シャドウノードを `opacity:0` の代わりに青い破線のアウトラインでレンダリングします（開発支援）。どちらにせよ自動化からはクリック可能です。                                                                                                                                                                                               |
| `renderer`             | `IRenderer`                   | `CanvasRenderer` | カスタムレンダラー（例：[`@vectojs/three`](/reference/three-renderer/) の `ThreeRenderer`）。                                                                                                                                                                                                                                           |
| `disableWindowResize`  | `boolean`                     | `false`          | 自動 `window` リサイズリスナーをスキップします。カスタムレイアウトコンテナ/オフスクリーンキャンバス内で使用し、`resize(w, h)` でサイズを駆動します。                                                                                                                                                                                    |
| `maxDPR`               | `number`                      | `undefined`      | デバイスピクセル比を上限で抑え、Canvas2Dおよび`pointBackend: 'webgl'`バッキングストアのサイズ設定に使用します。`undefined`は実際の上限なしの`devicePixelRatio`を読み取ります。`resize()`呼び出しのたびに再適用されます（構築時だけでなく）。以下の「DPRレンダリングの上限」を参照してください。                                         |

注意：`renderMode` は**パブリックフィールド**（デフォルト `'always'`）であり、コンストラクタオプションではありません — 構築後に `scene.renderMode = 'onDemand'` を設定してください。

### レンダリングDPRの上限（`maxDPR`）

バッキングストアのレンダリングコストは`論理サイズ × dpr²`でスケーリングし、線形ではありません — DPR 1（ほとんどの開発用ラップトップ）でスムーズなフルスクリーンシーンは、DPR 3のディスプレイで16msのフレームバジェットを超過する可能性があり、実際にそのディスプレイでテストされるまで見えません。これは`pointBackend: 'webgl'`で最も顕著で、別のスタックキャンバスをレンダリングするため、そのフラグメント/オーバードローコストは正確にこのDPR²曲線になります — フルスクリーンの1200パーティクルフィールドでは、DPR 3で**116ms**の最大フレーム、DPR 1では完璧な60fpsでした。

```ts
const scene = new Scene(canvas, { pointBackend: 'webgl', maxDPR: 2 });
```

`maxDPR: 2`はディスプレイをRetina級に鮮明に保ち（2倍は通常の視距離でほとんどの目が解像できる限界を超えています）ながら、バッキングストアのピクセル数を上限で抑えます — DPR 3では`2² / 3² ≈ 0.44×`のピクセルになるため、約半分になります。このオプションが存在する前は、Scene構築前に`window.devicePixelRatio`をモンキーパッチするしか回避策がありませんでした。現在は`maxDPR`を推奨します — これはすべてのリサイズで正しく再適用され、1回限りの`Object.defineProperty`パッチでは実現できません。

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
scene.readingDirection: 'ltr' | 'rtl'   // tab/traversal order; setting it re-flows
scene.forcedColors: boolean             // getter — OS is in a forced-colors mode
```

## renderMode、maxFPS、およびアイドル自動スロットル

- **`renderMode: 'always'`（デフォルト）** — 毎フレーム再レンダリング、実効FPSで制限。
- **`renderMode: 'onDemand'`** — シーンが_ダーティ_（`markDirty()` を参照）であるか、アニメーション/トランジションドライバーが保留中のときにのみ描画します。静的なrAFティックは依然としてツリー内の保留中のモーションを検査しますが、エンティティの更新/レンダリングとGPUサブミッションをスキップします。静的なUI/イベント駆動型UIに最適です。

**アイドル自動スロットル（重要な注意点）。** シーンは、ダーティではなく、メインツリー/オーバーレイツリー内のノードに保留中の `animate()` トゥイーンがない場合に**静的**と見なされます。`'always'` モードで `maxFPS > 0` の場合、静的なシーンはバッテリー/GPU節約のため**約2fps**にスロットルされます。`dirty` フラグはレンダリングされた各フレームの終わり（ポストレンダリング）に `false` にリセットされるため：

> カスタム `update()` 内で `entity.x` などを変更して手動アニメーションを行う場合、`update()` **内**で `markDirty()` を呼び出しても効果はありません — ポストレンダリングのリセットがそれを消去し、次のフレームの静的チェックは `dirty === false` を認識して2fpsにスロットルします。モーションを [`entity.animate()`](/reference/core-entity/#アニメーション) で駆動するか（トゥイーン実行中はシーンを非静的状態に保つ）、またはフレーム**間**（イベントハンドラー、別個の `rAF`、またはタイマーから）`scene.markDirty()` を呼び出して、フラグが次のループ反復まで生存するようにしてください。

`effectiveMaxFPS` = `maxFPS`。OSが動きの低減を要求し、`respectReducedMotion` がオンの場合、さらに30（`REDUCED_MOTION_FPS`）に引き下げられます。`0` は上限なしを意味します。

### オフスクリーンの一時停止とdtクランプ

2つの見落としやすいループ動作：

- **オフスクリーンのシーンはレンダリングを停止します。** キャンバス上の `IntersectionObserver` がキャンバスが完全にスクロールアウトした場合（ダッシュボードタブ、折り返し線以下のチャートなど）にrAFループを一時停止し、再入時に再開します — 誰も見ていないシーンのために完全な更新/レンダリングを実行する代わりに。`IntersectionObserver` が利用できない場所（SSR/jsdom）では、シーンは常にスクリーン上にあると見なされるため、動作はそのままです。
- **`dt` は100msにクランプされます**（`MAX_FRAME_DT`）。バックグラウンドタブ、ブレークポイント、または長いGC一時停止の後、実際の経過時間は数秒になる可能性があります。その生の値を物理/トゥイーン積分に投入すると、すべてがテレポートします。`update(dt)` で `dt` を自分で積分する場合、それが100msを超えないことに注意してください。

## アクセシビリティと外観

| メンバー               | 型                 | 備考                                                                                                                                                                                                                 |
| ---------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readingDirection`     | `'ltr' \| 'rtl'`   | a11yシャドウツリーを並べ替え、**タブ順序**が視覚的な読み取り順序と一致するようにします（行は上から下へ、次にインライン）。設定すると次の同期時にリオーダーがトリガーされます。コンストラクタオプションでもあります。 |
| `forcedColors`         | `boolean` (getter) | OSが強制カラーモード（Windowsハイコントラスト）の場合に `true`。`(forced-colors: active)` で検出；シーンはトグル時に**自動で再描画**されます。                                                                       |
| `prefersReducedMotion` | `boolean` (getter) | OSが動きの低減を要求し `respectReducedMotion` がオンの場合に `true`。アニメーションドライバーによって読み取られ、トゥイーンする代わりに非opacityプロパティをスナップします。                                         |

`<canvas>` は不透明ピクセルであるため、ブラウザの強制カラーリマッピングは描画内容に影響しません。コンポーネントは自分で対応する必要があります：

```ts
render(r: IRenderer) {
  const forced = this.scene?.forcedColors ?? false;
  r.fill(forced ? 'ButtonFace' : this.bg);
  r.fillText(this.label, x, y, this.font, forced ? 'ButtonText' : this.color);
}
```

[a11yRoot & エージェント契約](/reference/core-a11y/#強制カラーハイコントラスト) を参照してください。

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

## フレームテレメトリ（`frameStats`、1.13.0）

```ts
scene.frameStats: FrameStats; // ライブレンダーループテレメトリ（読み取り専用）

interface FrameStats {
  fps: number; // レンダリングフレームのリズム、maxFPSでクランプ; 最初のフレームペアまで0
  frameTimeMs: number; // 最後のrender()パスの壁時計時間（a11y/コンテンツ同期を除く）
  frameIntervalMs: number; // レンダリングフレーム間の平滑化された間隔（EMA）
  dt: number; // 最後にレンダリングされたフレームに渡されたdt
  renderedFrames: number; // start()以降のレンダリングされたフレーム合計
  skippedFrames: number; // start()以降のスキップされたrAFティック合計（idle/onDemand/capped）
  renderMode: 'always' | 'onDemand';
  dirty: boolean; // 再描画が保留中かどうか
}
```

`fps`は_実際にレンダリングされた_フレーム間の間隔から算出されるため、アイドルの`onDemand`シーンや`maxFPS`キャップ/静的自動スロットリングによってドロップされたフレームはそれを下げません — これはraw rAFレートではなく、実際の再描画のリズムを報告します。タイミングは`requestAnimationFrame`ループで測定されます。`step()`（決定論的エクスポート）のみで駆動されるシーンはゼロのままになります。レンダラーは常にフルキャンバスを再描画するため、部分的なダーティ矩形はありません — `dirty`はブール再描画保留フラグです。[`@vectojs/devtools`](/reference/devtools/)パフォーマンスHUDを駆動します。

## 関連情報

[`Entity`](/reference/core-entity/)（Sceneが所有するツリー） ·
[`IRenderer` / `CanvasRenderer`](/reference/core-renderer/) ·
[`ComputeParticleEntity`](/reference/core-particles/) ·
[a11yRoot & エージェント契約](/reference/core-a11y/) ·
[`@vectojs/core` 概要](/reference/core-api/)
