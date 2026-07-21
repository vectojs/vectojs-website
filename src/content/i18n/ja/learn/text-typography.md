---
title: 'Text & Typography'
description: 'VectoJSのテキストシステム：cold/hotのLayoutEngine分割、LLM出力のためのストリーミング、混在スタイルのリッチテキスト、MSDFフォント、アラビア語/BiDi、除外形状。'
order: 14
---

# Text & Typography

VectoJSは、2つの重要なアイデアを中心に構築されたテキストエンジンを備えています：**測定とレイアウトの分離**（リサイズが再測定を避けられるように）、そして**段落レベルでのメモ化**（追加パスが変更されていない先頭の段落を再利用できるように）。

## ライブで試す

<figure class="sandbox">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">ライブ · @vectojs/core</span></div>
  <iframe src="/sandbox/text-streaming.html" class="sandbox-frame" loading="lazy" title="Text streaming interactive example" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption><code>label.append(chunk)</code>が30 msごとに呼ばれます——O(ドキュメント)ではなくO(変更された段落)。Replayをクリックしてストリームを再開します。</figcaption>
</figure>

## 正しいコンポーネントを選ぶ

| シナリオ                                     | 使うもの         |
| -------------------------------------------- | ---------------- |
| 静的または単純な動的テキスト                 | `Text`           |
| 混在スタイル（太字、斜体、リンク、色）       | `RichText`       |
| Markdownドキュメント                         | `Markdown`       |
| 解像度非依存のGPUテキスト（ゲームUI、3D）    | `MSDFTextEntity` |
| 等幅グリッド（ターミナル）                   | `GridTextEntity` |
| ベクターアトラスに支えられたカスタムテキスト | `TextEntity`     |

`Text`、`RichText`、`Markdown`は`@vectojs/ui`にあります。`Entity`ベースのテキストレンダラー（`MSDFTextEntity`、`GridTextEntity`、`TextEntity`）は`@vectojs/core`にあります。それらが構築の土台とする低レベルのシェイピングプリミティブ——BiDi、アラビア語シェイピング、タイポグラフィのメトリクス、MSDFフォントのパース、prepared content grid——はスタンドアロンの`@vectojs/text`パッケージであり、行分割/インラインレイアウトエンジンは`@vectojs/layout`です。どちらも`@vectojs/core`によって再エクスポートされるため、どちらの場所からでもインポートできます。

### 選択可能な固定グリッドテキスト

ターミナル、コードエディター、その他のセルごとのレンダラーは、その論理的なソースをCore 1.8の`prepareContentGrid()`でコンパイルすべきです。返されたセルをCanvas上に描画し、`getContentProjection()`から同じ不変のグリッドを返してください。これにより、2つ目のDOMレイアウトを維持する代わりに、コピー/検索のソース、正当な書記素キャレット、タブ、CJK/絵文字の幅、アラビア語のシェイピング、双方向配置、ブラウザの選択を、1つのジオメトリプラン上に保てます。

`cellWidth`はブラウザが解決したフォントを使ってCanvasを通じて測定し、ソースやフォントメトリクスが変わるたびにグリッドを再構築し、カスタムコンテナやアプリケーションのズームが変わった後は`scene.resize()`を呼んでください。このリサイズは、Firefoxのフォント置換や欠落グリフのRangeメトリクスに対するコールドな較正の境界です。安定したレンダリングは、ジオメトリの読み取りなしに準備されたキャリアを再利用します。

---

## Text

自動折り返し付きの単一行および複数行のテキスト。内部ではコアの`LayoutEngine`を実行します（他のすべてのテキストコンポーネントと同じセグメント化パイプライン）。

```typescript
import { Text } from '@vectojs/ui';

const label = new Text('Hello, world', {
  font: '400 16px Inter', // CSS shorthand
  color: '#e2e8f0',
  maxWidth: 300, // wrap at 300px; omit for no wrapping
  lineHeight: 24, // line advance in px
  preserveLeadingSpaces: false,
});

label.setPosition(40, 40);
scene.add(label);
```

### コールド と ホットの更新

`Text`には、コストが大きく異なる3つの変更メソッドがあります：

```typescript
label.setText('New content'); // EXPENSIVE — cold pass: re-segment + re-measure
label.append(' more tokens'); // EFFICIENT — only the last paragraph is re-measured
label.setMaxWidth(200); // CHEAP — hot pass: re-wrap only, no re-measure
```

テキストをトークンごとにストリーミングするときは、この区別を使ってください：

```typescript
// Wrong — rebuilds the full measured text on every token
for await (const token of stream) {
  label.setText((accumulated += token)); // O(document) per token → slow
}

// Correct — only the changed paragraph is re-measured
for await (const token of stream) {
  label.append(token); // reuses unchanged paragraphs; re-prepares the changed tail
}
```

ユーザーがウィンドウをリサイズしたときは、`setMaxWidth(newWidth)`を呼んでください——キャッシュされた測定済みテキストでリフローするため、すべてのリサイズイベントで呼んでも安全です。

---

## RichText

複数スタイルのインラインテキスト：太字、斜体、色付き、異なるサイズ、リンクされたラン。すべてが共有されたベースライン上で一緒に流れます。

```typescript
import { RichText } from '@vectojs/ui';
import type { StyledSpan } from '@vectojs/core';

const spans: StyledSpan[] = [
  { text: 'Build ' },
  { text: 'fast', style: { bold: true, color: '#00f0ff' } },
  { text: ' UIs with ', style: { italic: true } },
  { text: 'VectoJS', style: { bold: true, href: 'https://vectojs.org/' } },
  { text: '.' },
];

const rich = new RichText(spans, {
  font: '16px Inter',
  color: '#e2e8f0',
  maxWidth: 600,
  linkColor: '#38bdf8',
  onLinkClick: (href) => window.open(href, '_blank'),
});

scene.add(rich.setPosition(40, 40));
```

### `TextStyle`のフィールド

```typescript
interface TextStyle {
  bold?: boolean;
  italic?: boolean;
  color?: string;
  fontSize?: number; // overrides base font size for this run
  href?: string; // makes the run a link
}
```

> [!NOTE] > `bold`と`italic`はレンダリングにのみ影響し、測定される幅には影響しません（太字のストロークはアドバンス幅をわずかに超えて広がります）。`fontSize`は測定される幅と行の高さの両方に**影響する**ため、1行にサイズを混在させても正しく機能します——各行の高さはその最も高いグリフによって決まります。

### ストリーミング `appendSpans()`

`Text.append()`と同様に、`appendSpans()`は変更されていない先頭の段落を再利用します：

```typescript
const rich = new RichText([]);
scene.add(rich);

for await (const token of llmStream) {
  rich.appendSpans([{ text: token, style: { color: '#a5f3fc' } }]);
}
```

### 除外形状（障害物の周りを流れるテキスト）

`exclusions`を渡すと、テキストが矩形の障害物の周りを流れます——CSSのフロートのように：

```typescript
const rich = new RichText(spans, {
  maxWidth: 500,
  exclusions: [
    { x: 0, y: 60, width: 120, height: 120 }, // avoid a 120×120 image at (0, 60)
  ],
});

// Later, update dynamically:
rich.setExclusions([{ x: 0, y: 60, width: 120, height: 120 }]);
```

エンジンは行バンドごとに自由な水平区間（`computeLineSegments`）を計算し、各区間を独立して埋めます。BiDiの並べ替えは、区間配置の後に論理行全体に適用されます。

---

## Markdown

`marked`ライブラリ（GFM風味）を使って、MarkdownをVMTサブツリーへとレンダリングします。

```typescript
import { Markdown } from '@vectojs/markdown';

const md = new Markdown('# Hello\n\nThis is **rich** text.', {
  maxWidth: 700,
  theme: {
    headingColor: '#f8fafc',
    codeColor: '#a5f3fc',
    bodyFont: 'Inter, sans-serif',
  },
});

scene.add(md.setPosition(40, 40));
```

サポートされるトークン：見出し（h1–h6）、段落、キーワードハイライト付きのフェンス付きコードブロック、ブロッククォート、順序付き/順序なしリスト、水平線、インラインのコード/太字/斜体/リンク、そしてGFMテーブル（`Table`コンポーネントを介してレンダリング）。

### ストリーミングMarkdown

LLM出力には、`appendMarkdown()`を使ってください——`setContent(fullText)`をループさせないでください：

```typescript
const md = new Markdown('', { maxWidth: 700 });
scene.add(md);

for await (const token of llmStream) {
  md.appendMarkdown(token);
}
```

`appendMarkdown()`は完全なバッファを再レキシングし、トークンを最後のレンダリングと差分し、変更されていないエンティティの接頭辞を再利用し、最後の段落をインプレースで更新します。視覚ツリーの再構築の作業を節約しますが、Markdownのレキシングは依然としてドキュメント全体に応じてスケールします。`setContent()`はさらに完全な再構築を行うため、ワンショットの置換に使ってください。

---

## LayoutEngineの仕組み

cold/hot分割を理解すると、パフォーマンスのための正しい判断ができるようになります。

### コールドパス——一度だけ測定する

`prepare(text)`と`prepareRich(spans)`は、テキストを段落へとセグメント化し、アラビア語のシェイピングとBiDiを適用し、`Intl.Segmenter`で単語と書記素へとセグメント化し、各グリフのアドバンス幅を測定します。`prepareContentGrid(source, metrics)`は、選択可能な固定グリッドサーフェスに対して対応する一度きりのコンパイルを行います。結果（`PreparedText`または`PreparedContentGrid`）は、そのコンテンツまたはメトリクス入力が変わるまで保持されます。

**これが高コストなステップです。**コンテンツが変わったときにのみ実行してください。

### ホットパス——常に配置する

`layoutPrepared(prepared)`は、キャッシュされた`PreparedText`を取り、折り返し制約（`maxWidth`、`maxHeight`、除外形状）を適用して、配置された`LayoutNode[]`を生成します。これは純粋な算術です——セグメント化なし、測定なし。

`setMaxWidth()`はホットパスのみを実行し、キャッシュされた`PreparedText`を再利用します。だからこそレスポンシブなリフローが安価なのです：リサイズドラッグの1ピクセルごとに、カクつきなく呼ぶことができます。

### 段落レベルのメモ化

キャッシュキーは（プレーンテキストには）`fontSize + paragraphText`、または（リッチテキストには）`fontSize + paragraphText + styleSig`です。多くの段落を持つドキュメントに1トークンを追加するとき：

1. 変更されていない段落は、キャッシュされた準備済みデータを再利用できます。
2. 最後の（変更された）段落のみが再測定されます。

これにより、繰り返しの測定/レイアウト準備が変更された段落に限定されます。長い段落は成長するにつれて依然としてよりコストが高くなり、より高レベルのMarkdownのパースがドキュメント全体の作業を追加する場合があります。

### 両端揃えとハイフネーション

`LayoutEngine`は`textAlign = 'justify'`（折り返された行を`maxWidth`にぴったり合わせて引き伸ばし、最後の行はギザギザ）と折り返し時のハイフネーション（ソフトハイフン`­`はそのまま機能します。自動的な区切りには`hyphenate: (word) => string[]`関数を差し込みます——例：`hyphen` npmパッケージのKnuth–Liangパターン）をサポートします。

`TextEntity`は両方を直接公開します：`text.setTextAlign('justify')`、`text.setHyphenator(fn)`——詳細は[core APIリファレンス](/reference/core-api/#textentity--gridtextentity-from-)を参照してください。これらは、`TextEntity`が各グリフをそれ自身の計算された位置に描画するため、正しくレンダリングされます。`@vectojs/ui`の`Text`/`RichText`コンポーネントは、パフォーマンスのため各折り返し行を単一のネイティブな`fillText()`呼び出しへと折りたたむため、まだグリフごとの両端揃えを尊重しません——両端揃えの本文が必要なときは`TextEntity`に手を伸ばしてください。

---

## MSDFフォント

Multi-channel Signed Distance Fieldフォントは、ラスタライズのアーティファクトなしに、任意のズームレベルでくっきりとしたテキストをレンダリングします。ゲームスタイルのUI、ズームされたインターフェース、高DPRディスプレイに使ってください。

### アトラスの生成

`msdf-atlas-gen`をインストールして実行します：

```bash
msdf-atlas-gen -font myfont.ttf -type msdf -format png -imageout atlas.png -json atlas.json
```

これは`atlas.png`（グリフテクスチャ）と`atlas.json`（グリフメトリクス、アドバンス幅、UV境界）を生成します。

### VectoJSでの読み込み

```typescript
import { MSDFFont, MSDFTextEntity } from '@vectojs/core/text';

// Parse the JSON
const fontData = await fetch('/fonts/atlas.json').then((r) => r.json());
const font = MSDFFont.parse(fontData);

// Load the texture image
const img = new window.Image();
img.src = '/fonts/atlas.png';
await new Promise((r) => (img.onload = r));

// Create the text entity
const msdfText = new MSDFTextEntity('Hello GPU text', {
  font,
  texture: img, // TexImageSource
  fontSize: 48,
  color: '#ffffff',
  letterSpacing: 0,
  fallbackFont: 'sans-serif', // used when pointBackend is not 'webgl'
});

scene.add(msdfText.setPosition(40, 40));
```

`MSDFTextEntity`は、レイアウトをバックグラウンドの`LayoutWorkerManager`ワーカーへとオフロードします（デバウンスされ、`Float32Array`転送を介したゼロコピー）。テキストは、構築または`setText()`の1非同期ティック後に表示されます。シーンに`pointBackend: 'webgl'`が設定されていると、グリフはWebGL MSDFプログラムを介して描画されます。そうでなければ、エンティティはネイティブな`fillText`にフォールバックします。

### `MSDFFont.layout()`を直接使う

カスタムレンダラーを構築している、またはグリフのクワッドを自分で必要とする場合：

```typescript
const result = font.layout('Hello', 48);
// result.glyphs: PositionedGlyph[]
// Each glyph: { char, x, y, w, h, u0, v0, u1, v1 }

for (const g of result.glyphs) {
  renderer.setMSDFTexture(texture, font.distanceRange);
  renderer.addGlyph(g.x, g.y, g.w, g.h, g.u0, g.v0, g.u1, g.v1, '#fff');
}
```

---

## アラビア語と双方向テキスト

アラビア語と双方向テキストは、`prepare()`と`prepareRich()`の内部で**自動的に**処理されます。シェイピングAPIを自分で呼ぶ必要はありません。

### 内部で起こること

1. **アラビア語シェイピング**（`ArabicShaper.shapeArabic`）：アラビア文字を、その文脈的な表示形（語頭/語中/語末/独立）で置換し、Lam-Alef合字を適用します。`indexMap`は、キャレットのhit-testingのために、シェイプ後→ソースのインデックスを追跡します。

2. **BiDiレベル割り当て**（`BidiResolver.resolveLevels`）：UAX#9のルールを使って、各文字にネストレベル（0 = LTR、1 = RTL、より高い = より深い埋め込み）を割り当てます。埋め込み制御（LRE/RLE/PDF）が尊重されます。

3. **視覚的並べ替え**（`BidiResolver.reorderVisual`）：各行の終わりで、最も高いレベルから1まで降順にランを反転し、正しい視覚的な単語順を生成します。

これは、アラビア語やヘブライ語のコンテンツを持つ`Text`や`RichText`がそのまま機能することを意味します：

```typescript
const arabic = new Text('مرحبا بك في VectoJS', { font: '20px sans-serif', color: '#f8fafc' });
const hebrew = new RichText([{ text: 'שלום ' }, { text: 'VectoJS', style: { bold: true } }]);
```

> [!NOTE]
> 改行（`\n`）は、常にアラビア語のシェイピングコンテキストとBiDi状態をリセットします。同じ段落内でソフト折り返しされた行は1つのシェイピングパスを共有するため、複数行のアラビア語段落は折り返しをまたいで正しくシェイプされます。

---

## ヘルパー関数

`measureText`、`wrapLines`、`fontSizePx`は、カスタムコンポーネントで使うため`@vectojs/ui`からエクスポートされています。

```typescript
import { measureText, wrapLines, fontSizePx } from '@vectojs/ui';

// Rendered pixel width, LRU-cached (cap 1000)
const w = measureText('Hello world', '600 16px Inter');

// Greedy word-wrap — returns string[]
const lines = wrapLines('A longer text that wraps', '16px sans-serif', 200);

// Extract the px size from a CSS font shorthand
const size = fontSizePx('600 16px Inter'); // → 16
```

`measureText`は測定の前に`ArabicShaper`を介してアラビア語テキストをシェイプするため、アラビア語のランに対して正しい視覚的な幅を返します。

---

## パフォーマンスガイド

| シナリオ                                         | 最適なアプローチ                                           |
| ------------------------------------------------ | ---------------------------------------------------------- |
| 静的テキスト、一度だけ設定                       | `new Text(content, opts)` — 1回のコールドパス              |
| 追加のみのストリーミング（LLM）                  | `text.append(token)`または`md.appendMarkdown(token)`       |
| レスポンシブなリサイズ                           | `text.setMaxWidth(newW)` — ホットパスのみ                  |
| 密で繰り返されるレイアウト（例：データグリッド） | `layoutPreparedIntoBuffer()`で`LayoutResultBuffer`を再利用 |
| 解像度非依存のテキスト                           | `MSDFTextEntity` + `pointBackend: 'webgl'`                 |
| アラビア語 / ヘブライ語 / RTL                    | 任意の`Text`/`RichText`/`Markdown` — 自動                  |
| 画像の周りを流れるテキスト                       | `RichText` + `exclusions: ExclusionRect[]`                 |

選択可能なテキストは、常に元の論理的なUnicodeソースを投影します。CanvasのシェイピングとBiDiの並べ替えはピクセルにのみ影響します。コピー、ページ内検索、ブラウザ翻訳、支援技術は、呼び出し側のソース順を保持します。ソフト折り返しの区切りと明示的な改行は、それに先行する視覚行に付けられるため、複数行選択のジオメトリはレンダリングされた行バンド内に留まります。

## トラブルシューティング

### テキストが幅広すぎる、または間違った位置に表示される

`measureText`と`LayoutEngine`は両方とも、正確なCSSフォント文字列でキャンバスの`measureText`呼び出しを使います。フォントファミリーがまだ読み込まれていない場合（例：ウェブフォント）、ブラウザは異なるメトリクスを持つフォールバックフォントで置き換えるため、レイアウトとレンダリングの間に不一致が生じます。

`Text`や`RichText`を構築する前に、ウェブフォントが読み込まれていることを確認してください：

```typescript
await document.fonts.ready;
const label = new Text('Hello', { font: '16px Inter' });
```

### 長いドキュメントで`append()`が期待より遅い

`append()`は**段落レベル**（`\n`で分割）でメモ化します。ドキュメント全体が改行のない1つの長い段落である場合、`append()`呼び出しのたびに段落全体を再測定します。

ストリーミングコンテンツでは、キャッシュがそれらを分割できるよう、各段落の後に改行を挿入してください：

```typescript
md.appendMarkdown(chunk);
// If the LLM output naturally has paragraphs, the memoization works automatically.
// If it is one endless run-on sentence, performance degrades to O(document).
```

### `MSDFTextEntity`のテキストが最初のフレームで欠落している

`MSDFTextEntity`は、`LayoutWorkerManager`を介してテキストをスレッド外で配置します。結果は、構築または`setText()`の1非同期ティック後に到着します。これは設計によるものです——エンティティはレイアウトコールバックが発火したときに`scene.markDirty()`を呼び、再描画をトリガーします。

`renderMode: 'onDemand'`を使う場合、この再描画は正しく起こります。テキストが同期的に表示される必要がある場合（例：スクリーンショットテスト）、`scene.start()`の後の次の`rAF`を待ってください。

### RichTextの除外が適用されない

除外形状は`layoutPrepared()`でのみ機能し、`layoutPreparedIntoBuffer()`では機能しません。再利用可能なバッファのパスを使う場合、除外は無視されます。除外のサポートには`layoutPrepared()`を使ってください。

> **次へ：** [Accessibility](/learn/accessibility/) — シャドウDOMがどのようにあなたのキャンバスUIをスクリーンリーダー対応かつエージェント駆動可能にするか。
