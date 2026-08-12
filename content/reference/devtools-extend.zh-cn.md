+++
title = "Devtools：桥接与插件"
description = "通过 JSON-RPC 桥接从另一份文档驱动 VectoJS 场景，并用你自己的标签页、审计和命令扩展检查器。"
weight = 52
+++

# Devtools：桥接与插件

两个扩展点。**桥接**把整个模型层暴露为 JSON-RPC，因此浏览器扩展、父级 frame 或自动化代理程序可以检查一个它与自己并不共享模块图的场景。**插件协议**让实体作者可以发布自己的检查器标签页、审计和命令。

---

## 桥接协议

```typescript
const DEVTOOLS_PROTOCOL_VERSION = 1;
const DEVTOOLS_CHANNEL = 'vectojs-devtools';

function createDevtoolsBackend(
  scene: Scene,
  transport: DevtoolsTransport,
  options?: DevtoolsBackendOptions,
): { dispose(): void };

function createDevtoolsClient(
  transport: DevtoolsTransport,
  options?: { timeoutMs?: number }, // default 5000
): DevtoolsClient;

interface DevtoolsClient {
  request<T = unknown>(method: DevtoolsMethod, params?: Record<string, unknown>): Promise<T>;
  on(handler: (event: DevtoolsEvent) => void): () => void;
  dispose(): void;
}

interface DevtoolsBackendOptions {
  allowedOrigins?: string[];
  maxTreeNodes?: number; // default 5000
}
```

后端运行在页面一侧，也就是 `Scene` 所在之处。客户端运行在 UI 所在之处。两者都不直接接触 `window` — 那是传输层的职责，这正是让这一对可以在进程内被测试的原因：

```typescript
import {
  createDevtoolsBackend,
  createDevtoolsClient,
  createDirectTransportPair,
} from '@vectojs/devtools/headless';

const { backend, frontend } = createDirectTransportPair();
const server = createDevtoolsBackend(scene, backend);
const client = createDevtoolsClient(frontend, { timeoutMs: 500 });

const { version } = await client.request<{ version: number }>('protocol.version');
const tree = await client.request('tree.get');
const info = await client.request('entity.inspect', { entityId: someId });

server.dispose();
client.dispose();
```

### 方法

全部 21 个，每个都委托给同名的方法层函数：

| 方法                       | 参数                                    | 返回                                             |
| -------------------------- | --------------------------------------- | ------------------------------------------------ |
| `protocol.version`         | —                                       | `{ version: 1 }`                                 |
| `tree.get`                 | —                                       | `{ root, overlay, structureVersion, truncated }` |
| `entity.inspect`           | `entityId`                              | `EntityInfo`                                     |
| `entity.pick`              | `x`, `y`                                | `EntityInfo` 或 `null`                           |
| `entity.highlightGeometry` | `entityId`, `layers?`, `hitSampleStep?` | `HighlightLayer[]`                               |
| `entity.a11yInspect`       | `entityId`                              | `A11yInfo`                                       |
| `scene.audit`              | —                                       | `AuditFinding[]`                                 |
| `scene.a11yAudit`          | —                                       | `A11yFinding[]`                                  |
| `scene.a11yOrder`          | —                                       | `A11yInfo[]`                                     |
| `scene.snapshot`           | —                                       | `SceneSnapshot`                                  |
| `scene.diff`               | `against?`                              | `SnapshotDiff[]`                                 |
| `scene.frameStats`         | —                                       | frame 遥测，未舍入                               |
| `hit.explain`              | `x`, `y`                                | `HitExplanation`                                 |
| `text.inspect`             | `entityId`                              | `TextInspection` 或 `null`                       |
| `markdown.stream`          | `entityId`                              | `MarkdownStreamInfo` 或 `null`                   |
| `gpu.inspect`              | —                                       | `GpuInspection`                                  |
| `plugin.list`              | —                                       | `{ id, label }[]`                                |
| `plugin.rows`              | `id`, `entityId?`                       | `PluginRow[]`                                    |
| `plugin.audit`             | —                                       | `PluginFinding[]`                                |
| `command.list`             | —                                       | `{ id, label }[]`，id 完整限定                   |
| `command.run`              | `commandId`, `entityId?`                | 命令的返回值                                     |

在后端出错、方法未知以及超时时，`request` 都会拒绝。超时删除待处理条目但不发送取消信号，因此一个迟到的响应会被悄然丢弃。`dispose()` 会以 `client disposed` 拒绝每一个进行中的 promise。

### 来源强制

> [!IMPORTANT]
> 来源检查刻意采用 fail-closed，并且会让你惊讶：**省略 `allowedOrigins` 会拒绝每一个携带来源的请求。** 不存在宽松的默认值。一个 `postMessage` 传输必须给出一份显式的白名单：
>
> ```typescript
> createDevtoolsBackend(scene, transport, {
>   allowedOrigins: ['https://panel.example'],
> });
> ```
>
> `createDirectTransportPair` 不提供来源，因此进程内的接线完全绕过了检查 — 这就是为什么上面的示例不需要白名单。
>
> 而**客户端完全不执行任何来源检查**。它只按通道标签过滤，因此任何能向客户端窗口 post 的 frame 都可以注入一个伪造的 `selection`/`structure` 事件，或一个针对可猜测请求 id 的伪造响应。请把桥接客户端当作只接受可信输入：不要把它暴露给你无法控制的页面。

### 事件

后端从不自行发出事件。你的页面代码决定何时发生了改变并发布它：

```typescript
import { publishSelection, publishStructure } from '@vectojs/devtools/headless';

publishSelection(backendTransport, selectedEntity); // or null to clear
publishStructure(backendTransport, scene.structureVersion);
```

两者都是即发即忘，没有排队或去重。在客户端上用 `client.on(handler)` 订阅。

### 状态性与限制

> [!NOTE]
> **`scene.diff` 会变更自己的基线。** 它针对上一张快照做差异，然后替换它，因此调用两次会得到两次_增量_差异，而不是两次针对原始版本的差异。要获得固定基线，请显式传入 `against`。
>
> **`maxTreeNodes` 是两个树共享的一个预算，按根优先消耗。** 一棵达到上限的主树会返回一个 `truncated: true` 的空 `overlay` — 截断总是被报告，从不静默。
>
> **实体索引是耐过时的。** 缓存命中无需重新验证即可胜出，因此一个已从场景移除的实体仍然可以被解析。只有未命中才会触发重建。在重复 id 上，覆盖树实体遮蔽主树的那个。
>
> **每个结果都被强制经过一次 JSON 往返。** `undefined` 变成 `null`，`NaN`/`Infinity` 变成 `null` — 这对 `scene.frameStats` 很重要。一个循环或携带 `BigInt` 的结果会失败该请求，而不是返回部分数据。
>
> **没有版本协商。** 后端回答 `protocol.version`，但从不把传入的版本与自己的做比较；请求不携带版本字段。检查兼容性是前端的工作。

### 传输

```typescript
function createDirectTransportPair(): {
  backend: DevtoolsTransport;
  frontend: DevtoolsTransport;
};
function createWindowTransport(
  target: Window,
  targetOrigin: string,
  source?: Window, // defaults to `target`
): DevtoolsTransport;

interface DevtoolsTransport {
  send(message: DevtoolsMessage): void;
  subscribe(handler: (message: DevtoolsMessage, origin?: string) => void): () => void;
}
```

`createWindowTransport` 向 `target` 发送并在 `source` 上监听。默认的 `source = target` 对常见的扩展和 iframe 场景是错误的 — 在那里你向一个子窗口发送，却在你自己的窗口上监听 — **请在此时显式传入 `source`**。

这个接口只有两个方法，因此一个基于 `MessageChannel`、`BroadcastChannel`、WebSocket 或 CDP 绑定的自定义传输只是一个简短的自适应器。

---

## 插件协议

一个发布了 `getDevtoolsDescriptor()` 的实体已经会出现在 Info 标签页中。插件更进一步：它自己的面板标签页、它自己的审计发现，以及它自己的命令。

```typescript
interface DevtoolsPlugin {
  id: string; // unique; namespaces this plugin's findings
  inspectors?: PluginInspector[];
  audits?: PluginAudit[];
  commands?: PluginCommand[];
}

interface PluginInspector {
  id: string; // tab id and label key; must be unique across plugins
  label: string;
  appliesTo?(entity: Entity): boolean; // defaults to all entities
  rows(context: PluginContext & { selection: Entity }): PluginRow[];
}

interface PluginAudit {
  id: string;
  run(context: PluginContext): PluginFinding[];
}

interface PluginCommand {
  id: string;
  label: string;
  run(context: PluginContext): unknown;
}

interface PluginContext {
  scene: Scene;
  selection: Entity | null;
}

interface PluginRow {
  label: string;
  value: string;
  note?: string; // extra context, shown when the row has room
}

interface PluginFinding {
  kind: string;
  entityId?: string;
  message: string;
  severity?: 'info' | 'warn' | 'error';
}
```

```typescript
import { registerDevtoolsPlugin } from '@vectojs/devtools/headless';

const unregister = registerDevtoolsPlugin({
  id: 'my-chart',
  inspectors: [
    {
      id: 'chart',
      label: 'Chart',
      appliesTo: (e) => e instanceof ChartEntity,
      rows: ({ selection }) => [
        {
          label: 'series',
          value: String((selection as ChartEntity).series.length),
        },
        {
          label: 'scale',
          value: (selection as ChartEntity).scaleMode,
          note: 'from props',
        },
      ],
    },
  ],
  audits: [
    {
      id: 'data',
      run: ({ scene }) =>
        findEmptySeries(scene).map((e) => ({
          kind: 'empty-series',
          entityId: e.id,
          message: 'a chart series has no data points',
          severity: 'warn' as const,
        })),
    },
  ],
});
```

那个发现会以 `my-chart/empty-series` 的形式出现 — `runPluginAudits` 把每个 `kind` 重写为 `` `${plugin.id}/${kind}` ``，因此两个插件无法冲突。

### 注册表函数

```typescript
function registerDevtoolsPlugin(plugin: DevtoolsPlugin): () => void;
function devtoolsPlugins(): DevtoolsPlugin[];
function clearDevtoolsPlugins(): void;
function pluginInspectors(): PluginInspector[];
function pluginInspectorsFor(entity: Entity | null): PluginInspector[];
function pluginCommands(): Array<PluginCommand & { pluginId: string }>;
function runPluginInspector(inspector: PluginInspector, context: PluginContext): PluginRow[];
function runPluginAudits(context: PluginContext): PluginFinding[];
function runPluginCommand(qualifiedId: string, context: PluginContext): unknown;
```

`registerDevtoolsPlugin` 返回一个注销函数。注册同一个 `id` 两次会**静默替换**；返回的 disposer 受身份保护，因此来自一次被替换注册的过期 disposer 是一个无操作，而不是驱逐活动的插件。

`pluginInspectorsFor(entity)` 按 `appliesTo` 过滤；`pluginInspectors()` 返回它们全部而不求值它。`clearDevtoolsPlugins()` 供测试使用。

### 失败隔离

插件是在诊断内部运行的第三方代码，因此插件做的任何事都不能搞坏面板：

| 失败                      | 结果                                                                             |
| ------------------------- | -------------------------------------------------------------------------------- |
| `appliesTo` 抛出异常      | 该检查器被静默排除                                                               |
| `rows` 抛出异常           | 一条携带该消息的单一 `error` 行                                                  |
| `rows` 且没有选中任何东西 | 一行 `— / no selection`；`rows` 绝不被调用                                       |
| 一次审计抛出异常          | 一个合成的 `<pluginId>/audit-failed` 发现，`severity: 'error'`；其他审计仍然运行 |
| 未知的命令 id             | `runPluginCommand` **抛出异常** — 刻意为之，以便调用方不会被交回一个静默的无操作 |
| 一条命令抛出异常          | 传播给调用方；在桥接上它会变成一个被拒绝的请求                                   |

> [!NOTE]
> 注册表是一个模块级全局状态，以插件 id 为键。一个 bundle 中的两份 `@vectojs/devtools` 会得到两个独立的注册表。
>
> `runPluginInspector` **不**检查 `appliesTo` — 那是调用方的工作，面板会单独做。并且 `PluginInspector.id` 的唯一性是必需的但不被强制：注册表以_插件_ id 为键，因此一个重复的检查器 id 会静默丢失一个标签页。
>
> `runPluginCommand` 既接受裸命令 id，也接受 `<pluginId>/<commandId>`。在裸 id 上，它取注册顺序中的第一个匹配，且没有歧义错误，因此请优先使用限定形式。

---

[Devtools 概述](/reference/devtools/) · [检查](/reference/devtools-inspect/) · [审计](/reference/devtools-audit/) · [性能](/reference/devtools-perf/)
