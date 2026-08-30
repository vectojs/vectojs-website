---
title: '07 — Renderer — 座標 / クリッピング / DPR 一貫性'
description: 'Canvas2D、WebGL、WebGPU、SVG、Three にまたがるマルチバックエンド一貫性：IRenderer 契約、座標空間、クリップ意味論、DPR／バッキングストア上限、ビューポートカリングとドローコールバッチング — そして同じシーンが別バックエンドで違って見えるすべての罠。'
order: 27
---

# 07 — Renderer — 座標 / クリッピング / DPR 一貫性

> **ボス 07** はラストマイルを守る。Virtual Math Tree のジオメトリを、バックエンドが `CanvasRenderingContext2D` でも、WebGL のポイントレイヤーでも、WebGPU のコンピュートパスでも、SVG エクスポートでも、Three.js のインスタンストメッシュでも — 任意の DPR、任意のズーム、任意のビューポートで — 同一に見えるピクセルへ変換することだ。

- **学べること**: `IRenderer` 契約となぜそれが `CanvasRenderingContext2D` ではなく権威なのか、1 つではなく 5 つの座標空間、クリッピング・DPR・カリング・バッチングがそれぞれいかに一貫性を壊すか、そして検証可能な `file:line` 付きで報告・修正・未解決の罠。
- **学べないこと**: テキスト整形とレイアウト（ボス 02）、VMT の dirty とライフサイクル（ボス 06）、WASM 高速化（ボス 08）、Three／XR ブリッジの二世界マッピング（ボス 09）。本ドキュメントはそれぞれのレンダリング側の半分を担う。

## マルチバックエンド一貫性が難しい理由

VectoJS は 5 つのバックエンド間で「同じシーン、同じ絵」を promise する：

| backend                     | module                                                        | retained?            | where pixels go                                     |
| --------------------------- | ------------------------------------------------------------- | -------------------- | --------------------------------------------------- |
| Canvas2D                    | `packages/core/src/renderer/CanvasRenderer.ts:1`              | immediate            | 1 枚の `<canvas>` 2D コンテキスト、DPR スケール済み |
| WebGL points/sprites/glyphs | `packages/core/src/renderer/WebGLPointRenderer.ts:1`          | batched              | 積み重ねたフルウィンドウ canvas、NDC クアッド       |
| WebGPU particles            | `packages/core/src/renderer/WebGPUParticleSystemManager.ts:1` | compute              | 同じ積み重ね canvas、compute→render                 |
| SVG export                  | `packages/core/src/renderer/SVGRenderer.ts:1`                 | retained strings     | `toXMLString()` DOM なしシリアライズ                |
| Three.js                    | `packages/three/src/ThreeRenderer.ts:216`                     | retained scene graph | `THREE.WebGLRenderer` ortho カメラ                  |

すべてのバックエンドは、同じ `save`／`restore`／`translate` スタックの下で、同じ順序で**同じ `Entity.render(r: IRenderer)` 呼び出し**を受け取る。一貫性が崩れるのは walk が間違っている箇所ではなく、バックエンドが同じ呼び出しを異なる解釈で受け取る箇所だ — 一方ではパス演算であるクリップが他方ではシザー矩形になる、バッキングストアが一方では `window.devicePixelRatio` でサイズ決定され他方では `maxDPR` でクランプされる、ストロークが一方では `lineWidth` プロパティで他方ではリボンジオメトリになる、といった具合である。それぞれの乖離は、HiDPI ディスプレイ、ズーム、クリップ境界、あるいは 4 万セルのグリッドに当たるまで不可視のままである。

これらの乖離を吸収する契約が `IRenderer`（`packages/core/src/renderer/IRenderer.ts:1`）である。Entity は具象レンダラを import してはならない。このインターフェースがメソッドベースであるのは意図的である：スタイルは描画とともに運ばれる（`stroke(color, lineWidth)`、`fillText(text, x, y, font, color)`）ため、バッチ処理するバックエンドは実行を統合でき、GPU バックエンドは明確な境界を持つ。可変なスタイルプロパティ（`ctx.fillStyle = …`）は意図的に存在しない — 開発者向けトラップがそれらに警告する（`IRenderer.ts:159`、`IRenderer.ts:301`）。トランスパイルされていない JS ではそれらは expando としてアタッチされ、コンテキストのデフォルトで黙って描画してしまうためだ。

## IRenderer 契約（最初に読むこと）

```text
IRenderer.ts:41  — kind, pixelRatio, setDrawCounters / getDrawCounters
IRenderer.ts:134 — clip(x,y,w,h, radii?)
IRenderer.ts:149 — path: beginPath / moveTo / lineTo / bezierCurveTo / closePath / arc / roundRect
IRenderer.ts:193 — drawImage / drawImageRect? (optional)
IRenderer.ts:287 — fill / stroke / fillText / fillCircle / flush
IRenderer.ts:350 — createLinearGradient
IRenderer.ts:404 — present? / dispose? / isContextLost? / onContextRestored?
```

主要な設計判断：

- **`kind`**（`IRenderer.ts:76`）は安定した文字列判別子（`'canvas2d' | 'svg' | 'three'`）— `constructor.name` は minify される。
- **`pixelRatio`**（`IRenderer.ts:88`）は任意であり、`window.devicePixelRatio` のスナップショットではなく**ライブで適用された**値である。blit ソースをラスタライズする呼び出し元はウィンドウではなくこれを読まなければならない。
- **`drawImageRect?`**（`IRenderer.ts:232`）は任意である。`SVGRenderer` は意図的にこれを省略する：SVG の blit はソースを data URL として埋め込むため、セルごとのサブ矩形はアトラス全体を何千回もインライン化してしまう。呼び出し元は機能検出し、`fillText` フォールバックを維持しなければならない。
- **`fillCircle` + `flush`**（`IRenderer.ts:328`、`:364`）は順序を保持するバッチである。連続する同色・同アルファの円は 1 つのパスと 1 回の `fill()` に統合される（`flush()` 時）。`Scene` は兄弟境界ごととフレーム末尾で flush する。
- **`present?`**（`IRenderer.ts:404`）は retained バックエンド専用である。`CanvasRenderer` は即時ペイントし、`ThreeRenderer` は単一の実際の GL レンダリングを `present()`（`ThreeRenderer.ts:957`）まで遅延させるため、フレームは `O(N)` 回の add + `1` 回の描画で済み、`O(N²)` 回の再レンダリングにはならない。

## 座標空間（5 つ、1 つではない）

`fillCircle(cx, cy, …)` として書かれた点は以下を経由する：

1. **ローカル** — Entity 自身の `(x, y)` ボックス。`Entity.getBounds()` と `worldToLocal` がここに属する。
2. **ワールド** — すべての祖先の `translate`／`scale`／`rotate` とシーンの DPR スケールで変換されたローカル。`HitTester` とカリングはここでテストする。
3. **ビューポート／CSS px** — シーンのビューポートと任意の `clipChildren` 祖先でクリップされたワールド。`Scene.ts:4335` `projectionBoxVisible`。
4. **バッキングストア／デバイス px** — ビューポート × `appliedDPR`（`CanvasRenderer.ts:244` `pixelRatio`）。GPU が実際にサンプリングする場所。
5. **クリップ／NDC** — WebGL／WebGPU のみ：`(pos / resolution)*2-1`、y 反転（`WebGLPointRenderer.ts:320`）、Three の y-down ortho（`ThreeRenderer.ts:250`）。

落とし穴は、ある空間が別の空間であると仮定することだ。`ComputeParticleEntity` の GPU パスは**ウィンドウ**空間で `scene.mouseX/Y` を消費し、Entity の transform を無視する積み重ねたフルウィンドウ canvas に描画する。一方 CPU フォールバックは**ローカル**空間で `entity.worldToLocal(mouse)` を消費し、`renderer.translate(node.x, node.y)` の内側で描画する — 1 つのバッファ、2 つの契約（`vectojs-docs/forge/findings/renderer-and-gpu.md:299`）。`WebGPUParticleSystemManager` は `screen_size` を `width / height` として記録パスに渡す（`WebGPUParticleSystemManager.ts:310`）が、CPU パスは Entity の transform がすでに適用された状態で描画する。

`ThreeRenderer` も NDC 境界で同じ罠にいる：ortho カメラが y-down（`ThreeRenderer.ts:250`）のため、すべての `FrontSide` メッシュは裏向きでカリングされる — 修正はテキストだけでなくすべての塗りプリミティブで `side: DoubleSide` とすることだ（`ThreeRenderer.ts:596`、forge 2026-08-13）。

## クリッピング

`IRenderer.clip(x, y, w, h, radii?)`（`IRenderer.ts:134`）は現在のクリップと交差させる。`radii` は**プログレッシブエンハンスメント**である：シザーテストの GPU パスはそれを無視してもよい。

- **Canvas2D** — `save`／`restore` 内で `ctx.roundRect` + `ctx.clip()`（`CanvasRenderer.ts:373`）。スコープ付きで正確。
- **SVG** — 合成的：新たな `<clipPath id="clip-N"><rect|path …/>` と `<g clip-path="url(#clip-N)">` を生成し、`restore()` での `clipDepth` の pop と `toXMLString()` でのタグクローズで閉じる（`SVGRenderer.ts:510`、`:543`）。コストは fill rate ではなく DOM サイズである。
- **Three** — バッキングストアピクセル単位のシザー矩形。現在の行列で変換し、原点を左下に反転させ、囲むシザーと交差させる（`ThreeRenderer.ts:449`）。シザーは矩形のみであり、角丸クリップはその AABB に劣化する。
- **`clipChildren`** — レンダラの `clip()` 呼び出しではなく、`Scene`／Entity レベルのフラグであり、ヒット、a11y、content 投影を仮想化する。`Scene.ts:254`（ヒット）と `Scene.ts:4305`（カリング）の両方が、すべての `clipChildren` 祖先のワールドボックスと交差させる。`isHitEligible` は正確な回転対応のローカル rect で再チェックする。

既知のクリップギャップ：`IRenderer.fill` は `fillRule: 'evenodd'` を表現できない（`forge/findings/renderer-and-gpu.md:38`）。`Canvas2D` と `SVG` は even-odd が可能（`ctx.fill('evenodd')`、`<path fill-rule="evenodd">`）だが、インターフェースは `fill(colorOrGradient)` しか公開しない。したがって複数の閉じたコンポーネントを持つ複合パスは、すべてのバックエンドで `nonzero` で塗られる。規定の形状は `fill` 上の後方互換な任意の `fillRule` 引数であり、コンシューマが診断ガードを外す前に一貫して実装されるべきものである。

## DPR スケーリングとバッキングストア上限

```text
CanvasRenderer.ts:219  effectiveDPR()  = min(real DPR, maxDPR)
CanvasRenderer.ts:244  pixelRatio      = appliedDPR (recorded, not live)
CanvasRenderer.ts:119  constructor / resize apply scale(dpr, dpr)
WebGLPointRenderer.ts:972  same clamp for the point layer
ThreeRenderer.ts:307   effectiveDPR() / pixelRatio via getPixelRatio()
Scene.ts:286           SceneOptions.maxDPR — syncs to every renderer on resize
```

3 つの不変条件：

1. **クランプし、信用しない。** `maxDPR`（`SceneOptions.maxDPR`、`CanvasRenderer.ts:66`）はバッキングストアの肥大化を抑える。`maxDPR: 2` は健全なデフォルトであり、保証ではない — 数千の細いセグメントを持つフレームごとのストロークパスは、同じ内容で DPR1 で `16.7 ms`、DPR2 で `140 ms` を計測した（`forge 2026-07-18` バッキングストア上限）。高コストなパスでは、エンジンのデフォルトが 2 でも `maxDPR: 1` が必要な場合がある。

2. **適用済みであってライブではない。** `pixelRatio` は、アクセス時に再読込される `effectiveDPR()` ではなく、コンテキストが**現在スケールされている**比率（`appliedDPR`）を報告する（`CanvasRenderer.ts:234`）。ライブ getter は、ズーム／DPR 変更から次の `resize` までの間に**未来の** DPR を報告してしまい、それからラスタライズする呼び出し元は、まだ古いコンテキストがリサンプリングするテクスチャを生成してしまう。`pixelRatio` をキーとするキャッシュ（例：`GlyphRasterAtlas`、`Markdown` コードアトラスプール）は、実際に再確保する resize の後にのみ再キーされる。

3. **リサイズはスタイルキャッシュを無効化する。** `canvas.width/height` の設定は仕様により 2D コンテキスト全体を `10px sans-serif / #000` にリセットする。`CanvasRenderer.resize` は `_cachedFont/_cachedFill/_cachedStroke` とバッチ状態を破棄し（`CanvasRenderer.ts:258`）、新しい `appliedDPR` を記録する。`contextrestored` でも同様（`CanvasRenderer.ts:164`）。破棄漏れはデフォルトフォントでの古いキャッシュによる再ペイントになる。対応する `WatchDevicePixelRatio` メディアクエリループは変化のたびに再武装する（`ThreeRenderer.ts:338`、Scene でも同等）ため、ディスプレイ間のドラッグやズームで実際の `resize` が発火する。

事前ラスタライズされたビットマップはこの上に立つ：

- `GlyphRasterAtlas` と `TextRasterCache` は構築時の `dpr` でラスタライズする（`GlyphRasterAtlas.ts:174`、`TextRasterCache.ts:88`）が、その lookup キーは歴史的に DPR を含んでいなかった（`forge 2026-08-25`）：DPR 変更を跨いで同一アトラスを再利用すると、同一キーで古い密度のビットマップが提供され、リサンプリングされて blit される（ぼやける）。ドキュメント上の契約は「アトラスは DPR でキー付けされ、変更時に置換される」— 呼び出し元の規律に依存する。キーが DPR を含まない限り安全性は担保されない。
- `SplineEntity.bake` はかつて生の `window.devicePixelRatio` を読んでいた（`SplineEntity.ts:433` 修正前）が、blit 先は `maxDPR` でクランプされたコンテキストだった — 過剰解像度のビットマップが毎フレームダウンサンプルされていた。レンダリング時に `renderer.pixelRatio` を読むように修正され、変更時に再 bake する（`SplineEntity.ts:504`）。

## ビューポートカリング

`Scene` はビューポートに対して厳密にカリングする：**塗りボックス**全体がビューポート外にある Entity はスキップされる（`Scene.ts:7254` カリングトレース）。2 つの洗練：

- **ストローク膨張。** `Circle.getBounds()`／`Rect.getBounds()` はストローク時に `strokeWidth/2` だけ膨張するようになった（`Circle.ts:67`、`Rect.ts:54`、 `@vectojs/core@2.18.3` CTX-0261 で修正）。以前は、ビューポート端での太いストロークが幅の半分まで失われていた。`-0` の後続修正（`-inflation` が `0` を否定する）は正のみの negate が必要だった（`forge 2026-08-08` `-0` エントリ）。
- **クリップ考慮カリング**（`Scene.ts:4335`）。`projectionBoxVisible` はビューポートとすべての `clipChildren` 祖先の AABB を交差させる。ビューポート外だがクリップ内で可視なコンテンツは仮想化される（ボス 03）。境界のないフルビューポートオーバーレイは意図的にクリップされない（`Scene.ts:4238`）。

## バッチ処理とドローコール経済

| path                          | mechanism                                                        | cap / cost                                                                                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fillCircle` (Canvas2D)       | 同色・同アルファ実行 → 1 つのパス、 `flush()` で 1 回の `fill()` | `MAX_BATCH = 64`（`CanvasRenderer.ts:88`）— それ以上は超線形                                                                                                                          |
| `fillCircle` (SVG)            | flush ごとに 1 つの `<path d="… A … A …">`                       | GPU コストなし、DOM サイズ                                                                                                                                                            |
| `fillCircle` (WebGL/Three)    | インスタンス化されたクアッド／`CircleGeometry`                   | ほぼ定数、flush のみが問題                                                                                                                                                            |
| `drawImage` / `drawImageRect` | なし — 即時 `drawImage`／`<image>`                               | アトラス（`GlyphRasterAtlas`）は 1 つのソーステクスチャを保つ。`TextRasterCache` の canvas ごとのソースは 4 万セルで **0.87×**（`fillText` ベースライン）を計測、アトラスでは **~2×** |

`CanvasRenderer.flush`（`CanvasRenderer.ts:414`）は `globalAlpha` を事前バッチ値（`1` ではない）から復元し、`_cachedFill` をバッチ色に更新する — さもなければ古いキャッシュのまま次の `fill('red')` が代入をスキップし、バッチ色でペイントしてしまう。保留中のバッチは `drawImage`、`beginPath`、`save`／`restore`、`clip`、`fill`、`stroke`、`fillText` の前にコミットされる。

`ThreeRenderer.flush`（`ThreeRenderer.ts:957`）は `frameDirty` をマークするだけである。実際の GL レンダリングは `present()`（`ThreeRenderer.ts:968`）であり、フレーム末尾に `Scene` から 1 回だけ呼ばれる。これがなければ `O(N)` 回の flush が `O(N²)` 回のレンダリングコストになる。`present()` を呼ばない古い `Scene` ビルドはマイクロタスクフォールバックでカバーされる。

WebGL 固有：`setTexture` は、ソースが変わるとき `texImage2D` の前にスプライトバッチをコミットするようになった（`WebGLPointRenderer.ts:974`、 `@vectojs/core@2.18.3` で修正）。`setMSDFTexture` を映したものである。`ctx.filter = 'blur()'` のコストは次のピクセル読み取りまで遅延する（`forge 2026-07-18` `ctx.filter` エントリ）— 可能なら半解像度でブラーをかけること。

## テキストラスタパス

`fillText` はフレームあたり最大 5,000 回の CPU シェーピング＋色解析＋ラスタライズであり、GPU はアイドル状態である（`(program)` が支配的）。2 つのオプトインキャッシュがシェーピングを blit に変換する：

- `GlyphRasterAtlas`（`GlyphRasterAtlas.ts:1`）— 1 枚の canvas、棚詰めスロット、`drawImageRect` サブ矩形。境界のある等幅集合（コードグリッド、ターミナル）向け。`drawImageRect` が必要であり、`SVGRenderer` は対象外。
- `TextRasterCache`（`TextRasterCache.ts:1`）— `(font, color, text)` 実行ごとに 1 枚の小さな canvas、`drawImage` blit。境界のあるフレーズ集合（danmaku 395 コードポイント → 1 枚の `≤1024²` MSDF アトラス）向け。どちらもメモリを制限し（アトラスの棚＋リセットカウンタ、キャッシュの `maxEntries` と 10% の挿入順 eviction）、ヘッドレスでは `fillText` にフォールバックする。5,000-danmaku の壁はシェーピングではなくドロー数＋オーバードローだった：`fillText→drawImage` に置き換えても変化なしだったが、グリフを約 1 回の WebGL ドローにバッチして `MSDFTextEntity`／`pointRenderer.addGlyph` 経由にすると `~28 fps` → `~130 fps` になった（`forge 2026-07-20` 訂正、`bakudan` v0.5）。

Three のテキストパスは `dpr` でラスタライズし（`ThreeRenderer.ts:747`）、テクスチャキャッシュを `dpr|font|color|text|gradient-definition` と、グラデーションでは丸めた `x,y` フェーズでキー付けする（`ThreeRenderer.ts:806`）。フォントサイズは `parseFontSize`（`ThreeRenderer.ts:274`）で解析され、`parseInt` ではない — styles shorthand は weight を先頭に置く（`'700 16px Inter'`）ため、素朴な `parseInt` は `700` を読んでしまう。ベースライン：アルファベットベースラインは `y` に位置し、Three の `PlaneGeometry` 中心は `-fontSize + h/2` だけオフセットされる（`ThreeRenderer.ts:831`）。

## Scene 配線（レンダラのノブが設定される場所）

```text
Scene.ts:226  SceneOptions.pointBackend: 'canvas' | 'webgl'   (glyphs/sprites)
Scene.ts:233  SceneOptions.particleBackend: 'auto'|'webgpu'|'cpu' (compute particles)
Scene.ts:286  SceneOptions.maxDPR               → syncs to pr.maxDPR on every resize
Scene.ts:398  SceneOptions.renderMode: 'always' | 'onDemand'
Scene.ts:1142 Scene.renderMode + DirtyTracker + RenderScheduler (maxFPS / autoThrottle)
Scene.ts:2284 full-window viewport adoption (once) + disableWindowResize
Scene.ts:2781 clientToScene viewport mapping
```

- **`pointBackend` と `particleBackend` は別機能**である（`forge 2026-08-26`）。`pointBackend: 'webgl'` はグリフ／スプライトクアッドをバッチし、`particleBackend: 'webgpu'` は `ComputeParticleEntity` 向けに `WebGPUParticleSystemManager` を駆動する。WebGPU のグリフ／MSDF パスは存在しない。`particleBackend` を切り替えても danmaku には何も起きない。
- **`WebGPUParticleSystemManager` は static 経由でオプトイン**である（`forge 2026-08-02`）：`Scene.registerWebGPUParticleSystemManager(...)`。デフォルト `'auto'` で登録なしの場合、throw も `console.warn` もなく — `initWebGPUContext` が未使用の積み重ね canvas を確保したまま CPU フォールバックが動く。
- **`renderMode: 'always'`**（デフォルト）は連続 rAF ループを駆動し、`autoThrottle` は静止時に `idleFPS` へ落とす。**`'onDemand'`** は `markDirty()` またはアクティブなアニメーション／物理 tick の後にのみペイントする。`render()` 自体は無条件にレンダリングする — `renderMode` はループスケジューラにのみ影響する（`Scene.ts:3405`）。

## 既知の落とし穴（file:line 付き）

| pitfall                                                                                                                                 | where                                                                                         | status                                     |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Even-odd fill を表現できない（`IRenderer.fill` に `fillRule` がない）                                                                   | `IRenderer.ts:287`、forge 2026-07-18                                                          | 未解決                                     |
| shadow／glow プリミティブなし（`shadowBlur` なし、`ctx.filter` ブラーのコストは遅延）                                                   | `IRenderer.ts:159` ヒント、forge 2026-07-18 / 2026-08-25                                      | 未解決                                     |
| 壁紙サンプリング用の backdrop blur／material なし                                                                                       | forge 2026-08-25                                                                              | 未解決（stretch）                          |
| Glyph／Text ラスタキーが DPR を省略 — DPR 変更後に古い密度のビットマップを提供                                                          | `GlyphRasterAtlas.ts:174`、`TextRasterCache.ts:88`、forge 2026-08-25                          | 未解決（契約＝呼び出し元がアトラスを置換） |
| `WebGPUParticleSystemManager` は `Scene.register…` static を要する、`'auto'` で静かな CPU フォールバック                                | `Scene.ts:256` 登録ゲート、forge 2026-08-02                                                   | 未解決                                     |
| CPU と GPU のパーティクル座標空間が不一致（window vs local）                                                                            | `WebGPUParticleSystemManager.ts:310`、`ComputeParticleEntity.ts`、forge 2026-08-02 関連       | アプリ側で補償                             |
| バッキングストアがウィンドウ DPR ではなくクランプされた `appliedDPR` でサイズ決定                                                       | `CanvasRenderer.ts:244`、`ThreeRenderer.ts:318`、`SplineEntity.ts:504`                        | 修正済み                                   |
| `resize` でコンテキストリセットを跨いで font／fill キャッシュが古いまま                                                                 | `CanvasRenderer.ts:258`、forge 2026-08-13 `CanvasRenderer.resize`                             | 修正済み #463                              |
| `flush` がキャッシュ更新なしに `fillStyle`／`globalAlpha` を変更                                                                        | `CanvasRenderer.ts:414`、forge 2026-08-13                                                     | 修正済み #469                              |
| `parseColorToRGBA` が不正入力で直前の解析結果を返した                                                                                   | `renderer/colorParse.ts:60`、forge 2026-08-13                                                 | 修正済み #492                              |
| `SplineEntity.bake` が生の `window.devicePixelRatio` を使用                                                                             | `SplineEntity.ts:433` 修正前、forge 2026-08-13                                                | 修正済み #492                              |
| `WebGLPointRenderer.setTexture` がバッチ flush を欠落                                                                                   | `WebGLPointRenderer.ts:974`、forge 2026-08-13                                                 | 修正済み #520                              |
| `ThreeRenderer.fillText` が weight をサイズとして解析、ベースラインが `fontSize/2` ずれた                                               | `ThreeRenderer.ts:274`、`:831`、forge 2026-08-13 / #486                                       | 修正済み #511                              |
| ミラーされた ortho で `FrontSide` の fill／circle／gradient／image がカリングされた                                                     | `ThreeRenderer.ts:250`、forge 2026-08-13                                                      | 修正済み #519                              |
| `drawImage` が y-down カメラで垂直反転（`flipY = true`）                                                                                | `ThreeRenderer.ts:478`、forge 2026-08-23 #603                                                 | 修正済み #613                              |
| 細線ストローク（`LineBasicMaterial.linewidth` が無視される）、DPR 無視、GL コンテキストリーク、グラデーション >8 stops のリサンプリング | `ThreeRenderer.ts:110` ribbon、`:307`、`ThreeRenderer.ts:1044` dispose、forge 2026-08-23 #604 | 修正済み #623                              |
| `getBounds()` が stroke を除外 → カリングで `strokeWidth/2` がクリップ                                                                  | `Circle.ts:67`、`Rect.ts:54`、forge 2026-08-08                                                | 修正済み 2.18.3                            |
| `getBounds()` の `-0` 成果物がテストに刻まれた                                                                                          | forge 2026-08-08 `-0` エントリ                                                                | 修正済み 2.18.3                            |

## レンダラ変更を出荷する前のチェックリスト

1. **`window.devicePixelRatio` ではなく `pixelRatio` を読むこと。** blit されるテクスチャをラスタライズする場合、キャッシュを `renderer.pixelRatio` でキー付けし、`resize` 後に再ラスタライズすること。
2. **DoubleSide と unflip。** y-down ortho の下では、すべての `Mesh`／`PlaneGeometry` が `side: DoubleSide` と `texture.flipY = false` を必要とする（`ThreeRenderer.ts:596`、`:478`）。
3. **Flush を意識したキャッシュ。** `fillStyle` や `globalAlpha` を変更するパスは対応するキャッシュを更新しなければならず、コンテキストをリセットするものはそれを破棄しなければならない（`CanvasRenderer.ts:258`）。
4. **バッチを尊重する。** 同スタイルの `fillCircle` を合体させたいなら、バッチされていない描画を間に挟まないこと。シザー／テクスチャ／アルファ変更の前に `flush()` すること。
5. **クリップは 3 箇所にある。** ペイント用のレンダラ `clip()`、ヒット／A11y／content 用の `clipChildren`（`Scene.ts:254`、`:4335`）、仮想化用のビューポートバンド。1 つを変更して他の 2 つを監査しないのはバグである。
6. **実際の DPR でプロファイルする。** `maxDPR: 2` はストロークが重いパスでの性能保証ではない — `benchmarks/run-browsers.sh` で実機・ネイティブ DPR で計測すること（両エンジン、headed）。

## 関連

- **ボス 03（投影と仮想化）**は `clipChildren` と、このボスのカリングが鏡像する `projectionBoxVisible`／content-tier ポリシーを所有する。
- **ボス 06（VMT ランタイム）**は `Scene.render`、`RenderScheduler`／`DirtyTracker` ポリシー、そしてすべてのレンダラが消費する `worldMatrix` を所有する。
- **ボス 02（text／layout）**はこのボスがラスタライズするメトリクスを所有する。**ボス 09（Three／XR）**は本ドキュメントのすべての罠を再利用する — リボンストローク、シザークリップ、DPR、DoubleSide がその出発キットである。**ボス 08（WASM）**は同じ `Scene` ビューポートと DPR 値を再利用する。型付き配列ビューの staleness は、次のボスにおける古いラスタキャッシュの別形態である。
