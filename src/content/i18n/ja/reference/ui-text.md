---
title: 'UI: Text'
description: '折り返し、ホットな最大幅リフロー、およびセマンティックなラベルを備えたcanvasテキストコンポーネント。'
order: 16
---

# `Text`

`Text` は単一スタイルの複数行テキストをcanvasにレンダリングします。VectoJS UI内のラベル、ヘルパーコピー、見出し、および短い読み取り専用テキストのデフォルトの選択肢です。透過的なコンテンツ投影は、ソフトラップ、明示的な改行、CJKテキスト、リガチャ、RTL段落をまたいで正確な論理的ソーステキストを保持するため、ネイティブの選択、コピー、find-in-page、翻訳は視覚的なグリフ順序を継承しません。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Text</span></div>
  <iframe src="/sandbox/ui/component.html?name=text&v=core-1.32.6-ui-2.15.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Text live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>ページのサイズを変更して、集中したビューポートでホットな `maxWidth` リフローを確認してください。</figcaption>
</figure>

## 最小限の例

```ts
import { Text } from '@vectojs/ui';

const heading = new Text('Mathematical canvas UI', {
  font: '700 24px Inter, system-ui',
  color: '#f8fafc',
  maxWidth: 360,
  lineHeight: 32,
  selectable: true,
});

scene.add(heading.setPosition(24, 24));
```

## メンテナー向けチェックリスト

- レスポンシブな幅の変更には `setMaxWidth()` を使用します。
- コンテンツの変更には `setText()` または `append()` を使用します。
- ドラッグジェスチャーがブラウザの選択ではなくテキスト領域を所有すべき場合は `setSelectable(false)` を使用します。
- アプリケーションのソースは論理的なUnicode順序に保ちます。VectoJSとブラウザがアラビア語/ヘブライ語の方向を自動的に解決します。
- Core 1.8は変換された2次元ジオメトリ内でポインターキャレットを解決します。回転、ミラー、または非均一にスケールされたテキストに対して、ビューポートのXのみの選択ハンドラーを追加しないでください。
- インラインスタイルまたはリンクが必要な場合は `RichText` を推奨します。
