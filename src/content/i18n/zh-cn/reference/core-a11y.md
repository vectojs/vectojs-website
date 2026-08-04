---
title: 'a11yRoot 与智能体约定'
description: '每个可交互 Entity 如何将一个透明的 ARIA 影子节点投影到 DOM 中 —— A11yAttributes 的形状、canvas 性能与 DOM 级无障碍的约定，以及导致陈旧或缺失影子节点的同步陷阱。'
order: 10
---

# a11yRoot 与智能体约定

属于 [`@vectojs/core`](/reference/core-api/)。

每个拥有盒子的可交互实体都会将一个**透明的 ARIA 影子节点**投影到 Scene 的 `a11yRoot` div 中（位于 canvas 之上，`pointerEvents:auto` 以便自动化/AT 可以交互；除非 `debugA11y`，否则 `opacity:0`）。每个节点携带 `id` + `data-vecto-id`，外加来自 [`Entity.getA11yAttributes()`](/reference/core-entity/#a11y--批处理钩子覆盖以选入) 的角色/标签/状态。

投影根跟踪 canvas 的 CSS 盒：canvas 偏移和非均匀 CSS 缩放会应用到影子层和 DOM 门户层，而实体几何仍保持在逻辑 Scene 坐标中。canvas 的任意 CSS 旋转/倾斜不属于此映射。

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

每个字段都会在每帧通过脏检查投影到真实属性上。返回 `undefined` 会**移除**属性，因此不再适用的状态会消失而不是变得陈旧——注意 `false` 与 `undefined` 在此不同（`aria-invalid="false"` 表示"显式有效"且会被保留）。

同步将这些应用到一个真实元素（一个真正的 `<button>`、`<a href>`、`<img>`、带 IME 感知的 `change`/`focus`/`blur` 的 `<input>`/`<textarea>` 等）。这就是"**canvas 性能与 DOM 级无障碍**"的故事：视觉 100% 由 GPU/canvas 完成，而 Playwright/智能体的 `getByRole('button', { name })` 会解析影子节点并点击它。

## 焦点顺序

非原生可聚焦的交互角色（`button`、`switch`、`checkbox`、`link`、`slider` 等）会获得 `tabindex="0"` 以及 Enter/Space → `click`。

**复合组件有所不同。** `tree`、`grid`、`menu`、`radiogroup` 或 `tablist` 是一个标签停靠点，而不是每个子元素一个——因此它们的子元素使用**漫游 tabindex**：恰好一个子元素携带 `tabIndex: 0`，其余为 `-1`，方向键移动该停靠点。参见[复合组件](#复合组件漫游-tabindex)。

标签顺序遵循**视觉**阅读顺序，而非场景图插入顺序——参见 [`Scene.readingDirection`](/reference/core-scene/#无障碍与外观) 了解 RTL。

当非控件区域（如设计 canvas）必须进入顺序焦点顺序并接收 VMT `keydown` 事件时，显式设置 `tabIndex: 0`。仅用于程序化聚焦时使用 `-1`；返回 `undefined` 会移除显式值。

## 复合组件（漫游 tabindex）

树、网格、菜单、单选按钮组或标签列表必须为每个子元素暴露**一个角色**，而不仅仅是容器角色——否则 AT 看到的是一个不透明的方框。VectoJS 通过在每个可见子元素上方汇集一个透明的、可聚焦的子实体（"热点"）来实现：它携带子元素的 `role` + 状态 + 漫游 `tabIndex`，不渲染任何内容，父元素拥有键盘处理程序。

关键的是，这些热点设置 `pointerEvents: 'none'`。底层组件已经拥有鼠标（点击切换、拖动滚动、可选择的单元格文本），因此热点不能拦截它——键盘焦点和 AT 合成的 `click` 仍然可以通过 `pointer-events:none` 元素工作。

| 组件          | 子角色                                                         | 键盘操作                                                                                                        |
| ------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `TreeView`    | `treeitem`（+ `aria-level`、`aria-expanded`、`aria-selected`） | 上/下移动 · 右展开然后进入 · 左折叠然后回到父级 · Home/End · Enter/Space 激活                                   |
| `Table`       | `row` › `gridcell` / `columnheader`                            | 方向键二维移动（header 为 row −1）· Home/End 行极值 · Ctrl+Home/Ctrl+End 网格角落                               |
| `ContextMenu` | `menuitem`（+ `aria-haspopup`、`aria-expanded`）               | 上/下循环并跳过分隔符 + 禁用项 · Home/End · Right 打开子菜单 · Left 返回父菜单 · Enter/Space 激活 · Escape 关闭 |
| `RadioGroup`  | `radio`（+ `aria-checked`）                                    | 方向键移动并选择 · Home/End · Space 选择                                                                        |
| `Tabs`        | `tab`（+ `aria-selected`）                                     | 方向键移动 · Home/End · Space/Enter 激活                                                                        |

只有可见子元素被汇集，因此虚拟化的 `TreeView` 或 `Table` 投影 O(viewport) 个热点，而非数据集中每行一个。聚焦的行/单元格在焦点移动到它之前会滚动到视图中。

## 强制颜色（高对比度）

canvas 是不透明像素，因此浏览器的 `forced-colors` 重映射永远不会触及 VectoJS 绘制的内容——在 Windows 高对比度下，主题控件会保持不可读，除非组件重新绘制自身。请参见 [`Scene.forcedColors`](/reference/core-scene/#无障碍与外观) 并使用 CSS 系统颜色（`ButtonFace`、`ButtonText`、`Highlight`、`Canvas`、`CanvasText`）绘制；当设置切换时场景会自动重绘。`Button` 已经这样做了。

## 高实体数量下的投影开销（`1.30.0+`）

每个拥有盒子的可交互实体只要保持可交互，就会获得一个影子节点。这对按钮是正确的，但对成千上万个转瞬即逝、单独看毫无意义的实体——粒子、弹幕评论、图节点——就是错误的：它每帧为每个实体产生一个 DOM 节点。

在 5,000 个运动的可交互实体上测得：

|                              | Chrome        | Firefox        |
| ---------------------------- | ------------- | -------------- |
| 每个实体都可交互             | 66.4 ms/frame | 114.7 ms/frame |
| `a11yProjection: 'onDemand'` | 2.23 ms       | 1.69 ms        |
| 完全没有影子节点             | 1.35 ms       | 1.75 ms        |

两个 eager 行连 60 Hz 的预算都达不到。`'onDemand'` 落在“什么都不投影”的下限上，同时每个实体仍可被单独访问。

`Entity.a11yProjection` 选择节点何时被物化：

```ts
particle.a11yProjection = 'onDemand';
```

- **`'eager'`**（默认）——实体处于可交互且有盒子时，节点即存在。行为不变；普通控件请保持原样。
- **`'onDemand'`**——只在实体**被使用**时才存在节点。用于高基数的可交互实体。
- **`'never'`**——完全没有节点。除非实体确实需要指针事件而不需要语义存在，否则优先使用 `interactive = false`。

### 什么算作被使用

三个信号，任一满足即可。刻意**不**采用单独的悬停：键盘或屏幕阅读器用户不产生指针事件，因此以悬停为门槛的节点会恰好对它本该服务的用户被扣留。

- **焦点。** 已获得焦点的节点永不被修剪，因此不会在交互过程中把焦点从用户手里抽走。
- **指针位于实体内部。**
- **一次显式请求**——见下文。

实体在整个过程中始终保持可在 canvas 上命中测试，因此点击总能到达它并将其提升。

```ts
// Keep the selected item projected for as long as it is selected.
scene.requestA11yProjection(selected);
scene.releaseA11yProjection(previous);
```

两者都接受一个 `Entity` 或 id 字符串，且是幂等的。释放不会立即移除节点——只要它仍处于焦点中或指针之下就会存留，并在下一次发现它未被使用的同步中被修剪。对 `'eager'` 实体两者都是空操作，因为它总是被投影。

对于只有应用自己知道其重要性的东西，请使用显式请求：一个选中项、一个搜索命中项、一个刚在实时区域中被播报的元素。

> [!IMPORTANT]
> 自身投影**可选中文本**的实体永远不会被指针提升。它的影子节点带有 `pointer-events: auto` 并叠放在透明的文本镜像之上，因此在指针下物化一个节点会吞掉 `mousedown`，原生拖拽选择将永远不会开始。焦点和显式请求仍然能到达它。这与使 [`Text`](/reference/ui-text/) 和 `RichText` 默认不可交互的冲突是同一个。

基数本身并不是动用 `'onDemand'` 的判据，而下面这种情形最容易被弄错：

> [!WARNING]
> **不要因为与粒子类比就把 `'onDemand'` 用在正文文本上。** 对于按钮或图节点，canvas 实体是主体，影子节点是临时的语义代理，因此在被使用前扣留它不会损失什么。而对于散文、Markdown 或聊天记录，canvas 位图对屏幕阅读器**完全不可读**，并且对非视觉用户而言**阅读就是首要交互**，而非偶尔为之的操作。文本实体默认不可交互，承载其语义的是[内容投影](/reference/core-renderer/#entitygetcontentprojection)——而不是影子节点；该投影按行虚拟化，并保持常驻。

另外，能被单独访问与能被理解并不是同一件事：

> [!NOTE]
> `'onDemand'` 本身并不构成完整的无障碍方案。一千条可被单独访问的弹幕，合起来仍然什么也没说。请把它与一个聚合的实时区域（`role: 'status'`、`a11yFullViewport`）以及一小池用于当前选择的常驻热点搭配使用，这样 DOM 节点数保持恒定，而不是随实体数量增长。

## 控件与陷阱

- 每个影子节点上的 `data-vecto-id` 镜像实体 `id` —— 这是自动化选择器的稳定句柄。
- `a11ySyncInterval`（参见 [`SceneOptions`](/reference/core-scene/#sceneoptions)）在动画期间节流同步，并确保在待定运动稳定后进行最终追赶；它不会在整个动画期间挂起所有同步。
- `debugA11y: true` 会显示节点（蓝色虚线）以供开发。
- `detachA11y(entity)` 修剪一个子树的影子节点而不移除实体；`remove()` 会自动修剪。每帧同步**创建/更新但从不修剪**，因此请显式管理交互式子元素的变动。
- `getA11yTree()` 返回一个嵌套的 `A11yTreeNode[]` 快照用于断言；`getA11yElement(id)` 获取特定的影子元素。
- `a11yFullViewport` 在所有其他元素之后挂载一个无边界的交互表面。
- 从 Core 1.11.1 起，新投影的交互实体会在创建影子节点的同一帧获得与画布绘制顺序一致的 `z-index`。因此，新覆盖层的背板会在第一次指针交互时就位于旧的设计控件之上，而不必等待下一次渲染。

参见[无障碍](/learn/accessibility/)了解用法和测试模式。

## 相关

[`Scene`](/reference/core-scene/)（`a11ySyncInterval`、`debugA11y`）·
[`Entity`](/reference/core-entity/)（`getA11yAttributes()`、`interactive`、`width`/`height`）·
[`@vectojs/core` 概述](/reference/core-api/)
