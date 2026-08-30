---
title: '03 — 语义投影与虚拟化'
description: '三层 DOM 生命周期——视觉、语义、交互——以及 VectoJS 如何仅物化可用的、窗口化可选择的，并保持游走焦点正确。'
order: 23
---

# 03 — 语义投影与虚拟化

VectoJS 渲染**零可见 DOM**。你所见皆为 canvas。屏幕阅读器、键盘用户或 Playwright 代理所触及的，是 `Scene.a11yRoot` 中**薄投影影子**（单个 `position:absolute`、位于 canvas 之上的 div，`packages/core/src/tree/Scene.ts:2390`）。该影子并非每实体一节点——而是三层生命周期，将代价约束于视口，同时让视口外文本仍可被查找与预读。

## 三层模型——一张图

```text
                      ┌─────────────────────────────────────┐
                      │        Virtual Math Tree (VMT)      │
                      │  Entity tree · worldMatrix · bounds │
                      │  packages/core/src/tree/Scene.ts    │
                      │  packages/core/src/tree/Entity.ts   │
                      └──────────────┬──────────────────────┘
                                     │  syncA11y + syncContentProjection
                                     │  (shared depth-first walk, every frame
                                     │   or throttled — see §2)
                 ┌───────────────────┼───────────────────┐
                 ▼                   ▼                   ▼
   ┌─────────────────────┐ ┌───────────────────┐ ┌─────────────────────┐
   │  Visual tier        │ │  Semantic tier    │ │  Interaction tier   │
   │  (always rendered)  │ │  (coarse, resident)│ │  (windowed, fine)  │
   │                     │ │                    │ │                     │
   │  Canvas2D / WebGL / │ │  One DOM node per  │ │  Per-line carriers  │
   │  WebGPU / SVG draws │ │  block holding its │ │  (spans per line /  │
   │  every entity that  │ │  full `text` so    │ │  spans per glyph    │
   │  passes culling.    │ │  find-in-page and  │ │  cluster when grid) │
   │  Subject to         │ │  read-ahead see    │ │  plus a11y mirrors  │
   │  `getRenderChild-   │ │  the whole doc.    │ │  (`button`, `grid-  │
   │  Range` /           │ │  Outside the       │ │  cell`, hotspots).   │
   │  viewportCullChild- │ │  interaction margin│ │  Only near-viewport │
   │  ren. No DOM cost.  │ │  carriers are NOT  │ │  materialized.      │
   └─────────────────────┘ │  built.            │ └─────────────────────┘
                           └───────────────────┘
        Pixels ─────────────►  `getContentProjection().text`  ─────────►  `lines` / `grid`
                              `SceneOptions.contentSemanticMargin`
                                                            `SceneOptions.contentProjectionMargin`
                                                            `SceneOptions.contentSemanticBudget`
```

为何需要两个边距？单一标量无法表达“每块都有 DOM 但仅视口附近块有载体”——有限值会完全释放带外块，而 `Infinity` 还会使每个载体非窗口化（`O(total glyphs)`）。见 `SceneOptions.contentSemanticMargin` vs `contentProjectionMargin`（`Scene.ts:328`、`336`、`359`）及 `vectojs-docs/forge/baselines/content-projection-frontload-findings.md:1` 中被否决枚举的理由。

| 层级           | 所在位置                                           | 受控于                                                                                  | 默认值                                                      |
| -------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 视觉           | canvas 后备存储                                    | `viewportCullChildren` + `getRenderChildRange`（`Entity.ts:788`、`1970`）               | 关闭剔除——按容器可选加入                                    |
| 语义（粗粒度） | 每块一个 `div`，`el.textContent = projection.text` | `contentSemanticMargin`——块是否拥有_任何_ DOM                                           | `contentProjectionMargin ?? Scene.height`（`Scene.ts:355`） |
| 交互（细粒度） | 按行 / 按单元载体 + 无障碍镜像                     | `contentProjectionMargin` + `projectionLineWindow`（`scene/content-line-window.ts:25`） | 一个视口高度                                                |

`contentSemanticBudget`（`Scene.ts:359`，`Scene.ts:600` 处 `DEFAULT_CONTENT_SEMANTIC_BUDGET = 256`）将一次性常驻层构建分摊到多帧——仅粗粒度块计入预算；交互带内的块无论预算立即物化。

## `syncA11y` 遍历如何工作——以及何时

`syncA11y` 并非“无障碍方法”。它是无障碍_与_内容投影的**共享深度优先遍历驱动**（`A11yProjectionManager.ts:30`、`ContentProjectionManager.ts:26`）。拆分它们需要 `DEC-0020`/`DEC-0022` 正因如此：递归点调用 `syncContentProjection`，而 `syncA11y` 初始化内容侧读取的四个每同步字段（`_syncSerial`、`contentSemanticBudgetLeft`、`contentSemanticDeferred`、`contentSelectionPresentThisSync`）。`DirtyTracker`（`scene/DirtyTracker.ts:33`）门控遍历是否运行；`a11ySyncInterval` 进一步节流而不破坏预算。

每帧（或节流到 `a11ySyncInterval`，`Scene.ts:263`）：

1. **收集 + 脏检查。**每个具有非零盒子（或 `a11yFullViewport`，`Entity.ts:912`）的 `interactive` 实体调用 `getA11yAttributes()`（`Entity.ts:1898`）。遍历同时读取 `interactive`、`a11yHidden`、`a11yProjection` 与 `a11yFullViewport`——隐藏祖先无论子标志如何都隐藏整个子树（见 § 焦点）。若 `getContentEpoch()`（`Entity.ts:2048`）未递增，未改变内容块完全跳过重建。epoch 是内容投影等价的 VMT 脏标记——廉价整数比较，无字符串 diff。`getContentProjection()` 返回 `null` 的实体完全不付出内容代价。
2. **创建 / 更新 / 重定位。**遍历创建影子元素（`a`/`button`/`img`/`input`/`textarea` 或 `div`，`A11yAttributes.tag` 位于 `Entity.ts:295`），以按属性脏检查应用每个 `A11yAttributes` 字段（返回 `undefined` 移除属性——`false` vs `undefined` 对 `aria-invalid` 重要），并经 `CanvasGeometry`（`scene/CanvasGeometry.ts:93`）从实体世界矩阵写入 `top`/`left`/`width`/`height`。映射 canvas 偏移与非均匀 CSS 缩放；不支持 canvas 父级的任意 CSS 旋转/倾斜。`A11yAttributes.level` / `posInSet` / `setSize` / `rowCount` / `rowIndex` 投影为 `aria-level` / `posinset` / `setsize` / `rowcount` / `rowindex`——为虚拟化列表/网格所需，使 AT 播报数据集大小而非窗口。
3. **排序 + 修剪。**`A11yProjectionManager.collect`（`A11yProjectionManager.ts:157`）取最近 `a11yRegion`/`clipChildren` 祖先作为元素的_区域_；`reorder`（`A11yProjectionManager.ts:178`）将 `normalElements` 按视觉阅读顺序带状排序（`sortNormalElementsVisually`，`A11yProjectionManager.ts:351`）并按 DOM 父级光标插入以保持复合嵌套（`grid > row > gridcell`）。被移动子树内的焦点与 `Selection` 端点各快照一次——按_重排_遍历而非按被移元素付出一次强制布局（`A11yProjectionManager.ts:230`）。本轮未收集的被修剪（`A11yProjectionManager.ts:169` 处 `isActive`）。`a11yNeedsReorder`（`Scene.ts:1381` / `A11yProjectionManager.ts:88`）是触发排序的标志。
4. **内容侧。**遍历在其递归点对每个 `getContentProjection()` 非空实体调用 `syncContentProjection`。盒测试（`projectionBoxVisible`）决定粗粒度 vs 释放；行带（`projectionLineWindow` / `projectionGridLineWindow`，`scene/content-line-window.ts:2`）决定幸存块的哪些行获得载体。网格块经 `ContentGridProjector.syncGrid`（`scene/ContentGridProjector.ts:69`）带按行签名使流式追加复用未变载体；非网格块使用 `el.replaceChildren()`。`ContentProjectionHint`（`Entity.ts:ContentProjectionHint`）让 Scene 告知实体实际需要的带，使 `getContentProjection` 可避免构建被丢弃行——建议性，忽略它永远正确。

### 生命周期钩子

`Entity.onMounted()` 在实体进入活动 Scene 时触发一次（`Entity.ts:add` / `_notifyMounted`）。需要知道何时分配的热点池可重写它；`remove(child)` 调用 `scene.detachA11y(child)`（`Entity.ts:remove`）并标记 `a11yNeedsReorder`。`Scene.detachA11y` 幂等——二次分离为无操作——因此在移除行前分离热点的 `Tabs`/`Table` 池清理即使实体已消失也安全。

### 预算与边距控制

三个旋钮，一份契约：

- `contentProjection: false` 禁用_整个_内容层（装饰性场景）。
- `contentProjectionMargin`（默认一个视口高度，`Scene.ts:328`）——交互窗口。有限 = 载体窗口化；`Infinity` = 每个载体物化（生产中禁止——`O(glyphs)`）。
- `contentSemanticMargin`——粗粒度门控。`Infinity` + 有限交互边距 = 每块拥有 `text` 供查找/预读而仅视口附近块付出载体代价。理想且期望的常驻层配置。无它同一 `Infinity` 也会使载体非窗口化。
- `contentSemanticBudget = 256`——每轮同步可物化的粗粒度块数。约束文档打开卡顿（实测约 0.03 ms 每块加上随常驻数增长的每轮基线）。可见块忽略预算。

该预算在下方记忆修复后经 `DEC-01KZ8DZE` 度量确定；见 `forge/baselines/content-projection-frontload-findings.md:Two approaches rejected`。

### 为何不是每 Entity 一 DOM

代价随投影节点数超线性增长。在真实硬件（RTX 4060 Laptop，移动实体，每实体一元素）上实测——`content/learn/accessibility.md:353`：

| 交互实体 | Chrome/帧 | Firefox/帧 |
| -------- | --------- | ---------- |
| 1,000    | 6.4 ms    | 7.4 ms     |
| 5,000    | 59.5 ms   | 114 ms     |
| 20,000   | 715 ms    | 2737 ms    |

按实体代价_随_数量上升（排序 + 浏览器无障碍树重建退化）。在 5,000 移动实体上的第二项度量（`Entity.ts:933` 文档，`benchmarks/lazy-a11y/`）：`eager` = **72.2 ms Chrome / 114.3 ms Firefox** vs `onDemand` = **1.55 / 1.63 ms**，无投影基线 **1.26 / 1.65 ms**。遍历本身约 0.005 µs/实体——DOM 是代价。每 Entity 一 DOM 在 36,000 实体时因此非线性外推——由无障碍树重建主导，这正是同一文档引用 36,000→1,026 坍缩作为_系统_胜利而非遍历胜利的原因。

### 参与度 — `a11yProjection` 模式（`Entity.ts:968`）

- `eager`（默认）——只要 `interactive` + 盒子，镜像即存活。用于按钮、链接、输入。
- `onDemand`——仅在_参与_时镜像：聚焦、指针目标或 `Scene.requestA11yProjection(id)`（`Scene.ts:1481`）。悬停单独**不**参与（键盘/AT 用户不产生悬停）。无镜像的 `onDemand` 实体**完全不接收指针事件**——canvas 命中测试（`findEntityAt`）是查询 API，非分发路径（`Entity.ts:953`）。
- `never`——永无镜像。优先 `interactive = false`，除非命中测试必须保留。

对数千瞬态对象（粒子、弹幕）模式是单个聚合活动区域（`role: 'status'`、`a11yFullViewport`、`Entity.ts:193`）加当前选择的小热点池——见 `forge/findings/core-a11y-and-input.md:178`（Bakudan `DanmakuAnnouncer`）。

## 虚拟化——滚动而不为整个文档付费

### ScrollView / Viewport

原始滚动器（`packages/ui/src/ScrollView.ts:58`）是裁剪容器（`clipChildren = true`），其 `content` 子级平移 `-scrollTop`。它暴露 `scrollTo` / `scrollToBottom` / `jumpTo`，在 `update`（`ScrollView.ts:219`）中驱动指数弹簧积分器，并经 `hasPendingAnimations()` 使滚动状态对空闲检查可见，使 `onDemand` 场景不在滚动中途停滞。`driveVirtualizableContent`（`ScrollView.ts:233`）让 `VirtualList` 子级在滚动内拥有自身窗口化。

`ScrollView` 内的 `Flow` 或 `Stack` 做常规布局；仅裁剪 + 平移虚拟化_绘制_——DOM 代价仍受内容投影窗口化约束。`Flow` 在 `maxWidth` 处换行；`Stack` 是垂直/水平间隙容器（`packages/ui/src/Stack.ts`、`Flow.ts`）。`Card` 是装饰组（`packages/ui/src/Card.ts:80`，带标签时 `role: group`）——本身不虚拟化，但为虚拟化视口的常见子级。

`getA11yAttributes()` 返回 `{ pointerEvents: 'none' }`（`ScrollView.ts:289`）——滚动表面本身非命中目标；后代拥有指针（见下热点 §）。折叠 `ScrollView` 上 `a11yHidden` 即使在裁剪动画期间也对投影隐藏其子树（`Entity.ts:a11yHidden`，在 `Overlay` `hide()` 后验证）。

### VirtualList — 窗口化行（`packages/ui/src/VirtualList.ts:179`）

仅 `[visibleTop - overscan, visibleBottom + overscan]` 内行挂载（`VirtualList.ts:468` 处 `_visibleRange`，`overscan = 3` 默认，`VirtualListOptions:102`）。其余作为实体不存在——无 canvas 绘制、无无障碍镜像、无内容投影。挂载数保持 `O(viewport)` 而与数据集大小无关。

滚动数学经 Fenwick 树 `O(log n)`（`RowHeights`，`VirtualList.ts:14`）回答 `total()`、`prefix(i)`（= 行 `i` 的 y）与 `indexAt(y)`（= 包含偏移 `y` 的行）。高度始于 `estimatedRowHeight` 并按已挂载行每帧重测（`VirtualList.ts:540` 处 `_measureMountedRows`）——普通字段读取，无需脏标记，且无变化路径上无 `markDirty` 使空闲节流不被击败。`_reconcile`（`VirtualList.ts:488`）在挂载新实体前回收越界实体。

键控列表（`keyForItem`，`VirtualList.ts:117`）跨 `setItems` 保持已测高度，按条目身份（非索引）锚定滚动，并在 `distanceToBottom ≤ 48 px`（`VirtualList.ts:517`）时跟随底部。无 `keyForItem` 时 `setItems` 清空高度缓存并跳至顶部——对被替换列表正确，对增长转录错误。

无障碍：容器计数属于其**名称**，而非 `aria-setsize`（在 `role="list"` 上不允许），见 `VirtualList.ts:660` 处 `getA11yAttributes` 与 `VirtualList.ts:170` 类文档。每_行_应返回 `posInSet` / `setSize`（`Entity.ts:A11yAttributes.posInSet`/`setSize`）否则屏幕阅读器播报已挂载窗口大小而非数据集。`VirtualList` 对其行热点采用与 `Table` 相同的池化——每可见行一池。

### 内容网格平铺——粗粒度 vs 细粒度（见上图）

两条路径共享一个窗口化契约（`scene/content-line-window.ts`）：

- **非网格**（段落、`Text`/`RichText`）：`ContentProjection.lines` 上的 `projectionLineWindow`（`content-line-window.ts:44`）。粗粒度块持有一个文本节点（`el.textContent = projection.text`）；细粒度块按窗口替换载体。每个 `ContentProjectionLine` 携带 `text`、`separatorAfter`（已消费软换行 vs 硬换行）、`x`/`y`/`baseline`，可选 `runs` 带 `x`/`width` 供两端对齐文本，以及 `perGraphemeCarriers`/`shapedPaint` 供 CJK 网格对齐。
- **网格**（代码块、经 `@vectojs/text` 中 `PreparedContentGrid` 的 `Markdown` CodeBlock）：`PreparedContentGrid` 上的 `projectionGridLineWindow`（`content-line-window.ts:114`）。`ContentGridProjector.syncGrid` 按字形簇构建一个 span 并带按单元 `scaleX` 校准（`ContentProjectionManager.scheduleGridCalibration`，同步外冷读写批量），并按签名复用行（`ContentGridProjector.ts:199`）使流式追加避免 `O(cells)` 重建。网格文本上 `ligatures: 'none'` 防止 Firefox `ffi` 收缩使选区盒漂移。

窗口是**与扩展视口带重叠的连续段**——间隙会将文本拼出 DOM 顺序并破坏选区复制顺序。无重叠时保留单个最近行使文本仍可达（`content-line-window.ts:79`）。晋升（粗→细）显式剥离粗粒度文本节点——网格不能使用 `replaceChildren()` 否则流式复用丢失（`ContentGridProjector.ts:111`）。降级释放 DOM；语义门保持可查找文本而无需载体。

选区保持感知层级：`ContentProjectionManager`（`scene/ContentProjectionManager.ts:1`）对非网格快照_线性偏移_、对网格快照_源码偏移_，按遍历记忆 `selectionPresent`（每遍历一次强制布局而非每元素——记忆修复使 1000 块排空从 2002 次布局降至 19，`forge/baselines/content-projection-frontload-findings.md:153`），并仅在受影响行实际重建时恢复——复用载体保持活动 `Selection` 节点。滚动代码块上 `clipToBounds` 防止选区高亮绘制超出实体盒。

### Markdown + Table 平铺

- **Markdown**（`packages/markdown/src/Markdown.ts:681`）——两个独立轴：`virtualize`（`MarkdownOptions:625`）将顶层_块_作为实体窗口化（可选，与流式不兼容，由宿主 `ScrollView` 经 `Markdown.ts:774` 处 `RowHeights` 以 `setVisibleRange` 驱动），而 `tableViewportHeight`（`MarkdownOptions:652`）固定每个 `Table` 主体视口使其行经 `Table.appendRows` 流式中虚拟化。两种情况下 `Stack` 带 `cullOffscreenChildren` 为内容宿主。`Markdown` 按块拥有 `getContentProjection`；宿主拥有滚动。流式 Markdown 按前缀复用未变块实体——仅尾部重建（Boss 04）。
- **Table**（`packages/table/src/Table.ts:144`）——`viewportHeight > 0` 钉住表头，创建裁剪滚动 `bodyClip`（`Table.ts:183`），在窗口进入时懒构造字符串单元（`Table.ts:853` 处 `ensureBodyCells` / `Table.ts:392` 处 `reconcileVirtualRows`），并仅保持 `first..last` 行挂载（`overscan = 2`）。经典模式增长以容纳所有行并带可变已测高度。主体无障碍为每可见行池化的 `RowHotspot`（`role: row`）+ `GridCellHotspot`（`role: gridcell`/`columnheader`）——`O(viewport)` 而非 `O(rows)`（`Table.ts:199`、`622`）。`Table` 自身上 `getContentProjection` 返回 `null`——单元拥有其文本。`rowTops` 前缀和（`Table.ts:751`）使 `_syncGridA11y` 按槽 `O(1)` 而非 `O(rows²)`。

### 视口内的 Stack / Flow / Card

`Stack`（`packages/ui/src/Stack.ts`）与 `Flow`（`packages/ui/src/Flow.ts`）是非虚拟化布局容器——它们定位子级并报告 `width`/`height`，但不裁剪或窗口化。在 `ScrollView` 或虚拟化父级内，它们是被平移或剔除的_内容_：

- 垂直 `direction: 'vertical'` + `gap` 的 `Stack` 是 Markdown `content` 宿主（`Markdown.ts:1088`）与典型 ScrollView 子级。带 `cullOffscreenChildren = true` 时它还对视口外子级跳过 `getContentProjection`——Scene 级窗口化前的廉价第二门控。
- `Flow` 在 `maxWidth` 处换行内联子级，是文本段落主力；如 Stack，依赖其滚动祖先作视口门控。
- `Card`（`packages/ui/src/Card.ts:80`）是带内边距/边框/阴影的装饰 `role: group` 容器——本身永不虚拟化，但为 `VirtualList` 行或 `Markdown` 块的常见子级。其无障碍角色仅在带标签时为 `group`。

这些默认皆不拥有 `getRenderChildRange`——它们绘制所有子级并让祖先的裁剪 + 投影窗口化约束代价。仅 `Markdown`/`Table`/`VirtualList` 实现行/块级虚拟化。

### 视口剔除——视觉层（`Entity.ts:788`）

独立于 DOM 投影：

```ts
entity.viewportCullChildren = true;
entity.getRenderChildRange(localViewport: Bounds): RenderChildRange | null {
  // 返回与视口相交子级的 { start, end }，或无时 null
}
```

`Stack`/`Flow` 默认关闭（对适度子数廉价）。对具有数千视觉子级且剔除 _canvas_ 绘制本身重要的容器开启它——投影窗口化不帮助视觉层，无剔除时树遍历为每同步帧 `O(total entities)`（`forge/baselines/content-projection-frontload-findings.md:Not addressed`，`vectojs#350`）。

### 晋升 / 降级生命周期

```text
  off-screen                          near viewport                    on-screen
 ──────────── ──contentSemanticMargin── ──contentProjectionMargin── ────────────
  (released)          (coarse)                     (fine)
  no DOM              el.textContent = text        per-line / per-cell carriers
  not findable        findable, no per-line        findable + selectable +
                      selection geometry            copy + per-line highlight

  demotion ◄──────────────┘                          └──────────────► promotion
  `syncContentProjection` frees carriers;            `syncGrid` strips coarse text node,
  coarse text stays if inside semantic gate;         materializes windowed carriers;
  outside both gates the element is removed.         outside semantic gate but inside
                                                     interaction gate: direct to fine.
```

预算仅适用于从带外粗粒度→细粒度的晋升；将已粗粒度的块滚动进交互带忽略预算。

## 热点模式——零 DOM 语义仍可键盘操作

复合部件（`role="grid"`、`tree`、`menu`、`radiogroup`、`tablist`）必须暴露**每子级一个角色**，而非仅容器角色，且必须在顺序中保持**一个 tab 停靠**——千 tab 停靠树不可用。VectoJS 在每个可见子级上池化透明可聚焦子 `UIComponent`（`vectojs/AGENTS.md:Zero-DOM a11y hotspot pattern`）：

```ts
class GridCellHotspot extends UIComponent {
  constructor(private table: Table) {
    super();
    this.interactive = true; // 以便 syncA11y 完全投影它
    this.on('keydown', (e) => this.table.handleGridKey(e, this.rowIndex, this.colIndex));
  }
  getA11yAttributes(): A11yAttributes {
    return {
      role: this.rowIndex < 0 ? 'columnheader' : 'gridcell',
      label: this.label, // WCAG 4.1.2 — 每个控件需名称
      tabIndex: this.table.isGridTabStop(this.rowIndex, this.colIndex) ? 0 : -1,
      pointerEvents: 'none', // 让可选单元文本拥有指针
    };
  }
  render(): void {} // Table 在 canvas 上绘制单元
}
```

| 组件             | 热点角色                                           | 游走停靠拥有者                                     | 按键                                                       |
| ---------------- | -------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| `Table`          | `row` 中 `gridcell` / `columnheader`               | `isGridTabStop(row, col)`（`Table.ts:473`）        | 箭头 2D、Home/End 行、Ctrl+Home/End 网格、PageUp/Down 视口 |
| `VirtualList` 行 | 调用方提供（如 `listitem`）                        | 行自有 `isTabStop`                                 | 上/下                                                      |
| `TreeView`       | `treeitem`（`aria-level`、`expanded`、`selected`） | `isTabStop(nodeId)`（`Tree.ts:389`）               | 上/下、右展开→进入、左折叠→父级、Home/End                  |
| `ContextMenu`    | `menuitem`（`haspopup`、`expanded`）               | `isMenuTabStop(idx)`（`ContextMenu.ts:270`）       | 上/下循环、Home/End、右打开、左返回、Escape 关闭           |
| `RadioGroup`     | `radio`（`aria-checked`）                          | `isTabStop(value)`（`RadioGroup.ts`/`Tabs.ts:42`） | 箭头 + Home/End                                            |
| `Tabs`           | `tab`（`aria-selected`）                           | 选中 tab                                           | 箭头 + Home/End                                            |

先例：`RadioGroup`/`Tabs`（#160）、`Tree`/`Table`/`ContextMenu`（#191）；实时引用位于 `Table.ts:56`、`82`、`Table.ts:624`（`_syncGridA11y`）、`VirtualList.ts:170`、`ScrollView.ts:289`、`ContextMenu.ts:292`、`RadioGroup.ts:32`、`Tree.ts:98`。仅可见子级被池化，因此虚拟化 `Table` 投影 `O(viewport)` 热点。

### `pointerEvents: 'none'` 的理由

Canvas 输入**仅经投影镜像**路由——`Scene` 按镜像绑定 `pointerdown`/`pointerup`/`click`/`wheel`（`Scene.ts:3512`）而 `pointermove`/`pointerleave` 仅在 canvas 上用于悬停跟踪。因此热点上 `pointerEvents: 'none'` 不只是“将其移出命中测试”——它完全移除其鼠标输入路径，而键盘焦点与 AT 合成 `click` 仍路由（`forge/findings/core-a11y-and-input.md:336`）。在下层拥有指针时使用它：

- 可选单元文本（`Table.ts:116`），
- 拖拽滚动表面（`ScrollView.ts:289`），
- 包装器内的 canvas 命中处理。

**不要**在拥有处理器的元素上使用它——在自有属性上设 `pointerEvents: 'none'` 的 `ScrollView` 子类无错误地静默其 `wheel`/`pointerdown` 滚动（`forge/findings/core-a11y-and-input.md:336`）。

### 焦点、游走 tabindex 与阅读顺序

- **游走 tabindex**：每复合仅一个热点具 `tabIndex: 0`；父级在方向键上移动停靠并聚焦它（`Table.ts:490` 处 `Table.handleGridKey`、`Table.ts:560` 处 `findHotspot`/`_focusCell`、`VirtualList`/`Tree`/`ContextMenu` 等效）。当虚拟化卸载聚焦行时，`Table` 在重绑 `tabIndex` 前将停靠重锚到可见行（`Table.ts:667`）且仅在旧单元实际持有焦点时恢复 DOM 焦点（`Table.ts:592` 处 `activeCellHoldsFocus`），因此在别处滚动永不抢焦点。哨兵 `a11yRoot` 焦点陷阱保持焦点在场景内（`Scene.ts:1482`）。
- **阅读 / tab 顺序**：镜像按每_区域_带状排序自上而下再行内、稳定——最近 `a11yRegion` 或 `clipChildren` 祖先（`A11yProjectionManager.ts:351`）。无区域时贯穿转录的垂直拖拽会吞没共享同行带的侧边栏标题（`A11yProjectionManager.ts:339`）。在不裁剪列上设 `a11yRegion = true`（`Entity.ts:a11yRegion`）以保持其拖拽/连续性分离。RTL 为 `Scene.readingDirection`（`Scene.ts:392`）。`a11yRoot` 层在 canvas 之上 `z-index: 10`（`Scene.ts:2403`）默认 `pointerEvents: none`，仅拖拽期间翻为 `auto` 使选区可在空白区开始。
- **隐藏子树**：`a11yHidden = true`（`Entity.ts:a11yHidden`）对投影隐藏整个子树——单独在容器上 `interactive = false` 仍投影仍交互子级（在 `Popover.hide` 上验证，`forge/findings/core-a11y-and-input.md:622`）。非从 `opacity` 推断——弹簧驱动不透明度在零附近徘徊而永不到零。

## 选择配置

| 文档               | 语义边距                   | 交互边距       | 预算    | 说明                                                        |
| ------------------ | -------------------------- | -------------- | ------- | ----------------------------------------------------------- |
| 装饰 canvas        | `contentProjection: false` | —              | —       | 完全无 DOM 代价                                             |
| 短文档（< 300 块） | 默认                       | 默认           | 256     | 默认已最优                                                  |
| 长可滚动文档       | `Infinity`                 | 默认（1 视口） | 256     | 推荐常驻层——全文档查找 + 预读，载体保持有界                 |
| 10k 块转录         | `Infinity`                 | `2 * viewport` | 256–512 | 更宽交互边距减少滚动时晋升抖动                              |
| 粒子 / 弹幕场      | —（无内容投影）            | —              | —       | `a11yProjection: 'onDemand'` 或聚合 `role: status` 活动区域 |

`content-visibility: auto` 与悬停门控文本均被度量并否决——见 `forge/baselines/content-projection-frontload-findings.md:Two approaches rejected`。前者较 `display:none` 对视口外投影无收益；后者专门对键盘/AT 用户移除文本。

## 陷阱——已上线的缺陷

1. **粗→细重复**（`forge/findings/core-a11y-and-input.md:2026-08-08`）——网格块从粗粒度晋升时在经仅 `children` 操作追加载体时遗留 `textContent` 文本节点，使 `textContent` 翻倍（实测 758 vs 379 字符）。修复为载体循环前剥离文本节点（`ContentGridProjector.ts:111`）。
2. **选区超出窗口起点**（`forge/findings/core-a11y-and-input.md:2026-08-08`，`ContentGridSelectionWindow.test.ts`）——滚过窗口_起点_时重建载体而未释放 `Selection`，使其留在分离节点。需将 `selectionLine < start || >= end` 提升到物化循环之上。
3. **`pointerEvents: none` 扼杀鼠标**（`forge/findings/core-a11y-and-input.md:2026-08-02`）——见热点 §；无警告、无错误，只是死亡滚动表面。
4. **覆盖层重投影滞后**——`DirtyTracker` + `a11ySyncInterval` 与 `showOverlay` 交互曾被怀疑随后作为后台浏览器伪影撤回（`forge/findings/core-a11y-and-input.md:2026-08-16` 撤回，`2026-08-15` 原文）。教训：先验证 `document.hasFocus()` 与页内 rAF 计数，再将帧数延迟归因于 Scene。
5. **固定 id 碰撞**（`forge/findings/core-a11y-and-input.md:2026-07-16`，`vectojs#117`）——十一 `ui` 组件曾调用 `super('ClassName')`，共享一个 `a11yElements` 映射条目；两个 `PanelGroup` 将指针事件路由到错误分隔条。修复为 `super()` → 随机 id。
6. **`a11yHidden` vs `interactive`**（`forge/findings/core-a11y-and-input.md:622`）——在容器上设 `interactive = false` 不隐藏仍交互子级；`a11yHidden` 会。

## 自动化——投影亦是输入传输

Playwright `getByRole('button', { name })` 不命中 canvas。它命中 `a11yRoot` 中影子镜像，而 `Scene` 的按镜像监听器（`Scene.ts:3512`）以 `VectoJSEvent`（`Entity.ts:VectoJSEvent`）重分发，带 `bubbles` 与 `stopPropagation` 语义。这正是同一 `A11yAttributes.label` 既被 AT 播报也被代理用作选择器的原因——无需适配器、无需 `data-testid`。`debugA11y` 加 `getA11yTree()` 是代理的断言面；`data-vecto-id` 是标签动态时的稳定定位器。

后果：`onDemand` 空闲实体或 `a11yHidden` 子树无镜像因此**无指针分发路径**——`scene.findEntityAt(x,y)` 仍返回实体（查询 API），但 `entity.on('click')` 永不触发。必须保持指针响应而 AT 不可见的全局手势表面使用 `a11yFullViewport = true` + `a11yProjection: 'eager'` + `getA11yAttributes() => ({ tabIndex: -1 })` 且无角色——镜像可聚焦以供指针路由但无 AT 名称。

`a11yFullViewport` 本身（`Entity.ts:912`）在所有其他镜像后挂载一个 `100vw × 100vh` 镜像（`A11yProjectionManager.ts:fullViewportElements` 保持插入序）使覆盖 canvas 的交互表面永不遮挡顶部控件。该模式被 `DanmakuAnnouncer`、webos 桌面点击捕获器与任何无限画布平移处理器使用。

## `getA11yAttributes` 能投影什么——接口面

`A11yAttributes`（`Entity.ts:295`）是自定义实体所需的唯一无障碍 API。每字段按属性按帧脏检查——`undefined` 移除，`false` 写入 `aria-invalid="false"`（显式有效），因此区别重要：

- **身份**：`tag`（`div`/`a`/`button`/`img`/`input`/`textarea`）、`role`、`label` / `labelledby` / `describedby`。
- **焦点/指针**：`tabIndex`（见游走 §）、`pointerEvents`（`auto`/`none`）。
- **原生属性**（仅匹配 `tag`）：`href`/`target`、`src`/`alt`、`inputType`/`placeholder`/`value`/`checked`/`textInputStyle`。
- **状态**：`disabled`、`checked`、`selected`、`expanded`、`required`、`invalid`、`level`、`valuemin`/`valuemax`、`ariaModal`、`controls`/`haspopup`/`activedescendant`。
- **虚拟化集合/网格**：`posInSet`/`setSize`（列表）、`rowCount`/`rowIndex`/`valueText`/`orientation`（网格）——无这些，10k 行虚拟化列表播报“12 中第 3 项”（窗口而非数据集）。
- **活动**：`live`（`off`/`polite`/`assertive`）+ `atomic`/`relevant`——流式播报路径（Boss 04）。

`getA11yAttributes()` 默认（`Entity.ts:1937`）返回 `{}` → 无角色普通 `div`，对仍需内容投影的非交互文本块正确。

## 可引用的性能数字（及测量处）

仅 `benchmarks/run-browsers.sh` 在聚焦、GPU 加速窗口上的数字可引用（见全局 `AGENTS.md` 基准规则）。下图除非注明皆来自该 harness。使用 `calibrateRefreshRate()`——绝不硬编码 60/240 Hz（Firefox 无 `layout.frame_rate` 时默认为 60 Hz）。在 JSON 信封中交叉检查 `validation.ok`、`crossOriginIsolated` 与 `refreshHz`——未聚焦窗口报告 0 ticks/s，任何 ms 论断无效。

**投影代价 vs 交互数量**——`content/learn/accessibility.md:353`、`Entity.ts:933`：

| 条件                       | Chrome       | Firefox   | 来源                                                                       |
| -------------------------- | ------------ | --------- | -------------------------------------------------------------------------- |
| 1,000 移动交互             | 6.4 ms/帧    | 7.4 ms/帧 | learn/accessibility §Cost + `lazy-a11y` 基线                               |
| 5,000 eager                | 59.5–72.2 ms | 114 ms    | learn 表 + `benchmarks/lazy-a11y/`（`Entity.ts:933` 文档）                 |
| 5,000 `onDemand`（同场景） | 1.55 ms      | 1.63 ms   | `benchmarks/lazy-a11y/` 基线 1.26/1.65 ms                                  |
| 20,000 eager               | 715 ms       | 2737 ms   | learn/accessibility 表（超线性：6.4→35.7 µs/Chrome，7.4→136.9 µs/Firefox） |

**虚拟化胜利**——`forge/findings/core-a11y-and-input.md:240`（Gallery 346 KB Markdown，172–238 Hz，真实 GPU）：

| 指标           | 前（无视口门控）      | 后               |
| -------------- | --------------------- | ---------------- |
| DOM 元素       | 14,843                | 254              |
| 已投影内容节点 | ~1,250                | 29（滚动时回收） |
| 文本节点       | 9,369                 | 160              |
| 滚动 p95       | ~50 ms                | 4.3 ms           |
| 滚动帧         | 55 fps / 18 ms        | 238 fps / 4.2 ms |
| 堆             | 滚动期间 125 → 224 MB | ~100 MB          |

**粗粒度语义层代价**——`forge/baselines/content-projection-frontload-findings.md: Finding 3`（Chrome 151 @ 240 Hz，Firefox 153 @ 240 Hz，`runId 20260804T155826Z-5cdf96`）：

| 块数   | 行数   | `firstSyncMs`（混合 vs 原生）                    |
| ------ | ------ | ------------------------------------------------ |
| 100    | 300    | 10.3 ms（1.6×）/ 5.0 ms（1.1×）                  |
| 1,000  | 3,000  | 20.6 ms（4.5×）/ 16.0 ms（5.3×）——打开时约一丢帧 |
| 10,000 | 30,000 | 146.6 ms（19.9×）/ 144.8 ms（21.4×）             |

按编辑代价保持廉价（10k 时 `editOffBand` 1.09/3.06 ms，`Finding 4`）。`Selection` 记忆修复后最终预算化排空（运行 `20260805T080824Z-e79819`，`forge/baselines/content-projection-frontload-findings.md:Two approaches rejected`）：Chrome 21.29 → 10.66 ms 于 1k，139.5 → 12.0 ms 于 10k；Firefox 21.86 → 5.88 ms，141.6 → 9.2 ms。每块约 0.03 ms——先前约 13 µs/节点数据无效（以 `display:none` 常驻节点度量，其永不进入布局）。

## 调试清单

1. **`scene.getA11yTree()` 优先。**每个热点与内容节点皆在，带 `role`/`label`/`tabIndex`——若 `getByRole` 无果，`interactive` 或 `width`/`height` 为零，而非选择器（`Scene.ts:2390` 守卫，`content/learn/accessibility.md:Troubleshooting`）。`a11yRoot` 本身排除于树外。
2. **`debugA11y: true`**（`SceneOptions:debugA11y`，`Scene.ts:204`）——`a11yRoot` 上蓝色虚线轮廓；最快位置检查。镜像否则 `opacity: 0`（`Scene.ts:2401` 层为 `z-index: 10`，`pointerEvents: none` 直至拖拽）。运行时经 `scene.debugA11y = true` 切换。
3. **DOM 检查**——每镜像携带 `data-vecto-id = entity.id` 加 `role`/`aria-*`；检查 `aria-label` 存在性（无名称的角色被播报为裸“button”/“slider”，`content/learn/accessibility.md:Screen reader testing checklist`）。内容载体携带 `data-vecto-grid-*` 与 `data-vecto-projection-*` 数据集。用 `document.querySelectorAll('[data-vecto-id]')` 计数活动镜像 vs 预期。
4. **`scene.getA11yElement(entity.id)`**——焦点检查的活动 `HTMLElement`；`activeCellHoldsFocus`（`Table.ts:592`）模式展示如何测试。`null` 表示本帧未投影（视口外、`a11yHidden` 或 `onDemand` 空闲）。比较 `showOverlay` 前后 `scene.a11yElements.size` 以捕获覆盖层投影回归。
5. **`a11yProjection` 门控检查**——无参与的 `onDemand` 无镜像因此无指针事件。在归咎分发前验证 `Scene.requestA11yProjection` 或焦点状态。记住 `findEntityAt` 仍工作——它未被门控——因此 canvas 级 `pointerdown` 处理器会触发而实体自有 `on('click')` 不会。
6. **`pointerEvents` 审计**——`grep -rn "pointerEvents.*none" packages --include="*.ts"` 并确认处理器归属。静默滚动/选区失败更多是此而非裁剪缺陷。`ScrollView` 位于 `ScrollView.ts:289` 是典型包装器拥有 none、子级拥有 auto 对。
7. **阅读顺序**——转储 `getA11yTree()` 并验证带顺序匹配视觉行。错置 `a11yRegion` 表现为区域主导排序而预期为带主导（`A11yProjectionManager.ts:351` 区域分桶）。
8. **选区 / 网格校准**——`ContentProjectionManager.scheduleGridCalibration` 写入按单元 `scaleX`；验证 `data-vecto-grid-calib` 世代。字体加载后陈旧世代意味着 `contentFontEpoch` 未递增。`content-visibility: auto` 被度量并否决（`forge/baselines/content-projection-frontload-findings.md:Two approaches rejected`）；`a11yRoot` 上 `contain: layout` 有意为之（`Scene.ts:2402`）。
9. **性能分诊**——`PhaseTimer` 阶段 `calibScan`/`calibProbeBuild`/`gridMaterialize`（`scene/PhaseTimer.ts`），`ContentGridProjector` `vectoGridMaterializeMs` 数据集，`scene.frameStats`（`Scene.ts:518`）与 DevTools 在 `ScrollView`/`VirtualList`/`Table` 上 `getDevtoolsDescriptor()`。可引用数字仅 `benchmarks/run-browsers.sh` 在聚焦窗口上——后台 Hyprland 给出 `0 ticks/s`，任何按帧论断无效（`forge/findings/core-a11y-and-input.md:2026-08-16` 撤回）。

## 如何验证虚拟化确实生效

三项检查，按序：

1. **计数 DOM。**`document.querySelectorAll('[data-vecto-id]').length` vs `scene.a11yElements.size` vs 数据集大小。10k 行虚拟化 Table 应显示约 `viewport/rowHeight + 2*overscan` 镜像，而非 10k。若数量跟踪数据集，虚拟化关闭（未设 `viewportHeight`，或每行实体上 `a11yProjection: 'eager'` 而非窗口化池）。
2. **滚动并重计数。**集合应回收——相同数量，不同 `data-vecto-id` 随窗口移动。增长数量意味着泄漏镜像（卸载时未调用 `detachA11y`，或池只增不减——检查 `Table.ts:701` 收缩循环与 `VirtualList.ts:_reconcile` 回收分支）。
3. **性能包络。**`scene.frameStats`（`Scene.ts:518`）+ 聚焦窗口上 `benchmarks/run-browsers.sh --validation`。虚拟化后滚动 p95 仍 >10 ms，则代价不再是 DOM 数量——检查 `PhaseTimer` 网格校准或 `syncA11y` 遍历本身（无 `viewportCullChildren` 时 `O(total entities)`，`vectojs#350`）。

## 本 Boss 在文档图中的位置

- **前置**：Boss 06（VMT 运行时——脏/生命周期/事件，`DirtyTracker`、`DriverTicker`、`Scene` 循环）。本 Boss 复用 06 的脏/生命周期机制并假设你了解 VMT 步进。
- **配对**：Boss 01（选区——内容投影的另一消费者）、`content/learn/accessibility.md`（使用指南）、`content/reference/core-a11y.md`（API 真值）、`content/reference/core-entity.md`（`A11yAttributes` 面、`getA11yAttributes`/`getContentProjection`/`getContentEpoch` 钩子）。
- **通向**：Boss 04（流式 Markdown——`Markdown` 虚拟化握手 + 复用本 Boss 窗口化的增量调和）、Boss 07（渲染器——视觉层的裁剪/DPR 一致性）、Boss 12（DevTools——虚拟化状态的 `getDevtoolsDescriptor` 面）。

切勿在 `vectojs-docs/content` 与 `vectojs-website/src/content` 间 `cp -r`——格式漂移 + 408 i18n 文件（`AGENTS.md`）。先编辑权威侧（`vectojs-docs/content`），以 `scripts/sync-content.py` 预览，然后推送两仓库。

## 不变量（本 Boss 的提交清单）

1. **脏 + 几何一致。**`getContentEpoch()` 在 `getContentProjection()` 输出将不同时递增；`Scene` 从第二次同步起跳过未变块。破坏此付出每帧 `O(total blocks)` 而非 `O(changed)`。无 `content-visibility` 快捷——已被度量并否决。`onDemand` 空闲实体按定义不脏。
2. **每个可见交互的双世界对等。**世界几何、角色/名称/状态与焦点/指针路由匹配 canvas 真值——由共享 `syncA11y` 遍历与 `enforceA11yDomOrder` 按区域视觉排序强制。每 `interactive = false` vs `a11yHidden` 错漏将隐藏控件投进 tab 顺序。每个交互携带 `aria-label` 除非其可访问名称来自 `aria-labelledby` / 包含文本。`a11yFullViewport` 镜像永远在普通镜像之后。
3. **连续窗口化。**行网格窗口为每块单一连续段（`scene/content-line-window.ts:Contiguous on purpose`）——间隙会将文本拼出选区/复制顺序。`clipChildren`/`a11yRegion` 是唯一区域断点。语义与交互边距之分即整个 API——不要合并它们。
4. **指针拥有者显式。**每对热点声明谁拥有指针；直接驱动实体的测试不会捕获使鼠标路径静默的 `pointerEvents: 'none'`（`forge/findings/core-a11y-and-input.md:336`）。无参与的 `onDemand` 按设计指针死亡——对 AT 不可见指针表面使用 `a11yFullViewport` + `eager` + `tabIndex: -1`。
5. **阅读顺序是视觉而非插入。**`A11yProjectionManager.sortNormalElementsVisually` + 区域分桶即 tab/AT 顺序；以任意顺序插入子级但自左向右绘制仍必须自左向右 tab。`a11yHidden` 永不从不透明度推断。`forcedColors`（`Scene.forcedColors`）是重绘关切，非投影——高对比绘制留在视觉层。
6. **预算不隐藏可见文本。**`contentSemanticBudget` 永不延迟交互带内块——延迟可见文本会使其短暂不可选（`Scene.ts:376`）。该保证由 `ContentProjectionSettledWalk.test.ts`（2 vs 802 盒测试）测试。`Infinity` 对 `contentSemanticMargin` 安全，对 `contentProjectionMargin` 禁止——使其不受支持的代价是未窗口化载体带而非常驻文本。
7. **虚拟化集合播报数据集大小。**具 10k 项但挂载 12 行的虚拟化列表/网格必须投影 `posInSet`/`setSize`（或 `aria-rowcount`）使 AT 听到“10000 中第 400 项”，而非“12 中第 3 项”。容器级 `role="list"` 上 `aria-setsize` 不允许（`VirtualList.ts:660`）。

## 延伸阅读——每项论断皆有出处

| 论断                     | `file:line`                                                                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scene 选项 / 预算        | `Scene.ts:204`、`263`、`328`、`336`、`359`、`600`、`1398`、`1481`、`2403`、`3512`                                                                                                                   |
| Entity 无障碍 + 内容钩子 | `Entity.ts:295`、`788`、`912`、`968`、`1898`、`1970`、`2018`、`2048`                                                                                                                                |
| 投影管理器               | `A11yProjectionManager.ts:30`、`157`、`169`、`178`、`351` · `ContentProjectionManager.ts:26` · `ContentGridProjector.ts:69` · `content-line-window.ts:25`                                           |
| UI 虚拟化                | `ScrollView.ts:58`、`233`、`289` · `VirtualList.ts:14`、`117`、`170`、`660` · `Table.ts:144`、`392`、`624`、`751` · `Card.ts:80`                                                                    |
| Markdown 平铺            | `Markdown.ts:625`、`652`、`681`、`774`                                                                                                                                                              |
| 发现 / 基线              | `forge/findings/core-a11y-and-input.md:178`·`240`·`336` · `forge/baselines/content-projection-frontload-findings.md:1` · `content/learn/accessibility.md:353` · `content/reference/core-a11y.md:10` |
| 热点先例                 | `vectojs/AGENTS.md`（Zero-DOM 热点）· PR #160 · PR #191 · `Table.ts:56`                                                                                                                             |

---

_下一篇：04 流式 Markdown——增量词法、worker + 调和，以及 `Markdown`↔`ScrollView` 虚拟化握手。_
