---
title: 'UI: Tabs'
description: '掛載作用中內容檢視的分頁面板容器。'
order: 29
---

# `Tabs`

`Tabs` 繪製一個分頁列，並只掛載作用中分頁的內容 entity。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Tabs</span></div>
  <iframe src="/sandbox/ui/component.html?name=tabs&v=core-1.9.0-ui-1.9.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Tabs live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>切換分頁會從 entity 樹中移除非作用中的內容。</figcaption>
</figure>

## 最小範例

```ts
import { Tabs, Text } from '@vectojs/ui';

const tabs = new Tabs({
  width: 480,
  height: 260,
  tabs: [
    { id: 'usage', label: 'Usage', content: new Text('Usage panel') },
    { id: 'api', label: 'API', content: new Text('API panel') },
  ],
});
```

## 維護者檢查清單

- 讓分頁內容尺寸與容器尺寸保持同步。
- 只在作用中分頁確實變更時發出 `change`。
- 在未來的分頁層級語意中保留鍵盤/焦點行為。
