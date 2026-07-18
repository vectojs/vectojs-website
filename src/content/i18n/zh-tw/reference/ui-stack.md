---
title: 'UI: Stack'
description: '用於垂直或水平擺放子項目的結構性布局容器。'
order: 21
---

# `Stack`

`Stack` 沿單一軸依序擺放子項目，並依據排布後的內容調整自身尺寸。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Stack</span></div>
  <iframe src="/sandbox/ui/component.html?name=stack&v=core-1.11.1-ui-1.11.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Stack live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>子項目保留各自的尺寸；`Stack` 只寫入它們的區域 `x` 和 `y`。</figcaption>
</figure>

## 最小範例

```ts
import { Button, Stack, Text } from '@vectojs/ui';

const column = new Stack({ direction: 'vertical', gap: 12 });
column.add(new Text('Export settings'));
column.add(new Button('Save'));
scene.add(column.setPosition(24, 24));
```

## 維護者檢查清單

- 在直接變更子項目尺寸後呼叫 `layout()`。
- 使用 `align` 進行交叉軸擺放。
- 當主要需求為水平換行時使用 `Flow`。
