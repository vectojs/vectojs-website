---
title: '效能'
description: '渲染模式、空閒自動節流、WebGL 批次渲染、視窗剔除、文字效能，以及如何測量真實 GPU 吞吐量。'
order: 13
---

# 效能

VectoJS 預設設計為快速，但幾個選擇加入的機制可以顯著提高吞吐量。本頁說明可用的控制項、最常見的隱藏陷阱，以及如何準確測量效能。

## 渲染模式

`Scene` 支援兩種渲染模式，可在建構後透過 `scene.renderMode` 設定：

```typescript
scene.renderMode = 'always'; // 預設 — 每幀重新渲染
scene.renderMode = 'onDemand'; // 僅在髒狀態或補間動畫時重新渲染
```

### `'always'` 模式

rAF 迴圈每幀觸發，由 `maxFPS`（預設 60）限制。用於：

- 連續動畫（粒子模擬、物理）
- 即時資料饋送
- 任何總是有東西在移動的場景

### `'onDemand'` 模式

rAF 迴圈僅在自上一幀以來已呼叫 `scene.markDirty()`，或有動畫/過渡驅動器正在進行時才渲染。空閒滴答跳過實體更新/渲染和 GPU 提交，但 Scene 仍會排程 rAF 並走訪樹以檢查待處理的動畫狀態。用於：

- 靜態或事件驅動的 UI（儀表板、表單、選單）
- 回應使用者動作而產生動畫，但其他時候保持靜止的場景

```typescript
scene.renderMode = 'onDemand';

button.on('click', () => {
  button.animate({ scaleX: 1.1, scaleY: 1.1 }, 100).animate({ scaleX: 1, scaleY: 1 }, 100);
  // animate() 在補間動畫運行期間自動標記為髒
});

input.on('change', () => {
  scene.markDirty(); // 重繪以顯示新的游標/選取狀態
});
```

## 空閒自動節流（隱藏陷阱）

這是 VectoJS 中最常見的效能陷阱。

在 `'always'` 模式下，場景在以下條件被視為**靜態**：

- `dirty` 標誌為 `false`，且
- 沒有實體有待處理的 `animate()` 補間動畫。

靜態場景被節流至約 **2 fps** 以節省電池和 GPU。在穩定版本中，`dirty` 標誌在每個渲染幀的*開始*被消耗，因此從 `update()` 內部發出的 `markDirty()` 會存活到下一幀的靜態檢查。

```typescript
// update() 內部的 markDirty() 會重新武裝下一幀
class Spinner extends Entity {
  update(dt: number, time: number) {
    super.update(dt, time);
    this.rotation += dt * 0.003;
    this.scene?.markDirty();
  }
}
```

**在 core ≤ 0.2.5 上的陷阱：** 該標誌在*渲染後*被清除，因此在 `update()` 期間設定的 `markDirty()` 在下一次靜態檢查之前被清除——上述模式渲染了一個幀然後凍結在 2 fps。如果你的使用者需要支援較舊的核心，請使用下面的修復方法之一（在 0.2.6 上它們仍然是更有效的選擇，因為 `hasPendingAnimations()` 無需每幀寫入標誌就能表明意圖）。

**修復 — 選項 A：** 使用 `animate()` 來進行運動，而不是手動變異。執行中的補間動畫會自動保持場景活躍：

```typescript
// 正確：animate() 使 hasPendingAnimations() 保持為 true
entity.animate({ rotation: Math.PI * 2 }, 1000);
```

**修復 — 選項 A2（用於 `update()` 驅動的運動）：** 保留積分器，但透過覆寫 `hasPendingAnimations()` 告訴 Scene 它的存在。這是內建滾動容器報告其飛行中運動的方式：

```typescript
class Spinner extends Entity {
  update(dt: number, time: number) {
    super.update(dt, time);
    this.rotation += dt * 0.003;
  }
  hasPendingAnimations() {
    return true; // 或：super.hasPendingAnimations() || stillMoving
  }
}
```

**修復 — 選項 B：** 在**幀之間**呼叫 `markDirty()`——從事件處理常式、`setInterval` 或在場景自身 rAF 之後觸發的獨立 `requestAnimationFrame`：

```typescript
// 正確：在幀之間呼叫 markDirty（不在 update 內部）
setInterval(() => scene.markDirty(), 16); // 外部驅動器
```

**修復 — 選項 C：** 切換到 `renderMode: 'always'` 並設定 `maxFPS` 以防止靜態節流（空閒節流僅在 `maxFPS > 0` 時套用；設定 `maxFPS = 0` 取消限制並始終重新渲染）：

```typescript
scene.maxFPS = 0; // 無限制 — 永遠不會節流至 2 fps
```

## `maxFPS` 與減少動畫

```typescript
const scene = new Scene(canvas, {
  maxFPS: 60, // 幀率上限；0 = 無限制
  respectReducedMotion: true, // 預設：true
});
```

當 `respectReducedMotion: true`（預設）且使用者在作業系統的無障礙設定中啟用了「減少動畫」時，有效 FPS 被上限為 **30**（或 `maxFPS` 與 30 中的較低值）。你可以使用 `respectReducedMotion: false` 停用此功能，但這樣做會忽略使用者的明確偏好。

`maxFPS` 也可在執行時設定：`scene.maxFPS = 30` 用於省電模式。

## WebGL 批次渲染

對於大量的圓形或矩形，WebGL 層將許多每個實體的 Canvas 路徑呼叫替換為類型化緩衝區上傳和少量的繪製提交。交叉點和加速取決於工作負載/硬體，應進行基準測試。

### 啟用批次層

```typescript
const scene = new Scene(canvas, {
  pointBackend: 'webgl', // 在 Canvas2D 上疊加一個 WebGL2 畫布
});
```

### 將實體選擇加入

覆寫 `getBatchCircle()` 或 `getBatchRect()` 而不是 `render()`：

```typescript
class Dot extends Entity {
  radius = 4;
  color = '#00f0ff';

  // 這些每幀都被讀取——動畫值也可用。
  getBatchCircle() {
    return { radius: this.radius, color: this.color };
  }

  // Canvas 模式或不可表示的世界變換所需的備援方案。
  isPointInside() {
    return false;
  }
  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.arc(0, 0, this.radius, 0, Math.PI * 2);
    renderer.fill(this.color);
  }
}
```

Scene 每幀讀取 `getBatchCircle()` / `getBatchRect()` 並將可表示的世界空間基本元素送入 WebGL 層。顏色和 alpha 是每個實例的屬性，因此一個緩衝區可以包含混合樣式。

**限制條件：**

- 實體必須是**葉子**（無子元素）。
- 實體自身的縮放必須是**均勻的**（`scaleX === scaleY`）。
- 需要在 Scene 上設定 `pointBackend: 'webgl'`。
- 累積的變換必須可由一個縮放 + 旋轉表示。非均勻/剪切的祖先會回退到 `render()`。

WebGL 層合成在 Canvas2D 內容**之上**（`z-index: 5`），因此批次基本元素始終繪製在 2D 內容的上方，無論樹順序如何。

### 矩形的 `getBatchRect()`

```typescript
getBatchRect() {
  return { width: this.width, height: this.height, color: this.color };
}
```

批次矩形支援每個實體的可表示旋轉。反射、剪切和非均勻累積縮放使用正常渲染器備援方案。

## 使用 `getBounds()` 的視窗剔除

預設情況下，每個實體在渲染幀上都會執行 `update()` 和 `render()`，即使它完全在畫面外。覆寫 `getBounds()` 以返回一個本地空間邊界框，Scene 將跳過離屏實體的 `render()` 呼叫。樹遍歷和 `update()` 仍會執行：

```typescript
getBounds() {
  return { x: 0, y: 0, width: this.width, height: this.height };
}
```

`UIComponent` 已經實作了此功能——所有 `@vectojs/ui` 元件都會自動參與剔除。對於具有固定大小的原始 `Entity` 子類別，在大型場景中新增 `getBounds()` 可免費獲得效能提升。

例如，如果 5,000 個有邊界的葉子實體中有 90% 在畫面外，則僅剩下約 500 個 `render()` 呼叫，但 Scene 仍然會訪問並更新所有 5,000 個節點。

## 無障礙同步節流

在每個渲染幀上，`Scene` 將所有可互動實體的位置和狀態同步到它們的陰影 DOM 節點。當數百個可互動實體同時動畫時，這個 DOM 寫入開銷可能佔據主導地位的幀時間。

使用 `a11ySyncInterval` 進行節流：

```typescript
const scene = new Scene(canvas, {
  a11ySyncInterval: 100, // 最多每 100 毫秒同步一次
});
// 或在執行時設定：
scene.a11ySyncInterval = 100;
```

該間隔在動畫運行期間被檢查；`a11ySyncInterval: 100` 將同步限制為每秒最多約 10 次，並在運動穩定後安排最終的追趕。根據無障礙延遲和測量的 DOM 成本來選擇間隔，而不是假設一個值適合所有 UI。

## 文字效能

### `setMaxWidth()` — 重排的熱路徑

`LayoutEngine` 將測量（冷）與布局（熱）分開。當視窗調整大小且文字需要重排時：

```typescript
// 錯誤：在每次調整大小事件時重建完整的已測量文字
window.addEventListener('resize', () => {
  label.setText(label.text); // 冷傳遞 — 重新分割並重新測量
});

// 正確：重用快取的測量值，僅重新計算分行符號
window.addEventListener('resize', () => {
  label.setMaxWidth(newWidth); // 熱傳遞 — 便宜
});
```

熱路徑是 O(單詞數)，而非 O(字形數)，並且避免了所有 `Intl.Segmenter` 和畫布 `measureText` 呼叫。

### `LayoutResultBuffer` — 可重用的文字座標儲存

對於每幀有數千個字形的資料密集 UI（資料網格、終端機、日誌檢視器），標準的 `layoutPrepared()` 路徑會為每個字形分配一個 `LayoutNode` 物件。請改用 `LayoutResultBuffer`：

```typescript
import { LayoutEngine, LayoutResultBuffer, createCanvasMeasurer } from '@vectojs/core/layout';

const engine = new LayoutEngine(400, Infinity, createCanvasMeasurer());
const buffer = new LayoutResultBuffer(); // 在幀之間重用（CAPACITY = 16384）

function renderRow(text: string) {
  const prepared = engine.prepare(text, {}, 14);
  buffer.reset();
  engine.layoutPreparedIntoBuffer(prepared, buffer);
  // buffer.xs, buffer.ys, buffer.ws, buffer.hs, buffer.chars — 平面類型化陣列
  for (let i = 0; i < buffer.count; i++) {
    renderer.fillText(buffer.chars[i], buffer.xs[i], buffer.ys[i], '14px monospace', '#e2e8f0');
  }
}
```

可重用的緩衝區避免了在每次熱布局中為每個字形分配一個 `LayoutNode` 物件。限制條件：固定容量，僅支援單欄（無 BiDi 視覺重排序，無排除矩形）。當你需要這些功能時使用 `layoutPrepared()`；在熱路徑上避免 `toLayoutResult()`，因為它會分配節點物件。

## CPU 計算 vs 渲染瓶頸

在傳統的瀏覽器 DOM 框架中，效能瓶頸幾乎總是存在於瀏覽器的**渲染和重排布局管線**（DOM 操作、樣式重新計算和繪製）。然而，因為 VectoJS 完全繞過 DOM 並在記憶體中以數學方式處理布局、剔除和互動，效能瓶頸從 GPU/渲染層直接轉移到**JavaScript 單執行緒 CPU 計算**。

在足夠高的活動節點數下，CPU 端的遍歷、更新、布局和命中測試可能在柵格化之前就超過 $16.67\text{ ms}$ 的幀預算。交叉點取決於工作負載和裝置。

VectoJS 從基本原理出發，透過提供專用的**「逃脫艙口」**來繞過 CPU 單執行緒限制，解決這些計算瓶頸。

---

### 1. 高密度粒子模擬（每個粒子，而非 N 體）

**瓶頸**：每個粒子的 JavaScript 積分是 $O(N)$，最終會消耗主執行緒的幀預算。發生這種情況的數量取決於裝置和模型。

**逃脫艙口：WebGPU 計算著色器（`ComputeParticleEntity`）**
為了完全繞過 CPU 執行，VectoJS 提供了 `ComputeParticleEntity`。在底層：

- 物理方程式（尤拉積分、彈簧張力和場吸引力）被編譯為 **WGSL（WebGPU 著色語言）計算著色器**。
- 在執行時，資料保留在 GPU VRAM 中，允許 WebGPU 計算傳遞將模擬並行化到數千個 GPU 核心。
- 當 WebGPU 不可用或裝置丟失時，渲染器會自動回退到等效的 CPU 迴圈（`updateCPU()`）。

> [!IMPORTANT] > **這不是 $N$ 體模擬。** 每個粒子的力僅相對於三個*固定*點計算——其彈簧原點、滑鼠游標和可選的爆炸中心。沒有粒子對粒子的互動，也沒有涉及空間索引，這正是它令人尷尬地並行且對 GPU 友善的原因。如果你的模擬需要真正的鄰居互動（粒子對粒子碰撞或排斥、群聚、N 體重力），`ComputeParticleEntity` 無法涵蓋——你需要編寫自己的帶有內建鄰居查詢的 WGSL 計算傳遞，或在 CPU 上執行基於 `SpatialHashGrid` 的鄰居查詢（請參閱下面的 [`SpatialHashGrid`](#3-實體海洋互動on2-複雜度災難) 和[物理引擎指南](/learn/physics-engine/) 中的 CPU 範例）。目前引擎中沒有通用的「在 GPU 上執行任意計算，附 CPU 備援方案」抽象——`ComputeParticleEntity` 是一個特定的、狹義的實作，而非可重複使用的模式。

高階吞吐量在很大程度上取決於 GPU、瀏覽器、DPR、粒子模型和合成。此儲存庫沒有已簽入的高階 WebGPU 結果，因此請使用**匯出報告**按鈕（請參閱下面的[測量實際效能](#測量實際效能)）來測量你自己的場景。

---

### 2. 高密度文字測量與排版重排

**瓶頸**：動態文字布局是前端工程中 CPU 最昂貴的任務之一。它需要基於字典的詞彙標記化（`Intl.Segmenter`）、BiDi 排序和瀏覽器級別的字型寬度測量（呼叫畫布 `measureText` API）。嘗試在單一幀中計算數萬個字形的文字布局（例如在金融終端機、活動日誌串流或資料網格中）將使 JS 主執行緒在「冷傳遞」測量管線上凍結。

**逃脫艙口：執行緒外布局、分離布局與重用記憶體**
VectoJS 提供了三個級別的文字最佳化：

- **執行緒外 MSDF 布局（`LayoutWorkerManager`）**：`MSDFTextEntity` 可以將文字加上預計算的字型/字形度量發送到背景 Web Worker，按實體去抖動。Worker 執行行放置並返回類型化座標/樣式緩衝區；它不呼叫瀏覽器字型測量 API。
- **冷/熱分離**：VectoJS 將布局分為「冷」（文字解析和字形寬度測量）和「熱」（換行計算）。當文字因調整大小而換行時，冷結果被重用，避免了所有瀏覽器測量 API，並將調整大小布局複雜度降至純粹的 $O(\text{單詞數})$。
- **可重用 TypedArray 緩衝區（`LayoutResultBuffer`）**：為了避免分配數千個臨時布局節點物件，開發人員可以將布局座標寫入預先分配的平面緩衝區。周圍的呼叫者仍然可以分配；保證的是緩衝區路徑重用其座標儲存。

> [!IMPORTANT] > **`LayoutWorkerManager` 是單一的背景執行緒，而非池，且它僅為一個元件接線。** 它由 `MSDFTextEntity`（GPU/MSDF 字型文字基本元素）在內部使用——預設的 `@vectojs/ui` 文字元件（`Text`、`RichText`）在主執行緒上同步布局，包含冷/熱分離等。如果你正在渲染非常高量的預設元件文字並遇到瓶頸，冷/熱分離和 `LayoutResultBuffer` 仍然適用，但你無法免費獲得執行緒外布局——你需要建立自己的 Worker 卸載，或切換到 `MSDFTextEntity`。更一般地說：除了這個文字布局路徑之外，引擎中目前沒有任何東西在主要執行緒之外運行。VMT 遍歷、命中測試和彈簧物理都是同步的。

---

### 3. 實體海洋互動（$O(N^2)$ 複雜度災難）

**瓶頸**：實體對實體的成對碰撞或接近檢查需要 $O(N^2)$ 的候選比較。在遠低於非常大的場景計數之前，這種增長就變得不可行，確切限制取決於每對的工作量。

**逃脫艙口：空間哈希網格（`SpatialHashGrid`）**
對於應用程式管理的碰撞/接近查詢，VectoJS 匯出 **SpatialHashGrid**。Scene 不會自動索引實體：

- 2D 座標空間被離散化為你選擇的固定大小的單元；單元座標透過 [Cantor 配對函數](https://en.wikipedia.org/wiki/Pairing_function) 組合成單個桶鍵，儲存在普通的 `Map` 中——而非固定容量的哈希表。
- 當實體的世界空間 AABB 變更時呼叫 `insert(id, x, y, w, h)`，或為動態幀清除/重建網格。
- 呼叫 `query(x, y, w, h)` 從本地查詢 AABB 重疊的每個單元中檢索 ID，然後對這些候選者執行精確碰撞測試。
- 這可以將應用程式層級的本地物理從 **$O(N^2)$** 降低到每次查詢訪問的單元/結果。內建的 `findEntityAt()` 和視窗剔除仍然是 O(N) 樹走訪。

> [!WARNING] > **密集桶沒有自動緩解措施。** `SpatialHashGrid`（以及知識圖演示使用的獨立空間哈希）將每個儲存格儲存為一個扁平集合，沒有內部結構——沒有自適應單元大小、沒有溢出鏈接、沒有階層/多解析度網格。假設你選擇的 `cellSize` 下實體在單元間大致均勻分佈，才能達到「$O(1)$ 平均」。如果你的資料可能高度聚集——許多實體落在相同的少數幾個單元中（人群聚集在一點，縮小視野時數千個節點重疊幾個像素）——這些單元會退化為 $O(k)$ 線性掃描，與完全沒有索引相同。目前沒有自動的逃脫艙口：唯一的槓桿是選擇適合實體大小和預期密度的 `cellSize`，並在資料的聚集行為變化時重新評估。如果你正在建立一個極端、不可預測的聚集是真實可能性的東西，請預算用於測量最壞情況的桶佔用率，而不是假設平均情況成立。

---

## 測量實際效能

> [!WARNING]
> 無頭 Chrome 通常使用軟體柵格化和不同的幀排程。將其 FPS 視為相同環境的回歸訊號，而非下限或生產預測。

為了獲得準確的吞吐量數據：

1. 在真實瀏覽器和真實 GPU 硬體上執行演示。
2. 使用 Nexus 演示中的**匯出報告**按鈕，輸出帶有當前 GPU/瀏覽器組合的機器可讀 FPS 記錄。
3. 在 PR 或文件中引用效能數據時，使用瀏覽器內測量——而不是無頭輸出。

對於自訂基準測試，在 `update()` 迴圈中收集幀時間：

```typescript
const samples: number[] = [];

class BenchEntity extends Entity {
  update(dt: number, time: number) {
    super.update(dt, time);
    if (samples.length < 300) samples.push(dt);
    if (samples.length === 300) {
      const avg = samples.reduce((a, b) => a + b) / samples.length;
      console.log(`平均幀: ${avg.toFixed(2)} ms  (${(1000 / avg).toFixed(1)} fps)`);
    }
  }
}
```

`dt` 單位為毫秒；`1000 / dt` 給出即時 FPS。

## 快速參考：哪個旋鈕解決哪個問題

| 症狀                     | 修復                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| 場景空閒時節流至 2 fps   | 預期行為——在狀態變更時呼叫 `markDirty()`，或對大部分靜態場景使用 `renderMode: 'onDemand'`                    |
| 手動動畫的實體降至 2 fps | 覆寫 `hasPendingAnimations()` 或透過 `animateTo()` / `springTo()` 驅動它，以便場景知道運動正在進行           |
| 靜態 UI 浪費電池         | 切換到 `renderMode: 'onDemand'`                                                                              |
| 許多相容的圓形速度慢     | 在目標裝置上對 `pointBackend: 'webgl'` + `getBatchCircle()` 進行基準測試                                     |
| 離屏實體浪費 CPU         | 在實體上實作 `getBounds()`                                                                                   |
| 動畫期間 DOM 寫入開銷    | 設定 `a11ySyncInterval: 100`                                                                                 |
| 調整大小時文字重排緩慢   | 使用 `setMaxWidth()` 而不是 `setText()`                                                                      |
| 密集文字造成分配壓力     | 使用 `LayoutResultBuffer` + `layoutPreparedIntoBuffer()`                                                     |
| CI 中 FPS 不同           | 比較同類 CI 運行；在目標硬體上測量面向使用者的吞吐量                                                         |
| 動態粒子耗盡 CPU 預算    | 對 `ComputeParticleEntity` 進行基準測試，將其固定點力模型卸載到 WebGPU                                       |
| 多行文字重排凍結執行緒   | 透過 `LayoutWorkerManager` 將 `MSDFTextEntity` 布局卸載到執行緒外（預設 `Text`/`RichText` 保留在主執行緒上） |
| 實體海洋互動為 $O(N^2)$  | 實作 `SpatialHashGrid` — 降低到平均 $O(k)$，在重度聚集下非自動；為你的資料調整單元大小                       |
