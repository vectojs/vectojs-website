+++
title = "@vectojs/devtools"
description = "頁內 Virtual Math Tree 檢查器及其無頭模型層 — 實體選取、樹狀檢視、稽核、快照、GPU 與加速器讀取值，以及 JSON-RPC 橋接。"
weight = 48
+++

# `@vectojs/devtools`

文件版本：**0.11.2**

`@vectojs/devtools` 回答了「Elements 面板在哪裡？」的問題 — 一個用於 Virtual Math Tree 的頁內檢查器，讓 VectoJS 場景的除錯保持在狀態空間而非像素空間。它分為兩半：

| 一半                                      | 用途                                                                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **面板** (`@vectojs/devtools`)            | 一個頁內停靠欄，本身是一個 VectoJS `Scene`，具有樹狀結構、實體狀態、稽核、a11y、事件日誌和設定標籤頁。於本頁中說明。 |
| **模型層** (`@vectojs/devtools/headless`) | 約 60 個純函數，以資料形式回答佈局、a11y、命中測試、文字和效能問題。無 DOM 面板，可用於測試、CI、Node 和代理程式中。 |

模型層是較大且更有用的一半。在進行螢幕截圖之前，請先使用它 — 數字會告訴您「哪個」實體有問題，而圖片只會告訴您有東西出錯。

| 頁面                                          | 內容                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [檢查](/reference/devtools-inspect/)          | 樹狀模型、選取、實體/a11y/文字狀態、高亮幾何、命中測試解釋、事件路由追蹤。                 |
| [稽核](/reference/devtools-audit/)            | 所有 `audit*` 函數 — 佈局、a11y、文字塑形、選取偏移 — 加上用於迴歸斷言的快照與差異。       |
| [效能](/reference/devtools-perf/)             | GPU 和繪製計數器、WASM 加速器狀態、髒重繪歸因、Markdown 串流指標。                         |
| [橋接與外掛程式](/reference/devtools-extend/) | 用於從另一份文件驅動場景的 JSON-RPC 協定，以及用於新增您自己的標籤頁和稽核的外掛程式協定。 |

---

## 安裝

```bash
bun add -D @vectojs/devtools
```

面板會掛載一個 VectoJS 場景並監聽 `document`，因此請將其排除在正式建置之外。從 `headless` 子路徑匯入模型層 — 它不包含面板程式碼，也不依賴 `@vectojs/ui`：

```ts
import { auditScene, captureSnapshot, inspectEntity } from '@vectojs/devtools/headless';
```

```typescript
import { attachDevtools } from '@vectojs/devtools';

const scene = new Scene(canvas);
// ...建立場景...

if (import.meta.env.DEV) {
  const devtools = attachDevtools(scene);
  // devtools.detach() 可稍後移除
}
```

> [!IMPORTANT]
> `@vectojs/devtools/headless` 下的所有內容也從套件根目錄重新匯出，因此單一 `attachDevtools` 匯入不會阻止您呼叫 `auditScene`。子路徑的存在是為了讓正式環境測試打包檔可以在沒有面板的情況下引入模型層。

---

## 顯示內容

標頭包含三個幽靈圖示按鈕 — **⌖**（選取）、**⟳**（重新整理）、**⚠**（稽核）— 以及三個計數徽章：總實體數、互動實體（**⚡**）和稽核發現項（**⚠**）。`Tabs` 列將工具分為 **Tree · Info · Audit · A11y · Log · ⚙**，加上每個註冊的[外掛程式檢查器](/reference/devtools-extend/#wai-gua-cheng-shi-xie-ding)一個標籤頁。底部固定了效能條帶。

- **即時樹狀檢視（`Tree` 標籤頁）**：顯示 `scene.rootEntity` 和 `scene.overlayRootEntity`，以固定間隔（預設 500ms）重新整理。每行顯示實體的建構函式名稱、位置、尺寸和兩個徽章：**⚡**（`interactive`）和 **▶**（`hasPendingAnimations()`）。**filter** 欄位按類型/id 子字串過濾行；它是唯讀的，因此 id→實體索引仍會解析所有內容。程式化設定：`panel.setFilter(text)`。
- **選取模式**：點擊 **⌖**，然後在頁面上任意位置點擊。檢查器會使用 Scene 用於指標輸入的相同走訪順序（以及相同的接受規則），解析點擊位置下的最深層實體 —— 只有實體自身的形狀接受該點的位置才是可選取的，與引擎完全一致，因此粒子和其他非互動實體絕不會成為錯誤的擁有者。
- **選取高亮**：所選實體的世界空間幾何會在主機場景的 overlay 圖層上以輪廓繪製，因此您可以精確看到相對於即時渲染的選取內容。預設情況下，它會繪製佈局盒；`panel.setHighlightLayers()` 會將其切換為七個[幾何圖層](/reference/devtools-inspect/#gao-liang-ji-he)中的任何一個 — 包括 `'hit'`，它對實體的實際命中區域進行採樣，而不是其邊界盒。
- **狀態讀取值 + 內嵌編輯（`Info` 標籤頁）**：幾何、縮放/旋轉/透明度、完整的世界變換矩陣、動畫狀態，以及實體發布的任何 `getDevtoolsDescriptor()` 輸出。加入內嵌的 `x`/`y`/`opacity` 編輯器以及 **Copy path** / **Copy JSON** 按鈕。
- **A11y 標籤頁**：所選實體的投影角色、無障礙名稱及其來源、tab index、閱讀順序位置，以及畫布與 DOM 對比的邊界盒 — 加上全場景的 [a11y 稽核](/reference/devtools-audit/#a11y-ji-he)發現項。
- **鍵盤微調編輯**：選取實體後，方向鍵以 1px 移動（Shift：10px）；`+`/`-` 以 0.1 步進調整透明度。有助於在修改程式碼之前確認佈局錯誤屬於哪個實體。
- **效能HUD**：底部的條帶讀取 [`Scene.frameStats`](/reference/core-scene) — fps、毫秒/幀、實體數量、渲染模式以及渲染/跳過的幀數。fps 是真實的*渲染幀*節奏，因此空閒的 `onDemand` 或自動節流場景真實地讀取為 ~2fps，而不是虛假的 60。使用 `showPerf: false` 停用。
- **設定** (`⚙` 標籤頁)：切換選取高亮，並即時切換更新間隔和停靠側（左/右）。

面板在視窗調整大小時會重新排版，因此底部的效能條帶在任何視口高度或縮放級別都保持在螢幕上。停靠欄及其畫布使用 `pointer-events: none`；只有其投影的互動控制項會重新啟用 — 因此檢查器永遠不會攔截空白停靠欄像素下方的主機控制項輸入，而其自身的列、標籤、輸入和按鈕則保持可點擊狀態。

---

## API

```typescript
function attachDevtools(
  scene: Scene,
  options?: DevtoolsOptions,
): DevtoolsPanel & { detach(): void };

interface DevtoolsOptions {
  width?: number; // 面板寬度（px），預設 360
  refreshInterval?: number; // ms；0 停用自動重新整理。預設 500
  traceEvents?: boolean; // 顯示有限的指標/滾輪/鍵盤路由記錄
  traceCapacity?: number; // 保留的追蹤記錄，預設 50
  dockSide?: 'right' | 'left'; // 預設 'right'
  showPerf?: boolean; // 即時效能 HUD 條帶，預設 true
  defaultTab?: string; // 'tree' | 'inspect' | 'audit' | 'a11y' | 'events' | 'settings'
}

class DevtoolsPanel {
  refresh(force?: boolean): void; // 從主機場景重建樹狀模型
  armPick(): void; // 一次性：下一次頁面點擊選取其下的實體
  select(entity: Entity): void; // 程式化選取
  get selection(): Entity | null;
  get trace(): EventTrace | null; // 除非 traceEvents 已啟用，否則為 null
  setFilter(text: string): void; // 按類型/id 子字串過濾樹
  setHighlightEnabled(on: boolean): void;
  setHighlightLayers(kinds: ReadonlyArray<HighlightLayerKind>, hitSampleStep?: number): void;
  getHighlightLayers(): ReadonlyArray<HighlightLayer>; // 來自最後一次繪製的圖層
  setRefreshInterval(ms: number): void;
  setDockSide(side: 'right' | 'left'): void;
  audit(): AuditFinding[]; // 執行佈局稽核；也會填入 Audit 標籤頁
  selectFinding(i: number): void; // 選取並高亮顯示發現項 i 背後的實體
  getPluginFindings(): ReadonlyArray<PluginFinding>; // 來自外掛程式稽核的發現項
  getPluginRows(inspectorId: string): PluginRow[]; // 外掛程式標籤頁的當前列
  runCommand(qualifiedId: string): unknown; // 執行 `<pluginId>/<commandId>`
  destroy(): void; // 拆除監聽器、計時器、主機高亮和面板場景
}
```

`detach()`（由 `attachDevtools` 回傳）是 `destroy()` 的別名。

`refresh(force)` 在 `scene.structureVersion` 未移動時會跳過重建，因此以緊湊的間隔呼叫它成本很低；傳入 `true` 會強制重建。獨立於該檢查，面板每 3 秒協調一次，因此錯過的結構更新不會讓樹狀檢視無限期處於過時狀態。

`getPluginRows` 針對未知的外掛程式 id、沒有選取內容，或當檢查器的 `appliesTo` 拒絕選取內容時回傳 `[]` — 這三種情況未加區分。`runCommand` 在未知的指令 id 上會**拋出例外**，而非不執行。

---

## 設計備註

- 面板場景以 `contentProjection: false` 和 `renderMode: 'onDemand'` 建構 — 它不得投射自己的 DOM 內容或在閒置時每幀重新繪製。
- 選取狀態存在於面板上，而非主機上：`select()`/`armPick()` 永不變更受檢查的場景，除了高亮 overlay 實體（透過 `showOverlay()` 新增並在 `destroy()` 時移除）。
- 自動重新整理是一個純計時器，而非 Scene 動畫 — 即使主機場景完全閒置（`onDemand`，無任何髒標記）也能運作。
- 停靠欄（`position: fixed`，全視口高度）及其畫布為 `pointer-events: none`，反映了主 `Scene` 自身的 `a11yRoot` 選擇退出的方式，而各個互動式陰影元素透過 `auto` 重新選擇加入。點擊停靠欄的空白背景會穿透到下方的宿主內容 — 包括宿主應用自身的右邊緣控制項，否則它們會位於停靠欄的範圍內。只有面板自身的 a11y 投射控制項透過它們自己的 `auto` 選擇加入而獨立可點擊。

---

[檢查](/reference/devtools-inspect/) · [稽核](/reference/devtools-audit/) · [效能](/reference/devtools-perf/) · [橋接與外掛程式](/reference/devtools-extend/)
