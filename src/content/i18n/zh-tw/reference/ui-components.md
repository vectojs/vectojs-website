---
title: '@vectojs/ui 元件參考'
description: '所有 @vectojs/ui 元件的完整參考：佈局容器、表單控制項、疊加層和豐富內容。'
order: 11
---

# `@vectojs/ui` — 元件參考

> 適用於 VectoJS zero-DOM Canvas 引擎的可重用高階元件。
> 文件版本：**1.9.1**。事實來源：`dist/index.d.ts`（公開表面）和 `packages/ui/src/*`（行為）。

每個元件都是 Virtual Math Tree（VMT）中的一個葉節點或容器。這裡沒有任何東西是真實的 DOM — 元件透過 `IRenderer` 將自身繪製到 Canvas。無障礙、agent 自動化和可爬取性來自一個並行的 **A11y Shadow DOM**：當元件是 `interactive` 時，`Scene` 會投射一個單一的隱藏、透明的真實 DOM 節點，定位在元件的範圍上方，由 `getA11yAttributes()` 建構。這就是為什麼 `page.getByRole('button', { name })` / `fill()` / 螢幕閱讀器可以對純 Canvas UI 運作的原因。

純文字應用表面可以從 `@vectojs/ui/text` 匯入 `Text`。這個
輕量級入口將 Markdown 和 MathJax 排除在啟動圖之外；在組合幾個元件系列時使用根 `@vectojs/ui` 入口。

## 即時元件畫廊

下面的畫廊現在是套件層級的冒煙測試。對於日常除錯，請使用聚焦的
元件頁面，以便在不滾動瀏覽每個元件的情況下檢查一個行為：

| 領域            | 元件頁面                                                                                                                                                                                                                                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 文字與媒體      | [`Text`](/reference/ui-text/)、[`RichText`](/reference/ui-richtext/)、[`Link`](/reference/ui-link/)、[`Image`](/reference/ui-image/)                                                                                                                                                                                                                                                 |
| 佈局容器        | [`Card`](/reference/ui-card/)、[`Stack`](/reference/ui-stack/)、[`Flow`](/reference/ui-flow/)、[`ScrollView`](/reference/ui-scrollview/)、[`VirtualList`](/reference/ui-virtuallist/)、[`TreeView`](/reference/ui-treeview/)、[`Resizable panels`](/reference/ui-resizable-panel/)                                                                                                   |
| 控制項與表單    | [`Button`](/reference/ui-button/)、[`Input`](/reference/ui-input/)、[`TextArea`](/reference/ui-textarea/)、[`Checkbox`](/reference/ui-checkbox/)、[`Toggle`](/reference/ui-toggle/)、[`Slider`](/reference/ui-slider/)、[`Dropdown`](/reference/ui-dropdown/)、[`RadioGroup`](/reference/ui-radiogroup/)、[`Tabs`](/reference/ui-tabs/)、[`ProgressBar`](/reference/ui-progressbar/) |
| 豐富內容        | [`Markdown`](/reference/ui-markdown/)、[`CodeBlock`](/reference/ui-codeblock/)、[`Table`](/reference/ui-table/)                                                                                                                                                                                                                                                                      |
| 疊加層與臨時 UI | [`Overlay`](/reference/ui-overlay/)、[`Tooltip`](/reference/ui-tooltip/)、[`Popover`](/reference/ui-popover/)、[`ContextMenu`](/reference/ui-contextmenu/)、[`Modal`](/reference/ui-modal/)                                                                                                                                                                                          |

<figure class=\"sandbox component-gallery\">
  <div class=\"sandbox-bar\"><span class=\"dot\"></span><span class=\"dot\"></span><span class=\"dot\"></span><span class=\"sandbox-label\">即時 · @vectojs/ui 1.9.1 · 內部可滾動</span></div>
  <iframe src=\"/sandbox/ui-components.html\" class=\"sandbox-frame component-gallery-frame\" loading=\"eager\" title=\"每個 VectoJS UI 元件的互動式畫廊\" sandbox=\"allow-scripts allow-same-origin allow-popups\"></iframe>
  <figcaption>套件層級冒煙畫廊：先廣域覆蓋，在除錯特定行為時使用聚焦的元件頁面。</figcaption>
</figure>

## 所有元件共用的慣例

所有元件都擴展 `UIComponent`，後者擴展核心 `Entity`。以下繼承成員被持續使用，下面**不會**在每個元件中重複。

| 成員                | 簽名                                               | 備註                                                                                                                                                 |
| ------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setPosition`       | `setPosition(x, y): this`                          | 局部空間定位；可鏈式呼叫。                                                                                                                           |
| `add` / `remove`    | `add(child: Entity): this` / `remove(child): this` | 子元素管理（容器會覆寫 `add` 以重新佈局）。                                                                                                          |
| `on` / `off`        | `on(event, cb, { capture? }): this`                | 類似 DOM 的 capture+bubble。事件：`click hover pointerdown pointerup pointercancel pointermove pointerleave change focus blur wheel keydown keyup`。 |
| `emit`              | `emit(event, payload): void`                       | 直接自身分發（無樹傳播）。                                                                                                                           |
| `getGlobalPosition` | `getGlobalPosition(): Point`                       | 累積祖先變換後的世界空間位置。                                                                                                                       |
| `scene`             | `get scene`                                        | 最近的附加 `Scene`；使用 `this.scene?.markDirty()` 在 `onDemand` 場景中請求重繪。                                                                    |
| `interactive`       | `interactive: boolean`                             | 為 true 時，元件投射 A11y 陰影節點並接收指標/鍵盤事件。                                                                                              |
| `clipChildren`      | `clipChildren: boolean`                            | 將一般子繪圖裁剪到局部範圍。Canvas/SVG 精確；Three 對旋轉/傾斜裁剪使用 AABB 剪刀。GPU point/WebGPU 疊加路徑不參與。由 `ScrollView` 使用。            |
| `width` / `height`  | `number`                                           | 元件的範圍；驅動點擊測試和視口剔除。                                                                                                                 |
| `padding`           | `number`                                           | 內部填充（預設 `0`）；box 風格元件預設更高。                                                                                                         |
| transforms          | `x y scaleX scaleY rotation opacity`               | 仿射變換和乘法不透明度由子元素繼承。                                                                                                                 |
| `animate`           | `animate(targetProps, durationMs): this`           | 將數值 tween 加入佇列。                                                                                                                              |

---

## `UIComponent`（抽象基底）

```ts
abstract class UIComponent extends Entity {
  padding: number; // 預設 0
  isPointInside(globalX: number, globalY: number): boolean;
  getBounds(): Bounds; // { x:0, y:0, width, height }

  // 進場/離場存在輔助
  protected enterMotion?: MotionSpec; // 掛載時播放
  protected exitMotion?: MotionSpec; // 由 dismiss() 播放
  dismiss(): Promise<void>; // 播放 exitMotion，然後從樹中移除
}
```

集中每個元件共享的 box 模型 + 軸對齊（AABB）點擊測試。`isPointInside` 回傳點是否在 `[0,width] × [0,height]` 局部空間中。`getBounds()` 回傳局部範圍，以便 `Scene` 可以進行視口剔除。子類別從測量的內容設定 `width`/`height`，實作 `render(r)`，並在互動時覆寫 `getA11yAttributes()`。

**存在：** 將 `enterMotion` / `exitMotion` 宣告為 `MotionSpec`（`{ props: { opacity: [0, 1], … }, config? }`），元件在掛載到即時場景時動畫進入，並在 `dismiss()` 時動畫離開 — 後者會延遲自身的移除直到離場動畫解析。一個共享實作覆蓋了[核心動畫系統](/reference/core-api/#animation)，取代了每個元件手動實作的彈簧。在 `prefers-reduced-motion` 下會抑制運動（透明度漸變保留）。

### `getA11yAttributes(): A11yAttributes`

每個互動式元件覆寫的掛鉤。回傳的形狀（來自 `@vectojs/core`）驅動投射的陰影節點：

```ts
interface A11yAttributes {
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea'; // 預設 'div'
  role?: string; // ARIA 角色
  label?: string; // aria-label / 可存取名稱
  href?: string; // 標籤 'a'
  src?: string;
  alt?: string; // 標籤 'img'
  inputType?: string;
  placeholder?: string;
  value?: string; // 標籤 'input'
  checked?: boolean; // input.checked 或 aria-checked，每幀重新整理
  disabled?: boolean;
  expanded?: boolean;
  controls?: string;
  haspopup?: string;
  selected?: boolean;
  activedescendant?: string;
  valuemin?: string;
  valuemax?: string;
}
```

---

## 文字與排版

### `Text`

```ts
new Text(text: string, opts?: TextOptions)

interface TextOptions {
  font?: string;                  // 預設 '16px sans-serif'
  color?: string;                 // 預設 '#e2e8f0'
  maxWidth?: number;              // 換行寬度；省略 → 僅明確 '\\n' 斷行
  lineHeight?: number;            // 行高（px），預設 20
  preserveLeadingSpaces?: boolean;// 預設 false
  selectable?: boolean;           // 瀏覽器原生拖曳選取，預設 true
}
```

使用原生 `fillText` 繪製的多行文字。換行/測量透過核心 `LayoutEngine`（與 `TextEntity` 相同的 `Intl.Segmenter` 路徑）進行，具有**冷/熱分割**：

- `setText(text): this` — 冷傳遞（重新分段 + 重新測量），然後重新佈局。
- `append(text): this` — 串流/打字機路徑；等於 `setText(this.text + text)` 但引擎的段落記憶體重用未觸碰的前導段落，因此只有變更的最後一個段落被重新測量。
- `setMaxWidth(maxWidth): this` — **熱**路徑；僅重新換行快取的測量文字（無重新分段）。響應式重排優先使用此方法。
- `setSelectable(selectable): this` — 啟用或停用投射的原生選取表面。

內容投射鏡像視覺斷行和行高，以支援瀏覽器查找、選取和複製。靜態 Text 不是互動點擊目標；Canvas/VMT 仍擁有其畫素和佈局。

### `RichText`

```ts
new RichText(spans: StyledSpan[], opts?: RichTextOptions)

interface RichTextOptions {
  font?: string;                          // 基礎簡寫，預設 '16px sans-serif'
  color?: string;                         // 預設填色，預設 '#e2e8f0'
  maxWidth?: number;                      // 換行寬度
  baseStyle?: TextStyle;                  // 每個 run 繼承（run 樣式仍優先）
  linkColor?: string;                     // 無自訂顏色的連結 run 預設 '#38bdf8'
  onLinkClick?: (href: string) => void;   // 當連結 run 被啟動時觸發
  exclusions?: ExclusionRect[];           // 文字繞流的矩形（排除形狀 / float）
  selectable?: boolean;                   // 瀏覽器原生拖曳選取，預設 true
}
```

多樣式內嵌文字：粗體 / 斜體 / 彩色 / 不同大小的 run 在共享基線上流動和換行。佈局使用核心 `LayoutEngine.prepareRich`；每個字形以其 run 的顏色/粗細/傾斜繪製。

- `setSpans(spans): this` — 取代 run 並重新佈局。
- `appendSpans(spans): this` — **串流**路徑；豐富段落記憶體重用未觸碰的前導段落，因此令牌串流在 O(變更的段落) 而非 O(文件) 中重新準備。
- `setMaxWidth(maxWidth): this` — 重排。
- `setExclusions(exclusions): this` — 設定 float 區域並重排。
- `setSelectable(selectable): this` — 在不重建 span 的情況下切換原生選取。

A11y：每個連續的**連結 run** 獲得一個透明的 `<a>` 熱點子元素（在重新換行時協調 — 每個 run 一個熱點；位置原地更新，僅連結_數量_的變更重建陰影節點）。元件自身的可存取名稱是完整的串聯文字。

### `measureText`, `wrapLines`, `wrapText`（自由函式）

```ts
measureText(text: string, font: string): number
```

CSS `font` 中的渲染畫素寬度，透過有界 LRU（上限 1000）進行記憶化。阿拉伯語在測量前會先塑形。無 DOM 時回退到每字元 `0.5em` 的估計。

```ts
wrapLines(text: string, font: string, maxWidth: number): string[]
```

貪婪單字換行，尊重明確的 `\\n`。過長的單字得到自己的行（不分割）。

```ts
wrapText(value: string, maxWidth: number, measure: (s: string) => number): WrappedLine[]

interface WrappedLine { text: string; start: number; end: number; }  // 絕對字元範圍
```

與 `wrapLines` 類似，但追蹤每行的絕對字元範圍（因此線性游標偏移映射到 `(line, x)`），消費硬 `\\n`（尾隨換行會產生游標可以停留的尾隨空行），並在字元層級分割過長的單一單字。由 `TextArea` 內部使用。

---

## 佈局容器

### `Stack`

```ts
new Stack(opts?: StackOptions)

interface StackOptions {
  direction?: 'vertical' | 'horizontal';  // 預設 'vertical'
  gap?: number;                            // 預設 0
  align?: 'start' | 'center' | 'end';      // 交叉軸，預設 'start'
  wrap?: boolean;                          // 預設 false
  maxWidth?: number;                       // 主軸換行閾值（水平）；預設 Infinity
  maxHeight?: number;                      // 主軸換行閾值（垂直）；預設 Infinity
}
```

沿主軸依序放置子元素，間距為 `gap`，在交叉軸上對齊。子元素保持自己的大小 — 僅設定 `x`/`y`。自身不繪製任何內容。

- `add(child): this` — 附加並**立即重新執行 `layout()`**。
- `layout(): void` — 定位所有子元素並調整容器大小以適應（因此可以被剔除）。在 `add` 外部變異子元素後手動呼叫（例如調整子元素大小）。

當 `wrap` 為 true 時，沿主軸會超過 `maxWidth`/`maxHeight` 的子元素會開始新行；容器在交叉軸上增長。

```ts
const col = new Stack({ direction: 'vertical', gap: 12 });
col.add(new Text('Title'));
col.add(new Button('Go'));
scene.add(col.setPosition(40, 40));
```

### `Flow`

```ts
new Flow(opts?: FlowOptions)

interface FlowOptions extends Omit<StackOptions, 'direction' | 'wrap'> {
  direction?: 'horizontal';
}
```

一個預先配置為 `{ direction: 'horizontal', wrap: true }` 的 `Stack` — 水平項目在超過 `maxWidth` 時換行到下一行。用於標籤雲、晶片行。繼承 `add()`/`layout()`。

### `Card`

```ts
new Card(opts: CardOptions)

interface CardOptions {
  width: number;          // 必填
  height: number;         // 必填
  bg?: string;            // 預設 '#0f172a'
  border?: string;        // 省略 → 無邊框
  borderWidth?: number;   // 預設 1
  radius?: number;        // 預設 12
  padding?: number;       // 預設 0（消費者手動定位子元素）
  label?: string;         // 設定時 → interactive + role=\"group\" landmark
}
```

一個帶有可選邊框的圓角背景面板。透過 `add()` 新增子元素；它們在卡的局部空間中渲染在上方。**預設為裝飾性**（無陰影節點，非互動）。傳遞 `label` 使其互動並投射 `{ role: 'group', label }`，以便輔助技術/agent 可以找到該區域。`padding` 僅供參考 — 它不會自動內縮子元素。

---

## 控制項與表單

以下所有表單控制項都是 `interactive` 並投射真實的陰影節點；canvas 是由陰影節點的原生事件驅動的視覺鏡像。

### `Button`

```ts
new Button(label: string, opts?: ButtonOptions)

interface ButtonOptions {
  onClick?: (e: unknown) => void;  // 對 BOTH canvas 點擊測試和陰影 <button> 點擊觸發
  bg?: string;                     // 預設 '#2563eb'
  hoverBg?: string;                // 預設 '#3b82f6'
  color?: string;                  // 標籤顏色，預設 '#ffffff'
  font?: string;                   // 預設 '600 16px sans-serif'
  padding?: number;                // 預設 12
  radius?: number;                 // 預設 8
}
```

帶有居中標籤的圓角矩形。`width` 自動調整為 `measureText(label, font) + 2·padding`；`height` 為 `fontSizePx(font) + 2·padding`（從 `font` 解析的 px 大小，而非測量的標籤寬度）。投射 `{ tag: 'button', role: 'button', label }` → 由 `getByRole('button', { name })` 驅動。公開狀態：`focused`（繪製 `#00f0ff` 焦點環），內部 `hovered`（切換到 `hoverBg`）。

### `Link`

```ts
new Link(label: string, opts: LinkOptions)   // opts 必填（href）

interface LinkOptions {
  href: string;          // 必填；導航目標 + 陰影 <a href>
  color?: string;        // 預設 '#38bdf8'
  font?: string;         // 預設 '16px sans-serif'
  underline?: boolean;   // 預設 true
}
```

帶顏色（可選底線）的文字。自動調整為標籤大小。投射一個真實的 `{ tag: 'a', href, label }` 陰影節點（原生可點擊/可爬取）。Canvas 點擊測試路徑透過 `window.open(href, '_blank', 'noopener')` 開啟。

### `Image`

```ts
new Image(src: string, opts: ImageOptions)

interface ImageOptions {
  width: number;          // 必填（canvas 需要已知範圍進行佈局/剔除）
  height: number;         // 必填
  alt?: string;           // 預設 ''
  placeholder?: string;   // 載入前的填色，預設 '#1e293b'
  radius?: number;        // 佔位符圓角半徑，預設 0
  onLoad?: () => void;    // 點陣圖載入完成時觸發
}
```

透過 `drawImage` 繪製；投射 `{ tag: 'img', src, alt, label: alt }`。載入是非同步的 — 在準備好之前繪製佔位符方塊。在 `onDemand` 場景中，傳遞 `onLoad: () => scene.markDirty()` 以在載入時重繪。（遮蔽 `globalThis.Image`；將類別參照為 `import { Image } from '@vectojs/ui'`。）

### `Input`

```ts
new Input(opts: InputOptions)

interface InputOptions {
  width: number;             // 必填
  height?: number;           // 預設 40
  placeholder?: string;
  value?: string;            // 預設 ''
  font?: string;             // 預設 '16px sans-serif'
  color?: string;            // 預設 '#e2e8f0'
  placeholderColor?: string; // 預設 '#64748b'
  bg?: string;               // 預設 '#0f172a'
  border?: string;           // 預設 '#334155'
  selectionColor?: string;   // 預設 'rgba(56, 189, 248, 0.35)'
  radius?: number;           // 預設 6
  padding?: number;          // 預設 10
  onChange?: (value: string) => void;
}
```

由**真實、透明的 `<input>` 陰影節點**支援的單行欄位。瀏覽器原生處理所有輸入 — 點擊、鍵盤、**IME 組字**、選取、剪貼簿、復原 — 在該元素上；canvas 僅繪製。`Scene` 透過一個 `change` 事件鏡像狀態回來，其 payload 攜帶 `value`、`selectionStart`、`selectionEnd` 和 `composition`。元件將這些重新公開為公開欄位：

- `value: string`、`focused: boolean`（驅動 500ms 游標閃爍）。
- `selectionStart` / `selectionEnd: number` — 從真實 input 鏡像的游標/選取偏移。
- `composition: { start; length } | null` — 活躍 IME 預編輯範圍（繪製為底線）。

A11y：`{ tag: 'input', inputType: 'text', placeholder, value, label: placeholder }`。Agent 按角色 `fill()` 它；人類輸入 CJK；canvas 渲染游標、選取高亮、IME 底線和滾動到游標（`scrollLeft`）。透過佈局引擎處理 RTL（Hebrew/Arabic）範圍。

### `TextArea`

```ts
new TextArea(opts: TextAreaOptions)

interface TextAreaOptions {
  width: number;             // 必填
  height?: number;           // 預設 120
  placeholder?: string;
  value?: string;            // 預設 ''
  font?: string;             // 預設 '16px sans-serif'
  lineHeight?: number;       // 字型大小的倍數，預設 1.4
  color?: string;            // 預設 '#e2e8f0'
  placeholderColor?: string; // 預設 '#64748b'
  bg?: string;               // 預設 '#0f172a'
  border?: string;           // 預設 '#334155'
  selectionColor?: string;   // 預設 'rgba(56, 189, 248, 0.35)'
  radius?: number;           // 預設 6
  padding?: number;          // 預設 10
  onChange?: (value: string) => void;
}
```

由**真實、透明的 `<textarea>` 陰影節點**支援的多行欄位 — 與 `Input` 相同的鏡像模型加上多行導航。Canvas 透過 `wrapText` 重新換行值，並繪製文字、選取和游標。公開欄位鏡像 `Input`：`value`、`focused`、`selectionStart`、`selectionEnd`、`composition`。`lineHeightFactor` 儲存 `lineHeight` 選項。

- `lineOfOffset(offset: number): number` — 包含線性字元偏移的視覺（換行後）行索引；邊界偏移解析到最早包含的行，超出範圍限制到最後一行。用於將游標位置映射到行。

A11y：投射一個 `textarea` 陰影節點；agent `fill()` 它，人類輸入 CJK，渲染保持 Zero-DOM。垂直滾動到游標使活躍行保持在視野中（`scrollTop`）。

### `Checkbox`

```ts
new Checkbox(opts: CheckboxOptions)

interface CheckboxOptions {
  checked?: boolean;   // 預設 false
  label?: string;      // 繪製在右側；用作可存取名稱
  size?: number;       // 方塊大小 px，預設 20
  font?: string;       // 預設 '16px sans-serif'
  color?: string;      // 標籤顏色，預設 '#e2e8f0'
  accent?: string;     // 勾選填色，預設 '#2563eb'
  border?: string;     // 未勾選邊框，預設 '#475569'
  onChange?: (checked: boolean) => void;
}
```

由真實的 `<input type=\"checkbox\">` 陰影節點支援 — 原生可被 agent/輔助技術切換。Canvas `click` 和陰影節點的原生 `change` 都透過一個防護 setter 路由（值不變時不會重複 `onChange`）。公開：`checked`。A11y：`{ tag: 'input', inputType: 'checkbox', checked, label }`。

### `Toggle`

```ts
new Toggle(opts: ToggleOptions)

interface ToggleOptions {
  checked?: boolean;   // 預設 false
  label?: string;      // 繪製在右側；用作可存取名稱
  width?: number;      // 軌道寬度 px，預設 44（公開為 trackW）
  height?: number;     // 軌道高度 px，預設 24（公開為 trackH）
  font?: string;       // 預設 '16px sans-serif'
  color?: string;      // 標籤顏色，預設 '#e2e8f0'
  accent?: string;     // 開啟狀態軌道填色，預設 '#2563eb'
  track?: string;      // 關閉狀態軌道填色，預設 '#475569'
  onChange?: (checked: boolean) => void;
}
```

iOS 風格開關，投射 `{ role: 'switch', checked, label }` 帶有 `aria-checked`。因為 `role=\"switch\"` 是一個 `div`（沒有 `Scene` 轉發的原生 change），`click` 重新發射一個自身的 `change` 事件；單一的 `change` 處理常式是事實來源，因此外部的 `on('change', …)` 監聽器和 `onChange` 回呼都會觸發。公開：`checked`、`trackW`、`trackH`。

### `Slider`

```ts
new Slider(props?: SliderProps)   // props 在 .d.ts 中是鬆散型別 (any)

// 可識別的 props（在建構函式中讀取）：
{
  min?: number;            // 預設 0
  max?: number;            // 預設 100
  value?: number;          // 預設 = min
  width?: number;          // 預設 200
  height?: number;         // 預設 24
  step?: number;           // 預設 1 — 指標和鍵盤的值粒度
  trackColor?: string;     // 預設 'rgba(255, 255, 255, 0.15)'
  progressColor?: string;  // 預設 '#00f0ff'
  handleColor?: string;    // 預設 '#fff'
}
```

帶有圓形拇指的水平滑桿。公開：`min`、`max`、`value`、`step`。拖曳（`pointerdown` → `pointermove` → `pointerup`）將指標 `localX` 映射到值，**吸附到以 `min` 為錨點的 `step` 網格**（預設為整數步長，匹配 `input[type=range]` 語義），並發射一個帶有 `{ value }` 的 `change` 事件（透過 `on('change', e => e.value)` 訂閱）。鍵盤：`ArrowRight`/`ArrowUp` 步進增加，`ArrowLeft`/`ArrowDown` 步進減少，`Home`/`End` 跳轉到 `min`/`max`。A11y：`{ role: 'slider', value, valuemin, valuemax }`。較舊的 pre-1.0 UI 版本有僅整數值和無鍵盤處理。

### `Dropdown`

```ts
new Dropdown(options: string[], props?: DropdownProps)  // props 鬆散型別 (any)

// 可識別的 props：
{
  value?: string;   // 初始選取；預設 = options[0]
  width?: number;   // 預設 120
  height?: number;  // 預設 36
  bg?: string;      // 按鈕背景，預設 'rgba(30, 41, 59, 0.85)'
  color?: string;   // 預設 '#fff'
  radius?: number;  // 預設 8
  font?: string;    // 預設 '14px sans-serif'
}
```

一個 combobox：一個 `Button` 顯示當前值；點擊（或 `ArrowDown`/`ArrowUp`/`Enter`/`Space`）開啟一個選項 `Button` 的 `Stack` 選單加上一個全螢幕透明背景，兩者都透過 `scene.showOverlay(...)` 掛載。`Escape` 或背景點擊透過 `scene.hideOverlay(...)` 關閉。選取發射一個帶有 `{ value }` 的 `change` 事件。鍵盤導航追蹤高亮索引；`activedescendant` 和選項 id（`${id}-opt-${i}`）為 ARIA 連接。

根上的 A11y：`{ role: 'combobox', expanded, controls, haspopup: 'listbox', value, activedescendant }`。選單投射 `role=\"listbox\"`，每個選項投射 `role=\"option\"` 帶有 `selected`。

---

## 疊加層

### `Modal`

```ts
new Modal(title: string, props?: ModalProps)  // props 鬆散型別 (any)

// 可識別的 props：
{
  width?: number;       // 背景，預設 window.innerWidth（回退 800）
  height?: number;      // 背景，預設 window.innerHeight（回退 600）
  backdropColor?: string; // 預設 'rgba(0, 0, 0, 0.5)'
  modalWidth?: number;  // 中央卡片，預設 400
  modalHeight?: number; // 預設 250
  cardBg?: string;      // 預設 'rgba(15, 23, 42, 0.95)'
  cardBorder?: string;  // 預設 'rgba(255, 255, 255, 0.15)'
}
```

一個全螢幕變暗背景，帶有包含 `title` 文字和內建「關閉」按鈕的居中 `Card`。卡片在掛載時（透過共享的[動畫系統](/reference/core-api/#animation)）以彈簧效果縮放進入；阻擋底層的 `click`/`pointerdown`。使用 `scene.showOverlay(modal)` 顯示。

- `close(): Promise<void>` — 將卡片縮放彈回 0，然後在離場動畫解析後透過 `scene.hideOverlay(this)` 卸載（安全的延遲拆除）。可 await。
- `update(dt, time)` — 執行彈簧的 tick 並在動畫進行時將場景標記為 dirty（由渲染迴圈呼叫）。

### `ScrollView`

```ts
new ScrollView(opts: ScrollViewOptions)

interface ScrollViewOptions { width: number; height: number; }
```

一個裁剪視口（`clipChildren = true`），具有滾輪 + 指標拖曳滾動和彈簧物理（摩擦 `0.85`，彈簧 `0.1`）。子元素位於一個非互動的 `content` Entity 內部，後者被平移；視口範圍保持固定。

- `content: Entity` — 滾動容器（公開）。
- `add(child): this` / `remove(child): this` — 變異 `content` 並呼叫 `updateContentSize()`。
- `updateContentSize(): void` — 從子元素範圍重新計算 `content.width/height`（在直接變異子元素後呼叫）以設定最大滾動範圍。
- `scrollTo(y: number): void` — 滾動到 Y 偏移，其中 **0 為頂部**（內部限制；公開的滾動 API 於 0.1.1 新增）。
- `scrollToBottom(): void` — 跳轉到內容結尾（於 0.1.1 新增）。
- `update(dt, time)` — 將彈簧朝目標偏移積分（由渲染迴圈呼叫）。

滾輪滾動呼叫 `preventDefault()`，除非按住 `Ctrl`（允許瀏覽器縮放）。指標拖曳 1:1 跟隨游標/手指移動內容。滾動目標限制在 `[-maxScroll, 0]`。

```ts
const sv = new ScrollView({ width: 360, height: 480 });
sv.add(longContent);
scene.add(sv.setPosition(20, 20));
sv.scrollToBottom(); // 例如在追加後的聊天記錄
```

---

## 內容 / 豐富文件

### `Markdown`

```ts
new Markdown(markdownText: string, opts?: MarkdownOptions)

interface MarkdownOptions {
  maxWidth?: number;     // 預設 800
  theme?: MarkdownTheme;
  onLinkClick?: (href: string) => void;
  selectable?: boolean;  // 預設 true；傳播到渲染的文字/程式碼/表格儲存格
}

interface MarkdownTheme {        // 全部可選；顯示預設值
  textColor?: string;            // '#e2e8f0'
  headingColor?: string;         // '#f8fafc'
  codeColor?: string;            // '#a5f3fc'
  codeBgColor?: string;          // 'rgba(30, 41, 59, 0.85)'
  quoteBorderColor?: string;     // '#6366f1'
  quoteTextColor?: string;       // '#94a3b8'
  hrColor?: string;              // 'rgba(148, 163, 184, 0.3)'
  tableBgColor?: string;         // 'rgba(15, 15, 25, 0.4)'
  tableHeaderBgColor?: string;   // 'rgba(255, 255, 255, 0.08)'
  bodyFont?: string;             // 'Inter, system-ui, sans-serif'
  codeFont?: string;             // '"JetBrains Mono", "Fira Code", monospace'
  fontSize?: number;             // 16
}
```

使用 **`marked`（v18, GFM）** 將 Markdown 解析為垂直 `Stack`（`content`，間距 16）下的 VMT 子樹。支援的 token：標題（h1–h6，縮放大小）、段落（單字換行的 `RichText`）、圍欄程式碼區塊（帶有關鍵字高亮的 `CodeBlock`）、區塊引用（左側強調條）、有序/無序列表、水平線、內聯程式碼、連結 — 以及 **GFM 表格**（透過 `Table` 元件渲染；GFM 表格支援於 0.1.1 新增）。`content.width`/`height` 為元件設定大小。

兩個內容更新路徑 — **選擇正確的對於串流很重要：**

- `setContent(markdown): this` — **完整重建**：拆除每個子元素並從頭開始重新渲染。用於一次性/替換。
- `appendMarkdown(chunk): this` — **正確的串流/token 路徑**。附加到原始緩衝區，重新詞法分析完整的 Markdown 原始碼，按原始原始碼差異化 token，重用未變更的前綴 entity，並透過 `RichText.setSpans` 原地更新最後一個（增長的）段落。它避免了一次完整的 entity 樹重建，但詞法分析仍隨文件長度擴展。
- `setSelectable(selectable): this` — 更新現有的文字/程式碼/表格後代，並成為未來串流節點的預設。

> 陷阱：請**不要**透過在每個 token 上呼叫 `setContent(fullSoFar)` 來串流。那會為每個 token 重建整個樹（每個 token O(文件)），使佈局成本隨文件增長。僅將新的 delta 提供給 `appendMarkdown(chunk)`。

```ts
const md = new Markdown('', { maxWidth: 600 });
scene.add(md.setPosition(40, 40));
for await (const token of llmStream) md.appendMarkdown(token); // 重用未變更的已渲染前綴
```

### `CodeBlock`

```ts
new CodeBlock(code: string, lang: string, maxWidth: number, theme: Required<MarkdownTheme>, selectable = true)
```

一個用於圍欄程式碼的單一自我渲染葉節點：圓角背景 + 每行、每區段彩色文字（`js`/`ts`/`py`/`rust` 及別名的關鍵字/字串/註解/數字高亮）。用一個平面葉節點取代了舊的每行/每區段子 entity 爆炸。**裝飾性** — `isPointInside()` 總是回傳 `false`。

- `setCode(code, lang?): this` — 重新解析內容（例如即時編輯）。
- `setSelectable(selectable): this` — 切換精確原始碼內容投射。

UI 1.9 在逐字素 Canvas
繪製和語義投射之間共享 Core 1.8 的 `PreparedContentGrid`。製表符、寬 CJK/emoji、阿拉伯語塑形、bidi、
Firefox 字型替換、DPR/縮放和仿射變換因此保持一個
原始碼感知的幾何方案。

注意：`theme` 必須是完全解析的 `Required<MarkdownTheme>`。實際上 `CodeBlock` 由 `Markdown` 內部產生；僅在您提供完整主題時才直接建構它。

### `Table`

```ts
new Table(opts: TableOptions)

interface TableOptions {
  headers: (string | Entity)[];     // 必填；Entity 實例必須唯一
  rows: (string | Entity)[][];      // 必填（2D 行 × 列）
  colWidths?: number[];       // 每列 px；必須匹配 headers.length，否則均勻分佈
  width?: number;             // 總寬度，預設 600
  rowHeight?: number;         // 預設 36
  bg?: string;                // 預設 'rgba(15, 15, 25, 0.4)'
  headerBg?: string;          // 預設 'rgba(255, 255, 255, 0.08)'
  borderColor?: string;       // 預設 'rgba(255, 255, 255, 0.15)'
  headerTextColor?: string;   // 預設 '#ffffff'
  textColor?: string;         // 預設 '#e2e8f0'
  font?: string;              // 預設 '14px sans-serif'
  selectable?: boolean;       // 原生儲存格文字選取，預設 true
}
```

Canvas 原生資料網格：字串儲存格成為 Text 子 entity，Entity 儲存格透過公開的 `setMaxWidth()` 約束，`layout()` 在僅繪製的 `render()` 傳遞之前解析換行、行高和位置。在變更外部儲存格內容後呼叫 `layout()`。每個儲存格擁有一個內容投射。A11y：為輔助技術投射 `{ role: 'grid', label: '包含 N 列和 M 行的資料表格。' }`。也是 `Markdown` 內部 GFM 表格的渲染器。

---

### `RadioGroup`

```ts
new RadioGroup(opts: RadioGroupOptions)

interface RadioGroupOptions {
  options: RadioOption[];
  value?: string;
  direction?: 'horizontal' | 'vertical';
  gap?: number;
  size?: number;
  font?: string;
  color?: string;
  accent?: string;
  border?: string;
  onChange?: (value: string) => void;
}

interface RadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}
```

一個互斥的無線電選項群組，投射 `{ role: 'radiogroup' }`；應用程式仍應驗證標籤和鍵盤/焦點行為。標準化的 `'change'` 事件 payload 攜帶 `{ value }`。

---

### `Tabs`

```ts
new Tabs(opts: TabsOptions)

interface TabsOptions {
  tabs: TabItem[];
  value?: string;
  width: number;
  height: number;
  tabHeight?: number;
  font?: string;
  color?: string;
  selectedColor?: string;
  borderColor?: string;
  onChange?: (value: string) => void;
}

interface TabItem {
  id: string;
  label: string;
  content: Entity;
}
```

一個分頁選取容器。自動掛載活躍分頁的內容視圖並在剩餘空間內平移它。為無障礙投射 `{ role: 'tablist' }`。標準化的 `'change'` 事件 payload 攜帶 `{ value }`。

---

### `ProgressBar`

```ts
new ProgressBar(opts?: ProgressBarOptions)

interface ProgressBarOptions {
  value: number; // 0..1
  width?: number;
  height?: number;
  radius?: number;
  bg?: string;
  accent?: string;
  showText?: boolean;
  font?: string;
  color?: string;
}
```

顯示進度軌道的進度條。提供居中文字選項。為無障礙投射 `{ role: 'progressbar', value }`。

- `setValue(value: number): void` — 使用安全範圍檢查更新值。

---

### `Overlay`

```ts
new Overlay(opts: OverlayOptions)

interface OverlayOptions {
  target: Entity;
  content: Entity;
  placement?: Placement; // 'top' | 'bottom' | 'left' | 'right' | 'top-start' | 等。
  offset?: number;       // 距離（px），預設 8
  autoFlip?: boolean;    // 超出視口邊界時自動調整方向
}
```

浮動定位層引擎。原生不投射無障礙節點。

---

### `Tooltip`

```ts
new Tooltip(opts: TooltipOptions)

interface TooltipOptions {
  target: Entity;
  content: string;
  placement?: Placement;
  delay?: number; // 顯示前的毫秒數，預設 300
}
```

浮動懸停工具提示輔助。在懸停時相對於目標投射工具提示容器。

---

### `Popover`

```ts
new Popover(opts: PopoverOptions)

interface PopoverOptions {
  target: Entity;
  width: number;
  height: number;
  placement?: Placement;
  offset?: number;
}
```

浮動點擊彈出面板。點擊目標顯示彈出視窗，點擊外部自動隱藏。

---

### `ContextMenu`

```ts
new ContextMenu(opts: ContextMenuOptions)

interface ContextMenuOptions {
  items: ContextMenuItem[];
  width?: number;
}

type ContextMenuItem =
  | { label: string; icon?: string; shortcut?: string; disabled?: boolean; onClick?: () => void; children?: ContextMenuItem[] }
  | { separator: true };
```

右鍵觸發的選單元件。支援圖示、快捷鍵、分隔線和遞迴子選單。

- `showAtPoint(x: number, y: number): void` — 在全域畫面位置顯示選單。

---

### `VirtualList`

```ts
new VirtualList(opts: VirtualListOptions)

interface VirtualListOptions {
  width: number;
  height: number;
  itemHeight: number | ((idx: number) => number);
  itemRenderer: (idx: number) => Entity;
}
```

針對高效能渲染最佳化的滾動列表容器。僅實例化/渲染當前在視口範圍內的項目。

---

### `TreeView`

```ts
new TreeView(opts: TreeViewOptions)

interface TreeViewOptions {
  nodes: TreeNode[];
}

interface TreeNode {
  id: string;
  label: string;
  children?: TreeNode[] | (() => Promise<TreeNode[]>);
}
```

一個巢狀樹狀導航器。支援同步子元素陣列或非同步惰性載入函式解析器。

---

### `ResizablePanel`

```ts
new PanelGroup(opts: PanelGroupOptions)
new Panel(opts: PanelOptions)
new PanelResizeHandle()

interface PanelGroupOptions {
  direction: 'horizontal' | 'vertical';
  width: number;
  height: number;
}

interface PanelOptions {
  minSize?: number;
  defaultSize?: number; // 比例
}
```

一個可調整大小的分割面板系統。

---

## 快速索引

| 元件          | 建構函式                        | 陰影節點 / 角色                  |
| ------------- | ------------------------------- | -------------------------------- |
| `Text`        | `(text, opts?)`                 | `div`（name = text）             |
| `RichText`    | `(spans, opts?)`                | `div` + 每連結 `<a>` 熱點        |
| `Button`      | `(label, opts?)`                | `button` role=button             |
| `Link`        | `(label, opts)`                 | `a[href]`                        |
| `Image`       | `(src, opts)`                   | `img[src,alt]`                   |
| `Card`        | `(opts)`                        | 無，或帶有 `label` 的 role=group |
| `Stack`       | `(opts?)`                       | 無（結構性）                     |
| `Flow`        | `(opts?)`                       | 無（結構性）                     |
| `Input`       | `(opts)`                        | 透明 `input`                     |
| `TextArea`    | `(opts)`                        | 透明 `textarea`                  |
| `Checkbox`    | `(opts)`                        | `input[type=checkbox]`           |
| `Toggle`      | `(opts)`                        | role=switch                      |
| `Slider`      | `(props?)`                      | role=slider                      |
| `Dropdown`    | `(options, props?)`             | role=combobox + listbox/option   |
| `RadioGroup`  | `(opts)`                        | role=radiogroup                  |
| `Tabs`        | `(opts)`                        | role=tablist                     |
| `ProgressBar` | `(opts?)`                       | role=progressbar                 |
| `Overlay`     | `(opts)`                        | 無（結構性）                     |
| `Tooltip`     | `(opts)`                        | tooltip                          |
| `Popover`     | `(opts)`                        | popover 面板                     |
| `ContextMenu` | `(opts)`                        | context menu 列表                |
| `VirtualList` | `(opts)`                        | viewport 滾動                    |
| `TreeView`    | `(opts)`                        | tree node 檢視                   |
| `PanelGroup`  | `(opts)`                        | resizable group                  |
| `ScrollView`  | `(opts)`                        | content viewport                 |
| `Modal`       | `(title, props?)`               | 疊加層（背景 + 卡片）            |
| `Markdown`    | `(text, opts?)`                 | 上述的子樹                       |
| `CodeBlock`   | `(code, lang, maxWidth, theme)` | 無（裝飾性）                     |
| `Table`       | `(opts)`                        | role=grid                        |

> `Slider`、`Dropdown` 和 `Modal` 在已發布的 `.d.ts` 中接受鬆散型別 (`any`) 的 props；上面的選項表來自它們的原始碼建構函式，是準確的契約。
