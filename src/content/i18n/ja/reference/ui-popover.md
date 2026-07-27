---
title: 'UI: Popover'
description: '任意のVectoJS子要素を含めることができる、クリックで表示されるオーバーレイパネル。'
order: 38
---

# `Popover`

`Popover` はターゲットのクリックで切り替わり、任意のVectoJS子エンティティを含めることができます。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Popover</span></div>
  <iframe src="/sandbox/ui/component.html?name=popover&v=core-1.18.0-ui-2.3.2" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Popover live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>ターゲットを2回クリックしてポップオーバーを開閉します。</figcaption>
</figure>

## 最小限の例

```ts
import { Button, Popover, Text } from '@vectojs/ui';

const target = new Button('Open');
const popover = new Popover({ target, width: 220, height: 92, placement: 'right' });
popover.add(new Text('Popover content').setPosition(14, 20));
```

## メンテナー向けチェックリスト

- パネルを下層のコントロールの上でも読みやすく保ちます。
- 配置を `Overlay` の境界で制約します。
- ターゲットがツリーから離れたらポップオーバーを非表示にするか破棄します。
