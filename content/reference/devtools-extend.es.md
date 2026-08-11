+++
title = "Devtools: puente y plugins"
description = "Conduce una escena de VectoJS desde otro documento mediante un puente JSON-RPC, y extiende el inspector con tus propias pestañas, auditorías y comandos."
weight = 52

[extra]
order = 52
+++

# Devtools: puente y plugins

Dos puntos de extensión. El **puente** expone toda la capa de modelo como JSON-RPC para que una extensión de navegador, un frame padre o un agente de automatización pueda inspeccionar una escena con la que no comparte un grafo de módulos. El **protocolo de plugin** permite a un autor de entidad embarcar su propia pestaña de inspector, auditoría y comandos.

---

## Protocolo de puente

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

El backend se ejecuta en el lado de la página, donde está la `Scene`. El cliente se ejecuta donde esté la UI. Ninguno toca `window` directamente — ese es el trabajo del transport, que es lo que hace que el par sea testeable en proceso:

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

### Métodos

Los 21, cada uno delegando en la función de capa de modelo del mismo nombre:

| Método                     | Parámetros                              | Devuelve                                         |
| -------------------------- | --------------------------------------- | ------------------------------------------------ |
| `protocol.version`         | —                                       | `{ version: 1 }`                                 |
| `tree.get`                 | —                                       | `{ root, overlay, structureVersion, truncated }` |
| `entity.inspect`           | `entityId`                              | `EntityInfo`                                     |
| `entity.pick`              | `x`, `y`                                | `EntityInfo` o `null`                            |
| `entity.highlightGeometry` | `entityId`, `layers?`, `hitSampleStep?` | `HighlightLayer[]`                               |
| `entity.a11yInspect`       | `entityId`                              | `A11yInfo`                                       |
| `scene.audit`              | —                                       | `AuditFinding[]`                                 |
| `scene.a11yAudit`          | —                                       | `A11yFinding[]`                                  |
| `scene.a11yOrder`          | —                                       | `A11yInfo[]`                                     |
| `scene.snapshot`           | —                                       | `SceneSnapshot`                                  |
| `scene.diff`               | `against?`                              | `SnapshotDiff[]`                                 |
| `scene.frameStats`         | —                                       | telemetría de frames, sin redondear              |
| `hit.explain`              | `x`, `y`                                | `HitExplanation`                                 |
| `text.inspect`             | `entityId`                              | `TextInspection` o `null`                        |
| `markdown.stream`          | `entityId`                              | `MarkdownStreamInfo` o `null`                    |
| `gpu.inspect`              | —                                       | `GpuInspection`                                  |
| `plugin.list`              | —                                       | `{ id, label }[]`                                |
| `plugin.rows`              | `id`, `entityId?`                       | `PluginRow[]`                                    |
| `plugin.audit`             | —                                       | `PluginFinding[]`                                |
| `command.list`             | —                                       | `{ id, label }[]`, ids totalmente cualificados   |
| `command.run`              | `commandId`, `entityId?`                | el valor de retorno del comando                  |

`request` rechaza ante un error del backend, ante un method desconocido y ante timeout. Un timeout elimina la entrada pendiente pero no envía ninguna cancelación, así que una respuesta tardía se descarta silenciosamente. `dispose()` rechaza cada promise en vuelo con `client disposed`.

### Aplicación de orígenes

> [!IMPORTANT]
> La comprobación de origen es deliberadamente fail-closed y te sorprenderá: **omitir `allowedOrigins` rechaza toda petición que lleve origen.** No hay ningún default permisivo. A un transport `postMessage` debe dársele una allowlist explícita:
>
> ```typescript
> createDevtoolsBackend(scene, transport, {
>   allowedOrigins: ['https://panel.example'],
> });
> ```
>
> `createDirectTransportPair` no suministra ningún origen, así que el cableado en proceso elude la comprobación por completo — que es por lo que el ejemplo de arriba no necesita allowlist.
>
> **El cliente, mientras tanto, no realiza ninguna comprobación de origen.** Filtra solo por la etiqueta de canal, así que cualquier frame que pueda hacer post al window del cliente puede inyectar un evento `selection`/`structure` falso o una respuesta falsa para un id de petición adivinable. Trata a un cliente de puente como solo-entrada-de-confianza: no expongas uno a una página que no controlas.

### Eventos

El backend nunca emite eventos por su cuenta. Tu código de página decide cuándo algo cambió y lo publica:

```typescript
import { publishSelection, publishStructure } from '@vectojs/devtools/headless';

publishSelection(backendTransport, selectedEntity); // or null to clear
publishStructure(backendTransport, scene.structureVersion);
```

Ambos son fire-and-forget, sin cola ni deduplicación. Suscríbete en el cliente con `client.on(handler)`.

### Estado y límites

> [!NOTE]
> **`scene.diff` muta su propia línea base.** Calcula el diff contra la última instantánea y luego la reemplaza, así que llamarlo dos veces da dos diffs _incrementales_ en lugar de dos diffs contra la original. Pasa `against` explícitamente para una línea base fija.
>
> **`maxTreeNodes` es un único presupuesto compartido por ambos árboles, consumido de raíz primero.** Un árbol principal en el tope devuelve un `overlay` vacío con `truncated: true` — la truncación siempre se reporta, nunca es silenciosa.
>
> **El índice de entidades tolera lo obsoleto.** Un acierto de caché gana sin revalidación, así que una entidad eliminada de la escena aún puede resolverse. Solo un fallo dispara una reconstrucción. Ante un id duplicado, la entidad del overlay eclipsa a la del árbol principal.
>
> **Cada resultado se fuerza a pasar por un round-trip JSON.** `undefined` se convierte en `null`, y `NaN`/`Infinity` se convierten en `null` — lo que importa para `scene.frameStats`. Un resultado circular o con `BigInt` hace fallar la petición en lugar de devolver datos parciales.
>
> **No hay negociación de versión.** El backend responde a `protocol.version` pero nunca compara una versión entrante con la suya; las peticiones no llevan campo de versión. Comprobar la compatibilidad es trabajo del frontend.

### Transportes

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

`createWindowTransport` hace post a `target` y escucha en `source`. El `source = target` por defecto es incorrecto para el caso común de extensión e iframe, donde haces post a un hijo pero escuchas en tu propio window — **pasa `source` explícitamente** allí.

La interfaz son dos métodos, así que un transport personalizado sobre un `MessageChannel`, un `BroadcastChannel`, un WebSocket o un binding CDP es un adaptador corto.

---

## Protocolo de plugin

Una entidad que publique `getDevtoolsDescriptor()` ya aparece en la pestaña Info. Un plugin va más allá: su propia pestaña de panel, sus propios hallazgos de auditoría y sus propios comandos.

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

Ese hallazgo aparece como `my-chart/empty-series` — `runPluginAudits` reescribe cada `kind` a `` `${plugin.id}/${kind}` `` para que dos plugins no puedan colisionar.

### Funciones de registro

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

`registerDevtoolsPlugin` devuelve una función de anulación del registro. Registrar el mismo `id` dos veces **reemplaza silenciosamente**; el disposer devuelto está protegido por identidad, así que uno obsoleto de un registro reemplazado es un no-op en lugar de desalojar al plugin vivo.

`pluginInspectorsFor(entity)` filtra por `appliesTo`; `pluginInspectors()` los devuelve todos sin evaluarlo. `clearDevtoolsPlugins()` es para tests.

### Contención de fallos

Los plugins son código de terceros ejecutándose dentro de un diagnóstico, así que nada de lo que haga un plugin puede romper el panel:

| Fallo                        | Resultado                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `appliesTo` throws           | ese inspector se excluye silenciosamente                                                               |
| `rows` throws                | una única fila `error` que lleva el mensaje                                                            |
| `rows` sin nada seleccionado | una fila `— / no selection`; `rows` nunca se llama                                                     |
| una auditoría lanza          | un hallazgo sintético `<pluginId>/audit-failed`, `severity: 'error'`; otras auditorías aún se ejecutan |
| id de comando desconocido    | `runPluginCommand` **lanza** — deliberadamente, para que un llamador no reciba un no-op silencioso     |
| un comando lanza             | se propaga al llamador; sobre el puente se convierte en una petición rechazada                         |

> [!NOTE]
> El registro es estado global a nivel de módulo, indexado por id de plugin. Dos copias de `@vectojs/devtools` en un mismo bundle obtienen dos registros independientes.
>
> `runPluginInspector` **no** comprueba `appliesTo` — ese es el trabajo del llamador, y el panel lo hace por separado. Además, la unicidad de `PluginInspector.id` es requerida pero no se aplica: el registro se indexa por el id de _plugin_, así que un id de inspector duplicado pierde silenciosamente una pestaña.
>
> `runPluginCommand` acepta un id de comando desnudo además de `<pluginId>/<commandId>`. Ante un id desnudo toma la primera coincidencia en orden de registro, sin error de ambigüedad, así que prefiere la forma calificada.

---

[Descripción general](/reference/devtools/) · [Inspeccionar](/reference/devtools-inspect/) · [Auditar](/reference/devtools-audit/) · [Rendimiento](/reference/devtools-perf/)
