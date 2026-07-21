---
title: 'UI：ProgressBar'
description: '带可选百分比标签和 progressbar 语义的 canvas 进度指示器。'
order: 30
---

# `ProgressBar`

`ProgressBar` 绘制一个轨道、填充的强调色和可选的百分比文本。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ProgressBar</span></div>
  <iframe src="/sandbox/ui/component.html?name=progressbar&v=core-1.15.0-ui-2.0.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="ProgressBar live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>使用 `setValue()` 来钳制并重绘进度变化。</figcaption>
</figure>

## 最小示例

```ts
import { ProgressBar } from '@vectojs/ui';

const progress = new ProgressBar({
  value: 0.72,
  width: 320,
  height: 22,
  showText: true,
});

progress.setValue(0.9);
```

## 维护者检查清单

- 将值钳制到 `[0, 1]`。
- 将进度颜色与文本或语义值配对。
- 当值变化时调用 `scene.markDirty()`。
