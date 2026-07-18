---
title: 'UI：可调整大小的面板'
description: '用于可拖拽分割窗格布局的 PanelGroup、Panel 和 PanelResizeHandle。'
order: 35
---

# 可调整大小的面板

可调整大小的面板导出项协同工作：`PanelGroup` 分割空间，`Panel` 拥有一个裁剪的内容区域，而 `PanelResizeHandle` 会自动插入到各面板之间。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · PanelGroup</span></div>
  <iframe src="/sandbox/ui/component.html?name=resizablepanel&v=core-1.11.1-ui-1.11.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Resizable panel live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>拖拽面板之间的分隔条以查看手柄悬停和调整大小的行为。</figcaption>
</figure>

## 最小示例

```ts
import { Panel, PanelGroup, Stack, Text } from '@vectojs/ui';

const group = new PanelGroup({ direction: 'horizontal', width: 640, height: 360 });
group
  // 侧边栏内容是一个 Stack，设计为填充其视口
  // 默认 `fit: true` 使其在每次调整大小/拖拽时保持与面板盒子匹配，
  // 解决了曾经需要手写 `content.width = panel.width` 同步的问题（见下方\"为托管内容设置尺寸\"）。
  .addPanel(
    new Panel({ minSize: 160 }).setContent(
      new Stack({ direction: 'vertical' }).add(new Text('Sidebar')),
    ),
  )
  .addPanel(
    new Panel({ minSize: 260 }).setContent(
      new Stack({ direction: 'vertical' }).add(new Text('Canvas')),
    ),
  );
```

## 为托管内容设置尺寸（`setContent`）

`Panel.setContent(content, fit?)` 默认（`fit: true`，两个轴）将托管内容的 `width`/`height` 与面板自身的盒子同步 —— 包括在每次后续的 `PanelGroup` 分隔条拖拽或 `resize()` 调用时，而不仅仅在 `setContent()` 时。这解决了实际存在的差距：以前 `setContent` 只定位内容（`content.x = 0; content.y = 0`），因此应用程序必须自己在每次调整大小时手写 `content.width = panel.width` 同步，而深层组件链中任何一个地方遗漏该同步就会在生产中出现真正的裁剪溢出 bug。

```ts
panel.setContent(myLayout); // 跟踪宽度和高度（默认）
panel.setContent(myLayout, false); // 旧的仅定位行为
panel.setContent(myLayout, { width: true, height: false }); // 仅宽度
```

**对于自定尺寸的内容传递 `fit: false`** —— 一个实体的 `width`/`height` 由其内容而非作者设置派生（例如没有 `maxWidth` 的裸 `Text`，它在每次 `setText()`/`setMaxWidth()` 调用时从 `result.totalWidth`/行数重新计算自己的盒子）。让默认的 `fit: true` 每帧强制将其实体盒子设置为面板盒子会覆盖其自计算尺寸——对 `Text` 自身的 `render()` 无害（它从其缓存的 `lines` 绘制，而非直接来自 `width`/`height`），但确实会破坏任何其他读取该实体 `width`/`height` 进行布局的内容：命中测试、其 a11y 影子元素的大小以及场景审计。将自定尺寸的内容包装在 `Stack`/`Flow` 中（它们本身可以很好地使用 `fit`，因为定位子节点——而非自定尺寸——是它们的全部工作）如果你希望它居中/填充在面板内，或者传递 `fit: false` 并自行调整其尺寸。

## 维护者检查清单

- 拖拽时保留每个面板的 `minSize`。
- 当宿主容器尺寸变化时调用 `resize(width, height)`。
- 将嵌套的 `PanelGroup` 实例保持在 `Panel` 内容边界之内。
- 对于自定尺寸的内容（没有 `maxWidth` 的裸 `Text`，或任何自身布局计算其盒子的实体），向 `setContent()` 传递 `fit: false` —— 默认的 `fit: true` 适合布局容器（`Stack`、`Flow`、另一个 `PanelGroup`），但会每帧覆盖自定尺寸实体的盒子。
