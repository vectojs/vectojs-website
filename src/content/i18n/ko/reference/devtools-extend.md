---
title: 'Devtools: 브리지와 플러그인'
description: 'JSON-RPC 브리지를 통해 다른 문서에서 VectoJS 씬을 구동하고, 고유한 탭·감사·명령으로 인스펙터를 확장합니다.'
order: 52
---

# Devtools: 브리지와 플러그인

두 가지 확장 지점. **브리지**는 모델 레이어 전체를 JSON-RPC로 노출하여 브라우저 확장 프로그램, 상위 프레임, 또는 자동화 에이전트가 모듈 그래프를 공유하지 않는 씬을 검사할 수 있게 합니다. **플러그인 프로토콜**을 통해 엔티티 작성자는 고유한 인스펙터 탭, 감사, 명령을 게시할 수 있습니다.

---

## 브리지 프로토콜

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

백엔드는 페이지 측, 즉 `Scene`이 존재하는 곳에서 실행됩니다. 클라이언트는 UI가 존재하는 곳에서 실행됩니다. 둘 다 `window`에 직접 닿지 않습니다 — 그것은 트랜스포트의 일이며, 그래서 이 쌍은 프로세스 내에서 테스트될 수 있습니다:

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

### 메서드

21개 전부가 같은 이름의 모델 레이어 함수에 위임합니다:

| 메서드                     | 매개변수                                | 반환값                                           |
| -------------------------- | --------------------------------------- | ------------------------------------------------ |
| `protocol.version`         | —                                       | `{ version: 1 }`                                 |
| `tree.get`                 | —                                       | `{ root, overlay, structureVersion, truncated }` |
| `entity.inspect`           | `entityId`                              | `EntityInfo`                                     |
| `entity.pick`              | `x`, `y`                                | `EntityInfo` 또는 `null`                         |
| `entity.highlightGeometry` | `entityId`, `layers?`, `hitSampleStep?` | `HighlightLayer[]`                               |
| `entity.a11yInspect`       | `entityId`                              | `A11yInfo`                                       |
| `scene.audit`              | —                                       | `AuditFinding[]`                                 |
| `scene.a11yAudit`          | —                                       | `A11yFinding[]`                                  |
| `scene.a11yOrder`          | —                                       | `A11yInfo[]`                                     |
| `scene.snapshot`           | —                                       | `SceneSnapshot`                                  |
| `scene.diff`               | `against?`                              | `SnapshotDiff[]`                                 |
| `scene.frameStats`         | —                                       | 프레임 원격측정, 반올림 없음                     |
| `hit.explain`              | `x`, `y`                                | `HitExplanation`                                 |
| `text.inspect`             | `entityId`                              | `TextInspection` 또는 `null`                     |
| `markdown.stream`          | `entityId`                              | `MarkdownStreamInfo` 또는 `null`                 |
| `gpu.inspect`              | —                                       | `GpuInspection`                                  |
| `plugin.list`              | —                                       | `{ id, label }[]`                                |
| `plugin.rows`              | `id`, `entityId?`                       | `PluginRow[]`                                    |
| `plugin.audit`             | —                                       | `PluginFinding[]`                                |
| `command.list`             | —                                       | `{ id, label }[]`, id는 정규화됨                 |
| `command.run`              | `commandId`, `entityId?`                | 명령의 반환값                                    |

`request`는 백엔드 오류, 알 수 없는 메서드, 또는 타임아웃에서 reject합니다. 타임아웃은 보류 중인 항목을 삭제하지만 취소를 보내지는 않으므로, 늦은 응답은 조용히 버려집니다. `dispose()`는 진행 중인 각 promise를 `client disposed`로 reject합니다.

### 출처 강제

> [!IMPORTANT]
> 출처 검사는 의도적으로 페일-클로즈이며 당신을 놀라게 합니다: **`allowedOrigins`를 생략하면 출처가 있는 모든 요청이 거부됩니다.** 관대한 기본값은 없습니다. `postMessage` 트랜스포트에는 명시적 허용 목록을 주어야 합니다:
>
> ```typescript
> createDevtoolsBackend(scene, transport, {
>   allowedOrigins: ['https://panel.example'],
> });
> ```
>
> `createDirectTransportPair`는 출처를 제공하지 않으므로 프로세스 내 배선은 이 검사를 완전히 우회합니다 — 그래서 위 예제에 허용 목록이 필요 없는 것입니다.
>
> **한편, 클라이언트는 출처 검사를 전혀 수행하지 않습니다.** 채널 레이블 필터링만 하므로, 클라이언트 창에 post할 수 있는 모든 프레임이 가짜 `selection`/`structure` 이벤트나 추측 가능한 요청 id에 대한 가짜 응답을 주입할 수 있습니다. 브리지 클라이언트를 신뢰할 수 있는 입력 전용으로 취급하세요: 통제할 수 없는 페이지에 노출하지 마세요.

### 이벤트

백엔드는 스스로 이벤트를 내보내지 않습니다. 변경이 언제 발생했는지 결정하고 게시하는 것은 페이지 코드입니다:

```typescript
import { publishSelection, publishStructure } from '@vectojs/devtools/headless';

publishSelection(backendTransport, selectedEntity); // 또는 null로 지우기
publishStructure(backendTransport, scene.structureVersion);
```

둘 다 큐나 중복 제거가 없는 fire-and-forget입니다. 클라이언트 측에서는 `client.on(handler)`로 구독하세요.

### 상태성과 제한

> [!NOTE]
> **`scene.diff`는 자신의 기준선을 변경합니다.** 마지막 스냅샷과 비교한 다음 교체하므로, 두 번 호출하면 원본과의 두 개의 _증분_ 디프가 아니라 두 개의 증분 디프를 얻습니다. 기준선을 고정하려면 `against`를 명시적으로 전달하세요.
>
> **`maxTreeNodes`는 두 트리가 공유하는 단일 예산이며, 루트 우선으로 소비됩니다.** 한도에 도달한 메인 트리는 `truncated: true`로 빈 `overlay`를 반환합니다 — 잘림은 항상 보고되며 결코 조용히 지나가지 않습니다.
>
> **엔티티 인덱스는 오래된 데이터에 관대합니다.** 캐시 적중은 재검증 없이 승리하므로, 씬에서 제거된 엔티티도 여전히 해석될 수 있습니다. 재구축을 촉발하는 것은 미스뿐입니다. id가 중복된 경우 overlay 엔티티가 메인 트리 엔티티를 가립니다.
>
> **모든 결과는 강제로 JSON 왕복을 거칩니다.** `undefined`는 `null`이 되고, `NaN`/`Infinity`는 `null`이 됩니다 — 이는 `scene.frameStats`에 중요합니다. 순환 또는 `BigInt`를 포함한 결과는 부분 데이터를 반환하는 대신 요청을 실패시킵니다.
>
> **버전 협상이 없습니다.** 백엔드는 `protocol.version`에 응답하지만 수신 버전을 자신과 비교하지 않으며, 요청에는 버전 필드가 없습니다. 호환성 확인은 프런트엔드의 몫입니다.

### 트랜스포트

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

`createWindowTransport`는 `target`에 post하고 `source`에서 수신합니다. 흔한 확장 프로그램·iframe 시나리오 — 자식 창에 post하면서 자기 창을 수신하는 — 에서 기본 `source = target`은 틀립니다: **`source`를 명시적으로 전달하세요.**

이 인터페이스는 메서드가 두 개뿐이므로 `MessageChannel`, `BroadcastChannel`, WebSocket, 또는 CDP 바인딩 기반의 사용자 지정 트랜스포트는 짧은 어댑터일 뿐입니다.

---

## 플러그인 프로토콜

`getDevtoolsDescriptor()`를 게시하는 엔티티는 이미 Info 탭에 나타납니다. 플러그인은 한 걸음 더 나아갑니다: 고유한 패널 탭, 고유한 감사 발견, 고유한 명령.

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

발견은 `my-chart/empty-series`로 표시됩니다 — `runPluginAudits`가 각 `kind`를 `` `${plugin.id}/${kind}` ``로 다시 씨므로 두 플러그인은 충돌하지 않습니다.

### 레지스트리 함수

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

`registerDevtoolsPlugin`은 등록 해제 함수를 반환합니다. 같은 `id`에 두 번 등록하면 **조용히 대체**됩니다. 반환된 디스포저에는 정체성 보호가 있어, 대체된 등록의 낡은 디스포저는 no-op이며 여전히 유효한 플러그인을 쫓아내지 않습니다.

`pluginInspectorsFor(entity)`는 `appliesTo`로 필터링합니다. `pluginInspectors()`는 평가하지 않고 전부 반환합니다. `clearDevtoolsPlugins()`는 테스트용입니다.

### 실패 격리

플러그인은 진단 내부에서 실행되는 제3자 코드이므로, 플러그인이 하는 어떤 것도 패널을 깨뜨릴 수 없습니다:

| 실패                | 결과                                                                              |
| ------------------- | --------------------------------------------------------------------------------- |
| `appliesTo`가 throw | 해당 인스펙터는 조용히 건너뜀                                                     |
| `rows`가 throw      | 메시지가 있는 단일 `error` 행                                                     |
| 선택 없이 `rows`    | `— / no selection` 행; `rows`는 절대 호출되지 않음                                |
| 감사가 throw        | 합성된 `<pluginId>/audit-failed` 발견, `severity: 'error'`; 다른 감사는 계속 실행 |
| 알 수 없는 명령 id  | `runPluginCommand`가 **throw** — 호출자가 조용한 no-op을 얻지 않도록 의도적       |
| 명령이 throw        | 호출자에게 전파; 브리지를 통하면 reject된 요청이 됨                               |

> [!NOTE]
> 레지스트리는 플러그인 id를 키로 하는 모듈 레벨 전역 상태입니다. 같은 번들의 `@vectojs/devtools` 사본 두 개는 독립된 레지스트리 두 개를 가집니다.
>
> `runPluginInspector`는 `appliesTo`를 **검사하지 않습니다** — 그것은 호출자의 일이며 패널은 별도로 실행합니다. 그리고 `PluginInspector.id`의 유일성은 필수지만 강제되지는 않습니다: 레지스트리는 _플러그인_ id를 키로 하므로 중복 인스펙터 id는 탭 하나를 조용히 잃습니다.
>
> `runPluginCommand`는 베어 명령 id와 `<pluginId>/<commandId>`를 모두 받습니다. 베어 id의 경우 모호성 오류 없이 등록 순서로 첫 번째 일치를 취하므로, 정규화된 형태를 우선 사용하세요.

---

[Devtools 개요](/reference/devtools/) · [검사](/reference/devtools-inspect/) · [감사](/reference/devtools-audit/) · [성능](/reference/devtools-perf/)
