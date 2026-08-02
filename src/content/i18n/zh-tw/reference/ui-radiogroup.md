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
  <iframe src="/sandbox/ui/component.html?name=radiogroup&v=core-1.25.0-ui-2.6.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="RadioGroup live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

`RadioGroup` 投射 `{ role: 'radiogroup', label }`。自 2.8.0 起，群組的可存取名稱可設定，預設為通用的 `'Radio group'`：

```ts
new RadioGroup({
  label: 'Render backend',
  options: [
    { value: 'canvas', label: 'Canvas' },
    { value: 'webgl', label: 'WebGL' },
  ],
});
```

每個選項都有自己的名稱，但群組的名稱才能說明_正在做出哪個選擇_。當螢幕上不止一個群組時，預設值會讓螢幕閱讀器使用者反覆聽到 "Radio group"，卻無法區分它們——只要識別群組的可視標題是繪製在 canvas 上而不是群組的一部分，就應該設定它（WCAG 4.1.2）。它也可以在建構後作為公開欄位設定。

## 維護者檢查清單

- 讓選取的視覺狀態和發出的值保持一致。
- 一併使用停用樣式和行為。
- 當標籤、字型或方向變更時重新計算布局。
