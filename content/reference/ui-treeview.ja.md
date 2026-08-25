+++
title = "UI: TreeView"
description = "先読みまたは遅延の子読み込みを備えた階層ツリーコンポーネント。"
weight = 34
+++

# `TreeView`

`TreeView` は展開状態とオプションの遅延子読み込みを備えた階層的な行をレンダリングします。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · TreeView</span></div>
  <iframe src="/sandbox/ui/component.html?name=treeview&v=core-1.39.0-ui-2.20.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="TreeView live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>親の行をクリックして展開または折りたたみます。</figcaption>
</figure>

## 最小限の例

```ts
import { TreeView } from '@vectojs/ui';

const tree = new TreeView({
  width: 280,
  height: 360,
  nodes: [{ id: 'packages', label: 'packages', children: [{ id: 'ui', label: 'ui' }] }],
});
```

## オプション

| オプション                                     | 型               | デフォルト | 説明                                                                                             |
| ---------------------------------------------- | ---------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| `nodes`                                        | `TreeNode[]`     | —          | ルートノード。ノードの `children` は配列**または** `() => Promise<TreeNode[]>`（遅延読み込み用） |
| `width` / `height`                             | `number`         | —          | ビューボックス。行はこれに仮想化されます。                                                       |
| `rowHeight`                                    | `number`         | `28`       | 行ピッチ。                                                                                       |
| `font`、`color`、`selectedColor`、`hoverColor` | `string`         | テーマ     | 行の描画。                                                                                       |
| `onSelect`                                     | `(node) => void` | —          | リーフがアクティブ化されたときに発火。                                                           |
| `onExpand`                                     | `(node) => void` | —          | 親が展開されたときに発火。                                                                       |

`setNodes(nodes)` はツリーを置き換えます；展開/選択はノード `id` でキー付けされるため、安定した ID は置き換え時に状態を保持します。

## アクセシビリティとキーボード

`TreeView` は各**表示**行に `role="treeitem"` を投影します——行にプールされた透明でフォーカス可能なホットスポットで、`aria-level`（深度）、行の `aria-expanded`（親のみ）、`aria-selected`、および**ルービング tabindex** を保持し、ツリー全体が1つのタブストップです。

| キー          | アクション                                                         |
| ------------- | ------------------------------------------------------------------ |
| Down / Up     | 次の/前の行に移動                                                  |
| Right         | 折りたたまれた親を展開；既に展開されている場合、最初の子にステップ |
| Left          | 展開された親を折りたたむ； otherwise 親行にステップ                |
| Home / End    | 最初の/最後の行                                                    |
| Enter / Space | アクティブにする（親をトグル、リーフを選択）                       |

アクティブな行はフォーカスが移動する前にビューにスクロールされます。表示された行のみがプールされるため、100k ノードのツリーでも O(viewport) ノードのみを投影します。

ホットスポットは `pointerEvents: 'none'` を設定するため、ツリーは自身のマウス処理（タップでトグル、ドラッグでスクロール）を維持します——キーボードフォーカスと AT 合成の `click` は引き続き通過します。[コンポジットウィジェット](/reference/core-a11y/#複合ウィジェットロービング-tabindex)を参照。

## ポインタとタッチ

- 行を**タップ**してトグル/選択。トグルは `pointerup` 時に発火し、ポインタが約 6px 未満移動した場合のみ——タッチドラッグが開始した行を誤って展開しないようにします。
- **垂直ドラッグ**でスクロール（行が指と1:1で追従）、`ScrollView` / `VirtualList` と同じ。
- **ホイール**でスクロール。

## メンテナー向けチェックリスト

- 展開、折りたたみ、またはノードの置き換え後に行を再構築します。
- 遅延ローダーは冪等に保ちます。
- 選択と展開状態には安定したノードIDを使用します。
- 行に競合するポインタハンドラを追加しないでください：コンポーネントがタップとドラッグの曖昧さを所有し、アクセシブルホットスポットは意図的にポインタをキャッチしません。
