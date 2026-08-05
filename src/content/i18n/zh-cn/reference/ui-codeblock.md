---
title: 'UI：CodeBlock'
description: 'Markdown 用于围栏代码的单叶子 canvas 代码块。'
order: 40
---

# `CodeBlock`

`CodeBlock` 是 `Markdown` 使用的底层围栏代码渲染器。两者都位于独立的 **`@vectojs/markdown`** 包中（在 `@vectojs/ui@2.2.0` 中从 `@vectojs/ui` 移出）。它自己绘制背景和语法着色的文本，避免每个 token 一个子实体。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · CodeBlock</span></div>
  <iframe src="/sandbox/ui/component.html?name=codeblock&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="CodeBlock live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>仅在自定义渲染器时直接使用它；普通文档应通过 `Markdown`。</figcaption>
</figure>

## 最小示例

````ts
import { CodeBlock, Markdown } from '@vectojs/markdown';

// Most callers should let Markdown create CodeBlock instances:
const md = new Markdown('```ts\nscene.markDirty();\n```', { maxWidth: 520 });

// Custom Markdown subclasses can return CodeBlock for app-specific fenced blocks.
````

围栏块将其精确的源作为单独定位的视觉行投影，起点缩进和基线与 Canvas 相同。因此长源代码行不会静默地被浏览器换行，从而与复制、页面内查找或原生选择产生偏移。每个硬换行符归属于前面定位的行，防止 Firefox 在投影根处产生选中的片段。默认字体栈以 `ui-monospace` 开头，避免桌面版 Firefox 将代码替换为比例衬线字体，同时仍然尊重显式的自定义字体。Markdown 传播其 `selectable` 设置；直接使用 CodeBlock 者可以调用 `setSelectable(boolean)`。

UI 1.9 对语法着色的 Canvas 绘制和语义载体都使用 Core 1.8 的保留式预备内容网格。因此制表符、emoji/ZWJ、宽 CJK、阿拉伯文成形、混合方向运行和精确的 CR/LF/CRLF 源边界共享一个方案。校准是一个冷态字体加载过程；稳定的投影同步不会读取 Range 几何或替换单元格载体。

## 宽度：`setWidth()`

```ts
codeBlock.setWidth(width: number): this
```

更改盒子宽度（`0.9.0+`）。它有意**不**重建网格或重新运行高亮，因为代码不会重排：行位于固定的等宽网格上、位置为 `col × cellWidth`，过长的行会溢出而不是换行，因此 `height` 仅是行**数**的函数，宽度只决定圆角背景的尺寸。

任何会改变字形几何的变更——源码、语言、字体——都要经过 `setCode()`，它会在那里使网格失效。宽度未变时它是空操作，并返回 `this`。

`Markdown.setMaxWidth()` 会为它拥有的每个围栏代码块调用本方法，因此只有当你自行构造 `CodeBlock` 时才需要直接调用。

## 维护者检查清单

- 将围栏代码保持为一个叶子实体。
- 对于实时更新使用 `setCode()`。
- 仅更改宽度时使用 `setWidth()`；它会跳过 `setCode()` 执行的网格重建。
- 保持内容投影与精确的源、字体和行高同步。
- 为 Canvas 绘制、指针光标、复制和查找重用一个预备网格。
- 在分数 DPR/缩放下验证 Chromium 和 Firefox，包括替换字体和变换块。
- 除非你在编写渲染器扩展，否则优先使用更高级的 `Markdown` 组件。
