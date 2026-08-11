+++
title = "Markdown"
description = "带富文本、代码块、表格、流式追加和链接回调的 canvas 原生 Markdown 渲染器 —— 独立的 @vectojs/markdown 包。"
weight = 14

[extra]
order = 14
+++

# `Markdown` —— `@vectojs/markdown`

`Markdown` 和 `CodeBlock` 位于独立的 **`@vectojs/markdown`** 包中（从 `@vectojs/ui@2.2.0` 起它们不再是 `@vectojs/ui` 的一部分，因此 `marked` + `@vectojs/tex` 依赖仅在你渲染 Markdown 时才加载）。它组合了 `@vectojs/ui` 组件，因此请将它与 `@vectojs/ui` 和 `@vectojs/core` 一起安装：`bun add @vectojs/markdown @vectojs/ui @vectojs/core`。

`Markdown` 使用 `marked` 解析 Markdown，并将结果渲染成一个 VectoJS 实体子树。段落和标题变为 `RichText`，围栏代码变为 `CodeBlock`，而 GFM 表格变为 `Table`。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Markdown</span></div>
  <iframe src="/sandbox/ui/markdown.html?v=core-1.34.0-ui-2.15.1" class="sandbox-frame component-demo-frame component-demo-frame-xl" loading="eager" title="Markdown live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>该示例将散文、链接、内联代码和一个围栏块保持在一个聚焦的视口中，使布局缺陷可见。</figcaption>
</figure>

## 最小示例

```ts
import { Markdown } from '@vectojs/markdown';

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
  userTiming?: boolean; // emit a `vecto:markdown:parse` measure, default false
}
```

`selectable` 传播到当前和未来的标题、散文、列表、围栏代码和表格单元格。在运行时用 `markdown.setSelectable(false)` 更改它。浏览器拥有拖拽选择、Ctrl/Command+C 和页面内查找；VMT 实体仍然拥有布局和像素。有序和无序列表项使用可选择的 `RichText`；每个 GFM 表格单元格拥有一个可选择的投影。逻辑源顺序和硬/软分隔符在嵌套的 Markdown 输出中保持完整。Core 1.8 将变换后的散文通过二维光标几何路由，并将围栏代码通过共享的预备网格路由，因此列表、GFM 表格、换行的阿拉伯文/RTL 文本和代码在分数 DPR 和缩放下保留逻辑复制顺序。当应用拥有容器尺寸或 CSS 缩放时，用 `scene.resize(width, height)` 通知 Scene，以便 Firefox 可以重新校准原生 Range 度量。

## 响应式宽度：`setMaxWidth()`

```ts
markdown.setMaxWidth(width: number): this
```

在新宽度下重新排布每个已渲染的块（`0.9.0+`）。请在调整尺寸时调用它，而不是赋值 `maxWidth`——后者只设置字段而不会带来任何可见变化：宽度是在每个块被**构建**时读取的，因此赋值会让已存在的块仍按旧宽度测量。

```ts
window.addEventListener('resize', () => {
  scene.resize(window.innerWidth, window.innerHeight);
  markdown.setMaxWidth(window.innerWidth - INSET * 2);
});
```

它是就地重排而非重建，这正是它能在流式传输过程中使用的原因：

- 相同的块实体**实例**得以保留，因此任何持有其引用的东西（滚动锚点、命中目标、devtools 选择）都继续有效；
- 打开的 [`createStream()`](#流式传输) 写入器不受影响并继续追加；
- 不会重新进行词法分析。

在两个引擎上对一份五个块的文档实测：520 → 260 px 使投影行数从 2 变为 4、高度从 88 变为 160，且落在相同的两个段落实例上，写入器仍为 `open`，交给词法分析器的字符数增加量为**零**。

宽度未变时它是空操作，因此仅高度变化的尺寸调整不产生成本，调用方也无需自行加保护判断。负宽度会被钳制为 0。

> [!NOTE]
> 在 `0.9.0` 之前，唯一正确的替代做法是完整重建——释放流、把已揭示的源码通过 `setContent()` 重放、打开一个新的写入器，并手工把滚动偏移搬过去。它确实能正确复现文档，这也正是它容易被保留下来的原因：重建同样会产出正确的几何。它的代价是每次调整尺寸都要对整篇文档重新做词法分析，并丢弃每一个实体实例。

展示型公式被有意保留其自身宽度：`@vectojs/tex` 是依据相对于 `ex` 的度量而非可用宽度来确定排版盒子的尺寸，因此拉伸它会使公式变形。围栏代码同样不会被重新排布——代码使用固定的等宽网格，过长的行按设计溢出——只有它的背景会被调整尺寸。

从 [`onStable`](#一次性完成onstable) 回调中调用它会抛出异常，原因与 `setContent()` 相同：该回调运行在它将要使之失效的那次提交内部。

## GFM 覆盖范围

除了段落、标题、列表、围栏代码和表格之外：

| 结构                | 渲染为                                                                       |
| ------------------- | ---------------------------------------------------------------------------- |
| `~~strikethrough~~` | 带删除线的文本 —— 每个合并的文本段一道线，线宽按字号缩放（`0.8.0+`）         |
| `- [ ]` / `- [x]`   | 用 ☐ 或 ☑ 字形加一个空格替换项目符号；有序列表时为 `1.` 加该字形（`0.8.0+`） |
| `\|:--\|--:\|:-:\|` | 列对齐，转发给 `Table.align`（`0.8.0+`）                                     |
| `$…$` / ` ```math ` | 由 `@vectojs/tex` 排版的公式（内联 / 块级），仅在定界符闭合后才转换          |

## 前置元数据（Front matter）

文档开头由 `---` 界定的 YAML 块是元数据，而非内容（`0.8.0+`）：

```ts
const md = new Markdown('---\ntitle: Release notes\ndate: 2026-08-03\n---\n# Body');

md.frontMatter; // 'title: Release notes\ndate: 2026-08-03\n'
md.frontMatterFields; // { title: 'Release notes', date: '2026-08-03' }
```

在 `0.8.0` 之前，该块会作为内容渲染：`marked` 没有前置元数据的概念，因此开头的 `---` 命中了分隔线规则，而结尾的那个则**把这些键当作 setext 标题来加下划线**。于是带元数据的文档会绘制出一条水平分隔线，加上一个由其自身键构成的 28px 粗体标题。

`frontMatterFields` 是一个狭义的便利功能，而非 YAML —— 缩进行会被跳过，因此嵌套的映射和序列绝不会作为顶级键泄漏出来（父键会存在，但值为空）。若需要更丰富的能力，请把 `md.frontMatter` 交给一个真正的解析器。`scanFrontMatter(text, complete)` 和 `parseFrontMatterFields(raw)` 都已导出，可用于原始文本。

识别是有意保守的，因为一次误判会静默地删掉文档的开头部分。开头的 `---` 只有在下一行是一个 YAML 映射条目（`key: value`，且按 YAML 的要求在冒号后带空白字符）**并且**后面跟着一个结尾的 `---` 或 `...` 时，才是前置元数据。因此 `---\n\n# Title`、`---\n# Title\n---`、`----\nkey: v\n----` 和 `---\n- a\n---` 都仍然渲染为一条分隔线。

在流式传输过程中，落在未闭合块内部的分块会被暂存而不是被词法分析，这样文档就不会先绘制出一条分隔线、再由结尾定界符把它拆掉。当流关闭时仍然处于打开状态的块会被释放为内容，而暂存是有界的，因此一篇长文档开头的一条分隔线无法让它停滞。

## 流式传输

`createStream()` 为该 `Markdown` 绑定一个按帧合并的写入器。消费源数据时 await
`write()`；`close()` 会强制提交尾部内容，无需再等待一个动画帧：

```ts
const stream = markdown.createStream();

try {
  for await (const token of llmStream) {
    await stream.write(token);
  }
  await stream.close();
} catch (error) {
  stream.abort(error);
  throw error;
}
```

```ts
interface StreamControllerOptions {
  maxBufferedChars?: number; // default 64 * 1024 UTF-16 code units
  pacing?: {
    graphemesPerSecond: number;
  };
  signal?: AbortSignal;
  incompleteMode?: IncompleteMarkdownMode; // default 'literal'
  onStable?: (blocks: readonly Entity[]) => void;
}

type IncompleteMarkdownMode = 'literal' | 'optimistic';

type StreamControllerState = 'open' | 'closed' | 'aborted';

interface StreamController {
  readonly state: StreamControllerState;
  readonly bufferedChars: number; // accepted + one blocked write
  write(chunk: string): Promise<void>;
  flush(): void;
  close(): Promise<void>;
  abort(reason?: unknown): void;
  destroy(): void;
}
```

默认模式会把下一个 rAF 之前接受的所有分块合并为一次解析/布局提交。`write()`
在有界缓冲区接纳时解析，而不是在可见时解析。容量不足时，一次写入会等待；若在该等待者
存在期间再写入则会拒绝，因此忽略背压的生产者无法让队列无限增长。

`pacing.graphemesPerSecond` 在保持每帧一次提交上限的同时，加入固定的挂钟打字机节奏。
`Intl.Segmenter` 会让普通组合序列、emoji ZWJ 簇、旗帜和代理对在分块/帧边界上保持完整。
完整的生命周期、有界的病态簇回退、底部跟随模式与转录策略见[流式与实时文本](/learn/streaming/)。

### 尾部未闭合语法：`incompleteMode`

流经常在 token 中间被截断，因此一个块的最后几个字符常常是一半的语法结构。`incompleteMode` 决定了当控制器打开时，该尾部内容如何渲染：

| 模式                 | 流式传输 `a **bo` 时                      |
| -------------------- | ----------------------------------------- |
| `'literal'` _(默认)_ | 文本 `a **bo` —— 星号作为普通文本显示     |
| `'optimistic'`       | 文本 `a bo`，且 `bo` 加粗 —— 隐藏语法标记 |

`'optimistic'` 会猜测尾部段落中最后一个未闭合的加粗/强调/内联代码/链接结构将会闭合。这种猜测**仅用于显示**——token 状态永远不会被改变——并且它会在 `close()` 时解开。因此，同一数据源的 `'literal'` 和 `'optimistic'` 流最终会生成字节级完全相同的文档。`'literal'` 是在该选项推出之前每个版本的默认行为。

该模式由 `Markdown` 解释，而非由控制器解释：控制器负责缓冲和节调，而猜测是对尾部段落进行渲染时的转换。

### 一次性完成：`onStable`

```ts
const stream = markdown.createStream({
  onStable: (blocks) => {
    // 运行一次，携带完成的文档。适合执行如果在流中途进行会被浪费的工作。
    console.log(`settled with ${blocks.length} top-level blocks`);
  },
});
```

触发**仅一次**，在 `close()` 提交了最终文本**并且**任何进行中的 worker 解析都已应用之后，携带文档在那个瞬间顶级块实体的快照。独立于 `incompleteMode`，因此它与 `'literal'` 默认值协同工作。

它被有意设计为非通用的“流进度”钩子：

- **永远不会被 `flush()`、`abort()` 或 `destroy()` 触发。** 那些都不意味着内容完成了更改。
- 在回调内部调用 `appendMarkdown()` 或 `setContent()` 会**同步抛出错误**——重入突变将使它刚刚获取到的快照失效。
- 回调中抛出的错误会拒绝 `close()` 的 promise。无论哪种方式，控制器都会被释放。

流式结束后的一次性工作 —— 烘焙高亮缓存、启动入场动画 —— 适合放在这里，
这类工作不该在内容仍可能变化的流式过程中运行。

一个 `Markdown` 同时只能打开一个控制器。`setContent()` 会在替换前中止它；
`destroy()` 会中止它并移除 rAF/`AbortSignal` 监听器。终态控制器会注销。公开的
`appendMarkdown()` 仍是同步的：它先冲刷此前提交的每个控制器分块，再按精确的调用
顺序应用直接分块。

避免为每个 token 调用 `setContent(fullDocumentSoFar)`；那会重建整个子树。

## 性能模型

每次调用的实际开销，以便可以理性分析流式代码：

- **解析默认在后台线程进行。** `appendMarkdown` 将累积的源码发布到由内嵌 bundle 构建的 `Worker`（无网络请求）；当解析返回时，应用 token 差异和实体更新。没有 `Worker` 的环境（某些测试运行器、SSR）回退到同步词法分析 —— 相同的结果，主线程成本。
- **每次追加的词法分析是 O(文档大小)**，而非 O(块大小)：每次调用都会重新标记化整个累积的源码。使用 `createStream()` 按帧批处理，并将长篇转录分段为每条消息一个 `Markdown` 实体，以使实时文档保持较小。
- **已完成的块会被重用，而非重建。** `appendMarkdown` 通过原始源码将新 token 列表与旧列表进行前缀匹配；每个已渲染的块保持其实体实例。常见的流式情况 —— 最后一个段落增长 —— 原地更新该段落的跨度。
- **`setContent()` 不重用任何内容。** 它移除所有子元素并重新渲染完整的 token 列表。它是_替换_文档的正确调用，而_增长_文档的错误调用。

## 扩展点

`renderToken(token)` 是受保护的，因此自定义渲染器可以子类化 `Markdown` 以处理应用特定的块，同时仍将普通 token 委托给内置渲染器。

## 维护者检查清单

- 链接回调必须转发到段落、标题和列表 `RichText` 节点。
- 代码块应保持为单个叶子实体，而不是每个 token 或行段一个实体。
- 围栏代码必须投影其精确的源文本和换行。
- 表头使用标题颜色/粗体样式，而每个逻辑单元格恰好拥有一个内容投影。
- 指针所有权保留在叶子文本/代码投影上；结构性的列表和表格实体不得拦截原生选择。
- 流式追加应重用未更改的前缀实体。

相关：[`RichText`](/reference/ui-components/#richtext)、[`CodeBlock`](/reference/ui-components/#codeblock)、[`Table`](/reference/ui-components/#table)。
