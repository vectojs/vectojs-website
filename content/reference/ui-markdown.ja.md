+++
title = "Markdown"
description = "リッチテキスト、コードブロック、テーブル、ストリーミング追加、リンクコールバックを備えたcanvas-nativeなMarkdownレンダラー — スタンドアロンの @vectojs/markdown パッケージ。"
weight = 14

[extra]
order = 14
+++

# `Markdown` — `@vectojs/markdown`

`Markdown` と `CodeBlock` はスタンドアロンの **`@vectojs/markdown`** パッケージにあります（`@vectojs/ui@2.2.0` 以降、これらはもはや `@vectojs/ui` の一部ではないため、`marked` + `@vectojs/tex` の依存はMarkdownをレンダリングするときにのみ読み込まれます）。これは `@vectojs/ui` のコンポーネントを組み合わせて構築されているため、`@vectojs/ui` と `@vectojs/core` とともにインストールしてください：`bun add @vectojs/markdown @vectojs/ui @vectojs/core`。

`Markdown` は `marked` でMarkdownを解析し、結果をVectoJSのエンティティサブツリーにレンダリングします。段落と見出しは `RichText` になり、フェンス付きコードは `CodeBlock` になり、GFMテーブルは `Table` になります。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Markdown</span></div>
  <iframe src="/sandbox/ui/markdown.html?v=core-1.34.0-ui-2.15.1" class="sandbox-frame component-demo-frame component-demo-frame-xl" loading="eager" title="Markdown live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>このサンプルは、プロース、リンク、インラインコード、フェンス付きブロックを1つの集中したビューポートに保つため、レイアウトの欠陥が見えるようになっています。</figcaption>
</figure>

## 最小限の例

```ts
import { Markdown } from '@vectojs/markdown';

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
  userTiming?: boolean; // emit a `vecto:markdown:parse` measure, default false
}
```

`selectable` は現在および将来の見出し、プロース、リスト、フェンス付きコード、テーブルセルに伝播します。`markdown.setSelectable(false)` で実行時に変更します。ブラウザがドラッグ選択、Ctrl/Command+C、find-in-pageを所有します。VMTエンティティは依然としてレイアウトとピクセルを所有します。順序付きおよび順序なしのリスト項目は選択可能な `RichText` を使用します。すべてのGFMテーブルセルは1つの選択可能な投影を所有します。論理的なソース順序とハード/ソフトのセパレーターは、ネストされたMarkdown出力をまたいで無傷のまま保たれます。Core 1.8は変換されたプロースを2次元のキャレットジオメトリを通じてルーティングし、フェンス付きコードを共有の準備済みグリッドを通じてルーティングするため、リスト、GFMテーブル、折り返されたアラビア語/RTLテキスト、およびコードは、分数DPRとズームで論理的なコピー順序を保持します。アプリケーションがコンテナのサイズ設定またはCSSズームを所有する場合、`scene.resize(width, height)` でSceneに通知して、FirefoxがネイティブのRangeメトリクスを再較正できるようにします。

## レスポンシブな幅: `setMaxWidth()`

```ts
markdown.setMaxWidth(width: number): this
```

すでにレンダリング済みのすべてのブロックを新しい幅で折り返し直します（`0.9.0+`）。リサイズ時には `maxWidth` への代入ではなくこちらを呼んでください。代入はフィールドを設定するだけで見た目は何も変わりません: 幅は各ブロックが**構築される**ときに読まれるため、代入では既存のブロックが古い幅で測られたままになります。

```ts
window.addEventListener('resize', () => {
  scene.resize(window.innerWidth, window.innerHeight);
  markdown.setMaxWidth(window.innerWidth - INSET * 2);
});
```

再構築ではなくその場での再フローであり、それがストリーミング中に使える理由です:

- 同じブロックエンティティの**インスタンス**が生き残るので、その参照を保持しているもの（スクロールアンカー、ヒットターゲット、devtools の選択）はそのまま動き続けます;
- 開いている [`createStream()`](#ストリーミング) のライターは影響を受けず、追記を続けます;
- 字句解析はやり直されません。

5 ブロックのドキュメントで両エンジンで実測: 520 → 260 px で投影行数が 2 → 4、高さが 88 → 160 になり、同じ 2 つの段落インスタンス上で、ライターは `open` のまま、字句解析器に渡された文字数の増加は**ゼロ**でした。

幅が変わらない場合は何もしないので、高さだけのリサイズにコストはかからず、呼び出し側がガードを書く必要もありません。負の幅は 0 にクランプされます。

> [!NOTE]
> `0.9.0` より前は、唯一正しい回避策は完全な再構築でした——ストリームを解放し、開示済みのソースを `setContent()` で再生し、新しいライターを開き、スクロール位置を手作業で引き継ぐ。これはドキュメントを正しく再現するため、そのまま残りやすかったのです: 再構築でも正しいジオメトリは得られます。その代償が、リサイズごとのドキュメント全体の再字句解析と、すべてのエンティティインスタンスでした。

ディスプレイ数式は意図的に自身の幅のままにしてあります: `@vectojs/tex` は組版ボックスのサイズを利用可能な幅ではなく `ex` 基準のメトリクスから決めるため、引き伸ばすと数式が歪みます。フェンスコードも折り返し直されません——コードは固定の等幅グリッドを持ち、長い行は設計どおりあふれます——サイズが変わるのは背景だけです。

[`onStable`](#ワンショット完了-onstable) コールバックから呼ぶと、`setContent()` と同じ理由で例外を投げます: そのコールバックは、それが無効化しようとしているコミットの内部で走っているからです。

## GFM カバレッジ

段落、見出し、リスト、フェンス付きコード、テーブル以外に：

| 構成要素            | レンダリング結果                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `~~strikethrough~~` | 打ち消し線付きのテキスト — 合体したラン1つにつき1本の線、線幅は字号に比例（`0.8.0+`）                        |
| `- [ ]` / `- [x]`   | ☐ または ☑ の字形に空白1つを加えたものが箇条点を置き換える。順序付きの場合は `1.` の後にその字形（`0.8.0+`） |
| `\|:--\|--:\|:-:\|` | 列の揃え。`Table.align` に転送される（`0.8.0+`）                                                             |
| `$…$` / ` ```math ` | `@vectojs/tex` で組版された数式（インライン / ブロック）。デリミタが閉じられて初めて変換される               |

## フロントマター（Front matter）

先頭にある `---` で区切られた YAML ブロックはコンテンツではなくメタデータです（`0.8.0+`）：

```ts
const md = new Markdown('---\ntitle: Release notes\ndate: 2026-08-03\n---\n# Body');

md.frontMatter; // 'title: Release notes\ndate: 2026-08-03\n'
md.frontMatterFields; // { title: 'Release notes', date: '2026-08-03' }
```

`0.8.0` より前は、このブロックはコンテンツとしてレンダリングされていました：`marked` にはフロントマターという概念がないため、開始の `---` が水平線のルールに合致し、終了の `---` は**それらのキーを setext 見出しとして下線付けしていました**。そのため、メタデータを持つドキュメントは水平線と、自身のキーからなる 28px の太字見出しを描画していました。

`frontMatterFields` は YAML ではなく限定的な便宜機能です — インデントされた行はスキップされるため、ネストされたマッピングやシーケンスがトップレベルのキーとして漏れ出すことはありません（親キーは値が空の状態で存在します）。より高度な処理が必要な場合は、`md.frontMatter` を本物のパーサーに渡してください。`scanFrontMatter(text, complete)` と `parseFrontMatterFields(raw)` はどちらも、生のテキストに対して使えるようエクスポートされています。

認識は意図的に保守的です。誤検出はドキュメントの先頭を黙って削除してしまうからです。先頭の `---` がフロントマターとなるのは、次の行が YAML のマッピングエントリ（`key: value`、YAML が要求するとおりコロンの後に空白がある）であり、**かつ**終了の `---` または `...` が続く場合のみです。したがって `---\n\n# Title`、`---\n# Title\n---`、`----\nkey: v\n----`、`---\n- a\n---` はいずれも水平線としてレンダリングされ続けます。

ストリーミング中、閉じられていないブロックの内部に着地したチャンクは字句解析されずに保留されます。そうすることで、ドキュメントが水平線を描画してから終了デリミタでそれを取り壊す必要がなくなります。ストリームが閉じられた時点でまだ開いているブロックはコンテンツとして解放され、保留には上限があるため、長いドキュメントの先頭にある水平線がそれを停滞させることはありません。

## ストリーミング

`createStream()` はこの `Markdown` にフレーム単位で合体するライターを1つ束縛します。
ソースを消費しながら `write()` を await してください。`close()` は次のアニメーション
フレームを待たずに末尾を強制コミットします：

```ts
const stream = markdown.createStream();

try {
  for await (const token of llmStream) {
    await stream.write(token);
  }
  await stream.close();
} catch (error) {
  stream.abort(error);
  throw error;
}
```

```ts
interface StreamControllerOptions {
  maxBufferedChars?: number; // default 64 * 1024 UTF-16 code units
  pacing?: {
    graphemesPerSecond: number;
  };
  signal?: AbortSignal;
  incompleteMode?: IncompleteMarkdownMode; // default 'literal'
  onStable?: (blocks: readonly Entity[]) => void;
}

type IncompleteMarkdownMode = 'literal' | 'optimistic';

type StreamControllerState = 'open' | 'closed' | 'aborted';

interface StreamController {
  readonly state: StreamControllerState;
  readonly bufferedChars: number; // accepted + one blocked write
  write(chunk: string): Promise<void>;
  flush(): void;
  close(): Promise<void>;
  abort(reason?: unknown): void;
  destroy(): void;
}
```

デフォルトモードは、次の rAF より前に受理されたすべてのチャンクを1回の解析/レイアウト
コミットにまとめます。`write()` は可視化ではなく、有界バッファへの受理で解決します。
容量が不足している場合、1つの write が待機します。その待機者が存在する間の別の write は
拒否されるため、バックプレッシャーを無視するプロデューサーがキューを無限に伸ばすことは
できません。

`pacing.graphemesPerSecond` は、1フレーム1コミットの上限を保ちながら、実時間で固定の
タイプライター的ペーシングを加えます。`Intl.Segmenter` は通常の結合シーケンス、絵文字の
ZWJ クラスタ、旗、サロゲートペアをチャンク/フレーム境界をまたいで一体に保ちます。
完全なライフサイクル、有界の病的クラスタのフォールバック、ボトムフォローのパターン、
トランスクリプト戦略は[ストリーミング＆リアルタイムテキスト](/learn/streaming/)にあります。

### 末尾の未完の構文: `incompleteMode`

ストリームは常にトークンの途中でカットされるため、チャンクの最後の数文字が未完の構成要素になることは日常茶飯事です。`incompleteMode` は、コントローラーが開いている間にその末尾がどのようにレンダリングされるかを選択します：

| モード                     | `a **bo` をストリーミング中                                      |
| -------------------------- | ---------------------------------------------------------------- |
| `'literal'` _(デフォルト)_ | テキスト `a **bo` — アスタリスクは通常のテキストとして扱われます |
| `'optimistic'`             | テキスト `a bo` で、`bo` は太字 — 構文は隠されます               |

`'optimistic'` は、末尾の段落の最後に閉じられていない strong/emphasis/inline-code/link 構成要素が閉じられると推測します。この推測は**表示のみ**であり、トークンの状態が変更されることは決してありません。また、`close()` 時に元に戻されるため、同じソースの `'literal'` ストリームと `'optimistic'` ストリームは、バイト単位で同一のドキュメントで終了します。`'literal'` は、このオプションが導入される前のすべてのリリースで出荷されていたものです。

モードはコントローラーではなく `Markdown` によって解釈されます：コントローラーはバッファリングとペース配分を所有し、この推測は末尾の段落に対するレンダリング時の変換です。

### ワンショット完了: `onStable`

```ts
const stream = markdown.createStream({
  onStable: (blocks) => {
    // 完了したドキュメントとともに1回だけ実行されます。
    // ストリームの途中で無駄になるような作業を安全に行える場所です。
    console.log(`settled with ${blocks.length} top-level blocks`);
  },
});
```

これは**正確に1回**、`close()` が最終テキストをコミットし、_かつ_ 進行中のワーカーによる解析が適用された後に、その瞬間のドキュメントのトップレベルブロックエンティティのスナップショットとともに発火します。`incompleteMode` には依存しないため、デフォルトの `'literal'` でも機能します。

これは意図的に、一般的な「ストリームの進行」フックではありません：

- **`flush()`、`abort()`、または `destroy()` によって発火することはありません。** これらのいずれもコンテンツの変更が完了したことを意味しません。
- コールバック内から `appendMarkdown()` または `setContent()` を呼び出すと**同期的にスロー**されます — リエントラントな変更は、渡されたばかりのスナップショットを無効にします。
- コールバックからのスローは `close()` プロミスを拒否します。いずれにせよコントローラーは解放されます。

ストリーム後の一度きりの作業 — ハイライトキャッシュの焼き込み、登場アニメーションの
開始 — を意図しています。まだ変化しそうなコンテンツに対してストリーム途中で実行すべき
ではない類の処理です。

1つの `Markdown` に対して開けるコントローラーは1つだけです。`setContent()` は置換前に
それを中止し、`destroy()` は中止した上で rAF/`AbortSignal` のリスナーを取り除きます。
終端状態のコントローラーは登録解除されます。公開 API の `appendMarkdown()` は同期的な
ままです。まず以前に提出されたすべてのコントローラーのチャンクをフラッシュし、その後に
直接のチャンクを正確な呼び出し順で適用します。

トークンごとに `setContent(fullDocumentSoFar)` を呼び出すことは避けてください。
それはサブツリー全体を再構築します。

## パフォーマンスモデル

各呼び出しの実際のコストを理解することで、ストリーミングコードを合理的に分析できます：

- **デフォルトで解析はオフスレッドです。** `appendMarkdown` は蓄積されたソースを、埋め込まれたバンドルから構築された `Worker` にポストします（ネットワークリクエストなし）。パースが戻ったときに、トークンの差分とエンティティの更新が適用されます。`Worker` がない環境（一部のテストランナー、SSR）は同期字句解析にフォールバックします — 同じ結果、メインスレッドのコストがかかります。
- **字句解析はチャンク単位ではなくドキュメント単位で O(ドキュメント) です。** 呼び出しごとに蓄積されたソース全体が再トークン化されます。`createStream()` を使ってフレームごとにバッチ処理し、長いトランスクリプトをメッセージごとに1つの `Markdown` エンティティに分割して、ライブドキュメントを小さく保ちます。
- **完了したブロックは再利用され、再構築されません。** `appendMarkdown` は新しいトークンリストを古いものと生ソースでプレフィックスマッチします。既にレンダリングされたすべてのブロックはそのエンティティインスタンスを保持します。一般的なストリーミングケース — 最後の段落が成長した — は、その段落のスパンをその場で更新します。
- **`setContent()` は何も再利用しません。** すべての子を削除し、トークンリスト全体を再レンダリングします。これはドキュメントを_置き換える_場合は正しい呼び出しであり、_成長させる_場合は誤った呼び出しです。

## 拡張ポイント

`renderToken(token)` は protected なので、カスタムレンダラーは `Markdown` をサブクラス化してアプリ固有のブロックに対応しつつ、通常のトークンは組み込みレンダラーに委譲できます。

## メンテナー向けチェックリスト

- リンクコールバックは段落、見出し、リストの `RichText` ノードに転送する必要があります。
- コードブロックはトークンや行セグメントごとに1エンティティではなく、単一のリーフエンティティに保つべきです。
- フェンス付きコードは、その正確なソーステキストと改行を投影する必要があります。
- テーブルヘッダーは見出しの色/太字スタイルを使用し、各論理セルは正確に1つのコンテンツ投影を所有します。
- ポインターの所有権はリーフのテキスト/コード投影に留まります。構造的なリストおよびテーブルエンティティはネイティブの選択を傍受してはなりません。
- ストリーミング追加は、変更されていないプレフィックスエンティティを再利用すべきです。

関連情報: [`RichText`](/reference/ui-components/#richtext)、[`CodeBlock`](/reference/ui-components/#codeblock)、[`Table`](/reference/ui-components/#table)。
