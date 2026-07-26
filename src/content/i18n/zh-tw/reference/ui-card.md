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
  <iframe src="/sandbox/ui/component.html?name=card&v=core-1.16.0-ui-2.1.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Card live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## 整卡點擊目標

傳遞 `onClick` 讓整個卡片可按壓 — 不需要再在 `Card` 上疊加一個透明 `Button` 使其可點擊，這曾會污染 a11y 投影中的空標籤按鈕，並在場景稽核中產生 `overlap` 雜訊。`onClick` 需要 `label`：一個沒有可存取名稱的互動區域會在上層重現相同的問題，因此 `Card` 會擲出而非靜默接受。

```ts
const card = new Card({
  width: 320,
  height: 96,
  label: 'Open settings',
  onClick: () => openSettingsPanel(),
});
```

## 為託管內容設定尺寸（`setContent`）

`Card.setContent(content, fit?)` 在卡片內放置一個內容實體，並預設將其 `width`/`height` 與卡片自身的方塊同步 — 與 `Panel.setContent` 使用的 `fitContent` 合約相同（請參閱 [`ResizablePanel`](/reference/ui-resizable-panel/)）。`fit` 預設為 `true`（追蹤兩個軸）；傳遞 `false`，或 `{ width, height }` 按軸控制，以回退為舊的僅定位行為。

```ts
const card = new Card({ width: 320, height: 180 });
card.setContent(new SomeContentEntity()); // 尺寸為 320×180，在 card.width/height 變更時重新同步
```

這與一般的 `add()` 不同：使用 `add()` 新增手動定位的裝飾（圖示、標籤），它們應保持作者給予的尺寸，無論卡片如何調整大小；使用 `setContent()` 放置應始終填滿卡片的單一實體。

對於自定尺寸的內容傳遞 `fit: false` — 一個實體的 `width`/`height` 由其內容衍生（例如沒有 `maxWidth` 的裸 `Text`），而非作者設定。預設的 `fit: true` 會每幀覆寫該實體的自計算方塊；如果你希望它居中/填滿在卡片內，先將其包裝在 `Stack`/`Flow` 中，或使用 `fit: false` 自行調整其尺寸。請參閱[可調整大小面板](/reference/ui-resizable-panel/)以取得完整說明—同樣的 `fitContent` 合約，同樣的注意事項。

## 維護者檢查清單

- 只在區域應可被探索時使用 `label`。
- 不要假設 `padding` 會自動排布子項目。
- 在 card 內部優先使用 `Stack` 或 `Flow` 以取得易於維護的布局。
- 對於整卡點擊目標，優先使用 `onClick` 而非疊加覆蓋層 `Button`。
- 對於應填滿卡片的單一實體，優先使用 `setContent()` 而非 `add()` 加手動尺寸同步。
