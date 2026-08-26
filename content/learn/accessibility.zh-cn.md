+++
title = "无障碍与自动化"
description = "VectoJS如何为屏幕阅读器、键盘用户和Playwright自动化将语义DOM投影到Canvas内容之上。"
weight = 15
+++

# 无障碍与自动化

Canvas和WebGL像素本身不携带任何语义信息。对于符合条件的交互实体，VectoJS在其`a11yRoot`覆盖层中维护一个真实的、不可见的DOM元素。屏幕阅读器、键盘导航和自动化工具可以与这些元素交互，而canvas支持的图层提供视觉内容。这是一个投影层，而不是浏览器的影子DOM API，应用程序仍然负责正确的语义和测试。

## 影子DOM投影的工作原理

当一个实体设置了`interactive = true`（并且有非零的盒子）时，`Scene`会创建一个真实的HTML元素 —— `<button>`、`<input>`、`<a>`等 —— 并使用绝对CSS将其定位在canvas上方。该元素的`opacity: 0`且`pointer-events: auto`，因此对眼睛不可见，但对无障碍工具完全可用。

<figure>
  <img src="/images/shadow-dom-layers.svg" alt="图示展示三个堆叠层：z-index 0的canvas层带有GPU渲染的组件，z-index 9的DOM门户层，以及z-index 10的A11y影子层，包含透明的真实DOM元素如button和input。一个指针光标箭头首先击中顶层。" class="diagram" />
  <figcaption>canvas父元素中的三个层。只有a11y层有<code>pointer-events: auto</code>，因此点击在到达canvas之前先击中真实的影子元素。</figcaption>
</figure>

a11y层位于canvas的父`<div>`中，`Scene`会自动强制该元素设置`position: relative`。

在每个渲染帧上（由`a11ySyncInterval`节流），Scene：

1. 读取每个交互实体的`getA11yAttributes()`。
2. 创建或更新对应的影子节点（通过脏检查最小化DOM写入）。
3. 应用实体的完整世界仿射矩阵和局部`width × height`；投影根将逻辑场景坐标映射到canvas CSS盒子。

支持canvas偏移和非均匀CSS缩放。不要在canvas的任意CSS旋转/倾斜下假设对齐；在实际页面上使用`debugA11y`验证。

> [!NOTE]
> 同步**永远不会在一帧中修剪**。如果你的代码频繁添加和移除交互子实体，在丢弃它们之前调用`scene.detachA11y(entity)`，否则它们的影子节点会泄漏。`scene.remove(entity)`会递归且安全地修剪。

## 选择加入：`entity.interactive`

```typescript
entity.interactive = true; // 启用影子节点 + 指针/键盘事件
entity.width = 120;
entity.height = 40; // 仅当 width > 0 时创建影子节点
```

设置`interactive = true`有一个副作用：它会标记`a11yNeedsReorder`并调用`scene.markDirty()`。

## 控制影子节点：`getA11yAttributes()`

重写`getA11yAttributes()`以指定元素类型、ARIA角色和语义状态：

```typescript
import type { A11yAttributes } from '@vectojs/core';

class AccessibleBtn extends Entity {
  label = 'Submit';

  getA11yAttributes(): A11yAttributes {
    return {
      tag: 'button',
      role: 'button',
      label: this.label,
    };
  }
}
```

完整接口：

```typescript
interface A11yAttributes {
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea'; // 默认：'div'
  role?: string; // ARIA角色（例如'switch'、'slider'、'combobox'）
  label?: string; // aria-label / 可访问名称
  tabIndex?: number; // 非控件键盘区域的显式焦点顺序
  href?: string; // 用于tag='a' —— 使其成为真实链接
  src?: string; // 用于tag='img'
  alt?: string; // 用于tag='img'
  inputType?: string; // 用于tag='input' —— 'text'、'checkbox'等
  placeholder?: string; // input/textarea占位符
  value?: string; // input/textarea当前值
  checked?: boolean; // input[type=checkbox] 或 aria-checked（用于role=switch）
  disabled?: boolean;
  expanded?: boolean; // aria-expanded（用于组合框、披露组件）
  controls?: string; // aria-controls（指向另一个元素的id）
  haspopup?: string; // aria-haspopup
  selected?: boolean; // aria-selected（用于列表框选项）
  activedescendant?: string; // aria-activedescendant（用于复合微件）
  valuemin?: string; // aria-valuemin（用于滑块、仪表）
  valuemax?: string; // aria-valuemax

  // 与其他节点的关系和命名
  labelledby?: string; // aria-labelledby
  describedby?: string; // aria-describedby —— 提示/错误文本

  // 验证状态（canvas表单可被播报的唯一方式）
  required?: boolean; // aria-required
  invalid?: boolean; // aria-invalid —— 注意false表示"显式有效"

  // 结构与对话框
  level?: number; // aria-level（标题、树项目）
  ariaModal?: 'true' | 'false'; // role="dialog"上的aria-modal

  // 实时区域 —— 在不移动焦点的情况下播报流式更新
  live?: 'off' | 'polite' | 'assertive';
  atomic?: boolean; // aria-atomic —— 读取整个区域，而非差异
  relevant?: string; // aria-relevant —— 例如'additions text'

  // 指针表面
  pointerEvents?: 'auto' | 'none'; // 'none'用于结构性/仅覆盖节点

  target?: string; // 用于tag='a'
  textInputStyle?: TextInputStyle; // 原生编辑器排版
}
```

将字段返回`undefined`会**移除**该属性，因此停止应用的状态会消失而不是变为陈旧。

对于不是按钮或表单控件但必须拥有键盘快捷键的canvas工作区，使用显式的`tabIndex: 0`：

```typescript
getA11yAttributes(): A11yAttributes {
  return { role: 'region', label: '设计画布', tabIndex: 0 };
}
```

让原生输入框、文本区域和可编辑内容掌管它们的编辑快捷键。Scene在属性变化时刷新显式的tab索引。

### 内置组件的投影

| 组件              | 影子元素                                   | 关键ARIA属性                                              |
| ----------------- | ------------------------------------------ | --------------------------------------------------------- |
| `Button`          | `<button>`                                 | `role="button"`、`aria-label`                             |
| `Link`            | `<a href>`                                 | 原生链接、`aria-label`                                    |
| `Image`           | `<img>`                                    | `src`、`alt`                                              |
| `Input`           | `<input type="text">`                      | `placeholder`、`value`（实时）                            |
| `TextArea`        | `<textarea>`                               | `placeholder`、`value`（实时）                            |
| `Checkbox`        | `<input type="checkbox">`                  | `checked`（实时）、`aria-label`                           |
| `Toggle`          | `<div role="switch">`                      | `aria-checked`（实时）、`aria-label`                      |
| `Slider`          | `<div role="slider">`                      | `aria-valuenow/min/max`（实时）                           |
| `Dropdown`        | `<div role="combobox">`                    | `aria-expanded`、`aria-controls`、菜单项为`role="option"` |
| `Card`（带label） | `<div role="group">`                       | `aria-label`                                              |
| `Table`           | `grid` › `row` › `gridcell`/`columnheader` | 浮动tab索引，2D方向键，Ctrl+Home/End                      |
| `TreeView`        | 每行一个`treeitem`                         | `aria-level`/`expanded`/`selected`，方向键展开/折叠       |
| `ContextMenu`     | 每项一个`menuitem`                         | `aria-haspopup`/`expanded`，方向键循环，Escape关闭        |
| `RadioGroup`      | 每选项一个`radio`                          | `aria-checked`，方向键移动+选择                           |
| `Tabs`            | 每标签页一个`tab`                          | `aria-selected`，方向键移动，Home/End                     |
| `Text`            | `<div>`                                    | `aria-label` = 文本内容                                   |

## 复合微件：一个标签页停止，方向键在内部操作 {#fu-he-wei-jian-yi-ge-biao-qian-ye-ting-zhi-fang-xiang-jian-zai-nei-bu-cao-zuo}

树、网格、菜单、单选组或标签列表不得将每个子元素放入标签页顺序中。VectoJS在每个**可见**子元素上方池化一个透明的可聚焦热点，携带该子元素的角色和状态，并恰好为其中一个赋予`tabIndex: 0` —— **浮动tab索引**。父元素拥有方向键处理器并移动停止点。参见上表了解每个组件的按键，以及[复合微件](/reference/core-a11y/#fu-he-zu-jian-man-you-tabindex)了解你自己构建时的模式。

重用该模式而不是发明一个：重要的细微之处是当某些底层元素拥有鼠标时（可选单元格文本、拖动滚动、canvas命中处理），热点必须设置`pointerEvents: 'none'`。键盘焦点和AT合成的`click`仍然可以通过它工作。

标签页顺序遵循**视觉**阅读顺序，而不是你添加实体的顺序。对于RTL UI，在Scene上设置`readingDirection: 'rtl'`，以便每行内的内联顺序也会反转。

## 强制颜色（Windows高对比度）

`<canvas>`是不透明像素，因此浏览器的`forced-colors`重映射永远不会到达你绘制的任何内容 —— 主题控件保持低对比度且不可读，除非它自行重绘。读取`scene.forcedColors`并使用CSS系统颜色绘制；当操作系统设置切换时，场景会自动重绘：

```typescript
render(r: IRenderer) {
  const forced = this.scene?.forcedColors ?? false;
  r.beginPath();
  r.roundRect(0, 0, this.width, this.height, 8);
  r.fill(forced ? 'ButtonFace' : this.bg);
  if (forced) r.stroke('ButtonText', 1);       // 给形状一个边缘
  r.fillText(this.label, x, y, this.font, forced ? 'ButtonText' : this.color);
}
```

`Button`已经这样做了。使用`Highlight`表示选择/焦点，`Canvas`/`CanvasText`表示表面和正文文本。

## 支持IME的输入字段

`Input`和`TextArea`使用**真实的、透明的影子`<input>`/`<textarea>`元素**进行文本输入。这意味着：

- IME输入法组合（中文、日文、韩文、阿拉伯文）原生工作 —— 浏览器处理候选窗口。
- 文本选择、剪贴板（剪切/复制/粘贴）、撤销/重做都是原生的。
- Canvas是一个**纯粹的视觉镜像**：它从`change`事件读取`value`、`selectionStart`、`selectionEnd`和`composition`，并绘制光标、选择高亮和IME下划线。

当输入框聚焦时，同步避免写回相同的用户同步值。如果应用状态提供了真正不同的值，则会应用该值；因此受控组件在替换文本时应有意保留选择状态。

## 静态内容投影

交互控件投影a11y节点。静态内容投影覆盖非交互侧：渲染静态文本的实体通过`getContentProjection()`暴露它，Scene将其镜像为**透明的、位置同步的DOM节点**覆盖在绘制的字形上。屏幕阅读器、Ctrl+F、爬虫和翻译扩展随后可以看到在canvas上视觉渲染的文本。

```typescript
// 内置：TextEntity和MSDFTextEntity暴露内容。Text、RichText、
// Markdown、围栏CodeBlock和表格单元格文本默认可选中。

// 自定义实体同样选择加入：
class Caption extends Entity {
  label = '在Canvas上渲染，被Ctrl+F发现';
  getContentProjection() {
    return { text: this.label, font: '16px sans-serif' };
  }
  // ……render()绘制相同的字符串……
}
```

这解锁了以下功能，无需额外工作：

- **页面内查找** —— Ctrl+F匹配；浏览器的高亮框渲染在透明字形后面。
- **屏幕阅读器和爬虫** 按源顺序读取真实文本。
- **翻译扩展和阅读器模式** 操作在投影层上。
- **`#:~:text=`** 片段链接解析。
- **原生鼠标选择** —— 每个自定义实体通过`selectable: true`选择加入（`::selection`高亮绘制在透明字形后面）。核心投影默认关闭，以免任意文本拦截canvas输入。UI Text/RichText/Markdown/Table内容默认可选中，并暴露`setSelectable(boolean)`。

对于像素精确的选择，将Canvas基线作为真实来源：对单次运行使用`baseline`（和`contentX`/`contentY`），或对换行、嵌入或混合大小的文本使用显式视觉`lines`。Core 1.8通过变换映射这些局部坐标，并为每个投影行赋予相同的CSS行盒。在视觉行的逻辑源以换行符或保留的软换行分隔符结尾时，设置`separatorAfter`。Scene将该分隔符合并到该行的最终文本节点中，以便Firefox不会将多行选择的一部分放在投影根处。`text`仍然是权威的逻辑Unicode源；切勿替换成成形的视觉字形顺序。不要通过页面级CSS偏移来补偿。

可选择的普通文本、显式视觉行和无行自定义投影在变换后的二维几何中解析合法字素光标。旋转、镜像变换、非均匀缩放、分数DPR和浏览器缩放不会将指针路由减少为视口X。类似代码的实体应额外在Canvas绘制和`ContentProjection.grid`之间共享`prepareContentGrid()`的结果；这使得制表符、emoji/ZWJ、CJK宽度、阿拉伯文、双向、剪贴板源和选择几何保持在同一个保留方案上。

对于原生`Input`/`TextArea`实现，通过`getA11yAttributes()`暴露`textInputStyle: { font, lineHeight, padding }`。Scene将其应用于`box-sizing: border-box`的透明编辑器，而canvas应从相同的padding和行盒基线绘制。

注意事项：

- 投影是**视口和裁剪惰性的**：完全在Scene或`clipChildren`祖先之外的文本设置为`display: none`，不能拦截输入。
- 动态投影重新排序以匹配VMT源顺序；移除子树会移除每个后代投影。
- 当实体也是`interactive`时，其文本副本设置为`aria-hidden`，以免屏幕阅读器重复播报。
- 对于纯装饰性场景，使用`new Scene(canvas, { contentProjection: false })`禁用整个层。
- 浏览器查找覆盖已物化的内容。它无法搜索应用程序尚未挂载的虚拟化实体。
- 当`window.getSelection()?.isCollapsed === false`时，全局快捷键路由必须让位给原生复制，并且除非应用程序有意替换浏览器查找，否则不得抑制Ctrl/Command+F。

## `debugA11y`选项

在`SceneOptions`中启用`debugA11y: true`使影子节点在开发期间可见 —— 它们以蓝色虚线轮廓显示：

```typescript
const scene = new Scene(canvas, { debugA11y: true });
```

打开浏览器DevTools → Elements，你将看到实际的`<button>`、`<input>`和`<a>`元素定位在canvas上方。这是验证角色、标签和位置是否正确的最快方法。

## `a11yFullViewport` —— 无边界表面

某些实体覆盖整个Scene视口（无限画布、手势识别器、背景点击陷阱）。它们没有有意义的边界框。设置`a11yFullViewport = true`以投影一个跟随canvas CSS盒的场景大小影子节点：

```typescript
class PanGesture extends Entity {
  constructor() {
    super();
    this.interactive = true;
    this.a11yFullViewport = true; // 不需要width/height
  }

  getA11yAttributes() {
    return { role: 'application', label: '平移和缩放画布' };
  }
}
```

全视口节点挂载在**所有其他影子节点之后**，因此任何上层组件（按钮、输入）保持可点击。

## `a11ySyncInterval` —— 动画期间的节流

默认情况下，影子DOM在每个渲染帧上同步。对于有大量动画和许多交互实体的UI，同步可能主导帧时间。通过以下方式节流：

```typescript
const scene = new Scene(canvas, { a11ySyncInterval: 100 });
// 动画期间影子DOM最多每100ms更新一次
```

间隔在动画运行时保持有效，Scene在待处理的运动平息后安排最终追赶同步。它不会在整段动画期间冻结语义层。

节流以陈旧性换取成本，并且它不会减少每次同步的工作量。如果你的问题是实体数量而非同步频率，请参阅下一节。

## 成本与交互实体数量成超线性关系

投影对UI来说很便宜，但对大量元素来说很昂贵。在真实硬件上测量（RTX 4060笔记本，实体每帧移动，每个实体投影一个元素）：

| 交互实体数量 | Chrome 每帧 | Firefox 每帧 |
| ------------ | ----------- | ------------ |
| 1,000        | 6.4ms       | 7.4ms        |
| 5,000        | 59.5ms      | 114ms        |
| 20,000       | 715ms       | 2737ms       |

每个实体从1,000到20,000，在Chrome上从6.4变为35.7µs，在Firefox上从7.4变为136.9µs —— 随着数量增长，每个实体的成本变得更**糟**，因为开销来自每个元素的DOM写入、阅读顺序排序以及浏览器自身的无障碍树重建，所有这些都随元素数量而退化。树遍历本身可以忽略不计（约0.005µs/实体）。

实际规则：`interactive = true`适用于用户与之交互的内容。它不是让成千上万个装饰性或临时对象可点击测试的方式。

对于粒子场、弹幕层或精灵群，请优先选择以下之一：

- **投影容器，而非成员。** 整个层使用一个交互实体，通过`aria-label`集体描述它（如"5,000个粒子"），并通过`scene.findEntityAt(x, y)`自行处理指针输入 —— 它无论实体是否为`interactive`都能解析实体，因此点击测试不需要投影。
- **只投影可触及的内容。** 虚拟化`TreeView`/`Table`使用的池化模式将热点池大小调整为可见行而不是整个数据集，因此投影保持O(视口)。参见[复合微件](#fu-he-wei-jian-yi-ge-biao-qian-ye-ting-zhi-fang-xiang-jian-zai-nei-bu-cao-zuo)。
- **当实体停止可操作时，调用`scene.detachA11y(entity)`。** 在别处记录为泄漏避免，它同样是一个成本杠杆：每帧同步创建和更新但从不修剪。

每个实体的 `a11yProjection` 模式（`'eager' | 'onDemand' | 'never'`，默认为 `'eager'`）控制实体的影子节点何时被具体化；相关测量数据和 API 在 [`core-a11y`](/reference/core-a11y/#gao-shi-ti-shu-liang-xia-de-tou-ying-kai-xiao-1-30-0) 中有文档说明。请注意，它无法以"是否存在屏幕阅读器"为依据 —— 这出于设计（W3C TAG 设计原则 2.7）是刻意无法检测的，而且出于隐私原因，AOM 虚拟无障碍节点在所有引擎中都被阻止。

## 以编程方式检查影子树

```typescript
// 获取所有投影影子节点的嵌套快照
const tree = scene.getA11yTree();
// 返回：A11yTreeNode[] — { id, tag, role, label, value, children, ... }

// 获取特定实体的实际HTMLElement
const el = scene.getA11yElement(entity.id);
el?.focus(); // 以编程方式聚焦影子节点
```

## Playwright集成

因为每个交互实体投影一个真实的DOM元素，标准的Playwright选择器无需任何特殊适配器即可工作：

```typescript
import { test, expect } from '@playwright/test';

test('切换开关控制物理引擎', async ({ page }) => {
  await page.goto('/demos/nexus');

  // 可以工作，因为Toggle投影了一个<div role="switch" aria-label="Physics">
  const toggle = page.getByRole('switch', { name: 'Physics' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
});

test('搜索输入过滤结果', async ({ page }) => {
  await page.goto('/');

  // Input投影了一个真实的<input type="text" placeholder="Search…">
  await page.getByPlaceholder('Search…').fill('spring');
  await expect(page.getByRole('option')).toHaveCount(3);
});

test('按钮可通过键盘访问', async ({ page }) => {
  await page.goto('/demos/chat');

  // Tab到按钮，按Enter
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
});
```

### 按`data-vecto-id`选择

每个影子节点携带一个等于`entity.id`的`data-vecto-id`属性。对于在标签文本更改后仍能稳定的选择器：

```typescript
const entity = new Button('Submit');
entity.id = 'submit-btn'; // 或在构造函数中通过super设置id

// 在Playwright中：
await page.locator('[data-vecto-id="submit-btn"]').click();
```

## 屏幕阅读器测试清单

- [ ] 每个交互实体都有`interactive = true`和非零的盒子。
- [ ] `getA11yAttributes()`返回有意义的`tag`和`label`。
- [ ] `Input`/`TextArea`有`placeholder`（用作`aria-label`）。
- [ ] `Checkbox`/`Toggle`的`checked`状态在`getA11yAttributes()`中实时反映。
- [ ] `Slider`在每个渲染上设置了`valuemin`、`valuemax`和`value`。
- [ ] `Card`组在代表逻辑区域时有`label`。
- [ ] Tab顺序合理（影子节点按DOM顺序定位，与添加顺序一致）。
- [ ] 运行`scene.getA11yTree()`并检查输出以发现缺失的标签。
- [ ] 启用`debugA11y: true`并目视验证节点位置与canvas组件匹配。

## 故障排除

### 影子节点位置偏离canvas组件

两个常见原因：

1. **canvas父元素未设置`position: relative`** —— `Scene`在每帧自动设置，但具有更高特异性的CSS规则强制`position: static`会覆盖它。检查canvas父元素的计算样式。
2. **canvas父元素上的CSS `transform`** —— 影子节点的绝对定位是相对于最近的有定位祖先，但`transform`会创建新的层叠上下文，可能导致偏移。将`transform`移到canvas元素本身，而不是父元素。

如果你之前使用`a11yOffsetX` / `a11yOffsetY`作为变通方法，请移除它们并改为修复底层的定位问题。

### Playwright的`getByRole()`找不到任何东西

检查以下内容：

1. `entity.interactive`必须为`true`且`entity.width > 0`。
2. `getA11yAttributes()`必须返回正确的`tag`和`role`。要使`page.getByRole('button')`工作，标签必须是`'button'`或角色必须是`'button'`。
3. 标签必须匹配：`page.getByRole('button', { name: 'Submit' })`需要在属性中有`label: 'Submit'`。
4. 场景必须已调用`start()` —— a11y同步发生在渲染循环期间。

使用`scene.getA11yTree()`打印当前投影的快照：

```typescript
console.log(JSON.stringify(scene.getA11yTree(), null, 2));
```

### `scene.getA11yTree()`返回空数组

a11y树只有在`scene.start()`运行了至少一帧后才被填充。如果你在构造后同步调用`getA11yTree()`，它将为空。将其包装在`setTimeout`中或在用户交互后检查。

同时验证是否设置了`entity.interactive = true` —— 没有`interactive`的实体永远不会被投影。

> **下一步：** [UI组件](/learn/ui-components/) —— 全套现成的交互组件。
