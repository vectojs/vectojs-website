---
title: 'UI：RichText'
description: '带链接热点和流式追加支持的多样式内联文本组件。'
order: 17
---

# `RichText`

`RichText` 在共享基线上排布混合的文本片段：粗体、斜体、颜色、大小和内联链接。投影重建逻辑源运行，而非成形的视觉字形，从而在混合字体大小、连字、阿拉伯文/希伯来文文本、软换行和硬换行之间保留精确的剪贴板文本。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · RichText</span></div>
  <iframe src="/sandbox/ui/component.html?name=richtext&v=core-1.15.0-ui-2.0.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="RichText live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>内联链接是覆盖在 canvas 文本上的透明锚点热点。</figcaption>
</figure>

## 最小示例

```ts
import { RichText } from '@vectojs/ui';

const copy = new RichText(
  [
    { text: 'Mixed ' },
    { text: 'weight', style: { bold: true, color: '#22d3ee' } },
    { text: ' with ' },
    { text: 'links', style: { href: '/learn/accessibility/' } },
  ],
  {
    maxWidth: 420,
    selectable: true,
    onLinkClick: (href) => router.open(href),
  },
);
```

## 维护者检查清单

- 保持链接回调贯穿段落、标题和列表渲染器。
- 对于 token 流式传输使用 `appendSpans()`。
- `getContentProjection()` 携带一个显式的视觉行，带有每个运行的字体、一个共享的 Canvas 基线以及实际的行进距。这使混合大小的选择矩形保持对齐，而不是让浏览器重新排布片段。逻辑分隔符归属于前面定位的行，因此多行选择永远不会创建游离的根起点高亮片段。Core 1.8 从变换后的二维 Range 几何中解析合法的字素光标，包括旋转、反射和非均匀缩放。当不需要原生拖拽选择时使用 `setSelectable(false)`。
- 当文本必须围绕局部矩形排布时使用 `setExclusions()`。
