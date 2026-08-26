+++
title = "Devtools：效能"
description = "歸因 VectoJS 幀成本 — GPU 與 Canvas2D 繪製計數器、WASM 加速器狀態、髒重繪歸因，以及 Markdown 串流重複使用指標。"
weight = 51
+++

# Devtools：效能

四個獨立的讀取值，各自回答一個不同的「為什麼這麼慢」問題：

| 讀取值                  | 問題                                                     |
| ----------------------- | -------------------------------------------------------- |
| `inspectGpu`            | 幀的繪製呼叫實際花在什麼上面？                           |
| `inspectAccelerators`   | WASM 核心是否在執行？如果沒有，為什麼？                  |
| `diagnoseDirty`         | 為什麼明明沒有可見的變更，這個場景卻在重繪？             |
| `inspectMarkdownStream` | 串流 Markdown 是重複使用既有工作，還是重新解析每個區塊？ |

四個都是純讀取。沒有一個會以副作用的方式啟用量測，這意味著未量測的場景會如實回報為未量測，而非說謊 — 而且其中兩個需要先開啟量測。

---

## GPU 與繪製計數器

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

`frame` 永遠可用。其他一切皆為選擇加入，而 `unavailable` 陣列會列出每一項無法回報的內容及其原因：

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
> `auditGpu` 的三個 Canvas2D 檢查**全部以繪製計數已啟用為門控**。在您從未呼叫 `setDrawCounters(true)` 的場景上，它會回傳 `[]` — 讀起來完全像乾淨的結果。請先啟用計數，否則綠色的稽核沒有意義。

它能發出的發現項：`batch-not-amortising`（每個圓形超過 0.5 次 flush）、`high-overdraw`（比率高於 4）、`unbalanced-save-restore`（真正的錯誤 — 缺少 `restore()` 會將狀態洩漏到後續繪製中），以及 `circle-quad-fallback`（四邊形回退多於點精靈圓形）。

> [!NOTE]
> `webgl` 混合了一個每幀計數器與四個自建立以來累計的計數器。`drawCalls` 是最後一個完成的幀；`totalDrawCalls`、`atlasSwitches`、`circleQuadFallbacks` 與 `circlePoints` 只會增長。把累計計數器除以單一幀就是在這裡容易犯的錯誤。
>
> `null` 的 `webgl` 表示點圖層完全沒有執行，這不同於全為零的 `webgl` 表示它執行了但什麼都沒繪製。`webgpu.pipelines` 與 `bindGroups` 是從活動旗標與粒子實體數量推導而來，而非向裝置查詢。`particleEntities` 對數值的 `maxParticles` 做鴨子型別檢查，且只計算主樹。

三個指令被匯出，用於從面板或代理程式切換量測，作為[外掛程式指令](/reference/devtools-extend/#wai-gua-cheng-shi-xie-ding)：

```typescript
const enableDrawCountersCommand: PluginCommand; // 'enable-draw-counters'
const resetDrawCountersCommand: PluginCommand; // 'reset-draw-counters'
const enablePhaseTimingCommand: PluginCommand; // 'enable-phase-timing'
```

當後端無法計數時，它們會回傳狀態**字串**而非拋出例外 — 僅 SVG 與 WebGL 的路徑會回報 `'this backend cannot count draws'`。兩者都刻意沒有停用指令，因此請記住，devtools 工作階段會在渲染器的整個生命週期中保持計數與階段計時開啟，這會改變之後每個幀的成本。

---

## WASM 加速器狀態

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

VectoJS 的 WASM 核心是不可見的後端 — JS 是永久的回退，因此靜默停止執行的核心會耗損效能而不破壞任何東西。這就是您分辨的方式。`reason` 區分五種狀態：

| `reason`         | 含義                                           | 有問題嗎？ |
| ---------------- | ---------------------------------------------- | ---------- |
| `active`         | 在 `path` 命名的路徑上執行。                   | 否         |
| `not-installed`  | 未載入 WASM 後端。                             | 否         |
| `below-gate`     | 這一幀的工作量太少，不值得呼叫。               | 否         |
| `not-applicable` | 沒有這種類型的工作要做。                       | 否         |
| `rejected`       | 已安裝、通過門控，然後核心**拒絕了它的參數**。 | **是**     |

對於動畫加速器，按類別的判定會指明是哪一類驅動器拒絕了：當一個動畫核心拒絕某一幀而另一個仍透過 WASM 步進時，`reason` 會回報 `springs-rejected` 或 `tweens-rejected`（且 `activeThisFrame: true`，因為一半的工作已經執行）。單純的 `rejected` 保留給兩類都拒絕的情況。

`faulted` 恰好是 `reason === 'rejected'`（包括按類別判定），而 `auditAccelerators` 只回報這些。這是刻意的：保持關閉的門控是系統如預期運作，回報它會訓練您忽略稽核。健康的場景與完全 JS 的場景，稽核起來都是乾淨的。

`rejected` 表示核心已安裝、通過其門控，然後什麼都沒寫，幀回退到 JS — 這是上游的尺寸或容量錯誤，而非調整的結果。

> [!NOTE]
> 不要把 `accelerators.particle` 與 `Scene.particleBackend` 混淆。三個狀態 getter `transformBackend`、`animBackend` 與 `hitTestBackend` 是唯讀的，回報 `'js' | 'wasm'`。`Scene.particleBackend` 是**可寫入的請求**（`'auto' | 'webgpu' | 'cpu'`），會改變執行階段嘗試的內容 — 它不是狀態，也不是這個檢查讀取的內容。`inspectAccelerators` 只讀取 `scene.accelerators` 報告。

---

## 髒重繪歸因

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

每幀重繪的 `onDemand` 場景已經失去了 `onDemand` 的全部好處。這會歸因這些重繪：

```typescript
scene.setDirtyTracking(true);
// … run the scene …
const diag = diagnoseDirty(scene);
diag.summary; // one-line verdict
diag.everyFrame; // causes firing on ~every frame — the ones that matter
```

`everyFrame` 存放 `perFrame` 為 0.9 或以上的原因。正是這些原因讓場景保持清醒。

> [!IMPORTANT]
> 有兩件事會讓您在預期有資料時讀到空值，而兩者都是正常的。
>
> 第一，`scene.setDirtyTracking(true)` 必須在您想量測的幀**之前**呼叫 — 當追蹤關閉時，`summary` 會明確說明這一點。
>
> 第二，歸因只存在於實際傳入來源的 `markDirty(source)` 呼叫，而 core 與 ui 中的大多數呼叫位置都不會傳。因此「追蹤開啟，卻什麼都沒記錄」是常見情況而非邊緣情況，而且這不代表場景是閒置的。請把有內容的結果視為強烈訊號，把空的結果視為沒有資訊。

結果形狀的三個細節：

> [!NOTE]
> `reason` 是自由格式的字串，而非固定的聯集 — 目前使用的字串包括 `driver-tick`、`child-added`、`child-removed`、`animation-start` 與 `a11y-reorder`，但任何呼叫者都可以自行建立。另外 `causes` 會截斷到 `limit`，而 `everyFrame` 是從未截斷的清單計算的，因此 `everyFrame` 可能包含 `causes` 中沒有的原因。使用 `renderMode: 'always'` 時，summary 會把問題回報為無關緊要，因為總是渲染的場景無論如何都會重繪。

---

## Markdown 串流指標

```typescript
function inspectMarkdownStream(entity: Entity): MarkdownStreamInfo | null;
function formatMarkdownStream(info: MarkdownStreamInfo): PluginRow[];
function auditMarkdownStreaming(scene: Scene): PluginFinding[];
function isMarkdownEntity(entity: Entity): boolean;
```

串流 Markdown 只有在每個附加的區塊重複使用前一次的解析結果時才會快。這些計數器說明它是否如此：

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
> 三個欄位在 **0.11.0 中被重新命名，且舊名稱沒有保留為別名**。針對較舊參考撰寫的程式碼會讀到 `undefined`，而它靜默地看起來像零：
>
> | 已移除          | 目前                    |
> | --------------- | ----------------------- |
> | `tokensReused`  | `tokensPrefixMatched`   |
> | `tokensRelexed` | `tokensReturned`        |
> | `reuseRatio`    | `tokenPrefixReuseRatio` |
>
> 舊名稱命名錯了東西 — 它們暗示整個語彙單元被回收重用，而實際量測的是語彙單元前綴有多少相符。`lexerMs` 與 `sourceCharsLexed` 是 0.11.0 新增的。

`auditMarkdownStreaming` 發出五種發現項：

- `tail-not-a-delta` — 變更的尾端超過來源的一半，因此附加動作會重新對文件的大部分進行詞法分析，而不是只處理增量。
- `low-token-reuse` — 前綴重複使用低於 50%。
- `slow-worker-roundtrip` — worker 回應超過 8.3ms，即 240Hz 下的兩個幀。
- `no-worker` — 在主執行緒上解析。
- `entities-mostly-rebuilt` — 重建的實體多於重複使用的實體，因此子協調器找不到它的相符項目。

> [!NOTE]
> 稽核以 `appends > 0` 為門控 — 從未串流的 Markdown 實體不會產生發現項。`low-token-reuse` 也要求比率高於零，因此真正的 0% 重複使用不會被回報。門檻是固定的，不可設定。它只走訪 `scene.rootEntity`，因此 modal 內的 Markdown 實體不會被稽核。

`isMarkdownEntity` 對實體 devtools 描述器回報的 `kind: 'Markdown'` 做鴨子型別檢查 — 它不匯入 `@vectojs/markdown`，也不使用 `instanceof`，因此模型層保持不依賴那個套件。

---

## 將這些註冊為面板標籤頁

每個子系統都隨附相符的[外掛程式](/reference/devtools-extend/#wai-gua-cheng-shi-xie-ding)描述器，讓面板能將它顯示為標籤頁。**沒有東西會被自動註冊** — 從不檢查 GPU 的建置不會攜帶那段程式碼：

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
> `gpuInspector` 與 `acceleratorInspector` 對整個場景回報並忽略選取內容，但面板與橋接兩者在呼叫檢查器之前都會短路為「未選取」列。選取任何實體即可看到它們的列。稽核沒有這種限制。

---

[Devtools 概覽](/reference/devtools/) · [檢查](/reference/devtools-inspect/) · [稽核](/reference/devtools-audit/) · [橋接與外掛程式](/reference/devtools-extend/)
