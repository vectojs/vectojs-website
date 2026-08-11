+++
title = "Devtools: パフォーマンス"
description = "VectoJSのフレームコストを帰属させる — GPUとCanvas2Dの描画カウンター、WASMアクセラレータの状態、ダーティ再描画の帰属、Markdownストリーミング再利用メトリクス。"
weight = 51

[extra]
order = 51
+++

# Devtools: パフォーマンス

それぞれが異なる「なぜ遅いのか」の問いに答える、4つの独立した読み出し：

| 読み出し                | 質問                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `inspectGpu`            | フレームは実際に何のドローコールに費やしているか？                                       |
| `inspectAccelerators`   | WASMカーネルは実行されているか？そうでないなら、なぜか？                                 |
| `diagnoseDirty`         | 目に見えて何も変わっていないのに、なぜこのシーンは再描画されるのか？                     |
| `inspectMarkdownStream` | ストリーミングMarkdownは作業を再利用しているか、それともチャンクごとに再解析しているか？ |

4つすべてが純粋な読み取りです。どれも副作用としてインストルメンテーションを有効にしません。つまり、測定されていないシーンは嘘をつく代わりに未測定と報告し — そのうち2つは最初にインストルメンテーションをオンにする必要があります。

---

## GPUと描画カウンター

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

`frame`は常に利用可能です。それ以外はすべてオプトインで、`unavailable`配列は報告できなかった各項目とその理由を列挙します：

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
> `auditGpu`の3つのCanvas2Dチェックは**すべて描画カウンティングが有効になっていることにゲートされています**。`setDrawCounters(true)`を決して呼ばないシーンでは`[]`を返します — これはクリーンな結果とまったく同じに見えます。先にカウンティングを有効にしてください。そうしないと、グリーンな監査は何も意味しません。

それが発行できる所見：`batch-not-amortising`（円ごとに0.5を超えるフラッシュ）、`high-overdraw`（比率が4を超える）、`unbalanced-save-restore`（実バグ — `restore()`の欠落が後続の描画に状態を漏らす）、そして`circle-quad-fallback`（ポイントスプライト円より多いクワッドフォールバック）。

> [!NOTE]
> `webgl`は1つのフレームごとのカウンターと4つの作成以降の累積カウンターを混在させます。`drawCalls`は最後に完了したフレームで、`totalDrawCalls`、`atlasSwitches`、`circleQuadFallbacks`、`circlePoints`は増える一方です。累積カウンターを1フレームで割るのがここでの罠です。
>
> `null`の`webgl`はポイントレイヤーがまったく実行されていないことを意味し、これは実行されて何も描画しなかったことを意味するすべてゼロの`webgl`とは異なります。`webgpu.pipelines`と`bindGroups`はアクティブフラグとパーティクルエンティティ数から導出され、デバイスから照会されるものではありません。`particleEntities`は数値の`maxParticles`に対してダックタイプされ、メインツリーのみを数えます。

パネルやエージェントからインストルメンテーションを切り替えるための3つのコマンドが、[プラグインコマンド](/reference/devtools-extend/#プラグインプロトコル)としてエクスポートされています：

```typescript
const enableDrawCountersCommand: PluginCommand; // 'enable-draw-counters'
const resetDrawCountersCommand: PluginCommand; // 'reset-draw-counters'
const enablePhaseTimingCommand: PluginCommand; // 'enable-phase-timing'
```

それらはバックエンドが数えられないときにスローするのではなく状態**文字列**を返します — SVGおよびWebGLのみのパスは`'this backend cannot count draws'`と報告します。どちらにも無効化コマンドは意図的にありません。だからdevtoolsセッションは、レンダラーの存続期間中カウンティングとフェーズタイミングをオンにしたままにし、それが以降のすべてのフレームのコストを変えることを覚えておいてください。

---

## WASMアクセラレータ状態

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

VectoJSのWASMカーネルは目に見えないバックエンドです — JSが恒久的なフォールバックなので、黙って実行を停止したカーネルは何も壊さずにパフォーマンスを犠牲にします。これを知る方法はこれです。`reason`は5つの状態を区別します：

| `reason`         | 意味                                                               | 問題か？ |
| ---------------- | ------------------------------------------------------------------ | -------- |
| `active`         | `path`に示されたパス上で実行中。                                   | いいえ   |
| `not-installed`  | WASMバックエンドが読み込まれていない。                             | いいえ   |
| `below-gate`     | このフレームでは呼び出す価値があるほど作業が少ない。               | いいえ   |
| `not-applicable` | この種の作業がない。                                               | いいえ   |
| `rejected`       | インストールされゲートを通過した後、カーネルが**引数を拒否した**。 | **はい** |

`faulted`はまさに`reason === 'rejected'`であり、`auditAccelerators`はそれだけを報告します。これは意図的です：閉じたままのゲートはシステムが意図どおり動いていることであり、それを報告すると監査を無視するように訓練されてしまいます。健全なシーンも完全にJSなシーンも、どちらもきれいに監査されます。

`rejected`は、カーネルがインストールされゲートを通過したのに何も書き込まず、フレームがJSにフォールバックしたことを意味します — チューニングの結果ではなく、上流のサイズや容量のバグです。

> [!NOTE]
> `accelerators.particle`と`Scene.particleBackend`を混同しないでください。3つの状態ゲッター`transformBackend`、`animBackend`、`hitTestBackend`は読み取り専用で、`'js' | 'wasm'`を報告します。`Scene.particleBackend`は**書き込み可能なリクエスト**（`'auto' | 'webgpu' | 'cpu'`）で、ランタイムが試みるものを変更します — これは状態ではなく、このインスペクションが読むものではありません。`inspectAccelerators`は`scene.accelerators`レポートのみを読み取ります。

---

## ダーティ再描画の帰属

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

毎フレーム再描画する`onDemand`シーンは、`onDemand`であることの利点をすべて失っています。これが再描画を帰属させます：

```typescript
scene.setDirtyTracking(true);
// … run the scene …
const diag = diagnoseDirty(scene);
diag.summary; // one-line verdict
diag.everyFrame; // causes firing on ~every frame — the ones that matter
```

`everyFrame`は`perFrame`が0.9以上の原因を保持します。それらがシーンを起こしたままにするものです。

> [!IMPORTANT]
> データを期待するときこれが空に読める理由が2つあり、どちらも正常です。
>
> 第一に、`scene.setDirtyTracking(true)`は測定したいフレームの**前に**呼ばれなければなりません — `summary`はトラッキングがオフのときにそれを明示的に言います。
>
> 第二に、帰属は実際にソースを渡す`markDirty(source)`呼び出しにのみ存在し、coreとui全体のほとんどの呼び出しサイトは渡しません。つまり「トラッキングはオン、記録はなし」はエッジケースではなく一般的なケースであり、シーンがアイドルであることを意味しません。データが詰まった結果を強いシグナルとして扱い、空の結果を情報なしとして扱ってください。

結果の形の3つの詳細：

> [!NOTE]
> `reason`は自由形式の文字列であり、固定のユニオンではありません — 現在使われている文字列には`driver-tick`、`child-added`、`child-removed`、`animation-start`、`a11y-reorder`が含まれますが、どの呼び出し元も独自のものを生成できます。また`causes`は`limit`に切り詰められますが、`everyFrame`は切り詰められていないリストから計算されるため、`everyFrame`は`causes`にない原因を保持できます。`renderMode: 'always'`では、常時レンダリングシーンは関係なく再描画するため、`summary`はその問いを無意味と報告します。

---

## Markdownストリーミングメトリクス

```typescript
function inspectMarkdownStream(entity: Entity): MarkdownStreamInfo | null;
function formatMarkdownStream(info: MarkdownStreamInfo): PluginRow[];
function auditMarkdownStreaming(scene: Scene): PluginFinding[];
function isMarkdownEntity(entity: Entity): boolean;
```

ストリーミングMarkdownは、各追加チャンクが前回のパースを再利用する場合にのみ高速です。これらのカウンターがそれが実際に行われるかどうかを示します：

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
> 3つのフィールドは**0.11.0で改名され、古い名前はエイリアスとして保持されませんでした**。古いリファレンスに対して書かれたコードは`undefined`を読み取り、それは黙ってゼロのように見えます：
>
> | 削除された名前  | 現在の名前              |
> | --------------- | ----------------------- |
> | `tokensReused`  | `tokensPrefixMatched`   |
> | `tokensRelexed` | `tokensReturned`        |
> | `reuseRatio`    | `tokenPrefixReuseRatio` |
>
> 古い名前は間違ったものを命名していました — トークン全体がリサイクルされていることを示唆していましたが、実際に測定されているのはトークンのプレフィックスがどれだけ一致したかです。`lexerMs`と`sourceCharsLexed`は0.11.0で新規です。

`auditMarkdownStreaming`は5つの種別を発行します：

- `tail-not-a-delta` — 変更された末尾がソースの半分を超えているため、追加がデルタの代わりにドキュメントの大部分を再レクシングしています。
- `low-token-reuse` — プレフィックス再利用が50%未満。
- `slow-worker-roundtrip` — 8.3msを超えるワーカー応答、つまり240Hzで2フレーム分。
- `no-worker` — メインスレッドでのパース。
- `entities-mostly-rebuilt` — 再利用より再構築されたエンティティが多いため、子リコンサイラーが一致を見つけられていません。

> [!NOTE]
> 監査は`appends > 0`にゲートされています — ストリーミングされたことのないMarkdownエンティティは所見を生み出しません。`low-token-reuse`もゼロを超える比率を要求するため、本物の0%再利用は報告されません。閾値は固定で設定できません。`scene.rootEntity`のみを走査するため、モーダル内のMarkdownエンティティは監査されません。

`isMarkdownEntity`はエンティティのdevtoolsディスクリプタが`kind: 'Markdown'`を報告することに対してダックタイプされます — `@vectojs/markdown`をインポートせず、`instanceof`も使わないため、モデルレイヤーはその依存関係から自由のままです。

---

## これらをパネルタブとして登録する

各サブシステムは対応する[プラグイン](/reference/devtools-extend/#プラグインプロトコル)ディスクリプタを同梱し、パネルがそれをタブとして表示できるようにします。**何も自動登録されません** — GPUを決して検査しないビルドはそのコードを運びません：

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
> `gpuInspector`と`acceleratorInspector`はシーン全体を報告し選択を無視しますが、パネルとブリッジはどちらもインスペクターを呼ぶ前に「選択なし」行に短絡します。それらの行を見るには任意のエンティティを選択してください。監査にはそのような制約はありません。

---

[Devtools概要](/reference/devtools/) · [インスペクト](/reference/devtools-inspect/) · [監査](/reference/devtools-audit/) · [ブリッジとプラグイン](/reference/devtools-extend/)
