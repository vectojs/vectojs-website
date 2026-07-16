---
title: '@vectojs/devtools'
description: '頁內 Virtual Math Tree 檢查器 — 實體選取、即時樹狀檢視、變換讀取值以及鍵盤微調編輯，本身使用 VectoJS 渲染。'
order: 48
---

# `@vectojs/devtools`

文檔版本：**0.4.2**

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

## 低階模型工具

如果您想建立自訂檢查器 UI 而非內建面板，樹建立和選取邏輯會獨立匯出：

```typescript
import { buildTreeModel, findEntityAt, describeEntity, pickInScene } from '@vectojs/devtools';

buildTreeModel(root: Entity): { nodes: TreeNode[]; index: Map<string, Entity> };
findEntityAt(root: Entity, x: number, y: number): Entity | null; // 場景空間點 → 實體
describeEntity(entity: Entity): string[]; // 人類可讀的狀態行
pickInScene(scene: Scene, sceneX: number, sceneY: number): Entity | null; // overlay 優先選取
```

## 設計備註

- 面板場景以 `contentProjection: false` 和 `renderMode: 'onDemand'` 建構 — 它不得投射自己的 DOM 內容或在閒置時每幀重新繪製。
- 選取狀態存在於面板上，而非主機上：`select()`/`armPick()` 永不變更受檢查的場景，除了高亮 overlay 實體（透過 `showOverlay()` 新增並在 `destroy()` 時移除）。
- 自動重新整理是一個純計時器，而非 Scene 動畫 — 即使主機場景完全閒置（`onDemand`，無任何髒標記）也能運作。
