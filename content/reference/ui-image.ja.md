+++
title = "UI: Image"
description = "プレースホルダーレンダリングとセマンティックなimg投影を備えたcanvas画像コンポーネント。"
weight = 19
+++

# `Image`

`Image` は非同期に読み込まれたビットマップをcanvasに描画し、セマンティックな `<img>` ノードを投影します。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Image</span></div>
  <iframe src="/sandbox/ui/component.html?name=image&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Image live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## フィッティング、焦点クロッピング、角丸

`fit` は、読み込まれたビットマップを `width` × `height` のボックスにどのようにマッピングするかを制御し、`focalPoint` は `'cover'` のクロッピングを調整します — いずれも2.18.0以降です。

| `fit`       | 動作                                                                                |
| ----------- | ----------------------------------------------------------------------------------- |
| `'fill'`    | ボックスに引き伸ばします（デフォルト、従来の動作）。                                |
| `'cover'`   | アスペクト比を保ち、ボックスを満たし、`focalPoint` の周囲で余剰分をクロップします。 |
| `'contain'` | アスペクト比を保ち、ビットマップ全体をボックス内に収めます（中央揃え）。            |

`focalPoint` は `{ x, y }` で、各軸は `0..1` — `0` が上/左、`1` が下/右、デフォルトは `{ x: 0.5, y: 0.5 }` です。これを読むのは `'cover'` のみで、`[0, 1]` の範囲外の値はクランプされます。`radius` はプレースホルダーだけでなく、読み込まれたビットマップの角も丸めるようになりました。そのため、`fit: 'cover'` の丸いアバターは、クロップされた余剰分を同じシルエットにクリップします。

```ts
import { Image, type ImageFit, type ImageFocalPoint } from '@vectojs/ui';

const avatar = new Image('/avatar.jpg', {
  width: 96,
  height: 96,
  fit: 'cover',
  focalPoint: { x: 0.5, y: 0.25 }, // bias toward the top of the frame
  radius: 48, // circle-crop the loaded bitmap
  alt: 'Profile photo',
});
```

## メンテナー向けチェックリスト

- 常に `width` と `height` を指定します。
- 装飾用でない画像には意味のある `alt` テキストを指定します。
- `onDemand` シーンでは、`onLoad` から `scene.markDirty()` を呼び出します。
