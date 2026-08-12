+++
title = "テキスト & Bidi"
description = "スタンドアロンの @vectojs/text パッケージ（@vectojs/core/text サブパスでもある）：タイポグラフィのメトリクス、MSDFフォント解析、アラビア語整形とbidiリゾルバー、加えてcore常駐の MSDFTextEntity/GridTextEntity GPUテキストレンダラー。"
weight = 7
+++

# テキスト & Bidi — `@vectojs/text`

テキストシェイピングプリミティブ——`BidiResolver`、`ArabicShaper`、`Typography`、`MSDFFont`、`prepareContentGrid`/`PreparedContentGrid`——はスタンドアロンの **`@vectojs/text`** パッケージ（`bidi-js` のみに依存するリーフパッケージ）です。`Entity` ベースのGPUテキストレンダラー（`MSDFTextEntity`、`SVGEntity`、`TextEntity`/`GridTextEntity`）は `Entity` を拡張するため、[`@vectojs/core`](/reference/core-api/) に残ります。coreは `@vectojs/text` のプリミティブを再エクスポートするため、`@vectojs/text`、`@vectojs/core`、または `@vectojs/core/text` サブパスから解決されます。[レイアウトエンジン](/reference/core-layout/)のコールド/ホット分割の上に構築されています。

## MSDFFont

```ts
new MSDFFont(data: MSDFFontData)
MSDFFont.parse(json: string | MSDFFontData): MSDFFont   // msdf-atlas-gen JSON を読み取り
font.getGlyph(unicode: number): MSDFGlyphDef | undefined
font.layout(text, fontSizePx, opts?: MSDFLayoutOptions): MSDFLayoutResult   // \\n、カーニング、letterSpacing を反映
font.distanceRange / font.atlasWidth / font.atlasHeight
```

デファクトスタンダードの `msdf-atlas-gen` JSON をパースし、テキストをCSSピクセルクアッドにアトラスUV（y-downローカル空間；v=0はアトラス上部）で配置します。`layout()` をWebGLバックエンドの `setMSDFTexture` + `addGlyph`（[WebGL ポイントレイヤー](/reference/core-renderer/#webgl-ポイントレイヤー) を参照）と組み合わせて、解像度非依存のGPUテキストを実現します。型：`MSDFFontData`、`MSDFAtlasInfo`、`MSDFMetrics`、`MSDFGlyphDef`、`MSDFBounds`、`MSDFKerning`、`PositionedGlyph`、`MSDFLayoutResult`、`MSDFLayoutOptions`。

## MSDFTextEntity

```ts
new MSDFTextEntity(text: string, options: MSDFTextEntityOptions)
// options: { font: MSDFFont, texture: TexImageSource, fallbackFont?, fontSize?, color?, lineHeight?, letterSpacing? }
setText(text: string): void
```

シーンが `pointBackend: 'webgl'` で動作している場合、WebGLポイントレイヤーを通じて鮮明なMSDFグリフをレンダリングします；それ以外の場合は `fallbackFont` を使用してCanvas2D `fillText` にフォールバックします。レイアウトは `LayoutWorkerManager` を介して**オフスレッド**で計算され、コールバックで適用され、`markDirty()` を呼び出します — そのためテキストは構築/`setText` から1非同期ティック後に表示されます。

## TextEntity & GridTextEntity（`.` から）

```ts
new TextEntity(text: string, atlas: GlyphAtlas, maxWidth: number, fontSize = 32)
text.setText(text): this        // コールドパス（再セグメント化 + 再計測）、その後リフロー
text.setMaxWidth(maxWidth): this // ホットパスのみ — キャッシュされた PreparedText を再利用（安価なレスポンシブリサイズ）
text.setTextAlign(align: 'left' | 'justify'): this
text.setHyphenator(fn: ((word: string) => string[]) | null): this

new GridTextEntity(_atlas: any, fontSize = 10)
grid.updateGrid(ascii: string[])   // 等幅セルグリッド。interactive=false（パフォーマンスのためa11yオフ）
```

`setTextAlign('justify')` は折り返された行を `maxWidth` にぴったり合うように伸ばします（単語間スペース、またはスペースのないCJK行の場合は文字間ギャップ）；各段落の最終行はラグドのままです。`setHyphenator()` は単語→パーツ関数（例：`hyphen` npmパッケージのKnuth–Liangパターン）をプラグインするため、長い単語は表示可能な `-` で単語途中で改行できます；ソーステキストに既にあるソフトハイフン（U+00AD）はハイフネーターなしでも機能します。`TextEntity` は各ノードの計算された `x` で**グリフごとに**レンダリングするため、両方が適用されます — ジャスティフィケーション/ハイフネーションの計算は視覚的に反映されます。

`MSDFTextEntity` と `@vectojs/ui` の `Text`/`RichText` コンポーネントは同じ基礎となる `LayoutEngine` を共有しますが、これらの2つのメソッドはまだ公開していません — `Text`/`RichText` はパフォーマンスのために各折り返し行を1つのネイティブ `fillText()` 呼び出しとしてレンダリングするため、オプションが公開されてもグリフごとのジャスティフィケーションオフセットを暗黙的に破棄します。ジャスティファイドまたはハイフネーションされたテキストが必要な場合は、`TextEntity` を直接使用するか（または `textAlign`/`hyphenate` を設定して生の `LayoutEngine` を駆動して）ください。

## Bidi / 整形

```ts
ArabicShaper.shapeArabic(text: string): ShapedResult   // { shapedText, indexMap: Int32Array } — プレゼンテーションフォーム結合
BidiResolver.getBaseLevel(text: string): number
BidiResolver.resolveLevels(text: string): Uint8Array
BidiResolver.reorderVisual(nodes: any[], baseLevel: number): void
BidiResolver.reorderSegments(str: string, levels: Uint8Array, baseLevel: number):
  Array<[number, number]>
```

軽量ビルトインbidi：範囲ベースの方向クラス（ヘブライ語/アラビア語 R/AL、EN/AN 数字）とアラビア語の文脈的プレゼンテーションフォーム選択。`indexMap` は整形されたインデックスをヒットテスト/キャレットマッピングのためにソース文字列にマッピングし直します。

`reorderVisual` はノードオブジェクトの配列をその場で並べ替えます。`reorderSegments` は同じ UAX #9 **L2** 反転範囲（ランの自位置上の包含的 `[start, end]` インデックスペア）をノードオブジェクトを必要とせずに公開するため、**並列型付き配列**を持つ呼び出し元は同一の置換をその場で適用できます — これがゼロGCバッファレイアウトパスが使用するものです。`reorderVisual` は現在これに委任しているため、両者が乖離することはありません。

使用法については [テキスト & タイポグラフィ](/learn/text-typography/) を参照してください。

## ヘッドレス環境でのテキストメトリクス

```ts
registerFontMetrics(family: string, source: FontMetricsSource): void
registerMSDFFontMetrics(family: string, font: MSDFFont | MSDFFontData | string)
createMSDFMetricsSource(font: MSDFFont): FontMetricsSource
getFontMetrics(family: string): FontMetricsSource | undefined
hasFontMetrics(): boolean
fontMetricsVersion(): number
clearFontMetrics(): void
createMeasuringContext(): CanvasRenderingContext2D | null   // see below
```

テキストの測定は通常、レンダラーが実際に描画するフォントを測定する Canvas 2D コンテキストを通じて行われます。Node SSR や `OffscreenCanvas` のないワーカーなど、コンテキストがない場合、測定に使用できるものがなく、すべてのグリフの advance は一律 `0.5em` にフォールバックします。32px の `sans-serif` を使用した Chrome での測定と比較すると、これは幅の狭いテキストで **+125%**、幅の広いテキストで **−47%** 間違っており、`iiiiiiiiii` は `WWWWWWWWWW` とまったく同じ幅になります。折り返しはこのエラーを引き起こすため、改行も間違った場所に着地します。

`createMeasuringContext()` は、そのような場合の軽量な抜け道です：1×1 のオフスクリーン `<canvas>`（document body に追加され、非表示、`aria-hidden`）を作成し、登録されたメトリクスソースを持たないフォントを測定するための 2D コンテキストを返します — DOM のない環境では `null` を返します。これはエンジン自身が使用するコンテキストであるため、レンダラーが実際に描画するフォントを測定します。これは上記のレジストリベースのパスでは実現できません。共有の単一測定コンテキスト（`getSharedMeasuringContext` / `isSharedMeasuringContextAttached` / `resetSharedMeasuringContext`、これも `@vectojs/text` から）は、すべての `@vectojs/*` パッケージにわたって使用される別個のメモ化されたコンテキストです — `ctx.font` は各読み取りの前に割り当てられるため、共有によって古い測定値が漏れることはありません。

起動時に一度メトリクスを登録すると、これが修正されます。任意の `msdf-atlas-gen` JSON が機能し、その `glyphs[].advance`、`kerning`、および `metrics` のみが読み取られます — アトラス画像は無関係であるため、メトリクスのみのファイルで十分であり、何もデコードされません：

```ts
import { registerMSDFFontMetrics } from '@vectojs/core';

registerMSDFFontMetrics('sans-serif', await readFile('inter.json', 'utf8'));
```

ファミリーは引用符を削除して大文字と小文字を区別せずに一致し、カンマ区切りのリストはその最初のファミリーのみを登録します。同じファミリーを再度登録すると以前の source が置き換えられ、`clearFontMetrics()` はすべてを破棄します（レジストリはプロセス全体に及ぶため、テストの分離に役立ちます）。

MSDF ではないフォントの source を直接指定します：

```ts
interface FontMetricsSource {
  advanceEm(char: string): number | undefined; // required
  measureEm?(text: string): number | undefined; // honors kerning
  ascenderEm?: number; // for cssLineBoxBaseline
  descenderEm?: number;
}
```

3 つのパスがレジストリを参照します：レイアウトエンジンのグリフごとの advance、`@vectojs/ui` の文字列全体の幅（`Button`、`Input`、`Link`、`Checkbox`、`ContextMenu`、`ProgressBar` のサイズを決定します）、および `ascenderEm`/`descenderEm` を必要とする `cssLineBoxBaseline` のベースライン。

> [!IMPORTANT]
> 実際の Canvas 2D コンテキストが常に優先されるため、メトリクスを登録してもブラウザが測定または描画するものを変更することはできません。これらはレンダリングを行うエンジンを上書きするためではなく、でっち上げの推測を置き換えるために存在します。

`measureEm` は提供する価値があります。グリフごとの契約は `measure(char, fontSize, family)` であり、隣接する文字がないため、合計された advance では kerning を復元できません — kerning が多い文字列では約 ~10% の誤差があります。文字列全体の測定は `measureEm` を介して行われ、正確です。

でっち上げの advance で測定されたテキストがあるかどうかを確認するには、[`@vectojs/layout`](/reference/core-layout/) の `unmeasuredGlyphCount()` がそれらをカウントし、1 回限りのコンソール警告で修正方法が示されます。これは `LayoutResult.fallbackToCanvas` とは異なります。後者は **atlas** のミスのみを報告し、ブラウザであっても基本的にすべての段落で true になります。

## `@vectojs/tex` — ゼロDOM TeX組版

`@vectojs/tex` は [`Markdown`](/reference/ui-markdown/) の `$…$` / ` ```math ` ブロックの背後にあるスタンドアロンパッケージです。KaTeXのパース/レイアウトカーネルをベンダー化し、結果を**自己完結型のSVG文字列**として再出力します。これは独自のグリフアウトラインを保持し、外部を一切参照しません — `data URI → Image → createImageBitmap` によるラスタライズを生き延びる唯一の形式です。遅延ロードされ（数式が実際に現れた時のみ）、別個の公開・バージョン管理されたパッケージです；`@vectojs/core` はそれを**再エクスポートしません**。

```ts
import { layout, emitSVG } from '@vectojs/tex';

const { svg, width, height, depth } = emitSVG(layout('x^2 + y^2 = z^2'));
```

カスタム呼び出し元がスタイルシートなし（canvasにはありません）でKaTeXのスタイルシート由来のフォント選択を再現できるようにする2つのemitレイヤーヘルパー：

```ts
resolveFont(classes: readonly string[]): ResolvedFont
// ResolvedFont = { font: FontName; substituted: boolean }

sizingRatio(classes: readonly string[]): number
```

`resolveFont` はKaTeX spanのCSSクラスを具体的な同梱フォントファイル（`FontName`、例：`'Main-BoldItalic'`、`'Size2-Regular'`）にマッピングします。フォント選択は**継承され、ローカルではありません** — `Span[delimsizing size1]` の下にネストされた `SymbolNode` は空のクラスリストを持つため、各祖先のクラスの連結に続けてシンボル自身のクラスを渡します（最外が最初、後のエントリが優先）。ファミリーが同梱していない要求されたウェイト/スタイルはRegularフェイスに劣化し、黙って間違って描画する代わりに `substituted: true` を設定します。

`sizingRatio` は `katex-sizing reset-size<N> size<M>` クラスを script/scriptscript のスケール乗数（`toMultiplier / fromMultiplier`）に変換します；クラスがサイズ指定を持たない場合は `1` を返すため、呼び出し元は無条件に乗算できます。これらが `@vectojs/tex` が `ex` 相対メトリクスでサイズを報告する背後にある仕組みです。

`FontName`、`ResolvedFont`、`layout`、`emitSVG`、および `LayoutOptions` も `@vectojs/tex` からエクスポートされます（その `src/index.ts` を参照）。

## 関連情報

[レイアウトエンジン](/reference/core-layout/)（これがレンダリングするコールド/ホットパス） ·
[レンダラー](/reference/core-renderer/)（WebGL ポイントレイヤー、コンテンツ投影） ·
[`@vectojs/core` 概要](/reference/core-api/)
