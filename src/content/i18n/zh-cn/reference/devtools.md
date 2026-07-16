---
title: '@vectojs/devtools'
description: '页面内 Virtual Math Tree 检查器 —— 实体拾取、实时树视图、变换读数和键盘微调编辑，其本身用 VectoJS 渲染。'
order: 48
---

# `@vectojs/devtools`

记录的版本：**0.4.2**

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

- **实时树视图**，展示 `scene.rootEntity` 和 `scene.overlayRootEntity`，按间隔刷新（默认 500ms）。每行显示实体的构造函数名称、位置、尺寸和两个徽章：**⚡**（`interactive`）和 **▶**（`hasPendingAnimations()`）。
- **拾取模式**：点击 **Pick**，然后点击页面上的任意位置。检查器使用与 Scene 用于指针输入相同的遍历顺序，将点击解析到该点下最深的实体（对装饰性、非交互式实体带 AABB 回退）。
- **选择高亮**：所选实体的世界空间外接盒作为轮廓绘制在_宿主_场景的覆盖层上，因此你能准确看到相对于实时渲染选中了什么。
- **状态读数**：几何、缩放/旋转/不透明度、完整的世界变换矩阵，以及以纯文本形式的动画状态 —— 截图无法直接给你的数字。
- **键盘微调编辑**：选中一个实体后，方向键将其移动 1px（Shift：10px）；`+`/`-` 以 0.1 步进不透明度。在触碰代码之前，用于确认布局 bug 属于_哪个_实体很有用。

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

## 更底层的模型工具

如果你想构建自定义检查器 UI 而不是内置面板，树构建和拾取逻辑是单独导出的：

```typescript
import { buildTreeModel, findEntityAt, describeEntity, pickInScene } from '@vectojs/devtools';

buildTreeModel(root: Entity): { nodes: TreeNode[]; index: Map<string, Entity> };
findEntityAt(root: Entity, x: number, y: number): Entity | null; // scene-space point → entity
describeEntity(entity: Entity): string[]; // human-readable state lines
pickInScene(scene: Scene, sceneX: number, sceneY: number): Entity | null; // overlay-first pick
```

## 设计说明

- 面板场景以 `contentProjection: false` 和 `renderMode: 'onDemand'` 构造 —— 它不得投影自己的 DOM 内容或在空闲时每帧重绘。
- 选择状态存在于面板上，而非宿主：`select()`/`armPick()` 除了通过 `showOverlay()` 添加并在 `destroy()` 时移除的高亮覆盖实体外，从不改变被检查的场景。
- 自动刷新是一个普通间隔，而非 Scene 动画 —— 即使宿主场景完全空闲（`onDemand`，无脏）时它也工作。
