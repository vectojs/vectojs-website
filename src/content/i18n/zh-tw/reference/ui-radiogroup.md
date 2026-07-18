---
title: 'UI: RadioGroup'
description: '以單一 canvas 元件渲染的互斥單選選項。'
order: 28
---

# `RadioGroup`

`RadioGroup` 渲染一組互斥選項，並公開群組層級的語意角色。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · RadioGroup</span></div>
  <iframe src="/sandbox/ui/component.html?name=radiogroup&v=core-1.11.1-ui-1.11.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="RadioGroup live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>此示範在窄寬度時於水平和垂直布局之間切換。</figcaption>
</figure>

## 最小範例

```ts
import { RadioGroup } from '@vectojs/ui';

const renderer = new RadioGroup({
  value: 'webgpu',
  direction: 'horizontal',
  options: [
    { value: 'canvas', label: 'Canvas' },
    { value: 'webgl', label: 'WebGL' },
    { value: 'webgpu', label: 'WebGPU' },
  ],
});
```

## 維護者檢查清單

- 讓選取的視覺狀態和發出的值保持一致。
- 一併使用停用樣式和行為。
- 當標籤、字型或方向變更時重新計算布局。
