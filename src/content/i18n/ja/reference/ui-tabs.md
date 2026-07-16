---
title: 'UI: Tabs'
description: 'アクティブなコンテンツビューをマウントするタブ付きパネルコンテナ。'
order: 29
---

# `Tabs`

`Tabs` はタブバーを描画し、アクティブなタブのコンテンツエンティティのみをマウントします。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Tabs</span></div>
  <iframe src="/sandbox/ui/component.html?name=tabs&v=core-1.9.0-ui-1.9.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Tabs live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>タブを切り替えると、非アクティブなコンテンツはエンティティツリーから削除されます。</figcaption>
</figure>

## 最小限の例

```ts
import { Tabs, Text } from '@vectojs/ui';

const tabs = new Tabs({
  width: 480,
  height: 260,
  tabs: [
    { id: 'usage', label: 'Usage', content: new Text('Usage panel') },
    { id: 'api', label: 'API', content: new Text('API panel') },
  ],
});
```

## メンテナー向けチェックリスト

- タブコンテンツのサイズをコンテナサイズと同期させ続けます。
- アクティブなタブが実際に変わったときのみ `change` を発行します。
- 将来のタブレベルのセマンティクスでキーボード/フォーカスの動作を保持します。
