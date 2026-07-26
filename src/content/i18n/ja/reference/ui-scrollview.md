---
title: 'UI: ScrollView'
description: 'ホイールとポインタードラッグによるスクロールを備えた、クリップされたスクロールコンテナ。'
order: 32
---

# `ScrollView`

`ScrollView` は1つのスクロール可能なクリップ領域を所有します。境界のあるコンテンツが可視領域を超える可能性がある場合に使用します。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ScrollView</span></div>
  <iframe src="/sandbox/ui/component.html?name=scrollview&v=core-1.16.0-ui-2.1.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="ScrollView live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>ビューポート内でホイールまたはドラッグします。競合するネストされたスクロール所有者は避けてください。</figcaption>
</figure>

## 最小限の例

```ts
import { ScrollView, Text } from '@vectojs/ui';

const view = new ScrollView({ width: 360, height: 220 });
view.add(new Text('Long content').setPosition(16, 16));
scene.add(view);
```

## メンテナー向けチェックリスト

- 可視領域ごとにホイール所有者は1つに保ちます。
- 子を直接配置変更した後は `updateContentSize()` を呼び出します。
- 末尾に固定されるストリーミングコンテンツには `scrollToBottom()` を使用します。
