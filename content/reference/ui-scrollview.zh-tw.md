+++
title = "UI: ScrollView"
description = "具有滾輪和指標拖曳滾動的裁剪滾動容器。"
weight = 32
+++

# `ScrollView`

`ScrollView` 擁有一個可滾動的裁剪區域。當有界內容可能超出可見區域時使用它。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ScrollView</span></div>
  <iframe src="/sandbox/ui/component.html?name=scrollview&v=core-1.39.0-ui-2.20.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="ScrollView live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>在視口內滾輪或拖曳；避免巢狀的競爭滾動擁有者。</figcaption>
</figure>

## 最小範例

```ts
import { ScrollView, Text } from '@vectojs/ui';

const view = new ScrollView({ width: 360, height: 220 });
view.add(new Text('Long content').setPosition(16, 16));
scene.add(view);
```

## 維護者檢查清單

- 每個可見區域保持一個滾輪擁有者。
- 在直接變更子項目擺放後呼叫 `updateContentSize()`。
- 對於固定在底部的串流內容，使用 `scrollToBottom()`。
