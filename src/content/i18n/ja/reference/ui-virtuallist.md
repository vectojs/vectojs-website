---
title: 'UI: VirtualList'
description: '可視の行とオーバースキャンのみをマウントする仮想化されたスクロールリスト。'
order: 33
---

# `VirtualList`

`VirtualList` は長いアイテム配列の可視ウィンドウのみをレンダリングします。通常の子マウントでは無駄が生じる大きなリストに使用します。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · VirtualList</span></div>
  <iframe src="/sandbox/ui/component.html?name=virtuallist&v=core-1.9.2-ui-1.9.5" class="sandbox-frame component-demo-frame-tall" loading="eager" title="VirtualList live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>デモには120個のアイテムがありますが、可視の行とオーバースキャンのみがマウントされます。</figcaption>
</figure>

## 最小限の例

```ts
import { Text, VirtualList } from '@vectojs/ui';

const list = new VirtualList({
  items,
  width: 360,
  height: 400,
  estimatedRowHeight: 32,
  renderItem: (item) => new Text(item.label),
});
```

## メンテナー向けチェックリスト

- 現実的な `estimatedRowHeight` を指定します。
- 行エンティティは軽量で自己完結的に保ちます。
- データセット全体を置き換える場合は `setItems()` を使用します。
