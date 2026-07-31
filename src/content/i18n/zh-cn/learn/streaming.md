---
title: '流式传输与实时文本'
description: '构建聊天UI、日志查看器和实时仪表盘：逐帧块合并、追加API、空闲节流交互以及长文本策略。'
order: 18
---

# 流式传输与实时文本

令牌流（LLM聊天）、日志尾部和实时数据馈送是朴素VectoJS代码最容易崩溃的场景。引擎提供了快速的原语——`Text.append()`、`Markdown.appendMarkdown()`、段落级布局备忘录、离线程Markdown解析——但如果按令牌而非按帧进行连接，大部分优势都将丧失。本文提供端到端方案。

## 核心规则：按帧批量处理，而非按令牌

流的令牌送达速度远快于显示刷新速度。每次`append()`/`appendMarkdown()`调用都会触发一次布局计算，而两次渲染帧之间的所有布局——除了最后一次——都是**不可见的工作**。解决方案只需要四行代码：缓冲到达的令牌，每帧刷新一次。

```typescript
let pending = '';
let scheduled = false;

function pushToken(token: string) {
  pending += token;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const chunk = pending;
    pending = '';
    markdown.appendMarkdown(chunk); // 整帧令牌只做一次布局
    transcript.scrollToBottom();
  });
}

for await (const token of llmStream) pushToken(token);
```

在200令牌/秒的流以60fps运行时，这会将每秒约200次布局计算减少到约60次——并且在负载下能优雅地降级：主线程越繁忙，刷新块就越大（也越**稀少**）。这种模式是自调节的；固定的`setInterval`防抖则不然。

> [!NOTE]
> `scene.markDirty()`本身已经自然合并——同一帧内的三次追加只会设置一个标记并产生一次重绘。追加的开销在于**布局**，而非脏标记，这就是为什么批处理必须包裹追加本身。

## 选择合适的追加API

| 内容             | API                                | 每次调用的成本                                                                             |
| ---------------- | ---------------------------------- | ------------------------------------------------------------------------------------------ |
| 纯文本           | `text.append(chunk)`               | 冷遍历，但段落备忘录会重用每个已完成的`\n`结尾的段落                                       |
| 样式化片段       | `richText.appendSpans(spans)`      | 追加片段；先前的片段测量值会被重用                                                         |
| Markdown         | `markdown.appendMarkdown(chunk)`   | 重新词法分析原始源代码（存在`Worker`时在离线程处理），重用已完成的块实体，原地扩展最后一段 |
| 任何内容，替换式 | `setText` / `setContent`（反模式） | 完全重建——切勿在逐令牌增长的文档上调用                                                     |

`appendMarkdown`内部隐藏着两项你应了解的开销：

1. **词法分析是O(文档长度)，而非O(块长度)。** 每次调用都会重新标记整个累积的源代码。解析在可用的后台Worker中运行（在没有`Worker`的环境中回退到同步词法分析），实体更新会重用所有已完成的块——但一个10万字符的文档每次刷新仍然需要付出10万字符的词法分析开销。逐帧批处理通过令牌/帧因子来分摊此开销；文档分段（下文）则加以限制。

2. **段落备忘录以`\n`为键。** `Text.append`和Markdown段落更新器都只重新测量发生变化的段落。一个无休止的连续行会破坏备忘录机制，使每次刷新退化为O(文档长度)的测量。LLM输出自带自然段落分隔；日志行以`\n`结尾——通常情况下你无需额外处理，但不要移除换行符。

## 打字机节调与生命周期

性能批处理是默认行为。仅当产品需要打字机揭示效果时，才添加固定的挂钟时间节调：

```typescript
const stream = markdown.createStream({
  pacing: { graphemesPerSecond: 48 },
  maxBufferedChars: 64 * 1024,
  signal: requestAbort.signal,
});
```

节调（pacing）绝不会切换到“每帧一个 token”。它根据 rAF 时间戳累积 `graphemesPerSecond`（每秒字形数）额度，可能会在一帧中揭示多个字形，但仍然最多执行一次追加提交。100ms 的时间戳上限可防止后台标签页突然倾泻大量追赶内容。

切片使用 `Intl.Segmenter`，甚至跨越块/帧边界，因此组合标记、表情符号 ZWJ 序列、标志和代理对都能保持在一起。Unicode 允许单个字形无限制地增长；如果恶意输入填满了整个有界（已接受加已阻塞）窗口而未到达边界，控制器会提交一个 Unicode 代码点（绝不是代理对的一半），而不是陷入死锁或无限制地增加内存。

- `flush()` 同步提交已提交的文本并保持流打开。
- `close()` 允许被阻塞的写入，释放保持的字形尾部，执行最后一次有序的提交，并关闭流。
- `abort(reason)` 丢弃未提交的文本。未完成及未来的操作会因保留的拒绝原因（reason）而拒绝。
- `Markdown.setContent()` 在替换前会中止活动的控制器。
- `Markdown.destroy()` 会中止控制器并移除 rAF/`AbortSignal` 监听器。
- 一个 `Markdown` 最多拥有一个打开的控制器；终止的控制器会注销，以便可以启动后续的流。

## 渲染模式与空闲节流

流式UI应使用`renderMode: 'onDemand'`：

```typescript
const scene = new Scene(canvas, { renderMode: 'onDemand' });
```

每次追加都会将场景标记为脏，因此帧仅在内容流动时渲染，并在流空闲时立即停止——不会出现2fps自动节流的意外，也不会在响应间隔期间消耗电池。追加API和内建滚动容器都会报告其进行中的动画（`hasPendingAnimations()`），因此在最后一个令牌落地后，平滑滚动到底部仍会继续动画。

如果在流期间从`update()`驱动任何自定义的**每帧**运动（如打字指示器、闪烁光标），请记住[空闲节流契约](/learn/performance/#空闲自动节流隐藏陷阱)：重写`hasPendingAnimations()`或使用`animate()`/`springTo()`来驱动。

## 跟随底部

`ScrollView.scrollToBottom()`**快照**到内容末尾——特意绕过滚动弹簧，因为每秒多次重新定位弹簧会让其永远无法稳定，导致视口抖动而非跟踪最新内容。在与追加相同的rAF刷新中调用它（如上文的方案），这样目标会在**新布局之后**计算。

对于聊天UI，遵循用户意图：仅在用户原本就在底部时才保持吸附到底部。`content`是公开的，其`y`保存负向滚动偏移量，因此"在底部"的判断方式为：

```typescript
function nearBottom(sv: ScrollView, slack = 24): boolean {
  const maxScroll = Math.max(0, sv.content.height - sv.height);
  return -sv.content.y >= maxScroll - slack;
}

// 在刷新中：在追加前读取吸附状态，在追加后应用。
const stick = nearBottom(transcript);
markdown.appendMarkdown(chunk);
if (stick) transcript.scrollToBottom();
```

在一次刷新内执行"读取-追加-滚动"的排序是关键所在：在追加后测量"是否在底部"总是会因内容增长而回答"否"。

> [!NOTE]
> 两个滚动API设计上不对称：`scrollTo(y)`重新定位滚动**弹簧**（因此`content.y`会在接下来的若干帧中动画到达），而`scrollToBottom()`是**快照**。在`scrollTo`之后立即读取基于位置的派生状态会得到旧位置——在下次刷新时读取（正如上面的吸附模式自然做到的）。

## 长文本：分段，然后虚拟化

追加成本和词法分析成本都随文档大小增长，因此需限制文档大小。聊天/日志UI的两层策略：

1. **按消息分段。** 每个助手消息使用一个`Markdown`实体，而不是整个对话共用一个。流式实体始终保持小型（仅当前正在传输的消息），因此无论对话长度如何，每次刷新的词法分析成本都保持低廉。已完成的消息完全不需要重新词法分析。
2. **虚拟化历史。** 一旦消息成为独立实体，[`VirtualList`](/reference/ui-virtuallist/)只渲染可见部分。一条包含数千条消息的文本记录，其成本仅取决于视口显示的内容，而非会话累积的总量。

```typescript
function startAssistantMessage(): Markdown {
  const md = new Markdown('', { maxWidth: 640 });
  messages.push(md); // 你的VirtualList数据源
  return md; // 仅向此实体流式写入
}
```

这同时也限制了内存：已完成的静态布局可被剔除，而向后滚动到较远位置不会触发实时尾部的重新布局。

## 衡量流式UI

症状及其信号，按排查顺序列出：

| 症状                     | 诊断手段                                                                   |
| ------------------------ | -------------------------------------------------------------------------- |
| 流式传输时卡顿           | 统计每秒追加次数与每秒帧数——如果追加数 ≫ 帧数，说明缺少rAF批处理           |
| 卡顿随文本长度增加而加剧 | 你在向一个不断增长的实体流式写入——应按消息分段                             |
| 整个UI在长段落时阻塞     | 流中没有`\n`——段落备忘录无法拆分；检查源文本的格式                         |
| 滚动与用户操作冲突       | 无条件调用`scrollToBottom()`——应通过"是否在底部"吸附判断来限制             |
| 流空闲时CPU仍繁忙        | 场景处于`'always'`模式，或者存在未使用`hasPendingAnimations()`的自定义动画 |

如需真实数据，请使用[衡量实际性能](/learn/performance/#测量真实性能)中介绍的面内测量模式——无头模式的FPS不具代表性。

> **下一篇：** [性能](/learn/performance/)提供完整的优化工具箱，[`Markdown`](/reference/ui-markdown/)是流式API参考。
