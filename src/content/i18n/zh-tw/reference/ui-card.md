---
title: 'UI: Card'
description: '具有選用 role=group 語意的圓角 canvas 面板元件。'
order: 20
---

# `Card`

`Card` 是整個 `@vectojs/ui` 範例中使用的基礎視覺面板。它預設為裝飾性；傳入 `label` 會使其成為語意群組。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Card</span></div>
  <iframe src="/sandbox/ui/component.html?name=card&v=core-1.9.2-ui-1.10.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Card live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Card 擁有背景和邊框；子項目在 card 的區域空間中定位。</figcaption>
</figure>

## 最小範例

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

## 維護者檢查清單

- 只在區域應可被探索時使用 `label`。
- 不要假設 `padding` 會自動排布子項目。
- 在 card 內部優先使用 `Stack` 或 `Flow` 以取得易於維護的布局。
