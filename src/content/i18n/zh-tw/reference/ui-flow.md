---
title: 'UI: Flow'
description: '用於標籤、標記和響應式工具列的水平換行布局容器。'
order: 22
---

# `Flow`

`Flow` 是一個預先設定為水平換行的 `Stack`。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Flow</span></div>
  <iframe src="/sandbox/ui/component.html?name=flow&v=core-1.17.0-ui-2.2.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Flow live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>使用 `maxWidth` 定義子項目換行到下一行的位置。</figcaption>
</figure>

## 最小範例

```ts
import { Button, Flow } from '@vectojs/ui';

const chips = new Flow({ gap: 8, maxWidth: 360 });
for (const label of ['Canvas', 'WebGL', 'WebGPU']) {
  chips.add(new Button(label, { padding: 8 }));
}
```

## 維護者檢查清單

- 在子項目尺寸變更後重新執行 `layout()`。
- 讓標籤的觸控目標對行動裝置維持足夠大小。
- 對於標記行，優先使用 `Flow` 而非手動 x/y 擺放。
