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
  <iframe src="/sandbox/ui/component.html?name=card&v=core-1.9.0-ui-1.9.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Card live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## 维护者检查清单

- 仅当区域应可被发现时才使用 `label`。
- 不要假设 `padding` 会自动布局子元素。
- 在 card 内部优先使用 `Stack` 或 `Flow` 以获得可维护的布局。
