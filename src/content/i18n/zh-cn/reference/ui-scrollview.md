---
title: 'UI：ScrollView'
description: '带滚轮和指针拖拽滚动的裁剪滚动容器。'
order: 32
---

# `ScrollView`

`ScrollView` 拥有一个可滚动的裁剪区域。当有边界的内容可能超出可见区域时使用它。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ScrollView</span></div>
  <iframe src="/sandbox/ui/component.html?name=scrollview&v=core-1.25.0-ui-2.6.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="ScrollView live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>在视口内滚动滚轮或拖拽；避免嵌套相互竞争的滚动所有者。</figcaption>
</figure>

## 最小示例

```ts
import { ScrollView, Text } from '@vectojs/ui';

const view = new ScrollView({ width: 360, height: 220 });
view.add(new Text('Long content').setPosition(16, 16));
scene.add(view);
```

## 维护者检查清单

- 每个可见区域保持一个滚轮所有者。
- 在直接更改子元素位置后调用 `updateContentSize()`。
- 对固定在末尾的流式内容使用 `scrollToBottom()`。
