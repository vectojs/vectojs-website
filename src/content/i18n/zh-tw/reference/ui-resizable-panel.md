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
  <iframe src="/sandbox/ui/component.html?name=resizablepanel&v=core-1.32.3-ui-2.13.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Resizable panel live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>拖曳面板之間的分隔線以檢視控制柄懸停和調整大小的行為。</figcaption>
</figure>

## 最小範例

```ts
import { Panel, PanelGroup, Stack, Text } from '@vectojs/ui';

const group = new PanelGroup({ direction: 'horizontal', width: 640, height: 360 });
group
  // 側邊欄內容是一個 Stack，設計為填滿其檢視區
  // 預設 `fit: true` 使其在每次調整大小/拖曳時保持與面板方塊匹配，
  // 解決了曾經需要手寫 `content.width = panel.width` 同步的問題（請見下方「為託管內容設定尺寸」）。
  .addPanel(
    new Panel({ minSize: 160 }).setContent(
      new Stack({ direction: 'vertical' }).add(new Text('Sidebar')),
    ),
  )
  .addPanel(
    new Panel({ minSize: 260 }).setContent(
      new Stack({ direction: 'vertical' }).add(new Text('Canvas')),
    ),
  );
```

## 為託管內容設定尺寸（`setContent`）

`Panel.setContent(content, fit?)` 預設（`fit: true`，兩個軸）將託管內容的 `width`/`height` 與面板自身的方塊同步 — 包括在每次後續的 `PanelGroup` 分隔條拖曳或 `resize()` 呼叫時，而不僅僅在 `setContent()` 時。這解決了實際存在的差距：以前 `setContent` 只定位內容（`content.x = 0; content.y = 0`），因此應用程式必須自己在每次調整大小時手寫 `content.width = panel.width` 同步，而深層元件鏈中任何一個地方遺漏該同步就會在生產中出現真正的裁剪溢出錯誤。

```ts
panel.setContent(myLayout); // 追蹤寬度和高度（預設）
panel.setContent(myLayout, false); // 舊的僅定位行為
panel.setContent(myLayout, { width: true, height: false }); // 僅寬度
```

**對於自定尺寸的內容傳遞 `fit: false`** — 一個實體的 `width`/`height` 由其內容而非作者設定衍生（例如沒有 `maxWidth` 的裸 `Text`，它在每次 `setText()`/`setMaxWidth()` 呼叫時從 `result.totalWidth`/行數重新計算自己的方塊）。讓預設的 `fit: true` 每幀強制將其實體方塊設定為面板方塊會覆蓋其自計算尺寸—對 `Text` 自身的 `render()` 無害（它從其快取的 `lines` 繪製，而非直接來自 `width`/`height`），但確實會破壞任何其他讀取該實體 `width`/`height` 進行佈局的內容：命中測試、其 a11y 影子元素的大小以及場景稽核。將自定尺寸的內容包裝在 `Stack`/`Flow` 中（它們本身可以很好地使用 `fit`，因為定位子節點—而非自定尺寸—是它們的全部工作）如果你希望它居中/填滿在面板內，或者傳遞 `fit: false` 並自行調整其尺寸。

## 維護者檢查清單

- 拖曳時保留每個面板的 `minSize`。
- 當宿主容器尺寸變更時呼叫 `resize(width, height)`。
- 讓巢狀的 `PanelGroup` 實例保持在 `Panel` 內容邊界內。
- 對於自定尺寸的內容（沒有 `maxWidth` 的裸 `Text`，或任何自身佈局計算其方塊的實體），向 `setContent()` 傳遞 `fit: false` — 預設的 `fit: true` 適合佈局容器（`Stack`、`Flow`、另一個 `PanelGroup`），但會每幀覆寫自定尺寸實體的方塊。
