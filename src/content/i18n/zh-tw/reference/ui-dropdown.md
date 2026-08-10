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
  <iframe src="/sandbox/ui/component.html?name=dropdown&v=core-1.34.0-ui-2.15.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Dropdown live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

關閉的觸發器使用 `bg`/`color`；開啟選單中的選項列使用它們自己的五個屬性，全部在 2.7.0 中加入：

| 屬性              | 預設值                      | 適用範圍       |
| ----------------- | --------------------------- | -------------- |
| `menuBg`          | `'rgba(15, 23, 42, 0.95)'`  | 每個選項列     |
| `menuColor`       | `'#fff'`                    | 選項列文字     |
| `menuSelectedBg`  | `'rgba(0, 240, 255, 0.25)'` | 選取的行       |
| `menuHighlightBg` | `'rgba(0, 240, 255, 0.4)'`  | 鍵盤高亮的列   |
| `focusColor`      | `'#00f0ff'`                 | 觸發器與選項列 |

```ts
new Dropdown(['1x', '1.5x', '2x'], {
  label: 'Playback rate',
  bg: 'rgba(18, 23, 34, 0.98)',
  menuBg: 'rgba(18, 23, 34, 0.98)',
  menuColor: '#e2e8f0',
  menuSelectedBg: 'rgba(244, 63, 94, 0.30)',
  menuHighlightBg: 'rgba(244, 63, 94, 0.55)',
  focusColor: '#60a5fa',
});
```

在這些屬性出現之前，觸發器可以設定主題，而選單不能，因此為淺色或暖色調調色盤設計的下拉式方塊會開啟一個帶有青色選取項的深色面板——這看起來像渲染錯誤，而不是樣式選擇。

選擇數值時值得注意的兩點：

- **兩種列狀態可以同時生效**，而且開啟選單會高亮選取的行，因此 `menuHighlightBg` 應被視為兩者中較強的狀態。
- **選項列本身可取得焦點**（`role="option"`），因此 `focusColor` 焦點環會繪製在_高亮的_列之上。讓焦點環與 `menuHighlightBg` 至少保持 3:1 的對比（WCAG SC 1.4.11）——把高亮的不透明度提高到足以與 `menuSelectedBg` 區分，可能會悄悄地把焦點環壓到該下限之下。

接近不透明的選單背景通常是正確的：半透明選單覆蓋在動態 canvas 內容上，雖然靠對比度仍可讀，但看起來會顯得雜亂。

## 維護者檢查清單

- 讓 `expanded`、`controls` 和 `activedescendant` 中繼資料保持同步。
- 在外部點擊和按下 Escape 時關閉覆蓋層。
- 測試 ArrowUp、ArrowDown、Enter、Space 和 Escape。
