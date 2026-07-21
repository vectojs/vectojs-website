---
title: 'UI: Stack'
description: '垂直または水平の子配置のための構造的レイアウトコンテナ。'
order: 21
---

# `Stack`

`Stack` は子要素を1つの軸に沿って順に配置し、レイアウトされたコンテンツに合わせて自身のサイズを設定します。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Stack</span></div>
  <iframe src="/sandbox/ui/component.html?name=stack&v=core-1.15.0-ui-2.0.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Stack live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>子要素は自身のサイズを保ちます。`Stack` はそれらのローカルな `x` と `y` を書き込むだけです。</figcaption>
</figure>

## 最小限の例

```ts
import { Button, Stack, Text } from '@vectojs/ui';

const column = new Stack({ direction: 'vertical', gap: 12 });
column.add(new Text('Export settings'));
column.add(new Button('Save'));
scene.add(column.setPosition(24, 24));
```

## メンテナー向けチェックリスト

- 子要素のサイズを直接変更した後は `layout()` を呼び出します。
- クロス軸の配置には `align` を使用します。
- 主な要件が水平方向の折り返しである場合は `Flow` を使用します。
