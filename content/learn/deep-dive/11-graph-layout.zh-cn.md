+++
title = "11 — 图布局 — 力导向物理与基准测试"
description = "ForceLayout2D 无依赖的 2D 引擎、Barnes-Hut 四叉树与分层碰撞网格、增量变更与固定点契约、VectoForceLayout/D3ForceLayout 3D 家族、vectojs-force-rs WASM 内核，以及有头基准测试方法论。"
weight = 31
+++

# 11 — 图布局 — 力导向物理与基准测试

> **Boss 11** 看似只是“弹簧与斥力”，直到你真正发布它。朴素的 N 体计算每 tick 为 O(N²)，单个中心枢纽会拖垮朴素碰撞网格，增量扩展不能破坏已稳定的状态，两名用户必须从同一 seed 看到相同布局。VectoJS 的答案是 `@vectojs/graph-layout` 中与渲染器无关的 2D 四叉树加分层网格、`@vectojs/graph3d` 中并行的 3D 八叉树家族，以及 `crates/vectojs-force-rs` 中逐位一致的 Rust 内核。

- **你将学到**：为何 N²、稳定性、增量性与确定性是四大难题；`ForceLayout2D` 如何以 SoA 状态存储并暴露 `Float32Array` positions；斥力（Barnes-Hut）、连边弹簧、居中与碰撞如何在每 tick 组合；为何 2D 四叉树与分层碰撞网格取代了朴素网格；固定点、ID 映射、重加热与 alpha 冷却如何相互作用；`VectoForceLayout` vs `D3ForceLayout` vs `FixedZLayout` 如何区分以及 `KnowledgeGraphModel` 在何处消费它们；WASM 力内核替换了什么以及如何保持逐位一致；`benchmarks/graph-layout` 实际测量什么（以及明确不测量什么）。
- **你不会学到**：VMT 脏检查/生命周期（boss 06）、渲染器/DPR 正确性（boss 07）或 G1/G2/G3 WASM 三元组（boss 08）——尽管本章会逐字复用 boss 08 的隐形后端契约。文本塑形（boss 02）与流式 Markdown（boss 04）是图布局的消费者，而非相反。

## 1. 为何力导向布局看似简单实则困难

“弹簧与斥力”背后藏着四个问题：

1. **N² vs Barnes-Hut。** 斥力是每个节点对其他所有节点的两两作用。3000 个节点时每 tick 每帧在主线程或 worker 上就是约 900 万对力。真正的 2D 四叉树（`BarnesHutQuadtree.ts:8` 扁平数组、跨 tick 复用）通过在 `size/distance < theta` 时（`BarnesHutQuadtree.ts:121` 开启测试 `4*half² < theta²*d²`）将远处单元视为单个伪粒子，使其降为 O(N log N)。3D 侧用八叉树做同样的事（`VectoForceLayout.ts:402` `BarnesHutOctree`）。没有它，数百节点以上的图就会卡顿。

2. **异构半径下的稳定性。** 一个半径 100 的枢纽旁边跟着 3000 个半径 4 的叶子，会使均匀碰撞网格崩溃：单一 `cellSize = 2·maxRadius` 会让所有叶子落在巨大的 3×3 邻域内，对偶扫描退化为二次方（`BarnesHutQuadtree.ts:189` 处的注释测得 3k → 12k 时单枢纽下每 tick `12 ms → 197 ms`）。修复是按 2 的幂次分层的半径分级网格（`BarnesHutQuadtree.ts:190` 分级 `t = floor(log2(r))`，单元 `Ct = 2^(t+2)`），每个分级拥有独立哈希表，跨分级对仅精确解析一次。

3. **不瞬移的增量性。** 知识图谱分页进入：现在 50 个节点，滚动后再来 50 个。调用方期望 `appendGraph` 保持每个已有位置、速度与固定点完全不动，仅确定性地添加新节点，并温和重加热（`ForceLayout2D.ts:162` `appendGraph`、`ForceLayout2D.ts:199` `if (newNodes.length>0||addedLinks>0) this.reheat()`）。`setGraph` 重建（`ForceLayout2D.ts:123`）会让已稳定的图瞬移。

4. **跨平台确定性。** `seed` 必须在 JS 与 Rust 上复现相同的初始放置与相同重合点抖动，使测试、快照与未来的 WASM 差分预言逐位一致。所选数学为 `mulberry32`（`ForceLayout2D.ts:868`）、`Math.sqrt`（而非 `Math.hypot`——后者为引擎近似，`VectoForceLayout.ts:618` 注释）以及整数 `Math.imul` 抖动（`BarnesHutQuadtree.ts:618` `collisionPairAngle`、`VectoForceLayout.ts:606` `jitterFor` / `crates/vectojs-force-rs/src/lib.rs:83` `jitter_for`）。

四者缺一，图要么卡顿、要么爆炸、要么瞬移、要么在 JS 与 WASM 间分歧。

## 2. 包结构图

```text
@vectojs/graph-layout          无依赖 2D 引擎，无渲染器对等依赖
  src/ForceLayout2D.ts         tick 循环、SoA 存储、公开 API
  src/types.ts                 NodeId/GraphData/ForceLayout2DOptions
  src/internal/BarnesHutQuadtree.ts  四叉树 + 分层碰撞网格
  src/index.ts                 barrel（types + layout）

@vectojs/graph3d               3D 实例化渲染器 + 布局后端
  src/layout/GraphLayout.ts    最小 3D 契约（setGraph/step/positions/pin/reheat/dispose）
  src/layout/VectoForceLayout.ts  自研 3D Barnes-Hut 八叉树（JS 预言 + WASM）
  src/layout/D3ForceLayout.ts  d3-force-3d 适配器（迁移保真）
  src/wasm/force-backend.ts    Rust 内核的流式/同步加载器
  src/wasm/asset.ts            forceWasmUrl 打包辅助
  src/wasm/vectojs_force.wasm  vectojs-force-rs 的 gitignored 产物

@vectojs/knowledge-graph       分页消费者（KnowledgeGraphModel）
  src/KnowledgeGraphModel.ts   GraphLayout 的单一驱动器（setGraph/reheat）
  src/FixedZLayout.ts          将 z 钳制到平面的 VectoForceLayout
  src/KnowledgeGraphSession.ts 工厂装配（theta 0.9、WASM 可选）

crates/vectojs-force-rs        WASM 八叉树力内核（隐形后端）
  src/lib.rs                   仅构建 + 力累积，f64 累加器

benchmarks/graph-layout        有头 4 臂矩阵（d3-force-3d、vecto-force、d3-force-2d、force-layout-2d）
benchmarks/graph3d-frame       3D 渲染器的帧成本 harness（非物理矩阵）
benchmarks/_shared/*           单一 server + bundler + stats + runner（run-browsers.sh）
```

`@vectojs/graph-layout` 零 `@vectojs/*` 依赖（`package.json:1` `name: @vectojs/graph-layout`）；`@vectojs/graph3d` 仅依赖 `three`；`@vectojs/knowledge-graph` 依赖 `graph3d` 的布局契约。构建顺序：`math+text → graph-layout → three/graph3d → knowledge-graph`（经 `package.json` workspaces 验证）。

## 3. ForceLayout2D — 2D 引擎

### 3.1 状态与 positions 契约

SoA 类型化数组，与输入节点顺序索引对齐（`ForceLayout2D.ts:48` `nodes: GraphNode[]`、`ForceLayout2D.ts:49` `nodeIndex: Map<NodeId,number>`、`ForceLayout2D.ts:50` `positionStorage: Float32Array`、`ForceLayout2D.ts:51` `velocityX/Y`、`ForceLayout2D.ts:53` `fixedX/Y` + `pinnedX/Y`、`ForceLayout2D.ts:57` `repulsion`/`collisionRadius`、`ForceLayout2D.ts:60` `linkSource/Target/Distance/Strength/Share`、`ForceLayout2D.ts:76` `quadtree`）。

公开的 `positions` 是对 `positionStorage` 的实时交错 XY 视图，按输入节点顺序排列（`ForceLayout2D.ts:32` `public positions = new Float32Array(0)`、`ForceLayout2D.ts:748` `refreshPositionView` 经 `subarray`）。身份在多次 `step()` 调用间稳定，但拓扑或容量变化可能替换后备存储——宿主必须在 `setGraph`/`appendGraph`/`removeNodes` 后重新获取 `positions`（类文档 `ForceLayout2D.ts:18`）。

所有触及公开状态的算术都经 `Math.fround` 舍入（`ForceLayout2D.ts:13` `const f = Math.fround`、`ForceLayout2D.ts:808` `toF32`），与 `Float32Array` 暴露保持一致。3D 路径同样如此（`VectoForceLayout.ts:48` `const f = Math.fround`），而 Barnes-Hut 累加器保持 `f64`（`BarnesHutQuadtree.ts:9` `cellX/Y/centerX/Y/halfSize/charge: Float64Array`）。

### 3.2 节点/连边身份与增量变更

节点在各处均以 `NodeId`（`types.ts:2` `string|number`）寻址，而非数组索引，因此固定点在压缩后仍存活（`ForceLayout2D.ts:25` 文档）。四个变更入口，每个都有严格的全有或全无校验：

| 方法                 | 文档                   | 归属                               | 失败模式                                                                                                    |
| -------------------- | ---------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `setGraph(data)`     | `ForceLayout2D.ts:122` | 替换一切、重播种、`alpha=1`        | 重复节点 ID 或引用缺失/自环的连边 → 在清除旧状态前抛出（`ForceLayout2D.ts:132` 交换前校验）                 |
| `appendGraph(data)`  | `ForceLayout2D.ts:151` | 保留已有、添加新 ID、去重          | 未知/缺失/自环连边 → 在任何变更前抛出（`ForceLayout2D.ts:186` `resolveEndpoint` + `UNKNOWN_ENDPOINT` 守卫） |
| `removeNodes(ids)`   | `ForceLayout2D.ts:202` | 按原顺序压缩幸存者、重建索引       | 无匹配时无操作；重加热一次（`ForceLayout2D.ts:252`）                                                        |
| `removeLinks(items)` | `ForceLayout2D.ts:265` | 保留节点状态、压缩连边             | 按有向 `(source,target,id)` 身份匹配（`ForceLayout2D.ts:826` `linkIdentity`）；幂等                         |
| `updateLinks(links)` | `ForceLayout2D.ts:324` | 为已有连边重解析 distance/strength | 未知/相同端点 → 抛出；不存在的身份被忽略；仅当值真正变化时重加热（`ForceLayout2D.ts:361`）                  |

连边身份是微妙陷阱。`ForceLayout2D.ts:826` `linkIdentity` 将 `[idKey(source), idKey(target), idKey(id)]` 序列化，其中 `idKey`（`ForceLayout2D.ts:835`）为类型加前缀以避免 `"1"` vs `1` 冲突。无 `id` 时身份即有向端点对；平行连边需要不同 `id`（`types.ts:19` `GraphLink.id`）。3D 后端不同：`VectoForceLayout` 与 `D3ForceLayout` 将每个 `(source,target)` 对视为一条连边甚至跳过自环（`VectoForceLayout.ts:178` `if (ia===ib) continue`），而编辑器的重复连边守卫更严格——分歧说明见 `ForceLayout2D.ts:387`。

`appendLinks`（`ForceLayout2D.ts:637`）经 `pendingKeys` 在批次内去重，并通过调用方提供的 `NodeValue`/`LinkValue` 访问器解析 `distance`/`strength`（`ForceLayout2D.ts:777` `resolveNodeValue`、`ForceLayout2D.ts:787` `resolveLinkValue`），辅以 `finiteOr` 守卫（`ForceLayout2D.ts:797`）。

容量增长为几何级、均摊 O(1)（`ForceLayout2D.ts:851` `grownCapacity` 从 4 翻倍、`ForceLayout2D.ts:672` `ensureNodeCapacity`、`ForceLayout2D.ts:689` `ensureLinkCapacity`、`ForceLayout2D.ts:857` `resize` 保留前缀）。

### 3.3 tick — 六个阶段

`tick()`（`ForceLayout2D.ts:480`）同步且由宿主驱动（`step()` 于 `ForceLayout2D.ts:368` 循环 `tick()` 直至 `alpha >= alphaMin`）。不拥有定时器——宿主决定何时调用 `step()`（类文档 `ForceLayout2D.ts:21`）。

```text
sanitizeState → quadtree.build → repulsion（每节点 Barnes-Hut）
              → link springs → collision grid → centering+integrate+pin clamp → alpha decay
```

各阶段详情：

1. **Sanitize**（`ForceLayout2D.ts:752`）—— 对每个 position/velocity/pin/repulsion/radius 执行 `toF32`，使游离 NaN 无法污染树；已固定坐标覆盖已存位置。

2. **Tree build**（`ForceLayout2D.ts:483` `quadtree.build(positions, repulsion, nodeCount)`）——见 §5。

3. **Repulsion**（`ForceLayout2D.ts:484` 循环调用 `quadtree.force(qx,qy,theta,nodeIndex,out,maxDistance)`）——反平方 `(-charge / d³) * (dx,dy)`，`distanceSquared` 下限 `1e-6`，对精确重合使用确定性 `pairAngle`（`BarnesHutQuadtree.ts:126` / `BarnesHutQuadtree.ts:610` `pairAngle`）。遵循 `repulsionDistanceMax`（`ForceLayout2D.ts:92` 非有限 = 无截断；`BarnesHutQuadtree.ts:85` `maxDistanceSquared` + 最近单元预检 `distanceToCellSquared` 于 `BarnesHutQuadtree.ts:632`）。3D 侧在八叉树插入中使用相同下限与 `jitterFor`。

4. **Link springs**（`ForceLayout2D.ts:499`）——类胡克 `displacement = ((d - rest)/d) * strength * alpha`，按度加权份额拆分（`ForceLayout2D.ts:701` `recomputeLinkBias`：`sourceShare = targetDegree/total`，当端点被固定时经 `ForceLayout2D.ts:846` 处 `springShare` 下限）。对已固定目标使用预测位置，使固定节点仍能拉动。

5. **Collision**（`ForceLayout2D.ts:580` `applyCollisions` → `BarnesHutQuadtree.ts:172` `applyGridCollisions`）——分层网格，见 §5。

6. **Center + integrate**（`ForceLayout2D.ts:554` `center*alpha` 向原点拉动、速度衰减，然后按轴固定点钳制：已固定轴贴合 `fixedX/Y` 并清零速度）。**Cool**（`ForceLayout2D.ts:577` `alpha += (0-alpha)*alphaDecay`）带 `alphaDecay > 0` 守卫于 `ForceLayout2D.ts:95`，因为 `0` 会让循环永不结束（`step()` 于 `ForceLayout2D.ts:372` `while (alpha>=alphaMin)`）。

## 4. 力作为配置

`ForceLayout2DOptions`（`types.ts:42`）与 `VectoForceLayoutOptions`（`VectoForceLayout.ts:12`）暴露相同模型但默认值不同：

| 旋钮                           | 2D 默认值（`types.ts:43`） | 3D 默认值（`VectoForceLayout.ts:14`）             | 作用                                                    | 调优提示                                                                                                                                   |
| ------------------------------ | -------------------------- | ------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `repulsion` / `chargeStrength` | `300`（正强度）            | `300`（VectoForce）/ `-30`（D3 `chargeStrength`） | N 体互斥                                                | 增大以分离枢纽；2D 将负值钳制为 `0`（`ForceLayout2D.ts:629`/`ForceLayout2D.ts:761` 与 `BarnesHutQuadtree.ts:109` `charge<=0 skip` 不变量） |
| `collisionRadius`              | `0`（关闭）                | n/a（graph3d 无 2D 网格）                         | 每节点半径，`0` 禁用（`ForceLayout2D.ts:582` max 扫描） | 在 bench 中经访问器设为 `radius+14`（`entry.ts:631`）                                                                                      |
| `collisionStrength`            | `1`                        | —                                                 | 重叠修正比例                                            | `0` 跳过整个阶段                                                                                                                           |
| `linkDistance`                 | `30`                       | `30`                                              | 弹簧静止长度                                            | bench 中按连边度使用访问器（`entry.ts:632`）                                                                                               |
| `linkStrength`                 | `0.3`                      | `0.3`                                             | 弹簧刚度 `[0,1]`                                        | `0` = 连边不施力                                                                                                                           |
| `centerStrength`               | `0.02`                     | `0.02`                                            | 向原点拉动                                              | `0` = 图自由漂浮                                                                                                                           |
| `velocityDecay`                | `0.6`                      | `0.6`                                             | `1-friction`，保留率 `[0,1)`                            | 越低阻尼越大                                                                                                                               |
| `theta`                        | `0.9`                      | `0.9`                                             | Barnes-Hut 张角                                         | `0` = 精确 O(N²)；越大越快/越宽松                                                                                                          |
| `repulsionDistanceMax`         | `Infinity`                 | `Infinity`（3D bench 未单独暴露）                 | 远距斥力 GC                                             | `Infinity`/非有限 = 无截断（`ForceLayout2D.ts:91`）；`0` 亦经 `BarnesHutQuadtree.ts:77` 提前返回禁用——隐蔽陷阱                             |
| `alphaDecay` / `alphaMin`      | `0.0228` / `0.001`         | `0.0228` / `0.001`                                | 冷却（`~1-0.001^(1/300)` ≈300 tick 收敛）               | `0` 衰减回退为 `0.0228`（`ForceLayout2D.ts:96`）                                                                                           |

访问器形式 `number | ((node, index)=>number)`（`types.ts:38` `NodeValue`、`LinkValue`）让文档无需重建即可将实体尺寸映射到半径。连边份额在每次拓扑变化时重算（`ForceLayout2D.ts:702`）。

## 5. 两种空间索引

### 5.1 2D Barnes-Hut 四叉树

`BarnesHutQuadtree.ts:8` 是每 tick 复用的扁平数组四叉树。`build()`（`BarnesHutQuadtree.ts:36`）从位置 AABB 推导方形边界（`+1e-6` 裕量），确保容量（`BarnesHutQuadtree.ts:531` 从 64 翻倍、`count*4+4` 启发），并插入每个点（`BarnesHutQuadtree.ts:437` `insert` 带 `MAX_DEPTH=40` 于第 1 行——重合点深度守卫，叶子持有链表 `pointHead→pointNext`）。`finalize()`（`BarnesHutQuadtree.ts:485`）逆序遍历节点（子先于父，节点自顶向下分配）累积 `charge` 与 `centerX/Y` 作为质量加权均值；`BarnesHutQuadtree.ts:507` 处 `total>0` 守卫与上述 `charge<=0 skip` 不变量配对——负电荷需要重新思考两者。

`force()`（`BarnesHutQuadtree.ts:69`）为迭代栈遍历（`BarnesHutQuadtree.ts:87` `ensureStack`），带截断预检的 `distanceToCellSquared`（`BarnesHutQuadtree.ts:632`）与 `BarnesHutQuadtree.ts:117` 处的精确近似测试。

### 5.2 分层碰撞网格

`applyGridCollisions`（`BarnesHutQuadtree.ts:172`）存在是因为碰撞是与斥力*不同*的空间查询（短程重叠，而非长程场）。关键思路：

- **分级分配**（`BarnesHutQuadtree.ts:206` `tier = floor(log2(radius))`，单元 `4*2^tier` 于 `BarnesHutQuadtree.ts:267`）——均匀半径坍缩为单一分级，表现如旧的 `2·maxRadius` 网格；`BarnesHutQuadtree.ts:198` 处 `cellSize < r_i+r_j` 界保证 3×3 探测即能找到所有重叠。
- **零半径哨兵**（`BarnesHutQuadtree.ts:5` `ZERO_TIER = -0x40000000`、`BarnesHutQuadtree.ts:222` 桶）——零半径点永不拥有网格但仍作为发起者与更大分级碰撞。
- **按分级计数排序**（`BarnesHutQuadtree.ts:240` 前缀和到 `collisionOrderOffsets`、`BarnesHutQuadtree.ts:248` 游标填充）——O(N) 且跨度安全：偏移表按*分级跨度*而非点数定长，因为 `f32` 半径跨约 280 个 2 的幂（`BarnesHutQuadtree.ts:237` 注释、`BarnesHutQuadtree.ts:587` `ensureCollisionOffsets`）。
- **去重 3×3 探测**（`BarnesHutQuadtree.ts:349` `probeCollisionCell`）——9 槽、线性探测哈希 `imul(cellX,73856093)^imul(cellY,19349663)`（`BarnesHutQuadtree.ts:596`），`BarnesHutQuadtree.ts:372` 处重复单元过滤、同对仅一次规则（同级且 `target<=source` 跳过于 `BarnesHutQuadtree.ts:390`；跨级无需跳过——每个更大分级对仅被其更小发起者访问一次）。
- **份额感知冲量**（`BarnesHutQuadtree.ts:406` `pinned?0:otherPinned?1:0.5`）——镜像弹簧份额但两者自由时钳制为一半（d3-force 使用半径加权份额；`entry.ts:745` 处的注释标注了比较注意事项）。

3D 八叉树（`VectoForceLayout.ts:402`）在 3D 中镜像此结构：`BarnesHutOctree.build` 将 AABB 立方化、`insert` 带相同 `depth < 40` 守卫与重合点确定性 `jitterFor`（`VectoForceLayout.ts:561`）、自底向上 `finalizeMass`、`force` 带 `size² < theta²*d²` 与 `pointIndex` 身份跳过（`VectoForceLayout.ts:726`）而非距离为零跳过——重合的不同点被抖开且仍须施力。

## 6. 固定点、重加热与确定性

**固定点按轴、按 ID 寻址。** `ForceLayout2D` 按 `NodeId` 固定（`ForceLayout2D.ts:393` `pinNode(id,x,y)`、`ForceLayout2D.ts:413` `setNodePin({x?,y?})`、`ForceLayout2D.ts:436` `clearNodePin`），存储 `fixedX/Y` + `pinnedX/Y`（`ForceLayout2D.ts:53`）；graph3d 的 `GraphLayout` 按*索引*固定（`GraphLayout.ts:46` `pinNode(nodeIndex,x,y,z)`、`VectoForceLayout.ts:337` `fx/fy/fz = NaN` 哨兵 vs `D3ForceLayout.ts:122` `fx/fy/fz = null`）。分歧记录于 `ForceLayout2D.ts:387`——跨栈迁移时需转换。`GraphNode` 上的初始 `fx/fy`（`types.ts:12`）在 `ForceLayout2D.ts:619` `addNode` 处作为预固定被尊重。

**重加热只升不降**（`ForceLayout2D.ts:450` `alpha = max(alpha, requested)`、`VectoForceLayout.ts:359` 同、`D3ForceLayout.ts:150` `alpha = max(alphaMin, min(1,alpha))`）。每次拓扑变更重加热一次（`ForceLayout2D.ts:199`、`ForceLayout2D.ts:252`、`ForceLayout2D.ts:308`、`ForceLayout2D.ts:361` 条件式）——调用方无需记住。知识图谱路径在 `rebuildGraph` 后于 `KnowledgeGraphModel.ts:285` `layout?.reheat?.(0.5)` 显式重加热，其本身在 `KnowledgeGraphModel.ts:356` 调用 `layout?.setGraph`。

**确定性**有三重：带种子的 `mulberry32` 螺旋放置（`ForceLayout2D.ts:613` `radius=10*sqrt(i+1), angle=rand()*2π` / `VectoForceLayout.ts:143` `r=10*cbrt(i+1)` 球面）、经 `deterministicAngle`（`ForceLayout2D.ts:878` 由 `(source,target,seed)` 哈希）与 `collisionPairAngle`（`BarnesHutQuadtree.ts:618` 带种子）的确定性重合角，以及 JS 与 Rust 间相同的浮点选择（上述 `Math.hypot` 陷阱）。

**冷却**使用 `alphaDecay = 0.0228`（`≈ 1-0.001^(1/300)`，与 d3-force-3d 默认相同，`VectoForceLayout.ts:32` 注释）与 `alphaMin = 0.001`；`step()` 返回 `alpha >= alphaMin` 作为“仍热”（`ForceLayout2D.ts:375`），匹配 `GraphLayout` 契约（`GraphLayout.ts:26` 文档）。未释放的 `alpha=0` 永不冷却——构造时已加守卫。

## 7. 3D 家族与 Knowledge Graph 消费者

### 7.1 VectoForceLayout vs D3ForceLayout

两者均实现 `GraphLayout`（`GraphLayout.ts:12`——按 `GraphData.nodes` 顺序的扁平 `Float32Array` xyz 三元组，可跨 worker 传输、宿主驱动 `step()`）。差异：

- **模型：** `VectoForceLayout`（`VectoForceLayout.ts:50`）是*新*模型——Barnes-Hut 八叉树斥力（`VectoForceLayout.ts:402`）、连边弹簧、居中、速度衰减、alpha 冷却——确定且无依赖。`D3ForceLayout`（`D3ForceLayout.ts:25`）是 *d3-force-3d 适配器*（`forceSimulation(…,3).force('link', forceLink).force('charge', forceManyBody).force('center', forceCenter)` 于 `D3ForceLayout.ts:88`），为迁移保留 `3d-force-graph` 的手感。
- **状态归属：** `VectoForceLayout` 保持 `positions/vx/vy/vz/fx/fy/fz/linkA/B` SoA（`VectoForceLayout.ts:87`）且从不变更调用方节点；`D3ForceLayout` 克隆为 `simNodes: SimulationNode[]`（`D3ForceLayout.ts:71`）因为 d3 会改动它们。
- **固定点：** 基于索引的 `fx/fy/fz` NaN vs `null` 哨兵；`VectoForceLayout.tick` 在积分前钳制（`VectoForceLayout.ts:308`），d3 的 `fx` 在其 tick 内同样处理。
- **Alpha：** `VectoForceLayout.reheat` 在 `alphaMin` 下限、于 `1` 上限（`VectoForceLayout.ts:361`）；`D3ForceLayout.reheat` 直接写入 `simulation.alpha()`（`D3ForceLayout.ts:151`）。

`FixedZLayout`（`knowledge-graph/src/FixedZLayout.ts:10`）包裹 `VectoForceLayout` 并在内部步进后将每个 `z` 钳制为常量，让 3D 布局驱动 2D 知识图谱视图而无需更换引擎。`KnowledgeGraphSession`（`knowledge-graph/src/KnowledgeGraphSession.ts:59` 文档“session 仅镜像”）在第 117 行构造 `VectoForceLayout({theta:0.9})` 并将 `setGraph`/`reheat` 委托给 `KnowledgeGraphModel`。

### 7.2 KnowledgeGraphModel — 增量消费者

`KnowledgeGraphModel`（`knowledge-graph/src/KnowledgeGraphModel.ts:62`）拥有物化的切面（`entities`、`facts`、`factKeys`、`expansions`）且是其借用 `GraphLayout` 的**唯一驱动器**（`KnowledgeGraphModel.ts:43` 文档：每个 `rebuildGraph` 一次 `setGraph`，每个 `expand` 一次 `reheat`）。在 `expand(id)`（`KnowledgeGraphModel.ts:127`）时经 `KgDataSource.getNeighbors` 带 `AbortSignal` 取消分页（`KnowledgeGraphModel.ts:148` 共享 promise 去重、`KnowledgeGraphModel.ts:150` `cancelExpand`），摄入实体/事实，按*批次*事实数推进 `loaded`（而非净新增，因此重叠邻域不会卡住进度——见 `KnowledgeGraphModel.ts:273` 注释），调用 `rebuildGraph()`（`KnowledgeGraphModel.ts:332` 捕获位置、合并稳定 `entityOrder`、从 `lastPositions` 为新节点播种、写入 `GraphData` 并调用 `layout?.setGraph`），重加热（`KnowledgeGraphModel.ts:285`），并记录 `ExpansionState`（`KnowledgeGraphModel.ts:7`）。`dispose()`（`KnowledgeGraphModel.ts:225`）有意*不*释放借用的布局——session 可能仍在共享它。

### 7.3 WASM — 隐形力内核

`crates/vectojs-force-rs`（`crates/vectojs-force-rs/Cargo.toml:6` “隐形后端；TypeScript 路径为永久回退”）在 Rust 中镜像 `BarnesHutOctree`：`Octree`（`lib.rs:47`）、`jitter_for`（`lib.rs:83`）、`build`/`insert`/`place_child`/`finalize_mass`/`force`（`lib.rs:194` / `lib.rs:401`），导出 `force_init`/`force_pos`/`force_accel`/`force_step`（`lib.rs:457` / `lib.rs:484` / `lib.rs:491` / `lib.rs:503`）与 `STATUS_OK/CAPACITY/UNINITIALIZED/OVERFLOW`（`lib.rs:31`）。范围为*仅构建 + 力累积*（`lib.rs:10` 注释——该阶段占 3D tick 的 78–90%，`VectoForceLayout.ts:240` 阶段拆分）——连边弹簧、居中、积分留在 JS tick 中，因此缝隙为每 tick 一次 `Float32Array.set` 收集与一次 `Float64Array` 回读。

加载器（`packages/graph3d/src/wasm/force-backend.ts:42` `ForceBackend`）做流式 fetch 并回退到 `arrayBuffer`（`force-backend.ts:104` `instantiateStreaming`）、`ensure`/`force_init` 增长（`force-backend.ts:52`）、`step` 收集 + `force_step` + 陈旧视图刷新（`force-backend.ts:65` + `force-backend.ts:37` `viewsStale`——八叉树可在步进中增长线性内存，使视图脱离）。任一点失败返回 `null`，调用方保留 JS 八叉树（`VectoForceLayout.ts:106` / `VectoForceLayout.ts:246` 回退到 `this.tree.build` + `this.tree.force`；资源 URL 为 `packages/graph3d/src/wasm/asset.ts:22` `forceWasmUrl` 经 `new URL('./vectojs_force.wasm', import.meta.url)`——唯一对打包器安全的形式）。`.wasm` 被 gitignore 并在发布时经 `tsup.config.ts:40` 拷贝，与 `vectojs-core-rs` 完全一致。

逐位一致不可协商：Rust 树必须计算与 JS 树相同的 `f64` 质心与 `f64` 斥力积分（位置与速度两侧均为 `f32`）。`VectoForceLayout.ts:58` 阐明：“未来的 Rust/WASM 内核……必须精确复现 `f64` 累积。”测试对两条路径做逐位差分测试（见 `packages/graph3d/test/VectoForceLayout.wasm.test.ts:6` 流式/同步启用与 `VectoForceLayout.ts:618` 处带空格拷贝）。

构建与 boss 08 的陷阱相同：`crates/vectojs-force-rs/build.sh` 带 `RUSTFLAGS="-C target-cpu=generic -C target-feature=+simd128 -C linker=rust-lld"`；裸 `cargo build --target wasm32-unknown-unknown` 会泄漏 `~/.cargo/config.toml` 宿主机标志并破坏链接。

## 8. 基准测试方法论 — 何谓可引用

`benchmarks/graph-layout/entry.ts:1` 头部为权威。仅 `benchmarks/run-browsers.sh`（`benchmarks/run-browsers.sh:4` 处 `bun runner/cli.ts` 的包装）在**真实有头浏览器、专用 Hyprland 工作区、聚焦窗口、真实 GPU**上产生可引用数字（按工作区 `AGENTS.md` 基准契约）。`benchmarks/debug-page.ts` 与 `scripts/benchmark.ts` 为无头（`--disable-gpu`）——回归绊线与调试辅助，非引用。

### 8.1 矩阵、预算与 settle 的含义

**预算化默认值**（CTX-0517，2026-08-26 — `entry.ts:4`）为：

- `COUNTS = 100,1000,3000`（`entry.ts:48`——去掉作为 1000 对数近邻的 500；保留 3000 作为 `#559` 基线）
- `TICKS = 30` 常规每 tick 采样（`entry.ts:49`）
- `TRIALS = 3`（`entry.ts:50`——`#559` 基线协议；套件级重复经 `run-browsers.sh --iterations`）
- `SETTLE_CAP = 120`（`entry.ts:51`——追加后前 120 tick，而非约 285–300 tick 的自然收敛；`settleCappedTrials == TRIALS` 系有意为之，按 2026-08-25 扫描）
- `APPEND_NODES = 50`（`entry.ts:57`）、`WARMUP_TICKS = 5`（`entry.ts:58`）、`POST_TOPOLOGY_ALPHA = 1`（`entry.ts:59`）

**旧默认值**（`counts 100,500,1000,3000 × 2 workloads × 4 arms × 6 trials × cap 500`）预计每引擎 >1500 s，因为每个 settle tick 都付出约 4 ms 的定时器钳制 `setTimeout(0)` 让步（`entry.ts:301` `yieldToPaint`）且 settle 跑到约 300 tick——现在每 envelope 在无头 Chrome 约 ~150 s（`entry.ts:25`）。

**Workloads** 为 `star-hub` 与 `mixed-sparse`（`entry.ts:61`），图构建于 `entry.ts:226` / `entry.ts:252`（位置在 `sqrt` 螺旋上播种以避免堆叠），追加负载添加 50 节点 + hub 或偏好+随机连边。

**Arms** 为四条（`entry.ts:599`）：

| arm               | 维度 | 实现               | `appendMode`       | 构造                                                                                                                                                                                                                            |
| ----------------- | ---- | ------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `d3-force-3d`     | 3    | `D3ForceLayout`    | `setGraph-rebuild` | `new D3ForceLayout()`                                                                                                                                                                                                           |
| `vecto-force`     | 3    | `VectoForceLayout` | `setGraph-rebuild` | `new VectoForceLayout()`                                                                                                                                                                                                        |
| `d3-force-2d`     | 2    | d3-force 页内      | `appendGraph`      | `entry.ts:78` 处 `D3Force2DLayout`（charge `300`、`distanceMax 450`、`theta 0.9`、collide `radius+14`）                                                                                                                         |
| `force-layout-2d` | 2    | `ForceLayout2D`    | `appendGraph`      | `new ForceLayout2D({repulsion: charge, collisionRadius: radius+14, linkDistance 访问器, linkStrength 0.42, center 0.016, velocityDecay 0.64, alphaDecay 0.024, repulsionDistanceMax 450, theta 0.9, seed 7})` 于 `entry.ts:625` |

Arm 顺序按 `(workloadIndex, countIndex)` **确定性轮转**（`entry.ts:647` `rotatedArms`），因此引擎/代理顺序不会偏置某个 count。

### 8.2 测量什么

每 arm/workload/count 三个可观测值，均位于 `performance.now()` 与 `setTimeout(0)` 任务边界后，使长任务条目不合并（`entry.ts:330` 经 `PerformanceObserver 'longtask'` 的 `captureLongTasks`）：

- **`benchTicks`**（`entry.ts:501`）——来自全新重加热图的 `TICKS` 次常规 `step()` 调用：`median/p95/max`（`entry.ts:292` 经 `_shared/stats.ts` 的 `median`/`percentile` 的 `summarize`）。
- **`benchAppend`**（`entry.ts:526`）——仅拓扑变更（克隆负载在 `entry.ts:346` `prepareAppendPayloads` 预构建，因此克隆永不偏爱 `appendGraph`）；随后在每次首个追加后 tick 与每个 settling 循环前显式 `reheat(POST_TOPOLOGY_ALPHA)`（`entry.ts:559`）。返回 `append` median/p95、`firstTick` median/p95、`settleTotal` median/p95（至多 `SETTLE_CAP` tick）、`settleTicks` median/p95、`settleCappedTrials` 与 `maxStepMs`（跨所有阶段的最大单次 `step()`，`entry.ts:679`）。
- **`observeLiveAppendMemory`**（`entry.ts:398`）——一个专用已预热的 live 布局在即时的前后读数间保留，负载创建与释放*在*增量之外（`entry.ts:415` 注释）。优先 `performance.measureUserAgentSpecificMemory`（`entry.ts:444`，由 `entry.ts:353` `readUaMemoryWithTimeout` 限 `UA_MEMORY_TIMEOUT_MS = 1250` 于 `entry.ts:55`）；单次超时失败会为本次运行禁用后续 UA 读取（`entry.ts:454` `uaMemoryDisabledReason`）；在堆回退（`performance.memory.usedJSHeapSize` 于 `entry.ts:465`）上以全新布局重试完整观测。两者均为**带噪观测，非保留内存或后端选择证据**（`entry.ts:740` 注意事项）。不支持则报告为 `status: 'unsupported'` 带原因。

亦报告：每长任务捕获的 `longTaskMaxDurationMs`（`entry.ts:678`），仅当 `longtask` 区间覆盖被测 `[started,ended]` 时计数（`entry.ts:326` `include`）。

### 8.3 有头运行器契约

实测于 2026-08-02，240 Hz 面板为 Hyprland `eDP-1 2560x1600` scale 1.6。三种节律陷阱会无声地使任何数字失效：未聚焦 Chrome 回落至 ~60 Hz、Firefox 需 `layout.frame_rate` 且默认即便聚焦也为 60 Hz（手驱 Firefox 错 4 倍），`refreshHz` 恰为 250 是 240 Hz 面板上的中位数假象。harness（`benchmarks/_shared/server.ts`、`runner.ts`、`loaf.ts`）执行 `validateEnvironment`、饥饿检测、跨运行聚合，并携带 commit + 宿主机 CPU/GPU/driver（页面无法看见这些）。每个基准仅拥有 `entry.ts` + 三行 `build.ts`（`benchmarks/graph-layout/build.ts:11` 委托给 `_shared/build.ts`）；server/bundler 位于 `_shared/`——勿重复。

**永不硬编码刷新率**——调用 `calibrateRefreshRate()` 并在任何逐帧数字旁报告 `refreshHz`。同时引用两种引擎（V8 与 SpiderMonkey 分歧显著）。

### 8.4 基线快照

**完整 N=7 基线**于 500 节点（`benchmarks/graph-layout/README.md:44`，运行 `20260820T135641Z-1a6d54`，Chrome `240.04 Hz` / Firefox `240.64 Hz`）是有头预算下最后一次完全迭代的完整矩阵（1000 节点与 3000 节点完整矩阵在 `entry.ts` 默认值下超时——见 `README.md:11` 与 `README.md:28`）。代表性 settle 中位数（500 节点、`TICKS 30`、`TRIALS 1`、`SETTLE_CAP 500`，两种 workloads）在该 README 中；上述精简的预算化默认值在单引擎成本上取代它（约 150 s）。结果保留于 `benchmarks/graph-layout/results/`（gitignored），以 runner 的 history ID 标识，而非粘贴中位数。

## 9. d3-force 迁移、交互与剔除

**从 d3-force**（`d3-force`/`d3-force-3d`）迁移到 `ForceLayout2D`/`VectoForceLayout` 并非重命名。`benchmarks/graph-layout/entry.ts:745` 处的 bench 注意事项是关键：“2D 行……比较不同力定律：`ForceLayout2D` 使用反平方斥力与相等 free/free 碰撞份额；`d3-force` 使用反距离斥力与半径平方碰撞份额。将比值视为实现级工作负载比较，而非等式等价的内核度量。”

需翻译的具体差异：

- **斥力定律：** `ForceLayout2D` 为 `−charge / d³ * (dx,dy)`（`BarnesHutQuadtree.ts:134` `factor = -charge*invD/d²`），即力幅值上反平方；d3 的 `forceManyBody` 为反距离（`strength / d`）。绝对数值不可比——应重调 `repulsion`/`chargeStrength` 而非照搬。
- **截断语义：** `ForceLayout2D` 以*聚合*的电荷中心测试 `repulsionDistanceMax`（`BarnesHutQuadtree.ts:98` `nearestDistanceSquared` + `maxDistanceSquared` 预检），匹配 d3 的多体截断；`theta: 0` 时截断对每点精确（`types.ts:59` 文档）。`Infinity`/非有限禁用它——`0` 经提前返回*静默*禁用，因此 `ForceLayout2D.ts:91` 处 `finiteOr` 将任何非正映射为 `Infinity`。
- **连边身份：** `ForceLayout2D` 在有向 `(source,target,id)` 上经 `linkIdentity` 去重（`ForceLayout2D.ts:826`）并在变更前对悬空/自环抛出；d3 在连边对象上保留原始字符串 id，编辑器的 `duplicate-link` 守卫甚至更严格（分歧说明于 `ForceLayout2D.ts:387`）。迁移持久化图时先规范化 `id` 字段。
- **固定点寻址：** 见 §6——`ForceLayout2D` 按 `NodeId`，graph3d 的 `GraphLayout` 按索引。捕获索引的拖动固定处理器在 2D 侧 `removeNodes` 后必须重解析。
- **Theta：** 范围与效果相同——`0` = 精确 `O(N²)`，越大越快/越宽松（`types.ts:57`、`VectoForceLayout.ts:28`）。默认 `0.9` 在各栈间手感相近，但在四叉树与八叉树间并非逐位一致。

**交互与可见性**在物理 tick 之外，但在规模化时开销显著。`packages/graph3d/src/GraphInteraction.ts:1`（`GraphInteraction`）将 Three.js 射线命中映射为 `nodeIndex` 以实现悬停/选中/拖动固定，并做常规悬停防抖；`Graph3D.ts:1`（`Graph3D`）实例化渲染图并剔除屏外。两者均不替代布局——它们在 `step()` 后消费 `positions`。3000 节点时渲染器而非布局常为帧瓶颈（`benchmarks/graph3d-frame/entry.ts:1` 帧成本 harness vs `benchmarks/graph-layout/entry.ts:1` 物理矩阵——保持两 harness 区分）。对于 canvas `Scene` 宿主（非 Three.js），`packages/core/src/tree/Scene.ts:1` 剔除做同样工作；graph-layout 本身从不剔除。

## 10. 调优与陷阱

固定点按栈区分（`ForceLayout2D` 按 ID，graph3d 按索引——`ForceLayout2D.ts:387`）；移植时需转换。`repulsionDistanceMax = 0` 完全禁用斥力（`BarnesHutQuadtree.ts:77` 提前返回）——非有限才是预期的“无截断”（`ForceLayout2D.ts:91`）。`alphaDecay = 0` 回退为 `0.0228` 否则 settle 循环永不终止（`ForceLayout2D.ts:95`）。非有限或宿主机泄漏的 `RUSTFLAGS` 会破坏 WASM 构建或其逐位一致性（调优 CPU 上的 `fma`，`crates/vectojs-force-rs/build.sh:8`）；使用 `just wasm`。分级跨度定长 bug（`BarnesHutQuadtree.ts:237`）——按点数而非分级跨度定偏移表——当半径跨约 280 个 `f32` 分级时会静默丢弃计数排序增量。`force_init` 增长后的视图脱离（`force-backend.ts:37` `viewsStale`）必须在每次 `force_step` 后重校验类型化数组视图。

本研究期间发现的其他地雷：

- **2D 中负斥力被钳制，而非支持。** `ForceLayout2D` 在 `ForceLayout2D.ts:629`/`ForceLayout2D.ts:761` 将 `repulsion` 钳制为 `>=0`，`BarnesHutQuadtree.ts:109` 跳过 `charge<=0` 子树——`BarnesHutQuadtree.ts:507` 处 `finalize` 守卫否则会为吸引节点错置电荷中心。D3 的负（吸引）电荷在此无等价；允许它前需重审两处守卫。
- **连边 `id` vs 端点寻址。** `removeLinks` 仅当出现裸 `LinkId` 时才惰性构建 `linksByIdKey` 映射（`ForceLayout2D.ts:270`），替代此前每项 `O(items×L)` 扫描。传入与已存 `id` 不同的完整 `GraphLink` 对象将不匹配——身份为序列化三元组，而非对象身份。
- **`positions` 视图别名。** `refreshPositionView` 返回同一 `ArrayBuffer` 上的 `subarray`（`ForceLayout2D.ts:749`）。在 `ensureNodeCapacity` 或 `removeNodes`（于 `ForceLayout2D.ts:857` `resize` 缓冲）间持有引用会留下长度为 0 的脱离视图。每次变更后重读 `layout.positions`。
- **尚无 `forge/baselines/graph-layout*`。** `benchmarks/graph-layout/results/` 被 gitignore，且无已检入的 `forge/baselines/graph-layout.json`——§8 中每个断言必须在引用宿主机上重测。`benchmarks/graph-layout/README.md:44` 中 500 节点 N=7 发现为宿主机特定快照，非可移植基线文件。
- **`crates/vectojs-force-rs` 恰好一个构建产物。** `build.sh` 产出 `packages/graph3d/src/wasm/vectojs_force.wasm`，`tsup` 将其拷贝到 `dist/wasm/`（`packages/graph3d/tsup.config.ts:40`）。永不出现第二 crate 或共享 WASM 包——直到出现第三消费者（`force-backend.ts:12` 处 `DEC-0081`），保持本地。
- **差分预言纪律。** 3D 路径的 `VectoForceLayout` JS 八叉树为*永久*预言；`crates/vectojs-force-rs/src/lib.rs:1` 处 Rust 内核必须在 `f64` 累积上保持逐位一致（两侧位置 `f32`）。对 `jitter_for`/`jitterFor`/`mulberry32` 在 `VectoForceLayout.ts:606`、`BarnesHutQuadtree.ts:610`、`lib.rs:83` 间 grep——任一改动未落到另一处即为差异失败。`measurePhases` 可选（`VectoForceLayout.ts:45`）保持预言可度量而不在生产环境付出 `performance.now()`。

新增力时，先写 JS 预言（`VectoForceLayout.ts:232` `tick` 结构），保持操作顺序与 `Math.min/Math.max` NaN 语义（见 `BarnesHutQuadtree.ts:632` `distanceToCellSquared` 全序注释），并将 WASM 路径置于 `measurePhases`（`VectoForceLayout.ts:45` 可选 `tickPhases: [octree, force, link, integrate]` 墙钟 ms）之后，使分析关闭时热路径零开销。

## 11. 测试、差分预言与真实故障史

三套测试覆盖 2D 侧（`packages/graph-layout/test/BarnesHutQuadtree.test.ts:1` 四叉树近似 vs 精确、`packages/graph-layout/test/ForceLayout2D.test.ts:1` `setGraph`/`appendGraph`/`removeNodes`/`removeLinks`/`updateLinks`/固定点/alpha、`packages/graph-layout/test/ForceLayout2D.linkMutations.test.ts:1` 去重/度偏置/连边份额）。3D 侧增加 `packages/graph3d/test/VectoForceLayout.wasm.test.ts:1`（JS vs WASM 逐位一致：流式、同步、坏 URL 时回退于 `VectoForceLayout.wasm.test.ts:123` `file:///nonexistent` → `false`）。

它们守护什么以及此前踩过什么坑——将其作为评审清单阅读：

- **构建前 sanitize。** `positionStorage` 中残留 `NaN` 位置会毒化四叉树边界（`minX = NaN` → `size = NaN`）。`ForceLayout2D.ts:752` 处 `sanitizeState` 的 `toF32`+固定点覆盖存在，正因曾有调用方提供的 `x: NaN` 来自解构 JSON。永不移除该循环。
- **零距下限。** 无 `BarnesHutQuadtree.ts:132`/`BarnesHutQuadtree.ts:154` 与 `VectoForceLayout.ts:727` 处 `1e-6` 下限，同一单元内两重合点会产生 `factor = -m/0 = ±Infinity` → `NaN` 速度并感染之后每 tick。`BarnesHutQuadtree.ts:610`/`ForceLayout2D.ts:878` 处确定性角度使推力可重复。
- **固定点份额泄漏。** 忘记当一端被固定时 `springShare` 回退（`ForceLayout2D.ts:846` / `BarnesHutQuadtree.ts:406` 处固定 `0` 或 `1`）会让被固定节点被另一端速度拖动。历史：早期 3D 固定点抖动正因连边弹簧仍积分已固定坐标。
- **Alpha 永不到 min。** 传入 `alphaDecay: 0` 使 `alpha` 永远为 `1`——宿主循环 `while(layout.step())` 永不终止。`ForceLayout2D.ts:95` / `VectoForceLayout.ts:117` 处将 `0` → `0.0228` 的守卫源于一次计算选项产生 `0` 的线上事件。
- **内存观测误读。** `entry.ts:398` 中 `liveAppendMemoryObservation` 数值为*全代理*观测带 GC 噪声（`entry.ts:449` 注意事项）；将其视为每后端保留堆是最常见的图基准误引。该运行亦在一次超时后禁用 UA 特定读取（`entry.ts:454`）并在 `usedJSHeapSize` 上重试——将中途切换来源的运行与未切换的对比无效。

面向评审的复杂度总结：

| 阶段       | 2D                                             | 3D                                | 位置                                                  |
| ---------- | ---------------------------------------------- | --------------------------------- | ----------------------------------------------------- |
| 树构建     | O(N log N) 四叉树                              | O(N log N) 八叉树                 | `BarnesHutQuadtree.ts:36` / `VectoForceLayout.ts:414` |
| 斥力       | O(N log N) 均值，`theta=0` 时 O(N²) 最坏       | 相同                              | `ForceLayout2D.ts:484` / `VectoForceLayout.ts:259`    |
| 连边       | O(L)                                           | O(L)                              | `ForceLayout2D.ts:499` / `VectoForceLayout.ts:274`    |
| 碰撞       | 经分层网格 O(N) 均值；偏斜半径下无分级则 O(N²) | —                                 | `BarnesHutQuadtree.ts:172`                            |
| 每布局内存 | ~6×N f32 + 连边 + 树 ~4N 节点                  | ~7×N f32 + 连边 + 八叉树 ~8N 节点 | `ForceLayout2D.ts:672` / `VectoForceLayout.ts:445`    |

## 12. 可复现性 — 可引用的命令

```bash
# 构建 WASM 力内核（任何 WASM 路径前必需）：
just wasm                         # 或 crates/vectojs-force-rs/build.sh
# 可选：仅验证 JS 预言（无需 Rust）：
just test-pkg graph-layout && just test-pkg graph3d

# 有头物理矩阵 — 可引用路径（需 Hyprland + 有头 Chrome/Firefox）：
./benchmarks/run-browsers.sh graph-layout 8272 --viewport 1280x720 \
  --param counts=100,1000,3000 --param ticks=30 --param trials=3 \
  --param settleCap=120 chrome firefox
# 全收敛变体（复现旧 500-tick settle，显式预算）：
./benchmarks/run-browsers.sh graph-layout 8273 --viewport 1280x720 \
  --param counts=100,500,1000,3000 --param ticks=30 --param trials=6 \
  --param settleCap=500 chrome firefox   # 预计 >1500 s — 相应预算

# 3D 帧成本（渲染器，非物理 — 勿混淆）：
./benchmarks/run-browsers.sh graph3d-frame 8274 --viewport 1280x720 chrome firefox
```

报告来自 `calibrateRefreshRate()` 的 `refreshHz`、两种引擎、commit SHA 与宿主机 CPU/GPU/driver（页面无法看见这些——harness 于 `benchmarks/_shared/server.ts:1` 捕获）。原始 JSON 保留于 `benchmarks/graph-layout/results/`（gitignored）并以其 history ID 引用，而非粘贴中位数。

## 附录 — 下一步阅读指引

| 目标                   | 起点                                                                               | 然后                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 为新数据集调优 2D 布局 | `packages/graph-layout/src/types.ts:42` + `ForceLayout2D.ts:79` 构造默认值         | `ForceLayout2D.ts:480` tick 阶段 → `BarnesHutQuadtree.ts:8` 索引      |
| 添加新力（如 radial）  | `VectoForceLayout.ts:232` `tick` 结构为模板                                        | `crates/vectojs-force-rs/src/lib.rs:10` 范围说明 — 仅八叉树力归属内核 |
| 分页知识图谱           | `knowledge-graph/src/KnowledgeGraphModel.ts:62` 生命周期                           | 若需 3D 布局的 2D 投影则 `FixedZLayout.ts:10`                         |
| 引用数字               | `benchmarks/graph-layout/entry.ts:1` 头部 + `benchmarks/graph-layout/README.md:44` | `benchmarks/_shared/stats.ts:1` 的 `median`/`percentile` 语义         |

---

*下一篇：**Boss 12 — DevTools**（运行时检查器，让你指向像素并回读哪个实体拥有它以及为何）。上一篇：**Boss 10 — 视频导出**（确定性固定步进捕获）。系列：00 总览 → 01 选区 → … → 11 图布局（本文）→ 12 DevTools → 99 综合。*
