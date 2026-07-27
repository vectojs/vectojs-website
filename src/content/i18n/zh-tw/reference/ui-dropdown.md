---
title: 'UI: Dropdown'
description: '具有覆蓋層列表框和鍵盤導覽的下拉選單控制項。'
order: 27
---

# `Dropdown`

`Dropdown` 包裝一個 canvas 按鈕，投射 `role="combobox"`，並開啟一個覆蓋層列表框。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Dropdown</span></div>
  <iframe src="/sandbox/ui/component.html?name=dropdown&v=core-1.18.0-ui-2.3.2" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Dropdown live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>使用指標或鍵盤開啟；選單會透過場景覆蓋層路徑掛載。</figcaption>
</figure>

## 最小範例

```ts
import { Dropdown } from '@vectojs/ui';

const backend = new Dropdown(['Canvas', 'WebGL', 'WebGPU'], {
  label: 'Renderer backend',
  width: 220,
  onChange: (value) => setBackend(value),
});
```

> **設定 `label`。** 沒有可存取名稱的 `role=\"combobox\"` 會被讀為單純的「組合方塊」（WCAG 4.1.2）；僅憑選取的值無法說明控制項的用途。任何繪製在 canvas 上的可見標籤都不會送達語意層，因此也要在此傳入。自 `@vectojs/ui@2.2.0` 起可用。

## 維護者檢查清單

- 讓 `expanded`、`controls` 和 `activedescendant` 中繼資料保持同步。
- 在外部點擊和按下 Escape 時關閉覆蓋層。
- 測試 ArrowUp、ArrowDown、Enter、Space 和 Escape。
