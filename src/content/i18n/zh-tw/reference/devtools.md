---
title: '@vectojs/devtools'
description: '頁內 Virtual Math Tree 檢查器 — 實體選取、即時樹狀檢視、變換讀取值以及鍵盤微調編輯，本身使用 VectoJS 渲染。'
order: 48
---

# `@vectojs/devtools`

文檔版本：**0.4.3**

`@vectojs/devtools` 回答了「Elements 面板在哪裡？」的問題 — 一個用於 Virtual Math Tree 的頁內檢查器，讓 VectoJS 場景的除錯保持在狀態空間而非像素空間。該面板本身是一個 VectoJS `Scene`（吃自己的狗糧，檢查它所檢查的框架），固定在頁面右側邊緣。

## 安裝

```bash
bun add -D @vectojs/devtools
```

在開發環境中有條件地新增視覺面板 — 它會掛載一個 VectoJS 面板
並監聽 `document`，因此請將其排除在正式建置之外。無頭
稽核、快照、選取和事件追蹤無需面板即可使用：

```ts
import { auditScene, captureSnapshot, createEventTrace } from '@vectojs/devtools/headless';
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

## 顯示內容

- **即時樹狀檢視**：顯示 `scene.rootEntity` 和 `scene.overlayRootEntity`，以固定間隔（預設 500ms）重新整理。每行顯示實體的建構函式名稱、位置、尺寸和兩個徽章：**⚡**（`interactive`）和 **▶**（`hasPendingAnimations()`）。
- **選取模式**：點擊 **Pick**，然後在頁面上任意位置點擊。檢查器會使用 Scene 用於指標輸入的相同走訪順序（搭配 AABB 回退以處理裝飾性、非互動實體），解析點擊位置下的最深層實體。
- **選取高亮**：所選實體的世界空間包圍盒會在主機場景的 overlay 圖層上以輪廓繪製，因此您可以精確看到相對於即時渲染的選取內容。
- **狀態讀取值**：幾何、縮放/旋轉/透明度、完整的世界變換矩陣以及動畫狀態，以純文字顯示 — 螢幕截圖無法直接提供的數字。
- **鍵盤微調編輯**：選取實體後，方向鍵以 1px 移動（Shift：10px）；`+`/`-` 以 0.1 步進調整透明度。有助於在修改程式碼之前確認佈局錯誤屬於哪個實體。

從 0.4.3 起，固定在右側的 dock 及其 canvas 使用 `pointer-events: none`，只有投影的互動控制項會重新啟用指標事件。因此，檢查器不會再攔截空白 dock 像素下方的主機控制項輸入，而 VMT 列與按鈕仍可點擊。

## API

```typescript
function attachDevtools(
  scene: Scene,
  options?: DevtoolsOptions,
): DevtoolsPanel & { detach(): void };

interface DevtoolsOptions {
  width?: number; // 面板寬度（px），預設 320
  refreshInterval?: number; // ms；0 停用自動重新整理
  traceEvents?: boolean; // 顯示有限的指標/滾輪/鍵盤路由記錄
  traceCapacity?: number;
}

class DevtoolsPanel {
  refresh(): void; // 從主機場景重建樹狀模型
  armPick(): void; // 一次性：下一次頁面點擊選取其下的實體
  select(entity: Entity): void; // 程式化選取
  get selection(): Entity | null;
  destroy(): void; // 拆除監聽器、計時器、主機高亮和面板場景
}
```

`detach()`（由 `attachDevtools` 回傳）是 `destroy()` 的別名。

## 事件路由追蹤

```ts
const trace = createEventTrace(scene, { capacity: 100 });
trace.subscribe((entry) => {
  console.log(entry.source, entry.targetPath, entry.defaultPrevented);
});
```

`source` 為 `"canvas"`、`"a11y"`、`"content"` 或 `"document"`。`content`
來源表示瀏覽器事件始於可選取的
`[data-vecto-content]` 鏡像上。追蹤會驗證所屬的 Entity，記錄
場景/本地座標，並在微任務中完成，使 `defaultPrevented`
反映應用程式最終的快捷鍵或選取決定。在診斷
表面卸載時呼叫 `trace.destroy()`。指標追蹤包含
`pointercancel`，使中斷的拖放和選取交易可見，
而非在 `pointerdown` 之後留下診斷缺口。

## Scene 稽核

`auditScene` 遍歷樹並以結構化的、JSON 安全的發現項報告佈局缺陷 —— 用數字回答「是否有內容溢出、重疊或超出邊界？」：

```typescript
import { auditScene } from '@vectojs/devtools/headless';

const findings = auditScene(scene, {
  tolerance: 0.5, // px 容差，超出此值才計為溢出/重疊
  includeOverlay: false, // 預設排除模態框/高亮
  ignore: (e) => e.id.startsWith('debug-'), // 修剪子樹
  ignoreOverlap: (a, b) => a.id === 'badge', // 允許有意堆疊
});
// -> AuditFinding[]: { kind, entityId, entityPath, worldBounds, message,
//    containerBounds?, overflow?{left,right,top,bottom}, otherId?, intersection? }
```

檢測四種 `kind`，確定性排序：

- `text-overflow` —— 包含文字的實體的測量盒超出其最近的已定義尺寸的祖先。
- `clip-overflow` —— 內容超出 `clipChildren` 祖先（像素被裁剪）。
- `overlap` —— **僅兄弟元素**；父子包含關係是正常的。
- `viewport-overflow` —— 沒有已定義尺寸祖先的實體繪製到畫布之外。

已知盲點：可滾動容器豁免垂直軸（透過 `scrollableTypes` 覆蓋列表，以 `constructor.name` 匹配），並且 `opacity: 0` 實體被跳過。

面板的 **Audit** 按鈕執行相同的檢查以替代樹視圖；`panel.audit()` 返回發現項，`panel.selectFinding(i)` 高亮其中一個。

用作 CI 門禁：`expect(auditScene(scene)).toEqual([])`。

## 快照與差異比較

```typescript
import { captureSnapshot, diffSnapshots } from '@vectojs/devtools/headless';

const before = captureSnapshot(scene); // 確定性 JSON 樹
// … 執行互動 …
const diffs = diffSnapshots(before, captureSnapshot(scene));
// -> [{ path: "root > GridEntity[0]", kind: "changed", changes: { x: {from,to} } }]
```

差異比較基於**結構路徑**（`type[index]` 鏈），從不使用實體 id——id 在每次執行中是隨機的。預設值的屬性從快照中省略，因此差異保持簡潔。快照對在冒煙測試中實現精確的黃金狀態斷言：無需截圖，斷言某個互動恰好改變了它應該改變的實體。

## 低階模型工具

如果您想建立自訂檢查器 UI 而非內建面板，樹建立和選取邏輯會獨立匯出：

```typescript
import {
  buildTreeModel,
  findEntityAt,
  describeEntity,
  inspectEntity,
  entityPath,
  pickInScene,
} from '@vectojs/devtools';

buildTreeModel(root: Entity): { nodes: TreeNode[]; index: Map<string, Entity> };
findEntityAt(root: Entity, x: number, y: number): Entity | null; // 場景空間點 → 實體
describeEntity(entity: Entity): string[]; // 人類可讀的狀態行
inspectEntity(entity: Entity): EntityInfo; // 結構化、JSON 安全的狀態
entityPath(entity: Entity): string; // 祖先鏈（"Scene > Card#<id> > Text#<id>"，ID 截斷至 8 個字元）
pickInScene(scene: Scene, sceneX: number, sceneY: number): Entity | null; // overlay 優先選取
```

`inspectEntity` 是 `describeEntity` 的結構化兄弟：世界邊界和變換、互動標誌、`clipChildren`、子元素數量、鴨子型別的文字預覽（`.text`/`.value`），以及存在時的無障礙功能投影屬性。`entityPath` 生成實體的祖先鏈（例如 `"Scene > Card#<id> > Text#<id>"`，ID 截斷至 8 個字元）。

## 除錯工作流程

devtools 模型層用數字回答佈局問題 — 在截圖之前使用它。症狀 → 工具：

| 症狀                                | 工作流程                                                                                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 「哪個實體擁有這個像素？」          | `pickInScene(scene, x, y)` → `inspectEntity(hit)`；在頁面內，面板的 **Pick** 按鈕                                                                    |
| 「為什麼這個實體的位置/尺寸不對？」 | `inspectEntity` 獲取世界邊界和變換，然後向上遍歷 `entityPath` —— 邊界有問題的第一個祖先擁有該 bug                                                    |
| 「有內容溢出/重疊但我找不到位置」   | `auditScene(scene)` —— 每個發現項包含 `entityPath`、世界邊界和每個邊緣的溢出量                                                                       |
| 「這個互動移動了不該動的實體」      | `captureSnapshot` 之前，互動，`diffSnapshots` 之後 —— diff 精確列出變化的內容                                                                        |
| 「點擊/滾輪/按鍵去到了錯誤的地方」  | `createEventTrace(scene)` —— 每個條目顯示 source（`canvas`/`a11y`/`content`/`document`）、目標路徑、座標以及最終的 `defaultPrevented`                |
| 「文字拖曳選取或複製被攔截」        | 事件追蹤中 `entry.source === 'content'` —— 表示瀏覽器事件始於可選擇的投射；檢查 `defaultPrevented` 和目標路徑                                        |
| 「拖曳卡住/從未提交」               | 指標追蹤是事務性的：期望 `pointerdown` → 移動 → 正好一個 `pointerup`（提交）**或** `pointercancel`（回滾）；缺少終止條目表示實體未被投射或捕獲被繞過 |
| 「這是迴歸嗎？」                    | 保留健康場景的已提交快照（`captureSnapshot`）並在 CI 中對其執行 `diffSnapshots`                                                                      |

## 設計備註

- 面板場景以 `contentProjection: false` 和 `renderMode: 'onDemand'` 建構 — 它不得投射自己的 DOM 內容或在閒置時每幀重新繪製。
- 選取狀態存在於面板上，而非主機上：`select()`/`armPick()` 永不變更受檢查的場景，除了高亮 overlay 實體（透過 `showOverlay()` 新增並在 `destroy()` 時移除）。
- 自動重新整理是一個純計時器，而非 Scene 動畫 — 即使主機場景完全閒置（`onDemand`，無任何髒標記）也能運作。
- 停靠欄（預設 `position: fixed; right: 0; width: 320px`，全視口高度）及其畫布為 `pointer-events: none`，反映了主 `Scene` 自身的 `a11yRoot` 選擇退出的方式，而各個互動式陰影元素透過 `auto` 重新選擇加入（`@vectojs/devtools@0.6.0+`）。這意味著點擊停靠欄的空白背景/裝飾區域會穿透到下方的宿主內容——包括宿主應用自身的右邊緣控制項（分頁關閉按鈕、工具欄按鈕），否則它們會位於停靠欄的 320px 範圍內。只有面板自身的 a11y 投射控制項（按鈕、VMT 樹列）透過它們自己的 `auto` 選擇加入而獨立可點擊。
