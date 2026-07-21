---
title: 'テキスト & Bidi'
description: 'スタンドアロンの @vectojs/text パッケージ（@vectojs/core/text サブパスでもある）：タイポグラフィのメトリクス、MSDFフォント解析、アラビア語整形とbidiリゾルバー、加えてcore常駐の MSDFTextEntity/GridTextEntity GPUテキストレンダラー。'
order: 7
---

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
```

軽量ビルトインbidi：範囲ベースの方向クラス（ヘブライ語/アラビア語 R/AL、EN/AN 数字）とアラビア語の文脈的プレゼンテーションフォーム選択。`indexMap` は整形されたインデックスをヒットテスト/キャレットマッピングのためにソース文字列にマッピングし直します。

使用法については [テキスト & タイポグラフィ](/learn/text-typography/) を参照してください。

## 関連情報

[レイアウトエンジン](/reference/core-layout/)（これがレンダリングするコールド/ホットパス） ·
[レンダラー](/reference/core-renderer/)（WebGL ポイントレイヤー、コンテンツ投影） ·
[`@vectojs/core` 概要](/reference/core-api/)
