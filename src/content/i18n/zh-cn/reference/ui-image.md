---
title: 'UI：Image'
description: '带占位符渲染和语义 img 投影的 canvas 图像组件。'
order: 19
---

# `Image`

`Image` 将异步加载的位图绘制到 canvas，并投影一个语义 `<img>` 节点。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Image</span></div>
  <iframe src="/sandbox/ui/component.html?name=image&v=core-1.9.0-ui-1.9.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Image live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>占位符会一直绘制，直到图像加载回调将场景标记为脏。</figcaption>
</figure>

## 最小示例

```ts
import { Image } from '@vectojs/ui';

const logo = new Image('/logo.svg', {
  width: 160,
  height: 80,
  alt: 'Vecto logo',
  onLoad: () => scene.markDirty(),
});
```

## 维护者检查清单

- 始终提供 `width` 和 `height`。
- 为非装饰性图像提供有意义的 `alt` 文本。
- 在 `onDemand` 场景中，从 `onLoad` 调用 `scene.markDirty()`。
