---
title: 'UI: Popover'
description: '點擊觸發的覆蓋層面板，可包含任意 VectoJS 子項目。'
order: 38
---

# `Popover`

`Popover` 在目標被點擊時切換顯示，並可包含任何 VectoJS 子 Entity。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Popover</span></div>
  <iframe src="/sandbox/ui/component.html?name=popover&v=core-1.32.6-ui-2.15.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Popover live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>點擊目標兩次以開啟和關閉 popover。</figcaption>
</figure>

## 最小範例

```ts
import { Button, Popover, Text } from '@vectojs/ui';

const target = new Button('Open');
const popover = new Popover({ target, width: 220, height: 92, placement: 'right' });
popover.add(new Text('Popover content').setPosition(14, 20));
```

## 維護者檢查清單

- 讓面板在底層控制項之上保持可讀。
- 透過 `Overlay` 邊界約束擺放位置。
- 當目標離開樹時，隱藏或釋放 popover。
