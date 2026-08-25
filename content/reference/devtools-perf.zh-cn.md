+++
title = "Devtools：性能"
description = "将 VectoJS 帧成本归因 — GPU 与 Canvas2D 绘制计数器、WASM 加速器状态、脏重绘归因，以及 Markdown 流复用指标。"
weight = 51
+++

# Devtools：性能

四组独立的读数，每一组都回答一个不同的“为什么这么慢”的问题：

| 读数                    | 问题                                                 |
| ----------------------- | ---------------------------------------------------- |
| `inspectGpu`            | 这一帧实际把绘制调用花在了什么上？                   |
| `inspectAccelerators`   | WASM 内核在运行吗？如果没有，为什么？                |
| `diagnoseDirty`         | 明明没看到什么变化，为什么这个场景在重绘？           |
| `inspectMarkdownStream` | 流式 Markdown 是在复用工作，还是在重新解析每一个块？ |

四者都是纯读取。它们都不会作为副作用启用插桩，这意味着一个未被测量的场景会报告“未测量”而不是撒谎 — 并且其中两个需要先打开插桩。

---

## GPU 与绘制计数器

```typescript
function inspectGpu(scene: Scene): GpuInspection;
function formatGpuInspection(info: GpuInspection): PluginRow[];
function auditGpu(scene: Scene): PluginFinding[];

interface GpuInspection {
  rendererKind: string;
  canvas: DrawCounters | null;
  webgl: {
    drawCalls: number;
    totalDrawCalls: number;
    atlasSwitches: number;
    programs: number;
    textures: number;
    circleQuadFallbacks: number;
    circlePoints: number;
  } | null;
  webgpu: {
    active: boolean;
    pipelines: number;
    bindGroups: number;
    particleEntities: number;
  };
  phases: Array<{
    phase: string;
    totalMs: number;
    calls: number;
    avgMs: number;
    maxMs: number;
  }>;
  frame: {
    fps: number;
    frameTimeMs: number;
    renderedFrames: number;
    skippedFrames: number;
  };
  unavailable: Array<{ capability: string; reason: string }>;
}
```

`frame` 始终可用。其他一切都是选择性开启的，`unavailable` 数组会说明每一件它无法报告的事及其原因：

```typescript
import { inspectGpu } from '@vectojs/devtools/headless';

// Canvas2D counters are off by default — turn them on first.
scene.getRenderer().setDrawCounters?.(true);
scene.setPhaseTiming(true);

scene.step(16.67);

const gpu = inspectGpu(scene);
gpu.canvas?.fills; // draw calls by category
gpu.phases; // per-phase timing
```

> [!IMPORTANT]
> `auditGpu` 的三项 Canvas2D 检查**全部以启用了绘制计数为前提**。在一个你从未调用过 `setDrawCounters(true)` 的场景上，它会返回 `[]` — 这与一个干净的结果看起来完全一样。请先启用计数，否则一个绿色的审计毫无意义。

它能发出的发现：`batch-not-amortising`（每个圆形在 0.5 以上的刷新）、`high-overdraw`（比值高于 4）、`unbalanced-save-restore`（一个真实的 bug — 缺少 `restore()` 会把状态泄漏到后续绘制中），以及 `circle-quad-fallback`（四边形回退多于点精灵圆形）。

> [!NOTE]
> `webgl` 混入了一个每帧计数器与四个自创建以来累计的计数器。`drawCalls` 是最后完成的帧；`totalDrawCalls`、`atlasSwitches`、`circleQuadFallbacks` 和 `circlePoints` 只会增长。用一个帧去除一个累计计数器，是这里最容易犯的错误。
>
> 一个 `null` 的 `webgl` 意味着点图层根本没有运行，这与一个全为零的 `webgl` 意味着它运行了但什么都没画是不同的。`webgpu.pipelines` 和 `bindGroups` 是从活动标志和粒子实体计数推导出来的，而非从设备查询。`particleEntities` 对数值型的 `maxParticles` 做鸭子类型判定，并且只统计主树。

有三个命令被导出，用于从面板或代理程序切换插桩，作为[插件命令](/reference/devtools-extend/#插件协议)：

```typescript
const enableDrawCountersCommand: PluginCommand; // 'enable-draw-counters'
const resetDrawCountersCommand: PluginCommand; // 'reset-draw-counters'
const enablePhaseTimingCommand: PluginCommand; // 'enable-phase-timing'
```

当后端无法计数时，它们返回一个状态**字符串**而非抛出异常 — SVG 和仅 WebGL 的路径会报告 `'this backend cannot count draws'`。两者都刻意没有禁用命令，因此请记住，一次 devtools 会话会让计数和阶段计时在渲染器存活期间保持开启，这会改变随后每一帧的成本。

---

## WASM 加速器状态

```typescript
function inspectAccelerators(scene: Scene): AcceleratorInspection;
function formatAcceleratorInspection(info: AcceleratorInspection): PluginRow[];
function auditAccelerators(scene: Scene): PluginFinding[];

interface AcceleratorFinding {
  accelerator: string; // 'transform' | 'animation' | 'hitTest' | 'particle'
  available: boolean; // a backend is installed and could run
  activeThisFrame: boolean; // it ran on the most recent frame
  reason: AcceleratorReason;
  path: string; // which implementation did the work
  faulted: boolean;
  explanation: string; // why, with what to do about it
}

interface AcceleratorInspection {
  accelerators: AcceleratorFinding[]; // always 4, in a stable order
  activeCount: number;
  availableCount: number;
  faulted: AcceleratorFinding[];
  summary: string;
}
```

VectoJS 的 WASM 内核是一个不可见的后端 — JS 是永久的回退，因此一个悄然停止运行的内核会在不破坏任何东西的情况下消耗性能。这就是你如何察觉它。`reason` 区分五种状态：

| `reason`         | 含义                                             | 是个问题？ |
| ---------------- | ------------------------------------------------ | ---------- |
| `active`         | 在 `path` 命名的路径上运行。                     | 否         |
| `not-installed`  | 未加载 WASM 后端。                               | 否         |
| `below-gate`     | 这一帧的工作量太少，不值得调用。                 | 否         |
| `not-applicable` | 没有此类事情可做。                               | 否         |
| `rejected`       | 已安装、已通过门限，然后内核**拒绝了它的参数**。 | **是**     |

对于动画加速器，按类别的判定会指明是哪一类驱动器拒绝了：当一个动画内核拒绝某一帧而另一个仍通过 WASM 步进时，`reason` 会报告 `springs-rejected` 或 `tweens-rejected`（且 `activeThisFrame: true`，因为一半的工作已经运行）。单纯的 `rejected` 保留给两类都拒绝的情况。

`faulted` 恰恰就是 `reason === 'rejected'`（包括按类别判定），而 `auditAccelerators` 只报告这些。这是有意的：一扇保持关闭的门是系统按预期工作，报告它只会训练你去忽略这个审计。一个健康的场景，以及一个完全用 JS 的场景，两者都会审计为干净。

`rejected` 意味着内核已安装、通过了门限，然后什么都没写，这一帧回退到了 JS — 这是上游的尺寸或容量 bug，而不是调优的结果。

> [!NOTE]
> 不要混淆 `accelerators.particle` 与 `Scene.particleBackend`。三个状态 getter `transformBackend`、`animBackend` 和 `hitTestBackend` 是只读的，报告 `'js' | 'wasm'`。而 `Scene.particleBackend` 是一个**可写的请求**（`'auto' | 'webgpu' | 'cpu'`），它改变运行时尝试的内容 — 它不是状态，也不是这个检查所读取的东西。`inspectAccelerators` 只读取 `scene.accelerators` 报告。

---

## 脏重绘归因

```typescript
function diagnoseDirty(scene: Scene, options?: DirtyDiagnosisOptions): DirtyDiagnosis;

interface DirtyDiagnosisOptions {
  frames?: number; // sample window; defaults to the observed frame span
  limit?: number; // how many causes to return. Default 10
}

interface DirtyCause {
  entity?: string;
  reason: string;
  property?: string;
  count: number;
  perFrame: number;
  firstFrame: number;
  lastFrame: number;
}

interface DirtyDiagnosis {
  renderMode: 'always' | 'onDemand';
  frames: number;
  causes: DirtyCause[];
  everyFrame: DirtyCause[];
  summary: string;
}
```

一个每帧都重绘的 `onDemand` 场景，已经失去了作为 `onDemand` 的全部好处。这个函数归结那些重绘：

```typescript
scene.setDirtyTracking(true);
// … run the scene …
const diag = diagnoseDirty(scene);
diag.summary; // one-line verdict
diag.everyFrame; // causes firing on ~every frame — the ones that matter
```

`everyFrame` 保存 `perFrame` 达到或超过 0.9 的原因。那些就是让场景保持清醒的东西。

> [!IMPORTANT]
> 有两件事会让这个读数在你期望数据时返回空，而两件都属正常。
>
> 第一，`scene.setDirtyTracking(true)` 必须在你想测量的帧**之前**调用 — 当跟踪关闭时，`summary` 会明确说明这一点。
>
> 第二，归因只存在于实际传入了来源的 `markDirty(source)` 调用，而 core 与 ui 中的大多数调用点都没有。因此“跟踪已开启，什么都没有记录”是常见情况而非边缘情况，它并不意味着场景是空闲的。把已填充的结果视为强信号，把空结果视为无信息。

关于结果形态的三个细节：

> [!NOTE]
> `reason` 是一个自由格式的字符串，而不是固定的联合 — 当前使用的字符串包括 `driver-tick`、`child-added`、`child-removed`、`animation-start` 和 `a11y-reorder`，但任何调用方都可以自行造出新的。另外，`causes` 会被截断到 `limit`，而 `everyFrame` 是从未截断的列表计算出来的，因此 `everyFrame` 可能包含 `causes` 中没有的原因。在 `renderMode: 'always'` 时，`summary` 会把问题报告为无关紧要，因为一个总是渲染的场景无论如何都会重绘。

---

## Markdown 流指标

```typescript
function inspectMarkdownStream(entity: Entity): MarkdownStreamInfo | null;
function formatMarkdownStream(info: MarkdownStreamInfo): PluginRow[];
function auditMarkdownStreaming(scene: Scene): PluginFinding[];
function isMarkdownEntity(entity: Entity): boolean;
```

流式 Markdown 只有在每个追加的块都复用了上一次的解析时才会快。这些计数器说明它是否如此：

```typescript
interface MarkdownStreamInfo {
  entityId: string;
  sourceLength: number;
  topLevelTokens: number;
  childEntities: number;
  appends: number;
  workerResponses: number;
  coalesced: number;
  tokensPrefixMatched: number;
  tokensReturned: number;
  tokenPrefixReuseRatio: number;
  lexerMs: number;
  sourceCharsLexed: number;
  workerMsAvg: number;
  workerMsMax: number;
  stablePrefixChars: number;
  changedTailChars: number;
  entitiesReused: number;
  entitiesRebuilt: number;
  inPlaceUpdates: number;
  tailFraction: number;
  notes: string[];
}
```

> [!IMPORTANT]
> 三个字段在 **0.11.0 中被重命名，旧名称没有保留为别名**。针对较旧参考写的代码会读到 `undefined`，它悄悄看起来像零：
>
> | 已移除          | 当前                    |
> | --------------- | ----------------------- |
> | `tokensReused`  | `tokensPrefixMatched`   |
> | `tokensRelexed` | `tokensReturned`        |
> | `reuseRatio`    | `tokenPrefixReuseRatio` |
>
> 旧名称命名的东西是错的 — 它们暗示整个 token 被回收了，而实际衡量的是 token 前缀匹配了多少。`lexerMs` 和 `sourceCharsLexed` 是 0.11.0 中新增的。

`auditMarkdownStreaming` 发出五种类型：

- `tail-not-a-delta` — 变化的后缀超过源文本的一半，因此一次追加在重新词法分析文档的大部分内容，而不是一个差异块。
- `low-token-reuse` — 前缀复用低于 50%。
- `slow-worker-roundtrip` — 一次超过 8.3ms 的 worker 响应，即 240Hz 下的两帧。
- `no-worker` — 在主线程上解析。
- `entities-mostly-rebuilt` — 重建的实体多于复用的，因此子协调器没有找到它的匹配。

> [!NOTE]
> 审计以 `appends > 0` 为前提 — 一个从未流式的 Markdown 实体不会产生任何发现。`low-token-reuse` 也要求比值高于零，因此真实的 0% 复用不会被报告。阈值是固定的，不可配置。它只遍历 `scene.rootEntity`，因此模态框内部的 Markdown 实体不会被审计。

`isMarkdownEntity` 对实体的 devtools 描述符报告 `kind: 'Markdown'` 做鸭子类型判定 — 它不导入 `@vectojs/markdown`，也不使用 `instanceof`，因此模型层保持不依赖它。

---

## 将这些注册为面板标签页

每个子系统都附带一个匹配的[插件](/reference/devtools-extend/#插件协议)描述符，以便面板能把它显示为一个标签页。**没有任何东西会自动注册** — 一个从不检查 GPU 的构建不会携带那段代码：

```typescript
import {
  acceleratorAudit,
  acceleratorInspector,
  enableDrawCountersCommand,
  enablePhaseTimingCommand,
  gpuAudit,
  gpuInspector,
  markdownStreamAudit,
  markdownStreamInspector,
  registerDevtoolsPlugin,
  resetDrawCountersCommand,
  textInspector,
} from '@vectojs/devtools/headless';

registerDevtoolsPlugin({
  id: 'perf',
  inspectors: [gpuInspector, acceleratorInspector, markdownStreamInspector, textInspector],
  audits: [gpuAudit, acceleratorAudit, markdownStreamAudit],
  commands: [enableDrawCountersCommand, resetDrawCountersCommand, enablePhaseTimingCommand],
});
```

> [!NOTE]
> `gpuInspector` 和 `acceleratorInspector` 在当前场景上报告并忽略选中项，但面板和桥接都会在调用检查器之前短路到一个“无选中”行。选中任意实体以查看它们的行。审计没有此类约束。

---

[Devtools 概述](/reference/devtools/) · [检查](/reference/devtools-inspect/) · [审计](/reference/devtools-audit/) · [桥接与插件](/reference/devtools-extend/)
