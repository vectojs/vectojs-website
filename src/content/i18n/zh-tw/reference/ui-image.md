---
title: 'UI: Image'
description: '具有預留位置渲染和語意 img 投射的 canvas 圖片元件。'
order: 19
---

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

## 維護者檢查清單

- 一律提供 `width` 和 `height`。
- 為非裝飾性圖片提供有意義的 `alt` 文字。
- 在 `onDemand` 場景中，從 `onLoad` 呼叫 `scene.markDirty()`。
