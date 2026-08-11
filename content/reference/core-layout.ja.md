+++
title = "レイアウトエンジン"
description = "スタンドアロンの @vectojs/layout パッケージ（@vectojs/core/layout サブパスでもある）：高価なテキストセグメント化+計測を安価な折り返し+位置演算から分離するコールド/ホット分割、ストリーミングメモ化、リッチテキスト、および除外シェイプ。"
weight = 4

[extra]
order = 4
+++

# レイアウトエンジン（コールド/ホット分割） — `@vectojs/layout`

レイアウトエンジンはスタンドアロンの **`@vectojs/layout`** パッケージです（シェイピングプリミティブのために [`@vectojs/text`](/reference/core-text/) にのみ依存します）。[`@vectojs/core`](/reference/core-api/) はそれに依存し再エクスポートするため、`@vectojs/layout`、`@vectojs/core`、または `@vectojs/core/layout` サブパスから区別なくインポートできます。

`LayoutEngine` は高価な**コールド**パス（`Intl.Segmenter` によるセグメント化 + 計測）を安価な**ホット**パス（折り返し + 位置演算）から分離するため、リサイズ/リフロー/アニメーションで再計測が発生しません。

```ts
new LayoutEngine(maxWidth: number, maxHeight: number, measurer?: GlyphMeasurer | null)

// コールド：一度セグメント化 + 計測 → 再利用可能な PreparedText
prepare(text, fontAtlas, fontSize = 32): PreparedText
prepareRich(spans: StyledSpan[], fontAtlas, baseFontSize = 32, baseStyle?: TextStyle): PreparedText

// ホット：PreparedText を配置されたグリフに配置（エンジンの maxWidth/maxHeight を読み取り）
layoutPrepared(prepared, exclusionMask?, exclusions?: ExclusionRect[]): LayoutResult
layoutPreparedIntoBuffer(prepared, buffer: LayoutResultBuffer, exclusionMask?): void   // 型付き座標ストレージを再利用

// ワンショット（コールド+ホット同時）
layoutText(text, fontAtlas, fontSize = 32, exclusionMask?): LayoutResult
layoutTextIntoBuffer(text, fontAtlas, fontSize, buffer, exclusionMask?): void
```

- **ストリーミングメモ化。** `prepare`/`prepareRich` は段落ごとに結果をキャッシュするため、成長するテキスト（例：LLMトークンストリーム）の再準備は新しい段落のみを計測します。
- **リッチテキスト。** `StyledSpan = { text, style?: TextStyle }`；`TextStyle = { fontSize?, color?, bold?, italic?, href? }`。単語内でのスタイル変更はグリフごとに反映されます。`fontSize` は計測幅と行の高さに影響します；残りはノードに運ばれるレンダリングメタデータです（`PreparedGlyph.style` → `LayoutNode.style`）。
- **除外シェイプ（exclusion shapes）。** `computeLineSegments(top, bottom, maxWidth, exclusions: ExclusionRect[]): LineSegment[]` は純粋でテスト可能なコアです：重なる矩形を差し引いた後のライン帯上の自由な `[x0,x1)` 区間です。O(n log n)。`[]` を渡す/省略するとシングルカラムパスとバイト同一になります。

## 主要なレイアウト型

- `GlyphAtlas` — `{ [char]: { width, baseSize, ast } }` 事前計測済みメトリクス。
- `GlyphMeasurer` — `{ measure(char, fontSize): number }`；独自のものを提供するか、`createCanvasMeasurer(fontFamily?, baseSize?)` を使用します（オフスクリーン `measureText`、線形スケール + キャッシュ；DOMなし環境では `null` を返す → エンジンは `0.5em` フォールバックを維持）。
- `PreparedText` → `PreparedParagraph[]` → `PreparedWord[]` → `PreparedGlyph[]`。
- `LayoutResult` — `{ nodes: LayoutNode[], totalWidth, totalHeight, fallbackToCanvas? }`；`LayoutNode` は1つの配置されたグリフです。
- `LayoutResultBuffer` — フラットな型付き配列結果（`xs/ys/ws/hs`、`chars`、`levels`、`count`、`CAPACITY = 16384`）；再利用前に `reset()`、`toLayoutResult()` で具体化。`levels` は各グリフの解決された BiDi 埋め込みレベル（偶数 = LTR、奇数 = RTL）であり、コンシューマはグリフの方向を判断できます。バッファパスは各行を視覚順に並べ替えるためにこれを使用します。グリフは**視覚**順に、共通ベースライン付きで出力され、割り当てパスとグリフごとに一致します。
- `LayoutWorkerManager.getInstance()` — オフスレッドレイアウト用シングルトン；`queueLayout(entityId, text, { fontId, fontSize, maxWidth, maxHeight, callback, ... })` / `cancelLayout(entityId)`。[`MSDFTextEntity`](/reference/core-text/#msdftextentity) によって使用されます。

使用法については [テキスト & タイポグラフィ](/learn/text-typography/) を、このエンジンの出力を消費するフォント/グリフレンダリングレイヤーについては [テキスト & Bidi](/reference/core-text/) を参照してください。

## 関連情報

[テキスト & Bidi](/reference/core-text/) · [`Entity`](/reference/core-entity/) ·
[`@vectojs/core` 概要](/reference/core-api/)
