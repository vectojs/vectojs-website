---
title: '@vectojs/ui 元件參考'
description: '所有 @vectojs/ui 元件的完整參考：佈局容器、表單控制項、疊層和豐富內容。'
order: 11
---

# `@vectojs/ui` — 元件參考

> 適用於 VectoJS zero-DOM Canvas 引擎的可重複使用高層級元件。
> 文件版本：**1.10.0**。事實來源：`dist/index.d.ts`（公開表面）和 `packages/ui/src/*`（行為）。

每個元件都是 Virtual Math Tree (VMT) 中的葉節點或容器。這裡沒有任何東西是真實的 DOM — 元件會透過 `IRenderer` 將自己繪製到 Canvas 上。無障礙、agent 自動化和可爬取性來自一個平行的 **A11y Shadow DOM**：當元件為 `interactive` 時，`Scene` 會投射一個單一隱藏、透明的真實 DOM 節點，定位在元件的方塊上方，根據 `getA11yAttributes()` 構建。這就是為什麼 `page.getByRole('button', { name })` / `fill()` / 螢幕閱讀器可以在純 Canvas UI 上運作的原因。

純文字應用程式可以從 `@vectojs/ui/text` 匯入 `Text`。這個輕量級入口點排除 Markdown 和 MathJax 以減少啟動圖；在組合多個元件系列時使用根 `@vectojs/ui` 入口點。

## 即時元件展示

下方的展示現在是套件層級的冒煙測試。對於日常除錯，請使用專門的元件頁面，以便在不滾動瀏覽每個元件的情況下檢查特定行為：

| 區域          | 元件頁面                                                                                                                                                                                                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 文字與媒體    | [`Text`](/reference/ui-text/), [`RichText`](/reference/ui-richtext/), [`Link`](/reference/ui-link/), [`Image`](/reference/ui-image/)                                                                                                                                                                                                                                                 |
| 佈局容器      | [`Card`](/reference/ui-card/), [`Stack`](/reference/ui-stack/), [`Flow`](/reference/ui-flow/), [`ScrollView`](/reference/ui-scrollview/), [`VirtualList`](/reference/ui-virtuallist/), [`TreeView`](/reference/ui-treeview/), [`Resizable panels`](/reference/ui-resizable-panel/)                                                                                                   |
| 控制項與表單  | [`Button`](/reference/ui-button/), [`Input`](/reference/ui-input/), [`TextArea`](/reference/ui-textarea/), [`Checkbox`](/reference/ui-checkbox/), [`Toggle`](/reference/ui-toggle/), [`Slider`](/reference/ui-slider/), [`Dropdown`](/reference/ui-dropdown/), [`RadioGroup`](/reference/ui-radiogroup/), [`Tabs`](/reference/ui-tabs/), [`ProgressBar`](/reference/ui-progressbar/) |
| 豐富內容      | [`Markdown`](/reference/ui-markdown/), [`CodeBlock`](/reference/ui-codeblock/), [`Table`](/reference/ui-table/)                                                                                                                                                                                                                                                                      |
| 疊層與暫態 UI | [`Overlay`](/reference/ui-overlay/), [`Tooltip`](/reference/ui-tooltip/), [`Popover`](/reference/ui-popover/), [`ContextMenu`](/reference/ui-contextmenu/), [`Modal`](/reference/ui-modal/)                                                                                                                                                                                          |

<figure class="sandbox component-gallery">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · @vectojs/ui 1.10.0 · 內部可捲動</span></div>
  <iframe src="/sandbox/ui-components.html" class="sandbox-frame component-gallery-frame" loading="eager" title="所有 VectoJS UI 元件的互動式展示" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>套件層級冒煙展示：先進行廣泛覆蓋，在除錯特定行為時使用專門的元件頁面。</figcaption>
</figure>

## 所有元件共用的慣例

所有元件都繼承自 `UIComponent`，後者繼承自核心 `Entity`。以下繼承成員被頻繁使用，不會在每個元件下方重複。

| 成員                | 簽章                                               | 說明                                                                                                                                          |
| ------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `setPosition`       | `setPosition(x, y): this`                          | 局部空間放置；可鏈式呼叫。                                                                                                                    |
| `add` / `remove`    | `add(child: Entity): this` / `remove(child): this` | 子節點管理（容器會覆寫 `add` 以重新佈局）。                                                                                                   |
| `on` / `off`        | `on(event, cb, { capture? }): this`                | DOM 風格的捕獲+冒泡。事件：`click hover pointerdown pointerup pointercancel pointermove pointerleave change focus blur wheel keydown keyup`。 |
| `emit`              | `emit(event, payload): void`                       | 直接自身分派（無樹傳播）。                                                                                                                    |
| `getGlobalPosition` | `getGlobalPosition(): Point`                       | 累積祖先變換後的世界空間位置。                                                                                                                |
| `scene`             | `get scene`                                        | 最近的附加 `Scene`；使用 `this.scene?.markDirty()` 在 `onDemand` 場景中請求重新繪製。                                                         |
| `interactive`       | `interactive: boolean`                             | 當為 true 時，元件會投射一個 A11y 陰影節點並接收指標/鍵盤事件。                                                                               |
| `clipChildren`      | `clipChildren: boolean`                            | 將一般子繪圖裁剪到局部方塊。Canvas/SVG 是精確的；Three 對旋轉/傾斜裁剪使用 AABB 剪刀。GPU 點/WebGPU 疊層路徑不參與。由 `ScrollView` 使用。    |
| `width` / `height`  | `number`                                           | 元件的方塊；驅動點擊測試和視口剔除。                                                                                                          |
| `padding`           | `number`                                           | 內部邊距（預設 `0`）；方塊型元件預設值較高。                                                                                                  |
| 變換                | `x y scaleX scaleY rotation opacity`               | 仿射變換和乘法性不透明度由子節點繼承。                                                                                                        |
| `animate`           | `animate(targetProps, durationMs): this`           | 將數值 tween 加入佇列。                                                                                                                       |

---

## `UIComponent`（抽象基底）

```ts
abstract class UIComponent extends Entity {
  padding: number; // 預設 0
  isPointInside(globalX: number, globalY: number): boolean;
  getBounds(): Bounds; // { x:0, y:0, width, height }

  // 進場/出場顯示輔助
  protected enterMotion?: MotionSpec; // 掛載時播放
  protected exitMotion?: MotionSpec; // 由 dismiss() 播放
  dismiss(): Promise<void>; // 播放 exitMotion，然後從樹中移除
}
```

集中了每個元件共享的方塊模型 + 軸對齊（AABB）點擊測試。`isPointInside` 返回點是否在局部空間的 `[0,width] × [0,height]` 內。`getBounds()` 返回局部方塊，以便 `Scene` 可以進行視口剔除。子類別從量測的內容設定 `width`/`height`，實作 `render(r)`，並在互動時覆寫 `getA11yAttributes()`。

**顯示：** 將 `enterMotion` / `exitMotion` 宣告為 `MotionSpec`（`{ props: { opacity: [0, 1], … }, config? }`），元件在掛載到即時場景時會動畫進入，並在 `dismiss()` 時動畫退出 — 後者會延遲其自身移除直到退出動畫解析。一個共享的實作基於[核心動畫系統](/reference/core-api/#animation)，取代每個元件手寫的彈簧。在 `prefers-reduced-motion` 下會抑制動畫（保留透明度淡入淡出效果）。

### `getA11yAttributes(): A11yAttributes`

每個互動元件覆寫的鉤子。返回的形狀（來自 `@vectojs/core`）驅動投射的陰影節點：

```ts
interface A11yAttributes {
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea'; // 預設 'div'
  role?: string; // ARIA 角色
  label?: string; // aria-label / 可存取名稱
  href?: string; // tag 'a'
  src?: string;
  alt?: string; // tag 'img'
  inputType?: string;
  placeholder?: string;
  value?: string; // tag 'input'
  checked?: boolean; // input.checked 或 aria-checked，每影格重新整理
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
  maxWidth?: number;              // 換行寬度；省略 → 僅顯式 '\\n' 換行
  lineHeight?: number;            // 行高 px，預設 20
  preserveLeadingSpaces?: boolean;// 預設 false
  selectable?: boolean;           // 瀏覽器原生拖曳選取，預設 true
}
```

使用原生 `fillText` 繪製的多行文字。換行/量測通過核心 `LayoutEngine`（與 `TextEntity` 相同的 `Intl.Segmenter` 路徑）進行，具有**冷/熱分割**：

- `setText(text): this` — 冷傳遞（重新分段 + 重新量測），然後重新佈局。
- `append(text): this` — 串流/打字機路徑；等於 `setText(this.text + text)`，但引擎的段落記憶體重用未觸及的前導段落，因此只有變更的最後一個段落被重新量測。
- `setMaxWidth(maxWidth): this` — **熱**路徑；僅重新包裝快取的量測文字（不重新分段）。對於響應式重排，優先使用此方法。
- `setSelectable(selectable): this` — 啟用或停用投射的原生選取表面。

內容投射鏡像視覺換行和行高，以支援瀏覽器尋找、選取和複製。靜態 Text 不是互動式點擊目標；Canvas/VMT 仍然擁有其像素和佈局。

### `RichText`

```ts
new RichText(spans: StyledSpan[], opts?: RichTextOptions)

interface RichTextOptions {
  font?: string;                          // 基本簡寫，預設 '16px sans-serif'
  color?: string;                         // 預設填充色，預設 '#e2e8f0'
  maxWidth?: number;                      // 換行寬度
  baseStyle?: TextStyle;                  // 每個 text run 繼承（run 樣式仍優先）
  linkColor?: string;                     // 沒有自己顏色的連結 run 預設 '#38bdf8'
  onLinkClick?: (href: string) => void;   // 連結 run 被啟動時觸發
  exclusions?: ExclusionRect[];           // 文字繞排的矩形（排除形狀 / 浮動）
  selectable?: boolean;                   // 瀏覽器原生拖曳選取，預設 true
}
```

多樣式內聯文字：粗體/斜體/彩色/不同大小的 text run 在共享基線上流動和換行。佈局使用核心 `LayoutEngine.prepareRich`；每個字形使用其 run 的顏色/粗細/斜體繪製。

- `setSpans(spans): this` — 取代 run 並重新佈局。
- `appendSpans(spans): this` — **串流**路徑；豐富段落記憶體重用未觸及的前導段落，因此 token 串流以 O(變更的段落) 而非 O(整個文件) 重新準備。
- `setMaxWidth(maxWidth): this` — 重排。
- `setExclusions(exclusions): this` — 設定浮動區域並重排。
- `setSelectable(selectable): this` — 在不重建 spans 的情況下切換原生選取。

無障礙：每個連續的**連結 run** 會獲得一個透明的 `<a>` 熱點子節點（在重新換行時協調 — 每個 run 一個熱點；位置原地更新，只有連結_數量_變更時才會重建陰影節點）。元件自身的可存取名稱是完整串聯的文字。

### `measureText`, `wrapLines`, `wrapText`（自由函式）

```ts
measureText(text: string, font: string): number
```

以 CSS `font` 渲染的像素寬度，透過有界 LRU（上限 1000）記憶化。阿拉伯文在量測前會先塑形。在無 DOM 的情況下回退到每個字元 `0.5em` 的估計值。

```ts
wrapLines(text: string, font: string, maxWidth: number): string[]
```

貪婪單字換行，尊重顯式的 `\\n`。過長的單字會獲得自己的行（不拆分）。

```ts
wrapText(value: string, maxWidth: number, measure: (s: string) => number): WrappedLine[]

interface WrappedLine { text: string; start: number; end: number; }  // 絕對字元範圍
```

類似 `wrapLines`，但追蹤每行的絕對字元範圍（因此線性游標偏移可對應到 `(line, x)`），處理硬換行 `\\n`（尾隨換行會產生一個游標可以停留的空行），並在字元層級拆分過長的單字。由 `TextArea` 內部使用。

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
  maxWidth?: number;                       // 主軸換行臨界值（水平）；預設 Infinity
  maxHeight?: number;                      // 主軸換行臨界值（垂直）；預設 Infinity
}
```

沿主軸順序放置子節點，間距為 `gap`，在交叉軸上對齊。子節點保留自己的大小 — 僅設定 `x`/`y`。自身不繪製任何內容。

- `add(child): this` — 追加子節點並**立即重新執行 `layout()`**。
- `layout(): void` — 定位所有子節點並調整容器大小以適應（以便可以被剔除）。在 `add` 外部變更子節點後（例如調整子節點大小）手動呼叫。

當 `wrap` 為 true 時，沿主軸超出 `maxWidth`/`maxHeight` 的子節點會開始新的一行；容器在交叉軸上增長。

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

預設為 `{ direction: 'horizontal', wrap: true }` 的 `Stack` — 水平項目在超過 `maxWidth` 時換到下一行。用於標籤雲、芯片行。繼承 `add()`/`layout()`。

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
  padding?: number;       // 預設 0（使用者手動定位子節點）
  label?: string;         // 設定時 → interactive + role=\"group\" 地標
}
```

一個可選邊框的圓角背景面板。透過 `add()` 加入子節點；它們會在 Card 的局部空間中渲染在上層。**預設為裝飾性**（無陰影節點，非互動式）。傳遞 `label` 會使其變為互動式並投射 `{ role: 'group', label }`，以便輔助技術/agent 可以找到該區域。`padding` 僅供資訊參考 — 它不會自動內縮子節點。

---

## 控制項與表單

以下所有表單控制項都是 `interactive` 的，並投射一個真實的陰影節點；canvas 是受陰影節點原生事件驅動的視覺鏡像。

### `Button`

```ts
new Button(label: string, opts?: ButtonOptions)

interface ButtonOptions {
  onClick?: (e: unknown) => void;  // 對 canvas 點擊測試和陰影 <button> 點擊都觸發
  bg?: string;                     // 預設 '#2563eb'
  hoverBg?: string;                // 預設 '#3b82f6'
  color?: string;                  // 標籤顏色，預設 '#ffffff'
  font?: string;                   // 預設 '600 16px sans-serif'
  padding?: number;                // 預設 12
  radius?: number;                 // 預設 8
}
```

帶有居中標籤的圓角矩形。`width` 自動調整為 `measureText(label, font) + 2·padding`；`height` 調整為 `fontSizePx(font) + 2·padding`（從 `font` 解析的 px 大小，而非量測的標籤寬度）。投射 `{ tag: 'button', role: 'button', label }` → 由 `getByRole('button', { name })` 驅動。公開狀態：`focused`（繪製 `#00f0ff` 焦點環）、內部 `hovered`（切換到 `hoverBg`）。

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

彩色（可選底線）文字。自動調整大小以適應標籤。投射一個真實的 `{ tag: 'a', href, label }` 陰影節點（原生可點擊/可爬取）。Canvas 點擊測試路徑透過 `window.open(href, '_blank', 'noopener')` 開啟。

### `Image`

```ts
new Image(src: string, opts: ImageOptions)

interface ImageOptions {
  width: number;          // 必填（canvas 需要已知方塊進行佈局/剔除）
  height: number;         // 必填
  alt?: string;           // 預設 ''
  placeholder?: string;   // 載入前的填充色，預設 '#1e293b'
  radius?: number;        // 佔位符圓角半徑，預設 0
  onLoad?: () => void;    // 點陣圖載入完成時觸發
}
```

透過 `drawImage` 繪製；投射 `{ tag: 'img', src, alt, label: alt }`。載入是非同步的 — 在準備好之前會繪製一個佔位方塊。在 `onDemand` 場景中，傳遞 `onLoad: () => scene.markDirty()` 以在載入時重新繪製。（遮蔽了 `globalThis.Image`；將類別引用為 `import { Image } from '@vectojs/ui'`。）

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

由一個**真實、透明的 `<input>` 陰影節點**支援的單行欄位。瀏覽器原生處理所有輸入 — 點擊、鍵盤、**IME 組字**、選取、剪貼簿、復原 — 在該元素上；canvas 僅負責繪製。`Scene` 透過 `change` 事件（其 payload 包含 `value`、`selectionStart`、`selectionEnd` 和 `composition`）將狀態鏡像回來。元件將這些重新公開為公開欄位：

- `value: string`、`focused: boolean`（驅動 500ms 游標閃爍）。
- `selectionStart` / `selectionEnd: number` — 從真實輸入鏡像回來的游標/選取偏移。
- `composition: { start; length } | null` — 活躍的 IME 預編輯範圍（繪製為底線）。

無障礙：`{ tag: 'input', inputType: 'text', placeholder, value, label: placeholder }`。Agent 透過角色 `fill()` 它；人類輸入 CJK；canvas 渲染游標、選取高亮、IME 底線和捲動到游標（`scrollLeft`）。透過佈局引擎處理 RTL（希伯來文/阿拉伯文）範圍。

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

由一個**真實、透明的 `<textarea>` 陰影節點**支援的多行欄位 — 與 `Input` 相同的鏡像模型，加上多行導航。Canvas 透過 `wrapText` 重新換行值，並繪製文字、選取和游標。公開欄位鏡像 `Input`：`value`、`focused`、`selectionStart`、`selectionEnd`、`composition`。`lineHeightFactor` 保存 `lineHeight` 選項。

- `lineOfOffset(offset: number): number` — 包含線性字元偏移的視覺（已換行）行索引；邊界偏移解析為最早包含該偏移的行，超出範圍則限制到最後一行。用於將游標位置對應到行。

無障礙：投射一個 `textarea` 陰影節點；agent 透過 `fill()` 輸入，人類輸入 CJK，渲染保持 Zero-DOM。垂直捲動到游標使活躍行保持在視野內（`scrollTop`）。

### `Checkbox`

```ts
new Checkbox(opts: CheckboxOptions)

interface CheckboxOptions {
  checked?: boolean;   // 預設 false
  label?: string;      // 繪製在右側；用作可存取名稱
  size?: number;       // 方塊大小 px，預設 20
  font?: string;       // 預設 '16px sans-serif'
  color?: string;      // 標籤顏色，預設 '#e2e8f0'
  accent?: string;     // 勾選填充色，預設 '#2563eb'
  border?: string;     // 未勾選邊框色，預設 '#475569'
  onChange?: (checked: boolean) => void;
}
```

由一個真實的 `<input type="checkbox">` 陰影節點支援 — 可由 agent/輔助技術原生切換。Canvas 的 `click` 和陰影節點的原生 `change` 都會經過一個防護 setter（值未變更時不會重複觸發 `onChange`）。公開：`checked`。無障礙：`{ tag: 'input', inputType: 'checkbox', checked, label }`。

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
  accent?: string;     // 開啟狀態軌道填充色，預設 '#2563eb'
  track?: string;      // 關閉狀態軌道填充色，預設 '#475569'
  onChange?: (checked: boolean) => void;
}
```

iOS 風格的開關，投射 `{ role: 'switch', checked, label }` 搭配 `aria-checked`。由於 `role="switch"` 是一個 `div`（`Scene` 不會轉發原生 change），`click` 會重新觸發自身的 `change` 事件；單一的 `change` 處理常式是事實來源，因此外部的 `on('change', …)` 監聽器和 `onChange` 回呼都會觸發。公開：`checked`、`trackW`、`trackH`。

### `Slider`

```ts
new Slider(props?: SliderProps)   // props 在 .d.ts 中為鬆散型別 (any)

// 可識別的 props（在建構函式中讀取）：
{
  min?: number;            // 預設 0
  max?: number;            // 預設 100
  value?: number;          // 預設 = min
  width?: number;          // 預設 200
  height?: number;         // 預設 24
  step?: number;           // 預設 1 — 指標和鍵盤的數值粒度
  trackColor?: string;     // 預設 'rgba(255, 255, 255, 0.15)'
  progressColor?: string;  // 預設 '#00f0ff'
  handleColor?: string;    // 預設 '#fff'
}
```

帶有圓形拇指的水平滑桿。公開：`min`、`max`、`value`、`step`。拖曳（`pointerdown` → `pointermove` → `pointerup`）將指標 `localX` 對應到數值，**對齊到以 `min` 為錨點的 `step` 網格**（預設為整數步進，匹配 `input[type=range]` 語意），並觸發一個帶有 `{ value }` 的 `change` 事件（透過 `on('change', e => e.value)` 訂閱）。鍵盤：`ArrowRight`/`ArrowUp` 步進增加，`ArrowLeft`/`ArrowDown` 步進減少，`Home`/`End` 跳到 `min`/`max`。無障礙：`{ role: 'slider', value, valuemin, valuemax }`。較舊的 pre-1.0 UI 版本僅有整數值且無鍵盤處理。

### `Dropdown`

```ts
new Dropdown(options: string[], props?: DropdownProps)  // props 為鬆散型別 (any)

// 可識別的 props：
{
  value?: string;   // 初始選取；預設 = options[0]
  width?: number;   // 預設 120
  height?: number;  // 預設 36
  bg?: string;      // 按鈕背景色，預設 'rgba(30, 41, 59, 0.85)'
  color?: string;   // 預設 '#fff'
  radius?: number;  // 預設 8
  font?: string;    // 預設 '14px sans-serif'
}
```

一個組合框：一個 `Button` 顯示當前值；點擊（或 `ArrowDown`/`ArrowUp`/`Enter`/`Space`）開啟一個包含選項 `Button` 的 `Stack` 選單，加上一個全螢幕透明背景，兩者都透過 `scene.showOverlay(...)` 掛載。`Escape` 或背景點擊透過 `scene.hideOverlay(...)` 關閉。選取會觸發帶有 `{ value }` 的 `change` 事件。鍵盤導航追蹤一個高亮索引；`activedescendant` 和選項 id（`${id}-opt-${i}`）已連接供 ARIA 使用。

根節點的無障礙：`{ role: 'combobox', expanded, controls, haspopup: 'listbox', value, activedescendant }`。選單投射 `role="listbox"`，每個選項投射 `role="option"` 搭配 `selected`。

---

## 疊層

### `Modal`

```ts
new Modal(title: string, props?: ModalProps)  // props 為鬆散型別 (any)

// 可識別的 props：
{
  width?: number;       // 背景，預設 window.innerWidth（後備 800）
  height?: number;      // 背景，預設 window.innerHeight（後備 600）
  backdropColor?: string; // 預設 'rgba(0, 0, 0, 0.5)'
  modalWidth?: number;  // 中央卡片，預設 400
  modalHeight?: number; // 預設 250
  cardBg?: string;      // 預設 'rgba(15, 23, 42, 0.95)'
  cardBorder?: string;  // 預設 'rgba(255, 255, 255, 0.15)'
}
```

一個全螢幕暗化背景，帶有包含 `title` 文字和內建「關閉」按鈕的居中 `Card`。卡片在掛載時透過共享的[動畫系統](/reference/core-api/#animation)以彈簧動畫縮放進入；阻擋底層 `click`/`pointerdown`。使用 `scene.showOverlay(modal)` 顯示。

- `close(): Promise<void>` — 將卡片縮放回 0，然後在退出動畫解析後透過 `scene.hideOverlay(this)` 卸載（安全的延遲拆卸）。可等待。
- `update(dt, time)` — 在動畫進行中推進彈簧並將場景標記為髒（由渲染迴圈呼叫）。

### `ScrollView`

```ts
new ScrollView(opts: ScrollViewOptions)

interface ScrollViewOptions { width: number; height: number; }
```

一個裁剪視口（`clipChildren = true`），支援滾輪 + 指標拖曳捲動和彈簧物理（摩擦力 `0.85`、彈簧 `0.1`）。子節點存在於一個非互動的 `content` Entity 內部，該 Entity 會被平移；視口方塊保持固定。

- `content: Entity` — 可捲動的容器（公開）。
- `add(child): this` / `remove(child): this` — 修改 `content` 並呼叫 `updateContentSize()`。
- `updateContentSize(): void` — 從子節點範圍重新計算 `content.width/height`（在直接修改子節點後呼叫）以設定最大捲動範圍。
- `scrollTo(y: number): void` — 捲動到 Y 偏移量，其中 **0 為頂部**（內部會限制；公開的 scroll API 於 0.1.1 加入）。
- `scrollToBottom(): void` — 跳到內容結尾（於 0.1.1 加入）。
- `update(dt, time)` — 將彈簧朝目標偏移量推進（由渲染迴圈呼叫）。

滾輪捲動會呼叫 `preventDefault()`，除非按住 `Ctrl`（允許瀏覽器縮放）。指標拖曳以 1:1 比例移動內容與游標/手指。捲動目標限制在 `[-maxScroll, 0]` 範圍內。

```ts
const sv = new ScrollView({ width: 360, height: 480 });
sv.add(longContent);
scene.add(sv.setPosition(20, 20));
sv.scrollToBottom(); // 例如追加內容後的聊天記錄
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

使用 **`marked`（v18, GFM）** 將 Markdown 解析為垂直 `Stack`（`content`，間距 16）下的 VMT 子樹。支援的 token：標題（h1–h6，縮放尺寸）、段落（自動換行的 `RichText`）、圍欄程式碼區塊（帶有關鍵字高亮的 `CodeBlock`）、區塊引用（左側強調色條）、有序/無序列表、水平線、內聯程式碼、連結 — 以及 **GFM 表格**（透過 `Table` 元件渲染；GFM 表格支援於 0.1.1 加入）。`content.width`/`height` 設定元件大小。

兩個內容更新路徑 — **選擇正確的路徑對於串流來說很重要：**

- `setContent(markdown): this` — **完全重建**：拆除每個子節點並從頭重新渲染。用於一次性/替換。
- `appendMarkdown(chunk): this` — **正確的串流/token 路徑**。追加到原始緩衝區，重新詞法分析完整的 Markdown 來源，按原始來源 diff token，重用未變更的前綴 Entity，並透過 `RichText.setSpans` 原地更新最後一個（增長的）段落。它避免了完整的 Entity 樹重建，但詞法分析仍隨文件長度而擴展。
- `setSelectable(selectable): this` — 更新現有的文字/程式碼/表格後代，並成為未來串流節點的預設值。

> 陷阱：請勿透過在每個 token 上呼叫 `setContent(fullSoFar)` 來進行串流。這會在每個 token 時重建整個樹（每個 token O(document)），使佈局成本隨文件增長。只將新的 delta 提供給 `appendMarkdown(chunk)`。

```ts
const md = new Markdown('', { maxWidth: 600 });
scene.add(md.setPosition(40, 40));
for await (const token of llmStream) md.appendMarkdown(token); // 重用未變更的已渲染前綴
```

### `CodeBlock`

```ts
new CodeBlock(code: string, lang: string, maxWidth: number, theme: Required<MarkdownTheme>, selectable = true)
```

一個單一自我渲染的葉節點，用於圍欄程式碼：圓角背景 + 每行、每段的彩色文字（支援 `js`/`ts`/`py`/`rust` 及其別名的關鍵字/字串/註解/數字高亮）。取代了舊的每行/每段子節點爆炸爲一個平坦的葉節點。**裝飾性** — `isPointInside()` 始終返回 `false`。

- `setCode(code, lang?): this` — 重新解析內容（例如即時編輯）。
- `setSelectable(selectable): this` — 切換精確來源內容投射。

UI 1.9 在逐字素 Canvas 繪製和語意投射之間共享 Core 1.8 的 `PreparedContentGrid`。標籤、寬 CJK/表情符號、阿拉伯文塑形、bidi、Firefox 字型替換、DPR/縮放和仿射變換因此保留了一個源感知幾何計劃。

注意：`theme` 必須是完全解析的 `Required<MarkdownTheme>`。實際上，`CodeBlock` 由 `Markdown` 內部產生；僅在您提供完整主題時才直接建構。

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

Canvas 原生資料網格：字串儲存格成為 Text 子 Entity，Entity 儲存格透過公開的 `setMaxWidth()` 進行約束，而 `layout()` 在僅繪製的 `render()` 傳遞之前解析換行、行高和位置。在變更外部儲存格內容後呼叫 `layout()`。每個儲存格擁有一個內容投射。無障礙：為輔助技術投射 `{ role: 'grid', label: '具有 N 列和 M 行的資料表格。' }`。同時也是 `Markdown` 中 GFM 表格的渲染器。

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

一個互斥的選項按鈕群組，投射 `{ role: 'radiogroup' }`；應用程式仍應驗證標籤和鍵盤/焦點行為。標準化的 `'change'` 事件 payload 攜帶 `{ value }`。

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
  closable?: boolean; // 顯示關閉按鈕；點擊路由到 onClose
  tabWidth?: number; // 首選像素寬度；溢出時分頁列滾動（預設 160）
  minTabWidth?: number; // 觸發滾動的最小寬度（預設 96）
  autoHideTabBar?: boolean; // 少於 2 個分頁時隱藏分頁列（預設 false；1.10.0）
  onChange?: (value: string) => void;
  onClose?: (value: string) => void;
}

interface TabItem {
  id: string;
  label: string;
  content: Entity;
}
```

一個標籤頁選取容器。自動掛載活躍標籤的內容檢視，並在剩餘空間內平移它。為無障礙投射 `{ role: 'tablist' }`。標準化的 `'change'` 事件 payload 攜帶 `{ value }`。

Tabs 保持固定的首選 `tabWidth`，分頁列在溢出時水平滾動（滾輪，或自動滾動以使作用中分頁可見），而不是縮成碎片——從 1.9.4 開始，`tabWidth` 是分頁列滾動的目標寬度，不是拉伸填滿的寬度（之前這會導致寬條上的關閉命中定位錯誤）。啟用 `autoHideTabBar`（1.10.0）後，當分頁少於兩個時，分頁列及其點擊區域消失，內容佔據全部高度（Vim `showtabline=1` 語意）；`effectiveTabBarHeight` 獲取器報告分頁列的當前高度（隱藏時為 `0`），並且內容幾何資訊每影格重新同步，因此重新指派 `tabs` 不會留下陳舊或偏移的內容。

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

顯示進度軌跡的進度條。可選居中文字選項。為無障礙投射 `{ role: 'progressbar', value }`。

- `setValue(value: number): void` — 更新數值，附帶安全邊界檢查。

---

### `Overlay`

```ts
new Overlay(opts: OverlayOptions)

interface OverlayOptions {
  target: Entity;
  content: Entity;
  placement?: Placement; // 'top' | 'bottom' | 'left' | 'right' | 'top-start' | 等
  offset?: number;       // 距離 px，預設 8
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

浮動點擊彈出面板。點擊目標顯示彈出面板，點擊外部自動隱藏。

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

- `showAtPoint(x: number, y: number): void` — 在全局螢幕位置顯示選單。

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

針對高效能渲染最佳化的可捲動列表容器。僅實例化/渲染目前在視口範圍內的項目。

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

一個巢狀樹狀導航器。支援同步子節點陣列或非同步延遲載入函式解析器。

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

一個可調整大小的分割窗格系統。

---

## 快速索引

| 元件          | 建構函式                        | 陰影節點 / 角色                |
| ------------- | ------------------------------- | ------------------------------ |
| `Text`        | `(text, opts?)`                 | `div`（name = text）           |
| `RichText`    | `(spans, opts?)`                | `div` + 每個連結的 `<a>` 熱點  |
| `Button`      | `(label, opts?)`                | `button` role=button           |
| `Link`        | `(label, opts)`                 | `a[href]`                      |
| `Image`       | `(src, opts)`                   | `img[src,alt]`                 |
| `Card`        | `(opts)`                        | 無，或 role=group 搭配 `label` |
| `Stack`       | `(opts?)`                       | 無（結構性）                   |
| `Flow`        | `(opts?)`                       | 無（結構性）                   |
| `Input`       | `(opts)`                        | 透明的 `input`                 |
| `TextArea`    | `(opts)`                        | 透明的 `textarea`              |
| `Checkbox`    | `(opts)`                        | `input[type=checkbox]`         |
| `Toggle`      | `(opts)`                        | role=switch                    |
| `Slider`      | `(props?)`                      | role=slider                    |
| `Dropdown`    | `(options, props?)`             | role=combobox + listbox/option |
| `RadioGroup`  | `(opts)`                        | role=radiogroup                |
| `Tabs`        | `(opts)`                        | role=tablist                   |
| `ProgressBar` | `(opts?)`                       | role=progressbar               |
| `Overlay`     | `(opts)`                        | 無（結構性）                   |
| `Tooltip`     | `(opts)`                        | tooltip                        |
| `Popover`     | `(opts)`                        | popover 面板                   |
| `ContextMenu` | `(opts)`                        | context menu 列表              |
| `VirtualList` | `(opts)`                        | viewport 捲動                  |
| `TreeView`    | `(opts)`                        | 樹狀節點檢視                   |
| `PanelGroup`  | `(opts)`                        | 可調整大小的群組               |
| `ScrollView`  | `(opts)`                        | 內容視口                       |
| `Modal`       | `(title, props?)`               | 疊層（背景 + 卡片）            |
| `Markdown`    | `(text, opts?)`                 | 上述元件的子樹                 |
| `CodeBlock`   | `(code, lang, maxWidth, theme)` | 無（裝飾性）                   |
| `Table`       | `(opts)`                        | role=grid                      |

> `Slider`、`Dropdown` 和 `Modal` 在已發布的 `.d.ts` 中接受鬆散型別（`any`）的 props；上述的選項表格來自它們的原始碼建構函式，是準確的合約。
