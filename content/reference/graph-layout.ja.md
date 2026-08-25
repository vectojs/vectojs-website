+++
title = "@vectojs/graph-layout"
description = "レンダラー非依存・依存関係ゼロの2Dフォースレイアウト。Barnes-Hut反発、インクリメンタルなトポロジ更新、衝突処理、実行時ピン留めを備える。"
weight = 47
+++

# `@vectojs/graph-layout`

文書化バージョン: **0.3.0**

`@vectojs/graph-layout` は依存関係のない2Dフォースシミュレーションです。レンダラーもアニメーションタイマーも所有しません。ホストがグラフデータを供給し、`step()` を呼び出し、`Float32Array` からインターリーブされたXY座標を読み取ります。同じレイアウトが、Canvas 2D、SVG、WebGL、WebGPU、VectoJSシーン、またはメインスレッド外のレンダラーを駆動できます。

バージョン0.3.0には、TypeScriptの `ForceLayout2D` という1つの実装があります。0.3.0にはWASMビルド、代替バックエンド、`backend` オプションはありません。WASMは測定にゲートされた将来の選択肢のままであり、現在のクロス次元ブラウザ比較はWASMバックエンドが役立つという直接的な証拠ではありません。

## インストール

```bash
bun add @vectojs/graph-layout
```

このパッケージにはランタイムまたはレンダラーのピア依存関係はありません。

## Canvas 2Dの例

この例では任意の文字列IDを使用し、レイアウトを介して現在の位置インデックスを解決します。数値IDも識別子です。数値IDが現在のノードインデックスと等しいと仮定しないでください。

```ts
import { ForceLayout2D, type GraphData } from '@vectojs/graph-layout';

const canvas = document.querySelector('canvas');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Canvas not found');

const context = canvas.getContext('2d');
if (!context) throw new Error('Canvas 2D is unavailable');

const graph: GraphData = {
  nodes: [{ id: 'center', fx: 0, fy: 0 }, { id: 'left' }, { id: 'right' }],
  links: [
    { source: 'center', target: 'left' },
    { source: 'center', target: 'right' },
  ],
};

const layout = new ForceLayout2D({
  collisionRadius: 8,
  linkDistance: 48,
});
layout.setGraph(graph);

function draw(): void {
  const active = layout.step();
  const positions = layout.positions;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);

  context.beginPath();
  for (const link of graph.links) {
    const sourceIndex = layout.getNodeIndex(link.source);
    const targetIndex = layout.getNodeIndex(link.target);
    if (sourceIndex === undefined || targetIndex === undefined) continue;
    const source = sourceIndex * 2;
    const target = targetIndex * 2;
    context.moveTo(positions[source], positions[source + 1]);
    context.lineTo(positions[target], positions[target + 1]);
  }
  context.stroke();

  for (let index = 0; index < layout.nodeCount; index++) {
    context.beginPath();
    context.arc(positions[index * 2], positions[index * 2 + 1], 5, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();

  if (active) requestAnimationFrame(draw);
}

draw();
```

`step()` は同期的です。シミュレーションがアクティブな間は `true` を返し、`alphaMin` を下回って冷却された後（またはグラフが空の場合）は `false` を返します。戻り値は物理演算がもう1ティック必要かどうかを示すものであり、カメラ移動、入力、その他のアニメーションのためにアプリケーションがレンダリングを続けるべきかどうかについては何も述べていません。非正の `alphaDecay` は構築時に拒否されデフォルトにフォールバックするため、空でないシミュレーションは常に自力で収束します。

## 公開型

このパッケージは、ルートから以下の型と `ForceLayout2D` をエクスポートします：

```ts
type NodeId = string | number;
type LinkId = NodeId;

interface GraphNode {
  id: NodeId;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
  [key: string]: unknown;
}

interface GraphLink {
  source: NodeId;
  target: NodeId;
  id?: NodeId;
  [key: string]: unknown;
}

interface GraphData {
  nodes: readonly GraphNode[];
  links: readonly GraphLink[];
}

type NodeValue = number | ((node: GraphNode, index: number) => number);
type LinkValue = number | ((link: GraphLink, index: number) => number);

interface ForceLayout2DOptions {
  repulsion?: NodeValue;
  collisionRadius?: NodeValue;
  collisionStrength?: number;
  linkDistance?: LinkValue;
  linkStrength?: LinkValue;
  centerStrength?: number;
  velocityDecay?: number;
  theta?: number;
  repulsionDistanceMax?: number;
  alphaDecay?: number;
  alphaMin?: number;
  seed?: number;
}
```

追加のノードおよびリンクフィールドはアプリケーション所有のままです。レイアウトは入力レコードを変更しません。

## オプション

| オプション             | デフォルト | 意味                                                                                              |
| ---------------------- | ---------: | ------------------------------------------------------------------------------------------------- |
| `repulsion`            |      `300` | ノードごとの非負の多体反発の大きさ。                                                              |
| `collisionRadius`      |        `0` | ノードごとの非負の半径。半径ゼロの2ノードは分離されません。                                       |
| `collisionStrength`    |        `1` | 非負の衝突補正乗数。ゼロは衝突補正を無効にします。                                                |
| `linkDistance`         |       `30` | リンクごとの非負の静止長。                                                                        |
| `linkStrength`         |      `0.3` | リンクごとの非負のばね剛性。                                                                      |
| `centerStrength`       |     `0.02` | 原点に向かう非負の引力。                                                                          |
| `velocityDecay`        |      `0.6` | ティックごとの速度保持率。`1` 未満にクランプされます。                                            |
| `theta`                |      `0.9` | 非負のBarnes-Hut開き角。低い値は速度を精度に換え、`0` は正確な走査を行います。                    |
| `repulsionDistanceMax` | `Infinity` | ノードが反発する最大距離。非正の値はカットオフなしを意味します（`Infinity` と同じ）。             |
| `alphaDecay`           |   `0.0228` | ティックごとの温度減衰。`[0, 1]` にクランプされます。非正の値はデフォルトにフォールバックします。 |
| `alphaMin`             |    `0.001` | シミュレーションが収束したとみなす非負の温度。                                                    |
| `seed`                 |        `1` | 有限の初期座標を持たないノードの決定的シード。                                                    |

非有限のオプション値はデフォルトにフォールバックします。非負と文書化された値はゼロでクランプされますが、フォールバックする2つの意図的な例外があります。非正の `alphaDecay` はデフォルトの `0.0228` を取り（リテラルの `0` はティックごとの減衰を無操作にし、シミュレーションは決して収束しません）、非正の `repulsionDistanceMax` はカットオフなしを意味します（以前は反発全体をオフに切り替えていました）。ノードおよびリンクのアクセサーは、各レコードがレイアウトに受け入れられたときに1回だけ評価され、ティックごとではありません。ノードアクセサーのインデックスは挿入インデックスです。リンクアクセサーのインデックスは、追記専用ページング全体にわたって安定した連続インデックスです。ノードの削除はリンクをコンパクト化するため、後続の追記が以前に削除されたリンクに割り当てられたインデックスを再利用できます。ノードの削除は生存者のアクセサーを再評価しません。値を再度導出する必要がある場合は新しい `setGraph()` を使用してください。すべてのオプションはコンストラクタのみです。0.3.0にはライブなフォースセッターはありません。

## API

```ts
class ForceLayout2D {
  constructor(options?: ForceLayout2DOptions);

  positions: Float32Array;
  nodeCount: number;

  getNodeIndex(id: NodeId): number | undefined;
  getNodeId(index: number): NodeId | undefined;
  getNodeIds(): readonly NodeId[];
  setGraph(data: GraphData): void;
  appendGraph(data: GraphData): void;
  removeNodes(ids: Iterable<NodeId>): void;
  removeLinks(items: Iterable<GraphLink | LinkId>): void;
  updateLinks(links: readonly GraphLink[]): void;
  step(iterations?: number): boolean;
  setNodePin(id: NodeId, pin: { x?: number; y?: number }): void;
  clearNodePin(id: NodeId, axes?: { x?: boolean; y?: boolean }): void;
  pinNode(id: NodeId, x: number, y: number): void;
  unpinNode(id: NodeId): void;
  reheat(alpha?: number): void;
  dispose(): void;
}
```

### 位置とステッピング

`positions` は現在のノード順で `[x0, y0, x1, y1, ...]` を保持します。これはライブビューです。レイアウトは `step()` 呼び出しをまたいでその値をインプレースで更新します。不変のスナップショットが必要な場合は `layout.positions.slice()` を呼び出してください。

ビューオブジェクトはトポロジ境界をまたいで安定していません。`setGraph()`、`appendGraph()`、または `removeNodes()` の後は必ず `layout.positions` を再取得してください。内部容量を超えて追記すると、バッキングストレージも再割り当てされます。ノードインデックスは削除後に変化する可能性があります。生存者は相対順序を保ったままコンパクト化されるためです。

`getNodeIndex(id)` でIDを現在のインデックスに解決し、`getNodeId(index)` で逆引きします。どちらも現在のノードが一致しない場合は `undefined` を返します。`getNodeIds()` は現在の位置順のスナップショットを返します。その配列を変更してもレイアウトには影響しません。既存のインデックスは追記専用の更新では安定しており、削除は生存者をコンパクト化します。

`step(iterations = 1)` は最大でその回数分の同期ティックを実行し、その後もalphaが少なくとも `alphaMin` 以上であれば `true` を返します。冷却時は早期に停止します。非正または非有限の反復回数はティックを実行せず、現在のアクティブ状態を報告します。回数はフロアされ、呼び出しごとに10,000でキャップされます。

### ノードの置換、追記、削除

`setGraph(data)` はすべての状態を置換し、新しいグラフを決定的にシードし、alphaを `1` に設定します。すべてのノードIDは文字列または有限数でなければならず、一意でなければなりません。無効または重複したIDは、既存のグラフがクリアされる前にスローします。

`appendGraph(data)` は既存の位置、速度、ピンを保持します。IDが無効、既に存在、またはその追記内で重複しているノードは無視され、再生されたページが冪等になります。受け入れられたノードは入力順に追記されます。受け入れられたリンクは、既存のノードまたは同じ呼び出しで受け入れられたノードを対象にできます。トポロジ変更は単調に再加熱します。alphaを上げることはできますが、すでにホットなシミュレーションを下げることはありません。

リンクは、有向エンドポイントペアとオプションの `id` によって再生安全です：

- `id` がない場合、`source` から `target` への繰り返しリンクは1つのリンクです。
- 方向は重要です：`a` から `b` と `b` から `a` は異なるアイデンティティを持ちます。
- 並列リンクには、異なる文字列または有限数のIDが必要です。グラフスタックは並列リンクを拒否するのではなく、相異なるエッジとして扱います。
- 識別されたリンクの再生は無視されます。
- 不正な形式のオプションリンクIDは、アイデンティティの目的では存在しないものとして扱われます。

エンドポイントの検証は厳密かつ均一です。未知のノードまたは同じノードを2回参照するエンドポイントを持つリンクは `setGraph()` と `appendGraph()` をスローさせ、`appendGraph()` は変更前にバッチ全体を検証するため、拒否された呼び出しでも以前のグラフはそのまま保たれます（同じバッチで受け入れられたノードへの前方参照は有効のままです）。これは `updateLinks()` のポリシーと一致します。ぶら下がりリンクはかつて静かにドロップされ、データのバグが不可解に欠けた構造として隠されていました。不正な形式のオプションIDを持つリンクでも、エンドポイントが有効であれば未識別リンクとして入ります。不正な形式のリンクデータが位置を非有限にすることはありません。
`removeNodes(ids)` は一致するノードとすべての入射リンクを削除し、生存者の状態をコンパクト化し、次数バイアスを再計算し、何かが削除された場合は再加熱します。未知のIDと空のイテラブルは何もしません。

### リンクの削除と更新

`removeLinks(items)` は、ノードのインデックス、位置、速度、ピンを変更せずにリンクを削除します。完全なリンクを渡してその有向エンドポイントとオプションのIDを一致させるか、裸の `LinkId` を渡してそのIDを持つすべての識別リンクを削除します。生存リンクは順序とキャッシュされたアクセサー値を保持します。未知のアイデンティティと既に削除されたアイデンティティは何もしません。成功したバッチはリンク次数バイアスを再計算し、1回再加熱します。

`updateLinks(links)` は、一致する既存アイデンティティの `linkDistance` と `linkStrength` アクセサーを再評価します。これらのアクセサーが消費するアプリケーション所有のリンクフィールドを変更した後に使用します。完全なバッチが最初に検証されます。未知または同一のエンドポイントは、更新を適用せずにスローします。まだ存在しないアイデンティティは無視されます。エンドポイントはリンクアイデンティティに関与するため、再ルーティングには `removeLinks()` に続けて `appendGraph()` が必要です。値が変わらない場合はシミュレーションを再加熱しません。

### ピン留めと再加熱

有限の初期 `fx` と `fy` 値は、軸を独立してピン留めします。したがって、ノードはXを固定してYを自由に、Yを固定してXを自由に、または両方の軸を固定することができます。初期 `x` と `y` は、対応するピン留めされていない軸のみをシードします。

実行時には、`setNodePin(id, { x?, y? })` が指定された軸のみをピン留めし、それらのライブ座標を即座に更新し、速度をクリアします。`clearNodePin(id, { x?, y? })` は、他の軸を保持したまま選択された軸を解放します。axesオブジェクトを省略すると両方を解放します。`pinNode(id, x, y)` と `unpinNode(id)` は、引き続き両軸の便利メソッドです。不明なIDは無視されます。

**ピンはIDアドレス指定です**（0.3.0）。このクラスの他のすべてのノード参照と同様に、`removeNodes()` のコンパクト化の後も同じノードを指し続けます。インデックスアドレス指定のピンは、そのスロットに移動したノードへ静かに付け替えられてしまいます。スタック間で移植されるコードへの分歧メモ: 3D [`GraphLayout`](/reference/graph3d-layout/) ファミリーの契約は代わりにノード**インデックス**でピン留めし、並列エッジの扱いも異なります。このパッケージのコンシューマーは重複するエンドポイント四つ組（node-editor の `duplicate-link`）を拒否しますが、graph/knowledge スタックは並列リンクを相異なるエッジとして扱います。スタックをまたぐときはピンとリンクのアイデンティティを変換してください。

これらの呼び出しは自動的には再加熱しないため、インタラクティブなピンまたは解除操作の後は `reheat()` を呼び出してください。

`reheat(alpha = 0.3)` はリクエストを `[alphaMin, 1]` にクランプし、`max(currentAlpha, requestedAlpha)` を適用します。よりホットなシミュレーションを冷却することはありません。

### ノードのドラッグ：移動ごとではなく一度だけ再加熱する

ドラッグ関連で最も一般的な欠陥は、ピン留めされたノードをドラッグしている間、**すべてのポインター移動**で `reheat()` を呼び出すことです。これによりalphaが最大値付近に固定され続け、ドラッグされたノードの隣接ノード — リンクスプリングに引っ張られて — はほとんど減衰なしでオーバーシュートし続けます。シミュレーションはポインターが解放された後に冷却するのに数秒かかり（alphaはティックごとに約 `alphaDecay` ずつ減衰し、60 fpsでおよそ300ティック ≈ 5秒）、その間、近傍全体が目に見えて振動します。各ノードにテキストラベルを描画している場合、その速い振動はジッターや残像/ゴーストとして読み取られます。

正しいパターンは、ドラッグが_開始_されたときだけ再加熱し、その後は再加熱せずに各移動でピン位置を更新することです：

```ts
function onDragStart(node, x, y) {
  layout.setNodePin(node.id, { x, y }); // pin at the pointer
  layout.reheat(0.3); // wake the simulation ONCE
}

function onDragMove(node, x, y) {
  layout.setNodePin(node.id, { x, y }); // move the pin — no reheat here
}

function onDragEnd(node) {
  layout.clearNodePin(node.id); // or keep it pinned for a permanent pin
}
```

ドラッグの_最中_にゆっくり漂う追従感が望ましい場合は、毎回の移動で再加熱するのではなく `velocityDecay`（より強い減衰）を上げてください。`reheat()` はトポロジ変更、明示的な起動、ドラッグ開始のために取っておきます。

### 破棄

`dispose()` はグラフと四分木ストレージを解放し、`positions` を空の配列にリセットし、冪等です。破棄後は他のすべてのメソッドが `ForceLayout2D was disposed` をスローします。古いインスタンスを再利用しようとせず、新しいインスタンスを作成してください。

## 計算量と容量

`N` ノードと `E` 受け入れ済みリンクに対して、通常のティックはBarnes-Hut四分木を構築し、期待 `O(N log N)` で反発を評価し、`O(E)` でスプリングを適用し、`O(N)` でサニタイズ、センタリング、積分を行います。したがって、衝突なしの通常のティックコストは `O(N log N + E)` です。これは最悪ケースの保証ではありません。病的な空間分布や `theta: 0` は全ペア作業に近づく可能性があります。

衝突が有効な場合、レイアウトは予測位置に対して四分木をもう一度構築し、ブロードフェーズを通じて半径近傍クエリを実行します。このブロードフェーズは点を2の冪の半径ティアにビン分けし、各ティアが独自のグリッドを持ちます。プローブコストは、すべてのノードが最大半径でサイズ決定されたセルに落ちるのではなく、局所密度によって制限されます。疎で局所的に境界のある近傍は一般に `O(N log N + K)` に近く、ここで `K` は候補/重複作業ですが、密集したクラスタや非常に大きな半径は依然として `K` を二次にし得ます。衝突はBarnes-Hut反発から無条件の `O(N log N)` 境界を継承しません。

`setGraph()` は、幾何容量の割り当てと初期化を除けば `O(N + E)` です。`appendGraph()` は追記された入力に比例し、リンクが受け入れられた場合の `O(N + E)` 次数バイアス再計算が加わります。`removeLinks()` はリンクストレージのみをコンパクト化し、`O(E + R)` です。裸IDはリクエストごとに全リンクを走査するのではなく、遅延構築されたインデックスを通じて解決されます。`updateLinks()` は `U` 件の更新に対して `O(E + U)` です。ストレージは幾何級数的に成長するため、ほとんどの小さな追記は容量を再利用します。成長境界では既存の型付き配列を `O(N + E)` 時間でコピーします。`removeNodes()` はノードとリンクをコンパクト化し、`O(N + E)` でバイアスを再計算します。削除は容量を縮小しません。

## 実測ブラウザの証拠

次数バイアス後の1回のヘッド付きブラウザ診断実行で、行ごとに10ティックのサンプルにわたって以下のp95メインスレッドティック時間を測定しました：

| 3,000ノードのワークロード | Chrome 151 | Firefox 153 |
| ------------------------- | ---------: | ----------: |
| 星形/ハブ                 |   10.60 ms |     7.84 ms |
| 混合スパース              |    8.09 ms |     7.28 ms |

50ノードのページ追記は、4つのブラウザ/ワークロード行にわたって**0.145〜0.355 ms**と測定されました。各追記行にはトポロジ変更サンプルが1つしかないため、この範囲はテールレイテンシの推定値ではなく診断上の証拠です。これらの測定は、タスクランナーのハードウェアとソフトウェア環境での1回のヘッド付き実行によるものであり、移植可能な保証ではありません。ブラウザのスケジューリング、ハードウェア、電源状態、バックグラウンド負荷、グラフジオメトリ、オプション、ウォームアップ、サンプル構築が結果に影響します。これらは操作ごとのレイテンシの証拠であり、FPS測定ではありません。これらからFPSの主張を導き出すことはできません。

## `d3-force` からの移行

概念的な対応は直接的ですが、APIは意図的に小さくなっています：

| `d3-force`                                      | `@vectojs/graph-layout`                                  |
| ----------------------------------------------- | -------------------------------------------------------- |
| `simulation.nodes(nodes)` と `forceLink(links)` | `layout.setGraph({ nodes, links })`                      |
| `simulation.tick(k)`                            | `layout.step(k)`                                         |
| 変更されるノードの `x`/`y` フィールド           | インターリーブされた `layout.positions` のXYビュー       |
| `simulation.alpha(value).restart()`             | `layout.reheat(value)` とホストスケジュールのフレーム    |
| `node.fx` / `node.fy` の変更                    | 初期 `fx`/`fy`、その後 `setNodePin()` / `clearNodePin()` |
| d3の内部タイマー                                | タイマーなし。ホストがスケジューリングを所有             |

リンクは、d3が変更したエンドポイントオブジェクトではなく、エンドポイントIDを使用します。オプションアクセサーは元の `GraphNode` または `GraphLink` と挿入インデックスを受け取り、キャッシュされます。0.3.0にはカスタムフォースレジストリはありません。d3レイアウトがカスタムフォースやライブフォースセッターに依存している場合は、d3-forceを使い続けるか、新しいオプションでレイアウトを再作成してください。

## 2D対 `@vectojs/graph3d`

レンダラー非依存の**2D**物理演算とインターリーブされたXYペアには、このパッケージを使用してください。[`@vectojs/graph3d`](/reference/graph3d/) は別個の3Dレイアウト実装（`D3ForceLayout` と `VectoForceLayout`）とThree.jsレンダラーを提供します。その位置はXYZトリプレットであり、そのグラフ/レイアウトタイプは `ForceLayout2D` と交換可能ではありません。両方のAPIがシミュレーション作業が残っているかを報告するホスト呼び出しの `step()` を使用しますが、このパッケージのXYバッファを `Graph3D.applyPositions()` に渡さないでください。それはXYZデータを必要とします。

## 関連

3Dレイアウトとレンダリングには [`@vectojs/graph3d`](/reference/graph3d/) ·
[`GraphLayout` と3Dレイアウト実装](/reference/graph3d-layout/)
