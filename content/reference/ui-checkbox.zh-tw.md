+++
title = "UI: Checkbox"
description = "具有原生 input 語意和 canvas 視覺狀態的核取方塊控制項。"
weight = 25
+++

# `Checkbox`

`Checkbox` 投射一個真實的 checkbox input，並在 canvas 上繪製視覺狀態。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Checkbox</span></div>
  <iframe src="/sandbox/ui/component.html?name=checkbox&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Checkbox live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Canvas 點擊和原生 input 變更共用相同的 `change` 路徑。</figcaption>
</figure>

## 最小範例

```ts
import { Checkbox } from '@vectojs/ui';

const enabled = new Checkbox({
  checked: true,
  label: 'Enable semantic projection',
  onChange: (checked) => setEnabled(checked),
});
```

## 維護者檢查清單

- 讓 `checked` 與投射的 input 狀態保持同步。
- 在視覺狀態變更時呼叫 `scene.markDirty()`。
- 除非周圍情境已為控制項命名，否則使用標籤。
