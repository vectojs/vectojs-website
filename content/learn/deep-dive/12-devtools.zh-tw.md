+++
title = "12 — DevTools — 執行期檢視與稽核"
description = "為何畫布沒有 Elements 面板，VMT 檢視器如何在狀態空間中取代它，以及無頭模型層 — 挑選、幾何讀數、稽核、快照、命中解釋、dirty 影格歸因，以及橋接/外掛協定。"
weight = 32
+++

# 12 — DevTools — 執行期檢視與稽核

> `<canvas>` 沒有 Elements 面板。瀏覽器可以顯示像素與 DOM 鏡像，但無法顯示決定繪製哪些像素、保留哪些鏡像的 Virtual Math Tree。DevTools 就是該面板——一個狀態空間檢視器，使除錯 VectoJS 場景保持以數字而非截圖為準。

- **你將學到**：為何 VectoJS 需要自身的檢視器、面板如何不干擾被檢視場景，以及無頭模型層中的每個純函式 — 樹模型、挑選、實體/a11y/文字讀數、七個幾何層、布局/a11y/文字/選取/GPU/加速器稽核、快照/差分、命中解釋、事件追蹤、dirty 影格診斷，以及 JSON-RPC 橋接與其外掛協定。
- **你不會學到**：`Scene` 如何排程影格（Boss 06）、渲染器如何繪製它們（Boss 07）或 WASM 如何加速它們（Boss 08）。本文件是*讀取*這些子系統而不變更它們的工具。

## 1. 為何先看數字而非截圖

截圖回答「哪裡錯了」。數字回答*哪個實體*錯了、*偏差多少像素*，以及*引擎為何認為它是正確的*。整個 DevTools 套件（`packages/devtools/src/`）圍繞此階梯組織：

1. **定位** — 哪個實體擁有某像素（`pickInScene`）及其在樹中的位置（`buildTreeModel`、`entityPath`）。
2. **度量** — 其在世界單位中的幾何、變換與世界邊界（`inspectEntity`）以及每個可能分歧的盒子（`highlightGeometry`）。
3. **解釋** — 為何引擎挑選該實體而非你預期的那個（`explainHitTest`），以及瀏覽器事件實際到達何處（`createEventTrace`）。
4. **稽核** — 是否有實體在視覺上看似正常卻違反結構不變量（`auditScene`、`auditA11y`、`auditTextShaping`）。
5. **差分** — 兩個狀態間的變更，以穩定路徑而非隨機 id 定址（`captureSnapshot` / `diffSnapshots`）。
6. **歸因** — 為何 `onDemand` 場景永不閒置，以及渲染迴圈的真實成本（`diagnoseDirty`、`Scene.frameStats` 於 `packages/core/src/tree/Scene.ts:3515`）。

每個階梯皆回傳純資料而非像素。這使每項檢查皆可作為 CI 門控：`expect(auditScene(scene)).toEqual([])`（`vectojs-docs/content/reference/devtools-audit.md:12`）。

## 2. 兩個介面，一個模型層

| 介面                                     | 進入點                                                                            | 渲染                                                                                                  | 需要 `destroy()`                                                                             | 是否發布至正式環境                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **面板**（`@vectojs/devtools`）          | `attachDevtools(scene)` → `DevtoolsPanel` 於 `packages/devtools/src/panel.ts:140` | 其自身 `Scene` 停靠於視埠邊緣，`contentProjection: false`、`renderMode: 'onDemand'`（`panel.ts:299`） | 是 — `destroy()` 拆解計時器、監聽器、高亮、面板場景與容器（`panel.ts:1272`）                 | 永不 — `if (import.meta.env.DEV)` 守衛（`vectojs-docs/content/reference/devtools.md:51`） |
| **無頭**（`@vectojs/devtools/headless`） | 自 `packages/devtools/src/headless.ts:1` 重新匯出的純函式                         | 無                                                                                                    | 僅 `EventTrace` 附加文件監聽器（`packages/devtools/src/eventTrace.ts:85`）且必須 `destroy()` | 是 — 無面板、無 `@vectojs/ui` 依賴，可用於 Vitest/Node/agent                              |

面板*呼叫*無頭層；並不重複它。無頭層承載約 60 個匯出的純函式——更大且更有用的一半（`vectojs-docs/content/reference/devtools.md:18`）。

```ts
import { attachDevtools } from '@vectojs/devtools';
import { auditScene, captureSnapshot, explainHitTest } from '@vectojs/devtools/headless';

if (import.meta.env.DEV) {
  const devtools = attachDevtools(scene, { traceEvents: true });
  // devtools.detach() === devtools.destroy()
}
```

`DevtoolsOptions` 於 `packages/devtools/src/panel.ts:42` — `width` 預設 360、`refreshInterval` 預設 500、`dockSide` `right|left`、`showPerf` 預設 true、`traceEvents`/`traceCapacity`、`defaultTab`。無頭子路徑存在，使正式測試包可在無面板或 `@vectojs/ui` 的情況下拉取模型層（`vectojs-docs/content/reference/devtools.md:58`）。

## 2a. 面板顯示什麼 — 以及刻意不顯示什麼

`packages/devtools/src/panel.ts:306` 處的停靠表頭承載三個幽靈按鈕 — **⌖** 挑選（`panel.ts:340`）、**⟳** 重新整理（`panel.ts:341`）、**⚠** 稽核（`panel.ts:342`）— 以及三個計數 `Pill`（`panel.ts:104`）：總實體數、可互動 **⚡** 與稽核發現 **⚠**（`panel.ts:345`）。`panel.ts:537` 處的 `Tabs` 列將工具分為 **Tree · Info · Audit · A11y · Log · ⚙**，加上每個已註冊 `PluginInspector` 一個分頁（`panel.ts:530`，`panel.ts:1027`）。

- **Tree** — `panel.ts:383` 處的 `TreeView`，具 `panel.ts:371` 處的過濾 `Input`。`panel.ts:761` 處的 `setFilter(text)` 經 `applyFilterToTree`（`panel.ts:767`）修剪，後者淺拷貝 `{...node}` 使原始節點保持完整子列表；過濾的標籤仍在版本穩定的快速路徑上重寫。列顯示 `type (x,y) W×H ⚡ ▶`。
- **Info** — `INSPECT_ROWS = 20` 行 `Text`（`panel.ts:71`），顯示來自 `describeEntity` 的六個通用行加上描述器輸出、行內 `x/y/opacity` 編輯器（`panel.ts:418`）與 **Copy path / Copy JSON** 按鈕（`panel.ts:442`），由 `entityPath`（`inspect.ts:82`）與 `inspectEntity` JSON 支援。方向鍵以 1 px 微調（Shift：10 px），`+/-` 以 0.1 步進透明度（`panel.ts:228`）— 在觸及程式碼前確認哪個實體擁有布局錯誤。
- **Audit** — `panel.ts:469` 處的 `TreeView`，每發現一列（`panel.ts:844`），`panel.ts:860` 處的 `selectFinding(i)` 經合併的 `auditRows`（場景 + 外掛於 `panel.ts:840`）而非僅 `findings[i]` 解析。
- **A11y** — 來自 `panel.ts:1173` 處 `writeA11y` 的 `A11Y_ROWS = 22` 行（`panel.ts:73`）：`inspectA11y` 讀數（`a11yInspect.ts:227`）加上具 `▸` 標記已選實體的快取 `auditA11y` 發現。
- **Log** — 當 `traceEvents: true`（`panel.ts:47`）時，有界的 `EventTrace` 條目（`panel.ts:511`），`traceCapacity` 預設 50（`panel.ts:49`）。經 `eventTrace.subscribe` → `writeTrace`（`panel.ts:521`）→ `panelScene.markDirty()` 更新。
- **Settings (⚙)** — `panel.ts:654` 處的 `buildSettings`：`Toggle` 控制高亮、`Dropdown` 控制 `refreshInterval` 與 `dockSide`。`panel.ts:1070` 處的 `setRefreshInterval` 同時門控兩個計時器；`panel.ts:1088` 處的 `setDockSide` 經 `applyDockSideStyle`（`panel.ts:635`）交換樣式。
- **Perf 條** — 固定的底部 `Card`（`panel.ts:557`），由 `layout()`（`panel.ts:608`）重排，每 250 ms 讀取 `Scene.frameStats`（`panel.ts:571`）。
- **選取高亮** — 宿主覆蓋層上的 `HighlightEntity`（`panel.ts:874`），預設 `['aabb']`（`panel.ts:172`），可經 `setHighlightLayers`（`panel.ts:926`）切換。

停靠容器與畫布為 `pointer-events: none`（`panel.ts:288`），匹配 `Scene.a11yRoot` — 因此空白停靠像素永不竊取宿主輸入。

## 3. 樹模型與挑選 — 與引擎相同的遍歷

### 3.1 樹模型

`packages/devtools/src/model.ts:31` 處的 `buildTreeModel(root)` 回傳 `{ nodes, index }`：

- `nodes` — 每個 `root` 直接子節點一項，各自具自身子樹。葉節點為 `children: undefined` 而非 `[]`（`model.ts:40`）。
- `index: Map<string, Entity>` — 每個深度下的每個後代，以 `entity.id` 為鍵，使已選 id 可往返至即時實體。
- `label` — `` `${type} (${x},${y}) ${W}×${H} ⚡ ▶` `` 由 `geometryLabel`（`model.ts:16`）烘焙，僅在 `interactive` / `hasPendingAnimations()` 時才有徽章。

`model.ts:56` 處的 `refreshTreeLabels(nodes, index)` 就地重寫那些幾何徽章 — 無節點或索引擾動 — 並在至少一個標籤變更時回傳 `true`，使面板可跳過重繪工作。每 `RECONCILE_INTERVAL_MS = 3000`（`panel.ts:80`）的強制調和限制當某物在未遞增 `structureVersion` 的情況下變更 `children` 時的陳舊時間（`panel.ts:581`，`vectojs-docs/forge/findings/devtools-and-telemetry.md:356`）。

### 3.2 挑選

`model.ts:82` 處的 `findEntityAt(root, x, y)` 與 `model.ts:214` 處的 `pickInScene(scene, x, y)` 刻意為與 `HitTester.findHitRecursively`（`packages/core/src/tree/scene/HitTester.ts:227`）**相同的遍歷與相同的接受謂詞**，於 `vectojs#483` 後驗證：

- `opacity <= 0` 提前回傳並修剪子樹（`model.ts:86`）。
- `insideClipAncestors`（`model.ts:115`）經 `worldToLocal` 檢查每個 `clipChildren` 祖先的世界盒 — 因此捲出內容不可挑選。
- `isPointerTransparent`（`model.ts:105`）鏡像 `HitTester.isPointerTransparent` — `disabled === true` 或 `pointerEvents: 'none'` 退出命中，但子節點仍被走訪。
- 僅 `isPointInside(x,y)` 決定（`model.ts:95`）— 無世界 AABB 備援，因此粒子與裝飾形狀永不為錯誤擁有者（`model.ts:77`，於 `vectojs#483` 修正，`forge 2026-08-13`）。

`pickInScene` 先檢查覆蓋樹再檢查主樹（`model.ts:215`），因此開啟的 modal 勝過其後的內容 — 最常見的「我的點擊無處可去」驚喜。`findEntityAt` 亦測試你傳入的根，因此將 `scene.rootEntity` 交給它可能回傳該根；`pickInScene` 為更安全的預設（`vectojs-docs/content/reference/devtools-inspect.md:46`）。

## 4. 選取讀數 — 幾何、描述器與擁有的屬性

### 4.1 一個實體的兩種讀數

- `model.ts:153` 處的 `describeEntity(entity)` — 供面板的 `string[]`：六個固定行（type/id、具 `*` 標記布局擁有屬性的 `x/y/w/h`、scale/rotation/opacity、`world [a b c d e f]`、interactive/animating、子數量），加上當 `layoutControlledProperties` 非空時的 `* prop set by Parent — edits revert` 行（`model.ts:172`），然後為實體自身的 `getDevtoolsDescriptor()` 上限至 `DESCRIPTOR_LINE_BUDGET = 12` 行（`model.ts:151`）。欄位值截斷至 32 字元，註記至 60（`model.ts:143`）。拋出的描述器貢獻 `— descriptor threw —` 而非中止面板（`model.ts:184`）。

- `packages/devtools/src/inspect.ts:99` 處的 `inspectEntity(entity)` — 供機器的 `EntityInfo`（`inspect.ts:4`）：每個數字四捨五入至 2 位小數（`inspect.ts:48`）、`worldTransform`、`worldBounds`、`interactive/animating/clipChildren/childCount`、可選的 `text`（經 `inspect.ts:70` 處的 `textPreviewOf`，`TEXT_PREVIEW_MAX = 80`）、可選的 `a11y { tag, role, label }`、可選的 `descriptor`、可選的 `layoutControlled`（`inspect.ts:42`）。兩者皆處理拋出的 `getDevtoolsDescriptor()` 而不使工具當機 — 在你除錯的實體上當機的除錯工具比缺少欄位更糟（`inspect.ts:136`）。

`inspect.ts:82` 處的 `entityPath(entity)` 渲染 `Scene > Card#a1b2 > Text#c3d4`，id 截斷至 8 字元；樹頂（無父節點）顯示為 `Scene` — 因此分離的實體與真實根無法區分，當路徑看似異常短時值得檢查。

### 4.2 布局擁有的屬性

`inspect.ts:157` 處的 `layoutControlledProperties(entity)` 詢問**父節點** `getLayoutControlledProperties(child)` — 僅容器知道它覆寫哪些屬性（`ScrollView` 區分其內部包裝器與呼叫者新增的子節點）。面板在行內以 `*` 標記那些屬性（`model.ts:161`），當使用者編輯其中一個時立即解釋其值將在下次布局時還原（`panel.ts:1108`，`panel.ts:1153`），而非靜默拒絕編輯。編輯 Stack 子節點以觀察何者移動為合法；隱藏其為何彈回則否。

## 5. 高亮幾何 — 七個盒子，一類缺陷

`packages/devtools/src/highlightGeometry.ts:1` 處的 `highlightGeometry(scene, entity, opts?)` 回傳最多七個 `HighlightLayer` 值，恆按固定順序而非請求順序：

| 種類      | 含義                                      | 來源                                                         |
| --------- | ----------------------------------------- | ------------------------------------------------------------ |
| `aabb`    | 已變換布局四邊形的軸對齊盒                | `getWorldBounds()`                                           |
| `layout`  | 具旋轉/傾斜的真實四邊形                   | 世界變換 × `[0,0,w,h]`                                       |
| `render`  | `getBounds()` — 實體實際繪製處            | `entity.getBounds()`                                         |
| `clip`    | 最近的 `clipChildren` 祖先盒              | 祖先走訪                                                     |
| `content` | 可選取 DOM 內容鏡像的盒                   | 經 `getContentElement` 的 `rectToSceneBox`                   |
| `a11y`    | A11y 投射元素的盒                         | `packages/core/src/tree/Scene.ts:6446` 處的 `getA11yElement` |
| `hit`     | 經探測 `isPointInside` 取樣的真實命中區域 | `sampleHitRegion`                                            |

任何層上的 `divergesFromLayout` 表示該盒與布局四邊形偏差超過 1 px — 使點擊落在使用者非瞄準處的條件（`vectojs-docs/content/reference/devtools-inspect.md:222`）。`highlightGeometry` 永不拋出；不可用的層回傳 `{ kind, polygons: [], unavailable: reason }`。

`hit` 不在預設集合中 — 它在網格上取樣 `isPointInside`（`hitSampleStep` 預設 8、`hitSampleBudget` 預設 4096，`packages/devtools/src/highlightGeometry.ts:1`），成本為 `O((w/step)·(h/step))` 次探測，因此將 `step` 減半使成本 quadruple。`hit` 的分歧按**面積覆蓋**而非範圍，因此方形中的圓會被記錄（`vectojs-docs/content/reference/devtools-inspect.md:225`）。`panel.ts:1337` 處面板的 `HighlightEntity` 經 `showOverlay()`（`panel.ts:876`）在*宿主*場景的覆蓋層上繪製這些層，以 `LAYER_COLORS`（`panel.ts:1325`）著色，`aabb` 保持原始 `ACCENT` 使既有截圖保持可讀。

## 6. 稽核 — 結構化發現，已排序、具確定性

每個稽核皆回傳確定性排序的 `Finding[]`，使快照穩定。

### 6.1 布局稽核

`packages/devtools/src/audit.ts:321` 處的 `auditScene(scene, opts?)` 委派至 `audit.ts:130` 處的 `auditTree(root, sceneBounds, opts)`。四個 `AuditKind` 值（`audit.ts:7`）：

- `text-overflow` — 已度量文字盒逃離其最近的具尺寸、非文字祖先。
- `clip-overflow` — 內容逃離 `clipChildren` 祖先（在 `ScrollView`/`VirtualList`/`TreeView`/`Table` 中垂直豁免，經 `audit.ts:51` 處的 `DEFAULT_SCROLLABLE`）。
- `overlap` — **僅兄弟**，經 `SpatialHashGrid` 廣相走訪（`audit.ts:190`）而非先前的 O(k²) 雙重迴圈 — 每個盒僅計算一次，僅比較網格單元鄰居。需在兩軸上超過 `tolerance` 的交集（`audit.ts:231`）。
- `viewport-overflow` — 完全無具尺寸祖先，且實體逃離 `sceneBounds`。

選項：`tolerance`（預設 0.5）、`includeOverlay`（預設 false — modal/高亮刻意位於流外）、`scrollableTypes`（按 `constructor.name` 匹配）、`ignore`（修剪子樹）、`ignoreOverlap`（允許刻意堆疊）。`opacity: 0` 修剪整個子樹；發現按 `kind → entityPath → otherPath` 排序（`audit.ts:305`）。具 `includeOverlay: true` 時結果為兩個串接的已排序執行 — 若需一個全域順序則重排序（`vectojs-docs/content/reference/devtools-audit.md:85`）。

`audit.ts:70` 處的 `worldBox` 經 `getWorldTransform()` 使用宣告的 `[0,0,w,h]` 盒，而非 `getWorldBounds()` — 對包含而言宣告盒為契約；渲染範圍屬於 `clip-overflow`。

### 6.2 A11y 稽核

`packages/devtools/src/a11yInspect.ts:299` 處的 `auditA11y(scene, opts?)` 發射五個 `A11yAuditKind` 值（`a11yInspect.ts:23`）：

`no-accessible-name`、`role-tag-conflict`、`disabled-divergence`（在透明度 0.6–0.9 處具死區）、`focusable-but-clipped`、`duplicate-label`（對第二個起回報，`otherId` 指向第一個）。不同於布局稽核，它**預設包含覆蓋層** — modal 為焦點陷阱所在 — 且 `a11yHidden` 修剪整個子樹。結果為走訪順序，`duplicate-label` 附加於最後（`vectojs-docs/content/reference/devtools-audit.md:137`）。

### 6.3 文字塑形稽核

`packages/devtools/src/textInspect.ts:447` 處的 `auditTextShaping(scene)` 僅走訪 `scene.rootEntity` 並發射一種 `atlas-miss` — 不在字型圖集中的字形，每發現取樣至五個相異缺失。僅**預備文字**路徑可發射它；內容網格實體永不會（`vectojs-docs/content/reference/devtools-audit.md:157`）。

### 6.4 選取稽核

`packages/devtools/src/selectionAudit.ts:1` 處的 `auditSceneSelection` / `auditEntitySelection` 將實體自身的局部行幾何與即時 DOM `Range` 矩形比較，正規化至局部邏輯像素使 DPR/縮放被因數化。對每個違規行發現 `selection-drift`，具 `expectedLeft/Right`、`actualLeft/Right`、`leftDrift/rightDrift`。需要真實瀏覽器 — 無守衛地參考 `document`（`vectojs-docs/content/reference/devtools-audit.md:202`）— 並在執行時清除使用者的目前選取。

## 7. 快照與差分 — 無截圖的回歸

`packages/devtools/src/snapshot.ts:133` 處的 `captureSnapshot(scene)` 擷取確定性、JSON 安全的樹：子順序為渲染順序，數字四捨五入至 2 位小數（`snapshot.ts:52`），省略預設值屬性。`snapshot.ts:302` 處的 `diffSnapshots(a, b)` 回傳具 `path / kind('added'|'removed'|'changed') / changes` 的 `SnapshotDiff[]`。

鍵控 — 為何重命名的列不是 200 個重寫的列：`snapshot.ts:79` 處的 `nodeKey(entity)` 偏好 `devtoolsKey`（`k:`）然後 a11y `label`（`l:`，於 `snapshot.ts:55` 上限 `KEY_LABEL_MAX = 64`），永不為繪製文字（內容而非識別）且永不為實體 id（每執行隨機）。`snapshot.ts:196` 處的 `keyedPairs` 僅在層級的**兩側**皆唯一時才使用鍵；碰撞時退回索引對齊。路徑在具鍵時使用 `Row{k:row-42}`，否則使用 `Row[7]`（`snapshot.ts:163`），因此路徑本身在重排序後存活（`vectojs-docs/forge/findings/devtools-and-telemetry.md:317`，於 `vectojs#481/#510` 修正）。

僅 `snapshot.ts:142` 處的 `COMPARED_KEYS` 被比較（`type/x/y/width/height/worldBounds/opacity/interactive/animating/clipChildren/text`）；`scene.width/height`、`id` 與 `key` 不產生差分，`added`/`removed` 不遞迴。

## 8. 命中解釋與事件追蹤

### 8.1 解釋命中測試

`packages/devtools/src/hitExplain.ts:139` 處的 `explainHitTest(scene, x, y)` 以相同順序走訪並套用與 `HitTester` 相同的門控，但為每節點記錄 `HitCandidate` 而非在首次命中時回傳 — 每個落敗者及其 `HitVerdict`（`hitExplain.ts:20`）：`accepted / invisible / clipped / pointer-transparent / outside-shape / occluded`。`invisible`（`opacity <= 0`）修剪子樹並命名跳過多少後代（`hitExplain.ts:154`）。先覆蓋再主體（`hitExplain.ts:267`）— 最常見的驚喜。`occluded` 在後處理中指派：勝者下方的否則被接受實體被重寫（`hitExplain.ts:278`），因此「此像素下有多少東西」可被計數。`hitExplain.ts:299` 處的 `formatHitExplanation` 以字形 `✓ / · / ✗`（`hitExplain.ts:306`）渲染縮排行。

此為診斷而非每影格呼叫 — 它走訪整棵樹。在 WASM 命中網格場景上，零尺寸的 `clipChildren` 祖先可解釋為 `clipped`，而 WASM 路徑仍登記命中：唯一記錄的分歧（`vectojs-docs/content/reference/devtools-inspect.md:293`）。

### 8.2 事件路由追蹤

`packages/devtools/src/eventTrace.ts:275` 處的 `createEventTrace(scene, opts?)` 在不新增 VMT 監聽器或改變分發的情況下觀測瀏覽器輸入。七個 `EventTraceType` 值（`eventTrace.ts:6`）、四個 `EventTraceSource` 值（`eventTrace.ts:16`：`a11y / content / canvas / document`）、`EventTraceOptions.capacity` 預設 50（`eventTrace.ts:44`）。每個 `EventTraceEntry`（`eventTrace.ts:26`）記錄目標 id/路徑、場景+局部座標、修飾鍵、滾輪的 `deltaX/Y` 與最終 `defaultPrevented`。

`defaultPrevented` 在投射的 VMT 路由後於**微任務**中定案，因此它反映應用程式最終的捷徑/選取決策（`eventTrace.ts:95` `onEventBubbled`）。測試必須等待巨任務後再斷言。`pointermove` 按約 60 Hz 影格合併為每影格一個（`eventTrace.ts:77` 處的 `POINTERMOVE_COALESCE_MS = 16`），以避免 O(n) 挑選使效能 HUD 偏斜（`eventTrace.ts:69`，`vectojs#707`）。它附加 14 個文件監聽器，為唯一**必須** `destroy()` 的無頭物件（`eventTrace.ts:171`）；`entries` 回傳即時內部陣列而非副本。

## 9. 文字、GPU、加速器與 Markdown 讀數

`packages/devtools/src/textInspect.ts:179` 處的 `inspectText(entity)` 回傳 `TextInspection`（`textInspect.ts:15`）或在既無 `.text` 亦無 `.value` 時回傳 `null`。否則它攜帶已解析的 bidi 層級、`levelRuns` 與反轉段、`visualOrder`、經 `Intl.Segmenter` 重分段的字素 `clusters`（`textInspect.ts:148`）以及三層之一的逐字形細節（`textInspect.ts:157`）：

| 層級         | `glyphs[].x` | `metrics/lines` | `atlasMiss` |
| ------------ | ------------ | --------------- | ----------- |
| 預備內容網格 | 是           | 是              | 永不        |
| 預備文字     | 否           | 否              | 是          |
| 兩者皆非     | 無字形       | 否              | 否          |

`unavailable: string[]`（`textInspect.ts:74`）命名每個無法回報的能力及其原因 — 缺失欄位永遠被解釋而非靜默缺席。`textInspect.ts:295` 處的 `shapeProbe(text, opts?)` 在無實體或場景的情況下使任意字串通過同一管線，因此塑形可在單元測試中檢查。`textInspect.ts:348` 處的 `formatTextInspection` 為面板/外掛分頁渲染 `PluginRow[]`。

`packages/devtools/src/gpuInspect.ts:1` 處的 `gpuInspector` / `inspectGpu(scene)` 與 `packages/devtools/src/acceleratorInspect.ts:1` 處的 `acceleratorInspector` / `inspectAccelerators(scene)` 暴露 GPU 與 WASM 後端姿態。`inspectGpu` 回報繪製計數器（`gpuInspect.ts:1` 處的 `enableDrawCountersCommand` / `resetDrawCountersCommand`）、過度繪製與 `save/restore` 平衡；`inspectAccelerators` 回報每後端的 `AcceleratorReport { status, reason }` 於 `packages/core/src/tree/scene/WasmBackendFacade.ts:66` — WASM 命中/網格/動畫核心是否接受其參數或退回 JS 及其原因。兩者皆為純讀取，因此 CI 門控可如布局門控般斷言 `auditGpu(scene).length === 0`。

`packages/devtools/src/markdownInspect.ts:1` 處的 `inspectMarkdownStream(entity)` 回報串流重用（`auditMarkdownStreaming` / `markdownStreamAudit`）— 多少 token 在差量調和後存活 vs 多少實體被重建 — 以及上方已涵蓋的 `selectionAudit` / `highlightGeometry`。每個讀數皆遵循相同契約：永不拋出，當實體缺乏能力時回傳 `{ unavailable: reason }`，並將數字四捨五入至 2 位小數。

## 10. Dirty 影格歸因與即時影格遙測

### 10.1 `diagnoseDirty` — 為何 `onDemand` 永不休眠

`packages/devtools/src/dirtyDiagnosis.ts:70` 處的 `diagnoseDirty(scene, opts?)` 將 `Scene.dirtyReasons` 轉為裁決。`scene.setDirtyTracking(true)`（`packages/core/src/tree/Scene.ts:3474`）選擇加入；`scene.dirtyReasons: DirtyReasonEntry[]`（`Scene.ts:3489`，最頻繁在前，以 `packages/core/src/tree/scene/DirtyTracker.ts:71` 中 `MAX_DIRTY_REASONS = 200` 的 FIFO 上限）持有 `{ entity?, reason, property?, count, firstFrame, lastFrame }`。`diagnoseDirty` 計算 `perFrame = count / frames`（`dirtyDiagnosis.ts:97`）並分離 `everyFrame: perFrame >= 0.9`（`dirtyDiagnosis.ts:105`）— 這些為 `onDemand` 場景必須停止以實際閒置者。`summary` 在 `everyFrame` 非空時命名最差原因，在 `renderMode === 'always'` 時註記無關情況（`dirtyDiagnosis.ts:112`），並在追蹤從未啟用時警告（`dirtyDiagnosis.ts:82`）。刻意無頭 — 可自 Vitest/Playwright/CI 使用，無面板且無 `@vectojs/ui` 依賴。

### 10.2 `Scene.frameStats` — 已渲染影格而非 vsync

`packages/core/src/tree/Scene.ts:3515` 處的 `Scene.frameStats: FrameStats`（`Scene.ts:518` 處的 `FrameStats`）讀取真實迴圈遙測：

`fps`（EMA 平滑的已渲染影格節奏，箝制至 `maxFPS`，首對前為 `0`）、`frameTimeMs`（僅最後 `render()` 的牆鐘）、`frameIntervalMs`、`dt`、`renderedFrames/skippedFrames` 計數器、`renderMode`、`dirty`。`panel.ts:800` 處面板的 perf 條顯示 `fps · ms/frame / entities · mode · rendered/skipped`，每 250 ms 更新（`panel.ts:571`）。閒置的 `onDemand` 場景誠實讀為 `0 fps`；自動節流的 `'always'` 場景讀為其 `idleFPS` 底線（預設 60）（`vectojs-docs/content/reference/devtools.md:72`）。渲染器永遠重繪整個畫布，因此無 dirty 矩形 — `dirty` 為布林重繪待定旗標（`vectojs-docs/forge/findings/devtools-and-telemetry.md:73`）。來自 `forge 2026-07-18` 的教訓：永不獨立取樣 rAF — 僅實體的 `update()` 或 `frameStats` 度量 Scene 實際渲染的影格。

無頭層讀取的其他 Scene 介面：`structureVersion`（`Scene.ts:3462`，`Scene.ts:1636`）供樹形狀陳舊性、`getA11yTree()`（`Scene.ts:5412`）供公開 a11y 快照、`getA11yElement(id)`（`Scene.ts:6446`）與 `getContentElement(id)` 供 DOM vs 畫布盒比較（`packages/devtools/src/a11yInspect.ts:143`）、每實體的 `getContentProjection()` 以及下方的外掛讀數。

## 10a. 場景整合點 — DevTools 讀取引擎之處

無頭層永不深入 Scene 私有；它讀取 `packages/core/src/tree/Scene.ts` 為任何消費者發布、且 `packages/core/src/index.ts` 作為公開 API 重新匯出的公開介面：

- `Scene.structureVersion: number` 於 `Scene.ts:3462`（由 `Scene.ts:1636` 處的 `WasmBackendFacade.structureVersion` 支援）— 由 `Entity.add/remove`（`packages/core/src/tree/Entity.ts:1086` / `:1123`）遞增。每個樹形狀快取在此不變時有效；屬性變更刻意不遞增它，這正是 `refreshTreeLabels` 存在的原因。
- `Scene.frameStats: FrameStats` 於 `Scene.ts:3515` / `Scene.ts:518` 處的 `FrameStats` — 唯一誠實的 FPS 來源，加上 `frameTimeMs`、`frameIntervalMs`、`dt`、`renderedFrames/skippedFrames`、`renderMode`、`dirty`。於 `Scene.ts:5569` 處的 `Scene.loop` 中 `render()` 呼叫周圍更新；`Scene.ts:3420` 處的 `step(dt)` 使其保持歸零。
- `Scene.dirtyReasons: DirtyReasonEntry[]` 於 `Scene.ts:3489` 與 `Scene.ts:3474` 處的 `setDirtyTracking` / `packages/core/src/tree/scene/DirtyTracker.ts:70` 處的 `DirtyTracker` — 有界 FIFO（`DirtyTracker.ts:71` 處的 `MAX_DIRTY_REASONS = 200`），以 `entity:reason.property` 為鍵（`DirtyTracker.ts:120`）。
- `Scene.getA11yTree(): A11yTreeNode[]` 於 `Scene.ts:5412`（`Scene.ts:538` 處的 `A11yTreeNode`）與每實體的 `getA11yElement(id)` 於 `Scene.ts:6446` / `getContentElement(id)` — 即時 DOM 鏡像，其 `getBoundingClientRect()` 在 `highlightGeometry` 與 `inspectA11y` 中與 `getWorldBounds()` 比較。
- `Scene.renderMode: 'always' | 'onDemand'` 於 `Scene.ts:1147`，`Scene.ts:408` 處的 `SceneOptions.renderMode` 與 `Scene.ts:3443` 處的 `DirtyTracker` 委派 — `diagnoseDirty` 歸因的策略。
- `Entity.getDevtoolsDescriptor(): DevtoolsDescriptor | null` 於 `packages/core/src/tree/Entity.ts:1937` 與 `packages/core/src/tree/Entity.ts:968` 處的 `getLayoutControlledProperties(entity)` — 使 DevTools 無需元件類型表的兩個應用提供鉤子。

擁有 GPU/DOM 資源的子類別在呼叫 `super.destroy()` 前覆寫 `destroy()`（`packages/core/src/tree/ComputeParticleEntity.ts:419`，`DOMPortalEntity.ts:142`），因此持有 `Map<string, Entity>` 索引（`panel.ts:157`）的面板永不保留已處置實體。

## 11. 橋接與外掛協定

### 11.1 JSON-RPC 橋接

`packages/devtools/src/bridge.ts:131` 處的 `createDevtoolsBackend(scene, transport, opts?)` 與 `bridge.ts:328` 處的 `createDevtoolsClient(transport, opts?)` 經 `DevtoolsTransport`（`bridge.ts:97`）— 雙工 `send / subscribe` 抽象 — 講述版本化協定（`bridge.ts:33` 處的 `DEVTOOLS_PROTOCOL_VERSION = 1`，`bridge.ts:36` 處的 `DEVTOOLS_CHANNEL = 'vectojs-devtools'`）。`bridge.ts:39` 處的 `DevtoolsMethod` 列舉 20 個方法（`protocol.version`、`tree.get`、`entity.inspect/pick/highlightGeometry`、`scene.audit/a11yAudit/a11yOrder/snapshot/diff/frameStats`、`hit.explain`、`text.inspect`、`markdown.stream`、`gpu.inspect`、`plugin.list/rows/audit`、`command.list/run`）。每個處理器皆被包裝，使畸形場景以 `ok: false` 回應而非殺掉後端（`bridge.ts:290`）。

`tree.get` 預設序列化最多 `maxTreeNodes = 5000`（`bridge.ts:118`）並回報 `truncated: true` 而非靜默裁切（`bridge.ts:178`）。回應經 `JSON.parse(JSON.stringify(result))` 往返，因此回傳即時實體的處理器在後端自身測試中而非作為擴充中的 `structuredClone` 錯誤而失敗（`bridge.ts:300`）。`allowedOrigins` 對任何跨文件傳輸為**必要** — 回應任何人的後端將場景內容洩露至任何可 `postMessage` 它的影格（`bridge.ts:104`）。發布兩個傳輸：供測試/agent 的 `createDirectTransportPair()`（`bridge.ts:404`）與供擴充/父影格的 `createWindowTransport(target, targetOrigin)`，後者轉發 `event.origin` 供 allowlist 檢查（`bridge.ts:439`）。`bridge.ts:459` / `bridge.ts:469` 處的 `publishSelection` / `publishStructure` 發射後端發起的 `DevtoolsEvent` 通知（`bridge.ts:81`）。

一個後端服務每個前端 — 頁內面板、瀏覽器擴充、Playwright 與 agent — 因此同一查詢的四個實作不漂移（`bridge.ts:21`）。

### 11.2 外掛

`packages/devtools/src/plugin.ts:1` 處的 `registerDevtoolsPlugin(plugin)` 新增檢視器分頁、稽核與超越單一選取存活的指令。`plugin.ts:1` 處的 `PluginInspector` 為 `{ id, label, appliesTo?, inspect(ctx): PluginRow[] }` — 與元件自身 `getDevtoolsDescriptor()` 欄位使用相同的 `PluginRow { label, value, note? }` 形態，因此轉發描述器無需轉譯。`PluginAudit` 回傳 `PluginFinding[]`，面板將其作為一般發現附加，使 `selectFinding(i)` 無需知道發現來自何處（`panel.ts:830`）。面板為每外掛分頁預配置 `PLUGIN_ROWS = 18` 行 `Text`（`panel.ts:94`），並在套件經 `panel.ts:1027` 處的 `syncPluginTabs()` 延遲註冊時重建外掛分頁 — 在版本檢查前，因此新匯入的外掛不等待下次結構變更。

## 12. 重要的面板內部

- **重排擁有自身的重設大小。** 面板場景為 `disableWindowResize: true`，必須在每個 `window.resize` 上呼叫 `panelScene.resize(width, innerHeight)`（`panel.ts:608` `layout()`），重定位分頁高度、樹/稽核高度與 perf 卡。無此則底部固定的 perf 條在任何較短視埠下落於可視範圍外 — 在 100% 縮放時發布的錯誤（`vectojs-docs/forge/findings/devtools-and-telemetry.md:100`，於 `vectojs#132` 修正）。

- **具定期調和的版本門控重新整理。** `panel.ts:709` 處的 `refresh()` 在 `host.structureVersion === treeVersion` 且 `allNodes` 非空時跳過走訪 — 因此 60 Hz 間隔為低成本 — 但仍重寫標籤（於 `panel.ts:733` 對 `allNodes` 與 `filteredNodes` 的 `refreshTreeLabels`）並重寫選取/外掛讀數。每 `RECONCILE_INTERVAL_MS`（`panel.ts:591`）的強制調和限制直接 `children` 變更在無版本遞增的情況下可保持陳舊的時間。

- **`pointer-events: none` 停靠契約。** 停靠容器與其畫布為 `pointer-events: none`；僅 a11y 投射的控制項經 `auto` 選擇加入（`panel.ts:288`），鏡像 `Scene.a11yRoot`（`vectojs-docs/forge/findings/devtools-and-telemetry.md:29`，於 `@vectojs/devtools@0.4.3` 修正）。挑選處理器在消費點擊前檢查 `container.contains(ev.target)`（`panel.ts:219`），因此啟用挑選模式不會吞噬面板自身的按鈕（`vectojs#482`，`forge 2026-08-13`）。

- **A11y 稽核已快取而非每 tick 重走訪。** `writeA11y` 每 tick 執行（它是選取的讀數），但全場景 `auditA11y` 走訪以 `structureVersion` 快取並具 `A11Y_AUDIT_TTL_MS = 3000` 陳舊 TTL（`panel.ts:85`，`panel.ts:1246`）— 稽核輸入包含標籤/disabled/透明度/tabIndex/邊界且無版本計數器，因此僅版本鍵將永遠陳舊（`vectojs#496`，`forge 2026-08-13`）。

- **過濾安全的標籤與外掛安全性。** 啟用過濾時 `Tree` 渲染修剪的副本；過濾的標籤亦必須重寫，否則列在最後重建的幾何處凍結（`panel.ts:736`，`#786`）。拋出的 `appliesTo` 或 `getA11yAttributes()` 退化為「不適用」/ 逐實體裁決而非使面板空白（`panel.ts:1298`，`a11yInspect.ts:179`，`vectojs#496`）。

## 13. 困難之處 — 附憑據

| 陷阱                                                          | 位置                                                    | 狀態                                  |
| ------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------- |
| 停靠覆蓋吞噬宿主指標輸入                                      | `panel.ts:288`，forge 2026-07-16                        | 已修正 `@vectojs/devtools@0.4.3`      |
| 獨立 rAF FPS 度量顯示器 vsync 而非 Scene 節奏                 | `Scene.ts:518` `FrameStats`，forge 2026-07-18           | 經 `frameStats` 於 `core@1.13.0` 修正 |
| 面板在任何較短高度溢出視埠                                    | `panel.ts:608` `layout()`，forge 2026-07-21             | 已修正 `devtools@0.5.0`               |
| 焦點/工作區決定 Chrome 節奏；Firefox 需要 `layout.frame_rate` | `benchmarks/run-browsers.sh`，forge 2026-08-02/03       | 已修正 `vectojs#326/#327/#333`        |
| 快照混合具鍵/無鍵層級將一個節點配對兩次並丟棄移除             | `snapshot.ts:196`，forge 2026-08-13                     | 已修正 `vectojs#481/#510`             |
| 挑選模式吞噬面板自身的控制項點擊                              | `panel.ts:219`，forge 2026-08-13                        | 已修正 `vectojs#482/#510`             |
| `findEntityAt` 聲稱引擎一致性但省略透明度/裁剪/指標門控       | `model.ts:82`，`HitTester.ts:227` vs `forge 2026-08-13` | 已修正 `vectojs#483/#510`             |
| 畫布 vs DOM 漂移比較邏輯 px 與客戶端 px                       | `a11yInspect.ts:143`，`panel.ts:1099`                   | 已修正 `vectojs#484/#510`             |
| `selectFinding` 忽略外掛發現                                  | `panel.ts:860`，forge 2026-08-13                        | 已修正 `vectojs#496/#518`             |
| `accessibleName` 為截斷的 80 字元預覽                         | `a11yInspect.ts:160`，`inspect.ts:70`                   | 已修正 `vectojs#496/#518`             |
| 檢視器警告在列預算處丟棄                                      | `model.ts:153` + `panel.ts:1143`，forge 2026-08-13      | 已修正 `vectojs#496/#518`             |
| 全場景 a11y 稽核每 500 ms 節拍重走訪                          | `panel.ts:1246`，forge 2026-08-13                       | 已修正 `vectojs#496/#518`             |
| 拋出的 `getA11yAttributes()` 殺掉整個 a11y 稽核               | `a11yInspect.ts:179`，forge 2026-08-13                  | 已修正 `vectojs#496/#518`             |

## 14. 交付 DevTools 變更前的檢查清單

1. **先無頭。** 新增純函式，經 `createDirectTransportPair()` 以無瀏覽器測試它，然後連接面板。由一個真實消費者驗證的協定勝過圍繞未驗證者重建的 UI（`bridge.ts:21`）。
2. **拋出安全。** 守衛每個 `getA11yAttributes()` / `getDevtoolsDescriptor()` / `appliesTo` 呼叫 — 損壞的元件必須退化而非使工具空白（`model.ts:184`，`inspect.ts:136`，`panel.ts:1298`）。
3. **命中一致性。** 任何新可見性/輸入/裁剪門控必須同時落於 `HitTester.findHitRecursively` 與 `isHitEligible` *與*無頭挑選/解釋走訪（`HitTester.ts:227` vs `model.ts:82` vs `hitExplain.ts:139`，`vectojs#483`）。
4. **僅允許來源或直接配對。** 無 `allowedOrigins` 的跨文件後端為資訊洩露向量（`bridge.ts:104`）。
5. **版本鍵快取需要 TTL。** 僅 `structureVersion` 鍵的某物亦依賴標籤/透明度/邊界者將永遠陳舊（`panel.ts:1246`）。
6. **保持停靠非互動。** 容器/畫布保持 `pointer-events: none`（`panel.ts:288`）；控制項選擇加入。此處的回歸靜默使宿主右緣控制項失效。

## 15. 除錯工作流 — 哪種工具對應哪種症狀

| 症狀                          | 工作流                                                                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 「哪個實體擁有此像素？」      | `pickInScene(scene, x, y)` → `inspectEntity(hit)`（`packages/devtools/src/model.ts:214`，`packages/devtools/src/inspect.ts:99`）                |
| 「錯誤實體擁有此像素」        | `explainHitTest(scene, x, y)` — 每個落敗者及其落敗原因（`packages/devtools/src/hitExplain.ts:139`）                                             |
| 「為何此實體定位/尺寸錯誤？」 | `inspectEntity` 邊界 + `getWorldTransform()`，向上走訪 `entityPath` — 首個錯誤邊界擁有該缺陷                                                    |
| 「寫入 `x` 還原」             | `inspectEntity(e).layoutControlled` — 父節點擁有該屬性（`packages/devtools/src/inspect.ts:42`）                                                 |
| 「點擊目標與視覺偏移」        | `highlightGeometry(scene, e)` — 在 `a11y`/`content` 上尋找 `divergesFromLayout`（`packages/devtools/src/highlightGeometry.ts:1`）               |
| 「命中區域錯誤」              | `sampleHitRegion(e)` — 真實命中區域而非盒                                                                                                       |
| 「螢幕閱讀器無聲」            | `inspectA11y(scene, e)` 的 `accessibleName`/`nameSource`；`a11yReadingOrder(scene)` 的宣告順序                                                  |
| 「文字順序錯誤 / 空白盒」     | `inspectText(e)` 的 bidi 層級 / `glyphs[].atlasMiss`（`packages/devtools/src/textInspect.ts:179`）                                              |
| 「`onDemand` 場景永不閒置」   | `scene.setDirtyTracking(true)` → `diagnoseDirty(scene)`（`packages/devtools/src/dirtyDiagnosis.ts:70`，`packages/core/src/tree/Scene.ts:3474`） |
| 「此互動後變更了什麼？」      | `captureSnapshot` 前/後 → `diffSnapshots`                                                                                                       |

---

*Series: 00 Overview → 01 Selection → 02 Text+Layout → 03 Projection+Virtualization → 04 Streaming Markdown → 05 TeX → 06 VMT Runtime → 07 Renderer → 08 WASM G1/G2/G3 → 09 Three/XR → 10 Video Export → 11 Graph Layout → **12 DevTools** → 99 Synthesis.*
