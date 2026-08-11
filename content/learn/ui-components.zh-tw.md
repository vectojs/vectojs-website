+++
title = "UI 元件"
description = "@vectojs/ui 元件庫概覽：表單、布局容器、覆蓋層和豐富內容。"
weight = 16

[extra]
order = 16
+++

# UI 元件

`@vectojs/ui` 套件提供了一組基於 `@vectojs/core` 構建、可直接用於生產環境的元件。每個元件完全在畫布上渲染；無障礙功能來自自動的無障礙陰影 DOM 層。

## 所有元件都繼承 `UIComponent`

<figure>
  <img src="/images/entity-hierarchy.svg" alt="Entity 類別層級結構，顯示所有內建 UI 元件" class="diagram" />
  <figcaption>每個元件都繼承了 Entity 的位置、縮放、旋轉、animate() 和完整的事件系統。</figcaption>
</figure>

`UIComponent` 繼承 `Entity`，並新增了一個帶有 AABB 命中測試的共享盒模型。所有繼承的屬性（`x`、`y`、`width`、`height`、`opacity`、`interactive`、`animate`、`on`/`off`）都適用於每個元件。

> **關於 `interactive` 的注意事項：** 大多數表單元件（`Button`、`Input`、`Text` 等）在其建構函式中設定 `this.interactive = true`。`Card` 預設為裝飾性——僅當你傳遞 `label` 選項時它才會變得可互動。

## 布局容器

### `Stack`

類似 flexbox 的容器——沿主軸依序排列子元素：

```typescript
import { Stack } from '@vectojs/ui';
import { Button, Text } from '@vectojs/ui';

const col = new Stack({ direction: 'vertical', gap: 12 });
col.add(new Text('Hello'));
col.add(new Button('點擊我'));
scene.add(col.setPosition(40, 40));
```

支援 `direction`、`gap`、`align`（交叉軸）和可選的 `wrap` 搭配 `maxWidth`/`maxHeight`。

### `Flow`

一個預先配置為 `{ direction: 'horizontal', wrap: true }` 的 `Stack`——用於晶片行和標籤雲：

```typescript
import { Flow } from '@vectojs/ui';

const tags = new Flow({ gap: 8, maxWidth: 400 });
for (const label of ['TypeScript', 'WebGPU', 'Canvas']) {
  tags.add(new Button(label, { bg: '#1e293b', padding: 6 }));
}
scene.add(tags.setPosition(20, 20));
```

### `Card`

一個圓角背景面板——在上方加入子元素：

```typescript
import { Card } from '@vectojs/ui';

const card = new Card({
  width: 300,
  height: 200,
  bg: 'rgba(15, 23, 42, 0.8)',
  border: 'rgba(255, 255, 255, 0.1)',
  radius: 16,
  label: '設定面板', // 使其可互動 + role="group"
});
card.add(toggle.setPosition(24, 24));
scene.add(card.setPosition(100, 100));
```

### `ResizablePanel`

一個分割面板布局系統，允許巢狀的可調整大小分割（水平和垂直）：

```typescript
import { PanelGroup, Panel, PanelResizeHandle } from '@vectojs/ui';

const group = new PanelGroup({ direction: 'horizontal', width: 600, height: 400 });
const leftPanel = new Panel({ minSize: 100, defaultSize: 0.3 });
const rightPanel = new Panel({ minSize: 150 });

group.addPanel(leftPanel);
group.addPanel(rightPanel);
scene.add(group);
```

## 表單控制項

所有表單控制項都投射一個真實、透明的陰影 DOM 節點。代理和螢幕閱讀器透過這些原生元素互動；畫布渲染視覺效果。所有表單控制項都有標準化的 `change` 事件綁定和 `onChange` 回呼執行。

### `Button`

```typescript
import { Button } from '@vectojs/ui';

const btn = new Button('儲存', {
  bg: '#2563eb',
  hoverBg: '#3b82f6',
  onClick: () => save(),
});
scene.add(btn.setPosition(20, 20));
```

自動調整大小以適應標籤。投射 `<button>` → `getByRole('button', { name: '儲存' })`。

### `Input`（單行）

```typescript
import { Input } from '@vectojs/ui';

const input = new Input({
  width: 300,
  placeholder: '搜尋…',
  onChange: (value) => console.log(value),
});
scene.add(input.setPosition(20, 80));
```

由一個**真實的透明 `<input>`** 支援——瀏覽器原生處理所有輸入、IME、剪貼簿和復原。畫布僅繪製視覺效果。IME 組合底線、游標閃爍和 RTL 選取都會被渲染。

### `TextArea`（多行）

與 `Input` 相同的模型，由 `<textarea>` 支援。支援 `lineHeight`、垂直滾動到游標，以及用於游標到行映射的 `lineOfOffset(offset)`。

### `Toggle`

```typescript
import { Toggle } from '@vectojs/ui';

const toggle = new Toggle({
  label: '深色模式',
  checked: false,
  accent: '#6366f1',
  onChange: (checked) => applyTheme(checked),
});
```

投射 `role="switch"` 搭配 `aria-checked`。畫布點擊和鍵盤啟動都透過 `onChange` 回呼路由。

### `Checkbox`

```typescript
import { Checkbox } from '@vectojs/ui';

const cb = new Checkbox({
  label: '訂閱更新',
  checked: true,
  accent: '#2563eb',
  onChange: (checked) => setSubscribed(checked),
});
```

由 `<input type="checkbox">` 支援——可原生地透過鍵盤和輔助技術切換。

### `RadioGroup`

互斥的選項選擇，渲染為帶標籤的圓圈。支援鍵盤導覽（方向鍵循環選項），並在選取時觸發 `onChange` 回呼。

```typescript
import { RadioGroup } from '@vectojs/ui';

const radio = new RadioGroup({
  options: [
    { value: 'light', label: '淺色模式' },
    { value: 'dark', label: '深色模式', disabled: false },
    { value: 'system', label: '系統預設' },
  ],
  value: 'dark', // 初始選取的值
  gap: 28, // 選項之間的垂直間距，預設 28
  color: '#e2e8f0', // 標籤文字顏色
  accent: '#00f0ff', // 所選圓圈的填充顏色
  onChange: (val) => setTheme(val),
});
scene.add(radio.setPosition(40, 40));
```

關鍵選項：

| 選項       | 類型                  | 預設值      | 描述                               |
| ---------- | --------------------- | ----------- | ---------------------------------- |
| `options`  | `RadioOption[]`       | —           | `{ value, label, disabled? }` 陣列 |
| `value`    | `string`              | `''`        | 初始選取的值                       |
| `gap`      | `number`              | `28`        | 行之間的垂直間距                   |
| `accent`   | `string`              | `'#00f0ff'` | 所選圓圈填充                       |
| `onChange` | `(v: string) => void` | —           | 選取變更時的回呼                   |

隨時呼叫 `radio.setValue(val)` 以程式化地變更選取。投射 `role="radiogroup"`，每個選項帶有獨立的 `role="radio"` + `aria-checked`。

### `Tabs`

一個分頁面板容器——渲染一個水平頁籤列，並僅將活動面板的 `Entity` 掛載到場景中。切換頁籤會卸載前一個面板並掛載下一個，保持 VMT 精簡。

```typescript
import { Tabs } from '@vectojs/ui';

const settingsPane = new Stack({ direction: 'vertical', gap: 12 });
const previewPane = new Stack({ direction: 'vertical', gap: 12 });

const tabs = new Tabs({
  width: 500,
  height: 360,
  tabs: [
    { id: 'settings', label: '設定', content: settingsPane },
    { id: 'preview', label: '預覽', content: previewPane },
  ],
  activeTabId: 'settings', // 預設：第一個頁籤
  tabHeight: 36, // 頁籤列高度，預設 36
  selectedColor: '#00f0ff', // 活動頁籤底線/文字顏色
  onChange: (tabId) => console.log('活動頁籤:', tabId),
});
scene.add(tabs.setPosition(20, 20));

// 程式化切換頁籤：
tabs.setActiveTab('preview');
```

關鍵選項：

| 選項            | 類型                   | 預設值      | 描述                             |
| --------------- | ---------------------- | ----------- | -------------------------------- |
| `tabs`          | `TabItem[]`            | —           | `{ id, label, content: Entity }` |
| `activeTabId`   | `string`               | 第一個頁籤  | 初始可見的頁籤                   |
| `tabHeight`     | `number`               | `36`        | 頁籤列的像素高度                 |
| `selectedColor` | `string`               | `'#00f0ff'` | 活動頁籤強調色                   |
| `onChange`      | `(id: string) => void` | —           | 頁籤切換時觸發                   |

在頁籤列上投射 `role="tablist"`，在每個按鈕上投射 `role="tab"` + `aria-selected`。內容區域獲得 `role="tabpanel"`。

### `Slider`

```typescript
import { Slider } from '@vectojs/ui';

const slider = new Slider({ min: 0, max: 100, value: 50, width: 200 });
slider.on('change', (e) => console.log(e.value));
```

可拖曳的滑塊；值四捨五入到最接近的整數。投射 `role="slider"`。

### `Dropdown`

```typescript
import { Dropdown } from '@vectojs/ui';

const dd = new Dropdown(['小', '中', '大'], { value: '中' });
dd.on('change', (e) => setSize(e.value));
scene.add(dd.setPosition(20, 160));
```

透過 `scene.showOverlay()` 開啟浮動覆蓋選單；在選取或按 Escape 時關閉。完整的 ARIA combobox/listbox 接線。

## 文字與排版

### `Text`

具有冷/熱布局分離的換行多行文字：

```typescript
import { Text } from '@vectojs/ui';

const label = new Text('Hello, VectoJS!', {
  font: '600 18px "Outfit", sans-serif',
  color: '#e2e8f0',
  maxWidth: 400,
  lineHeight: 28,
});
```

- `setText(text)` — 重新測量（冷傳遞）。
- `append(text)` — 串流路徑；僅重新測量已變更的最後一個段落。
- `setMaxWidth(w)` — 僅重排，不重新測量（熱傳遞）。

### `RichText`

多樣式內聯文字，支援粗體/斜體/顏色/大小、連結熱區和排除形狀：

```typescript
import { RichText } from '@vectojs/ui';

const rich = new RichText(
  [
    { text: 'Zero DOM, ' },
    { text: 'accessible', style: { bold: true, color: '#38bdf8' } },
    { text: ' and agent-native.' },
  ],
  { maxWidth: 500 },
);
```

對於串流：使用 `appendSpans(newSpans)` — O(已變更的段落)。

## 覆蓋層與視窗

### `Overlay`

用於絕對定位覆蓋層的基礎類別。將浮動內容錨定到目標實體，具有自動視窗碰撞偵測和方向翻轉：

```typescript
import { Overlay } from '@vectojs/ui';

const overlay = new Overlay({
  target: button,
  content: popoverCard,
  placement: 'bottom-start',
});
```

### `Tooltip`

懸浮觸發的標籤，錨定到目標實體：

```typescript
import { Tooltip } from '@vectojs/ui';

const tooltip = new Tooltip({
  target: helpIcon,
  content: '更多資訊',
  delay: 200,
});
```

### `Popover`

點擊觸發的覆蓋層，包含任意子布局內容：

```typescript
import { Popover } from '@vectojs/ui';

const popover = new Popover({
  target: settingsButton,
  width: 200,
  height: 150,
});
```

### `ContextMenu`

右鍵觸發的選單，支援鍵盤快捷鍵、圖示、分隔線和巢狀子選單：

```typescript
import { ContextMenu } from '@vectojs/ui';

const menu = new ContextMenu({
  items: [
    { label: '復原', shortcut: 'Ctrl+Z', onClick: () => undo() },
    { separator: true },
    { label: '設定', children: [{ label: '匯出', onClick: () => export() }] }
  ]
});
scene.add(menu);
```

### `VirtualList`

一個高效能列表容器，僅渲染視窗中的元素，支援固定和可變行高：

```typescript
import { VirtualList } from '@vectojs/ui';

const list = new VirtualList({
  width: 300,
  height: 500,
  itemHeight: (idx) => measuredHeights[idx], // 或固定高度的數字
  itemRenderer: (idx) => createListItemEntity(idx),
});
```

### `TreeView`

一個目錄風格的樹狀節點導覽器。支援在節點展開時非同步延遲加載子項目：

```typescript
import { TreeView } from '@vectojs/ui';

const tree = new TreeView({
  nodes: [
    {
      id: 'src',
      label: 'src',
      children: async () => [{ id: 'index.ts', label: 'index.ts' }],
    },
  ],
});
```

### `Modal`

```typescript
import { Modal } from '@vectojs/ui';

const modal = new Modal('確認刪除', {
  modalWidth: 420,
  modalHeight: 200,
});
scene.showOverlay(modal);

// 從內部：modal.close() 執行動畫並自我移除。
```

彈簧動畫縮放進入。包含內建的關閉按鈕。

### `ScrollView`

一個具有彈簧物理滾動的裁剪視窗：

```typescript
import { ScrollView } from '@vectojs/ui';

const feed = new ScrollView({ width: 360, height: 600 });
for (const item of items) feed.add(new Card({ ... }));
scene.add(feed.setPosition(20, 20));
feed.scrollToBottom();  // 例如用於聊天記錄
```

支援滾輪、觸碰拖曳和程式化 `scrollTo(y)`。

## 豐富內容

### `Markdown`

將 Markdown 字串渲染成 VMT 子樹——標題、段落、帶語法高亮的程式碼區塊、表格、引用、連結和內聯格式：

```typescript
import { Markdown } from '@vectojs/markdown';

const doc = new Markdown('## Hello\n\nThis is **bold** and `code`.', {
  maxWidth: 700,
});
scene.add(doc.setPosition(40, 40));
```

對於 LLM 串流，使用 `appendMarkdown(chunk)`——它會重新對整個來源進行詞法分析，然後對令牌進行差異比較，並重用未變更的渲染前綴，而不是重建每個實體。

```typescript
const md = new Markdown('', { maxWidth: 600 });
scene.add(md);
for await (const token of llmStream) {
  md.appendMarkdown(token);
}
```

### `ProgressBar`

一個唯讀的進度指示器——渲染一個圓角軌道背景和一個與 `value` 成比例的填充強調條。可選地顯示一個置中的百分比標籤。

```typescript
import { ProgressBar } from '@vectojs/ui';

const progress = new ProgressBar({
  value: 0.45, // 0–1 分數
  width: 300,
  height: 16,
  showText: true, // 渲染置中的 '45%'
  accent: '#00f0ff', // 填充顏色
});
scene.add(progress.setPosition(40, 40));

// 在非同步操作期間更新：
for await (const chunk of stream) {
  progress.setValue(bytesReceived / totalBytes);
}
```

關鍵選項：

| 選項       | 類型      | 預設值                    | 描述              |
| ---------- | --------- | ------------------------- | ----------------- |
| `value`    | `number`  | —                         | 進度分數 `0`–`1`  |
| `width`    | `number`  | `200`                     | 總軌道寬度        |
| `height`   | `number`  | `16`                      | 軌道高度          |
| `radius`   | `number`  | `8`                       | 角落半徑          |
| `bg`       | `string`  | `'rgba(255,255,255,0.1)'` | 軌道背景          |
| `accent`   | `string`  | `'#00f0ff'`               | 填充條顏色        |
| `showText` | `boolean` | `false`                   | 顯示 `"45%"` 標籤 |

呼叫 `progress.setValue(fraction)` 來更新——該值會被夾在 `[0, 1]` 範圍內，且僅在值實際變更時才觸發重繪。投射 `role="progressbar"`，`aria-valuenow` 設為四捨五入後的百分比。

<figure>
  <img src="/images/component-gallery.svg" alt="VectoJS 元件展示，顯示 Button、Text、Input、Card、ScrollView、Slider、Toggle、Checkbox 和 Dropdown" class="diagram" />
  <figcaption>所有元件完全在畫布上渲染。陰影 DOM 節點（不可見）提供原生無障礙和自動化支援。</figcaption>
</figure>

請參閱 [UI 元件參考](/reference/ui-components/) 以取得完整的選項簽名。
