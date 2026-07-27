---
title: 'UI：Card'
description: '带可选 role=group 语义的圆角 canvas 面板组件。'
order: 20
---

# `Card`

`Card` 是贯穿整个 `@vectojs/ui` 示例的基础视觉面板。它默认是装饰性的；传递 `label` 会使它成为一个语义组。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Card</span></div>
  <iframe src="/sandbox/ui/component.html?name=card&v=core-1.18.0-ui-2.3.2" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Card live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Card 拥有背景和边框；子元素定位在 card 的局部空间中。</figcaption>
</figure>

## 最小示例

```ts
import { Card, Text } from '@vectojs/ui';

const card = new Card({
  width: 320,
  height: 180,
  radius: 18,
  border: 'rgba(148,163,184,0.2)',
  label: 'Settings panel',
});

card.add(new Text('Settings').setPosition(24, 24));
scene.add(card);
```

## 整卡点击目标

传递 `onClick` 使整个卡片可点击 —— 不再需要在一个透明 `Button` 上堆叠 `Card` 来使其可点击，这曾经会在 a11y 投影中污染一个空标签按钮，并在场景审计中产生 `overlap` 噪声。`onClick` 要求 `label`：一个没有可访问名称的交互区域会在上一级重新创建同样的问题，因此 `Card` 会抛出而不是静默接受。

```ts
const card = new Card({
  width: 320,
  height: 96,
  label: 'Open settings',
  onClick: () => openSettingsPanel(),
});
```

## 为托管内容设置尺寸（`setContent`）

`Card.setContent(content, fit?)` 在卡片内放置一个内容实体，并且默认将其 `width`/`height` 与卡片自身的盒子同步 —— 与 `Panel.setContent` 使用的 `fitContent` 约定相同（参见 [`ResizablePanel`](/reference/ui-resizable-panel/)）。`fit` 默认 `true`（跟踪两个轴）；传递 `false`，或 `{ width, height }` 按轴控制，以回退到旧的仅定位行为。

```ts
const card = new Card({ width: 320, height: 180 });
card.setContent(new SomeContentEntity()); // 尺寸为 320×180，在 card.width/height 变化时重新同步
```

这与普通的 `add()` 不同：使用 `add()` 放置手动定位的装饰（图标、标签），它们应保持作者给定的尺寸，无论卡片如何调整大小；使用 `setContent()` 放置应始终填充卡片的那个实体。

对于自定尺寸的内容传递 `fit: false` —— 一个实体的 `width`/`height` 由其内容派生（例如没有 `maxWidth` 的裸 `Text`），而非作者设置。默认 `fit: true` 会每帧覆盖该实体的自计算盒子；如果你希望它居中/填充在卡片内，先将其包装在 `Stack`/`Flow` 中，或者使用 `fit: false` 自行调整其尺寸。参见[可调整大小面板](/reference/ui-resizable-panel/)获取完整说明——同样的 `fitContent` 约定，同样的注意事项。

## 维护者检查清单

- 仅当区域应可被发现时才使用 `label`。
- 不要假设 `padding` 会自动布局子元素。
- 在 card 内部优先使用 `Stack` 或 `Flow` 以获得可维护的布局。
- 对于整卡点击目标，优先使用 `onClick` 而不是堆叠覆盖层 `Button`。
- 对于应填充卡片的单个实体，优先使用 `setContent()` 而不是 `add()` 加手动尺寸同步。
