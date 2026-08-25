+++
title = "@vectojs/node-editor"
description = "畫布原生的節點編輯器實體：型別化文件模型、可復原命令、鍵盤可達的埠與連線、嚴格的持久化驗證，以及確定性的分層自動佈局。"
weight = 48
+++

# `@vectojs/node-editor`

文件版本：**0.2.0**

`@vectojs/node-editor` 是一個由 VectoJS 原語構建的節點圖編輯器：一個 `Entity` 子類別（`NodeEditor`），把 `NodeDocument` 中的型別化節點與連結渲染為 canvas 卡片，外加渲染器中立的輔助函式用於文件變更、選取、歷史、持久化和分層自動佈局。文件助手是普通資料上的普通函式——可在測試中無頭使用，無需實例化任何實體。

```bash
bun add @vectojs/node-editor
```

```ts
import { NodeEditor } from '@vectojs/node-editor';

const editor = new NodeEditor({ width: 1000, height: 700 });
scene.add(editor);
```

## 文件模型

```ts
interface NodeDocument {
  nodes: readonly NodeData[];
  links: readonly LinkData[];
}

interface NodeData {
  id: string;
  type: string;
  title: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  ports?: readonly PortDefinition[]; // id, label?, direction 'input'|'output', dataType?, maxConnections?
  data?: Readonly<Record<string, unknown>>;
}

interface LinkData {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
  data?: Readonly<Record<string, unknown>>;
}
```

變更操作回傳全新文件，從不修改其輸入：

- `createDocument(doc?)` / `cloneDocument(doc)` —— 深拷貝巢狀的 `data`，因此歷史快照永遠不會別名化被就地修改的記錄。
- `addLink(document, link)` —— 先驗證（見下文），否則拋出 `Invalid link: <error>`。
- `removeLink(document, id)`。
- `removeNode(document, id)` —— 同時丟棄該節點**和觸碰它的每條連結**（`0.2.0+`），使剩餘文件保持參照有效。與 `removeLink` 相同的複製語義：全新陣列，節點/連結物件共享。

### `validateLink` —— 連結規則集

每個候選連結都會對照文件其餘部分進行檢查：

| 錯誤                                              | 條件                                        |
| ------------------------------------------------- | ------------------------------------------- |
| `missing-source-node`                             | 來源 id 未命名任何節點                      |
| `missing-target-node`                             | 目標 id 未命名任何節點                      |
| `same-node`                                       | 自環 —— 被拒絕                              |
| `duplicate-link-id`                               | 已存在攜帶該 id 的連結                      |
| `missing-source-port` / `missing-target-port`     | 命名的埠在其端點上不存在                    |
| `source-port-direction` / `target-port-direction` | 輸出埠被用作目標，或反之                    |
| `incompatible-types`                              | 兩個埠宣告的 `dataType` 不同                |
| `duplicate-link`                                  | 相同的端點四元組已被連接                    |
| `target-port-occupied`                            | 輸入埠的 `maxConnections`（預設 1）已達上限 |

環策略：自環被拒絕；跨多個節點的環是允許的——圖是使用者創作的流，`layoutDocument` 透過將強連通分量一起排名來容忍環。

## 選取

`SelectionState` 追蹤選取的 id：`select(id, additive?)`、`has(id)`、`clear()`，以及用於迭代安全快照的 `list()`（`0.2.0+` —— 先前的 `toggle()` 已被移除；改為用 `has()` + `select()` 建構累加選取）。`selectedIds` 仍是 `list()` 的即時副本別名。

## 歷史

`CommandHistory` 按命令對整份文件做快照：`execute(label, after)`、`undo()`、`redo()`，以及表示目前狀態的 `currentDocument`（`0.2.0+`；重複的 `.document` getter 已被移除）。編輯器做出的每次變更都是一條可復原命令，因此復原/重做絕不會落在手勢中間。

## `NodeEditor` —— 實體

```ts
new NodeEditor(options?: { document?: NodeDocument; width?: number; height?: number })
```

編輯器為每個節點投影一張卡片、在每個已定義埠處投影埠熱點、每條連結投影一條線。它公開 `document`（防禦性克隆）、`selection`、`canUndo`/`canRedo`，以及這些變更器——每條都是單個可復原命令：

- `createLink(link)` / `deleteLink(id)`。
- `deleteNodes(ids)`（`0.2.0+`）—— 在單條 `'Delete nodes'` 命令中移除給定節點及每條相連連結。它會先結束任何進行中的連接或拖拽並在之後清空選取；匹配不到節點的 id 會被忽略，沒有任何匹配則不產生歷史條目。
- `select(id, additive?)`。
- `applyAutoLayout(options?)` —— 執行 `layoutDocument`，並在其確實改變了內容時提交。
- `undo()` / `redo()` —— 兩者都會先結束任何進行中的拖拽或連接，因此拖拽中途按 Ctrl+Z 不會傳送被拖拽節點或提交偽造條目。

### 鍵盤互動（WCAG 2.1.1）

| 按鍵                    | 動作                                        |
| ----------------------- | ------------------------------------------- |
| `Delete` / `Backspace`  | `deleteNodes(selection.list())`（`0.2.0+`） |
| `Escape`                | 取消待定的連接或活動拖拽；播報取消          |
| Ctrl/Cmd+`Z`, Shift+`Z` | 復原 / 重做                                 |
| Ctrl/Cmd+`Y`            | 重做                                        |

埠本身是鍵盤可達的：每個熱點投影為可聚焦的 `role="button"`，啟動輸出埠會武裝一個待定連接，而啟動輸入埠會提交它。只有真正的鍵盤合成（在聚焦熱點上按 Enter/Space）驅動這個手勢——在埠上單純點擊指標絕不會留下幽靈待定連接。

### 狀態播報

待定的鍵盤連接沒有指標，因此也沒有橡皮筋線，它的轉換透過一個不可見的聚合 live region（`role="status"`、`aria-live="polite"`）播報：武裝時（"Linking from …"）、連結提交後（"Link created."）以及 Escape 取消。指標手勢保留其可見回饋且不被播報。

### 座標

拖拽增量、連接定位和橡皮筋線都在編輯器自己的文件局部空間中工作，因此在縮放或平移的祖先下它們保持正確。連接落點以逆新增順序解析，因此重疊的卡片會接線到最上層（最後渲染）卡片的埠，而不是下方被遮住的卡片。

## 持久化

```ts
import { NodeEditorPersistence, NODE_EDITOR_SCHEMA_VERSION } from '@vectojs/node-editor';

const persistence = new NodeEditorPersistence();
const json = persistence.exportDocument(editor.document); // schemaVersion-stamped
const doc = persistence.importDocument(json);
```

`exportDocument`/`importDocument` 攜帶 `NODE_EDITOR_SCHEMA_VERSION`（1）；`serializeDocument`/`deserializeDocument` 是不帶版本的配對。匯入驗證是結構性的**也是**語意性的（`0.2.0+`）：除了陣列/字串/有限數字形狀檢查之外，每條連結都會針對文件其餘部分執行執行時的 `validateLink`。自環、重複端點對、重複連結 id 以及埠方向/型別/maxConnections 違規現在會以 `links[i]: <verdict.error>` 拒絕——持久化的文件保證能在編輯器中重建，而在以前文件可能包含刪除後無法重建的連結。

## 自動佈局

`layoutDocument(document, options?)` 分配確定性的來源到目標層：節點按 id 排序，強連通分量一起排名（Tarjan SCC，然後在分量 DAG 上求最長路徑），位置落在 `originX + rank × horizontalGap`、`originY + index × verticalGap`（預設 `260`/`120`）。它絕不修改其輸入。

## 相關

[`@vectojs/graph-layout`](/reference/graph-layout/) 用於唯讀圖的力導向排布 ·
[`@vectojs/core`](/reference/core-api/) 用於編輯器所依賴的 `Entity` 生命週期。
