---
title: '11 — 圖佈局 — 力導向物理與基準測試'
description: 'ForceLayout2D 無依賴的 2D 引擎、Barnes-Hut 四元樹與分層碰撞網格、增量變更與固定契約、VectoForceLayout/D3ForceLayout 3D 家族、vectojs-force-rs WASM 核心，以及有頭基準方法論。'
order: 31
---

# 11 — 圖佈局 — 力導向物理與基準測試

> **Boss 11** 看似「彈簧與排斥」直到你真正發布。樸素的 N 體為每 tick `O(N²)`，單一樞紐使樸素碰撞網格崩潰，增量擴展必須不摧毀已穩定狀態，且兩個使用者必須自同一種子看到相同布局。VectoJS 以 `@vectojs/graph-layout` 中與渲染器無關的 2D 四元樹加上分層網格、`@vectojs/graph3d` 中並行的 3D 八元樹家族，以及 `crates/vectojs-force-rs` 中位元一致的 Rust 核心來回應。

- **你將學到**：為何 N²、穩定性、增量性與確定性是四個難題；`ForceLayout2D` 如何以 SoA 狀態儲存並暴露 `Float32Array` 位置；排斥（Barnes-Hut）、連結彈簧、置中與碰撞如何每 tick 組合；為何 2D 四元樹與分層碰撞網格取代樸素網格；固定、ID 映射、再加熱與 alpha 冷卻如何互動；`VectoForceLayout` vs `D3ForceLayout` vs `FixedZLayout` 差異何在，以及 `KnowledgeGraphModel` 在何處消費它們；WASM 力核心取代什麼、如何保持位元一致；以及 `benchmarks/graph-layout` 實際度量什麼（以及明確不度量什麼）。
- **你不會學到**：VMT dirty/生命週期（Boss 06）、渲染器/DPR 正確性（Boss 07）或 G1/G2/G3 WASM 三元組（Boss 08）——雖然此 Boss 逐字重用 Boss 08 的不可見後端契約。文字塑形（Boss 02）與串流 Markdown（Boss 04）為圖佈局的消費者，而非相反。

## 1. 為何力導向布局看似簡單實則困難

四個問題隱藏於「彈簧與排斥」背後：

1. **N² vs Barnes-Hut。** 排斥為每節點與其他每節點的交互。在 3000 節點時為每 tick、每影格約 900 萬對力，在主執行緒或 worker 上皆沉重。真正的 2D 四元樹（`BarnesHutQuadtree.ts:8` 扁平陣列、跨 tick 重用）透過在 `size/distance < theta`（`BarnesHutQuadtree.ts:121` 開啟測試 `4*half² < theta²*d²`）時將遠方單元視為單一偽粒子，使其成為 `O(N log N)`。3D 側以八元樹做同樣的事（`VectoForceLayout.ts:402` `BarnesHutOctree`）。無此，數百節點以上的圖即卡頓。

2. **異質半徑下的穩定性。** 單一半徑 100 的樞紐加上 3000 個半徑 4 的葉節點使均勻碰撞網格崩潰：一個 `cellSize = 2·maxRadius` 將每個葉節點置於巨大的 3×3 鄰域，成對掃描退化為二次（`BarnesHutQuadtree.ts:189` 處註解度量 `12 ms → 197 ms` 每 tick，從 3k 至 12k 且具一個大樞紐）。修正為按 2 的冪次分層的半徑網格（`BarnesHutQuadtree.ts:190` 層 `t = floor(log2(r))`，單元 `Ct = 2^(t+2)`），其中每層擁有自身雜湊表，跨層配對恰處理一次。

3. **無瞬移的增量性。** 知識圖譜分頁載入：現在 50 節點，捲動後再 50。呼叫者期望 `appendGraph` 保持每個既有位置、速度與固定點恰在原處，僅確定性新增新節點並溫和再加熱（`ForceLayout2D.ts:162` `appendGraph`，`ForceLayout2D.ts:199` `if (newNodes.length>0||addedLinks>0) this.reheat()`）。`setGraph` 重建（`ForceLayout2D.ts:123`）將使已穩定的圖瞬移。

4. **跨平台的確定性。** `seed` 必須重現相同初始放置與相同重合點抖動於 JS 與 Rust 上，使測試、快照與未來的 WASM 差分 oracle 位元一致。所選數學為 `mulberry32`（`ForceLayout2D.ts:868`）、`Math.sqrt`（而非 `Math.hypot`——引擎近似，`VectoForceLayout.ts:618` 註記）與整數 `Math.imul` 抖動（`BarnesHutQuadtree.ts:618` `collisionPairAngle`、`VectoForceLayout.ts:606` `jitterFor` / `crates/vectojs-force-rs/src/lib.rs:83` `jitter_for`）。

遺漏任一，圖形要麼卡頓、爆炸、瞬移，要麼在 JS 與 WASM 間分歧。

## 2. 套件對照

```text
@vectojs/graph-layout          無依賴 2D 引擎，無渲染器對等物
  src/ForceLayout2D.ts         tick 迴圈、SoA 儲存、公開 API
  src/types.ts                 NodeId/GraphData/ForceLayout2DOptions
  src/internal/BarnesHutQuadtree.ts  四元樹 + 分層碰撞網格
  src/index.ts                 barrel（types + layout）

@vectojs/graph3d               3D 實例化渲染器 + 布局後端
  src/layout/GraphLayout.ts    最小 3D 契約（setGraph/step/positions/pin/reheat/dispose）
  src/layout/VectoForceLayout.ts  自研 3D Barnes-Hut 八元樹（JS oracle + WASM）
  src/layout/D3ForceLayout.ts  d3-force-3d 轉接器（遷移保真）
  src/wasm/force-backend.ts    Rust 核心的串流/同步載入器
  src/wasm/asset.ts            forceWasmUrl 打包器輔助
  src/wasm/vectojs_force.wasm  vectojs-force-rs 的 git 忽略產物

@vectojs/knowledge-graph       分頁消費者（KnowledgeGraphModel）
  src/KnowledgeGraphModel.ts   GraphLayout 的單一驅動器（setGraph/reheat）
  src/FixedZLayout.ts          將 z 鉗制至平面的 VectoForceLayout
  src/KnowledgeGraphSession.ts 工廠連接（theta 0.9、WASM 選擇加入）

crates/vectojs-force-rs        WASM 八元樹力核心（不可見後端）

benchmarks/graph-layout        有頭四分支矩陣（d3-force-3d、vecto-force、d3-force-2d、force-layout-2d）
benchmarks/graph3d-frame       3D 渲染器的影格成本 harness（非物理矩陣）
benchmarks/_shared/*           單一伺服器 + 打包器 + 統計 + 執行器（run-browsers.sh）
```

`@vectojs/graph-layout` 零 `@vectojs/*` 依賴（`package.json:1` `name: @vectojs/graph-layout`）；`@vectojs/graph3d` 僅依賴 `three`；`@vectojs/knowledge-graph` 依賴 `graph3d` 的布局契約。建構順序：`math+text → graph-layout → three/graph3d → knowledge-graph`（經 `package.json` workspaces 驗證）。

## 3. ForceLayout2D — 2D 引擎

### 3.1 狀態與位置契約

SoA 型別化陣列，與輸入節點順序索引對齊（`ForceLayout2D.ts:48` `nodes: GraphNode[]`，`ForceLayout2D.ts:49` `nodeIndex: Map<NodeId,number>`，`ForceLayout2D.ts:50` `positionStorage: Float32Array`，`ForceLayout2D.ts:51` `velocityX/Y`，`ForceLayout2D.ts:53` `fixedX/Y` + `pinnedX/Y`，`ForceLayout2D.ts:57` `repulsion`/`collisionRadius`，`ForceLayout2D.ts:60` `linkSource/Target/Distance/Strength/Share`，`ForceLayout2D.ts:76` `quadtree`）。

公開的 `positions` 為 `positionStorage` 中按輸入節點順序的即時交錯 XY 視圖（`ForceLayout2D.ts:32` `public positions = new Float32Array(0)`，`ForceLayout2D.ts:748` `refreshPositionView` 經 `subarray`）。識別在 `step()` 呼叫間穩定，但拓撲或容量變更可能替換後備儲存——宿主必須在 `setGraph`/`appendGraph`/`removeNodes` 後重取得 `positions`（類別文件 `ForceLayout2D.ts:18`）。

所有觸及公開狀態的算術皆經 `Math.fround` 捨入（`ForceLayout2D.ts:13` `const f = Math.fround`，`ForceLayout2D.ts:808` `toF32`），匹配 `Float32Array` 暴露。3D 路徑亦同（`VectoForceLayout.ts:48` `const f = Math.fround`），而 Barnes-Hut 累加器保持 `f64`（`BarnesHutQuadtree.ts:9` `cellX/Y/centerX/Y/halfSize/charge: Float64Array`）。

### 3.2 節點/連結識別與增量變更

節點處處以 `NodeId`（`types.ts:2` `string|number`）定址，而非陣列索引，因此固定在壓縮後仍存活（`ForceLayout2D.ts:25` 文件）。四個變更進入點，各具嚴格的全有或全無驗證：

| 方法                 | 文件                   | 擁有權                         | 失敗模式                                                                                                    |
| -------------------- | ---------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `setGraph(data)`     | `ForceLayout2D.ts:122` | 替換一切、重播種、`alpha=1`    | 重複節點 ID 或連結參考缺失/自我 → 在清除舊狀態前拋出（`ForceLayout2D.ts:132` 交換前驗證）                   |
| `appendGraph(data)`  | `ForceLayout2D.ts:151` | 保持既有、新增新 ID、去重      | 未知/缺失/自我連結 → 在任何變更前拋出（`ForceLayout2D.ts:186` `resolveEndpoint` + `UNKNOWN_ENDPOINT` 守衛） |
| `removeNodes(ids)`   | `ForceLayout2D.ts:202` | 按原始順序壓縮倖存者、重建索引 | 無匹配時無操作；再加熱一次（`ForceLayout2D.ts:252`）                                                        |
| `removeLinks(items)` | `ForceLayout2D.ts:265` | 保持節點狀態、壓縮連結         | 按有向 `(source,target,id)` 識別匹配（`ForceLayout2D.ts:826` `linkIdentity`）；具冪等性                     |
| `updateLinks(links)` | `ForceLayout2D.ts:324` | 為既有連結重解析距離/強度      | 未知/相同端點 → 拋出；忽略不存在的識別；僅當值實際變更時再加熱（`ForceLayout2D.ts:361`）                    |

連結識別為微妙陷阱。`ForceLayout2D.ts:826` `linkIdentity` 將 `[idKey(source), idKey(target), idKey(id)]` 序列化，其中 `idKey`（`ForceLayout2D.ts:835`）為型別加前綴以避免 `"1"` vs `1` 碰撞。無 `id` 時識別為有向端點對；平行連結需要相異 `id`（`types.ts:19` `GraphLink.id`）。3D 後端不同：`VectoForceLayout` 與 `D3ForceLayout` 將每個 `(source,target)` 對視為連結甚至跳過自迴圈（`VectoForceLayout.ts:178` `if (ia===ib) continue`），而編輯器的重複連結守衛更嚴格——於 `ForceLayout2D.ts:387` 處的分歧註記中指出。

`appendLinks`（`ForceLayout2D.ts:637`）經 `pendingKeys` 在批次內去重，並經呼叫者提供的 `NodeValue`/`LinkValue` 存取器（`ForceLayout2D.ts:777` `resolveNodeValue`，`ForceLayout2D.ts:787` `resolveLinkValue`）解析 `distance`/`strength`，具 `finiteOr` 守衛（`ForceLayout2D.ts:797`）。

容量增長為幾何、均攤 `O(1)`（`ForceLayout2D.ts:851` `grownCapacity` 自 4 倍增，`ForceLayout2D.ts:672` `ensureNodeCapacity`，`ForceLayout2D.ts:689` `ensureLinkCapacity`，`ForceLayout2D.ts:857` `resize` 保留前綴）。

### 3.3 Tick — 六階段

`tick()`（`ForceLayout2D.ts:480`）為同步且由宿主驅動（`ForceLayout2D.ts:368` 處的 `step()` 在 `alpha >= alphaMin` 時迴圈 `tick()`）。不擁有計時器——宿主決定何時呼叫 `step()`（類別文件 `ForceLayout2D.ts:21`）。

```text
sanitizeState → quadtree.build → repulsion (Barnes-Hut per node)
              → link springs → collision grid → centering+integrate+pin clamp → alpha decay
```

每階段細節：

1. **淨化**（`ForceLayout2D.ts:752`）— 對每個位置/速度/固定/排斥/半徑做 `toF32`，使 stray NaN 無法污染樹；固定座標覆寫已儲存位置。

2. **樹建構**（`ForceLayout2D.ts:483` `quadtree.build(positions, repulsion, nodeCount)`）——見 §5。

3. **排斥**（`ForceLayout2D.ts:484` 迴圈呼叫 `quadtree.force(qx,qy,theta,nodeIndex,out,maxDistance)`）— 反平方 `(-charge / d³) * (dx,dy)`，`distanceSquared` 下限 `1e-6`，對精確重合使用確定性 `pairAngle`（`BarnesHutQuadtree.ts:126` / `BarnesHutQuadtree.ts:610` `pairAngle`）。遵守 `repulsionDistanceMax`（`ForceLayout2D.ts:92` 非有限 = 無截斷；`BarnesHutQuadtree.ts:85` `maxDistanceSquared` + 最近單元預測試 `distanceToCellSquared` 於 `BarnesHutQuadtree.ts:632`）。3D 側在八元樹插入中使用相同下限與 `jitterFor`。

4. **連結彈簧**（`ForceLayout2D.ts:499`）— 類 Hooke `displacement = ((d - rest)/d) * strength * alpha`，按度數加權份額分割（`ForceLayout2D.ts:701` `recomputeLinkBias`：`sourceShare = targetDegree/total`，當固定釘住端點時經 `ForceLayout2D.ts:846` 處的 `springShare` 下限）。對固定目標使用預測位置，使固定節點仍具拉力。

5. **碰撞**（`ForceLayout2D.ts:580` `applyCollisions` → `BarnesHutQuadtree.ts:172` `applyGridCollisions`）— 分層網格，§5。

6. **置中 + 積分**（`ForceLayout2D.ts:554` `center*alpha` 向原點拉動、速度衰減，然後逐軸固定箝制：固定軸吸附至 `fixedX/Y` 並歸零速度）。**冷卻**（`ForceLayout2D.ts:577` `alpha += (0-alpha)*alphaDecay`）具 `alphaDecay > 0` 守衛於 `ForceLayout2D.ts:95`，因為 `0` 將永遠迴圈（`ForceLayout2D.ts:372` 處的 `step()` `while (alpha>=alphaMin)`）。

## 4. 作為組態的力

`ForceLayout2DOptions`（`types.ts:42`）與 `VectoForceLayoutOptions`（`VectoForceLayout.ts:12`）暴露相同模型但預設不同：

| 旋鈕                           | 2D 預設（`types.ts:43`） | 3D 預設（`VectoForceLayout.ts:14`）               | 角色                                                    | 調校提示                                                                                                                                   |
| ------------------------------ | ------------------------ | ------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `repulsion` / `chargeStrength` | `300`（正強度）          | `300`（VectoForce）/ `-30`（D3 `chargeStrength`） | N 體互斥                                                | 增大以分離樞紐；2D 將負值箝制至 `0`（`ForceLayout2D.ts:629`/`ForceLayout2D.ts:761` 與 `BarnesHutQuadtree.ts:109` `charge<=0 skip` 不變量） |
| `collisionRadius`              | `0`（關閉）              | n/a（graph3d 無 2D 網格）                         | 每節點半徑，`0` 停用（`ForceLayout2D.ts:582` 最大掃描） | 經存取器設為 `radius+14` 於基準（`entry.ts:631`）                                                                                          |
| `collisionStrength`            | `1`                      | —                                                 | 重疊修正比例                                            | `0` 跳過整個遍歷                                                                                                                           |
| `linkDistance`                 | `30`                     | `30`                                              | 彈簧靜止長度                                            | 按基準中每連結度數的存取器（`entry.ts:632`）                                                                                               |
| `linkStrength`                 | `0.3`                    | `0.3`                                             | 彈簧勁度 `[0,1]`                                        | `0` = 連結不施力                                                                                                                           |
| `centerStrength`               | `0.02`                   | `0.02`                                            | 向原點拉動                                              | `0` = 自由浮動圖                                                                                                                           |
| `velocityDecay`                | `0.6`                    | `0.6`                                             | `1-friction`，保留 `[0,1)`                              | 越低阻尼越大                                                                                                                               |
| `theta`                        | `0.9`                    | `0.9`                                             | Barnes-Hut 開啟角                                       | `0` = 精確 `O(N²)`；越大越快/越鬆                                                                                                          |
| `repulsionDistanceMax`         | `Infinity`               | `Infinity`（3D 基準中未單獨暴露）                 | 遠距排斥的 GC                                           | `Infinity`/非有限 = 無截斷（`ForceLayout2D.ts:91`）；`0` 亦經 `BarnesHutQuadtree.ts:77` 提前回傳停用——靜默陷阱                             |
| `alphaDecay` / `alphaMin`      | `0.0228` / `0.001`       | `0.0228` / `0.001`                                | 冷卻（`~1-0.001^(1/300)` ≈300 tick 至穩定）             | `0` 衰減退回 `0.0228`（`ForceLayout2D.ts:96`）                                                                                             |

存取器形式 `number | ((node, index)=>number)`（`types.ts:38` `NodeValue`、`LinkValue`）使文件可將實體大小映射至半徑而無需重建。連結份額在每次拓撲變更時重算（`ForceLayout2D.ts:702`）。

## 5. 兩個空間索引

### 5.1 2D Barnes-Hut 四元樹

`BarnesHutQuadtree.ts:8` 為每 tick 重用的扁平陣列四元樹。`build()`（`BarnesHutQuadtree.ts:36`）自位置 AABB 推導方形邊界（`+1e-6` 餘裕）、確保容量（`BarnesHutQuadtree.ts:531` 自 64 倍增，`count*4+4` 啟發式）並插入每個點（`BarnesHutQuadtree.ts:437` `insert` 具 `MAX_DEPTH=40` 於第 1 行——對重合點的深度守衛，葉節點持有鏈表 `pointHead→pointNext`）。`finalize()`（`BarnesHutQuadtree.ts:485`）反向走訪節點（子節點在父節點前，節點自頂向下配置）累積 `charge` 與 `centerX/Y` 作為質量加權平均；`BarnesHutQuadtree.ts:507` 處的 `total>0` 守衛與上述 `charge<=0 skip` 不變量配對——負電荷將需重思兩者。

`force()`（`BarnesHutQuadtree.ts:69`）為迭代堆疊遍歷（`BarnesHutQuadtree.ts:87` `ensureStack`），具 `distanceToCellSquared`（`BarnesHutQuadtree.ts:632`）供截斷預測試，以及 `BarnesHutQuadtree.ts:117` 處的精確近似測試。

### 5.2 分層碰撞網格

`applyGridCollisions`（`BarnesHutQuadtree.ts:172`）存在因為碰撞為與排斥*不同*的空間查詢（短距重疊而非長距場）。關鍵想法：

- **層指派**（`BarnesHutQuadtree.ts:206` `tier = floor(log2(radius))`，`BarnesHutQuadtree.ts:267` 處的單元 `4*2^tier`）— 均勻半徑收斂至一層，表現如舊的 `2·maxRadius` 網格；`BarnesHutQuadtree.ts:198` 處的 `cellSize < r_i+r_j` 界保證 3×3 探測找到每個重疊。
- **零半徑哨兵**（`BarnesHutQuadtree.ts:5` `ZERO_TIER = -0x40000000`，`BarnesHutQuadtree.ts:222` 桶）— 零半徑點永不擁有網格但仍作為對較大層的發起者碰撞。
- **按層計數排序**（`BarnesHutQuadtree.ts:240` 前綴和至 `collisionOrderOffsets`，`BarnesHutQuadtree.ts:248` 游標填充）— `O(N)` 且跨度安全：偏移表按*層跨度*而非點數定尺，因為 `f32` 半徑橫跨約 280 個 2 的冪次（`BarnesHutQuadtree.ts:237` 註解，`BarnesHutQuadtree.ts:587` `ensureCollisionOffsets`）。
- **去重的 3×3 探測**（`BarnesHutQuadtree.ts:349` `probeCollisionCell`）— 9 槽、線性探測雜湊 `imul(cellX,73856093)^imul(cellY,19349663)`（`BarnesHutQuadtree.ts:596`）、`BarnesHutQuadtree.ts:372` 處的重複單元過濾、配對一次規則（`BarnesHutQuadtree.ts:390` 處的 `sameTier && target<=source` 跳過；跨層無需跳過——每個較大層配對恰由其較小發起者造訪一次）。
- **份額感知的衝量**（`BarnesHutQuadtree.ts:406` `pinned?0:otherPinned?1:0.5`）— 鏡像彈簧份額但在兩者自由時箝制為一半（d3-force 使用半徑加權份額；`entry.ts:745` 處註解標記比較注意事項）。

3D 八元樹（`VectoForceLayout.ts:402`）在 3D 中鏡像此結構：`BarnesHutOctree.build` 將 AABB 立方化、具相同 `depth < 40` 守衛與對重合點的確定性 `jitterFor` 的 `insert`（`VectoForceLayout.ts:561`）、自底向上的 `finalizeMass`、具 `size² < theta²*d²` 與 `pointIndex` 識別跳過（`VectoForceLayout.ts:726`）而非距離零跳過的 `force`——重合的不同點被抖動分開且仍須施力。

## 6. 固定、再加熱、確定性

**固定為逐軸、按 ID 定址。** `ForceLayout2D` 按 `NodeId` 固定（`ForceLayout2D.ts:393` `pinNode(id,x,y)`，`ForceLayout2D.ts:413` `setNodePin({x?,y?})`，`ForceLayout2D.ts:436` `clearNodePin`），儲存 `fixedX/Y` + `pinnedX/Y`（`ForceLayout2D.ts:53`）；graph3d 的 `GraphLayout` 按*索引*固定（`GraphLayout.ts:46` `pinNode(nodeIndex,x,y,z)`，`VectoForceLayout.ts:337` `fx/fy/fz = NaN` 哨兵 vs `D3ForceLayout.ts:122` `fx/fy/fz = null`）。分歧記錄於 `ForceLayout2D.ts:387`——跨堆疊時轉換。`GraphNode` 上的初始 `fx/fy`（`types.ts:12`）於 `ForceLayout2D.ts:619` `addNode` 處作為預固定被尊重。

**再加熱僅升高 alpha 永不降低**（`ForceLayout2D.ts:450` `alpha = max(alpha, requested)`，`VectoForceLayout.ts:359` 同樣，`D3ForceLayout.ts:150` `alpha = max(alphaMin, min(1,alpha))`）。每個拓撲變更再加熱一次（`ForceLayout2D.ts:199`，`ForceLayout2D.ts:252`，`ForceLayout2D.ts:308`，`ForceLayout2D.ts:361` 條件）——呼叫者無需記憶。知識圖譜路徑在 `rebuildGraph` 後於 `KnowledgeGraphModel.ts:285` `layout?.reheat?.(0.5)` 明確再加熱，其本身於 `KnowledgeGraphModel.ts:356` 處呼叫 `layout?.setGraph`。

**確定性**為三重：具種子的 `mulberry32` 螺旋放置（`ForceLayout2D.ts:613` `radius=10*sqrt(i+1), angle=rand()*2π` / `VectoForceLayout.ts:143` `r=10*cbrt(i+1)` 球面）、經 `deterministicAngle`（`ForceLayout2D.ts:878` 自 `(source,target,seed)` 雜湊）與 `collisionPairAngle`（`BarnesHutQuadtree.ts:618` 具種子）的確定性重合角，以及跨 JS 與 Rust 相同的浮點選擇（上方 `Math.hypot` 陷阱）。

**冷卻**使用 `alphaDecay = 0.0228`（`≈ 1-0.001^(1/300)`，與 d3-force-3d 預設相同，`VectoForceLayout.ts:32` 註解）與 `alphaMin = 0.001`；`step()` 回傳 `alpha >= alphaMin` 作為「仍熱」（`ForceLayout2D.ts:375`），匹配 `GraphLayout` 契約（`GraphLayout.ts:26` 文件）。未處置的 `alpha=0` 永不冷卻——於建構時守衛。

## 7. 3D 家族與知識圖譜消費者

### 7.1 VectoForceLayout vs D3ForceLayout

兩者皆實作 `GraphLayout`（`GraphLayout.ts:12`——按 `GraphData.nodes` 順序的扁平 `Float32Array` xyz 三元組，可經 worker 轉移、由宿主驅動 `step()`）。差異：

- **模型：** `VectoForceLayout`（`VectoForceLayout.ts:50`）為*新*模型——Barnes-Hut 八元樹排斥（`VectoForceLayout.ts:402`）、連結彈簧、置中、速度衰減、alpha 冷卻——確定性且無依賴。`D3ForceLayout`（`D3ForceLayout.ts:25`）為 *d3-force-3d 轉接器*（`forceSimulation(…,3).force('link', forceLink).force('charge', forceManyBody).force('center', forceCenter)` 於 `D3ForceLayout.ts:88`），保持 `3d-force-graph` 的手感以利遷移。
- **狀態擁有權：** `VectoForceLayout` 保持 `positions/vx/vy/vz/fx/fy/fz/linkA/B` SoA（`VectoForceLayout.ts:87`）且永不變更呼叫者節點；`D3ForceLayout` 複製至 `simNodes: SimulationNode[]`（`D3ForceLayout.ts:71`）因為 d3 會變更它們。
- **固定：** 基於索引的 `fx/fy/fz` NaN vs `null` 哨兵；`VectoForceLayout.tick` 在積分前箝制（`VectoForceLayout.ts:308`），d3 的 `fx` 在其 tick 內做同樣的事。
- **Alpha：** `VectoForceLayout.reheat` 下限為 `alphaMin` 並上限為 `1`（`VectoForceLayout.ts:361`）；`D3ForceLayout.reheat` 直接寫入 `simulation.alpha()`（`D3ForceLayout.ts:151`）。

`FixedZLayout`（`knowledge-graph/src/FixedZLayout.ts:10`）包裝 `VectoForceLayout` 並在內部步進後將每個 `z` 箝制至常數，使 3D 布局無需更換引擎即可驅動 2D 知識圖譜視圖。`KnowledgeGraphSession`（`knowledge-graph/src/KnowledgeGraphSession.ts:59` 文件「會話僅鏡像」）在第 117 行建構 `VectoForceLayout({theta:0.9})` 並將 `setGraph`/`reheat` 委派至 `KnowledgeGraphModel`。

### 7.2 KnowledgeGraphModel — 增量消費者

`KnowledgeGraphModel`（`knowledge-graph/src/KnowledgeGraphModel.ts:62`）擁有已具體化的切面（`entities`、`facts`、`factKeys`、`expansions`）且為其借用 `GraphLayout` 的**單一驅動器**（`KnowledgeGraphModel.ts:43` 文件：每 `rebuildGraph` 一次 `setGraph`，每 `expand` 一次 `reheat`）。在 `expand(id)`（`KnowledgeGraphModel.ts:127`）上，它以 `AbortSignal` 取消經 `KgDataSource.getNeighbors` 分頁（`KnowledgeGraphModel.ts:148` 共用 promise 去重，`KnowledgeGraphModel.ts:150` `cancelExpand`）、攝入實體/事實、按*批次*事實數（而非淨新增，因此重疊鄰域不使進度停滯——`KnowledgeGraphModel.ts:273` 處註解）推進 `loaded`、呼叫 `rebuildGraph()`（`KnowledgeGraphModel.ts:332` 擷取位置、合併穩定 `entityOrder`、自 `lastPositions` 播種新節點、寫入 `GraphData` 並呼叫 `layout?.setGraph`）、再加熱（`KnowledgeGraphModel.ts:285`）並記錄 `ExpansionState`（`KnowledgeGraphModel.ts:7`）。`dispose()`（`KnowledgeGraphModel.ts:225`）刻意*不*處置借用的布局——會話仍可能共用它。

### 7.3 WASM — 不可見的力核心

`crates/vectojs-force-rs`（`crates/vectojs-force-rs/Cargo.toml:6`「不可見後端；TypeScript 路徑為永久備援」）以 Rust 鏡像 `BarnesHutOctree`：`Octree`（`lib.rs:47`）、`jitter_for`（`lib.rs:83`）、`build`/`insert`/`place_child`/`finalize_mass`/`force`（`lib.rs:194` / `lib.rs:401`）、匯出 `force_init`/`force_pos`/`force_accel`/`force_step`（`lib.rs:457` / `lib.rs:484` / `lib.rs:491` / `lib.rs:503`），具 `STATUS_OK/CAPACITY/UNINITIALIZED/OVERFLOW`（`lib.rs:31`）。範圍為*僅建構 + 力累積*（`lib.rs:10` 註解——該階段為 3D tick 的 78–90%，`VectoForceLayout.ts:240` 階段分割）——連結彈簧、置中、積分留在 JS tick，因此接縫為每 tick 一次 `Float32Array.set` 收集與一次 `Float64Array` 讀回。

載入器（`packages/graph3d/src/wasm/force-backend.ts:42` `ForceBackend`）以串流提取並退回 `arrayBuffer`（`force-backend.ts:104` `instantiateStreaming`）、`ensure`/`force_init` 增長（`force-backend.ts:52`）、`step` 收集 + `force_step` + 陳舊視圖刷新（`force-backend.ts:65` + `force-backend.ts:37` `viewsStale`——八元樹可在步進中增長線性記憶體、分離視圖）執行。任何點的失敗皆回傳 `null`，呼叫者保持 JS 八元樹（`VectoForceLayout.ts:106` / `VectoForceLayout.ts:246` 退回至 `this.tree.build` + `this.tree.force`；資源 URL 為 `packages/graph3d/src/wasm/asset.ts:22` `forceWasmUrl` 經 `new URL('./vectojs_force.wasm', import.meta.url)`——唯一對打包器安全的形態）。`.wasm` 被 git 忽略並經 `tsup.config.ts:40` 於發布時複製，恰如 `vectojs-core-rs`。

位元一致性不容妥協：Rust 樹必須計算與 JS 樹相同的 `f64` 質心與 `f64` 排斥積分（位置與速度在兩側皆保持 `f32`）。`VectoForceLayout.ts:58` 明確說明：「未來的 Rust/WASM 核心 … 因此必須精確重現 f64 累積。」測試對兩條路徑位元一致地差分測試（見 `packages/graph3d/test/VectoForceLayout.wasm.test.ts:6` 串流/同步啟用與 `VectoForceLayout.ts:618` 處的間隔副本）。

建構與 Boss 08 的陷阱相同：具 `RUSTFLAGS="-C target-cpu=generic -C target-feature=+simd128 -C linker=rust-lld"` 的 `crates/vectojs-force-rs/build.sh`；裸 `cargo build --target wasm32-unknown-unknown` 洩漏 `~/.cargo/config.toml` 主機旗標並破壞連結。

## 8. 基準方法論 — 何者可被引用

`benchmarks/graph-layout/entry.ts:1` 表頭為權威。僅 `benchmarks/run-browsers.sh`（於 `benchmarks/run-browsers.sh:4` 的 `bun runner/cli.ts` 包裝器）產生可引用數據——它驅動**真實有頭瀏覽器於專用 Hyprland 工作區、聚焦視窗、真實 GPU**（依工作區 `AGENTS.md` 基準契約）。`benchmarks/debug-page.ts` 與 `scripts/benchmark.ts` 為無頭（`--disable-gpu`）——回歸絆線與除錯輔助，而非引用。

### 8.1 矩陣、預算與穩定含義

**預算化預設**（CTX-0517，2026-08-26 — `entry.ts:4`）為：

- `COUNTS = 100,1000,3000`（`entry.ts:48`——捨棄 500 作為 1000 的對數鄰居；3000 保留為 `#559` 基線）
- `TICKS = 30` 規則每 tick 樣本（`entry.ts:49`）
- `TRIALS = 3`（`entry.ts:50`——`#559` 基線協定；經 `run-browsers.sh --iterations` 的套件層級重複）
- `SETTLE_CAP = 120`（`entry.ts:51`——前 120 個附加後 tick，而非約 285–300 tick 的自然收斂；`settleCappedTrials == TRIALS` 依設計，依 2026-08-25 掃描）
- `APPEND_NODES = 50`（`entry.ts:57`）、`WARMUP_TICKS = 5`（`entry.ts:58`）、`POST_TOPOLOGY_ALPHA = 1`（`entry.ts:59`）

**舊預設**（`counts 100,500,1000,3000 × 2 workloads × 4 arms × 6 trials × cap 500`）預估 >1500 秒/引擎，因為每個穩定 tick 支付約 4 ms 經計時器箝制的 `setTimeout(0)` 讓步（`entry.ts:301` `yieldToPaint`），穩定執行至約 300 tick——現每封套約 150 秒無頭 Chrome（`entry.ts:25`）。

**工作負載**為 `star-hub` 與 `mixed-sparse`（`entry.ts:61`），圖形建構於 `entry.ts:226` / `entry.ts:252`（位置播種於 `sqrt` 螺旋以避免堆疊），附加酬載新增 50 節點 + 樞紐或偏好+隨機連結。

**分支**為四個（`entry.ts:599`）：

| 分支              | 維度 | 實作               | `appendMode`       | 建構                                                                                                                                                                                                                              |
| ----------------- | ---- | ------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `d3-force-3d`     | 3    | `D3ForceLayout`    | `setGraph-rebuild` | `new D3ForceLayout()`                                                                                                                                                                                                             |
| `vecto-force`     | 3    | `VectoForceLayout` | `setGraph-rebuild` | `new VectoForceLayout()`                                                                                                                                                                                                          |
| `d3-force-2d`     | 2    | 頁內 d3-force      | `appendGraph`      | `entry.ts:78` 處的 `D3Force2DLayout`（charge `300`，`distanceMax 450`，`theta 0.9`，collide `radius+14`）                                                                                                                         |
| `force-layout-2d` | 2    | `ForceLayout2D`    | `appendGraph`      | `entry.ts:625` 處的 `new ForceLayout2D({repulsion: charge, collisionRadius: radius+14, linkDistance 存取器, linkStrength 0.42, center 0.016, velocityDecay 0.64, alphaDecay 0.024, repulsionDistanceMax 450, theta 0.9, seed 7})` |

分支順序按 `(workloadIndex, countIndex)` **確定性輪替**（`entry.ts:647` `rotatedArms`），因此引擎/代理排序無法偏置計數。

### 8.2 度量什麼

每分支/工作負載/計數三個可觀測值，皆位於 `performance.now()` 與 `setTimeout(0)` 任務邊界後，使長任務條目不合併（`entry.ts:330` 經 `PerformanceObserver 'longtask'` 的 `captureLongTasks`）：

- **`benchTicks`**（`entry.ts:501`）— 來自全新再加熱圖的 `TICKS` 次規則 `step()` 呼叫：`median/p95/max`（`entry.ts:292` 經 `_shared/stats.ts` 的 `median`/`percentile` 的 `summarize`）。
- **`benchAppend`**（`entry.ts:526`）— 僅拓撲變更（於 `entry.ts:346` `prepareAppendPayloads` 預建的複製酬載，因此複製永不偏好 `appendGraph`）；然後在每個首次附加後 tick 與每個穩定迴圈前明確 `reheat(POST_TOPOLOGY_ALPHA)`（`entry.ts:559`）。回傳 `append` median/p95、`firstTick` median/p95、`settleTotal` median/p95 於高達 `SETTLE_CAP` tick、`settleTicks` median/p95、`settleCappedTrials` 與 `maxStepMs`（跨所有階段的最大單次 `step()`，`entry.ts:679`）。
- **`observeLiveAppendMemory`**（`entry.ts:398`）— 一個專用已加熱的即時布局，在立即的前後讀數間保持，酬載建立與處置於差值*之外*（`entry.ts:415` 註解）。偏好 `performance.measureUserAgentSpecificMemory`（`entry.ts:444`，以 `entry.ts:55` 處的 `UA_MEMORY_TIMEOUT_MS = 1250` 經 `entry.ts:353` `readUaMemoryWithTimeout` 限制）；單次逾時失敗為該執行停用後續 UA 讀取（`entry.ts:454` `uaMemoryDisabledReason`）；以堆積備援（`entry.ts:465` 處的 `performance.memory.usedJSHeapSize`）以全新布局重試完整觀測。兩者皆為**吵雜觀測而非保留記憶體或後端選擇證據**（`entry.ts:740` 注意事項）。不支援者回報為 `status: 'unsupported'` 並附原因。

亦回報：每長任務擷取的 `longTaskMaxDurationMs`（`entry.ts:678`），僅當 `longtask` 區間涵蓋已度量的 `[started,ended]`（`entry.ts:326` `include`）時計數。

### 8.3 有頭執行器契約

於 2026-08-02 度量，240 Hz 面板為 Hyprland `eDP-1 2560x1600` 縮放 1.6。三個節奏陷阱靜默使任何數據失效：未聚焦的 Chrome 降至約 60 Hz，Firefox 需要 `layout.frame_rate` 且即使聚焦時預設亦為 60 Hz（手動驅動的 Firefox 誤差 4 倍），`refreshHz` 恰為 250 為 240 Hz 面板上的中位數假象。harness（`benchmarks/_shared/server.ts`、`runner.ts`、`loaf.ts`）執行 `validateEnvironment`、飢餓偵測、跨執行聚合，並攜帶提交 + 主機 CPU/GPU/driver（頁面無法看到這些）。每個基準僅擁有 `entry.ts` + 三行 `build.ts`（`benchmarks/graph-layout/build.ts:11` 委派至 `_shared/build.ts`）；伺服器/打包器位於 `_shared/`——勿重複它們。

**永不硬編碼更新率** — 呼叫 `calibrateRefreshRate()` 並在任何逐影格數據旁回報 `refreshHz`。引用兩個引擎（V8 與 SpiderMonkey 分歧）。

### 8.4 基線快照

在 500 節點的**完整 N=7 基線**（`benchmarks/graph-layout/README.md:44`，執行 `20260820T135641Z-1a6d54`，Chrome `240.04 Hz` / Firefox `240.64 Hz`）為在有頭預算下最後完全迭代的完整矩陣（1000 節點與 3000 節點的完整矩陣於 `entry.ts` 預設下逾時——見 `README.md:11` 與 `README.md:28`）。代表性穩定中位數（500 節點，`TICKS 30`，`TRIALS 1`，`SETTLE_CAP 500`，兩個工作負載）位於該 README；上述縮減的預算化預設為每引擎成本（約 150 秒）取代它。將結果保留於 `benchmarks/graph-layout/results/`（被 git 忽略），並以執行器的歷史 ID 識別執行，而非複製行。

## 9. d3-force 遷移、互動與剔除

**自 d3-force**（`d3-force`/`d3-force-3d`）遷移至 `ForceLayout2D`/`VectoForceLayout` 非重新命名。`benchmarks/graph-layout/entry.ts:745` 處的基準注意事項具承載力：「2D 列 … 比較不同力定律：`ForceLayout2D` 使用反平方排斥與相等自由/自由碰撞份額；`d3-force` 使用反距離排斥與半徑平方碰撞份額。將比值視為實作層級工作負載比較，而非等式等效的核心度量。」

需轉譯的具體差異：

- **排斥定律：** `ForceLayout2D` 為 `−charge / d³ * (dx,dy)`（`BarnesHutQuadtree.ts:134` `factor = -charge*invD/d²`），即力大小上的反平方；d3 的 `forceManyBody` 為反距離（`strength / d`）。絕對數值不可比較——重調 `repulsion`/`chargeStrength` 而非複製它們。
- **截斷語意：** `ForceLayout2D` 對聚合的電荷中心測試 `repulsionDistanceMax`（`BarnesHutQuadtree.ts:98` `nearestDistanceSquared` + `maxDistanceSquared` 預測試），匹配 d3 的多體截斷；具 `theta: 0` 時截斷對每點精確（`types.ts:59` 文件）。`Infinity`/非有限停用它——`0` 經提前回傳*靜默*停用，因此 `ForceLayout2D.ts:91` 處的 `finiteOr` 將任何非正映射至 `Infinity`。
- **連結識別：** `ForceLayout2D` 經 `linkIdentity`（`ForceLayout2D.ts:826`）對有向 `(source,target,id)` 去重，並在變更前對懸空/自我連結拋出；d3 在連結物件上保留原始字串 id，編輯器的 `duplicate-link` 守衛甚至更嚴格（`ForceLayout2D.ts:387` 處的分歧註記）。遷移持久化圖時，先正規化 `id` 欄位。
- **固定定址：** 涵蓋於 §6——`ForceLayout2D` 按 `NodeId`，graph3d 的 `GraphLayout` 按索引。擷取索引的拖曳至固定處理器必須在 2D 側的 `removeNodes` 後重解析。
- **Theta：** 範圍與效果相同——`0` = 精確 `O(N²)`，越大越快/越鬆（`types.ts:57`，`VectoForceLayout.ts:28`）。預設 `0.9` 調校為跨堆疊感覺相似，但四元樹與八元樹間非位元相同。

**互動與可見性**位於物理 tick 之外，但在規模上昂貴。`packages/graph3d/src/GraphInteraction.ts:1`（`GraphInteraction`）將 Three.js raycaster 命中映射至 `nodeIndex` 供懸停/選取/拖曳固定，並執行常見的懸停去抖；`Graph3D.ts:1`（`Graph3D`）實例化渲染圖形並剔除螢幕外者。兩者皆不取代布局——它們在 `step()` 後消費 `positions`。在 3000 節點時渲染器而非布局常為影格瓶頸（`benchmarks/graph3d-frame/entry.ts:1` 影格成本 harness vs `benchmarks/graph-layout/entry.ts:1` 物理矩陣——保持兩個 harness 區分）。對畫布 `Scene` 宿主（非 Three.js），`packages/core/src/tree/Scene.ts:1` 剔除做相同工作；graph-layout 本身永不剔除。

## 10. 調校與陷阱

固定按堆疊而異（`ForceLayout2D` 按 ID，graph3d 按索引——`ForceLayout2D.ts:387`）；移植時轉換。`repulsionDistanceMax = 0` 完全停用排斥（`BarnesHutQuadtree.ts:77` 提前回傳）——非有限為預期「無截斷」（`ForceLayout2D.ts:91`）。`alphaDecay = 0` 退回 `0.0228` 否則穩定迴圈永不終止（`ForceLayout2D.ts:95`）。非有限或主機洩漏的 `RUSTFLAGS` 破壞 WASM 建構或其位元一致性（調校 CPU 上的 `fma`，`crates/vectojs-force-rs/build.sh:8`）；使用 `just wasm`。層跨度定尺錯誤（`BarnesHutQuadtree.ts:237`）——按點數而非層跨度定尺偏移表——當半徑橫跨 `f32` 的約 280 層時靜默丟棄計數排序增量。`force_init` 增長後的視圖分離（`force-backend.ts:37` `viewsStale`）必須在每次 `force_step` 後重驗證型別化陣列視圖。

研究期間發現的額外地雷：

- **2D 中負排斥被箝制而非支援。** `ForceLayout2D` 在 `ForceLayout2D.ts:629`/`ForceLayout2D.ts:761` 處將 `repulsion` 箝制至 `>=0`，`BarnesHutQuadtree.ts:109` 跳過 `charge<=0` 子樹——`BarnesHutQuadtree.ts:507` 處的 `finalize` 守衛否則會對具吸引力的節點錯置電荷中心。D3 的負（吸引）電荷在此無等同；允許它前重訪兩個守衛。
- **連結 `id` vs 端點定址。** `removeLinks` 僅當出現裸 `LinkId` 時才惰性建構 `linksByIdKey` 映射（`ForceLayout2D.ts:270`），取代先前每項 `O(items×L)` 掃描。傳遞具與儲存不同 `id` 的完整 `GraphLink` 物件將不匹配——識別為序列化的三元組而非物件識別。
- **`positions` 視圖別名。** `refreshPositionView` 回傳同一 `ArrayBuffer` 上的 `subarray`（`ForceLayout2D.ts:749`）。跨 `ensureNodeCapacity` 或 `removeNodes`（於 `ForceLayout2D.ts:857` 處 `resize` 緩衝）持有參考會留下長度為 0 的分離視圖。每次變更後重讀 `layout.positions`。
- **尚無 `forge/baselines/graph-layout*`。** `benchmarks/graph-layout/results/` 被 git 忽略，尚無簽入的 `forge/baselines/graph-layout.json`——§8 中每個主張必須在引用主機上重度量。`benchmarks/graph-layout/README.md:44` 中 500 節點 N=7 發現為主機特定快照，而非可攜基線檔。
- **`crates/vectojs-force-rs` 恰有一個建構產物。** `build.sh` 發射 `packages/graph3d/src/wasm/vectojs_force.wasm`，`tsup` 將其複製至 `dist/wasm/`（`packages/graph3d/tsup.config.ts:40`）。永無第二 crate 或共用 WASM 套件——直至第三個消費者出現（`force-backend.ts:12` 處的 `DEC-0081`），保持其本地。
- **差分 oracle 紀律。** 3D 路徑的 `VectoForceLayout` JS 八元樹為*永久* oracle；`crates/vectojs-force-rs/src/lib.rs:1` 處的 Rust 核心必須在 `f64` 累積上保持位元相同（兩側位置 `f32`）。跨 `VectoForceLayout.ts:606`、`BarnesHutQuadtree.ts:610`、`lib.rs:83` 搜尋 `jitter_for`/`jitterFor`/`mulberry32`——對其一的任何變更未落於另一即為差分失敗。`measurePhases` 選擇加入（`VectoForceLayout.ts:45`）使 oracle 可度量而無需在正式環境支付 `performance.now()`。

新增力時，先撰寫 JS oracle（`VectoForceLayout.ts:232` `tick` 結構），保持運算順序與 `Math.min`/`Math.max` NaN 語意（見 `BarnesHutQuadtree.ts:632` `distanceToCellSquared` 全序註解），並將 WASM 路徑以 `measurePhases`（`VectoForceLayout.ts:45` 選擇加入 `tickPhases: [octree, force, link, integrate]` 牆鐘毫秒）門控，使熱路徑在分析關閉時無需付出。

## 11. 測試、差分 oracle 與實際如何破壞

三個測試套件涵蓋 2D 側（`packages/graph-layout/test/BarnesHutQuadtree.test.ts:1` 四元樹近似 vs 精確，`packages/graph-layout/test/ForceLayout2D.test.ts:1` `setGraph`/`appendGraph`/`removeNodes`/`removeLinks`/`updateLinks`/固定/alpha，`packages/graph-layout/test/ForceLayout2D.linkMutations.test.ts:1` 去重/度數偏置/連結份額）。3D 側加上 `packages/graph3d/test/VectoForceLayout.wasm.test.ts:1`（JS vs WASM 位元一致性：串流、同步、在 `VectoForceLayout.wasm.test.ts:123` `file:///nonexistent` → `false` 的錯誤 URL 上備援）。

它們所守衛與先前曾困擾者——將這些作為審查檢查清單閱讀：

- **建構前淨化。** 留於 `positionStorage` 的 `NaN` 位置毒害四元樹邊界（`minX = NaN` → `size = NaN`）。`ForceLayout2D.ts:752` 處的 `sanitizeState` `toF32`+固定覆寫因曾以來自解構 JSON 的呼叫者提供的 `x: NaN` 發生一次而存在。永不移除該迴圈。
- **零距離下限。** 無 `BarnesHutQuadtree.ts:132`/`BarnesHutQuadtree.ts:154` 與 `VectoForceLayout.ts:727` 處的 `1e-6` 下限，同一單元中的兩個重合點產生 `factor = -m/0 = ±Infinity` → `NaN` 速度，感染每個後續 tick。`BarnesHutQuadtree.ts:610`/`ForceLayout2D.ts:878` 處的確定性角度使推動可重現。
- **固定份額洩漏。** 當一端點被固定時忘記 `springShare` 備援（`ForceLayout2D.ts:846` / `BarnesHutQuadtree.ts:406` 中固定為 `0` 或 `1`）使固定節點被另一端點的速度拖曳。歷史：早期 3D 固定因連結彈簧仍積分固定座標而抖動。
- **Alpha 永不達最小值。** 傳遞 `alphaDecay: 0` 使 `alpha` 永遠保持 `1`——宿主迴圈 `while(layout.step())` 永不終止。`ForceLayout2D.ts:95` / `VectoForceLayout.ts:117` 處將 `0` → `0.0228` 的守衛源自計算選項產生 `0` 的即時事件。
- **記憶體觀測誤讀。** `entry.ts:398` 中的 `liveAppendMemoryObservation` 數值為具 GC 雜訊的*全代理*觀測（`entry.ts:449` 注意事項）；將其視為每後端保留堆積為圖形基準最常見的誤引。執行亦在一次逾時後停用 UA 特定讀取（`entry.ts:454`）並以 `usedJSHeapSize` 重試——比較在矩陣中途切換來源的執行與未切換者無效。

供審查者的複雜度摘要：

| 階段         | 2D                                                  | 3D                                     | 位置                                                  |
| ------------ | --------------------------------------------------- | -------------------------------------- | ----------------------------------------------------- |
| 樹建構       | `O(N log N)` 四元樹                                 | `O(N log N)` 八元樹                    | `BarnesHutQuadtree.ts:36` / `VectoForceLayout.ts:414` |
| 排斥         | `O(N log N)` 平均，`theta=0` 時 `O(N²)` 最差        | 相同                                   | `ForceLayout2D.ts:484` / `VectoForceLayout.ts:259`    |
| 連結         | `O(L)`                                              | `O(L)`                                 | `ForceLayout2D.ts:499` / `VectoForceLayout.ts:274`    |
| 碰撞         | `O(N)` 平均經分層網格；無分層時在偏斜半徑上 `O(N²)` | —                                      | `BarnesHutQuadtree.ts:172`                            |
| 每布局記憶體 | `~6×N` f32 + 連結 + 樹約 `4N` 節點                  | `~7×N` f32 + 連結 + 八元樹約 `8N` 節點 | `ForceLayout2D.ts:672` / `VectoForceLayout.ts:445`    |

## 12. 可重現性 — 可引用指令

```bash
# 建構 WASM 力核心（任何 WASM 路徑前需要）：
just wasm                         # 或 crates/vectojs-force-rs/build.sh
# 可選：僅驗證 JS oracle（無需 Rust）：
just test-pkg graph-layout && just test-pkg graph3d

# 有頭物理矩陣 — 可引用路徑（需要 Hyprland + 有頭 Chrome/Firefox）：
./benchmarks/run-browsers.sh graph-layout 8272 --viewport 1280x720 \
  --param counts=100,1000,3000 --param ticks=30 --param trials=3 \
  --param settleCap=120 chrome firefox
# 完整收斂變體（重現舊 500-tick 穩定，明確預算）：
./benchmarks/run-browsers.sh graph-layout 8273 --viewport 1280x720 \
  --param counts=100,500,1000,3000 --param ticks=30 --param trials=6 \
  --param settleCap=500 chrome firefox   # 預期 >1500 秒 — 相應預算

# 3D 影格成本（渲染器而非物理 — 勿混淆）：
./benchmarks/run-browsers.sh graph3d-frame 8274 --viewport 1280x720 chrome firefox
```

自 `calibrateRefreshRate()` 回報 `refreshHz`、兩個引擎、提交 SHA 與主機 CPU/GPU/driver（頁面無法看到這些——`benchmarks/_shared/server.ts:1` 處的 harness 擷取它們）。將原始 JSON 保留於 `benchmarks/graph-layout/results/`（被 git 忽略）並引用其歷史 ID，而非貼上中位數。

## 附錄 — 接下來該讀什麼

| 目標                   | 起點                                                                               | 接著                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 為新資料集調校 2D 布局 | `packages/graph-layout/src/types.ts:42` + `ForceLayout2D.ts:79` 建構子預設         | `ForceLayout2D.ts:480` tick 階段 → `BarnesHutQuadtree.ts:8` 索引      |
| 新增力（例如徑向）     | `VectoForceLayout.ts:232` `tick` 結構作為範本                                      | `crates/vectojs-force-rs/src/lib.rs:10` 範圍註記 — 僅八元樹力屬於核心 |
| 分頁知識圖譜           | `knowledge-graph/src/KnowledgeGraphModel.ts:62` 生命週期                           | 若需 3D 布局的 2D 投影則 `FixedZLayout.ts:10`                         |
| 引用數據               | `benchmarks/graph-layout/entry.ts:1` 表頭 + `benchmarks/graph-layout/README.md:44` | `benchmarks/_shared/stats.ts:1` 供 `median`/`percentile` 語意         |

---

*接下來：**Boss 12 — DevTools**（讓你指向像素並讀回哪個實體擁有它、為何的執行期檢視器）。返回：**Boss 10 — 影片匯出**（確定性固定步進擷取）。系列：00 Overview → 01 Selection → … → 11 Graph Layout（本文件）→ 12 DevTools → 99 Synthesis.*
