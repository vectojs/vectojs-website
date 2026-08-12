+++
title = "Devtools：ブリッジとプラグイン"
description = "JSON-RPC ブリッジ経由で別のドキュメントから VectoJS シーンを駆動し、独自のタブ、監査、コマンドでインスペクタを拡張します。"
weight = 52
+++

# Devtools：ブリッジとプラグイン

拡張ポイントは2つあります。**ブリッジ**はモデルレイヤー全体を JSON-RPC として公開し、ブラウザ拡張機能、親フレーム、または自動化エージェントが、モジュールグラフを共有していないシーンを検査できるようにします。**プラグインプロトコル**により、エンティティの作者は独自のインスペクタタブ、監査、コマンドを公開できます。

---

## ブリッジプロトコル

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

バックエンドはページ側、つまり `Scene` が存在する場所で実行されます。クライアントは UI が存在する場所で実行されます。どちらも `window` に直接触れません — それはトランスポートの仕事であり、このペアはプロセス内でテストできるのです：

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

### メソッド

21個すべてが、同名のモデルレイヤー関数に委譲します：

| メソッド                   | パラメータ                              | 戻り値                                           |
| -------------------------- | --------------------------------------- | ------------------------------------------------ |
| `protocol.version`         | —                                       | `{ version: 1 }`                                 |
| `tree.get`                 | —                                       | `{ root, overlay, structureVersion, truncated }` |
| `entity.inspect`           | `entityId`                              | `EntityInfo`                                     |
| `entity.pick`              | `x`, `y`                                | `EntityInfo` または `null`                       |
| `entity.highlightGeometry` | `entityId`, `layers?`, `hitSampleStep?` | `HighlightLayer[]`                               |
| `entity.a11yInspect`       | `entityId`                              | `A11yInfo`                                       |
| `scene.audit`              | —                                       | `AuditFinding[]`                                 |
| `scene.a11yAudit`          | —                                       | `A11yFinding[]`                                  |
| `scene.a11yOrder`          | —                                       | `A11yInfo[]`                                     |
| `scene.snapshot`           | —                                       | `SceneSnapshot`                                  |
| `scene.diff`               | `against?`                              | `SnapshotDiff[]`                                 |
| `scene.frameStats`         | —                                       | フレームテレメトリ、丸めなし                     |
| `hit.explain`              | `x`, `y`                                | `HitExplanation`                                 |
| `text.inspect`             | `entityId`                              | `TextInspection` または `null`                   |
| `markdown.stream`          | `entityId`                              | `MarkdownStreamInfo` または `null`               |
| `gpu.inspect`              | —                                       | `GpuInspection`                                  |
| `plugin.list`              | —                                       | `{ id, label }[]`                                |
| `plugin.rows`              | `id`, `entityId?`                       | `PluginRow[]`                                    |
| `plugin.audit`             | —                                       | `PluginFinding[]`                                |
| `command.list`             | —                                       | `{ id, label }[]`、id は完全修飾                 |
| `command.run`              | `commandId`, `entityId?`                | コマンドの戻り値                                 |

`request` は、バックエンドエラー、未知のメソッド、またはタイムアウトで reject します。タイムアウトは保留中の項目を削除しますが、キャンセルは送信されないため、遅延応答は静かに破棄されます。`dispose()` は、進行中の各 promise を `client disposed` で reject します。

### オリジン強制

> [!IMPORTANT]
> オリジンチェックは意図的にフェイルクローズで、あなたを驚かせます：**`allowedOrigins` を省略すると、オリジン付きのすべてのリクエストが拒否されます。** 寛大なデフォルトはありません。`postMessage` トランスポートには明示的な許可リストを与える必要があります：
>
> ```typescript
> createDevtoolsBackend(scene, transport, {
>   allowedOrigins: ['https://panel.example'],
> });
> ```
>
> `createDirectTransportPair` はオリジンを提供しないため、プロセス内配線はこのチェックを完全にバイパスします — そのため上の例では許可リストが不要なのです。
>
> **一方、クライアントはオリジンチェックをまったく行いません。** チャネルラベルによるフィルタリングのみを行うため、クライアントのウィンドウに post できるフレームは、偽の `selection`/`structure` イベントや、推測可能なリクエスト id への偽の応答を注入できます。ブリッジクライアントは信頼できる入力専用として扱ってください：制御できないページに公開しないでください。

### イベント

バックエンドがイベントを発行することはありません。変更がいつ発生したかを決めて公開するのは、あなたのページコードです：

```typescript
import { publishSelection, publishStructure } from '@vectojs/devtools/headless';

publishSelection(backendTransport, selectedEntity); // または null でクリア
publishStructure(backendTransport, scene.structureVersion);
```

どちらもキューや重複排除のない fire-and-forget です。クライアント側では `client.on(handler)` で購読します。

### 状態と制限

> [!NOTE]
> **`scene.diff` は自身のベースラインを変更します。** 最後のスナップショットと比較してから置き換えるため、2回呼び出すと元のスナップショットとの2つの_増分_差分ではなく、2つの増分差分が得られます。ベースラインを固定するには、`against` を明示的に渡してください。
>
> **`maxTreeNodes` は2つのツリーが共有する単一の予算で、ルート優先で消費されます。** 上限に達したメインツリーは `truncated: true` で空の `overlay` を返します — 切り捨ては常に報告され、決して黙殺されません。
>
> **エンティティインデックスは古いデータに対して寛容です。** キャッシュヒットは再検証なしで優先されるため、シーンから削除されたエンティティでも解決できます。再構築が発生するのはミスのときだけです。id が重複した場合、overlay エンティティがメインツリーエンティティを覆い隠します。
>
> **すべての結果は強制的に JSON ラウンドトリップされます。** `undefined` は `null` に、`NaN`/`Infinity` は `null` になります — これは `scene.frameStats` にとって重要です。循環参照や `BigInt` を含む結果は、部分データを返す代わりにリクエストを失敗させます。
>
> **バージョン交渉はありません。** バックエンドは `protocol.version` に応答しますが、受信バージョンを自身と比較することはありません。リクエストにはバージョンフィールドがありません。互換性の確認はフロントエンドの仕事です。

### トランスポート

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

`createWindowTransport` は `target` に post し、`source` でリッスンします。一般的な拡張機能や iframe のシナリオでは、子ウィンドウに post しながら自分のウィンドウをリッスンするため、デフォルトの `source = target` は間違っています — **`source` を明示的に渡してください**。

このインターフェースは2つのメソッドしかないため、`MessageChannel`、`BroadcastChannel`、WebSocket、または CDP バインディングに基づくカスタムトランスポートは、短いアダプタにすぎません。

---

## プラグインプロトコル

`getDevtoolsDescriptor()` を公開するエンティティは、すでに Info タブに表示されます。プラグインはさらに一歩進みます：独自のパネルタブ、独自の監査結果、独自のコマンドです。

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

検出結果は `my-chart/empty-series` として表示されます — `runPluginAudits` は各 `kind` を `` `${plugin.id}/${kind}` `` に書き換えるため、2つのプラグインが衝突することはありません。

### レジストリ関数

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

`registerDevtoolsPlugin` は登録解除関数を返します。同じ `id` に2回登録すると**静かに置き換えられ**ます。返されたディスポーザにはアイデンティティ保護があるため、置き換えられた登録からの古いディスポーザは no-op であり、まだ有効なプラグインを追い出すことはありません。

`pluginInspectorsFor(entity)` は `appliesTo` でフィルタリングします。`pluginInspectors()` は評価せずにすべてを返します。`clearDevtoolsPlugins()` はテスト用です。

### 障害の隔離

プラグインは診断の内部で実行されるサードパーティコードであるため、プラグインが行うことはパネルを壊してはなりません：

| 障害                 | 結果                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `appliesTo` が throw | そのインスペクタは静かにスキップされる                                                     |
| `rows` が throw      | メッセージ付きの単一の `error` 行                                                          |
| 選択なしで `rows`    | `— / no selection` 行；`rows` は呼び出されない                                             |
| 監査が throw         | 合成された `<pluginId>/audit-failed` 検出結果、`severity: 'error'`；他の監査は実行を続ける |
| 未知のコマンド id    | `runPluginCommand` は**throw** — 呼び出し側が静かな no-op を得ないように意図的             |
| コマンドが throw     | 呼び出し側に伝播；ブリッジ経由では reject されたリクエストになる                           |

> [!NOTE]
> レジストリはモジュールレベルのグローバル状態で、プラグイン id をキーとしています。同じバンドル内の `@vectojs/devtools` の2つのコピーは、2つの独立したレジストリを持ちます。
>
> `runPluginInspector` は `appliesTo` を**チェックしません** — それは呼び出し側の仕事であり、パネルは別途実行します。また、`PluginInspector.id` の一意性は必須ですが強制されません：レジストリは_プラグイン_ id をキーとしているため、重複したインスペクタ id はタブを1つ静かに失います。
>
> `runPluginCommand` は、ベアのコマンド id と `<pluginId>/<commandId>` の両方を受け入れます。ベア id の場合、曖昧さエラーなしに登録順で最初に一致するものを取るため、完全修飾形式を優先してください。

---

[Devtools 概要](/reference/devtools/) · [インスペクト](/reference/devtools-inspect/) · [監査](/reference/devtools-audit/) · [パフォーマンス](/reference/devtools-perf/)
