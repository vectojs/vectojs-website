---
title: 'UI: ProgressBar'
description: '具有選用百分比標籤和 progressbar 語意的 canvas 進度指示器。'
order: 30
---

# `ProgressBar`

`ProgressBar` 繪製軌道、填充強調色和選用的百分比文字。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ProgressBar</span></div>
  <iframe src="/sandbox/ui/component.html?name=progressbar&v=core-1.9.2-ui-1.10.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="ProgressBar live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>使用 `setValue()` 來限制範圍並重繪進度變更。</figcaption>
</figure>

## 最小範例

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

## 維護者檢查清單

- 將值限制在 `[0, 1]` 範圍內。
- 讓進度顏色與文字或語意值搭配。
- 當值變更時呼叫 `scene.markDirty()`。
