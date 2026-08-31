+++
title = "03 — セマンティック投影 + 仮想化"
description = "3 ティアの DOM ライフサイクル — Visual、Semantic、Interaction — と、VectoJS がいかに有用なものだけをマテリアライズし、選択可能なものをウィンドウイングし、ロービングフォーカスを正しく保つか。"
weight = 23
+++

# 03 — セマンティック投影 + 仮想化

VectoJS は **可視 DOM をゼロ** でレンダリングします。目に見えるものはすべて canvas です。スクリーンリーダー、キーボードユーザー、Playwright エージェントが触れるものはすべて `Scene.a11yRoot`（canvas 上の単一の `position:absolute` な div、`packages/core/src/tree/Scene.ts:2390`）内の **薄い投影されたシャドウ** です。そのシャドウは Entity ごとに 1 ノードではありません — 画面外テキストを検索や先読みで到達可能に保ちつつ、コストをビューポートに束縛する 3 ティアのライフサイクルです。

## 3 つのティア — 1 枚の図

```text
                      ┌─────────────────────────────────────┐
                      │        Virtual Math Tree (VMT)      │
                      │  Entity tree · worldMatrix · bounds │
                      │  packages/core/src/tree/Scene.ts    │
                      │  packages/core/src/tree/Entity.ts   │
                      └──────────────┬──────────────────────┘
                                     │  syncA11y + syncContentProjection
                                     │  (shared depth-first walk, every frame
                                     │   or throttled — see §2)
                 ┌───────────────────┼───────────────────┐
                 ▼                   ▼                   ▼
   ┌─────────────────────┐ ┌───────────────────┐ ┌─────────────────────┐
   │  Visual tier        │ │  Semantic tier    │ │  Interaction tier   │
   │  (always rendered)  │ │  (coarse, resident)│ │  (windowed, fine)  │
   │                     │ │                    │ │                     │
   │  Canvas2D / WebGL / │ │  One DOM node per  │ │  Per-line carriers  │
   │  WebGPU / SVG draws │ │  block holding its │ │  (spans per line /  │
   │  every entity that  │ │  full `text` so    │ │  spans per glyph    │
   │  passes culling.    │ │  find-in-page and  │ │  cluster when grid) │
   │  Subject to         │ │  read-ahead see    │ │  plus a11y mirrors  │
   │  `getRenderChild-   │ │  the whole doc.    │ │  (`button`, `grid-  │
   │  Range` /           │ │  Outside the       │ │  cell`, hotspots).   │
   │  viewportCullChild- │ │  interaction margin│ │  Only near-viewport │
   │  ren. No DOM cost.  │ │  carriers are NOT  │ │  materialized.      │
   └─────────────────────┘ │  built.            │ └─────────────────────┘
                           └───────────────────┘
        Pixels ─────────────►  `getContentProjection().text`  ─────────►  `lines` / `grid`
                              `SceneOptions.contentSemanticMargin`
                                                            `SceneOptions.contentProjectionMargin`
                                                            `SceneOptions.contentSemanticBudget`
```

なぜ 2 つのマージンなのか。1 つのスカラーでは「すべてのブロックが DOM を持つが、ビューポート近傍のブロックだけがキャリアを持つ」を表現できません — 有限値は帯域外ブロックを完全に解放してしまい、`Infinity` はすべてのキャリアをウィンドウ解除してしまいます（`O(total glyphs)`）。`SceneOptions.contentSemanticMargin` vs `contentProjectionMargin`（`Scene.ts:328`、`336`、`359`）と `vectojs-docs/forge/baselines/content-projection-frontload-findings.md:1` の棄却された enum の根拠を参照してください。

| 階層                       | どこに住んでいるのか                                            | によってゲートされる                                                                   | デフォルト                                                 |
| -------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| ビジュアル                 | キャンバスバッキングストア                                      | `viewportCullChildren` + `getRenderChildRange` (`Entity.ts:788`, `1970`)               | 淘汰 — コンテナごとにオプトイン                            |
| セマンティック (粗い)      | ブロックごとに 1 つの `div`、`el.textContent = projection.text` | `contentSemanticMargin` — ブロックに _任意の_ DOM があるかどうか                       | `contentProjectionMargin ?? Scene.height` (`Scene.ts:355`) |
| インタラクション（細かい） | 回線ごと/セルごとのキャリア + a11y ミラー                       | `contentProjectionMargin` + `projectionLineWindow` (`scene/content-line-window.ts:25`) | 1 つのビューポートの高さ                                   |

`contentSemanticBudget` (`Scene.ts:359`、`DEFAULT_CONTENT_SEMANTIC_BUDGET = 256` at `Scene.ts:600`) は、1 回限りの常駐層ビルドをフレーム全体に分散します。粗いブロックのみが割り当てられます。インタラクションバンド内のブロックは、予算に関係なく即座に具体化されます。

## `syncA11y` walk の仕組み — そしていつ動くか

`syncA11y` は「a11y メソッド」ではありません。a11y **と** コンテンツ投影のための **共有された深さ優先 walk ドライバー** です（`A11yProjectionManager.ts:30`、`ContentProjectionManager.ts:26`）。それらを分割するには `DEC-0020`/`DEC-0022` が必要な理由がありました。再帰ポイントで `syncContentProjection` を呼び出し、`syncA11y` がコンテンツ側が読む 4 つの per-sync フィールド（`_syncSerial`、`contentSemanticBudgetLeft`、`contentSemanticDeferred`、`contentSelectionPresentThisSync`）を初期化するからです。`DirtyTracker`（`scene/DirtyTracker.ts:33`）が walk 自体を実行するかどうかをゲートし、`a11ySyncInterval` はバジェットを壊さずにさらにスロットルします。

フレームごと (または `a11ySyncInterval`、`Scene.ts:263` に制限):

1. **収集 + ダーティ チェック。** ゼロ以外のボックス (または `a11yFullViewport`、`Entity.ts:912`) を持つ各 `interactive` エンティティは、`getA11yAttributes()` (`Entity.ts:1898`) を呼び出します。ウォークでは、`interactive`、`a11yHidden`、`a11yProjection`、および `a11yFullViewport` が一緒に読み取られます。非表示の祖先は、子フラグに関係なく、そのサブツリー全体を非表示にします (「フォーカス」を参照)。 `getContentEpoch()` (`Entity.ts:2048`) がバンプしていない場合、変更されていないコンテンツ ブロックはリビルドを完全にスキップします。エポックは、VMT ダーティ フラグと同等のコンテンツ投影です。安価な整数比較であり、文字列差分はありません。 `getContentProjection()` から `null` を返すエンティティには、コンテンツのコストはまったくかかりません。
2. **作成/更新/再配置** ウォークはシャドウ要素 (`a`/`button`/`img`/`input`/`textarea` または `div`、`Entity.ts:295` の `A11yAttributes.tag`) を作成し、すべての `A11yAttributes` フィールドに属性ごとのダーティ チェックを適用します (`undefined` を返すと属性が削除されます)。 `false` と `undefined` は `aria-invalid` にとって重要です)、エンティティのワールド行列から `CanvasGeometry` (`scene/CanvasGeometry.ts:93`) を介して `top`/`left`/`width`/`height` を書き込みます。キャンバス オフセットと不均一な CSS スケーリングがマッピングされます。キャンバス親の任意の CSS 回転/傾斜はサポートされていません。 `A11yAttributes.level` / `posInSet` / `setSize` / `rowCount` / `rowIndex` は `aria-level` / `posinset` / `setsize` / `rowcount` / `rowindex` として投影されます。仮想化リスト/グリッドに必要なので、AT はウィンドウではなくデータセット サイズを通知します。
3. **順序付け + プルーン。** `A11yProjectionManager.collect` (`A11yProjectionManager.ts:157`) は、最も近い `a11yRegion`/`clipChildren` の祖先を要素の _region_ として受け取ります。 `reorder` (`A11yProjectionManager.ts:178`) は、`normalElements` を視覚的な読み取り順序 (`sortNormalElementsVisually`、`A11yProjectionManager.ts:351`) にバンドソートし、DOM 親ごとにカーソルを挿入するため、複合ネスト (`grid > row > gridcell`) が保持されます。移動されたサブツリー内のフォーカスおよび `Selection` エンドポイントは、一度スナップショットされます。つまり、移動された要素ごとではなく、_reordering_ パスごとに 1 つの強制レイアウトが支払われます (`A11yProjectionManager.ts:230`)。このパスで収集されなかったものはすべて削除されます (`isActive` の `A11yProjectionManager.ts:169`)。 `a11yNeedsReorder` (`Scene.ts:1381` / `A11yProjectionManager.ts:88`) は、ソートをトリガーするフラグです。
4. **コンテンツ側** 再帰ポイントで、ウォークは `getContentProjection()` が null ではないすべてのエンティティに対して `syncContentProjection` を呼び出します。ボックス テスト (`projectionBoxVisible`) は、粗いものとリリースされたものを決定します。ライン バンド (`projectionLineWindow` / `projectionGridLineWindow`、`scene/content-line-window.ts:2`) は、生き残ったブロックのどのラインがキャリアを取得するかを決定します。グリッド ブロックは行ごとの署名を使用して `ContentGridProjector.syncGrid` (`scene/ContentGridProjector.ts:69`) を通過するため、ストリーミング追加では変更されていないキャリアが再利用されます。非グリッド ブロックは `el.replaceChildren()` を使用します。 `ContentProjectionHint` (`Entity.ts:ContentProjectionHint`) を使用すると、シーンはどのバンドが実際に必要であるかをエンティティに伝えることができるため、`getContentProjection` は破棄された行の構築を回避できます (勧告なので、無視するのが常に正しいです)。

### ライフサイクルフック

`Entity.onMounted()` は、エンティティがライブ シーン (`Entity.ts:add` / `_notifyMounted`) に入ったときに 1 回起動します。いつ割り当てるかを知る必要があるホットスポット プールは、それをオーバーライドできます。 `remove(child)` は `scene.detachA11y(child)` (`Entity.ts:remove`) を呼び出し、`a11yNeedsReorder` をマークします。 `Scene.detachA11y` は冪等であり、2 回目のデタッチは何も行われません。そのため、行を削除する前にホットスポットをデタッチする `Tabs`/`Table` プールのクリーンアップは、エンティティがすでになくなっていた場合でも安全です。

### バジェットとマージン制御

3 つのノブ、1 つのコントラクト:

- `contentProjection: false` は、コンテンツ レイヤー全体 (装飾シーン) を無効にします。
- `contentProjectionMargin` (デフォルトの 1 つのビューポートの高さ、`Scene.ts:328`) — インタラクション ウィンドウ。有限 = ウィンドウ化されたキャリア。 `Infinity` = すべてのキャリアが実体化されます (本番環境では禁止されています — `O(glyphs)`)。
- `contentSemanticMargin` — 粗いゲート。 `Infinity` + 有限のインタラクションマージン = すべてのブロックには検索/先読み用の `text` があり、ビューポートに近いブロックのみがキャリアの料金を支払います。常駐層に必要な安全な構成。これがないと、同じ `Infinity` によってキャリアもアンウィンドウ化されてしまいます。
- `contentSemanticBudget = 256` — 同期ごとに生成できる粗いブロックの数。ドキュメント オープン ストールの境界を示します (ブロックあたり約 0.03 ミリ秒と居住者数に応じて増加するパスごとのフロアを測定)。表示されているブロックはバジェットを無視します。

予算は、以下のメモ修正後の `DEC-01KZ8DZE` の測定によってサイズ設定されました。 `forge/baselines/content-projection-frontload-findings.md:Two approaches rejected`を参照してください。

### なぜ Entity ごとに 1 つの DOM にしないのか

コストは、予測されるノード数において非常に線形です。実際のハードウェアで測定 (RTX 4060 ラップトップ、移動エンティティ、各要素 1 つ) — `content/learn/accessibility.md:353`:

| インタラクティブなエンティティ | クローム/フレーム | Firefox/フレーム |
| ------------------------------ | ----------------- | ---------------- |
| 1,000                          | 6.4 ms            | 7.4 ms           |
| 5,000                          | 59.5 ms           | 114 ms           |
| 20,000                         | 715 ms            | 2737 ms          |

エンティティごとのコストはカウントとともに増加します (並べ替えとブラウザーの a11y ツリーの再構築により劣化します)。 5,000 個の移動エンティティでの 2 番目の測定 (`Entity.ts:933` ドキュメント、`benchmarks/lazy-a11y/`): `eager` = **72.2 ms Chrome / 114.3 ms Firefox** vs `onDemand` = **1.55 / 1.63 ms**、投影なしの床 **1.26 / 1.65 ms**。ウォーク自体はエンティティあたり約 0.005 マイクロ秒です。DOM がコストです。したがって、36,000 エンティティのエンティティごとに 1 つの DOM は線形外挿ではありません。これは a11y ツリーの再構築によって支配されています。そのため、同じドキュメントでは 36,000→1,026 の崩壊をウォーク勝利ではなく _system_ 勝利として引用しています。

### エンゲージメント — `a11yProjection` モード（`Entity.ts:968`）

- `eager` (デフォルト) — ミラーは `interactive` + ボックスの間存続します。ボタン、リンク、入力用。
- `onDemand` — _engages_ の間のみミラーリングします: フォーカス、ポインター ターゲット、または `Scene.requestA11yProjection(id)` (`Scene.ts:1481`)。ホバーだけでは **機能しません** (キーボード/AT ユーザーはホバーを生成しません)。ミラーのない `onDemand` エンティティは **ポインター イベントをまったく受け取りません**。キャンバス ヒット テスト (`findEntityAt`) はクエリ API であり、ディスパッチ パス (`Entity.ts:953`) ではありません。
- `never` — ミラーはありません。ヒット テストを継続する必要がない限り、`interactive = false` を優先します。

数千の一時的なオブジェクト (パーティクル、弾幕) の場合、パターンは 1 つの集約ライブ領域 (`role: 'status'`、`a11yFullViewport`、`Entity.ts:193`) に、現在の選択範囲の小さなホットスポット プールを加えたものになります。`forge/findings/core-a11y-and-input.md:178` (Bakudan `DanmakuAnnouncer`) を参照してください。

## 仮想化 — ドキュメント全体のコストを払わずにスクロールする

### ScrollView / Viewport

プリミティブ スクローラー (`packages/ui/src/ScrollView.ts:58`) はクリップされたコンテナー (`clipChildren = true`) であり、その子 `content` は `-scrollTop` によって変換されます。 `scrollTo` / `scrollToBottom` / `jumpTo` を公開し、`update` (`ScrollView.ts:219`) で指数スプリング積分器を駆動し、`hasPendingAnimations()` を介してアイドル チェックにスクロール状態を表示し続けるため、`onDemand` シーンがスクロール中に停止することはありません。 `driveVirtualizableContent` (`ScrollView.ts:233`) を使用すると、`VirtualList` 子がスクロール内に独自のウィンドウを所有できるようになります。

`ScrollView` 内の `Flow` または `Stack` は通常のレイアウトを行います。クリップ + 変換のみが _paint_ を仮想化します。DOM コストは依然としてコンテンツ プロジェクション ウィンドウによって制限されます。 `Flow` は `maxWidth` でラップします。 `Stack` は、垂直/水平ギャップ コンテナー (`packages/ui/src/Stack.ts`、`Flow.ts`) です。 `Card` は装飾されたグループ (ラベルが付けられている場合は `packages/ui/src/Card.ts:80`、`role: group`) です。それ自体は仮想化されていませんが、仮想化されたビューポートの共通の子です。

`getA11yAttributes()` は `{ pointerEvents: 'none' }` (`ScrollView.ts:289`) を返します。スクロール サーフェス自体はヒット ターゲットではありません。子孫はポインタを所有します (下記のホットスポット § を参照)。折りたたまれた `ScrollView` 上の `a11yHidden` は、クリップ アニメーションの実行中であってもサブツリーを投影から隠します (`Entity.ts:a11yHidden`、`hide()` 後の `Overlay` で検証)。

### VirtualList — 行のウィンドウイング（`packages/ui/src/VirtualList.ts:179`）

`[visibleTop - overscan, visibleBottom + overscan]` 内の行のみがマウントされます (`VirtualList.ts:468` の `_visibleRange`、デフォルトでは `overscan = 3`、`VirtualListOptions:102`)。残りはエンティティとして存在しません。キャンバス描画、ミラー、コンテンツ投影はありません。データセットのサイズに関係なく、マウント数は `O(viewport)` のままです。

スクロール計算は、フェンウィック ツリー (`RowHeights`、`VirtualList.ts:14`) を介して `O(log n)` を返し、`total()`、`prefix(i)` (= 行 `i` の y)、および `indexAt(y)` (= オフセット `y` を含む行) を返します。高さは `estimatedRowHeight` から始まり、各フレーム (`_measureMountedRows`、`VirtualList.ts:540`) ごとにマウントされた行ごとに再測定されます。プレーン フィールドの読み取りであり、ダーティ フラグは必要ありません。変更なしのパスには `markDirty` がないため、アイドル スロットルは無効になりません。 `_reconcile` (`VirtualList.ts:488`) は、新しいエンティティをマウントする前に範囲外のエンティティをリサイクルします。

キー付きリスト (`keyForItem`、`VirtualList.ts:117`) は、`setItems` 全体で測定された高さを保持し、アイテム ID (インデックスではなく) によってスクロールを固定し、`distanceToBottom ≤ 48 px` (`VirtualList.ts:517`) の場合は下に続きます。 `keyForItem` がないと、`setItems` は高さのキャッシュをクリアして先頭にジャンプします。置換されたリストの場合は正しいですが、増加するトランスクリプトの場合は間違っています。

A11y: コンテナのカウントは、`aria-setsize` (`role="list"` では禁止されています) ではなく、**名前** に属します。`VirtualList.ts:660` の `getA11yAttributes` および `VirtualList.ts:170` のクラス ドキュメントに基づいています。各 _row_ は `posInSet` / `setSize` (`Entity.ts:A11yAttributes.posInSet`/`setSize`) を返すか、スクリーン リーダーがデータセットの代わりにマウントされたウィンドウのサイズを通知する必要があります。 `VirtualList` は、`Table` と同じ方法で行ホットスポットをプールします (表示される行ごとに 1 つのプール)。

### コンテンツグリッドのタイリング — coarse vs fine（上図 §）

2 つのパスが 1 つのウィンドウ コントラクト (`scene/content-line-window.ts`) を共有します。

- **非グリッド** (段落、`Text`/`RichText`): `ContentProjection.lines` に対する `projectionLineWindow` (`content-line-window.ts:44`)。粗いブロックは 1 つのテキスト ノード (`el.textContent = projection.text`) を保持します。細かいブロックがウィンドウごとのキャリアを置き換えます。各 `ContentProjectionLine` には、`text`、`separatorAfter` (ソフトラップとハード ブレークの使用)、`x`/`y`/`baseline`、オプションの `runs` (両端揃えテキスト用の `x`/`width`)、および CJK グリッド フィット用の `perGraphemeCarriers`/`shapedPaint` が含まれます。
- **グリッド** (コード ブロック、`@vectojs/text` の `PreparedContentGrid` を介した `Markdown` CodeBlock): `PreparedContentGrid` 上の `projectionGridLineWindow` (`content-line-window.ts:114`)。 `ContentGridProjector.syncGrid` は、セルごとの `scaleX` キャリブレーション (`ContentProjectionManager.scheduleGridCalibration`、同期外部でのコールド読み取り/書き込みバッチ) を使用してグリフ クラスターごとに 1 つのスパンを構築し、署名 (`ContentGridProjector.ts:199`) によって行を再利用するため、ストリーミング追加による `O(cells)` の再構築が回避されます。グリッド テキストの `ligatures: 'none'` は、Firefox `ffi` の縮小が選択ボックスを移動するのを防ぎます。

ウィンドウは **展開されたビューポート バンドと重なる連続したラン**です。隙間があるとテキストが DOM 順序から切り離され、選択範囲のコピー順序が壊れます。何も重なり合わない場合は、テキストに到達可能な状態を維持できるように、最も近い 1 行が保持されます (`content-line-window.ts:79`)。プロモーション (coarse→fine) では、coarse テキスト ノードが明示的に削除されます。グリッドでは `replaceChildren()` を使用できないか、ストリーミングの再利用が失われます (`ContentGridProjector.ts:111`)。降格により DOM が解放されます。セマンティック ゲートは、キャリアなしで検索可能なテキストを保持します。

選択の保持は層認識です: `ContentProjectionManager` (`scene/ContentProjectionManager.ts:1`) は、非グリッドの場合は _linear offsets_、グリッドの場合は _source offsets_ としてエンドポイントをスナップショットし、ウォークごとに `selectionPresent` をメモ化します (要素ごとではなく、ウォークごとに 1 つの強制レイアウト — メモ化された修正では、2002 年のレイアウトから 19 の `forge/baselines/content-projection-frontload-findings.md:153` まで 1000 ブロックのドレインが必要でした)、影響を受けるラインが実際にあった場合にのみ復元されます。再構築 — 再利用されたキャリアにより、ライブ `Selection` ノードが維持されます。スクロール コード ブロックの `clipToBounds` は、選択のハイライトがエンティティ ボックスを超えて描画されるのを防ぎます。

### Markdown + Table のタイリング

- **マークダウン** (`packages/markdown/src/Markdown.ts:681`) — 2 つの独立した軸: `virtualize` (`MarkdownOptions:625`) はトップレベルの _blocks_ をエンティティとしてウィンドウします (オプトイン、ストリーミングと互換性がなく、`Markdown.ts:774` での `RowHeights` を備えたホスト `ScrollView` からの `setVisibleRange` によって駆動されます)、`tableViewportHeight` (`MarkdownOptions:652`) は各 `Table` の本体を修正しますビューポートを使用して、その行が `Table.appendRows` を介してストリームの途中で仮想化されるようにします。どちらの場合も、`Stack` と `cullOffscreenChildren` がコンテンツ ホストになります。 `Markdown` はブロックごとに `getContentProjection` を所有します。ホストがスクロールを所有します。ストリーミング マークダウンは、変更されていないブロック エンティティをプレフィックスごとに再利用します。末尾のみが再構築されます (ボス 04)。
- **テーブル** (`packages/table/src/Table.ts:144`) - `viewportHeight > 0` はヘッダーを固定し、クリップされたスクロール `bodyClip` (`Table.ts:183`) を作成し、ウィンドウのエントリで文字列セルを遅延構築し (`Table.ts:853` の `ensureBodyCells` / `Table.ts:392` の `reconcileVirtualRows`)、マウントされた `first..last` 行のみを保持します (`overscan = 2`)。クラシック モードは、測定された高さが変化するすべての行に合わせて拡大します。ボディ a11y は、表示される行ごとにプールされた `RowHotspot` (`role: row`) + `GridCellHotspot` (`role: gridcell`/`columnheader`) です。`O(rows)` (`Table.ts:199`、`622`) ではなく、`O(viewport)` です。 `getContentProjection` は `Table` 自体で `null` を返します。セルはテキストを所有します。 `rowTops` プレフィックス合計 (`Table.ts:751`) では、`_syncGridA11y` スロットごとに O(rows²) ではなく O(1) になります。

### ビューポート内の Stack / Flow / Card

`Stack` (`packages/ui/src/Stack.ts`) および `Flow` (`packages/ui/src/Flow.ts`) は非仮想化レイアウト コンテナーです。これらは子を配置し、`width`/`height` を報告しますが、クリップやウィンドウは行いません。 `ScrollView` または仮想化親の内部では、それらは翻訳または選別される _content_ です。

- `Stack` と `direction: 'vertical'` + `gap` は、Markdown `content` ホスト (`Markdown.ts:1088`) であり、典型的な ScrollView の子です。 `cullOffscreenChildren = true` を使用すると、画面外の子の `getContentProjection` もスキップされます。これは、シーンレベルのウィンドウ処理の前の安価な 2 番目のゲートです。
- `Flow` は、インラインの子を `maxWidth` でラップし、テキスト段落の主力製品です。 Stack と同様に、ビューポートのゲーティングをスクロールの祖先に依存します。
- `Card` (`packages/ui/src/Card.ts:80`) は、パディング/ボーダー/シャドウを備えた装飾された `role: group` コンテナーです。それ自体は仮想化されていませんが、`VirtualList` 行または `Markdown` ブロックの子としてよく使用されます。その a11y の役割は、ラベルが付けられている場合のみ `group` です。

これらはいずれもデフォルトでは `getRenderChildRange` を所有しません。これらはすべての子をペイントし、祖先のクリップ + プロジェクション ウィンドウの制限コストを許可します。 `Markdown`/`Table`/`VirtualList` のみが行/ブロックレベルの仮想化を実装します。

### ビューポートカリング — visual ティア（`Entity.ts:788`）

DOM プロジェクションに依存しない:

```ts
entity.viewportCullChildren = true;
entity.getRenderChildRange(localViewport: Bounds): RenderChildRange | null {
  // return { start, end } of children intersecting the viewport, or null for none
}
```

`Stack`/`Flow` は、デフォルトではこれをオフのままにします (子数が少ない場合は安価です)。 _canvas_ 描画自体のカリングが問題となる、何千ものビジュアルな子を持つコンテナーに対してこれをオンにします。プロジェクション ウィンドウ処理はビジュアル層には役に立ちません。また、カリングなしのツリー ウォークは同期フレーム (`forge/baselines/content-projection-frontload-findings.md:Not addressed`、`vectojs#350`) ごとに `O(total entities)` になります。

### 昇格 / 降格ライフサイクル

```text
  off-screen                          near viewport                    on-screen
 ──────────── ──contentSemanticMargin── ──contentProjectionMargin── ────────────
  (released)          (coarse)                     (fine)
  no DOM              el.textContent = text        per-line / per-cell carriers
  not findable        findable, no per-line        findable + selectable +
                      selection geometry            copy + per-line highlight

  demotion ◄──────────────┘                          └──────────────► promotion
  `syncContentProjection` frees carriers;            `syncGrid` strips coarse text node,
  coarse text stays if inside semantic gate;         materializes windowed carriers;
  outside both gates the element is removed.         outside semantic gate but inside
                                                     interaction gate: direct to fine.
```

予算はオフバンドからの粗い→細かいプロモーションにのみ適用されます。すでに粗いインタラクション バンド内にあるブロックをスクロールすると、バジェットは無視されます。

## ホットスポットパターン — DOM ゼロでセマンティクスを持ちつつキーボード操作可能に

複合ウィジェット (`role="grid"`、`tree`、`menu`、`radiogroup`、`tablist`) は、コンテナー ロールだけでなく、**子ごとに 1 つのロール**を公開する必要があり、**1 つのタブ ストップ**を順番に保持する必要があります。1,000 個のタブ ストップ ツリーは使用できません。 VectoJS は、表示されている各子 (`vectojs/AGENTS.md:Zero-DOM a11y hotspot pattern`) の上に透明でフォーカス可能な子 `UIComponent` をプールします。

```ts
class GridCellHotspot extends UIComponent {
  constructor(private table: Table) {
    super();
    this.interactive = true; // so syncA11y projects it at all
    this.on('keydown', (e) => this.table.handleGridKey(e, this.rowIndex, this.colIndex));
  }
  getA11yAttributes(): A11yAttributes {
    return {
      role: this.rowIndex < 0 ? 'columnheader' : 'gridcell',
      label: this.label, // WCAG 4.1.2 — every control needs a name
      tabIndex: this.table.isGridTabStop(this.rowIndex, this.colIndex) ? 0 : -1,
      pointerEvents: 'none', // lets selectable cell text own the pointer
    };
  }
  render(): void {} // Table paints the cell on canvas
}
```

| 成分              | ホットスポットの役割                              | ロービングストップのオーナー                      | キー                                                                         |
| ----------------- | ------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `Table`           | `gridcell` / `columnheader` in `row`              | `isGridTabStop(row, col)` (`Table.ts:473`)        | Arrows 2D、ホーム/終了行、Ctrl+ホーム/終了グリッド、PageUp/Down ビューポート |
| `VirtualList` row | 呼び出し元が提供する (例: `listitem`)             | row's own `isTabStop`                             | 上/下                                                                        |
| `TreeView`        | `treeitem` (`aria-level`, `expanded`, `selected`) | `isTabStop(nodeId)` (`Tree.ts:389`)               | 上/下、右展開→入力、左折りたたみ→親、ホーム/終了                             |
| `ContextMenu`     | `menuitem` (`haspopup`, `expanded`)               | `isMenuTabStop(idx)` (`ContextMenu.ts:270`)       | アップ/ダウンラップ、ホーム/エンド、右オープン、左バック、エスケープクローズ |
| `RadioGroup`      | `radio` (`aria-checked`)                          | `isTabStop(value)` (`RadioGroup.ts`/`Tabs.ts:42`) | 矢印 + ホーム/エンド                                                         |
| `Tabs`            | `tab` (`aria-selected`)                           | 選択したタブ                                      | 矢印 + ホーム/エンド                                                         |

前例: `RadioGroup`/`Tabs` (#160)、`Tree`/`Table`/`ContextMenu` (#191)。 `Table.ts:56`、`82`、`Table.ts:624` (`_syncGridA11y`)、`VirtualList.ts:170`、`ScrollView.ts:289`、`ContextMenu.ts:292`、`RadioGroup.ts:32`、`Tree.ts:98` のライブ参照。表示可能な子のみがプールされるため、仮想化された `Table` は `O(viewport)` ホットスポットを投影します。

### `pointerEvents: 'none'` の根拠

キャンバス入力は **投影されたミラーのみを介してルーティングされます** — `Scene` は、ホバー トラッキングの場合のみ、ミラー (`Scene.ts:3512`) ごとに `pointerdown`/`pointerup`/`click`/`wheel` とキャンバス上の `pointermove`/`pointerleave` をバインドします。したがって、ホットスポット上の `pointerEvents: 'none'` は単に「ヒット テストから削除する」だけではなく、マウス入力パスを完全に削除しますが、キーボード フォーカスと AT 合成された `click` は引き続きルーティングされます (`forge/findings/core-a11y-and-input.md:336`)。下の何かがポインタを所有している場合に使用します。

- 選択可能なセルのテキスト (`Table.ts:116`)、
- ドラッグしてスクロールするサーフェス (`ScrollView.ts:289`)、
- ラッパー内でのキャンバス ヒットの処理。

ハンドラーを所有する要素ではこれを使用しないでください**。独自の属性に `pointerEvents: 'none'` を設定する `ScrollView` サブクラスは、その `wheel`/`pointerdown` スクロールをエラーなしで沈黙させました (`forge/findings/core-a11y-and-input.md:336`)。

### フォーカス、ロービング tabindex、読み上げ順序

- **ロービングタブインデックス**: コンポジットごとに 1 つのホットスポットに `tabIndex: 0` があります。親は矢印キーでストップを移動し、それにフォーカスします (`Table.ts:490` の `Table.handleGridKey`、`Table.ts:560` の `findHotspot`/`_focusCell`、`VirtualList`/`Tree`/`ContextMenu` と同等)。仮想化によってフォーカスされた行がアンマウントされると、`Table` は `tabIndex` (`Table.ts:667`) を再バインドする前に、ストップを表示可能な行に再固定し、古いセルが実際に保持していた場合にのみ DOM フォーカスを復元します (`Table.ts:592` の `activeCellHoldsFocus`)。そのため、他の場所にスクロールしてもフォーカスが盗まれることはありません。センチネル `a11yRoot` フォーカス トラップは、シーン内にフォーカスを保持します (`Scene.ts:1482`)。
- **読み取り/タブ順序**: ミラーは、_region_ (`a11yRegion` または `clipChildren` の祖先 (`A11yProjectionManager.ts:351`) に最も近い) ごとに、上→下にバンドソートされ、その後インラインで安定します。リージョンがないと、トランスクリプト内を垂直方向にドラッグすると、見出しが同じ行バンドを共有するサイドバーが飲み込まれます (`A11yProjectionManager.ts:339`)。ドラッグ/連続性を分離するために、非クリッピング列に `a11yRegion = true` (`Entity.ts:a11yRegion`) を設定します。 RTL は `Scene.readingDirection` (`Scene.ts:392`) です。 `a11yRoot` レイヤーはキャンバス (`Scene.ts:2403`) の上に `z-index: 10` あり、デフォルトでは `pointerEvents: none` ですが、空白の領域から選択を開始できるようにドラッグ中にのみ `auto` に反転されます。
- **サブツリーの非表示**: `a11yHidden = true` (`Entity.ts:a11yHidden`) は、サブツリー全体を投影から非表示にします。コンテナのみの `interactive = false` では、インタラクティブな子が投影されたままになります (`Popover.hide`、`forge/findings/core-a11y-and-input.md:622` で検証)。 `opacity` からは推論されません — スプリング駆動の不透明度は、ゼロに到達することなくゼロ付近を浮遊します。

## 構成を選ぶ

| 書類                              | セマンティックマージン     | 相互作用マージン            | 予算    | 注記                                                                               |
| --------------------------------- | -------------------------- | --------------------------- | ------- | ---------------------------------------------------------------------------------- |
| 装飾キャンバス                    | `contentProjection: false` | —                           | —       | DOM コストはまったくかかりません                                                   |
| 短いドキュメント (< 300 ブロック) | デフォルト                 | デフォルト                  | 256     | デフォルトはすでに最適です                                                         |
| スクロール可能な長いドキュメント  | `Infinity`                 | デフォルト (1 ビューポート) | 256     | 推奨される常駐層 — ドキュメント全体の検索 + 先読み、通信事業者は制限されたまま     |
| 10kブロックのトランスクリプト     | `Infinity`                 | `2 * viewport`              | 256–512 | インタラクションマージンが広くなり、スクロール中のプロモーションの離脱が減少します |
| パーティクル・弾幕フィールド      | — (コンテンツ投影なし)     | —                           | —       | `a11yProjection: 'onDemand'` または集約 `role: status` ライブ領域                  |

`content-visibility: auto` とホバーゲートされたテキストは両方とも測定され、拒否されました。`forge/baselines/content-projection-frontload-findings.md:Two approaches rejected` を参照してください。前者は、オフスクリーン投影に関して `display:none` を超えるものは何も購入しません。後者は、特にキーボード/AT ユーザー向けのテキストを削除します。

## 落とし穴 — すでに出荷されたバグ

1. **粗い→細かい重複** (`forge/findings/core-a11y-and-input.md:2026-08-08`) — 粗いからプロモートされたグリッド ブロックは、その `textContent` テキスト ノードを残しましたが、キャリアは `children` のみの操作によって追加され、`textContent` が 2 倍になりました (測定された文字数は 758 対 379)。キャリアループの前のテキストノードを削除することで修正されました (`ContentGridProjector.ts:111`)。
2. **ウィンドウの開始を超えた選択** (`forge/findings/core-a11y-and-input.md:2026-08-08`、`ContentGridSelectionWindow.test.ts`) - ウィンドウの _start_ を超えてスクロールすると、`Selection` を解放せずにキャリアが再構築され、切り離されたノード上に残ります。マテリアライズ ループの上に `selectionLine < start || >= end` をホイストする必要がありました。
3. **`pointerEvents: none` はマウスを強制終了します** (`forge/findings/core-a11y-and-input.md:2026-08-02`) — ホットスポット § を参照してください。警告もエラーもありません。スクロール面がデッドになっているだけです。
4. **オーバーレイの再投影ラグ** — `DirtyTracker` + `a11ySyncInterval` と `showOverlay` の相互作用が一度疑われたが、バックグラウンド ブラウザのアーティファクトとして撤回されました (`forge/findings/core-a11y-and-input.md:2026-08-16` の撤回、`2026-08-15` のオリジナル)。教訓: フレーム数の遅延がシーンに起因すると考える前に、`document.hasFocus()` とページ内 rAF カウンターを確認してください。
5. **固定 ID 衝突** (`forge/findings/core-a11y-and-input.md:2026-07-16`、`vectojs#117`) — かつて `super('ClassName')` と呼ばれていた 11 個の `ui` コンポーネントが、1 つの `a11yElements` マップ エントリを共有します。 2 つの `PanelGroup` がポインター イベントを間違ったディバイダーにルーティングしました。 `super()` で修正 → ランダム ID。
6. **`a11yHidden` 対 `interactive`** (`forge/findings/core-a11y-and-input.md:622`) — コンテナに `interactive = false` を設定しても、まだ対話型の子は非表示になりません。 `a11yHidden` はそうします。

## 自動化 — 投影は入力トランスポートでもある

Playwright `getByRole('button', { name })` がキャンバスに表示されません。これは `a11yRoot` のシャドウ ミラーにヒットし、`Scene` のミラーごとのリスナー (`Scene.ts:3512`) が `bubbles` および `stopPropagation` セマンティクスを持つ `VectoJSEvent` (`Entity.ts:VectoJSEvent`) として再ディスパッチされます。そのため、AT がアナウンスするのと同じ `A11yAttributes.label` がエージェントが使用するセレクターでもあり、アダプターも `data-testid` も必要ありません。 `debugA11y` と `getA11yTree()` はエージェントのアサーション サーフェスです。 `data-vecto-id` は、ラベルが動的である場合の安定したロケーターです。

結果: `onDemand` アイドル エンティティまたは `a11yHidden` サブツリーにはミラーがないため、**ポインター ディスパッチ パス**がありません。`scene.findEntityAt(x,y)` は引き続きエンティティ (クエリ API) を返しますが、`entity.on('click')` は起動しません。 AT 非表示の間、ポインタ反応性を維持する必要があるグローバル ジェスチャ サーフェスは、`a11yFullViewport = true` + `a11yProjection: 'eager'` + `getA11yAttributes() => ({ tabIndex: -1 })` を使用し、ロールを使用しません。ミラーはポインタ ルーティング用にフォーカス可能ですが、AT 名がありません。

`a11yFullViewport` 自体 (`Entity.ts:912`) は、他のすべてのミラーの背後に 1 つの `100vw × 100vh` ミラーをマウントします (`A11yProjectionManager.ts:fullViewportElements` は挿入順のままです)。そのため、キャンバスを覆うインタラクション サーフェスが上部のコントロールを遮ることはありません。このパターンは、`DanmakuAnnouncer`、webos デスクトップ クリック キャッチャー、および任意の無限キャンバス パン ハンドラーによって使用されます。

## `getA11yAttributes` が投影できるもの — サーフェス

`A11yAttributes` (`Entity.ts:295`) は、カスタム エンティティが必要とする唯一の a11y API です。すべてのフィールドはフレームごとに属性ごとにダーティ化されます。`undefined` は削除し、`false` は `aria-invalid="false"` を書き込みます (明示的に有効)。そのため、区別が重要です。

- **ID**: `tag` (`div`/`a`/`button`/`img`/`input`/`textarea`)、`role`、`label` / `labelledby` / `describedby`。
- **フォーカス/ポインター**: `tabIndex` (ロービング§を参照)、`pointerEvents` (`auto`/`none`)。
- **ネイティブ プロパティ** (`tag` と一致する場合のみ): `href`/`target`、`src`/`alt`、`inputType`/`placeholder`/`value`/`checked`/`textInputStyle`。
- **状態**: `disabled`、`checked`、`selected`、`expanded`、`required`、`invalid`、`level`、`valuemin`/`valuemax`、`ariaModal`、`controls`/`haspopup`/`activedescendant`。
- **仮想化セット/グリッド**: `posInSet`/`setSize` (リスト)、`rowCount`/`rowIndex`/`valueText`/`orientation` (グリッド) — これらがないと、10,000 行の仮想化リストは「アイテム 3/12」(データセットではなくウィンドウ) を通知します。
- **ライブ**: `live` (`off`/`polite`/`assertive`) + `atomic`/`relevant` — ストリーミング アナウンサー パス (ボス 04)。

`getA11yAttributes()` のデフォルト (`Entity.ts:1937`) は、`{}` → ロールのないプレーンな `div` を返します。これは、コンテンツの投影がまだ必要な非対話型テキスト ブロックにとっては正しいものです。

## 引用可能なパフォーマンス数値（どこで計測されたか）

フォーカスされた GPU を利用したウィンドウ上の `benchmarks/run-browsers.sh` 数値のみが引用可能です (グローバル `AGENTS.md` ベンチマーク ルールを参照)。以下のすべての図は、注記がない限り、そのハーネスからのものです。 `calibrateRefreshRate()` を使用します。60/240 Hz をハードコードしないでください (Firefox のデフォルトは `layout.frame_rate` なしの 60 Hz です)。 JSON エンベロープの `validation.ok`、`crossOriginIsolated`、および `refreshHz` をクロスチェックします。フォーカスのないウィンドウでは 0 ティック/秒が報告され、すべてのミリ秒の要求は無効になります。

**投影コストとインタラクティブ数** — `content/learn/accessibility.md:353`、`Entity.ts:933`:

| 状態                          | クロム             | Firefox            | ソース                                                                            |
| ----------------------------- | ------------------ | ------------------ | --------------------------------------------------------------------------------- |
| 1,000 の動くインタラクティブ  | 6.4ミリ秒/フレーム | 7.4ミリ秒/フレーム | 学習/アクセシビリティ §コスト + `lazy-a11y` フロア                                |
| 5,000 人の熱心な              | 59.5–72.2 ms       | 114 ms             | 学習テーブル + `benchmarks/lazy-a11y/` (`Entity.ts:933` ドキュメント)             |
| 5,000 `onDemand` (同じシーン) | 1.55 ms            | 1.63 ms            | `benchmarks/lazy-a11y/` フロア 1.26/1.65 ミリ秒                                   |
| 20,000 人の熱心な             | 715 ms             | 2737 ms            | 学習/アクセシビリティ テーブル (超線形: 6.4→35.7 μs/Chrome、7.4→136.9 μs/Firefox) |

**仮想化の勝利** — `forge/findings/core-a11y-and-input.md:240` (ギャラリー 346 KB マークダウン、172 ～ 238 Hz、実 GPU):

| メトリック                  | 前 (ビューポート ゲートなし) | 後                          |
| --------------------------- | ---------------------------- | --------------------------- |
| DOM 要素                    | 14,843                       | 254                         |
| 投影されたコンテンツ ノード | ~1,250                       | 29 (スクロールでリサイクル) |
| テキストノード              | 9,369                        | 160                         |
| スクロール p95              | ~50 ms                       | 4.3 ms                      |
| スクロールフレーム          | 55 fps / 18 ms               | 238 fps / 4.2 ms            |
| ヒープ                      | スクロール時は125→224MB      | ~100 MB                     |

**大まかなセマンティック層のコスト** — `forge/baselines/content-projection-frontload-findings.md: Finding 3` (Chrome 151 @ 240 Hz、Firefox 153 @ 240 Hz、`runId 20260804T155826Z-5cdf96`):

| ブロック | 行     | `firstSyncMs` (ハイブリッドとネイティブ)                             |
| -------- | ------ | -------------------------------------------------------------------- |
| 100      | 300    | 10.3 ms (1.6×) / 5.0 ms (1.1×)                                       |
| 1,000    | 3,000  | 20.6 ms (4.5x) / 16.0 ms (5.3x) — オープン時に ~1 フレームのドロップ |
| 10,000   | 30,000 | 146.6 ms (19.9×) / 144.8 ms (21.4×)                                  |

編集ごとのコストは低いままです (`editOffBand` 10k で 1.09/3.06 ミリ秒、`Finding 4`)。 `Selection`-memo 修正後の最終的な予算ドレイン (`20260805T080824Z-e79819`、`forge/baselines/content-projection-frontload-findings.md:Two approaches rejected` を実行): Chrome 1k で 21.29 → 10.66 ミリ秒、10k で 139.5 → 12.0 ミリ秒。 Firefox 21.86 → 5.88 ミリ秒、141.6 → 9.2 ミリ秒。ブロックあたり ~0.03 ミリ秒 — 以前の ~13 μs/ノードの数値は無効でした (レイアウトに入ったことのない `display:none` 常駐ノードで測定)。

## デバッグチェックリスト

1. **`scene.getA11yTree()` が最初です。** すべてのホットスポットとコンテンツ ノードは `role`/`label`/`tabIndex` とともに存在します。`getByRole` が何も見つからなかった場合、セレクター (`Scene.ts:2390` ガード、`content/learn/accessibility.md:Troubleshooting`) ではなく、`interactive` または `width`/`height` はゼロになります。 `a11yRoot` 自体はツリーから除外されます。
2. **`debugA11y: true`** (`SceneOptions:debugA11y`、`Scene.ts:204`) — `a11yRoot` 上の青い破線のアウトライン。最速の位置チェック。それ以外の場合、ミラーは `opacity: 0` です (`Scene.ts:2401` レイヤーはドラッグするまで `z-index: 10`、`pointerEvents: none` です)。 `scene.debugA11y = true` を介して実行時に切り替えます。
3. **DOM 検査** - 各ミラーには `data-vecto-id = entity.id` と `role`/`aria-*` が含まれています。 `aria-label` の存在を確認します (名前のないロールは、裸の「ボタン」/「スライダー」、`content/learn/accessibility.md:Screen reader testing checklist` として通知されます)。コンテンツ キャリアは `data-vecto-grid-*` および `data-vecto-projection-*` データセットを伝送します。 `document.querySelectorAll('[data-vecto-id]')` を使用して、ライブ ミラーと予想される数をカウントします。
4. **`scene.getA11yElement(entity.id)`** — フォーカス チェック用のライブ `HTMLElement`。 `activeCellHoldsFocus` (`Table.ts:592`) パターンは、それをテストする方法を示しています。 `null` は、このフレームが投影されていないことを意味します (オフビューポート、`a11yHidden`、または `onDemand` アイドル状態)。 `showOverlay` の前後の `scene.a11yElements.size` を比較して、オーバーレイ投影回帰を検出します。
5. **`a11yProjection` ゲート チェック** — エンゲージメントのない `onDemand` にはミラーがないため、ポインター イベントはありません。ディスパッチを非難する前に、`Scene.requestA11yProjection` またはフォーカス状態を確認してください。 `findEntityAt` は依然として動作する (ゲートされていない) ことに注意してください。したがって、キャンバス レベルの `pointerdown` ハンドラーは起動しますが、エンティティ自体の `on('click')` は起動しません。
6. **`pointerEvents` 監査** — `grep -rn "pointerEvents.*none" packages --include="*.ts"` およびハンドラーの所有権を確認します。サイレント スクロール/選択の失敗は、クリップのバグよりも頻繁に起こります。 `ScrollView.ts:289` の `ScrollView` は、正規の Wrapper-owns-none、child-owns-auto ペアです。
7. **順序の読み取り** — `getA11yTree()` をダンプし、バンドの順序が視覚的な行と一致することを確認します。 `a11yRegion` の配置が間違っていると、バンド メジャーが予期される場所でリージョン メジャーの順序として表示されます (`A11yProjectionManager.ts:351` リージョン バケット化)。
8. **選択/グリッド キャリブレーション** — `ContentProjectionManager.scheduleGridCalibration` はセルごとに `scaleX` を書き込みます。 `data-vecto-grid-calib` の生成を確認します。フォントのロード後の世代が古いということは、`contentFontEpoch` がバンプされなかったことを意味します。 `content-visibility: auto` は測定され、拒否されました (`forge/baselines/content-projection-frontload-findings.md:Two approaches rejected`)。 `a11yRoot` の `contain: layout` は意図的です (`Scene.ts:2402`)。
9. **パフォーマンストリアージ** — `PhaseTimer` フェーズ `calibScan`/`calibProbeBuild`/`gridMaterialize` (`scene/PhaseTimer.ts`)、`ContentGridProjector` `vectoGridMaterializeMs` データセット、`scene.frameStats` (`Scene.ts:518`)、および DevTools `getDevtoolsDescriptor()` `ScrollView`/`VirtualList`/`Table`。引用可能な数値については、フォーカスされたウィンドウ上の `benchmarks/run-browsers.sh` のみがカウントされます。バックグラウンドの Hyprland では `0 ticks/s` が与えられ、フレームごとの主張はすべて無効になります (`forge/findings/core-a11y-and-input.md:2026-08-16` の撤回)。

## 仮想化が実際に機能しているか確認する方法

3 つのチェックを順番に行います。

1. **DOM をカウントします。** `document.querySelectorAll('[data-vecto-id]').length` 対 `scene.a11yElements.size` 対データセット サイズ。 10k 行の仮想化テーブルには、10k ではなく ~`viewport/rowHeight + 2*overscan` ミラーが表示されるはずです。数値がデータセットを追跡する場合、仮想化はオフになります (`viewportHeight` が設定されていないか、ウィンドウ化されたプールではなくすべての行エンティティで `a11yProjection: 'eager'` が設定されています)。
2. **スクロールして再カウントします。** セットはリサイクルする必要があります。ウィンドウが移動すると、カウントは同じですが、異なる `data-vecto-id` が表示されます。カウントの増加は、ミラーのリークを意味します (アンマウント時に呼び出されない `detachA11y`、または縮小せずに拡大するプール - `Table.ts:701` 縮小ループと `VirtualList.ts:_reconcile` リサイクル ブランチを確認してください)。
3. **パフォーマンス エンベロープ。** フォーカスされたウィンドウ上の `scene.frameStats` (`Scene.ts:518`) + `benchmarks/run-browsers.sh --validation`。仮想化後もスクロール p95 が 10 ミリ秒を超える場合、コストは DOM カウントではなくなります。`PhaseTimer` グリッド キャリブレーションまたは `syncA11y` ウォーク自体 (`viewportCullChildren`、`vectojs#350` を含まない `O(total entities)`) を確認してください。

## このボスがドキュメントグラフのどこに位置するか

- **前提条件**: Boss 06 (VMT ランタイム - ダーティ/ライフサイクル/イベント、`DirtyTracker`、`DriverTicker`、`Scene` ループ)。このボスは 06 のダーティ/ライフサイクル機構を再利用しており、VMT ステップを知っていることを前提としています。
- **組み合わせ**: Boss 01 (セレクション — コンテンツ プロジェクションのもう一方のコンシューマー)、`content/learn/accessibility.md` (ハウツー)、`content/reference/core-a11y.md` (API 真実)、`content/reference/core-entity.md` (`A11yAttributes` サーフェス、`getA11yAttributes`/`getContentProjection`/`getContentEpoch` フック)。
- **結果は**: Boss 04 (ストリーミング マークダウン — `Markdown` 仮想化ハンドシェイク + このボスのウィンドウ処理を再利用する増分調整)、Boss 07 (レンダラー — ビジュアル層のクリップ/DPR 一貫性)、Boss 12 (DevTools — 仮想化状態の `getDevtoolsDescriptor` サーフェス)。

`vectojs-docs/content` と `vectojs-website/src/content` の間に `cp -r` がありません — フォーマットドリフト + 408 i18n ファイル (`AGENTS.md`)。まず権限のある側 (`vectojs-docs/content`) を編集し、`scripts/sync-content.py` でプレビューしてから、両方のリポジトリをプッシュします。

## 不変条件（このボス向けコミットチェックリスト）

1. **ダーティ + ジオメトリは一致します。** `getContentProjection()` 出力が異なる場合は常に `getContentEpoch()` がバンプします。 `Scene` は、2 回目の同期以降、変更されていないブロックをスキップします。これを破ると、フレームごとに `O(changed)` ではなく `O(total blocks)` が支払われます。 `content-visibility` ショートカットはありません - 測定され拒否されました。 `onDemand` アイドル状態のエンティティは定義上、ダーティではありません。
2. **表示されるすべてのインタラクティブのデュアルワールド パリティ。** ワールド ジオメトリ、ロール/名前/状態、およびフォーカス/ポインターのルーティングは、共有の `syncA11y` ウォークと `enforceA11yDomOrder` のリージョンごとの視覚的並べ替えによって強制される、キャンバスの真実と一致します。 1 つの `interactive = false` 対 `a11yHidden` スリップは、非表示のコントロールをタブ オーダーに投影します。アクセス可能な名前が `aria-labelledby` / 含まれるテキストから来ている場合を除き、すべてのインタラクティブには `aria-label` が付けられます。 `a11yFullViewport` ミラーは常に通常のミラーの背後にあります。
3. **連続ウィンドウ。** ライン グリッド ウィンドウは、ブロックごとに 1 つの連続した実行です (`scene/content-line-window.ts:Contiguous on purpose`)。ギャップがあると、テキストが選択/コピーの順序から外れて接合されます。 `clipChildren`/`a11yRegion` は唯一のリージョン ブレークです。セマンティック マージンとインタラクション マージンの間の分割は API 全体です。分割しないでください。
4. **ポインタの所有者は明示的です。** すべてのホットスポット ペアは、ポインタの所有者が誰であるかを宣言します。エンティティを直接駆動するテストは、マウス パス (`forge/findings/core-a11y-and-input.md:336`) を沈黙させる `pointerEvents: 'none'` をキャッチしません。エンゲージメントのない `onDemand` は設計上ポインターデッドです。AT 不可視のポインター表面には `a11yFullViewport` + `eager` + `tabIndex: -1` を使用してください。
5. **読み取り順序は挿入ではなく視覚的なものです。** `A11yProjectionManager.sortNormalElementsVisually` + 領域バケット化はタブ/AT 順序です。子を任意の順序で挿入しますが、左→右に描画する場合でも、左→右にタブを付ける必要があります。 `a11yHidden` は不透明度から推測されることはありません。 `forcedColors` (`Scene.forcedColors`) は再描画の問題であり、投影の問題ではありません。高コントラストの描画はビジュアル層に残ります。
6. **Budget は表示テキストを非表示にしません。** `contentSemanticBudget` はインタラクション バンド内のブロックを遅延させることはありません。表示テキストを遅延させると、一時的に選択できなくなります (`Scene.ts:376`)。保証は `ContentProjectionSettledWalk.test.ts` (2 対 802 ボックス テスト) によってテストされます。 `Infinity` は、`contentSemanticMargin` に対しては安全ですが、`contentProjectionMargin` に対しては禁止されています。サポートされなくなったコストは、常駐テキストではなく、ウィンドウ化されていないキャリア バンドでした。
7. **仮想化セットはデータセット サイズをアナウンスします。** 項目が 10,000 個あり、マウントされた行が 12 行ある仮想化リスト/グリッドは、`posInSet`/`setSize` (または `aria-rowcount`) を投影する必要があります。そのため、AT は「12 の項目 3」ではなく、「10000 の項目 400」を認識します。 `role="list"` 上のコンテナレベルの `aria-setsize` は許可されません (`VirtualList.ts:660`)。

## さらに読む — すべての主張に出典あり

| 請求                                 | `file:line`                                                                                                                                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| シーンの選択肢・予算                 | `Scene.ts:204`, `263`, `328`, `336`, `359`, `600`, `1398`, `1481`, `2403`, `3512`                                                                                                                   |
| エンティティ a11y + コンテンツフック | `Entity.ts:295`, `788`, `912`, `968`, `1898`, `1970`, `2018`, `2048`                                                                                                                                |
| プロジェクトマネージャー             | `A11yProjectionManager.ts:30`, `157`, `169`, `178`, `351` · `ContentProjectionManager.ts:26` · `ContentGridProjector.ts:69` · `content-line-window.ts:25`                                           |
| UI仮想化                             | `ScrollView.ts:58`, `233`, `289` · `VirtualList.ts:14`, `117`, `170`, `660` · `Table.ts:144`, `392`, `624`, `751` · `Card.ts:80`                                                                    |
| マークダウンタイリング               | `Markdown.ts:625`, `652`, `681`, `774`                                                                                                                                                              |
| 調査結果/ベースライン                | `forge/findings/core-a11y-and-input.md:178`·`240`·`336` · `forge/baselines/content-projection-frontload-findings.md:1` · `content/learn/accessibility.md:353` · `content/reference/core-a11y.md:10` |
| ホットスポットの先行例               | `vectojs/AGENTS.md` (ゼロ DOM ホットスポット) · PR #160 · PR #191 · `Table.ts:56`                                                                                                                   |

---

_次へ: 04 ストリーミング マークダウン — インクリメンタル lex、ワーカー + リコンサイル、および `Markdown`↔`ScrollView` 仮想化ハンドシェイク。_
