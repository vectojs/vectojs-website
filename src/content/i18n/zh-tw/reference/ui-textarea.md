---
title: 'UI: TextArea'
description: '具有 canvas 渲染的多行原生文字編輯。'
order: 24
---

# `TextArea`

`TextArea` 將原生 `<textarea>` 鏡射到 canvas，保留瀏覽器的編輯行為。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · TextArea</span></div>
  <iframe src="/sandbox/ui/component.html?name=textarea&v=core-1.17.0-ui-2.2.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="TextArea live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>多行編輯是原生的；canvas 繪製視覺鏡射。</figcaption>
</figure>

## 最小範例

```ts
import { TextArea } from '@vectojs/ui';

const notes = new TextArea({
  width: 420,
  height: 140,
  placeholder: 'Write a note…',
  onChange: (value) => saveDraft(value),
});
```

## IME 輸入法組合

當 IME 組合處於活動狀態時，元件會在組合範圍下方繪製底線。在此期間**選取高亮被抑制**：在選取文字上進行組合會在邏輯上替換該範圍，但原生元素在組合提交之前仍報告組合前的 `selectionStart`/`selectionEnd`——繪製它會顯示一個在組合底線後面（且更寬）的過時高亮。零長度組合（初始 `compositionstart`）仍然顯示選取，因為尚未有任何內容替換它。

## 維護者檢查清單

- 用它來進行真正的多行文字輸入。
- 保持單一文字編輯擁有者；不要在 canvas 中偽造 IME 或剪貼簿。
- 使用鍵盤選取和貼上測試，而不僅是指標點擊。
- 透明的原生 textarea 繼承了 canvas 的字型、行高、內距和 `border-box`
  約定，因此點擊定位游標和選取列使用與可見 canvas 鏡射相同的幾何。
