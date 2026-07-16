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
  <iframe src="/sandbox/ui/component.html?name=resizablepanel&v=core-1.9.0-ui-1.9.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Resizable panel live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>拖拽面板之间的分隔条以查看手柄悬停和调整大小的行为。</figcaption>
</figure>

## 最小示例

```ts
import { Panel, PanelGroup, Text } from '@vectojs/ui';

const group = new PanelGroup({ direction: 'horizontal', width: 640, height: 360 });
group
  .addPanel(new Panel({ minSize: 160 }).setContent(new Text('Sidebar')))
  .addPanel(new Panel({ minSize: 260 }).setContent(new Text('Canvas')));
```

## 维护者检查清单

- 拖拽时保留每个面板的 `minSize`。
- 当宿主容器尺寸变化时调用 `resize(width, height)`。
- 将嵌套的 `PanelGroup` 实例保持在 `Panel` 内容边界之内。
