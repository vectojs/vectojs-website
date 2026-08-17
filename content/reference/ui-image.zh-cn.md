+++
title = "UI：Image"
description = "带占位符渲染和语义 img 投影的 canvas 图像组件。"
weight = 19
+++

# `Image`

`Image` 将异步加载的位图绘制到 canvas，并投影一个语义 `<img>` 节点。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Image</span></div>
  <iframe src="/sandbox/ui/component.html?name=image&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Image live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## 适配、焦点裁剪与圆角

`fit` 控制加载的位图如何映射到 `width` × `height` 框中，而 `focalPoint` 细化 `'cover'` 的裁剪 —— 两者均为 2.18.0+。

| `fit`       | 行为                                                 |
| ----------- | ---------------------------------------------------- |
| `'fill'`    | 拉伸到框（默认，旧行为）。                           |
| `'cover'`   | 保持纵横比，填充框，围绕 `focalPoint` 裁剪溢出部分。 |
| `'contain'` | 保持纵横比，将整个位图放入框内（居中）。             |

`focalPoint` 是 `{ x, y }`，每个轴在 `0..1` —— `0` 为顶部/左侧，`1` 为底部/右侧，默认 `{ x: 0.5, y: 0.5 }`；仅 `'cover'` 读取它，超出 `[0, 1]` 的值会被钳制。`radius` 现在会圆化已加载位图的角，而不仅仅是占位符，因此带 `fit: 'cover'` 的圆角头像会把裁剪出的溢出部分裁到相同的轮廓。

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

## 维护者检查清单

- 始终提供 `width` 和 `height`。
- 为非装饰性图像提供有意义的 `alt` 文本。
- 在 `onDemand` 场景中，从 `onLoad` 调用 `scene.markDirty()`。
- options 对象是**必填的** —— 不带 options 的 `new Image(src)` 会抛出异常。
- 跨源 `src`（例如没有 CORS 头的 CDN SVG）会污染 canvas，并破坏之后每一次 `getImageData`/`toDataURL`。请将资源内联为 `data:image/svg+xml` URL 以进行同源安全的绘制。
