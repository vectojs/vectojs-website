---
title: '常見問題'
description: '關於 VectoJS 的常見問題 — 架構決策、效能、無障礙與疑難排解。'
order: 49
---

# 常見問題

## 架構

### 為什麼使用 canvas 而不是 DOM？

DOM 提供語義化的文件結構、CSS 版面以及成熟的無障礙模型。對於以自訂幾何圖形或大型、頻繁變化的視覺集合為主的工作負載，canvas 可以避免每個可繪製物件對應一個樣式化的 DOM 節點，並讓應用程式直接控制版面/渲染。同時也將版面、點擊測試、語義和效能測量的責任轉移到框架/應用程式上。

### 如果所有內容都繪製在 canvas 上，無障礙如何運作？

`Scene` 為符合條件的互動 entity 維護一個無障礙投射疊加層（`a11yRoot`），其中包含真實的 `<button>`、`<input>`、`<a>` 和 `<div>` 元素。這不是瀏覽器的 Shadow DOM API。該疊加層跟隨 canvas 偏移/CSS 縮放以及每個 entity 的仿射變換，接收原生指標/鍵盤/焦點事件，並且對 DevTools 和基於角色的自動化可見。應用程式仍需要提供正確的角色、標籤、焦點順序、鍵盤行為和螢幕閱讀器測試。

設定 `entity.interactive = true` 以投射陰影節點。覆寫 `getA11yAttributes()` 以控制標籤和 ARIA 屬性：

```typescript
getA11yAttributes() {
  return { tag: 'button', role: 'button', label: 'Submit form' };
}
```

### 有 React / Vue / Svelte 整合嗎？

目前尚無第一方套件。由於 VectoJS 擁有 `<canvas>` 元素，它與任何框架的整合方式與 WebGL 函式庫完全相同 — 掛載 canvas，在生命週期掛鉤（`useEffect`、`onMounted` 等）中初始化 `Scene`，並在卸載時銷毀。

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

### 兩個 Scene 能否像拼貼一樣無縫拼接？

不能作為一個邏輯表面。一個 `Scene` 恰好擁有一個 `<canvas>` 和一個根 `Entity` 樹 — 沒有 API 可以讓兩個 `Scene` 共享座標空間、互相傳遞 entity，或跨越邊界進行點擊測試。並排執行兩個 `Scene` 實例（使用一般 CSS 定位兩個 canvas）可以運作且看起來無縫，但它們在功能上保持獨立：獨立的渲染迴圈、獨立的 `renderMode`/dirty 追蹤、獨立的無障礙投射。如果您需要 entity 彼此互動、變換或進行點擊測試，請將它們放在一個 `Scene` 的樹中，而不是嘗試橋接兩個。

---

## 效能

### VectoJS 在 60 fps 下能處理多少個 entity？

沒有與後端無關的數字：路徑複雜度、文字、裝置畫素比、無障礙投射、更新工作、GPU/驅動程式以及可見百分比都會改變結果。已簽入的無頭基準測試目前涵蓋 1,000 和 5,000 個節點的簡單 Canvas entity；它不能作為六位數 WebGL/WebGPU 聲稱的證據。請在目標硬體上執行示範報告，並為您的工作負載記錄幀時間百分位數。

### `pointBackend: 'webgl'` 選項是什麼？

當設定此選項時，`Scene` 會在主 Canvas2D canvas 上疊加一個透明的 WebGL2 canvas。實作了 `getBatchCircle()` / `getBatchRect()` 的可表示葉節點會被收集到型別化緩衝區中，並以批次 WebGL 繪製提交，而文字、圖片、複雜形狀和不支援的仿射變換則保留在 Canvas2D 上。請為您的硬體測量交叉點；儲存庫目前不包含經過驗證的通用加速倍數。

### `renderMode: 'onDemand'` 是什麼？

在 `'onDemand'` 模式下，Scene 僅在呼叫 `scene.markDirty()` 或有動畫驅動器進行中時才繪製。靜態 tick 仍會排程 rAF 並檢查樹中是否有待處理的運動，但它們會跳過 entity 更新/渲染工作和 GPU 提交。對於大部分靜態的 UI（儀表板、表單、選單）使用此模式。

```typescript
scene.renderMode = 'onDemand';
entity.on('click', () => {
  entity.animate({ x: entity.x + 50 }, 300); // 自動觸發 dirty
});
```

### 在 Node.js / 無頭模式測試時 FPS 很低？

無頭 Chrome 通常使用軟體柵格化器，並具有不同的排程/vsync 行為。其 FPS 在同一環境中作為迴歸比較很有用，但不能作為下限或用戶 GPU 的預測。請在目標瀏覽器和硬體上測量。

> [!TIP]
> 使用 Nexus 示範中的 **Export report** 按鈕，以您當前的硬體和瀏覽器獲得真實的 GPU 測量值。將這些數字複製貼上到您的 PR 中，而不是使用無頭 FPS。

---

## Entity API

### `clipChildren` 是什麼？

設定 `clipChildren = true` 會將一般子繪圖裁剪至 entity 的 `[0,0]–[width,height]` 範圍。這就是 `ScrollView` 實作溢位的方式。CanvasRenderer 和 SVGRenderer 保留轉換後的裁剪。ThreeRenderer 使用裁剪的轉換後世界 AABB 來交集剪刀矩形，因此旋轉/傾斜的裁剪是軸對齊的近似。提升到獨立 WebGL point 層和 WebGPU 粒子疊加層的基本體不會被父渲染器的裁剪堆疊裁剪。

### `a11yFullViewport` 是什麼？

通常只有在 `entity.interactive && entity.width > 0` 時才會投射陰影 DOM 節點。對於覆蓋整個 Scene 視口的 entity（無限畫布圖形、全螢幕手勢辨識器），沒有意義的包圍盒。設定 `a11yFullViewport = true` 會在所有其他陰影節點後面建立一個場景大小的陰影節點；然後投射根將該邏輯範圍映射到 canvas CSS 範圍。

### 我的 `Entity.update()` 動畫速度是預期的兩倍 — 為什麼？

> [!CAUTION] > `Entity.update(dt, time)` 接收的 **dt 以毫秒為單位**，而非秒。這是最常見的 VectoJS 陷阱。60 fps 時的 `dt` ≈ 16.7，而非 0.017。

從使用秒的物理函式庫移植時常見的錯誤：

```typescript
// 錯誤：將毫秒視為秒 → 快 1000 倍
this.x += velocity * dt;

// 正確：轉換為秒，或使用毫秒單位
this.x += velocity * (dt / 1000);
```

Spring physics（`SpringPhysics`、`ScrollView`）內部使用 `dt / 1000` 在執行模擬前進行轉換。

### `emit()` 和 `dispatchEvent()` 有什麼區別？

- `entity.emit(event, payload)` — 僅觸發 entity 自身的 **bubble 階段**監聽器。沒有樹遍歷。這是元件內部的路徑（例如，表單控制項發射自身的 `change`）。
- `entity.dispatchEvent(event)` — 執行完整的類似 DOM 的 **capture + bubble** 遍歷：capture 從根到目標，bubble 從目標到根。這就是 `Scene` 分發指標事件的方式。

---

## 自訂與動畫

### VectoJS 的自訂能力有多強 — 可以實現開機畫面或轉場效果嗎？

可以。每個可動畫屬性（`x`、`y`、`scaleX`、`scaleY`、`rotation`、`opacity`）都可以由 `TweenDriver`（基於曲線，來自內建 `Easing` 集合或自訂函式）或 `SpringDriver`（物理，具有可設定的 `stiffness`/`damping`/`mass`）驅動。對於粒子密集型效果，`ComputeParticleEntity` 搭配 `particleBackend: 'webgpu'` 執行一個計算著色器，具有彈簧回原點力、滑鼠排斥、速度限制、邊界反彈以及一個專用的**爆炸力**參數（`triggerExplosion(x, y, force)`）— 爆發/飛濺效果是一等公民基本體，而非您需要用 tween 偽造的東西。當 WebGPU 不可用時，CPU 回退（`updateCPU`）鏡像相同的力模型。

### `Entity` 的形狀如何定義 — 可以是五邊形、橢圓、不規則多邊形嗎？

可以，形狀實際上是兩個獨立、可覆寫的關注點：

- **視覺形狀**：`render(renderer)` 透過 `IRenderer` 的向量路徑基本體（`moveTo`、`lineTo`、`bezierCurveTo`、`arc`、`closePath`）繪製 — 與手寫 Canvas2D/SVG 路徑使用相同的基本體，因此任何多邊形、橢圓或曲線輪廓都是可繪製的。`SplineEntity` 是內建範例：它透過將任意三次多項式曲線轉換為 Bézier 區段來渲染。
- **點擊測試形狀**：`isPointInside(globalX, globalY): boolean` 在基底 `Entity` 類別上是 `abstract` 的 — 每個具體 entity 提供自己的邏輯。沒有任何東西要求（或預設為）軸對齊包圍盒；五邊形的 `isPointInside` 可以進行真正的點在多邊形內計算，橢圓可以進行二次形式檢查等。

因為兩者是獨立的方法，形狀的可點擊區域不必與其繪製的輪廓完全匹配（對於小形狀上的寬鬆觸控目標很有用）。

### 文字和元件是否適應不同的裝置和瀏覽器縮放級別？文字縮放是否完全自適應？

機制是存在的，但它是顯式的，而非自動預設：

- **HiDPI**：`CanvasRenderer` 在建構和 `resize()` 時讀取 `window.devicePixelRatio`，相應地縮放 canvas 備用儲存區 — Retina/HiDPI 顯示器無需額外的應用程式程式碼即可呈現清晰。
- **瀏覽器縮放**：大多數瀏覽器在縮放時會改變有效的 `devicePixelRatio` 並觸發 `window` `resize` 事件，`Scene` 已經監聽此事件並透過呼叫渲染器的 `resize()` 來回應。
- **文字重排**：`LayoutEngine.setMaxWidth()` 專門設計為此目的的廉價「熱路徑」 — 它重用上次冷 `prepare()` 傳遞中快取、已測量的 `PreparedText`，僅重新進行斷行，不重新分段或重新測量。從您自己的調整大小處理常式中呼叫它，以在任何新寬度下廉價地重排文字。

因此：適應性、調整大小廉價的版面基本體存在並在內部由 UI 元件使用，但原始的、自訂的 `Entity` 不會「免費」重排 — 您自己將調整大小處理常式連接到相關的 `setMaxWidth`/layout 呼叫，就像在任何 immediate-mode 渲染器中連接 canvas resize 一樣。

### VectoJS 的動畫模型與 CSS 動畫有何不同？所有內容都是在渲染前預先計算的嗎？

不是 — 沒有什麼是預先烘焙到關鍵影格中的。`TweenDriver.tick(dtMs)` 和 `SpringDriver.tick(dtMs)` 是即時積分器：每幀，它們從自上一幀以來的**實際**經過時間推進，而不是從預先計算的時間線。`SpringPhysics`（`SpringDriver` 背後的引擎）在固定的子步長中進行即時尤拉積分，並對後臺分頁在返回時可能提供的大 `dt` 進行穩定性限制。

實際差異在於當您在中途更改動畫目標時：spring 上的 `driver.retarget(to)` 保留當前值和速度，並平穩地繼續朝新目標積分 — 沒有跳躍，沒有重新啟動。CSS transition/animation 在其目標中途變更時通常會重新啟動或跳躍，因為它沿著預定的曲線進行插值，而不是逐幀模擬物理。

### 如何停用元件上的預設 spring/inertia 動畫，或將它們更改為標準轉場？

預設情況下，VectoJS 可捲動元件（如 `ScrollView` 和 `VirtualList`）和屬性使用基於彈簧的物理（`'spring'`）以實現平滑轉場。如果您想停用這些動畫以獲得更快、即時的行為，或將它們切換為標準的 cubic-bezier 轉場（如 `easeOutCubic`），您有三種主要方法：

#### 1. 更改目標 Entity 上的轉場配置

每個 `Entity` 都公開一個 `setTransition` 方法。您可以透過在目標元素上呼叫 `setTransition` 並使用自訂 `duration`（毫秒）和 `easing` 函式來覆蓋預設的 spring 轉場，或完全停用：

```typescript
// 更改為快速、無彈跳的轉場（如 easeOutCubic）
entity.setTransition({
  y: { duration: 120, easing: 'easeOutCubic' },
});

// 完全停用動畫（即時跳躍）
entity.setTransition({
  y: null, // 清除轉場驅動器
});
```

#### 2. 立即跳躍位置而不觸發 Spring

如果您想立即移動 entity 而不觸發任何已設定的轉場（完全繞過 spring），請使用 `setImmediate` 方法：

```typescript
// 立即跳躍到目標位置
entity.setImmediate('y', targetY);
```

#### 3. 繞過 Canvas Physics 以實現行動滾動

對於行動用戶期望原生動量滾動而非 Canvas 模擬彈簧的全螢幕頁面，將觸控手勢轉發到瀏覽器視口：

1. 將觸控監聽器綁定到 Canvas，將觸控拖曳增量轉換為原生 window 滾動：

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

2. 監聽 `window` `"scroll"` 事件，並使用 `setImmediate` 或快速緩動轉場將滾動位置同步到渲染容器：

   ```typescript
   window.addEventListener('scroll', () => {
     mainScroll.y = -window.scrollY; // 或 mainScroll.setImmediate('y', -window.scrollY);
   });
   ```

---

## UI 元件與 Devtools

### devtools 提供了什麼，對除錯有什麼幫助？

`@vectojs/devtools` 是一個頁面內檢查器 — 一個面板（本身使用 VectoJS 渲染），為您提供：

- Virtual Math Tree 的即時樹狀檢視，帶有 entity 型別、幾何和活躍動畫的徽章
- 一次性 entity 選取（點擊 canvas 上的 entity 以在樹中選取）
- 全域變換讀取值（經過完整祖先鏈後實際計算的位置、縮放、旋轉）
- 所選 entity 的鍵盤微調編輯
- 主機頁面疊加層高亮，顯示所選 entity 的世界範圍

`Scene` 公開唯讀的 `rootEntity`/`overlayRootEntity` 存取器，專門讓此類工具可以遍歷樹，而無需特權內部存取。

### 使用 VectoJS 的原生 UI 元件時應注意什麼？

直接從審計元件集得出的幾個值得了解的模式：

- **`entity.id` 的唯一性是您的責任。** 引擎不強制執行此操作。它對於無障礙投射（`Scene` 使用 entity id 作為陰影 DOM 節點的鍵）以及任何您自己按 id 索引 entity 的程式碼（例如 `SpatialHashGrid`）最為重要 — 選擇 id 的方式與在 `Map` 中選擇鍵的方式相同。
- **附加監聽器到另一個 entity 的元件必須呼叫 `destroy()`。** `Tooltip`、`Popover` 以及類似的「附加到目標」元件儲存其處理常式並在 `destroy()` 中移除 — 使用完元件後務必呼叫它，就像移除手動新增的監聽器一樣。
- **`interactive = true` 不是免費的。** 設定它會為該 entity 投射一個真實的陰影 DOM 節點。這對於按鈕、連結和表單控制項來說沒問題；避免在非常大的葉節點集合上使用。例如，`GridTextEntity` 明確停用整個網格的 `interactive`，正是為了避免在規模上為每個字元投射陰影節點。
- **自訂基於拖曳的元件應遵循內建的指標捕獲模式。** `Slider` 等元件在 `pointerdown` 時呼叫 `setPointerCapture()`（透過其 a11y 投射的元素），這使得超出元件視覺範圍的快速拖曳能繼續正確追蹤。如果您建立自己的可拖曳元件，請遵循相同模式，而不是僅依賴 `pointermove`/`pointerleave`。將 `pointercancel` 作為回退路徑處理，以便瀏覽器中斷不會留下活躍的拖曳或選取事務。

---

## 無障礙與自動化

### 如何讓元件與 Playwright 的 `page.getByRole()` 相容？

從 `getA11yAttributes()` 回傳正確的標籤和角色：

```typescript
// 可存取的按鈕
getA11yAttributes() { return { tag: 'button', role: 'button', label: 'Send' }; }

// 可存取的連結
getA11yAttributes() { return { tag: 'a', role: 'link', label: 'Home', href: '/' }; }

// 可存取的文字欄位
getA11yAttributes() { return { tag: 'input', inputType: 'text', placeholder: 'Search…' }; }
```

內建元件（`Button`、`Input`、`Link` 等）會自動執行此操作。

### 陰影節點位置看起來不對 — entity 偏移了

兩個常見原因：

1. **canvas 父元素沒有 `position: relative`** — `Scene` 在每幀上自動強制執行此設定，但如果另一個 CSS 規則在場景啟動後強制設定 `position: static`，則絕對定位的陰影節點將相對於錯誤的包含區塊偏移。
2. **`a11yOffsetX` / `a11yOffsetY`** — 如果您之前設定過這些作為解決方法，請先嘗試移除它們，看看底層定位是否實際正確。

在 `SceneOptions` 中啟用 `debugA11y: true` 以查看每個陰影節點上半透明的亮顯範圍：

```typescript
const scene = new Scene(canvas, { debugA11y: true });
```

---

## WebGPU 粒子

### `ComputeParticleEntity` 沒有顯示任何內容 — 出了什麼問題？

最常見的原因：

1. **未呼叫 `initRandomParticles()`** — 未初始化粒子資料時，所有位置都是 `(0,0)`，大小都是 `0`。
2. **WebGPU 不可用** — 場景會記錄失敗的 WebGPU 請求並回退到 CPU/Canvas2D 路徑；請確保設定了 `particleBackend: 'webgpu'` 且您的瀏覽器支援 WebGPU。
3. **canvas 大小為 `0×0`** — 在第一幀之前呼叫 `scene.resize(w, h)`（或確保 canvas 有尺寸）。

### CPU 回退如何運作？

當 WebGPU 不可用（或失敗）時，`Scene` 在每個渲染幀呼叫 `entity.updateCPU(dt, mouseX, mouseY, width, height)` 並透過 `fillCircle` 繪製粒子。回退鏡像彈簧/排斥/爆炸/速度/反彈模型，但 CPU/GPU 數值路徑和吞吐量不保證相同。請根據目標裝置上的測量結果選擇粒子數量。

### 我可以從 GPU 讀回粒子位置嗎？

不能直接讀取 — 粒子狀態存在於 WebGPU 儲存緩衝區中。要讀回它，您需要發出 `copyBufferToBuffer` + `mapAsync` 往返，這會阻塞 GPU 管線。相反，如果您需要在 CPU 上取得位置，請保持 CPU 端的 `particleData` Float32Array 同步。`setOrigins()`、`setPositions()` 和 `setVelocities()` 寫入 `particleData` 並設定 `needsInit = true`，這會在下一幀上傳到 GPU 儲存緩衝區。

> [!NOTE] > `mapAsync` + `copyBufferToBuffer` 回讀故意阻塞管線。對於大規模的碰撞檢測或空間查詢，請在 CPU 路徑上使用 `SpatialHashGrid`，或將它們表示為額外的 WebGPU 計算傳遞。

---

## 疑難排解

### `Scene` 正在執行但畫面上沒有顯示任何內容

依序檢查：

1. 是否呼叫了 `scene.start()`？
2. canvas 是否有非零的 `width` 和 `height` CSS 和 HTML 屬性？
3. entity 是否透過 `scene.add(entity)` 新增到場景中（而不僅僅是建構）？
4. entity 的 `render()` 方法是否實際呼叫了 `renderer.fill()` 或 `renderer.stroke()`？空的 `render()` 不會繪製任何內容。
5. `entity.opacity` 是否大於 0？

### 我的滾輪事件沒有到達 `ScrollView`

`ScrollView` 在 `wheel` 事件上呼叫 `e.preventDefault()` 以防止頁面滾動。如果陰影節點的滾輪監聽器觸發但滾動視圖沒有反應，請確認使用了 `ScrollView.add(child)`（而不是直接使用 `entity.add(child)` 繞過內容包裝器），並且 canvas 父元素沒有 `overflow: hidden` 阻擋指標事件。

### TypeScript 報告 `Cannot find name 'GPUDevice'`

將 `@webgpu/types` 新增到您的專案中：

```bash
bun add -d @webgpu/types
```

然後在 `tsconfig.json` 中新增：

```json
{ "compilerOptions": { "types": ["@webgpu/types"] } }
```
