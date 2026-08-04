---
title: 'レンダラー'
description: '@vectojs/core/renderer サブパス：バックエンド非依存のIRenderer契約、CanvasRenderer、SVGRenderer、WebGLポイント/矩形/スプライト/MSDFレイヤー、Entityコンテンツ投影、およびparseColorToRGBA。'
order: 5
---

# レンダラー — `@vectojs/core/renderer`

[`@vectojs/core`](/reference/core-api/) の一部です。

## IRenderer

すべての `Entity.render` が受け取るバックエンド非依存の描画面です。

```ts
interface IRenderer {
  readonly pixelRatio?: number; // device px per CSS px of the backing store (1.29.0+)

  clear(): void;
  save(): void;
  restore(): void;
  translate(x, y): void;
  scale(x, y): void;
  rotate(angle): void; // ラジアン、時計回り
  setGlobalAlpha(alpha): void; // [0,1]
  clip(x, y, width, height): void; // クリップ矩形を交差（save/restore でラップ）

  beginPath(): void;
  moveTo(x, y): void;
  lineTo(x, y): void;
  bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y): void;
  closePath(): void;
  arc(x, y, radius, startAngle, endAngle, counterclockwise?): void;
  roundRect(x, y, width, height, radii: number | number[]): void;

  drawImage(source: CanvasImageSource, dx, dy, dw, dh): void;
  fill(colorOrGradient: string | any): void;
  stroke(colorOrGradient: string | any, lineWidth = 1): void;
  fillText(text, x, y, font, color): void; // font = CSS省略形、例 '16px monospace'

  fillCircle(cx, cy, radius, color, alpha = 1): void; // 順序保持、同スタイルバッチ
  flush(): void; // 保留中のバッチをコミット（アイドル時はno-op）
  present?(): void; // オプションのフレームエンドコミット
  createLinearGradient(x0, y0, x1, y1, colorStops: { stop; color }[]): any;
  dispose?(): void; // 冪等なバックエンドクリーンアップ。Scene.destroy() が呼び出します

  // GPU context loss (optional; implement for a GPU-backed renderer)
  isContextLost?(): boolean; // Scene skips the render pass while true
  onContextRestored?(cb: () => void): void; // Scene repaints the cleared surface
}
```

### `pixelRatio` — blit されるピクセルをラスタライズする

描画コンテキストに**すでに適用済み**の比率、すなわち CSS ピクセルあたりのデバイスピクセル数です（`1.29.0+`）。レンダラーへ blit されるテクスチャをラスタライズするときは `window.devicePixelRatio` ではなくこちらを読み、そうしたテクスチャのキャッシュはこの値でキーイングしてください。

この 2 つの値はずれます。しかもどちらのずれも blit を壊します:

- バックエンドが**クランプ**する（`CanvasRenderer.maxDPR`、`SceneOptions.maxDPR`）ため、ウィンドウの比率でラスタライズすると、スケールされたコンテキストが再サンプリングするテクスチャができてしまいます;
- `window.devicePixelRatio` はズームが適用された瞬間に変わりますが、バッキングストアは誰かが `resize()` を呼んだときにだけ再確保されます。その隙間でのライブ読み取りは**未来**の比率を報告するので、それをキーにしたキャッシュはコンテキストがまだ採用していないスケール向けにラスタライズします——同じ欠陥の裏返しです。

モジュールスコープで一度だけ捕まえた値は、そのどちらよりも悪いです: ズームもモニター移動もまったく追随できません。それがこのプロパティの存在理由——その欠陥を修正可能にすること——であり、`Markdown` のコードグリフアトラスプールがリポジトリ内の利用者です。これはこの値をキーに `GlyphRasterAtlas` の有界 LRU を保持しており、ブラウザのズーム後にコードがぼやけなくなるのはそのためです。

任意であり、スナップショットではなく**ライブ**な読み取りです: 自前のバッキングストアを持たないバックエンドは省略し、呼び出し側は不在を `1` として扱います。`CanvasRenderer` はコンテキストをスケールする 3 か所すべて——構築時、`resize()`、`contextrestored` による復旧——で実際に適用した比率を記録するため、ズームをまたぐ GPU リセットの後でも値は正しいままです。

### GPUコンテキスト消失への対応

GPUリセットまたはメモリ圧力による追放によって描画コンテキストが奪われます。対処しなければ、サーフェスは永久に空白のままになります。GPUコンテキストを持つレンダラーは以下を行うべきです：

1. その消失イベントをリッスンし `preventDefault()` します——さもなければブラウザは対応する復元イベントを決して発火させません；
2. `isContextLost() === true` を報告し、`Scene.render` が死んだコンテキストに対して描画コールを発行する代わりにパスをスキップするようにします；
3. 復元時にコンテキストを再取得し、DPR変換/サイズを再適用し、`onContextRestored` コールバックを発火させてSceneが新しくクリアされたサーフェスを再描画するようにします。

`CanvasRenderer` はCanvas2Dに対してこれを実行し、`ThreeRenderer` はWebGLに対してこれを実行します——[`@vectojs/three`](/reference/three-renderer/#gpuコンテキストの損失とランタイムdpr) を参照。

`fillCircle` は連続する同じ `color`/`alpha` の呼び出しを1つのパスに統合し、`flush()` 時（またはスタイル変更時）にコミットされます。Sceneは各兄弟グループの終了時と各フレームの終了時にフラッシュし、ペインターズオーダーを保持します。

## `Entity.getContentProjection()`

```ts
getContentProjection(): ContentProjection | null // デフォルト null
// ContentProjection: {
//   text: string; font?: string; lineHeight?: number; selectable?: boolean;
//   contentX?: number; contentY?: number; baseline?: number;
//   lines?: Array<{ text; x; y; baseline; font?; lineHeight?; runs? }>;
//   grid?: PreparedContentGrid;
// }
```

静的なテキストをレンダリングするエンティティのためのオプトインフック：Sceneは返された文字列を透過的で位置同期されたDOMノード（ビューポート遅延、ダーティチェック付き、エンティティがインタラクティブな場合は `aria-hidden`）としてミラーリングし、キャンバステキストを検索可能に、スクリーンリーダー/クローラーから可視に、翻訳可能に、そして `selectable: true` ではネイティブ選択可能にします。`TextEntity`/`MSDFTextEntity`（[テキスト & Bidi](/reference/core-text/) を参照）がこれを実装しています。シーン全体のオフスイッチ：`new Scene(canvas, { contentProjection: false })`。

Sceneは投影ノードが出現または消滅する際にVMT順序を保持し、エンティティサブツリーとともに子孫投影を削除し、投影がビューポートの完全に外側にあるか `clipChildren` 祖先内にある場合は非表示にします。ツールはDOMに問い合わせることなく、現在具体化されたミラーを検査できます：

```ts
scene.getContentElement(entityId: string): HTMLElement | undefined;
```

仮想化された、または具体化されていないビューポート外のテキストは、アプリケーションがそれをアクティブシーンに持ち込むまで検索可能ではありません。

> Core 1.6.0以降が必要：Canvasはテキスト位置をベースラインとして受け入れ、CSSはラインボックスを受け入れます。正確な選択ジオメトリが必要な場合は、単純なテキストランには `contentX`/`contentY` と `baseline` を、コンポーネントが既に折り返し、インセット、または混合タイポグラフィを所有している場合はビジュアル行ごとに1つの明示的な `lines` エントリを提供してください。Sceneはこれらのローカル座標をエンティティトランスフォームを通じてマッピングし、CSSラインボックスをCanvasフォントメトリクスと同期させます。

```ts
getContentProjection() {
  return {
    text: 'small large',
    selectable: true,
    lines: [{
      text: 'small large', x: 18, y: 12, baseline: 25,
      font: '28px sans-serif', lineHeight: 42,
      runs: [
        { text: 'small ', font: '16px sans-serif' },
        { text: 'large', font: 'bold 28px sans-serif' },
      ],
    }],
  };
}
```

カスタムCanvasネイティブエディターで同じテキストをネイティブコントロールやコンテンツ投影と揃える必要がある場合は、`cssLineBoxBaseline(font, lineHeight)` を使用してください。

> Core 1.8 はコード風レンダラーのために `prepareContentGrid(source, metrics)` を追加します。その不変の結果を `ContentProjection.grid` として返し、Canvasペイントに同じセルを使用します。グリッドはUTF-16ソース範囲、正しい書記素キャレット、CR/LF/CRLF区切り、タブ、ワイドCJKおよび絵文字の進行、アラビア語整形、Unicode bidi位置を保持し、投影されたDOMはコピーと検索のために正確な論理ソースを維持します。

```ts
const grid = prepareContentGrid(source, {
  font: codeFont,
  cellWidth,
  lineHeight: 24,
  baseline: 18,
});

getContentProjection() {
  return { text: source, selectable: true, grid };
}
```

### `ContentProjectionHint` による行ウィンドウ化（`1.30.0+`）

ビューポート外のエンティティは完全にスキップされますが、**ビューポートより背の高い**エンティティは常にそのゲートを通過し——そしてかつてはその行すべてをミラーしていました。長いドキュメントは全体にわたって視覚行ごとに 1 つの DOM ノードを生成していました（測定値：346 KB の Markdown ドキュメントで 14.8k 要素）。

Scene は投影する価値のあるエンティティローカルな垂直帯を記述するヒントを渡すようになり、その内側の行のみをミラーします：

```ts
interface ContentProjectionHint {
  minY?: number; // entity-local top of the band worth projecting
  maxY?: number; // entity-local bottom
}
```

これを尊重するかは任意です——引数を無視してもすべて動作し、単に節約が得られないだけです。4,000 行のドキュメントで測定：

|            | 変更前        | 変更後          |
| ---------- | ------------- | --------------- |
| Chrome     | 4.21 ms/frame | 0.20 ms (21.1x) |
| Firefox    | 4.83 ms/frame | 0.14 ms (34.5x) |
| DOM 子要素 | 36,000        | 1,026 (35x)     |

その結果、投影コストはドキュメントサイズの 20 倍の範囲にわたって**平坦**になります。ドキュメントではなくビューポートに追従するためです。

境界の丸め方をすべての実装で同一にするため、`contentLineInHint(hint, y, height)` を使用してください：

```ts
getContentProjection(hint?: ContentProjectionHint) {
  const lines = this.allLines.filter((l) => contentLineInHint(hint, l.y, l.lineHeight));
  return { text: this.text, selectable: true, lines };
}
```

> [!IMPORTANT]
> **連続した**行の並びを発行し、`text` が空でない間は空の並びを決して発行しないでください。DOM の順序は、ブラウザが選択を拡張したりコピーをシリアライズしたりするときにたどる順序そのものなので、隙間があるとそこを越えるドラッグが間の行を黙って取りこぼします。`text` が空でないのに `lines` が空だと、Scene はドキュメント全体に対して 1 つのテキストノードを投影するフォールバックに切り替わります。

グリッド投影は異なります：Scene が絶対行番号で索引するため、`lines` は**疎でドキュメントのインデックスに揃えた**まま保ってください。詰めてしまうと 20 行目のジオメトリが 0 行目に渡され、すべてのキャリアが誤配置されます——エラーは出ず、選択ジオメトリだけが誤ります。

実体化されたウィンドウはミラー上に `data-vecto-projection-window` として公開されるため、ツールは「この行はここにない」と「この行は存在しない」を区別できます。

ビューポートの外側にどれだけ行とエンティティを保持するかは `contentProjectionMargin`（[`SceneOptions`](/reference/core-scene/#sceneoptions) を参照）で決まり、デフォルトはビューポート 1 つ分の高さです。`Infinity` はウィンドウ化を無効化してすべてを実体化します。これはドキュメント全体を DOM に入れたいテストで時折役に立ちます。

Coreはフォント読み込み後に保持されたキャリアを較正し、ポインター選択をローカルグリッド空間でルーティングします。Firefoxのフォント代替、DPR、ブラウザズーム、回転、ミラートランスフォーム、および不均一スケーリングはしたがって1つのジオメトリ計画を使用します。較正プローブは投影のズームコンテキストを継承し、Firefoxのグリフ欠落フォールバックメトリクスを考慮します；カスタムのリサイズ/ズーム所有者は `scene.resize()` を呼び出して保持された較正を無効化する必要があります。通常の `lines` 投影と行のないカスタム投影も、変換された2次元の書記素キャレットジオメトリを使用します。

`present()` はSceneによって各レンダーパスの終わりに**1回だけ**呼び出されます。一度にフレーム全体を送信する保持型バックエンド（例：[`@vectojs/three`](/reference/three-renderer/) の `ThreeRenderer`）は、ここで単一の高価なコミットを行い、`flush()` を軽量に保つべきです — Sceneはバッチされていないノードごとに `flush()` を呼び出すため、高価な `flush()` はフレームコストをエンティティ数の2乗にします。

## CanvasRenderer

```ts
new CanvasRenderer(canvas: HTMLCanvasElement)
```

デフォルトの `IRenderer` です。構築時に `devicePixelRatio` スケーリングを適用します。各バッチ化された `fill()` は `MAX_BATCH = 64` サブパスに制限されます（単一のCanvas2D `fill()` はサブパス数に対して超線形です）。ハンドルは `scene.getRenderer()` で取得します。

## TextRasterCache

_Core 1.12.0 以降。_

```ts
new TextRasterCache(options?: { maxEntries?: number; dpr?: number })
cache.get(font: string, color: string, text: string): TextRaster | null
cache.clear(): void
cache.stats: { hits: number; misses: number; size: number }
```

事前ラスタライズされたテキストのランのキャッシュで、**同じ短い文字列を1フレームに何千回も**描画するビュー向けです（弾幕、チャット/ログの末尾、データグリッドのセル、パーティクルのラベル）。`ctx.fillText()` は規模が大きくなると見かけによらず高コストです：各呼び出しは文字列を再シェイプし、CSSの色を再パースし、CPUメインスレッド上でグリフをラスタライズします——プロファイルを見ると、GPUが飢えてアイドルする一方で、メインスレッドはネイティブ（`(program)`）コードに張り付いています。

`get()` は、異なる `(font, color, text)` の各ランを一度だけ小さなオフスクリーンキャンバスにラスタライズします。以降のフレームでは、再シェイプする代わりに `drawImage` でそれをブリットします。返されたオフセットを差し引くことで、`fillText` のベースラインでブリットします：

```ts
const r = cache.get('600 24px system-ui', '#38bdf8', label);
if (r) renderer.drawImage(r.canvas, x - r.offsetX, baselineY - r.offsetY, r.width, r.height);
else renderer.fillText(label, x, baselineY, '600 24px system-ui', '#38bdf8'); // headless fallback
```

`TextRaster` は `{ canvas, width, height, offsetX, offsetY }` です（寸法はCSSピクセル）。インスタンスは分離されています（共有のグローバル状態なし）。`dpr > 1` はブリットサイズをCSSピクセルで保ちながらHiDPIでテキストをくっきりと保ち、挿入順の追い出し上限（`maxEntries`、デフォルト4096）は無制限の（ユーザーが入力する）コンテンツに対してメモリを抑え、`get()` はヘッドレス/非DOMのコンテキストでは `null` を返すため、`fillText` のフォールバックを維持できます。その効果は**再利用**から生まれます——一度しか描画されないランは純粋なオーバーヘッドです。

## SVGRenderer

```ts
new SVGRenderer(width: number, height: number)
toXMLString(): string
```

描画をフラットなSVG文字列に記録するソフトウェア `IRenderer` です（行列/アルファ/クリップスタック、グラデーション重複排除）。テキストと属性値はXMLエスケープされ、外部画像URLは実行可能/data/file/customスキームを拒否します（Canvas生成のラスターデータURLは引き続きサポートされます）。`scene.toSVG()` をバックアップします。`SVGLinearGradient` はグラデーション記述子型です。

## WebGL ポイントレイヤー

```ts
createWebGLPointRenderer(canvas: HTMLCanvasElement): PointRenderer | null   // WebGL2 / シェーダーが利用不可の場合は null

interface PointRenderer {
  resize(width, height): void;                 // 論理サイズ。DPRを適用
  begin(): void;                               // フレームごとのバッファをリセット
  addCircle(x, y, radius, color, alpha?): void;        // ワールド座標
  addRect(x, y, width, height, color, alpha?, rotation?): void;
  setTexture(source: TexImageSource): void;
  addSprite(x, y, width, height, u0, v0, u1, v1, color?, alpha?, rotation?): void;
  setMSDFTexture(source: TexImageSource, distanceRange: number): void;
  addGlyph(x, y, width, height, u0, v0, u1, v1, color?, alpha?, rotation?): void;
  flush(): void;                               // 蓄積されたすべてのプリミティブをクリア + 描画
  destroy(): void;
}
```

1つのWebGL2キャンバス、4つのバッチ化プログラム：ポイント（`gl_PointSize` による丸型、AA）、矩形（拡張三角形）、テクスチャ付きスプライト、およびMSDFグリフ（3値中央値距離再構成、任意のズームで鮮明）。`color` で色合いを付けます；白いテクセルは変更されずに通過します。スプライト/グリフの追加はテクスチャが設定されるまでno-opです。Sceneは `pointBackend: 'webgl'` の場合に `getBatchCircle`/`getBatchRect`（およびCPUパーティクル、MSDFテキスト）をここにルーティングします。GPUプリミティブが正確に表現できないトランスフォーム下のリーフ（例：不均一スケールやせん断）は通常のレンダラーにフォールバックします。

> エンティティフック `getBatchCircle()` → `{ radius, color }` および `getBatchRect()` → `{ width, height, color }`（[`Entity`](/reference/core-entity/#a11y--バッチングフックオーバーライドしてオプトイン) を参照）が、このレイヤーにフィードするエンティティごとのオプトインです。

`flush()` は **プリミティブタイプごとに最大1回の描画呼び出し** を行うため、描画呼び出し回数はスケーリングの制限ではありません — アップロードされるバイト数が制限です。core 1.16.2以降、すべてのクアッドバッチ（rect、sprite、グリフ、切り抜き円）は **4頂点** をアップロードし、6頂点に展開して `drawArrays` する代わりに、1つの共有静的32ビットインデックスバッファに対して `drawElements` で描画します。これにより、クアッドごとに重複する2つのコーナーが削除され、アップロード量が3分の1削減されます。インデックスバッファは一度構築され、幾何級数的に再成長し、フレームごとに再送されることはありません。インデックスは32ビットです。`Uint16Array` ではバッチが16,383クアッドに制限されるからですが、実際のシーンはそれを超えます。

実際のハードウェア（RTX 4060 ラップトップ、`gl.finish()` 込み、12回の中央値）で、以前の6頂点パスと比較して測定：

| quads/frame | Chrome         | Firefox         |
| ----------- | -------------- | --------------- |
| 12,000      | 0.61 → 0.09ms  | 2.66 → 1.47ms   |
| 50,000      | 2.22 → 0.87ms  | 9.02 → 6.24ms   |
| 100,000     | 12.62 → 3.12ms | 16.81 → 10.88ms |

おおよそ **35,000–50,000 quads/frame** 未満では、頂点バッファを埋めるJSのコストがGPUサブミットを上回ります；それを超えるとサブミットが支配的になり、有効なレバーは（カリング、仮想化による）描画量の削減であって、フィルのチューニングではありません。Firefoxは頂点レイアウトに関係なく〜1 GB/sの実効アップロード帯域を維持するため、そのエンジンではバイト数を減らすことが唯一の信頼できるレバーです。

## parseColorToRGBA

```ts
parseColorToRGBA(css: string): RGBA           // RGBA = [number, number, number, number]、範囲 [0,1]
```

`#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa` および `rgb()`/`rgba()` の高速パスを持ちます；他の形式（名前付き、`hsl()`、…）はDOMが存在する場合、キャッシュされた1×1キャンバスを通じて解決されます。結果は**キャッシュされ、同一性で共有されます — 返された配列は読み取り専用として扱ってください。** DOMなしでパース不可能な入力 → 不透明な黒 `[0,0,0,1]`。

キャッシュは1,000エントリを保持し、**挿入順（FIFO）**で追い出します。キャッシュヒットは意図的にエントリを昇格**しません**：この関数はクアッドごとに1回呼び出され、~25,000 quads/frameでは、真のLRUに必要な `Map.delete` + re-`set` のペアのコストが、関数内の他のすべてを合わせたものを上回ります。実用的な結果として、シーンの異なる色のワーキングセットが1,000を超える場合、早期に挿入されたホットな色が追い出されて再パースされる可能性があります。典型的なシーンではワーキングセットは小さく安定しているため、FIFOとLRUは同じエントリを追い出します。

## 関連情報

[`Entity`](/reference/core-entity/)（バッチングフック、コンテンツ投影） ·
[`ComputeParticleEntity`](/reference/core-particles/)（WebGL/WebGPUコンシューマー） ·
[テキスト & Bidi](/reference/core-text/)（MSDFグリフコンシューマー） ·
[`@vectojs/three` の `ThreeRenderer`](/reference/three-renderer/)（代替 `IRenderer`） ·
[`@vectojs/core` 概要](/reference/core-api/)
