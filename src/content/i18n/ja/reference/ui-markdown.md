---
title: 'Markdown'
description: 'リッチテキスト、コードブロック、テーブル、ストリーミング追加、リンクコールバックを備えたcanvas-nativeなMarkdownレンダラー。'
order: 14
---

# `Markdown`

`Markdown` は `marked` でMarkdownを解析し、結果をVectoJSのエンティティサブツリーにレンダリングします。段落と見出しは `RichText` になり、フェンス付きコードは `CodeBlock` になり、GFMテーブルは `Table` になります。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Markdown</span></div>
  <iframe src="/sandbox/ui/markdown.html?v=core-1.9.0-ui-1.9.1" class="sandbox-frame component-demo-frame component-demo-frame-xl" loading="eager" title="Markdown live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>このサンプルは、プロース、リンク、インラインコード、フェンス付きブロックを1つの集中したビューポートに保つため、レイアウトの欠陥が見えるようになっています。</figcaption>
</figure>

## 最小限の例

```ts
import { Markdown } from '@vectojs/ui';

const md = new Markdown(source, {
  maxWidth: 640,
  selectable: true,
  onLinkClick(href) {
    router.open(href);
  },
});

scene.add(md.setPosition(24, 24));
```

## コンストラクタ

```ts
new Markdown(markdownText: string, opts?: MarkdownOptions)

interface MarkdownOptions {
  maxWidth?: number;
  theme?: MarkdownTheme;
  onLinkClick?: (href: string) => void;
  selectable?: boolean; // default true
}
```

`selectable` は現在および将来の見出し、プロース、リスト、フェンス付きコード、テーブルセルに伝播します。`markdown.setSelectable(false)` で実行時に変更します。ブラウザがドラッグ選択、Ctrl/Command+C、find-in-pageを所有します。VMTエンティティは依然としてレイアウトとピクセルを所有します。順序付きおよび順序なしのリスト項目は選択可能な `RichText` を使用します。すべてのGFMテーブルセルは1つの選択可能な投影を所有します。論理的なソース順序とハード/ソフトのセパレーターは、ネストされたMarkdown出力をまたいで無傷のまま保たれます。Core 1.8は変換されたプロースを2次元のキャレットジオメトリを通じてルーティングし、フェンス付きコードを共有の準備済みグリッドを通じてルーティングするため、リスト、GFMテーブル、折り返されたアラビア語/RTLテキスト、およびコードは、分数DPRとズームで論理的なコピー順序を保持します。アプリケーションがコンテナのサイズ設定またはCSSズームを所有する場合、`scene.resize(width, height)` でSceneに通知して、FirefoxがネイティブのRangeメトリクスを再較正できるようにします。

## ストリーミング

トークンストリームの場合、新しいデルタのみを追加します：

```ts
for await (const token of llmStream) {
  markdown.appendMarkdown(token);
  scrollView.scrollToBottom();
}
```

トークンごとに `setContent(fullDocumentSoFar)` を呼び出すことは避けてください。それはサブツリー全体を再構築します。

## 拡張ポイント

`renderToken(token)` は protected であるため、カスタムレンダラーは通常のトークンを組み込みレンダラーに委任しながら、アプリケーション固有のブロックのために `Markdown` をサブクラス化できます。

## メンテナー向けチェックリスト

- リンクコールバックは段落、見出し、リストの `RichText` ノードに転送する必要があります。
- コードブロックはトークンや行セグメントごとに1エンティティではなく、単一のリーフエンティティに保つべきです。
- フェンス付きコードは、その正確なソーステキストと改行を投影する必要があります。
- テーブルヘッダーは見出しの色/太字スタイルを使用し、各論理セルは正確に1つのコンテンツ投影を所有します。
- ポインターの所有権はリーフのテキスト/コード投影に留まります。構造的なリストおよびテーブルエンティティはネイティブの選択を傍受してはなりません。
- ストリーミング追加は、変更されていないプレフィックスエンティティを再利用すべきです。

関連情報: [`RichText`](/reference/ui-components/#richtext)、[`CodeBlock`](/reference/ui-components/#codeblock)、[`Table`](/reference/ui-components/#table)。
