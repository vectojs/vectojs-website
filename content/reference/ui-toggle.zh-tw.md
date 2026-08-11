+++
title = "UI: Toggle"
description = "具有 role=switch 語意和彈簧旋鈕動作的開關控制項。"
weight = 26

[extra]
order = 26
+++

# `Toggle`

`Toggle` 是一個開關樣式的布林控制項。它投射 `role="switch"`，並使用共用的動畫系統為旋鈕製作動畫。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Toggle</span></div>
  <iframe src="/sandbox/ui/component.html?name=toggle&v=core-1.34.0-ui-2.15.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Toggle live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>旋鈕平滑地重新定位，同時語意 `checked` 狀態保持即時更新。</figcaption>
</figure>

## 最小範例

```ts
import { Toggle } from '@vectojs/ui';

const darkMode = new Toggle({
  checked: true,
  label: 'Dark mode',
  onChange: (checked) => setDarkMode(checked),
});
```

## 維護者檢查清單

- 讓旋鈕動畫和語意狀態保持一致。
- 透過共用的動畫系統尊重減少動態效果的設定。
- 對於非開關的布林選擇，優先使用 `Checkbox`。
