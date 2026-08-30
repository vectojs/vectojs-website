---
title: '15 — 垂直应用 — 知识图谱、节点编辑器、桌面与表格'
description: '垂直包如何组合引擎原语——知识图谱基于 graph3d/力布局、节点编辑器的命令与历史、桌面窗口管理与表格虚拟化——以及应用陷阱与引擎缺陷的分野。'
order: 35
---

# 15 — 垂直应用 — 知识图谱、节点编辑器、桌面与表格

> 引擎原语孤立时正确；垂直应用在分页、撤销、窗口化与 10 万行压力下证明它们可组合。仅在 10 行时可用的表格、扩展时瞬移的图、或泄漏叠加层无障碍镜像的窗口，皆为应用层组合缺陷而非物理或渲染器缺陷——而 forge 正因如此才将它们分开。

- **你将学到**：四个垂直领域如何组合稳定原语——`KnowledgeGraphModel` 基于 `GraphLayout`/`Graph3D`、`NodeEditor` 基于 `CommandHistory`/`SelectionState`/`layoutDocument`、`DesktopShell`/`WindowManager`/`DesktopWindow` 基于 `Scene` 叠加层，以及 `Table` 基于 `Text` + `GridCellHotspot` 虚拟化——以及使增量增长廉价、拆卸干净的每个文件边界与归属规则。
- **你不会学到**：`ForceLayout2D`/`VectoForceLayout` 内部物理（boss 11）、VMT 脏检查生命周期（boss 06）或渲染器/DPR 契约（boss 07）。本文档展示应用如何*消费*这些引擎，而非引擎如何计算。

## 1. 知识图谱 — 3D 上的分页切面

### 1.1 数据契约

`KgEntity extends GraphNode` 位于 `packages/knowledge-graph/src/types.ts:19`，`KgFact extends GraphLink` 位于 `types.ts:31`，因此相同对象可直接流入 `@vectojs/graph3d` 布局与渲染器且领域字段保持不动（`type`、`labels: LabelMap`、`predicate`、`confidence`、`provenance`）。`KgDataSource` 位于 `types.ts:54`，为惰性缝隙：`getNodes(ids?)` 用于种子，`getNeighbors(id, { limit, cursor, direction, signal })` 位于 `types.ts:58` 用于分页跳跃。`KgNeighborhood` 位于 `types.ts:68` 携带 `facts`、`neighbors`、`nextCursor`/`hasMore` 以及可选 `entity`——缺席意味着“未知 id”且必须失败而非伪造（见 §1.3）。

`LabelMap` 位于 `types.ts:12`，为 `Record<languageTag, string>` 并以 `''` 作为回退；`pickLabel` 位于 `types.ts:87` 优先请求语言，其次 `''`，再 `en/zh/…`，最后任意键。`KgGraphData` 位于 `types.ts:43`，为适配器物化后的内存快照。

`MemoryDataSource` 位于 `packages/knowledge-graph/src/MemoryDataSource.ts:15`，为测试/小图适配器：按两端点索引事实（`MemoryDataSource.ts:17` 处 `out`/`inn`）使 `getNeighbors` 为 `O(degree)`，在 `'both'` 中去重自环（`MemoryDataSource.ts:71`），并将游标版本化为 `"<version>:<offset>"`（`MemoryDataSource.ts:108`）——`load()` 位于 `MemoryDataSource.ts:26` 提升 `version`，使飞行中游标大声失败而非对已变更列表切片（`MemoryDataSource.ts:125`）。

`rdf.ts:11` 经 `n3` `Parser` 提供 `parseRdfTurtle(text)`：主体成为实体，`rdf:type` 设置 `type`（后者胜出，`rdf.ts:51`），`rdfs:label`/`skos:prefLabel`/`schema:name` 填充 `labels`（`rdf.ts:56`），其他对象 IRI 三元组成为 `KgFact`（`rdf.ts:62`），且每个实体获得 `''` 回退（`rdf.ts:74`）。同步 `Parser.parse`——不适合在主线程处理数百 MB（`rdf.ts:24` 文档）。

### 1.2 FixedZLayout — 无需分叉的 2D 投影

`FixedZLayout` 位于 `packages/knowledge-graph/src/FixedZLayout.ts:22`，包裹 `VectoForceLayout` 并在每次 `step()` 后（`FixedZLayout.ts:49`）与 `setGraph` 后（`FixedZLayout.ts:37`）将每个 `z` 钳制为常量。内部模拟仍作为 3D Barnes-Hut 八叉树运行；`pinNode` 以 `z ?? this.z` 委托（`FixedZLayout.ts:56`），`sanitize()` 位于 `FixedZLayout.ts:85` 将非有限 `x/y` 重播种到 `cbrt` 螺旋。固定点契约与 `ForceLayout2D`（按 ID 寻址）分歧：`FixedZLayout` 如 `GraphLayout`（`GraphLayout.ts:46`）般按索引固定，见 `FixedZLayout.ts:18` 注释。

### 1.3 KnowledgeGraphModel — 唯一的布局驱动器

`KnowledgeGraphModel` 位于 `packages/knowledge-graph/src/KnowledgeGraphModel.ts:62`，与渲染器无关并拥有分页切面：`entities`/`facts`/`factKeys`/`expansions`/`requests`/`entityOrder`/`lastPositions`（`KnowledgeGraphModel.ts:69`）。它是其借用 `GraphLayout` 的**唯一驱动器**（`KnowledgeGraphModel.ts:43` 文档：每个 `rebuildGraph` 一次 `setGraph`，每个 `expand` 一次 `reheat`）。构造接受 `source`、可选借用 `layout`、`pageSize`、`direction`、`lang`（`KnowledgeGraphModel.ts:39`）。

- `bootstrap(focusIds, expandSeeds)` 位于 `KnowledgeGraphModel.ts:114` 经 `getNodes` 获取种子、`ingestEntities`、`rebuildGraph()`，随后对每个种子 `expand`。
- `expand(id)` 位于 `KnowledgeGraphModel.ts:127` 按 id 共享 promise（`KnowledgeGraphModel.ts:134`），对 `complete` 短路（`KnowledgeGraphModel.ts:136`），标记 `loading`（`KnowledgeGraphModel.ts:144`），随后 `loadPage`（`KnowledgeGraphModel.ts:240`）。
- `loadPage` 经 `source.getNeighbors` 带 `AbortSignal` 分页（`KnowledgeGraphModel.ts:246`），若 `page.entity` 缺失则大声失败（`KnowledgeGraphModel.ts:259`——永不摄入占位 `'Unknown'` 节点），摄入实体/事实，按**批次** `page.facts.length` 而非净新增推进 `loaded`（`KnowledgeGraphModel.ts:273`），记录 `ExpansionState`（`KnowledgeGraphModel.ts:275`），`rebuildGraph()` + `layout?.reheat(0.5)`（`KnowledgeGraphModel.ts:285`）。
- `cancelExpand` 位于 `KnowledgeGraphModel.ts:150` 经 `AbortController` 中止，标记 `cancelled`。
- `rebuildGraph()` 位于 `KnowledgeGraphModel.ts:332` 捕获布局位置、合并稳定 `entityOrder`、从 `lastPositions` 为新节点播种、构建带 `pickLabel` 的 `GraphData`，并调用 `layout?.setGraph`。
- `dispose()` 位于 `KnowledgeGraphModel.ts:225` 刻意**不**释放借用布局——session 可能仍在共享它（`KnowledgeGraphModel.ts:230` 注释）。

位于 `KnowledgeGraphModel.ts:23` 的快照契约是 `{ version:1, entities, facts, expansions }`；`exportSnapshot`/`importSnapshot` 经 `lastPositions` 保留位置并递增 revision 以中止陈旧请求（`KnowledgeGraphModel.ts:190`）。

### 1.4 Graph3D + GraphLayout — 渲染缝隙

`GraphLayout` 位于 `packages/graph3d/src/layout/GraphLayout.ts:12`，为最小、worker 友好的契约：`setGraph(data)`、`step(iterations) -> boolean` 活跃/发热（`GraphLayout.ts:28` 文档）、按 `GraphData` 节点顺序的扁平 `Float32Array positions` xyz 三元组（`GraphLayout.ts:35`）、可选按索引的 `pinNode`/`unpinNode`/`reheat`。`Graph3D` 位于 `packages/graph3d/src/Graph3D.ts:28`，无论规模均为两次绘制调用：一 个 `InstancedMesh`（`Graph3D.ts:115`）带 `∛val` 半径缩放（`Graph3D.ts:104`），一个 `LineSegments`（`Graph3D.ts:136`）。`setGraphData` 在附加前校验端点（`Graph3D.ts:73`），`applyPositions` 位于 `Graph3D.ts:149` 写入矩阵、内联跟踪边界（避免 `computeBoundingSphere` 开销——`Graph3D.ts:178` 实测 60–78%），并在数组过短时一次性告警（`Graph3D.ts:162`）。

### 1.5 KnowledgeGraphSession — 装配

`KnowledgeGraphSession` 位于 `packages/knowledge-graph/src/KnowledgeGraphSession.ts:67`，拥有 `model`、`graph: Graph3D`、`camera: GraphCamera`、`layout: GraphLayout` 与 `interaction: GraphInteraction`。构造函数位于 `KnowledgeGraphSession.ts:92` 构建 `Graph3D`、`GraphCamera`（模式为 session `mode`），并为 `'2d'` 构建 `FixedZLayout`（`z:0, repulsion 120, linkDistance 55` 位于 `KnowledgeGraphSession.ts:109`）否则为 `VectoForceLayout`。模型以借用布局 + `lang` 构造（`KnowledgeGraphSession.ts:120`）。交互经 `camera: () => camera.camera` 连线使模式切换保持实时（`KnowledgeGraphSession.ts:129`），`handleSelect`/`handleHover` 路由到索引对齐的 `entityByIndex`（`KnowledgeGraphSession.ts:87`）。

- `bootstrap` 位于 `KnowledgeGraphSession.ts:182` 等待 `model.bootstrap`，若中途已释放则退出（`KnowledgeGraphSession.ts:189`），随后 `syncFromModel()` + `camera.fitToPositions`。
- `syncFromModel()` 位于 `KnowledgeGraphSession.ts:287` 将 `model.getGraphData()` 镜像到 `graph.setGraphData`/`applyPositions` 与 `interaction.setNodeCount`。
- `tick(iterations)` 位于 `KnowledgeGraphSession.ts:242` 步进布局，仅在收敛时捕获布局位置（`KnowledgeGraphSession.ts:250`——发热帧不缓存），应用到渲染器。`tick` 在冷却时返回已收敛（`!stillHot`），匹配 `if (!tick()) rAF`。
- `expand` 位于 `KnowledgeGraphSession.ts:219` 委托给模型、镜像并触发 `onExpand`。
- `expandInBackground` 位于 `KnowledgeGraphSession.ts:332` 按 id 去重飞行中扩展（`KnowledgeGraphSession.ts:85` 处 `inFlightExpansions`），将失败路由到 `onError` 或 `console.error`——永不未处理（`KnowledgeGraphSession.ts:338`）。
- `dispose()` 位于 `KnowledgeGraphSession.ts:267` 按序释放 interaction/camera/graph/layout/model；session 拥有布局，模型不拥有。

`GraphInteraction` 位于 `packages/graph3d/src/GraphInteraction.ts:83` 经 `THREE.Raycaster`（`GraphInteraction.ts:168` `raycaster.setFromCamera`）将指针事件转为 `Graph3D` 上的 `onHover`/`onSelect`/`onDrag`，在 `GraphInteraction.ts:300` 构建法线平面拖动并经 `layout.pinNode` 写入（`GraphInteraction.ts:309`）。`setControlsEnabled(false)` 位于 `GraphInteraction.ts:214` 在拖动期间阻断宿主 `OrbitControls`。

无障碍：`knowledge-graph` **不**为每节点投影 DOM（`KnowledgeGraphSession.ts:64` 文档）——在宿主中配对聚合 `role="status"` 播报器。

### 1.6 帧集成与生命周期

session 永不拥有 `WebGLRenderer` 或 `requestAnimationFrame` 循环——宿主拥有（`KnowledgeGraphSession.ts:60` 文档）。正确连线为一次 `attach(scene)`（`KnowledgeGraphSession.ts:153`）、等待 `bootstrap`（`KnowledgeGraphSession.ts:182`），随后每帧 `tick()` + `render(renderer, scene)`（`KnowledgeGraphSession.ts:242`/`KnowledgeGraphSession.ts:256`）。`tick` 仅捕获已收敛位置（`KnowledgeGraphSession.ts:250`——发热帧捕获会为每节点每帧写一个 `Map` 条目）并在冷却时返回 `true`（`KnowledgeGraphSession.ts:252`），因此循环为 `if (!session.tick()) requestAnimationFrame(loop)`（`KnowledgeGraphSession.ts:240` 文档）。`KnowledgeGraphSession.ts:189`/`KnowledgeGraphSession.ts:227` 处等待后释放守卫使构造器中即发即忘 `bootstrap`（`KnowledgeGraphSession.ts:145`）的迟到延续静默——缺少它们，镜像会对已拆除的 `Graph3D` 运行。

`loadSnapshot` 位于 `KnowledgeGraphSession.ts:202`，为演示/离线路径：它构建 `KnowledgeGraphSnapshot` 并将每个实体标记为 `complete` 且 `loaded = facts.length`（`KnowledgeGraphSession.ts:208`），使 `expandOnSelect`（`KnowledgeGraphSession.ts:94` 选项，`KnowledgeGraphSession.ts:318` 检查）不对已存在跳跃重取。`setSize` 位于 `KnowledgeGraphSession.ts:263` 转发到 `camera.setSize`；`getMode` 位于 `KnowledgeGraphSession.ts:160` 暴露 session `mode`（`types.ts:6` 处 `'2d'|'3d'`）。

### 1.7 图数据类型与宿主归属

`GraphData` 位于 `packages/graph3d/src/types.ts:1`，为 `{ nodes: GraphNode[], links: GraphLink[] }`，其中 `GraphNode` 携带 `id: NodeId`（`types.ts:6` `string|number`）、可选 `x/y/z` 种子、可选 `fx/fy/fz` 固定点、`val` 供 `Graph3D` 半径以及 `color`。`GraphData` 是唯一跨越模型→布局→渲染器缝隙的对象——`KnowledgeGraphModel` 从 `KgEntity`/`KgFact` 构建它（`KnowledgeGraphModel.ts:332` `pickLabel` + `position` 展开），`GraphLayout.setGraph` 按值消费（实现克隆或拷贝到 SoA），`Graph3D.setGraphData` 按 id 索引它（`Graph3D.ts:80` `indexById`）。渲染器刻意不知位置如何计算（`Graph3D.ts:26` 文档：可在 worker 后可交换或远程），布局亦不知渲染器如何批量（`VectoForceLayout.ts:68` 文档）。宿主归属明确：调用方构造 `VectoForceLayout`/`D3ForceLayout`/`FixedZLayout` 与 `Graph3D`/`GraphCamera`，模型借用布局（`KnowledgeGraphModel.ts:47` `layout?: GraphLayout` 文档），session 拥有它（`KnowledgeGraphSession.ts:277` 释放）。`D3ForceLayout` 克隆为 `simNodes`（`D3ForceLayout.ts:71`）因为 d3 会变更输入；`VectoForceLayout` 保持 f32 SoA（`VectoForceLayout.ts:88` `positions/vx/vy/vz/fx/fy/fz`）且从不变更调用方节点。`Graph3D.applyPositions` 在 `positions.length < count*3` 时以每 `setGraphData` 一次告警短路（`Graph3D.ts:162` `hasWarnedShortPositions`，于 `Graph3D.ts:100` 重置）而非写入使整个网格被视锥剔除的 NaN 实例矩阵。

## 2. 节点编辑器 — 文档、命令与选区

### 2.1 文档模型

`NodeDocument` 位于 `packages/node-editor/src/model.ts:54`，为 `{ nodes: NodeData[], links: LinkData[] }` 并带不可变变换（`model.ts:78` 处 `cloneDocument`、`model.ts:64` 处 `deepCloneValue` 用于 `data` 映射，`model.ts:93` 处 `updateNodePosition`）。`NodeData` 携带 `position`、可选 `width`/`height`、`ports: PortDefinition[]`（`model.ts:8` 带 `direction`、`dataType`、`maxConnections`）、`data`；`LinkData` 携带 `source`/`target` + 端口 id（`model.ts:27`）。

`validateLink` 位于 `model.ts:126` 检查源/目标存在、`same-node` 自环拒绝、`duplicate-link-id`、端口存在 + 方向（`output`→`input`）、`dataType` 上 `incompatible-types`、有向端点对上 `duplicate-link`，以及经 `maxConnections` 的 `target-port-occupied`（`model.ts:152`）。跨多节点的环**被允许**——文档为用户编写的流（`model.ts:117` 文档）。`addLink`/`removeLink`/`removeNode` 位于 `model.ts:163` 强制执行；`removeNode` 位于 `model.ts:178` 移除关联连边以保持引用有效。

### 2.2 历史与选区

`CommandHistory` 位于 `packages/node-editor/src/history.ts:9`，为教科书式撤销/重做：`execute(label, after)` 经 `cloneDocument` 快照 `before`/`after`，压入 `undoStack`，清空 `redoStack`（`history.ts:28`），`undo()`/`redo()` 交换 `current`（`history.ts:40`）。所有 `NodeEditor` 变更经此单一门控，使每个用户操作为一个历史条目。

`SelectionState` 位于 `packages/node-editor/src/selection.ts:9` 跟踪 `ids: Set<string>` 并带 `select(id, additive)`（`selection.ts:22`）、`clear()`、`list()` 快照以及当前拖动的瞬态 `drag: DragState | null`（`selection.ts:11`）。`layoutDocument` 位于 `packages/node-editor/src/layout.ts:14` 为确定性分层布局：组件 DAG 上 Tarjan SCC（`layout.ts:96` `stronglyConnectedComponents`），Kahn 拓扑秩分配（`layout.ts:54`），随后 `x = originX + rank*horizontalGap`、`y = originY + index*verticalGap`（`layout.ts:85`）。经排序 id 与目标确定（`layout.ts:18`/`layout.ts:27`）。

### 2.3 NodeEditor 实体组合

`NodeEditor` 位于 `packages/node-editor/src/editor.ts:199` 扩展 `Entity`（`editor.ts:214` 处默认 `width 1000, height 700`），拥有 `selection`、`history: CommandHistory`（`editor.ts:201`）、`nodeEntities`/`linkEntities` 映射（`editor.ts:202`）、`status: StatusAnnouncer`（`editor.ts:204`）以及瞬态 `dragDocument`/`connection`/`connectionPoint`（`editor.ts:205`）。子节点为 `NodeCard`（`editor.ts:143`）、`LinkEntity`（`editor.ts:119`）、`PortEntity`（`editor.ts:51`）与 `StatusAnnouncer`（`editor.ts:29`）。

- `NodeCard` 位于 `editor.ts:143` 为带卡片装饰的 `UIComponent`，拥有 `PortEntity` 子节点（`editor.ts:162`），经 `selection.has` 以漫游 `tabIndex` 宣告 `role="button"`（`editor.ts:174`），并将 `pointerdown/move/up` 路由到 `editor.beginDrag/moveDrag/endDrag`（`editor.ts:155`）。
- `PortEntity` 位于 `editor.ts:51` 为 12px 圆形（`editor.ts:20`），输出端口右对齐（`editor.ts:62`），将 pointerdown 路由进 `editor.beginConnection`（`editor.ts:66`），将带 `KeyboardEvent` 来源的 `click` 路由进 `editor.portActivated`（`editor.ts:90`——过滤浏览器对同一镜像上合成点击，因指针捕获将释放的连接拖动重定向回它）。
- `LinkEntity` 位于 `editor.ts:119` 绘制源→目标连线，实时读取 `nodeEntities` 位置（`editor.ts:136`）。
- `StatusAnnouncer` 位于 `editor.ts:29` 为不可见 `role="status"` 实时区域（`aria-live polite`，`editor.ts:40`），用于仅键盘连接状态（无可视橡皮筋）。

编辑操作：

- 拖动：`beginDrag` 位于 `editor.ts:406` 经 `cloneDocument` 快照 `dragDocument`，设置带起点的 `selection.drag`。`moveDrag` 位于 `editor.ts:421` 为热路径：**就地**变更 `node.position` 并在卡片上 `setPosition`，无逐移动克隆——`LinkEntity` 读取同一 `nodeEntities` 映射因此连边无需重建即跟随（`editor.ts:427` 注释）。`endDrag` 位于 `editor.ts:441` 比较前后 JSON 并压入一个 `'Move node'` 条目；`cancelDrag` 位于 `editor.ts:452` 经 `dragDocument` 的 `applyPreview` 回滚。
- 连接：`beginConnection`/`moveConnection`/`endConnection` 位于 `editor.ts:282` 处理橡皮筋；`portActivated` 位于 `editor.ts:297` 为 WCAG 2.1.1 对等——输出端口武装待定连接（无橡皮筋点，经 `editor.ts:307` 处 `status.say` 播报），输入端口经 `commitLink` 提交（`editor.ts:334`）。`commitLink` 构建 `link:id = link:<src>:<port>:<tgt>:<port>`（`editor.ts:337`）并调用 `createLink`（`editor.ts:380` 经历史压入 `addLink`）。`handleKeyDown` 位于 `editor.ts:459` 将 `Escape` 映射为取消两种手势，将 `Ctrl/Cmd+Z/Y` 映射为撤销/重做（先于 `editor.ts:474` 取消瞬态手势），将 `Delete/Backspace` 映射为 `deleteNodes(selection.list())`（`editor.ts:480`）。
- 自动布局：`applyAutoLayout` 位于 `editor.ts:274` 运行 `layoutDocument`，在变化时压入一个 `'Auto-layout'` 条目（`editor.ts:277`）。

位于 `packages/node-editor/src/persistence.ts:168` 的持久化是 `exportDocument(document) -> string`（先于 `persistence.ts:169` 校验，以 `schemaVersion: 1` 包裹于 `persistence.ts:171`，经 `persistence.ts:164` 处 `JSON.parse(JSON.stringify(...))` 的 `cloneJson`）与位于 `persistence.ts:178` 的 `importDocument(serialized)`（解析，于 `persistence.ts:186` 检查 `schemaVersion`，随后 `persistence.ts:84` 处 `validateDocument`——结构检查外加于 `persistence.ts:156` 对等体 `validateLink` 的语义遍，验证前将每条连边从集合中剥离，因此处于容量上限的合法连边不会因自身占用测试而误失败）。拒绝非有限位置、重复 id/端口、缺失端口引用、错误 `direction` 与 `dataType` 不匹配（`persistence.ts:70`）。`NodeEditorPersistenceError` 位于 `persistence.ts:24` 为失败契约。`isJsonValue` 位于 `persistence.ts:41` 守卫 `data` 映射的 JSON 安全环（`persistence.ts:45` 处 `WeakSet`）、非有限数（`persistence.ts:43`）与符号键（`persistence.ts:50`），使持久化 `NodeDocument` 无损往返 `JSON.stringify`——`data` 中任何 `Map`/`Set`/`Date` 必须在导出前序列化为普通 JSON。

### 2.4 本垂直领域的已知陷阱

已耗费真实评审时间的编辑器特定陷阱（见 `packages/node-editor/src/editor.ts` 内联注释）：

- **指针来源过滤**——`editor.ts:90` 处 `PortEntity` 点击处理器以 `nativeEvent instanceof KeyboardEvent` 为门控，因为 core 亦为同一镜像上原生浏览器点击合成 `click`（指针捕获将释放的连接拖动重定向回它）。无过滤时，释放的连接会同时完成并重武装待定键盘连接。
- **拖动别名**——`moveDrag` 就地变更 `documentState` 自身节点对象（`editor.ts:427`“经 `cloneDocument` 拥有其节点对象”），使就地编辑不别名历史快照；`editor.ts:411` 处预拖动克隆 `dragDocument` 保持干净以供 `cancelDrag`。
- **历史污染**——`endDrag` 仅当 JSON 变化时压入（`editor.ts:445` `JSON.stringify(before) !== JSON.stringify(current)`），`applyAutoLayout` 同理（`editor.ts:276`）。否则无操作拖动会添加一个无事可做却移动重做栈的撤销条目。
- **瞬态手势作用域**——`editor.ts:390` 处 `deleteNodes` 与 `editor.ts:474` 处 `Ctrl+Z/Y` 路径均在变更历史前取消待定 `connection`/`drag`，使历史命令看到真实文档而非半移动节点。

## 3. 桌面外壳 — Scene 上的窗口管理器

### 3.1 外壳与布局

`DesktopShell` 位于 `packages/desktop/src/DesktopShell.ts:87`，为顶层宿主（壁纸 + `DisplayLayout` + `WindowManager` + `Taskbar`/`StartMenu` + `ShortcutRouter`）。构造函数位于 `DesktopShell.ts:105` 解析配置（`resolveConfig`）、注册 `AppRegistry`（`DesktopShell.ts:108`）、构造 `DisplayLayout`（`DesktopShell.ts:116`）、`WindowManager`（`DesktopShell.ts:124`）、`Wallpaper`（`DesktopShell.ts:133`）与 `ShortcutRouter`（`DesktopShell.ts:140`）。`Wallpaper` 位于 `DesktopShell.ts:17`，为带 `a11yProjection never` 的非交互封面图（`DesktopShell.ts:26`）。

`start()` 位于 `DesktopShell.ts:152` 为幂等：添加壁纸、同步布局、挂载任务栏、附加快捷键与用于 Kickoff 解散与 Escape 的文档级 `pointerdown`/`keydown`（`DesktopShell.ts:143`）。`syncLayoutToScene`/`resize` 位于 `DesktopShell.ts:171` 读取实时 `scene.width/height`（无 resize 总线）并更新壁纸 + 任务栏放置。`setTheme` 位于 `DesktopShell.ts:204` 交换 token、`WindowChrome` 并重挂任务栏。

`DisplayLayout` 位于 `packages/desktop/src/DisplayLayout.ts:15` 将逻辑显示映射到并集并减去任务栏条带得到 `workArea`（`DisplayLayout.ts:50`）、壁纸用 `bounds()`（`DisplayLayout.ts:60`）、点查询 `displayAt`（`DisplayLayout.ts:80`）、窗口放置用 `clampRect`（`DisplayLayout.ts:89`）以及单显示复用用 `updateSceneSize`（`DisplayLayout.ts:105`）。

### 3.2 WindowManager — 打开/聚焦/关闭/z 序

`WindowManager` 位于 `packages/desktop/src/WindowManager.ts:65` 拥有 `DesktopWindow[]`（`WindowManager.ts:71`）、`focused`（`WindowManager.ts:72`）、`cascade`/`seq`（`WindowManager.ts:73`）以及对话框栈 `dialogOrder`/`dialogPrevFocus`（`WindowManager.ts:77`）。方法：

- `open(appId, opts)` 位于 `WindowManager.ts:126` 强制 `instances: 'single'|'multiple'`（`WindowManager.ts:132`——聚焦已存在除非 `forceNew`）、级联 `(cascade % 8)*28`（`WindowManager.ts:144`）、经 `layout.clampRect` 钳制（`WindowManager.ts:149`）、分配 `windowId = appId-seq`（`WindowManager.ts:151`）、创建 `DesktopWindow`（`WindowManager.ts:152`）、`scene.showOverlay`（`WindowManager.ts:170`）与 `focus`（`WindowManager.ts:172`）。
- `openDialog(opts)` 位于 `WindowManager.ts:184` 为免注册表：仅关闭装饰、从任务栏排除（`Taskbar.ts:159`）、模态持有焦点（`WindowManager.ts:238`）、默认居中（`WindowManager.ts:191`），`onDocKeyDown` 为顶部 `dismissible` 对话框捕获 `Escape`（`WindowManager.ts:329`）。
- `focus` 位于 `WindowManager.ts:233` 当模态对话框置顶时阻止重聚焦（`WindowManager.ts:237`）、经 `requestA11yProjection`/`releaseA11yProjection` 恢复/解除无障碍（`WindowManager.ts:248`/`WindowManager.ts:253`），并无 `Entity.remove` 重叠（`WindowManager.ts:339`——拼接 `overlayRoot.children` + `markStructureChanged` 以避免驱动抖动）。
- `close` 位于 `WindowManager.ts:258` 拼接、隐藏叠加层、`win.destroy()`、恢复 `dialogPrevFocus`（`WindowManager.ts:281`），并逆序挑选下一可见窗口（`WindowManager.ts:278`）。
- `cycleFocus(backward)` 位于 `WindowManager.ts:297` 与 `topModal()` 位于 `WindowManager.ts:311`。

经 `WindowManager.ts:116` 处 `on(listener)` 的监听器发出 `open/close/focus/state`。

### 3.3 DesktopWindow — 装饰与交互

`DesktopWindow` 位于 `packages/desktop/src/Window.ts:158`，为带 `a11yProjection onDemand`（`Window.ts:228`）与 `pointerEvents none` 对话框镜像（`Window.ts:400`）的 `UIComponent`。结构：`Card shell` + `Card titlebar` + `Text titleLabel` + `TitlebarDragHandle` + 三个 `Button` 装饰（经 `Window.ts:361` 处 `makeChromeBtn` 的 `close/max/min`）+ `ResizeGrips` + `ClientHost`（`Window.ts:79` 不可见裁剪宿主）+ 来自 `app.create(ctx)` 的 `content`（`Window.ts:340`）。经 `WindowChrome`（`Window.ts:8`）来自 token 装饰（`DesktopShell.ts:411` `resolveChrome`）。

- 几何：`applyGeom` 位于 `Window.ts:507` 钳制到 `minWidth/minHeight`（`Window.ts:498` `max(chrome, app)`）、定尺寸 shell/titlebar/clientHost、重定位装饰按钮与拖动手柄（`Window.ts:524` `chromeBtnStripWidth`），`layoutClientContent` 拉伸 `content.width/height`（`Window.ts:538`）。
- 标题栏拖动：`TitlebarDragHandle` 位于 `Window.ts:133`，为专用交互 `UIComponent`（`role button, label Move window`，`tabIndex 0`）带积极无障碍以使命中目标无需钉住整对话框即存在（`Window.ts:282`）。`beginTitlebarDrag` 位于 `Window.ts:589` 在最大化时处理拖动恢复（`Window.ts:594`），`handleMoveKey` 位于 `Window.ts:670` 映射 `ArrowLeft/Right/Up/Down` 带 `Shift=1px`（`Window.ts:671`），`clampMovePosition` 使标题栏保持在工作区内（`Window.ts:700`）。
- 调整大小：`hitResizeEdge` 位于 `Window.ts:553` 带 6px 边缘，`handleResizePointerDown` 位于 `Window.ts:615`（子节点拥有自身命中，client host 为 `isPointInside false`，因此仅边缘命中此处），`applyResize` 位于 `Window.ts:707` 按边带最小钳制与工作区裁剪，经 `Window.ts:638` 处 `attachDocPointers` 的文档级捕获。
- 状态：`maximize`/`restore`/`toggleMaximize` 位于 `Window.ts:433`，`minimize`/`restoreFromMinimized` 位于 `Window.ts:468`（不透明度 0 + `interactive false` + `a11yHidden true`），`setGeometry` 位于 `Window.ts:488`。
- 焦点环：`setFocused` 位于 `Window.ts:404` 将 `shell.border` 交换为 `focusRing`；`updateChrome` 位于 `Window.ts:411` 合并。

`Taskbar` 位于 `packages/desktop/src/Taskbar.ts:36`，为 Plasma 风格条：`Card bar` + 54px `Start` 按钮（`Taskbar.ts:73`）、`Text clockLabel`（`Taskbar.ts:94`，节流到分钟 tick 位于 `Taskbar.ts:127`）、`EntriesHost`（`Taskbar.ts:103` 裁剪宿主）、`entryButtons: Map<DesktopWindow, Button>`（`Taskbar.ts:47`）、`wm.on(() => rebuild)`（`Taskbar.ts:120`）。`rebuild()` 位于 `Taskbar.ts:157` 过滤对话框（`Taskbar.ts:159`）、按键窗口池化按钮（`Taskbar.ts:171`）、带实时 `selected` 绑定的积极无障碍（`Taskbar.ts:194`）、限 `EntriesHost.width`（`Taskbar.ts:207`），点击已激活则最小化（`Taskbar.ts:220`）。

`StartMenu` 位于 `packages/desktop/src/StartMenu.ts:42`（Kickoff）为 `240px` `Card` 面板（`StartMenu.ts:67`）每应用一个 `Button`（`StartMenu.ts:92`），`startMenuHeight` 助手位于 `StartMenu.ts:31` 与 `DesktopShell` 共享用于预定位（使架子 + 菜单不漂移，`DesktopShell.ts:303`）。Shell 经 `scene.showOverlay` + `requestA11yProjection` 显示它（`DesktopShell.ts:330`）并按任务栏位置约束它（`DesktopShell.ts:305`）。

## 4. 表格 — 基于 Text 的虚拟化网格

### 4.1 构造契约

`Table` 位于 `packages/table/src/Table.ts:144` 扩展 `UIComponent`。构造规范化每个输入：`normalizeColumnWidths`（`Table.ts:789`）缩放到 `width`（缺失/无效时等分）、`normalizeColumnAlign`（`Table.ts:779`）默认为 `left`，`normalizeCell`/`normalizeRow`（`Table.ts:810`）以 `''` 填充短行、截断长行（`Table.ts:806` 文档），经 `createTextCell`（`Table.ts:921`——表头 `bold`、选项 `selectable`）为每字符串创建一个 `Text`，并经 `seenCells` 拒绝重复 `Entity` 单元格（`Table.ts:228`）。`CELL_PADDING_PX = 12` 位于 `Table.ts:142` 由 `fitCell` 换行宽度（`Table.ts:935` `maxWidth = colWidths[col] - 2*CELL_PADDING`）与 `cellX` 对齐缩进（`Table.ts:767`）共享。

虚拟化可选：`viewportHeight` 位于 `Table.ts:50`。当 `virtualized`（`Table.ts:177` `viewportHeight>0`）时，主体单元格为 `null` 直到窗口物化（`Table.ts:256` `bodyCells = rows.map(() => null)`，`reserveRowEntities` 位于 `Table.ts:822` 积极校验 `Entity` 单元格），`TableBodyClip` 实体（`Table.ts:261` `clipChildren true`）拥有主体，表头保持直接固定，`bindScroll` 位于 `Table.ts:282` 安装 `wheel` + `pointerdown/move` 拖动滚动。

### 4.2 布局与虚拟化

`layout()` 位于 `Table.ts:987` 重算来自拟合 `headerCells` 的 `headerHeight`，经 `cellX` 定位它们（`Table.ts:999`），随后分支：

- 虚拟化：每行固定 `rowHeights = baseRowHeight`（`Table.ts:1009`）使 `scroll↔row-index` 为 `O(1)`（`Table.ts:1004` 注释——遍历每行将为 `O(rows)` 并抵消窗口化）、将 `bodyClip` 定尺寸为 `viewportHeight - headerHeight`（`Table.ts:1013`），并将主体单元同步推迟到 `reconcileVirtualRows`（`Table.ts:392`），其挂载恰好 `[first, last]` 行，其中 `first = floor(scrollY/rh) - overscan`（`Table.ts:397`）且 `last = ceil((scrollY+bodyViewport)/rh) + overscan -1`（`Table.ts:404`）——比旧 `+overscan` 少计一个不可见额外行。
- 经典：按行度量 `rowHeights`（`Table.ts:1042`）、构建 `rowTops` 前缀和（`Table.ts:1053` `rebuildRowTops`）并定位每行（`Table.ts:1056`）。

`Table.ts:352` 处 `update(dt)` 滚动集成为 dt 感知指数积分器（镜像 `VirtualList`/`Tree`）：`velY += diff*7.2*(dt/1000)` + `velY *= exp(-dt/84)`（`Table.ts:361`）、阈值 `0.05`（`Table.ts:363`），`hasPendingAnimations` 位于 `Table.ts:378` 使 `onDemand` 永不在滚动中空闲（`Table.ts:378` 文档）。

`appendRows` 位于 `Table.ts:885` 按设计仅追加：推入 `rows` + `bodyCells`（在虚拟化模式于 `Table.ts:895` 保留 `Entity` 单元格），随后 `layout()` 重排且 `_syncGridA11y` 重池——增长时无 `detachA11y` 或制表位失效（`Table.ts:870` 文档）。

### 4.3 网格无障碍 — 池化的行/单元格热点

`RowHotspot` 位于 `Table.ts:55`，为透明结构 `role="row"` 容器（`pointerEvents none`，`Table.ts:70`，`Table.ts:65` 处 `layoutControlledProperties`）。`GridCellHotspot` 位于 `Table.ts:82`，为可聚焦 `role gridcell|columnheader`（`Table.ts:111`）带经 `isGridTabStop` 的漫游 `tabIndex`（`Table.ts:473`）、`pointerEvents none` 使下方可选中文本拥有指针（`Table.ts:119`），以及到 `handleGridKey` 的 `keydown` 转发（`Table.ts:91`）。

`_syncGridA11y()` 位于 `Table.ts:624` 投影 ARIA 网格：一固定 `headerRow` 带每列 `columnheader` 热点（`Table.ts:630`），外加池化 `bodyRowPool: { row, cells }[]`（`Table.ts:199`）增长/收缩到 `need = last-first+1`（`Table.ts:691`），每列 `GridCellHotspot` 经 `bind(rowIndex,colIndex,label)` 重绑定（`Table.ts:95`）。池条目在模式变更时于 `Table` 与 `bodyClip` 间重父（`Table.ts:713`）。`Table.ts:412`/`Table.ts:668` 处重锚定协议在聚焦行滚出时保留漫游停留：`pendingFocusReanchor` + 经 `activeCellHoldsFocus` 的 `reanchorRestoreFocus`（`Table.ts:592` 检查 `document.activeElement` vs `scene.getA11yElement`），因此仅当卸载单元真正持有 DOM 焦点时才恢复焦点——永不窃取。

键盘模型：`handleGridKey` 位于 `Table.ts:490`（方向键、`Home`/`End`、`Ctrl+Home/End` 到边缘、`PageUp/PageDown` 按 `Table.ts:548` 处 `pageRows()`）、`_focusCell` 位于 `Table.ts:560` 将行滚动到视口（`Table.ts:603` 处 `_scrollRowIntoView`）并 `focus()` 热点，在绑定 `tabIndex` 前重锚定。

## 5. 垂直应用如何组合原语

| 垂直领域       | 原语栈                                                                                                                   | 关键 file:line 边界                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **知识图谱**   | `@vectojs/graph3d` 布局契约 + Barnes-Hut 3D/2D + `Graph3D`/`GraphCamera`/`GraphInteraction`                              | `KnowledgeGraphModel.ts:62` 模型、`FixedZLayout.ts:22` 适配器、`KnowledgeGraphSession.ts:67` 装配、`Graph3D.ts:28` 渲染器、`GraphLayout.ts:12` 契约   |
| **节点编辑器** | `CommandHistory` 快照 + `SelectionState` + `layoutDocument` SCC + `Entity`/`UIComponent` 树 + `StatusAnnouncer` 实时区域 | `model.ts:54` 文档、`history.ts:9` 历史、`selection.ts:9` 选区、`layout.ts:14` 自动布局、`editor.ts:199` 编辑器、`editor.ts:51` 端口                  |
| **桌面**       | `Scene` 叠加层 + `DisplayLayout` 工作区 + `WindowManager` z 序 + `DesktopWindow` 装饰 + `Taskbar`/`StartMenu`            | `DesktopShell.ts:87` 外壳、`DisplayLayout.ts:15` 显示、`WindowManager.ts:65` WM、`Window.ts:158` 窗口、`Taskbar.ts:36` 任务栏、`StartMenu.ts:42` 菜单 |
| **表格**       | `Text` 单元格 + `RowHotspot`/`GridCellHotspot` 无障碍池 + `TableBodyClip` + 指数滚动积分器                               | `Table.ts:144` 表格、`Table.ts:55` 行、`Table.ts:82` 单元格、`Table.ts:392` 调和、`Table.ts:624` 无障碍同步、`Table.ts:352` 滚动                      |

每个垂直领域借用其原语且仅释放其构造之物（`KnowledgeGraphModel.ts:230` 处模型借用布局，`KnowledgeGraphSession.ts:277` 处 session 拥有布局；编辑器拥有历史/选区；外壳拥有 WM/布局/任务栏/壁纸）。

## 5a. 桌面深潜 — 注册表、VFS、快捷键与装饰

`AppRegistry` 位于 `packages/desktop/src/AppRegistry.ts:1`，为 `ResolvedWebosConfig.apps` 上薄 `Map<id, AppDefinition>` 并带 `get(id)`、`list()` 与 `has(id)`——WM 的 `open` 门控位于 `WindowManager.ts:128` 在缺失时抛出 `unknown app id`。`AppDefinition` 位于 `packages/desktop/src/types.ts:1` 携带 `id`、`title`、`icon`/`iconSvg`、`create(ctx: AppContext) -> Entity`、`instances: 'single'|'multiple'`、`defaultWidth/Height`、`minWidth/Height` 以及 `StartMenu` 使用的分类元数据。

`Vfs` 位于 `packages/desktop/src/Vfs.ts:1`，为经 `AppContext.vfs` 传入每个 `create()` 调用的可选内存文件表面——需文件选择器或驱动视图的应用绑定它，`WindowManager` 将同一实例透传到每个 `DesktopWindow`（`WindowManager.ts:86`）。`resolveConfig` 位于 `packages/desktop/src/resolveConfig.ts:1` 将用户 `WebosConfig` 合并为 `ResolvedWebosConfig`（桌面、显示、主题、应用、快捷键、vfs）并为 `taskbarHeight`/`taskbarPosition`/`wallpaper` 设默认值（`resolveConfig.ts:12`）。

`ShortcutRouter` 位于 `packages/desktop/src/ShortcutRouter.ts:1` 经归一化 `Map` 映射 `chord -> ShortcutAction`（`types.ts:1` `open-app | close-focused | toggle-start | custom`），`attach()`/`detach()` 位于 `ShortcutRouter.ts:30` 绑定 `DesktopShell` 在 `start()` 中启用的单一 `keydown` 监听器（`DesktopShell.ts:158` `shortcuts.attach()`）。`dispatchShortcut` 位于 `DesktopShell.ts:344` 按 `action.type` 分发——`open-app` 调用 `windowManager.open(action.appId)`（`DesktopShell.ts:347`），`close-focused` 调用 `closeFocused()`（`DesktopShell.ts:350`），`toggle-start` 翻转 Kickoff（`DesktopShell.ts:353`），`custom` 转发到 `onCustomShortcut`（`DesktopShell.ts:356`）。

`icon.ts:1` 保留 `WINDOW_ICONS` SVG 字符串（close/maximize/minimize）与 `addButtonIcon(button, svg, size, color)`（`icon.ts:12`），其将图标注入 `Button` 标签——被 `Window.makeChromeBtn` 位于 `Window.ts:380` 与 `Taskbar.rebuild` 位于 `Taskbar.ts:185` 用于按窗口应用图标以 `chrome.fg` 缩放至 `16`。

`DesktopShell` 装饰解析位于 `DesktopShell.ts:411` `resolveChrome` 将主题 token 映射到 `WindowChrome`（`Window.ts:8`）并带 `str()`/`num()` 助手（`DesktopShell.ts:401`）——`windowBg`、`windowBorder`、`titlebarBg/Fg`、`titlebarHeight`、`closeBg/Fg`、`focusRing`、`radius`、`resizeHandle`、`minWidth/Height`——因此 token 重命名不能静默回退到 `undefined`（两处均传入完整 `resolveChrome` 对象，见 `Window.ts:414`）。`Taskbar` 装饰位于 `Taskbar.ts:7` `TaskbarChrome`，`StartMenu` 装饰位于 `StartMenu.ts:6` `StartMenuChrome` 遵循相同 token 透传。

## 5a. 桌面深潜（续）— 任务栏生命周期与开始菜单归属

`Taskbar` 位于 `Taskbar.ts:36` 在 `Map<DesktopWindow, Button>`（`Taskbar.ts:47`）中池化每窗口条目按钮，并在每个 `wm.on('open'|'close'|'focus'|'state')`（`WindowManager.ts:116` → `Taskbar.ts:120`）时重建。对话框窗口被显式过滤（`Taskbar.ts:159` `!w.isDialog`），因此 `openDialog` 永不作为任务条目出现。每条目限 `maxW 160`（`Taskbar.ts:162`）、经 `addButtonIcon` 携带应用图标（`Taskbar.ts:185` `16`px、`chrome.fg`），并位于 `EntriesHost`（`Taskbar.ts:103` `clipChildren true`）下使溢出在时钟标签前裁剪（`Taskbar.ts:106` 注释）。点击已激活（已聚焦、未最小化）条目则最小化（`Taskbar.ts:220` `win.minimize()`），否则聚焦（`Taskbar.ts:224` `wm.focus`）。

`StartMenu` 位于 `StartMenu.ts:42` 经 `scene.showOverlay` + `requestA11yProjection` 显示（`DesktopShell.ts:330`）并由其框外 `pointerdown`（`DesktopShell.ts:361` `handleOutsidePointer` 使用 `DesktopShell.ts:366` 处 `scene.clientToScene`）、`keydown Escape`（`DesktopShell.ts:144` `onDocKeyDown`）或再次点击 Start 按钮（切换）解散。`startMenuHeight` 位于 `StartMenu.ts:31` 为外壳预定位（`DesktopShell.ts:303` `estH`）与菜单自身高度（`StartMenu.ts:58`）的唯一真相来源，因此两者不漂移。外壳的 `toggleStartMenu`（`DesktopShell.ts:196`）与 `closeStartMenu`/`openStartMenu`（`DesktopShell.ts:335`/`DesktopShell.ts:294`）为唯一调用方——垂直领域不得在不整合此对的情况下添加第二菜单拥有者。

## 5b. 表格深潜 — 宽度、实体单元格与装饰

`setWidth(width)` 位于 `packages/table/src/Table.ts:963` 按比例重缩放 `colWidths`（`Table.ts:972` `colWidths.map(c => c/total*next)`）而非等分重拆——调用方提供的 `colWidths` 比率在 resize 后存活。随后必须调用 `layout()`（于 `Table.ts:975` 经 `return this.layout()` 链式），因为 `colWidths` 为 `fitCell` 换行宽度（`Table.ts:935`）、`cellX` 对齐（`Table.ts:767`）与每个子节点 `x`（`Table.ts:999`/`Table.ts:1062`）的来源。

实体单元格（非字符串）于 `Table.ts:910` `normalizeCell` 与 `Table.ts:822` `reserveRowEntities` 处以 `seenCells: Set<Entity>`（`Table.ts:228`）接受以积极拒绝重复实例——即便在虚拟化模式下 `Text` 构造推迟到 `reconcileVirtualRows`（`Table.ts:392`），`Entity` 身份检查在追加时运行（`Table.ts:895`）使 `Entity.add` 永不静默将单元格重父到其原始槽外。`setCellSelectable` 位于 `Table.ts:930` 与 `fitCell` 位于 `Table.ts:935` 为两个按单元格能力探测（`Table.ts:5` 处 `SizableCell`/`SelectableCell` 接口），而非按类型标签。

`getContentProjection() -> null` 位于 `Table.ts:1097` 声明 `Table` 永不复制子文本——单元 `Text` 实体拥有自身投影，因此表格自身无障碍角色（`Table.ts:1088` 处 `getA11yAttributes` `role grid, label "Data table with N cols and M rows", pointerEvents none`）纯为结构。`Table.ts:1101` 处 `render(r)` 装饰绘制 `roundRect` 填充（`Table.ts:1103`）、表头填充（`Table.ts:1107`）、列分隔符（`Table.ts:1114`）、行分隔符（虚拟化于 `Table.ts:1124` 覆盖 `[first,last)` 视口相对，经典于 `Table.ts:1139` 覆盖 `rowHeights`）与外边框（`Table.ts:1150`）。

`GraphCamera` 位于 `packages/graph3d/src/GraphCamera.ts:1` 包裹 `THREE.PerspectiveCamera | OrthographicCamera` 并带 `mode: '2d'|'3d'` 切换、`domElement` 绑定、`setSize`/`fitToPositions`（`KnowledgeGraphSession.ts:191` 于 bootstrap 后调用）与供交互 `setControlsEnabled` 门控的 `setEnabled`（`KnowledgeGraphSession.ts:132`）。`Graph3D.pickNode` 位于 `packages/graph3d/src/Graph3D.ts:246`，为 `GraphInteraction.pick` 位于 `GraphInteraction.ts:168` 从 NDC 构建的 `raycaster.intersectObject(nodeMesh)` 路径。

### 4.4 在 VectoForceLayout 与 D3ForceLayout 之间选择

位于 `packages/graph3d/src/layout/` 的两个 `GraphLayout` 实现共享 `setGraph`/`step`/`positions`/`pinNode`/`reheat` 但手感不同：`VectoForceLayout` 位于 `VectoForceLayout.ts:68` 为带显式 `repulsion * alpha` + 连边弹簧 + `centerStrength` + `velocityDecay` tick（`VectoForceLayout.ts:233` 六阶段）的自研 Barnes-Hut 八叉树；`D3ForceLayout` 位于 `D3ForceLayout.ts:37` 为 `d3-force-3d` 适配器（`forceSimulation(…,3).force('link', forceLink).force('charge', forceManyBody).force('center', forceCenter)` 位于 `D3ForceLayout.ts:88`，`chargeStrength -30` 默认位于 `D3ForceLayout.ts:16`）。为播种确定性与隐形 WASM 加速器（`VectoForceLayout.ts:108` `forceBackend` 带 `VectoForceLayout.ts:196` 处 `enableWasmForce` 流式 vs `VectoForceLayout.ts:209` 处 `enableWasmForceSync` 字节）选 `VectoForce`，为迁移已调优手感的既有 `3d-force-graph` 场景选 `D3Force`——两者在 `GraphLayout` 后可交换使 `KnowledgeGraphSession` 保持无关。

## 6. 应用陷阱 vs 引擎缺陷 — forge 分流与自举闭环

`vectojs-docs/forge/findings/app-level-and-toolchain.md:1` 明确命名该分流：应用层发现*非*引擎缺陷但因诊断耗费真实 effort 而被保留。`forge/findings/README.md` 模板外加按领域索引使 `app-level-and-toolchain` vs `core-*`/`simulation-*`/`text-*` 在评审时一目了然——模糊条目漂入引擎 triage 并浪费修复预算。状态为仅追加（`app-level-and-toolchain.md:5`），修复发布时更新 `Upstream status`（`app-level-and-toolchain.md:8`）。

代表性应用陷阱，每项皆为垂直组合教训：

- **沙盒 iframe 不透明源**（`app-level-and-toolchain.md:30` 2026-07-16）：motif 画廊 `sandbox="allow-scripts"` 缺 `allow-same-origin` 得到不透明源；ES 模块 + `importmap` 拉取成为 CORS，同一源 `./demo.js` 永不加载——空白且无父控制台错误。修复：`allow-scripts allow-same-origin` + 真实静态路由 `src`（`app-level-and-toolchain.md:51`），而非 `srcdoc`（解析为 `about:srcdoc`，`app-level-and-toolchain.md:48`）。对垂直领域的教训：受信任第一方嵌入需真实源；不受信任代码需独立子域，而非静默 iframe 属性变更。
- **Canvas 计数 ≠ 已启动**（`app-level-and-toolchain.md:66`）：宿主轮询 `querySelectorAll('canvas').length >= 2` 假设第二 WebGL 点层 canvas 意味着“就绪”——canvas2D 演示与 `ThreeAdapter`（离屏 `canvas`，不在 DOM）永不到 2，因此“Loading…” 叠加层永不隐藏。修复：`canvas.width > 0` 后备存储检查（`app-level-and-toolchain.md:80`）。教训：垂直就绪探针必须以 后备存储尺寸为键，而非 DOM canvas 计数；后端数量为实现细节。
- **EPUB 图像管线**（`app-level-and-toolchain.md:94` 2026-07-19 三件套）：`body.textContent` 静默丢弃 `<img>`/SVG `<image>`（`app-level-and-toolchain.md:99`），因此漫画 EPUB 渲染为空；未 `escapeMarkdown` 的插值 `alt` 使 `foo](javascript:…)` 经 `marked` 重解析成为可点击链接（`app-level-and-toolchain.md:155`）；`data:image/jpeg;base64,…` 被 `[a-zA-Z0-9]+` 分词，在每个 `+`/`/` 处拆为约 2 万 token，将 base64 以乱码逐字打出数分钟（`app-level-and-toolchain.md:185`）。修复：递归 `xhtmlNodeToMarkdown` 带 base64 `![alt](data:…)` + `kind:"markdown"`（`app-level-and-toolchain.md:103`）、`escapeMarkdown`（`app-level-and-toolchain.md:167`）以及作为首个分词候选 `!\\[[^\\]]*\\]\\([^)]*\\)` 以原子图像揭示（`app-level-and-toolchain.md:204`）。教训：任何将被重解析的抽取器必须转义目标格式，打字机分词器需非文本原子退出。
- **Lex 合并 + `hasPendingAnimations`**（`app-level-and-toolchain.md:222`）：`MathMarkdown.appendMarkdown` 按块触发 `marked.lexer`（在累积文本上 `O(n²)`，`app-level-and-toolchain.md:236`），`StreamReader` 缺 `hasPendingAnimations()`，因此当 `update()` 添加零字符时 `onDemand` 场景在流中空闲（`app-level-and-toolchain.md:246`）。修复：至多一个进行中 lex + `docEpoch` 合并（`app-level-and-toolchain.md:254`）与 `hasPendingAnimations() === status==="streaming"`（`app-level-and-toolchain.md:259`）。教训：任何从 `update()` 内标记脏的实体需 `hasPendingAnimations` 否则 `onDemand` 停滞——`Table` 已在 `Table.ts:378` 拥有。
- **无配置的 CodeQL**（`app-level-and-toolchain.md:369` 2026-08-06）：`.github/workflows/codeql.yml` 在无 `config-file` 时传入 `queries: security-and-quality`，因此打包 `packages/tex/src/kernel` 亮起 19 告警（含 KaTeX `replace("*","")` 中一个高严重误报，`app-level-and-toolchain.md:375`）。修复：带 `paths-ignore` 排除 `kernel`/`glyphs` 的 `.github/codeql/codeql-config.yml`（`app-level-and-toolchain.md:384`）。
- **Vendor-katex 顺序**（`app-level-and-toolchain.md:337`）：`checkHandWritten()` 在清空 `src/kernel/` 的 `rmSync` 后运行，因此抛出留下缺失 `VENDORED.md`；`--check` 因该路径从不写 manifest 而始终虚假差异 16 行（`app-level-and-toolchain.md:349`）。修复：在破坏性步骤前校验，在比较前写 manifest（`app-level-and-toolchain.md:354`）。
- **`sideEffects: false` 杀死 tex 注册表**（`app-level-and-toolchain.md:404`）：`packages/tex/package.json` `sideEffects: false` 使 esbuild 丢弃填充 KaTeX 注册表的裸 `import './x'`——`layout('x')` 抛出 `Got group of unknown type: 'mathord'`（`app-level-and-toolchain.md:407`）。套件保持绿色因 `vitest` 将 `@vectojs/*` 别名到 `src/` 且永不加载 `dist/`（`app-level-and-toolchain.md:416`）。修复：`sideEffects: true` + `glyphCodec.test.ts` 中 manifest 断言（`app-level-and-toolchain.md:430`）。
- **Bun 缓存竞争 + wrangler 回退**（`app-level-and-toolchain.md:15` + `:125`）：`bun install` 在发布后提供混合版本 `dist`（`app-level-and-toolchain.md:17`），`cloudflare/wrangler-action` 回退（`bun i wrangler@3.90.0`）在仓库无 `wrangler` 依赖时 tarball 抽取失败（`app-level-and-toolchain.md:129`）。修复：`rm -rf node_modules && bun install --force`（`app-level-and-toolchain.md:24`）与将 `wrangler` 钉为 `devDependency`（`app-level-and-toolchain.md:140`）。
- **仓库卫生**（`app-level-and-toolchain.md:276` 2026-08-06）：已提交 `node_modules` 将克隆吹至 75 MB，由 4 个陈旧 ref 持有——无 `main` 可达 blob；修复为 ref 删除 + `git gc --prune=now`（`app-level-and-toolchain.md:299`），全新克隆 `.git` 75M→6.8M（`app-level-and-toolchain.md:324`）。
- **发布卫生**（`app-level-and-toolchain.md:447` 2026-08-15）：`packages/desktop/package.json` 在 `dependencies` 中发布 `workspace:*`（`app-level-and-toolchain.md:455`）因 CI 从未从 tarball 探测 `bun install`。修复：移至 `peerDependencies` + `devDependencies workspace:*` 匹配 `ui`（`app-level-and-toolchain.md:467`）。
- **基准运行器复活 tmp/**（`app-level-and-toolchain.md:518` 2026-08-24）：`runBenchmarkSuite()` 在 try 前 mkdir（`benchmarks/runner/runner.ts:323`）使每次早期失败后留下 `tmp/benchmark-runner`；修复将 scratch 移至 `os.tmpdir()`（`app-level-and-toolchain.md:530`）。

自举闭环闭合圆：`vectojs-native/AGENTS.md` 声明 `vectojs-native` 为 forge 应用容器（非仓库），每个在兄弟 `<app>-docs/` 中自述而仅引擎发现上游到 `vectojs-docs/forge/findings/`——正是 `AGENTS.md:18` 警告不得模糊的边界。`references/` 浅克隆只读（`AGENTS.md:28`），复用第三方布局的垂直领域（知识图谱基于 `ForceLayout2D`，表格基于 `Text`）在消费点记录分歧说明（如 `editor.ts:117` 环允许，`FixedZLayout.ts:18` 固定点分歧）。网站（`vectojs-website/`）经 `scripts/sync-content.py` 单向消费 `vectojs-docs/content/`（`AGENTS.md:28` 文档节），因此仅文档发布不能超越其权威来源——垂直领域手册与其 `references/` 旁手册共存时所需同样纪律。

## 7. 落地垂直改动前值得检查的陷阱

1. **借用布局释放**——`KnowledgeGraphModel.dispose()` 不得释放借用布局（`KnowledgeGraphModel.ts:230`）；`KnowledgeGraphSession.dispose()` 必须（`KnowledgeGraphSession.ts:277`）。两者互换会泄漏或双重释放。`attach(scene)` 位于 `KnowledgeGraphSession.ts:153` 为幂等且必须在 `render(renderer, scene)` 位于 `KnowledgeGraphSession.ts:256` 前调用否则抛出 `call attach first`。
2. **游标陈旧**——`MemoryDataSource` 游标版本化（`MemoryDataSource.ts:118`）；`KnowledgeGraphModel.expand` 去重（`KnowledgeGraphModel.ts:134`）与等待后释放退出（`KnowledgeGraphSession.ts:189`/`KnowledgeGraphSession.ts:227`）为对抗分页中变更的栅栏。`loadSnapshot` 位于 `KnowledgeGraphSession.ts:202` 将每个实体标记 `complete` 使选中不重取已存在跳跃。
3. **端口方向 + 身份**——编辑器 `validateLink` 拒绝同节点与错误方向端口（`model.ts:131`/`model.ts:138`）；连接预览 `isConnectionTarget` 经 try-`addLink` 镜像它（`editor.ts:360`/`editor.ts:549`）。`findPortAt` 位于 `editor.ts:502` 逆添加顺序遍历使重叠卡片解析到最顶端口，`getLocalPoint` 经 `worldToLocal` 位于 `editor.ts:498` 使拖动/命中保持编辑器局部空间而非 `sceneX/Y`。
4. **叠加层无障碍泄漏**——`WindowManager.focus`/`close` 必须在失焦时 `releaseA11yProjection`（`WindowManager.ts:248`），`DesktopWindow` 必须保持 `pointerEvents none`（`Window.ts:400`）否则对话框镜像吞掉装饰点击。装饰按钮需 `a11yProjection eager`（`Window.ts:383`）否则首次点击错失（下一帧 `onDemand` 投影），`DisplayLayout.clampRect`（`DisplayLayout.ts:89`）必须用于每次放置（`WindowManager.ts:149`）。
5. **表格视口数学**——`reconcileVirtualRows`/`_syncGridA11y` 共享带 `overscan` 的相同 `first/last` 界（`Table.ts:397`/`Table.ts:662`）；`clampScrollPosition` 位于 `Table.ts:344` 使弹簧偏移不超调钳制目标；`rowTops` 前缀位于 `Table.ts:751` 使经典无障碍 `O(rows)` 而非 `O(rows²)`。`pageRows()` 位于 `Table.ts:548` 在经典模式使用均值 `rowHeights`，虚拟化中为 `viewportHeight - headerHeight`，使 `PageUp/PageDown` 在两者中保持视口尺寸。
6. **发布时依赖**——框架依赖归属 `peerDependencies` + `devDependencies` 中 `workspace:*`（`app-level-and-toolchain.md:467`）；`npm publish` 逐字发布 `dependencies`（`app-level-and-toolchain.md:473`）。在 forge 应用消费新次版本前经 tarball 消费者探针（scratch 目录中 `bun add`）验证。
7. **选区 + 历史耦合**——`deleteNodes` 位于 `editor.ts:390` 先结束瞬态手势并将节点+关联连边批量为一个可撤销命令；`cancelConnection`/`cancelDrag` 在 `history.execute` 前防止悬空 `dragDocument` 或待定连接。`applyAutoLayout` 位于 `editor.ts:274` 仅当 JSON 变化时压入，因此无操作布局不污染撤销栈。
8. **持久化往返**——`exportDocument` 位于 `persistence.ts:168` 结构*与*语义校验（`persistence.ts:84` 处 `validateDocument` 带 `persistence.ts:156` 处按连边 `validateLink`）；`importDocument` 位于 `persistence.ts:178` 拒绝错误 `schemaVersion`（`persistence.ts:186`）。绕过 `exportDocument` 手写仅通过结构半校验的 JSON 仍可能在重导入时对 `target-port-occupied` 或 `incompatible-types` 的 `validateLink` 失败——始终经同一校验器往返。

## 7a. 值得借鉴的跨垂直模式

四个垂直领域，对同一问题四种答案——“增量增长如何保持廉价且可逆？”：

- **知识图谱：借用而非克隆。** `KnowledgeGraphModel` 从不拷贝布局——它借用一个（`KnowledgeGraphModel.ts:43` `layout?: GraphLayout` 文档，“Borrowed, not owned”），以 `setGraph` + `reheat` 驱动，并将释放留给 session（`KnowledgeGraphSession.ts:277`）。任何包裹共享引擎（物理、文本塑形、媒体解码）的新垂直领域应复制此拆分：位于 `KnowledgeGraphModel.ts:225` 的模型 `dispose` 为六行映射/集合清理并带显式注释“leaves it untouched so it can stay shared with a live session”（`KnowledgeGraphModel.ts:230`）。忘记该注释是未来编辑器重加 `this.layout?.dispose()` 并破坏 session 的方式。

- **节点编辑器：历史拥有文档。** 每个变更——`createLink`（`editor.ts:380` → `addLink` + `history.execute`）、`deleteNodes`（`editor.ts:390` → 批量 `removeNode` + 一个 `history.execute`）、`moveDrag`（`editor.ts:441` → `history.execute('Move node', …)`）、`applyAutoLayout`（`editor.ts:274` → `history.execute('Auto-layout', …)`）——均经 `CommandHistory.execute`（`history.ts:28`）并经 `cloneDocument` 快照 `before`/`after` 并清空 `redoStack`。编辑器从不绕过 `applyDocument`（`editor.ts:520` → `cloneDocument` + `rebuild` + `markDirty`）变更 `documentState`。为任何未来 canvas 编辑器借鉴此：单一门控、单一克隆纪律、无带外 `documentState = …`。

- **桌面：叠加层拥有焦点而非场景。** `WindowManager` 从不调用 `Entity.remove` 重叠（`WindowManager.ts:339` `kids.splice` + `markStructureChanged`）因为 `remove` 分离无障碍并注销驱动——每次焦点变更时抖动。它经 `focused` + `releaseA11yProjection`/`requestA11yProjection`（`WindowManager.ts:248`/`WindowManager.ts:253`）跟踪焦点，使 `onDemand` 背景窗口不保持永久无障碍镜像。桌面 `Wallpaper` 为 `a11yProjection never`（`DesktopShell.ts:26`），`DesktopWindow` 为带 `pointerEvents none` 对话框镜像的 `onDemand`（`Window.ts:400`），`Taskbar` 为 `eager` 因其按钮无需悬停即可到达（`Taskbar.ts:58`）。任何新壳表面应刻意选择三者之一而非默认 `eager`。

- **表格：窗口化、池化、积分。** 虚拟化为三协作预算：`reconcileVirtualRows` 将恰好 `overscan` 填充的 `[first, last]` 窗口化（`Table.ts:397`/`Table.ts:404`），`_syncGridA11y` 将 `RowHotspot`/`GridCellHotspot` 池化到 `need`（`Table.ts:691`），`update(dt)` 以 dt 感知弹簧积分 `scrollY`（`Table.ts:352` `velY += diff*7.2*(dt/1000)` / `exp(-dt/84)`）。`hasPendingAnimations` 位于 `Table.ts:378` 为使三者皆在 `renderMode onDemand` 下存活的空闲节流握手。仅拷贝窗口步骤却忘记 `hasPendingAnimations` 的未来虚拟化列表将正确滚动一次随后停滞——`StreamReader` 在 `app-level-and-toolchain.md:222` 处曾有同样缺陷。

## 7b. 验证 — 如何证明垂直改动正确

垂直领域呈应用形态，因此证明亦呈应用形态——而非仅单元测试。

- **知识图谱：** `just test-pkg knowledge-graph` 覆盖 `MemoryDataSource` 游标版本化（`MemoryDataSource.ts:118` 陈旧游标抛出）与 `KnowledgeGraphModel` 去重/重加热（`KnowledgeGraphModel.ts:134`/`:285`）；添加一个并发两次调用 `model.expand(id)` 并断言一个 promise，随后 `cancelExpand` 并断言 `cancelled` 状态的复现。对渲染，在有头浏览器（非 `jsdom`）中驱动 `KnowledgeGraphSession` 并在 `syncFromModel` 后断言 `graph.group.children.length`——`Graph3D` 为 Three.js 且需真实画布。

- **节点编辑器：** `just test-pkg node-editor` 演练 `validateLink` 错误码（`model.ts:36` `LinkValidationError`）与 `exportDocument`/`importDocument` 往返（`persistence.ts:168`）；添加一个当连边为自身占用者时 `maxConnections` 满容量通过的用例（`persistence.ts:156` 剥离自身逻辑）与一个断言无操作拖动后 `history.canUndo` 保持 false 的拖动用例（`editor.ts:445`）。

- **桌面：** `just test-pkg desktop` 覆盖 `AppRegistry` 与 `DisplayLayout.clampRect`（`DisplayLayout.ts:89`）；添加一个调用 `wm.openDialog({modal:true})` 随后 `wm.focus(other)` 并断言焦点停留在对话框的对话框模态用例（`WindowManager.ts:237` topModal 门控），以及一个断言 `overlayRoot.children` 顺序而无 `Entity.remove` 的 `restack` 用例（`WindowManager.ts:339`）。

- **表格：** `just test-pkg table` 覆盖 `normalizeColumnWidths`（`Table.ts:789`）与 `seenCells` 重复拒绝（`Table.ts:228`）；添加一个设置 `viewportHeight`、调用 1 万次 `appendRows`、滚动到 `maxScroll()`（`Table.ts:328`）并断言 `mountedRows.size` 为 `O(viewport)` 而非 `O(rows)`（`Table.ts:392` 窗口）的虚拟化用例，外加一个断言聚焦行滚出后 `isGridTabStop` 重锚定的漫游制表用例（`Table.ts:668`）。

每种情况下推送前运行 `just check`（oxfmt + oxlint + markdownlint）——垂直文档与代码并存并共享同一门禁（`AGENTS.md:31` 质量门）。

## 8. 检查清单 — 落地垂直改动前

1. **拥有你的释放。** `KnowledgeGraphModel` 借用，`KnowledgeGraphSession` 拥有（`KnowledgeGraphModel.ts:230` vs `KnowledgeGraphSession.ts:277`）；`DesktopShell.dispose` 位于 `DesktopShell.ts:251` 按序拆解 `shortcuts`/`windowManager`/`taskbar`/`wallpaper`。对触及的每个 `dispose` grep 借用 vs 拥有。
2. **守卫每个异步延续。** `bootstrap`/`expand` 均在等待后对 `this.disposed` 退出（`KnowledgeGraphSession.ts:189`/`KnowledgeGraphSession.ts:227`）；`expand` 按 id 去重（`KnowledgeGraphModel.ts:134`）且 `cancelExpand` 中止（`KnowledgeGraphModel.ts:150`）。无守卫的新 `await` 重引入迟到镜像缺陷。
3. **结构化投影无障碍。** `Table` 为带 `RowHotspot` 行（`Table.ts:55`）与 `GridCellHotspot` 单元（`Table.ts:82`）池化且 `pointerEvents none` 的 `role grid`；`DesktopWindow` 为带 `pointerEvents none` 的 `role dialog`（`Window.ts:400`）与积极装饰按钮（`Window.ts:383`）；`NodeEditor` 端口为带键盘来源的 `role button`（`editor.ts:90`）。无 `pointerEvents none` 结构父节点的新交互子节点会窃取命中。
4. **保持 `hasPendingAnimations` 诚实。** `Table` 位于 `Table.ts:378` 与修复后 `app-level-and-toolchain.md:259` 处 `StreamReader` 均在动画时返回 `true` 使 `onDemand` 永不在手势中空闲。任何内部调用 `markDirty` 的新 `update(dt)` 需同样覆盖。
5. **发布前校验。** `packages/desktop` 在 `dependencies` 中因 `workspace:*` 崩溃（`app-level-and-toolchain.md:455`）；`packages/tex` 因 `sideEffects: false` 崩溃（`app-level-and-toolchain.md:407`）。两者在 CI 中存活因 `vitest` 别名 `src/` 且无消费者探针运行。在发布清单中添加 tarball `bun add` 冒烟测试。
6. **在正确 forge 篮中记录发现。** `app-level-and-toolchain.md:1` 为仅追加（`app-level-and-toolchain.md:5`）——永不编辑既有条目，永不在 `core-*`/`simulation-*` 下提交应用陷阱（`forge/findings/README.md` 分类）。该分流是使引擎 triage 不被应用噪声淹没的关键，自举闭环（`vectojs-native/*/AGENTS.md`）依赖它。

## 9. 未来垂直领域与扩展点

新垂直领域应从已存在缝隙起步，而非分叉。

- **知识图谱扩展。** 为基于 worker 或流式源交换 `KgDataSource`（`types.ts:54` 处 `MaybeAsync<T>` 位于 `types.ts:84` 已允许同步或异步）：页面大小、`direction: 'out'|'in'|'both'`（`types.ts:64`）与 `signal` 中止为模型所需唯一旋钮。时间线或地图垂直领域以不同 `GraphLayout`（如一维时序 `FixedZLayout` 变体或 `ForceLayout2D` 投影）与不同 `Graph3D` 样式复用 `KnowledgeGraphModel`——`GraphLayout` + `GraphData` 为契约而非力定律。

- **节点编辑器扩展。** `PortDefinition.dataType`（`model.ts:12`）+ `maxConnections`（`model.ts:13`）已建模类型化插槽；`layoutDocument` 选项（`layout.ts:3` 处 `originX/Y`、`horizontalGap`/`verticalGap`）为唯一布局旋钮。着色器图或音频图垂直领域添加 `NodeData.type` 分支与 `validateLink` `incompatible-types` 规则（`model.ts:140`）而无需触及 `history.ts` 或 `selection.ts`。`CommandHistory` 刻意带标签（`history.ts:4` `label`）使撤销日志人类可读。

- **桌面扩展。** `AppRegistry.register` 位于 `AppRegistry.ts:15` 为插件缝隙（无需触及 `WindowManager` 的运行时注册），`openDialog` 位于 `WindowManager.ts:184` 为瞬态缝隙。新应用仅需 `AppDefinition.create: (ctx: AppContext) => Entity`（`types.ts:1`）——`ctx` 携带 `scene`、`vfs`、`windowManager`、`close`、`appId`、`windowId`。`ShortcutRouter`（`ShortcutRouter.ts:1`）已命名空间 `custom` 动作使应用可添加和弦而不与 `open-app`/`close-focused` 冲突。

- **表格扩展。** `Table` 已对 `TableCell = string | Entity` 泛化（`Table.ts:4`），因此图表单元或 sparkline 垂直领域传入 `Entity` 单元并拥有自身 `width/height`——`fitCell`/`setCellSelectable` 按能力探测（`Table.ts:5`），而非按类型标签。虚拟化保持 `O(viewport)` 只要新单元经 `setMaxWidth` 保持定尺寸（`Table.ts:6`）。`appendRows`（`Table.ts:885`）为唯一变更——`setRows` 将需无障碍重锚定与 `seenCells` 失效，这正是其刻意缺席原因（`Table.ts:870` 文档）。

每种情况下新垂直领域的成本为一个新包外加 `GraphData`/`NodeDocument`/`AppDefinition`/`TableCell` 适配器——而非新引擎。

## 附录 — 下一步阅读指引

<!-- markdownlint-disable MD060 -->

| 目标                      | 起点                                                                                     | 然后                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 分页知识图谱              | `packages/knowledge-graph/src/KnowledgeGraphModel.ts:62` 单一驱动器                      | `KnowledgeGraphSession.ts:67` 装配 → `packages/graph3d/src/Graph3D.ts:28` 呈现    |
| 扩展时保持已收敛节点稳定  | `KnowledgeGraphModel.ts:273` 批次 `loaded` + `KnowledgeGraphModel.ts:332` `rebuildGraph` | `FixedZLayout.ts:22` 钳制 → `GraphLayout.ts:12` 契约                              |
| 添加编辑器命令            | `packages/node-editor/src/history.ts:9` `execute` + `model.ts:126` `validateLink`        | `editor.ts:199` 手势 → `persistence.ts:84` `validateDocument`                     |
| 打开桌面应用或对话框      | `packages/desktop/src/WindowManager.ts:126` `open` / `:184` `openDialog`                 | `Window.ts:158` 装饰 → `DisplayLayout.ts:15` 工作区 → `AppRegistry.ts:1` 目录     |
| 导出/导入文档             | `packages/node-editor/src/persistence.ts:168` `exportDocument`                           | `persistence.ts:178` `importDocument` → `persistence.ts:84` `validateDocument`    |
| 添加桌面快捷键            | `packages/desktop/src/ShortcutRouter.ts:1` `ShortcutRouter`                              | `DesktopShell.ts:344` `dispatchShortcut` → `types.ts:1` `ShortcutAction`          |
| 将表格虚拟化至 1 万行以上 | `packages/table/src/Table.ts:144` `viewportHeight`                                       | `Table.ts:392` `reconcileVirtualRows` → `Table.ts:624` 池 → `Table.ts:352` 积分器 |
| 分类新发现                | `vectojs-docs/forge/findings/app-level-and-toolchain.md:1` 头部                          | `forge/findings/README.md` 模板 → 正确篮子，`Upstream status` 行                  |

> **阅读缝隙：** 图缝隙为 `GraphData`（`graph3d/types.ts`），编辑器缝隙为 `NodeDocument` + `validateLink`（`model.ts:54`/`:126`），桌面缝隙为 `AppDefinition` + `AppContext`（`types.ts:1`），表格缝隙为 `TableCell`（`Table.ts:4`）。无法以一类型命名其缝隙的新垂直领域尚未找到其边界。

---

*系列：00 总览 → 01 选区 → 02 文本+布局 → 03 投影+虚拟化 → 04 流式 Markdown → 05 TeX → 06 VMT 运行时 → 07 渲染器 → 08 WASM → 09 Three/XR → 10 视频导出 → 11 图布局 → 12 DevTools → **15 垂直应用** → 99 综合。*
