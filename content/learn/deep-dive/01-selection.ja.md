+++
title = "01 — Canvas ネイティブな選択 — 二重世界パリティ"
description = "canvas になぜ選択がないのか、VectoJS が描画世界と DOM 選択世界をいかにパリティに保つのか、そしてそれを守るすべての厳格な不変条件。"
weight = 21
date = 2026-08-29
+++

# 01 — Canvas ネイティブな選択 — 二重世界パリティ

> canvas はビットマップ上のインクです。ブラウザの選択機構 — `Range`、`Selection`、`getBoundingClientRect`、`copy`、`find-in-page`、IME — は DOM に存在します。VectoJS はフレームごとに 2 つの世界を整列させます。**可視世界**（GPU が描画するもの）と **DOM 選択世界**（ブラウザが選択できるもの）です。このドキュメントは、その間の契約です。

## 1. なぜ canvas に選択がないのか

DOM はテキストに 3 つのものを無償で与えます:

1. **ヒット形状** — `Range.getClientRects()` は任意の部分文字列に対してブラウザ自身がレイアウトしたボックスを返します。
2. **クリップボードソース** — `textContent` + `Selection.toString()` + `copy` イベントが、ブラウザにシリアライズ用の線形文字列を与えます。
3. **編集サーフェス** — `<input>` / `<textarea>` が IME 候補ウィンドウ、`compositionstart/update/end`、そして `selectionStart/End` を所有します。

`CanvasRenderingContext2D.fillText` はピクセルを書き込みます。ブラウザはそれらに名前を付けられず、見つけられず、コピーできません。`find-in-page`（Ctrl+F）、`#:~:text=` フラグメントリンク、翻訳拡張、リーダーモード、スクリーンリーダー、クローラはすべて DOM を歩きます — canvas はそのすべてから不可視です。ネイティブな選択を求める canvas UI は、セマンティックな DOM レイヤーを**投影**し、インクと幾何学的に区別できないように保たなければなりません。0.5 px のズレでも、ハイライトがグリフから visibly ずれて描画されます。1 文字のズレが誤ったテキストをコピーし、1 つのグラフェムクラスタのズレが CJK や絵文字のキャレット配置を壊します。

失敗は常に幾何学的です — そして較正とともに複合します。正しいグラフェム単位のレイアウトでさえ、`getBoundingClientRect` が量子化されていれば（DPR）、`style.font` が getter であれば（Chrome で 480 倍）、あるいはオーバーレイの containing block がコンポジターと競合すれば（`fixed` vs `absolute`）、ドリフトします。形状、計測、コンポジターの整列は 3 つのシステムではなく 1 つです。同じ論理文字列から派生しながら異なる方法で計測する 2 つのレイアウト（異なる `measureText` 経路、異なる改行、異なる bidi 順序、異なるタブストップ）は乖離します。すべての VectoJS テキストに共通するルールは **一度コンパイルし、二度消費する** — 1 つの保持された形状プランが描画と投影の両方に供給され、2 つの独立したレイアウトは決して作りません。

## 2. 2 つの世界

```text
┌──────────────────────────────────────────────────────────────────┐
│  Visual world — canvas                                           │
│  source: string ──► LayoutEngine / prepareContentGrid            │
│       │                    │                                     │
│       │  PreparedText / PreparedContentGrid (immutable, retained)│
│       ▼                    ▼                                     │
│  flushRun / per-glyph fillText / MSDF atlas ──► pixels           │
│  at world transform (a,b,c,d,e,f) × DPR × page zoom              │
└──────────────────────────────┬───────────────────────────────────┘
                                │  same source, same plan, same epoch
                                │  same font, same advances, same x/y
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  DOM selection world — a11y / content layer                      │
│  getContentProjection() ──► ContentProjection                     │
│       │  { text, font, lineHeight, baseline, lines[], grid }     │
│       ▼                                                          │
│  Scene.syncA11y ──► per-line carriers (<span>)                   │
│       │  data-vecto-grid-cell / per-grapheme spans               │
│       ▼                                                          │
│  live DOM Range ──► Selection / copy / find / IME anchor         │
└──────────────────────────────┬───────────────────────────────────┘
                                ↕
               calibrated each frame by CanvasGeometry
               + ContentProjectionManager grid calibration
               + DPR / page zoom compensation (256 px basis)
               + font-epoch / viewport-epoch generation stamping
```

両方の世界は **1 つの論理ソース**（`source: string`）と 1 つの保持された形状プランから派生します。DOM のためにソースを再セグメント化すると、必然的に不一致な 2 つ目のレイアウトが生まれます。CJK での異なる単語分割、異なる bidi の視覚順序、異なるタブ列ストップ、異なる行高分布です。投影は再レイアウトしません。エンジン自身の座標を再利用します。

`packages/text/src/PreparedContentGrid.ts` の準備されたグリッドと `packages/layout/src/LayoutEngine.ts` のプローズは、単位（グリッドセル vs CSS px）だけが異なります — どちらもセル/グリフごとに `x/advance/level` を出力するため、同じ Bidi 対応の配置が両方で機能します。

キャリアをホストするオーバーレイ自体が幾何学的な成果物です。`CanvasGeometry.syncOverlay`（`packages/core/src/tree/scene/CanvasGeometry.ts:1`）は `getBoundingClientRect` を介して `a11yRoot`/`portalRoot` レイヤーを canvas の CSS ボックスに整列させ続けます。これには、スクロールに JS 補償がそもそも必要かどうかを決める `position: fixed` vs `absolute` の containing-block の区別が含まれます（§4.3）。オーバーレイの CSS `transform: scale(cssWidth/width, cssHeight/height)` が論理 Scene 座標を CSS ボックスへマッピングし、コンテンツ投影マネージャーが論理行座標をその上へマッピングします。

## 3. VectoJS はどう架橋するのか

### 3.1 1 つの保持されたプラン、2 つのコンシューマ

**プローズドキュメント** — `Markdown`（`packages/markdown/src/Markdown.ts`）、`RichText` / `Text`（`packages/ui/src/RichText.ts`、`packages/ui/src/Text.ts`）は `LayoutEngine`（`packages/layout/src/LayoutEngine.ts:1`）経由でレイアウトします。エンジンは `LayoutResult` を出力し、`nodes: PreparedGlyph[]` を含み、各要素は `x / y / width / height / sourceIndex / sourceLength / isRTL / style / object` を持ちます。`RichText.buildVisualLineGroups()`（`packages/ui/src/RichText.ts:668`）はベースライン（`node.y + 0.8*height`）でグリフをグループ化し、`projectedSlice()`（`packages/ui/src/RichText.ts:506`）で `sourceText` をスライスしてインラインオブジェクトの `alt` を DOM テキスト内の `U+FFFC` と置換しつつ `sourceIndex` の演算を保ち、`ContentProjection.lines[]` を `runs`、`perGraphemeCarriers`、`shapedPaint`、`lineHeight`、`baseline`、`font` とともに出力します。粗いティア（`hint.textOnly`）は行を構築せず `{ text, font, lineHeight }` を返します — ビューポート外ブロックでは O(1) です。Canvas の `render()` と `getContentProjection()` は同じ `result` オブジェクトを共有します。同一性（`===`）が無効化シグナルです（`packages/ui/src/RichText.ts:259`、`_lineGroupsCache`）。`Markdown` もドキュメントスケールで同様に、`Stack` に `RichText` ブロックを合成し `contentSemanticBudgetLeft` でゲートされたマテリアライゼーションを行います（`packages/core/src/tree/Scene.ts:600`、`DEFAULT_CONTENT_SEMANTIC_BUDGET = 256`）。

**コード的グリッド** — ターミナル、エディタ、`CodeBlock`（`packages/markdown/src/markdown-code.ts`）は `prepareContentGrid()`（`packages/text/src/PreparedContentGrid.ts:prepareContentGrid`）経由でコンパイルします。入力は `font`（CSS ショートハンド）、`cellWidth`、`lineHeight`、`baseline`、`tabSize` です。出力は不変の `PreparedContentGrid`（`kind: 'content-grid'`、`revision`、`lines: PreparedContentGridLine[]`）で、各 `PreparedContentGridCell` は `sourceStart/End`、`sourceCaretOffsets`（合法なグラフェム境界）、`glyph`（整形済み）、`x`、`advance`、`level`（bidi）を持ちます。アラビア語整形（`ArabicShaper.ts`）と bidi 並べ替え（`BidiResolver.ts:reorderVisual`）は一度だけ実行され、セルは `x` が視覚順序をエンコードしたまま論理ソース順に留まります。`Typography.cssLineBoxBaseline()`（`packages/text/src/Typography.ts:cssLineBoxBaseline`）は共有されたアタッチ済みコンテキスト経由で `fontBoundingBoxAscent/Descent` から canvas 互換のベースラインを導出します — 両世界が同じ値を使います。グリッドは `ContentProjection.grid` として返され、描画と投影の両方で再利用されます。タブ、幅広 CJK/絵文字（`isWideCluster`）、`VS15/VS16` バリエーション、ZWJ クラスタ、bidi レベル、`CR/LF/CRLF` ソース所有権（`nextSourceStart`）は 1 つのプランを共有します。

**なぜ保持されることが重要なのか。** DOM のためにソースを再セグメント化すると 2 つ目のレイアウトが生まれます。`compare-pretext.ts` での計測では、素朴な `0.5em` フォールバックは最大 50%（日本語）ずれましたが、VectoJS は実際のメトリクスが与えられれば DOM の ground truth と行数エラー 0% で一致しました。2 つのレイアウトは常に不一致になります。1 つのプランがその問い自体をなくします。

### 3.2 グラフェム単位のキャリア — 唯一正しい粒度

`Scene.syncA11y` は選択可能なプローズのためにグラフェムごとに 1 つの不可視キャリア `<span>` をマテリアライズします（`packages/core/src/tree/Scene.ts:760` 以降、`perGraphemeCarriers` パス）。各キャリアの幅は行の実際のフォントにおける**分離された**グラフェム advance であり、`left` はそのインデックスにおける整形済みプレフィックス幅から累積された論理オフセットを引いたものです。なぜグラフェム単位なのか:

- グラフェムより粗いキャリアはすでに失敗します。キャリア内の誤差はグリッドフィッティングではなく**カーニング**だからです。混合 CJK+Latin でグラフェム 2 つごとに 1 キャリアでは −0.582 px でした（`vectojs-docs/KNOWN_ISSUES.md:137`）。非線形でクラスタごとに異なり、一様な補正では吸収できません。
- Gecko は DOM レイアウトの advance を整数デバイスピクセルにグリッドフィットしますが、canvas の `measureText` は小数部を保持します。文字あたり約 0.36% で線形に蓄積します。`text-rendering: geometricPrecision` やカーニング/合字の無効化は `auto` と**同一**と計測されました — CSS での逃げ道はありません（`packages/text/src/measureContext.ts:34`、`KNOWN_ISSUES.md:131`）。グラフェムごとに 1 キャリアが shipped されている修正です。`Monospace`（均一な advance）は完全にゲートオフされます（ドリフト 0、キャリアなし）。
- キャリアは論理 DOM 順で `position: relative` + `display: inline-block` かつ `left = run.x − runningLogicalX` です（`packages/ui/src/RichText.ts:584`、`Scene.ts` のグラフェム単位パス）。決して `absolute` にしません — インラインボックスを block 化し（`computed display: block`）、レイアウトを考慮したプレーンテキストのシリアライズがすべての block ボックスで壊れます。`innerText` は正しい 2 に対し 16 の改行、ジャスティファイされたテキストで正しい 14 に対し 0 のスペースを生じました（`KNOWN_ISSUES.md:190`）。フロー相対がコピー、find-in-page、スクリーンリーダーに行を 1 行として読ませます。RTL/bidi もこのパスを共有します。視覚的な `x` は `BidiResolver` のレベルから来ますが、DOM 順序は論理のままです。

例外は `ui/Text` の高速パスです。行ごとに 1 回の整形済み `fillText`（インクにカーニング/合字を含む）は `ContentProjectionLine.shapedPaint = true` を宣言します（`packages/ui/src/RichText.ts:shapedPaint`）。そのキャリアは意図的に**整形済み**プレフィックス差分を使います — 描画に合わせるためです（§4.1）。ジャスティファイされた行はグラフェム単位キャリアを決して使いません。レイアウト自身の `positionedRuns` 形状を再利用します（`packages/ui/src/RichText.ts:626`）。

セグメンテーション自体は `Intl.Segmenter`（`granularity: 'grapheme'`）（`packages/text/src/PreparedContentGrid.ts:graphemes`、`packages/core/src/tree/Scene.ts:graphemeBoundaries`）経由です。フォールバックは決定的なコードポイント単位のセグメンター（`fallbackGraphemes`）で、結合文字、バリエーションセレクター（`VS15/VS16`）、絵文字モディファイア、キーキャップ、地域表示子、ZWJ をカバーします。等幅ではセグメンテーション自体が不要です（セル = 文字。`PreparedContentGrid` はセルグリッド内の絵文字については依然 ZWJ を認識します）。

### 3.3 コンテンツグリッド投影 — 保持された経路

グリッドキャリアは `data-vecto-grid-cell` スパンで、`data-vecto-grid-sourceStart/SourceLength/advance/x/level/caretOffsets/font/lineHeight` を持ちます（`packages/core/src/tree/scene/ContentGridProjector.ts:291`）。それらは:

- **ウィンドウ化される** — ビューポート近傍の行だけがマウントされます（`contentProjectionMargin`、ヒント `minY/maxY` は `packages/core/src/tree/Scene.ts:projectedLines`）。画面外のキャリアは `display: none` で入力を 가로채지 못합니다。
- **再利用される**（`carrier reuse`、`#244`）— ストリーミングされた追加は、触れられていない行の較正済み `scaleX` 変換をその場で再利用します（`packages/core/src/tree/scene/ContentProjectionManager.ts:536`）。再構築された末尾のセルのみが較正待ちです。
- **フォントがミラーされる** — `ContentGridProjector` はフォントを `data-vecto-grid-font` にミラーするため、較正は `target.style.font` に触れずにそれをプレーンな文字列として読み戻せます。Chrome ではそれを読むたびに再シリアライズされます（`ContentProjectionManager.ts:292`、§4.4）。

グリッド内の選択は線形 DOM オフセットではなく**ソースオフセット**としてスナップショットされます（`ContentProjectionManager.ts:snapshotGridSelection`、`gridSelectionEndpointOffset`）。`gridSelectionEndpointOffset` はライブの `Selection.anchorNode/focusNode` からキャリアセルの `sourceStart` まで歩き、セルローカルなオフセットを加え `sourceLength` にクランプします（末尾のハードブレークは同じテキストノードに存在しますがセルに属しません）。ソースオフセットは改行、ウィンドウ化、セルごとの `scaleX` 較正に対して安定です。線形オフセット 0 は「現在マテリアライズされている最初の行」を意味し、ウィンドウが動くと移動します。`gridCaretAtSourceOffset` は格納されたオフセットを論理順に `data-vecto-grid-cell` を走査して `TextCaretPosition` に解決します — 最初にカバーするセルが勝ち、境界は前のセルの終端に解決されます（同じキャレット）。

### 3.4 投影マネージャー — 誰が何を所有するか

`Scene` は 6.5k 行あります。投影は `forge/decisions/file-decomposition-2026-08.md` に従って分解されました:

| オーナー                                   | ファイル                                                   | 所有するもの                                                                                                                                                                                                                                                |
| ------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Scene.syncA11y` + `syncContentProjection` | `packages/core/src/tree/Scene.ts`                          | walk、ダーティチェック `ContentSyncState`、フレームごとの 4 フィールド（`_syncSerial`、`contentSemanticBudgetLeft`、`contentSemanticDeferred`、`contentSelectionPresentThisSync`）、`enforceA11yDomOrder`                                                   |
| `ContentProjectionManager`                 | `packages/core/src/tree/scene/ContentProjectionManager.ts` | 選択の保持（`preserveSelectionAcrossRebuild`、`snapshotGridSelection`/`restoreGridSelection`）、グリッド較正（`scheduleGridCalibration`）、空白領域ドラッグアンカー（`beginBlankRegionDrag`/`gridSelectionLine`）、世代スタンピング、プローブライフサイクル |
| `CanvasGeometry`                           | `packages/core/src/tree/scene/CanvasGeometry.ts`           | `clientToScene`、`syncOverlay`、`effectiveDPR`、`sizeGpuCanvas`、`OverlayGeometry` メモ                                                                                                                                                                     |
| `ContentGridProjector`                     | `packages/core/src/tree/scene/ContentGridProjector.ts`     | キャリアのマテリアライゼーション、`prepareContentGrid` の消費、データ属性ミラーリング                                                                                                                                                                       |
| `A11yProjectionManager`                    | `packages/core/src/tree/scene/A11yProjectionManager.ts`    | 順序付け（`enforceA11yDomOrder` 委譲）、`pruneA11ySubtree`、`removeA11yRecursively`、`getA11yTree`                                                                                                                                                          |
| `Entity` a11y フック                       | `packages/core/src/tree/Entity.ts:ContentProjection*`      | `ContentProjection` / `ContentProjectionLine` / `ContentProjectionHint` 型、`getContentProjection(hint?)` 契約、`contentEpoch`                                                                                                                              |

フレームごとの 4 フィールドは一緒に動きます（`DEC-0020`/`DEC-0022` が分割を禁じています）。`syncContentProjection`（624 行）は `syncA11y` が自身の再帰ポイントで呼び出すため `Scene` に残ります — どちらか一方だけを抽出するにはバックエッジが必要です（`DEC-0019` ルール 1）。投影マネージャーは抽出 3 回目で、`DEC-0022` によりスコープが縮小されました。walk 自体は `syncA11y` とペアでのみ移動します。

### 3.5 同期タイミング — 未完成の DOM をユーザーに見せない

**フレームごと: マテリアライゼーションの後に較正。** 較正はコールドな 2 フレームバッチです（`ContentProjectionManager.ts:700` 以降）: フレーム N で画面外にプローブを構築し（`left: -100000px`、`width: 100000px`、`contain: layout style paint`）、フレーム N+1 で `Range.getBoundingClientRect().width` を読み、セルごとに `scaleX` を書き込みます（`element.style.transform = scaleX(...)`）。定常ストリーミング（レイアウト変化なしの追加）では 1 回の `querySelectorAll` セレクターマッチで済むようオーバーラップされます。2 つの早期リターンがプローブを完全に回避します: `pendingCells.length === 0`（すでに較正済み、`vectoGridReady` はフレームコールバックから発行され、決して同期的には発行されない — 同じタスク内で先にレイアウトされたキャリアはそうでなければゼロ幅の rect を配る）と `measurements.length === 0`（保留中のセルがすべてゼロ advance または空で、即座にスタンプされる）。

**読み取りコスト: 要素ごとではなく walk ごとに 1 レイアウト。** `selectionPresent()`（`ContentProjectionManager.ts:selectionPresent`）は 1 回の `Selection.anchorNode` 読み取りを `presentThisSync` にメモ化します（同期 walk ごとに 1 回の強制レイアウト）。`releaseSelectionForRebuild` は追跡されたアンカーもライブ選択も存在しないときに安価に拒否します — 一括マテリアライゼーションパス（数百ブロック）はレイアウトを払いません。`presentThisSync` は各 walk の先頭で無効化され、任意の release や `setBaseAndExtent` の後にクリアされます。

**世代スタンピング。** フォントエポック（Web フォント読み込みでバンプ、`createMeasuringContext` 再作成）と `pageScaleX`（ブラウザズーム、基準 256 px）が較正世代を形成します（`ContentProjectionManager.ts:524`、`stamp = fontEpoch:pageScaleX.toFixed(4)`）。バンプで `calibrationGeneration` が増分し、すべてのセルごとの `scaleX` はキャリアに触れずに暗黙的に無効になります。セルは `data-vecto-grid-calib = generation` を持つため、再利用は触れられていない行をそのまま残します。

**再構築の危険。** 変更されていないプレフィックスにユーザーが選択を持っている間に投影の子を置換すると、それが消えます — ストリーミングメッセージは追加されたチャンクごとにその投影の子を置換します。`preserveSelectionAcrossRebuild`（`ContentProjectionManager.ts:preserveSelectionAcrossRebuild`）はエンドポイントをプローズでは線形文字オフセット（`projectionAbsoluteOffset`）、グリッドではソースオフセットとしてスナップショットし、空白領域ドラッグがライブのとき（ドラッグ中はブラウザが authoritative）や所有要素が選択を含まないときはスキップし、`rebuild()` 後に新しい DOM に対して再解決し `Selection.setBaseAndExtent` で復元します。`A11yProjectionManager.ts:211` の隣接する `refocus` スナップショットも `document.activeElement` に対して同様のことを行います。選択には `KNOWN_ISSUES.md:232` のストリーミング崩壊修正まで同等のものがありませんでした。

**仮想化の境界。** `contentProjectionMargin`（有限）は画面外ブロック全体を解放します。`Infinity` はそれらを常駐させます（10k ブロックで `syncA11y` あたり ~137 ms）。ブラウザの検索はマテリアライズされたコンテンツをカバーします。マウントされていない仮想化された Entity は検索できません — アプリは検索対象を常駐させておく必要があります。

**なぜ予算が 256 なのか。** 2 つの計測されたコストに対してサイズが決められました。ブロックごとに 1 つの `Span` を作成するコスト（~0.4 ms）と walk を完了するコストです。64 では総 wall time は ~6 倍でした（`ContentGridPageScaleBasis.test.ts` 期）が、フレームバウンドな利得はありませんでした（`Scene.ts:595`）。256 が 2 つの目標のトレードオフが止まる地点です。

**遅延予算。** `contentSemanticBudgetLeft`（`Scene.ts:600`、デフォルト 256 ブロック）は 1 回の同期 walk を上限設定し、10k ブロックのドキュメントを 1 度のジャンクフレームではなく ~285 パスで完了させます。`contentSemanticDeferred` はオーバーフローを保持し、`contentViewportEpoch` はブロックを移動させずにリサイズで再 tiering することを保証します。遅延された末尾のキャリアは自身のパスまで粗い（`textOnly`）ままです — 選択形状もそれらとともに遅延されますが、これは画面外ブロックがドラッグを所有できないため正しいです。

### 3.6 ポインター → キャレット: クリックが正しい Text ノードを見つける仕組み

クリックはビューポート（`clientX/Y`）で始まり、論理 Scene 座標の `TextCaretPosition { node: Text, offset: number }` に着地しなければなりません（`Scene.ts:clientToScene` はヒットテスト専用です。投影は独自の逆変換を持ちます）。

- **プローズのドキュメント行**（`Scene.ts:nearestOffsetForPoint`）: 行の `Text` ノードが与えられたら、`graphemeBoundaries()`（§3.2 と同じ `Intl.Segmenter`）を列挙し、各境界に折りたたまれた `Range` を置き、`range.getBoundingClientRect()` を呼び出してブラウザ自身のグリフボックスを取得し、`distanceToRectSquared` で最も近いものを選びます。キャレットはクラスタ内部ではなく合法なグラフェム境界に着地します。`distanceToRectSquared` はビューポート端に対してテストされるため、行の外側へのミスでも最も近い端点に解決されます。
- **グリッドセル**（`Scene.ts:gridCellCaret`、`nearestGridPositionInLine`）: セルデータ `level/advance/x/caretOffsets` が視覚 vs ソースの分数を与えます。`visuallyRtl = (level & 1) !== 0` が `visualFraction → sourceFraction` を反転し、`caretIndex = round(sourceFraction × (caretOffsets.length−1))` です。マッピングは Bidi 対応です。RTL セルの最も右の視覚的ポイントはその論理的先頭です。`nearestGridPositionInLine` は完全ヒットでは `localX ∈ [x, x+advance]` でセルを事前フィルタし、次に水平距離で最も近いものを選びます。
- **アフィン変換下のグリッド行**（`Scene.ts:clientToGridLocal`）: 高速パスは行 0 に置かれた 3 つの `data-vecto-grid-basis="origin/x/y"` マーカーを読み、2×2 基底を逆転してアフィンを復元します（`determinant = xx*yy − xy*yx`）。フォールバックはコンテンツルートの CSS `transform`（`parseCssMatrix`）を逆転し、DPR/ページズームのために `canvasRect → logical` スケールを補償します。同じ行列式しきい値（`1e-9`）が両方をゲートします。行が回転/スケールされていないとき（`a>0, d>0, |b|,|c| ≤1e-9`）、`Scene.ts:nearestGridPosition` は完全な逆変換をスキップし 1 つの安価なパスで `localX = (clientX − rect.left)/scaleX` をマッピングします。

3 つすべてが 1 つの語彙を共有します。`collectTextNodes` / `projectionAbsoluteOffset` / `projectionCaretAt`（`packages/core/src/tree/scene/content-caret.ts:1`）です。後者の `affinity: 'forward' | 'backward'` は境界オフセットを先行または後続のテキストノードに固定します — セル N の末尾とセル N+1 の先頭のどちらに選択を復元するかの違いであり、同じキャレットです。

### 3.7 ベースライン契約: 1 つの数値、2 つのレンダラー

Canvas テキストとコンテンツ投影は CSS 行ボックス内で同じベースラインオフセットを使わなければならず、そうでなければ最初の行以降で垂直ドリフトが蓄積します（24 px で行あたり ~0.35 em + 行 0 で ~6 px と計測され、CTX-0333/0334 で修正）。

`Typography.cssLineBoxBaseline()`（`packages/text/src/Typography.ts:cssLineBoxBaseline`）が唯一のソースです。`baseline = (lineHeight − ascent − descent)/2 + ascent` です。3 つのティアがあります:

1. **アタッチされた canvas**（`getSharedMeasuringContext().measureText('Mg').fontBoundingBoxAscent/Descent`）— 描画された canvas と同じフォントです（§4.2 のデタッチ注意、`Typography.ts:32`）。LRU 512 エントリで `font\0lineHeight` をキーとします（`BASELINE_CACHE_MAX = 512`）、ヒットで LRU を更新します。
2. **登録されたメトリクス**（`getFontMetrics(family).ascenderEm/descenderEm × size`、`Typography.ts:registeredBaseline`）— canvas がまだ存在しないときや SSR では、登録されたフォントと実際のブラウザが一致するよう同じセンタリング式を使います。負の `descenderEm` は canvas の極性に合わせるため正に反転されます。
3. **フォールバック** — ファミリに ascender/descender がないときは `lineHeight × 0.8`。決定的な DOM なし契約を保持します。SSR とブラウザはフォールバック分だけ不一致になりますが、レイアウト欠落による不一致ではありません。

行ボックスをセンタリングするすべてのワークストリームはこれを呼ばなければなりません — `RichText.buildVisualLineGroups`、`TextEntity`、`MSDFTextEntity`（グリフがソースと 1:1 でマッピングされるとき）、`ContentGridProjector` です。この契約以前は、`TextEntity`/`MSDFTextEntity` は場当たり的な `0.8em` や `(ascender−descender)em` ピッチを使い、Firefox で ~6 px + 0.35 em/行だけ投影を外していました（CTX-0333/0334 で修正）。

### 3.8 メトリクスチェーン: advance が解決される順序

すべての環境が canvas を持つわけではありません。`resolveGlyphMeasurer()`（`packages/layout/src/measure.ts:resolveGlyphMeasurer`）が優先順に参照する 3 つのレイヤーがあります:

| 優先度 | ソース                                              | ファイル                                                                                     | 何を計測するか                                                                                                                                         | どちらが勝つか                                                                                         |
| ------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 1      | Canvas（`createCanvasMeasurer`）                    | `packages/layout/src/measure.ts:18`                                                          | グラフェムごとの `ctx.measureText(char).width`（`baseSize=100` で、線形に導出 `base × fontSize/100`）、キャッシュキーは `size+family+char+bold/italic` | canvas を持つブラウザ — レンダラーが実際に描画するフォントを計測し、合成されたウェイトを含む           |
| 2      | 登録された MSDF/DOM なし（`createMetricsMeasurer`） | `packages/layout/src/measure.ts:108`、`packages/text/src/fontMetrics.ts:registerFontMetrics` | `advanceEm(char) × fontSize` または `measureEm(text)`（グラフェム単位ではできないカーニングをカバーする文字列全体）                                    | Node SSR、 `OffscreenCanvas` なし worker、テスト — 起動時に 1 回 `registerFontMetrics(family, source)` |
| 3      | フォールバック                                      | `packages/layout/src/LayoutEngine.ts:unmeasuredGlyphs`                                       | `0.5em` / グリフ                                                                                                                                       | 最後の手段 — `unmeasuredGlyphCount()` がいくつかを報告                                                 |

チェーンルール: canvas が意図的に勝ちます（`measure.ts:resolveGlyphMeasurer` コメント）。登録されたメトリクスを優先すると、ground truth を持つ環境で古い登録が ground truth を上書きしてしまいます。登録された bold/italic は無視されます（ファミリごとに 1 つの advance テーブル）。`createCanvasMeasurer` は実際のレンダリングからウェイトごとに解決するため、ウェイトが重要なときはそれを使わなければなりません。`LayoutEngine`（`packages/layout/src/LayoutEngine.ts:92`）は `StyledSpan` ランごとに `fontFamily/bold/italic` で measurer を呼び出すため、インラインの `monospace` や bold ランは自身のメトリクスで区切られます。`fontMetricsVersion()` + measurer ごとの `baseVersion` キャッシュが、グリフごとの `normalizeFamily` アロケーションを回避します（グリフごとに実行すると +13% と計測されました）。

`EMPTY_GLYPH_ATLAS`（`packages/layout/src/LayoutEngine.ts:EMPTY_GLYPH_ATLAS`、`packages/ui/src/RichText.ts:371`）は凍結された同一性です — 新しい `{}` ではありません — そのためエンジンの段落メモ（`prepareRich` + `prepare`）はすべてのレイアウトで無効化されません（200 回 × 12 段落の再レイアウトで 2.68 倍: 88 ms → 32.8 ms、0 → 2388 ヒットと計測）。

### 3.9 ストリーミングとウィンドウイング: 選択がドキュメントスケールと出会う場所

`Markdown`（`packages/markdown/src/Markdown.ts:681`）は `RichText` ブロックの `Stack` を合成します。選択と相互作用する 2 つの直交するウィンドウ機構があります:

- **`virtualizeBlocks`**（`MarkdownOptions.virtualize`、`Markdown.ts:614`、`virtualOverscan` デフォルト 800）— ビューポート付近のトップレベルブロックがマウントされ、画面外の高さは `RowHeights`（`height+blockGap` 上の Fenwick ツリー）として保持されます。ストリーミング（`createStream`/`appendMarkdown`）と非互換です。仮想化するドキュメントは全体がレンダリングされなければなりません。呼び出し元はスクロールフレームごとに `setVisibleRange` を駆動します（`ScrollView` は自動的にそうします）。
- **`tableViewportHeight`**（`MarkdownOptions.tableViewportHeight`、`Markdown.ts:652`）— テーブルごとの行仮想化（`Table` は自身の行を固定された `viewportHeight` に仮想化します）。ブロックウィンドウとは独立しており、`Table.appendRows` が遅延マウントするためストリーム中でも動作します。すべてのテーブルに適用され、短いものも含まれます — 2 行のテーブルもこの高さに固定されます。構築上、Table は `viewportHeight` を `readonly` として受け取ります。

`Markdown.streamStats`（`Markdown.ts:951`）— 常時有効な安価なカウンタ — は **転送**（`tokensPrefixMatched`/`tokensReturned`）と**パーサーコスト**（`lexerMs`/`sourceCharsLexed`）を区別します。古い命名はそれらを混同し、読者をすでに解決済みの差分パスを最適化させていました。worker の `incrementalLex` は安定したプレフィックスの字句解析をスキップします。劣化した形状（2 つの `DegradeReason` ケース）は依然として追加ごとに O(document) を払います — `sourceCharsLexed` がドキュメント長を追跡することがシグナルです。`stablePrefixChars` はレスポンスごとに再合計されるのではなく、worker 自身の `IncrementalLexCache.stableOffset` から送られます（ストリームの n チャンクにわたって O(n²) でした、#657）。

`CodeBlock`（`packages/markdown/src/markdown-code.ts`）とディスプレイ数式（`MathBlock`、`packages/markdown/src/markdown-math.ts`）はレジストリのフェンスブロックレンダラーでは**ありません**（`Markdown.ts:138`）。レジストリは `(source, lang, options)` を受け取りますが、両パスともインスタンス状態を必要とします — `onDemand` シーンのための `subscribeInlineMathRepaint` と `subscribeInlineMathRaster` / `subscribeInlineImageRaster`、そして数式を選択/検索/コピーに到達させる 1 オブジェクトの `RichText` です。レジストリのコピーは静かに乖離しました（`MathBlock` がシグネチャ `(formula, svgUri)` なのに `(mathRender, source, ...)` として構築され）、7 つのテストを壊しました（`Markdown.ts:154`）。レジストリはパッケージが実装していない言語のための拡張ポイントです。

コピーとの関連: `Table` セルはセルごとに投影され、`CodeBlock` グリッドは `PreparedContentGrid` を使い、`MathBlock` 数式は投影テキストとアクセシブル名として投影されます。それぞれマテリアライズされているときのみ検索/選択に参加します。複数ブロックにまたがる選択のクリップボードコピーはブロックごとの `projectedSlice` の連結です — §3.1 ごとのインライン SVG/Math の alt 置換がオフセットを保ちます。

### 3.10 ベースラインとなぜ存在するのか

`forge/baselines/*` と `vectojs-docs/forge/baselines/*` は、このドキュメントが引用する数値を固定し、将来の変更を伝聞から再計測するのではなく bisect できるようにします。具体的には: 256 px 基準テーブル（1/2/4/10/100/1000 px → 0.9921875…1.0）、Firefox での `monospace/serif/sans-serif` に対するデタッチ vs アタッチ `measureText('MMMMMMMMMM')` トリプル（`measureContext.ts:1`）、64.8 px のスクロール vs レンダー不整合（661 フレーム / 630 px スムーズスクロール）、288/290 ms の `style.font` getter コスト（Chrome vs Firefox 0.6 ms）、そして `Stack` + `RichText` ブロックメモヒット率（`EMPTY_GLYPH_ATLAS` 後に 0 → 2388）です。`KNOWN_ISSUES.md` はグラフェム単位の棄却（2 グラフェム → 混合 CJK+Latin で −0.582 px）と `absolute` キャリアのプレーンテキスト失敗（正しい 2 に対し 16 の改行、正しい 14 に対し 0 のスペース）を記録しています。新しいエンジンやホストが異なるギャップを報告したときは、固定された `DPR/ZOOM` でハーネスを再実行しベースラインコミットと比較してください — 差分がビューワーのバグか VectoJS のリグレッションかを教えてくれます。`packages/core/test/ContentGridPageScaleBasis.test.ts` は量子化に対する唯一のユニットレベルオラクルです。それ以外はすべて headed ブラウザが必要です（`performance.now` 精度のための COOP/COEP、コンポジターコールバックのためのフォーカスされたウィンドウ — `vectojs-performance` スキル参照）。

## 4. 難しい部分 — 証拠付き

### 4.1 カーニングドリフト: 文字列全体 vs 分離された advance

レイアウトは**分離された**グラフェムごとの `measureText(char).width` を合計してグリフを配置します（`packages/layout/src/measure.ts:createCanvasMeasurer` → `getSharedMeasuringContext()`、`baseSize 100` を算術的にスケール）。描画はレイアウトから 0.5 px 以内に留まります（`packages/ui/src/RichText.ts:COALESCE_TOLERANCE_PX`）— `flushRun` は `abs(measureText(runText) − sum(isolated)) ≤ 0.5` のときにのみランを 1 回の `fillText` に合体させ（`RichText.ts:1001`）、そうでなければ `node.x` での文字ごとの描画にフォールバックします。文字列全体の `measureText(text).width` には canvas が決して描画しないカーニングが含まれます。したがって文字列全体の幅を使ったキャリアは、累積されたカーニング差分だけ**インクより前に**出てしまい、カーニングが強い 16px Latin の約 300 px の行で最大 5–8 px、Gecko と Blink の両方で発生しました（`KNOWN_ISSUES.md:168`）。

修正: キャリア幅は `ContentProjectionLine.shapedPaint` を介して行の描画モデルに従います。グリフごとのペインター（`RichText`、core の `TextEntity`）は分離されたグラフェム advance を得ます。`ui/Text` の高速パス（行ごとに 1 回の整形済み `fillText`）は `shapedPaint` を宣言し、整形済みプレフィックス差分のキャリアを保持します。ジャスティファイされた行はレイアウト自身の `positionedRuns` 形状を再利用し、このドリフトを持ったことがありません。`logicalRuns` は `mctx.measureText(segment)` を介して分離された advance を合計し（`RichText.ts:598`）、`positionedRuns` は `node.x/width` を直接再利用します。`Scene.ts` のグラフェム単位パスもこの分岐をミラーします。

兄弟修正: `RichText.logicalRuns` は以前ランごとに文字列全体の計測を使っていましたが、`Scene` のグラフェム単位パスは整形済みプレフィックス差分を計測していました — 同じクラス、同じ修正です（PR #460、`@vectojs/core@1.35.1` + `@vectojs/ui@2.16.3`）。

### 4.2 DPR 量子化と 256 px ページスケール基準

ブラウザは `getBoundingClientRect().left` を **1/64 デバイス px** に丸めます（`ContentProjectionManager.ts:62`、`CanvasGeometry.ts:PAGE_SCALE_BASIS_PX`）。1 px プローブは 1/64 の倍数に量子化されます。DPR 1.1 では復元されたページスケールは真の 1.0 に対し **0.9921875**（=63.5/64）でした — 0.78% の誤差です（`ContentProjectionManager.ts:68`）。セルごとの `scaleX = advance * scale / natural`（`ContentProjectionManager.ts:717`）はすべてその係数だけ縮みました。18.0001 px ピッチが 17.8624 px として選択され、すべての CJK 継ぎ目で **0.133 px**、すべての Latin 継ぎ目で 0.061 px の隙間を残しました。DPR 1.1 ではそれらがデバイスピクセル境界に着地し、垂直の白線 `使|用|sudo` として描画されます（`ContentProjectionManager.ts:71`）。同じページで基準 1/2/4/10/100/1000 px にわたって計測すると `0.9921875, 1.0, 0.998046875, 1.0, 1.0, 1.0` — 10 px 以上のすべての基準は正確に一致し、1 px の読み取りだけが外れ値でした。

修正: **256 px** にわたって計測します（`PAGE_SCALE_BASIS_PX = 256`、`ContentProjectionManager.ts:85`）。最悪ケースは `1/64 / 256 = 6.1e-5` になります（18 px で 0.0011 px の残差、ブラウザが表現可能なピクセルの約 100 分の 1 未満）。一方でプローブの 100000 px 幅の十分内側に留まるため、スクロールバーや自身のレイアウトを導入できません（`ContentProjectionManager.ts:80`）。テストオラクル: `packages/core/test/ContentGridPageScaleBasis.test.ts` が量子化を直接モデル化します。

兄弟: デタッチされた計測 canvas は Firefox で汎用ファミリを誤って解決します（`packages/text/src/measureContext.ts:1`）。`22px monospace` はデタッチで 109.737、アタッチで 131.579、レイアウトで 132.000。`serif` はデタッチで `monospace` のフォールバックに崩壊しました（`serif` で −47%、`monospace` で −20%）。`sans-serif` だけが偶然一致したため、Chromium のみのテストでは隠れていました。すべての measurer は `getSharedMeasuringContext()`（アタッチ済み、`document.body` に親を持つ、決して `display: none` にしない）を使わなければなりません。`OffscreenCanvas` は正しく計測します（132.000）が、契約は「描画するところで計測する」です — 描画される canvas はアタッチされているため、計測する方もそうでなければなりません。残りの約 0.3% のアタッチ vs レイアウトのギャップは §4.4 の Gecko グリッドフィットであり、これではありません。

### 4.3 コンポジター vs メインスレッド vs fixed/absolute ドリフト

`position: fixed` のフルビューポート canvas はビューポートに対して**メインスレッド外**で合成されます。`absolute` オーバーレイはスクロールするドキュメントに対してレイアウトされます。`parent.getBoundingClientRect()` から `top` を**レンダーされた**フレームごとに再導出して両者を一緒に保とうとすると、レンダーなしでスクロールが進むたびにオーバーレイが古くなりました。ライブのフルビューポートシーンで、630 px にわたる実際のキー駆動スムーズスクロールで計測すると 661 サンプルフレーム中 **1 フレームが 64.8 px ずれる**ことがありました（`CanvasGeometry.ts:191`）。

修正: オーバーレイは canvas 自身の `position` を継承します（`CanvasGeometry.ts:206`、`getComputedStyle(canvas).position`）。`fixed` はビューポートに対して `left/top` を解決します — まさに `canvasRect.left/top` です（`CanvasGeometry.ts:222`）。`absolute` は `clientLeft/scrollLeft` で親相対の演算を保持します（`CanvasGeometry.ts:226`）。するとスクロールに JS 補償は不要になります。修正はより頻繁に同期するのではなく、フレームごとの依存自体を**取り除き**ます。スクロールリスナーでもコンポジターとの競合はメインスレッドの作業として残ります。残りの書き込みはメモ化されます（`OverlayGeometry: left/top/cssWidth/cssHeight/width/height/position`、`CanvasGeometry.ts:235`）。そのため変化のないフレームは何も書き込みません — 同一の代入でも CSSOM に触れ、オーバーレイレイヤー数とともに増大します（`CanvasGeometry.ts:250`）。

### 4.4 CJK サブピクセル隙間とフォント検索コスト

スケール修正後、残りのドリフトは約 0.36% の Gecko グリッドフィットです（レイアウトは整数デバイス px にスナップしますが canvas は小数部を保持します）— `text-rendering: geometricPrecision` は修正では**ありません**、`auto` と同一と計測されました（`packages/text/src/measureContext.ts:34`、`KNOWN_ISSUES.md:131`）。同じ種類の驚きが、2 つ目の独立したパフォーマンストラップを生みました。`style.font` はすべてのフォント longhand から毎回再シリアライズするライブなショートハンド getter です。セルごとに `target.style.font` を 1 回読む較正スキャンは Chrome で **290 ms 中 288 ms（99.3%）** を払いましたが、Firefox では同一ループで 0.6 ms でした — 作業ではなくエンジンだけがシグナルとなる 480 倍のクロスエンジンギャップです（`ContentProjectionManager.ts:292`）。修正: キャリアはプレーンな `data-vecto-grid-font` 文字列を格納し（`ContentGridProjector.ts:291`）、`ContentProjectionManager` はそれを読み取ります。プローブには `contain: layout style paint` で分離します。

### 4.5 IME、クリップボード、そして編集可能なミラー

`Input` / `TextArea` はコンテンツ投影では**ありません**。それらは実際の透明な `<input>` / `<textarea>` を投影します（Site:Accessibility & Automation §IME 対応入力フィールド、`packages/core/src/tree/Scene.ts:a11y input mirror`、`packages/ui/src/Input.ts` / `TextArea.ts`）。ブラウザが IME 候補ウィンドウを所有し、canvas はシャドウノードの `input`/`change`/`compositionstart/compositionupdate/compositionend` イベントから `value/selectionStart/selectionEnd/composition` をミラーし、フレームごとにキャレット、選択ハイライト、IME 下線を描画します。シャドウノードは `Entity.getA11yAttributes()` からの `textInputStyle: { font, lineHeight, padding }` でサイズ設定され、`Scene` はそれを `box-sizing: border-box` で適用します。一方 canvas は同じ padding と `Typography.cssLineBoxBaseline` から描画します — 1 つのベースライン、2 つのコンシューマ、不可視のエディタとそのインクミラーの間に垂直ドリフトはありません。

フォーカス中、`Scene` は同じユーザー同期された `value` を書き戻すことを避けます（エコー抑制）。アプリ状態が真に異なる値を提供すればそれが適用されますが、テキストを置換する制御されたコンポーネントは `selectionStart/End` を意図的に保持しなければキャレットがジャンプします。`Input` は単一行の `a11yFullViewport` 対応 Entity です。`TextArea` は `scrollLeft`/`scrollTop` が canvas にミラーされる `clipChildren` 対応スクローラーです — 他の Entity と同じ world-transform → オーバーレイ経路のため、DPR/ズーム/回転が同様に適用されます。

クリップボードパス: `cut/copy/paste` と `undo/redo` は編集可能フィールドではそのシャドウノード経由でネイティブです。静的な選択可能テキストでは、`copy` は投影レイヤー自身のブラウザシリアライズです。`projectedSlice()`（`packages/ui/src/RichText.ts:506`）が各インラインオブジェクトの `alt` を **ソース**空間で `U+FFFC` センチネルと置換するため、`LayoutNode.sourceIndex` の演算は保たれます — 1 以外の長さの `alt` はそれ以降のすべてのオフセットをずらし、選択ボックスを非同期にします。兄弟の `accessibleText()`（`RichText.ts:478`）は `aria-label` パスのために存在し、スライスには意図的に使われません。`SeparatorAfter`（論理改行 / 保持されたソフト wrap セパレータ、`ContentProjectionLine.separatorAfter`）は Firefox が複数行選択の一部を投影ルートに置かないよう、行の最後のテキストノードにマージされます。`Table` セルコピー、`CodeBlock` グリッドコピー、`MathBlock` 数式コピーはすべて同じブロックごとの `projectedSlice` 連結を流れます — §3.1 ごとのインライン SVG/Math の `alt` 置換がブロック境界をまたいでオフセットを保ちます。

教訓的物語: `packages/devtools/src/selectionAudit.ts:119` は以前 `getSelection()` を取得してから `removeAllRanges`（`:157`）を呼んでいました — ユーザー状態を破壊する監査です。現在の監査（`selectionAudit.ts:102`）はデタッチされた `Range`（`document.createRange()` + `selectNodeContents` + `getClientRects`）を使い、`DocumentSelection` に決して触れません。クリーンアップすべきプログラム的な選択は存在しません。ユーザーの選択をそのまま残してください。

### 4.6 グラフェム、カーニング、そして CJK の白い隙間 — レンダリングアーティファクトに見えるバグ

`使|用|sudo` アーティファクトは GPU バグのように見えます。隣接する Han グリフ間の垂直な白線です。これはラスターを通して見える選択投影バグです。連鎖は:

1. 1 px 基準で `getBoundingClientRect().left` が 1/64 デバイス px に量子化 → DPR 1.1 で `basisScale` が 0.78% 低い（`ContentProjectionManager.ts:68`）;
2. `scaleX = advance × basisScale / natural` が 0.78% 低い（`:717`）;
3. 各 `data-vecto-grid-cell` は `advance` 幅で描画されるが、選択ボックスは `advance × scaleX` からサイズ設定される → すべての CJK 継ぎ目で 0.133 px 不足（`:71`）;
4. DPR 1.1 では不足がちょうどデバイスピクセル境界に着地 → コンポジターが 1 列をカバーせずに残す → 白。

Latin の継ぎ目も同じ形状（0.061 px）ですが、より狭い `advance` が隠します。ラスタライザーを変えても、`geometricPrecision` に切り替えても、カーニングを無効化しても何も変わりません — 隙間はインクではなく、それを描画する `scaleX` にあります。それをガードするテストはページスケール基準オラクル（`ContentGridPageScaleBasis.test.ts`）と `DPR=1.1` での headed ハーネスです。headless の DPR 1 では何も再現しません。

### 4.7 較正は一度きりの修正ではない — フォント、DPR、ビューポートのそれぞれが再スタンプを強制する

セルごとの `scaleX` はそれが計測された瞬間にのみ `advance × (pageScale × deviceScale) / natural` です。Entity が動かなくても 3 つの入力のいずれかが変わり得ます。Web フォントが完了する（`contentFontEpoch` バンプ、`watchFontMetrics` → エポック、`Typography.clearCssLineBoxMetrics`）、ユーザーがズームする（256 px 基準の `getBoundingClientRect` 経由のページスケール、`ContentProjectionManager.ts:524`）、あるいは `devicePixelRatio` / canvas サイズが変わる（`Scene.resize` → `CanvasGeometry.effectiveDPR` → `contentViewportEpoch`）です。`calibrationGeneration`（`ContentProjectionManager.ts:calibrationGeneration`）はそれらを 1 つのカウンタに統合するため、1 回の比較ですべてのセルを無効化できます。これを逃したときの失敗は静かです。古い `scaleX` が残り、キャリアは誤った幅にあり、`selectionAudit` は行長とともに増大するがリフレッシュで消えるドリフトを報告します。`data-vecto-grid-calib` が注目すべきフィールドです — ズームを生き延びた `generation` スタンプ付きセルは古い読み取りです。

### 4.8 正しさが実際にどう計測されるか: 選択ハーネス

Headless（`jsdom`、`--disable-gpu`）には GPU もコンポジターも、小数 DPR での `Range` 形状も、COOP/COEP なしで 100 µs に粗くされた `performance.now()` もありません — 選択パリティを引用できません。引用できるのは `scripts/selection-harness/harness.ts` + `drive.sh` だけです。`harness.ts` は既知のソース、フォント、`maxWidth` で実際の `Scene` + `Markdown` + `CodeBlock` ドキュメントを構築し、`drive.sh` は専用 Hyprland ワークスペース上の**実際に headed な** Chrome と Firefox を `DPR` × `ZOOM`（`--force-device-scale-factor`、`layout.css.devPixelsPerPx`、`scripts/selection-harness/drive.sh:6`）で起動し、ユーザーがヒットするのと同じ `clientToGridLocal` / `nearestOffsetForPoint` パス経由でネイティブドラッグを駆動します。`selectionAudit.ts:1` がオラクルです。`ContentProjectionLine` 形状からの `expectedLeft/Right` vs ライブ DOM `Range` からの `actualLeft/Right` を **ローカル論理 px**（DPR/ズームを除算）で比較します。空配列 = すべての選択ボックスがグリフを追跡しています。finding があれば `entityId`、`entityPath`、`line`、`leftDrift/rightDrift` を伴い bisect できます。

ハーネスが捉えるよう作られた 3 つの失敗モード: ジャスティファイされた単語間ギャップ、RTL/bidi の視覚的並べ替え + `dir="ltr"` 固定、小数 DPR/ズーム丸め（`scripts/selection-harness/README.md:8`）。Headless の DPR 1 は 256 px 量子化バグと DPR 1.1/1.6 で shipped される約 0.36% の Gecko グリッドフィットの両方を隠します — パリティを主張する前に `DPR=1.5 ZOOM=0.9` でも 1 倍でもハーネスを実行してください。

## 5. 開発者が守るべき不変条件

> 各不変条件は、2 つのコードパスが 1 つの数値と 1 つの方向で一致しなければならない場所です。不一致があれば、ユーザーは隙間、ずれたハイライト、失われた選択を目にします — そして headless のパスはそれを隠します。`file:line` は確認すべき場所であり、提案ではありません。

1. **描画するところで計測する。** `getSharedMeasuringContext()`（`packages/text/src/measureContext.ts`）を使います — アタッチ済み、`document.body` に親を持つ、`opacity: 0` で `left: -9999px`、決して `display: none` にしない。汎用ファミリのためにデタッチされた canvas を決して使わない。ドキュメントのスタイルコンテキストなしに `serif`/`monospace` を再計測しない。`fontMetrics.ts`（`packages/text/src/fontMetrics.ts:registerFontMetrics`、`registerMSDFFontMetrics`）は DOM なしフォールバック（MSDFAtlas の `advance`/`kerning`/`ascender/descender`）であり、ブラウザでの優先パスではありません。Web フォント読み込み後は `clearCssLineBoxMetrics()` を呼び、`watchFontMetrics` にエポックをバンプさせる — 古いキャッシュされた advance は投影が関与する前の行幅エラーです。
2. **1 つのプラン、2 つのコンシューマ。** コード的 Entity: `prepareContentGrid()` を一度 → 描画と `getContentProjection().grid` の両方で同じ不変オブジェクト（`packages/text/src/PreparedContentGrid.ts`）。プローズ: `LayoutEngine` を一度 → `render()` と `getContentProjection()` の両方で同じ `LayoutResult`（`packages/layout/src/LayoutEngine.ts`、`packages/ui/src/RichText.ts:284` キャッシュ）。DOM のために再セグメント化、再 wrap、再トークン化を決してしない。`EMPTY_GLYPH_ATLAS` を atlas 同一性として使うこと（`LayoutEngine.ts:EMPTY_GLYPH_ATLAS`）で段落メモをホットに保ちます。
3. **フロー相対キャリアを論理 DOM 順で。** `position: relative` + `display: inline-block` かつ `left = run.x − runningLogicalX`（`packages/ui/src/RichText.ts:584`）。決して `absolute` にしない — block 化して `innerText`/`textContent` プレーンテキスト、`find-in-page` の行連続性、スクリーンリーダーの行反復を壊します。RTL/bidi もこのパスを共有します。視覚的 `x` はレベルから来ますが、DOM 順序は論理のままなので `innerText` はソース順にコピーされます。プローブには `contain: layout style paint` を、キャリアには付けません。
4. **a11y ツリーサイズのためにキャリアを殺さない。** 文字ごとの `StaticText` ノードは文字ごとに読まれます（`xuepoo-blog/src/text-utils.ts` 参照）。キャリアを無効化すると Firefox で ~2 px のドリフトが戻ります。ツリーコストは現実的です（Site:Accessibility & Automation §Cost scales super-linearly: 20k で 6.4 µs → 136.9 µs/entity 参照）。しかしキャリアはレバーではありません — ウィンドウ化（`contentProjectionMargin`）と `a11yProjection: 'onDemand'` がレバーです。
5. **ソースオフセットだけが安定した選択座標。** 線形 DOM オフセットはグリッドウィンドウや改行が変わるとドリフトします（`ContentProjectionManager.ts:gridSelectionEndpointOffset`）。グリッドは `sourceStart + withinCell` として、プローズは `projectionAbsoluteOffset`/`projectionCaretAt`（`packages/core/src/tree/scene/content-caret.ts`）経由でスナップショットします。Affinity `forward` vs `backward` が、セル境界のどちら側にキャレットを固定するかを決めます。
6. **描画モデルを尊重する。** `ContentProjectionLine.shapedPaint` が `Scene` にどの advance を使うかを伝えます。ジャスティファイされた行はレイアウト自身のグリフ形状を再利用します（`positionedRuns`、`packages/ui/src/RichText.ts:626`）。自然フローのランに `x` を設定すると `hasPositionedRuns` が反転し `dir="ltr"` を強制します — justify/RTL では正しいですが、ragged LTR では誤りです（`RichText.ts:533`）。ragged 行は `dir="auto"` を保ち、ブラウザ自身がテキストを bidi してキャレットヒットマッピングが正しく保たれるようにしなければなりません。
7. **オーバーレイ位置を継承する。** `CanvasGeometry.syncOverlay`（`packages/core/src/tree/scene/CanvasGeometry.ts:206`）は `fixed`/`absolute` をミラーしなければなりません — 親からフレームごとに `top` を再導出しないでください。新しいレイヤー（`glCanvas`/`gpuCanvas`/`portalRoot`）が現れたときだけ `OverlayGeometry` をメモ化し `invalidateOverlay()` してください。
8. **世代スタンプし、スイープしない。** フォントとズームの変化は世代カウンタ（`ContentProjectionManager.ts:calibrationGeneration`、`calibrationStamp = fontEpoch:pageScaleX`）経由ですべての `scaleX` を無効化します。エポックバンプでキャリアごとに触らないでください。セルは `data-vecto-grid-calib` を持つため、再利用は触れられていない行をそのまま残します。
9. **再構築をまたいで選択を保持する — ただしドラッグ中は除く。** `preserveSelectionAcrossRebuild` / `snapshotGridSelection` + `restoreGridSelection` がストリーミング再構築の危険をカバーします。空白領域ドラッグはブラウザ authoritative であり中断してはなりません。`releaseSelectionForRebuild` は選択されたテキストがもはや投影されていないとき（ウィンドウが外れてスクロールした — デタッチされたキャリアを指すのではなく `Range` をデタッチしたままにする）のより安価な兄弟です。
10. **1 つのベースライン、両世界。** すべての行ボックス — canvas と DOM — は `Typography.cssLineBoxBaseline()`（`packages/text/src/Typography.ts:cssLineBoxBaseline`）を呼びます。フォールバックティア以外で `0.8 * lineHeight` をハードコードしないでください。その定数はフォールバックであり、契約ではありません。
11. **計測者を計測しない。** `style.font` はライブ getter です（`ContentProjectionManager.ts:292`）。`data-vecto-grid-font` を読んでください。同様に `getBoundingClientRect` はレイアウトを強制します — バッチ化し（プローブパス）、メモ化し（`selectionPresent` / `OverlayGeometry`）、フレームごとに要素ごとに読まないでください。
12. **仮想化はオプトインで排他的。** `Markdown.virtualize` とストリーミング `createStream` は合成しません（`Markdown.ts:614`）。`tableViewportHeight` は合成します（`:652`）。検索で重要なブロックはマウントされたウィンドウ内に入れてください。そうでなければ見つけられません — マテリアライゼーションが、DOM ツリーの深さではなく Ctrl+F で何が見えるかを決めます。

## 6. デバッグチェックリスト — 選択やコピーがずれたとき

### 6.1 まず定量的に

| 症状                                                       | 最初のプローブ                                                                                                                                                                                                                                                                                                                                                        | 何が分かるか                                                                                                                                                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 行長とともに増大するハイライトオフセット                   | `auditEntitySelection` / `auditSceneSelection`（`packages/devtools/src/selectionAudit.ts:56`）— **ローカル論理 px**（`rootRect.width / entity.width` 経由で DPR/ズームを除去）での `expectedLeft/Right`（投影形状）vs `actualLeft/Right`（`Range.getClientRects`）を比較。デフォルト許容 2 px。右端はより緩い `rightTolerance` が必要な場合あり（カーニングが蓄積）。 | 文字列全体 vs 分離ドリフト、または `shapedPaint` ミスマッチ。                                                                                                                                   |
| すべての CJK 継ぎ目で見える隙間                            | `PAGE_SCALE_BASIS_PX`（=256、`ContentProjectionManager.ts:85`）と `data-vecto-grid-calib` 世代を確認。`probeOrigin/XRect → basisScale`（`ContentProjectionManager.ts:707`）を再計測。                                                                                                                                                                                 | ページスケール量子化またはズーム/DPR 変更後の古い較正。                                                                                                                                         |
| リフローやストリーミング追加で選択が崩壊                   | ドラッグを拡張しながら `snapshotGridSelection` → `gridSelectionLine`（`ContentProjectionManager.ts:gridSelectionLine`）。`preserveSelectionAcrossRebuild` が所有要素をカバーしているか確認。                                                                                                                                                                          | 線形 vs ソースオフセットのバグ、またはアンカーされた行に触れる再構築。`blankRegionDrag`（`:blankRegionDragActive`）を確認。                                                                     |
| スクロールでオーバーレイハイライトが外れる                 | `CanvasGeometry.overlay`（`CanvasGeometry.ts:OverlayGeometry`）— 630 px スクロール下での `position` と `left/top` vs `canvas.getBoundingClientRect()`。                                                                                                                                                                                                               | `fixed` canvas に `absolute` オーバーレイ、または `glCanvas`/`gpuCanvas` 追加後の `invalidateOverlay` 漏れ。                                                                                    |
| グリッド ready だが幅ゼロの rect                           | `scene.getContentElement(id).dataset.vectoGridReady` のタイミング — フレームコールバックから発行されなければならず（`ContentProjectionManager.ts:566`）、決して同期的ではない。                                                                                                                                                                                       | ドラッグ/計測実行時にキャリアがまだレイアウトされていない。                                                                                                                                     |
| フォントスワップでキャリアが古いまま                       | `contentFontEpoch` / `contentViewportEpoch` vs `calibrationStamp`（`ContentProjectionManager.ts:calibrationStamp`）。                                                                                                                                                                                                                                                 | フォント読み込みやリサイズ時のエポックバンプ漏れ — `watchFontMetrics`（`RichText.ts:290`）と `Scene.resize` を確認。                                                                            |
| `Selection.toString()` は正しく見えるが `innerText` が誤り | コンテンツルートで `innerText` vs `textContent` vs `Selection.toString()` を比較。                                                                                                                                                                                                                                                                                    | `Selection.toString()` はテキストノードを歩きレイアウトを無視する — `absolute` による block 化コピー失敗を見えない。`innerText` か実際のクリップボード読み取りを使う（`KNOWN_ISSUES.md:204`）。 |
| 静止時は選択が保たれるがスクロールで壊れる                 | `CanvasGeometry.overlay.position` vs `getComputedStyle(canvas).position`（`CanvasGeometry.ts:206`）、次にライブなスムーズスクロール下での `OverlayGeometry.left/top`。                                                                                                                                                                                                | `fixed` canvas のオーバーレイが `absolute` のまま — CSS containing block が修正であり、計算ではない。                                                                                           |
| Firefox のみ、または汎用ファミリのみでドリフト             | `isSharedMeasuringContextAttached()`（`packages/text/src/measureContext.ts:isSharedMeasuringContextAttached`）と `familyOf`（`packages/ui/src/measure.ts:familyOf`）。                                                                                                                                                                                                | 汎用ファミリ（`monospace`/`serif`）でのデタッチされた measurer — Chromium は隠す。                                                                                                              |
| `unmeasuredGlyphCount() > 0` で wrap が誤り                | `LayoutEngine.unmeasuredGlyphCount()`（`packages/layout/src/LayoutEngine.ts:31`）— 0 以外は一部のグリフが `0.5em` でサイズ設定されたことを意味する。`registerFontMetrics` / `hasFontMetrics()`（`packages/text/src/fontMetrics.ts:registerFontMetrics`）を確認。                                                                                                      | フォントメトリクスが登録されていない DOM なし環境 — 行幅と区切りは捏造。                                                                                                                        |
| 等幅でもまだドリフト                                       | `familyOf(this.font)` vs 行の `font`（`packages/ui/src/RichText.ts:nodeFont`）、そして `perGraphemeCarriers` がそのファミリでゲートオフされたかどうか。                                                                                                                                                                                                               | 行の `font` フォールバック（`monospace`）がセルフォントと一致しない混合ファミリ行 — グリッドパスはすでにセルごとにフォントを持つが、プローズパスはそれに合わせなければならない。                |

### 6.2 インタラクティブなプローブ

```ts
// セマンティックスナップショット — DOM が実際に何を投影しているか（start() から 1 フレーム後が必要）
console.log(JSON.stringify(scene.getA11yTree(), null, 2));

// 1 つの Entity のライブノード — dataset、rect、そして選択を所有しているかどうか
const el = scene.getContentElement(entity.id);
console.log(el?.dataset, el?.getBoundingClientRect());
console.log(scene.getA11yElement(entity.id));

// 定量的ドリフト、ローカル論理 px、実際のブラウザが必要（レイアウト + Range）
import { auditSceneSelection } from '@vectojs/devtools';
console.table(auditSceneSelection(scene, { tolerance: 0.5, rightTolerance: 1 }));
// 単一 Entity、または id に制限:
// auditEntitySelection(scene, entity, { tolerance: 0.5 })
// auditSceneSelection(scene, { entityIds: ["my-markdown"] })

// ライブノード上の較正状態
console.log({
  ready: el?.dataset.vectoGridReady,
  calibration: el?.dataset.vectoGridCalibration,
  pending: el?.dataset.vectoGridCalibrationPending,
  samples: el?.dataset.vectoGridCalibrationSamples,
  calibMs: el?.dataset.vectoGridCalibrationMs,
  fontEpoch: (scene as any).contentFontEpoch,
});

// 形状リードアウト — ローカル論理 x/y vs world transform
import { getContentGeometry } from '@vectojs/devtools';
console.log(getContentGeometry(entity));
```

`SceneOptions`（`packages/core/src/tree/Scene.ts:SceneOptions`）で `debugA11y: true` を渡すと、開発中にシャドウノードを青い破線でアウトラインします。`scripts/selection-harness/drive.sh`（`DPR=1.5 ZOOM=0.9`、`scripts/selection-harness/README.md`）でクロスエンジン、マルチ DPR 検証を駆動してください — headless の DPR 1 は量子化バグと DPR 1.1/1.6 で shipped されるグリッドフィットドリフトの両方を隠します。そのハーネスはジャスティファイされた行、RTL/bidi、小数 DPR/ズームを演習し、`selectionAudit.ts` が捉えるよう作られた 3 つの失敗モードすべてです（`selectionAudit.ts:1`）。

### 6.3 プローブのコスト — チェックをリグレッションにしない

- `auditSceneSelection` 自体が行ごとに `getBoundingClientRect` を呼び出し（レイアウト強制）、実際のブラウザで実行しなければならず、ホットループでは実行してはなりません。フレームパスには出荷しないでください — QA トグルや Playwright ハーネスでゲートしてください。
- `scene.getA11yTree()` は a11y サブツリーを歩きます。`A11yProjectionManager.enforceA11yDomOrder` によって順序付けされ、アサーションでは安定していますが、数千のインタラクティブ Entity では無料ではありません（§5.4 コスト表参照: Chrome で 20k で 715 ms）。検証ごとに一度スナップショットし、フレームごとではありません。
- `selectionPresent()`（`ContentProjectionManager.ts:selectionPresent`）は同じ読み取りをバッチ化する本番の例です。同期 walk ごとに 1 回の強制レイアウトであり、要素ごとではありません。新しい投影ヘルスチェックにはそのパターンをコピーしてください。

> **見出しに関する注意。** このドキュメントは boss-01 三部作の 1 つです。`vectojs-docs/content/learn/` インデックスや `reference/core-a11y.md` アンカーがドリフトしないよう、H2 数と `order` を安定させておいてください — 名前変更後は `scripts/sync-content.py` を確認してください。

## 7. フルフレーム — 順序通りの 6 ステップ

ストリーミングコードブロックを DPR 1.6 で 1 行拡張しながら、ユーザーが変化していないプレフィックスに選択を持っているフレームでは:

1. **レイアウト** — `prepareContentGrid` または `LayoutEngine.layoutPrepared` が新しいプランを出力します。`Stack` は dirty なブロックだけを再計測します（`updateTokens` / `virtualHeights` Fenwick）。
2. **Canvas 描画** — `Scene.render` が VMT を歩き、`worldTransform × DPR` を適用し、`fillText`/`drawImage` バッチを発行します。`flushRun` 決定（`COALESCE_TOLERANCE_PX`）はすでに焼き付けられています。
3. **オーバーレイ同期** — `CanvasGeometry.syncOverlay` が `a11yRoot` を `canvasRect` に整列させ、`fixed`/`absolute` を継承します（`CanvasGeometry.ts:206`）、メモ化されます（`OverlayGeometry`）。
4. **マテリアライゼーション** — `syncA11y` / `syncContentProjection` が `ContentSyncState` をダーティチェックし（world 行列、`hasBand`/`visible`、`fontEpoch`/`viewportEpoch`、`tier`）、ヒント `minY/maxY` にキャリアをウィンドウ化し、触れられていないグリッド行の `scaleX` を再利用し、グラフェムごとのスパンまたは `data-vecto-grid-cell` スパン（`sourceStart/Length/x/advance/level/caretOffsets` 付き）を作成します。
5. **選択の保持** — `ContentProjectionManager.snapshotGridSelection` をソースオフセットとして、`preserveSelectionAcrossRebuild` / `restoreGridSelection` を `rebuild()` 後に、あるいは選択されたテキストがスクロールアウトした場合は `releaseSelectionForRebuild`。空白領域ドラッグはブラウザ駆動のままです。
6. **較正（コールド）** — フレーム N で画面外に 100000 px プローブを構築。フレーム N+1 で `Range` の natural 幅を読み、256 px ページスケール基準からの `basisScale` で `scaleX = advance × basisScale / natural` を計算し（`ContentProjectionManager.ts:707`）、`transform` を書き込み、`data-vecto-grid-calib` をスタンプします。定常状態は 1 回のセレクターマッチです。`vectoGridReady` はフレームコールバックから発行されます。

ステップ 1 を経由せずに再計測するステップは 2 つ目のレイアウトを作り、将来のドリフトを生みます。メモ/属性パスを経由せずに `style.font` や `getBoundingClientRect` を読むステップは §4 の 480 倍 / 要素ごとのレイアウトコストを払います。

---

**さらに読む。** `vectojs-docs/content/learn/accessibility.md`（投影モデル、IME、find-in-page、コスト表）と `reference/core-a11y.md`（複合ウィジェット、ロービング tabindex、`pointerEvents: 'none'` ホットスポットパターン）が、このドキュメントが従うトーンを定めます。計測され、エンジンごとで、棄却された代替案が名指しされ、数値と `file:line` で着地します。`forge/decisions/file-decomposition-2026-08.md` §2 はなぜフレームごとの 4 フィールドと 2 つの walk がペアでのみ動くのかを説明します。`KNOWN_ISSUES.md` §Selection highlights / Positioned-run carriers / Core TextEntity projections が修正されたドリフトとその罠を記録します。決して「概ねそうあるべき」ではなく — キャリアが `node.x` にあるかどうかです。

## 付録 — 1 回のドラッグが触れるすべてのファイル

ユーザーが `Markdown` コードブロックの空白パディングで押下し、3 行にわたってドラッグして離します。DPR 1.6、`position: fixed` フルビューポートシーン、Firefox 153:

| モーメント                       | 何が起きるか                                                                                                                                       | ファイル                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `mousedown` in blank             | `ContentProjectionManager.beginBlankRegionDrag` が `TextCaretPosition` を追跡。ブラウザが `Selection` を折りたたむ                                 | `ContentProjectionManager.ts:beginBlankRegionDrag`                                  |
| `mousemove`                      | `Scene.ts:nearestGridPosition` → `gridCellCaret`（Bidi 対応分数）+ `blankRegionDragActive` が `setBaseAndExtent` 経由で `Selection` を拡張         | `Scene.ts:nearestGridPosition`、`ContentProjectionManager.ts:blankRegionDragActive` |
| 次のフレーム: ブロックがリフロー | `syncContentProjection` がキャリアを再ウィンドウ化。`snapshotGridSelection` がソースオフセットを保存                                               | `ContentProjectionManager.ts:snapshotGridSelection`                                 |
| 再構築                           | `preserveSelectionAcrossRebuild` はスキップ（ドラッグがライブ → ブラウザが authoritative）。`clearGridState` は非所有ブロックのみ解放              | `ContentProjectionManager.ts:clearGridState`                                        |
| `mouseup`                        | `ContentProjectionManager.endDrag` が `blankRegionDrag` + アンカーをクリア。`getContentElement` rect はライブ                                      | `ContentProjectionManager.ts:endDrag`                                               |
| 2 フレーム後                     | プローブが `Range.getBoundingClientRect().width` を読み、ドラッグされたセルに `scaleX` を書き込み。`vectoGridReady` はフレームコールバックから発行 | `ContentProjectionManager.ts:scheduleGridCalibration`                               |
| コピー（Ctrl+C）                 | ブラウザが較正済みキャリアから `projectedSlice` テキスト（alt 置換、separator マージ済み）をシリアライズ                                           | `RichText.ts:projectedSlice`                                                        |

いずれかの行がスキップまたは並べ替えられた場合、§5 の同じ行番号の不変条件を再読してください。
