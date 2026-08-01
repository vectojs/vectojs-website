---
title: 'Devtools: 성능'
description: 'VectoJS 프레임 비용을 귀인합니다 — GPU 및 Canvas2D 드로우 카운터, WASM 가속기 상태, 더티 리페인트 귀인, Markdown 스트리밍 재사용 메트릭.'
order: 51
---

# Devtools: 성능

각각 "왜 느린가"라는 다른 질문에 답하는 네 가지 독립적인 판독값:

| 판독값                  | 질문                                                                      |
| ----------------------- | ------------------------------------------------------------------------- |
| `inspectGpu`            | 프레임이 실제로 드로우 콜을 무엇에 쓰고 있는가?                           |
| `inspectAccelerators`   | WASM 커널이 실행 중인가? 아니라면 왜 아닌가?                              |
| `diagnoseDirty`         | 아무것도 눈에 띄게 변하지 않았는데 왜 이 씬이 리페인트되나?               |
| `inspectMarkdownStream` | 스트리밍 Markdown이 작업을 재사용하는가, 아니면 청크마다 다시 파싱하는가? |

네 가지 모두 순수 읽기입니다. 그중 어떤 것도 부수 효과로 계측을 켜지 않으므로, 측정되지 않은 씬은 거짓말 대신 "측정되지 않음"을 보고합니다 — 그리고 그중 두 개는 계측을 먼저 켜야 합니다.

---

## GPU 및 드로우 카운터

```typescript
function inspectGpu(scene: Scene): GpuInspection;
function formatGpuInspection(info: GpuInspection): PluginRow[];
function auditGpu(scene: Scene): PluginFinding[];

interface GpuInspection {
  rendererKind: string;
  canvas: DrawCounters | null;
  webgl: {
    drawCalls: number;
    totalDrawCalls: number;
    atlasSwitches: number;
    programs: number;
    textures: number;
    circleQuadFallbacks: number;
    circlePoints: number;
  } | null;
  webgpu: {
    active: boolean;
    pipelines: number;
    bindGroups: number;
    particleEntities: number;
  };
  phases: Array<{
    phase: string;
    totalMs: number;
    calls: number;
    avgMs: number;
    maxMs: number;
  }>;
  frame: {
    fps: number;
    frameTimeMs: number;
    renderedFrames: number;
    skippedFrames: number;
  };
  unavailable: Array<{ capability: string; reason: string }>;
}
```

`frame`은 항상 사용할 수 있습니다. 그 외의 모든 것은 옵트인이며, `unavailable` 배열은 보고할 수 없었던 각 항목과 그 이유를 이름으로 나열합니다:

```typescript
import { inspectGpu } from '@vectojs/devtools/headless';

// Canvas2D 카운터는 기본적으로 꺼져 있습니다 — 먼저 켜세요.
scene.getRenderer().setDrawCounters?.(true);
scene.setPhaseTiming(true);

scene.step(16.67);

const gpu = inspectGpu(scene);
gpu.canvas?.fills; // draw calls by category
gpu.phases; // per-phase timing
```

> [!IMPORTANT]
> `auditGpu`의 세 가지 Canvas2D 검사는 **모두 드로우 카운팅이 활성화된 경우에만 동작합니다.** `setDrawCounters(true)`를 한 번도 호출하지 않은 씬에서는 `[]`를 반환합니다 — 이는 깨끗한 결과와 똑같이 읽힙니다. 먼저 카운팅을 켜지 않으면 초록색 감사는 아무 의미가 없습니다.

방출할 수 있는 결과: `batch-not-amortising`(원당 0.5를 초과하는 플러시), `high-overdraw`(비율 4 초과), `unbalanced-save-restore`(실제 버그 — 누락된 `restore()`가 이후 드로우에 상태를 누출), `circle-quad-fallback`(포인트 스프라이트 원보다 쿼드 폴백이 더 많음).

> [!NOTE]
> `webgl`은 프레임당 카운터 하나와 생성 이후 누적되는 카운터 네 개를 섞습니다. `drawCalls`는 마지막으로 완료된 프레임이고, `totalDrawCalls`, `atlasSwitches`, `circleQuadFallbacks`, `circlePoints`는 계속 커질 뿐입니다. 누적 카운터를 프레임 하나로 나누는 것이 여기서 흔한 실수입니다.
>
> `webgl`이 `null`이면 포인트 레이어가 전혀 실행되지 않는 것이며, 전부 0인 `webgl`이 실행되었지만 아무것도 그리지 않았다는 것과는 다릅니다. `webgpu.pipelines`와 `bindGroups`는 디바이스에서 조회하는 것이 아니라 활성 플래그와 파티클 엔티티 수에서 파생됩니다. `particleEntities`는 숫자형 `maxParticles`에 덕 타이핑되며 메인 트리만 셉니다.

패널이나 에이전트에서 계측을 토글하기 위해 [플러그인 명령](/reference/devtools-extend/#플러그인-프로토콜)으로 세 개의 명령이 내보내집니다:

```typescript
const enableDrawCountersCommand: PluginCommand; // 'enable-draw-counters'
const resetDrawCountersCommand: PluginCommand; // 'reset-draw-counters'
const enablePhaseTimingCommand: PluginCommand; // 'enable-phase-timing'
```

백엔드가 카운트할 수 없을 때 throw하는 대신 상태 **문자열**을 반환합니다 — SVG 및 WebGL 전용 경로는 `'this backend cannot count draws'`를 보고합니다. 둘 다 의도적으로 비활성화 명령이 없으므로, devtools 세션은 렌더러의 수명 동안 카운팅과 페이즈 타이밍을 켜둔 채로 남겨 이후 모든 프레임의 비용을 바꾼다는 점을 기억하세요.

---

## WASM 가속기 상태

```typescript
function inspectAccelerators(scene: Scene): AcceleratorInspection;
function formatAcceleratorInspection(info: AcceleratorInspection): PluginRow[];
function auditAccelerators(scene: Scene): PluginFinding[];

interface AcceleratorFinding {
  accelerator: string; // 'transform' | 'animation' | 'hitTest' | 'particle'
  available: boolean; // a backend is installed and could run
  activeThisFrame: boolean; // it ran on the most recent frame
  reason: AcceleratorReason;
  path: string; // which implementation did the work
  faulted: boolean;
  explanation: string; // why, with what to do about it
}

interface AcceleratorInspection {
  accelerators: AcceleratorFinding[]; // always 4, in a stable order
  activeCount: number;
  availableCount: number;
  faulted: AcceleratorFinding[];
  summary: string;
}
```

VectoJS의 WASM 커널은 보이지 않는 백엔드입니다 — JS가 영구 폴백이므로, 조용히 실행을 멈춘 커널은 아무것도 깨뜨리지 않으면서 성능만 깎습니다. 이것이 그것을 알아내는 방법입니다. `reason`은 다섯 가지 상태를 구분합니다:

| `reason`         | 의미                                          | 문제인가? |
| ---------------- | --------------------------------------------- | --------- |
| `active`         | `path`에 이름이 있는 경로에서 실행 중.        | 아니오    |
| `not-installed`  | WASM 백엔드가 로드되지 않음.                  | 아니오    |
| `below-gate`     | 이번 프레임에 호출할 만큼 작업이 너무 적음.   | 아니오    |
| `not-applicable` | 할 일이 이 종류에는 없음.                     | 아니오    |
| `rejected`       | 설치·게이트 통과 후 커널이 **인수를 거부함**. | **예**    |

`faulted`는 정확히 `reason === 'rejected'`이며, `auditAccelerators`는 그것들만 보고합니다. 의도적입니다: 닫힌 게이트는 시스템이 의도대로 작동하는 것이며, 그것을 보고하면 감사를 무시하도록 훈련될 것입니다. 건강한 씬과 완전히 JS인 씬 모두 감사를 깨끗하게 통과합니다.

`rejected`는 커널이 설치·게이트 통과 후 아무것도 쓰지 않아 프레임이 JS로 폴백했음을 의미합니다 — 튜닝 결과가 아니라 업스트림의 크기 또는 용량 버그입니다.

> [!NOTE]
> `accelerators.particle`을 `Scene.particleBackend`와 혼동하지 마세요. 세 가지 상태 getter(`transformBackend`, `animBackend`, `hitTestBackend`)는 읽기 전용이며 `'js' | 'wasm'`을 보고합니다. `Scene.particleBackend`는 런타임이 시도하는 것을 바꾸는 **쓰기 가능한 요청**(`'auto' | 'webgpu' | 'cpu'`)입니다 — 상태가 아니며, 이 검사가 읽는 것도 아닙니다. `inspectAccelerators`는 `scene.accelerators` 보고서만 독점적으로 읽습니다.

---

## 더티 리페인트 귀인

```typescript
function diagnoseDirty(scene: Scene, options?: DirtyDiagnosisOptions): DirtyDiagnosis;

interface DirtyDiagnosisOptions {
  frames?: number; // sample window; defaults to the observed frame span
  limit?: number; // how many causes to return. Default 10
}

interface DirtyCause {
  entity?: string;
  reason: string;
  property?: string;
  count: number;
  perFrame: number;
  firstFrame: number;
  lastFrame: number;
}

interface DirtyDiagnosis {
  renderMode: 'always' | 'onDemand';
  frames: number;
  causes: DirtyCause[];
  everyFrame: DirtyCause[];
  summary: string;
}
```

매 프레임 리페인트하는 `onDemand` 씬은 `onDemand`인 이점 전체를 잃은 것입니다. 이것이 리페인트를 귀인합니다:

```typescript
scene.setDirtyTracking(true);
// … run the scene …
const diag = diagnoseDirty(scene);
diag.summary; // one-line verdict
diag.everyFrame; // causes firing on ~every frame — the ones that matter
```

`everyFrame`은 `perFrame`이 0.9 이상인 원인을 담습니다. 그것들이 씬을 깨어 있게 유지하는 것입니다.

> [!IMPORTANT]
> 데이터가 예상될 때 이 읽기가 비어 보이게 만드는 두 가지가 있으며, 둘 다 정상입니다.
>
> 첫째, `scene.setDirtyTracking(true)`는 측정하려는 프레임 **이전에** 호출되어야 합니다 — 추적이 꺼져 있으면 `summary`가 그렇게 명시적으로 말합니다.
>
> 둘째, 귀인은 실제로 소스를 전달하는 `markDirty(source)` 호출에만 존재하며, core와 ui 전반의 대부분 호출 지점은 그렇게 하지 않습니다. 따라서 "추적은 켰는데 기록된 것이 없다"는 가장자리 경우가 아니라 흔한 경우이며, 씬이 유휴 상태라는 뜻도 아닙니다. 채워진 결과를 강력한 신호로, 빈 결과를 정보 없음으로 취급하세요.

결과 형태의 세 가지 세부 사항:

> [!NOTE]
> `reason`은 고정된 유니온이 아니라 자유 형식 문자열입니다 — 현재 사용되는 문자열에는 `driver-tick`, `child-added`, `child-removed`, `animation-start`, `a11y-reorder`가 포함되지만, 어떤 호출자든 자신의 것을 만들 수 있습니다. 또한 `causes`는 `limit`으로 잘리지만 `everyFrame`은 잘리지 않은 목록에서 계산되므로, `everyFrame`은 `causes`에 없는 원인을 담을 수 있습니다. `renderMode: 'always'`에서는 항상 렌더하는 씬이 어차피 리페인트하므로 summary가 그 질문을 무의미하다고 보고합니다.

---

## Markdown 스트리밍 메트릭

```typescript
function inspectMarkdownStream(entity: Entity): MarkdownStreamInfo | null;
function formatMarkdownStream(info: MarkdownStreamInfo): PluginRow[];
function auditMarkdownStreaming(scene: Scene): PluginFinding[];
function isMarkdownEntity(entity: Entity): boolean;
```

스트리밍 Markdown은 추가된 각 청크가 이전 파싱을 재사용할 때만 빠릅니다. 이 카운터들은 그런지 말해줍니다:

```typescript
interface MarkdownStreamInfo {
  entityId: string;
  sourceLength: number;
  topLevelTokens: number;
  childEntities: number;
  appends: number;
  workerResponses: number;
  coalesced: number;
  tokensPrefixMatched: number;
  tokensReturned: number;
  tokenPrefixReuseRatio: number;
  lexerMs: number;
  sourceCharsLexed: number;
  workerMsAvg: number;
  workerMsMax: number;
  stablePrefixChars: number;
  changedTailChars: number;
  entitiesReused: number;
  entitiesRebuilt: number;
  inPlaceUpdates: number;
  tailFraction: number;
  notes: string[];
}
```

> [!IMPORTANT]
> 세 필드는 **0.11.0에서 이름이 바뀌었고 이전 이름은 별칭으로 유지되지 않았습니다.** 이전 참조 문서를 기준으로 작성된 코드는 `undefined`를 읽게 되는데, 이는 조용히 0처럼 보입니다:
>
> | 제거됨          | 현재                    |
> | --------------- | ----------------------- |
> | `tokensReused`  | `tokensPrefixMatched`   |
> | `tokensRelexed` | `tokensReturned`        |
> | `reuseRatio`    | `tokenPrefixReuseRatio` |
>
> 이전 이름은 잘못된 것을 지목했습니다 — 측정되는 것은 토큰 접두사가 얼마나 일치했는지인데, 전체 토큰이 재활용되고 있다는 듯이 보였습니다. `lexerMs`와 `sourceCharsLexed`는 0.11.0에서 새로 추가되었습니다.

`auditMarkdownStreaming`은 다섯 가지 종류를 방출합니다:

- `tail-not-a-delta` — 변경된 꼬리가 소스의 절반을 넘으므로, 추가가 델타 대신 문서 대부분을 다시 렉싱하고 있습니다.
- `low-token-reuse` — 접두사 재사용이 50% 미만.
- `slow-worker-roundtrip` — 8.3ms를 초과하는 워커 응답, 즉 240Hz에서 두 프레임.
- `no-worker` — 메인 스레드에서 파싱.
- `entities-mostly-rebuilt` — 재사용보다 재구축된 엔티티가 더 많아, 자식 조정자가 일치 항목을 찾지 못하고 있습니다.

> [!NOTE]
> 감사는 `appends > 0`에 게이트됩니다 — 스트리밍된 적이 없는 Markdown 엔티티는 결과를 만들지 않습니다. `low-token-reuse`도 비율이 0보다 커야 하므로, 진짜 0% 재사용은 보고되지 않습니다. 임계값은 고정되어 있으며 구성할 수 없습니다. `scene.rootEntity`만 순회하므로 모달 안의 Markdown 엔티티는 감사되지 않습니다.

`isMarkdownEntity`는 엔티티의 devtools 디스크립터가 `kind: 'Markdown'`을 보고하는지에 덕 타이핑됩니다 — `@vectojs/markdown`을 import하지도 `instanceof`를 사용하지도 않으므로 모델 레이어는 그 의존성에서 자유롭게 유지됩니다.

---

## 이것들을 패널 탭으로 등록하기

각 하위 시스템은 패널이 탭으로 표시할 수 있도록 일치하는 [플러그인](/reference/devtools-extend/#플러그인-프로토콜) 디스크립터를 제공합니다. **아무것도 자동으로 등록되지 않습니다** — GPU를 검사한 적 없는 빌드는 그 코드를 싣지 않습니다:

```typescript
import {
  acceleratorAudit,
  acceleratorInspector,
  enableDrawCountersCommand,
  enablePhaseTimingCommand,
  gpuAudit,
  gpuInspector,
  markdownStreamAudit,
  markdownStreamInspector,
  registerDevtoolsPlugin,
  resetDrawCountersCommand,
  textInspector,
} from '@vectojs/devtools/headless';

registerDevtoolsPlugin({
  id: 'perf',
  inspectors: [gpuInspector, acceleratorInspector, markdownStreamInspector, textInspector],
  audits: [gpuAudit, acceleratorAudit, markdownStreamAudit],
  commands: [enableDrawCountersCommand, resetDrawCountersCommand, enablePhaseTimingCommand],
});
```

> [!NOTE]
> `gpuInspector`와 `acceleratorInspector`는 전체 씬을 보고하고 선택을 무시하지만, 패널과 브리지 모두 인스펙터를 호출하기 전에 "no selection" 행으로 단락시킵니다. 그들의 행을 보려면 엔티티를 선택하세요. 감사에는 그런 제약이 없습니다.

---

[Devtools 개요](/reference/devtools/) · [검사](/reference/devtools-inspect/) · [감사](/reference/devtools-audit/) · [브리지와 플러그인](/reference/devtools-extend/)
