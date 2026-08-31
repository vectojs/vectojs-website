+++
title = "01 — 畫布原生選取 — 雙世界一致性"
description = "為何畫布沒有選取、VectoJS 如何讓繪製世界與 DOM 選取世界保持一致，以及守護它們的每個嚴格不變量。"
weight = 21
date = 2026-08-29
+++

# 01 — 畫布原生選取 — 雙世界一致性

> 畫布是點陣圖上的墨跡。瀏覽器的選取機制——`Range`、`Selection`、`getBoundingClientRect`、`copy`、`find-in-page`、IME——皆存在於 DOM 中。VectoJS 在每一影格保持兩個世界對齊：**視覺世界**（GPU 繪製的內容）與 **DOM 選取世界**（瀏覽器可選取的內容）。本文件是兩者之間的契約。

## 1. 為何畫布沒有選取

DOM 免費為文字提供三件事：

1. **命中幾何** — `Range.getClientRects()` 回傳瀏覽器為任意子字串自行排版的方框。
2. **剪貼簿來源** — `textContent` + `Selection.toString()` + `copy` 事件為瀏覽器提供可序列化的線性字串。
3. **編輯表面** — `<input>` / `<textarea>` 擁有 IME 候選視窗、`compositionstart/update/end` 與 `selectionStart/End`。

`CanvasRenderingContext2D.fillText` 只寫入像素。瀏覽器無法命名、尋找或複製它們。`find-in-page`（Ctrl+F）、`#:~:text=` 片段連結、翻譯擴充套件、閱讀器模式、螢幕閱讀器與爬蟲皆透過遍歷 DOM 運作——畫布對它們皆不可見。任何想要原生選取的畫布 UI 都必須**投射**一層語意 DOM，並保持其幾何形狀與墨跡在視覺上無法區分。即使 0.5 px 的漂移也會讓高亮明顯滑離字形；一個字元的漂移會複製錯誤的文字；一個字素簇的漂移會破壞 CJK 與 emoji 的游標定位。

失敗永遠是幾何性的——且會與校準疊加。即使正確的逐字素布局也會因 `getBoundingClientRect` 被量化（DPR）、`style.font` 為 getter（Chrome 480×）或覆蓋層的包含塊與合成器競爭（`fixed` vs `absolute`）而漂移。幾何、度量與合成器對齊是一個系統，而非三個。兩個源自同一邏輯字串卻以不同方式度量的布局（不同的 `measureText` 路徑、不同的斷行、不同的 bidi 順序、不同的 tab 停駐點）必將分歧。VectoJS 文字的一致規則是：**一次編譯，兩處消費**——一份保留的幾何方案同時供給繪製與投射，絕不產生兩份獨立布局。

## 2. 兩個世界

```text
┌──────────────────────────────────────────────────────────────────┐
│  Visual world — canvas                                           │
│  source: string ──► LayoutEngine / prepareContentGrid            │
│       │                    │                                     │
│       │  PreparedText / PreparedContentGrid (immutable, retained)│
│       ▼                    ▼                                     │
│  flushRun / per-glyph fillText / MSDF atlas ──► pixels           │
│  at world transform (a,b,c,d,e,f) × DPR × page zoom              │
└──────────────────────────────┬───────────────────────────────────┘
                                │  same source, same plan, same epoch
                                │  same font, same advances, same x/y
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  DOM selection world — a11y / content layer                      │
│  getContentProjection() ──► ContentProjection                     │
│       │  { text, font, lineHeight, baseline, lines[], grid }     │
│       ▼                                                          │
│  Scene.syncA11y ──► per-line carriers (<span>)                   │
│       │  data-vecto-grid-cell / per-grapheme spans               │
│       ▼                                                          │
│  live DOM Range ──► Selection / copy / find / IME anchor         │
└──────────────────────────────┬───────────────────────────────────┘
                                ↕
               calibrated each frame by CanvasGeometry
               + ContentProjectionManager grid calibration
               + DPR / page zoom compensation (256 px basis)
               + font-epoch / viewport-epoch generation stamping
```

兩個世界皆源自**同一邏輯來源**（`source: string`）與同一份保留的幾何方案。為 DOM 重新分段會產生第二份布局，必然不一致：CJK 下不同的斷詞、不同的 bidi 視覺順序、不同的 tab 欄位停駐點、不同的行高分配。投射永不重新排版；它重用引擎自身的座標。

`packages/text/src/PreparedContentGrid.ts` 中的預備網格與 `packages/layout/src/LayoutEngine.ts` 中的散文僅在單位上不同（網格單元 vs CSS px）——兩者皆為每個單元/字形發射 `x/advance/level`，因此同一份 Bidi 感知的定位可同時服務兩者。

承載 carriers 的覆蓋層本身就是一個幾何產物。`CanvasGeometry.syncOverlay`（`packages/core/src/tree/scene/CanvasGeometry.ts:1`）透過 `getBoundingClientRect` 保持 `a11yRoot`/`portalRoot` 層與畫布 CSS 盒對齊，包含 `position: fixed` vs `absolute` 包含塊的區別——該區別決定滾動是否根本需要 JS 補償（§4.3）。覆蓋層的 CSS `transform: scale(cssWidth/width, cssHeight/height)` 將邏輯 Scene 座標映射到 CSS 盒上；內容投射管理器再將邏輯行座標映射到其上。

## 3. VectoJS 如何橋接

### 3.1 一份保留方案，兩個消費者

**散文文件** — `Markdown`（`packages/markdown/src/Markdown.ts`）、`RichText` / `Text`（`packages/ui/src/RichText.ts`、`packages/ui/src/Text.ts`）透過 `LayoutEngine`（`packages/layout/src/LayoutEngine.ts:1`）進行布局。引擎發射帶有 `nodes: PreparedGlyph[]` 的 `LayoutResult`，每個攜帶 `x / y / width / height / sourceIndex / sourceLength / isRTL / style / object`。`RichText.buildVisualLineGroups()`（`packages/ui/src/RichText.ts:668`）按基線（`node.y + 0.8*height`）對字形分組，以 `projectedSlice()`（`packages/ui/src/RichText.ts:506`）切片 `sourceText`，使行內物件的 `alt` 在 DOM 文字中替代 `U+FFFC`，同時保持 `sourceIndex` 運算完整，並發射帶有 `runs`、`perGraphemeCarriers`、`shapedPaint`、`lineHeight`、`baseline`、`font` 的 `ContentProjection.lines[]`。粗粒度層（`hint.textOnly`）僅回傳 `{ text, font, lineHeight }` 而不建立行——對視埠外的區塊為 O(1)。畫布的 `render()` 與 `getContentProjection()` 共用同一個 `result` 物件；同一性（`===`）即為失效訊號（`packages/ui/src/RichText.ts:259`，`_lineGroupsCache`）。`Markdown` 在文件尺度做同樣的事，以 `contentSemanticBudgetLeft` 門控的實體化（`packages/core/src/tree/Scene.ts:600`，`DEFAULT_CONTENT_SEMANTIC_BUDGET = 256`）組合 `RichText` 區塊的 `Stack`。

**類程式碼網格** — 終端機、編輯器、`CodeBlock`（`packages/markdown/src/markdown-code.ts`）透過 `prepareContentGrid()`（`packages/text/src/PreparedContentGrid.ts:prepareContentGrid`）編譯。輸入為 `font`（CSS 簡寫）、`cellWidth`、`lineHeight`、`baseline`、`tabSize`。輸出為不可變的 `PreparedContentGrid`（`kind: 'content-grid'`、`revision`、`lines: PreparedContentGridLine[]`），其中每個 `PreparedContentGridCell` 攜帶 `sourceStart/End`、`sourceCaretOffsets`（合法的字素邊界）、`glyph`（已塑形）、`x`、`advance`、`level`（bidi）。阿拉伯文塑形（`ArabicShaper.ts`）與 bidi 重排（`BidiResolver.ts:reorderVisual`）僅執行一次；單元保持邏輯來源順序，以 `x` 編碼視覺順序。`Typography.cssLineBoxBaseline()`（`packages/text/src/Typography.ts:cssLineBoxBaseline`）透過共用的已附加上下文自 `fontBoundingBoxAscent/Descent` 推導畫布相容的基線——兩個世界使用同一數值。該網格以 `ContentProjection.grid` 回傳，並同時重用於繪製與投射；tab、寬幅 CJK/emoji（`isWideCluster`）、`VS15/VS16` 變化、ZWJ 簇、bidi 層級、`CR/LF/CRLF` 來源歸屬（`nextSourceStart`）共用同一方案。

**為何保留很重要。** 為 DOM 重新分段會產生第二份布局。在 `compare-pretext.ts` 上度量：天真的 `0.5em` 備援在日文上誤差高達 50%，而 VectoJS 在取得真實度量時與 DOM 真值達到 0% 行數誤差。兩份布局必將不一致；一份方案消除了疑問。

### 3.2 逐字素載體 — 唯一正確的粒度

`Scene.syncA11y` 為可選取散文具體化每個**字素**一個不可見載體 `<span>`（`packages/core/src/tree/Scene.ts:760` 起，`perGraphemeCarriers` 路徑）。每個載體的寬度是該行實際字型下**孤立**字素的 advance；其 `left` 為該索引處已塑形前綴寬度減去累積的邏輯偏移。為何逐字素：

- 粗於一個字素的載體早已失敗，因為載體內的誤差是**字距**，而非網格擬合。混合 CJK+Latin 在**兩個**字素共用一個載體時為 −0.582 px（`vectojs-docs/KNOWN_ISSUES.md:137`）。非線性、逐簇，任何均勻修正皆無法吸收。
- Gecko 將 DOM 布局的 advance 網格擬合至整數裝置像素，而畫布的 `measureText` 保留小數：每字元約 0.36%，線性累積。`text-rendering: geometricPrecision` 與關閉字距/連字測得與 `auto` **完全相同**——沒有 CSS 逃生艙（`packages/text/src/measureContext.ts:34`，`KNOWN_ISSUES.md:131`）。每字素一個載體是已發布的修正；`Monospace`（均勻 advance）則完全關閉此機制（0 漂移，無載體）。
- 載體為 `position: relative` + `display: inline-block`，以 `left = run.x − runningLogicalX` 按邏輯 DOM 順序排列（`packages/ui/src/RichText.ts:584`，`Scene.ts` 逐字素路徑）。絕不使用 `absolute`——它會將行內盒區塊化（`computed display: block`），且布局感知的純文字序列化會在每個區塊盒處中斷：`innerText` 產生 16 個換行 vs 正確的 2 個，0 個空格 vs 正確的 14 個（`KNOWN_ISSUES.md:190`）。流式相對定位保持複製、頁內尋找與螢幕閱讀器將一行視為一行。RTL/bidi 共用此路徑；視覺 `x` 來自 `BidiResolver` 層級，DOM 順序保持邏輯性。

例外是 `ui/Text` 的快速路徑：每行一次已塑形的 `fillText`（墨跡包含字距/連字）宣告 `ContentProjectionLine.shapedPaint = true`（`packages/ui/src/RichText.ts:shapedPaint`）。其載體刻意使用**已塑形**前綴差值——與繪製一致（§4.1）。對齊行永不使用逐字素載體；它們重用布局自身的 `positionedRuns` 幾何（`packages/ui/src/RichText.ts:626`）。

分段本身透過 `Intl.Segmenter` 且 `granularity: 'grapheme'`（`packages/text/src/PreparedContentGrid.ts:graphemes`、`packages/core/src/tree/Scene.ts:graphemeBoundaries`）完成。備援為確定性的碼點級分段器（`fallbackGraphemes`），涵蓋組合標記、變體選擇器（`VS15/VS16`）、emoji 修飾符、按鍵帽、區域指示符與 ZWJ。等寬字型完全不需要分段（單元即字元；`PreparedContentGrid` 對單元網格中的 emoji 仍具 ZWJ 感知）。

### 3.3 內容網格投射 — 保留路徑

網格載體為攜帶 `data-vecto-grid-sourceStart/SourceLength/advance/x/level/caretOffsets/font/lineHeight` 的 `data-vecto-grid-cell` span（`packages/core/src/tree/scene/ContentGridProjector.ts:291`）。它們：

- **已開窗** — 僅視埠附近的行會掛載（`contentProjectionMargin`，`packages/core/src/tree/Scene.ts:projectedLines` 中的提示 `minY/maxY`）。螢幕外載體為 `display: none`，不會攔截輸入。
- **已重用**（`carrier reuse`，`#244`）— 串流附加會在原地重用未受影響行的已校準 `scaleX` 變換（`packages/core/src/tree/scene/ContentProjectionManager.ts:536`）。僅重建的尾部單元處於待校準狀態。
- **字型鏡像** — `ContentGridProjector` 將字型鏡像至 `data-vecto-grid-font`，使校準能以純字串形式讀回，而無需觸碰 `target.style.font`——後者在 Chrome 中每次讀取都會重新序列化（`ContentProjectionManager.ts:292`，§4.4）。

網格中的選取以**來源偏移**快照（`ContentProjectionManager.ts:snapshotGridSelection`、`gridSelectionEndpointOffset`），而非線性 DOM 偏移。`gridSelectionEndpointOffset` 從即時的 `Selection.anchorNode/focusNode` 走訪至載體單元的 `sourceStart`，並加上單元內偏移，箝制於 `sourceLength`（尾隨的硬換行位於同一文字節點但不屬於任何單元）。來源偏移對斷行、開窗與逐單元 `scaleX` 校準保持穩定；線性偏移 0 表示「目前已具體化的第一行」，會隨視窗移動。`gridCaretAtSourceOffset` 透過按邏輯順序掃描 `data-vecto-grid-cell` 將儲存的偏移解析回 `TextCaretPosition`——首個覆蓋的單元勝出，邊界解析為前一單元的結尾（同一游標）。

### 3.4 投射管理器 — 誰擁有什麼

`Scene` 長達 6.5k 行；投射已按 `forge/decisions/file-decomposition-2026-08.md` 分解：

| 擁有者                                     | 檔案                                                       | 擁有的內容                                                                                                                                                                                                                  |
| ------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Scene.syncA11y` + `syncContentProjection` | `packages/core/src/tree/Scene.ts`                          | 遍歷、髒檢查 `ContentSyncState`、四個每同步欄位（`_syncSerial`、`contentSemanticBudgetLeft`、`contentSemanticDeferred`、`contentSelectionPresentThisSync`）、`enforceA11yDomOrder`                                          |
| `ContentProjectionManager`                 | `packages/core/src/tree/scene/ContentProjectionManager.ts` | 選取保留（`preserveSelectionAcrossRebuild`、`snapshotGridSelection`/`restoreGridSelection`）、網格校準（`scheduleGridCalibration`）、空白區域拖曳錨點（`beginBlankRegionDrag`/`gridSelectionLine`）、世代戳記、探針生命週期 |
| `CanvasGeometry`                           | `packages/core/src/tree/scene/CanvasGeometry.ts`           | `clientToScene`、`syncOverlay`、`effectiveDPR`、`sizeGpuCanvas`、`OverlayGeometry` memo                                                                                                                                     |
| `ContentGridProjector`                     | `packages/core/src/tree/scene/ContentGridProjector.ts`     | 載體具體化、`prepareContentGrid` 消費、data-attribute 鏡像                                                                                                                                                                  |
| `A11yProjectionManager`                    | `packages/core/src/tree/scene/A11yProjectionManager.ts`    | 排序（`enforceA11yDomOrder` 委派）、`pruneA11ySubtree`、`removeA11yRecursively`、`getA11yTree`                                                                                                                              |
| `Entity` a11y 鉤子                         | `packages/core/src/tree/Entity.ts:ContentProjection*`      | `ContentProjection` / `ContentProjectionLine` / `ContentProjectionHint` 型別、`getContentProjection(hint?)` 契約、`contentEpoch`                                                                                            |

四個每同步欄位一起移動（`DEC-0020`/`DEC-0022` 禁止拆分）。`syncContentProjection`（624 行）留在 `Scene` 上，因為 `syncA11y` 在自身的遞迴點呼叫它——單獨抽離任一者皆需回邊（`DEC-0019` 規則 1）。投射管理器是第 3 次抽離，並因 `DEC-0022` 縮小範圍；遍歷本身僅作為與 `syncA11y` 的一對一起移動。

### 3.5 同步時機 — 永不讓使用者看到半完成的 DOM

**每影格：先具體化再校準。** 校準為冷兩影格批次（`ContentProjectionManager.ts:700` 起）：影格 N 在遠離螢幕外建立探針（`left: -100000px`、`width: 100000px`、`contain: layout style paint`），影格 N+1 讀取 `Range.getBoundingClientRect().width` 並為每個單元寫入 `scaleX`（`element.style.transform = scaleX(...)`）。重疊執行使穩態串流（無布局變更的附加）成本僅為一次 `querySelectorAll` 選擇器匹配。兩個提前退出避免完全建立探針：`pendingCells.length === 0`（已校準，`vectoGridReady` 從影格回呼發布，絕不同步——否則在同一任務較早布局的載體會交出零寬矩形）與 `measurements.length === 0`（每個待處理單元皆為零 advance 或空，立即加戳）。

**讀取成本：每遍歷一次布局，而非每元素一次。** `selectionPresent()`（`ContentProjectionManager.ts:selectionPresent`）將一次 `Selection.anchorNode` 讀取 memo 至 `presentThisSync`（每同步遍歷一次強制布局）。`releaseSelectionForRebuild` 在既無追蹤錨點亦無即時選取時以低成本拒絕——大量具體化路徑（數百個區塊）無需布局。`presentThisSync` 在每次遍歷頂部失效，並在任何 release 或 `setBaseAndExtent` 後清除。

**世代戳記。** 字型世代（於網頁字型載入時遞增，`createMeasuringContext` 重建）加上 `pageScaleX`（瀏覽器縮放，基準 256 px）組成校準世代（`ContentProjectionManager.ts:524`，`stamp = fontEpoch:pageScaleX.toFixed(4)`）。一次遞增使 `calibrationGeneration` 失效；每個逐單元 `scaleX` 在不觸碰載體的情況下隱含失效。單元攜帶 `data-vecto-grid-calib = generation`，因此重用保持未受影響的行不變。

**重建風險。** 在使用者於未變更前綴擁有選取時替換投射子節點會抹除它——串流訊息在每個附加塊上替換其投射子節點。`preserveSelectionAcrossRebuild`（`ContentProjectionManager.ts:preserveSelectionAcrossRebuild`）將端點快照為線性字元偏移（`projectionAbsoluteOffset`）用於散文，或來源偏移用於網格，在空白區域拖曳進行中時跳過（拖曳中瀏覽器具權威性）或當擁有元素未包含選取時跳過，然後在 `rebuild()` 後對新 DOM 重新解析並透過 `Selection.setBaseAndExtent` 還原。`A11yProjectionManager.ts:211` 中相鄰的 `refocus` 快照對 `document.activeElement` 做同樣的事；選取直到 `KNOWN_ISSUES.md:232` 的串流收合修正前皆無對等物。

**虛擬化邊界。** `contentProjectionMargin`（有限）釋放整個螢幕外區塊；`Infinity` 使它們常駐（在 10k 區塊時每 `syncA11y` 約 137 ms）。瀏覽器尋找涵蓋已具體化的內容；未掛載的虛擬化實體無法被搜尋——應用程式必須讓尋找目標保持常駐。

**為何預算為 256。** 針對兩個已度量成本定尺：每區塊建立一個 `Span` 約 0.4 ms vs 完成遍歷。在 64 時，總牆鐘時間約為 6 倍（`ContentGridPageScaleBasis.test.ts` 時代）且無影格邊界增益（`Scene.ts:595`）。256 是兩目標停止權衡之處。

**遞延預算。** `contentSemanticBudgetLeft`（`Scene.ts:600`，預設 256 區塊）限制一次同步遍歷，使 10k 區塊文件在約 285 次遍歷中完成，而非在一個卡頓影格中完成。`contentSemanticDeferred` 持有溢出；`contentViewportEpoch` 確保重設大小時重新分層而無需移動區塊。遞延尾部的載體在輪到它們之前為粗粒度（`textOnly`）——選取幾何與它們一同遞延，這是正確的，因為螢幕外區塊無法擁有拖曳。

### 3.6 指標 → 游標：點擊如何找到正確的 Text 節點

點擊始於視埠（`clientX/Y`），必須落在邏輯 Scene 座標中的 `TextCaretPosition { node: Text, offset: number }`（`Scene.ts:clientToScene` 僅用於命中測試；投射有自身的反向映射）。

- **散文文件行**（`Scene.ts:nearestOffsetForPoint`）：給定一行的 `Text` 節點，列舉 `graphemeBoundaries()`（與 §3.2 相同的 `Intl.Segmenter`），在每個邊界放置一個收合的 `Range`，呼叫 `range.getBoundingClientRect()` 取得瀏覽器自身的字形方框，並以 `distanceToRectSquared` 選取最近者。游標落在合法的字素邊緣，而非簇內。`distanceToRectSquared` 會對視埠邊緣測試，因此行外的未命中仍解析為最近的端點。
- **網格單元**（`Scene.ts:gridCellCaret`、`nearestGridPositionInLine`）：單元資料 `level/advance/x/caretOffsets` 提供視覺 vs 來源分數。`visuallyRtl = (level & 1) !== 0` 翻轉 `visualFraction → sourceFraction`，然後 `caretIndex = round(sourceFraction × (caretOffsets.length−1))`。該映射具 Bidi 感知：RTL 單元最右的視覺點即其邏輯起點。`nearestGridPositionInLine` 對 `localX ∈ [x, x+advance]` 的單元預過濾精確命中，再按水平距離選最近。
- **仿射變換下的網格行**（`Scene.ts:clientToGridLocal`）：快速路徑讀取置於第 0 行的三個 `data-vecto-grid-basis="origin/x/y"` 標記（`ContentGridProjector.ts:basis markers`），並透過反轉 2×2 基底（`determinant = xx*yy − xy*yx`）還原仿射。備援路徑反轉內容根的 CSS `transform`（`parseCssMatrix`）並補償 `canvasRect → logical` 的 DPR/頁面縮放比例。兩者皆以同一行列式閾值（`1e-9`）把關。當行未旋轉/縮放（`a>0, d>0, |b|,|c| ≤1e-9`）時，`Scene.ts:nearestGridPosition` 跳過完整反轉，直接以 `localX = (clientX − rect.left)/scaleX` 映射，多一條低成本路徑。

三者共用一套詞彙：`collectTextNodes` / `projectionAbsoluteOffset` / `projectionCaretAt`（`packages/core/src/tree/scene/content-caret.ts:1`）。後者的 `affinity: 'forward' | 'backward'` 將邊界偏移釘在前導或尾隨文字節點——即將選取還原至單元 N 結尾 vs 單元 N+1 開頭的差別，兩者為同一游標。

### 3.7 基線契約：一個數值，兩個渲染器

畫布文字與內容投射必須在 CSS 行盒內使用相同的基線偏移，否則第一行之後的每一行皆累積垂直漂移（在 24 px 時測得每行約 0.35 em 加第 0 行約 6 px，於 CTX-0333/0334 修正）。

`Typography.cssLineBoxBaseline()`（`packages/text/src/Typography.ts:cssLineBoxBaseline`）為單一來源：`baseline = (lineHeight − ascent − descent)/2 + ascent`。三層：

1. **已附加畫布**（`getSharedMeasuringContext().measureText('Mg').fontBoundingBoxAscent/Descent`）——與繪製畫布相同字型（§4.2 分離警示；`Typography.ts:32`）。LRU 512 項，以 `font\0lineHeight` 為鍵（`BASELINE_CACHE_MAX = 512`），命中時刷新 LRU。
2. **已註冊度量**（`getFontMetrics(family).ascenderEm/descenderEm × size`，`Typography.ts:registeredBaseline`）——尚無畫布時或 SSR 中，以同樣置中公式使已註冊字型與真實瀏覽器一致。負的 `descenderEm` 翻轉為正以匹配畫布極性。
3. **備援** — 當字族無 ascender/descender 時為 `lineHeight × 0.8`。保留確定性的無 DOM 契約；SSR 與瀏覽器僅在此備援上不一致，而非缺少布局。

所有在行盒內置中字型度量的工作流皆須呼叫此函式——`RichText.buildVisualLineGroups`、`TextEntity`、`MSDFTextEntity`（當字形與來源一對一時）、`ContentGridProjector`。在此契約之前，`TextEntity`/`MSDFTextEntity` 使用臨時的 `0.8em` 與 `(ascender−descender)em` 間距，在 Firefox 中與投射錯位約 6 px + 0.35 em/行（於 CTX-0333/0334 修正）。

### 3.8 度量鏈：advance 的解析順序

並非所有環境皆有畫布。三層，按 `resolveGlyphMeasurer()`（`packages/layout/src/measure.ts:resolveGlyphMeasurer`）的優先順序查閱：

| 優先級 | 來源                                            | 檔案                                                                                         | 度量內容                                                                                                                           | 勝出時機                                                                                          |
| ------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1      | Canvas（`createCanvasMeasurer`）                | `packages/layout/src/measure.ts:18`                                                          | 逐字素 `ctx.measureText(char).width` 於 `baseSize=100`，線性推導（`base × fontSize/100`），快取鍵為 `size+family+char+bold/italic` | 擁有畫布的瀏覽器 — 度量渲染器實際繪製的字型，包含合成字重                                         |
| 2      | 已註冊 MSDF/DOM-free（`createMetricsMeasurer`） | `packages/layout/src/measure.ts:108`、`packages/text/src/fontMetrics.ts:registerFontMetrics` | `advanceEm(char) × fontSize` 或 `measureEm(text)` 用於整串（涵蓋逐字形無法處理的字距）                                             | Node SSR、無 `OffscreenCanvas` 的 worker、測試 — 啟動時一次 `registerFontMetrics(family, source)` |
| 3      | 備援                                            | `packages/layout/src/LayoutEngine.ts:unmeasuredGlyphs`                                       | 每字形 `0.5em`                                                                                                                     | 最後手段 — `unmeasuredGlyphCount()` 回報數量                                                      |

鏈規則：畫布刻意勝出（`measure.ts:resolveGlyphMeasurer` 註解）。優先採用已註冊度量會讓陳舊的註冊覆蓋在擁有真值的環境中的真值。已註冊的 bold/italic 被忽略（每字族單一 advance 表）；`createCanvasMeasurer` 從真實渲染解析逐字重，權重重要時必須使用它。`LayoutEngine`（`packages/layout/src/LayoutEngine.ts:92`）對每個 `StyledSpan` 執行以 `fontFamily/bold/italic` 呼叫度量器，因此行內 `monospace` 或粗體執行以自身度量斷行。`fontMetricsVersion()` + 每度量器 `baseVersion` 快取避免每字形 `normalizeFamily` 配置（當每字形執行時測得 +13%）。

`EMPTY_GLYPH_ATLAS`（`packages/layout/src/LayoutEngine.ts:EMPTY_GLYPH_ATLAS`、`packages/ui/src/RichText.ts:371`）為凍結的同一性——而非全新的 `{}`——因此引擎的段落 memo（`prepareRich` + `prepare`）不會在每次布局時失效（測得 2.68×：12 段落 200 次重排自 88 ms → 32.8 ms，0 → 2388 命中）。

### 3.9 串流與開窗：選取與文件尺度的交會

`Markdown`（`packages/markdown/src/Markdown.ts:681`）組合 `RichText` 區塊的 `Stack`。兩種正交的開窗機制與選取互動：

- **`virtualizeBlocks`**（`MarkdownOptions.virtualize`，`Markdown.ts:614`，`virtualOverscan` 預設 800）— 視埠附近的頂層區塊掛載；螢幕外高度以 `RowHeights`（`height+blockGap` 上的 Fenwick 樹）表示。與串流（`createStream`/`appendMarkdown`）不相容：會虛擬化的文件必須一次渲染完整。呼叫者需在每個滾動影格驅動 `setVisibleRange`（`ScrollView` 會自動為之）。
- **`tableViewportHeight`**（`MarkdownOptions.tableViewportHeight`，`Markdown.ts:652`）— 逐表格列虛擬化（`Table` 將自身列虛擬化至固定的 `viewportHeight`）。獨立於區塊開窗；串流中可運作，因為 `Table.appendRows` 延遲掛載。適用於每個表格，短表格亦包含——依構造，兩列表格亦固定為此高度（Table 將 `viewportHeight` 視為 `readonly`）。

`Markdown.streamStats`（`Markdown.ts:951`）— 低成本常駐計數器——區分**傳輸**（`tokensPrefixMatched`/`tokensReturned`）與**解析器成本**（`lexerMs`/`sourceCharsLexed`）。舊命名混淆兩者，使讀者去優化已解決的 delta 路徑。worker 的 `incrementalLex` 跳過穩定前綴的詞法分析；退化的形狀（兩種 `DegradeReason` 情況）仍為每次附加支付 O(document)——`sourceCharsLexed` 追蹤文件長度即為訊號。`stablePrefixChars` 由 worker 自身的 `IncrementalLexCache.stableOffset` 發送，而非每回應重新加總（在 n 塊串流上為 O(n²)，#657）。

`CodeBlock`（`packages/markdown/src/markdown-code.ts`）與展示數學（`MathBlock`，`packages/markdown/src/markdown-math.ts`）**並非**註冊的圍欄區塊渲染器（`Markdown.ts:138`）。註冊表接收 `(source, lang, options)`，但兩條路徑皆需實例狀態——供 `onDemand` 場景的 `subscribeInlineMathRepaint` 與 `subscribeInlineMathRaster` / `subscribeInlineImageRaster`，加上讓公式可達選取/尋找/複製的單一物件 `RichText`。註冊表副本曾靜默分歧（`MathBlock` 以 `(mathRender, source, ...)` 建構，而簽名為 `(formula, svgUri)`），破壞 7 項測試（`Markdown.ts:154`）。註冊表是供套件未實作語言的擴充點。

複製相關性：`Table` 儲存格按單元投射；`CodeBlock` 網格使用 `PreparedContentGrid`；`MathBlock` 公式為投射文字加可存取名稱；每個僅在已具體化時參與尋找/選取。跨多區塊選取的剪貼簿複製為每區塊 `projectedSlice` 的串接——依 §3.1 的行內 SVG/Math `alt` 替代保持偏移完整。

### 3.10 基線與為何存在

`forge/baselines/*` 與 `vectojs-docs/forge/baselines/*` 固定本文件引用的數據，使未來變更可被二分而非憑傳聞重測。具體：256 px 基準表（1/2/4/10/100/1000 px → 0.9921875…1.0）、Firefox 上 `monospace/serif/sans-serif` 的分離 vs 已附加 `measureText('MMMMMMMMMM')` 三元組（`measureContext.ts:1`）、64.8 px 滾動 vs 渲染錯位（661 影格 / 630 px 平滑滾動）、288/290 ms `style.font` getter 成本（Chrome vs Firefox 0.6 ms）與 `Stack` + `RichText` 區塊 memo 命中率（`EMPTY_GLYPH_ATLAS` 後 0 → 2388）。`KNOWN_ISSUES.md` 記錄逐字素拒絕（兩個字素 → 混合 CJK+Latin 上 −0.582 px）與 `absolute` 載體純文字失敗（16 換行 vs 2，0 空格 vs 14）。當新引擎或主機回報不同落差時，在固定的 `DPR/ZOOM` 下重跑 harness 並對照基線提交——差異在於檢視器錯誤或 VectoJS 回歸。`packages/core/test/ContentGridPageScaleBasis.test.ts` 是量化唯一的單元級 oracle；其餘皆需有頭瀏覽器（COOP/COEP 以取得 `performance.now` 保真度、聚焦視窗以取得合成器回呼——見 `vectojs-performance` skill）。

## 4. 困難之處 — 附憑據

### 4.1 字距漂移：整串 vs 孤立 advance

布局透過加總**孤立**逐字素 `measureText(char).width`（`packages/layout/src/measure.ts:createCanvasMeasurer` → `getSharedMeasuringContext()`，`baseSize 100` 以算術縮放）定位字形。繪製保持在布局的 0.5 px 內（`packages/ui/src/RichText.ts:COALESCE_TOLERANCE_PX`）——`flushRun` 僅當 `abs(measureText(runText) − sum(isolated)) ≤ 0.5`（`RichText.ts:1001`）時將一個執行合併為一次 `fillText`，否則退回在 `node.x` 的逐字元繪製。整串 `measureText(text).width` 包含畫布永不繪製的字距。使用整串寬度的載體因此**領先墨跡達累積的字距差**，在約 300 px 的 16px 拉丁字距密集行上高達 5–8 px，Gecko 與 Blink 皆然（`KNOWN_ISSUES.md:168`）。

修正：載體寬度遵循該行的繪製模型，透過 `ContentProjectionLine.shapedPaint`。逐字形繪製器（`RichText`、核心 `TextEntity`）取得孤立字素 advance；`ui/Text` 的快速路徑（每行一次已塑形 `fillText`）宣告 `shapedPaint` 並保留已塑形前綴差值的載體。對齊行重用布局自身的 `positionedRuns` 幾何，從未有此漂移。`logicalRuns` 透過 `mctx.measureText(segment)`（`RichText.ts:598`）加總孤立 advance；`positionedRuns` 直接重用 `node.x/width`。`Scene.ts` 中的逐字素路徑鏡像此分支。

姊妹修正：`RichText.logicalRuns` 先前對每個執行使用整串度量；`Scene` 的逐字素路徑度量已塑形前綴差值——同類、同修正（PR #460，`@vectojs/core@1.35.1` + `@vectojs/ui@2.16.3`）。

### 4.2 DPR 量化與 256 px 頁面縮放基準

瀏覽器將 `getBoundingClientRect().left` 四捨五入至 **1/64 裝置 px**（`ContentProjectionManager.ts:62`，`CanvasGeometry.ts:PAGE_SCALE_BASIS_PX`）。1 px 探針量化為 1/64 的倍數；在 DPR 1.1 時還原的頁面縮放為 **0.9921875**（=63.5/64），真值為 1.0——0.78% 誤差（`ContentProjectionManager.ts:68`）。每個逐單元 `scaleX = advance * scale / natural`（`ContentProjectionManager.ts:717`）按該因子縮小：18.0001 px 間距被選為 17.8624 px，在每個 CJK 縫隙留下 **0.133 px** 間隙、每個拉丁縫隙 0.061 px；在 DPR 1.1 時這些落在裝置像素邊界並繪成垂直白線 `使|用|sudo`（`ContentProjectionManager.ts:71`）。在同一頁面上以基準 1/2/4/10/100/1000 px 度量：`0.9921875, 1.0, 0.998046875, 1.0, 1.0, 1.0`——每個 ≥10 px 的基準完全一致；1 px 讀數為離群值。

修正：以 **256 px** 度量（`PAGE_SCALE_BASIS_PX = 256`，`ContentProjectionManager.ts:85`）。最壞情況變為 `1/64 / 256 = 6.1e-5`（在 18 px 上殘差 0.0011 px，約為瀏覽器可表示像素的 1/100），同時遠在探針的 100000 px 寬度內，因此不會引入捲軸或自身布局（`ContentProjectionManager.ts:80`）。測試 oracle：`packages/core/test/ContentGridPageScaleBasis.test.ts` 直接建模量化。

姊妹問題：分離的度量畫布在 Firefox 上對通用字族解析錯誤（`packages/text/src/measureContext.ts:1`）。`22px monospace` 分離時 109.737 vs 已附加 131.579 vs 布局 132.000；`serif` 分離時收斂至 `monospace` 的備援（`serif` 上 −47%、`monospace` 上 −20%）。僅 `sans-serif` 恰好一致，這正是僅以 Chromium 測試隱藏它的原因。每個度量器必須使用 `getSharedMeasuringContext()`（已附加、父為 `document.body`、永不 `display: none`）。`OffscreenCanvas` 度量正確（132.000）但契約是「在繪製處度量」——已繪製的畫布已附加，因此度量的亦須如此。殘差約 0.3% 的已附加 vs 布局落差是 §4.4 的 Gecko 網格擬合，而非此問題。

### 4.3 合成器 vs 主執行緒 vs fixed/absolute 漂移

`position: fixed` 的全視埠畫布透過視埠在**主執行緒外**合成；`absolute` 覆蓋層則對滾動文件布局。透過在每個**已渲染**影格自 `parent.getBoundingClientRect()` 重新推導 `top` 來保持兩者一致，使覆蓋層在滾動前進而無渲染時保持陳舊。在真實的全視埠場景上度量，以按鍵驅動的平滑滾動經 630 px：661 個取樣影格中，**1 影格錯位 64.8 px**（`CanvasGeometry.ts:191`）。

修正：覆蓋層繼承畫布自身的 `position`（`CanvasGeometry.ts:206`，`getComputedStyle(canvas).position`）。`fixed` 對視埠解析 `left/top`——恰為 `canvasRect.left/top`（`CanvasGeometry.ts:222`）；`absolute` 保持父相對運算並含 `clientLeft/scrollLeft`（`CanvasGeometry.ts:226`）。滾動遂無需 JS 補償；修正**移除**逐影格依賴，而非更頻繁同步。滾動監聽器仍會作為主執行緒工作與合成器競爭。剩餘寫入皆被 memo（`OverlayGeometry: left/top/cssWidth/cssHeight/width/height/position`，`CanvasGeometry.ts:235`），因此未變更的影格不寫入——相同的賦值仍觸碰 CSSOM 並隨覆蓋層數量增長（`CanvasGeometry.ts:250`）。

### 4.4 CJK 次像素縫隙與字型查找成本

在縮放修正後，殘差漂移為約 0.36% 的 Gecko 網格擬合（布局對齊至整數裝置 px，畫布保留小數）——`text-rendering: geometricPrecision` **不是**修正，測得與 `auto` 相同（`packages/text/src/measureContext.ts:34`，`KNOWN_ISSUES.md:131`）。同類驚喜產生第二個獨立的效能陷阱：`style.font` 為即時簡寫 getter，每次讀取皆自每個字型 longhand 重新序列化。逐單元讀取 `target.style.font` 一次的校準掃描在 Chrome 中支付 **288 ms / 290 ms（99.3%）**，而 Firefox 在相同迴圈僅花 0.6 ms——480× 跨引擎落差，唯一訊號為引擎而非工作量（`ContentProjectionManager.ts:292`）。修正：載體儲存純 `data-vecto-grid-font` 字串（`ContentGridProjector.ts:291`），`ContentProjectionManager` 讀取該值。探針上的 `contain: layout style paint` 將其隔離。

### 4.5 IME、剪貼簿與可編輯鏡像

`Input` / `TextArea` **並非**內容投射。它們投射一個真實透明的 `<input>` / `<textarea>`（`Site:Accessibility & Automation` §IME 感知輸入欄、`packages/core/src/tree/Scene.ts:a11y input mirror`、`packages/ui/src/Input.ts` / `TextArea.ts`）。瀏覽器擁有 IME 候選視窗；畫布自陰影節點的 `input`/`change`/`compositionstart/compositionupdate/compositionend` 事件鏡像 `value/selectionStart/selectionEnd/composition`，並逐影格繪製游標、選取高亮與 IME 底線。陰影節點透過來自 `Entity.getA11yAttributes()` → `Scene` 以 `box-sizing: border-box` 套用的 `textInputStyle: { font, lineHeight, padding }` 定尺，而畫布自相同內距與 `Typography.cssLineBoxBaseline` 繪製——一個基線，兩個消費者，隱形編輯器與其墨跡鏡像間無垂直漂移。

聚焦期間，`Scene` 避免寫回相同使用者同步的 `value`（回聲抑制）：若應用程式狀態提供真正不同的值則套用，但受控元件若替換文字必須有意保留 `selectionStart/End`，否則游標跳動。`Input` 為單行 `a11yFullViewport` 感知實體；`TextArea` 為多行 `clipChildren` 感知的滾動器，其 `scrollLeft`/`scrollTop` 鏡像至畫布——與任何其他實體相同的世界變換 → 覆蓋層路徑，因此 DPR/縮放/旋轉皆同等適用。

剪貼簿路徑：`cut/copy/paste` 與 `undo/redo` 對可編輯欄位為原生，經由該陰影節點。對於靜態可選取文字，`copy` 為瀏覽器對投射層自身的序列化：`projectedSlice()`（`packages/ui/src/RichText.ts:506`）在**來源**空間以每個行內物件的 `alt` 替代 `U+FFFC` 哨兵，使 `LayoutNode.sourceIndex` 運算保持完整——長度非 1 的 `alt` 否則會偏移其後每個偏移並使選取框失同步。姊妹 `accessibleText()`（`RichText.ts:478`）存在於 `aria-label` 路徑，刻意不用於切片。`SeparatorAfter`（邏輯換行 / 保留的軟換行分隔符，`ContentProjectionLine.separatorAfter`）被合併至該行最終文字節點，使 Firefox 無法將多行選取的一部分置於投射根。`Table` 儲存格複製、`CodeBlock` 網格複製與 `MathBlock` 公式複製皆流經每區塊 `projectedSlice` 串接——依 §3.1 的行內 SVG/Math `alt` 替代保持跨區塊邊界的偏移完整。

警示故事：`packages/devtools/src/selectionAudit.ts:119` 曾擷取 `getSelection()` 然後呼叫 `removeAllRanges`（`:157`）——一個摧毀使用者狀態的稽核。目前的稽核（`selectionAudit.ts:102`）使用分離的 `Range`（`document.createRange()` + `selectNodeContents` + `getClientRects`），從不觸碰 `DocumentSelection`；沒有需清理的程式化選取。保持使用者的選取原樣。

### 4.6 字素、字距與 CJK 白縫 — 看似渲染瑕疵的錯誤

`使|用|sudo` 產物讀來像 GPU 錯誤：相鄰漢字間的垂直白線。它是透過光柵看到的選取投射錯誤。鏈條為：

1. `getBoundingClientRect().left` 在 1 px 基準下量化至 1/64 裝置 px → `basisScale` 在 DPR 1.1 時低 0.78%（`ContentProjectionManager.ts:68`）；
2. `scaleX = advance × basisScale / natural` 低 0.78%（`:717`）；
3. 每個 `data-vecto-grid-cell` 繪製 `advance` 寬，但選取框自 `advance × scaleX` 定尺 → 每個 CJK 縫隙短 0.133 px（`:71`）；
4. 在 DPR 1.1 時短缺恰落在裝置像素邊界 → 合成器留下一欄未覆蓋 → 白色。

拉丁縫隙為相同幾何（0.061 px），但較窄的 `advance` 隱藏它。更換光柵器、切換至 `geometricPrecision` 或停用字距皆無效——縫隙不在墨跡中，而在墨跡繪製所用的 `scaleX` 中。守衛此的測試為頁面縮放基準 oracle（`ContentGridPageScaleBasis.test.ts`）加上在 `DPR=1.1` 的有頭 harness；無頭 DPR 1 無法復現。

### 4.7 校準並非一次性修正 — 字型、DPR 與視埠各自強制重戳

逐單元 `scaleX` 僅在其度量瞬間為 `advance × (pageScale × deviceScale) / natural`。三個輸入任一可在實體未移動的情況下改變：網頁字型完成（`contentFontEpoch` 遞增，`watchFontMetrics` → 世代，`Typography.clearCssLineBoxMetrics`）、使用者縮放（經 `getBoundingClientRect` 256 px 基準的頁面縮放，`ContentProjectionManager.ts:524`）或 `devicePixelRatio` / 畫布尺寸變更（`Scene.resize` → `CanvasGeometry.effectiveDPR` → `contentViewportEpoch`）。`calibrationGeneration`（`ContentProjectionManager.ts:calibrationGeneration`）將它們合併為一個計數器，使一次比較即失效所有單元。遺漏此的失敗為靜默：舊的 `scaleX` 保留，載體寬度錯誤，`selectionAudit` 回報隨行長增長的漂移，但重新整理後消失。`data-vecto-grid-calib` 為需觀察的欄位——任何在縮放後存活的帶 `generation` 戳的單元皆為陳舊讀取。

### 4.8 正確性實際如何度量：選取 harness

無頭（`jsdom`、`--disable-gpu`）無 GPU、無合成器、在小數 DPR 下無 `Range` 幾何，且 `performance.now()` 在無 COOP/COEP 時粗化至 100 µs——無法引述選取一致性。僅 `scripts/selection-harness/harness.ts` + `drive.sh` 可以。`harness.ts` 以已知來源、字型、`maxWidth` 建立真實的 `Scene` + `Markdown` + `CodeBlock` 文件，然後 `drive.sh` 在專用的 Hyprland 工作區以 `DPR` × `ZOOM`（`--force-device-scale-factor`、`layout.css.devPixelsPerPx`、`scripts/selection-harness/drive.sh:6`）啟動**真實有頭** Chrome 與 Firefox，並透過使用者命中的同一 `clientToGridLocal` / `nearestOffsetForPoint` 路徑驅動原生拖曳。`selectionAudit.ts:1` 為 oracle：`expectedLeft/Right` 來自 `ContentProjectionLine` 幾何 vs 來自即時 DOM `Range` 的 `actualLeft/Right`，單位為**局部邏輯 px**（已除去 DPR/縮放）。空陣列表示每個選取框皆跟隨其字形；任何發現皆攜帶 `entityId`、`entityPath`、`line`、`leftDrift/rightDrift` 以供二分。

harness 專為捕捉的三種失敗模式：對齊的行間間隙、RTL/bidi 視覺重排 + `dir="ltr"` 固定，以及小數 DPR/縮放捨入（`scripts/selection-harness/README.md:8`）。無頭 DPR 1 隱藏在 DPR 1.1/1.6 發布的 256 px 量化錯誤與約 0.36% Gecko 網格擬合——在宣稱一致前，請同時在 `DPR=1.5 ZOOM=0.9` 與 1× 下執行 harness。

## 5. 開發者必須保持的不變量

> 每個不變量皆為兩條程式路徑必須就一個數值與一個方向達成一致之處。若不一致，使用者會看到縫隙、偏移的高亮或遺失的選取——而無頭測試會隱藏它。`file:line` 為檢查位置，而非建議。

1. **在繪製處度量。** 使用 `getSharedMeasuringContext()`（`packages/text/src/measureContext.ts`）——已附加、父為 `document.body`、`opacity: 0` 位於 `left: -9999px`，永不 `display: none`。絕不為通用字族使用分離畫布；絕不在無文件樣式上下文的情況下重測 `serif`/`monospace`。`fontMetrics.ts`（`packages/text/src/fontMetrics.ts:registerFontMetrics`、`registerMSDFFontMetrics`）為無 DOM 備援（MSDFAtlas `advance`/`kerning`/`ascender/descender`），而非瀏覽器中的首選路徑。網頁字型載入後，呼叫 `clearCssLineBoxMetrics()` 並讓 `watchFontMetrics` 遞增世代——陳舊的快取 advance 在任何投射涉入前即為行寬錯誤。
2. **一份方案，兩個消費者。** 類程式碼實體：一次 `prepareContentGrid()` → 同一不可變物件供繪製與 `getContentProjection().grid`（`packages/text/src/PreparedContentGrid.ts`）。散文：一次 `LayoutEngine` → 同一 `LayoutResult` 供 `render()` 與 `getContentProjection()`（`packages/layout/src/LayoutEngine.ts`、`packages/ui/src/RichText.ts:284` 快取）。絕不為 DOM 重新分段、重繞或重詞法分析。`EMPTY_GLYPH_ATLAS` 作為 atlas 同一性（`LayoutEngine.ts:EMPTY_GLYPH_ATLAS`）保持段落 memo 熱度。
3. **流式相對載體，按邏輯 DOM 順序。** `position: relative` + `display: inline-block` 且 `left = run.x − runningLogicalX`（`packages/ui/src/RichText.ts:584`）。絕不 `absolute`——它會區塊化並破壞 `innerText`/`textContent` 純文字、`find-in-page` 行連續性與螢幕閱讀器行迭代。RTL/bidi 共用此路徑；視覺 `x` 來自層級，DOM 順序保持邏輯性，使 `innerText` 按來源順序複製。探針上為 `contain: layout style paint`，而非載體上。
4. **絕不為 a11y 樹大小而扼殺載體。** 逐字元 `StaticText` 節點會逐字母朗讀（見 `xuepoo-blog/src/text-utils.ts`）；停用載體會在 Firefox 中恢復約 2 px 漂移。樹成本為真（見 `Site:Accessibility & Automation` §成本隨數量超線性增長：20k 時 6.4 µs → 136.9 µs/實體），但載體並非槓桿——開窗（`contentProjectionMargin`）與 `a11yProjection: 'onDemand'` 才是。
5. **來源偏移是唯一穩定的選取座標。** 線性 DOM 偏移在網格視窗或斷行改變時漂移（`ContentProjectionManager.ts:gridSelectionEndpointOffset`）。將網格快照為 `sourceStart + withinCell`，散文透過 `projectionAbsoluteOffset`/`projectionCaretAt`（`packages/core/src/tree/scene/content-caret.ts`）。親和性 `forward` vs `backward` 決定游標釘在單元邊界的哪一側。
6. **尊重繪製模型。** `ContentProjectionLine.shapedPaint` 告知 `Scene` 使用哪種 advance；對齊行重用布局自身的字形幾何（`positionedRuns`，`packages/ui/src/RichText.ts:626`）。對自然流執行設定 `x` 會翻轉 `hasPositionedRuns` 並強制 `dir="ltr"`——對對齊/RTL 正確，對參差 LTR 錯誤（`RichText.ts:533`）。參差行必須保持 `dir="auto"`，使瀏覽器自行對文字 bidi，游標命中映射保持正確。
7. **繼承覆蓋層定位。** `CanvasGeometry.syncOverlay`（`packages/core/src/tree/scene/CanvasGeometry.ts:206`）必須鏡像 `fixed`/`absolute`——不要每影格自父元素重推導 `top`。對 `OverlayGeometry` 做 memo，僅在新層（`glCanvas`/`gpuCanvas`/`portalRoot`）出現時 `invalidateOverlay()`。
8. **世代戳記，而非掃描。** 字型與縮放變更透過世代計數器（`ContentProjectionManager.ts:calibrationGeneration`，`calibrationStamp = fontEpoch:pageScaleX`）使所有 `scaleX` 失效；不要在世代遞增時觸碰每個載體。單元攜帶 `data-vecto-grid-calib`，因此重用保持未受影響的行不變。
9. **跨重建保留選取 — 但非拖曳中。** `preserveSelectionAcrossRebuild` / `snapshotGridSelection` + `restoreGridSelection` 涵蓋串流重建風險；空白區域拖曳由瀏覽器主導，絕不可中斷。當被選文字不再被投射（視窗滾離——保持 `Range` 分離而非指向已分離的載體）時，`releaseSelectionForRebuild` 為更便宜的姊妹。
10. **一個基線，兩個世界。** 每個行盒——畫布與 DOM——皆呼叫 `Typography.cssLineBoxBaseline()`（`packages/text/src/Typography.ts:cssLineBoxBaseline`）。絕不在備援層外硬編碼 `0.8 * lineHeight`；該常數為備援，而非契約。
11. **不要度量度量器。** `style.font` 為即時 getter（`ContentProjectionManager.ts:292`）；讀取 `data-vecto-grid-font`。同理 `getBoundingClientRect` 強制布局——批次處理（探針路徑）並 memo（`selectionPresent` / `OverlayGeometry`），不要每影格每元素讀取。
12. **虛擬化為選擇加入且互斥。** `Markdown.virtualize` 與串流 `createStream` 不組合（`Markdown.ts:614`）；`tableViewportHeight` 則可（`:652`）。將需尋找的關鍵區塊置於已掛載視窗內，否則無法被尋找——具體化而非 DOM 樹深度決定 Ctrl+F 可見什麼。

## 6. 除錯檢查清單 — 當選取或複製漂移時

### 6.1 量化優先

| 症狀                                               | 首要探針                                                                                                                                                                                                                                                                                                                          | 它告訴你什麼                                                                                                                                        |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 高亮偏移隨行長增長                                 | `auditEntitySelection` / `auditSceneSelection`（`packages/devtools/src/selectionAudit.ts:56`）— 在**局部邏輯 px**（透過 `rootRect.width / entity.width` 移除 DPR/縮放）中比較 `expectedLeft/Right`（投射幾何）vs `actualLeft/Right`（`Range.getClientRects`）。預設容差 2 px；右緣可能需要較寬鬆的 `rightTolerance`（字距累積）。 | 整串 vs 孤立漂移，或 `shapedPaint` 不匹配。                                                                                                         |
| 每個 CJK 縫隙皆可見間隙                            | 檢查 `PAGE_SCALE_BASIS_PX`（=256，`ContentProjectionManager.ts:85`）與 `data-vecto-grid-calib` 世代；重測 `probeOrigin/XRect → basisScale`（`ContentProjectionManager.ts:707`）。                                                                                                                                                 | 頁面縮放量化或縮放/DPR 變更後的陳舊校準。                                                                                                           |
| 重排或串流附加時選取收合                           | `snapshotGridSelection` → `gridSelectionLine`（`ContentProjectionManager.ts:gridSelectionLine`）在擴展拖曳時；驗證 `preserveSelectionAcrossRebuild` 涵蓋擁有元素。                                                                                                                                                                | 線性 vs 來源偏移錯誤，或觸及錨定行的重建。檢查 `blankRegionDrag`（`:blankRegionDragActive`）。                                                      |
| 滾動時覆蓋層高亮分離                               | `CanvasGeometry.overlay`（`CanvasGeometry.ts:OverlayGeometry`）— `position` 與 `left/top` vs `canvas.getBoundingClientRect()` 在 630 px 滾動下。                                                                                                                                                                                  | `fixed` 畫布搭配 `absolute` 覆蓋層，或在加入 `glCanvas`/`gpuCanvas` 後遺漏 `invalidateOverlay`。                                                    |
| 網格就緒但矩形零寬                                 | `scene.getContentElement(id).dataset.vectoGridReady` 時機 — 必須自影格回呼發布（`ContentProjectionManager.ts:566`），絕不同步。                                                                                                                                                                                                   | 拖曳/度量執行時載體尚未布局。                                                                                                                       |
| 字型交換後載體陳舊                                 | `contentFontEpoch` / `contentViewportEpoch` vs `calibrationStamp`（`ContentProjectionManager.ts:calibrationStamp`）。                                                                                                                                                                                                             | 字型載入或重設大小時遺漏世代遞增 — 檢查 `watchFontMetrics`（`RichText.ts:290`）與 `Scene.resize`。                                                  |
| `Selection.toString()` 看似正確但 `innerText` 錯誤 | 比較內容根上的 `innerText` vs `textContent` vs `Selection.toString()`。                                                                                                                                                                                                                                                           | `Selection.toString()` 遍歷文字節點並忽略布局——它無法看到 `absolute` 區塊化的複製失敗。使用 `innerText` 或真實剪貼簿讀取（`KNOWN_ISSUES.md:204`）。 |
| 靜止時選取存活，滾動時破壞                         | `CanvasGeometry.overlay.position` vs `getComputedStyle(canvas).position`（`CanvasGeometry.ts:206`），然後在即時平滑滾動下 `OverlayGeometry.left/top`。                                                                                                                                                                            | `fixed` 畫布而覆蓋層保持 `absolute`——CSS 包含塊而非數學為修正。                                                                                     |
| 僅在 Firefox 或僅在通用字族上漂移                  | `isSharedMeasuringContextAttached()`（`packages/text/src/measureContext.ts:isSharedMeasuringContextAttached`）與 `familyOf`（`packages/ui/src/measure.ts:familyOf`）。                                                                                                                                                            | 通用字族（`monospace`/`serif`）上的分離度量器 — Chromium 隱藏它。                                                                                   |
| `unmeasuredGlyphCount() > 0` 且換行錯誤            | `LayoutEngine.unmeasuredGlyphCount()`（`packages/layout/src/LayoutEngine.ts:31`）— 非零表示部分字形以 `0.5em` 定尺；檢查 `registerFontMetrics` / `hasFontMetrics()`（`packages/text/src/fontMetrics.ts:registerFontMetrics`）。                                                                                                   | 無字型度量註冊的無 DOM 環境 — 行寬與斷行皆為虛構。                                                                                                  |
| 等寬仍漂移                                         | `familyOf(this.font)` vs 行的 `font`（`packages/ui/src/RichText.ts:nodeFont`），以及該字族是否關閉 `perGraphemeCarriers`。                                                                                                                                                                                                        | 行內混合字族，其中 `line.font` 備援（`monospace`）與單元字型不匹配 — 網格路徑已攜帶逐單元字型，散文路徑必須與之匹配。                               |

### 6.2 互動式探針

```ts
// 語意快照 — DOM 實際投射的內容（需在 start() 後一影格）
console.log(JSON.stringify(scene.getA11yTree(), null, 2));

// 單一實體的即時節點 — dataset、矩形與是否擁有選取
const el = scene.getContentElement(entity.id);
console.log(el?.dataset, el?.getBoundingClientRect());
console.log(scene.getA11yElement(entity.id));

// 量化漂移，局部邏輯 px，需真實瀏覽器（布局 + Range）
import { auditSceneSelection } from '@vectojs/devtools';
console.table(auditSceneSelection(scene, { tolerance: 0.5, rightTolerance: 1 }));
// 單一實體，或限制至 ids：
// auditEntitySelection(scene, entity, { tolerance: 0.5 })
// auditSceneSelection(scene, { entityIds: ["my-markdown"] })

// 即時節點上的校準狀態
console.log({
  ready: el?.dataset.vectoGridReady,
  calibration: el?.dataset.vectoGridCalibration,
  pending: el?.dataset.vectoGridCalibrationPending,
  samples: el?.dataset.vectoGridCalibrationSamples,
  calibMs: el?.dataset.vectoGridCalibrationMs,
  fontEpoch: (scene as any).contentFontEpoch,
});

// 幾何讀數 — 局部邏輯 x/y vs 世界變換
import { getContentGeometry } from '@vectojs/devtools';
console.log(getContentGeometry(entity));
```

在 `SceneOptions`（`packages/core/src/tree/Scene.ts:SceneOptions`）中傳入 `debugA11y: true`，以在開發期間以藍色虛線框線標示陰影節點。透過 `scripts/selection-harness/drive.sh`（`DPR=1.5 ZOOM=0.9`，`scripts/selection-harness/README.md`）驅動跨引擎、多 DPR 驗證——無頭 DPR 1 隱藏量化錯誤與在 DPR 1.1/1.6 發布的網格擬合漂移。該 harness 演練對齊行、RTL/bidi 與小數 DPR/縮放，涵蓋 `selectionAudit.ts` 為捕捉而撰寫的三種失敗模式（`selectionAudit.ts:1`）。

### 6.3 探針成本 — 別讓檢查變成回歸

- `auditSceneSelection` 本身對每行呼叫 `getBoundingClientRect`（強制布局），必須在真實瀏覽器上執行，而非在熱迴圈中。不要在影格路徑上發布它——以 QA 切換或 Playwright harness 門控。
- `scene.getA11yTree()` 遍歷 a11y 子樹；它按 `A11yProjectionManager.enforceA11yDomOrder` 排序，對斷言穩定，但在數千個可互動實體上並非免費（見 §5.4 成本表：Chrome 上 20k 時 715 ms）。每驗證快照一次，而非每影格。
- `selectionPresent()`（`ContentProjectionManager.ts:selectionPresent`）為批次處理同一讀取的正式範例：每同步遍歷一次強制布局，而非每元素一次。為任何新增的投射健康檢查複製該模式。

> **關於標題的說明。** 本文件是 boss-01 三部曲之一。保持其 H2 數量與 `order` 穩定，使 `vectojs-docs/content/learn/` 索引與 `reference/core-a11y.md` 錨點不漂移——任何重新命名後檢查 `scripts/sync-content.py`。

## 7. 完整影格 — 六步驟，依序

對於在使用者於未變更前綴擁有選取、DPR 1.6 時以一行擴展串流程式碼區塊的影格：

1. **布局** — `prepareContentGrid` 或 `LayoutEngine.layoutPrepared` 發射新方案；`Stack` 僅重測髒區塊（`updateTokens` / `virtualHeights` Fenwick）。
2. **畫布繪製** — `Scene.render` 遍歷 VMT，套用 `worldTransform × DPR`，發出 `fillText`/`drawImage` 批次。`flushRun` 決策（`COALESCE_TOLERANCE_PX`）已烘焙。
3. **覆蓋層同步** — `CanvasGeometry.syncOverlay` 對齊 `a11yRoot` 至 `canvasRect`，繼承 `fixed`/`absolute`（`CanvasGeometry.ts:206`），已 memo（`OverlayGeometry`）。
4. **具體化** — `syncA11y` / `syncContentProjection` 髒檢查 `ContentSyncState`（世界矩陣、`hasBand`/`visible`、`fontEpoch`/`viewportEpoch`、`tier`），將載體開窗至 `hint.minY/maxY`，重用未受影響網格行的 `scaleX`，建立逐字素 span 或帶 `sourceStart/Length/x/advance/level/caretOffsets` 的 `data-vecto-grid-cell` span。
5. **選取保留** — `ContentProjectionManager.snapshotGridSelection` 以來源偏移、`preserveSelectionAcrossRebuild` / `restoreGridSelection` 於 `rebuild()` 後，或若被選文字滾出則 `releaseSelectionForRebuild`。空白區域拖曳保持由瀏覽器驅動。
6. **校準（冷）** — 影格 N 在螢幕外建立 100000 px 探針；影格 N+1 讀取 `Range` 自然寬度，以來自 256 px 頁面縮放基準的 `basisScale` 計算 `scaleX = advance × basisScale / natural`（`ContentProjectionManager.ts:707`），寫入 `transform`，加戳 `data-vecto-grid-calib`。穩態為一次選擇器匹配；`vectoGridReady` 自影格回呼發布。

任何未經步驟 1 重測的步驟皆產生第二份布局與未來的漂移。任何未經 memo/attribute 路徑讀取 `style.font` 或 `getBoundingClientRect` 的步驟皆支付 §4 的 480× / 每元素布局成本。

---

**延伸閱讀。** `vectojs-docs/content/learn/accessibility.md`（投射模型、IME、頁內尋找、成本表）與 `reference/core-a11y.md`（複合小工具、roving tabindex、`pointerEvents: 'none'` 熱點模式）定下本文件遵循的語調：已度量、逐引擎、具名被拒絕的替代方案、數據與落地的 `file:line`。`forge/decisions/file-decomposition-2026-08.md` §2 解釋為何四個每同步欄位與兩次遍歷僅作為一對移動。`KNOWN_ISSUES.md` §選取高亮 / 定位執行載體 / 核心 TextEntity 投射記錄已修正的漂移與其陷阱。永不「一般應該」——要麼載體在 `node.x`，要麼不在。

## 附錄 — 一次拖曳，觸及的每個檔案

使用者在 `Markdown` 程式碼區塊的空白內距按下，跨三行拖曳後放開。DPR 1.6，`position: fixed` 全視埠場景，Firefox 153：

| 時刻               | 發生了什麼                                                                                                                          | 檔案                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `mousedown` 於空白 | `ContentProjectionManager.beginBlankRegionDrag` 追蹤 `TextCaretPosition`；瀏覽器收合 `Selection`                                    | `ContentProjectionManager.ts:beginBlankRegionDrag`                                  |
| `mousemove`        | `Scene.ts:nearestGridPosition` → `gridCellCaret`（Bidi 感知分數）+ `blankRegionDragActive` 透過 `setBaseAndExtent` 擴展 `Selection` | `Scene.ts:nearestGridPosition`、`ContentProjectionManager.ts:blankRegionDragActive` |
| 下一影格：區塊重排 | `syncContentProjection` 重開窗載體；`snapshotGridSelection` 儲存來源偏移                                                            | `ContentProjectionManager.ts:snapshotGridSelection`                                 |
| 重建               | `preserveSelectionAcrossRebuild` 跳過（拖曳中 → 瀏覽器具權威性）；`clearGridState` 僅釋放非擁有區塊                                 | `ContentProjectionManager.ts:clearGridState`                                        |
| `mouseup`          | `ContentProjectionManager.endDrag` 清除 `blankRegionDrag` + 錨點；`getContentElement` 矩形即時                                      | `ContentProjectionManager.ts:endDrag`                                               |
| 兩影格後           | 探針讀取 `Range.getBoundingClientRect().width`，為被拖曳單元寫入 `scaleX`；`vectoGridReady` 自影格回呼發布                          | `ContentProjectionManager.ts:scheduleGridCalibration`                               |
| 複製（Ctrl+C）     | 瀏覽器自現已校準的載體序列化 `projectedSlice` 文字（alt 已替代、分隔符已合併）                                                      | `RichText.ts:projectedSlice`                                                        |

若任何列被跳過或重排，則 §5 中相同列號的不變量即為需重讀者。
