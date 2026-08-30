---
title: '04 — ストリーミング Markdown — インクリメンタルなリコンサイル'
description: 'なぜ任意のプレフィックスが不完全な構文になりうるのか、committed-prefix レクサー、ワーカー差分プロトコル、インプレースミューテーターを伴う token→entity リコンサイル、O(C·N²) と wrapper-instanceof の罠、そして安全に新しい拡張を追加する方法。'
order: 24
---

# 04 — ストリーミング Markdown — インクリメンタルなリコンサイル

LLM ストリームは **append-only** で **トークン粒度**（チャンクあたり約 4 文字）です。VectoJS はすべてのチャンクの後に読みやすいドキュメントを表示しなければなりません — `close()` まで空白は許されません。明白な戦略 — 蓄積されたソース全体を毎回再 lex し entity ツリーを再構築する — はチャンクあたり `O(document)`、したがってストリーム全体では `O(N²)` です。この章は、それを `O(unstable tail)` にする仕組みと、各半分が静かに機能しなかった罠を説明します。

## なぜ任意のプレフィックスが不完全な構文なのか

`marked` は **ワンショット** レクサーです。ソース全体が存在することを前提としています。ターミネータがまだ到着していないすべての Markdown 構造は、到着するとプレフィックスの意味を変更します。

| 画面上のプレフィックス          | 今はどうなっていますか                                               | 次のチャンクで何ができるか                                                                                                               |
| ------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `## Heading` (末尾の `\n` なし) | `heading(depth:2)`                                                   | 先頭の `#` がまだ実行中の場合は `heading(depth:1)` (`#` → `##`) — 行が終了するまで深さは安定しません                                     |
| `**bold`                        | `text("**bold")` + リテラル `**`                                     | `strong("bold")` 終了の `**` が到着すると                                                                                                |
| `[label](https://ex`            | `text("[label](https://ex")` + 自動リンクされた裸の URL              | `link(label → https://example.com)` — URL はまだ完全な href ですらない                                                                   |
| ` ```js\nconst a=1 `            | `code(lang:js, text:"const a=1")` フェンスが閉じられていない         | まだ `code` ですが、フェンスは ` ```math ` になり、表示数学としてタイプセットされる場合もあります。                                      |
| `\| a \| b \|\n\| --- \| ---`   | `table(header:[a,b], rows:[])` — 区切り文字行、本体行はゼロ          | `table(rows:[[…]])` — `marked` は、部分的な行を **空のセル**の完全な行として実体化し、一度に 1 つずつ埋めます                            |
| `$$\nx`                         | `paragraph("$$\\nx")` (拡張子はマークされた段落入力をクリップします) | `$$` が閉じると `blockMath("x")` — さらに、マークされた `start()` クリップは、前の 2 つの `paragraph` トークンを**遡ってマージ**できます |

ストリーミング対応のレイヤーがなければ、これらの反転はすべて、レンダリングされたエンティティの分解になるでしょう。この層には 2 つの部分 (lex と reconcile) があり、欠陥はそれらの継ぎ目に存在していました。

## アーキテクチャ — lex · transfer · reconcile

```text
chunk ──► consumeFrontMatter ──► dispatchAppend ──► MarkdownWorker (off-thread)
                │                        │                    │
                │ rawMarkdown            │ postMessage         │ incrementalLex
                │ (body only)            │ {append,expectedLen}│ lexAppend / lexFull
                │                        │  or {text,oldRaws}  │ findStableCut + verify
                │                        │                    │
                ◄────── matchLen + tail ─┘                    │
                              │                               │
                     updateTokens(matchLen, tail)  ◄──────────┘
                              │
              ┌───────────────┼───────────────────┐
              │ prefix [0,matchLen) kept          │  entitiesReused++
              │ tail: reuse / rebuild / mutate    │  inPlaceUpdates vs entitiesRebuilt
              └───────────────┼───────────────────┘
                              │
                    content Stack + width/height republish
                              │
                    Scene.markDirty() + notifyLayoutUpdated()
```

3 つのモジュールが 3 つのフェーズを所有します。

- **Lex** — `packages/markdown/src/incrementalLex.ts:446` `lexFull` / `packages/markdown/src/incrementalLex.ts:477` `lexAppend` と `MarkdownWorker.ts:230` `self.onmessage`。キャッシュは `IncrementalLexCache` (`incrementalLex.ts:207`): `source`、`tail = source.slice(stableOffset)`、`tokens`、`stableCount`、`stableOffset`、`degraded` です。
- **転送** — `Markdown.ts:2244` `dispatchAppend` および `MarkdownWorker.ts:345` の差分。定常状態では `{append, expectedLength}` (デルタ) が送信されます。 first/resync/recovery は `{text, oldRaws}` (フル) を送信します。ワーカー diff は `matchLen` を計算し、`tail = tokens.slice(matchLen)` を返します。
- **調整** — `Markdown.ts:3674` `updateTokens(oldTokens → newTokens, knownMatchLen)`。 `tokenChildPrefix` (`Markdown.ts:1030`、`Markdown.ts:1041` で `setTokens` によって増分的に維持される) を介してトークン インデックスを子スロットにマップし、トークンごとに 3 つのパス: **未処理の再利用**、**インプレース変更** (`setSpans`/`setCode`/`appendRows`)、または **破壊 + 再構築**。

前付は字句解析 (`frontMatter.ts:94` `scanFrontMatter`、`Markdown.ts:1116` `initSource` / `Markdown.ts:1157` `consumeFrontMatter`) の **前に** 取り除かれるため、ワーカーはそれを意識しません。`workerSourceLen` と `expectedLength` は本文テキストへのオフセットのみに残ります。未解決のオープナーは `MAX_PENDING_CHARS = 4096` (`frontMatter.ts:62`) まで保留され、ストリームの `onClose` **前** `waitForAppendSettled` (`Markdown.ts:1409`) から `finalizeFrontMatter()` によって解放されます。

### 旧パスがしていたこと

`incrementalLex` より前は、`MarkdownWorker` は `{source, raws, version}` (`MarkdownWorker.ts:213` の古い形状) を保持し、デルタを追加してから、**全体** 蓄積されたソースを字句解析しました。 `99.5%` の raw プレフィックス マッチは lex の_後_ に実行されたため、エンティティの再構築は節約されましたが、lexing は決して節約できませんでした。線形パーサーは増大するプレフィックスに対して `N` 回呼び出しました。 `postMessage` はトークン ツリー全体を再送信しました。両方の半分はチャンクあたり `O(document)` でした。 § Numbers のベンチマークでは、修正が行われる前に引用可能になっていました。

## インクリメンタル lex — committed-prefix の考え方

`marked` にはインクリメンタル API がありません。この修正により、**安定したブロック境界** (その前ではトークン リストが変更されなくなる文字オフセット) が追跡され、その後のテキストのみが再レククスされます。

### stable-cut ルール

`findStableCut` (`incrementalLex.ts:331`) は、*その後に少なくとも 1 つのトークン**を持つ `space` トークンを逆方向にスキャンし、隣接する 2 つの `paragraph` トークンの最初のトークンを決して通過せず、解決された場合にのみ実行します。

- プッシュされた `space` は常に **実際の空白行** を意味します。単独の `\n` は、前のトークンの `raw` (`incrementalLex.ts:36`) にマージされます。
- すべての組み込みルールでは、ソースの終わりに隣接するトークンのみが引き続き変更できます。 `nFollow >= 1` フォームはブルート フォースでスイープされました。すべての先行タイプ (`blockquote`、`code`、`heading`、`hr`、`html`、`list`、`paragraph`、`table`) では安全ですが、`nFollow == 0` は `code`/`list`/`paragraph` では失敗します。 (`incrementalLex.ts:39`)。
- **`list` には 2 トークンのラグが必要です。** `'- a\n\n- b\n'` は、空白行の数に関係なく 1 つの `list` です。同じマーカーは常にマージされます。 `cutIsSettled` (`incrementalLex.ts:314`) では、前の `list` を介したカットが行われる前に、`space` 自体が決済された後のトークンが必要です。
- **`blockMath` 前方到達範囲** は、トークナイザーの空白行によって制限されます: `(?:(?!\n[ \t]*\n)[\s\S])+?` (`Markdown.ts:294`、`MarkdownWorker.ts:122`)。以前の `(?!\n\n)` では空白のみの行は保護されていませんでした。`'$$\nx\n   \n$$\n'` は依然として 1 つの `blockMath` (`incrementalLex.ts:67`) でした。
- **`blockMath` 後方リーチ** は `paragraphPairCap` (`incrementalLex.ts:289`): マークされた `startBlock` クリップは **2 つの隣接する** `paragraph` トークンのみを融合でき、安定したカットは常に `space` の後に終了するため、ペアが境界をまたぐことはできません。古い治療法 (行頭 `$$` で機能を低下させる) は十分でしたが、決して必要ではありませんでした。 `139×` の上限まで絞り込みます (§ 数値を参照)。
- **リンク参照、`:::` コンテナ、`[^label]:` 脚注** は完全に劣化します (`DegradeReason` で `incrementalLex.ts:225`): `def` は以前のインライン トークンを遡及的に書き換えます (`incrementalLex.ts:122`)、コンテナ フェンスと脚注継続スキャナ (`markdown-footnote.ts` `consumeContinuation`) は無制限の前方到達範囲を持ちます。 Degrade は正確さを保ちます。非タイリング アドバンス (`incrementalLex.ts:360` での `advanceTiles`) を拒否すると、代わりに 1 チャンクのウィンドウ増加が発生します。

すべての進歩は **検証されます** (`advanceTiles`、`incrementalLex.ts:360`): `source.slice` は、それをカバーするトークンの連結された `raw` と等しくなければなりません。裸のリスト マーカー `'- a\n- '` で終わるソースは、生の `'- a\n-\n'` に変換されます。`raw` タイル ソースという仮定は通常は当てはまりますが、常に当てはまらない (`incrementalLex.ts:130`) ため、未検証の進歩は劣化するのではなく拒否されます。

### コストモデル

- `tail = prev.tail + append` — `tail` のみをスキャンすると、`O(document)` (`incrementalLex.ts:490`) ではなく `O(window)` のチェックが維持されます。
- `charsLexed` (`incrementalLex.ts:248`) は、実際に `marked.lexer()` に渡された文字を報告します。これは、境界によって保存された内容の直接的な測定値です。 `reusedTokens` は、キャッシュから取得された主要なトークンを報告します。
- 単純な `sourceCharsLexed` 合計自体が、応答ごとの `matchLen` 生データ (ストリーム上の `O(n²)`) を再合計していました (#657)。現在、`IncrementalLexCache.stableOffset` は lex から出荷され、`O(1)` (`Markdown.ts:989`、`Markdown.ts:2289`) が追加されています。

### ホットパス内の拡張 — なぜ PX-0524 が重要なのか

各 `marked` 拡張機能は、`start()` スキャン + トークナイザーを登録します。インクリメンタル パスはそれを分類する必要があります (「拡張機能の追加」を参照)。 そうしないと、`sourceCharsLexed` がドキュメントの長さに逆戻りします。これは、このインスタンスが劣化した `getDevtoolsDescriptor` の `Parser cost` グループ (`Markdown.ts:2112`) の信号です。

## ワーカープロトコル — なぜ transfer も重要なのか

`O(N²)` 用語は再字句化だけではありませんでした。 `postMessage` **構造化クローン** は、その引数をメインスレッド上で同期的に作成します。 lex がウィンドウ化された後でも、チャンクごとにドキュメント全体を再送信すると、`O(document)` が転送されました。チャンクサイズの投稿 (`Markdown.ts:1017`) のフラット `~2 µs` に対して、8 KB の `4 µs` から 512 KB の `220 µs` まで測定されました。

この修正により、`workerInstanceId` + `tokenVersion` (`Markdown.ts:1008`) をキーとしたワーカー内のトークン生 ** とソース (`MarkdownWorker.ts:213` `rawCache`) の両方がキャッシュされます。 `tokenVersion` がすべての `setTokens` (`Markdown.ts:1043`) にバンプしないと、追加が続く `setContent` は古い raw との差分になります。

- **デルタ** — `append` + `expectedLength` (`Markdown.ts:2345`)。ワーカーは `cached.lex.source` を `append` で拡張し、`cached.lex.source.length + append.length === expectedLength` (`MarkdownWorker.ts:308`) (1 つの整数、文字列は機能しません) をチェックして、`lexAppend` を実行します。
- **完全** — `text` + `oldRaws` (`Markdown.ts:2355`)、最初のリクエストの場合、`setContent`、同期フォールバック、または `needResync`。ワーカーは、分岐したソースを解析するのではなく、1 つの再同期 (`MarkdownWorker.ts:294`、`299`、`334`) を要求します。間違った `matchLen` は、呼び出し元の `updateTokens` を破損します。

`matchLen` は、呼び出し元が比較する**同じ**以前のリストから計算されます。ワーカーが lex の `reusedTokens` を再利用すると、スキャンは `reusedTokens` (`MarkdownWorker.ts:385`) — `O(window)`; から開始されます。 0 からのスキャンに戻ると、再び `O(document)` になります。エビクションは最も古いエントリのドロップによって制限されます (`MarkdownWorker.ts:228` の `RAW_CACHE_MAX = 256`)。

呼び出し元はディスパッチ時に `this.tokens` と `this.tokenVersion` のスナップショットを作成し (`Markdown.ts:2252`)、`appendInFlight` が true の間 (`Markdown.ts:2220`) に合体します。 `dispatchedAt` タイムスタンプは `streamStats.workerMs / workerMsMax` (`Markdown.ts:2273`) にフィードされます。その最悪の値はドロップ フレーム信号です。

## リコンサイル — token ツリー → entity ツリー、変わっていないものを再構築せずに

### committed-prefix の考え方 — 直感

ドキュメントを `stableOffset` で分割された 2 つの領域と考えてください。

```text
[████████████ stable █████████████████] [ unstable tail ]
 |  already committed — never re-lexed  |  may still change |
 |  raw-equal, entity-reused            |  this chunk's work |
```

**末尾のみ**に追加されたテキストは、安定したプレフィックスに影響を与えることはありません。これは、`findStableCut` が総当たりで獲得する不変条件です。末尾は `O(window)` であり、空行間の距離と開いたコンテナーによって境界が定められています。そのため、チャンクごとの作業はドキュメントの長さではなく、開いた領域に応じて調整されます。

### DevTools — ライブで観察する

**CODE** (**CODE**) は、上記の引用文のストリーミング カウンターを明らかにします。

- `Streaming` — `appends` / `workerResponses` / `workerMsAvg` / `workerMsMax` (ドロップされたフレームは `avg` ではなく `max` です)。
- `Delta shape` — `stablePrefixChars` / `changedTailChars` 比率 (1 に近い場合は再利用性が高いことを意味します) および `entitiesReused` / `entitiesRebuilt` / `inPlaceUpdates` (高速パス)。
- `Incremental reuse` — `tokensPrefixMatched` / `tokensReturned` / `tokenPrefixReuseRatio`。
- `Parser cost` — `lexerMs` / `sourceCharsLexed`。 `sourceCharsLexed` がドキュメントの長さを追跡すると、このインスタンスは劣化しました。

### トークンから子スロットへのマッピング

すべてのブロック トークンがエンティティをレンダリングするわけではありません (`space`、非 SVG `html`、コメントのようなトークンは `null` をレンダリングします)。 `producesEntity` (`Markdown.ts:4044`) は述語です。 `tokenChildPrefix` は、`setTokens(validFrom)` (`Markdown.ts:1041`) によって変更されたサフィックスに対してのみ再構築されたプレフィックスの合計です。 `updateTokens` の場合:

1. `matchLen` — 生の等しいプレフィックス長を導出します。ワーカーが `knownMatchLen` を指定した場合、それは盲目的に信頼される (`Markdown.ts:3689`) のではなく検証されます (`0 ≤ knownMatchLen ≤ minLen`)。
2. `abbreviations` が変更された場合 (`collectAbbreviations` の `Markdown.ts:3711` `mapsEqual`)、`matchLen` を `0` にキャップします。`raw` (`markdown-abbr.ts` は `hasLinkDefinitions` と同様) が変更されていないにもかかわらず、遅い `*[TERM]: …` は前の段落のインライン トークンに影響を与える可能性があります。
3. `matchLen === oldTokens.length - 1` と型が一致する場合 (`Markdown.ts:3760` `lastTokenSameType`)、**インプレース** 高速パスを試行します。それ以外の場合は、サフィックスの破棄と再構築が行われます。

注: `updateTokens` の破棄ループは **at** `matchLen` で開始します。以前は `i >= matchLen` ガードを使用して `0` から移動しており、プレフィックスが完全に再利用されている場合でも (`Markdown.ts:3956`)、チャンクごとに `O(total blocks)` になります。

### インプレースミューテーター — 伸びる末尾のケース

ストリーミング リアリティは**末尾が伸びる追加のみ**です。 7 つのミューテーターは、ストリームが実際に生成するテールの形状をカバーします。

| テールトークン                    | ミューテーター                                                                            | ファイル:行                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `paragraph` (画像なし)            | `RichText.setSpans(literalSpans)`                                                         | `Markdown.ts:3833`                                             |
| `paragraph` (画像付き)            | **CODE** の **CODE**: **CODE** を介して末尾の **CODE** を拡張しました                     | `Markdown.ts:3846` `updateImageParagraph` (`Markdown.ts:3085`) |
| `code` (閉じられていないフェンス) | `CodeBlock.setCode(text, lang)`                                                           | `Markdown.ts:3796`                                             |
| `heading`                         | `RichText.setSpans(headingSpans)` デプスガード付き                                        | `Markdown.ts:3875`                                             |
| `blockquote`                      | `innerStack` 末尾ラッパーに下り、その単一の子を書き換えます                               | `Markdown.ts:3900` `updateBlockquoteTail` (`Markdown.ts:3306`) |
| `list`                            | 最後に保持された項目 **CODE**、**CODE** の新しい項目を書き換えます                        | `Markdown.ts:3914` `updateStreamedList` (`Markdown.ts:2987`)   |
| `table`                           | 最後に保持された行のセルの場合は `RichText.setSpans`、新しい行の場合は `Table.appendRows` | `Markdown.ts:3932` `updateStreamedTable` (`Markdown.ts:3203`)  |

すべての末尾再同期は、完全な `Stack.layout()` (`Markdown.ts:3843`、`3859`、`3886`、`3904`、`3945`) ではなく、`resizeLastChild` (`Stack.ts` 高速パス) — `O(1)` — です。属性 arm `reflowToken` (`Markdown.ts:1520`) は、`setMaxWidth` の非ストリーミング対応物です。`renderToken` と arm 対 arm で保持されるため、幅の変更も再構築する必要がありません。

`renderToken` (`Markdown.ts:4150`) は建設現場です。 `producesEntity` と `reflowToken` は、追加するアーム全体で **3 方向ロックステップ** を維持する必要があります。他の 2 つのアームが存在しない新しいアームは、3 つの呼び出しサイトのうちの 1 つについてはサイレント バグです。

### Markdown ブロックのレイアウト

ブロック ジオメトリは `LayoutEngine` (`packages/layout/src/LayoutEngine.ts:808`) によって駆動されます。 `RichText` は、垂直 `Stack` ギャップ `theme.blockGap` を介して `availableWidth` (`Markdown.ts:4158`) でラップします。 blockquote と `:::` コンテナは、`quoteIndent`/`containerIndent` によって `innerStack` をインデントし、結果の `Stack` 高さ (`Markdown.ts:3403`、`Markdown.ts:4402`) から `QuoteBorder`/`ContainerBackground` をハングします。アフォーダンス ボタンの `measureText` はドキュメント フォント (`blockAffordances.ts:379`) を使用するため、コントロールはペイントされる前にサイズが調整されます。 `LayoutEngine.prepareRich` は `RichText` の改行です。そのメモは幅ではなく内容に基づいてキー設定されているため、`setMaxWidth` は再測定ではなく形状によって再ラップします。`reflowToken` が存在するのと同じ理由です。

### スクロールと選択のフック

非仮想化 `Markdown` は、`ScrollView` (`packages/ui/src/ScrollView.ts:219` スプリング ドライバー) の通常の子です。ホストは、`content.y` を設定することでスクロールし、再レイアウトによってブロックが画像の下に移動するときに `notifyLayoutUpdated` (`Markdown.ts:2643`) を呼び出します。 `virtualize` がオンの場合、`Markdown.setVisibleRange` (`Markdown.ts:1265`) がスクロール ドライバーになります。画面外の高さは、切り離されたエンティティとしてではなく、`RowHeights` 内に存在します。選択は `RichText` スパン内に存在します。 `updateTokens` プレフィックス再利用は、確定したラインの `InlineObject` キャリア (image/math `OBJECT_REPLACEMENT`) をコンポジター パスの外側に保持しますが、成長するテールの `setSpans` は、ライン ジオメトリを再構築せずにその内部の選択を保持します。

## O(C·N²) の罠と wrapper-instanceof バグ

### O(C·N²) — テストが生成しなかった形状

`table` トークンは **すべての行** を保持します。 `list` トークンは **すべての項目** を保持します。 `blockquote` は **すべての内部ブロック** を運びます。単純な調整により、すべてのチャンクがすべて再構築されました。

- `N` 項目のリスト、項目ごとにストリーミング: `1 + 2 + … + N = Θ(N²)` `RichText` 構造 — 32 項目のリスト (`Markdown.ts:3908` コメント) について、`32` に対して `528` を測定しました。
- `N` 行、`C` 列のテーブル: `Θ(C·N²)` セルの構成 **プラス** `Table.layout()` をすべてのセルで `fitCell` を再実行します (先頭に `2×`)。

集計トランスクリプト ベンチでは、`mixed` が後続の散文チャンクごとに到着したばかりのリスト全体を再構築しており、単一構造の形状 (`benchmarks/markdown-transcript/corpus.ts`) には認識されていないことが明らかになりました。

### wrapper-instanceof の見逃し — なぜストリーミングが opt-in フラグでリグレッションしたのか

`blockAffordances: true` は、コードとテーブルを `BlockWithAffordances` (`blockAffordances.ts:433`) でラップします。 `UIComponent` は、ブロックとそのコピー/ダウンロードの `BlockAffordanceButton` の子を所有し、ブロックからサイズを設定し (`blockAffordances.ts:457`)、`role: group` (`blockAffordances.ts:488`) としてプロジェクトします。ラッパーは DOM の順序 = タブの順序を修正し、`Stack`/`Table` からのレイアウトの盗用を回避します。

ストリーミング高速パスは `existingEntity instanceof Table` / `instanceof CodeBlock` を直接テストしました。ラッパーをオンにすると、これらのテストは**常に false を返す**ため、すべてのチャンクで完全な再構築が行われました。

修正前の影響を受けるサイト: `updateTokens` (`Markdown.ts:3781`、`Markdown.ts:3209`)、`updateBlockquoteTail` テール抽出 (`Markdown.ts:3348`)、`reflowToken` `code`/`table` アーム (`Markdown.ts:1557`、`Markdown.ts:1651`)、`updateStreamedTable` (`Markdown.ts:3212`)。パターンは次のとおりです。

```ts
const target = entity instanceof BlockWithAffordances ? entity.block : entity;
if (!(target instanceof Table)) return false;
// … and after a width/content change:
if (entity instanceof BlockWithAffordances) entity.refreshAffordances();
```

`#789` / `#795` (`vectojs` の問題) がこのバグです。 `code-review-2026-08.md:167` はクラスタ化されているため、すべてのサイトをまとめて記録します。

### なぜスナップショットテストが見逃したのか

マークダウン スイートは、`setContent` ベースのスナップショットによって占められています。 `setContent` **常にリビルド** (`Markdown.ts:1740`): `tokenVersion` をリセットし、子をクリアし、`renderMarkdown` を呼び出します。ストリーミング調整パス (`updateTokens` + `inPlaceUpdates`/`entitiesRebuilt`/`tokenChildPrefix` + ラッパーのラップ解除) を**実行することはありません**。したがって、再利用パスを中断するだけの拡張機能またはオプションは、すべてのスナップショットに合格し、トークン粒度の `appendMarkdown` でのみ失敗しました。 `setContent` を引き起こし、再利用を保護すると主張した `1/11` 妨害行為が標準的な例 (`forge/findings/text-richtext-and-markdown.md:552`) です。

ゲート ルール: ストリーミングの変更には **ストリーミング等価性妨害** が含まれている必要があります。つまり、すべてのプレフィックス (`incrementalLex.test.ts` パターン) での `marked.lexer()` に対する深い `toEqual` と、調整のための `appendMarkdown` 粒度を使用して、一度に 1 文字ずつコーパスをストリーミングします。

### PX-0524 拡張の爆発 — インクリメンタルでも無料ではないとき

構文カバレッジ (脚注、コンテナ、絵文字、略語、ins/mark、上付き文字 — `markdown-footnote.ts` `FOOTNOTE_EXTENSIONS`、`markdown-container.ts` `CONTAINER_EXTENSIONS`、`markdown-emoji.ts` `EMOJI_EXTENSIONS`、`markdown-abbr.ts` `ABBR_EXTENSIONS`、`markdown-ins-mark.ts`、`markdown-superscript.ts`) を追加すると、`2` 拡張機能から共有 `marked` インスタンスが取得されました。 `faeeb0b7` から `12` 、`2a4bd52` まで。それぞれは、`marked` が **ブロックごとおよびインライン スパンごと**に参照する `start()`/`tokenizer` のペアです。したがって、`incrementalLex` が `O(tail)` に lex をウィンドウ処理しても、チャンクあたりのコストは `O(tail × extensions)` になります。 § Numbers の `1.67×` 解析上昇は、このクラスターのチャンクごとの価格であり、出荷時には測定されませんでした。 `markdown-math.ts:258` `blockMath`/`inlineMath` は、すでに支払われている 2 つです。残りの 10 はステップ変更です。教訓: 拡張機能を追加する場合は、`markdown-transcript` および `stream-markdown-smd` パリティ ゲートを再実行する必要があります。増分による定数係数の勝利は、拡張機能数による定数係数の損失によって犠牲になる可能性があります。

### 破棄と遅れて届くラスター

他の 2 つのライフサイクル フックはストリーミングと競合します。 `Markdown.destroy()` (`Markdown.ts:1938`) は、クロージャを介して `this` を固定するすべての `workerCallbacks` エントリを削除します。これがなければ、中間ストリームの破棄により、ワーカーが応答するまでサブツリー全体が生きたままになります。 `isDestroyed` は `mathLoadPending` の継続 (`Markdown.ts:1952`) をゲートするため、破棄されたツリーが切り離されたサブツリーに再レンダリングされません。

インライン画像と数学には独自のポストストリーム修正があります。段落画像の `Markdown.ts:2562` の `onLoad` は、`naturalWidth`/`naturalHeight` から再測定され、`reflowAfterImageResize` (`Markdown.ts:2604`) を呼び出します。これにより、ラッパー ボックスがボトムアップで再導出されます (`Markdown.ts:2674` の `resyncWrapperBox`)。ベアの `content.layout()` は、古い親キャッシュ (`Markdown.ts:2591` コメント) を再読み取りします。見出しまたは表のセル内のインライン画像は、同じ方法でサイズ変更することはできません。そのボックスは `LayoutEngine` の行に焼き付けられます。代わりに、`subscribeInlineImageRemeasure` (`Markdown.ts:1819`) は、`inlineImageBoxesStale` (`Markdown.ts:1855`) が非正方形デコードを報告したときに再タイプセットしますが、URL ごとに 1 回だけです (`Markdown.ts:1894` での `inlineImagesMeasured`)。数学も同様です。`ensureMathJax` (`Markdown.ts:3518`) は 1 つの `preloadMathJax` Promise に同時ロードを結合し、`retypesetFromTokens` (`Markdown.ts:3551`) はすでに字句解析されたトークンから大規模に再構築します。これは、`tokenChildPrefix` を簡単に正しく保つ唯一のパスです。

## 5 方向の緊張 — 設計はすべてを同時に満たさなければならない

| 力                     | それが要求するもの                                                                                                                                                                 | どこに住んでいるのか                                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **正確さ**             | `lexFull(source)` とストリーミング アペンドは、すべてのプレフィックス長において `marked.lexer(source)` と **完全に同一**です。 `updateTokens` の結果は `setContent` の結果と等しい | `incrementalLex.test.ts` char-at-a-time ファズ、`markdownWorkerProtocol.test.ts` の差分ゲートが **ツリーの等価性**に強化されました                                              |
| **漸進性**             | チャンクごとの作業は `O(document)` ではなく `O(window)` (不安定なテール) です — 無制限のテールの増加は回帰です                                                                     | `stableOffset` / `charsLexed` / `changedTailChars` カウンター。 `sourceCharsLexed` はドキュメントの長さではなく、ペイロードの共有を追跡する必要があります                       |
| **選択の安定性**       | 追加では、固定された画面上のブロック内の選択を移動したり破壊したりしてはなりません                                                                                                 | `tokenChildPrefix` + `matchLen` プレフィックス エンティティの再利用。 `updateTokens` は接頭辞の子には決して触れません (`Markdown.ts:3956`)                                      |
| **レイアウトの安定性** | オフスクリーン ブロックは、すでにペイントされているオンスクリーン ブロックのレイアウトを途中でシフトしてはなりません。                                                             | `rawMarkdown` の `finalizeFrontMatter` 縮小はありません (プロトコル要件)。 `resizeLastChild` 末尾のみの再同期。古い親ボックスを再読み取りする画像サイズ変更リフローはありません |
| **パフォーマンス**     | 増分勝利後のチャンクごとのレンダリング/レイアウト作業はフレーム バジェット内に収まります                                                                                           | § 数値 — 合計の `~5%` を調整します。 `61%` のレンダリングと `33%` の解析が優勢です                                                                                              |

他のものを助けるために一方を違反するという繰り返しのパターンです。「明らかな」前の問題修正 (lex を実行してから削除) は `rawMarkdown` を縮小し、ワーカー プロトコルの `expectedLength` を破壊します。ラッパーを再同期せずに `content` のみから再レイアウトするイメージ修正により、古い親ボックス (`Markdown.ts:2595` `reflowAfterImageResize`) が残ります。

## StreamController — ペーシング、バックプレッシャー、そして close の所有者

`Markdown.appendMarkdown(chunk)` は生の追加です。 `Markdown.createStream(opts)` (`Markdown.ts:1384`) は、これを `StreamController` (`StreamController.ts:129`) でラップします。これにより、生のパスにはない 3 つのものが追加されます。すべてオプション、すべて表示専用、文字のドロップが許可されるものはありません。

- **フレーム結合。** ペーシングがないと、各 `write()` がワーカーに送信され、調整がスケジュールされます。コントローラーは `requestAnimationFrame` ティック (`StreamController.ts:351` `schedule` / `onFrame`) にバッチ処理します。最も単純な呼び出し元は `pacing` オプションを使用せず、RAF バッチ処理のみを使用します。これは一般的な ChatGPT スタイルの SSE ケースです。
- **書記素ペーシング。** `pacing: { graphemesPerSecond }` (`StreamController.ts:22`) は、`Intl.Segmenter` 書記素カウントを使用して `commitPaced` (`StreamController.ts:378`) を介して内部 `chunks` キューを排出します。そのため、タイプライター効果は 1 つの UTF-16 コード単位ではなく、ティックごとに 1 つの書記素クラスターを進めます (絵文字はそのまま残ります)。
- **バックプレッシャー** `maxBufferedChars` (`StreamController.ts:29`、デフォルト `64 KiB`) はキューを制限します。満杯時の `write()` バックプレッシャー (`StreamController.ts:183` `canAdmit` / `blocked`)。これはフロー制御であり、増分的正確さではありません。境界付きバッファーによってドキュメントが切り捨てられることはありません。

ライフサイクルは `createStream → write* → close() → onStable` です。 `createStream` は、`virtualize` がオンになっている場合 (`Markdown.ts:1385`)、またはストリームがすでに存在している場合 (`Markdown.ts:1388`) にスローされます。インスタンスあたり最大 1 つのコントローラーです。 `updateTokens` の単一スロット `appendInFlight` + `appendPending` の合体はそれを前提としています。 `close()` は、保留中のチャンクを同期的にコミットし (`StreamController.ts:244` `commitAllSubmitted`)、状態を `closed` に切り替えて、`finalizeFrontMatter` および `waitForAppendSettled` (`Markdown.ts:1413` — 最後のワーカーの応答 + 任意の `mathLoadPending` `preloadMathJax`) を実行するホストの `onClose` フック (`Markdown.ts:1404`) を待ちます。 + `fencedRebuildPending`)。その場合にのみ、`onStable` が `Array.from(content.children)` で起動 (`Markdown.ts:1419`) されます。これは、ライブ参照 (`incompleteMode.test.ts:313`) ではなく、スナップショットです。 `onStable` は `appendMarkdown`/`setContent`/`setMaxWidth` (`Markdown.ts:3669` `assertNotInStableCallback`) を呼び出してはなりません。ハイライト キャッシュのベイクなどの 1 回限りの作業のために、完成したドキュメントが渡されます。

## 楽観的な不完全構文 — 末尾での推測

`**bo` で終わるストリーミングされたプレフィックスは、生の `**` ではなく、すぐに **太字** を表示する必要があります。 `StreamControllerOptions.incompleteMode` (`StreamController.ts:43`) はこれを制御します。 `Markdown.streamIncompleteMode` (`Markdown.ts:853`) はポリシーを保持しますが、`StreamController` はバッファリングのみを所有します。

- `'literal'` (デフォルト) — このオプションが出荷される前のすべてのリリースでの内容: 閉じられていない構文は `marked.lexer` のプレーン テキストとしてレンダリングされるため、クローザーが到着するまで `**bo` は `**bo` のままになります。
- `'optimistic'` — `optimisticParagraphSpans` (`Markdown.ts:3415`) は、**末尾**段落の**最後のインライン トークン**のみをスキャンします (閉じられた構造はすでに独自の `strong`/`em`/`codespan`/`link` トークンであるため、最後のプレーンテキストの実行のみがオープナーを保持できます)。 `findUnclosedInline` (`markdown-inline.ts:546`) は 3 つの構文を優先的にチェックします。バックティック (完全に勝ちます。コード スパン内では他に構文はありません)、強調 `*`/`_` (`\*{1,2}(?!\*)` 全体マーカーと非スペース ガード。`_` は `markdown-inline.ts:570` で `snake_case` を除外します)、および `[label](url` (`markdown-inline.ts:581`)。推測は、推測された書式設定 (`Markdown.ts:3484` の `optimisticStyle`) で実行されるレンダリングを実行し、それを `optimisticTail` (`Markdown.ts:866`) で追跡します。結合された追加では、推測された段落が後続しないままになる可能性があります。`dropStaleOptimisticTail` (`Markdown.ts:3611`) は、`close()` を待つのではなく、すぐにそれを巻き戻します。 `close()` では、残りの推測がリテラル スパン (`Markdown.ts:3574` `unwindOptimisticTail`) に巻き戻されるため、`literal` ストリームと `optimistic` ストリームは同じように終了します。数学 (`$…$`) は推測されません。その `InlineObject` (`markdown-inline.ts:301`) は、スパン スタイルではなく、`exToPx` (`markdown-math.ts`) 経由で `width/height/depth` を予約します。

## 仮想化 vs ストリーミング — 相互排他はポリシー選択ではない

`virtualize` (`Markdown.ts:760`) は、ホストの `setVisibleRange` によって駆動される `virtualTokens`/`virtualHeights` (`RowHeights`) および `reconcileVirtual` (`Markdown.ts:1340`) を介してトップレベル ブロックをエンティティとしてウィンドウ表示します (`ScrollView` はこれを自動的に行います)。ストリーミングと組み合わせることは**できません** (`Markdown.ts:1385`、`Markdown.ts:2187` は両方ともスロー): オフスクリーン ブロックのエンティティは存在しないため、`updateTokens` の `tokenChildPrefix` + `matchLen` プレフィックスの再利用は、マウントされていない子スロットをアドレス指定することになります。

`tableViewportHeight` (`Markdown.ts:771`) はエスケープ ハッチです。これは、`Table.appendRows` + `reconcileVirtualRows` (`Table.ts:334`) および `bodyClip` 固定を介して **各テーブル内の行** を仮想化し、`updateStreamedTable` は既に遅延マウントされている同じ `appendRows` を介して行を追加するため、ストリーミング中にも機能します。巨大な静的ドキュメントの場合は `virtualize` を選択します。幅の広いテーブルが大半を占めるストリーミング ドキュメントの場合は、`tableViewportHeight` を選択してください。

### 段落形状の罠 — なぜ `producesEntity` が単なる最適化ではないのか

`producesEntity` による `paragraphHasImage` (`Markdown.ts:3807` ガード) による `text → image` の決定は、速度ではなく正確さです。これがないと、最初の画像を取得した段落は `RichText` を保持し、画像は静かに削除されます (`collectSpans` は `image` トークンに対して何も発行しません)。リスト項目の類似物は `itemIsInlineOnly` (`Markdown.ts:2759`) です。`INLINE_ITEM_TOKENS` (`Markdown.ts:2738`) から `checkbox` をスローすると、すべてのタスク項目がブロック パスを強制的に通過し、タスク リストのレンダリングが中断されます。ホワイトリストは、将来のブロック タイプが `RichText` にフラット化されるのを防ぐものです。

## 計測された数値 — ベースラインとともに引用する

`benchmarks/run-browsers.sh` 番号 (実際の Chrome/Firefox、実際の GPU、`calibrateRefreshRate()`、`hyprland-browser-bench` スキルごとの専用 Hyprland ワークスペース) のみが引用可能です。ヘッドレス `script/benchmark.ts` および `benchmarks/debug-page.ts` はトリップワイヤ/デバッグです。

### リコンサイルの勝利 — 集約トランスクリプト（`markdown-transcript-aggregate-2026-07-30`、CTX-0148、PR #296、commit `0e4a4233`）

ワークロード: `6` ターン、`176` ブロック、`27,882` 文字、`6,543` チャンク、**`token` 粒度** — 粒度が支配的: `token` での同じドキュメントの `151` 対 `14` チャンク、`token` 対 `48`-char、`7×` の再利用の違い (`markdown-transcript-aggregate-2026-07-30.md:111`)。腕ごとに 2 回の実行。 `lastTokenSameType` のみが反転しました。

|                        | 再利用不可 | 今日      | デルタ     |
| ---------------------- | ---------- | --------- | ---------- |
| 和解せよ、クロム       | 1635.2 ms  | 319.5 ms  | **−80.5%** |
| 和解、Firefox          | 992.2 ms   | 245.0 ms  | **−75.3%** |
| レンダリング、クローム | 3626.8 ms  | 3393.7 ms | −6.4%      |
| 解析、Chrome           | 1978.3 ms  | 1826.2 ms | −7.7%      |
| 合計、クロム           | 7240.4 ms  | 5539.4 ms | **−23.5%** |
| 合計、Firefox          | 6334.1 ms  | 5404.3 ms | **−14.7%** |

**出荷時のフェーズシェア** (出荷合計 `5539 ms` Chrome / `5404 ms` Firefox、チャンクごとの `0.86 / 0.82 ms`): レンダリング `61.3 / 61.4%`、解析 `32.9 / 34.1%`、**リコンサイル `5.8 / 4.6%`** — リコンサイルは **最小** フェーズになりました。タイプごとの残りの再利用ヘッドルームは、その上限によって制限されます。

### パネルレート再実行（2026-08-08、`2a4bd52`、Firefox はパネル Hz に）

| エンジン | Hz              | 解析する    | 和解する  | 与える      | 合計        |
| -------- | --------------- | ----------- | --------- | ----------- | ----------- |
| クロム   | 240.09 / 239.95 | 2826 / 2830 | 459 / 456 | 3386 / 3388 | 6670 / 6674 |
| Firefox  | 229.01 / 241.26 | 3190 / 3282 | 311 / 315 | 3581 / 3691 | 7082 / 7288 |

チャンクごとに `4.16 ms` フレームの `0.517 / 0.556 ms` = `12.4 / 13.3%` をレンダリングします。チャンクごとの合計 `1.02 / 1.10 ms` = `24.5 / 26.4%`。元の実行時の `≈60 Hz` Firefox の図 (`58.75 Hz`) は、フォーカスされていないウィンドウのアーティファクトでは**ありません**。`layout.frame_rate = -1` (`forge/findings/devtools-and-telemetry.md:2026-08-03`) でした。

**実際の回帰が表面化しました:** 両方のエンジンで `1.67×` を解析しました。同じ `6543` チャンク コーパスを裸の `marked` と共有 12 拡張インスタンス: `1871 → 3127 ms` (`1.671×`) に対してレクシングします。コストは、チャンクごと、拡張子 `start()`/`tokenizer` ごとです。 `faeeb0b7` では、インスタンスは `2` 拡張機能を持ちました。 `2a4bd52` では、`12`、**PX-0524 クラスターの未測定価格** が表示されます。解析共有は `6543`__ に移動されました。 `incrementalLex` の図は、lex がすでにウィンドウ化された後のものです。これがなければ、さらに悪いことになります。

### インクリメンタル lex の勝利 — プローズフィクスチャ（`comparisons/stream-markdown-smd`、Chrome 150 / Firefox 153、784 チャンク）

変更前: チャンクごとの完全な再レックス、`419.6 / 440.2 ms`、指数 `1.98`、レクサー `9,847,040` に渡される文字。後: `6.02 / 9.06 ms`、**`69.8× / 48.6×`**、指数 `0.94 / 1.21`、文字 `63,806`、指数 `1.00` (`forge/findings/text-richtext-and-markdown.md:2026-08-03`)。

### cap 縮小後の数式ストリーミング（`markdown-stream-math`、vectojs#398）

ブランケット `blockMath` の劣化 → キャップのみ: `26,760` 文字、`200` セクションの数学ドキュメントの **`139.3× Chrome / 96.5× Firefox`**。レクサー `215.9×` の削減対象の文字。境界はドキュメントの `99.84%` に落ち着きます。各サイズの最大単一チャンク lex `105` 文字 (`forge/baselines/markdown-stream-math-findings.md`)。

## ストリーミングをリグレッションさせずに新しい Markdown 拡張を追加する

拡張機能は 2 つの登録です (`Markdown.ts:240` と `MarkdownWorker.ts:95` - 同じ `marked.use` 呼び出し、**両側**、同じトークナイザー - ドリフトによりワーカーの `marked` のビューが壊れます)。 4 つのチェックを順番に行います。

### 1. 拡張のリーチを分類する

- **`start()` がなく、空白行で囲まれている** → 安全です。境界変更なし。例: インライン ルール (`abbr` `markdown-abbr.ts`、`emoji` `markdown-emoji.ts`、`footnote` ref `markdown-footnote.ts` 半分) はデグレードする必要はありません。
- **`start()`** を供給 → 後方リーチ; `paragraphPairCap` はすでにキャップされていますが、**確認してください** — クリップは `blockMath` (`incrementalLex.ts:103`) ではなく、クリップにマークされているため、新しい `start()` はすべてカバーされます。
- **空白行にまたがる** → 前方向の無制限のリーチ。 `hasContainerOpener` / `hasFootnoteDefOpener` パターン (`markdown-container.ts: hasContainerOpener`、`markdown-footnote.ts: hasFootnoteDefOpener`)。 `DegradeReason` (`incrementalLex.ts:225`) による **劣化** — カット天井で制限することはできません。
- **遅延定義を収集** (`marked` `def` パターン、`abbrDef` は、`Markdown.ts:3711` で `abbreviationsChanged` を強制的に `matchLen` をゼロにする狭いケースです) → リビルドまたはデグレードを強制します。その理由を文書化します。

不確実な場合は、**劣化**します。これは常に正しく、実際にオープナーを含むドキュメントをストリーミングするだけの費用がかかります。

### 2. 足並みを揃えて登録し、ガードを検証する

- `Markdown.ts:294` と `MarkdownWorker.ts:122` の同一の `blockMath` トークナイザー コピーは、すでに一度ドリフトしており (`[\s\S]+?` 対空行ガード)、ワーカーは `scripts/build-worker.js` → `MarkdownWorkerSource.ts` を介して生成されます。共有モジュールが 3 回目にドリフトした場合は、共有モジュールを抽出します (`markdown-stream-math-findings.md: Also fixed`)。
- 空白行で保護されたトークナイザーの場合、ガードは `(?!\n\n)` (`incrementalLex.ts:67`、#398) ではなく、`(?!\n[ \t]*\n)` (空白のみの行を含む) である必要があります。

### 3. すべての entity 対応箇所に教える

トークン タイプについては、拡張機能で次のものが追加されます。

- `renderToken` — 構築 (`Markdown.ts:4150`)。
- `producesEntity` (`Markdown.ts:4044`) — エンティティをレンダリングする場合は `true`。 `null` をレンダリングするトークンの場合は `false` (それ以外の場合は `tokenChildPrefix` がドリフトします)。
- `reflowToken` (`Markdown.ts:1520`) — 幅変更パス。アームが欠けていると、ブロックは古い幅のままになります。
- `updateTokens` インプレース分岐 (`Markdown.ts:3760`) — 尾部が伸びる形状にミューテーター (`setSpans`/`setCode`/`appendRows`) がある場合にのみオプトインします。コンテナー タイプ (`blockquote`、`list`、`table`) は、直接の突然変異ではなく末尾降下を経ます。
- ブロックがアフォーダンス ラップできる場合は、ラップを解除します: `instanceof BlockWithAffordances ? .block : entity` — 内部サイズ (`Markdown.ts:3209`、`Markdown.ts:3781` パターン) を変更した後、`refreshAffordances()` を呼び出します。
- インライン画像/数学が新しいブロック内に現れる可能性がある場合は、`containsImage`/`containsInlineMath` サブスクリプション (`Markdown.ts:4166`) と `reflowAfterImageResize` ラッパーの再同期をカバーします。

### 4. スナップショットだけでなくサボタージュを追加する

- `incrementalLex.test.ts` char-at-a-time ファズ: 新しい構成を含むコーパスを一度に 1 文字ずつ、プレフィックスごとに `marked.lexer()` に対して深い `toEqual` でストリーミングします。 `findStableCut` を正当化した `14 docs × every prefix × every cut` に対するブルートフォース スイープを維持します。拡張機能を使用した場合と使用しない場合で実行して、`nFollow >= 1` が依然として有効であることを証明します。
- **ストリーミング調整妨害行為**: `appendMarkdown` (`setContent` ではなく) を介して **トークン粒度** で構成要素を含むドキュメントをストリーミングし、`inPlaceUpdates`/`entitiesRebuilt`/`charsLexed` が予期された方向に移動することをアサートし、`setContent` に対する深いトークンツリー + ピクセルの同等性をアサートします。`setContent` を駆動する妨害行為は再利用パスに失敗することはできません。
- `comparisons/stream-markdown-smd` パリティ ゲートを、タイミング ループ外の **ディープ ツリー等価性**で再実行し、両方のエンジンのしきい値ゲートを実行します。`forge/findings/text-richtext-and-markdown.md:2026-08-03` に従って、ツリー等価性のみが壊れた解析の高速な数値をキャッチします。

### タイムライン — 2 つの領域を通る 1 チャンク

```text
chunk " world": "Hello **bo" → "Hello **world**"
  before: stable="Hello "  tail="**bo"        (paragraph, trailing plain run)
   lex:   tail re-lex → [text("Hello "), strong("world")]  charsLexed = tail.length
   diff:  matchLen=0 (paragraph raw changed), tail = [paragraph(strong)]
   reconcile: heading/paragraph didn't match → destroy old RichText, add new one
  after:  stable="Hello **world**\n\n"  tail=""  (blank line committed, entitiesReused++)
```

空白行が到着するとコミットが発生し、`findStableCut` が進むことができます。それまでは、すべてのチャンクが同じ末尾を再訪問します。境界があり、ドキュメントの長さとともに増加することはありません。

## ストリーミングのデバッグ — 最初に確認すること

1. **`sourceCharsLexed` はドキュメントの長さを追跡します** → 劣化 (`incrementalLex.ts:225` での `DegradeReason`);ドキュメント内の `:::`/`[^`/`def`/`\r` または末尾のみのスキャン (`incrementalLex.ts:490`) の欠落を確認してください。
2. **`entitiesRebuilt` が上昇中、**`inPlaceUpdates` は平坦** → その場でミス。 grep `instanceof RichText`/`CodeBlock`/`Table` `BlockWithAffordances` unwrap なし — 古典的なラッパーのバグ (`code-review-2026-08.md:167`)。
3. **スナップショットは成功しますが、ストリーミングは失敗します** → `setContent` パス (`Markdown.ts:1740`) は `updateTokens` を実行しません。キャラごとの妨害行為を書きます。
4. **`close()` の後に最後のチャンクが欠落している** → `waitForAppendSettled` は待機していません。 `Markdown.ts:2429` での `appendInFlight`/`mathLoadPending`/`fencedRebuildPending` のゲートを確認してください。
5. **選択は追加時にジャンプします** → プレフィックスは再利用されません。 `tokenChildPrefix` 有効範囲 (`Markdown.ts:1041` `validFrom`) と `matchLen` 検証 (`Markdown.ts:3689`) をチェックしてください。
6. **画像デコード後のオフスクリーン ブロック リフロー** → `reflowAfterImageResize` ラッパー パス (`Markdown.ts:2604`) が古くなります。 check `resyncWrapperBox` はラッパーの種類をカバーしています。

## 不変条件 — PR 前のチェックリスト

1. **ディープ lex アイデンティティ。** `incrementalLex(charByChar(S))` は、空白のみの空白行や裸のリスト マーカーを含む、すべてのプレフィックスで `marked.lexer(S)` と完全に等しくなります。
2. **ID を転送します。** `matchLen` 接頭辞は raw と等しく、`[...oldTokens.slice(0,matchLen), ...tail]` は完全な lex と等しくなります。`Markdown.ts:3689` で検証され、`MarkdownWorker.ts:308` でワーカー内で検証されます。
3. **エンティティとインデックスの合意。** `producesEntity ↔ renderToken null ↔ reflowToken arms ↔ tokenChildPrefix` 4 方向。 `BlockWithAffordances` **オン**でテストされました。
4. **末尾のみの突然変異。** プレフィックスの子に接触するインプレース パスはありません。早期に返されるたびにエンティティは変更されないため、拒否された再利用は半分の更新ではありません。
5. **ストリーミング コストにおけるクォータは線形です。** チャンクごとのクォータ (強制する場合) は `append` コスト (`charsLexed` ウィンドウ) において線形であり、スムーズな入力のみが調整されます。バッファリングされた送信はコミット全体を送信します (`StreamController.ts` ペーシングは表示のみです。正確さによって文字がドロップされることはありません)。
6. **深さ安定した見出し。** `heading` は `oldDepth === newDepth` (`Markdown.ts:3875`) の場合にのみインプレースで再利用されます。それ以外の場合、`font` は無効になります (`RichText` コンストラクターのみ)。

## 参考文献

- `vectojs-docs/content/learn/streaming.md` — ユーザー向けストリーミング API および `createStream` ライフサイクル。
- `vectojs-docs/content/learn/text-typography.md` — インライン数学/画像と `RichText`/`LayoutEngine` がストリーミングと相互作用する理由。
- `vectojs-docs/forge/findings/text-richtext-and-markdown.md` — 測定値が上の行を獲得したすべてのストリーミング バグのフィールド ノート。
- `vectojs-docs/forge/baselines/markdown-transcript-aggregate-2026-07-30.md` および `markdown-stream-math-findings.md` — 引用可能な 2 つのベースラインとそのエンジン/コミット。
- `vectojs-docs/forge/code-review-2026-08.md:167,170` — `BlockWithAffordances` `instanceof` + `refreshAffordances` クラスター (`#789`/`#795`、`#701`)。
- `packages/markdown/test/incrementalLex.test.ts` および `markdownWorkerProtocol.test.ts` — ストリーミング同等性とプロトコル契約は、新しい拡張機能を常に緑色に保つ必要があります。

---

_次へ: 05 Zero-DOM TeX — ストリーミング数学とテーブルが測定する植字カーネル、`InlineObject` および `SVGEntity` の放出。_
