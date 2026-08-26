+++
title = "@vectojs/node-editor"
description = "画布原生的节点编辑器实体：类型化文档模型、可撤销命令、键盘可达的端口与连接、严格的持久化校验，以及确定性的分层自动布局。"
weight = 48
+++

# `@vectojs/node-editor`

记录的版本：**0.2.0**

`@vectojs/node-editor` 是一个由 VectoJS 原语构建的节点图编辑器：一个 `Entity` 子类（`NodeEditor`），把 `NodeDocument` 中的类型化节点与链接渲染为 canvas 卡片，外加渲染器中立的辅助函数用于文档变更、选择、历史、持久化和分层自动布局。文档助手是普通数据上的普通函数——可在测试中无头使用，无需实例化任何实体。

```bash
bun add @vectojs/node-editor
```

```ts
import { NodeEditor } from '@vectojs/node-editor';

const editor = new NodeEditor({ width: 1000, height: 700 });
scene.add(editor);
```

## 文档模型

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

变更操作返回全新文档，从不修改其输入：

- `createDocument(doc?)` / `cloneDocument(doc)` —— 深拷贝嵌套的 `data`，因此历史快照永远不会别名化被就地修改的记录。
- `addLink(document, link)` —— 先验证（见下文），否则抛出 `Invalid link: <error>`。
- `removeLink(document, id)`。
- `removeNode(document, id)` —— 同时丢弃该节点**和触碰它的每条链接**（`0.2.0+`），使剩余文档保持引用有效。与 `removeLink` 相同的复制语义：全新数组，节点/链接对象共享。

### `validateLink` —— 链接规则集

每个候选链接都会对照文档其余部分进行检查：

| 错误                                              | 条件                                          |
| ------------------------------------------------- | --------------------------------------------- |
| `missing-source-node`                             | 源 id 未命名任何节点                          |
| `missing-target-node`                             | 目标 id 未命名任何节点                        |
| `same-node`                                       | 自环 —— 被拒绝                                |
| `duplicate-link-id`                               | 已存在携带该 id 的链接                        |
| `missing-source-port` / `missing-target-port`     | 命名的端口在其端点上不存在                    |
| `source-port-direction` / `target-port-direction` | 输出端口被用作目标，或反之                    |
| `incompatible-types`                              | 两个端口声明的 `dataType` 不同                |
| `duplicate-link`                                  | 相同的端点四元组已被连接                      |
| `target-port-occupied`                            | 输入端口的 `maxConnections`（默认 1）已达上限 |

环策略：自环被拒绝；跨多个节点的环是允许的——图是用户创作的流，`layoutDocument` 通过将强连通分量一起排名来容忍环。

## 选择

`SelectionState` 跟踪选中的 id：`select(id, additive?)`、`has(id)`、`clear()`，以及用于迭代安全快照的 `list()`（`0.2.0+` —— 先前的 `toggle()` 已被移除；改为用 `has()` + `select()` 构建累加选择）。`selectedIds` 仍是 `list()` 的实时副本别名。

## 历史

`CommandHistory` 按命令对整个文档做快照：`execute(label, after)`、`undo()`、`redo()`，以及表示当前状态的 `currentDocument`（`0.2.0+`；重复的 `.document` getter 已被移除）。编辑器做出的每次变更都是一条可撤销命令，因此撤销/重做绝不会落在手势中间。

## `NodeEditor` —— 实体

```ts
new NodeEditor(options?: { document?: NodeDocument; width?: number; height?: number })
```

编辑器为每个节点投影一张卡片、在每个已定义端口处投影端口热点、每条链接投影一条线。它暴露 `document`（防御性克隆）、`selection`、`canUndo`/`canRedo`，以及这些变更器——每条都是单个可撤销命令：

- `createLink(link)` / `deleteLink(id)`。
- `deleteNodes(ids)`（`0.2.0+`）—— 在单条 `'Delete nodes'` 命令中移除给定节点及每条关联链接。它会先结束任何进行中的连接或拖拽并在之后清空选择；匹配不到节点的 id 会被忽略，没有任何匹配则不产生历史条目。
- `select(id, additive?)`。
- `applyAutoLayout(options?)` —— 运行 `layoutDocument`，并在其确实改变了内容时提交。
- `undo()` / `redo()` —— 两者都会先结束任何进行中的拖拽或连接，因此拖拽中途按 Ctrl+Z 不会传送被拖拽节点或提交伪造条目。

### 键盘交互（WCAG 2.1.1）

| 按键                    | 动作                                        |
| ----------------------- | ------------------------------------------- |
| `Delete` / `Backspace`  | `deleteNodes(selection.list())`（`0.2.0+`） |
| `Escape`                | 取消待定的连接或活动拖拽；播报取消          |
| Ctrl/Cmd+`Z`, Shift+`Z` | 撤销 / 重做                                 |
| Ctrl/Cmd+`Y`            | 重做                                        |

端口本身是键盘可达的：每个热点投影为可聚焦的 `role="button"`，激活输出端口会武装一个待定连接，而激活输入端口会提交它。只有真正的键盘合成（在聚焦热点上按 Enter/Space）驱动这个手势——在端口上单纯点击指针绝不会留下幻影待定连接。

### 状态播报

待定的键盘连接没有指针，因此也没有橡皮筋线，它的转换通过一个不可见的聚合 live region（`role="status"`、`aria-live="polite"`）播报：武装时（"Linking from …"）、链接提交后（"Link created."）以及 Escape 取消。指针手势保留其可见反馈且不被播报。

### 坐标

拖拽增量、连接定位和橡皮筋线都在编辑器自己的文档局部空间中工作，因此在缩放或平移的祖先下它们保持正确。连接落点以逆添加顺序解析，因此重叠的卡片会接线到最上层（最后渲染）卡片的端口，而不是下方被遮住的卡片。

## 持久化

```ts
import {
  nodeEditorPersistence,
  exportDocument,
  importDocument,
  NODE_EDITOR_SCHEMA_VERSION,
} from '@vectojs/node-editor';

// The persistence API is a ready-made object plus equivalent free functions —
// there is no exported class to construct.
const json = nodeEditorPersistence.exportDocument(editor.document); // schemaVersion-stamped
const doc = nodeEditorPersistence.importDocument(json);
// Same operations, stateless form:
const json2 = exportDocument(editor.document);
const doc2 = importDocument(json2);
```

`exportDocument`/`importDocument` 携带 `NODE_EDITOR_SCHEMA_VERSION`（1）；`serializeDocument`/`deserializeDocument` 是不带版本的配对。导入验证是结构性的**也是**语义性的（`0.2.0+`）：除了数组/字符串/有限数字形状检查之外，每条链接都会针对文档其余部分运行运行时的 `validateLink`。自环、重复端点对、重复链接 id 以及端口方向/类型/maxConnections 违规现在会以 `links[i]: <verdict.error>` 拒绝——持久化的文档保证能在编辑器中重建，而在以前文档可能包含删除后无法重建的链接。

## 自动布局

`layoutDocument(document, options?)` 分配确定性的源到目标层：节点按 id 排序，强连通分量一起排名（Tarjan SCC，然后在分量 DAG 上求最长路径），位置落在 `originX + rank × horizontalGap`、`originY + index × verticalGap`（默认 `260`/`120`）。它绝不修改其输入。

## 相关

[`@vectojs/graph-layout`](/reference/graph-layout/) 用于只读图的力导向排布 ·
[`@vectojs/core`](/reference/core-api/) 用于编辑器所依赖的 `Entity` 生命周期。
