+++
title = "Devtools：检查"
description = "将 VectoJS 场景作为数据来读取 — 树模型、实体拾取、实体/辅助功能/文本状态、高亮几何、命中测试解释，以及事件路由追踪。"
weight = 49
+++

# Devtools：检查

这里的每一样东西都是从 `@vectojs/devtools/headless` 进行的纯读取。没有任何内容挂载面板，并且 — 除了 `EventTrace` 这一处会附加文档监听器的例外 — 无需拆解任何东西。

```ts
import { inspectEntity, pickInScene } from '@vectojs/devtools/headless';
```

---

## 树模型与拾取

```typescript
function buildTreeModel(root: Entity): {
  nodes: DevtoolsTreeNode[];
  index: Map<string, Entity>;
};
function findEntityAt(root: Entity, x: number, y: number): Entity | null;
function pickInScene(scene: Scene, sceneX: number, sceneY: number): Entity | null;
function describeEntity(entity: Entity): string[];

interface DevtoolsTreeNode {
  id: string;
  label: string;
  children?: DevtoolsTreeNode[];
}
```

`buildTreeModel` 返回的是根的**子项**，而不是根本身 — `nodes` 中每个直接子项各占一个条目，各自带有自己的子树。相比之下，`index` 映射包含每一层深度的每个后代，以实体 id 为键，这正是让一个 id 能往返对应回一个活动实体的原因。在叶节点上，`children` 是 `undefined` 而不是 `[]`。

`label` 是 `` `${type} (${x},${y}) ${W}×${H} ⚡ ▶` `` — 当两个维度都为 0 时省略尺寸，两个徽章分别仅在 `interactive` 和 `hasPendingAnimations()` 时出现。

`pickInScene` 是你想要用来回答“这个像素属于哪个实体”的函数。它**先检查覆盖树**，再检查主树，因此一个打开的模态框会正确地胜过其背后的内容。`findEntityAt` 是底层的单树原语：它按逆序、深度优先遍历子项，因此会返回最顶层绘制的命中，并且 —— 与引擎的 `HitTester` 行为一致、自身没有回退 —— 只有当实体自身的 `isPointInside` 接受该点时它才胜出。因此装饰性或被裁剪的实体会解析为其背后的实体，与真实点击的行为完全一致。

> [!IMPORTANT]
> `findEntityAt` 既测试你传入的实体，也测试它的后代，因此把一个场景根交给它可能会返回那个根。`pickInScene` 是更安全的默认选择。

`describeEntity` 返回人类可读的行：六行固定的通用实体状态行，然后是实体发布的任何 `getDevtoolsDescriptor()` 输出，上限为 12 行描述符行。字段值在 32 个字符处截断，备注在 60 个字符处截断。抛出异常的描述符会贡献一行 `— descriptor threw —`，而不是中止读取。

> [!NOTE]
> 在整个 devtools 模型层中，`type` 是 `entity.constructor.name`，压缩器会重命名它。请把它当作调试标签，绝不要当作稳定的键 — 也绝不要当作生产环境的分支条件。

---

## 实体状态

```typescript
function inspectEntity(entity: Entity): EntityInfo;
function entityPath(entity: Entity): string;
function textPreviewOf(entity: Entity): string | undefined;

interface EntityInfo {
  id: string;
  type: string;
  path: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  worldTransform: {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
  };
  worldBounds: Bounds;
  interactive: boolean;
  animating: boolean;
  clipChildren: boolean;
  childCount: number;
  text?: string;
  a11y?: { tag?: string; role?: string; label?: string };
  descriptor?: DevtoolsDescriptor;
  layoutControlled?: ReadonlyArray<LayoutControlledProperty>;
}
```

`inspectEntity` 是 `describeEntity` 的结构化、JSON 安全的孪生函数。每个数字都四舍五入到 2 位小数。四个可选字段是**被省略，而非被设为 `undefined`**，因此 `'text' in info` 能区分“没有文本”和“空文本” — 一个文本真的是 `''` 的实体会报告 `text: ''`。

`layoutControlled` 列出了父级布局容器所拥有的属性。从应用代码向其中之一写入是一个 bug：下一次布局遍历会覆盖它。如果对 `x` 的一次微调或动画总是弹回去，原因就是这个字段。

`entityPath` 将祖先链渲染为 `Scene > Card#a1b2c3d4 > Text#e5f6a7b8`，id 截断为 8 个字符。它是 bug 报告中值得引用的标识符，因为它能在多次运行之间存活，而 `id` 不能。

> [!IMPORTANT]
> `entityPath` 将任何没有父级的实体标记为 `Scene`，因此一个**已分离**的实体与真正的根无法区分。如果一条路径看起来可疑地短，请检查该实体是否仍在树中。

`textPreviewOf` 对 `.text` 然后是 `.value` 进行鸭子类型判定，并在 80 个字符处截断并加上省略号。正是它提供了 `EntityInfo.text` 和 a11y 名称回退，因此一个长字符串会以预览而非全文的形式到达这些位置。

---

## 辅助功能状态

```typescript
function inspectA11y(scene: Scene, entity: Entity): A11yInfo;
function a11yReadingOrder(scene: Scene): A11yInfo[];

interface A11yInfo {
  entityId: string;
  entityPath: string;
  projected: boolean;
  tag?: string;
  role?: string;
  accessibleName?: string;
  nameSource?: 'label' | 'text' | 'none';
  tabIndex?: number;
  disabled?: boolean;
  focused?: boolean;
  readingOrder?: number;
  canvasBounds: Bounds;
  domBounds?: Bounds;
}
```

`inspectA11y` 总是返回一条记录，绝不返回 `null` — 一个未投影的实体只报告 `projected: false` 和其他很少的内容。这是一个回答“为什么屏幕阅读器没有朗读这个？”的函数，通常回答它的两个字段是 `accessibleName` 和 `nameSource`。

`nameSource` 始终存在，包括以 `'none'` 的形式。解析顺序是 `label`，然后是文本预览，最后是空。由于文本路径经过 `textPreviewOf`，从长文本派生的名称会以**80 个字符截断**的形式到达 — 被朗读的字符串是完整文本，因此对于长内容，不要把 `accessibleName` 当作绝对真相。

`readingOrder` 是跨越整个投影层、按 DOM 顺序从 1 开始的索引，而不是兄弟索引。`a11yReadingOrder` 返回按它排序的每个投影实体，这正是屏幕阅读器会遍历的顺序。已投影但在 DOM 查询中缺失的实体排序到末尾。

`canvasBounds` 是画布绘制实体的位置；`domBounds` 是其投影镜像实际所在的位置。**两者之间的差距就是缺陷** — 它意味着屏幕阅读器的焦点环，或某个点击目标，位于像素以外的某处。当没有元素或矩形全为零时，`domBounds` 会被省略。

---

## 文本与塑形

```typescript
function inspectText(entity: Entity): TextInspection | null;
function shapeProbe(
  text: string,
  options?: {
    font?: string;
    cellWidth?: number;
    lineHeight?: number;
    baseline?: number;
  },
): TextInspection;
function formatTextInspection(inspection: TextInspection): PluginRow[];
function isTextEntity(entity: Entity): boolean;
```

只有当实体既不携带 `.text` 也不携带 `.value` 时，`inspectText` 才返回 `null`。否则你会得到解析后的双向 (bidi) 级别、级别段、反转段、视觉顺序、字素簇和逐字形细节 — 也就是“为什么这个阿拉伯字符串顺序不对”或“为什么这个字形是一个空白框”背后的数据。

逐字形细节以三个层次之一到达，层次决定哪些字段存在：

| 层次             | `glyphs[].x` | `metrics` / `lines` | `atlasMiss` |
| ---------------- | ------------ | ------------------- | ----------- |
| 准备好的内容网格 | 是           | 是                  | 从不设置    |
| 准备好的文本     | 否           | 否                  | 是          |
| 两者皆非         | 无字形       | 否                  | 否          |

`unavailable` 数组列出了每一个无法报告的能力及其原因，因此一个缺失的字段总是得到解释，而不是默默地缺席。它始终至少包含三个条目 — 字形 id、脚本段和字体回退跨度根本不会被引擎暴露。

`shapeProbe` 在没有任何实体和场景的情况下，将任意字符串送入同一条管线，这使它成为在单元测试中检查塑形问题最快的方式。它总是返回一个带位置的完整检查结果。

> [!NOTE]
> 簇边界由 devtools 使用 `Intl.Segmenter` 重新分段，而不是取自引擎，因此在没有 `Intl.Segmenter` 的运行时上，它们会回退到码点迭代，并且对组合标记和旗帜表情符号是错误的。在相信某个簇计数之前，请将它们与引擎输出进行比较。

---

## 高亮几何

```typescript
function highlightGeometry(
  scene: Scene,
  entity: Entity,
  options?: HighlightGeometryOptions,
): HighlightLayer[];
function sampleHitRegion(
  entity: Entity,
  options?: { step?: number; budget?: number },
): HighlightLayer;
function formatHighlightGeometry(layers: ReadonlyArray<HighlightLayer>): string[];

type HighlightLayerKind = 'aabb' | 'layout' | 'render' | 'clip' | 'content' | 'a11y' | 'hit';

interface HighlightLayer {
  kind: HighlightLayerKind;
  polygons: ReadonlyArray<HighlightPolygon>;
  divergesFromLayout?: boolean;
  unavailable?: string;
}

interface HighlightGeometryOptions {
  layers?: ReadonlyArray<HighlightLayerKind>;
  hitSampleStep?: number;
  hitSampleBudget?: number;
}
```

一个实体有多达七个不同的盒子，而布局 bug 就存在于它们之间的空隙中：

| 类型      | 它是什么                                                |
| --------- | ------------------------------------------------------- |
| `aabb`    | 变换后布局四边形的轴对齐包围盒。                        |
| `layout`  | 真实的四边形，包含旋转和倾斜。参考基准。                |
| `render`  | `getBounds()` — 实体实际绘制的位置。                    |
| `clip`    | 最近的 `clipChildren` 祖先的盒子。                      |
| `content` | 可选择的 DOM 内容镜像的盒子。                           |
| `a11y`    | a11y 投影元素的盒子。                                   |
| `hit`     | 真实的命中区域，通过对 `isPointInside` 的采样探测获得。 |

任何图层上的 `divergesFromLayout` 都是信号 — 它意味着那个盒子与布局四边形相差超过一个像素，而这正是让点击落在用户并未瞄准之处的条件。一个发生分歧的 `render` 图层是内容绘制到其盒子之外；`content` 或 `a11y` 的分歧则是放错位置的选择或焦点目标。

`highlightGeometry` 绝不抛异常。一个无法计算的图层会带着设为原因的 `unavailable` 返回，且没有多边形，因此典型实体上的 `render` 会显示 `getBounds() returned null, so the layout box is the render box`。无论你请求的顺序如何，输出始终是上面那个固定顺序。

`'hit'` **不在**默认图层集合中，因为它是唯一昂贵的图层。它在网格上采样 `isPointInside` — 默认步长 8 个场景单位，默认预算 4096 次探测 — 并且为每个连续的横向区段返回一个矩形。超出预算会拒绝采样并明确说明，而不是卡住：

```ts
// An inscribed circle: same extent as its box, ~79% of its area.
const hit = sampleHitRegion(circle, { step: 4 });
hit.divergesFromLayout; // true — coverage is below 90% of the box
```

`'hit'` 的分歧由**面积覆盖率决定，而非范围**，正是为了让方形中的圆形能够被识别。对于固定步长，成本随实体大小呈二次方增长：将 `step` 减半会使探测次数变为四倍，因此在一个 200×100 的实体上使用 2px 步长需要约 5100 次探测，并且必须给足提升后的 `hitSampleBudget` 才会运行。

---

## 解释一次命中测试

```typescript
function explainHitTest(scene: Scene, x: number, y: number): HitExplanation;
function formatHitExplanation(explanation: HitExplanation): string[];

type HitVerdict =
  'accepted' | 'invisible' | 'clipped' | 'pointer-transparent' | 'outside-shape' | 'occluded';

interface HitCandidate {
  entityId: string;
  entityPath: string;
  type: string;
  verdict: HitVerdict;
  reason: string;
  depth: number;
  worldBounds: Bounds;
  clipperId?: string;
  clipperPath?: string;
}

interface HitExplanation {
  x: number;
  y: number;
  hitId: string | null;
  hitPath?: string;
  candidates: HitCandidate[];
  root: 'overlay' | 'main' | 'none';
}
```

`pickInScene` 告诉你哪个实体赢了。`explainHitTest` 告诉你**为什么其他每个实体都输了**，这正是答案错误时你所需要的。每个候选都带有一个判定和一个一句话的理由：

```ts
const why = explainHitTest(scene, 50, 50);
console.log(formatHitExplanation(why).join('\n'));
// hit test (50, 50) → Scene > Box#entity_d > Box#entity_k [main]
// ✗ OverlayRoot — point (50, 50) is outside its shape
//   ✗ Box — point (50, 50) is outside its shape
//     ✓ Box — inside its shape, unclipped, and accepts pointer input
//     · Box — would have been hit, but Box is drawn on top
```

字形符号是 `✓` 接受、`·` 被遮挡、`✗` 其他一切情况，缩进则是候选的深度 — 上限为 6 层，因此更深的树在视觉上会被压平。这些行携带的是 `type`（构造函数名称）而非路径，而兄弟实体通常共享一个类型：当你需要精确定位某个实体时，请读取 `explanation.candidates[i].entityPath`。

候选按最顶层优先排序，与引擎考虑它们的顺序一致。注意 `occluded` 是在后处理中赋值的：一个本会接受该点但位于胜者之下的实体，会从 `accepted` 改写为 `occluded`。因此“这个像素下面有多少个东西”可以通过数它们来回答。

`invisible` 判定（`opacity <= 0`）会**修剪子树** — 理由会说明跳过了多少个后代，因此一整条不可见分支会报告为一个候选，而不是几十个。

> [!IMPORTANT]
> 这是一个诊断工具，而非逐帧调用。引擎在第一次命中时就返回，而 `explainHitTest` 会遍历整棵树来枚举那些失败者。它还总是镜像 JS 遍历，因此在使用了 WASM 命中网格的场景上，两者可能在一种边缘情况下不一致：一个零尺寸的 `clipChildren` 祖先会被解释为 `clipped`，而 WASM 路径会登记这次命中。

---

## 事件路由追踪

```typescript
function createEventTrace(scene: Scene, options?: EventTraceOptions): EventTrace;

class EventTrace {
  get entries(): readonly EventTraceEntry[];
  subscribe(listener: (entry: EventTraceEntry) => void): () => void;
  clear(): void;
  destroy(): void;
}

interface EventTraceOptions {
  capacity?: number; // retained records, default 50
  includeGlobalKeyboard?: boolean; // default true
}

type EventTraceType =
  'pointerdown' | 'pointerup' | 'pointercancel' | 'pointermove' | 'wheel' | 'keydown' | 'keyup';

type EventTraceSource = 'a11y' | 'content' | 'canvas' | 'document';
```

```ts
const trace = createEventTrace(scene, { capacity: 100 });
trace.subscribe((entry) => {
  console.log(entry.source, entry.targetPath, entry.defaultPrevented);
});
```

每个条目都记录解析后的目标实体、场景坐标与局部坐标、修饰键，以及最终的 `defaultPrevented`。`source` 说明浏览器事件到达了哪个表面：`canvas`、`a11y` 投影、一个可选择的 `content` 镜像，或用于全局键盘的 `document`。

记录**在微任务中完成**，因此 `defaultPrevented` 反映的是应用最终的快捷键或选择决定，而不是其在分发中途的值。实际后果是，分发一个事件后 `entries` 立即为空 — 测试必须先等待一个宏任务再断言。

指针追踪包含 `pointercancel`，这使得被打断的拖拽和选择事务变得可见，而不是在 `pointerdown` 之后留下一个诊断空缺。预期会是 `pointerdown` → 若干次移动 → 恰好一次 `pointerup`（提交）**或** `pointercancel`（回滚）；缺少终止条目意味着该实体从未被投影，或捕获被绕过了。

> [!IMPORTANT]
> `EventTrace` 会附加 14 个文档监听器，并且是模型层中**必须**被销毁的那一个对象。当诊断界面卸载时，请调用 `trace.destroy()`。还要注意 `entries` 返回的是活动中的内部数组，而非副本 — 随着记录到达并在达到容量时被逐出，它会不断在你脚下变化，因此如果你需要一个稳定的视图，请复制它。

在浏览器之外，构造函数不附加任何内容，实例是惰性的，因此一个共享的测试辅助函数可以无条件地构造一个。

---

## 调试工作流

| 症状                                    | 工作流                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| “这个像素属于哪个实体？”                | `pickInScene(scene, x, y)` → `inspectEntity(hit)`                                                    |
| “错误的实体拥有了这个像素”              | `explainHitTest(scene, x, y)` — 每个失败者及其失败原因                                               |
| “为什么这个实体的位置/大小不对？”       | `inspectEntity` 获取世界边界 + 变换，然后向上遍历 `entityPath` — 边界最先出错的祖先就是 bug 的归属   |
| “我对 `x` 的写入总是被还原”             | `inspectEntity(e).layoutControlled` — 父级容器拥有该属性                                             |
| “点击目标相对视觉有偏移”                | `highlightGeometry(scene, e)` 并查看 `a11y` 或 `content` 上的 `divergesFromLayout`                   |
| “这个形状的可点击区域不对”              | `sampleHitRegion(e)` — 真实的命中区域，而非盒子                                                      |
| “屏幕阅读器什么都没说 / 说了错误的内容” | `inspectA11y(scene, e)` 获取 `accessibleName` + `nameSource`；`a11yReadingOrder(scene)` 获取朗读顺序 |
| “这段文本以错误的顺序渲染”              | `inspectText(e)` — 双向级别、级别段、视觉顺序                                                        |
| “字形渲染为空白框”                      | `inspectText(e).glyphs` — 标记为 `atlasMiss` 的条目                                                  |
| “点击/滚轮/按键去了错误的地方”          | `createEventTrace(scene)` — 来源、目标路径、坐标、最终 `defaultPrevented`                            |
| “文本拖选或复制被拦截”                  | 使用 `entry.source === 'content'` 的事件追踪 — 事件始于一个可选择的投影                              |
| “拖拽卡住 / 从不提交”                   | 指针追踪是事务性的：缺少 `pointerup`/`pointercancel` 意味着该实体未被投影或捕获被绕过                |

---

[Devtools 概述](/reference/devtools/) · [审计](/reference/devtools-audit/) · [性能](/reference/devtools-perf/) · [桥接与插件](/reference/devtools-extend/)
