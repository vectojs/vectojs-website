---
title: '@vectojs/devtools'
description: '页面内 Virtual Math Tree 检查器及其无头模型层 — 实体拾取、树视图、审计、快照、GPU 与加速器读数和 JSON-RPC 桥接。'
order: 48
---

# `@vectojs/devtools`

文档版本：**0.11.0**

`@vectojs/devtools` 是对"元素面板在哪里？"的回答 — 一个用于 Virtual Math Tree 的页面内检查器，使得调试 VectoJS 场景停留在状态空间而非像素空间。它分为两半：

| 一半                                      | 用途                                                                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **面板** (`@vectojs/devtools`)            | 一个页面内停靠栏，本身是一个 VectoJS `Scene`，具有树、实体状态、审计、a11y、事件日志和设置标签页。在本页中说明。     |
| **模型层** (`@vectojs/devtools/headless`) | 约 60 个纯函数，以数据形式回答布局、a11y、命中测试、文本和性能问题。无 DOM 面板，可用于测试、CI、Node 和代理程序中。 |

模型层是较大且更有用的一半。在进行屏幕截图之前，请先使用它 — 数字会告诉您"哪个"实体有问题，而图片只会告诉您有东西出错。

| 页面                                      | 内容                                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------- |
| [检查](/reference/devtools-inspect/)      | 树模型、拾取、实体/a11y/文本状态、高亮几何、命中测试解释、事件路由追踪。               |
| [审计](/reference/devtools-audit/)        | 所有 `audit*` 函数 — 布局、a11y、文本塑形、选择偏移 — 加上用于回归断言的快照与差异。   |
| [性能](/reference/devtools-perf/)         | GPU 和绘制计数器、WASM 加速器状态、脏重绘归因、Markdown 流指标。                       |
| [桥接与插件](/reference/devtools-extend/) | 用于从另一份文档驱动场景的 JSON-RPC 协议，以及用于添加您自己的标签页和审计的插件协议。 |

---

## 安装

```bash
bun add -D @vectojs/devtools
```

面板会挂载一个 VectoJS 场景并监听 `document`，因此请将其排除在生产包之外。从 `headless` 子路径导入模型层 — 它不包含面板代码，也不依赖 `@vectojs/ui`：

```ts
import { auditScene, captureSnapshot, inspectEntity } from '@vectojs/devtools/headless';
```

```typescript
import { attachDevtools } from '@vectojs/devtools';

const scene = new Scene(canvas);
// ...构建场景...

if (import.meta.env.DEV) {
  const devtools = attachDevtools(scene);
  // devtools.detach() 可稍后移除
}
```

> [!IMPORTANT]
> `@vectojs/devtools/headless` 下的所有内容也从包根目录重新导出，因此单个 `attachDevtools` 导入并不妨碍你调用 `auditScene`。该子路径的存在是为了让生产测试包无需面板即可引入模型层。

---

## 它显示什么

标题栏携带三个幽灵图标按钮 — **⌖** (拾取)、**⟳** (刷新)、**⚠** (审计) — 以及三个计数徽章：总实体数、可交互实体数 (**⚡**) 和审计发现数 (**⚠**)。一个 `Tabs` 栏将工具分为 **Tree · Info · Audit · A11y · Log · ⚙**，加上每个已注册的[插件检查器](/reference/devtools-extend/#插件协议)对应一个标签页。性能条固定在底部。

- **实时树视图** (`Tree`)：展示 `scene.rootEntity` 和 `scene.overlayRootEntity`，按间隔刷新（默认 500ms）。每行显示实体的构造函数名称、位置、尺寸和两个徽章：**⚡** (`interactive`) 和 **▶** (`hasPendingAnimations()`)。**filter** 字段通过类型/ID 子串过滤行；它是只读的，因此 ID 到实体的索引仍然解析所有内容。编程式：`panel.setFilter(text)`。
- **拾取模式**：点击 **⌖**，然后点击页面上的任意位置。检查器使用与 Scene 用于指针输入相同的遍历顺序，将点击解析到该点下最深的实体，对装饰性、非交互式实体带 AABB 回退。
- **选择高亮**：所选实体的几何形状作为轮廓绘制在*宿主*场景的覆盖层上，因此你能准确看到相对于实时渲染选中了什么。默认情况下它绘制布局盒；`panel.setHighlightLayers()` 可将其切换为七个[高亮几何层](/reference/devtools-inspect/#高亮几何)中的任意一个 — 包括 `'hit'`，它对实体的真实点击区域进行采样而非其包围盒。
- **状态读数 + 内联编辑** (`Info`)：几何、缩放/旋转/不透明度、完整的世界变换矩阵、动画状态以及实体发布的任何 `getDevtoolsDescriptor()` 输出。添加了内联的 `x`/`y`/`opacity` 编辑器以及 **Copy path** / **Copy JSON** 按钮。
- **A11y 标签页**：选中实体的投影角色、可访问名称及其来源、tab 索引、阅读顺序位置、画布对比 DOM 边界框 — 加上全场景 [a11y 审计](/reference/devtools-audit/#辅助功能审计) 发现。
- **键盘微调编辑**：选中一个实体后，方向键将其移动 1px (Shift：10px)；`+`/`-` 以 0.1 步进不透明度。在触碰代码之前，用于确认布局 bug 属于*哪个*实体很有用。
- **性能HUD**：底部的条带读取 [`Scene.frameStats`](/reference/core-scene) — fps、毫秒/帧、实体数量、渲染模式以及渲染/跳过的帧数。fps 是真实的*渲染帧*节奏，因此空闲的 `onDemand` 或自动节流场景真实地读取为 ~2fps，而不是虚假的 60。使用 `showPerf: false` 禁用。
- **设置** (`⚙`)：切换选中高亮，并实时切换刷新间隔和停靠侧（左/右）。

面板在窗口调整大小时会重新布局，因此无论视口高度或缩放级别如何，底部的性能条都保留在屏幕上。停靠栏及其画布使用 `pointer-events: none`；只有它们投影出的交互式控件重新选择加入 — 因此，检查器永远不会从空白停靠栏像素下方的宿主控件中窃取输入，同时其自身的行、标签页、输入框和按钮仍然可点击。

---

## API

```typescript
function attachDevtools(
  scene: Scene,
  options?: DevtoolsOptions,
): DevtoolsPanel & { detach(): void };

interface DevtoolsOptions {
  width?: number; // panel width in px, default 360
  refreshInterval?: number; // ms; 0 disables auto-refresh. Default 500
  traceEvents?: boolean; // show bounded pointer/wheel/keyboard routing records
  traceCapacity?: number; // retained trace records, default 50
  dockSide?: 'right' | 'left'; // default 'right'
  showPerf?: boolean; // live perf HUD strip, default true
  defaultTab?: string; // 'tree' | 'inspect' | 'audit' | 'a11y' | 'events' | 'settings'
}

class DevtoolsPanel {
  refresh(force?: boolean): void; // rebuild the tree model from the host scene
  armPick(): void; // one-shot: the next page click selects the entity under it
  select(entity: Entity): void; // select programmatically
  get selection(): Entity | null;
  get trace(): EventTrace | null; // null unless traceEvents was enabled
  setFilter(text: string): void; // filter the tree by type/id substring
  setHighlightEnabled(on: boolean): void;
  setHighlightLayers(kinds: ReadonlyArray<HighlightLayerKind>, hitSampleStep?: number): void;
  getHighlightLayers(): ReadonlyArray<HighlightLayer>; // layers from the last draw
  setRefreshInterval(ms: number): void;
  setDockSide(side: 'right' | 'left'): void;
  audit(): AuditFinding[]; // run the layout audit; also fills the Audit tab
  selectFinding(i: number): void; // select + highlight the entity behind finding i
  getPluginFindings(): ReadonlyArray<PluginFinding>; // findings from plugin audits
  getPluginRows(inspectorId: string): PluginRow[]; // a plugin tab's current rows
  runCommand(qualifiedId: string): unknown; // run a `<pluginId>/<commandId>`
  destroy(): void; // tears down listeners, timers, host highlight, and the panel scene
}
```

`detach()`（由 `attachDevtools` 返回）是 `destroy()` 的别名。

`refresh(force)` 当 `scene.structureVersion` 尚未变动时会跳过重建，因此在紧凑的间隔内调用它是廉价的；传入 `true` 以无论如何都重建。独立于该检查之外，面板每 3 秒协调一次，以便错过的结构变动不会让树无限期地过时。

当插件未知、没有选中内容，或者检查器的 `appliesTo` 拒绝了该选中内容时，`getPluginRows` 会返回 `[]` — 这三种情况不会被区分。在未知的命令 id 上，`runCommand` 会**抛出异常**而不是无操作。

---

## 设计说明

- 面板场景以 `contentProjection: false` 和 `renderMode: 'onDemand'` 构造 — 它不得投影自己的 DOM 内容或在空闲时每帧重绘。
- 选择状态存在于面板上，而非宿主：`select()`/`armPick()` 除了通过 `showOverlay()` 添加并在 `destroy()` 时移除的高亮覆盖实体外，从不改变被检查的场景。
- 自动刷新是一个普通间隔，而非 Scene 动画 — 即使宿主场景完全空闲（`onDemand`，无脏）时它也工作。
- 停靠栏（`position: fixed`，全视口高度）及其画布为 `pointer-events: none`，镜像了主 `Scene` 自身的 `a11yRoot` 选择退出的方式，而各个交互式影子元素通过 `auto` 重新选择加入。点击停靠栏的空白背景会穿透到下方的无论什么宿主内容 — 包括宿主应用自身的右边缘控件，否则它们会位于停靠栏的区域内。只有面板自身的 a11y 投影控件，通过它们自己的 `auto` 选择加入，才是独立可点击的。

---

[检查](/reference/devtools-inspect/) · [审计](/reference/devtools-audit/) · [性能](/reference/devtools-perf/) · [桥接与插件](/reference/devtools-extend/)
