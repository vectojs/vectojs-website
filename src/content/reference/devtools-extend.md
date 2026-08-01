---
title: 'Devtools: bridge & plugins'
description: 'Drive a VectoJS scene from another document over a JSON-RPC bridge, and extend the inspector with your own tabs, audits, and commands.'
order: 52
---

# Devtools: bridge & plugins

Two extension points. The **bridge** exposes the whole model layer as JSON-RPC so a browser extension, a parent frame, or an automation agent can inspect a scene it does not share a module graph with. The **plugin protocol** lets an entity author ship their own inspector tab, audit, and commands.

---

## Bridge protocol

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

The backend runs page-side, where the `Scene` is. The client runs wherever the UI is. Neither touches `window` directly — that is the transport's job, which is what makes the pair testable in-process:

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

### Methods

All 21, each delegating to the model-layer function of the same name:

| Method                     | Params                                  | Returns                                          |
| -------------------------- | --------------------------------------- | ------------------------------------------------ |
| `protocol.version`         | —                                       | `{ version: 1 }`                                 |
| `tree.get`                 | —                                       | `{ root, overlay, structureVersion, truncated }` |
| `entity.inspect`           | `entityId`                              | `EntityInfo`                                     |
| `entity.pick`              | `x`, `y`                                | `EntityInfo` or `null`                           |
| `entity.highlightGeometry` | `entityId`, `layers?`, `hitSampleStep?` | `HighlightLayer[]`                               |
| `entity.a11yInspect`       | `entityId`                              | `A11yInfo`                                       |
| `scene.audit`              | —                                       | `AuditFinding[]`                                 |
| `scene.a11yAudit`          | —                                       | `A11yFinding[]`                                  |
| `scene.a11yOrder`          | —                                       | `A11yInfo[]`                                     |
| `scene.snapshot`           | —                                       | `SceneSnapshot`                                  |
| `scene.diff`               | `against?`                              | `SnapshotDiff[]`                                 |
| `scene.frameStats`         | —                                       | frame telemetry, unrounded                       |
| `hit.explain`              | `x`, `y`                                | `HitExplanation`                                 |
| `text.inspect`             | `entityId`                              | `TextInspection` or `null`                       |
| `markdown.stream`          | `entityId`                              | `MarkdownStreamInfo` or `null`                   |
| `gpu.inspect`              | —                                       | `GpuInspection`                                  |
| `plugin.list`              | —                                       | `{ id, label }[]`                                |
| `plugin.rows`              | `id`, `entityId?`                       | `PluginRow[]`                                    |
| `plugin.audit`             | —                                       | `PluginFinding[]`                                |
| `command.list`             | —                                       | `{ id, label }[]`, ids fully qualified           |
| `command.run`              | `commandId`, `entityId?`                | the command's return value                       |

`request` rejects on a backend error, on an unknown method, and on timeout. A timeout deletes the pending entry but sends no cancellation, so a late response is dropped silently. `dispose()` rejects every in-flight promise with `client disposed`.

### Origin enforcement

> [!IMPORTANT]
> The origin check is deliberately fail-closed and will surprise you: **omitting `allowedOrigins` refuses every origin-bearing request.** There is no permissive default. A `postMessage` transport must be given an explicit allowlist:
>
> ```typescript
> createDevtoolsBackend(scene, transport, {
>   allowedOrigins: ['https://panel.example'],
> });
> ```
>
> `createDirectTransportPair` supplies no origin, so in-process wiring bypasses the check entirely — which is why the example above needs no allowlist.
>
> The **client, meanwhile, performs no origin check at all**. It filters only on the channel tag, so any frame that can post to the client's window can inject a fake `selection`/`structure` event or a fake response for a guessable request id. Treat a bridge client as trusted-input-only: do not expose one to a page you do not control.

### Events

The backend never emits events on its own. Your page code decides when something changed and publishes it:

```typescript
import { publishSelection, publishStructure } from '@vectojs/devtools/headless';

publishSelection(backendTransport, selectedEntity); // or null to clear
publishStructure(backendTransport, scene.structureVersion);
```

Both are fire-and-forget, with no queueing or dedup. Subscribe on the client with `client.on(handler)`.

### Statefulness and limits

> [!NOTE]
> **`scene.diff` mutates its own baseline.** It diffs against the last snapshot and then replaces it, so calling it twice gives two _incremental_ diffs rather than two diffs against the original. Pass `against` explicitly for a fixed baseline.
>
> **`maxTreeNodes` is one budget shared by both trees, consumed root-first.** A main tree at the cap returns an empty `overlay` with `truncated: true` — truncation is always reported, never silent.
>
> **The entity index is stale-tolerant.** A cache hit wins without revalidation, so an entity removed from the scene can still resolve. Only a miss triggers a rebuild. On a duplicate id, the overlay entity shadows the main-tree one.
>
> **Every result is forced through a JSON round-trip.** `undefined` becomes `null`, and `NaN`/`Infinity` become `null` — which matters for `scene.frameStats`. A circular or `BigInt`-bearing result fails the request rather than returning partial data.
>
> **There is no version negotiation.** The backend answers `protocol.version` but never compares an incoming version to its own; requests carry no version field. Checking compatibility is the frontend's job.

### Transports

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

`createWindowTransport` posts to `target` and listens on `source`. The default `source = target` is wrong for the common extension and iframe case, where you post to a child but listen on your own window — **pass `source` explicitly** there.

The interface is two methods, so a custom transport over a `MessageChannel`, a `BroadcastChannel`, a WebSocket, or a CDP binding is a short adapter.

---

## Plugin protocol

An entity that publishes `getDevtoolsDescriptor()` already shows up in the Info tab. A plugin goes further: its own panel tab, its own audit findings, and its own commands.

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

That finding surfaces as `my-chart/empty-series` — `runPluginAudits` rewrites every `kind` to `` `${plugin.id}/${kind}` `` so two plugins cannot collide.

### Registry functions

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

`registerDevtoolsPlugin` returns an unregister function. Registering the same `id` twice **replaces silently**; the returned disposer is identity-guarded, so a stale one from a replaced registration is a no-op rather than evicting the live plugin.

`pluginInspectorsFor(entity)` filters by `appliesTo`; `pluginInspectors()` returns all of them without evaluating it. `clearDevtoolsPlugins()` is for tests.

### Failure containment

Plugins are third-party code running inside a diagnostic, so nothing a plugin does can break the panel:

| Failure                      | Result                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `appliesTo` throws           | that inspector is silently excluded                                                        |
| `rows` throws                | a single `error` row carrying the message                                                  |
| `rows` with nothing selected | a `— / no selection` row; `rows` is never called                                           |
| an audit throws              | a synthetic `<pluginId>/audit-failed` finding, `severity: 'error'`; other audits still run |
| unknown command id           | `runPluginCommand` **throws** — deliberately, so a caller is not handed a silent no-op     |
| a command throws             | propagates to the caller; over the bridge it becomes a rejected request                    |

> [!NOTE]
> The registry is module-level global state, keyed by plugin id. Two copies of `@vectojs/devtools` in one bundle get two independent registries.
>
> `runPluginInspector` does **not** check `appliesTo` — that is the caller's job, and the panel does it separately. And `PluginInspector.id` uniqueness is required but unenforced: the registry is keyed by _plugin_ id, so a duplicate inspector id silently loses a tab.
>
> `runPluginCommand` accepts a bare command id as well as `<pluginId>/<commandId>`. On a bare id it takes the first match in registration order, with no ambiguity error, so prefer the qualified form.

---

[Devtools overview](/reference/devtools/) · [Inspecting](/reference/devtools-inspect/) · [Auditing](/reference/devtools-audit/) · [Performance](/reference/devtools-perf/)
