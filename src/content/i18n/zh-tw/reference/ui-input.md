---
title: 'UI: Input'
description: '將原生編輯行為鏡射到 canvas 上的單行文字輸入框。'
order: 23
---

# `Input`

`Input` 使用一個真實的透明 `<input>` 進行編輯，同時在 canvas 上繪製可見的欄位。IME、剪貼簿、選取範圍和自動化都維持原生。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Input</span></div>
  <iframe src="/sandbox/ui/component.html?name=input&v=core-1.11.1-ui-1.11.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Input live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>透過鍵盤輸入或基於角色的自動化填寫文字框。</figcaption>
</figure>

## 最小範例

```ts
import { Input } from '@vectojs/ui';

const name = new Input({
  width: 320,
  placeholder: 'Project name',
  onChange: (value) => updateProjectName(value),
});
```

## 維護者檢查清單

- 使用 `Input` 而非自訂的文字輸入 entity。
- 讓 placeholder 保持有意義；它同時也是預設的無障礙標籤。
- 實作受控更新時有意地保留選取範圍。
