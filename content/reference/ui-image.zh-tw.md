+++
title = "UI: Image"
description = "具有預留位置渲染和語意 img 投射的 canvas 圖片元件。"
weight = 19
+++

# `Image`

`Image` 將非同步載入的點陣圖繪製到 canvas，並投射一個語意 `<img>` 節點。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Image</span></div>
  <iframe src="/sandbox/ui/component.html?name=image&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Image live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>預留位置會持續繪製，直到圖片載入回呼將場景標記為 dirty。</figcaption>
</figure>

## 最小範例

```ts
import { Image } from '@vectojs/ui';

const logo = new Image('/logo.svg', {
  width: 160,
  height: 80,
  alt: 'Vecto logo',
  onLoad: () => scene.markDirty(),
});
```

## 縮放、焦點裁切與圓角

`fit` 控制已載入點陣圖對應到 `width` × `height` 方塊的方式，而 `focalPoint` 進一步細化 `'cover'` 裁切 — 兩者皆為 2.18.0+。

| `fit`       | 行為                                                   |
| ----------- | ------------------------------------------------------ |
| `'fill'`    | 拉伸填滿方塊（預設，舊有行為）。                       |
| `'cover'`   | 保留長寬比、填滿方塊，並裁切 `focalPoint` 周圍的溢出。 |
| `'contain'` | 保留長寬比，將整個點陣圖放入方塊內（置中）。           |

`focalPoint` 是 `{ x, y }`，每個軸在 `0..1` 之間 — `0` 是上/左，`1` 是下/右，預設 `{ x: 0.5, y: 0.5 }`；只有 `'cover'` 會讀取它，且超出 `[0, 1]` 的值會被限制。`radius` 現在會對已載入點陣圖的邊角進行圓角處理，而不只是佔位符，因此搭配 `fit: 'cover'` 的圓形頭像會將裁切的溢出部分剪裁為相同的輪廓。

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

## 維護者檢查清單

- 一律提供 `width` 和 `height`。
- 為非裝飾性圖片提供有意義的 `alt` 文字。
- 在 `onDemand` 場景中，從 `onLoad` 呼叫 `scene.markDirty()`。
