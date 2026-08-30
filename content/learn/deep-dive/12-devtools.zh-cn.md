---
title: '12 — DevTools — 运行时自检与审计'
description: '为何 canvas 没有 Elements 面板、VMT 检查器如何在状态空间中替代它，以及无头模型层——拾取、几何回读、审计、快照、命中解释、脏帧归因与桥接/插件协议。'
order: 32
---

# 12 — DevTools — 运行时自检与审计

> `<canvas>` 没有 Elements 面板。浏览器能向你展示像素与 DOM 镜像，却无法展示决定绘制哪些像素、保留哪些镜像的 Virtual Math Tree。DevTools 就是那块面板——一个状态空间检查器，让调试 VectoJS 场景始终停留在数字而非截图层面。

- **你将学到**：为何 VectoJS 需要专属检查器、面板如何不干扰被检场景，以及无头模型层中的每个纯函数——树模型、拾取、实体/a11y/文本回读、七层几何、布局/a11y/文本/选区/GPU/加速器审计、快照/差异、命中解释、事件追踪、脏帧诊断与 JSON-RPC 桥接及其插件协议。
- **你不会学到**：`Scene` 如何调度帧（boss 06）、渲染器如何绘制它们（boss 07）或 WASM 如何加速它们（boss 08）。本文档是*读取*这些子系统而不变更它们的工具集。

## 1. 为何先看数字而非截图

截图回答“出问题了”。数字回答_哪个实体_错了、*偏差多少像素*，以及_引擎为何认为它是对的_。整个 DevTools 包（`packages/devtools/src/`）围绕这一阶梯组织：

1. **定位**——哪个实体拥有该像素（`pickInScene`）以及它在树中的位置（`buildTreeModel`、`entityPath`）。
2. **度量**——其几何、变换与世界边界的世界单位（`inspectEntity`）以及它携带的每个可能发散的框（`highlightGeometry`）。
3. **解释**——为何引擎选中该实体而非你预期的那个（`explainHitTest`），以及浏览器事件实际落在何处（`createEventTrace`）。
4. **审计**——是否有实体在视觉上看似正常却违反结构不变量（`auditScene`、`auditA11y`、`auditTextShaping`）。
5. **差异**——两个状态之间有何变化，按稳定路径而非随机 id 寻址（`captureSnapshot` / `diffSnapshots`）。
6. **归因**——为何 `onDemand` 场景永不空闲以及渲染循环的真实开销（`diagnoseDirty`、`Scene.frameStats` 位于 `packages/core/src/tree/Scene.ts:3515`）。

每一级返回纯数据而非像素。这使每项检查都能成为 CI 门禁：`expect(auditScene(scene)).toEqual([])`（`vectojs-docs/content/reference/devtools-audit.md:12`）。

## 2. 两套界面，一套模型层

| 界面                                     | 入口                                                                                | 渲染                                                                                                | 需要 `destroy()`                                                                                   | 是否发往生产                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **面板**（`@vectojs/devtools`）          | `attachDevtools(scene)` → `DevtoolsPanel` 位于 `packages/devtools/src/panel.ts:140` | 自身 `Scene` 停靠于视口边缘，`contentProjection: false`、`renderMode: 'onDemand'`（`panel.ts:299`） | 是——`destroy()` 拆除定时器、监听器、高亮、面板场景与容器（`panel.ts:1272`）                        | 从不——`if (import.meta.env.DEV)` 守卫（`vectojs-docs/content/reference/devtools.md:51`） |
| **无头**（`@vectojs/devtools/headless`） | 从 `packages/devtools/src/headless.ts:1` 重导出的纯函数                             | 无                                                                                                  | 仅 `EventTrace` 附加 document 监听器（`packages/devtools/src/eventTrace.ts:85`）且必须 `destroy()` | 是——无面板、无 `@vectojs/ui` 依赖，可用于 Vitest/Node/agents                             |

面板*调用*无头层，而非复制它。无头层承载约 60 个导出的纯函数——更大且更有用的一半（`vectojs-docs/content/reference/devtools.md:18`）。

```ts
import { attachDevtools } from '@vectojs/devtools';
import { auditScene, captureSnapshot, explainHitTest } from '@vectojs/devtools/headless';

if (import.meta.env.DEV) {
  const devtools = attachDevtools(scene, { traceEvents: true });
  // devtools.detach() === devtools.destroy()
}
```

`DevtoolsOptions` 位于 `packages/devtools/src/panel.ts:42`——`width` 默认 360、`refreshInterval` 默认 500、`dockSide` `right|left`、`showPerf` 默认 true、`traceEvents`/`traceCapacity`、`defaultTab`。无头子路径的存在使生产测试包无需面板或 `@vectojs/ui` 即可拉取模型层（`vectojs-docs/content/reference/devtools.md:58`）。

## 2a. 面板展示什么——以及刻意不展示什么

位于 `packages/devtools/src/panel.ts:306` 的停靠头部承载三个幽灵按钮——**⌖** 拾取（`panel.ts:340`）、**⟳** 刷新（`panel.ts:341`）、**⚠** 审计（`panel.ts:342`）——以及三个计数 `Pill`（`panel.ts:104`）：实体总数、交互式 **⚡** 与审计发现 **⚠**（`panel.ts:345`）。位于 `panel.ts:537` 的 `Tabs` 栏将工具拆为 **Tree · Info · Audit · A11y · Log · ⚙**，外加每个已注册 `PluginInspector` 一个标签（`panel.ts:530`、`panel.ts:1027`）。

- **Tree**——位于 `panel.ts:383` 的 `TreeView` 与位于 `panel.ts:371` 的过滤 `Input`。位于 `panel.ts:761` 的 `setFilter(text)` 经 `applyFilterToTree`（`panel.ts:767`）剪枝，该函数浅拷贝 `{...node}` 使原始节点保留完整子列表；过滤后的标签仍在版本稳定的快速路径上重写。行显示 `type (x,y) W×H ⚡ ▶`。
- **Info**——`INSPECT_ROWS = 20` 行 `Text`（`panel.ts:71`）展示来自 `describeEntity` 的六行通用信息外加描述器输出、内联 `x/y/opacity` 编辑器（`panel.ts:418`），以及由 `entityPath`（`inspect.ts:82`）与 `inspectEntity` JSON 支撑的 **Copy path / Copy JSON** 按钮（`panel.ts:442`）。方向键以 1 px 步进（Shift：10 px），`+/-` 以 0.1 步进不透明度（`panel.ts:228`）——在动代码前确认哪个实体拥有布局缺陷。
- **Audit**——位于 `panel.ts:469` 的 `TreeView`，每行一个发现（`panel.ts:844`），位于 `panel.ts:860` 的 `selectFinding(i)` 经合并的 `auditRows`（场景 + 插件于 `panel.ts:840`）而非仅 `findings[i]` 解析。
- **A11y**——来自位于 `panel.ts:1173` 的 `writeA11y` 的 `A11Y_ROWS = 22` 行（`panel.ts:73`）：`inspectA11y` 回读（`a11yInspect.ts:227`）外加带 `▸` 标记选中实体的缓存 `auditA11y` 发现。
- **Log**——当 `traceEvents: true`（`panel.ts:47`）时有界的 `EventTrace` 条目（`panel.ts:511`），`traceCapacity` 默认 50（`panel.ts:49`）。经 `eventTrace.subscribe` → `writeTrace`（`panel.ts:521`）→ `panelScene.markDirty()` 更新。
- **Settings（⚙）**——位于 `panel.ts:654` 的 `buildSettings`：`Toggle` 控制高亮，`Dropdown` 控制 `refreshInterval` 与 `dockSide`。位于 `panel.ts:1070` 的 `setRefreshInterval` 同时控制两个定时器；位于 `panel.ts:1088` 的 `setDockSide` 经 `applyDockSideStyle`（`panel.ts:635`）切换样式。
- **Perf 条**——固定于底部的 `Card`（`panel.ts:557`）由 `layout()`（`panel.ts:608`）重排，每 250 ms 读取 `Scene.frameStats`（`panel.ts:571`）。
- **选中高亮**——宿主叠加层上的 `HighlightEntity`（`panel.ts:874`），默认 `['aabb']`（`panel.ts:172`），可经 `setHighlightLayers`（`panel.ts:926`）切换。

停靠容器与画布均为 `pointer-events: none`（`panel.ts:288`），与 `Scene.a11yRoot` 一致——因此空白停靠像素永不窃取宿主输入。

## 3. 树模型与拾取——与引擎相同的遍历

### 3.1 树模型

位于 `packages/devtools/src/model.ts:31` 的 `buildTreeModel(root)` 返回 `{ nodes, index }`：

- `nodes`——`root` 每个直接子节点一项，各自带其子树。叶子 `children: undefined` 而非 `[]`（`model.ts:40`）。
- `index: Map<string, Entity>`——每个深度上的每个后代，按 `entity.id` 索引，使选中 id 能回溯到活动实体。
- `label`——由 `geometryLabel`（`model.ts:16`）烘焙的 `` `${type} (${x},${y}) ${W}×${H} ⚡ ▶` ``，仅当 `interactive` / `hasPendingAnimations()` 时带徽章。

位于 `model.ts:56` 的 `refreshTreeLabels(nodes, index)` 原地重写这些几何徽章——无节点或索引 churn——并在至少一个标签变化时返回 `true`，使面板可跳过重绘工作。每 `RECONCILE_INTERVAL_MS = 3000`（`panel.ts:80`）的强制调和限定了当某处在未提升 `structureVersion` 情况下变更 `children` 时的陈旧期（`panel.ts:581`，`vectojs-docs/forge/findings/devtools-and-telemetry.md:356`）。

### 3.2 拾取

位于 `model.ts:82` 的 `findEntityAt(root, x, y)` 与位于 `model.ts:214` 的 `pickInScene(scene, x, y)` 刻意与 `HitTester.findHitRecursively`（`packages/core/src/tree/scene/HitTester.ts:227`）**相同遍历与相同接受谓词**，已在 `vectojs#483` 后验证：

- `opacity <= 0` 提前返回并剪枝子树（`model.ts:86`）。
- `insideClipAncestors`（`model.ts:115`）经 `worldToLocal` 检查每个 `clipChildren` 祖先的世界框——因此滚出视口的内容不可拾取。
- `isPointerTransparent`（`model.ts:105`）镜像 `HitTester.isPointerTransparent`——`disabled === true` 或 `pointerEvents: 'none'` 退出命中但仍遍历子节点。
- 仅 `isPointInside(x,y)` 决定（`model.ts:95`）——无世界 AABB 回退，因此粒子与装饰形状永不成为错误拥有者（`model.ts:77`，已在 `vectojs#483`、`forge 2026-08-13` 修复）。

`pickInScene` 先检查叠加树再检查主树（`model.ts:215`），因此打开的模态框胜过其后的内容——最常见的“点击无处可去”惊讶。`findEntityAt` 也测试传入的根，因此传入 `scene.rootEntity` 可能返回该根；`pickInScene` 是更安全的默认（`vectojs-docs/content/reference/devtools-inspect.md:46`）。

## 4. 选中回读——几何、描述器与归属属性

### 4.1 一个实体的两套回读

- 位于 `model.ts:153` 的 `describeEntity(entity)`——面向面板的 `string[]`：六行固定行（type/id、`x/y/w/h` 对布局拥有属性带 `*`、scale/rotation/opacity、`world [a b c d e f]`、interactive/animating、子数量），外加当 `layoutControlledProperties` 非空时一行 `* prop set by Parent — edits revert`（`model.ts:172`），随后是实体自身 `getDevtoolsDescriptor()` 限 `DESCRIPTOR_LINE_BUDGET = 12` 行（`model.ts:151`）。字段值截断至 32 字符，备注至 60（`model.ts:143`）。抛出的描述器贡献 `— descriptor threw —` 而非使面板崩溃（`model.ts:184`）。

- 位于 `packages/devtools/src/inspect.ts:99` 的 `inspectEntity(entity)`——面向机器的 `EntityInfo`（`inspect.ts:4`）：每个数字舍入到 2 位小数（`inspect.ts:48`）、`worldTransform`、`worldBounds`、`interactive/animating/clipChildren/childCount`、可选 `text`（经 `inspect.ts:70` 处 `textPreviewOf`，`TEXT_PREVIEW_MAX = 80`）、可选 `a11y { tag, role, label }`、可选 `descriptor`、可选 `layoutControlled`（`inspect.ts:42`）。两者均在不使工具崩溃的前提下处理抛出的 `getDevtoolsDescriptor()`——在你调试的实体上崩溃的调试工具比缺字段更糟（`inspect.ts:136`）。

位于 `inspect.ts:82` 的 `entityPath(entity)` 渲染 `Scene > Card#a1b2 > Text#c3d4`，id 截断至 8 字符；无父节点的树顶显示为 `Scene`——因此分离实体与真实根无法区分，当路径异常短时值得检查。

### 4.2 布局拥有的属性

位于 `inspect.ts:157` 的 `layoutControlledProperties(entity)` 询问**父节点** `getLayoutControlledProperties(child)`——仅容器知道它覆盖哪些属性（`ScrollView` 区分内部包装与调用方添加的子节点）。面板在行内以 `*` 标记这些属性（`model.ts:161`），并在用户编辑其中之一时立即说明该值会在下次布局时回退（`panel.ts:1108`、`panel.ts:1153`），而非静默拒绝编辑。编辑 Stack 子节点以观察如何移动是合理的；隐藏其回弹原因则不然。

## 5. 高亮几何——七个框，一类缺陷

位于 `packages/devtools/src/highlightGeometry.ts:1` 的 `highlightGeometry(scene, entity, opts?)` 按固定顺序返回至多七个 `HighlightLayer` 值，无论请求顺序如何：

| 种类      | 含义                                      | 来源                                                            |
| --------- | ----------------------------------------- | --------------------------------------------------------------- |
| `aabb`    | 变换后布局四边形的轴对齐框                | `getWorldBounds()`                                              |
| `layout`  | 带旋转/倾斜的真实四边形                   | 世界变换 × `[0,0,w,h]`                                          |
| `render`  | `getBounds()`——实体实际绘制处             | `entity.getBounds()`                                            |
| `clip`    | 最近 `clipChildren` 祖先的框              | 祖先遍历                                                        |
| `content` | 可选中 DOM 内容镜像的框                   | 经 `getContentElement` 的 `rectToSceneBox`                      |
| `a11y`    | 无障碍投影元素的框                        | 位于 `packages/core/src/tree/Scene.ts:6446` 的 `getA11yElement` |
| `hit`     | 经 `isPointInside` 探测采样的真实命中区域 | `sampleHitRegion`                                               |

任一层上的 `divergesFromLayout` 意味着该框与布局四边形偏差超过 1 px——即点击落在用户未瞄准之处的条件（`vectojs-docs/content/reference/devtools-inspect.md:222`）。`highlightGeometry` 永不抛出；不可用层返回 `{ kind, polygons: [], unavailable: reason }`。

`hit` 不在默认集合中——它在网格上采样 `isPointInside`（`hitSampleStep` 默认 8、`hitSampleBudget` 默认 4096，`packages/devtools/src/highlightGeometry.ts:1`）且开销为 `O((w/step)·(h/step))` 次探测，因此将 `step` 减半会使开销翻四倍。`hit` 的发散按**面积覆盖率**而非范围判定，因此圆在方形中会被记录（`vectojs-docs/content/reference/devtools-inspect.md:225`）。位于 `panel.ts:1337` 的面板 `HighlightEntity` 经 `showOverlay()`（`panel.ts:876`）在*宿主*场景叠加层上绘制这些层，按 `LAYER_COLORS`（`panel.ts:1325`）着色，`aabb` 保留原始 `ACCENT` 使既有截图保持可读。

## 6. 审计——结构化发现、有序、确定性

每项审计均返回确定性排序的 `Finding[]`，使快照稳定。

### 6.1 布局审计

位于 `packages/devtools/src/audit.ts:321` 的 `auditScene(scene, opts?)` 委托给位于 `audit.ts:130` 的 `auditTree(root, sceneBounds, opts)`。四种 `AuditKind` 值（`audit.ts:7`）：

- `text-overflow`——已度量的文本框逃出最近的带尺寸、非文本祖先。
- `clip-overflow`——内容逃出 `clipChildren` 祖先（在 `ScrollView`/`VirtualList`/`TreeView`/`Table` 中垂直豁免，经 `audit.ts:51` 处 `DEFAULT_SCROLLABLE`）。
- `overlap`——**仅兄弟节点**，经 `SpatialHashGrid` 广相遍历（`audit.ts:190`）而非此前的 O(k²) 双重循环——每个框仅计算一次，仅比较网格单元邻居。要求交集在两轴上均超过 `tolerance`（`audit.ts:231`）。
- `viewport-overflow`——完全无带尺寸祖先，且实体逃出 `sceneBounds`。

选项：`tolerance`（默认 0.5）、`includeOverlay`（默认 false——模态框/高亮刻意脱离流）、`scrollableTypes`（按 `constructor.name` 匹配）、`ignore`（剪枝子树）、`ignoreOverlap`（允许有意堆叠）。`opacity: 0` 剪枝整棵子树；发现按 `kind → entityPath → otherPath` 排序（`audit.ts:305`）。`includeOverlay: true` 时结果为两段已排序串联——如需全局单一顺序请重排（`vectojs-docs/content/reference/devtools-audit.md:85`）。

位于 `audit.ts:70` 的 `worldBox` 经 `getWorldTransform()` 使用声明式 `[0,0,w,h]` 框，而非 `getWorldBounds()`——对包含关系而言声明框即契约；渲染范围归属 `clip-overflow`。

### 6.2 无障碍审计

位于 `packages/devtools/src/a11yInspect.ts:299` 的 `auditA11y(scene, opts?)` 发出五种 `A11yAuditKind` 值（`a11yInspect.ts:23`）：

`no-accessible-name`、`role-tag-conflict`、`disabled-divergence`（在不透明度 0.6–0.9 带死区）、`focusable-but-clipped`、`duplicate-label`（对第二个及之后报告，`otherId` 指向首个）。与布局审计不同，它**默认包含叠加层**——模态框正是焦点陷阱所在——而 `a11yHidden` 会剪枝整棵子树。结果按遍历顺序，`duplicate-label` 追加于末尾（`vectojs-docs/content/reference/devtools-audit.md:137`）。

### 6.3 文本塑形审计

位于 `packages/devtools/src/textInspect.ts:447` 的 `auditTextShaping(scene)` 仅遍历 `scene.rootEntity` 并发出一种 `atlas-miss`——字体图集中缺失的字形，每项发现采样至多五个不同缺失。仅**已准备文本**路径可发出；内容网格实体永不会（`vectojs-docs/content/reference/devtools-audit.md:157`）。

### 6.4 选区审计

位于 `packages/devtools/src/selectionAudit.ts:1` 的 `auditSceneSelection` / `auditEntitySelection` 将实体自身的局部行几何与实时 DOM `Range` 矩形对比，归一化到局部逻辑像素以消除 DPR/缩放影响。对每行违规发现 `selection-drift` 并带 `expectedLeft/Right`、`actualLeft/Right`、`leftDrift/rightDrift`。需要真实浏览器——无守卫地引用 `document`（`vectojs-docs/content/reference/devtools-audit.md:202`）——并在运行时清除用户当前选区。

## 7. 快照与差异——无需截图的回归

位于 `packages/devtools/src/snapshot.ts:133` 的 `captureSnapshot(scene)` 捕获确定性、JSON 安全的树：子顺序即渲染顺序，数字舍入到 2 位小数（`snapshot.ts:52`），省略默认值属性。位于 `snapshot.ts:302` 的 `diffSnapshots(a, b)` 返回带 `path / kind('added'|'removed'|'changed') / changes` 的 `SnapshotDiff[]`。

键控——为何重命名一行不是重写 200 行：位于 `snapshot.ts:79` 的 `nodeKey(entity)` 优先 `devtoolsKey`（`k:`）随后 a11y `label`（`l:`，限 `KEY_LABEL_MAX = 64` 于 `snapshot.ts:55`），永不使用绘制文本（内容而非身份）且永不使用实体 id（每次运行随机）。位于 `snapshot.ts:196` 的 `keyedPairs` 仅当键在层级**两侧**唯一时使用；冲突时回退到索引对齐。路径在键控时使用 `Row{k:row-42}`，否则 `Row[7]`（`snapshot.ts:163`），因此路径本身在重排后仍存活（`vectojs-docs/forge/findings/devtools-and-telemetry.md:317`，已在 `vectojs#481/#510` 修复）。

仅 `snapshot.ts:142` 处 `COMPARED_KEYS` 被比较（`type/x/y/width/height/worldBounds/opacity/interactive/animating/clipChildren/text`）；`scene.width/height`、`id` 与 `key` 不产生差异，`added`/`removed` 不递归。

## 8. 命中解释与事件追踪

### 8.1 解释一次命中测试

位于 `packages/devtools/src/hitExplain.ts:139` 的 `explainHitTest(scene, x, y)` 按相同顺序遍历并应用与 `HitTester` 相同的门控，但为每个节点记录 `HitCandidate` 而非在首次命中时返回——每个落选者带其 `HitVerdict`（`hitExplain.ts:20`）：`accepted / invisible / clipped / pointer-transparent / outside-shape / occluded`。`invisible`（`opacity <= 0`）剪枝子树并命名跳过多少后代（`hitExplain.ts:154`）。先叠加层后主层（`hitExplain.ts:267`）——最常见惊讶。`occluded` 在后处理中赋值：胜者下方原本可接受的实体被重写（`hitExplain.ts:278`），因此“该像素下有多少东西”可计数。位于 `hitExplain.ts:299` 的 `formatHitExplanation` 以 `hitExplain.ts:306` 处字形 `✓ / · / ✗` 渲染缩进行。

这是诊断而非每帧调用——它遍历整棵树。在 WASM 命中网格场景中，零尺寸 `clipChildren` 祖先可能解释为 `clipped` 而 WASM 路径仍记录命中：唯一有文档记载的分歧（`vectojs-docs/content/reference/devtools-inspect.md:293`）。

### 8.2 事件路由追踪

位于 `packages/devtools/src/eventTrace.ts:275` 的 `createEventTrace(scene, opts?)` 在不添加 VMT 监听器或改变分发的情况下观测浏览器输入。七种 `EventTraceType` 值（`eventTrace.ts:6`），四种 `EventTraceSource` 值（`eventTrace.ts:16`：`a11y / content / canvas / document`），`EventTraceOptions.capacity` 默认 50（`eventTrace.ts:44`）。每个 `EventTraceEntry`（`eventTrace.ts:26`）记录目标 id/路径、场景+局部坐标、修饰键、滚轮的 `deltaX/Y` 与最终 `defaultPrevented`。

`defaultPrevented` 在投影的 VMT 路由后于**微任务**中定版，因此它反映应用最终的快捷键/选区决策（`eventTrace.ts:95` `onEventBubbled`）。测试必须在断言前等待一个宏任务。`pointermove` 按约 60 Hz 帧合并为每帧一个（`eventTrace.ts:77` 处 `POINTERMOVE_COALESCE_MS = 16`），以避免 O(n) 拾取扭曲性能 HUD（`eventTrace.ts:69`，`vectojs#707`）。它附加 14 个 document 监听器，是唯一**必须** `destroy()` 的无头对象（`eventTrace.ts:171`）；`entries` 返回内部实时数组而非拷贝。

## 9. 文本、GPU、加速器与 Markdown 回读

位于 `packages/devtools/src/textInspect.ts:179` 的 `inspectText(entity)` 返回 `TextInspection`（`textInspect.ts:15`）或当既无 `.text` 也无 `.value` 时返回 `null`。否则它携带已解析的 bidi 层级、`levelRuns` 与反转段、`visualOrder`、经 `Intl.Segmenter` 重分段的字形 `clusters`（`textInspect.ts:148`），以及三档之一的每字形详情（`textInspect.ts:157`）：

| 档位           | `glyphs[].x` | `metrics/lines` | `atlasMiss` |
| -------------- | ------------ | --------------- | ----------- |
| 已准备内容网格 | 有           | 有              | 永不        |
| 已准备文本     | 无           | 无              | 有          |
| 皆非           | 无字形       | 无              | 无          |

`unavailable: string[]`（`textInspect.ts:74`）命名每个无法报告的能力及其原因——缺失字段总被解释而非静默缺席。位于 `textInspect.ts:295` 的 `shapeProbe(text, opts?)` 让任意字符串经相同管线运行而无需实体或场景，因此可在单元测试中检查塑形。位于 `textInspect.ts:348` 的 `formatTextInspection` 为面板/插件标签渲染 `PluginRow[]`。

位于 `packages/devtools/src/gpuInspect.ts:1` 的 `gpuInspector` / `inspectGpu(scene)` 与位于 `packages/devtools/src/acceleratorInspect.ts:1` 的 `acceleratorInspector` / `inspectAccelerators(scene)` 暴露 GPU 与 WASM 后端姿态。`inspectGpu` 报告绘制计数器（位于 `gpuInspect.ts:1` 的 `enableDrawCountersCommand` / `resetDrawCountersCommand`）、过度绘制与 `save/restore` 平衡；`inspectAccelerators` 报告每后端的 `AcceleratorReport { status, reason }`（位于 `packages/core/src/tree/scene/WasmBackendFacade.ts:66`）——WASM 命中/网格/动画内核是否接受参数或回退到 JS 及其原因。两者均为纯读取，因此 CI 门禁可断言 `auditGpu(scene).length === 0`，一如布局门禁。

位于 `packages/devtools/src/markdownInspect.ts:1` 的 `inspectMarkdownStream(entity)` 报告流式复用（`auditMarkdownStreaming` / `markdownStreamAudit`）——增量调和中存活多少 token vs 重建多少实体——而 `selectionAudit` / `highlightGeometry` 已在上文覆盖。每个回读遵循相同契约：永不抛出，当实体缺能力时返回 `{ unavailable: reason }`，并将数字舍入到 2 位小数。

## 10. 脏帧归因与实时帧遥测

### 10.1 `diagnoseDirty`——为何 `onDemand` 永不休眠

位于 `packages/devtools/src/dirtyDiagnosis.ts:70` 的 `diagnoseDirty(scene, opts?)` 将 `Scene.dirtyReasons` 转为裁决。`scene.setDirtyTracking(true)`（`packages/core/src/tree/Scene.ts:3474`）选择加入；`scene.dirtyReasons: DirtyReasonEntry[]`（`Scene.ts:3489`，最频繁优先，FIFO 限 `MAX_DIRTY_REASONS = 200` 于 `packages/core/src/tree/scene/DirtyTracker.ts:71`）持有 `{ entity?, reason, property?, count, firstFrame, lastFrame }`。`diagnoseDirty` 计算 `perFrame = count / frames`（`dirtyDiagnosis.ts:97`）并分离 `everyFrame: perFrame >= 0.9`（`dirtyDiagnosis.ts:105`）——这些是 `onDemand` 场景必须停止以真正空闲的项。`summary` 在 `everyFrame` 非空时命名最糟原因，在 `renderMode === 'always'` 时注明无关情况（`dirtyDiagnosis.ts:112`），并在从未启用追踪时告警（`dirtyDiagnosis.ts:82`）。刻意无头——无需面板与 `@vectojs/ui` 依赖即可用于 Vitest/Playwright/CI。

### 10.2 `Scene.frameStats`——已渲染帧，而非 vsync

位于 `packages/core/src/tree/Scene.ts:3515` 的 `Scene.frameStats: FrameStats`（`FrameStats` 位于 `Scene.ts:518`）读取真实循环遥测：

`fps`（EMA 平滑的已渲染帧节律，限 `maxFPS`，首对前为 `0`）、`frameTimeMs`（仅最后一次 `render()` 的墙钟）、`frameIntervalMs`、`dt`、`renderedFrames/skippedFrames` 计数器、`renderMode`、`dirty`。位于 `panel.ts:800` 的面板性能条显示 `fps · ms/frame / entities · mode · rendered/skipped`，每 250 ms 更新（`panel.ts:571`）。空闲 `onDemand` 场景诚实地读取 `0 fps`；自动节流的 `'always'` 场景读取其 `idleFPS` 下限（默认 60）（`vectojs-docs/content/reference/devtools.md:72`）。渲染器始终重绘整块画布，因此不存在脏矩形——`dirty` 是布尔重绘待定标志（`vectojs-docs/forge/findings/devtools-and-telemetry.md:73`）。`forge 2026-07-18` 的教训：永不独立采样 rAF——仅实体的 `update()` 或 `frameStats` 度量 Scene 实际渲染的帧。

无头层读取的其他 Scene 表面：`structureVersion`（`Scene.ts:3462`、`Scene.ts:1636`）用于树形陈旧性、`getA11yTree()`（`Scene.ts:5412`）用于公开 a11y 快照、`getA11yElement(id)`（`Scene.ts:6446`）与 `getContentElement(id)` 用于 DOM-vs-canvas 框对比（`packages/devtools/src/a11yInspect.ts:143`）、每实体的 `getContentProjection()`，以及下述插件回读。

## 10a. Scene 集成点——DevTools 在何处读取引擎

无头层永不伸入 Scene 私有；它读取 `packages/core/src/tree/Scene.ts` 为任意消费者发布、且 `packages/core/src/index.ts` 作为公开 API 重导出的公共表面：

- 位于 `Scene.ts:3462` 的 `Scene.structureVersion: number`（由 `Scene.ts:1636` 处 `WasmBackendFacade.structureVersion` 支撑）——由 `Entity.add/remove`（`packages/core/src/tree/Entity.ts:1086` / `:1123`）递增。每个树形缓存在此未变期间有效；属性变更刻意不提升它，这正是 `refreshTreeLabels` 存在的原因。
- 位于 `Scene.ts:3515` 的 `Scene.frameStats: FrameStats` / 位于 `Scene.ts:518` 的 `FrameStats`——唯一可信的 FPS 来源，外加 `frameTimeMs`、`frameIntervalMs`、`dt`、`renderedFrames/skippedFrames`、`renderMode`、`dirty`。在 `Scene.ts:5569` 处 `Scene.loop` 围绕 `render()` 调用更新；位于 `Scene.ts:3420` 的 `step(dt)` 将其置零。
- 位于 `Scene.ts:3489` 的 `Scene.dirtyReasons: DirtyReasonEntry[]` 与位于 `Scene.ts:3474` 的 `setDirtyTracking` / 位于 `packages/core/src/tree/scene/DirtyTracker.ts:70` 的 `DirtyTracker`——有界 FIFO（`DirtyTracker.ts:71` 处 `MAX_DIRTY_REASONS = 200`），按 `entity:reason.property` 键控（`DirtyTracker.ts:120`）。
- 位于 `Scene.ts:5412` 的 `Scene.getA11yTree(): A11yTreeNode[]`（`Scene.ts:538` 处 `A11yTreeNode`）与每实体的 `getA11yElement(id)`（`Scene.ts:6446`）/ `getContentElement(id)`——其实时 DOM 镜像的 `getBoundingClientRect()` 与 `getWorldBounds()` 在 `highlightGeometry` 与 `inspectA11y` 中对比。
- 位于 `Scene.ts:1147` 的 `Scene.renderMode: 'always' | 'onDemand'`、位于 `Scene.ts:408` 的 `SceneOptions.renderMode`，以及位于 `Scene.ts:3443` 的 `DirtyTracker` 委托——`diagnoseDirty` 归因的策略。
- 位于 `packages/core/src/tree/Entity.ts:1937` 的 `Entity.getDevtoolsDescriptor(): DevtoolsDescriptor | null` 与位于 `packages/core/src/tree/Entity.ts:968` 的 `getLayoutControlledProperties(entity)`——使 DevTools 无需组件类型表即可工作的两个应用提供钩子。

拥有 GPU/DOM 资源的子类在调用 `super.destroy()` 前覆盖 `destroy()`（`packages/core/src/tree/ComputeParticleEntity.ts:419`、`DOMPortalEntity.ts:142`），因此持有 `Map<string, Entity>` 索引（`panel.ts:157`）的面板永不保留已释放实体。

## 11. 桥接与插件协议

### 11.1 JSON-RPC 桥接

位于 `packages/devtools/src/bridge.ts:131` 的 `createDevtoolsBackend(scene, transport, opts?)` 与位于 `bridge.ts:328` 的 `createDevtoolsClient(transport, opts?)` 经 `DevtoolsTransport`（`bridge.ts:97`）——双工 `send / subscribe` 抽象——讲版本化协议（`bridge.ts:33` 处 `DEVTOOLS_PROTOCOL_VERSION = 1`，`bridge.ts:36` 处 `DEVTOOLS_CHANNEL = 'vectojs-devtools'`）。位于 `bridge.ts:39` 的 `DevtoolsMethod` 枚举 20 个方法（`protocol.version`、`tree.get`、`entity.inspect/pick/highlightGeometry`、`scene.audit/a11yAudit/a11yOrder/snapshot/diff/frameStats`、`hit.explain`、`text.inspect`、`markdown.stream`、`gpu.inspect`、`plugin.list/rows/audit`、`command.list/run`）。每个处理器均被包裹，使畸形场景以 `ok: false` 回答而非杀死后端（`bridge.ts:290`）。

`tree.get` 默认序列化至多 `maxTreeNodes = 5000`（`bridge.ts:118`）并报告 `truncated: true` 而非静默截断（`bridge.ts:178`）。响应经 `JSON.parse(JSON.stringify(result))` 往返，因此返回活动实体的处理器在后端的自测中失败，而非作为扩展中的 `structuredClone` 错误（`bridge.ts:300`）。`allowedOrigins` 对任何跨文档传输**必需**——对任何人应答的后端会向任何能 `postMessage` 它的帧泄露场景内容（`bridge.ts:104`）。提供两种传输：用于测试/agents 的 `createDirectTransportPair()`（`bridge.ts:404`）与用于扩展/父帧的 `createWindowTransport(target, targetOrigin)`（后者转发 `event.origin` 供白名单检查，`bridge.ts:439`）。位于 `bridge.ts:459` / `bridge.ts:469` 的 `publishSelection` / `publishStructure` 发出后端发起的 `DevtoolsEvent` 通知（`bridge.ts:81`）。

一个后端服务所有前端——页内面板、浏览器扩展、Playwright 与 agents——因此同一查询的四种实现不会漂移（`bridge.ts:21`）。

### 11.2 插件

位于 `packages/devtools/src/plugin.ts:1` 的 `registerDevtoolsPlugin(plugin)` 添加超越单次选中的检查器标签、审计与命令。位于 `plugin.ts:1` 的 `PluginInspector` 为 `{ id, label, appliesTo?, inspect(ctx): PluginRow[] }`——与组件自身 `getDevtoolsDescriptor()` 字段使用的 `PluginRow { label, value, note? }` 形状相同，因此转发描述器无需转换。`PluginAudit` 返回 `PluginFinding[]`，面板将其作为普通发现追加，使 `selectFinding(i)` 无需知道发现来源（`panel.ts:830`）。面板为每插件标签预分配 `PLUGIN_ROWS = 18` 行 `Text`（`panel.ts:94`），并在包迟注册时经位于 `panel.ts:1027` 的 `syncPluginTabs()` 重建插件标签——在版本检查前，因此新导入的插件无需等到下次结构变更。

## 12. 关键的面板内部机制

- **重排拥有自身 resize。** 面板场景 `disableWindowResize: true` 且必须在每个 `window.resize` 上调用 `panelScene.resize(width, innerHeight)`（`panel.ts:608` `layout()`），重定位标签高度、树/审计高度与性能卡。缺少它，底部锚定的性能条会在任何更短视口下掉出可视区——该缺陷在 100% 缩放时已发布（`vectojs-docs/forge/findings/devtools-and-telemetry.md:100`，已在 `vectojs#132` 修复）。

- **带周期调和的版本门控刷新。** 位于 `panel.ts:709` 的 `refresh()` 当 `host.structureVersion === treeVersion` 且 `allNodes` 非空时跳过遍历——因此 60 Hz 间隔开销低——但仍重写标签（对 `allNodes` 与 `filteredNodes` 的 `refreshTreeLabels` 于 `panel.ts:733`）并重写选中/插件回读。每 `RECONCILE_INTERVAL_MS`（`panel.ts:591`）的强制调和限定直接 `children` 变更未提升版本时可保持陈旧的时长。

- **`pointer-events: none` 停靠契约。** 停靠容器及其画布为 `pointer-events: none`；仅经 `auto` 选择加入的无障碍投影控件（`panel.ts:288`），镜像 `Scene.a11yRoot`（`vectojs-docs/forge/findings/devtools-and-telemetry.md:29`，已在 `@vectojs/devtools@0.4.3` 修复）。拾取处理器在消费点击前检查 `container.contains(ev.target)`（`panel.ts:219`），因此武装拾取模式不会吞掉面板自身按钮（`vectojs#482`，`forge 2026-08-13`）。

- **无障碍审计缓存而非每 tick 重遍历。** `writeA11y` 每 tick 运行（它是选中的回读），但全场景 `auditA11y` 遍历按 `structureVersion` 缓存并带 `A11Y_AUDIT_TTL_MS = 3000` 陈旧 TTL（`panel.ts:85`、`panel.ts:1246`）——审计输入含无额外版本计数器的 label/disabled/opacity/tabIndex/bounds，因此纯版本键会无限期陈旧（`vectojs#496`，`forge 2026-08-13`）。

- **过滤安全标签与插件安全。** 过滤激活时 `Tree` 渲染剪枝拷贝；过滤标签也必须重写否则行冻结于上次重建的几何（`panel.ts:736`，`#786`）。抛出的 `appliesTo` 或 `getA11yAttributes()` 降级为“不适用”/单实体裁决而非使面板空白（`panel.ts:1298`，`a11yInspect.ts:179`，`vectojs#496`）。

## 13. 难点——有据可查

| 陷阱                                                        | 位置                                                    | 状态                                    |
| ----------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------- |
| 停靠叠加层吞掉宿主指针输入                                  | `panel.ts:288`，forge 2026-07-16                        | 已在 `@vectojs/devtools@0.4.3` 修复     |
| 独立 rAF FPS 度量显示 vsync 而非 Scene 节律                 | `Scene.ts:518` `FrameStats`，forge 2026-07-18           | 已在 `core@1.13.0` 经 `frameStats` 修复 |
| 面板在任何更短高度下溢出视口                                | `panel.ts:608` `layout()`，forge 2026-07-21             | 已在 `devtools@0.5.0` 修复              |
| 焦点/工作区决定 Chrome 节律；Firefox 需 `layout.frame_rate` | `benchmarks/run-browsers.sh`，forge 2026-08-02/03       | 已在 `vectojs#326/#327/#333` 修复       |
| 快照混合键控/非键控层级使一节点配对两次并丢弃移除           | `snapshot.ts:196`，forge 2026-08-13                     | 已在 `vectojs#481/#510` 修复            |
| 拾取模式吞掉面板自身控件点击                                | `panel.ts:219`，forge 2026-08-13                        | 已在 `vectojs#482/#510` 修复            |
| `findEntityAt` 声称引擎等价却遗漏不透明度/裁剪/指针门控     | `model.ts:82`，`HitTester.ts:227` vs `forge 2026-08-13` | 已在 `vectojs#483/#510` 修复            |
| canvas-vs-DOM 漂移将逻辑 px 与 client px 对比               | `a11yInspect.ts:143`，`panel.ts:1099`                   | 已在 `vectojs#484/#510` 修复            |
| `selectFinding` 忽略插件发现                                | `panel.ts:860`，forge 2026-08-13                        | 已在 `vectojs#496/#518` 修复            |
| `accessibleName` 为截断的 80 字符预览                       | `a11yInspect.ts:160`，`inspect.ts:70`                   | 已在 `vectojs#496/#518` 修复            |
| 检查器警告在行预算处被丢弃                                  | `model.ts:153` + `panel.ts:1143`，forge 2026-08-13      | 已在 `vectojs#496/#518` 修复            |
| 全场景无障碍审计每 500 ms tick 重遍历                       | `panel.ts:1246`，forge 2026-08-13                       | 已在 `vectojs#496/#518` 修复            |
| 抛出的 `getA11yAttributes()` 杀死整个无障碍审计             | `a11yInspect.ts:179`，forge 2026-08-13                  | 已在 `vectojs#496/#518` 修复            |

## 14. 检查清单——落地 DevTools 改动前

1. **无头优先。** 添加纯函数，经 `createDirectTransportPair()` 无浏览器测试，再接入面板。由一个真实消费者验证的协议胜过围绕未验证协议重建的 UI（`bridge.ts:21`）。
2. **抛错安全。** 守卫每个 `getA11yAttributes()` / `getDevtoolsDescriptor()` / `appliesTo` 调用——损坏组件必须降级而非使工具空白（`model.ts:184`、`inspect.ts:136`、`panel.ts:1298`）。
3. **命中一致。** 任何新可见性/输入/裁剪门控必须同时落在 `HitTester.findHitRecursively` 与 `isHitEligible` *以及*无头拾取/解释遍历（`HitTester.ts:227` vs `model.ts:82` vs `hitExplain.ts:139`，`vectojs#483`）。
4. **仅允许来源或直接对。** 无 `allowedOrigins` 的跨文档后端是信息泄露向量（`bridge.ts:104`）。
5. **版本键控缓存需 TTL。** 仅 `structureVersion` 的键对同样依赖 label/opacity/bounds 的项会永久陈旧（`panel.ts:1246`）。
6. **保持停靠非交互。** 容器/画布保持 `pointer-events: none`（`panel.ts:288`）；控件选择加入。回归会静默使宿主右侧控件失效。

## 15. 调试工作流——症状对应工具

| 症状                        | 工作流                                                                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| “哪个实体拥有该像素？”      | `pickInScene(scene, x, y)` → `inspectEntity(hit)`（`packages/devtools/src/model.ts:214`、`packages/devtools/src/inspect.ts:99`）                |
| “错误实体拥有该像素”        | `explainHitTest(scene, x, y)`——每个落选者及其落选原因（`packages/devtools/src/hitExplain.ts:139`）                                              |
| “为何该实体定位/尺寸错误？” | `inspectEntity` 边界 + `getWorldTransform()`，沿 `entityPath` 上行——首个错误边界即拥有该缺陷                                                    |
| “对 `x` 的写入回退”         | `inspectEntity(e).layoutControlled`——父节点拥有该属性（`packages/devtools/src/inspect.ts:42`）                                                  |
| “点击目标与视觉偏移”        | `highlightGeometry(scene, e)`——在 `a11y`/`content` 上查找 `divergesFromLayout`（`packages/devtools/src/highlightGeometry.ts:1`）                |
| “命中区域错误”              | `sampleHitRegion(e)`——真实命中区域而非框                                                                                                        |
| “屏幕阅读器无播报”          | `inspectA11y(scene, e)` 的 `accessibleName`/`nameSource`；`a11yReadingOrder(scene)` 的播报顺序                                                  |
| “文本顺序错误 / 空白框”     | `inspectText(e)` 的 bidi 层级 / `glyphs[].atlasMiss`（`packages/devtools/src/textInspect.ts:179`）                                              |
| “`onDemand` 场景永不空闲”   | `scene.setDirtyTracking(true)` → `diagnoseDirty(scene)`（`packages/devtools/src/dirtyDiagnosis.ts:70`、`packages/core/src/tree/Scene.ts:3474`） |
| “此次交互后有何变化？”      | `captureSnapshot` 前/后 → `diffSnapshots`                                                                                                       |

---

*系列：00 总览 → 01 选区 → 02 文本+布局 → 03 投影+虚拟化 → 04 流式 Markdown → 05 TeX → 06 VMT 运行时 → 07 渲染器 → 08 WASM G1/G2/G3 → 09 Three/XR → 10 视频导出 → 11 图布局 → **12 DevTools** → 99 综合。*
