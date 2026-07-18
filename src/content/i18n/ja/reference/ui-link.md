---
title: 'UI: Link'
description: 'セマンティックなアンカー投影を備えた、単独のcanvasレンダリングされたリンク。'
order: 18
---

# `Link`

`Link` は単独のナビゲーションテキスト用です。プロース内のインラインリンクには、`RichText` または `Markdown` を使用してください。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Link</span></div>
  <iframe src="/sandbox/ui/component.html?name=link&v=core-1.11.1-ui-1.11.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Link live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>表示されるテキストはcanvasですが、自動化と支援技術は実際のアンカーを認識します。</figcaption>
</figure>

## 最小限の例

```ts
import { Link } from '@vectojs/ui';

scene.add(
  new Link('Open docs ↗', {
    href: 'https://vectojs.org',
  }).setPosition(24, 24),
);
```

## メンテナー向けチェックリスト

- `href` を開いたり投影したりする前にURLをサニタイズします。
- 表示ラベルとアクセシブルネームを一致させ続けます。
- 段落内に埋め込まれるリンクには `RichText` を推奨します。
