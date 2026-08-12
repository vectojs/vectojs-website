+++
title = "UI: CodeBlock"
description = "フェンス付きコードのためにMarkdownが使用する単一リーフのcanvasコードブロック。"
weight = 40
+++

# `CodeBlock`

`CodeBlock` は `Markdown` が使用する低レベルのフェンス付きコードレンダラーです。どちらもスタンドアロンの **`@vectojs/markdown`** パッケージにあります（`@vectojs/ui@2.2.0` で `@vectojs/ui` から移動しました）。背景と構文色付きテキストを自身で描画し、トークンごとに1つの子エンティティを持つことを避けます。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · CodeBlock</span></div>
  <iframe src="/sandbox/ui/component.html?name=codeblock&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="CodeBlock live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>これを直接使用するのはカスタムレンダラーの場合のみです。通常のドキュメントは `Markdown` を通すべきです。</figcaption>
</figure>

## 最小限の例

````ts
import { CodeBlock, Markdown } from '@vectojs/markdown';

// Most callers should let Markdown create CodeBlock instances:
const md = new Markdown('```ts\nscene.markDirty();\n```', { maxWidth: 520 });

// Custom Markdown subclasses can return CodeBlock for app-specific fenced blocks.
````

フェンス付きブロックは、Canvasと同じインセットとベースラインから、その正確なソースを個別に配置された視覚行として投影します。したがって、長いソース行がひそかにブラウザ折り返しされて、コピー、find-in-page、ネイティブ選択からずれることはありません。各ハード改行は先行する配置済みの行に属し、Firefoxが投影ルートで選択されたフラグメントを生成するのを防ぎます。デフォルトのスタックは `ui-monospace` で始まり、明示的なカスタムフォントを尊重しながら、デスクトップFirefoxがコードをプロポーショナルなセリフ書体にユーザーフォント置換するのを避けます。Markdownはその `selectable` 設定を伝播します。直接のCodeBlockユーザーは `setSelectable(boolean)` を呼び出せます。

UI 1.9は、構文色付きCanvas描画とセマンティックキャリアの両方に、Core 1.8の保持された準備済みコンテンツグリッドを使用します。したがって、タブ、絵文字/ZWJ、幅広のCJK、アラビア語整形、混在方向のラン、および正確なCR/LF/CRLFのソース境界は1つのプランを共有します。較正はコールドなフォント読み込みパスです。定常状態の投影同期はRangeジオメトリを読んだり、セルキャリアを置き換えたりしません。

## 幅: `setWidth()`

```ts
codeBlock.setWidth(width: number): this
```

ボックスの幅を変更します（`0.9.0+`）。グリッドの再構築もハイライトの再実行も意図的に**行いません**。コードは折り返さないからです: 行は `col × cellWidth` の固定等幅グリッド上に置かれ、長い行は折り返さずにあふれるため、`height` は行**数**だけの関数であり、幅は角丸背景のサイズだけを決めます。

グリフの形状が変わるもの——ソース、言語、フォント——はすべて `setCode()` を経由し、そこでグリッドが無効化されます。幅が変わらない場合は何もせず、`this` を返します。

`Markdown.setMaxWidth()` は自身が所有する各フェンスコードブロックに対してこれを呼ぶため、直接呼ぶ必要があるのは `CodeBlock` を自分で構築する場合だけです。

## オプションと横スクロール

```ts
new CodeBlock(source, language, width, options?: CodeBlockOptions)
// options: { showLanguage?: boolean }  // header band with the language name, default false
codeBlock.showLanguage: boolean
codeBlock.scrollX: number       // current horizontal scroll (clamped to maxScrollX)
codeBlock.maxScrollX: number    // widest line's overflow past the padded box; 0 = everything fits
codeBlock.setScrollX(x: number): this // scroll horizontally, clamped to [0, maxScrollX]
```

長い行は折り返さずにあふれるため、幅の広いブロックは水平スクロールできます。`maxScrollX` はそれを生成したグリッドに対してメモ化されます。`scrollX` は同期されたフレームごとに読み取られるため、キャッシュが長いブロックにフレームごとの O(lines) スキャンを強いるのを防いでいます。

## メンテナー向けチェックリスト

- フェンス付きコードは1つのリーフエンティティに保ちます。
- ライブ更新には `setCode()` を使用します。
- 幅のみの変更には `setWidth()` を使用します。`setCode()` が行うグリッド再構築を省略します。
- コンテンツ投影を正確なソース、フォント、行の高さと同期させ続けます。
- Canvas描画、ポインターキャレット、コピー、findに1つの準備済みグリッドを再利用します。
- 置換されたフォントと変換されたブロックを含め、分数DPR/ズームでChromiumとFirefoxを確認します。
- レンダラー拡張を書いている場合を除き、より高レベルの `Markdown` コンポーネントを推奨します。
