---
title: '14 — 响应式布局与交互 — 适配视口与输入'
description: '视口即约束：resize/zoom 重排、Stack/Flow 布局阶段、面板仪表盘、VirtualList 窗口化、ScrollView 物理、ResizablePanel 手柄、叠加层定位与悬停/焦点状态——皆在 VectoJS 的 canvas 原生世界中。'
order: 34
---

# 14 — 响应式布局与交互 — 适配视口与输入

> 在 DOM 浏览器中，响应式布局即 CSS：媒体查询、flexbox、grid 与引擎免费提供的滚动容器。在 VectoJS 中，没有 CSS 引擎——每个像素都是单个 `<canvas>` 上保留式实体树的算术结果。视口只是使缓存失效的又一个数字，滚动偏移是弹簧驱动的 `y`，而叠加层是重父到 `overlayRoot` 并经显式定位计算的实体。本文档说明当窗口调整大小、用户缩放或手指拖动面板分隔条时，这些数字如何保持一致。

- **你将学到**：`Scene.resize()` 如何经渲染器后备存储、投影分级与布局阶段传播视口变化；`Stack`/`Flow`/`Card`/`PanelGroup` 如何在无 CSS 引擎下组合响应式仪表盘；`VirtualList` 如何将 10k 行窗口化为约 15 个已挂载实体；`ScrollView` 弹簧物理、`ResizablePanel` 拖动手柄、`Overlay` 定位翻转与 `Button` 悬停/焦点环如何闭合交互回路——皆带 file:line 佐证。
- **你不会学到**：VMT 生命周期/脏检查/事件分发（boss 06）、文本塑形与断行（boss 02）、语义投影（boss 03）或流式 Markdown 差异（boss 04）。

## 1. 视口是约束，而非容器

### 1.1 Scene.resize() — 唯一的真相来源

`Scene.resize(width, height)` 位于 `packages/core/src/tree/Scene.ts:6381`，是视口边界：

```ts
public resize(width: number, height: number): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0) {
    if (!this.hasWarnedInvalidResize) console.warn(`...`); return;
  }
  this.width = width; this.height = height;
  this.contentFontEpoch++; this.contentViewportEpoch++;
  (this.renderer as any).resize(width, height);
  if (this.pointRenderer) { this.pointRenderer.resize(width, height); }
  if (this.gpuCanvas) this.sizeGpuCanvas(this.gpuCanvas, width, height);
  this.markDirty();
}
```

五件事原子发生：逻辑 `width`/`height` 更新、两个世代计数器递增、每个后备存储调整大小、帧被标记为脏。世代计数器是关键——`contentFontEpoch` 强制文本重校准（浏览器缩放在相同 CSS 字体下仍改变 Range 几何），`contentViewportEpoch` 重分级每个内容块而不移动它们（`Scene.ts:6415`、`Scene.ts:6420`）。仅改变 `width`/`height` 的 resize 会让每个块仍持有为旧视口构建的 DOM。

无效尺寸被拒绝而非钳制（`Scene.ts:6382`）：当 canvas 元素钳制为 `0` 时存储 `-10` 会使剔除与无障碍几何不一致。警告被闩锁（`hasWarnedInvalidResize` 位于 `Scene.ts:2113`），因为 `ResizeObserver` 驱动的调用方会在每次拖动帧刷屏。

### 1.2 谁调用 resize()

两条路径，按 `disableWindowResize` 区分（`Scene.ts:268`、`Scene.ts:2051`）：

| 模式                                           | 观察者                                                                              | 处理器                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 填满窗口（`disableWindowResize: false`，默认） | `window` `resize` 监听器（`Scene.ts:2968`）+ DPR 媒体查询/观察器（`Scene.ts:3052`） | `resize(window.innerWidth, window.innerHeight)`             |
| 嵌入式（`disableWindowResize: true`）          | `canvas` 上的 `ResizeObserver`（`Scene.ts:3082`）                                   | `resize(entry.contentRect.width, entry.contentRect.height)` |

另加调用方驱动的显式 `scene.resize(w, h)` 用于自定义容器——当 `ResizeObserver` 不可用时唯一路径（`Scene.ts:2740` 守卫）。DPR 缩放正交：`maxDPR`（`Scene.ts:287`）限制后备存储倍数，因此 DPR-3 显示以 2x 而非 3x 渲染（`逻辑尺寸 × dpr²` 成本，`Scene.ts:276`）。

### 1.3 缩放即 resize

浏览器缩放触发 `window.resize` 并改变 `devicePixelRatio`。Scene 的 DPR 观察器（`Scene.ts:1435` `dprMediaQuery`、`Scene.ts:1441` `dprPollInterval`）重调用 `resize(this.width, this.height)`——相同逻辑尺寸、新后备存储缩放——而该路径中的 `contentFontEpoch++` 处理 Firefox 分数缩放上的 Range 几何漂移（`Scene.ts:6410` 注释）。

## 2. 布局容器——从 stack 到仪表盘

### 2.1 Stack — 原语

`Stack` 位于 `packages/ui/src/Stack.ts:59`，是 VectoJS 的 flexbox：单轴顺序排列，交叉轴 `align: 'start'|'center'|'end'`（`Stack.ts:17`）、`gap`（`Stack.ts:14`）、可选 `wrap` 带 `maxWidth`/`maxHeight`（`Stack.ts:19`）以及用于填充剩余空间布局的 `fillTarget`（`Stack.ts:42`）。

`layout()` 位于 `Stack.ts:303`，为两阶段算法：

- **阶段 1 — 分组**（`Stack.ts:325`）：当 `wrap` 为 true 时沿主轴扫描子节点，每当 `currentMain + gap + childMain > limit` 时切出新行。否则一行容纳所有子节点。
- **阶段 1.5 — 填充**（`Stack.ts:349`）：当设置 `fillTarget` 且未换行时，拉伸最后子节点使 `children + gaps == fillTarget`——下限为内容尺寸，永不收缩。
- **阶段 2 — 放置**（`Stack.ts:371`）：对每行计算 `lineCross`/`lineMain`，随后以交叉轴对齐偏移赋值 `x`/`y`（`Stack.ts:388`）。

`Stack` 为纯结构容器——`render()` 不绘制任何内容（`Stack.ts:443`），仅子节点绘制。其自身 `width`/`height` 依所布局内容自适应，从而可被剔除。`getLayoutControlledProperties()` 位于 `Stack.ts:163` 返回 `['x','y']`——对子节点的写入在下次布局时回退。

两条 O(1) 快速路径在流式追加时避免 O(n) 全量布局（`Stack.ts:167` `add()`、`Stack.ts:257` `appendFastWrap()`）：

- `appendFast()`（`Stack.ts:231`）——非换行、`align: 'start'`：将单个新子节点置于 `height + gap`（垂直）或 `width + gap`（水平）处并增长容器的交叉尺寸。起始对齐下此前子节点不受影响。
- `appendFastWrap()`（`Stack.ts:257`）——换行 + `align: 'start'`：置于当前行或开启新行，仅使用末行状态的四个标量（`Stack.ts:95` `wrapLineMain/Cross/PriorCross/MaxMain`），永不重遍历。

两者在 `align !== 'start'`、`fillTarget` 已设或 `fastAppendDirty`（由 `remove()` 于 `Stack.ts:184` 设置）时回退到 `layout()`。

对不经 `add()`/`remove()` 增长的流式文本，`resizeLastChild(child)` 位于 `Stack.ts:210` 处理末子节点原地增长为 `height = child.y + child.height` / `width = max(width, child.width)`——仅当子节点交叉尺寸增大时有效，而非收缩。

### 2.2 Flow — 免费的芯片行

`Flow` 位于 `packages/ui/src/Flow.ts:19`，仅一行：

```ts
export class Flow extends Stack {
  constructor(opts: FlowOptions = {}) {
    super({ ...opts, direction: opts.direction ?? 'horizontal', wrap: true });
  }
}
```

### 2.3 Card — 圆角面板

`Card` 位于 `packages/ui/src/Card.ts:49`，为固定尺寸圆角盒（`Card.ts:123` `roundRect` + `fill`/`stroke`）。带 `label` 时投影 `role="group"`（`Card.ts:81`）；带 `onClick` 时可点击——要求 `label` 使无障碍投影始终获得可访问名称（`Card.ts:71` 否则抛出，`vectojs-docs/forge/findings/ui-components.md:43` 来源）。`setContent(entity, fit?)` 位于 `Card.ts:92` 镜像 `Panel.setContent`——默认内容经 `update()`（`Card.ts:118`）跟踪卡片的 `width`/`height`。

### 2.4 PanelGroup — 仪表盘格栅

`PanelGroup` 位于 `packages/ui/src/ResizablePanel.ts:213`，在 `Panel` 子节点间以可拖动 `PanelResizeHandle` 分隔条分配可用空间：

```text
PanelGroup { direction, width, height }
  ├── Panel { minSize, defaultSize, clipChildren: true }  — setContent(entity, fit?)
  ├── PanelResizeHandle { width: handleSize, interactive: true }  — 拖动增量 → _onResize
  ├── Panel
  └── ...
```

`addPanel()` 位于 `ResizablePanel.ts:237`，在首个之后每个面板前自动插入手柄（`ResizablePanel.ts:239` `new PanelResizeHandle`）。`resize(w, h)` 位于 `ResizablePanel.ts:258` 按比例重分配尺寸（`ResizablePanel.ts:267` `(size / basis) * avail`）随后归一化（`ResizablePanel.ts:309` 钳制到 `minSize`/`avail`）。`_layout()` 位于 `ResizablePanel.ts:343` 交替为面板与手柄赋值 `x/y/width/height`——水平组的面板为 `width = sizes[i], height = cross`；手柄为 `width = handleSize, height = cross`。

`Panel.setContent()` 位于 `ResizablePanel.ts:164` 默认保持内容与面板盒尺寸一致（`fit: true`，`ResizablePanel.ts:7` `FitContentOptions`），每帧经 `Panel.update()`（`ResizablePanel.ts:190`）重应用——必要因 `Entity.width/height` 为无 setter 钩子的普通字段（`ResizablePanel.ts:158` 契约说明，`vectojs-docs/forge/findings/ui-components.md:15` 来源，已在 `@vectojs/ui@1.11.0` 修复）。

`PanelGroup` 嵌套可组合：作为 `Panel` 内容的 `PanelGroup`（`Panel.setContent(innerGroup)`）产生嵌套分隔——内部组的 `update()` 使其保持与外部面板同尺寸，无需额外连线。

## 3. VirtualList — 将 10k 行窗口化为约 15 个实体

### 3.1 Fenwick 脊柱

`RowHeights` 位于 `packages/ui/src/VirtualList.ts:14`，为跨每行高度的 Fenwick（Binary Indexed）树（`VirtualList.ts:17` 大小 `n+1` 的 `Float64Array`）：

- `total()`（`VirtualList.ts:46`）——所有行高之和，O(1)。
- `prefix(i)`（`VirtualList.ts:60`）——行 `i` 顶部的 y，O(log n)。
- `indexAt(y)`（`VirtualList.ts:71`）——首个底边超过 `y` 的行，经二进制提升，O(log n)。
- `set(i, h)`（`VirtualList.ts:51`）——带增量传播的点更新，O(log n)。

每行始于 `estimatedRowHeight`（`VirtualList.ts:28`）；`set()` 在行挂载并度量后替换估计值。

### 3.2 调和——仅可见窗口

`VirtualList` 位于 `VirtualList.ts:179`，保持 `this._pool: Map<number, Entity>`（`VirtualList.ts:203`）——每已挂载行索引一个实体，而非每数据项一个。

`_visibleRange()` 位于 `VirtualList.ts:468` 经两次 `indexAt` 调用从 `_scrollY` 与 `height` 推导 `[start, end]`（闭区间），并在两端以 `overscan`（默认 3，`VirtualList.ts:103`）扩展。`_reconcile()` 位于 `VirtualList.ts:488`：

1. 回收超出范围实体（`VirtualList.ts:494` `super.remove` + `delete`）。
2. 挂载新可见行（`VirtualList.ts:506` `renderItem(item, i)`、`super.add`）。
3. 挂载后度量（`VirtualList.ts:515` 定位前 `_measureMountedRows`——在放置前读取 `heightOf(i)` 可避免 PR #509 前的一帧陈旧偏移）。
4. 定位 `y = rowTop(s) + ... - _scrollY`（`VirtualList.ts:518`）。

`VirtualList.scrollToIndex(i)` / `scrollToTop/Bottom` / `jumpToBottom` 位于 `VirtualList.ts:342` 重定向 `_targetY`/`_scrollY`；`jumpToBottom` 瞬时贴合（零速度），用于每块都重定向积分器而永不收敛的流式转录。

### 3.3 增长、身份与锚定

无 `keyForItem` 时，`setItems()` 位于 `VirtualList.ts:248` 清空高度缓存并跳至顶部——对已替换列表正确，对增长中转录错误。带 `keyForItem`（`VirtualList.ts:117`）：

- `_heightByKey: Map<string, number>`（`VirtualList.ts:199`）在 `setItems` 后存活——已度量高度为行的属性而非其索引（`VirtualList.ts:272` 树重建后从缓存重播种）。
- `_rekeyPool()` 位于 `VirtualList.ts:317` 在任何高度读取前将池化实体移至新索引——缺少它，前置会在错误高度上覆盖每项。
- 滚动锚定（`VirtualList.ts:397` `_captureAnchor` / `VirtualList.ts:431` `_restoreAnchor`）：两种变体——`bottom`（距底部距离，保留间隙）当 `nearBottom`（`VirtualList.ts:219` 每滚动闩锁）时，`item`（锚定行键 + 内偏移）否则。改变每行高度的 resize 使锚定行视觉上仍保持原位。

`_measureMountedRows()` 位于 `VirtualList.ts:540` 每帧轮询每已挂载行 `height`，经 `Fenwick.set` 应用增量并锚定——处理挂载后调整大小的行（流式 Markdown 重排、直接 `height` 赋值）而无需任何 setter 钩子。

## 4. ScrollView — 一个视口，一个弹簧

`ScrollView` 位于 `packages/ui/src/ScrollView.ts:58`，为非虚拟化对应物：经共享弹簧系统在 `y` 上滑动内部 `content` 实体的裁剪视口（`ScrollView.ts:71` `clipChildren = true`）（`ScrollView.ts:90` `content.setTransition({ y: scrollPhysics ?? 'spring' })`）。

- **滚轮**（`ScrollView.ts:92`）：`deltaMode` 转换（`ScrollView.ts:105` 像素/行×16/页×视口）、`targetY -= delta`、钳制、`content.y = targetY` 重定向弹簧并保留速度。Ctrl+滚轮退出以让浏览器缩放；可容纳内容（`maxScroll <= 0`）退出以避免死区（`ScrollView.ts:95`，修复 #525）。
- **指针拖动**（`ScrollView.ts:113`）：经 `localY` 增量 1:1 手指跟踪。
- **钳制**（`ScrollView.ts:136`）经 `clampTarget()` 保持 `targetY ∈ [-maxScroll, 0]`。`update()` 位于 `ScrollView.ts:219` 防御性重钳制且仅当钳制真正移动时重赋值 `content.y`——无条件重赋值会永久产生虚假 done-driver，使空闲节流失效（`ScrollView.ts:217` 注释）。
- **`scrollToBottom()`**（`ScrollView.ts:163`）经 `jumpTo()`（`ScrollView.ts:79` `setImmediate('y', y)`）贴合而非重定向弹簧——流式聊天的调用方每秒调用多次，弹簧被如此快速重定向永不收敛而抖动。
- **`DOCUMENT_SCROLL_PHYSICS`** 位于 `ScrollView.ts:36`（`{ stiffness: 180, damping: 27 }`，ζ ≈ 1.006，`vectojs-docs/forge/findings/ui-components.md:241` 来源）为文档滚动的临界阻尼预设；默认值（`stiffness: 180, damping: 12`，ζ ≈ 0.447）过冲约 20% 并弹跳——在列表上生动，在文档上错误。
- **内容增长**（`ScrollView.ts:233` `driveVirtualizableContent`）：每帧轮询子节点范围并在不同时经 `updateContentSize()` 重同步——处理流式 `setSpans` 增长而无需 `add()`/`remove()`。`ScrollVirtualizable.setVisibleRange`（`ScrollView.ts:50` 鸭子类型）同帧驱动用于窗口化内容。

## 5. 交互原语

### 5.1 ResizablePanel 手柄——场景空间增量

`PanelResizeHandle` 位于 `packages/ui/src/ResizablePanel.ts:42`，以**场景空间**度量拖动增量（`ResizablePanel.ts:86` `posOf` 优先 `sceneX`/`sceneY` 而非 `localX`/`localY`）。手柄随其调整大小的面板移动，因此局部坐标在面板增长、手柄滑至光标下时几乎不变——场景坐标稳定，因此 1px 移动 = 1px 调整（`ResizablePanel.ts:78` 注释，`vectojs-docs/forge/findings/ui-components.md:64` 来源，已在 `@vectojs/ui@1.1.3` 修复）。`hover` 交换 `color` → `hoverColor`；手柄为 `interactive: true` 并连线 `pointerdown`/`pointermove`/`pointerup`/`pointerleave`（`ResizablePanel.ts:92`）。

### 5.2 Overlay — 树之上的浮动内容

`Overlay` 位于 `packages/ui/src/Overlay.ts:37`，为 `Tooltip`、`Popover`、`ContextMenu` 的基类：

- 挂载到 `scene.overlayRoot`（`Overlay.ts:168` `scene.overlayRoot.add(this)`）——位于 `clipChildren` 之上，始终置顶。
- 定位（`Overlay.ts:14` `OverlayPlacement`：`top|bottom|left|right|auto` 外加 `-start/-end` 变体）在 `Overlay.ts:171` 处 `_position()` 中由 `target.getWorldBounds()` + `placement` + `offset`（默认 6，`Overlay.ts:23`）计算，随后经 `Overlay.ts:227` 处 `_placeAt()` 钳制到 `4px` 视口边距。`auto` 基于下方 vs 上方可用的空间翻转（`Overlay.ts:180`）。
- `showAtPoint(x, y, source?)` 位于 `Overlay.ts:98` 接受可选 `source`（Scene 或已挂载 Entity）以在叠加层自身从未挂载时解析 `scene`——否则首次调用时静默无操作（`vectojs-docs/forge/findings/ui-components.md:114` 来源，已在 `@vectojs/ui@1.10.0` 修复）。
- 经 `opacity/scaleX/scaleY` 上 `setTransition`（`Overlay.ts:59` `easeOutQuad` + spring）进入，以及隐藏子树指针命中测试与无障碍投影的 `a11yHidden`/`interactive` 切换（`Overlay.ts:149` `hide()` 亦调用 `detachA11y`）。
- `Modal` 位于 `packages/ui/src/Modal.ts:25` 构建其上：全视口背景（`Modal.ts:40` `width = window.innerWidth`、`Modal.ts:39` `a11yFullViewport = true`）带居中 `Card`，经 `card.scaleX/scaleY` 弹簧进入（`Modal.ts:84` 种子 0、`Modal.ts:266` `springTo({scaleX:1,scaleY:1})`）、焦点陷阱与 Escape 处理（`Modal.ts:188` `installFocusTrap`），以及在 `scene.hideOverlay(this)` 与焦点恢复前带离场动画的 `close()`（`Modal.ts:282`）。

### 5.3 悬停 / 焦点——canvas 反馈回路

canvas 没有 `:hover` 或 `:focus-visible`。VectoJS 从 Scene 重分发到 VMT 的无障碍投影事件驱动它们：

- **悬停**——`Button` 位于 `packages/ui/src/Button.ts:97` `on('hover')` / `on('pointerleave')` 切换 `hovered` → 以 `hoverBg` 重绘（`Button.ts:11` 选项），由 `disabled` 门控使禁用态永不显得激活。`PanelResizeHandle` 在 `ResizablePanel.ts:111` 对 `hoverColor` 做同样处理。
- **焦点环**——`Button.focused` 位于 `packages/ui/src/Button.ts:61` 描边 2px `focusColor` 环（`Button.ts:30` 默认 `#00f0ff`）。标志由影子 `<button>` 上真实 DOM `focus`/`blur` 驱动，Scene 在无障碍元素聚焦时发出——缺少它，键盘用户的 canvas 环永不出现。
- **光标闪烁**——`UIComponent.startCaretBlinkWake()` 位于 `packages/ui/src/UIComponent.ts:84` 调度 500 ms 唤醒（下阶段边界 `markDirty`），使空闲 `onDemand` 场景仍在 `Input`/`TextArea` 中闪烁光标——每阶段一次超时约 2 次渲染/s 而聚焦时（`UIComponent.ts:76` 注释），相比以全速率钉住场景。
- **焦点陷阱**——`Modal`（`Modal.ts:188`）与 `Overlay` 显隐保持 `a11yHidden` 与 `interactive` 同步，使隐藏弹出框的按钮不保持 Tab 可达（`vectojs-docs/forge/findings/ui-components.md:391` 来源，已在 2026-08-13 P2 批次修复）。

通用规则：浏览器会从 CSS 伪类派生的每个视觉状态必须从无障碍投影的实时 DOM 事件显式驱动，且每次隐藏必须同时丢弃视觉与投影。

## 6. 无 CSS 引擎的响应式模式

### 6.1 应用外壳的 resize 级联

```ts
// 一个这样的处理器拥有整个响应式级联：
window.addEventListener('resize', () => {
  const w = window.innerWidth,
    h = window.innerHeight;
  scene.resize(w, h);
  header.width = w;
  header.layout();
  sidebar.height = h - header.height;
  sidebar.layout();
  contentGroup.resize(w - sidebar.width, h - header.height);
});
```

每次 `resize()` 提升两个世代计数器，每个后备存储重缩放，`Stack`/`Flow` 在下次 `layout()` 时重分组，`PanelGroup.resize()` 重分配，`VirtualList` 钳制 `_targetY`（`VirtualList.ts:566` `_clamp`）。无媒体查询引擎——应用决定断点并调用 API。

### 6.2 面板仪表盘——嵌套分隔

`PanelGroup` 嵌套（`ResizablePanel.ts:206` 文档）是惯用的 IDE/编辑器外壳：

```ts
const outer = new PanelGroup({ direction: 'horizontal', width: W, height: H });
const sidebar = new Panel({ minSize: 160, defaultSize: 0.2 });
const editorGroup = new Panel({ minSize: 300 }); // 承载内部垂直分隔

const inner = new PanelGroup({ direction: 'vertical', width: 0, height: 0 });
inner.addPanel(new Panel({ defaultSize: 0.6 })); // 编辑器
inner.addPanel(new Panel({ minSize: 120 })); // 终端
editorGroup.setContent(inner); // ← Panel.setContent 保持 inner 已定尺寸

outer.addPanel(sidebar).addPanel(editorGroup);
scene.add(outer);
// 窗口 resize 时：outer.resize(newW, newH) — inner 经 Panel.update() 跟随。
```

`PanelGroup.resize()` 比例缩放（`ResizablePanel.ts:265`）处理外部组；内部组经 `Panel.update()` 的 fit 同步重布局，无需显式内部 `resize()` 调用。

### 6.3 ScrollView vs VirtualList — 何时窗口化

| 需求                      | 使用                                                              | 原因                                                                            |
| ------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 文档 / 聊天转录，无界高度 | `ScrollView` + `Stack`                                            | 简单、弹簧动画、内容增长轮询处理流式                                            |
| 100+ 均匀行的长列表       | `VirtualList`                                                     | 仅约 15 个实体已挂载，Fenwick 滚动数学 O(log n)，高度在带键的 `setItems` 后存活 |
| 可变行高的长列表          | `VirtualList` + `estimatedRowHeight`                              | 首次挂载时估计，已度量高度替换它们并锚定视口                                    |
| 带流式底部固定的聊天      | `VirtualList` + `jumpToBottom()` 或 `ScrollView.scrollToBottom()` | 贴合而非弹簧重定向，保持视口静止                                                |

### 6.4 滚动条可见性——`clip-overflow` vs 真实滚动条

VectoJS 无原生滚动条部件——`ScrollView` 与 `VirtualList` 自行裁剪并处理滚轮/拖动，而无障碍影子保留阅读顺序。视觉滚动条（DevTools 审计 `clip-overflow` 位于 `packages/devtools/src/audit.ts:51`，对 `ScrollView`/`VirtualList`/`Tree`/`Table` 豁免）是装饰性 `Rect`，其滑块 `y` 跟踪 `scrollY / maxScroll`——而非独立交互目标。

## 7. 难点——有据可查

| 陷阱                                                      | 位置                                                        | 状态                                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| 容器从未为其内容定尺寸（`Tabs`/`Panel`/`PanelGroup` 链）  | `ResizablePanel.ts:164`、`Card.ts:92`、forge 2026-07-10     | 已在 `@vectojs/ui@1.11.0` 修复——`setContent(entity, fit?)` 带每帧 fit 同步 |
| 整卡点击需要不可见叠加 Button                             | `Card.ts:35`、forge 2026-07-10                              | 已在 `@vectojs/ui@1.11.0` 修复——`Card({ onClick, label })`                 |
| 面板拖动使用局部空间增量（光标滞后）                      | `ResizablePanel.ts:78`、forge 2026-07-10                    | 已在 `@vectojs/ui@1.1.3` 修复——场景空间 `sceneX`/`sceneY`                  |
| Tabs 在约 10 个标签后坍缩为细条                           | forge 2026-07-10                                            | 已在 `@vectojs/ui@1.1.3` 修复——固定 `tabWidth` + 溢出滚动                  |
| Tabs 拉伸 × 视觉上紧邻 NEXT 标签文本                      | `Tabs._tabW()`、forge 2026-07-16                            | 已在 `@vectojs/ui@1.9.4` 修复——`tabWidth` 为最大值，剩余留空               |
| Overlay.showAtPoint 在首次挂载前静默无操作                | `Overlay.ts:98`、forge 2026-07-17                           | 已在 `@vectojs/ui@1.10.0` 修复——`source` 参数用于场景解析                  |
| Stack.add() 在流式场景下为 O(n²)                          | `Stack.ts:167`、`Flow.ts:19`、forge 2026-07-19              | 已在 `@vectojs/ui@1.11.4` 修复——`appendFast`/`appendFastWrap`              |
| ScrollView 默认弹簧欠阻尼（5 次反转，801 ms）             | `ScrollView.ts:14`、forge 2026-08-02                        | 已在 `@vectojs/ui` #322 修复——`scrollPhysics` + `DOCUMENT_SCROLL_PHYSICS`  |
| VirtualList 无键 setItems 在屏上留下陈旧行                | `VirtualList.ts:248`、forge 2026-08-02/08                   | 已在 `@vectojs/ui@2.15.1` 修复                                             |
| 滚动部件忽略 deltaMode（行/页滚轮仅滚动 1-3 px）          | `ScrollView.ts:105`、`VirtualList.ts:583`、forge 2026-08-08 | 已在 `@vectojs/ui@2.15.2` 修复                                             |
| deltaMode 修复丢弃 VirtualList markDirty（onDemand 冻结） | `VirtualList.ts:596`、forge 2026-08-08                      | 已在 `@vectojs/ui@2.15.3` 修复                                             |
| Popover + Overlay 隐藏时无障碍/指针泄漏                   | `Overlay.ts:48`、forge 2026-08-13                           | 已在 vectojs#474 修复，已合并 vectojs#509                                  |
| 虚拟化 Table 在 layout() 上不重同步字符串单元             | `Table.ts:354`、forge 2026-08-13                            | 已在 vectojs#494 修复，已合并 vectojs#520                                  |
| Tabs/RadioGroup 热点在数组重赋值时失步                    | `Tabs.ts:229`、forge 2026-08-13                             | 已在 vectojs#494 修复，已合并 vectojs#520                                  |
| 无键 VirtualList setItems 留下陈旧 _velY（瞬态过冲）      | `VirtualList.ts:290`、forge 2026-08-13                      | 已在 vectojs#494 修复，已合并 vectojs#520                                  |

## 8. 检查清单——落地响应式布局改动前

1. **逻辑视口变化时调用 scene.resize()。** 逻辑 `width`/`height` 为普通字段（`Scene.ts:2049`）——直到 `resize()` 提升两个世代计数器并重缩放后备存储前，无任何观察。在 `disableWindowResize: false`（窗口路径）与 `true`（ResizeObserver 路径）下均检查。以 `Number.isFinite && >= 0` 检查守卫（`Scene.ts:6395`）。
2. **保持容器定尺寸对称。** 每个拥有子节点 `width`/`height` 的容器必须经 `update()` 重应用（`ResizablePanel.ts:190` / `Card.ts:118` 处 `Panel`/`Card` 模式），因为 `Entity.width/height` 为无 setter 钩子的普通字段。对 `Entity.ts:1065 add()` 之外的直接 `children.push` 做 grep——它完全跳过 `markStructureChanged` 与 `markDirty`。
3. **Stack 快速路径必须保持不变量。** 非换行 `appendFast` 假设 `align: 'start'` 且无 `fillTarget`；换行 `appendFastWrap` 恢复四标量末行状态（`Stack.ts:95`）并在全量 `layout()` 后从行重算（`Stack.ts:422`）。让后续子节点影响此前位置的新标志必须使 `fastAppendDirty` 失效。
4. **叠加层归属为 overlayRoot 而非父节点。** `Overlay.showAt`（`Overlay.ts:70`）重父到 `scene.overlayRoot`——始终从 `showAtPoint` 调用方传入 `source`（`Overlay.ts:98` 第三参），使从未挂载的叠加层在首次显示时解析 `scene`。
5. **滚动积分器不得重触发空闲节流。** `ScrollView.update()`（`ScrollView.ts:219`）仅当钳制移动 `targetY` 时重赋值 `content.y`；`VirtualList` 仅当滚动状态变化时 `markDirty()`（`VirtualList.ts:596`）。每帧无条件变脏使 `onDemand` 场景永久全速率。
6. **deltaMode — 先缩放再钳制。** 行→×16、页→×视口，于 `clampTarget()`/`_clamp()` 前（`ScrollView.ts:105`、`VirtualList.ts:583`）。Chrome/jsdom 始终交付 `deltaMode: 0`，因此该缺陷在彼处不可见。
7. **VirtualList：从键而非索引重建高度。** 带 `keyForItem` 的 `setItems` 后，Fenwick 树从 `_heightByKey` 重播种（`VirtualList.ts:272`）且 `_rekeyPool()`（`VirtualList.ts:317`）在任何高度读取前移动池化实体——未重键的按索引复用将每个高度写入错误缓存槽。
8. **PanelDrag 必须保持场景空间且不在 pointerleave 上结束。** `PanelResizeHandle`（`ResizablePanel.ts:86`）在可用时读取 `sceneX`/`sceneY`，且不再在 `pointerleave` 上结束拖动——影子节点持有捕获。

---

_系列：00 总览 → 01 选区 → 02 文本+布局 → 03 语义投影 → 04 流式 Markdown → 05 TeX → 06 VMT 运行时 → 07 渲染器 → 08 WASM → 09 Three/XR → 10 视频导出 → 11 图布局 → 12 DevTools → **14 响应式布局** → 99 综合。_
