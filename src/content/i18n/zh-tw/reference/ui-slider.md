---
title: 'Slider'
description: '公開 WAI-ARIA slider 約定的 canvas slider 元件，在按需場景中平滑重繪。'
order: 13
---

# `Slider`

`Slider` 是一個指標驅動的範圍控制項。它在 canvas 上繪製軌道、進度和滑塊，同時公開 `role="slider"` 以及 `valuemin`、`valuemax` 和即時 `value` 中繼資料。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Slider</span></div>
  <iframe src="/sandbox/ui/slider.html?v=core-1.17.1-ui-2.3.0" class="sandbox-frame component-demo-frame component-demo-frame-tall" loading="eager" title="Slider live demo" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>拖曳滑塊，觀察標籤和進度條從相同的變更事件更新。</figcaption>
</figure>

## 最小範例

```ts
import { Slider, Text } from '@vectojs/ui';

const label = new Text('Quality: 64%');
const slider = new Slider({
  min: 0,
  max: 100,
  value: 64,
  width: 320,
  onChange(value) {
    label.setText(`Quality: ${value}%`);
    scene.markDirty();
  },
});
```

## 建構函式

```ts
new Slider({
  label?: string;            // accessible name — set this
  min?: number;              // default 0
  max?: number;              // default 100
  value?: number;            // default min
  width?: number;            // default 200
  height?: number;           // default 24
  trackColor?: string;
  progressColor?: string;
  handleColor?: string;
  onChange?: (value: number) => void;
})
```

> **設定 `label`。** 沒有可存取名稱的 `role=\"slider\"` 會被讀為單純的"slider"，讓螢幕閱讀器使用者完全不知道它控制什麼（WCAG 4.1.2）。你在 canvas 上繪製的任何可見標籤都不會送達語意層，因此也要在此傳入。省略 `label` 會使 `aria-label` 保持未設定，而不是從值推導名稱 —— 錯誤的名稱比沒有更糟。自 `@vectojs/ui@2.2.0` 起可用。

## 事件

`Slider` 在指標輸入變更四捨五入後的值時發出帶有 `{ value }` 的 `change`。在相同值上重複的指標事件不會發出重複的變更。

## 維護者檢查清單

- 指標更新必須將區域 X 限制到 `[0,width]`。
- 值變更必須呼叫 `scene.markDirty()`，讓 `renderMode = 'onDemand'` 保持平滑。
- 讓角色中繼資料與當前值保持同步。

相關：[`ProgressBar`](/reference/ui-components/#progressbar)、[`Input`](/reference/ui-components/#input)、[`Button`](/reference/ui-button/)。
