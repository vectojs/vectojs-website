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
  <iframe src="/sandbox/ui/component.html?name=input&v=core-1.30.0-ui-2.12.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Input live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## 驗證狀態 (2.3.0+)

`required` 和 `invalid` 會觸及無障礙樹，而不僅僅是邊框：

```ts
const email = new Input({ width: 240, placeholder: 'Email', required: true });
email.invalid = !isValidEmail(email.value); // 紅色邊框 + aria-invalid
```

`required` 會投射為陰影 `<input>`/`<textarea>` 上的**原生** `required` 屬性，因此它會參與表單驗證和 `:invalid` 樣式設定，而不只是描述約束。`invalid` 則變為 `aria-invalid`。

清除 `invalid` 會**移除**該屬性，而不是將其設定為 `"false"` — 兩者代表不同意義，因為 `aria-invalid="false"` 是斷言為「明確有效」。

單純的紅色邊框對螢幕閱讀器和無法辨識該顏色的使用者（WCAG 1.4.1）來說是不可見的，這就是為什麼該狀態會被投射而不僅是繪製。在強制色彩下，這兩種狀態都會遵從系統色彩。

`TextArea` 也接受這兩個相同的選項。

## IME 輸入法組合

當 IME 組合處於活動狀態時，元件會在組合範圍下方繪製底線。在此期間**選取高亮被抑制**：在選取文字上進行組合會在邏輯上替換該範圍，但原生元素在組合提交之前仍報告組合前的 `selectionStart`/`selectionEnd`——繪製它會顯示一個在組合底線後面（且更寬）的過時高亮。零長度組合（初始 `compositionstart`）仍然顯示選取，因為尚未有任何內容替換它。

## 維護者檢查清單

- 使用 `Input` 而非自訂的文字輸入 entity。
- 讓 placeholder 保持有意義；它同時也是預設的無障礙標籤。
- 實作受控更新時有意地保留選取範圍。
