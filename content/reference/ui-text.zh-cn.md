+++
title = "UI：Text"
description = "带换行、热态 max-width 重排和语义标签的 canvas 文本组件。"
weight = 16
+++

# `Text`

`Text` 在 canvas 上渲染单一样式的多行文本。它是 VectoJS UI 中标签、辅助文案、标题和短只读文本的默认选择。其透明的内容投影在软换行、显式换行符、CJK 文本、连字和 RTL 段落之间保持精确的逻辑源文本，因此原生选择、复制、页面内查找和翻译不会继承视觉字形顺序。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Text</span></div>
  <iframe src="/sandbox/ui/component.html?name=text&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Text live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>调整页面大小，在聚焦的视口中查看热态 `maxWidth` 重排。</figcaption>
</figure>

## 最小示例

```ts
import { Text } from '@vectojs/ui';

const heading = new Text('Mathematical canvas UI', {
  font: '700 24px Inter, system-ui',
  color: '#f8fafc',
  maxWidth: 360,
  lineHeight: 32,
  selectable: true,
});

scene.add(heading.setPosition(24, 24));
```

## 维护者检查清单

- 对于响应式宽度变化使用 `setMaxWidth()`。
- 对于内容变化使用 `setText()` 或 `append()`。
- 当拖拽手势应拥有文本区域而非浏览器选择时使用 `setSelectable(false)`。
- 保持应用源为逻辑 Unicode 顺序；VectoJS 和浏览器会自动解析阿拉伯文/希伯来文的方向。
- Core 1.8 在变换后的二维几何中解析指针光标；不要为旋转、镜像或非均匀缩放的文本添加仅视口 X 的选择处理器。
- 当需要内联样式或链接时，优先使用 `RichText`。
