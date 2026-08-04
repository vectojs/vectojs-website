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
  <iframe src="/sandbox/ui/component.html?name=textarea&v=core-1.30.0-ui-2.12.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="TextArea live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## IME 输入法组合

当 IME 组合处于活动状态时，组件会在组合范围下方绘制下划线。在此期间**选择高亮被抑制**：在选中文本上进行组合会在逻辑上替换该范围，但原生元素在组合提交之前仍报告组合前的 `selectionStart`/`selectionEnd`——绘制它会显示一个在组合下划线后面（且更宽）的过时高亮。零长度组合（初始 `compositionstart`）仍然显示选择，因为尚未有任何内容替换它。

## 维护者检查清单

- 将其用于真正的多行文本输入。
- 保持单个文本编辑所有者；不要在 canvas 中伪造 IME 或剪贴板。
- 使用键盘选择和粘贴进行测试，而不仅仅是指针点击。
- 透明的原生 textarea 继承 canvas 的字体、行高、内边距和 `border-box` 约定，因此点击定位光标和选择行使用与可见 canvas 镜像相同的几何。

## 滚动

canvas 跟随**原生元素的** `scrollTop`（2.10.0+）。镜像是滚动的权威，而浏览器已经滚动过它，因此这里没有滚轮处理器——添加一个会让手势被应用两次。

在 2.10.0 之前，canvas 的滚动位置仅由光标驱动，只在 `selectionStart` 移动时更新，而从不由视图更新。由此产生了两个缺陷。滚轮手势移动了真实元素而 canvas 原地不动，因此文本根本不滚动。而且由于 `selectionStart` 的初始值为 `value.length`，刚挂载的 TextArea 绘制的是其内容的**底部**，而原生元素却停在顶部——在一个 60 行的文档上实测有 32.6 行的偏差，这使得每次点击的光标都落在错误的行上。

光标跟随作为不存在镜像时的回退被保留下来。镜像还设置了 `scrollbar-width: none`：原生滚动条的凹槽会把 `clientWidth` 收窄到 canvas 宽度之下，因此两者会在不同的位置换行。在 Firefox 上于 2.9.0 实测，一个 516px 宽的 TextArea 有 12px 的凹槽，因此原生元素在 480px 处换行，而 canvas 在 492px 处换行。
