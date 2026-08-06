---
title: 'UI: Tooltip'
description: '懸停觸發的覆蓋層文字，錨定於目標 entity。'
order: 37
---

# `Tooltip`

`Tooltip` 在延遲後於目標附近顯示一個小型文字面板。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Tooltip</span></div>
  <iframe src="/sandbox/ui/component.html?name=tooltip&v=core-1.32.2-ui-2.13.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Tooltip live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>懸停目標以驗證擺放位置和消失行為。</figcaption>
</figure>

## 最小範例

```ts
import { Button, Tooltip } from '@vectojs/ui';

const target = new Button('Hover me');
const tooltip = new Tooltip({
  target,
  content: 'Save file',
  placement: 'right',
});
```

## 維護者檢查清單

- 在指標離開時清除待處理的計時器。
- 讓 tooltip 內容保持簡短。
- 掛載一次；讓 tooltip 管理自己的顯示/隱藏生命週期。
