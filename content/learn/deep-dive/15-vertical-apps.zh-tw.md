+++
title = "15 — 垂直應用 — 知識圖譜、節點編輯器、桌面與表格"
description = "垂直套件如何組合引擎原語 — 知識圖譜於 graph3d/力布局之上、節點編輯器的指令與歷史、桌面視窗管理與表格虛擬化 — 以及應用陷阱與引擎缺陷的差異所在。"
weight = 35
+++

# 15 — 垂直應用 — 知識圖譜、節點編輯器、桌面與表格

> 引擎原語在隔離時正確；垂直應用證明它們在分頁、復原、視窗化與 10 萬列壓力下仍能組合。僅在 10 列時有效的表格、展開時瞬移的圖譜或洩漏其覆蓋層 a11y 鏡像的視窗，皆為應用層組合錯誤，而非物理或渲染器錯誤——而 forge 將它們分開正是為此。

- **你將學到**：四個垂直領域如何組合穩定的原語 — `KnowledgeGraphModel` 於 `GraphLayout`/`Graph3D` 之上、`NodeEditor` 於 `CommandHistory`/`SelectionState`/`layoutDocument` 之上、`DesktopShell`/`WindowManager`/`DesktopWindow` 於 `Scene` 覆蓋層之上，以及 `Table` 於 `Text` + `GridCellHotspot` 虛擬化之上 — 包含使增量增長低成本、拆解乾淨的每個檔案邊界與擁有權規則。
- **你不會學到**：`ForceLayout2D`/`VectoForceLayout` 內部的物理（Boss 11）、VMT dirty 生命週期（Boss 06）或渲染器/DPR 契約（Boss 07）。本文件展示應用如何*消費*那些引擎，而非引擎如何計算。

## 1. 知識圖譜 — 覆於 3D 之上的分頁切面

### 1.1 資料契約

`KgEntity extends GraphNode` 於 `packages/knowledge-graph/src/types.ts:19`，`KgFact extends GraphLink` 於 `types.ts:31`，使相同物件可直接流入 `@vectojs/graph3d` 的布局與渲染器，領域欄位（`type`、`labels: LabelMap`、`predicate`、`confidence`、`provenance`）保持不動。`KgDataSource` 於 `types.ts:54` 為惰性接縫：`getNodes(ids?)` 供種子，`getNeighbors(id, { limit, cursor, direction, signal })` 於 `types.ts:58` 供分頁跳躍。`KgNeighborhood` 於 `types.ts:68` 攜帶 `facts`、`neighbors`、`nextCursor`/`hasMore` 與可選的 `entity` — 缺席表示「未知 id」且必須失敗而非偽造（見 §1.3）。

`LabelMap` 於 `types.ts:12` 為 `Record<languageTag, string>`，以 `''` 為後備；`pickLabel` 於 `types.ts:87` 偏好請求的語言，然後 `''`，再 `en/zh/…`，最後任意鍵。`KgGraphData` 於 `types.ts:43` 為經轉接器具體化後的記憶體快照。

`MemoryDataSource` 於 `packages/knowledge-graph/src/MemoryDataSource.ts:15` 為測試/小型圖譜轉接器：按兩端點索引事實（`MemoryDataSource.ts:17` 處的 `out`/`inn`），使 `getNeighbors` 為 `O(degree)`，在 `'both'` 中去重自迴圈（`MemoryDataSource.ts:71`），並將游標版本化為 `"<version>:<offset>"`（`MemoryDataSource.ts:108`）— `MemoryDataSource.ts:26` 處的 `load()` 遞增 `version`，使飛行中的游標大聲失敗而非對已變更列表切片（`MemoryDataSource.ts:125`）。

`rdf.ts:11` 經 `n3` 的 `Parser` 提供 `parseRdfTurtle(text)`：主語成為實體，`rdf:type` 設定 `type`（最後者勝，`rdf.ts:51`），`rdfs:label`/`skos:prefLabel`/`schema:name` 填充 `labels`（`rdf.ts:56`），其他物件 IRI 三元組成為 `KgFact`（`rdf.ts:62`），每個實體皆取得 `''` 後備（`rdf.ts:74`）。同步的 `Parser.parse` — 不適用於主執行緒上數百 MB 的場景（`rdf.ts:24` 文件）。

### 1.2 FixedZLayout — 無需分支的 2D 投影

`FixedZLayout` 於 `packages/knowledge-graph/src/FixedZLayout.ts:22` 包裝 `VectoForceLayout`，在每次 `step()`（`FixedZLayout.ts:49`）與 `setGraph`（`FixedZLayout.ts:37`）後將每個 `z` 箝制至常數。內部模擬仍作為 3D Barnes-Hut 八元樹執行；`pinNode` 以 `z ?? this.z` 委派（`FixedZLayout.ts:56`），`sanitize()` 於 `FixedZLayout.ts:85` 將非有限的 `x/y` 重播種至 `cbrt` 螺旋。固定契約與 `ForceLayout2D`（按 ID 定址）分歧：`FixedZLayout` 如 `GraphLayout`（`GraphLayout.ts:46`）按索引固定，註記於 `FixedZLayout.ts:18`。

### 1.3 KnowledgeGraphModel — 單一布局驅動器

`KnowledgeGraphModel` 於 `packages/knowledge-graph/src/KnowledgeGraphModel.ts:62` 與渲染器無關並擁有分頁切面：`entities`/`facts`/`factKeys`/`expansions`/`requests`/`entityOrder`/`lastPositions`（`KnowledgeGraphModel.ts:69`）。它是其借用 `GraphLayout` 的**單一驅動器**（`KnowledgeGraphModel.ts:43` 文件：每 `rebuildGraph` 一次 `setGraph`，每 `expand` 一次 `reheat`）。建構時接受 `source`、可選的借用 `layout`、`pageSize`、`direction`、`lang`（`KnowledgeGraphModel.ts:39`）。

- `bootstrap(focusIds, expandSeeds)` 於 `KnowledgeGraphModel.ts:114` 經 `getNodes` 取種子、`ingestEntities`、`rebuildGraph()`，然後對每個種子 `expand`。
- `expand(id)` 於 `KnowledgeGraphModel.ts:127` 按 id 共用 promise（`KnowledgeGraphModel.ts:134`），在 `complete` 上短路（`KnowledgeGraphModel.ts:136`），標記 `loading`（`KnowledgeGraphModel.ts:144`），然後 `loadPage`（`KnowledgeGraphModel.ts:240`）。
- `loadPage` 經具 `AbortSignal` 的 `source.getNeighbors` 分頁（`KnowledgeGraphModel.ts:246`），若 `page.entity` 缺失則大聲失敗（`KnowledgeGraphModel.ts:259` — 永不攝入佔位符 `'Unknown'` 節點）、攝入實體/事實、按**批次** `page.facts.length` 而非淨新增推進 `loaded`（`KnowledgeGraphModel.ts:273`）、記錄 `ExpansionState`（`KnowledgeGraphModel.ts:275`）、`rebuildGraph()` + `layout?.reheat(0.5)`（`KnowledgeGraphModel.ts:285`）。
- `cancelExpand` 於 `KnowledgeGraphModel.ts:150` 經 `AbortController` 中止並標記 `cancelled`。
- `rebuildGraph()` 於 `KnowledgeGraphModel.ts:332` 擷取布局位置、合併穩定的 `entityOrder`、自 `lastPositions` 播種新節點、以 `pickLabel` 建構 `GraphData` 並呼叫 `layout?.setGraph`。
- `dispose()` 於 `KnowledgeGraphModel.ts:225` 刻意**不**處置借用的布局 — 會話仍可能共用它（`KnowledgeGraphModel.ts:230` 註解）。

`KnowledgeGraphModel.ts:23` 處的快照契約為 `{ version:1, entities, facts, expansions }`；`exportSnapshot`/`importSnapshot` 經 `lastPositions` 保留位置並遞增修訂以中止陳舊請求（`KnowledgeGraphModel.ts:190`）。

### 1.4 Graph3D + GraphLayout — 渲染接縫

`GraphLayout` 於 `packages/graph3d/src/layout/GraphLayout.ts:12` 為最小且對 worker 友善的契約：`setGraph(data)`、`step(iterations) -> boolean` 活躍/熱（`GraphLayout.ts:28` 文件）、按 `GraphData` 節點順序的扁平 `Float32Array` xyz 三元組 `positions`（`GraphLayout.ts:35`）、可選的按索引 `pinNode`/`unpinNode`/`reheat`。`Graph3D` 於 `packages/graph3d/src/Graph3D.ts:28` 無論大小皆為兩次繪製呼叫：一個 `InstancedMesh`（`Graph3D.ts:115`）具 `∛val` 半徑縮放（`Graph3D.ts:104`）、一個 `LineSegments`（`Graph3D.ts:136`）。`setGraphData` 在附加前驗證端點（`Graph3D.ts:73`），`applyPositions` 於 `Graph3D.ts:149` 寫入矩陣、行內追蹤邊界（避免 `computeBoundingSphere` 成本 — `Graph3D.ts:178` 度量 60–78%）並對過短陣列警告一次（`Graph3D.ts:162`）。

### 1.5 KnowledgeGraphSession — 連接

`KnowledgeGraphSession` 於 `packages/knowledge-graph/src/KnowledgeGraphSession.ts:67` 擁有 `model`、`graph: Graph3D`、`camera: GraphCamera`、`layout: GraphLayout` 與 `interaction: GraphInteraction`。`KnowledgeGraphSession.ts:92` 處的建構子建立 `Graph3D`、`GraphCamera`（模式為會話的 `mode`）以及對 `'2d'` 為 `FixedZLayout`（`KnowledgeGraphSession.ts:109` 處 `z:0, repulsion 120, linkDistance 55`）否則為 `VectoForceLayout`。模型以借用的布局 + `lang` 建構（`KnowledgeGraphSession.ts:120`）。互動以 `camera: () => camera.camera` 連接使模式切換保持即時（`KnowledgeGraphSession.ts:129`），`handleSelect`/`handleHover` 路由至索引對齊的 `entityByIndex`（`KnowledgeGraphSession.ts:87`）。

- `bootstrap` 於 `KnowledgeGraphSession.ts:182` 等待 `model.bootstrap`，若在飛行中被處置則中止（`KnowledgeGraphSession.ts:189`），然後 `syncFromModel()` + `camera.fitToPositions`。
- `syncFromModel()` 於 `KnowledgeGraphSession.ts:287` 將 `model.getGraphData()` 鏡像至 `graph.setGraphData`/`applyPositions` 與 `interaction.setNodeCount`。
- `tick(iterations)` 於 `KnowledgeGraphSession.ts:242` 步進布局，僅在穩定時擷取布局位置（`KnowledgeGraphSession.ts:250` — 熱影格不被快取）、套用至渲染器。`tick` 回傳已穩定（`!stillHot`），匹配 `if (!tick()) rAF`。
- `expand` 於 `KnowledgeGraphSession.ts:219` 委派至模型、鏡像並觸發 `onExpand`。
- `expandInBackground` 於 `KnowledgeGraphSession.ts:332` 按 id 去重飛行中的展開（`KnowledgeGraphSession.ts:85` 處的 `inFlightExpansions`）、將失敗路由至 `onError` 或 `console.error` — 永不未處理（`KnowledgeGraphSession.ts:338`）。
- `dispose()` 於 `KnowledgeGraphSession.ts:267` 按順序處置互動/相機/圖形/布局/模型；會話擁有布局，模型則不。

`GraphInteraction` 於 `packages/graph3d/src/GraphInteraction.ts:83` 經 `THREE.Raycaster`（`GraphInteraction.ts:168` `raycaster.setFromCamera`）將指標事件轉為 `Graph3D` 上的 `onHover`/`onSelect`/`onDrag`，在 `GraphInteraction.ts:300` 建立法線平面拖曳並經 `layout.pinNode` 寫入（`GraphInteraction.ts:309`）。`setControlsEnabled(false)` 於 `GraphInteraction.ts:214` 在拖曳期間阻擋宿主的 `OrbitControls`。

無障礙：`knowledge-graph` **不**投射逐節點 DOM（`KnowledgeGraphSession.ts:64` 文件）— 在宿主中搭配聚合的 `role="status"` 播報器。

### 1.6 影格整合與生命週期

會話永不擁有 `WebGLRenderer` 或 `requestAnimationFrame` 迴圈 — 宿主擁有（`KnowledgeGraphSession.ts:60` 文件）。正確連接為 `attach(scene)` 一次（`KnowledgeGraphSession.ts:153`）、等待 `bootstrap`（`KnowledgeGraphSession.ts:182`），然後每影格 `tick()` + `render(renderer, scene)`（`KnowledgeGraphSession.ts:242`/`KnowledgeGraphSession.ts:256`）。`tick` 僅擷取已穩定的位置（`KnowledgeGraphSession.ts:250` — 熱影格擷取將每節點每影格寫入一個 `Map` 條目）並在冷卻時回傳 `true`（`KnowledgeGraphSession.ts:252`），因此迴圈為 `if (!session.tick()) requestAnimationFrame(loop)`（`KnowledgeGraphSession.ts:240` 文件）。在 `KnowledgeGraphSession.ts:189`/`KnowledgeGraphSession.ts:227` 的等待後處置守衛使來自建構子即發即忘 `bootstrap`（`KnowledgeGraphSession.ts:145`）的遲來延續靜止 — 無它們，鏡像將對已拆解的 `Graph3D` 執行。

`loadSnapshot` 於 `KnowledgeGraphSession.ts:202` 為展示/離線路徑：它建立 `KnowledgeGraphSnapshot`，將每個實體標記為 `complete` 且 `loaded = facts.length`（`KnowledgeGraphSession.ts:208`），使 `expandOnSelect`（`KnowledgeGraphSession.ts:94` 選項，`KnowledgeGraphSession.ts:318` 檢查）不重取已存在的跳躍。`setSize` 於 `KnowledgeGraphSession.ts:263` 轉發至 `camera.setSize`；`getMode` 於 `KnowledgeGraphSession.ts:160` 暴露會話的 `mode`（`types.ts:6` 處的 `'2d'|'3d'`）。

### 1.7 圖資料型別與宿主擁有權

`GraphData` 於 `packages/graph3d/src/types.ts:1` 為 `{ nodes: GraphNode[], links: GraphLink[] }`，其中 `GraphNode` 攜帶 `id: NodeId`（`types.ts:6` `string|number`）、可選的 `x/y/z` 種子、可選的 `fx/fy/fz` 固定、`val` 供 `Graph3D` 半徑與 `color`。`GraphData` 為唯一跨越模型→布局→渲染接縫的物件 — `KnowledgeGraphModel` 自 `KgEntity`/`KgFact` 建構它（`KnowledgeGraphModel.ts:332` `pickLabel` + `position` 展開）、`GraphLayout.setGraph` 按值消費它（實作複製或拷貝至 SoA）、`Graph3D.setGraphData` 按 id 索引它（`Graph3D.ts:80` `indexById`）。渲染器刻意不知位置如何計算（`Graph3D.ts:26` 文件：可在 worker 後交換或遠端），布局亦不知渲染器如何批次（`VectoForceLayout.ts:68` 文件）。宿主擁有權明確：呼叫者建構 `VectoForceLayout`/`D3ForceLayout`/`FixedZLayout` 與 `Graph3D`/`GraphCamera`，模型借用布局（`KnowledgeGraphModel.ts:47` `layout?: GraphLayout` 文件），會話擁有它（`KnowledgeGraphSession.ts:277` 處置）。`D3ForceLayout` 複製至 `simNodes`（`D3ForceLayout.ts:71`）因為 d3 會改變其輸入；`VectoForceLayout` 保持 f32 SoA（`VectoForceLayout.ts:88` `positions/vx/vy/vz/fx/fy/fz`）且永不改變呼叫者節點。`Graph3D.applyPositions` 在 `positions.length < count*3` 時短路並以每 `setGraphData` 一次的警告（`Graph3D.ts:162` `hasWarnedShortPositions`，於 `Graph3D.ts:100` 重置）而非寫入使整個網格被視錐剔除的 NaN 實例矩陣。

## 2. 節點編輯器 — 文件、指令、選取

### 2.1 文件模型

`NodeDocument` 於 `packages/node-editor/src/model.ts:54` 為 `{ nodes: NodeData[], links: LinkData[] }`，具不可變轉換（`model.ts:78` 處的 `cloneDocument`、`model.ts:64` 處供 `data` 映射的 `deepCloneValue`、`model.ts:93` 處的 `updateNodePosition`）。`NodeData` 攜帶 `position`、可選的 `width`/`height`、`ports: PortDefinition[]`（`model.ts:8` 具 `direction`、`dataType`、`maxConnections`）、`data`；`LinkData` 攜帶 `source`/`target` + 埠 id（`model.ts:27`）。

`validateLink` 於 `model.ts:126` 檢查來源/目標存在、同節點自迴路拒絕、重複連結 id、埠存在 + 方向（`output`→`input`）、`dataType` 上的 `incompatible-types`、有向端點對上的 `duplicate-link`，以及經 `maxConnections` 的 `target-port-occupied`（`model.ts:152`）。跨多節點的循環**被允許** — 文件為使用者撰寫的流程（`model.ts:117` 文件）。`model.ts:163` 處的 `addLink`/`removeLink`/`removeNode` 強制它；`model.ts:178` 處的 `removeNode` 移除關聯連結以保持參照有效。

### 2.2 歷史與選取

`CommandHistory` 於 `packages/node-editor/src/history.ts:9` 為教科書式的復原/重做：`execute(label, after)` 經 `cloneDocument` 快照 `before`/`after`、推入 `undoStack`、清除 `redoStack`（`history.ts:28`），`undo()`/`redo()` 交換 `current`（`history.ts:40`）。所有 `NodeEditor` 變更皆經此單一門控，使每個使用者動作皆為一個歷史條目。

`SelectionState` 於 `packages/node-editor/src/selection.ts:9` 以 `select(id, additive)`（`selection.ts:22`）、`clear()`、`list()` 快照與供目前拖曳的暫態 `drag: DragState | null`（`selection.ts:11`）追蹤 `ids: Set<string>`。`layoutDocument` 於 `packages/node-editor/src/layout.ts:14` 為確定性分層布局：組件 DAG 上的 Tarjan SCC（`layout.ts:96` `stronglyConnectedComponents`）、Kahn 拓撲秩指派（`layout.ts:54`），然後 `x = originX + rank*horizontalGap`、`y = originY + index*verticalGap`（`layout.ts:85`）。按 id 與目標排序而具確定性（`layout.ts:18`/`layout.ts:27`）。

### 2.3 NodeEditor 實體組合

`NodeEditor` 於 `packages/node-editor/src/editor.ts:199` 擴展 `Entity`（`editor.ts:214` 處預設 `width 1000, height 700`）、擁有 `selection`、`history: CommandHistory`（`editor.ts:201`）、`nodeEntities`/`linkEntities` 映射（`editor.ts:202`）、`status: StatusAnnouncer`（`editor.ts:204`）與暫態的 `dragDocument`/`connection`/`connectionPoint`（`editor.ts:205`）。子節點為 `NodeCard`（`editor.ts:143`）、`LinkEntity`（`editor.ts:119`）、`PortEntity`（`editor.ts:51`）與 `StatusAnnouncer`（`editor.ts:29`）。

- `NodeCard` 於 `editor.ts:143` 為具卡片裝飾的 `UIComponent`，擁有 `PortEntity` 子節點（`editor.ts:162`）、經 `selection.has` 宣告 `role="button"` 與游動 `tabIndex`（`editor.ts:174`）、將 `pointerdown/move/up` 路由至 `editor.beginDrag/moveDrag/endDrag`（`editor.ts:155`）。
- `PortEntity` 於 `editor.ts:51` 為 12px 圓（`editor.ts:20`）、輸出埠右對齊（`editor.ts:62`）、將 pointerdown 路由至 `editor.beginConnection`（`editor.ts:66`）並將具 `KeyboardEvent` 來源的 `click` 路由至 `editor.portActivated`（`editor.ts:90` — 過濾自指標捕捉合成的瀏覽器點擊）。
- `LinkEntity` 於 `editor.ts:119` 讀取即時的 `nodeEntities` 位置繪製來源→目標線（`editor.ts:136`）。
- `StatusAnnouncer` 於 `editor.ts:29` 為不可見的 `role="status"` 即時區域（`aria-live polite`，`editor.ts:40`），供僅鍵盤的連接狀態（無可見的橡皮筋）。

編輯操作：

- 拖曳：`editor.ts:406` 處的 `beginDrag` 經 `cloneDocument` 快照 `dragDocument`、設定具起點的 `selection.drag`。`editor.ts:421` 處的 `moveDrag` 為熱路徑：**原地變更** `node.position` 並對卡片 `setPosition`，無每移動複製 — `LinkEntity` 讀取同一 `nodeEntities` 映射，因此無需重建即可跟隨連結（`editor.ts:427` 註解）。`editor.ts:441` 處的 `endDrag` 比較前後 JSON 並推入一個 `'Move node'` 條目；`editor.ts:452` 處的 `cancelDrag` 經來自 `dragDocument` 的 `applyPreview` 回滾。
- 連接：`editor.ts:282` 處的 `beginConnection`/`moveConnection`/`endConnection` 處理橡皮筋；`editor.ts:297` 處的 `portActivated` 為 WCAG 2.1.1 對等 — 輸出埠武裝待定連接（無橡皮點、經 `editor.ts:307` 處的 `status.say` 播報）、輸入埠經 `commitLink` 提交（`editor.ts:334`）。`commitLink` 建構 `link:id = link:<src>:<port>:<tgt>:<port>`（`editor.ts:337`）並呼叫 `createLink`（`editor.ts:380` 經歷史推入 `addLink`）。`editor.ts:459` 處的 `handleKeyDown` 將 `Escape` 映射至取消兩個手勢、`Ctrl/Cmd+Z/Y` 至復原/重做（先取消暫態手勢於 `editor.ts:474`），`Delete/Backspace` 至 `deleteNodes(selection.list())`（`editor.ts:480`）。
- 自動布局：`editor.ts:274` 處的 `applyAutoLayout` 執行 `layoutDocument`，變更時推入一個 `'Auto-layout'` 條目（`editor.ts:277`）。

`packages/node-editor/src/persistence.ts:168` 處的持久化為 `exportDocument(document) -> string`（先於 `persistence.ts:169` 驗證、以 `persistence.ts:171` 處的 `schemaVersion: 1` 包裝、經 `persistence.ts:164` 處 `JSON.parse(JSON.stringify(...))` 的 `cloneJson`）與 `persistence.ts:178` 處的 `importDocument(serialized)`（解析、於 `persistence.ts:186` 檢查 `schemaVersion`，然後 `persistence.ts:84` 處的 `validateDocument` — 結構檢查加上 `persistence.ts:156` 處對同儕的 `validateLink` 語意遍歷，其在驗證前將每個連結自集合剝除，因此處於容量的合法連結不會對自身佔用測試誤判失敗）。拒絕非有限位置、重複 id/埠、缺失埠參考、錯誤 `direction` 與 `dataType` 不匹配（`persistence.ts:70`）。`persistence.ts:24` 處的 `NodeEditorPersistenceError` 為失敗契約。`persistence.ts:41` 處的 `isJsonValue` 以 `persistence.ts:45` 處的 `WeakSet` 守衛 `data` 映射的 JSON 安全循環、非有限數字（`persistence.ts:43`）與符號鍵（`persistence.ts:50`），因此持久化的 `NodeDocument` 經 `JSON.stringify` 無損往返 — `data` 中的任何 `Map`/`Set`/`Date` 必須在匯出前序列化為純 JSON。

### 2.4 此垂直領域中的已知陷阱

編輯器特定的陷阱，已耗費實際審查時間（見 `packages/node-editor/src/editor.ts` 內聯註解）：

- **指標來源過濾** — `editor.ts:90` 處的 `PortEntity` 點擊處理器以 `nativeEvent instanceof KeyboardEvent` 門控，因為核心亦為同一鏡像上的原生瀏覽器點擊合成 `click`（指標捕捉將已釋放的連接拖曳重定向回其上）。無過濾器時，已釋放的連接將同時完成並重武裝待定的鍵盤連接。
- **拖曳別名** — `moveDrag` 變更 `documentState` 自身的節點物件（`editor.ts:427`「經 `cloneDocument` 擁有其節點物件」），使原地編輯無法別名歷史快照；`dragDocument`（`editor.ts:411` 處的拖曳前複本）保持乾淨供 `cancelDrag` 使用。
- **歷史污染** — `endDrag` 僅當 JSON 變更時才推入（`editor.ts:445` `JSON.stringify(before) !== JSON.stringify(current)`），`applyAutoLayout` 亦同（`editor.ts:276`）。否則無操作拖曳將新增不做任何事卻偏移重做堆疊的復原條目。
- **暫態手勢範圍** — `editor.ts:390` 處的 `deleteNodes` 與 `editor.ts:474` 處的 `Ctrl+Z/Y` 路徑皆在變更歷史前取消待定的 `connection`/`drag`，使歷史指令看到真實文件而非半移動的節點。

## 3. 桌面外殼 — Scene 上的視窗管理器

### 3.1 外殼與布局

`DesktopShell` 於 `packages/desktop/src/DesktopShell.ts:87` 為頂層宿主（桌布 + `DisplayLayout` + `WindowManager` + `Taskbar`/`StartMenu` + `ShortcutRouter`）。`DesktopShell.ts:105` 處的建構子解析設定（`resolveConfig`）、註冊 `AppRegistry`（`DesktopShell.ts:108`）、建構 `DisplayLayout`（`DesktopShell.ts:116`）、`WindowManager`（`DesktopShell.ts:124`）、`Wallpaper`（`DesktopShell.ts:133`）與 `ShortcutRouter`（`DesktopShell.ts:140`）。`DesktopShell.ts:17` 處的 `Wallpaper` 為具 `a11yProjection never`（`DesktopShell.ts:26`）的非互動封面圖片。

`DesktopShell.ts:152` 處的 `start()` 具冪等性：新增桌布、同步布局、掛載工作列、附加捷徑與供 Kickoff 關閉與 Escape 的文件層級 `pointerdown`/`keydown`（`DesktopShell.ts:143`）。`DesktopShell.ts:171` 處的 `syncLayoutToScene`/`resize` 讀取即時的 `scene.width/height`（無重設大小匯流排）並更新桌布 + 工作列放置。`DesktopShell.ts:204` 處的 `setTheme` 交換 token、`WindowChrome` 並重掛載工作列。

`DisplayLayout` 於 `packages/desktop/src/DisplayLayout.ts:15` 將邏輯顯示器映射至聯集並減去工作列帶以取得 `workArea`（`DisplayLayout.ts:50`）、供桌布的 `bounds()`（`DisplayLayout.ts:60`）、點查詢 `displayAt`（`DisplayLayout.ts:80`）、供視窗放置的 `clampRect`（`DisplayLayout.ts:89`）與供單顯示器重用的 `updateSceneSize`（`DisplayLayout.ts:105`）。

### 3.2 WindowManager — 開啟/聚焦/關閉/z 順序

`WindowManager` 於 `packages/desktop/src/WindowManager.ts:65` 擁有 `DesktopWindow[]`（`WindowManager.ts:71`）、`focused`（`WindowManager.ts:72`）、`cascade`/`seq`（`WindowManager.ts:73`）與對話堆疊 `dialogOrder`/`dialogPrevFocus`（`WindowManager.ts:77`）。方法：

- `open(appId, opts)` 於 `WindowManager.ts:126` 強制 `instances: 'single'|'multiple'`（`WindowManager.ts:132` — 除非 `forceNew` 否則聚焦既有）、級聯 `(cascade % 8)*28`（`WindowManager.ts:144`）、經 `layout.clampRect` 箝制（`WindowManager.ts:149`）、指派 `windowId = appId-seq`（`WindowManager.ts:151`）、建立 `DesktopWindow`（`WindowManager.ts:152`）、`scene.showOverlay`（`WindowManager.ts:170`）與 `focus`（`WindowManager.ts:172`）。
- `openDialog(opts)` 於 `WindowManager.ts:184` 為無註冊表：僅關閉裝飾、自工作列排除（`Taskbar.ts:159`）、持有型態的焦點（`WindowManager.ts:238`）、預設置中（`WindowManager.ts:191`），`onDocKeyDown` 為最上層 `dismissible` 對話框捕捉 `Escape`（`WindowManager.ts:329`）。
- `focus` 於 `WindowManager.ts:233` 當最上層為強制對話框時阻擋重聚焦（`WindowManager.ts:237`）、經 `requestA11yProjection`/`releaseA11yProjection` 還原/取消固定 a11y（`WindowManager.ts:248`/`WindowManager.ts:253`），並在不使用 `Entity.remove` 的情況下 `restack`（`WindowManager.ts:339` — 拼接 `overlayRoot.children` + `markStructureChanged` 以避免重創 driver）。
- `close` 於 `WindowManager.ts:258` 拼接、隱藏覆蓋、銷毀 `win`、還原 `dialogPrevFocus`（`WindowManager.ts:281`）並按反序挑選下一個可見視窗（`WindowManager.ts:278`）。
- `WindowManager.ts:297` 處的 `cycleFocus(backward)` 與 `WindowManager.ts:311` 處的 `topModal()`。

經 `WindowManager.ts:116` 處 `on(listener)` 的監聽器發射 `open/close/focus/state`。

### 3.3 DesktopWindow — 裝飾與互動

`DesktopWindow` 於 `packages/desktop/src/Window.ts:158` 為具 `a11yProjection onDemand`（`Window.ts:228`）與 `pointerEvents none` 對話鏡像（`Window.ts:400`）的 `UIComponent`。結構：`Card shell` + `Card titlebar` + `Text titleLabel` + `TitlebarDragHandle` + 三個 `Button` 裝飾（經 `Window.ts:361` 處的 `makeChromeBtn` 為 `close/max/min`）+ `ResizeGrips` + `ClientHost`（`Window.ts:79` 不可見裁剪宿主）+ 來自 `app.create(ctx)` 的 `content`（`Window.ts:340`）。經來自 token 的 `WindowChrome`（`Window.ts:8`）裝飾（`DesktopShell.ts:411` `resolveChrome`）。

- 幾何：`Window.ts:507` 處的 `applyGeom` 箝制至 `minWidth/minHeight`（`Window.ts:498` `max(chrome, app)`）、定尺 shell/titlebar/clientHost、重定位裝飾按鈕與拖曳手柄（`Window.ts:524` `chromeBtnStripWidth`），`layoutClientContent` 拉伸 `content.width/height`（`Window.ts:538`）。
- 標題列拖曳：`Window.ts:133` 處的 `TitlebarDragHandle` 為專用可互動 `UIComponent`（`role button, label Move window`，`tabIndex 0`），具積極 a11y 使命中存在而無需固定整個對話框（`Window.ts:282`）。`Window.ts:589` 處的 `beginTitlebarDrag` 處理最大化時拖曳還原（`Window.ts:594`），`Window.ts:670` 處的 `handleMoveKey` 以 `Shift=1px` 映射 `ArrowLeft/Right/Up/Down`（`Window.ts:671`），`clampMovePosition` 使標題列保持於工作區域（`Window.ts:700`）。
- 重設大小：具 6px 邊的 `Window.ts:553` 處 `hitResizeEdge`，`Window.ts:615` 處的 `handleResizePointerDown`（子節點擁有其命中，客戶宿主為 `isPointInside false`，因此僅邊緣命中此處）、具最小箝制與工作區域裁剪的每邊 `Window.ts:707` 處 `applyResize`，經 `Window.ts:638` 處的 `attachDocPointers` 進行文件層級捕捉。
- 狀態：`Window.ts:433` 處的 `maximize`/`restore`/`toggleMaximize`，`Window.ts:468` 處的 `minimize`/`restoreFromMinimized`（透明度 0 + `interactive false` + `a11yHidden true`），`Window.ts:488` 處的 `setGeometry`。
- 焦點環：`Window.ts:404` 處的 `setFocused` 將 `shell.border` 交換為 `focusRing`；`Window.ts:411` 處的 `updateChrome` 合併。

`packages/desktop/src/Taskbar.ts:36` 處的 `Taskbar` 為 Plasma 風格列：`Card bar` + 54px `Start` 按鈕（`Taskbar.ts:73`）、`Text clockLabel`（`Taskbar.ts:94`，於 `Taskbar.ts:127` 節流至每分鐘）、`EntriesHost`（`Taskbar.ts:103` 裁剪宿主）、`entryButtons: Map<DesktopWindow, Button>`（`Taskbar.ts:47`）、`wm.on(() => rebuild)`（`Taskbar.ts:120`）。`Taskbar.ts:157` 處的 `rebuild()` 過濾對話框（`Taskbar.ts:159`）、按視窗池化按鈕（`Taskbar.ts:171`）、具即時 `selected` 綁定的積極 a11y（`Taskbar.ts:194`）、上限為 `EntriesHost.width`（`Taskbar.ts:207`），點擊活躍時最小化（`Taskbar.ts:220`）。

`packages/desktop/src/StartMenu.ts:42` 處的 `StartMenu`（Kickoff）為 `240px` `Card` 面板（`StartMenu.ts:67`），每應用一個 `Button`（`StartMenu.ts:92`），`StartMenu.ts:31` 處的 `startMenuHeight` 輔助與 `DesktopShell` 共用於預定位（使架與選單無法漂移，`DesktopShell.ts:303`）。外殼經 `scene.showOverlay` + `requestA11yProjection`（`DesktopShell.ts:330`）顯示它，並以工作列位置為界（`DesktopShell.ts:305`）。

## 4. 表格 — 覆於 Text 之上的虛擬化網格

### 4.1 建構契約

`Table` 於 `packages/table/src/Table.ts:144` 擴展 `UIComponent`。建構正規化每個輸入：`Table.ts:789` 處的 `normalizeColumnWidths` 縮放至 `width`（缺失/無效時均分）、`Table.ts:779` 處的 `normalizeColumnAlign` 預設為 `left`、`Table.ts:810` 處的 `normalizeCell`/`normalizeRow` 以 `''` 填補過短列、截斷過長者（`Table.ts:806` 文件）、經 `Table.ts:921` 處的 `createTextCell` 為每字串建立一個 `Text`（標頭為 `bold`，可選取性來自選項），並經 `Table.ts:228` 處的 `seenCells` 拒絕重複的 `Entity` 儲存格。`Table.ts:142` 處的 `CELL_PADDING_PX = 12` 由 `Table.ts:935` 處的 `fitCell` 包裝寬度（`maxWidth = colWidths[col] - 2*CELL_PADDING`）與 `Table.ts:767` 處的 `cellX` 對齊內縮共用。

選擇加入虛擬化：`Table.ts:50` 處的 `viewportHeight`。當 `virtualized`（`Table.ts:177` `viewportHeight>0`）時，主體儲存格直至視窗具體化前為 `null`（`Table.ts:256` `bodyCells = rows.map(() => null)`，`Table.ts:822` 處的 `reserveRowEntities` 積極驗證 `Entity` 儲存格）、`Table.ts:261` 處的 `TableBodyClip` 實體（`clipChildren true`）擁有主體、表頭保持直接固定，`Table.ts:282` 處的 `bindScroll` 安裝 `wheel` + `pointerdown/move` 拖曳捲動。

### 4.2 布局與虛擬化

`Table.ts:987` 處的 `layout()` 自擬合的 `headerCells` 重算 `headerHeight`，經 `Table.ts:999` 處的 `cellX` 定位它們，然後分支：

- 虛擬化：每列固定 `rowHeights = baseRowHeight`（`Table.ts:1009`），使 `scroll↔row-index` 為 `O(1)`（`Table.ts:1004` 註解 — 走訪每列將為 `O(rows)` 並擊破開窗）、將 `bodyClip` 定尺為 `viewportHeight - headerHeight`（`Table.ts:1013`）並將主體儲存格同步延遲至 `Table.ts:392` 處的 `reconcileVirtualRows`，後者精確掛載 `[first, last]` 列，其中 `first = floor(scrollY/rh) - overscan`（`Table.ts:397`）且 `last = ceil((scrollY+bodyViewport)/rh) + overscan -1`（`Table.ts:404`）— 比舊的 `+overscan` 少算一個不可見額外列。
- 經典：按列度量 `rowHeights`（`Table.ts:1042`）、建立 `rowTops` 前綴和（`Table.ts:1053` `rebuildRowTops`）並定位每列（`Table.ts:1056`）。

`Table.ts:352` 處 `update(dt)` 的捲動整合為感知 dt 的指數積分器（鏡像 `VirtualList`/`Tree`）：`velY += diff*7.2*(dt/1000)` + `velY *= exp(-dt/84)`（`Table.ts:361`）、閾值 `0.05`（`Table.ts:363`），`Table.ts:378` 處的 `hasPendingAnimations` 使 `onDemand` 永不於捲動中閒置（`Table.ts:378` 文件）。

`Table.ts:885` 處的 `appendRows` 依設計僅附加：推入 `rows` + `bodyCells`（在虛擬化模式下於 `Table.ts:895` 保留 `Entity` 儲存格），然後 `layout()` 重排並 `_syncGridA11y` 重池化 — 增長時無 `detachA11y` 或 tab 停駐失效（`Table.ts:870` 文件）。

### 4.3 網格 a11y — 池化的列/儲存格熱點

`Table.ts:55` 處的 `RowHotspot` 為透明結構性 `role="row"` 容器（`pointerEvents none`，`Table.ts:70`，`Table.ts:65` 處的 `layoutControlledProperties`）。`Table.ts:82` 處的 `GridCellHotspot` 為具經 `Table.ts:473` 處 `isGridTabStop` 的游動 `tabIndex` 的可聚焦 `role gridcell|columnheader`（`Table.ts:111`），`pointerEvents none` 使下方可選取文字擁有指標（`Table.ts:119`），並將 `keydown` 轉發至 `Table.ts:91` 處的 `handleGridKey`。

`Table.ts:624` 處的 `_syncGridA11y()` 投射 ARIA 網格：一個固定 `headerRow`，每欄具 `columnheader` 熱點（`Table.ts:630`），加上池化的 `bodyRowPool: { row, cells }[]`（`Table.ts:199`），增長/縮小至 `need = last-first+1`（`Table.ts:691`），每個具按 `Table.ts:95` 處 `bind(rowIndex,colIndex,label)` 重綁的 `GridCellHotspot`。當模式變更時，池條目在 `Table` 與 `bodyClip` 間重設父節點（`Table.ts:713`）。`Table.ts:412`/`Table.ts:668` 處的重錨定協定在聚焦列捲出時保留游動停駐點：`pendingFocusReanchor` + 經 `Table.ts:592` 處 `activeCellHoldsFocus` 的 `reanchorRestoreFocus`（檢查 `document.activeElement` vs `scene.getA11yElement`），因此僅當已卸載儲存格確實持有 DOM 焦點時才還原焦點 — 永不竊取。

鍵盤模型：`Table.ts:490` 處的 `handleGridKey`（方向鍵、`Home`/`End`、`Ctrl+Home/End` 至邊緣、`PageUp/PageDown` 按 `Table.ts:548` 處的 `pageRows()`），`Table.ts:560` 處的 `_focusCell` 將列捲動至視圖（`Table.ts:603` 處的 `_scrollRowIntoView`）並 `focus()` 熱點，並在綁定 `tabIndex` 前重錨定。

## 5. 垂直領域如何組合原語

| 垂直領域       | 原語堆疊                                                                                                                 | 關鍵 file:line 邊界                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **知識圖譜**   | `@vectojs/graph3d` 布局契約 + Barnes-Hut 3D/2D + `Graph3D`/`GraphCamera`/`GraphInteraction`                              | `KnowledgeGraphModel.ts:62` 模型、`FixedZLayout.ts:22` 轉接器、`KnowledgeGraphSession.ts:67` 連接、`Graph3D.ts:28` 渲染器、`GraphLayout.ts:12` 契約   |
| **節點編輯器** | `CommandHistory` 快照 + `SelectionState` + `layoutDocument` SCC + `Entity`/`UIComponent` 樹 + `StatusAnnouncer` 即時區域 | `model.ts:54` 文件、`history.ts:9` 歷史、`selection.ts:9` 選取、`layout.ts:14` 自動布局、`editor.ts:199` 編輯器、`editor.ts:51` 埠                    |
| **桌面**       | `Scene` 覆蓋 + `DisplayLayout` 工作區域 + `WindowManager` z 順序 + `DesktopWindow` 裝飾 + `Taskbar`/`StartMenu`          | `DesktopShell.ts:87` 外殼、`DisplayLayout.ts:15` 顯示、`WindowManager.ts:65` WM、`Window.ts:158` 視窗、`Taskbar.ts:36` 工作列、`StartMenu.ts:42` 選單 |
| **表格**       | `Text` 儲存格 + `RowHotspot`/`GridCellHotspot` a11y 池 + `TableBodyClip` + 指數捲動積分器                                | `Table.ts:144` 表格、`Table.ts:55` 列、`Table.ts:82` 儲存格、`Table.ts:392` 調和、`Table.ts:624` a11y 同步、`Table.ts:352` 捲動                       |

每個垂直領域借用其原語並僅處置其建構者（`KnowledgeGraphModel.ts:230` 處模型借用的布局、會話擁有的布局於 `KnowledgeGraphSession.ts:277`；編輯器擁有歷史/選取；外殼擁有 WM/布局/工作列/桌布）。

## 5a. 桌面深切 — 註冊表、VFS、捷徑與裝飾

`AppRegistry` 於 `packages/desktop/src/AppRegistry.ts:1` 為覆於 `ResolvedWebosConfig.apps` 的薄 `Map<id, AppDefinition>`，具 `get(id)`、`list()` 與 `has(id)` — `WindowManager.ts:128` 處 WM 的 `open` 門控在缺失時拋出 `unknown app id`。`AppDefinition` 於 `packages/desktop/src/types.ts:1` 攜帶 `id`、`title`、`icon`/`iconSvg`、`create(ctx: AppContext) -> Entity`、`instances: 'single'|'multiple'`、`defaultWidth/Height`、`minWidth/Height` 與 `StartMenu` 使用的分類中繼資料。

`Vfs` 於 `packages/desktop/src/Vfs.ts:1` 為經 `AppContext.vfs` 傳入每個 `create()` 呼叫的可選記憶體檔案介面 — 需要檔案選擇器或磁碟視圖的應用綁定它，`WindowManager` 將同一實例貫穿至每個 `DesktopWindow`（`WindowManager.ts:86`）。`packages/desktop/src/resolveConfig.ts:1` 處的 `resolveConfig` 將使用者 `WebosConfig` 合併至 `ResolvedWebosConfig`（桌面、顯示器、主題、應用、捷徑、vfs），`taskbarHeight`/`taskbarPosition`/`wallpaper` 具預設值（`resolveConfig.ts:12`）。

`ShortcutRouter` 於 `packages/desktop/src/ShortcutRouter.ts:1` 經正規化 `Map` 映射 `chord -> ShortcutAction`（`types.ts:1` `open-app | close-focused | toggle-start | custom`），`ShortcutRouter.ts:30` 處的 `attach()`/`detach()` 綁定 `DesktopShell` 在 `start()` 中啟用的單一 `keydown` 監聽器（`DesktopShell.ts:158` `shortcuts.attach()`）。`DesktopShell.ts:344` 處的 `dispatchShortcut` 按 `action.type` 切換 — `open-app` 呼叫 `windowManager.open(action.appId)`（`DesktopShell.ts:347`）、`close-focused` 呼叫 `closeFocused()`（`DesktopShell.ts:350`）、`toggle-start` 翻轉 Kickoff（`DesktopShell.ts:353`）、`custom` 轉發至 `onCustomShortcut`（`DesktopShell.ts:356`）。

`icon.ts:1` 保留 `WINDOW_ICONS` SVG 字串（`close/maximize/minimize`）與 `addButtonIcon(button, svg, size, color)`（`icon.ts:12`），其將圖示注入 `Button` 標籤 — 由 `Window.ts:380` 處的 `Window.makeChromeBtn` 與 `Taskbar.ts:185` 處的 `Taskbar.rebuild` 供每視窗應用圖示以 `16` 與 `chrome.fg` 縮放使用。

`DesktopShell` 於 `DesktopShell.ts:411` 的裝飾解析 `resolveChrome` 將主題 token 映射至 `WindowChrome`（`Window.ts:8`），具 `DesktopShell.ts:401` 處的 `str()`/`num()` 輔助 — `windowBg`、`windowBorder`、`titlebarBg/Fg`、`titlebarHeight`、`closeBg/Fg`、`focusRing`、`radius`、`resizeHandle`、`minWidth/Height` — 因此 token 更名無法靜默退回 `undefined`（兩處皆傳遞完整的 `resolveChrome` 物件，註記於 `Window.ts:414`）。`Taskbar.ts:7` 處的 `Taskbar` 裝飾 `TaskbarChrome` 與 `StartMenu.ts:6` 處的 `StartMenu` 裝飾 `StartMenuChrome` 遵循相同 token 串接。

## 5a. 桌面深切 — 續：工作列生命週期與開始選單擁有權

`Taskbar` 於 `Taskbar.ts:36` 在 `Map<DesktopWindow, Button>`（`Taskbar.ts:47`）中池化每視窗條目按鈕，並在每次 `wm.on('open'|'close'|'focus'|'state')`（`WindowManager.ts:116` → `Taskbar.ts:120`）時重建。對話視窗被明確過濾（`Taskbar.ts:159` `!w.isDialog`），因此 `openDialog` 永不作為工作項目出現。每個條目上限 `maxW 160`（`Taskbar.ts:162`）、經 `addButtonIcon` 攜帶應用圖示（`Taskbar.ts:185` `16`px、`chrome.fg`），位於 `EntriesHost`（`Taskbar.ts:103` `clipChildren true`）下使溢出在時鐘標籤前裁剪（`Taskbar.ts:106` 註解）。點擊活躍（已聚焦、未最小化）條目將最小化（`Taskbar.ts:220` `win.minimize()`），否則聚焦（`Taskbar.ts:224` `wm.focus`）。

`StartMenu` 於 `StartMenu.ts:42` 經 `scene.showOverlay` + `requestA11yProjection`（`DesktopShell.ts:330`）顯示，並由其方框外的 `pointerdown`（`DesktopShell.ts:361` 使用 `DesktopShell.ts:366` 處 `scene.clientToScene` 的 `handleOutsidePointer`）、`keydown Escape`（`DesktopShell.ts:144` `onDocKeyDown`）或再次點擊開始按鈕（切換）關閉。`StartMenu.ts:31` 處的 `startMenuHeight` 為外殼預定位（`DesktopShell.ts:303` `estH`）與選單自身高度（`StartMenu.ts:58`）的單一真值來源，因此兩者無法漂移。外殼的 `toggleStartMenu`（`DesktopShell.ts:196`）與 `closeStartMenu`/`openStartMenu`（`DesktopShell.ts:335`/`DesktopShell.ts:294`）為唯二呼叫者 — 垂直領域絕不可在不整合此對的情況下新增第二個選單擁有者。

## 5b. 表格深切 — 寬度、實體儲存格與裝飾

`packages/table/src/Table.ts:963` 處的 `setWidth(width)` 按比例重縮放 `colWidths`（`Table.ts:972` `colWidths.map(c => c/total*next)`）而非均分 — 呼叫者提供的 `colWidths` 比例在重設大小後存活。接著必須呼叫 `layout()`（經 `Table.ts:975` 處 `return this.layout()` 鏈接），因為 `colWidths` 為 `Table.ts:935` 處 `fitCell` 包裝寬度、`Table.ts:767` 處 `cellX` 對齊與每個子節點 `x`（`Table.ts:999`/`Table.ts:1062`）的來源。

實體儲存格（而非字串）於 `Table.ts:910` 處的 `normalizeCell` 與 `Table.ts:822` 處的 `reserveRowEntities` 被接受，`Table.ts:228` 處的 `seenCells: Set<Entity>` 積極拒絕重複實例 — 即使在 `Text` 建構延遲至 `Table.ts:392` 處 `reconcileVirtualRows` 的虛擬化模式中，`Entity` 識別檢查在附加時執行（`Table.ts:895`），因此 `Entity.add` 永不靜默將儲存格重設父節點至其原始槽外。`Table.ts:930` 處的 `setCellSelectable` 與 `Table.ts:935` 處的 `fitCell` 為兩個按儲存格能力探測（`Table.ts:5` 處的 `SizableCell`/`SelectableCell` 介面）。

`Table.ts:1097` 處的 `getContentProjection() -> null` 宣告 `Table` 永不複製子文字 — 儲存格 `Text` 實體擁有其自身投射，因此表格自身的 a11y 角色（`Table.ts:1088` 處的 `getA11yAttributes` `role grid, label "Data table with N cols and M rows", pointerEvents none`）純為結構性。`Table.ts:1101` 處 `render(r)` 的裝飾繪製繪製 `roundRect` 填充（`Table.ts:1103`）、表頭填充（`Table.ts:1107`）、欄分隔線（`Table.ts:1114`）、列分隔線（虛擬化於 `Table.ts:1124` 覆於 `[first,last)` 視埠相對，經典於 `Table.ts:1139` 覆於 `rowHeights`）與外邊框（`Table.ts:1150`）。

`packages/graph3d/src/GraphCamera.ts:1` 處的 `GraphCamera` 以 `mode: '2d'|'3d'` 切換、`domElement` 綁定、`setSize`/`fitToPositions`（`KnowledgeGraphSession.ts:191` 於 bootstrap 後呼叫）與供互動 `setControlsEnabled` 門控的 `setEnabled` 包裝 `THREE.PerspectiveCamera | OrthographicCamera`（`KnowledgeGraphSession.ts:132`）。`packages/graph3d/src/Graph3D.ts:246` 處的 `Graph3D.pickNode` 為 `GraphInteraction.ts:168` 處 `GraphInteraction.pick` 自 NDC 建構的 `raycaster.intersectObject(nodeMesh)` 路徑。

### 4.4 在 VectoForceLayout 與 D3ForceLayout 間選擇

`packages/graph3d/src/layout/` 處的兩個 `GraphLayout` 實作共用 `setGraph`/`step`/`positions`/`pinNode`/`reheat` 但手感不同：`VectoForceLayout` 於 `VectoForceLayout.ts:68` 為具明確 `repulsion * alpha` + 連結彈簧 + `centerStrength` + `velocityDecay` tick（`VectoForceLayout.ts:233` 六階段）的自研 Barnes-Hut 八元樹；`D3ForceLayout` 於 `D3ForceLayout.ts:37` 為 `d3-force-3d` 轉接器（`D3ForceLayout.ts:88` 處的 `forceSimulation(…,3).force('link', forceLink).force('charge', forceManyBody).force('center', forceCenter)`，`D3ForceLayout.ts:16` 處預設 `chargeStrength -30`）。為具種子的確定性與不可見 WASM 加速器選擇 `VectoForce`（`VectoForceLayout.ts:108` 具 `VectoForceLayout.ts:196` 處串流的 `enableWasmForce` vs `VectoForceLayout.ts:209` 處位元組的 `enableWasmForceSync` 的 `forceBackend`），遷移已調校手感的既有 `3d-force-graph` 場景時選擇 `D3Force` — 兩者皆可在 `GraphLayout` 後交換，使 `KnowledgeGraphSession` 保持無關。

## 6. 應用陷阱 vs 引擎缺陷 — forge 分割與試吃迴圈

`vectojs-docs/forge/findings/app-level-and-toolchain.md:1` 明確命名分割：應用層發現*非*引擎缺陷，但因診斷耗費實際努力而保留。`forge/findings/README.md` 範本加上按領域索引使 `app-level-and-toolchain` vs `core-*`/`simulation-*`/`text-*` 在審查時無歧義 — 含糊條目漂移至引擎分類並浪費修復預算。狀態為僅附加（`app-level-and-toolchain.md:5`），`Upstream status` 在修正發布時更新（`app-level-and-toolchain.md:8`）。

具代表性的應用陷阱，各為垂直組合的一課：

- **沙盒 iframe 不透明來源**（`app-level-and-toolchain.md:30` 2026-07-16）：motif 畫廊 `sandbox="allow-scripts"` 無 `allow-same-origin` 產生不透明來源；ES 模組 + `importmap` 提取成為 CORS，同源的 `./demo.js` 永不載入 — 空白且無父主控台錯誤。修正：`allow-scripts allow-same-origin` + 真實靜態路由 `src`（`app-level-and-toolchain.md:51`），而非 `srcdoc`（解析為 `about:srcdoc`，`app-level-and-toolchain.md:48`）。對垂直領域的教訓：受信任的第一方嵌入需要真實來源；不受信任程式碼需要獨立子網域而非靜默的 iframe 屬性變更。
- **畫布數量 ≠ 已啟動**（`app-level-and-toolchain.md:66`）：宿主輪詢 `querySelectorAll('canvas').length >= 2` 假設第二個 WebGL 點圖層畫布表示「就緒」— canvas2D 展示與 `ThreeAdapter`（離屏 `canvas`，不在 DOM 中）永不達 2，因此「Loading…」覆蓋永不隱藏。修正：`canvas.width > 0` 後備儲存檢查（`app-level-and-toolchain.md:80`）。教訓：垂直就緒探測必須以 CUDA 後備儲存大小為鍵，而非 DOM 畫布數量；後端數量為實作細節。
- **EPUB 圖片管線**（`app-level-and-toolchain.md:94` 2026-07-19 三重奏）：`body.textContent` 靜默丟棄 `<img>`/SVG `<image>`（`app-level-and-toolchain.md:99`），因此漫畫 EPUB 渲染為空；無 `escapeMarkdown` 的插值 `alt` 使 `foo](javascript:…)` 經 `marked` 重解析成為可點擊連結（`app-level-and-toolchain.md:155`）；`data:image/jpeg;base64,…` 按 `[a-zA-Z0-9]+` 分詞在每個 `+`/`/` 處分割為約 20k token，將 base64 作為胡言亂語逐字打出數分鐘（`app-level-and-toolchain.md:185`）。修正：具 base64 `![alt](data:…)` + `kind:"markdown"` 的遞迴 `xhtmlNodeToMarkdown`（`app-level-and-toolchain.md:103`）、`escapeMarkdown`（`app-level-and-toolchain.md:167`）與作為首個分詞器替代、供原子圖片揭示的 `!\\[[^\\]]*\\]\\([^)]*\\)`（`app-level-and-toolchain.md:204`）。教訓：任何將被重解析的萃取器必須逸出目標格式，打字機分詞器需要非文字原子退出。
- **詞法合併 + `hasPendingAnimations`**（`app-level-and-toolchain.md:222`）：`MathMarkdown.appendMarkdown` 每塊觸發 `marked.lexer`（在累積文字上為 `O(n²)`，`app-level-and-toolchain.md:236`），`StreamReader` 缺乏 `hasPendingAnimations()`，因此當 `update()` 新增零字元時 `onDemand` 場景在串流中閒置（`app-level-and-toolchain.md:246`）。修正：飛行中最多一個詞法 + `docEpoch` 合併（`app-level-and-toolchain.md:254`）與 `hasPendingAnimations() === status==="streaming"`（`app-level-and-toolchain.md:259`）。教訓：任何自 `update()` 內標記 dirty 的實體皆需 `hasPendingAnimations` 否則 `onDemand` 停滯 — `Table` 已於 `Table.ts:378` 具備。
- **無設定的 CodeQL**（`app-level-and-toolchain.md:369` 2026-08-06）：`.github/workflows/codeql.yml` 傳遞 `queries: security-and-quality` 而無 `config-file`，因此引入的 `packages/tex/src/kernel` 點亮 19 個警示（包含 KaTeX `replace("*","")` 中一個高嚴重度誤判，`app-level-and-toolchain.md:375`）。修正：具 `kernel`/`glyphs` 的 `paths-ignore` 的 `.github/codeql/codeql-config.yml`（`app-level-and-toolchain.md:384`）。
- **vendor-katex 順序**（`app-level-and-toolchain.md:337`）：`checkHandWritten()` 在清除 `src/kernel/` 的 `rmSync` 後執行，因此拋出使 `VENDORED.md` 缺失；`--check` 恆虛假地差異 16 行因為它從未在該路徑上寫入清單（`app-level-and-toolchain.md:349`）。修正：在破壞性步驟前驗證，在比較前寫入清單（`app-level-and-toolchain.md:354`）。
- **`sideEffects: false` 殺掉 tex 註冊表**（`app-level-and-toolchain.md:404`）：`packages/tex/package.json` `sideEffects: false` 使 esbuild 丟棄填充 KaTeX 註冊表的裸 `import './x'` — `layout('x')` 拋出 `Got group of unknown type: 'mathord'`（`app-level-and-toolchain.md:407`）。套件保持綠燈因為 `vitest` 對 `@vectojs/*` 別名至 `src/` 且永不載入 `dist/`（`app-level-and-toolchain.md:416`）。修正：`sideEffects: true` + `glyphCodec.test.ts` 中的清單斷言（`app-level-and-toolchain.md:430`）。
- **Bun 快取競爭 + wrangler 備援**（`app-level-and-toolchain.md:15` + `:125`）：發布後 `bun install` 提供混合版本 `dist`（`app-level-and-toolchain.md:17`），`cloudflare/wrangler-action` 備援（`bun i wrangler@3.90.0`）在倉庫無 `wrangler` 相依時 tarball 萃取失敗（`app-level-and-toolchain.md:129`）。修正：`rm -rf node_modules && bun install --force`（`app-level-and-toolchain.md:24`）並將 `wrangler` 固定為 `devDependency`（`app-level-and-toolchain.md:140`）。
- **倉庫衛生**（`app-level-and-toolchain.md:276` 2026-08-06）：已提交的 `node_modules` 使複本膨脹至 75 MB，由 4 個陳舊參考持有 — 無 `main` 可達的 blob；修正為參考刪除 + `git gc --prune=now`（`app-level-and-toolchain.md:299`），全新複本的 `.git` 75M→6.8M（`app-level-and-toolchain.md:324`）。
- **發布衛生**（`app-level-and-toolchain.md:447` 2026-08-15）：`packages/desktop/package.json` 在 `dependencies` 中發布 `workspace:*`（`app-level-and-toolchain.md:455`）因為 CI 從未自 tarball 探測 `bun install`。修正：移至 `peerDependencies` + `devDependencies workspace:*` 匹配 `ui`（`app-level-and-toolchain.md:467`）。
- **基準執行器使 tmp/ 復活**（`app-level-and-toolchain.md:518` 2026-08-24）：`runBenchmarkSuite()` 在 try 前 mkdir（`benchmarks/runner/runner.ts:323`）在每次早期失敗後留下 `tmp/benchmark-runner`；修正將暫存移至 `os.tmpdir()`（`app-level-and-toolchain.md:530`）。

試吃迴圈閉合圓環：`vectojs-native/AGENTS.md` 宣告 `vectojs-native` 為 forge 應用容器（而非倉庫），各自在兄弟 `<app>-docs/` 中記錄自身，僅引擎發現上游至 `vectojs-docs/forge/findings/` — 恰為 `AGENTS.md:18` 警告勿抹除的邊界。`references/` 淺複本為唯讀（`AGENTS.md:28`），重用第三方布局的垂直領域（知識圖譜覆於 `ForceLayout2D`，表格覆於 `Text`）在消費處記錄分歧註記（例如 `editor.ts:117` 循環允許，`FixedZLayout.ts:18` 固定分歧）。網站（`vectojs-website/`）經 `scripts/sync-content.py` 單向消費 `vectojs-docs/content/`（`AGENTS.md:28` 文件章節），因此僅文件的發布無法超越其權威來源 — 垂直領域當其手冊位於 `references/` 旁時需要的同一紀律。

## 7. 登陸垂直變更前值得檢查的陷阱

1. **借用布局的處置** — `KnowledgeGraphModel.dispose()` 絕不可處置借用的布局（`KnowledgeGraphModel.ts:230`）；`KnowledgeGraphSession.dispose()` 必須（`KnowledgeGraphSession.ts:277`）。兩者互換將洩漏或雙重釋放。`KnowledgeGraphSession.ts:153` 處的 `attach(scene)` 具冪等性，必須在 `KnowledgeGraphSession.ts:256` 處的 `render(renderer, scene)` 前呼叫否則拋出 `call attach first`。
2. **游標陳舊** — `MemoryDataSource` 游標版本化（`MemoryDataSource.ts:118`）；`KnowledgeGraphModel.expand` 去重（`KnowledgeGraphModel.ts:134`）與等待後處置中止（`KnowledgeGraphSession.ts:189`/`KnowledgeGraphSession.ts:227`）為對抗分頁中變更的柵欄。`KnowledgeGraphSession.ts:202` 處的 `loadSnapshot` 將每個實體標記為 `complete`，因此選取不重取已存在的跳躍。
3. **埠方向 + 識別** — 編輯器的 `validateLink` 拒絕同節點與錯誤方向埠（`model.ts:131`/`model.ts:138`）；連接預覽 `isConnectionTarget` 經 try-`addLink` 鏡像它（`editor.ts:360`/`editor.ts:549`）。`editor.ts:502` 處的 `findPortAt` 按反向新增順序走訪使重疊卡片解析至最上層埠，`editor.ts:498` 處的 `getLocalPoint` 經 `worldToLocal` 使拖曳/命中保持於編輯器局部空間而非 `sceneX/Y`。
4. **覆蓋層 a11y 洩漏** — `WindowManager.focus`/`close` 必須在模糊時 `releaseA11yProjection`（`WindowManager.ts:248`），`DesktopWindow` 必須保持 `pointerEvents none`（`Window.ts:400`）否則對話鏡像吞噬裝飾點擊。裝飾按鈕需要 `a11yProjection eager`（`Window.ts:383`）否則首次點擊遺漏（下一影格的 `onDemand` 投射），`DisplayLayout.clampRect`（`DisplayLayout.ts:89`）必須用於每個放置（`WindowManager.ts:149`）。
5. **表格視埠數學** — `reconcileVirtualRows`/`_syncGridA11y` 共用相同 `first/last` 邊界（`Table.ts:397`/`Table.ts:662`）與 `overscan`；`Table.ts:344` 處的 `clampScrollPosition` 使彈簧偏移不超調箝制的目標；`Table.ts:751` 處的 `rowTops` 前綴使經典 a11y 為 `O(rows)` 而非 `O(rows²)`。`Table.ts:548` 處的 `pageRows()` 在經典模式下使用平均 `rowHeights`，在虛擬化中為 `viewportHeight - headerHeight`，因此 `PageUp/PageDown` 在兩者中皆保持視埠大小。
6. **發布時執行期相依** — 框架相依屬於 `peerDependencies` + `devDependencies` 中的 `workspace:*`（`app-level-and-toolchain.md:467`）；`npm publish` 逐字發布 `dependencies`（`app-level-and-toolchain.md:473`）。在 forge 應用消費新次版前，經 tarball 消費者探測（於暫存目錄中 `bun add`）驗證。
7. **選取 + 歷史耦合** — `editor.ts:390` 處的 `deleteNodes` 先結束暫態手勢並將節點+關聯連結批次為一個可復原指令；`editor.ts:452` 處 `cancelConnection`/`cancelDrag` 在 `history.execute` 前取消暫態手勢以防止懸空的 `dragDocument` 或待定連接。`editor.ts:274` 處的 `applyAutoLayout` 僅當 JSON 變更時才推入，因此無操作布局不污染復原堆疊。
8. **持久化往返** — `persistence.ts:168` 處的 `exportDocument` 在結構上*與*語意上驗證（`persistence.ts:84` 處 `validateDocument` 具 `persistence.ts:156` 處每連結的 `validateLink`）；`persistence.ts:178` 處的 `importDocument` 拒絕錯誤的 `schemaVersion`（`persistence.ts:186`）。繞過 `exportDocument` 手寫僅通過結構一半的 JSON 仍可在重匯入時對 `target-port-occupied` 或 `incompatible-types` 未通過 `validateLink` — 恆經同一驗證器往返。

## 7a. 值得竊取的跨垂直模式

四個垂直領域，對同一問題的四個答案 — 「增量增長如何保持低成本且可逆？」：

- **知識圖譜：借用而非複製。** `KnowledgeGraphModel` 永不複製布局 — 它借用一個（`KnowledgeGraphModel.ts:43` `layout?: GraphLayout` 文件，「借用而非擁有」）、以 `setGraph` + `reheat` 驅動它，並將處置留給會話（`KnowledgeGraphSession.ts:277`）。任何包裝共用引擎（物理、文字塑形、媒體解碼）的新垂直領域應複製此分割：`KnowledgeGraphModel.ts:225` 處模型的 `dispose` 為六行映射/集合清除並附明確註解「保持不動使其可與即時會話共用」（`KnowledgeGraphModel.ts:230`）。忘記註解即為未來編輯器重添 `this.layout?.dispose()` 並破壞會話的方式。
- **節點編輯器：歷史擁有文件。** 每個變更 — `createLink`（`editor.ts:380` → `addLink` + `history.execute`）、`deleteNodes`（`editor.ts:390` → 批次 `removeNode` + 一個 `history.execute`）、`moveDrag`（`editor.ts:441` → `history.execute('Move node', …)`）、`applyAutoLayout`（`editor.ts:274` → `history.execute('Auto-layout', …)`）— 皆經 `CommandHistory.execute`（`history.ts:28`），後者經 `cloneDocument` 快照 `before`/`after` 並清除 `redoStack`。編輯器永不經 `applyDocument`（`editor.ts:520` → `cloneDocument` + `rebuild` + `markDirty`）外變更 `documentState`。為任何未來畫布編輯器竊取此：一個門控、一個複製紀律、無帶外 `documentState = …`。
- **桌面：覆蓋層擁有焦點而非場景。** `WindowManager` 永不呼叫 `Entity.remove` 重堆疊（`WindowManager.ts:339` `kids.splice` + `markStructureChanged`）因為 `remove` 分離 a11y 並取消註冊 driver — 在每次焦點變更時重創。它經 `focused` + `releaseA11yProjection`/`requestA11yProjection`（`WindowManager.ts:248`/`WindowManager.ts:253`）追蹤焦點，使 `onDemand` 背景視窗不保持永久 a11y 鏡像。桌面 `Wallpaper` 為 `a11yProjection never`（`DesktopShell.ts:26`），`DesktopWindow` 為具 `pointerEvents none` 對話鏡像的 `onDemand`（`Window.ts:400`），`Taskbar` 為 `eager` 因為其按鈕必須無需懸停即可到達（`Taskbar.ts:58`）。任何新外殼表面應刻意選擇三種模式之一，而非預設為 `eager`。
- **表格：開窗、池化、積分。** 虛擬化為三個協作預算：`reconcileVirtualRows` 精確開窗 `overscan` 填充的 `[first, last]`（`Table.ts:397`/`Table.ts:404`）、`_syncGridA11y` 將 `RowHotspot`/`GridCellHotspot` 池化至 `need`（`Table.ts:691`）與 `update(dt)` 以感知 dt 的彈簧積分 `scrollY`（`Table.ts:352` `velY += diff*7.2*(dt/1000)` / `exp(-dt/84)`）。`Table.ts:378` 處的 `hasPendingAnimations` 為使三者皆於 `renderMode onDemand` 下存活的閒置節流握手。複製僅開窗步驟卻忘記 `hasPendingAnimations` 的未來虛擬化列表將正確捲動一次然後停滯 — `StreamReader` 於 `app-level-and-toolchain.md:222` 處的相同錯誤。

## 7b. 驗證 — 如何證明垂直變更正確

垂直領域具應用形態，因此證明亦具應用形態 — 不僅單元測試。

- **知識圖譜：** `just test-pkg knowledge-graph` 涵蓋 `MemoryDataSource` 游標版本化（`MemoryDataSource.ts:118` 陳舊游標拋出）與 `KnowledgeGraphModel` 去重/再加熱（`KnowledgeGraphModel.ts:134`/`:285`）；新增同時呼叫 `model.expand(id)` 兩次並斷言一個 promise 的重現，然後 `cancelExpand` 並斷言 `cancelled` 狀態。對渲染，在有頭瀏覽器（而非 `jsdom`）中驅動 `KnowledgeGraphSession`，在 `syncFromModel` 後斷言 `graph.group.children.length` — `Graph3D` 為 Three.js 且需要真實畫布。

- **節點編輯器：** `just test-pkg node-editor` 演練 `validateLink` 錯誤碼（`model.ts:36` `LinkValidationError`）與 `exportDocument`/`importDocument` 往返（`persistence.ts:168`）；新增當連結為其自身佔用者時處於容量的 `maxConnections` 通過的案例（`persistence.ts:156` 剝離自身邏輯），以及斷言無操作拖曳後 `history.canUndo` 保持 false 的拖曳案例（`editor.ts:445`）。

- **桌面：** `just test-pkg desktop` 涵蓋 `AppRegistry` 與 `DisplayLayout.clampRect`（`DisplayLayout.ts:89`）；新增呼叫 `wm.openDialog({modal:true})` 然後 `wm.focus(other)` 並斷言焦點留在對話框的對話框型態案例（`WindowManager.ts:237` topModal 門控），以及斷言無 `Entity.remove` 的 `overlayRoot.children` 順序的 `restack` 案例（`WindowManager.ts:339`）。

- **表格：** `just test-pkg table` 涵蓋 `normalizeColumnWidths`（`Table.ts:789`）與 `seenCells` 重複拒絕（`Table.ts:228`）；新增設定 `viewportHeight`、呼叫 `appendRows` 10k 次、捲動至 `maxScroll()`（`Table.ts:328`）並斷言 `mountedRows.size` 為 `O(viewport)` 而非 `O(rows)`（`Table.ts:392` 視窗）的虛擬化案例，加上斷言聚焦列捲出後 `isGridTabStop` 重錨定的游動 tab 案例（`Table.ts:668`）。

在每種情況下，推送前執行 `just check`（oxfmt + oxlint + markdownlint）— 垂直文件與程式碼並存並共用同一門控（`AGENTS.md:31` 品質門控）。

## 8. 檢查清單 — 登陸垂直變更前

1. **擁有你的處置。** `KnowledgeGraphModel` 借用，`KnowledgeGraphSession` 擁有（`KnowledgeGraphModel.ts:230` vs `KnowledgeGraphSession.ts:277`）；`DesktopShell.dispose` 於 `DesktopShell.ts:251` 按順序拆解 `shortcuts`/`windowManager`/`taskbar`/`wallpaper`。對每個觸及的 `dispose` 以借用 vs 擁有做 grep。
2. **守衛每個非同步延續。** `bootstrap`/`expand` 皆在 `this.disposed` 後等待時中止（`KnowledgeGraphSession.ts:189`/`KnowledgeGraphSession.ts:227`）；`expand` 按 id 去重（`KnowledgeGraphModel.ts:134`）且 `cancelExpand` 中止（`KnowledgeGraphModel.ts:150`）。無守衛的新 `await` 重引入遲來鏡像錯誤。
3. **結構性投射 a11y。** `Table` 為具 `RowHotspot` 列（`Table.ts:55`）與 `GridCellHotspot` 儲存格（`Table.ts:82`）池化且 `pointerEvents none` 的 `role grid`；`DesktopWindow` 為具 `pointerEvents none`（`Window.ts:400`）的 `role dialog` 與積極的裝飾按鈕（`Window.ts:383`）；`NodeEditor` 埠為具鍵盤來源的 `role button`（`editor.ts:90`）。無 `pointerEvents none` 的結構父節點上的新可互動子節點竊取命中。
4. **保持 `hasPendingAnimations` 誠實。** `Table.ts:378` 處的 `Table` 與 `app-level-and-toolchain.md:259` 處修正後的 `StreamReader` 皆在動畫時回傳 `true`，使 `onDemand` 永不於手勢中閒置。任何內部呼叫 `markDirty` 的新 `update(dt)` 皆需相同覆寫。
5. **發布前驗證。** `packages/desktop` 在 `dependencies` 中因 `workspace:*` 損壞（`app-level-and-toolchain.md:455`）；`packages/tex` 因 `sideEffects: false` 損壞（`app-level-and-toolchain.md:407`）。兩者在 CI 中存活因為 `vitest` 對 `src/` 別名且無消費者探測執行。自 tarball 以 `bun add` 煙霧測試加入發布檢查清單。
6. **在正確的 forge 桶中記錄發現。** `app-level-and-toolchain.md:1` 為僅附加（`app-level-and-toolchain.md:5`）— 永不編輯既有條目，永不在 `core-*`/`simulation-*` 下提交應用陷阱（`forge/findings/README.md` 分類）。此分割使引擎分類不被應用雜訊淹沒，試吃迴圈（`vectojs-native/*/AGENTS.md`）依賴它。

## 9. 未來垂直領域與擴充點

新垂直領域應自已存在的接縫開始，而非自分支。

- **知識圖譜擴充。** 為具 worker 支援或串流來源的 `KgDataSource` 交換（`types.ts:54` 處的 `MaybeAsync<T>` 於 `types.ts:84` 已允許同步或非同步）：頁面大小、`direction: 'out'|'in'|'both'`（`types.ts:64`）與 `signal` 中止為模型需要的唯二旋鈕。時間軸或地圖垂直領域以不同 `GraphLayout`（例如 1D 時間性 `FixedZLayout` 變體或 `ForceLayout2D` 投影）與不同 `Graph3D` 樣式重用 `KnowledgeGraphModel` — `GraphLayout` + `GraphData` 為契約而非力定律。

- **節點編輯器擴充。** `PortDefinition.dataType`（`model.ts:12`）+ `maxConnections`（`model.ts:13`）已建模具型別插槽；`layoutDocument` 選項（`layout.ts:3` `originX/Y`、`horizontalGap`/`verticalGap`）為唯二布局旋鈕。著色器圖或音訊圖垂直領域新增 `NodeData.type` 分支與 `validateLink` `incompatible-types` 規則（`model.ts:140`）而無需觸碰 `history.ts` 或 `selection.ts`。`CommandHistory` 刻意具標籤（`history.ts:4` `label`），因此復原日誌人類可讀。

- **桌面擴充。** `AppRegistry.register` 於 `AppRegistry.ts:15` 為外掛接縫（無需觸碰 `WindowManager` 的執行期註冊），`WindowManager.ts:184` 處的 `openDialog` 為暫態接縫。新應用僅需 `AppDefinition.create: (ctx: AppContext) => Entity`（`types.ts:1`）— `ctx` 攜帶 `scene`、`vfs`、`windowManager`、`close`、`appId`、`windowId`。`ShortcutRouter`（`ShortcutRouter.ts:1`）已命名空間化 `custom` 動作，因此應用可在不與 `open-app`/`close-focused` 碰撞的情況下新增和弦。

- **表格擴充。** `Table` 已對 `TableCell = string | Entity`（`Table.ts:4`）泛型，因此圖表儲存格或火花線垂直領域傳遞 `Entity` 儲存格並擁有其自身 `width/height` — `fitCell`/`setCellSelectable` 按能力探測（`Table.ts:5`），而非按型別標籤。只要新儲存格經 `setMaxWidth` 保持定尺（`Table.ts:6`），虛擬化保持 `O(viewport)`。`Table.ts:885` 處的 `appendRows` 為唯二變更 — `setRows` 將需要 a11y 重錨定與 `seenCells` 失效，這正是其刻意缺席的原因（`Table.ts:870` 文件）。

在每種情況下，新垂直領域的成本為一個新套件加上 `GraphData`/`NodeDocument`/`AppDefinition`/`TableCell` 轉接器 — 而非新引擎。

## 附錄 — 接下來該讀什麼

| 目標                       | 起點                                                                                     | 接著                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 分頁知識圖譜               | `packages/knowledge-graph/src/KnowledgeGraphModel.ts:62` 單一驅動器                      | `KnowledgeGraphSession.ts:67` 連接 → `packages/graph3d/src/Graph3D.ts:28` 呈現    |
| 在展開時保持已穩定節點穩定 | `KnowledgeGraphModel.ts:273` 批次 `loaded` + `KnowledgeGraphModel.ts:332` `rebuildGraph` | `FixedZLayout.ts:22` 箝制 → `GraphLayout.ts:12` 契約                              |
| 新增編輯器指令             | `packages/node-editor/src/history.ts:9` `execute` + `model.ts:126` `validateLink`        | `editor.ts:199` 手勢 → `persistence.ts:84` `validateDocument`                     |
| 開啟桌面應用或對話框       | `packages/desktop/src/WindowManager.ts:126` `open` / `:184` `openDialog`                 | `Window.ts:158` 裝飾 → `DisplayLayout.ts:15` 工作區域 → `AppRegistry.ts:1` 目錄   |
| 匯出/匯入文件              | `packages/node-editor/src/persistence.ts:168` `exportDocument`                           | `persistence.ts:178` `importDocument` → `persistence.ts:84` `validateDocument`    |
| 新增桌面捷徑               | `packages/desktop/src/ShortcutRouter.ts:1` `ShortcutRouter`                              | `DesktopShell.ts:344` `dispatchShortcut` → `types.ts:1` `ShortcutAction`          |
| 超過 10k 列虛擬化表格      | `packages/table/src/Table.ts:144` `viewportHeight`                                       | `Table.ts:392` `reconcileVirtualRows` → `Table.ts:624` 池 → `Table.ts:352` 積分器 |
| 分類新發現                 | `vectojs-docs/forge/findings/app-level-and-toolchain.md:1` 標頭                          | `forge/findings/README.md` 範本 → 正確桶、`Upstream status` 行                    |

> **閱讀接縫：** 圖接縫為 `GraphData`（`graph3d/types.ts`），編輯器接縫為 `NodeDocument` + `validateLink`（`model.ts:54`/`:126`），桌面接縫為 `AppDefinition` + `AppContext`（`types.ts:1`），表格接縫為 `TableCell`（`Table.ts:4`）。無法以一個型別命名其接縫的新垂直領域尚未找到其邊界。

---

*Series: 00 Overview → 01 Selection → 02 Text+Layout → 03 Projection+Virtualization → 04 Streaming Markdown → 05 TeX → 06 VMT Runtime → 07 Renderer → 08 WASM → 09 Three/XR → 10 Video Export → 11 Graph Layout → 12 DevTools → **15 Vertical Apps** → 99 Synthesis.*
