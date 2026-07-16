---
title: '快速入門'
description: '安裝 VectoJS，建立一個 Scene，並使用 Input、Toggle、Slider、Button 和 ScrollView 構建一個完整的設定面板。'
order: 7
---

# 快速入門

本指南將引導你安裝 VectoJS 並建立一個完整的互動式設定面板——這是一個實際的範例，涵蓋表單、布局、滾動和無障礙功能。

## 安裝

```bash
bun add @vectojs/core @vectojs/ui
```

VectoJS 分為核心數學引擎和高階元件庫。大多數應用程式會同時使用兩者。

## HTML 設定

VectoJS 需要一個帶有已定位父元素的 `<canvas>`：

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My VectoJS App</title>
    <style>
      body {
        margin: 0;
        overflow: hidden;
        background: #0a0a0f;
      }
      #app {
        position: relative;
        width: 100vw;
        height: 100vh;
      }
      #canvas {
        display: block;
        width: 100%;
        height: 100%;
      }
    </style>
  </head>
  <body>
    <div id="app">
      <canvas id="canvas"></canvas>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

父元素 `<div id="app">` 必須設定為 `position: relative`——VectoJS 會將其無障礙陰影層作為畫布的絕對定位兄弟元素插入。`Scene` 會自動強制執行此設定，但明確設定可以防止視覺跳動。

## 建立 Scene

```typescript
// src/main.ts
import { Scene } from '@vectojs/core';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, {
  maxFPS: 60,
  pointBackend: 'canvas', // 'webgl' 用於大量點雲
});

scene.start();
```

> [!NOTE]
> 建構函式是 `new Scene(canvas: HTMLCanvasElement, options?)`。它接受一個 DOM 元素，而不是 `{ canvasId }` 字串。

## 即時試玩

<figure class="sandbox">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · @vectojs/core</span></div>
  <iframe src="/sandbox/getting-started.html" class="sandbox-frame" loading="lazy" title="快速入門互動範例" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>計數器 + Toggle + Slider——全部在畫布上執行，無 DOM 元件。點擊並互動。</figcaption>
</figure>

## 你的第一個元件

加入一個 `Toggle` 來確認一切已連接：

```typescript
import { Toggle } from '@vectojs/ui';

const toggle = new Toggle({
  label: '深色模式',
  checked: true,
  onChange: (checked) => console.log('深色模式:', checked),
});

toggle.setPosition(40, 40);
scene.add(toggle);
```

開啟瀏覽器並檢查 DOM——你會發現畫布上方有一個真實的 `<div role="switch" aria-checked="true" aria-label="深色模式">`。Playwright 測試中呼叫 `page.getByRole('switch', { name: '深色模式' }).click()` 將會生效。

---

## 建立一個設定面板

讓我們建立一個更完整的範例：一個可滾動的設定面板，包含文字輸入、切換開關、滑桿和提交按鈕。所有狀態都保存在一個普通物件中；元件從中讀取並寫入。

```typescript
import { Scene } from '@vectojs/core';
import { Stack, Card, Text, Input, Toggle, Slider, Button, ScrollView } from '@vectojs/ui';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });

// ── 狀態 ────────────────────────────────────────────────────────────────────
const state = {
  username: '',
  notifications: true,
  highPerformance: false,
  particleCount: 5000,
};

// ── 輔助函式：區段標題 ───────────────────────────────────────────────────
function heading(text: string): Text {
  return new Text(text, { font: '600 13px Inter', color: '#64748b' });
}

// ── 使用者名稱欄位 ────────────────────────────────────────────────────────────
const usernameLabel = heading('使用者名稱');

const usernameInput = new Input({
  width: 320,
  height: 40,
  placeholder: 'your-username',
  value: state.username,
  font: '16px Inter',
  onChange: (value) => {
    state.username = value;
  },
});

// ── 切換：通知 ─────────────────────────────────────────────────────
const notifLabel = heading('通知');

const notifToggle = new Toggle({
  label: '電子郵件通知',
  checked: state.notifications,
  accent: '#6366f1',
  onChange: (checked) => {
    state.notifications = checked;
  },
});

// ── 切換：高效能模式 ──────────────────────────────────────────────────
const perfToggle = new Toggle({
  label: '高效能模式',
  checked: state.highPerformance,
  accent: '#6366f1',
  onChange: (checked) => {
    state.highPerformance = checked;
  },
});

// ── 滑桿：粒子數量 ────────────────────────────────────────────────────
const particleLabel = heading('最大粒子數');

const particleCountDisplay = new Text(`${state.particleCount.toLocaleString()}`, {
  font: '600 14px Inter',
  color: '#00f0ff',
});

const particleSlider = new Slider({
  min: 1000,
  max: 50000,
  value: state.particleCount,
  width: 280,
  progressColor: '#6366f1',
});

particleSlider.on('change', (e) => {
  state.particleCount = e.value;
  particleCountDisplay.setText(e.value.toLocaleString());
});

// 將標籤和顯示值並排排列
const particleRow = new Stack({ direction: 'horizontal', gap: 12, align: 'center' });
particleRow.add(particleLabel);
particleRow.add(particleCountDisplay);

// ── 儲存按鈕 ───────────────────────────────────────────────────────────────
const saveBtn = new Button('儲存設定', {
  bg: '#6366f1',
  hoverBg: '#818cf8',
  padding: 14,
  onClick: () => {
    console.log('已儲存:', state);
    saveBtn.animate({ scaleX: 0.95, scaleY: 0.95 }, 80).animate({ scaleX: 1, scaleY: 1 }, 80);
  },
});

// ── 主要布局堆疊 ─────────────────────────────────────────────────────────
const content = new Stack({ direction: 'vertical', gap: 20 });
content.add(usernameLabel);
content.add(usernameInput);
content.add(notifLabel);
content.add(notifToggle);
content.add(perfToggle);
content.add(particleRow);
content.add(particleSlider);
content.add(saveBtn);

// ── 可滾動卡片 ───────────────────────────────────────────────────────────
const PANEL_W = 400;
const PANEL_H = 480;
const PADDING = 24;

const scroll = new ScrollView({ width: PANEL_W - PADDING * 2, height: PANEL_H - PADDING * 2 });
content.setPosition(0, 0);
scroll.add(content);

const card = new Card({
  width: PANEL_W,
  height: PANEL_H,
  radius: 16,
  border: 'rgba(255,255,255,0.08)',
  label: '設定面板', // 使卡片成為 role="group" 地標
});

const titleText = new Text('設定', { font: '700 22px Inter', color: '#f8fafc' });
titleText.setPosition(PADDING, PADDING);
card.add(titleText);

scroll.setPosition(PADDING, PADDING + 40);
card.add(scroll);

// 將卡片置中於螢幕上
const cx = (window.innerWidth - PANEL_W) / 2;
const cy = (window.innerHeight - PANEL_H) / 2;
card.setPosition(cx, cy);
scene.add(card);

scene.start();

// ── 響應式縮放 ─────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  scene.resize(window.innerWidth, window.innerHeight);
  card.setPosition((window.innerWidth - PANEL_W) / 2, (window.innerHeight - PANEL_H) / 2);
});
```

### 你獲得了什麼

- **`Stack`** 以 20 像素間距垂直排列子元素——無需手動 `x`/`y` 計算。
- **`ScrollView`** 在內容超出面板高度時進行裁剪和滾動。
- **`Card`** 繪製圓角矩形背景；設定 `label` 後，它會投射一個 `role="group"` 地標，讓螢幕閱讀器能識別該區域。
- **`Input`** 由真實的 `<input>` 陰影元素支援——IME、剪貼簿、復原和自動填寫皆可運作。
- **`Button`** 根據標籤自動調整大小，並從畫布點擊和陰影 `<button>` 觸發 `onClick`。
- 所有元件直接連接到你的 `state` 物件。

---

## 框架整合

VectoJS 掛載在 `<canvas>` 上，因此它能以與 WebGL 函式庫相同的方式與任何框架整合。

### React

```typescript
import { useEffect, useRef } from 'react';
import { Scene } from '@vectojs/core';
import { Button } from '@vectojs/ui';

export function VectoCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const scene = new Scene(ref.current!, { maxFPS: 60 });
    const btn = new Button('點擊我');
    btn.setPosition(40, 40);
    scene.add(btn);
    scene.start();

    return () => scene.destroy();
  }, []);

  return <canvas ref={ref} style={{ width: '100%', height: '100%' }} />;
}
```

### Vue 3

```typescript
<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { Scene } from '@vectojs/core';

const canvasRef = ref(null);
let scene;

onMounted(() => {
  scene = new Scene(canvasRef.value, { maxFPS: 60 });
  scene.start();
});

onUnmounted(() => scene?.destroy());
</script>

<template>
  <canvas ref="canvasRef" style="width:100%;height:100%" />
</template>
```

---

## 挑戰

### 新增計數器

擴展設定面板，使其追蹤「儲存」按鈕被點擊的次數，並在按鈕旁邊顯示累計總數。

- 在 state 物件中新增一個初始化為 `0` 的 `clickCount` 變數。
- 建立一個顯示 `'已儲存 0 次'` 的 `Text` 實體，並使用水平 `Stack` 將其放置在 `saveBtn` 旁邊。
- 每次點擊時使用 `entity.setText(...)` 更新文字，並確認每次按壓後計數正確增加。

### 響應式布局

讓面板在視窗寬度小於 480 像素時優雅地重新排列。卡片絕不應溢出視窗邊緣。

- 在 `resize` 事件處理常式中，將 `window.innerWidth` 與 `PANEL_W` 進行比較，並計算一個夾緊的面板寬度，每邊至少減去 16 像素的最小邊距。
- 每次調整大小時，更新 `card.width`、`ScrollView` 寬度和 `usernameInput` 寬度以匹配新的面板寬度。
- 將瀏覽器視窗調整為 320 像素寬進行測試，確認所有內容保持可見且無任何內容剪裁到卡片邊界之外。

### 主題切換

在面板標題中新增一個深色/淺色主題切換開關，可即時更新所有元件的視覺風格。

- 定義兩個主題物件——一個深色（當前顏色）和一個淺色——每個指定卡片邊框顏色、標題文字顏色、標籤文字顏色和按鈕背景的值。
- 在 `ScrollView` 上方新增一個標籤為 `'淺色模式'` 的 `Toggle`，並將其 `change` 事件連接起來，將活動主題的顏色值應用於每個相關的實體。
- 確保 `card` 的 `border` 屬性和 `titleText` 顏色在主題變更時都能更新，並在每次屬性更新後呼叫 `scene.markDirty()`，以便畫布重新繪製。

## 下一步

- [核心場景](/learn/core-scene/) — 深入探討渲染迴圈、變換系統和空閒節流。
- [自訂實體](/learn/custom-entity/) — 建立你自己的畫布元件。
- [事件與命中測試](/learn/events/) — 指標和鍵盤事件如何在樹中流動。
- [核心 API 參考](/reference/core-api/) — 完整的 `Scene`、`Entity` 和 `IRenderer` 簽名。
