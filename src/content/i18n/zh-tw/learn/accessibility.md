---
title: '無障礙與自動化'
description: 'VectoJS 如何將語意 DOM 控制項投射到畫布內容上方，以支援螢幕閱讀器、鍵盤使用者和 Playwright 自動化。'
order: 15
---

# 無障礙與自動化

畫布和 WebGL 像素本身不攜帶任何語意資訊。對於符合條件的可互動實體，VectoJS 在其 `a11yRoot` 覆蓋層中維護一個真實、不可見的 DOM 元素。螢幕閱讀器、鍵盤導覽和自動化工具可以與這些元素互動，而畫布支援的層則提供視覺效果。這是一個投射層，而不是瀏覽器的 Shadow DOM API，應用程式仍然需要負責正確的語意和測試。

## 陰影 DOM 投射的運作方式

當一個實體具有 `interactive = true`（且一個非零的框）時，`Scene` 會建立一個真實的 HTML 元素——`<button>`、`<input>`、`<a>` 等——並使用絕對 CSS 將其定位在畫布上方。該元素具有 `opacity: 0` 和 `pointer-events: auto`，因此它對眼睛不可見，但對無障礙工具完全可操作。

<figure>
  <img src="/images/shadow-dom-layers.svg" alt="圖表顯示三個堆疊層：z-index 0 的畫布層，帶有 GPU 渲染的元件；z-index 9 的 DOM 入口層；z-index 10 的無障礙陰影層，包含透明的真實 DOM 元素，如 button 和 input。一個指標游標箭頭首先擊中最上層。" class="diagram" />
  <figcaption>畫布父元素中的三個層。只有無障礙層具有 <code>pointer-events: auto</code>，因此點擊在到達畫布之前會先到達真實的陰影元素。</figcaption>
</figure>

無障礙層位於 canvas 的父 `<div>` 中，`Scene` 會自動將其強制設定為 `position: relative`。

在每個渲染幀（由 `a11ySyncInterval` 節流）上，Scene：

1. 讀取每個可互動實體的 `getA11yAttributes()`。
2. 建立或更新對應的陰影節點（髒檢查以最小化 DOM 寫入）。
3. 套用實體的完整世界仿射矩陣和本地 `width × height`；投射根將邏輯 Scene 座標對應到畫布 CSS 框。

支援畫布偏移和非均勻 CSS 縮放。請勿假設在畫布的任意 CSS 旋轉/傾斜下能對齊；請在實際頁面上使用 `debugA11y` 進行驗證。

> [!NOTE]
> 同步操作**從不在幀期間進行剪枝**。如果你的程式碼頻繁新增和移除可互動的子實體，請在丟棄它們之前呼叫 `scene.detachA11y(entity)`，否則它們的陰影節點將會洩漏。`scene.remove(entity)` 會遞迴且安全地進行剪枝。

## 選擇加入：`entity.interactive`

```typescript
entity.interactive = true; // 啟用陰影節點 + 指標/鍵盤事件
entity.width = 120;
entity.height = 40; // 只有當 width > 0 時才會建立陰影節點
```

設定 `interactive = true` 有一個副作用：它會標記 `a11yNeedsReorder` 並呼叫 `scene.markDirty()`。

## 控制陰影節點：`getA11yAttributes()`

覆寫 `getA11yAttributes()` 以指定元素類型、ARIA 角色和語意狀態：

```typescript
import type { A11yAttributes } from '@vectojs/core';

class AccessibleBtn extends Entity {
  label = '提交';

  getA11yAttributes(): A11yAttributes {
    return {
      tag: 'button',
      role: 'button',
      label: this.label,
    };
  }
}
```

完整介面：

```typescript
interface A11yAttributes {
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea'; // 預設：'div'
  role?: string; // ARIA 角色（例如 'switch', 'slider', 'combobox'）
  label?: string; // aria-label / 可存取名稱
  tabIndex?: number; // 非控制項鍵盤區域的明確焦點順序
  href?: string; // 用於 tag='a' — 使其成為真實連結
  src?: string; // 用於 tag='img'
  alt?: string; // 用於 tag='img'
  inputType?: string; // 用於 tag='input' — 'text', 'checkbox' 等
  placeholder?: string; // input/textarea 的佔位文字
  value?: string; // input/textarea 的當前值
  checked?: boolean; // input[type=checkbox] 或 aria-checked（用於 role=switch）
  disabled?: boolean;
  expanded?: boolean; // aria-expanded（用於 combobox、disclosure）
  controls?: string; // aria-controls（指向另一個元素的 id）
  haspopup?: string; // aria-haspopup
  selected?: boolean; // aria-selected（用於 listbox 選項）
  activedescendant?: string; // aria-activedescendant（用於複合小工具）
  valuemin?: string; // aria-valuemin（用於滑桿、儀表）
  valuemax?: string; // aria-valuemax

  // 與其他節點的關係和命名
  labelledby?: string; // aria-labelledby
  describedby?: string; // aria-describedby — 提示/錯誤文字

  // 驗證狀態（canvas 表單可被朗讀的唯一方式）
  required?: boolean; // aria-required
  invalid?: boolean; // aria-invalid — 注意 false 表示「明確有效」

  // 結構與對話框
  level?: number; // aria-level（標題、樹項目）
  ariaModal?: 'true' | 'false'; // role="dialog" 上的 aria-modal

  // 即時區域 — 在不移動焦點的情況下朗讀串流更新
  live?: 'off' | 'polite' | 'assertive';
  atomic?: boolean; // aria-atomic — 讀取整個區域，而非差異
  relevant?: string; // aria-relevant — 例如 'additions text'

  // 指標表面
  pointerEvents?: 'auto' | 'none'; // 'none' 用於結構性/僅覆蓋節點

  target?: string; // 用於 tag='a'
  textInputStyle?: TextInputStyle; // 原生編輯器排版
}
```

將欄位返回 `undefined` 會**移除**該屬性，因此停止套用的狀態會消失而不是變為過時。

對於不是按鈕或表單控制項但必須擁有鍵盤快捷鍵的畫布工作區，使用明確的 `tabIndex: 0`：

```typescript
getA11yAttributes(): A11yAttributes {
  return { role: 'region', label: '設計畫布', tabIndex: 0 };
}
```

讓原生 input、textarea 和可編輯內容負責其編輯快捷鍵。Scene 會在屬性變更時刷新明確的 tab 索引。

### 內建元件投射的內容

| 元件               | 陰影元素                                   | 關鍵 ARIA 屬性                                               |
| ------------------ | ------------------------------------------ | ------------------------------------------------------------ |
| `Button`           | `<button>`                                 | `role="button"`, `aria-label`                                |
| `Link`             | `<a href>`                                 | 原生連結, `aria-label`                                       |
| `Image`            | `<img>`                                    | `src`, `alt`                                                 |
| `Input`            | `<input type="text">`                      | `placeholder`, `value`（即時）                               |
| `TextArea`         | `<textarea>`                               | `placeholder`, `value`（即時）                               |
| `Checkbox`         | `<input type="checkbox">`                  | `checked`（即時）, `aria-label`                              |
| `Toggle`           | `<div role="switch">`                      | `aria-checked`（即時）, `aria-label`                         |
| `Slider`           | `<div role="slider">`                      | `aria-valuenow/min/max`（即時）                              |
| `Dropdown`         | `<div role="combobox">`                    | `aria-expanded`, `aria-controls`, 選單項目為 `role="option"` |
| `Card`（含 label） | `<div role="group">`                       | `aria-label`                                                 |
| `Table`            | `grid` › `row` › `gridcell`/`columnheader` | 浮動 tab 索引，2D 方向鍵，Ctrl+Home/End                      |
| `TreeView`         | 每行一個 `treeitem`                        | `aria-level`/`expanded`/`selected`，方向鍵展開/摺疊          |
| `ContextMenu`      | 每項一個 `menuitem`                        | `aria-haspopup`/`expanded`，方向鍵迴圈，Escape 關閉          |
| `RadioGroup`       | 每選項一個 `radio`                         | `aria-checked`，方向鍵移動+選取                              |
| `Tabs`             | 每個分頁一個 `tab`                         | `aria-selected`，方向鍵移動，Home/End                        |
| `Text`             | `<div>`                                    | `aria-label` = 文字內容                                      |

## 複合小工具——一個 Tab 停駐點，方向鍵在內部操作

樹、網格、選單、單選群組或分頁列表不應將每個子元素放入 Tab 順序中。VectoJS 在每個**可見**子元素上方池化一個透明的可聚焦熱點，攜帶該子元素的角色和狀態，並恰好為其中一個赋予 `tabIndex: 0`——一個**浮動 Tab 索引**。父元素擁有方向鍵處理器並移動停駐點。請參閱上表了解每個元件的按鍵，以及[複合小工具](/reference/core-a11y/#複合元件漫遊-tabindex)了解你自己建構時的模式。

重用該模式而不是自行發明：重要的微妙之處是當底層的某些東西擁有滑鼠時（可選取儲存格文字、拖曳捲動、畫布命中處理），熱點必須設定 `pointerEvents: 'none'`。鍵盤焦點和 AT 合成的 `click` 仍然可以穿透它運作。

Tab 順序遵循**視覺**閱讀順序，而非你加入實體的順序。對於 RTL UI，在 Scene 上設定 `readingDirection: 'rtl'`，以便每行內的內聯順序也會反轉。

## 強制色彩（Windows 高對比度）

`<canvas>` 是不透明像素，因此瀏覽器的 `forced-colors` 重新對應永遠不會到達你繪製的任何內容——主題化控制項保持低對比且難以閱讀，除非它自行重繪。讀取 `scene.forcedColors` 並使用 CSS 系統色彩繪製；當作業系統設定切換時，場景會自動重繪：

```typescript
render(r: IRenderer) {
  const forced = this.scene?.forcedColors ?? false;
  r.beginPath();
  r.roundRect(0, 0, this.width, this.height, 8);
  r.fill(forced ? 'ButtonFace' : this.bg);
  if (forced) r.stroke('ButtonText', 1);       // 給形狀一個邊緣
  r.fillText(this.label, x, y, this.font, forced ? 'ButtonText' : this.color);
}
```

`Button` 已經這樣做了。使用 `Highlight` 表示選取/焦點，`Canvas`/`CanvasText` 表示表面和內文文字。

## 支援 IME 的輸入欄位

`Input` 和 `TextArea` 使用**真實、透明的陰影 `<input>`/`<textarea>` 元素**進行文字輸入。這意味著：

- IME 組合（中文、日文、韓文、阿拉伯文）原生運作——瀏覽器處理候選視窗。
- 文字選取、剪貼簿（剪下/複製/貼上）、復原/重做都是原生的。
- 畫布是一個**純粹的視覺鏡像**：它從 `change` 事件讀取 `value`、`selectionStart`、`selectionEnd` 和 `composition`，並繪製游標、選取高亮和 IME 底線。

當輸入欄位處於焦點時，同步操作會避免寫回相同的使用者同步值。如果應用程式狀態提供了真正不同的值，則會套用它；因此受控元件在取代文字時應有保留選取範圍的設計。

## 靜態內容投射

互動控制項投射無障礙節點。靜態內容投射涵蓋非互動側：渲染靜態文字的實體透過 `getContentProjection()` 暴露文字內容，Scene 將其鏡像為一個**透明、位置同步的 DOM 節點**，疊加在繪製的字形上方。螢幕閱讀器、Ctrl+F、爬蟲和翻譯擴充功能因此可以看到在畫布上視覺渲染的文字。

```typescript
// 內建：TextEntity 和 MSDFTextEntity 暴露內容。Text、RichText、
// Markdown、圍欄 CodeBlock 和 Table 儲存格文字預設為可選取。

// 自訂實體以相同方式選擇加入：
class Caption extends Entity {
  label = '在畫布上渲染，可被 Ctrl+F 找到';
  getContentProjection() {
    return { text: this.label, font: '16px sans-serif' };
  }
  // …render() 繪製相同的字串…
}
```

這在無需額外工作的情況下實現了以下功能：

- **頁面內搜尋** — Ctrl+F 可匹配；瀏覽器的高亮框在透明字形後方渲染。
- **螢幕閱讀器和爬蟲**按原始順序讀取真實文字。
- **翻譯擴充功能和閱讀器模式**在投射層上運作。
- **`#:~:text=`** 片段連結可解析。
- **原生滑鼠選取** — 每個自訂實體可選擇加入 `selectable: true`（`::selection` 高亮在透明字形後方繪製）。核心投射預設為關閉，以免任意文字攔截畫布輸入。UI Text/RichText/Markdown/Table 內容預設為可選取，並暴露 `setSelectable(boolean)`。

對於像素精確的選取，請將 Canvas 基線視為真相來源：對於單次繪製使用 `baseline`（和 `contentX`/`contentY`），對於換行、內縮或混合大小的文字使用明確的視覺 `lines`。Core 1.8 將這些本地座標透過變換映射，並為每個投射的文字行提供相同的 CSS 行盒。當視覺行的邏輯來源以換行或保留的軟換行分隔符結束時，設定 `separatorAfter`。Scene 將該分隔符合併到行的最終文字節點中，以便 Firefox 不會將多行選取的一部分放置在投射根處。`text` 仍然是權威的邏輯 Unicode 來源；切勿以造型後的視覺字形順序替代。不要使用頁面層級的 CSS 偏移進行補償。

可選取的一般文字、明確的視覺行和無行的自訂投射在變換後的二維幾何中解析合法的字素游標。旋轉、鏡像變換、非均勻縮放、分數 DPR 和瀏覽器縮放不會將指標路由減少為視窗 X 座標。類似程式碼的實體應額外在 Canvas 繪製和 `ContentProjection.grid` 之間共享 `prepareContentGrid()` 結果；這保持了製表符、表情符號/ZWJ、CJK 寬度、阿拉伯文、雙向、剪貼簿來源和選取幾何在相同的保留計劃上。

對於原生 `Input`/`TextArea` 實作，透過 `getA11yAttributes()` 暴露 `textInputStyle: { font, lineHeight, padding }`。Scene 將其套用到具有 `box-sizing: border-box` 的透明編輯器，而畫布應從相同的內距和行盒基線繪製。

注意事項：

- 投射是**視窗和裁剪懶惰的**：完全在 Scene 或 `clipChildren` 祖先外部的文字設定為 `display: none`，且無法攔截輸入。
- 動態投射會重新排序以匹配 VMT 原始順序；移除子樹會移除每個子代投射。
- 當實體同時為 `interactive` 時，其文字副本為 `aria-hidden`，以便螢幕閱讀器不會朗讀它兩次。
- 使用 `new Scene(canvas, { contentProjection: false })` 為純裝飾性場景停用整個層。
- 瀏覽器尋找涵蓋已具體化的內容。它無法搜尋應用程式尚未掛載的虛擬化實體。
- 全局快捷鍵路由器必須在 `window.getSelection()?.isCollapsed === false` 時讓出原生複製，且不得抑制 Ctrl/Command+F，除非應用程式有意取代瀏覽器尋找。

## `debugA11y` 選項

在 `SceneOptions` 中啟用 `debugA11y: true`，使陰影節點在開發期間可視——它們會以藍色虛線輪廓顯示：

```typescript
const scene = new Scene(canvas, { debugA11y: true });
```

開啟瀏覽器 DevTools → Elements，你會看到實際的 `<button>`、`<input>` 和 `<a>` 元素定位在畫布上方。這是驗證角色、標籤和位置是否正確的最快方法。

## `a11yFullViewport` — 無邊界表面

某些實體覆蓋整個 Scene 視窗（無限畫布、手勢辨識器、背景點擊陷阱）。這些沒有有意義的邊界框。設定 `a11yFullViewport = true` 以投射一個隨畫布 CSS 框變化的 Scene 大小陰影節點：

```typescript
class PanGesture extends Entity {
  constructor() {
    super();
    this.interactive = true;
    this.a11yFullViewport = true; // 無需 width/height
  }

  getA11yAttributes() {
    return { role: 'application', label: '平移和縮放畫布' };
  }
}
```

全視窗節點被掛載在所有其他陰影節點的**後面**，因此任何在上方的元件（按鈕、輸入欄位）保持可點擊。

## `a11ySyncInterval` — 動畫期間的節流

預設情況下，陰影 DOM 在每個渲染幀上同步。對於具有大量動畫和許多可互動實體的 UI，同步可能佔據主導地位的幀時間。進行節流：

```typescript
const scene = new Scene(canvas, { a11ySyncInterval: 100 });
// 在動畫期間，陰影 DOM 最多每 100ms 更新一次
```

該間隔在動畫運行期間保持活動，並且 Scene 會在待處理的運動穩定後安排最終的追趕同步。它不會在整個動畫期間凍結語意層。

節流以過時性換取成本，並且它不會減少每次同步的工作量。如果你的問題是實體數量而非同步頻率，請參閱下一節。

## 成本與互動實體數量成超線性關係

投影對 UI 來說很便宜，但對大量元素來說很昂貴。在真實硬體上量測（RTX 4060 筆電，實體每幀移動，每個實體投影一個元素）：

| 互動實體數量 | Chrome 每幀 | Firefox 每幀 |
| ------------ | ----------- | ------------ |
| 1,000        | 6.4ms       | 7.4ms        |
| 5,000        | 59.5ms      | 114ms        |
| 20,000       | 715ms       | 2737ms       |

每個實體從 1,000 到 20,000，在 Chrome 上從 6.4 變為 35.7µs，在 Firefox 上從 7.4 變為 136.9µs —— 隨著數量增長，每個實體的成本變得**更糟**，因為開銷來自每個元素的 DOM 寫入、閱讀順序排序以及瀏覽器自身的無障礙樹重建，所有這些都隨元素數量而退化。樹走訪本身可以忽略不計（約 0.005µs/實體）。

實際規則：`interactive = true` 適用於使用者與之互動的內容。它不是讓成千上萬個裝飾性或臨時物件可點擊測試的方式。

對於粒子場、彈幕層或精靈群，請優先選擇以下之一：

- **投影容器，而非成員。** 整個層使用一個互動實體，透過 `aria-label` 集體描述它（如"5,000 個粒子"），並透過 `scene.findEntityAt(x, y)` 自行處理指標輸入 —— 它無論實體是否為 `interactive` 都能解析實體，因此點擊測試不需要投影。
- **只投影可觸及的內容。** 虛擬化 `TreeView`/`Table` 使用的池化模式將熱點池大小調整為可見行而不是整個資料集，因此投影保持 O(視埠)。參見[複合小工具](#複合小工具一個-tab-停駐點方向鍵在內部操作)。
- **當實體停止可操作時，呼叫 `scene.detachA11y(entity)`。** 在別處記錄為洩漏避免，它同樣是一個成本槓桿：每幀同步建立和更新但從不修剪。

> 一個每實體的 `a11yProjection` 模式（`'eager' | 'onDemand' | 'never'`），僅在懸停/焦點上實體化一個節點，已設計但**尚未實現**。請注意它不能基於"是否存在螢幕閱讀器"來決定鍵控 —— 這出於設計（W3C TAG 設計原則 2.7）是故意不可偵測的，並且 AOM 虛擬無障礙節點在每個引擎中因隱私原因被阻止。

## 程式化檢查陰影樹

```typescript
// 取得所有投射的陰影節點的巢狀快照
const tree = scene.getA11yTree();
// 返回：A11yTreeNode[] — { id, tag, role, label, value, children, ... }

// 取得特定實體的實際 HTMLElement
const el = scene.getA11yElement(entity.id);
el?.focus(); // 程式化地聚焦一個陰影節點
```

## Playwright 整合

因為每個可互動實體都會投射一個真實的 DOM 元素，標準的 Playwright 選擇器無需任何特殊適配器即可運作：

```typescript
import { test, expect } from '@playwright/test';

test('切換開關控制物理引擎', async ({ page }) => {
  await page.goto('/demos/nexus');

  // 因為 Toggle 投射了一個 <div role="switch" aria-label="Physics">
  const toggle = page.getByRole('switch', { name: 'Physics' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
});

test('搜尋輸入框過濾結果', async ({ page }) => {
  await page.goto('/');

  // Input 投射了一個真實的 <input type="text" placeholder="Search…">
  await page.getByPlaceholder('Search…').fill('spring');
  await expect(page.getByRole('option')).toHaveCount(3);
});

test('按鈕可透過鍵盤存取', async ({ page }) => {
  await page.goto('/demos/chat');

  // Tab 到按鈕，按 Enter
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
});
```

### 透過 `data-vecto-id` 選取

每個陰影節點都帶有一個等於 `entity.id` 的 `data-vecto-id` 屬性。對於在標籤文字變更時保持穩定的選擇器：

```typescript
const entity = new Button('提交');
entity.id = 'submit-btn'; // 或在建構函式中透過 super 設定 id

// 在 Playwright 中：
await page.locator('[data-vecto-id="submit-btn"]').click();
```

## 螢幕閱讀器測試檢查清單

- [ ] 每個可互動實體都有 `interactive = true` 和一個非零的框。
- [ ] `getA11yAttributes()` 返回有意義的 `tag` 和 `label`。
- [ ] `Input`/`TextArea` 有 `placeholder`（用作 `aria-label`）。
- [ ] `Checkbox`/`Toggle` 的 `checked` 狀態在 `getA11yAttributes()` 中即時反映。
- [ ] `Slider` 在每次渲染時都設定了 `valuemin`、`valuemax` 和 `value`。
- [ ] `Card` 分組在代表邏輯區域時有 `label`。
- [ ] Tab 順序合理（陰影節點按 DOM 順序定位，與加入順序匹配）。
- [ ] 執行 `scene.getA11yTree()` 並檢查輸出以找出遺失的標籤。
- [ ] 啟用 `debugA11y: true` 並視覺驗證節點位置是否與畫布元件匹配。

## 疑難排解

### 陰影節點位置與畫布元件偏移

兩個常見原因：

1. **Canvas 父元素不是 `position: relative`** — `Scene` 會在每幀自動設定此屬性，但具有更高優先權強制設定 `position: static` 的 CSS 規則會覆蓋它。請檢查 canvas 父元素上的計算樣式。
2. **CSS `transform` 作用於 canvas 父元素** — 陰影節點的絕對定位相對於最近的有定位祖先，但 `transform` 會建立新的堆疊上下文，可能導致偏移。將 `transform` 移動到 canvas 元素本身，而不是父元素。

如果你之前使用 `a11yOffsetX` / `a11yOffsetY` 作為解決方法，請移除它們並改為修復底層的定位問題。

### Playwright `getByRole()` 找不到任何內容

請檢查以下幾點：

1. `entity.interactive` 必須為 `true` 且 `entity.width > 0`。
2. `getA11yAttributes()` 必須返回正確的 `tag` 和 `role`。要使 `page.getByRole('button')` 運作，tag 必須為 `'button'` 或 role 必須為 `'button'`。
3. 標籤必須匹配：`page.getByRole('button', { name: 'Submit' })` 需要在屬性中有 `label: 'Submit'`。
4. 場景必須已呼叫 `start()` — 無障礙同步發生在渲染迴圈期間。

使用 `scene.getA11yTree()` 列印當前投射的快照：

```typescript
console.log(JSON.stringify(scene.getA11yTree(), null, 2));
```

### `scene.getA11yTree()` 返回空陣列

無障礙樹只有當 `scene.start()` 至少運行了一個幀後才會被填充。如果在建構後同步呼叫 `getA11yTree()`，它將為空。請將其包裹在 `setTimeout` 中，或在使用者互動後檢查。

同時確認設定了 `entity.interactive = true` — 沒有 `interactive` 的實體永遠不會被投射。

> **下一步：** [UI 元件](/learn/ui-components/) — 完整的一套即用型互動元件。
