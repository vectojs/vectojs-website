+++
title = "a11yRoot 與 agent 契約"
description = "每個可互動的 Entity 如何將透明的 ARIA 陰影節點投射到 DOM 中 — A11yAttributes 形狀、canvas 效能與 DOM 等級無障礙的契約，以及導致陰影節點過時或遺失的同步注意事項。"
weight = 10
+++

# a11yRoot 與 agent 契約

屬於 [`@vectojs/core`](/reference/core-api/) 的一部分。

每個具有框的可互動 entity 都會將一個**透明 ARIA 陰影節點**投射到 Scene 的 `a11yRoot` div 中（位於 canvas 上方，`pointerEvents:auto` 讓自動化/AT 可以互動；除非 `debugA11y` 否則 `opacity:0`）。每個節點攜帶 `id` + `data-vecto-id`，以及來自 [`Entity.getA11yAttributes()`](/reference/core-entity/#a11y-pi-ci-chu-li-gua-gou-fu-xie-yi-qi-yong) 的角色/標籤/狀態。

投射根追蹤 canvas 的 CSS 框：canvas 偏移和非均勻 CSS 縮放會套用到陰影和 DOM-portal 層，而 entity 幾何則保持在邏輯 Scene 座標中。canvas 的任意 CSS 旋轉/傾斜不屬於此對應。

`A11yAttributes`：

```ts
{
  // Element + identity
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea';   // default 'div'
  role?: string;
  label?: string;                      // aria-label
  labelledby?: string;                 // aria-labelledby
  describedby?: string;                // aria-describedby

  // Focus & pointer
  tabIndex?: number;
  pointerEvents?: 'auto' | 'none';     // default 'auto'

  // Native element attributes (only for the matching `tag`)
  href?: string; target?: string;      // tag: 'a'
  src?: string; alt?: string;          // tag: 'img'
  inputType?: string; placeholder?: string; value?: string;
  textInputStyle?: TextInputStyle;     // native editor typography

  // State
  checked?: boolean; disabled?: boolean; selected?: boolean;
  expanded?: boolean; required?: boolean; invalid?: boolean;
  valuemin?: string; valuemax?: string;
  level?: number;                      // aria-level (headings, tree items)

  // Relationships & popups
  controls?: string; haspopup?: string; activedescendant?: string;
  ariaModal?: 'true' | 'false';        // aria-modal on a role="dialog"

  // Live regions
  live?: 'off' | 'polite' | 'assertive';
  atomic?: boolean;                    // aria-atomic
  relevant?: string;                   // aria-relevant
}
```

每個欄位都會在每一影格透過髒檢查投影到真實屬性上。回傳 `undefined` 會**移除**屬性，因此不再適用的狀態會消失而非變得過時——注意 `false` 與 `undefined` 在此不同（`aria-invalid="false"` 表示「明確有效」且會被保留）。

同步會將這些套用到真實元素（真正的 `<button>`、`<a href>`、`<img>`、具有 IME 感知 `change`/`focus`/`blur` 的 `<input>`/`<textarea>` 等）。這就是「**canvas 效能與 DOM 等級無障礙**」的故事：視覺 100% 為 GPU/canvas，然而 Playwright/agent 的 `getByRole('button', { name })` 會解析陰影節點並點擊它。

## 焦點順序

非原生可聚焦的可互動角色（`button`、`switch`、`checkbox`、`link`、`slider` 等）會取得 `tabindex="0"` 以及 Enter/Space → `click`。

**複合元件有所不同。** `tree`、`grid`、`menu`、`radiogroup` 或 `tablist` 是一個標籤停靠點，而不是每個子元素一個——因此它們的子元素使用**漫遊 tabindex**：恰好一個子元素攜帶 `tabIndex: 0`，其餘為 `-1`，方向鍵移動該停靠點。參見[複合元件](#fu-he-yuan-jian-man-you-tabindex)。

標籤順序遵循**視覺**閱讀順序，而非場景圖插入順序——參見 [`Scene.readingDirection`](/reference/core-scene/#wu-zhang-ai-yu-wai-guan) 了解 RTL。

當非控制項區域（如設計 canvas）必須進入循序焦點順序並接收 VMT `keydown` 事件時，明確設定 `tabIndex: 0`。使用 `-1` 僅用於程式化焦點；回傳 `undefined` 會移除明確的值。

## 複合元件（漫遊 tabindex） {#fu-he-yuan-jian-man-you-tabindex}

樹、格線、選單、單選按鈕群組或標籤列表必須為每個子元素暴露**一個角色**，而不僅僅是容器角色——否則 AT 看到的是一個不透明的方框。VectoJS 透過在每個可見子元素上方匯集一個透明的、可聚焦的子實體（「熱點」）來實作：它攜帶子元素的 `role` + 狀態 + 漫遊 `tabIndex`，不渲染任何內容，父元素擁有鍵盤處理程式。

關鍵的是，這些熱點設定 `pointerEvents: 'none'`。底層元件已經擁有滑鼠（點選切換、拖曳滾動、可選取的儲存格文字），因此熱點不能攔截它——鍵盤焦點和 AT 合成的 `click` 仍然可以透過 `pointer-events:none` 元素運作。

| 元件          | 子角色                                                         | 鍵盤操作                                                                                                        |
| ------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `TreeView`    | `treeitem`（+ `aria-level`、`aria-expanded`、`aria-selected`） | 上/下移動 · 右展開然後進入 · 左折疊然後回到父級 · Home/End · Enter/Space 啟動                                   |
| `Table`       | `row` › `gridcell` / `columnheader`                            | 方向鍵二維移動（header 為 row −1）· Home/End 行極值 · Ctrl+Home/Ctrl+End 格線角落                               |
| `ContextMenu` | `menuitem`（+ `aria-haspopup`、`aria-expanded`）               | 上/下循環並跳过分隔符 + 停用項 · Home/End · Right 開啟子選單 · Left 返回父選單 · Enter/Space 啟動 · Escape 關閉 |
| `RadioGroup`  | `radio`（+ `aria-checked`）                                    | 方向鍵移動並選取 · Home/End · Space 選取                                                                        |
| `Tabs`        | `tab`（+ `aria-selected`）                                     | 方向鍵移動 · Home/End · Space/Enter 啟動                                                                        |

只有可見子元素被匯集，因此虛擬化的 `TreeView` 或 `Table` 投影 O(viewport) 個熱點，而非資料集中每一列一個。聚焦的列/儲存格在焦點移動到它之前會滾動到檢視中。

## 強制色彩（高對比度）

canvas 是不透明像素，因此瀏覽器的 `forced-colors` 重新對應永遠不會觸及 VectoJS 繪製的內容——在 Windows 高對比度下，主題控制項會保持不可讀，除非元件重新繪製自身。請參見 [`Scene.forcedColors`](/reference/core-scene/#wu-zhang-ai-yu-wai-guan) 並使用 CSS 系統顏色（`ButtonFace`、`ButtonText`、`Highlight`、`Canvas`、`CanvasText`）繪製；當設定切換時場景會自動重繪。`Button` 已經這樣做了。

## 高實體數量下的投影開銷（`1.30.0+`）

每個擁有 box 的可互動 entity 只要維持可互動，就會取得一個陰影節點。這對按鈕是正確的，但對成千上萬個轉瞬即逝、單獨看毫無意義的 entity——粒子、彈幕留言、圖節點——就是錯的：它每一格都為每個 entity 產生一個 DOM 節點。

在 5,000 個運動中的可互動 entity 上測得：

|                              | Chrome        | Firefox        |
| ---------------------------- | ------------- | -------------- |
| 每個 entity 都可互動         | 66.4 ms/frame | 114.7 ms/frame |
| `a11yProjection: 'onDemand'` | 2.23 ms       | 1.69 ms        |
| 完全沒有陰影節點             | 1.35 ms       | 1.75 ms        |

兩個 eager 列連 60 Hz 的預算都達不到。`'onDemand'` 落在「什麼都不投影」的下限上，同時每個 entity 仍可被單獨觸及。

`Entity.a11yProjection` 選擇節點何時被具體化：

```ts
particle.a11yProjection = 'onDemand';
```

- **`'eager'`**（預設）——entity 處於可互動且有 box 時，節點即存在。行為不變；一般控制項請保持原樣。
- **`'onDemand'`**——只在 entity **被使用**時才存在節點。用於高基數的可互動 entity。
- **`'never'`**——完全沒有節點。除非 entity 確實需要指標事件而不需要語意存在，否則優先使用 `interactive = false`。

### 什麼算是被使用

三個信號，任一滿足即可。刻意**不**採用單獨的 hover：鍵盤或螢幕閱讀器使用者不產生指標事件，因此以 hover 為門檻的節點會恰好對它本該服務的使用者被扣留。

- **焦點。** 已取得焦點的節點永不被修剪，因此不會在互動過程中把焦點從使用者手中抽走。
- **指標位於 entity 內部。**
- **一次明確的請求**——見下文。

entity 在整個過程中始終維持可在 canvas 上進行命中測試，因此點擊總能到達它並將其提升。

```ts
// Keep the selected item projected for as long as it is selected.
scene.requestA11yProjection(selected);
scene.releaseA11yProjection(previous);
```

兩者都接受一個 `Entity` 或 id 字串，且具備幂等性。釋放不會立即移除節點——只要它仍處於焦點中或指標之下就會留存，並在下一次發現它未被使用的同步中被修剪。對 `'eager'` 的 entity 兩者都是空操作，因為它總是被投影。

對於只有應用程式自己知道其重要性的東西，請使用明確的請求：一個選取項、一個搜尋命中項、一個剛在即時區域中被播報的元素。

> [!IMPORTANT]
> 自身投影**可選取文字**的 entity 永遠不會被指標提升。它的陰影節點帶有 `pointer-events: auto` 並疊放在透明的文字鏡像之上，因此在指標下具體化一個節點會吞掉 `mousedown`，原生拖曳選取將永遠不會開始。焦點與明確請求仍然能到達它。這與使 [`Text`](/reference/ui-text/) 和 `RichText` 預設不可互動的衝突是同一個。

基數本身並不是動用 `'onDemand'` 的判準，而下面這種情形最容易被弄錯：

> [!WARNING]
> **不要因為與粒子類比就把 `'onDemand'` 用在正文文字上。** 對於按鈕或圖節點，canvas entity 是主體，陰影節點是暫時的語意代理，因此在被使用前扣留它不會損失什麼。而對於散文、Markdown 或聊天記錄，canvas 點陣圖對螢幕閱讀器**完全不可讀**，並且對非視覺使用者而言**閱讀就是首要互動**，而非偶爾為之的操作。文字 entity 預設不可互動，承載其語意的是[內容投影](/reference/core-renderer/#entity-getcontentprojection)——而不是陰影節點；該投影按行虛擬化，並保持常駐。

另外，能被單獨觸及與能被理解並不是同一件事：

> [!NOTE]
> `'onDemand'` 本身並不構成完整的無障礙方案。一千條可被單獨觸及的彈幕，合起來仍然什麼也沒說。請把它與一個聚合的即時區域（`role: 'status'`、`a11yFullViewport`）以及一小池用於當前選取的常駐熱點搭配使用，這樣 DOM 節點數會維持恆定，而不是隨 entity 數量增長。

## 控制項與注意事項

- 每個陰影節點上的 `data-vecto-id` 鏡射 entity `id` — 是自動化選擇器的穩定控制柄。
- `a11ySyncInterval`（見 [`SceneOptions`](/reference/core-scene/#sceneoptions)）
  在動畫期間節流同步，並確保在待處理的動作沉澱後進行最終的追趕；
  它不會在整個動畫期間暫停所有同步。
- `debugA11y: true` 顯示節點（藍色虛線）以供開發。
- `detachA11y(entity)` 修剪子樹的陰影節點而不移除 entity；
  `remove()` 會自動修剪。每幀同步**建立/更新但從不修剪**，
  因此請明確管理可互動子項目的變動。
- `getA11yTree()` 回傳一個巢狀的 `A11yTreeNode[]` 快照以供斷言；
  `getA11yElement(id)` 擷取特定的陰影元素。
- `a11yFullViewport` 在所有其他項目之後掛載一個無界的互動表面。
- 從 Core 1.11.1 起，新投影的互動實體會在建立 shadow node 的同一影格取得與畫布繪製順序一致的 `z-index`。因此，新覆蓋層的 backdrop 在第一次指標互動時就位於既有設計控制項之上，不必等待下一次渲染。

使用模式和測試模式請參閱 [Accessibility](/learn/accessibility/)。

## URL 消毒（`sanitizeUrl` / `isSafeUrl`）

這兩個輔助函式都來自 `@vectojs/core`（定義於 `renderer/url.ts`），用於在 VectoJS 將 `href` 投影到陰影 `<a>` 節點上，或將其傳給 `window.open`（用於無障礙 sink 和 Markdown 連結渲染）時，阻止 `javascript:` / `data:` / `vbscript:` / `file:` URI 指令碼注入。

```ts
sanitizeUrl(href: string | null | undefined): string
isSafeUrl(urlStr: string): boolean
```

`sanitizeUrl` 是投影路徑：對 `null`/`undefined` 回傳 `''`，去除前導空白，**相對** URL 原樣通過（相對 URL 永遠不會被注入指令碼），並將任何 scheme 不在安全集合——`http`、`https`、`mailto`、`tel`、`ftp`——中的絕對 URL 重寫為無害的 `'#'`，使連結保持非空但無效。它永遠不會拋出例外。

`isSafeUrl` 是更嚴格的守衛，用於那些已經持有絕對 URL 的程式碼：當 scheme 在安全集合中時回傳 `true`（相對 URL 也是安全的），否則回傳 `false`。

安全 scheme 是固定的：`http:`、`https:`、`mailto:`、`tel:`、`ftp:`。`ui-link` 和 Markdown 連結回呼都會在 `href` 到達 DOM 之前將其透過 `sanitizeUrl` 路由——如果你自己渲染不受信任的連結，也請這樣做。

## 相關

[`Scene`](/reference/core-scene/)（`a11ySyncInterval`、`debugA11y`）·
[`Entity`](/reference/core-entity/)（`getA11yAttributes()`、`interactive`、`width`/`height`）·
[`@vectojs/core` 概覽](/reference/core-api/)
