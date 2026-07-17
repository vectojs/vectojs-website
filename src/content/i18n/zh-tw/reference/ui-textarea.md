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
  <iframe src="/sandbox/ui/component.html?name=textarea&v=core-1.9.2-ui-1.9.5" class="sandbox-frame component-demo-frame-tall" loading="eager" title="TextArea live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## 維護者檢查清單

- 用它來進行真正的多行文字輸入。
- 保持單一文字編輯擁有者；不要在 canvas 中偽造 IME 或剪貼簿。
- 使用鍵盤選取和貼上測試，而不僅是指標點擊。
- 透明的原生 textarea 繼承了 canvas 的字型、行高、內距和 `border-box`
  約定，因此點擊定位游標和選取列使用與可見 canvas 鏡射相同的幾何。
