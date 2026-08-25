+++
title = "@vectojs/knowledge-graph/model"
description = "レンダラー中立で、ページングされた知識グラフのマテリアライゼーション。キャンセル、重複排除、スナップショット、オプションのレイアウトウォームスタートを備える。"
weight = 46
+++

# `@vectojs/knowledge-graph/model`

文書化バージョン: **0.4.0**

`KnowledgeGraphModel` は、より大きな知識グラフの境界付きでマテリアライズされた断面を所有します。`KgDataSource` からシードエンティティと近傍ページを読み込み、エンティティとファクトを重複排除し、ノードごとの展開進捗を追跡し、レンダラー向けに安定した `GraphData` を公開します。DOM、Canvas、Three.jsシーン、アニメーションタイマーは一切作成しません。

ホストがデータとモデル状態のみを必要とする場合は、レンダラー中立のエントリポイントをインポートします：

```ts
import {
  KnowledgeGraphModel,
  MemoryDataSource,
  type KgDataSource,
} from '@vectojs/knowledge-graph/model';
```

パッケージルートもモデルをエクスポートしますが、そこにはパッケージのセッションおよびレンダリング向けサーフェスが含まれます。`/model` サブパスが明示的なヘッドレス境界です。

## データソース契約

```ts
type NodeId = string | number;

interface KgNeighborOptions {
  limit?: number;
  cursor?: string;
  direction?: 'out' | 'in' | 'both';
  signal?: AbortSignal;
}

interface KgNeighborhood {
  entity?: KgEntity;
  facts: readonly KgFact[];
  neighbors: readonly KgEntity[];
  total?: number;
  nextCursor?: string;
  hasMore?: boolean;
}

interface KgDataSource {
  getNodes(ids?: readonly NodeId[]): readonly KgEntity[] | Promise<readonly KgEntity[]>;
  getNeighbors(id: NodeId, options?: KgNeighborOptions): KgNeighborhood | Promise<KgNeighborhood>;
}
```

`cursor` は不透明なものとして扱ってください。ソースは `limit` を適用し、`direction` を尊重し、供給された中止シグナルを下流の作業に渡し、別のページが存在する場合は `nextCursor` と `hasMore` を返すべきです。`total` はオプションで、現在のページだけでなく、そのノード展開で利用可能なファクトの総数を表します。`direction: "both"` の場合、ソースとターゲットが同じノードであるファクトはページごとに 1 回だけ列挙され、重複しません。

`entity` はオプションです。要求された id を知らないソースは、それを含まない近傍を返すことができ、モデルはその展開を明確なエラーで失敗させます。偽のプレースホルダーノードを永続的に取り込むことはありません。

`MemoryDataSource` は、テストや小規模なインメモリグラフ向けにこの契約を実装します。そのカーソルはバージョン付きのオフセット（`<version>:<offset>`）で、ページネーションの途中で `load()` を呼び出すと、未処理のカーソルは明確に無効化されます。別のファクトリストを静かに切り出すのではなく、スローします。近傍ルックアップは `O(degree)` であり、無効なカーソルはスローします。

## モデルの作成と展開

```ts
const source = new MemoryDataSource({ entities, facts });
const model = new KnowledgeGraphModel({
  source,
  pageSize: 100,
  direction: 'both',
  lang: 'en',
});

await model.bootstrap(['vectojs'], false);

let result = await model.expand('vectojs');
while (result.state.status === 'partial') {
  result = await model.expand('vectojs');
}

draw(model.getGraphData());
```

`bootstrap(focusIds, expandSeeds = true)` は最初にフォーカスエンティティを解決します。デフォルトの第2引数では、その後各シードを1ページずつ順次展開します。ホストがページングを明示的に制御したい場合は `false` を渡します。

各 `expand(id)` は正確に次のページを読み込みます。同じIDに対する並行呼び出しは1つのPromiseを共有し、異なるIDは独立して読み込めます。完了した展開は、ソース呼び出しを再度行うことなく即座に解決します。エンティティはIDで重複排除され、ラベルマップを含めてマージされます。ファクトは順序付き `(source, predicate, target)` トリプルで重複排除されます。

## 展開状態

```ts
type ExpansionStatus = 'idle' | 'loading' | 'partial' | 'complete' | 'failed' | 'cancelled';

interface ExpansionState {
  status: ExpansionStatus;
  loaded: number;
  total?: number;
  cursor?: string;
  hasMore?: boolean;
  error?: unknown;
}
```

`getExpansionState(id)` で防御的コピーを読み取ります。`loaded` はバッチごとに届いたすべてのファクトを数えるため、近傍がページ間で重なってもページネーションの進捗が停滞することはありません。`partial` は別のページが利用可能であることを意味し、`expand(id)` を呼び出すと保存されたカーソルから再開します。

`cancelExpand(id)` はアクティブなリクエストを中止し、`cancelled` とマークします。キャンセルが基盤となるI/Oを停止するには、データソースが `options.signal` を尊重する必要があります。後続の `expand(id)` は最後に完了したカーソルから再開します。ソースの失敗は状態を `failed` とマークし、以前の進捗を保持し、Promiseを拒否します。後続の呼び出しは同じカーソルから再試行します。

## 状態の読み取りと永続化

```ts
model.entityCount;
model.factCount;
model.listEntities();
model.listFacts();
model.getGraphData();

const snapshot = model.exportSnapshot();
model.importSnapshot(snapshot);
```

`listEntities()` と `listFacts()` は、アプリケーションによる検査に適したコピーを返します。`getGraphData()` は、安定したエンティティ順でモデルの現在のレンダラー入力を返します。そのグラフは読み取り専用として扱ってください。マテリアライズされた断面が変化すると置き換えられます。

スナップショットはバージョン管理されています。バージョン1はエンティティ、ファクト、再開可能な展開メタデータを保存しますが、進行中のリクエストやエラーオブジェクトは保存しません。スナップショットのインポートは現在のリクエストを中止し、最終的な完了を無視します。サポートされないスナップショットバージョンは、置換前にスローします。

## オプションのレイアウト統合

`KnowledgeGraphModelOptions.layout` は、`@vectojs/graph3d` のXYZ `GraphLayout` 契約を受け入れます。モデルが唯一のレイアウト駆動者です。各マテリアライゼーション再構築は `layout.setGraph()` を一度呼び出し、ノードIDごとに有限のXYZ位置をウォームスタートとして保持し、レイアウトが `reheat()` を公開している場合は読み込まれたページの後に再加熱します。ウォームスタート位置は、レイアウトが落ち着いた時点（および再構築時）にキャプチャされ、毎ホットフレームごとではありません。

最新のレイアウト座標を保持する必要がある外部操作の前に `captureLayoutPositions()` を呼び出してください。このオプション契約は三次元です。`@vectojs/graph-layout` のXY `ForceLayout2D` を直接渡さないでください。2Dレンダラーは `layout` を省略し、`getGraphData()` に対して独自のレンダラー中立レイアウトを実行できます。この契約はノード**インデックス**でピン留めするのに対し、2D `ForceLayout2D` はノードIDでピン留めすることに注意してください。スタックをまたぐときはピンを変換してください。

## 破棄

`dispose()` はアクティブなリクエストを中止し、マテリアライズされた状態を解放します。冪等です。ライブモデルを必要とするメソッドは、その後 `KnowledgeGraphModel is disposed` をスローします。遅延した非同期完了が、破棄された状態やスナップショットで置換された状態を再投入することはできません。所有権は作成者にあります。モデルはオプションのレイアウトを借りるだけなので、モデルを破棄しても、ライブセッションと共有されているレイアウトは破棄されません。レイアウトを構築した者がそれを破棄します。

## セッション層の保証

パッケージのルートは、モデルからレンダラーを駆動する `KnowledgeGraphSession` もエクスポートします。その振る舞いの契約は、モデルのものと足並みを揃えています。

- **in-flight な id につき展開は 1 回。** 展開フェッチがまだ進行中のノードへの繰り返し選択は、in-flight ゲートに吸収されます。1 回のネットワークフェッチに対してクリックごとに `onExpand`/`onError` を発火することはありません。
- **エラーは観測可能。** 選択によって引き起こされた展開の失敗は `onError(error, entity)` オプション（フォールバックは `console.error`）にルーティングされ、未処理の拒否として脱出することはありません。セッションが破棄されると非同期の続行は停止します。
- **不明な id は明確に失敗する。** どのソースも知らない id を展開すると、幽霊エンティティをマテリアライズするのではなく、明確なエラーで失敗します。

## 計算量

`N` エンティティと `E` 一意ファクトを持つマテリアライズされた断面に対して、モデルストレージは `O(N + E)` です。ページの取り込みは、`P` 件の返却レコードに対して期待 `O(P)` で、その後レンダラーデータの再構築は `O(N + E)` に供給されたレイアウトの `setGraph()` コストを加えたものです。スナップショットのエクスポートとインポートは `O(N + E)` です。モデルは意図的に読み込まれたページのみをマテリアライズします。ソースグラフの総サイズが常駐メモリを決定することはありません。

## 関連

レンダラー非依存の2D物理演算には [`@vectojs/graph-layout`](/reference/graph-layout/) ·
オプションのXYZレイアウト契約には [`GraphLayout` と3Dレイアウト実装](/reference/graph3d-layout/) ·
3Dレンダリングには [`@vectojs/graph3d`](/reference/graph3d/)
