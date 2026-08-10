---
title: 'UI: Link'
description: '具有語意錨點投射的獨立 canvas 渲染連結。'
order: 18
---

# `Link`

`Link` 用於獨立的導覽文字。對於文章內的行內連結，請使用 `RichText` 或 `Markdown`。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Link</span></div>
  <iframe src="/sandbox/ui/component.html?name=link&v=core-1.34.0-ui-2.15.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Link live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>可見文字是 canvas；自動化和輔助技術會看到一個真實的錨點。</figcaption>
</figure>

## 最小範例

```ts
import { Link } from '@vectojs/ui';

scene.add(
  new Link('Open docs ↗', {
    href: 'https://vectojs.org',
  }).setPosition(24, 24),
);
```

## 維護者檢查清單

- 在開啟或投射 `href` 之前清理 URL。
- 讓可見標籤和無障礙名稱保持一致。
- 對於嵌入段落內的連結，優先使用 `RichText`。
