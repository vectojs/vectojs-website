---
title: 'UI: Card'
description: 'オプションの role=group セマンティクスを備えた角丸canvasパネルコンポーネント。'
order: 20
---

# `Card`

`Card` は `@vectojs/ui` の例全体で使用される基本の視覚パネルです。デフォルトでは装飾的です。`label` を渡すとセマンティックなグループになります。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Card</span></div>
  <iframe src="/sandbox/ui/component.html?name=card&v=core-1.11.1-ui-1.11.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Card live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>カードは背景とボーダーを所有します。子要素はカードのローカル空間に配置されます。</figcaption>
</figure>

## 最小限の例

```ts
import { Card, Text } from '@vectojs/ui';

const card = new Card({
  width: 320,
  height: 180,
  radius: 18,
  border: 'rgba(148,163,184,0.2)',
  label: 'Settings panel',
});

card.add(new Text('Settings').setPosition(24, 24));
scene.add(card);
```

## メンテナー向けチェックリスト

- 領域を発見可能にすべき場合のみ `label` を使用します。
- `padding` が子要素を自動レイアウトすると想定しないでください。
- メンテナンスしやすいレイアウトのために、カード内では `Stack` または `Flow` を推奨します。
