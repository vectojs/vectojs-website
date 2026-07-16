---
title: '常見問題'
description: '關於 VectoJS 的常見問題 — 架構決策、效能、無障礙與疑難排解。'
order: 49
---

# 常見問題

## 架構

### 為什麼使用 canvas 而非 DOM？

DOM 提供語意化的文件結構、CSS 版面配置，以及成熟的無障礙模型。對於以自訂幾何圖形或大量頻繁變動的視覺集合為主的應用場景，canvas 可以避免每個可繪物件都使用一個樣式化的 DOM 節點，並讓應用程式直接控制版面配置與渲染。同時，它也將版面配置、點擊測試、語意和效能量測的責任轉移至框架/應用程式本身。

### 如果所有內容都繪製在 canvas 上，無障礙功能如何運作？

`Scene` 為符合條件的互動 Entity 維護一個無障礙投射疊層（`a11yRoot`），包含真實的 `<button>`、`<input>`、`<a>` 和 `<div>` 元素。這並非瀏覽器的 Shadow DOM API。該疊層會跟隨 canvas 偏移/CSS 縮放以及每個 Entity 的仿射變換，接收原生指標/鍵盤/焦點事件，並對 DevTools 和基於角色的自動化工具可見。應用程式仍需提供正確的角色、標籤、焦點順序、鍵盤行為以及螢幕閱讀器測試。

設定 `entity.interactive = true` 即可投射陰影節點。覆寫 `getA11yAttributes()` 來控制標籤和 ARIA 屬性：

```typescript
getA11yAttributes() {
  return { tag: 'button', role: 'button', label: 'Submit form' };
}
```

### 是否有 React / Vue / Svelte 整合套件？

目前尚無第一方套件。由於 VectoJS 掌控一個 `<canvas>` 元素，它與任何框架的整合方式與 WebGL 函式庫完全相同 — 掛載 canvas，在生命週期鉤子（`useEffect`、`onMounted` 等）中初始化 `Scene`，並在卸載時銷毀。

```typescript
// React 範例
import { useEffect, useRef } from 'react';
import { Scene } from '@vectojs/core';

export function VectoCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const scene = new Scene(canvasRef.current!, { maxFPS: 60 });
    scene.start();
    return () => scene.destroy();
  }, []);
  return <canvas ref={canvasRef} />;
}
```

### 兩個 Scene 能否像磁磚一樣無縫拼接？

無法結合成一個邏輯表面。一個 `Scene` 只擁有一個 `<canvas>` 和一個根 `Entity` 樹 — 沒有任何 API 能讓兩個 `Scene` 共享座標空間、在彼此之間傳遞 Entity，或跨越邊界進行點擊測試。並列執行兩個 `Scene` 實例（使用一般 CSS 定位兩個 canvas）可以運作且看起來無縫，但它們在功能上彼此獨立：各自的渲染迴圈、各自的 `renderMode`/骯髒追蹤、各自的無障礙投射。如果需要 Entity 之間相互互動、變換或進行點擊測試，請將它們放在同一個 `Scene` 的樹中，而非嘗試橋接兩個 Scene。

---

## 效能

### VectoJS 在 60 fps 下能處理多少個 Entity？

沒有與後端無關的固定數字：路徑複雜度、文字、裝置像素比率、無障礙投射、更新工作、GPU/驅動程式以及可見比例都會改變結果。已簽入的無頭基準測試目前涵蓋 1,000 和 5,000 個節點的簡單 Canvas Entity；這並非六位數 WebGL/WebGPU 聲明的證據。請在目標硬體上執行示範報告，並為您的工作負載記錄幀時間百分位數。

### `pointBackend: 'webgl'` 選項是什麼？

設定後，`Scene` 會在主要 Canvas2D canvas 之上疊加一個透明的 WebGL2 canvas。實作 `getBatchCircle()` / `getBatchRect()` 的可表示葉節點會被收集到型別緩衝區中，並以批次 WebGL 繪圖提交，而文字、圖片、複雜形狀以及不支援的仿射變換則保留在 Canvas2D 上。請在您的硬體上量測交叉點；本倉庫目前不包含經過驗證的通用加速倍率。

### `renderMode: 'onDemand'` 是什麼？

在 `'onDemand'` 模式下，Scene 僅在呼叫 `scene.markDirty()` 或動畫驅動器進行中時才繪製。靜態 tick 仍會排程 rAF 並檢查樹中是否有待處理的動作，但會跳過 Entity 更新/渲染工作和 GPU 提交。適用於大部分為靜態的 UI — 儀表板、表單、選單。

```typescript
scene.renderMode = 'onDemand';
entity.on('click', () => {
  entity.animate({ x: entity.x + 50 }, 300); // 自動觸發 dirty
});
```

### 在 Node.js / 無頭環境中測試時，FPS 為什麼很低？

無頭 Chrome 通常使用軟體光柵化器，且具有不同的排程/vsync 行為。其 FPS 適用於相同環境中的迴歸比較，而非作為下限或用戶 GPU 的預測。請在目標瀏覽器和硬體上進行量測。

> [!TIP]
> 使用 Nexus 示範中的 **Export report** 按鈕，即可在您目前的硬體和瀏覽器上獲得真實的 GPU 量測結果。將那些數字複製貼上到您的 PR 中，而非使用無頭 FPS。

---

## Entity API

### 什麼是 `clipChildren`？

將 `clipChildren` 設為 `true` 會將一般子繪圖裁剪至 Entity 的 `[0,0]–[width,height]` 範圍內。這就是 `ScrollView` 實作溢位的方式。CanvasRenderer 和 SVGRenderer 會保留變換後的裁剪。ThreeRenderer 使用裁剪變換後的世界 AABB 來交集剪刀矩形，因此旋轉/傾斜的裁剪是軸對齊的近似值。被提升至獨立 WebGL 點圖層和 WebGPU 粒子疊層的基本元素不會受到父渲染器裁剪堆疊的影響。

### 什麼是 `a11yFullViewport`？

通常只有在 `entity.interactive && entity.width > 0` 時才會投射陰影 DOM 節點。對於覆蓋整個 Scene 視口的 Entity（無限畫布圖表、全螢幕手勢辨識器），沒有有意義的邊界框。將 `a11yFullViewport` 設為 `true` 會在所有其他陰影節點之後建立一個 Scene 大小的陰影節點；然後投射根會將該邏輯框對應到 canvas CSS 框。

### 我的 `Entity.update()` 動畫速度是預期的兩倍 — 為什麼？

> [!CAUTION] > `Entity.update(dt, time)` 接收的 **dt 單位是毫秒，而非秒**。這是 VectoJS 最常見的陷阱。60 fps 時的 `dt` ≈ 16.7，而非 0.017。

從使用秒的物理函式庫移植時常見的錯誤：

```typescript
// 錯誤：將毫秒視為秒 → 速度變快 1000 倍
this.x += velocity * dt;

// 正確：轉換為秒，或使用毫秒單位
this.x += velocity * (dt / 1000);
```

彈簧物理（`SpringPhysics`、`ScrollView`）內部使用 `dt / 1000` 在執行模擬前進行轉換。

### `emit()` 和 `dispatchEvent()` 有什麼不同？

- `entity.emit(event, payload)` — 僅觸發 Entity 自身的**冒泡階段**監聽器。不進行樹遍歷。這是元件內部路徑（例如，表單控制項觸發自身的 `change`）。
- `entity.dispatchEvent(event)` — 執行完整的 DOM 風格**捕獲 + 冒泡**遍歷：捕獲從根到目標，冒泡從目標到根。這就是 `Scene` 分派指標事件的方式。

---

## 自訂與動畫

### VectoJS 的自訂程度如何 — 能否實現啟動畫面或轉場效果？

可以。每個可動畫屬性（`x`、`y`、`scaleX`、`scaleY`、`rotation`、`opacity`）都可以由 `TweenDriver`（基於曲線，使用內建 `Easing` 集合或自訂函數）或 `SpringDriver`（物理模擬，具有可設定的 `stiffness`/`damping`/`mass`）驅動。具體針對粒子密集型效果，`ComputeParticleEntity` 搭配 `particleBackend: 'webgpu'` 會執行一個計算著色器，具有彈簧回原點力、滑鼠排斥力、速度限制、邊界反彈以及專用的**爆炸力參數**（`triggerExplosion(x, y, force)`） — 爆發/濺射效果是一級基本元素，無需使用 tween 偽造。CPU 後備路徑（`updateCPU`）在 WebGPU 不可用時會鏡像相同的力模型。

### Entity 的形狀如何定義 — 可以是五邊形、橢圓形、不規則多邊形嗎？

可以，而且形狀實際上是兩個獨立且可覆寫的關注點：

- **視覺形狀**：`render(renderer)` 透過 `IRenderer` 的向量路徑基本元素（`moveTo`、`lineTo`、`bezierCurveTo`、`arc`、`closePath`）進行繪製 — 與手寫 Canvas2D/SVG 路徑使用相同的基礎元素，因此任何多邊形、橢圓或曲線輪廓都可繪製。`SplineEntity` 是內建範例：它透過將任意三次多項式曲線轉換為貝茲曲線段來渲染。
- **點擊測試形狀**：`isPointInside(globalX, globalY): boolean` 在基礎 `Entity` 類別上是 `abstract` 的 — 每個具體 Entity 提供自己的邏輯。沒有任何東西要求（或預設使用）軸對齊邊界框；五邊形的 `isPointInside` 可以進行真正的點在多邊形內計算，橢圓形可以進行二次形式檢查等。

由於這兩個方法是分開的，形狀的可點擊區域不必與其繪製輪廓完全一致（對於小型形狀上的寬鬆觸控目標很有用）。

### 文字和元件是否會適應不同的裝置和瀏覽器縮放層級？文字縮放是否完全自適應？

機制是存在的，但需要明確操作而非預設自動：

- **HiDPI**：`CanvasRenderer` 在建構和 `resize()` 時讀取 `window.devicePixelRatio`，相應地縮放 canvas 備用儲存區 — Retina/HiDPI 顯示器無需額外應用程式碼即可呈現清晰畫面。
- **瀏覽器縮放**：大多數瀏覽器在縮放時會改變有效的 `devicePixelRatio` 並觸發 `window` 的 `resize` 事件，`Scene` 已監聽並透過呼叫渲染器的 `resize()` 來回應。
- **文字重排**：`LayoutEngine.setMaxWidth()` 專門設計為此用途的廉價「熱路徑」 — 它重用上次冷 `prepare()` 傳遞中快取且已量測的 `PreparedText`，僅重新進行斷行，而不重新分段或重新量測。在您自己的 resize 處理常式中呼叫它以低成本重新排文。

因此：存在用於適應性、低成本 resize 版面的基本元素，並且 UI 元件內部使用它們，但原始自訂 `Entity` 不會「免費」重排 — 您需要自行將 resize 處理常式連接到相關的 `setMaxWidth`/佈局呼叫，就像在任何即時模式渲染器中連接 canvas 縮放一樣。

### VectoJS 的動畫模型與 CSS 動畫有何不同？是否在渲染前預先計算所有內容？

不是 — 沒有任何內容會預先烘焙為關鍵影格。`TweenDriver.tick(dtMs)` 和 `SpringDriver.tick(dtMs)` 是即時積分器：每個影格，它們從自上一影格以來的**實際**經過時間推進，而非從預先計算的時間軸。`SpringPhysics`（`SpringDriver` 背後的引擎）在固定的子步驟中進行即時尤拉積分，並具有穩定性限制，以處理背景分頁在返回時可能提供的較大 `dt`。

實務上的差異體現在動畫中途變更目標時：`driver.retarget(to)` 在彈簧上會保留目前的值和速度，並平穩地朝新目標繼續積分 — 沒有跳躍、沒有重新開始。CSS 過渡/動畫在目標中途變更時通常會重新開始或跳躍，因為它是沿著預定曲線插值，而非逐影格模擬物理。

### 如何停用元件的預設彈簧/慣性動畫，或將其變更為標準過渡？

預設情況下，VectoJS 的可捲動元件（如 `ScrollView` 和 `VirtualList`）以及屬性使用基於彈簧的物理（`'spring'`）來實現平滑過渡。如果您想停用這些動畫以獲得快速即時的行為，或將其切換為標準的三次貝茲過渡（如 `easeOutCubic`），您有三種主要方法：

#### 1. 變更目標 Entity 上的過渡設定

每個 `Entity` 都公開一個 `setTransition` 方法。您可以透過在目標元素上呼叫 `setTransition` 並傳入自訂的 `duration`（毫秒）和 `easing` 函數來覆寫預設的彈簧過渡，或完全停用它：

```typescript
// 變更為快速、無彈跳的過渡（如 easeOutCubic）
entity.setTransition({
  y: { duration: 120, easing: 'easeOutCubic' },
});

// 完全停用動畫（即時跳躍）
entity.setTransition({
  y: null, // 清除過渡驅動器
});
```

#### 2. 即時跳躍位置而不觸發彈簧

如果您想在不觸發任何已設定過渡的情況下立即移動 Entity（完全繞過彈簧），請使用 `setImmediate` 方法：

```typescript
// 立即跳躍至目標位置
entity.setImmediate('y', targetY);
```

#### 3. 為行動裝置捲動繞過 Canvas 物理

對於全螢幕頁面，當行動裝置使用者期望原生動量捲動而非 Canvas 模擬的彈簧時，請將觸控手勢轉發到瀏覽器視口：

1. 在 Canvas 上綁定觸控監聽器，將觸控拖動增量轉換為原生視窗捲動：

   ```typescript
   let touchStartY = 0;
   canvas.addEventListener(
     'touchstart',
     (e) => {
       if (e.touches && e.touches[0]) touchStartY = e.touches[0].clientY;
     },
     { passive: true },
   );

   canvas.addEventListener(
     'touchmove',
     (e) => {
       if (e.touches && e.touches[0]) {
         const touchY = e.touches[0].clientY;
         window.scrollBy(0, touchStartY - touchY);
         touchStartY = touchY;
       }
     },
     { passive: true },
   );
   ```

2. 監聽 `window` 的 `"scroll"` 事件，並使用 `setImmediate` 或快速緩動過渡將捲動位置同步到渲染容器：

   ```typescript
   window.addEventListener('scroll', () => {
     mainScroll.y = -window.scrollY; // 或 mainScroll.setImmediate('y', -window.scrollY);
   });
   ```

---

## UI 元件與 Devtools

### devtools 提供什麼功能，以及它們如何幫助除錯？

`@vectojs/devtools` 是一個頁面內檢查器 — 一個面板（本身使用 VectoJS 渲染）為您提供：

- Virtual Math Tree 的即時樹狀檢視，帶有 Entity 類型、幾何圖形和活躍動畫的標記
- 一次性 Entity 選取（點擊 canvas 上的 Entity 以在樹中選取它）
- 全域變換讀出（位置、縮放、旋轉，顯示完整祖先鏈的實際計算結果）
- 所選 Entity 的鍵盤微調編輯
- 主機頁面疊層高亮，顯示所選 Entity 的世界邊界

`Scene` 公開唯讀的 `rootEntity`/`overlayRootEntity` 存取器，專門用於讓此類工具可以遍歷樹，而無需特權內部存取權限。

### 使用 VectoJS 的原生 UI 元件時應注意什麼？

以下是直接從元件集審計中得出的一些值得注意的模式：

- **`entity.id` 的唯一性是您的責任。** 引擎不會強制執行。這對無障礙投射（`Scene` 以 Entity id 作為陰影 DOM 節點的鍵）以及任何您自己以 id 索引 Entity 的程式碼（例如 `SpatialHashGrid`）最為重要 — 請像為 `Map` 選擇鍵一樣選擇 id。
- **附加監聽器到其他 Entity 的元件必須呼叫 `destroy()`。** `Tooltip`、`Popover` 和類似的「附加到目標」元件會儲存其處理常式並在 `destroy()` 中移除它 — 使用完元件後務必呼叫它，就像移除手動添加的監聽器一樣。
- **`interactive = true` 並非免費。** 設定它會為該 Entity 投射一個真實的陰影 DOM 節點。這對按鈕、連結和表單控制項來說沒問題；但應避免在非常大量的葉 Entity 集合上使用。例如，`GridTextEntity` 會明確為其整個網格停用 `interactive`，以避免在大規模時為每個字元投射一個陰影節點。
- **自訂拖曳式元件應遵循內建的指標捕獲模式。** `Slider` 和同類元件在 `pointerdown` 時（透過其 a11y 投射元素）呼叫 `setPointerCapture()`，這使得快速拖曳超出元件視覺邊界時仍能正確追蹤。如果您建立自己的可拖曳元件，請遵循相同的模式，而非僅依賴 `pointermove`/`pointerleave`。處理 `pointercancel` 作為回滾路徑，以便瀏覽器中斷不會導致拖曳或選取交易保持活躍。

---

## 無障礙與自動化

### 如何讓元件與 Playwright 的 `page.getByRole()` 相容？

從 `getA11yAttributes()` 返回正確的標籤和角色：

```typescript
// 可存取的按鈕
getA11yAttributes() { return { tag: 'button', role: 'button', label: 'Send' }; }

// 可存取的連結
getA11yAttributes() { return { tag: 'a', role: 'link', label: 'Home', href: '/' }; }

// 可存取的文字欄位
getA11yAttributes() { return { tag: 'input', inputType: 'text', placeholder: 'Search…' }; }
```

內建元件（`Button`、`Input`、`Link` 等）會自動執行此操作。

### 陰影節點位置看起來不對 — Entity 偏移

兩個常見原因：

1. **canvas 父元素未設定 `position: relative`** — `Scene` 會在每個影格自動強制執行此設定，但如果其他 CSS 規則在場景啟動後強制將 `position` 設為 `static`，則絕對定位的陰影節點將相對於錯誤的包含區塊偏移。
2. **`a11yOffsetX` / `a11yOffsetY`** — 如果您之前設定這些作為解決方法，請先嘗試移除它們，看看底層定位是否實際上是正確的。

在 `SceneOptions` 中啟用 `debugA11y: true` 以查看每個陰影節點上半透明的醒目提示框：

```typescript
const scene = new Scene(canvas, { debugA11y: true });
```

---

## WebGPU 粒子

### `ComputeParticleEntity` 沒有顯示任何內容 — 出了什麼問題？

最常見的原因：

1. **未呼叫 `initRandomParticles()`** — 未初始化粒子資料時，所有位置都是 `(0,0)` 且大小為 `0`。
2. **WebGPU 不可用** — 場景會記錄失敗的 WebGPU 請求並回退到 CPU/Canvas2D 路徑；請確保設定了 `particleBackend: 'webgpu'` 且您的瀏覽器支援 WebGPU。
3. **canvas 大小為 `0×0`** — 在第一個影格之前呼叫 `scene.resize(w, h)`（或確保 canvas 有尺寸）。

### CPU 後備方案如何運作？

當 WebGPU 不可用（或失敗）時，`Scene` 會在每個渲染影格呼叫 `entity.updateCPU(dt, mouseX, mouseY, width, height)` 並透過 `fillCircle` 繪製粒子。後備方案鏡像彈簧/排斥/爆炸/速度/反彈模型，但 CPU/GPU 數值路徑和吞吐量不保證相同。請根據目標裝置上的量測結果選擇粒子數量。

### 我可以從 GPU 讀回粒子位置嗎？

不行 — 粒子狀態存在於 WebGPU 儲存緩衝區中。要讀回資料，您需要進行 `copyBufferToBuffer` + `mapAsync` 往返，這會停頓 GPU 管線。相反地，如果您需要在 CPU 上取得位置，請保持 CPU 端的 `particleData` Float32Array 同步。`setOrigins()`、`setPositions()` 和 `setVelocities()` 會寫入 `particleData` 並設定 `needsInit = true`，這會在下一影格上傳到 GPU 儲存緩衝區。

> [!NOTE] > `mapAsync` + `copyBufferToBuffer` 讀回會刻意阻斷管線。對於大規模的碰撞偵測或空間查詢，請使用 `SpatialHashGrid` 在 CPU 路徑上執行，或將其表示為額外的 WebGPU 計算傳遞。

---

## 疑難排解

### `Scene` 正在執行，但螢幕上沒有顯示任何內容

請依序檢查：

1. 是否已呼叫 `scene.start()`？
2. canvas 的 CSS 和 HTML 屬性是否有非零的 `width` 和 `height`？
3. Entity 是否已透過 `scene.add(entity)` 加入場景（而不僅僅是建構）？
4. Entity 的 `render()` 方法是否實際呼叫了 `renderer.fill()` 或 `renderer.stroke()`？空的 `render()` 不會繪製任何內容。
5. `entity.opacity` 是否 > 0？

### 我的滾輪事件沒有送達 `ScrollView`

`ScrollView` 會在 `wheel` 事件上呼叫 `e.preventDefault()` 以防止頁面捲動。如果陰影節點的滾輪監聽器觸發了但捲動視圖沒有反應，請確認使用了 `ScrollView.add(child)`（而非直接使用 `entity.add(child)` 繞過內容包裝器），且 canvas 父元素沒有設定 `overflow: hidden` 阻擋指標事件。

### TypeScript 報告 `Cannot find name 'GPUDevice'`

將 `@webgpu/types` 加入您的專案：

```bash
bun add -d @webgpu/types
```

然後加入 `tsconfig.json`：

```json
{ "compilerOptions": { "types": ["@webgpu/types"] } }
```
