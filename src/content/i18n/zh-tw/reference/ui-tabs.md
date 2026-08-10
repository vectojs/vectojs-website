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
  <iframe src="/sandbox/ui/component.html?name=tabs&v=core-1.34.0-ui-2.15.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Tabs live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## 隱藏單一分頁的分頁列

編輯器以及終端風格的應用程式通常需要 Vim 的 `showtabline=1` 行為：僅存在一個分頁時不顯示分頁列。傳入 `autoHideTabBar: true`（需要 `@vectojs/ui` >= 1.9.5）——分頁列（及其指標點擊區域）在少於兩個分頁時消失，內容佔據全部高度，一旦加入第二個分頁，分頁列即刻恢復。在分頁列周圍佈局兄弟元素的擁有者應讀取即時的 `effectiveTabBarHeight` 獲取器，而不是假設 `tabHeight`。

```ts
const tabs = new Tabs({
  width: 480,
  height: 260,
  autoHideTabBar: true,
  tabs: [{ id: 'only', label: 'untitled', content: editorView }],
});
tabs.effectiveTabBarHeight; // 0 now, tabHeight once a second tab opens
```

`Tabs` 投射 `{ role: 'tablist', label }`。自 2.8.0 起，分頁列的可存取名稱可設定，預設為 `'Tab switching panel'`：

```ts
new Tabs({
  label: 'Inspector sections',
  width: 480,
  height: 240,
  tabs: [
    { id: 'usage', label: 'Usage', content: usagePanel },
    { id: 'api', label: 'API', content: apiPanel },
  ],
});
```

理由與 [`RadioGroup`](/reference/ui-radiogroup/) 相同：每個分頁都有自己的名稱，但分頁列的名稱才能說明分頁_在切換什麼_。只要螢幕上有不止一個分頁列，或者識別分頁組的標題繪製在 canvas 上，就應該設定它（WCAG 4.1.2）。

## 維護者檢查清單

- 讓分頁內容尺寸與容器尺寸保持同步。
- 只在作用中分頁確實變更時發出 `change`。
- 在未來的分頁層級語意中保留鍵盤/焦點行為。
