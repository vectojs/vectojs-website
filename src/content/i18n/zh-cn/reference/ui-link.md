---
title: 'UI：Link'
description: '带语义锚点投影的独立 canvas 渲染链接。'
order: 18
---

# `Link`

`Link` 用于独立的导航文本。对于散文中的内联链接，使用 `RichText` 或 `Markdown`。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Link</span></div>
  <iframe src="/sandbox/ui/component.html?name=link&v=core-1.30.0-ui-2.12.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Link live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>可见文本是 canvas；自动化和辅助技术看到的是真实的锚点。</figcaption>
</figure>

## 最小示例

```ts
import { Link } from '@vectojs/ui';

scene.add(
  new Link('Open docs ↗', {
    href: 'https://vectojs.org',
  }).setPosition(24, 24),
);
```

## 维护者检查清单

- 在打开或投影 `href` 之前对 URL 进行净化。
- 保持可见标签和无障碍名称一致。
- 对于嵌入段落内部的链接，优先使用 `RichText`。
