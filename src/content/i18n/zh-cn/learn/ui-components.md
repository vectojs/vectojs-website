---
title: 'UI组件'
description: '@vectojs/ui组件库概述：表单、布局容器、覆盖层和富内容。'
order: 16
---

# UI组件

`@vectojs/ui`包提供了一套现成的、生产质量的组件，构建在`@vectojs/core`之上。每个组件完全在canvas上渲染；无障碍来自自动的无障碍影子DOM层。

## 所有组件都扩展`UIComponent`

<figure>
  <img src="/images/entity-hierarchy.svg" alt="Entity类层次结构，展示所有内置UI组件" class="diagram" />
  <figcaption>每个组件继承Entity的位置、缩放、旋转、animate()和完整事件系统。</figcaption>
</figure>

`UIComponent`扩展`Entity`并添加了带AABB命中测试的共享盒模型。所有继承的属性（`x`、`y`、`width`、`height`、`opacity`、`interactive`、`animate`、`on`/`off`）在每个组件上都可用。

> **关于`interactive`的说明：** 大多数表单组件（`Button`、`Input`、`Text`等）在其构造函数中设置`this.interactive = true`。`Card`默认是装饰性的 —— 仅当传递`label`选项时才变为可交互。

## 布局容器

### `Stack`

一个类似flexbox的容器 —— 沿主轴顺序排列子元素：

```typescript
import { Stack } from '@vectojs/ui';
import { Button, Text } from '@vectojs/ui';

const col = new Stack({ direction: 'vertical', gap: 12 });
col.add(new Text('你好'));
col.add(new Button('点我'));
scene.add(col.setPosition(40, 40));
```

支持`direction`、`gap`、`align`（交叉轴）和可选的带`maxWidth`/`maxHeight`的`wrap`。

### `Flow`

一个预设为`{ direction: 'horizontal', wrap: true }`的`Stack` —— 用于chip行和标签云：

```typescript
import { Flow } from '@vectojs/ui';

const tags = new Flow({ gap: 8, maxWidth: 400 });
for (const label of ['TypeScript', 'WebGPU', 'Canvas']) {
  tags.add(new Button(label, { bg: '#1e293b', padding: 6 }));
}
scene.add(tags.setPosition(20, 20));
```

### `Card`

一个圆角背景面板 —— 在顶部添加子元素：

```typescript
import { Card } from '@vectojs/ui';

const card = new Card({
  width: 300,
  height: 200,
  bg: 'rgba(15, 23, 42, 0.8)',
  border: 'rgba(255, 255, 255, 0.1)',
  radius: 16,
  label: '设置面板', // 使其交互 + role="group"
});
card.add(toggle.setPosition(24, 24));
scene.add(card.setPosition(100, 100));
```

### `ResizablePanel`

一个分割面板布局系统，支持嵌套的可调整大小分割（水平和垂直）：

```typescript
import { PanelGroup, Panel, PanelResizeHandle } from '@vectojs/ui';

const group = new PanelGroup({ direction: 'horizontal', width: 600, height: 400 });
const leftPanel = new Panel({ minSize: 100, defaultSize: 0.3 });
const rightPanel = new Panel({ minSize: 150 });

group.addPanel(leftPanel);
group.addPanel(rightPanel);
scene.add(group);
```

## 表单控件

所有表单控件投影一个真实的、透明的影子DOM节点。智能体和屏幕阅读器通过这些原生元素交互；canvas渲染视觉。所有表单控件都有标准化的`change`事件绑定和`onChange`回调执行。

### `Button`

```typescript
import { Button } from '@vectojs/ui';

const btn = new Button('保存', {
  bg: '#2563eb',
  hoverBg: '#3b82f6',
  onClick: () => save(),
});
scene.add(btn.setPosition(20, 20));
```

自动适应标签大小。投影`<button>` → `getByRole('button', { name: '保存' })`。

### `Input`（单行）

```typescript
import { Input } from '@vectojs/ui';

const input = new Input({
  width: 300,
  placeholder: '搜索…',
  onChange: (value) => console.log(value),
});
scene.add(input.setPosition(20, 80));
```

由**真实的透明`<input>`**支持 —— 浏览器原生处理所有输入、IME、剪贴板和撤销。canvas仅绘制视觉。IME组合下划线、光标闪烁和RTL选择都得到渲染。

### `TextArea`（多行）

与`Input`相同的模型，由`<textarea>`支持。支持`lineHeight`、垂直滚动到光标和`lineOfOffset(offset)`用于光标到行映射。

### `Toggle`

```typescript
import { Toggle } from '@vectojs/ui';

const toggle = new Toggle({
  label: '暗色模式',
  checked: false,
  accent: '#6366f1',
  onChange: (checked) => applyTheme(checked),
});
```

投影`role="switch"`带`aria-checked`。canvas点击和键盘激活都通过`onChange`回调路由。

### `Checkbox`

```typescript
import { Checkbox } from '@vectojs/ui';

const cb = new Checkbox({
  label: '订阅更新',
  checked: true,
  accent: '#2563eb',
  onChange: (checked) => setSubscribed(checked),
});
```

由`<input type="checkbox">`支持 —— 可通过键盘和辅助技术原生切换。

### `RadioGroup`

互斥选项选择，渲染为带标签的圆圈。支持键盘导航（箭头键循环选项）并在选择时触发`onChange`回调。

```typescript
import { RadioGroup } from '@vectojs/ui';

const radio = new RadioGroup({
  options: [
    { value: 'light', label: '浅色模式' },
    { value: 'dark', label: '深色模式', disabled: false },
    { value: 'system', label: '系统默认' },
  ],
  value: 'dark', // 初始选择的值
  gap: 28, // 选项之间的垂直间距，默认28
  color: '#e2e8f0', // 标签文本颜色
  accent: '#00f0ff', // 选中圆圈的填充颜色
  onChange: (val) => setTheme(val),
});
scene.add(radio.setPosition(40, 40));
```

关键选项：

| 选项       | 类型                  | 默认值      | 说明                              |
| ---------- | --------------------- | ----------- | --------------------------------- |
| `options`  | `RadioOption[]`       | —           | `{ value, label, disabled? }`数组 |
| `value`    | `string`              | `''`        | 初始选中的值                      |
| `gap`      | `number`              | `28`        | 行之间的垂直间距                  |
| `accent`   | `string`              | `'#00f0ff'` | 选中圆圈的填充色                  |
| `onChange` | `(v: string) => void` | —           | 选择变化时的回调                  |

随时调用`radio.setValue(val)`以编程方式更改选择。投影`role="radiogroup"`，每个选项带有独立的`role="radio"` + `aria-checked`。

### `Tabs`

一个标签式面板容器 —— 渲染水平标签栏，并且只将活动窗格的`Entity`挂载到场景中。切换标签会卸载前一个窗格并挂载下一个，保持VMT最小。

```typescript
import { Tabs } from '@vectojs/ui';

const settingsPane = new Stack({ direction: 'vertical', gap: 12 });
const previewPane = new Stack({ direction: 'vertical', gap: 12 });

const tabs = new Tabs({
  width: 500,
  height: 360,
  tabs: [
    { id: 'settings', label: '设置', content: settingsPane },
    { id: 'preview', label: '预览', content: previewPane },
  ],
  activeTabId: 'settings', // 默认：第一个标签
  tabHeight: 36, // 标签栏高度，默认36
  selectedColor: '#00f0ff', // 活动标签下划线/文本颜色
  onChange: (tabId) => console.log('活动标签：', tabId),
});
scene.add(tabs.setPosition(20, 20));

// 以编程方式切换标签：
tabs.setActiveTab('preview');
```

关键选项：

| 选项            | 类型                   | 默认值      | 说明                             |
| --------------- | ---------------------- | ----------- | -------------------------------- |
| `tabs`          | `TabItem[]`            | —           | `{ id, label, content: Entity }` |
| `activeTabId`   | `string`               | 第一个标签  | 初始可见的标签                   |
| `tabHeight`     | `number`               | `36`        | 标签栏行的像素高度               |
| `selectedColor` | `string`               | `'#00f0ff'` | 活动标签强调色                   |
| `onChange`      | `(id: string) => void` | —           | 标签切换时触发                   |

栏上投影`role="tablist"`，每个按钮上投影`role="tab"` + `aria-selected`。内容区域获得`role="tabpanel"`。

### `Slider`

```typescript
import { Slider } from '@vectojs/ui';

const slider = new Slider({ min: 0, max: 100, value: 50, width: 200 });
slider.on('change', (e) => console.log(e.value));
```

可拖拽的滑块；值四舍五入到最近的整数。投影`role="slider"`。

### `Dropdown`

```typescript
import { Dropdown } from '@vectojs/ui';

const dd = new Dropdown(['小', '中', '大'], { value: '中' });
dd.on('change', (e) => setSize(e.value));
scene.add(dd.setPosition(20, 160));
```

通过`scene.showOverlay()`打开浮动覆盖菜单；在选择或按Escape时关闭。完整的ARIA combobox/listbox接线。

## 文本与排版

### `Text`

带冷/热布局拆分的换行多行文本：

```typescript
import { Text } from '@vectojs/ui';

const label = new Text('你好，VectoJS！', {
  font: '600 18px "Outfit", sans-serif',
  color: '#e2e8f0',
  maxWidth: 400,
  lineHeight: 28,
});
```

- `setText(text)` —— 重新测量（冷传递）。
- `append(text)` —— 流式路径；仅重新测量更改的最后一个段落。
- `setMaxWidth(w)` —— 仅重排，不重新测量（热传递）。

### `RichText`

多样式内联文本，带粗体/斜体/颜色/大小文本段、链接热区和排除形状：

```typescript
import { RichText } from '@vectojs/ui';

const rich = new RichText(
  [
    { text: '零DOM，' },
    { text: '可访问', style: { bold: true, color: '#38bdf8' } },
    { text: '且智能体原生。' },
  ],
  { maxWidth: 500 },
);
```

对于流式传输：使用`appendSpans(newSpans)` —— O(更改的段落)。

## 覆盖层与视口

### `Overlay`

用于绝对定位覆盖层的基类。将浮动内容相对于目标实体锚定，自动进行视口碰撞检测和方向翻转：

```typescript
import { Overlay } from '@vectojs/ui';

const overlay = new Overlay({
  target: button,
  content: popoverCard,
  placement: 'bottom-start',
});
```

### `Tooltip`

相对于目标实体锚定的悬停触发标签：

```typescript
import { Tooltip } from '@vectojs/ui';

const tooltip = new Tooltip({
  target: helpIcon,
  content: '更多信息',
  delay: 200,
});
```

### `Popover`

点击触发的覆盖层，包含任意子布局内容：

```typescript
import { Popover } from '@vectojs/ui';

const popover = new Popover({
  target: settingsButton,
  width: 200,
  height: 150,
});
```

### `ContextMenu`

右键触发菜单，支持键盘快捷键、图标、分隔符和嵌套子菜单：

```typescript
import { ContextMenu } from '@vectojs/ui';

const menu = new ContextMenu({
  items: [
    { label: '撤销', shortcut: 'Ctrl+Z', onClick: () => undo() },
    { separator: true },
    { label: '设置', children: [{ label: '导出', onClick: () => export() }] }
  ]
});
scene.add(menu);
```

### `VirtualList`

一个高性能列表容器，只渲染视口中的元素，支持固定和可变行高：

```typescript
import { VirtualList } from '@vectojs/ui';

const list = new VirtualList({
  width: 300,
  height: 500,
  itemHeight: (idx) => measuredHeights[idx], // 或固定高度使用number
  itemRenderer: (idx) => createListItemEntity(idx),
});
```

### `TreeView`

一个目录风格的树节点导航器。支持在节点展开时异步懒加载子项：

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

const modal = new Modal('确认删除', {
  modalWidth: 420,
  modalHeight: 200,
});
scene.showOverlay(modal);

// 从内部：modal.close()动画并自移除。
```

弹簧动画缩放进入。包含内置关闭按钮。

### `ScrollView`

带弹簧物理滚动的裁剪视口：

```typescript
import { ScrollView } from '@vectojs/ui';

const feed = new ScrollView({ width: 360, height: 600 });
for (const item of items) feed.add(new Card({ ... }));
scene.add(feed.setPosition(20, 20));
feed.scrollToBottom();  // 例如用于聊天日志
```

支持滚轮、触摸拖拽和程序化`scrollTo(y)`。

## 富内容

### `Markdown`

将Markdown字符串渲染为VMT子树 —— 标题、段落、带语法高亮的代码块、表格、块引用、链接和内联格式：

```typescript
import { Markdown } from '@vectojs/markdown';

const doc = new Markdown('## 你好\n\n这是**粗体**和`代码`。', {
  maxWidth: 700,
});
scene.add(doc.setPosition(40, 40));
```

对于LLM流式传输，使用`appendMarkdown(chunk)` —— 它重新词法分析完整源，然后对令牌进行差异比较并重用未更改的渲染前缀，而不是重建每个实体。

```typescript
const md = new Markdown('', { maxWidth: 600 });
scene.add(md);
for await (const token of llmStream) {
  md.appendMarkdown(token);
}
```

### `ProgressBar`

一个只读进度指示器 —— 渲染圆角轨道背景和与`value`成比例的填充强调条。可选择显示居中的百分比标签。

```typescript
import { ProgressBar } from '@vectojs/ui';

const progress = new ProgressBar({
  value: 0.45, // 0–1 分数
  width: 300,
  height: 16,
  showText: true, // 居中渲染'45%'
  accent: '#00f0ff', // 填充颜色
});
scene.add(progress.setPosition(40, 40));

// 在异步操作期间更新：
for await (const chunk of stream) {
  progress.setValue(bytesReceived / totalBytes);
}
```

关键选项：

| 选项       | 类型      | 默认值                    | 说明             |
| ---------- | --------- | ------------------------- | ---------------- |
| `value`    | `number`  | —                         | 进度分数 `0`–`1` |
| `width`    | `number`  | `200`                     | 总轨道宽度       |
| `height`   | `number`  | `16`                      | 轨道高度         |
| `radius`   | `number`  | `8`                       | 角落半径         |
| `bg`       | `string`  | `'rgba(255,255,255,0.1)'` | 轨道背景         |
| `accent`   | `string`  | `'#00f0ff'`               | 填充条颜色       |
| `showText` | `boolean` | `false`                   | 显示`"45%"`标签  |

调用`progress.setValue(fraction)`更新 —— 值被限制在`[0, 1]`，并且仅在值实际变化时触发重绘。投影`role="progressbar"`，`aria-valuenow`设置为四舍五入的百分比。

<figure>
  <img src="/images/component-gallery.svg" alt="VectoJS组件画廊，展示Button、Text、Input、Card、ScrollView、Slider、Toggle、Checkbox和Dropdown" class="diagram" />
  <figcaption>所有组件完全在canvas上渲染。影子DOM节点（不可见）提供原生无障碍和自动化支持。</figcaption>
</figure>

参见[UI组件参考](/reference/ui-components/)以了解完整的选项签名。
