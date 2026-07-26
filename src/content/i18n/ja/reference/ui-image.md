---
title: 'UI: Image'
description: 'プレースホルダーレンダリングとセマンティックなimg投影を備えたcanvas画像コンポーネント。'
order: 19
---

# `Image`

`Image` は非同期に読み込まれたビットマップをcanvasに描画し、セマンティックな `<img>` ノードを投影します。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Image</span></div>
  <iframe src="/sandbox/ui/component.html?name=image&v=core-1.17.0-ui-2.2.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Image live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>画像読み込みコールバックがシーンをダーティとマークするまで、プレースホルダーが描画されます。</figcaption>
</figure>

## 最小限の例

```ts
import { Image } from '@vectojs/ui';

const logo = new Image('/logo.svg', {
  width: 160,
  height: 80,
  alt: 'Vecto logo',
  onLoad: () => scene.markDirty(),
});
```

## メンテナー向けチェックリスト

- 常に `width` と `height` を指定します。
- 装飾用でない画像には意味のある `alt` テキストを指定します。
- `onDemand` シーンでは、`onLoad` から `scene.markDirty()` を呼び出します。
