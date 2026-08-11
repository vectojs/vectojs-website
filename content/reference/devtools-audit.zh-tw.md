+++
title = "Devtools：稽核"
description = "斷言 VectoJS 場景正確無誤 — 回傳結構化發現項的佈局、無障礙、文字塑形與選取稽核，加上用於迴歸測試的快照與差異。"
weight = 50

[extra]
order = 50
+++

# Devtools：稽核

稽核會走訪場景並回傳結構化、JSON 安全的發現項。每一項都是您可以在 CI 中斷言的關卡：

```typescript
import { auditScene } from '@vectojs/devtools/headless';

expect(auditScene(scene)).toEqual([]);
```

這就是套件這一半的重點。螢幕截圖測試告訴您頁面變了；稽核告訴您*哪個實體*溢出了容器、在哪條邊上*溢出多少像素*。

| 稽核                     | 偵測內容                                                                          | 需要瀏覽器 |
| ------------------------ | --------------------------------------------------------------------------------- | ---------- |
| `auditScene`             | 溢位、裁切、同層重疊、逸出視窗                                                    | 否         |
| `auditA11y`              | 缺少名稱、角色衝突、無法到達的焦點目標                                            | 否         |
| `auditTextShaping`       | 圖集中缺少的字形                                                                  | 否         |
| `auditSceneSelection`    | 文字選取幾何與畫布偏移                                                            | **是**     |
| `auditGpu`               | 批次處理、過度繪製、不平衡的 save/restore — [參見效能](/reference/devtools-perf/) | 否         |
| `auditAccelerators`      | WASM 核心拒絕其參數 — [參見效能](/reference/devtools-perf/)                       | 否         |
| `auditMarkdownStreaming` | 串流重複使用退化 — [參見效能](/reference/devtools-perf/)                          | 否         |

---

## 佈局稽核

```typescript
function auditScene(scene: Scene, opts?: AuditOptions): AuditFinding[];
function auditTree(root: Entity, sceneBounds: Bounds | null, opts?: AuditOptions): AuditFinding[];

type AuditKind = 'text-overflow' | 'clip-overflow' | 'overlap' | 'viewport-overflow';

interface AuditOptions {
  tolerance?: number; // px slack before an escape/overlap counts. Default 0.5
  includeOverlay?: boolean; // modals/highlights excluded by default
  scrollableTypes?: string[]; // default ['ScrollView','VirtualList','TreeView','Table']
  ignore?: (entity: Entity) => boolean; // prune subtrees
  ignoreOverlap?: (a: Entity, b: Entity) => boolean; // allow intentional stacking
}

interface AuditFinding {
  kind: AuditKind;
  entityId: string;
  entityPath: string;
  worldBounds: Bounds;
  message: string;
  containerId?: string;
  containerPath?: string;
  containerBounds?: Bounds;
  overflow?: { left: number; right: number; top: number; bottom: number };
  otherId?: string;
  otherPath?: string;
  otherBounds?: Bounds;
  intersection?: Bounds;
}
```

```typescript
const findings = auditScene(scene, {
  tolerance: 0.5,
  includeOverlay: false,
  ignore: (e) => e.id.startsWith('debug-'),
  ignoreOverlap: (a, b) => a.id === 'badge',
});
```

偵測四種種類：

- `text-overflow` — 帶有文字的實體之測量方塊逸出其最近的具尺寸祖先。
- `clip-overflow` — 內容逸出 `clipChildren` 祖先，因此像素被切掉。
- `overlap` — **僅限同層**；父子包含是正常的。
- `viewport-overflow` — 沒有具尺寸祖先的實體被繪製在畫布之外。

`auditScene` 是進入點；`auditTree` 是它所呼叫的單樹基本操作，明確接收 `sceneBounds`。為這些邊界傳入 `null` 會使 `viewport-overflow` 無法被偵測，因為沒有可逸出的視窗。

發現項依 `kind`、接著 `entityPath`、然後 `otherPath` 排序 — 在不同執行之間是確定性的，這正是它們可以安全快照的原因。

> [!IMPORTANT]
> 使用 `includeOverlay: true` 時，結果是**兩段串接的已排序序列**，而非一份全域排序的清單：先是主樹的發現項，然後是 overlay 的。單次走訪中依 `kind` 分組會看到種類重複出現。如果您需要單一排序，請再排序一次。

已知盲點，全部都是刻意的：

- **可捲動容器豁免垂直軸。** 比 `ScrollView` 更高的內容正是 `ScrollView` 存在的全部意義。水平逸出仍然會被回報。透過 `scrollableTypes` 覆寫類型清單 — 以建構函式名稱比對，且實體也必須實際進行裁切。
- **`opacity: 0` 會剪除整個子樹。** 刻意隱藏的內容不是佈局缺陷。
- **`viewport-overflow` 完全不需要具尺寸的祖先。** 單一具尺寸且不裁切的祖先就會抑制它，理由是此時該祖先才是有意義的容器。
- **重疊只比較直接同層**，絕不跨分支比較，且要求交集在*兩個*軸上都超過 `tolerance`。
- `Input` 會被算作類似文字，因為文字相似性是對可讀文字的存在做鴨子型別檢查。

> [!NOTE]
> `worldBounds` 視 `kind` 而定有兩種不同含義。溢位類別回報渲染範圍（`getWorldBounds()`）；`overlap` 回報宣告的佈局四邊形。因此在方塊外繪製的實體在兩種類別中會以不同數字出現 — 這是刻意的，因為重疊是佈局問題，而溢位是繪製問題。

---

## A11y 稽核

```typescript
function auditA11y(scene: Scene, opts?: A11yAuditOptions): A11yFinding[];

type A11yAuditKind =
  | 'no-accessible-name'
  | 'role-tag-conflict'
  | 'disabled-divergence'
  | 'focusable-but-clipped'
  | 'duplicate-label';

interface A11yAuditOptions {
  includeOverlay?: boolean; // default: included
  tolerance?: number; // px slack for the clipping check. Default 0.5
  skip?: ReadonlyArray<A11yAuditKind>;
}

interface A11yFinding {
  kind: A11yAuditKind;
  entityId: string;
  entityPath: string;
  message: string;
  otherId?: string;
  otherPath?: string;
  containerId?: string;
  containerPath?: string;
}
```

- `no-accessible-name` — 沒有名稱的可聚焦實體，其中角色要求名稱或實體是 `interactive`。最常見的真實缺陷：一個只朗讀為「button」而沒有其他內容的圖示按鈕。
- `role-tag-conflict` — 明確的 `role` 與標籤的隱含角色矛盾，例如 `tag: 'button'` 搭配 `role: 'link'`。
- `disabled-divergence` — 實體*看起來*已停用但*沒有宣告*停用，或反之。變暗但可聚焦就是陷阱：鍵盤使用者會 tab 進滑鼠使用者能看出不可用的東西。
- `focusable-but-clipped` — 完全位於 `clipChildren` 祖先之外的可聚焦實體。Tab 會把焦點移到看不見的東西上。
- `duplicate-label` — 兩個實體共用同一個無障礙名稱，從第二個起回報，`otherId` 指向第一個。

與佈局稽核不同，這個稽核**預設包含 overlay 樹** — modal 正是焦點陷阱所在之處。`a11yHidden` 會剪除整個子樹。

> [!NOTE]
> 發現項以走訪順序排列，而非排序，所有 `duplicate-label` 發現項會被附加在最後。`disabled-divergence` 也有一個刻意的死區：介於 0.6 與 0.9 之間的透明度兩邊都不回報，因為該範圍是模糊的而非錯誤的。

---

## 文字塑形稽核

```typescript
function auditTextShaping(scene: Scene): Array<{
  kind: string;
  entityId: string;
  message: string;
  severity: 'info' | 'warn';
}>;
```

只發出一個種類 `atlas-miss`：字形不在字型圖集中的實體，這就是它們渲染為空白方塊的原因。訊息會取樣最多五個不同的缺失字形。

> [!IMPORTANT]
> 這個稽核只看得到文字經過**已備妥文字（prepared-text）**路徑的實體。透過已備妥的內容網格檢查的實體，無論實際缺失多少字形，永遠不會產生 `atlas-miss` 發現項，因為網格路徑不攜帶該旗標。請直接使用 `inspectText(entity).glyphs` 檢查特定實體。

它只走訪 `scene.rootEntity` — overlay 樹不會被稽核。

---

## 選取稽核

```typescript
function auditSceneSelection(scene: Scene, opts?: SelectionAuditOptions): SelectionAuditFinding[];
function auditEntitySelection(
  scene: Scene,
  entity: Entity,
  opts?: SelectionAuditOptions,
): SelectionAuditFinding[];

interface SelectionAuditOptions {
  tolerance?: number; // px of left-edge drift allowed. Default 2
  rightTolerance?: number; // defaults to `tolerance`
  entityIds?: string[]; // audit only these entities
}

interface SelectionAuditFinding {
  kind: 'selection-drift';
  entityId: string;
  entityPath: string;
  line: number;
  expectedLeft: number;
  expectedRight: number;
  actualLeft: number;
  actualRight: number;
  leftDrift: number;
  rightDrift: number;
  message: string;
}
```

這裡的「選取」指的是**瀏覽器原生的文字選取** — 在透明的 DOM 內容投影上拖曳以選取文字。這個稽核將實體自身的行幾何（畫布繪製的依據）與瀏覽器會高亮的實際 DOM `Range` 矩形進行比較。出現偏移表示藍色選取帶落在字形以外的某處。

兩者都會歸一化到實體的本地邏輯像素，因此檢查與裝置像素比及瀏覽器縮放無關。它能捕捉兩端對齊文字、RTL/雙向文字與小數 DPR 的偏移。

`auditSceneSelection` 走訪樹並依 `entityPath` 然後 `line` 排序。`auditEntitySelection` 檢查單一實體。

> [!IMPORTANT]
> 這個稽核執行時會**清除使用者目前的文字選取**，而且需要真實的瀏覽器 — 它未加防護地參照 `document`，因此在 Node 或裸測試執行器中會拋出例外而不是回傳 `[]`。請把它放在瀏覽器 e2e 中，而非單元測試。它也只走訪 `scene.rootEntity`，沒有 overlay 選項。

`entityIds` 過濾的是*被稽核*的實體，而非被走訪的實體，因此被過濾掉的父節點的子節點仍會被檢查。

---

## 快照與差異

```typescript
function captureSnapshot(scene: Scene): SceneSnapshot;
function diffSnapshots(a: SceneSnapshot, b: SceneSnapshot): SnapshotDiff[];

interface SceneSnapshot {
  width: number;
  height: number;
  root: SnapshotNode[];
  overlay: SnapshotNode[];
}

interface SnapshotDiff {
  path: string;
  kind: 'added' | 'removed' | 'changed';
  changes?: Record<string, { from: unknown; to: unknown }>;
}
```

```typescript
const before = captureSnapshot(scene); // deterministic JSON tree
// … perform an interaction …
const diffs = diffSnapshots(before, captureSnapshot(scene));
// -> [{ path: 'root > GridEntity[0]', kind: 'changed', changes: { x: {from,to} } }]
```

與其截圖，不如斷言一次互動**恰好**改變了應該改變的實體。這把「頁面看起來不一樣」變成「這個實體移動了它不該移動的 4px」。

差異以**結構化路徑**（`type[index]` 鏈）為鍵，絕不用實體 id，因為 id 在每次執行時都是隨機的。發布 `devtoolsKey` 的實體 — 如果沒有，則使用 a11y 標籤 — 會改用該鍵來比對，因此重新排序有鍵的清單會回報為移動，而非每一列都改變。有鍵比對只適用於鍵在某一層兩側都唯一的情況；發生碰撞時該層會回退為索引對齊。

預設值的屬性會從快照中省略，因此差異保持安靜。

> [!NOTE]
> 只會比較固定的屬性集合：`type`、`x`、`y`、`width`、`height`、`worldBounds`、`opacity`、`interactive`、`animating`、`clipChildren` 與 `text`。值得注意的是**對 `scene.width`/`scene.height` 的變更完全不會產生差異**，`id` 與 `key` 的變更也都不会被回報。`added` 與 `removed` 不會遞迴，因此被刪除的子樹是一筆發現項，而非每個後代各一筆。

---

## 在 CI 中組合稽核

每個稽核都是回傳純資料的純函式，因此單一關卡就能斷言整個表面：

```typescript
import { auditA11y, auditScene, auditTextShaping } from '@vectojs/devtools/headless';

test('the scene is structurally sound', () => {
  buildDashboard(scene);
  scene.step(16.67); // let layout settle before asserting

  expect(auditScene(scene, { includeOverlay: true })).toEqual([]);
  expect(auditA11y(scene)).toEqual([]);
  expect(auditTextShaping(scene)).toEqual([]);
});
```

> [!IMPORTANT]
> 在場景尚未完成佈局前稽核，所有項目都會空洞地通過。請先驅動至少一次 `scene.step()` — 空場景的空發現項陣列不代表任何證據。

---

[Devtools 概覽](/reference/devtools/) · [檢查](/reference/devtools-inspect/) · [效能](/reference/devtools-perf/) · [橋接與外掛程式](/reference/devtools-extend/)
