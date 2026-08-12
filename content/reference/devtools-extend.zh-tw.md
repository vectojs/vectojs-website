+++
title = "Devtools：橋接與外掛程式"
description = "透過 JSON-RPC 橋接從另一份文件驅動 VectoJS 場景，並以您自己的標籤頁、稽核和指令擴充檢查器。"
weight = 52
+++

# Devtools：橋接與外掛程式

兩個擴充點。**橋接**將整個模型層暴露為 JSON-RPC，讓瀏覽器擴充功能、父層 frame 或自動化代理程式可以檢查它們不共享模組圖的場景。**外掛程式協定**讓實體作者發布自己的檢查器標籤頁、稽核和指令。

---

## 橋接協定

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

後端在頁面端執行，也就是 `Scene` 所在之處。用戶端在 UI 所在之處執行。兩者都不直接碰觸 `window` — 那是傳輸的工作，這正是這對組合可以在程序中進行測試的原因：

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

全部 21 個，每個都委派給同名的模型層函數：

| 方法                       | 參數                                    | 回傳值                                           |
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
| `scene.frameStats`         | —                                       | 幀遙測，未四捨五入                               |
| `hit.explain`              | `x`, `y`                                | `HitExplanation`                                 |
| `text.inspect`             | `entityId`                              | `TextInspection` 或 `null`                       |
| `markdown.stream`          | `entityId`                              | `MarkdownStreamInfo` 或 `null`                   |
| `gpu.inspect`              | —                                       | `GpuInspection`                                  |
| `plugin.list`              | —                                       | `{ id, label }[]`                                |
| `plugin.rows`              | `id`, `entityId?`                       | `PluginRow[]`                                    |
| `plugin.audit`             | —                                       | `PluginFinding[]`                                |
| `command.list`             | —                                       | `{ id, label }[]`，id 為完整限定                 |
| `command.run`              | `commandId`, `entityId?`                | 指令的回傳值                                     |

`request` 在後端錯誤、未知方法或逾時時會 reject。逾時會刪除擱置的項目，但不會送出取消，因此遲到的回應會被靜默丟棄。`dispose()` 會以 `client disposed` reject 每個在途的 promise。

### 來源強制

> [!IMPORTANT]
> 來源檢查刻意採用「失敗即關閉」並會讓您意外：**省略 `allowedOrigins` 會拒絕所有帶來源的請求。** 沒有寬鬆的預設值。`postMessage` 傳輸必須給予明確的允許清單：
>
> ```typescript
> createDevtoolsBackend(scene, transport, {
>   allowedOrigins: ['https://panel.example'],
> });
> ```
>
> `createDirectTransportPair` 不提供來源，因此程序內配線完全繞過此檢查 — 這就是為什麼上面的範例不需要允許清單。
>
> **與此同時，用戶端完全不執行來源檢查。** 它只依頻道標籤過濾，因此任何可以 post 到用戶端視窗的 frame 都可以注入假的 `selection`/`structure` 事件，或針對可猜測的請求 id 注入假回應。請將橋接用戶端視為僅限受信任輸入：不要將其暴露給您無法控制的頁面。

### 事件

後端從不自行發出事件。您的頁面程式碼決定何時發生變更並發布它：

```typescript
import { publishSelection, publishStructure } from '@vectojs/devtools/headless';

publishSelection(backendTransport, selectedEntity); // 或 null 以清除
publishStructure(backendTransport, scene.structureVersion);
```

兩者都是發送後即忘，沒有佇列或去重。在用戶端使用 `client.on(handler)` 訂閱。

### 狀態性與限制

> [!NOTE]
> **`scene.diff` 會變更自己的基準線。** 它與最後一個快照進行差異比較，然後替換它，因此呼叫兩次會得到兩個_增量_差異，而不是兩個與原始檔的差異。若要固定基準線，請明確傳入 `against`。
>
> **`maxTreeNodes` 是兩棵樹共享的單一預算，從根部優先消耗。** 達到上限的主樹會以 `truncated: true` 回傳空的 `overlay` — 截斷永遠會被回報，絕不靜默。
>
> **實體索引對過時資料具有容忍度。** 快取命中會勝出且不重新驗證，因此已從場景移除的實體仍然可以解析。只有未命中才會觸發重建。在重複 id 的情況下，overlay 實體會遮蔽主樹實體。
>
> **每個結果都會強制通過 JSON 往返。** `undefined` 變成 `null`，`NaN`/`Infinity` 變成 `null` — 這對 `scene.frameStats` 很重要。帶有循環或 `BigInt` 的結果會使請求失敗，而不是回傳部分資料。
>
> **沒有版本協商。** 後端回答 `protocol.version`，但從不將傳入的版本與自己的版本進行比較；請求不帶版本欄位。檢查相容性是前端的工作。

### 傳輸

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

`createWindowTransport` post 到 `target` 並在 `source` 上監聽。預設的 `source = target` 在常見的擴充功能和 iframe 情境中是錯誤的 — 在這種情境中，您 post 到子視窗但監聽自己的視窗 — **請明確傳入 `source`**。

這個介面只有兩個方法，因此基於 `MessageChannel`、`BroadcastChannel`、WebSocket 或 CDP 綁定的自訂傳輸只是一個簡短的轉接器。

---

## 外掛程式協定

發布 `getDevtoolsDescriptor()` 的實體已經會出現在 Info 標籤頁中。外掛程式更進一步：自己的面板標籤頁、自己的稽核發現項和自己的指令。

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

該發現項以 `my-chart/empty-series` 的形式呈現 — `runPluginAudits` 會將每個 `kind` 重寫為 `` `${plugin.id}/${kind}` ``，這樣兩個外掛程式就不會衝突。

### 註冊表函數

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

`registerDevtoolsPlugin` 回傳取消註冊函數。對同一個 `id` 註冊兩次會**靜默取代**；回傳的處置器有身分保護，因此來自被取代註冊的過時處置器是 no-op，而不是驅逐仍然有效的外掛程式。

`pluginInspectorsFor(entity)` 依 `appliesTo` 過濾；`pluginInspectors()` 回傳全部而不評估它。`clearDevtoolsPlugins()` 用於測試。

### 失敗隔離

外掛程式是在診斷內部執行的第三方程式碼，因此外掛程式做的任何事情都不能破壞面板：

| 失敗                  | 結果                                                                         |
| --------------------- | ---------------------------------------------------------------------------- |
| `appliesTo` 拋出      | 該檢查器被靜默排除                                                           |
| `rows` 拋出           | 單一 `error` 列，帶有訊息                                                    |
| `rows` 但沒有選取內容 | `— / no selection` 列；`rows` 從不被呼叫                                     |
| 稽核拋出              | 合成 `<pluginId>/audit-failed` 發現項，`severity: 'error'`；其他稽核仍然執行 |
| 未知的指令 id         | `runPluginCommand` **拋出** — 刻意如此，這樣呼叫端就不會得到靜默的 no-op     |
| 指令拋出              | 傳播給呼叫端；透過橋接會變成被 reject 的請求                                 |

> [!NOTE]
> 註冊表是模組層級的全域狀態，以外掛程式 id 為鍵。同一個 bundle 中的兩份 `@vectojs/devtools` 會有兩個獨立的註冊表。
>
> `runPluginInspector` **不**檢查 `appliesTo` — 那是呼叫端的工作，而面板會另外執行。而且 `PluginInspector.id` 的唯一性是必需的但未強制執行：註冊表以_外掛程式_ id 為鍵，因此重複的檢查器 id 會靜默失去一個標籤頁。
>
> `runPluginCommand` 接受裸指令 id 以及 `<pluginId>/<commandId>`。對於裸 id，它按註冊順序取第一個相符者，沒有歧義錯誤，因此請優先使用完整限定形式。

---

[Devtools 概覽](/reference/devtools/) · [檢查](/reference/devtools-inspect/) · [稽核](/reference/devtools-audit/) · [效能](/reference/devtools-perf/)
