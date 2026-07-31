---
title: 'UI: Table'
description: 'コンパクトなデータプレビューとMarkdownテーブル出力のためのcanvas-nativeなグリッドテーブル。'
order: 31
---

# `Table`

`Table` は完全な `grid` › `row` › `gridcell`/`columnheader` ツリーを投影し、canvas にクロムを描画し、各セルを子 Entity として所有します。文字列セルは `Text` に正規化されます；提供された Entity セルは公開された `setMaxWidth()` と `setSelectable()` の機能を通じて参加できます。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Table</span></div>
  <iframe src="/sandbox/ui/component.html?name=table&v=core-1.18.0-ui-2.3.2" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Table live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>巨大なギャラリー内でテーブル出力をデバッグする代わりに、列のサイズ設定には集中したデモを使用してください。</figcaption>
</figure>

## 最小限の例

```ts
import { Table } from '@vectojs/ui';

const table = new Table({
  width: 520,
  headers: ['Component', 'Role'],
  rows: [
    ['Button', 'button'],
    ['Input', 'textbox'],
  ],
  selectable: true,
});
```

`layout()` はすべてのセルを制約し、行/テーブルの高さを計算し、レンダリング前に子要素を配置します。`render()` は描画のみです。外部から供給されたEntityセルを変更した後、またはパブリックな文字列データを変更した後は、`table.layout()` を呼び出します。各論理セルは1つのコンテンツ投影を所有するため、ブラウザの選択とfind-in-pageがテーブルテキストを重複させることはありません。

選択はテーブル所有ではなくセル所有です：文字列セルは選択可能な `Text` に正規化され、供給されたエンティティはサポートされている場合 `setSelectable()` を受け取り、Markdownテーブルは同じ契約を継承します。したがって、セルをまたいだドラッグは論理セルのテキストを一度コピーしますが、Canvasは唯一の視覚レンダラーのままです。構造的な `role="grid"` シャドウは、セル投影からのポインターイベントをキャプチャしません。このリーフの所有権が、セルをまたいだドラッグ選択、Ctrl/Command+C、find-in-pageをVMTテキストと正確に一度だけ整列させます。

## アクセシビリティとキーボード

投影されたツリーは実際の ARIA グリッドです：固定された `columnheader` の行と、**可視な**各行1つの `row`（仮想化対応）、各セルはフォーカス可能な `gridcell` ホットスポットです。正確に1つのセルが**ルービング tabindex** を保持し、グリッド全体が1つのタブストップです。

| キー                 | アクション                                                 |
| -------------------- | ---------------------------------------------------------- |
| 矢印キー             | フォーカスされたセルを2Dで1ステップ移動（ヘッダーは行 -1） |
| Home / End           | 現在の行の最初/最後の列                                    |
| Ctrl+Home / Ctrl+End | 最初のヘッダーセル / 最後のボディセル                      |

対象のセルはフォーカスが移動する前にビューにスクロールされます。[コンポジットウィジェット](/reference/core-a11y/#複合ウィジェットロービング-tabindex)を参照。

## ポインタとタッチ

- **セル間のドラッグ**はネイティブにテキストを選択します（セル投影がポインタを所有——上記参照）。
- **垂直ドラッグ**で仮想化されたボディをスクロールすると、指と1:1でスクロールするため、タッチスクリーンでも使用でき、ホイールのみではありません。
- **ホイール**で仮想化されたボディをスクロールします。

## メンテナー向けチェックリスト

- `colWidths` の長さをヘッダーに合わせてください；有効な幅は Table 幅に正規化されます。
- 各論理セルに固有の Entity インスタンスを使用してください。
- セルの内容や寸法が変わった後に `layout()` を呼び出してください。
- 大規模データセットには仮想化を使用してください；`Table` はコンパクトなグリッド用です。
- グリッドラベルを説明的に保ってください。
- 幅やアプリケーションのズームを変更した後、ヘッダー/本体セル間のドラッグ選択を確認してください。
- 仮想化や列数を変更した後、キーボードナビゲーションが各セルに到達することを確認してください。
