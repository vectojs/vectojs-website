---
title: 'UI：TextArea'
description: '带 canvas 渲染的多行原生文本编辑。'
order: 24
---

# `TextArea`

`TextArea` 将原生 `<textarea>` 镜像到 canvas 中，保留浏览器的编辑行为。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · TextArea</span></div>
  <iframe src="/sandbox/ui/component.html?name=textarea&v=core-1.9.2-ui-1.9.5" class="sandbox-frame component-demo-frame-tall" loading="eager" title="TextArea live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>多行编辑是原生的；canvas 绘制视觉镜像。</figcaption>
</figure>

## 最小示例

```ts
import { TextArea } from '@vectojs/ui';

const notes = new TextArea({
  width: 420,
  height: 140,
  placeholder: 'Write a note…',
  onChange: (value) => saveDraft(value),
});
```

## 维护者检查清单

- 将其用于真正的多行文本输入。
- 保持单个文本编辑所有者；不要在 canvas 中伪造 IME 或剪贴板。
- 使用键盘选择和粘贴进行测试，而不仅仅是指针点击。
- 透明的原生 textarea 继承 canvas 的字体、行高、内边距和 `border-box` 约定，因此点击定位光标和选择行使用与可见 canvas 镜像相同的几何。
