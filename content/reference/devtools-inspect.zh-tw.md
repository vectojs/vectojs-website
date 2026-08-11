+++
title = "Devtools：檢查"
description = "將 VectoJS 場景以資料形式讀取 — 樹狀模型、實體選取、實體/a11y/文字狀態、高亮幾何、命中測試解釋，以及事件路由追蹤。"
weight = 49

[extra]
order = 49
+++

# Devtools：檢查

此處的所有內容都是對 `@vectojs/devtools/headless` 的純讀取。沒有東西會掛載面板，而且 — 除了唯一會附加文件監聽器的 `EventTrace` 之外 — 沒有東西需要拆除。

```ts
import { inspectEntity, pickInScene } from '@vectojs/devtools/headless';
```

---

## 樹狀模型與選取

```typescript
function buildTreeModel(root: Entity): {
  nodes: DevtoolsTreeNode[];
  index: Map<string, Entity>;
};
function findEntityAt(root: Entity, x: number, y: number): Entity | null;
function pickInScene(scene: Scene, sceneX: number, sceneY: number): Entity | null;
function describeEntity(entity: Entity): string[];

interface DevtoolsTreeNode {
  id: string;
  label: string;
  children?: DevtoolsTreeNode[];
}
```

`buildTreeModel` 回傳的是根節點的**子節點**，而非根節點本身 — `nodes` 中每個直接子節點各有一筆項目，各自帶有自己的子樹。相比之下，`index` 對應表包含每個深度層級的每個後代，以實體 id 為鍵，這正是讓 id 能來回對應回活動實體的原因。葉節點上的 `children` 是 `undefined` 而非 `[]`。

`label` 為 `` `${type} (${x},${y}) ${W}×${H} ⚡ ▶` `` — 當兩個維度皆為 0 時會省略尺寸，而兩個徽章分別只在 `interactive` 與 `hasPendingAnimations()` 為真時出現。

`pickInScene` 正是您處理「哪個實體擁有這個像素」時要用的函式。它**先檢查 overlay 樹**，然後才是主樹，因此開啟的 modal 會正確勝過其後的內容。`findEntityAt` 是底層的單樹基本操作：它以相反的順序、由最深處優先走訪子節點，因此會回傳最上層繪製的命中結果；當 `isPointInside` 回傳否時，它會回退到 AABB 測試 — 這意味著裝飾性、非互動的實體仍然可以被選取。

> [!IMPORTANT]
> `findEntityAt` 會測試您傳入的實體及其後代，因此傳入場景根節點可能會回傳該根節點本身。`pickInScene` 是較安全的預設選擇。

`describeEntity` 回傳人類可讀的行：六行固定的通用實體狀態，接著是實體發布的任何 `getDevtoolsDescriptor()` 輸出，上限為 12 行描述行。欄位值截斷於 32 個字元，備註截斷於 60 個字元。會拋出例外的描述器會貢獻 `— descriptor threw —` 這一行，而不是中止讀取值。

> [!NOTE]
> 整個 devtools 模型層中的 `type` 都是 `entity.constructor.name`，縮小化工具會重新命名它。請將其視為除錯標籤，絕不要當作穩定鍵 — 也絕不要當作正式環境的分支條件。

---

## 實體狀態

```typescript
function inspectEntity(entity: Entity): EntityInfo;
function entityPath(entity: Entity): string;
function textPreviewOf(entity: Entity): string | undefined;

interface EntityInfo {
  id: string;
  type: string;
  path: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  worldTransform: {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
  };
  worldBounds: Bounds;
  interactive: boolean;
  animating: boolean;
  clipChildren: boolean;
  childCount: number;
  text?: string;
  a11y?: { tag?: string; role?: string; label?: string };
  descriptor?: DevtoolsDescriptor;
  layoutControlled?: ReadonlyArray<LayoutControlledProperty>;
}
```

`inspectEntity` 是 `describeEntity` 的結構化、JSON 安全孿生函式。每個數字都四捨五入到 2 位小數。四個選用欄位是**被省略，而非設為 `undefined`**，因此 `'text' in info` 能區分「沒有文字」與「空文字」— 文字確實為 `''` 的實體會回報 `text: ''`。

`layoutControlled` 列出父級佈局容器所擁有的屬性。從應用程式碼寫入其中任何一個都是錯誤：下一次佈局回合會覆寫它。如果對 `x` 的微調或動畫不斷彈回，原因就在這個欄位。

`entityPath` 將祖先鏈呈現為 `Scene > Card#a1b2c3d4 > Text#e5f6a7b8`，id 截斷為 8 個字元。這是錯誤回報中應該引用的識別符，因為它在不同執行之間仍然有效，而 `id` 不會。

> [!IMPORTANT]
> `entityPath` 將任何沒有父節點的實體標記為 `Scene`，因此**已分離**的實體與真正的根節點無法區分。如果路徑看起來異常地短，請檢查該實體是否仍在樹中。

`textPreviewOf` 以鴨子型別方式依序檢查 `.text` 與 `.value`，並在 80 個字元處加上省略號截斷。它正是提供 `EntityInfo.text` 與 a11y 名稱回退值的來源，因此長字串會以預覽而非完整內容到達那些位置。

---

## 無障礙狀態

```typescript
function inspectA11y(scene: Scene, entity: Entity): A11yInfo;
function a11yReadingOrder(scene: Scene): A11yInfo[];

interface A11yInfo {
  entityId: string;
  entityPath: string;
  projected: boolean;
  tag?: string;
  role?: string;
  accessibleName?: string;
  nameSource?: 'label' | 'text' | 'none';
  tabIndex?: number;
  disabled?: boolean;
  focused?: boolean;
  readingOrder?: number;
  canvasBounds: Bounds;
  domBounds?: Bounds;
}
```

`inspectA11y` 永遠回傳一筆記錄，絕不會是 `null` — 未投影的實體只會回報 `projected: false` 及其餘少量欄位。這個函式回答「為什麼螢幕閱讀器不朗讀這個？」；通常回答這個問題的兩個欄位是 `accessibleName` 與 `nameSource`。

`nameSource` 永遠存在，包括 `'none'`。解析順序是 `label`、接著文字預覽、然後什麼都沒有。由於文字路徑會經過 `textPreviewOf`，從長文字推導出來的名稱會**截斷於 80 個字元** — 實際朗讀的字串是完整文字，因此對長內容不要將 `accessibleName` 當作事實來源。

`readingOrder` 是整個投影層依 DOM 順序的 1 起始索引，而非同層索引。`a11yReadingOrder` 回傳依此排序的所有投影實體，也就是螢幕閱讀器會走訪的順序。已投影但不在 DOM 查詢結果中的實體會被排到最後。

`canvasBounds` 是畫布繪製實體的位置；`domBounds` 是投影鏡像實際所在的位置。**兩者之間的差距就是缺陷** — 它意味著螢幕閱讀器的焦點環或點擊目標位於像素以外的某處。當沒有元素或矩形全為零時，`domBounds` 會被省略。

---

## 文字與塑形

```typescript
function inspectText(entity: Entity): TextInspection | null;
function shapeProbe(
  text: string,
  options?: {
    font?: string;
    cellWidth?: number;
    lineHeight?: number;
    baseline?: number;
  },
): TextInspection;
function formatTextInspection(inspection: TextInspection): PluginRow[];
function isTextEntity(entity: Entity): boolean;
```

`inspectText` 只有當實體既沒有 `.text` 也沒有 `.value` 時才會回傳 `null`。否則您會得到解析後的雙向（bidi）層級、層級連續段、反轉區段、視覺順序、字素叢集與逐字形細節 — 也就是「為什麼這個阿拉伯文字串順序錯誤」或「為什麼這個字形是空白方塊」背後的資料。

逐字形細節會以三種等級之一送達，而等級決定了哪些欄位存在：

| 等級             | `glyphs[].x` | `metrics` / `lines` | `atlasMiss` |
| ---------------- | ------------ | ------------------- | ----------- |
| 已備妥的內容網格 | 有           | 有                  | 從不設定    |
| 已備妥的文字     | 無           | 無                  | 有          |
| 兩者皆非         | 無字形       | 無                  | 無          |

`unavailable` 陣列會列出每一項無法回報的能力及其原因，因此缺失的欄位永遠有解釋，而不是靜默地不存在。它永遠至少包含三筆項目 — 字形 id、文字系統區段（script runs）與字型回退區間完全不會由引擎公開。

`shapeProbe` 在沒有實體也沒有場景的情況下，將任意字串送入同一條管線執行，這使它成為在單元測試中檢查塑形問題的最快方式。它永遠回傳包含位置的完整檢查結果。

> [!NOTE]
> 叢集邊界是由 devtools 使用 `Intl.Segmenter` 重新分段，而非取自引擎，因此在沒有 `Intl.Segmenter` 的執行環境上，它們會回退為逐碼點迭代，而且對組合標記與旗幟 emoji 是錯誤的。在信任叢集數量之前，請先與引擎輸出比對。

---

## 高亮幾何

```typescript
function highlightGeometry(
  scene: Scene,
  entity: Entity,
  options?: HighlightGeometryOptions,
): HighlightLayer[];
function sampleHitRegion(
  entity: Entity,
  options?: { step?: number; budget?: number },
): HighlightLayer;
function formatHighlightGeometry(layers: ReadonlyArray<HighlightLayer>): string[];

type HighlightLayerKind = 'aabb' | 'layout' | 'render' | 'clip' | 'content' | 'a11y' | 'hit';

interface HighlightLayer {
  kind: HighlightLayerKind;
  polygons: ReadonlyArray<HighlightPolygon>;
  divergesFromLayout?: boolean;
  unavailable?: string;
}

interface HighlightGeometryOptions {
  layers?: ReadonlyArray<HighlightLayerKind>;
  hitSampleStep?: number;
  hitSampleBudget?: number;
}
```

一個實體最多有七個不同的方塊，而佈局錯誤就存在於它們之間的差距中：

| 類型      | 說明                                            |
| --------- | ----------------------------------------------- |
| `aabb`    | 變換後佈局四邊形的軸對齊邊界盒。                |
| `layout`  | 真正的四邊形，包含旋轉與傾斜。參考基準。        |
| `render`  | `getBounds()` — 實體實際繪製的位置。            |
| `clip`    | 最近的 `clipChildren` 祖先的方塊。              |
| `content` | 可選取的 DOM 內容鏡像的方塊。                   |
| `a11y`    | a11y 投影元素的方塊。                           |
| `hit`     | 真實的命中區域，透過探測 `isPointInside` 取樣。 |

任何圖層上的 `divergesFromLayout` 就是訊號 — 它表示該方塊與佈局四邊形的差異超過一個像素，而這正是讓點擊落在使用者沒有瞄準之處的條件。發生分歧的 `render` 圖層代表內容在方塊外繪製；`content` 或 `a11y` 的分歧代表選取或焦點目標放錯位置。

`highlightGeometry` 永遠不會拋出例外。無法計算的圖層會以 `unavailable` 設為原因、且沒有多邊形的狀態回傳，因此典型實體上的 `render` 讀起來是 `getBounds() returned null, so the layout box is the render box`。無論您要求的順序為何，輸出永遠是上述的固定順序。

`'hit'` **不在**預設圖層集合中，因為它是唯一昂貴的圖層。它在網格上取樣 `isPointInside` — 預設步距 8 個場景單位，預算 4096 次探測 — 並為每個連續的水平區段回傳一個矩形。超出預算時會拒絕取樣並明確說明，而不是卡住：

```ts
// An inscribed circle: same extent as its box, ~79% of its area.
const hit = sampleHitRegion(circle, { step: 4 });
hit.divergesFromLayout; // true — coverage is below 90% of the box
```

`'hit'` 的分歧由**面積覆蓋率**決定，而非範圍，正是為了讓方形中的圓形也能被偵測到。固定步距下，成本隨實體尺寸呈二次方增長：將 `step` 減半會使探測次數變成四倍，因此在 200×100 的實體上以 2px 步距需要約 5100 次探測，而且必須先給予提高的 `hitSampleBudget` 才會執行。

---

## 解釋命中測試

```typescript
function explainHitTest(scene: Scene, x: number, y: number): HitExplanation;
function formatHitExplanation(explanation: HitExplanation): string[];

type HitVerdict =
  'accepted' | 'invisible' | 'clipped' | 'pointer-transparent' | 'outside-shape' | 'occluded';

interface HitCandidate {
  entityId: string;
  entityPath: string;
  type: string;
  verdict: HitVerdict;
  reason: string;
  depth: number;
  worldBounds: Bounds;
  clipperId?: string;
  clipperPath?: string;
}

interface HitExplanation {
  x: number;
  y: number;
  hitId: string | null;
  hitPath?: string;
  candidates: HitCandidate[];
  root: 'overlay' | 'main' | 'none';
}
```

`pickInScene` 告訴您哪個實體勝出。`explainHitTest` 告訴您**為什麼其他每個實體都輸了**，這正是答案錯誤時您所需要的。每個候選都帶有一個判定與一句話長度的原因：

```ts
const why = explainHitTest(scene, 50, 50);
console.log(formatHitExplanation(why).join('\n'));
// hit test (50, 50) → Scene > Box#entity_d > Box#entity_k [main]
// ✗ OverlayRoot — point (50, 50) is outside its shape
//   ✗ Box — point (50, 50) is outside its shape
//     ✓ Box — inside its shape, unclipped, and accepts pointer input
//     · Box — would have been hit, but Box is drawn on top
```

圖形符號中 `✓` 表示接受、`·` 表示被遮擋、`✗` 表示其他所有情況，而縮排是候選的深度 — 上限為 6 層，因此更深的樹在視覺上會被壓平。這些行攜帶的是 `type`（建構函式名稱）而非路徑，而同層實體通常共用一個 type：當您需要精確識別某一個時，請讀取 `explanation.candidates[i].entityPath`。

候選以最上層優先排序，與引擎考慮它們的順序相同。請注意 `occluded` 是在後續回合中指派：一個本會接受該點、但位於勝者下方的實體會被從 `accepted` 改寫為 `occluded`。因此「這個像素底下有多少東西」可以透過數它們來回答。

`invisible` 判定（`opacity <= 0`）會**剪除整個子樹** — 原因會說明跳過了多少後代，因此一整條不可見的分支只會回報為一個候選，而不是幾十個。

> [!IMPORTANT]
> 這是一個診斷工具，不是每幀呼叫。引擎在第一次命中時就回傳，而 `explainHitTest` 會走訪整棵樹來列舉失敗者。它也永遠鏡像 JS 的走訪，因此在使用 WASM 命中網格的場景上，兩者可能在一種邊緣情況下不一致：尺寸為零的 `clipChildren` 祖先會被解釋為 `clipped`，而 WASM 路徑卻記錄了命中。

---

## 事件路由追蹤

```typescript
function createEventTrace(scene: Scene, options?: EventTraceOptions): EventTrace;

class EventTrace {
  get entries(): readonly EventTraceEntry[];
  subscribe(listener: (entry: EventTraceEntry) => void): () => void;
  clear(): void;
  destroy(): void;
}

interface EventTraceOptions {
  capacity?: number; // retained records, default 50
  includeGlobalKeyboard?: boolean; // default true
}

type EventTraceType =
  'pointerdown' | 'pointerup' | 'pointercancel' | 'pointermove' | 'wheel' | 'keydown' | 'keyup';

type EventTraceSource = 'a11y' | 'content' | 'canvas' | 'document';
```

```ts
const trace = createEventTrace(scene, { capacity: 100 });
trace.subscribe((entry) => {
  console.log(entry.source, entry.targetPath, entry.defaultPrevented);
});
```

每筆項目記錄了解析後的目標實體、場景與本地座標、修飾鍵，以及最終的 `defaultPrevented`。`source` 說明瀏覽器事件在哪個表面上送達：`canvas`、`a11y` 投影、可選取的 `content` 鏡像，或全域鍵盤的 `document`。

記錄會**在微任務（microtask）中定案**，因此 `defaultPrevented` 反映的是應用程式最終的快捷鍵或選取決定，而非分派中途的值。實際後果是：分派事件後立刻讀取 `entries` 是空的 — 測試在斷言前必須等待一個巨集任務（macrotask）。

指標追蹤包含 `pointercancel`，這讓中斷的拖曳與選取交易變得可見，而不是在 `pointerdown` 之後留下診斷缺口。預期會看到 `pointerdown` → 移動 → 恰好一個 `pointerup`（提交）**或** `pointercancel`（回滾）；缺少終端項目表示實體從未被投影，或捕獲被繞過了。

> [!IMPORTANT]
> `EventTrace` 會附加 14 個文件監聽器，而且是模型層中唯一**必須**被銷毀的物件。當診斷介面卸載時請呼叫 `trace.destroy()`。另外請注意 `entries` 回傳的是活動的內部陣列而非副本 — 隨著記錄送達並在達到容量時被逐出，它會在您腳下變動，因此如果您需要穩定的檢視，請複製它。

在瀏覽器之外，建構函式不會附加任何東西，實例是惰性的，因此共用的測試輔助程式可以無條件地建構一個。

---

## 除錯工作流程

| 症狀                                | 工作流程                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 「哪個實體擁有這個像素？」          | `pickInScene(scene, x, y)` → `inspectEntity(hit)`                                                      |
| 「錯誤的實體擁有這個像素」          | `explainHitTest(scene, x, y)` — 每個失敗者及其失敗原因                                                 |
| 「為什麼這個實體的位置/尺寸錯誤？」 | `inspectEntity` 取得世界邊界 + 變換，然後沿 `entityPath` 向上走訪 — 第一個邊界錯誤的祖先就是錯誤的來源 |
| 「我對 `x` 的寫入不斷被還原」       | `inspectEntity(e).layoutControlled` — 父級容器擁有該屬性                                               |
| 「點擊目標與視覺內容有偏移」        | `highlightGeometry(scene, e)` 並在 `a11y` 或 `content` 上尋找 `divergesFromLayout`                     |
| 「這個形狀的可點擊區域有誤」        | `sampleHitRegion(e)` — 真實的命中區域，而非方塊                                                        |
| 「螢幕閱讀器什麼都不說 / 說錯內容」 | `inspectA11y(scene, e)` 檢查 `accessibleName` + `nameSource`；`a11yReadingOrder(scene)` 取得朗讀順序   |
| 「這段文字以錯誤的順序渲染」        | `inspectText(e)` — 雙向層級、層級連續段、視覺順序                                                      |
| 「字形渲染為空白方塊」              | `inspectText(e).glyphs` — 標記為 `atlasMiss` 的項目                                                    |
| 「點擊/滾輪/按鍵落到錯誤的位置」    | `createEventTrace(scene)` — 來源、目標路徑、座標、最終的 `defaultPrevented`                            |
| 「文字的拖曳選取或複製被攔截」      | 使用 `entry.source === 'content'` 的事件追蹤 — 事件發生在可選取的投影上                                |
| 「拖曳卡住 / 從不提交」             | 指標追蹤是交易性的：缺少 `pointerup`/`pointercancel` 表示實體未被投影或捕獲被繞過                      |

---

[Devtools 概覽](/reference/devtools/) · [稽核](/reference/devtools-audit/) · [效能](/reference/devtools-perf/) · [橋接與外掛程式](/reference/devtools-extend/)
