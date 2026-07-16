---
title: '@vectojs/ui 组件参考'
description: '所有 @vectojs/ui 组件的完整参考：布局容器、表单控件、覆盖层和富内容。'
order: 11
---

# `@vectojs/ui` — 组件参考

> 适用于 VectoJS zero-DOM Canvas 引擎的可复用高级组件。
> 文档版本：**1.9.1**。权威来源：`dist/index.d.ts`（公共表面）和 `packages/ui/src/*`（行为）。

每个组件都是 Virtual Math Tree (VMT) 中的叶节点或容器节点。这里没有真正的 DOM——组件通过 `IRenderer` 在 Canvas 上绘制自身。可访问性、智能体自动化和可爬取性来自一个并行的 **A11y Shadow DOM**：当一个组件是 `interactive` 时，`Scene` 会投影一个位于组件框上方的、隐藏的透明真实 DOM 节点，该节点由 `getA11yAttributes()` 构建。这就是为什么 `page.getByRole('button', { name })` / `fill()` / 屏幕阅读器可以在纯 Canvas UI 上工作的原因。

纯文本应用可以通过 `@vectojs/ui/text` 导入 `Text`。这个轻量级入口点将 Markdown 和 MathJax 排除在启动图之外；在组合多个组件族时使用根 `@vectojs/ui` 入口。

## 在线组件画廊

下面的画廊现在是包级冒烟测试。对于日常调试，请使用聚焦的
组件页面，这样可以在不滚动浏览每个组件的情况下检查某个行为：

| 领域            | 组件页面                                                                                                                                                                                                                                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 文本与媒体      | [`Text`](/reference/ui-text/)、[`RichText`](/reference/ui-richtext/)、[`Link`](/reference/ui-link/)、[`Image`](/reference/ui-image/)                                                                                                                                                                                                                                                 |
| 布局容器        | [`Card`](/reference/ui-card/)、[`Stack`](/reference/ui-stack/)、[`Flow`](/reference/ui-flow/)、[`ScrollView`](/reference/ui-scrollview/)、[`VirtualList`](/reference/ui-virtuallist/)、[`TreeView`](/reference/ui-treeview/)、[可调整大小面板](/reference/ui-resizable-panel/)                                                                                                       |
| 控件与表单      | [`Button`](/reference/ui-button/)、[`Input`](/reference/ui-input/)、[`TextArea`](/reference/ui-textarea/)、[`Checkbox`](/reference/ui-checkbox/)、[`Toggle`](/reference/ui-toggle/)、[`Slider`](/reference/ui-slider/)、[`Dropdown`](/reference/ui-dropdown/)、[`RadioGroup`](/reference/ui-radiogroup/)、[`Tabs`](/reference/ui-tabs/)、[`ProgressBar`](/reference/ui-progressbar/) |
| 富内容          | [`Markdown`](/reference/ui-markdown/)、[`CodeBlock`](/reference/ui-codeblock/)、[`Table`](/reference/ui-table/)                                                                                                                                                                                                                                                                      |
| 覆盖层与瞬态 UI | [`Overlay`](/reference/ui-overlay/)、[`Tooltip`](/reference/ui-tooltip/)、[`Popover`](/reference/ui-popover/)、[`ContextMenu`](/reference/ui-contextmenu/)、[`Modal`](/reference/ui-modal/)                                                                                                                                                                                          |

<figure class="sandbox component-gallery">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">在线 · @vectojs/ui 1.9.1 · 可滚动</span></div>
  <iframe src="/sandbox/ui-components.html" class="sandbox-frame component-gallery-frame" loading="eager" title="每个 VectoJS UI 组件的交互式画廊" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>包级冒烟画廊：先确保广泛覆盖，调试特定行为时使用聚焦的组件页面。</figcaption>
</figure>

## 所有组件共享的约定

所有组件都继承自 `UIComponent`，而 `UIComponent` 继承自核心的 `Entity`。以下继承成员被频繁使用，在下面的各组件文档中 **不会** 重复列出。

| 成员                | 签名                                               | 说明                                                                                                                                                  |
| ------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setPosition`       | `setPosition(x, y): this`                          | 局部空间定位；可链式调用。                                                                                                                            |
| `add` / `remove`    | `add(child: Entity): this` / `remove(child): this` | 子节点管理（容器会覆盖 `add` 以重新布局）。                                                                                                           |
| `on` / `off`        | `on(event, cb, { capture? }): this`                | 类似 DOM 的捕获+冒泡。事件：`click hover pointerdown pointerup pointercancel pointermove pointerleave change focus blur wheel keydown keyup`。        |
| `emit`              | `emit(event, payload): void`                       | 直接自身分发（不进行树传播）。                                                                                                                        |
| `getGlobalPosition` | `getGlobalPosition(): Point`                       | 世界空间位置，累加祖先变换。                                                                                                                          |
| `scene`             | `get scene`                                        | 最近的已附加 `Scene`；使用 `this.scene?.markDirty()` 在 `onDemand` 场景中请求重绘。                                                                   |
| `interactive`       | `interactive: boolean`                             | 为 true 时，组件会投影一个 A11y 影子节点并接收指针/键盘事件。                                                                                         |
| `clipChildren`      | `clipChildren: boolean`                            | 将子节点的正常绘制裁切到局部框内。Canvas/SVG 为精确裁切；Three 对旋转/剪切裁切使用 AABB 剪刀。GPU point/WebGPU 叠加路径不参与。由 `ScrollView` 使用。 |
| `width` / `height`  | `number`                                           | 组件的盒子尺寸；驱动命中测试和视口剔除。                                                                                                              |
| `padding`           | `number`                                           | 内边距（默认 `0`）；盒子式组件默认值更高。                                                                                                            |
| transforms          | `x y scaleX scaleY rotation opacity`               | 仿射变换和乘法透明度被子节点继承。                                                                                                                    |
| `animate`           | `animate(targetProps, durationMs): this`           | 排队数字补间动画。                                                                                                                                    |

---

## `UIComponent`（抽象基类）

```ts
abstract class UIComponent extends Entity {
  padding: number; // 默认 0
  isPointInside(globalX: number, globalY: number): boolean;
  getBounds(): Bounds; // { x:0, y:0, width, height }

  // 进入/退出存在感帮助方法
  protected enterMotion?: MotionSpec; // 挂载时播放
  protected exitMotion?: MotionSpec; // 由 dismiss() 播放
  dismiss(): Promise<void>; // 播放 exitMotion，然后从树中移除
}
```

集中了每个组件共享的盒子模型 + 轴对齐 (AABB) 命中测试。`isPointInside` 返回该点是否位于局部空间的 `[0,width] × [0,height]` 内。`getBounds()` 返回局部框，以便 `Scene` 进行视口剔除。子类通过测量内容设置 `width`/`height`，实现 `render(r)`，并且（当为 interactive 时）覆盖 `getA11yAttributes()`。

**存在感：** 将 `enterMotion` / `exitMotion` 声明为 `MotionSpec`（`{ props: { opacity: [0, 1], … }, config? }`），组件在挂载到活动场景时以动画方式进入，并在 `dismiss()` 时以动画方式退出——`dismiss()` 会延迟自身的移除，直到退出动画解析完毕。这是基于[核心动画系统](/reference/core-api/#animation)的一个统一实现，取代了各组件手工编写的弹簧动画。在 `prefers-reduced-motion` 下动画会被抑制（保留不透明度渐变动画）。

### `getA11yAttributes(): A11yAttributes`

每个交互式组件都会覆盖的钩子。返回的形状（来自 `@vectojs/core`）驱动投影的影子节点：

```ts
interface A11yAttributes {
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea'; // 默认 'div'
  role?: string; // ARIA 角色
  label?: string; // aria-label / 可访问名称
  href?: string; // tag 'a'
  src?: string;
  alt?: string; // tag 'img'
  inputType?: string;
  placeholder?: string;
  value?: string; // tag 'input'
  checked?: boolean; // input.checked 或 aria-checked，每帧刷新
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

## 文本与排版

### `Text`

```ts
new Text(text: string, opts?: TextOptions)

interface TextOptions {
  font?: string;                  // 默认 '16px sans-serif'
  color?: string;                 // 默认 '#e2e8f0'
  maxWidth?: number;              // 换行宽度；省略 → 仅显式 '\\n' 换行
  lineHeight?: number;            // 行高（px），默认 20
  preserveLeadingSpaces?: boolean;// 默认 false
  selectable?: boolean;           // 浏览器原生拖选，默认 true
}
```

使用原生 `fillText` 绘制的多行文本。换行/测量通过核心 `LayoutEngine` 进行（与 `TextEntity` 相同的 `Intl.Segmenter` 路径），采用 **冷/热分离**：

- `setText(text): this` — 冷传递（重新分段 + 重新测量），然后重新布局。
- `append(text): this` — 流式/打字机路径；等价于 `setText(this.text + text)`，但引擎的段落记忆化会复用未变更的前导段落，因此只有最后一个被更改的段落会被重新测量。
- `setMaxWidth(maxWidth): this` — **热**路径；仅对缓存的测量文本重新换行（不重新分段）。响应式回流时优先使用此方法。
- `setSelectable(selectable): this` — 启用或禁用投影的原生选择表面。

内容投影镜像视觉换行和行高，以支持浏览器查找、选择和复制。静态 `Text` 不是交互式命中目标；Canvas/VMT 仍然拥有其像素和布局。

### `RichText`

```ts
new RichText(spans: StyledSpan[], opts?: RichTextOptions)

interface RichTextOptions {
  font?: string;                          // 基础简写，默认 '16px sans-serif'
  color?: string;                         // 默认填充色，默认 '#e2e8f0'
  maxWidth?: number;                      // 换行宽度
  baseStyle?: TextStyle;                  // 每个 run 继承（run 样式仍然优先）
  linkColor?: string;                     // 链接 run 在没有自身颜色时的默认色 '#38bdf8'
  onLinkClick?: (href: string) => void;   // 链接 run 被激活时触发
  exclusions?: ExclusionRect[];           // 文字绕排的区域（排除形状 / 浮动）
  selectable?: boolean;                   // 浏览器原生拖选，默认 true
}
```

多样式内联文本：粗体/斜体/彩色/不同字号的 run 在共享基线上流动和换行。布局使用核心 `LayoutEngine.prepareRich`；每个字形使用其 run 的颜色/粗细/倾斜度绘制。

- `setSpans(spans): this` — 替换 runs 并重新布局。
- `appendSpans(spans): this` — **流式**路径；富段落记忆化会复用未变更的前导段落，因此 token 流以 O(已更改段落) 而不是 O(文档) 重新准备。
- `setMaxWidth(maxWidth): this` — 重新回流。
- `setExclusions(exclusions): this` — 设置浮动区域并重新回流。
- `setSelectable(selectable): this` — 切换原生选择，无需重建 spans。

A11y：每个连续的**链接 run** 都会获得一个透明的 `<a>` 热点子节点（跨重 wrap 保持一致——每个 run 一个热点；位置就地更新，只有链接**数量**发生变化时才重建影子节点）。组件自身的可访问名称是完整的拼接文本。

### `measureText`、`wrapLines`、`wrapText`（自由函数）

```ts
measureText(text: string, font: string): number
```

CSS `font` 下的渲染像素宽度，通过有界 LRU（容量 1000）进行记忆化。阿拉伯语在测量前会先进行字形塑造。在没有 DOM 的情况下，回退到每字符 `0.5em` 的估算值。

```ts
wrapLines(text: string, font: string, maxWidth: number): string[]
```

贪心式单词换行，尊重显式 `\\n`。过长的单词独占一行（不拆分）。

```ts
wrapText(value: string, maxWidth: number, measure: (s: string) => number): WrappedLine[]

interface WrappedLine { text: string; start: number; end: number; }  // 绝对字符范围
```

与 `wrapLines` 类似，但追踪每行的绝对字符范围（因此线性光标偏移可以映射到 `(line, x)`），消耗硬 `\\n`（尾部换行符会产出一个尾部空行，光标可以停在其上），并在字符级别拆分过长的单字。内部由 `TextArea` 使用。

---

## 布局容器

### `Stack`

```ts
new Stack(opts?: StackOptions)

interface StackOptions {
  direction?: 'vertical' | 'horizontal';  // 默认 'vertical'
  gap?: number;                            // 默认 0
  align?: 'start' | 'center' | 'end';      // 交叉轴对齐，默认 'start'
  wrap?: boolean;                          // 默认 false
  maxWidth?: number;                       // 主轴换行阈值（水平方向）；默认 Infinity
  maxHeight?: number;                      // 主轴换行阈值（垂直方向）；默认 Infinity
}
```

沿主轴按顺序排列子节点，带有 `gap`，在交叉轴上进行对齐。子节点保持自身尺寸——仅设置 `x`/`y`。自身不绘制任何内容。

- `add(child): this` — 追加并立即**重新运行 `layout()`**。
- `layout(): void` — 定位所有子节点并调整容器大小以适配（以便可以被剔除）。在 `add` 之外修改子节点后（例如调整子节点大小），手动调用。

当 `wrap` 为 true 时，沿主轴超出 `maxWidth`/`maxHeight` 的子节点将另起一行；容器在交叉轴上增长。

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

一个预配置为 `{ direction: 'horizontal', wrap: true }` 的 `Stack`——水平排列的子项在超出 `maxWidth` 后换行到下一行。用于标签云、标签行。继承 `add()`/`layout()`。

### `Card`

```ts
new Card(opts: CardOptions)

interface CardOptions {
  width: number;          // 必填
  height: number;         // 必填
  bg?: string;            // 默认 '#0f172a'
  border?: string;        // 省略 → 无边框
  borderWidth?: number;   // 默认 1
  radius?: number;        // 默认 12
  padding?: number;       // 默认 0（使用者手动定位子节点）
  label?: string;         // 设置后 → interactive + role="group" 地标
}
```

一个带圆角的背景面板，可选的边框。通过 `add()` 添加子节点；它们会在卡的局部空间中渲染在上方。**默认是装饰性的**（无影子节点，不可交互）。传递 `label` 会使其变为交互式并投影 `{ role: 'group', label }`，以便辅助技术/智能体可以找到该区域。`padding` 仅作信息提示——不会自动缩进子节点。

---

## 控件与表单

以下所有表单控件都是 `interactive` 的，并会投影一个真实的影子节点；canvas 是该影子节点原生事件驱动的视觉镜像。

### `Button`

```ts
new Button(label: string, opts?: ButtonOptions)

interface ButtonOptions {
  onClick?: (e: unknown) => void;  // 同时响应 Canvas 命中测试和影子 <button> 点击
  bg?: string;                     // 默认 '#2563eb'
  hoverBg?: string;                // 默认 '#3b82f6'
  color?: string;                  // 标签颜色，默认 '#ffffff'
  font?: string;                   // 默认 '600 16px sans-serif'
  padding?: number;                // 默认 12
  radius?: number;                 // 默认 8
}
```

带有居中标签的圆角矩形。`width` 自动计算为 `measureText(label, font) + 2·padding`；`height` 为 `fontSizePx(font) + 2·padding`（从 `font` 解析出的 px 尺寸，而非测量标签宽度）。投影 `{ tag: 'button', role: 'button', label }` → 由 `getByRole('button', { name })` 驱动。公共状态：`focused`（绘制 `#00f0ff` 聚焦环），内部 `hovered`（切换到 `hoverBg`）。

### `Link`

```ts
new Link(label: string, opts: LinkOptions)   // opts 必填（href）

interface LinkOptions {
  href: string;          // 必填；导航目标 + 影子 <a href>
  color?: string;        // 默认 '#38bdf8'
  font?: string;         // 默认 '16px sans-serif'
  underline?: boolean;   // 默认 true
}
```

彩色（可选下划线）文本。自动适应标签尺寸。投影一个真实的 `{ tag: 'a', href, label }` 影子节点（原生可点击/可爬取）。Canvas 命中测试路径通过 `window.open(href, '_blank', 'noopener')` 打开。

### `Image`

```ts
new Image(src: string, opts: ImageOptions)

interface ImageOptions {
  width: number;          // 必填（canvas 需要已知框来进行布局/剔除）
  height: number;         // 必填
  alt?: string;           // 默认 ''
  placeholder?: string;   // 加载前的填充色，默认 '#1e293b'
  radius?: number;        // 占位符圆角半径，默认 0
  onLoad?: () => void;    // 位图加载完成时触发
}
```

通过 `drawImage` 绘制；投影 `{ tag: 'img', src, alt, label: alt }`。加载是异步的——在就绪前会绘制一个占位框。在 `onDemand` 场景中，传递 `onLoad: () => scene.markDirty()` 以在加载时重绘。（遮蔽了 `globalThis.Image`；通过 `import { Image } from '@vectojs/ui'` 引用该类。）

### `Input`

```ts
new Input(opts: InputOptions)

interface InputOptions {
  width: number;             // 必填
  height?: number;           // 默认 40
  placeholder?: string;
  value?: string;            // 默认 ''
  font?: string;             // 默认 '16px sans-serif'
  color?: string;            // 默认 '#e2e8f0'
  placeholderColor?: string; // 默认 '#64748b'
  bg?: string;               // 默认 '#0f172a'
  border?: string;           // 默认 '#334155'
  selectionColor?: string;   // 默认 'rgba(56, 189, 248, 0.35)'
  radius?: number;           // 默认 6
  padding?: number;          // 默认 10
  onChange?: (value: string) => void;
}
```

单行输入框，由**真实、透明的 `<input>` 影子节点**支持。浏览器在该元素上原生处理所有输入——点击、键盘、**IME 组合**、选择、剪贴板、撤销；canvas 仅负责绘制。`Scene` 通过 `change` 事件将状态镜像回来，该事件负载携带 `value`、`selectionStart`、`selectionEnd` 和 `composition`。组件将这些重新暴露为公共字段：

- `value: string`，`focused: boolean`（驱动 500ms 光标闪烁）。
- `selectionStart` / `selectionEnd: number` — 从真实输入镜像的光标/选择偏移量。
- `composition: { start; length } | null` — 活跃的 IME 预编辑范围（绘制为下划线）。

A11y：`{ tag: 'input', inputType: 'text', placeholder, value, label: placeholder }`。智能体通过角色 `fill()` 它；人类输入中/日/韩文；canvas 渲染光标、选择高亮、IME 下划线和滚动到光标（`scrollLeft`）。通过布局引擎处理 RTL（希伯来语/阿拉伯语）范围。

### `TextArea`

```ts
new TextArea(opts: TextAreaOptions)

interface TextAreaOptions {
  width: number;             // 必填
  height?: number;           // 默认 120
  placeholder?: string;
  value?: string;            // 默认 ''
  font?: string;             // 默认 '16px sans-serif'
  lineHeight?: number;       // 字体大小的倍数，默认 1.4
  color?: string;            // 默认 '#e2e8f0'
  placeholderColor?: string; // 默认 '#64748b'
  bg?: string;               // 默认 '#0f172a'
  border?: string;           // 默认 '#334155'
  selectionColor?: string;   // 默认 'rgba(56, 189, 248, 0.35)'
  radius?: number;           // 默认 6
  padding?: number;          // 默认 10
  onChange?: (value: string) => void;
}
```

多行文本输入框，由**真实、透明的 `<textarea>` 影子节点**支持——与 `Input` 相同的镜像模型，外加多行导航。Canvas 重新换行文本值（通过 `wrapText`）并绘制文本、选择和光标。公共字段镜像 `Input`：`value`、`focused`、`selectionStart`、`selectionEnd`、`composition`。`lineHeightFactor` 保存 `lineHeight` 选项。

- `lineOfOffset(offset: number): number` — 包含给定线性字符偏移量的视觉（换行后）行索引；边界偏移量解析到最早包含该偏移的行，超范围则限制到最后一行。用于将光标位置映射到行。

A11y：投影一个 `textarea` 影子节点；智能体 `fill()` 它，人类输入中/日/韩文，渲染保持 Zero-DOM。垂直滚动到光标使活动行保持在视图中（`scrollTop`）。

### `Checkbox`

```ts
new Checkbox(opts: CheckboxOptions)

interface CheckboxOptions {
  checked?: boolean;   // 默认 false
  label?: string;      // 在右侧绘制；用作可访问名称
  size?: number;       // 选框尺寸 px，默认 20
  font?: string;       // 默认 '16px sans-serif'
  color?: string;      // 标签颜色，默认 '#e2e8f0'
  accent?: string;     // 选中状态填充色，默认 '#2563eb'
  border?: string;     // 未选中边框，默认 '#475569'
  onChange?: (checked: boolean) => void;
}
```

由真实 `<input type="checkbox">` 影子节点支持——智能体/辅助技术可以原生切换。Canvas `click` 和影子节点的原生 `change` 都通过一个受保护的 setter 路由（值未变化时不会重复触发 `onChange`）。公共属性：`checked`。A11y：`{ tag: 'input', inputType: 'checkbox', checked, label }`。

### `Toggle`

```ts
new Toggle(opts: ToggleOptions)

interface ToggleOptions {
  checked?: boolean;   // 默认 false
  label?: string;      // 在右侧绘制；用作可访问名称
  width?: number;      // 轨道宽度 px，默认 44（暴露为 trackW）
  height?: number;     // 轨道高度 px，默认 24（暴露为 trackH）
  font?: string;       // 默认 '16px sans-serif'
  color?: string;      // 标签颜色，默认 '#e2e8f0'
  accent?: string;     // 开启状态轨道填充色，默认 '#2563eb'
  track?: string;      // 关闭状态轨道填充色，默认 '#475569'
  onChange?: (checked: boolean) => void;
}
```

iOS 风格开关，投影 `{ role: 'switch', checked, label }` 并携带 `aria-checked`。由于 `role="switch"` 是一个 `div`（`Scene` 不会转发原生 change），`click` 会重新向自身发出 `change` 事件；单个 `change` 处理程序是权威来源，因此外部 `on('change', …)` 监听器和 `onChange` 回调都会触发。公共属性：`checked`、`trackW`、`trackH`。

### `Slider`

```ts
new Slider(props?: SliderProps)   // props 在 .d.ts 中是松散类型 (any)

// 可识别的 props（在构造函数中读取）：
{
  min?: number;            // 默认 0
  max?: number;            // 默认 100
  value?: number;          // 默认 = min
  width?: number;          // 默认 200
  height?: number;         // 默认 24
  step?: number;           // 默认 1 — 指针和键盘的值粒度
  trackColor?: string;     // 默认 'rgba(255, 255, 255, 0.15)'
  progressColor?: string;  // 默认 '#00f0ff'
  handleColor?: string;    // 默认 '#fff'
}
```

水平滑块，带圆形拖动手柄。公共属性：`min`、`max`、`value`、`step`。拖动（`pointerdown` → `pointermove` → `pointerup`）将指针 `localX` 映射为值，**吸附到以 `min` 为锚点的 `step` 网格**（默认整数步长，与 `input[type=range]` 语义一致），并发出携带 `{ value }` 的 `change` 事件（通过 `on('change', e => e.value)` 订阅）。键盘：`ArrowRight`/`ArrowUp` 步进增加，`ArrowLeft`/`ArrowDown` 步进减少，`Home`/`End` 跳转到 `min`/`max`。A11y：`{ role: 'slider', value, valuemin, valuemax }`。旧版 1.0 之前的 UI 构建只有整数值且没有键盘处理。

### `Dropdown`

```ts
new Dropdown(options: string[], props?: DropdownProps)  // props 是松散类型 (any)

// 可识别的 props：
{
  value?: string;   // 初始选择；默认 = options[0]
  width?: number;   // 默认 120
  height?: number;  // 默认 36
  bg?: string;      // 按钮背景色，默认 'rgba(30, 41, 59, 0.85)'
  color?: string;   // 默认 '#fff'
  radius?: number;  // 默认 8
  font?: string;    // 默认 '14px sans-serif'
}
```

组合框：一个 `Button` 显示当前值；点击（或 `ArrowDown`/`ArrowUp`/`Enter`/`Space`）打开一个由选项 `Button` 组成的 `Stack` 菜单以及一个全屏透明背景，两者都通过 `scene.showOverlay(...)` 挂载。`Escape` 或点击背景通过 `scene.hideOverlay(...)` 关闭。选择会发出携带 `{ value }` 的 `change` 事件。键盘导航追踪高亮索引；`activedescendant` 和选项 id（`${id}-opt-${i}`）已为 ARIA 连接。

A11y 根节点：`{ role: 'combobox', expanded, controls, haspopup: 'listbox', value, activedescendant }`。菜单投影 `role="listbox"`，每个选项投影 `role="option"` 并携带 `selected`。

---

## 覆盖层

### `Modal`

```ts
new Modal(title: string, props?: ModalProps)  // props 是松散类型 (any)

// 可识别的 props：
{
  width?: number;       // 背景，默认 window.innerWidth（回退 800）
  height?: number;      // 背景，默认 window.innerHeight（回退 600）
  backdropColor?: string; // 默认 'rgba(0, 0, 0, 0.5)'
  modalWidth?: number;  // 中央卡片，默认 400
  modalHeight?: number; // 默认 250
  cardBg?: string;      // 默认 'rgba(15, 23, 42, 0.95)'
  cardBorder?: string;  // 默认 'rgba(255, 255, 255, 0.15)'
}
```

一个全屏调暗背景，包含一个居中的 `Card`，其中包含 `title` 文本和一个内置的"关闭"按钮。卡片在挂载时通过共享的[动画系统](/reference/core-api/#animation)以弹簧动画缩放；阻止底层 `click`/`pointerdown`。使用 `scene.showOverlay(modal)` 显示它。

- `close(): Promise<void>` — 将卡片缩放弹簧回到 0，然后在退出动画解析后通过 `scene.hideOverlay(this)` 卸载（安全的延迟拆卸）。可 `await`。
- `update(dt, time)` — 滴答弹簧并在动画期间标记场景为脏（由渲染循环调用）。

### `ScrollView`

```ts
new ScrollView(opts: ScrollViewOptions)

interface ScrollViewOptions { width: number; height: number; }
```

一个裁切视口（`clipChildren = true`），支持滚轮 + 指针拖动滚动和弹簧物理（摩擦力 `0.85`，弹簧 `0.1`）。子节点位于一个不可交互的 `content` Entity 内部，该 Entity 会被平移；视口框保持固定。

- `content: Entity` — 滚动的容器（公共）。
- `add(child): this` / `remove(child): this` — 修改 `content` 并调用 `updateContentSize()`。
- `updateContentSize(): void` — 根据子节点范围重新计算 `content.width/height`（在直接修改子节点后调用），以设置最大滚动范围。
- `scrollTo(y: number): void` — 滚动到 Y 偏移，其中 **0 为顶部**（内部会钳制；公共滚动 API 于 0.1.1 添加）。
- `scrollToBottom(): void` — 跳转到内容末尾（于 0.1.1 添加）。
- `update(dt, time)` — 将弹簧向目标偏移积分（由渲染循环调用）。

滚轮滚动会调用 `preventDefault()`，但按住 `Ctrl` 时除外（允许浏览器缩放）。指针拖动以 1:1 比例移动内容与光标/手指。滚动目标被钳制在 `[-maxScroll, 0]` 范围内。

```ts
const sv = new ScrollView({ width: 360, height: 480 });
sv.add(longContent);
scene.add(sv.setPosition(20, 20));
sv.scrollToBottom(); // 例如追加后的聊天记录
```

---

## 内容 / 富文档

### `Markdown`

```ts
new Markdown(markdownText: string, opts?: MarkdownOptions)

interface MarkdownOptions {
  maxWidth?: number;     // 默认 800
  theme?: MarkdownTheme;
  onLinkClick?: (href: string) => void;
  selectable?: boolean;  // 默认 true；传递给渲染的文本/代码/表格单元格
}

interface MarkdownTheme {        // 全部可选；显示默认值
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

使用 **`marked`（v18，GFM）** 将 Markdown 解析为垂直 `Stack`（`content`，间距 16）下的 VMT 子树。支持的 token：标题（h1–h6，按比例缩放）、段落（单词换行的 `RichText`）、围栏代码块（带关键词高亮的 `CodeBlock`）、块引用（左侧强调条）、有序/无序列表、水平分隔线、行内代码、链接——以及 **GFM 表格**（通过 `Table` 组件渲染；GFM 表格支持于 0.1.1 添加）。`content.width`/`height` 决定了组件的尺寸。

两个内容更新路径——**选择正确的路径对流式输出至关重要：**

- `setContent(markdown): this` — **完全重建**：拆卸所有子节点并从头重新渲染。用于一次性/替换。
- `appendMarkdown(chunk): this` — **正确的流式/token 路径**。追加到原始缓冲区，重新词法分析完整的 Markdown 源代码，按原始源进行 token 差异比较，复用未更改的前缀实体，并通过 `RichText.setSpans` 就地更新最后一个（增长的）段落。它避免了完整的实体树重建，但词法分析仍然随文档长度扩展。
- `setSelectable(selectable): this` — 更新现有的文本/代码/表格后代，并成为未来流式节点的默认设置。

> 陷阱：**不要**通过在每个 token 上调用 `setContent(fullSoFar)` 来流式输出。这会在每个 token 时重建整个树（每个 token O(文档)），并使布局成本随文档增长。只将新的增量内容提供给 `appendMarkdown(chunk)`。

```ts
const md = new Markdown('', { maxWidth: 600 });
scene.add(md.setPosition(40, 40));
for await (const token of llmStream) md.appendMarkdown(token); // 复用未更改的已渲染前缀
```

### `CodeBlock`

```ts
new CodeBlock(code: string, lang: string, maxWidth: number, theme: Required<MarkdownTheme>, selectable = true)
```

围栏代码的单个自渲染叶子节点：圆角背景 + 每行、每段的彩色文本（对 `js`/`ts`/`py`/`rust` 及别名进行关键词/字符串/注释/数字高亮）。取代了旧的每行/每段子实体爆炸，改为一个扁平叶子节点。**装饰性**——`isPointInside()` 始终返回 `false`。

- `setCode(code, lang?): this` — 重新解析内容（例如实时编辑）。
- `setSelectable(selectable): this` — 切换精确源代码内容投影。

UI 1.9 在逐字形的 Canvas 绘制和语义投影之间共享 Core 1.8 的 `PreparedContentGrid`。因此，制表符、宽 CJK/emoji、阿拉伯文字形塑造、bidi、Firefox 字体替换、DPR/缩放和仿射变换保持同一个源感知几何方案。

注意：`theme` 必须是一个完全解析的 `Required<MarkdownTheme>`。实践中，`CodeBlock` 由 `Markdown` 内部生成；只有在你提供完整主题时才直接构造它。

### `Table`

```ts
new Table(opts: TableOptions)

interface TableOptions {
  headers: (string | Entity)[];     // 必填；Entity 实例必须唯一
  rows: (string | Entity)[][];      // 必填（二维行 × 列）
  colWidths?: number[];       // 每列宽度 px；必须与 headers.length 匹配，否则均匀分布
  width?: number;             // 总宽度，默认 600
  rowHeight?: number;         // 默认 36
  bg?: string;                // 默认 'rgba(15, 15, 25, 0.4)'
  headerBg?: string;          // 默认 'rgba(255, 255, 255, 0.08)'
  borderColor?: string;       // 默认 'rgba(255, 255, 255, 0.15)'
  headerTextColor?: string;   // 默认 '#ffffff'
  textColor?: string;         // 默认 '#e2e8f0'
  font?: string;              // 默认 '14px sans-serif'
  selectable?: boolean;       // 原生单元格文本选择，默认 true
}
```

Canvas 原生数据表格：字符串单元格成为 `Text` 子实体，`Entity` 单元格通过公共 `setMaxWidth()` 进行约束，`layout()` 在仅绘制的 `render()` 传递之前解析换行、行高和位置。在更改外部单元格内容后调用 `layout()`。每个单元格拥有一个内容投影。A11y：为辅助技术投影 `{ role: 'grid', label: '包含 N 列 M 行的数据表。' }`。同时也是 `Markdown` 内部 GFM 表格的渲染器。

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

一个互斥的 radio 选择组，投影 `{ role: 'radiogroup' }`；应用程序仍应验证标签和键盘/焦点行为。标准化的 `'change'` 事件负载携带 `{ value }`。

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

标签选择容器。自动挂载活动标签的内容视图并在剩余空间内进行平移。为可访问性投影 `{ role: 'tablist' }`。标准化的 `'change'` 事件负载携带 `{ value }`。

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

显示进度的进度条。提供居中文本选项。为可访问性投影 `{ role: 'progressbar', value }`。

- `setValue(value: number): void` — 更新值，带有安全的边界检查。

---

### `Overlay`

```ts
new Overlay(opts: OverlayOptions)

interface OverlayOptions {
  target: Entity;
  content: Entity;
  placement?: Placement; // 'top' | 'bottom' | 'left' | 'right' | 'top-start' | 等
  offset?: number;       // 距离（px），默认 8
  autoFlip?: boolean;    // 如果超出视口边界则自动调整方向
}
```

浮动定位层引擎。本身不投影可访问性节点。

---

### `Tooltip`

```ts
new Tooltip(opts: TooltipOptions)

interface TooltipOptions {
  target: Entity;
  content: string;
  placement?: Placement;
  delay?: number; // 显示前等待的毫秒数，默认 300
}
```

浮动悬停工具提示辅助组件。在悬停时，相对于目标投影工具提示容器。

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

浮动点击弹出面板。点击目标显示弹出面板，点击外部自动隐藏。

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

右键点击触发的菜单组件。支持图标、快捷键、分隔线和递归子菜单。

- `showAtPoint(x: number, y: number): void` — 在全局屏幕位置显示菜单。

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

为高性能渲染优化的滚动列表容器。仅实例化/渲染当前在视口边界内的项目。

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

嵌套树导航器。支持同步子数组或异步懒加载函数解析器。

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

可调整大小的拆分面板系统。

---

## 快速索引

| 组件          | 构造函数                        | 影子节点 / 角色                |
| ------------- | ------------------------------- | ------------------------------ |
| `Text`        | `(text, opts?)`                 | `div`（名称 = text）           |
| `RichText`    | `(spans, opts?)`                | `div` + 每链接 `<a>` 热点      |
| `Button`      | `(label, opts?)`                | `button` role=button           |
| `Link`        | `(label, opts)`                 | `a[href]`                      |
| `Image`       | `(src, opts)`                   | `img[src,alt]`                 |
| `Card`        | `(opts)`                        | 无，或 role=group 带 `label`   |
| `Stack`       | `(opts?)`                       | 无（结构性）                   |
| `Flow`        | `(opts?)`                       | 无（结构性）                   |
| `Input`       | `(opts)`                        | 透明 `input`                   |
| `TextArea`    | `(opts)`                        | 透明 `textarea`                |
| `Checkbox`    | `(opts)`                        | `input[type=checkbox]`         |
| `Toggle`      | `(opts)`                        | role=switch                    |
| `Slider`      | `(props?)`                      | role=slider                    |
| `Dropdown`    | `(options, props?)`             | role=combobox + listbox/option |
| `RadioGroup`  | `(opts)`                        | role=radiogroup                |
| `Tabs`        | `(opts)`                        | role=tablist                   |
| `ProgressBar` | `(opts?)`                       | role=progressbar               |
| `Overlay`     | `(opts)`                        | 无（结构性）                   |
| `Tooltip`     | `(opts)`                        | tooltip                        |
| `Popover`     | `(opts)`                        | popover 面板                   |
| `ContextMenu` | `(opts)`                        | 上下文菜单列表                 |
| `VirtualList` | `(opts)`                        | 视口滚动                       |
| `TreeView`    | `(opts)`                        | 树节点视图                     |
| `PanelGroup`  | `(opts)`                        | 可调整大小的分组               |
| `ScrollView`  | `(opts)`                        | 内容视口                       |
| `Modal`       | `(title, props?)`               | 覆盖层（背景 + 卡片）          |
| `Markdown`    | `(text, opts?)`                 | 上述组件的子树                 |
| `CodeBlock`   | `(code, lang, maxWidth, theme)` | 无（装饰性）                   |
| `Table`       | `(opts)`                        | role=grid                      |

> `Slider`、`Dropdown` 和 `Modal` 在已发布的 `.d.ts` 中接受松散类型 (`any`) 的 props；上面的选项表来自其源代码构造函数，是准确的合约。
