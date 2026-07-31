---
title: '文本与排版'
description: 'VectoJS的文本系统：冷/热LayoutEngine拆分、LLM输出的流式处理、带混合样式的富文本、MSDF字体、阿拉伯语/双向文本和排除形状。'
order: 14
---

# 文本与排版

VectoJS附带一个围绕两个关键思想构建的文本引擎：**将测量与布局分离**（以便调整大小避免重新测量），以及**在段落级别进行记忆化**（以便追加路径可以重用未更改的前导段落）。

## 实时体验

<figure class="sandbox">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">实时 · @vectojs/core</span></div>
  <iframe src="/sandbox/text-streaming.html" class="sandbox-frame" loading="lazy" title="文本流式传输交互示例" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption><code>label.append(chunk)</code>每30毫秒调用一次 —— O(更改的段落)，而不是O(文档)。点击Replay重新启动流。</figcaption>
</figure>

## 选择合适的组件

| 场景                               | 使用             |
| ---------------------------------- | ---------------- |
| 静态或简单动态文本                 | `Text`           |
| 混合样式（粗体、斜体、链接、颜色） | `RichText`       |
| Markdown文档                       | `Markdown`       |
| 分辨率无关的GPU文本（游戏UI、3D）  | `MSDFTextEntity` |
| 等宽网格（终端）                   | `GridTextEntity` |
| 由矢量图集支持的自定义文本         | `TextEntity`     |

`Text`、`RichText`和`Markdown`位于`@vectojs/ui`中。基于`Entity`的文本渲染器（`MSDFTextEntity`、`GridTextEntity`、`TextEntity`）位于`@vectojs/core`中。它们所构建于其上的更底层塑形基元 —— BiDi、阿拉伯语塑形、排版度量、MSDF字体解析、预备内容网格 —— 是独立的`@vectojs/text`包，而断行/内联布局引擎是`@vectojs/layout`。两者都由`@vectojs/core`重新导出，因此你可以从任一处导入它们。

### 可选择的固定网格文本

终端、代码编辑器和其他按单元格渲染的组件应使用Core 1.8的`prepareContentGrid()`编译其逻辑源。在Canvas上绘制返回的单元格，并从`getContentProjection()`返回相同的不可变网格。这保持复制/查找源、合法字素光标、制表符、CJK/emoji宽度、阿拉伯语成形、双向放置和浏览器选择在同一个几何方案上，而不是维护第二个DOM布局。

通过Canvas使用浏览器解析的字体测量`cellWidth`，当源或字体指标变化时重建网格，并在自定义容器或应用缩放改变后调用`scene.resize()`。调整大小是Firefox字体替换和缺失字形范围指标的一次冷校准边界；稳定渲染重用准备好的载体，无需几何读取。

---

## Text

单行和多行文本，自动换行。底层运行核心`LayoutEngine`（与每个其他文本组件相同的分割管线）。

```typescript
import { Text } from '@vectojs/ui';

const label = new Text('你好，世界', {
  font: '400 16px Inter', // CSS简写
  color: '#e2e8f0',
  maxWidth: 300, // 在300px处换行；省略则不换行
  lineHeight: 24, // 行高，单位px
  preserveLeadingSpaces: false,
});

label.setPosition(40, 40);
scene.add(label);
```

### 冷更新 vs 热更新

`Text`有三个成本非常不同的变更方法：

```typescript
label.setText('新内容'); // 昂贵 —— 冷传递：重新分割 + 重新测量
label.append(' 更多令牌'); // 高效 —— 只有最后一个段落被重新测量
label.setMaxWidth(200); // 廉价 —— 热传递：仅重新换行，不重新测量
```

在逐令牌流式传输文本时使用此区分：

```typescript
// 错误 —— 在每个令牌上重建完整的测量文本
for await (const token of stream) {
  label.setText((accumulated += token)); // O(文档) 每个令牌 → 慢
}

// 正确 —— 只有更改的段落被重新测量
for await (const token of stream) {
  label.append(token); // 重用未更改的段落；重新准备更改的尾部
}
```

当用户调整窗口大小时，调用`setMaxWidth(newWidth)` —— 它使用缓存的测量文本进行重排，因此在每次调整大小事件时调用是安全的。

---

## RichText

多样式内联文本：粗体、斜体、彩色、不同大小和链接文本，全部在共享基线上共同流动。

```typescript
import { RichText } from '@vectojs/ui';
import type { StyledSpan } from '@vectojs/core';

const spans: StyledSpan[] = [
  { text: '构建' },
  { text: '快速', style: { bold: true, color: '#00f0ff' } },
  { text: '的UI，使用', style: { italic: true } },
  { text: 'VectoJS', style: { bold: true, href: 'https://vectojs.org/' } },
  { text: '。' },
];

const rich = new RichText(spans, {
  font: '16px Inter',
  color: '#e2e8f0',
  maxWidth: 600,
  linkColor: '#38bdf8',
  onLinkClick: (href) => window.open(href, '_blank'),
});

scene.add(rich.setPosition(40, 40));
```

### `TextStyle`字段

```typescript
interface TextStyle {
  bold?: boolean;
  italic?: boolean;
  color?: string;
  fontSize?: number; // 为此文本段覆盖基础字号
  href?: string; // 使文本段成为链接
}
```

> [!NOTE] > `bold`和`italic`只影响渲染，不影响测量宽度（粗体笔画在进距宽度之外略微延伸）。`fontSize`确实影响测量宽度和行高，因此在一行上混合大小可以正确工作 —— 每行的高度由其最高字形决定。

### 流式`appendSpans()`

与`Text.append()`类似，`appendSpans()`重用未更改的前导段落：

```typescript
const rich = new RichText([]);
scene.add(rich);

for await (const token of llmStream) {
  rich.appendSpans([{ text: token, style: { color: '#a5f3fc' } }]);
}
```

### 排除形状（文本环绕障碍物）

传递`exclusions`使文本环绕矩形障碍物 —— CSS式的浮动：

```typescript
const rich = new RichText(spans, {
  maxWidth: 500,
  exclusions: [
    { x: 0, y: 60, width: 120, height: 120 }, // 避开一个120×120的图像在(0, 60)
  ],
});

// 稍后，动态更新：
rich.setExclusions([{ x: 0, y: 60, width: 120, height: 120 }]);
```

引擎为每个行带计算自由水平区间（`computeLineSegments`）并独立填充每个区间。BiDi重排在区间放置后应用于整个逻辑行。

---

## Markdown

使用`marked`库（GFM风格）将Markdown渲染为VMT子树。

```typescript
import { Markdown } from '@vectojs/markdown';

const md = new Markdown('# 你好\n\n这是**富**文本。', {
  maxWidth: 700,
  theme: {
    headingColor: '#f8fafc',
    codeColor: '#a5f3fc',
    bodyFont: 'Inter, sans-serif',
  },
});

scene.add(md.setPosition(40, 40));
```

支持的令牌：标题（h1–h6）、段落、围栏代码块（带关键字高亮）、块引用、有序/无序列表、水平线、内联代码/粗体/斜体/链接和GFM表格（通过`Table`组件渲染）。

### 流式Markdown

对于LLM输出，使用`appendMarkdown()` —— 绝不要循环`setContent(fullText)`：

```typescript
const md = new Markdown('', { maxWidth: 700 });
scene.add(md);

for await (const token of llmStream) {
  md.appendMarkdown(token);
}
```

`appendMarkdown()`重新词法分析完整缓冲区，对令牌与上次渲染进行差异比较，重用未更改的实体前缀，并原地更新最后一个段落。它节省了视觉树重建工作，但Markdown词法分析仍然随完整文档缩放。`setContent()`额外执行完全重建，因此用于一次性替换。

---

## LayoutEngine的工作原理

理解冷/热分离有助于你为性能做出正确的选择。

### 冷传递 —— 测量一次

`prepare(text)`和`prepareRich(spans)`将文本分割成段落，应用阿拉伯语成形和BiDi，使用`Intl.Segmenter`分割成单词和字素，并测量每个字形的进距宽度。`prepareContentGrid(source, metrics)`为可选择固定网格表面执行相应的一次性编译。结果（`PreparedText`或`PreparedContentGrid`）被保留，直到其内容或度量输入发生变化。

**这是昂贵的步骤。** 仅在内容变化时运行它。

### 热传递 —— 始终定位

`layoutPrepared(prepared)`获取缓存的`PreparedText`并应用换行约束（`maxWidth`、`maxHeight`、排除形状）以生成定位的`LayoutNode[]`。这是纯算术 —— 没有分割，没有测量。

`setMaxWidth()`仅运行热传递，重用缓存的`PreparedText`。这就是响应式重排廉价的原因：你可以在调整大小拖动的每个像素上调用它而不会产生卡顿。

### 段落级记忆化

缓存键是`fontSize + paragraphText`（对于纯文本）或`fontSize + paragraphText + styleSig`（对于富文本）。当你向包含许多段落的文档追加一个令牌时：

1. 未更改的段落可以重用缓存的准备数据。
2. 只有最后一个（更改的）段落被重新测量。

这将重复的测量/布局准备限制在更改的段落上。长段落随着其增长而变得更昂贵，而更高级别的Markdown解析可能增加文档范围的工作。

### 对齐和连字符

`LayoutEngine`支持`textAlign = 'justify'`（将换行后的行拉伸到`maxWidth`，最后一行不规则）和换行时连字符（软连字符`­`开箱即用；插入一个`hyphenate: (word) => string[]`函数用于自动断词 —— 例如`hyphen` npm包的Knuth–Liang模式）。

对齐的**RTL**行在*两个*边缘都是平齐的：行的逻辑末尾空白被BiDi规则L1重置为基础方向并落在视觉左侧，因此被折叠而不是在测量中保持一行空格宽度。段落最后一行仍然不规则（仍然是右对齐）。

`TextEntity`直接暴露两者：`text.setTextAlign('justify')`、`text.setHyphenator(fn)` —— 参见[`TextEntity` & `GridTextEntity`](/reference/core-text/#textentity--gridtextentity来自-)了解详情。这些能正确渲染，因为`TextEntity`在每个字形的计算位置绘制每个字形。`@vectojs/ui`的`Text`/`RichText`组件将每行换行文本折叠为单个原生`fillText()`调用以提高性能，因此它们尚不支持逐字形对齐 —— 当你需要对齐正文时使用`TextEntity`。

---

## MSDF字体

多通道有符号距离场字体在任何缩放级别渲染清晰的文本，没有栅格化伪影。用于游戏风格UI、缩放界面或高DPR显示器。

### 生成图集

安装`msdf-atlas-gen`并运行：

```bash
msdf-atlas-gen -font myfont.ttf -type msdf -format png -imageout atlas.png -json atlas.json
```

这将生成`atlas.png`（字形纹理）和`atlas.json`（字形指标、进距宽度、UV边界）。

### 在VectoJS中加载

```typescript
import { MSDFFont, MSDFTextEntity } from '@vectojs/core/text';

// 解析JSON
const fontData = await fetch('/fonts/atlas.json').then((r) => r.json());
const font = MSDFFont.parse(fontData);

// 加载纹理图像
const img = new window.Image();
img.src = '/fonts/atlas.png';
await new Promise((r) => (img.onload = r));

// 创建文本实体
const msdfText = new MSDFTextEntity('Hello GPU text', {
  font,
  texture: img, // TexImageSource
  fontSize: 48,
  color: '#ffffff',
  letterSpacing: 0,
  fallbackFont: 'sans-serif', // 当pointBackend不是'webgl'时使用
});

scene.add(msdfText.setPosition(40, 40));
```

`MSDFTextEntity`将布局卸载到后台`LayoutWorkerManager`工作线程（去抖，通过`Float32Array`传输实现零拷贝）。文本在构造或`setText()`之后一个异步tick出现。当场景上设置`pointBackend: 'webgl'`时，通过WebGL MSDF程序绘制字形；否则实体回退到原生`fillText`。

### 直接使用`MSDFFont.layout()`

如果你正在构建自定义渲染器或需要字形四边形本身：

```typescript
const result = font.layout('Hello', 48);
// result.glyphs: PositionedGlyph[]
// 每个字形：{ char, x, y, w, h, u0, v0, u1, v1 }

for (const g of result.glyphs) {
  renderer.setMSDFTexture(texture, font.distanceRange);
  renderer.addGlyph(g.x, g.y, g.w, g.h, g.u0, g.v0, g.u1, g.v1, '#fff');
}
```

---

## 阿拉伯语和双向文本

阿拉伯语和双向文本在`prepare()`和`prepareRich()`内部**自动**处理。你不需要调用任何成形API。

### 内部发生了什么

1. **阿拉伯语成形**（`ArabicShaper.shapeArabic`）：将阿拉伯字符替换为其上下文呈现形式（首/中/尾/独立形式）并应用Lam-Alef连字。`indexMap`跟踪成形→源索引以用于光标命中测试。

2. **BiDi级别分配**（`BidiResolver.resolveLevels`）：使用UAX#9规则为每个字符分配嵌套级别（0 = LTR，1 = RTL，更高 = 更深嵌入）。遵循嵌入控制（LRE/RLE/PDF）。

3. **视觉重排**（`BidiResolver.reorderVisual`）：在每行末尾，从最高级别到1反转文本段，产生正确的视觉单词顺序。

这意味着包含阿拉伯语或希伯来语内容的`Text`或`RichText`可以正常工作：

```typescript
const arabic = new Text('مرحبا بك في VectoJS', { font: '20px sans-serif', color: '#f8fafc' });
const hebrew = new RichText([{ text: 'שלום ' }, { text: 'VectoJS', style: { bold: true } }]);
```

> [!NOTE]
> 换行符（`\n`）总是重置阿拉伯语成形上下文和BiDi状态。同一段落内的软换行行共享一次成形传递，因此多行阿拉伯语段落跨行成形正确。
>
> **所有行尾形式都被处理。** `\r\n`（CRLF）、`\n`和单独的`\r`都结束段落，永远不会被塑形或作为字形布局 —— 一个多余的`\r`否则会渲染为可见的豆腐块，增加行宽并偏移选择偏移。源偏移仍然索引**原始**字符串，因此CRLF换行在命中测试和光标映射中正确计算为两个字符。

---

## 辅助函数

`measureText`、`wrapLines`和`fontSizePx`从`@vectojs/ui`导出，用于自定义组件。

```typescript
import { measureText, wrapLines, fontSizePx } from '@vectojs/ui';

// 渲染像素宽度，LRU缓存（上限1000）—— 以原始文本为键，因此缓存命中
// 只需一次map查找，不会重新运行阿拉伯语塑形
//（未命中时阿拉伯语仍以其上下文塑形形式测量）
const w = measureText('Hello world', '600 16px Inter');

// 贪心单词换行 —— 返回string[]
const lines = wrapLines('一段较长的文本，需要换行', '16px sans-serif', 200);

// 从CSS字体简写中提取px大小
const size = fontSizePx('600 16px Inter'); // → 16
```

`measureText`在测量前通过`ArabicShaper`成形阿拉伯语文本，因此它为阿拉伯语文本段返回正确的视觉宽度。

---

## 性能指南

| 场景                         | 最佳方法                                                 |
| ---------------------------- | -------------------------------------------------------- |
| 静态文本，一次性设置         | `new Text(content, opts)` — 一次冷传递                   |
| 仅追加流式传输（LLM）        | `text.append(token)` 或 `md.appendMarkdown(token)`       |
| 响应式调整大小               | `text.setMaxWidth(newW)` — 仅热传递                      |
| 密集重复布局（例如数据网格） | 使用`LayoutResultBuffer`搭配`layoutPreparedIntoBuffer()` |
| 分辨率无关的文本             | `MSDFTextEntity` + `pointBackend: 'webgl'`               |
| 阿拉伯语 / 希伯来语 / RTL    | 任何`Text`/`RichText`/`Markdown` — 自动处理              |
| 环绕图像的文本               | `RichText` + `exclusions: ExclusionRect[]`               |

可选择文本总是投影原始逻辑Unicode源。Canvas成形和BiDi重排仅影响像素；复制、页面内查找、浏览器翻译和辅助技术保留调用者的源顺序。软换行分隔符和显式换行符附加到其前面的视觉行，以便多行选择几何保持在渲染的行带内。

## 故障排除

### 文本显得太宽或在错误的位置

`measureText`和`LayoutEngine`都使用canvas `measureText`调用，使用确切的CSS字体字符串。如果字体系列尚未加载（例如，网络字体），浏览器会替换为具有不同指标的回退字体，导致布局和渲染之间的不匹配。

确保在构造`Text`或`RichText`之前加载了网络字体：

```typescript
await document.fonts.ready;
const label = new Text('Hello', { font: '16px Inter' });
```

### 对于长文档，`append()`比预期慢

`append()`在**段落级别**进行记忆化（由`\n`分割）。如果你的整个文档是一个没有换行符的长段落，每次`append()`调用都会重新测量整个段落。

对于流式内容，在每个段落之后插入换行符以允许缓存分割它们：

```typescript
md.appendMarkdown(chunk);
// 如果LLM输出自然有段落，则记忆化自动工作。
// 如果它是一个无休止的连续句子，性能会退化到O(文档)。
```

### `MSDFTextEntity`文本在第一帧缺失

`MSDFTextEntity`通过`LayoutWorkerManager`在线程外布局文本。结果在构造或`setText()`之后一个异步tick到达。这是有意设计的 —— 实体在布局回调触发时调用`scene.markDirty()`，触发重绘。

如果使用`renderMode: 'onDemand'`，此重绘将正确发生。如果你需要文本同步出现（例如，在截图测试中），等待`scene.start()`后的下一个`rAF`。

### RichText排除未应用

排除形状仅与`layoutPrepared()`一起工作，而不是`layoutPreparedIntoBuffer()`。如果你使用可重用缓冲区路径，排除被忽略。使用`layoutPrepared()`以获得排除支持。

> **下一步：** [无障碍](/learn/accessibility/) —— 影子DOM如何使你的canvas UI可被屏幕阅读器和智能体驱动。
