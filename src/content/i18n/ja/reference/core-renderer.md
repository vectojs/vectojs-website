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
}
```

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

Coreはフォント読み込み後に保持されたキャリアを較正し、ポインター選択をローカルグリッド空間でルーティングします。Firefoxのフォント代替、DPR、ブラウザズーム、回転、ミラートランスフォーム、および不均一スケーリングはしたがって1つのジオメトリ計画を使用します。較正プローブは投影のズームコンテキストを継承し、Firefoxのグリフ欠落フォールバックメトリクスを考慮します；カスタムのリサイズ/ズーム所有者は `scene.resize()` を呼び出して保持された較正を無効化する必要があります。通常の `lines` 投影と行のないカスタム投影も、変換された2次元の書記素キャレットジオメトリを使用します。

`present()` はSceneによって各レンダーパスの終わりに**1回だけ**呼び出されます。一度にフレーム全体を送信する保持型バックエンド（例：[`@vectojs/three`](/reference/three-renderer/) の `ThreeRenderer`）は、ここで単一の高価なコミットを行い、`flush()` を軽量に保つべきです — Sceneはバッチされていないノードごとに `flush()` を呼び出すため、高価な `flush()` はフレームコストをエンティティ数の2乗にします。

## CanvasRenderer

```ts
new CanvasRenderer(canvas: HTMLCanvasElement)
```

デフォルトの `IRenderer` です。構築時に `devicePixelRatio` スケーリングを適用します。各バッチ化された `fill()` は `MAX_BATCH = 64` サブパスに制限されます（単一のCanvas2D `fill()` はサブパス数に対して超線形です）。ハンドルは `scene.getRenderer()` で取得します。

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

> エンティティフック `getBatchCircle()` → `{ radius, color }` および `getBatchRect()` → `{ width, height, color }`（[`Entity`](/reference/core-entity/#a11y--batching-hooks-override-to-opt-in) を参照）が、このレイヤーにフィードするエンティティごとのオプトインです。

## parseColorToRGBA

```ts
parseColorToRGBA(css: string): RGBA           // RGBA = [number, number, number, number]、範囲 [0,1]
```

`#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa` および `rgb()`/`rgba()` の高速パスを持ちます；他の形式（名前付き、`hsl()`、…）はDOMが存在する場合、キャッシュされた1×1キャンバスを通じて解決されます。結果は**キャッシュされ、同一性で共有されます — 返された配列は読み取り専用として扱ってください。** DOMなしでパース不可能な入力 → 不透明な黒 `[0,0,0,1]`。

## 関連情報

[`Entity`](/reference/core-entity/)（バッチングフック、コンテンツ投影） ·
[`ComputeParticleEntity`](/reference/core-particles/)（WebGL/WebGPUコンシューマー） ·
[テキスト & Bidi](/reference/core-text/)（MSDFグリフコンシューマー） ·
[`@vectojs/three` の `ThreeRenderer`](/reference/three-renderer/)（代替 `IRenderer`） ·
[`@vectojs/core` 概要](/reference/core-api/)
