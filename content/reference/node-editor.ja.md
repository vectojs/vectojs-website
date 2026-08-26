+++
title = "@vectojs/node-editor"
description = "キャンバスネイティブのノードエディタエンティティ: 型付きドキュメントモデル、取り消し可能なコマンド、キーボード到達可能なポートと接続、厳密な永続化バリデーション、決定論的な階層オートレイアウト。"
weight = 48
+++

# `@vectojs/node-editor`

文書化バージョン: **0.2.0**

`@vectojs/node-editor` は、VectoJS プリミティブから構築されたノードグラフエディタです。`Entity` のサブクラス（`NodeEditor`）が `NodeDocument` の型付きノードとリンクをキャンバスカードとして描画し、さらにドキュメント変更、選択、履歴、永続化、階層オートレイアウトのためのレンダラー非依存ヘルパーを提供します。ドキュメントヘルパーはプレーンなデータ上のプレーンな関数であり、エンティティをインスタンス化せずにテストでヘッドレス使用できます。

```bash
bun add @vectojs/node-editor
```

```ts
import { NodeEditor } from '@vectojs/node-editor';

const editor = new NodeEditor({ width: 1000, height: 700 });
scene.add(editor);
```

## ドキュメントモデル

```ts
interface NodeDocument {
  nodes: readonly NodeData[];
  links: readonly LinkData[];
}

interface NodeData {
  id: string;
  type: string;
  title: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  ports?: readonly PortDefinition[]; // id, label?, direction 'input'|'output', dataType?, maxConnections?
  data?: Readonly<Record<string, unknown>>;
}

interface LinkData {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
  data?: Readonly<Record<string, unknown>>;
}
```

ミューテーションは新しいドキュメントを返し、入力を決して変更しません:

- `createDocument(doc?)` / `cloneDocument(doc)` — ネストした `data` を深くクローンするため、履歴スナップショットがその場で変更されたレコードのエイリアスになることはありません。
- `addLink(document, link)` — まず検証し（下記参照）、そうでなければ `Invalid link: <error>` をスローします。
- `removeLink(document, id)`。
- `removeNode(document, id)` — ノードと、それに触れるすべてのリンクを削除します（`0.2.0+`）。残りのドキュメントは参照的に有効に保たれます。`removeLink` と同じコピーセマンティクス: 新しい配列、ノード/リンクオブジェクトは共有。

### `validateLink` — リンクルールセット

候補リンクはすべてドキュメントの残りに対して検査されます:

| エラー                                            | 条件                                                  |
| ------------------------------------------------- | ----------------------------------------------------- |
| `missing-source-node`                             | ソース id がどのノードも指さない                      |
| `missing-target-node`                             | ターゲット id がどのノードも指さない                  |
| `same-node`                                       | 自己ループ — 拒否                                     |
| `duplicate-link-id`                               | その id を持つリンクが既に存在                        |
| `missing-source-port` / `missing-target-port`     | 指名されたポートがそのエンドポイントに存在しない      |
| `source-port-direction` / `target-port-direction` | 出力ポートがターゲットとして使われた、またはその逆    |
| `incompatible-types`                              | 両ポートの宣言 `dataType` が異なる                    |
| `duplicate-link`                                  | 同じエンドポイント四つ組が既に接続済み                |
| `target-port-occupied`                            | 入力ポートの `maxConnections`（デフォルト 1）に達した |

サイクルポリシー: 自己ループは拒否されます。複数ノードにまたがるサイクルは許可されます。グラフはユーザー作成のフローであり、`layoutDocument` は強連結成分を一緒にランク付けすることでサイクルを許容します。

## 選択

`SelectionState` は選択された id を追跡します: `select(id, additive?)`、`has(id)`、`clear()`、および反復安全なスナップショットのための `list()`（`0.2.0+`。以前の `toggle()` は削除されました。代わりに `has()` + `select()` で加算選択を構築してください）。`selectedIds` は引き続き `list()` のライブコピーエイリアスです。

## 履歴

`CommandHistory` はコマンドごとにドキュメント全体をスナップショットします: `execute(label, after)`、`undo()`、`redo()`、および現在の状態を表す `currentDocument`（`0.2.0+`。重複していた `.document` ゲッターは削除されました）。エディターが行うすべての変更は 1 つの取り消し可能なコマンドであるため、元に戻す/やり直しがジェスチャーの途中で着地することはありません。

## `NodeEditor` — エンティティ

```ts
new NodeEditor(options?: { document?: NodeDocument; width?: number; height?: number })
```

エディターはノードごとに 1 枚のカード、定義された各ポートにポートホットスポット、リンクごとに 1 本の線を投影します。`document`（防御的クローン）、`selection`、`canUndo`/`canRedo`、およびこれらのミューテーターを公開します。それぞれが単一の取り消し可能なコマンドです:

- `createLink(link)` / `deleteLink(id)`。
- `deleteNodes(ids)`（`0.2.0+`）— 指定されたノードとすべての入射リンクを 1 つの `'Delete nodes'` コマンドで削除します。まず進行中の接続やドラッグを終了し、その後に選択をクリアします。どのノードにも一致しない id は無視され、何も一致しなければ履歴エントリは作られません。
- `select(id, additive?)`。
- `applyAutoLayout(options?)` — `layoutDocument` を実行し、何かを変更した場合にコミットします。
- `undo()` / `redo()` — 両方とも、まず進行中のドラッグや接続を終了するため、ドラッグ中の Ctrl+Z がドラッグ中のノードをテレポートさせたり不正なエントリをコミットしたりすることはありません。

### キーボード操作（WCAG 2.1.1）

| キー                    | 操作                                                                   |
| ----------------------- | ---------------------------------------------------------------------- |
| `Delete` / `Backspace`  | `deleteNodes(selection.list())`（`0.2.0+`）                            |
| `Escape`                | 武装された接続またはアクティブなドラッグをキャンセル。キャンセルを通知 |
| Ctrl/Cmd+`Z`, Shift+`Z` | 元に戻す / やり直す                                                    |
| Ctrl/Cmd+`Y`            | やり直す                                                               |

ポート自体もキーボードで到達可能です: 各ホットスポットはフォーカス可能な `role="button"` として投影され、出力ポートの起動はペンディング接続を武装し、入力ポートの起動はそれをコミットします。このジェスチャを駆動するのは真のキーボード合成のみ（フォーカスされたホットスポットでの Enter/Space）です。ポートへの素のポインタークリックがファントムのペンディング接続を残すことはありません。

### ステータス通知

ペンディングのキーボード接続にはポインターがなく、したがってラバー線もありません。その遷移は不可視の集約ライブリージョン（`role="status"`、`aria-live="polite"`）を通じて通知されます: 武装時（"Linking from …"）、リンクのコミット（"Link created."）、Escape によるキャンセル。ポインタージェスチャは視覚的フィードバックを保持し、通知されません。

### 座標

ドラッグデルタ、接続ターゲティング、ラバー線はすべて、エディター自身のドキュメントローカル空間で機能するため、スケールや平行移動された祖先の下でも正確さを保ちます。接続ドロップは逆追加順で解決されるため、重なり合うカードは下に隠れたカードではなく最上位（最後に描画された）カードのポートに配線されます。

## 永続化

```ts
import {
  nodeEditorPersistence,
  exportDocument,
  importDocument,
  NODE_EDITOR_SCHEMA_VERSION,
} from '@vectojs/node-editor';

// The persistence API is a ready-made object plus equivalent free functions —
// there is no exported class to construct.
const json = nodeEditorPersistence.exportDocument(editor.document); // schemaVersion-stamped
const doc = nodeEditorPersistence.importDocument(json);
// Same operations, stateless form:
const json2 = exportDocument(editor.document);
const doc2 = importDocument(json2);
```

`exportDocument`/`importDocument` は `NODE_EDITOR_SCHEMA_VERSION`（1）を運びます。`serializeDocument`/`deserializeDocument` はバージョンなしのペアです。インポート検証は構造的かつ意味的です（`0.2.0+`）。配列/文字列/有限数の形状チェックに加えて、すべてのリンクがドキュメントの残りに対してランタイムの `validateLink` を通されます。自己ループ、重複エンドポイント対、重複リンク id、ポート方向/型/maxConnections 違反は `links[i]: <verdict.error>` で拒否されるようになりました。永続化されたドキュメントはエディターで再現できることが保証されます。以前は、削除後には再現できないリンクを含むドキュメントがあり得ました。

## オートレイアウト

`layoutDocument(document, options?)` は決定論的なソースからターゲットへの階層を割り当てます: ノードは id でソートされ、強連結成分は一緒にランク付けされ（Tarjan SCC、その後コンポーネント DAG 上の最長経路）、位置は `originX + rank × horizontalGap`、`originY + index × verticalGap`（デフォルト `260`/`120`）に置かれます。入力を決して変更しません。

## 関連情報

読み取り専用グラフのフォース指向配置には [`@vectojs/graph-layout`](/reference/graph-layout/) ·
エディターが基づく `Entity` ライフサイクルには [`@vectojs/core`](/reference/core-api/)。
