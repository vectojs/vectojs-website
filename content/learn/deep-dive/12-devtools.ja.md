---
title: '12 — DevTools — ランタイム内省と監査'
description: 'なぜ canvas に Elements パネルがないのか、VMT インスペクタが状態空間でそれをどう置き換えるのか、そしてヘッドレスモデル層 — ピッキング、ジオメトリ読み出し、監査、スナップショット、ヒット説明、ダーティフレーム帰属、ブリッジ／プラグインプロトコル。'
order: 32
---

# 12 — DevTools — ランタイム内省と監査

> `<canvas>` には Elements パネルがない。ブラウザはピクセルと DOM ミラーは見せられるが、どのピクセルを塗りどのミラーを保持するかを決定した Virtual Math Tree は見せられない。DevTools はそのパネルである — VectoJS シーンのデバッグをスクリーンショットではなく数値の世界に留める状態空間インスペクタだ。

- **学べること**: なぜ VectoJS に独自のインスペクタが必要なのか、パネルが検査対象シーンの邪魔をせずに済む仕組み、そしてヘッドレスモデル層のすべての純粋関数 — ツリーモデル、ピッキング、Entity／a11y／テキスト読み出し、7 つのジオメトリレイヤー、レイアウト／a11y／テキスト／選択／GPU／アクセラレータ監査、スナップショット／差分、ヒット説明、イベントトレース、ダーティフレーム診断、JSON-RPC ブリッジとプラグインプロトコル。
- **学べないこと**: `Scene` がどのようにフレームをスケジュールするか（ボス 06）、レンダラーがそれをどう描くか（ボス 07）、WASM がそれをどう高速化するか（ボス 08）。本ドキュメントはそれらのサブシステムを**変更せずに読み取る**ためのツールである。

## 1. なぜスクリーンショットの前に数値なのか

スクリーンショットは「何かがおかしい」に答える。数値は**どの Entity**がおかしいのか、**何ピクセル**ずれているのか、そして**なぜエンジンがそれを正しいと思ったのか**に答える。DevTools パッケージ全体（`packages/devtools/src/`）はその梯子に沿って構成されている:

1. **特定** — ピクセルを所有する Entity はどれか（`pickInScene`）と、ツリー内のどこに位置するか（`buildTreeModel`、`entityPath`）。
2. **計測** — ワールド単位でのジオメトリ、transform、ワールド境界（`inspectEntity`）と、乖離しうるすべてのボックス（`highlightGeometry`）。
3. **説明** — なぜエンジンが期待したものではなくその Entity を選んだのか（`explainHitTest`）、そしてブラウザイベントが実際にどこに到達したのか（`createEventTrace`）。
4. **監査** — 目には正常に見えても構造的不変条件に違反している Entity がないか（`auditScene`、`auditA11y`、`auditTextShaping`）。
5. **差分** — 2 つの状態間で何が変わったか、ランダムな id ではなく安定したパスでアドレス指定する（`captureSnapshot` ／ `diffSnapshots`）。
6. **帰属** — なぜ `onDemand` シーンが決してアイドルにならないのか、そしてレンダーループの実際のコストは何か（`diagnoseDirty`、`Scene.frameStats` は `packages/core/src/tree/Scene.ts:3515`）。

各段階はピクセルではなくプレーンデータを返す。それによりすべてのチェックが CI ゲートになる: `expect(auditScene(scene)).toEqual([])`（`vectojs-docs/content/reference/devtools-audit.md:12`）。

## 2. 2 つのサーフェス、1 つのモデル層

| サーフェス                                     | エントリ                                                                          | レンダリング                                                                                                           | `destroy()` が必要                                                                                                | 本番に出荷                                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **パネル**（`@vectojs/devtools`）              | `attachDevtools(scene)` → `DevtoolsPanel` は `packages/devtools/src/panel.ts:140` | ビューポート端にドッキングされた独自の `Scene`、`contentProjection: false`、`renderMode: 'onDemand'`（`panel.ts:299`） | はい — `destroy()` はタイマー、リスナー、ハイライト、パネルシーン、コンテナを破棄する（`panel.ts:1272`）          | しない — `if (import.meta.env.DEV)` ガード（`vectojs-docs/content/reference/devtools.md:51`） |
| **ヘッドレス**（`@vectojs/devtools/headless`） | `packages/devtools/src/headless.ts:1` から再エクスポートされた純粋関数            | なし                                                                                                                   | `EventTrace` のみが document リスナーをアタッチし（`packages/devtools/src/eventTrace.ts:85`）、`destroy()` が必要 | はい — パネルなし、`@vectojs/ui` 依存なし、Vitest／Node／エージェントで利用可能               |

パネルはヘッドレス層を**呼び出す**のであり、複製しない。ヘッドレス層は約 60 の公開された純粋関数を担う — より大きく有用な半分である（`vectojs-docs/content/reference/devtools.md:18`）。

```ts
import { attachDevtools } from '@vectojs/devtools';
import { auditScene, captureSnapshot, explainHitTest } from '@vectojs/devtools/headless';

if (import.meta.env.DEV) {
  const devtools = attachDevtools(scene, { traceEvents: true });
  // devtools.detach() === devtools.destroy()
}
```

`DevtoolsOptions` は `packages/devtools/src/panel.ts:42` — `width` デフォルト 360、`refreshInterval` デフォルト 500、`dockSide` は `right|left`、`showPerf` デフォルト true、`traceEvents`／`traceCapacity`、`defaultTab`。ヘッドレスサブパスが存在するのは、本番テストバンドルがパネルや `@vectojs/ui` なしでモデル層だけを引き込めるようにするためである（`vectojs-docs/content/reference/devtools.md:58`）。

## 2a. パネルが表示するもの — そして意図的に表示しないもの

ドックヘッダー（`packages/devtools/src/panel.ts:306`）は 3 つのゴーストボタン — **⌖** ピック（`panel.ts:340`）、**⟳** リフレッシュ（`panel.ts:341`）、**⚠** 監査（`panel.ts:342`）— と 3 つのカウント `Pill`（`panel.ts:104`）を備える: 総 Entity 数、インタラクティブ **⚡**、監査所見 **⚠**（`panel.ts:345`）。`Tabs` バー（`panel.ts:537`）はツールを **Tree · Info · Audit · A11y · Log · ⚙** に分割し、登録された `PluginInspector` ごとに 1 つのタブを追加する（`panel.ts:530`、`panel.ts:1027`）。

- **Tree** — `TreeView` は `panel.ts:383`、フィルタ `Input` は `panel.ts:371`。`setFilter(text)` は `panel.ts:761` で `applyFilterToTree`（`panel.ts:767`）経由で枝刈りし、`{...node}` をシャローコピーするためオリジナルは完全な子リストを保持する; フィルタされたラベルはバージョン安定な高速パスでも書き換えられる。行は `type (x,y) W×H ⚡ ▶` を表示する。
- **Info** — `INSPECT_ROWS = 20` 行の `Text`（`panel.ts:71`）は `describeEntity` からの 6 つの汎用行に加え、記述子出力、インライン `x/y/opacity` エディタ（`panel.ts:418`）、`entityPath`（`inspect.ts:82`）と `inspectEntity` JSON に裏打ちされた **Copy path ／ Copy JSON** ボタン（`panel.ts:442`）を示す。矢印キーで 1 px ナッジ（Shift: 10 px）、`+/-` で opacity を 0.1 ずつステップ（`panel.ts:228`）— コードに触れる前にどの Entity がレイアウトバグを所有するかを確認できる。
- **Audit** — `TreeView` は `panel.ts:469`、所見ごとに行を一覧（`panel.ts:844`）、`selectFinding(i)` は `panel.ts:860` でマージされた `auditRows`（シーン ＋ プラグインは `panel.ts:840`）経由で解決し、`findings[i]` だけではない。
- **A11y** — `A11Y_ROWS = 22` 行（`panel.ts:73`）は `panel.ts:1173` の `writeA11y` から: `inspectA11y` 読み出し（`a11yInspect.ts:227`）に加え、キャッシュされた `auditA11y` 所見を選択された Entity には `▸` 付きで表示する。
- **Log** — `traceEvents: true`（`panel.ts:47`）時の境界付き `EventTrace` エントリ（`panel.ts:511`）、`traceCapacity` デフォルト 50（`panel.ts:49`）。`eventTrace.subscribe` → `writeTrace`（`panel.ts:521`）→ `panelScene.markDirty()` 経由で更新される。
- **Settings（⚙）** — `buildSettings` は `panel.ts:654`: ハイライト用 `Toggle`、`refreshInterval` と `dockSide` 用 `Dropdown`。`setRefreshInterval` は `panel.ts:1070` で両方のタイマーをゲートする; `setDockSide` は `panel.ts:1088` で `applyDockSideStyle`（`panel.ts:635`）経由でスタイルを交換する。
- **Perf ストリップ** — 下部に固定された `Card`（`panel.ts:557`）は `layout()`（`panel.ts:608`）で再フローし、`Scene.frameStats` を 250 ms ごとに読む（`panel.ts:571`）。
- **選択ハイライト** — ホストオーバーレイ上の `HighlightEntity`（`panel.ts:874`）、デフォルト `['aabb']`（`panel.ts:172`）、`setHighlightLayers`（`panel.ts:926`）で切り替え可能。

ドックコンテナと canvas は `pointer-events: none`（`panel.ts:288`）であり、`Scene.a11yRoot` と同様 — 空のドックピクセルがホスト入力を奪うことは決してない。

## 3. ツリーモデルとピッキング — エンジンと同じ走査

### 3.1 ツリーモデル

`buildTreeModel(root)` は `packages/devtools/src/model.ts:31` で `{ nodes, index }` を返す:

- `nodes` — `root` の直接の子ごとに 1 エントリ、それぞれが独自のサブツリーを持つ。葉は `children: undefined` であり、`[]` ではない（`model.ts:40`）。
- `index: Map<string, Entity>` — すべての深さのすべての子孫を `entity.id` をキーとして保持し、選択された id がライブな Entity にラウンドトリップできる。
- `label` — `` `${type} (${x},${y}) ${W}×${H} ⚡ ▶` `` は `geometryLabel`（`model.ts:16`）で焼き付けられ、`interactive` ／ `hasPendingAnimations()` のときのみバッジが付く。

`refreshTreeLabels(nodes, index)` は `model.ts:56` でそれらのジオメトリバッジをインプレースで書き換える — ノードやインデックスのチャーンなし — 少なくとも 1 つのラベルが変わったときに `true` を返し、パネルが再描画作業をスキップできるようにする。`RECONCILE_INTERVAL_MS = 3000`（`panel.ts:80`）ごとの強制 reconcile は、`structureVersion`（`panel.ts:581`、`vectojs-docs/forge/findings/devtools-and-telemetry.md:356`）をバンプせずに `children` を変更した際の古さを上限付ける。

### 3.2 ピッキング

`findEntityAt(root, x, y)` は `model.ts:82`、`pickInScene(scene, x, y)` は `model.ts:214` にあり、意図的に **同じ走査と同じ受理述語**を `HitTester.findHitRecursively`（`packages/core/src/tree/scene/HitTester.ts:227`）と共有し、`vectojs#483` 以降に検証済みである:

- `opacity <= 0` で早期リターンしサブツリーを枝刈りする（`model.ts:86`）。
- `insideClipAncestors`（`model.ts:115`）はすべての `clipChildren` 祖先のワールドボックスを `worldToLocal` 経由でチェックする — スクロールアウトしたコンテンツはピック不可である。
- `isPointerTransparent`（`model.ts:105`）は `HitTester.isPointerTransparent` を反映する — `disabled === true` または `pointerEvents: 'none'` はヒットから除外するが、子は依然として走査される。
- `isPointInside(x,y)` のみが決定する（`model.ts:95`）— ワールド AABB フォールバックなし、したがってパーティクルや装飾形状が誤って所有者になることはない（`model.ts:77`、`vectojs#483` で修正、`forge 2026-08-13`）。

`pickInScene` はまずオーバーレイツリー、次にメインツリーをチェックする（`model.ts:215`）ため、開いたモーダルが背後のコンテンツに勝つ — 最も一般的な「クリックがどこにも届かない」驚きである。`findEntityAt` は渡された root 自体もテストするため、`scene.rootEntity` を渡すとその root が返ることがある; `pickInScene` がより安全なデフォルトである（`vectojs-docs/content/reference/devtools-inspect.md:46`）。

## 4. 選択読み出し — ジオメトリ、記述子、所有されたプロパティ

### 4.1 1 つの Entity に対する 2 つの読み出し

- `describeEntity(entity)` は `model.ts:153` — パネル用の `string[]`: 6 つの固定行（type／id、`x/y/w/h` はレイアウト所有プロパティに `*` 付き、scale／rotation／opacity、`world [a b c d e f]`、interactive／animating、子カウント）に加え、`layoutControlledProperties` が空でないときの `* prop set by Parent — edits revert` 行（`model.ts:172`）、その後 Entity 自身の `getDevtoolsDescriptor()` を `DESCRIPTOR_LINE_BUDGET = 12` 行に制限（`model.ts:151`）。フィールド値は 32 文字で、ノートは 60 文字で切り詰められる（`model.ts:143`）。throw する記述子はパネルを中断させるのではなく `— descriptor threw —` を寄与する（`model.ts:184`）。

- `inspectEntity(entity)` は `packages/devtools/src/inspect.ts:99` — マシン用の `EntityInfo`（`inspect.ts:4`）: すべての数値は小数第 2 位に丸められ（`inspect.ts:48`）、`worldTransform`、`worldBounds`、`interactive/animating/clipChildren/childCount`、任意の `text`（`inspect.ts:70` の `textPreviewOf` 経由、`TEXT_PREVIEW_MAX = 80`）、任意の `a11y { tag, role, label }`、任意の `descriptor`、任意の `layoutControlled`（`inspect.ts:42`）。どちらも throw する `getDevtoolsDescriptor()` をツール全体をクラッシュさせずに扱う — デバッグ対象の Entity で壊れるデバッグツールは、フィールドが 1 つ欠けるツールより悪い（`inspect.ts:136`）。

`entityPath(entity)` は `inspect.ts:82` で `Scene > Card#a1b2 > Text#c3d4` を id を 8 文字に切り詰めて描画する; ツリーのトップ（親なし）は `Scene` として表示される — デタッチされた Entity が本物の root と区別がつかなくなるため、パスが不審に短く見えるときは確認する価値がある。

### 4.2 レイアウト所有プロパティ

`layoutControlledProperties(entity)` は `inspect.ts:157` で**親**の `getLayoutControlledProperties(child)` に問い合わせる — コンテナだけがどのプロパティを上書きするかを知っている（`ScrollView` は内部ラッパーと呼び出し元が追加した子を区別する）。パネルはそれらのプロパティをインラインで `*` でマークし（`model.ts:161`）、ユーザーが 1 つを編集したとき、次のレイアウトで値が戻ることを即座に説明する（`panel.ts:1108`、`panel.ts:1153`）。編集を静かに拒否するのではない。Stack の子を編集して何が動くか見ることは正当である; なぜ跳ね戻ったかを隠すことは正当ではない。

## 5. ハイライトジオメトリ — 7 つのボックス、1 つのバグクラス

`highlightGeometry(scene, entity, opts?)` は `packages/devtools/src/highlightGeometry.ts:1` で最大 7 つの `HighlightLayer` 値を、要求順に関係なく常に固定順で返す:

| Kind      | 意味                                                             | ソース                                                     |
| --------- | ---------------------------------------------------------------- | ---------------------------------------------------------- |
| `aabb`    | 変換されたレイアウト quad の軸平行ボックス                       | `getWorldBounds()`                                         |
| `layout`  | 回転／スキューを含む真の quad                                    | ワールド transform × `[0,0,w,h]`                           |
| `render`  | `getBounds()` — Entity が実際に描画する場所                      | `entity.getBounds()`                                       |
| `clip`    | 最も近い `clipChildren` 祖先のボックス                           | 祖先走査                                                   |
| `content` | 選択可能な DOM コンテンツミラーのボックス                        | `getContentElement` 経由の `rectToSceneBox`                |
| `a11y`    | a11y 投影要素のボックス                                          | `packages/core/src/tree/Scene.ts:6446` の `getA11yElement` |
| `hit`     | `isPointInside` をプローブしてサンプリングされた実際のヒット領域 | `sampleHitRegion`                                          |

いずれかのレイヤーでの `divergesFromLayout` は、そのボックスがレイアウト quad と 1 px を超えて不一致であることを意味する — クリックがユーザーが狙った場所とずれる条件である（`vectojs-docs/content/reference/devtools-inspect.md:222`）。`highlightGeometry` は決して throw しない; 利用できないレイヤーは `{ kind, polygons: [], unavailable: reason }` を返す。

`hit` はデフォルトセットに含まれない — `isPointInside` をグリッド上でサンプリングし（`hitSampleStep` デフォルト 8、`hitSampleBudget` デフォルト 4096、`packages/devtools/src/highlightGeometry.ts:1`）、コストは `O((w/step)·(h/step))` プローブであるため、`step` を半分にするとコストは 4 倍になる。`hit` の乖離は範囲ではなく**面積カバレッジ**で判定されるため、正方形内の円が検出される（`vectojs-docs/content/reference/devtools-inspect.md:225`）。パネルの `HighlightEntity` は `panel.ts:1337` でこれらのレイヤーを `showOverlay()`（`panel.ts:876`）経由でホストシーンのオーバーレイ上に描画し、`LAYER_COLORS`（`panel.ts:1325`）で色分けし、`aabb` は既存スクリーンショットが読みやすいよう元の `ACCENT` を保持する。

## 6. 監査 — 構造化された所見、ソート済み、決定論的

すべての監査は決定論的にソートされた `Finding[]` を返すため、スナップショットは安定する。

### 6.1 レイアウト監査

`auditScene(scene, opts?)` は `packages/devtools/src/audit.ts:321` で `auditTree(root, sceneBounds, opts)`（`audit.ts:130`）に委譲する。4 つの `AuditKind` 値（`audit.ts:7`）:

- `text-overflow` — 計測されたテキストボックスが最も近いサイズ付き非テキスト祖先からはみ出す。
- `clip-overflow` — コンテンツが `clipChildren` 祖先からはみ出す（`ScrollView`／`VirtualList`／`TreeView`／`Table` では垂直方向は除外、`audit.ts:51` の `DEFAULT_SCROLLABLE` 経由）。
- `overlap` — **兄弟のみ**、`SpatialHashGrid` でブロードフェーズされた走査（`audit.ts:190`）で、以前の $O(k^2)$ 二重ループの代わりに — 各ボックスは一度だけ計算され、グリッドセルの隣接のみが比較される。両軸で `tolerance` を超える交差が必要（`audit.ts:231`）。
- `viewport-overflow` — サイズ付き祖先がまったくなく、Entity が `sceneBounds` からはみ出す。

オプション: `tolerance`（デフォルト 0.5）、`includeOverlay`（デフォルト false — モーダル／ハイライトは意図的にフロー外）、`scrollableTypes`（`constructor.name` でマッチ）、`ignore`（サブツリーを枝刈り）、`ignoreOverlap`（意図的な重ねを許可）。`opacity: 0` はサブツリー全体を枝刈りする; 所見は `kind → entityPath → otherPath` でソートされる（`audit.ts:305`）。`includeOverlay: true` の結果は 2 つの連結されたソート済み実行であり、1 つのグローバル順序が必要なら再ソートすること（`vectojs-docs/content/reference/devtools-audit.md:85`）。

`worldBox` は `audit.ts:70` で `getWorldBounds()` ではなく `getWorldTransform()` 経由の宣言された `[0,0,w,h]` ボックスを使う — 包含では宣言されたボックスが契約であり、レンダー範囲は `clip-overflow` に属する。

### 6.2 a11y 監査

`auditA11y(scene, opts?)` は `packages/devtools/src/a11yInspect.ts:299` で 5 つの `A11yAuditKind` 値（`a11yInspect.ts:23`）を出力する:

`no-accessible-name`、`role-tag-conflict`、`disabled-divergence`（opacity 0.6–0.9 にデッドバンドあり）、`focusable-but-clipped`、`duplicate-label`（2 つ目以降に対して報告され、`otherId` は最初を指す）。レイアウト監査とは異なり**デフォルトでオーバーレイを含む** — モーダルはフォーカストラップが存在する場所であり、`a11yHidden` はサブツリー全体を枝刈りする。結果は walk 順であり、`duplicate-label` は最後に追加される（`vectojs-docs/content/reference/devtools-audit.md:137`）。

### 6.3 テキスト整形監査

`auditTextShaping(scene)` は `packages/devtools/src/textInspect.ts:447` で `scene.rootEntity` のみを走査し、1 つの kind `atlas-miss` を出力する — フォントアトラスにないグリフを、所見ごとに 5 つの異なる欠損にサンプリングする。**prepared-text** パスのみが出力しうる; コンテンツグリッド Entity は決して出力しない（`vectojs-docs/content/reference/devtools-audit.md:157`）。

### 6.4 選択監査

`auditSceneSelection` ／ `auditEntitySelection` は `packages/devtools/src/selectionAudit.ts:1` で、Entity 自身のローカル行ジオメトリをライブな DOM `Range` rect と比較し、DPR／zoom が除外されるようローカル論理ピクセルに正規化する。違反行ごとに `selection-drift` を `expectedLeft/Right`、`actualLeft/Right`、`leftDrift/rightDrift` とともに出力する。実ブラウザが必要 — `document` をガードなしで参照する（`vectojs-docs/content/reference/devtools-audit.md:202`）— 実行中はユーザーの現在の選択をクリアする。

## 7. スナップショットと差分 — スクリーンショットなしのリグレッション

`captureSnapshot(scene)` は `packages/devtools/src/snapshot.ts:133` で決定論的で JSON セーフなツリーをキャプチャする: 子の順序はレンダー順、数値は小数第 2 位に丸められ（`snapshot.ts:52`）、デフォルト値のプロパティは省略される。`diffSnapshots(a, b)` は `snapshot.ts:302` で `path ／ kind（'added'|'removed'|'changed'）／ changes` を持つ `SnapshotDiff[]` を返す。

キー付与 — なぜ名前変更された行が 200 行の書き換えにならないのか: `nodeKey(entity)` は `snapshot.ts:79` で `devtoolsKey`（`k:`）を優先し、次に a11y `label`（`l:`、`KEY_LABEL_MAX = 64` は `snapshot.ts:55`）を優先し、描画テキスト（コンテンツであり同一性ではない）や Entity id（実行ごとにランダム）を決して使わない。`keyedPairs` は `snapshot.ts:196` でレベルの**両側**でキーが一意なときのみキーを使う; 衝突時はインデックス整列にフォールバックする。パスはキー付きのとき `Row{k:row-42}`、そうでないとき `Row[7]` を使う（`snapshot.ts:163`）ため、パス自体が並べ替えを越えて生存する（`vectojs-docs/forge/findings/devtools-and-telemetry.md:317`、`vectojs#481/#510` で修正）。

`COMPARED_KEYS` は `snapshot.ts:142` でのみ比較される（`type/x/y/width/height/worldBounds/opacity/interactive/animating/clipChildren/text`）; `scene.width/height`、`id`、`key` は差分を生まず、`added`／`removed` は再帰しない。

## 8. ヒット説明とイベントトレース

### 8.1 ヒットテストの説明

`explainHitTest(scene, x, y)` は `packages/devtools/src/hitExplain.ts:139` で `HitTester` と同じ順序で同じゲートを適用しながら走査するが、最初のヒットで return するのではなくノードごとに `HitCandidate` をその `HitVerdict`（`hitExplain.ts:20`）とともに記録する: `accepted ／ invisible ／ clipped ／ pointer-transparent ／ outside-shape ／ occluded`。`invisible`（`opacity <= 0`）はサブツリーを枝刈りし、スキップされた子孫数を名前で示す（`hitExplain.ts:154`）。オーバーレイが先、次にメイン（`hitExplain.ts:267`）— 最も一般的な驚きである。`occluded` は後段で割り当てられる: さもなければ受理された勝者の下の Entity は書き換えられる（`hitExplain.ts:278`）ため、「このピクセルの下に何個あるか」は数えられる。`formatHitExplanation` は `hitExplain.ts:299` でインデントされた行をグリフ `✓ ／ · ／ ✗`（`hitExplain.ts:306`）で描画する。

これは診断であり、フレームごとの呼び出しではない — ツリー全体を走査する。WASM ヒットグリッドシーンでは、ゼロサイズの `clipChildren` 祖先が `clipped` として説明されながら WASM パスでは依然としてヒットが登録されることがある: 1 つだけ文書化された乖離である（`vectojs-docs/content/reference/devtools-inspect.md:293`）。

### 8.2 イベントルーティングトレース

`createEventTrace(scene, opts?)` は `packages/devtools/src/eventTrace.ts:275` で VMT リスナーを追加したりディスパッチを変更したりせずにブラウザ入力を観測する。7 つの `EventTraceType` 値（`eventTrace.ts:6`）、4 つの `EventTraceSource` 値（`eventTrace.ts:16`: `a11y ／ content ／ canvas ／ document`）、`EventTraceOptions.capacity` デフォルト 50（`eventTrace.ts:44`）。各 `EventTraceEntry`（`eventTrace.ts:26`）はターゲット id／パス、シーン＋ローカル座標、修飾子、ホイール用の `deltaX/Y`、最終的な `defaultPrevented` を記録する。

`defaultPrevented` は投影された VMT ルーティングの後の**マイクロタスク**で確定するため、アプリの最終的なショートカット／選択決定を反映する（`eventTrace.ts:95` `onEventBubbled`）。テストはアサートする前にマクロタスクを await しなければならない。`pointermove` は約 60 Hz フレームごとに 1 つに合体される（`POINTERMOVE_COALESCE_MS = 16` は `eventTrace.ts:77`）ため、$O(n)$ ピックが perf HUD を歪めない（`eventTrace.ts:69`、`vectojs#707`）。14 個の document リスナーをアタッチし、**必ず** `destroy()` しなければならない唯一のヘッドレスオブジェクトである（`eventTrace.ts:171`）; `entries` はコピーではなくライブな内部配列を返す。

## 9. テキスト、GPU、アクセラレータ、Markdown 読み出し

`inspectText(entity)` は `packages/devtools/src/textInspect.ts:179` で `TextInspection`（`textInspect.ts:15`）を返す。`.text` も `.value` も存在しないときは `null` を返す。そうでなければ解決された bidi レベル、`levelRuns` と反転セグメント、`visualOrder`、 `Intl.Segmenter`（`textInspect.ts:148`）経由で再セグメント化されたグラフェム `clusters`、そして 3 つのティアのいずれかでのグリフごとの詳細を担う（`textInspect.ts:157`）:

| ティア                     | `glyphs[].x` | `metrics/lines` | `atlasMiss` |
| -------------------------- | ------------ | --------------- | ----------- |
| 準備済みコンテンツグリッド | はい         | はい            | 決してない  |
| 準備済みテキスト           | いいえ       | いいえ          | はい        |
| どちらでもない             | グリフなし   | なし            | なし        |

`unavailable: string[]`（`textInspect.ts:74`）は報告できなかったすべての機能とその理由を名前で示す — 欠落したフィールドは静かに欠落するのではなく常に説明される。`shapeProbe(text, opts?)` は `textInspect.ts:295` で Entity や Scene なしで同じパイプラインに任意の文字列を通すため、整形は単体テストでチェックできる。`formatTextInspection` は `textInspect.ts:348` でパネル／プラグインタブ用の `PluginRow[]` を描画する。

`gpuInspector` ／ `inspectGpu(scene)` は `packages/devtools/src/gpuInspect.ts:1`、`acceleratorInspector` ／ `inspectAccelerators(scene)` は `packages/devtools/src/acceleratorInspect.ts:1` で GPU と WASM バックエンドの姿勢を公開する。`inspectGpu` は描画カウンタ（`enableDrawCountersCommand` ／ `resetDrawCountersCommand` は `gpuInspect.ts:1`）、オーバードロー、`save/restore` バランスを報告する; `inspectAccelerators` はバックエンドごとの `AcceleratorReport { status, reason }`（`packages/core/src/tree/scene/WasmBackendFacade.ts:66`）— WASM hit／grid／anim カーネルが引数を受け入れたか JS にフォールバックしたかとその理由 — を報告する。どちらも純粋な読み取りであるため、CI ゲートはレイアウトゲートと同様に `auditGpu(scene).length === 0` をアサートできる。

`inspectMarkdownStream(entity)` は `packages/devtools/src/markdownInspect.ts:1` でストリーミング再利用を報告する（`auditMarkdownStreaming` ／ `markdownStreamAudit`）— 差分 reconcile を生き延びたトークン数 vs 再構築された Entity 数 — `selectionAudit` ／ `highlightGeometry` はすでに上記でカバーした。すべての読み出しは同じ契約に従う: 決して throw せず、Entity が機能を欠くときは `{ unavailable: reason }` を返し、数値を小数第 2 位に丸める。

## 10. ダーティフレーム帰属とライブフレームテレメトリ

### 10.1 `diagnoseDirty` — なぜ `onDemand` が決してスリープしないのか

`diagnoseDirty(scene, opts?)` は `packages/devtools/src/dirtyDiagnosis.ts:70` で `Scene.dirtyReasons` を評決に変える。`scene.setDirtyTracking(true)`（`packages/core/src/tree/Scene.ts:3474`）でオプトインする; `scene.dirtyReasons: DirtyReasonEntry[]`（`Scene.ts:3489`、最も頻度の高いものが先頭、FIFO 上限は `packages/core/src/tree/scene/DirtyTracker.ts:71` の `MAX_DIRTY_REASONS = 200`）は `{ entity?, reason, property?, count, firstFrame, lastFrame }` を保持する。`diagnoseDirty` は `perFrame = count ／ frames`（`dirtyDiagnosis.ts:97`）を計算し、`everyFrame: perFrame >= 0.9`（`dirtyDiagnosis.ts:105`）を分離する — これらは `onDemand` シーンが実際にアイドルになるために止めなければならないものである。`summary` は `everyFrame` が空でないときに最悪の原因を名前で示し、`renderMode === 'always'` のときは論点が無意味であることを注記し（`dirtyDiagnosis.ts:112`）、トラッキングが有効化されていなかったときに警告する（`dirtyDiagnosis.ts:82`）。意図的にヘッドレス — パネルも `@vectojs/ui` 依存もなしに Vitest／Playwright／CI から利用可能である。

### 10.2 `Scene.frameStats` — vsync ではなくレンダリングされたフレーム

`Scene.frameStats: FrameStats` は `packages/core/src/tree/Scene.ts:3515`（`FrameStats` は `Scene.ts:518`）で実際のループテレメトリを読む:

`fps`（EMA 平滑化されたレンダリングフレームケイデンス、`maxFPS` にクランプ、最初のペアまでは `0`）、`frameTimeMs`（最後の `render()` のみの wall-clock）、`frameIntervalMs`、`dt`、`renderedFrames/skippedFrames` カウンタ、`renderMode`、`dirty`。パネルの perf ストリップ（`panel.ts:800`）は `fps · ms/frame ／ entities · mode · rendered/skipped` を 250 ms ごとに更新して表示する（`panel.ts:571`）。アイドルな `onDemand` シーンは正直に `0 fps` を読む; 自動スロットルされた `'always'` シーンはその `idleFPS` フロア（デフォルト 60）を読む（`vectojs-docs/content/reference/devtools.md:72`）。レンダラーは常に canvas 全体を再描画するため、ダーティ rect はない — `dirty` は boolean の再描画待ちフラグである（`vectojs-docs/forge/findings/devtools-and-telemetry.md:73`）。`forge 2026-07-18` からの教訓: rAF を独立してサンプリングしないこと — Entity の `update()` または `frameStats` のみが Scene が実際にレンダリングしたフレームを測る。

ヘッドレス層が読む他の Scene サーフェス: `structureVersion`（`Scene.ts:3462`、`Scene.ts:1636`）はツリー形状の古さ用、`getA11yTree()`（`Scene.ts:5412`）は公開 a11y スナップショット用、`getA11yElement(id)`（`Scene.ts:6446`）と `getContentElement(id)` は DOM vs canvas ボックス比較用（`packages/devtools/src/a11yInspect.ts:143`）、Entity ごとの `getContentProjection()`、そして下記のプラグイン読み出し。

## 10a. Scene 統合ポイント — DevTools がエンジンを読む場所

ヘッドレス層は Scene のプライベートに手を伸ばさない; `packages/core/src/tree/Scene.ts` があらゆるコンシューマ向けに公開し、`packages/core/src/index.ts` が公開 API として再エクスポートする公開サーフェスだけを読む:

- `Scene.structureVersion: number` は `Scene.ts:3462`（`Scene.ts:1636` の `WasmBackendFacade.structureVersion` に裏打ち）— `Entity.add/remove`（`packages/core/src/tree/Entity.ts:1086` ／ `:1123`）でバンプされる。すべてのツリー形状キャッシュはこれが変わらない限り有効である; プロパティ変更は意図的にバンプしないため、`refreshTreeLabels` が存在する。
- `Scene.frameStats: FrameStats` は `Scene.ts:3515` ／ `FrameStats` は `Scene.ts:518` — 唯一の正直な FPS ソースに加え、`frameTimeMs`、`frameIntervalMs`、`dt`、`renderedFrames/skippedFrames`、`renderMode`、`dirty`。`Scene.loop`（`Scene.ts:5569`）で `render()` 呼び出しの前後に更新される; `step(dt)`（`Scene.ts:3420`）はそれらをゼロのままにする。
- `Scene.dirtyReasons: DirtyReasonEntry[]` は `Scene.ts:3489`、`setDirtyTracking` は `Scene.ts:3474` ／ `DirtyTracker` は `packages/core/src/tree/scene/DirtyTracker.ts:70` — 有界 FIFO（`MAX_DIRTY_REASONS = 200` は `DirtyTracker.ts:71`）で `entity:reason.property` をキーとする（`DirtyTracker.ts:120`）。
- `Scene.getA11yTree(): A11yTreeNode[]` は `Scene.ts:5412`（`A11yTreeNode` は `Scene.ts:538`）と Entity ごとの `getA11yElement(id)`（`Scene.ts:6446`）／ `getContentElement(id)` — `highlightGeometry` と `inspectA11y` で `getWorldBounds()` と比較されるライブ DOM ミラー。
- `Scene.renderMode: 'always' | 'onDemand'` は `Scene.ts:1147`、`SceneOptions.renderMode` は `Scene.ts:408`、そして `Scene.ts:3443` の `DirtyTracker` 委譲 — `diagnoseDirty` が帰属するポリシー。
- `Entity.getDevtoolsDescriptor(): DevtoolsDescriptor | null` は `packages/core/src/tree/Entity.ts:1937`、`getLayoutControlledProperties(entity)` は `packages/core/src/tree/Entity.ts:968` — DevTools がコンポーネント種別のテーブルを必要としないようにする 2 つのアプリ提供フック。

GPU／DOM リソースを所有するサブクラスは `super.destroy()` を呼ぶ前に `destroy()` をオーバーライドする（`packages/core/src/tree/ComputeParticleEntity.ts:419`、`DOMPortalEntity.ts:142`）ため、`Map<string, Entity>` インデックス（`panel.ts:157`）を保持するパネルが破棄済み Entity を保持し続けることはない。

## 11. ブリッジとプラグインプロトコル

### 11.1 JSON-RPC ブリッジ

`createDevtoolsBackend(scene, transport, opts?)` は `packages/devtools/src/bridge.ts:131`、`createDevtoolsClient(transport, opts?)` は `bridge.ts:328` で、バージョン化されたプロトコル（`DEVTOOLS_PROTOCOL_VERSION = 1` は `bridge.ts:33`、`DEVTOOLS_CHANNEL = 'vectojs-devtools'` は `bridge.ts:36`）を `DevtoolsTransport`（`bridge.ts:97`）— 双方向の `send ／ subscribe` 抽象化 — 越しに話す。`DevtoolsMethod` は `bridge.ts:39` で 20 のメソッドを列挙する（`protocol.version`、`tree.get`、`entity.inspect/pick/highlightGeometry`、`scene.audit/a11yAudit/a11yOrder/snapshot/diff/frameStats`、`hit.explain`、`text.inspect`、`markdown.stream`、`gpu.inspect`、`plugin.list/rows/audit`、`command.list/run`）。各ハンドラはラップされるため、不正なシーンはバックエンドを kill するのではなく `ok: false` で応答する（`bridge.ts:290`）。

`tree.get` はデフォルトで最大 `maxTreeNodes = 5000` までシリアライズし（`bridge.ts:118`）、静かに切り詰めるのではなく `truncated: true` を報告する（`bridge.ts:178`）。レスポンスは `JSON.parse(JSON.stringify(result))` を経由してラウンドトリップされるため、ライブな Entity を返すハンドラは拡張機能での `structuredClone` エラーとしてではなくバックエンド自身のテストで失敗する（`bridge.ts:300`）。`allowedOrigins` はクロスドキュメント transport では**必須**である — 誰にでも応答するバックエンドは `postMessage` できるあらゆるフレームにシーン内容を漏洩する（`bridge.ts:104`）。2 つの transport が出荷される: テスト／エージェント用の `createDirectTransportPair()`（`bridge.ts:404`）と、拡張機能／親フレーム用で allowlist チェックのために `event.origin` をフォワードする `createWindowTransport(target, targetOrigin)`（`bridge.ts:439`）。`publishSelection` ／ `publishStructure` は `bridge.ts:459` ／ `bridge.ts:469` でバックエンド発の `DevtoolsEvent` 通知（`bridge.ts:81`）を emit する。

1 つのバックエンドがすべてのフロントエンド — ページ内パネル、ブラウザ拡張、Playwright、エージェント — にサービスするため、同じクエリの 4 つの実装が乖離しない（`bridge.ts:21`）。

### 11.2 プラグイン

`registerDevtoolsPlugin(plugin)` は `packages/devtools/src/plugin.ts:1` でインスペクタタブ、監査、コマンドを追加し、単一の選択を越えて生存する。`PluginInspector` は `plugin.ts:1` で `{ id, label, appliesTo?, inspect(ctx): PluginRow[] }` — コンポーネント自身の `getDevtoolsDescriptor()` フィールドが使うのと同じ `PluginRow { label, value, note? }` 形状であるため、記述子をフォワードするのに変換は不要である。`PluginAudit` は `PluginFinding[]` を返し、パネルはそれを通常の所見として追加するため `selectFinding(i)` は所見がどこから来たかを知る必要がない（`panel.ts:830`）。パネルはプラグインタブごとに `PLUGIN_ROWS = 18` 行の `Text` を事前確保し（`panel.ts:94`）、パッケージが遅れて登録したときに `syncPluginTabs()`（`panel.ts:1027`）経由でプラグインタブを再構築する — バージョンチェックの前に行うため、新たに import されたプラグインが次の構造変更まで待つことはない。

## 12. パネル内部で重要なこと

- **リフローは自身のリサイズを所有する。** パネルシーンは `disableWindowResize: true` であり、すべての `window.resize` で `panelScene.resize(width, innerHeight)` を呼ばなければならない（`panel.ts:608` `layout()`）、タブの高さ、ツリー／監査の高さ、perf カードを再配置するために。そうしなければ下部に固定された perf ストリップは少しでも短いビューポートでフォールドの下に落ちる — 100% ズームで出荷されたバグである（`vectojs-docs/forge/findings/devtools-and-telemetry.md:100`、`vectojs#132` で修正）。

- **バージョンでゲートされたリフレッシュと定期的 reconcile。** `refresh()` は `panel.ts:709` で `host.structureVersion === treeVersion` かつ `allNodes` が空でないときに走査をスキップする — 60 Hz インターバルが安価になる — しかしラベル（`panel.ts:733` で `allNodes` と `filteredNodes` の両方に対する `refreshTreeLabels`）と選択／プラグイン読み出しは依然として書き換える。`RECONCILE_INTERVAL_MS`（`panel.ts:591`）ごとの強制 reconcile は、バージョンバンプなしの直接 `children` 変更がどれだけ長く古いままになりうるかを上限付ける。

- **`pointer-events: none` ドック契約。** ドックコンテナとその canvas は `pointer-events: none` である; a11y 投影されたコントロールのみが `auto`（`panel.ts:288`）でオプトインし、`Scene.a11yRoot` を反映する（`vectojs-docs/forge/findings/devtools-and-telemetry.md:29`、`@vectojs/devtools@0.4.3` で修正）。ピックハンドラはクリックを消費する前に `container.contains(ev.target)` をチェックする（`panel.ts:219`）ため、ピックモードを武装してもパネル自身のボタンが飲み込まれることはない（`vectojs#482`、`forge 2026-08-13`）。

- **a11y 監査はキャッシュされ、tick ごとに再走査されない。** `writeA11y` は毎 tick 実行される（それは選択の読み出しである）が、フルシーンの `auditA11y` 走査は `structureVersion` でキャッシュされ `A11Y_AUDIT_TTL_MS = 3000` の古さ TTL（`panel.ts:85`、`panel.ts:1246`）を持つ — 監査入力はバージョンカウンタなしにラベル／disabled／opacity／tabIndex／境界を含むため、純粋なバージョンキーでは無期限に古くなった（`vectojs#496`、`forge 2026-08-13`）。

- **フィルタセーフなラベルとプラグイン安全性。** フィルタがアクティブなとき `Tree` は枝刈りされたコピーを描画する; フィルタされたラベルも書き換えなければ行は最後の再構築時のジオメトリで凍結する（`panel.ts:736`、`#786`）。throw する `appliesTo` や `getA11yAttributes()` はパネル全体を空白にするのではなく「適用されない」／Entity ごとの評決に劣化する（`panel.ts:1298`、`a11yInspect.ts:179`、`vectojs#496`）。

## 13. 難しい部分 — 領収書付き

| 落とし穴                                                                                            | 場所                                                    | 状態                                    |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------- |
| ドックオーバーレイがホストのポインタ入力を飲み込む                                                  | `panel.ts:288`、forge 2026-07-16                        | 修正済み `@vectojs/devtools@0.4.3`      |
| 独立した rAF FPS が Scene ケイデンスではなく display vsync を測る                                   | `Scene.ts:518` `FrameStats`、forge 2026-07-18           | 修正済み `core@1.13.0` via `frameStats` |
| パネルが少しでも短い高さでビューポートからはみ出す                                                  | `panel.ts:608` `layout()`、forge 2026-07-21             | 修正済み `devtools@0.5.0`               |
| フォーカス／ワークスペースが Chrome ケイデンスを決める; Firefox は `layout.frame_rate` が必要       | `benchmarks/run-browsers.sh`、forge 2026-08-02/03       | 修正済み `vectojs#326/#327/#333`        |
| スナップショットで混合されたキー付き／キーなしレベルが 1 ノードを二重にペアリングし削除を取りこぼす | `snapshot.ts:196`、forge 2026-08-13                     | 修正済み `vectojs#481/#510`             |
| ピックモードがパネル自身のコントロールクリックを飲み込む                                            | `panel.ts:219`、forge 2026-08-13                        | 修正済み `vectojs#482/#510`             |
| `findEntityAt` がエンジン同等性を主張しながら opacity／clip／pointer ゲートを省略                   | `model.ts:82`、`HitTester.ts:227` vs `forge 2026-08-13` | 修正済み `vectojs#483/#510`             |
| Canvas vs DOM のドリフトが論理 px とクライアント px を比較                                          | `a11yInspect.ts:143`、`panel.ts:1099`                   | 修正済み `vectojs#484/#510`             |
| `selectFinding` がプラグイン所見を無視                                                              | `panel.ts:860`、forge 2026-08-13                        | 修正済み `vectojs#496/#518`             |
| `accessibleName` が切り詰められた 80 文字プレビューだった                                           | `a11yInspect.ts:160`、`inspect.ts:70`                   | 修正済み `vectojs#496/#518`             |
| インスペクタ警告が行予算で落とされた                                                                | `model.ts:153` ＋ `panel.ts:1143`、forge 2026-08-13     | 修正済み `vectojs#496/#518`             |
| フルシーン a11y 監査が 500 ms tick ごとに再走査された                                               | `panel.ts:1246`、forge 2026-08-13                       | 修正済み `vectojs#496/#518`             |
| throw する `getA11yAttributes()` が a11y 監査全体を kill した                                       | `a11yInspect.ts:179`、forge 2026-08-13                  | 修正済み `vectojs#496/#518`             |

## 14. チェックリスト — DevTools 変更を着地させる前に

1. **ヘッドレスファースト。** 純粋関数を追加し、ブラウザなしで `createDirectTransportPair()` 経由でテストし、その後パネルを配線する。1 人の本物のコンシューマで検証されたプロトコルは、未検証のものの上に再構築された UI より優れる（`bridge.ts:21`）。
2. **throw セーフ。** すべての `getA11yAttributes()` ／ `getDevtoolsDescriptor()` ／ `appliesTo` 呼び出しをガードする — 壊れたコンポーネントは劣化しなければならず、ツールを空白にしてはならない（`model.ts:184`、`inspect.ts:136`、`panel.ts:1298`）。
3. **ヒット同等性。** 新しい可視性／入力／クリップゲートは `HitTester.findHitRecursively` と `isHitEligible` の**両方**、そしてヘッドレスのピック／説明走査に着地しなければならない（`HitTester.ts:227` vs `model.ts:82` vs `hitExplain.ts:139`、`vectojs#483`）。
4. **許可されたオリジンか直接ペアのみ。** `allowedOrigins` なしのクロスドキュメントバックエンドは情報漏洩ベクターである（`bridge.ts:104`）。
5. **バージョンキーされたキャッシュには TTL が必要。** ラベル／opacity／境界にも依存するものに対する `structureVersion` のみのキーは永遠に古くなる（`panel.ts:1246`）。
6. **ドックを非インタラクティブに保つ。** コンテナ／canvas は `pointer-events: none` のままである（`panel.ts:288`）; コントロールはオプトインする。ここでのリグレッションはホストの右端コントロールを静かに無効化する。

## 15. デバッグワークフロー — 症状ごとにどのツールか

| 症状                                               | ワークフロー                                                                                                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 「このピクセルを所有する Entity は？」             | `pickInScene(scene, x, y)` → `inspectEntity(hit)`（`packages/devtools/src/model.ts:214`、`packages/devtools/src/inspect.ts:99`）                |
| 「間違った Entity がこのピクセルを所有している」   | `explainHitTest(scene, x, y)` — 負けた理由とともにすべての敗者（`packages/devtools/src/hitExplain.ts:139`）                                     |
| 「なぜこの Entity の位置／サイズがおかしいのか？」 | `inspectEntity` の境界 ＋ `getWorldTransform()`、`entityPath` を上へ辿る — 最初に間違った境界を持つものがバグを所有する                         |
| 「`x` への書き込みが戻る」                         | `inspectEntity(e).layoutControlled` — 親がそのプロパティを所有する（`packages/devtools/src/inspect.ts:42`）                                     |
| 「クリックターゲットがビジュアルからずれている」   | `highlightGeometry(scene, e)` — `a11y`／`content` の `divergesFromLayout` を探す（`packages/devtools/src/highlightGeometry.ts:1`）              |
| 「ヒット領域がおかしい」                           | `sampleHitRegion(e)` — ボックスではなく実際のヒット領域                                                                                         |
| 「スクリーンリーダーが何も言わない」               | `inspectA11y(scene, e)` で `accessibleName`／`nameSource`; アナウンス順序は `a11yReadingOrder(scene)`                                           |
| 「テキストが間違った順序／空白ボックス」           | `inspectText(e)` の bidi レベル ／ `glyphs[].atlasMiss`（`packages/devtools/src/textInspect.ts:179`）                                           |
| 「`onDemand` シーンが決してアイドルにならない」    | `scene.setDirtyTracking(true)` → `diagnoseDirty(scene)`（`packages/devtools/src/dirtyDiagnosis.ts:70`、`packages/core/src/tree/Scene.ts:3474`） |
| 「このインタラクションの後に何が変わったか？」     | 前後で `captureSnapshot` → `diffSnapshots`                                                                                                      |

---

_シリーズ: 00 Overview → 01 Selection → 02 Text+Layout → 03 Projection+Virtualization → 04 Streaming Markdown → 05 TeX → 06 VMT Runtime → 07 Renderer → 08 WASM G1/G2/G3 → 09 Three/XR → 10 Video Export → 11 Graph Layout → **12 DevTools** → 99 Synthesis。_
