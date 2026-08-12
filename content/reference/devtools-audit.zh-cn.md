+++
title = "Devtools：审计"
description = "断言一个 VectoJS 场景是正确的 — 布局、辅助功能、文本塑形与选择审计返回结构化发现，外加用于回归测试的快照与差异。"
weight = 50
+++

# Devtools：审计

一次审计会遍历场景并返回结构化、JSON 安全的发现。每一条都是你可以断言的 CI 门禁：

```typescript
import { auditScene } from '@vectojs/devtools/headless';

expect(auditScene(scene)).toEqual([]);
```

这就是这个包这一半的意义所在。屏幕截图测试告诉你页面变了；一次审计会告诉你_哪个实体_溢出了它的容器、_超出多少像素_、在哪条边上。

| 审计                     | 捕获                                                                            | 需要浏览器 |
| ------------------------ | ------------------------------------------------------------------------------- | ---------- |
| `auditScene`             | 溢出、裁剪、兄弟重叠、逃离视口                                                  | 否         |
| `auditA11y`              | 缺失名称、角色冲突、无法到达的焦点目标                                          | 否         |
| `auditTextShaping`       | 字形从图集中缺失                                                                | 否         |
| `auditSceneSelection`    | 文本选择几何相对画布漂移                                                        | **是**     |
| `auditGpu`               | 批处理、过度绘制、不平衡的 save/restore — [参见性能](/reference/devtools-perf/) | 否         |
| `auditAccelerators`      | 一个 WASM 内核拒绝其参数 — [参见性能](/reference/devtools-perf/)                | 否         |
| `auditMarkdownStreaming` | 流式复用降级 — [参见性能](/reference/devtools-perf/)                            | 否         |

---

## 布局审计

```typescript
function auditScene(scene: Scene, opts?: AuditOptions): AuditFinding[];
function auditTree(root: Entity, sceneBounds: Bounds | null, opts?: AuditOptions): AuditFinding[];

type AuditKind = 'text-overflow' | 'clip-overflow' | 'overlap' | 'viewport-overflow';

interface AuditOptions {
  tolerance?: number; // px slack before an escape/overlap counts. Default 0.5
  includeOverlay?: boolean; // modals/highlights excluded by default
  scrollableTypes?: string[]; // default ['ScrollView','VirtualList','TreeView','Table']
  ignore?: (entity: Entity) => boolean; // prune subtrees
  ignoreOverlap?: (a: Entity, b: Entity) => boolean; // allow intentional stacking
}

interface AuditFinding {
  kind: AuditKind;
  entityId: string;
  entityPath: string;
  worldBounds: Bounds;
  message: string;
  containerId?: string;
  containerPath?: string;
  containerBounds?: Bounds;
  overflow?: { left: number; right: number; top: number; bottom: number };
  otherId?: string;
  otherPath?: string;
  otherBounds?: Bounds;
  intersection?: Bounds;
}
```

```typescript
const findings = auditScene(scene, {
  tolerance: 0.5,
  includeOverlay: false,
  ignore: (e) => e.id.startsWith('debug-'),
  ignoreOverlap: (a, b) => a.id === 'badge',
});
```

会检测四种类型：

- `text-overflow` — 一个携带文本的实体的测量盒逃离了它最近的带尺寸祖先。
- `clip-overflow` — 内容逃离了一个 `clipChildren` 祖先，因此像素被切掉了。
- `overlap` — **仅限兄弟**；父-子包含是正常的。
- `viewport-overflow` — 一个没有带尺寸祖先的实体被绘制到画布之外。

`auditScene` 是入口点；`auditTree` 是它调用的单树原语，显式接收 `sceneBounds`。为这些边界传 `null` 会使 `viewport-overflow` 无法被检测到，因为没有任何视口可供逃离。

发现会按 `kind`、然后是 `entityPath`、再是 `otherPath` 排序 — 跨多次运行是确定性的，这正是它们可以被安全快照的原因。

> [!IMPORTANT]
> 在 `includeOverlay: true` 时，结果是**两段拼接在一起的已排序运行**，而非一个全局排序的列表：先是主树的发现，然后是覆盖树的。在一次遍历中按 `kind` 分组会看到 `kind` 重复出现。如果你需要单一排序，请再排一次序。

已知的盲点，全部是有意为之：

- **可滚动容器豁免垂直轴。** 内容比一个 `ScrollView` 更高正是 `ScrollView` 的全部意义。水平溢出仍会被报告。通过 `scrollableTypes` 覆盖类型列表 — 按构造函数名称匹配，并且该实体还必须确实裁剪。
- **`opacity: 0` 会修剪整个子树。** 有意隐藏的内容不是布局缺陷。
- **`viewport-overflow` 完全不需要带尺寸的祖先。** 一个单独的带尺寸且不裁剪的祖先就会抑制它，理由是那个祖先随后就成为了有意义的容器。
- **重叠只比较直接兄弟**，绝不跨分支比较，并且要求交集在_两条_轴上都要超过 `tolerance`。
- 一个 `Input` 被视为文本类，因为文本类是通过是否存在可读文本来鸭子类型判定的。

> [!NOTE]
> 根据 `kind` 的不同，`worldBounds` 表示两种不同的含义。溢出类报告渲染范围（`getWorldBounds()`）；`overlap` 报告已声明的布局四边形。因此一个绘制在其盒子之外的实体会在两种类型中出现不同的数字 — 这是有意的，因为重叠是布局问题，而溢出是绘制问题。

---

## 辅助功能审计

```typescript
function auditA11y(scene: Scene, opts?: A11yAuditOptions): A11yFinding[];

type A11yAuditKind =
  | 'no-accessible-name'
  | 'role-tag-conflict'
  | 'disabled-divergence'
  | 'focusable-but-clipped'
  | 'duplicate-label';

interface A11yAuditOptions {
  includeOverlay?: boolean; // default: included
  tolerance?: number; // px slack for the clipping check. Default 0.5
  skip?: ReadonlyArray<A11yAuditKind>;
}

interface A11yFinding {
  kind: A11yAuditKind;
  entityId: string;
  entityPath: string;
  message: string;
  otherId?: string;
  otherPath?: string;
  containerId?: string;
  containerPath?: string;
}
```

- `no-accessible-name` — 一个没有名称的可聚焦实体，其中角色要求名称或该实体是 `interactive`。最常见的真实缺陷：一个图标按钮只朗读为“button”而没有其他内容。
- `role-tag-conflict` — 一个显式的 `role` 与标签的隐式角色相矛盾，例如 `tag: 'button'` 搭配 `role: 'link'`。
- `disabled-divergence` — 实体_看起来_是禁用的，但并没有_表明_它是，或者反之。变暗但可聚焦正是陷阱：键盘用户会 tab 进一个鼠标用户可以看出来不可用的东西。
- `focusable-but-clipped` — 一个完全位于 `clipChildren` 祖先之外的可聚焦实体。Tab 会把焦点移到一个不可见的东西上。
- `duplicate-label` — 两个实体共享一个可访问名称，从第二个及其之后报告，`otherId` 指向第一个。

与布局审计不同，这个审计**默认包含覆盖树** — 模态框正是焦点陷阱所在之处。`a11yHidden` 会修剪整个子树。

> [!NOTE]
> 发现按遍历顺序而非排序排列，并且所有 `duplicate-label` 发现都会追加在最后。`disabled-divergence` 也有一个刻意的死区：介于 0.6 和 0.9 之间的不透明度不会以任何一方被报告，因为那个范围是模糊的而非错误的。

---

## 文本塑形审计

```typescript
function auditTextShaping(scene: Scene): Array<{
  kind: string;
  entityId: string;
  message: string;
  severity: 'info' | 'warn';
}>;
```

发出一种类型 `atlas-miss`：一个字形不在字体图集中的实体，这就是它们渲染为空白框的原因。消息会抽样最多五个不同的缺失字形。

> [!IMPORTANT]
> 这个审计只能看到其文本经过**准备好的文本**路径的实体。经由准备好的内容网格检查的实体，无论实际缺失多少个字形，都绝不会产生 `atlas-miss` 发现，因为网格路径不携带该标志。请直接使用 `inspectText(entity).glyphs` 来检查特定实体。

它只遍历 `scene.rootEntity` — 覆盖树不会被审计。

---

## 选择审计

```typescript
function auditSceneSelection(scene: Scene, opts?: SelectionAuditOptions): SelectionAuditFinding[];
function auditEntitySelection(
  scene: Scene,
  entity: Entity,
  opts?: SelectionAuditOptions,
): SelectionAuditFinding[];

interface SelectionAuditOptions {
  tolerance?: number; // px of left-edge drift allowed. Default 2
  rightTolerance?: number; // defaults to `tolerance`
  entityIds?: string[]; // audit only these entities
}

interface SelectionAuditFinding {
  kind: 'selection-drift';
  entityId: string;
  entityPath: string;
  line: number;
  expectedLeft: number;
  expectedRight: number;
  actualLeft: number;
  actualRight: number;
  leftDrift: number;
  rightDrift: number;
  message: string;
}
```

这里的“选择”指的是**原生浏览器文本选择** — 在透明的 DOM 内容投影上拖拽选择文本。这个审计会比较实体自身的行几何（也就是画布绘制所依据的东西）与浏览器会高亮的实时 DOM `Range` 矩形。发生漂移意味着蓝色选择条落在了字形以外的某处。

两者都被归一化到实体的局部逻辑像素中，因此该检查与设备像素比和浏览器缩放无关。它能捕获两端对齐文本、RTL/双向，以及分数 DPR 下的漂移。

`auditSceneSelection` 遍历树并按 `entityPath` 然后是 `line` 排序。`auditEntitySelection` 检查单个实体。

> [!IMPORTANT]
> 这个审计在运行时**会清除用户当前的文本选择**，并且它需要一个真实的浏览器 — 它不受保护地引用了 `document`，因此在 Node 或裸测试运行器中它会抛异常而不是返回 `[]`。请把它放在浏览器 e2e 中，而非单元测试里。它还只遍历 `scene.rootEntity`，没有覆盖层选项。

`entityIds` 过滤的是哪些实体被_审计_，但不过滤哪些被遍历，因此一个被过滤掉的父级的子级仍会被检查。

---

## 快照与差异

```typescript
function captureSnapshot(scene: Scene): SceneSnapshot;
function diffSnapshots(a: SceneSnapshot, b: SceneSnapshot): SnapshotDiff[];

interface SceneSnapshot {
  width: number;
  height: number;
  root: SnapshotNode[];
  overlay: SnapshotNode[];
}

interface SnapshotDiff {
  path: string;
  kind: 'added' | 'removed' | 'changed';
  changes?: Record<string, { from: unknown; to: unknown }>;
}
```

```typescript
const before = captureSnapshot(scene); // deterministic JSON tree
// … perform an interaction …
const diffs = diffSnapshots(before, captureSnapshot(scene));
// -> [{ path: 'root > GridEntity[0]', kind: 'changed', changes: { x: {from,to} } }]
```

与其截图，不如断言一次交互**恰好**改变了它应该改变的那些实体。这把“页面看起来不同了”变成“这个实体移动了 4px，它本不应该移动”。

差异以**结构化路径**（`type[index]` 链）为键，而绝不用实体 id，因为 id 在每次运行中都是随机的。一个发布了 `devtoolsKey` 的实体 — 或者退而求其次，一个 a11y 标签 — 会用那个键来匹配，因此重排一个带键的列表会被报告为移动，而不是每一行都变化。带键匹配仅当键在一层的两侧都唯一时才会应用；发生冲突时，该层会回退到索引对齐。

默认值的属性会从快照中省略，因此差异保持安静。

> [!NOTE]
> 只会比较一个固定的属性集：`type`、`x`、`y`、`width`、`height`、`worldBounds`、`opacity`、`interactive`、`animating`、`clipChildren` 和 `text`。值得注意的是，**对 `scene.width`/`scene.height` 的修改不会产生任何差异**，并且 `id` 或 `key` 的变化也不会被报告。`added` 和 `removed` 不会递归，因此一个被删除的子树是一个发现，而不是每个后代各一个。

---

## 在 CI 中组合审计

每个审计都是返回普通数据的普通函数，因此一个门禁就可以断言整个表面：

```typescript
import { auditA11y, auditScene, auditTextShaping } from '@vectojs/devtools/headless';

test('the scene is structurally sound', () => {
  buildDashboard(scene);
  scene.step(16.67); // let layout settle before asserting

  expect(auditScene(scene, { includeOverlay: true })).toEqual([]);
  expect(auditA11y(scene)).toEqual([]);
  expect(auditTextShaping(scene)).toEqual([]);
});
```

> [!IMPORTANT]
> 在场景完成布局之前审计，一切都会空洞地通过。请先至少驱动一次 `scene.step()` — 一个来自空场景的空发现数组并不能证明任何事。

---

[Devtools 概述](/reference/devtools/) · [检查](/reference/devtools-inspect/) · [性能](/reference/devtools-perf/) · [桥接与插件](/reference/devtools-extend/)
