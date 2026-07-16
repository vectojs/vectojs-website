---
title: 'Markdown'
description: '带富文本、代码块、表格、流式追加和链接回调的 canvas 原生 Markdown 渲染器。'
order: 14
---

# `Markdown`

`Markdown` 使用 `marked` 解析 Markdown，并将结果渲染成一个 VectoJS 实体子树。段落和标题变为 `RichText`，围栏代码变为 `CodeBlock`，而 GFM 表格变为 `Table`。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Markdown</span></div>
  <iframe src="/sandbox/ui/markdown.html?v=core-1.9.0-ui-1.9.1" class="sandbox-frame component-demo-frame component-demo-frame-xl" loading="eager" title="Markdown live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>该示例将散文、链接、内联代码和一个围栏块保持在一个聚焦的视口中，使布局缺陷可见。</figcaption>
</figure>

## 最小示例

```ts
import { Markdown } from '@vectojs/ui';

const md = new Markdown(source, {
  maxWidth: 640,
  selectable: true,
  onLinkClick(href) {
    router.open(href);
  },
});

scene.add(md.setPosition(24, 24));
```

## 构造函数

```ts
new Markdown(markdownText: string, opts?: MarkdownOptions)

interface MarkdownOptions {
  maxWidth?: number;
  theme?: MarkdownTheme;
  onLinkClick?: (href: string) => void;
  selectable?: boolean; // default true
}
```

`selectable` 传播到当前和未来的标题、散文、列表、围栏代码和表格单元格。在运行时用 `markdown.setSelectable(false)` 更改它。浏览器拥有拖拽选择、Ctrl/Command+C 和页面内查找；VMT 实体仍然拥有布局和像素。有序和无序列表项使用可选择的 `RichText`；每个 GFM 表格单元格拥有一个可选择的投影。逻辑源顺序和硬/软分隔符在嵌套的 Markdown 输出中保持完整。Core 1.8 将变换后的散文通过二维光标几何路由，并将围栏代码通过共享的预备网格路由，因此列表、GFM 表格、换行的阿拉伯文/RTL 文本和代码在分数 DPR 和缩放下保留逻辑复制顺序。当应用拥有容器尺寸或 CSS 缩放时，用 `scene.resize(width, height)` 通知 Scene，以便 Firefox 可以重新校准原生 Range 度量。

## 流式传输

对于 token 流，只追加新的增量：

```ts
for await (const token of llmStream) {
  markdown.appendMarkdown(token);
  scrollView.scrollToBottom();
}
```

避免为每个 token 调用 `setContent(fullDocumentSoFar)`；那会重建整个子树。

## 扩展点

`renderToken(token)` 是 protected 的，因此自定义渲染器可以子类化 `Markdown` 以处理应用特定的块，同时仍将普通 token 委托给内置渲染器。

## 维护者检查清单

- 链接回调必须转发到段落、标题和列表 `RichText` 节点。
- 代码块应保持为单个叶子实体，而不是每个 token 或行段一个实体。
- 围栏代码必须投影其精确的源文本和换行。
- 表头使用标题颜色/粗体样式，而每个逻辑单元格恰好拥有一个内容投影。
- 指针所有权保留在叶子文本/代码投影上；结构性的列表和表格实体不得拦截原生选择。
- 流式追加应重用未更改的前缀实体。

相关：[`RichText`](/reference/ui-components/#richtext)、[`CodeBlock`](/reference/ui-components/#codeblock)、[`Table`](/reference/ui-components/#table)。
