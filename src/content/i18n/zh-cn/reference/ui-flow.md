---
title: 'UI：Flow'
description: '用于 chip、标签和响应式工具栏的水平换行布局容器。'
order: 22
---

# `Flow`

`Flow` 是一个预配置为水平换行的 `Stack`。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Flow</span></div>
  <iframe src="/sandbox/ui/component.html?name=flow&v=core-1.30.0-ui-2.12.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Flow live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>使用 `maxWidth` 定义子元素在何处换到下一行。</figcaption>
</figure>

## 最小示例

```ts
import { Button, Flow } from '@vectojs/ui';

const chips = new Flow({ gap: 8, maxWidth: 360 });
for (const label of ['Canvas', 'WebGL', 'WebGPU']) {
  chips.add(new Button(label, { padding: 8 }));
}
```

## 维护者检查清单

- 在子元素尺寸变化后重新运行 `layout()`。
- 保持 chip 触摸目标足够大以适配移动端。
- 对于标签行，优先使用 `Flow` 而非手动 x/y 放置。
