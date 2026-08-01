---
title: 'Devtools: performance'
description: 'Attribute VectoJS frame cost — GPU and Canvas2D draw counters, WASM accelerator status, dirty-repaint attribution, and Markdown streaming reuse metrics.'
order: 51
---

# Devtools: performance

Four independent readouts, each answering a different "why is this slow" question:

| Readout                 | Question                                                       |
| ----------------------- | -------------------------------------------------------------- |
| `inspectGpu`            | What is the frame actually spending draw calls on?             |
| `inspectAccelerators`   | Are the WASM kernels running, and if not, why not?             |
| `diagnoseDirty`         | Why is this scene repainting when nothing visibly changed?     |
| `inspectMarkdownStream` | Is streaming Markdown reusing work, or re-parsing every chunk? |

All four are pure reads. None of them enables instrumentation as a side effect, which means an unmeasured scene reports unmeasured rather than lying — and two of them need instrumentation switched on first.

---

## GPU and draw counters

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

`frame` is always available. Everything else is opt-in, and the `unavailable` array names each thing it could not report and why:

```typescript
import { inspectGpu } from '@vectojs/devtools/headless';

// Canvas2D counters are off by default — turn them on first.
scene.getRenderer().setDrawCounters?.(true);
scene.setPhaseTiming(true);

scene.step(16.67);

const gpu = inspectGpu(scene);
gpu.canvas?.fills; // draw calls by category
gpu.phases; // per-phase timing
```

> [!IMPORTANT]
> `auditGpu`'s three Canvas2D checks are **all gated on draw counting being enabled**. On a scene where you never called `setDrawCounters(true)`, it returns `[]` — which reads exactly like a clean result. Enable counting first, or a green audit means nothing.

Findings it can emit: `batch-not-amortising` (flushes per circle above 0.5), `high-overdraw` (ratio above 4), `unbalanced-save-restore` (a real bug — a missing `restore()` leaks state into later draws), and `circle-quad-fallback` (more quad fallbacks than point-sprite circles).

> [!NOTE]
> `webgl` mixes one per-frame counter with four cumulative-since-creation ones. `drawCalls` is the last completed frame; `totalDrawCalls`, `atlasSwitches`, `circleQuadFallbacks`, and `circlePoints` only ever grow. Dividing a cumulative counter by one frame is the easy mistake here.
>
> A `null` `webgl` means the point layer is not running at all, which is different from an all-zero `webgl` meaning it ran and drew nothing. `webgpu.pipelines` and `bindGroups` are derived from the active flag and the particle-entity count, not queried from the device. `particleEntities` is duck-typed on a numeric `maxParticles` and counts the main tree only.

Three commands are exported for toggling instrumentation from a panel or an agent, as [plugin commands](/reference/devtools-extend/#plugin-protocol):

```typescript
const enableDrawCountersCommand: PluginCommand; // 'enable-draw-counters'
const resetDrawCountersCommand: PluginCommand; // 'reset-draw-counters'
const enablePhaseTimingCommand: PluginCommand; // 'enable-phase-timing'
```

They return a status **string** rather than throwing when a backend cannot count — SVG and WebGL-only paths report `'this backend cannot count draws'`. There is deliberately no disable command for either, so remember that a devtools session leaves counting and phase timing on for the life of the renderer, which changes the cost of every subsequent frame.

---

## WASM accelerator status

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

VectoJS's WASM kernels are an invisible backend — JS is the permanent fallback, so a kernel that silently stops running costs performance without breaking anything. This is how you tell. `reason` distinguishes the five states:

| `reason`         | Meaning                                                         | A problem? |
| ---------------- | --------------------------------------------------------------- | ---------- |
| `active`         | Running on the path named in `path`.                            | no         |
| `not-installed`  | No WASM backend loaded.                                         | no         |
| `below-gate`     | Too little work this frame to be worth the call.                | no         |
| `not-applicable` | Nothing of this kind to do.                                     | no         |
| `rejected`       | Installed, gated in, then the kernel **refused its arguments**. | **yes**    |

`faulted` is exactly `reason === 'rejected'`, and `auditAccelerators` reports only those. That is deliberate: a gate that stays shut is the system working as intended, and reporting it would train you to ignore the audit. A healthy scene, and an entirely-JS scene, both audit clean.

`rejected` means the kernel was installed, passed its gate, then wrote nothing and the frame fell back to JS — a sizing or capacity bug upstream, not a tuning outcome.

> [!NOTE]
> Do not confuse `accelerators.particle` with `Scene.particleBackend`. The three status getters `transformBackend`, `animBackend`, and `hitTestBackend` are read-only and report `'js' | 'wasm'`. `Scene.particleBackend` is a **writable request** (`'auto' | 'webgpu' | 'cpu'`) that changes what the runtime attempts — it is not a status, and it is not what this inspection reads. `inspectAccelerators` reads the `scene.accelerators` report exclusively.

---

## Dirty-repaint attribution

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

An `onDemand` scene that repaints every frame has lost the entire benefit of being `onDemand`. This attributes the repaints:

```typescript
scene.setDirtyTracking(true);
// … run the scene …
const diag = diagnoseDirty(scene);
diag.summary; // one-line verdict
diag.everyFrame; // causes firing on ~every frame — the ones that matter
```

`everyFrame` holds causes whose `perFrame` is at or above 0.9. Those are what keep a scene awake.

> [!IMPORTANT]
> Two things make this read empty when you expect data, and both are normal.
>
> First, `scene.setDirtyTracking(true)` must be called **before** the frames you want to measure — the `summary` says so explicitly when tracking is off.
>
> Second, attribution only exists for `markDirty(source)` calls that actually pass a source, and most call sites across core and ui do not. So "tracking on, nothing recorded" is the common case rather than an edge case, and it does not mean the scene is idle. Treat a populated result as a strong signal and an empty one as no information.

Three details of the shape of the result:

> [!NOTE]
> `reason` is a free-form string, not a fixed union — the strings currently used include `driver-tick`, `child-added`, `child-removed`, `animation-start`, and `a11y-reorder`, but any caller can mint its own. Also `causes` is truncated to `limit` while `everyFrame` is computed from the untruncated list, so `everyFrame` can hold causes absent from `causes`. With `renderMode: 'always'` the summary reports the question as moot, because an always-render scene repaints regardless.

---

## Markdown streaming metrics

```typescript
function inspectMarkdownStream(entity: Entity): MarkdownStreamInfo | null;
function formatMarkdownStream(info: MarkdownStreamInfo): PluginRow[];
function auditMarkdownStreaming(scene: Scene): PluginFinding[];
function isMarkdownEntity(entity: Entity): boolean;
```

Streaming Markdown is only fast if each appended chunk reuses the previous parse. These counters say whether it does:

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
> Three fields were **renamed in 0.11.0 and the old names were not kept as aliases**. Code written against an older reference reads `undefined`, which silently looks like zero:
>
> | Removed         | Current                 |
> | --------------- | ----------------------- |
> | `tokensReused`  | `tokensPrefixMatched`   |
> | `tokensRelexed` | `tokensReturned`        |
> | `reuseRatio`    | `tokenPrefixReuseRatio` |
>
> The old names named the wrong thing — they implied whole tokens were being recycled, when what is measured is how much of the token prefix matched. `lexerMs` and `sourceCharsLexed` are new in 0.11.0.

`auditMarkdownStreaming` emits five kinds:

- `tail-not-a-delta` — the changed tail is over half the source, so an append is re-lexing most of the document instead of a delta.
- `low-token-reuse` — prefix reuse below 50%.
- `slow-worker-roundtrip` — a worker response over 8.3ms, i.e. two frames at 240Hz.
- `no-worker` — parsing on the main thread.
- `entities-mostly-rebuilt` — more entities rebuilt than reused, so the child reconciler is not finding its matches.

> [!NOTE]
> The audit is gated on `appends > 0` — a Markdown entity that never streamed produces no findings. `low-token-reuse` also requires a ratio above zero, so a genuine 0% reuse is not reported. The thresholds are fixed and not configurable. It walks `scene.rootEntity` only, so a Markdown entity inside a modal is not audited.

`isMarkdownEntity` is duck-typed on the entity's devtools descriptor reporting `kind: 'Markdown'` — it does not import `@vectojs/markdown` and does not use `instanceof`, so the model layer stays free of that dependency.

---

## Registering these as panel tabs

Each subsystem ships a matching [plugin](/reference/devtools-extend/#plugin-protocol) descriptor so the panel can show it as a tab. **Nothing is registered automatically** — a build that never inspects the GPU does not carry the code:

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
> `gpuInspector` and `acceleratorInspector` report on the whole scene and ignore the selection, but the panel and the bridge both short-circuit to a "no selection" row before calling an inspector. Select any entity to see their rows. Audits have no such constraint.

---

[Devtools overview](/reference/devtools/) · [Inspecting](/reference/devtools-inspect/) · [Auditing](/reference/devtools-audit/) · [Bridge & plugins](/reference/devtools-extend/)
