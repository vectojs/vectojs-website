+++
title = "15 — バーティカルアプリ — ナレッジグラフ、ノードエディタ、デスクトップとテーブル"
description = "バーティカルパッケージがどのようにエンジンプリミティブを合成するか — graph3d／force レイアウト上の knowledge-graph、node-editor のコマンドと履歴、デスクトップのウィンドウ管理、テーブル仮想化 — そしてアプリの罠がエンジン欠陥とどう異なるか。"
weight = 35
+++

# 15 — バーティカルアプリ — ナレッジグラフ、ノードエディタ、デスクトップとテーブル

> エンジンプリミティブは単独では正しい; バーティカルはそれらがページング、undo、ウィンドウ、そして 10 万行の圧力の下で合成されることを証明する。10 行でしか動かないテーブル、展開でテレポートするグラフ、オーバーレイの a11y ミラーを漏らすウィンドウはすべて、物理やレンダラーのバグではなくアプリレベルの合成バグである — forge がそれらを分けておくのはそのためだ。

- **学べること**: 4 つのバーティカルがどのように安定したプリミティブを合成するか — `GraphLayout`／`Graph3D` 上の `KnowledgeGraphModel`、`CommandHistory`／`SelectionState`／`layoutDocument` 上の `NodeEditor`、`Scene` オーバーレイ上の `DesktopShell`／`WindowManager`／`DesktopWindow`、`Text` ＋ `GridCellHotspot` 仮想化上の `Table` — 増分成長を安価にしティアダウンをクリーンにするすべてのファイル境界と所有ルールとともに。
- **学べないこと**: `ForceLayout2D`／`VectoForceLayout` 内部の物理（ボス 11）、VMT dirty ライフサイクル（ボス 06）、レンダラー／DPR 契約（ボス 07）。本ドキュメントはアプリがそれらのエンジンをどう**消費**するかを示し、エンジンがどう計算するかではない。

## 1. ナレッジグラフ — 3D 上のページングされたカット

### 1.1 データ契約

`KgEntity extends GraphNode` は `packages/knowledge-graph/src/types.ts:19`、`KgFact extends GraphLink` は `types.ts:31` にあり、同じオブジェクトがドメインフィールド（`type`、`labels: LabelMap`、`predicate`、`confidence`、`provenance`）をそのままに `@vectojs/graph3d` レイアウトとレンダラーに直接流れる。`KgDataSource` は `types.ts:54` にある遅延シームである: シード用の `getNodes(ids?)` とページングされたホップ用の `getNeighbors(id, { limit, cursor, direction, signal })` は `types.ts:58`。`KgNeighborhood` は `types.ts:68` で `facts`、`neighbors`、`nextCursor`／`hasMore`、そして任意の `entity` を持つ — 不在は「不明な id」を意味し、捏造するのではなく失敗しなければならない（§1.3 を参照）。

`LabelMap` は `types.ts:12` で `Record<languageTag, string>` であり `''` がフォールバックである; `pickLabel` は `types.ts:87` で要求された言語、次に `''`、次に `en/zh/…`、次に任意のキーを優先する。`KgGraphData` は `types.ts:43` でアダプタ具体化後のインメモリスナップショットである。

`MemoryDataSource` は `packages/knowledge-graph/src/MemoryDataSource.ts:15` にあるテスト／小グラフアダプタである: 両エンドポイントでファクトをインデックス化する（`MemoryDataSource.ts:17` の `out`／`inn`）ため `getNeighbors` は $O(degree)$ であり、`'both'` で自己ループを重複排除し（`MemoryDataSource.ts:71`）、カーソルを `"<version>:<offset>"` としてバージョン付けする（`MemoryDataSource.ts:108`）— `load()` は `MemoryDataSource.ts:26` で `version` をバンプするため、進行中のカーソルは変更されたリストをスライスするのではなく大声で失敗する（`MemoryDataSource.ts:125`）。

`rdf.ts:11` は `n3` `Parser` 経由で `parseRdfTurtle(text)` を提供する: サブジェクトは Entity になり、`rdf:type` は `type` を設定し（最後が勝つ、`rdf.ts:51`）、`rdfs:label`／`skos:prefLabel`／`schema:name` は `labels` を埋め（`rdf.ts:56`）、他の object-IRI トリプルは `KgFact` になる（`rdf.ts:62`）、すべての Entity は `''` フォールバックを得る（`rdf.ts:74`）。同期 `Parser.parse` — メインスレッドで数百 MB 向けではない（`rdf.ts:24` ドキュメント）。

### 1.2 FixedZLayout — フォークなしの 2D 投影

`FixedZLayout` は `packages/knowledge-graph/src/FixedZLayout.ts:22` で `VectoForceLayout` をラップし、各 `step()`（`FixedZLayout.ts:49`）の後と `setGraph`（`FixedZLayout.ts:37`）の後にすべての `z` を定数にクランプする。内部シミュレーションは依然として 3D Barnes-Hut 八分木として実行される; `pinNode` は `z ?? this.z`（`FixedZLayout.ts:56`）で委譲し、`sanitize()` は `FixedZLayout.ts:85` で非有限な `x/y` を `cbrt` 螺旋上に再 seed する。ピン契約は `ForceLayout2D`（ID アドレス）から乖離する: `FixedZLayout` は `GraphLayout`（`GraphLayout.ts:46`）のようにインデックスでピンし、`FixedZLayout.ts:18` で注記されている。

### 1.3 KnowledgeGraphModel — 単一のレイアウトドライバ

`KnowledgeGraphModel` は `packages/knowledge-graph/src/KnowledgeGraphModel.ts:62` でレンダラー中立でありページングされたカットを所有する: `entities`／`facts`／`factKeys`／`expansions`／`requests`／`entityOrder`／`lastPositions`（`KnowledgeGraphModel.ts:69`）。それは借用した `GraphLayout` の**単一ドライバ**である（`KnowledgeGraphModel.ts:43` ドキュメント: `rebuildGraph` ごとに 1 つの `setGraph`、`expand` ごとに 1 つの `reheat`）。構築は `source`、任意の借用 `layout`、`pageSize`、`direction`、`lang` を取る（`KnowledgeGraphModel.ts:39`）。

- `bootstrap(focusIds, expandSeeds)` は `KnowledgeGraphModel.ts:114` で `getNodes` 経由でシードを取得し、`ingestEntities` し、`rebuildGraph()` し、その後各シードを `expand` する。
- `expand(id)` は `KnowledgeGraphModel.ts:127` で id ごとに promise を共有し（`KnowledgeGraphModel.ts:134`）、`complete` で短絡し（`KnowledgeGraphModel.ts:136`）、`loading` をマークし（`KnowledgeGraphModel.ts:144`）、その後 `loadPage`（`KnowledgeGraphModel.ts:240`）。
- `loadPage` は `AbortSignal`（`KnowledgeGraphModel.ts:246`）付きで `source.getNeighbors` 経由でページングし、`page.entity` が欠けていれば大声で失敗する（`KnowledgeGraphModel.ts:259` — プレースホルダ `'Unknown'` ノードを決して取り込まない）、Entity／ファクトを取り込み、ネット新規ではなくバッチの `page.facts.length` で `loaded` を進め（`KnowledgeGraphModel.ts:273`）、`ExpansionState` を記録し（`KnowledgeGraphModel.ts:275`）、`rebuildGraph()` ＋ `layout?.reheat(0.5)`（`KnowledgeGraphModel.ts:285`）。
- `cancelExpand` は `KnowledgeGraphModel.ts:150` で `AbortController` 経由で abort し、`cancelled` をマークする。
- `rebuildGraph()` は `KnowledgeGraphModel.ts:332` でレイアウト位置をキャプチャし、安定した `entityOrder` でマージし、`lastPositions` から新しいノードを seed し、`pickLabel` で `GraphData` を構築し、`layout?.setGraph` を呼ぶ。
- `dispose()` は `KnowledgeGraphModel.ts:225` で意図的に借用レイアウトを破棄**しない** — セッションがまだ共有している可能性がある（`KnowledgeGraphModel.ts:230` コメント）。

`KnowledgeGraphModel.ts:23` でのスナップショット契約は `{ version:1, entities, facts, expansions }` である; `exportSnapshot`／`importSnapshot` は `lastPositions` 経由で位置を保持し、古いリクエストを abort するためにリビジョンをバンプする（`KnowledgeGraphModel.ts:190`）。

### 1.4 Graph3D + GraphLayout — レンダリングシーム

`GraphLayout` は `packages/graph3d/src/layout/GraphLayout.ts:12` で最小のワーカー向け契約である: `setGraph(data)`、`step(iterations) -> boolean` active／hot（`GraphLayout.ts:28` ドキュメント）、`GraphData` ノード順での xyz トリプレットのフラット `Float32Array positions`（`GraphLayout.ts:35`）、インデックスによる任意の `pinNode`／`unpinNode`／`reheat`。`Graph3D` は `packages/graph3d/src/Graph3D.ts:28` でサイズに関係なく 2 ドローコールである: `∛val` 半径スケーリング（`Graph3D.ts:104`）を伴う 1 つの `InstancedMesh`（`Graph3D.ts:115`）、1 つの `LineSegments`（`Graph3D.ts:136`）。`setGraphData` はアタッチ前にエンドポイントを検証し（`Graph3D.ts:73`）、`applyPositions` は `Graph3D.ts:149` で行列を書き、インラインで境界を追跡し（`computeBoundingSphere` コストを回避 — `Graph3D.ts:178` で 60–78% を計測）、短い配列では一度だけ警告する（`Graph3D.ts:162`）。

### 1.5 KnowledgeGraphSession — 配線

`KnowledgeGraphSession` は `packages/knowledge-graph/src/KnowledgeGraphSession.ts:67` で `model`、`graph: Graph3D`、`camera: GraphCamera`、`layout: GraphLayout`、`interaction: GraphInteraction` を所有する。コンストラクタは `KnowledgeGraphSession.ts:92` で `Graph3D`、`GraphCamera`（mode はセッション `mode`）、`'2d'` 用には `FixedZLayout`（`z:0, repulsion 120, linkDistance 55` は `KnowledgeGraphSession.ts:109`）、そうでなければ `VectoForceLayout` を構築する。モデルは借用レイアウト ＋ `lang` で構築される（`KnowledgeGraphSession.ts:120`）。インタラクションは `camera: () => camera.camera` を配線するため mode スワップがライブに保たれる（`KnowledgeGraphSession.ts:129`）、`handleSelect`／`handleHover` はインデックス整列された `entityByIndex`（`KnowledgeGraphSession.ts:87`）にルーティングする。

- `bootstrap` は `KnowledgeGraphSession.ts:182` で `model.bootstrap` を await し、飛行中に破棄されれば bail し（`KnowledgeGraphSession.ts:189`）、その後 `syncFromModel()` ＋ `camera.fitToPositions`。
- `syncFromModel()` は `KnowledgeGraphSession.ts:287` で `model.getGraphData()` を `graph.setGraphData`／`applyPositions` と `interaction.setNodeCount` にミラーする。
- `tick(iterations)` は `KnowledgeGraphSession.ts:242` でレイアウトをステップし、収束したときのみレイアウト位置をキャプチャし（`KnowledgeGraphSession.ts:250` — hot フレームはキャッシュされない）、レンダラーに適用する。`tick` は冷却されたときに true を返す（`KnowledgeGraphSession.ts:252`）、`if (!tick()) rAF` に一致する。
- `expand` は `KnowledgeGraphSession.ts:219` でモデルに委譲し、ミラーし、`onExpand` を発火する。
- `expandInBackground` は `KnowledgeGraphSession.ts:332` で id ごとに進行中の expand を重複排除し（`KnowledgeGraphSession.ts:85` の `inFlightExpansions`）、失敗を `onError` または `console.error` にルーティングする — 決して未処理にしない（`KnowledgeGraphSession.ts:338`）。
- `dispose()` は `KnowledgeGraphSession.ts:267` で interaction／camera／graph／layout／model を順に破棄する; セッションがレイアウトを所有し、モデルは所有しない。

`GraphInteraction` は `packages/graph3d/src/GraphInteraction.ts:83` で `THREE.Raycaster`（`GraphInteraction.ts:168` `raycaster.setFromCamera`）経由で `Graph3D` 上のポインタイベントを `onHover`／`onSelect`／`onDrag` に変え、`GraphInteraction.ts:300` で法線平面ドラッグを構築し `layout.pinNode`（`GraphInteraction.ts:309`）を通じて書き込む。`setControlsEnabled(false)` は `GraphInteraction.ts:214` でドラッグ中にホスト `OrbitControls` をブロックする。

アクセシビリティ: `knowledge-graph` はノードごとの DOM を投影**しない**（`KnowledgeGraphSession.ts:64` ドキュメント）— ホストで集約 `role="status"` アナウンサーとペアにすること。

### 1.6 フレーム統合とライフサイクル

セッションは `WebGLRenderer` や `requestAnimationFrame` ループを決して所有しない — ホストが所有する（`KnowledgeGraphSession.ts:60` ドキュメント）。正しい配線は一度だけ `attach(scene)`（`KnowledgeGraphSession.ts:153`）、`bootstrap` を await（`KnowledgeGraphSession.ts:182`）、その後フレームごとに `tick()` ＋ `render(renderer, scene)`（`KnowledgeGraphSession.ts:242`／`KnowledgeGraphSession.ts:256`）である。`tick` は収束した位置のみをキャプチャする（`KnowledgeGraphSession.ts:250` — hot フレームキャプチャはノードごとにフレームごとに 1 つの `Map` エントリを書く）かつ冷却されたときに `true` を返す（`KnowledgeGraphSession.ts:252`）ため、ループは `if (!session.tick()) requestAnimationFrame(loop)`（`KnowledgeGraphSession.ts:240` ドキュメント）である。await 後の破棄ガードは `KnowledgeGraphSession.ts:189`／`KnowledgeGraphSession.ts:227` でコンストラクタの fire-and-forget `bootstrap`（`KnowledgeGraphSession.ts:145`）からの遅延継続を静める — これなしではミラーが破棄された `Graph3D` に対して実行される。

`loadSnapshot` は `KnowledgeGraphSession.ts:202` でデモ／オフラインのパスである: すべての Entity を `complete` とマークし `loaded = facts.length`（`KnowledgeGraphSession.ts:208`）とした `KnowledgeGraphSnapshot` を構築するため、`expandOnSelect`（`KnowledgeGraphSession.ts:94` オプション、`KnowledgeGraphSession.ts:318` チェック）はすでに存在するホップを再取得しない。`setSize` は `KnowledgeGraphSession.ts:263` で `camera.setSize` にフォワードする; `getMode` は `KnowledgeGraphSession.ts:160` でセッションの `mode`（`'2d'|'3d'` は `types.ts:6`）を公開する。

### 1.7 グラフデータ型とホスト所有

`GraphData` は `packages/graph3d/src/types.ts:1` で `{ nodes: GraphNode[], links: GraphLink[] }` であり、`GraphNode` は `id: NodeId`（`types.ts:6` `string|number`）、任意の `x/y/z` シード、任意の `fx/fy/fz` ピン、`Graph3D` 半径用の `val`、そして `color` を持つ。`GraphData` は model→layout→renderer シームを跨ぐ唯一のオブジェクトである — `KnowledgeGraphModel` は `KgEntity`／`KgFact` からそれを構築し（`KnowledgeGraphModel.ts:332` `pickLabel` ＋ `position` スプレッド）、`GraphLayout.setGraph` はそれを値で消費し（実装は SoA にクローンまたはコピーする）、`Graph3D.setGraphData` はそれを id でインデックス化する（`Graph3D.ts:80` `indexById`）。レンダラーは位置がどう計算されたかを意図的に知らない（`Graph3D.ts:26` ドキュメント: ワーカーの背後で交換可能またはリモート）、レイアウトはレンダラーがどうバッチするかを知らない（`VectoForceLayout.ts:68` ドキュメント）。ホスト所有は明示的である: 呼び出し元が `VectoForceLayout`／`D3ForceLayout`／`FixedZLayout` と `Graph3D`／`GraphCamera` を構築し、モデルはレイアウトを借用し（`KnowledgeGraphModel.ts:47` `layout?: GraphLayout` ドキュメント）、セッションがそれを所有する（`KnowledgeGraphSession.ts:277` で破棄）。`D3ForceLayout` は d3 が入力をミューテートするため `simNodes`（`D3ForceLayout.ts:71`）にクローンする; `VectoForceLayout` は f32 SoA（`VectoForceLayout.ts:88` `positions/vx/vy/vz/fx/fy/fz`）を保持し呼び出し元ノードを決してミューテートしない。`Graph3D.applyPositions` は `positions.length < count*3` で一度だけの警告（`Graph3D.ts:162` `hasWarnedShortPositions`、`Graph3D.ts:100` でリセット）で短絡する。そうしなければ NaN インスタンス行列を書き、メッシュ全体がフラスタムカリングされる。

## 2. ノードエディタ — ドキュメント、コマンド、選択

### 2.1 ドキュメントモデル

`NodeDocument` は `packages/node-editor/src/model.ts:54` で `{ nodes: NodeData[], links: LinkData[] }` であり、不変な変換を持つ（`model.ts:78` の `cloneDocument`、`data` マップ用の `model.ts:64` の `deepCloneValue`、`model.ts:93` の `updateNodePosition`）。`NodeData` は `position`、任意の `width`／`height`、`ports: PortDefinition[]`（`model.ts:8` で `direction`、`dataType`、`maxConnections` を持つ）、`data` を持つ; `LinkData` は `source`／`target` ＋ ポート id を持つ（`model.ts:27`）。

`validateLink` は `model.ts:126` で source／target 存在、`same-node` 自己ループ拒否、`duplicate-link-id`、ポート存在 ＋ 方向（`output`→`input`）、`dataType` 上の `incompatible-types`、有向エンドポイントペア上の `duplicate-link`、`maxConnections`（`model.ts:152`）経由の `target-port-occupied` をチェックする。複数ノードに跨るサイクルは**許可される** — ドキュメントはユーザー作成フローである（`model.ts:117` ドキュメント）。`addLink`／`removeLink`／`removeNode` は `model.ts:163` でそれを強制する; `model.ts:178` の `removeNode` は参照的に有効なままであるよう入射リンクを削除する。

### 2.2 履歴と選択

`CommandHistory` は `packages/node-editor/src/history.ts:9` で教科書的な undo／redo である: `execute(label, after)` は `cloneDocument` 経由で `before`／`after` をスナップショットし、`undoStack` に push し、`redoStack` をクリアする（`history.ts:28`）、`undo()`／`redo()` は `current` を交換する（`history.ts:40`）。すべての `NodeEditor` ミューテーションはこの単一ゲートを通るため、すべてのユーザーアクションは 1 つの履歴エントリである。

`SelectionState` は `packages/node-editor/src/selection.ts:9` で `ids: Set<string>` を `select(id, additive)`（`selection.ts:22`）、`clear()`、`list()` スナップショット、そして現在のドラッグ用の transient `drag: DragState | null`（`selection.ts:11`）とともに追跡する。`layoutDocument` は `packages/node-editor/src/layout.ts:14` で決定論的な階層レイアウトである: コンポーネント DAG 上の Tarjan SCC（`layout.ts:96` `stronglyConnectedComponents`）、Kahn トポロジカルランク割り当て（`layout.ts:54`）、その後 `x = originX + rank*horizontalGap`、`y = originY + index*verticalGap`（`layout.ts:85`）。id とターゲットをソートすることで決定論的になる（`layout.ts:18`／`layout.ts:27`）。

### 2.3 NodeEditor Entity 構成

`NodeEditor` は `packages/node-editor/src/editor.ts:199` で `Entity`（デフォルトは `width 1000, height 700` は `editor.ts:214`）を拡張し、`selection`、`history: CommandHistory`（`editor.ts:201`）、`nodeEntities`／`linkEntities` マップ（`editor.ts:202`）、`status: StatusAnnouncer`（`editor.ts:204`）、そして transient `dragDocument`／`connection`／`connectionPoint`（`editor.ts:205`）を所有する。子は `NodeCard`（`editor.ts:143`）、`LinkEntity`（`editor.ts:119`）、`PortEntity`（`editor.ts:51`）、`StatusAnnouncer`（`editor.ts:29`）である。

- `NodeCard` は `editor.ts:143` で `UIComponent` でありカードクロームを持ち、`PortEntity` の子を所有し（`editor.ts:162`）、`selection.has`（`editor.ts:174`）経由でロービング `tabIndex` を伴う `role="button"` を宣伝し、`pointerdown/move/up` を `editor.beginDrag/moveDrag/endDrag`（`editor.ts:155`）にルーティングする。
- `PortEntity` は `editor.ts:51` で 12px の円（`editor.ts:20`）であり、出力ポートは右寄せ（`editor.ts:62`）、pointerdown を `editor.beginConnection`（`editor.ts:66`）にルーティングし、`KeyboardEvent` 由来を持つ `click` を `editor.portActivated`（`editor.ts:90` — ポインタキャプチャからブラウザ合成されたクリックを除外）にルーティングする。
- `LinkEntity` は `editor.ts:119` でライブな `nodeEntities` 位置を読み取る source→target ラインを描画する（`editor.ts:136`）。
- `StatusAnnouncer` は `editor.ts:29` で不可視な `role="status"` ライブリージョン（`aria-live polite`、`editor.ts:40`）であり、キーボード専用の接続状態用（見るべきラバー線がない）。

編集操作:

- ドラッグ: `beginDrag` は `editor.ts:406` で `cloneDocument` 経由で `dragDocument` をスナップショットし、`selection.drag` を origins とともに設定する。`moveDrag` は `editor.ts:421` でホットパスである: **インプレースで** `node.position` をミューテートしカードで `setPosition` する、移動ごとのクローンなし — `LinkEntity` は同じ `nodeEntities` マップを読むためリンクは再構築なしで追従する（`editor.ts:427` コメント）。`endDrag` は `editor.ts:441` で前後の JSON を比較し 1 つの `'Move node'` エントリを push する; `cancelDrag` は `editor.ts:452` で `dragDocument` からの `applyPreview` 経由でロールバックする。
- 接続: `beginConnection`／`moveConnection`／`endConnection` は `editor.ts:282` でラバー線を扱う; `portActivated` は `editor.ts:297` で WCAG 2.1.1 対応である — 出力ポートは保留中の接続を武装する（ラバーポイントなし、`editor.ts:307` で `status.say` 経由でアナウンスする）、入力ポートは `commitLink`（`editor.ts:334`）経由でコミットする。`commitLink` は `link:id = link:<src>:<port>:<tgt>:<port>`（`editor.ts:337`）を構築し `createLink`（`editor.ts:380` は履歴を通じて `addLink` を push する）を呼ぶ。`handleKeyDown` は `editor.ts:459` で `Escape` を両ジェスチャのキャンセルに、`Ctrl/Cmd+Z/Y` を undo／redo に（`editor.ts:474` で最初に transient ジェスチャをキャンセルする）、`Delete/Backspace` を `deleteNodes(selection.list())`（`editor.ts:480`）にマップする。
- 自動レイアウト: `applyAutoLayout` は `editor.ts:274` で `layoutDocument` を実行し、変更されたときに 1 つの `'Auto-layout'` エントリを push する（`editor.ts:277`）。

`packages/node-editor/src/persistence.ts:168` での永続化は `exportDocument(document) -> string`（`persistence.ts:169` で最初に検証し、`persistence.ts:171` で `schemaVersion: 1` でラップし、`persistence.ts:164` で `JSON.parse(JSON.stringify(...))` 経由の `cloneJson`）と `persistence.ts:178` での `importDocument(serialized)`（パースし、`persistence.ts:186` で `schemaVersion` をチェックし、その後 `persistence.ts:84` の `validateDocument` — 構造チェックに加え `persistence.ts:156` で各リンクを検証前にセットから取り除くセマンティックパスを伴う `validateLink`。そのため容量一杯の正当なリンクが自身の占有テストで誤って失敗しない）である。非有限な位置、重複 id／ポート、欠損ポート参照、誤った `direction`、`dataType` ミスマッチを拒否する（`persistence.ts:70`）。`NodeEditorPersistenceError` は `persistence.ts:24` で失敗契約である。`isJsonValue` は `persistence.ts:41` で `data` マップの JSON セーフなサイクル（`persistence.ts:45` の `WeakSet`）、非有限数（`persistence.ts:43`）、シンボルキー（`persistence.ts:50`）をガードするため、永続化された `NodeDocument` は `JSON.stringify` を通じてロスレスにラウンドトリップする — `data` 内のあらゆる `Map`／`Set`／`Date` はエクスポート前にプレーン JSON にシリアライズしなければならない。

### 2.4 このバーティカルでの既知の罠

レビューで実際に時間を要したエディタ固有の落とし穴（`packages/node-editor/src/editor.ts` 内のインラインコメントを参照）:

- **ポインタ由来フィルタ** — `editor.ts:90` の `PortEntity` クリックハンドラは `nativeEvent instanceof KeyboardEvent` でゲートする。core も同じミラー上のネイティブブラウザクリックに対して `click` を合成するためである（ポインタキャプチャが解放された connect ドラッグをそれに再ターゲットする）。フィルタなしでは、解放された connect が完了と保留中のキーボード接続の再武装の両方を行う。
- **ドラッグエイリアシング** — `moveDrag` は `documentState` 自身のノードオブジェクトをミューテートする（`editor.ts:427`「`cloneDocument` 経由で自身のノードオブジェクトを所有する」）ため、インプレース編集が履歴スナップショットにエイリアスできない; `dragDocument`（`editor.ts:411` でのドラッグ前クローン）は `cancelDrag` 用にクリーンなままである。
- **履歴汚染** — `endDrag` は JSON が変わったときのみ push する（`editor.ts:445` `JSON.stringify(before) !== JSON.stringify(current)`）、`applyAutoLayout` も同様（`editor.ts:276`）。さもなければ no-op ドラッグが何もしないが redo スタックをずらす undo エントリを追加する。
- **Transient ジェスチャスコープ** — `editor.ts:390` の `deleteNodes` と `editor.ts:474` の `Ctrl+Z/Y` パスの両方が、履歴を変更する前に保留中の `connection`／`drag` をキャンセルするため、履歴コマンドは半分移動したノードではなく真のドキュメントを見る。

## 3. デスクトップシェル — Scene 上のウィンドウマネージャ

### 3.1 シェルとレイアウト

`DesktopShell` は `packages/desktop/src/DesktopShell.ts:87` でトップレベルのホストである（壁紙 ＋ `DisplayLayout` ＋ `WindowManager` ＋ `Taskbar`／`StartMenu` ＋ `ShortcutRouter`）。コンストラクタは `DesktopShell.ts:105` で設定を解決し（`resolveConfig`）、`AppRegistry` を登録し（`DesktopShell.ts:108`）、`DisplayLayout`（`DesktopShell.ts:116`）、`WindowManager`（`DesktopShell.ts:124`）、`Wallpaper`（`DesktopShell.ts:133`）、`ShortcutRouter`（`DesktopShell.ts:140`）を構築する。`Wallpaper` は `DesktopShell.ts:17` で非インタラクティブなカバー画像であり `a11yProjection never`（`DesktopShell.ts:26`）である。

`start()` は `DesktopShell.ts:152` で冪等である: 壁紙を追加し、レイアウトを同期し、タスクバーをマウントし、Kickoff 解放と Escape 用にショートカットとドキュメントレベルの `pointerdown`／`keydown` をアタッチする（`DesktopShell.ts:143`）。`syncLayoutToScene`／`resize` は `DesktopShell.ts:171` でライブな `scene.width/height` を読み（リサイズバスなし）、壁紙 ＋ タスクバー配置を更新する。`setTheme` は `DesktopShell.ts:204` でトークンを交換し、`WindowChrome` を交換し、タスクバーを再マウントする。

`DisplayLayout` は `packages/desktop/src/DisplayLayout.ts:15` で論理ディスプレイを和集合にマップし、タスクバーストリップを差し引いて `workArea`（`DisplayLayout.ts:50`）、壁紙用の `bounds()`（`DisplayLayout.ts:60`）、点クエリ `displayAt`（`DisplayLayout.ts:80`）、ウィンドウ配置用の `clampRect`（`DisplayLayout.ts:89`）、単一ディスプレイ再利用用の `updateSceneSize`（`DisplayLayout.ts:105`）を得る。

### 3.2 WindowManager — open／focus／close／z-order

`WindowManager` は `packages/desktop/src/WindowManager.ts:65` で `DesktopWindow[]`（`WindowManager.ts:71`）、`focused`（`WindowManager.ts:72`）、`cascade`／`seq`（`WindowManager.ts:73`）、ダイアログスタック `dialogOrder`／`dialogPrevFocus`（`WindowManager.ts:77`）を所有する。メソッド:

- `open(appId, opts)` は `WindowManager.ts:126` で `instances: 'single'|'multiple'`（`WindowManager.ts:132` — `forceNew` でない限り既存にフォーカス）を強制し、`(cascade % 8)*28` でカスケードし（`WindowManager.ts:144`）、`layout.clampRect`（`WindowManager.ts:149`）経由でクランプし、`windowId = appId-seq`（`WindowManager.ts:151`）を割り当て、`DesktopWindow` を作成し（`WindowManager.ts:152`）、`scene.showOverlay`（`WindowManager.ts:170`）、そして `focus`（`WindowManager.ts:172`）。
- `openDialog(opts)` は `WindowManager.ts:184` でレジストリフリーである: close のみのクローム、タスクバーから除外（`Taskbar.ts:159`）、モダリティ保持されたフォーカス（`WindowManager.ts:238`）、デフォルトで中央配置（`WindowManager.ts:191`）、最上位の `dismissible` ダイアログ用に `Escape` をトラップする `onDocKeyDown`（`WindowManager.ts:329`）を持つ。
- `focus` は `WindowManager.ts:233` でモーダルダイアログが最上位のときに再フォーカスをブロックし（`WindowManager.ts:237`）、`requestA11yProjection`／`releaseA11yProjection`（`WindowManager.ts:248`／`WindowManager.ts:253`）経由で a11y を復元／解除し、`Entity.remove` なしで `restack` する（`WindowManager.ts:339` — `overlayRoot.children` を splice ＋ `markStructureChanged` してドライバをスラッシングしない）。
- `close` は `WindowManager.ts:258` で splice し、オーバーレイを隠し、`win.destroy()` し、`dialogPrevFocus`（`WindowManager.ts:281`）を復元し、逆順で次の可視ウィンドウを選ぶ（`WindowManager.ts:278`）。
- `cycleFocus(backward)` は `WindowManager.ts:297`、`topModal()` は `WindowManager.ts:311`。

`on(listener)`（`WindowManager.ts:116`）経由のリスナーは `open/close/focus/state` を emit する。

### 3.3 DesktopWindow — クロームとインタラクション

`DesktopWindow` は `packages/desktop/src/Window.ts:158` で `UIComponent` であり `a11yProjection onDemand`（`Window.ts:228`）と `pointerEvents none` ダイアログミラー（`Window.ts:400`）を持つ。構造: `Card shell` ＋ `Card titlebar` ＋ `Text titleLabel` ＋ `TitlebarDragHandle` ＋ 3 つの `Button` クローム（`Window.ts:361` の `makeChromeBtn` 経由で `close/max/min`）＋ `ResizeGrips` ＋ `ClientHost`（`Window.ts:79` 不可視クリッピングホスト）＋ `app.create(ctx)`（`Window.ts:340`）からの `content`。`WindowChrome`（`Window.ts:8`）経由のクロームはトークンから（`DesktopShell.ts:411` `resolveChrome`）。

- ジオメトリ: `applyGeom` は `Window.ts:507` で `minWidth/minHeight`（`Window.ts:498` `max(chrome, app)`）にクランプし、shell／titlebar／clientHost をサイズ設定し、クロームボタンとドラッグハンドルを再配置し（`Window.ts:524` `chromeBtnStripWidth`）、`layoutClientContent` は `content.width/height` を引き伸ばす（`Window.ts:538`）。
- タイトルバードラッグ: `TitlebarDragHandle` は `Window.ts:133` で専用のインタラクティブ `UIComponent`（`role button, label Move window`、`tabIndex 0`）であり、ヒットターゲットが存在するよう eager a11y を持つ。ダイアログ全体をピンせずに済む（`Window.ts:282`）。`beginTitlebarDrag` は `Window.ts:589` で最大化時にドラッグで復元を扱い（`Window.ts:594`）、`handleMoveKey` は `Window.ts:670` で `ArrowLeft/Right/Up/Down` を `Shift=1px`（`Window.ts:671`）でマップし、`clampMovePosition` はタイトルバーを work area 内に保つ（`Window.ts:700`）。
- リサイズ: `hitResizeEdge` は `Window.ts:553` で 6px リムを持ち、`handleResizePointerDown` は `Window.ts:615`（子は自身のヒットを所有し、client host は `isPointInside false` であるためリムのみがここに到達する）、`applyResize` は `Window.ts:707` でエッジごとに min クランプと work-area クリッピングを伴い、ドキュメントレベルキャプチャは `Window.ts:638` の `attachDocPointers` 経由。
- 状態: `maximize`／`restore`／`toggleMaximize` は `Window.ts:433`、`minimize`／`restoreFromMinimized` は `Window.ts:468`（opacity 0 ＋ `interactive false` ＋ `a11yHidden true`）、`setGeometry` は `Window.ts:488`。
- フォーカスリング: `setFocused` は `Window.ts:404` で `shell.border` を `focusRing` に交換する; `updateChrome` は `Window.ts:411` でマージする。

`Taskbar` は `packages/desktop/src/Taskbar.ts:36` で Plasma 風バーである: `Card bar` ＋ 54px `Start` ボタン（`Taskbar.ts:73`）、`Text clockLabel`（`Taskbar.ts:94`、分 tick にスロットルされる `Taskbar.ts:127`）、`EntriesHost`（`Taskbar.ts:103` クリップされたホスト）、`entryButtons: Map<DesktopWindow, Button>`（`Taskbar.ts:47`）、`wm.on(() => rebuild)`（`Taskbar.ts:120`）。`rebuild()` は `Taskbar.ts:157` でダイアログをフィルタし（`Taskbar.ts:159`）、ウィンドウをキーとするボタンをプールし（`Taskbar.ts:171`）、ライブな `selected` バインディングで eager a11y（`Taskbar.ts:194`）、`EntriesHost.width`（`Taskbar.ts:207`）で上限付けし、アクティブ時のクリックは最小化する（`Taskbar.ts:220`）。

`StartMenu` は `packages/desktop/src/StartMenu.ts:42`（Kickoff）で `240px` `Card` パネル（`StartMenu.ts:67`）でありアプリごとに 1 つの `Button`（`StartMenu.ts:92`）、`startMenuHeight` ヘルパーは `StartMenu.ts:31` で `DesktopShell` と共有され事前配置用（そのためシェルフ ＋ メニューは乖離できない、`DesktopShell.ts:303`）。Shell は `scene.showOverlay` ＋ `requestA11yProjection`（`DesktopShell.ts:330`）経由でそれを表示し、タスクバー位置で境界付ける（`DesktopShell.ts:305`）。

## 4. テーブル — Text 上の仮想化グリッド

### 4.1 構築契約

`Table` は `packages/table/src/Table.ts:144` で `UIComponent` を拡張する。構築はすべての入力を正規化する: `normalizeColumnWidths`（`Table.ts:789`）は `width` にスケールする（欠損／無効時は等分割）、`normalizeColumnAlign`（`Table.ts:779`）はデフォルト `left`、`normalizeCell`／`normalizeRow`（`Table.ts:810`）は短い行を `''` でパディングし、長いものを切り詰め（`Table.ts:806` ドキュメント）、`createTextCell`（`Table.ts:921` — ヘッダー用は `bold`、`selectable` はオプションから）経由で文字列ごとに 1 つの `Text` を作成し、重複 `Entity` セルを `seenCells`（`Table.ts:228`）経由で拒否する。`CELL_PADDING_PX = 12` は `Table.ts:142` で `fitCell` ラップ幅（`Table.ts:935` `maxWidth = colWidths[col] - 2*CELL_PADDING`）と `cellX` アラインメントインセット（`Table.ts:767`）で共有される。

仮想化オプトイン: `viewportHeight` は `Table.ts:50`。`virtualized`（`Table.ts:177` `viewportHeight>0`）のときボディセルはウィンドウ具体化まで `null` である（`Table.ts:256` `bodyCells = rows.map(() => null)`、`reserveRowEntities` は `Table.ts:822` で `Entity` セルを eager に検証する）、`TableBodyClip` Entity（`Table.ts:261` `clipChildren true`）がボディを所有し、ヘッダーは直接ピンされたまま、`bindScroll` は `Table.ts:282` で `wheel` ＋ `pointerdown/move` ドラッグ to スクロールをインストールする。

### 4.2 レイアウトと仮想化

`layout()` は `Table.ts:987` で `headerHeight` をフィットされた `headerCells` から再計算し、`cellX`（`Table.ts:999`）経由でそれらを配置し、その後分岐する:

- 仮想化: 行ごとに固定 `rowHeights = baseRowHeight`（`Table.ts:1009`）のため `scroll↔row-index` は $O(1)$（`Table.ts:1004` コメント — すべての行を歩くと $O(rows)$ になりウィンドウを台無しにする）、`bodyClip` を `viewportHeight - headerHeight`（`Table.ts:1013`）にサイズ設定し、ボディセル同期を `reconcileVirtualRows`（`Table.ts:392`）に遅延させる。`reconcileVirtualRows` は正確に `[first, last]` 行をマウントする。`first = floor(scrollY/rh) - overscan`（`Table.ts:397`）かつ `last = ceil((scrollY+bodyViewport)/rh) + overscan -1`（`Table.ts:404`）— 旧来の `+overscan` より不可視な余分な 1 行を少なく数える。
- クラシック: 行ごとに `rowHeights` を計測し（`Table.ts:1042`）、`rowTops` prefix 和を構築し（`Table.ts:1053` `rebuildRowTops`）、すべての行を配置する（`Table.ts:1056`）。

`Table.ts:352` `update(dt)` でのスクロール統合は dt 対応の指数積分器である（`VirtualList`／`Tree` を反映）: `velY += diff*7.2*(dt/1000)` ＋ `velY *= exp(-dt/84)`（`Table.ts:361`）、閾値 `0.05`（`Table.ts:363`）、`hasPendingAnimations` は `Table.ts:378` にあり `onDemand` がスクロール途中で決してアイドルにならないようにする（`Table.ts:378` ドキュメント）。

`appendRows` は `Table.ts:885` で設計上 append 専用である: `rows` ＋ `bodyCells` に push し（仮想化モードでは `Table.ts:895` で `Entity` セルを予約する）、その後 `layout()` がリフローし `_syncGridA11y` が再プールする — 成長時に `detachA11y` やタブストップ無効化なし（`Table.ts:870` ドキュメント）。

### 4.3 グリッド a11y — プールされた行／セルホットスポット

`RowHotspot` は `Table.ts:55` で透過的な構造 `role="row"` コンテナ（`pointerEvents none`、`Table.ts:70`、`Table.ts:65` の `layoutControlledProperties`）である。`GridCellHotspot` は `Table.ts:82` で `isGridTabStop`（`Table.ts:473`）経由でロービング `tabIndex` を持つフォーカス可能な `role gridcell|columnheader`（`Table.ts:111`）、下の選択可能なテキストがポインタを所有するよう `pointerEvents none`（`Table.ts:119`）、`handleGridKey`（`Table.ts:91`）に転送する `keydown` を持つ。

`_syncGridA11y()` は `Table.ts:624` で ARIA グリッドを投影する: 列ごとに `columnheader` ホットスポット（`Table.ts:630`）を持つ 1 つのピンされた `headerRow` に加え、`need = last-first+1`（`Table.ts:691`）に合わせて増減されるプールされた `bodyRowPool: { row, cells }[]`（`Table.ts:199`）、それぞれ列ごとに `GridCellHotspot` を `bind(rowIndex,colIndex,label)`（`Table.ts:95`）経由で再バインドする。プールエントリはモードが変わるときに `Table` と `bodyClip` の間で再親化される（`Table.ts:713`）。`Table.ts:412`／`Table.ts:668` での再アンカープロトコルは、フォーカスされた行がスクロールアウトしたときにロービングストップを保持する: `pendingFocusReanchor` ＋ `reanchorRestoreFocus` は `activeCellHoldsFocus`（`Table.ts:592` は `document.activeElement` vs `scene.getA11yElement` をチェック）経由で、アンマウントされたセルが本当に DOM フォーカスを保持していたときのみフォーカスを復元する — 決して奪わない。

キーボードモデル: `handleGridKey` は `Table.ts:490`（Arrow、`Home`／`End`、`Ctrl+Home/End` で端へ、`Table.ts:548` の `pageRows()` による `PageUp/PageDown`）、`_focusCell` は `Table.ts:560` で行をビューにスクロールし（`Table.ts:603` の `_scrollRowIntoView`）、ホットスポットを `focus()` し、`tabIndex` がバインドされる前に再アンカーする。

## 5. バーティカルがどのようにプリミティブを合成するか

| バーティカル       | プリミティブスタック                                                                                                                                  | 主要な file:line 境界                                                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ナレッジグラフ** | `@vectojs/graph3d` レイアウト契約 ＋ Barnes-Hut 3D／2D ＋ `Graph3D`／`GraphCamera`／`GraphInteraction`                                                | `KnowledgeGraphModel.ts:62` モデル、`FixedZLayout.ts:22` アダプタ、`KnowledgeGraphSession.ts:67` 配線、`Graph3D.ts:28` レンダラー、`GraphLayout.ts:12` 契約                   |
| **ノードエディタ** | `CommandHistory` スナップショット ＋ `SelectionState` ＋ `layoutDocument` SCC ＋ `Entity`／`UIComponent` ツリー ＋ `StatusAnnouncer` ライブリージョン | `model.ts:54` ドキュメント、`history.ts:9` 履歴、`selection.ts:9` 選択、`layout.ts:14` 自動レイアウト、`editor.ts:199` エディタ、`editor.ts:51` ポート                        |
| **デスクトップ**   | `Scene` オーバーレイ ＋ `DisplayLayout` ワークエリア ＋ `WindowManager` z-order ＋ `DesktopWindow` クローム ＋ `Taskbar`／`StartMenu`                 | `DesktopShell.ts:87` シェル、`DisplayLayout.ts:15` ディスプレイ、`WindowManager.ts:65` WM、`Window.ts:158` ウィンドウ、`Taskbar.ts:36` タスクバー、`StartMenu.ts:42` メニュー |
| **テーブル**       | `Text` セル ＋ `RowHotspot`／`GridCellHotspot` a11y プール ＋ `TableBodyClip` ＋ 指数スクロール積分器                                                 | `Table.ts:144` テーブル、`Table.ts:55` 行、`Table.ts:82` セル、`Table.ts:392` reconcile、`Table.ts:624` a11y 同期、`Table.ts:352` スクロール                                  |

各バーティカルはプリミティブを借用し、自身が構築したものだけを破棄する（`KnowledgeGraphModel.ts:230` のモデル借用レイアウト、`KnowledgeGraphSession.ts:277` のセッション所有レイアウト; エディタは履歴／選択を所有する; シェルは WM／レイアウト／タスクバー／壁紙を所有する）。

## 5a. デスクトップ深掘り — レジストリ、VFS、ショートカット、クローム

`AppRegistry` は `packages/desktop/src/AppRegistry.ts:1` で `ResolvedWebosConfig.apps` 上の薄い `Map<id, AppDefinition>` であり `get(id)`、`list()`、`has(id)` を持つ — WM の `open` ゲートは `WindowManager.ts:128` でミスしたときに `unknown app id` を throw する。`AppDefinition` は `packages/desktop/src/types.ts:1` で `id`、`title`、`icon`／`iconSvg`、`create(ctx: AppContext) -> Entity`、`instances: 'single'|'multiple'`、`defaultWidth/Height`、`minWidth/Height`、そして `StartMenu` で使われるカテゴリメタデータを担う。

`Vfs` は `packages/desktop/src/Vfs.ts:1` で `AppContext.vfs` を通じてすべての `create()` 呼び出しに渡される任意のインメモリファイルサーフェスである — ファイルピッカーやドライブビューを必要とするアプリはそれにバインドし、`WindowManager` は同じインスタンスをすべての `DesktopWindow` にスレッドする（`WindowManager.ts:86`）。`resolveConfig` は `packages/desktop/src/resolveConfig.ts:1` でユーザー `WebosConfig` を `ResolvedWebosConfig`（desktop、displays、theme、apps、shortcuts、vfs）にデフォルトの `taskbarHeight`／`taskbarPosition`／`wallpaper`（`resolveConfig.ts:12`）とともにマージする。

`ShortcutRouter` は `packages/desktop/src/ShortcutRouter.ts:1` で正規化された `Map` 経由で `chord -> ShortcutAction`（`types.ts:1` `open-app | close-focused | toggle-start | custom`）をマップし、`ShortcutRouter.ts:30` で `attach()`／`detach()` が `DesktopShell` が `start()`（`DesktopShell.ts:158` `shortcuts.attach()`）で有効化する単一の `keydown` リスナーをバインドする。`dispatchShortcut` は `DesktopShell.ts:344` で `action.type` で switch する — `open-app` は `windowManager.open(action.appId)`（`DesktopShell.ts:347`）を呼び、`close-focused` は `closeFocused()`（`DesktopShell.ts:350`）を呼び、`toggle-start` は Kickoff を反転し（`DesktopShell.ts:353`）、`custom` は `onCustomShortcut`（`DesktopShell.ts:356`）にフォワードする。

`icon.ts:1` は `WINDOW_ICONS` SVG 文字列（close／maximize／minimize）と `addButtonIcon(button, svg, size, color)`（`icon.ts:12`）を保持し、ボタンのラベルにアイコンを注入する — `Window.makeChromeBtn` は `Window.ts:380`、`Taskbar.rebuild` は `Taskbar.ts:185` で 16 にスケールされた `chrome.fg` 付きのウィンドウごとのアプリアイコン用に使われる。

`DesktopShell` のクローム解決は `DesktopShell.ts:411` `resolveChrome` でテーマトークンを `WindowChrome`（`Window.ts:8`）に `str()`／`num()` ヘルパー（`DesktopShell.ts:401`）でマップする — `windowBg`、`windowBorder`、`titlebarBg/Fg`、`titlebarHeight`、`closeBg/Fg`、`focusRing`、`radius`、`resizeHandle`、`minWidth/Height` — そのためトークンのリネームが静かに `undefined` にフォールバックできない（両サイトとも完全な `resolveChrome` オブジェクトを渡す、`Window.ts:414` で注記）。`Taskbar` クロームは `Taskbar.ts:7` `TaskbarChrome`、`StartMenu` クロームは `StartMenu.ts:6` `StartMenuChrome` で同じトークンスレッディングに従う。

## 5a. デスクトップ深掘り — 続き: タスクバーライフサイクルとスタートメニュー所有

`Taskbar` は `Taskbar.ts:36` でウィンドウごとのエントリボタンを `Map<DesktopWindow, Button>`（`Taskbar.ts:47`）でプールし、すべての `wm.on('open'|'close'|'focus'|'state')`（`WindowManager.ts:116` → `Taskbar.ts:120`）で再構築する。ダイアログウィンドウは明示的にフィルタされる（`Taskbar.ts:159` `!w.isDialog`）ため `openDialog` は決してタスクエントリとして現れない。各エントリは `maxW 160`（`Taskbar.ts:162`）で上限付けされ、`addButtonIcon`（`Taskbar.ts:185` `16`px、`chrome.fg`）経由でアプリアイコンを持ち、`EntriesHost`（`Taskbar.ts:103` `clipChildren true`）配下に存在するためオーバーフローは時計ラベル（`Taskbar.ts:106` コメント）の前にクリップされる。アクティブな（フォーカスされ最小化されていない）エントリをクリックすると最小化し（`Taskbar.ts:220` `win.minimize()`）、そうでなければフォーカスする（`Taskbar.ts:224` `wm.focus`）。

`StartMenu` は `StartMenu.ts:42` で `scene.showOverlay` ＋ `requestA11yProjection`（`DesktopShell.ts:330`）経由で表示され、`DesktopShell.ts:361` `handleOutsidePointer`（`DesktopShell.ts:366` で `scene.clientToScene` を使用）を使ったボックス外の `pointerdown`、`keydown Escape`（`DesktopShell.ts:144` `onDocKeyDown`）、または Start ボタンの再クリック（トグル）で解散される。`startMenuHeight` は `StartMenu.ts:31` でシェル側の事前配置（`DesktopShell.ts:303` `estH`）とメニュー自身の高さ（`StartMenu.ts:58`）の両方の唯一の真実の源であるため、両者は乖離できない。シェルの `toggleStartMenu`（`DesktopShell.ts:196`）と `closeStartMenu`／`openStartMenu`（`DesktopShell.ts:335`／`DesktopShell.ts:294`）が唯一の呼び出し元である — バーティカルはこのペアを統合せずに第二のメニュー所有者を追加してはならない。

## 5b. テーブル深掘り — 幅、Entity セル、クローム

`setWidth(width)` は `packages/table/src/Table.ts:963` で `colWidths` を等分割で再分割するのではなく比例的に再スケールする（`Table.ts:972` `colWidths.map(c => c/total*next)`）— 呼び出し元提供の `colWidths` 比率はリサイズを越えて生存する。その後 `layout()` が呼ばれなければならない（`Table.ts:975` で `return this.layout()` 経由でチェーンされる）。`colWidths` は `fitCell` ラップ幅（`Table.ts:935`）、`cellX` アラインメント（`Table.ts:767`）、すべての子 `x`（`Table.ts:999`／`Table.ts:1062`）の源であるためである。

Entity セル（文字列ではない）は `Table.ts:910` `normalizeCell` と `Table.ts:822` `reserveRowEntities` で `seenCells: Set<Entity>`（`Table.ts:228`）により重複インスタンスを eager に拒否して受け入れられる — 仮想化モードで `Text` 構築が `reconcileVirtualRows`（`Table.ts:392`）に遅延される場合でも、`Entity` 同一性チェックは append 時（`Table.ts:895`）に実行されるため `Entity.add` がセルの元のスロットから静かに再親化することは決してない。`setCellSelectable` は `Table.ts:930`、`fitCell` は `Table.ts:935` で 2 つのセルごとの機能プローブである（`Table.ts:5` の `SizableCell`／`SelectableCell` インターフェース）。

`getContentProjection() -> null` は `Table.ts:1097` で `Table` が子のテキストを決して複製しないことを宣言する — セル `Text` Entity が自身の投影を所有するため、テーブル自身の a11y ロール（`Table.ts:1088` の `getA11yAttributes` `role grid, label "Data table with N cols and M rows", pointerEvents none`）は純粋に構造的である。`Table.ts:1101` `render(r)` でのクローム描画は `roundRect` fill（`Table.ts:1103`）、ヘッダー fill（`Table.ts:1107`）、列ディバイダ（`Table.ts:1114`）、行セパレータ（仮想化では `Table.ts:1124` で `[first,last)` ビューポート相対、クラシックでは `Table.ts:1139` で `rowHeights` 上）、外側ボーダー（`Table.ts:1150`）を描画する。

`GraphCamera` は `packages/graph3d/src/GraphCamera.ts:1` で `mode: '2d'|'3d'` 切り替え、`domElement` バインディング、`setSize`／`fitToPositions`（`KnowledgeGraphSession.ts:191` でブートストラップ後に呼ぶ）、インタラクションの `setControlsEnabled` ゲート（`KnowledgeGraphSession.ts:132`）用の `setEnabled` を持つ `THREE.PerspectiveCamera | OrthographicCamera` をラップする。`Graph3D.pickNode` は `packages/graph3d/src/Graph3D.ts:246` で `GraphInteraction.pick` が `GraphInteraction.ts:168` で NDC から構築する `raycaster.intersectObject(nodeMesh)` パスである。

### 4.4 VectoForceLayout と D3ForceLayout のどちらを選ぶか

`packages/graph3d/src/layout/` にある 2 つの `GraphLayout` 実装は `setGraph`／`step`／`positions`／`pinNode`／`reheat` を共有するが感触は異なる: `VectoForceLayout` は `VectoForceLayout.ts:68` で明示的な `repulsion * alpha` ＋ リンクバネ ＋ `centerStrength` ＋ `velocityDecay` tick（`VectoForceLayout.ts:233` 6 フェーズ）を持つ自前の Barnes-Hut 八分木である; `D3ForceLayout` は `D3ForceLayout.ts:37` で `d3-force-3d` アダプタ（`forceSimulation(…,3).force('link', forceLink).force('charge', forceManyBody).force('center', forceCenter)` は `D3ForceLayout.ts:88`、`chargeStrength -30` デフォルトは `D3ForceLayout.ts:16`）である。seed された決定性と不可視 WASM アクセラレータ（`VectoForceLayout.ts:108` `forceBackend` は `enableWasmForce` は `VectoForceLayout.ts:196` ストリーミング vs `enableWasmForceSync` は `VectoForceLayout.ts:209` バイト）には `VectoForce` を、感触がすでにチューニングされた既存 `3d-force-graph` シーンを移行するときは `D3Force` を選ぶ — どちらも `GraphLayout` の背後で交換可能であるため `KnowledgeGraphSession` は関知しないままでいられる。

## 6. アプリの罠 vs エンジン欠陥 — forge 分割とドッグフーディングループ

`vectojs-docs/forge/findings/app-level-and-toolchain.md:1` は分割を明示的に名付ける: アプリレベルの所見はエンジン欠陥では**ない**が、診断に実コストがかかったため保持される。`forge/findings/README.md` テンプレートに加えエリアごとのインデックスが `app-level-and-toolchain` vs `core-*`／`simulation-*`／`text-*` をレビューで見間違えなくする — 曖昧なエントリはエンジントリアージに漂流し修復予算を浪費する。ステータスは append のみである（`app-level-and-toolchain.md:5`）、修正が出荷されたときに `Upstream status` が更新される（`app-level-and-toolchain.md:8`）。

代表的なアプリの罠（それぞれがバーティカル合成の教訓である）:

- **サンドボックス化 iframe の opaque origin**（`app-level-and-toolchain.md:30` 2026-07-16）: モチーフギャラリーの `sandbox="allow-scripts"` は `allow-same-origin` なしでは opaque origin を与える; ES-module ＋ `importmap` fetch は CORS になり、同一オリジン `./demo.js` は決してロードされない — 親コンソールエラーなしで空白になる。修正: `allow-scripts allow-same-origin` ＋ 実静的ルート `src`（`app-level-and-toolchain.md:51`）、`srcdoc` ではない（`about:srcdoc` に解決する、`app-level-and-toolchain.md:48`）。バーティカルへの教訓: 信頼されたファーストパーティ埋め込みは本物の origin を必要とする; 信頼されないコードは静かな iframe 属性変更ではなく別のサブドメインを必要とする。
- **canvas 数 ≠ 起動済み**（`app-level-and-toolchain.md:66`）: ホストが `querySelectorAll('canvas').length >= 2` をポーリングし、第二の WebGL ポイントレイヤー canvas が「準備完了」を意味すると仮定した — canvas2D デモと `ThreeAdapter`（DOM にないオフスクリーン `canvas`）は決して 2 に達しないため、「Loading…」オーバーレイが決して隠れなかった。修正: `canvas.width > 0` バッキングストアチェック（`app-level-and-toolchain.md:80`）。教訓: バーティカルの準備プローブは DOM canvas 数ではなくバッキングストアサイズをキーにしなければならない; バックエンド数は実装詳細である。
- **EPUB 画像パイプライン**（`app-level-and-toolchain.md:94` 2026-07-19 トリオ）: `body.textContent` は静かに `<img>`／SVG `<image>` を落とす（`app-level-and-toolchain.md:99`）ためマンガ EPUB は空にレンダリングされる; `escapeMarkdown` なしで補間された `alt` は `foo](javascript:…)` を `marked` 再パース経由でクリック可能なリンクにする（`app-level-and-toolchain.md:155`）; `data:image/jpeg;base64,…` は `[a-zA-Z0-9]+` でトークン化されるとすべての `+`／`/` で分割され ~20k トークンになり、base64 を数分間 gibberish としてタイプアウトする（`app-level-and-toolchain.md:185`）。修正: base64 `![alt](data:…)` ＋ `kind:"markdown"`（`app-level-and-toolchain.md:103`）を伴う再帰的 `xhtmlNodeToMarkdown`、`escapeMarkdown`（`app-level-and-toolchain.md:167`）、原子的な画像表示用の最初のトークナイザ選択肢としての `!\\[[^\\]]*\\]\\([^)]*\\)`（`app-level-and-toolchain.md:204`）。教訓: 再パースされるあらゆる抽出器はターゲット形式をエスケープしなければならず、タイプライタートークナイザは非テキスト原子オプトアウトを必要とする。
- **Lex 合体 ＋ `hasPendingAnimations`**（`app-level-and-toolchain.md:222`）: `MathMarkdown.appendMarkdown` はチャンクごとに `marked.lexer` を発火した（蓄積されたテキスト上で $O(n^2)$、`app-level-and-toolchain.md:236`）、`StreamReader` は `hasPendingAnimations()` を欠き、`update()` がゼロ文字を追加したときに `onDemand` シーンがストリーム途中でアイドルになった（`app-level-and-toolchain.md:246`）。修正: 飛行中最大 1 lex ＋ `docEpoch` 合体（`app-level-and-toolchain.md:254`）と `hasPendingAnimations() === status==="streaming"`（`app-level-and-toolchain.md:259`）。教訓: `update()` 内から dirty をマークするあらゆる Entity は `hasPendingAnimations` を必要とする。さもなければ `onDemand` は停滞する — `Table` はすでに `Table.ts:378` で持っている。
- **設定なしの CodeQL**（`app-level-and-toolchain.md:369` 2026-08-06）: `.github/workflows/codeql.yml` は `config-file` なしで `queries: security-and-quality` を渡したため、ベンダされた `packages/tex/src/kernel` が 19 アラートを点灯させた（KaTeX `replace("*","")` 内の 1 つの高深刻度誤検出を含む、`app-level-and-toolchain.md:375`）。修正: `kernel`／`glyphs` 用の `paths-ignore` を持つ `.github/codeql/codeql-config.yml`（`app-level-and-toolchain.md:384`）。
- **vendor-katex 順序**（`app-level-and-toolchain.md:337`）: `checkHandWritten()` は `src/kernel/` をクリアする `rmSync` の後に実行されたため、throw が `VENDORED.md` を欠損させたままにした; `--check` はそのパスで決して manifest を書かないため常に 16 行を spuriously に差分した（`app-level-and-toolchain.md:349`）。修正: 破壊的ステップの前に検証し、比較の前に manifest を書く（`app-level-and-toolchain.md:354`）。
- **`sideEffects: false` が tex レジストリを kill した**（`app-level-and-toolchain.md:404`）: `packages/tex/package.json` `sideEffects: false` により esbuild が KaTeX レジストリを投入する素の `import './x'` を落とした — `layout('x')` は `Got group of unknown type: 'mathord'` を throw した（`app-level-and-toolchain.md:407`）。スイートは `vitest` が `@vectojs/*` を `src/` にエイリアスし決して `dist/` をロードしないためグリーンのままだった（`app-level-and-toolchain.md:416`）。修正: `sideEffects: true` ＋ `glyphCodec.test.ts` での manifest アサーション（`app-level-and-toolchain.md:430`）。
- **Bun キャッシュ競合 ＋ wrangler フォールバック**（`app-level-and-toolchain.md:15` ＋ `:125`）: `bun install` は公開後に混合バージョン `dist` を提供した（`app-level-and-toolchain.md:17`）、`cloudflare/wrangler-action` フォールバック（`bun i wrangler@3.90.0`）はリポジトリが `wrangler` 依存を持たないときに tarball 抽出に失敗した（`app-level-and-toolchain.md:129`）。修正: `rm -rf node_modules && bun install --force`（`app-level-and-toolchain.md:24`）と `devDependency` として `wrangler` をピン留め（`app-level-and-toolchain.md:140`）。
- **リポジトリ衛生**（`app-level-and-toolchain.md:276` 2026-08-06）: コミットされた `node_modules` がクローンを 75 MB に膨らませ、4 つの古い ref によって保持された — `main` から到達可能な blob はない; 修正は ref 削除 ＋ `git gc --prune=now`（`app-level-and-toolchain.md:299`）、フレッシュクローン `.git` 75M→6.8M（`app-level-and-toolchain.md:324`）。
- **公開衛生**（`app-level-and-toolchain.md:447` 2026-08-15）: `packages/desktop/package.json` は CI が tarball からの `bun install` を probe しなかったため `dependencies` に `workspace:*` を出荷した（`app-level-and-toolchain.md:455`）。修正: `ui` に合わせて `peerDependencies` ＋ `devDependencies workspace:*` に移動（`app-level-and-toolchain.md:467`）。
- **ベンチマークランナーが tmp/ を復活させた**（`app-level-and-toolchain.md:518` 2026-08-24）: `runBenchmarkSuite()` の try の前の mkdir（`benchmarks/runner/runner.ts:323`）がすべての早期失敗の後に `tmp/benchmark-runner` を残した; 修正でスクラッチを `os.tmpdir()` に移動した（`app-level-and-toolchain.md:530`）。

ドッグフーディングループが円を閉じる: `vectojs-native/AGENTS.md` は `vectojs-native` を forge アプリのコンテナ（リポジトリではない）と宣言し、それぞれが兄弟 `<app>-docs/` で自己文書化しながらエンジン所見のみを `vectojs-docs/forge/findings/` に upstream する — まさに `AGENTS.md:18` が滲ませないよう警告する境界である。`references/` シャロークローンは読み取り専用（`AGENTS.md:28`）であり、サードパーティレイアウトを再利用するバーティカル（`ForceLayout2D` 上のナレッジグラフ、`Text` 上のテーブル）は消費サイトで乖離注記を記録する（例: `editor.ts:117` サイクル許容、`FixedZLayout.ts:18` ピン乖離）。ウェブサイト（`vectojs-website/`）は `scripts/sync-content.py`（`AGENTS.md:28` ドキュメントセクション）経由で `vectojs-docs/content/` を一方向に消費するため、ドキュメント専用の公開が権威あるソースを追い越すことはない — ハンドブックが `references/` の隣にあるときにバーティカルが必要とするのと同じ規律である。

## 7. バーティカル変更を着地させる前にチェックすべき罠

1. **借用レイアウトの破棄** — `KnowledgeGraphModel.dispose()` は借用レイアウトを破棄してはならない（`KnowledgeGraphModel.ts:230`）; `KnowledgeGraphSession.dispose()` は破棄しなければならない（`KnowledgeGraphSession.ts:277`）。一方を他方と交換するとリークまたは二重解放する。`attach(scene)` は `KnowledgeGraphSession.ts:153` で冪等であり、`KnowledgeGraphSession.ts:256` の `render(renderer, scene)` の前に呼ばれなければならない。さもなければ `call attach first` を throw する。
2. **カーソル古さ** — `MemoryDataSource` カーソルはバージョン付けされる（`MemoryDataSource.ts:118`）; `KnowledgeGraphModel.expand` の重複排除（`KnowledgeGraphModel.ts:134`）と await 後の破棄 bail（`KnowledgeGraphSession.ts:189`／`KnowledgeGraphSession.ts:227`）はページング途中の変更に対するフェンスである。`loadSnapshot` は `KnowledgeGraphSession.ts:202` ですべての Entity を `complete` とマークするため select がすでに存在するホップを再取得しない。
3. **ポート方向 ＋ 同一性** — エディタ `validateLink` は同一ノードと誤った方向のポートを拒否する（`model.ts:131`／`model.ts:138`）; 接続プレビュー `isConnectionTarget` は try-`addLink` 経由でそれを反映する（`editor.ts:360`／`editor.ts:549`）。`findPortAt` は `editor.ts:502` で追加順の逆順に歩くため重なったカードは最前面のポートに解決し、`getLocalPoint` は `editor.ts:498` で `worldToLocal` 経由でドラッグ／ヒットをエディタローカル空間に保ち、`sceneX/Y` ではない。
4. **オーバーレイ a11y 漏洩** — `WindowManager.focus`／`close` は blur 時に `releaseA11yProjection` しなければならず（`WindowManager.ts:248`）、`DesktopWindow` は `pointerEvents none`（`Window.ts:400`）のままでなければならない。さもなければダイアログミラーがクロームクリックを食う。クロームボタンは `a11yProjection eager`（`Window.ts:383`）を必要とする。さもなければ最初のクリックが外れる（次フレームの `onDemand` 投影）、`DisplayLayout.clampRect`（`DisplayLayout.ts:89`）はすべての配置（`WindowManager.ts:149`）で使わなければならない。
5. **テーブルビューポート計算** — `reconcileVirtualRows`／`_syncGridA11y` は `overscan` を伴う同じ `first/last` 境界（`Table.ts:397`／`Table.ts:662`）を共有する; `clampScrollPosition` は `Table.ts:344` でスプリングオフセットがクランプされたターゲットをオーバーシュートしないように保つ; `rowTops` prefix は `Table.ts:751` でクラシック a11y を $O(rows)$ ではなく $O(rows^2)$ に保つ。`pageRows()` は `Table.ts:548` でクラシックモードでは平均 `rowHeights` を、仮想化では `viewportHeight - headerHeight` を使うため、`PageUp/PageDown` は両方でビューポートサイズのままである。
6. **公開ランタイム依存** — フレームワーク依存は `peerDependencies` ＋ `devDependencies` の `workspace:*` に属する（`app-level-and-toolchain.md:467`）; `npm publish` は `dependencies` を逐語的に出荷する（`app-level-and-toolchain.md:473`）。forge アプリが新しいマイナーを消費する前に tarball コンシューマ probe（スクラッチディレクトリでの `bun add`）経由で検証すること。
7. **選択 ＋ 履歴結合** — `deleteNodes` は `editor.ts:390` で最初に transient ジェスチャを終了しノード＋入射リンクを 1 つの undo 可能なコマンドとしてバッチする; `cancelConnection`／`cancelDrag` は `history.execute` の前に行い、ぶら下がった `dragDocument` や保留中の接続を防ぐ。`applyAutoLayout` は `editor.ts:274` で JSON が変わったときのみ push するため、no-op レイアウトは undo スタックを汚染しない。
8. **永続化ラウンドトリップ** — `exportDocument` は `persistence.ts:168` で構造的**かつ**意味的に検証する（`persistence.ts:84` の `validateDocument` は `persistence.ts:156` でリンクごとの `validateLink` を伴う）; `importDocument` は `persistence.ts:178` で誤った `schemaVersion`（`persistence.ts:186`）を拒否する。構造的半分だけを通過する JSON を手書きするために `exportDocument` をバイパスすると、再インポート時に `target-port-occupied` や `incompatible-types` で `validateLink` に依然として失敗しうる — 常に同じバリデータを経由してラウンドトリップすること。

## 7a. バーティカルを跨いで盗む価値のあるパターン

4 つのバーティカル、同じ問いに対する 4 つの答え — 「増分成長をどう安価で可逆に保つか？」:

- **ナレッジグラフ: クローンせず借用する。** `KnowledgeGraphModel` はレイアウトを決してコピーしない — それを借用し（`KnowledgeGraphModel.ts:43` `layout?: GraphLayout` ドキュメント、「借用され、所有されない」）、`setGraph` ＋ `reheat` で駆動し、破棄はセッションに任せる（`KnowledgeGraphSession.ts:277`）。共有エンジン（物理、テキスト整形、メディアデコード）をラップする新しいバーティカルはこの分割をコピーすべきである: モデルの `dispose` は `KnowledgeGraphModel.ts:225` で明示的なコメント「そのままにしておくことでライブセッションと共有されたままにできる」（`KnowledgeGraphModel.ts:230`）を伴う 6 行の map／set クリアである。コメントを忘れることが、将来のエディタが `this.layout?.dispose()` を再追加してセッションを壊す経路である。

- **ノードエディタ: 履歴がドキュメントを所有する。** すべてのミューテーション — `createLink`（`editor.ts:380` → `addLink` ＋ `history.execute`）、`deleteNodes`（`editor.ts:390` → バッチされた `removeNode` ＋ 1 つの `history.execute`）、`moveDrag`（`editor.ts:441` → `history.execute('Move node', …)`）、`applyAutoLayout`（`editor.ts:274` → `history.execute('Auto-layout', …)`）— は `cloneDocument` 経由で `before`／`after` をスナップショットし `redoStack` をクリアする `CommandHistory.execute`（`history.ts:28`）を通る。エディタは `applyDocument`（`editor.ts:520` → `cloneDocument` ＋ `rebuild` ＋ `markDirty`）を経由せずに `documentState` を決してミューテートしない。将来の canvas エディタ用にこれを盗むこと: 1 つのゲート、1 つのクローン規律、帯域外の `documentState = …` なし。

- **デスクトップ: オーバーレイがフォーカスを所有し、シーンではない。** `WindowManager` は再スタックするために決して `Entity.remove` を呼ばない（`WindowManager.ts:339` `kids.splice` ＋ `markStructureChanged`）。`remove` は a11y をデタッチしドライバを登録解除するため — すべてのフォーカス変更でスラッシングするためである。フォーカスを `focused` ＋ `releaseA11yProjection`／`requestA11yProjection`（`WindowManager.ts:248`／`WindowManager.ts:253`）経由で追跡するため、`onDemand` バックグラウンドウィンドウは永続的な a11y ミラーを保持しない。デスクトップ `Wallpaper` は `a11yProjection never`（`DesktopShell.ts:26`）、`DesktopWindow` はダイアログミラー上で `pointerEvents none` を持つ `onDemand`（`Window.ts:400`）、`Taskbar` はボタンがホバーなしで到達可能でなければならないため `eager`（`Taskbar.ts:58`）である。新しいシェルサーフェスはデフォルトの `eager` ではなく、これら 3 つのモードのいずれかを意図的に選ぶべきである。

- **テーブル: ウィンドウ、プール、積分。** 仮想化は協調する 3 つの予算である: `reconcileVirtualRows` は正確に `overscan` パディングされた `[first, last]`（`Table.ts:397`／`Table.ts:404`）をウィンドウし、`_syncGridA11y` は `RowHotspot`／`GridCellHotspot` を `need`（`Table.ts:691`）にプールし、`update(dt)` は dt 対応スプリング（`Table.ts:352` `velY += diff*7.2*(dt/1000)` ／ `exp(-dt/84)`）で `scrollY` を積分する。`hasPendingAnimations` は `Table.ts:378` で 3 つすべてを `renderMode onDemand` で生かし続けるアイドルスロットルハンドシェイクである。ウィンドウステップだけをコピーし `hasPendingAnimations` を忘れた将来の仮想化リストは一度は正しくスクロールし、その後停滞する — `app-level-and-toolchain.md:222` の `StreamReader` が持っていたのと同じバグである。

## 7b. 検証 — バーティカル変更が正しいことをどう証明するか

バーティカルはアプリの形をしているため、証明もアプリの形である — 単なる単体テストではない。

- **ナレッジグラフ:** `just test-pkg knowledge-graph` は `MemoryDataSource` カーソルバージョン付け（`MemoryDataSource.ts:118` 古いカーソル throw）と `KnowledgeGraphModel` 重複排除／再加熱（`KnowledgeGraphModel.ts:134`／`:285`）をカバーする; `model.expand(id)` を同時に 2 回呼び出し 1 つの promise であることをアサートし、その後 `cancelExpand` し `cancelled` 状態であることをアサートする再現を追加すること。レンダリングでは、ヘッドありブラウザ（`jsdom` ではない）で `KnowledgeGraphSession` を駆動し `syncFromModel` 後に `graph.group.children.length` をアサートすること — `Graph3D` は Three.js であり本物の canvas を必要とする。

- **ノードエディタ:** `just test-pkg node-editor` は `validateLink` エラーコード（`model.ts:36` `LinkValidationError`）と `exportDocument`／`importDocument` ラウンドトリップ（`persistence.ts:168`）を演習する; リンクが自身の占有者であるときに at-capacity `maxConnections` が通過するケース（`persistence.ts:156` strip-self ロジック）と、no-op ドラッグの後に `history.canUndo` が false のままであることをアサートするドラッグケース（`editor.ts:445`）を追加すること。

- **デスクトップ:** `just test-pkg desktop` は `AppRegistry` と `DisplayLayout.clampRect`（`DisplayLayout.ts:89`）をカバーする; `wm.openDialog({modal:true})` を呼び、その後 `wm.focus(other)` を呼び、フォーカスがダイアログに留まることをアサートするダイアログモダリティケース（`WindowManager.ts:237` topModal ゲート）と、`Entity.remove` なしで `overlayRoot.children` 順序をアサートする `restack` ケース（`WindowManager.ts:339`）を追加すること。

- **テーブル:** `just test-pkg table` は `normalizeColumnWidths`（`Table.ts:789`）と `seenCells` 重複拒否（`Table.ts:228`）をカバーする; `viewportHeight` を設定し、`appendRows` を 1 万回呼び、 `maxScroll()`（`Table.ts:328`）までスクロールし、`mountedRows.size` が $O(rows)$ ではなく $O(viewport)$ であることをアサートする仮想化ケース（`Table.ts:392` ウィンドウ）に加え、フォーカスされた行がスクロールアウトした後に `isGridTabStop` が再アンカーすることをアサートするロービングタブケース（`Table.ts:668`）を追加すること。

すべてのケースで push 前に `just check`（oxfmt ＋ oxlint ＋ markdownlint）を実行すること — バーティカルドキュメントはコードの隣に存在し同じゲートを共有する（`AGENTS.md:31` 品質ゲート）。

## 8. チェックリスト — バーティカル変更を着地させる前に

1. **破棄の所有を明確にすること。** `KnowledgeGraphModel` は借用し、`KnowledgeGraphSession` は所有する（`KnowledgeGraphModel.ts:230` vs `KnowledgeGraphSession.ts:277`）; `DesktopShell.dispose` は `DesktopShell.ts:251` で `shortcuts`／`windowManager`／`taskbar`／`wallpaper` を順に破棄する。触れるすべての `dispose` で借用 vs 所有を grep すること。
2. **すべての非同期継続をガードすること。** `bootstrap`／`expand` の両方は await 後に `this.disposed` で bail する（`KnowledgeGraphSession.ts:189`／`KnowledgeGraphSession.ts:227`）; `expand` は id で重複排除し（`KnowledgeGraphModel.ts:134`）、`cancelExpand` は abort する（`KnowledgeGraphModel.ts:150`）。ガードなしの新しい `await` は遅延ミラーバグを再導入する。
3. **a11y を構造的に投影すること。** `Table` はプールされ `pointerEvents none` の `RowHotspot` 行（`Table.ts:55`）と `GridCellHotspot` セル（`Table.ts:82`）を持つ `role grid` である; `DesktopWindow` は `pointerEvents none`（`Window.ts:400`）を持つ `role dialog` であり eager なクロームボタン（`Window.ts:383`）を持つ; `NodeEditor` ポートはキーボード由来（`editor.ts:90`）を持つ `role button` である。構造的な親に `pointerEvents none` なしの新しいインタラクティブな子はヒットを奪う。
4. **`hasPendingAnimations` を正直に保つこと。** `Table` は `Table.ts:378`、`StreamReader` は修正後 `app-level-and-toolchain.md:259` でどちらもアニメーション中は `true` を返すため `onDemand` はジェスチャ途中で決してアイドルにならない。内部で `markDirty` を呼ぶ新しい `update(dt)` は同じオーバーライドを必要とする。
5. **公開する前に検証すること。** `packages/desktop` は `dependencies` 内の `workspace:*` で壊れた（`app-level-and-toolchain.md:455`）; `packages/tex` は `sideEffects: false` で壊れた（`app-level-and-toolchain.md:407`）。どちらも `vitest` が `src/` にエイリアスしコンシューマ probe が実行されなかったため CI を生き延びた。リリースチェックリストに tarball `bun add` スモークテストを追加すること。
6. **所見を正しい forge バケットに記録すること。** `app-level-and-toolchain.md:1` は append のみである（`app-level-and-toolchain.md:5`）— 既存エントリを決して編集せず、アプリの罠を `core-*`／`simulation-*` 配下に決して提出しない（`forge/findings/README.md` 分類）。分割がエンジントリアージをアプリノイズで溺れさせないようにするものであり、ドッグフーディングループ（`vectojs-native/*/AGENTS.md`）はそれに依存する。

## 9. 将来のバーティカルと拡張ポイント

新しいバーティカルはフォークからではなく、すでに存在するシームから始めるべきである。

- **ナレッジグラフ拡張。** ワーカー backed またはストリーミングソース用に `KgDataSource` を交換する（`types.ts:54` `MaybeAsync<T>` は `types.ts:84` で同期または非同期をすでに許可する）: ページサイズ、`direction: 'out'|'in'|'both'`（`types.ts:64`）、`signal` abort はモデルが必要とする唯一のノブである。タイムラインやマップのバーティカルは異なる `GraphLayout`（例: 1D 時間的 `FixedZLayout` バリアントや `ForceLayout2D` 投影）と異なる `Graph3D` スタイルで `KnowledgeGraphModel` を再利用する — `GraphLayout` ＋ `GraphData` が契約であり、力の法則ではない。

- **ノードエディタ拡張。** `PortDefinition.dataType`（`model.ts:12`）＋ `maxConnections`（`model.ts:13`）はすでに型付きソケットをモデル化する; `layoutDocument` オプション（`layout.ts:3` `originX/Y`、`horizontalGap`／`verticalGap`）は唯一のレイアウトノブである。シェーダーグラフやオーディオグラフのバーティカルは `NodeData.type` 分岐と `validateLink` `incompatible-types` ルール（`model.ts:140`）を追加するだけで `history.ts` や `selection.ts` に触れない。`CommandHistory` は意図的にラベルを持つ（`history.ts:4` `label`）ため undo ログは人間が読める。

- **デスクトップ拡張。** `AppRegistry.register` は `AppRegistry.ts:15` でプラグインシーム（`WindowManager` に触れずにランタイム登録）であり、`openDialog` は `WindowManager.ts:184` で transient シームである。新しいアプリは `AppDefinition.create: (ctx: AppContext) => Entity`（`types.ts:1`）だけを必要とする — `ctx` は `scene`、`vfs`、`windowManager`、`close`、`appId`、`windowId` を持つ。`ShortcutRouter`（`ShortcutRouter.ts:1`）はすでに `custom` アクションを名前空間化しているため、アプリは `open-app`／`close-focused` と衝突せずにコードを追加できる。

- **テーブル拡張。** `Table` はすでに `TableCell = string | Entity`（`Table.ts:4`）でジェネリックであるため、チャートセルやスパークラインバーティカルは `Entity` セルを渡し自身の `width/height` を所有する — `fitCell`／`setCellSelectable` は型タグではなく機能（`Table.ts:5`）で probe する。仮想化は新しいセルが `setMaxWidth`（`Table.ts:6`）を通じてサイズ設定されたままである限り $O(viewport)$ のままである。`appendRows`（`Table.ts:885`）が唯一のミューテーションである — `setRows` は a11y 再アンカーと `seenCells` 無効化を必要とするため意図的に存在しない（`Table.ts:870` ドキュメント）。

すべてのケースで新しいバーティカルのコストは 1 つの新しいパッケージに加え `GraphData`／`NodeDocument`／`AppDefinition`／`TableCell` アダプターである — 新しいエンジンではない。

## 付録 — 次に読むべき場所

<!-- markdownlint-disable MD060 -->

| 目的                                       | 開始                                                                                        | 次に                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| ナレッジグラフをページングする             | `packages/knowledge-graph/src/KnowledgeGraphModel.ts:62` 単一ドライバ                       | `KnowledgeGraphSession.ts:67` 配線 → `packages/graph3d/src/Graph3D.ts:28` プレゼンテーション |
| 展開時に安定ノードを安定に保つ             | `KnowledgeGraphModel.ts:273` バッチ `loaded` ＋ `KnowledgeGraphModel.ts:332` `rebuildGraph` | `FixedZLayout.ts:22` クランプ → `GraphLayout.ts:12` 契約                                     |
| エディタコマンドを追加する                 | `packages/node-editor/src/history.ts:9` `execute` ＋ `model.ts:126` `validateLink`          | `editor.ts:199` ジェスチャ → `persistence.ts:84` `validateDocument`                          |
| デスクトップアプリやダイアログを開く       | `packages/desktop/src/WindowManager.ts:126` `open` ／ `:184` `openDialog`                   | `Window.ts:158` クローム → `DisplayLayout.ts:15` ワークエリア → `AppRegistry.ts:1` カタログ  |
| ドキュメントをエクスポート／インポートする | `packages/node-editor/src/persistence.ts:168` `exportDocument`                              | `persistence.ts:178` `importDocument` → `persistence.ts:84` `validateDocument`               |
| デスクトップショートカットを追加する       | `packages/desktop/src/ShortcutRouter.ts:1` `ShortcutRouter`                                 | `DesktopShell.ts:344` `dispatchShortcut` → `types.ts:1` `ShortcutAction`                     |
| 10k 行を超えてテーブルを仮想化する         | `packages/table/src/Table.ts:144` `viewportHeight`                                          | `Table.ts:392` `reconcileVirtualRows` → `Table.ts:624` プール → `Table.ts:352` 積分器        |
| 新しい所見を分類する                       | `vectojs-docs/forge/findings/app-level-and-toolchain.md:1` ヘッダー                         | `forge/findings/README.md` テンプレート → 正しいバケット、`Upstream status` 行               |

> **シームを読む:** グラフシームは `GraphData`（`graph3d/types.ts`）、エディタシームは `NodeDocument` ＋ `validateLink`（`model.ts:54`／`:126`）、デスクトップシームは `AppDefinition` ＋ `AppContext`（`types.ts:1`）、テーブルシームは `TableCell`（`Table.ts:4`）である。シームを 1 つの型で名指せない新しいバーティカルはまだ境界を見つけていない。

---

_シリーズ: 00 Overview → 01 Selection → 02 Text+Layout → 03 Projection+Virtualization → 04 Streaming Markdown → 05 TeX → 06 VMT Runtime → 07 Renderer → 08 WASM → 09 Three/XR → 10 Video Export → 11 Graph Layout → 12 DevTools → **15 バーティカルアプリ** → 99 Synthesis。_
