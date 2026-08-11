+++
title = "流式传输与实时文本"
description = "构建聊天UI、日志查看器和实时仪表盘：逐帧块合并、追加API、空闲节流交互以及长文本策略。"
weight = 18

[extra]
order = 18
+++

# 流式传输与实时文本

令牌流（LLM聊天）、日志尾部和实时数据馈送是朴素VectoJS代码最容易崩溃的场景。引擎提供了快速的原语——`Text.append()`、`Markdown.appendMarkdown()`、段落级布局备忘录、离线程Markdown解析——但如果按令牌而非按帧进行连接，大部分优势都将丧失。本文提供端到端方案。

## 核心规则：按帧提交，而非按令牌

流的令牌送达速度远快于显示刷新速度。每次直接调用 `appendMarkdown()` 都会触发一次解析/布局计算，而两次渲染帧之间的所有布局——除了最后一次——都是**不可见的工作**。请使用内建的 `StreamController`，而不要编写第二个调度器：

```typescript
const stream = markdown.createStream();

try {
  for await (const token of llmStream) {
    await stream.write(token);
  }
  await stream.close(); // 强制执行最后一次提交；不要等待另一帧
} catch (error) {
  stream.abort(error); // 丢弃已接受但未提交的文本
  throw error;
}
```

默认模式将接受的块作为单独的字符串保留，然后在下一个动画帧中最多连接并提交一次。`write()` 在块进入有界缓冲区时即 resolve，而不是在它变为可见时，因此一个异步生产者仍然可以在同一帧内提供多个令牌。请 `await` 它：一旦 64 KiB 的高水位缓冲区填满，一次写入将等待容量释放，任何额外的写入都将 reject，而不是创建无界的队列。

在 200 令牌/秒的流以 60 fps 运行时，这会将每秒约 200 次布局计算减少到最多约 60 次。在负载下它能优雅地降级：主线程越繁忙，提交的块就越大（也越*稀少*）。固定的 `setInterval` 防抖则适得其反。

`appendMarkdown()` 仍然是同步的逃生舱。直接调用它会首先刷新所有先前提交的控制器文本（包括一个被背压的写入），然后追加其自身的块，因此调用顺序保持精确。

> [!NOTE]
> `scene.markDirty()` 本身已经自然合并——同一帧内的三次追加只会设置一个标记并产生一次重绘。昂贵的部分在于解析/布局，这就是为什么批处理必须包裹 `appendMarkdown()` 本身。`createStream()` 正是这样做的；它没有创建另一个解析器或协调路径。

## 选择合适的追加API

| 内容             | API                                                 | 每次提交的成本                                         |
| ---------------- | --------------------------------------------------- | ------------------------------------------------------ |
| 纯文本           | `text.append(chunk)`                                | 冷遍历，但段落备忘录会重用每个已完成的 `\n` 结尾的段落 |
| 样式化片段       | `richText.appendSpans(spans)`                       | 追加片段；先前的片段测量值会被重用                     |
| Markdown直接追加 | `markdown.appendMarkdown(chunk)`                    | 同步 API；每次调用产生一次追加提交                     |
| Markdown流式追加 | `createStream()` 后使用 `await stream.write(chunk)` | 每个动画帧最多一次追加提交；有界生产者背压             |
| 任何内容，替换式 | `setText` / `setContent`（流式反模式）              | 完全重建——切勿在逐令牌增长的文档上调用                 |

`appendMarkdown` 内部隐藏着两项你应了解的开销：

1. **词法分析是 O(文档长度)，而非 O(块长度)。** 每次调用都会重新标记整个累积的源代码。解析在可用的后台 Worker 中运行（在没有 `Worker` 的环境中回退到同步词法分析），实体更新会重用所有已完成的块——但一个 10 万字符的转录每次刷新仍然需要付出 10 万字符的词法分析开销。逐帧批处理通过令牌/帧因子来分摊此开销；文本分段（下文）则加以限制。

2. **段落备忘录以 `\n` 为键。** `Text.append` 和 Markdown 段落更新器都只重新测量发生变化的段落。一个无休止的连续行会破坏备忘录机制，使每次刷新退化为 O(文档长度) 的测量。LLM 输出自带自然段落分隔；日志行以 `\n` 结尾——通常情况下你无需额外处理，但不要移除换行符。

## 打字机节调与生命周期

性能批处理是默认行为。仅当产品需要打字机揭示效果时，才添加固定的挂钟时间节调：

```typescript
const stream = markdown.createStream({
  pacing: { graphemesPerSecond: 48 },
  maxBufferedChars: 64 * 1024,
  signal: requestAbort.signal,
});
```

节调（pacing）绝不会切换到“每帧一个令牌”。它根据 rAF 时间戳累积 `graphemesPerSecond`（每秒字形数）额度，可能会在一帧中揭示多个字形，并且仍然最多执行一次追加提交。100ms 的时间戳上限可防止后台标签页突然倾泻大量追赶内容。

切片使用 `Intl.Segmenter`，甚至跨越块/帧边界，因此组合标记、表情符号 ZWJ 序列、标志和代理对都能保持在一起。Unicode 允许单个字形无限制地增长；如果恶意输入填满了整个有界（已接受加已阻塞）窗口而未到达边界，控制器会提交一个 Unicode 代码点（绝不是代理对的一半），而不是陷入死锁或无限制地增加内存。

- `flush()` 同步提交已提交的文本并保持流打开。
- `close()` 允许被阻塞的写入，释放保持的字形尾部，执行最后一次有序的提交，并关闭流。
- `abort(reason)` 丢弃未提交的文本。未完成及未来的操作会因保留的拒绝原因（reason）而拒绝。
- `Markdown.setContent()` 在替换前会中止活动的控制器。
- `Markdown.destroy()` 会中止控制器并移除 rAF/`AbortSignal` 监听器。
- 一个 `Markdown` 最多拥有一个打开的控制器；终止的控制器会注销，以便可以启动后续的流。

## 渲染模式与空闲节流

流式UI应使用 `renderMode: 'onDemand'`：

```typescript
const scene = new Scene(canvas, { renderMode: 'onDemand' });
```

每次追加都会将场景标记为脏，因此帧仅在内容流动时渲染，并在流空闲时立即停止——不会出现 2 fps 自动节流的意外，也不会在响应间隔期间消耗电池。追加 API 和内建滚动容器都会报告其进行中的动画（`hasPendingAnimations()`），因此在最后一个令牌落地后，平滑滚动到底部仍会继续动画。

如果在流期间从 `update()` 驱动任何**自定义的**每帧运动（如打字指示器、闪烁光标），请记住[空闲节流契约](/learn/performance/#空闲自动节流隐藏陷阱)：重写 `hasPendingAnimations()` 或使用 `animate()`/`springTo()` 来驱动。

## 跟随底部

`ScrollView.scrollToBottom()` **快照**到内容末尾——特意绕过滚动弹簧，因为每秒多次重新定位弹簧会让其永远无法稳定，导致视口抖动而非跟踪最新内容。`Markdown.onLayoutUpdated` 在每次流提交之后运行，此时新高度已可用：

```typescript
let stickToBottom = true;

function nearBottom(sv: ScrollView, slack = 24): boolean {
  const maxScroll = Math.max(0, sv.content.height - sv.height);
  return -sv.content.y >= maxScroll - slack;
}

markdown.onLayoutUpdated = () => {
  if (stickToBottom) transcript.scrollToBottom();
};

for await (const token of llmStream) {
  // 在提交改变内容高度之前读取意图。
  stickToBottom = nearBottom(transcript);
  await stream.write(token);
}
await stream.close();
```

还应从应用程序的用户滚动处理中设置 `stickToBottom = false`；否则，在最后一个挂起帧期间滚动的用户可能会被过时的意图拉回底部。排序是这里的关键：在内容增长之前读取“是否在底部”，仅在 `onLayoutUpdated` 之后进行吸附。

> [!NOTE]
> `scrollTo(y)` 重新定位滚动**弹簧**，而 `scrollToBottom()` 则是**快照**。在 `scrollTo` 之后立即读取基于位置的派生状态仍会看到旧位置——请在随后的提交/帧中读取。

## 长文本：分段，然后虚拟化

追加成本和词法分析成本都随文档大小增长，因此需限制文档大小。聊天/日志 UI 的两层策略：

1. **按消息分段。** 每个助手消息使用一个 `Markdown` 实体，而不是整个对话共用一个。流式实体始终保持小型（仅当前正在传输的消息），因此无论对话长度如何，每次刷新的词法分析成本都保持低廉。已完成的消息完全不需要重新词法分析。
2. **虚拟化历史。** 一旦消息成为独立实体，[`VirtualList`](/reference/ui-virtuallist/) 只渲染可见部分。一条包含数千条消息的文本记录，其成本仅取决于视口显示的内容，而非会话累积的总量。

```typescript
function startAssistantMessage(): Markdown {
  const md = new Markdown('', { maxWidth: 640 });
  messages.push(md); // 你的 VirtualList 数据源
  return md; // 仅向此实体流式写入
}
```

这同时也限制了内存：已完成的消息的静态布局可被剔除，而向后滚动到较远位置不会触发实时尾部的重新布局。

## 衡量流式UI

症状及其信号，按排查顺序列出：

| 症状                     | 诊断手段                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| 流式传输时卡顿           | DevTools `Streaming/appends` 超过了渲染帧数——为每条实时消息使用一个 `createStream()`                        |
| 负载下 `write()` 被拒绝  | 在一个写入被背压时，第二个写入到达了——请 `await` 每次写入                                                   |
| 卡顿随文本长度增加而加剧 | 你在向一个不断增长的实体流式写入——应按消息分段                                                              |
| 整个UI在长段落时阻塞     | 流中没有 `\n`——段落备忘录无法拆分；检查源文本的格式                                                         |
| 滚动与用户操作冲突       | 无条件调用 `scrollToBottom()`——应通过“是否在底部”吸附判断来限制                                             |
| 流空闲时 CPU 仍繁忙      | 场景留在了 `'always'` 模式，或者存在未使用 `hasPendingAnimations()` 的自定义动画；控制器的 rAF 处于空闲状态 |

如需真实数据，请使用[测量真实性能](/learn/performance/#测量真实性能)中介绍的面内测量模式——无头模式的 FPS 不具代表性。

> **下一篇：** [性能](/learn/performance/) 提供完整的优化工具箱，[`Markdown`](/reference/ui-markdown/) 是流式 API 参考。
