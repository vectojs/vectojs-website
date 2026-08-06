---
title: 'UI: RichText'
description: 'リンクホットスポットとストリーミング追加のサポートを備えた、複数スタイルのインラインテキストコンポーネント。'
order: 17
---

# `RichText`

`RichText` は共有ベースライン上で混在するスパンをフローします：太字、斜体、色、サイズ、およびインラインリンク。この投影は、整形された視覚的グリフではなく論理的なソースランを再構築し、混在するフォントサイズ、リガチャ、アラビア語/ヘブライ語テキスト、ソフトラップ、ハードブレイクをまたいで正確なクリップボードテキストを保持します。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · RichText</span></div>
  <iframe src="/sandbox/ui/component.html?name=richtext&v=core-1.32.2-ui-2.13.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="RichText live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>インラインリンクは、canvasテキストの上にある透明なアンカーホットスポットです。</figcaption>
</figure>

## 最小限の例

```ts
import { RichText } from '@vectojs/ui';

const copy = new RichText(
  [
    { text: 'Mixed ' },
    { text: 'weight', style: { bold: true, color: '#22d3ee' } },
    { text: ' with ' },
    { text: 'links', style: { href: '/learn/accessibility/' } },
  ],
  {
    maxWidth: 420,
    selectable: true,
    onLinkClick: (href) => router.open(href),
  },
);
```

## メンテナー向けチェックリスト

- リンクコールバックを段落、見出し、リストのレンダラーを通じて配線し続けます。
- トークンのストリーミングには `appendSpans()` を使用します。
- `getContentProjection()` は、ランごとのフォント、共有のCanvasベースライン、
  および実際の行送りを持つ1つの明示的な視覚行を運びます。これにより、ブラウザが
  スパンを再フローするのではなく、混在サイズの選択矩形が整列した状態に保たれます。
  論理的なセパレーターは先行する配置済みの行に属するため、複数行の選択が
  ルート原点のはぐれたハイライトフラグメントを作成することはありません。
  Core 1.8は、回転、反射、非均一スケールを含む変換された2次元のRangeジオメトリから
  合法的な書記素キャレットを解決します。
  ネイティブのドラッグ選択が不要な場合は `setSelectable(false)` を使用します。
- テキストがローカルの矩形の周りをフローする必要がある場合は `setExclusions()` を使用します。
