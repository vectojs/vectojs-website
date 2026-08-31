+++
title = "03 — 語意投射與虛擬化"
description = "三層 DOM 生命週期 — 視覺、語意、互動 — 以及 VectoJS 如何僅具體化可用的內容、為可選取內容開窗，並保持游動焦點誠實。"
weight = 23
+++

# 03 — 語意投射與虛擬化

VectoJS 渲染**零個可見 DOM**。你所見的一切皆為畫布。你在螢幕閱讀器、鍵盤使用者或 Playwright 代理上觸及的一切，皆為 `Scene.a11yRoot` 中**纖薄的投射陰影**（一個位於畫布之上、具 `position:absolute` 的單一 `div`，`packages/core/src/tree/Scene.ts:2390`）。該陰影並非一實體一節點——它是一個三層生命週期，將成本限制於視埠，同時讓螢幕外文字仍可被尋找與預讀。

## 三層 — 一張圖

```text
                      ┌─────────────────────────────────────┐
                      │        Virtual Math Tree (VMT)      │
                      │  Entity tree · worldMatrix · bounds │
                      │  packages/core/src/tree/Scene.ts    │
                      │  packages/core/src/tree/Entity.ts   │
                      └──────────────┬──────────────────────┘
                                     │  syncA11y + syncContentProjection
                                     │  (shared depth-first walk, every frame
                                     │   or throttled — see §2)
                 ┌───────────────────┼───────────────────┐
                 ▼                   ▼                   ▼
   ┌─────────────────────┐ ┌───────────────────┐ ┌─────────────────────┐
   │  Visual tier        │ │  Semantic tier    │ │  Interaction tier   │
   │  (always rendered)  │ │  (coarse, resident)│ │  (windowed, fine)  │
   │                     │ │                    │ │                     │
   │  Canvas2D / WebGL / │ │  One DOM node per  │ │  Per-line carriers  │
   │  WebGPU / SVG draws │ │  block holding its │ │  (spans per line /  │
   │  every entity that  │ │  full `text` so    │ │  spans per glyph    │
   │  passes culling.    │ │  find-in-page and  │ │  cluster when grid) │
   │  Subject to         │ │  read-ahead see    │ │  plus a11y mirrors  │
   │  `getRenderChild-   │ │  the whole doc.    │ │  (`button`, `grid-  │
   │  Range` /           │ │  Outside the       │ │  cell`, hotspots).   │
   │  viewportCullChild- │ │  interaction margin│ │  Only near-viewport │
   │  ren. No DOM cost.  │ │  carriers are NOT  │ │  materialized.      │
   └─────────────────────┘ │  built.            │ └─────────────────────┘
                           └───────────────────┘
        Pixels ─────────────►  `getContentProjection().text`  ─────────►  `lines` / `grid`
                              `SceneOptions.contentSemanticMargin`
                                                            `SceneOptions.contentProjectionMargin`
                                                            `SceneOptions.contentSemanticBudget`
```

為何需要兩個邊界？單一純量無法表達「每個區塊皆有 DOM，但僅視埠附近區塊擁有載體」——有限值會完全釋放帶外區塊，而 `Infinity` 則會同時解除每個載體的開窗（`O(total glyphs)`）。參見 `SceneOptions.contentSemanticMargin` vs `contentProjectionMargin`（`Scene.ts:328`、`336`、`359`）與 `vectojs-docs/forge/baselines/content-projection-frontload-findings.md:1` 中被否決列舉的理由。

| 層級           | 所在位置                                             | 受控於                                                                                 | 預設                                                       |
| -------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 視覺           | 畫布後備儲存                                         | `viewportCullChildren` + `getRenderChildRange` (`Entity.ts:788`, `1970`)               | 關閉剔除 — 依容器選擇加入                                  |
| 語意（粗粒度） | 每區塊一個 `div`，`el.textContent = projection.text` | `contentSemanticMargin` — 區塊是否擁有*任何* DOM                                       | `contentProjectionMargin ?? Scene.height` (`Scene.ts:355`) |
| 互動（細粒度） | 逐行 / 逐單元載體 + a11y 鏡像                        | `contentProjectionMargin` + `projectionLineWindow` (`scene/content-line-window.ts:25`) | 一個視埠高度                                               |

`contentSemanticBudget`（`Scene.ts:359`，`DEFAULT_CONTENT_SEMANTIC_BUDGET = 256` 於 `Scene.ts:600`）將一次性常駐層建構分散至多影格——僅粗粒度區塊受預算限制；位於互動帶內的區塊無論預算皆立即具體化。

## `syncA11y` 遍歷如何運作 — 以及何時運作

`syncA11y` 並非「一個 a11y 方法」。它是 a11y **與**內容投射的**共用深度優先遍歷驅動器**（`A11yProjectionManager.ts:30`、`ContentProjectionManager.ts:26`）。拆分它們需要 `DEC-0020`/`DEC-0022` 的理由：遞迴點呼叫 `syncContentProjection`，而 `syncA11y` 初始化內容側讀取的四個每同步欄位（`_syncSerial`、`contentSemanticBudgetLeft`、`contentSemanticDeferred`、`contentSelectionPresentThisSync`）。`DirtyTracker`（`scene/DirtyTracker.ts:33`）決定遍歷是否執行；`a11ySyncInterval` 在不破壞預算的情況下進一步節流。

每影格（或節流至 `a11ySyncInterval`，`Scene.ts:263`）：

1. **收集 + 髒檢查。** 每個具非零盒（或 `a11yFullViewport`，`Entity.ts:912`）的 `interactive` 實體呼叫 `getA11yAttributes()`（`Entity.ts:1898`）。遍歷同時讀取 `interactive`、`a11yHidden`、`a11yProjection` 與 `a11yFullViewport`——隱藏的祖先無論子旗標為何皆隱藏其整個子樹（見 § Focus）。若 `getContentEpoch()`（`Entity.ts:2048`）未遞增，未變更的內容區塊完全跳過重建。epoch 是內容投射等同於 VMT 髒旗標的對應物——廉價的整數比較，無需字串差分。從 `getContentProjection()` 回傳 `null` 的實體完全不支付內容成本。
2. **建立 / 更新 / 重新定位。** 遍歷建立陰影元素（`a`/`button`/`img`/`input`/`textarea` 或 `div`，`A11yAttributes.tag` 於 `Entity.ts:295`），以逐屬性髒檢查套用每個 `A11yAttributes` 欄位（回傳 `undefined` 移除屬性——`false` vs `undefined` 對 `aria-invalid` 很重要），並透過 `CanvasGeometry`（`scene/CanvasGeometry.ts:93`）自實體的世界矩陣寫入 `top`/`left`/`width`/`height`。畫布偏移與非均勻 CSS 縮放被映射；畫布父元素的任意 CSS 旋轉/傾斜不受支援。`A11yAttributes.level` / `posInSet` / `setSize` / `rowCount` / `rowIndex` 被投射為 `aria-level` / `posinset` / `setsize` / `rowcount` / `rowindex`——虛擬化列表/網格所需，使 AT 宣告資料集大小而非視窗大小。
3. **排序 + 修剪。** `A11yProjectionManager.collect`（`A11yProjectionManager.ts:157`）以最近的 `a11yRegion`/`clipChildren` 祖先作為元素的*區域*；`reorder`（`A11yProjectionManager.ts:178`）將 `normalElements` 按視覺閱讀順序帶狀排序（`sortNormalElementsVisually`，`A11yProjectionManager.ts:351`），並按 DOM 父元素游標插入，使複合巢狀（`grid > row > gridcell`）得以保留。被移動子樹內的焦點與 `Selection` 端點僅快照一次——每*重排序*遍歷支付一次強制布局，而非每移動元素一次（`A11yProjectionManager.ts:230`）。本遍歷未收集的任何內容皆被修剪（`isActive` 於 `A11yProjectionManager.ts:169`）。`a11yNeedsReorder`（`Scene.ts:1381` / `A11yProjectionManager.ts:88`）為觸發排序的旗標。
4. **內容側。** 在其遞迴點，遍歷對每個 `getContentProjection()` 非空的實體呼叫 `syncContentProjection`。盒測試（`projectionBoxVisible`）決定粗粒度 vs 釋放；行帶（`projectionLineWindow` / `projectionGridLineWindow`，`scene/content-line-window.ts:2`）決定存活區塊的哪些行取得載體。網格區塊經 `ContentGridProjector.syncGrid`（`scene/ContentGridProjector.ts:69`）並以逐行簽名處理，使串流附加重用未變更的載體；非網格區塊使用 `el.replaceChildren()`。`ContentProjectionHint`（`Entity.ts:ContentProjectionHint`）讓 Scene 告知實體實際需要哪個帶，使 `getContentProjection` 可避免建立被丟棄的行——僅為建議，因此忽略它永遠正確。

### 生命週期鉤子

`Entity.onMounted()` 在實體進入活躍 Scene 時觸發一次（`Entity.ts:add` / `_notifyMounted`）。需要知道何時配置的熱點池可覆寫它；`remove(child)` 呼叫 `scene.detachA11y(child)`（`Entity.ts:remove`）並標記 `a11yNeedsReorder`。`Scene.detachA11y` 具冪等性——第二次分離為無操作——因此在移除列前分離熱點的 `Tabs`/`Table` 池清理即使實體已消失亦安全。

### 預算與邊界控制

三個旋鈕，一份契約：

- `contentProjection: false` 停用*整個*內容層（裝飾性場景）。
- `contentProjectionMargin`（預設一個視埠高度，`Scene.ts:328`）— 互動視窗。有限 = 載體被開窗；`Infinity` = 每個載體皆具體化（生產環境禁止——`O(glyphs)`）。
- `contentSemanticMargin` — 粗粒度門控。`Infinity` + 有限互動邊界 = 每個區塊擁有 `text` 供尋找/預讀，而僅視埠附近區塊支付載體成本。為常駐層的安全、期望的組態。無此則同一 `Infinity` 也會解除載體開窗。
- `contentSemanticBudget = 256` — 每同步可具體化的粗粒度區塊數。限制文件開啟時的停頓（每區塊約 0.03 ms 加上隨常駐數增長的每遍歷底層）。可見區塊忽略預算。

該預算於下方 memo 修正後經 `DEC-01KZ8DZE` 度量定尺；見 `forge/baselines/content-projection-frontload-findings.md:Two approaches rejected`。

### 為何不是每 Entity 一 DOM

成本隨投射節點數超線性增長。在真實硬體上度量（RTX 4060 Laptop，移動實體，每個一個元素）— `content/learn/accessibility.md:353`：

| 可互動實體數 | Chrome/影格 | Firefox/影格 |
| ------------ | ----------- | ------------ |
| 1,000        | 6.4 ms      | 7.4 ms       |
| 5,000        | 59.5 ms     | 114 ms       |
| 20,000       | 715 ms      | 2737 ms      |

每實體成本*隨*數量上升（排序 + 瀏覽器 a11y 樹重建退化）。在 5,000 個移動實體的第二次度量（`Entity.ts:933` 文件，`benchmarks/lazy-a11y/`）：`eager` = **72.2 ms Chrome / 114.3 ms Firefox** vs `onDemand` = **1.55 / 1.63 ms**，無投射時的底線為 **1.26 / 1.65 ms**。遍歷本身約 0.005 µs/實體——DOM 為成本所在。在 36,000 個實體時每 Entity 一 DOM 因此並非線性外推——它由 a11y 樹重建主導，這正是同一份文件將 36,000→1,026 的收斂引為*系統*勝利而非遍歷勝利的原因。

### 參與度 — `a11yProjection` 模式（`Entity.ts:968`）

- `eager`（預設）— 鏡像與 `interactive` + 盒共存。適用於按鈕、連結、輸入框。
- `onDemand` — 僅在*參與*時存在鏡像：已聚焦、為指標目標，或 `Scene.requestA11yProjection(id)`（`Scene.ts:1481`）。僅懸停**不會**參與（鍵盤/AT 使用者不產生懸停）。無鏡像的 `onDemand` 實體**完全不接收指標事件**——畫布命中測試（`findEntityAt`）為查詢 API，而非分發路徑（`Entity.ts:953`）。
- `never` — 永無鏡像。除非命中測試必須保留，否則偏好 `interactive = false`。

對於數千個短暫物件（粒子、彈幕），模式為一個聚合的即時區域（`role: 'status'`、`a11yFullViewport`、`Entity.ts:193`）加上供目前選取的小型熱點池——見 `forge/findings/core-a11y-and-input.md:178`（Bakudan `DanmakuAnnouncer`）。

## 虛擬化 — 不為文件付費的捲動

### ScrollView / Viewport

原始滾動器（`packages/ui/src/ScrollView.ts:58`）為一個裁剪容器（`clipChildren = true`），其 `content` 子節點以 `-scrollTop` 平移。它暴露 `scrollTo` / `scrollToBottom` / `jumpTo`，在 `update`（`ScrollView.ts:219`）中驅動指數彈簧積分器，並透過 `hasPendingAnimations()` 使滾動狀態對閒置檢查可見，使 `onDemand` 場景不會在滾動中停滯。`driveVirtualizableContent`（`ScrollView.ts:233`）讓 `VirtualList` 子節點在其滾動內擁有自身的開窗。

`ScrollView` 內的 `Flow` 或 `Stack` 執行正常布局；僅裁剪 + 平移虛擬化*繪製*——DOM 成本仍受內容投射開窗限制。`Flow` 在 `maxWidth` 處換行；`Stack` 為垂直/水平間隙容器（`packages/ui/src/Stack.ts`、`Flow.ts`）。`Card` 為裝飾性群組（`packages/ui/src/Card.ts:80`，具標籤時為 `role: group`）——本身不虛擬化，但為虛擬化視埠的常見子節點。

`getA11yAttributes()` 回傳 `{ pointerEvents: 'none' }`（`ScrollView.ts:289`）——滾動表面本身非命中目標；後代擁有指標（見下方熱點 §）。在 `Overlay` 於 `hide()` 後的已收合 `ScrollView` 上，`a11yHidden` 即使在裁剪動畫執行期間亦自投射隱藏其子樹（`Entity.ts:a11yHidden`）。

### VirtualList — 為列開窗（`packages/ui/src/VirtualList.ts:179`）

僅 `[visibleTop - overscan, visibleBottom + overscan]` 內的列被掛載（`VirtualList.ts:468` 處的 `_visibleRange`，預設 `overscan = 3`，`VirtualListOptions:102`）。其餘不存在為實體——無畫布繪製、無 a11y 鏡像、無內容投射。掛載數保持 `O(viewport)`，與資料集大小無關。

捲動數學經 Fenwick 樹（`RowHeights`，`VirtualList.ts:14`）為 `O(log n)`，回答 `total()`、`prefix(i)`（= 列 `i` 的 y）與 `indexAt(y)`（= 包含偏移 `y` 的列）。高度始於 `estimatedRowHeight`，並在每影格對每個已掛載列重測（`VirtualList.ts:540` 處的 `_measureMountedRows`）——純欄位讀取，無需髒旗標，且在無變更路徑上無 `markDirty`，因此閒置節流不會被擊破。`_reconcile`（`VirtualList.ts:488`）在掛載新實體前回收超出範圍的實體。

具鍵列表（`keyForItem`，`VirtualList.ts:117`）在 `setItems` 間保留已度量高度、按項目識別錨定捲動（非索引），並在 `distanceToBottom ≤ 48 px`（`VirtualList.ts:517`）時跟隨底部。無 `keyForItem` 時，`setItems` 清除高度快取並跳至頂部——對被替換的列表正確，對增長的轉錄則錯誤。

A11y：容器的計數屬於其**名稱**，而非 `aria-setsize`（在 `role="list"` 上不允許），依 `VirtualList.ts:660` 處的 `getA11yAttributes` 與 `VirtualList.ts:170` 處的類別文件。每*列*應回傳 `posInSet` / `setSize`（`Entity.ts:A11yAttributes.posInSet`/`setSize`），否則螢幕閱讀器宣告已掛載視窗大小而非資料集大小。`VirtualList` 以與 `Table` 相同方式池化其列熱點——每可見列一個池。

### 內容網格平鋪 — 粗粒度 vs 細粒度（§ 上方圖示）

兩條路徑共用一個開窗契約（`scene/content-line-window.ts`）：

- **非網格**（段落、`Text`/`RichText`）：`ContentProjection.lines` 上的 `projectionLineWindow`（`content-line-window.ts:44`）。粗粒度區塊持有一個文字節點（`el.textContent = projection.text`）；細粒度區塊按視窗替換載體。每個 `ContentProjectionLine` 攜帶 `text`、`separatorAfter`（已消費的軟換行 vs 硬換行）、`x`/`y`/`baseline`、具 `x`/`width` 的可選 `runs`（供對齊文字）、以及供 CJK 網格擬合的 `perGraphemeCarriers`/`shapedPaint`。
- **網格**（程式碼區塊、經 `@vectojs/text` 中 `PreparedContentGrid` 的 `Markdown` CodeBlock）：`PreparedContentGrid` 上的 `projectionGridLineWindow`（`content-line-window.ts:114`）。`ContentGridProjector.syncGrid` 以逐字形簇一個 span 建立，並具逐單元 `scaleX` 校準（`ContentProjectionManager.scheduleGridCalibration`，在同步外的冷讀/寫批次），並按簽名重用行（`ContentGridProjector.ts:199`），使串流附加避免 `O(cells)` 重建。網格文字上的 `ligatures: 'none'` 防止 Firefox `ffi` 收縮使選取框漂移。

該視窗為**與擴展視埠帶重疊的連續區段**——間隙會將文字自 DOM 順序中切除並破壞選取複製順序。當無重疊時，保留單一最近行使文字保持可達（`content-line-window.ts:79`）。晉升（粗粒度→細粒度）明確剝離粗粒度文字節點——網格無法使用 `replaceChildren()`，否則串流重用將喪失（`ContentGridProjector.ts:111`）。降級釋放 DOM；語意門控在無載體的情況下保持可尋找文字。

選取保留具層級感知：`ContentProjectionManager`（`scene/ContentProjectionManager.ts:1`）將端點快照為非網格的*線性偏移*與網格的*來源偏移*，對每遍歷 memo `selectionPresent`（每遍歷一次強制布局而非每元素——memo 修正將 1000 區塊排空自 2002 次布局降至 19，`forge/baselines/content-projection-frontload-findings.md:153`），並僅在受影響行實際重建時還原——被重用的載體保留即時 `Selection` 節點。滾動程式碼區塊上的 `clipToBounds` 防止選取高亮繪至實體框外。

### Markdown + Table 平鋪

- **Markdown**（`packages/markdown/src/Markdown.ts:681`）— 兩個獨立軸：`virtualize`（`MarkdownOptions:625`）將頂層*區塊*作為實體開窗（選擇加入，與串流不相容，由主 `ScrollView` 以 `Markdown.ts:774` 處的 `RowHeights` 驅動 `setVisibleRange`），而 `tableViewportHeight`（`MarkdownOptions:652`）固定每個 `Table` 的本體視埠，使其列在串流中經 `Table.appendRows` 虛擬化。兩種情況下 `Stack` 搭配 `cullOffscreenChildren` 為內容宿主。`Markdown` 按區塊擁有 `getContentProjection`；宿主擁有捲動。串流 Markdown 按前綴重用未變更的區塊實體——僅尾部重建（Boss 04）。
- **Table**（`packages/table/src/Table.ts:144`）— `viewportHeight > 0` 固定表頭、建立裁剪的滾動 `bodyClip`（`Table.ts:183`）、在視窗進入時延遲建構字串儲存格（`Table.ts:853` 處的 `ensureBodyCells` / `Table.ts:392` 處的 `reconcileVirtualRows`），並僅保持 `first..last` 列已掛載（`overscan = 2`）。經典模式增長以容納所有列，具可變已度量高度。本體 a11y 為每可見列一個池化的 `RowHotspot`（`role: row`）+ `GridCellHotspot`（`role: gridcell`/`columnheader`）—— `O(viewport)` 而非 `O(rows)`（`Table.ts:199`、`622`）。`getContentProjection` 在 `Table` 本身上回傳 `null`——儲存格擁有其文字。`rowTops` 前綴和（`Table.ts:751`）使 `_syncGridA11y` 每槽 `O(1)` 而非 `O(rows²)`。

### Stack / Flow / Card 位於視埠內

`Stack`（`packages/ui/src/Stack.ts`）與 `Flow`（`packages/ui/src/Flow.ts`）為非虛擬化布局容器——它們定位子節點並回報 `width`/`height`，但不裁剪或開窗。在 `ScrollView` 或虛擬化父節點內，它們是被平移或剔除的*內容*：

- 具 `direction: 'vertical'` + `gap` 的 `Stack` 為 Markdown `content` 宿主（`Markdown.ts:1088`）與典型的 ScrollView 子節點。搭配 `cullOffscreenChildren = true` 時，它亦對螢幕外子節點跳過 `getContentProjection`——在 Scene 層開窗前的廉價第二門控。
- `Flow` 在 `maxWidth` 處換行內聯子節點，為文字段落主力；如同 Stack，它依賴其滾動祖先進行視埠門控。
- `Card`（`packages/ui/src/Card.ts:80`）為具內距/邊框/陰影的裝飾性 `role: group` 容器——本身永不虛擬化，但為 `VirtualList` 列或 `Markdown` 區塊的常見子節點。其 a11y 角色僅在具標籤時為 `group`。

這些預設皆不擁有 `getRenderChildRange`——它們繪製所有子節點，讓祖先的裁剪 + 投射開窗限制成本。僅 `Markdown`/`Table`/`VirtualList` 實作列/區塊級虛擬化。

### 視埠剔除 — 視覺層（`Entity.ts:788`）

獨立於 DOM 投射：

```ts
entity.viewportCullChildren = true;
entity.getRenderChildRange(localViewport: Bounds): RenderChildRange | null {
  // 回傳與視埠相交的子節點 { start, end }，或無則為 null
}
```

`Stack`/`Flow` 預設關閉此（適度子數量時低成本）。對具數千個視覺子節點的容器啟用它，其*畫布*繪製本身很重要——投射開窗無助於視覺層，無剔除的樹遍歷為每同步影格 `O(total entities)`（`forge/baselines/content-projection-frontload-findings.md:Not addressed`，`vectojs#350`）。

### 晉升 / 降級生命週期

```text
  off-screen                          near viewport                    on-screen
 ──────────── ──contentSemanticMargin── ──contentProjectionMargin── ────────────
  (released)          (coarse)                     (fine)
  no DOM              el.textContent = text        per-line / per-cell carriers
  not findable        findable, no per-line        findable + selectable +
                      selection geometry            copy + per-line highlight

  demotion ◄──────────────┘                          └──────────────► promotion
  `syncContentProjection` frees carriers;            `syncGrid` strips coarse text node,
  coarse text stays if inside semantic gate;         materializes windowed carriers;
  outside both gates the element is removed.         outside semantic gate but inside
                                                     interaction gate: direct to fine.
```

預算僅適用於自帶外晉升至細粒度的粗粒度→細粒度；將已為粗粒度的區塊滾入互動帶時忽略預算。

## 熱點模式 — 仍可鍵盤操作的零 DOM 語意

複合小工具（`role="grid"`、`tree`、`menu`、`radiogroup`、`tablist`）必須為*每個*子節點暴露**一個角色**，而非僅容器角色，且必須在循序順序中保持**一個 tab 停駐點**——具千個 tab 停駐點的樹無法使用。VectoJS 為每個可見子節點池化一個透明、可聚焦的子 `UIComponent`，覆蓋其上（`vectojs/AGENTS.md:Zero-DOM a11y hotspot pattern`）：

```ts
class GridCellHotspot extends UIComponent {
  constructor(private table: Table) {
    super();
    this.interactive = true; // 使 syncA11y 完全投射它
    this.on('keydown', (e) => this.table.handleGridKey(e, this.rowIndex, this.colIndex));
  }
  getA11yAttributes(): A11yAttributes {
    return {
      role: this.rowIndex < 0 ? 'columnheader' : 'gridcell',
      label: this.label, // WCAG 4.1.2 — 每個控制項皆需名稱
      tabIndex: this.table.isGridTabStop(this.rowIndex, this.colIndex) ? 0 : -1,
      pointerEvents: 'none', // 讓可選取儲存格文字擁有指標
    };
  }
  render(): void {} // Table 在畫布上繪製儲存格
}
```

| 元件             | 熱點角色                                           | 游動停駐點擁有者                                  | 按鍵                                                         |
| ---------------- | -------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| `Table`          | `row` 中的 `gridcell` / `columnheader`             | `isGridTabStop(row, col)` (`Table.ts:473`)        | 方向鍵 2D、Home/End 列、Ctrl+Home/End 網格、PageUp/Down 視埠 |
| `VirtualList` 列 | 呼叫者提供（例如 `listitem`）                      | 列自身的 `isTabStop`                              | 上/下                                                        |
| `TreeView`       | `treeitem`（`aria-level`、`expanded`、`selected`） | `isTabStop(nodeId)` (`Tree.ts:389`)               | 上/下、右展開→進入、左收合→父節點、Home/End                  |
| `ContextMenu`    | `menuitem`（`haspopup`、`expanded`）               | `isMenuTabStop(idx)` (`ContextMenu.ts:270`)       | 上/下循環、Home/End、右開啟、左返回、Escape 關閉             |
| `RadioGroup`     | `radio`（`aria-checked`）                          | `isTabStop(value)` (`RadioGroup.ts`/`Tabs.ts:42`) | 方向鍵 + Home/End                                            |
| `Tabs`           | `tab`（`aria-selected`）                           | 已選取分頁                                        | 方向鍵 + Home/End                                            |

先例：`RadioGroup`/`Tabs`（#160）、`Tree`/`Table`/`ContextMenu`（#191）；即時參考於 `Table.ts:56`、`82`、`Table.ts:624`（`_syncGridA11y`）、`VirtualList.ts:170`、`ScrollView.ts:289`、`ContextMenu.ts:292`、`RadioGroup.ts:32`、`Tree.ts:98`。僅可見子節點被池化，因此虛擬化的 `Table` 投射 `O(viewport)` 熱點。

### `pointerEvents: 'none'` 的理由

畫布輸入**僅透過投射鏡像路由**——`Scene` 按鏡像綁定 `pointerdown`/`pointerup`/`click`/`wheel`（`Scene.ts:3512`），而 `pointermove`/`pointerleave` 僅為懸停追蹤綁定於畫布。因此熱點上的 `pointerEvents: 'none'` 不僅是「將其自命中測試移除」——它完全移除其滑鼠輸入路徑，而鍵盤焦點與 AT 合成的 `click` 仍路由（`forge/findings/core-a11y-and-input.md:336`）。在以下情況使用它：

- 可選取儲存格文字（`Table.ts:116`）、
- 拖曳滾動表面（`ScrollView.ts:289`）、
- 包裝器內的畫布命中處理。

**勿**在擁有處理器的元素上使用它——一個對自身屬性設定 `pointerEvents: 'none'` 的 `ScrollView` 子類別在無錯誤的情況下靜默其 `wheel`/`pointerdown` 捲動（`forge/findings/core-a11y-and-input.md:336`）。

### 焦點、游動 tabindex 與閱讀順序

- **游動 tabindex**：每個複合項僅一個熱點具 `tabIndex: 0`；父節點在方向鍵上移動停駐點並聚焦它（`Table.ts:490` 處的 `Table.handleGridKey`、`Table.ts:560` 處的 `findHotspot`/`_focusCell`、`VirtualList`/`Tree`/`ContextMenu` 等同物）。當虛擬化卸載已聚焦列時，`Table` 在重綁 `tabIndex` 前將停駐點重錨至可見列（`Table.ts:667`），並僅在舊儲存格實際持有焦點時還原 DOM 焦點（`Table.ts:592` 處的 `activeCellHoldsFocus`），因此在別處捲動永不竊取焦點。哨兵 `a11yRoot` 焦點陷阱使焦點保持於場景內（`Scene.ts:1482`）。
- **閱讀 / tab 順序**：鏡像按*區域*以帶狀排序為由上至下再內聯，穩定——最近的 `a11yRegion` 或 `clipChildren` 祖先（`A11yProjectionManager.ts:351`）。無區域時，貫穿轉錄稿的垂直拖曳會吞噬共享相同列帶的側邊欄標題（`A11yProjectionManager.ts:339`）。在非裁剪欄上設定 `a11yRegion = true`（`Entity.ts:a11yRegion`）以保持其拖曳/連續性分離。RTL 為 `Scene.readingDirection`（`Scene.ts:392`）。`a11yRoot` 層為畫布之上 `z-index: 10`（`Scene.ts:2403`），預設 `pointerEvents: none`，僅在拖曳期間翻轉為 `auto` 使選取可在空白區域開始。
- **隱藏子樹**：`a11yHidden = true`（`Entity.ts:a11yHidden`）自投射隱藏整個子樹——僅在容器上設定 `interactive = false` 仍使仍具可互動性的子節點被投射（於 `Popover.hide` 上驗證，`forge/findings/core-a11y-and-input.md:622`）。非自 `opacity` 推斷——彈簧驅動的透明度徘徊於接近零而永不達零。

## 選擇組態

| 文件                 | 語意邊界                   | 互動邊界       | 預算    | 備註                                                        |
| -------------------- | -------------------------- | -------------- | ------- | ----------------------------------------------------------- |
| 裝飾性畫布           | `contentProjection: false` | —              | —       | 完全無 DOM 成本                                             |
| 短文件（< 300 區塊） | 預設                       | 預設           | 256     | 預設已為最佳                                                |
| 長可捲動文件         | `Infinity`                 | 預設（1 視埠） | 256     | 推薦的常駐層 — 整份文件的尋找 + 預讀，載體保持有界          |
| 10k 區塊轉錄         | `Infinity`                 | `2 * viewport` | 256–512 | 較寬互動邊界減少捲動時的晉升 churn                          |
| 粒子 / 彈幕場        | —（無內容投射）            | —              | —       | `a11yProjection: 'onDemand'` 或聚合 `role: status` 即時區域 |

`content-visibility: auto` 與懸停門控文字皆經度量並被否決——見 `forge/baselines/content-projection-frontload-findings.md:Two approaches rejected`。前者在螢幕外投射上相對 `display:none` 無收益；後者專為鍵盤/AT 使用者移除文字。

## 已出現的陷阱 — 曾發布的錯誤

1. **粗粒度→細粒度重複**（`forge/findings/core-a11y-and-input.md:2026-08-08`）— 自粗粒度晉升的網格區塊在透過僅 `children` 操作附加載體時留下其 `textContent` 文字節點，使 `textContent` 加倍（測得 758 vs 379 字元）。透過在載體迴圈前剝離文字節點修正（`ContentGridProjector.ts:111`）。
2. **選取超出視窗起點**（`forge/findings/core-a11y-and-input.md:2026-08-08`，`ContentGridSelectionWindow.test.ts`）— 滾動超過視窗*起點*會在未釋放 `Selection` 的情況下重建載體，使其留在已分離節點上。需將 `selectionLine < start || >= end` 提升至具體化迴圈之上。
3. **`pointerEvents: none` 扼殺滑鼠**（`forge/findings/core-a11y-and-input.md:2026-08-02`）— 見熱點 §；無警告、無錯誤，僅為死亡的捲動表面。
4. **覆蓋層重投射延遲** — `DirtyTracker` + `a11ySyncInterval` 與 `showOverlay` 的互動曾被懷疑，隨後作為背景化瀏覽器假象被撤回（`forge/findings/core-a11y-and-input.md:2026-08-16` 撤回，`2026-08-15` 原文）。教訓：在將影格計數延遲歸因於 Scene 前，先驗證 `document.hasFocus()` 與頁內 rAF 計數器。
5. **固定 id 碰撞**（`forge/findings/core-a11y-and-input.md:2026-07-16`，`vectojs#117`）— 十一個 `ui` 元件曾呼叫 `super('ClassName')`，共用一個 `a11yElements` 映射條目；兩個 `PanelGroup` 將指標事件路由至錯誤的分隔線。透過 `super()` → 隨機 id 修正。
6. **`a11yHidden` vs `interactive`**（`forge/findings/core-a11y-and-input.md:622`）— 在容器上設定 `interactive = false` 不會隱藏其仍具可互動性的子節點；`a11yHidden` 會。

## 自動化 — 投射亦為輸入傳輸

Playwright 的 `getByRole('button', { name })` 不命中畫布。它命中 `a11yRoot` 中的陰影鏡像，而 `Scene` 的每鏡像監聽器（`Scene.ts:3512`）重新分發為 `VectoJSEvent`（`Entity.ts:VectoJSEvent`），具 `bubbles` 與 `stopPropagation` 語意。這正是同一 `A11yAttributes.label` 既為 AT 宣告亦為代理使用的選擇器——無需轉接器、無需 `data-testid`。`debugA11y` 加上 `getA11yTree()` 為代理的斷言面；`data-vecto-id` 為標籤動態時的穩定定位器。

結果：`onDemand` 閒置實體或 `a11yHidden` 子樹無鏡像，因此**無指標分發路徑**——`scene.findEntityAt(x,y)` 仍回傳實體（查詢 API），但 `entity.on('click')` 永不觸發。必須保持指標反應同時對 AT 不可見的全域手勢表面，使用 `a11yFullViewport = true` + `a11yProjection: 'eager'` + `getA11yAttributes() => ({ tabIndex: -1 })` 且無角色——鏡像可聚焦以供指標路由，但無 AT 名稱。

`a11yFullViewport` 本身（`Entity.ts:912`）在所有其他鏡像後方掛載一個 `100vw × 100vh` 鏡像（`A11yProjectionManager.ts:fullViewportElements` 保持插入順序），使覆蓋畫布的互動表面永不遮擋上層控制項。該模式用於 `DanmakuAnnouncer`、webos 桌面點擊捕捉器與任何無限畫布平移處理器。

## `getA11yAttributes` 可投射的內容 — 介面

`A11yAttributes`（`Entity.ts:295`）為自訂實體所需的唯一 a11y API。每個欄位皆逐屬性逐影格設髒——`undefined` 移除，`false` 寫入 `aria-invalid="false"`（明確有效），因此區別很重要：

- **識別**：`tag`（`div`/`a`/`button`/`img`/`input`/`textarea`）、`role`、`label` / `labelledby` / `describedby`。
- **焦點/指標**：`tabIndex`（見游動 §）、`pointerEvents`（`auto`/`none`）。
- **原生屬性**（僅對應匹配 `tag`）：`href`/`target`、`src`/`alt`、`inputType`/`placeholder`/`value`/`checked`/`textInputStyle`。
- **狀態**：`disabled`、`checked`、`selected`、`expanded`、`required`、`invalid`、`level`、`valuemin`/`valuemax`、`ariaModal`、`controls`/`haspopup`/`activedescendant`。
- **虛擬化集合/網格**：`posInSet`/`setSize`（列表）、`rowCount`/`rowIndex`/`valueText`/`orientation`（網格）——無這些，具 10k 列的虛擬化列表會宣告「12 個中的第 3 項」（視窗而非資料集）。
- **即時**：`live`（`off`/`polite`/`assertive`）+ `atomic`/`relevant`——串流播報路徑（Boss 04）。

`getA11yAttributes()` 預設值（`Entity.ts:1937`）回傳 `{}` → 一個無角色的普通 `div`，對仍需內容投射的非互動文字區塊正確。

## 可引用的效能數據（及其度量位置）

僅 `benchmarks/run-browsers.sh` 在聚焦、具 GPU 支援視窗上的數據可被引用（見全域 `AGENTS.md` 基準規則）。以下所有數據除非註記皆來自該 harness。使用 `calibrateRefreshRate()`——永不硬編碼 60/240 Hz（Firefox 在無 `layout.frame_rate` 時預設 60 Hz）。在 JSON 封套中交叉檢查 `validation.ok`、`crossOriginIsolated` 與 `refreshHz`——未聚焦視窗回報 0 ticks/s，所有 ms 主張皆無效。

**投射成本 vs 可互動數量** — `content/learn/accessibility.md:353`、`Entity.ts:933`：

| 條件                       | Chrome       | Firefox     | 來源                                                                         |
| -------------------------- | ------------ | ----------- | ---------------------------------------------------------------------------- |
| 1,000 個移動可互動         | 6.4 ms/影格  | 7.4 ms/影格 | learn/accessibility §成本 + `lazy-a11y` 底線                                 |
| 5,000 eager                | 59.5–72.2 ms | 114 ms      | learn 表格 + `benchmarks/lazy-a11y/`（`Entity.ts:933` 文件）                 |
| 5,000 `onDemand`（同場景） | 1.55 ms      | 1.63 ms     | `benchmarks/lazy-a11y/` 底線 1.26/1.65 ms                                    |
| 20,000 eager               | 715 ms       | 2737 ms     | learn/accessibility 表格（超線性：6.4→35.7 µs/Chrome，7.4→136.9 µs/Firefox） |

**虛擬化勝利** — `forge/findings/core-a11y-and-input.md:240`（Gallery 346 KB Markdown，172–238 Hz，真實 GPU）：

| 指標           | 之前（無視埠門控）    | 之後             |
| -------------- | --------------------- | ---------------- |
| DOM 元素       | 14,843                | 254              |
| 已投射內容節點 | ~1,250                | 29（捲動時回收） |
| 文字節點       | 9,369                 | 160              |
| 捲動 p95       | ~50 ms                | 4.3 ms           |
| 捲動影格       | 55 fps / 18 ms        | 238 fps / 4.2 ms |
| 堆積           | 捲動期間 125 → 224 MB | ~100 MB          |

**粗粒度語意層成本** — `forge/baselines/content-projection-frontload-findings.md: Finding 3`（Chrome 151 @ 240 Hz，Firefox 153 @ 240 Hz，`runId 20260804T155826Z-5cdf96`）：

| 區塊數 | 行數   | `firstSyncMs`（混合 vs 原生）                      |
| ------ | ------ | -------------------------------------------------- |
| 100    | 300    | 10.3 ms (1.6×) / 5.0 ms (1.1×)                     |
| 1,000  | 3,000  | 20.6 ms (4.5×) / 16.0 ms (5.3×) — 開啟時約掉一影格 |
| 10,000 | 30,000 | 146.6 ms (19.9×) / 144.8 ms (21.4×)                |

每編輯成本保持低廉（10k 時 `editOffBand` 1.09/3.06 ms，`Finding 4`）。在 `Selection`-memo 修正後的最終預算化排空（執行 `20260805T080824Z-e79819`，`forge/baselines/content-projection-frontload-findings.md:Two approaches rejected`）：Chrome 21.29 → 10.66 ms 於 1k，139.5 → 12.0 ms 於 10k；Firefox 21.86 → 5.88 ms，141.6 → 9.2 ms。每區塊約 0.03 ms——先前 ~13 µs/節點數據無效（以 `display:none` 常駐節點度量，從未進入布局）。

## 除錯檢查清單

1. **`scene.getA11yTree()` 優先。** 每個熱點與內容節點皆在其中，具 `role`/`label`/`tabIndex`——若 `getByRole` 找不到任何內容，`interactive` 或 `width`/`height` 為零，而非選擇器（`Scene.ts:2390` 守衛，`content/learn/accessibility.md:Troubleshooting`）。`a11yRoot` 本身被排除於樹外。
2. **`debugA11y: true`**（`SceneOptions:debugA11y`，`Scene.ts:204`）— `a11yRoot` 上的藍色虛線外框；最快的定位檢查。鏡像否則為 `opacity: 0`（`Scene.ts:2401` 層為 `z-index: 10`，`pointerEvents: none` 直至拖曳）。在執行期經 `scene.debugA11y = true` 切換。
3. **DOM 檢查** — 每個鏡像攜帶 `data-vecto-id = entity.id` 加上 `role`/`aria-*`；檢查 `aria-label` 存在性（無名稱的角色被宣告為裸「button」/「slider」，`content/learn/accessibility.md:Screen reader testing checklist`）。內容載體攜帶 `data-vecto-grid-*` 與 `data-vecto-projection-*` 資料集。使用 `document.querySelectorAll('[data-vecto-id]')` 計數即時鏡像 vs 預期。
4. **`scene.getA11yElement(entity.id)`** — 供焦點檢查的即時 `HTMLElement`；`activeCellHoldsFocus`（`Table.ts:592`）模式展示如何測試它。`null` 表示本影格未投射（視埠外、`a11yHidden` 或 `onDemand` 閒置）。比較 `showOverlay` 前後的 `scene.a11yElements.size` 以捕捉覆蓋層投射回歸。
5. **`a11yProjection` 門控檢查** — 無參與的 `onDemand` 無鏡像，因此無指標事件。在歸咎分發前驗證 `Scene.requestA11yProjection` 或焦點狀態。記住 `findEntityAt` 仍有效——它未被門控——因此畫布層級的 `pointerdown` 處理器會觸發，而實體自身的 `on('click')` 不會。
6. **`pointerEvents` 稽核** — `grep -rn "pointerEvents.*none" packages --include="*.ts"` 並確認處理器擁有權。靜默的捲動/選取失敗多為此而非裁剪錯誤。`ScrollView` 於 `ScrollView.ts:289` 為典型的包裝器擁有無、子節點擁有自動的配對。
7. **閱讀順序** — 傾印 `getA11yTree()` 並驗證帶順序符合視覺列。錯置的 `a11yRegion` 顯示為區域優先排序，而預期為帶優先（`A11yProjectionManager.ts:351` 區域分桶）。
8. **選取 / 網格校準** — `ContentProjectionManager.scheduleGridCalibration` 寫入逐單元 `scaleX`；驗證 `data-vecto-grid-calib` 世代。字型載入後陳舊的世代表示 `contentFontEpoch` 未遞增。`content-visibility: auto` 經度量並被否決（`forge/baselines/content-projection-frontload-findings.md:Two approaches rejected`）；`a11yRoot` 上的 `contain: layout` 為刻意（`Scene.ts:2402`）。
9. **效能分流** — `PhaseTimer` 階段 `calibScan`/`calibProbeBuild`/`gridMaterialize`（`scene/PhaseTimer.ts`）、`ContentGridProjector` `vectoGridMaterializeMs` 資料集、`scene.frameStats`（`Scene.ts:518`）與 DevTools 上 `ScrollView`/`VirtualList`/`Table` 的 `getDevtoolsDescriptor()`。欲取得可引用數據，僅 `benchmarks/run-browsers.sh` 在聚焦視窗上計數——背景化的 Hyprland 給出 `0 ticks/s`，每個逐影格主張皆無效（`forge/findings/core-a11y-and-input.md:2026-08-16` 撤回）。

## 如何驗證虛擬化確實運作

三項檢查，依序：

1. **計數 DOM。** `document.querySelectorAll('[data-vecto-id]').length` vs `scene.a11yElements.size` vs 資料集大小。10k 列的虛擬化 Table 應顯示約 `viewport/rowHeight + 2*overscan` 個鏡像，而非 10k。若數量追蹤資料集，則虛擬化關閉（`viewportHeight` 未設定，或每列實體上為 `a11yProjection: 'eager'` 而非開窗池）。
2. **捲動並重計。** 集合應回收——相同數量，不同的 `data-vecto-id` 隨視窗移動。增長的數量表示洩漏的鏡像（卸載時未呼叫 `detachA11y`，或無縮小的增長池——檢查 `Table.ts:701` 縮小迴圈與 `VirtualList.ts:_reconcile` 回收分支）。
3. **效能封套。** `scene.frameStats`（`Scene.ts:518`）+ `benchmarks/run-browsers.sh --validation` 在聚焦視窗上。若虛擬化後捲動 p95 仍 >10 ms，成本不再是 DOM 數量——檢查 `PhaseTimer` 網格校準或 `syncA11y` 遍歷本身（無 `viewportCullChildren` 時為 `O(total entities)`，`vectojs#350`）。

## 此 Boss 在文件圖中的位置

- **前置**：Boss 06（VMT 執行期 — dirty/生命週期/事件，`DirtyTracker`、`DriverTicker`、`Scene` 迴圈）。此 Boss 重用 06 的 dirty/生命週期機制，並假設你已知 VMT 步驟。
- **搭配**：Boss 01（選取 — 內容投射的另一消費者）、`content/learn/accessibility.md`（how-to）、`content/reference/core-a11y.md`（API 真相）、`content/reference/core-entity.md`（`A11yAttributes` 介面、`getA11yAttributes`/`getContentProjection`/`getContentEpoch` 鉤子）。
- **導向**：Boss 04（串流 Markdown — `Markdown` 虛擬化握手 + 重用此 Boss 開窗的增量調和）、Boss 07（渲染器 — 視覺層的裁剪/DPR 一致性）、Boss 12（DevTools — 虛擬化狀態的 `getDevtoolsDescriptor` 介面）。

勿在 `vectojs-docs/content` 與 `vectojs-website/src/content` 間 `cp -r`——格式漂移 + 408 個 i18n 檔案（`AGENTS.md`）。先編輯權威側（`vectojs-docs/content`），以 `scripts/sync-content.py` 預覽，再推送兩個倉庫。

## 不變量（此 Boss 的提交檢查清單）

1. **髒 + 幾何一致。** 每當 `getContentProjection()` 輸出將不同時，`getContentEpoch()` 遞增；`Scene` 自第二次同步起跳過未變更區塊。破壞此將每影格支付 `O(total blocks)` 而非 `O(changed)`。無 `content-visibility` 捷徑——它經度量並被否決。`onDemand` 閒置實體依定義不髒。
2. **每個可見可互動者的雙世界一致性。** 世界幾何、角色/名稱/狀態與焦點/指標路由符合畫布真實——由共用的 `syncA11y` 遍歷與 `enforceA11yDomOrder` 的按區域視覺排序強制。一個 `interactive = false` vs `a11yHidden` 的失誤將隱藏控制項投射至 tab 順序。每個可互動項攜帶 `aria-label`，除非其可存取名稱來自 `aria-labelledby` / 包含文字。`a11yFullViewport` 鏡像永遠在一般鏡像之後。
3. **連續開窗。** 行網格視窗為每區塊單一連續區段（`scene/content-line-window.ts:Contiguous on purpose`）——間隙會將文字自選取/複製順序中切除。`clipChildren`/`a11yRegion` 為唯二區域中斷。語意與互動邊界間的分離即為整個 API——勿將其合併。
4. **指標擁有者明確。** 每對熱點皆宣告誰擁有指標；直接驅動實體的測試不會捕捉使滑鼠路徑靜默的 `pointerEvents: 'none'`（`forge/findings/core-a11y-and-input.md:336`）。無參與的 `onDemand` 依設計對指標無效——對 AT 不可見的指標表面使用 `a11yFullViewport` + `eager` + `tabIndex: -1`。
5. **閱讀順序為視覺而非插入。** `A11yProjectionManager.sortNormalElementsVisually` + 區域分桶為 tab/AT 順序；以任意順序插入子節點但由左至右繪製仍須由左至右 tab。`a11yHidden` 永不自透明度推斷。`forcedColors`（`Scene.forcedColors`）為重繪關切而非投射——高對比繪製留在視覺層。
6. **預算不隱藏可見文字。** `contentSemanticBudget` 永不延遲互動帶內的區塊——延遲可見文字會使其短暫不可選取（`Scene.ts:376`）。該保證由 `ContentProjectionSettledWalk.test.ts`（2 vs 802 盒測試）測試。`Infinity` 對 `contentSemanticMargin` 安全，對 `contentProjectionMargin` 禁止——使其不受支援的成本為未開窗的載體帶而非常駐文字。
7. **虛擬化集合宣告資料集大小。** 具 10k 項目但僅 12 個已掛載列的虛擬化列表/網格必須投射 `posInSet`/`setSize`（或 `aria-rowcount`），使 AT 聽到「10000 個中的第 400 項」而非「12 個中的第 3 項」。容器層級的 `aria-setsize` 在 `role="list"` 上不允許（`VirtualList.ts:660`）。

## 延伸閱讀 — 每個主張皆已固定

| 主張                   | `file:line`                                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scene 選項 / 預算      | `Scene.ts:204`, `263`, `328`, `336`, `359`, `600`, `1398`, `1481`, `2403`, `3512`                                                                                                                   |
| Entity a11y + 內容鉤子 | `Entity.ts:295`, `788`, `912`, `968`, `1898`, `1970`, `2018`, `2048`                                                                                                                                |
| 投射管理器             | `A11yProjectionManager.ts:30`, `157`, `169`, `178`, `351` · `ContentProjectionManager.ts:26` · `ContentGridProjector.ts:69` · `content-line-window.ts:25`                                           |
| UI 虛擬化              | `ScrollView.ts:58`, `233`, `289` · `VirtualList.ts:14`, `117`, `170`, `660` · `Table.ts:144`, `392`, `624`, `751` · `Card.ts:80`                                                                    |
| Markdown 平鋪          | `Markdown.ts:625`, `652`, `681`, `774`                                                                                                                                                              |
| 發現 / 基線            | `forge/findings/core-a11y-and-input.md:178`·`240`·`336` · `forge/baselines/content-projection-frontload-findings.md:1` · `content/learn/accessibility.md:353` · `content/reference/core-a11y.md:10` |
| 熱點先例               | `vectojs/AGENTS.md` (Zero-DOM hotspot) · PR #160 · PR #191 · `Table.ts:56`                                                                                                                          |

---

*Next: 04 Streaming Markdown — incremental lex, worker + reconcile, and the `Markdown`↔`ScrollView` virtualization handshake.*
