+++
title = "UI: VirtualList"
description = "僅掛載可見列加上溢掃描的虛擬化滾動列表。"
weight = 33

[extra]
order = 33
+++

# `VirtualList`

`VirtualList` 僅渲染長項目陣列的可見視窗。當一般子項目掛載會浪費工作時，用它來處理大型列表。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · VirtualList</span></div>
  <iframe src="/sandbox/ui/component.html?name=virtuallist&v=core-1.34.0-ui-2.15.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="VirtualList live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>此示範有 120 個項目，但只有可見列加上溢掃描會被掛載。</figcaption>
</figure>

## 最小範例

```ts
import { Text, VirtualList } from '@vectojs/ui';

const list = new VirtualList({
  items,
  width: 360,
  height: 400,
  estimatedRowHeight: 32,
  renderItem: (item) => new Text(item.label),
});
```

## 維護者檢查清單

- 提供符合實際的 `estimatedRowHeight`。
- 讓列 entity 保持輕量且自足。
- 替換整個資料集時使用 `setItems()`。
