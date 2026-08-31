+++
title = "14 — 響應式布局與互動 — 適配視埠與輸入"
description = "視埠作為約束：重設大小/縮放重排、Stack/Flow 布局遍歷、面板儀表板、VirtualList 開窗、ScrollView 物理、ResizablePanel 手柄、覆蓋層放置與懸停/焦點狀態 — 皆在 VectoJS 的畫布原生世界中。"
weight = 34
+++

# 14 — 響應式布局與互動 — 適配視埠與輸入

> 在 DOM 瀏覽器中，響應式布局是 CSS：媒體查詢、flexbox、grid 與滾動容器，引擎免費提供。在 VectoJS 中，沒有 CSS 引擎 — 每個像素皆是單一 `<canvas>` 上保留實體樹的算術。視埠僅為另一個使快取失效的數字，滾動偏移是以彈簧驅動的 `y`，覆蓋層是具明確放置計算而重設父節點至 `overlayRoot` 的實體。本文件說明當視窗重設大小、使用者縮放或手指拖曳面板分隔線時，這些數字如何保持一致。

- **你將學到**：`Scene.resize()` 如何經渲染器後備儲存、投射層與布局遍歷傳播視埠變更；`Stack`/`Flow`/`Card`/`PanelGroup` 如何在無 CSS 引擎的情況下組成響應式儀表板；`VirtualList` 如何將 10k 列開窗為約 15 個已掛載實體；`ScrollView` 彈簧物理、`ResizablePanel` 拖曳手柄、`Overlay` 放置翻轉與 `Button` 懸停/焦點環如何閉合互動迴圈 — 皆附 file:line 憑據。
- **你不會學到**：VMT 生命週期/dirty/事件分發（Boss 06）、文字塑形與斷行（Boss 02）、語意投射（Boss 03）或串流 Markdown 差分（Boss 04）。

## 1. 視埠是約束而非容器

### 1.1 Scene.resize() — 單一真值來源

`Scene.resize(width, height)` 於 `packages/core/src/tree/Scene.ts:6381` 為視埠邊界：

```ts
public resize(width: number, height: number): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0) {
    if (!this.hasWarnedInvalidResize) console.warn(`...`); return;
  }
  this.width = width; this.height = height;
  this.contentFontEpoch++; this.contentViewportEpoch++;
  (this.renderer as any).resize(width, height);
  if (this.pointRenderer) { this.pointRenderer.resize(width, height); }
  if (this.gpuCanvas) this.sizeGpuCanvas(this.gpuCanvas, width, height);
  this.markDirty();
}
```

五件事原子發生：邏輯 `width`/`height` 更新、兩個世代計數器遞增、每個後備儲存重設大小、影格被標髒。世代計數器為關鍵 — `contentFontEpoch` 強制文字重校準（瀏覽器縮放即使在相同 CSS 字型下亦改變 Range 幾何），`contentViewportEpoch` 在不移動任何區塊的情況下重分層每個內容區塊（`Scene.ts:6415`，`Scene.ts:6420`）。僅改變 `width`/`height` 的重設大小將使每個區塊持有為舊視埠建構的 DOM。

無效尺寸被拒絕而非箝制（`Scene.ts:6382`）：在畫布元素箝制至 `0` 時儲存 `-10` 將使剔除與 a11y 幾何不一致。警告被閂鎖（`Scene.ts:2113` 處的 `hasWarnedInvalidResize`），因為 `ResizeObserver` 驅動的呼叫者會在每個拖曳影格中濫發。

### 1.2 誰呼叫 resize()

兩條路徑，按 `disableWindowResize`（`Scene.ts:268`，`Scene.ts:2051`）區分：

| 模式                                           | 觀測器                                                                              | 處理器                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 填滿視窗（`disableWindowResize: false`，預設） | `window` `resize` 監聽器（`Scene.ts:2968`）+ DPR 媒體查詢/監看器（`Scene.ts:3052`） | `resize(window.innerWidth, window.innerHeight)`             |
| 嵌入（`disableWindowResize: true`）            | `canvas` 上的 `ResizeObserver`（`Scene.ts:3082`）                                   | `resize(entry.contentRect.width, entry.contentRect.height)` |

加上明確由呼叫者驅動的 `scene.resize(w, h)` 供自訂容器 — 當 `ResizeObserver` 不可用時（`Scene.ts:2740` 守衛）的唯一路徑。DPR 縮放為正交：`maxDPR`（`Scene.ts:287`）限制後備儲存倍數，因此 DPR 為 3 的顯示器以 2 倍而非 3 倍渲染（`logical size × dpr²` 成本，`Scene.ts:276`）。

### 1.3 縮放即重設大小

瀏覽器縮放觸發 `window.resize` 並改變 `devicePixelRatio`。Scene 的 DPR 監看器（`Scene.ts:1435` `dprMediaQuery`，`Scene.ts:1441` `dprPollInterval`）重呼叫 `resize(this.width, this.height)` — 相同邏輯尺寸、新後備儲存縮放 — 該路徑中的 `contentFontEpoch++` 處理 Firefox 小數縮放上的 Range 幾何漂移（`Scene.ts:6410` 註解）。

## 2. 布局容器 — 自堆疊至儀表板

### 2.1 Stack — 原語

`Stack` 於 `packages/ui/src/Stack.ts:59` 為 VectoJS 的 flexbox：在一個軸上循序、交叉軸 `align: 'start'|'center'|'end'`（`Stack.ts:17`）、`gap`（`Stack.ts:14`）、可選的 `wrap` 搭配 `maxWidth`/`maxHeight`（`Stack.ts:19`）與供填滿剩餘布局的 `fillTarget`（`Stack.ts:42`）。

`layout()` 於 `Stack.ts:303` 為兩遍演算法：

- **第 1 遍 — 分組**（`Stack.ts:325`）：當 `wrap` 為 true 時，沿主軸掃描子節點，每當 `currentMain + gap + childMain > limit` 即切出新行。否則一行容納所有子節點。
- **第 1.5 遍 — 填滿**（`Stack.ts:349`）：當 `fillTarget` 已設定且 wrap 關閉時，拉伸最後子節點使 `children + gaps == fillTarget` — 以下限為內容尺寸，永不縮小。
- **第 2 遍 — 放置**（`Stack.ts:371`）：對每行計算 `lineCross`/`lineMain`，然後以交叉軸對齊偏移指派 `x`/`y`（`Stack.ts:388`）。

`Stack` 為純結構容器 — `render()` 不繪製任何內容（`Stack.ts:443`），僅其子節點繪製。其自身的 `width`/`height` 按布局後內容定尺，啟用剔除。`getLayoutControlledProperties()` 於 `Stack.ts:163` 回傳 `['x','y']` — 對子節點的寫入在下次布局時還原。

兩個 `O(1)` 快速路徑避免串流附加上的 `O(n)` 完整布局（`Stack.ts:167` `add()`，`Stack.ts:257` `appendFastWrap()`）：

- `appendFast()`（`Stack.ts:231`）— 非 wrap、`align: 'start'`：將單一新子節點置於 `height + gap`（垂直）或 `width + gap`（水平）並增長容器的交叉尺寸。在起始對齊下先前子節點不受影響。
- `appendFastWrap()`（`Stack.ts:257`）— wrap + `align: 'start'`：置於目前行或開始新行，僅使用最後行狀態的四個純量（`Stack.ts:95` `wrapLineMain/Cross/PriorCross/MaxMain`），永不重走訪。

兩者在 `align !== 'start'`、`fillTarget` 已設定或 `fastAppendDirty`（由 `Stack.ts:184` 處的 `remove()` 設定）時退回 `layout()`。

對於無 `add()`/`remove()` 而增長的串流文字，`resizeLastChild(child)` 於 `Stack.ts:210` 以 `height = child.y + child.height` / `width = max(width, child.width)` 處理原地最後子節點增長 — 僅當子節點的交叉尺寸增長而非縮小時有效。

### 2.2 Flow — 免費的晶片列

`Flow` 於 `packages/ui/src/Flow.ts:19` 為一行：

```ts
export class Flow extends Stack {
  constructor(opts: FlowOptions = {}) {
    super({ ...opts, direction: opts.direction ?? 'horizontal', wrap: true });
  }
}
```

### 2.3 Card — 圓角面板

`Card` 於 `packages/ui/src/Card.ts:49` 為固定尺寸的圓角盒（`Card.ts:123` `roundRect` + `fill`/`stroke`）。具 `label` 時投射 `role="group"`（`Card.ts:81`）；具 `onClick` 時成為可點擊 — 要求 `label` 使 a11y 投射恆取得可存取名稱（否則 `Card.ts:71` 拋出，`vectojs-docs/forge/findings/ui-components.md:43` 起源）。`setContent(entity, fit?)` 於 `Card.ts:92` 鏡像 `Panel.setContent` — 預設內容經 `update()`（`Card.ts:118`）追蹤卡片的 `width`/`height`。

### 2.4 PanelGroup — 儀表板格子

`PanelGroup` 於 `packages/ui/src/ResizablePanel.ts:213` 以可拖曳的 `PanelResizeHandle` 分隔線在 `Panel` 子節點間分割可用空間：

```text
PanelGroup { direction, width, height }
  ├── Panel { minSize, defaultSize, clipChildren: true }  — setContent(entity, fit?)
  ├── PanelResizeHandle { width: handleSize, interactive: true }  — 拖曳增量 → _onResize
  ├── Panel
  └── ...
```

`addPanel()` 於 `ResizablePanel.ts:237` 在每個第一個後面板前自動插入手柄（`ResizablePanel.ts:239` `new PanelResizeHandle`）。`resize(w, h)` 於 `ResizablePanel.ts:258` 按比例重分配尺寸（`ResizablePanel.ts:267` `(size / basis) * avail`）然後正規化（`ResizablePanel.ts:309` 箝制至 `minSize`/`avail`）。`_layout()` 於 `ResizablePanel.ts:343` 交替指派面板與手柄的 `x/y/width/height` — 水平群組的面板為 `width = sizes[i], height = cross`；手柄為 `width = handleSize, height = cross`。

`Panel.setContent()` 於 `ResizablePanel.ts:164` 預設保持內容按面板盒定尺（`fit: true`，`ResizablePanel.ts:7` `FitContentOptions`），自 `Panel.update()`（`ResizablePanel.ts:190`）每影格重套用 — 必要因為 `Entity.width/height` 為無 setter 鉤子的純欄位（`ResizablePanel.ts:158` 契約註記，`vectojs-docs/forge/findings/ui-components.md:15` 起源，於 `@vectojs/ui@1.11.0` 修正）。

`PanelGroup` 巢狀可組合：作為 `Panel` 內容的 `PanelGroup`（`Panel.setContent(innerGroup)`）產生巢狀分割 — 內部群組的 `update()` 使其保持按外部面板定尺，無需額外連接。

## 3. VirtualList — 將 10k 列開窗為約 15 個實體

### 3.1 Fenwick 脊柱

`RowHeights` 於 `packages/ui/src/VirtualList.ts:14` 為 Fenwick（二進位索引）樹，覆於每列高度（`VirtualList.ts:17` 大小 `n+1` 的 `Float64Array`）：

- `total()`（`VirtualList.ts:46`）— `O(1)` 的所有列高度總和。
- `prefix(i)`（`VirtualList.ts:60`）— `O(log n)` 的列 `i` 頂部 y。
- `indexAt(y)`（`VirtualList.ts:71`）— `O(log n)` 的底部超過 `y` 的首列，經二進位提升。
- `set(i, h)`（`VirtualList.ts:51`）— `O(log n)` 的點更新並附增量傳播。

每列始於 `estimatedRowHeight`（`VirtualList.ts:28`）；`set()` 在列掛載並被度量時替換估計。

### 3.2 調和 — 僅可見視窗

`VirtualList` 於 `VirtualList.ts:179` 保持 `this._pool: Map<number, Entity>`（`VirtualList.ts:203`）— 每已掛載列索引一個實體，而非每資料項一個。

`_visibleRange()` 於 `VirtualList.ts:468` 經兩次 `indexAt` 呼叫自 `_scrollY` 與 `height` 推導 `[start, end]`（含兩端），並在兩端以 `overscan`（預設 3，`VirtualList.ts:103`）擴展。`_reconcile()` 於 `VirtualList.ts:488`：

1. 回收超出範圍的實體（`VirtualList.ts:494` `super.remove` + `delete`）。
2. 掛載新可見列（`VirtualList.ts:506` `renderItem(item, i)`，`super.add`）。
3. 掛載後度量（`VirtualList.ts:515` 定位前先 `_measureMountedRows` — 在放置前讀取 `heightOf(i)` 防止 PR #509 前的一影格陳舊偏移）。
4. 定位 `y = rowTop(s) + ... - _scrollY`（`VirtualList.ts:518`）。

`VirtualList.scrollToIndex(i)` / `scrollToTop/Bottom` / `jumpToBottom` 於 `VirtualList.ts:342` 重定向 `_targetY`/`_scrollY`；`jumpToBottom` 瞬間吸附（零速度），適用於每塊皆重定向積分器而永不使其穩定的串流轉錄。

### 3.3 增長、識別與錨定

無 `keyForItem` 時，`VirtualList.ts:248` 處的 `setItems()` 清除高度快取並跳至頂部 — 對被替換的列表正確，對增長的轉錄則錯誤。具 `keyForItem`（`VirtualList.ts:117`）時：

- `_heightByKey: Map<string, number>`（`VirtualList.ts:199`）在 `setItems` 後存活 — 已度量高度為列的屬性而非其索引（樹重建後自快取重播種，`VirtualList.ts:272`）。
- `VirtualList.ts:317` 處的 `_rekeyPool()` 在任何高度讀取前將池化實體移至其新索引 — 無此則前置會以錯誤高度覆寫每個條目。
- 捲動錨定（`VirtualList.ts:397` `_captureAnchor` / `VirtualList.ts:431` `_restoreAnchor`）：兩個變體 — `bottom`（至底距離，保留間隙）當 `nearBottom`（每捲動閂鎖於 `VirtualList.ts:219`），`item`（錨定列鍵 + 內部偏移）否則。改變每列高度的重設大小使錨定列視覺上仍保持。

`VirtualList.ts:540` 處的 `_measureMountedRows()` 每影格輪詢每個已掛載列的 `height`，經 `Fenwick.set` 套用增量並錨定 — 處理掛載後重設大小的列（串流 Markdown 重排、直接 `height` 指派）而無需任何 setter 鉤子。

## 4. ScrollView — 一個視埠，一個彈簧

`ScrollView` 於 `packages/ui/src/ScrollView.ts:58` 為非虛擬化的對應物：一個裁剪的視埠（`ScrollView.ts:71` `clipChildren = true`），其內部 `content` 實體經共用彈簧系統在 `y` 上滑動（`ScrollView.ts:90` `content.setTransition({ y: scrollPhysics ?? 'spring' })`）。

- **滾輪**（`ScrollView.ts:92`）：`deltaMode` 轉換（`ScrollView.ts:105` 像素/行×16/頁×視埠）、`targetY -= delta`、箝制、`content.y = targetY` 重定向彈簧並保留速度。Ctrl+滾輪退出以讓瀏覽器縮放；容納得下的內容（`maxScroll <= 0`）退出以避免死帶（`ScrollView.ts:95`，修正 #525）。
- **指標拖曳**（`ScrollView.ts:113`）：經 `localY` 增量的 1:1 手指追蹤。
- **箝制**（`ScrollView.ts:136`）經 `clampTarget()` 保持 `targetY ∈ [-maxScroll, 0]`。`ScrollView.ts:219` 處的 `update()` 防禦性重箝制，僅當箝制實際移動時才重指派 `content.y` — 無條件重指派將永遠產生虛假的完成 driver，擊破閒置節流（`ScrollView.ts:217` 註解）。
- **`scrollToBottom()`**（`ScrollView.ts:163`）經 `jumpTo()`（`ScrollView.ts:79` `setImmediate('y', y)`）吸附而非重定向彈簧 — 串流聊天的呼叫者每秒多次呼叫它，快速重定向的彈簧永不穩定並抖動。
- **`DOCUMENT_SCROLL_PHYSICS`** 於 `ScrollView.ts:36`（`{ stiffness: 180, damping: 27 }`，ζ ≈ 1.006，`vectojs-docs/forge/findings/ui-components.md:241` 起源）為文件捲動的臨界阻尼預設；預設（`stiffness: 180, damping: 12`，ζ ≈ 0.447）過衝約 20% 並彈跳 — 在列表上活潑，在文件上錯誤。
- **內容增長**（`ScrollView.ts:233` `driveVirtualizableContent`）：每影格輪詢子節點範圍並在不同時經 `updateContentSize()` 重同步 — 處理無 `add()`/`remove()` 的串流 `setSpans` 增長。`ScrollVirtualizable.setVisibleRange`（`ScrollView.ts:50` 鴨子型別）同影格為開窗內容驅動。

## 5. 互動原語

### 5.1 ResizablePanel 手柄 — 場景空間增量

`PanelResizeHandle` 於 `packages/ui/src/ResizablePanel.ts:42` 以**場景空間**度量拖曳增量（`ResizablePanel.ts:86` `posOf` 偏好 `sceneX`/`sceneY` 而非 `localX`/`localY`）。手柄隨其重設大小的面板移動，因此當面板增長、手柄在游標下滑動時局部座標幾乎不變 — 場景座標穩定，因此 1px 移動 = 1px 重設大小（`ResizablePanel.ts:78` 註解，`vectojs-docs/forge/findings/ui-components.md:64` 起源，於 `@vectojs/ui@1.1.3` 修正）。`hover` 交換 `color` → `hoverColor`；手柄為具 `pointerdown`/`pointermove`/`pointerup`/`pointerleave` 連接的 `interactive: true`（`ResizablePanel.ts:92`）。

### 5.2 Overlay — 樹上方的浮動內容

`Overlay` 於 `packages/ui/src/Overlay.ts:37` 為 `Tooltip`、`Popover`、`ContextMenu` 的基底：

- 掛載至 `scene.overlayRoot`（`Overlay.ts:168` `scene.overlayRoot.add(this)`）— 高於 `clipChildren`，恆在最上層。
- 放置（`Overlay.ts:14` `OverlayPlacement`：`top|bottom|left|right|auto` 加上 `-start/-end` 變體）於 `Overlay.ts:171` 的 `_position()` 中自 `target.getWorldBounds()` + `placement` + `offset`（預設 6，`Overlay.ts:23`）計算，然後經 `Overlay.ts:227` 的 `_placeAt()` 箝制至 `4px` 視埠邊距。`auto` 按下方 vs 上方可用空間翻轉（`Overlay.ts:180`）。
- `Overlay.ts:98` 處的 `showAtPoint(x, y, source?)` 接受可選 `source`（Scene 或已掛載 Entity）以在覆蓋層自身從未掛載時解析 `scene` — 否則首次呼叫時靜默無操作（`vectojs-docs/forge/findings/ui-components.md:114` 起源，於 `@vectojs/ui@1.10.0` 修正）。
- 經 `opacity/scaleX/scaleY` 上的 `setTransition` 進入（`Overlay.ts:59` `easeOutQuad` + 彈簧）與 `a11yHidden`/`interactive` 切換，後者自指標命中測試與 a11y 投射隱藏子樹（`Overlay.ts:149` `hide()` 亦呼叫 `detachA11y`）。
- `Modal` 於 `packages/ui/src/Modal.ts:25` 建構於此：一個全視埠背景（`Modal.ts:40` `width = window.innerWidth`，`Modal.ts:39` `a11yFullViewport = true`）搭配一個經 `card.scaleX/scaleY` 彈入的置中 `Card`（`Modal.ts:84` 種子 0，`Modal.ts:266` `springTo({scaleX:1,scaleY:1})`）、焦點陷阱與 Escape 處理（`Modal.ts:188` `installFocusTrap`）以及在 `scene.hideOverlay(this)` 與焦點還原前淡出的 `Modal.ts:282` 處 `close()`。

### 5.3 懸停 / 焦點 — 畫布回饋迴圈

畫布無 `:hover` 或 `:focus-visible`。VectoJS 自 Scene 重分發至 VMT 的 a11y 投射事件驅動它們：

- **懸停** — `packages/ui/src/Button.ts:97` 處的 `Button` `on('hover')` / `on('pointerleave')` 切換 `hovered` → 以 `hoverBg` 重繪（`Button.ts:11` 選項），受 `disabled` 門控使停用的可供性永不呈現活躍。`PanelResizeHandle` 在 `ResizablePanel.ts:111` 對 `hoverColor` 做同樣的事。
- **焦點環** — `packages/ui/src/Button.ts:61` 處的 `Button.focused` 描邊 2px `focusColor` 環（`Button.ts:30` 預設 `#00f0ff`）。旗標自當 a11y 元素聚焦時 Scene 發射的陰影 `<button>` 上的真實 DOM `focus`/`blur` 驅動 — 無此則畫布環對鍵盤使用者永不出現。
- **游標閃爍** — `packages/ui/src/UIComponent.ts:84` 處的 `UIComponent.startCaretBlinkWake()` 排程 500 ms 喚醒（於下一階段邊界 `markDirty`），使閒置的 `onDemand` 場景仍閃爍 `Input`/`TextArea` 中的游標 — 每階段一個逾時，聚焦時成本約 2 次渲染/秒（`UIComponent.ts:76` 註解），vs 以全速率固定場景。
- **焦點陷阱** — `Modal`（`Modal.ts:188`）與 `Overlay` 的隱藏/顯示保持 `a11yHidden` 與 `interactive` 同步，使隱藏 popover 的按鈕不保持 Tab 可達（`vectojs-docs/forge/findings/ui-components.md:391` 起源，於 2026-08-13 P2 批次修正）。

一般規則：瀏覽器將自 CSS 偽類別推導的每個視覺狀態，必須自 a11y 投射的即時 DOM 事件明確驅動，每次隱藏必須同時丟棄視覺與投射。

## 6. 無 CSS 引擎的響應式模式

### 6.1 應用外殼的重設大小級聯

```ts
// 一個這樣的處理器擁有整個響應式級聯：
window.addEventListener('resize', () => {
  const w = window.innerWidth,
    h = window.innerHeight;
  scene.resize(w, h);
  header.width = w;
  header.layout();
  sidebar.height = h - header.height;
  sidebar.layout();
  contentGroup.resize(w - sidebar.width, h - header.height);
});
```

每個 `resize()` 遞增兩個世代計數器，每個後備儲存重縮放，`Stack`/`Flow` 在下次 `layout()` 上重分組，`PanelGroup.resize()` 重分配，`VirtualList` 箝制 `_targetY`（`VirtualList.ts:566` `_clamp`）。無媒體查詢引擎 — 應用程式決定斷點並呼叫 API。

### 6.2 面板儀表板 — 巢狀分割

`PanelGroup` 巢狀（`ResizablePanel.ts:206` 文件）為慣用的 IDE/編輯器外殼：

```ts
const outer = new PanelGroup({ direction: 'horizontal', width: W, height: H });
const sidebar = new Panel({ minSize: 160, defaultSize: 0.2 });
const editorGroup = new Panel({ minSize: 300 }); // 承載內部垂直分割

const inner = new PanelGroup({ direction: 'vertical', width: 0, height: 0 });
inner.addPanel(new Panel({ defaultSize: 0.6 })); // 編輯器
inner.addPanel(new Panel({ minSize: 120 })); // 終端機
editorGroup.setContent(inner); // ← Panel.setContent 保持內部定尺

outer.addPanel(sidebar).addPanel(editorGroup);
scene.add(outer);
// 視窗重設大小時：outer.resize(newW, newH) — 內部經 Panel.update() 跟隨。
```

`PanelGroup.resize()` 的比例縮放（`ResizablePanel.ts:265`）處理外部群組；內部群組經 `Panel.update()` 的 fit 同步重布局，無需明確的內部 `resize()` 呼叫。

### 6.3 ScrollView vs VirtualList — 何時開窗

| 需求                      | 使用                                                              | 原因                                                                            |
| ------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 文件 / 聊天轉錄，無界高度 | `ScrollView` + `Stack`                                            | 簡單、具彈簧動畫、內容增長輪詢處理串流                                          |
| 具 100+ 均勻列的長列表    | `VirtualList`                                                     | 僅掛載約 15 個實體，Fenwick 捲動數學 `O(log n)`，高度在具鍵的 `setItems` 後存活 |
| 具可變列高度的長列表      | `VirtualList` + `estimatedRowHeight`                              | 首次掛載時估計，已度量高度替換它們並錨定視埠                                    |
| 具串流底部固定的聊天      | `VirtualList` + `jumpToBottom()` 或 `ScrollView.scrollToBottom()` | 吸附而非彈簧重定向，保持視埠靜止                                                |

### 6.4 捲軸可見性 — `clip-overflow` vs 真實捲軸

VectoJS 無原生捲軸小工具 — `ScrollView` 與 `VirtualList` 自行裁剪並處理滾輪/拖曳，a11y 陰影保留閱讀順序。視覺捲軸（`packages/devtools/src/audit.ts:51` 處的 DevTools 稽核 `clip-overflow`，對 `ScrollView`/`VirtualList`/`Tree`/`Table` 豁免）為裝飾性 `Rect`，其 thumb `y` 追蹤 `scrollY / maxScroll` — 而非獨立的互動目標。

## 7. 困難之處 — 附憑據

| 陷阱                                                      | 位置                                                        | 狀態                                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| 容器永不為其內容定尺（`Tabs`/`Panel`/`PanelGroup` 鏈）    | `ResizablePanel.ts:164`，`Card.ts:92`，forge 2026-07-10     | 已修正 `@vectojs/ui@1.11.0` — `setContent(entity, fit?)` 具每影格 fit 同步 |
| 整卡點擊需要不可見覆蓋 Button                             | `Card.ts:35`，forge 2026-07-10                              | 已修正 `@vectojs/ui@1.11.0` — `Card({ onClick, label })`                   |
| 面板拖曳使用局部空間增量（游標滯後）                      | `ResizablePanel.ts:78`，forge 2026-07-10                    | 已修正 `@vectojs/ui@1.1.3` — 場景空間 `sceneX`/`sceneY`                    |
| 超過約 10 個分頁時 Tabs 收縮為細條                        | forge 2026-07-10                                            | 已修正 `@vectojs/ui@1.1.3` — 固定 `tabWidth` + 溢出捲動                    |
| Tabs 拉伸 × 視覺上位於下一個分頁標籤旁                    | `Tabs._tabW()`，forge 2026-07-16                            | 已修正 `@vectojs/ui@1.9.4` — `tabWidth` 為最大值，剩餘空白                 |
| `Overlay.showAtPoint` 在首次掛載前靜默無操作              | `Overlay.ts:98`，forge 2026-07-17                           | 已修正 `@vectojs/ui@1.10.0` — `source` 參數供場景解析                      |
| `Stack.add()` 在串流時為 `O(n²)`                          | `Stack.ts:167`，`Flow.ts:19`，forge 2026-07-19              | 已修正 `@vectojs/ui@1.11.4` — `appendFast`/`appendFastWrap`                |
| `ScrollView` 預設彈簧欠阻尼（5 次反轉，801 ms）           | `ScrollView.ts:14`，forge 2026-08-02                        | 已修正 `@vectojs/ui` #322 — `scrollPhysics` + `DOCUMENT_SCROLL_PHYSICS`    |
| `VirtualList` 無鍵的 setItems 使陳舊列留在螢幕上          | `VirtualList.ts:248`，forge 2026-08-02/08                   | 已修正 `@vectojs/ui@2.15.1`                                                |
| 捲動小工具忽略 deltaMode（行/頁滾輪捲動 1-3 px）          | `ScrollView.ts:105`，`VirtualList.ts:583`，forge 2026-08-08 | 已修正 `@vectojs/ui@2.15.2`                                                |
| deltaMode 修正丟棄 VirtualList markDirty（凍結 onDemand） | `VirtualList.ts:596`，forge 2026-08-08                      | 已修正 `@vectojs/ui@2.15.3`                                                |
| 隱藏時 Popover + Overlay a11y/指標洩漏                    | `Overlay.ts:48`，forge 2026-08-13                           | 已修正 vectojs#474，合併 vectojs#509                                       |
| 虛擬化 Table 在 layout() 上不重同步字串儲存格             | `Table.ts:354`，forge 2026-08-13                            | 已修正 vectojs#494，合併 vectojs#520                                       |
| 陣列重指派時 Tabs/RadioGroup 熱點失步                     | `Tabs.ts:229`，forge 2026-08-13                             | 已修正 vectojs#494，合併 vectojs#520                                       |
| 無鍵的 VirtualList setItems 留下陳舊 _velY（瞬態過衝）    | `VirtualList.ts:290`，forge 2026-08-13                      | 已修正 vectojs#494，合併 vectojs#520                                       |

## 8. 交付響應式布局變更前的檢查清單

1. **當邏輯視埠變更時呼叫 scene.resize()。** 邏輯 `width`/`height` 為純欄位（`Scene.ts:2049`）— 直至 `resize()` 遞增兩個世代計數器並重縮放後備儲存前，無物觀測它們。檢查 `disableWindowResize: false`（視窗路徑）與 `true`（ResizeObserver 路徑）兩者。以 `Number.isFinite && >= 0` 檢查守衛（`Scene.ts:6395`）。
2. **保持容器定尺對稱。** 每個擁有子節點 `width`/`height` 的容器必須經 `update()` 重套用（`ResizablePanel.ts:190` / `Card.ts:118` 處的 `Panel`/`Card` 模式），因為 `Entity.width/height` 為無 setter 鉤子的純欄位。在 `Entity.ts:1065 add()` 外搜尋直接的 `children.push` — 它完全跳過 `markStructureChanged` 與 `markDirty`。
3. **Stack 快速路徑必須保持於不變量下。** 非 wrap 的 `appendFast` 假設 `align: 'start'` 且無 `fillTarget`；wrap 的 `appendFastWrap` 還原四個純量的最後行狀態（`Stack.ts:95`）並在完整 `layout()` 後自多行重算（`Stack.ts:422`）。使後續子節點影響先前位置的新旗標必須使 `fastAppendDirty` 失效。
4. **Overlay 擁有權為 overlayRoot 而非父節點。** `Overlay.showAt`（`Overlay.ts:70`）重設父節點至 `scene.overlayRoot` — 恆自 `showAtPoint` 的呼叫者傳遞 `source`（`Overlay.ts:98` 第三參數），使從未掛載的覆蓋層在首次顯示時解析 `scene`。
5. **捲動積分器絕不可重武裝閒置節流。** `ScrollView.update()`（`ScrollView.ts:219`）僅當箝制移動 `targetY` 時才重指派 `content.y`；`VirtualList` 僅當捲動狀態變更時才 `markDirty()`（`VirtualList.ts:596`）。每影格無條件變髒使 `onDemand` 場景永遠以全速運行。
6. **deltaMode — 在箝制前縮放。** 行→×16、頁→×視埠，於 `clampTarget()`/`_clamp()` 前（`ScrollView.ts:105`，`VirtualList.ts:583`）。Chrome/jsdom 恆傳遞 `deltaMode: 0`，因此錯誤在該處不可見。
7. **VirtualList：自鍵而非索引重建高度。** 具 `keyForItem` 的 `setItems` 後，Fenwick 樹自 `_heightByKey` 重播種（`VirtualList.ts:272`），`_rekeyPool()`（`VirtualList.ts:317`）在任何高度讀取前移動池化實體 — 無重設鍵的按索引重用將每個高度寫入錯誤的快取槽。
8. **PanelDrag 必須保持於場景空間且不在 pointerleave 上結束。** `PanelResizeHandle`（`ResizablePanel.ts:86`）在可用時讀取 `sceneX`/`sceneY`，且不再於 `pointerleave` 上結束拖曳 — 陰影節點持有捕獲。

---

_Series: 00 Overview → 01 Selection → 02 Text+Layout → 03 Semantic Projection → 04 Streaming Markdown → 05 TeX → 06 VMT Runtime → 07 Renderer → 08 WASM → 09 Three/XR → 10 Video Export → 11 Graph Layout → 12 DevTools → **14 Responsive Layout** → 99 Synthesis._
