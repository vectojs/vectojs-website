---
title: 'UI: Table'
description: 'コンパクトなデータプレビューとMarkdownテーブル出力のためのcanvas-nativeなグリッドテーブル。'
order: 31
---

# `Table`

`Table` は `role="grid"` を公開し、そのクロムをcanvasに描画し、各セルを子Entityとして所有します。文字列セルは `Text` に正規化されます。指定されたEntityセルは、パブリックな `setMaxWidth()` および `setSelectable()` の機能を通じて参加できます。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Table</span></div>
  <iframe src="/sandbox/ui/component.html?name=table&v=core-1.15.0-ui-2.0.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Table live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## メンテナー向けチェックリスト

- `colWidths` の長さをヘッダーと揃え続けます。有効な幅はTableの幅に正規化されます。
- 論理セルごとに一意のEntityインスタンスを使用します。
- セルのコンテンツまたは寸法が変わった後は `layout()` を呼び出します。
- 大きなデータセットには仮想化を使用します。`Table` はコンパクトなグリッド用です。
- グリッドのラベルは説明的に保ちます。
- 幅またはアプリケーションのズームを変更した後、ヘッダー/本文セルをまたいだドラッグ選択を確認します。
