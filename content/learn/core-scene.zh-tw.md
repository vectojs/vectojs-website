+++
title = "核心場景架構"
description = "深入探討虛擬數學樹、Scene 生命週期、Entity 系統、命中測試和渲染管線。"
weight = 8

[extra]
order = 8
+++

# 核心場景架構

VectoJS 捨棄了傳統的瀏覽器 DOM。取而代之的是，它在 `@vectojs/core` 內部實作了一個**虛擬數學樹 (VMT)**。

<figure>
  <img src="/images/vmt-architecture.svg" alt="VMT 架構圖，顯示實體樹、畫布渲染和無障礙陰影層" class="diagram" />
  <figcaption>VMT 實體樹同時驅動畫布渲染和畫布上方不可見的無障礙陰影 DOM。</figcaption>
</figure>

## Scene

`Scene` 類別是根協調器。它管理三個關鍵管線：

1. **渲染迴圈** — 一個 `requestAnimationFrame` 迴圈，依序執行程式物理/動畫，然後透過 `IRenderer` 進行渲染。
2. **命中測試** — 純數學 O(N) 光線投射，用於偵測指標懸停和點擊，無需 `document.elementFromPoint`。
3. **無障礙代理** — 將焦點、布局和值雙向同步到畫布上方不可見的無障礙陰影 DOM。

### 初始化

```typescript
import { Scene } from '@vectojs/core';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, {
  pointBackend: 'webgl', // 可選：將相容的批次圓形/矩形納入 WebGL2 層
  maxFPS: 60,
});
scene.start();
```

`Scene` 在 canvas 的**父元素**中插入兩個透明的 `<div>`：一個用於無障礙陰影層 (`z-index: 10`)，一個用於 DOM 入口層 (`z-index: 9`)。如果父元素的 `position` 為 `static`，則會在每一幀強制設定為 `position: relative`。

### 渲染模式

| 模式               | 行為                                                | 使用時機             |
| ------------------ | --------------------------------------------------- | -------------------- |
| `'always'`（預設） | 每幀重新渲染，由 `maxFPS` 限制。                    | 連續動畫、粒子模擬。 |
| `'onDemand'`       | 僅在髒狀態或待處理動畫時繪製；靜態 rAF 仍會檢查樹。 | 靜態/事件驅動 UI。   |

```typescript
scene.renderMode = 'onDemand';
// 然後從事件處理常式中呼叫 scene.markDirty() 來請求重繪。
```

**空閒自動節流的陷阱。** 在 `'always'` 模式下，沒有待處理補間動畫且沒有髒標誌的場景會被節流至約 2 fps 以節省電池。如果你透過在自訂 `update()` 中變異 `entity.x` 來手動製作動畫，請**在幀之間**（從事件處理常式或獨立的 `rAF`）呼叫 `scene.markDirty()`——而不是在 `update()` 本身內部，因為渲染後的復位會在下一次檢查之前清除標誌。

## Entity 系統

VectoJS 中的每個物件都繼承自抽象的 `Entity` 類別。

<figure>
  <img src="/images/entity-hierarchy.svg" alt="Entity 類別層級結構，顯示 Entity → UIComponent → 所有元件" class="diagram" />
  <figcaption>所有 UI 元件都繼承 UIComponent，而 UIComponent 本身繼承自 Entity。自訂類型可以直接繼承 Entity。</figcaption>
</figure>

一個 `Entity` 擁有：

- **位置** (`x`, `y`)、**縮放** (`scaleX`, `scaleY`)、**旋轉**（弧度）和**不透明度**。
- 一個 **children** 陣列——VMT 是一棵樹。
- 一個**命中框** (`width`, `height`)，由 UIComponent 的 AABB 命中測試使用。
- 可選標誌：`interactive`、`clipChildren`、`a11yFullViewport`。

### 完整屬性參考

| 屬性               | 類型      | 預設值  | 備註                                                                                                                                  |
| ------------------ | --------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `x`, `y`           | `number`  | `0`     | 本地位置                                                                                                                              |
| `scaleX`, `scaleY` | `number`  | `1`     | 本地縮放                                                                                                                              |
| `rotation`         | `number`  | `0`     | 弧度                                                                                                                                  |
| `opacity`          | `number`  | `1`     | `[0,1]`；與祖先不透明度在一般、批次、WebGPU 和入口路徑上相乘。                                                                        |
| `width`, `height`  | `number`  | `0`     | 命中框大小                                                                                                                            |
| `interactive`      | `boolean` | `false` | 啟用陰影 DOM 節點 + 事件                                                                                                              |
| `clipChildren`     | `boolean` | `false` | 將一般子繪製裁剪至 `[0,0]–[width,height]`；Canvas/SVG 精確，Three 使用世界 AABB 剪刀處理旋轉/剪切裁剪。GPU 點/WebGPU 覆蓋路徑不裁剪。 |
| `a11yFullViewport` | `boolean` | `false` | 建立一個填滿視窗的陰影節點（用於無邊界表面）                                                                                          |
| `a11yOffsetX/Y`    | `number`  | `0`     | 微調陰影節點位置                                                                                                                      |

### 繼承 Entity

```typescript
import { Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

class GlowRect extends Entity {
  color = '#6366f1';

  isPointInside(gx: number, gy: number): boolean {
    const local = this.worldToLocal(gx, gy);
    return (
      !!local && local.x >= 0 && local.x <= this.width && local.y >= 0 && local.y <= this.height
    );
  }

  render(renderer: IRenderer): void {
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 8);
    renderer.fill(this.color);
  }
}

const rect = new GlowRect();
rect.width = 200;
rect.height = 80;
rect.setPosition(100, 100);
scene.add(rect);
```

> **注意：** `render()` 被呼叫時，渲染器已平移至實體的全局位置、縮放和旋轉。從 `(0, 0)` 開始繪製。

### 命中測試與事件

設定 `entity.interactive = true` 以在一般畫布場景中投射一個支援輸入的無障礙節點。當請求命中測試時，`findEntityAt(x, y)` 返回第一個 `isPointInside()` 返回 `true` 的實體（深度優先，從前到後）。遍歷期間沒有互動過濾器：程式化命中測試和適配器仍可返回非互動實體。

```typescript
rect.interactive = true;

rect.on('click', (e) => {
  rect.animate({ color: '#38bdf8' }, 300);
});

rect.on('hover', (e) => {
  document.body.style.cursor = 'pointer';
});
rect.on('pointerleave', () => {
  document.body.style.cursor = 'default';
});
```

可用事件：`click`、`hover`、`pointerdown`、`pointerup`、`pointercancel`、`pointermove`、`pointerleave`、`change`、`focus`、`blur`、`wheel`、`keydown`、`keyup`。

事件以 DOM 風格傳播：**捕獲**（根 → 目標）然後**冒泡**（目標 → 根）。傳遞 `{ capture: true }` 以在捕獲階段監聽。使用 `e.stopPropagation()` 停止遍歷，或使用 `e.stopImmediatePropagation()` 也跳過當前節點上剩餘的監聽器。

### 動畫

`entity.animate()` 對任何數值屬性排隊一個平滑的緩出補間動畫：

```typescript
// 鏈接兩個補間動畫：向右滑動，然後淡出。
rect.animate({ x: 400 }, 400).animate({ opacity: 0 }, 200);
```

緩動函式為二次緩出：`t * (2 - t)`。執行中的補間動畫即使在 `onDemand` 模式下也能保持場景活躍（透過 `hasPendingAnimations()`）。

### 自訂 update()

覆寫 `Entity.update(dt, time)` 以實作每幀邏輯。

> [!WARNING] > `dt` 的單位是**毫秒**，而非秒。一個常見的錯誤是撰寫 `this.rotation += dt * 3` 期望得到 3 rad/s——但這實際上會以 3000 rad/s 旋轉。乘以 `0.001`（或將速度除以 1000）來進行轉換。

`time` 是 `performance.now()`：

```typescript
class Spinner extends Entity {
  update(dt: number, _time: number): void {
    super.update(dt, _time); // 推進佇列中的補間動畫
    this.rotation += dt * 0.003; // dt 是毫秒，所以這是 3 rad/s
    this.scene?.markDirty();
  }
}
```

## 渲染管線

<figure>
  <iframe src="/sandbox/diagram-pipeline.html" class="diagram-frame" loading="lazy" title="VectoJS 渲染管線：一個髒幀的六個階段，由 VectoJS 即時渲染" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>每個髒幀都會走訪實體樹——更新、剔除、然後渲染——然後同步無障礙陰影 DOM。*（由 VectoJS 即時渲染。）*</figcaption>
</figure>

每幀：

1. **清除** — `renderer.clear()`
2. **更新** — 走訪樹，呼叫 `entity.update(dt, time)`（`dt` 單位為毫秒，`time` 來自 `performance.now()`）。
3. **剔除** — 跳過 `getBounds()` 在視窗外的實體。
4. **渲染** — 將渲染器平移/縮放/旋轉到每個實體的全局變換，然後呼叫 `entity.render(renderer)`。
5. **提交** — 提交任何待處理的批次繪圖（圓形、WebGL 點）。
6. **同步無障礙** — 更新陰影 DOM（由 `a11ySyncInterval` 節流）。

因為所有事情都在 JS 記憶體中完成並直接寫入 Canvas，所以完全沒有瀏覽器布局抖動。在動畫數千個實體時，DOM 節點數量保持平穩。

## 效能提示

### 批次繪圖

覆寫 `getBatchCircle()` 或 `getBatchRect()` 以將葉子實體納入 WebGL 點層（需要 `pointBackend: 'webgl'`）：

```typescript
getBatchCircle() {
  return { radius: this.radius, color: this.color };
}
```

可表示的批次葉子實體跳過完整的 `save/translate/render/restore` 路徑，進入 WebGL 緩衝區。Canvas 模式或不受支援的累積變換則使用實體的一般 `render()` 備援方案。

### 視窗剔除

覆寫 `getBounds()` 以返回一個本地 AABB。在視窗外的實體跳過其 `render()` 呼叫，而遍歷和 `update()` 繼續執行：

```typescript
getBounds() {
  return { x: 0, y: 0, width: this.width, height: this.height };
}
```

`UIComponent` 已經實作了 `getBounds()`——具有固定大小的自訂原始 Entity 子類別也應實作。

### 按需渲染

對於大部分靜態的 UI，切換為 `scene.renderMode = 'onDemand'`。靜態幀跳過更新/渲染和 GPU 工作，同時繼續輪詢 rAF 以檢查髒狀態/動畫狀態。從事件處理常式中呼叫 `scene.markDirty()`。
