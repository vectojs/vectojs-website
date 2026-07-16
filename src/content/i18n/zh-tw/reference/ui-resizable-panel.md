---
title: 'UI: Resizable panels'
description: '用於可拖曳分割窗格布局的 PanelGroup、Panel 和 PanelResizeHandle。'
order: 35
---

# 可調整大小的面板

可調整大小的面板匯出項目協同運作：`PanelGroup` 分割空間，`Panel` 擁有一個裁剪的內容區域，而 `PanelResizeHandle` 會自動插入到面板之間。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · PanelGroup</span></div>
  <iframe src="/sandbox/ui/component.html?name=resizablepanel&v=core-1.9.0-ui-1.9.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Resizable panel live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>拖曳面板之間的分隔線以檢視控制柄懸停和調整大小的行為。</figcaption>
</figure>

## 最小範例

```ts
import { Panel, PanelGroup, Text } from '@vectojs/ui';

const group = new PanelGroup({ direction: 'horizontal', width: 640, height: 360 });
group
  .addPanel(new Panel({ minSize: 160 }).setContent(new Text('Sidebar')))
  .addPanel(new Panel({ minSize: 260 }).setContent(new Text('Canvas')));
```

## 維護者檢查清單

- 拖曳時保留每個面板的 `minSize`。
- 當宿主容器尺寸變更時呼叫 `resize(width, height)`。
- 讓巢狀的 `PanelGroup` 實例保持在 `Panel` 內容邊界內。
