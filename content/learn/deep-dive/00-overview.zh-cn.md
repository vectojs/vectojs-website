+++
title = "00 — 总览：VectoJS 的十六个难题"
description = "VectoJS 十六篇难题深度剖析的导航指南——难题地图、架构不变量、包依赖骨架，以及面向各类新人的阅读路径。"
weight = 20
+++

# 00 — 总览：VectoJS 的十六个难题

## 难题地图

VectoJS 在单个 `<canvas>` 上重新实现了浏览器本应负责的职能：布局、命中测试、事件分发、文本塑形、裁剪、滚动、无障碍和渲染——全部基于对保留式实体树的显式数学运算。这个由十六篇文档组成的系列梳理了框架中最棘手的难题；每篇都聚焦一个过去由 DOM 免费提供、而 VectoJS 如今必须准确实现的子系统。你不必按顺序解决它们，但在选择起点前需要先了解这张地图。

本文档就是这张地图。

- **你将在此学到**：一张图看懂运行时架构、包依赖骨架、每个难题会检验哪条不变量、如何选择阅读顺序，以及这些深度剖析与现有 `content/learn/*` 和 `content/reference/*` 文档的关系。
- **你不会学到**：任何单个难题的具体机制。每篇专题深度剖析负责一个难题。本文档负责为你指路，并提供足够的背景让你有方向地抵达。

## 架构一览

```text
            Application state
                   │
                   ▼
         ┌─────────────────────┐
         │  Virtual Math Tree  │   Entity tree: transforms, bounds, events,
         │  (Scene + Entities) │   dirty/invalidation, worldMatrix. packages/core/tree/Scene.ts:1107
         └─────────┬───────────┘
                   │  dirty, transforms, culling
         ┌─────────▼───────────┐
         │  Layout  / HitTest  │   LayoutEngine (@vectojs/layout), HitTester (@vectojs/core),
         │  / Animation        │   Tween/Spring drivers (@vectojs/animation), physics (@vectojs/math)
         └─────────┬───────────┘
                   │  draw calls / glyph quads / animation frames
         ┌─────────▼───────────┐         ┌──────────────────────────┐
         │   Canvas + GPU      │         │   Thin DOM projection    │
         │  Canvas2D (default) │         │  a11y shadow elements:   │
         │  WebGL  / WebGPU    │◄───────►│  getA11yAttributes(),    │
         │  SVG / Three.js     │  sync   │  a11yProjection modes,   │
         └─────────────────────┘         │  syncA11y walk           │
                                         └──────────────────────────┘
                   │                              │
                   ▼                              ▼
              Visible pixels              Screen readers, IME, Playwright,
                                         copy/find, AT automation
```

像素的唯一来源始终是 canvas。DOM 仅承载**语义与原生输入**，不负责可见场景的渲染。两个世界通过一次深度优先遍历保持同步（`Scene.syncA11y` / `ContentProjectionManager`，见 `packages/core/src/tree/scene/A11yProjectionManager.ts:30`），该遍历在布局之后、呈现帧之前运行。

附近图示的参考渲染已存在于文档中：[运行时架构](/learn/runtime-architecture/) 与[引擎概念](/learn/engine-concepts/)（中央 VMT 枢纽图）。本文中的文本图特意保持可被代码引用且可打印。

## 包依赖骨架

先有叶子引擎，再向上组合。该图是有向无环图；箭头表示“构建时从……导入”：

```text
  @vectojs/text ─┐
                 ├─► @vectojs/layout ─┐
  @vectojs/math ─┤                    │
                 └─► @vectojs/animation├─► @vectojs/core ─┬─► @vectojs/ui ─┬─► @vectojs/markdown
                                                          │                  └─► @vectojs/markdown-app
                                                          ├─► @vectojs/styles
                                                          ├─► @vectojs/table / @vectojs/node-editor
                                                          │
                                   @vectojs/tex ──────────┤  (consumed by markdown; public API)
                                                          │
           @vectojs/graph-layout ─► @vectojs/graph3d ─────┤  (@vectojs/knowledge-graph above graph3d)
           @vectojs/three / @vectojs/devtools /            │
           @vectojs/video-exporter / @vectojs/desktop      ┘  (host apps atop core+ui)

  crates/vectojs-core-rs (Rust → wasm32)  — invisible accelerator behind @vectojs/core
```

已对照 `packages/*/package.json` 依赖验证（`text`/`math`/`graph-layout`/`tex` 零 `@vectojs/*` 依赖；`layout→text`、`animation→math`、`core→{layout,text,math,animation}`、`markdown→{ui,tex,core}`）。构建遵循此顺序（`package.json:14`）。测试通过 `vitest.config.ts` 将同级包别名到 `src/`，因此该顺序决定的是 `.d.ts` 产出，而非测试执行。

追踪依赖时需注意两个消费者陷阱：`references/` 中的虚假路径被硬编码在 `packages/tex/scripts/vendor-katex.ts`（`--source`）和 `scripts/compare-pretext.ts`（`VECTO_PRETEXT_PATH`）中——移动该目录会静默地破坏它们（见 `AGENTS.md`）。

## 十六个难题一览

共 16 篇文档：本总览（00）加上 15 篇专题难题（01–15）。难度衡量的是“出错的代价”，而非代码量。“首次阅读”指通往_可用_的 VectoJS 工作的最快路径；“深度前置”指在解决该难题之前应当先读的其他难题。

| #   | 难题（深度剖析）                              | 包                                                                            | 难度 | 适合谁阅读                            | 深度前置 | 首次阅读面向…              |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------- | ---- | ------------------------------------- | -------- | -------------------------- |
| 00  | **总览与导航**（本文档）                      | — (meta)                                                                      | ☆    | 所有人，首站                          | —        | 定向                       |
| 01  | **Canvas 原生选区** — 双世界同步              | `core` (`ContentGridProjector`, `ContentProjectionManager`), `text`, `layout` | ★★★★ | 文本/选区/IME、复制/查找/翻译         | 02       | 可选文本、终端、代码编辑器 |
| 02  | **文本与布局** — Unicode/BiDi/塑形/排版       | `text`, `layout`, `core/text`                                                 | ★★★★ | 布局引擎、i18n、排版                  | —        | 超越 ASCII 的任何文本      |
| 03  | **语义投影与虚拟化** — 物化生命周期           | `core/a11y`, `ui`, `markdown`, `table`                                        | ★★★  | 无障碍、虚拟化、密集文档              | 06       | 大型文档、列表、仪表盘     |
| 04  | **流式 Markdown** — 增量调和                  | `markdown`, `ui`, `layout`                                                    | ★★★  | 流式/LLM 界面                         | 02       | 对话/流式阅读器            |
| 05  | **零 DOM TeX** — 布局与 SVG 发射              | `tex`                                                                         | ★★★  | 数学渲染                              | 02       | Markdown 中的公式          |
| 06  | **VMT 运行时** — 脏标记/失效/生命周期/事件    | `core/tree`, `core/layout`, `core`                                            | ★★★★ | Scene/Entity 生命周期、命中分发、性能 | —        | 自定义实体、性能调试       |
| 07  | **渲染器** — 坐标/裁剪/DPR 一致性             | `core/renderer`, `core/performance`                                           | ★★★  | 多后端、HiDPI、剔除                   | 06       | canvas/WebGL/WebGPU 工作   |
| 08  | **WASM 三件套 — G1/G2/G3** — 比特级一致的加速 | `crates/vectojs-core-rs`, `math`, `animation`, `graph-layout`, `core/wasm`    | ★★★  | 性能、Rust↔JS 对等                    | 06, 07   | 规模化下的帧预算           |
| 09  | **Three.js / XR 桥接** — 两个坐标世界         | `three`, `graph3d`                                                            | ★★   | 3D 面板、XR                           | 06, 07   | 嵌入 Three.js 的 VectoJS   |
| 10  | **确定性视频导出** — 固定步进时钟             | `video-exporter`                                                              | ★★   | 离线捕获、回放                        | 06       | 录屏、仿真导出             |
| 11  | **图布局** — 力导向 + WASM                    | `graph-layout`, `graph3d`, `knowledge-graph`                                  | ★★   | 图可视化、布局调优                    | 06, 08   | 网络/知识图谱              |
| 12  | **DevTools** — 运行时自检与审计               | `devtools`, `core` (`frameStats`, `syncA11y`)                                 | ★    | 调试、CI 审计                         | 06       | “这个实体为何在此”         |
| 13  | **样式与主题** — 数值 VMT 上的 CSS 对等能力   | `styles`, `core`                                                              | ★★   | 样式、主题与 CSS 迁移                 | 06       | 令牌与主题切换             |
| 14  | **响应式布局与交互** — 适配视口和输入         | `core`, `ui`, `layout`                                                        | ★★★  | 响应式应用与布局作者                  | 03、06   | 自适应 Canvas UI           |
| 15  | **垂直应用** — 图谱、编辑器、桌面与表格的组合 | `knowledge-graph`, `node-editor`, `desktop`, `table`                          | ★★★  | 产品与集成作者                        | 06       | 组合引擎原语               |

顺序说明：

- 若必须只选两篇作为 00 之后的“第二读”，02 与 06 是最佳选择——大多数其他难题都假设你已掌握其中之一。
- 03 依赖 06 的脏标记/生命周期机制；04 依赖 02 的塑形/布局；07 与 08 都依赖 06，因此自然地聚集在它之后。
- 08 的难度不在 Rust 语法，而在**比特级一致的回退契约**及其构建陷阱（`crates/vectojs-core-rs/build.sh` 中的 `RUSTFLAGS`）。
- 团队追踪器已按 `CTX-0566→…→CTX-0578→CTX-0579` 排序；上表是阅读顺序，允许与构建/发布顺序不同。

## 支配每个难题的三条不变量

每个难题都可能破坏其中一条。若你什么都记不住，请记住这些不变量。

### 1. VMT 生命周期不变量

> 实体在其 **脏标记、worldMatrix 与子列表** 在每次 `Scene` 步进后保持一致。

破坏时的症状：`remove(child)` 后未注销驱动导致边界陈旧（`Entity:1582`）、部分 `markDirty` 后出现幽灵命中目标、JS 与 WASM SoA 存储之间的变换发散（`crates/vectojs-core-rs/src/*.rs`，G1）。守卫：`Scene.ts:532` `renderMode` / `DirtyTracker.ts:33` 契约、`DriverTicker.ts:40` 遍历、`Entity.ts:782` 子类契约。90% 的“神秘渲染故障”可追溯至此。

### 2. 双世界对等不变量

> 每个**可见且可交互**的实体都拥有一个**已同步的无障碍对应物**，其几何、角色/名称/状态以及焦点/指针路由与 canvas 真值一致。

破坏时的症状：Playwright `getByRole` 找不到任何内容、屏幕阅读器播报陈旧文本、点击命中错误实体、IME 落在错误的输入框。守卫：`Entity.ts:295` `A11yAttributes`、`Entity.ts:968` `a11yProjection` 模式（`eager`/`onDemand`/`never`）、`Entity.ts:1937` `getA11yAttributes()` 默认值、共享的 `syncA11y` 遍历（`A11yProjectionManager.ts:30`、`ContentProjectionManager.ts:26`）以及 `A11yProjectionManager.ts:227` 陈旧记忆失效。`onDemand` 物化与视口虚拟化是难点（难题 03）——也是大多数真实 VectoJS 卡顿所在之处。

### 3. 文本度量不变量

> **度量一次，多次布局**——并且使用**真实**字体、在**正确**上下文、以**正确** DPR 进行度量。

破坏时的症状：文本与其命中框错位、选区带偏移一行、CJK 亚像素间隙呈现为白线、Web 字体回退静默改变 advance、DPR 缩放使一个子系统模糊而另一个不模糊。守卫：`packages/text/src/fontMetrics.ts:82` `registerFontMetrics`、`packages/text/src/Typography.ts:111` `ctx.measureText('Mg')` 及无 DOM 时回退到 0.5em、`packages/text/src/measureContext.ts:12` 度量上下文校准、`packages/layout/src/LayoutEngine.ts:808` `LayoutEngine` 冷/热分离与段落记忆化。每个触及文本的难题（01、02、04、05）都会从不同角度重新进入该不变量。

在评审期间将这三条作为检查清单：在批准任何改动前，先问“这可能破坏哪条不变量，它会最先在哪里显现？”

## 这些深度剖析与现有文档的关系

| 现有文档                                                                                                               | 深度剖析（本系列） | 关系                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content/learn/*`（介绍、运行时架构、引擎概念、文本排版、核心场景、无障碍、流式等）                                    | 00–15              | **Learn 教你如何_使用_ VectoJS**；深度剖析则讲 **VectoJS 在该用法_内部如何工作_**。先读对应的 learn 章节会让相应的难题更容易理解。建议配对：`text-typography` → 难题 02；`core-scene` + `events` → 难题 06；`accessibility` → 难题 03；`streaming` → 难题 04。 |
| `content/reference/*`（core-a11y、core-entities、core-layout、core-text、ui-markdown、three-adapter、graph-layout 等） | 00–15              | **Reference 是 API 真值**（属性、类型、子路径）。深度剖析会引用参考页但不重复它们。如有疑问，以参考签名为准。                                                                                                                                                  |
| `forge/findings/*` + `forge/baselines/*`                                                                               | 每个深度剖析的附录 | Findings 是**实地笔记**；baselines 是**实测证据**。深度剖析将 findings 综合为每个难题的单一叙事，并链回赢得该论断的 `file:line` 条目。                                                                                                                         |
| `vectojs/AGENTS.md` + `vectojs/README.md`                                                                              | 00（本文档）       | 包图、构建顺序与渲染/交互模型**按字面意义从 AGENTS.md 与 README.md 逐字复制**，并对照 `package.json` 验证——非凭空捏造。                                                                                                                                        |

规则：**权威端优先**。若同一事实同时出现在 learn/reference 页面与深度剖析中，则以 learn/reference 页面为纠正目标。切勿在 `vectojs-docs/content` 与 `vectojs-website/src/content` 之间执行 `cp -r`（见 `AGENTS.md`——格式漂移 + 408 个 i18n 文件）。

## 阅读路径——任选其一

**“我刚加入”** — 00 → 02（文本/布局）→ 06（VMT 生命周期）→ 07（渲染器）→ 最贴近你首个任务的难题。两个下午，足够提交一个真实 PR。

**“我负责某个功能”** — 00 → 你的难题 → 它的深度前置行 → 对应的 `content/learn/*` 章节 → 该难题的 `forge/findings/<area>.md`。在评审前再浏览一遍不变量章节。

**“我负责性能”** — 00 → 06 → 07 → 08（WASM G1/G2/G3）→ 11（图）— 然后是 `benchmarks/run-browsers.sh` 与 `forge/baselines/*.json`。只有 `run-browsers.sh` 的数字可被引用。

**“我负责无障碍 / 密集文档 / 表格”** — 00 → 06 → 03 →（若选区/复制对你的界面重要，则加上 01）。

**“我负责 3D / XR / 图可视化”** — 00 → 06 → 09 → 11 →（若布局计算是你的预算瓶颈，则加上 08）。

每个深度剖析的 frontmatter 都声明了其 `order`、`package` 集合与 `prereq` 列表，因此即便读者中途跳入，Zola 与侧边栏仍保持有序。

## 约定与验证标准

- 所有代码引用均通过 `ctxctl outline` → `grep -rn` → `read` 验证后写作 `file:line`（绝不凭记忆）。含糊的引用会包含函数/类名。
- 每个文档都要求 Zola frontmatter（`title`、`description`、`order`）。标题使用 H2/H3 + 围栏代码块（遵循全局 AGENTS.md）。
- 令牌/检查门：对文档改动在 PR 前运行 `just fmt` / `just check` 的等效命令；在 `vectojs-docs` 侧，推送前执行 `scripts/sync-content.py` 漂移检查。
- 每个深度剖析保持在约 600 行以内；本总览在约 400 行以内。重密度而非冗长；多链接，少重复。

## 下一步

从上面的路径中选择一条。常规的下一步是：若你触及文本则阅读 **难题 01 — Canvas 原生选区**，若你触及生命周期/事件则阅读 **难题 06 — VMT 运行时**——两者都是通往更难组合（02、08）的短捷入口。

---

_系列：00 总览 → 01 选区 → 02 文本+布局 → 03 投影+虚拟化 → 04 流式 Markdown → 05 TeX → 06 VMT 运行时 → 07 渲染器 → 08 WASM G1/G2/G3 → 09 Three/XR → 10 视频导出 → 11 图布局 → 12 DevTools → 13 样式 → 14 响应式 → 15 垂直应用 → 99 综合。_
