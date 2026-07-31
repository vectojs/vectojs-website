---
title: '@vectojs/devtools'
description: '页面内 Virtual Math Tree 检查器 —— 实体拾取、实时树视图、变换读数和键盘微调编辑，其本身用 VectoJS 渲染。'
order: 48
---

# `@vectojs/devtools`

记录的版本：**0.4.3**

`@vectojs/devtools` 是对"元素面板在哪里？"的回答 —— 一个用于 Virtual Math Tree 的页面内检查器，使得调试 VectoJS 场景停留在状态空间而非像素空间。该面板本身就是一个 VectoJS `Scene`（对它所检查的框架进行自我实践），停靠在页面右边缘。

## 安装

```bash
bun add -D @vectojs/devtools
```

在开发中有条件地添加可视面板 —— 它挂载一个 VectoJS 面板并在 `document` 上监听，因此请将其排除在生产包之外。无头审计、快照、拾取和事件追踪无需该面板即可使用：

```ts
import { auditScene, captureSnapshot, createEventTrace } from '@vectojs/devtools/headless';
```

```typescript
import { attachDevtools } from '@vectojs/devtools';

const scene = new Scene(canvas);
// ...build the scene...

if (import.meta.env.DEV) {
  const devtools = attachDevtools(scene);
  // devtools.detach() to remove it later
}
```

## 它显示什么

- **实时树视图（`Tree` 标签页）**，展示 `scene.rootEntity` 和 `scene.overlayRootEntity`，按间隔刷新（默认 500ms）。每行显示实体的构造函数名称、位置、尺寸和两个徽章：**⚡**（`interactive`）和 **▶**（`hasPendingAnimations()`）。
- **拾取模式**：点击 **Pick**，然后点击页面上的任意位置。检查器使用与 Scene 用于指针输入相同的遍历顺序，将点击解析到该点下最深的实体（对装饰性、非交互式实体带 AABB 回退）。
- **选择高亮**：所选实体的世界空间外接盒作为轮廓绘制在_宿主_场景的覆盖层上，因此你能准确看到相对于实时渲染选中了什么。
- **状态读数 + 内联编辑（`Info` 标签页）**：几何、缩放/旋转/不透明度、完整的世界变换矩阵，以及以纯文本形式的动画状态 —— 截图无法直接给你的数字。
- **键盘微调编辑**：选中一个实体后，方向键将其移动 1px（Shift：10px）；`+`/`-` 以 0.1 步进不透明度。在触碰代码之前，用于确认布局 bug 属于_哪个_实体很有用。

- **性能HUD** (0.5.0)：底部的条带读取 [`Scene.frameStats`](/reference/core-scene) —— fps、毫秒/帧、实体数量、渲染模式以及渲染/跳过的帧数。fps 是真实的*渲染帧*节奏，因此空闲的 `onDemand` 或自动节流场景真实地读取为 ~2fps，而不是虚假的 60。使用 `showPerf: false` 禁用。
- **设置** (`⚙` 标签页, 0.5.0)：切换选中高亮，并实时切换刷新间隔和停靠侧（左/右）。
  从 0.4.3 起，固定在右侧的 dock 及其 canvas 使用 `pointer-events: none`，只有投影出来的交互控件会重新启用指针事件。因此，检查器不会再抢走空白 dock 像素下方的宿主控件输入，而 VMT 行和按钮仍可点击。

## API

```typescript
function attachDevtools(
  scene: Scene,
  options?: DevtoolsOptions,
): DevtoolsPanel & { detach(): void };

interface DevtoolsOptions {
  width?: number; // panel width in px, default 320
  refreshInterval?: number; // ms; 0 disables auto-refresh
  traceEvents?: boolean; // show bounded pointer/wheel/keyboard routing records
  traceCapacity?: number;
}

class DevtoolsPanel {
  refresh(): void; // rebuild the tree model from the host scene
  armPick(): void; // one-shot: the next page click selects the entity under it
  select(entity: Entity): void; // select programmatically
  get selection(): Entity | null;
  destroy(): void; // tears down listeners, timers, host highlight, and the panel scene
}
```

`detach()`（由 `attachDevtools` 返回）是 `destroy()` 的别名。

## 事件路由追踪

```ts
const trace = createEventTrace(scene, { capacity: 100 });
trace.subscribe((entry) => {
  console.log(entry.source, entry.targetPath, entry.defaultPrevented);
});
```

`source` 是 `"canvas"`、`"a11y"`、`"content"` 或 `"document"`。`content` 源意味着浏览器事件始于一个可选择的 `[data-vecto-content]` 镜像。追踪验证拥有它的 Entity，记录场景/局部坐标，并在一个微任务中最终确定，以便 `defaultPrevented` 反映应用最终的快捷键或选择决定。当诊断表面卸载时调用 `trace.destroy()`。指针追踪包含 `pointercancel`，这使得被中断的拖拽和选择事务可见，而不是在 `pointerdown` 之后留下诊断空隙。

## Scene 审计

`auditScene` 遍历树并以结构化的、JSON 安全的发现项报告布局缺陷 —— 用数字回答"是否有内容溢出、重叠或超出边界？"：

```typescript
import { auditScene } from '@vectojs/devtools/headless';

const findings = auditScene(scene, {
  tolerance: 0.5, // px 容差，超过此值才计为溢出/重叠
  includeOverlay: false, // 默认排除模态框/高亮
  ignore: (e) => e.id.startsWith('debug-'), // 修剪子树
  ignoreOverlap: (a, b) => a.id === 'badge', // 允许有意堆叠
});
// -> AuditFinding[]: { kind, entityId, entityPath, worldBounds, message,
//    containerBounds?, overflow?{left,right,top,bottom}, otherId?, intersection? }
```

检测四种 `kind`，确定性排序：

- `text-overflow` —— 包含文本的实体的测量盒超出其最近的已定义尺寸的祖先。
- `clip-overflow` —— 内容超出 `clipChildren` 祖先（像素被裁剪）。
- `overlap` —— **仅兄弟元素**；父子包含关系是正常的。
- `viewport-overflow` —— 没有已定义尺寸祖先的实体绘制到画布之外。

已知盲点：可滚动容器豁免垂直轴（通过 `scrollableTypes` 覆盖列表，以 `constructor.name` 匹配），并且 `opacity: 0` 实体被跳过。

面板的 **Audit** 按钮运行相同的检查以替代树视图；`panel.audit()` 返回发现项，`panel.selectFinding(i)` 高亮其中一个。

用作 CI 门禁：`expect(auditScene(scene)).toEqual([])`。

## 快照与差异比较

```typescript
import { captureSnapshot, diffSnapshots } from '@vectojs/devtools/headless';

const before = captureSnapshot(scene); // 确定性 JSON 树
// … 执行交互 …
const diffs = diffSnapshots(before, captureSnapshot(scene));
// -> [{ path: "root > GridEntity[0]", kind: "changed", changes: { x: {from,to} } }]
```

差异比较基于**结构路径**（`type[index]` 链），从不使用实体 id——id 在每次运行中是随机的。默认值的属性从快照中省略，因此差异保持简洁。快照对在冒烟测试中实现精确的黄金状态断言：无需截图，断言某个交互恰好改变了它应该改变的实体。

## 更底层的模型工具

如果你想构建自定义检查器 UI 而不是内置面板，树构建和拾取逻辑是单独导出的：

```typescript
import {
  buildTreeModel,
  findEntityAt,
  describeEntity,
  inspectEntity,
  entityPath,
  pickInScene,
} from '@vectojs/devtools';

buildTreeModel(root: Entity): { nodes: TreeNode[]; index: Map<string, Entity> };
findEntityAt(root: Entity, x: number, y: number): Entity | null; // scene-space point → entity
describeEntity(entity: Entity): string[]; // human-readable state lines
inspectEntity(entity: Entity): EntityInfo; // structured, JSON-safe state
entityPath(entity: Entity): string; // ancestry chain ("Scene > Card#<id> > Text#<id>", ids truncated to 8 chars)
pickInScene(scene: Scene, sceneX: number, sceneY: number): Entity | null; // overlay-first pick
```

`inspectEntity` 是 `describeEntity` 的结构化兄弟：世界边界和变换、交互标志、`clipChildren`、子元素数量、鸭子类型的文本预览（`.text`/`.value`），以及存在时的辅助功能投影属性。`entityPath` 生成实体的祖先链（例如 `"Scene > Card#<id> > Text#<id>"`，ID 截断至 8 个字符）。

## 调试工作流

devtools 模型层用数字回答布局问题 —— 在截图之前用它。症状 → 工具：

| 症状                              | 工作流                                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "哪个实体拥有这个像素？"          | `pickInScene(scene, x, y)` → `inspectEntity(hit)`；在页面内，面板的 **Pick** 按钮                                                                      |
| "为什么这个实体的位置/尺寸不对？" | `inspectEntity` 获取世界边界和变换，然后向上遍历 `entityPath` —— 边界有问题的第一个祖先拥有该 bug                                                      |
| "有内容溢出/重叠但我找不到位置"   | `auditScene(scene)` —— 每个发现项包含 `entityPath`、世界边界和每个边缘的溢出量                                                                         |
| "这个交互移动了不该动的实体"      | `captureSnapshot` 之前，交互，`diffSnapshots` 之后 —— diff 精确列出变化的内容                                                                          |
| "点击/滚轮/按键去到了错误的地方"  | `createEventTrace(scene)` —— 每个条目显示 source（`canvas`/`a11y`/`content`/`document`）、目标路径、坐标以及最终的 `defaultPrevented`                  |
| "文本拖拽选择或复制被拦截"        | 事件追踪中 `entry.source === 'content'` —— 意味着浏览器事件始于可选择的投影；检查 `defaultPrevented` 和目标路径                                        |
| "拖拽卡住/从未提交"               | 指针追踪是事务性的：期望 `pointerdown` → 移动 → 正好一个 `pointerup`（提交）**或** `pointercancel`（回滚）；缺少终止条目意味着实体未被投影或捕获被绕过 |
| "这是回归吗？"                    | 保留健康场景的提交快照（`captureSnapshot`）并在 CI 中对其运行 `diffSnapshots`                                                                          |

## 设计说明

- 面板场景以 `contentProjection: false` 和 `renderMode: 'onDemand'` 构造 —— 它不得投影自己的 DOM 内容或在空闲时每帧重绘。
- 选择状态存在于面板上，而非宿主：`select()`/`armPick()` 除了通过 `showOverlay()` 添加并在 `destroy()` 时移除的高亮覆盖实体外，从不改变被检查的场景。
- 自动刷新是一个普通间隔，而非 Scene 动画 —— 即使宿主场景完全空闲（`onDemand`，无脏）时它也工作。
- 面板停靠栏（默认 `position: fixed; right: 0; width: 320px`，全视口高度）及其画布为 `pointer-events: none`，镜像了主 `Scene` 自身的 `a11yRoot` 选择退出的方式，而各个交互式影子元素通过 `auto` 重新选择加入（`@vectojs/devtools@0.6.0+`）。这意味着点击停靠栏的空白背景/装饰区域会穿透到下方的宿主内容——包括宿主应用自身的右边缘控件（标签页关闭按钮、工具栏按钮），否则它们会位于停靠栏的 320px 范围内。只有面板自身的 a11y 投影控件（按钮、VMT 树行）通过它们自己的 `auto` 选择加入而独立可点击。
